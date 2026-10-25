// MINI GOLF — the eighteen holes, as data. Nine are the outline of a number or a letter (the corridor follows the
// stroke of the glyph: tee at one end, cup at the other or tucked somewhere awkward); nine are their own designs. Even
// course numbers are designs, odd ones glyphs, so any spread of holes mixes the two.
//
// A hole is pieces (shape.js: thick strokes, rectangles, circles, polygons, minus cut-outs) plus the golf kit's
// obstacles (posts, boxes, ramps, slopes, spinners), drawn in metres with -z at the TOP of the screen. buildHole()
// traces the walls, centres the hole on (0, 0) (the arena the browser frames is the hole's own box) and adds the lookup
// grid. Every hole is built at most once per difficulty (they are the same every time).
import { arc, ellipse, buildWalls, nearGrid } from './shape.js';

const R = 0.95;                                   // a glyph's corridor is 1.9 m wide: four balls fit side by side on the tee
const spring = (x, z, r = 0.42) => ({ x, z, r, e: 1.15 });
const deg = (dx, dz) => Math.atan2(dx, dz);       // a direction -> yaw (0 = +z, down the screen)

/** The eighteen holes. `spin` scales every spinner by difficulty. */
export function holeDefs(spin = 1) {
  // ---- the spiral: an Archimedean curve from the outside in, the cup in a pocket in the middle
  const SP = [], b = 2.75 / (Math.PI * 2), tMax = (5.1 - 0.95) / b, phi = Math.PI / 2 - tMax;
  for (let k = 0; k <= 90; k++) { const t = tMax * (1 - k / 90), r = 0.95 + b * t; SP.push([r * Math.cos(t + phi), r * Math.sin(t + phi)]); }
  const spTee = SP[3], spDir = [SP[4][0] - SP[2][0], SP[4][1] - SP[2][1]];
  // ---- the "8": two rings meeting at the waist, each with one side shut, so the way round really is a figure eight
  const upper = ellipse(0, -3.3, 2.3, 2.4), lower = ellipse(0, 2.75, 2.8, 2.75);
  return [
    { id: 'funnel', name: 'The Funnel', par: 2,
      shapes: [{ rect: [-4.2, -6.4, 4.2, -3.2] }, { poly: [[-4.2, -3.25], [4.2, -3.25], [0.8, 1.6], [-0.8, 1.6]] }, { rect: [-0.8, 1.4, 0.8, 2.7] }, { circle: [0, 4.3, 2.1] }],
      slopes: [{ x: -2.1, z: -0.8, hw: 2.1, hd: 2.4, gx: 0.8, gz: 0 }, { x: 2.1, z: -0.8, hw: 2.1, hd: 2.4, gx: -0.8, gz: 0 }],
      posts: [spring(0, -1.4, 0.45)], tee: [0, -5.5], dir: [0, 1], cup: [0, 4.7] },
    { id: 'L', glyph: 'L', name: 'Letter L', par: 3,
      shapes: [{ stroke: [[-2.6, -6.2], [-2.6, 4.6], [3.6, 4.6]], r: R }],
      boxes: [{ x: 1.0, z: 4.6, hw: 0.3, hd: 0.42 }], tee: [-2.6, -5.5], dir: [0, 1], cup: [3.3, 4.6] },
    { id: 'bumpers', name: 'Bumper Maze', par: 3,
      shapes: [{ rect: [-4.4, -6.4, 4.4, 6.4] }], cuts: [{ rect: [-1.2, 1.9, 4.5, 2.25] }, { rect: [-4.5, -2.25, 1.2, -1.9] }],
      posts: [spring(-1.6, 4.0), spring(1.4, 3.6), spring(3.0, 5.2), spring(-3.2, 0.6), spring(-0.4, 0.0), spring(2.4, -0.4), spring(-2.4, -4.4), spring(0.6, -4.0), spring(3.0, -3.4)],
      tee: [-3.2, 5.6], dir: [0, -1], cup: [3.3, -5.5] },
    { id: '2', glyph: '2', name: 'Number 2', par: 4,
      shapes: [{ stroke: [...arc(0, -3.2, 2.7, -180, 30), [-3.0, 5.6], [3.6, 5.6]], r: R }],
      posts: [spring(0.3, 2.0, 0.4)], tee: [-2.7, -3.3], dir: [0, -1], cup: [3.3, 5.6] },
    { id: 'windmill', name: 'The Windmill', par: 3,
      shapes: [{ rect: [-3, 1.8, 3, 6.4] }, { rect: [-1.55, -2.2, 1.55, 2.2] }, { circle: [0, -4.2, 2.8] }],
      posts: [{ x: 0, z: 0, r: 0.32 }, spring(-1.7, -4.4, 0.4), spring(1.7, -4.4, 0.4)],
      spinners: [{ x: 0, z: 0, len: 1.75, arms: 4, w: 1.5 * spin, phase: 0.4, hub: 0.3 }], tee: [0, 5.5], dir: [0, -1], cup: [0, -5.2] },
    { id: 'U', glyph: 'U', name: 'Letter U', par: 3,
      shapes: [{ stroke: [[-3, -6.2], [-3, 2.4], ...arc(0, 2.4, 3, 180, 0), [3, -6.2]], r: R }],
      posts: [spring(0, 5.4, 0.4)], tee: [-3, -5.5], dir: [0, 1], cup: [3, -5.5] },
    { id: 'switchbacks', name: 'Switchbacks', par: 4,
      shapes: [{ stroke: [[-3.7, 5.25], [3.7, 5.25], [3.7, 1.75], [-3.7, 1.75], [-3.7, -1.75], [3.7, -1.75], [3.7, -5.25], [-3.5, -5.25]], r: R }],
      posts: [spring(0, 1.75, 0.36), spring(0, -1.75, 0.36)], tee: [-3.2, 5.25], dir: [1, 0], cup: [-3.2, -5.25] },
    { id: 'S', glyph: 'S', name: 'Letter S', par: 4,
      shapes: [{ stroke: [...arc(0, -3, 2.8, -20, -270), ...arc(0, 2.6, 2.8, -90, 160).slice(1)], r: R }],
      tee: [2.42, -4.35], dir: [-0.47, -0.88], cup: [-2.6, 3.55] },
    { id: 'spiral', name: 'The Spiral', par: 4,
      shapes: [{ stroke: SP, r: R }, { circle: [0, 0, 1.35] }], tee: spTee, dir: spDir, cup: [0, 0] },
    { id: '7', glyph: '7', name: 'Number 7', par: 3,
      shapes: [{ stroke: [[-3.6, -6], [3.3, -6], [-0.6, 6.2]], r: R }],
      slopes: [{ x: 1.2, z: 0.4, hw: 2.4, hd: 3.6, gx: -0.6, gz: 0 }], tee: [-3.1, -6], dir: [1, 0], cup: [-0.5, 5.6] },
    { id: 'hump', name: 'Hump Jump', par: 3,
      shapes: [{ rect: [-1.7, -0.6, 1.7, 6.4] }, { circle: [0, -3.4, 3.0] }],
      ramps: [{ x: 0, z: 2.5, hw: 1.7, hd: 1.5, axis: 'z', rise: 0.42 }], slopes: [{ x: 0, z: -3.4, hw: 3, hd: 3, gx: 0.55, gz: 0 }],
      tee: [0, 5.6], dir: [0, -1], cup: [-1.1, -4.5] },
    { id: 'Z', glyph: 'Z', name: 'Letter Z', par: 3,
      shapes: [{ stroke: [[-3.6, -6], [3.6, -6], [-3.6, 6], [3.6, 6]], r: R }],
      posts: [spring(0, 0, 0.42)], tee: [-3.1, -6], dir: [1, 0], cup: [3.1, 6] },
    { id: 'island', name: 'Island Green', par: 3, water: true,
      shapes: [{ rect: [-2.8, 3.4, 2.8, 6.4] }, { stroke: [[-1.9, 3.7], [-1.9, -0.7]], r: 0.5 }, { stroke: [[1.9, 3.7], [1.9, -0.7]], r: 0.5 }, { circle: [0, -3.2, 2.9] }],
      posts: [spring(0, -2.0, 0.42)], tee: [0, 5.1], dir: [0, -1], cup: [0, -4.1] },
    { id: '3', glyph: '3', name: 'Number 3', par: 4,
      shapes: [{ stroke: [...arc(0, -3.1, 2.6, -160, 110), ...arc(0, 2.6, 3.0, -110, 152)], r: R }],
      tee: [-2.25, -4.4], dir: [0.5, -0.87], cup: [-2.5, 4.0] },
    { id: 'split', name: 'Split Decision', par: 3,
      shapes: [{ rect: [-4, -6.2, 4, 6.2] }], cuts: [{ rect: [-2, -3.8, 2.8, 3.8] }],
      posts: [spring(3.2, 1.3, 0.25), spring(3.6, -1.3, 0.25)], tee: [0, 5.0], dir: [1, 0], cup: [3.1, -5.1] },
    { id: 'O', glyph: 'O', name: 'The Big O', par: 4,
      shapes: [{ stroke: ellipse(0, 0, 3.2, 5.2), r: R }, { circle: [-3.28, 4.31, 0.9] }],
      boxes: [{ x: -0.6, z: 5.2, hw: 0.2, hd: 1.02 }], tee: [0.7, 5.2], dir: [1, 0], cup: [-3.35, 4.35] },
    { id: 'gauntlet', name: 'Spinner Gauntlet', par: 4,
      shapes: [{ rect: [-1.8, -6.4, 1.8, 6.4] }],
      posts: [{ x: 0, z: 3.4, r: 0.25 }, { x: 0, z: 0, r: 0.25 }, { x: 0, z: -3.4, r: 0.25 }],
      spinners: [{ x: 0, z: 3.4, len: 1.65, arms: 2, w: 1.3 * spin, phase: 0.2, hub: 0.25 }, { x: 0, z: 0, len: 1.65, arms: 2, w: -1.7 * spin, phase: 1.3, hub: 0.25 }, { x: 0, z: -3.4, len: 1.65, arms: 2, w: 2.1 * spin, phase: 2.4, hub: 0.25 }],
      tee: [0, 5.6], dir: [0, -1], cup: [0, -5.6] },
    { id: '8', glyph: '8', name: 'Figure Eight', par: 4,
      shapes: [{ stroke: upper, r: R }, { stroke: lower, r: R }],
      boxes: [{ x: 2.8, z: 2.75, hw: 1.02, hd: 0.18 }, { x: -2.3, z: -3.3, hw: 1.02, hd: 0.18 }], tee: [0, 5.5], dir: [-1, 0], cup: [-1.15, -5.38] },
  ];
}
export const HOLE_COUNT = 18;
export const SPIN = { easy: 0.75, normal: 1, hard: 1.35 };

const r2 = v => Math.round(v * 100) / 100;
const cache = new Map();
/** Hole k (0-17) ready to play: walls traced, centred on (0, 0), with its lookup grid. */
export function buildHole(k, difficulty = 'normal') {
  const key = k + ':' + difficulty; if (cache.has(key)) return cache.get(key);
  const D = holeDefs(SPIN[difficulty] || 1)[k];
  const { walls, areas, loops } = buildWalls(D.shapes, D.cuts || []);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const L of loops) for (const [x, z] of L) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const ox = r2((x0 + x1) / 2), oz = r2((z0 + z1) / 2), mx = v => r2(v - ox), mz = v => r2(v - oz);
  const shift = o => ({ ...o, x: mx(o.x), z: mz(o.z) });
  const W = walls.map(w => ({ ax: mx(w.ax), az: mz(w.az), bx: mx(w.bx), bz: mz(w.bz) }));
  const course = { walls: W, posts: (D.posts || []).map(shift), boxes: (D.boxes || []).map(shift), ramps: (D.ramps || []).map(shift), slopes: (D.slopes || []).map(shift), spinners: (D.spinners || []).map(shift) };
  const H = {
    k, n: k + 1, id: D.id, name: D.name, par: D.par, glyph: D.glyph || null, water: !!D.water,
    tee: { x: mx(D.tee[0]), z: mz(D.tee[1]) }, teeYaw: r2(deg(D.dir[0], D.dir[1])), cup: { x: mx(D.cup[0]), z: mz(D.cup[1]) },
    areas: areas.map(A => ({ outer: A.outer.map(([x, z]) => [mx(x), mz(z)]), holes: A.holes.map(L => L.map(([x, z]) => [mx(x), mz(z)])) })),
    size: { hw: r2((x1 - x0) / 2), hd: r2((z1 - z0) / 2) },
    shapes: D.shapes, cuts: D.cuts || [], offset: { x: ox, z: oz },       // the raw pieces (tests read them; never sent)
    course,
  };
  Object.defineProperty(course, 'near', { value: nearGrid(W), enumerable: false });
  cache.set(key, H); return H;
}

/**
 * Which course holes a round plays (0-based, in play order), from how many holes it has and the round's `course`
 * number (fixed for the whole round, so every hole of the round agrees). 18 = all of them in order; 9 = the front or
 * back nine; fewer = an even spread round the course starting at a place `course` picks, mixing glyphs and designs.
 */
export function pickHoles(holes, course = 0) {
  const n = Math.max(1, Math.min(HOLE_COUNT, holes | 0)), c = Math.abs(course | 0);
  if (n === HOLE_COUNT) return Array.from({ length: n }, (_, i) => i);
  if (n === 9) return Array.from({ length: 9 }, (_, i) => i + (c % 2) * 9);
  const step = HOLE_COUNT / n, o = c % Math.max(1, Math.floor(step)), out = [];
  for (let i = 0; i < n; i++) {
    let k = (Math.floor(i * step) + o + (Math.floor(step) % 2 === 0 ? i % 2 : 0)) % HOLE_COUNT;   // an even stride would keep one parity: nudge every other pick
    while (out.includes(k)) k = (k + 1) % HOLE_COUNT;
    out.push(k);
  }
  return out.sort((a, b) => a - b);
}
