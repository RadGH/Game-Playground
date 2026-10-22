// ROPE BRIDGE PANIC — co-op. The team must get everyone over three rickety rope bridges strung across a chasm, with a
// rock pillar to rest on between each. The course runs up the screen (-z); everybody starts on the near cliff.
//
//   planks        each plank has health. Walking over one barely scratches it; STANDING on one wears it down fast;
//                 two or more people on one plank crack it quickly; landing a hop thumps it. Weak planks (darker and
//                 thinner) wear faster. A plank at zero snaps and leaves a hole. (A plank never snaps within two planks of
//                 another hole, so one hop always clears a hole.)
//   hop (A)       a short jump: clears a hole, but the landing hits the plank harder
//   sway          each bridge tips toward the side its people stand on (their weight adds up) and gusts of wind push it
//                 one way for a few seconds (warned by arrows a moment before). Tip it all the way and everyone who is
//                 not on the high side is thrown off. Spread out and lean against the wind!
//   falling       drop into the chasm and you are back at the start of the bridge you fell from a moment later.
// Everyone over the last bridge = success (it ends at once); the clock running out = failure. The result is co-op;
// the order is who made it first (then who got furthest), and each player's score is the bridges they crossed.
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'rope-bridge-panic', title: 'Rope Bridge Panic', blurb: 'Get the whole team over the crumbling rope bridges!',
  how: ['Cross all three bridges before time runs out — together.', 'Standing still or crowding a plank cracks it. A hops a hole.', 'The bridge tips toward where you stand: spread out, lean into the wind!'],
  kind: 'arena', min: 1, max: 4, seconds: 50, scoring: 'coop', unit: 'bridges', tags: ['coop', 'action'],
  controls: { stick: true, a: 'Hop' }, move: { speed: 4.8, accel: 22, stunDrag: 3, slowMul: 0.6 },
  arena: { shape: 'rect', hw: 1.5, hd: 30, wall: true }, pitch: 56, card: 'card-rope-bridge-panic', css: true,
};

export const RULES = {
  HW: 1.5, PL: 0.75,                                     // bridge half-width, plank length (along the course)
  lands: [4, 3, 3, 4], spans: [[11, 13], [13, 15], [15, 17]],   // start cliff, pillars, goal cliff; span length ranges
  weakChance: [0.12, 0.18, 0.24], holes: [0, 1, 2],      // weak planks; planks already missing at the start
  wearWalk: 0.5, wearStill: 1.0, stillSpeed: 0.8, wearCrowd: 0.9, weakMul: 1.6, thump: 0.3,
  hop: 0.42, hopH: 0.55, hopCool: 0.15,
  load: 0.42, tiltRate: 1.6, flipAt: 1, highSide: 0.25,   // tilt from one person at the very edge; how fast it follows; tip point
  gustEvery: [4, 8], gustWarn: 1.2, gustLen: 2.6, gustPow: [0.75, 1.15], firstGust: [2.5, 5],
  fallTime: 1.3, maxAngle: 0.22,
  pace: { easy: 0.8, normal: 1, hard: 1.2 },
};
const r2 = v => Math.round(v * 100) / 100;

/** The course from the seed: lands and spans in order from the near cliff (+z) to the far cliff (-z). */
export function makeCourse(rng) {
  const S = RULES, lens = [S.lands[0]];
  const spanLens = S.spans.map(([a, b]) => Math.round(rng.range(a, b) / S.PL) * S.PL);
  for (let i = 0; i < 3; i++) lens.push(spanLens[i], S.lands[i + 1]);
  const total = lens.reduce((a, b) => a + b, 0);
  const segs = []; let z = total / 2;
  lens.forEach((L, i) => {
    const span = i % 2 === 1, s = { k: span ? 'span' : 'land', z0: r2(z), z1: r2(z - L) };
    if (span) { const si = (i - 1) / 2; s.i = si; s.n = Math.round(L / S.PL); s.weak = Array.from({ length: s.n }, (_, j) => (j > 0 && j < s.n - 1 && rng.chance(S.weakChance[si])) ? 1 : 0).join('');
      // holes from the start: never the first or last two planks, at least four planks apart
      const holes = new Set(); for (let k = 0; k < S.holes[si] * 6 && holes.size < S.holes[si]; k++) { const j = rng.int(2, s.n - 3); if (![...holes].some(h => Math.abs(h - j) < 4)) holes.add(j); }
      s.holes = [...holes].sort((a, b) => a - b); }
    else s.li = i / 2;
    segs.push(s); z -= L;
  });
  return { segs, hd: r2(total / 2), hw: S.HW };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const S = RULES, n = players.length, pace = S.pace[difficulty] ?? 1, events = [];
  const course = makeCourse(rng), segs = course.segs;
  const arena = { shape: 'rect', hw: S.HW, hd: course.hd, wall: true };
  const spans = segs.filter(s => s.k === 'span').map(s => ({
    s, hp: Array.from({ length: s.n }, (_, j) => s.holes.includes(j) ? 0 : 1), weak: [...s.weak].map(Number), T: 0,
    gust: { next: rng.range(...S.firstGust), dir: 0, pow: 0, warn: 0, on: 0 },
  }));
  const lands = segs.filter(s => s.k === 'land');
  const bodies = new Map(), P = new Map();
  const startZ = lands[0].z0 - lands[0].z0 + lands[0].z1 + 1.2;          // near the front of the first cliff
  players.forEach((p, i) => {
    const x = n === 1 ? 0 : r2(-0.9 + 1.8 * i / (n - 1)), b = makeBody(x, r2(startZ + 1.4 + (i % 2) * 0.6), Math.PI);
    bodies.set(p.pid, b);
    P.set(p.pid, { land: 0, ck: 0, hop: 0, hopCool: 0, fall: 0, prevB: 0, done: false, at: 0, falls: 0, crossed: 0 });
  });
  let time = meta.seconds, elapsed = 0, over = false, success = false;
  const segAt = z => segs.find(s => z <= s.z0 && z > s.z1) || (z > segs[0].z0 ? segs[0] : segs[segs.length - 1]);
  const spanOf = s => spans[s.i];
  const plankAt = (sp, z) => Math.max(0, Math.min(sp.s.n - 1, Math.floor((sp.s.z0 - z) / S.PL)));
  function respawn(pid) {
    const b = bodies.get(pid), st = P.get(pid), L = lands[st.ck];
    b.x = r2((pid % 3 - 1) * 0.6); b.z = r2(L.z1 + 1.0); b.y = 0; b.vx = b.vz = 0; b.flags = 0;   // a land: full speed b.yaw = Math.PI; st.fall = 0;
  }
  function fallOff(pid, why) {
    const b = bodies.get(pid), st = P.get(pid); if (st.fall > 0 || st.done) return;
    st.fall = S.fallTime; st.falls++; st.hop = 0; b.flags = (b.flags | F.STUN | F.GHOST) & ~F.AIR; b.vx *= 0.3; b.vz *= 0.3;
    events.push({ e: 'fall', pid, why, x: r2(b.x), z: r2(b.z) });
  }
  function wear(sp, j, amt) {
    if (sp.hp[j] <= 0) return;
    const before = sp.hp[j];
    sp.hp[j] = Math.max(0, sp.hp[j] - amt * (sp.weak[j] ? S.weakMul : 1) * pace);
    if (sp.hp[j] <= 0) {
      // never two holes within two planks of each other (one hop always clears a hole and lands on wood): the plank
      // holds on by a splinter instead
      const broken = k => k >= 0 && k < sp.s.n && sp.hp[k] <= 0;
      if (broken(j - 1) || broken(j - 2) || broken(j + 1) || broken(j + 2)) { sp.hp[j] = 0.04; return; }
      events.push({ e: 'snap', s: sp.s.i, j });
    } else if (before > 0.5 && sp.hp[j] <= 0.5) events.push({ e: 'crack', s: sp.s.i, j });
  }
  function finish(ok) {
    over = true; success = ok;
    for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ course, arena, left: Math.ceil(time), R: { PL: S.PL, maxAngle: S.maxAngle, HW: S.HW } }),
    input(pid, inp) {
      const b = bodies.get(pid), st = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(st.prevB & IN.A); st.prevB = bits;
      if (pa && !st.done && st.fall <= 0 && st.hop <= 0 && st.hopCool <= 0) { st.hop = S.hop; st.hopCool = S.hop + S.hopCool; b.flags = (b.flags | F.AIR) & ~F.SLOW; events.push({ e: 'hop', pid }); }
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt; time -= dt;
      separate(bodies.values());
      // gusts
      for (const sp of spans) {
        const g = sp.gust;
        if (g.on > 0) { g.on -= dt; if (g.on <= 0) { g.dir = 0; g.pow = 0; g.next = rng.range(...S.gustEvery); } }
        else if (g.warn > 0) { g.warn -= dt; if (g.warn <= 0) { g.on = S.gustLen; events.push({ e: 'gust', s: sp.s.i, dir: g.dir }); } }
        else { g.next -= dt; if (g.next <= 0) { g.dir = rng.chance(0.5) ? 1 : -1; g.pow = rng.range(...S.gustPow) * pace; g.warn = S.gustWarn; } }
      }
      const load = spans.map(() => 0), onPlank = new Map();
      for (const [pid, b] of bodies) {
        const st = P.get(pid);
        if (st.hopCool > 0) st.hopCool -= dt;
        if (st.done) continue;
        if (st.fall > 0) {
          st.fall -= dt; const t = S.fallTime - st.fall; b.y = r2(-7 * t * t);
          if (st.fall <= 0) respawn(pid);
          continue;
        }
        if (st.hop > 0) {
          st.hop -= dt; const k = 1 - Math.max(0, st.hop) / S.hop; b.y = r2(4 * S.hopH * k * (1 - k));
          if (st.hop > 0) continue;
          b.flags &= ~F.AIR; b.y = 0; st.landed = true;
        }
        const seg = segAt(b.z);
        if (seg.k === 'land') {
          b.y = 0; b.flags &= ~F.SLOW;
          if (seg.li > st.land) { st.land = seg.li; st.crossed = seg.li; st.ck = Math.min(seg.li, lands.length - 1); events.push({ e: 'safe', pid, li: seg.li }); }
          if (seg.li === lands.length - 1 && !st.done) { st.done = true; st.at = elapsed; b.flags |= F.FROZEN; b.vx = b.vz = 0; events.push({ e: 'made', pid }); }
          st.ck = Math.max(st.ck, seg.li); st.landed = false;
          continue;
        }
        b.flags |= F.SLOW;                                         // careful steps on a rope bridge
        const sp = spanOf(seg), j = plankAt(sp, b.z);
        if (sp.hp[j] <= 0) { fallOff(pid, 'hole'); continue; }
        const speed = Math.hypot(b.vx, b.vz);
        wear(sp, j, (speed < S.stillSpeed ? S.wearStill : S.wearWalk) * dt + (st.landed ? S.thump : 0)); st.landed = false;
        if (sp.hp[j] <= 0) { fallOff(pid, 'snap'); continue; }
        const key = sp.s.i * 1000 + j; onPlank.set(key, [...(onPlank.get(key) || []), pid]);
        load[sp.s.i] += b.x / (S.HW - 0.45) * S.load;
        b.y = r2(b.x * Math.sin(-sp.T * S.maxAngle));
      }
      for (const [key, pids] of onPlank) if (pids.length >= 2) { const sp = spans[Math.floor(key / 1000)], j = key % 1000; wear(sp, j, S.wearCrowd * (pids.length - 1) * dt); }
      // sway: each bridge follows the weight on it plus the wind; tip it all the way and it throws people off
      for (const sp of spans) {
        const want = load[sp.s.i] + (sp.gust.on > 0 ? sp.gust.dir * sp.gust.pow * Math.min(1, (S.gustLen - sp.gust.on) / 0.5, sp.gust.on / 0.4) : 0);
        sp.T += (want - sp.T) * Math.min(1, S.tiltRate * dt);
        if (Math.abs(sp.T) >= S.flipAt) {
          const sgn = Math.sign(sp.T); let thrown = 0;
          for (const [pid, b] of bodies) {
            const st = P.get(pid); if (st.done || st.fall > 0 || st.hop > 0) continue;
            const seg = segAt(b.z); if (seg !== sp.s) continue;
            if (b.x * sgn > -S.highSide * S.HW) { fallOff(pid, 'tip'); thrown++; }
          }
          events.push({ e: 'tip', s: sp.s.i, dir: sgn, n: thrown });
          sp.T = -sgn * 0.3;                                       // it swings back
        }
      }
      if ([...P.values()].every(st => st.done)) finish(true);
      else if (time <= 0) finish(false);
    },
    state() {
      // a bridge: [tilt, wind warning or blowing (-1/0/1), blowing (1/0), planks as one character each: 0-9 health, '-' gone]
      const sp = spans.map(s => [r2(s.T), s.gust.warn > 0 || s.gust.on > 0 ? s.gust.dir : 0, s.gust.on > 0 ? 1 : 0, s.hp.map(h => h <= 0 ? '-' : String(Math.min(9, Math.ceil(h * 9)))).join('')]);
      const pr = {}; for (const [pid, st] of P) pr[pid] = [st.crossed, st.done ? 1 : 0, st.falls];
      return { sp, pr, left: Math.max(0, Math.ceil(time)) };
    },
    get over() { return over; },
    /** For tests. */
    spans, course,
    result() {
      const scores = {}; for (const p of players) scores[p.pid] = P.get(p.pid).crossed;
      const prog = pid => { const st = P.get(pid); return st.done ? 1e6 - st.at * 100 : -bodies.get(pid).z; };
      const sorted = players.map(p => p.pid).sort((a, b) => prog(b) - prog(a)), order = [];
      for (const pid of sorted) { const g = order[order.length - 1]; if (g && Math.abs(prog(g[0]) - prog(pid)) < 1e-6) g.push(pid); else order.push([pid]); }
      return { coop: { success: over ? success : false }, order, scores, unit: meta.unit };
    },
  };
}
