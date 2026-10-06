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

export const WAVE_GAP_MS = 4000;          // a breath between a cleared wave and the next
export const WAVE_MAX_MS = 90000;         // a wave nobody clears still gives way to the next
export const LANDING_MS = 3 * 60000;      // a flyover feeds this long at each arena

export function createEventRunner({ room, ev, rng = Math.random, info = {}, now = () => room.now() }) {
  const t0 = now();
  const spawned = new Set();
  const enrolled = new Set();
  let phase = 'warn', wave = -1, waveAt = t0, boss = null, landing = 0, landedAt = t0, result = 'live';
  const R = ev.r || 40;
  const enrolR = Math.max(ev.enrol || 60, R * 1.2);
  const centre = () => (ev.arenas && ev.arenas.length ? ev.arenas[landing % ev.arenas.length] : ev);
  const pick = r => (Array.isArray(r) ? r[0] + Math.floor(rng() * (r[1] - r[0] + 1)) : (r ?? 1));
  const alive = e => e && !e.dead && !e.removed;

  function spawnWave(k) {
    const w = ev.waves[k], c = centre();
    const extra = Math.ceil((ev.scale?.adds || 0) / Math.max(1, ev.waves.length));
    const n = pick(w.count) + extra;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.4, d = R * (0.8 + rng() * 0.2);
      let x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      // R4: never in a wall / deep water — round the ring, then nearer the middle, then the middle itself
      for (let k = 1; k < 16 && !room.walkable(x, z); k++) { const aa = a + k * 0.7, dd = d * (k < 8 ? 1 : 0.5); x = c.x + Math.cos(aa) * dd; z = c.z + Math.sin(aa) * dd; }
      if (!room.walkable(x, z)) { x = c.x; z = c.z; }
      const m = room.spawn({ kind: 'monster', type: w.type, level: w.level || ev.level || 1, x, z, yaw: a + Math.PI, rank: w.rank || 'normal', data: { event: ev.uid } });
      spawned.add(m);
    }
  }
  function spawnBoss() {
    const c = centre();
    const enc = ev.boss || null, meta = (enc && info[enc]) || {};
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
  function clear() { for (const m of spawned) if (!m.removed) room.remove(m); spawned.clear(); }

  return {
    ev, enrolled, t0,
    get boss() { return boss; },
    get phase() { return phase; },
    step() {
      if (result !== 'live') return result;
      const t = now();
      enrol();
      if (t - t0 > (ev.durationMs || 10 * 60000)) { result = 'lost'; clear(); return result; }
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
          else { phase = 'boss'; boss = spawnBoss(); }
        }
      }
      if (phase === 'boss') {
        if (!boss || boss.dead) { result = 'won'; return result; }
        if (boss.removed) { result = 'lost'; clear(); return result; }
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
    view() {
      const c = centre();
      return { uid: ev.uid, id: ev.id, name: ev.name, kind: ev.kind || 'zone', zoneName: ev.zoneName || null, x: c.x, z: c.z, r: R, phase, wave: wave + 1, waves: (ev.waves || []).length,
        boss: boss && !boss.removed ? boss.id : 0, hp: boss && !boss.removed ? boss.hp / Math.max(1, boss.hpMax) : 1, players: enrolled.size,
        ...(ev.where ? { where: ev.where } : {}), ...(ev.blurb ? { blurb: ev.blurb } : {}) };
    },
  };
}

/**
 * S24 (play-test 4): how much longer than a short event this one ran pays more — x1 up to EVENT_SHORT_MIN, up to
 * EVENT_LENGTH_CAP for a long one. A world boss pays WORLD_BOSS_MULT of everything.
 */
export const EVENT_SHORT_MIN = 4;
export const EVENT_LENGTH_CAP = 2.5;
export const WORLD_BOSS_MULT = 2;
export const RARE_UP = new Set(['rare', 'legendary', 'set', 'unique']);
export const lengthFactor = minutes => Math.max(1, Math.min(EVENT_LENGTH_CAP, (minutes || 0) / EVENT_SHORT_MIN));
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
  const big = ev.kind === 'worldboss' ? WORLD_BOSS_MULT : 1;
  const k = lengthFactor(opts.minutes) * big;
  const xp = Math.round((rw.xp || 0) * span * (rules.xpMult ? rules.xpMult('event') || 1 : 1) * k);     // R2: x1.25
  const gold = Math.round((rw.gold || 0) * (1 + 0.15 * (lvl - 1)) * k);
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
