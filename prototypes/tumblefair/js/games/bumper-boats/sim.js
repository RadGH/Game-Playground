// BUMPER BOATS — round tub boats on a round paddling pond, spinning as they go. The stick paddles (water is slippery:
// boats drift), and A squirts the water cannon the way you are pointing: it shoves any boat in the jet away and knocks
// its speed off (and nudges you back a little). Points come from sending OTHER boats into trouble:
//   the WHIRLPOOL in the middle pulls boats in; a boat that goes down the drain pops up at the edge a moment later —
//     whoever squirted or bumped it last (in the last few seconds) scores 3, and the boat that went down loses 1;
//   three FOUNTAINS circle the rim; each one bubbles, then spouts — a boat on it when it spouts is flung into the air,
//     and whoever pushed it there scores 2;
//   rubber ducks float about: paddle over one for 1.
// Most points when the clock runs out wins. Alone (and two players): CPU duck boats to push about.
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'bumper-boats', title: 'Bumper Boats', blurb: 'Squirt the other boats down the whirlpool and onto the fountains!',
  how: ['Paddle with the stick. A squirts water the way you point.', 'Push a boat down the whirlpool for 3, onto a spouting fountain for 2.', 'Grab rubber ducks for 1. Do not go down the drain yourself!'],
  kind: 'arena', min: 1, max: 4, seconds: 64, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true, a: 'Squirt' },
  move: { speed: 4.4, accel: 2.4, stunDrag: 1.1 },
  arena: { shape: 'circle', r: 8.6, wall: true }, pitch: 62, card: 'card-bumper-boats', css: true,
};
export const RULES = {
  countdown: 3, endPause: 1.8, boatR: 0.75,
  squirt: { cool: 0.65, range: 4.6, cone: 0.5, push: 7.5, stun: 0.4, recoil: 1.6 },
  bump: { r: 1.55, min: 1.1, push: 3.2, cool: 0.5 },
  rim: { bounce: 0.75, min: 0.8 },
  pool: { core: 1.05, range: 4.4, pull: 4.2, swirl: 2.6, down: 1.6 },
  fountain: { n: 3, ring: 6.2, spin: 0.16, r: 1.45, idle: [2.4, 3.8], warn: 1.1, spout: 0.45, fly: 1.0, fling: 3.2 },
  credit: 4.0, pts: { drain: 3, drained: -1, spout: 2, duck: 1 },
  duckEvery: [2.6, 4.2], duckMax: 3, duckR: 0.9,
  levels: { easy: { pull: 0.75, idle: 1.25 }, normal: { pull: 1, idle: 1 }, hard: { pull: 1.25, idle: 0.85 } },
  cpu: { names: ['Quackers', 'Puddles', 'Admiral Dab'], speedMul: 0.55 },
};
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, A = meta.arena, LV = RULES.levels[difficulty] || RULES.levels.normal, bodies = new Map();
  const boats = new Map();
  const start = i => { const a = Math.PI / 4 + i * Math.PI * 2 / Math.max(n, 2); return [Math.sin(a) * 6.2, Math.cos(a) * 6.2]; };
  players.forEach((p, i) => { const [x, z] = start(i), b = makeBody(x, z, r2(Math.atan2(-x, -z))); b.flags = F.FROZEN; bodies.set(p.pid, b); boats.set(p.pid, { id: p.pid, b, cpu: false, pts: 0, cool: 0, prevB: 0, by: null, byAt: -99, down: 0, fly: 0, stun: 0, drains: 0, sent: 0 }); });
  const nCpu = n === 1 ? 3 : n === 2 ? 1 : 0;
  for (let j = 0; j < nCpu; j++) {
    const a = Math.PI * (1.25 + j * 0.6), b = makeBody(r2(Math.sin(a) * 5.5), r2(Math.cos(a) * 5.5), 0); b.flags = F.FROZEN;
    boats.set(-1 - j, { id: -1 - j, b, cpu: true, name: RULES.cpu.names[j], pts: 0, cool: 0, by: null, byAt: -99, down: 0, fly: 0, stun: 0, aim: null, think: 0 });
  }
  const cpuMove = { ...meta.move, speed: meta.move.speed * RULES.cpu.speedMul };
  const fountains = Array.from({ length: RULES.fountain.n }, (_, i) => ({ i, a0: i * Math.PI * 2 / RULES.fountain.n + rng.range(-0.3, 0.3), st: 'idle', t: rng.range(1, 3) * LV.idle }));
  const fAt = (f, time) => { const a = f.a0 + RULES.fountain.spin * time; return [Math.sin(a) * RULES.fountain.ring, Math.cos(a) * RULES.fountain.ring]; };
  let ducks = [], duckId = 0, nextDuck = 1.5, countdown = RULES.countdown, lastCount = 4, time = meta.seconds - RULES.countdown - RULES.endPause - 0.4, el = 0, over = false, endIn = -1;
  const pairCool = new Map(), events = [];
  const live = () => countdown <= 0 && endIn < 0;
  const credit = (victim, by) => { if (by == null || by === victim.id) return; victim.by = by; victim.byAt = el; };
  const creditor = v => (v.by != null && el - v.byAt <= RULES.credit ? boats.get(v.by) : null);
  function rimBounce(c, pvx, pvz) {
    const b = c.b, d = Math.hypot(b.x, b.z), lim = A.r - 0.45;
    if (d < lim - 0.02) return;
    const nx = b.x / d, nz = b.z / d, vn = pvx * nx + pvz * nz;
    if (vn > RULES.rim.min) { b.vx = pvx - (1 + RULES.rim.bounce) * vn * nx; b.vz = pvz - (1 + RULES.rim.bounce) * vn * nz; if (vn > 2.5) events.push({ e: 'boing', id: c.id, x: r2(b.x), z: r2(b.z) }); }
  }
  function moveBoat(c, inp, move) {
    const b = c.b, pvx = b.vx, pvz = b.vz;
    stepBody(b, inp, move, A);
    rimBounce(c, pvx, pvz);
  }
  function squirt(c) {
    const b = c.b, S = RULES.squirt, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    c.cool = S.cool; b.vx -= fx * S.recoil; b.vz -= fz * S.recoil;
    const hit = [];
    for (const o of boats.values()) {
      if (o === c || o.down > 0 || o.fly > 0) continue;
      const dx = o.b.x - b.x, dz = o.b.z - b.z, d = Math.hypot(dx, dz); if (d > S.range || d < 1e-6) continue;
      const cos = (dx * fx + dz * fz) / d; if (cos < Math.cos(S.cone)) continue;
      const k = S.push * (1 - 0.45 * d / S.range);
      o.b.vx = o.b.vx * 0.3 + (dx / d * 0.6 + fx * 0.4) * k; o.b.vz = o.b.vz * 0.3 + (dz / d * 0.6 + fz * 0.4) * k;
      o.b.flags |= F.STUN; o.stun = S.stun; credit(o, c.id); hit.push(o.id);
    }
    events.push({ e: 'squirt', id: c.id, x: r2(b.x), z: r2(b.z), yaw: r2(b.yaw), hit });
  }
  function drain(c) {
    c.down = RULES.pool.down; c.b.flags = (c.b.flags & ~(F.STUN | F.AIR)) | F.OUT; c.b.vx = c.b.vz = 0;
    const by = creditor(c); let pts = 0;
    if (!c.cpu) { const before = c.pts; c.pts = Math.max(0, c.pts + RULES.pts.drained); pts = c.pts - before; c.drains++; }
    if (by && !by.cpu) { by.pts += RULES.pts.drain; by.sent++; }
    events.push({ e: 'drain', id: c.id, by: by?.id ?? null, pts: by && !by.cpu ? RULES.pts.drain : 0, lost: pts });
    c.by = null;
  }
  function popUp(c) {
    // back up at the rim, as far from everyone as we can find
    let best = null, bd = -1;
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6 + 0.13, x = Math.sin(a) * 7.2, z = Math.cos(a) * 7.2;
      const near = Math.min(99, ...[...boats.values()].filter(o => o !== c && o.down <= 0).map(o => Math.hypot(o.b.x - x, o.b.z - z)));
      if (near > bd) { bd = near; best = [x, z]; }
    }
    Object.assign(c.b, { x: r2(best[0]), z: r2(best[1]), vx: 0, vz: 0, y: 0, yaw: r2(Math.atan2(-best[0], -best[1])) });
    c.b.flags &= ~F.OUT; events.push({ e: 'pop', id: c.id, x: c.b.x, z: c.b.z });
  }
  function cpuThink(c, dt) {
    const b = c.b; if (b.flags & (F.FROZEN | F.STUN | F.OUT | F.AIR)) { stepBody(b, null, cpuMove, A); return; }
    c.think -= dt;
    if (!c.aim || c.think <= 0 || Math.hypot(c.aim[0] - b.x, c.aim[1] - b.z) < 1.2) {
      c.think = rng.range(1.6, 3); const a = rng.range(0, Math.PI * 2), r = rng.range(3, 7); c.aim = [Math.sin(a) * r, Math.cos(a) * r];
    }
    let dx = c.aim[0] - b.x, dz = c.aim[1] - b.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const dc = Math.hypot(b.x, b.z); if (dc < RULES.pool.range + 0.5) { dx += b.x / dc * 1.2; dz += b.z / dc * 1.2; }   // they do try to keep out of the whirlpool
    const m = Math.hypot(dx, dz) || 1; moveBoat(c, { mx: dx / m, mz: dz / m, b: 0 }, cpuMove);
  }
  return {
    bodies, events,
    init: () => ({ cpus: [...boats.values()].filter(c => c.cpu).map(c => ({ id: c.id, name: c.name })), fountains: fountains.map(f => f.a0), rules: { ring: RULES.fountain.ring, spin: RULES.fountain.spin, fr: RULES.fountain.r, core: RULES.pool.core, range: RULES.pool.range, squirt: RULES.squirt.range, cone: RULES.squirt.cone } }),
    input(pid, inp) {
      const c = boats.get(pid); if (!c || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(c.prevB & IN.A); c.prevB = bits;
      if (!live() || c.down > 0 || c.fly > 0) { stepBody(c.b, null, meta.move, A); return; }
      moveBoat(c, inp, meta.move);
      if (pa && c.cool <= 0 && !(c.b.flags & F.STUN)) squirt(c);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (countdown > 0) {
        countdown -= dt; const s = Math.ceil(countdown);
        if (s < lastCount && s > 0) { lastCount = s; events.push({ e: 'count', n: s }); }
        if (countdown <= 0) { for (const c of boats.values()) c.b.flags &= ~F.FROZEN; events.push({ e: 'go' }); }
        return;
      }
      time -= dt; el += dt;
      const P = RULES.pool;
      for (const c of boats.values()) {
        const b = c.b;
        if (c.cpu) cpuThink(c, dt);
        if (c.cool > 0) c.cool -= dt;
        if (c.stun > 0) { c.stun -= dt; if (c.stun <= 0 && !(c.fly > 0)) b.flags &= ~F.STUN; }
        if (c.down > 0) { c.down -= dt; if (c.down <= 0) popUp(c); continue; }
        if (c.fly > 0) {
          c.fly -= dt; const u = 1 - c.fly / RULES.fountain.fly; b.y = r2(Math.max(0, 4 * 2.4 * u * (1 - u)));
          b.x += b.vx * dt; b.z += b.vz * dt; const d = Math.hypot(b.x, b.z), lim = A.r - 0.5; if (d > lim) { b.x *= lim / d; b.z *= lim / d; b.vx *= -0.4; b.vz *= -0.4; }
          if (c.fly <= 0) { b.y = 0; b.flags &= ~(F.AIR | F.STUN); events.push({ e: 'splash', id: c.id, x: r2(b.x), z: r2(b.z) }); }
          continue;
        }
        // the whirlpool: a pull toward the middle and a swirl round it, strongest near the drain
        const d = Math.hypot(b.x, b.z);
        if (d < P.range && d > 1e-6) {
          const k = (1 - d / P.range), nx = -b.x / d, nz = -b.z / d;
          b.vx += (nx * P.pull * LV.pull * k + nz * P.swirl * k) * dt; b.vz += (nz * P.pull * LV.pull * k - nx * P.swirl * k) * dt;
          if (d < P.core) drain(c);
        }
      }
      // boat bumps
      const list = [...boats.values()].filter(c => c.down <= 0 && c.fly <= 0);
      separate(list.map(c => c.b), RULES.boatR);
      for (const [k2, t] of pairCool) { if (t - dt <= 0) pairCool.delete(k2); else pairCool.set(k2, t - dt); }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], c = list[j], key = a.id + ':' + c.id;
        if (pairCool.has(key)) continue;
        const dx = c.b.x - a.b.x, dz = c.b.z - a.b.z, d = Math.hypot(dx, dz); if (d > RULES.bump.r || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, va = a.b.vx * nx + a.b.vz * nz, vc = c.b.vx * nx + c.b.vz * nz, close = va - vc;
        if (close < RULES.bump.min) continue;
        pairCool.set(key, RULES.bump.cool);
        const imp = close * 0.9 + RULES.bump.push * 0.5, aRams = va >= -vc, toC = aRams ? 0.62 : 0.38;
        c.b.vx += nx * imp * toC; c.b.vz += nz * imp * toC; a.b.vx -= nx * imp * (1 - toC); a.b.vz -= nz * imp * (1 - toC);
        if (va >= -vc) credit(c, a.id); if (-vc >= va) credit(a, c.id);
        events.push({ e: 'bonk', x: r2((a.b.x + c.b.x) / 2), z: r2((a.b.z + c.b.z) / 2) });
      }
      // fountains: idle -> warn (bubbles) -> spout (flings anyone on it)
      const FN = RULES.fountain;
      for (const f of fountains) {
        f.t -= dt;
        if (f.t > 0) continue;
        if (f.st === 'idle') { f.st = 'warn'; f.t = FN.warn; }
        else if (f.st === 'warn') {
          f.st = 'spout'; f.t = FN.spout; const [fx, fz] = fAt(f, el);
          for (const c of boats.values()) {
            if (c.down > 0 || c.fly > 0 || Math.hypot(c.b.x - fx, c.b.z - fz) > FN.r) continue;
            c.fly = FN.fly; c.b.flags |= F.AIR | F.STUN; const d = Math.hypot(c.b.x, c.b.z) || 1; c.b.vx = c.b.x / d * -FN.fling; c.b.vz = c.b.z / d * -FN.fling;
            const by = creditor(c); if (by && !by.cpu) { by.pts += RULES.pts.spout; by.sent++; }
            events.push({ e: 'fling', id: c.id, by: by?.id ?? null, pts: by && !by.cpu ? RULES.pts.spout : 0, f: f.i });
            c.by = null;
          }
          events.push({ e: 'spout', f: f.i, x: r2(fx), z: r2(fz) });
        } else { f.st = 'idle'; f.t = rng.range(FN.idle[0], FN.idle[1]) * LV.idle; }
      }
      // ducks
      nextDuck -= dt;
      if (nextDuck <= 0) {
        nextDuck = rng.range(RULES.duckEvery[0], RULES.duckEvery[1]);
        if (ducks.length < RULES.duckMax) { const a = rng.range(0, Math.PI * 2), r = rng.range(P.range + 0.6, 7.4); ducks.push({ id: ++duckId, x: r2(Math.sin(a) * r), z: r2(Math.cos(a) * r) }); }
      }
      for (const c of boats.values()) {
        if (c.cpu || c.down > 0 || c.fly > 0) continue;
        const i = ducks.findIndex(dk => Math.hypot(dk.x - c.b.x, dk.z - c.b.z) < RULES.duckR); if (i < 0) continue;
        const dk = ducks[i]; ducks.splice(i, 1); c.pts += RULES.pts.duck; events.push({ e: 'duck', id: c.id, x: dk.x, z: dk.z });
      }
      if (time <= 0) {
        time = 0; endIn = RULES.endPause;
        for (const c of boats.values()) { if (c.down > 0) popUp(c); c.down = 0; c.fly = 0; c.b.y = 0; c.b.flags = F.FROZEN; c.b.vx = c.b.vz = 0; }
        events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = boats.get(p.pid).pts;
      const g = { sc, cd: countdown > 0 ? Math.ceil(countdown) : 0, left: Math.ceil(Math.max(0, time)), el: r2(el), fs: fountains.map(f => (f.st === 'warn' ? 1 : f.st === 'spout' ? 2 : 0)), dk: ducks.map(d => [d.id, d.x, d.z]) };
      if (nCpu) g.cpu = [...boats.values()].filter(c => c.cpu).map(c => [c.id, r2(c.b.x), r2(c.b.z), r2(c.b.yaw), c.b.flags, r2(c.b.y)]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = boats.get(p.pid).pts; scores[p.pid] = s; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    boat: id => boats.get(id), fountainAt: (i, t = el) => fAt(fountains[i], t), get ducks() { return ducks; }, get _el() { return el; }, _fountains: fountains,
  };
}
