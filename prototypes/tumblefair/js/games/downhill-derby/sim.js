// DOWNHILL DERBY — soapbox carts race down one long grassy hill. Every cart steers like a kart (shared/arena.js
// `move.mode: 'car'`: point the stick where you want to go — down the hill is UP the screen). Hold A to TUCK: you go
// much faster, but a tucked cart wobbles in a turn, and turn too hard while tucked and it tips over. On the way down:
//   hay bales   solid; crash into one and you stop dead for a moment
//   puddles     mud: slow while you are in one
//   ramps       hit one at speed and you fly (clearing the puddle behind it) and land with a burst of speed
// First to the bottom wins; once someone is down, the rest have FINISH_WINDOW seconds. Placings: finish order, then
// how far down the hill. The course is laid out from the seed and sent in init() (`arena.blocks` are the bales, so a
// phone predicts its own crashes). Alone: two CPU carts to race (faster on harder settings).
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'downhill-derby', title: 'Downhill Derby', blurb: 'Race your soapbox cart to the bottom of the hill!',
  how: ['Point the stick where you want to go. Down the hill is up the screen.', 'Hold A to tuck for speed, but a tucked cart wobbles in turns!', 'Dodge hay bales and puddles. Ramps make you fly.'],
  kind: 'arena', min: 1, max: 4, seconds: 64, scoring: 'points', unit: 'metres', tags: ['action'],
  controls: { stick: true, a: 'Tuck' },
  move: { mode: 'car', speed: 7.2, accel: 2.4, turn: 3.0, grip: 6.5, boostMul: 1.42, slowMul: 0.5, stunDrag: 2.2 },
  arena: { shape: 'rect', hw: 6.5, hd: 150, wall: true }, pitch: 46, card: 'card-downhill-derby', css: true,
};
export const RULES = {
  startZ: 144, finishZ: -140, countdown: 3, finishWindow: 12, endPause: 1.5,
  bale: { hw: 1.0, hd: 0.55 }, ramp: { hw: 1.35, hd: 0.8, min: 4.2 }, crashDrop: 2.6, crashStun: 0.55,
  wobble: { rate: 0.55, gain: 1.5, decay: 0.9, tip: 1, stun: 1.3 },
  air: { base: 0.62, perSpeed: 0.035, h: 1.4 }, landBoost: 0.8,
  levels: { easy: { gap: [15, 19], cpu: 0.8 }, normal: { gap: [11, 15], cpu: 0.9 }, hard: { gap: [8.5, 11.5], cpu: 0.98 } },
  cpu: { names: ['Pip Pedalwell', 'Granny Gearbox'] },
};
export const LENGTH = RULES.startZ - RULES.finishZ;
const r2 = v => Math.round(v * 100) / 100;
const HW = meta.arena.hw;

/** The course: bales (solid), puddles (circles), ramps (rects) and, per row, a safe x for a careful driver. */
export function makeCourse(rng, gap = RULES.levels.normal.gap) {
  const blocks = [], puddles = [], ramps = [], rows = [];
  const B = RULES.bale, lim = HW - 1.1;
  for (let z = RULES.startZ - 16; z > RULES.finishZ + 10; z -= rng.range(gap[0], gap[1])) {
    const zz = r2(z), kind = rng.pick(['bales', 'bales', 'puddle', 'ramp', 'mixed']);
    if (kind === 'bales' || kind === 'mixed') {
      // a wall of bales with one or two gaps (each at least 3 m wide)
      const gaps = rng.chance(0.5) ? [r2(rng.range(-lim + 1, lim - 1))] : [r2(rng.range(-lim + 1, -0.8)), r2(rng.range(1.6, lim - 0.4))];
      for (let x = -HW + B.hw; x <= HW - B.hw + 1e-6; x += B.hw * 2 + 0.25) if (gaps.every(g => Math.abs(x - g) > 1.5 + B.hw)) blocks.push({ x: r2(x), z: zz, hw: B.hw, hd: B.hd });
      if (kind === 'mixed') { const g = rng.pick(gaps); puddles.push({ x: r2(Math.max(-lim, Math.min(lim, g + rng.range(-0.6, 0.6)))), z: r2(zz - 4.5), r: r2(rng.range(1.2, 1.6)) }); }
      rows.push({ z: zz, x: gaps[0], kind });
    } else if (kind === 'puddle') {
      const a = r2(rng.range(-lim, lim)); puddles.push({ x: a, z: zz, r: r2(rng.range(1.4, 2.0)) });
      if (rng.chance(0.5)) puddles.push({ x: r2(a > 0 ? a - rng.range(4.5, 6) : a + rng.range(4.5, 6)), z: r2(zz - rng.range(2, 4)), r: r2(rng.range(1.2, 1.7)) });
      const safe = a > 0 ? a - 3.2 : a + 3.2; rows.push({ z: zz, x: r2(safe), kind });
    } else {
      const x = r2(rng.range(-lim + 0.6, lim - 0.6)); ramps.push({ x, z: zz, hw: RULES.ramp.hw, hd: RULES.ramp.hd });
      puddles.push({ x, z: r2(zz - 3.6), r: 1.9 }); rows.push({ z: zz, x, kind });
    }
  }
  return { blocks, puddles, ramps, rows };
}
const inPuddle = (c, x, z) => c.puddles.some(p => Math.hypot(x - p.x, z - p.z) < p.r);
const onRamp = (c, x, z) => c.ramps.find(r => Math.abs(x - r.x) < r.hw && Math.abs(z - r.z) < r.hd);
const nearBale = (c, x, z) => c.blocks.some(b => Math.abs(x - b.x) < b.hw + 0.9 && Math.abs(z - b.z) < b.hd + 0.9);

/** A driver: steer for the safe x of the next row down the hill, tuck when pointing straight. `pace` < 1 holds back;
 *  `sloppy` steers late and wide. Used by the CPU carts and by the tests' bots. -> { mx, mz, b } */
export function driver(course, b, { pace = 1, sloppy = 0, tuck = true, t = 0 } = {}) {
  const next = course.rows.find(r => r.z < b.z - 1.2), tx = next ? next.x + Math.sin(t * 1.3) * sloppy * 2.2 : 0;
  const look = next ? Math.max(4, Math.min(10, b.z - next.z)) : 8;
  let mx = (tx - b.x) / look, mz = -1; const m = Math.hypot(mx, mz); mx /= m; mz /= m;
  const s = Math.max(0.35, Math.min(1, pace)), straight = Math.abs(mx) < 0.35 && Math.abs(Math.sin(b.yaw)) < 0.35;
  return { mx: mx * s, mz: mz * s, b: tuck && straight && pace >= 0.9 ? IN.A : 0 };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, LV = RULES.levels[difficulty] || RULES.levels.normal, course = makeCourse(rng, LV.gap);
  const arena = { ...meta.arena, blocks: course.blocks };
  const bodies = new Map(), carts = new Map();
  const lane = (i, k) => (i - (k - 1) / 2) * 2.5;
  const nCpu = n === 1 ? 2 : 0, total = n + nCpu;
  players.forEach((p, i) => { const b = makeBody(lane(i, total), RULES.startZ, r2(Math.PI)); b.flags = F.FROZEN; bodies.set(p.pid, b); carts.set(p.pid, { id: p.pid, b, cpu: false }); });
  for (let j = 0; j < nCpu; j++) { const b = makeBody(lane(n + j, total), RULES.startZ, r2(Math.PI)); b.flags = F.FROZEN; carts.set(-1 - j, { id: -1 - j, b, cpu: true, name: RULES.cpu.names[j], pace: LV.cpu - j * 0.04 }); }
  for (const c of carts.values()) Object.assign(c, { wob: 0, stun: 0, air: 0, airT: 0, boost: 0, best: 0, fin: null, wet: false, lastYaw: c.b.yaw, tuck: false });
  const cpuMove = { ...meta.move };
  let countdown = RULES.countdown, lastCount = 4, el = 0, time = meta.seconds - RULES.countdown - RULES.endPause - 0.5, firstAt = null, over = false, endIn = -1, finishN = 0;
  const events = [];
  const live = () => countdown <= 0 && endIn < 0;
  function drive(c, inp, move, dt = 0.05) {
    const b = c.b, sp0 = Math.hypot(b.vx, b.vz);
    const stunned = c.stun > 0;
    c.tuck = !!((inp?.b | 0) & IN.A) && !stunned && c.air <= 0;
    // flags the shared stepBody knows: BOOST while tucked or after a landing, SLOW in mud
    b.flags = (b.flags & ~(F.BOOST | F.SLOW)) | ((c.tuck || c.boost > 0) ? F.BOOST : 0) | (c.wet && c.air <= 0 ? F.SLOW : 0);
    stepBody(b, inp, move, arena);
    const sp1 = Math.hypot(b.vx, b.vz);
    // wobble: turning hard while tucked
    let dy = b.yaw - c.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.lastYaw = b.yaw;
    const rate = Math.abs(dy) / dt, W = RULES.wobble;
    if (c.tuck && rate > W.rate) c.wob += (rate - W.rate) * W.gain * dt; else c.wob = Math.max(0, c.wob - W.decay * dt);
    if (c.wob >= W.tip) { c.wob = 0; c.stun = W.stun; b.flags |= F.STUN; c.boost = 0; events.push({ e: 'tip', id: c.id, x: r2(b.x), z: r2(b.z) }); }
    // a bale crash
    if (!stunned && c.air <= 0 && sp0 - sp1 > RULES.crashDrop && nearBale(course, b.x, b.z)) { c.stun = RULES.crashStun; b.flags |= F.STUN; c.wob = 0; events.push({ e: 'bale', id: c.id, x: r2(b.x), z: r2(b.z) }); }
    // ramps and puddles
    if (c.air <= 0 && !stunned && sp1 > RULES.ramp.min && onRamp(course, b.x, b.z)) { c.air = c.airT = RULES.air.base + sp1 * RULES.air.perSpeed; b.flags |= F.AIR; events.push({ e: 'jump', id: c.id, x: r2(b.x), z: r2(b.z) }); }
    const wet = c.air <= 0 && inPuddle(course, b.x, b.z);
    if (wet && !c.wet) events.push({ e: 'splash', id: c.id, x: r2(b.x), z: r2(b.z) });
    c.wet = wet;
    c.best = Math.max(c.best, Math.min(LENGTH, RULES.startZ - b.z));
    if (c.fin == null && b.z <= RULES.finishZ) {
      c.fin = el; finishN++; c.place = finishN; if (firstAt == null) firstAt = el;
      events.push({ e: 'finish', id: c.id, place: finishN, t: r2(el) });
    }
  }
  return {
    bodies, events,
    init: () => ({ arena, puddles: course.puddles, ramps: course.ramps, startZ: RULES.startZ, finishZ: RULES.finishZ, length: LENGTH, cpus: [...carts.values()].filter(c => c.cpu).map(c => ({ id: c.id, name: c.name })), window: RULES.finishWindow }),
    input(pid, inp) {
      const c = carts.get(pid); if (!c || over) return;
      if (!live()) { stepBody(c.b, null, meta.move, arena); return; }
      drive(c, inp, meta.move);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (countdown > 0) {
        countdown -= dt; const s = Math.ceil(countdown);
        if (s < lastCount && s > 0) { lastCount = s; events.push({ e: 'count', n: s }); }
        if (countdown <= 0) { for (const c of carts.values()) c.b.flags &= ~F.FROZEN; events.push({ e: 'go' }); }
        return;
      }
      el += dt; time -= dt;
      for (const c of carts.values()) {
        if (c.cpu) drive(c, driver(course, c.b, { pace: c.pace, t: el + c.id }), cpuMove, dt);
        if (c.stun > 0) { c.stun -= dt; if (c.stun <= 0) c.b.flags &= ~F.STUN; }
        if (c.boost > 0) c.boost -= dt;
        if (c.air > 0) {
          c.air -= dt; const u = 1 - Math.max(0, c.air) / c.airT; c.b.y = r2(4 * RULES.air.h * u * (1 - u));
          if (c.air <= 0) { c.b.y = 0; c.b.flags &= ~F.AIR; c.boost = RULES.landBoost; events.push({ e: 'land', id: c.id, x: r2(c.b.x), z: r2(c.b.z) }); }
        }
      }
      separate([...carts.values()].filter(c => c.air <= 0).map(c => c.b), 0.7);
      const humans = [...carts.values()].filter(c => !c.cpu);
      const done = humans.every(c => c.fin != null) || (firstAt != null && el - firstAt >= RULES.finishWindow) || time <= 0;
      if (done) {
        endIn = RULES.endPause;
        for (const c of carts.values()) { c.b.flags = F.FROZEN; c.b.vx = c.b.vz = 0; c.b.y = 0; c.air = 0; }
        events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}, fin = {}, wob = {};
      for (const p of players) { const c = carts.get(p.pid); sc[p.pid] = Math.floor(c.best); if (c.fin != null) fin[p.pid] = c.place; if (c.wob > 0.05) wob[p.pid] = Math.round(c.wob * 9); }
      const g = { sc, fin, wob, cd: countdown > 0 ? Math.ceil(countdown) : 0, left: Math.ceil(Math.max(0, firstAt != null ? Math.min(time, RULES.finishWindow - (el - firstAt)) : time)) };
      if (nCpu) g.cpu = [...carts.values()].filter(c => c.cpu).map(c => [c.id, r2(c.b.x), r2(c.b.z), r2(c.b.yaw), c.b.flags, c.b.y, c.fin != null ? c.place : 0]);
      return g;
    },
    get over() { return over; },
    result() {
      const rows = players.map(p => { const c = carts.get(p.pid); return { pid: p.pid, fin: c.fin, best: Math.floor(c.best) }; });
      const key = r => (r.fin != null ? 1e6 - r.fin * 1000 : r.best);
      const order = []; for (const r of [...rows].sort((a, b) => key(b) - key(a))) { const g = order[order.length - 1]; if (g && key(g[0]) === key(r)) g.push(r); else order.push([r]); }
      const out = { order: order.map(g => g.map(r => r.pid)), scores: Object.fromEntries(rows.map(r => [r.pid, r.best])), unit: meta.unit };
      if (nCpu) { const me = carts.get(players[0].pid), cpus = [...carts.values()].filter(c => c.cpu); out.beat = cpus.filter(c => key({ fin: me.fin, best: me.best }) > key({ fin: c.fin, best: Math.floor(c.best) })).length; }
      return out;
    },
    cart: id => carts.get(id), course, get _el() { return el; },
  };
}
