// BAT SWARM (Halloween) — a moonlit courtyard with a big pumpkin piñata hanging in the middle that keeps bursting
// candy onto the cobbles: walk over a sweet to grab it (a lollipop is worth 3). Every few seconds a flock of cute
// bats swoops across in a FORMATION — a lane, a column, a wall with one gap, a cross — and the ground shows exactly
// where first (glowing purple stripes with arrows, a countdown). Get out of the stripe (or into the gap)! A bat that
// touches you makes you dizzy for a moment and you drop up to two sweets for anyone to grab. A = a quick dash.
// Most candy wins. Solo: the same courtyard with medal scores to beat.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'bat-swarm', title: 'Bat Swarm', blurb: 'Grab the piñata candy and dodge the swooping bat flocks!',
  how: ['Walk over candy to grab it. Lollipops are worth 3!', 'Purple stripes = bats coming that way. Get out!', 'A wall of bats? Find the gap.', 'A bat bump makes you drop candy. A = dash.'],
  kind: 'arena', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'candy', tags: ['action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Dash' }, move: { speed: 5.6, accel: 26, stunDrag: 2.6 },
  arena: { shape: 'rect', hw: 8, hd: 6, wall: true, posts: [{ x: 0, z: 0, r: 0.6 }, { x: -2.4, z: -0.9, r: 0.18 }, { x: 2.4, z: -0.9, r: 0.18 }] }, pitch: 58, card: 'card-bat-swarm', css: true,   // posts: the piñata's spot + the arch's two poles
};

export const RULES = {
  pick: 0.75, land: 0.45, big: 0.12, bigPts: 3,
  dropEvery: n => 2.3 - 0.2 * n, dropN: [2, 3], dropR: [1.4, 5],
  waveEvery: { easy: 5.2, normal: 4.4, hard: 3.6 }, waveFirst: 3.0, waveFaster: 0.25,   // a little quicker every wave, to a floor of 60%
  warn: { easy: 2.0, normal: 1.6, hard: 1.25 }, batSpeed: { easy: 6, normal: 7.5, hard: 9 },
  band: 1.35, gap: 1.5, batR: 0.62,
  kinds: { easy: ['lane', 'column', 'double', 'comb'], normal: ['lane', 'column', 'double', 'wall', 'cross', 'comb', 'gate', 'frame'], hard: ['lane', 'column', 'double', 'wall', 'cross', 'wall2', 'comb', 'gate', 'frame'] },
  // round 12 formations: comb = three columns at once (stand between them), gate = a wall flying down the courtyard with one
  // gap COLUMN, frame = a flock along all four edges at once (the middle is safe)
  daze: 1.2, safe: 1.9, spill: 2, spillWait: 0.6,
  dashCool: 1.5, dashSpeed: 11, dashTime: 0.2,
  medals: { easy: [20, 35, 50], normal: [20, 35, 50], hard: [15, 26, 38] },
};
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

export function create({ rng, players, difficulty = 'normal' }) {
  const D = RULES.warn[difficulty] ? difficulty : 'normal';
  const n = players.length, solo = n === 1, bodies = new Map(), { hw, hd } = meta.arena, spawns = spawnRing(n, solo ? 3 : 3.6);
  players.forEach((p, i) => bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)));
  const P = new Map(players.map(p => [p.pid, { prevB: 0, candy: 0, daze: 0, safe: 0, dash: 0, dashCool: 0, hits: 0 }]));
  let candy = [], cid = 0, waves = [], wid = 0, bats = [], dropIn = 1.2, waveIn = RULES.waveFirst, el = 0, time = meta.seconds, over = false, wavesDone = 0;
  const events = [];
  function addCandy(x, z, kind, wait, fromX = 0, fromZ = 0) {
    x = Math.max(-hw + 0.5, Math.min(hw - 0.5, x)); z = Math.max(-hd + 0.5, Math.min(hd - 0.5, z));
    if (Math.hypot(x, z) < 0.9) { const a = Math.atan2(x, z) || 1; x = Math.sin(a) * 1.0; z = Math.cos(a) * 1.0; }
    const c = { id: ++cid, x: r2(x), z: r2(z), kind, wait, fx: r2(fromX), fz: r2(fromZ) }; candy.push(c); return c;
  }
  /** Lay out a formation: danger rectangles (shown first) and the bats that will sweep them. */
  function makeWave() {
    const kind = rng.pick(RULES.kinds[D]), speed = RULES.batSpeed[D], warn = RULES.warn[D], B = RULES.band;
    const rects = [], list = [];
    const lane = (zc, dir) => {           // a band along x at z = zc, flying in +x (dir 1) or -x
      rects.push([0, r2(zc), hw, B, dir, 0]);
      for (let row = -1; row <= 1; row++) for (let c = 0; c < 4; c++) list.push({ x: -dir * (hw + 1.2 + c * 1.1 + (row & 1) * 0.5), z: zc + row * B * 0.66, vx: dir * speed, vz: 0 });
    };
    const column = (xc, dir) => {
      rects.push([r2(xc), 0, B, hd, 0, dir]);
      for (let row = -1; row <= 1; row++) for (let c = 0; c < 4; c++) list.push({ x: xc + row * B * 0.66, z: -dir * (hd + 1.2 + c * 1.1 + (row & 1) * 0.5), vx: 0, vz: dir * speed });
    };
    const wall = (g, dir) => {            // the whole courtyard except a gap row at z = g, sweeping along x
      const lo = g - RULES.gap, hi = g + RULES.gap;
      if (lo > -hd) rects.push([0, r2((-hd + lo) / 2), hw, r2((lo + hd) / 2), dir, 0]);
      if (hi < hd) rects.push([0, r2((hi + hd) / 2), hw, r2((hd - hi) / 2), dir, 0]);
      for (let z = -hd + 0.4; z <= hd - 0.4; z += 0.75) if (z < lo || z > hi) for (let c = 0; c < 2; c++) list.push({ x: -dir * (hw + 1.2 + c * 1.0 + ((z * 4) & 1) * 0.4), z, vx: dir * speed * 0.85, vz: 0 });
    };
    const wallZ = (g, dir) => {           // the same wall turned round: everything except a gap column at x = g, sweeping along z
      const lo = g - RULES.gap, hi = g + RULES.gap;
      if (lo > -hw) rects.push([r2((-hw + lo) / 2), 0, r2((lo + hw) / 2), hd, 0, dir]);
      if (hi < hw) rects.push([r2((hi + hw) / 2), 0, r2((hw - hi) / 2), hd, 0, dir]);
      for (let x = -hw + 0.4; x <= hw - 0.4; x += 0.75) if (x < lo || x > hi) for (let c = 0; c < 2; c++) list.push({ x, z: -dir * (hd + 1.2 + c * 1.0 + ((x * 4) & 1) * 0.4), vx: 0, vz: dir * speed * 0.85 });
    };
    const zc = () => rng.range(-hd + B + 0.3, hd - B - 0.3), xc = () => rng.range(-hw + B + 0.5, hw - B - 0.5), dir = () => (rng.chance(0.5) ? 1 : -1);
    if (kind === 'lane') lane(zc(), dir());
    else if (kind === 'column') column(xc(), dir());
    else if (kind === 'double') { const a = rng.range(-hd + B + 0.3, -0.4 - B * 0.2), b = rng.range(0.4 + B * 0.2, hd - B - 0.3); lane(a, dir()); lane(b, dir()); }
    else if (kind === 'cross') { lane(zc(), dir()); column(xc(), dir()); }
    else if (kind === 'wall') wall(rng.range(-hd + 1.8, hd - 1.8), dir());
    else if (kind === 'comb') { const d = dir(), off = rng.range(-1, 1); for (const x of [-hw * 0.62, 0, hw * 0.62]) column(Math.max(-hw + B + 0.5, Math.min(hw - B - 0.5, x + off)), d); }
    else if (kind === 'gate') wallZ(rng.range(-hw + 2.2, hw - 2.2), dir());
    else if (kind === 'frame') { const d = dir(); lane(-hd + B, d); lane(hd - B, -d); column(-hw + B + 0.2, -d); column(hw - B - 0.2, d); }
    else { wall(rng.range(-hd + 1.8, hd - 1.8), dir()); column(xc(), dir()); }   // wall2: a wall and a column at once
    const w = { id: ++wid, kind, rects, warn, bats: list.map(b => ({ ...b, x: r2(b.x), z: r2(b.z) })) };
    return w;
  }
  return {
    bodies, events,
    init: () => ({ solo, batSpeed: RULES.batSpeed[D], medals: solo ? RULES.medals[D] : null, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A); s.prevB = bits;
      if (pa && s.daze <= 0 && s.dashCool <= 0) {
        let mx = +inp?.mx || 0, mz = +inp?.mz || 0; const m = Math.hypot(mx, mz);
        if (m > 0.2) { mx /= m; mz /= m; } else { mx = Math.sin(b.yaw); mz = Math.cos(b.yaw); }
        // a dash: a short burst in a straight line (the STUN flag, which the phone's own prediction also sees)
        s.dashCool = RULES.dashCool; s.dash = RULES.dashTime; b.flags |= F.STUN; b.vx = mx * RULES.dashSpeed; b.vz = mz * RULES.dashSpeed; b.yaw = Math.atan2(mx, mz);
        events.push({ e: 'dash', pid });
      }
      stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      el += dt; time -= dt;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const s = P.get(pid);
        if (s.dashCool > 0) s.dashCool -= dt;
        if (s.safe > 0) { s.safe -= dt; if (s.safe <= 0) b.flags &= ~F.GHOST; }
        if (s.dash > 0) { s.dash -= dt; if (s.dash <= 0 && s.daze <= 0) b.flags &= ~F.STUN; }
        if (s.daze > 0) { s.daze -= dt; if (s.daze <= 0) b.flags &= ~F.STUN; }
        // grab candy
        if (s.daze <= 0) for (const c of candy) if (c.wait <= 0 && Math.hypot(c.x - b.x, c.z - b.z) < RULES.pick) {
          c.taken = true; const add = c.kind ? RULES.bigPts : 1; s.candy += add;
          events.push({ e: 'grab', pid, id: c.id, add, x: c.x, z: c.z });
        }
        candy = candy.filter(c => !c.taken);
      }
      for (const c of candy) if (c.wait > 0) c.wait -= dt;
      // the piñata
      dropIn -= dt;
      if (dropIn <= 0 && candy.length < 10 + 3 * n) {
        dropIn = RULES.dropEvery(n);
        const k = rng.int(RULES.dropN[0], RULES.dropN[1]), ids = [];
        for (let i = 0; i < k; i++) { const a = rng.range(0, Math.PI * 2), r = rng.range(RULES.dropR[0], RULES.dropR[1]); ids.push(addCandy(Math.sin(a) * r * 1.25, Math.cos(a) * r, rng.chance(RULES.big) ? 1 : 0, RULES.land).id); }
        events.push({ e: 'burst', ids });
      }
      // bat waves: warn, then sweep
      waveIn -= dt;
      if (waveIn <= 0) {
        const w = makeWave(); waves.push(w); wavesDone++;
        waveIn = RULES.waveEvery[D] * Math.max(0.6, 1 - RULES.waveFaster * wavesDone / 8);
        events.push({ e: 'warn', id: w.id, kind: w.kind });
      }
      for (const w of waves) {
        if (w.warn > 0) { w.warn -= dt; if (w.warn <= 0) { for (const bt of w.bats) bats.push({ ...bt, w: w.id }); events.push({ e: 'swoop', id: w.id }); } }
      }
      for (const bt of bats) { bt.x += bt.vx * dt; bt.z += bt.vz * dt; }
      bats = bats.filter(bt => Math.abs(bt.x) < hw + 7 && Math.abs(bt.z) < hd + 7);
      waves = waves.filter(w => w.warn > 0 || bats.some(bt => bt.w === w.id));
      // bat bumps
      for (const [pid, b] of bodies) {
        const s = P.get(pid); if (s.daze > 0 || s.safe > 0) continue;
        if (!bats.some(bt => Math.hypot(bt.x - b.x, bt.z - b.z) < RULES.batR)) continue;
        s.daze = RULES.daze; s.safe = RULES.daze + RULES.safe; s.hits++; b.flags |= F.STUN | F.GHOST; b.vx *= 0.2; b.vz *= 0.2; s.dash = 0;
        const lose = Math.min(RULES.spill, s.candy); s.candy -= lose; const ids = [];
        for (let i = 0; i < lose; i++) { const a = rng.range(0, Math.PI * 2); ids.push(addCandy(b.x + Math.sin(a) * 1.6, b.z + Math.cos(a) * 1.6, 0, RULES.spillWait, b.x, b.z).id); }
        events.push({ e: 'bump', pid, lose, ids, x: r2(b.x), z: r2(b.z) });
      }
      if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = P.get(p.pid).candy;
      // bats: x, z, and a code the browser moves them on with between updates (0 +x, 1 -x, 2 +z, 3 -z; +4 = a wall's slower bats)
      const bt = []; for (const b of bats) bt.push(r1(b.x), r1(b.z), (b.vx > 0 ? 0 : b.vx < 0 ? 1 : b.vz > 0 ? 2 : 3) + (Math.abs(b.vx + b.vz) < RULES.batSpeed[D] * 0.95 ? 4 : 0));
      return {
        sc, left: Math.ceil(time),
        c: candy.map(c => [c.id, c.x, c.z, c.kind, c.wait > 0 ? 1 : 0, c.fx, c.fz]),
        w: waves.filter(w => w.warn > 0).map(w => [w.id, r1(w.warn), w.rects]),
        b: bt,
      };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const k = P.get(p.pid).candy; scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    get candy() { return candy; }, get bats() { return bats; }, get waves() { return waves; },
  };
}
