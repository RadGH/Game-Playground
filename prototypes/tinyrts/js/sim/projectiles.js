// Projectiles in flight: shells and acid globs (arcing), bombs (falling), rail slugs (piercing),
// flak (air bursts). Also acid puddles that eat walls, and debris that settles into Rubble.

import { M, S } from '../world/materials.js';
import { damageUnit, udef } from './units.js';
import { damageBuilding } from './buildings.js';

export const SHELL_G = 120;

export function spawnBallistic(game, o) {
  const dx = o.tx - o.x, dy = o.ty - o.y;
  const dist = Math.hypot(dx, dy);
  const T = Math.max(0.6, dist / o.speed + 0.5);
  const g = SHELL_G;
  const vx = dx / T, vy = (dy - 0.5 * g * T * T) / T;
  const p = { id: game.nextId++, kind: o.kind, team: o.team, x: o.x, y: o.y, vx, vy, g, dmg: o.dmg, radius: o.radius, dtype: o.dtype, from: o.from, air: true, age: 0 };
  game.projectiles.push(p);
  return p;
}

export function updateProjectiles(game, dt) {
  const world = game.world;
  const list = game.projectiles;
  for (let k = list.length - 1; k >= 0; k--) {
    const p = list[k];
    if (p.dead) { list.splice(k, 1); continue; }
    p.age = (p.age || 0) + dt;
    if (p.kind === 'rail') { stepRail(game, p, dt); if (p.dead) list.splice(k, 1); continue; }
    if (p.kind === 'flak') {
      stepFlak(game, p, dt);
      if (p.dead) list.splice(k, 1);
      continue;
    }
    // Ballistic (shell, glob, bomb).
    if (p.g) p.vy += p.g * dt;
    const sp = Math.hypot(p.vx, p.vy) * dt;
    const n = Math.max(1, Math.ceil(sp));
    let exploded = false;
    for (let s = 0; s < n && !exploded; s++) {
      p.x += (p.vx * dt) / n; p.y += (p.vy * dt) / n;
      const cx = Math.floor(p.x), cy = Math.floor(p.y);
      if (cx < 0 || cx >= world.w || cy >= world.h) { p.dead = true; break; }
      if (cy < 0) continue;
      const i = cy * world.w + cx;
      const m = world.mat[i];
      if (m !== M.EMPTY) {
        const own = (world.mats.built[m] || m === M.FOOTPRINT) && world.team[i] === p.team;
        if (!own || p.age > 0.4) { explode(game, p); exploded = true; break; }
      }
      for (const u of game.units) {
        if (u.team === p.team || u.dead || u.burrowed) continue;
        if (Math.abs(u.x - p.x) > u.w / 2 + 1 || p.y < u.y - u.h - 1 || p.y > u.y + 1) continue;
        explode(game, p); exploded = true; break;
      }
    }
    if (exploded || p.dead) list.splice(k, 1);
  }
  // Acid puddles.
  for (let k = game.acids.length - 1; k >= 0; k--) {
    const a = game.acids[k];
    a.t -= dt;
    if (a.t <= 0) { game.acids.splice(k, 1); continue; }
    const r = a.r;
    for (let n = 0; n < 6; n++) {
      const x = Math.floor(a.x + game.rng.range(-r, r)), y = Math.floor(a.y + game.rng.range(-r, r));
      if (!world.inBounds(x, y)) continue;
      const i = world.idx(x, y);
      const m = world.mat[i];
      if (m === M.EMPTY || world.team[i] === a.team) continue;
      if (m === M.FOOTPRINT) {
        const b = game.byId.get(world.owner[i]);
        if (b) damageBuilding(game, b, a.dps * dt, a.team, 'acid');
      } else if (world.mats.built[m]) world.damageCell(x, y, a.dps * dt * 6, 'acid');
    }
  }
  updateDebris(game, dt);
}

function explode(game, p) {
  p.dead = true;
  if (p.kind === 'glob') {
    game.acids.push({ x: p.x, y: p.y, r: p.radius, t: 3, dps: p.dmg * 0.6, team: p.team });
    splashDamage(game, p.x, p.y, p.radius + 2, p.dmg, p.team, 'acid', false);
    // Initial splash on built cells.
    for (let yy = -p.radius; yy <= p.radius; yy++) for (let xx = -p.radius; xx <= p.radius; xx++) {
      if (xx * xx + yy * yy > p.radius * p.radius) continue;
      const x = Math.floor(p.x + xx), y = Math.floor(p.y + yy);
      if (!game.world.inBounds(x, y)) continue;
      const i = game.world.idx(x, y);
      if (game.world.mats.built[game.world.mat[i]] && game.world.team[i] !== p.team) game.world.damageCell(x, y, p.dmg, 'acid');
    }
    game.events.emit('splash', { x: p.x, y: p.y, kind: 'acid', r: p.radius });
    return;
  }
  game.blast(p.x, p.y, p.radius, p.dmg, p.team, p.dtype || 'blast');
}

// Damage units and buildings near a point (hostile to `team`; team 0 hurts everyone).
export function splashDamage(game, x, y, r, dmg, team, dtype, knock = true) {
  for (const u of game.units) {
    if (u.dead || u.burrowed || (team && u.team === team)) continue;
    const dx = u.x - x, dy = (u.y - u.h / 2) - y;
    const d = Math.hypot(dx, dy) - Math.max(u.w, u.h) / 2;
    if (d > r) continue;
    const f = Math.max(0.25, 1 - Math.max(0, d) / r);
    damageUnit(game, u, dmg * f, team, dtype);
    if (knock && !u.dead && !udef(game, u.type).boss) {
      const kd = Math.hypot(dx, dy) || 1;
      u.vy = Math.min(u.vy, -30 * f);
      u.knockX = (dx / kd) * 25 * f;
    }
  }
  for (const b of game.buildings) {
    if (b.dead || b.team === 0 || (team && b.team === team)) continue;
    const cx = Math.max(b.x, Math.min(x, b.x + b.w)), cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const d = Math.hypot(cx - x, cy - y);
    if (d > r) continue;
    damageBuilding(game, b, dmg * Math.max(0.3, 1 - d / r), team, dtype);
  }
}

// Kinetic slug: pierces units (each hit costs pool = damage dealt) and carves non-own cells.
function stepRail(game, p, dt) {
  const world = game.world;
  const sp = Math.hypot(p.vx, p.vy);
  const dist = sp * dt;
  const n = Math.max(1, Math.ceil(dist));
  for (let s = 0; s < n; s++) {
    p.x += p.vx * dt / n; p.y += p.vy * dt / n; p.dist += dist / n;
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h || p.dist > p.range) { p.dead = true; break; }
    for (const u of game.units) {
      if (u.team === p.team || u.dead || u.burrowed || p.hit.includes(u.id)) continue;
      if (Math.abs(u.x - p.x) > u.w / 2 + 0.5 || p.y < u.y - u.h - 0.5 || p.y > u.y + 0.5) continue;
      p.hit.push(u.id);
      const dealt = Math.min(p.pool, u.hp);
      damageUnit(game, u, dealt, p.team, 'kinetic');
      p.pool -= dealt * 0.8;
      game.events.emit('railHit', { x: p.x, y: p.y });
    }
    const i = cy * world.w + cx;
    const m = world.mat[i];
    if (m !== M.EMPTY) {
      const own = (world.mats.built[m] || m === M.FOOTPRINT) && world.team[i] === p.team;
      if (!own) {
        if (m === M.FOOTPRINT) {
          const b = game.byId.get(world.owner[i]);
          if (b && !p.hit.includes(b.id)) { p.hit.push(b.id); const dealt = Math.min(p.pool, b.hp); damageBuilding(game, b, dealt, p.team, 'kinetic'); p.pool -= dealt; }
        } else if (world.mats.indestructible[m]) { p.pool = 0; }
        else {
          const cost = world.hp[i] / Math.max(0.2, world.mats.resistance(m, 'kinetic'));
          world.damageCell(cx, cy, 999, 'kinetic');
          p.pool -= cost * 0.35;
          if ((p.dist | 0) % 3 === 0) game.throwDebris(cx, cy, m, p.vx * 0.2, -20);
        }
      }
    }
    if (p.pool <= 0) { p.dead = true; game.events.emit('railEnd', { x: p.x, y: p.y }); break; }
  }
  if (p.trail) { p.trail.push(p.x, p.y); if (p.trail.length > 16) p.trail.splice(0, 2); }
}

function stepFlak(game, p, dt) {
  p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt;
  let pop = p.ttl <= 0;
  if (!pop) {
    for (const u of game.units) {
      if (u.team === p.team || u.dead || !u.flying) continue;
      if (Math.abs(u.x - p.x) < u.w / 2 + 2 && Math.abs(u.y - u.h / 2 - p.y) < u.h / 2 + 2) { pop = true; break; }
    }
  }
  if (!pop) {
    for (const q of game.projectiles) {
      if (!q.air || q.team === p.team || q.dead) continue;
      if (Math.abs(q.x - p.x) < 5 && Math.abs(q.y - p.y) < 5) { pop = true; break; }
    }
  }
  if (!pop) return;
  p.dead = true;
  const r = p.radius;
  for (const u of game.units) {
    if (u.team === p.team || u.dead || !u.flying) continue;
    const d = Math.hypot(u.x - p.x, u.y - u.h / 2 - p.y);
    if (d < r + Math.max(u.w, u.h) / 2) damageUnit(game, u, p.dmg, p.team, 'blast');
  }
  for (const q of game.projectiles) {
    if (!q.air || q.team === p.team || q.dead) continue;
    if (Math.hypot(q.x - p.x, q.y - p.y) < r + 4) { q.dead = true; game.events.emit('intercept', { x: q.x, y: q.y }); }
  }
  game.events.emit('flakPop', { x: p.x, y: p.y, team: p.team });
}

// Debris: a few sim-side particles that land and become Rubble cells.
export function throwDebris(game, x, y, mat, vx, vy) {
  if (game.debrisBudget <= 0) return;
  game.debrisBudget--;
  const m = mat === M.SLAG ? M.SLAG : M.RUBBLE;
  game.debris.push({ x: x + 0.5, y: y + 0.5, vx: vx + game.rng.range(-25, 25), vy: vy + game.rng.range(-50, -10), mat: m, t: 0 });
}

function updateDebris(game, dt) {
  const world = game.world;
  for (let k = game.debris.length - 1; k >= 0; k--) {
    const d = game.debris[k];
    d.t += dt;
    d.vy += 200 * dt;
    const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
    const cx = Math.floor(nx), cy = Math.floor(ny);
    if (cx < 0 || cx >= world.w || cy >= world.h || d.t > 4) { game.debris.splice(k, 1); continue; }
    if (cy >= 0 && world.mat[cy * world.w + cx] !== M.EMPTY) {
      // Land in the last empty cell.
      const lx = Math.floor(d.x), ly = Math.floor(d.y);
      if (world.inBounds(lx, ly) && world.mat[ly * world.w + lx] === M.EMPTY) world.set(lx, ly, d.mat, 0);
      game.debris.splice(k, 1);
      continue;
    }
    d.x = nx; d.y = ny;
  }
}
