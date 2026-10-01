// Chibi 3 baked characters: a built template written to one compact binary file, and read back.
//
// Building a hero from its distance fields takes seconds (see CHIBI3.md "Build cost"). A game does
// not need to pay that at runtime: `tools/bake-chibi3.mjs` builds the looks it ships under node and
// writes them out; the page or game loads the file and gets the same character in milliseconds.
// The same writer backs the browser's own cache (IndexedDB) for looks built live in the builder.
//
// File layout: "C3B1" | uint32 header length | header JSON (utf-8) | padding to 4 | data blocks.
// Per vertex: position float32 x3, normal int8 x3, colour uint16 x3, surf uint8 x4, extra uint8 x4,
// skin index uint8 x4, skin weight uint8 x4 (≈ 34 bytes). Face morphs are sparse: only the vertices
// a morph moves are stored.

import * as THREE from 'three';

export const BAKE_VERSION = 3;
const MAGIC = 'C3B1';

const QUANT = {
  position: { type: Float32Array, normalized: false, scale: 1 },
  normal: { type: Int8Array, normalized: true, scale: 127 },
  color: { type: Uint16Array, normalized: true, scale: 65535 },
  surf: { type: Uint8Array, normalized: true, scale: 255 },
  extra: { type: Uint8Array, normalized: true, scale: 255 },
  skinIndex: { type: Uint8Array, normalized: false, scale: 1 },
  skinWeight: { type: Uint8Array, normalized: true, scale: 255 },
};

/** Serialise a template (index.js buildTemplate result) to an ArrayBuffer. */
export function bakeTemplate(t, extra = {}) {
  const g = t.geometry, blocks = [], header = {
    version: BAKE_VERSION, lod: t.lod ?? 0, vertices: g.attributes.position.count,
    hold: t.outfit?.hold || null, families: t.outfit?.families || null, body: t.body, ms: t.ms, timings: t.timings, tris: t.tris, attrs: [], morphs: [], ...extra,
  };
  const push = (arr) => { blocks.push(arr); return blocks.length - 1; };
  for (const [name, q] of Object.entries(QUANT)) {
    const a = g.attributes[name]; if (!a) continue;
    const src = a.array, k = a.itemSize, out = new q.type(src.length);
    if (name === 'skinWeight') {
      // bytes that still add up to exactly 255, so a quantised vertex does not drift
      for (let v = 0; v < src.length; v += 4) {
        let sum = 0, big = 0;
        for (let c = 0; c < 4; c++) { out[v + c] = Math.round(src[v + c] * 255); sum += out[v + c]; if (out[v + c] > out[v + big]) big = c; }
        out[v + big] += 255 - sum;
      }
    } else if (q.scale === 1) out.set(src);
    else for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.max(q.type === Int8Array ? -1 : 0, Math.min(1, src[i])) * q.scale);
    header.attrs.push({ name, itemSize: k, normalized: q.normalized, type: q.type.name, block: push(out) });
  }
  const idx = g.index.array, small = header.vertices < 65536;
  header.index = { type: small ? 'Uint16Array' : 'Uint32Array', block: push(small ? Uint16Array.from(idx) : Uint32Array.from(idx)) };
  for (const m of g.morphAttributes.position || []) {
    const ids = [], vals = [];
    for (let v = 0; v < m.count; v++) { const x = m.array[v * 3], y = m.array[v * 3 + 1], z = m.array[v * 3 + 2]; if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 5e-5) { ids.push(v); vals.push(x, y, z); } }   // under 0.05 mm is noise
    header.morphs.push({ name: m.name, ids: push(Uint32Array.from(ids)), vals: push(Float32Array.from(vals)) });
  }
  // lay out
  const enc = new TextEncoder(), hjson = () => enc.encode(JSON.stringify(header));
  header.blocks = [];
  let offset = 0;
  for (const b of blocks) { offset = (offset + 3) & ~3; header.blocks.push({ offset, length: b.length, type: b.constructor.name }); offset += b.byteLength; }
  const hb = hjson(), start = (8 + hb.length + 3) & ~3, total = start + offset;
  const buf = new ArrayBuffer(total), u8 = new Uint8Array(buf), dv = new DataView(buf);
  for (let i = 0; i < 4; i++) u8[i] = MAGIC.charCodeAt(i);
  dv.setUint32(4, hb.length, true); u8.set(hb, 8);
  blocks.forEach((b, i) => u8.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), start + header.blocks[i].offset));
  return buf;
}

const TYPES = { Float32Array, Int8Array, Uint8Array, Uint16Array, Uint32Array };

/** Read a baked file back into { geometry, header }. */
export function readBaked(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  if (String.fromCharCode(...u8.slice(0, 4)) !== MAGIC) throw new Error('Not a Chibi 3 bake');
  const hl = dv.getUint32(4, true), header = JSON.parse(new TextDecoder().decode(u8.slice(8, 8 + hl)));
  if (header.version !== BAKE_VERSION) throw new Error('Old Chibi 3 bake (version ' + header.version + ')');
  const start = (8 + hl + 3) & ~3;
  const block = i => { const b = header.blocks[i], T = TYPES[b.type]; return new T(buf, start + b.offset, b.length); };
  const geometry = new THREE.BufferGeometry();
  for (const a of header.attrs) geometry.setAttribute(a.name, new THREE.BufferAttribute(block(a.block), a.itemSize, a.normalized));
  geometry.setIndex(new THREE.BufferAttribute(block(header.index.block), 1));
  if (header.morphs.length) {
    const n = header.vertices;
    geometry.morphAttributes.position = header.morphs.map(m => {
      const out = new Float32Array(n * 3), ids = block(m.ids), vals = block(m.vals);
      for (let i = 0; i < ids.length; i++) { out[ids[i] * 3] = vals[i * 3]; out[ids[i] * 3 + 1] = vals[i * 3 + 1]; out[ids[i] * 3 + 2] = vals[i * 3 + 2]; }
      const attr = new THREE.BufferAttribute(out, 3); attr.name = m.name; return attr;
    });
    geometry.morphTargetsRelative = true;
  }
  geometry.computeBoundingSphere();
  return { geometry, header };
}

// ------------------------------------------------------------------ browser cache (IndexedDB)

const DB = 'chibi3-cache', STORE = 'templates';
function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
/** Look a baked template up by key; null when missing or when storage is unavailable. */
export async function cacheGet(key) {
  try { const db = await open(); return await new Promise(res => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
  catch { return null; }
}
export async function cachePut(key, buf) {
  try { const db = await open(); await new Promise(res => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(buf, key); tx.oncomplete = res; tx.onerror = res; }); }
  catch { /* storage may be blocked (private window); building again is the fallback */ }
}
/** A short stable hash for cache keys. */
export function hashKey(s) { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); } return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36); }
