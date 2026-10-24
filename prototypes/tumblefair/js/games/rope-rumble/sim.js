// ROPE RUMBLE — tug of war on a village green, best of three pulls. A red ribbon is tied where the ropes meet; drag it
// over YOUR side's chalk line to win a pull.
//   sides      1 player: you against Big Barnaby, a CPU strongman.   2 players: one against one.
//              3 players: a three-way rope star — three ropes tied to one knot, each player pulls their own way.
//              4 players: two against two (the first two seats against the last two).
//   pulling    tap PULL in time with the drum. ONE tap per beat is a full-strength heave when it lands on the beat
//              (PERFECT) and a weaker one a little off it (GOOD); any extra taps in the same beat do nothing, so steady
//              rhythm beats wild mashing — little hands and big hands come out much closer.
//   a pull     a count-in of four drum beats, then up to RULES.pullS seconds of pulling. If nobody gets the ribbon over
//              a line in time, the side it leans toward wins (dead centre = nobody scores). First side to two pulls
//              wins; after three pulls it is over either way.
//
// Lag: the beat is judged ON THE PHONE against the drum it draws and plays (a round trip would ruin the rhythm). The
// phone sends act 'pull' { n: beat number, q: 2 perfect | 1 good }. The server takes at most one pull per player per
// beat, only for a beat that is close to its own clock. A plain A press with no act after it (a keyboard with no view,
// bots) is judged by the server's own clock after RULES.pendWait.
import { makeBody, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'rope-rumble', title: 'Rope Rumble', blurb: 'Tug of war! Pull in time with the drum!',
  how: ['Tap PULL once on every drum beat — on the beat is strongest.', 'Mashing is weaker than a steady rhythm!', 'Drag the red ribbon over your line to win the pull.', 'Best of three pulls.'],
  kind: 'arena', min: 1, max: 4, seconds: 62, scoring: 'points', unit: 'pulls', tags: ['action'],
  controls: { stick: false, a: 'PULL' }, move: { speed: 1, accel: 10 },       // everyone holds the rope (F.FROZEN)
  arena: { shape: 'rect', hw: 5.4, hd: 2.6, wall: true }, pitch: 50, card: 'card-rope-rumble', css: true,   // init() sends the frame for the actual rope layout
};

export const RULES = {
  bpm: { easy: 100, normal: 110, hard: 120 },
  count: 4,                         // count-in beats before PULL!
  pullS: 12, doneS: 2.8, pulls: 3, toWin: 2,
  power: [0, 0.6, 1],               // q -> strength
  imp: 1.8, damp: 2.4, line: 2.7, lean: 0.2,
  cpu: { easy: 0.45, normal: 0.58, hard: 0.75 },
  perfect: 0.11,                    // seconds either side of a beat that the SERVER calls perfect (fallback presses only)
  ahead: 1.6, behind: 3.5,          // a phone's beat number may be this far ahead of / behind the server's
  pendWait: 0.25,
  gap: 1.9, step: 1.2,              // where people stand along their rope: first one this far from the knot, then each step
};
export const CPU = -1;
const r2 = v => Math.round(v * 100) / 100;
/** The sides for n players: [{ pids: [...], dir: [x, z] }] (pid CPU = the strongman). */
export function sidesFor(players) {
  const ps = [...players].sort((a, b) => a.seat - b.seat).map(p => p.pid), n = ps.length;
  if (n === 1) return [{ pids: ps, dir: [-1, 0] }, { pids: [CPU], dir: [1, 0] }];
  if (n === 2) return [{ pids: [ps[0]], dir: [-1, 0] }, { pids: [ps[1]], dir: [1, 0] }];
  if (n === 3) return [0, 1, 2].map(i => { const a = Math.PI + i * Math.PI * 2 / 3; return { pids: [ps[i]], dir: [r2(Math.sin(a)), r2(Math.cos(a))] }; });
  return [{ pids: [ps[0], ps[1]], dir: [-1, 0] }, { pids: [ps[2], ps[3]], dir: [1, 0] }];
}

// Round 12: where the tug of war is (looks only — the green, the puddle in the middle, the bales round the edge), from the
// seed so the rng and the rules are untouched. Names and colours: view.js GROUNDS.
export const GROUND_COUNT = 5;
export function create({ seed = 0, rng, players, difficulty = 'normal' }) {
  const S = RULES, n = players.length, solo = n === 1, bps = (S.bpm[difficulty] || S.bpm.normal) / 60;
  const sides = sidesFor(players).map(s => ({ ...s, wins: 0, power: 0 }));
  const sideOf = new Map(); sides.forEach((s, i) => s.pids.forEach(pid => sideOf.set(pid, i)));
  const bodies = new Map(), events = [];
  const P = new Map(players.map(p => [p.pid, { prevB: 0, last: -99, pend: null, pulls: 0, perfects: 0, power: 0 }]));
  for (const p of players) bodies.set(p.pid, Object.assign(makeBody(0, 0, 0), { flags: F.FROZEN }));
  let knot = [0, 0], vel = [0, 0], round = 0, ph = 'ready', bt = 0, phT = 0, time = meta.seconds, over = false, cpuLast = -1, winner = -2;
  const cpuP = S.cpu[difficulty] ?? S.cpu.normal;
  function place() {
    sides.forEach(s => s.pids.forEach((pid, j) => {
      const b = bodies.get(pid); if (!b) return;
      const d = S.gap + j * S.step; b.x = r2(knot[0] + s.dir[0] * d); b.z = r2(knot[1] + s.dir[1] * d); b.yaw = r2(Math.atan2(-s.dir[0], -s.dir[1]));
    }));
  }
  place();
  const proj = (s, k = knot) => k[0] * s.dir[0] + k[1] * s.dir[1];
  function heave(pid, q, n) {
    const si = sideOf.get(pid), s = sides[si], p = S.power[q] || 0; if (!p) return;
    vel[0] += s.dir[0] * p * S.imp; vel[1] += s.dir[1] * p * S.imp; s.power += p;
    if (pid !== CPU) { const st = P.get(pid); st.pulls++; st.power += p; if (q === 2) st.perfects++; }
    events.push({ e: 'pull', pid, q, n });
  }
  /** A pull for beat n with quality q, if it is allowed (pulling, beat close to ours, one per beat). */
  function tryPull(pid, n, q) {
    const st = P.get(pid);
    if (ph !== 'pull' || !st || n <= st.last || n < S.count || n > bt + S.ahead || n < bt - S.behind) return false;
    st.last = n; heave(pid, q, n); return true;
  }
  function startRound() { knot = [0, 0]; vel = [0, 0]; ph = 'ready'; bt = 0; phT = 0; cpuLast = S.count - 1; winner = -2; for (const s of P.values()) { s.last = -99; s.pend = null; } place(); events.push({ e: 'round', r: round }); }
  function endPull(si) {
    ph = 'done'; phT = 0; winner = si;
    if (si >= 0) sides[si].wins++;
    events.push({ e: 'win', side: si, r: round });
  }
  return {
    bodies, events,
    init: () => ({ ground: Math.abs(Math.floor(seed || 0)) % GROUND_COUNT, solo, arena: n === 3 ? { shape: 'rect', hw: 4.4, hd: 4.0, wall: true } : { shape: 'rect', hw: n === 4 ? 5.6 : 4.8, hd: 2.4, wall: true }, bpm: bps * 60, count: S.count, line: S.line, pulls: S.pulls, sides: sides.map(s => ({ pids: s.pids, dir: s.dir })), left: Math.ceil(time) }),
    input(pid, inp) {
      const s = P.get(pid); if (!s || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && ph === 'pull' && !s.pend && !s.viewer) s.pend = { bt, wait: S.pendWait };     // a phone that judges its own taps never uses this
    },
    act(pid, a, d) {
      if (a !== 'pull' || !d || typeof d !== 'object' || over) return;
      const n = d.n, q = d.q;
      if (!Number.isInteger(n) || (q !== 1 && q !== 2)) return;
      const s = P.get(pid); if (!s) return;
      s.pend = null; s.viewer = true; tryPull(pid, n, q);
    },
    step(dt) {
      if (over) return;
      time -= dt; phT += dt; bt += dt * bps;
      if (ph === 'ready' && bt >= S.count) { ph = 'pull'; phT = 0; events.push({ e: 'go', r: round }); }
      if (ph === 'pull') {
        // fallback presses (no act came): judge them on the server's beat
        for (const [pid, s] of P) if (s.pend) {
          s.pend.wait -= dt; if (s.pend.wait > 0) continue;
          const nb = Math.round(s.pend.bt), off = Math.abs(s.pend.bt - nb) / bps; s.pend = null;
          tryPull(pid, nb, off <= S.perfect ? 2 : 1);
        }
        // the strongman heaves on every beat
        if (solo) { const nb = Math.floor(bt); if (nb > cpuLast && nb >= S.count) { cpuLast = nb; const p = Math.max(0.2, Math.min(1, cpuP + rng.range(-0.15, 0.12))); const si = sideOf.get(CPU), sd = sides[si]; vel[0] += sd.dir[0] * p * S.imp; vel[1] += sd.dir[1] * p * S.imp; sd.power += p; events.push({ e: 'pull', pid: CPU, q: p > 0.75 ? 2 : 1, n: nb }); } }
        const k = Math.exp(-S.damp * dt); vel[0] *= k; vel[1] *= k;
        knot[0] += vel[0] * dt; knot[1] += vel[1] * dt;
        const lim = S.line + 0.4, m = Math.hypot(knot[0], knot[1]); if (m > lim) { knot[0] *= lim / m; knot[1] *= lim / m; }
        let best = -1, bp = -1e9;
        sides.forEach((s, i) => { const p = proj(s); if (p >= S.line && p > bp) { bp = p; best = i; } });
        if (best >= 0) endPull(best);
        else if (phT >= S.pullS) {
          let lead = -1, lp = S.lean; sides.forEach((s, i) => { const p = proj(s); if (p > lp) { lp = p; lead = i; } });
          endPull(lead);
        }
        place();
      } else if (ph === 'done' && phT >= S.doneS) {
        round++;
        if (round >= S.pulls || sides.some(s => s.wins >= S.toWin)) over = true; else startRound();
      }
      if (time <= 0) { time = 0; over = true; }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = sides[sideOf.get(p.pid)].wins;
      return { sc, ph, r: round, bt: r2(bt), k: [r2(knot[0]), r2(knot[1])], w: sides.map(s => s.wins), win: winner, left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map(), singles = sides.every(s => s.pids.length === 1);
      for (const p of players) {
        const si = sideOf.get(p.pid), idle = !P.get(p.pid).pulls, w = idle ? 0 : sides[si].wins; scores[p.pid] = w;
        // never pulled once = last, whatever the rope did (owner 2026-10-22: "I win and don't even press the pull button")
        const key = idle ? -1 : singles && !solo ? w * 10000 + Math.round(P.get(p.pid).power * 10) : w;      // one-a-side: a tie on pulls goes to whoever heaved harder
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    _sides: sides, _P: P, get _knot() { return knot; }, get _bt() { return bt; }, get _ph() { return ph; },
  };
}
