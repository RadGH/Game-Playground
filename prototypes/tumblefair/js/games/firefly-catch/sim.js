// FIREFLY CATCH — a meadow at dusk. Fireflies drift about, blinking, and dart away from anyone who comes close. A =
// swing your net: it catches every firefly in a short cone in front of you (a little aim help turns you toward the
// nearest one). GOLDEN fireflies are quicker and jumpier and worth 3. B = shake a bush you are standing by: 3 more
// fireflies burst out of it (sometimes a golden one); a shaken bush needs a few seconds to fill up again. Most
// fireflies wins. Solo: the same meadow against the clock, with medal scores to beat.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'firefly-catch', title: 'Firefly Catch', blurb: 'Swing your net and catch the most fireflies before the night falls!',
  how: ['A swings your net at the fireflies in front of you.', 'Golden fireflies are worth 3!', 'B by a bush shakes it: more fireflies pop out.', 'Fireflies dart away if you rush them.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Net', b: 'Shake' }, move: { speed: 5.6, accel: 26, stunDrag: 2 },
  arena: { shape: 'rect', hw: 9, hd: 6.5, wall: true }, pitch: 58, card: 'card-firefly-catch', css: true,
};

export const RULES = {
  netCool: 0.5, reach: 2.0, cone: 0.75, aim: 1.25,               // cone / aim: half-angles, radians
  shakeCool: 0.8, shakeR: 1.45, bushRefill: { easy: 8, normal: 10, hard: 12 }, burst: 3, burstGold: 0.3,
  field: n => 5 + 2 * n, spawnEvery: 0.9, goldChance: 0.1, maxGold: 2,
  speed: 1.1, goldSpeed: 2.0, turn: 2.4,
  flee: { easy: 0.6, normal: 1.0, hard: 1.5 }, fleeR: 2.4, fleeSpeed: 3.6,
  gold: 3, medals: { easy: [20, 35, 50], normal: [25, 40, 55], hard: [22, 36, 50] },
};
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.flee[difficulty] ? difficulty : 'normal';
  const n = players.length, solo = n === 1, bodies = new Map(), { hw, hd } = meta.arena;
  // five or six bushes, spread out, never on a spawn point
  const spawns = spawnRing(n, solo ? 0 : 3.4), posts = [];
  for (let k = 0; k < 60 && posts.length < 5; k++) {
    const x = r2(rng.range(-hw + 1.6, hw - 1.6)), z = r2(rng.range(-hd + 1.5, hd - 1.5));
    if (posts.some(p => Math.hypot(p.x - x, p.z - z) < 4) || spawns.some(s => Math.hypot(s.x - x, s.z - z) < 2.2) || Math.hypot(x, z) < 1.5) continue;
    posts.push({ x, z, r: 0.75 });
  }
  const arena = { ...meta.arena, posts };
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, net: 0, shake: 0, pts: 0, got: 0, gold: 0 }]));
  const bush = posts.map(() => ({ ready: 0 }));
  let flies = [], fid = 0, spawnIn = 0, time = meta.seconds, over = false;
  const events = [];
  const freeSpot = () => {
    for (let k = 0; k < 12; k++) {
      const x = rng.range(-hw + 0.8, hw - 0.8), z = rng.range(-hd + 0.8, hd - 0.8);
      let ok = !posts.some(p => Math.hypot(p.x - x, p.z - z) < 1.2);
      for (const b of bodies.values()) if (Math.hypot(b.x - x, b.z - z) < 2.5) ok = false;
      if (ok) return { x, z };
    }
    return { x: rng.range(-hw + 1, hw - 1), z: -hd + 0.8 };
  };
  function addFly(x, z, gold, burst = null) {
    const a = rng.range(0, Math.PI * 2);
    const f = { id: ++fid, x, z, h: a, gold, vx: 0, vz: 0, ph: r2(rng.range(0, 6.28)) };
    if (burst) { f.vx = Math.sin(a) * 4; f.vz = Math.cos(a) * 4; }
    flies.push(f); return f;
  }
  const goldCount = () => flies.filter(f => f.gold).length;
  return {
    bodies, events,
    init: () => ({ solo, arena, medals: solo ? RULES.medals[D] : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      if (pa && s.net <= 0) {
        s.net = RULES.netCool;
        const ang = f => { let da = Math.atan2(f.x - b.x, f.z - b.z) - b.yaw; return Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); };
        let near = null, nd = 99;
        for (const f of flies) { const d = Math.hypot(f.x - b.x, f.z - b.z); if (d <= RULES.reach + 0.3 && ang(f) <= RULES.aim && d < nd) { nd = d; near = f; } }
        if (near) b.yaw = Math.atan2(near.x - b.x, near.z - b.z);              // aim help
        const caught = flies.filter(f => Math.hypot(f.x - b.x, f.z - b.z) <= RULES.reach && ang(f) <= RULES.cone);
        if (caught.length) {
          const ids = new Set(caught.map(f => f.id));
          flies = flies.filter(f => !ids.has(f.id));
          let add = 0; for (const f of caught) { add += f.gold ? RULES.gold : 1; s.got++; if (f.gold) s.gold++; }
          s.pts += add;
          events.push({ e: 'catch', pid, n: caught.length, add, gold: caught.some(f => f.gold) ? 1 : 0, ids: [...ids], x: r2(b.x + Math.sin(b.yaw) * 1.2), z: r2(b.z + Math.cos(b.yaw) * 1.2) });
        } else events.push({ e: 'swish', pid });
      }
      if (pb && s.shake <= 0) {
        s.shake = RULES.shakeCool;
        const i = posts.findIndex(p => Math.hypot(p.x - b.x, p.z - b.z) <= p.r + RULES.shakeR);
        if (i >= 0 && bush[i].ready <= 0) {
          bush[i].ready = RULES.bushRefill[D];
          const p = posts[i];
          for (let k = 0; k < RULES.burst; k++) addFly(p.x, p.z, false, true);
          if (goldCount() < RULES.maxGold && rng.chance(RULES.burstGold)) addFly(p.x, p.z, true, true);
          b.yaw = Math.atan2(p.x - b.x, p.z - b.z);
          events.push({ e: 'shake', pid, bush: i });
        } else if (i >= 0) events.push({ e: 'empty', pid, bush: i, to: pid });
      }
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      time -= dt;
      separate(bodies.values());
      for (const s of P.values()) { if (s.net > 0) s.net -= dt; if (s.shake > 0) s.shake -= dt; }
      for (const bs of bush) if (bs.ready > 0) bs.ready -= dt;
      // keep the meadow stocked
      spawnIn -= dt;
      if (spawnIn <= 0 && flies.length < RULES.field(n)) {
        spawnIn = RULES.spawnEvery;
        const at = freeSpot();
        addFly(r2(at.x), r2(at.z), goldCount() < RULES.maxGold && rng.chance(RULES.goldChance));
      }
      // drift: wander, dart away from people, stay in the meadow
      for (const f of flies) {
        f.h += rng.range(-1, 1) * RULES.turn * dt;
        const sp = f.gold ? RULES.goldSpeed : RULES.speed;
        let wx = Math.sin(f.h) * sp, wz = Math.cos(f.h) * sp;
        for (const b of bodies.values()) {
          const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz);
          if (d < RULES.fleeR && d > 1e-3) { const k = (1 - d / RULES.fleeR) * RULES.fleeSpeed * RULES.flee[D] * (f.gold ? 1.5 : 1); wx += dx / d * k; wz += dz / d * k; }
        }
        f.vx += (wx - f.vx) * Math.min(1, 3 * dt); f.vz += (wz - f.vz) * Math.min(1, 3 * dt);
        f.x += f.vx * dt; f.z += f.vz * dt;
        if (f.x < -hw + 0.4) { f.x = -hw + 0.4; f.h = Math.abs(f.h); f.vx = Math.abs(f.vx); } else if (f.x > hw - 0.4) { f.x = hw - 0.4; f.h = -Math.abs(f.h); f.vx = -Math.abs(f.vx); }
        if (f.z < -hd + 0.4) { f.z = -hd + 0.4; f.h = 0; f.vz = Math.abs(f.vz); } else if (f.z > hd - 0.4) { f.z = hd - 0.4; f.h = Math.PI; f.vz = -Math.abs(f.vz); }
      }
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).pts;
      return { sc, f: flies.map(f => [f.id, r2(f.x), r2(f.z), f.gold ? 1 : 0, f.ph]), bu: bush.map(b => (b.ready > 0 ? 0 : 1)), left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = P.get(p.pid).pts; scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get flies() { return flies; }, posts, arena,
  };
}
