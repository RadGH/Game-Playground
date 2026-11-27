// World Build — stage 6, Detail: farm fields round the towns, the towns themselves (Oathwild's own town planner,
// prototypes/oathwild/js/world/town.js — streets first, houses lining them, yards, lamps, villagers), forests and decor,
// and a set piece at every camp, dungeon and landmark. Pure and seeded.
//
// Trees and decor are never stored: like Oathwild's scatter.js they are rebuilt the same way for any tile from the
// seed, so the server (colliders), the fly view and the checks all get the same trees. Inside the pinned piece the
// trees ARE Oathwild's scatter() on its own terrain, so the hand-made map keeps exactly the trees the game has.
//
//   detailWorld(W, T)          adds W.fields, W.townDefs (towns.json rows), W.townPlan (planTowns result, world
//                              towns + pinned towns), W.setPieces, W.areas; then T.buildBiomeGrid()
//   treesInTile(W, T, tx, tz)  → { trees: [{ id, art, x, z, y, rot, scale, r, h, crown }], decor: [...] } for one
//                              TILE-metre tile (ids are stable: 't:<x dm>:<z dm>')
//   countDetail(W, T)          trees / decor / giants over the whole world (the report's numbers)

import { rngFor, makeRng, hashStr, clamp, gridSample, r2 } from './core.js';
import { THEMES, TOWN_SIZE } from './themes.js';
import { planTowns } from '../../prototypes/oathwild/js/world/town.js';
import { scatter, TREE_SPECIES } from '../../prototypes/oathwild/js/world/scatter.js';
import { sceneryWithEdits, treeId as gameTreeId } from '../../prototypes/oathwild/js/world/edits.js';

export const TILE = 256;

export function detailWorld(W, T) {
  const { pin } = W;
  const rngF = rngFor(W.seed, 'fields');
  const towns = W.placeOrder.map(id => W.places[id]).filter(p => p.kind === 'town');

  // ---------------------------------------------------------------- 1. fields round the farming towns
  const fields = pin ? pin.lists.fields.map(f => ({ ...f })) : [];
  const fieldBoxOk = (cx, cz, w, d, ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let u = -0.5; u <= 0.5; u += 0.125) for (let v = -0.5; v <= 0.5; v += 0.25) {
      const x = cx + u * w * c + v * d * s, z = cz - u * w * s + v * d * c;
      if (!T.inPlay(x, z) || (pin && pin.keepDist(x, z) < 40)) return false;
      if (T.slopeAt(x, z) > 9) return false;
      const wa = T.waterAt(x, z); if (wa && wa.depth > -0.5) return false;
      const rd = T.roadAt(x, z, 12); if (rd && rd.d < rd.half + 3) return false;
      for (const p of Object.values(W.places)) if (Math.hypot(x - p.at[0], z - p.at[1]) < (p.kind === 'town' ? p.radius + 6 : (p.flat || p.radius || 10) + 10)) return false;
      for (const f of fields) if (Math.hypot(x - f.at[0], z - f.at[1]) < (f.size[0] + f.size[1]) / 2 + 6) return false;
    }
    return true;
  };
  for (const R of W.regionList) {
    if (R.pinned) continue;
    const want = R.brief.fields | 0;
    if (!want) continue;
    const rt = towns.filter(t => t.region === R.id);
    if (!rt.length) continue;
    let made = 0;
    for (let tries = 0; tries < want * 40 && made < want; tries++) {
      const t = rt[tries % rt.length];
      const a = rngF() * 6.2832, dd = t.radius + 30 + rngF() * 170;
      const cx = t.at[0] + Math.cos(a) * dd, cz = t.at[1] + Math.sin(a) * dd;
      const w = 40 + rngF() * 40, d = 30 + rngF() * 30;
      const road = T.roadAt(cx, cz, 120);
      const ang = road ? roadAngle(T, road.road, cx, cz) + (rngF() < 0.5 ? 0 : Math.PI / 2) : rngF() * 3.14;
      if (!fieldBoxOk(cx, cz, w, d, ang)) continue;
      made++;
      fields.push({ id: `${t.id}_field_${made}`, name: `${t.name} Fields`, at: [r2(cx), r2(cz)], size: [Math.round(w), Math.round(d)], angle: r2(ang), region: R.id, generated: true });
    }
  }
  W.fields = fields;

  // ---------------------------------------------------------------- 2. towns (towns.json rows) and Oathwild's planner
  const defs = {};
  for (const t of towns) {
    const th = THEMES[t.theme], S = TOWN_SIZE[t.size || 'village'];
    const st = W.townStreets[t.id] || { main: [], lanes: [] };
    defs[t.id] = {
      seed: hashStr(`${W.seed}:${t.id}`) % 100000, radius: t.radius, streets: [...st.main, ...st.lanes], styles: th.houses, fences: th.fences,
      villagers: S.villagers, lampEvery: t.size === 'town' ? 16 : 20,
      ...(t.size === 'town' ? {} : { rules: { widths: [[2, 4], [3, 2]], depths: [[2, 2], [3, 1]], storeys: [[1, 3], [2, 3]], gapEvery: [2, 3], outskirts: 0.8 } }),
      generated: true,
    };
  }
  W.townDefs = defs;
  const plan = planTowns(T, defs, {});
  // the pinned towns: Oathwild's own plan on its own terrain (exactly what the game builds)
  let pinPlan = null;
  if (pin && pin.at[0] === 0 && pin.at[1] === 0) pinPlan = planTowns(pin.T, pin.data.towns, { placements: pin.data.placements });
  W.townPlan = plan;
  W.pinTownPlan = pinPlan;

  // ---------------------------------------------------------------- 3. set pieces at camps, dungeons and landmarks
  W.setPieces = [];
  for (const id of W.placeOrder) {
    const p = W.places[id];
    if (p.kind === 'town') continue;
    // a part that would stand on a road is left out (that is also the gap where the trail comes in)
    const parts = setPiece(p, T, rngFor(W.seed, 'set:' + id)).filter(q => { const rd = T.roadAt(q.at[0], q.at[1], 12); return !rd || rd.d > rd.half + Math.hypot(q.size[0], q.size[2]) / 2 + 0.5; });
    W.setPieces.push({ place: id, kind: p.kind, type: p.type, parts });
  }

  // ---------------------------------------------------------------- 4. level areas (map.json `areas`: the band at each place)
  const areas = pin ? pin.lists.areas.map(a => ({ ...a })) : [];
  for (const id of W.placeOrder) {
    const p = W.places[id];
    areas.push({ id: `${id}_area`, name: p.name, at: p.at, radius: Math.round(Math.max(60, (p.radius || 20) * 2.5)), levels: p.levels, generated: true });
  }
  W.areas = areas;

  // keep-outs for trees: houses, yards, stalls, set pieces, bridges (bucketed)
  W.treeKeep = buildKeep(W, plan);
  T.buildBiomeGrid();
  return W;
}

function roadAngle(T, roadId, x, z) {
  const r = T.roads.find(rr => rr.id === roadId);
  let best = 0, bd = Infinity;
  for (let q = 0; q < r.pts.length - 1; q++) { const d = Math.hypot(r.pts[q].x - x, r.pts[q].z - z); if (d < bd) { bd = d; best = q; } }
  const a = r.pts[best], b = r.pts[best + 1];
  return Math.atan2(-(b.z - a.z), b.x - a.x);
}

/** The pieces that make a place read from a distance: tents and a fire at a camp, a door arch at a dungeon… */
function setPiece(p, T, rng) {
  const parts = [];
  const [cx, cz] = p.at;
  const y = (x, z) => r2(T.heightAt(x, z));
  const ring = (n, r, fn) => { const a0 = rng() * 6.28; for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.2832 + (rng() - 0.5) * 0.3; fn(cx + Math.cos(a) * r, cz + Math.sin(a) * r, a); } };
  switch (p.kind) {
    case 'camp':
      parts.push({ shape: 'fire', at: [cx, cz], y: y(cx, cz), size: [1.6, 0.6, 1.6], facing: 0 });
      ring(4 + Math.floor(rng() * 3), p.radius * 0.5, (x, z, a) => parts.push({ shape: 'tent', at: [r2(x), r2(z)], y: y(x, z), size: [3.4, 2.6, 4], facing: r2(-a + Math.PI / 2) }));
      ring(18, p.radius * 0.95, (x, z, a) => { if (rng() > 0.25) parts.push({ shape: 'post', at: [r2(x), r2(z)], y: y(x, z), size: [0.35, 2.6 + rng() * 0.8, 0.35], facing: r2(a) }); });
      break;
    case 'dungeon': {
      // the door faces downhill (away from the rise behind it)
      let up = 0, ua = 0;
      for (let a = 0; a < 8; a++) { const h = T.heightAt(cx + Math.cos(a * 0.785) * 30, cz + Math.sin(a * 0.785) * 30); if (h > up) { up = h; ua = a * 0.785; } }
      const bx = cx + Math.cos(ua) * 6, bz = cz + Math.sin(ua) * 6;
      parts.push({ shape: 'arch', at: [r2(bx), r2(bz)], y: y(bx, bz), size: [6, 5.5, 2.2], facing: r2(-ua + Math.PI / 2) });
      ring(6, 9, (x, z) => parts.push({ shape: 'stone', at: [r2(x), r2(z)], y: y(x, z), size: [1.2 + rng(), 1.6 + rng() * 1.2, 1 + rng()], facing: r2(rng() * 6) }));
      break;
    }
    case 'shrine':
      parts.push({ shape: 'altar', at: [cx, cz], y: y(cx, cz), size: [2.2, 1.2, 2.2], facing: 0 });
      ring(4, 4.5, (x, z, a) => parts.push({ shape: 'pillar', at: [r2(x), r2(z)], y: y(x, z), size: [0.8, 3.6, 0.8], facing: r2(a) }));
      break;
    default: {
      const t = p.type;
      if (t === 'standing_stones' || t === 'arch') ring(t === 'arch' ? 2 : 9, p.radius * 0.6, (x, z, a) => parts.push({ shape: 'stone', at: [r2(x), r2(z)], y: y(x, z), size: [1.4, t === 'arch' ? 9 : 3.4 + rng() * 1.6, 0.9], facing: r2(a) }));
      else if (t === 'ruin' || t === 'lakeside') ring(7, p.radius * 0.55, (x, z, a) => parts.push({ shape: 'wall', at: [r2(x), r2(z)], y: y(x, z), size: [5 + rng() * 3, 1.5 + rng() * 3.5, 0.9], facing: r2(-a) }));
      else if (t === 'lighthouse') parts.push({ shape: 'tower', at: [cx, cz], y: y(cx, cz), size: [5, 18, 5], facing: 0 });
      else if (t === 'peak') parts.push({ shape: 'cairn', at: [cx, cz], y: y(cx, cz), size: [2.4, 2.2, 2.4], facing: 0 });
      else if (t === 'vent') ring(6, p.radius * 0.4, (x, z) => parts.push({ shape: 'stone', at: [r2(x), r2(z)], y: y(x, z), size: [2.2, 1.4, 2], facing: r2(rng() * 6) }));
      else if (t === 'old_tree') parts.push({ shape: 'stone', at: [cx + 6, cz], y: y(cx + 6, cz), size: [1.2, 0.8, 1], facing: 0 });
    }
  }
  return parts;
}

function buildKeep(W, plan) {
  const K = new Map(), S = 32, key = (i, k) => i * 65536 + k;
  const add = (x, z, r) => { for (let i = Math.floor((x - r) / S); i <= Math.floor((x + r) / S); i++) for (let k = Math.floor((z - r) / S); k <= Math.floor((z + r) / S); k++) { const kk = key(i, k); if (!K.has(kk)) K.set(kk, []); K.get(kk).push([x, z, r]); } };
  for (const b of plan.boxes) add(b.x, b.z, Math.hypot(b.hw, b.hd) + 2);
  for (const y of plan.yards) add(y.at[0], y.at[1], Math.hypot(y.w, y.d) / 2);
  for (const c of plan.circles) add(c.x, c.z, c.r + 1);
  for (const sp of W.setPieces) for (const q of sp.parts) add(q.at[0], q.at[1], Math.hypot(q.size[0], q.size[2]) / 2 + 1.5);
  for (const b of W.bridges) add(b.at[0], b.at[1], b.reach + 4);
  for (const p of Object.values(W.places)) if (p.flat && !p.pinned) add(p.at[0], p.at[1], p.kind === 'town' ? 0 : p.flat);
  return { blocked: (x, z, r) => (K.get(key(Math.floor(x / S), Math.floor(z / S))) || []).some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r) };
}

const pick = (list, rng) => { const tot = list.reduce((s, [, w]) => s + w, 0); let r = rng() * tot; for (const [k, w] of list) { if ((r -= w) <= 0) return k; } return list[list.length - 1][0]; };
const RADIUS = { 'rock-small': 0.3, 'rock-medium': 0.6, boulder: 1.3, 'boulder-mossy': 1.1, 'rock-large': 1.1, 'rock-slab': 1.2, 'cliff-chunk': 2.5, 'rock-cluster': 0.8, 'stump-a': 0.4, log: 0.5, 'log-hollow': 0.6 };
const WALK_THROUGH = new Set(['fern', 'mushrooms', 'reeds', 'bog-plant', 'bush-a', 'bush-b', 'bush-c', 'rock-small']);

/** Trees and decor of one tile (tile tx, tz covers [tx·TILE, (tx+1)·TILE) × [tz·TILE, …)). Same seed = same trees. */
export function treesInTile(W, T, tx, tz, opts = {}) {
  // a tile is the same every time it is asked for: remember it (the counts, the checks and the fly view share it)
  const key = tx * 65536 + tz;
  W._tiles = W._tiles || new Map();
  if (!W._tiles.has(key)) W._tiles.set(key, makeTile(W, T, tx, tz, opts));
  return W._tiles.get(key);
}
function makeTile(W, T, tx, tz, { treeStep = 11, decorStep = 9 } = {}) {
  const box = { minX: tx * TILE, maxX: (tx + 1) * TILE, minZ: tz * TILE, maxZ: (tz + 1) * TILE };
  const pin = W.pin;
  const trees = [], decor = [];
  // inside the pinned piece: Oathwild's own scatter on its own terrain (the trees the game already has)
  if (pin && box.minX < pin.keep.maxX && box.maxX > pin.keep.minX && box.minZ < pin.keep.maxZ && box.maxZ > pin.keep.minZ) {
    const kb = { minX: Math.max(box.minX, pin.keep.minX) - pin.at[0], maxX: Math.min(box.maxX, pin.keep.maxX) - pin.at[0], minZ: Math.max(box.minZ, pin.keep.minZ) - pin.at[1], maxZ: Math.min(box.maxZ, pin.keep.maxZ) - pin.at[1] };
    const pinKey = `${kb.minX},${kb.minZ}`;
    W._pinScatter = W._pinScatter || new Map();
    if (!W._pinScatter.has(pinKey)) {
      const extra = W.pinTownPlan ? [...W.pinTownPlan.boxes.map(b => [b.x, b.z, Math.hypot(b.hw, b.hd) + 2])] : [];
      const s = scatter(pin.T, pin.data.placements || {}, { box: kb, extra });
      // town trees between the houses (the planner's own) belong to the pinned towns too
      if (W.pinTownPlan) for (const t of W.pinTownPlan.trees) if (t.x >= kb.minX && t.x < kb.maxX && t.z >= kb.minZ && t.z < kb.maxZ) s.trees.push(t);
      W._pinScatter.set(pinKey, s);
    }
    const s = W._pinScatter.get(pinKey);
    for (const t of s.trees) trees.push({ ...t, x: t.x + pin.at[0], z: t.z + pin.at[1], id: treeId(t.x + pin.at[0], t.z + pin.at[1]), pinned: true });
    for (const d of s.decor) decor.push({ ...d, x: d.x + pin.at[0], z: d.z + pin.at[1], pinned: true });
  }
  const regionList = W.regionList, regIdx = W.regionIndex;
  for (let gx = Math.ceil(box.minX / treeStep) * treeStep; gx < box.maxX; gx += treeStep) for (let gz = Math.ceil(box.minZ / treeStep) * treeStep; gz < box.maxZ; gz += treeStep) {
    const rng = makeRng(hashStr(`t${W.seed}:${gx}:${gz}`));
    const x = gx + (rng() - 0.5) * treeStep * 0.9, z = gz + (rng() - 0.5) * treeStep * 0.9;
    if (pin && pin.inKeep(x, z)) continue;
    if (!T.inPlay(x, z)) continue;
    const f = T.forestAt(x, z);
    if (rng() > f * 0.95) continue;
    const biome = T.biomeAt(x, z);
    if (biome === 'water' || biome === 'road' || biome === 'trail' || biome === 'village' || biome === 'field' || biome === 'snow' || biome === 'beach') continue;
    if (T.slopeAt(x, z) > 28) continue;
    const w = T.waterAt(x, z);
    if (w && w.depth > -0.2) continue;
    const R = regionList[regIdx[T.regionAt(x, z)]], th = THEMES[R.theme];
    let art = pick(biome === 'marsh' || biome === 'fen' ? THEMES.fen.trees : th.trees, rng);
    if (th.giant && biome === 'forest' && f > (th.giantWood ?? 0.5) && rng() < (th.giantShare ?? 0.1)) art = th.giant;
    const sp = TREE_SPECIES[art];
    const scale = 0.85 + rng() * 0.3;
    if (W.treeKeep.blocked(x, z, Math.max(1, sp.crown * scale * 0.55))) continue;
    const rd = T.roadAt(x, z, 12);
    if (rd && rd.d <= rd.half + Math.max(1, sp.trunk * scale + 0.5) + 1.5) continue;
    if (sp.giant && trees.some(t => Math.hypot(t.x - x, t.z - z) < sp.crown * 0.7)) continue;
    trees.push({ id: treeId(x, z), art, x: r2(x), z: r2(z), y: r2(T.heightAt(x, z)), rot: r2(rng() * 6.283), scale: r2(scale), r: r2(sp.trunk * scale), h: r2(sp.h * scale), crown: r2(sp.crown * scale) });
  }
  // town trees between the houses (the planner's own big trees)
  for (const t of W.townPlan.trees) if (t.x >= box.minX && t.x < box.maxX && t.z >= box.minZ && t.z < box.maxZ) trees.push({ ...t, id: treeId(t.x, t.z), town: true });
  for (let gx = Math.ceil(box.minX / decorStep) * decorStep; gx < box.maxX; gx += decorStep) for (let gz = Math.ceil(box.minZ / decorStep) * decorStep; gz < box.maxZ; gz += decorStep) {
    const rng = makeRng(hashStr(`d${W.seed}:${gx}:${gz}`));
    if (rng() > 0.42) continue;
    const x = gx + (rng() - 0.5) * decorStep * 0.9, z = gz + (rng() - 0.5) * decorStep * 0.9;
    if ((pin && pin.inKeep(x, z)) || !T.inPlay(x, z)) continue;
    const biome = T.biomeAt(x, z);
    if (['water', 'road', 'trail', 'village', 'field', 'boardwalk'].includes(biome)) continue;
    const R = regionList[regIdx[T.regionAt(x, z)]], th = THEMES[R.theme];
    const art = pick(biome === 'marsh' || biome === 'fen' ? THEMES.fen.decor : biome === 'forest' ? THEMES.oldwood.decor : th.decor, rng);
    const r = RADIUS[art] || 0.5;
    const w = T.waterAt(x, z);
    if (w && w.depth > -0.1) continue;
    if (W.treeKeep.blocked(x, z, r)) continue;
    const rd = T.roadAt(x, z, 8); if (rd && rd.d <= rd.half + r + 1.5) continue;
    decor.push({ art, x: r2(x), z: r2(z), y: r2(T.heightAt(x, z)), rot: r2(rng() * 6.283), scale: r2(0.8 + rng() * 0.5), r, solid: !WALK_THROUGH.has(art) });
  }
  // the editor's hand fixes (stage 8), with the editor's own rules (prototypes/oathwild/js/world/edits.js
  // sceneryWithEdits): removals by spot id, added trees and decor, area brushes; only what lands in this tile is kept
  const E = W.editLayer;
  const inBox = t => t.x >= box.minX && t.x < box.maxX && t.z >= box.minZ && t.z < box.maxZ;
  if (E && (E.trees.remove.length || E.trees.add.length || E.trees.areas.length || E.decor.remove.length || E.decor.add.length)) {
    W._editSeen = W._editSeen || new Set();
    for (const id of [...E.trees.remove, ...E.decor.remove]) {
      const m = /^[td](-?\d+)_(-?\d+)$/.exec(id); if (!m) continue;
      const x = Number(m[1]) / 10, z = Number(m[2]) / 10;
      if (!inBox({ x, z })) continue;
      if ((id[0] === 't' ? trees : decor).some(t => Math.hypot(t.x - x, t.z - z) < 0.6)) W._editSeen.add(id);
    }
    const keep = [];
    for (const b of W.townPlan.boxes) if (Math.abs(b.x - (box.minX + 128)) < 260 && Math.abs(b.z - (box.minZ + 128)) < 260) keep.push([b.x, b.z, Math.hypot(b.hw, b.hd) + 2]);
    for (const p of Object.values(W.places)) if (p.flat) keep.push([p.at[0], p.at[1], p.flat]);
    const res = sceneryWithEdits({ terrain: T, data: { placements: {}, edits: E }, town: { trees: [] } }, { scatter: () => ({ trees: trees.slice(), decor: decor.slice() }), keepOuts: () => keep, species: TREE_SPECIES, decorInfo: art => ({ r: RADIUS[art] || 0.5, solid: !WALK_THROUGH.has(art) }) });
    return { trees: res.trees.filter(inBox).map(t => (t.id ? t : { ...t, id: treeId(t.x, t.z) })), decor: res.decor.filter(inBox) };
  }
  return { trees, decor };
}
/** A tree's id is where it stands, in the editor's own form ('t<x·10>_<z·10>'), so an edit keeps meaning the same tree. */
export const treeId = (x, z) => gameTreeId({ x, z });

/** Every tile's trees counted (and their ids, for the edits layer's "is this tree still there" check). */
export function countDetail(W, T) {
  const B = W.bounds;
  const out = { trees: 0, giants: 0, decor: 0, tiles: 0, bySpecies: {}, ids: new Set(), tallest: 0, medianH: 0 };
  const hs = [];
  for (let tx = Math.floor(B.minX / TILE); tx * TILE < B.maxX; tx++) for (let tz = Math.floor(B.minZ / TILE); tz * TILE < B.maxZ; tz++) {
    const s = treesInTile(W, T, tx, tz);
    out.tiles++;
    out.trees += s.trees.length; out.decor += s.decor.length;
    for (const t of s.trees) {
      out.bySpecies[t.art] = (out.bySpecies[t.art] || 0) + 1;
      if (TREE_SPECIES[t.art]?.giant) out.giants++;
      out.ids.add(t.id);
      hs.push(t.h || 0); out.tallest = Math.max(out.tallest, t.h || 0);
    }
  }
  hs.sort((a, b) => a - b);
  out.medianH = hs[Math.floor(hs.length / 2)] || 0;
  return out;
}
void clamp; void gridSample;
