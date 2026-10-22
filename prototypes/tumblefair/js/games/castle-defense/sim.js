// CASTLE DEFENSE — co-op. A cardboard fair castle: the team runs round its courtyard while waves of goofy creatures
// (wobbly blobs, quick hoppers, big stompers) waddle up the field to bash its wall. Three jobs, any player can do any:
//
//   CANNON    two cannons on the wall. A at a cannon's seat = man it: the stick swings the barrel, A fires, B steps
//             off. A cannon needs ammo.
//   SUPPLY    the ammo pile (left) and the plank pile (right): A picks up a crate of balls or a plank (one thing at a
//             time; B drops it). A crate at a cannon = +3 balls; a plank at the wall = repair that stretch of wall.
//   WALL      the wall is three stretches with their own health. Creatures that reach a stretch bash it; A at the
//             wall with empty hands bonks the creatures there. A stretch at zero is a hole: a creature that reaches it
//             runs through to the keep and costs a heart.
// The waves are fixed (RULES.waves), scaled by how many are playing. The keep has RULES.hearts hearts: keep at least
// one until the bell (or clear every wave) to win together. Scores: kills, loads and repairs (contribution).
import { makeBody, stepBody, separate, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'castle-defense', title: 'Castle Defense', blurb: 'Fire the cannons, fetch the ammo and patch the wall — hold every wave!',
  how: ['Man a CANNON: the stick aims, A fires, B steps off.', 'Fetch ammo crates and planks from the piles (A).', 'Patch a broken wall with a plank. Keep the castle standing!'],
  kind: 'arena', min: 1, max: 4, seconds: 88, scoring: 'coop', unit: 'points', tags: ['coop', 'action'], card: 'card-castle-defense', css: true,
  controls: { stick: true, a: 'Use', b: 'Leave / Drop' }, move: { speed: 5.8, accel: 30, carryMul: 0.85 },
  arena: { shape: 'rect', hw: 7, hd: 3, wall: true }, pitch: 50,
};

export const KINDS = {
  blob: { hp: 2, speed: 1.4, dmg: 6, r: 0.5, pts: 2 },
  hop: { hp: 1, speed: 2.3, dmg: 4, r: 0.38, pts: 2 },
  stomp: { hp: 5, speed: 0.85, dmg: 14, r: 0.8, pts: 4 },
};
export const RULES = {
  hearts: 5, segHp: 100, repair: 30, bashEvery: 1.0,
  wallZ: -3.6, spawnZ: -14.5, fieldX: 6.2,
  cannons: [-2.4, 2.4], seatZ: -2.05, seatReach: 1.0, startAmmo: 4, maxAmmo: 6, crate: 3,
  aimMax: 1.15, aimRate: 3.4, fireCool: 0.55, ballSpeed: 16, ballRange: 17, hitDmg: 2, splash: 1.4,
  piles: { ammo: { x: -5.6, z: 1.9 }, plank: { x: 5.6, z: 1.9 } }, pileReach: 1.55,
  wallReach: -1.65, bonkCool: 0.5, bonkReach: 1.7,
  scale: { 1: 0.42, 2: 0.8, 3: 1.05, 4: 1.25 }, diff: { easy: 0.8, normal: 1, hard: 1.2 },
  waves: [
    { at: 3, g: [{ k: 'blob', n: 5, every: 1.3 }] },
    { at: 16, g: [{ k: 'blob', n: 5, every: 1.2 }, { k: 'hop', n: 3, every: 1.6, delay: 2 }] },
    { at: 29, g: [{ k: 'blob', n: 6, every: 1.1 }, { k: 'stomp', n: 1, every: 1, delay: 3 }] },
    { at: 42, g: [{ k: 'hop', n: 6, every: 1.0 }, { k: 'blob', n: 4, every: 1.3, delay: 1 }] },
    { at: 55, g: [{ k: 'blob', n: 6, every: 1.0 }, { k: 'stomp', n: 2, every: 3 }, { k: 'hop', n: 3, every: 1.4, delay: 4 }] },
    { at: 68, g: [{ k: 'stomp', n: 3, every: 2.5 }, { k: 'hop', n: 5, every: 1.0, delay: 1 }, { k: 'blob', n: 6, every: 0.9, delay: 2 }] },
  ],
};
const ARENA = { ...meta.arena, posts: [...RULES.cannons.map(x => ({ x, z: -2.75, r: 0.38 })), { ...RULES.piles.ammo, r: 0.6 }, { ...RULES.piles.plank, r: 0.6 }] };
const SEG_W = (meta.arena.hw * 2) / 3;
export const segOf = x => Math.max(0, Math.min(2, Math.floor((x + meta.arena.hw) / SEG_W)));
const r2 = v => Math.round(v * 100) / 100;

/** The spawn list for a match: every creature with its wave, kind, time and x — fixed by the seed, scaled by headcount. */
export function planWaves(rng, n, difficulty = 'normal') {
  const k = (RULES.scale[n] ?? 1) * (RULES.diff[difficulty] ?? 1), out = [];
  RULES.waves.forEach((w, wi) => {
    for (const g of w.g) {
      const cnt = Math.max(1, Math.round(g.n * k));
      for (let i = 0; i < cnt; i++) out.push({ w: wi, k: g.k, at: r2(w.at + (g.delay || 0) + i * g.every * (1 + (1 - k) * 0.6)), x: r2(rng.range(-RULES.fieldX, RULES.fieldX)) });
    }
  });
  return out.sort((a, b) => a.at - b.at);
}

export function create({ rng, players, difficulty = 'normal' }) {
  const S = RULES, n = players.length, pids = players.map(p => p.pid), events = [];
  const plan = planWaves(rng, n, difficulty), perWave = S.waves.map((_, wi) => plan.filter(s => s.w === wi).length);
  const bodies = new Map(), P = new Map();
  players.forEach((p, i) => { bodies.set(p.pid, makeBody(r2((i - (n - 1) / 2) * 1.8), 1.0, Math.PI)); P.set(p.pid, { carry: '', man: -1, prevB: 0, bonk: 0, pts: 0 }); });
  const cannons = S.cannons.map(x => ({ x, ammo: S.startAmmo, aim: 0, cool: 0, man: null }));
  const segs = [S.segHp, S.segHp, S.segHp];
  let foes = [], balls = [], fid = 0, bid = 0, si = 0, hearts = S.hearts, time = meta.seconds, t = 0, over = false, success = false;
  const gone = S.waves.map(() => 0), killed = S.waves.map(() => 0);
  let held = 0;
  const near = (b, p, d) => Math.hypot(b.x - p.x, b.z - p.z) <= d;
  const seat = c => ({ x: c.x, z: S.seatZ });
  function score(pid, v) { if (pid != null && P.has(pid)) P.get(pid).pts += v; }
  function hurt(f, dmg, by) {
    f.hp -= dmg; events.push({ e: 'hurt', id: f.id });
    if (f.hp <= 0 && !f.dead) { f.dead = true; score(by, KINDS[f.k].pts); killed[f.w]++; gone[f.w]++; events.push({ e: 'pop', id: f.id, k: f.k, by, x: r2(f.x), z: r2(f.z) }); }
  }
  function unman(pid) {
    const st = P.get(pid), b = bodies.get(pid); if (st.man < 0) return;
    cannons[st.man].man = null; st.man = -1; b.flags &= ~F.FROZEN; b.z += 0.4;
  }
  function use(pid) {
    const b = bodies.get(pid), st = P.get(pid);
    for (const [kind, p] of Object.entries(S.piles)) if (near(b, p, S.pileReach)) {
      if (st.carry !== kind) { st.carry = kind; b.flags |= F.CARRY; events.push({ e: 'pick', pid, kind }); }
      return;
    }
    const ci = cannons.findIndex(c => near(b, seat(c), S.seatReach + 0.2));
    if (st.carry === 'ammo' && ci >= 0) {
      const c = cannons[ci]; if (c.ammo >= S.maxAmmo) { events.push({ e: 'full', to: pid, c: ci }); return; }
      c.ammo = Math.min(S.maxAmmo, c.ammo + S.crate); st.carry = ''; b.flags &= ~F.CARRY; score(pid, 1);
      events.push({ e: 'load', pid, c: ci, ammo: c.ammo }); return;
    }
    if (st.carry === 'plank' && b.z < S.wallReach) {
      const s = segOf(b.x); if (segs[s] >= S.segHp) { events.push({ e: 'full', to: pid, s }); return; }
      const was = segs[s]; segs[s] = Math.min(S.segHp, segs[s] + S.repair); st.carry = ''; b.flags &= ~F.CARRY; score(pid, 1);
      events.push({ e: 'fix', pid, s, hp: segs[s], was: was <= 0 ? 1 : 0 }); return;
    }
    if (!st.carry && ci >= 0 && cannons[ci].man == null && near(b, seat(cannons[ci]), S.seatReach)) {
      const c = cannons[ci]; c.man = pid; st.man = ci; b.x = c.x; b.z = S.seatZ; b.vx = b.vz = 0; b.flags |= F.FROZEN; b.yaw = Math.PI - c.aim;
      events.push({ e: 'man', pid, c: ci }); return;
    }
    if (!st.carry && b.z < S.wallReach && st.bonk <= 0) {
      st.bonk = S.bonkCool;
      const f = foes.filter(f => !f.dead && f.at && Math.abs(f.x - b.x) < S.bonkReach).sort((a, c) => Math.abs(a.x - b.x) - Math.abs(c.x - b.x))[0];
      events.push({ e: 'bonk', pid, hit: f ? f.id : 0 });
      if (f) { score(pid, 1); hurt(f, 1, pid); }
    }
  }
  function fire(pid, ci) {
    const c = cannons[ci];
    if (c.cool > 0) return;
    if (c.ammo <= 0) { c.cool = 0.4; events.push({ e: 'empty', to: pid, c: ci }); return; }
    c.ammo--; c.cool = S.fireCool;
    const dx = Math.sin(c.aim), dz = -Math.cos(c.aim);
    balls.push({ id: ++bid, by: pid, x: c.x + dx * 0.9, z: -3.3 + dz * 0.9, dx, dz, d: 0 });
    events.push({ e: 'fire', pid, c: ci });
  }
  function finish(ok) {
    if (over) return; over = true; success = ok; time = Math.max(0, time);
    for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
    events.push({ e: 'end', ok: ok ? 1 : 0 });
  }
  return {
    bodies, events,
    init: () => ({ arena: ARENA, waves: S.waves.length, perWave, hearts: S.hearts, cannons: S.cannons, piles: S.piles, seatZ: S.seatZ, wallZ: S.wallZ, segW: SEG_W, kinds: KINDS, maxAmmo: S.maxAmmo }),
    input(pid, inp) {
      const b = bodies.get(pid), st = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(st.prevB & IN.A), pb = (bits & IN.B) && !(st.prevB & IN.B); st.prevB = bits;
      if (st.man >= 0) {
        const c = cannons[st.man], mx = +inp?.mx || 0, mz = +inp?.mz || 0;
        if (Math.hypot(mx, mz) > 0.3 && mz < 0.6) {
          const want = Math.max(-S.aimMax, Math.min(S.aimMax, Math.atan2(mx, Math.max(0.15, -mz))));
          const d = want - c.aim, k = S.aimRate * 0.05; c.aim += Math.max(-k, Math.min(k, d));
        }
        b.yaw = Math.PI - c.aim;
        if (pa) fire(pid, st.man);
        if (pb) unman(pid);
        return;
      }
      stepBody(b, inp, meta.move, ARENA);
      if (pa) use(pid);
      else if (pb && st.carry) { st.carry = ''; b.flags &= ~F.CARRY; events.push({ e: 'drop', pid }); }
    },
    step(dt) {
      if (over) return;
      t += dt; time -= dt;
      separate([...bodies.entries()].filter(([pid]) => P.get(pid).man < 0).map(([, b]) => b));
      for (const st of P.values()) if (st.bonk > 0) st.bonk -= dt;
      for (const c of cannons) if (c.cool > 0) c.cool -= dt;
      // spawn
      while (si < plan.length && plan[si].at <= t) {
        const s = plan[si++], K = KINDS[s.k];
        foes.push({ id: ++fid, k: s.k, w: s.w, x: s.x, z: r2(S.spawnZ - rng.range(0, 1.5)), hp: K.hp, at: false, bash: rng.range(0.2, 0.9), ph: r2(rng.range(0, 6.28)), dead: false });
        if (plan.findIndex(q => q.w === s.w) === si - 1) events.push({ e: 'wave', w: s.w });
      }
      // creatures walk up, bash, or run through a hole
      for (const f of foes) {
        if (f.dead) continue;
        const K = KINDS[f.k];
        if (!f.at) {
          f.z += K.speed * dt; f.x += Math.sin(t * 1.7 + f.ph) * 0.25 * dt;
          f.x = Math.max(-S.fieldX - 0.3, Math.min(S.fieldX + 0.3, f.x));
          if (f.z >= S.wallZ - K.r) { f.z = S.wallZ - K.r; f.at = true; }
          continue;
        }
        const s = segOf(f.x);
        if (segs[s] <= 0) {
          f.dead = true; gone[f.w]++; hearts = Math.max(0, hearts - 1);
          events.push({ e: 'slip', id: f.id, s, hearts });
          continue;
        }
        f.bash -= dt;
        if (f.bash <= 0) {
          f.bash = S.bashEvery; segs[s] = Math.max(0, segs[s] - K.dmg);
          events.push({ e: 'bash', id: f.id, s, hp: segs[s] });
          if (segs[s] <= 0) events.push({ e: 'breach', s });
        }
      }
      // cannon balls
      for (const ball of balls) {
        const stepD = S.ballSpeed * dt; ball.x += ball.dx * stepD; ball.z += ball.dz * stepD; ball.d += stepD;
        const hit = foes.find(f => !f.dead && Math.hypot(f.x - ball.x, f.z - ball.z) < KINDS[f.k].r + 0.35);
        if (hit) {
          ball.d = 1e9; events.push({ e: 'boom', x: r2(ball.x), z: r2(ball.z) });
          hurt(hit, S.hitDmg, ball.by);
          for (const f of foes) if (f !== hit && !f.dead && Math.hypot(f.x - ball.x, f.z - ball.z) < S.splash) hurt(f, 1, ball.by);
        } else if (ball.d >= S.ballRange) events.push({ e: 'plop', x: r2(ball.x), z: r2(ball.z) });
      }
      balls = balls.filter(b => b.d < S.ballRange);
      foes = foes.filter(f => !f.dead);
      held = S.waves.reduce((a, _, wi) => a + (gone[wi] >= perWave[wi] && plan.some(s => s.w === wi) ? 1 : 0), 0);
      if (hearts <= 0) finish(false);
      else if (si >= plan.length && !foes.length) finish(true);
      else if (time <= 0) { time = 0; finish(true); }
    },
    state() {
      const sc = {}, carry = {};
      for (const [pid, st] of P) { sc[pid] = st.pts; carry[pid] = st.carry; }
      return {
        sc, carry, hearts, held, segs: segs.map(Math.ceil),
        c: cannons.map(c => [c.ammo, r2(c.aim), c.man ?? -1]),
        f: foes.map(f => [f.id, f.k, r2(f.x), r2(f.z), f.hp, f.at ? 1 : 0]),
        b: balls.map(b => [b.id, r2(b.x), r2(b.z)]),
        wave: Math.max(0, ...plan.slice(0, si).map(s => s.w + 1)), left: Math.max(0, Math.ceil(time)),
      };
    },
    get over() { return over; },
    /** For tests. */
    plan, cannons, segs, player: pid => P.get(pid), get foes() { return foes; }, get hearts() { return hearts; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, P.get(p).pts]));
      return { coop: { success }, order: [pids.slice()], scores, unit: meta.unit };
    },
  };
}
