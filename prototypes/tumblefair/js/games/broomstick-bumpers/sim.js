// BROOMSTICK BUMPERS (Halloween only) — Bumper Bash on broomsticks, in a moonlit graveyard ring. Every broom steers
// like a kart (shared/arena.js `move.mode: 'car'`: the stick is the heading you want) and wears a fat padded bumper
// ring. Ram another broom to score: from BEHIND 3, into its SIDE 2, nose to nose 1 (whoever was flying at the other
// harder takes it), +1 while you are boosting (A, a short whoosh with a cool-down). The new bit is the GRAVES: four
// graves round the ring creak open one at a time (they glow green first). Bash a broom into an OPEN grave and it
// tumbles in for a moment: +3 GRAVE DROP to whoever bashed it last; fly in by yourself and you lose a point. Friendly
// rounded tombstones stand about the ring as posts (the layout comes from the seed). Most points wins.
// Alone: three straw-stuffed practice riders drift about to be bashed (two players get one extra to fight over).
import { makeBody, stepBody, separate, clampToArena, collideObstacles, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'broomstick-bumpers', title: 'Broomstick Bumpers', blurb: 'Bash the other brooms — and knock them into the open graves!',
  how: ['Point the stick to fly your broom. A = a quick boost.', 'Ram a broom: from behind 3, side 2, nose to nose 1.', 'Graves glow green, then open: bash someone in for +3!', 'Fly into an open grave yourself and you lose a point.'],
  kind: 'arena', min: 1, max: 4, seconds: 66, scoring: 'points', unit: 'pts', tags: ['action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Boost' },
  move: { mode: 'car', speed: 6.2, accel: 3.8, turn: 4.0, grip: 4.2, boostMul: 1.55, stunDrag: 1.7 },
  arena: { shape: 'rect', hw: 8, hd: 8, wall: true }, pitch: 64, card: 'card-broomstick-bumpers', css: true,
};

export const RULES = {
  countdown: 3, endPause: 1.8,
  carR: 0.62, hitR: 1.3, minClose: 1.4,
  pts: { rear: 3, side: 2, front: 1, boost: 1, drop: 3, selfDrop: -1 },
  spin: 0.95, immune: 1.25, pairCool: 0.6, pushMin: 4.5, pushMax: 10,
  bounce: 0.6, bounceMin: 1.2,
  boostCool: 3.2, boostTime: 0.7,
  graves: [{ x: 0, z: 4.3 }, { x: 4.3, z: 0 }, { x: 0, z: -4.3 }, { x: -4.3, z: 0 }], graveR: 0.95, fallR: 0.85,
  credit: 2.5, downTime: 1.6, backSafe: 1.0,
  // how often a grave opens, how long it warns and stays open; on hard two can be open at once late in the game
  openEvery: { easy: 6.5, normal: 5.2, hard: 4.2 }, warn: { easy: 1.8, normal: 1.4, hard: 1.1 }, openFor: { easy: 3.2, normal: 4.0, hard: 4.6 },
  twoAt: { easy: 999, normal: 40, hard: 25 }, firstOpen: 2.5,
  target: { speedMul: { easy: 0.4, normal: 0.5, hard: 0.62 }, names: ['Strawbert', 'Hay Wire', 'Scruffles'] },
  pickEvery: [4, 6], pickR: 0.95, pumpkin: 2,
  medals: [14, 26, 40],
};
const r2 = v => Math.round(v * 100) / 100;
// Graveyard layouts from the seed: where the tombstones stand. Every stone keeps clear of the four starting corners
// (±5.4), the four graves and the solo riders' starts.
export const YARDS = [
  { id: 'crossroads', name: 'Crossroads Yard', posts: [{ x: 0, z: 0, r: 0.7 }] },
  { id: 'pair', name: 'Twin Stones', posts: [{ x: -2.4, z: 1.6, r: 0.6 }, { x: 2.4, z: -1.6, r: 0.6 }] },
  { id: 'ring', name: 'Old Stone Ring', posts: [{ x: -2.3, z: -2.3, r: 0.5 }, { x: 2.3, z: -2.3, r: 0.5 }, { x: -2.3, z: 2.3, r: 0.5 }, { x: 2.3, z: 2.3, r: 0.5 }] },
  { id: 'crypt', name: 'The Little Crypt', posts: [{ x: 0, z: 0.2, r: 1.3 }] },
];
export const yardFor = seed => YARDS[Math.abs(Math.floor(seed || 0)) % YARDS.length];

export function create({ seed = 0, rng, players, difficulty = 'normal' }) {
  const D = RULES.openEvery[difficulty] ? difficulty : 'normal';
  const yard = yardFor(seed), A = { ...meta.arena, posts: yard.posts.map(p => ({ ...p })) };
  const n = players.length, solo = n === 1, bodies = new Map();
  const corners = [[-5.4, 5.4], [5.4, -5.4], [5.4, 5.4], [-5.4, -5.4]];
  const cars = new Map();          // id -> rider (players by pid, practice riders by negative id)
  const rider = (id, b, extra = {}) => ({ id, b, target: false, pts: 0, spin: 0, immune: 0, boost: 0, boostCool: 0, prevB: 0, down: 0, safe: 0, by: null, byAt: -99, drops: 0, falls: 0, ...extra });
  players.forEach((p, i) => { const [x, z] = corners[i], b = makeBody(x, z, r2(Math.atan2(-x, -z))); b.flags = F.FROZEN; bodies.set(p.pid, b); cars.set(p.pid, rider(p.pid, b)); });
  const nTargets = solo ? 3 : n === 2 ? 1 : 0;
  for (let j = 0; j < nTargets; j++) {
    const x = solo ? [-2.6, 2.6, 0][j] : 0, z = solo ? [-5.6, -5.6, 6][j] : -5.8, b = makeBody(x, z, rng.range(0, 6.28)); b.flags = F.FROZEN;
    cars.set(-1 - j, rider(-1 - j, b, { target: true, name: RULES.target.names[j], aim: null, think: 0 }));
  }
  const tMove = { ...meta.move, speed: meta.move.speed * RULES.target.speedMul[D] };
  const graves = RULES.graves.map((g, i) => ({ i, x: g.x, z: g.z, st: 0, t: 0 }));   // st: 0 shut, 1 glowing (about to open), 2 open
  const pairCool = new Map();
  let picks = [], pid0 = 0, nextPick = 3, countdown = RULES.countdown, lastCount = 4, time = meta.seconds - RULES.countdown - RULES.endPause, played = 0, over = false, endIn = -1, nextOpen = RULES.firstOpen;
  const events = [];
  const live = () => countdown <= 0 && endIn < 0;
  const openGraves = () => graves.filter(g => g.st === 2);

  function moveCar(c, inp, move) {
    const b = c.b, pvx = b.vx, pvz = b.vz;
    stepBody(b, inp, move, A);
    const lx = A.hw - 0.45, lz = A.hd - 0.45; let boing = 0;
    if (Math.abs(b.x) >= lx - 1e-6 && Math.sign(pvx) === Math.sign(b.x) && Math.abs(pvx) > RULES.bounceMin) { b.vx = -pvx * RULES.bounce; boing = Math.abs(pvx); }
    if (Math.abs(b.z) >= lz - 1e-6 && Math.sign(pvz) === Math.sign(b.z) && Math.abs(pvz) > RULES.bounceMin) { b.vz = -pvz * RULES.bounce; boing = Math.max(boing, Math.abs(pvz)); }
    if (boing > 3) events.push({ e: 'boing', id: c.id, x: r2(b.x), z: r2(b.z) });
  }
  function targetThink(c, dt) {
    const b = c.b; if (b.flags & (F.FROZEN | F.STUN)) { stepBody(b, null, tMove, A); return; }
    c.think -= dt;
    if (!c.aim || c.think <= 0 || Math.hypot(c.aim[0] - b.x, c.aim[1] - b.z) < 1.5) { c.think = rng.range(2, 3.5); c.aim = [rng.range(-6.2, 6.2), rng.range(-6.2, 6.2)]; }
    const dx = c.aim[0] - b.x, dz = c.aim[1] - b.z, d = Math.hypot(dx, dz) || 1;
    moveCar(c, { mx: dx / d, mz: dz / d, b: 0 }, tMove);
  }
  function bump(a, c) {
    const dx = c.b.x - a.b.x, dz = c.b.z - a.b.z, d = Math.hypot(dx, dz) || 1, nx = dx / d, nz = dz / d;
    const ca = a.b.vx * nx + a.b.vz * nz, cc = -(c.b.vx * nx + c.b.vz * nz);
    if (ca + cc < RULES.minClose) return;
    let att = a, vic = c, ux = -nx, uz = -nz; const close = ca + cc;
    if (cc > ca) { att = c; vic = a; ux = nx; uz = nz; }
    if (att.target || vic.immune > 0 || att.spin > 0) {
      vic.b.vx -= ux * 2.5; vic.b.vz -= uz * 2.5; att.b.vx += ux * 2; att.b.vz += uz * 2;
      if (!att.target) { vic.by = att.id; vic.byAt = played; }
      events.push({ e: 'clonk', x: r2((a.b.x + c.b.x) / 2), z: r2((a.b.z + c.b.z) / 2) }); return;
    }
    const fx = Math.sin(vic.b.yaw), fz = Math.cos(vic.b.yaw), dot = fx * ux + fz * uz;
    const zone = dot > 0.5 ? 'front' : dot < -0.45 ? 'rear' : 'side';
    const pts = RULES.pts[zone] + (att.boost > 0 ? RULES.pts.boost : 0);
    att.pts += pts;
    const push = Math.max(RULES.pushMin, Math.min(RULES.pushMax, 3 + close * 0.9));
    vic.b.vx = -ux * push + vic.b.vx * 0.3; vic.b.vz = -uz * push + vic.b.vz * 0.3; vic.b.flags |= F.STUN; vic.spin = RULES.spin; vic.immune = RULES.immune;
    vic.by = att.id; vic.byAt = played;
    att.b.vx *= 0.4; att.b.vz *= 0.4;
    events.push({ e: 'bash', by: att.id, id: vic.id, zone, pts, x: r2(vic.b.x), z: r2(vic.b.z) });
  }
  function tumble(c, g) {
    const b = c.b; c.down = RULES.downTime; c.spin = 0; c.boost = 0;
    b.x = g.x; b.z = g.z; b.vx = b.vz = 0; b.flags = F.FROZEN | F.GHOST;
    const by = c.by != null && played - c.byAt <= RULES.credit && cars.has(c.by) && c.by !== c.id ? c.by : null;
    if (by != null) { cars.get(by).pts += RULES.pts.drop; cars.get(by).drops++; }
    else if (!c.target) c.pts = Math.max(0, c.pts + RULES.pts.selfDrop);
    c.falls++; c.by = null;
    events.push({ e: 'drop', id: c.id, by, g: g.i, pts: by != null ? RULES.pts.drop : c.target ? 0 : RULES.pts.selfDrop });
  }
  function popOut(c) {
    let best = null, bd = -1;
    for (let k = 0; k < 10; k++) {
      const x = rng.range(-6, 6), z = rng.range(-6, 6);
      if (graves.some(g => Math.hypot(g.x - x, g.z - z) < 2) || A.posts.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 1)) continue;
      let d = 99; for (const o of cars.values()) if (o !== c && !o.down) d = Math.min(d, Math.hypot(o.b.x - x, o.b.z - z));
      if (d > bd) { bd = d; best = [x, z]; }
    }
    const [x, z] = best || [5.4, 5.4], b = c.b;
    b.x = r2(x); b.z = r2(z); b.y = 0; b.vx = b.vz = 0; b.yaw = r2(Math.atan2(-x, -z)); b.flags = F.GHOST; c.safe = RULES.backSafe; c.immune = RULES.backSafe;
    events.push({ e: 'back', id: c.id });
  }
  return {
    bodies, events,
    init: () => ({ arena: A, yard: yard.id, yardName: yard.name, graves: RULES.graves, graveR: RULES.graveR, solo, medals: solo ? RULES.medals : null, targets: [...cars.values()].filter(c => c.target).map(c => ({ id: c.id, name: c.name })), left: Math.ceil(time) }),
    input(pid, inp) {
      const c = cars.get(pid); if (!c || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(c.prevB & IN.A); c.prevB = bits;
      if (!live() || c.down > 0) { stepBody(c.b, null, meta.move, A); return; }
      if (pa && c.boostCool <= 0 && !(c.b.flags & F.STUN)) { c.boostCool = RULES.boostCool; c.boost = RULES.boostTime; c.b.flags |= F.BOOST; events.push({ e: 'boost', id: pid }); }
      moveCar(c, inp, meta.move);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (countdown > 0) {
        countdown -= dt; const s = Math.ceil(countdown);
        if (s < lastCount && s > 0) { lastCount = s; events.push({ e: 'count', n: s }); }
        if (countdown <= 0) { for (const c of cars.values()) c.b.flags &= ~F.FROZEN; events.push({ e: 'go' }); }
        return;
      }
      time -= dt; played += dt;
      // graves: one glows, then opens, then shuts again
      nextOpen -= dt;
      const busy = graves.filter(g => g.st > 0).length, maxOpen = played >= RULES.twoAt[D] ? 2 : 1;
      if (nextOpen <= 0 && busy < maxOpen) {
        const shut = graves.filter(g => g.st === 0); const g = rng.pick(shut);
        g.st = 1; g.t = RULES.warn[D]; nextOpen = RULES.openEvery[D] * (maxOpen > 1 ? 0.6 : 1);
        events.push({ e: 'glow', g: g.i });
      }
      for (const g of graves) {
        if (g.st === 0) continue;
        g.t -= dt;
        if (g.t <= 0) { if (g.st === 1) { g.st = 2; g.t = RULES.openFor[D]; events.push({ e: 'open', g: g.i }); } else { g.st = 0; events.push({ e: 'shut', g: g.i }); } }
      }
      for (const c of cars.values()) {
        if (c.down > 0) { c.down -= dt; c.b.y = r2(Math.max(-1.4, c.b.y - dt * 3)); if (c.down <= 0) popOut(c); continue; }
        if (c.target) targetThink(c, dt);
        if (c.spin > 0) { c.spin -= dt; if (c.spin <= 0) c.b.flags &= ~F.STUN; }
        if (c.immune > 0) c.immune -= dt;
        if (c.safe > 0) { c.safe -= dt; if (c.safe <= 0) c.b.flags &= ~F.GHOST; }
        if (c.boostCool > 0) c.boostCool -= dt;
        if (c.boost > 0) { c.boost -= dt; if (c.boost <= 0) c.b.flags &= ~F.BOOST; }
      }
      const up = [...cars.values()].filter(c => !c.down);
      separate(up.map(c => c.b), RULES.carR);
      for (const c of up) { clampToArena(c.b, A); collideObstacles(c.b, A); }
      for (const [k, t] of pairCool) { if (t - dt <= 0) pairCool.delete(k); else pairCool.set(k, t - dt); }
      for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) {
        const a = up[i], c = up[j], key = a.id + ':' + c.id;
        if (a.target && c.target) continue;
        if ((a.b.flags | c.b.flags) & F.GHOST) continue;
        if (pairCool.has(key) || Math.hypot(a.b.x - c.b.x, a.b.z - c.b.z) > RULES.hitR) continue;
        pairCool.set(key, RULES.pairCool); bump(a, c);
      }
      // open graves swallow whoever is over them (not while blinking back in)
      for (const g of openGraves()) for (const c of up) if (!c.down && c.safe <= 0 && Math.hypot(c.b.x - g.x, c.b.z - g.z) < RULES.fallR) tumble(c, g);
      // a pumpkin to grab now and then
      nextPick -= dt;
      if (nextPick <= 0) {
        nextPick = rng.range(RULES.pickEvery[0], RULES.pickEvery[1]);
        if (picks.length < 2) for (let k = 0; k < 12; k++) {
          const x = r2(rng.range(-6.4, 6.4)), z = r2(rng.range(-6.4, 6.4));
          if (A.posts.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 1.2) || graves.some(g => Math.hypot(g.x - x, g.z - z) < 1.8)) continue;
          picks.push({ id: ++pid0, x, z }); break;
        }
      }
      for (const c of cars.values()) {
        if (c.target || c.down) continue;
        const i = picks.findIndex(p => Math.hypot(p.x - c.b.x, p.z - c.b.z) < RULES.pickR); if (i < 0) continue;
        const p = picks[i]; picks.splice(i, 1); c.pts += RULES.pumpkin;
        events.push({ e: 'pick', id: c.id, x: p.x, z: p.z });
      }
      if (time <= 0) {
        time = 0; endIn = RULES.endPause;
        for (const c of cars.values()) { c.b.flags = (c.b.flags & ~(F.BOOST | F.GHOST)) | F.FROZEN; c.b.vx = c.b.vz = 0; if (c.down) { c.down = 0; c.b.y = 0; } }
        events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}; for (const p of players) sc[p.pid] = cars.get(p.pid).pts;
      const g = { sc, gv: graves.map(x => x.st), pk: picks.map(p => [p.id, p.x, p.z]), cd: countdown > 0 ? Math.ceil(countdown) : 0, left: Math.ceil(Math.max(0, time)) };
      const me = {}; for (const p of players) { const c = cars.get(p.pid); if (c.boostCool > 0) me[p.pid] = Math.ceil(c.boostCool * 2) / 2; }
      g.bc = me;
      if (nTargets) g.tg = [...cars.values()].filter(c => c.target).map(c => [c.id, r2(c.b.x), r2(c.b.z), r2(c.b.yaw), c.b.flags, r2(c.b.y)]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = cars.get(p.pid).pts; scores[p.pid] = s; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    car: id => cars.get(id), get graves() { return graves; }, get picks() { return picks; },
  };
}
