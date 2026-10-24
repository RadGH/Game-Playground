// HOOP FRENZY — a fairground hoops booth, one lane and one hoop per player, side by side, 45 seconds. HOLD the big
// button: the power meter swings up and back; LET GO inside the green band. The band moves because your spot does:
// after every shot you step to the next mark (close, middle, far, middle…) and a further mark needs more power. The
// far mark is a 3. Three makes in a row sets your ball ON FIRE (every make counts double until you miss). Halfway
// through, the hoops start to slide side to side: the ball leads a moving hoop a little, so the shots that drop are
// the ones let go as the hoop slows at the end of its slide. The last 10 seconds are MONEY BALLS (gold, double again).
// The meter runs on the phone (lag never moves it); it sends `shoot { p, ht }` = the power it locked and the hoop
// clock it saw, and the server flies the shot with the hoops kit and sends the whole flight to everyone.
// Solo: beat the medal scores.
import { flyShot, release, qualityOf, idealPower, tolFor, hoopDist, HOOP_R, groupBy } from '../hoops-kit.js';

export const meta = {
  id: 'hoop-frenzy', title: 'Hoop Frenzy', blurb: 'Hold, let go in the green, sink it — three in a row and your ball catches fire!',
  how: ['HOLD the button, let go when the meter is in the GREEN.', 'Every shot moves you to a new mark: further back needs more power.', '3 in a row = ON FIRE (double points). Last 10 s: gold money balls!'],
  kind: 'ui', min: 1, max: 4, seconds: 45, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-hoop-frenzy', css: true,
};

export const PLAY = 42;                                             // shooting time (the room allows meta.seconds)
export const RIM_Y = 3.05, REL_Y = 1.95, LANE = 2.6, HOOP_Z = -4.2, START = 1.5, RELOAD = 0.8, MONEY_S = 10, FIRE_AT = 3;
/** Your marks, in metres from the hoop (the 3rd is a three-pointer); you step to the next one after every shot. */
export const SPOTS = [2.7, 3.9, 5.4, 3.9];
export const THREE_AT = 5;
/** Meter period (s for 0 -> 1 -> 0), the green band's half width, the hoop's slide (amplitude m, period s, when it
 *  starts as a share of the round) and how much the ball leads a moving hoop (1 = all of it). */
export const LEVELS = {
  easy:   { period: 1.8, tol: 0.095, slide: 0.5, slideP: 5.2, slideAt: 0.55, lead: 0.88 },
  normal: { period: 1.5, tol: 0.075, slide: 0.8, slideP: 5.0, slideAt: 0.5, lead: 0.85 },
  hard:   { period: 1.2, tol: 0.058, slide: 1.1, slideP: 4.4, slideAt: 0.42, lead: 0.8 },
};
export const MEDALS = [[130, 'gold'], [80, 'silver'], [40, 'bronze']];
const r2 = v => Math.round(v * 100) / 100;
export const laneX = (i, n) => (i - (n - 1) / 2) * LANE;
/** Hoop i's x offset from its lane at hoop-clock t (seconds since the start). */
export function slideAt(L, t, i, total = PLAY) {
  const t0 = total * L.slideAt; if (t < t0) return 0;
  const ramp = Math.min(1, (t - t0) / 2);                          // eases in over two seconds
  return ramp * L.slide * Math.sin((t - t0) * Math.PI * 2 / L.slideP + i * 1.9);
}
/** Where you stand for shot k: straight out from your hoop, SPOTS[k % 4] metres away. */
export const spotOf = (i, n, k) => ({ x: laneX(i, n), z: HOOP_Z + SPOTS[k % SPOTS.length] });
export const valid = d => d && typeof d === 'object' && Number.isFinite(d.p) && d.p >= 0 && d.p <= 1 && Number.isFinite(d.ht);

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, n = players.length, pids = players.map(p => p.pid), events = [];
  const P = new Map(players.map((p, i) => [p.pid, { i, k: 0, sc: 0, streak: 0, best: 0, makes: 0, shots: 0, cool: 0, fly: [] }]));
  let time = -START, over = false;                                  // time = the hoop clock (0 = the start whistle)
  const hoopAt = (i, t) => ({ x: laneX(i, n) + slideAt(L, t, i), y: RIM_Y, z: HOOP_Z, r: HOOP_R, nx: 0, nz: 1 });
  const left = () => Math.max(0, Math.ceil(PLAY - Math.max(0, time)));
  const money = t => t >= PLAY - MONEY_S;
  function shoot(pid, s, p, ht) {
    const from = spotOf(s.i, n, s.k), d = hoopDist(from.x, from.z, hoopAt(s.i, ht)), q = qualityOf(p, SPOTS[s.k % SPOTS.length], L.tol);
    // the ball leads a sliding hoop by `lead` of how far it moves while the ball is up there (~1 s)
    const T0 = 0.6 + d * 0.11, aimX = hoopAt(s.i, ht).x + (hoopAt(s.i, ht + T0).x - hoopAt(s.i, ht).x) * L.lead;
    const rel = release(from.x, REL_Y, from.z, aimX, HOOP_Z, RIM_Y, q);
    const f = flyShot(rel, t => hoopAt(s.i, ht + t));
    const three = SPOTS[s.k % SPOTS.length] >= THREE_AT, gold = money(ht);
    s.shots++; s.k++; s.cool = RELOAD;
    const shot = { pid, at: r2(ht), T: f.T, made: f.made, three, gold, path: f.path, q: r2(q), p: r2(p) };
    s.fly.push({ left: f.T, shot });
    events.push({ e: 'shot', pid, k: s.k - 1, path: f.path, T: f.T, made: f.made ? 1 : 0, three: three ? 1 : 0, gold: gold ? 1 : 0, ht: r2(ht), fire: s.streak >= FIRE_AT ? 1 : 0 });
  }
  function land(pid, s, shot) {
    if (shot.made) {
      const fire = s.streak >= FIRE_AT, pts = (shot.three ? 3 : 2) * (fire ? 2 : 1) * (shot.gold ? 2 : 1);
      s.sc += pts; s.makes++; s.streak++; s.best = Math.max(s.best, s.streak);
      events.push({ e: 'make', pid, pts, fire: fire ? 1 : 0, lit: !fire && s.streak >= FIRE_AT ? 1 : 0, three: shot.three ? 1 : 0, gold: shot.gold ? 1 : 0 });
    } else { const was = s.streak; s.streak = 0; events.push({ e: 'miss', pid, out: was >= FIRE_AT ? 1 : 0, q: shot.q }); }
  }
  return {
    events,
    init: () => ({ n, level: L, spots: SPOTS, threeAt: THREE_AT, rimY: RIM_Y, relY: REL_Y, lane: LANE, hoopZ: HOOP_Z, total: PLAY, money: MONEY_S, fireAt: FIRE_AT, lanes: Object.fromEntries(players.map((p, i) => [p.pid, i])), medals: n === 1 ? MEDALS : null }),
    act(pid, a, d) {
      const s = P.get(pid); if (!s || over || time < 0 || time >= PLAY) return;
      if (a !== 'shoot' || !valid(d) || s.cool > 0) return;
      const ht = Math.max(time - 0.6, Math.min(time, d.ht));          // the hoop clock that phone saw (a little lag is fine)
      shoot(pid, s, d.p, Math.max(0, ht));
    },
    step(dt) {
      if (over) return;
      time += dt;
      for (const [pid, s] of P) {
        if (s.cool > 0) s.cool = Math.max(0, s.cool - dt);
        for (const f of s.fly) { f.left -= dt; if (f.left <= 0 && !f.done) { f.done = true; land(pid, s, f.shot); } }
        s.fly = s.fly.filter(f => !f.done);
      }
      if (time >= PLAY && [...P.values()].every(s => !s.fly.length)) { over = true; events.push({ e: 'end' }); }
      if (!over && time >= PLAY + 1.4) { for (const [pid, s] of P) for (const f of s.fly) if (!f.done) { f.done = true; land(pid, s, f.shot); } over = true; events.push({ e: 'end' }); }
    },
    state() {
      const sc = {}, st = {};
      for (const [pid, s] of P) { sc[pid] = s.sc; st[pid] = [s.k, s.streak, s.cool > 0 ? 1 : 0]; }
      return { sc, st, go: time >= 0 && time < PLAY ? 1 : 0, mb: money(time) ? 1 : 0, left: left() };   // no clock: a phone syncs its hoop clock when `go` or `left` changes
    },
    get over() { return over; },
    result() {
      const rows = pids.map(pid => ({ pid, key: P.get(pid).sc }));
      return { order: groupBy(rows), scores: Object.fromEntries(rows.map(r => [r.pid, r.key])), unit: meta.unit, makes: Object.fromEntries(pids.map(pid => [pid, [P.get(pid).makes, P.get(pid).shots, P.get(pid).best]])) };
    },
    _debug: { P, L, hoopAt, get time() { return time; }, ideal: k => idealPower(SPOTS[k % SPOTS.length]), tol: k => tolFor(SPOTS[k % SPOTS.length], L.tol) },
  };
}
