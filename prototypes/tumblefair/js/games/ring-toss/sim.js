// RING TOSS — the classic stall. A table crowded with bottles in three rows slides slowly from side to side. Each
// throw is two taps (Long Drive's meters, toss-kit.js): the AIM needle sweeps across the table — tap to set it; then
// the POWER bar runs and a marker slides up your aim line to show how far the ring will go — tap to let go. The ring
// is in the air for FLIGHT seconds and the table keeps moving, so lead it. A ring that lands round a neck is a
// RINGER (front row 1, middle 2, back 3, the tall GOLD bottle 8); one that clips a rim bounces off — and now and then
// that bounce drops it round the next bottle along (a lucky bounce). From throw 5 the wind blows (an arrow says
// which way and how hard) and pushes long throws the most. Eight rings each; rings stack on the necks. Most points wins.
// Like Pie Toss, the phone sends WHEN it let go ({ aim, p, t }); the server works out where the table was at landing.
import { phoneTime, placeOrder, r1, r2 } from '../toss-kit.js';

export const meta = {
  id: 'ring-toss', title: 'Ring Toss', blurb: 'Land rings round the bottle necks on a sliding table!',
  how: ['Tap to set your AIM, then tap again to throw when the marker is far enough.', 'The table slides while the ring flies, so throw a little ahead.', 'Back bottles score more. A ringer on the GOLD bottle is 8! Watch the wind later on.'],
  kind: 'ui', min: 1, max: 4, seconds: 66, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-ring-toss', css: true,
};
export const TW = 160, TD = 60;                         // table width; depth from the front edge (0) to the back edge (TD)
export const COUNT_S = 3, PLAY_S = 56, END_S = 3, FLIGHT = 0.8, RINGS = 8, WIND_FROM = 4;
export const ROWS = [{ d: 12, pts: 1 }, { d: 30, pts: 2 }, { d: 48, pts: 3 }], COLS = [25, 47, 69, 91, 113, 135], GOLD = 8;
export const RIM = 9.5, LUCKY = 3.8;                    // a near miss inside RIM bounces; the bounce rings the next bottle if it lands within LUCKY of its neck
export const AIM_X = 70, MEDALS = [8, 16, 24], LAG_S = 1.0, AHEAD_S = 0.15;
export const LEVELS = {
  easy: { A: 14, w: 0.85, ringer: 5.4, aim: 2.0, power: 1.6, wind: 8 },
  normal: { A: 22, w: 1.2, ringer: 4.7, aim: 1.6, power: 1.3, wind: 12 },
  hard: { A: 30, w: 1.55, ringer: 4.0, aim: 1.25, power: 1.05, wind: 16 },
};
/** How far the table has slid at play time t (table x = world x - shift). */
export const shift = (T, t) => T.A * Math.sin(T.w * t + T.ph);
/** The landing spot for a throw: aim -1..1, power 0..1, wind in table units (+ = to the right). -> { x (world), d } */
export function landing(aim, p, wind = 0) { return { x: r1(TW / 2 + aim * AIM_X + wind * (0.4 + 0.6 * p)), d: r1(-8 + p * 72) }; }
/** The bottles: [{ i, x, d, row, pts, gold }]. */
export function makeBottles(rng) {
  const gold = rng.int(0, COLS.length - 1), goldRow = rng.chance(0.6) ? 2 : 1, out = [];
  ROWS.forEach((R, row) => COLS.forEach((x, c) => { const g = row === goldRow && c === gold; out.push({ i: out.length, x: x + (row % 2 ? 4 : -4), d: R.d, row, pts: g ? GOLD : R.pts, gold: g }); }));
  return out;
}
const near = (bottles, x, d, skip = -1) => { let best = null, bd = 1e9; for (const b of bottles) { if (b.i === skip) continue; const dist = Math.hypot(x - b.x, (d - b.d) * 1.25); if (dist < bd) { bd = dist; best = b; } } return { b: best, dist: bd }; };
/** Where a ring ends up: { res: 'ringer' | 'lucky' | 'rim' | 'table' | 'short' | 'long', b?, tx, d, bx?, bd? } (table coords). */
export function judge(bottles, tx, d, ringer) {
  if (d < -2) return { res: 'short', tx, d };
  if (d > TD + 2 || tx < -4 || tx > TW + 4) return { res: 'long', tx, d };
  const { b, dist } = near(bottles, tx, d);
  if (dist <= ringer) return { res: 'ringer', b: b.i, tx, d };
  if (dist <= RIM) {
    const ux = (tx - b.x) / (dist || 1), ud = (d - b.d) * 1.25 / (dist || 1), hop = RIM + 10.5;
    const bx = r1(b.x + ux * hop), bd = r1(b.d + ud * hop / 1.25), n2 = near(bottles, bx, bd, b.i);
    if (n2.dist <= LUCKY) return { res: 'lucky', b: n2.b.i, rim: b.i, tx, d, bx, bd };
    return { res: 'rim', rim: b.i, tx, d, bx, bd };
  }
  return { res: 'table', tx, d };
}
export const valid = d => d && typeof d === 'object' && Number.isFinite(d.aim) && Number.isFinite(d.p) && d.aim >= -1 && d.aim <= 1 && d.p >= 0 && d.p <= 1;

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const bottles = makeBottles(rng);
  const table = { A: L.A, w: L.w, ph: r2(rng.range(0, 6.283)) };
  const winds = Array.from({ length: RINGS }, (_, k) => k < WIND_FROM ? 0 : r1(L.wind * rng.range(0.5, 1) * (rng.chance(0.5) ? 1 : -1) * (0.7 + 0.1 * (k - WIND_FROM))));
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, n: 0, last: null, busy: 0, ringers: 0, gold: 0 }]));
  const air = [], stacks = [];                          // rings in flight; [bottle, pid] rings sitting on necks
  let phase = 'count', left = COUNT_S, el = 0, over = false;
  const events = [];
  function land(r) {
    const tx = r1(r.x - shift(table, r.T)), j = judge(bottles, tx, r.d, L.ringer), s = S[r.pid];
    let pts = 0;
    if (j.res === 'ringer' || j.res === 'lucky') { const b = bottles[j.b]; pts = b.pts; s.pts += pts; s.ringers++; if (b.gold) s.gold++; stacks.push([b.i, r.pid]); }
    events.push({ e: 'land', pid: r.pid, k: r.k, pts, ...j });
  }
  return {
    events,
    init: () => ({ bottles, table, winds, rings: RINGS, tw: TW, td: TD, flight: FLIGHT, aimX: AIM_X, level: L, play: PLAY_S, count: COUNT_S, solo, medals: MEDALS }),
    act(pid, a, d) {
      if (a !== 'toss' || !S[pid] || phase !== 'play' || over || !valid(d)) return;
      const s = S[pid]; if (s.n >= RINGS || s.busy > 0) return;
      const t = phoneTime(d, el, s.last, { ahead: AHEAD_S, lag: LAG_S, max: PLAY_S });
      if (t == null) return;
      const k = s.n, { x, d: depth } = landing(d.aim, d.p, winds[k]);
      s.n++; s.last = t; s.busy = FLIGHT + 0.4;
      air.push({ pid, k, x, d: depth, t, T: t + FLIGHT });
      events.push({ e: 'toss', pid, k, x, d: depth, t: r2(t) });
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      el += dt;
      for (const p of pids) if (S[p].busy > 0) S[p].busy = Math.max(0, S[p].busy - dt);
      air.sort((a, b) => a.T - b.T);
      while (air.length && air[0].T <= el + 1e-9) land(air.shift());
      const allDone = pids.every(p => S[p].n >= RINGS) && !air.length;
      if (phase === 'play' && (el >= PLAY_S + FLIGHT || allDone)) { while (air.length) land(air.shift()); phase = 'end'; left = END_S; events.push({ e: 'end' }); }
      else if (phase === 'end') { left -= dt; if (left <= 0) over = true; }
    },
    state() {
      const sc = {}, n = {}; for (const p of pids) { sc[p] = S[p].pts; n[p] = S[p].n; }
      return { phase, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : phase === 'end' ? 0 : Math.max(0, Math.ceil(PLAY_S - el)), el: Math.floor(el * 2) / 2, sc, n, st: stacks.slice(-40) };
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts]));
      return { order: placeOrder(pids, p => S[p].pts), scores, unit: meta.unit, ...(solo ? { medal: MEDALS.filter(m => S[pids[0]].pts >= m).length } : {}) };
    },
    get _el() { return el; }, get _phase() { return phase; }, _stats: S, _table: table, _bottles: bottles, _winds: winds, _level: L,
  };
}
