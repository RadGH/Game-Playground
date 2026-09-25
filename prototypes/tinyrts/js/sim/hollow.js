// The Hollow: how wave creatures move and fight.
//
// Crawlers walk toward their goal, cling to and climb natural terrain at half speed (so pits slow
// them but never trap them), and can't climb built cells: blocked by a wall, they chew the cells in
// front of their feet, which undermines the wall from below. Stuck for 6 s, they chew anything.
// Flyers cruise above the ground; Wisps dive at buildings; Bombards drop bombs from above.
// Borers tunnel through the ground toward their target and surface underneath it.

import { M, S } from '../world/materials.js';
import { boxFree, grounded, walk, fall, rise, blockerAhead, flyToward, unstick } from './physics.js';
import { udef, damageUnit, createUnit } from './units.js';
import { damageBuilding } from './buildings.js';
import { updateWeapon } from './weapons.js';

const RETARGET = 0.6;

function hostileBuildings(game, team) {
  return game.buildings.filter((b) => b.team !== team && (b.team === 1 || b.team === 2) && !b.falling);
}

// Pick the goal: nearby hostile units first, then the nearest building in the direction of the
// enemy Core, then the Core itself.
function pickGoal(game, u, def) {
  let best = null, bd = Infinity;
  const aggro = def.boss ? 30 : 22;
  for (const e of game.units) {
    if (e.dead || e.team === u.team || e.hollow || e.burrowed) continue;
    if (e.flying && !u.flying && !def.weapon?.air) continue;
    const d = Math.abs(e.x - u.x) + Math.abs((e.y - e.h / 2) - (u.y - u.h / 2)) * 0.5;
    if (d < aggro && d < bd) { bd = d; best = e; }
  }
  if (best) return { id: best.id, x: best.x, y: best.y - best.h / 2, unit: true };
  const blds = hostileBuildings(game, u.team);
  if (!blds.length) return null;
  // Main destination: the nearest Core (or any building if no Core).
  let core = null, cd = Infinity;
  for (const b of blds) if (b.type === 'core') { const d = Math.abs(b.x + b.w / 2 - u.x); if (d < cd) { cd = d; core = b; } }
  const dest = core || blds[0];
  const dir = Math.sign(dest.x + dest.w / 2 - u.x) || 1;
  // Nearest building between us and the destination (within 70 cells ahead).
  let near = null, nd = Infinity;
  const wantAir = def.move === 'fly';
  for (const b of blds) {
    const bx = b.x + b.w / 2;
    const ahead = (bx - u.x) * dir;
    if (ahead < -b.w / 2 - 4 || ahead > 70) continue;
    let d = Math.abs(bx - u.x) + Math.abs(b.y + b.h / 2 - u.y) * (wantAir ? 0.3 : 1);
    if (wantAir && bdefTurret(game, b)) d *= 0.6; // wisps love turrets
    if (d < nd) { nd = d; near = b; }
  }
  const t = near || dest;
  return { id: t.id, x: t.x + t.w / 2, y: t.y + t.h / 2, bld: true, w: t.w, h: t.h, bx: t.x, by: t.y };
}

function bdefTurret(game, b) { return !!game.data.buildings.list[b.type].turret; }

// Chew cells in a square in front of the unit's feet. `any` = include terrain.
function bite(game, u, def, dir, any) {
  const b = def.bite;
  if (!b) return;
  const a = b.area || 3;
  const front = dir > 0 ? Math.floor(u.x + u.w / 2) : Math.floor(u.x - u.w / 2) - a;
  const y1 = Math.floor(u.y);
  const world = game.world;
  const hitB = new Set();
  let chewed = 0;
  for (let yy = y1 - a; yy < y1; yy++) for (let xx = front; xx < front + a; xx++) {
    if (!world.inBounds(xx, yy)) continue;
    const i = world.idx(xx, yy);
    const m = world.mat[i];
    if (m === M.EMPTY) continue;
    const tm = world.team[i];
    if (m === M.FOOTPRINT) {
      if (tm === u.team) continue;
      const bb = game.byId.get(world.owner[i]);
      if (bb && !hitB.has(bb.id)) { hitB.add(bb.id); damageBuilding(game, bb, b.dmg * (b.builtMult || 1) * 2 * u.dmgMult, u.team, b.dtype || 'kinetic'); }
      chewed++;
    } else if (world.mats.built[m]) {
      if (tm === u.team) continue;
      world.damageCell(xx, yy, b.dmg * (b.builtMult || 1) * u.dmgMult, b.dtype || 'kinetic');
      chewed++;
    } else if (any && !world.mats.indestructible[m]) {
      world.damageCell(xx, yy, b.dmg * 1.5, 'kinetic');
      chewed++;
    }
  }
  if (chewed) game.events.emit('bite', { x: front + a / 2, y: y1 - a / 2, team: u.team, acid: b.dtype === 'acid' });
}

function biteTargetEntity(game, u, def, e) {
  const b = def.bite;
  if (!b) return;
  if (e.kind === 'u') damageUnit(game, e, (b.unitDmg || b.dmg) * u.dmgMult, u.team, b.dtype || 'kinetic');
  else damageBuilding(game, e, b.dmg * (b.builtMult || 1) * 2 * u.dmgMult, u.team, b.dtype || 'kinetic');
  game.events.emit('bite', { x: u.x + u.dir * u.w / 2, y: u.y - u.h / 2, team: u.team, acid: b.dtype === 'acid' });
}

// Is entity e within bite reach of u?
function inReach(u, e, pad = 2) {
  if (e.kind === 'u') {
    return Math.abs(e.x - u.x) <= (e.w + u.w) / 2 + pad && Math.abs((e.y - e.h / 2) - (u.y - u.h / 2)) <= (e.h + u.h) / 2 + pad;
  }
  const cx = Math.max(e.x, Math.min(u.x, e.x + e.w)), cy = Math.max(e.y, Math.min(u.y - u.h / 2, e.y + e.h));
  return Math.abs(cx - u.x) <= u.w / 2 + pad && Math.abs(cy - (u.y - u.h / 2)) <= u.h / 2 + pad;
}

export function updateHollow(game, u, dt) {
  const def = udef(game, u.type);
  const world = game.world;
  u.biteCd -= dt;
  u.retargetT -= dt;
  if (!u.goal || u.retargetT <= 0 || (u.goal.id && !game.byId.get(u.goal.id))) {
    u.retargetT = RETARGET + game.rng.next() * 0.3;
    u.goal = pickGoal(game, u, def);
  }
  // Spawners (Nest, Hive Mother).
  if (def.spawn) {
    u.spawnT += dt;
    if (u.spawnT >= def.spawn.interval) {
      u.spawnT = 0;
      const pool = def.spawn.pool || [def.spawn.type];
      const cap = game.units.length < 420;
      for (let k = 0; k < def.spawn.count && cap; k++) {
        const t = pool[Math.floor(game.rng.next() * pool.length)];
        const e = createUnit(game, t, u.team, u.x + game.rng.range(-u.w / 3, u.w / 3), u.y - (def.move === 'fly' ? 0 : 2), { dir: u.dir, hpMult: u.hpMult || 1 });
        e.vy = -30;
        if (!udef(game, t).flying && def.move === 'fly') e.airborne = true;
      }
      game.events.emit('spawned', { x: u.x, y: u.y - u.h / 2, team: u.team });
    }
  }
  if (def.move === 'static') return;

  // Ranged weapon: fire if we have something in range; ranged units stop to shoot.
  let shooting = false;
  if (def.weapon && !u.burrowed) {
    shooting = updateWeapon(game, u, def.weapon, dt, { dmg: u.dmgMult }) || u.target !== 0;
  }

  const g = u.goal;
  if (def.move === 'fly') return flyer(game, u, def, g, dt, shooting);
  if (def.move === 'burrow' && u.burrowed) return burrow(game, u, def, g, dt);

  // --- Crawler ---
  if (!boxFree(world, u, u.x, u.y)) unstick(world, u);
  let dir = 0;
  if (g) {
    const dx = g.x - u.x;
    dir = Math.abs(dx) < 1 ? 0 : Math.sign(dx);
    if (dir) u.dir = dir;
    // Touching the goal: bite it.
    const ge = g.id ? game.byId.get(g.id) : null;
    if (ge && inReach(u, ge)) {
      if (u.biteCd <= 0) { u.biteCd = 1 / (def.bite?.rate || 1); biteTargetEntity(game, u, def, ge); }
      dir = 0;
    }
  }
  if (shooting && def.weapon && def.weapon.kind !== 'stomp') dir = 0; // hold and shoot
  // Knockback from blasts.
  if (u.knockX) { walk(world, u, u.knockX * dt, 1); u.knockX *= 0.85; if (Math.abs(u.knockX) < 1) u.knockX = 0; }

  let clinging = false;
  if (dir) {
    const speed = def.speed * (u.slow ? 0.5 : 1);
    const moved = walk(world, u, dir * speed * dt, def.boss ? 6 : 3);
    if (!moved) {
      const blk = blockerAhead(world, u, dir);
      if (blk && blk.kind === 'terrain') {
        // Climb natural terrain at half speed.
        u.climbAcc += speed * 0.5 * dt;
        while (u.climbAcc >= 1) {
          u.climbAcc -= 1;
          if (boxFree(world, u, u.x, u.y - 1)) u.y -= 1; else { u.stuckT += 0.2; break; }
        }
        clinging = true;
        u.vy = 0;
      } else if (blk && (blk.kind === 'built' || blk.kind === 'building') && blk.team !== u.team) {
        if (u.biteCd <= 0) { u.biteCd = 1 / (def.bite?.rate || 1); bite(game, u, def, dir, false); }
        clinging = grounded(world, u) ? false : true;
      }
    }
    // Stuck tracking: progress toward the goal.
    if (Math.abs(u.x - u.progX) > 3) { u.progX = u.x; u.stuckT = 0; }
    else u.stuckT += dt;
    if (u.stuckT > 6 && u.biteCd <= 0) { u.biteCd = 1 / (def.bite?.rate || 1); bite(game, u, def, dir, true); if (u.stuckT > 9) u.stuckT = 5; }
  } else {
    u.progX = u.x; u.stuckT = 0;
  }
  u.vxEst = dir * def.speed;
  if (!clinging) { if (u.vy < 0) rise(world, u, dt); else fall(world, u, dt); }
  if (u.y > world.h + 5) { u.hp = 0; game.killQuietly(u); }
}

function flyer(game, u, def, g, dt, shooting) {
  const world = game.world;
  if (!g) return;
  const cruise = def.cruise || 40;
  const ground = world.surfaceY(Math.floor(u.x));
  const kind = u.type;
  let tx = g.x, ty;
  if (kind === 'wisp' || (def.bite && def.bite.dive)) {
    // Approach at cruise height, then dive at the target, bite, and pull back up.
    const ge = game.byId.get(g.id);
    const dx = Math.abs(g.x - u.x);
    if (u.pullUp > 0) { u.pullUp -= dt; ty = Math.min(ground, world.surfaceY(Math.floor(g.x))) - cruise; tx = u.x - u.dir * 10; }
    else if (dx < 26 && ge) { ty = g.y; }
    else ty = Math.min(ground, world.surfaceY(Math.floor(g.x))) - cruise;
    if (ge && inReach(u, ge, 3) && u.biteCd <= 0) {
      u.biteCd = 1 / (def.bite.rate || 1);
      biteTargetEntity(game, u, def, ge);
      u.pullUp = 1.2;
    }
  } else {
    // Bombard / Hive Mother: hold cruise height above the target and let the weapon work.
    ty = Math.min(ground, world.surfaceY(Math.floor(g.x))) - cruise;
    if (def.weapon && def.weapon.kind === 'bomb') {
      // Drift over the target; bomb when roughly above it.
      if (Math.abs(g.x - u.x) < 6) tx = u.x + u.dir * 4;
    } else if (shooting) tx = u.x;
  }
  ty = Math.max(4 + u.h, ty);
  const before = u.x;
  flyToward(world, u, tx, ty, def.speed, dt);
  u.vxEst = (u.x - before) / dt;
  if (Math.abs(u.x - before) > 0.01) u.dir = Math.sign(u.x - before);
  if (def.weapon && def.weapon.kind === 'bomb') {
    const ge = game.byId.get(g.id);
    if (ge && Math.abs(g.x - u.x) < 8 && u.cd <= 0) {
      u.cd = 1 / def.weapon.rate;
      game.projectiles.push({ id: game.nextId++, kind: 'bomb', team: u.team, x: u.x, y: u.y, vx: u.vxEst * 0.5, vy: 10, g: 160, dmg: def.weapon.dmg * u.dmgMult, radius: def.weapon.radius, dtype: 'blast', from: u.id, air: true });
      game.events.emit('shot', { kind: 'bomb', x: u.x, y: u.y, team: u.team });
    }
    u.cd -= dt;
  }
}

// Borer: tunnels toward a point under its target, eating cells, and surfaces when close.
function burrow(game, u, def, g, dt) {
  const world = game.world;
  if (!g) return;
  const ty = g.bld ? g.by + g.h + 2 : g.y;
  const dx = g.x - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy) || 1;
  const inRock = !boxFree(world, u, u.x, u.y);
  const sp = def.speed * (inRock ? 0.8 : 1.4) * dt;
  u.x += (dx / d) * sp; u.y += (dy / d) * sp;
  u.dir = Math.sign(dx) || u.dir;
  // Eat the cells we overlap (a tunnel a bit bigger than the body).
  const x0 = Math.floor(u.x - u.w / 2) - 1, y0 = Math.floor(u.y) - u.h - 1;
  for (let yy = y0; yy < y0 + u.h + 2; yy++) for (let xx = x0; xx < x0 + u.w + 2; xx++) {
    if (!world.inBounds(xx, yy)) continue;
    const m = world.get(xx, yy);
    if (m === M.EMPTY || m === M.BEDROCK || m === M.FOOTPRINT) continue;
    if (world.mats.built[m] && world.team[world.idx(xx, yy)] === u.team) continue;
    if (game.rng.next() < 0.5) world.set(xx, yy, game.rng.next() < 0.15 ? M.RUBBLE : M.EMPTY, 0);
  }
  u.tremor = { x: u.x, y: u.y, tx: g.x, ty };
  if (d < 6 || Math.abs(dx) < 4) {
    // Surface: pop out and fight as a crawler.
    u.burrowed = false;
    u.tremor = null;
    unstick(world, u);
    game.events.emit('borerSurfaced', { x: u.x, y: u.y, team: u.team, id: u.id });
  }
}
