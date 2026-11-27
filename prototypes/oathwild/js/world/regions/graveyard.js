// Oathwild — the `graveyard` region generator (brainstorm 2026-11-27 §2): a hamlet at the road's end and a walled
// cemetery on rolling ground, built the way js/world/arena-place.js builds the arena — the region's own small map in
// the world's formats (data/regions/<id>*.json) booted by the same bootWorld, so the same terrain, town planner,
// colliders, quest book and drawing code serve it. This file adds the cemetery: its wall and iron railings (solid
// boxes js/game/ground.js walks — the server's walls ARE the drawn walls, lessons rule 22) with gaps wherever a path
// crosses, the ruined chapel, the catacomb entrances, big dead trees (rule: trees 10-15x a person), the gravestones
// (js/world/regions/graves.js), spots for roam zones, crow perches and grave candles for the drawing side.
// Pure apart from reading its files through js/world/boot.js readJson (fetch in a browser, fs under Node).
//
//   const W = await bootGraveyard({ id: 'ashfield', regions })   → a world W (data, terrain, book, town) plus
//       W.graveyard   the layout (below; also W.data.placements.graveyardLayout for the browser)
//       W.regionInfo  { id, name, kind, levels, lore, tip, arrival, waypoint, rules, newMonsters, newCritters }
//       W.regionRules { regions: { <id>: rules } } — data/regions.json shape; merge into rules.data.regions for camps
//       W.travel      [{ id, name, at, y, radius, arrive, face, to: { region, point } }]
//       W.entrances   [{ id, name, at, y, radius, face, main?, requires?, to, box? }]
//       W.place       the region id
//   graveyardLayout(W, regionRow, { names }) → the layout, on an already booted W (tests call it with other seeds)
//
// Layout: { id, rect, walls: { boxes, gaps, height, thick }, fences: [{ id, name, boxes, gaps, height }],
//           ruin: { id, name, at, size, facing, height, boxes, pillars }, entrances, travel, waypoint, arrival,
//           quarters, stones, openGraves, graves, byQuarter, trees, crows, candles, boxes, circles, timings }
//
// The region's `names` default to Name Forge (playground/namegen, per-race names) when it can be imported; otherwise
// graves.js's small plain table.

import { bootWorld, readJson } from '../boot.js';
import { normEdits } from '../edits.js';
import { worldScene } from '../live.js';
import { TREE_SPECIES } from '../scatter.js';
import { makeRng, hashStr } from '../../rules/farhold.js';
import { planGraves, fromLocal } from './graves.js';

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;
const pickW = (rng, table) => { const tot = table.reduce((s, [, w]) => s + w, 0); let x = rng() * tot; for (const [v, w] of table) if ((x -= w) <= 0) return v; return table[table.length - 1][0]; };
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);   // lint-ok: timing report only, never feeds the layout

// ---------------------------------------------------------------- loading

/** Read a region's files: data/regions/<id>.json and the files it names. */
export async function loadRegionData(id = 'ashfield', read = readJson) {
  const base = new URL('../../../data/regions/', import.meta.url);
  const region = await read(new URL(`${id}.json`, base));
  const out = { region };
  for (const [k, f] of Object.entries(region.files || {})) out[k] = await read(new URL(f, base));
  out.edits = normEdits(out.edits || null);
  return out;
}

/** Name Forge as a graves.js `names` function: (seed, { gender, family }) → { given, family }. */
export const nameForgeNames = gen => (seed, { gender = 'm', family = null } = {}) => ({
  given: gen.generate('person.given', { race: 'human', gender, seed }).text,
  family: family || gen.generate('person.family', { race: 'human', seed: (seed ^ 0x9e3779b9) >>> 0 }).text,
});
/** Load Name Forge (playground/namegen) if this host can reach it; null otherwise (graves.js uses its own table). */
export async function loadNameForge(read = readJson) {
  try {
    const { NameGen } = await import('../../../../../namegen/js/namegen.js');
    const base = new URL('../../../../../namegen/data/', import.meta.url);
    const [languages, concepts, patterns] = await Promise.all(['languages', 'concepts', 'patterns'].map(f => read(new URL(`${f}.json`, base))));
    return nameForgeNames(new NameGen({ languages, concepts, patterns }));
  } catch { return null; }
}

/** The region as a world: bootWorld on its files, then the cemetery layout and its colliders. */
export async function bootGraveyard({ id = 'ashfield', regions = null, data = null, names, read = readJson } = {}) {
  const d = data || await loadRegionData(id, read);
  const R = d.region;
  const regionRules = { regions: { [R.id]: R.rules } };
  const allRegions = { ...(regions || {}), regions: { ...(regions?.regions || {}), [R.id]: R.rules } };
  const W = await bootWorld({ regions: allRegions, data: { map: d.map, placements: d.placements, quests: d.quests, npcs: d.npcs, towns: d.towns, edits: d.edits } });
  if (names === undefined) names = await loadNameForge(read);
  W.graveyard = graveyardLayout(W, R, { names: names || undefined });
  W.data.placements.graveyardLayout = W.graveyard;      // the browser draws the cemetery from it
  W.region = R.id;
  W.regionInfo = { id: R.id, name: R.name, kind: R.kind, levels: R.levels, lore: R.lore, tip: R.tip, arrival: R.arrival, waypoint: W.graveyard.waypoint, rules: R.rules, newMonsters: R.newMonsters, newCritters: R.newCritters };
  W.regionRules = regionRules;
  W.travel = W.graveyard.travel;
  W.entrances = W.graveyard.entrances;
  W.place = R.id;
  return W;
}

// ---------------------------------------------------------------- helpers

/** A 0.5 m mask of every road and path (grown by `pad`), for O(1) "is this on a path". */
function pathMask(T, pad = 0.6, cell = 0.5) {
  const B = T.bounds, nx = Math.ceil((B.maxX - B.minX) / cell), nz = Math.ceil((B.maxZ - B.minZ) / cell);
  const m = new Uint8Array(nx * nz);
  for (const rd of T.roads) {
    const half = rd.width / 2 + pad;
    for (let q = 0; q < rd.pts.length - 1; q++) {
      const a = rd.pts[q], b = rd.pts[q + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 0.5));
      for (let s = 0; s <= n; s++) {
        const x = a.x + (b.x - a.x) * s / n, z = a.z + (b.z - a.z) * s / n;
        const i0 = Math.floor((x - half - B.minX) / cell), i1 = Math.floor((x + half - B.minX) / cell);
        const k0 = Math.floor((z - half - B.minZ) / cell), k1 = Math.floor((z + half - B.minZ) / cell);
        for (let k = Math.max(0, k0); k <= Math.min(nz - 1, k1); k++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
          const cx = B.minX + (i + 0.5) * cell, cz = B.minZ + (k + 0.5) * cell;
          if (Math.hypot(cx - x, cz - z) <= half) m[k * nx + i] = 1;
        }
      }
    }
  }
  return (x, z) => { const i = Math.floor((x - B.minX) / cell), k = Math.floor((z - B.minZ) / cell); return i >= 0 && k >= 0 && i < nx && k < nz && m[k * nx + i] === 1; };
}

/** Solid oriented boxes in an 8 m grid: inBox(x, z, pad). */
function boxIndex(list) {
  const grid = new Map(), key = (i, k) => i * 100003 + k, C = 8;
  for (const b of list) {
    const R = Math.hypot(b.hw, b.hd) + 1, c = Math.cos(b.facing), s = Math.sin(b.facing), e = { ...b, c, s };
    for (let i = Math.floor((b.x - R) / C); i <= Math.floor((b.x + R) / C); i++) for (let k = Math.floor((b.z - R) / C); k <= Math.floor((b.z + R) / C); k++) { const kk = key(i, k); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(e); }
  }
  return (x, z, pad = 0) => (grid.get(key(Math.floor(x / C), Math.floor(z / C))) || []).some(b => { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; return Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad; });
}
/** Round things in an 8 m grid: near(x, z, pad) — inside any circle grown by pad. */
function circleIndex(list) {
  const grid = new Map(), key = (i, k) => i * 100003 + k, C = 8;
  for (const c of list) for (let i = Math.floor((c.x - c.r - 2) / C); i <= Math.floor((c.x + c.r + 2) / C); i++) for (let k = Math.floor((c.z - c.r - 2) / C); k <= Math.floor((c.z + c.r + 2) / C); k++) { const kk = key(i, k); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(c); }
  return (x, z, pad = 0) => (grid.get(key(Math.floor(x / C), Math.floor(z / C))) || []).some(c => Math.hypot(x - c.x, z - c.z) < c.r + pad);
}

/**
 * A wall or railing from a to b in pieces of about `piece` metres (solid boxes, local x along the line). A piece a path
 * crosses is left out: that is the gate. → { boxes, gaps: [{ at, width, facing }] }
 */
function lineOfPieces(T, a, b, { thick = 1, piece = 4, gapPad = 1.5, heightAt }) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / piece)), len = L / n;
  const facing = Math.atan2(-dz, dx);                       // ground.js: local x = (cos f, -sin f)
  const boxes = [], gaps = [];
  let gap = null;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    let crossed = false;
    for (let s = 0; s <= 6 && !crossed; s++) {
      const t = lerp(t0, t1, s / 6), x = a[0] + dx * t, z = a[1] + dz * t;
      const rd = T.roadAt(x, z, 12);
      if (rd && rd.d < rd.half + gapPad) crossed = true;
    }
    const cx = a[0] + dx * (t0 + t1) / 2, cz = a[1] + dz * (t0 + t1) / 2;
    if (crossed) {
      if (!gap) gaps.push(gap = { from: t0, to: t1 }); else gap.to = t1;
      continue;
    }
    gap = null;
    boxes.push({ x: r2(cx), z: r2(cz), hw: r2(len / 2 + 0.04), hd: r2(thick / 2), facing: r3(facing), y: r2(heightAt(cx, cz)) });
  }
  return {
    boxes,
    gaps: gaps.map(g => { const t = (g.from + g.to) / 2; return { at: [r2(a[0] + dx * t), r2(a[1] + dz * t)], width: r2((g.to - g.from) * L), facing: r3(facing) }; }),
  };
}

/** The ruined chapel: four walls round an oriented rectangle, a door and broken gaps left open. */
function ruinWalls(T, ru, heightAt) {
  const [w, d] = ru.size, f = ru.facing || 0, [cx, cz] = ru.at, th = ru.thick || 1;
  // each side as [from, to] in local coords, its own axis, and the gaps along it (local coordinate along the side)
  const sides = {
    north: { a: [-w / 2, -d / 2], b: [w / 2, -d / 2], axis: 0 }, south: { a: [-w / 2, d / 2], b: [w / 2, d / 2], axis: 0 },
    west: { a: [-w / 2, -d / 2], b: [-w / 2, d / 2], axis: 1 }, east: { a: [w / 2, -d / 2], b: [w / 2, d / 2], axis: 1 },
  };
  const holes = { north: [], south: [], east: [], west: [] };
  if (ru.door) holes[ru.door.side].push([ru.door.at || 0, ru.door.width]);
  for (const bk of ru.breaks || []) holes[bk.side].push([bk.at, bk.width]);
  const boxes = [];
  for (const [name, s] of Object.entries(sides)) {
    const lo = s.a[s.axis], hi = s.b[s.axis];
    const cuts = holes[name].map(([at, wd]) => [at - wd / 2, at + wd / 2]).sort((p, q) => p[0] - q[0]);
    let start = lo - (s.axis === 0 ? th / 2 : 0);
    const end = hi + (s.axis === 0 ? th / 2 : 0);
    const runs = [];
    for (const [c0, c1] of cuts) { if (c0 > start) runs.push([start, c0]); start = Math.max(start, c1); }
    if (end > start) runs.push([start, end]);
    for (const [u0, u1] of runs) {
      const len = u1 - u0, n = Math.max(1, Math.round(len / 4));
      for (let i = 0; i < n; i++) {
        const v0 = u0 + len * i / n, v1 = u0 + len * (i + 1) / n, mid = (v0 + v1) / 2;
        const lx = s.axis === 0 ? mid : s.a[0], lz = s.axis === 0 ? s.a[1] : mid;
        const [x, z] = fromLocal(cx, cz, f, lx, lz);
        // along local x: facing f; along local z: the box's local x must run along local z → facing f - pi/2
        boxes.push({ x: r2(x), z: r2(z), hw: r2((v1 - v0) / 2 + 0.03), hd: r2(th / 2), facing: r3(s.axis === 0 ? f : f - Math.PI / 2), y: r2(heightAt(x, z)) });
      }
    }
  }
  const pillars = (ru.pillars || []).map(([lx, lz]) => fromLocal(cx, cz, f, lx, lz).map(r2));
  return { id: ru.id, name: ru.name, at: ru.at, size: ru.size, facing: f, height: ru.height, y: r2(heightAt(cx, cz)), boxes, pillars };
}

// ---------------------------------------------------------------- the layout

export function graveyardLayout(W, R, { names, seed = R.seed } = {}) {
  const t0 = now();
  const T = W.terrain, P = W.data.placements, G = R.graveyard, rect = G.rect;
  const heightAt = (x, z) => T.heightAt(x, z);
  const onPath = pathMask(T, 0.6);
  const insideRect = (x, z, pad = 0) => x > rect.minX + pad && x < rect.maxX - pad && z > rect.minZ + pad && z < rect.maxZ - pad;

  // 1. the cemetery wall (gaps where paths cross = the gates), the railings, the ruined chapel
  const WL = G.walls, c = [[rect.minX, rect.minZ], [rect.maxX, rect.minZ], [rect.maxX, rect.maxZ], [rect.minX, rect.maxZ]];
  const walls = { boxes: [], gaps: [], height: WL.height, thick: WL.thick };
  for (let i = 0; i < 4; i++) {
    const L = lineOfPieces(T, c[i], c[(i + 1) % 4], { thick: WL.thick, piece: WL.piece, gapPad: WL.gapPad, heightAt });
    walls.boxes.push(...L.boxes); walls.gaps.push(...L.gaps);
  }
  const fences = (G.fences || []).map(fc => {
    const out = { id: fc.id, name: fc.name, boxes: [], gaps: [], height: fc.height };
    for (let i = 0; i < fc.points.length - 1; i++) {
      const L = lineOfPieces(T, fc.points[i], fc.points[i + 1], { thick: fc.thick, piece: fc.piece, gapPad: fc.gapPad, heightAt });
      out.boxes.push(...L.boxes); out.gaps.push(...L.gaps);
    }
    return out;
  });
  const ruin = G.ruin ? ruinWalls(T, G.ruin, heightAt) : null;

  // 2. catacomb entrances (a stone portal into the hill = a solid box behind the spot you stand on) + travel points
  const entrances = (R.entrances || []).map(e => {
    const out = { id: e.id, name: e.name, at: e.at, y: r2(heightAt(...e.at)), radius: e.radius, face: e.face, to: e.to };
    if (e.main) out.main = true;
    if (e.requires) out.requires = e.requires;
    if (e.structure) {
      const dir = [Math.sin(e.face), Math.cos(e.face)], back = e.structure.hd + e.radius * 0.5 + 0.5;
      const bx = e.at[0] - dir[0] * back, bz = e.at[1] - dir[1] * back;
      out.box = { x: r2(bx), z: r2(bz), hw: e.structure.hw, hd: e.structure.hd, facing: r3(e.face), y: r2(heightAt(bx, bz)), entrance: e.id };
    }
    return out;
  });
  const travel = (R.travel || []).map(t => ({ ...t, y: r2(heightAt(...t.at)) }));
  const waypoint = R.waypoint ? { ...R.waypoint, y: r2(heightAt(...R.waypoint.at)) } : null;

  // the ruin's pillars are props (round colliders, the scatter keeps clear of them); every solid box goes to ground.js
  P.props = P.props || [];
  if (ruin) for (const [x, z] of ruin.pillars) P.props.push({ art: 'ruin-pillar', at: [x, z], facing: 0, r: 0.7, ruin: ruin.id });
  const solidBoxes = [...walls.boxes, ...fences.flatMap(f => f.boxes), ...(ruin?.boxes || []), ...entrances.filter(e => e.box).map(e => e.box)];
  P.boxes = [...(P.boxes || []), ...solidBoxes];
  // heights of the hand placements (the browser and server read y)
  for (const k of ['buildings', 'props', 'objects', 'shrines', 'chests']) for (const p of P[k] || []) if (Array.isArray(p.at)) p.y = r2(heightAt(...p.at));
  const tLayout = now();

  // 3. keep-outs everything below respects: camp spawn spots, quest objects, hand placements
  const campSpots = [];
  for (const [cid, cmp] of Object.entries(R.rules.camps || {})) for (const s of cmp.spawns || []) campSpots.push({ camp: cid, at: [cmp.at[0] + s.at[0], cmp.at[1] + s.at[1]] });
  const storyIds = new Set((G.story || []).map(s => s.id));
  const placed = [];
  for (const b of P.buildings || []) placed.push({ x: b.at[0], z: b.at[1], r: (b.footprint || 6) / 2 + 1.5 });
  for (const k of ['props', 'shrines', 'chests']) for (const p of P[k] || []) placed.push({ x: p.at[0], z: p.at[1], r: (p.r || 0.8) + 1 });
  for (const o of P.objects || []) if (!storyIds.has(o.id)) placed.push({ x: o.at[0], z: o.at[1], r: 2 });
  for (const s of campSpots) placed.push({ x: s.at[0], z: s.at[1], r: 1.6 });
  const nearPlaced = circleIndex(placed);
  const inBox = boxIndex([...P.boxes, ...(W.town?.boxes || [])]);
  const hamlet = T.places[Object.keys(T.places).find(k => T.places[k].kind === 'town')] || null;

  // 4. big dead trees: a few inside the walls, dead woods outside (TREE_SPECIES sizes: 18 m dead pine x 1.1-1.45)
  const DT = G.deadTrees || {};
  const trees = [];
  const treeOk = (x, z, sp, scale, { spacing }) => {
    const trunk = sp.trunk * scale;
    if (!T.inPlay(x, z) || !T.walkable(x, z) || T.slopeAt(x, z) > 25) return false;
    const rd = T.roadAt(x, z, 14);
    if (rd && rd.d < rd.half + trunk + 2.5) return false;
    if (inBox(x, z, trunk + 1.5) || nearPlaced(x, z, trunk + 2)) return false;
    if ((G.keep || []).some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr + trunk + 3)) return false;
    if ((G.story || []).some(s => Math.hypot(x - s.at[0], z - s.at[1]) < 5)) return false;
    if ([...entrances, ...travel].some(e => Math.hypot(x - e.at[0], z - e.at[1]) < 9)) return false;
    if (trees.some(t => Math.hypot(t.x - x, t.z - z) < spacing)) return false;
    return true;
  };
  const addTree = (rng, x, z, art, scale) => {
    const sp = TREE_SPECIES[art];
    trees.push({ art, x: r2(x), z: r2(z), y: r2(heightAt(x, z)), rot: r2(rng() * 6.283), scale: r2(scale), r: r2(sp.trunk * scale), h: r2(sp.h * scale), crown: r2(sp.crown * scale), dead: art === 'dead-tree' });
  };
  {
    const rng = makeRng(hashStr(`${seed}:trees:in`));
    const [s0, s1] = DT.insideScale || [1.1, 1.45];
    for (let tries = 0; tries < 600 && trees.length < (DT.inside || 0); tries++) {
      const x = lerp(rect.minX + 6, rect.maxX - 6, rng()), z = lerp(rect.minZ + 6, rect.maxZ - 6, rng()), scale = lerp(s0, s1, rng());
      if (treeOk(x, z, TREE_SPECIES['dead-tree'], scale, { spacing: DT.spacing || 15 })) addTree(rng, x, z, 'dead-tree', scale);
    }
    const step = DT.outsideStep || 13, [o0, o1] = DT.outsideScale || [1, 1.35], B = T.bounds;
    for (let gx = Math.ceil(B.minX / step) * step; gx < B.maxX; gx += step) for (let gz = Math.ceil(B.minZ / step) * step; gz < B.maxZ; gz += step) {
      const r = makeRng(hashStr(`${seed}:trees:out:${gx}:${gz}`));
      const x = gx + (r() - 0.5) * step * 0.9, z = gz + (r() - 0.5) * step * 0.9;
      if (insideRect(x, z, -8)) continue;
      if (hamlet && Math.hypot(x - hamlet.at[0], z - hamlet.at[1]) < hamlet.radius + (G.hamletClear || 12)) continue;
      if (r() > Math.min(0.9, T.forestAt(x, z) * 1.4 + 0.05)) continue;
      const art = pickW(r, DT.kinds || [['dead-tree', 1]]), sp = TREE_SPECIES[art], scale = lerp(o0, o1, r());
      if (!sp || (P.camps || []).some(cp => Math.hypot(x - cp.at[0], z - cp.at[1]) < (cp.clear || 10) + 6)) continue;
      if (treeOk(x, z, sp, scale, { spacing: 8 })) addTree(r, x, z, art, scale);
    }
  }
  const treeHit = circleIndex(trees.map(t => ({ x: t.x, z: t.z, r: t.r })));
  if (W.town) W.town.trees = [...(W.town.trees || []), ...trees];   // drawn with the rest, trunks solid (ground.js)
  const tTrees = now();

  // 5. spots for roam zones that list none: inside the cemetery on its paths (never among the stones), else open ground
  const roamKeep = [];
  for (const z of P.roam || []) {
    if (z.spots?.length) continue;
    const rng = makeRng(hashStr(`${seed}:roam:${z.id}`)), want = (z.packs || 1) + 2, spots = [];
    for (let tries = 0; tries < 2000 && spots.length < want; tries++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * z.radius, x = z.at[0] + Math.sin(a) * d, zz = z.at[1] + Math.cos(a) * d;
      if (!T.walkable(x, zz) || inBox(x, zz, 1) || treeHit(x, zz, 1.5)) continue;
      if (z.inside === 'graveyard' ? !(insideRect(x, zz, 2) && onPath(x, zz)) : insideRect(x, zz, -2)) continue;
      if (hamlet && Math.hypot(x - hamlet.at[0], zz - hamlet.at[1]) < hamlet.radius + 40) continue;
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - zz) < 10)) continue;
      spots.push([r2(x), r2(zz)]);
    }
    z.spots = spots;
    for (const s of spots) roamKeep.push([s[0], s[1], 1.2]);
  }

  // 6. decor exactly as the client and server grow it (scatter.js through worldScene), so the stones keep off rocks
  const decor = worldScene(W).decor.filter(d => d.solid && insideRect(d.x, d.z, -2));
  const decorHit = circleIndex(decor.map(d => ({ x: d.x, z: d.z, r: d.r })));
  const tDecor = now();

  // 7. the gravestones
  const wallPad = WL.thick / 2 + 0.8;
  const blocked = (x, z) => onPath(x, z) || inBox(x, z, 0.25) || treeHit(x, z, 1.0) || decorHit(x, z, 0.3) || nearPlaced(x, z, 0);
  const GR = planGraves({
    seed, quarters: G.quarters, story: G.story || [], keep: [...(G.keep || []), ...roamKeep],
    heightAt, slopeAt: (x, z) => T.slopeAt(x, z), blocked, inside: (x, z) => insideRect(x, z, wallPad), names, open: G.openGraves,
  });
  P.boxes.push(...GR.boxes.map(({ x, z, hw, hd, facing }) => ({ x, z, hw, hd, facing })));
  if (W.town) W.town.circles = [...(W.town.circles || []), ...GR.circles.map(({ x, z, r }) => ({ x, z, r }))];
  const tGraves = now();

  // 8. small things for the drawing side: crows on tall stones and dead trees, candles on a few graves
  const rc = makeRng(hashStr(`${seed}:crows`));
  const perches = [...GR.stones.filter(s => s.kind === 'angel' || s.kind === 'obelisk' || s.kind.startsWith('mausoleum')), ...trees.filter(t => t.dead && insideRect(t.x, t.z, -20))];
  const crows = [];
  for (const p of rc.shuffle(perches).slice(0, 24)) {
    const tall = p.kind ? { angel: 2.6, obelisk: 3.4, 'mausoleum-small': 4.6, mausoleum: 6.8 }[p.kind] * p.scale : p.h * 0.55;
    crows.push({ at: p.at ? [...p.at] : [p.x, p.z], y: r2((p.y ?? heightAt(p.x, p.z)) + tall), face: r2(rc() * 6.283) });
  }
  const rk = makeRng(hashStr(`${seed}:candles`));
  const candles = GR.stones.filter(s => !s.plot && (s.story || rk() < 0.03)).map(s => { const [x, z] = fromLocal(s.at[0], s.at[1], s.rot, (rk() - 0.5) * 0.4, 0.35); return { at: [r2(x), r2(z)], y: r2(heightAt(x, z)), stone: s.id }; });

  return {
    id: R.id, name: G.name || 'the Old Graveyard', rect, walls, fences, ruin, entrances, travel, waypoint, arrival: R.arrival,
    quarters: G.quarters.map(q => ({ id: q.id, name: q.name, at: q.at, size: q.size, angle: q.angle, levels: q.levels })),
    stones: GR.stones, openGraves: GR.openGraves, graves: GR.graves, byQuarter: GR.byQuarter,
    trees, crows, candles, boxes: [...solidBoxes, ...GR.boxes], circles: GR.circles,
    timings: { layout: r2(tLayout - t0), trees: r2(tTrees - tLayout), decor: r2(tDecor - tTrees), graves: r2(tGraves - tDecor) },
  };
}
