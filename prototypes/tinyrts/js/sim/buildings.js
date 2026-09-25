// Buildings: creation, footprints in the cell grid, construction state, falling when undermined,
// destruction, and the per-tick jobs of economy buildings (drill, solar, refinery, core trickle,
// training queues).

import { M, S } from '../world/materials.js';
import { gain, refund } from './teams.js';

export function bdef(game, type) { return game.data.buildings.list[type]; }

// Create a building. opts.built = true to skip construction (Core, map presets).
export function createBuilding(game, type, team, x, y, opts = {}) {
  const def = bdef(game, type);
  if (!def) throw new Error('unknown building ' + type);
  const [w, h] = def.size;
  let maxHp = def.hp;
  if (type === 'core' && game.teams[team] && game.teams[team].mods.coreHp) maxHp *= game.teams[team].mods.coreHp;
  const b = {
    id: game.nextId++, kind: 'b', type, team, x, y, w, h,
    hp: opts.built ? maxHp : Math.max(1, maxHp * 0.05), maxHp,
    progress: opts.built ? 1 : 0, done: !!opts.built,
    linked: type === 'core', on: true,
    cd: 0, target: 0, aim: -Math.PI / 2, firing: 0, firingDraw: 0, burstLeft: 0,
    queue: [], trainT: 0, rally: null,
    sky: 1, mineT: 0, depleted: false, refineT: 0,
    targeting: 'nearest', overcharge: 0,
    falling: false, vy: 0, fy: y, fallFrom: y, tip: 0,
    lastHit: -99, salvage: false, deathCause: null,
  };
  game.buildings.push(b);
  game.byId.set(b.id, b);
  stampFootprint(game, b);
  game.linksDirty = true;
  if (type === 'core') game.teams[team].coreId = b.id;
  return b;
}

// Write the building's footprint cells into the world. Loose cells in the way are removed.
export function stampFootprint(game, b) {
  const w = game.world, def = bdef(game, b.type);
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
    if (!w.inBounds(x, y)) continue;
    const i = w.idx(x, y);
    w.plan[i] = 0;
    w.set(x, y, M.FOOTPRINT, b.team);
    w.owner[i] = b.id;
    w.aux[i] = def.gate ? 1 : 0;
  }
}

export function clearFootprint(game, b, rubbleFrac = 0) {
  const w = game.world;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
    if (!w.inBounds(x, y)) continue;
    const i = w.idx(x, y);
    if (w.mat[i] !== M.FOOTPRINT || w.owner[i] !== b.id) continue;
    if (rubbleFrac > 0 && game.rng.next() < rubbleFrac) w.set(x, y, M.RUBBLE, 0);
    else w.set(x, y, M.EMPTY, 0);
  }
}

export function removeBuilding(game, b, how = 'destroyed') {
  if (b.dead) return;
  b.dead = true;
  if (!b.falling) clearFootprint(game, b, how === 'destroyed' ? 0.35 : 0);
  game.byId.delete(b.id);
  const i = game.buildings.indexOf(b);
  if (i >= 0) game.buildings.splice(i, 1);
  game.linksDirty = true;
  const team = game.teams[b.team];
  if (how === 'destroyed') {
    if (team) team.stats.lost++;
    game.events.emit('buildingDestroyed', { id: b.id, type: b.type, team: b.team, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h });
    const def = bdef(game, b.type);
    if (def.deathBlast && b.done) game.blast(b.x + b.w / 2, b.y + b.h / 2, def.deathBlast.radius, def.deathBlast.dmg, 0, 'blast');
  }
}

export function damageBuilding(game, b, amount, fromTeam = 0, dtype = 'laser') {
  if (b.dead || amount <= 0) return;
  b.hp -= amount;
  b.lastHit = game.time;
  if (game.emitHurt) game.events.emit('hurt', { id: b.id, amt: amount, x: b.x + b.w / 2, y: b.y, team: b.team });
  if (b.team === 1 || b.team === 2) game.noteAttack(b);
  if (b.hp <= 0) {
    b.hp = 0;
    const t = game.teams[fromTeam];
    if (t) t.stats.kills[b.type] = (t.stats.kills[b.type] || 0) + 1;
    removeBuilding(game, b, 'destroyed');
  }
}

// Fraction of the cells directly below the building that are solid (not its own footprint).
export function supportRatio(game, b) {
  const w = game.world;
  const y = b.y + b.h;
  if (y >= w.h) return 1;
  let n = 0;
  for (let x = b.x; x < b.x + b.w; x++) {
    const i = w.idx(x, y);
    const m = w.mat[i];
    if (m !== M.EMPTY && !(m === M.FOOTPRINT && w.owner[i] === b.id)) n++;
  }
  return n / b.w;
}

const G = 260;

// Falling: lift the footprint out of the grid, drop until something solid is underneath, re-stamp.
export function updateFalling(game, b, dt) {
  const def = bdef(game, b.type);
  if (def.noFall) return;
  if (!b.falling) {
    // Check support twice a second, staggered by id.
    if ((game.tickNo + b.id) % 15 !== 0) return;
    if (supportRatio(game, b) >= 0.4) return;
    b.falling = true; b.vy = 0; b.fy = b.y; b.fallFrom = b.y; b.tip = 0;
    clearFootprint(game, b, 0);
    game.linksDirty = true;
    game.events.emit('buildingFalling', { id: b.id, x: b.x + b.w / 2, y: b.y + b.h });
    return;
  }
  b.vy = Math.min(b.vy + G * dt, 240);
  b.fy += b.vy * dt;
  const w = game.world;
  let landed = false;
  while (b.y < Math.floor(b.fy)) {
    const row = b.y + b.h;
    if (row >= w.h) { landed = true; break; }
    let solid = 0;
    for (let x = b.x; x < b.x + b.w; x++) {
      const m = w.get(x, row);
      if (m === M.EMPTY) continue;
      if (w.mats.state[m] === S.LOOSE) { w.set(x, row, M.EMPTY); continue; } // shoves dust aside
      solid++;
    }
    if (solid > 0) { landed = true; break; }
    b.y++;
    game.crushUnits(b.x, b.y + b.h - 2, b.w, 3, 2 + b.vy * 0.05, b.team);
  }
  if (!landed) {
    if (b.y + b.h >= w.h - 1) landed = true;
    else return;
  }
  // Landed: if balanced on too little, tip sideways toward the unsupported side for a while.
  const sr = supportRatio(game, b);
  if (sr < 0.4 && b.tip < 40) {
    b.tip++;
    const dir = tipDirection(game, b);
    if (dir && canShift(game, b, dir)) { b.x += dir; b.fy = b.y; return; }
  }
  b.falling = false; b.vy = 0;
  const fell = b.y - b.fallFrom;
  stampFootprint(game, b);
  game.linksDirty = true;
  if (fell > 6) {
    const dmg = b.maxHp * Math.min(1, (fell - 6) / 60);
    game.events.emit('buildingLanded', { id: b.id, x: b.x + b.w / 2, y: b.y + b.h, fell });
    game.crushUnits(b.x, b.y + b.h - 2, b.w, 4, fell * 0.8, b.team);
    damageBuilding(game, b, dmg, 0, 'blast');
  }
}

function tipDirection(game, b) {
  const w = game.world, row = b.y + b.h;
  let left = 0, right = 0;
  const mid = b.x + b.w / 2;
  for (let x = b.x; x < b.x + b.w; x++) if (w.get(x, row) !== M.EMPTY) { if (x < mid) left++; else right++; }
  if (left === right) return 0;
  return left > right ? 1 : -1; // slide away from the support
}

function canShift(game, b, dir) {
  const w = game.world;
  const x = dir > 0 ? b.x + b.w : b.x - 1;
  for (let y = b.y; y < b.y + b.h; y++) if (w.get(x, y) !== M.EMPTY) return false;
  return true;
}

// Economy jobs for finished, linked buildings.
export function updateEconomy(game, b, dt) {
  const def = bdef(game, b.type);
  const team = game.teams[b.team];
  if (!team || !b.done || b.falling) return;
  if (def.trickle) for (const k in def.trickle) gain(team, k, def.trickle[k] * dt);
  if (!b.linked || !b.on) return;
  const ratio = team.power.ratio;
  if (def.mine && !b.depleted) {
    b.mineT += dt * ratio * (team.mods.mining || 1);
    if (b.mineT >= def.mine.interval) {
      b.mineT -= def.mine.interval;
      const cell = findOre(game, b, def.mine);
      if (!cell) { b.depleted = true; game.events.emit('oreDepleted', { id: b.id, team: b.team, x: b.x + b.w / 2, y: b.y }); }
      else {
        const m = game.world.get(cell.x, cell.y);
        game.world.set(cell.x, cell.y, M.EMPTY);
        const key = m === M.CRYSTAL ? 'c' : 'f';
        gain(team, key, def.mine.yield);
        game.events.emit('mined', { id: b.id, x: cell.x, y: cell.y, key, team: b.team });
      }
    }
  }
  if (def.needsSky && (game.tickNo + b.id) % 60 === 0) b.sky = skyFraction(game, b);
  if (def.refine) {
    b.refineT += dt * ratio;
    if (b.refineT >= def.refine.interval) {
      b.refineT = 0;
      const i = def.refine.in;
      if (team.res.c >= (i.c || 0) && team.res.f >= (i.f || 0)) {
        team.res.c -= i.c || 0; team.res.f -= i.f || 0;
        for (const k in def.refine.out) gain(team, k, def.refine.out[k]);
        b.refining = true;
      } else b.refining = false;
    }
  }
}

// Nearest-to-top ore cell in the drill's mining area.
export function findOre(game, b, mine) {
  const w = game.world;
  const cx = b.x + Math.floor(b.w / 2);
  const x0 = cx - Math.floor(mine.w / 2), y0 = b.y + b.h;
  let best = null, bestD = Infinity;
  for (let y = y0; y < y0 + mine.h; y++) for (let x = x0; x < x0 + mine.w; x++) {
    const m = w.get(x, y);
    if (m !== M.CRYSTAL && m !== M.FERRITE) continue;
    const d = (y - y0) * 4 + Math.abs(x - cx);
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

export function oreInArea(game, x, y, w, h, mine) {
  const cx = x + Math.floor(w / 2);
  const x0 = cx - Math.floor(mine.w / 2), y0 = y + h;
  let c = 0, f = 0;
  for (let yy = y0; yy < y0 + mine.h; yy++) for (let xx = x0; xx < x0 + mine.w; xx++) {
    const m = game.world.get(xx, yy);
    if (m === M.CRYSTAL) c++; else if (m === M.FERRITE) f++;
  }
  return { c, f };
}

export function skyFraction(game, b) {
  const w = game.world;
  let open = 0;
  for (let x = b.x; x < b.x + b.w; x++) {
    let clear = true;
    for (let y = b.y - 1; y >= 0; y--) if (w.mat[w.idx(x, y)] !== M.EMPTY) { clear = false; break; }
    if (clear) open++;
  }
  return open / b.w;
}

// Salvage: remove and refund. Unfinished buildings refund what was paid in full.
export function salvageBuilding(game, b) {
  const def = bdef(game, b.type);
  const team = game.teams[b.team];
  if (!def.cost || b.type === 'core') return;
  const frac = b.done ? (b.depleted ? 1 : 0.5) : 1;
  refund(team, def.cost, frac);
  game.events.emit('salvaged', { id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2, team: b.team });
  removeBuilding(game, b, 'salvaged');
}

export function buildingCenter(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
