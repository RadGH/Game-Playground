// Enemies (PLAN M4: Skitterkin on the home world). PURE.
//
// An enemy is an entity of kind `enemy` (§3.2: { family, raid, target } + type, hp, team 1). Raiders walk their
// raid's flow field (js/world/flow.js, built in raids.js); when the next step is a blocker (a wall section, a gate, a
// building they may attack) they stop and bite it; a spitter stops `range` short and spits acid. On the way they turn
// aside for anything damageable within `aggro` cells — porters and carts on the move, a camp by the path. Guards
// stay round their nest and bite what comes close. EVERY hit goes through the damage rule (targets.js).
// Moving: one tick at the type's speed × the cell's walk % (roads × the family's road factor) — the same cost the
// field was built with, so a raid's predicted path and its real walk agree.

import { SUB } from '../entities.js';
import { ROAD, BRIDGE, OWNED } from '../../world/grid.js';
import { walkable } from '../../world/edges.js';
import { canDamage, hurt } from './targets.js';
import { hyp, dir, powi } from './maths.js';

export function createEnemies(sim, DD) {
  const { g, M } = sim.world;
  const W = g.W;
  const rng = sim.rng.split('defence.enemies');
  const lastHit = new Map();
  const list = () => sim.ents.list('enemy');
  const PART = sim.defence.walls.PART;

  function spawn(type, x, y, fields = {}) {
    const row = DD.E[type];
    const e = sim.ents.add('enemy', {
      type, family: row.family, team: 1, x: Math.round((x + 0.5) * SUB), y: Math.round((y + 0.5) * SUB),
      hp: row.hp, hpMax: row.hp, raid: null, nest: null, target: null, state: 'guard', cd: 0, salt: rng.int(1 << 20),
      home: [x, y], stuck: 0, born: sim.tick, ...fields,
    });
    return e;
  }

  function remove(e) {
    sim.ents.remove(e.id);
    const r = e.raid && sim.defence.raids.get(e.raid);
    if (r) r.members = r.members.filter((id) => id !== e.id);
  }

  /** Walk factor of a cell for an enemy (0 = cannot stand there). */
  function factor(c) {
    if (!walkable(M, c) || PART[c & 255]) return 0;
    const fam = DD.F.skitterkin;
    const w = (c & BRIDGE) ? 100 : M.walk[c & 255];
    return (w / 100) * ((c & (ROAD | BRIDGE)) ? fam.road : 1);
  }

  /** The thing standing in cell (x, y) an enemy could bite: a wall piece or a building. */
  function pieceAt(x, y) {
    if (!g.inside(x, y)) return null;
    const c = g.cells[g.idx(x, y)];
    if (PART[c & 255]) return sim.defence.walls.pieceAt(x, y);
    if (c & OWNED) { const b = sim.defence.buildingAt(x, y); if (b) return b; }
    return null;
  }

  const dist2 = (e, x, y) => { const dx = e.x / SUB - x, dy = e.y / SUB - y; return dx * dx + dy * dy; };
  const reachOf = (row) => row.reach;

  /** Bite (or spit at) a target if the cooldown allows. */
  function attack(e, row, t, ranged = false) {
    if (e.cd > 0) return true;
    if (ranged && sim.mana?.shotBlocked) { const [tx, ty] = targetPoint(t); if (sim.mana.shotBlocked(e.x / SUB, e.y / SUB, tx, ty)) return false; } // M6: a shield stops the spit
    if (!canDamage(sim, t, { team: 1 })) return false;
    const isWall = t.kind === 'section';
    const dmg = row.damage * (isWall ? row.wall : 1);
    const done = hurt(sim, t, dmg, { team: 1, kind: row.acid ? 'acid' : 'bite', raid: e.raid, x: e.x / SUB, y: e.y / SUB });
    e.cd = row.cooldown;
    e.state = e.state === 'guard' ? 'guard' : 'attack';
    if (ranged) {
      const [tx, ty] = targetPoint(t);
      sim.events.push({ e: 'spit', tick: sim.tick, base: sim.base, x: Math.round(e.x / SUB), y: Math.round(e.y / SUB), x2: Math.round(tx), y2: Math.round(ty) });
    }
    if (isWall && e.raid) sim.defence.raids.atWall(e.raid, e);
    return done > 0 || true;
  }
  function targetPoint(t) {
    if (t.kind === 'section') return sim.defence.walls.mid(t.wall, t.wall.sections[t.i]);
    if (t.fp) return [t.fp.cx, t.fp.cy];
    return [t.x / SUB, t.y / SUB];
  }
  /** Nearest point of a building's footprint to (x, y). */
  function edgeDist(b, x, y) {
    const f = b.fp;
    const dx = Math.max(f.x0 - x, 0, x - (f.x0 + f.w)), dy = Math.max(f.y0 - y, 0, y - (f.y0 + f.h));
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Step toward cell (tx, ty) centre at the enemy's speed. Returns true when it arrived. */
  function moveToward(e, row, tx, ty) {
    let x = e.x / SUB, y = e.y / SUB;
    const c = g.cells[g.idx(Math.floor(x), Math.floor(y))];
    const f = Math.max(0.2, factor(c) || 0.5);
    // M6 frost snap: slowed by `slowBy` until `slowUntil`
    const chill = e.slowUntil > sim.tick ? 1 - (e.slowBy || 0) : 1;
    const sp = ((row.speed * 2) / 20) * f * chill;
    const dx = tx + 0.5 - x, dy = ty + 0.5 - y, d = hyp(dx, dy);
    if (d <= sp) { x = tx + 0.5; y = ty + 0.5; }
    else { x += (dx / d) * sp; y += (dy / d) * sp; }
    // never step onto ground it cannot stand on (a wall that went up under its nose, deep water)
    const nc = g.cells[g.idx(Math.floor(x), Math.floor(y))];
    if (!factor(nc)) return false;
    // M6's shield bubble keeps them out (a walker already inside may leave)
    if (sim.mana?.inShield?.(x, y) && !sim.mana.inShield(e.x / SUB, e.y / SUB)) return false;
    e.x = Math.round(x * SUB); e.y = Math.round(y * SUB);
    return d <= sp;
  }

  /** Carriers on the move within `aggro` cells (the only vehicles the rule lets them hit). */
  function carrierNear(e, r) {
    let best = null, bd = r * r;
    for (const v of sim.ents.list('vehicle')) {
      const d = dist2(e, v.x / SUB, v.y / SUB);
      if (d < bd && canDamage(sim, v, { team: 1 })) { bd = d; best = v; }
    }
    return best;
  }
  /** A damageable building or wall piece right beside the enemy (within reach). */
  function besideMe(e, reach) {
    const x = Math.floor(e.x / SUB), y = Math.floor(e.y / SUB), R = Math.ceil(reach);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > reach * reach + 0.5) continue;
      const p = pieceAt(x + dx, y + dy);
      if (p && canDamage(sim, p, { team: 1 })) return p;
    }
    return null;
  }

  function stepRaider(e, row, raid) {
    const field = raid.state === 'withdrawing' ? sim.defence.raids.homeOf(raid.id) : sim.defence.raids.fieldOf(raid.id);
    if (!field) return;
    const ex = e.x / SUB, ey = e.y / SUB;
    const cx = Math.floor(ex), cy = Math.floor(ey);
    const aggro = DD.bal.raid.aggro;
    if (raid.state !== 'withdrawing') {
      // porters and carts on the move are fair game
      const v = carrierNear(e, aggro);
      if (v) {
        if (Math.sqrt(dist2(e, v.x / SUB, v.y / SUB)) <= reachOf(row) + 0.6) { attack(e, row, v); return; }
        moveToward(e, row, Math.floor(v.x / SUB), Math.floor(v.y / SUB));
        return;
      }
      // the target itself, or anything it may bite right here
      const tgt = sim.defence.raids.targetOf(raid);
      if (tgt && edgeDist(tgt, ex, ey) <= (row.range || reachOf(row)) && canDamage(sim, tgt, { team: 1 })) { attack(e, row, tgt, !!row.range); return; }
      // a spitter stands back: anything to break within its range on the way ahead
      if (row.range) {
        let x = cx, y = cy;
        for (let k = 0; k < row.range; k++) {
          const n = field.next(x, y, e.salt);
          if (!n) break;
          [x, y] = n;
          if (field.blocker(x, y)) { const p = pieceAt(x, y); if (p && canDamage(sim, p, { team: 1 })) { attack(e, row, p, true); return; } break; }
        }
      }
    }
    const n = field.next(cx, cy, e.salt);
    if (!n) {
      // at a goal (or stuck): bite what is beside it, else count
      if (raid.state === 'withdrawing') { if (field.at(cx, cy) <= 1.5) sim.defence.raids.home(raid, e); else e.stuck++; return; }
      const p = besideMe(e, reachOf(row) + 0.5);
      if (p) { attack(e, row, p); e.stuck = 0; return; }
      if (++e.stuck > 60) { e.stuck = 0; raid.lost = (raid.lost || 0) + 1; }
      return;
    }
    if (field.blocker(n[0], n[1])) {
      const p = pieceAt(n[0], n[1]);
      if (p && canDamage(sim, p, { team: 1 })) { attack(e, row, p); return; }
      // a blocker that is no longer one (the wall fell, the building went): walk on next tick when the field catches up
      sim.defence.raids.stale(raid);
      if (factor(g.cells[g.idx(n[0], n[1])])) moveToward(e, row, n[0], n[1]);
      return;
    }
    if (field.isGoal(n[0], n[1]) && raid.state !== 'withdrawing') {
      const tgt = sim.defence.raids.targetOf(raid);
      if (tgt) { attack(e, row, tgt); return; }
    }
    if (!moveToward(e, row, n[0], n[1]) && !factor(g.cells[g.idx(n[0], n[1])])) {
      // something new stands there (a building went up): bite it if it may, else wait for a fresh field
      const p = pieceAt(n[0], n[1]);
      if (p && canDamage(sim, p, { team: 1 })) attack(e, row, p);
      else { sim.defence.raids.stale(raid); e.stuck++; }
    } else e.stuck = 0;
  }

  function stepGuard(e, row) {
    const nest = e.nest && sim.ents.get(e.nest);
    if (!nest) { remove(e); return; }
    // bite anything damageable right beside it
    const p = besideMe(e, reachOf(row) + 0.5);
    if (p) { attack(e, row, p); return; }
    const v = carrierNear(e, 3);
    if (v) { attack(e, row, v); return; }
    if (e.still) return; // posted (tests, and M5's sentries later): stays where it was put
    // drift round the mound
    if (!e.wander || sim.tick >= e.wander[2]) {
      const [ca, sa] = dir(rng.float()), d = nest.r + 3 + rng.float() * 8;
      e.wander = [Math.round(nest.x / SUB + ca * d), Math.round(nest.y / SUB + sa * d), sim.tick + 60 + rng.int(120)];
    }
    const [tx, ty] = e.wander;
    if (hyp(tx + 0.5 - e.x / SUB, ty + 0.5 - e.y / SUB) > 0.6 && g.inside(tx, ty) && factor(g.cells[g.idx(tx, ty)])) moveToward(e, { ...row, speed: row.speed * 0.35 }, tx, ty);
  }

  function step() {
    for (const e of [...list()]) {
      if (e.removed) continue;
      const row = DD.E[e.type];
      e.px = e.x; e.py = e.y;
      if (e.cd > 0) e.cd--;
      if (e.raid) {
        const raid = sim.defence.raids.get(e.raid);
        if (!raid) { e.raid = null; e.state = 'guard'; continue; }
        if (raid.state === 'forming') continue;
        stepRaider(e, row, raid);
      } else stepGuard(e, row);
    }
  }

  /** Hit an enemy (through the damage rule). At zero it dies: a stain, a spatter of chitin, a burst for the big ones. */
  function damage(e, amount, source) {
    e.hp -= amount;
    if (e.hp > 0) {
      if (sim.tick - (lastHit.get(e.id) ?? -1e9) >= 10) { lastHit.set(e.id, sim.tick); }
      return amount;
    }
    die(e, source);
    return amount;
  }

  function die(e, source) {
    const row = DD.E[e.type];
    const x = e.x / SUB, y = e.y / SUB;
    remove(e);
    // the remains: a few cells of husk where it fell (regrows), and bits of shell flying
    const husk = M.id[row.remains] ?? M.id.husk;
    const R = row.size === 'large' ? 2 : row.size === 'medium' ? 1 : 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy;
      if (!g.inside(xx, yy) || dx * dx + dy * dy > R * R + 1) continue;
      const i = g.idx(xx, yy), c = g.cells[i], m = c & 255;
      if (!M.walk[m] || M.water[m] || (c & OWNED) || (c & (ROAD | BRIDGE))) continue;
      g.cells[i] = ((c & 0xffff0000 & ~0xff0000) | husk | (M.ambient << 8)) >>> 0; g.ver[i >>> 12]++; g.regrowHint[i >>> 12] = 1;
    }
    const bits = row.size === 'large' ? 8 : row.size === 'medium' ? 4 : 2;
    for (let k = 0; k < bits; k++) { const [ca, sa] = dir(rng.float()), sp = 0.3 + rng.float() * 0.7; sim.world.debris.spawn(x, y, ca * sp, sa * sp, 0.3 + rng.float() * 0.5, husk, false); }
    if (row.burst) sim.world.blast(Math.floor(x), Math.floor(y), row.burst[0], row.burst[1], { by: 'enemy' });
    sim.events.push({ e: 'enemyDied', tick: sim.tick, base: sim.base, id: e.id, type: e.type, x: Math.round(x), y: Math.round(y), by: source?.kind || null, raid: e.raid });
    sim.defence.kills = (sim.defence.kills || 0) + 1;
  }

  return { spawn, remove, step, damage, factor, pieceAt, list };
}
