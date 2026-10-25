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
import { createPuttMatch, PICKUP } from '../golf-putt.js';
import { buildHole, pickHoles, HOLE_COUNT } from './holes.js';

export const meta = {
  id: 'mini-golf', title: 'Mini Golf', blurb: 'Eighteen holes shaped like letters, numbers and wild designs — fewest strokes wins!',
  how: ['Point the stick to aim. Hold A to charge, let go to putt.', 'Everyone putts at the same time. Bump other balls away!', 'Follow the shape to the cup. Par + 3 picks you up.'],
  kind: 'arena', mode: 'golf', min: 1, max: 4, seconds: 100, scoring: 'points', unit: 'strokes', tags: ['action'],
  controls: { stick: true, a: 'Putt (hold)' },
  move: { speed: 0.01, accel: 40 },                    // you never walk: the stick only turns you (your aim)
  arena: { shape: 'rect', hw: 5, hd: 7, wall: false }, pitch: 64, css: true,
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

export function create({ rng, players, difficulty = 'normal', hole = 0, holes = HOLE_COUNT, course = 0, card = {} }) {
  const list = roundHoles(holes, course, difficulty), at = Math.max(0, Math.min(list.length - 1, hole | 0));
  const H0 = buildHole(list[at].k, difficulty);
  // the match flow mutates its hole (cup, cupOpen), so it gets its own copy; the walls and lookup grid are shared
  const course0 = { ...H0.course }; Object.defineProperty(course0, 'near', { value: H0.course.near, enumerable: false });
  const H = { name: H0.name, par: H0.par, tee: H0.tee, cup: H0.cup, course: course0 };
  const secs = holeSeconds(H0.par, difficulty);
  const inner = createPuttMatch({ meta, rng, players, difficulty, holes: [H], holeSeconds: secs, gap: 0 });
  const n = players.length, past = Object.fromEntries(players.map(p => [p.pid, (card[p.pid] || []).slice(0, at).map(v => (typeof v === 'number' ? v : null))]));
  let teed = false;
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
      inner.step(dt);
      if (!teed && inner._debug.phase() === 'play') { teed = true; teeUp(); }
    },
    state: () => inner.state(),
    get over() { return inner.over; },
    result() {
      const r = inner.result();
      return { ...r, hole: { n: H0.n, at, of: list.length, name: H0.name, par: H0.par }, par: H0.par };
    },
    _debug: { ...inner._debug, built: () => H0, list: () => list },
  };
  return game;
}
export { PICKUP, pickHoles, buildHole };
