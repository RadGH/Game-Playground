// LASER LIMBO — a round toy stage with glowing beams sweeping across it at two heights. A LOW beam (orange, at shin
// height) has to be hopped over: A is a short hop. A HIGH beam (purple, at head height) has to be ducked under: hold B
// to crouch (you shuffle slowly while crouched, and you cannot duck in the air). Two kinds of beam: a SWEEP slides
// straight across the whole stage from one side to the other, a SPINNER turns round the middle like a clock hand (it
// glows faintly for a moment before it goes live). They come faster and start to overlap as the clock runs. A beam
// that touches you costs a life (RULES.lives; a short blink of safety follows); lose them all and you are out. Last one
// standing wins (more lives left breaks a tie); alone, survive as long as you can. (Lives since 2026-10-22: one zap
// used to end a 2-player game in four seconds — the owner's rating said "short".)
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'laser-limbo', title: 'Laser Limbo', blurb: 'Jump and duck the sweeping lasers — last one standing!',
  how: ['Orange beams are LOW: press HOP to jump them.', 'Purple beams are HIGH: hold DUCK to crouch under them.', 'You have 3 lives. Last one standing wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'survival', unit: 'sec', tags: ['action'],
  controls: { stick: true, a: 'Hop', b: 'Duck' }, move: { speed: 5.6, accel: 30, carryMul: 0.4, stunDrag: 3 },
  arena: { shape: 'circle', r: 7, wall: true }, pitch: 58, card: 'card-laser-limbo', css: true,
};

export const LOW = 0, HIGH = 1, SWEEP = 0, SPIN = 1;
export const RULES = {
  hop: 0.62, hopH: 1.05, hopCool: 0.2,     // a hop lasts 0.62 s and peaks at 1.05 m; you clear a low beam above `clear`
  clear: 0.28,
  duckMin: 0.3,                            // a tap of DUCK still crouches you this long
  beamW: 0.32,                             // how close (centre of body to the beam's line) counts as touching
  start: 1.6,                              // the first beam (s)
  everyStart: 2.7, everyEnd: 1.05,         // seconds between beams at the start / at the end
  sweepStart: 3.4, sweepEnd: 6.6,          // sweep speed m/s
  spinStart: 1.0, spinEnd: 1.9,            // spinner speed rad/s
  spinWarn: 1.1, spinTurn: Math.PI * 1.25, // a spinner glows this long first, then turns this far
  pairFrom: 22, pairChance: 0.45,          // from 22 s on, a second beam often comes with the first
  spinFrom: 9,                             // spinners join in after 9 s
  edge: 1.3,                               // a sweep starts and ends this far past the rim
  lives: 3, safe: 1.6,                     // zaps you can take; seconds of blinking safety after one
};
const SPEED = { easy: 0.85, normal: 1, hard: 1.15 };
const r2 = v => Math.round(v * 100) / 100;
/** How hard the lasers are `t` seconds in: seconds between beams, sweep speed (m/s), spinner speed (rad/s). */
export function pace(t, difficulty = 'normal') {
  const k = Math.min(1, Math.max(0, t / meta.seconds)), mul = SPEED[difficulty] ?? 1, L = (a, b) => a + (b - a) * k;
  return { every: L(RULES.everyStart, RULES.everyEnd) / mul, sweep: L(RULES.sweepStart, RULES.sweepEnd) * mul, spin: L(RULES.spinStart, RULES.spinEnd) * mul };
}
const r3 = v => Math.round(v * 1000) / 1000;

/** Signed distance from (x, z) to a beam's line. Sweep: the line is at offset `s` along the normal angle `a`. Spinner: the line runs through the middle at angle `a`. */
export function beamDist(beam, x, z) {
  if (beam.k === SWEEP) return x * Math.cos(beam.a) + z * Math.sin(beam.a) - beam.s;
  return -x * Math.sin(beam.a) + z * Math.cos(beam.a);
}
/** Does a beam at height `h` catch a body? Low: unless you are in the air above `clear`. High: unless you are crouched on the ground. */
export const catches = (h, body, ducked) => (h === LOW ? !((body.flags & F.AIR) && body.y > RULES.clear) : !(ducked && !(body.flags & F.AIR)));

export function create({ rng, players, difficulty = 'normal' }) {
  const n = players.length, bodies = new Map(), spawns = spawnRing(n, n === 1 ? 0 : 3.4), R = meta.arena.r;
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, hop: 0, cool: 0, duck: 0, out: false, outStep: -1, alive: 0, lives: RULES.lives, safe: 0 }]));
  let beams = [], bid = 0, next = RULES.start, time = meta.seconds, elapsed = 0, stepNo = 0, over = false;
  const events = [];
  const standing = pid => !P.get(pid).out;
  const living = () => players.filter(p => standing(p.pid));

  function zap(pid, beam) {
    const s = P.get(pid), b = bodies.get(pid);
    if (s.safe > 0) return;
    s.lives--;
    if (s.lives > 0) { s.safe = RULES.safe; events.push({ e: 'zap', pid, h: beam.h, x: r2(b.x), z: r2(b.z), lv: s.lives }); return; }
    s.out = true; s.outStep = stepNo; s.hop = 0; s.duck = 0;
    b.flags = F.OUT; b.y = 0; b.vx = b.vz = 0;
    events.push({ e: 'zap', pid, h: beam.h, x: r2(b.x), z: r2(b.z), lv: 0 });
  }
  function addBeam(kind, h, avoidA = null) {
    let a = rng.range(0, Math.PI * 2);
    if (avoidA != null) a = avoidA + Math.PI + rng.range(-0.9, 0.9);           // the second of a pair comes from another side
    if (kind === SWEEP) beams.push({ id: ++bid, k: SWEEP, h, a, s: -(R + RULES.edge), v: pace(elapsed, difficulty).sweep * rng.range(0.9, 1.1), warn: 0, left: 99 });
    else beams.push({ id: ++bid, k: SPIN, h, a, s: 0, v: pace(elapsed, difficulty).spin * (rng.chance(0.5) ? 1 : -1), warn: RULES.spinWarn, left: RULES.spinTurn });
    return a;
  }
  function spawn() {
    const kind = elapsed >= RULES.spinFrom && rng.chance(0.35) ? SPIN : SWEEP, h = rng.chance(0.5) ? LOW : HIGH;
    const a = addBeam(kind, h);
    if (elapsed >= RULES.pairFrom && rng.chance(RULES.pairChance)) addBeam(SWEEP, rng.chance(0.6) ? 1 - h : h, a);
  }
  return {
    bodies, events,
    init: () => ({ r: R, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pressA = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (!s.out) {
        const air = !!(b.flags & F.AIR);
        if (bits & IN.B && !air) { if (!(b.flags & F.CARRY)) events.push({ e: 'duck', pid }); s.duck = Math.max(s.duck, RULES.duckMin); b.flags |= F.CARRY; }
        if (pressA && !air && !(b.flags & F.CARRY) && s.cool <= 0) { s.hop = RULES.hop; b.flags |= F.AIR; events.push({ e: 'hop', pid }); }
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      stepNo++; elapsed += dt;
      separate([...bodies].filter(([pid]) => standing(pid)).map(([, b]) => b));
      // bodies: hops and crouches (crouch = F.CARRY, which stepBody slows by move.carryMul)
      for (const p of players) {
        const s = P.get(p.pid), b = bodies.get(p.pid); if (s.out) continue;
        if (s.cool > 0) s.cool -= dt;
        if (s.safe > 0) s.safe -= dt;
        if (s.hop > 0) {
          s.hop -= dt; const t = 1 - Math.max(0, s.hop) / RULES.hop; b.y = r2(4 * RULES.hopH * t * (1 - t));
          if (s.hop <= 0) { b.y = 0; b.flags &= ~F.AIR; s.cool = RULES.hopCool; }
        }
        if (s.duck > 0) s.duck -= dt;                       // holding DUCK tops this up every input
        if (s.duck <= 0 && (b.flags & F.CARRY)) b.flags &= ~F.CARRY;
      }
      // beams: move, then zap anyone the line touched or passed over this step
      for (const beam of beams) {
        if (beam.warn > 0) { beam.warn -= dt; continue; }
        const before = new Map(); for (const p of players) if (standing(p.pid)) { const b = bodies.get(p.pid); before.set(p.pid, beamDist(beam, b.x, b.z)); }
        if (beam.k === SWEEP) { beam.s += beam.v * dt; if (beam.s > R + RULES.edge) beam.left = 0; }
        else { beam.a += beam.v * dt; beam.left -= Math.abs(beam.v) * dt; }
        for (const [pid, d0] of before) {
          const b = bodies.get(pid), d1 = beamDist(beam, b.x, b.z);
          if ((Math.abs(d1) <= RULES.beamW || Math.sign(d0) !== Math.sign(d1)) && catches(beam.h, b, !!(b.flags & F.CARRY))) zap(pid, beam);
        }
      }
      beams = beams.filter(b => b.left > 0);
      next -= dt;
      if (next <= 0) { next = pace(elapsed, difficulty).every; spawn(); }
      for (const p of players) if (standing(p.pid)) P.get(p.pid).alive = elapsed;
      time -= dt;
      const left = living().length;
      if ((n > 1 && left <= 1) || left === 0 || time <= 0) {
        time = Math.max(0, time); over = true;
        for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
        for (const p of living()) events.push({ e: 'win', pid: p.pid });
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = Math.floor(P.get(p.pid).alive);
      // a beam: [id, kind, height, angle, offset, speed, warning left] — the view moves it between updates with the speed
      return { bm: beams.map(b => [b.id, b.k, b.h, r3(b.a), r2(b.s), r3(b.v), r2(Math.max(0, b.warn))]), sc, out: players.filter(p => !standing(p.pid)).map(p => p.pid), lv: players.map(p => P.get(p.pid).lives), sf: players.filter(p => P.get(p.pid).safe > 0).map(p => p.pid), left: Math.ceil(time) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = P.get(p.pid); scores[p.pid] = Math.floor(s.alive); const k = s.out ? s.outStep : 1e9 + s.lives; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
