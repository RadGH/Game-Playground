// SLIPPERY DELIVERY — everyone pushes a wobbly pie cart round a wet market square. Roll up to the bakery counter (the
// bottom of the square) and stop there to have pies stacked on your cart, one at a time, up to five — the more you
// carry, the more you can lose. Then skid up the square, past rolling barrels and spinning shop signs, to any of the
// three doors at the top and deliver them all at once.
//
//   steering      the cart steers like a kart on a wet floor (shared/arena.js move.mode 'car', low grip): point the
//                 stick where you want to go. Hold A to brake (F.SLOW).
//   bumps         hitting a wall, a crate or a lamp post hard knocks pies off (1, or 2 when fast); a barrel or a sign
//                 knocks you back and costs 2; two carts that crash both lose one
//   delivering    1 point a pie; a full stack of five earns +2; the RUSH door (it moves every RULES.rushEvery seconds)
//                 pays double for the pies
// Most points at the bell wins. Solo: the same as a score attack with medal targets.
import { makeBody, stepBody, separate, F, BODY_R } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'slippery-delivery', title: 'Slippery Delivery', blurb: 'Skid your pie cart across the wet square — deliver the most pies!',
  how: ['Stop at the bakery counter to stack pies on your cart (up to 5).', 'Point the stick to steer — it slides! Hold A to brake.', 'Bumps knock pies off. Deliver at a door; the RUSH door pays double.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'pies', tags: ['action'],
  controls: { stick: true, a: 'Brake' },
  move: { mode: 'car', speed: 6.2, accel: 2.6, turn: 3.2, grip: 2.6, carryMul: 0.88, slowMul: 0.25, stunDrag: 2.2 },
  arena: { shape: 'rect', hw: 8, hd: 11, wall: true }, pitch: 64, card: 'card-slippery-delivery', css: true,
};

export const RULES = {
  maxPies: 5, loadEvery: 0.3, loadSpeed: 3.2, counterW: 3.2, counterD: 2.4,
  doors: [-5, 0, 5], doorW: 1.5, doorD: 1.9, fullBonus: 2, rushEvery: 12,
  bumpLoss: 2.0, bumpFast: 4.2, bumpCool: 0.5,
  barrelR: 0.55, lanes: [6.2, 1.2, -5.2], laneJit: 0.5, barrelA: 6.6, barrelW: [0.7, 1.15],
  armL: 2.1, armR: 0.16, arms: [[-4.2, 3.7], [4.2, 3.7], [0, -2.0]], armW: [0.9, 1.4],
  hitPush: 5.5, hitStun: 0.5, hitLoss: 2, hitCool: 1.0,
  crash: 3.2,
  crates: 4,
  medals: [10, 20, 30],
};
const r2 = v => Math.round(v * 100) / 100;

/** The square from the seed: barrel lanes, spinning signs and crates. */
export function makeSquare(rng) {
  const S = RULES, A = meta.arena;
  const barrels = S.lanes.map((z, i) => ({ z: r2(z + rng.range(-S.laneJit, S.laneJit)), A: S.barrelA, w: r2(rng.range(...S.barrelW) * (i % 2 ? -1 : 1)), ph: r2(rng.range(0, 6.28)) }));
  const arms = S.arms.map(([x, z], i) => ({ x, z, L: S.armL, w: r2(rng.range(...S.armW) * (i % 2 ? 1 : -1)), ph: r2(rng.range(0, 3.14)) }));
  const blocks = [];
  for (let k = 0; k < 60 && blocks.length < S.crates; k++) {
    const x = r2(rng.range(-A.hw + 1.4, A.hw - 1.4)), z = r2(rng.range(-A.hd + 3.2, A.hd - 3.6));
    if (barrels.some(b => Math.abs(b.z - z) < 1.5)) continue;
    if (arms.some(a => Math.hypot(a.x - x, a.z - z) < a.L + 1.3)) continue;
    if (blocks.some(b => Math.hypot(b.x - x, b.z - z) < 3)) continue;
    blocks.push({ x, z, hw: 0.5, hd: 0.5 });
  }
  const posts = [{ x: -A.hw + 0.9, z: 0.0, r: 0.22 }, { x: A.hw - 0.9, z: -3.6, r: 0.22 }];
  return { barrels, arms, arena: { ...A, blocks, posts } };
}
export const barrelX = (b, t) => b.A * Math.sin(b.w * t + b.ph);
export const armAngle = (a, t) => a.w * t + a.ph;

export function create({ rng, players }) {
  const S = RULES, events = [], sq = makeSquare(rng), arena = sq.arena, A = arena;
  const bodies = new Map(), P = new Map(), n = players.length;
  players.forEach((p, i) => {
    const b = makeBody(r2((i - (n - 1) / 2) * 1.6), r2(A.hd - 1.3), Math.PI);
    bodies.set(p.pid, b);
    P.set(p.pid, { pies: 0, load: 0, score: 0, delivered: 0, dropped: 0, cool: 0, hitCool: 0, stun: 0, prevB: 0 });
  });
  let time = meta.seconds, t = 0, over = false, rush = rng.int(0, 2), rushIn = S.rushEvery;
  const inCounter = b => Math.abs(b.x) <= S.counterW && b.z >= A.hd - S.counterD;
  const doorAt = b => b.z <= -A.hd + S.doorD ? S.doors.findIndex(x => Math.abs(b.x - x) <= S.doorW) : -1;
  function lose(pid, k, why) {
    const st = P.get(pid), b = bodies.get(pid);
    const n2 = Math.min(st.pies, k); if (n2 <= 0) return;
    st.pies -= n2; st.dropped += n2; if (!st.pies) b.flags &= ~F.CARRY;
    events.push({ e: 'drop', pid, n: n2, left: st.pies, why, x: r2(b.x), z: r2(b.z) });
  }
  function knock(pid, nx, nz, why) {
    const st = P.get(pid), b = bodies.get(pid); if (st.hitCool > 0) return;
    st.hitCool = S.hitCool; st.stun = S.hitStun; b.flags |= F.STUN;
    b.vx = nx * S.hitPush; b.vz = nz * S.hitPush;
    events.push({ e: 'hit', pid, why });
    lose(pid, S.hitLoss, why);
  }
  return {
    bodies, events,
    init: () => ({ arena, barrels: sq.barrels, arms: sq.arms, R: { doors: S.doors, doorW: S.doorW, doorD: S.doorD, counterW: S.counterW, counterD: S.counterD, maxPies: S.maxPies, medals: S.medals, armL: S.armL } }),
    input(pid, inp) {
      const b = bodies.get(pid), st = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0; st.prevB = bits;
      if (bits & IN.A) b.flags |= F.SLOW; else b.flags &= ~F.SLOW;
      const v0 = Math.hypot(b.vx, b.vz);
      stepBody(b, inp, meta.move, arena);
      const loss = v0 - Math.hypot(b.vx, b.vz);
      if (!(b.flags & F.STUN) && loss > S.bumpLoss && st.cool <= 0) {
        st.cool = S.bumpCool; events.push({ e: 'bump', pid, x: r2(b.x), z: r2(b.z) });
        lose(pid, v0 > S.bumpFast ? 2 : 1, 'wall');
      }
    },
    step(dt) {
      if (over) return;
      t += dt; time -= dt;
      // cart against cart: a hard crash knocks a pie off each
      const list = [...bodies.entries()];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const [pa, a] = list[i], [pb, c] = list[j], dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
        if (d > BODY_R * 2 + 0.15 || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, close = (a.vx - c.vx) * nx + (a.vz - c.vz) * nz;
        if (close > S.crash && P.get(pa).cool <= 0 && P.get(pb).cool <= 0) {
          P.get(pa).cool = P.get(pb).cool = S.bumpCool;
          events.push({ e: 'crash', a: pa, b: pb, x: r2((a.x + c.x) / 2), z: r2((a.z + c.z) / 2) });
          lose(pa, 1, 'crash'); lose(pb, 1, 'crash');
          a.vx -= nx * close * 0.6; a.vz -= nz * close * 0.6; c.vx += nx * close * 0.6; c.vz += nz * close * 0.6;
        }
      }
      separate(bodies.values());
      rushIn -= dt; if (rushIn <= 0) { rushIn = S.rushEvery; rush = (rush + rng.int(1, 2)) % 3; events.push({ e: 'rush', door: rush }); }
      for (const [pid, b] of bodies) {
        const st = P.get(pid);
        if (st.cool > 0) st.cool -= dt;
        if (st.hitCool > 0) st.hitCool -= dt;
        if (st.stun > 0) { st.stun -= dt; if (st.stun <= 0) b.flags &= ~F.STUN; }
        // moving hazards
        for (const br of sq.barrels) {
          const bx = barrelX(br, t), dx = b.x - bx, dz = b.z - br.z, d = Math.hypot(dx, dz);
          if (d < S.barrelR + BODY_R) knock(pid, d > 1e-6 ? dx / d : 0, d > 1e-6 ? dz / d : 1, 'barrel');
        }
        for (const a of sq.arms) {
          const ang = armAngle(a, t), ex = Math.cos(ang) * a.L, ez = Math.sin(ang) * a.L;
          const k = Math.max(-1, Math.min(1, ((b.x - a.x) * ex + (b.z - a.z) * ez) / (a.L * a.L)));
          const px = a.x + ex * k, pz = a.z + ez * k, dx = b.x - px, dz = b.z - pz, d = Math.hypot(dx, dz);
          if (d < S.armR + BODY_R) knock(pid, d > 1e-6 ? dx / d : 0, d > 1e-6 ? dz / d : 1, 'sign');
        }
        // the counter stacks pies on a cart that has (nearly) stopped there
        if (inCounter(b) && Math.hypot(b.vx, b.vz) < S.loadSpeed && st.pies < S.maxPies) {
          st.load += dt;
          if (st.load >= S.loadEvery) { st.load = 0; st.pies++; b.flags |= F.CARRY; events.push({ e: 'load', pid, n: st.pies }); }
        } else st.load = 0;
        // a door takes every pie at once
        const door = doorAt(b);
        if (door >= 0 && st.pies > 0) {
          const full = st.pies === S.maxPies, pts = st.pies * (door === rush ? 2 : 1) + (full ? S.fullBonus : 0);
          st.score += pts; st.delivered += st.pies;
          events.push({ e: 'deliver', pid, n: st.pies, pts, door, rush: door === rush ? 1 : 0, full: full ? 1 : 0 });
          st.pies = 0; b.flags &= ~F.CARRY;
        }
      }
      if (time <= 0) { over = true; time = 0; for (const b of bodies.values()) { b.flags = (b.flags | F.FROZEN) & ~F.STUN; b.vx = b.vz = 0; } events.push({ e: 'end' }); }
    },
    state() {
      const sc = {}, pies = {};
      for (const [pid, st] of P) { sc[pid] = st.score; pies[pid] = st.pies; }
      return { sc, pies, rush, t: r2(t), left: Math.max(0, Math.ceil(time)) };
    },
    get over() { return over; },
    /** For tests. */
    square: sq, player: pid => P.get(pid),
    result() {
      const scores = {}; for (const p of players) scores[p.pid] = P.get(p.pid).score;
      const sorted = players.map(p => p.pid).sort((a, b) => scores[b] - scores[a]), order = [];
      for (const pid of sorted) { const g = order[order.length - 1]; if (g && scores[g[0]] === scores[pid]) g.push(pid); else order.push([pid]); }
      return { order, scores, unit: meta.unit };
    },
  };
}
