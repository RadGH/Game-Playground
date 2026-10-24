// WITCH'S SWEEP (Halloween only) — a round moonlit courtyard round a bubbling cauldron that keeps spitting candy onto
// the cobbles: walk over a sweet to grab it (a lollipop is worth 3). The catch: the witch's giant enchanted BROOM is
// sweeping the floor, round and round the cauldron like the hand of a clock, from the cauldron out to the wall. Press
// A to JUMP it as it comes. Caught on the ground and you are swept along, dizzy, and you drop up to two sweets for
// anyone to grab. The broom speeds up, sometimes stops and swings back the other way (it shakes and the ring flashes
// first), and later in the game a second broom joins in on the far side. Most candy wins. Solo: medal scores to beat.
//
// The broom is a pure function of the game clock (angle + speed table built at the start from the seed), so a test
// can say exactly when it passes any spot. A jump is 0.62 s in the air; the arm is thin, so a jump timed anywhere in
// the half second before it reaches you clears it.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'witchs-sweep', title: "Witch's Sweep", blurb: 'Grab the candy and JUMP the giant sweeping broom!',
  how: ['Walk over candy to grab it. Lollipops are worth 3!', 'The witch\'s broom sweeps round and round. Press A to JUMP it!', 'Swept up? You drop candy. It can swing back the other way!'],
  kind: 'arena', min: 1, max: 4, seconds: 62, scoring: 'points', unit: 'candy', tags: ['action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Jump' }, move: { speed: 5.4, accel: 24, stunDrag: 2.2 },
  arena: { shape: 'circle', r: 8, wall: true, posts: [{ x: 0, z: 0, r: 1.1 }] }, pitch: 60, card: 'card-witchs-sweep', css: true,
};

export const RULES = {
  hub: 1.1, reach: 8, armHalf: 0.42,                // the broom: from the cauldron's rim out to the wall, this thick each side
  jumpTime: 0.62, jumpH: 1.1, jumpCool: 0.15,
  pick: 0.75, land: 0.45, big: 0.12, bigPts: 3,
  dropEvery: n => 2.0 - 0.15 * n, dropN: [2, 3], dropR: [1.9, 7.1], maxCandy: n => 10 + 3 * n,
  // the broom's speed (rad/s) climbs from w0 to w1 over the game; a reverse every `flip` seconds (warned `warn` first)
  w0: { easy: 0.85, normal: 1.05, hard: 1.25 }, w1: { easy: 1.3, normal: 1.65, hard: 2.0 },
  flip: { easy: [14, 20], normal: [10, 15], hard: [7, 11] }, warn: 1.0, stop: 0.5,
  second: { easy: 999, normal: 32, hard: 22 },      // a second broom on the far side from this many seconds in
  firstSweep: 2.5,                                  // the broom starts still, opposite the players, and gets going after this
  daze: 1.0, safe: 1.6, spill: 2, spillWait: 0.6, push: 6.5,
  medals: { easy: [20, 38, 56], normal: [18, 34, 50], hard: [16, 30, 44] },
};
const r2 = v => Math.round(v * 100) / 100, TAU = Math.PI * 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** The broom's plan from the seed: where it flips direction. -> { flips: [[time, warnFrom]], D } */
export function makePlan(rng, difficulty = 'normal') {
  const D = RULES.w0[difficulty] ? difficulty : 'normal', flips = [];
  let t = RULES.firstSweep + rng.range(...RULES.flip[D]);
  while (t < meta.seconds) { flips.push(r2(t)); t += rng.range(...RULES.flip[D]); }
  return { D, flips, a0: r2(rng.range(0, TAU)), dir0: rng.chance(0.5) ? 1 : -1 };
}
/** The broom at game time t (seconds since the start): { a: angle of the arm, w: signed angular speed, warn: true while it is about to flip }. */
export function broomAt(plan, t) {
  const { D, flips } = plan;
  const speed = s => RULES.w0[D] + (RULES.w1[D] - RULES.w0[D]) * Math.min(1, s / meta.seconds);
  // integrate the angle: speed ramps, direction flips (with a short stop around each flip)
  let a = plan.a0, dir = plan.dir0, from = RULES.firstSweep;
  if (t < from) return { a, w: 0, warn: false };
  const step = 0.05;
  let s = from;
  for (const f of [...flips, Infinity]) {
    const end = Math.min(t, f - RULES.stop / 2);
    for (; s < end - 1e-9; s += step) { const ds = Math.min(step, end - s); a += dir * speed(s) * ds; }
    if (t < f + RULES.stop / 2) {
      const warn = t >= f - RULES.warn - RULES.stop / 2;
      return { a: wrap(a), w: t < f - RULES.stop / 2 ? dir * speed(t) : 0, warn };
    }
    s = f + RULES.stop / 2; dir = -dir;
  }
  return { a: wrap(a), w: dir * speed(t), warn: false };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const plan = makePlan(rng, difficulty), D = plan.D;
  const n = players.length, solo = n === 1, bodies = new Map(), R = meta.arena.r;
  // start on the side away from the broom
  const spawns = spawnRing(n, solo ? 4 : 4.4, plan.a0 + Math.PI - (n - 1) * 0.35);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, candy: 0, air: 0, jumpCool: 0, daze: 0, safe: 0, hits: 0, jumps: 0 }]));
  let candy = [], cid = 0, dropIn = 1.0, el = 0, time = meta.seconds, over = false, prevArms = null, flipWarned = -1;
  const events = [];
  const arms = t => { const b = broomAt(plan, t); const out = [b.a]; if (t >= RULES.second[D]) out.push(wrap(b.a + Math.PI)); return { list: out, w: b.w, warn: b.warn }; };
  function addCandy(x, z, kind, wait, fromX = 0, fromZ = 0) {
    let d = Math.hypot(x, z); const lim = R - 0.6;
    if (d > lim) { x *= lim / d; z *= lim / d; d = lim; }
    if (d < RULES.hub + 0.6) { const a = Math.atan2(x, z); x = Math.sin(a) * (RULES.hub + 0.7); z = Math.cos(a) * (RULES.hub + 0.7); }
    const c = { id: ++cid, x: r2(x), z: r2(z), kind, wait, fx: r2(fromX), fz: r2(fromZ) }; candy.push(c); return c;
  }
  /** Did the arm cross the point (x, z) between angles a0 and a1 (or does it lie on it now)? */
  function swept(a0, a1, x, z) {
    const d = Math.hypot(x, z); if (d < RULES.hub - 0.2 || d > RULES.reach + 0.5) return false;
    const phi = Math.atan2(x, z), half = Math.atan2(RULES.armHalf, Math.max(0.5, d));
    const e0 = wrap(phi - a0), e1 = wrap(phi - a1);
    if (Math.abs(e1) <= half) return true;
    return Math.sign(e0) !== Math.sign(e1) && Math.abs(e0) < 1.2 && Math.abs(e1) < 1.2;     // crossed it this step
  }
  return {
    bodies, events,
    init: () => ({ plan, solo, medals: solo ? RULES.medals[D] : null, second: RULES.second[D], left: Math.ceil(time), jump: RULES.jumpTime }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.air <= 0 && s.jumpCool <= 0 && s.daze <= 0) { s.air = RULES.jumpTime; s.jumps++; b.flags |= F.AIR; events.push({ e: 'jump', pid }); }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      const t0 = el; el += dt; time -= dt;
      separate([...bodies.values()]);
      for (const b of bodies.values()) { const d = Math.hypot(b.x, b.z), lim = R - 0.45; if (d > lim) { b.x *= lim / d; b.z *= lim / d; } }
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.jumpCool > 0) s.jumpCool -= dt;
        if (s.air > 0) { s.air -= dt; const k = 1 - Math.max(0, s.air) / RULES.jumpTime; b.y = r2(Math.sin(k * Math.PI) * RULES.jumpH); if (s.air <= 0) { s.air = 0; b.y = 0; b.flags &= ~F.AIR; s.jumpCool = RULES.jumpCool; } }
        if (s.safe > 0) { s.safe -= dt; if (s.safe <= 0) b.flags &= ~F.GHOST; }
        if (s.daze > 0) { s.daze -= dt; if (s.daze <= 0) b.flags &= ~F.STUN; }
        if (s.daze <= 0) for (const c of candy) if (c.wait <= 0 && Math.hypot(c.x - b.x, c.z - b.z) < RULES.pick + (s.air > 0 ? 0.15 : 0)) {
          c.taken = true; const add = c.kind ? RULES.bigPts : 1; s.candy += add;
          events.push({ e: 'grab', pid, id: c.id, add, x: c.x, z: c.z });
        }
        candy = candy.filter(c => !c.taken);
      }
      for (const c of candy) if (c.wait > 0) c.wait -= dt;
      // the cauldron bubbles candy out
      dropIn -= dt;
      if (dropIn <= 0 && candy.length < RULES.maxCandy(n)) {
        dropIn = RULES.dropEvery(n);
        const k = rng.int(RULES.dropN[0], RULES.dropN[1]), ids = [];
        for (let i = 0; i < k; i++) { const a = rng.range(0, TAU), r = rng.range(RULES.dropR[0], RULES.dropR[1]); ids.push(addCandy(Math.sin(a) * r, Math.cos(a) * r, rng.chance(RULES.big) ? 1 : 0, RULES.land).id); }
        events.push({ e: 'burst', ids });
      }
      // the broom(s)
      const now = arms(el), was = prevArms || arms(t0); prevArms = now;
      if (now.warn) { const f = plan.flips.find(x => Math.abs(x - el) < RULES.warn + RULES.stop); if (f != null && f !== flipWarned) { flipWarned = f; events.push({ e: 'flip' }); } }
      if (now.list.length > was.list.length) events.push({ e: 'second' });
      for (let k = 0; k < now.list.length; k++) {
        const a0 = was.list[k] ?? now.list[k], a1 = now.list[k];
        for (const [pid, b] of bodies) {
          const s = P.get(pid);
          if (s.air > 0 || s.safe > 0 || s.daze > 0 || !swept(a0, a1, b.x, b.z)) continue;
          // swept up: shoved along the way the broom turns and outward, dizzy, spill candy
          const dir = Math.sign(now.w || (a1 - a0) || 1), d = Math.hypot(b.x, b.z) || 1, ox = b.x / d, oz = b.z / d;
          const tx = oz * dir, tz = -ox * dir;      // tangent of the arm's motion (d/da of (sin a, cos a))
          b.vx = (tx * 0.8 + ox * 0.5) * RULES.push; b.vz = (tz * 0.8 + oz * 0.5) * RULES.push;
          s.daze = RULES.daze; s.safe = RULES.daze + RULES.safe; s.hits++; b.flags |= F.STUN | F.GHOST;
          const lose = Math.min(RULES.spill, s.candy); s.candy -= lose; const ids = [];
          for (let i = 0; i < lose; i++) { const a = rng.range(0, TAU); ids.push(addCandy(b.x + Math.sin(a) * 1.6, b.z + Math.cos(a) * 1.6, 0, RULES.spillWait, b.x, b.z).id); }
          events.push({ e: 'swept', pid, lose, ids, x: r2(b.x), z: r2(b.z) });
        }
      }
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags = (b.flags & ~F.AIR) | F.FROZEN; b.y = 0; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).candy;
      const A = arms(el);
      return { sc, left: Math.ceil(time), el: r2(el), br: A.list.map(r2), w: r2(A.w), fw: A.warn ? 1 : 0, c: candy.map(c => [c.id, c.x, c.z, c.kind, c.wait > 0 ? 1 : 0, c.fx, c.fz]) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = P.get(p.pid).candy; scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get candy() { return candy; }, get el() { return el; }, arms, plan, player: pid => P.get(pid),
  };
}
