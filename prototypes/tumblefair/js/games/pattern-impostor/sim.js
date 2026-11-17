// PATTERN IMPOSTOR — six rounds of 6-9 little pictures (shape x colour x size x pattern x how many). Every picture but
// one follows a hidden rule; tap the one that breaks it. The first right tap scores most; a wrong tap locks you out of
// that round. Everyone gets the same puzzles (made from the match seed). Rules get subtler as the rounds go:
//   rounds 1-2  one thing is the same on all of them (colour / shape)
//   rounds 3-4  a quieter thing is the same (pattern / how many / size)
//   rounds 5-6  two things go together ("each shape always has its own colour"), so the impostor looks ordinary on
//               its own and only breaks the PAIRING
// Fairness, checked for every puzzle and retried until it holds: no picture other than the impostor is the only one
// of its kind in any single feature, and no OTHER picture breaks a "this feature decides that one" pairing alone.
//
// Live report #48 (2026-11-12, 👎 "each color had its own nuymber of shapes???????"): the reveal of a round-5 pairing
// read like a riddle ("Each colour had its own number of shapes: every red one had two…") and nothing on screen let you
// check it, the pairing kind of rule was never explained before it came up, and a SMALL picture of three shapes drew
// each shape as big as a BIG picture of one (size and count looked the same). Now: the rule is said in plain words with
// numerals ("The colour tells you how many shapes: every red picture had 2, every blue picture had 3 — but this red
// picture had 1."), every tile is labelled at the reveal with the features the rule uses, the impostor's broken one in
// red; rounds 5-6 explain the pairing idea while you look; a clue names the features to look at halfway through each
// round; the later rounds get more time; small pictures are drawn as a small group in the middle; and the last screen
// lists all six rules with their impostors.
export const meta = {
  id: 'pattern-impostor', title: 'Pattern Impostor', blurb: 'Spot the one that breaks the rule!',
  how: ['All the pictures follow a secret rule, except one. Tap that one!', 'First right tap scores most. A wrong tap locks you out for the round.', 'Later rules pair two things up: every star is red, every circle is blue…', 'Stuck? A clue appears halfway through each round.'],
  kind: 'ui', min: 1, max: 4, seconds: 122, scoring: 'points', unit: 'points', tags: ['puzzle'], card: 'card-pattern-impostor', css: true,
};

export const FEATURES = {
  shape: ['circle', 'square', 'triangle', 'star', 'hexagon', 'diamond'],
  colour: ['red', 'orange', 'green', 'blue', 'purple'],
  size: ['small', 'big'],
  fill: ['solid', 'striped', 'dotted'],
  count: ['one', 'two', 'three'],
};
export const KEYS = ['shape', 'colour', 'size', 'fill', 'count'];
export const ROUNDS = 6, START_S = 1.5, REVEAL_S = 5.5, END_S = 6;
/** Seconds to look, per round: the subtle rounds get longer (#48). ROUND_S = the first round's. */
export const ROUND_TIMES = [10, 10, 13, 13, 16, 16], ROUND_S = ROUND_TIMES[0];
/** The clue (which features the rule uses) shows after this share of a round. */
export const CLUE_AT = 0.5;
export const POINTS = [5, 3, 2, 1];          // the 1st, 2nd, 3rd, 4th right tap in a round
export const SIZES_N = [6, 6, 7, 8, 8, 9];   // pictures per round
export const LEVELS = [1, 1, 2, 2, 3, 3];
const SAME = { 1: ['colour', 'shape'], 2: ['fill', 'count', 'size'] };
const PAIRS = [['shape', 'colour'], ['fill', 'size'], ['colour', 'count'], ['shape', 'fill'], ['size', 'colour']];

/** A picture as a compact string: one digit per feature, in KEYS order ("31020" = star, orange, small, dotted, one). */
export const encode = it => KEYS.map(k => it[k]).join('');
export const decode = s => Object.fromEntries(KEYS.map((k, i) => [k, +s[i]]));
const word = (k, v) => FEATURES[k][v];
const plural = (k, v) => { const w = word(k, v); return k === 'shape' ? w + 's' : w; };
const thing = it => `${word('size', it.size)} ${word('colour', it.colour)} ${word('fill', it.fill)} ${word('shape', it.shape)}`;
/** Plain words for one feature (#48: numerals for counts, "pattern" for the fill). */
export const NAME = { shape: 'shape', colour: 'colour', size: 'size', fill: 'pattern', count: 'number of shapes' };
const shapes = v => `${v + 1} shape${v ? 's' : ''}`;
/** "every red picture" / "this star picture" / "every picture with 2 shapes". */
const subject = (det, k, v) => (k === 'count' ? `${det} picture with ${shapes(v)}` : `${det} ${word(k, v)} picture`);
/** "had 2 shapes" / "was red" / "had stars". */
const said = (k, v) => (k === 'count' ? `had ${shapes(v)}` : k === 'shape' ? `had ${plural(k, v)}` : `was ${word(k, v)}`);
/** A tile's label at the reveal: the value of each feature the rule uses ("red · 2 shapes"). */
export function caption(code, keys) {
  const it = typeof code === 'string' ? decode(code) : code;
  return keys.map(k => (k === 'count' ? shapes(it[k]) : word(k, it[k]))).join(' · ');
}
/** The clue shown halfway through a round: which features to look at. */
export function clueOf(rule) {
  const look = k => ({ shape: 'the shapes', colour: 'the colours', size: 'the sizes', fill: 'the patterns', count: 'the number of shapes' }[k]);
  return rule.kind === 'same' ? `Clue: look at ${look(rule.a)}.` : `Clue: look at ${look(rule.a)} AND ${look(rule.b)} together.`;
}

/** n values for feature `k`, every value used at least twice (so none stands out on its own). */
function spread(rng, k, n, avoid = null) {
  const vals = rng.shuffle(FEATURES[k].map((_, i) => i).filter(v => v !== avoid));
  const kinds = Math.max(1, Math.min(vals.length, rng.int(1, Math.floor(n / 2)), 3));
  const out = []; for (let i = 0; i < kinds; i++) out.push(vals[i], vals[i]);
  while (out.length < n) out.push(vals[rng.int(0, kinds - 1)]);
  return rng.shuffle(out);
}
const tally = (items, k) => { const m = new Map(); for (const it of items) m.set(it[k], (m.get(it[k]) || 0) + 1); return m; };

/** Pictures (other than `odd`) that a player could fairly call the impostor by a different, simpler rule. */
export function rivals(items, odd) {
  const out = new Set();
  for (const k of KEYS) { const t = tally(items, k); items.forEach((it, i) => { if (i !== odd && t.get(it[k]) === 1) out.add(i); }); }
  for (const a of KEYS) for (const b of KEYS) {
    if (a === b) continue;
    const groups = new Map(); items.forEach((it, i) => { if (!groups.has(it[a])) groups.set(it[a], []); groups.get(it[a]).push(i); });
    if (groups.size < 2) continue;
    const breakers = [];
    let clean = true;
    for (const idx of groups.values()) {
      if (idx.length < 2) { clean = false; break; }
      const t = tally(idx.map(i => items[i]), b), top = Math.max(...t.values());
      const tops = [...t.entries()].filter(([, n]) => n === top);
      if (tops.length > 1) { clean = false; break; }
      for (const i of idx) if (items[i][b] !== tops[0][0]) breakers.push(i);
    }
    // the pairing a -> b holds for everything but ONE picture, and that picture is not the impostor: a second answer
    if (clean && breakers.length === 1 && breakers[0] !== odd) {
      const bvals = new Set(items.map(it => it[b]));
      if (bvals.size > 1) out.add(breakers[0]);
    }
  }
  return [...out];
}

/** One round's puzzle: { items: [encoded], odd, rule: { kind, a, b }, why } — retried until fair. */
export function makePuzzle(rng, level, n) {
  for (let tries = 0; tries < 400; tries++) {
    const p = level < 3 ? sameRule(rng, level, n) : pairRule(rng, n);
    if (!p) continue;
    const r = rivals(p.items, p.odd);
    if (r.length) continue;
    if (level === 3 && KEYS.some(k => tally(p.items, k).get(p.items[p.odd][k]) === 1)) continue;   // subtle: the impostor is ordinary on every single feature
    return { ...p, items: p.items.map(encode) };
  }
  throw new Error('no fair puzzle');                  // never happens for the shipped sizes (a test runs many seeds)
}
function base(rng, n, skip) {
  const cols = {}; for (const k of KEYS) if (!skip.includes(k)) cols[k] = spread(rng, k, n);
  return Array.from({ length: n }, (_, i) => Object.fromEntries(KEYS.filter(k => cols[k]).map(k => [k, cols[k][i]])));
}
function sameRule(rng, level, n) {
  const k = rng.pick(SAME[level]), items = base(rng, n, [k]);
  const v = rng.int(0, FEATURES[k].length - 1), odd = rng.int(0, n - 1);
  let w = rng.int(0, FEATURES[k].length - 2); if (w >= v) w++;
  items.forEach((it, i) => { it[k] = i === odd ? w : v; });
  const o = items[odd];
  const rule = `The rule: every picture ${said(k, v)}`;
  const why = `— but this one ${said(k, w)}.`;
  return { items, odd, rule: { kind: 'same', a: k }, text: rule, why, oddText: thing(o) };
}
function pairRule(rng, n) {
  const [a, b] = rng.pick(PAIRS);
  const groups = Math.min(rng.int(2, 3), FEATURES[a].length, FEATURES[b].length);
  const av = rng.shuffle(FEATURES[a].map((_, i) => i)).slice(0, groups), bv = rng.shuffle(FEATURES[b].map((_, i) => i)).slice(0, groups);
  // how many of each a-value: every group at least 2, the impostor's group at least 3 (it gives one away)
  const sizes = av.map(() => 2); sizes[0] = 3;
  let left = n - sizes.reduce((s, x) => s + x, 0); if (left < 0) return null;
  while (left-- > 0) sizes[rng.int(0, groups - 1)]++;
  const aCol = rng.shuffle(sizes.flatMap((s, g) => Array(s).fill(g)));
  const items = base(rng, n, [a, b]);
  items.forEach((it, i) => { it[a] = av[aCol[i]]; it[b] = bv[aCol[i]]; });
  const inFirst = items.map((it, i) => i).filter(i => aCol[i] === 0), odd = rng.pick(inFirst);
  items[odd][b] = bv[rng.int(1, groups - 1)];          // borrows another group's partner, so its b value is not unusual
  const tells = b === 'count' ? 'how many shapes' : `the ${NAME[b]}`;
  const text = `The rule: the ${NAME[a]} tells you ${tells}. ${av.map((x, g) => `${subject('every', a, x)} ${said(b, bv[g])}`).join(', ').replace(/^e/, 'E')}`;
  const o = items[odd];
  const why = `— but ${subject('this', a, o[a])} ${said(b, o[b])}.`;
  return { items, odd, rule: { kind: 'pair', a, b }, text, why, oddText: thing(o) };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid);
  const puzzles = LEVELS.map((lv, i) => makePuzzle(rng, lv, SIZES_N[i]));
  const score = Object.fromEntries(pids.map(p => [p, 0])), right = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'ready', round = -1, left = START_S, over = false;
  let picks = {}, order = [], gain = {};               // this round: pid -> tapped index; right taps in order; points won
  let len = ROUND_S;
  const next = () => { round++; phase = 'play'; left = len = ROUND_TIMES[round]; picks = {}; order = []; gain = {}; };
  const close = () => { phase = 'reveal'; left = REVEAL_S; for (const p of pids) gain[p] = gain[p] || 0; };
  return {
    init: () => ({ features: FEATURES, rounds: ROUNDS, points: POINTS, roundS: ROUND_S, times: ROUND_TIMES, levels: LEVELS }),
    act(pid, a, d) {
      if (phase !== 'play' || a !== 'tap' || !pids.includes(pid) || pid in picks) return;
      const P = puzzles[round];
      if (!Number.isInteger(d) || d < 0 || d >= P.items.length) return;
      picks[pid] = d;
      if (d === P.odd) { gain[pid] = POINTS[order.length] ?? 1; order.push(pid); score[pid] += gain[pid]; right[pid]++; }
      else gain[pid] = 0;
      if (pids.every(p => p in picks)) left = Math.min(left, 0.6);
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 0) return;
      if (phase === 'ready') next();
      else if (phase === 'play') close();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), round, scores: { ...score } };
      if (round >= 0 && phase !== 'end') { const P = puzzles[round]; g.items = P.items.join(','); g.in = pids.filter(p => p in picks); }
      if (phase === 'play' && left <= len * (1 - CLUE_AT)) g.clue = clueOf(puzzles[round].rule);
      if (phase === 'reveal') { const P = puzzles[round]; g.odd = P.odd; g.rule = P.text; g.why = P.why; g.keys = P.rule.kind === 'same' ? [P.rule.a] : [P.rule.a, P.rule.b]; g.picks = { ...picks }; g.gain = { ...gain }; g.first = order.slice(); }
      if (phase === 'end') { g.right = { ...right }; g.recap = puzzles.map(P => [P.items[P.odd], `${P.text} ${P.why}`]); }
      return g;
    },
    priv: pid => ({ pick: picks[pid] ?? null, ok: pid in picks ? picks[pid] === puzzles[round]?.odd : null, gain: gain[pid] ?? null }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(score[p])) groups.set(score[p], []); groups.get(score[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...score }, unit: meta.unit };
    },
  };
}
