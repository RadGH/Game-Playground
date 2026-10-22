// PIN THE TAIL — five rounds. A fair animal (donkey, pony, goat, pig, cow, sheep) stands in a little paddock with a
// glowing star where its tail goes, for a couple of seconds. Then it is hidden and everyone taps where the tail goes.
// Each round has a trick, getting harder:
//   1 blur   the animal stays, but blurry and tail-less        3 slide  it trots to a new spot, then hides
//   2 hide   it simply disappears                              4 spin   the whole paddock turns upside down, then hides
//   5 swap   two animals, the starred one swaps places with the other, then both hide
// Score: up to 10 points for how close your pin is (0 once you are 25 paddock units away; the paddock is 160 x 120),
// +3 for the closest pin of the round (2+ players, ties share). Your last tap is your pin; DONE locks it in early.
// Alone: the same, a score out of 50. Everything is from the seed; the final tail spot is never in the state before
// the reveal (the start spot is, during the show: that is the point).
export const meta = {
  id: 'pin-the-tail', title: 'Pin the Tail', blurb: 'Remember where the tail goes, then pin it with your eyes shut!',
  how: ['An animal shows where its tail goes (the glowing star). Remember it!', 'Then it hides. Tap where the tail goes. You can tap again to move your pin.', 'Closest pin wins the round. Each round has a trick: slides, spins and swaps!', 'Five rounds.'],
  kind: 'ui', min: 1, max: 4, seconds: 84, scoring: 'points', unit: 'points', tags: ['puzzle', 'action'], card: 'card-pin-the-tail', css: true,
};
export const BW = 160, BH = 120;
export const ROUNDS = 5, START_S = 2, SHOW_S = 2.6, TRICK_S = 1.7, GUESS_S = 7.5, REVEAL_S = 4, END_S = 3;
export const TRICKS = ['blur', 'hide', 'slide', 'spin', 'swap'];
export const NEAR = 25, CLOSEST_BONUS = 3;
/** Each animal's box (facing right: head on the right) and where its tail joins the body, in its own units. */
export const ANIMALS = {
  donkey: { w: 56, h: 46, tail: [6, 19] },
  pony: { w: 56, h: 46, tail: [6, 18] },
  goat: { w: 50, h: 44, tail: [6, 20] },
  pig: { w: 52, h: 36, tail: [4, 16] },
  cow: { w: 60, h: 44, tail: [5, 17] },
  sheep: { w: 52, h: 40, tail: [5, 17] },
};
export const KINDS = Object.keys(ANIMALS);
const DECO = ['flower', 'rock', 'bush', 'flower', 'mushroom'];

/** Where the tail joins an animal placed as { k, x, y, s, f } (f = facing left). */
export function tailOf(a) {
  const A = ANIMALS[a.k], tx = a.f ? A.w - A.tail[0] : A.tail[0];
  return [a.x + tx * a.s, a.y + A.tail[1] * a.s];
}
export const points = d => d == null ? 0 : Math.max(0, Math.round(10 * (1 - d / NEAR)));
const r1 = v => Math.round(v * 10) / 10;

function place(rng, k, s, f, xr = [0, 1]) {
  const A = ANIMALS[k], w = A.w * s, h = A.h * s;
  const x0 = 6, x1 = BW - w - 6, y0 = 14, y1 = BH - h - 6;
  return { k, s, f, x: r1(x0 + (x1 - x0) * rng.range(xr[0], xr[1])), y: r1(rng.range(y0, y1)) };
}
const centre = a => [a.x + ANIMALS[a.k].w * a.s / 2, a.y + ANIMALS[a.k].h * a.s / 2];
function atCentre(a, [cx, cy]) {
  const A = ANIMALS[a.k], w = A.w * a.s, h = A.h * a.s;
  return { ...a, x: r1(Math.min(BW - w - 4, Math.max(4, cx - w / 2))), y: r1(Math.min(BH - h - 4, Math.max(8, cy - h / 2))) };
}
/** One round's layout: the animals before and after the trick, which one is starred, the paddock dressing, the answer. */
export function planRound(rng, i) {
  const trick = TRICKS[i], kinds = rng.shuffle(KINDS), s = r1(rng.range(1.2, 1.45)), f = rng.chance(0.5);
  const deco = Array.from({ length: 7 }, (_, j) => ({ k: DECO[j % DECO.length], x: r1(rng.range(8, BW - 8)), y: r1(rng.range(14, BH - 6)) }));
  let from, to, rot = 0;
  if (trick === 'swap') {
    const left = rng.chance(0.5);
    const a = place(rng, kinds[0], s, f, left ? [0, 0.3] : [0.7, 1]), b = place(rng, kinds[1], r1(rng.range(1.1, 1.35)), !f, left ? [0.7, 1] : [0, 0.3]);
    from = [a, b]; to = [atCentre(a, centre(b)), atCentre(b, centre(a))];
  } else if (trick === 'slide') {
    const left = rng.chance(0.5);                       // trots from one side of the paddock to the other
    from = [place(rng, kinds[0], s, f, left ? [0, 0.25] : [0.75, 1])]; to = [place(rng, kinds[0], s, f, left ? [0.75, 1] : [0, 0.25])];
  } else {
    from = [place(rng, kinds[0], s, f)]; to = from;
    if (trick === 'spin') rot = 180;
  }
  let target = tailOf(to[0]);
  if (rot) target = [BW - target[0], BH - target[1]];
  return { trick, from, to, rot, deco, start: tailOf(from[0]).map(r1), target: target.map(r1) };
}
/** Settle a round. pins: pid -> [x, y]. */
export function settleRound(pins, target, pids) {
  const dist = {}, gain = {};
  for (const p of pids) dist[p] = pins[p] ? r1(Math.hypot(pins[p][0] - target[0], pins[p][1] - target[1])) : null;
  const given = pids.filter(p => dist[p] != null), best = given.length ? Math.min(...given.map(p => dist[p])) : null;
  const closest = pids.length > 1 && best != null && best < NEAR ? given.filter(p => dist[p] === best) : [];
  for (const p of pids) gain[p] = points(dist[p]) + (closest.includes(p) ? CLOSEST_BONUS : 0);
  return { dist, gain, closest };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const plan = TRICKS.map((_, i) => planRound(rng, i));
  const total = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false, pins = {}, done = new Set(), reveal = null;
  function next() { round++; phase = 'show'; left = SHOW_S; pins = {}; done = new Set(); reveal = null; }
  function settle() {
    const P = plan[round], r = settleRound(pins, P.target, pids);
    for (const p of pids) total[p] += r.gain[p];
    reveal = { pins: { ...pins }, target: P.target, ...r };
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    init: () => ({ rounds: ROUNDS, solo, bw: BW, bh: BH, tricks: TRICKS }),
    act(pid, a, d) {
      if (phase !== 'guess' || !pids.includes(pid)) return;
      if (a === 'pin') {
        if (!Array.isArray(d) || d.length !== 2 || !d.every(v => typeof v === 'number' && Number.isFinite(v))) return;
        if (d[0] < 0 || d[0] > BW || d[1] < 0 || d[1] > BH) return;
        pins[pid] = [r1(d[0]), r1(d[1])];
      } else if (a === 'done' && pins[pid]) {
        done.add(pid); if (pids.every(p => done.has(p))) left = Math.min(left, 0.6);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'show') { const tr = plan[round].trick; if (tr === 'blur' || tr === 'hide') { phase = 'guess'; left = GUESS_S; } else { phase = 'trick'; left = TRICK_S; } }
      else if (phase === 'trick') { phase = 'guess'; left = GUESS_S; }
      else if (phase === 'guess') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), scores: { ...total } };
      if (round < 0 || phase === 'end') return g;
      const P = plan[round];
      g.trick = P.trick; g.deco = P.deco;
      if (phase === 'show') { g.animals = P.from; g.star = P.start; g.rot = 0; }
      if (phase === 'trick') { g.animals = P.from; g.to = P.to; g.rot = P.rot; }
      if (phase === 'guess') { g.rot = P.rot; if (P.trick === 'blur') g.animals = P.to; g.pinned = pids.filter(p => pins[p]); g.done = [...done]; }
      if (phase === 'reveal') { g.animals = P.to; g.rot = P.rot; g.reveal = reveal; }
      return g;
    },
    priv: pid => ({ pin: phase === 'guess' ? pins[pid] || null : null, done: done.has(pid) }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...total }, unit: meta.unit };
    },
  };
}
