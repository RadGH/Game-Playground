// FLOOD RUSH — a hilly fairground and the river has burst its banks. The water comes up in stages; between them it
// holds still for a few seconds. Get to higher ground and stay there:
//   hills      walk up them (the slope is no obstacle). The low ground between them floods first.
//   crates     A jumps (about a metre): enough to get up onto a crate, and from a crate onto a stall roof.
//              Too tall to step onto = solid, you walk round it.
//   planks     wooden bridges from hilltop to hilltop. B at the END of a plank knocks it down: whoever is still on the
//              far side has to wade (or swim) for it. B anywhere else shoves whoever is in front of you.
//   water      wading (water over your feet) slows you; once it is over your knees you are swept off in a rubber duck
//              ring and are out.
// Points: 1 a second you stay dry, the last one dry +10, and at the bell everyone still dry +3 per metre they stand
// above the water. Solo: score attack with medals.
//
// Heights: the sim owns them all. A body's y is the height it stands at; a crate or stall is solid ONLY while its top
// is more than STEP above your feet, so jumping up makes it walkable. The per-body arena handed to stepBody carries
// just the boxes that are solid for that body; the player's own phone mutates ctx.arena.blocks the same way from its
// last known y (view.js), so prediction and server agree.
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const HW = 10, HD = 7.5;
export const meta = {
  id: 'flood-rush', title: 'Flood Rush', blurb: 'The water is rising — race to higher ground, climb the crates and keep the others off your hill!',
  how: ['The water rises in stages: get to HIGH ground before it comes.', 'A jumps up onto crates and stall roofs.', 'B shoves — or, at the end of a plank bridge, knocks it down behind you.', 'Water over your knees = swept away. Last one dry wins!'],
  kind: 'arena', min: 1, max: 4, seconds: 74, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-flood-rush', css: true,
  controls: { stick: true, a: 'Jump', b: 'Shove' }, move: { speed: 5.2, accel: 26, stunDrag: 2.6, slowMul: 0.55 },
  arena: { shape: 'rect', hw: HW, hd: HD, wall: true }, pitch: 56,
};
export const RULES = {
  first: 4,                    // the first warning comes this long after GO
  warn: 2.5, rise: 2.2,        // each stage: a warning, then the water climbs to the next level over `rise` seconds
  hold: { easy: 6.5, normal: 5.6, hard: 4.8 },          // and holds still this long
  top: { easy: 2.5, normal: 2.95, hard: 3.3 },          // the last level (some roofs stay dry; the bell decides)
  stages: 6,
  step: 0.35, jumpV: 5.3, grav: 13,
  wade: 0.02, sweep: 0.42,     // water this far over your feet slows you / sweeps you away
  shoveCool: 1.1, shoveR: 1.35, shoveCone: 1.1, shovePush: 7.4, shoveStun: 0.4,
  plankR: 1.35,                // how close to a plank's end B knocks it down
  pts: { sec: 1, last: 10, perM: 3 },
  endAfter: 1.4, medals: [45, 60, 72],
};
const r2 = v => Math.round(v * 100) / 100;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Height of the hills at (x, z). */
export function groundAt(hills, x, z) {
  let h = 0;
  for (const H of hills) { const u = 1 - Math.hypot(x - H.x, z - H.z) / H.r; if (u > 0) h = Math.max(h, H.h * smooth(0, 0.42, u)); }
  return h;
}
const inBox = (o, x, z, m = 0) => Math.abs(x - o.x) <= o.hw + m && Math.abs(z - o.z) <= o.hd + m;
/** Where a point lies along a plank: { t, d } (t 0..1 from end a, d sideways distance). */
function alongPlank(p, x, z) {
  const ex = p.bx - p.ax, ez = p.bz - p.az, L = ex * ex + ez * ez;
  const t = Math.max(0, Math.min(1, ((x - p.ax) * ex + (z - p.az) * ez) / L));
  return { t, d: Math.hypot(x - (p.ax + ex * t), z - (p.az + ez * t)) };
}
/** The fairground from the seed: hills with flat tops, stalls on some tops, crates (one beside each stall, so every roof
 *  can be climbed), and plank bridges between nearby hilltops. */
export function makeLayout(rng) {
  const hills = [];
  const want = [[2.3, 2.6], [1.5, 1.9], [1.5, 1.9], [0.9, 1.3], [0.9, 1.3]];
  for (let t = 0; t < 900 && hills.length < want.length; t++) {
    const [lo, hi] = want[hills.length], r = r2(rng.range(3.0, 3.8)), x = r2(rng.range(-HW + r * 0.7, HW - r * 0.7)), z = r2(rng.range(-HD + r * 0.7, HD - r * 0.7));
    if (hills.some(H => Math.hypot(H.x - x, H.z - z) < (H.r + r) * 0.8)) continue;
    hills.push({ x, z, r, h: r2(rng.range(lo, hi)) });
  }
  const boxes = [];
  const free = (x, z, hw, hd) => Math.abs(x) + hw < HW - 0.3 && Math.abs(z) + hd < HD - 0.3 && boxes.every(o => Math.abs(o.x - x) > o.hw + hw + 0.5 || Math.abs(o.z - z) > o.hd + hd + 0.5);
  // stalls on the three biggest hills' tops, each with a crate against one side
  hills.slice(0, 3).forEach((H, i) => {
    const sw = 0.95, sd = 0.75, side = rng.int(0, 3), cw = 0.48, off = [[sw + cw + 0.05, 0], [-(sw + cw + 0.05), 0], [0, sd + cw + 0.05], [0, -(sd + cw + 0.05)]][side];
    const sx = r2(H.x - off[0] * 0.5), sz = r2(H.z - off[1] * 0.5);                        // stall and crate share the flat top
    if (!free(sx, sz, sw, sd) || !free(sx + off[0], sz + off[1], cw, cw)) return;
    const st = { id: boxes.length, k: 'stall', x: sx, z: sz, hw: sw, hd: sd, top: r2(H.h + 1.45) }; boxes.push(st);
    const cx = r2(sx + off[0]), cz = r2(sz + off[1]);
    boxes.push({ id: boxes.length, k: 'crate', x: cx, z: cz, hw: cw, hd: cw, top: r2(groundAt(hills, cx, cz) + 0.8) });
    void i;
  });
  // a few loose crates on the slopes and the flat
  for (let t = 0; t < 200 && boxes.length < 10; t++) {
    const x = r2(rng.range(-HW + 1, HW - 1)), z = r2(rng.range(-HD + 1, HD - 1)), cw = 0.48;
    if (!free(x, z, cw, cw)) continue;
    boxes.push({ id: boxes.length, k: 'crate', x, z, hw: cw, hd: cw, top: r2(groundAt(hills, x, z) + 0.8) });
  }
  // planks: between hill pairs whose tops are close, edge of one flat top to the edge of the other
  const planks = [];
  for (let i = 0; i < hills.length; i++) for (let j = i + 1; j < hills.length; j++) {
    const A = hills[i], B = hills[j], d = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / d, uz = (B.z - A.z) / d;
    const ax = A.x + ux * A.r * 0.48, az = A.z + uz * A.r * 0.48, bx = B.x - ux * B.r * 0.48, bz = B.z - uz * B.r * 0.48;
    const len = Math.hypot(bx - ax, bz - az);
    if (len > 6.5 || planks.length >= 3) continue;
    const p = { id: planks.length, ax: r2(ax), az: r2(az), bx: r2(bx), bz: r2(bz), ah: r2(groundAt(hills, ax, az)), bh: r2(groundAt(hills, bx, bz)), up: true };
    if (boxes.some(o => [0.2, 0.5, 0.8].some(t => inBox(o, ax + (bx - ax) * t, az + (bz - az) * t, 0.5)))) continue;
    planks.push(p);
  }
  return { hills, boxes, planks };
}
/** What a body at (x, z) with its feet at y stands on: the hills, a box top or a plank within a step of y. */
export function supportAt(L, x, z, y) {
  let h = groundAt(L.hills, x, z);
  for (const o of L.boxes) if (o.top <= y + RULES.step && o.top > h && inBox(o, x, z, 0.12)) h = o.top;
  for (const p of L.planks) {
    if (!p.up) continue; const a = alongPlank(p, x, z); if (a.d > 0.5) continue;
    const ph = p.ah + (p.bh - p.ah) * a.t + 0.12; if (ph <= y + RULES.step && ph > h) h = ph;
  }
  return h;
}
/** The boxes that are walls for feet at y (their tops are too high to step on). */
export const solidFor = (boxes, y) => boxes.filter(o => o.top > y + RULES.step).map(o => ({ x: o.x, z: o.z, hw: o.hw, hd: o.hd }));
/** The water's level at time t (seconds since GO) and the stage list, from the difficulty. */
export function makeSchedule(difficulty) {
  const D = RULES.hold[difficulty] ? difficulty : 'normal', top = RULES.top[D], out = [];
  let t = RULES.first, lv = 0;
  for (let s = 0; s < RULES.stages; s++) {
    const to = r2(0.35 + (top - 0.35) * (s / (RULES.stages - 1)) ** 0.9);
    out.push({ warn: r2(t), rise: r2(t + RULES.warn), done: r2(t + RULES.warn + RULES.rise), from: lv, to });
    lv = to; t += RULES.warn + RULES.rise + RULES.hold[D];
  }
  return out;
}
export function waterAt(sched, t) {
  let lv = 0;
  for (const s of sched) { if (t < s.rise) break; lv = t >= s.done ? s.to : s.from + (s.to - s.from) * smooth(0, 1, (t - s.rise) / (s.done - s.rise)); }
  return lv;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.hold[difficulty] ? difficulty : 'normal', n = players.length, solo = n === 1;
  const L = makeLayout(rng), sched = makeSchedule(D);
  const bodies = new Map(), events = [];
  // everyone starts on the flat ground along the bottom edge, which floods first
  players.forEach((p, i) => bodies.set(p.pid, makeBody(r2(n === 1 ? 0 : -4 + i * 8 / (n - 1)), HD - 1.2, Math.PI)));
  for (const b of bodies.values()) b.y = r2(groundAt(L.hills, b.x, b.z));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, vy: 0, air: false, cool: 0, stun: 0, out: false, outAt: -1, dry: 0, bonus: 0, drift: [0, 0] }]));
  let el = 0, time = meta.seconds - 2, over = false, endIn = -1, stage = -1;
  const live = pid => !P.get(pid).out;
  const level = () => waterAt(sched, el);
  const points = pid => { const s = P.get(pid); return Math.floor(s.dry + 1e-6) * RULES.pts.sec + s.bonus; };
  function sweep(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.out = true; s.outAt = el; s.air = false; b.flags = (b.flags & ~(F.AIR | F.SLOW | F.STUN)) | F.OUT; b.vx = b.vz = 0;
    const ex = Math.abs(b.x) / HW > Math.abs(b.z) / HD ? Math.sign(b.x) || 1 : 0, ez = ex ? 0 : Math.sign(b.z) || 1;
    s.drift = [ex * 1.1, ez * 1.1];
    events.push({ e: 'swept', pid, x: r2(b.x), z: r2(b.z) });
  }
  function finish() {
    const dry = players.filter(p => live(p.pid)), wl = level();
    if (!solo && dry.length === 1) P.get(dry[0].pid).bonus += RULES.pts.last;
    if (time <= 0 || solo || dry.length > 1) for (const p of dry) P.get(p.pid).bonus += Math.round(Math.max(0, bodies.get(p.pid).y - wl) * RULES.pts.perM);
    endIn = RULES.endAfter;
    for (const [pid, b] of bodies) if (live(pid)) { b.flags = (b.flags & ~(F.AIR | F.SLOW)) | F.FROZEN; b.vx = b.vz = 0; }
    events.push({ e: 'end', win: !solo && dry.length === 1 ? dry[0].pid : null, dry: dry.map(p => p.pid), wl: r2(wl) });
  }
  return {
    bodies, events,
    init: () => ({ arena: { ...meta.arena, blocks: solidFor(L.boxes, 0) }, solo, hills: L.hills, boxes: L.boxes, planks: L.planks.map(p => ({ ...p, up: undefined })), sched, medals: RULES.medals, step: RULES.step, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      const ready = !s.out && !(b.flags & F.STUN) && endIn < 0;
      if (pa && ready && !s.air) { s.air = true; s.vy = RULES.jumpV; b.flags |= F.AIR; events.push({ e: 'jump', pid }); }
      if (pb && ready && s.cool <= 0) {
        s.cool = RULES.shoveCool;
        // a plank end right here? knock it down
        const pl = L.planks.find(p => p.up && Math.min(Math.hypot(b.x - p.ax, b.z - p.az), Math.hypot(b.x - p.bx, b.z - p.bz)) <= RULES.plankR);
        if (pl) { pl.up = false; events.push({ e: 'plank', pid, id: pl.id }); }
        else {
          let near = null, nd = 99;
          for (const [qid, c] of bodies) { if (qid === pid || !live(qid)) continue; const d = Math.hypot(c.x - b.x, c.z - b.z); if (d <= RULES.shoveR + 0.3 && d < nd) { nd = d; near = c; } }
          if (near) b.yaw = Math.atan2(near.x - b.x, near.z - b.z);
          const hit = [];
          for (const [qid, c] of bodies) {
            if (qid === pid || !live(qid)) continue;
            const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz); let da = Math.atan2(dx, dz) - b.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
            if (d > RULES.shoveR || da > RULES.shoveCone || Math.abs(c.y - b.y) > 1.2) continue;
            const q = P.get(qid); c.vx = dx / (d || 1) * RULES.shovePush; c.vz = dz / (d || 1) * RULES.shovePush; c.flags |= F.STUN; q.stun = RULES.shoveStun; hit.push(qid);
          }
          events.push({ e: 'shove', pid, hit });
        }
      }
      if (s.out) return;
      const wl = level();
      if (!s.air && wl > b.y + RULES.wade) b.flags |= F.SLOW; else b.flags &= ~F.SLOW;
      stepBody(b, inp, meta.move, { ...meta.arena, blocks: solidFor(L.boxes, b.y) });
    },
    step(dt) {
      if (over) return;
      const drift = () => { for (const [pid, b] of bodies) { const s = P.get(pid); if (!s.out) continue; b.x = r2(Math.max(-HW - 2, Math.min(HW + 2, b.x + s.drift[0] * dt))); b.z = r2(Math.max(-HD - 2, Math.min(HD + 2, b.z + s.drift[1] * dt))); b.y = r2(level() - 0.35); } };
      if (endIn >= 0) { endIn -= dt; drift(); if (endIn <= 0) over = true; return; }
      el += dt; time -= dt;
      const si = sched.findIndex(s => el - dt < s.warn && el >= s.warn);
      if (si >= 0 && si !== stage) { stage = si; events.push({ e: 'warn', st: si, to: sched[si].to, last: si === sched.length - 1 }); }
      separate([...bodies].filter(([pid]) => live(pid)).map(([, b]) => b));
      const wl = level();
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.cool > 0) s.cool -= dt;
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.out) continue;
        const sup = supportAt(L, b.x, b.z, b.y);
        if (s.air) {
          s.vy -= RULES.grav * dt; b.y += s.vy * dt;
          if (s.vy < 0 && b.y <= supportAt(L, b.x, b.z, b.y - s.vy * dt)) { b.y = supportAt(L, b.x, b.z, b.y - s.vy * dt); s.air = false; s.vy = 0; b.flags &= ~F.AIR; events.push({ e: 'land', pid }); }
        } else if (sup < b.y - 0.06) { s.air = true; s.vy = 0; b.flags |= F.AIR; }               // walked off an edge: fall
        else b.y = sup;
        b.y = r2(b.y);
        if (!s.air && wl > b.y + RULES.sweep) { sweep(pid); continue; }
        s.dry += dt;
      }
      drift();
      const left = players.filter(p => live(p.pid)).length;
      if ((!solo && left <= 1) || left === 0 || time <= 0) { time = Math.max(0, time); finish(); }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = points(p.pid);
      const st = sched.findIndex(s => el < s.done), S = sched[st];
      // ph: 'hold' | 'warn' | 'rise'; nx: seconds to the next change
      let ph = 'hold', nx = -1;
      if (S) { if (el < S.warn) { ph = 'hold'; nx = Math.ceil(S.warn - el); } else if (el < S.rise) { ph = 'warn'; nx = Math.ceil(S.rise - el); } else { ph = 'rise'; nx = 0; } }
      return { sc, wl: r2(level()), ph, nx, st, pk: L.planks.filter(p => !p.up).map(p => p.id), o: players.filter(p => P.get(p.pid).out).map(p => p.pid), left: Math.ceil(Math.max(0, time)) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { scores[p.pid] = points(p.pid); const k = scores[p.pid]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit, ...(solo ? { medal: RULES.medals.filter(m => scores[players[0].pid] >= m).length } : {}) };
    },
    get _el() { return el; }, _L: L, _P: P, _sched: sched, get _level() { return level(); },
  };
}

/** A sensible player, for the tests: heads for the highest spot it can reach (a stall roof via its crate, else a crate,
 *  else a hilltop) and climbs it; knocks a plank down behind it; shoves anyone sharing its roof. skill 0..1: high =
 *  goes for the roofs at once, low = waits until its feet are wet and walks to the nearest hill. Returns { mx, mz, b }. */
const BOT = new WeakMap();
export function floodBot(g, pid, skill = 1, tick = 0) {
  const b = g.bodies.get(pid), s = g._P.get(pid); if (!b || s.out) return { mx: 0, mz: 0, b: 0 };
  const L = g._L, wl = g._level, mem = BOT.get(s) || {}; BOT.set(s, mem);
  const go = (x, z, k = 1) => { const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz) || 1; return d < 0.2 ? { mx: 0, mz: 0 } : { mx: dx / d * k, mz: dz / d * k }; };
  const others = [...g.bodies.entries()].filter(([q]) => q !== pid && !g._P.get(q).out).map(([, c]) => c);
  // the plan: a list of [x, z, top] to stand on, highest last
  if (!mem.plan) {
    if (skill > 0.5) {
      const roofs = L.boxes.filter(o => o.k === 'stall').sort((a, c) => c.top - a.top);
      const pick = roofs[(pid + Math.floor(skill * 3)) % Math.max(1, roofs.length)] || roofs[0];
      const step = pick && L.boxes.find(o => o.k === 'crate' && Math.abs(o.x - pick.x) <= pick.hw + o.hw + 0.2 && Math.abs(o.z - pick.z) <= pick.hd + o.hd + 0.2);
      mem.plan = pick && step ? [[step.x, step.z, step.top, step], [pick.x, pick.z, pick.top, pick]] : [];
    } else {
      const H = [...L.hills].sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z))[0];
      mem.plan = H ? [[H.x + (pid % 2 ? 0.6 : -0.6), H.z, H.h, null]] : [];
    }
    mem.i = 0;
  }
  const wet = wl > b.y - 0.15 || g._el > 9;
  if (skill <= 0.5 && !wet) return { mx: 0, mz: 0, b: 0 };
  let bits = 0;
  // shove someone sharing our spot
  if (skill > 0.5 && !s.air && others.some(c => Math.hypot(c.x - b.x, c.z - b.z) < 1.2 && Math.abs(c.y - b.y) < 0.3) && tick % 3 === 0) bits |= IN.B;
  const step = mem.plan[mem.i];
  if (!step) return { mx: 0, mz: 0, b: bits };
  const [tx, tz, top, box] = step;
  if (Math.abs(b.y - top) < 0.2 && box && inBox(box, b.x, b.z, 0)) { if (mem.i < mem.plan.length - 1) mem.i++; const m = go(tx, tz, 0.5); return { ...m, b: bits }; }
  if (!box) return { ...go(tx, tz), b: bits };
  const m = go(tx, tz);
  // next to it and too high to step on: jump
  const near = inBox(box, b.x, b.z, 0.75) && top > b.y + RULES.step;
  if (near && !s.air && tick % 2 === 0) bits |= IN.A;
  return { ...m, b: bits };
}
