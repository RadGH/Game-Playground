// Thousandvale — the combat core as the ROOM sees it (docs/protocol.md §7). The room (stream A,
// js/sim/room.js) imports exactly `createRules(host, opts)`; everything else under js/rules/ is
// behind it.
//
// Two worlds meet here and this file is the only place they touch:
//   * the room's ENTITIES (js/sim/entity.js): positions, hp bars, anims, targets — mutated only
//     through their methods so the snapshot dirty bits are right;
//   * the combat core's UNITS: Farhold player sheets and enemy units, mutated freely by Farhold's
//     own formulas (`rpg.strike` writes `hp` directly, statuses hang off the unit).
// Each entity holds its unit at `e.r.unit`. Every call syncs IN (where the room moved a player)
// before the combat core runs and syncs OUT (hp, mana, monster positions, anims, deaths, targets)
// after, then turns the core's events (js/rules/field.js `out`) into protocol events (§6).
//
// The data is loaded once per process at module load (top-level await, js/rules/boot.js), so
// `createRules` stays synchronous; if loading fails the import fails and the room falls back to its
// stand-in rules, which is the behaviour stream A built for exactly this.

import { bootData } from './boot.js';
import { createEngine } from './engine.js';
import { createRoomContext } from './room.js';
import { attachField } from './field.js';
import { createCombat } from './cast.js';
import { createCharacter } from './character.js';
import { spawnMonster, tickMonsters } from './monster-ai.js';
import { clearThreat } from './threat.js';
import { makeRng } from './rng.js';
import { validTarget, TAB } from './targeting.js';
export { serializeGear, restoreGear } from './character.js';
export { nextTarget, tabOrder, validTarget } from './targeting.js';
import { xpForLevel, levelFromXp, hashStr } from './farhold.js';

let shared = null;
/** Build the process-wide engine (index.js does this itself at load; a host may call it first). */
export async function prepareRules(data = null, opts = {}) {
  shared = createEngine(data || await bootData(), opts);
  return shared;
}
await prepareRules();
export const rulesEngine = () => shared;

/** Monster `type` names the room's camps use, mapped to Farhold bestiary ids. */
export const TYPE_ALIASES = { wolf: 'moor_hound', hound: 'moor_hound' };

/** Protocol refusal codes (castR `why`): cooldown, range, mana, dead, target, unknown. */
function whyCode(text = '') {
  if (/not ready|cooldown/i.test(text)) return 'cooldown';
  if (/mana/i.test(text)) return 'mana';
  if (/dead/i.test(text)) return 'dead';
  if (/range|reach/i.test(text)) return 'range';
  if (/target/i.test(text)) return 'target';
  return 'unknown';
}

/** The room's heightmap in the shape js/rules/ (and Farhold's ground.js) reads. */
function terrainFrom(host) {
  const h = (x, z) => host.groundAt(x, z);
  const S = 0.75;
  return {
    heightAt: h,
    slopeAt: (x, z, s = S) => Math.hypot(h(x + s, z) - h(x - s, z), h(x, z + s) - h(x, z - s)) / (2 * s),
    normalAt: (x, z, s = S, out = [0, 1, 0]) => {
      const dx = (h(x + s, z) - h(x - s, z)) / (2 * s), dz = (h(x, z + s) - h(x, z - s)) / (2 * s);
      const l = Math.hypot(dx, 1, dz);
      out[0] = -dx / l; out[1] = 1 / l; out[2] = -dz / l;
      return out;
    },
    waterAt: (x, z) => (host.walkable(x, z) ? 0 : 1),
    underwater: (x, z) => !host.walkable(x, z),
    roadAt: () => 0,
    clampToWorld: (x, z) => [x, z],
    biomeIdAt: () => 0,
  };
}

const ONE_SHOT_ANIMS = new Set(['attack', 'hit', 'bite', 'cast']);

export function createRules(host, opts = {}) {
  const engine = shared;
  const room = createRoomContext({ id: String(opts.roomId ?? host.roomId ?? 'room'), seed: opts.seed ?? 1, engine });
  const field = attachField(room, { terrain: terrainFrom(host) });
  const combat = createCombat(room);
  room.combat = combat;
  combat.tickMonsters = dt => tickMonsters(field, dt);
  const entOf = unit => (unit?.id != null ? host.entities.get(unit.id) : null);
  let regenClock = 0;

  combat.award = (unit, { xp, gold, items }) => {
    const e = entOf(unit);
    if (!e) return;
    host.award(e, { xp, gold });
    if (items?.length) host.event({ type: 'loot', to: e.id, d: e.id, items, gold });
  };

  // ------------------------------------------------------------------ sync

  function syncIn() {
    for (const p of field.players) {
      const e = entOf(p);
      if (!e) continue;
      p.x = e.x; p.y = e.y; p.z = e.z; p.yaw = e.yaw;
    }
  }

  function syncOut() {
    for (const list of [field.players, field.monsters]) {
      const monsters = list === field.monsters;
      for (const u of list) {
        const e = entOf(u);
        if (!e || e.removed) continue;
        if (monsters) {
          if (u.x !== e.x || u.z !== e.z) e.moveTo(u.x, u.z);
          if (Number.isFinite(u.facing)) e.face(u.facing);
          const tid = u.targetId ?? 0;
          if (typeof tid === 'number' && tid !== e.target) {
            if (tid && !e.target) host.event({ type: 'aggro', s: e.id, d: tid });
            e.setTarget(tid);
          }
          const fighting = u.state === 'chase' && u.dying == null;
          e.setState(2, fighting);                    // STATE.combat
          if (u.anim && u.anim !== u._sentAnim) {
            if (ONE_SHOT_ANIMS.has(u.anim)) e.anim(u.anim === 'attack' && u.kind === 'beast' ? 'bite' : u.anim);
            else if (u.anim !== 'dead') e.loop(u.anim);
            u._sentAnim = u.anim;
          }
          if (u.dying != null && !e.dead) { e.setHp(0); e.kill(entOf({ id: lastHitBy(u) })); host.despawn(e, 8000); continue; }
        } else if (u.x !== e.x || u.z !== e.z) {
          e.moveTo(u.x, u.z);                         // a dash or a knock moved a player
        }
        if (u.maxHp !== e.hpMax || (u.maxMp ?? 0) !== e.mpMax) e.setMax(u.maxHp, u.maxMp ?? 0);
        e.setHp(Math.round(u.hp));
        if (u.kind === 'player') {
          e.setMp(Math.round(u.mp ?? 0));
          if (u.dead && !e.dead) e.kill(entOf({ id: u.killedBy }));
        }
      }
    }
  }
  const lastHitBy = u => { let best = null, bv = -1; for (const [id, v] of u.damageBy || []) if (v > bv) { bv = v; best = id; } return best; };

  /** field events -> protocol events (§6) */
  function flush() {
    for (const ev of field.drain()) {
      switch (ev.t) {
        case 'hit':
          if (ev.dodged) host.event({ type: 'miss', s: ev.src, d: ev.dst, why: 'dodge' });
          else if (ev.amt > 0 || ev.absorbed > 0) host.event({ type: 'hit', s: ev.src, d: ev.dst, n: ev.amt, crit: ev.crit || undefined, el: ev.element !== 'physical' ? ev.element : undefined, kind: 'dmg', skill: ev.kind });
          else if (ev.blocked) host.event({ type: 'miss', s: ev.src, d: ev.dst, why: 'block' });
          if (ev.dead) { const v = field.get(ev.dst); if (v?.kind === 'player') v.killedBy = ev.src; }
          break;
        case 'heal': host.event({ type: 'hit', s: ev.src, d: ev.dst, n: ev.amt, kind: 'heal' }); break;
        case 'dot': host.event({ type: 'hit', s: 0, d: ev.id, n: Math.round(ev.amt), kind: 'dmg', skill: 'dot' }); break;
        case 'cast': {
          const e = host.entities.get(ev.id);
          e?.anim('cast');
          host.event({ type: 'cast', s: ev.id, slot: ev.slot ?? undefined, skill: ev.skill, aim: ev.aim });
          break;
        }
        case 'swing': host.entities.get(ev.id)?.anim('attack'); host.event({ type: 'cast', s: ev.id, slot: 0, skill: 'basic' }); break;
        case 'revive': { const e = host.entities.get(ev.id); if (e?.dead) e.revive(ev.hp / Math.max(1, e.hpMax)); break; }
        case 'fx': {
          const at = ev.id != null ? host.entities.get(ev.id) : null;
          host.event({ ...ev, t: undefined, type: 'fx', id: ev.id ?? 0, x: ev.x ?? at?.x, z: ev.z ?? at?.z });
          break;
        }
        default: break;              // spawn/gone/death/reward/move are carried by the entities themselves
      }
    }
    for (const ev of room.drainEvents()) {
      if (ev.kind === 'statusFx' && ev.unit?.id != null) host.event({ type: 'fx', id: ev.unit.id, kind: 'status', status: ev.type, on: ev.on });
    }
  }

  const run = fn => room.run(() => { syncIn(); const out = fn(); syncOut(); flush(); return out; });

  // ------------------------------------------------------------------ the interface

  function addEntity(e) {
    run(() => {
      if (e.kind === 'player') {
        const ch = e.char || {};
        const unit = createCharacter(engine, {
          id: e.id, classId: ch.cls || e.cls || 'warrior', level: ch.level || e.level || 1, name: e.name,
          rng: makeRng(hashStr(`${ch.id ?? ch.name ?? e.name}:kit`)), x: e.x, z: e.z, y: e.y, yaw: e.yaw,
          gear: ch.gear || null,          // a saved gear blob (serializeGear) wins over the class kit
        });
        unit.roomRng = room.streams.get('bars');
        unit.partyId = ch.partyId ?? e.data?.partyId ?? null;
        if (ch.hp > 0) unit.hp = Math.min(ch.hp, unit.maxHp);
        field.add(unit, 'player');
        e.r.unit = unit;
        e.setMax(unit.maxHp, unit.maxMp ?? 0);
        e.setHp(unit.hp); e.setMp(unit.mp ?? unit.maxMp);
      } else if (e.kind === 'monster') {
        const def = engine.enemyDef(TYPE_ALIASES[e.type] || e.type) || engine.enemyDef('moor_hound');
        const unit = spawnMonster(field, def, e.level || 1, e.x, e.z, { id: e.id });
        e.r.unit = unit;
        e.setMax(unit.maxHp, 0);
        e.setHp(unit.hp);
      }
    });
  }

  function removeEntity(e) {
    room.run(() => {
      const u = e.r.unit;
      if (u) field.remove(u);
      for (const p of room.combat.pending) if (p.who === e.id) p.fn = () => {};
    });
  }

  function intent(e, msg) {
    const u = e.r.unit;
    if (!u) return { ok: false, why: 'unknown' };
    if (msg.t === 'target') {
      const t = msg.id ? host.entities.get(msg.id) : null;
      if (msg.id && !validTarget(u, t, { range: TAB.RANGE * 1.5 })) return { ok: false, why: 'target' };
      e.setTarget(msg.id || 0);
      return { ok: true };
    }
    if (msg.t !== 'cast' || !Number.isInteger(msg.slot)) return { ok: false, why: 'unknown' };
    return run(() => {
      // face what the cast is aimed at: the Tab target, else the ground point
      const t = msg.target != null ? host.entities.get(msg.target) : null;
      if (t && !t.dead) u.yaw = Math.atan2(t.x - u.x, t.z - u.z);
      else if (msg.aim && Number.isFinite(msg.aim.x) && Number.isFinite(msg.aim.z)) u.yaw = Math.atan2(msg.aim.x - u.x, msg.aim.z - u.z);
      e.face(u.yaw);
      const res = msg.slot === 0
        ? combat.attack(u, { yaw: u.yaw, held: msg.held })
        : combat.cast(u, msg.slot - 1, { aim: msg.aim, target: msg.target ?? null, yaw: u.yaw });
      if (res.ok) return { ok: true };
      return { ok: false, why: whyCode(res.why), text: res.why };
    });
  }

  function step(dtMs) {
    const dt = dtMs / 1000;
    run(() => {
      room.clock.advance(dt);
      combat.tick(dt);                 // due wind-ups, then the monsters (tickMonsters below), bars, runtime
      // Farhold's one-second regen tick (main.js ~9762) and the cast barrier running down
      regenClock += dt;
      const second = regenClock >= 1;
      if (second) regenClock -= 1;
      for (const p of field.players) {
        if (p.dead) continue;
        if (p.castBarrierFor > 0) { p.castBarrierFor -= dt; if (p.castBarrierFor <= 0) { p.castBarrierFor = 0; p.barrier = 0; } }
        if (!second) continue;
        const fighting = field.monsters.some(m => m.dying == null && m.targetId === p.id);
        const mending = fighting ? 0 : p.maxHp * (engine.balance.player?.outOfCombatRegen ?? 0.015);
        p.hp = Math.min(p.maxHp, p.hp + (p.derived.hpRegen || 0) + mending);
        if (!Object.values(p.statuses || {}).some(st => st.noManaRegen)) p.mp = Math.min(p.maxMp, p.mp + (p.derived.mpRegen || 0) + (fighting ? 0 : p.maxMp * 0.02));
        const ent = entOf(p);
        if (ent) ent.setState(2, fighting);
      }
    });
  }

  function respawn(e) {
    run(() => {
      const u = e.r.unit;
      if (!u) return;
      u.dead = false; u.killedBy = null;
      u.statuses = {};
      u.hp = u.maxHp; u.mp = u.maxMp;      // Farhold R22: a respawn restores health AND mana
      for (const m of field.monsters) if (m.threat?.has(u.id)) { m.threat.delete(u.id); if (m.targetId === u.id) m.targetId = null; }
      u.x = e.x; u.z = e.z;
    });
  }

  function onLevel(e) {
    run(() => {
      const u = e.r.unit;
      if (!u) return;
      u.level = e.char?.level || e.level;
      engine.rpg.refresh(u, { full: true });
      u.hp = u.maxHp; u.mp = u.maxMp;
      e.setLevel(u.level);
    });
  }

  return {
    addEntity, removeEntity, intent, step, respawn, onLevel,
    levelFor: xp => levelFromXp(xp, engine.levelCap),
    xpFor: level => xpForLevel(level, engine.levelCap),
    dispose() { room.run(() => { for (const m of [...field.monsters]) clearThreat(m); }); },
    /** for tests and devtools */
    room, field, combat,
  };
}
