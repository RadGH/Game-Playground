// KRAKEN COVE — co-op boss fight (round 8). The team stands on a round wooden dock in a cove; a big goofy purple
// kraken (round head, googly eyes, a sailor's hat) peeks over the water behind it. Its TENTACLES rise out of the
// water round the dock's edge, one at a time or a few at once, and every one does the same readable thing:
//   RISE (0.6 s): it pokes up at the edge — no danger yet.
//   WIND-UP (1.3 s; 1.6 easy, 1.05 hard): it rears back and the dock shows exactly where it will hit, in red —
//     SLAM: a long strip from the edge toward the middle.   SWEEP: a curved band along the edge, with an arrow showing
//     which way it will sweep.
//   STRIKE: the slam lands at once; the sweep takes 0.6 s to cross its band. Caught = knocked back + dizzy (1 s).
//   REST (2.8 s; 3.4 easy, 2.2 hard): it lies flat on the dock, glowing gold at the tip — WHACK it (A, standing next
//     to it). 3 whacks and it yanks itself back into the water early (the third whack counts double).
//   SINK: it slides away; another rises somewhere else.
// Whacks drain the kraken's courage bar; empty it before the bell and it swims off. Scores = whacks each player landed.
// The kraken never blocks: a resting tentacle always takes the whack. Solo: two tentacles at a time, a smaller bar.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { r2, clamp, byDiff, angDiff, knock, presses, segDist, coopResult } from '../boss-kit.js';

const R = 7.2;
export const meta = {
  id: 'kraken-cove', title: 'Kraken Cove', blurb: 'Dodge the tentacle slams and sweeps, then whack them while they rest!',
  how: ['A tentacle rears up and the dock shows where it will hit in red. Get clear!', 'After it hits, it rests on the dock glowing gold: WHACK it with A!', '3 whacks sends a tentacle packing early.', 'Empty the kraken’s courage bar before the bell!'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'coop', unit: 'whacks', tags: ['coop', 'action'],
  controls: { stick: true, a: 'Whack' }, move: { speed: 6, accel: 30, stunDrag: 2.6 },
  arena: { shape: 'circle', r: R, wall: true }, pitch: 60, card: 'card-kraken-cove', css: false,
};
export const RULES = {
  start: 2.2, rise: 0.6, strike: 0.6, sink: 0.5,
  warn: { easy: 1.6, normal: 1.3, hard: 1.05 }, rest: { easy: 3.4, normal: 2.8, hard: 2.2 },
  hp: { easy: 36, normal: 56, hard: 72 }, hpPer: 0.3,                // x (1 + hpPer * (players - 1))
  len: 5.2, halfW: 0.85, reach: 1.25, sweepSpan: 1.7, bandIn: 3.4,   // slam strip; whack reach from the strip; sweep band depth
  maxHits: 3, cool: 0.3, hurtStun: 1.0, invuln: 1.4, knock: 6.5,
  active: n => (n <= 2 ? 2 : 3), rampAt: 30, gap: [0.6, 1.4],
};
/** The strip a tentacle lies along (or slams), from the dock's edge at angle `a` inward. */
export const strip = a => ({ ax: Math.sin(a) * R, az: Math.cos(a) * R, bx: Math.sin(a) * (R - RULES.len), bz: Math.cos(a) * (R - RULES.len) });
export const hpFor = (n, difficulty) => Math.round(byDiff(difficulty, RULES.hp) * (1 + RULES.hpPer * (n - 1)));

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 1.6, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { stun: 0, inv: 0, cool: 0, whacks: 0 }]));
  const hpMax = hpFor(n, difficulty), warn = byDiff(difficulty, RULES.warn), rest = byDiff(difficulty, RULES.rest);
  let hp = hpMax, time = meta.seconds, elapsed = 0, over = false, success = false, wait = RULES.start, tid = 0;
  let tents = [];
  const events = [];

  function pickAngle() {
    for (let k = 0; k < 16; k++) {
      let a;
      if (rng.chance(0.65)) { const b = bodies.get(rng.pick(pids)); a = (Math.hypot(b.x, b.z) > 0.5 ? Math.atan2(b.x, b.z) : rng.range(-Math.PI, Math.PI)) + rng.range(-0.45, 0.45); }
      else a = rng.range(-Math.PI, Math.PI);
      if (tents.every(t => Math.abs(angDiff(a, t.a)) > 1.0)) return a;
    }
    return rng.range(-Math.PI, Math.PI);
  }
  function spawn() {
    const a = pickAngle(), kind = elapsed > 6 && rng.chance(0.4) ? 'sweep' : 'slam', dir = rng.chance(0.5) ? 1 : -1;
    const t = { id: ++tid, a: r2(a), kind, dir, ph: 'rise', left: RULES.rise, total: RULES.rise, hits: 0, at: r2(a) };
    if (kind === 'sweep') { t.a0 = r2(a - dir * RULES.sweepSpan / 2); t.a1 = r2(a + dir * RULES.sweepSpan / 2); t.at = t.a0; }
    tents.push(t); events.push({ e: 'rise', id: t.id, kind });
  }
  function hurt(pid, fx, fz) {
    const s = P.get(pid), b = bodies.get(pid); if (s.inv > 0 || over) return;
    s.inv = RULES.invuln; s.stun = RULES.hurtStun; knock(b, fx, fz, RULES.knock);
    events.push({ e: 'hurt', pid });
  }
  function next(t) {
    if (t.ph === 'rise') { t.ph = 'wind'; t.left = t.total = warn * (elapsed > 40 ? 0.9 : 1); events.push({ e: 'wind', id: t.id, kind: t.kind }); }
    else if (t.ph === 'wind') {
      t.ph = 'strike'; t.left = t.total = t.kind === 'sweep' ? RULES.strike : 0.15;
      if (t.kind === 'slam') {
        const s = strip(t.a); events.push({ e: 'slam', id: t.id });
        for (const [pid, b] of bodies) if (segDist(b.x, b.z, s.ax, s.az, s.bx, s.bz) <= RULES.halfW + 0.3) {
          const ex = s.bx - s.ax, ez = s.bz - s.az, k = clamp(((b.x - s.ax) * ex + (b.z - s.az) * ez) / (ex * ex + ez * ez), 0, 1);
          hurt(pid, s.ax + ex * k, s.az + ez * k);          // knocked sideways off the strip
        }
      } else events.push({ e: 'sweep', id: t.id });
    } else if (t.ph === 'strike') { t.ph = 'rest'; t.at = t.kind === 'sweep' ? t.a1 : t.a; t.left = t.total = rest; events.push({ e: 'rest', id: t.id }); }
    else if (t.ph === 'rest') { t.ph = 'sink'; t.left = t.total = RULES.sink; events.push({ e: 'sink', id: t.id, beaten: 0 }); }
    else { t.gone = true; }
  }
  function whack(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    let best = null, bd = RULES.reach;
    for (const t of tents) if (t.ph === 'rest') { const sg = strip(t.at), d = segDist(b.x, b.z, sg.ax, sg.az, sg.bx, sg.bz); if (d <= bd) { bd = d; best = t; } }
    if (!best) { events.push({ e: 'swing', pid }); return; }
    best.hits++; const dmg = Math.min(hp, best.hits >= RULES.maxHits ? 2 : 1); hp -= dmg; s.whacks += dmg;
    events.push({ e: 'whack', pid, id: best.id, hits: best.hits, dmg });
    if (best.hits >= RULES.maxHits) { best.ph = 'sink'; best.left = best.total = RULES.sink; events.push({ e: 'sink', id: best.id, beaten: 1 }); }
    if (hp <= 0) finish(true);
  }
  function finish(ok) {
    over = true; success = ok;
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~F.STUN; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ hpMax, solo: n === 1 }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const pr = presses(s, inp);
      if (pr.a && !(b.flags & F.STUN) && s.cool <= 0) { s.cool = RULES.cool; whack(pid); }
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      time -= dt; elapsed += dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        s.cool = Math.max(0, s.cool - dt); s.inv = Math.max(0, s.inv - dt);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
      }
      for (const t of tents) {
        if (t.ph === 'strike' && t.kind === 'sweep') {
          const k0 = 1 - t.left / t.total, k1 = Math.min(1, 1 - (t.left - dt) / t.total);
          const s0 = t.a0 + (t.a1 - t.a0) * k0, s1 = t.a0 + (t.a1 - t.a0) * k1; t.at = r2(s1);
          for (const [pid, b] of bodies) {
            const rr = Math.hypot(b.x, b.z), ang = Math.atan2(b.x, b.z); if (rr < R - RULES.bandIn - 0.3) continue;
            const lo = Math.min(s0, s1) - 0.08, hi = Math.max(s0, s1) + 0.08, rel = t.a0 + angDiff(ang, t.a0);   // unwrap near a0
            if (rel >= lo && rel <= hi) { const tx = t.dir * Math.cos(ang), tz = -t.dir * Math.sin(ang); hurt(pid, b.x - tx * 2 + Math.sin(ang) * 1.5, b.z - tz * 2 + Math.cos(ang) * 1.5); }   // swept along + inward
          }
        }
        t.left -= dt; if (t.left <= 0) next(t);
      }
      tents = tents.filter(t => !t.gone);
      const cap = RULES.active(n) + (elapsed > RULES.rampAt ? 1 : 0);
      if (tents.length < cap) { wait -= dt; if (wait <= 0) { spawn(); wait = rng.range(RULES.gap[0], RULES.gap[1]); } }
      if (time <= 0) finish(hp <= 0);
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = P.get(pid).whacks;
      return { hp, sc, left: Math.max(0, Math.ceil(time)), end: over ? (success ? 1 : 2) : 0,
        tn: tents.map(t => [t.id, t.a, t.kind === 'sweep' ? 1 : 0, t.ph, r2(Math.max(0, t.left)), r2(t.total), t.at, t.hits, t.dir, t.a0 ?? t.a, t.a1 ?? t.a]) };
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).whacks;
      return coopResult(pids, scores, over ? success : hp <= 0, meta.unit);
    },
  };
}
