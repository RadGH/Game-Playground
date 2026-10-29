// Villages: little people getting on with their lives. PURE.
//
// A village is a centre, a store (food, wood, stone), and buildings made of REAL cells (thatch
// burns, stone holds). Nobody is ordered about: each villager picks the job the village needs most
// — put out fires (fetch water, douse), eat, sleep at night, farm (harvest ripe wheat, replant),
// chop trees, quarry boulders, build the next thing on the plan. Beds limit how many children are
// born. A building that loses half its cells is gone (beds and all) and gets rebuilt later.
// Data: data/buildings.json.

import { BURN, WET, OWNED, setCell } from './world.js';
import { burst, spawn, P } from './particles.js';
import { addGas, GAS } from './gas.js';

const TPS = 30;

export function createVillages(sim, json) {
  const w = sim.world, M = w.M, ID = M.id, W = w.W, H = w.H;
  const rng = sim.rng;
  const villages = [];
  const KEY = {}, GKEY = {};
  for (const [k, v] of Object.entries(json.key)) KEY[k] = ID[v];
  for (const [k, v] of Object.entries(json.ground)) GKEY[k] = ID[v];
  const kinds = json.kinds;
  const V = { list: villages };

  function nameOf() {
    return json.names.first[(rng() * json.names.first.length) | 0] + json.names.last[(rng() * json.names.last.length) | 0];
  }

  /** Found a village at (x, y) with some people and (optionally) a few ready buildings. */
  V.found = function (x, y, opts = {}) {
    const v = {
      id: villages.length, x, y, name: opts.name || nameOf(),
      food: opts.food ?? 40, wood: opts.wood ?? 20, stone: opts.stone ?? 10,
      faith: 0, faithTotal: 0, level: 1, buildings: [], plan: null, alive: true, pop: 0, beds: 0,
      peak: 0, built: 0, lost: 0, born: 0, foundedAt: sim.tick,
    };
    villages.push(v);
    const pre = opts.prebuilt ?? ['cottage', 'cottage', 'farm', 'well'];
    for (const k of pre) {
      const site = findSite(v, kinds[k]);
      if (site) { const b = makeBuilding(v, k, site.x, site.y); for (const cell of b.cells) placeCell(b, cell); b.done = true; b.progress = b.cells.length; v.buildings.push(b); }
    }
    // a little cobbled square in the middle
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (w.inside(xx, yy) && w.mat[yy * W + xx] === 0) w.ground[yy * W + xx] = ID.cobble;
    const n = opts.people ?? 5;
    for (let k = 0; k < n; k++) {
      const c = sim.creatures.add('villager', x + ((rng() * 8) | 0) - 4, y + ((rng() * 8) | 0) - 4, { village: v.id });
      if (c) c.sex = k % 2;
    }
    for (let k = 0; k < (opts.wardens ?? 0); k++) sim.creatures.add('warden', x + ((rng() * 6) | 0) - 3, y + 3, { village: v.id });
    for (let k = 0; k < (opts.mages ?? 0); k++) sim.creatures.add('mage', x, y - 3, { village: v.id });
    recount(v);
    return v;
  };

  function makeBuilding(v, kind, x, y) {
    const K = kinds[kind];
    const cells = [];
    K.cells.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch === '.') continue;
        cells.push({ x: x + dx, y: y + dy, ch });
      }
    });
    return { kind, x, y, w: K.cells[0].length, h: K.cells.length, cells, done: false, progress: 0, beds: K.beds || 0, village: v.id, alive: true };
  }

  function placeCell(b, cell) {
    const i = cell.y * W + cell.x;
    if (!w.inside(cell.x, cell.y)) return;
    if (GKEY[cell.ch] !== undefined) { w.ground[i] = GKEY[cell.ch]; if (cell.ch === 'D' || cell.ch === 'c') { if (w.mat[i] && !M.liquid[w.mat[i]]) setCell(w, i, 0); } }
    if (KEY[cell.ch] !== undefined) {
      setCell(w, i, KEY[cell.ch], cell.ch === 'w' ? 40 : undefined);
      if (cell.ch === 'F') w.life[i] = (rng() * 120) | 0;
    }
    w.flag[i] |= OWNED;
    w.touch(i);
  }

  function intact(b) {
    let ok = 0, n = 0;
    for (const cell of b.cells) {
      const want = KEY[cell.ch];
      if (want === undefined) continue;
      n++;
      const m = w.mat[cell.y * W + cell.x];
      if (m === want || (b.kind === 'farm' && (m === ID.crop || m === 0 || m === ID.fire))) ok++;
    }
    return n ? ok / n : 1;
  }

  function findSite(v, K) {
    const bw = K.cells[0].length, bh = K.cells.length;
    for (let tries = 0; tries < 70; tries++) {
      const r = 5 + tries * 0.4 + rng() * 6;
      const a = rng() * Math.PI * 2;
      const x = Math.round(v.x + Math.cos(a) * r - bw / 2), y = Math.round(v.y + Math.sin(a) * r - bh / 2);
      if (fits(x, y, bw, bh, v)) return { x, y };
    }
    return null;
  }

  function fits(x, y, bw, bh, v) {
    if (x < 2 || y < 2 || x + bw >= W - 2 || y + bh >= H - 2) return false;
    let lo = 255, hi = 0;
    for (let yy = y - 1; yy <= y + bh; yy++) for (let xx = x - 1; xx <= x + bw; xx++) {
      const i = yy * W + xx;
      const m = w.mat[i];
      if (m && (M.solid[m] || M.liquid[m] || M.built[m] || M.tree[m] || m === ID.crop || m === ID.thorns)) return false;
      if (w.flag[i] & OWNED && w.ground[i] !== ID.cobble) return false;
      if (w.flag[i] & BURN) return false;
      lo = Math.min(lo, w.height[i]); hi = Math.max(hi, w.height[i]);
    }
    if (hi - lo > 6) return false;
    // keep the square clear
    if (Math.abs(x + bw / 2 - v.x) < bw / 2 + 3 && Math.abs(y + bh / 2 - v.y) < bh / 2 + 3) return false;
    return true;
  }

  function recount(v) {
    let beds = 0;
    for (const b of v.buildings) if (b.done && b.alive) beds += b.beds;
    v.beds = beds;
    v.pop = 0;
    for (const c of sim.creatures.list) if (c.alive && c.village === v.id && c.sp.kind === 'person') v.pop++;
    v.peak = Math.max(v.peak, v.pop);
    v.level = v.buildings.filter(b => b.alive && b.done).length >= 6 || v.pop >= 10 ? 2 : 1;
    if (v.pop === 0 && v.alive && sim.tick - (v.foundedAt ?? 0) > 90) { v.alive = false; sim.fire('village-lost', { v }); }
  }

  function choosePlan(v) {
    const has = (k) => v.buildings.filter(b => b.alive && b.kind === k).length;
    const houses = has('cottage') + has('stonehouse') + has('longhouse');
    const can = (k) => { const K = kinds[k]; return K.needs <= v.level && (K.cost.wood ?? 0) <= v.wood && (K.cost.stone ?? 0) <= v.stone; };
    let want = null;
    if (v.beds < v.pop + 2) want = v.level >= 2 && can('stonehouse') && rng() < 0.5 ? 'stonehouse' : v.level >= 2 && can('longhouse') && rng() < 0.3 ? 'longhouse' : 'cottage';
    else if (has('farm') < Math.ceil(v.pop / 4)) want = 'farm';
    else if (!has('well')) want = 'well';
    else if (!has('shrine') && v.pop >= 5) want = 'shrine';
    else if (has('tower') < Math.floor(houses / 3) && v.level >= 2) want = 'tower';
    else if (has('lamppost') < houses + 1) want = 'lamppost';
    if (!want || !can(want)) return null;
    const site = findSite(v, kinds[want]);
    if (!site) return null;
    const K = kinds[want];
    v.wood -= K.cost.wood ?? 0; v.stone -= K.cost.stone ?? 0;
    const b = makeBuilding(v, want, site.x, site.y);
    v.buildings.push(b);
    return b;
  }

  // ---------- finding things ----------
  V.nearestVillage = function (x, y) {
    let best = null, bd = Infinity;
    for (const v of villages) { if (!v.alive) continue; const d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; best = v; } }
    return best;
  };
  V.nearestBuildingCell = function (x, y, r) {
    let best = null, bd = r;
    for (const v of villages) for (const b of v.buildings) {
      if (!b.alive || !b.done || b.kind === 'farm') continue;
      const d = Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
      if (d < bd) {
        const cells = b.cells.filter(c => M.built[w.mat[c.y * W + c.x]]);
        if (cells.length) { bd = d; best = cells[(rng() * cells.length) | 0]; }
      }
    }
    return best;
  };
  V.hasBed = function (c) {
    const v = villages[c.village];
    if (!v || !v.alive) return false;
    return v.beds > v.pop && v.food > v.pop;
  };
  V.housesStanding = function (vid) {
    let n = 0;
    for (const v of villages) if (vid == null || v.id === vid) for (const b of v.buildings) if (b.alive && b.done && b.beds > 0) n++;
    return n;
  };
  V.faithRate = function () {
    let f = 0;
    for (const v of villages) {
      if (!v.alive) continue;
      const shrines = v.buildings.filter(b => b.alive && b.done && b.kind === 'shrine').length;
      f += v.pop * (1 + shrines * 0.5);
    }
    return f;
  };

  function scan(c, r, pred, tries = 24) {
    let best = -1, bd = Infinity;
    for (let k = 0; k < tries; k++) {
      const a = rng() * Math.PI * 2, rr = 1 + Math.sqrt(rng()) * r;
      const x = (c.x + Math.cos(a) * rr) | 0, y = (c.y + Math.sin(a) * rr) | 0;
      if (!w.inside(x, y)) continue;
      const i = y * W + x;
      if (!pred(i)) continue;
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function fireNear(v) {
    for (let k = 0; k < 30; k++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 22;
      const x = (v.x + Math.cos(a) * r) | 0, y = (v.y + Math.sin(a) * r) | 0;
      if (w.inside(x, y) && (w.flag[y * W + x] & BURN)) return y * W + x;
    }
    return -1;
  }

  // ---------- one villager's choice ----------
  V.think = function (c) {
    const v = villages[c.village];
    if (!v || !v.alive) { c.village = null; return false; }
    const day = sim.daylight();
    const at = (i) => { c.tx = i % W + 0.5; c.ty = (i / W | 0) + 0.5; };
    // fires in the village: grab water, put them out
    if (v.fire != null && (w.flag[v.fire] & BURN) && c.age > c.sp.adultAt * TPS) {
      if (c.carry !== 'water') {
        const i = scan(c, 30, (j) => w.mat[j] === ID.water && !(w.flag[j] & BURN), 40);
        if (i >= 0) { c.job = 'fetch'; at(i); c.goalCell = i; return true; }
      } else { c.job = 'douse'; at(v.fire); c.goalCell = v.fire; return true; }
    }
    if (c.hunger > 0.5 && v.food > 0) { c.job = 'eat'; c.tx = v.x + (rng() - 0.5) * 4; c.ty = v.y + (rng() - 0.5) * 4; return true; }
    if (day < 0.15) {
      const home = v.buildings.find(b => b.alive && b.done && b.beds > 0);
      c.job = 'sleep';
      if (home) { c.tx = home.x + home.w / 2; c.ty = home.y + home.h + 0.5; } else { c.tx = v.x; c.ty = v.y; }
      return true;
    }
    // a family: a free bed and a full store mean children
    if (day > 0.15 && sim.creatures.tryBreed(c)) return true;
    if (c.carry) { c.job = 'deliver'; c.tx = v.x + (rng() - 0.5) * 3; c.ty = v.y + (rng() - 0.5) * 3; return true; }
    if (c.age < c.sp.adultAt * TPS) { c.job = 'play'; c.tx = v.x + (rng() - 0.5) * 16; c.ty = v.y + (rng() - 0.5) * 16; return true; }
    // pick a job by need (a little randomness keeps a crowd from doing one thing)
    const r = rng();
    if (v.plan && r < 0.45) { const cell = v.plan.cells[v.plan.progress]; if (cell) { c.job = 'build'; c.tx = cell.x + 0.5; c.ty = cell.y + 1.5; return true; } }
    if (v.food < v.pop * 4 + 10 || r < 0.3) {
      const i = scan(c, 26, (j) => w.mat[j] === ID.crop && (w.flag[j] & OWNED) && w.life[j] > 200, 40);
      if (i >= 0) { c.job = 'harvest'; at(i); c.goalCell = i; return true; }
    }
    if (v.wood < 30 && r < 0.75) {
      const i = scan(c, 34, (j) => M.tree[w.mat[j]] && !(w.flag[j] & BURN), 40);
      if (i >= 0) { c.job = 'chop'; at(i); c.goalCell = i; return true; }
    }
    if (v.stone < 20 && v.level >= 1) {
      const i = scan(c, 40, (j) => w.mat[j] === ID.boulder || w.mat[j] === ID.rubble, 40);
      if (i >= 0) { c.job = 'quarry'; at(i); c.goalCell = i; return true; }
    }
    c.job = 'idle';
    c.tx = v.x + (rng() - 0.5) * 18; c.ty = v.y + (rng() - 0.5) * 18;
    return true;
  };

  // villagers doing their job when they get there
  function work(c) {
    const v = villages[c.village];
    if (!v) return;
    const d = Math.hypot(c.tx - c.x, c.ty - c.y);
    // eating and handing in loads happen anywhere around the square, not on one exact spot
    const home = Math.hypot(v.x - c.x, v.y - c.y) < 7;
    if (d > 1.6 && !((c.job === 'eat' || c.job === 'deliver') && home)) return;
    const gi = c.goalCell;
    switch (c.job) {
      case 'fetch':
        if (gi != null && w.mat[gi] === ID.water) { c.carry = 'water'; c.think = 0; }
        break;
      case 'douse':
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = (gi % W) + dx, y = ((gi / W) | 0) + dy;
          if (!w.inside(x, y)) continue;
          const i = y * W + x;
          if (w.flag[i] & BURN) { w.flag[i] &= ~BURN; w.temp[i] = M.ambient + 20; if (w.mat[i] === ID.fire) setCell(w, i, 0); }
          w.flag[i] |= WET; w.touch(i);
        }
        burst(sim.ps, rng, c.tx, c.ty, 6, { kind: P.drop, mat: 0, rgb: [150, 200, 255], up: 0.4, grav: 0.05, life: 20, speed: 0.4 });
        addGas(w, c.tx | 0, c.ty | 0, GAS.steam, 30);
        c.carry = null; c.think = 0;
        sim.fire('doused', { c, x: c.tx, y: c.ty });
        break;
      case 'eat':
        if (v.food > 0) { v.food -= 1; c.hunger = Math.max(0, c.hunger - 0.7); }
        c.job = null; c.think = 0;
        break;
      case 'harvest':
        if (gi != null && w.mat[gi] === ID.crop && w.life[gi] > 200) {
          w.life[gi] = 0; v.food += 3; w.touch(gi);
          spawn(sim.ps, { kind: P.mote, x: c.x, y: c.y - 2, vy: -0.1, life: 18, rgb: [255, 220, 90], glow: 0.4 });
        }
        c.think = 0;
        break;
      case 'chop':
        if (gi != null && M.tree[w.mat[gi]]) {
          if ((c.workT = (c.workT || 0) + 1) > 45) {
            c.workT = 0;
            const sapling = rng() < 0.35;
            setCell(w, gi, sapling ? ID.seed : 0);
            c.carry = 'wood';
            burst(sim.ps, rng, c.tx, c.ty, 5, { kind: P.debris, mat: 0, rgb: [150, 110, 60], up: 0.5, grav: 0.06, life: 20, speed: 0.3 });
            sim.fire('chop', { c });
          }
          c.tx = c.x; c.ty = c.y; c.think = Math.max(c.think, 2);
        } else c.think = 0;
        break;
      case 'quarry':
        if (gi != null && (w.mat[gi] === ID.boulder || w.mat[gi] === ID.rubble)) {
          if ((c.workT = (c.workT || 0) + 1) > 60) {
            c.workT = 0;
            setCell(w, gi, w.mat[gi] === ID.boulder ? ID.rubble : 0);
            c.carry = 'stone';
            burst(sim.ps, rng, c.tx, c.ty, 4, { kind: P.spark, rgb: [220, 220, 220], life: 8, speed: 0.3 });
          }
          c.tx = c.x; c.ty = c.y; c.think = Math.max(c.think, 2);
        } else c.think = 0;
        break;
      case 'deliver':
        if (home) {
          if (c.carry === 'wood') v.wood += 4;
          if (c.carry === 'stone') v.stone += 3;
          c.carry = null; c.think = 0;
        }
        break;
      case 'build': {
        const b = v.plan;
        if (!b) { c.think = 0; break; }
        if ((c.workT = (c.workT || 0) + 1) > 10) {
          c.workT = 0;
          const cell = b.cells[b.progress];
          if (cell) {
            const i = cell.y * W + cell.x;
            if (w.mat[i] && !M.built[w.mat[i]] && !M.liquid[w.mat[i]]) setCell(w, i, 0);
            placeCell(b, cell);
            spawn(sim.ps, { kind: P.mote, x: cell.x + 0.5, y: cell.y + 0.5, vy: -0.08, life: 14, rgb: [255, 240, 200], glow: 0.5 });
            b.progress++;
            const next = b.cells[b.progress];
            if (next) { c.tx = next.x + 0.5; c.ty = next.y + 1.5; }
          }
          if (b.progress >= b.cells.length) {
            b.done = true; v.plan = null; v.built++;
            recount(v);
            sim.fire('built', { v, b, kind: b.kind, x: b.x + b.w / 2, y: b.y + b.h / 2 });
            if (b.kind === 'tower') sim.creatures.add('warden', b.x + 1, b.y + b.h, { village: v.id });
            c.think = 0;
          }
        }
        break;
      }
      case 'sleep':
        c.tx = c.x; c.ty = c.y;
        break;
    }
  }

  V.step = function () {
    for (const c of sim.creatures.list) if (c.alive && c.village != null && c.sp.kind === 'person' && c.job) work(c);
    if (sim.tick % 15 === 0) for (const v of villages) if (v.alive) { const f = fireNear(v); v.fire = f >= 0 ? f : null; }
    if (sim.tick % 60 === 0) {
      for (const v of villages) {
        if (!v.alive) continue;
        for (const b of v.buildings) {
          if (!b.alive || !b.done) continue;
          if (intact(b) < 0.5) {
            b.alive = false; v.lost++;
            for (const cell of b.cells) w.flag[cell.y * W + cell.x] &= ~OWNED;
            sim.fire('building-lost', { v, b, kind: b.kind, x: b.x + b.w / 2, y: b.y + b.h / 2 });
          }
        }
        // a plan whose cells are on fire or flooded waits
        if (!v.plan) v.plan = choosePlan(v);
        if (v.plan && !v.plan.alive) v.plan = null;
        recount(v);
        // faith from the living, more with a shrine
        const shrines = v.buildings.filter(b => b.alive && b.done && b.kind === 'shrine').length;
        const f = v.pop * (1 + shrines * 0.5) * 0.02;
        v.faith += f; v.faithTotal += f;
        // keep the store from running away
        v.wood = Math.min(v.wood, 200); v.stone = Math.min(v.stone, 200); v.food = Math.min(v.food, 400);
      }
      villages.forEach((v, k) => { if (!v.alive) return; v.buildings = v.buildings.filter(b => b.alive || !b.done); });
    }
  };

  return V;
}
