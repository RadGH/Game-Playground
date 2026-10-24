// GONE MISSING! — a prize stall's shelves, full of toys, are shown for a few seconds. The shutter rattles down, and
// when it goes up again some prizes have VANISHED (a puff of sparkles where each one was). Under the shelf is a tray
// of prizes: the missing ones mixed with look-alike prizes that were never on the shelf. Tap the ones that went
// missing. You get exactly as many taps as there are missing prizes, and every tap is final: right = 3 points, and the
// first player to find a prize gets +1 for it. Five shelves, each bigger or with more gone than the last.
// This is RECALL memory (which things were there?), not where-things-were: on Normal and Tricky the prizes that are
// left are shuffled round the shelf when it comes back, so the gaps do not give the answer away. Family leaves the
// prizes where they were with a dusty outline in each gap... the outline does not say WHICH prize.
// Difficulty: shelf sizes, how many go missing, how long you look, how many look-alikes are in the tray.
// Alone: the same, scored out of the most you could get, with medals. Everything comes from the seed; the missing
// prizes are never in the state before the reveal (the tray is, but it holds the look-alikes too).
import { placeOrder } from '../toss-kit.js';
import { makeRng } from '../../shared/rng.js';

export const PRIZES = 24;                          // memory-icons.js: 24 prizes (24 Halloween ones)
export const meta = {
  id: 'prize-shelf', title: 'Gone Missing!', blurb: 'Remember the prize shelf — then spot which prizes vanished!',
  how: ['Look at the prize shelf. Remember every prize!', 'The shutter drops, and some prizes vanish.', 'Tap the missing ones in the tray. Right = 3, first to find it +1.'],
  kind: 'ui', min: 1, max: 4, seconds: 78, scoring: 'points', unit: 'points', tags: ['puzzle'], card: 'card-prize-shelf', css: true,
  controls: { a: 'Pick' },
};
export const READY_S = 2, SHUT_S = 1.1, REVEAL_S = 2.4, END_S = 2.6, RIGHT = 3, FIRST = 1;
export const LEVELS = {
  easy: { sizes: [6, 6, 8, 8, 8], gone: [1, 1, 2, 2, 2], study: 4.6, pick: 6, tray: 5, shuffle: false },
  normal: { sizes: [6, 8, 8, 9, 9], gone: [1, 2, 2, 3, 3], study: 4.0, pick: 6.5, tray: 6, shuffle: true },
  hard: { sizes: [8, 9, 9, 12, 12], gone: [2, 2, 3, 3, 4], study: 3.6, pick: 6.5, tray: 8, shuffle: true },
};
export const MEDAL_SHARE = [0.5, 0.75, 0.95];
export const maxScore = L => L.gone.reduce((a, b) => a + b, 0) * RIGHT;
export const medalsFor = L => MEDAL_SHARE.map(f => Math.round(maxScore(L) * f));
/** One shelf: the prizes on it, which slots vanish, what is left (in its new places) and the tray. */
export function makeShelf(rng, L, r) {
  const all = rng.shuffle([...Array(PRIZES).keys()]), size = L.sizes[r], k = L.gone[r];
  const shelf = all.slice(0, size), decoys = all.slice(size, size + L.tray - k);
  const goneSlots = rng.shuffle([...Array(size).keys()]).slice(0, k).sort((a, b) => a - b);
  const gone = goneSlots.map(i => shelf[i]), kept = shelf.filter((_, i) => !goneSlots.includes(i));
  // what the shelf looks like afterwards: Family = same places with gaps (-1); else the kept prizes shuffled, closed up
  const rest = L.shuffle ? rng.shuffle(kept) : shelf.map((p, i) => (goneSlots.includes(i) ? -1 : p));
  const tray = rng.shuffle([...gone, ...decoys]);
  return { shelf, gone, rest, tray };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1, R = L.sizes.length;
  const shelves = Array.from({ length: R }, (_, r) => makeShelf(rng, L, r));
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, right: 0, picks: [] }]));
  let phase = 'ready', round = -1, left = READY_S, over = false, found = new Map();
  const events = [];
  const sh = () => shelves[round];
  function reveal() { phase = 'reveal'; left = REVEAL_S; events.push({ e: 'reveal', round }); }
  return {
    events,
    init: () => ({ rounds: R, solo, medals: medalsFor(L), max: maxScore(L), shuffle: L.shuffle }),
    act(pid, a, d) {
      if (a !== 'pick' || !S[pid] || phase !== 'pick' || over) return;
      if (!Number.isInteger(d) || d < 0 || d >= sh().tray.length) return;
      const s = S[pid]; if (s.picks.includes(d) || s.picks.length >= sh().gone.length) return;
      s.picks.push(d);
      const prize = sh().tray[d], right = sh().gone.includes(prize);
      if (right) {
        let pts = RIGHT; s.right++;
        if (!solo && !found.has(prize)) { found.set(prize, pid); pts += FIRST; }
        s.pts += pts; events.push({ e: 'right', pid, i: d, pts, first: pts > RIGHT });
      } else events.push({ e: 'wrong', pid, i: d });
      if (pids.every(p => S[p].picks.length >= sh().gone.length)) reveal();
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready' || phase === 'reveal') {
        if (round + 1 >= R) { phase = 'end'; left = END_S; events.push({ e: 'end' }); return; }
        round++; phase = 'study'; left = L.study; found = new Map(); for (const p of pids) S[p].picks = [];
        events.push({ e: 'study', round });
      } else if (phase === 'study') { phase = 'shut'; left = SHUT_S; events.push({ e: 'shut', round }); }
      else if (phase === 'shut') { phase = 'pick'; left = L.pick; events.push({ e: 'pick', round, need: sh().gone.length }); }
      else if (phase === 'pick') reveal();
      else if (phase === 'end') over = true;
    },
    state() {
      const sc = {}, np = {};
      for (const p of pids) { sc[p] = S[p].pts; np[p] = S[p].picks.length; }
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), sc };
      if (round >= 0 && phase !== 'end') {
        const s = sh(); g.size = s.shelf.length; g.need = s.gone.length;
        if (phase === 'study') g.shelf = s.shelf;
        if (phase === 'pick' || phase === 'reveal') { g.rest = s.rest; g.tray = s.tray; g.np = np; }
        if (phase === 'reveal') { g.shelf = s.shelf; g.gone = s.gone; g.picks = Object.fromEntries(pids.map(p => [p, S[p].picks])); }
      }
      return g;
    },
    priv: pid => ({ round, picks: S[pid]?.picks || [] }),
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts])), m = medalsFor(L);
      return { order: placeOrder(pids, p => S[p].pts), scores, unit: meta.unit, found: Object.fromEntries(pids.map(p => [p, S[p].right])),
        ...(solo ? { medal: m.filter(x => S[pids[0]].pts >= x).length } : {}) };
    },
    get _phase() { return phase; }, get _round() { return round; }, _shelves: shelves, _stats: S, _level: L,
  };
}

/** A player that knows only what it SAW on the shelf. `keep` = the share of the shelf it takes in (0-1), `gap` =
 *  seconds before each tap. It taps the tray prizes it remembers being on the shelf, then guesses. Own rng. */
export function shelfBot(g, pid, { keep = 1, gap = 0.6, seed = 1 } = {}) {
  const r = makeRng(seed * 6151 + pid * 9973); let seen = null, seenR = -1, wait = 0, guessR = -1, order = [];
  return () => {
    const s = g.state();
    if (s.phase === 'study' && seenR !== s.round) { seenR = s.round; seen = new Set(s.shelf.filter(() => r() < keep)); }
    if (s.phase !== 'pick' || (s.np?.[pid] ?? 0) >= s.need) { wait = 0; return; }
    if (guessR !== s.round) {
      guessR = s.round;
      const known = s.tray.map((p, i) => [p, i]).filter(([p]) => seen?.has(p)).map(([, i]) => i);
      order = [...known, ...r.shuffle(s.tray.map((_, i) => i).filter(i => !known.includes(i)))];
    }
    wait += 0.05; if (wait < gap) return; wait = 0;
    const i = order.shift(); if (i != null) g.act(pid, 'pick', i);
  };
}
