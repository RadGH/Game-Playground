// Stream E — the FARMER AI (docs/hvf-PLAN.md §10). One think every `reaction` ticks:
//
//   1. danger      a hunter in sight: run along the map away from it (Scamper when it is close), or — the
//                  Commander, in cover, when the hunter is not after it — Lie Low and let it walk past
//   2. home        pick a hidden hollow (Recruit: any; Veteran: the best-scored; Commander: best-scored,
//                  spread from allies, far from kennels, a briar door preferred), walk in (chopping its
//                  door tree when it has one)
//   3. herding     ring the Bell when strays pile up (Recruit at 4, Veteran 2, Commander 1 + a Sheepdog)
//   4. tidy up     pull up watchstones and snares near home when no hunter is around; revive allies
//                  whose grave is not watched
//   5. spend       one purchase per think, gold permitting (cookie clicker): the door hedge, a Farmhouse,
//                  towers once the base has been found, upgrades, the Harvest Hall at the flip, and
//                  producers by payback weighted by how loud they are (the Commander moves from quiet to
//                  loud as walls and towers go up) and by how crowded home already is; when home is full,
//                  chop out a tree that keeps the forest wall intact
//   6. army        crows first (they find and peck out watchstones), scarecrows march on the lodges the
//                  team has seen once the army is worth it (Commander: when the Turn says so)
//
// Every command is checked with the sim's refusal functions first (buildRefusal, castFarmer rules,
// trainRefusal, upgradeCost, a route check), so the AI never sends one the sim would refuse.

import { next, int } from '../../../rng.js';
import { buildRefusal, footprint, priceOf, incomeOf, upgradeCost } from '../farm.js';
import { trainRefusal, armyCount } from '../army.js';
import { canSee } from '../vision.js';
import { turnValues } from '../turn.js';
import { buildReach } from '../commands.js';
import { FARMERS, HUNTERS, entById } from '../state.js';
import { routeBudget, canRoute, d2, dist, live, trailDistance, n8, liveGrid, cellOf, cellX, cellZ, canStand, KIND } from './common.js';
import { WALK_FARMER, WALK_HUNTER } from '../mapgen.js';
import { sin, cos } from '../../../mathx.js';

const PRODUCERS = ['coop', 'pen', 'sty', 'barn', 'hive', 'granary', 'windmill'];
const BUILDABLE = { [KIND.grass]: 1, [KIND.tallgrass]: 1, [KIND.trail]: 1 };

// ── hollows ───────────────────────────────────────────────────────────────────────────────────────

/** Score a hollow for this farmer (higher = better). Public map knowledge only. */
export function hollowScore(ctx, p, h, K) {
  const { state, map } = ctx;
  let s = (h.hidden ?? 0.5) * 10 + Math.min(20, h.offTrail ?? 10) * 0.3;
  if (h.level === 1) s += 2;                                         // a plateau: below can't see up
  let kd = Infinity;
  for (const k of map.kennels) kd = Math.min(kd, dist(h.x, h.z, k.x, k.z));
  s += Math.min(kd, 120) / 12;                                       // far from the kennels
  s -= dist(h.x, h.z, map.commons.x, map.commons.z) / 40;            // not a marathon from the start
  const room = roomOf(map, h);
  if (room.blocks === 0 && room.trees === 0) return -1000;          // no room for even a coop
  s += Math.min(room.blocks, 12) / 2 + Math.min(room.trees, 20) / 10;   // room to build and to grow
  if (K.farm.hiding === 'spread') {
    if (h.entry === 'briar') s += 2;                                 // a door hunters must cut
    for (const pid of state.teams[FARMERS].players) {
      const q = state.players[pid];
      if (q.id === p.id || !q.ai || q.ai.hollow == null) continue;
      const o = map.hollows[q.ai.hollow];
      const dd = dist(o.x, o.z, h.x, h.z);
      if (dd < 50) s -= (50 - dd) / 5;                               // spread: one find must not find two
    }
  }
  return s;
}

/** Static room in a hollow: free 2x2 blocks now, and tree cells around it (to chop out). Cached. */
const ROOM = new WeakMap();
function roomOf(map, h) {
  let r = ROOM.get(h);
  if (r) return r;
  const inH = new Set(h.cells), open = c => inH.has(c) && (map.cells[c] === KIND.grass || map.cells[c] === KIND.tallgrass);
  let blocks = 0, trees = 0;
  for (const c of h.cells) if (open(c) && open(c + 1) && open(c + map.cols) && open(c + map.cols + 1) && (c % map.cols) + 1 < map.cols) blocks++;
  const seen = new Set();
  for (const c of h.cells) for (const j of n8(map, c)) if (!inH.has(j) && !seen.has(j)) { seen.add(j); if (map.cells[j] === KIND.tree && map.level[j] === map.level[c]) trees++; }
  r = { blocks, trees };
  ROOM.set(h, r);
  return r;
}

function taken(ctx, p, id) {
  for (const pid of ctx.state.teams[FARMERS].players) { const q = ctx.state.players[pid]; if (q.id !== p.id && q.ai && (q.ai.hollow === id || (q.ai.homes || []).includes(id))) return true; }
  return false;
}

function pickHollow(ctx, p, K, rng) {
  const { map } = ctx;
  const free = map.hollows.filter(h => !taken(ctx, p, h.id) && h.id !== p.ai.hollow);
  const pool = free.length ? free : map.hollows;
  if (K.farm.hiding === 'random') return pool[int(rng, pool.length)].id;
  let best = null, bs = -Infinity;
  for (const h of pool) { const s = hollowScore(ctx, p, h, K); if (s > bs || (s === bs && h.id < best.id)) { bs = s; best = h; } }
  return best.id;
}

// ── the base area: the hollow's cells + what this farmer chopped out of the wall around it ────────

function areaOf(ctx, p) {
  const { map } = ctx;
  const cells = new Set();
  for (const c of map.hollows[p.ai.hollow].cells) cells.add(c);   // the hollow it is building in now
  for (const c of p.ai.cleared) cells.add(c);
  return cells;
}
const centreOf = (ctx, p) => { const h = ctx.map.hollows[p.ai.hollow]; return { x: h.x, z: h.z }; };

/** Free cells of the area (farmer footing, no building). */
function freeCells(ctx, area) {
  const g = liveGrid(ctx), out = [];
  for (const c of area) if (WALK_FARMER[g.cells[c]] && g.occ[c] === 0) out.push(c);
  return out;
}

/** Cells just outside the area a hunter could walk in by (the door to plug with a hedge). */
function gateCells(ctx, area) {
  const { map } = ctx, g = liveGrid(ctx), out = [];
  const seen = new Set();
  for (const c of area) for (const j of n8(map, c)) {
    if (area.has(j) || seen.has(j)) continue;
    seen.add(j);
    if (WALK_HUNTER[g.cells[j]] && g.occ[j] === 0) out.push(j);
  }
  return out;
}

/** Where home meets the world: the first trail cell a farmer walks to from the hollow (static; cached). */
const ANCHOR = new WeakMap();
function anchorOf(map, h) {
  if (ANCHOR.has(h)) return ANCHOR.get(h);
  const start = cellOf(map, h.x, h.z), seen = new Set([start]), q = [start];
  let found = h.mouth ? h.mouth.cell : -1;
  for (let k = 0; k < q.length && found < 0 && k < 6000; k++) {
    const c = q[k];
    if (map.cells[c] === KIND.trail) { found = c; break; }
    for (const j of n8(map, c)) if (!seen.has(j) && WALK_FARMER[map.cells[j]]) { seen.add(j); q.push(j); }
  }
  ANCHOR.set(h, found);
  return found;
}

/**
 * If `block` cells were built on, could the farmer still walk from the world (the trail by home) to every
 * free cell of home, and to where he stands now? (Buildings block him; his own hedges do not.)
 */
function staysOpen(ctx, area, block, h, me) {
  const { map } = ctx, g = liveGrid(ctx);
  const blocked = new Set(block);
  const free = [...area].filter(c => !blocked.has(c) && WALK_FARMER[g.cells[c]] && g.occ[c] !== 1);
  if (free.length < 3) return false;
  const seen = reachable(ctx, area, blocked, h);
  if (!seen) return false;
  if (me) { const mc = cellOf(map, me.x, me.z); if (area.has(mc) && !blocked.has(mc) && WALK_FARMER[g.cells[mc]] && g.occ[mc] !== 1 && !seen.has(mc)) return false; }   // (standing on the footprint is fine: placing it moves him aside)
  let lost = 0;
  for (const c of free) if (!seen.has(c)) lost++;
  return lost <= 1;   // one walled-off corner cell is an acceptable price for a building
}

/** Cells of the box around home a farmer can walk to from the world, with `blocked` cells built on. */
function reachable(ctx, area, blocked, h) {
  const { map } = ctx, g = liveGrid(ctx);
  const anchor = anchorOf(map, h);
  const cx = Math.floor(h.x / map.cell), cz = Math.floor(h.z / map.cell), R = 16;
  const ok = c => { const x = c % map.cols, z = (c / map.cols) | 0; return Math.abs(x - cx) <= R && Math.abs(z - cz) <= R && !blocked.has(c) && WALK_FARMER[g.cells[c]] && g.occ[c] !== 1; };
  let starts = anchor >= 0 && ok(anchor) ? [anchor] : [];
  if (!starts.length) {
    // no trail within the box: fall back to the area's own entrances
    starts = [...area].filter(c => ok(c) && n8(map, c).some(j => !area.has(j) && ok(j)));
    if (!starts.length) return null;
  }
  const seen = new Set(starts), q = starts.slice();
  for (let k = 0; k < q.length; k++) {
    const c = q[k], x = c % map.cols;
    for (const j of [c + 1, c - 1, c + map.cols, c - map.cols]) {
      if (j < 0 || j >= g.cells.length || seen.has(j) || !ok(j)) continue;
      if ((j === c + 1 && x === map.cols - 1) || (j === c - 1 && x === 0)) continue;
      seen.add(j); q.push(j);
    }
  }
  return seen;
}

/** A spot for `kind`: inside the base area (mode 'base') or on open ground near it ('near'). */
function findSpot(ctx, p, kind, mode = 'base', careless = false) {
  const { state, data, map } = ctx;
  const me = entById(state, p.ent);
  const def = data.hvf.buildings.kinds[kind];
  const area = areaOf(ctx, p);
  const rich = { ...p, gold: 1e12 };
  const h = map.hollows[p.ai.hollow];
  const mouth = h.mouth || { x: h.x, z: h.z };
  const td = trailDistance(map);
  const g = liveGrid(ctx);
  let cands;
  if (mode === 'base') cands = [...area];
  else {
    cands = [];
    const R = Math.ceil((careless ? 40 : 28) / map.cell), cx = Math.floor(h.x / map.cell), cz = Math.floor(h.z / map.cell);
    // nearest first (distance buckets: no engine sort), so the candidate cap below keeps the closest
    const buckets = [];
    for (let dz = -R; dz <= R; dz += 1) for (let dx = -R; dx <= R; dx += 1) {
      const x = cx + dx, z = cz + dz;
      if (x < 1 || z < 1 || x >= map.cols - 1 || z >= map.rows - 1) continue;
      const c = z * map.cols + x;
      if (g.cells[c] === KIND.grass || g.cells[c] === KIND.tallgrass || (careless && g.cells[c] === KIND.trail)) if (careless || td[c] >= 2 || area.has(c)) {
        const b = Math.floor(Math.sqrt(dx * dx + dz * dz));
        (buckets[b] || (buckets[b] = [])).push(c);
      }
    }
    for (const b of buckets) if (b) for (const c of b) cands.push(c);
  }
  const ok = [];
  for (const c of cands) {
    const x = cellX(map, c) + (def.size[0] % 2 ? 0 : map.cell / 2), z = cellZ(map, c) + (def.size[1] % 2 ? 0 : map.cell / 2);
    const fp = footprint(map, def, x, z);
    // the cheap grid test first (buildRefusal walks every entity)
    if (!fp || fp.cells.some(f => !BUILDABLE[g.cells[f]] || g.occ[f] !== 0 || map.level[f] !== map.level[fp.cells[0]])) continue;
    if (mode === 'near' && ok.length > 120) break;
    if (buildRefusal(ctx, rich, kind, x, z)) continue;
    if (mode === 'base' && !fp.cells.every(f => area.has(f))) continue;
    if (mode === 'near' && !careless && fp.cells.some(f => td[f] < 2)) continue;   // never on a trail's shoulder (a careless farmer does not mind)
    const s = mode === 'near' ? -d2(fp.x, fp.z, me ? me.x : h.x, me ? me.z : h.z) : d2(fp.x, fp.z, mouth.x, mouth.z);
    ok.push({ c, x, z, fp, s });
  }
  // best first; outside home only a spot a SHORT walk from home counts (a straight-line neighbour can be
  // the far side of a tree wall)
  for (let i = 1; i < ok.length; i++) for (let j = i; j > 0 && (ok[j].s > ok[j - 1].s || (ok[j].s === ok[j - 1].s && ok[j].c < ok[j - 1].c)); j--) { const t = ok[j]; ok[j] = ok[j - 1]; ok[j - 1] = t; }
  // the connectivity check is the expensive part: only on the best few
  let tries = 0;
  if (mode === 'base') {
    for (let k = 0; k < ok.length && tries < 6; k++) { tries++; if (staysOpen(ctx, area, ok[k].fp.cells, h, me)) return ok[k]; }
    return null;
  }
  // the shortest WALK among the best few (straight-line neighbours are often behind a tree wall)
  const limit = careless ? 40 : 16;
  let best = null, bl = Infinity, tried = 0;
  for (let k = 0; k < ok.length && tries < 24 && tried < 10; k++) {
    tries++;
    if (!staysOpen(ctx, area, ok[k].fp.cells, h, me)) continue;
    tried++;
    const path = canRoute(ctx, me || { kind: 'farmer', x: h.x, z: h.z }, cellOf(map, ok[k].fp.x - 0.01, ok[k].fp.z - 0.01), true, false, limit * limit * 2);
    if (path && path.length <= limit && path.length < bl) { bl = path.length; best = ok[k]; }
  }
  return best;
}

/** A tree to chop out of the wall: grows home without opening it to the trail. */
function expansionTree(ctx, p) {
  const { map } = ctx;
  const area = areaOf(ctx, p), g = liveGrid(ctx), td = trailDistance(map);
  const h = map.hollows[p.ai.hollow], mouth = h.mouth || h;
  const lvl = map.level[h.cells[0]];
  let best = null, bs = -Infinity;
  const seen = new Set();
  const reach = reachable(ctx, area, new Set(), h) || new Set();
  for (const c of area) if (reach.has(c)) for (const j of [c + 1, c - 1, c + map.cols, c - map.cols]) {   // next to ground he can REACH
    if (j < 0 || j >= g.cells.length || seen.has(j) || area.has(j)) continue;
    seen.add(j);
    if (g.cells[j] !== KIND.tree || map.level[j] !== lvl || td[j] < 2) continue;
    // the wall stays shut: nothing a hunter can stand on touches the cell from outside
    if (n8(map, j).some(k => !area.has(k) && WALK_HUNTER[g.cells[k]] && g.occ[k] === 0)) continue;
    // room for a building: every 2x2 block the cut would complete counts a lot
    let blocks = 0;
    for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const b0 = j + ox + oz * map.cols, four = [b0, b0 + 1, b0 + map.cols, b0 + map.cols + 1];
      if (four.every(k => k === j || (area.has(k) && WALK_FARMER[g.cells[k]] && g.occ[k] === 0))) blocks++;
    }
    // grow as a compact blob (room for 2x2 and 3x3 footprints), a little away from the door
    const s = blocks * 400 + Math.sqrt(d2(cellX(map, j), cellZ(map, j), mouth.x, mouth.z)) * 2 - Math.sqrt(d2(cellX(map, j), cellZ(map, j), h.x, h.z)) * 12;
    if (s > bs || (s === bs && j < best)) { bs = s; best = j; }
  }
  return best;
}

/** Cover for Lie Low (same rule as units.js): tall grass, or a tree next to the cell. */
function coverAt(ctx, e) {
  const { map } = ctx, g = liveGrid(ctx), c = cellOf(map, e.x, e.z);
  if (g.cells[c] === KIND.tallgrass) return true;
  const x = c % map.cols;
  for (const j of [x + 1 < map.cols ? c + 1 : -1, x > 0 ? c - 1 : -1, c + map.cols, c - map.cols]) if (j >= 0 && j < g.cells.length && g.cells[j] === KIND.tree) return true;
  return false;
}

// ── danger ────────────────────────────────────────────────────────────────────────────────────────

function visibleHunters(ctx) {
  const out = [];
  for (const e of ctx.state.ents) if (e.kind === 'hunter' && live(e) && canSee(ctx, FARMERS, e)) out.push(e);
  return out;
}

function fleeTarget(ctx, p, me, hunter) {
  const { map } = ctx;
  const pts = map.graph.nodes.map(n => ({ x: n.x, z: n.z })).concat(map.hollows.map(h => ({ x: h.x, z: h.z })));
  let best = null, bs = -Infinity;
  const hd = dist(me.x, me.z, hunter.x, hunter.z);
  for (const t of pts) {
    const away = dist(t.x, t.z, hunter.x, hunter.z), mine = dist(t.x, t.z, me.x, me.z);
    if (away <= hd + 4 || mine < 8 || mine > 70) continue;
    // run AWAY: the hunter must be further from the spot than I am, by a margin
    if (away < mine + 6) continue;
    const s = away - 0.5 * mine;
    if (s > bs) { bs = s; best = t; }
  }
  if (best) return best;
  // nowhere on the map to run to (a corner): any open ground 20 m away from the hunter's side
  for (let k = 0; k < 16; k++) {
    const a = k * 0.3927, x = me.x + sin(a) * 20, z = me.z + cos(a) * 20;
    if (x < 2 || z < 2 || x > map.size - 2 || z > map.size - 2) continue;
    const s = dist(x, z, hunter.x, hunter.z);
    if (s > hd + 8 && s > bs) { bs = s; best = { x, z }; }
  }
  return best;
}

// ── the think ─────────────────────────────────────────────────────────────────────────────────────

export function farmerThink(ctx, p, K, rng, cmd) {
  const { state, data, map } = ctx;
  const m = p.ai;
  const me = entById(state, p.ent);
  if (!me || !me.alive || p.ghost) return;
  const F = K.farm;
  const route = (type, args, goal, near, closest) => {
    if (args.x != null) { args.x = Math.max(1, Math.min(map.size - 1, args.x)); args.z = Math.max(1, Math.min(map.size - 1, args.z)); goal = cellOf(map, args.x, args.z); }
    // a route that just failed is not searched again for five seconds (a failed search walks the
    // whole map; doing that every think is most of the AI's cost)
    const key = type + ':' + goal;
    if (m.fail && m.fail[key] > state.tick) return false;
    if (!routeBudget(state)) { m.retry = true; return false; }
    if (!canRoute(ctx, me, goal, near, closest)) {
      if (!m.fail || Object.keys(m.fail).length > 24) m.fail = {};
      m.fail[key] = state.tick + 100;
      return false;
    }
    cmd(type, args); return true;
  };
  const busy = me.ord && me.ord.k !== 'idle' && me.ord.k !== 'move';

  // ── 1. danger ──
  const hunters = visibleHunters(ctx);
  let near = null, nd = Infinity;
  for (const h of hunters) { const dd = dist(me.x, me.z, h.x, h.z); if (dd < nd) { nd = dd; near = h; } }
  if (near) {
    m.seenHunter = { x: near.x, z: near.z, tick: state.tick };
    if (m.hollow != null) { const c = centreOf(ctx, p); if (dist(near.x, near.z, c.x, c.z) < 24) m.found = state.tick; }
  }
  // behind my own hedges / walls a hunter cannot walk to me: running out into the open is worse than
  // staying put (Veteran+ check whether the hunter could actually reach them first)
  let reachable = true;
  if (near && nd < F.fleeAt && F.door && nd > 4) {
    // (asked at most once a second: the answer only changes when a hedge falls)
    if (!m.safe || state.tick - m.safe.at >= 20 || m.safe.id !== near.id) {
      const path = canRoute(ctx, near, cellOf(map, me.x, me.z), true, false, 4000);
      m.safe = { at: state.tick, id: near.id, ok: !!path && path.length < 60 };
    }
    reachable = m.safe.ok;
  }
  if (near && nd < F.fleeAt && reachable) {
    const after = near.ord && near.ord.k === 'attack' && near.ord.target === me.id;
    // Commander: in cover, not chased, a little way off -> lie low and let it pass
    if (me.low && !after && nd > 3.5) return;   // lying low (or settling into it): stay down
    if (F.lieLow && !after && nd > 7 && coverAt(ctx, me) && state.tick >= (p.cd.W || 0)) { cmd('cast', { slot: 'W' }); m.flee = null; return; }
    if (nd < 10 && state.tick >= (p.cd.Q || 0)) cmd('cast', { slot: 'Q' });
    if (!m.flee || state.tick >= m.flee.until || d2(me.x, me.z, m.flee.x, m.flee.z) < 9) {
      let t = null;
      // a walled home is a refuge: if the hunter cannot walk into it and I can get there first, run home
      if (F.door && m.hollow != null) {
        const hh = map.hollows[m.hollow];
        const myD = dist(me.x, me.z, hh.x, hh.z), hisD = dist(near.x, near.z, hh.x, hh.z);
        if (myD > 3 && myD < hisD && !canRoute(ctx, near, cellOf(map, hh.x, hh.z), true, false, 4000)) t = { x: hh.x, z: hh.z };
      }
      if (!t) t = fleeTarget(ctx, p, me, near);
      if (t && route('move', { x: t.x, z: t.z }, cellOf(map, t.x, t.z), false, true)) m.flee = { x: t.x, z: t.z, until: state.tick + 160 };
    }
    return;
  }
  if (m.flee && state.tick < m.flee.until && near) return;
  m.flee = null;
  if (me.low && near) return;   // still hidden with a hunter in sight: do not stand up

  // ── 2. home ──
  if (m.hollow == null) m.hollow = pickHollow(ctx, p, K, rng);
  const h = map.hollows[m.hollow];
  const g = liveGrid(ctx);
  const area = areaOf(ctx, p);
  // home = the free cell of the area nearest its centre; "in" = standing on the area
  let homeCell = -1, hd2 = Infinity;
  for (const c of area) if (WALK_FARMER[g.cells[c]] && g.occ[c] === 0) { const dd = d2(cellX(map, c), cellZ(map, c), h.x, h.z); if (dd < hd2 || (dd === hd2 && c < homeCell)) { hd2 = dd; homeCell = c; } }
  if (homeCell < 0) homeCell = cellOf(map, h.x, h.z);
  const inHome = area.has(cellOf(map, me.x, me.z));
  if (!m.arrived) {
    if (inHome) m.arrived = true;
    else {
      if (me.ord.k === 'move' && me.ord.path && me.ord.i < me.ord.path.length) return;
      if (me.ord.k === 'chop') return;
      // a door tree: walk to it and cut it
      // (a tree-door hollow's door IS its only way in — mapgen — so no whole-map search to find that out)
      if (h.entry === 'tree' && h.door >= 0 && g.cells[h.door] === KIND.tree) { route('chop', { cell: h.door }, h.door, true, false); return; }
      if (!route('move', { x: cellX(map, homeCell), z: cellZ(map, homeCell) }, homeCell, false, false) && !m.retry) { m.hollow = pickHollow(ctx, p, K, rng); }
      return;
    }
  }

  // ── 3. herding ──
  let strays = 0, animals = 0;
  for (const a of state.ents) if (a.kind === 'animal' && a.owner === p.id && live(a)) { animals++; if (a.stray) strays++; }
  if (strays >= F.bellAt && state.tick >= (p.cd.E || 0) && dist(me.x, me.z, h.x, h.z) < 20) { cmd('cast', { slot: 'E' }); return; }

  if (busy) return;   // building, chopping, reviving, pulling: let it finish

  // ── 4. tidy up ──
  if (!near) {
    for (const w of state.ents) {
      if ((w.kind !== 'ward' && w.kind !== 'snare') || !live(w) || !canSee(ctx, FARMERS, w)) continue;
      if (dist(w.x, w.z, h.x, h.z) > F.pullRange) continue;
      if (route('pullup', { target: w.id }, cellOf(map, w.x, w.z), true, false)) return;
    }
    for (const gr of state.hvf.graves) {
      if (gr.pid === p.id || dist(gr.x, gr.z, me.x, me.z) > F.reviveRange) continue;
      if (m.seenHunter && state.tick - m.seenHunter.tick < 200 && dist(m.seenHunter.x, m.seenHunter.z, gr.x, gr.z) < F.graveWatch) continue;   // camped
      if (route('revive', { target: gr.pid }, cellOf(map, gr.x, gr.z), true, false)) return;
    }
  }

  // ── 5. spend (an economic look once a second is plenty) ──
  if (state.tick >= (m.spendAt || 0)) {
    m.spendAt = state.tick + 20;
    if (spend(ctx, p, K, rng, me, cmd, route, animals)) return;
    if (!m.retry) m.spendAt = state.tick + 60;   // nothing to do: look again in three seconds
  }

  // ── 6. army ──
  army(ctx, p, K, cmd);

  // ── back home when idle away from it ──
  if (me.ord.k === 'idle' && !inHome) route('move', { x: cellX(map, homeCell), z: cellZ(map, homeCell) }, homeCell, false, false);
}

/** One purchase (or one chop) per think. Returns true when it issued a command. */
function spend(ctx, p, K, rng, me, cmd, route, animals) {
  const { state, data, map } = ctx;
  const m = p.ai, F = K.farm, B = data.hvf.buildings;
  const T = state.tick / 20;
  const area = areaOf(ctx, p);
  const mine = {};
  for (const e of state.ents) if (e.kind === 'building' && e.owner === p.id && live(e)) mine[e.type] = (mine[e.type] || 0) + 1;
  const producers = PRODUCERS.filter(k => B.kinds[k].makes).reduce((s, k) => s + (mine[k] || 0), 0);
  const inc = incomeOf(ctx, p).total;
  const build = (kind, spot) => {
    const price = priceOf(data, p, kind);
    if (p.gold < price || !spot) return false;
    if (buildRefusal(ctx, p, kind, spot.x, spot.z)) return false;
    const reach = buildReach(ctx, B.kinds[kind]);
    if (d2(me.x, me.z, spot.fp.x, spot.fp.z) > reach * reach && !canRoute(ctx, me, cellOf(map, spot.fp.x - 0.01, spot.fp.z - 0.01), true, false)) return false;
    if (!routeBudget(state)) { m.retry = true; return false; }
    cmd('build', { kind, x: spot.x, z: spot.z });
    return true;
  };

  // the door: a briar hedge in every gap a hunter could walk in by (Veteran / Commander, after the first producer)
  if (F.door && producers >= 1) {
    for (const c of gateCells(ctx, area)) {
      if (p.gold < priceOf(data, p, 'hedge')) break;
      const x = cellX(map, c), z = cellZ(map, c);
      if (!BUILDABLE[liveGrid(ctx).cells[c]]) continue;
      if (build('hedge', { x, z, fp: footprint(map, B.kinds.hedge, x, z) })) return true;
    }
  }
  // found: towers by the door (Veteran 1, Commander 2), a lookout
  const found = m.found != null && state.tick - m.found < 20 * 240;
  if (found || (F.towersAlways && producers >= 4)) {
    if ((mine.tower || 0) < F.towers && p.gold >= priceOf(data, p, 'tower')) { if (build('tower', findSpot(ctx, p, 'tower'))) return true; }
  }
  if (F.farmhouseAt >= 0 && producers >= F.farmhouseAt && !mine.farmhouse && p.gold >= priceOf(data, p, 'farmhouse')) { if (build('farmhouse', findSpot(ctx, p, 'farmhouse', 'base') || findSpot(ctx, p, 'farmhouse', 'near'))) return true; }
  if (F.sheepdog && animals >= 6 && !mine.sheepdog && p.gold >= priceOf(data, p, 'sheepdog')) { if (build('sheepdog', findSpot(ctx, p, 'sheepdog'))) return true; }

  // the flip: a Harvest Hall
  if (!mine.hall && producers >= B.kinds.hall.needsProducers && wantsFlip(ctx, p, K, inc, T)) {
    if (p.gold >= priceOf(data, p, 'hall')) { if (build('hall', findSpot(ctx, p, 'hall', 'base') || findSpot(ctx, p, 'hall', 'near'))) return true; }
    else if (F.flip !== 'rarely') return false;   // save for it
  }
  if (mine.hall && trainArmy(ctx, p, K, cmd)) return true;

  // upgrades (no walking needed)
  const animalInc = incomeOf(ctx, p).animals;
  const ups = [];
  const uc = id => upgradeCost(data, p, id);
  if (uc('breeding') != null && producers >= 4) ups.push({ id: 'breeding', v: 0.3 * animalInc / uc('breeding') });
  if (uc('feed') != null) ups.push({ id: 'feed', v: B.upgrades.feed.animalIncomePct * animalInc / uc('feed') });
  if (uc('shears') != null && (mine.pen || 0) >= 2) ups.push({ id: 'shears', v: 0.5 * 0.88 * (mine.pen || 0) / uc('shears') });
  if (mine.hall && uc('stuffing') != null && armyCount(state, p.id) >= 2) ups.push({ id: 'stuffing', v: 0.004 });

  // producers by payback, weighted by how loud they are and how crowded home is
  const free = freeCells(ctx, area).length;
  const loud = Math.max(0, F.tellWeight - F.towerQuiet * (mine.tower || 0) - (mine.hedge ? F.hedgeQuiet : 0));
  const R = Math.max(60, state.hvf.endTick / 20 - T);
  const rows = [];
  for (const kind of PRODUCERS) {
    const d = B.kinds[kind], cost = priceOf(data, p, kind);
    let income;
    if (d.makes) {
      income = data.hvf.animals.kinds[d.makes].income * d.cap * (1 + (p.upgrades.feed || 0) * B.upgrades.feed.animalIncomePct);
      if (d.makes === 'sheep' && p.upgrades.shears) income *= 1 + B.upgrades.shears.sheepPct;
    } else if (d.flat) income = d.flat;
    else income = (d.incomePct || 0) * inc;
    if (!(income > 0)) continue;
    if (cost / income > R * 0.9) continue;                       // will not pay back before the clock
    let v = income / cost * (1 - loud * d.tell);
    // crowding: animals per free cell after this building. Over the line the producer still wins, but
    // home has to grow first (chop) — a careless farmer packs it in and the flock spills onto the trail
    let crowd = 0;
    if (d.makes && F.crowd > 0) crowd = (animals + d.cap) * F.crowd / Math.max(1, free - d.size[0] * d.size[1]);
    if (d.tall && F.tellWeight > 0) v *= 0.5;
    v *= 1 + F.noise * next(ctx.state.players[p.id].ai.rng);
    rows.push({ kind, v, cost, crowd });
  }
  // cookie clicker with a clock: rank by the time until the purchase has paid for itself, counting the
  // wait to afford it (a pen four minutes away loses to a coop affordable now)
  const cands = rows.concat(ups.map(u => ({ kind: '#' + u.id, v: u.v, cost: uc(u.id), crowd: 0 }))).filter(r => r.v > 0);
  for (const r of cands) {
    const wait = Math.max(0, r.cost - p.gold) / Math.max(0.05, inc);
    r.score = 1 / (wait + 1 / r.v);
  }
  for (let i = 1; i < cands.length; i++) for (let j = i; j > 0 && (cands[j].score > cands[j - 1].score || (cands[j].score === cands[j - 1].score && cands[j].kind < cands[j - 1].kind)); j--) { const t = cands[j]; cands[j] = cands[j - 1]; cands[j - 1] = t; }
  let chopped = false;
  for (const pick of cands.slice(0, 4)) {
    // home too crowded for it: make room first (a chop is free and pays 2 g)
    if (pick.crowd > 1 && F.expand && !chopped) {
      const t = expansionTree(ctx, p);
      chopped = true;
      if (t != null && route('chop', { cell: t }, t, true, false)) { m.cleared.push(t); return true; }
    }
    if (pick.kind[0] === '#') { if (p.gold >= pick.cost) { cmd('upgrade', { id: pick.kind.slice(1) }); return true; } m.why = 'saveUp:' + pick.kind; return false; }
    // a careless farmer sprawls: the open ground around home first (trails included), home second
    let spot = F.sprawl ? findSpot(ctx, p, pick.kind, 'near', true) || findSpot(ctx, p, pick.kind, 'base')
      : findSpot(ctx, p, pick.kind, 'base') || (F.spillOut ? findSpot(ctx, p, pick.kind, 'near', true) : null);
    if (!spot && F.expand && !chopped) {
      // home is full: chop out a tree that keeps the wall shut
      const t = expansionTree(ctx, p);
      chopped = true;
      if (t != null && route('chop', { cell: t }, t, true, false)) { m.cleared.push(t); return true; }
    }
    // this hollow is full (or never had room): move on to another (one find must not find everything)
    const stuck = !spot && (chopped || !F.expand) && !m.retry;
    if (!spot && stuck && (F.second || producers === 0) && (m.homes || []).length < (F.maxHollows || 2) - 1 + (producers === 0 ? 1 : 0)) {
      const pool = map.hollows.filter(o => o.id !== m.hollow && !(m.homes || []).includes(o.id) && !taken(ctx, p, o.id) && dist(o.x, o.z, map.hollows[m.hollow].x, map.hollows[m.hollow].z) < 150);
      let b = null;
      for (const o of pool) if (hollowScore(ctx, p, o, K) > -100 && (!b || hollowScore(ctx, p, o, K) > hollowScore(ctx, p, b, K))) b = o;
      if (b) { m.homes = (m.homes || []).concat([m.hollow]); m.hollow2 = m.hollow; m.hollow = b.id; m.cleared = []; m.arrived = false; return false; }
    }
    if (!spot && !F.spillOut) spot = findSpot(ctx, p, pick.kind, 'near');
    if (!spot) { m.why = 'nospot:' + pick.kind; continue; }   // nowhere for this one: the next best
    if (p.gold < pick.cost) { m.why = 'save:' + pick.kind; return false; }   // save for it
    if (build(pick.kind, spot)) return true;
    m.why = 'buildfail:' + pick.kind;
  }
  return false;
}

/** Is it time to build a Harvest Hall? */
function wantsFlip(ctx, p, K, inc, T) {
  const F = K.farm;
  if (F.flip === 'rarely') return p.gold >= 2400 && T > 900;
  if (F.flip === 'income') return inc >= 5 && T > 480;
  // 'turn': once income can keep an army coming faster than the hunters grow
  const v = turnValues(ctx);
  return inc >= 4.5 && T > 360 && inc * 120 > v.hunt * 0.4;
}

function trainArmy(ctx, p, K, cmd) {
  const { state, data } = ctx;
  const hall = state.ents.find(e => e.kind === 'building' && e.type === 'hall' && e.owner === p.id && live(e));
  if (!hall) return false;
  let crows = 0, scare = 0;
  for (const u of state.ents) if (u.kind === 'army' && u.owner === p.id && live(u)) { if (u.type === 'crow') crows++; else scare++; }
  const A = data.hvf.units.army;
  const want = K.farm.crowsFirst && crows < A.crow.flock ? 'crow' : 'scarecrow';
  if (p.gold < A[want].cost + (K.farm.flip === 'turn' ? 0 : 0)) return false;
  if (trainRefusal(ctx, p, want, hall.id)) return false;
  cmd('train', { unit: want, building: hall.id });
  return true;
}

/** Army orders: crows patrol home and peck out watchstones; scarecrows march on known lodges. */
function army(ctx, p, K, cmd) {
  const { state, map } = ctx;
  const units = state.ents.filter(u => u.kind === 'army' && u.owner === p.id && live(u));
  if (!units.length) return;
  const h = map.hollows[p.ai.hollow];
  const idle = units.filter(u => u.ord.k === 'idle');
  const crows = idle.filter(u => u.type === 'crow'), scare = units.filter(u => u.type === 'scarecrow'), idleScare = idle.filter(u => u.type === 'scarecrow');
  if (crows.length) {
    // patrol: the trail junction nearest home that is not where they stand
    const nodes = map.graph.nodes.filter(n => dist(n.x, n.z, h.x, h.z) < 60);
    if (nodes.length) { const n = nodes[(state.tick / 20 | 0) % nodes.length]; cmd('order', { ids: crows.map(u => u.id), kind: 'amove', x: n.x, z: n.z }); }
  }
  if (!idleScare.length) return;
  // targets: lodges and kennels the team has seen (kennels stand where the map says)
  const targets = state.hvf.seen[FARMERS].filter(b => b.kind === 'lodge' || b.kind === 'kennel').map(b => ({ x: b.x, z: b.z }));
  for (const k of map.kennels) if (!targets.some(t => d2(t.x, t.z, k.x, k.z) < 25)) targets.push({ x: k.x, z: k.z });
  let go = false;
  if (K.farm.flip === 'turn') go = state.hvf.turn > 0.1 && scare.length >= 3;
  else if (K.farm.flip === 'income') go = scare.length >= 3;
  else go = true;
  if (!go) { cmd('order', { ids: idleScare.map(u => u.id), kind: 'amove', x: h.x, z: h.z }); return; }
  let best = null, bd = Infinity;
  const cx = idleScare[0].x, cz = idleScare[0].z;
  for (const t of targets) { const dd = d2(cx, cz, t.x, t.z); if (dd < bd) { bd = dd; best = t; } }
  if (best) cmd('order', { ids: idleScare.map(u => u.id), kind: 'amove', x: best.x, z: best.z });
}

export { PRODUCERS, findSpot, staysOpen, gateCells, areaOf, expansionTree };
