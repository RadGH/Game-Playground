// FIREFLY CATCH — a meadow at dusk. Fireflies drift about, blinking, and dart away from anyone who comes close. A =
// swing your net: it catches every firefly in a short cone in front of you, and turns you to the nearest one first.
// GOLDEN fireflies are quicker and jumpier and worth 3. Swing beside a glowing bush and you shake it too: 3 more
// fireflies burst out (sometimes a golden one); a shaken bush needs a few seconds to fill up again. Most fireflies wins.
// Expansion 1 / M4 (2026-11-07, "controls", "buggy"): fireflies fled from 2.4 m away but the net only reached 2.0 m,
// so walking up to one pushed it just out of reach every time and the swing whiffed (it looked broken); the aim help
// only turned you if the fly was already roughly in front; flies drifted INTO bushes where nobody could reach them;
// and a second button (B = shake) had to be found next to a bush. Now: ONE button, the net reaches past the distance
// a firefly starts to run, the aim help turns you to the nearest firefly in any direction, flies keep out of bushes,
// and a swing next to a full bush shakes it. Alone you race Wren, a computer fairgoer with a net of her own.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'firefly-catch', title: 'Firefly Catch', blurb: 'Swing your net and catch the most fireflies before the night falls!',
  how: ['Walk near a firefly and tap NET: you turn and swing.', 'Golden fireflies are worth 3!', 'Swing by a glowing bush: more fireflies pop out.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'pts', tags: ['action'], rival: true,
  controls: { stick: true, a: 'Net' }, move: { speed: 5.6, accel: 26, stunDrag: 2 },
  arena: { shape: 'rect', hw: 9, hd: 6.5, wall: true }, pitch: 58, card: 'card-firefly-catch', css: true,
};

export const RULES = {
  netCool: 0.45, reach: 2.3, cone: 0.8, aim: Math.PI,           // cone: half-angle (radians); aim: the help turns you to the nearest fly in ANY direction
  aimR: 2.9,                                                     // …within this distance
  shakeR: 1.6, bushRefill: { easy: 8, normal: 10, hard: 12 }, burst: 3, burstGold: 0.3,
  field: n => 5 + 2 * n, spawnEvery: 0.9, goldChance: 0.1, maxGold: 2,
  speed: 1.1, goldSpeed: 2.0, turn: 2.4,
  flee: { easy: 0.6, normal: 1.0, hard: 1.4 }, fleeR: 1.7, fleeSpeed: 3.2,     // fleeR < reach: a fly that starts to run is still in reach
  gold: 3,
  // Wren, the computer fairgoer (alone only): walks at this share of full speed, swings after this pause once in reach
  cpu: { pace: { easy: 0.55, normal: 0.7, hard: 0.85 }, wait: [0.15, 0.45] },
};
export const CPU_NAME = 'Wren';
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
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
  const P = new Map(players.map(p => [p.pid, { prevB: 0, net: 0, pts: 0, got: 0, gold: 0 }]));
  // Wren: a body of her own (never in `bodies`: the room sends those), the same net and the same rules
  const cpu = solo && rivals !== false ? { body: makeBody(3, 0, -Math.PI / 2), s: { prevB: 0, net: 0, pts: 0, got: 0, gold: 0 }, wait: -1 } : null;
  const people = () => cpu ? [...bodies.values(), cpu.body] : [...bodies.values()];
  const bush = posts.map(() => ({ ready: 0 }));
  let flies = [], fid = 0, spawnIn = 0, time = meta.seconds, over = false;
  const events = [];
  const freeSpot = () => {
    for (let k = 0; k < 12; k++) {
      const x = rng.range(-hw + 0.8, hw - 0.8), z = rng.range(-hd + 0.8, hd - 0.8);
      let ok = !posts.some(p => Math.hypot(p.x - x, p.z - z) < 1.2);
      for (const b of people()) if (Math.hypot(b.x - x, b.z - z) < 2.5) ok = false;
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
  /** One swing of the net: turn to the nearest fly in reach, catch what is in the cone, and shake a full bush you are by. */
  function swing(pid, b, s) {
    s.net = RULES.netCool;
    let near = null, nd = 99;
    for (const f of flies) { const d = Math.hypot(f.x - b.x, f.z - b.z); if (d <= RULES.aimR && d < nd) { nd = d; near = f; } }
    if (near) b.yaw = Math.atan2(near.x - b.x, near.z - b.z);              // aim help, any direction
    const ang = f => { let da = Math.atan2(f.x - b.x, f.z - b.z) - b.yaw; return Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); };
    const caught = flies.filter(f => Math.hypot(f.x - b.x, f.z - b.z) <= RULES.reach && ang(f) <= RULES.cone);
    if (caught.length) {
      const ids = new Set(caught.map(f => f.id));
      flies = flies.filter(f => !ids.has(f.id));
      let add = 0; for (const f of caught) { add += f.gold ? RULES.gold : 1; s.got++; if (f.gold) s.gold++; }
      s.pts += add;
      events.push({ e: 'catch', pid, n: caught.length, add, gold: caught.some(f => f.gold) ? 1 : 0, ids: [...ids], x: r2(b.x + Math.sin(b.yaw) * 1.2), z: r2(b.z + Math.cos(b.yaw) * 1.2) });
    } else events.push({ e: 'swish', pid });
    // a full bush within reach shakes too
    const i = posts.findIndex((p, k) => bush[k].ready <= 0 && Math.hypot(p.x - b.x, p.z - b.z) <= p.r + RULES.shakeR);
    if (i >= 0) {
      bush[i].ready = RULES.bushRefill[D];
      const p = posts[i];
      for (let k = 0; k < RULES.burst; k++) addFly(p.x, p.z, false, true);
      if (goldCount() < RULES.maxGold && rng.chance(RULES.burstGold)) addFly(p.x, p.z, true, true);
      events.push({ e: 'shake', pid, bush: i });
    }
  }
  // Wren: walk to the nearest firefly (or a full bush when the meadow is thin), swing a beat after it is in reach
  function cpuInput(dt) {
    const b = cpu.body, s = cpu.s;
    let target = null, td = 99;
    for (const f of flies) { const d = Math.hypot(f.x - b.x, f.z - b.z) - (f.gold ? 1.5 : 0); if (d < td) { td = d; target = f; } }
    if (!target || td > 6) { const k = posts.findIndex((p, j) => bush[j].ready <= 0); if (k >= 0) { target = posts[k]; td = Math.hypot(target.x - b.x, target.z - b.z) - 1.2; } }
    if (!target) return null;
    const dx = target.x - b.x, dz = target.z - b.z, d = Math.hypot(dx, dz) || 1, inReach = d <= RULES.reach * 0.9 || (target.r && d <= target.r + RULES.shakeR * 0.9);
    if (inReach && s.net <= 0) { if (cpu.wait < 0) cpu.wait = rng.range(RULES.cpu.wait[0], RULES.cpu.wait[1]); cpu.wait -= dt; if (cpu.wait <= 0) { cpu.wait = -1; swing('cpu', b, s); } }
    const k = RULES.cpu.pace[D] * (inReach ? 0.25 : 1);
    return { mx: dx / d * k, mz: dz / d * k, b: 0 };
  }
  return {
    bodies, events,
    init: () => ({ solo, arena, cpu: cpu ? CPU_NAME : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.net <= 0) swing(pid, b, s);
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      time -= dt;
      if (cpu) { if (cpu.s.net > 0) cpu.s.net -= dt; stepBody(cpu.body, cpuInput(dt), meta.move, arena); }
      separate(people());
      for (const s of P.values()) if (s.net > 0) s.net -= dt;
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
        for (const b of people()) {
          const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz);
          if (d < RULES.fleeR && d > 1e-3) { const k = (1 - d / RULES.fleeR) * RULES.fleeSpeed * RULES.flee[D] * (f.gold ? 1.5 : 1); wx += dx / d * k; wz += dz / d * k; }
        }
        f.vx += (wx - f.vx) * Math.min(1, 3 * dt); f.vz += (wz - f.vz) * Math.min(1, 3 * dt);
        f.x += f.vx * dt; f.z += f.vz * dt;
        if (f.x < -hw + 0.4) { f.x = -hw + 0.4; f.h = Math.abs(f.h); f.vx = Math.abs(f.vx); } else if (f.x > hw - 0.4) { f.x = hw - 0.4; f.h = -Math.abs(f.h); f.vx = -Math.abs(f.vx); }
        if (f.z < -hd + 0.4) { f.z = -hd + 0.4; f.h = 0; f.vz = Math.abs(f.vz); } else if (f.z > hd - 0.4) { f.z = hd - 0.4; f.h = Math.PI; f.vz = -Math.abs(f.vz); }
        // never inside a bush, where no net could reach it (a burst fly leaves the bush it came out of first)
        for (const p of posts) { const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz), min = p.r + 0.15; if (d < min && Math.hypot(f.vx, f.vz) < 2.5) { if (d < 1e-3) { f.x += min; } else { f.x = p.x + dx / d * min; f.z = p.z + dz / d * min; } f.h = Math.atan2(dx, dz); } }
      }
      if (time <= 0) { time = 0; over = true; for (const b of people()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).pts;
      const g = { sc, f: flies.map(f => [f.id, r2(f.x), r2(f.z), f.gold ? 1 : 0, f.ph]), bu: bush.map(b => (b.ready > 0 ? 0 : 1)), left: Math.ceil(time) };
      if (cpu) { const b = cpu.body; g.cpu = [r2(b.x), r2(b.z), r2(b.yaw), cpu.s.pts, Math.hypot(b.vx, b.vz) > 0.3 ? 1 : 0]; }
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = P.get(p.pid).pts; scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get flies() { return flies; }, posts, arena, get cpu() { return cpu && { ...cpu.s, body: cpu.body }; },
  };
}
