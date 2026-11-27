// Oathwild — the arena as a place (brainstorm 2026-11-27 §2b). Pure: its files are read through js/world/boot.js readJson.
// The arena is its own little map in the world's formats (data/arena/*.json), booted by the same bootWorld, so the
// same terrain, trees, town planner, colliders and drawing code serve it. This file adds the arena itself: from the
// `arena` numbers in data/arena/placements.json it lays out the walls (as solid boxes js/game/ground.js reads — the
// server's walls ARE the drawn walls, lessons rule 22), the gates and where monsters walk out of them, where heroes
// and champions stand, the seats of the crowd, torches, banners and the champions' balcony.
//
//   const W = await bootArena({ regions })     → a world W (data, terrain, book, town) + W.arena (the layout below)
//   arenaLayout(cfg, heightAt)                 → { centre, floor, floorY, gates, heroGate, champGate, heroAt, champAt,
//                                                 boxes, ring, tiers, seats, torches, banners, balcony, chestSpots, board }
//
// Later (owner: "maybe we can just have a teleport take you there"): a stone in Larkford joins this place — nothing
// here knows about the open world.
import { bootWorld, readJson } from './boot.js';
import { normEdits } from './edits.js';

export const ARENA_DATA_FILES = { map: '../../data/arena/map.json', placements: '../../data/arena/placements.json', quests: '../../data/arena/quests.json', npcs: '../../data/arena/npcs.json', towns: '../../data/arena/towns.json' };

export async function loadArenaData(read = readJson) {
  const out = {};
  for (const [k, p] of Object.entries(ARENA_DATA_FILES)) out[k] = await read(new URL(p, import.meta.url));
  out.edits = normEdits(null);
  return out;
}
/** The arena world: bootWorld on the arena's files, then the layout and its wall colliders. */
export async function bootArena({ regions, data = null } = {}) {
  const d = data || await loadArenaData();
  const W = await bootWorld({ regions, data: d });
  W.arena = arenaLayout(W.data.placements.arena, (x, z) => W.terrain.heightAt(x, z));
  W.data.placements.boxes = W.arena.boxes;                 // js/game/ground.js: solid oriented boxes
  W.data.placements.arenaLayout = W.arena;                 // the browser draws the arena from it (render/arena-draw.js)
  W.place = 'arena';
  return W;
}

const at = (c, a, r) => [c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r];
const r2 = v => Math.round(v * 100) / 100;
/** Is angle a inside the gap [mid - half, mid + half]? */
const inGap = (a, mid, half) => { let d = a - mid; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d) < half; };

/**
 * One ring of boxes round the centre at radius r (thickness t), leaving a gap of `gap` metres at angle `gapAt`.
 * Box frame (js/game/ground.js): local x along `facing` = (cos f, -sin f) — at angle a the ring's tangent is
 * (cos a, -sin a), so facing = a lays a box along the ring.
 */
function ring(c, r, t, { gapAt = null, gap = 0, piece = 4 } = {}) {
  const n = Math.max(24, Math.ceil(2 * Math.PI * r / piece));
  const da = 2 * Math.PI / n, half = gap ? (gap / 2) / r : 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + (i + 0.5) * da;
    if (gapAt != null && (inGap(a - da / 2, gapAt, half) || inGap(a + da / 2, gapAt, half) || inGap(a, gapAt, half))) continue;
    const [x, z] = at(c, a, r);
    out.push({ x: r2(x), z: r2(z), hw: r2(r * Math.sin(da / 2) + 0.12), hd: r2(t / 2), facing: r2(a), a: r2(a) });
  }
  return out;
}

export function arenaLayout(cfg, heightAt = () => 0) {
  const c = cfg.centre, floor = cfg.floor, floorY = heightAt(c[0], c[1]);
  const HG = cfg.heroGate, CG = cfg.champGate;
  const inner = ring(c, cfg.wall.r, cfg.wall.thick, { gapAt: HG.angle, gap: HG.width });
  const outer = ring(c, cfg.outer.r, cfg.outer.thick, { gapAt: HG.angle, gap: HG.width, piece: 5 });
  // the Heroes' Gate passage: two walls along the gate's line, from the inner wall out past the outer one
  const passage = [];
  const len = cfg.outer.r - cfg.wall.r + cfg.outer.thick, mid = (cfg.outer.r + cfg.wall.r) / 2;
  for (const s of [-1, 1]) {
    const side = HG.width / 2 + 0.6;
    // the passage runs along the gate's angle (outward = (sin a, cos a)); its side is the tangent (cos a, -sin a)
    const x = c[0] + Math.sin(HG.angle) * mid + Math.cos(HG.angle) * side * s, z = c[1] + Math.cos(HG.angle) * mid - Math.sin(HG.angle) * side * s;
    passage.push({ x: r2(x), z: r2(z), hw: 0.6, hd: r2(len / 2), facing: r2(HG.angle) });
  }
  const gate = (g, kind) => ({ id: g.id, name: g.name, angle: g.angle, kind, at: at(c, g.angle, cfg.wall.r).map(r2), out: at(c, g.angle, cfg.gateOut).map(r2) });
  const gates = cfg.gates.map(g => gate(g, 'monsters'));
  const champGate = gate({ ...CG, id: CG.id }, 'champion');
  const heroGate = gate(HG, 'heroes');
  // seats: rows on the tiers, every ~1.2 m, not over a gate's arch
  const S = cfg.stands, tiers = [];
  const depth = (S.to - S.from) / S.tiers;
  for (let i = 0; i < S.tiers; i++) tiers.push({ r0: r2(S.from + i * depth), r1: r2(S.from + (i + 1) * depth), y: r2(cfg.wall.height + i * S.rise) });
  const gapAngles = [HG, CG, ...cfg.gates].map(g => ({ a: g.angle, half: (g === HG ? HG.width / 2 + 1.5 : cfg.gateWidth / 2 + 0.8) / cfg.wall.r }));
  const seats = [];
  for (const [ti, t] of tiers.entries()) {
    const r = (t.r0 + t.r1) / 2, n = Math.floor(2 * Math.PI * r / 1.25);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI + (k + 0.5) * (2 * Math.PI / n) + (ti % 2) * 0.01;
      if (inGap(a, HG.angle, (HG.width / 2 + 1) / r)) continue;          // the Heroes' Gate passage runs under these tiers
      if (inGap(a, CG.angle, 7 / r) && ti >= S.tiers - 4) continue;      // the balcony stands on the top rows over the Champions' Gate
      const [x, z] = at(c, a, r);
      seats.push({ x: r2(x), z: r2(z), y: r2(floorY + t.y), face: r2(a + Math.PI), tier: ti, hash: ((k * 73856093) ^ (ti * 19349663)) >>> 0 });
    }
  }
  const torches = [];
  for (let i = 0; i < cfg.torches; i++) {
    const a = -Math.PI + (i + 0.5) * 2 * Math.PI / cfg.torches;
    if (gapAngles.some(g => inGap(a, g.a, g.half + 0.03))) continue;
    torches.push({ at: at(c, a, cfg.wall.r - 1.1).map(r2), angle: r2(a) });
  }
  const banners = [];
  for (let i = 0; i < cfg.banners; i++) {
    const a = -Math.PI + (i + 0.5) * 2 * Math.PI / cfg.banners;
    if (inGap(a, HG.angle, 0.12)) continue;
    banners.push({ at: at(c, a, cfg.outer.r - cfg.outer.thick / 2 - 0.2).map(r2), angle: r2(a), colour: i % 3 });
  }
  return {
    centre: c, floor, floorY: r2(floorY), cfg, gates, heroGate, champGate,
    heroAt: at(c, HG.angle, cfg.heroAt).map(r2), champAt: at(c, CG.angle, cfg.champAt).map(r2),
    boxes: [...inner, ...outer, ...passage].map(({ a, ...b }) => b), ring: { inner, outer, passage }, tiers, seats, torches, banners,
    balcony: { at: at(c, CG.angle, S.to - 3).map(r2), angle: CG.angle, y: r2(floorY + cfg.wall.height + (S.tiers - 3) * S.rise) },
    chestSpots: cfg.chestSpots, board: cfg.board,
  };
}

/** Is a point on the sand (inside the floor)? */
export const onFloor = (L, x, z, slack = 0) => Math.hypot(x - L.centre[0], z - L.centre[1]) <= L.floor - 1.5 + slack;
