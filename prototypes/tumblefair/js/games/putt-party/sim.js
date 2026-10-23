// PUTT PARTY — mini golf on a fairground course, everyone at once. Three short holes, each laid out on the same
// lawn: Bumper Alley (springy mushroom bumpers), the Windmill (four paddles turning in the only gap) and the Hump
// (a ramp you need enough pace to climb, then a green that breaks toward the cup). Every player putts their own ball at
// the same time — no waiting for turns — and balls knock each other about. Fewest strokes wins; an unfinished hole
// counts par + 3. The rolling physics are js/games/golf-kit.js; the match flow is js/games/golf-putt.js.
import { createPuttMatch } from '../golf-putt.js';

export const meta = {
  id: 'putt-party', title: 'Putt Party', blurb: 'Putt your ball into the cup in the fewest strokes — everyone at once!',
  how: ['Point the stick to aim. Hold A to charge, let go to putt.', 'Everyone putts at the same time. Bump other balls away!', 'Fewest strokes over 3 holes wins. Par + 3 picks you up.'],
  kind: 'arena', min: 1, max: 4, seconds: 100, scoring: 'points', unit: 'strokes', tags: ['action'],
  controls: { stick: true, a: 'Putt (hold)' },
  move: { speed: 0.01, accel: 40 },                    // you never walk: the stick only turns you (your aim)
  arena: { shape: 'rect', hw: 9.2, hd: 5.8, wall: false }, pitch: 64, card: 'card-putt-party', css: true,
};

const seg = (ax, az, bx, bz, e) => ({ ax, az, bx, bz, ...(e != null ? { e } : {}) });
/** The four walls of a rectangle (x0 < x1, z0 < z1). */
export const box4 = (x0, z0, x1, z1) => [seg(x0, z0, x1, z0), seg(x1, z0, x1, z1), seg(x1, z1, x0, z1), seg(x0, z1, x0, z0)];
const SPIN = { easy: 1.2, normal: 1.6, hard: 2.2 };

/** The three holes (layouts are fixed; the spinner's speed and the side a hole is mirrored to come from the seed / level). */
export function holesFor(difficulty = 'normal', flip = [1, 1, 1]) {
  const fx = (k, list) => list.map(o => mirror(o, flip[k]));
  return [
    { name: 'Bumper Alley', par: 2, tee: m({ x: -6.6, z: 3.2 }, flip[0]), cup: m({ x: 6.2, z: -2.9 }, flip[0]),
      course: { walls: fx(0, box4(-8, -4.5, 8, 4.5)), posts: fx(0, [{ x: -2.4, z: 1.6, r: 0.48, e: 1.15 }, { x: 0.2, z: -1.7, r: 0.48, e: 1.15 }, { x: 1.4, z: 2.0, r: 0.48, e: 1.15 }, { x: 3.7, z: -0.1, r: 0.48, e: 1.15 }, { x: -3.6, z: -2.4, r: 0.48, e: 1.15 }]) } },
    { name: 'The Windmill', par: 3, tee: m({ x: 0, z: 3.9 }, flip[1]), cup: m({ x: 0, z: -3.6 }, flip[1]),
      course: { walls: fx(1, [...box4(-6.5, -4.6, 6.5, 4.6), seg(-6.5, 0, -2.35, 0), seg(2.35, 0, 6.5, 0)]), posts: [{ x: 0, z: 0, r: 0.32 }, ...fx(1, [{ x: -2.4, z: -2.6, r: 0.48, e: 1.15 }, { x: 2.4, z: -2.6, r: 0.48, e: 1.15 }])],
        spinners: [{ x: 0, z: 0, len: 2.2, arms: 4, w: (SPIN[difficulty] || SPIN.normal) * flip[1], phase: 0.4, hub: 0.3 }] } },
    { name: 'The Hump', par: 3, tee: m({ x: -6.2, z: 3.3 }, flip[2]), cup: m({ x: 5.4, z: -3.1 }, flip[2]),
      course: { walls: fx(2, [...box4(-8, -4.6, 8, 4.6), seg(0, -4.6, 0, 1.0)]), ramps: fx(2, [{ x: 0, z: 2.8, hw: 1.3, hd: 1.8, axis: 'x', rise: 0.38 }]),
        posts: fx(2, [{ x: 4.6, z: 2.6, r: 0.48, e: 1.15 }]), slopes: fx(2, [{ x: 4.4, z: -1.2, hw: 3.2, hd: 1.6, gx: 0.55, gz: 0 }]) } },
  ];
}
/** Mirror a thing left-right (flip = -1). */
function m(p, f) { return f < 0 ? { ...p, x: -p.x } : p; }
function mirror(o, f) {
  if (f > 0) return o;
  if ('ax' in o) return { ...o, ax: -o.ax, bx: -o.bx };
  const out = { ...o, x: -o.x }; if ('gx' in o) out.gx = -o.gx; return out;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const flip = [rng.chance(0.5) ? -1 : 1, rng.chance(0.5) ? -1 : 1, rng.chance(0.5) ? -1 : 1];
  return createPuttMatch({ meta, rng, players, difficulty, holes: holesFor(difficulty, flip), holeSeconds: 30, gap: 2.6 });
}
