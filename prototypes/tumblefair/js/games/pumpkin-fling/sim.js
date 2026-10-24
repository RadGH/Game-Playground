// PUMPKIN FLING (Halloween only) — Long Drive's two-tap swing, on a wooden catapult in a moonlit pumpkin patch.
// A fling is two taps: the POWER bar swings up and down — tap to lock it; then the catapult ARM swings up from
// lying flat to straight up — tap to LET GO (about halfway up throws furthest; early = a low skimmer, late = a lob
// that goes up more than along). Bats blow a wind along the field (a tailwind carries further). The twist: the patch
// ends at the graveyard wall — fling it over and it is lost in the woods (scores nothing), so the best fling is the
// longest one that still lands in the patch, not the hardest. A scarecrow holds up a bucket somewhere down the field
// each fling: land within the bucket's reach for +20. Three flings each; your best one is your score (metres).
// The meters run on the phone (so lag never moves them); it sends what it locked, `fling { p, a }` (power 0..1, the
// arm's angle in degrees), and the server works out the flight from those and that fling's wind. Solo: medals.
export const meta = {
  id: 'pumpkin-fling', title: 'Pumpkin Fling', blurb: 'Catapult your pumpkin down the patch — but not over the graveyard wall!',
  how: ['Tap to stop the POWER bar, then tap to LET GO as the arm swings up.', 'Halfway up throws furthest. Over the wall at the end = lost!', 'Land in the scarecrow\'s bucket for +20. Best of three flings.'],
  kind: 'ui', min: 1, max: 4, seconds: 66, scoring: 'points', unit: 'metres', tags: ['action', 'holiday'], season: 'halloween', card: 'card-pumpkin-fling', css: true,
};
export const FLINGS = 3, FLIGHT = 3.4, START_S = 1.4, G = 9.8, V_MAX = 37;
export const WALL = 120, BUCKET_BONUS = 20, ARM_MIN = 10, ARM_MAX = 88;      // metres to the graveyard wall; arm angle range (degrees)
export const MEDALS = [[115, 'gold'], [100, 'silver'], [80, 'bronze']];
/** Meter speeds (seconds for a full power swing up and back; seconds for the arm to swing all the way up), wind, bucket reach. */
export const LEVELS = {
  easy: { power: 1.8, arm: 1.5, wind: 2.5, bucket: 4.5 },
  normal: { power: 1.35, arm: 1.05, wind: 4.5, bucket: 3.2 },
  hard: { power: 1.0, arm: 0.75, wind: 6.5, bucket: 2.2 },
};
const r1 = v => Math.round(v * 10) / 10;
/** A ping-pong meter t seconds after it started: 0 -> 1 -> 0 over one period. */
export const pingPong = (t, period) => { const f = (((t % period) + period) % period) / (period / 2); return f <= 1 ? f : 2 - f; };
/** The arm's angle (degrees) t seconds after the power was locked: a one-way swing ARM_MIN -> ARM_MAX (eases in). Past the end it stays up. */
export const armAt = (t, period) => { const k = Math.max(0, Math.min(1, t / period)); return ARM_MIN + (ARM_MAX - ARM_MIN) * (k * k * (3 - 2 * k)); };
/**
 * One fling. p 0..1 power, a = release angle in degrees, w = wind in m/s along the field (+ = tailwind).
 * -> { d: where it landed (m), lie: 'patch' | 'woods', t: seconds in the air, h: highest point (m) }.
 */
export function flight(p, a, w) {
  p = Math.max(0, Math.min(1, p)); a = Math.max(ARM_MIN, Math.min(ARM_MAX, a));
  const v = V_MAX * (0.35 + 0.65 * p), th = a * Math.PI / 180, vx = v * Math.cos(th), vy = v * Math.sin(th);
  const t = 2 * vy / G, h = vy * vy / (2 * G);
  const d = Math.max(1, vx * t + w * t * 0.9);
  return { d: r1(d), lie: d > WALL ? 'woods' : 'patch', t: r1(t), h: r1(h) };
}
/** Points for a fling against that fling's bucket: metres (in the patch only) + the bucket bonus. */
export const pointsFor = (f, bucket, reach) => f.lie !== 'patch' ? 0 : Math.round(f.d) + (Math.abs(f.d - bucket) <= reach ? BUCKET_BONUS : 0);
export const valid = d => d && typeof d === 'object' && Number.isFinite(d.p) && Number.isFinite(d.a) && d.p >= 0 && d.p <= 1 && d.a >= ARM_MIN - 1e-9 && d.a <= ARM_MAX + 1e-9;
/** The power + angle a careful player aims for to land at distance `target` with wind w (search; used by tests and bots). */
export function bestFor(target, w) {
  let best = null;
  for (let p = 0; p <= 1.0001; p += 0.01) for (let a = 30; a <= 60; a += 1) { const f = flight(p, a, w), e = Math.abs(f.d - target); if (!best || e < best.e) best = { p: Math.round(p * 100) / 100, a, e }; }
  return best;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid);
  // wind and the scarecrow's bucket for fling 1, 2, 3 (the same for everyone): a calmer first fling, the bucket further each time
  const winds = Array.from({ length: FLINGS }, (_, k) => r1(L.wind * rng.range(0.3 + k * 0.25, 1) * (rng.chance(0.5) ? 1 : -1)));
  const buckets = Array.from({ length: FLINGS }, (_, k) => Math.round(rng.range(62 + k * 12, 84 + k * 12)));
  const P = new Map(pids.map(pid => [pid, { fl: [], busy: 0 }]));
  let time = meta.seconds - 1, start = START_S, over = false;
  const events = [];
  const best = pid => Math.max(0, ...P.get(pid).fl.map(f => f.pts));
  return {
    events,
    init: () => ({ winds, buckets, flings: FLINGS, level: L, wall: WALL, bonus: BUCKET_BONUS, flight: FLIGHT, arm: [ARM_MIN, ARM_MAX], medals: pids.length === 1 ? MEDALS : null }),
    act(pid, a, d) {
      const s = P.get(pid); if (!s || over || start > 0) return;
      if (a !== 'fling' || !valid(d) || s.busy > 0 || s.fl.length >= FLINGS) return;
      const k = s.fl.length, f = flight(d.p, d.a, winds[k]), pts = pointsFor(f, buckets[k], L.bucket);
      s.fl.push({ ...f, pts }); s.busy = FLIGHT;
      events.push({ e: 'fling', pid, k, ...f, pts, bucket: pts > Math.round(f.d), p: Math.round(d.p * 100) / 100, a: Math.round(d.a) });
    },
    step(dt) {
      if (over) return;
      time -= dt; if (start > 0) start -= dt;
      for (const [pid, s] of P) if (s.busy > 0) { s.busy -= dt; if (s.busy <= 0) { s.busy = 0; const f = s.fl[s.fl.length - 1]; events.push({ e: 'land', pid, k: s.fl.length - 1, d: Math.round(f.d), lie: f.lie, pts: f.pts }); } }
      if (pids.every(pid => { const s = P.get(pid); return s.fl.length >= FLINGS && s.busy <= 0; }) || time <= 0) { over = true; events.push({ e: 'end' }); }
    },
    state() {
      const sc = {}, n = {}, busy = {};
      for (const pid of pids) { const s = P.get(pid); sc[pid] = best(pid); n[pid] = s.fl.length; busy[pid] = s.busy > 0 ? 1 : 0; }
      return { sc, n, busy, go: start <= 0 ? 1 : 0, left: Math.max(0, Math.ceil(time)) };
    },
    get over() { return over; },
    result() {
      const rows = pids.map(pid => { const s = P.get(pid); return { pid, best: best(pid), n: s.fl.length }; });
      rows.sort((a, b) => b.best - a.best || b.n - a.n);
      const order = [];
      for (const r of rows) { const g = order[order.length - 1]; if (g && g.best === r.best && g.n === r.n) g.pids.push(r.pid); else order.push({ ...r, pids: [r.pid] }); }
      return { order: order.map(o => o.pids), scores: Object.fromEntries(rows.map(r => [r.pid, r.best])), unit: meta.unit };
    },
  };
}
