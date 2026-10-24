// PAIR PANIC — the classic pairs game with no turns. ONE table of face-down cards is shared by everybody, and
// everybody flips at the same time on their own phone. Each new table is shown face up for a short PEEK, then every
// card turns over. Tap a card and it flips for EVERYONE (with your colour round it), tap a second: the same picture
// and the pair is yours; two different pictures stay up for a moment (everyone sees them, so watch the others' flips
// too) and flip back, and you wait that moment out. A card you leave up on its own flips back after a few seconds.
// SNATCH: your second card may be one a rival is holding up on its own — if it matches yours, the pair is yours. (It
// also means the last few cards of a table can never jam with every player holding one up.)
// A pair is 2 points, a streak of pairs without a miss adds +1 on the 2nd and +2 from the 3rd, and taking the LAST
// pair of a table is +1. A cleared table deals a new one (new pictures, new places) with a new peek, until the bell.
// Difficulty: Family = 4x4 (8 pairs) and a 3 s peek; Normal = 4x5 and 2.2 s; Tricky = 4x6 and 1.4 s, misses stay up
// a shorter time. Solo: the same table to yourself, a score attack with medals. Everything comes from the seed.
import { placeOrder } from '../toss-kit.js';
import { makeRng } from '../../shared/rng.js';

export const PICS = 24;                         // memory-icons.js has 24 prizes (and 24 Halloween ones)
export const meta = {
  id: 'pair-panic', title: 'Pair Panic', blurb: 'Everyone flips at once — find the matching pairs before your friends do!',
  how: ['Peek at the table, then every card turns face down.', 'Tap two cards: a match is yours, a miss flips back.', 'No turns! Watch the others\' flips — and SNATCH a card a friend holds up.'],
  kind: 'ui', min: 1, max: 4, seconds: 62, scoring: 'points', unit: 'points', tags: ['puzzle'], card: 'card-pair-panic', css: true,
  controls: { a: 'Flip' },
};
export const READY_S = 2, DEAL_S = 1.4, END_S = 3, PAIR = 2, LAST = 1;
export const LEVELS = {
  easy: { cols: 4, rows: 4, peek: 3.0, miss: 1.1, hold: 3 },
  normal: { cols: 4, rows: 5, peek: 2.2, miss: 0.95, hold: 2.6 },
  hard: { cols: 4, rows: 6, peek: 1.4, miss: 0.8, hold: 2.2 },
};
export const MEDALS = { easy: [20, 40, 64], normal: [20, 40, 64], hard: [20, 40, 64] };
export const streakBonus = s => (s >= 3 ? 2 : s === 2 ? 1 : 0);
/** A table: `n` cards, n/2 pictures each twice, shuffled. */
export function deal(rng, n) {
  const pics = rng.shuffle([...Array(PICS).keys()]).slice(0, n / 2);
  return rng.shuffle([...pics, ...pics]);
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, n = L.cols * L.rows, pids = players.map(p => p.pid), solo = pids.length === 1;
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, pairs: 0, streak: 0, best: 0, up: [], lock: 0, hold: 0 }]));
  let phase = 'ready', left = READY_S, el = 0, over = false, board = -1, pic = [], st = [], who = [];
  const events = [];
  const stop = () => meta.seconds - END_S - 0.5;  // play stops here, whatever the table looks like
  function newTable() {
    board++; pic = deal(rng, n); st = new Array(n).fill(0); who = new Array(n).fill(0);
    for (const p of pids) Object.assign(S[p], { up: [], lock: 0, hold: 0 });
    phase = 'peek'; left = L.peek; events.push({ e: 'deal', b: board });
  }
  const down = (s) => { for (const i of s.up) if (st[i] === 1) { st[i] = 0; who[i] = 0; } s.up = []; s.lock = 0; s.hold = 0; };
  function end() { phase = 'end'; left = END_S; for (const p of pids) down(S[p]); events.push({ e: 'end' }); }
  return {
    events,
    init: () => ({ cols: L.cols, rows: L.rows, peek: L.peek, solo, medals: MEDALS[difficulty] || MEDALS.normal }),
    act(pid, a, d) {
      if (a !== 'flip' || !S[pid] || phase !== 'play' || over) return;
      if (!Number.isInteger(d) || d < 0 || d >= n) return;
      const s = S[pid]; if (s.lock > 0 || s.up.length >= 2) return;
      if (st[d] === 1) {                       // a SNATCH: your second card may be one a rival holds up on its own
        const o = S[who[d]]; if (!s.up.length || who[d] === pid || o.lock > 0 || o.up.length !== 1) return;
        const [i] = s.up;
        if (pic[i] !== pic[d]) { s.streak = 0; s.up = [i]; s.lock = L.miss; s.hold = 0; events.push({ e: 'miss', pid, i, j: d, snatch: true }); return; }
        const from = who[d]; o.up = []; o.hold = 0; s.up = [i, d]; who[d] = pid;
        events.push({ e: 'snatch', pid, from, i: d });
      } else if (st[d] !== 0) return;
      else { st[d] = 1; who[d] = pid; s.up.push(d); events.push({ e: 'flip', i: d, pic: pic[d], pid }); }
      if (s.up.length === 1) { s.hold = L.hold; return; }
      const [i, j] = s.up;
      if (pic[i] === pic[j]) {
        st[i] = st[j] = 2; s.up = []; s.hold = 0; s.streak++; s.best = Math.max(s.best, s.streak); s.pairs++;
        const bonus = streakBonus(s.streak), last = st.every(v => v === 2) ? LAST : 0;
        s.pts += PAIR + bonus + last;
        events.push({ e: 'pair', pid, i, j, pic: pic[i], streak: s.streak, pts: PAIR + bonus + last, last: !!last });
        if (last) { phase = 'deal'; left = DEAL_S; for (const p of pids) down(S[p]); }
      } else { s.streak = 0; s.lock = L.miss; s.hold = 0; events.push({ e: 'miss', pid, i, j }); }
    },
    step(dt) {
      if (over) return;
      el += dt; left -= dt;
      if (phase === 'play') {
        for (const p of pids) {
          const s = S[p];
          if (s.lock > 0) { s.lock -= dt; if (s.lock <= 1e-9) down(s); }
          else if (s.up.length === 1) { s.hold -= dt; if (s.hold <= 1e-9) { events.push({ e: 'drop', pid: p, i: s.up[0] }); down(s); } }
        }
        if (el >= stop()) end();
        return;
      }
      if (left > 1e-9) return;
      if (phase === 'ready') newTable();
      else if (phase === 'peek') { phase = 'play'; left = 0; events.push({ e: 'go', b: board }); }
      else if (phase === 'deal') { if (el + L.peek + 4 >= stop()) end(); else newTable(); }
      else if (phase === 'end') over = true;
    },
    state() {
      const sc = {}, streak = {};
      for (const p of pids) { sc[p] = S[p].pts; streak[p] = S[p].streak; }
      const g = { phase, b: board, left: Math.max(0, Math.ceil(phase === 'play' ? stop() - el : left)), sc, streak };
      if (phase === 'peek') g.peek = pic;
      else if (phase === 'play' || phase === 'deal') {
        g.up = []; g.gone = [];
        for (let i = 0; i < n; i++) { if (st[i] === 1) g.up.push([i, pic[i], who[i]]); else if (st[i] === 2) g.gone.push(i); }
        g.lock = pids.filter(p => S[p].lock > 0);
      } else if (phase === 'end') { g.pairs = Object.fromEntries(pids.map(p => [p, S[p].pairs])); g.best = Object.fromEntries(pids.map(p => [p, S[p].best])); }
      return g;
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts])), m = MEDALS[difficulty] || MEDALS.normal;
      return { order: placeOrder(pids, p => S[p].pts), scores, unit: meta.unit, pairs: Object.fromEntries(pids.map(p => [p, S[p].pairs])),
        ...(solo ? { medal: m.filter(x => S[pids[0]].pts >= x).length } : {}) };
    },
    get _phase() { return phase; }, get _pic() { return pic; }, get _st() { return st; }, _stats: S, _level: L, _n: n,
  };
}

/** A player that only knows what it has SEEN (the peek and every card anyone flipped, from the public state).
 *  `gap` = seconds between its taps; `keep` = how much of the peek it takes in (0-1); `forget` = the chance a second
 *  that it forgets each card it knows. Its own rng, so it never moves the game's. Call the returned function once a step. */
export function pairBot(g, pid, { gap = 0.45, keep = 1, forget = 0, seed = 1 } = {}) {
  const r = makeRng(seed * 7919 + pid * 104729), mem = new Map(); let wait = 0, b = -1, peeked = -1;
  return () => {
    const s = g.state();
    if (s.b !== b) { b = s.b; mem.clear(); }
    if (s.phase === 'peek' && peeked !== s.b) { peeked = s.b; s.peek.forEach((p, i) => { if (r() < keep) mem.set(i, p); }); }
    if (s.phase !== 'play') { wait = 0; return; }
    for (const [i, p] of s.up) mem.set(i, p);
    for (const i of s.gone) mem.delete(i);
    if (forget > 0) for (const i of [...mem.keys()]) if (r() < forget * 0.05) mem.delete(i);
    if (s.lock.includes(pid)) return;
    wait += 0.05; if (wait < gap) return; wait = 0;
    const mine = s.up.filter(u => u[2] === pid), busy = new Set(s.up.map(u => u[0])), gone = new Set(s.gone);
    const free = [...Array(g._n).keys()].filter(i => !busy.has(i) && !gone.has(i));
    const unknown = free.filter(i => !mem.has(i)), pickUnknown = () => (unknown.length ? unknown : free)[Math.floor(r() * (unknown.length || free.length))];
    if (mine.length === 1) {
      const want = mine[0][1], held = s.up.filter(u => u[2] !== pid && u[1] === want && !s.lock.includes(u[2]) && s.up.filter(v => v[2] === u[2]).length === 1);
      const hit = held[0]?.[0] ?? free.find(i => mem.get(i) === want);
      if (hit == null && !free.length) return;
      g.act(pid, 'flip', hit ?? pickUnknown()); return;
    }
    if (mine.length || !free.length) return;
    const byPic = new Map();
    for (const i of free) if (mem.has(i)) { const p = mem.get(i); if (byPic.has(p)) { g.act(pid, 'flip', byPic.get(p)); return; } byPic.set(p, i); }
    g.act(pid, 'flip', pickUnknown());
  };
}
