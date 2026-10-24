// CAULDRON BOBBING (Halloween only; round 12, built on Apple Bobbing — the best-rated timing game). A big bubbling
// cauldron with one lane per player. In your lane a gummy candy eyeball drifts from side to side AND bobs up and down:
// it ducks under the bubbles and pops back up. BITE when it is right under your face AND up at the surface. Bite while
// it is under your face but sunk and you only get a mouthful of bubbles ("Too deep!"); bite when it is off to the side
// and you get a potion splash. Either way you wipe your face for a moment. Gold eyeballs are worth 3 (they surface for
// less time), and a sleepy toad in a crown floats up now and then: biting him costs a point, so leave him and he
// paddles off. Three good bites in a row = +1 bonus ("Eye-catching!"). Everyone gets the same eyeballs in the same
// order. Alone: a score attack with medals.
//
// TIMING (as Apple Bobbing): every eyeball's motion is a fixed function of time (side x and depth d, both sums of
// sines), the same on the phone and the server. The phone sends `bite` { k: eyeball index, t: when it pressed }; the
// server takes t only if it is not in the future, not older than LAG_S and not before the last bite, works out where
// eyeball k was at t, and decides.
export const meta = {
  id: 'cauldron-bobbing', title: 'Cauldron Bobbing', blurb: 'Bite the gummy eyeballs when they pop up under your face!',
  how: ['Gummy eyeballs drift side to side and duck under the bubbles.', 'BITE when one is under your face AND up at the top.', 'Gold ones are worth 3. Three in a row is a bonus!', 'Leave the crowned toad alone: biting him loses a point.'],
  kind: 'ui', min: 1, max: 4, seconds: 50, scoring: 'points', unit: 'eyeballs', tags: ['action', 'holiday'], season: 'halloween', card: 'card-cauldron-bobbing', css: true,
};
export const COUNT_S = 3, PLAY_S = 42, END_S = 3;
export const LAG_S = 1.0, AHEAD_S = 0.15;
/** Half-width of "under your face" (the lane is x -1..1) and how high the eyeball must be (depth -1..1, 1 = top). */
export const ZONE = { easy: { red: 0.24, gold: 0.18, toad: 0.22 }, normal: { red: 0.2, gold: 0.15, toad: 0.2 }, hard: { red: 0.16, gold: 0.12, toad: 0.18 } };
export const SURFACE = { red: 0.05, gold: 0.4, toad: -0.2 };
export const WORTH = { red: 1, gold: 3, toad: -1 };
export const STREAK = 3, STREAK_BONUS = 1;
export const NEXT_S = 0.5, SPLASH_S = 1.1, YUCK_S = 1.4, TOAD_LIFE = 2.8;
export const MEDALS = [8, 15, 22];
export const EYES = 90;
const SPEED = { easy: 0.8, normal: 1, hard: 1.2 };
/** The eyeball colours (looks only; same rules): the iris colour of each red-worth eyeball cycles through these. */
export const IRIS = ['#3fb6ff', '#7dff5a', '#ff7ab8', '#b48cff'];

/** The eyeballs, the same for everyone: [{ kind, a, w, ph, a2, w2, ph2, v, vph, life? }]. */
export function makeEyes(rng, difficulty = 'normal') {
  const speed = SPEED[difficulty] || 1, out = [];
  for (let k = 0; k < EYES; k++) {
    let kind = 'red';
    if (k >= 2) { const r = rng(); if (r < 0.16) kind = 'gold'; else if (r < 0.32 && out[k - 1].kind !== 'toad') kind = 'toad'; }
    const ramp = Math.min(1.4, 1 + k * 0.022);
    const w = rng.range(1.5, 2.2) * speed * ramp * (kind === 'gold' ? 1.25 : 1);
    // the bob: a different, slower rhythm than the drift, so "under you" and "up" line up only now and then
    const v = rng.range(1.1, 1.6) * speed * Math.min(1.25, 1 + k * 0.01);
    out.push({ kind, a: +rng.range(0.55, 0.85).toFixed(3), w: +w.toFixed(3), ph: +rng.range(0, 6.283).toFixed(3),
      a2: +rng.range(0.06, 0.16).toFixed(3), w2: +(w * rng.range(1.7, 2.6)).toFixed(3), ph2: +rng.range(0, 6.283).toFixed(3),
      v: +v.toFixed(3), vph: +rng.range(0, 6.283).toFixed(3), ...(kind === 'toad' ? { life: TOAD_LIFE } : {}) });
  }
  return out;
}
/** Where eyeball `e` is across the lane (-1..1) `s` seconds after it appeared. */
export const eyeX = (e, s) => Math.max(-1, Math.min(1, e.a * Math.sin(e.w * s + e.ph) + e.a2 * Math.sin(e.w2 * s + e.ph2)));
/** How high it is (-1 = deep under the bubbles, 1 = right at the top). */
export const eyeD = (e, s) => Math.sin(e.v * s + e.vph);
/** Can it be bitten at s? */
export const biteable = (e, s, zone) => Math.abs(eyeX(e, s)) <= zone[e.kind] && eyeD(e, s) >= SURFACE[e.kind];
export const newLane = () => ({ k: 0, from: 0, stun: 0, score: 0, red: 0, gold: 0, miss: 0, deep: 0, yuck: 0, run: 0, bonus: 0, last: -1 });
/** Let toads nobody bit paddle away, up to time t. */
export function settle(lane, eyes, t) {
  while (lane.k < eyes.length && eyes[lane.k].kind === 'toad' && t >= lane.from + eyes[lane.k].life) { lane.from += eyes[lane.k].life; lane.k++; }
}
/** A bite at time t. -> 'red' | 'gold' | 'toad' | 'splash' | 'deep' | null (not allowed now). */
export function bite(lane, eyes, t, zone) {
  settle(lane, eyes, t);
  if (lane.k >= eyes.length || t < lane.from || t < lane.stun || t < lane.last) return null;
  const e = eyes[lane.k], s = t - lane.from; lane.last = t;
  if (Math.abs(eyeX(e, s)) > zone[e.kind]) { lane.miss++; lane.run = 0; lane.stun = t + SPLASH_S; return 'splash'; }
  if (eyeD(e, s) < SURFACE[e.kind]) { lane.deep++; lane.run = 0; lane.stun = t + SPLASH_S; return 'deep'; }
  if (e.kind === 'toad') { lane.yuck++; lane.run = 0; lane.score = Math.max(0, lane.score - 1); lane.k++; lane.from = t + YUCK_S; lane.stun = t + YUCK_S; return 'toad'; }
  lane[e.kind]++; lane.score += WORTH[e.kind]; lane.run++;
  if (lane.run >= STREAK) { lane.run = 0; lane.score += STREAK_BONUS; lane.bonus++; }
  lane.k++; lane.from = t + NEXT_S; lane.stun = t + NEXT_S; return e.kind;
}
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), eyes = makeEyes(rng, difficulty), zone = ZONE[difficulty] || ZONE.normal;
  const lanes = Object.fromEntries(pids.map(p => [p, newLane()]));
  let phase = 'count', left = COUNT_S, el = 0, over = false;
  const events = [];
  return {
    events,
    init: () => ({ eyes, zone, surface: SURFACE, worth: WORTH, play: PLAY_S, count: COUNT_S, lag: LAG_S, medals: MEDALS, solo: pids.length === 1, streak: STREAK, timing: { next: NEXT_S, splash: SPLASH_S, yuck: YUCK_S } }),
    act(pid, a, d) {
      if (a !== 'bite' || !lanes[pid] || phase === 'count' || over) return;
      if (!d || typeof d !== 'object' || !Number.isInteger(d.k) || typeof d.t !== 'number' || !Number.isFinite(d.t)) return;
      const lane = lanes[pid], t = d.t;
      if (t < 0 || t > PLAY_S || t > el + AHEAD_S || t < el - LAG_S) return;
      settle(lane, eyes, t);
      if (d.k !== lane.k) return;
      const r = bite(lane, eyes, t, zone);
      if (r) events.push({ e: 'bite', pid, k: d.k, r, t: r2(t), b: lane.bonus });
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      el += dt;
      for (const p of pids) settle(lanes[p], eyes, el - LAG_S);
      if (phase === 'play' && el >= PLAY_S) phase = 'end';
      if (phase === 'end' && el >= PLAY_S + END_S) over = true;
    },
    state() {
      const g = { phase, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : Math.max(0, Math.ceil(PLAY_S - el)), el: Math.floor(el * 2) / 2 };
      g.l = Object.fromEntries(pids.map(p => { const L = lanes[p]; return [p, [L.k, r2(L.from), r2(L.stun), L.score, L.red, L.gold, L.miss + L.deep, L.yuck, L.run, L.bonus]]; }));
      return g;
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, lanes[p].score])), groups = new Map();
      const key = p => lanes[p].score * 1000 - Math.min(999, lanes[p].miss + lanes[p].deep + lanes[p].yuck);     // ties go to fewer misses
      for (const p of pids) { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
