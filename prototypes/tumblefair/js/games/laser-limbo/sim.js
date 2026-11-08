// LASER LIMBO — a round toy stage with glowing beams sweeping across it at two heights. A LOW beam (orange, at shin
// height) has to be hopped over: A is a short hop. A HIGH beam (purple, at head height) has to be ducked under: hold B
// to crouch (you shuffle slowly while crouched, and you cannot duck in the air). Two kinds of beam: a SWEEP slides
// straight across the whole stage from one side to the other, a SPINNER turns round the middle like a clock hand (it
// glows faintly for a moment before it goes live). They come faster and start to overlap as the clock runs. A beam
// that touches you costs a life (RULES.lives; a short blink of safety follows); lose them all and you are out. Last one
// standing wins (more lives left breaks a tie); alone, survive as long as you can. (Lives since 2026-10-22: one zap
// used to end a 2-player game in four seconds — the owner's rating said "short".)
// Round 12 (2/1, "controls"): ONE button. Two buttons on a phone — tap one, HOLD the other, pick which while a beam
// is a metre away — was the complaint. DODGE (A) now looks at the beam that will reach you first (`incoming`, shared
// with the view, which shows ▲ HOP / ▼ DUCK over your head for it) and does the right thing: hops a low one, crouches
// under a high one (0.7 s, longer while held). The skill left is WHEN. B still crouches for keyboards and pads.
// Expansion 1 / M4 (2026-11-07, still "controls", avg 25 s of 60): the WHEN was a 0.4 s window judged on the server,
// so a phone 150 ms behind saw HOP NOW! and was zapped anyway, and an early press hopped and landed before the beam came.
// Now a press is held for you: press any time in the last second before a beam (the cue says PRESS) and the hop goes
// off at the right moment, a duck stays down until the beam has passed, and a press while crouched hops a low beam
// that comes next. The skill is reading the pairs and not pressing too early. The middle of the stage is now a solid
// hub: a spinner's line runs through it, so a player standing there (where a solo game started you!) was touched for
// the spinner's whole turn and no hop could clear it. Alone, Sparky (a computer player) dodges
// beside you, and sometimes fluffs one.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'laser-limbo', title: 'Laser Limbo', blurb: 'Jump and duck the sweeping lasers — last one standing!',
  how: ['Lasers sweep the stage. When one is coming, tap DODGE.', 'It hops the orange low beams and ducks the purple high ones for you, at the right moment.', 'Tap when the label says PRESS (the last second). 3 lives — last one standing wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'survival', unit: 'sec', tags: ['action'], rival: true,
  controls: { stick: true, a: 'Dodge' }, move: { speed: 5.6, accel: 30, carryMul: 0.4, stunDrag: 3 },
  arena: { shape: 'circle', r: 7, wall: true, posts: [{ x: 0, z: 0, r: 0.9 }] }, pitch: 58, card: 'card-laser-limbo', css: true,
};

export const LOW = 0, HIGH = 1, SWEEP = 0, SPIN = 1;
export const RULES = {
  hop: 0.62, hopH: 1.05, hopCool: 0.2,     // a hop lasts 0.62 s and peaks at 1.05 m; you clear a low beam above `clear`
  clear: 0.28,
  duckMin: 0.3,                            // a tap of DUCK still crouches you this long
  duckTap: 0.7, look: 1.4,                 // DODGE under a high beam crouches you this long; it looks this far ahead (s)
  press: 1.0,                              // M4: a press this long (or less) before a beam counts: the dodge is held for it
  hopAt: 0.2, duckPast: 0.4, duckMax: 1.9, // a held hop goes off when the beam is this far (s) away; a duck lasts until it is past
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
  // Sparky, the computer player (alone only): presses this long before a beam, and misses this share of them
  cpu: { lead: [0.25, 0.8], miss: { easy: 0.3, normal: 0.17, hard: 0.08 } },
};
export const CPU_NAME = 'Sparky';
const SPEED = { easy: 0.85, normal: 1, hard: 1.15 };
const r2 = v => Math.round(v * 100) / 100;
const DT_ = 0.05;
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

/** The beam that will touch (x, z) first within `horizon` seconds, of `list` = [{ k, h, a, s, v, warn, left }]: { beam, t } or
 *  null. Sweeps by their straight-line approach, spinners by the angle still to turn (after any warm-up). Pure: the
 *  sim's DODGE uses it to choose hop or duck, the view to label what DODGE will do. */
export function incoming(list, x, z, horizon = RULES.look) {
  let best = null;
  for (const b of list) {
    let t;
    if (b.k === SWEEP) { const d = beamDist(b, x, z); if (d < -RULES.beamW || b.v <= 0) continue; t = Math.max(0, (d - RULES.beamW) / b.v); }
    else {
      const r = Math.hypot(x, z); if (r < 0.05) t = Math.max(0, b.warn || 0);
      else {
        const phi = Math.atan2(z, x), a = b.a;   // the spinner's line runs along angle a (beamDist = 0 there)
        let da = (phi - a) * Math.sign(b.v || 1); da = ((da % Math.PI) + Math.PI) % Math.PI;
        da = Math.max(0, da - Math.asin(Math.min(1, RULES.beamW / r)));
        if (b.left != null && b.left < 90 && da > b.left) continue;
        t = Math.max(0, b.warn || 0) + da / Math.max(0.01, Math.abs(b.v));
      }
    }
    if (t <= horizon && (!best || t < best.t)) best = { beam: b, t };
  }
  return best;
}

export function create({ rng, players, difficulty = 'normal', rivals = true }) {
  const n = players.length, solo = n === 1, sparky = solo && rivals !== false, bodies = new Map(), spawns = spawnRing(sparky ? 2 : n, solo ? 2.8 : 3.4), R = meta.arena.r;   // "Rival when alone" off: no Sparky
  const D = RULES.cpu.miss[difficulty] != null ? difficulty : 'normal';
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const fresh = () => ({ prevB: 0, hop: 0, cool: 0, duck: 0, aDuck: false, out: false, outStep: -1, alive: 0, lives: RULES.lives, safe: 0, hopIn: -1 });
  const P = new Map(players.map(p => [p.pid, fresh()]));
  // Sparky: a body of its own, zapped by the same beams, pressing the same DODGE (never in `bodies`: the room sends those)
  const cpu = sparky ? { body: makeBody(spawns[1].x, spawns[1].z, spawns[1].yaw), s: fresh(), plan: new Map(), wander: 0, tx: spawns[1].x, tz: spawns[1].z } : null;
  const bodyOf = id => (id === 'cpu' ? cpu.body : bodies.get(id));
  const stOf = id => (id === 'cpu' ? cpu.s : P.get(id));
  const allIds = () => [...players.map(p => p.pid), ...(cpu ? ['cpu'] : [])];
  let beams = [], bid = 0, next = RULES.start, time = meta.seconds, elapsed = 0, stepNo = 0, over = false;
  const events = [];
  const standing = pid => !stOf(pid).out;
  const living = () => players.filter(p => standing(p.pid));

  function zap(pid, beam) {
    const s = stOf(pid), b = bodyOf(pid);
    if (s.safe > 0) return;
    s.lives--;
    if (s.lives > 0) { s.safe = RULES.safe; events.push({ e: 'zap', pid, h: beam.h, x: r2(b.x), z: r2(b.z), lv: s.lives }); return; }
    s.out = true; s.outStep = stepNo; s.hop = 0; s.duck = 0; s.hopIn = -1;
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
  const hopNow = (pid, s, b) => { s.hop = RULES.hop; s.hopIn = -1; b.flags |= F.AIR; b.flags &= ~F.CARRY; s.duck = 0; s.aDuck = false; events.push({ e: 'hop', pid }); };
  const crouch = (pid, b) => { if (!(b.flags & F.CARRY)) events.push({ e: 'duck', pid }); b.flags |= F.CARRY; };
  /** DODGE: the beam that reaches you first decides. A high one: duck, and stay down until it has passed. A low one:
   *  hop now if it is close, else hold the hop and let it go off when the beam is RULES.hopAt away. */
  function dodge(pid, s, b) {
    const nx = incoming(beams, b.x, b.z, Math.max(RULES.look, RULES.press));
    if (nx?.beam.h === HIGH) {
      if (b.flags & F.AIR) return;
      crouch(pid, b); s.duck = Math.min(RULES.duckMax, Math.max(RULES.duckTap, nx.t + RULES.duckPast)); s.aDuck = true; s.hopIn = -1;
    } else if (nx && nx.t > RULES.hopAt + 0.15 && nx.t <= RULES.press) { s.hopIn = nx.t - RULES.hopAt; events.push({ e: 'ready', pid, to: pid }); }
    else if (!(b.flags & F.AIR) && s.cool <= 0 && (nx || !(b.flags & F.CARRY))) hopNow(pid, s, b);    // crouched with nothing coming: stay down
  }
  function control(pid, inp) {
    const b = bodyOf(pid), s = stOf(pid);
    const bits = inp?.b | 0, pressA = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
    if (!s.out) {
      const air = !!(b.flags & F.AIR);
      if (bits & IN.B && !air) { crouch(pid, b); s.duck = Math.max(s.duck, RULES.duckMin); s.hopIn = -1; }
      if (bits & IN.A && !pressA && s.aDuck && (b.flags & F.CARRY)) s.duck = Math.max(s.duck, RULES.duckMin);    // DODGE held under a high beam: stay down
      if (pressA) dodge(pid, s, b);
      if (!(b.flags & F.CARRY)) s.aDuck = false;
    }
    stepBody(b, inp, meta.move, meta.arena);
  }
  // Sparky: once per beam, decide whether it will dodge it (and how early); amble about between beams
  function cpuInput() {
    const c = cpu, b = c.body; if (c.s.out) return null;
    let press = false;
    const nx = incoming(beams, b.x, b.z, RULES.press);
    if (nx) {
      let plan = c.plan.get(nx.beam.id);
      if (!plan) { plan = { lead: rng.range(RULES.cpu.lead[0], RULES.cpu.lead[1]), miss: rng.chance(RULES.cpu.miss[D]), done: false }; c.plan.set(nx.beam.id, plan); }
      if (!plan.done && !plan.miss && nx.t <= plan.lead) { press = true; plan.done = true; }
    }
    c.wander -= DT_;
    if (c.wander <= 0 || Math.hypot(c.tx - b.x, c.tz - b.z) < 0.4) { c.wander = rng.range(1.5, 3.5); const a = rng.range(0, Math.PI * 2), r = rng.range(2, R - 2.2); c.tx = Math.cos(a) * r; c.tz = Math.sin(a) * r; }
    const dx = c.tx - b.x, dz = c.tz - b.z, d = Math.hypot(dx, dz) || 1, k = d > 0.4 ? 0.45 : 0;
    return { mx: dx / d * k, mz: dz / d * k, b: press ? IN.A : 0 };
  }
  return {
    bodies, events,
    init: () => ({ r: R, cpu: cpu ? CPU_NAME : null, left: Math.ceil(time) }),
    input(pid, inp) { if (!bodies.has(pid) || over) return; control(pid, inp); },
    step(dt) {
      if (over) return;
      stepNo++; elapsed += dt;
      if (cpu) control('cpu', cpuInput());
      separate(allIds().filter(standing).map(bodyOf));
      // bodies: hops and crouches (crouch = F.CARRY, which stepBody slows by move.carryMul)
      for (const pid of allIds()) {
        const s = stOf(pid), b = bodyOf(pid); if (s.out) continue;
        if (s.cool > 0) s.cool -= dt;
        if (s.hopIn >= 0) { s.hopIn -= dt; if (s.hopIn <= 0 && !(b.flags & F.AIR)) hopNow(pid, s, b); }
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
        const before = new Map(); for (const pid of allIds()) if (standing(pid)) { const b = bodyOf(pid); before.set(pid, beamDist(beam, b.x, b.z)); }
        if (beam.k === SWEEP) { beam.s += beam.v * dt; if (beam.s > R + RULES.edge) beam.left = 0; }
        else { beam.a += beam.v * dt; beam.left -= Math.abs(beam.v) * dt; }
        for (const [pid, d0] of before) {
          const b = bodyOf(pid), d1 = beamDist(beam, b.x, b.z);
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
        for (const b of allIds().map(bodyOf)) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
        for (const p of living()) events.push({ e: 'win', pid: p.pid });
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = Math.floor(P.get(p.pid).alive);
      // a beam: [id, kind, height, angle, offset, speed, warning left] — the view moves it between updates with the speed
      const g = { bm: beams.map(b => [b.id, b.k, b.h, r3(b.a), r2(b.s), r3(b.v), r2(Math.max(0, b.warn))]), sc, out: players.filter(p => !standing(p.pid)).map(p => p.pid), lv: players.map(p => P.get(p.pid).lives), sf: players.filter(p => P.get(p.pid).safe > 0).map(p => p.pid), left: Math.ceil(time) };
      // Sparky: [x, z, y, yaw, lives, 1 ducking / 2 hopping, 1 blinking]
      if (cpu) { const b = cpu.body, s = cpu.s; g.cpu = [r2(b.x), r2(b.z), r2(b.y), r2(b.yaw), s.lives, b.flags & F.AIR ? 2 : b.flags & F.CARRY ? 1 : 0, s.safe > 0 ? 1 : 0, Math.hypot(b.vx, b.vz) > 0.3 ? 1 : 0]; }
      return g;
    },
    get over() { return over; },
    _setBeams: list => { beams = list; }, _incoming: (x, z) => incoming(beams, x, z),    // tests
    get cpu() { return cpu && { ...cpu.s, body: cpu.body }; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = P.get(p.pid); scores[p.pid] = Math.floor(s.alive); const k = s.out ? s.outStep : 1e9 + s.lives; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
