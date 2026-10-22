// BUMPER BASH — bumper cars in a fairground rink with fat rubber walls and a striped pole in the middle. Every car
// steers like a kart (shared/arena.js `move.mode: 'car'`: the stick is the heading you want). Ram another car to score:
// from BEHIND = 3, into its SIDE = 2, nose to nose = 1 (whoever was driving at the other harder takes it). The car you
// hit spins out for a moment and cannot be scored on again until it has recovered. Gold stars are +2; a lightning
// bolt is a turbo (and a hit while turbo-charged is worth +1 more). The walls are bouncy. Most points when the clock
// runs out wins. Alone: three drifting target cars to bash (two players get one extra target car to fight over).
import { makeBody, stepBody, separate, clampToArena, collideObstacles, F } from '../../shared/arena.js';

export const meta = {
  id: 'bumper-bash', title: 'Bumper Bash', blurb: 'Bash the other bumper cars — hits from behind score the most!',
  how: ['Point the stick where you want to drive.', 'Ram a car: from behind 3, side 2, nose to nose 1.', 'Grab ★ stars for points and ⚡ bolts for a turbo.', 'The walls are bouncy!'],
  kind: 'arena', min: 1, max: 4, seconds: 70, scoring: 'points', unit: 'pts', tags: ['action'],
  controls: { stick: true },
  move: { mode: 'car', speed: 6.3, accel: 3.6, turn: 3.9, grip: 4.5, boostMul: 1.5, stunDrag: 1.7 },
  arena: { shape: 'rect', hw: 8, hd: 8, wall: true, posts: [{ x: 0, z: 0, r: 0.75 }] }, pitch: 64, card: 'card-bumper-bash', css: true,
};

export const RULES = {
  countdown: 3, endPause: 1.8,
  carR: 0.62, hitR: 1.3, minClose: 1.4,
  pts: { rear: 3, side: 2, front: 1, turbo: 1 },
  spin: 0.95, immune: 1.25, pairCool: 0.6, pushMin: 4, pushMax: 9.5,
  bounce: 0.6, bounceMin: 1.2,
  pickEvery: [3.2, 5], pickMax: 2, pickR: 0.95, star: 2, turbo: 2.6,
  target: { speedMul: 0.5, names: ['Bonk-o', 'Dizzy', 'Wobbles'] },
};
const r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players }) {
  const n = players.length, solo = n === 1, A = meta.arena, bodies = new Map();
  const corners = [[-5.4, 5.4], [5.4, -5.4], [5.4, 5.4], [-5.4, -5.4]];
  const cars = new Map();          // id -> car (players by pid, targets by negative id)
  players.forEach((p, i) => { const [x, z] = corners[i], b = makeBody(x, z, r2(Math.atan2(-x, -z))); b.flags = F.FROZEN; bodies.set(p.pid, b); cars.set(p.pid, { id: p.pid, b, target: false, pts: 0, spin: 0, immune: 0, turbo: 0 }); });
  const nTargets = solo ? 3 : n === 2 ? 1 : 0;
  for (let j = 0; j < nTargets; j++) {
    const x = solo ? [-4, 4, 0][j] : 0, z = solo ? [-4, -4, 4.5][j] : -4.5, b = makeBody(x, z, rng.range(0, 6.28)); b.flags = F.FROZEN;
    cars.set(-1 - j, { id: -1 - j, b, target: true, name: RULES.target.names[j], pts: 0, spin: 0, immune: 0, turbo: 0, aim: null, think: 0 });
  }
  const tMove = { ...meta.move, speed: meta.move.speed * RULES.target.speedMul };
  const pairCool = new Map();
  let picks = [], pid0 = 0, nextPick = 2.5, countdown = RULES.countdown, lastCount = 4, time = meta.seconds, over = false, endIn = -1;
  const events = [];
  const live = () => countdown <= 0 && endIn < 0;

  function moveCar(c, inp, move) {
    const b = c.b, pvx = b.vx, pvz = b.vz;
    stepBody(b, inp, move, A);
    // rubber walls: bounce back instead of stopping dead
    const lx = A.hw - 0.45, lz = A.hd - 0.45; let boing = 0;
    if (Math.abs(b.x) >= lx - 1e-6 && Math.sign(pvx) === Math.sign(b.x) && Math.abs(pvx) > RULES.bounceMin) { b.vx = -pvx * RULES.bounce; boing = Math.abs(pvx); }
    if (Math.abs(b.z) >= lz - 1e-6 && Math.sign(pvz) === Math.sign(b.z) && Math.abs(pvz) > RULES.bounceMin) { b.vz = -pvz * RULES.bounce; boing = Math.max(boing, Math.abs(pvz)); }
    if (boing > 3) events.push({ e: 'boing', id: c.id, x: r2(b.x), z: r2(b.z) });
  }
  function targetThink(c, dt) {
    const b = c.b; if (b.flags & (F.FROZEN | F.STUN)) { stepBody(b, null, tMove, A); return; }
    c.think -= dt;
    if (!c.aim || c.think <= 0 || Math.hypot(c.aim[0] - b.x, c.aim[1] - b.z) < 1.5) { c.think = rng.range(2, 3.5); c.aim = [rng.range(-6.2, 6.2), rng.range(-6.2, 6.2)]; }
    const dx = c.aim[0] - b.x, dz = c.aim[1] - b.z, d = Math.hypot(dx, dz) || 1;
    moveCar(c, { mx: dx / d, mz: dz / d, b: 0 }, tMove);
  }
  function bump(a, c) {
    const dx = c.b.x - a.b.x, dz = c.b.z - a.b.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
    const ca = a.b.vx * nx + a.b.vz * nz, cc = -(c.b.vx * nx + c.b.vz * nz);     // how hard each was driving at the other
    if (ca + cc < RULES.minClose) return;
    let att = a, vic = c, ux = -nx, uz = -nz, close = ca + cc;                      // u: from the victim toward the attacker
    if (cc > ca) { att = c; vic = a; ux = nx; uz = nz; }
    if (att.target || vic.immune > 0 || att.spin > 0) {
      // no score: just a shove apart
      vic.b.vx -= ux * 2.5; vic.b.vz -= uz * 2.5; att.b.vx += ux * 2; att.b.vz += uz * 2;
      events.push({ e: 'clonk', x: r2((a.b.x + c.b.x) / 2), z: r2((a.b.z + c.b.z) / 2) }); return;
    }
    const fx = Math.sin(vic.b.yaw), fz = Math.cos(vic.b.yaw), dot = fx * ux + fz * uz;
    const zone = dot > 0.5 ? 'front' : dot < -0.45 ? 'rear' : 'side';
    const pts = RULES.pts[zone] + (att.turbo > 0 ? RULES.pts.turbo : 0);
    att.pts += pts;
    const push = Math.max(RULES.pushMin, Math.min(RULES.pushMax, 3 + close * 0.9));
    vic.b.vx = -ux * push + vic.b.vx * 0.3; vic.b.vz = -uz * push + vic.b.vz * 0.3; vic.b.flags |= F.STUN; vic.spin = RULES.spin; vic.immune = RULES.immune;
    att.b.vx *= 0.4; att.b.vz *= 0.4;
    events.push({ e: 'bash', by: att.id, id: vic.id, zone, pts, x: r2(vic.b.x), z: r2(vic.b.z) });
  }
  return {
    bodies, events,
    init: () => ({ solo, targets: [...cars.values()].filter(c => c.target).map(c => ({ id: c.id, name: c.name })), left: Math.ceil(time) }),
    input(pid, inp) {
      const c = cars.get(pid); if (!c || over) return;
      if (!live()) { stepBody(c.b, null, meta.move, A); return; }
      moveCar(c, inp, meta.move);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (countdown > 0) {
        countdown -= dt; const s = Math.ceil(countdown);
        if (s < lastCount && s > 0) { lastCount = s; events.push({ e: 'count', n: s }); }
        if (countdown <= 0) { for (const c of cars.values()) c.b.flags &= ~F.FROZEN; events.push({ e: 'go' }); }
        return;
      }
      time -= dt;
      for (const c of cars.values()) {
        if (c.target) targetThink(c, dt);
        if (c.spin > 0) { c.spin -= dt; if (c.spin <= 0) c.b.flags &= ~F.STUN; }
        if (c.immune > 0) c.immune -= dt;
        if (c.turbo > 0) { c.turbo -= dt; if (c.turbo <= 0) c.b.flags &= ~F.BOOST; }
      }
      separate([...cars.values()].map(c => c.b), RULES.carR);
      for (const c of cars.values()) { clampToArena(c.b, A); collideObstacles(c.b, A); }      // a shove never pushes a car through a wall or the pole
      // bumps
      const list = [...cars.values()];
      for (const [k, t] of pairCool) { if (t - dt <= 0) pairCool.delete(k); else pairCool.set(k, t - dt); }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], c = list[j], key = a.id + ':' + c.id;
        if (pairCool.has(key) || Math.hypot(a.b.x - c.b.x, a.b.z - c.b.z) > RULES.hitR) continue;
        if (a.target && c.target) continue;
        pairCool.set(key, RULES.pairCool); bump(a, c);
      }
      // pickups
      nextPick -= dt;
      if (nextPick <= 0) {
        nextPick = rng.range(RULES.pickEvery[0], RULES.pickEvery[1]);
        if (picks.length < RULES.pickMax) for (let k = 0; k < 12; k++) {
          const x = r2(rng.range(-6.4, 6.4)), z = r2(rng.range(-6.4, 6.4));
          if (Math.hypot(x, z) < 2) continue;
          if ([...cars.values()].some(c => Math.hypot(c.b.x - x, c.b.z - z) < 2.5) && k < 11) continue;
          picks.push({ id: ++pid0, x, z, kind: rng.chance(0.55) ? 'star' : 'zap' }); break;
        }
      }
      for (const c of cars.values()) {
        if (c.target) continue;
        const i = picks.findIndex(p => Math.hypot(p.x - c.b.x, p.z - c.b.z) < RULES.pickR); if (i < 0) continue;
        const p = picks[i]; picks.splice(i, 1);
        if (p.kind === 'star') c.pts += RULES.star; else { c.turbo = RULES.turbo; c.b.flags |= F.BOOST; }
        events.push({ e: 'pick', id: c.id, kind: p.kind, x: p.x, z: p.z });
      }
      if (time <= 0) {
        time = 0; endIn = RULES.endPause;
        for (const c of cars.values()) { c.b.flags = (c.b.flags & ~F.BOOST) | F.FROZEN; c.b.vx = c.b.vz = 0; }
        events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = cars.get(p.pid).pts;
      const g = { sc, pk: picks.map(p => [p.id, p.x, p.z, p.kind === 'star' ? 0 : 1]), cd: countdown > 0 ? Math.ceil(countdown) : 0, left: Math.ceil(Math.max(0, time)) };
      if (nTargets) g.tg = [...cars.values()].filter(c => c.target).map(c => [c.id, r2(c.b.x), r2(c.b.z), r2(c.b.yaw), c.b.flags]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = cars.get(p.pid).pts; scores[p.pid] = s; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    car: id => cars.get(id), get picks() { return picks; },
  };
}
