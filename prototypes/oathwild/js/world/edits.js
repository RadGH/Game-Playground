// Oathwild — the hand-edit layer (map editor, 2026-11-26). Pure: the server, the browser, the editor page and the
// tests all apply it with these same functions, so what is drawn is what is walked (lessons rule 22).
//
// WHAT IS STORED WHERE
//   data/edits.json  edits on top of GENERATED things (scattered trees and decor, the ground) plus things placed by
//                    tools/place-world.mjs (moved, never rewritten), effect zones, region looks and note pins:
//   {
//     version: 1, nextId,
//     trees:  { remove: [treeId…], add: [{ id, art, at:[x,z], scale, rot }…], areas: [{ id, at, r, density, mode, kinds? }…] },
//     decor:  { remove: [decorId…], add: [{ id, art, at, scale, rot }…] },
//     ground: [{ id, kind: 'raise'|'lower'|'flatten'|'smooth', at, r, amount, y? }…]   strokes, applied in order to the
//             raw ground before rivers, places and roads are cut in (so roads stay graded and bridges meet them)
//     moves:  { '<group>:<ref>': { at:[x,z], facing? } }  group = buildings | props | shrines | chests | objects | camps |
//             roam | npcs; ref = the thing's id, or (props without one) posId of where place-world put it
//     zones:  [{ id, kind, at, r, soft, amount, tint?, tintAmount?, mist?, saturation?, contrast?, exposure?, bloom? }…]
//     looks:  { <region id>: { exposure?, saturation?, contrast?, warm?, bloom?, mist?, fogColour?, sunColour? } }
//     notes:  [{ id, at, text, by, done, made }…]
//   }
//   data/map.json    roads, rivers and crossings are hand data already: the editor changes them THERE
//                    (crossings may carry a, b, deck, width, ramp, kind, art — see terrain.js step 5).
//
// IDS THAT SURVIVE A RE-RUN. A generated tree's id comes from where it stands (treeId: tenths of a metre), so the same
// generator gives the same ids. When the generator changes (the world pipeline re-runs), an edit whose target is gone
// is listed in `report.orphans` — never silently dropped — and stays in the file until someone removes it.
//
//   applyOp({ edits, map }, op, { T }) → { ok, why?, edits, map, touched, at, id? }   one checked change (pure: new copies)
//   sceneryWithEdits(W, scatter)     → { trees, decor, report }   scatter result with the layer applied (+ town trees)
//   applyPlaceEdits(data, T)         moves placed things / NPC spots (+ their heights after ground strokes)
//   applyGroundStrokes(H, grid, strokes)   used by terrain.js
//   lookAt(edits, T, x, z, base)     the colour look at a spot: region looks blended across the border, then zones
//   zoneWeight(zone, x, z)           0..1 (1 inside r − soft, 0 past r)

export const EDITS_VERSION = 1;
export const GROUP_KINDS = Object.freeze(['buildings', 'props', 'shrines', 'chests', 'objects', 'camps', 'roam', 'npcs']);
export const GROUND_KINDS = Object.freeze(['raise', 'lower', 'flatten', 'smooth']);
/** Effect zones: what each kind draws (js/client/render/zones.js) and its defaults. `look` only colours the air. */
export const ZONE_KINDS = Object.freeze({
  fog:       { name: 'Ground fog', r: 50, soft: 20, mist: 0.004, saturation: -0.04 },
  fireflies: { name: 'Fireflies', r: 25, soft: 10 },
  leaves:    { name: 'Falling leaves', r: 30, soft: 10 },
  dust:      { name: 'Dust motes', r: 20, soft: 8 },
  shafts:    { name: 'Light shafts', r: 25, soft: 10, exposure: 0.04 },
  marsh:     { name: 'Marsh glow', r: 40, soft: 15, tint: '#9fd28a', tintAmount: 0.06 },
  embers:    { name: 'Embers', r: 10, soft: 5 },
  look:      { name: 'Colour only', r: 40, soft: 20 },
});
/** Region look fields and their limits (absolute values; a missing one = the game's own number). */
export const LOOK_FIELDS = Object.freeze({
  exposure: [0.6, 1.5], saturation: [0.6, 1.6], contrast: [0.8, 1.4], warm: [-0.1, 0.15], bloom: [0, 0.6], mist: [0, 0.006],
  fogColour: 'colour', sunColour: 'colour',
});
const ZONE_NUM = { r: [2, 400], soft: [0, 200], amount: [0, 3], tintAmount: [0, 0.5], mist: [0, 0.01], saturation: [-0.4, 0.4], contrast: [-0.3, 0.3], exposure: [-0.3, 0.3], bloom: [-0.2, 0.4] };

const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isAt = a => Array.isArray(a) && a.length === 2 && isNum(a[0]) && isNum(a[1]);
const isHex = s => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
const clone = o => JSON.parse(JSON.stringify(o));
const smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** A position id in tenths of a metre: (−180.43, 12.07) → "-1804_121". */
export const posId = (x, z) => `${Math.round(x * 10)}_${Math.round(z * 10)}`;
export const treeId = t => 't' + posId(t.x, t.z);
export const decorId = d => 'd' + posId(d.x, d.z);

export function emptyEdits() {
  return { version: EDITS_VERSION, nextId: 1, trees: { remove: [], add: [], areas: [] }, decor: { remove: [], add: [] }, ground: [], moves: {}, zones: [], looks: {}, notes: [] };
}
/** Any edits object (old, partial, null) → the full shape. */
export function normEdits(e) {
  const b = emptyEdits(), x = e && typeof e === 'object' ? e : {};
  return {
    ...b, ...x,
    trees: { ...b.trees, ...(x.trees || {}) }, decor: { ...b.decor, ...(x.decor || {}) },
    ground: Array.isArray(x.ground) ? x.ground : [], moves: x.moves && typeof x.moves === 'object' ? x.moves : {},
    zones: Array.isArray(x.zones) ? x.zones : [], looks: x.looks && typeof x.looks === 'object' ? x.looks : {}, notes: Array.isArray(x.notes) ? x.notes : [],
    nextId: isNum(x.nextId) ? x.nextId : 1,
  };
}

// ---------------------------------------------------------------- ground strokes (called by terrain.js)

/** Each stroke changes the heights inside its circle with a soft cosine edge. H = Float32Array on `grid`. */
export function applyGroundStrokes(H, grid, strokes = []) {
  const { nx, nz, cell, minX, minZ } = grid;
  for (const s of strokes) {
    if (!s || !isAt(s.at) || !(s.r > 0)) continue;
    const [cx, cz] = s.at, r = s.r, amt = isNum(s.amount) ? s.amount : 1;
    const i0 = Math.max(0, Math.floor((cx - r - minX) / cell)), i1 = Math.min(nx - 1, Math.ceil((cx + r - minX) / cell));
    const k0 = Math.max(0, Math.floor((cz - r - minZ) / cell)), k1 = Math.min(nz - 1, Math.ceil((cz + r - minZ) / cell));
    const src = s.kind === 'smooth' ? Float32Array.from(H) : null;
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(minX + i * cell - cx, minZ + k * cell - cz);
      if (d >= r) continue;
      const w = 0.5 + 0.5 * Math.cos(Math.PI * d / r), j = k * nx + i;
      if (s.kind === 'raise') H[j] += amt * w;
      else if (s.kind === 'lower') H[j] -= amt * w;
      else if (s.kind === 'flatten' && isNum(s.y)) H[j] += (s.y - H[j]) * w * clamp(amt, 0, 1);
      else if (s.kind === 'smooth') {
        let sum = 0, n = 0;
        for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) {
          const ii = i + di, kk = k + dk;
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          sum += src[kk * nx + ii]; n++;
        }
        H[j] += (sum / n - H[j]) * w * clamp(amt, 0, 1);
      }
    }
  }
  return H;
}

// ---------------------------------------------------------------- placed things

function thingList(data, group) { return group === 'npcs' ? null : data.placements?.[group]; }
/** The ref a thing is known by in `moves` (its id, or where place-world put it). */
export const thingRef = (group, p) => `${group}:${p.id || posId(p.at[0], p.at[1])}`;
function findThing(data, ref) {
  const [group, id] = String(ref).split(':');
  if (group === 'npcs') { const n = data.npcs?.npcs?.[id]; return n ? { group, item: n } : null; }
  const list = thingList(data, group);
  const item = list?.find(p => thingRef(group, p) === ref);
  return item ? { group, item } : null;
}
/** Moves placed things and NPC spots (mutates data); fixes stored heights under ground strokes. → orphans */
export function applyPlaceEdits(data, T) {
  const E = normEdits(data.edits), orphans = [];
  for (const [ref, mv] of Object.entries(E.moves)) {
    const f = findThing(data, ref);
    if (!f) { orphans.push({ kind: 'move', ref, why: 'nothing with that name any more' }); continue; }
    if (isAt(mv.at)) f.item.at = [r2(mv.at[0]), r2(mv.at[1])];
    if (isNum(mv.facing)) f.item.facing = r2(mv.facing);
    if ('y' in f.item && T) f.item.y = r2(T.heightAt(f.item.at[0], f.item.at[1]));
  }
  if (E.ground.length && T) {
    const inStroke = at => E.ground.some(s => isAt(s.at) && Math.hypot(at[0] - s.at[0], at[1] - s.at[1]) < s.r + 1);
    for (const g of GROUP_KINDS) for (const p of thingList(data, g) || []) if ('y' in p && isAt(p.at) && inStroke(p.at)) p.y = r2(T.heightAt(p.at[0], p.at[1]));
  }
  return orphans;
}

// ---------------------------------------------------------------- trees and decor

const TREE_GRID = 9;
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngOf(seed) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 1000000) / 1000000; }; }

/** The tree record scatter() makes, for an art id at a spot. */
export function treeRecord(T, species, { art, at, scale = 1, rot = 0, id = null }) {
  const sp = species[art] || species['oak-a'];
  const x = r2(at[0]), z = r2(at[1]);
  return { art: species[art] ? art : 'oak-a', x, z, y: r2(T.heightAt(x, z)), rot: r2(rot), scale: r2(scale), r: r2(sp.trunk * scale), h: r2(sp.h * scale), crown: r2(sp.crown * scale), ...(id ? { id } : {}) };
}
/** Trees an area brush grows (same area = same trees): a jittered grid, clear of roads, water, steep ground and keep-outs. */
export function areaTrees(T, species, area, blocked = () => false) {
  const out = [], rng = rngOf(hash(area.id || posId(...area.at)));
  const kinds = Array.isArray(area.kinds) && area.kinds.length ? area.kinds.filter(k => species[k]) : null;
  const regionKinds = T.regionAt(area.at[0], area.at[1]) === 'thornmere_wilds' ? ['pine-a', 'pine-b', 'oak-b'] : ['oak-a', 'oak-b', 'birch'];
  const list = kinds?.length ? kinds : regionKinds;
  const [cx, cz] = area.at, r = area.r;
  for (let gx = Math.floor((cx - r) / TREE_GRID) * TREE_GRID; gx <= cx + r; gx += TREE_GRID) for (let gz = Math.floor((cz - r) / TREE_GRID) * TREE_GRID; gz <= cz + r; gz += TREE_GRID) {
    const x = gx + (rng() - 0.5) * TREE_GRID * 0.9, z = gz + (rng() - 0.5) * TREE_GRID * 0.9;
    const keep = rng() < clamp(area.density, 0, 1), art = list[Math.floor(rng() * list.length) % list.length], scale = 0.85 + rng() * 0.3, rot = rng() * 6.283;
    if (!keep || Math.hypot(x - cx, z - cz) > r || !T.inPlay(x, z) || T.slopeAt(x, z) > 28) continue;
    const w = T.waterAt(x, z); if (w && w.depth > -0.2) continue;
    const sp = species[art], rd = T.roadAt(x, z, 12);
    if (rd && rd.d < rd.half + sp.trunk * scale + 2) continue;
    if (T.deckAt?.(x, z) || blocked(x, z, Math.max(1, sp.crown * scale * 0.55))) continue;
    out.push(treeRecord(T, species, { art, at: [x, z], scale, rot }));
  }
  return out;
}
const near = (list, id, idOf, tol) => {
  const exact = list.findIndex(t => (t.id || idOf(t)) === id);
  if (exact >= 0 || !/^[td]-?\d+_-?\d+$/.test(id)) return exact;
  const [a, b] = id.slice(1).split('_').map(Number), x = a / 10, z = b / 10;
  return list.findIndex(t => Math.hypot(t.x - x, t.z - z) < tol);
};

/**
 * The scattered trees and decor with the edit layer applied, plus the towns' trees (removed ones taken out of
 * W.town.trees too, so the server's colliders and the drawing agree). `scatterFn` = scatter() from scatter.js and
 * `species` = its TREE_SPECIES (passed in to keep this file free of imports). → { trees, decor, report }
 */
export function sceneryWithEdits(W, { scatter, keepOuts, species, decorInfo = () => ({ r: 0.6, solid: true }) }) {
  const T = W.terrain, P = W.data.placements, E = normEdits(W.data.edits);
  const base = scatter(T, P);
  let trees = base.trees, decor = base.decor;
  const report = { orphans: [...(W.editOrphans || [])], removed: 0, added: 0 };
  // keep-outs for area brushes (buildings, camps, shrines… as scatter() uses)
  const kos = keepOuts(T, P);
  const blocked = (x, z, r) => kos.some(([cx, cz, cr]) => Math.abs(x - cx) < cr + r && Math.hypot(x - cx, z - cz) < cr + r);
  // 1) area brushes in order: 'set' replaces what grew inside, 'add' grows more among it
  for (const a of E.trees.areas) {
    if (!isAt(a.at) || !(a.r > 0)) continue;
    const grown = areaTrees(T, species, a, blocked);
    if (a.mode !== 'add') trees = trees.filter(t => Math.hypot(t.x - a.at[0], t.z - a.at[1]) > a.r);
    else for (let i = grown.length - 1; i >= 0; i--) if (trees.some(t => Math.hypot(t.x - grown[i].x, t.z - grown[i].z) < (t.crown + grown[i].crown) * 0.45)) grown.splice(i, 1);
    trees = trees.concat(grown);
  }
  // 2) single removals (generated, area-grown or a town's own tree)
  const town = W.town?.trees || [];
  for (const id of E.trees.remove) {
    let i = near(trees, id, treeId, 0.6);
    if (i >= 0) { trees.splice(i, 1); report.removed++; continue; }
    i = near(town, id, treeId, 0.6);
    if (i >= 0) { town.splice(i, 1); report.removed++; continue; }
    if (!E.trees.add.some(t => t.id === id)) report.orphans.push({ kind: 'tree', id, why: 'no tree stands there any more' });
  }
  // 3) added trees
  for (const t of E.trees.add) if (isAt(t.at) && species[t.art]) { trees.push(treeRecord(T, species, t)); report.added++; }
  for (const id of E.decor.remove) {
    const i = near(decor, id, decorId, 0.6);
    if (i >= 0) { decor.splice(i, 1); report.removed++; } else report.orphans.push({ kind: 'decor', id, why: 'nothing lies there any more' });
  }
  for (const d of E.decor.add) if (isAt(d.at) && typeof d.art === 'string') {
    const info = decorInfo(d.art);
    decor.push({ art: d.art, x: r2(d.at[0]), z: r2(d.at[1]), y: r2(T.heightAt(d.at[0], d.at[1])), rot: r2(d.rot || 0), scale: r2(d.scale || 1), r: info.r, solid: info.solid, id: d.id });
    report.added++;
  }
  for (const t of trees) if (!t.id) t.id = treeId(t);
  for (const t of town) if (!t.id) t.id = treeId(t);
  for (const d of decor) if (!d.id) d.id = decorId(d);
  return { trees, decor, report };
}

// ---------------------------------------------------------------- the look at a spot

export function zoneWeight(zn, x, z) {
  const d = Math.hypot(x - zn.at[0], z - zn.at[1]), soft = clamp(zn.soft ?? 0, 0, zn.r);
  if (d >= zn.r) return 0;
  if (d <= zn.r - soft) return 1;
  return 1 - smooth01((d - (zn.r - soft)) / Math.max(1e-6, soft));
}
const hexRgb = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
/**
 * `base` = the game's own numbers { exposure, saturation, contrast, warm, bloom, mist, fogColour:[r,g,b], sunColour:[r,g,b] }
 * → the same shape for (x, z) plus tint:[r,g,b] (multiplied into the grade, [1,1,1] = none) and `zones` (ids in reach).
 */
export function lookAt(edits, T, x, z, base) {
  const E = normEdits(edits), L = E.looks;
  const west = T.map.border.west, east = T.map.border.east;
  const t = smooth01((x - T.borderX(z) + T.map.border.blend) / (2 * T.map.border.blend));
  const out = { ...base, fogColour: [...base.fogColour], sunColour: [...base.sunColour], tint: [1, 1, 1], zones: [] };
  const val = (reg, k) => { const v = L[reg]?.[k]; return v == null ? null : LOOK_FIELDS[k] === 'colour' ? (isHex(v) ? hexRgb(v) : null) : (isNum(v) ? v : null); };
  for (const k of Object.keys(LOOK_FIELDS)) {
    const a = val(west, k) ?? base[k], b = val(east, k) ?? base[k];
    out[k] = Array.isArray(a) ? mix3(a, b, t) : mix(a, b, t);
  }
  for (const zn of E.zones) {
    if (!isAt(zn.at)) continue;
    const w = zoneWeight(zn, x, z);
    if (w <= 0) continue;
    out.zones.push(zn.id);
    const D = ZONE_KINDS[zn.kind] || {}, g = k => (zn[k] ?? D[k] ?? 0) * w;
    out.exposure += g('exposure'); out.saturation += g('saturation'); out.contrast += g('contrast'); out.bloom += g('bloom'); out.mist += g('mist');
    const tint = zn.tint ?? D.tint, ta = (zn.tintAmount ?? D.tintAmount ?? 0.08) * w;
    if (isHex(tint) && ta > 0) { const c = hexRgb(tint); out.tint = out.tint.map((v, i) => v * mix(1, 0.5 + c[i], ta)); }
  }
  out.bloom = Math.max(0, out.bloom); out.mist = Math.max(0, out.mist);
  return out;
}

// ---------------------------------------------------------------- one change at a time

const nid = (E, p) => `${p}${E.nextId++}`;
const lineOf = (map, line, id) => (line === 'roads' || line === 'rivers') ? map[line].find(r => r.id === id) : null;
function inBounds(map, at) { const B = map.bounds; return at[0] >= B.minX && at[0] <= B.maxX && at[1] >= B.minZ && at[1] <= B.maxZ; }

/**
 * Check and apply one edit. `state` = { edits, map } (not changed: new copies come back). `T` (optional) gives heights
 * for flatten strokes without a y and lets checks see the world. → { ok, why, edits, map, touched, at, id }
 *   touched: 'trees' | 'decor' | 'ground' | 'things' | 'map' | 'zones' | 'looks' | 'notes' — what must be rebuilt.
 */
export function applyOp(state, op, { T = null, species = null, by = 'editor', now = () => new Date().toISOString() } = {}) {
  const E = normEdits(clone(state.edits)), map = state.map;
  const no = why => ({ ok: false, why });
  const done = (touched, at, extra = {}) => ({ ok: true, edits: E, map: extra.map || map, touched, at: at ? [r2(at[0]), r2(at[1])] : null, ...extra });
  if (!op || typeof op.op !== 'string') return no('No edit given.');
  const at = op.at;
  if (at != null && (!isAt(at) || !inBounds(map, at))) return no('That spot is outside the map.');
  switch (op.op) {
    case 'tree.add': {
      if (!at) return no('Where?');
      if (species && !species[op.art]) return no(`No tree kind "${op.art}".`);
      const id = nid(E, 'a');
      E.trees.add.push({ id, art: String(op.art), at: [r2(at[0]), r2(at[1])], scale: r2(clamp(isNum(op.scale) ? op.scale : 1, 0.4, 2.5)), rot: r2(isNum(op.rot) ? op.rot : (hash(id) % 628) / 100) });
      return done('trees', at, { id });
    }
    case 'tree.remove': {
      const id = String(op.id || '');
      if (!id) return no('Which tree?');
      const i = E.trees.add.findIndex(t => t.id === id);
      if (i >= 0) { const [t] = E.trees.add.splice(i, 1); return done('trees', t.at, { id }); }
      if (!/^t-?\d+_-?\d+$/.test(id)) return no(`No tree "${id}".`);
      if (!E.trees.remove.includes(id)) E.trees.remove.push(id);
      const [a, b] = id.slice(1).split('_').map(Number);
      return done('trees', [a / 10, b / 10], { id });
    }
    case 'tree.move': {
      if (!at) return no('Where to?');
      const id = String(op.id || ''), added = E.trees.add.find(t => t.id === id);
      if (added) { added.at = [r2(at[0]), r2(at[1])]; return done('trees', at, { id }); }
      if (!/^t-?\d+_-?\d+$/.test(id) || !op.art) return no('Moving a grown tree needs its id and kind.');
      if (!E.trees.remove.includes(id)) E.trees.remove.push(id);
      const nidv = nid(E, 'a');
      E.trees.add.push({ id: nidv, art: String(op.art), at: [r2(at[0]), r2(at[1])], scale: r2(isNum(op.scale) ? op.scale : 1), rot: r2(isNum(op.rot) ? op.rot : 0) });
      return done('trees', at, { id: nidv });
    }
    case 'tree.area': {
      if (!at || !isNum(op.r)) return no('An area needs a middle and a size.');
      const id = nid(E, 'ar');
      E.trees.areas.push({ id, at: [r2(at[0]), r2(at[1])], r: r2(clamp(op.r, 2, 120)), density: r2(clamp(isNum(op.density) ? op.density : 0, 0, 1)), mode: op.mode === 'add' ? 'add' : 'set', ...(Array.isArray(op.kinds) && op.kinds.length ? { kinds: op.kinds.map(String).slice(0, 8) } : {}) });
      return done('trees', at, { id });
    }
    case 'decor.add': {
      if (!at || typeof op.art !== 'string') return no('Which piece, and where?');
      const id = nid(E, 'da');
      E.decor.add.push({ id, art: op.art, at: [r2(at[0]), r2(at[1])], scale: r2(clamp(isNum(op.scale) ? op.scale : 1, 0.3, 4)), rot: r2(isNum(op.rot) ? op.rot : 0) });
      return done('decor', at, { id });
    }
    case 'decor.remove': {
      const id = String(op.id || '');
      const i = E.decor.add.findIndex(d => d.id === id);
      if (i >= 0) { const [d] = E.decor.add.splice(i, 1); return done('decor', d.at, { id }); }
      if (!/^d-?\d+_-?\d+$/.test(id)) return no(`No piece "${id}".`);
      if (!E.decor.remove.includes(id)) E.decor.remove.push(id);
      const [a, b] = id.slice(1).split('_').map(Number);
      return done('decor', [a / 10, b / 10], { id });
    }
    case 'ground': {
      if (!at || !GROUND_KINDS.includes(op.kind) || !isNum(op.r)) return no('A ground stroke needs a kind (raise, lower, flatten, smooth), a spot and a size.');
      const s = { id: nid(E, 'g'), kind: op.kind, at: [r2(at[0]), r2(at[1])], r: r2(clamp(op.r, 1, 80)), amount: r2(clamp(isNum(op.amount) ? op.amount : op.kind === 'flatten' || op.kind === 'smooth' ? 0.6 : 0.5, 0, 10)) };
      if (op.kind === 'flatten') { const y = isNum(op.y) ? op.y : T ? T.heightAt(at[0], at[1]) : null; if (!isNum(y)) return no('Flatten to what height?'); s.y = r2(y); }
      E.ground.push(s);
      return done('ground', at, { id: s.id });
    }
    case 'thing.move': {
      const ref = String(op.ref || ''), [group] = ref.split(':');
      if (!GROUP_KINDS.includes(group) || !at) return no('Move what, and where to?');
      E.moves[ref] = { at: [r2(at[0]), r2(at[1])], ...(isNum(op.facing) ? { facing: r2(op.facing) } : {}) };
      return done('things', at, { id: ref });
    }
    case 'thing.reset': { const ref = String(op.ref || ''); if (!E.moves[ref]) return no('That thing was not moved.'); delete E.moves[ref]; return done('things', null, { id: ref }); }
    case 'bridge.set': {
      const m = clone(map), c = (m.crossings || []).find(x => x.id === op.id);
      if (!c) return no(`No crossing "${op.id}".`);
      for (const k of ['a', 'b']) if (op[k] !== undefined) { if (op[k] === null) delete c[k]; else if (isAt(op[k]) && inBounds(m, op[k])) c[k] = [r2(op[k][0]), r2(op[k][1])]; else return no(`End ${k} is not a spot on the map.`); }
      if ((c.a && !c.b) || (c.b && !c.a)) return no('Give both ends (a and b), or neither.');
      if (c.a && Math.hypot(c.a[0] - c.b[0], c.a[1] - c.b[1]) < 4) return no('The two ends are too close (under 4 m).');
      const nums = { deck: [-50, 200], width: [2, 14], ramp: [0, 12] };
      for (const [k, [lo, hi]] of Object.entries(nums)) if (op[k] !== undefined) { if (op[k] === null) delete c[k]; else if (isNum(op[k])) c[k] = r2(clamp(op[k], lo, hi)); else return no(`${k} must be a number.`); }
      if (op.kind !== undefined) { if (!['bridge', 'ford'].includes(op.kind)) return no('Kind is bridge or ford.'); c.kind = op.kind; }
      if (op.art !== undefined) { if (!['bridge-wood', 'bridge-stone'].includes(op.art)) return no('A bridge is bridge-wood or bridge-stone.'); c.art = op.art; }
      const mid = c.a ? [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2] : (T?.bridges.find(b => b.id === c.id)?.at || null);
      return done('map', mid, { id: c.id, map: m });
    }
    case 'line.set': {
      const m = clone(map), L = lineOf(m, op.line, op.id);
      if (!L) return no(`No ${op.line === 'rivers' ? 'river' : 'road'} "${op.id}".`);
      if (!Array.isArray(op.points) || op.points.length < 2 || op.points.length > 80 || !op.points.every(p => isAt(p) && inBounds(m, p))) return no('A line needs 2 to 80 points inside the map.');
      L.points = op.points.map(([x, z]) => [r2(x), r2(z)]);
      return done('map', L.points[Math.floor(L.points.length / 2)], { id: L.id, map: m });
    }
    case 'zone.add': {
      if (!at || !ZONE_KINDS[op.kind]) return no(`Effect kinds: ${Object.keys(ZONE_KINDS).join(', ')}.`);
      const D = ZONE_KINDS[op.kind], id = nid(E, 'z');
      const zn = { id, kind: op.kind, at: [r2(at[0]), r2(at[1])], r: D.r, soft: D.soft, amount: 1 };
      const bad = setZone(zn, op); if (bad) return no(bad);
      E.zones.push(zn);
      return done('zones', at, { id });
    }
    case 'zone.set': {
      const zn = E.zones.find(z => z.id === op.id);
      if (!zn) return no(`No effect zone "${op.id}".`);
      if (at) zn.at = [r2(at[0]), r2(at[1])];
      if (op.kind !== undefined) { if (!ZONE_KINDS[op.kind]) return no('Unknown effect kind.'); zn.kind = op.kind; }
      const bad = setZone(zn, op); if (bad) return no(bad);
      return done('zones', zn.at, { id: zn.id });
    }
    case 'zone.remove': { const i = E.zones.findIndex(z => z.id === op.id); if (i < 0) return no(`No effect zone "${op.id}".`); const [zn] = E.zones.splice(i, 1); return done('zones', zn.at, { id: zn.id }); }
    case 'look.set': {
      if (!map.regions?.[op.region]) return no(`No region "${op.region}". Regions: ${Object.keys(map.regions || {}).join(', ')}.`);
      const L = { ...(E.looks[op.region] || {}) };
      for (const [k, v] of Object.entries(op.values || {})) {
        const lim = LOOK_FIELDS[k];
        if (!lim) return no(`Look fields: ${Object.keys(LOOK_FIELDS).join(', ')}.`);
        if (v === null) { delete L[k]; continue; }
        if (lim === 'colour') { if (!isHex(v)) return no(`${k} is a colour like #a0b0c0.`); L[k] = v.toLowerCase(); }
        else if (isNum(v)) L[k] = Math.round(clamp(v, lim[0], lim[1]) * 10000) / 10000; else return no(`${k} must be a number.`);
      }
      if (Object.keys(L).length) E.looks[op.region] = L; else delete E.looks[op.region];
      return done('looks', null, { id: op.region });
    }
    case 'note.add': {
      const text = String(op.text || '').trim().slice(0, 400);
      if (!at || !text) return no('A note needs a spot and some words.');
      const id = nid(E, 'n');
      E.notes.push({ id, at: [r2(at[0]), r2(at[1])], text, by: String(op.by || by).slice(0, 20), done: false, made: now() });
      return done('notes', at, { id });
    }
    case 'note.done': case 'note.open': {
      const n = E.notes.find(x => x.id === op.id); if (!n) return no(`No note "${op.id}".`);
      n.done = op.op === 'note.done'; if (n.done) { n.doneBy = String(op.by || by).slice(0, 20); if (op.reply) n.reply = String(op.reply).slice(0, 400); }
      return done('notes', n.at, { id: n.id });
    }
    case 'note.remove': { const i = E.notes.findIndex(x => x.id === op.id); if (i < 0) return no(`No note "${op.id}".`); const [n] = E.notes.splice(i, 1); return done('notes', n.at, { id: n.id }); }
    case 'orphan.drop': {
      // take a stale edit out of the file (after the report listed it)
      const id = String(op.id || '');
      const before = JSON.stringify(E);
      E.trees.remove = E.trees.remove.filter(x => x !== id); E.decor.remove = E.decor.remove.filter(x => x !== id); delete E.moves[id];
      if (JSON.stringify(E) === before) return no(`No edit "${id}".`);
      return done('trees', null, { id });
    }
    default: return no(`Unknown edit "${op.op}".`);
  }
}
function setZone(zn, op) {
  for (const [k, [lo, hi]] of Object.entries(ZONE_NUM)) {
    if (op[k] === undefined) continue;
    if (op[k] === null) { delete zn[k]; continue; }
    if (!isNum(op[k])) return `${k} must be a number.`;
    zn[k] = Math.round(clamp(op[k], lo, hi) * 10000) / 10000;
  }
  if (op.tint !== undefined) { if (op.tint === null) delete zn.tint; else if (isHex(op.tint)) zn.tint = op.tint.toLowerCase(); else return 'tint is a colour like #a0b0c0.'; }
  if (op.name !== undefined) zn.name = String(op.name).slice(0, 40);
  if (zn.soft > zn.r) zn.soft = zn.r;
  return null;
}
