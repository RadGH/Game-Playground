// GOLEM SMASH — co-op boss fight (round 8). A big friendly-grumpy stone golem stomps round a quarry yard.
// Each turn it walks toward one of the team (it takes turns picking on everybody), stops, raises both fists and SLAMS:
// a red ring on the ground shows exactly where, and fills up until the fists land (1.25 s, more on easy) — be out of
// it. From the second turn, pebbles also rain down while it walks (small rings, same rule).
// After every slam the golem is stuck for a few seconds and a glowing CRACK lights up on one of its limbs (a fist, a
// leg or its back) with a gold ring on the ground beside it: run there and press A to hit it. A crack takes a few hits
// (2 + one per player; 3 alone) — hits stay if it closes, and it opens again on the next slam. Break every crack
// before the bell. Getting slammed just knocks you back and stuns you for a moment; nothing is ever lost.
// The golem never blocks: every A on an open crack's ring lands. Scores = hits each player landed.
import { makeBody, stepBody, separate, spawnRing, clampToArena, F, BODY_R } from '../../shared/arena.js';
import { r2, clamp, byDiff, angDiff, knock, presses, coopResult } from '../boss-kit.js';

export const meta = {
  id: 'golem-smash', title: 'Golem Smash', blurb: 'Dodge the stone golem’s slams, then smash the glowing cracks together!',
  how: ['Red ring on the ground = the golem is about to slam there. Get out!', 'After a slam a crack GLOWS on one of its limbs (gold ring beside it).', 'Run to the gold ring and press A to hit the crack.', 'Break every crack before the bell!'],
  kind: 'arena', min: 1, max: 4, seconds: 72, scoring: 'coop', unit: 'hits', tags: ['coop', 'action'],
  controls: { stick: true, a: 'Smash' }, move: { speed: 6.2, accel: 30, stunDrag: 3 },
  arena: { shape: 'rect', hw: 9, hd: 6.5, wall: true }, pitch: 56, card: 'card-golem-smash', css: false,
};

/** Where a crack can open, in the golem's own frame: angle from its facing (radians) and distance from its middle. */
export const LIMBS = [
  { name: 'left fist', a: 0.42, d: 2.45 },
  { name: 'right fist', a: -0.42, d: 2.45 },
  { name: 'left leg', a: 2.2, d: 1.95 },
  { name: 'right leg', a: -2.2, d: 1.95 },
  { name: 'back', a: Math.PI, d: 2.0 },
];
export const RULES = {
  start: 2.2, golemR: 1.3,
  walk: { easy: 2.4, normal: 2.0, hard: 1.6 }, speed: { easy: 1.5, normal: 1.9, hard: 2.3 },
  warn: { easy: 1.5, normal: 1.25, hard: 1.0 }, open: { easy: 4.4, normal: 3.7, hard: 3.0 },
  cracks: { easy: 6, normal: 8, hard: 10 }, hitsPer: n => (n === 1 ? 3 : 2 + n),
  slamR: 2.1, slamAhead: 2.6, pebbleR: 1.05, pebbleWarn: 1.35, reach: 1.25, cool: 0.28,
  hurtStun: 0.8, invuln: 1.4, knock: 6.5, stagger: 0.8,
};
/** The ground spot beside a limb, for a golem at (x, z) facing yaw. */
export const limbSpot = (x, z, yaw, i) => { const L = LIMBS[i]; return { x: x + Math.sin(yaw + L.a) * L.d, z: z + Math.cos(yaw + L.a) * L.d }; };

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 2.2, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z * 0.5 + 3.8, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { stun: 0, inv: 0, cool: 0, hits: 0 }]));
  const K = byDiff(difficulty, RULES.cracks), H = RULES.hitsPer(n), hpMax = K * H;
  const G = { x: 0, z: -2.2, yaw: 0 };
  let time = meta.seconds, phase = 'ready', left = RULES.start, cyc = -1, over = false, success = false;
  let rings = [], rid = 0, crack = null, broken = 0, target = pids[0], hp = hpMax;
  const events = [];

  function hurt(pid, fx, fz) {
    const s = P.get(pid), b = bodies.get(pid); if (s.inv > 0 || over) return;
    s.inv = RULES.invuln; s.stun = RULES.hurtStun; knock(b, fx, fz, RULES.knock);
    events.push({ e: 'hurt', pid });
  }
  function beginWalk() {
    cyc++; phase = 'walk'; left = byDiff(difficulty, RULES.walk); target = pids[cyc % n];
    if (cyc >= 1) {                                     // pebble rain: a small ring near each player (+1 anywhere)
      for (let j = 0; j <= n; j++) {
        const b = j < n ? bodies.get(pids[j]) : null;
        const x = clamp(b ? b.x + rng.range(-1, 1) : rng.range(-A.hw + 1, A.hw - 1), -A.hw + 0.8, A.hw - 0.8);
        const z = clamp(b ? b.z + rng.range(-1, 1) : rng.range(-A.hd + 1, A.hd - 1), -A.hd + 0.8, A.hd - 0.8);
        const w = RULES.pebbleWarn + j * 0.15;
        rings.push({ id: ++rid, x: r2(x), z: r2(z), r: RULES.pebbleR, left: w, total: w, kind: 'pebble' });
      }
    }
    events.push({ e: 'walk', cyc, target });
  }
  function beginWind() {
    phase = 'wind'; const w = byDiff(difficulty, RULES.warn) * (cyc >= 5 ? 0.9 : 1); left = w;
    const x = clamp(G.x + Math.sin(G.yaw) * RULES.slamAhead, -A.hw + 0.6, A.hw - 0.6), z = clamp(G.z + Math.cos(G.yaw) * RULES.slamAhead, -A.hd + 0.6, A.hd - 0.6);
    rings.push({ id: ++rid, x: r2(x), z: r2(z), r: RULES.slamR, left: w, total: w, kind: 'slam' });
    events.push({ e: 'wind' });
  }
  function beginOpen() {
    phase = 'open'; left = byDiff(difficulty, RULES.open);
    if (!crack) crack = { left: H };
    const ok = LIMBS.map((_, i) => i).filter(i => { const p = limbSpot(G.x, G.z, G.yaw, i); return Math.abs(p.x) < A.hw - 0.3 && Math.abs(p.z) < A.hd - 0.3; });
    crack.limb = ok.length ? rng.pick(ok) : 0;
    events.push({ e: 'crack', limb: crack.limb });
  }
  function hit(pid) {
    const b = bodies.get(pid), s = P.get(pid);
    if (phase !== 'open' || !crack) { events.push({ e: 'swing', pid }); return; }
    const p = limbSpot(G.x, G.z, G.yaw, crack.limb);
    if (Math.hypot(b.x - p.x, b.z - p.z) > RULES.reach) { events.push({ e: 'swing', pid }); return; }
    crack.left--; hp--; s.hits++;
    events.push({ e: 'hit', pid, limb: crack.limb, left: crack.left });
    if (crack.left <= 0) {
      broken++; crack = null; events.push({ e: 'broke', pid, broken });
      if (broken >= K) return finish(true);
      phase = 'stagger'; left = RULES.stagger;
    }
  }
  function finish(ok) {
    over = true; success = ok; phase = 'end'; rings = [];
    for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~F.STUN; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ hpMax, cracks: K, hitsPer: H, solo: n === 1 }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const pr = presses(s, inp);
      if (pr.a && !(b.flags & F.STUN) && s.cool <= 0) { s.cool = RULES.cool; hit(pid); }
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      time -= dt; left -= dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        s.cool = Math.max(0, s.cool - dt); s.inv = Math.max(0, s.inv - dt);
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        // the golem is solid
        const dx = b.x - G.x, dz = b.z - G.z, d = Math.hypot(dx, dz), min = RULES.golemR + BODY_R;
        if (d < min) { if (d < 1e-3) b.x += min; else { b.x += dx / d * (min - d); b.z += dz / d * (min - d); } clampToArena(b, A); }
      }
      // the golem walks toward its target
      if (phase === 'walk') {
        const t = bodies.get(target), dx = t.x - G.x, dz = t.z - G.z, d = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz); G.yaw += clamp(angDiff(want, G.yaw), -3 * dt, 3 * dt);
        if (d > RULES.slamAhead) { const v = byDiff(difficulty, RULES.speed) * dt; G.x += Math.sin(G.yaw) * v; G.z += Math.cos(G.yaw) * v; }
        G.x = clamp(G.x, -A.hw + 2.4, A.hw - 2.4); G.z = clamp(G.z, -A.hd + 2.4, A.hd - 2.4);
      }
      for (const r of rings) {
        r.left -= dt;
        if (r.left <= 0) {
          events.push({ e: r.kind === 'slam' ? 'slam' : 'pebble', x: r.x, z: r.z });
          for (const [pid, b] of bodies) if (Math.hypot(b.x - r.x, b.z - r.z) <= r.r + 0.2) hurt(pid, r.x, r.z);
        }
      }
      rings = rings.filter(r => r.left > 0);
      if (left <= 0) {
        if (phase === 'ready' || phase === 'stagger') beginWalk();
        else if (phase === 'walk') beginWind();
        else if (phase === 'wind') beginOpen();
        else if (phase === 'open') { events.push({ e: 'close' }); beginWalk(); }
      }
      if (time <= 0) finish(broken >= K);
    },
    state() {
      const sc = {}; for (const pid of pids) sc[pid] = P.get(pid).hits;
      const g = { ph: phase, gx: r2(G.x), gz: r2(G.z), gy: r2(G.yaw), hp, br: broken, sc, left: Math.max(0, Math.ceil(time)), tg: target };
      g.rg = rings.map(r => [r.id, r.x, r.z, r.r, r2(r.left), r2(r.total)]);
      if (crack && phase === 'open') g.ck = [crack.limb, crack.left, r2(Math.max(0, left))];
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).hits;
      return coopResult(pids, scores, over ? success : broken >= K, meta.unit);
    },
  };
}
