// Thousandvale — the ENCOUNTER ENGINE: telegraphed attacks, boss scripts, phases, call-outs,
// enrage, mechanics and arena objects. Data-driven (data/encounters/*.json, format in
// docs/encounters.md), server-authoritative, deterministic per room seed, per-room state only.
//
//   attachEncounters(room, { data, spawn, spawnObject, despawn })   once per room, after createCombat
//
// What a monster gets:
//   * a boss or elite with a SCRIPT (by `encounter` id, by its type, or the defaults for its rank and
//     room kind): phases by health, new health bars, adds, shields, abilities, call-outs, enrage,
//     triggers fired by arena objects (pillars, braziers, pools, levers, rocks);
//   * every other monster: telegraphed SPECIALS for its family and role, scaled by rank.
//
// The engine hooks in through the field: `hooks.think` (monster-ai asks before it walks or swings —
// a monster casting holds still), `hooks.beforeKill` (a boss with another bar does not die), and the
// combat tick (telegraph timers, phases, enrage, pools). Every visible change is an event on
// `field.out` (`tele`, `teleR`, `castbar`, `castX`, `phase`, `say`, `enrage`, `obj`) — the wire
// format is in docs/encounters.md and protocol.md §6.

import { applyStatus, incomingFrom, outgoingFrom, statusRef } from './farhold.js';
import { inside, segmentNear, wireShape, BODY_RADIUS } from './telegraph.js';
import { monsterStrike, spawnMonster, applyModifier } from './monster-ai.js';
import { taunt as threatTaunt, clearThreat } from './threat.js';

/** How a rank scales a monster's specials. */
export const RANK_SCALE = {
  normal: { dmg: 1, size: 1, wind: 1, extra: 0, cd: 1 },
  champion: { dmg: 1.3, size: 1.2, wind: 0.95, extra: 1, cd: 0.85 },
  rare: { dmg: 1.6, size: 1.35, wind: 0.9, extra: 2, cd: 0.75 },
  boss: { dmg: 1, size: 1, wind: 1, extra: 0, cd: 1 },
};
export const ENCOUNTER = {
  /** seconds with nobody alive in the arena before a boss resets */
  WIPE_SECONDS: 4,
  ARENA_RADIUS: 40,
  /** most telegraphs a room keeps live at once (a runaway script cannot flood a client) */
  MAX_LIVE: 400,
};

export function attachEncounters(room, { data = null, spawn = null, spawnObject = null, despawn = null, objState = null, roomKind = 'wilds' } = {}) {
  const field = room.field, combat = room.combat;
  const D = data || { scripts: {}, specials: { families: {} }, defaults: {} };
  const rng = room.streams.get('encounter');
  const now = () => room.clock.now();
  const tele = [];                  // live telegraphs
  const states = new Map();         // monster unit -> encounter state
  const objects = new Map();        // id -> arena object
  let teleN = 0, objN = 0;
  const enc = { room, tele, states, objects, data: D, stats: { placed: 0, resolved: 0, hits: 0, dodged: 0 } };
  room.encounters = enc;

  const emit = ev => field.emit(ev);
  const friends = () => field.friends().filter(field.usable);
  const players = () => field.players.filter(p => !p.dead && !p.removed);
  const pick = arr => arr[Math.floor(rng() * arr.length)];

  // ================================================================== scripts and specials

  /** The script a monster runs: an explicit id, its type, its rank's default, else its specials. */
  enc.scriptFor = u => scriptFor(u);
  function scriptFor(e) {
    const id = e.encounterId
      || D.byType?.[e.defId]
      || (e.boss ? D.defaults?.boss?.[roomKind] || D.defaults?.boss?.any : null)
      || (e.rank === 'champion' || e.rank === 'rare' ? D.defaults?.elite?.[roomKind] || D.defaults?.elite?.any : null);
    return id && D.scripts[id] ? D.scripts[id] : null;
  }
  function specialsFor(e) {
    const byType = D.specials?.types?.[e.defId];
    if (byType?.length) return byType;
    const fam = D.specials?.families || {};
    return fam[`${e.family}/${e.role}`] || fam[e.family] || fam[e.role] || fam.any || [];
  }

  function stateOf(e) {
    let st = states.get(e);
    if (st) return st;
    const script = scriptFor(e);
    st = {
      e, script, started: false, startedAt: 0, phase: -1, bar: 0, enraged: false, softStacks: 0, dmgScale: 1,
      timers: {}, cast: null, adds: new Set(), shield: false, wipeFor: 0, fired: new Set(), counters: {},
      baseMaxHp: e.maxHp, homeX: e.home?.[0] ?? e.x, homeZ: e.home?.[1] ?? e.z,
      abilities: script ? [] : specialsFor(e),
      scale: script ? RANK_SCALE.boss : (RANK_SCALE[e.rank] || RANK_SCALE.normal),
    };
    if (script?.hpMult && script.hpMult !== 1) { e.maxHp = Math.round(e.maxHp * script.hpMult); e.hp = e.maxHp; st.baseMaxHp = e.maxHp; }
    states.set(e, st);
    return st;
  }
  enc.stateOf = stateOf;

  const abilityDef = (st, ref) => (typeof ref === 'string' ? st.script?.abilities?.[ref] : ref);
  const cooldownOf = (st, ab) => {
    const cd = Array.isArray(ab.every) ? ab.every[0] + rng() * (ab.every[1] - ab.every[0]) : (ab.every ?? ab.cooldown ?? 10);
    return cd * st.scale.cd * (st.enraged ? (st.script?.enrage?.cooldown ?? 0.6) : 1);
  };

  // ================================================================== starting, phases, bars

  function start(st) {
    st.started = true;
    st.base = { dmg: [...st.e.dmg], attackEvery: st.e.attackEvery, armor: st.e.armor, modDmg: st.e.modDmg, modifiers: [...(st.e.modifiers || [])] };
    st.startedAt = now();
    if (st.script) {
      // the boss bar's shape before the first phase turns (D's ask: `boss` on engage)
      const sc = st.script, bars = 1 + sc.phases.filter(p => p.newBar).length;
      emit({
        t: 'boss', id: st.e.id, name: sc.name || st.e.name, title: sc.title || undefined, bars,
        phases: sc.phases.map((p, n) => ({ n, name: p.name || null, at: p.newBar ? 1 : (p.at ?? 1), bar: sc.phases.slice(0, n + 1).filter(q => q.newBar).length })),
        enrageMs: sc.enrage?.seconds ? Math.round(sc.enrage.seconds * 1000) : undefined,
        arena: { x: st.homeX, z: st.homeZ, r: sc.arena?.radius ?? ENCOUNTER.ARENA_RADIUS },
      });
      say(st, st.script.say?.pull);
      for (const o of st.script.arena?.objects || []) addObject(st, o);
      enterPhase(st, 0);
    } else {
      for (const ab of st.abilities) st.timers[ab.id] = now() + (ab.first ?? cooldownOf(st, ab) * (0.4 + rng() * 0.6));
    }
  }

  function enterPhase(st, i) {
    const ph = st.script.phases[i];
    if (!ph) return;
    st.phase = i;
    const e = st.e;
    if (ph.newBar) {
      st.bar++;
      e.maxHp = Math.max(1, Math.round(st.baseMaxHp * (ph.newBar.hp ?? 1)));
      e.hp = e.maxHp;
      e.statuses = {};
    }
    st.abilities = (ph.abilities || []).map(r => abilityDef(st, r)).filter(Boolean);
    for (const ab of st.abilities) st.timers[ab.id] = now() + (ab.first ?? cooldownOf(st, ab));
    emit({ t: 'phase', id: e.id, n: i, name: ph.name || null, bar: st.bar, hpMax: ph.newBar ? e.maxHp : undefined });
    say(st, ph.say);
    runActions(st, ph.onEnter || []);
  }

  function checkPhases(st) {
    const e = st.e, phases = st.script?.phases;
    if (!phases) return;
    const next = phases[st.phase + 1];
    if (!next || next.newBar) return;               // a new bar starts at the end of this one
    if (next.at != null && e.hp / Math.max(1, e.maxHp) <= next.at) enterPhase(st, st.phase + 1);
  }

  /** field.hooks.beforeKill: a boss with another health bar to go stands back up. */
  function beforeKill(e) {
    const st = states.get(e);
    if (!st?.script) return false;
    // phases still waiting on a health threshold in THIS bar fire on the way (a big hit skips none)
    while (st.script.phases[st.phase + 1] && !st.script.phases[st.phase + 1].newBar) enterPhase(st, st.phase + 1);
    if (st.script.phases[st.phase + 1]?.newBar) { cancelCast(st, 'phase'); enterPhase(st, st.phase + 1); return true; }
    // the real death
    say(st, st.script.say?.death);
    emit({ t: 'boss', id: e.id, end: 1, won: true });
    for (const t of tele) if (t.owner === e) t.dead = true;
    runActions(st, st.script.onDeath || []);
    return false;
  }

  // ================================================================== the brain (monster-ai think hook)

  function think(e, target, dist, dt) {
    if (e.dying != null) return false;
    const st = stateOf(e);
    if (!st.script && !st.abilities.length) return false;
    if (!st.started) start(st);
    // asleep, held, staggered: no ability — and a stagger breaks a cast bar
    const held = e.statuses?.sleep || e.statuses?.stasis || e.stagger > 0;
    if (st.cast) {
      if (st.cast.ab.interrupt && (e.lastInterruptAt ?? -1) >= st.cast.start) { cancelCast(st, 'interrupt'); return false; }
      if (held) return false;
      if (now() + 1e-9 >= st.cast.end) { const c = st.cast; st.cast = null; fire(st, c.ab, c.target); return false; }
      if (st.cast.target && !st.cast.ab.lock) e.facing = Math.atan2(st.cast.target.x - e.x, st.cast.target.z - e.z);
      e.anim = 'cast';
      return !st.cast.ab.move;
    }
    if (held || !target) return false;
    for (const ab of st.abilities) {
      if (now() < (st.timers[ab.id] ?? 0)) continue;
      if (ab.range != null && dist > ab.range) continue;
      if (ab.minRange != null && dist < ab.minRange) continue;
      if (ab.below != null && e.hp / e.maxHp > ab.below) continue;
      st.timers[ab.id] = now() + cooldownOf(st, ab);
      const castS = (ab.cast ?? 0) * (st.script ? 1 : st.scale.wind);
      say(st, ab.say, target);
      if (castS > 0) {
        st.cast = { ab, start: now(), end: now() + castS, target };
        emit({ t: 'castbar', id: e.id, ab: ab.id, name: ab.name || ab.id, ms: Math.round(castS * 1000), int: ab.interrupt ? 1 : undefined });
        e.anim = 'cast';
        return !ab.move;
      }
      fire(st, ab, target);
      return false;
    }
    return false;
  }

  function cancelCast(st, why) {
    if (!st.cast) return;
    emit({ t: 'castX', id: st.e.id, ab: st.cast.ab.id, why });
    if (why === 'interrupt') runActions(st, st.cast.ab.onInterrupt || []);
    st.cast = null;
  }

  // ================================================================== firing: placing the telegraphs

  /** An ability goes off: each telegraph spec, expanded by count/pattern, placed on its timer. */
  function fire(st, ab, target) {
    const gid = ++teleN;
    st.counters[ab.id] = (st.counters[ab.id] || 0) + 1;
    for (const spec of ab.telegraphs || []) {
      const n = (spec.count ?? 1) + (spec.rankExtra === false ? 0 : st.scale.extra * (spec.extraPerRank ?? 0));
      const anchors = anchorsFor(st, spec, target, n);
      anchors.forEach((a, i) => {
        const place = () => placeTele(st, ab, spec, a, i, gid, target);
        const delay = (spec.delay ?? 0) * i + (spec.after ?? 0);
        if (delay > 0) combat.later(delay, () => { if (st.e.dying == null || spec.afterDeath) place(); }); else place();
      });
    }
    if (ab.melee) monsterStrike(field, st.e, target, { mult: (ab.melee.damage ?? 1) * st.dmgScale * st.scale.dmg, kind: ab.id });
    if (ab.stackOn && target) stackDebuff(st, ab, target);
    runActions(st, ab.actions || [], target);
  }

  /** Where each copy of a telegraph goes (positions are taken when it is PLACED for chained ones). */
  function anchorsFor(st, spec, target, n) {
    const e = st.e;
    const ps = friends().filter(f => Math.hypot(f.x - e.x, f.z - e.z) <= (st.script?.arena?.radius ?? ENCOUNTER.ARENA_RADIUS));
    const out = [];
    switch (spec.at || 'target') {
      case 'each': for (const p of ps) out.push({ unit: p }); break;
      case 'random': {
        const pool = [...ps];
        for (let i = 0; i < n && pool.length; i++) out.push({ unit: pool.splice(Math.floor(rng() * pool.length), 1)[0] });
        break;
      }
      case 'farthest': {
        const s = [...ps].sort((a, b) => Math.hypot(b.x - e.x, b.z - e.z) - Math.hypot(a.x - e.x, a.z - e.z));
        for (let i = 0; i < n && i < s.length; i++) out.push({ unit: s[i] });
        break;
      }
      case 'object': for (const o of objects.values()) if (o.enc === e && (!spec.object || o.type === spec.object || o.key === spec.object) && !o.broken) out.push({ point: { x: o.x, z: o.z } }); break;
      default: for (let i = 0; i < n; i++) out.push({ unit: spec.at === 'self' ? null : target, i });
    }
    return out;
  }

  function placeTele(st, ab, spec, anchor, i, gid, target) {
    if (tele.length >= ENCOUNTER.MAX_LIVE) return;
    const e = st.e, sc = st.script ? 1 : st.scale.size;
    let x, z;
    const at = spec.at || 'target';
    if (anchor.point) { x = anchor.point.x; z = anchor.point.z; }
    else if (at === 'self') { x = e.x; z = e.z; }
    else if (at === 'point' || at === 'home') {
      const [ox, oz] = spec.offset || [0, 0];
      x = (at === 'home' ? st.homeX : e.x) + ox; z = (at === 'home' ? st.homeZ : e.z) + oz;
    } else if (at === 'scatter') {
      const ang = rng() * Math.PI * 2, d = Math.sqrt(rng()) * (spec.spread ?? 10);
      x = st.homeX + Math.cos(ang) * d; z = st.homeZ + Math.sin(ang) * d;
    } else {
      const u = anchor.unit || target;
      if (!u) return;
      x = u.x; z = u.z;
      if (spec.lead) { x += (u.x - (u.lastX ?? u.x)) * spec.lead; z += (u.z - (u.lastZ ?? u.z)) * spec.lead; }
    }
    if (spec.jitter) { x += (rng() - 0.5) * 2 * spec.jitter; z += (rng() - 0.5) * 2 * spec.jitter; }
    // facing: toward the target from the caster (a cone or a beam), a fixed or random angle, + rotation
    let yaw = 0;
    const aimAt = anchor.unit || target;
    if (spec.yaw === 'random') yaw = rng() * Math.PI * 2;
    else if (typeof spec.yaw === 'number') yaw = spec.yaw;
    else if (spec.yaw === 'facing') yaw = e.facing || 0;
    else if (aimAt && (at === 'self' || at === 'home')) yaw = Math.atan2(aimAt.x - x, aimAt.z - z);
    else yaw = Math.atan2(x - e.x, z - e.z);
    yaw += (spec.rotate ?? 0) * i;
    const grow = 1 + (spec.grow ?? 0) * i;
    const t = {
      id: ++teleN, gid, owner: e, ab, spec, kind: spec.kind || 'harm',
      shape: spec.shape || 'circle', x, z, yaw,
      r: spec.r != null ? spec.r * sc * grow : undefined, r2: spec.r2 != null ? spec.r2 * sc * grow : undefined,
      arc: spec.arc, len: spec.len != null ? spec.len * sc * grow : undefined, w: spec.w,
      follow: spec.follow && anchor.unit ? anchor.unit : null,
      placed: now(), at: now() + (spec.wind ?? 1.5) * (st.script ? 1 : st.scale.wind), dead: false,
    };
    if (t.shape === 'line' && t.len == null) t.len = 20;
    if (t.shape === 'line' && t.w == null) t.w = 3;
    if (t.shape === 'cone' && t.arc == null) t.arc = Math.PI / 3;
    if (t.shape === 'cross' && t.w == null) t.w = 3;
    tele.push(t);
    enc.stats.placed++;
    emit({ t: 'tele', id: t.id, s: e.id, ab: ab.id, k: t.kind, ms: Math.round((t.at - t.placed) * 1000), el: spec.element || undefined, follow: t.follow?.id, ...wireShape(t) });
  }

  // ================================================================== resolving

  function tickTele() {
    const t0 = now();
    // followed telegraphs ride their unit until they go off
    for (const t of tele) if (t.follow && !t.follow.dead) { t.x = t.follow.x; t.z = t.follow.z; }
    // resolve everything due, a safe group all at once
    const due = tele.filter(t => !t.dead && t.at <= t0 + 1e-9);
    if (!due.length) { if (tele.some(t => t.dead)) prune(); return; }
    const groups = new Map();
    for (const t of due) {
      t.dead = true;
      if (t.kind === 'safe') { if (!groups.has(t.gid)) groups.set(t.gid, []); groups.get(t.gid).push(t); continue; }
      resolve(t);
    }
    for (const g of groups.values()) resolveSafe(g);
    prune();
  }
  function prune() { for (let i = tele.length - 1; i >= 0; i--) if (tele[i].dead) tele.splice(i, 1); }

  /** Who is inside (players and their allies), minus anyone a blocker hides when the spec says `los`. */
  function victimsOf(t) {
    const out = [];
    for (const f of friends()) {
      if (!inside(t, f.x, f.z, BODY_RADIUS)) continue;
      if (t.spec.los && hiddenBy(t.owner, f, t)) continue;
      out.push(f);
    }
    return out;
  }
  function hiddenBy(caster, f, t) {
    for (const o of objects.values()) {
      if (!o.blocks || o.broken) continue;
      if (segmentNear(caster.x, caster.z, f.x, f.z, o.x, o.z, o.r ?? 1.2)) { o.blocked = (o.blocked || 0) + 1; o.lastBlock = t.gid; return true; }
    }
    return false;
  }

  function resolve(t) {
    const st = states.get(t.owner);
    if (!st || t.owner.dying != null && !t.spec.afterDeath) { emit({ t: 'teleR', id: t.id, x: 1 }); return; }
    enc.stats.resolved++;
    const v = victimsOf(t);
    const spec = t.spec, mult = (spec.damage ?? 1) * st.dmgScale * st.scale.dmg;
    const hits = [];
    switch (t.kind) {
      case 'stack': {
        const need = spec.need ?? 2;
        const share = need / Math.max(1, Math.min(v.length, need)) / Math.max(1, v.length);
        for (const f of v) hits.push([f, mult * share * Math.max(1, Math.min(v.length, need))]);
        if (!v.length && spec.missed) runActions(st, spec.missed);
        break;
      }
      case 'soak': {
        const need = spec.need ?? 1;
        if (v.length < need) {
          say(st, spec.failSay);
          for (const f of friends()) hits.push([f, (spec.fail ?? 2) * st.dmgScale]);
        } else for (const f of v) hits.push([f, mult]);
        break;
      }
      default: for (const f of v) hits.push([f, mult]);
    }
    for (const [f, m] of hits) hitOne(st, t, f, m);
    // objects in the way of a breaking telegraph, and rocks that stay where they fell
    for (const o of objects.values()) {
      if (o.broken || o.hp == null) continue;
      const hitObj = (spec.breaks && inside(t, o.x, o.z, o.r ?? 1)) || (spec.los && o.lastBlock === t.gid);
      if (hitObj) damageObject(st, o, 1);
    }
    if (spec.leave) addObject(st, { ...spec.leave, x: t.x - st.homeX, z: t.z - st.homeZ, rel: true });
    enc.stats.hits += hits.length;
    enc.stats.dodged += Math.max(0, players().filter(p => Math.hypot(p.x - t.x, p.z - t.z) < (t.r ?? t.len ?? 5) + 6).length - hits.length);
    emit({ t: 'teleR', id: t.id, hits: hits.map(([f]) => f.id) });
  }

  /** A `safe` group: everyone OUTSIDE every safe shape of the group is hit (a safe spot, a shelter). */
  function resolveSafe(group) {
    const t = group[0], st = states.get(t.owner);
    if (!st) return;
    enc.stats.resolved += group.length;
    const mult = (t.spec.damage ?? 2) * st.dmgScale * st.scale.dmg;
    const hit = [];
    const arena = st.script?.arena?.radius ?? ENCOUNTER.ARENA_RADIUS;
    for (const f of friends()) {
      if (Math.hypot(f.x - st.e.x, f.z - st.e.z) > arena) continue;
      if (group.some(s => inside(s, f.x, f.z, -BODY_RADIUS))) continue;   // all of you must be inside
      hit.push(f);
      hitOne(st, t, f, mult);
    }
    for (const s of group) emit({ t: 'teleR', id: s.id, hits: s === t ? hit.map(f => f.id) : [] });
  }

  function hitOne(st, t, f, mult) {
    const spec = t.spec;
    const res = monsterStrike(field, st.e, f, { mult, element: spec.element || 'physical', kind: t.ab.id });
    if (!res) return;
    if (spec.status && !res.dodged && res.amount > 0) {
      const r = statusRef(spec.status);
      const base = field.statusData?.[r.id] || {};
      applyStatus(f, r.id, { ...base, ...r }, Math.max(1, res.amount * (spec.statusPower ?? 0.3)));
    }
    if (spec.knock) {
      const dx = f.x - t.x, dz = f.z - t.z, len = Math.hypot(dx, dz) || 1;
      const k = spec.knock;
      // a knock moves a player (the room carries the new position to the client as a correction)
      f.x += (dx / len) * k; f.z += (dz / len) * k;
      if (spec.pull) { f.x -= (dx / len) * 2 * k; f.z -= (dz / len) * 2 * k; }
    }
    if (spec.taunt) threatTaunt(st.e, f, spec.taunt);
  }

  /** Tank swap: a stacking debuff on whoever the ability hit; past `swapAt` it calls for a swap. */
  function stackDebuff(st, ab, target) {
    const s = ab.stackOn;
    const id = s.id || `${ab.id}_stack`;
    const cur = target.statuses?.[id];
    const n = Math.min(s.max ?? 5, (cur?.stacks || 0) + 1);
    const entry = applyStatus(target, id, { name: s.name || 'Rent', kind: 'debuff', element: s.element || 'physical', seconds: s.seconds ?? 20, takeMore: (s.takeMore ?? 0.1) * n }, 1);
    if (entry) entry.stacks = n;
    if (s.swapAt && n >= s.swapAt) say(st, s.say || 'Swap!', target, 'warn');
  }

  // ================================================================== actions (phases, triggers, objects)

  function runActions(st, list, target = null) {
    const e = st.e;
    for (const a of list || []) {
      if (a.say) say(st, a.say, target, a.style);
      if (a.adds) spawnAdds(st, a.adds);
      if (a.shield != null) setShield(st, a.shield);
      if (a.ability) { const ab = abilityDef(st, a.ability); if (ab) fire(st, ab, target || bestTarget(e)); }
      if (a.vuln) { applyStatus(e, 'vulnerable', { name: a.vuln.name || 'Exposed', kind: 'debuff', element: 'arcane', seconds: a.vuln.seconds ?? 10, takeMore: a.vuln.takeMore ?? 0.5 }, 1); emit({ t: 'fx', kind: 'status', id: e.id, status: 'vulnerable', on: true }); }
      if (a.stun) { e.stagger = Math.max(e.stagger || 0, a.stun); e.lastInterruptAt = now(); cancelCast(st, 'stun'); }
      if (a.hurt) { e.hp = Math.max(1, e.hp - Math.round(e.maxHp * a.hurt)); emit({ t: 'hit', src: null, dst: e.id, amt: Math.round(e.maxHp * a.hurt), kind: 'env', hp: Math.round(e.hp) }); checkPhases(st); }
      if (a.heal) e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * a.heal));
      if (a.modifier) applyModifier(field, e, a.modifier);
      if (a.object) addObject(st, a.object);
      if (a.remove) for (const o of [...objects.values()]) if (o.enc === e && (o.key === a.remove || o.type === a.remove)) removeObject(o);
      if (a.reset) for (const o of objects.values()) if (o.enc === e && (o.key === a.reset || o.type === a.reset)) { o.lit = false; o.used = false; emitObj(o); }
      if (a.phase != null) enterPhase(st, a.phase);
      if (a.taunt) for (const f of friends()) if (Math.hypot(f.x - e.x, f.z - e.z) < a.taunt) threatTaunt(e, f, 1);
    }
  }

  function bestTarget(e) {
    const id = e.targetId;
    return (id != null && field.get(id)) || friends()[0] || null;
  }

  function spawnAdds(st, spec) {
    const def = field.room.engine.enemyDef(spec.type) || field.room.engine.enemyDef(st.e.defId);
    const n = spec.count ?? 2;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rng() * 0.4, d = spec.radius ?? 6;
      const x = (spec.at === 'home' ? st.homeX : st.e.x) + Math.cos(ang) * d;
      const z = (spec.at === 'home' ? st.homeZ : st.e.z) + Math.sin(ang) * d;
      const u = (spawn ? spawn(def, spec.level ?? st.e.level, x, z, { rank: spec.rank || 'normal' }) : spawnMonster(field, def, spec.level ?? st.e.level, x, z, { rank: spec.rank || 'normal' }));
      if (!u) continue;
      u.addOf = st.e;
      u.state = 'chase';
      for (const [id, v] of st.e.threat || []) (u.threat || (u.threat = new Map())).set(id, v * 0.1 + 1);
      st.adds.add(u);
    }
  }

  function setShield(st, on) {
    st.shield = !!on;
    // a shield is a barrier the size of a mountain: Farhold's strike takes damage off `barrier` first
    st.e.barrier = on ? 1e12 : 0;
    emit({ t: 'fx', kind: 'shield', id: st.e.id, on: !!on });
  }

  // ---- arena objects

  function addObject(st, spec) {
    const rel = spec.rel !== false;
    const o = {
      key: spec.id || spec.key || null, type: spec.type, enc: st.e,
      x: rel ? st.homeX + (spec.x || 0) : spec.x, z: rel ? st.homeZ + (spec.z || 0) : spec.z,
      r: spec.r ?? (spec.type === 'pool' ? 4 : 1.2), hp: spec.hp ?? (spec.type === 'pillar' || spec.type === 'rock' ? 2 : null),
      blocks: spec.blocks ?? (spec.type === 'pillar' || spec.type === 'rock'),
      lit: false, used: false, broken: false, spec, next: spec.every ?? 1, left: spec.seconds ?? Infinity,
    };
    const ent = spawnObject ? spawnObject(o) : null;
    o.id = ent?.id ?? `o${++objN}`;
    objects.set(o.id, o);
    emitObj(o, true);
    return o;
  }
  function removeObject(o) {
    objects.delete(o.id);
    emit({ t: 'obj', id: o.id, gone: 1 });
    despawn?.(o);
  }
  function emitObj(o, full = false) {
    const state = o.broken ? 'broken' : o.lit ? 'lit' : o.used ? 'used' : 'idle';
    // a room object: the room stores the state in its info (late joiners see it) and sends `obj`
    if (objState && objState(o, state, o.hp != null ? { hp: o.hp, r: o.r, key: o.key || undefined } : { r: o.r, key: o.key || undefined })) return;
    const ev = { t: 'obj', id: o.id, state };
    if (full) Object.assign(ev, { otype: o.type, x: Math.round(o.x * 100) / 100, z: Math.round(o.z * 100) / 100, r: o.r, key: o.key || undefined });
    if (o.hp != null) ev.hp = o.hp;
    emit(ev);
  }
  function damageObject(st, o, n) {
    o.hp -= n;
    if (o.hp <= 0) { o.broken = true; o.blocks = false; runActions(st, o.spec.onBreak || []); checkTriggers(st); }
    emitObj(o);
  }

  /** A player used an arena object (`use` routed here by the room for rules-owned objects). */
  function use(player, id) {
    const o = objects.get(id);
    if (!o) return { ok: false, why: 'gone' };
    if (Math.hypot(player.x - o.x, player.z - o.z) > (o.r ?? 1) + 4) return { ok: false, why: 'range' };
    const st = states.get(o.enc);
    if (!st) return { ok: false, why: 'gone' };
    if (o.type === 'brazier') { if (o.lit) return { ok: false, why: 'lit' }; o.lit = true; }
    else if (o.type === 'lever') { if (o.used && !o.spec.repeat) return { ok: false, why: 'used' }; o.used = true; }
    else return { ok: false, why: 'kind' };
    emitObj(o);
    runActions(st, o.spec.onUse || [], player);
    checkTriggers(st);
    return { ok: true };
  }
  enc.use = use;

  function checkTriggers(st) {
    for (const [i, tr] of (st.script?.triggers || []).entries()) {
      if (tr.once !== false && st.fired.has(i)) continue;
      const w = tr.when || {};
      const mine = [...objects.values()].filter(o => o.enc === st.e);
      const count = (pred, type) => mine.filter(o => (!type || o.type === type || o.key === type) && pred(o)).length;
      let ok = true;
      if (w.lit != null) ok &&= count(o => o.lit, w.of || 'brazier') >= w.lit;
      if (w.used != null) ok &&= mine.some(o => o.key === w.used && o.used);
      if (w.broken != null) ok &&= count(o => o.broken, w.of || 'pillar') >= w.broken;
      if (w.addsDead) ok &&= st.adds.size === 0;
      if (w.phase != null) ok &&= st.phase >= w.phase;
      if (!ok) continue;
      st.fired.add(i);
      runActions(st, tr.do || []);
    }
  }

  function tickObjects(dt) {
    for (const o of [...objects.values()]) {
      if (o.type !== 'pool') continue;
      o.left -= dt;
      if (o.left <= 0) { removeObject(o); continue; }
      o.next -= dt;
      if (o.next > 0) continue;
      o.next = o.spec.every ?? 1;
      const st = states.get(o.enc);
      if (!st) continue;
      const s = o.spec;
      for (const f of friends()) {
        if (Math.hypot(f.x - o.x, f.z - o.z) > o.r + BODY_RADIUS) continue;
        if (s.heal) { const before = f.hp; f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * s.heal)); emit({ t: 'heal', src: null, dst: f.id, amt: Math.round(f.hp - before), hp: Math.round(f.hp) }); }
        if (s.damage) monsterStrike(field, st.e, f, { mult: s.damage * st.dmgScale, element: s.element || 'physical', kind: 'pool' });
        if (s.status) { const r = statusRef(s.status); applyStatus(f, r.id, { ...(field.statusData?.[r.id] || {}), ...r }, 1); }
      }
      // a pool that does something to the BOSS standing in it (lure it in to strip a buff)
      if (s.boss && Math.hypot(st.e.x - o.x, st.e.z - o.z) <= o.r + 1) runActions(st, s.boss);
    }
  }

  // ================================================================== enrage, wipes, call-outs

  function tickBoss(st, dt) {
    const e = st.e;
    // adds that died leave the set; a shield tied to them drops with the last one
    for (const a of st.adds) if (a.dying != null || a.removed) st.adds.delete(a);
    if (st.shield && st.script?.phases?.[st.phase]?.shieldWhileAdds && st.adds.size === 0) { setShield(st, false); say(st, st.script.phases[st.phase].shieldDown); }
    checkTriggers(st);
    checkPhases(st);
    const en = st.script.enrage;
    if (en) {
      const t = now() - st.startedAt;
      if (en.soft && t >= en.soft.from) {
        const n = Math.floor((t - en.soft.from) / (en.soft.every ?? 10)) + 1;
        if (n > st.softStacks) { st.softStacks = n; st.dmgScale = 1 + n * (en.soft.add ?? 0.1); if (n === 1) say(st, en.soft.say, null, 'warn'); emit({ t: 'enrage', id: e.id, soft: n }); }
      }
      if (en.seconds && !st.enraged && t >= en.seconds) {
        st.enraged = true;
        st.dmgScale *= en.damage ?? 3;
        applyModifier(field, e, { id: 'enraged', dmg: en.damage ?? 3, attackEvery: 0.7, exact: true });
        say(st, en.say, null, 'yell');
        emit({ t: 'enrage', id: e.id, hard: 1 });
      }
    }
    // a wipe: nobody alive in the arena for a few seconds and the boss resets, objects and all
    const arena = st.script.arena?.radius ?? ENCOUNTER.ARENA_RADIUS;
    const anyone = friends().some(f => Math.hypot(f.x - st.homeX, f.z - st.homeZ) <= arena + 10);
    st.wipeFor = anyone ? 0 : st.wipeFor + dt;
    if (st.wipeFor >= ENCOUNTER.WIPE_SECONDS) resetBoss(st);
  }

  function resetBoss(st) {
    const e = st.e;
    cancelCast(st, 'reset');
    for (const t of tele) if (t.owner === e) t.dead = true;
    for (const o of [...objects.values()]) if (o.enc === e) removeObject(o);
    for (const a of st.adds) { a.addOf = null; if (despawn) despawn(a); else field.remove(a); }
    if (st.base) Object.assign(e, { dmg: [...st.base.dmg], attackEvery: st.base.attackEvery, armor: st.base.armor, modDmg: st.base.modDmg, modifiers: st.base.modifiers });
    states.delete(e);
    e.maxHp = st.baseMaxHp / (st.script?.hpMult || 1);
    e.hp = e.maxHp; e.statuses = {}; e.barrier = 0;
    clearThreat(e);
    e.state = 'return';
    say(st, st.script.say?.reset);
    emit({ t: 'boss', id: e.id, end: 1, won: false });
    emit({ t: 'phase', id: e.id, n: -1, bar: 0, hpMax: e.maxHp, reset: 1 });
  }

  function say(st, text, target = null, style = 'yell') {
    if (!text) return;
    const line = Array.isArray(text) ? text[Math.floor(rng() * text.length)] : text;
    const out = String(line).replace(/\{target\}/g, target?.name || 'you').replace(/\{boss\}/g, st.e.name);
    emit({ t: 'say', id: st.e.id, text: out, style });
  }

  // ================================================================== the tick

  function tick(dt) {
    for (const p of field.players) { p.lastX = p.x; p.lastZ = p.z; }
    tickTele();
    tickObjects(dt);
    for (const st of states.values()) {
      if (st.e.removed) { states.delete(st.e); continue; }
      if (st.script && st.started && st.e.dying == null) tickBoss(st, dt);
    }
  }
  enc.tick = tick;
  enc.think = think;
  enc.beforeKill = beforeKill;

  field.hooks = field.hooks || {};
  field.hooks.think = think;
  field.hooks.beforeKill = beforeKill;
  const prev = combat.tickExtra;
  combat.tickExtra = dt => { prev?.(dt); tick(dt); };
  return enc;
}

/** Validate an encounter data bundle; returns a list of problems (empty = good). For stream E's files. */
export function validateEncounters(D) {
  const bad = [];
  const shapes = new Set(['circle', 'ring', 'donut', 'cone', 'line', 'cross']);
  const kinds = new Set(['harm', 'safe', 'stack', 'soak']);
  const ats = new Set(['target', 'self', 'point', 'home', 'random', 'each', 'farthest', 'scatter', 'object']);
  const checkAbility = (where, ab) => {
    if (!ab || typeof ab !== 'object') { bad.push(`${where}: not an ability`); return; }
    if (!ab.id) bad.push(`${where}: ability without an id`);
    for (const [i, t] of (ab.telegraphs || []).entries()) {
      const w = `${where}.telegraphs[${i}]`;
      if (!shapes.has(t.shape || 'circle')) bad.push(`${w}: shape "${t.shape}"`);
      if (!kinds.has(t.kind || 'harm')) bad.push(`${w}: kind "${t.kind}"`);
      if (!ats.has(t.at || 'target')) bad.push(`${w}: at "${t.at}"`);
      if ((t.shape === 'ring' || t.shape === 'donut') && !(t.r2 < t.r)) bad.push(`${w}: a ring needs r2 < r`);
      if (!((t.wind ?? 1.5) > 0)) bad.push(`${w}: wind must be > 0 (a telegraph you cannot see is not a telegraph)`);
    }
  };
  for (const [id, s] of Object.entries(D.scripts || {})) {
    if (s.id !== id) bad.push(`scripts.${id}: id mismatch`);
    if (!s.phases?.length) bad.push(`scripts.${id}: no phases`);
    for (const [k, ab] of Object.entries(s.abilities || {})) { if (ab.id !== k) bad.push(`scripts.${id}.abilities.${k}: id mismatch`); checkAbility(`scripts.${id}.abilities.${k}`, ab); }
    for (const [i, ph] of (s.phases || []).entries()) {
      for (const r of ph.abilities || []) if (typeof r === 'string' && !s.abilities?.[r]) bad.push(`scripts.${id}.phases[${i}]: unknown ability "${r}"`);
      if (i > 0 && !ph.newBar && ph.at == null) bad.push(`scripts.${id}.phases[${i}]: needs "at" (health share) or "newBar"`);
      if (i > 0 && ph.at != null && s.phases[i - 1].at != null && !s.phases[i - 1].newBar && ph.at >= s.phases[i - 1].at) bad.push(`scripts.${id}.phases[${i}]: "at" must fall`);
    }
  }
  for (const [fam, list] of Object.entries(D.specials?.families || {})) for (const ab of list) checkAbility(`specials.${fam}`, ab);
  for (const [type, list] of Object.entries(D.specials?.types || {})) for (const ab of list) checkAbility(`specials.types.${type}`, ab);
  for (const [k, v] of Object.entries(D.defaults || {})) for (const [rk, id] of Object.entries(v)) if (!D.scripts?.[id]) bad.push(`defaults.${k}.${rk}: unknown script "${id}"`);
  return bad;
}
