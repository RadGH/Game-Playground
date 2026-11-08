// SAFECRACKER (Expansion 1, M4 rework) — ONE idea: turn the dial until the safe CLICKS, then press SET.
// The old game was a code-breaking puzzle (guess a code, read "right / moved" counts, tries, jams, a LISTEN shortcut,
// a first-to-open bonus): live ratings called it confusing, long and unfair. Now every safe is three numbers on a dial
// of 0-39. Turn the dial with the arrow buttons; a lamp tells you how close you are (cold, warm, hot, CLICK!). On the
// click, press SET and that number is in; set all three and the safe opens. A SET on the wrong number jams the dial for
// a moment. Most safes opened wins.
// Fair: every player's codes are the SAME distances apart (shared turns, per-player starting point), so everyone has
// exactly as much dialling to do, but no two phones show the same numbers. Alone you race Nimble Nell (CPU), whose speed
// follows the room's difficulty.
export const meta = {
  id: 'safecracker', title: 'Safecracker', blurb: 'Turn the dial until it clicks, then press SET. Open the most safes!',
  how: ['◀ ▶ turn the dial. The lamp gets hotter as you get close.', 'When it says CLICK!, press SET. Three numbers open a safe.', 'Wrong SET jams the dial for a second.'],
  kind: 'ui', min: 1, max: 4, seconds: 50, scoring: 'points', unit: 'safes', tags: ['action'], card: 'card-safecracker', css: true, rival: true,
};
export const DIAL = 40, LEN = 3, GAME_S = 50, JAM_S = 1.2, MAX_TURN = 5;
export const CPU_NAME = 'Nimble Nell';
// Nell: seconds per number = REACT + distance / SPEED + a little (by difficulty). A thumb on the buttons does about
// 10 notches a second with the hold-to-repeat, plus the ±5 jumps.
export const CPU_SPEED = { easy: 5, normal: 8, hard: 12 }, CPU_REACT = { easy: 1.6, normal: 1.1, hard: 0.7 };

/** Shortest way round the dial between two numbers. */
export const dist = (a, b) => { const d = Math.abs(((a - b) % DIAL + DIAL) % DIAL); return Math.min(d, DIAL - d); };
/** How the lamp reads at a distance: 4 = CLICK (exactly on it), 3 hot, 2 warm, 1 cool, 0 cold. */
export const heatOf = d => d === 0 ? 4 : d <= 2 ? 3 : d <= 5 ? 2 : d <= 9 ? 1 : 0;
export const HEAT_WORDS = ['Cold', 'Cool', 'Warm', 'Hot!', 'CLICK!'];

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  // shared turns: the k-th number is this far (and this way) from the one before, for everyone
  const turns = Array.from({ length: 80 }, () => rng.int(7, 19) * (rng.chance(0.5) ? 1 : -1));
  const numAt = (rot, k) => { let v = rot; for (let i = 0; i <= k; i++) v += turns[i % turns.length]; return ((v % DIAL) + DIAL) % DIAL; };
  const me = new Map(pids.map(pid => { const rot = rng.int(0, DIAL - 1); return [pid, { rot, k: 0, dial: rot, safes: 0, lock: 0, misses: 0, lastAt: 0 }]; }));
  const events = [];
  let left = GAME_S, over = false, t = 0;
  const cpu = solo && rivals !== false ? { k: 0, safes: 0, next: 0 } : null;   // "Rival when alone" off: no Nell
  const cpuTime = k => (CPU_REACT[difficulty] ?? 1.1) + Math.abs(turns[k % turns.length]) / (CPU_SPEED[difficulty] ?? 8) + rng.range(0, 0.8);
  if (cpu) cpu.next = cpuTime(0);
  const target = p => numAt(p.rot, p.k);
  return {
    events,
    init: () => ({ dial: DIAL, len: LEN, seconds: GAME_S, solo, cpu: cpu ? CPU_NAME : null, jamS: JAM_S, maxTurn: MAX_TURN }),
    act(pid, a, d) {
      const p = me.get(pid); if (over || !p || p.lock > 0) return;
      if (a === 'turn') {
        if (!Number.isInteger(d) || d === 0 || Math.abs(d) > MAX_TURN) return;
        p.dial = ((p.dial + d) % DIAL + DIAL) % DIAL;
      } else if (a === 'set') {
        if (p.dial === target(p)) {
          p.k++;
          if (p.k % LEN === 0) { p.safes++; p.lastAt = t; events.push({ e: 'open', pid, safes: p.safes }); }
          else events.push({ e: 'num', to: pid });
        } else { p.lock = JAM_S; p.misses++; events.push({ e: 'jam', to: pid }); }
      }
    },
    step(dt) {
      if (over) return;
      t += dt; left -= dt;
      if (left <= 0) { left = 0; over = true; return; }
      for (const p of me.values()) if (p.lock > 0) p.lock = Math.max(0, p.lock - dt);
      if (cpu && t >= cpu.next) { cpu.k++; if (cpu.k % LEN === 0) { cpu.safes++; events.push({ e: 'open', pid: 'cpu', safes: cpu.safes }); } cpu.next = t + cpuTime(cpu.k); }
    },
    state: () => ({
      left: Math.max(0, Math.ceil(left)),
      p: Object.fromEntries([...me].map(([pid, p]) => [pid, { safes: p.safes, step: p.k % LEN, lock: p.lock > 0 ? 1 : 0 }])),
      ...(cpu ? { cpu: { safes: cpu.safes, step: cpu.k % LEN } } : {}),
    }),
    priv(pid) {
      const p = me.get(pid); if (!p) return {};
      const step = p.k % LEN, set = []; for (let i = p.k - step; i < p.k; i++) set.push(numAt(p.rot, i));
      return { dial: p.dial, heat: heatOf(dist(p.dial, target(p))), step, set, safes: p.safes, lock: p.lock > 0 };
    },
    get over() { return over; },
    result() {
      // most safes; a tie goes to whoever is further into the next safe, then whoever opened their last safe sooner
      const key = pid => { const p = me.get(pid); return [p.safes, p.k % LEN, -p.lastAt]; };
      const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
      const sorted = pids.slice().sort(cmp), order = [];
      for (const pid of sorted) { const g = order[order.length - 1]; if (g && cmp(g[0], pid) === 0) g.push(pid); else order.push([pid]); }
      return { order, scores: Object.fromEntries(pids.map(p => [p, me.get(p).safes])), unit: meta.unit };
    },
  };
}
