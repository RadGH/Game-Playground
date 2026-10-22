// APPLE BOBBING (Halloween only) — a big tub of water with one lane per player. In your lane an apple bobs from side
// to side; your face hangs over the middle. Press BITE when the apple is under your face: a bite dunks you in and you
// come up with the apple. Mistime it and you come up with a splash face (and a short pause to wipe your eyes). Red
// apples are 1, golden apples 3 (they move faster), and now and then a rubber spider floats up instead: biting it
// costs a point (never below 0), so leave it alone and it bobs away by itself. Everyone gets the SAME apples in the
// same order, so it is a fair race; they speed up as you go. Most points in the time wins. Alone: a score attack with
// medal targets.
//
// TIMING: every apple's motion is a fixed function of time (x = a sin(w t + ph) + a2 sin(w2 t + ph2)), the same on the
// phone and the server. The phone counts its own clock from the moment it saw the game start, draws the apple from it,
// and sends `bite` { k: apple index, t: the time it pressed }. The server never trusts a verdict: it takes t (only if it
// is not in the future, not older than LAG_S and not before the last bite), works out where apple k was at t, and
// decides. So a bite is judged by what the player SAW, and the network delay does not matter.
export const meta = {
  id: 'apple-bobbing', title: 'Apple Bobbing', blurb: 'Dunk your face and bite the bobbing apples, but not the rubber spider!',
  how: ['An apple bobs back and forth in your lane of the tub.', 'Press BITE when it is right under your face.', 'Golden apples are worth 3. Miss and you get a splash face!', 'Leave the rubber spider alone: biting it loses a point.'],
  kind: 'ui', min: 1, max: 4, seconds: 48, scoring: 'points', unit: 'apples', tags: ['action', 'holiday'], season: 'halloween', card: 'card-apple-bobbing', css: true,
};
export const COUNT_S = 3, PLAY_S = 40, END_S = 3;
export const LAG_S = 1.0, AHEAD_S = 0.15;             // a bite may be this much older than the server's clock, or this far ahead of it
export const ZONE = { red: 0.2, gold: 0.15, spider: 0.2 };   // half-width of "under your face", lane width = 2 (x from -1 to 1)
export const WORTH = { red: 1, gold: 3, spider: -1 };
export const NEXT_S = 0.55, SPLASH_S = 1.2, YUCK_S = 1.4, SPIDER_LIFE = 2.6;   // a splash costs enough time that mashing BITE loses to timing it
export const MEDALS = [8, 15, 22];                     // solo: bronze / silver / gold
export const APPLES = 90;

/** The apples, the same for everyone: [{ kind, a, w, ph, a2, w2, ph2, life? }]. */
export function makeApples(rng, difficulty = 'normal') {
  const speed = { easy: 0.8, normal: 1, hard: 1.2 }[difficulty] || 1;
  const out = [];
  for (let k = 0; k < APPLES; k++) {
    let kind = 'red';
    if (k >= 2) { const r = rng(); if (r < 0.16) kind = 'gold'; else if (r < 0.34 && out[k - 1].kind !== 'spider') kind = 'spider'; }
    const ramp = Math.min(1.45, 1 + k * 0.025);
    const w = rng.range(1.7, 2.4) * speed * ramp * (kind === 'gold' ? 1.35 : 1);
    out.push({ kind, a: +rng.range(0.55, 0.85).toFixed(3), w: +w.toFixed(3), ph: +rng.range(0, 6.283).toFixed(3),
      a2: +rng.range(0.08, 0.2).toFixed(3), w2: +(w * rng.range(1.7, 2.6)).toFixed(3), ph2: +rng.range(0, 6.283).toFixed(3),
      ...(kind === 'spider' ? { life: SPIDER_LIFE } : {}) });
  }
  return out;
}
/** Where apple `ap` is (-1..1 across the lane) `s` seconds after it appeared. */
export function appleX(ap, s) { return Math.max(-1, Math.min(1, ap.a * Math.sin(ap.w * s + ap.ph) + ap.a2 * Math.sin(ap.w2 * s + ap.ph2))); }
/** A fresh lane. */
export const newLane = () => ({ k: 0, from: 0, stun: 0, score: 0, red: 0, gold: 0, splash: 0, yuck: 0, last: -1 });
/** Let spiders nobody bit bob away, up to time t (they leave at from + life). Shared by the phone's prediction. */
export function settle(lane, apples, t) {
  while (lane.k < apples.length && apples[lane.k].kind === 'spider' && t >= lane.from + apples[lane.k].life) { lane.from += apples[lane.k].life; lane.k++; }
}
/** Apply a bite at time t to a lane (already checked for sense). -> 'red' | 'gold' | 'spider' | 'splash' | null (not allowed). */
export function bite(lane, apples, t) {
  settle(lane, apples, t);
  if (lane.k >= apples.length || t < lane.from || t < lane.stun || t < lane.last) return null;
  const ap = apples[lane.k]; lane.last = t;
  const x = appleX(ap, t - lane.from);
  if (Math.abs(x) > ZONE[ap.kind]) { lane.splash++; lane.stun = t + SPLASH_S; return 'splash'; }
  if (ap.kind === 'spider') { lane.yuck++; lane.score = Math.max(0, lane.score - 1); lane.stun = t + YUCK_S; lane.k++; lane.from = t + YUCK_S; return 'spider'; }
  lane[ap.kind]++; lane.score += WORTH[ap.kind]; lane.k++; lane.from = t + NEXT_S; lane.stun = t + NEXT_S; return ap.kind;
}
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), apples = makeApples(rng, difficulty);
  const lanes = Object.fromEntries(pids.map(p => [p, newLane()]));
  let phase = 'count', left = COUNT_S, el = 0, over = false;
  const events = [];
  return {
    events,
    init: () => ({ apples, zone: ZONE, worth: WORTH, play: PLAY_S, count: COUNT_S, lag: LAG_S, medals: MEDALS, solo: pids.length === 1, timing: { next: NEXT_S, splash: SPLASH_S, yuck: YUCK_S } }),
    act(pid, a, d) {
      if (a !== 'bite' || !lanes[pid] || phase === 'count' || over) return;
      if (!d || typeof d !== 'object' || !Number.isInteger(d.k) || typeof d.t !== 'number' || !Number.isFinite(d.t)) return;
      const lane = lanes[pid], t = d.t;
      if (t < 0 || t > PLAY_S || t > el + AHEAD_S || t < el - LAG_S) return;
      settle(lane, apples, t);
      if (d.k !== lane.k) return;                                   // the phone was biting an apple that is gone (or not up yet)
      const r = bite(lane, apples, t);
      if (r) events.push({ e: 'bite', pid, k: d.k, r, t: r2(t) });
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      el += dt;
      for (const p of pids) settle(lanes[p], apples, el - LAG_S);
      if (phase === 'play' && el >= PLAY_S) phase = 'end';
      if (phase === 'end' && el >= PLAY_S + END_S) over = true;
    },
    state() {
      const g = { phase, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : Math.max(0, Math.ceil(PLAY_S - el)), el: Math.floor(el * 2) / 2 };
      g.l = Object.fromEntries(pids.map(p => { const L = lanes[p]; return [p, [L.k, r2(L.from), r2(L.stun), L.score, L.red, L.gold, L.splash, L.yuck]]; }));
      return g;
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, lanes[p].score])), groups = new Map();
      // ties on apples go to fewer splashes
      const key = p => lanes[p].score * 1000 - Math.min(999, lanes[p].splash + lanes[p].yuck);
      for (const p of pids) { const k = key(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
