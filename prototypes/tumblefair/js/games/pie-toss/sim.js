// PIE TOSS — a fairground pie booth. Painted face cut-outs slide along three rails (the back rail is small and quick,
// the front one big and slow) and now and then one pops up from behind the counter. Tap the booth where you want your
// pie to land: it takes about half a second to get there, so you throw where a face is GOING, not where it is.
//   plain faces 1 · the shiny GOLD face 3 (quicker) · Granny's cut-out -3 (she is lovely; leave her alone)
// Everyone throws at the same booth at the same time, so you can steal a splat. A pie every RELOAD seconds. Most points
// wins; solo = medals.
//
// TIMING (Apple Bobbing's trick, shared in toss-kit.js): every cut-out's motion is a fixed function of time, the same
// on the phone and the server. The phone counts its own clock and sends `throw` { x, y, t } (where it aimed, when it
// let go). The server checks t, lands the pie at t + FLIGHT and asks which cut-out was there THEN.
import { phoneTime, placeOrder, r1, r2 } from '../toss-kit.js';

export const meta = {
  id: 'pie-toss', title: 'Pie Toss', blurb: 'Splat the sliding faces with cream pies, but never Granny!',
  how: ['Tap the booth to throw a pie there. It takes half a second to land!', 'Throw where a face is GOING. Gold faces are worth 3.', 'Splat Granny and you lose 3 points.'],
  kind: 'ui', min: 1, max: 4, seconds: 54, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-pie-toss', css: true,
};
export const BW = 160, BH = 100;
export const COUNT_S = 3, PLAY_S = 45, END_S = 3;
export const RAILS = [{ y: 30, s: 0.72, v: 1.35 }, { y: 54, s: 0.88, v: 1.1 }, { y: 80, s: 1.05, v: 0.85 }];   // y on the booth, size, speed share
export const FACE_R = 11, FACE_H = 13;          // a face's half-width and half-height at size 1 (booth units)
export const RISE = 0.22;                         // seconds a cut-out takes to swing up (or down); only hittable when up
export const WORTH = { face: 1, gold: 3, granny: -3 };
export const LOOKS = ['clown', 'bear', 'pirate', 'robot', 'frog', 'strongman', 'knight', 'owl'];
export const MEDALS = [12, 22, 32];
export const LAG_S = 1.0, AHEAD_S = 0.15;
export const LEVELS = {
  easy: { speed: 0.75, flight: 0.42, reload: 0.5, granny: 0.08, gold: 0.1, gap: [0.55, 0.9] },
  normal: { speed: 1, flight: 0.5, reload: 0.6, granny: 0.12, gold: 0.11, gap: [0.45, 0.8] },
  hard: { speed: 1.28, flight: 0.56, reload: 0.65, granny: 0.17, gold: 0.12, gap: [0.38, 0.7] },
};

/** The whole show, the same for everyone: [{ id, kind, look, rail, t0, t1, x0, v, pop }]. */
export function makeTargets(rng, L) {
  const out = []; let t = 0.4, id = 0;
  while (t < PLAY_S - 0.6) {
    const r = rng(), kind = out.length < 3 ? 'face' : r < L.granny ? 'granny' : r < L.granny + L.gold ? 'gold' : 'face';
    const rail = rng.int(0, 2), R = RAILS[rail], pop = rng.chance(0.22);
    const look = kind === 'face' ? rng.pick(LOOKS) : kind;
    if (pop) {
      const life = rng.range(1.4, 2.2) / L.speed * (kind === 'gold' ? 0.75 : 1);
      out.push({ id: ++id, kind, look, rail, t0: r2(t), t1: r2(t + life), x0: r1(rng.range(22, BW - 22)), v: 0, pop: 1 });
    } else {
      const dir = rng.chance(0.5) ? 1 : -1, speed = rng.range(24, 40) * R.v * L.speed * (kind === 'gold' ? 1.4 : 1);
      const x0 = dir > 0 ? -FACE_R * R.s : BW + FACE_R * R.s, life = (BW + 2 * FACE_R * R.s) / speed;
      out.push({ id: ++id, kind, look, rail, t0: r2(t), t1: r2(t + life), x0: r1(x0), v: r1(dir * speed), pop: 0 });
    }
    t += rng.range(L.gap[0], L.gap[1]);
  }
  return out;
}
/** Where a cut-out is at time t: { x, y, up (0..1, how far it has swung up), s } or null when it is not out. */
export function targetAt(c, t) {
  if (t < c.t0 || t > c.t1) return null;
  const R = RAILS[c.rail], up = Math.min(1, (t - c.t0) / RISE, (c.t1 - t) / RISE);
  return { x: c.x0 + c.v * (t - c.t0), y: R.y, up: Math.max(0, up), s: R.s };
}
/** Which cut-out (not yet splatted before time T) a pie landing at (x, y) at time T hits, or null. The front rail is
 *  checked first (it is in front), then the nearest. `hitAt(c)` = when that one was splatted, or Infinity. */
export function pieHits(targets, x, y, T, hitAt = () => Infinity) {
  let best = null, bk = -1e9;
  for (const c of targets) {
    if (T < c.t0 || T > c.t1 || hitAt(c) <= T) continue;
    const p = targetAt(c, T); if (!p || p.up < 0.75) continue;
    const dx = Math.abs(p.x - x), dy = Math.abs(p.y - y);
    if (dx > FACE_R * p.s || dy > FACE_H * p.s) continue;
    const k = c.rail * 100 - dx;
    if (k > bk) { bk = k; best = c; }
  }
  return best;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const targets = makeTargets(rng, L), byId = new Map(targets.map(c => [c.id, c]));
  const hit = new Map();                                  // target id -> { T, pid }
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, last: null, splats: 0, gold: 0, granny: 0, miss: 0, thrown: 0 }]));
  const pies = [];                                        // in the air: { pid, x, y, t, T }
  let phase = 'count', left = COUNT_S, el = 0, over = false;
  const events = [];
  function land(pie) {
    const c = pieHits(targets, pie.x, pie.y, pie.T, c2 => hit.get(c2.id)?.T ?? Infinity), s = S[pie.pid];
    if (!c) { s.miss++; events.push({ e: 'miss', pid: pie.pid, x: pie.x, y: pie.y }); return; }
    hit.set(c.id, { T: pie.T, pid: pie.pid });
    const w = WORTH[c.kind]; s.pts = Math.max(0, s.pts + w); s.splats++; if (c.kind === 'gold') s.gold++; if (c.kind === 'granny') s.granny++;
    const p = targetAt(c, pie.T);
    events.push({ e: 'splat', pid: pie.pid, id: c.id, kind: c.kind, pts: w, x: r1(p.x), y: p.y, T: r2(pie.T) });
  }
  return {
    events,
    init: () => ({ targets, bw: BW, bh: BH, rails: RAILS, faceR: FACE_R, faceH: FACE_H, rise: RISE, worth: WORTH, flight: L.flight, reload: L.reload, play: PLAY_S, count: COUNT_S, solo, medals: MEDALS }),
    act(pid, a, d) {
      if (a !== 'throw' || !S[pid] || phase !== 'play' || over) return;
      const s = S[pid], t = phoneTime(d, el, s.last, { ahead: AHEAD_S, lag: LAG_S, gap: L.reload, max: PLAY_S });
      if (t == null || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
      const x = r1(Math.max(0, Math.min(BW, d.x))), y = r1(Math.max(0, Math.min(BH, d.y)));
      s.last = t; s.thrown++;
      pies.push({ pid, x, y, t, T: t + L.flight });
      events.push({ e: 'throw', pid, x, y, t: r2(t) });
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      el += dt;
      pies.sort((a, b) => a.T - b.T);
      while (pies.length && pies[0].T <= el + 1e-9) land(pies.shift());
      if (phase === 'play' && el >= PLAY_S + L.flight) { while (pies.length) land(pies.shift()); phase = 'end'; events.push({ e: 'end' }); }
      if (phase === 'end' && el >= PLAY_S + L.flight + END_S) over = true;
    },
    state() {
      const sc = {}; for (const p of pids) sc[p] = S[p].pts;
      return { phase, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : Math.max(0, Math.ceil(PLAY_S - el)), el: Math.floor(el * 2) / 2, sc,
        hit: [...hit].map(([id, h]) => [id, h.pid]).slice(-24) };
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts]));
      return { order: placeOrder(pids, p => S[p].pts), scores, unit: meta.unit,
        ...(solo ? { medal: MEDALS.filter(m => S[pids[0]].pts >= m).length } : {}) };
    },
    // for tests
    get _el() { return el; }, get _phase() { return phase; }, _targets: targets, _stats: S, _hit: hit, _level: L, _byId: byId,
  };
}
