// Army units (Lumen/Umbra troopers, lancers, skimmers, siege walkers, commander): orders,
// movement and fighting. Drones live in construction.js; the Hollow in hollow.js.

import { walk, fall, rise, flyToward, boxFree, grounded, obstacleHeight, unstick, blockerAhead, GRAVITY } from './physics.js';
import { udef } from './units.js';
import { updateWeapon } from './weapons.js';
import { findPath } from './nav.js';

export function unitMods(game, u) {
  const def = udef(game, u.type);
  const team = game.teams[u.team];
  const w = def.weapon;
  const mods = { dmg: 1, range: 1, rate: 1 };
  if (w && w.dtype === 'laser') mods.dmg *= team?.mods.laserDmg || 1;
  if (u.deployed && def.deploy) mods.range = def.deploy.range / w.range;
  return mods;
}

export function updateArmy(game, u, dt) {
  const def = udef(game, u.type);
  const world = game.world;
  if (!u.flying && !boxFree(world, u, u.x, u.y)) unstick(world, u);
  // Weapon: always auto-fires at whatever is in range (hold, idle and attack-move all shoot).
  let busy = false;
  if (def.weapon) {
    const mods = unitMods(game, u);
    const canShoot = !(def.deploy && !u.deployed && def.weapon.kind === 'shell' && u.order.t === 'move');
    if (canShoot && u.order.t !== 'move') busy = updateWeapon(game, u, def.weapon, dt, mods) || !!u.target;
    else { u.target = 0; }
  }
  const o = u.order;
  let goalX = null, goalY = null, stopOnEnemy = false;
  switch (o.t) {
    case 'move': goalX = o.x; goalY = o.y; break;
    case 'amove': goalX = o.x; goalY = o.y; stopOnEnemy = true; break;
    case 'patrol': goalX = o.x; goalY = o.y; stopOnEnemy = true; break;
    case 'attack': {
      const t = game.byId.get(o.target);
      if (!t || t.dead) { nextOrder(u); break; }
      const c = t.kind === 'b' ? { x: t.x + t.w / 2, y: t.y + t.h } : { x: t.x, y: t.y };
      const range = (def.weapon?.range || 20) * (unitMods(game, u).range);
      if (u.target === t.id && Math.abs(c.x - u.x) < range * 0.9) { goalX = null; }
      else { goalX = c.x; goalY = c.y; }
      break;
    }
    case 'attackCell': {
      const range = (def.weapon?.range || 20) * unitMods(game, u).range * 0.85;
      if (world.get(o.x, o.y) === 0) { nextOrder(u); u.pointTarget = null; break; }
      u.pointTarget = { x: o.x, y: o.y };
      if (Math.hypot(o.x - u.x, o.y - (u.y - u.h / 2)) > range) { goalX = o.x; goalY = o.y; }
      break;
    }
    case 'hold': case 'idle': default: break;
  }
  if (u.deployed) goalX = null;
  if (stopOnEnemy && busy && !u.pointTarget) goalX = null;
  // Blocked by an enemy wall on the way? Shoot through it.
  if ((o.t === 'amove' || o.t === 'attack' || o.t === 'patrol') && !u.target && !u.flying) {
    if (!u.pointTarget || (game.tickNo + u.id) % 20 === 0) {
      const bc = blockingCell(game, u, goalX ?? o.x);
      if (bc) u.pointTarget = bc;
    }
    if (u.pointTarget) goalX = null; // hold while breaking the wall
  } else if (o.t !== 'attackCell') u.pointTarget = null;
  // Move.
  if (goalX !== null) {
    const arrived = moveToward(game, u, def, goalX, goalY, dt);
    if (arrived) {
      if (o.t === 'patrol') { const f = o.from; o.from = { x: o.x, y: o.y }; o.x = f.x; o.y = f.y; u.path = null; }
      else if (o.t !== 'attack') nextOrder(u);
    }
  } else if (u.flying) {
    // Hover in place.
    const gy = world.surfaceY(Math.floor(u.x)) - (def.cruise || 20);
    if (u.y > gy + 2) flyToward(world, u, u.x, gy, def.speed * 0.3, dt);
  }
  if (!u.flying && !u.scrambling) {
    if (u.knockX) { walk(world, u, u.knockX * dt, 1); u.knockX *= 0.85; if (Math.abs(u.knockX) < 1) u.knockX = 0; }
    if (u.vy < 0) rise(world, u, dt);
    else {
      const landed = fall(world, u, dt);
      if (landed > 30) game.fallDamage(u, landed);
    }
  }
  if (u.scrambling && !u.flying) { u.scrambling = false; }
  if (u.y > world.h + 5) game.killQuietly(u);
}

// First enemy wall/building cell between the unit and its goal (at body height), within weapon
// range + a little. Only counts if it's what blocks the way.
function blockingCell(game, u, gx) {
  if (gx == null) return null;
  const def = udef(game, u.type);
  const w = def.weapon;
  if (!w || !w.ground) return null;
  const dir = Math.sign(gx - u.x);
  if (!dir) return null;
  const world = game.world;
  const reach = Math.min(w.range * 0.9, 60);
  for (let k = 1; k < reach; k++) {
    const x = Math.floor(u.x + dir * (u.w / 2 + k));
    for (let yy = Math.floor(u.y) - 1; yy >= Math.floor(u.y) - u.h; yy--) {
      const m = world.get(x, yy);
      if (m === 0) continue;
      const i = world.idx(x, yy);
      const tm = world.team[i];
      if ((world.mats.built[m] || m === 13) && tm && tm !== u.team) {
        // Only if our path is blocked: the obstacle is taller than we can jump.
        let hgt = 0;
        for (let y2 = Math.floor(u.y) - 1; y2 > Math.floor(u.y) - 40; y2--) if (world.get(x, y2) !== 0) hgt++; else break;
        if (hgt <= (def.jump || 3)) return null;
        return { x, y: Math.floor(u.y) - 2 };
      }
      if (!world.mats.built[m]) return null; // terrain first: not a wall problem
    }
  }
  return null;
}

// Last resort for a wedged walker (wide unit caught between a slope and an overhang): hop to the
// nearest free, standing spot a few cells toward where it's going.
function unjam(game, u, dir) {
  const world = game.world;
  for (let r = 1; r <= 8; r++) {
    for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, 5, 6, -4]) {
      const nx = u.x + dir * r, ny = u.y + dy;
      if (!boxFree(world, u, nx, ny)) continue;
      const t = { ...u, x: nx, y: ny };
      if (!grounded(world, t) && !boxFree(world, u, nx, ny + 1)) continue;
      u.x = nx; u.y = ny; u.stuckT = 0; u.path = null;
      return true;
    }
  }
  return false;
}

function nextOrder(u) {
  u.order = u.orders.length ? u.orders.shift() : { t: 'idle' };
  u.path = null;
}

// Walk or fly toward a goal, following an A* path for walkers. Returns true on arrival.
function moveToward(game, u, def, gx, gy, dt) {
  const world = game.world;
  if (u.flying) {
    const ground = Math.min(world.surfaceY(Math.floor(u.x)), world.surfaceY(Math.floor(gx)));
    const ty = Math.min(gy - 4, ground - (def.cruise || 20));
    const left = flyToward(world, u, gx, Math.max(u.h + 2, ty), def.speed, dt);
    u.vxEst = def.speed * Math.sign(gx - u.x);
    return Math.abs(gx - u.x) < 3;
  }
  if (Math.abs(gx - u.x) < 2 && Math.abs(gy - u.y) < 12) return true;
  // Path: refresh when missing, stale or finished.
  u.pathT -= dt;
  if (!u.path || u.pathT <= 0) {
    u.path = findPath(game, u, gx, gy);
    u.pathI = 0;
    u.pathT = 2.5;
    // Only trust a path that actually gets there; otherwise walk straight and climb.
    if (u.path && u.path.length) {
      const last = u.path[u.path.length - 1];
      u.pathFull = Math.abs(last.x - gx) < 10 && Math.abs(last.y - gy) < 16;
    } else u.pathFull = false;
  }
  let tx = gx, ty = gy;
  if (u.path && u.path.length && u.pathFull) {
    while (u.pathI < u.path.length - 1) {
      const p = u.path[u.pathI];
      if (Math.abs(p.x - u.x) < 2.5 && Math.abs(p.y - u.y) < 6) u.pathI++; else break;
    }
    const p = u.path[u.pathI];
    tx = p.x; ty = p.y;
    if (u.pathI >= u.path.length - 1 && Math.abs(p.x - u.x) < 2.5) {
      // End of path (may be the closest reachable point).
      return Math.abs(gx - u.x) < 6;
    }
  }
  let dir = Math.sign(tx - u.x);
  // Next point is straight below (a drop): keep walking the way the path continues to step off.
  if (Math.abs(tx - u.x) < 2.5 && ty > u.y + 2 && u.path) {
    const nxt = u.path[Math.min(u.path.length - 1, u.pathI + 1)];
    dir = Math.sign(nxt.x - u.x) || Math.sign(gx - u.x) || u.dir;
  }
  if (dir) u.dir = dir;
  const speed = def.speed * (u.slow ? 0.5 : 1);
  const moved = dir ? walk(world, u, dir * speed * dt, 3) : true;
  u.vxEst = moved ? dir * speed : 0;
  const onGround = grounded(world, u);
  if ((!moved || ty < u.y - 3) && onGround && def.jump) {
    const hgt = moved ? Math.min(def.jump, u.y - ty) : obstacleHeight(world, u, dir, def.jump + 2);
    if (hgt > 0 && hgt <= def.jump + 1) u.vy = -Math.sqrt(2 * GRAVITY * (hgt + 1.5));
  }
  // Stuck against terrain (a pit wall, a cliff the pathfinder can't route around): scramble up it
  // slowly, like the Hollow do, so no unit is ever trapped for good.
  if (!moved && dir) {
    u.stuckT += dt;
    if (u.stuckT > 1.5) {
      const blk = blockerAhead(world, u, dir);
      if (blk && (blk.kind === 'terrain' || blk.team === u.team)) {
        u.climbAcc += speed * 0.35 * dt;
        while (u.climbAcc >= 1) { u.climbAcc -= 1; if (boxFree(world, u, u.x, u.y - 1)) u.y -= 1; else break; }
        u.vy = 0; u.scrambling = true;
      }
      if (u.stuckT > 4) { u.path = null; u.pathT = 0; }
      if (u.stuckT > 5) { unjam(game, u, dir); }
      if (u.stuckT > 12) u.stuckT = 1.5;
    }
  } else if (moved) { u.stuckT = 0; u.scrambling = false; }
  // Mid-air: keep drifting toward the target so jumps carry forward.
  if (!onGround && !moved && dir) walk(world, u, dir * speed * 0.5 * dt, 0);
  return false;
}
