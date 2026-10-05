// Thousandvale — the COMBAT FIELD of one room: who stands where, and what a strike shape hits.
//
// Forked from Farhold's `EnemyField` (prototypes/farhold/js/actors.js) — the target selection of
// `strike` / `strikeArea` / `strikeSegment`, and the server half of `land` / `kill` / `bleed` /
// `sunder` — with every mesh, sound and screen effect replaced by an EVENT the client draws.
// The damage itself is never forked: each hit is Farhold's own `rpg.strike`, called with the same
// multiplier, in the same order, off the same rng, which is what the parity fixtures check
// (tests/C/parity-*.test.mjs run the real EnemyField beside this one).
//
// What is different on purpose (MMO, PLAN §6.2/§7):
//   * many players: a strike is made BY an entity (`from` = its position and yaw, `unit` = its
//     sheet; in Thousandvale they are the same object);
//   * credit is per entity (`e.damageBy`), so shared tagging can pay everyone who fought;
//   * every connecting hit feeds the threat table (js/rules/threat.js);
//   * no `feel` channel: the strike shape is passed explicitly (`strike:`), never read from a global.
//
// Entities in a room (all plain objects, all with a numeric/string `id`, `x`, `z`):
//   monsters  Farhold enemy units from `rpg.makeEnemy`, plus position/AI fields (js/rules/monster-ai.js)
//   players   Farhold player units from `rpg.createPlayer`, plus `id, x, y, z, yaw` and a skill bar
//   allies    followers/pets (M2) — same shape as a monster but friendly

import {
  traitsOf, applyStatus, staggerFor, pushFor, COMBAT_FEEL, addCorpse, untargetable,
} from './farhold.js';
import { threatFromDamage } from './threat.js';

/** The bleed row out of data/skills.json, used when the room has no status table (as actors.js does). */
const BLEED = { name: 'Bleeding', kind: 'damage', element: 'physical', perSecond: 0.26, seconds: 6 };

/**
 * Attach a combat field to a room context (js/rules/room.js). `terrain` is the reader every
 * walker asks (heightAt, slopeAt, normalAt, waterAt, underwater, roadAt, clampToWorld) — stream B's
 * js/rules/terrain-read.js, or js/rules/terrain-flat.js in tests.
 */
export function attachField(room, { terrain = null, safeZones = [] } = {}) {
  const engine = room.engine;
  const field = {
    room,
    terrain,
    rpg: engine?.rpg || null,
    statusData: engine?.statuses || null,
    monsters: [],
    players: [],
    allies: [],
    /** circles where nothing hostile may fight (towns) — actors.js `safeZones` */
    safeZones,
    byId: new Map(),
    /** what happened this tick, for the snapshot/event stream: hit, death, anim, fx, xp, … */
    out: [],
    get rng() { return room.rng; },
    get clock() { return room.clock.now(); },
  };
  room.field = field;

  // --------------------------------------------------------------- registry

  field.add = (ent, kind) => {
    const list = kind === 'player' ? field.players : kind === 'ally' ? field.allies : field.monsters;
    ent.kind = ent.kind || kind;
    ent.side = kind === 'monster' ? 'foe' : 'friend';
    list.push(ent);
    field.byId.set(ent.id, ent);
    ent.homeField = field;
    return ent;
  };
  field.remove = (ent) => {
    if (!ent || ent.removed) return;
    ent.removed = true;
    for (const list of [field.monsters, field.players, field.allies]) {
      const i = list.indexOf(ent);
      if (i >= 0) list.splice(i, 1);
    }
    field.byId.delete(ent.id);
    // nobody keeps threat on a body that left
    for (const m of field.monsters) if (m.threat?.has(ent.id)) { m.threat.delete(ent.id); if (m.targetId === ent.id) m.targetId = null; }
  };
  /**
   * Take a body out of this field WITHOUT ending it: a player handed to another room keeps its
   * sheet, statuses and cooldowns (js/rules/index.js reuses the unit). Monsters forget it.
   */
  field.detach = (ent) => {
    if (!ent) return;
    for (const list of [field.monsters, field.players, field.allies]) {
      const i = list.indexOf(ent);
      if (i >= 0) list.splice(i, 1);
    }
    if (field.byId.get(ent.id) === ent) field.byId.delete(ent.id);
    for (const m of field.monsters) if (m.threat?.has(ent.id)) { m.threat.delete(ent.id); if (m.targetId === ent.id) m.targetId = null; }
    if (ent.homeField === field) ent.homeField = null;
  };
  field.get = id => field.byId.get(id) || null;
  field.emit = ev => { field.out.push(ev); return ev; };
  field.drain = () => { const o = field.out; field.out = []; return o; };

  /** Friendly bodies a monster may hit (players + allies that stand). */
  field.friends = () => {
    const out = [];
    for (const p of field.players) if (!p.dead && !p.removed) out.push(p);
    for (const a of field.allies) if (a.dying == null && !a.removed && (a.hp ?? 1) > 0) out.push(a);
    return out;
  };
  /** May a monster pick this friend? */
  field.usable = e => !!e && !e.removed && !e.dead && e.dying == null && (e.hp ?? 1) > 0 && !untargetable(e);

  /** actors.js `wild`: far enough from every safe zone. */
  field.wild = (x, z, margin = 0) => {
    for (const s of field.safeZones) {
      const r = s.r + margin;
      if ((x - s.x) ** 2 + (z - s.z) ** 2 < r * r) return false;
    }
    return true;
  };

  // --------------------------------------------------------------- what a hit does (actors.js land)

  /** credit + threat, per attacker */
  function credit(e, by, amount) {
    if (!e || !(amount > 0)) return;
    e.playerDamage = (e.playerDamage || 0) + amount;          // Farhold's own field, kept for `kill`
    if (by && by.id != null) {
      (e.damageBy || (e.damageBy = new Map())).set(by.id, (e.damageBy.get(by.id) || 0) + amount);
      threatFromDamage(e, by, amount);
    }
  }
  field.credit = credit;

  /**
   * actors.js `land` (line ~1493), server half. `by` is the attacking entity (for credit/threat).
   * Drawing (impact, sparks, recoil, hit-stop, shake) becomes `fx` events.
   */
  field.land = (e, result, { strike = null, fromX = 0, fromZ = 0, element = 'physical', share = 1, by = null } = {}) => {
    credit(e, by, result.amount);
    e.struckAt = field.clock;
    if (e.state !== 'chase') e.state = 'chase';
    if (!(result.amount > 0) && !result.blocked && !result.noDamage) return;
    const dx = e.x - fromX, dz = e.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    if (!strike) return;
    const push = pushFor(e, (strike.push || 0) * share);
    if (push > 0.01) {
      const span = COMBAT_FEEL.knockbackSeconds;
      e.push = { dx: dx / len, dz: dz / len, metres: push, t: span, span, done: 0 };
      if (strike.carry && by) e.push.carry = { mult: strike.carry.mult ?? 0.6, stagger: strike.carry.stagger ?? 0.4, by, hit: new Set([e]) };
    }
    if (strike.interrupt && result.amount > 0) { e.swingTimer = Math.max(e.swingTimer || 0, e.attackEvery || 1); e.lastInterruptAt = field.clock; }
    const stagger = staggerFor(e, (strike.stagger || 0) * share, field.clock);
    if (stagger > 0.01) {
      e.lastInterruptAt = field.clock;             // a stagger breaks a cast bar too (encounter.js)
      e.stagger = Math.max(e.stagger || 0, stagger);
      e.anim = 'hit';
      if (stagger > 0.4) field.emit({ t: 'fx', kind: 'status', id: e.id, status: 'stun', on: true });
    }
    field.emit({ t: 'fx', kind: 'impact', id: e.id, crit: !!result.crit, killed: !!result.dead, strike: strike.key || null });
  };

  /** actors.js `sunder` */
  field.sunder = (e, share = 0.07) => {
    if (!e || !(share > 0)) return;
    e.sunder = Math.min(0.55, (e.sunder || 0) + share);
    e.sunderLeft = 8;
    field.emit({ t: 'fx', kind: 'status', id: e.id, status: 'sunder', on: true });
  };

  /** actors.js `bleed` */
  field.bleed = (e, amount = 1) => {
    if (!e) return;
    const spec = field.statusData?.bleed || BLEED;
    applyStatus(e, 'bleed', spec, Math.max(1, amount * 0.35));
  };

  /** One reported hit, for the client's numbers and the log. */
  function report(by, e, result, kind) {
    field.emit({
      t: 'hit', src: by?.id ?? null, dst: e.id, amt: result.amount, crit: !!result.crit,
      kind, element: result.element || 'physical', dodged: !!result.dodged, blocked: result.blocked || 0,
      absorbed: result.absorbed || 0, hp: Math.max(0, Math.round(e.hp)), dead: !!result.dead,
    });
  }
  field.report = report;

  /**
   * actors.js `kill` (line ~1825). `earned` is Farhold's rule: somebody on the players' side put
   * damage in, or it is a boss, or it died out in the wild. Rewards are js/rules/cast.js's job
   * (`onKill`), reached through `field.onKill`.
   */
  field.kill = (e) => {
    if (e.dying != null) return;
    // an encounter may refuse a death: a boss with another health bar to go (js/rules/encounter.js)
    if (field.hooks?.beforeKill?.(e)) return;
    e.dying = 0;
    e.anim = 'dead';
    e.stagger = 0; e.push = null;
    // warbands (js/rules/warband.js): a standard-bearer takes the leader's aura down; a leader, the nerve too
    if (e.leads || (e.bearer && e.leader != null)) field.onLeaderFall?.(e);
    const earned = (e.playerDamage || 0) > 0 || e.boss || field.wild(e.x, e.z, 16);
    field.emit({ t: 'death', id: e.id, by: lastHitter(e), earned });
    if (!earned) return;
    addCorpse(e.x, e.z, 1);                 // skillmech's corpse list — the room's own copy (room.run)
    field.onKill?.(e);
  };
  function lastHitter(e) {
    let best = null, bv = -1;
    for (const [id, v] of e.damageBy || []) if (v > bv) { bv = v; best = id; }
    return best;
  }

  // --------------------------------------------------------------- strike shapes

  /**
   * actors.js `strike` (line ~1582): everything inside a swing. `from` = the striker's {x, z, yaw},
   * `unit` = its sheet (the same object for a Thousandvale player). `strike` is the shape out of
   * weapons.js `withArea(strikeAt(...))` — Farhold reads it off `feel.swing.strike`; we pass it.
   */
  field.strike = (from, unit, { reach = 2.9, arc = 1.5, power = 1, element = 'physical', skill = null, onHit = null, applyStatus: applyFn = null, hand = null, strike: shapeIn = null, rules = null, knock = null, noDamage = false, kind = 'swing' } = {}) => {
    const hits = [];
    const shape = shapeIn || null;
    const weapon = shape?.item || null;
    const traits = weapon ? traitsOf(weapon) : {};
    const which = hand || (weapon && weapon === unit?.equipment?.offhand ? 'off' : 'main');
    const line = shape?.key === 'thrust' && traits.pierceLine ? traits.pierceLine : 0;
    const fx = Math.sin(from.yaw), fz = Math.cos(from.yaw);
    let pierced = 0;
    const list = field.monsters;
    const crowd = rules ? list.filter(e => e.dying == null && Math.hypot(e.x - from.x, e.z - from.z) <= reach + (e.reach || 2) * 0.4).length : 1;

    for (const e of [...list]) {
      if (e.dying != null) continue;
      const dx = e.x - from.x, dz = e.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + (e.reach || 2) * 0.4) continue;
      if (line) {
        const along = dx * fx + dz * fz;
        if (along < 0 || along > reach) continue;
        const off = Math.abs(dx * fz - dz * fx);
        if (off > 0.9 + (e.reach || 2) * 0.25) continue;
        if (pierced >= line) continue;
        pierced++;
      } else {
        const toEnemy = Math.atan2(dx, dz);
        const delta = Math.abs(((toEnemy - from.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (delta > arc / 2) continue;
      }
      let mult = power;
      if (traits.momentum) mult *= 1 + Math.min(2, unit?.combo || 0) * 0.08;
      let behind = false;
      if (traits.backstab) {
        const away = Math.atan2(-dx, -dz);
        const delta = Math.abs(((away - (e.facing || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        behind = delta < 0.87;
        if (behind) mult *= traits.backstab;
      }
      if (traits.brace && shape?.key === 'thrust' && e.closing > 0) mult *= 1 + traits.brace;

      const result = field.rpg.strike(unit, e, field.rng, {
        multiplier: mult, element, skill, applyStatus: applyFn,
        hand: which, pen: shape?.pen || 0, rules, crowd, noDamage,
      });
      field.land(e, result, { strike: knock || shape, fromX: from.x, fromZ: from.z, element, share: power, by: unit });
      if (traits.armourBreak && result.amount > 0) field.sunder(e, traits.armourBreak);
      if (result.amount > 0 && (behind || (traits.bleed && shape?.key === 'cleave'))) field.bleed(e, result.amount);
      report(unit, e, result, kind);
      onHit?.(e, result);
      hits.push({ enemy: e, result });
      if (result.dead) field.kill(e);
    }
    if (unit) unit.combo = hits.length ? Math.min(3, (unit.combo || 0) + 1) : 0;
    return hits;
  };

  /**
   * actors.js `strikeArea` (line ~1664): everything within `radius` of a point. Farhold falls back
   * to `feel.swing.shot` when `power` is null (an arrow's draw); here an arrow passes its power.
   */
  field.strikeArea = (x, z, radius, attacker, { falloff = 0.45, power = null, element = 'physical', skill = null, onHit = null, applyStatus: applyFn = null, proc = false, rules = null, knock = null, from = null, noDamage = false, kind = 'area' } = {}) => {
    const hits = [];
    const mult = power != null ? power : 1;
    const shape = knock || null;
    const inside = field.monsters.filter(e => e.dying == null && Math.hypot(e.x - x, e.z - z) <= radius + (e.reach || 2) * 0.25);
    const crowd = inside.length;
    for (const e of inside) {
      if (e.dying != null) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      const near = 1 - (1 - falloff) * Math.min(1, d / Math.max(0.001, radius));
      const result = field.rpg.strike(attacker, e, field.rng, { multiplier: near * mult, element, skill, applyStatus: applyFn, proc, rules, crowd, noDamage });
      field.land(e, result, { strike: shape, fromX: from ? from.x : x, fromZ: from ? from.z : z, element, share: near, by: attacker });
      report(attacker, e, result, kind);
      onHit?.(e, result);
      hits.push({ enemy: e, result });
      if (result.dead) field.kill(e);
    }
    return hits;
  };

  /** actors.js `strikeSegment` (line ~1702): every body within `width` of a segment, once. */
  field.strikeSegment = (x0, z0, x1, z1, width, attacker, opts = {}) => {
    const dx = x1 - x0, dz = z1 - z0, len2 = dx * dx + dz * dz || 1;
    const hits = [];
    const reachOf = e => width + (e.reach || 2) * 0.25;
    const near = field.monsters.filter(e => {
      if (e.dying != null || e === opts.except) return false;
      const t = Math.max(0, Math.min(1, ((e.x - x0) * dx + (e.z - z0) * dz) / len2));
      return Math.hypot(e.x - (x0 + dx * t), e.z - (z0 + dz * t)) <= reachOf(e);
    });
    const crowd = near.length;
    const falloff = opts.falloff ?? 0.8;
    for (const e of near) {
      if (e.dying != null) continue;
      const t = Math.max(0, Math.min(1, ((e.x - x0) * dx + (e.z - z0) * dz) / len2));
      const px = x0 + dx * t, pz = z0 + dz * t;
      const d = Math.hypot(e.x - px, e.z - pz);
      const share = 1 - (1 - falloff) * Math.min(1, d / Math.max(0.001, width));
      const result = field.rpg.strike(attacker, e, field.rng, {
        multiplier: (opts.power ?? 1) * share, element: opts.element || 'physical', skill: opts.skill || null,
        applyStatus: opts.applyStatus || null, rules: opts.rules || null, noDamage: !!opts.noDamage, proc: !!opts.proc, crowd,
      });
      field.land(e, result, { strike: opts.knock || null, fromX: px, fromZ: pz, element: opts.element || 'physical', by: attacker });
      report(attacker, e, result, opts.kind || 'line');
      opts.onHit?.(e, result);
      hits.push({ enemy: e, result });
      if (result.dead) field.kill(e);
    }
    return hits;
  };

  /** actors.js `nearestTo` */
  field.nearestTo = (x, z, range = 12, except = null) => {
    let best = null, bd = range * range;
    for (const e of field.monsters) {
      if (!e || e === except || e.removed || e.dying != null) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  /** actors.js `near` — live monsters within `radius` */
  field.near = (x, z, radius, except = null) =>
    field.monsters.filter(e => e !== except && e.dying == null && !e.removed && Math.hypot(e.x - x, e.z - z) <= radius);

  /** live friends within `radius` of a point (heals, buffs, revives) */
  field.friendsNear = (x, z, radius) => field.friends().filter(f => Math.hypot(f.x - x, f.z - z) <= radius);

  return field;
}
