// Real forests (play-test 11, Z25 — live #26: "the current trees in the game around Torborhold are good, but they are
// tiny. Add some more trees, making more dense / forested areas. These new trees should be much taller, 3–5 times taller
// than the current trees").
//
// The zone bake's scatter is an even sprinkle: one tree every ~20 m, all about 7 m tall. This grows WOODS out of it:
// a slow noise over the world marks forest patches; inside a patch, some of the bake's own trees become GIANTS (drawn
// 3.2–4.6 x taller, their trunks as much thicker) and every tree gets one or two new neighbours (some of them giants
// too) on open ground near it. Outside the patches nothing changes.
//
// Pure and deterministic (no three / DOM; the same scatter + nav give the same woods on every machine): the CLIENT draws
// the grown scatter (scatter-view.js) and wraps its nav with it (nav-refine.js), the SERVER wraps its nav the same way
// (js/sim/content.js) — so a giant you see is a giant you walk round, on both sides.
//
//   growForest(scatter, nav, { ox, oz }) -> a scatter-shaped object: the bake's items (same order, same fields) and
//     the new ones after them, plus `size` (Float32Array, x the drawn size: 1, or a giant's factor) and `added`
//     (Uint8Array, 1 = not in the bake: nav.bin never had it, so nav-refine adds a circle and no mask)

import { SCATTER_KINDS, NAV } from './terrain-read.js';

export const FOREST = Object.freeze({
  patchCell: 170,            // metres: the size of the forest / open-land noise
  detailCell: 55,
  patchFrom: 0.56,           // noise above this is forest (about a fifth of the land)
  giantChance: 0.42,         // a bake tree inside a patch becomes a giant
  newGiantChance: 0.36,      // a NEW tree inside a patch is a giant
  extraPer: 2,               // new trees tried round each bake tree in a patch
  ringMin: 4.5, ringMax: 11, // metres from the tree a new one stands
  giantMin: 3.2, giantMax: 4.6,
  spacing: 3.2,              // a new tree keeps this far from every other tree (metres, trunk to trunk)
});
const TREES = new Set(['tree_broadleaf', 'tree_conifer']);
const KIND_ID = Object.fromEntries(SCATTER_KINDS.map((k, i) => [k.key, i]));
// never on a road, in a town, on a building, in water, on a cliff, or on anything solid the bake already put there
const NO_TREE = NAV.ROAD | NAV.TOWN | NAV.BUILDING | NAV.SHALLOW | NAV.DEEP | NAV.STEEP | NAV.SOLID;

function hash(i, j, s) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sm = t => t * t * (3 - 2 * t);
function vnoise(x, z, cell, seed) {
  const fx = x / cell, fz = z / cell, i = Math.floor(fx), j = Math.floor(fz), u = sm(fx - i), w = sm(fz - j);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return (a * (1 - u) + b * u) * (1 - w) + (c * (1 - u) + d * u) * w;
}
/** How wooded the world is at (x, z) world metres, 0..1 (the same everywhere for everyone). */
export function forestAt(x, z) { return vnoise(x, z, FOREST.patchCell, 11) * 0.72 + vnoise(x, z, FOREST.detailCell, 23) * 0.28; }

/**
 * The places a new tree (or a giant) must keep off, in zone metres: the bake's set pieces, buildings, fields, camps and
 * event sites, and every vignette (a camp, a shrine, a chest, a quest giver standing in the wilds). Both the server and
 * the client build it from the same two files: data/zones/<z>/placements.json and the zone's vignette placements.
 * -> [{ x, z, r }]
 */
export function clearOf(bakePlacements = [], vignettePlacements = []) {
  const out = [];
  for (const p of bakePlacements || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const d = p.data || {};
    if (p.kind === 'road' || p.kind === 'path' || p.kind === 'street' || p.kind === 'town_wall' || p.kind === 'settlement') continue;   // nav carries ROAD / TOWN
    const r = Number.isFinite(d.r) ? d.r : (d.w || d.d) ? Math.hypot(d.w || 0, d.d || 0) / 2 : Array.isArray(d.pts) ? null : 6;
    if (r != null) { out.push({ x: p.x, z: p.z, r: r + 4 }); continue; }
    for (const q of d.pts) out.push({ x: q[0], z: q[1], r: 5 });           // a hedge / fence line: keep its posts clear
  }
  for (const v of vignettePlacements || []) if (v && Number.isFinite(v.x) && Number.isFinite(v.z)) out.push({ x: v.x, z: v.z, r: (Number.isFinite(v.radius) ? v.radius : 4) + 4 });
  return out;
}

/**
 * The bake's scatter with woods grown in. `nav` (raw parseNav) keeps new trees off roads, towns, water and cliffs;
 * `ox`/`oz` = the zone's origin in world metres (the noise is in world metres, so woods run across zone edges).
 */
export function growForest(scatter, nav, { ox = 0, oz = 0, clear = null } = {}) {
  if (!scatter || !(scatter.count > 0)) return scatter;
  const n = scatter.count, E = scatter.meta?.extent || (nav ? (nav.size - 1) * nav.step : 2048);
  const size = new Float32Array(n).fill(1);
  const nx = [], nz = [], nk = [], ns = [], ny = [], nv = [], nsize = [];
  // trunks so far, in 8 m buckets, to keep the new ones apart
  const B = 8, grid = new Map(), key = (x, z) => Math.floor(x / B) * 4096 + Math.floor(z / B);
  const addPt = (x, z) => { const k = key(x, z); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(x, z); };
  const near = (x, z, r) => {
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = grid.get(key(x + a * B, z + b * B)); if (!l) continue;
      for (let i = 0; i < l.length; i += 2) if ((l[i] - x) ** 2 + (l[i + 1] - z) ** 2 < r * r) return true;
    }
    return false;
  };
  for (let i = 0; i < n; i++) { const K = SCATTER_KINDS[scatter.kind[i]]; if (K && K.solid) addPt(scatter.x[i], scatter.z[i]); }
  const navOk = (x, z) => !nav || ((nav.at(x, z) & NAV.WALK) !== 0 && (nav.at(x, z) & NO_TREE) === 0);
  // the keep-clear circles, bucketed (a few hundred a zone)
  const CB = 32, cgrid = new Map();
  for (const c of clear || []) for (let a = Math.floor((c.x - c.r) / CB); a <= Math.floor((c.x + c.r) / CB); a++) for (let b = Math.floor((c.z - c.r) / CB); b <= Math.floor((c.z + c.r) / CB); b++) { const k = a * 4096 + b; let l = cgrid.get(k); if (!l) cgrid.set(k, (l = [])); l.push(c); }
  const kept = (x, z, pad = 0) => { const l = cgrid.get(Math.floor(x / CB) * 4096 + Math.floor(z / CB)); if (l) for (const c of l) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + pad) ** 2) return true; return false; };
  for (let i = 0; i < n; i++) {
    const K = SCATTER_KINDS[scatter.kind[i]]; if (!K || !TREES.has(K.key)) continue;
    const x = scatter.x[i], z = scatter.z[i], wx = x + ox, wz = z + oz;
    const f = forestAt(wx, wz); if (f < FOREST.patchFrom) continue;
    const deep = Math.min(1, (f - FOREST.patchFrom) / 0.18);          // further into the wood = more and bigger trees
    const qi = Math.round(wx * 4), qj = Math.round(wz * 4);
    if (hash(qi, qj, 101) < FOREST.giantChance * (0.6 + 0.4 * deep) && !kept(x, z, 6)) size[i] = FOREST.giantMin + (FOREST.giantMax - FOREST.giantMin) * hash(qi, qj, 102);
    for (let t = 0; t < FOREST.extraPer; t++) {
      if (hash(qi, qj, 110 + t) > 0.55 + 0.45 * deep) continue;
      const ang = hash(qi, qj, 120 + t) * Math.PI * 2, r = FOREST.ringMin + (FOREST.ringMax - FOREST.ringMin) * hash(qi, qj, 130 + t);
      const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      if (px < 2 || pz < 2 || px > E - 2 || pz > E - 2) continue;
      const giant = hash(qi, qj, 140 + t) < FOREST.newGiantChance * (0.5 + 0.5 * deep);
      if (near(px, pz, giant ? FOREST.spacing * 1.6 : FOREST.spacing) || !navOk(px, pz) || kept(px, pz, giant ? 6 : 0)) continue;
      // the wood's own mix: mostly what grows here, a conifer now and then in a broadleaf wood
      const kind = K.key === 'tree_conifer' || hash(qi, qj, 150 + t) < 0.18 ? KIND_ID.tree_conifer : KIND_ID.tree_broadleaf;
      nx.push(px); nz.push(pz); nk.push(kind); ns.push(0.8 + 0.5 * hash(qi, qj, 160 + t)); ny.push(hash(qi, qj, 170 + t) * Math.PI * 2);
      nv.push(Math.floor(hash(qi, qj, 180 + t) * 6)); nsize.push(giant ? FOREST.giantMin + (FOREST.giantMax - FOREST.giantMin) * hash(qi, qj, 190 + t) : 1);
      addPt(px, pz);
    }
  }
  const m = nx.length, N = n + m;
  const cat = (a, b, T) => { const o = new T(N); o.set(a); o.set(b, n); return o; };
  const added = new Uint8Array(N); added.fill(1, n);
  const sz = new Float32Array(N); sz.set(size); sz.set(nsize, n);
  return {
    meta: scatter.meta, count: N, kinds: scatter.kinds || SCATTER_KINDS,
    x: cat(scatter.x, nx, Float32Array), z: cat(scatter.z, nz, Float32Array), kind: cat(scatter.kind, nk, Uint8Array),
    scale: cat(scatter.scale, ns, Float32Array), yaw: cat(scatter.yaw, ny, Float32Array), variant: cat(scatter.variant, nv, Uint8Array),
    size: sz, added, baked: n, grown: m, giants: sz.reduce((a, v) => a + (v > 1 ? 1 : 0), 0),
  };
}
