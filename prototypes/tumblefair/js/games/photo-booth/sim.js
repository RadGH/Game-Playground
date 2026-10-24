// PHOTO BOOTH — everyone squeezes into one fairground photo booth. A POSE CARD flashes up ("Arms up!", "Royal bow:
// crouch + wave", "Party time: arms up + silly face"…) and you have a moment to set the matching pose buttons before
// the camera FLASHES. Four buttons: Arms up, Crouch, Wave, Silly face; tap one to switch it on or off. At the flash,
// exactly the card's buttons = a good photo (3 points, or 2 if you only got there in the last half of the countdown);
// anything else is a silly photo (0) — and everyone sees it, because each photo shows every character in the pose they
// actually pulled. Ten photos; the strip at the end replays them all. Alone: the same, out of 30, with medals.
//
// TIMING: a phone sends `set` { m: the buttons as a bit mask, t: its own game clock }. The server keeps, per player,
// the mask and when it changed; at the flash it waits LAG_S more (for slow phones), then judges with the last change
// made at or before the flash. A change stamped after the flash, in the future, or too old is judged at server time.
export const meta = {
  id: 'photo-booth', title: 'Photo Booth', blurb: 'Strike the pose on the card before the flash. Say cheese!',
  how: ['A pose card flashes up: hit its buttons before the camera FLASHES!', 'Tap a button to switch it on, tap again for off.', 'Right pose = 3 points (2 if you were slow). Wrong = a very silly photo.'],
  kind: 'ui', min: 1, max: 4, seconds: 50, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-photo-booth', css: true,
  controls: { a: 'Pose' },
};
export const BUTTONS = [
  { id: 'up', bit: 1, name: 'Arms up', key: 'ArrowUp' },
  { id: 'down', bit: 2, name: 'Crouch', key: 'ArrowDown' },
  { id: 'wave', bit: 4, name: 'Wave', key: 'ArrowLeft' },
  { id: 'silly', bit: 8, name: 'Silly face', key: 'ArrowRight' },
];
/** Every pose a mask can make: its card name and the Chibi 2 clip a character plays in the photo. 0 = not ready. */
export const POSES = {
  0: { name: 'Not ready!', clip: 'lookAround' },
  1: { name: 'Arms up!', clip: 'cheer' },
  2: { name: 'Crouch!', clip: 'kneel' },
  4: { name: 'Wave!', clip: 'wave' },
  8: { name: 'Silly face!', clip: 'laugh' },
  5: { name: 'Hello up there!', clip: 'salute' },
  9: { name: 'Party time!', clip: 'dance' },
  6: { name: 'Royal bow!', clip: 'bowGreet' },
  10: { name: 'Goofy squat!', clip: 'sitGround' },
  12: { name: 'Hi, silly!', clip: 'point' },
  3: { name: 'Big stretch!', clip: 'stretch' },
  7: { name: 'Fancy!', clip: 'pray' },
  11: { name: 'Wiggle!', clip: 'clap' },
  13: { name: 'Hooray!', clip: 'cheer' },
  14: { name: 'Sneaky!', clip: 'shrug' },
  15: { name: 'EVERYTHING!', clip: 'dance' },
};
export const ROUNDS = 10, COUNT_S = 3, PHOTO_S = 1.5, STRIP_S = 6, LAG_S = 0.35, AHEAD_S = 0.15, OLD_S = 1.2;
export const LEVELS = {
  easy: { window: 2.2, two: 0.35, three: 0 },
  normal: { window: 1.6, two: 0.5, three: 0.1 },
  hard: { window: 1.25, two: 0.55, three: 0.25 },
};
export const MEDALS = [12, 21, 27];
const ONE = [1, 2, 4, 8], TWO = [5, 9, 6, 10, 12, 3], THREE = [7, 11, 13, 14];
const r2 = v => Math.round(v * 100) / 100;

/** The ten cards from the seed: easy ones first, never the same card twice in a row. */
export function makeCards(rng, difficulty = 'normal') {
  const L = LEVELS[difficulty] || LEVELS.normal, out = [];
  for (let i = 0; i < ROUNDS; i++) {
    const roll = rng(), pool = i < 2 ? ONE : roll < L.three ? THREE : roll < L.three + L.two ? TWO : ONE;
    let c = rng.pick(pool); if (c === out[i - 1]) c = pool[(pool.indexOf(c) + 1) % pool.length];
    out.push(c);
  }
  return out;
}
/** How a photo scores: { ok, pts } for the mask held at the flash, changed at `at` into a window that opened at `from`. */
export function judge(card, mask, at, from, window) {
  if (mask !== card) return { ok: false, pts: 0 };
  return { ok: true, pts: at - from <= window / 2 ? 3 : 2 };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const cards = makeCards(rng, difficulty);
  const P = Object.fromEntries(pids.map(p => [p, { score: 0, good: 0, quick: 0, log: [] }]));   // log: [t, mask] changes this round
  // phases: count -> pose (the card, the window) -> photo (the flash, LAG_S later the judgement) -> … -> strip -> over
  let phase = 'count', round = -1, el = 0, until = COUNT_S, from = 0, flash = 0, judged = false, over = false;
  const photos = [];                                   // per round: { card, m: { pid: mask }, ok: { pid: pts } }
  const events = [];
  function startRound() { round++; phase = 'pose'; from = el; flash = r2(el + L.window); until = flash; judged = false; for (const p of pids) P[p].log = [[from, 0]]; }
  function maskAt(p, t) { let m = 0, at = from; for (const [lt, lm] of P[p].log) if (lt <= t + 1e-9) { m = lm; at = lt; } return [m, at]; }
  function judgeRound() {
    const card = cards[round], ph = { card, m: {}, pts: {} };
    for (const p of pids) {
      const [m, at] = maskAt(p, flash), r = judge(card, m, at, from, L.window);
      ph.m[p] = m; ph.pts[p] = r.pts; P[p].score += r.pts; if (r.ok) { P[p].good++; if (r.pts === 3) P[p].quick++; }
    }
    photos.push(ph); judged = true;
    events.push({ e: 'photo', round, card, m: ph.m, pts: ph.pts });
  }
  return {
    events,
    init: () => ({ rounds: ROUNDS, window: L.window, photo: PHOTO_S, strip: STRIP_S, solo, medals: MEDALS }),
    act(pid, a, d) {
      if (a !== 'set' || !P[pid] || over || !(phase === 'pose' || (phase === 'photo' && !judged))) return;   // a slow phone's change still counts until the judgement
      if (!d || typeof d !== 'object' || !Number.isInteger(d.m) || d.m < 0 || d.m > 15) return;
      let t = typeof d.t === 'number' && Number.isFinite(d.t) ? d.t : el;
      if (t > el + AHEAD_S || t < el - OLD_S || t < from) t = el;
      if (phase === 'photo' && t > flash) return;                                        // after the flash: too late for this photo
      const log = P[pid].log; if (t < log[log.length - 1][0]) t = log[log.length - 1][0];      // never back in time
      if (log.length > 60) return;
      log.push([r2(t), d.m]);
    },
    step(dt) {
      if (over) return;
      el += dt;
      if (el + 1e-9 < until) return;
      if (phase === 'count') startRound();
      else if (phase === 'pose') { phase = 'photo'; until = flash + LAG_S; }
      else if (phase === 'photo' && !judged) { judgeRound(); until = flash + PHOTO_S; }
      else if (phase === 'photo') { if (round + 1 < ROUNDS) startRound(); else { phase = 'strip'; until = el + STRIP_S; } }
      else if (phase === 'strip') over = true;
    },
    state() {
      const g = { phase, round, el: r2(el), left: Math.max(0, Math.ceil(until - el)), sc: Object.fromEntries(pids.map(p => [p, P[p].score])) };
      if (phase === 'pose' || phase === 'photo') { g.card = cards[round]; g.from = r2(from); g.flash = flash; }
      if (phase === 'photo' && judged) g.ph = photos[round];
      if (phase === 'strip') g.strip = photos.map(ph => [ph.card, ph.m, ph.pts]);
      return g;
    },
    get over() { return over; },
    get _el() { return el; }, _cards: cards, _P: P, get _phase() { return phase; }, get _round() { return round; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, P[p].score])), groups = new Map();
      for (const p of pids) { const k = P[p].score * 100 + P[p].quick; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      const r = { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
      if (solo) r.medal = MEDALS.filter(m => scores[pids[0]] >= m).length;
      return r;
    },
  };
}
