// EVENTS in a room (stream A, PLAN §5.2–5.3, stream E's data/quests/events.json). Pure.
//
// One runner plays one event on one room: the realm events the director starts (world boss, a town attack, a
// warband siege, a drake flyover) and the zone events every province copy runs on its own (two or three waves
// from the arena edge, then a scripted boss). Everyone who comes within `enrol` metres of the arena is in the
// temporary event group — the `eventFrame`, shared credit, a personal reward when it is won. No invite.
//
//   const run = createEventRunner({ room, ev, rng, rules, info: encounterInfo, now: () => room.now() })
//   run.step()       -> 'live' | 'won' | 'lost'       (call ~1 Hz; it spawns, advances waves, watches the boss)
//   run.stop()       removes whatever it spawned        run.enrolled (Set of char ids)   run.view()
//
// ev = { uid, id, name, kind, x, z, r, waves:[{type, count, level, rank?}], boss (encounter id) | null,
//        monster (a plain boss type, e.g. the flyover's drake), level, durationMs, enrol (m), scale:{hp, adds},
//        arenas:[{x, z}] (flyover landings), reward:{xp (share of a level), gold, item:{tier, chance?}} }

import { STATE } from '../net/protocol.js';
import { eventGold, lengthFactor as knobLength, economy } from './economy-knobs.js';

export const WAVE_GAP_MS = 4000;          // a breath between a cleared wave and the next
export const WAVE_MAX_MS = 90000;         // a wave nobody clears still gives way to the next
export const LANDING_MS = 3 * 60000;      // a flyover feeds this long at each arena

/**
 * PLAY-TEST 5, T12 — "an event started, a few wolves spawned, I killed them, the event did not end; no indication of
 * what it was, what to do, how long it lasts or what the reward is". Three things were wrong:
 *   1. a wave was spawned on a ring 32-40 m round the arena centre and each monster just stood where it landed: a
 *      monster notices a player at ~26 m, so the ones on the far side of the ring never came, the wave never "cleared",
 *      and the next one only arrived after WAVE_MAX_MS. Waves now arrive TOGETHER, from one side, 16-24 m from the
 *      players in the arena (`focus`), carry a path to them, and stragglers are re-aimed at a living player every second.
 *   2. nothing said what stage the event was in. The runner now keeps an objective with live progress (`view()`).
 *   3. an event nobody could finish stood for ten minutes. It now FAILS when its time runs out (`why: 'time'`), when
 *      everyone has left or lies dead for `abandonMs` (`'left'` / `'wiped'`, zone events), or when its boss is gone
 *      (`'fled'`). `run.result` / `run.why` say how it ended.
 */
export const GATE_OUT_M = [35, 55];       // X7: a raid wave appears this far OUTSIDE the gate it comes in by (guards.json raid.spawnOutM)
export const WAVE_NEAR_M = [16, 24];      // a wave lands this far from the players it is coming for
export const HUNT_FAR_M = 20;             // a wave monster further than this from every living player is re-aimed
export const ABANDON_MS = 60000;          // nobody alive in reach for this long: the event is lost (when ev.abandonMs is set)

export function createEventRunner({ room, ev, rng = Math.random, info = {}, now = () => room.now() }) {
  const t0 = now();
  const spawned = new Set();
  const enrolled = new Set();
  let phase = 'warn', wave = -1, waveAt = t0, boss = null, landing = 0, landedAt = t0, result = 'live', why = null;
  let waveMobs = [], aloneSince = 0;
  const R = ev.r || 40;
  const enrolR = Math.max(ev.enrol || 60, R * 1.2);
  const I = ev.info || {};
  const durMs = ev.durationMs || (I.durationSec ? I.durationSec * 1000 : 10 * 60000);
  const centre = () => (ev.arenas && ev.arenas.length ? ev.arenas[landing % ev.arenas.length] : ev);
  const pick = r => (Array.isArray(r) ? r[0] + Math.floor(rng() * (r[1] - r[0] + 1)) : (r ?? 1));
  const alive = e => e && !e.dead && !e.removed;
  const bossInfo = () => { const enc = ev.boss || null; return (enc && info[enc]) || {}; };
  const bossName = () => (boss && boss.name) || ev.bossName || bossInfo().name || ev.name;
  /** Living players in reach of the arena (the ones the event is FOR), nearest the centre first. */
  function fighters(pad = 0) {
    const c = centre();
    return room.host.near(c.x, c.z, enrolR + pad, x => x.kind === 'player' && x.char && !x.dead).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
  }
  /** Where a wave is headed: the player nearest the middle (held inside the arena), else the middle. */
  function focus() {
    const c = centre(), f = fighters()[0];
    if (!f) return { x: c.x, z: c.z };
    const d = Math.hypot(f.x - c.x, f.z - c.z);
    return d <= R ? { x: f.x, z: f.z } : { x: c.x + (f.x - c.x) / d * R, z: c.z + (f.z - c.z) / d * R };
  }

  let lastGate = null;
  function spawnWave(k) {
    const w = ev.waves[k], c = centre(), f = focus();
    const extra = Math.ceil((ev.scale?.adds || 0) / Math.max(1, ev.waves.length));
    const n = pick(w.count) + extra;
    // one side: away from the arena centre as seen from the players (they come IN from the edge), a 100 degree fan
    const out = Math.hypot(f.x - c.x, f.z - c.z) > 4 ? Math.atan2(f.z - c.z, f.x - c.x) + Math.PI : rng() * Math.PI * 2;
    waveMobs = [];
    // X7 (owner feedback 9; E's `raid.gates`): a town raid comes IN BY A GATE — the wave appears 35-55 m outside one of the
    // town's gates (the main gate first, then any), in a knot across the road, and walks in through it; the rules pick whom
    // it goes for (the nearest guard). Ground that is not walkable out there (or outside this room) pulls it in toward the gate.
    const gates = ev.raid && Array.isArray(ev.raid.gates) ? ev.raid.gates.filter(g => Number.isFinite(g.x) && Number.isFinite(g.z)) : [];
    if (gates.length) {
      const g = k === 0 ? (gates.find(q => q.main) || gates[0]) : gates[Math.floor(rng() * gates.length) % gates.length];
      const [d0, d1] = Array.isArray(ev.raid.spawnOutM) ? ev.raid.spawnOutM : GATE_OUT_M;
      const ol = Math.hypot(g.out[0], g.out[1]) || 1, ux = g.out[0] / ol, uz = g.out[1] / ol;
      lastGate = { id: g.id, x: Math.round(g.x), z: Math.round(g.z) };
      for (let i = 0; i < n; i++) {
        let d = d0 + rng() * (d1 - d0);
        const side = (n > 1 ? (i / (n - 1) - 0.5) : 0) * Math.min(14, 2.2 * n) + (rng() - 0.5);
        let x = g.x + ux * d - uz * side, z = g.z + uz * d + ux * side;
        for (let q = 0; q < 12 && !room.walkable(x, z); q++) { d *= 0.75; x = g.x + ux * d - uz * side * 0.5; z = g.z + uz * d + ux * side * 0.5; }
        if (!room.walkable(x, z)) { x = g.x - ux * 2; z = g.z - uz * 2; }
        if (!room.walkable(x, z)) { x = f.x; z = f.z; }
        const m = room.spawn({ kind: 'monster', type: w.type, level: w.level || ev.level || 1, x, z, yaw: Math.atan2(-uz, -ux), rank: w.rank || 'normal',
          data: { event: ev.uid, noRank: true, gate: g.id || null, path: [[g.x - ux * 5, g.z - uz * 5], [f.x, f.z]] } });
        spawned.add(m); waveMobs.push(m);
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      const a = out + (n > 1 ? (i / (n - 1) - 0.5) : 0) * 1.75 + (rng() - 0.5) * 0.2, d = WAVE_NEAR_M[0] + rng() * (WAVE_NEAR_M[1] - WAVE_NEAR_M[0]);
      let x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
      // R4: never in a wall / deep water — round the players, then nearer, then where they stand
      for (let q = 1; q < 16 && !room.walkable(x, z); q++) { const aa = a + q * 0.7, dd = d * (q < 8 ? 1 : 0.5); x = f.x + Math.cos(aa) * dd; z = f.z + Math.sin(aa) * dd; }
      if (!room.walkable(x, z)) { x = f.x; z = f.z; }
      const m = room.spawn({ kind: 'monster', type: w.type, level: w.level || ev.level || 1, x, z, yaw: a + Math.PI, rank: w.rank || 'normal',
        data: { event: ev.uid, noRank: true, path: [[f.x + 1.5, f.z], [f.x - 1.5, f.z]] } });
      spawned.add(m); waveMobs.push(m);
    }
  }
  /** A wave monster standing idle far from everyone is sent at the nearest living player (the rules walk its path). */
  function hunt() {
    const list = fighters(40);
    if (!list.length) return;
    for (const m of waveMobs) {
      if (!alive(m) || (m.state & STATE.combat)) continue;
      let best = null, bd = Infinity;
      for (const p of list) { const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < bd) { bd = d; best = p; } }
      const pat = m.r && m.r.unit && m.r.unit.patrol;
      if (!best || bd < HUNT_FAR_M || !pat || !pat.pts) continue;
      pat.pts[0] = { x: best.x + 1.5, z: best.z }; pat.pts[1] = { x: best.x - 1.5, z: best.z };
    }
  }
  function spawnBoss() {
    const c = centre();
    const enc = ev.boss || null, meta = bossInfo();
    const type = ev.monster || meta.body || 'wolf';
    const e = room.spawn({ kind: 'monster', type, level: ev.level || 5, x: c.x, z: c.z, rank: 'boss', state: STATE.elite, name: ev.bossName || meta.name || ev.name,
      data: { encounter: enc, event: ev.uid, scale: ev.scale?.hp || 1 } });
    if (!e.r || !e.r.unit) { e.setMax(Math.round(e.hpMax * (ev.scale?.hp || 1))); e.setHp(e.hpMax); }   // the stand-in rules: scale here (C reads data.scale)
    spawned.add(e);
    return e;
  }
  function enrol() {
    const c = centre();
    for (const p of room.host.near(c.x, c.z, enrolR, x => x.kind === 'player' && x.char)) enrolled.add(p.char.id);
  }
  function clear() { for (const m of spawned) if (!m.removed) room.remove(m); spawned.clear(); waveMobs = []; }
  function lose(reason) { result = 'lost'; why = reason; clear(); return result; }
  const hasBoss = () => !!(ev.boss || ev.monster || !(ev.waves && ev.waves.length));
  const stages = () => (ev.waves || []).length + (hasBoss() ? 1 : 0);

  return {
    ev, enrolled, t0,
    get boss() { return boss; },
    get phase() { return phase; },
    get result() { return result; },
    get why() { return why; },
    get endsAt() { return t0 + durMs; },
    step() {
      if (result !== 'live') return result;
      const t = now();
      enrol();
      if (t - t0 > durMs) return lose('time');
      // T12: an event everyone walked away from (or died in) does not stand there for ten minutes
      if (ev.abandonMs && phase !== 'warn') {
        if (fighters(40).length) aloneSince = 0;
        else { aloneSince ||= t; if (t - aloneSince >= ev.abandonMs) { const c = centre(); return lose(room.host.near(c.x, c.z, enrolR + 40, x => x.kind === 'player' && x.dead).length ? 'wiped' : 'left'); } }
      }
      if (phase === 'warn') {
        if (t < t0 + (ev.warnMs || 0)) return result;
        phase = ev.waves && ev.waves.length ? 'waves' : 'boss';
        if (phase === 'boss') boss = spawnBoss();
      }
      if (phase === 'waves') {
        const left = [...spawned].some(alive);
        if (wave < 0 || ((!left && t - waveAt > WAVE_GAP_MS) || t - waveAt > WAVE_MAX_MS)) {
          wave++;
          waveAt = t;
          if (wave < ev.waves.length) spawnWave(wave);
          else if (hasBoss()) { phase = 'boss'; waveMobs = []; boss = spawnBoss(); }
          else if (!left) { result = 'won'; return result; }          // waves only (a town attack): the last one down wins it
          else { wave = ev.waves.length - 1; waveAt = t - WAVE_MAX_MS + 5000; }   // stragglers of the last wave: keep hunting them
        } else hunt();
      }
      if (phase === 'boss') {
        if (!boss || boss.dead) { result = 'won'; why = null; return result; }
        if (boss.removed) return lose('fled');
        // a flyover lifts off and lands at the next arena
        if (ev.arenas && ev.arenas.length > 1 && t - landedAt > LANDING_MS) {
          const frac = boss.hp / Math.max(1, boss.hpMax);
          room.remove(boss); spawned.delete(boss);
          landing++; landedAt = t;
          boss = spawnBoss(); boss.setHp(Math.max(1, Math.round(boss.hpMax * frac)));
        }
      }
      return result;
    },
    stop: clear,
    /** T12: what to do right now, with a count: { kind, text, n, of } — a wave's kills, or the boss's health. */
    objective() {
      if (phase === 'warn') return { kind: 'wait', text: 'Get ready', n: 0, of: 1 };
      if (phase === 'waves' && wave >= 0 && wave < (ev.waves || []).length) {
        const of = waveMobs.length, n = waveMobs.filter(m => !alive(m)).length;
        const nm = plural(ev.waves[wave].type);
        return { kind: 'kill', text: n >= of ? 'The next wave is coming' : 'Defeat the ' + nm, n, of, type: ev.waves[wave].type };
      }
      if (phase === 'boss') { const hp = boss && !boss.removed ? boss.hp / Math.max(1, boss.hpMax) : 0; return { kind: 'boss', text: 'Defeat ' + bossName(), n: boss && boss.dead ? 1 : 0, of: 1, hp: Math.round(hp * 100) / 100, id: boss && !boss.removed ? boss.id : 0 }; }
      return { kind: 'wait', text: I.objective && I.objective.text ? I.objective.text : 'Hold on', n: 0, of: 1 };
    },
    view() {
      const c = centre();
      const st = phase === 'boss' ? stages() : Math.max(0, wave + 1);
      return { uid: ev.uid, id: ev.id, name: ev.name, kind: ev.kind || 'zone', zoneName: ev.zoneName || null, x: c.x, z: c.z, r: R, phase, wave: wave + 1, waves: (ev.waves || []).length,
        boss: boss && !boss.removed ? boss.id : 0, hp: boss && !boss.removed ? boss.hp / Math.max(1, boss.hpMax) : 1, players: enrolled.size,
        ...(ev.where ? { where: ev.where } : {}), ...(ev.blurb ? { blurb: ev.blurb } : {}), ...(lastGate && phase === 'waves' ? { gate: lastGate } : {}),
        // T12: every event says what it is, what to do, how far along it is and how long is left (room ms; the province adds wall times)
        what: I.what || ev.blurb || (Array.isArray(ev.announce) ? ev.announce[0] : ev.announce) || null, text: I.what || ev.blurb || null,
        goal: (I.objective && I.objective.text) || null, objective: this.objective(), stage: { n: st, of: stages(), name: phase === 'boss' ? bossName() : phase === 'waves' && wave >= 0 && ev.waves[wave] ? 'Wave ' + (wave + 1) : null },
        leftMs: Math.max(0, t0 + durMs - now()), level: ev.level || null };
    },
  };
}

/** A monster type id as a plural display name: moor_hound -> "moor hounds". */
export function plural(type) { const s = String(type || 'enemy').replace(/_/g, ' '); return /s$/.test(s) ? s : /(ch|sh|x)$/.test(s) ? s + 'es' : /[^aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : s + 's'; }

/**
 * T12: what an event pays, BEFORE it is won, for the tracker ("what is the reward?"): the experience and gold a short win
 * gives a character of `level` (a longer fight pays more — lengthFactor), and that everyone who takes part gets a rare item
 * or better. `text` is E's `info.rewardText` when the event has one.
 */
export function rewardPreview(ev, rules, level = 1) {
  const rw = ev.reward || {};
  const lvl = Math.max(1, ev.level || level || 1);
  let span = 100;
  try { if (rules && rules.xpFor) span = Math.max(1, (rules.xpFor(lvl + 1) || 0) - (rules.xpFor(lvl) || 0)); } catch { /* the stand-in */ }
  const big = ev.kind === 'worldboss' ? economy().event.worldBossMult : 1;
  let mult = 1;
  try { if (rules && rules.xpMult) mult = rules.xpMult('event') || 1; } catch { /* none */ }
  const xp = Math.round((rw.xp || 0) * span * mult * big);
  const gold = eventGold(rw.gold, lvl, 0, ev.kind === 'worldboss');
  const items = ['A rare item or better for everyone who takes part'];
  if (rw.chest) items.push('A cache to open');
  const text = (ev.info && ev.info.rewardText) || (xp + ' XP, ' + gold + ' gold and a rare item or better');
  return { xp, gold, items, text };
}

/**
 * S24 (play-test 4): how much longer than a short event this one ran pays more — x1 up to EVENT_SHORT_MIN, up to
 * EVENT_LENGTH_CAP for a long one. A world boss pays WORLD_BOSS_MULT of everything.
 */
// V2 (owner feedback 7): the numbers live in data/rules/economy.json server.event (js/sim/economy-knobs.js); these are the defaults' names
export const EVENT_SHORT_MIN = 4;
export const EVENT_LENGTH_CAP = 2.5;
export const WORLD_BOSS_MULT = 2;
export const RARE_UP = new Set(['rare', 'legendary', 'set', 'unique']);
export const lengthFactor = minutes => knobLength(minutes);
/**
 * Event reward for ONE character — personal, never split or rolled for (S24): xp is a share of a level at the event's
 * level (PLAN §6.5) and gold grows with the level, both scaled by how long the event ran; and EVERY participant gets at
 * least one rare-or-better item (rolled until it is one, the item's own `chance` only gates extras above that).
 * `opts.minutes` = how long it ran.
 */
export function eventReward(ev, rules, entity, rng = Math.random, opts = {}) {
  const rw = ev.reward || {};
  const lvl = Math.max(1, ev.level || entity.level || 1);
  const span = rules.xpFor ? Math.max(1, (rules.xpFor(lvl + 1) || 0) - (rules.xpFor(lvl) || 0)) : 100;
  const big = ev.kind === 'worldboss' ? economy().event.worldBossMult : 1;
  const k = lengthFactor(opts.minutes) * big;
  const xp = Math.round((rw.xp || 0) * span * (rules.xpMult ? rules.xpMult('event') || 1 : 1) * k);     // R2: x1.25
  const gold = eventGold(rw.gold, lvl, opts.minutes, ev.kind === 'worldboss');
  let items = [];
  const tier = (rw.item && rw.item.tier) || 'rare';
  if (rules.rollLoot) {
    try {
      if (rw.item && (rw.item.chance == null || rng() < rw.item.chance)) items = rules.rollLoot(entity, { level: lvl, tier }) || [];
      // the guarantee: at least one rare or better for everyone who took part
      for (let tries = 0; tries < 6 && !items.some(it => it && RARE_UP.has(it.rarity)); tries++) items = items.concat((rules.rollLoot(entity, { level: lvl, tier: 'rare' }) || []).filter(it => it && RARE_UP.has(it.rarity)));
      if (big > 1) items = items.concat(rules.rollLoot(entity, { level: lvl, tier: 'rare' }) || []);
    } catch { items = []; }
  }
  return { xp, gold, items };
}

/** Boss size for the players who joined (stream E's events.json `director.size`). */
export function eventSize(n, size = {}) {
  const per = size.healthPerPlayer ?? 0.12, addPer = size.addWavePerPlayers ?? 6, cap = size.capPlayers ?? 60;
  const players = Math.max(size.minPlayers ?? 1, Math.min(cap, n | 0));
  return { players, hp: 1 + per * (players - 1), adds: Math.floor(players / addPer) };
}
