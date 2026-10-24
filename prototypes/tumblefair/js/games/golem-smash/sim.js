// GOLEM SMASH — co-op boss fight (round 8). A big friendly-grumpy stone golem stomps round a quarry yard.
// Each turn it walks toward one of the team (it takes turns picking on everybody), stops, raises both fists and SLAMS:
// a red ring on the ground shows exactly where, and fills up until the fists land (1.25 s, more on easy) — be out of
// it. From the second turn, pebbles also rain down while it walks (small rings, same rule).
// After every slam the golem is stuck for a few seconds and a glowing CRACK lights up on one of its limbs (a fist, a
// leg or its back) with a gold ring on the ground beside it: run there and press A to hit it. A crack takes a few hits
// (2 + one per player; 3 alone) — hits stay if it closes, and it opens again on the next slam. Break every crack
// before the bell. Getting slammed just knocks you back and stuns you for a moment; nothing is ever lost.
// The golem never blocks: every A on an open crack's ring lands. Scores = hits each player landed (cracks + rubblings).
// Round 9 (live reports 2026-10-23, "too easy, needs adds" + "jump on people and stun them"): every slam shakes loose
// RUBBLINGS — little rock critters that waddle after the nearest player and bonk them (a short stun, like the slam's
// but smaller). A swing (A) near one smashes it; so does landing on it. B JUMPS, and landing on a team-mate's head
// bounces you up again and leaves them seeing stars for a moment — it costs the team, so it is a joke, not a tactic.
// Round 12 (1/1): the rubblings turned into a stun-lock. A rubbling rested 1.1 s after a bonk and came again, so a
// perfect team that dodged every slam was still knocked dizzy ~60 (2 players) to ~110 (4 players) times a game on
// normal — you were out of control every couple of seconds. Now a rubbling CRUMBLES when it bonks someone (each one
// is one bonk at most, smash it first and it is a point), so the same team is bonked a handful of times.
import { makeBody, stepBody, separate, spawnRing, clampToArena, F, BODY_R } from '../../shared/arena.js';
import { r2, clamp, byDiff, angDiff, knock, presses, coopResult } from '../boss-kit.js';

export const meta = {
  id: 'golem-smash', title: 'Golem Smash', blurb: 'Dodge the stone golem’s slams, then smash the glowing cracks together!',
  how: ['Red ring on the ground = the golem is about to slam there. Get out!', 'After a slam a crack GLOWS on a limb: stand in its gold ring and press A. Break every crack before the bell!', 'Slams shake loose little RUBBLINGS that chase you: A smashes them, or jump on them.', 'B jumps. Land on a friend\'s head and they see stars!'],
  kind: 'arena', min: 1, max: 4, seconds: 72, scoring: 'coop', unit: 'hits', tags: ['coop', 'action'],
  controls: { stick: true, a: 'Smash', b: 'Jump' }, move: { speed: 6.2, accel: 30, stunDrag: 3 },
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
  // jumping (B) and landing on heads
  hop: 0.6, hopH: 1.1, hopCool: 0.25, stomp: 0.85, stompStun: 1.0, bounce: 0.4,
  // rubblings: how many shake loose per slam (n = players), how many may be about at once, how they move and hit
  adds: { easy: n => Math.max(1, Math.floor(n / 2)), normal: n => 1 + Math.ceil(n / 2), hard: n => 1 + n }, addsMax: n => 2 + n * 2,
  addSpeed: { easy: 2.2, normal: 2.7, hard: 3.2 }, addHp: { easy: 1, normal: 1, hard: 2 }, addR: 0.42, addReach: 1.35,
  addBonk: 0.75, addStun: 0.55, addKnock: 4.2, addRest: 1.1, addSpawnFirst: 0.8,
};
/** The ground spot beside a limb, for a golem at (x, z) facing yaw. */
export const limbSpot = (x, z, yaw, i) => { const L = LIMBS[i]; return { x: x + Math.sin(yaw + L.a) * L.d, z: z + Math.cos(yaw + L.a) * L.d }; };

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, pids = players.map(p => p.pid), bodies = new Map(), A = meta.arena;
  const spawns = spawnRing(n, n === 1 ? 0 : 2.2, Math.PI / 4);
  players.forEach((p, i) => { const s = spawns[i]; bodies.set(p.pid, makeBody(s.x, s.z * 0.5 + 3.8, Math.PI)); });
  const P = new Map(pids.map(pid => [pid, { stun: 0, inv: 0, cool: 0, hits: 0, smashed: 0, hop: 0, hopT: 0, hopCool: 0 }]));
  const K = byDiff(difficulty, RULES.cracks), H = RULES.hitsPer(n), hpMax = K * H;
  const G = { x: 0, z: -2.2, yaw: 0 };
  let time = meta.seconds, phase = 'ready', left = RULES.start, cyc = -1, over = false, success = false;
  let rings = [], rid = 0, crack = null, broken = 0, target = pids[0], hp = hpMax;
  let adds = [], aid = 0;                               // rubblings: { id, x, z, yaw, hp, rest, born }
  const events = [];

  function hurt(pid, fx, fz, { stun = RULES.hurtStun, power = RULES.knock, inv = RULES.invuln, why = 'slam' } = {}) {
    const s = P.get(pid), b = bodies.get(pid); if (s.inv > 0 || over) return false;
    s.inv = inv; s.stun = stun; knock(b, fx, fz, power); landNow(pid);
    events.push({ e: 'hurt', pid, why });
    return true;
  }
  function landNow(pid) { const s = P.get(pid), b = bodies.get(pid); s.hop = 0; b.y = 0; b.flags &= ~F.AIR; }
  /** A slam shakes rubblings loose round the ring it landed on. */
  function shakeLoose(x, z) {
    let k = byDiff(difficulty, RULES.adds)(n);
    k = Math.min(k, RULES.addsMax(n) - adds.length);
    for (let i = 0; i < k; i++) {
      const a = rng.range(0, Math.PI * 2), d = RULES.slamR + 0.4;
      const ax = clamp(x + Math.sin(a) * d, -A.hw + 0.6, A.hw - 0.6), az = clamp(z + Math.cos(a) * d, -A.hd + 0.6, A.hd - 0.6);
      adds.push({ id: ++aid, x: ax, z: az, yaw: a, hp: byDiff(difficulty, RULES.addHp), rest: RULES.addSpawnFirst + i * 0.2 });
    }
  }
  function smashAdd(pid, ad, how) {
    ad.hp--; const s = P.get(pid);
    if (ad.hp > 0) { ad.rest = Math.max(ad.rest, 0.6); events.push({ e: 'addHit', pid, id: ad.id, x: r2(ad.x), z: r2(ad.z) }); return; }
    adds = adds.filter(a => a !== ad); s.smashed++;
    events.push({ e: 'addDie', pid, id: ad.id, x: r2(ad.x), z: r2(ad.z), how });
  }
  /** Landing from a jump: on a rubbling it is smashed, on a team-mate's head they see stars and you bounce. */
  function land(pid) {
    const b = bodies.get(pid);
    const ad = adds.find(a => Math.hypot(a.x - b.x, a.z - b.z) < RULES.stomp);
    if (ad) { smashAdd(pid, ad, 'stomp'); bounce(pid); return; }
    for (const [o, ob] of bodies) {
      if (o === pid || (ob.flags & F.AIR)) continue;
      if (Math.hypot(ob.x - b.x, ob.z - b.z) > RULES.stomp) continue;
      const os = P.get(o); if (os.inv > 0) continue;
      os.stun = Math.max(os.stun, RULES.stompStun); os.inv = 0.6; ob.flags |= F.STUN; ob.vx *= 0.2; ob.vz *= 0.2;
      events.push({ e: 'stomp', pid, on: o });
      bounce(pid); return;
    }
  }
  function bounce(pid) { const s = P.get(pid), b = bodies.get(pid); s.hop = s.hopT = RULES.bounce; b.flags |= F.AIR; }
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
    const onCrack = phase === 'open' && crack && (() => { const p = limbSpot(G.x, G.z, G.yaw, crack.limb); return Math.hypot(b.x - p.x, b.z - p.z) <= RULES.reach; })();
    if (!onCrack) {                                   // not on the gold ring: the swing smashes the nearest rubbling in reach, if any
      let best = null, bd = RULES.addReach;
      for (const a of adds) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < bd) { bd = d; best = a; } }
      if (best) { b.yaw = Math.atan2(best.x - b.x, best.z - b.z); smashAdd(pid, best, 'swing'); return; }
      events.push({ e: 'swing', pid }); return;
    }
    crack.left--; hp--; s.hits++;
    events.push({ e: 'hit', pid, limb: crack.limb, left: crack.left });
    if (crack.left <= 0) {
      broken++; crack = null; events.push({ e: 'broke', pid, broken });
      if (broken >= K) return finish(true);
      phase = 'stagger'; left = RULES.stagger;
    }
  }
  function finish(ok) {
    over = true; success = ok; phase = 'end'; rings = []; adds = [];
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
      if (pr.b && !(b.flags & (F.STUN | F.AIR)) && s.hopCool <= 0) { s.hop = s.hopT = RULES.hop; b.flags |= F.AIR; events.push({ e: 'jump', pid }); }
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
        s.hopCool = Math.max(0, s.hopCool - dt);
        if (s.hop > 0) {
          s.hop -= dt; const k = 1 - Math.max(0, s.hop) / s.hopT; b.y = r2(4 * RULES.hopH * (s.hopT / RULES.hop) * k * (1 - k));
          if (s.hop <= 0) { landNow(pid); s.hopCool = RULES.hopCool; land(pid); }
        }
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
          if (r.kind === 'slam') shakeLoose(r.x, r.z);
        }
      }
      // rubblings waddle after the nearest player who is on their feet, bonk on contact, then rest a moment
      const sp = byDiff(difficulty, RULES.addSpeed);
      for (const ad of adds) {
        if (ad.rest > 0) { ad.rest -= dt; continue; }
        let tb = null, tp = null, td = Infinity;
        for (const [pid, b] of bodies) { if (b.flags & F.STUN) continue; const d = Math.hypot(b.x - ad.x, b.z - ad.z); if (d < td) { td = d; tb = b; tp = pid; } }
        if (!tb) continue;
        const want = Math.atan2(tb.x - ad.x, tb.z - ad.z); ad.yaw += clamp(angDiff(want, ad.yaw), -6 * dt, 6 * dt);
        ad.x += Math.sin(ad.yaw) * sp * dt; ad.z += Math.cos(ad.yaw) * sp * dt;
        const gd = Math.hypot(ad.x - G.x, ad.z - G.z), gmin = RULES.golemR + RULES.addR;
        if (gd < gmin && gd > 1e-3) { ad.x = G.x + (ad.x - G.x) / gd * gmin; ad.z = G.z + (ad.z - G.z) / gd * gmin; }
        ad.x = clamp(ad.x, -A.hw + RULES.addR, A.hw - RULES.addR); ad.z = clamp(ad.z, -A.hd + RULES.addR, A.hd - RULES.addR);
        if (td < RULES.addBonk && !(tb.flags & F.AIR) && hurt(tp, ad.x, ad.z, { stun: RULES.addStun, power: RULES.addKnock, inv: 0.9, why: 'add' })) { ad.gone = true; events.push({ e: 'addPop', id: ad.id, x: r2(ad.x), z: r2(ad.z) }); }
      }
      adds = adds.filter(a => !a.gone);              // a rubbling that bonked someone crumbles (one bonk each, no stun-lock)
      for (let i = 0; i < adds.length; i++) for (let j = i + 1; j < adds.length; j++) {   // they do not pile into one rock
        const a = adds[i], c = adds[j], dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz), min = RULES.addR * 2;
        if (d < min && d > 1e-4) { const p = (min - d) / 2; a.x -= dx / d * p; a.z -= dz / d * p; c.x += dx / d * p; c.z += dz / d * p; }
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
      const sc = {}; for (const pid of pids) sc[pid] = P.get(pid).hits + P.get(pid).smashed;
      const g = { ph: phase, gx: r2(G.x), gz: r2(G.z), gy: r2(G.yaw), hp, br: broken, sc, left: Math.max(0, Math.ceil(time)), tg: target };
      g.rg = rings.map(r => [r.id, r.x, r.z, r.r, r2(r.left), r2(r.total)]);
      g.mn = adds.map(a => [a.id, r2(a.x), r2(a.z), r2(a.yaw), a.rest > 0 ? 1 : 0]);
      if (crack && phase === 'open') g.ck = [crack.limb, crack.left, r2(Math.max(0, left))];
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}; for (const pid of pids) scores[pid] = P.get(pid).hits + P.get(pid).smashed;
      return coopResult(pids, scores, over ? success : broken >= K, meta.unit);
    },
  };
}
