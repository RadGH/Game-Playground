// Towns, buildings, people, jobs and growth. PURE (runs in the worker and in node tests).
//
// The game plays itself (PLAN §0.1): people pick their own work, the town plans its own houses and
// workplaces, migrants arrive when the town is doing well, and paths wear into the ground where
// people walk. The player founds the keep, lays roads and places anything they want on purpose.
//
// Nothing teleports (§0.2): a good is in the KINGDOM STOCK only while it sits in a storage building
// (keep or warehouse). A woodcutter's logs are its own pile until a hauler carries them home; a
// building site gets its materials when a builder carries them there.
//
// State lives in sim.state.town (plain JSON, saved as-is):
//   towns:     [{ id, name, x, y, keep }]
//   buildings: [{ id, kind, town, x, y, w, h, state: 'site'|'up', work, need, got, store, workers }]
//   people:    [{ id, town, x, y, home, job, task, carry, hunger }]

import { cells as blueprint, door } from './blueprints.js';
import { createNav } from './nav.js';
import { BURN } from '../cells.js';

const SPEED = 0.1;      // cells per tick on plain ground (2 m/s at 20 ticks a second)

export function createTown(sim, data) {
  const { M } = sim;
  const KINDS = data.kinds, CFG = data.town;
  const nav = createNav(sim);
  const S = sim.state.town ??= { towns: [], buildings: [], people: [], nextId: 1, gold: data.start.gold, log: [] };
  S.roads ??= [];          // every road laid, as straight runs [x0, y0, x1, y1, tier] — drawn when zoomed out
  S.wagons ??= [];         // settler wagons on their way to found a town
  const byId = new Map();
  const reindex = () => { byId.clear(); for (const b of S.buildings) byId.set(b.id, b); };
  reindex();
  const rng = sim.rng;
  const W = sim.W;
  const dist = (ax, ay, bx, by) => { let dx = Math.abs(ax - bx); if (dx > W / 2) dx = W - dx; return Math.hypot(dx, ay - by); };
  const wrapX = x => ((x % W) + W) % W;
  const say = (text, kind = 'info', x, y) => { sim.events.push({ t: 'say', text, kind, x, y }); };

  // ------------------------------------------------------------------ stock
  const isStore = b => b.state === 'up' && KINDS[b.kind].kingdom;
  function stock(townId = null) {
    const out = {};
    for (const b of S.buildings) if (isStore(b) && (townId == null || b.town === townId)) for (const [g, n] of Object.entries(b.store)) out[g] = (out[g] || 0) + n;
    return out;
  }
  const storeUsed = b => Object.values(b.store).reduce((a, n) => a + n, 0);
  const storeRoom = b => (KINDS[b.kind].storage || 0) - storeUsed(b);
  const foodGoods = Object.keys(data.goods).filter(g => data.goods[g].food);
  function foodTotal(townId) { const s = stock(townId); return foodGoods.reduce((a, g) => a + (s[g] || 0), 0); }
  /** Take n of a good from the kingdom stock (any storage, nearest first if a point is given). */
  function takeStock(good, n, x, y) {
    const list = S.buildings.filter(b => isStore(b) && (b.store[good] || 0) > 0);
    if (x != null) list.sort((a, b) => dist(x, y, a.x, a.y) - dist(x, y, b.x, b.y));
    let got = 0;
    for (const b of list) { const k = Math.min(n - got, b.store[good]); b.store[good] -= k; got += k; if (got >= n) break; }
    return got;
  }

  // ------------------------------------------------------------------ what was made and used today (Economy screen)
  S.econ ??= {};      // town id → { today: { made: {g:n}, used: {g:n} }, days: [ { made, used, stock, pop } ] }
  const econOf = t => (S.econ[t] ??= { today: { made: {}, used: {} }, days: [] });
  function made(g, n, t) { const e = econOf(t).today.made; e[g] = (e[g] || 0) + n; }
  function used(g, n, t) { const e = econOf(t).today.used; e[g] = (e[g] || 0) + n; }

  // ------------------------------------------------------------------ cells
  const shapeOf = b => ({ ...KINDS[b.kind], w: b.w, h: b.h });
  function stamp(b, upto = Infinity) {
    const kind = shapeOf(b);
    const list = blueprint(kind, M, b.id * 7919);
    let k = 0;
    for (const p of list) {
      if (k++ >= upto) break;
      const at = sim.cell(b.x + p.dx, b.y + p.dy); if (!at) continue;
      const { c, i } = at;
      c.mat[i] = p.mat; c.tall[i] = p.tall; c.ground[i] = p.ground ?? c.ground[i];
      c.hp[i] = 255; c.part[i] = b.id; c.flag[i] &= ~BURN; c.temp[i] = M.ambient;
      c.dirty = true; sim.store.markEdited(c);
    }
    return list.length;
  }
  function clearSite(b) {
    for (let dy = -1; dy <= b.h; dy++) for (let dx = -1; dx <= b.w; dx++) {
      const at = sim.cell(b.x + dx, b.y + dy); if (!at) continue;
      const { c, i } = at;
      const inside = dx >= 0 && dy >= 0 && dx < b.w && dy < b.h;
      const m = c.mat[i];
      if (m && M.tree[m] && inside) b.got.log = (b.got.log || 0) + 1;       // cleared trees go to the site
      if (inside || (m && !M.built[m] && !M.liquid[m])) { c.mat[i] = 0; c.tall[i] = 0; c.part[i] = 0; }
      if (inside) { c.ground[i] = M.id.dirt; c.part[i] = b.id; }
      c.dirty = true; sim.store.markEdited(c);
    }
  }
  function unstamp(b) {
    for (let dy = 0; dy < b.h + 1; dy++) for (let dx = 0; dx < b.w; dx++) {
      const at = sim.cell(b.x + dx, b.y + dy); if (!at) continue;
      const { c, i } = at;
      if (c.part[i] === b.id) { c.mat[i] = 0; c.tall[i] = 0; c.part[i] = 0; c.dirty = true; sim.store.markEdited(c); }
    }
  }

  /** Can a w x h footprint go at (x, y)? Land, fairly flat, no buildings or roads, nothing built. */
  function fits(x, y, w, h, { margin = 1, allowRoad = false } = {}) {
    let lo = 255, hi = 0;
    for (let dy = -margin; dy < h + margin; dy++) for (let dx = -margin; dx < w + margin; dx++) {
      const at = sim.cell(x + dx, y + dy); if (!at) return false;
      const { c, i } = at;
      const m = c.mat[i], g = c.ground[i];
      if (c.part[i]) return false;
      if (m && (M.built[m] || M.liquid[m] || M.solid[m])) return false;
      if (!M.walk[g]) return false;
      const inside = dx >= 0 && dy >= 0 && dx < w && dy < h;
      if (inside) {
        if (!allowRoad && M.flag.road[g]) return false;
        if (c.flag[i] & BURN) return false;
        lo = Math.min(lo, c.height[i]); hi = Math.max(hi, c.height[i]);
      }
    }
    if (sim.walls?.blocked(x, y, w, h)) return false;          // a painted keep-clear area
    return hi - lo <= 7;
  }

  // ------------------------------------------------------------------ buildings
  function addBuilding(kindId, x, y, townId, { instant = false, by = 'town' } = {}) {
    const kind = KINDS[kindId];
    const b = { id: S.nextId++, kind: kindId, town: townId, x: wrapX(Math.floor(x)), y: Math.floor(y), w: kind.w, h: kind.h, state: 'site', work: 0, need: { ...(kind.cost || {}) }, got: {}, store: {}, workers: [], by, born: sim.tick };
    S.buildings.push(b); byId.set(b.id, b);
    clearSite(b);
    if (instant) finish(b); else stamp(b, 0);
    return b;
  }
  function finish(b) {
    b.state = 'up'; b.work = KINDS[b.kind].work;
    stamp(b);
    const k = KINDS[b.kind];
    // a town hall far from every other town founds a new one (owner: or found one on purpose)
    if (k.founds && !S.towns.some(t => t.keep === b.id)) {
      const from = S.towns.find(t => t.id === b.town);
      const town = { id: S.nextId++, name: newTownName(b.id), x: b.x + (b.w >> 1), y: b.y + (b.h >> 1), founded: sim.tick, capital: false };
      S.towns.push(town); town.keep = b.id; b.town = town.id;
      if (b.wagon) {
        // a settler wagon brought its people and its load with it (nothing teleports)
        for (let n = 0; n < b.wagon.people; n++) addPerson(town, b.x + (b.w >> 1) + (n % 4) - 2, b.y + b.h + 1 + (n >> 2));
        for (const [g, n] of Object.entries(b.wagon.cargo || {})) b.store[g] = (b.store[g] || 0) + n;
        delete b.wagon;
      } else {
        // settlers move over from the old town
        const movers = S.people.filter(p => p.town === from?.id && p.job == null).slice(0, k.settlers || 6);
        for (const p of movers) { p.town = town.id; p.home = null; p.task = null; p.path = null; }
      }
      for (const [ox, oy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) layRoad(town.x, town.y, town.x + ox * 22, town.y + oy * 22, 'dirt');
      say(`${town.name} is founded.`, 'good', town.x, town.y);
      sim.setFocus(sim.viewFocus);
    }
    // far from every keep: its goods go home by route, and its workers live on site
    const keeps = S.buildings.filter(o => o.kind === 'keep' || KINDS[o.kind].founds);
    b.remote = !keeps.some(o => dist(o.x, o.y, b.x, b.y) < CFG.remoteAt);
    if (k.job && (b.remote || k.node)) {
      const town = S.towns.find(t => t.id === b.town);
      for (let n = 0; n < k.job.workers; n++) { const p = addPerson(town, b.x + (b.w >> 1) + n - 1, b.y + b.h + 1); p.home = b.id; p.job = b.id; b.workers.push(p.id); }
      if (b.remote) say(`${k.name} is working. ${k.job.workers} miners moved in.`, 'good', b.x, b.y);
    }
    if (k.home && b.kind !== 'tent') makeYard(b);
    sim.events.push({ t: 'built', id: b.id, kind: b.kind, x: b.x, y: b.y });
  }
  // play-test 2: "people should have yards". A home keeps a strip behind it (the side away from its
  // door) as its own garden: a hedge or fence along the back, a few flowers and bushes. The yard cells
  // belong to the home (tap one and you get the house), and go when the home goes.
  function makeYard(b) {
    b.yard = [];
    const r = (b.id * 2654435761 >>> 0) / 4294967296;
    const fence = r < 0.5 ? M.id.hedge : M.id.fence;
    const free = (x, y) => { const at = sim.cell(x, y); if (!at) return false; const { c, i } = at; return !c.part[i] && !(c.mat[i] && (M.built[c.mat[i]] || M.liquid[c.mat[i]])) && !M.flag.road[c.ground[i]] && !!M.walk[c.ground[i]]; };
    const dx0 = b.w >> 1;               // the door column (door is just south of the middle)
    // the side with the most open ground (the road is usually on one side; the door is on the south)
    const sides = [
      { cells: [], edge: 2, list: (o => { for (let dx = -1; dx <= b.w; dx++) for (const dy of [-1, -2]) o.push([dx, dy, dy === -2 || dx === -1 || dx === b.w]); return o; })([]) },
      { list: (o => { for (let dx = -1; dx <= b.w; dx++) for (const dy of [b.h + 1, b.h + 2]) if (Math.abs(dx - dx0) > 1) o.push([dx, dy, dy === b.h + 2 || dx === -1 || dx === b.w]); return o; })([]) },
      { list: (o => { for (let dy = -1; dy <= b.h; dy++) for (const dx of [-1, -2]) o.push([dx, dy, dx === -2 || dy === -1 || dy === b.h]); return o; })([]) },
      { list: (o => { for (let dy = -1; dy <= b.h; dy++) for (const dx of [b.w, b.w + 1]) o.push([dx, dy, dx === b.w + 1 || dy === -1 || dy === b.h]); return o; })([]) },
    ];
    let best = null, bn = 3;
    for (const sd of sides) { const n = sd.list.filter(([dx, dy]) => free(b.x + dx, b.y + dy)).length; if (n > bn) { bn = n; best = sd; } }
    if (!best) return;
    for (const [dx, dy, edge] of best.list) {
      if (!free(b.x + dx, b.y + dy)) continue;
      const { c, i } = sim.cell(b.x + dx, b.y + dy);
      const m = edge ? (((dx * 5 + dy * 3 + b.id) % 5) ? fence : M.id.bush) : (((dx * 13 + dy * 7 + b.id) % 4) === 0 ? M.id.flowers : 0);
      c.ground[i] = M.id.meadow ?? c.ground[i];
      c.mat[i] = m || 0; c.tall[i] = m ? (M.tall[m] || 1) : 0; c.part[i] = b.id;
      c.dirty = true; sim.store.markEdited(c);
      b.yard.push([wrapX(b.x + dx), b.y + dy]);
    }
  }
  function clearYard(b) {
    for (const [x, y] of b.yard || []) { const at = sim.cell(x, y); if (!at || at.c.part[at.i] !== b.id) continue; at.c.part[at.i] = 0; at.c.mat[at.i] = 0; at.c.tall[at.i] = 0; at.c.dirty = true; sim.store.markEdited(at.c); }
    b.yard = [];
  }
  function removeBuilding(b) {
    unstamp(b); clearYard(b);
    S.buildings.splice(S.buildings.indexOf(b), 1); byId.delete(b.id);
    for (const p of S.people) { if (p.home === b.id) p.home = null; if (p.job === b.id) p.job = null; if (p.task?.b === b.id) p.task = null; }
  }
  const missing = b => Object.entries(b.need).filter(([g, n]) => (b.got[g] || 0) < n).map(([g, n]) => [g, n - (b.got[g] || 0)]);

  // ------------------------------------------------------------------ roads
  const ROADS = { dirt: M.id.road_dirt, gravel: M.id.road_gravel, stone: M.id.road_stone };
  const ROAD_COST = { dirt: {}, gravel: { stone: 1 }, stone: { stone: 2 } };
  /** Lay road along a line of cells (x0,y0)-(x1,y1), width 2. Water becomes a bridge. Returns cells laid. */
  const WALL_MATS = new Set(['wall_wood', 'wall_stone', 'wall_thick'].map(k => M.id[k]).filter(Boolean));
  // Streets are 3 cells wide (the keep's cross 4): play-test 2 — "the city is so dense you can't see any
  // walking space, only structures. Roads should be wider."
  function layRoad(x0, y0, x1, y1, tier = 'dirt', width = CFG.roadWidth ?? 3, cls = 'street') {
    const OFF = []; for (let oy = 0; oy < width; oy++) for (let ox = 0; ox < width; ox++) OFF.push([ox - ((width - 1) >> 1), oy - ((width - 1) >> 1)]);
    let dx = x1 - x0; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const n = Math.max(Math.abs(dx), Math.abs(y1 - y0)) | 0;
    let laid = 0;
    if (n > 0) { S.roads.push([wrapX(Math.round(x0)), Math.round(y0), Math.round(x0 + dx), Math.round(y1), tier, cls, sim.tick, width]); if (S.roads.length > 6000) S.roads.shift(); }
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + dx * k / Math.max(1, n)), y = Math.round(y0 + (y1 - y0) * k / Math.max(1, n));
      for (const [ox, oy] of OFF) {
        const at = sim.cell(x + ox, y + oy); if (!at) continue;
        const { c, i } = at;
        // a road that reaches a wall gets a gate in it (play-test 2: the town builds its own gates)
        if (!c.part[i] && WALL_MATS.has(c.mat[i])) { c.mat[i] = M.id.gate; c.tall[i] = 0; c.hp[i] = 255; c.dirty = true; sim.store.markEdited(c); sim.walls?.addGate?.(x + ox, y + oy); continue; }
        if (c.part[i] || (c.mat[i] && M.built[c.mat[i]] && c.mat[i] !== M.id.bridge)) continue;
        if (c.mat[i] === M.id.water) {
          if (c.height[i] < 52) continue;                     // too deep to bridge yet
          c.mat[i] = M.id.bridge; c.tall[i] = 0;
        } else if (c.mat[i] && !M.liquid[c.mat[i]]) { c.mat[i] = 0; c.tall[i] = 0; }
        if (c.mat[i] !== M.id.bridge) c.ground[i] = ROADS[tier] ?? ROADS.dirt;
        c.dirty = true; sim.store.markEdited(c); laid++;
      }
    }
    return laid;
  }
  const isRoad = (x, y) => { const at = sim.cell(x, y); return !!at && (M.flag.road[at.c.ground[at.i]] || at.c.mat[at.i] === M.id.bridge); };

  /** Where a footprint can go: beside a road, near the town, nearest first (with a little jitter). */
  function findPlot(town, w, h, { near = null, radius = null, want = null, margin = 1, spread = 6 } = {}) {
    radius ??= searchR(town);
    const cx = near ? near.x : town.x, cy = near ? near.y : town.y;
    let best = null, bestScore = Infinity;
    for (let tries = 0; tries < 900; tries++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * radius;
      const rx = Math.round(cx + Math.cos(a) * r), ry = Math.round(cy + Math.sin(a) * r);
      if (!isRoad(rx, ry)) continue;
      // try the four sides of the road cell
      for (const [ox, oy] of [[1 + CFG.plotSetback, -((h / 2) | 0)], [-w - CFG.plotSetback, -((h / 2) | 0)], [-((w / 2) | 0), 1 + CFG.plotSetback], [-((w / 2) | 0), -h - CFG.plotSetback]]) {
        const x = rx + ox, y = ry + oy;
        if (onAvenueWay(town, x, y, w, h)) continue;
        if (!fits(x, y, w, h, { margin })) continue;
        let score = dist(x, y, cx, cy) + rng() * spread;
        if (sim.walls?.inZone(x, y, 'build')) score -= 40;           // painted build-here areas first
        if (want) score += want(x, y);
        if (score < bestScore) { bestScore = score; best = { x, y }; }
      }
      if (best && tries > 120) break;
    }
    return best;
  }
  /** How far from the keep a town looks for room: it grows with the town (play-test 2: a town stopped
   *  growing at about 150 people because every plot within a fixed 70 m was taken). */
  function searchR(town) {
    const pop = town.popCache ?? 0;
    return Math.min(CFG.searchMax ?? 420, Math.max(CFG.plotSearch, 40 + Math.sqrt(pop) * 10));
  }
  /** The town's built-up radius (non-remote buildings), cached for a few seconds. */
  function radius(town) {
    if (town.rAt != null && sim.tick - town.rAt < 200) return town.r;
    let r = 20;
    // the TOWN proper: homes, services, workshops (not woodcutters, fields, docks or watchtowers, which
    // sit out at the edge on purpose and would push the walls further out every time one is built)
    for (const b of S.buildings) {
      if (b.town !== town.id || b.remote) continue;
      const k = KINDS[b.kind];
      if (k.group === 'extraction' || (k.group === 'food' && b.kind !== 'veg_plot') || k.dock || k.tower || k.group === 'transport') continue;
      const d = dist(town.x, town.y, b.x + b.w / 2, b.y + b.h / 2) + Math.max(b.w, b.h) / 2; if (d > r) r = d;
    }
    town.r = Math.round(r); town.rAt = sim.tick;
    return town.r;
  }
  /** A random street cell in town, or inside `area` {x, y, r} (a guard's ward). Guards walk their beat between these. */
  function streetPoint(town, rnd = rng, area = null) {
    const R = area ? area.r : radius(town), cx = area ? area.x : town.x, cy = area ? area.y : town.y;
    for (let k = 0; k < 60; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      if (isRoad(x, y)) return { x, y };
    }
    return null;
  }
  /** Now and then a town pushes one LONG road out into the country (play-test 2: "it keeps to a
   *  tight-knit circle"): 50-110 m from the edge of town, toward woods, stone or water if it can, and
   *  farms, woodcutters and quarries settle along it. */
  function longRoad(town) {
    const R = radius(town);
    let best = null;
    for (let tries = 0; tries < 16; tries++) {
      const a = rng() * Math.PI * 2;
      // start: the outermost road cell in that direction
      let sx = null, sy = null;
      for (let r = R + 10; r > 6; r -= 2) { const x = Math.round(town.x + Math.cos(a) * r), y = Math.round(town.y + Math.sin(a) * r); if (isRoad(x, y)) { sx = x; sy = y; break; } }
      if (sx == null) continue;
      const dir = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => ({ dx, dy, dot: (dx * Math.cos(a) + dy * Math.sin(a)) / Math.hypot(dx, dy) })).sort((p, q) => q.dot - p.dot)[0];
      const want = 50 + ((rng() * 60) | 0);
      let len = 0, wet = 0;
      for (let k = 1; k <= want; k++) {
        const at = sim.cell(sx + dir.dx * k, sy + dir.dy * k);
        if (!at || at.c.part[at.i] || (at.c.mat[at.i] && M.built[at.c.mat[at.i]] && !WALL_MATS.has(at.c.mat[at.i]))) break;
        const m = at.c.mat[at.i];
        if (M.liquid[m]) { if (at.c.height[at.i] < 52 || ++wet > 8) break; continue; }
        if (!M.walk[at.c.ground[at.i]]) break;
        len = k;
      }
      if (len < 30) continue;
      // country roads keep well clear of the roads already there (no two running side by side)
      if (!roadOk(sx, sy, dir.dx, dir.dy, len, { skip: 12, gap: 16 })) continue;
      const ex = sx + dir.dx * len, ey = sy + dir.dy * len;
      const score = len + nearTrees(ex, ey, 20) * 2 + nearRock(ex, ey, 20) * 2 + nearWater(ex, ey, 15) + rng() * 10;
      if (!best || score > best.score) best = { sx, sy, ex, ey, score };
    }
    if (!best) return false;
    layRoad(best.sx, best.sy, best.ex, best.ey, 'dirt', CFG.roadWidth ?? 3, 'country');
    town.outward = { x: best.ex, y: best.ey, at: sim.tick };
    return true;
  }
  // ------------------------------------------------------------------ the street plan (play-test 3)
  // "At some point it just started spamming roads… they should clean up their roads to make sure they
  // follow a sensible hierarchy and not just random/overlapping. Long term cities should be sprawling
  // and interesting." The old growRoads laid an 18-34 m road from a random road cell in a random
  // direction EVERY time any building found no room (plan runs every 2 s), with no look at what was
  // already there — over a few days that is a solid grid of parallel roads with nothing on them.
  //
  // Now a town's roads have classes, recorded on S.roads ([x0, y0, x1, y1, tier, cls, tick, width]):
  //   main     — the AVENUES: the keep's cross, 4 m wide, which keep growing outward as the town does,
  //              bending 45° round whatever is in the way, and get paved (gravel, then stone) as it grows
  //   street   — side streets, 3 m, off an avenue or another street, one BLOCK apart
  //   country  — long roads out into the country (and roads between kingdoms); never tidied away
  //   player   — roads the player drew; never tidied away
  // A new road may not lie on top of a road or run alongside one closer than GAP, the planner lays at
  // most one road every `roadEvery` ticks, and tidyRoads() turns old town streets nothing was ever built
  // along back into grass.
  const BLOCK = CFG.block ?? 28;
  const GAP = CFG.streetGap ?? 11;
  const DIRS8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  /** Is this footprint in the way of an avenue's next stretch? (Homes built across an avenue's end used
   *  to stop the town's main roads at 25 m.) */
  function onAvenueWay(town, x, y, w, h) {
    // the cross-street spots a block apart along every avenue and street stay free, so the town grows
    // into blocks instead of a ribbon of houses along four long roads
    if (!town.ways || sim.tick - (town.waysAt || -1e9) > 200) { town.ways = corridors(town); town.waysAt = sim.tick; }
    for (const [cx0, cy0, cx1, cy1] of town.ways) {
      let ddx = cx0 - x; if (ddx > W / 2) ddx -= W; if (ddx < -W / 2) ddx += W;
      const ax = x + ddx, bx = ax + (cx1 - cx0);
      if (Math.max(ax, bx) >= x - 1 && Math.min(ax, bx) <= x + w && Math.max(cy0, cy1) >= y - 1 && Math.min(cy0, cy1) <= y + h) return true;
    }
    for (const a of town.avenues || []) {
      if (a.dead) continue;
      for (let k = 2; k <= 30; k += 3) {
        const cx = a.x + a.dx * k, cy = a.y + a.dy * k;
        let ddx = cx - x; if (ddx > W / 2) ddx -= W; if (ddx < -W / 2) ddx += W;
        if (ddx >= -5 && ddx <= w + 5 && cy >= y - 5 && cy <= y + h + 5) return true;
      }
    }
    return false;
  }
  /** Can a road run len cells from (x0, y0) along (dx, dy)? Land (a short bridge is fine), nothing built
   *  in the way, not on top of another road, not running alongside one. */
  function roadOk(x0, y0, dx, dy, len, { skip = 5, gap = GAP } = {}) {
    const n = Math.hypot(dx, dy), px = -dy / n, py = dx / n;
    let onRoad = 0, beside = 0, checked = 0, wet = 0;
    for (let k = 1; k <= len; k++) {
      const x = Math.round(x0 + dx * k), y = Math.round(y0 + dy * k);
      const at = sim.cell(x, y); if (!at || at.c.part[at.i]) return false;
      const m = at.c.mat[at.i];
      if (m && M.built[m] && m !== M.id.bridge && !WALL_MATS.has(m)) return false;
      if (M.liquid[m] || m === M.id.bridge) { if (at.c.height[at.i] < 52 || ++wet > 6 || k === len) return false; }
      else if (!M.walk[at.c.ground[at.i]]) return false;
      if (isRoad(x, y)) onRoad++;
      if (k <= skip || k > len - 3 || k % 2) continue;
      checked++;
      for (const side of [1, -1]) for (let o = 3; o <= gap; o++) if (isRoad(Math.round(x + px * o * side), Math.round(y + py * o * side))) { beside++; break; }
    }
    if (onRoad > len * 0.25) return false;
    if (checked && beside > checked * 0.7) return false;    // (each sample checks two sides)
    return true;
  }
  /** Towns from older saves (and new town halls) find their avenues by walking out along the roads. */
  function ensureAvenues(town) {
    if (town.avenues) return town.avenues;
    town.avenues = [];
    for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) {
      let last = null, miss = 0;
      for (let k = 4; k < 220 && miss < 6; k++) { const x = Math.round(town.x + dx * k), y = Math.round(town.y + dy * k); if (isRoad(x, y)) { last = { x, y, k }; miss = 0; } else miss++; }
      const len = last ? last.k : 6;
      town.avenues.push({ dx, dy, x: last ? last.x : Math.round(town.x + dx * 6), y: last ? last.y : Math.round(town.y + dy * 6), len, pts: [[Math.round(town.x), Math.round(town.y)], [last ? last.x : Math.round(town.x + dx * 6), last ? last.y : Math.round(town.y + dy * 6)]] });
    }
    return town.avenues;
  }
  /** Boxes [x0, y0, x1, y1] kept clear for future side streets: 3 m either side of each branch line,
   *  out to 30 m, both sides of every straight (not diagonal) avenue and street. */
  function corridors(town) {
    const out = [];
    const lines = [...(town.avenues || []).map(a => ({ pts: a.pts || [], w: 4, from: 14 })), ...(town.streets || []).map(st => ({ pts: [[st.x0, st.y0], [st.x1, st.y1]], w: 3, from: BLOCK }))];
    for (const ln of lines) for (const bp of branchPoints(ln.pts, ln.from)) {
      if (bp.dx && bp.dy) continue;
      for (const side of [1, -1]) {
        const dx = -bp.dy * side, dy = bp.dx * side, o = Math.ceil(ln.w / 2) + 1;
        const ax = bp.x + dx * o, ay = bp.y + dy * o, bx = bp.x + dx * 30, by = bp.y + dy * 30;
        // already a road there? then it is not a spot to keep any more
        if (isRoad(bp.x + dx * (o + 3), bp.y + dy * (o + 3))) continue;
        out.push([Math.min(ax, bx) - (dy ? 3 : 0), Math.min(ay, by) - (dx ? 3 : 0), Math.max(ax, bx) + (dy ? 3 : 0), Math.max(ay, by) + (dx ? 3 : 0)]);
      }
    }
    return out;
  }
  /** Points every BLOCK m along an avenue or a street, with its direction there. */
  function branchPoints(pts, from = 14) {
    const out = [];
    let walked = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      let ddx = bx - ax; if (ddx > W / 2) ddx -= W; if (ddx < -W / 2) ddx += W;
      const L = Math.hypot(ddx, by - ay); if (!L) continue;
      const dx = Math.sign(Math.round(ddx / L * 2)), dy = Math.sign(Math.round((by - ay) / L * 2));
      for (let t = 0; t < L; t += 1) {
        const at = walked + t;
        if (at >= from && Math.round(at) % BLOCK === 0) out.push({ x: Math.round(ax + ddx * t / L), y: Math.round(ay + (by - ay) * t / L), dx, dy });
      }
      walked += L;
    }
    return out;
  }
  /** No room for a home? Grow the street plan by ONE road (at most every `roadEvery` ticks). */
  function growRoads(town) {
    if (sim.tick < (town.nextGrow || 0)) return false;
    town.nextGrow = sim.tick + (CFG.roadEvery ?? 600);
    ensureAvenues(town);
    town.streets ??= [];
    const R = searchR(town) + 20;
    const cands = [];
    // 1. an avenue grows outward: straight on, or bending 45° round something in the way
    for (const a of town.avenues) {
      if (a.dead || a.len > R) continue;
      const k8 = DIRS8.findIndex(d => d[0] === a.dx && d[1] === a.dy);
      const len = 26 + ((rng() * 12) | 0);
      for (const turn of [0, 1, -1, 2, -2]) {
        const [dx, dy] = DIRS8[(k8 + turn + 8) % 8];
        // never doubles back toward the keep
        if (dist(a.x + dx * 10, a.y + dy * 10, town.x, town.y) < dist(a.x, a.y, town.x, town.y) + 3) continue;
        const L = dx && dy ? Math.round(len * 0.71) : len;
        if (roadOk(a.x, a.y, dx, dy, L, { skip: 3 })) { cands.push({ kind: 'main', a, x: a.x, y: a.y, dx, dy, L, score: a.len * 0.75 + Math.abs(turn) * 10 + rng() * 12 }); break; }
      }
    }
    // 2. a side street off an avenue or a street, a block from the last, to either side
    const parents = [...town.avenues.map(a => ({ pts: a.pts || [[a.x, a.y]], w: 4, main: true })), ...town.streets.map(st => ({ pts: [[st.x0, st.y0], [st.x1, st.y1]], w: 3 }))];
    for (const par of parents) {
      if (par.pts.length < 2) continue;
      for (const bp of branchPoints(par.pts, par.main ? 14 : BLOCK)) {
        if (dist(bp.x, bp.y, town.x, town.y) > R) continue;
        for (const side of [1, -1]) {
          // perpendicular to the parent there (a diagonal avenue gets diagonal side streets)
          const dx = -bp.dy * side, dy = bp.dx * side;
          const sx = bp.x + dx * Math.ceil(par.w / 2 + 1), sy = bp.y + dy * Math.ceil(par.w / 2 + 1);
          const len = 20 + ((rng() * 16) | 0), L = dx && dy ? Math.round(len * 0.71) : len;
          if (!roadOk(sx, sy, dx, dy, L)) continue;
          cands.push({ kind: 'street', x: sx, y: sy, dx, dy, L, score: dist(bp.x, bp.y, town.x, town.y) + (par.main ? 0 : 6) + rng() * 10 });
        }
      }
    }
    // 3. a street carries on from its end
    for (const st of town.streets) {
      if (st.done) continue;
      const L = 18 + ((rng() * 10) | 0);
      if (dist(st.x1, st.y1, town.x, town.y) > R) continue;
      if (roadOk(st.x1, st.y1, st.dx, st.dy, L, { skip: 2 })) cands.push({ kind: 'more', st, x: st.x1, y: st.y1, dx: st.dx, dy: st.dy, L, score: dist(st.x1, st.y1, town.x, town.y) + 4 + rng() * 10 });
      else st.tries = (st.tries || 0) + 1, st.done = st.tries > 3;
    }
    // an avenue that cannot grow for a long time is finished
    for (const a of town.avenues) if (!cands.some(c => c.a === a) && a.len <= R) { a.stuck = (a.stuck || 0) + 1; if (a.stuck > 20) a.dead = true; }
    if (!cands.length) return false;
    cands.sort((p, q) => p.score - q.score);
    const c = cands[0];
    const ex = Math.round(c.x + c.dx * c.L), ey = Math.round(c.y + c.dy * c.L);
    if (c.kind === 'main') {
      layRoad(c.x, c.y, ex, ey, 'dirt', 4, 'main');
      const a = c.a; a.pts ??= [[a.x, a.y]]; a.pts.push([ex, ey]); a.x = ex; a.y = ey; a.dx = c.dx; a.dy = c.dy; a.len += c.L; a.stuck = 0;
    } else if (c.kind === 'more') {
      layRoad(c.x, c.y, ex, ey, 'dirt', CFG.roadWidth ?? 3, 'street');
      c.st.x1 = ex; c.st.y1 = ey;
    } else {
      layRoad(c.x, c.y, ex, ey, 'dirt', CFG.roadWidth ?? 3, 'street');
      town.streets.push({ x0: c.x, y0: c.y, x1: ex, y1: ey, dx: c.dx, dy: c.dy });
      if (town.streets.length > 400) town.streets.shift();
    }
    return true;
  }

  /** Cells a road run covers (the same footprint layRoad paints). */
  function roadCells(r, out) {
    const [x0, y0, x1, y1, , , , width = CFG.roadWidth ?? 3] = r;
    let dx = x1 - x0; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const n = Math.max(Math.abs(dx), Math.abs(y1 - y0)) | 0;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + dx * k / Math.max(1, n)), y = Math.round(y0 + (y1 - y0) * k / Math.max(1, n));
      for (let oy = 0; oy < width; oy++) for (let ox = 0; ox < width; ox++) out.push([wrapX(x + ox - ((width - 1) >> 1)), y + oy - ((width - 1) >> 1)]);
    }
    return out;
  }
  function segDist(px, py, r) {
    const [x0, y0, x1, y1] = r;
    let ax = px - x0; if (ax > W / 2) ax -= W; if (ax < -W / 2) ax += W;
    let bx = x1 - x0; if (bx > W / 2) bx -= W; if (bx < -W / 2) bx += W;
    const by = y1 - y0, ay = py - y0, L2 = bx * bx + by * by;
    const t = L2 ? Math.max(0, Math.min(1, (ax * bx + ay * by) / L2)) : 0;
    return Math.hypot(ax - bx * t, ay - by * t);
  }
  /** Old town streets that nothing was ever built along go back to grass, a few at a time. The keep's
   *  cross, avenues, country roads and the player's own roads always stay. */
  function tidyRoads(town) {
    const R = searchR(town) + 60;
    const blds = S.buildings.filter(b => b.town === town.id || b.town === -1).map(b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) / 2 + 7 }))
      .filter(b => dist(b.x, b.y, town.x, town.y) < R + 20);
    const drop = [];
    for (const r of S.roads) {
      const [x0, y0, x1, y1, , cls, tick] = r;
      if (cls === 'player' || cls === 'country' || cls === 'main') continue;
      if (tick != null && sim.tick - tick < 20 * 60 * 4) continue;              // give a new street time to fill
      if (dist(x0, y0, town.x, town.y) > R && dist(x1, y1, town.x, town.y) > R) continue;
      if (dist(x0, y0, town.x, town.y) < 32 || dist(x1, y1, town.x, town.y) < 32) continue;   // the keep's own roads
      if (blds.some(b => segDist(b.x, b.y, r) < b.r)) continue;
      drop.push(r);
      if (drop.length >= (CFG.tidyPer ?? 24)) break;
    }
    if (!drop.length) return 0;
    const gone = new Set(drop);
    // cells another road still uses stay road
    const keepCells = new Set();
    const near = (r, d) => { const [a0, b0, a1, b1] = r, [c0, d0, c1, d1] = d; return Math.max(Math.min(b0, b1), Math.min(d0, d1)) - 6 <= Math.min(Math.max(b0, b1), Math.max(d0, d1)) && Math.abs(dxwT((a0 + a1) / 2, (c0 + c1) / 2)) < (Math.abs(a1 - a0) + Math.abs(c1 - c0)) / 2 + 8; };
    for (const r of S.roads) if (!gone.has(r) && drop.some(d => near(r, d))) for (const [x, y] of roadCells(r, [])) keepCells.add(x + ',' + y);
    let n = 0;
    for (const r of drop) for (const [x, y] of roadCells(r, [])) {
      if (keepCells.has(x + ',' + y)) continue;
      const at = sim.cell(x, y); if (!at) continue;
      const { c, i } = at;
      if (c.mat[i] || c.part[i] || !M.flag.road[c.ground[i]]) continue;
      c.ground[i] = M.id.grass; c.dirty = true; sim.store.markEdited(c); n++;
    }
    S.roads = S.roads.filter(r => !gone.has(r));
    if (town.streets) town.streets = town.streets.filter(st => S.roads.some(r => r[5] === 'street' && segDist(st.x0, st.y0, r) < 2 && segDist(st.x1, st.y1, r) < 2));
    return n;
  }
  const dxwT = (a, b) => { let d = b - a; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };
  /** Avenues get paved as the town grows: gravel once it has people and stone to spare, then stone. */
  function paveMain(town) {
    const pop = town.popCache ?? 0; if (pop < 60) return;
    const want = pop >= 160 ? 'stone' : 'gravel';
    const st = stockCache(town.id);
    const segs = S.roads.filter(r => r[5] === 'main' && r[4] !== want && r[4] !== 'stone' && dist((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, town.x, town.y) < searchR(town) + 40)
      .sort((p, q) => dist(p[0], p[1], town.x, town.y) - dist(q[0], q[1], town.x, town.y));
    const r = segs[0]; if (!r) return;
    const cells = roadCells(r, []);
    const cost = Math.ceil(cells.length / 8) * (want === 'stone' ? 2 : 1);
    if ((st.stone || 0) < cost + 30) return;
    takeStock('stone', cost, town.x, town.y);
    r[4] = want;
    for (const [x, y] of cells) { const at = sim.cell(x, y); if (!at) continue; const { c, i } = at; if (c.mat[i] || !M.flag.road[c.ground[i]]) continue; c.ground[i] = ROADS[want]; c.dirty = true; sim.store.markEdited(c); }
  }

  // ------------------------------------------------------------------ founding
  function found({ x, y, name }) {
    const kind = KINDS.keep;
    // find flat land near the tap
    let spot = null;
    for (let r = 0; r < 60 && !spot; r += 2) for (let k = 0; k < 24 && !spot; k++) {
      const a = k / 24 * Math.PI * 2, px = Math.round(x + Math.cos(a) * r - kind.w / 2), py = Math.round(y + Math.sin(a) * r - kind.h / 2);
      if (fits(px, py, kind.w, kind.h, { margin: 2 })) spot = { x: px, y: py };
    }
    if (!spot) return null;
    const town = { id: S.nextId++, name, x: wrapX(spot.x + (kind.w >> 1)), y: spot.y + (kind.h >> 1), founded: sim.tick, capital: !S.towns.length };
    S.towns.push(town);
    const keep = addBuilding('keep', spot.x, spot.y, town.id, { instant: true, by: 'player' });
    town.keep = keep.id;
    for (const [g, n] of Object.entries(data.start.stock)) keep.store[g] = n;
    // a cross of dirt roads out of the keep
    const kx = spot.x, ky = spot.y, kw = kind.w, kh = kind.h;
    layRoad(kx + (kw >> 1), ky + kh + 1, kx + (kw >> 1), ky + kh + 26, 'dirt', 4, 'main');
    layRoad(kx + (kw >> 1), ky - 2, kx + (kw >> 1), ky - 24, 'dirt', 4, 'main');
    layRoad(kx - 2, ky + (kh >> 1), kx - 26, ky + (kh >> 1), 'dirt', 4, 'main');
    layRoad(kx + kw + 1, ky + (kh >> 1), kx + kw + 26, ky + (kh >> 1), 'dirt', 4, 'main');
    layRoad(kx - 2, ky + kh + 1, kx + kw + 1, ky + kh + 1, 'dirt', CFG.roadWidth ?? 3, 'main');
    town.avenues = [[0, 1, kx + (kw >> 1), ky + kh + 26, ky + kh + 1], [0, -1, kx + (kw >> 1), ky - 24, ky - 2], [-1, 0, kx - 26, ky + (kh >> 1), kx - 2], [1, 0, kx + kw + 26, ky + (kh >> 1), kx + kw + 1]]
      .map(([dx, dy, x, y, s0]) => ({ dx, dy, x, y, len: 25, pts: [dx ? [s0, y] : [x, s0], [x, y]] }));
    for (let k = 0; k < data.start.people; k++) addPerson(town, door(keep).x + (k % 4) - 2, door(keep).y + 1 + (k >> 2));
    say(`${name} is founded.`, 'good', town.x, town.y);
    sim.setFocus(sim.viewFocus);
    return town;
  }

  // ------------------------------------------------------------------ people
  function addPerson(town, x, y) {
    const p = { id: S.nextId++, town: town.id, x: x + 0.5, y: y + 0.5, home: null, job: null, task: null, carry: null, path: null, pi: 0, hunger: 0, wait: 0 };
    S.people.push(p);
    return p;
  }
  function goTo(p, x, y, near = 0) {
    // long walks (out to a mine) plan on 4 m tiles; short ones cell by cell
    // a target that just failed for this person is not searched again for a while
    const key = Math.floor(x) + ',' + Math.floor(y);
    if (p.noPath === key && sim.tick < (p.noPathUntil || 0)) return false;
    const r = dist(p.x, p.y, x, y) > 60 ? nav.findLong(p.x, p.y, x, y, { maxNodes: 8000 }) : nav.find(p.x, p.y, x, y, { near, maxNodes: 8000 });
    if (!r) { p.noPath = key; p.noPathUntil = sim.tick + 400; return false; }
    p.path = r.path; p.pi = 0;
    return true;
  }
  /** Move along the path; true when there. */
  function walk(p) {
    for (let k = 1; k < (p.stride || 1); k++) if (walkOnce(p)) return true;
    return walkOnce(p);
  }
  function walkOnce(p) {
    if (!p.path || p.pi >= p.path.length) return true;
    const [tx, ty] = p.path[p.pi];
    const at = sim.cell(Math.floor(p.x), Math.floor(p.y));
    let spd = SPEED;
    if (at) {
      const g = at.c.ground[at.i], m = at.c.mat[at.i];
      spd *= (m === M.id.bridge ? M.walk[m] : M.walk[g] || 100) / 100;
      if (m && !M.built[m] && M.walk[m] && m !== M.id.bridge) spd *= M.walk[m] / 100;
    }
    let dx = tx + 0.5 - p.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const dy = ty + 0.5 - p.y, d = Math.hypot(dx, dy);
    if (d <= spd) {
      p.x = wrapX(tx + 0.5); p.y = ty + 0.5; p.pi++;
      wear(tx, ty);
    } else { p.x = wrapX(p.x + dx / d * spd); p.y += dy / d * spd; }
    return p.pi >= p.path.length;
  }
  // paths form where people walk a lot (owner)
  const wearMap = new Map();
  function wear(x, y) {
    const at = sim.cell(x, y); if (!at) return;
    const { c, i } = at, g = c.ground[i];
    if (M.flag.road[g] || c.mat[i] || !(g === M.id.grass || g === M.id.meadow || g === M.id.dirt || g === M.id.moorgrass)) return;
    const key = c.cx + c.cy * sim.chunksX + i * 1e6;
    const n = (wearMap.get(key) || 0) + 1;
    if (n >= CFG.pathWear * 10) { c.ground[i] = M.id.road_dirt; c.dirty = true; sim.store.markEdited(c); wearMap.delete(key); }
    else wearMap.set(key, n);
  }

  // ------------------------------------------------------------------ work
  function nearestStore(x, y, room = 1, townId = null) {
    let best = null, bd = Infinity;
    for (const b of S.buildings) {
      if (!isStore(b) || (townId != null && b.town !== townId)) continue;
      if (storeRoom(b) < room) continue;
      const d = dist(x, y, b.x, b.y); if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  /** Find a resource cell for a job within its radius of the building. */
  function findResource(b, kind) {
    const job = KINDS[b.kind].job, R = job.radius ?? Math.max(b.w, b.h);
    let cx = b.x + (b.w >> 1), cy = b.y + (b.h >> 1);
    const node = b.node && sim.nodes?.[b.node - 1];
    if (node) { cx = node.x; cy = node.y; }
    let best = null, bd = Infinity;
    for (let k = 0; k < 220; k++) {
      const a = rng() * Math.PI * 2, r = 3 + rng() * R;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      const at = sim.cell(x, y); if (!at) continue;
      const { c, i } = at, m = c.mat[i], g = c.ground[i];
      let ok = false;
      if (kind === 'chop') ok = (m === M.id.tree || m === M.id.pine) && c.tall[i] >= 3 && !(c.flag[i] & BURN);
      else if (kind === 'forage') ok = m === M.id.bush || m === M.id.flowers || m === M.id.mushroom;
      else if (kind === 'quarry') ok = m === M.id.boulder || (!m && (g === M.id.rock || g === M.id.gravel));
      else if (kind === 'fish') ok = m === M.id.water;
      else if (kind === 'hunt') ok = !m && (g === M.id.grass || g === M.id.meadow) && rng() < 0.15;
      else if (kind === 'mine') ok = !m || m === M.id.boulder;
      else if (kind === 'farm') ok = m === M.id.crop && c.part[i] === b.id;
      else if (kind === 'herd') ok = c.part[i] === b.id && !m;
      if (!ok) continue;
      if (S.people.some(q => q.task?.rx === x && q.task?.ry === y)) continue;
      const d = r; if (d < bd) { bd = d; best = { x, y }; }
      if (best && k > 40) break;
    }
    return best;
  }
  function harvest(b, x, y) {
    const job = KINDS[b.kind].job;
    const at = sim.cell(x, y); if (!at) return 0;
    const { c, i } = at, m = c.mat[i];
    if (job.kind === 'chop') {
      if (!(m === M.id.tree || m === M.id.pine)) return 0;
      const tall = c.tall[i];
      c.mat[i] = M.id.stump; c.tall[i] = 1; c.life[i] = 0;
      c.dirty = true; sim.store.markEdited(c); sim.wake(c);
      // the page draws the tree toppling over (play-test 2: "wood cutters actually fell trees")
      sim.events.push({ t: 'fell', x, y, tall, m, dir: rng() < 0.5 ? -1 : 1 });
      regrow.push({ x, y, at: sim.tick + 20 * 60 * 6 + ((rng() * 2400) | 0), m });
    } else if (job.kind === 'quarry' && m === M.id.boulder) {
      if (rng() < 0.3) { c.mat[i] = 0; c.tall[i] = 0; c.dirty = true; sim.store.markEdited(c); }
    }
    if (job.kind === 'farm') {
      if (m !== M.id.crop) return 0;
      c.mat[i] = 0; c.tall[i] = 0; c.dirty = true; sim.store.markEdited(c);
      regrow.push({ x, y, at: sim.tick + job.regrow + ((rng() * 400) | 0), m: M.id.crop, field: true });
    }
    if (job.kind === 'mine') { const node = b.node && sim.nodes?.[b.node - 1]; return job.per * (node ? node.rich : 1); }
    return job.per;
  }
  // felled trees grow back after a while (a forester will speed this up later)
  const regrow = S.regrow ??= [];
  function stepRegrow() {
    for (let k = regrow.length - 1; k >= 0; k--) {
      const r = regrow[k]; if (r.at > sim.tick) continue;
      regrow.splice(k, 1);
      const at = sim.cell(r.x, r.y); if (!at) continue;
      if (r.field && !at.c.mat[at.i]) { at.c.mat[at.i] = r.m; at.c.dirty = true; sim.store.markEdited(at.c); continue; }
      if (at.c.mat[at.i] === M.id.stump) { at.c.mat[at.i] = r.m; at.c.tall[at.i] = M.tall[r.m]; at.c.life[at.i] = 150; at.c.dirty = true; sim.store.markEdited(at.c); }
    }
  }

  /** Choose something to do. Job workers do their job; everyone else hauls, delivers, builds. */
  function think(p) {
    const town = S.towns.find(t => t.id === p.town);
    // carrying something with nowhere to put it: take it to storage
    if (p.carry) {
      const st = nearestStore(p.x, p.y, p.carry.n, p.town) || nearestStore(p.x, p.y, 1, p.town);
      if (st) { p.task = { t: 'drop', b: st.id }; const d = door(st); return goTo(p, d.x, d.y, 1); }
      p.carry = null;
    }
    const jb = p.job != null ? byId.get(p.job) : null;
    if (jb && jb.state === 'up' && KINDS[jb.kind].job.kind === 'craft') {
      // a workshop: fetch what it needs from the stores, then work it into something else
      const job = KINDS[jb.kind].job;
      jb.input ??= {};
      if (storeUsed(jb) < KINDS[jb.kind].storage) {
        const lack = Object.entries(job.in).find(([g, n]) => (jb.input[g] || 0) < n);
        if (!lack) { p.task = { t: 'craft', b: jb.id, work: job.secs * 20 }; const d = door(jb); return goTo(p, d.x, d.y, 1); }
        const [g, n] = lack;
        const src = S.buildings.filter(s => isStore(s) && (s.store[g] || 0) > 0).sort((a, c) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, c.x, c.y))[0];
        if (src) { p.task = { t: 'fetchIn', b: jb.id, g, n: Math.max(n, Math.min(n * 3, CFG.builderCarry)), src: src.id }; const d = door(src); return goTo(p, d.x, d.y, 1); }
        jb.idle = (jb.idle || 0) + 1;
      }
    } else if (jb && jb.state === 'up') {
      const job = KINDS[jb.kind].job;
      if (storeUsed(jb) < KINDS[jb.kind].storage) {
        const r = findResource(jb, job.kind);
        if (r) { p.task = { t: 'gather', b: jb.id, rx: r.x, ry: r.y, work: job.secs * 20 }; return goTo(p, r.x, r.y, job.kind === 'fish' ? 2 : 1); }
      }
    }
    // haul a producer's pile home
    let haul = null, hd = Infinity;
    for (const b of S.buildings) {
      if (b.town !== p.town || b.state !== 'up' || KINDS[b.kind].kingdom || !KINDS[b.kind].job || b.remote) continue;
      const n = storeUsed(b);
      if (n < CFG.haulAt || (b.hauler && sim.tick - (b.haulTick || 0) < 2400)) continue;
      const d = dist(p.x, p.y, b.x, b.y); if (d < hd) { hd = d; haul = b; }
    }
    if (haul && (!jb || storeUsed(jb) >= KINDS[jb.kind].storage)) {
      haul.hauler = p.id; haul.haulTick = sim.tick; p.task = { t: 'haul', b: haul.id }; const d = door(haul);
      if (goTo(p, d.x, d.y, 1)) return true;
      haul.hauler = null; p.task = null;
    }
    // bring materials to a site, or build it
    const sites = S.buildings.filter(b => b.town === p.town && b.state === 'site').sort((a, b) => (a.by === 'player' ? -1 : 0) - (b.by === 'player' ? -1 : 0) || dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
    for (const b of sites) {
      // several people may fetch for one site: as many as the remaining load needs trips
      const lack = missing(b).filter(([g, n]) => S.people.filter(q => q.task?.t === 'fetch' && q.task.b === b.id && q.task.g === g).length < Math.ceil(n / CFG.builderCarry));
      if (lack.length) {
        const [g, n] = lack[0];
        const src = S.buildings.filter(s => isStore(s) && (s.store[g] || 0) > 0).sort((a, c) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, c.x, c.y))[0];
        if (!src) continue;
        p.task = { t: 'fetch', b: b.id, g, n: Math.min(n, CFG.builderCarry), src: src.id };
        const d = door(src); return goTo(p, d.x, d.y, 1);
      }
      if (!missing(b).length) {
        const builders = S.people.filter(q => q.task?.t === 'build' && q.task.b === b.id).length;
        if (builders < 3) { p.task = { t: 'build', b: b.id }; return goTo(p, b.x + (b.w >> 1), b.y + b.h, 1); }
      }
    }
    // nothing to do: drift home (or near the keep) and rest a while
    const home = byId.get(p.home) || byId.get(town?.keep);
    p.task = { t: 'rest', until: sim.tick + 60 + ((rng() * 120) | 0) };
    if (home && dist(p.x, p.y, home.x, home.y) > 6) { const d = door(home); return goTo(p, d.x + ((rng() * 5) | 0) - 2, d.y + ((rng() * 3) | 0), 1); }
    return true;
  }

  /** Open water a boat can row to: from the bank (x0, y0) toward the water cell (wx, wy) and on, as
   *  far as the water goes (up to 16 m). Null if there is no water to row on. */
  function boatSpot(x0, y0, wx, wy) {
    let dx = wx + 0.5 - x0; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const dy = wy + 0.5 - y0, d = Math.hypot(dx, dy) || 1;
    let last = null;
    for (let k = 1; k <= 18; k++) {
      const x = x0 + dx / d * k, y = y0 + dy / d * k;
      const at = sim.cell(x, y); if (!at) break;
      if (at.c.mat[at.i] === M.id.water) last = { x: wrapX(Math.floor(x) + 0.5), y: Math.floor(y) + 0.5 };
      else if (last) break;
      else if (k > 4) break;
    }
    if (!last) return null;
    // a little way along the water so boats don't all sit in one spot
    return last;
  }
  function landNear(x, y) {
    for (let r = 0; r < 20; r++) for (let k = 0; k < 8 + r * 4; k++) {
      const a = k / (8 + r * 4) * Math.PI * 2, px = Math.floor(x + Math.cos(a) * r), py = Math.floor(y + Math.sin(a) * r);
      if (isFinite(nav.cost(px, py))) return { x: px + 0.5, y: py + 0.5 };
    }
    return null;
  }
  function act(p) {
    // someone left in a boat whose job went away rows straight back to the bank
    if (p.boat && !(p.task?.t === 'gather' && p.task.boat)) { const l = landNear(p.x, p.y); if (l) { p.x = wrapX(l.x); p.y = l.y; } p.boat = 0; }
    const t = p.task;
    if (!t) { if (think(p) === false) { p.task = { t: 'rest', until: sim.tick + 40 }; p.path = null; } return; }
    if (p.path && p.pi < p.path.length) { walk(p); return; }
    const b = t.b != null ? byId.get(t.b) : null;
    switch (t.t) {
      case 'gather': {
        if (!b) { p.task = null; return; }
        // a fisher rows out: from the bank straight out over open water, fishes there, rows back
        // (play-test 2: "fishing spots actually send boats in the water")
        if (KINDS[b.kind].job.kind === 'fish' && !t.boat) {
          const out = boatSpot(p.x, p.y, t.rx, t.ry);
          t.boat = out ? { x0: p.x, y0: p.y, x1: out.x, y1: out.y, ph: 'out' } : { ph: 'shore' };
        }
        if (t.boat && t.boat.ph !== 'shore') {
          const bt = t.boat, spd = 0.06 * (p.stride || 1);
          if (bt.ph === 'out' || bt.ph === 'back') {
            const tx = bt.ph === 'out' ? bt.x1 : bt.x0, ty = bt.ph === 'out' ? bt.y1 : bt.y0;
            let dx = tx - p.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
            const dy = ty - p.y, d = Math.hypot(dx, dy);
            if (d > spd) { p.x = wrapX(p.x + dx / d * spd); p.y += dy / d * spd; p.boat = 1; return; }
            p.x = wrapX(tx); p.y = ty;
            if (bt.ph === 'out') { bt.ph = 'fish'; p.boat = 1; return; }
            p.boat = 0; bt.ph = 'done';
          } else if (bt.ph === 'fish') {
            p.boat = 1;
            if ((t.work -= p.stride || 1) > 0) return;
            bt.ph = 'back'; return;
          }
        } else if ((t.work -= p.stride || 1) > 0) return;
        const n = harvest(b, t.rx, t.ry);
        p.task = null;
        if (n) { made(KINDS[b.kind].job.makes, n, b.town); p.carry = { g: KINDS[b.kind].job.makes, n }; p.task = { t: 'deliverJob', b: b.id }; const d = door(b); if (!goTo(p, d.x, d.y, 1)) { p.task = null; } }
        return;
      }
      case 'deliverJob': {
        if (b && p.carry) b.store[p.carry.g] = (b.store[p.carry.g] || 0) + p.carry.n;
        p.carry = null; p.task = null; return;
      }
      case 'haul': {
        if (!b) { p.task = null; return; }
        b.hauler = null;
        let g = null, n = 0;
        for (const [gg, nn] of Object.entries(b.store)) if (nn > n) { g = gg; n = nn; }
        if (!g) { p.task = null; return; }
        const k = Math.min(n, CFG.haulCarry); b.store[g] -= k;
        p.carry = { g, n: k }; p.task = null;   // think() takes it to storage
        return;
      }
      case 'drop': {
        if (b && p.carry && isStore(b)) { const k = Math.min(p.carry.n, Math.max(0, storeRoom(b))); b.store[p.carry.g] = (b.store[p.carry.g] || 0) + k; p.carry.n -= k; if (p.carry.n <= 0) p.carry = null; }
        p.task = null; return;
      }
      case 'fetch': {
        const src = byId.get(t.src);
        if (!b || !src) { p.task = null; return; }
        if (!t.picked) {
          const k = Math.min(t.n, src.store[t.g] || 0);
          if (!k) { p.task = null; return; }
          src.store[t.g] -= k; p.carry = { g: t.g, n: k }; t.picked = true;
          if (!goTo(p, b.x + (b.w >> 1), b.y + b.h, 1)) { p.task = null; }
          return;
        }
        if (p.carry) { b.got[p.carry.g] = (b.got[p.carry.g] || 0) + p.carry.n; p.carry = null; }
        p.task = null; return;
      }
      case 'build': {
        if (!b || b.state !== 'site') { p.task = null; return; }
        if (missing(b).length) { p.task = null; return; }
        b.work += (p.stride || 1) / 20;
        const total = KINDS[b.kind].work || 1;
        const n = blueprint(shapeOf(b), M, b.id * 7919).length;
        if ((sim.tick & 7) === 0) stamp(b, Math.floor(n * Math.min(1, b.work / total)));
        if (b.work >= total) { finish(b); if (b.upgradeOf) onUpgraded(b); p.task = null; }
        return;
      }
      case 'fetchIn': {
        const src = byId.get(t.src);
        if (!b || !src) { p.task = null; return; }
        if (!t.picked) {
          const k = Math.min(t.n, src.store[t.g] || 0);
          if (!k) { p.task = null; return; }
          src.store[t.g] -= k; p.carry = { g: t.g, n: k }; t.picked = true; used(t.g, k, b.town);
          const d = door(b); if (!goTo(p, d.x, d.y, 1)) { p.task = null; }
          return;
        }
        if (p.carry) { b.input ??= {}; b.input[p.carry.g] = (b.input[p.carry.g] || 0) + p.carry.n; p.carry = null; }
        p.task = null; return;
      }
      case 'craft': {
        if (!b) { p.task = null; return; }
        if ((t.work -= p.stride || 1) > 0) return;
        const job = KINDS[b.kind].job;
        if (Object.entries(job.in).every(([g, n]) => (b.input[g] || 0) >= n)) {
          for (const [g, n] of Object.entries(job.in)) b.input[g] -= n;
          for (const [g, n] of Object.entries(job.out)) { b.store[g] = (b.store[g] || 0) + n; made(g, n, b.town); }
          b.idle = 0;
        }
        p.task = null; return;
      }
      case 'douse': {
        // fetch water (a well or open water), carry it to the fire, put it out; again while it burns.
        // No water anywhere near: beat the flames out by hand (slower, a smaller patch).
        if (!t.water) {
          if (!t.going) {
            const w = waterNear(p.x, p.y);
            if (!w) { t.water = true; t.beat = true; if (!goTo(p, t.fx, t.fy, 1)) { p.task = null; } return; }
            t.going = true; if (!goTo(p, w.x, w.y, 1)) { t.water = true; t.beat = true; goTo(p, t.fx, t.fy, 1); } return;
          }
          t.water = true; t.going = false; p.carry = { g: 'water', n: 1 };
          if (!goTo(p, t.fx, t.fy, 2)) { p.task = null; p.carry = null; }
          return;
        }
        sim.douse?.(t.fx, t.fy, t.beat ? 1 : 3);
        p.carry = null;
        t.rounds = (t.rounds || 0) + 1;
        // the next burning cell near here, if any (not a random spot)
        const next = sim.nearestFire?.(t.fx, t.fy, 10);
        p.task = next && t.rounds < 10 ? { t: 'douse', fx: next[0], fy: next[1], water: !!t.beat && dist(p.x, p.y, next[0], next[1]) < 3, beat: t.beat, rounds: t.rounds } : null;
        if (p.task?.water) goTo(p, next[0], next[1], 1);
        return;
      }
      case 'rest': if (sim.tick >= t.until) p.task = null; return;
      case 'flee': if (sim.tick >= t.until) { p.task = null; p.path = null; } return;
      default: p.task = null;
    }
  }

  function waterNear(x, y) {
    let best = null, bd = Infinity;
    for (const b of S.buildings) if (b.kind === 'well' && b.state === 'up') { const d = dist(x, y, b.x, b.y); if (d < bd) { bd = d; best = door(b); } }
    for (let k = 0; k < 120 && bd > 12; k++) {
      const a = rng() * Math.PI * 2, r = rng() * 60;
      const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r);
      const at = sim.cell(px, py); if (at && at.c.mat[at.i] === M.id.water && r < bd) { bd = r; best = { x: px, y: py }; }
    }
    return best;
  }

  // ------------------------------------------------------------------ the town's own plans
  function homes(townId) { return S.buildings.filter(b => b.town === townId && KINDS[b.kind].home || (b.town === townId && b.kind === 'keep')); }
  function capacity(b) { return capacityOf(b); }
  function assignHomes(town) {
    const people = S.people.filter(p => p.town === town.id);
    const used = new Map();
    for (const p of people) if (p.home != null) { if (!byId.get(p.home)) p.home = null; else used.set(p.home, (used.get(p.home) || 0) + 1); }
    for (const p of people) {
      if (p.home != null) continue;
      const h = homes(town.id).filter(b => b.state === 'up' && (used.get(b.id) || 0) < capacity(b)).sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y))[0];
      if (h) { p.home = h.id; used.set(h.id, (used.get(h.id) || 0) + 1); }
    }
    return people.filter(p => p.home == null).length;
  }
  function assignJobs(town) {
    const people = S.people.filter(p => p.town === town.id);
    // commuters (owner: people can live in one town and work in another): idle people in towns a
    // passenger line joins to this one may fill its open jobs
    const linked = sim.trains?.linkedTowns?.(town.id) || [];
    const commuters = linked.length ? S.people.filter(p => linked.includes(p.town) && p.job == null) : [];
    for (const b of S.buildings) {
      if (b.town !== town.id || b.state !== 'up' || !KINDS[b.kind].job) continue;
      b.workers = b.workers.filter(id => S.people.some(p => p.id === id && p.job === b.id));
      // keep at least a third of the town free to haul and build
      const free = people.filter(p => p.job == null);
      while (b.workers.length < KINDS[b.kind].job.workers && free.length > people.length / 3) {
        free.sort((a, c) => dist(a.x, a.y, b.x, b.y) - dist(c.x, c.y, b.x, b.y));
        const p = free.shift(); p.job = b.id; b.workers.push(p.id);
      }
      while (b.workers.length < KINDS[b.kind].job.workers && commuters.length) { const p = commuters.shift(); p.job = b.id; p.commuter = true; b.workers.push(p.id); }
    }
  }
  const pending = (townId, kind) => S.buildings.some(b => b.town === townId && b.kind === kind && b.state === 'site');
  const count = (townId, kind) => S.buildings.filter(b => b.town === townId && b.kind === kind).length;
  function nearRock(x, y, r = 30) { let n = 0; for (let k = 0; k < 60; k++) { const at = sim.cell(x + (rng() - 0.5) * r * 2, y + (rng() - 0.5) * r * 2); if (at && (at.c.mat[at.i] === M.id.boulder || at.c.ground[at.i] === M.id.rock || at.c.ground[at.i] === M.id.gravel)) n++; } return n; }
  function nearWater(x, y, r = 22) { let n = 0; for (let k = 0; k < 60; k++) { const at = sim.cell(x + (rng() - 0.5) * r * 2, y + (rng() - 0.5) * r * 2); if (at && at.c.mat[at.i] === M.id.water) n++; } return n; }
  function nearTrees(x, y, r = 30) { let n = 0; for (let k = 0; k < 60; k++) { const at = sim.cell(x + (rng() - 0.5) * r * 2, y + (rng() - 0.5) * r * 2); if (at && M.tree[at.c.mat[at.i]]) n++; } return n; }

  // ------------------------------------------------------------------ needs, levels, mood (M4)
  const HOMES = data.homes, LADDER = HOMES.ladder;
  const levelOf = b => LADDER.indexOf(b.kind);
  /** Which services reach (x, y): { water, market, faith, tavern, health, fire, … } */
  function coverAt(x, y, townId) {
    const out = {};
    for (const o of S.buildings) {
      if (o.state !== 'up' || (townId != null && o.town !== townId)) continue;
      const k = KINDS[o.kind];
      const cov = { ...(k.cover || {}) };
      if (k.faith && !cov.faith) cov.faith = k.faith.reach ?? k.reach ?? 60;
      for (const [need, r] of Object.entries(cov)) if (!out[need] && dist(x, y, o.x + (o.w >> 1), o.y + (o.h >> 1)) <= r) out[need] = true;
    }
    return out;
  }
  function beautyAt(x, y) {
    let v = 0;
    for (const o of S.buildings) { const k = KINDS[o.kind]; if (o.state === 'up' && k.beauty) { const d = dist(x, y, o.x, o.y); if (d < 30) v += k.beauty * (1 - d / 30); } }
    return v;
  }
  /** Does home b meet the needs of `kind` (its own, or the next level up)? Returns the missing list. */
  function needsMissing(b, kind) {
    const need = HOMES.needs[kind] || {};
    const cov = b._cover || (b._cover = coverAt(b.x + (b.w >> 1), b.y + (b.h >> 1), b.town));
    const miss = [];
    for (const c of need.cover || []) if (!cov[c]) miss.push(c);
    const st = stockCache(b.town);
    if (need.food) { const kinds = foodGoods.filter(g => (st[g] || 0) > 0).length; if (kinds < need.food) miss.push('food'); }
    for (const g of Object.keys(need.goods || {})) if (!(st[g] > 0)) miss.push(g);
    if (need.safety && (b.safety ?? 1) < need.safety) miss.push('safety');
    return miss;
  }
  const stockCacheMap = new Map();
  function stockCache(townId) { const e = stockCacheMap.get(townId); if (e && e.t === sim.tick) return e.s; const s = stock(townId); stockCacheMap.set(townId, { t: sim.tick, s }); return s; }

  function plan(town) {
    const pop = S.people.filter(p => p.town === town.id).length;
    town.popCache = pop;
    const st = stock(town.id);
    const food = foodTotal(town.id);
    for (const b of S.buildings) if (b.town === town.id) b._cover = null;
    town.wants = [];
    const want = (kind, why) => { if (KINDS[kind]) town.wants.push({ kind, why }); };
    const place = (kind, wantFn, radius) => {
      const k = KINDS[kind]; if (!k || sim.unlocked?.(kind) === false) return false;
      // homes keep room for a yard and spread out a little (play-test 2: "cities build way too dense")
      const spot = findPlot(town, k.w, k.h, { want: wantFn, radius, margin: k.home ? 2 : 1, spread: k.home ? 22 : 10 });
      if (!spot) { if (k.w * k.h <= 64) growRoads(town); return false; }
      addBuilding(kind, spot.x, spot.y, town.id);
      return true;
    };
    const busy = () => S.buildings.filter(b => b.town === town.id && b.state === 'site' && !KINDS[b.kind].home && !b.upgradeOf).length >= 2 + Math.floor(pop / 40);
    const has = k => count(town.id, k) > 0;
    // 1. everybody needs a roof: tents for the homeless (free, quick)
    const homeless = assignHomes(town);
    // (a tent that finds no room must not stop the rest of the plan: it used to RETURN here, so a
    // town with no room left near the keep never built anything again — the stall at ~150 people)
    if (homeless > 0 && !pending(town.id, 'tent') && place('tent')) return;
    // now and then a long road out into the country (play-test 2)
    town.nextLong ??= sim.tick + 20 * 60 * 3;
    if (pop >= 25 && sim.tick >= town.nextLong) { town.nextLong = sim.tick + 20 * 60 * (3 + rng() * 5); longRoad(town); }
    // 2. food
    // food: judged by what yesterday made against what the town eats, so it keeps up as it grows
    const FOOD = ['forager', 'fisher', 'hunter', 'veg_plot'];
    const lastDay = econOf(town.id).days.at(-1);
    const madeFood = lastDay ? foodGoods.reduce((a, g) => a + (lastDay.made[g] || 0), 0) : pop * 2;
    const critical = food < pop * 2;
    const pendingFood = FOOD.filter(k => pending(town.id, k)).length;
    if ((food < pop * 4 || madeFood < pop * 1.3) && pendingFood < (critical ? 3 : 1) && (critical || !busy())) {
      const water = nearWater(town.x, town.y, 40);
      const kind = pop > 15 && count(town.id, 'veg_plot') <= count(town.id, 'forager') + count(town.id, 'fisher') ? 'veg_plot'
        : water > 6 && count(town.id, 'fisher') <= count(town.id, 'forager') ? 'fisher' : count(town.id, 'forager') <= count(town.id, 'hunter') * 2 ? 'forager' : 'hunter';
      want(kind, 'food is short');
      if (place(kind, kind === 'fisher' ? (x, y) => -nearWater(x, y, 12) * 3 : kind === 'veg_plot' ? null : (x, y) => -nearTrees(x, y, 20), kind === 'veg_plot' ? 100 : undefined)) return;
    }
    // 3. wood and stone
    if ((st.log || 0) < 30 + pop && count(town.id, 'woodcutter') < 1 + pop / 10 && !pending(town.id, 'woodcutter') && !busy()) {
      want('woodcutter', 'logs are short');
      if (place('woodcutter', (x, y) => -nearTrees(x, y, 25) * 2)) return;
    }
    if ((st.stone || 0) < 20 + pop / 2 && count(town.id, 'quarry') < 1 + pop / 20 && !pending(town.id, 'quarry') && nearRock(town.x, town.y, 70) > 3 && !busy()) {
      want('quarry', 'stone is short');
      if (place('quarry', (x, y) => -nearRock(x, y, 25) * 2, 90)) return;
    }
    // 4. industry and services the town is ready for — one at a time, in this order
    const rules = [
      ['well', () => count(town.id, 'well') < Math.ceil(pop / 25) && (st.stone || 0) >= 4, 'homes need water'],
      ['sawmill', () => (st.log || 0) > 25 && (st.plank || 0) < 20 + pop / 3 && count(town.id, 'sawmill') < 1 + pop / 60, 'planks for better homes'],
      ['market', () => pop >= 18 && count(town.id, 'market') < 1 + pop / 120, 'homes want a market'],
      ['chapel', () => pop >= 20 && !has('chapel') && !has('church') && !has('cathedral'), 'homes want a church'],
      ['church', () => pop >= 120 && !has('church') && !has('cathedral'), 'a bigger town wants a bigger church'],
      ['cathedral', () => pop >= 400 && !has('cathedral'), 'a great town wants a cathedral'],
      ['barracks', () => pop >= 60 && count(town.id, 'barracks') < 1 + Math.floor(pop / 250), 'room for more guards'],
      ['watchtower', () => pop >= 35 && count(town.id, 'watchtower') < Math.floor(pop / 60) + 1, 'archers to watch the edge of town'],
      ['farm', () => pop >= 30 && count(town.id, 'farm') < pop / 35, 'bread starts with grain'],
      ['mill', () => (st.grain || 0) > 8 && count(town.id, 'mill') < 1 + pop / 150, 'grain to flour'],
      ['bakery', () => (st.flour || 0) > 4 && count(town.id, 'bakery') < 1 + pop / 120, 'flour to bread'],
      ['barley_farm', () => pop >= 40 && count(town.id, 'barley_farm') < pop / 80, 'barley for ale'],
      ['brewery', () => (st.barley || 0) > 8 && count(town.id, 'brewery') < 1 + pop / 150, 'barley to ale'],
      ['pasture', () => pop >= 40 && count(town.id, 'pasture') < pop / 80, 'wool for cloth'],
      ['weaver', () => (st.wool || 0) > 6 && count(town.id, 'weaver') < 1 + pop / 150, 'wool to cloth'],
      ['tavern', () => pop >= 45 && count(town.id, 'tavern') < pop / 100, 'homes want a tavern'],
      ['smelter', () => (st.iron_ore || 0) > 6 && count(town.id, 'smelter') < 1 + pop / 150, 'ore to iron'],
      ['charcoal', () => has('smelter') && (st.coal || 0) < 6 && (st.log || 0) > 40 && count(town.id, 'charcoal') < 2, 'the smelter needs coal'],
      ['smithy', () => (st.iron || 0) > 4 && !has('smithy'), 'iron to tools'],
      ['armourer', () => (st.iron || 0) > 8 && has('smithy') && !has('armourer'), 'iron to weapons'],
      ['carpenter', () => (st.plank || 0) > 25 && count(town.id, 'townhouse') + count(town.id, 'house') > 2 && !has('carpenter'), 'furniture for fine homes'],
      ['goldsmith', () => (st.gold_ore || 0) > 4 && !has('goldsmith'), 'gold to jewellery'],
      ['fire_station', () => pop >= 35 && count(town.id, 'fire_station') < 1 + pop / 200, 'fires spread fast between thatched roofs'],
      ['healer', () => pop >= 60 && count(town.id, 'healer') < pop / 120, 'homes want a healer'],
      ['garden', () => pop >= 30 && count(town.id, 'garden') < pop / 50 && (st.log || 0) > 20, 'a nicer town draws settlers'],
      ['fountain', () => pop >= 80 && count(town.id, 'fountain') < pop / 120 && (st.stone || 0) > 40, 'a nicer town draws settlers'],
    ];
    for (const [kind, ok, why] of rules) {
      if (!KINDS[kind] || pending(town.id, kind) || !ok()) continue;
      want(kind, why);
      if (busy()) break;
      const k = KINDS[kind];
      if (!Object.entries(k.cost || {}).every(([g, n]) => (st[g] || 0) >= n)) continue;
      // watchtowers stand at the edge of town, everything else as near the middle as fits
      const edge = kind === 'watchtower' ? (x, y) => -dist(x, y, town.x, town.y) * 2 : null;
      if (place(kind, edge)) return;
    }
    // a dock in town when a far dock is waiting for one, or the town sits on water and has none
    // (play-test 2: docks open boat routes on their own)
    if (KINDS.dock && !pending(town.id, 'dock') && !count(town.id, 'dock') && pop >= 30 && (S.buildings.some(b => b.kind === 'dock' && b.state === 'up' && b.remote) || nearWater(town.x, town.y, 60) > 8) && (st.log || 0) >= 20) {
      want('dock', 'boats can carry goods along the water');
      if (place('dock', (x, y) => -nearWater(x, y, 6) * 6, 120)) return;
    }
    // 5. homes move up the ladder when their next level's needs are met and the stock allows
    const ups = S.buildings.filter(o => o.town === town.id && o.upgradeOf).length;
    if (ups < 2 + Math.floor(pop / 25)) {
      for (const b of S.buildings) {
        if (b.town !== town.id || b.state !== 'up' || !KINDS[b.kind].home || S.buildings.some(o => o.upgradeOf === b.id)) continue;
        const L = levelOf(b); if (L < 0 || L >= LADDER.length - 1) continue;
        const next = LADDER[L + 1];
        if (b.outskirts && L + 1 > 2) continue;              // the poor outskirts stop at cottages
        if ((b.lvlDrop || 0) > 0) continue;                    // a home losing its needs doesn't climb
        if (needsMissing(b, next).length) continue;
        const to = KINDS[next];
        if (!Object.entries(to.cost || {}).every(([g, n]) => (st[g] || 0) >= n * 1.5)) continue;
        if (upgrade(b, next)) return;
      }
    }
    // 6. street lamps along the roads where people live (the town lights up at night)
    if (pop >= 12) for (let k = 0; k < 12; k++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * Math.min(CFG.plotSearch, 20 + pop * 0.6);
      const x = Math.round(town.x + Math.cos(a) * r), y = Math.round(town.y + Math.sin(a) * r);
      if (!isRoad(x, y)) continue;
      let near = false;
      for (let dy = -7; dy <= 7 && !near; dy++) for (let dx = -7; dx <= 7; dx++) { const at = sim.cell(x + dx, y + dy); if (at && at.c.mat[at.i] === M.id.lamp) { near = true; break; } }
      if (near) continue;
      for (const [ox, oy] of [[2, 0], [-1, 0], [0, 2], [0, -1]]) {
        const at = sim.cell(x + ox, y + oy);
        if (!at || at.c.part[at.i] || at.c.mat[at.i] && (M.built[at.c.mat[at.i]] || M.liquid[at.c.mat[at.i]]) || M.flag.road[at.c.ground[at.i]]) continue;
        at.c.mat[at.i] = M.id.lamp; at.c.tall[at.i] = 2; at.c.dirty = true; sim.store.markEdited(at.c);
        break;
      }
      break;
    }
    // 7. a warehouse when storage runs short
    const room = S.buildings.filter(b => b.town === town.id && isStore(b)).reduce((a, b) => a + storeRoom(b), 0);
    if (room < 60 && !pending(town.id, 'warehouse')) { want('warehouse', 'the stores are full'); place('warehouse'); return; }
  }

  /** Rebuild a home as the next kind up. House and townhouse upgrades MERGE with a matching
   *  neighbour into one wider building when they can (owner: houses upgrade or merge). */
  function upgrade(b, to) {
    const k = KINDS[to];
    let x = b.x, y = b.y, w = k.w, h = k.h, partner = null;
    if (HOMES.mergeAt.includes(b.kind)) {
      partner = S.buildings.find(o => o !== b && o.town === b.town && o.kind === b.kind && o.state === 'up' && !S.buildings.some(q => q.upgradeOf === o.id)
        && Math.abs(o.y - b.y) <= 2 && (Math.abs(o.x - (b.x + b.w)) <= 3 || Math.abs(b.x - (o.x + o.w)) <= 3));
      if (partner) {
        x = Math.min(b.x, partner.x); y = Math.min(b.y, partner.y);
        w = Math.max(b.x + b.w, partner.x + partner.w) - x; h = Math.max(k.h, Math.max(b.y + b.h, partner.y + partner.h) - y);
        unstamp(b); unstamp(partner);
        const ok = fits(x, y, w, h, { margin: 0 });
        stamp(b); stamp(partner);
        if (!ok) partner = null, x = b.x, y = b.y, w = k.w, h = k.h;
      }
    }
    if (!partner) {
      const okHere = () => { unstamp(b); const ok = fits(x, y, w, h, { margin: 0 }); stamp(b); return ok; };
      if (!okHere()) { const t = S.towns.find(t => t.id === b.town); const s2 = findPlot(t, w, h, { near: b, radius: 25 }); if (!s2) return false; x = s2.x; y = s2.y; }
    }
    const site = { id: S.nextId++, kind: to, town: b.town, x, y, w, h, state: 'site', work: 0, need: { ...(k.cost || {}) }, got: {}, store: {}, workers: [], by: 'town', upgradeOf: b.id, mergeWith: partner?.id, born: sim.tick };
    if (partner) for (const [g, n] of Object.entries(site.need)) site.need[g] = Math.ceil(n * 1.4);
    S.buildings.push(site); byId.set(site.id, site);
    if (x !== b.x || y !== b.y || partner) { if (!partner) clearSite(site); }
    return true;
  }
  function onUpgraded(site) {
    const olds = [byId.get(site.upgradeOf), site.mergeWith != null ? byId.get(site.mergeWith) : null].filter(Boolean);
    for (const old of olds) {
      for (const p of S.people) if (p.home === old.id) p.home = site.id;
      removeBuilding(old);
    }
    clearSite(site); stamp(site);
    if (KINDS[site.kind].home && site.kind !== 'tent') makeYard(site);       // (clearSite just swept the old garden away)
    // (two homes merging used to toast every time: now it is just seen happening)
    delete site.upgradeOf; delete site.mergeWith;
  }
  const capacityOf = b => Math.round((KINDS[b.kind].houses || 0) * (b.w * b.h) / (KINDS[b.kind].w * KINDS[b.kind].h));

  /** Is (x, y) inside a closed wall ring? A bounded flood over 2-cell steps: if it gets far away
   *  without crossing a wall cell, it is outside. */
  function enclosed(x, y) {
    if (!sim.state.walls?.list?.length) return true;
    const seen = new Set(), q = [[Math.floor(x / 2), Math.floor(y / 2)]], R = 90;
    const sx = q[0][0], sy = q[0][1];
    for (let n = 0; q.length && n < 9000; n++) {
      const [cx, cy] = q.pop();
      if (Math.abs(cx - sx) > R || Math.abs(cy - sy) > R) return false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ox, ny = cy + oy, key = nx + ',' + ny;
        if (seen.has(key)) continue; seen.add(key);
        const at = sim.cell(nx * 2, ny * 2), at2 = sim.cell(nx * 2 + 1, ny * 2 + 1);
        const wall = c => c && (c.c.mat[c.i] && M.built[c.c.mat[c.i]] && !c.c.part[c.i] || M.flag.gate[c.c.mat[c.i]]);
        if (wall(at) || wall(at2)) continue;
        q.push([nx, ny]);
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ growth: food, needs, mood, migrants, taxes
  function daily(town) {
    const people = S.people.filter(p => p.town === town.id);
    const e = econOf(town.id);
    // eat: a varied table — whichever food the town has most of
    for (const p of people) {
      const st = stock(town.id);
      const g = foodGoods.slice().sort((a, b) => (st[b] || 0) - (st[a] || 0))[0];
      const got = takeStock(g, CFG.eatPerDay, p.x, p.y);
      if (got) used(g, got, town.id);
      p.hunger = got ? 0 : p.hunger + 1;
    }
    for (const p of people) if (p.hunger >= 2) { S.people.splice(S.people.indexOf(p), 1); say('A hungry family leaves.', 'bad', town.x, town.y); }
    // homes: eat their fine goods, check their needs, slip down a level after `dropDays` without
    let happy = 0, homesN = 0, tax = 0;
    const taxLevel = town.tax || 'normal';
    for (const b of S.buildings) {
      if (b.town !== town.id || b.state !== 'up' || !KINDS[b.kind].home) continue;
      b._cover = null;
      b.outskirts = !enclosed(b.x + (b.w >> 1), b.y + (b.h >> 1));
      const need = HOMES.needs[b.kind] || {};
      const households = Math.max(1, S.people.filter(p => p.home === b.id).length / 2);
      for (const [g, per] of Object.entries(need.goods || {})) { const want = Math.max(1, Math.round(per * households)); const got = takeStock(g, want, b.x, b.y); if (got) used(g, got, town.id); }
      const miss = needsMissing(b, b.kind);
      b.missing = miss;
      if (miss.length) { b.lvlDrop = (b.lvlDrop || 0) + 1; if (b.lvlDrop > HOMES.dropDays && levelOf(b) > 0) downgrade(b); }
      else b.lvlDrop = 0;
      homesN++;
      const sat = 1 - Math.min(1, miss.length / 3);
      happy += sat;
      tax += (levelOf(b) + 1) * CFG.taxPerHomeLevel * (HOMES.tax[taxLevel] ?? 1) * sat;
    }
    S.gold += Math.round(tax);
    // mood: needs met, tax, beauty, recent attacks (safety arrives with guards)
    const beauty = Math.min(0.15, S.buildings.filter(b => b.town === town.id && KINDS[b.kind].beauty && b.state === 'up').length * 0.02);
    town.mood = Math.max(0, Math.min(1, (homesN ? happy / homesN : 0.7) * 0.8 + 0.2 + (HOMES.taxMood[taxLevel] ?? 0) + beauty - (town.attacked || 0)));
    town.attacked = Math.max(0, (town.attacked || 0) * 0.5 - 0.01);
    // unhappy people drift away
    if (town.mood < 0.35) { const leave = Math.ceil(people.length * (0.35 - town.mood) * 0.2); for (let k = 0; k < leave; k++) { const p = S.people.filter(q => q.town === town.id && q.job == null)[k]; if (p) S.people.splice(S.people.indexOf(p), 1); } if (leave) say(`${leave} unhappy ${leave === 1 ? 'person leaves' : 'people leave'} ${town.name}.`, 'bad', town.x, town.y); }
    // the day's numbers, for the Economy screen
    e.days.push({ made: e.today.made, used: e.today.used, stock: stock(town.id), pop: S.people.filter(p => p.town === town.id).length, mood: town.mood, gold: S.gold });
    if (e.days.length > 20) e.days.shift();
    e.today = { made: {}, used: {} };
  }
  /** A home that lost its needs falls a level: same spot, the level's look, fewer households. */
  function downgrade(b) {
    const L = levelOf(b); if (L <= 0) return;
    const to = LADDER[L - 1];
    unstamp(b); b.kind = to; stamp(b); b.lvlDrop = 0;
    say(`A ${KINDS[LADDER[L]].name.toLowerCase()} slipped to a ${KINDS[to].name.toLowerCase()} (${(b.missing || []).join(', ')} missing).`, 'bad', b.x, b.y);
    const cap = capacityOf(b);
    const res = S.people.filter(p => p.home === b.id);
    for (const p of res.slice(cap)) p.home = null;
  }
  function migrants(town) {
    const pop = S.people.filter(p => p.town === town.id).length;
    const food = foodTotal(town.id);
    if (food < pop * 1.5) return;
    if ((town.mood ?? 0.7) < 0.4) return;
    if (byId.get(town.keep)?.state !== 'up') return;          // nobody settles by a razed keep
    // other systems can make a town more attractive (a passenger line to a big city, …): each hook
    // returns extra settlers to add to this group
    let extra = 0; for (const s of sim.systems) if (s.appeal) extra += s.appeal(town) || 0;
    extra += Math.max(0, ((town.mood ?? 0.7) - 0.6) * 4);
    const n = CFG.migrantGroup[0] + ((rng() * (CFG.migrantGroup[1] - CFG.migrantGroup[0] + 1)) | 0) + Math.floor(extra);
    // they come in along a road from out of town
    const a = rng() * Math.PI * 2;
    let sx = Math.round(town.x + Math.cos(a) * 60), sy = Math.round(town.y + Math.sin(a) * 60);
    for (let k = 0; k < 40; k++) { const at = sim.cell(sx, sy); if (at && nav.cost(sx, sy) < Infinity) break; sx = Math.round(town.x + Math.cos(a) * (60 - k)); sy = Math.round(town.y + Math.sin(a) * (60 - k)); }
    for (let k = 0; k < n; k++) addPerson(town, sx + k, sy);
    // no toast and no sound: newcomers arrive all the time (play-test 2: "they don't need to be
    // announced like that"); the population counter and Info show them
    town.arrived = (town.arrived || 0) + n;
  }

  function newTownName(seed) {
    const A = ['Ash', 'Barrow', 'Clear', 'Dunn', 'Elm', 'Fern', 'Glen', 'Hollow', 'Ivy', 'Kettle', 'Lark', 'Mill', 'Nether', 'Orchard', 'Pike', 'Quarry', 'Rook', 'Stone', 'Thistle', 'Wether'];
    const B = ['ford', 'field', 'wick', 'stead', 'ton', 'by', 'well', 'brook', 'cross', 'hollow'];
    for (let k = 0; k < 20; k++) { const n = A[(seed * 7 + k * 3) % A.length] + B[(seed * 13 + k) % B.length]; if (!S.towns.some(t => t.name === n)) return n; }
    return 'Newstead';
  }
  /** An outpost that is road-linked, safe and in a big enough kingdom gets a town hall beside it. */
  function hamlets() {
    const H = CFG.hamletAt; if (!H) return;
    if (S.people.length < H.pop) return;
    for (const b of S.buildings) {
      if (b.kind !== 'outpost' || b.state !== 'up' || b.grew) continue;
      if ((b.safety ?? 0) < H.safety) continue;
      const route = sim.state.routes?.list?.find(r => r.from === b.id);
      if (!route || (route.roadShare ?? 0) < H.road) continue;
      const k = KINDS.town_hall;
      const town = S.towns.find(t => t.id === b.town);
      const spot = findPlot({ x: b.x, y: b.y }, k.w, k.h, { radius: 30 }) || (fits(b.x + b.w + 3, b.y, k.w, k.h) ? { x: b.x + b.w + 3, y: b.y } : null);
      if (!spot || !town) continue;
      b.grew = true;
      const site = addBuilding('town_hall', spot.x, spot.y, town.id);
      site.need = {};            // the outpost's own folk raise it
      say('An outpost is growing into a hamlet.', 'good', b.x, b.y);
    }
  }

  // ------------------------------------------------------------------ the system
  function step() {
    // people act every tick; thinking is spread out so a big town does not spike
    // towns away from the camera run cheaper: their people act every 4th tick and walk 4 steps
    // at once (the same distance over the same time, at a quarter of the cost)
    const hot = new Map();
    for (const t of S.towns) hot.set(t.id, sim.isHot(Math.floor(t.x / 64), Math.floor(t.y / 64)));
    // raiders in town: everyone near one runs for the keep (or home) for a while
    if (sim.tick % 20 === 4) {
      const foes = (sim.state.military?.units || []).filter(u => u.side === 'enemy' && u.hp > 0);
      if (foes.length) for (const p of S.people) {
        if (p.boat || p.task?.t === 'flee') continue;
        if (!foes.some(u => dist(u.x, u.y, p.x, p.y) < 12)) continue;
        const town = S.towns.find(t => t.id === p.town); const keep = town && byId.get(town.keep);
        const to = keep && keep.state === 'up' ? door(keep) : byId.get(p.home) ? door(byId.get(p.home)) : null;
        if (p.carry) p.carry = null;
        p.task = { t: 'flee', until: sim.tick + 240 };
        if (to) goTo(p, to.x, to.y, 2);
      }
    }
    for (let k = 0; k < S.people.length; k++) {
      const p = S.people[k];
      const near = hot.get(p.town) !== false;
      if (!near && (sim.tick + p.id) % 4) continue;
      if (!p.task && ((sim.tick + p.id) % 10) && near) continue;
      p.stride = near ? 1 : 4;
      act(p);
    }
    for (const town of S.towns) {
      if ((sim.tick + town.id) % 40 === 0) { assignJobs(town); plan(town); }
      if ((sim.tick + town.id * 7) % (CFG.migrantEverySecs * 20) === 0) migrants(town);
    }
    if (sim.tick % sim.dayTicks === sim.dayTicks - 1) for (const town of S.towns) daily(town);
    if (sim.tick % 100 === 0) stepRegrow();
    if (sim.tick % 1200 === 600) for (const town of S.towns) { tidyRoads(town); paveMain(town); }
    if (S.wagons.length) stepWagons();
    if (sim.tick % 600 === 300) hamlets();
    // buildings that burned or broke: under half their cells left → gone
    if (sim.tick % 60 === 0) for (const b of [...S.buildings]) if (b.state === 'up' && !S.buildings.some(o => o.upgradeOf === b.id) && !intact(b)) { say(`${KINDS[b.kind].name} was lost: ${lostWhy(b)}.`, 'bad', b.x + (b.w >> 1), b.y + (b.h >> 1)); if (b.kind === 'keep') { b.state = 'site'; b.work = 0; } else removeBuilding(b); }
  }
  // Only the cells the blueprint actually BUILDS count (not the open ground of a market, the empty
  // rows of a field, a paddock's grass or crops that get harvested). Counting every footprint cell
  // made a market, pasture, dock or a harvested vegetable plot "lost" with nothing wrong at all.
  const solidCache = new Map();
  function solidCells(b) {
    const key = b.id + ':' + b.kind + ':' + b.w + 'x' + b.h;
    let list = solidCache.get(key);
    if (!list) { list = blueprint(shapeOf(b), M, b.id * 7919).filter(p => p.mat && !p.field && !p.outside); solidCache.set(key, list); if (solidCache.size > 4000) solidCache.clear(); }
    return list;
  }
  function intact(b) {
    const list = solidCells(b); if (!list.length) return true;
    let ok = 0;
    for (const p of list) { const at = sim.cell(b.x + p.dx, b.y + p.dy); if (!at) return true; if (at.c.part[at.i] === b.id && at.c.mat[at.i]) ok++; }
    return ok >= list.length * 0.5;
  }
  /** Why a building went: fire, enemies, or it simply fell (cracked by a blast or a quake). */
  function lostWhy(b) {
    let fire = 0;
    for (let dy = -1; dy <= b.h; dy++) for (let dx = -1; dx <= b.w; dx++) {
      const at = sim.cell(b.x + dx, b.y + dy); if (!at) continue;
      const { c, i } = at;
      if ((c.flag[i] & 1) || c.mat[i] === M.id.fire || c.ground[i] === M.id.scorched || c.mat[i] === M.id.ash) fire++;
    }
    if (fire > 2) return 'it burned down';
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (sim.military?.enemiesNear?.(cx, cy, 30)) return 'enemies tore it down';
    return 'it was knocked down';
  }

  // ------------------------------------------------------------------ settler wagons (play-test 2)
  // "Send a settler who starts another town and costs 500 coins." The wagon leaves the nearest town
  // with six of its folk and a load of logs, stone and food, rolls over land, and founds a town hall
  // where it stops. The new town grows by itself like any other.
  const SETTLER = data.settler || { gold: 500, people: 6, cargo: { log: 30, stone: 15 }, food: 30, minGap: 110 };
  function sendSettler(o) {
    if (!S.towns.length) return { error: 'Found your first town first.' };
    if (S.gold < SETTLER.gold) return { error: `A settler wagon costs ${SETTLER.gold} gold (you have ${Math.floor(S.gold)}).` };
    const close = S.towns.find(t => dist(t.x, t.y, o.x, o.y) < SETTLER.minGap);
    if (close) return { error: `Too close to ${close.name}: a new town needs ${SETTLER.minGap} m of room.` };
    const k = KINDS.town_hall;
    let spot = null;
    for (let r = 0; r < 50 && !spot; r += 2) for (let n = 0; n < 24 && !spot; n++) {
      const a = n / 24 * Math.PI * 2, px = Math.round(o.x + Math.cos(a) * r - k.w / 2), py = Math.round(o.y + Math.sin(a) * r - k.h / 2);
      if (fits(px, py, k.w, k.h, { margin: 2 })) spot = { x: wrapX(px), y: py };
    }
    if (!spot) return { error: 'No flat, dry land for a town hall there.' };
    const from = S.towns.slice().sort((a, b) => dist(o.x, o.y, a.x, a.y) - dist(o.x, o.y, b.x, b.y))[0];
    const keep = byId.get(from.keep);
    const d0 = keep ? door(keep) : { x: from.x, y: from.y };
    const res = nav.findLong(d0.x, d0.y, spot.x + (k.w >> 1), spot.y + k.h + 1, { maxNodes: 80000 });
    if (!res) return { error: 'The wagon cannot find a way over land to there.' };
    S.gold -= SETTLER.gold;
    // six of the town's free folk climb aboard, with what they will need
    const riders = S.people.filter(p => p.town === from.id && p.job == null && !p.boat).slice(0, SETTLER.people);
    for (const p of riders) S.people.splice(S.people.indexOf(p), 1);
    const cargo = {};
    for (const [g, n] of Object.entries(SETTLER.cargo || {})) { const got = takeStock(g, n, d0.x, d0.y); if (got) cargo[g] = got; }
    let food = SETTLER.food || 0;
    for (const g of foodGoods) { if (food <= 0) break; const got = takeStock(g, food, d0.x, d0.y); if (got) { cargo[g] = got; food -= got; } }
    const w = { id: S.nextId++, from: from.id, path: res.path, pi: 0, x: d0.x + 0.5, y: d0.y + 0.5, spot, people: Math.max(2, riders.length), cargo };
    S.wagons.push(w);
    say(`A settler wagon leaves ${from.name}.`, 'good', w.x, w.y);
    return { ok: true, id: w.id, secs: Math.round(res.cost / 0.12 / 20) };
  }
  function stepWagons() {
    for (const w of [...S.wagons]) {
      const step = w.path[w.pi];
      if (!step) {
        S.wagons.splice(S.wagons.indexOf(w), 1);
        const k = KINDS.town_hall;
        let { x, y } = w.spot;
        if (!fits(x, y, k.w, k.h, { margin: 0 })) { const alt = findPlot({ x: x + k.w / 2, y: y + k.h / 2 }, k.w, k.h, { radius: 30 }); if (alt) ({ x, y } = alt); }
        const b = { id: S.nextId++, kind: 'town_hall', town: w.from, x: wrapX(x), y, w: k.w, h: k.h, state: 'site', work: 0, need: {}, got: {}, store: {}, workers: [], by: 'player', born: sim.tick, wagon: { people: w.people, cargo: w.cargo } };
        S.buildings.push(b); byId.set(b.id, b);
        clearSite(b); finish(b);
        continue;
      }
      let dx = step[0] - w.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      const dy = step[1] - w.y, d = Math.hypot(dx, dy), spd = 0.12;
      if (d <= spd) { w.x = wrapX(step[0]); w.y = step[1]; w.pi++; }
      else { w.x = wrapX(w.x + dx / d * spd); w.y += dy / d * spd; }
    }
  }

  // ------------------------------------------------------------------ orders + views for the page
  function order(o) {
    if (o.t === 'settler') return sendSettler(o);
    if (o.t === 'found') return found(o);
    if (o.t === 'road') {
      if (o.tier !== 'dirt' && sim.unlocked?.('road:' + o.tier) === false) { say('Your kingdom does not know how to make that yet.', 'bad'); return 0; } const n = layRoad(o.x0, o.y0, o.x1, o.y1, o.tier, CFG.roadWidth ?? 3, 'player'); const cost = ROAD_COST[o.tier] || {}; for (const [g, k] of Object.entries(cost)) takeStock(g, Math.ceil(k * n / 8)); return n; }
    if (o.t === 'build') {
      const k = KINDS[o.kind]; if (!k) return null;
      if (sim.unlocked?.(o.kind) === false) { say('Your kingdom does not know how to make that yet.', 'bad', o.x, o.y); return { error: 'locked' }; }
      if (k.landmark && !o.landmark) { say('Landmarks are earned at population milestones.', 'bad', o.x, o.y); return { error: 'landmark' }; }
      const town = S.towns.slice().sort((a, b) => dist(o.x, o.y, a.x, a.y) - dist(o.x, o.y, b.x, b.y))[0];
      if (!town) return null;
      let x = Math.round(o.x - k.w / 2), y = Math.round(o.y - k.h / 2);
      let node = null;
      if (k.node) {
        node = sim.discover?.nodeAt(o.x, o.y);
        if (!node || node.kind !== k.node) { say(`A ${k.name.toLowerCase()} has to go on ${sim.discover?.NAMES[k.node] || k.node} you have found.`, 'bad', o.x, o.y); return null; }
        if (S.buildings.some(b => b.node === node.id)) { say('Something already works that seam.', 'bad', o.x, o.y); return null; }
        x = node.x - (k.w >> 1); y = node.y + 3;
        if (!fits(x, y, k.w, k.h, { margin: 0 })) { for (const [ox, oy] of [[0, -k.h - 6], [k.w + 3, -2], [-k.w - 3, -2], [0, 6]]) if (fits(node.x - (k.w >> 1) + ox, node.y + oy, k.w, k.h, { margin: 0 })) { x = node.x - (k.w >> 1) + ox; y = node.y + oy; break; } }
      }
      if (!fits(x, y, k.w, k.h, { margin: 0 })) { say("That won't fit there.", 'bad', o.x, o.y); return null; }
      const b = addBuilding(o.kind, x, y, town.id, { by: 'player' });
      if (node) b.node = node.id;
      return b;
    }
    if (o.t === 'tax') { const t = S.towns.find(t => t.id === o.town) || S.towns[0]; if (t && HOMES.tax[o.level] != null) t.tax = o.level; return t?.tax ?? null; }
    if (o.t === 'move') {
      // owner: buildings can be moved instantly for a gold fee
      const b = byId.get(o.id); if (!b || b.kind === 'keep' || b.state !== 'up') return null;
      const fee = Math.max(10, Math.round(Object.values(KINDS[b.kind].cost || {}).reduce((a, n) => a + n, 0) * 1.5));
      if (S.gold < fee) { say(`Moving it costs ${fee} gold.`, 'bad', b.x, b.y); return { error: 'gold', fee }; }
      const x = Math.round(o.x - b.w / 2), y = Math.round(o.y - b.h / 2);
      unstamp(b);
      if (!fits(x, y, b.w, b.h, { margin: 0 })) { stamp(b); say("It won't fit there.", 'bad', o.x, o.y); return null; }
      S.gold -= fee; b.x = wrapX(x); b.y = y; clearSite(b); stamp(b); b._cover = null;
      for (const p of S.people) if (p.task?.b === b.id) { p.task = null; p.path = null; }
      return { id: b.id, x: b.x, y: b.y, fee };
    }
    if (o.t === 'demolish') {
      const b = byId.get(o.id); if (!b || b.kind === 'keep') return null;
      for (const [g, n] of Object.entries(b.got)) { const st = nearestStore(b.x, b.y, 1, b.town); if (st) st.store[g] = (st.store[g] || 0) + Math.floor(n / 2); }
      removeBuilding(b); return true;
    }
    return null;
  }

  /** What a person is doing right now, for the page to animate: 0 nothing / walking, 1 chopping,
   *  2 digging (quarry, mine), 3 field work (farm, forage, herd), 4 fishing, 5 building, 6 fighting a
   *  fire, 7 hunting, 8 workshop, 9 fleeing. */
  const ACT = { chop: 1, quarry: 2, mine: 2, farm: 3, forage: 3, herd: 3, fish: 4, hunt: 7 };
  function actOf(p) {
    const t = p.task; if (!t) return 0;
    if (t.t === 'flee') return 9;
    if (p.path && p.pi < p.path.length) return 0;
    if (t.t === 'gather') { const b = byId.get(t.b); return ACT[b && KINDS[b.kind].job?.kind] || 0; }
    if (t.t === 'build') return 5;
    if (t.t === 'douse') return 6;
    if (t.t === 'craft') return 8;
    return 0;
  }
  /** Small snapshot for the page: people in a world rect (unwrapped), buildings summary, stock. */
  function view(rect) {
    const people = [];
    for (const p of S.people) {
      let x = p.x; if (rect) { while (x < rect.x0) x += W; while (x > rect.x1) x -= W; if (x < rect.x0 || p.y < rect.y0 || p.y > rect.y1) continue; }
      people.push([+(x.toFixed(2)), +(p.y.toFixed(2)), p.carry ? p.carry.g : 0, p.job != null ? 1 : 0, p.task?.t === 'build' ? 1 : 0, p.id, actOf(p), p.boat ? 1 : 0]);
    }
    return {
      gold: Math.floor(S.gold), people,
      wagons: S.wagons.map(w => [+w.x.toFixed(1), +w.y.toFixed(1), w.id]),
      towns: S.towns.map(t => townCard(t)),
      stock: stock(), pop: S.people.length,
      kinds: S.buildings.reduce((o, b) => { const k = b.kind + (b.state === 'site' ? '*' : ''); o[k] = (o[k] || 0) + 1; return o; }, {}),
    };
  }
  /** Road runs touching the view (zoomed out they are drawn as lines so roads read from far away). */
  function roadsIn(rect) {
    if (!rect) return [];
    const out = [];
    for (const [x0, y0, x1, y1, tier] of S.roads) {
      if (Math.max(y0, y1) < rect.y0 - 4 || Math.min(y0, y1) > rect.y1 + 4) continue;
      let a = x0; while (a < rect.x0 - 300) a += W; while (a > rect.x1 + 300) a -= W;
      const b = a + (x1 - x0);
      if (Math.max(a, b) < rect.x0 - 4 || Math.min(a, b) > rect.x1 + 4) continue;
      out.push([a, y0, b, y1, tier === 'stone' ? 2 : tier === 'gravel' ? 1 : 0]);
      if (out.length > 1500) break;
    }
    return out;
  }
  function townCard(t) {
    const people = S.people.filter(p => p.town === t.id);
    const e = econOf(t.id);
    const st = stock(t.id);
    const prev = e.days.length ? e.days[e.days.length - 1].pop : people.length;
    const homesBy = {}; let homeless = 0, jobless = 0, workers = 0;
    for (const b of S.buildings) if (b.town === t.id && KINDS[b.kind].home && b.state === 'up') homesBy[b.kind] = (homesBy[b.kind] || 0) + 1;
    for (const p of people) { if (p.home == null) homeless++; if (p.job == null) jobless++; else workers++; }
    const missing = {};
    for (const b of S.buildings) if (b.town === t.id && b.missing) for (const m of b.missing) missing[m] = (missing[m] || 0) + 1;
    const short = Object.entries(missing).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const foodNow = foodGoods.reduce((a, g) => a + (st[g] || 0), 0);
    return { foodDays: people.length ? +(foodNow / (people.length * CFG.eatPerDay)).toFixed(1) : 99, radius: radius(t), arrived: t.arrived || 0, id: t.id, name: t.name, x: t.x, y: t.y, pop: people.length, trend: people.length - prev, mood: +(t.mood ?? 0.7).toFixed(2), tax: t.tax || 'normal', stock: st, short, missing, homesBy, homeless, jobless, workers, wants: t.wants || [], days: e.days.map(d => ({ made: d.made, used: d.used, pop: d.pop, mood: d.mood })), today: e.today, safety: t.safety ?? null };
  }
  /** Buildings in a world rect for the data layers: [id, kind, x, y, w, h, level, missing[], beauty]. */
  function layerView(rect) {
    const out = [];
    for (const b of S.buildings) {
      let x = b.x; while (x < rect.x0 - 20) x += W; while (x > rect.x1 + 20) x -= W;
      if (x + b.w < rect.x0 || x > rect.x1 || b.y + b.h < rect.y0 || b.y > rect.y1) continue;
      const home = KINDS[b.kind].home;
      const cov = home ? (b._cover || (b._cover = coverAt(b.x + (b.w >> 1), b.y + (b.h >> 1), b.town))) : null;
      out.push({ id: b.id, kind: b.kind, x, y: b.y, w: b.w, h: b.h, level: home ? levelOf(b) : -1, missing: b.missing || [], cover: cov, beauty: home ? +beautyAt(b.x, b.y).toFixed(1) : 0, site: b.state === 'site', safety: b.safety ?? null });
    }
    return out;
  }
  function buildingAt(x, y) {
    const at = sim.cell(x, y); if (!at) return null;
    const id = at.c.part[at.i]; if (!id) return null;
    const b = byId.get(id); if (!b) return null;
    const k = KINDS[b.kind];
    const home = S.people.filter(p => p.home === b.id).length;
    const extra = { level: KINDS[b.kind].home ? levelOf(b) : -1, missing: b.missing || [], input: b.input || null, idle: b.idle || 0, remote: !!b.remote, moveFee: Math.max(10, Math.round(Object.values(k.cost || {}).reduce((a, n) => a + n, 0) * 1.5)) };
    return { ...extra, id: b.id, kind: b.kind, name: k.name, state: b.state, progress: k.work ? Math.min(1, b.work / k.work) : 1, need: missing(b), store: b.store, workers: b.workers.length, slots: k.job?.workers || 0, residents: home, houses: k.houses || 0, x: b.x, y: b.y, w: b.w, h: b.h };
  }

  return { step, order, view, layerView, coverAt, buildingAt, stock, found, fits, findPlot, layRoad, addBuilding, nav, radius, streetPoint, longRoad, get state() { return S; }, reindex };
}
