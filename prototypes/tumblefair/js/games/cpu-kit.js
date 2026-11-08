// The CPU kit (Expansion 1, M1 "CPU Fairgoers"): small, pure helpers every minigame's computer player is built from.
//
// A game gets a CPU by adding ONE file, `js/games/<id>/cpu.js` (nothing else to register: js/sim/cpu.js finds it):
//
//   import { skillOf, thinker, stickTo, A } from '../cpu-kit.js';
//   export function createCpu(c) {          // c = { pid, seat, players, meta, init, skill, rng, difficulty }
//     const think = thinker(c);             //   skill: one of SKILLS below (c.skill.id 'family' | 'normal' | 'tricky')
//     return {
//       tick(v) {                           // every 50 ms while the minigame runs. v = { t, dt, g, priv, init, me,
//                                           //   bodies, events, act(a, d) } — EXACTLY what a phone is shown, no more:
//                                           //   g = the last public state, priv = this CPU's own private state, events =
//                                           //   the game's events since the last tick (public + the ones sent to it),
//                                           //   me / bodies = the arena bodies (everyone sees those anyway)
//         return think(v, () => ({ ...stickTo(v.me, 0, 0, c.skill), b: A }));   // arena: return the input { mx, mz, b }
//       },                                  // ui: call v.act(a, d) — the same taps a phone sends — and return nothing
//     };
//   }
//
// Rules for a CPU (live report #35: "the computer is too fast and aggressive"):
//   * never read anything a phone could not see (no peeking at hidden answers, other players' private state, the rng);
//   * move through the same input a phone sends (it goes through stepBody like everyone else's) and tap through `act`;
//   * be slower than a person at Family, about a person at Normal, a sharp person at Tricky — never superhuman.
//     The numbers in SKILLS are what "about a person" means; per-game tuning goes through `by(c.skill, [f, n, t])`.
//   * all randomness from c.rng (seeded), so a match can be replayed and the balance test is repeatable.
import { IN } from '../shared/protocol.js';

export const A = IN.A, B = IN.B;
export const IDLE = Object.freeze({ mx: 0, mz: 0, b: 0 });

/**
 * How good a CPU is. `react` s before it responds to something new, `think` s between steering decisions, `speed` the
 * stick push (stepBody scales speed by it), `aim` how much of a game's natural spread it adds (1 = a lot), `slip` the
 * chance of a plain mistake per decision, `tapMs` timing error (sd) on a timed tap, `best` the chance it takes the best
 * option it can see (else a random decent one), `q` a 0..1 "how good" for anything else.
 */
export const SKILLS = Object.freeze({
  family: Object.freeze({ id: 'family', level: 0, label: 'Family', q: 0.3, react: 0.75, think: 0.34, speed: 0.78, aim: 1, slip: 0.3, tapMs: 240, best: 0.4 }),
  normal: Object.freeze({ id: 'normal', level: 1, label: 'Normal', q: 0.6, react: 0.45, think: 0.2, speed: 0.9, aim: 0.55, slip: 0.14, tapMs: 120, best: 0.7 }),
  tricky: Object.freeze({ id: 'tricky', level: 2, label: 'Tricky', q: 0.8, react: 0.32, think: 0.14, speed: 0.96, aim: 0.38, slip: 0.07, tapMs: 75, best: 0.85 }),
});
export const SKILL_IDS = Object.freeze(Object.keys(SKILLS));
/** A skill by id, or a skill object as given (so a tweaked copy such as { ...c.skill, react: 0.4 } is used as is). */
export const skillOf = id => (id && typeof id === 'object' && typeof id.level === 'number' ? id : SKILLS[id] || SKILLS[id?.id] || SKILLS.normal);
/** Per-skill value: by(c.skill, [familyValue, normalValue, trickyValue]). */
export const by = (sk, list) => list[Math.max(0, Math.min(list.length - 1, skillOf(sk).level))];

// ------------------------------------------------------------------ numbers
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dist = (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az);
/** A normal-ish random number (mean 0, sd ~1) from the seeded rng. */
export const gauss = rng => (rng() + rng() + rng() + rng() - 2) * 1.732;
/** `v` with skill-sized error: spread = how far off a sloppy (Family) player would be (one sd). */
export const noisy = (v, spread, sk, rng) => v + gauss(rng) * spread * skillOf(sk).aim;
/** A plain mistake this time? (k scales the chance.) */
export const slip = (sk, rng, k = 1) => rng() < skillOf(sk).slip * k;
/** Picks from `list`: the best by `score` with chance sk.best, else a random one of the better half. */
export function pickBest(list, score, sk, rng) {
  if (!list.length) return undefined;
  const ranked = list.map(x => [x, score(x)]).sort((a, b) => b[1] - a[1]).map(r => r[0]);
  if (rng() < skillOf(sk).best) return ranked[0];
  const half = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
  return half[Math.floor(rng() * half.length)];
}
export const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// ------------------------------------------------------------------ arena movement
/** Stick toward (x, z) at the skill's push; eases off inside `arrive` metres so it does not jitter on the spot. */
export function stickTo(me, x, z, sk, { arrive = 0.35, mag = null } = {}) {
  if (!me) return { mx: 0, mz: 0 };
  const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
  if (d < 1e-3) return { mx: 0, mz: 0 };
  const m = (mag ?? skillOf(sk).speed) * (d < arrive ? d / arrive : 1);
  return { mx: dx / d * m, mz: dz / d * m };
}
/** Stick straight away from (x, z). */
export function stickFrom(me, x, z, sk, { mag = null } = {}) {
  if (!me) return { mx: 0, mz: 0 };
  let dx = me.x - x, dz = me.z - z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  const m = mag ?? skillOf(sk).speed;
  return { mx: dx * m, mz: dz * m };
}
/** Adds two sticks with weights and caps the length at the skill's speed. */
export function blend(sk, ...parts) {
  let mx = 0, mz = 0; for (const [s, w = 1] of parts) { if (!s) continue; mx += s.mx * w; mz += s.mz * w; }
  const m = Math.hypot(mx, mz), cap = skillOf(sk).speed;
  if (m > cap) { mx *= cap / m; mz *= cap / m; }
  return { mx, mz };
}
/** The nearest of `items` to `me` (pos(item) -> [x, z] or {x, z}). -> { item, d } (item null when the list is empty). */
export function nearest(me, items, pos = o => o, filter = null) {
  let best = null, bd = Infinity;
  for (const it of items || []) { if (filter && !filter(it)) continue; const p = pos(it); if (!p) continue; const x = p.x ?? p[0], z = p.z ?? p[1], d = Math.hypot(x - me.x, z - me.z); if (d < bd) { bd = d; best = it; } }
  return { item: best, d: bd };
}
/** The other live bodies (not me, not out). -> [[pid, body]] */
export const others = (v, pid, skipFlags = 1) => [...(v.bodies || new Map())].filter(([p, b]) => p !== pid && !(b.flags & skipFlags));
/** Where `b` will be in `s` seconds if it keeps going (to lead a moving target). */
export const lead = (b, s) => ({ x: b.x + (b.vx || 0) * s, z: b.z + (b.vz || 0) * s });
/** Keeps a point inside a rect / circle arena (margin m). */
export function inArena(x, z, arena, m = 0.8) {
  if (!arena) return { x, z };
  if (arena.shape === 'circle') { const d = Math.hypot(x, z), lim = arena.r - m; return d > lim ? { x: x / d * lim, z: z / d * lim } : { x, z }; }
  return { x: clamp(x, -arena.hw + m, arena.hw - m), z: clamp(z, -arena.hd + m, arena.hd - m) };
}
/** A wandering spot: a new random point every few seconds (mem keeps it). */
export function wander(mem, v, arena, rng, every = 2.5) {
  if (!mem.wTo || v.t >= mem.wAt || (v.me && Math.hypot(mem.wTo.x - v.me.x, mem.wTo.z - v.me.z) < 0.6)) {
    const hw = arena?.shape === 'circle' ? arena.r * 0.7 : (arena?.hw ?? 6) * 0.8, hd = arena?.shape === 'circle' ? arena.r * 0.7 : (arena?.hd ?? 6) * 0.8;
    mem.wTo = { x: (rng() * 2 - 1) * hw, z: (rng() * 2 - 1) * hd }; mem.wAt = v.t + every * (0.7 + rng() * 0.6);
  }
  return mem.wTo;
}

// ------------------------------------------------------------------ timing
/**
 * Decisions at a human pace. `const think = thinker(c)`; then each tick `return think(v, () => decide())`: decide()
 * runs every skill.think s (with a little jitter) and its stick is HELD between; its button bits are sent on the first
 * tick only (a press, not a hold), unless decide() returns `hold: true`.
 */
export function thinker(c, { every = null } = {}) {
  const sk = skillOf(c.skill); let next = 0, out = IDLE, fresh = false;
  return (v, decide) => {
    if (v.t >= next) { next = v.t + (every ?? sk.think) * (0.8 + c.rng() * 0.4); out = decide() || IDLE; fresh = true; }
    else fresh = false;
    return { mx: out.mx || 0, mz: out.mz || 0, b: (fresh || out.hold) ? (out.b || 0) : 0 };
  };
}
/**
 * Reaction delay: true once `key` has been seen for the skill's reaction time (`mem` keeps first-seen times). Call it
 * every tick while the thing is there; a different key starts a new wait. Use it for "the light turned green" moments.
 */
export function reacted(mem, key, t, sk, rng = null, k = 1) {
  mem.react ||= {};
  if (mem.react.key !== key) { mem.react.key = key; mem.react.at = t + skillOf(sk).react * k * (rng ? 0.75 + rng() * 0.5 : 1); }
  return t >= mem.react.at;
}
/** Like reacted(), but remembers every key at once (several things on screen each get their own reaction clock).
 *  Keys not asked about for 2 s are forgotten. */
export function noticed(mem, key, t, sk, rng = null, k = 1) {
  const m = (mem.seen ||= new Map());
  let e = m.get(key);
  if (!e || t - e.last > 2) { e = { at: t + skillOf(sk).react * k * (rng ? 0.75 + rng() * 0.5 : 1), last: t }; m.set(key, e); }
  e.last = t;
  if (m.size > 200) for (const [kk, x] of m) if (t - x.last > 2) m.delete(kk);
  return t >= e.at;
}
/** True at most once every `s` seconds per key. */
export function every(mem, key, t, s) { mem.cool ||= {}; if (t < (mem.cool[key] ?? -Infinity)) return false; mem.cool[key] = t + s; return true; }
/** Once per key (a round id, a question number…): true the first time only. */
export function once(mem, key) { mem.done ||= new Set(); if (mem.done.has(key)) return false; mem.done.add(key); return true; }
/** A timed tap: the ideal moment `ideal` (seconds or ms, your unit) moved by the skill's timing error (unit: ms = 1). */
export const tapTime = (ideal, sk, rng, unit = 1) => ideal + gauss(rng) * skillOf(sk).tapMs * unit;
/** A wait before a ui tap, like a person reading the screen: base s + reaction, a bit random. */
export const readDelay = (sk, rng, base = 0.4) => base + skillOf(sk).react * (0.6 + rng() * 0.9);
/**
 * Act once per `key` after a human-ish delay: `later(mem, v, key, () => v.act(...), delay)`. The first call starts the
 * clock (delay default: readDelay), the call at or after the time runs fn. Returns true when it ran.
 */
export function later(mem, v, key, fn, delay = null, sk = null, rng = null) {
  mem.later ||= {};
  if (mem.later[key] === 'done') return false;
  if (mem.later[key] == null) mem.later[key] = v.t + (delay ?? (sk && rng ? readDelay(sk, rng) : 0.6));
  if (v.t < mem.later[key]) return false;
  mem.later[key] = 'done'; fn(); return true;
}

// ------------------------------------------------------------------ social games
/** Captions a CPU can offer when a game asks for words (all family-friendly, all fair-themed). */
export const CAPTIONS = Object.freeze([
  'This is fine.', 'Nobody saw that, right?', 'Ten out of ten, would wobble again.', 'Plan B was also this.',
  'I meant to do that.', 'The candy floss made me do it.', 'Is it too late to go home?', 'Best day at the fair!',
  'Hold my lemonade.', 'Somebody call the goat.', 'Not my finest hour.', 'The ducks are in charge now.',
  'Worth every ticket.', 'And that is how I won a hat.', 'Totally on purpose.', 'Who ordered the chaos?',
  'Smile for the camera!', 'Same time next year?', 'The sign said "do not touch".', 'Still better than the teacups.',
]);
/** Short words a CPU can type when a game asks for one word (by first letter when it can). */
export const WORDS = Object.freeze(['apple', 'banjo', 'candy', 'daisy', 'eagle', 'fudge', 'giggle', 'honey', 'igloo', 'jelly', 'kite', 'lemon', 'mango', 'noodle', 'otter', 'pickle', 'quilt', 'robin', 'sugar', 'tulip', 'umbrella', 'violin', 'waffle', 'xylophone', 'yoyo', 'zebra']);
/** A few simple pictures as strokes in a 0..1 box: [[[x, y], [x, y], …], …]. drawingFor scales one to a canvas. */
export const DRAWINGS = Object.freeze({
  sun: [[[0.5, 0.3], [0.62, 0.34], [0.68, 0.46], [0.64, 0.6], [0.5, 0.66], [0.36, 0.6], [0.32, 0.46], [0.38, 0.34], [0.5, 0.3]], [[0.5, 0.1], [0.5, 0.2]], [[0.5, 0.76], [0.5, 0.88]], [[0.15, 0.48], [0.25, 0.48]], [[0.75, 0.48], [0.86, 0.48]], [[0.25, 0.2], [0.32, 0.28]], [[0.75, 0.2], [0.68, 0.28]]],
  house: [[[0.2, 0.85], [0.2, 0.45], [0.8, 0.45], [0.8, 0.85], [0.2, 0.85]], [[0.15, 0.47], [0.5, 0.15], [0.85, 0.47]], [[0.45, 0.85], [0.45, 0.65], [0.57, 0.65], [0.57, 0.85]]],
  face: [[[0.5, 0.15], [0.75, 0.25], [0.85, 0.5], [0.75, 0.75], [0.5, 0.85], [0.25, 0.75], [0.15, 0.5], [0.25, 0.25], [0.5, 0.15]], [[0.38, 0.4], [0.4, 0.42]], [[0.6, 0.4], [0.62, 0.42]], [[0.35, 0.62], [0.5, 0.7], [0.65, 0.62]]],
  tree: [[[0.48, 0.9], [0.48, 0.6]], [[0.54, 0.9], [0.54, 0.6]], [[0.5, 0.15], [0.75, 0.45], [0.62, 0.45], [0.8, 0.62], [0.2, 0.62], [0.38, 0.45], [0.25, 0.45], [0.5, 0.15]]],
  fish: [[[0.2, 0.5], [0.35, 0.35], [0.6, 0.32], [0.75, 0.5], [0.6, 0.68], [0.35, 0.65], [0.2, 0.5]], [[0.75, 0.5], [0.9, 0.35], [0.9, 0.65], [0.75, 0.5]], [[0.33, 0.46], [0.35, 0.47]]],
  cloud: [[[0.2, 0.6], [0.25, 0.45], [0.38, 0.42], [0.45, 0.3], [0.6, 0.3], [0.68, 0.42], [0.8, 0.45], [0.84, 0.6], [0.2, 0.6]], [[0.3, 0.7], [0.27, 0.8]], [[0.5, 0.7], [0.47, 0.82]], [[0.7, 0.7], [0.67, 0.8]]],
});
/** One stock picture scaled to a w x h canvas (rounded to whole units) with a little wobble. -> strokes */
export function drawingFor(rng, w = 100, h = 100, name = null) {
  const keys = Object.keys(DRAWINGS), k = name && DRAWINGS[name] ? name : keys[Math.floor(rng() * keys.length)];
  return DRAWINGS[k].map(s => s.map(([x, y]) => [Math.round(clamp(x + (rng() - 0.5) * 0.02, 0, 1) * w), Math.round(clamp(y + (rng() - 0.5) * 0.02, 0, 1) * h)]));
}
/** A vote for anyone but me (options are pids or anything; `isMe(o)` says which is mine). Better ones by `score`. */
export function voteFor(options, isMe, rng, score = null, sk = null) {
  const ok = options.filter(o => !isMe(o));
  if (!ok.length) return undefined;
  return score && sk ? pickBest(ok, score, sk, rng) : ok[Math.floor(rng() * ok.length)];
}
