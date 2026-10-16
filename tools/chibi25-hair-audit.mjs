// Chibi 2.5 hair audit (hair pass 2, 2026-10-16): for every hair style, measured on the real build's pieces
// (createChibi2Character's `trace` hook, bind space, metres):
//   * FLOATING — every hair piece must touch the scalp or a hair piece that does (a chain back to the skull). The gap
//     from a piece to its nearest neighbour is measured from points sampled every ~4 mm over its triangles to the
//     nearest triangle of the neighbour (a grid of 1 cm cells). Over 5 mm with no other contact = floating.
//   * Z-FIGHTING — share of a piece's sampled points that lie within 0.2 mm of another surface facing the same way (within 3 degrees) —
//     coincident surfaces; two pieces crossing at a shallow angle are an ordinary intersection, not a flicker.
//   * FRONT — a fingerprint of every piece tagged `hair:front` (rounded positions), so a test can check no two
//     styles share one.
//   * FLIPPED — triangles of one piece that disagree about which side is out (an edge walked twice the same way):
//     part of the piece is inside out, and front-side rendering shows through it.
//   * OPEN EDGES — edges of a hair piece used by one triangle only (after welding equal positions) that are NOT under
//     the skin: an open edge you can look past is a see-through hole (the material is front-side only).
//
//   node --import ./avatar-3d/tests/three-register.mjs tools/chibi25-hair-audit.mjs [--hairs a,b] [--json out.json]
import { writeFileSync } from 'node:fs';
const THREE = await import('three');
const { createChibi2Character } = await import('../avatar-3d/js/chibi2.js');
const { CHIBI25_OPTIONS } = await import('../avatar-3d/js/chibi25-options.js');

export const AUDIT_BASE = {
  body: { skin: '#e7b891', headSize: 0.5, v: 2.5 }, headShape: 'round', eyes: { id: 'round', color: '#3f7f86' }, brows: { id: 'straight' },
  nose: { id: 'small' }, mouth: { id: 'smile' }, ears: { id: 'normal' }, facialHair: { id: 'none' }, extras: { id: 'none' }, accessory: { id: 'none' },
  hat: { id: 'none' }, top: { id: 'tunic', color: '#4a6a8a' }, bottom: { id: 'pants' }, shoes: { id: 'boots' }, held: { id: 'none' }, offhand: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' },
};

const tri = (p, t) => (p.index ? p.index.length : p.positions.length / 3) / 3;
const vtx = (p, t, k, out) => { const i = p.index ? p.index[t * 3 + k] : t * 3 + k; return out.fromArray(p.positions, i * 3); };

/** closest distance from point p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5) */
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _ap = new THREE.Vector3(), _bp = new THREE.Vector3(), _cp = new THREE.Vector3(), _q = new THREE.Vector3();
function distTri(p, a, b, c) {
  _ab.subVectors(b, a); _ac.subVectors(c, a); _ap.subVectors(p, a);
  const d1 = _ab.dot(_ap), d2 = _ac.dot(_ap); if (d1 <= 0 && d2 <= 0) return p.distanceTo(a);
  _bp.subVectors(p, b); const d3 = _ab.dot(_bp), d4 = _ac.dot(_bp); if (d3 >= 0 && d4 <= d3) return p.distanceTo(b);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return p.distanceTo(_q.copy(a).addScaledVector(_ab, v)); }
  _cp.subVectors(p, c); const d5 = _ab.dot(_cp), d6 = _ac.dot(_cp); if (d6 >= 0 && d5 <= d6) return p.distanceTo(c);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return p.distanceTo(_q.copy(a).addScaledVector(_ac, w)); }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return p.distanceTo(_q.subVectors(c, b).multiplyScalar(w).add(b)); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return p.distanceTo(_q.copy(a).addScaledVector(_ab, v).addScaledVector(_ac, w));
}

/** a spatial index of one piece's triangles (cell 1 cm) for "is anything within r of this point" */
function indexPiece(p, pad = 0.006, cell = 0.01) {
  const grid = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), T = [], N = [];
  const n = tri(p), nrm = new THREE.Vector3(), e = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    vtx(p, t, 0, a); vtx(p, t, 1, b); vtx(p, t, 2, c);
    T.push([a.clone(), b.clone(), c.clone()]);
    nrm.subVectors(b, a).cross(e.subVectors(c, a)); N.push(nrm.lengthSq() > 0 ? nrm.clone().normalize() : new THREE.Vector3());
    const lo = [0, 1, 2].map(k => Math.floor((Math.min(a.getComponent(k), b.getComponent(k), c.getComponent(k)) - pad) / cell));
    const hi = [0, 1, 2].map(k => Math.floor((Math.max(a.getComponent(k), b.getComponent(k), c.getComponent(k)) + pad) / cell));
    for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) { const key = i + ',' + j + ',' + k; let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(t); }
  }
  return { grid, T, N, cell, nearest(pt, normal = null) {
    const l = grid.get(Math.floor(pt.x / cell) + ',' + Math.floor(pt.y / cell) + ',' + Math.floor(pt.z / cell)); if (!l) return { d: Infinity, same: false };
    let best = Infinity, same = false;
    for (const t of l) { const d = distTri(pt, ...T[t]); if (d < best) { best = d; same = normal ? N[t].dot(normal) > 0.9986 : false; } }
    return { d: best, same };
  } };
}
/** points sampled over a piece's triangles, ~`step` apart, with the face normal */
function samples(p, step = 0.004) {
  const out = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3();
  for (let t = 0; t < tri(p); t++) {
    vtx(p, t, 0, a); vtx(p, t, 1, b); vtx(p, t, 2, c);
    const n = Math.max(1, Math.min(10, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / step)));
    const nrm = new THREE.Vector3().subVectors(b, a).cross(e.subVectors(c, a)); if (nrm.lengthSq() === 0) continue; nrm.normalize();
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const u = i / n, v = j / n, w = 1 - u - v; out.push([new THREE.Vector3(a.x * w + b.x * u + c.x * v, a.y * w + b.y * u + c.y * v, a.z * w + b.z * u + c.z * v), nrm]); }
  }
  return out;
}

/** open edges of a piece (used by one triangle after welding equal positions) — returns their midpoints */
function openEdges(p) {
  const key = (i) => [0, 1, 2].map(k => Math.round(p.positions[i * 3 + k] * 1e5)).join(',');
  const count = new Map(), mid = new Map();
  for (let t = 0; t < tri(p); t++) {
    const ids = [0, 1, 2].map(k => p.index ? p.index[t * 3 + k] : t * 3 + k), ks = ids.map(key);
    if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) continue;
    for (let e = 0; e < 3; e++) {
      const k1 = ks[e], k2 = ks[(e + 1) % 3], kk = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
      count.set(kk, (count.get(kk) || 0) + 1);
      if (!mid.has(kk)) { const i1 = ids[e], i2 = ids[(e + 1) % 3]; mid.set(kk, new THREE.Vector3((p.positions[i1 * 3] + p.positions[i2 * 3]) / 2, (p.positions[i1 * 3 + 1] + p.positions[i2 * 3 + 1]) / 2, (p.positions[i1 * 3 + 2] + p.positions[i2 * 3 + 2]) / 2)); }
    }
  }
  return [...count].filter(([, n]) => n === 1).map(([k]) => mid.get(k));
}

/** edges walked twice in the SAME direction (after welding): a piece whose triangles disagree about which side is out */
export function flippedEdges(p) {
  const key = (i) => [0, 1, 2].map(k => Math.round(p.positions[i * 3 + k] * 1e5)).join(',');
  const seen = new Map(); let bad = 0;
  for (let t = 0; t < tri(p); t++) {
    const ks = [0, 1, 2].map(k => key(p.index ? p.index[t * 3 + k] : t * 3 + k));
    if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) continue;
    for (let e = 0; e < 3; e++) { const d = ks[e] + '>' + ks[(e + 1) % 3]; if (seen.has(d)) bad++; seen.set(d, 1); }
  }
  return bad;
}

export async function buildTraced(look) {
  const trace = [];
  const actor = await createChibi2Character(look, { trace });
  const stats = actor.stats(); actor.dispose();
  return { trace, stats };
}

/**
 * Audit one hair look. Returns { tris, hairTris, pieces, floating, zfight, open, front } — `floating` lists pieces with no
 * chain of contact (≤ `gap`) back to the skull, with their gap; `zfight` pieces with > 3% of points coplanar with another;
 * `open` pieces with an open edge more than 4 mm outside the skin.
 */
export async function hairAudit(look, { gap = 0.005 } = {}) {
  const { trace, stats } = await buildTraced(look);
  const hairs = trace.filter(p => p.tag === 'hair' || p.tag.startsWith('hair:'));
  const skull = trace.filter(p => p.tag === 'face:head');
  const skullIdx = skull.map(p => indexPiece(p));
  const idx = hairs.map(p => indexPiece(p));
  const smp = hairs.map(p => samples(p));
  // inside the skull: the head shell is closed (a profile of rings), so a point is inside when a ray up hits it an odd number of times;
  // cheaper here: nearest skull distance + the skull's own bounding rings (head space is centred on the head bone)
  const sk = skull[0]; let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < sk.positions.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], sk.positions[i + k]); mx[k] = Math.max(mx[k], sk.positions[i + k]); }
  const H = (mx[1] - mn[1]) / 0.635, centre = new THREE.Vector3((mn[0] + mx[0]) / 2, mn[1] + 0.315 * H, (mn[2] + mx[2]) / 2);
  const ray = new THREE.Raycaster(), skullMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  skullMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(sk.positions, 3)); if (sk.index) skullMesh.geometry.setIndex(Array.from(sk.index));
  skullMesh.updateMatrixWorld(true);
  const insideSkull = (pt) => { ray.set(pt, new THREE.Vector3(0.31, 1, 0.17).normalize()); return ray.intersectObject(skullMesh).length % 2 === 1; };

  const n = hairs.length, near = Array.from({ length: n }, () => new Float64Array(n + 1).fill(Infinity));
  const zf = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let zc = 0;
    for (const [pt, nr] of smp[i]) {
      let s = Infinity, same = false;
      for (const q of skullIdx) { const r = q.nearest(pt, nr); if (r.d < s) { s = r.d; same = r.same; } }
      if (s < near[i][n]) near[i][n] = s;
      if (s < 0.0002 && s > 1e-5 && same) zc++;
      else if (insideSkull(pt)) near[i][n] = 0;
      for (let j = 0; j < n; j++) if (j !== i) {
        const r = idx[j].nearest(pt, nr); if (r.d < near[i][j]) near[i][j] = r.d;
        if (r.d < 0.0002 && r.d > 1e-5 && r.same) zc++;
      }
    }
    zf[i] = smp[i].length ? zc / smp[i].length : 0;
  }
  // chain of contact back to the skull
  const attached = new Array(n).fill(false), queue = [];
  for (let i = 0; i < n; i++) if (near[i][n] <= gap) { attached[i] = true; queue.push(i); }
  while (queue.length) { const i = queue.shift(); for (let j = 0; j < n; j++) if (!attached[j] && Math.min(near[j][i], near[i][j]) <= gap) { attached[j] = true; queue.push(j); } }
  const pieces = hairs.map((p, i) => ({ i, tag: p.tag, tris: tri(p), gapSkull: near[i][n], gap: Math.min(near[i][n], ...Array.from({ length: n }, (_, j) => j === i ? Infinity : Math.min(near[i][j], near[j][i]))), attached: attached[i], zfight: zf[i] }));
  // open edges: an open edge is fine under the skin (tucked) or flush on another piece; flag it if it is out in the air
  const open = [];
  for (let i = 0; i < n; i++) {
    let bad = 0, worst = 0;
    for (const m of openEdges(hairs[i])) {
      if (insideSkull(m)) continue;
      let d = Infinity; for (const q of skullIdx) d = Math.min(d, q.nearest(m).d);
      for (let j = 0; j < n; j++) if (j !== i) d = Math.min(d, idx[j].nearest(m).d);
      if (d > 0.004) { bad++; worst = Math.max(worst, Number.isFinite(d) ? d : 0.05); }
    }
    if (bad) open.push({ i, tag: hairs[i].tag, edges: bad, worst });
  }
  const flipped = hairs.map((p, i) => ({ i, tag: p.tag, edges: flippedEdges(p) })).filter(f => f.edges);
  const front = hairs.filter(p => p.tag === 'hair:front').map(p => { let h = 2166136261 >>> 0; for (const v of p.positions) { h ^= Math.round(v * 1e4) & 0xffffffff; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16) + ':' + p.positions.length; });
  return {
    tris: stats.triangles, hairTris: hairs.reduce((s, p) => s + tri(p), 0), pieces,
    flipped, floating: pieces.filter(p => !p.attached), zfight: pieces.filter(p => p.zfight > 0.03), open, front, H, centre,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const hairs = arg('--hairs')?.split(',') || CHIBI25_OPTIONS.face.hair.ids.filter(h => h !== 'bald');
  const out = {}, owners = new Map();
  for (const id of hairs) {
    const r = await hairAudit({ ...AUDIT_BASE, hair: { id, color: '#6b4a2a' } });
    out[id] = { tris: r.tris, hairTris: r.hairTris, floating: r.floating.map(p => `${p.tag}#${p.i} ${(p.gap * 1000).toFixed(1)}mm`), zfight: r.zfight.map(p => `${p.tag}#${p.i} ${(p.zfight * 100).toFixed(0)}%`), open: r.open.map(o => `${o.tag}#${o.i} x${o.edges} ${(o.worst * 1000).toFixed(0)}mm`), front: r.front.length, flipped: r.flipped.map(f => `${f.tag}#${f.i} x${f.edges}`) };
    for (const f of r.front) { if (!owners.has(f)) owners.set(f, []); owners.get(f).push(id); }
    console.log(`${id.padEnd(15)} tris ${r.tris} (hair ${r.hairTris}) pieces ${r.pieces.length} front ${r.front.length}` +
      (r.floating.length ? `  FLOAT ${out[id].floating.join(', ')}` : '') + (r.zfight.length ? `  ZFIGHT ${out[id].zfight.join(', ')}` : '') + (r.open.length ? `  OPEN ${out[id].open.join(', ')}` : '') + (r.flipped.length ? `  FLIPPED ${out[id].flipped.join(', ')}` : ''));
  }
  const shared = [...owners].filter(([, l]) => l.length > 1);
  console.log(shared.length ? 'SHARED FRONT PIECES: ' + shared.map(([k, l]) => l.join('+')).join('; ') : 'no front piece is shared between styles');
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
}
