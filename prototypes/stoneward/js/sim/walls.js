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
    const tier = o.tier && CFG.tiers[o.tier] && payable(CFG.tiers[o.tier].cost, cells.length) ? o.tier : bestTier(cells.length);
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
    const next = wall.tier === 'wood' ? 'stone' : wall.tier === 'stone' ? 'thick' : null;
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
  function damage(x, y, amount) {
    const at = sim.cell(x, y); if (!at) return false;
    const { c, i } = at, m = c.mat[i];
    if (!m || !(M.built[m] || M.solid[m]) || M.flag.road[c.ground[i]] && !M.built[m]) return false;
    if (m === M.id.rail) return false;                            // track can never be damaged
    const tier = tierOfMat.get(m);
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
  /** Firefighters and neighbours: idle townsfolk near a fire join a bucket line. Called by the town. */
  function fireDuty() {
    const t = T(); if (!t) return;
    for (const b of t.buildings) {
      if (b.state !== 'up') continue;
      const k = data.kinds[b.kind];
      const r = k.job?.kind === 'firefight' ? k.job.radius : k.home ? 18 : 0;
      if (!r) continue;
      const fires = firesNear(b.x + (b.w >> 1), b.y + (b.h >> 1), r);
      if (!fires.length) continue;
      b.fireAlarm = sim.tick;
      // who answers: the station's crew, and anyone resting near home
      const crew = t.people.filter(p => (p.job === b.id && k.job?.kind === 'firefight') || (k.home && p.home === b.id && (!p.task || p.task.t === 'rest')));
      for (const p of crew.slice(0, 4)) {
        if (p.task?.t === 'douse') continue;
        const [fx, fy] = fires[(sim.rng() * fires.length) | 0];
        p.task = { t: 'douse', fx, fy, water: false, carry: 0 };
        p.path = null;
      }
    }
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

  // ------------------------------------------------------------------ the system
  function step() {
    if (sim.tick % 20 === 3) fireDuty();
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
  return { id: 'walls', step, order, view, damage, collapse, douse, inZone, blocked, lineCells, wallAt: (x, y) => S.list.find(w => w.cells.some(c => c[0] === wrapX(x) && c[1] === y)) };
}
