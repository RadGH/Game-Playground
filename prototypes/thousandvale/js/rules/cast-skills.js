// Thousandvale — SKILLS on the server: Farhold's castSkill (main.js line ~1588), fireBolt (~1438)
// and the parts of skillrun.js's runtime a skill reaches (afterCast, place/runPlaced, dash, line,
// repeats, afterBolt, onHurt, onKill, link, tracked buffs), forked over plain positions and a
// room's field. The PLAN for every cast is Farhold's own (skills.js `use`: talents, forms,
// resources, cooldowns, costs); this file only carries it out.
//
// MMO changes (PLAN §6.2):
//   * "the player" is the caster; "allies" are the caster's party in the room (+ their pets);
//   * a heal, shield, buff or revive that names a friendly `target` goes to that ally
//     (ally targeting); healing makes threat on whatever already fights the healed ally;
//   * a taunt is a threat-table taunt (js/rules/threat.js), so it holds after it runs out;
//   * a link (Sworn Ward, Sworn Guard) binds to a party member, not only a follower;
//   * every timer is the room clock (`combat.later`), never setTimeout.
//
// Not ported yet (refused or skipped with a reason, never silently): summons and forms (need the
// follower system, M2), channels, rewind, afterimage, mimic, unique attack powers (`resolveAttack`),
// clusters, corpse bursts. js/rules/README.md keeps the list; `PENDING_KEYS` below is what a plan is
// checked against so a cast that carries one reports it in `result.pending`.

import {
  applyStatus, controlFor, mechWorld, placeObject, tickPlaced, tickWalls, addWall, addCorpse,
  pushFor, queueMech, statusRef, gainResource, formOf, repeatsOf, statusStatsKey,
} from './farhold.js';
import { taunt as threatTaunt, threatFromHeal } from './threat.js';

/** plan keys this file does not act on yet — reported, never silently dropped */
export const PENDING_KEYS = ['summon', 'channel', 'rewind', 'afterimage', 'mimic', 'clusters', 'corpseBurst', 'imbue', 'command', 'howl', 'again', 'empowerRepeat', 'returns', 'ricochet', 'split', 'allyStatus', 'ward', 'counter'];
/** kinds of plan the dispatcher refuses (no follower system yet) */
const REFUSED_KINDS = { summon: 'summons arrive with followers (M2)', form: 'shape forms arrive with followers (M2)', channelEnd: 'channels are not ported yet' };

export const BOLT_SPEED = 48;          // main.js
const ALLY_RANGE = 30;                 // how far an ally-targeted heal/buff reaches

// ============================================================================ per-room runtime

/** The per-room skill runtime: placed objects, links, tracked buffs. Built lazily on first cast. */
function runtimeOf(combat) {
  if (combat.skillRt) return combat.skillRt;
  const room = combat.room, field = combat.field, rpg = room.engine.rpg;
  const statuses = room.engine.statuses;
  const statusSpec = id => statuses[id] || null;
  const rt = { links: new Map(), tracked: [] };
  combat.skillRt = rt;

  // ---- allies: the caster's party (and their pets) standing in this room
  const allies = ch => field.friends().filter(f => f === ch || (ch.partyId != null && (f.partyId === ch.partyId || f.owner?.partyId === ch.partyId)) || f.owner === ch);
  rt.allies = allies;
  const lift = ch => 1 + (ch.derived?.healingPct || 0);
  /** heal `u` by `amount`, credit the healer's threat; returns what was actually healed */
  function healUnit(healer, u, amount) {
    if (!u || u.dead || !(amount > 0)) return 0;
    const before = u.hp;
    u.hp = Math.min(u.maxHp, u.hp + amount);
    const done = u.hp - before;
    if (done > 0) {
      threatFromHeal(field.monsters, healer, u, done);
      field.emit({ t: 'heal', src: healer.id, dst: u.id, amt: Math.round(done), hp: Math.round(u.hp) });
    }
    return done;
  }
  rt.healUnit = healUnit;
  function healAllies(ch, share, { x = null, z = null, r = Infinity, pets = true } = {}) {
    let total = 0;
    for (const u of allies(ch)) {
      if (!pets && u !== ch && u.kind !== 'player') continue;
      if (x != null && Math.hypot(u.x - x, u.z - z) > r) continue;
      total += healUnit(ch, u, Math.round((u.maxHp || 0) * share * lift(ch)));
    }
    return total;
  }
  rt.healAllies = healAllies;
  function healMostHurt(ch, amount) {
    let worst = null, frac = 1.01;
    for (const u of allies(ch)) { const f = u.hp / Math.max(1, u.maxHp); if (f < frac) { frac = f; worst = u; } }
    return worst ? healUnit(ch, worst, amount) : 0;
  }
  function cleanseUnit(u, count = 1, types = null) {
    if (!u?.statuses) return 0;
    let n = 0;
    for (const [id, st] of Object.entries(u.statuses)) {
      if (n >= count) break;
      if (st.kind === 'buff' || st.kind === 'form' || st.kind === 'tag') continue;
      if (types && !types.includes(id)) continue;
      delete u.statuses[id];
      n++;
    }
    return n;
  }
  rt.cleanseUnit = cleanseUnit;

  /** main.js uniqueEnv.push: knock `e` from a point (negative = pull, never past the point) */
  function push(e, fromX, fromZ, metres) {
    const dx = e.x - fromX, dz = e.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    const sign = metres < 0 ? -1 : 1;
    const want = sign < 0 ? Math.min(-metres, len * 0.9) : metres;
    const m = pushFor(e, want);
    if (m > 0.01) e.push = { dx: sign * dx / len, dz: sign * dz / len, metres: m, t: 0.18, span: 0.18, done: 0 };
  }
  rt.push = push;

  /**
   * The skillmech ENV, bound to whoever is acting right now. Hit rules (`afterHit`, `onHurt`) are
   * called from inside `rpg.strike` with no caster argument, so the env answers for `rt.caster`,
   * which `withCaster` sets around every strike this file makes.
   */
  const env = room.env;
  rt.caster = null;
  const C = () => rt.caster;
  Object.assign(env, {
    near: (x, z, r, except) => field.near(x, z, r, except),
    allies: () => (C() ? allies(C()) : []),
    followers: () => (C() ? allies(C()).filter(f => f.owner === C()).length : 0),
    healMostHurt: amount => (C() ? healMostHurt(C(), amount) : 0),
    healAllies: share => (C() ? healAllies(C(), share) : 0),
    healNearestPet: () => 0,
    statusSpec,
    applyStatus: (t, id, spec, power) => (C() ? combat.landStatus(C(), id, spec, t, power) : applyStatus(t, id, spec, power)),
    statusFx: (u, type, on) => field.emit({ t: 'fx', kind: 'status', id: u?.id, status: type, on: !!on }),
    strikeArea: (x, z, r, { power = 1, element = 'arcane', knock = null } = {}) =>
      (C() ? field.strikeArea(x, z, r, C(), { power, element, falloff: 0.6, proc: true, knock: knockShape(knock) }) : []),
    push,
    taunt: (e, seconds) => { if (C()) threatTaunt(e, C(), seconds); },
  });
  rt.withCaster = (ch, fn) => {
    const was = rt.caster;
    rt.caster = ch;
    try { return fn(); } finally { rt.caster = was; }
  };

  // ---- placed objects (skillrun.js place / runPlaced)
  rt.place = (ch, plan, spec, x, z, follow = null) => {
    const obj = placeObject(spec, {
      x, z, owner: plan.skill?.id || 'skill', follow, element: spec.element || plan.element,
      power: subPower(plan, spec.strike?.mult ?? 0.3), ownerHp: ch.maxHp || 100, rules: plan.rules,
    });
    obj.plan = plan;
    obj.caster = ch.id;
    if (spec.taunt || spec.hp) obj.placed = true;
    for (const old of obj.removed || []) field.emit({ t: 'fx', kind: 'unplace', obj: old.id });
    field.emit({ t: 'fx', kind: 'place', obj: obj.id, skill: obj.owner, x, z, r: obj.r, seconds: obj.left, element: obj.element });
    if (spec.taunt) {
      const target = objectTarget(obj);
      for (const e of field.near(x, z, obj.r + 2)) threatTaunt(e, target, spec.seconds ?? 6);
    }
    return obj;
  };
  /** A placed thing a monster can be taunted onto and swing at: a field entity of kind 'object'. */
  function objectTarget(obj) {
    const id = `obj:${obj.id}`;
    let ent = field.get(id);
    if (!ent) {
      ent = { id, kind: 'object', side: 'friend', x: obj.x, z: obj.z, ref: obj, get hp() { return obj.hp ?? (obj.left > 0 ? 1 : 0); }, maxHp: obj.maxHp ?? 1 };
      field.byId.set(id, ent);
    }
    return ent;
  }
  rt.objectTarget = objectTarget;

  rt.runPlaced = (dt) => {
    const acts = tickPlaced(dt, {
      enemies: () => field.monsters,
      allies: () => {
        // every placed object heals/buffs its caster's party; tickPlaced asks once for all, so the
        // union is offered and each act is filtered to the object's own caster's party below
        return field.friends().map(u => ({ x: u.x, z: u.z, hp: u.hp, maxHp: u.maxHp, unit: u }));
      },
      at: f => {
        if (f && typeof f === 'object' && f.dying == null && !f.removed) return { x: f.x, z: f.z };
        return null;
      },
      rng: () => room.rng(),
    });
    // a 'self'-following object rides its caster
    for (const o of mechWorld.placed) {
      if (o.follow === 'self') { const c = field.get(o.caster); if (c) { o.x = c.x; o.z = c.z; } }
      const ent = field.get(`obj:${o.id}`);
      if (ent) { ent.x = o.x; ent.z = o.z; }
    }
    for (const act of acts) {
      const o = act.obj, s = o.spec;
      const ch = field.get(o.caster);
      if (act.kind === 'expire') {
        field.byId.delete(`obj:${o.id}`);
        if (ch && s.onExpire?.radius) rt.withCaster(ch, () => burst(ch, o.plan, o.x, o.z, s.onExpire.radius, s.onExpire.mult ?? 1, { heal: s.onExpire.heal || 0 }));
        field.emit({ t: 'fx', kind: 'unplace', obj: o.id });
        continue;
      }
      if (!ch) continue;                       // its caster left the room: it still ticks down, does nothing
      const mine = new Set(allies(ch));
      rt.withCaster(ch, () => {
        switch (act.kind) {
          case 'strike':
            for (const e of act.targets) field.strikeArea(e.x, e.z, s.strike.splash ?? 1.2, ch, { power: o.power, element: s.strike.element || o.element, falloff: 0.8, proc: true, rules: s.strike.status ? { skill: o.owner, statuses: [s.strike.status] } : null, knock: knockShape(s.strike.knock), kind: 'placed' });
            break;
          case 'heal':
            for (const a of act.targets) if (mine.has(a.unit)) healUnit(ch, a.unit, Math.round(a.unit.maxHp * s.heal * lift(ch)));
            break;
          case 'buff':
            for (const a of act.targets) {
              if (!mine.has(a.unit)) continue;
              const u = a.unit;
              const r = statusRef(s.buff);
              if (r) applyStatus(u, r.id, { ...statusSpec(r.id), ...r, seconds: Math.max(1.2, o.every + 0.3) }, 1);
              if (s.barrierTick) { u.barrier = Math.min(Math.round(u.maxHp * (s.barrierCap ?? 0.15)), (u.barrier || 0) + Math.round(u.maxHp * s.barrierTick)); u.castBarrierFor = Math.max(u.castBarrierFor || 0, 2); }
              if (s.deathPrevent) applyStatus(u, 'unbroken', { name: 'Unbroken', kind: 'buff', element: 'holy', seconds: Math.max(1.2, o.every + 0.3), deathPrevent: true }, 1);
            }
            break;
          case 'debuff':
            for (const e of act.targets) {
              const r = statusRef(s.debuff);
              if (r.sleeperHits && e.statuses?.sleep) e.statuses.sleep.hitsToWake = Math.max(e.statuses.sleep.hitsToWake || 1, r.sleeperHits);
              const ctl = controlFor(e, r.id, Math.max(1.2, o.every + 0.3));
              combat.landStatus(ch, ctl.id, { ...statusSpec(ctl.id), ...(ctl.id === r.id ? r : {}), seconds: ctl.seconds, ...(ctl.slow ? { slow: ctl.slow } : {}) }, e, 1);
            }
            break;
          case 'knockOut': for (const e of act.targets) push(e, o.x, o.z, s.knockOut); break;
          case 'pull': for (const e of act.targets) push(e, o.x, o.z, -s.pull); break;
          case 'edge':
            for (const e of act.targets) field.strikeArea(e.x, e.z, 0.8, ch, { power: subPower(o.plan, s.edgeMult ?? 1), element: o.element, falloff: 1, proc: true, knock: knockShape(s.edgeKnock || { stagger: 0.6 }), rules: s.edgeStatus ? { skill: o.owner, statuses: [s.edgeStatus] } : null, kind: 'placed' });
            break;
          case 'trap': {
            const tr = s.strike || {};
            field.strikeArea(o.x, o.z, o.r, ch, { power: subPower(o.plan, tr.mult ?? 1), element: o.element, falloff: 0.7, proc: true, rules: { skill: o.owner, ...(tr.status ? { statuses: [tr.status] } : {}), ...(s.tag ? { tag: s.tag } : {}) }, knock: knockShape(tr.knock), kind: 'trap' });
            field.emit({ t: 'fx', kind: 'unplace', obj: o.id });
            break;
          }
          default: break;
        }
      });
    }
  };

  /** skillrun.js `burst`: a burst of `mult` within `r` of a point, at the plan's scale. */
  function burst(ch, plan, x, z, r, mult, { element = null, status = null, knock = null, heal = 0 } = {}) {
    const el = element || plan.element;
    const hits = field.strikeArea(x, z, r, ch, { power: subPower(plan, mult), element: el, falloff: 0.6, rules: status ? { skill: plan.skill?.id, statuses: [status] } : null, knock: knockShape(knock), proc: true, kind: 'burst' });
    if (heal) healAllies(ch, heal, { x, z, r });
    return hits;
  }
  rt.burst = burst;

  // ---- main.js dropPool / tickPools: burning ground that strikes every 0.75 s and leaves its element's status
  const ELEMENT_LEAVES = { fire: 'burn', ice: 'chill', lightning: 'shock', poison: 'poison', shadow: 'curse' };
  rt.pools = [];
  rt.dropPool = (ch, { x, z, r, seconds, element = 'physical', power = 0.5 }) => {
    const pool = { caster: ch.id, x, z, r, left: seconds, life: seconds, every: 0.75, next: 0.75, element, power };
    rt.pools.push(pool);
    field.emit({ t: 'fx', kind: 'pool', id: ch.id, x, z, r, seconds, element });
    return pool;
  };
  function tickPools(dt) {
    for (let i = rt.pools.length - 1; i >= 0; i--) {
      const p = rt.pools[i];
      p.left -= dt;
      p.next -= dt;
      const ch = field.get(p.caster);
      if (p.next <= 0 && ch) {
        p.next = p.every;
        rt.withCaster(ch, () => {
          const hits = field.strikeArea(p.x, p.z, p.r, ch, { falloff: 0.2, element: p.element, power: p.power, proc: true, kind: 'pool' });
          const leaves = ELEMENT_LEAVES[p.element];
          for (const h of hits) if (leaves && statuses[leaves] && h.result?.amount > 0) combat.landStatus(ch, leaves, statuses[leaves], h.enemy, Math.max(1, h.result.amount * 0.7));
        });
      }
      if (p.left <= 0) rt.pools.splice(i, 1);
    }
  }

  /** A unit left this room (handed to another, or gone): nothing here acts for it any more. */
  rt.forget = (u) => {
    rt.links.delete(u.id);
    for (const [id, l] of rt.links) if (l.to === u) rt.links.delete(id);
    rt.tracked = rt.tracked.filter(t => t.unit !== u);
    rt.pools = rt.pools.filter(p => p.caster !== u.id);
    for (const o of mechWorld.placed) if (o.caster === u.id) o.caster = null;
  };

  // ---- per-tick: placed objects, walls, corpses, links, tracked buffs, imbue
  rt.tick = (dt) => {
    // skillrun.js tick order: refresh a sheet whose statuses changed, placed objects, walls, corpses, imbue
    for (const p of field.players) {
      const key = statusStatsKey(p);
      if (p.mechDirty || key !== p._statsKey) { p.mechDirty = false; p._statsKey = key; rpg.refresh(p); }
    }
    rt.runPlaced(dt);
    tickWalls(dt);
    for (const corpse of mechWorld.corpses) corpse.left -= dt;
    mechWorld.corpses = mechWorld.corpses.filter(x => x.left > 0);
    for (const p of field.players) if (p.imbue) { p.imbue.left -= dt; if (p.imbue.left <= 0) p.imbue = null; }
    for (const [id, link] of rt.links) {
      link.left -= dt;
      const owner = field.get(id);
      if (!owner || link.left <= 0 || !field.usable(link.to) || Math.hypot(link.to.x - owner.x, link.to.z - owner.z) > link.range) {
        rt.links.delete(id);
        field.emit({ t: 'fx', kind: 'unlink', id, to: link.to?.id });
      }
    }
    for (let i = rt.tracked.length - 1; i >= 0; i--) {
      const t = rt.tracked[i];
      const st = t.unit.statuses?.[t.id];
      if (st) { t.last = st; continue; }
      rt.tracked.splice(i, 1);
      if (t.dirty) t.unit.mechDirty = true;
      if (t.onEnd) {
        const ch = t.unit;
        const sub = ch.skills.planFor(t.onEnd, t.plan.skill, { shape: t.onEnd.shape || 'around' });
        rt.withCaster(ch, () => castPlan(combat, ch, sub, { echo: true }));
      }
    }
    tickPools(dt);                     // main.js ticks the pools last in the frame
  };
  return rt;
}

// ============================================================================ helpers

/** skillrun.js: a sub-strike's base mult reads at the plan's scale */
const scaleOf = plan => (plan.mult || 1) / Math.max(0.01, plan.baseMult || plan.skill?.mult || 1);
const subPower = (plan, mult) => (mult ?? 1) * scaleOf(plan);
function knockShape(k) {
  if (!k) return null;
  const push = typeof k === 'number' ? k : k.push || 0;
  return { push, stagger: k.stagger || 0, interrupt: !!k.interrupt, hitstop: 70, shake: push > 2 ? 0.8 : 0.4, key: 'skill' };
}

/** Where the caster is aiming, as Farhold's `aim()`: an origin and a flat direction. */
function aimOf(ch, intent) {
  let dx = Math.sin(ch.yaw), dz = Math.cos(ch.yaw);
  const a = intent.aim;
  if (a && Number.isFinite(a.x) && Number.isFinite(a.z)) {
    const ax = a.x - ch.x, az = a.z - ch.z, len = Math.hypot(ax, az);
    if (len > 0.01) { dx = ax / len; dz = az / len; }
  }
  return { x: ch.x, y: (ch.y || 0) + 1.6, z: ch.z, dx, dy: 0, dz };
}

/** Farhold's `groundTarget(range)`: the aimed point, clamped to the skill's range. */
function groundTargetOf(ch, intent, range) {
  const a = intent.aim;
  if (a && Number.isFinite(a.x) && Number.isFinite(a.z)) {
    const dx = a.x - ch.x, dz = a.z - ch.z, d = Math.hypot(dx, dz);
    if (d <= range) return { x: a.x, y: 0, z: a.z, dist: d };
    return { x: ch.x + dx / d * range, y: 0, z: ch.z + dz / d * range, dist: range };
  }
  return { x: ch.x + Math.sin(ch.yaw) * range, y: 0, z: ch.z + Math.cos(ch.yaw) * range, dist: range };
}

/** The friendly body an ally-targeted skill lands on: the named target if it is a party member in range, else the caster. */
function allyTargetOf(rt, ch, intent, range = ALLY_RANGE) {
  if (intent.target == null || intent.target === ch.id) return ch;
  const t = rt.allies(ch).find(u => u.id === intent.target);
  if (!t || Math.hypot(t.x - ch.x, t.z - ch.z) > range) return ch;
  return t;
}

/** skillrun.js `aimedEnemy`: the Tab target if alive and in range, else the nearest along the aim. */
function aimedEnemy(field, ch, intent, a, range) {
  if (intent.target != null) {
    const t = field.get(intent.target);
    if (t && t.kind !== 'player' && t.side === 'foe' && t.dying == null && Math.hypot(t.x - ch.x, t.z - ch.z) <= range + 2) return t;
  }
  for (let t = 3; t <= range; t += 2) {
    const e = field.nearestTo(ch.x + a.dx * t, ch.z + a.dz * t, 2.2);
    if (e) return e;
  }
  return null;
}

// ============================================================================ the cast

/**
 * main.js `castSkill(i)` for one player: ask Farhold's skill bar for the plan (it spends mana,
 * starts the cooldown, applies talents/forms/resources), then carry it out.
 */
export function castSkillPlan(combat, ch, slot, intent = {}) {
  const pre = ch.skills.check(slot);
  if (!pre.ok) return { ok: false, why: pre.why || 'not ready' };
  const row = ch.skills.rowFor(slot);
  const kind = row?.shape;
  if (row?.form) return { ok: false, why: REFUSED_KINDS.form };
  if (kind === 'summon' && !row.summon?.temporary) return { ok: false, why: REFUSED_KINDS.summon };
  const plan = ch.skills.use(slot);
  if (!plan.ok) return { ok: false, why: plan.why };
  if (REFUSED_KINDS[plan.kind]) return { ok: false, why: REFUSED_KINDS[plan.kind] };
  return castPlan(combat, ch, plan, { intent });
}

/** Carry out a plan (also used for echoes, delayed beams and a buff's `onEnd`). */
export function castPlan(combat, ch, plan, { echo = false, intent = {} } = {}) {
  const rt = runtimeOf(combat);
  const field = combat.field, room = combat.room, rpg = room.engine.rpg;
  return rt.withCaster(ch, () => {
    const out = { ok: true, skill: plan.skill?.id, kind: plan.kind, hits: [], pending: PENDING_KEYS.filter(k => plan[k] != null && plan[k] !== false) };
    const a = plan.frozenAim || aimOf(ch, intent);
    const castFrom = { x: ch.x, z: ch.z, yaw: ch.yaw };
    const hpBefore = ch.hp;
    const power = plan.mult;
    const collect = hits => { for (const h of hits) out.hits.push(h); return hits; };
    const onHit = (enemy, result) => {
      if (plan.status && plan.statusSpec) combat.landStatus(ch, plan.status, plan.statusSpec, enemy, Math.max(1, plan.damage * combat.statusPowerShare * (plan.statusMult || 1)));
    };
    const strikeOpts = decorate(rt, ch, plan, { power, element: plan.element, skill: plan.skill?.id, onHit, applyStatus: combat.hookFor(ch), kind: 'skill' });
    field.emit({ t: 'cast', id: ch.id, skill: plan.skill?.id, kind: plan.kind, element: plan.element, aim: { x: ch.x + a.dx * 10, z: ch.z + a.dz * 10 } });

    if (plan.barrier > 0) {
      const gained = Math.max(1, Math.round((plan.damage || 0) * plan.barrier));
      ch.barrier = Math.max(ch.barrier || 0, gained);
      ch.castBarrierFor = plan.barrierSeconds || 6;
    }
    if (!echo) {
      const cast = rpg.fx.onCast({ self: ch, skill: plan.skill, applyStatus: combat.hookFor(ch) });
      if (cast.refund && plan.spent > 0) { if (plan.paidWith === 'health') ch.hp = Math.min(ch.maxHp, ch.hp + plan.spent); else ch.mp = Math.min(ch.maxMp, ch.mp + plan.spent); }
      if (cast.echoCast > 0) combat.later(0.3, () => castPlan(combat, ch, { ...plan, mult: plan.mult * cast.echoCast, damage: Math.round(plan.damage * cast.echoCast) }, { echo: true, intent }), ch.id);
      if (cast.shockwave) collect(field.strikeArea(ch.x, ch.z, 7, ch, { element: 'arcane', power: 1.2, onHit, kind: 'proc' }));
      const chance = rpg.fx.sum(ch, 'echo');
      if (chance > 0 && room.rng() < chance) combat.later(0.26, () => castPlan(combat, ch, { ...plan, mult: plan.mult * 0.5, damage: Math.round(plan.damage * 0.5) }, { echo: true, intent }), ch.id);
    }

    const ground = range => { const s = groundTargetOf(ch, intent, range); plan.at = s; return s; };

    if (plan.kind === 'summon') {
      // a temporary summon (Guardian Light): not ported yet — the follower system is M2
    } else if (plan.kind === 'beam' && plan.delay > 0 && !plan.beamFired) {
      const strikeOnly = { ...plan, beamFired: true, sub: true, frozenAim: { ...a }, place: null, pool: null, selfBuff: null, summon: null, taunt: null, command: null, barrier: null, ward: null, counter: null, imbue: null, link: null, burst: null, again: null, afterimage: null, empowerNext: null, empowerRepeat: null, wall: null, rewind: null, cleanse: null, revive: null, healPets: null, overflowBarrier: null, allyStatus: null, corpseBurst: null, clusters: null, dashWith: null, resetOn: null };
      combat.later(plan.delay, () => castPlan(combat, ch, strikeOnly, { echo: true, intent }), ch.id);
    } else if (plan.kind === 'beam') {
      let healed = 0;
      for (const e of [...field.monsters]) {
        if (e.dying != null) continue;
        const ex = e.x - a.x, ez = e.z - a.z;
        const along = ex * a.dx + ez * a.dz;
        if (along < 0 || along > plan.range) continue;
        if (Math.hypot(ex - a.dx * along, ez - a.dz * along) > plan.width + (e.reach || 2) * 0.3) continue;
        const result = rpg.strike(ch, e, room.rng, { multiplier: power, element: plan.element, applyStatus: combat.hookFor(ch), skill: plan.skill?.id, rules: plan.rules, noDamage: !!plan.noDamage });
        if (e.state !== 'chase') e.state = 'chase';
        field.land(e, result, { strike: strikeOpts.knock, fromX: ch.x, fromZ: ch.z, element: plan.element, by: ch });
        field.report(ch, e, result, 'skill');
        strikeOpts.onHit(e, result);
        out.hits.push({ enemy: e, result });
        healed += Math.round(result.amount * (plan.healFrac || 0));
        if (result.dead) field.kill(e);
      }
      if (healed) rt.healUnit(ch, ch, healed);
    } else if (plan.kind === 'ground' && (plan.line || takesRepeats(plan))) {
      const spot = ground(plan.range);
      if (!line(combat, rt, ch, plan, spot, strikeOpts, collect)) repeats(combat, rt, ch, plan, spot, strikeOpts, collect);
    } else if (plan.kind === 'ground') {
      const spot = ground(plan.range);
      const pulse = () => {
        if (ch.dead) return;
        if (plan.pull) for (const e of field.monsters) {
          if (e.dying != null || Math.hypot(e.x - spot.x, e.z - spot.z) > plan.radius + 1) continue;
          rt.push(e, spot.x, spot.z, -plan.pull);
        }
        rt.withCaster(ch, () => collect(field.strikeArea(spot.x, spot.z, plan.radius, ch, { falloff: 0.55, ...strikeOpts })));
      };
      if (plan.delay) combat.later(plan.delay, pulse, ch.id); else pulse();
      for (let k = 1; k < plan.repeats; k++) combat.later((plan.delay + k * (plan.repeatEvery || 0.5)), pulse, ch.id);
      if (plan.ground > 0) rt.dropPool(ch, { x: spot.x, z: spot.z, r: plan.groundRadius || plan.radius, seconds: plan.ground, element: plan.element, power: power * 0.35 });
    } else if (plan.kind === 'dash' && plan.dash && typeof plan.dash === 'object') {
      dash(combat, rt, ch, plan, a, intent, strikeOpts, collect);
    } else if (plan.kind === 'dash') {
      const spot = ground(plan.range);
      const dist = Math.min(plan.range, spot.dist);
      collect(field.strikeSegment(ch.x + a.dx, ch.z + a.dz, ch.x + a.dx * dist, ch.z + a.dz * dist, plan.splash, ch, { ...strikeOpts, falloff: 0.8 }));
      ch.x += a.dx * dist; ch.z += a.dz * dist;
      field.emit({ t: 'move', id: ch.id, x: ch.x, z: ch.z, why: 'dash' });
    } else if (plan.kind === 'self') {
      // ally targeting: a heal or a buff on a `self` skill may be aimed at a party member
      const to = allyTargetOf(rt, ch, intent);
      if (plan.heal) {
        const share = plan.healFrac || (plan.heal / Math.max(1, ch.maxHp));
        const amount = to === ch ? plan.heal : Math.round(to.maxHp * share);
        const liftK = 1 + rpg.fx.sum(ch, 'healBonus');
        out.healed = rt.healUnit(ch, to, Math.round(amount * liftK));
        out.healTarget = to.id;
      }
      if (plan.status && plan.statusSpec) {
        applyStatus(to, plan.status, plan.statusSpec, 1);
        if (plan.pets || plan.status === 'regen') for (const u of rt.allies(ch)) if (u.owner === ch) applyStatus(u, plan.status, plan.statusSpec, 1);
      }
      if (plan.trail) ch.trail = { left: plan.trail.seconds, step: plan.trail.step || 1.4, radius: plan.trail.radius, burns: plan.trail.burns, power: plan.mult, element: plan.element, lastX: ch.x, lastZ: ch.z };
    } else if (plan.kind === 'melee') {
      const cone = () => {
        if (ch.dead) return;
        rt.withCaster(ch, () => {
          // Farhold's field.strike borrows the LAST basic swing's shape (feel.swing.strike) when a skill
          // passes none: its weapon traits, armour pierce and — when the skill has no knock — its knock.
          // Per player here, never a global.
          const hits = field.strike(ch, ch, { reach: plan.reach, arc: plan.arc, strike: ch.lastStrike || null, ...strikeOpts });
          if (!plan.breath && plan.splash > 0) {
            const sx = Math.sin(ch.yaw), sz = Math.cos(ch.yaw);
            const already = new Set(hits.map(h => h.enemy));
            for (const h of field.strikeArea(ch.x + sx * plan.reach * 0.6, ch.z + sz * plan.reach * 0.6, plan.splash, ch, { falloff: 0.3, ...strikeOpts })) {
              if (!already.has(h.enemy)) hits.push(h);
            }
          }
          collect(hits);
        });
      };
      cone();
      for (let k = 1; k < plan.repeats; k++) combat.later(k * (plan.repeatEvery || 0.32), cone, ch.id);
    } else if (plan.kind === 'around' && takesRepeats(plan)) {
      repeats(combat, rt, ch, plan, { x: ch.x, z: ch.z }, strikeOpts, collect);
    } else if (plan.kind === 'around') {
      collect(field.strikeArea(ch.x, ch.z, plan.radius, ch, { falloff: 0.6, ...strikeOpts }));
      for (let k = 1; k < plan.repeats; k++) {
        combat.later(k * (plan.repeatEvery || 0.32), () => {
          if (ch.dead) return;
          rt.withCaster(ch, () => collect(field.strikeArea(ch.x, ch.z, plan.radius, ch, { falloff: 0.6, ...strikeOpts })));
        }, ch.id);
      }
      if (plan.ground > 0) rt.dropPool(ch, { x: ch.x, z: ch.z, r: plan.groundRadius || plan.radius, seconds: plan.ground, element: plan.element, power: power * 0.35 });
      if (plan.healFrac) rt.healUnit(ch, ch, Math.round(ch.maxHp * plan.healFrac));
    } else {
      // a bolt (main.js fireBolt), one per projectile
      const n = plan.projectiles || 1;
      for (let k = 0; k < n; k++) {
        const off = n === 1 ? 0 : (k / (n - 1) - 0.5) * plan.spread;
        const cs = Math.cos(off), sn = Math.sin(off);
        fireBolt(combat, rt, ch, plan, a, a.dx * cs - a.dz * sn, a.dx * sn + a.dz * cs, strikeOpts, collect, intent);
      }
    }
    afterCast(combat, rt, ch, plan, { a, hpBefore, origin: castFrom, intent });
    return out;
  });
}

// ============================================================================ the pieces

/** skillrun.js `decorate` + `wrapOnHit`: carry the plan's rules, knock and pull onto every hit. */
function decorate(rt, ch, plan, opts) {
  const out = { ...opts, rules: plan.rules || null, knock: knockShape(plan.knock), noDamage: !!plan.noDamage };
  const inner = opts.onHit;
  const p = plan.pullIn;
  out.onHit = (enemy, result) => {
    inner?.(enemy, result);
    plan._hits = (plan._hits || 0) + 1;
    if (p && result?.amount > 0 && enemy.dying == null) {
      if (p.only === 'ranged' && !enemy.ranged) return;
      const to = p.to === 'impact' && plan.at ? plan.at : p.to === 'line' && plan._lineAt ? plan._lineAt(enemy) : { x: ch.x, z: ch.z };
      rt.push(enemy, to.x, to.z, -(p.metres || 2));
    }
  };
  return out;
}

const takesRepeats = plan => { const r = plan.repeatSpec; return !!(r && (r.grow || r.scatter || r.alternate || r.target)); };

/** main.js `fireBolt`: flight time from the distance, the hit lands where the body is when it arrives. */
function fireBolt(combat, rt, ch, plan, a, dx, dz, strikeOpts, collect, intent, hop = 0, from = null) {
  const field = combat.field;
  const origin = from || a;
  const homing = (!hop && plan.homing) ? plan.homing : 0;
  // the Tab target, when it is roughly along the shot, is what the bolt is thrown at
  let target = null;
  if (!hop && intent.target != null) {
    const t = field.get(intent.target);
    if (t && t.side === 'foe' && t.dying == null) {
      const ex = t.x - origin.x, ez = t.z - origin.z, len = Math.hypot(ex, ez);
      if (len <= plan.range + 1) { dx = ex / (len || 1); dz = ez / (len || 1); target = { enemy: t, distance: len }; }
    }
  }
  if (!target) target = hitScan(field, origin.x, origin.z, dx, dz, plan.range, 1.4 + homing * 2.6);
  if (!target && homing > 0) {
    const reach = 2.5 + homing * 3.5;
    for (let t = 4; t <= plan.range && !target; t += 3) {
      const found = field.nearestTo(origin.x + dx * t, origin.z + dz * t, reach);
      if (!found) continue;
      const ex = found.x - origin.x, ez = found.z - origin.z, len = Math.hypot(ex, ez) || 1;
      if (len > plan.range) continue;
      dx = ex / len; dz = ez / len;
      target = { enemy: found, distance: len };
    }
  }
  const dist = (plan.pierce && !hop) ? plan.range : (target ? target.distance : plan.range);
  const to = { x: origin.x + dx * dist, z: origin.z + dz * dist };
  const flight = Math.max(0.09, dist / BOLT_SPEED);
  const chase = target?.enemy || null;
  field.emit({ t: 'fx', kind: 'bolt', id: ch.id, skill: plan.skill?.id, element: plan.element, from: { x: origin.x, z: origin.z }, to: chase ? chase.id : to, ms: Math.round(flight * 1000) });
  combat.later(flight, () => {
    const at = chase && chase.dying == null ? { x: chase.x, z: chase.z } : to;
    const splash = plan.splash * (combat.room.engine.rpg.fx.sum(ch, 'boltSplash') || 1);
    rt.withCaster(ch, () => {
      const hits = collect(field.strikeArea(at.x, at.z, splash, ch, { falloff: 0.5, ...strikeOpts }));
      const left = (plan.chains || 0) - hop;
      if (left > 0) {
        const conductors = field.near(at.x, at.z, 12, chase).filter(e => e.statuses?.shock);
        const next = (conductors.sort((p, q) => Math.hypot(p.x - at.x, p.z - at.z) - Math.hypot(q.x - at.x, q.z - at.z))[0]) || field.nearestTo(at.x, at.z, 8, chase) || null;
        if (next) {
          const ndx = next.x - at.x, ndz = next.z - at.z, nlen = Math.hypot(ndx, ndz) || 1;
          const keep = plan.chainFalloff ?? 0.65;
          fireBolt(combat, rt, ch, { ...plan, range: 14 }, a, ndx / nlen, ndz / nlen, { ...strikeOpts, power: (strikeOpts?.power ?? 1) * keep }, collect, intent, hop + 1, { x: at.x, z: at.z });
        }
      }
      void hits;
    });
  }, ch.id);
}

/** actors.js `hitScan` on the ground plane: the nearest live monster along a shot. */
function hitScan(field, x, z, dx, dz, range, width) {
  let best = null, bestT = Infinity;
  for (const e of field.monsters) {
    if (e.dying != null) continue;
    const ex = e.x - x, ez = e.z - z;
    const t = ex * dx + ez * dz;
    if (t < 0 || t > range) continue;
    const off = Math.hypot(ex - dx * t, ez - dz * t);
    if (off > width + (e.reach || 2) * 0.3) continue;
    if (t < bestT) { bestT = t; best = e; }
  }
  return best ? { enemy: best, distance: bestT } : null;
}

/** skillrun.js `line` */
function line(combat, rt, ch, plan, spot, opts, collect) {
  const l = plan.line;
  if (!l) return false;
  const field = combat.field;
  const length = l.length ?? 10, every = l.every ?? 2;
  let sx, sz, dx, dz;
  const ax = spot.x - ch.x, az = spot.z - ch.z, len = Math.hypot(ax, az) || 1;
  if (l.across) { dx = -az / len; dz = ax / len; sx = spot.x - dx * length / 2; sz = spot.z - dz * length / 2; }
  else { dx = ax / len; dz = az / len; sx = ch.x + dx * 1.5; sz = ch.z + dz * 1.5; }
  plan._lineAt = e => { const t = Math.max(0, Math.min(length, (e.x - sx) * dx + (e.z - sz) * dz)); return { x: sx + dx * t, z: sz + dz * t }; };
  const segs = [];
  for (let t = 0; t <= length; t += every) segs.push({ x: sx + dx * t, z: sz + dz * t });
  const strike = () => rt.withCaster(ch, () => collect(field.strikeSegment(sx, sz, sx + dx * length, sz + dz * length, (l.width ?? 2) / 2 + 0.4, ch, { falloff: 0.9, ...opts })));
  if (plan.delay) combat.later(plan.delay, strike, ch.id); else strike();
  if (plan.pool) for (const s of segs) rt.place(ch, plan, { kind: 'zone', ...poolSpec(plan.pool), radius: (l.width ?? 2) / 2 + 0.6 }, s.x, s.z);
  return true;
}

function poolSpec(p) {
  return {
    kind: 'zone', seconds: p.seconds ?? 4, radius: p.radius ?? 3, every: 0.75, element: p.element,
    strike: (p.power ?? 0.3) > 0 ? { mult: p.power ?? 0.3, all: true, splash: 0.6, status: p.status || null } : null,
    ...(p.slow ? { debuff: { id: 'chill', slow: p.slow, name: 'Slowed' } } : {}),
    ...(p.healAllies ? { heal: p.healAllies * 0.75 } : {}),
  };
}

/** skillrun.js `repeats` (grow / scatter / target lowest; `alternate` needs sub-plans and is skipped) */
function repeats(combat, rt, ch, plan, origin, opts, collect) {
  const r = plan.repeatSpec;
  if (!r || !(r.grow || r.scatter || r.alternate || r.target)) return false;
  const field = combat.field;
  const n = Math.max(1, plan.repeats || r.count || 1), every = plan.repeatEvery ?? r.every ?? 0.4;
  for (let k = 0; k < n; k++) {
    combat.later(k * every, () => {
      if (ch.dead) return;
      const at = plan.kind === 'ground' ? origin : { x: ch.x, z: ch.z };
      let x = at.x, z = at.z;
      let radius = (plan.radius || 3) + (r.grow || 0) * k;
      if (r.alternate) {
        const sub = r.alternate[k % r.alternate.length];
        const sp = ch.skills.planFor(sub, plan.skill, { shape: plan.kind, element: sub.element || plan.element });
        rt.withCaster(ch, () => collect(field.strikeArea(x, z, sub.radius ?? radius, ch, { falloff: 0.6, power: subPower(plan, sub.mult ?? plan.baseMult ?? 1), element: sp.element, rules: sp.rules, onHit: opts.onHit, skill: plan.skill?.id, applyStatus: opts.applyStatus, noDamage: !sub.mult && !plan.mult })));
        if (sub.healAllies) rt.healAllies(ch, sub.healAllies);
        return;
      }
      if (r.scatter || r.target === 'lowest') {
        const inside = field.near(at.x, at.z, plan.radius || 6).filter(e => e.dying == null);
        let pick = null;
        if (r.target === 'lowest') pick = inside.sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0];
        else if (inside.length && combat.room.rng() < 0.7) {
          const tagged = inside.filter(e => Object.values(e.statuses || {}).some(s => s.kind === 'tag'));
          pick = (tagged.length && combat.room.rng() < 0.5 ? tagged : inside)[Math.floor(combat.room.rng() * (tagged.length ? tagged.length : inside.length))] || inside[0];
        }
        if (pick) { x = pick.x; z = pick.z; } else {
          const ang = combat.room.rng() * Math.PI * 2, d = Math.sqrt(combat.room.rng()) * (plan.radius || 6);
          x = at.x + Math.cos(ang) * d; z = at.z + Math.sin(ang) * d;
        }
        radius = r.strikeRadius ?? Math.min(2.4, plan.radius || 2.4);
      }
      rt.withCaster(ch, () => collect(field.strikeArea(x, z, radius, ch, { falloff: 0.6, ...opts })));
    }, ch.id);
  }
  return true;
}

/** skillrun.js `dash` (target / behind / back / ally / hit; `swap` and multi-target included) */
function dash(combat, rt, ch, plan, a, intent, opts, collect) {
  const field = combat.field, rpg = combat.room.engine.rpg;
  const d = plan.dash;
  const range = d.range ?? plan.range ?? 10;
  const from = { x: ch.x, z: ch.z };
  const strikeOne = (e, mult, fx, fz) => {
    const res = rpg.strike(ch, e, combat.room.rng, { multiplier: mult, element: plan.element, skill: plan.skill?.id, applyStatus: combat.hookFor(ch), rules: plan.rules, noDamage: !!plan.noDamage });
    field.land(e, res, { strike: knockShape(plan.knock), fromX: fx, fromZ: fz, element: plan.element, by: ch });
    field.report(ch, e, res, 'skill');
    opts.onHit?.(e, res);
    collect([{ enemy: e, result: res }]);
    if (res.dead) field.kill(e);
  };
  if (d.targets) {
    const list = field.near(ch.x, ch.z, range).filter(e => e.dying == null)
      .sort((p, q) => Math.hypot(p.x - ch.x, p.z - ch.z) - Math.hypot(q.x - ch.x, q.z - ch.z)).slice(0, d.targets);
    list.forEach((e, k) => combat.later(k * 0.18, () => {
      if (e.dying != null || ch.dead) return;
      const ang = Math.atan2(ch.x - e.x, ch.z - e.z);
      ch.x = e.x + Math.sin(ang) * 1.3; ch.z = e.z + Math.cos(ang) * 1.3;
      ch.yaw = Math.atan2(e.x - ch.x, e.z - ch.z);
      field.emit({ t: 'move', id: ch.id, x: ch.x, z: ch.z, why: 'dash' });
      rt.withCaster(ch, () => strikeOne(e, plan.mult, ch.x, ch.z));
    }, ch.id));
    return true;
  }
  let to = null, face = null, struck = null;
  const toward = (x, z, keep) => { const dx = x - from.x, dz = z - from.z, len = Math.hypot(dx, dz) || 1; return { x: x - dx / len * keep, z: z - dz / len * keep }; };
  const allyAlong = () => { const t = allyTargetOf(rt, ch, intent, range); return t === ch ? null : t; };
  switch (d.to || 'aim') {
    case 'target': { const e = aimedEnemy(field, ch, intent, a, range); if (e) { to = toward(e.x, e.z, 1.3); struck = e; face = e; } break; }
    case 'behind': {
      const e = aimedEnemy(field, ch, intent, a, range + 2);
      if (e) { const dx = e.x - from.x, dz = e.z - from.z, len = Math.hypot(dx, dz) || 1; to = { x: e.x + dx / len * 1.5, z: e.z + dz / len * 1.5 }; struck = e; face = e; }
      break;
    }
    case 'back': to = { x: from.x - a.dx * range, z: from.z - a.dz * range }; break;
    case 'ally': { const u = allyAlong(); if (u) to = toward(u.x, u.z, 1.4); break; }
    case 'hit': {
      const e = aimedEnemy(field, ch, intent, a, range), u = allyAlong();
      const eD = e ? Math.hypot(e.x - from.x, e.z - from.z) : Infinity, uD = u ? Math.hypot(u.x - from.x, u.z - from.z) : Infinity;
      if (e && eD <= uD) { to = toward(e.x, e.z, 1.3); struck = e; face = e; } else if (u) to = toward(u.x, u.z, 1.3);
      break;
    }
    case 'swap': {
      const e = aimedEnemy(field, ch, intent, a, range);
      if (e && !e.boss) {
        to = { x: e.x, z: e.z };
        e.x = from.x; e.z = from.z;
        if (d.enemyStatus) { const r = statusRef(d.enemyStatus); combat.landStatus(ch, r.id, { ...(combat.room.engine.statuses[r.id] || {}), ...r }, e, 1); }
      }
      break;
    }
    default: break;
  }
  if (!to) { const spot = groundTargetOf(ch, intent, range); const dist = Math.min(range, spot.dist); to = { x: from.x + a.dx * dist, z: from.z + a.dz * dist }; }
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  if (!d.leap && !d.noPath && len > 0.5) {
    collect(field.strikeSegment(from.x, from.z, to.x, to.z, plan.splash || 2, ch, { ...opts, falloff: 0.8, except: struck && (d.to === 'target' || d.to === 'behind' || d.to === 'hit') ? struck : null }));
  }
  ch.x = to.x; ch.z = to.z;
  if (face) ch.yaw = Math.atan2(face.x - to.x, face.z - to.z);
  field.emit({ t: 'move', id: ch.id, x: ch.x, z: ch.z, why: 'dash' });
  if (struck && struck.dying == null && (d.to === 'target' || d.to === 'behind' || d.to === 'hit')) strikeOne(struck, plan.mult * (1 + (d.hitMult || 0)), from.x, from.z);
  if (d.land) {
    combat.later(d.leap ? 0.18 : 0, () => rt.withCaster(ch, () => {
      const hits = collect(rt.burst(ch, plan, to.x, to.z, d.land.radius ?? 3, d.land.mult ?? 1, { knock: d.land.knock || plan.knock, heal: d.land.heal || 0 }));
      if (d.land.status) for (const h of hits) { const r = statusRef(d.land.status); combat.landStatus(ch, r.id, { ...(combat.room.engine.statuses[r.id] || {}), ...r }, h.enemy, 1); }
      if (d.land.place) rt.place(ch, plan, d.land.place, to.x, to.z);
    }), ch.id);
  }
  return true;
}

/** skillrun.js `afterCast`: everything a cast leaves behind once its strikes are out. */
function afterCast(combat, rt, ch, plan, ctx) {
  const field = combat.field, statuses = combat.room.engine.statuses;
  const statusSpec = id => statuses[id] || null;
  const a = ctx.a;
  const spot = plan.at || { x: ch.x, z: ch.z };
  const hitsN = plan._hits || 0;
  const apply = (u, id, spec) => applyStatus(u, id, spec, 1);

  if (plan.taunt) {
    const t = plan.taunt;
    const secs = t.seconds ?? 3;
    const list = t.target ? [aimedEnemy(field, ch, ctx.intent, a, plan.range || 20)].filter(Boolean) : field.near(ch.x, ch.z, t.radius ?? 8);
    let n = 0;
    for (const e of list) {
      if (t.only === 'ranged' && !e.ranged) continue;
      if (t.by === 'pet') continue;                   // a pet taunt needs followers (M2)
      threatTaunt(e, ch, secs);
      n++;
    }
    if (n) {
      field.emit({ t: 'fx', kind: 'taunt', id: ch.id, count: n, seconds: secs });
      if (t.perTaunt && ch.statuses?.[plan.status]) {
        const st = ch.statuses[plan.status];
        st.damage = (st.damage || 0) + Math.min(t.perTauntCap ?? 0.25, t.perTaunt * n);
      }
      if (t.barrierPer) { const b = Math.round(ch.maxHp * Math.min(0.35, t.barrierPer * n)); ch.barrier = Math.max(ch.barrier || 0, b); ch.castBarrierFor = Math.max(ch.castBarrierFor || 0, 6); }
    }
  }
  if (plan.barrier && typeof plan.barrier === 'object') {
    const b = plan.barrier;
    const to = allyTargetOf(rt, ch, ctx.intent);
    const worth = b.of === 'paid' ? (plan.hpPaid || 0) : Math.round(to.maxHp * (b.share ?? 0.2));
    to.barrier = Math.max(to.barrier || 0, worth);
    to.castBarrierFor = b.seconds ?? 6;
  }
  if (plan.healPets) {
    // MMO: "your followers" becomes the rest of your party (pets included) — a group heal
    const share = typeof plan.healPets === 'number' ? plan.healPets : plan.healPets.share;
    for (const u of rt.allies(ch)) if (u !== ch) rt.healUnit(ch, u, Math.round(u.maxHp * share));
  }
  if (plan.overflowBarrier && plan.heal) {
    const to = allyTargetOf(rt, ch, ctx.intent);
    const before = to === ch ? (ctx.hpBefore ?? ch.hp) : to.hp - (ctx.healedAmount || 0);
    const over = Math.max(0, before + plan.heal - to.maxHp);
    if (over > 0) { to.barrier = Math.max(to.barrier || 0, Math.min(Math.round(to.maxHp * plan.overflowBarrier), over)); to.castBarrierFor = 8; }
  }
  if (plan.revive) {
    // MMO: raise fallen party members near the caster (Farhold: fallen followers)
    const share = typeof plan.revive === 'number' ? plan.revive : plan.revive.share ?? 0.5;
    for (const u of field.players) {
      if (!u.dead || u === ch || (ch.partyId == null || u.partyId !== ch.partyId)) continue;
      if (Math.hypot(u.x - ch.x, u.z - ch.z) > ALLY_RANGE) continue;
      u.dead = false;
      u.hp = Math.max(1, Math.round(u.maxHp * share));
      u.revivedBy = ch.id;
      field.emit({ t: 'revive', id: u.id, by: ch.id, hp: u.hp });
    }
  }
  if (plan.cleanse) {
    const cl = plan.cleanse;
    rt.cleanseUnit(allyTargetOf(rt, ch, ctx.intent), cl.count ?? 1, cl.types || null);
    if (cl.pets) for (const u of rt.allies(ch)) if (u !== ch) rt.cleanseUnit(u, cl.count ?? 1);
  }
  if (plan.link) {
    const l = plan.link;
    const range = l.range ?? 24;
    let to = null;
    if (l.to === 'enemy') to = aimedEnemy(field, ch, ctx.intent, a, range);
    else {
      const named = allyTargetOf(rt, ch, ctx.intent, range);
      to = named !== ch ? named : rt.allies(ch).filter(u => u !== ch).sort((p, q) => Math.hypot(p.x - ch.x, p.z - ch.z) - Math.hypot(q.x - ch.x, q.z - ch.z))[0] || null;
    }
    if (to) {
      rt.links.set(ch.id, { to, kind: l.to || 'follower', share: l.share ?? 0.4, threshold: l.threshold ?? null, left: l.seconds ?? 8, range, gainPer: l.gainPer || null, healEach: l.healEach || 0, skill: plan.skill?.id });
      field.emit({ t: 'fx', kind: 'link', id: ch.id, to: to.id, seconds: l.seconds ?? 8 });
    }
  }
  if (plan.selfBuff) {
    const b = plan.selfBuff;
    const id = `buff:${plan.skill?.id || 'skill'}`;
    if (!b.petsOnly) apply(ch, id, { name: b.name || plan.skill?.name || 'Buff', kind: 'buff', element: plan.element, ...b, seconds: b.seconds ?? 8 });
    if (b.pets || b.petsOnly) for (const u of rt.allies(ch)) if (u !== ch) apply(u, id, { name: b.name || 'Buff', kind: 'buff', ...b, seconds: b.seconds ?? 8 });
    if (b.movePct || b.hastePct || b.armorPct || b.maxHpPct) ch.mechDirty = true;
    rt.tracked.push({ unit: ch, id, onEnd: b.onEnd || null, plan, dirty: !!(b.movePct || b.hastePct || b.armorPct || b.maxHpPct) });
  }
  if (plan.place && plan.kind !== 'ground' && !plan.dash) {
    const follow = plan.place.follow === 'self' ? 'self' : plan.place.follow === 'target' ? aimedEnemy(field, ch, ctx.intent, a, plan.range || 30) : null;
    const at = plan.place.follow === 'self' || plan.kind === 'self' || plan.kind === 'around' ? { x: ch.x, z: ch.z } : spot;
    rt.place(ch, plan, plan.place, at.x, at.z, follow);
  } else if (plan.place && plan.kind === 'ground') {
    const follow = plan.place.follow === 'target' ? aimedEnemy(field, ch, ctx.intent, a, plan.range || 30) : null;
    rt.place(ch, plan, plan.place, spot.x, spot.z, follow);
  }
  if (plan.pool && !plan.line) {
    const spec = poolSpec({ element: plan.element, ...plan.pool });
    if (plan.pool.along === 'beam' || (plan.kind === 'beam' && plan.pool.along !== false)) {
      for (let t = 2; t <= (plan.range || 18); t += 3) rt.place(ch, plan, { ...spec, radius: plan.pool.radius ?? Math.max(1.2, (plan.width || 2) * 0.6) }, ctx.origin.x + a.dx * t, ctx.origin.z + a.dz * t);
    } else {
      const ahead = plan.pool.at === 'ahead' ? { x: ch.x + Math.sin(ch.yaw) * (plan.reach || 3), z: ch.z + Math.cos(ch.yaw) * (plan.reach || 3) } : null;
      const at = ahead || (plan.kind === 'ground' ? spot : { x: ch.x, z: ch.z });
      rt.place(ch, plan, spec, at.x, at.z);
    }
  }
  if (plan.burst) {
    const b = plan.burst;
    const r = b.radius ?? 6;
    if (b.mult) rt.burst(ch, plan, ch.x, ch.z, r, b.mult, { element: b.element || null, knock: b.knock || null, heal: b.heal || 0 });
    else if (b.heal) rt.healAllies(ch, b.heal, { x: ch.x, z: ch.z, r });
    if (b.statuses) {
      for (const e of field.near(ch.x, ch.z, r)) {
        for (const ref of [].concat(b.statuses)) {
          const rr = statusRef(ref);
          const ctl = controlFor(e, rr.id, rr.seconds ?? statusSpec(rr.id)?.seconds ?? 4);
          combat.landStatus(ch, ctl.id, { ...statusSpec(ctl.id), ...(ctl.id === rr.id ? rr : {}), seconds: ctl.seconds, ...(ctl.slow ? { slow: ctl.slow } : {}) }, e, Math.max(1, (plan.damage || 10) * 0.35));
        }
      }
    }
    if (b.knock && !b.mult) for (const e of field.near(ch.x, ch.z, r)) rt.push(e, ch.x, ch.z, typeof b.knock === 'number' ? b.knock : b.knock.push || 0);
  }
  if (plan.empowerNext?.pets) for (const u of rt.allies(ch)) if (u.owner === ch) u.empowered = Math.max(u.empowered || 0, plan.empowerNext.mult ?? 0.5);
  if (plan.resetOn && String(plan.resetOn.when || plan.resetOn).startsWith('crowd')) {
    const need = +String(plan.resetOn.when || plan.resetOn).split(':')[1] || 5;
    if (hitsN >= need) queueMech(ch, { reset: plan.skill?.id });
  }
  if (plan.wall) raiseWall(combat, rt, ch, plan, spot, a);
}

/** skillrun.js `raiseWall` (no mesh): a wall in skillmech's list; a taunting wall draws the swing. */
function raiseWall(combat, rt, ch, plan, spot, a) {
  const w = plan.wall;
  const at = plan.kind === 'ground' || plan.kind === 'bolt' ? spot : { x: ch.x + a.dx * (w.distance ?? 4), z: ch.z + a.dz * (w.distance ?? 4) };
  const seconds = w.seconds ?? 8;
  const hp = w.hp ? Math.round((ch.maxHp || 100) * w.hp) : null;
  let wall;
  if (w.ring) {
    wall = addWall({ ring: { x: at.x, z: at.z, r: w.radius ?? 6 }, left: seconds, hp, blocksMove: w.blocksMove !== false, blocksRanged: !!w.blocksRanged, owner: plan.skill?.id });
  } else {
    const L = w.length ?? 6;
    const px = -a.dz, pz = a.dx;
    wall = addWall({ x1: at.x - px * L / 2, z1: at.z - pz * L / 2, x2: at.x + px * L / 2, z2: at.z + pz * L / 2, left: seconds, hp, blocksMove: w.blocksMove !== false, blocksRanged: !!w.blocksRanged, owner: plan.skill?.id });
  }
  combat.field.emit({ t: 'fx', kind: 'wall', id: ch.id, wall: wall.id, x: at.x, z: at.z, ring: !!w.ring, seconds });
  if (w.taunt) {
    // a wall the monsters swing at: a field entity standing where the wall stands
    const ent = { id: `wall:${wall.id}`, kind: 'object', side: 'friend', x: at.x, z: at.z, ref: wall, get hp() { return wall.left > 0 ? (wall.hp ?? 1) : 0; }, maxHp: wall.hp ?? 1 };
    combat.field.byId.set(ent.id, ent);
    for (const e of combat.field.near(at.x, at.z, (w.length ?? 6) + 2)) threatTaunt(e, ent, w.taunt);
  }
}

// ============================================================================ hooks the room calls

/** Attach the per-tick runtime and the hurt/kill hooks to a combat pipeline. */
export function installSkillRuntime(combat) {
  const rt = runtimeOf(combat);
  const field = combat.field;
  const prevTick = combat.tickExtra;
  combat.tickExtra = dt => { prevTick?.(dt); rt.tick(dt); };

  // a monster hit a friend: wards, counters, links, a struck object (skillrun.js onHurt)
  field.hooks = field.hooks || {};
  field.hooks.onHurt = (result, attacker, victim) => {
    if (!result) return;
    const owner = victim.kind === 'player' ? victim : null;
    for (const ev of result.mechEvents || []) {
      if (!owner) break;
      rt.withCaster(owner, () => {
        switch (ev.kind) {
          case 'counter': {
            const c = ev.spec;
            if (c.answer && attacker && attacker.dying == null) {
              const res = combat.room.engine.rpg.strike(owner, attacker, combat.room.rng, { multiplier: (c.answer.mult ?? 1) * (c.scale ?? 1), element: c.answer.element || 'physical', skill: ev.skill, applyStatus: combat.hookFor(owner) });
              field.land(attacker, res, { strike: knockShape(c.answer.knock), fromX: owner.x, fromZ: owner.z, element: 'physical', by: owner });
              field.report(owner, attacker, res, 'counter');
              if (res.dead) field.kill(attacker);
            }
            if (c.tauntAttacker && attacker) threatTaunt(attacker, owner, c.tauntAttacker);
            if (c.gain) gainResource(owner, c.gain.resource, c.gain.n ?? 1);
            if (c.heal) owner.hp = Math.min(owner.maxHp, owner.hp + Math.round(owner.maxHp * c.heal));
            break;
          }
          case 'burst': {
            const b = ev.spec;
            const hits = field.strikeArea(owner.x, owner.z, b.radius ?? 4, owner, { power: (b.mult ?? 0.8) * (b.scale ?? 1), element: b.element || 'physical', falloff: 0.6, proc: true, knock: knockShape(b.knock), kind: 'proc' });
            if (b.taunt) for (const h of hits) threatTaunt(h.enemy, owner, b.taunt);
            break;
          }
          case 'reflect':
            if (ev.attacker && ev.amount > 0 && ev.attacker.dying == null) {
              ev.attacker.hp = Math.max(0, ev.attacker.hp - ev.amount);
              field.credit(ev.attacker, owner, ev.amount);
              if (ev.attacker.hp <= 0) field.kill(ev.attacker);
            }
            break;
          default: break;
        }
      });
    }
    // links: a tank carrying a share of what a party member takes (Sworn Ward / Sworn Guard)
    if (result.amount > 0) {
      for (const [ownerId, link] of rt.links) {
        if (link.kind === 'enemy' || victim !== link.to) continue;
        const holder = field.get(ownerId);
        if (!holder || holder.dead) continue;
        let moved = Math.round(result.amount * link.share);
        if (link.threshold != null) moved = Math.max(0, result.amount - Math.round(victim.maxHp * link.threshold));
        if (moved > 0) {
          victim.hp = Math.min(victim.maxHp, victim.hp + moved);
          holder.hp = Math.max(1, holder.hp - moved);
          if (victim.dead && victim.hp > 0) victim.dead = false;
          field.emit({ t: 'fx', kind: 'linkShare', id: ownerId, to: victim.id, amt: moved });
        }
      }
    }
  };
  /**
   * skillrun.js `onKill` (kill rules): a gnawed body passes its curse on, a killer's `onKill` buffs pay
   * out, and the killing skill's own rules (reset, refund, burst, spread, corpse, heal, mana, tag,
   * pool). `killedBy` is recorded by skillmech's afterHit on the body. Runs before the rewards.
   */
  const rewards = field.onKill;
  field.onKill = (e) => {
    const killer = field.get(lastHitter(e));
    if (killer && killer.kind === 'player') rt.withCaster(killer, () => onKillRules(killer, e));
    rewards?.(e);
  };
  function lastHitter(e) { let best = null, bv = -1; for (const [id, v] of e.damageBy || []) if (v > bv) { bv = v; best = id; } return best; }
  function onKillRules(p, e) {
    const statuses = combat.room.engine.statuses;
    const statusSpec = id => statuses[id] || null;
    const g = e.statuses?.gnawed;
    if (g && g.remaining > 0) {
      const next = field.nearestTo(e.x, e.z, statusSpec('gnawed')?.onDeath?.jump ?? 8, e);
      if (next) { next.statuses = next.statuses || {}; next.statuses.gnawed = { ...g }; }
    }
    for (const st of Object.values(p.statuses || {})) {
      const k = st.onKill;
      if (!k || typeof k !== 'object') continue;
      if (k.heal) rt.healUnit(p, p, Math.round(p.maxHp * k.heal));
      if (k.mana) p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * k.mana));
      if (k.resource) gainResource(p, k.resource.id, k.resource.n ?? 1);
      if (k.haste) applyStatus(p, 'haste', { ...statusSpec('haste'), seconds: k.haste }, 1);
      if (k.reset) queueMech(p, { reset: k.reset });
    }
    const rules = e.killedBy;
    if (!rules) return;
    e.killedBy = null;
    const k = rules.onKill;
    const slot = p.skills.slots.find(s => s.id === rules.skill);
    const plan = { mult: 1, baseMult: 1, element: e.element || 'physical', skill: { id: rules.skill }, rules };
    if (rules.resetOn && String(rules.resetOn.when || rules.resetOn) === 'kill') queueMech(p, { reset: rules.skill });
    if (!k) return;
    if (k.corpse) addCorpse(e.x, e.z, (k.corpse.worth ?? 2) - 1);
    if (k.burst) rt.burst(p, { ...plan, mult: rules.scale || 1 }, e.x, e.z, k.burst.radius ?? 3, k.burst.mult ?? 1, { element: k.burst.element || null });
    if (k.spread) {
      for (const other of field.near(e.x, e.z, k.spread.radius ?? 5, e)) {
        for (const t of k.spread.types || []) { const st = e.statuses?.[t]; if (st) { other.statuses = other.statuses || {}; other.statuses[t] = { ...st }; } }
      }
    }
    if (k.reset) queueMech(p, { reset: rules.skill });
    if (k.refund && slot) queueMech(p, { cut: { skill: rules.skill, seconds: p.skills.cooldownFor(slot) * k.refund } });
    if (k.heal) rt.healUnit(p, p, Math.round(p.maxHp * k.heal));
    if (k.mana) p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * k.mana));
    if (k.gold) p.gold = (p.gold || 0) + k.gold;
    if (k.tag) {
      const next = field.nearestTo(e.x, e.z, 12, e);
      if (next) { next.statuses = next.statuses || {}; next.statuses[k.tag.id] = { type: k.tag.id, kind: 'tag', name: statusSpec(k.tag.id)?.name || k.tag.id, remaining: k.tag.seconds ?? 6, power: 1, ...(statusSpec(k.tag.id) || {}) }; }
    }
    if (k.pool) rt.place(p, plan, poolSpec({ element: k.pool.element || 'poison', ...k.pool }), e.x, e.z);
    if (k.haste) applyStatus(p, 'haste', { ...statusSpec('haste'), seconds: k.haste }, 1);
  }

  field.hooks.asActor = (u, fn) => (u?.kind === 'player' ? rt.withCaster(u, fn) : fn());
  field.hooks.onObjectStruck = (e, obj) => {
    const ref = obj.ref;
    if (!ref || ref.hp == null) return;
    const dmg = Math.max(1, Math.round(((e.dmg?.[0] || 3) + (e.dmg?.[1] || 6)) / 2));
    ref.hp -= dmg;
    if (ref.hp <= 0) ref.left = 0;
  };
  return rt;
}

/** A bolt thrown by a basic attack (a wand, a staff's lob) through the same flight as a skill's. */
export function throwBolt(combat, ch, plan, a, dx, dz, strikeOpts, intent = {}, collect = h => h) {
  const rt = runtimeOf(combat);
  rt.withCaster(ch, () => fireBolt(combat, rt, ch, plan, a, dx, dz, strikeOpts, collect, intent));
}
export const runtimeFor = runtimeOf;

export { addCorpse, repeatsOf, formOf };
