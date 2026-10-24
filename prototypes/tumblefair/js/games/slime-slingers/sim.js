// SLIME SLINGERS (Halloween only) — a fenced pumpkin patch at night and a bucket of bright green goo each. A throws a
// glob of slime the way you face (it turns a little toward whoever is nearest that way). Nobody gets knocked out: slime
// is STICKY. One glob and you squelch along slower; two and you are wading; a third sticks you to the spot, gooey and
// wobbling, for a couple of seconds (+2 bonus to whoever finished you off). Slime wears off by itself, slowly, or wash
// it all off at the old water pump in the middle (stand next to it). Globs that miss splat on the ground and leave a
// puddle that slows anyone walking through. B = a quick dodge. Every hit is a point; most points wins.
// Alone: three wobbly jelly ghosts drift about to be slimed (two players get one extra to fight over).
import { makeBody, stepBody, separate, spawnRing, collideObstacles, clampToArena, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'slime-slingers', title: 'Slime Slingers', blurb: 'Fling sticky slime — three globs and they are stuck fast!',
  how: ['A throws a glob of slime where you face. A hit is a point.', 'Slimed? You get slower. Three globs = stuck! (+2 to the thrower)', 'Wash it off at the pump in the middle. B = dodge.'],
  kind: 'arena', min: 1, max: 4, seconds: 64, scoring: 'points', unit: 'splats', tags: ['action', 'holiday'], season: 'halloween',
  controls: { stick: true, a: 'Throw', b: 'Dodge' },
  move: { speed: 6.0, accel: 22, stunDrag: 2.4, slowMul: 0.62, carryMul: 0.62 },     // SLOW = slimed (or in a puddle); CARRY on top = slimed twice
  arena: { shape: 'rect', hw: 8, hd: 7, wall: true }, pitch: 58, card: 'card-slime-slingers', css: true,
};

export const RULES = {
  countdown: 3, endPause: 1.6,
  throwCool: 0.7, globSpeed: 13, globLife: 0.8, globR: 0.75,
  aimCone: { easy: 0.62, normal: 0.48, hard: 0.36 }, aimRange: 11,
  wear: { easy: 3.0, normal: 4.0, hard: 5.0 },       // one level of slime wears off after this long without a new hit
  stuck: 2.0, safe: 1.2, finishBonus: 2,
  pump: { x: 0, z: 0, r: 0.5, reach: 1.7, wash: 0.8 },   // stand this close: one level washes off every `wash` seconds (and you cannot throw while you wash)
  puddleR: 1.0, puddleLife: 6, puddles: 8,
  dodgeCool: 1.6, dodgeSpeed: 12, dodgeTime: 0.2,
  ghosts: { n: { 1: 3, 2: 1 }, speed: { easy: 1.4, normal: 2.0, hard: 2.6 }, names: ['Wobbles', 'Jellybean', 'Gloop'] },
  medals: [24, 44, 64],
};
const r2 = v => Math.round(v * 100) / 100;
// Patches from the seed: where the pumpkin piles stand (cover; a glob that meets one splats on it). The pump is always
// in the middle. Every pile keeps clear of the starting ring (radius 4.4) and the pump.
export const PATCHES = [
  { id: 'rows', name: 'Pumpkin Rows', posts: [{ x: -4, z: 2.6, r: 0.7 }, { x: 4, z: 2.6, r: 0.7 }, { x: -4, z: -2.6, r: 0.7 }, { x: 4, z: -2.6, r: 0.7 }] },
  { id: 'cart', name: 'The Hay Cart', posts: [{ x: 0, z: 3.4, r: 0.9 }, { x: 0, z: -3.4, r: 0.9 }] },
  { id: 'scatter', name: 'Patchy Patch', posts: [{ x: -2.6, z: 2.2, r: 0.6 }, { x: 3.3, z: 1.4, r: 0.6 }, { x: -3.1, z: -1.6, r: 0.6 }, { x: 2.4, z: -2.6, r: 0.6 }] },
];
export const patchFor = seed => PATCHES[Math.abs(Math.floor(seed || 0)) % PATCHES.length];

export function create({ seed = 0, rng, players, difficulty = 'normal' }) {
  const D = RULES.wear[difficulty] ? difficulty : 'normal';
  const patch = patchFor(seed), PU = RULES.pump;
  const POSTS = [{ x: PU.x, z: PU.z, r: PU.r }, ...patch.posts.map(({ x, z, r }) => ({ x, z, r }))], A = { ...meta.arena, posts: POSTS };
  const onPost = (x, z, pad = 0) => POSTS.some(o => Math.hypot(x - o.x, z - o.z) < o.r + pad);
  const n = players.length, solo = n === 1, bodies = new Map(), spawns = spawnRing(n, solo ? 4.4 : 5.2);
  players.forEach((p, i) => { const b = makeBody(r2(spawns[i].x), r2(spawns[i].z), r2(spawns[i].yaw)); b.flags = F.FROZEN; bodies.set(p.pid, b); });
  const S = new Map();       // id -> slingable: players by pid, jelly ghosts by negative id
  const st = (id, b, extra = {}) => ({ id, b, lvl: 0, wear: 0, stuck: 0, safe: 0, pts: 0, hits: 0, stucks: 0, washed: 0, prevB: 0, throwCool: 0, dodgeCool: 0, dodge: 0, washT: 0, ...extra });
  for (const p of players) S.set(p.pid, st(p.pid, bodies.get(p.pid)));
  const nGhosts = RULES.ghosts.n[n] || 0;
  const gMove = { ...meta.move, speed: RULES.ghosts.speed[D] };
  const ghostSpot = () => { for (let k = 0; k < 20; k++) { const x = rng.range(-6.5, 6.5), z = rng.range(-5.5, 5.5); if (!onPost(x, z, 1) && [...bodies.values()].every(b => Math.hypot(b.x - x, b.z - z) > 2.5)) return [x, z]; } return [6, 5]; };
  for (let j = 0; j < nGhosts; j++) { const [x, z] = ghostSpot(), b = makeBody(r2(x), r2(z), 0); b.flags = F.FROZEN; S.set(-1 - j, st(-1 - j, b, { ghost: true, name: RULES.ghosts.names[j], aim: null, think: 0 })); }
  let globs = [], gid = 0, puddles = [], pid0 = 0, countdown = RULES.countdown, lastCount = 4, time = meta.seconds - RULES.countdown - RULES.endPause, over = false, endIn = -1;
  const events = [];
  const live = () => countdown <= 0 && endIn < 0;
  const hittable = s => s.stuck <= 0 && s.safe <= 0;

  /** The body flags that say how slimed someone is (stepBody reads SLOW and CARRY; FROZEN while stuck). */
  function setFlags(s) {
    const b = s.b, inPuddle = puddles.some(p => Math.hypot(p.x - b.x, p.z - b.z) < RULES.puddleR);
    b.flags &= ~(F.SLOW | F.CARRY);
    if (s.stuck > 0) return;
    if (s.lvl >= 1 || inPuddle) b.flags |= F.SLOW;
    if (s.lvl >= 2) b.flags |= F.CARRY;
  }
  function splat(s, by) {
    s.lvl = Math.min(3, s.lvl + 1); s.wear = RULES.wear[D]; s.hits++;
    const thrower = S.get(by); let pts = 1;
    if (s.lvl >= 3) { s.stuck = RULES.stuck; s.stucks++; s.b.flags |= F.FROZEN | F.GHOST; s.b.vx = s.b.vz = 0; s.dodge = 0; pts += RULES.finishBonus; }
    if (thrower) thrower.pts += pts;
    events.push({ e: 'splat', id: s.id, by, lvl: s.lvl, pts, x: r2(s.b.x), z: r2(s.b.z) });
  }
  function addPuddle(x, z) {
    x = Math.max(-A.hw + 0.6, Math.min(A.hw - 0.6, x)); z = Math.max(-A.hd + 0.6, Math.min(A.hd - 0.6, z));
    puddles.push({ id: ++pid0, x: r2(x), z: r2(z), life: RULES.puddleLife }); if (puddles.length > RULES.puddles) puddles.shift();
  }
  function aimFrom(id, b, fx, fz) {
    let best = null, bestA = RULES.aimCone[D];
    for (const s of S.values()) {
      if (s.id === id || !hittable(s)) continue;
      const dx = s.b.x - b.x, dz = s.b.z - b.z, d = Math.hypot(dx, dz); if (d < 0.3 || d > RULES.aimRange) continue;
      const lead = d / RULES.globSpeed, tx = dx + s.b.vx * lead, tz = dz + s.b.vz * lead, td = Math.hypot(tx, tz) || 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, (tx * fx + tz * fz) / td)));
      if (ang < bestA) { bestA = ang; best = [tx / td, tz / td]; }
    }
    return best || [fx, fz];
  }
  function ghostThink(s, dt) {
    const b = s.b; if (b.flags & F.FROZEN) { stepBody(b, null, gMove, A); return; }
    s.think -= dt;
    if (!s.aim || s.think <= 0 || Math.hypot(s.aim[0] - b.x, s.aim[1] - b.z) < 1) { s.think = rng.range(1.5, 3); s.aim = ghostSpot(); }
    const dx = s.aim[0] - b.x, dz = s.aim[1] - b.z, d = Math.hypot(dx, dz) || 1;
    stepBody(b, { mx: dx / d, mz: dz / d, b: 0 }, gMove, A);
  }
  return {
    bodies, events,
    init: () => ({ arena: A, patch: patch.id, patchName: patch.name, pump: PU, solo, medals: solo ? RULES.medals : null, ghosts: [...S.values()].filter(s => s.ghost).map(s => ({ id: s.id, name: s.name })), left: Math.ceil(time) }),
    input(pid, inp) {
      const s = S.get(pid); if (!s || over) return;
      const b = s.b, bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      if (!live()) { stepBody(b, null, meta.move, A); return; }
      const free = s.stuck <= 0 && !(b.flags & F.STUN);
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      if (pa && free && s.throwCool <= 0) {
        s.throwCool = RULES.throwCool;
        const [ax, az] = aimFrom(pid, b, fx, fz);
        globs.push({ id: ++gid, by: pid, x: b.x + ax * 0.6, z: b.z + az * 0.6, vx: ax * RULES.globSpeed, vz: az * RULES.globSpeed, life: RULES.globLife });
        events.push({ e: 'throw', pid });
      }
      if (pb && free && s.dodgeCool <= 0) {
        let mx = +inp?.mx || 0, mz = +inp?.mz || 0; const m = Math.hypot(mx, mz);
        if (m > 0.2) { mx /= m; mz /= m; } else { mx = fx; mz = fz; }
        s.dodgeCool = RULES.dodgeCool; s.dodge = RULES.dodgeTime; b.flags |= F.STUN; b.vx = mx * RULES.dodgeSpeed; b.vz = mz * RULES.dodgeSpeed;
        events.push({ e: 'dodge', pid });
      }
      stepBody(b, inp, meta.move, A);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      if (countdown > 0) {
        countdown -= dt; const c = Math.ceil(countdown);
        if (c < lastCount && c > 0) { lastCount = c; events.push({ e: 'count', n: c }); }
        if (countdown <= 0) { for (const s of S.values()) s.b.flags &= ~F.FROZEN; events.push({ e: 'go' }); }
        return;
      }
      time -= dt;
      for (const s of S.values()) if (s.ghost) ghostThink(s, dt);
      const all = [...S.values()];
      separate(all.map(s => s.b));
      for (const s of all) { clampToArena(s.b, A); collideObstacles(s.b, A); }
      // globs fly; they hit the first slingable they meet, or splat on a pile, or land as a puddle
      for (const g of globs) {
        g.x += g.vx * dt; g.z += g.vz * dt; g.life -= dt;
        if (onPost(g.x, g.z, 0.1) || Math.abs(g.x) > A.hw || Math.abs(g.z) > A.hd) { g.life = 0; g.hit = true; addPuddle(g.x - g.vx * dt, g.z - g.vz * dt); events.push({ e: 'miss', x: r2(g.x), z: r2(g.z) }); continue; }
        for (const s of all) {
          if (s.id === g.by || !hittable(s) || Math.hypot(s.b.x - g.x, s.b.z - g.z) > RULES.globR) continue;
          g.life = 0; g.hit = true; splat(s, g.by); break;
        }
        if (g.life <= 0 && !g.hit) { addPuddle(g.x, g.z); events.push({ e: 'miss', x: r2(g.x), z: r2(g.z) }); }   // fell short: a puddle where it lands
      }
      globs = globs.filter(g => g.life > 0);
      // timers: cool-downs, slime wearing off, stuck, safe, washing at the pump
      for (const s of all) {
        const b = s.b;
        if (s.throwCool > 0) s.throwCool -= dt;
        if (s.dodgeCool > 0) s.dodgeCool -= dt;
        if (s.dodge > 0) { s.dodge -= dt; if (s.dodge <= 0) b.flags &= ~F.STUN; }
        if (s.safe > 0) { s.safe -= dt; if (s.safe <= 0) b.flags &= ~F.GHOST; }
        if (s.stuck > 0) {
          s.stuck -= dt;
          if (s.stuck <= 0) { s.lvl = 0; s.safe = RULES.safe; b.flags = (b.flags & ~F.FROZEN) | F.GHOST; events.push({ e: 'unstuck', id: s.id }); if (s.ghost) { const [x, z] = ghostSpot(); b.x = r2(x); b.z = r2(z); } }
        } else if (s.lvl > 0) {
          s.wear -= dt; if (s.wear <= 0) { s.lvl--; s.wear = RULES.wear[D]; }
          if (!s.ghost && Math.hypot(b.x - PU.x, b.z - PU.z) < PU.reach) {
            s.washT += dt; s.throwCool = Math.max(s.throwCool, 0.25); if (s.washT >= PU.wash) { s.washT = 0; s.lvl--; s.wear = RULES.wear[D]; if (s.lvl === 0) { s.washed++; events.push({ e: 'washed', id: s.id }); } }
          } else s.washT = 0;
        }
        setFlags(s);
      }
      for (const p of puddles) p.life -= dt;
      puddles = puddles.filter(p => p.life > 0);
      if (time <= 0) {
        time = 0; endIn = RULES.endPause;
        for (const s of all) { s.b.flags = F.FROZEN; s.b.vx = s.b.vz = 0; }
        globs = [];
        events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}, lv = {}; for (const p of players) { const s = S.get(p.pid); sc[p.pid] = s.pts; if (s.lvl) lv[p.pid] = s.lvl; }
      const g = { sc, lv, gl: globs.map(x => [x.id, r2(x.x), r2(x.z)]), pd: puddles.map(p => [p.id, p.x, p.z]), cd: countdown > 0 ? Math.ceil(countdown) : 0, left: Math.ceil(Math.max(0, time)) };
      if (nGhosts) g.gh = [...S.values()].filter(s => s.ghost).map(s => [s.id, r2(s.b.x), r2(s.b.z), s.lvl, s.b.flags]);
      return g;
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = S.get(p.pid), k = s.pts; scores[p.pid] = k; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
    who: id => S.get(id), get puddles() { return puddles; }, get globs() { return globs; },
  };
}
