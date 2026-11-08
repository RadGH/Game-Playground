// PRESENT PEEK (Winter Fair only) — six presents, one at a time. Each hides a toy under wrapping paper that tears off
// strip by strip over eight seconds (the strips go in a seeded order, sometimes across, sometimes down). Four answers
// sit under the present: tap the toy you think it is. Right = up to 10 points (the earlier, the more: 10 x the share
// of the eight seconds still to go, at least 1) and +2 for the first right answer of the round; wrong = locked out
// for that present. Nobody can answer before the first strip comes off. A round ends when everyone has answered.
// Alone you race Pip the elf, who answers at a seeded moment and is sometimes wrong (better on hard). With the room's
// "Rival when alone" off (`rivals: false`) a lone player has no Pip: same presents, same points, no first-right bonus.
//
// The picture: the browser has to draw it to unwrap it, so the state carries it only as an opaque key `k`
// (`picOf(k, round, salt)`), never as its plain number; the four answers `opts` are plain picture numbers; the right
// answer `a` appears only once the round is over.
export const meta = {
  id: 'present-peek', title: 'Present Peek', blurb: 'Guess the toy under the wrapping paper before it is all torn off!',
  how: ['A present unwraps strip by strip.', 'Tap the toy you think is inside: sooner = more points.', 'A wrong guess locks you out for that present.', 'First right answer gets +2!'],
  kind: 'ui', min: 1, max: 4, seconds: 74, scoring: 'points', unit: 'points', tags: ['puzzle', 'holiday'], season: 'winter', card: 'card-present-peek', css: true, rival: true,
};
export const PICTURES = [
  { id: 'teddy', name: 'Teddy bear' }, { id: 'drum', name: 'Drum' }, { id: 'rocket', name: 'Rocket' }, { id: 'kite', name: 'Kite' },
  { id: 'boot', name: 'Boot' }, { id: 'guitar', name: 'Guitar' }, { id: 'train', name: 'Toy train' }, { id: 'robot', name: 'Robot' },
  { id: 'boat', name: 'Sailboat' }, { id: 'umbrella', name: 'Umbrella' }, { id: 'trumpet', name: 'Trumpet' }, { id: 'duck', name: 'Rubber duck' },
  { id: 'yoyo', name: 'Yo-yo' }, { id: 'ball', name: 'Beach ball' }, { id: 'cupcake', name: 'Cupcake' }, { id: 'mitten', name: 'Mitten' },
  { id: 'sled', name: 'Sled' }, { id: 'globe', name: 'Snow globe' }, { id: 'top', name: 'Spinning top' }, { id: 'teapot', name: 'Teapot' },
];
export const ROUNDS = 6, START_S = 2, PEEK_S = 8, ANS_S = 2.6, END_S = 3;
export const STRIPS = 8, FIRST_S = 0.6, STRIP_S = 0.9, MAX_PTS = 10, FIRST_BONUS = 2;
export const CPU = 'cpu', CPU_NAME = 'Pip';
/** Pip the elf: answers somewhere in `at` seconds, right with chance `right`. */
export const LEVELS = { easy: { at: [3.6, 6.6], right: 0.6 }, normal: { at: [2.6, 5.6], right: 0.75 }, hard: { at: [1.8, 4.4], right: 0.88 } };
const N = PICTURES.length;

/** Strips torn off by time t (0 before the first one, all of them a little before the end). */
export const stripsOff = t => (t < FIRST_S ? 0 : Math.min(STRIPS, 1 + Math.floor((t - FIRST_S) / STRIP_S + 1e-9)));
/** Points for a right answer at time t. */
export const pointsAt = t => Math.max(1, Math.round(MAX_PTS * (1 - t / PEEK_S)));
/** The picture's key for a round: shifted by 1-19 places (never 0, so the key is never the picture's own number). */
const shift = (round, salt) => 1 + ((salt + round * 7) % (N - 1));
export const keyOf = (pic, round, salt) => (pic + shift(round, salt)) % N;
export const picOf = (k, round, salt) => (k - shift(round, salt) + N) % N;

export function create({ rng, players, difficulty = 'normal', rivals }) {
  const L = LEVELS[difficulty] || LEVELS.normal;
  const pids = players.map(p => p.pid), solo = pids.length === 1 && rivals !== false, ids = solo ? [...pids, CPU] : pids.slice();
  const salt = rng.int(0, N - 1), pics = rng.shuffle([...Array(N).keys()]).slice(0, ROUNDS);
  const rounds = pics.map(pic => {
    const opts = rng.shuffle([pic, ...rng.shuffle([...Array(N).keys()].filter(i => i !== pic)).slice(0, 3)]);
    return { pic, opts, a: opts.indexOf(pic), so: rng.shuffle([...Array(STRIPS).keys()]).join(''), o: rng.chance(0.5) ? 'v' : 'h' };
  });
  const cpuRng = rng.fork();
  const score = Object.fromEntries(ids.map(i => [i, 0])), rightN = Object.fromEntries(ids.map(i => [i, 0]));
  let phase = 'ready', r = -1, left = START_S, el = 0, over = false;
  let picks = {}, gain = {}, first = null, cpuPlan = null;

  function begin() {
    r++; phase = 'peek'; el = 0; left = PEEK_S; picks = {}; gain = {}; first = null;
    if (solo) { const R = rounds[r]; const right = cpuRng.chance(L.right); cpuPlan = { at: cpuRng.range(L.at[0], L.at[1]), pick: right ? R.a : cpuRng.pick([0, 1, 2, 3].filter(i => i !== R.a)) }; }
  }
  function answer(id, i) {
    const R = rounds[r]; picks[id] = i;
    if (i === R.a) { const pts = pointsAt(el) + (first == null && ids.length > 1 ? FIRST_BONUS : 0); if (first == null) first = id; gain[id] = pts; score[id] += pts; rightN[id]++; }
    else gain[id] = 0;
    if (ids.every(x => x in picks)) close();
  }
  function close() { for (const x of ids) if (!(x in gain)) gain[x] = 0; phase = 'ans'; left = ANS_S; }

  return {
    init: () => ({ rounds: ROUNDS, peek: PEEK_S, strips: STRIPS, first: FIRST_S, gap: STRIP_S, salt, solo, cpu: solo ? { id: CPU, name: CPU_NAME } : null, d: difficulty }),
    act(pid, a, d) {
      if (a !== 'pick' || phase !== 'peek' || !pids.includes(pid) || pid in picks || over) return;
      if (!Number.isInteger(d) || d < 0 || d > 3 || el < FIRST_S) return;
      answer(pid, d);
    },
    step(dt) {
      if (over) return;
      left -= dt;
      if (phase === 'peek') {
        el += dt;
        if (solo && cpuPlan && !(CPU in picks) && el >= cpuPlan.at) answer(CPU, cpuPlan.pick);
        if (phase === 'peek' && el >= PEEK_S) close();
        return;
      }
      if (left > 1e-9) return;
      if (phase === 'ready') begin();
      else if (phase === 'ans') { if (r + 1 < ROUNDS) begin(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), r, s: { ...score } };
      if (phase === 'peek' || phase === 'ans') {
        const R = rounds[r];
        g.k = keyOf(R.pic, r, salt); g.opts = R.opts; g.so = R.so; g.o = R.o;
        g.off = phase === 'peek' ? stripsOff(el) : STRIPS; g.in = ids.filter(x => x in picks);
      }
      if (phase === 'ans') { g.a = rounds[r].a; g.pk = { ...picks }; g.gn = { ...gain }; g.f = first; }
      if (phase === 'end') g.right = { ...rightN };
      return g;
    },
    priv: pid => ({ pick: phase === 'peek' || phase === 'ans' ? picks[pid] ?? null : null }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { const k = score[p] * 100 + rightN[p]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      const out = { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: Object.fromEntries(pids.map(p => [p, score[p]])), unit: meta.unit };
      if (solo) { out.cpu = score[CPU]; out.beat = score[pids[0]] > score[CPU]; }
      return out;
    },
    get _phase() { return phase; }, get _el() { return el; }, _rounds: rounds,
  };
}

/** A test/practice bot: once `at` strips are off, taps the right toy with chance `right` (else a wrong one). It knows
 *  the toy the way a player does: from the picture (the key in the state). Call once per 50 ms step. */
export function peekBot(g, pid, { at = 2, right = 1, seed = 1 } = {}) {
  let done = -1, n = seed * 31 + pid * 17;
  const salt = g.init().salt;
  return () => {
    const s = g.state(); if (s.phase !== 'peek' || done === s.r || s.off < at) return;
    done = s.r; n = (n * 1103515245 + 12345) % 2147483648;
    const a = s.opts.indexOf(picOf(s.k, s.r, salt));
    g.act(pid, 'pick', (n / 2147483648) < right ? a : (a + 1 + (n % 3)) % 4);
  };
}
