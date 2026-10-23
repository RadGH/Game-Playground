// LONG DRIVE — everyone tees off side by side at the same time, three drives each. A drive is two taps on your phone:
// the POWER bar swings up and down — tap to lock it; then the ACCURACY needle swings across — tap as it crosses the
// middle (early hooks left, late slices right, and a miss also costs distance). ◀ ▶ aim a little left or right to
// play the WIND (a flag by the tees and an arrow on screen: a tailwind carries further, a crosswind pushes the ball
// sideways). The fairway runs straight; the rough either side does not count, past it are trees (out of bounds), and a
// pond waits on the right at the long end. Your best drive that finishes ON THE FAIRWAY is your score (yards).
// The meters run on the phone (so lag never moves them); it sends what it locked, `swing { p, a, aim }`, and the
// server works out the flight from those and the drive's wind — the same wind for everyone on drive 1, 2 and 3.
// Solo: beat the three target flags (bronze 200, silver 250, gold 290).
export const meta = {
  id: 'long-drive', title: 'Long Drive', blurb: 'Tap for power, tap for accuracy — longest drive on the fairway wins!',
  how: ['Tap to stop the POWER bar, then tap as the needle hits the middle.', 'Aim with ◀ ▶ to play the wind. Only drives on the fairway count.', 'Three drives each. Your best one is your score.'],
  kind: 'ui', min: 1, max: 4, seconds: 70, scoring: 'points', unit: 'yards', tags: ['action'], card: 'card-long-drive', css: true,
};

export const DRIVES = 3, FLIGHT = 3.2, AIM_STEP = 2, AIM_MAX = 5;            // seconds a drive takes to land and stop; aim in 2° steps
export const FAIRWAY = 22, ROUGH = 46;                                       // half widths in yards
export const POND = { x0: 6, x1: 40, y0: 238, y1: 272 };                     // a pond on the right, at the long end
export const MEDALS = [[290, 'gold'], [250, 'silver'], [200, 'bronze']];
/** Meter speeds (seconds for a full swing up and back) and the strongest wind, by difficulty. */
export const LEVELS = {
  easy: { power: 1.7, acc: 1.5, wind: 6 },
  normal: { power: 1.3, acc: 1.05, wind: 12 },
  hard: { power: 1.0, acc: 0.8, wind: 18 },
};
const r1 = v => Math.round(v * 10) / 10;
/** Where a ping-pong meter is t seconds after it started: 0 -> 1 -> 0 over one period. */
export const pingPong = (t, period) => { const f = (((t % period) + period) % period) / (period / 2); return f <= 1 ? f : 2 - f; };
/** Accuracy needle: -1 (hook) .. 0 (sweet) .. 1 (slice), sweeping both ways. */
export const needle = (t, period) => pingPong(t, period) * 2 - 1;
/** What lies at (x yards across, y yards down): 'fairway' | 'rough' | 'pond' | 'trees'. */
export function lieAt(x, y) {
  if (x >= POND.x0 && x <= POND.x1 && y >= POND.y0 && y <= POND.y1) return 'pond';
  const ax = Math.abs(x);
  return ax <= FAIRWAY ? 'fairway' : ax <= ROUGH ? 'rough' : 'trees';
}
/**
 * One drive. p 0..1 power, a -1..1 accuracy (0 = pure), aim in steps (+ = right), wind { mph, dir } (dir 0 = straight
 * downwind, + = blowing to the right). -> { carry, cx, x, y, lie, roll }. Pure, so the phone could show the same.
 */
export function flight(p, a, aim, wind) {
  p = Math.max(0, Math.min(1, p)); a = Math.max(-1, Math.min(1, a));
  let carry = 150 + 150 * Math.pow(p, 1.15);
  carry *= 1 - 0.2 * Math.abs(a);                                            // a mishit loses distance
  const tail = wind.mph * Math.cos(wind.dir), cross = wind.mph * Math.sin(wind.dir);
  carry += tail * 1.7;
  const ang = aim * AIM_STEP * Math.PI / 180;
  let cx = carry * Math.sin(ang) + a * 55 * (0.5 + 0.5 * p) + cross * 1.5 * carry / 250;
  const cy = carry * Math.cos(ang);
  const landLie = lieAt(cx, cy);
  const roll = landLie === 'fairway' ? carry * 0.09 : landLie === 'rough' ? carry * 0.025 : 0;
  const dirx = Math.sin(ang + a * 0.12), diry = Math.cos(ang + a * 0.12);
  const x = cx + dirx * roll, y = cy + diry * roll;
  const lie = landLie === 'pond' ? 'pond' : lieAt(x, y);
  return { carry: r1(carry), cx: r1(cx), cy: r1(cy), x: r1(x), y: r1(y), lie, roll: r1(roll) };
}
export const valid = d => d && typeof d === 'object' && Number.isFinite(d.p) && Number.isFinite(d.a) && Number.isInteger(d.aim) && d.p >= 0 && d.p <= 1 && d.a >= -1 && d.a <= 1 && Math.abs(d.aim) <= AIM_MAX;

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid);
  // the wind for drive 1, 2, 3 (the same for everyone): a little at first, more later
  const winds = Array.from({ length: DRIVES }, (_, k) => ({ mph: Math.round(L.wind * rng.range(0.25 + k * 0.2, 0.6 + k * 0.2)), dir: Math.round(rng.range(-Math.PI, Math.PI) * 100) / 100 }));
  const P = new Map(pids.map(pid => [pid, { drives: [], busy: 0 }]));
  let time = meta.seconds - 1, start = 1.2, over = false;
  const events = [];
  const best = pid => Math.max(0, ...P.get(pid).drives.filter(d => d.lie === 'fairway').map(d => Math.round(d.y)));
  return {
    events,
    init: () => ({ winds, drives: DRIVES, level: L, fairway: FAIRWAY, rough: ROUGH, pond: POND, flight: FLIGHT, aimStep: AIM_STEP, aimMax: AIM_MAX, medals: pids.length === 1 ? MEDALS : null }),
    act(pid, a, d) {
      const s = P.get(pid); if (!s || over || start > 0) return;
      if (a !== 'swing' || !valid(d) || s.busy > 0 || s.drives.length >= DRIVES) return;
      const k = s.drives.length, f = flight(d.p, d.a, d.aim, winds[k]);
      s.drives.push(f); s.busy = FLIGHT;
      events.push({ e: 'drive', pid, k, ...f, p: Math.round(d.p * 100) / 100, a: Math.round(d.a * 100) / 100, aim: d.aim });
    },
    step(dt) {
      if (over) return;
      time -= dt; if (start > 0) start -= dt;
      for (const [pid, s] of P) if (s.busy > 0) { s.busy -= dt; if (s.busy <= 0) { s.busy = 0; const f = s.drives[s.drives.length - 1]; events.push({ e: 'stop', pid, k: s.drives.length - 1, y: Math.round(f.y), lie: f.lie }); } }
      if (pids.every(pid => { const s = P.get(pid); return s.drives.length >= DRIVES && s.busy <= 0; }) || time <= 0) { over = true; events.push({ e: 'end' }); }
    },
    state() {
      const sc = {}, n = {}, busy = {};
      for (const pid of pids) { const s = P.get(pid); sc[pid] = best(pid); n[pid] = s.drives.length; busy[pid] = s.busy > 0 ? 1 : 0; }
      return { sc, n, busy, go: start <= 0 ? 1 : 0, left: Math.max(0, Math.ceil(time)) };
    },
    get over() { return over; },
    result() {
      const rows = pids.map(pid => { const s = P.get(pid); return { pid, best: best(pid), n: s.drives.length, any: Math.max(0, ...s.drives.map(d => Math.round(d.y))) }; });
      // longest fairway drive; a tie (e.g. nobody found the fairway) goes to more drives taken, then the longest drive anywhere
      rows.sort((a, b) => b.best - a.best || b.n - a.n || b.any - a.any);
      const order = [];
      for (const r of rows) { const g = order[order.length - 1]; if (g && g.best === r.best && g.n === r.n && g.any === r.any) g.pids.push(r.pid); else order.push({ ...r, pids: [r.pid] }); }
      return { order: order.map(o => o.pids), scores: Object.fromEntries(rows.map(r => [r.pid, r.best])), unit: meta.unit, drives: Object.fromEntries(pids.map(pid => [pid, P.get(pid).drives.map(d => [Math.round(d.y), d.lie])])) };
    },
  };
}
