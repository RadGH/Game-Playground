// Walls, wall damage and repair, rubble, fire fighting, firebreaks and painted areas. PURE, a sim
// system.
//
// Owner (2026-11-03):
//   * walls are DRAWN as lines; the wall is built at your best tier, towers go up at corners and
//     about every 30 m, and a gate appears wherever a road crosses. Walls upgrade in place
//     (palisade → stone → thick stone);
//   * every wall cell has its own hit points and shows cracks; at 0 the cell drops as debris and
//     the column above it falls STRAIGHT DOWN; a breach is a real gap enemies can walk through;
//   * debris fades after a few minutes;
//   * repair is automatic and free, slow, and only once no enemy is near;
//   * fire stations send firefighters who carry real water; townsfolk join bucket lines near home;
//     cleared strips (firebreaks) and stone stop the spread;
//   * the player can paint "keep clear" and "build here" areas (and nothing more) to steer growth.
//
// HP lives in the cell's `hp` byte, scaled so 255 = this tier's full hit points; cracks are drawn
// by the painter from it. sim.damage(x, y, amount) is the one way anything hurts a built cell, so
// later catapults, monsters and powers all share it.

import { BURN, WET } from './cells.js';
import { blastOf } from './blast.js';

export function createWalls(sim, data) {
  const { M } = sim;
  const CFG = data.walls;
  const S = sim.state.walls ??= { list: [], rubble: [], zones: [], nextId: 1 };
  const W = sim.W;
  const wrapX = x => ((x % W) + W) % W;
  const T = () => sim.state.town;
  const say = (text, kind, x, y) => sim.events.push({ t: 'say', text, kind, x, y });
  const tierOfMat = new Map(Object.entries(CFG.tiers).map(([k, t]) => [M.id[t.mat], k]));

  // ------------------------------------------------------------------ drawing a wall
  /** 4-connected cells from a to b (no diagonal gaps an enemy could slip through). */
  function lineCells(x0, y0, x1, y1) {
    let dx = x1 - x0; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy));
    const out = [];
    let px = x0, py = y0; out.push([px, py]);
    for (let k = 1; k <= n; k++) {
      const x = Math.round(x0 + dx * k / n), y = Math.round(y0 + dy * k / n);
      if (x !== px && y !== py) out.push([x, py]);         // step sideways first: no diagonal holes
      out.push([x, y]); px = x; py = y;
    }
    return out;
  }
  function payable(cost, n) {
    const st = sim.town.stock();
    return Object.entries(cost).every(([g, k]) => (st[g] || 0) >= k * n);
  }
  function pay(cost, n, x, y) { for (const [g, k] of Object.entries(cost)) takeFromStock(g, k * n, x, y); }
  function takeFromStock(g, n, x, y) {
    const list = T().buildings.filter(b => b.state === 'up' && data.kinds[b.kind].kingdom && (b.store[g] || 0) > 0);
    let left = n;
    for (const b of list) { const k = Math.min(left, b.store[g]); b.store[g] -= k; left -= k; if (!left) break; }
    return n - left;
  }

  /** The best wall the stock allows (stone needs stone, thick needs twice that). */
  function bestTier(n) {
    for (const k of ['thick', 'stone', 'wood']) if ((k === 'wood' || sim.unlocked?.('wall:' + k) !== false) && payable(CFG.tiers[k].cost, n)) return k;
    return null;
  }

  function placeCell(x, y, mat, tall, hp, wallId, kind) {
    const at = sim.cell(x, y); if (!at) return false;
    const { c, i } = at;
    if (c.part[i]) return false;                               // never over a building
    if (M.liquid[c.mat[i]]) return false;
    c.mat[i] = mat; c.tall[i] = tall; c.hp[i] = hp; c.part[i] = 0;
    c.flag[i] &= ~BURN;
    c.dirty = true; sim.store.markEdited(c); sim.wake(c);
    return true;
  }

  function drawWall(o) {
    const pts = o.points || [[o.x0, o.y0], [o.x1, o.y1]];
    let cells = [];
    for (let k = 0; k + 1 < pts.length; k++) cells.push(...lineCells(pts[k][0] | 0, pts[k][1] | 0, pts[k + 1][0] | 0, pts[k + 1][1] | 0));
    // drop duplicates
    const seen = new Set(); cells = cells.filter(([x, y]) => { const key = wrapX(x) + ',' + y; if (seen.has(key)) return false; seen.add(key); return true; });
    if (!cells.length) return null;
    // the Lines tab asks for a wooden or a stone wall by name (play-test 2: no more "best you can afford")
    if (o.tier && CFG.tiers[o.tier] && !payable(CFG.tiers[o.tier].cost, cells.length)) { say(`Not enough ${o.tier === 'wood' ? 'logs' : 'stone'} for ${cells.length} m of ${CFG.tiers[o.tier].name.toLowerCase()}.`, 'bad', pts[0][0], pts[0][1]); return { error: 'cost' }; }
    const tier = o.tier && CFG.tiers[o.tier] ? o.tier : bestTier(cells.length);
    if (!tier) { say('Not enough logs or stone for that wall.', 'bad', pts[0][0], pts[0][1]); return null; }
    const t = CFG.tiers[tier];
    const wall = { id: S.nextId++, tier, cells: [], towers: [], gates: [] };
    // towers at the ends, at corners, and every towerEvery cells
    const towerAt = new Set([0, cells.length - 1]);
    for (let k = 1; k < cells.length - 1; k++) {
      if (k % CFG.towerEvery === 0) towerAt.add(k);
    }
    for (let k = 1; k + 1 < pts.length; k++) {
      const idx = cells.findIndex(([x, y]) => x === (pts[k][0] | 0) && y === (pts[k][1] | 0));
      if (idx > 0) towerAt.add(idx);
    }
    const mat = M.id[t.mat];
    let placed = 0;
    for (let k = 0; k < cells.length; k++) {
      const [x, y] = cells[k];
      const at = sim.cell(x, y); if (!at) continue;
      const road = M.flag.road[at.c.ground[at.i]] || at.c.mat[at.i] === M.id.bridge;
      if (road) { if (placeCell(x, y, M.id.gate, 0, 255, wall.id)) { wall.gates.push([wrapX(x), y]); placed++; } continue; }
      if (placeCell(x, y, mat, t.tall, 255, wall.id)) { wall.cells.push([wrapX(x), y, mat, t.tall]); placed++; }
    }
    for (const k of towerAt) {
      const [cx, cy] = cells[k]; const r = CFG.towerSize >> 1;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const at = sim.cell(cx + dx, cy + dy); if (!at || M.flag.road[at.c.ground[at.i]]) continue;
        const tall = t.tall + CFG.towerExtra + ((dx + dy) & 1 && (Math.abs(dx) === r || Math.abs(dy) === r) ? 1 : 0);
        if (placeCell(cx + dx, cy + dy, mat, tall, 255, wall.id)) wall.cells.push([wrapX(cx + dx), cy + dy, mat, tall]);
      }
      wall.towers.push([wrapX(cx), cy]);
    }
    if (!placed) return null;
    pay(t.cost, wall.cells.length, pts[0][0], pts[0][1]);
    S.list.push(wall);
    sim.events.push({ t: 'walls' });
    return { id: wall.id, tier, cells: wall.cells.length, towers: wall.towers.length, gates: wall.gates.length };
  }

  /** Upgrade every cell of a wall to the next tier, in place. */
  function upgradeWall(id) {
    const wall = S.list.find(w => w.id === id); if (!wall) return null;
    const next = wall.tier === 'wood' ? 'stone' : null;     // wood → stone only (the thick tier is kept for old saves)
    if (!next) return null;
    const t = CFG.tiers[next];
    if (!payable(t.cost, wall.cells.length)) { say(`Not enough for a ${t.name.toLowerCase()}.`, 'bad'); return null; }
    pay(t.cost, wall.cells.length);
    const grow = t.tall - CFG.tiers[wall.tier].tall;
    for (const cell of wall.cells) { cell[2] = M.id[t.mat]; cell[3] += grow; placeCell(cell[0], cell[1], cell[2], cell[3], 255, wall.id); }
    wall.tier = next;
    return { id, tier: next };
  }

  // ------------------------------------------------------------------ damage, collapse, rubble
  /**
   * Hurt a built cell. `amount` in hit points of the cell's tier. Returns true if it broke.
   * Walls scale by their tier's hp; other built cells by their material hardness.
   */
  function damage(x, y, amount, opts = null) {
    const at = sim.cell(x, y); if (!at) return false;
    const { c, i } = at, m = c.mat[i];
    if (!m || !(M.built[m] || M.solid[m]) || M.flag.road[c.ground[i]] && !M.built[m]) return false;
    if (m === M.id.rail) return false;                            // track can never be damaged
    const tier = tierOfMat.get(m);
    // play-test 2 (owner): a stone wall is "basically invincible except from explosions"; a wooden
    // one is strong but burns. Clubs, claws and swords barely scratch stone; blasts (catapults,
    // sappers' kegs, meteors) hit it in full.
    if (!opts?.blast && CFG.tiers[tier]?.melee != null) amount *= CFG.tiers[tier].melee;
    const full = tier ? CFG.tiers[tier].hp : Math.max(20, M.hard[m]);
    const hp = c.hp[i] / 255 * full - amount;
    c.dirty = true; sim.store.markEdited(c);
    if (hp > 0) { c.hp[i] = Math.max(1, Math.round(hp / full * 255)); return false; }
    collapse(c, i, x, y);
    return true;
  }
  /** A broken cell: its column falls straight down as rubble around its foot, which fades later. */
  function collapse(c, i, x, y) {
    const tall = c.tall[i];
    c.mat[i] = 0; c.tall[i] = 0; c.hp[i] = 0; c.part[i] = 0;
    c.dirty = true; sim.store.markEdited(c); sim.wake(c);
    sim.events.push({ t: 'collapse', x, y, tall });
    // tall columns shower debris straight down around their foot (the shared falling-debris effect,
    // whose pieces land as rubble that fades); the cell itself becomes a heap
    let n = 1 + Math.floor(tall / 2);
    if (tall > 1) { try { blastOf(sim).dropColumn(x, y, tall, [M.r[sim.M.id.rubble], M.g[sim.M.id.rubble], M.b[sim.M.id.rubble]]); n = 1; } catch { /* no debris module: plain heap */ } }
    const spots = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]];
    n = Math.min(spots.length, n);
    for (let k = 0; k < n; k++) {
      const [ox, oy] = spots[k];
      const at = sim.cell(x + ox, y + oy); if (!at) continue;
      const o = at.c.mat[at.i];
      if (o && (M.built[o] || M.liquid[o])) continue;
      at.c.mat[at.i] = M.id.rubble; at.c.tall[at.i] = 1; at.c.part[at.i] = 0;
      at.c.dirty = true; sim.store.markEdited(at.c);
      S.rubble.push([wrapX(x + ox), y + oy, sim.tick + CFG.rubbleSecs * 20 + ((sim.rng() * 400) | 0)]);
    }
  }
  function stepRubble() {
    for (let k = S.rubble.length - 1; k >= 0; k--) {
      const [x, y, until] = S.rubble[k];
      if (until > sim.tick) continue;
      S.rubble.splice(k, 1);
      const at = sim.cell(x, y);
      if (at && at.c.mat[at.i] === M.id.rubble) { at.c.mat[at.i] = 0; at.c.tall[at.i] = 0; at.c.dirty = true; sim.store.markEdited(at.c); }
    }
  }

  // heat and lava wear walls down (wood burns by the cell rules; stone cracks in great heat)
  function stepHeat() {
    for (const wall of S.list) for (const [x, y, mat] of wall.cells) {
      const at = sim.cell(x, y); if (!at) continue;
      const { c, i } = at;
      if (c.mat[i] !== mat) continue;
      if (c.temp[i] > 180 && !M.ignite[mat]) damage(x, y, (c.temp[i] - 170) * 0.15);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = sim.cell(x + ox, y + oy); if (n && n.c.mat[n.i] === M.id.lava) { damage(x, y, 6); break; } }
    }
  }

  /** Free, slow repair of every wall, only while no enemy is near it. */
  function stepRepair() {
    const enemies = sim.enemiesNear;     // a later system sets this: (x, y, r) → bool
    for (const wall of S.list) {
      for (const [x, y, mat, tall] of wall.cells) {
        if (enemies && enemies(x, y, 40)) continue;
        const at = sim.cell(x, y); if (!at) continue;
        const { c, i } = at;
        if (c.mat[i] === mat) { if (c.hp[i] < 255) { c.hp[i] = Math.min(255, c.hp[i] + CFG.repairHp); c.dirty = true; sim.store.markEdited(c); } }
        else if (!c.mat[i] || c.mat[i] === M.id.rubble || c.mat[i] === M.id.charwood) {
          // rebuilt from nothing, low at first
          c.mat[i] = mat; c.tall[i] = tall; c.hp[i] = 60; c.dirty = true; sim.store.markEdited(c); sim.wake(c);
        }
      }
    }
  }

  // ------------------------------------------------------------------ fire fighting
  /** Burning cells near a point (sampled). */
  function firesNear(x, y, r) {
    const out = [];
    for (let k = 0; k < 160; k++) {
      const a = sim.rng() * Math.PI * 2, d = sim.rng() * r;
      const px = Math.round(x + Math.cos(a) * d), py = Math.round(y + Math.sin(a) * d);
      const at = sim.cell(px, py); if (at && at.c.flag[at.i] & BURN) out.push([px, py]);
      if (out.length > 4) break;
    }
    return out;
  }
  /** Put out fire around (x, y): water on the burning cells and wet ground around them. */
  function douse(x, y, r = 2) {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const at = sim.cell(x + dx, y + dy); if (!at) continue;
      const { c, i } = at;
      if (c.flag[i] & BURN) { c.flag[i] &= ~BURN; if (c.mat[i] === M.id.fire) { c.mat[i] = 0; c.tall[i] = 0; } n++; }
      c.flag[i] |= WET; c.temp[i] = Math.min(c.temp[i], M.ambient);
      c.dirty = true; sim.store.markEdited(c);
    }
    return n;
  }
  /** Firefighters and neighbours (play-test 2: "they don't seem to be putting out fires"): every fire
   *  in or near a town is answered — the fire station's crew from far off, and ANY townsfolk close
   *  by drop what they are doing (a fire spreads faster than a woodpile waits). Up to a dozen per
   *  blaze; each goes for the nearest burning cell. */
  function fireDuty() {
    const t = T(); if (!t) return;
    const blazes = [];
    for (const b of t.buildings) {
      if (b.state !== 'up' || b.town < 0) continue;
      const k = data.kinds[b.kind];
      const r = k.job?.kind === 'firefight' ? k.job.radius : Math.max(b.w, b.h) + 6;
      const fires = firesNear(b.x + (b.w >> 1), b.y + (b.h >> 1), r);
      if (!fires.length) continue;
      b.fireAlarm = sim.tick;
      if (k.job?.kind !== 'firefight') blazes.push({ x: b.x + (b.w >> 1), y: b.y + (b.h >> 1), fires, town: b.town });
      else for (const p of t.people) if (p.job === b.id && p.task?.t !== 'douse') { const [fx, fy] = fires[0]; p.task = { t: 'douse', fx, fy, water: false }; p.path = null; }
    }
    // a fire anywhere in or just around a town (a burning hedge, a garden, the wood at the edge of
    // town) is answered too, before it can reach the houses
    for (const town of t.towns) {
      const R = (sim.town.radius?.(town) ?? 60) + 25;
      const fires = firesNear(town.x, town.y, R);
      if (fires.length) blazes.push({ x: fires[0][0], y: fires[0][1], fires, town: town.id });
    }
    for (const z of blazes) {
      const busy = t.people.filter(p => p.task?.t === 'douse' && Math.hypot(wrapD(p.task.fx - z.x), p.task.fy - z.y) < 30).length;
      if (busy >= 12) continue;
      const near = t.people.filter(p => !p.boat && p.task?.t !== 'douse' && p.task?.t !== 'flee' && Math.hypot(wrapD(p.x - z.x), p.y - z.y) < 40)
        .sort((a, b) => Math.hypot(wrapD(a.x - z.x), a.y - z.y) - Math.hypot(wrapD(b.x - z.x), b.y - z.y));
      for (const p of near.slice(0, 12 - busy)) {
        const [fx, fy] = z.fires[(sim.rng() * z.fires.length) | 0];
        if (p.carry && p.task?.t !== 'drop') p.carry = null;
        p.task = { t: 'douse', fx, fy, water: false };
        p.path = null;
      }
    }
  }
  const wrapD = d => { if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };
  /** The nearest burning cell to (x, y) within r, or null. */
  function nearestFire(x, y, r = 8) {
    let best = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy; if (d >= bd || d > r * r) continue;
      const at = sim.cell(x + dx, y + dy); if (at && at.c.flag[at.i] & BURN) { bd = d; best = [Math.floor(x + dx), Math.floor(y + dy)]; }
    }
    return best;
  }

  // ------------------------------------------------------------------ painted areas + firebreaks
  function paint(o) {
    if (o.t === 'zone') {
      // a rectangle of 'clear' (nothing gets built) or 'build' (the town prefers it); 'erase' removes
      const x0 = Math.min(o.x0, o.x1) | 0, y0 = Math.min(o.y0, o.y1) | 0, x1 = Math.max(o.x0, o.x1) | 0, y1 = Math.max(o.y0, o.y1) | 0;
      if (o.kind === 'erase') { S.zones = S.zones.filter(z => !(z.x0 < x1 && z.x1 > x0 && z.y0 < y1 && z.y1 > y0)); return true; }
      S.zones.push({ kind: o.kind === 'build' ? 'build' : 'clear', x0, y0, x1, y1 });
      return true;
    }
    if (o.t === 'firebreak') {
      let n = 0;
      for (const [x, y] of lineCells(o.x0 | 0, o.y0 | 0, o.x1 | 0, o.y1 | 0)) for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) {
        const at = sim.cell(x + ox, y + oy); if (!at) continue;
        const { c, i } = at;
        if (c.part[i] || (c.mat[i] && (M.built[c.mat[i]] || M.liquid[c.mat[i]]))) continue;
        if (M.flag.road[c.ground[i]]) continue;
        c.mat[i] = 0; c.tall[i] = 0; c.ground[i] = M.id.firebreak; c.flag[i] &= ~BURN;
        c.dirty = true; sim.store.markEdited(c); n++;
      }
      return n;
    }
    return null;
  }
  const inZone = (x, y, kind) => S.zones.some(z => z.kind === kind && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
  /** Does a footprint touch a keep-clear area? (town.fits asks this) */
  function blocked(x, y, w, h) { return S.zones.some(z => z.kind === 'clear' && x < z.x1 && x + w > z.x0 && y < z.y1 && y + h > z.y0); }

  // ------------------------------------------------------------------ towns wall themselves (play-test 2)
  // "The city should automatically build its own roads, walls, gates, fire breaks, towers." A town
  // big enough rings itself: a wall a few metres outside its outermost building, laid a stretch at a
  // time while the stock can spare the logs (stone later), with a gate wherever a road crosses, a
  // tower every 30 m, and a cleared firebreak band just outside. When the town outgrows the ring it
  // builds a bigger one and takes the old one down once the new one is closed.
  const AW = data.autoWall || { minPop: 45, margin: 9, stretch: 14, reserve: { log: 40, stone: 40 }, stoneAt: 160, regrow: 22, firebreak: [3, 6] };
  S.rings ??= [];
  function ringCells(cx, cy, R) {
    const n = Math.max(16, Math.round(R / 5));
    const pts = [];
    for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; pts.push([Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R)]); }
    const out = []; const seen = new Set();
    for (let k = 0; k + 1 < pts.length; k++) for (const [x, y] of lineCells(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1])) { const key = wrapX(x) + ',' + y; if (!seen.has(key)) { seen.add(key); out.push([wrapX(x), y]); } }
    return out;
  }
  function autoWalls() {
    const t = T(); if (!t?.towns?.length) return;
    for (const town of t.towns) {
      const pop = t.people.filter(p => p.town === town.id).length;
      if (pop < AW.minPop || !sim.town.radius) continue;
      const R = sim.town.radius(town) + AW.margin;
      const mine = S.rings.filter(r => r.town === town.id);
      const cur = mine.at(-1);
      if (!cur || (cur.done && R > cur.R + AW.regrow && R < 320)) {
        const wall = { id: S.nextId++, tier: 'wood', cells: [], towers: [], gates: [], town: town.id, auto: true };
        S.list.push(wall);
        S.rings.push({ town: town.id, R, cx: town.x, cy: town.y, wall: wall.id, plan: ringCells(town.x, town.y, R), next: 0, done: false });
        continue;
      }
      if (!cur.done) buildStretch(town, cur);
      else upgradeStretch(town, cur);
    }
  }
  function buildStretch(town, ring) {
    const wall = S.list.find(w => w.id === ring.wall); if (!wall) { ring.done = true; return; }
    const st = sim.town.stock(town.id);
    const t = CFG.tiers[wall.tier], mat = M.id[t.mat];
    const costG = Object.keys(t.cost)[0];
    let room = Math.floor(((st[costG] || 0) - (AW.reserve[costG] ?? 40)) / (t.cost[costG] || 1));
    if (room <= 0) return;
    let laid = 0;
    while (ring.next < ring.plan.length && laid < AW.stretch && room > 0) {
      const k = ring.next++;
      const [x, y] = ring.plan[k];
      const at = sim.cell(x, y); if (!at) continue;
      const { c, i } = at;
      if (c.part[i] || M.liquid[c.mat[i]] || c.mat[i] === M.id.rail) continue;          // a building or water: leave the gap
      const road = M.flag.road[c.ground[i]] || c.mat[i] === M.id.bridge;
      if (road) { if (c.mat[i] !== M.id.bridge && placeCell(x, y, M.id.gate, 0, 255, wall.id)) wall.gates.push([x, y]); continue; }
      if (c.mat[i] && M.built[c.mat[i]]) continue;                                       // someone's wall already
      const tower = k % CFG.towerEvery === 0;
      if (placeCell(x, y, mat, t.tall + (tower ? CFG.towerExtra : 0), 255, wall.id)) { wall.cells.push([x, y, mat, t.tall + (tower ? CFG.towerExtra : 0)]); laid++; room--; }
      if (tower) {
        const r = CFG.towerSize >> 1;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (!dx && !dy) continue;
          const a2 = sim.cell(x + dx, y + dy); if (!a2 || M.flag.road[a2.c.ground[a2.i]] || a2.c.part[a2.i] || M.liquid[a2.c.mat[a2.i]] || (a2.c.mat[a2.i] && M.built[a2.c.mat[a2.i]])) continue;
          if (placeCell(x + dx, y + dy, mat, t.tall + CFG.towerExtra, 255, wall.id)) wall.cells.push([wrapX(x + dx), y + dy, mat, t.tall + CFG.towerExtra]);
        }
        wall.towers.push([x, y]);
      }
      firebreakOut(town, x, y);
    }
    pay(t.cost, laid, town.x, town.y);
    if (ring.next >= ring.plan.length) {
      ring.done = true;
      // the old, smaller ring comes down (its stone and logs are not wasted: half go back to stock)
      for (const old of S.rings.filter(r => r.town === town.id && r !== ring && !r.gone)) {
        old.gone = true;
        const w = S.list.find(x => x.id === old.wall); if (!w) continue;
        for (const [x, y, m] of w.cells) { const a = sim.cell(x, y); if (a && a.c.mat[a.i] === m) { a.c.mat[a.i] = 0; a.c.tall[a.i] = 0; a.c.hp[a.i] = 0; a.c.dirty = true; sim.store.markEdited(a.c); } }
        for (const [x, y] of w.gates) { const a = sim.cell(x, y); if (a && a.c.mat[a.i] === M.id.gate) { a.c.mat[a.i] = 0; a.c.dirty = true; sim.store.markEdited(a.c); } }
        S.list.splice(S.list.indexOf(w), 1);
      }
      S.rings = S.rings.filter(r => !r.gone);
      say(`${town.name} has closed its new wall: ${wall.towers.length} towers, ${wall.gates.length} gates.`, 'good', town.x, town.y);
      sim.events.push({ t: 'walls' });
    }
  }
  /** Rich in stone: the wooden ring becomes a stone one, a stretch at a time. */
  function upgradeStretch(town, ring) {
    const wall = S.list.find(w => w.id === ring.wall); if (!wall || wall.tier !== 'wood') return;
    const st = sim.town.stock(town.id);
    if ((st.stone || 0) < AW.stoneAt) return;
    const t = CFG.tiers.stone, grow = t.tall - CFG.tiers.wood.tall;
    ring.up ??= 0;
    let n = 0;
    while (ring.up < wall.cells.length && n < AW.stretch) {
      const cell = wall.cells[ring.up++];
      cell[2] = M.id[t.mat]; cell[3] += grow; placeCell(cell[0], cell[1], cell[2], cell[3], 255, wall.id); n++;
    }
    pay(t.cost, n, town.x, town.y);
    if (ring.up >= wall.cells.length) { wall.tier = 'stone'; say(`${town.name}'s wall is stone now.`, 'good', town.x, town.y); }
  }
  /** Clear trees and brush in a short band outside a wall cell: a firebreak a forest fire cannot cross. */
  function firebreakOut(town, x, y) {
    let dx = x - town.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const dy = y - town.y, d = Math.hypot(dx, dy) || 1;
    for (let k = AW.firebreak[0]; k <= AW.firebreak[1]; k++) {
      const at = sim.cell(x + dx / d * k, y + dy / d * k); if (!at) continue;
      const { c, i } = at;
      if (c.part[i] || M.flag.road[c.ground[i]] || M.liquid[c.mat[i]] || (c.mat[i] && M.built[c.mat[i]])) continue;
      if (c.mat[i] && !(M.tree[c.mat[i]] || c.mat[i] === M.id.bush || c.mat[i] === M.id.tallgrass || c.mat[i] === M.id.flowers || c.mat[i] === M.id.stump)) continue;
      c.mat[i] = 0; c.tall[i] = 0; c.ground[i] = M.id.firebreak; c.flag[i] &= ~BURN;
      c.dirty = true; sim.store.markEdited(c);
    }
  }
  /** A road laid through a wall later on: the cell is a gate now; the wall forgets it as a wall cell. */
  function addGate(x, y) {
    x = wrapX(Math.floor(x)); y = Math.floor(y);
    for (const w of S.list) { const k = w.cells.findIndex(c => c[0] === x && c[1] === y); if (k >= 0) { w.cells.splice(k, 1); w.gates.push([x, y]); return true; } }
    return false;
  }

  // ------------------------------------------------------------------ the system
  function step() {
    if (sim.tick % 20 === 3) fireDuty();
    if (sim.tick % 60 === 29) autoWalls();
    if (sim.tick % 40 === 11) stepHeat();
    if (sim.tick % 100 === 13) stepRubble();
    if (sim.tick % CFG.repairEvery === 17) stepRepair();
  }
  function order(o) {
    if (o.t === 'wall') return drawWall(o);
    if (o.t === 'wall.upgrade') return upgradeWall(o.id);
    if (o.t === 'zone' || o.t === 'firebreak') return paint(o);
    if (o.t === 'hit') return damage(o.x, o.y, o.amount ?? 50);
    return null;
  }
  function view(rect) {
    const zones = S.zones.map(z => [z.kind, z.x0, z.y0, z.x1, z.y1]);
    return { zones, walls: S.list.map(w => ({ id: w.id, tier: w.tier, n: w.cells.length, x: w.cells[0]?.[0], y: w.cells[0]?.[1], towers: w.towers.length, gates: w.gates.length })) };
  }
  sim.damage = damage;
  sim.douse = douse;
  sim.nearestFire = nearestFire;
  return { id: 'walls', step, order, view, damage, collapse, douse, inZone, blocked, lineCells, addGate, nearestFire, wallAt: (x, y) => S.list.find(w => w.cells.some(c => c[0] === wrapX(x) && c[1] === y)) };
}
