// SAFECRACKER — every player cracks their own row of safes (same kind of lock for everyone, different numbers, so
// nobody can copy a neighbour's phone). Punch in a guess at the code; the safe answers with two counts:
//   RIGHT  how many numbers are right AND in the right place
//   MOVED  how many more are in the code but in a different place
// Work it out within the tries the safe allows. Out of tries: the safe jams (a few seconds' lockout) and you get a
// fresh code for it. The risky shortcut: LISTEN to the tumblers — it shows you one number in its place, but locks you
// out for a moment and knocks points off what this safe pays. Round 10 (report #24, "Listening is OP"): it used to work
// up to len-1 times a safe from the very first second, for 3 points each, so listening twice and guessing the rest beat
// every honest player. Now it is ONCE a safe, only after LISTEN_AFTER guesses of your own, costs LISTEN_COST (6) and
// locks you out LISTEN_S (4 s) — a choice to make when you are stuck, not the way to play. Safes get harder (more digits, then repeats allowed);
// the first player to open each safe gets a bonus. Alone you race Nimble Nell, a CPU safecracker who opens at set times.
export const meta = {
  id: 'safecracker', title: 'Safecracker', blurb: 'Crack the codes from the clues before anyone else!',
  how: ['Punch in a guess. RIGHT = right number, right place. MOVED = in the code, wrong place.', 'Crack it before your tries run out, or the safe jams.', 'Stuck? After 2 guesses you may LISTEN once a safe: one number, but it costs 6 points and 4 s.', 'First to open each safe gets a bonus!'],
  kind: 'ui', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'points', tags: ['puzzle'], card: 'card-safecracker', css: true,
};
export const LEVELS = [
  { len: 3, sym: 5, rep: false, tries: 7, pts: 10 },
  { len: 4, sym: 6, rep: false, tries: 8, pts: 15 },
  { len: 4, sym: 6, rep: true, tries: 9, pts: 20 },
  { len: 4, sym: 6, rep: true, tries: 8, pts: 25 },
  { len: 5, sym: 6, rep: true, tries: 10, pts: 30 },
];
export const GAME_S = 60, FIRST_BONUS = 5, TRY_BONUS = 1, LISTEN_COST = 6, LISTEN_S = 4, LISTEN_MAX = 1, LISTEN_AFTER = 2, JAM_S = 3, MIN_PAY = 3;
export const CPU_NAME = 'Nimble Nell';
export const CPU_TIMES = [[9, 14], [11, 16], [13, 19], [15, 22], [18, 26]];      // seconds to open each safe, rolled per game

/** A code for a level: `len` numbers from 1..sym (no repeats unless the level allows them). */
export function makeCode(rng, L) {
  if (L.rep) return Array.from({ length: L.len }, () => rng.int(1, L.sym));
  return rng.shuffle([...Array(L.sym).keys()].map(i => i + 1)).slice(0, L.len);
}
/** The safe's answer to a guess: { hit: right number right place, near: right number wrong place }. */
export function score(code, guess) {
  let hit = 0; const a = {}, b = {};
  for (let i = 0; i < code.length; i++) { if (code[i] === guess[i]) hit++; else { a[code[i]] = (a[code[i]] || 0) + 1; b[guess[i]] = (b[guess[i]] || 0) + 1; } }
  let near = 0; for (const k in b) near += Math.min(b[k], a[k] || 0);
  return { hit, near };
}
/** What a safe pays when opened. */
export const payOf = (L, triesLeft, listens, first) => Math.max(MIN_PAY, L.pts + triesLeft * TRY_BONUS - listens * LISTEN_COST) + (first ? FIRST_BONUS : 0);

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const me = new Map(pids.map(p => [p, { lvl: 0, code: null, guesses: [], seen: {}, listens: 0, lock: 0, jams: 0, pts: 0, opened: [] }]));
  const firsts = LEVELS.map(() => null);                    // who opened each safe first: pid or 'cpu'
  const events = [];
  let left = GAME_S, over = false, t = 0;
  const cpu = solo ? { at: [], lvl: 0, pts: 0 } : null;
  if (cpu) { let s = 0; for (const [a, b] of CPU_TIMES) { s += rng.range(a, b); cpu.at.push(s); } }
  for (const p of me.values()) p.code = makeCode(rng, LEVELS[0]);
  const L = p => LEVELS[p.lvl];
  function newSafe(p) { p.code = makeCode(rng, L(p)); p.guesses = []; p.seen = {}; p.listens = 0; }
  function open(pid, p) {
    const lv = p.lvl, first = firsts[lv] == null, pay = payOf(L(p), L(p).tries - p.guesses.length, p.listens, first);
    if (first) firsts[lv] = pid;
    p.pts += pay; p.opened.push({ lvl: lv, t: Math.round(t * 10) / 10, pay });
    events.push({ e: 'open', pid, lvl: lv, pay, first });
    p.lvl++;
    if (p.lvl < LEVELS.length) newSafe(p); else { p.code = null; p.guesses = []; p.seen = {}; }
    if ([...me.values()].every(q => q.lvl >= LEVELS.length)) over = true;
  }
  return {
    events,
    init: () => ({ levels: LEVELS, seconds: GAME_S, solo, cpu: solo ? CPU_NAME : null, bonus: FIRST_BONUS, listenCost: LISTEN_COST, listenS: LISTEN_S, listenMax: LISTEN_MAX, listenAfter: LISTEN_AFTER, jamS: JAM_S }),
    act(pid, a, d) {
      const p = me.get(pid); if (over || !p || p.lvl >= LEVELS.length || p.lock > 0) return;
      const lv = L(p);
      if (a === 'guess') {
        if (!Array.isArray(d) || d.length !== lv.len || !d.every(v => Number.isInteger(v) && v >= 1 && v <= lv.sym)) return;
        const r = score(p.code, d);
        p.guesses.push({ g: d.slice(), ...r });
        if (r.hit === lv.len) return open(pid, p);
        if (p.guesses.length >= lv.tries) {                  // jammed: lock out, then a fresh code for this safe
          p.jams++; p.lock = JAM_S; events.push({ e: 'jam', pid });
          p.jammed = p.code; newSafe(p);
        }
      } else if (a === 'listen') {
        if (p.listens >= Math.min(LISTEN_MAX, lv.len - 1) || p.guesses.length < LISTEN_AFTER) return;
        const hidden = [...Array(lv.len).keys()].filter(i => !(i in p.seen)); if (!hidden.length) return;
        const i = rng.pick(hidden); p.seen[i] = p.code[i]; p.listens++; p.lock = LISTEN_S;
        events.push({ e: 'listen', pid });
      }
    },
    step(dt) {
      if (over) return;
      t += dt; left -= dt;
      if (left <= 0) { left = 0; over = true; return; }
      for (const p of me.values()) if (p.lock > 0) { p.lock = Math.max(0, p.lock - dt); if (!p.lock) p.jammed = null; }
      if (cpu && cpu.lvl < LEVELS.length && t >= cpu.at[cpu.lvl]) {
        const lv = cpu.lvl, first = firsts[lv] == null; if (first) firsts[lv] = 'cpu';
        const pay = payOf(LEVELS[lv], 1, 0, first); cpu.pts += pay; cpu.lvl++;
        events.push({ e: 'open', pid: 'cpu', lvl: lv, pay, first });
      }
    },
    state: () => ({
      left: Math.max(0, Math.ceil(left)), firsts,
      p: Object.fromEntries([...me].map(([pid, p]) => [pid, { lvl: p.lvl, n: p.guesses.length, pegs: p.guesses.map(x => x.hit * 10 + x.near), pts: p.pts, lock: p.lock > 0 ? Math.ceil(p.lock) : 0, listens: p.listens, opened: p.opened.length }])),
      ...(cpu ? { cpu: { lvl: cpu.lvl, pts: cpu.pts } } : {}),
    }),
    priv(pid) {
      const p = me.get(pid); if (!p) return {};
      return { lvl: p.lvl, guesses: p.guesses.map(x => [x.g.join(''), x.hit, x.near]), seen: p.seen, lock: p.lock > 0, jammed: p.jammed ? p.jammed.join('') : null };
    },
    get over() { return over; },
    result() {
      const sorted = pids.slice().sort((a, b) => me.get(b).pts - me.get(a).pts || me.get(b).lvl - me.get(a).lvl), groups = new Map();
      for (const pid of sorted) { const k = `${me.get(pid).pts}|${me.get(pid).lvl}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(pid); }
      return { order: [...groups.values()], scores: Object.fromEntries(pids.map(p => [p, me.get(p).pts])), unit: meta.unit };
    },
  };
}
