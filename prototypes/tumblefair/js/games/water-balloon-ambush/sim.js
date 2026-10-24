// WATER BALLOON AMBUSH — a farmyard free-for-all. Grab water balloons from the four buckets (you can carry three),
// then HOLD A to wind up and let go to throw: the longer you hold, the further it flies (a ring on the ground shows
// where). It bursts where it lands — or on the first hay bale in its way, so hide behind the bales! Anyone in the
// splash is SOAKED: a point to the thrower, and they squelch along at half speed for a moment. Every burst leaves a
// puddle; stand in one to scoop up a balloon. B is a quick dodge. Most soakings when the farmer rings the bell wins.
// Alone: soak the scarecrows that pop up round the yard.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 9, HD = 7;
export const meta = {
  id: 'water-balloon-ambush', title: 'Water Balloon Ambush', blurb: 'Grab balloons, hide behind the hay, and soak everybody!',
  how: ['Walk into a bucket (or stand in a puddle) to grab water balloons.', 'HOLD A to wind up, let go to throw: longer = further.', 'A soaking is a point. Hay bales block balloons: hide! B = dodge.'],
  kind: 'arena', min: 1, max: 4, seconds: 64, scoring: 'points', unit: 'soaks', tags: ['action'], card: 'card-water-balloon-ambush', css: true,
  controls: { stick: true, a: 'Throw (hold)', b: 'Dodge' }, move: { speed: 5.6, accel: 30, carryMul: 0.75, slowMul: 0.5, stunDrag: 3 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true }, pitch: 58,
};
export const RULES = {
  play: 60, carry: 3, wind: 0.9, minRange: 2.5, maxRange: 10, flyBase: 0.3, flyPer: 0.035, arc: 0.45,
  splash: 1.25, baleSplash: 0.65, soak: 1.6, immune: 1.4, aimCone: 0.45, aimRange: 11,
  bucketR: 1.1, bucketMax: 4, refill: 2.4, puddleR: 0.95, puddleLife: 7, scoop: 1.0,
  dashCool: 1.8, dashTime: 0.22, dashSpeed: 13,
  scarecrows: 3, scarecrowEvery: 1.5,
};
export const BUCKETS = [{ x: -7.6, z: 0 }, { x: 7.6, z: 0 }, { x: 0, z: -5.8 }, { x: 0, z: 5.8 }];
const r2 = v => Math.round(v * 100) / 100;

/** Hay bales from the seed, mirrored left-right so no side is easier: four pairs, clear of the buckets and the middle. */
export function makeLayout(rng) {
  const blocks = [];
  const free = (x, z, hw, hd) => Math.hypot(x, z) > 2.2 && Math.abs(x) + hw < HW - 0.8 && Math.abs(z) + hd < HD - 0.8 &&
    BUCKETS.every(b => Math.abs(b.x - x) > hw + 1.8 || Math.abs(b.z - z) > hd + 1.8) &&
    blocks.every(o => Math.abs(o.x - x) > o.hw + hw + 1.4 || Math.abs(o.z - z) > o.hd + hd + 1.4);
  for (let k = 0, made = 0; k < 120 && made < 4; k++) {
    const turn = rng.chance(0.5), hw = turn ? 0.5 : 1.05, hd = turn ? 1.05 : 0.5;
    const x = r2(rng.range(1.2, HW - 1.6)), z = r2(rng.range(-HD + 1.4, HD - 1.4));
    if (!free(x, z, hw, hd) || !free(-x, z, hw, hd) || x - hw < 0.9) continue;
    blocks.push({ x, z, hw, hd }, { x: -x, z, hw, hd }); made++;
  }
  return { ...meta.arena, blocks };
}
/** Where the segment a -> b first enters a bale (fraction 0-1), or null. */
export function baleHit(blocks, ax, az, bx, bz) {
  let best = null;
  for (const o of blocks) {
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[ax, bx - ax, o.x - o.hw, o.x + o.hw], [az, bz - az, o.z - o.hd, o.z + o.hd]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = 2; break; } continue; }
      let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 <= 1 && (best == null || t0 < best)) best = t0;
  }
  return best;
}
/** How far a throw wound up for `held` seconds flies. */
export const rangeOf = held => RULES.minRange + (RULES.maxRange - RULES.minRange) * Math.min(1, held / RULES.wind);

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, solo = n === 1, bodies = new Map(), arena = makeLayout(rng), spawns = spawnRing(n, solo ? 0 : 4.2);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(r2(spawns[i].x), r2(spawns[i].z), spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, held: 0, holding: false, balloons: 1, soakT: 0, immune: 0, dashCool: 0, dash: 0, scoopT: 0, soaks: 0, soaked: 0, thrown: 0 }]));
  const buckets = BUCKETS.map(() => ({ n: RULES.bucketMax, t: 0 }));
  let flying = [], fid = 0, puddles = [], pid0 = 0, crows = [], cid = 0, nextCrow = 0.6, time = RULES.play, over = false;
  const events = [];
  const hard = difficulty === 'hard', easy = difficulty === 'easy';
  function aimFrom(pid, b, fx, fz) {
    const marks = solo ? crows : players.filter(p => p.pid !== pid).map(p => bodies.get(p.pid));
    let best = null, bestA = RULES.aimCone * (easy ? 1.3 : hard ? 0.8 : 1);
    for (const m of marks) {
      const dx = m.x - b.x, dz = m.z - b.z, d = Math.hypot(dx, dz); if (d < 0.5 || d > RULES.aimRange) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      if (ang < bestA) { bestA = ang; best = [dx / d, dz / d]; }
    }
    return best || [fx, fz];
  }
  function throwFrom(pid) {
    const s = P.get(pid), b = bodies.get(pid), range = rangeOf(s.held);
    s.held = 0; s.holding = false; b.flags &= ~F.CARRY;
    if (s.balloons <= 0) { events.push({ e: 'empty', pid }); return; }
    s.balloons--; s.thrown++;
    const [ax, az] = aimFrom(pid, b, Math.sin(b.yaw), Math.cos(b.yaw));
    let tx = b.x + ax * range, tz = b.z + az * range;
    tx = Math.max(-HW + 0.2, Math.min(HW - 0.2, tx)); tz = Math.max(-HD + 0.2, Math.min(HD - 0.2, tz));
    const sx = b.x + ax * 0.5, sz = b.z + az * 0.5, hit = baleHit(arena.blocks, sx, sz, tx, tz);
    const k = hit == null ? 1 : Math.max(0, hit - 0.02), ex = sx + (tx - sx) * k, ez = sz + (tz - sz) * k;
    const dist = Math.hypot(ex - sx, ez - sz), fly = RULES.flyBase + RULES.flyPer * dist;
    flying.push({ id: ++fid, by: pid, sx: r2(sx), sz: r2(sz), ex: r2(ex), ez: r2(ez), t: 0, fly, bale: hit != null });
    events.push({ e: 'throw', pid, range: r2(range) });
  }
  function burst(f) {
    const R = f.bale ? RULES.baleSplash : RULES.splash, got = [];
    for (const [pid, b] of bodies) {
      if (pid === f.by) continue; const s = P.get(pid);
      if (s.immune > 0 || Math.hypot(b.x - f.ex, b.z - f.ez) > R + 0.3) continue;
      s.soakT = RULES.soak; s.immune = RULES.immune; s.soaked++; b.flags |= F.SLOW; got.push(pid);
      if (s.holding) { s.holding = false; s.held = 0; b.flags &= ~F.CARRY; }
    }
    for (const c of crows) if (!c.down && Math.hypot(c.x - f.ex, c.z - f.ez) <= R + 0.35) { c.down = 1.2; got.push('crow'); }
    P.get(f.by).soaks += got.length;
    puddles.push({ id: ++pid0, x: f.ex, z: f.ez, life: RULES.puddleLife });
    if (puddles.length > 12) puddles.shift();
    events.push({ e: 'burst', by: f.by, x: f.ex, z: f.ez, bale: f.bale, soaked: got });
  }
  return {
    bodies, events,
    init: () => ({ arena, buckets: BUCKETS, solo, left: Math.ceil(time), carry: RULES.carry, minRange: RULES.minRange, maxRange: RULES.maxRange, wind: RULES.wind }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, downA = !!(bits & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B), upA = !downA && (s.prevB & IN.A);
      s.prevB = bits;
      if (downA && !s.holding && s.balloons > 0) { s.holding = true; s.held = 0; b.flags |= F.CARRY; }
      if (downA && s.holding) s.held = Math.min(RULES.wind * 1.5, s.held + 0.05);
      if (upA && s.holding) throwFrom(pid);
      if (pb && s.dashCool <= 0) { s.dashCool = RULES.dashCool; s.dash = RULES.dashTime; b.vx = Math.sin(b.yaw) * RULES.dashSpeed; b.vz = Math.cos(b.yaw) * RULES.dashSpeed; b.flags |= F.STUN; events.push({ e: 'dash', pid }); }
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      separate([...bodies.values()]);
      for (const f of flying) { f.t += dt; if (f.t >= f.fly) burst(f); }
      flying = flying.filter(f => f.t < f.fly);
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.dash > 0) { s.dash -= dt; if (s.dash <= 0) b.flags &= ~F.STUN; }
        if (s.dashCool > 0) s.dashCool -= dt;
        if (s.immune > 0) s.immune -= dt;
        if (s.soakT > 0) { s.soakT -= dt; if (s.soakT <= 0) b.flags &= ~F.SLOW; }
        buckets.forEach((k, i) => { if (s.balloons < RULES.carry && k.n > 0 && Math.hypot(b.x - BUCKETS[i].x, b.z - BUCKETS[i].z) < RULES.bucketR + 0.45) { const take = Math.min(k.n, RULES.carry - s.balloons); k.n -= take; s.balloons += take; events.push({ e: 'grab', pid, n: take }); } });
        const inPuddle = s.balloons < RULES.carry && puddles.some(p => Math.hypot(b.x - p.x, b.z - p.z) < RULES.puddleR);
        if (inPuddle) { s.scoopT += dt; if (s.scoopT >= RULES.scoop) { s.scoopT = 0; s.balloons++; events.push({ e: 'scoop', pid }); } } else s.scoopT = 0;
      }
      for (const k of buckets) if (k.n < RULES.bucketMax) { k.t += dt; if (k.t >= RULES.refill) { k.t = 0; k.n++; } } else k.t = 0;
      for (const p of puddles) p.life -= dt;
      puddles = puddles.filter(p => p.life > 0);
      if (solo) {
        for (const c of crows) if (c.down) { c.down -= dt; if (c.down <= 0) c.gone = true; }
        crows = crows.filter(c => !c.gone);
        nextCrow -= dt;
        if (nextCrow <= 0 && crows.filter(c => !c.down).length < RULES.scarecrows) {
          nextCrow = RULES.scarecrowEvery; const b = bodies.get(players[0].pid);
          for (let k = 0; k < 12; k++) {
            const x = r2(rng.range(-HW + 1.2, HW - 1.2)), z = r2(rng.range(-HD + 1.2, HD - 1.2));
            if (Math.hypot(x - b.x, z - b.z) < 3 || arena.blocks.some(o => Math.abs(o.x - x) < o.hw + 0.7 && Math.abs(o.z - z) < o.hd + 0.7)) continue;
            crows.push({ id: ++cid, x, z, down: 0 }); break;
          }
        }
      }
      time -= dt;
      if (time <= 0 && !flying.length) { over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}, h = {};
      for (const p of players) { const s = P.get(p.pid); sc[p.pid] = s.soaks; h[p.pid] = [s.balloons, s.holding ? Math.round(Math.min(1, s.held / RULES.wind) * 100) : -1, s.soakT > 0 ? 1 : 0]; }
      const g = { sc, h, f: flying.map(f => [f.id, f.sx, f.sz, f.ex, f.ez, r2(f.t / f.fly), f.by]), pd: puddles.map(p => [p.id, r2(p.x), r2(p.z)]), bk: buckets.map(k => k.n), left: Math.max(0, Math.ceil(time)) };
      if (solo) g.cr = crows.map(c => [c.id, c.x, c.z, c.down > 0 ? 1 : 0]);
      return g;
    },
    get over() { return over; },
    _P: P, _arena: arena, _buckets: buckets, get _puddles() { return puddles; }, get _crows() { return crows; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const s = P.get(p.pid); scores[p.pid] = s.soaks;
        const k = s.soaks * 1000 - Math.min(999, s.soaked);                   // ties: fewer times soaked
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
