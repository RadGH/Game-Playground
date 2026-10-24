// TILT & LANCE — a jousting lane at the fair. Two knights on bouncy hobby horses charge at each other down either
// side of a striped fence, three passes a bout. On your phone: your lance's aim is a dot that WOBBLES over the other
// knight's target shield. HOLD the button to steady it (the wobble shrinks — but hold too long and your arm tires
// and it grows again), and LET GO right as the knights cross (the NOW mark) to strike. Where the dot is when you let
// go and how close to the crossing you let go make the hit: miss 0, glancing 1, solid 2, CRACK 3. A crack while the
// other knight only glances (or misses) UNHORSES them: +3 and the bout is over. Most points over the passes wins the
// bout (+3). Everyone not riding taps the knight they cheer for before the charge: right = +2.
//   bracket   2 players: three bouts, swapping sides. 3: A v B, then the winner v C. 4: two semi-finals
//             and a final. Solo: you against Sir Wobbleton, then Dame Clatter (bronze 8, silver 14, gold 20).
// The phone sends WHEN you pressed and WHEN you let go ({ h, t }); the server works the dot out from those two times
// with the same wobble the phone drew (wobble() below), so nothing it is told can be a made-up aim.
import { phoneTime, r2 } from '../toss-kit.js';

export const meta = {
  id: 'jousting', title: 'Tilt & Lance', blurb: 'Steady your wobbling lance, strike as you cross, and knock the other knight off their horse!',
  how: ['HOLD to steady your wobbling lance on the target shield.', 'LET GO right at the NOW mark as the knights cross.', 'A crack (3) while they only glance UNHORSES them!', 'Not riding? Cheer for a knight before the charge: right = +2.'],
  kind: 'ui', min: 1, max: 4, seconds: 78, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-jousting', css: true,
};
export const COUNT_S = 3, INTRO_S = 2.6, READY_S = 1.1, RESULT_S = 1.5, END_S = 3.5, PASSES = 3;
export const LEVELS = {
  easy: { charge: 3.4, min: 0.2, speed: 0.8, cpu: 0.48 },
  normal: { charge: 3.2, min: 0.26, speed: 1, cpu: 0.62 },
  hard: { charge: 2.8, min: 0.32, speed: 1.2, cpu: 0.74 },
};
export const CPUS = [{ pid: -1, name: 'Sir Wobbleton' }, { pid: -2, name: 'Dame Clatter' }];
export const PTS = { crack: 3, solid: 2, glance: 1, unhorse: 3, bout: 3, cheer: 2 }, MEDALS = [8, 14, 20];
/** How far the wobble swings after holding the button for `held` seconds: steadier, then tired. */
export function amp(held, L) {
  if (held == null || held < 0) return 1.25;
  if (held < 0.9) return 1.25 + (L.min - 1.25) * (held / 0.9);
  if (held < 1.9) return L.min;
  return Math.min(1.45, L.min + (held - 1.9) * 1.1);
}
/** The aim dot on the shield (shield radius = 1) at time t, for a pass's wobble phases w, holding since h (or null). */
export function wobble(w, t, h, L) {
  const s = L.speed, a = amp(h == null ? null : t - h, L);
  return { x: (0.62 * Math.sin(2.3 * s * t + w[0]) + 0.38 * Math.sin(3.7 * s * t + w[1])) * a, y: (0.6 * Math.sin(2.9 * s * t + w[2]) + 0.4 * Math.sin(1.9 * s * t + w[3])) * a };
}
/** A strike: q 0..1 from where the dot was and how close to the crossing you let go. */
export function strike(x, y, dt) {
  const d = Math.hypot(x, y), at = Math.abs(dt);
  if (d > 1.05 || at > 0.5) return 0;
  const aimQ = d <= 0.25 ? 1 : Math.max(0, 1 - (d - 0.25) / 0.85), timeQ = at <= 0.08 ? 1 : Math.max(0, 1 - (at - 0.08) / 0.42);
  return r2(Math.sqrt(aimQ * timeQ));
}
export const grade = q => (q >= 0.85 ? 'crack' : q >= 0.55 ? 'solid' : q > 0 ? 'glance' : 'miss');
export const gradePts = q => PTS[grade(q)] || 0;

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, n = players.length, solo = n === 1;
  const ids = players.map(p => p.pid), seeded = n >= 3 ? rng.shuffle(ids) : ids.slice();
  // wobble phases for every pass slot (bout b, pass k, side s), drawn up front so the rng never depends on play
  const wob = Array.from({ length: 3 * PASSES * 2 }, () => [r2(rng.range(0, 6.28)), r2(rng.range(0, 6.28)), r2(rng.range(0, 6.28)), r2(rng.range(0, 6.28))]);
  const cpuRoll = Array.from({ length: 3 * PASSES }, () => rng());
  const coin = Array.from({ length: 3 }, () => rng.chance(0.5) ? 0 : 1);
  const plan = solo ? [[ids[0], -1], [ids[0], -2]] : n === 2 ? [[ids[0], ids[1]], [ids[1], ids[0]], [ids[0], ids[1]]] : n === 3 ? [[seeded[0], seeded[1]], ['W0', seeded[2]]] : [[seeded[0], seeded[1]], [seeded[2], seeded[3]], ['W0', 'W1']];
  const bouts = [];                                        // { a, b, pts: [0, 0], best: [0, 0], win, un }
  const S = Object.fromEntries(ids.map(p => [p, { pts: 0, cracks: 0, wins: 0, cheers: 0, sent: false, h: 0, t: 0 }]));
  const events = [];
  let phase = 'count', left = COUNT_S, el = 0, bi = -1, k = 0, t0 = 0, cross = 0, over = false, last = null;
  let ch = {}, sent = {};                                  // cheers this bout { pid: side }; lances this pass { pid: [h, t] }
  const cpuName = pid => CPUS.find(c => c.pid === pid)?.name;
  const riders = () => (bi >= 0 && bouts[bi] ? [bouts[bi].a, bouts[bi].b] : []);
  function startBout() {
    bi++; k = 0; ch = {};
    const [a, b] = plan[bi].map(x => typeof x === 'string' ? bouts[+x.slice(1)].win : x);
    bouts.push({ a, b, pts: [0, 0], best: [0, 0], win: null, un: -1 });
    phase = 'intro'; left = INTRO_S; events.push({ e: 'bout', b: bi, a, bb: b });
  }
  function startPass() { phase = 'ready'; left = READY_S; sent = {}; t0 = r2(el + READY_S); cross = r2(t0 + L.charge); events.push({ e: 'pass', b: bi, k, t0, cross }); }
  function qOf(side) {
    const B = bouts[bi], pid = side ? B.b : B.a;
    if (pid < 0) { const r = cpuRoll[bi * PASSES + k], q = Math.max(0, Math.min(1, L.cpu + (r - 0.5) * 0.7)); return q < 0.12 ? 0 : r2(q); }
    const ln = sent[pid]; if (!ln) return 0;
    const w = wob[(bi * PASSES + k) * 2 + side], p = wobble(w, ln[1] - t0, ln[0] == null ? null : ln[0] - t0, L);
    return strike(p.x, p.y, ln[1] - cross);
  }
  function resolve() {
    const B = bouts[bi], q = [qOf(0), qOf(1)], g = q.map(gradePts);
    for (const s of [0, 1]) { B.pts[s] += g[s]; B.best[s] = Math.max(B.best[s], q[s]); const pid = s ? B.b : B.a; if (S[pid]) { S[pid].pts += g[s]; if (g[s] === 3) S[pid].cracks++; } }
    let un = -1;
    if (q[0] >= 0.85 && q[1] < 0.55) un = 1; else if (q[1] >= 0.85 && q[0] < 0.55) un = 0;
    if (un >= 0) { B.un = un; const winner = un ? B.a : B.b; if (S[winner]) S[winner].pts += PTS.unhorse; }
    const lanes = [B.a, B.b].map(pid => (sent[pid] ? [r2(sent[pid][0] ?? -1), sent[pid][1]] : null));
    last = { k, q, g, un, lanes };
    events.push({ e: 'hit', b: bi, k, q, g, un, lanes });
    phase = 'result'; left = RESULT_S;
  }
  function endBout() {
    const B = bouts[bi];
    const side = B.un >= 0 ? 1 - B.un : B.pts[0] !== B.pts[1] ? (B.pts[0] > B.pts[1] ? 0 : 1) : B.best[0] !== B.best[1] ? (B.best[0] > B.best[1] ? 0 : 1) : coin[bi];
    B.win = side ? B.b : B.a;
    if (S[B.win]) { S[B.win].pts += PTS.bout; S[B.win].wins++; }
    for (const [pid, s] of Object.entries(ch)) if (s === side && S[pid]) { S[pid].pts += PTS.cheer; S[pid].cheers++; }
    events.push({ e: 'boutEnd', b: bi, win: B.win, side, un: B.un, pts: B.pts.slice() });
  }
  return {
    events,
    init: () => ({ solo, cpus: CPUS, wob, level: L, passes: PASSES, plan: plan.map(p => p.map(x => typeof x === 'string' ? -9 : x)), medals: MEDALS, pts: PTS }),
    act(pid, a, d) {
      if (!S[pid] || over) return;
      if (a === 'cheer') {
        if ((phase !== 'intro' && !(phase === 'ready' && k === 0)) || riders().includes(pid) || ch[pid] != null || (d !== 0 && d !== 1)) return;
        ch[pid] = d; events.push({ e: 'cheer', pid, side: d });
      } else if (a === 'lance') {
        if (!riders().includes(pid) || sent[pid] || (phase !== 'ready' && phase !== 'charge') || !d || typeof d !== 'object') return;
        const t = phoneTime(d, el, null, { ahead: 0.15, lag: 1.0 }); if (t == null || t < t0 || t > cross + 0.5) return;
        const h = d.h == null ? null : +d.h; if (h != null && (!Number.isFinite(h) || h > t || h < t0 - READY_S - 0.2)) return;
        sent[pid] = [h, r2(t)]; events.push({ e: 'lance', pid });
      }
    },
    step(dt) {
      if (over) return;
      el += dt; left -= dt;
      if (phase === 'count') { if (left <= 0) startBout(); }
      else if (phase === 'intro') { if (left <= 0) startPass(); }
      else if (phase === 'ready') { if (left <= 0) { phase = 'charge'; left = L.charge; } }
      else if (phase === 'charge') {
        const all = riders().every(p => p < 0 || sent[p]);
        if (el >= cross + 0.5 || (all && el >= cross + 0.05)) resolve();
      } else if (phase === 'result') {
        if (left <= 0) {
          const B = bouts[bi];
          if (B.un >= 0 || k + 1 >= PASSES) { endBout(); if (bi + 1 >= plan.length) { phase = 'end'; left = END_S; events.push({ e: 'end' }); } else startBout(); }
          else { k++; startPass(); }
        }
      } else if (phase === 'end' && left <= 0) over = true;
    },
    state() {
      const sc = {}; for (const p of ids) sc[p] = S[p].pts;
      const B = bouts[bi];
      return { ph: phase, el: Math.floor(el * 2) / 2, b: bi, k, rd: B ? [B.a, B.b] : null, bp: B ? B.pts.slice() : null, t0, cr: cross, ch, sn: Object.keys(sent).map(Number), last, bw: bouts.filter(x => x.win != null).map(x => x.win), sc, left: Math.max(0, Math.ceil(left)) };
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(ids.map(p => [p, S[p].pts])), groups = new Map();
      for (const p of ids) { const key = S[p].pts * 100 + S[p].wins * 10 + S[p].cracks; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(x => groups.get(x)), scores, unit: meta.unit, ...(solo ? { medal: MEDALS.filter(m => scores[ids[0]] >= m).length } : {}) };
    },
    get _phase() { return phase; }, get _el() { return el; }, get _t0() { return t0; }, get _cross() { return cross; }, get _bout() { return bouts[bi]; }, _bouts: bouts, _wob: wob, _level: L, get _k() { return k; }, get _bi() { return bi; }, _stats: S, cpuName,
  };
}

/** The best release for a rider this pass, by searching: hold from `hold` seconds before the crossing and let go
 *  within `slack` of the moment the dot is nearest the middle. skill 1 = searches well; 0 = just lets go late. */
export function bestLance(g, side, skill = 1) {
  const w = g._wob[(g._bi * PASSES + g._k) * 2 + side], L = g._level, t0 = g._t0, cross = g._cross;
  if (skill <= 0) return { h: null, t: r2(cross + 0.3) };
  const h = cross - 1.2;
  let best = { t: cross, d: 9 };
  for (let t = cross - 0.12; t <= cross + 0.12 + 1e-9; t += 0.01) { const p = wobble(w, t - t0, h - t0, L); const d = Math.hypot(p.x, p.y) + Math.abs(t - cross) * 2; if (d < best.d) best = { t, d }; }
  return { h: r2(h), t: r2(best.t) };
}
