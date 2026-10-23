// HAUNTED HOLE (Halloween only) — spooky-cute mini golf on a moonlit graveyard course, everyone at once. Three holes:
// Tombstone Row (tombstones for bumpers and a friendly ghost drifting across the green that puffs any rolling ball it
// touches off its line), Pumpkin Tunnel (putt into a jack-o'-lantern's grin and the ball pops out on the far side of
// the hedge, right by the cup — or take the long way round) and Coffin Cup (the cup sits inside a coffin whose lid
// swings shut every few seconds; a closed lid knocks you back out). Same controls and scoring as Putt Party
// (js/games/golf-putt.js): fewest strokes wins, an unfinished hole counts par + 3.
import { createPuttMatch } from '../golf-putt.js';
import { BALL_R, speedOf } from '../golf-kit.js';

export const meta = {
  id: 'haunted-hole', title: 'Haunted Hole', blurb: 'Putt through a moonlit graveyard course in the fewest strokes!',
  how: ['Point the stick to aim. Hold A to charge, let go to putt.', 'The ghost puffs balls off line. The pumpkin grin is a shortcut!', 'The coffin lid shuts now and then. Fewest strokes wins.'],
  kind: 'arena', min: 1, max: 4, seconds: 100, scoring: 'points', unit: 'strokes', tags: ['action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Putt (hold)' },
  move: { speed: 0.01, accel: 40 },
  arena: { shape: 'rect', hw: 9.2, hd: 5.8, wall: false }, pitch: 64, card: 'card-haunted-hole', css: true,
};

const seg = (ax, az, bx, bz, e) => ({ ax, az, bx, bz, ...(e != null ? { e } : {}) });
const box4 = (x0, z0, x1, z1) => [seg(x0, z0, x1, z0), seg(x1, z0, x1, z1), seg(x1, z1, x0, z1), seg(x0, z1, x0, z0)];
const stone = (x, z, w = 0.5) => ({ x, z, hw: w, hd: 0.2 });
/** The coffin around the third hole's cup (open at the front, toward the tee). */
export const COFFIN = [[-0.6, -2.45], [-0.88, -3.55], [-0.56, -4.35], [0.56, -4.35], [0.88, -3.55], [0.6, -2.45]];
/** Lid timing by level: seconds open, seconds shut. */
export const LID = { easy: [2.6, 1.2], normal: [2.1, 1.6], hard: [1.6, 2.0] };
export const GHOST_R = 0.62, GHOST_PUFF = 2.6;
/** A ghost's drift: where it is at hole time t. */
export const ghostAt = (g, t) => ({ x: g.x + g.ax * Math.sin(g.wx * t + g.px), z: g.z + g.az * Math.sin(g.wz * t + g.pz) });
export const lidOpen = (difficulty, t) => { const [o, c] = LID[difficulty] || LID.normal; return (t % (o + c)) < o; };

export function holesFor() {
  return [
    { name: 'Tombstone Row', par: 3, tee: { x: -6.6, z: 3.3 }, cup: { x: 6.3, z: -3.0 },
      course: { walls: box4(-8, -4.5, 8, 4.5), boxes: [stone(-3.4, 2.1), stone(-3.4, -1.0), stone(-1.0, 0.7), stone(-1.0, -2.9), stone(1.6, 2.5), stone(1.6, -1.0), stone(4.1, 1.0), stone(4.4, -2.1, 0.4)] },
      ghost: { x: 0.3, z: 0.2, ax: 3.4, az: 1.9, wx: 0.55, wz: 0.9, px: 0, pz: 1 } },
    { name: 'Pumpkin Tunnel', par: 2, tee: { x: -5, z: 3.4 }, cup: { x: -5, z: -3.2 },
      course: { walls: [...box4(-8, -4.5, 8, 4.5), seg(-8, -0.6, 6.0, -0.6)], posts: [{ x: -5.72, z: 0.12, r: 0.5, e: 0.9 }, { x: -4.28, z: 0.12, r: 0.5, e: 0.9 }], boxes: [stone(-1.5, 1.8), stone(2.4, 2.6), stone(3.2, 0.6), stone(1.0, -2.6), stone(-2.4, -2.2)] },
      tunnel: { x: -5, z: -0.12, r: 0.3, ox: -5, oz: -1.15, yaw: Math.PI } },
    { name: 'Coffin Cup', par: 3, tee: { x: 0, z: 3.9 }, cup: { x: 0, z: -3.45 },
      course: { walls: [...box4(-6.5, -4.6, 6.5, 4.6), ...COFFIN.slice(0, -1).map((p, i) => seg(p[0], p[1], COFFIN[i + 1][0], COFFIN[i + 1][1], 0.5))], boxes: [stone(-2.6, 1.2), stone(2.6, 1.2), stone(0, -0.7, 0.42), stone(-4.2, -2.4), stone(4.2, -2.4)] },
      ghost: { x: 0, z: 1.0, ax: 4.4, az: 0.5, wx: 0.7, wz: 1.3, px: 0.6, pz: 0 }, coffin: true },
  ];
}

export function create({ rng, players, difficulty = 'normal' }) {
  const holes = holesFor(), puffCd = new Map();
  const hook = {
    step(H, t, dt, list, events) {
      if (H.ghost) {
        const g = ghostAt(H.ghost, t), g2 = ghostAt(H.ghost, t + dt), gvx = (g2.x - g.x) / dt, gvz = (g2.z - g.z) / dt;
        for (const { pid, s } of list) {
          const b = s.ball, cd = puffCd.get(pid) || 0;
          if (cd > 0) { puffCd.set(pid, cd - dt); continue; }
          if (b.still || b.in || b.gone) continue;
          const dx = b.x - g.x, dz = b.z - g.z, d = Math.hypot(dx, dz);
          if (d > GHOST_R + BALL_R || d < 1e-6) continue;
          // the puff: shoved straight out from the ghost, plus a bit of the ghost's own drift
          b.vx += dx / d * GHOST_PUFF + gvx * 0.4; b.vz += dz / d * GHOST_PUFF + gvz * 0.4;
          puffCd.set(pid, 0.8);
          events.push({ e: 'boo', pid, x: Math.round(b.x * 100) / 100, z: Math.round(b.z * 100) / 100 });
        }
      }
      if (H.tunnel) {
        const T = H.tunnel;
        for (const { pid, s } of list) {
          const b = s.ball; if (b.still || b.in || b.gone) continue;
          if (Math.hypot(b.x - T.x, b.z - T.z) > T.r || b.vz > 0) continue;   // only going in through the grin
          const sp = Math.min(6, Math.max(2.2, speedOf(b)));
          b.x = T.ox; b.z = T.oz; b.vx = Math.sin(T.yaw) * sp; b.vz = Math.cos(T.yaw) * sp;
          events.push({ e: 'tunnel', pid });
        }
      }
      if (H.coffin) {
        const open = lidOpen(difficulty, t);
        if (open !== H.cupOpen) { H.cupOpen = open; events.push({ e: open ? 'lidUp' : 'lidDown' }); }
        if (!H.savedCup) H.savedCup = H.course.cup;
        H.course.cup = open ? H.savedCup : null;
        H.course.dyn = open ? [] : [{ x: H.cup.x, z: H.cup.z, r: 0.5, e: 0.9 }];
      }
    },
    state(H, t) {
      const out = {};
      if (H.ghost) { const g = ghostAt(H.ghost, t); out.gh = [Math.round(g.x * 100) / 100, Math.round(g.z * 100) / 100]; }
      if (H.coffin) out.lid = H.cupOpen ? 1 : 0;
      return out;
    },
    init: () => ({ lid: LID[difficulty] || LID.normal }),
  };
  return createPuttMatch({ meta, rng, players, difficulty, holes, holeSeconds: 30, gap: 2.6, hook });
}
