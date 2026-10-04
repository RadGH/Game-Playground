// Thousandvale — the SERVER MONSTER BRAIN (PLAN §6.1, §7, §8.5).
//
// Forked from Farhold's `EnemyField.update` (prototypes/farhold/js/actors.js, line ~825) with the
// meshes taken out: no actor, no group, no aura ring — a monster's `anim` is a string the snapshot
// carries, and anything Farhold drew becomes an event on `field.out`. What it decides is Farhold's,
// line for line and in the same rng order, so a single-player fight runs the same here as there
// (tests/C/parity-monster.test.mjs runs the real EnemyField beside this file).
//
// What is different on purpose (MMO):
//   * "the player" becomes the NEAREST friendly body (for noticing) and the THREAT TABLE's pick
//     (for whom it fights) — js/rules/threat.js. With one player and no companions those are the
//     same body, which is what the parity fixture runs.
//   * no despawn ring around one player: the spawner owns bodies. Instead a LEASH (PLAN §7): a
//     monster dragged more than AI.LEASH_METRES from home, or chasing for AI.LEASH_SECONDS with no
//     damage dealt or taken, gives up, walks home, and heals (no training onto low levels).
//   * a monster with no friendly body within AI.THINK_RADIUS does not think (PLAN §8.5).
//   * Farhold's `hooks.onEnemyStrike` (main.js line ~9584) is `monsterStrike` here.
//
// Not yet ported (listed so nothing is silently dropped; js/rules/README.md keeps the list):
//   building sieges (no building in Thousandvale v1), placed taunt objects (banners/posts — M1 with
//   the knight), leader escorts/rout (warbands, M2), transmute scaling (client-side only).

import {
  applyStatus, tickStatuses, slowOf, incomingFrom, outgoingFrom, groundAt, wetAt, cliffStep,
  climbable, crossesWall, COMBAT_FEEL,
} from './farhold.js';
import { pickTarget, notice as noticeThreat, clearThreat, threatFromDamage } from './threat.js';

export const AI = {
  LEASH_METRES: 40,
  LEASH_SECONDS: 8,
  THINK_RADIUS: 200,
  /** a body that has fallen is removed this long after (actors.js: 2.4 s) */
  CORPSE_SECONDS: 2.4,
  RETURN_SPEED: 1.6,
};

// --------------------------------------------------------------------------- spawning

/**
 * Put a monster down: Farhold's `rpg.makeEnemy` + the fields `EnemyField.add` (actors.js line
 * ~500) sets, in the same rng order (makeEnemy, facing, hover if flying, bob).
 */
export function spawnMonster(field, def, level, x, z, { rank = 'normal', modifiers = [], name = null, boss = false, id = null, rng = null } = {}) {
  const r = rng || field.room.streams.get('spawn');
  const unit = field.rpg.makeEnemy(def, level, r, { rank: boss && rank === 'normal' ? 'boss' : rank, modifiers, name });
  if (id != null) unit.id = id;
  unit.x = x; unit.z = z; unit.y = field.terrain ? groundAt(field.terrain, x, z) : 0;
  unit.state = 'wander'; unit.wanderTimer = 0; unit.swingTimer = 0; unit.hitFlash = 0;
  unit.stagger = 0; unit.push = null; unit.recoil = null; unit.sunder = 0; unit.sunderLeft = 0; unit.closing = 0;
  unit.home = [x, z];
  unit.facing = r() * Math.PI * 2;
  unit.hover = def.flying ? 1.4 + r() * 0.8 : 0;
  unit.bob = r() * Math.PI * 2;
  unit.playerDamage = 0;
  if (boss) unit.boss = true;
  const sizeUp = modifiers.reduce((m, mod) => m * (mod.scale ?? 1), 1) * (def.scale ?? 1);
  if (sizeUp !== 1) {
    unit.scale *= sizeUp;
    unit.reach = (unit.reach || 2.2) * (1 + (sizeUp - 1) * 0.6);
    unit.aggroRange = (unit.aggroRange || 26) * (1 + (sizeUp - 1) * 0.2);
    unit.hover *= sizeUp;
  }
  unit.bodyR = Math.max(0.4, (unit.reach || 2.2) * 0.3);
  unit.fx = [...(def.fx || []), ...modifiers.map(m => m.fx).filter(Boolean)];
  unit.anim = 'idle';
  unit.lastCombatAt = field.clock;
  field.add(unit, 'monster');
  field.emit({ t: 'spawn', id: unit.id, kind: 'monster', defId: def.id, name: unit.name, level: unit.level, rank: unit.rank, hpMax: unit.maxHp, x, z });
  return unit;
}

/** actors.js `applyModifier`, without the aura mesh (a boss phase turns one on mid-fight). */
export function applyModifier(field, e, id) {
  const table = field.room.engine?.bestiary?.modifiers || [];
  const m = typeof id === 'object' && id ? id : table.find(x => x.id === id);
  if (!m) return;
  e.dmg = e.dmg.map(v => (m.exact ? v * (m.dmg ?? 1) : Math.round(v * (m.dmg ?? 1))));
  e.armor = Math.round(e.armor * (m.armor ?? 1));
  e.modDmg = (e.modDmg || 1) * (m.dmg ?? 1); e.modArmor = (e.modArmor || 1) * (m.armor ?? 1);
  e.speed *= m.speed ?? 1;
  e.attackEvery *= m.attackEvery ?? 1;
  if (m.onHit) e.onHit = [...(e.onHit || []), m.onHit];
  if (m.thorns) e.derived.thorns = (e.derived.thorns || 0) + m.thorns;
  if (m.resist) e.derived.resistAll = (e.derived.resistAll || 0) + m.resist * 100;
  if (m.lifeSteal) e.lifeSteal = (e.lifeSteal || 0) + m.lifeSteal;
  e.modifiers = [...(e.modifiers || []), m.id];
  if (m.aura) e.auraColour = m.aura;
  if (m.fx && !(e.fx || []).includes(m.fx)) (e.fx || (e.fx = [])).push(m.fx);
  field.emit({ t: 'fx', kind: 'modifier', id: e.id, modifier: m.id, aura: m.aura || null });
}

/** actors.js `statusOnHit`: a monster's bite leaves its status. */
export function statusOnHit(field, e, target) {
  if (!e.onHit?.length) return null;
  const type = e.onHit[Math.floor(field.rng() * e.onHit.length)];
  const spec = field.statusData?.[type];
  if (!spec) return null;
  applyStatus(target, type, spec, Math.max(1, (e.dmg[1] || 4) * 0.5));
  return type;
}

// --------------------------------------------------------------------------- the swing

/**
 * A monster's melee swing lands on `victim` (main.js `onEnemyStrike`, line ~9584): Farhold's
 * `rpg.strike` with the buffs both sides carry, life steal, the bite's status. Returns the result.
 */
export function monsterStrike(field, e, victim, { element = 'physical', ranged = false } = {}) {
  if (victim?.kind === 'object') {
    // a taunting post, banner or wall takes the swing (actors.js onEnemyStrikeObject)
    field.hooks?.onObjectStruck?.(e, victim);
    e.lastCombatAt = field.clock;
    return null;
  }
  // the victim's own skill statuses (wards, counters, "every N hits" bursts) act as the victim
  const hit = () => field.rpg.strike(e, victim, field.rng, { multiplier: incomingFrom(victim) * outgoingFrom(e), element, ranged });
  const result = field.hooks?.asActor ? field.hooks.asActor(victim, hit) : hit();
  field.hooks?.onHurt?.(result, e, victim);                 // skill wards/counters (cast.js, M1)
  if (e.lifeSteal) e.hp = Math.min(e.maxHp, e.hp + Math.round(result.amount * e.lifeSteal));
  if (e.onHit?.length) statusOnHit(field, e, victim);
  e.lastCombatAt = field.clock;
  field.report(e, victim, result, ranged ? 'shot' : 'bite');
  if (result.dead && victim.hp <= 0) {
    if (victim.kind === 'player') {
      victim.dead = true;
      field.emit({ t: 'death', id: victim.id, by: e.id });
    } else {
      victim.dying = 0;
      field.emit({ t: 'death', id: victim.id, by: e.id });
    }
    field.hooks?.onFriendDown?.(victim, e);
  }
  return result;
}

/**
 * An archer/caster's shot (main.js `onEnemyShoot`): it lands after its flight time, where it was
 * AIMED — a target that moved more than 2.6 m is missed. Queued on the field and resolved in
 * `tickShots`.
 */
function shoot(field, e, target) {
  const spec = e.ranged || { range: 24, element: 'physical' };
  const dist = Math.hypot(target.x - e.x, target.z - e.z);
  const flight = Math.max(0.11, dist / 40);
  (field.shots || (field.shots = [])).push({ by: e, target, toX: target.x, toZ: target.z, left: flight, element: spec.element || 'physical' });
  field.emit({ t: 'fx', kind: 'shot', id: e.id, to: target.id, element: spec.element || 'physical', ms: Math.round(flight * 1000) });
}

function tickShots(field, dt) {
  const list = field.shots;
  if (!list?.length) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.left -= dt;
    if (s.left > 0) continue;
    list.splice(i, 1);
    const v = s.target;
    if (!field.usable(v) || s.by.dying != null || s.by.removed) continue;
    if (Math.hypot(v.x - s.toX, v.z - s.toZ) > 2.6) continue;
    monsterStrike(field, s.by, v, { element: s.element, ranged: true });
  }
}

// --------------------------------------------------------------------------- movement helpers

function unstick(field, x, z, radius, fromX, fromZ) {
  let ox = x, oz = z;
  const solids = field.solids || [];
  if (!solids.length) return [ox, oz];
  const out = [0, 0];
  const from = fromX != null ? [fromX, fromZ] : null;
  for (const s of solids) {
    if (!s) continue;
    s.resolve(ox, oz, radius, out, null, from);
    ox = out[0]; oz = out[1];
  }
  return [ox, oz];
}

const T = field => field.terrain;
const clampW = (field, x, z) => (T(field)?.clampToWorld ? T(field).clampToWorld(x, z) : [x, z]);
const ground = (field, x, z, feet) => (T(field) ? groundAt(T(field), x, z, feet) : 0);
const wet = (field, x, z, feet) => (T(field) ? wetAt(T(field), x, z, feet) : false);

/** actors.js `slide` */
function slide(field, e, dx, dz) {
  if (!dx && !dz) return;
  let [cx, cz] = clampW(field, e.x + dx, e.z + dz);
  [cx, cz] = unstick(field, cx, cz, (e.reach || 2) * 0.28, e.x, e.z);
  if (wet(field, cx, cz, e.y)) return;
  e.x = cx; e.z = cz;
  e.y = ground(field, cx, cz, e.y);
}

/** actors.js `shove` */
function shove(field, a, b) {
  const want = (a.bodyR || 0.6) + (b.bodyR || 0.6);
  let dx = b.x - a.x, dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= want * want) return;
  let d = Math.sqrt(d2);
  if (d < 1e-3) {
    dx = Math.sin(a.facing || 0) - Math.sin(b.facing || 1);
    dz = Math.cos(a.facing || 0) - Math.cos(b.facing || 1);
    d = Math.hypot(dx, dz) || 1;
    if (d < 1e-3) { dx = 1; dz = 0; d = 1; }
  }
  const nx = dx / d, nz = dz / d;
  const push = Math.min((want - d) * 0.5, 0.34);
  const wa = (a.boss ? 40 : 1) * (a.scale || 1) ** 2, wb = (b.boss ? 40 : 1) * (b.scale || 1) ** 2;
  const total = wa + wb;
  slide(field, a, -nx * push * (wb / total), -nz * push * (wb / total));
  slide(field, b, nx * push * (wa / total), nz * push * (wa / total));
}

/** actors.js `spread`: a 4 m grid, each pair of touching bodies pushed apart once. */
function spread(field) {
  const list = field.monsters;
  if (list.length < 2) return;
  const CELL = 4;
  const grid = new Map();
  for (const e of list) {
    if (e.removed || e.dying != null || e.hover) continue;
    const gx = Math.floor(e.x / CELL), gz = Math.floor(e.z / CELL);
    const key = gx * 1e6 + gz;
    let bucket = grid.get(key);
    if (!bucket) { bucket = { gx, gz, list: [] }; grid.set(key, bucket); }
    bucket.list.push(e);
  }
  const NEI = [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  for (const bucket of grid.values()) {
    for (const [ox, oz] of NEI) {
      const other = ox === 0 && oz === 0 ? bucket : grid.get((bucket.gx + ox) * 1e6 + (bucket.gz + oz));
      if (!other) continue;
      const same = other === bucket;
      for (let i = 0; i < bucket.list.length; i++) {
        for (let j = same ? i + 1 : 0; j < other.list.length; j++) shove(field, bucket.list[i], other.list[j]);
      }
    }
  }
}

/** The nearest usable friend to a point, and how far. */
function nearestFriend(field, e, friends) {
  let best = null, bd = Infinity;
  for (const f of friends) {
    const d = Math.hypot(f.x - e.x, f.z - e.z);
    if (d < bd) { bd = d; best = f; }
  }
  return { friend: best, dist: bd };
}

/** Give up: walk home, heal, forget everybody (the leash). */
export function resetMonster(field, e) {
  clearThreat(e);
  e.state = 'return';
  e.statuses = {};
  e.hp = e.maxHp;
  e.damageBy = null;
  e.playerDamage = 0;
  e.swingTimer = 0;
  field.emit({ t: 'fx', kind: 'leash', id: e.id });
}

// --------------------------------------------------------------------------- the tick

/**
 * One tick of every monster in the room (actors.js `update`). `hooks`:
 *   onStatusDamage(e, amount)   a burn/poison tick
 *   onBossPhase(e, phase)
 *   onStrike(e, victim)         override the melee swing (default: monsterStrike)
 */
export function tickMonsters(field, dt, hooks = {}) {
  const friends = field.friends().filter(field.usable);
  const list = [...field.monsters];
  const awakeBands = new Set();
  for (const e of list) {
    if (e.state !== 'chase' || e.dying != null) continue;
    const band = e.leader ?? (e.leads ? e.id : null);
    if (band != null) awakeBands.add(band);
  }
  const lookup = id => field.get(id);

  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.removed) continue;
    const { friend: near, dist } = nearestFriend(field, e, friends);

    if (e.dying != null) {
      e.dying += dt;
      if (e.dying > AI.CORPSE_SECONDS) { field.remove(e); field.emit({ t: 'gone', id: e.id }); }
      continue;
    }

    // asleep by distance (PLAN §8.5): nothing near enough to matter, so it does not think at all
    if (dist > AI.THINK_RADIUS && e.state !== 'return' && !e.boss) { e.anim = 'idle'; continue; }

    // ---- the leash (replaces Farhold's despawn ring)
    if (e.state === 'return') {
      const hx = e.home[0] - e.x, hz = e.home[1] - e.z, hd = Math.hypot(hx, hz);
      if (hd < 1) { e.state = 'wander'; e.wanderTimer = 0; e.anim = 'idle'; continue; }
      const step = Math.min(hd, e.speed * AI.RETURN_SPEED * dt);
      e.facing = Math.atan2(hx, hz);
      e.x += (hx / hd) * step; e.z += (hz / hd) * step;
      e.y = ground(field, e.x, e.z, e.y);
      e.anim = 'run';
      continue;
    }
    if (e.state === 'chase' && !e.boss) {
      // dragged too far from home, or stuck unable to reach anybody (no hit dealt or taken) too long
      const fromHome = Math.hypot(e.x - e.home[0], e.z - e.home[1]);
      const idle = field.clock - (Math.max(e.lastCombatAt ?? -Infinity, e.struckAt ?? -Infinity));
      const tgt = e.targetId != null ? field.get(e.targetId) : null;
      const close = tgt && Math.hypot(tgt.x - e.x, tgt.z - e.z) <= (e.reach || 2.4) + 1;
      if (fromHome > AI.LEASH_METRES || (idle > AI.LEASH_SECONDS && !close)) { resetMonster(field, e); continue; }
    }

    if (e.stagger > 0) {
      e.stagger -= dt;
      if (e.stagger <= 0) { e.stagger = 0; field.emit({ t: 'fx', kind: 'status', id: e.id, status: 'stun', on: false }); }
    } else if (e.swingTimer > 0) {
      let as = 0;
      for (const st of Object.values(e.statuses || {})) as = Math.max(as, st.attackSlow || 0);
      e.swingTimer -= dt * (1 - Math.min(0.9, as));
    }
    if (e.sunderLeft > 0) {
      e.sunderLeft -= dt;
      if (e.sunderLeft <= 0) { e.sunder = 0; field.emit({ t: 'fx', kind: 'status', id: e.id, status: 'sunder', on: false }); }
    }
    e.closing = dist < (e.lastDist ?? dist) - 0.01 ? (e.closing || 0) + dt : 0;
    e.lastDist = dist;

    // knockback (actors.js: before the chase branch, through the same guards walking uses)
    if (e.push) {
      const p = e.push;
      p.t -= dt;
      const was = p.done;
      const k = Math.max(0, Math.min(1, 1 - p.t / p.span));
      p.done = p.metres * (1 - (1 - k) ** 3);
      const step = p.done - was;
      if (step > 0 && p.carry) {
        for (const other of field.monsters) {
          if (other === e || other.dying != null || p.carry.hit.has(other)) continue;
          if (Math.hypot(other.x - e.x, other.z - e.z) > (other.reach || 2) * 0.4 + 0.9) continue;
          p.carry.hit.add(other);
          const res = field.rpg.strike(p.carry.by, other, field.rng, { multiplier: p.carry.mult });
          field.land(other, res, { strike: { push: 1.2, stagger: p.carry.stagger }, fromX: e.x, fromZ: e.z, by: p.carry.by });
          field.report(p.carry.by, other, res, 'carry');
          e.stagger = Math.max(e.stagger || 0, p.carry.stagger);
          if (res.dead) field.kill(other);
        }
      }
      if (step > 0) {
        const nx = e.x + p.dx * step, nz = e.z + p.dz * step;
        let [cx, cz] = clampW(field, nx, nz);
        if (!e.hover) [cx, cz] = unstick(field, cx, cz, (e.reach || 2) * 0.28, e.x, e.z);
        const t = T(field);
        if (!wet(field, cx, cz, e.y) && (e.hover || !t || climbable(t, cx, cz, e.x, e.z, 0, e.y))
          && Math.hypot(cx - e.x, cz - e.z) > step * 0.4) {
          e.x = cx; e.z = cz;
        } else if (!p.walled) {
          p.walled = true;
          e.hp = Math.max(0, e.hp - Math.max(1, Math.round((e.maxHp || 20) * COMBAT_FEEL.wallSlamShare)));
          if (e.hp <= 0) { field.kill(e); continue; }
        }
      }
      if (p.t <= 0) e.push = null;
    }

    // stasis pays out as it thaws; turned runs out into a weaken
    const sx = e.statuses?.stasis;
    if (sx && sx.remaining - dt <= 0 && sx.bank > 0) {
      const pay = Math.round(sx.bank * (sx.bankMult ?? 1.5));
      sx.bank = 0;
      e.hp = Math.max(0, e.hp - pay);
      field.credit(e, null, pay);
      field.emit({ t: 'fx', kind: 'impact', id: e.id, element: 'arcane', crit: true });
      if (e.hp <= 0) { field.kill(e); continue; }
    }
    if (e.statuses?.turned) e.wasTurned = e.statuses.turned.weakenAfter || 0.001;
    else if (e.wasTurned) {
      if (e.wasTurned > 0.01) applyStatus(e, 'weaken', { ...(field.statusData?.weaken || { name: 'Weakened', kind: 'debuff', element: 'shadow', dealLess: 0.35 }), seconds: e.wasTurned }, 1);
      e.wasTurned = 0; e.hard = false;
    }
    e.shrunk = !!e.statuses?.transmuted;

    if (e.statuses) {
      const burned = tickStatuses(e, dt);
      if (burned > 0) {
        hooks.onStatusDamage?.(e, burned);
        field.emit({ t: 'dot', id: e.id, amt: burned, hp: Math.max(0, Math.round(e.hp)) });
        if (e.hp <= 0) { field.kill(e); continue; }
      }
    }

    // boss phases: each fires once
    if (e.phases) {
      const frac = e.hp / Math.max(1, e.maxHp);
      for (const p of e.phases) {
        if (p.fired || frac > p.at) continue;
        p.fired = true;
        applyModifier(field, e, p.modifier);
        hooks.onBossPhase?.(e, p);
        field.emit({ t: 'phase', id: e.id, say: p.say || null });
      }
      if (e.spawns && e.spawns.at) {
        for (let k = 0; k < e.spawns.at.length; k++) {
          if (frac > e.spawns.at[k] || (e.spawnedAt || []).includes(k)) continue;
          (e.spawnedAt || (e.spawnedAt = [])).push(k);
          const sub = field.room.engine?.enemyDef?.(e.spawns.id);
          if (sub) for (let n = 0; n < (e.spawns.count || 2); n++) {
            const a = field.rng() * Math.PI * 2, r = 4 + field.rng() * 6;
            const [ax, az] = clampW(field, e.x + Math.cos(a) * r, e.z + Math.sin(a) * r);
            const called = spawnMonster(field, sub, e.level, ax, az, {});
            called.state = 'chase';
            for (const [id, v] of e.threat || []) (called.threat || (called.threat = new Map())).set(id, v * 0.5);
          }
        }
      }
    }

    // turned back at the town line
    if (!e.boss && !field.wild(e.x, e.z)) {
      e.state = 'flee';
      const zone = field.safeZones.find(s => (e.x - s.x) ** 2 + (e.z - s.z) ** 2 < s.r * s.r);
      if (zone) e.facing = Math.atan2(e.x - zone.x, e.z - zone.z);
      e.fleeFor = Math.max(e.fleeFor || 0, 2.5);
      clearThreat(e);
    }
    if (e.state === 'flee') {
      e.fleeFor = (e.fleeFor || 0) - dt;
      if (e.fleeFor <= 0 && field.wild(e.x, e.z)) { e.state = e.routed ? 'chase' : 'wander'; e.routed = false; }
    }

    // decide: notice the nearest friend; a pack notices together
    const notice = e.aggroRange * Math.max(0.25, 1 - (near?.derived?.stealth || 0));
    if (e.state !== 'chase' && e.state !== 'flee' && near && dist < notice) {
      e.state = 'chase';
      noticeThreat(e, near);
      e.lastCombatAt = field.clock;
      for (const mate of field.monsters) {
        if (mate === e || mate.dying != null || mate.state === 'chase') continue;
        if (mate.defId === e.defId && Math.hypot(mate.x - e.x, mate.z - e.z) < 14) {
          mate.state = 'chase';
          noticeThreat(mate, near);
          mate.lastCombatAt = field.clock;
        }
      }
    } else if (e.state !== 'chase' && e.state !== 'flee' && awakeBands.has(e.leader ?? (e.leads ? e.id : null))) {
      e.state = 'chase';
      if (near) noticeThreat(e, near);
      e.lastCombatAt = field.clock;
    } else if (e.state === 'chase' && dist > notice * 2.2 && !e.boss) {
      e.state = 'wander';
      clearThreat(e);
    }

    // who it is going for: the threat table (Farhold: aimOf)
    let target = null, foe = null;
    if (e.statuses?.turned) {
      e.state = 'chase';
      let bd = 16;
      for (const o of field.monsters) {
        if (o === e || o.dying != null || o.removed || o.statuses?.turned) continue;
        const d = Math.hypot(o.x - e.x, o.z - e.z);
        if (d < bd) { bd = d; foe = o; }
      }
    } else if (e.state === 'chase') {
      target = pickTarget(e, lookup, field.usable, dt);
      // woken (pack, band, hit by a DoT) with nothing on the table yet: the nearest friend
      if (!target && near) { noticeThreat(e, near); target = near; }
    }
    const aimAt = foe || target || (e.statuses?.turned?.follow ? near : null);
    const adx = aimAt ? aimAt.x - e.x : 0, adz = aimAt ? aimAt.z - e.z : 0;
    const adist = Math.hypot(adx, adz);
    e.aimingAt = target && target.kind !== 'player' ? target : null;

    const standOff = e.ranged && !e.statuses?.silence && !e.statuses?.turned ? Math.min(e.ranged.range * 0.65, e.ranged.range - 6) : 0;
    let speed = 0;
    const asleep = !!e.statuses?.sleep || !!e.statuses?.stasis;
    if (e.statuses?.fear && e.state !== 'flee') { e.state = 'flee'; e.fleeFor = Math.max(e.fleeFor || 0, e.statuses.fear.remaining || 2); e.feared = true; }
    if (e.feared && !e.statuses?.fear) { e.feared = false; if (e.state === 'flee') { e.state = 'chase'; e.fleeFor = 0; } }
    const rooted = !!e.statuses?.root;
    if (asleep) { e.y = ground(field, e.x, e.z, e.y); e.anim = 'idle'; continue; }
    if (e.stagger > 0) { e.y = ground(field, e.x, e.z, e.y); continue; }

    if (e.state === 'flee') {
      speed = e.speed * 1.15;
      if ((e.quarry || e.routed || e.feared) && near) e.facing = Math.atan2(e.x - near.x, e.z - near.z);
    } else if (e.state === 'chase') {
      if (aimAt) e.facing = Math.atan2(adx, adz);
      if (standOff > 0 && target) {
        if (adist > standOff + 3) speed = e.speed;
        else if (adist < standOff * 0.55) { speed = e.speed * 0.8; e.facing += Math.PI; }
        if (e.swingTimer <= 0 && adist <= e.ranged.range) {
          e.swingTimer = e.attackEvery;
          e.anim = 'attack';
          shoot(field, e, target);
        }
      } else if (!aimAt) {
        speed = 0;
      } else if (!foe && !target) {
        speed = adist > 3.5 ? e.speed : 0;             // turned and following, nobody to fight
      } else if (foe && adist > e.reach) {
        speed = e.speed;
      } else if (foe && e.swingTimer <= 0) {
        e.swingTimer = e.attackEvery;
        e.anim = 'attack';
        const res = field.rpg.strike(e, foe, field.rng, {});
        e.turnedHits = (e.turnedHits || 0) + 1;
        field.land(foe, res, { fromX: e.x, fromZ: e.z, by: null });
        field.report(e, foe, res, 'bite');
        threatFromDamage(foe, e, res.amount);
        if (res.dead) field.kill(foe);
      } else if (adist > e.reach) {
        speed = e.speed;
      } else if (e.swingTimer <= 0) {
        e.swingTimer = e.attackEvery;
        e.anim = 'attack';
        if (hooks.onStrike) hooks.onStrike(e, target); else monsterStrike(field, e, target);
      }
    } else {
      e.wanderTimer -= dt;
      if (e.wanderTimer <= 0) {
        e.wanderTimer = 2 + field.rng() * 4;
        e.facing = field.rng() * Math.PI * 2;
        e.strolling = field.rng() < 0.6;
      }
      if (e.strolling && !e.boss) speed = e.speed * 0.32;
    }
    if (e.removed) continue;

    if (rooted) speed = e.boss ? speed * 0.4 : 0;
    if (speed > 0) {
      speed *= 1 - slowOf(e);
      const nx = e.x + Math.sin(e.facing) * speed * dt;
      const nz = e.z + Math.cos(e.facing) * speed * dt;
      let [cx, cz] = clampW(field, nx, nz);
      const t = T(field);
      if (!e.hover && t) [cx, cz] = cliffStep(t, e, cx, cz, dt, { feet: e.y }, [0, 0]);
      if (!e.hover) [cx, cz] = unstick(field, cx, cz, (e.reach || 2) * 0.28, e.x, e.z);
      if (crossesWall(e.x, e.z, cx, cz)) { cx = e.x; cz = e.z; }
      if (!wet(field, cx, cz, e.y)) {
        if (Math.hypot(cx - e.x, cz - e.z) < speed * dt * 0.25) e.facing += (field.rng() - 0.5) * 1.6 + Math.PI * 0.5;
        e.x = cx; e.z = cz;
      } else { e.facing += Math.PI; }
    }
    e.y = ground(field, e.x, e.z, e.y);
    if (e.recoil) { e.recoil.t -= dt; if (e.recoil.t <= 0) e.recoil = null; }
    if ((e.swingTimer <= 0 || e.state !== 'chase') && !(e.emoteFor > 0)) {
      e.anim = speed > e.speed * 0.6 ? 'run' : speed > 0 ? 'walk' : 'idle';
    }
  }

  tickShots(field, dt);
  spread(field);
}
