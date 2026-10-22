// SHEEP SHUFFLE — a meadow full of woolly sheep, and a fenced pen in each player's corner. Sheep wander about and run
// away from anyone who comes near, so you steer them by walking BEHIND them. A sheep that goes through the gap at the
// inner corner of a pen and settles inside counts for that pen's owner (a golden sheep counts 3).
//
//   A = BAA!     a shout that scares every sheep in a cone in front of you (5.5 m) into a sprint away from you —
//                handy to blast a bunch toward your gate, and the only way to get sheep OUT of a pen: walk into a
//                rival's pen and BAA toward their gate. (Penned sheep stay calm when people just walk past.)
//   the field    never runs dry: new sheep trot in while the free flock is small, and a new golden sheep appears a
//                while after the last one was penned.
// Score = what is in your pen right now; most at the bell wins. Solo: the same meadow as a score attack.
import { makeBody, stepBody, separate, spawnRing, clampToArena, collideObstacles, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'sheep-shuffle', title: 'Sheep Shuffle', blurb: 'Herd the woolly sheep into your own pen!',
  how: ['Sheep run away from you — walk BEHIND them to steer them.', 'Get them through the gap into the pen in YOUR colour.', 'BAA! scares sheep in front of you — even out of a rival\'s pen.', 'Golden sheep count 3. Most sheep penned at the bell wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'points', unit: 'sheep', tags: ['action'],
  controls: { stick: true, a: 'BAA!' }, move: { speed: 6, accel: 24, stunDrag: 2 },
  arena: { shape: 'rect', hw: 9.5, hd: 7, wall: true }, pitch: 60, card: 'card-sheep-shuffle', css: true,
};

export const RULES = {
  P: 3.8, G: 2.1,                         // pen size (a square in a corner), gap at its inner corner
  inside: 0.35,                           // a sheep this far past the fence lines is penned
  sheepR: 0.42, sepR: 0.8,
  fleeR: 3.2, goldFleeR: 3.8, flee: 4.5, goldFlee: 5.3, wander: 0.9, steer: 6,
  wallR: 1.3, wallPush: 1.4,
  baaCool: 1.2, baaR: 5.5, baaCos: Math.cos(50 * Math.PI / 180), scareT: 0.9, scareSpeed: 6.2,
  start: [12, 12, 14, 17, 20], minFree: [5, 5, 7, 8, 9], cap: 38, spawnEvery: 1.4,
  goldEvery: 12, firstGold: 6,
};
const r2 = v => Math.round(v * 100) / 100;
const CORNERS = { 1: [[-1, -1]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [1, -1], [-1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]] };

/** The pens for n players: [{ sx, sz, x0, x1, z0, z1, gx, gz }] (x0..x1 / z0..z1 = the square; gx, gz = the middle of the gap). */
export function pensFor(n, hw = meta.arena.hw, hd = meta.arena.hd) {
  const { P, G } = RULES;
  return CORNERS[n].map(([sx, sz]) => ({ sx, sz, x0: Math.min(sx * hw, sx * (hw - P)), x1: Math.max(sx * hw, sx * (hw - P)), z0: Math.min(sz * hd, sz * (hd - P)), z1: Math.max(sz * hd, sz * (hd - P)), gx: sx * (hw - P + G / 2), gz: sz * (hd - P + G / 2) }));
}
/** The fences as thin walls (two per pen: the inner sides, each leaving G open at the inner corner). */
export function fencesFor(pens, hw = meta.arena.hw, hd = meta.arena.hd) {
  const { P, G } = RULES, segs = [];
  for (const p of pens) {
    segs.push({ ax: p.sx * (hw - P), az: p.sz * hd, bx: p.sx * (hw - P), bz: p.sz * (hd - P + G) });
    segs.push({ ax: p.sx * hw, az: p.sz * (hd - P), bx: p.sx * (hw - P + G), bz: p.sz * (hd - P) });
  }
  return segs;
}
/** Which pen (index) a point is inside, or -1. */
export function penAt(pens, x, z, deep = RULES.inside) {
  for (let i = 0; i < pens.length; i++) { const p = pens[i]; if (x > p.x0 + (p.sx > 0 ? deep : 0) && x < p.x1 - (p.sx < 0 ? deep : 0) && z > p.z0 + (p.sz > 0 ? deep : 0) && z < p.z1 - (p.sz < 0 ? deep : 0)) return i; }
  return -1;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, solo = n === 1, { hw, hd } = meta.arena, S = RULES;
  const pace = { easy: 0.88, normal: 1, hard: 1.1 }[difficulty] ?? 1;
  const pens = pensFor(n), arena = { ...meta.arena, segs: fencesFor(pens).map(s => ({ ax: r2(s.ax), az: r2(s.az), bx: r2(s.bx), bz: r2(s.bz) })) };
  const owner = players.map(p => p.pid);                                    // pen i belongs to players[i]
  const bodies = new Map(), spawns = spawnRing(n, solo ? 0 : 2.6);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, cool: 0, baas: 0 }]));
  const events = [], sheep = [];
  let sid = 0, time = meta.seconds, over = false, spawnT = 0, goldT = S.firstGold;

  function freeSpot() {
    let best = null, bestD = -1;
    for (let k = 0; k < 12; k++) {
      const x = rng.range(-hw + 3.2, hw - 3.2), z = rng.range(-hd + 2.2, hd - 2.2);
      if (penAt(pens, x, z, -1.2) >= 0) continue;
      let d = 99; for (const b of bodies.values()) d = Math.min(d, Math.hypot(b.x - x, b.z - z));
      for (const s of sheep) d = Math.min(d, Math.hypot(s.x - x, s.z - z) * 2.5);
      if (d > bestD) { bestD = d; best = { x, z }; }
    }
    return best || { x: 0, z: 0 };
  }
  function addSheep(gold, x, z) {
    if (x == null) ({ x, z } = freeSpot());
    const s = { id: ++sid, x, z, vx: 0, vz: 0, gold: !!gold, pen: -1, scare: 0, sdx: 0, sdz: 0, tx: x, tz: z, wt: rng.range(0.5, 2.5) };
    sheep.push(s); return s;
  }
  for (let i = 0; i < S.start[n]; i++) { const s = addSheep(false); events.length = 0; s.wt = rng.range(0, 2); }
  const valueOf = s => (s.gold ? 3 : 1);
  function wanderTarget(s) {
    if (s.pen >= 0) {                                                      // a penned sheep mills about the back of its pen
      const p = pens[s.pen], ox = p.sx > 0 ? p.x1 : p.x0, oz = p.sz > 0 ? p.z1 : p.z0;
      s.tx = ox - p.sx * rng.range(0.6, S.P - S.G * 0.8); s.tz = oz - p.sz * rng.range(0.6, S.P - S.G * 0.8);
    } else {                                                               // a free sheep grazes about, never into a pen by itself
      for (let k = 0; k < 6; k++) { s.tx = Math.max(-hw + 1.5, Math.min(hw - 1.5, s.x + rng.range(-3.5, 3.5))); s.tz = Math.max(-hd + 1.5, Math.min(hd - 1.5, s.z + rng.range(-3, 3))); if (penAt(pens, s.tx, s.tz, -1.5) < 0) break; s.tx = s.x * 0.8; s.tz = s.z * 0.8; }
    }
    s.wt = rng.range(1.5, 3.5);
  }
  function baa(pid) {
    const b = bodies.get(pid), fx = Math.sin(b.yaw), fz = Math.cos(b.yaw); let hit = 0;
    for (const s of sheep) {
      const dx = s.x - b.x, dz = s.z - b.z, d = Math.hypot(dx, dz);
      if (d > S.baaR || d < 1e-3) continue;
      if ((dx * fx + dz * fz) / d < S.baaCos && d > 0.9) continue;
      s.scare = S.scareT; s.sdx = dx / d; s.sdz = dz / d; hit++;
    }
    events.push({ e: 'baa', pid, x: r2(b.x), z: r2(b.z), yaw: r2(b.yaw), n: hit });
  }
  function stepSheep(s, dt) {
    let wx = 0, wz = 0, speed = S.wander * pace;
    if (s.scare > 0) { s.scare -= dt; wx = s.sdx; wz = s.sdz; speed = S.scareSpeed * pace; }
    else {
      let fx = 0, fz = 0;
      if (s.pen < 0) {                                                     // free sheep run from anyone near
        const R = s.gold ? S.goldFleeR : S.fleeR;
        for (const b of bodies.values()) { const dx = s.x - b.x, dz = s.z - b.z, d = Math.hypot(dx, dz); if (d < R && d > 1e-3) { const w = 1 - d / R; fx += dx / d * w; fz += dz / d * w; } }
      }
      const threat = Math.hypot(fx, fz);
      if (threat > 0.02) {
        // walls push back in, so a sheep slides along a fence instead of pinning itself in a corner
        if (s.x > hw - S.wallR) fx -= (s.x - hw + S.wallR) / S.wallR * S.wallPush * threat; if (s.x < -hw + S.wallR) fx += (-hw + S.wallR - s.x) / S.wallR * S.wallPush * threat;
        if (s.z > hd - S.wallR) fz -= (s.z - hd + S.wallR) / S.wallR * S.wallPush * threat; if (s.z < -hd + S.wallR) fz += (-hd + S.wallR - s.z) / S.wallR * S.wallPush * threat;
        let m = Math.hypot(fx, fz);
        if (m < threat * 0.35) { const side = s.id % 2 ? 1 : -1, ox = fx, oz = fz; fx = -oz * side + (m < 1e-3 ? side * 0.7 : 0); fz = ox * side + (m < 1e-3 ? 0.7 : 0); m = Math.hypot(fx, fz) || 1; }
        wx = fx / m; wz = fz / m; speed = (s.gold ? S.goldFlee : S.flee) * pace * Math.min(1, 0.45 + threat * 1.3);
        s.wt = Math.min(s.wt, 0.8);
      } else {
        s.wt -= dt; if (s.wt <= 0) wanderTarget(s);
        const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
        if (d > 0.3) { wx = dx / d; wz = dz / d; } else speed = 0;
      }
    }
    const k = Math.min(1, S.steer * dt);
    s.vx += (wx * speed - s.vx) * k; s.vz += (wz * speed - s.vz) * k;
    s.x += s.vx * dt; s.z += s.vz * dt;
    clampToArena(s, arena, S.sheepR); collideObstacles(s, arena, S.sheepR);
  }
  const score = pid => { const i = owner.indexOf(pid); let t = 0; for (const s of sheep) if (s.pen === i) t += valueOf(s); return t; };

  return {
    bodies, events,
    init: () => ({ solo, arena, pens: pens.map((p, i) => ({ ...p, pid: owner[i] })), left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.cool <= 0) { s.cool = S.baaCool; s.baas++; baa(pid); }
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      for (const s of P.values()) if (s.cool > 0) s.cool -= dt;
      separate(bodies.values());
      for (const b of bodies.values()) { clampToArena(b, arena); collideObstacles(b, arena); }
      for (const s of sheep) stepSheep(s, dt);
      // sheep keep a little room from each other and from people
      for (let i = 0; i < sheep.length; i++) {
        const a = sheep[i];
        for (let j = i + 1; j < sheep.length; j++) {
          const c = sheep[j], dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz);
          if (d < S.sepR && d > 1e-4) { const p = (S.sepR - d) / 2, nx = dx / d, nz = dz / d; a.x -= nx * p; a.z -= nz * p; c.x += nx * p; c.z += nz * p; }
        }
        for (const b of bodies.values()) { const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = S.sheepR + 0.45; if (d < min && d > 1e-4) { a.x += dx / d * (min - d); a.z += dz / d * (min - d); } }
        clampToArena(a, arena, S.sheepR); collideObstacles(a, arena, S.sheepR);
      }
      // into a pen, or out of one
      for (const s of sheep) {
        const now = penAt(pens, s.x, s.z), was = s.pen;
        if (was < 0 && now >= 0) { s.pen = now; s.scare = Math.min(s.scare, 0.3); wanderTarget(s); events.push({ e: 'pen', pid: owner[now], v: valueOf(s), gold: s.gold, x: r2(s.x), z: r2(s.z) }); }
        else if (was >= 0 && penAt(pens, s.x, s.z, -0.5) !== was) { s.pen = -1; events.push({ e: 'out', pid: owner[was], v: valueOf(s), x: r2(s.x), z: r2(s.z) }); }
      }
      // keep the meadow stocked
      spawnT -= dt;
      const free = sheep.filter(s => s.pen < 0);
      if (spawnT <= 0 && free.length < S.minFree[n] && sheep.length < S.cap) { spawnT = S.spawnEvery; const s = addSheep(false); events.push({ e: 'spawn', id: s.id, x: r2(s.x), z: r2(s.z) }); }
      if (!free.some(s => s.gold)) { goldT -= dt; if (goldT <= 0 && sheep.length < S.cap + 4) { goldT = S.goldEvery; const s = addSheep(true); events.push({ e: 'spawn', id: s.id, gold: true, x: r2(s.x), z: r2(s.z) }); } }
      time -= dt;
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = score(p.pid);
      return { sc, sh: sheep.map(s => [s.id, r2(s.x), r2(s.z), s.gold ? 1 : 0]), left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const v = score(p.pid); scores[p.pid] = v; if (!groups.has(v)) groups.set(v, []); groups.get(v).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    _sheep: sheep, _pens: pens,
  };
}
