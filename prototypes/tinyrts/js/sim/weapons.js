// Weapons: target acquisition and firing for turrets, army units and armed Hollow.
//
// kinds: pulse (hitscan laser bolt), beam (continuous laser), shell (arcing blast), glob (arcing
// acid), rail (piercing kinetic slug), flak (anti-air bursts that also pop enemy projectiles),
// arc (chain lightning), bomb (dropped), stomp (blast around the shooter).
//
// Lasers reflect off Prism cells and off the front of Carapace. A team's shots pass through its own
// built cells and never hurt its own things.

import { M } from '../world/materials.js';
import { fireBlocked } from '../world/raycast.js';
import { damageUnit, udef } from './units.js';
import { damageBuilding, bdef } from './buildings.js';

const TARGET_EVERY = 0.35;

export function muzzle(s) {
  if (s.kind === 'b') return { x: s.x + s.w / 2, y: s.y + 2 };
  return { x: s.x + s.dir * (s.w / 2 - 1), y: s.y - s.h * 0.7 };
}

export function centerOf(e) {
  if (e.kind === 'b') return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
  return { x: e.x, y: e.y - e.h / 2 };
}

export function isAir(e) { return e.kind === 'u' && e.flying; }

function hostileTeams(team) { return team === 1 ? [2, 3] : team === 2 ? [1, 3] : [1, 2]; }

// Gather hostile targets within range of (x, y).
export function candidates(game, team, x, y, range, w) {
  const out = [];
  const r2 = range * range;
  const minR2 = w.minRange ? w.minRange * w.minRange : 0;
  for (const u of game.units) {
    if (u.team === team || u.dead || u.burrowed) continue;
    if (u.team === 0) continue;
    const air = u.flying;
    if (air && !w.air) continue;
    if (!air && !w.ground) continue;
    const dx = u.x - x, dy = (u.y - u.h / 2) - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 || d2 < minR2) continue;
    out.push({ e: u, d2 });
  }
  if (w.ground !== false) {
    for (const b of game.buildings) {
      if (b.team === team || b.team === 0 || b.dead || b.falling) continue;
      const cx = Math.max(b.x, Math.min(x, b.x + b.w)), cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const d2 = (cx - x) ** 2 + (cy - y) ** 2;
      if (d2 > r2 || d2 < minR2) continue;
      out.push({ e: b, d2, bld: true });
    }
  }
  return out;
}

function aimPointFor(shooter, target) {
  if (target.kind === 'b') {
    // Aim at the nearest point of the building's box (shots hit walls of it, not its center).
    const m = shooter;
    const x = Math.max(target.x + 1, Math.min(m.x, target.x + target.w - 1));
    const y = Math.max(target.y + 1, Math.min(m.y, target.y + target.h - 1));
    return { x, y };
  }
  return centerOf(target);
}

export function acquire(game, s, w, range, mode = 'nearest') {
  const m = muzzle(s);
  const list = candidates(game, s.team, m.x, m.y, range, w);
  if (!list.length) return null;
  const core = game.byId.get(game.teams[s.team]?.coreId);
  const score = (c) => {
    const e = c.e;
    let v = c.d2;
    if (c.bld) v += 1e7; // units before buildings
    if (mode === 'strongest') v = -e.hp + (c.bld ? 1e7 : 0);
    else if (mode === 'weakest') v = e.hp + (c.bld ? 1e7 : 0);
    else if (mode === 'air' || w.airFirst) v = c.d2 + (isAir(e) ? 0 : 5e6) + (c.bld ? 1e7 : 0);
    else if (mode === 'core' && core) v = Math.abs(centerOf(e).x - (core.x + core.w / 2)) + (c.bld ? 1e7 : 0);
    return v;
  };
  list.sort((a, b) => score(a) - score(b));
  const needLos = w.kind === 'pulse' || w.kind === 'beam' || w.kind === 'rail' || w.kind === 'arc' || w.kind === 'flak';
  for (let k = 0; k < list.length && k < 6; k++) {
    const e = list[k].e;
    if (s.ignoreId === e.id && game.time < s.ignoreUntil) continue;
    if (!needLos) return e;
    const p = aimPointFor(m, e);
    const blk = fireBlocked(game.world, s.team, m.x, m.y, p.x, p.y);
    if (!blk) return e;
    // A building target counts as visible if the first blocker is its own footprint.
    if (e.kind === 'b' && game.world.get(blk.x, blk.y) === M.FOOTPRINT && game.world.owner[game.world.idx(blk.x, blk.y)] === e.id) return e;
  }
  return null;
}

function targetValid(game, s, t, w, range) {
  if (!t || t.dead || t.burrowed || (t.kind === 'b' && t.falling)) return false;
  const m = muzzle(s), c = aimPointFor(m, t);
  const d2 = (c.x - m.x) ** 2 + (c.y - m.y) ** 2;
  if (d2 > range * range * 1.05) return false;
  if (w.minRange && d2 < w.minRange * w.minRange) return false;
  if (isAir(t) && !w.air) return false;
  if (!isAir(t) && !w.ground) return false;
  return true;
}

// Run one weapon for one tick. `mods` = {rate, dmg, range, power(ratio)}. Returns true if fired.
export function updateWeapon(game, s, w, dt, mods = {}) {
  const rateMult = (mods.rate || 1);
  const range = w.range * (mods.range || 1);
  s.cd -= dt * rateMult;
  s.retargetT -= dt;
  let t = s.target ? game.byId.get(s.target) : null;
  if (s.forceTarget) { const ft = game.byId.get(s.forceTarget); if (ft && !ft.dead) t = ft; else s.forceTarget = 0; }
  if (!targetValid(game, s, t, w, range) || (s.retargetT <= 0 && !s.forceTarget)) {
    s.retargetT = TARGET_EVERY;
    const nt = acquire(game, s, w, range, s.targeting || (w.airFirst ? 'air' : 'nearest'));
    if (nt) t = nt; else if (!targetValid(game, s, t, w, range)) t = null;
  }
  s.target = t ? t.id : 0;
  s.firingDraw = 0;
  if (!t && s.pointTarget) {
    // Shooting at a wall cell (a unit breaking through, or "attack ground" on a wall).
    const pt = s.pointTarget;
    const m0 = muzzle(s);
    const cell = game.world.get(pt.x, pt.y);
    const d2 = (pt.x + 0.5 - m0.x) ** 2 + (pt.y + 0.5 - m0.y) ** 2;
    if (cell === M.EMPTY || game.world.team[game.world.idx(pt.x, pt.y)] === s.team || d2 > range * range || (w.minRange && d2 < w.minRange * w.minRange) || !w.ground) { s.pointTarget = null; }
    else t = { kind: 'p', x: pt.x + 0.5, y: pt.y + 1, w: 1, h: 1, hp: 1, id: 0 };
  }
  if (!t) { s.firing = Math.max(0, s.firing - dt); return false; }
  const m = muzzle(s);
  const tp = aimPointFor(m, t);
  s.aim = Math.atan2(tp.y - m.y, tp.x - m.x);
  if (s.kind === 'u') s.dir = tp.x >= s.x ? 1 : -1;
  const team = game.teams[s.team];
  const dmgMult = (mods.dmg || 1) * (s.dmgMult || 1);

  if (w.kind === 'beam') {
    if (w.power && s.kind === 'b') s.firingDraw = w.power;
    const pr = mods.power ?? 1;
    const dps = w.dps * dmgMult * pr;
    const res = traceLaser(game, m.x, m.y, tp.x, tp.y, range * 1.2, s.team, { dmg: dps * dt, pierce: !!w.pierce, bounces: laserBounces(game, s.team), dtype: 'laser', from: s.id, targetId: t.id });
    trackMiss(game, s, t, res.hitTarget, dt);
    s.firing = 0.15;
    if ((game.tickNo + s.id) % 2 === 0) game.events.emit('beam', { segs: res.segs, team: s.team, kind: 'beam', ttl: 0.1, from: s.id });
    return true;
  }
  if (s.cd > 0) return false;
  const fireRate = w.rate || 1;
  if (w.power && s.kind === 'b') s.firingDraw = w.power * fireRate;
  if (w.ammoF && team) {
    if (team.res.f < w.ammoF) { s.noAmmo = true; return false; }
    team.res.f -= w.ammoF; team.stats.spent.f += w.ammoF;
  }
  s.noAmmo = false;
  const pr = w.power && s.kind === 'b' ? (mods.power ?? 1) : 1;
  s.cd = 1 / (fireRate * pr);
  s.firing = 0.12;
  switch (w.kind) {
    case 'pulse': {
      const res = traceLaser(game, m.x, m.y, tp.x, tp.y, range * 1.2, s.team, { dmg: w.dmg * dmgMult, pierce: false, bounces: laserBounces(game, s.team), dtype: 'laser', from: s.id, targetId: t.id });
      trackMiss(game, s, t, res.hitTarget, 1 / fireRate);
      game.events.emit('beam', { segs: res.segs, team: s.team, kind: 'pulse', ttl: 0.08, from: s.id });
      game.events.emit('shot', { kind: 'pulse', x: m.x, y: m.y, team: s.team, hollow: s.hollow });
      break;
    }
    case 'shell':
    case 'glob': {
      const lead = t.kind === 'u' ? (t.vxEst || 0) * 0.8 : 0;
      game.spawnBallistic({ kind: w.kind, team: s.team, x: m.x, y: m.y, tx: tp.x + lead, ty: tp.y, speed: w.speed || 150, dmg: w.dmg * dmgMult, radius: w.radius, dtype: w.dtype, from: s.id, rain: w.rain });
      game.events.emit('shot', { kind: w.kind, x: m.x, y: m.y, team: s.team, hollow: s.hollow });
      break;
    }
    case 'rail': {
      const d = Math.hypot(tp.x - m.x, tp.y - m.y) || 1;
      game.projectiles.push({ id: game.nextId++, kind: 'rail', team: s.team, x: m.x, y: m.y, vx: (tp.x - m.x) / d * w.speed, vy: (tp.y - m.y) / d * w.speed, pool: w.dmg * dmgMult, dist: 0, range: range * 1.3, hit: [], dtype: 'kinetic', from: s.id, trail: [] });
      game.events.emit('shot', { kind: 'rail', x: m.x, y: m.y, team: s.team });
      break;
    }
    case 'flak': {
      s.burstLeft = (w.burst || 1);
      s.burstT = 0;
      s.burstTarget = t.id;
      s.burstAim = null;
      break;
    }
    case 'arc': {
      fireArc(game, s, t, w, dmgMult);
      break;
    }
    case 'bomb': {
      game.projectiles.push({ id: game.nextId++, kind: 'bomb', team: s.team, x: s.x, y: s.y, vx: s.vx || 0, vy: 20, g: 160, dmg: w.dmg * dmgMult, radius: w.radius, dtype: 'blast', from: s.id, air: true });
      break;
    }
    case 'stomp': {
      game.blast(s.x + s.dir * s.w * 0.4, s.y - 2, w.radius, w.dmg * dmgMult, s.team, 'blast');
      break;
    }
  }
  return true;
}

// Shots that keep hitting something else (a ridge, a wall) mean the target isn't really reachable
// from here: forget it for a few seconds so units keep advancing instead of plinking at rock.
function trackMiss(game, s, t, hit, dt) {
  if (!t || t.kind === 'p') return;
  if (hit) { s.missT = 0; return; }
  s.missT = (s.missT || 0) + dt;
  if (s.missT > 1.5) { s.ignoreId = t.id; s.ignoreUntil = game.time + 4; s.target = 0; s.missT = 0; if (s.forceTarget === t.id) s.forceTarget = 0; }
}

// Flak bursts: fired over a few ticks after the trigger.
export function updateBurst(game, s, w, dt) {
  if (!s.burstLeft) return;
  s.burstT -= dt;
  if (s.burstT > 0) return;
  s.burstT = 0.08;
  s.burstLeft--;
  const t = game.byId.get(s.burstTarget);
  const m = muzzle(s);
  let tx, ty;
  if (t && !t.dead) {
    const c = centerOf(t);
    const d = Math.hypot(c.x - m.x, c.y - m.y);
    const lead = d / w.speed;
    tx = c.x + (t.vxEst || 0) * lead + game.rng.range(-3, 3);
    ty = c.y + (t.vyEst || 0) * lead + game.rng.range(-3, 3);
  } else if (s.burstAim) {
    // Intercepting a projectile: re-predict where it will be for each shot of the burst.
    const p = s.burstProj ? game.projectiles.find((q) => q.id === s.burstProj && !q.dead) : null;
    if (p) {
      let tt = Math.hypot(p.x - m.x, p.y - m.y) / w.speed, px = p.x, py = p.y;
      for (let k = 0; k < 3; k++) { px = p.x + p.vx * tt; py = p.y + p.vy * tt + 0.5 * (p.g || 0) * tt * tt; tt = Math.hypot(px - m.x, py - m.y) / w.speed; }
      s.burstAim = { x: px, y: py };
    }
    tx = s.burstAim.x + game.rng.range(-1.5, 1.5); ty = s.burstAim.y + game.rng.range(-1.5, 1.5);
  } else {
    tx = m.x + Math.cos(s.aim) * 60; ty = m.y + Math.sin(s.aim) * 60;
  }
  const d = Math.hypot(tx - m.x, ty - m.y) || 1;
  game.projectiles.push({ id: game.nextId++, kind: 'flak', team: s.team, x: m.x, y: m.y, vx: (tx - m.x) / d * w.speed, vy: (ty - m.y) / d * w.speed, ttl: d / w.speed, dmg: w.dmg, radius: w.radius, from: s.id });
  game.events.emit('shot', { kind: 'flak', x: m.x, y: m.y, team: s.team });
}

// Find a projectile the flak could shoot instead (enemy globs and bombs in range).
export function interceptTarget(game, s, w) {
  const m = muzzle(s);
  let best = null, bd = w.range * w.range;
  for (const p of game.projectiles) {
    if (!p.air || p.team === s.team) continue;
    const d2 = (p.x - m.x) ** 2 + (p.y - m.y) ** 2;
    if (d2 < bd) { bd = d2; best = p; }
  }
  return best;
}

export function laserBounces(game, team) { return 3; }

function fireArc(game, s, first, w, dmgMult) {
  const hit = [first];
  let cur = first;
  const pts = [muzzle(s)];
  pts.push(centerOf(first));
  for (let k = 1; k < (w.chain || 1); k++) {
    const c = centerOf(cur);
    let best = null, bd = (w.chainRange || 30) ** 2;
    for (const u of game.units) {
      if (u.team === s.team || u.dead || u.burrowed || hit.includes(u)) continue;
      const d2 = (u.x - c.x) ** 2 + (u.y - u.h / 2 - c.y) ** 2;
      if (d2 < bd) { bd = d2; best = u; }
    }
    if (!best) break;
    hit.push(best); pts.push(centerOf(best)); cur = best;
  }
  for (const e of hit) {
    const dmg = w.dmg * dmgMult;
    if (e.kind === 'u') damageUnit(game, e, dmg, s.team, 'arc'); else damageBuilding(game, e, dmg, s.team, 'arc');
  }
  game.events.emit('arc', { pts, team: s.team });
  game.events.emit('shot', { kind: 'arc', x: pts[0].x, y: pts[0].y, team: s.team });
}

// Trace a laser from (x0,y0) toward (tx,ty) up to `range`, with reflections. Applies damage.
// Returns {segs: [[x0,y0,x1,y1], ...]}.
export function traceLaser(game, x0, y0, tx, ty, range, team, o) {
  const world = game.world, W = world.w, H = world.h;
  let dmg = o.dmg;
  let hitTarget = false;
  let dx = tx - x0, dy = ty - y0;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const segs = [];
  let sx = x0, sy = y0, x = x0, y = y0;
  let traveled = 0, bounces = 0;
  const hitIds = new Set();
  // Pre-collect hostile units near the whole possible path.
  const reach = range * 1.1;
  const near = [];
  for (const u of game.units) {
    if (u.dead || u.burrowed) continue;
    if (Math.abs(u.x - x0) > reach + 10 || Math.abs(u.y - y0) > reach + 20) continue;
    near.push(u);
  }
  let pcx = Math.floor(x), pcy = Math.floor(y);
  const step = 0.5;
  let buildingHit = new Set();
  while (traveled < range) {
    x += dx * step; y += dy * step; traveled += step;
    const cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
    // Units on this point.
    let stop = false;
    for (const u of near) {
      if (hitIds.has(u.id) || u.dead || u.team === team) continue;
      const left = u.x - u.w / 2;
      if (x < left || x >= left + u.w || y < u.y - u.h || y >= u.y) continue;
      hitIds.add(u.id);
      const def = udef(game, u.type);
      if (def.frontReflect && Math.sign(dx) === -u.dir && bounces < 6) {
        // Hits the front shell: bounce straight back.
        segs.push([sx, sy, x, y]); sx = x; sy = y;
        dx = -dx; bounces++;
        game.events.emit('reflect', { x, y });
        break;
      }
      damageUnit(game, u, dmg, team, o.dtype || 'laser');
      if (u.id === o.targetId) hitTarget = true;
      if (!o.pierce) { stop = true; break; }
    }
    if (stop) { segs.push([sx, sy, x, y]); return { segs, end: { x, y }, hitTarget }; }
    if (cx === pcx && cy === pcy) continue;
    const i = cy * W + cx;
    const m = world.mat[i];
    if (m !== M.EMPTY) {
      const own = (world.mats.built[m] || m === M.FOOTPRINT) && world.team[i] === team;
      if (!own) {
        if (world.mats.reflect[m] && bounces < o.bounces) {
          // Reflect off an enemy Prism: the beam now belongs to the Prism's owner and flies back.
          const xChanged = cx !== pcx, yChanged = cy !== pcy;
          segs.push([sx, sy, x, y]);
          world.damageCell(cx, cy, dmg * 0.5, 'laser');
          const pt = world.team[i];
          if (pt && pt !== team) {
            team = pt;
            dmg *= game.teams[pt]?.mods.refraction || 1;
            hitIds.clear();
            buildingHit = new Set();
          }
          if (xChanged && yChanged) {
            const hx = world.mats.reflect[world.get(cx, pcy)] || world.get(cx, pcy) !== M.EMPTY;
            const hy = world.mats.reflect[world.get(pcx, cy)] || world.get(pcx, cy) !== M.EMPTY;
            if (hx && !hy) dx = -dx; else if (hy && !hx) dy = -dy; else { dx = -dx; dy = -dy; }
          } else if (xChanged) dx = -dx; else dy = -dy;
          x = pcx + 0.5; y = pcy + 0.5;
          sx = x; sy = y;
          bounces++;
          game.events.emit('reflect', { x, y });
          continue;
        }
        if (m === M.FOOTPRINT) {
          const b = game.byId.get(world.owner[i]);
          if (b && !buildingHit.has(b.id)) { buildingHit.add(b.id); damageBuilding(game, b, dmg, team, o.dtype || 'laser'); if (b.id === o.targetId) hitTarget = true; }
          segs.push([sx, sy, x, y]); return { segs, end: { x, y }, hitTarget };
        }
        world.damageCell(cx, cy, dmg * (o.cellMult || 1), o.dtype || 'laser');
        segs.push([sx, sy, x, y]);
        return { segs, end: { x, y }, cell: { x: cx, y: cy }, hitTarget: hitTarget || o.targetId === 0 };
      }
    }
    pcx = cx; pcy = cy;
  }
  segs.push([sx, sy, x, y]);
  return { segs, end: { x, y }, hitTarget };
}
