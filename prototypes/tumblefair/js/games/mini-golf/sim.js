// MINI GOLF — an eighteen-hole course for Golf mode (owner 2026-10-24: "18 course mini game where some of the levels
// are shaped like the outlines of numbers or letters, and other are distinct … the shape and path of the course is
// more important than graphics or props"). Plays like Putt Party: aim with the stick, hold A to charge, let go to putt;
// everyone putts their own ball on the same hole at once and balls knock each other about.
//
// Golf mode plays ONE HOLE per room round. The room calls create({ …, hole, holes, course, card }):
//   hole   = which hole of the round this is (0-based)     holes = how many the round has (3, 6, 9 or 18; any 1-18 works)
//   course = a number fixed for the whole round            card  = { pid: [strokes per earlier hole] } (the room's own)
// pickHoles(holes, course) turns that into which of the eighteen course holes (holes.js) this round plays, so every
// hole of a round agrees. The result's `scores` are strokes on this hole (lower is better); the room adds them up.
// An unfinished hole counts par + 3 (picked up), as in Putt Party. The match flow is js/games/golf-putt.js (one hole),
// the rolling physics js/games/golf-kit.js, the hole shapes js/games/mini-golf/shape.js.
//
// meta.mode 'golf' keeps it out of votes, Custom lists and the picker (js/games/index.js eligible()); no `season`, and
// the room never hands it one (no Halloween in Golf mode — owner).
//
// Expansion 1 (M4): alone, you play each hole against Par Pete, a computer golfer. His ball is a see-through ghost on
// the same hole (it never knocks yours), he lines up for a moment, then putts with the real physics — a little off
// on easy, sharp on hard. His strokes show next to yours; the hole still ends when YOU hole out or the clock runs out.
import { createPuttMatch, PICKUP } from '../golf-putt.js';
import { makeBall, stepBalls, simulatePutt, puttSpeed, assistYaw, clearLine } from '../golf-kit.js';
import { buildHole, pickHoles, HOLE_COUNT } from './holes.js';

export const meta = {
  id: 'mini-golf', title: 'Mini Golf', blurb: 'Eighteen holes shaped like letters, numbers and wild designs — fewest strokes wins!',
  how: ['Point the stick to aim. Hold A to charge, let go to putt.', 'Everyone putts at the same time. Bump other balls away!', 'Follow the shape to the cup. Par + 3 picks you up.'],
  kind: 'arena', mode: 'golf', min: 1, max: 4, seconds: 100, scoring: 'points', unit: 'strokes', tags: ['action'],
  controls: { stick: true, a: 'Putt (hold)' },
  move: { speed: 0.01, accel: 40 },                    // you never walk: the stick only turns you (your aim)
  arena: { shape: 'rect', hw: 5, hd: 7, wall: false }, pitch: 64, css: true, rival: true,
  card: 'card-putt-party',                             // Putt Party's picture (Golf mode shows it on each hole's intro card)
};

/** How long one hole may take (s): longer for a longer par, a little more on easy, less on hard; always inside meta.seconds. */
export function holeSeconds(par, difficulty = 'normal') {
  return Math.min(meta.seconds - 3, 50 + par * 11 + ({ easy: 8, hard: -8 }[difficulty] || 0));
}

/** The holes of a round as the card shows them: [{ k, n, name, par, glyph }] in play order. */
export function roundHoles(holes, course, difficulty = 'normal') {
  return pickHoles(holes, course).map(k => { const H = buildHole(k, difficulty); return { k, n: H.n, name: H.name, par: H.par, glyph: H.glyph }; });
}

export const CPU_NAME = 'Par Pete';
/** Pete's hand per difficulty: aim error (degrees), power error (share), how long he lines up (s). */
export const PETE = { easy: { yaw: 7, pow: 0.14, think: 2.2 }, normal: { yaw: 3.5, pow: 0.08, think: 1.7 }, hard: { yaw: 1.5, pow: 0.04, think: 1.2 } };
/** How far the cup is by the PATH round the walls, from anywhere on the hole: a 0.25 m grid filled outward from the
 *  cup through gaps a ball fits through. A straight-line distance sent Pete up a dead end on the U and the
 *  switchbacks (closer as the crow flies, nowhere near by the path). → (x, z) => metres (Infinity = cut off). */
export function pathField(course, cup, areas, cell = 0.25) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const A of areas) for (const [x, z] of A.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const W = Math.ceil((x1 - x0) / cell) + 1, Hh = Math.ceil((z1 - z0) / cell) + 1, D = new Float32Array(W * Hh).fill(Infinity);
  const X = i => x0 + i * cell, Z = j => z0 + j * cell, at = (x, z) => [Math.round((x - x0) / cell), Math.round((z - z0) / cell)];
  const [ci, cj] = at(cup.x, cup.z); const q = [];
  if (ci >= 0 && ci < W && cj >= 0 && cj < Hh) { D[cj * W + ci] = 0; q.push(cj * W + ci); }
  const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  // Dijkstra-lite: few cells, a sorted insert is plenty
  while (q.length) {
    let bi = 0; for (let k = 1; k < q.length; k++) if (D[q[k]] < D[q[bi]]) bi = k;
    const c = q[bi]; q[bi] = q[q.length - 1]; q.pop();
    const i = c % W, j = (c - i) / W;
    for (const [di, dj, w] of N) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= Hh) continue;
      const k = b * W + a, nd = D[c] + w * cell; if (nd >= D[k]) continue;
      if (!clearLine(course, X(i), Z(j), X(a), Z(b))) continue;
      if (D[k] === Infinity) q.push(k); D[k] = nd;
    }
  }
  return (x, z) => { const [i, j] = at(x, z); return i >= 0 && j >= 0 && i < W && j < Hh ? D[j * W + i] : Infinity; };
}
/** Pete's look-ahead from (x, z), as a generator so the server can spread it over many ticks (it yields after every
 *  putt it tries; the last value it returns is the pick). It runs the real physics over 36 directions (plus straight at
 *  the cup) and 12 strengths, then fine-tunes around the best one. → { yaw, p, d } (d -1 = it drops). */
export function* peteSearch(course, cup, L, x, z, t, far = (a, b) => Math.hypot(a - cup.x, b - cup.z)) {
  let best = null;
  const tryShot = (yaw, p) => {
    const r = simulatePutt(course, x, z, assistYaw(course, x, z, yaw, [cup], L.help), puttSpeed(p, L.max), t, 9);
    const d = r.in ? -1 + p * 0.01 : far(r.x, r.z);
    if (!best || d < best.d) best = { d, yaw, p };
  };
  const yaws = [Math.atan2(cup.x - x, cup.z - z), ...Array.from({ length: 36 }, (_, i) => i * Math.PI / 18)];
  for (const yaw of yaws) for (let k = 1; k <= 12; k++) { tryShot(yaw, k / 12); yield; }
  const y0 = best.yaw, p0 = best.p;
  for (let s = -4; s <= 4; s++) for (const dp of [-0.06, -0.03, 0, 0.03, 0.06]) { if (best.d < 0) return best; tryShot(y0 + s * 1.25 * Math.PI / 180, Math.max(0.03, Math.min(1, p0 + dp))); yield; }
  return best;
}
/** The whole search at once (tests). */
export function peteShot(course, cup, L, x, z, t, far) { const it = peteSearch(course, cup, L, x, z, t, far); let r; do r = it.next(); while (!r.done); return r.value; }
export const PETE_PER_TICK = 24;                 // putts Pete tries per 50 ms server tick

export function create({ rng, players, difficulty = 'normal', hole = 0, holes = HOLE_COUNT, course = 0, card = {}, rivals = true }) {
  const list = roundHoles(holes, course, difficulty), at = Math.max(0, Math.min(list.length - 1, hole | 0));
  const H0 = buildHole(list[at].k, difficulty);
  // the match flow mutates its hole (cup, cupOpen), so it gets its own copy; the walls and lookup grid are shared
  const course0 = { ...H0.course }; Object.defineProperty(course0, 'near', { value: H0.course.near, enumerable: false });
  const H = { name: H0.name, par: H0.par, tee: H0.tee, cup: H0.cup, course: course0 };
  const secs = holeSeconds(H0.par, difficulty);
  const inner = createPuttMatch({ meta, rng, players, difficulty, holes: [H], holeSeconds: secs, gap: 0 });
  const n = players.length, past = Object.fromEntries(players.map(p => [p.pid, (card[p.pid] || []).slice(0, at).map(v => (typeof v === 'number' ? v : null))]));
  let teed = false;
  const L = inner.init().level, hand = PETE[difficulty] || PETE.normal;
  // "Rival when alone" off (rivals false): no Par Pete — you play the hole against par
  const pete = n === 1 && rivals !== false ? { ball: null, strokes: 0, st: 'aim', wait: hand.think, done: false } : null;
  /** Seat i's ball on the tee: side by side ACROSS the way the hole starts (the line to the cup can point at a wall). */
  function teeUp() {
    const yaw = H0.teeYaw, c = Math.cos(yaw), s = Math.sin(yaw);
    players.forEach((p, i) => {
      const off = (i - (n - 1) / 2) * 0.45, st = inner._debug.player(p.pid), b = inner.bodies.get(p.pid);
      st.ball.x = Math.round((H0.tee.x + c * off) * 100) / 100; st.ball.z = Math.round((H0.tee.z - s * off) * 100) / 100;
      b.yaw = yaw; b.x = st.ball.x - Math.sin(yaw) * 0.62; b.z = st.ball.z - Math.cos(yaw) * 0.62;
    });
  }
  const game = {
    bodies: inner.bodies, events: inner.events,
    init() {
      const base = inner.init();
      return {
        ...base, holes: [{ ...base.holes[0], n: H0.n, id: H0.id, glyph: H0.glyph, water: H0.water, teeYaw: H0.teeYaw, areas: H0.areas }],
        arena: { shape: 'rect', hw: H0.size.hw, hd: H0.size.hd, wall: false },
        round: { at, of: list.length, holes: list.map(({ n, name, par, glyph }) => ({ n, name, par, glyph })), card: past },
      };
    },
    input: (pid, inp) => inner.input(pid, inp),
    step(dt) {
      const t0 = inner._debug.t();
      inner.step(dt);
      if (!teed && inner._debug.phase() === 'play') { teed = true; teeUp(); if (pete) { const b = inner._debug.player(players[0].pid).ball, yaw = H0.teeYaw; pete.ball = makeBall(Math.round((b.x + Math.cos(yaw) * 0.45) * 100) / 100, Math.round((b.z - Math.sin(yaw) * 0.45) * 100) / 100); } }
      if (pete?.ball && inner._debug.phase() === 'play') peteStep(dt, t0);
    },
    state() {
      const g = inner.state();
      if (pete?.ball) g.cpu = [Math.round(pete.ball.x * 100) / 100, Math.round(pete.ball.z * 100) / 100, pete.st === 'in' ? 2 : pete.st === 'out' ? 3 : pete.st === 'roll' ? 1 : 0, pete.strokes];
      return g;
    },
    get over() { return inner.over; },
    result() {
      const r = inner.result();
      return { ...r, hole: { n: H0.n, at, of: list.length, name: H0.name, par: H0.par }, par: H0.par };
    },
    _debug: { ...inner._debug, built: () => H0, list: () => list, pete: () => pete },
  };
  /** Pete's turn, one step: line up, putt, roll (his ball on its own: a ghost), hole out or pick up at par + 3. */
  function peteStep(dt, t) {
    const course = inner._debug.hole().course, cup = course.cup, b = pete.ball;
    if (pete.st === 'aim') {
      pete.wait -= dt;
      pete.far ||= pathField(course, cup, H0.areas || []);
      if (!pete.search) { pete.search = peteSearch(course, cup, L, b.x, b.z, t + hand.think, pete.far); pete.shot = null; }
      for (let i = 0; i < PETE_PER_TICK && !pete.shot; i++) { const r = pete.search.next(); if (r.done) pete.shot = r.value; }
      if (pete.wait > 0 || !pete.shot) return;
      const shot = pete.shot; pete.search = null;
      const yaw = assistYaw(course, b.x, b.z, shot.yaw + rng.range(-hand.yaw, hand.yaw) * Math.PI / 180, [cup], L.help);
      const v = puttSpeed(Math.max(0.05, Math.min(1, shot.p * (1 + rng.range(-hand.pow, hand.pow)))), L.max);
      b.vx = Math.sin(yaw) * v; b.vz = Math.cos(yaw) * v; b.still = false; pete.st = 'roll'; pete.strokes++; pete.rollT = 0;
      inner.events.push({ e: 'cpuPutt', x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 100) / 100 });
    } else if (pete.st === 'roll') {
      const ev = stepBalls([b], course, t, dt); pete.rollT += dt;
      if (ev.some(e => e.e === 'cup')) { pete.st = 'in'; inner.events.push({ e: 'cpuIn', strokes: pete.strokes, par: H0.par }); return; }
      if (pete.rollT > 14) { b.vx = b.vz = 0; b.still = true; }
      if (b.still) {
        if (pete.strokes >= H0.par + PICKUP) { pete.st = 'out'; b.gone = true; inner.events.push({ e: 'cpuIn', strokes: H0.par + PICKUP, par: H0.par, pickup: 1 }); }
        else { pete.st = 'aim'; pete.wait = hand.think; }
      }
    }
  }
  return game;
}
export { PICKUP, pickHoles, buildHole };
