// TILE FLIP RACE — a 7x7 board of tiles worth 1 (plain), 2 (star) or 3 (gem), with a few rocks nobody can take.
// Everyone starts on a home corner. Every 2 seconds the board FLIPS: each player may have picked one tile next to
// their own land (up, down, left or right) — a free tile, or one a rival owns (never a rival's home corner). All picks
// land together. Two players who picked the SAME tile bounce off each other and neither gets it.
// Score = the value of every tile you own + a bonus of 1 per tile in your biggest connected patch, so cutting a
// rival's land in two hurts them and joining yours up pays. Highest score after 20 flips wins.
// Solo: you race Tumbleweed, a CPU rival on the opposite corner (its picks come from the seed only).
// The value layout is mirrored both ways, so every corner starts with the same land around it.
export const meta = {
  id: 'tile-flip-race', title: 'Tile Flip Race', blurb: 'Grab the tiles next to yours, every two seconds, before your rivals do!',
  how: ['Tap a tile next to your land. Every 2 seconds everyone\'s pick flips together.', 'Stars are worth 2, gems 3. You can steal a rival\'s tile too.', 'Pick the same tile as someone else and you both bounce off.', 'Your biggest joined-up patch scores a bonus point per tile.'],
  kind: 'ui', min: 1, max: 4, seconds: 45, scoring: 'points', unit: 'points', tags: ['puzzle', 'action'], card: 'card-tile-flip-race', css: true,
};
export const W = 7, H = 7, TICK_S = 2, FLIPS = 20, START_S = 2, END_S = 3;
export const CPU = 'cpu', CPU_NAME = 'Tumbleweed';
const ROCK = -1;
// home corners in the order seats are given them: 2 players sit opposite each other
const CORNERS = [0, W * H - 1, W - 1, W * (H - 1)];

export const neighbours = i => { const x = i % W, y = (i / W) | 0, n = []; if (y > 0) n.push(i - W); if (x < W - 1) n.push(i + 1); if (y < H - 1) n.push(i + W); if (x > 0) n.push(i - 1); return n; };

/** A board: values (1-3, or -1 for a rock), mirrored left-right and top-bottom, every tile reachable, corners plain. */
export function makeBoard(rng) {
  for (let tries = 0; tries < 50; tries++) {
    const v = new Array(W * H).fill(1), hw = Math.ceil(W / 2), hh = Math.ceil(H / 2);
    const set = (x, y, k) => { for (const [a, b] of [[x, y], [W - 1 - x, y], [x, H - 1 - y], [W - 1 - x, H - 1 - y]]) v[b * W + a] = k; };
    const cells = []; for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) if (x + y > 1 && !(x === hw - 1 && y === hh - 1)) cells.push([x, y]);
    const pick = rng.shuffle(cells);
    set(...pick[0], 3);                                 // one gem a quarter (the middle row/column ones are shared)
    set(...pick[1], 2); set(...pick[2], 2);             // two stars a quarter
    set(...pick[3], ROCK);                              // one rock a quarter
    v[((H - 1) / 2) * W + (W - 1) / 2] = 3;             // the gem in the very middle
    // every non-rock tile must be reachable from a corner
    const seen = new Set([0]), q = [0];
    while (q.length) { const i = q.pop(); for (const j of neighbours(i)) if (v[j] !== ROCK && !seen.has(j)) { seen.add(j); q.push(j); } }
    if (v.every((k, i) => k === ROCK || seen.has(i))) return v;
  }
  throw new Error('no board');
}
/** Score of one owner: values owned + size of the biggest 4-connected patch. owner: array of who-index or -1. */
export function scoreOf(values, owner, who) {
  let sum = 0, best = 0; const seen = new Set();
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== who) continue;
    sum += values[i];
    if (seen.has(i)) continue;
    let n = 0; const q = [i]; seen.add(i);
    while (q.length) { const a = q.pop(); n++; for (const b of neighbours(a)) if (owner[b] === who && !seen.has(b)) { seen.add(b); q.push(b); } }
    best = Math.max(best, n);
  }
  return { tiles: sum, bonus: best, total: sum + best };
}
/** Settle one flip. picks: who-index -> tile. Returns { flips: [[tile, who, from]], bounced: [tile] } and changes `owner`. */
export function settleFlip(values, owner, homes, picks) {
  const ok = {};
  for (const [w, i] of Object.entries(picks)) {
    const who = +w;
    if (!Number.isInteger(i) || i < 0 || i >= owner.length || values[i] === ROCK || owner[i] === who || homes.includes(i)) continue;
    if (!neighbours(i).some(j => owner[j] === who)) continue;
    (ok[i] ||= []).push(who);
  }
  const flips = [], bounced = [];
  for (const [k, ws] of Object.entries(ok)) {
    const i = +k;
    if (ws.length > 1) { bounced.push(i); continue; }
    flips.push([i, ws[0], owner[i]]);
  }
  for (const [i, w] of flips) owner[i] = w;
  return { flips, bounced };
}
/** The CPU's pick: best value, steals count a little extra; ties and the easy CPU's slips come from the seed. */
export function cpuPick(values, owner, homes, who, rng, difficulty = 'normal') {
  const opts = [];
  for (let i = 0; i < owner.length; i++) {
    if (values[i] === ROCK || owner[i] === who || homes.includes(i) || !neighbours(i).some(j => owner[j] === who)) continue;
    const steal = owner[i] >= 0 ? 0.6 : 0, reach = neighbours(i).filter(j => owner[j] < 0 && values[j] !== ROCK).length * 0.15;
    opts.push({ i, s: values[i] + steal + reach + rng() * (difficulty === 'hard' ? 0.3 : 0.9) });
  }
  if (!opts.length) return null;
  if (difficulty === 'easy' && rng() < 0.45) return rng.pick(opts).i;
  opts.sort((a, b) => b.s - a.s); return opts[0].i;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const values = makeBoard(rng);
  // who: index into this list is what the owner array holds
  const used = new Set(players.map(p => p.seat));
  const who = players.map((p, k) => ({ pid: p.pid, seat: p.seat, home: CORNERS[k] }));
  if (solo) who.push({ pid: CPU, seat: [0, 1, 2, 3].find(s => !used.has(s)), home: CORNERS[1], cpu: true, name: CPU_NAME });
  const homes = who.map(w => w.home), owner = new Array(W * H).fill(-1);
  who.forEach((w, k) => { owner[w.home] = k; });
  const idx = new Map(who.map((w, k) => [w.pid, k]));
  let phase = 'ready', left = START_S, flip = 0, over = false, picks = {}, last = null;
  const totals = () => Object.fromEntries(who.map((w, k) => [w.pid, scoreOf(values, owner, k)]));

  function doFlip() {
    const p = { ...picks };
    if (solo) { const c = cpuPick(values, owner, homes, who.length - 1, rng, difficulty); if (c != null) p[who.length - 1] = c; }
    last = { n: flip, ...settleFlip(values, owner, homes, p) };
    picks = {}; flip++;
  }
  return {
    init: () => ({ w: W, h: H, values, who: who.map(w => ({ pid: w.pid, seat: w.seat, home: w.home, ...(w.cpu ? { cpu: true, name: w.name } : {}) })), flips: FLIPS, tick: TICK_S, solo }),
    act(pid, a, d) {
      if (a !== 'pick' || phase !== 'play' || !idx.has(pid)) return;
      const k = idx.get(pid);
      if (d === null || d === -1) { delete picks[k]; return; }
      if (!Number.isInteger(d) || d < 0 || d >= W * H || values[d] === ROCK || owner[d] === k || homes.includes(d)) return;
      if (!neighbours(d).some(j => owner[j] === k)) return;
      picks[k] = d;
    },
    step(dt) {
      if (over) return;
      left -= dt;
      if (phase === 'play') { if (left <= 1e-9) { doFlip(); if (flip >= FLIPS) { phase = 'end'; left = END_S; } else left += TICK_S; } return; }
      if (left > 0) return;
      if (phase === 'ready') { phase = 'play'; left = TICK_S; }
      else over = true;
    },
    state() {
      const t = totals();
      const g = { phase, flip, o: owner.map(k => k < 0 ? '.' : String(k)).join(''), scores: Object.fromEntries(Object.entries(t).map(([k, s]) => [k, s.total])), bonus: Object.fromEntries(Object.entries(t).map(([k, s]) => [k, s.bonus])) };
      g.left = phase === 'play' ? Math.ceil((FLIPS - flip - 1) * TICK_S + left) : Math.max(0, Math.ceil(left));
      if (phase === 'play') g.in = pids.filter(p => picks[idx.get(p)] != null);
      if (last) g.last = last;
      return g;
    },
    priv: pid => ({ pick: idx.has(pid) ? picks[idx.get(pid)] ?? null : null }),
    get over() { return over; },
    result() {
      const t = totals(), groups = new Map();
      for (const p of pids) { const s = t[p].total; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(p); }
      const scores = Object.fromEntries(pids.map(p => [p, t[p].total]));
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
