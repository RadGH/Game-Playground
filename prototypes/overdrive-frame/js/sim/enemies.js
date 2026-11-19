// Enemies: each kind has ONE readable job (twin-stick staple "enemy-jobs"): chase, pounce, lob, charge, burrow, burst,
// spawn (nests), shoot, artillery, carrier, strafe (flyers), missiles, jam, snipe. Numbers come from data/enemies.json.
// Swarms keep apart (no stacking) with a cheap push from their grid neighbours. Pure.
import { angleDiff } from './weapons.js';
import { isStunned, tickStatus, slowOf, STATUS } from './damage.js';
import { pushOut } from './world.js';
import { flowDir, flowDist } from './flow.js';
import { stepBoss } from './boss.js';
import { ROLE_JOBS } from './roles.js';

/** A new enemy. warn = seconds it shows as a flash before it is real (spawn warning — never a surprise). */
export function makeEnemy(kind, K, x, z, T, { id, warn = 0, elite = false, boss = false } = {}) {
  const hp = K.hp * T.enemyHealth * (elite ? 3 : 1);
  return {
    id, kind, x, z, y: K.flying || 0, vx: 0, vz: 0, r: K.radius * (elite ? 1.25 : 1), hp, hpMax: hp,
    face: 0, aim: 0, cd: K.cd ? K.cd * 0.5 : 1, t: 0, state: warn > 0 ? 'warn' : 'move', stateT: warn,
    burstLeft: 0, out: 0, armour: K.armour || 0, frontArmour: K.frontArmour || 0, resist: K.resist || {}, elite, boss,
    status: {}, dead: false, anim: 'walk', animT: 0, hidden: K.job === 'burrow', target: null, lastHitBy: null,
    flying: K.flying || 0, structure: !!K.structure, dummy: !!K.dummy, quiet: 0,
  };
}

const D2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** Nearest living, standing player mech to an enemy. */
function nearestPlayer(S, e) {
  let best = null, bd = Infinity;
  for (const m of S.mechs) { if (m.down || m.team === 'enemy') continue; const d = D2(m, e); if (d < bd) { bd = d; best = m; } }   // never a rival ace
  // escort missions: the convoy's trucks are targets too (a little less tempting than a mech that's shooting you)
  if (S.allies) for (const a of S.allies) { if (a.down || a.arrived) continue; const d = D2(a, e) * 1.3; if (d < bd) { bd = d; best = a; } }
  if (S.decoys) for (const a of S.decoys) { if (a.down) continue; const d = D2(a, e) * 0.5; if (d < bd) { bd = d; best = a; } }   // round 7: a Decoy Holo is the most tempting thing in sight
  return best;
}

/** One step for every enemy. Pushes events: 'espawn' (real), 'eattack', 'eshot', 'leap', 'burst', 'emerge'. */
export function stepEnemies(S, dt, T) {
  const KINDS = S.kinds;
  for (const e of S.enemies) {
    if (e.dead) continue;
    const K = KINDS[e.kind];
    e.t += dt; e.animT += dt;
    if (e.state === 'warn') { e.stateT -= dt; if (e.stateT <= 0) { e.state = 'move'; S.events.push({ type: 'espawn', id: e.id, kind: e.kind, x: e.x, z: e.z }); } continue; }
    const burn = tickStatus(e, dt); if (burn > 0) S.damageEnemy(e, burn, 'fire', null, 0);
    if (e.dead) continue;
    if (e.status.rift > 0 && e.riftX != null) {     // round 7 void: tugged toward where the hit landed
      const dx = e.riftX - e.x, dz = e.riftZ - e.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const k = Math.min(d, STATUS.rift.pull * dt) / d; e.x += dx * k; e.z += dz * k; }
    }
    if (isStunned(e)) { e.vx *= 0.8; e.vz *= 0.8; e.anim = e.status.frozen > 0 ? e.anim : 'walk'; if (e.status.frozen > 0) { e.vx = 0; e.vz = 0; e.animT -= dt; } continue; }
    const slow = slowOf(e);                           // shock halves, round 7 cryo chill slows
    const P = nearestPlayer(S, e); e.target = P ? P.id : null;
    e.cd = Math.max(0, e.cd - dt * (e.status.chill > 0 ? STATUS.chill.mul : 1));   // round 7: a chilled enemy attacks slower too
    if (!P) { e.vx *= 0.9; e.vz *= 0.9; moveBody(S, e, dt); continue; }
    const dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 1e-6;
    let ux = dx / dist, uz = dz / dist;
    // through the streets: when the way round is clearly longer than a straight line, follow the shared flow field
    if (S.flow && !e.flying && !e.hidden && dist > 0.9 && flowDist(S.flow, e.x, e.z) > dist * 1.12 + 0.6) { const f = flowDir(S.flow, e.x, e.z); if (f) { ux = f[0]; uz = f[1]; } }
    const toP = Math.atan2(dz, dx);
    const job = JOBS[K.job] || JOBS.chase;
    job(S, e, K, P, { dx, dz, dist, ux, uz, toP, slow }, dt, T);
    moveBody(S, e, dt);
  }
}

function seek(e, K, ux, uz, speed, dt, grip = 6) { e.vx += (ux * speed - e.vx) * Math.min(1, grip * dt); e.vz += (uz * speed - e.vz) * Math.min(1, grip * dt); }
function keepAt(e, K, g, want, slow, dt) {
  const s = K.speed * slow; const k = g.dist > want + 0.4 ? 1 : g.dist < want - 0.6 ? -0.7 : 0;
  // strafe sideways a little at range so ranged enemies don't stand still
  const side = Math.sin(e.t * 0.7 + e.id.length) * 0.5;
  seek(e, K, g.ux * k - g.uz * side * (k === 0 ? 1 : 0.3), g.uz * k + g.ux * side * (k === 0 ? 1 : 0.3), s, dt, 3);
}
function shootAt(S, e, K, P, g, opts = {}) {
  const lead = opts.lead ?? 0.5, t = g.dist / (K.shotSpeed || 8);
  const tx = P.x + P.vx * t * lead, tz = P.z + P.vz * t * lead, a = Math.atan2(tz - e.z, tx - e.x) + (S.rng.next() - 0.5) * (opts.spread ?? 0.06);
  const sp = K.shotSpeed || 8;
  S.shots.push({ owner: e.id, team: 'enemy', kind: opts.kind || 'bullet', dtype: K.dtype || 'kinetic', dmg: K.dmg * S.T.enemyDamage * (e.elite ? 1.5 : 1),
    splash: opts.splash ?? (K.splash || 0), x: e.x, z: e.z, y: (e.flying || 0) + 0.2, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life: (K.range * 1.25) / sp, age: 0, hits: [], pierce: 0, crit: 0, ...opts.extra });
  e.aim = a; S.events.push({ type: 'eshot', id: e.id, kind: e.kind, x: e.x, z: e.z, dir: a });
}

export const JOBS = {
  chase(S, e, K, P, g, dt) {
    if (g.dist > K.range + P.r) { seek(e, K, g.ux, g.uz, K.speed * g.slow, dt); e.anim = 'walk'; }
    else { e.vx *= 0.7; e.vz *= 0.7; if (e.cd <= 0) { e.cd = K.cd; S.hurtPlayer(P, K.dmg * S.T.enemyDamage * (e.elite ? 1.5 : 1), K.dtype || 'kinetic', e); e.anim = 'attack'; e.animT = 0; S.events.push({ type: 'eattack', id: e.id, kind: e.kind, x: e.x, z: e.z }); } }
    e.face = Math.atan2(e.vz, e.vx) || g.toP;
  },
  pounce(S, e, K, P, g, dt) {
    if (e.state === 'leap') { e.stateT -= dt; if (e.stateT <= 0) { e.state = 'move'; if (D2(e, P) < (P.r + e.r + 0.25) ** 2) S.hurtPlayer(P, K.dmg * S.T.enemyDamage, 'kinetic', e); } return; }
    if (g.dist < K.range && e.cd <= 0) {
      e.cd = K.cd; e.state = 'leap'; e.stateT = g.dist / K.leapSpeed + 0.05; e.vx = g.ux * K.leapSpeed; e.vz = g.uz * K.leapSpeed; e.anim = 'leap'; e.animT = 0;
      S.events.push({ type: 'leap', id: e.id, x: e.x, z: e.z, tx: P.x, tz: P.z });
    } else { JOBS.chase(S, e, { ...K, range: 0.2 }, P, g, dt); e.cd = Math.max(0, e.cd); }
    e.face = g.toP;
  },
  lob(S, e, K, P, g, dt) {
    keepAt(e, K, g, K.keep, g.slow, dt); e.face = g.toP; e.anim = 'walk';
    if (g.dist < K.range && e.cd <= 0) {
      e.cd = K.cd * S.rng.range(0.85, 1.2); e.anim = 'spit'; e.animT = 0;
      const sp = K.shotSpeed, t = g.dist / sp, gr = 4.9;
      S.shots.push({ owner: e.id, team: 'enemy', kind: 'lob', lob: true, dtype: K.dtype, dmg: K.dmg * S.T.enemyDamage, splash: K.splash, x: e.x, z: e.z, y: 0.15,
        vx: g.ux * sp, vz: g.uz * sp, vy: (gr * t * t * 0.5 - 0.15) / t, g: gr, life: t, age: 0, hits: [], tx: P.x, tz: P.z, warn: true, status: 0.6 });
      S.events.push({ type: 'eshot', id: e.id, kind: e.kind, x: e.x, z: e.z, dir: g.toP, tx: P.x, tz: P.z, t });
    }
  },
  charge(S, e, K, P, g, dt) {
    if (e.state === 'charge') {
      e.stateT -= dt; seek(e, K, Math.cos(e.face), Math.sin(e.face), K.chargeSpeed, dt, 8); e.anim = 'charge';
      if (D2(e, P) < (P.r + e.r + 0.1) ** 2) { S.hurtPlayer(P, K.dmg * S.T.enemyDamage, 'kinetic', e); P.vx += Math.cos(e.face) * 3; P.vz += Math.sin(e.face) * 3; e.state = 'move'; e.cd = K.cd; S.events.push({ type: 'eattack', id: e.id, kind: e.kind, x: e.x, z: e.z, slam: true }); }
      if (e.stateT <= 0 || e.bumped) { e.state = 'move'; e.cd = K.cd * 0.6; e.bumped = false; }
      return;
    }
    // walk the streets (the flow field's way) until the target is in plain view, then turn and charge in a line
    const open = g.dist < 4 && S.canSee(e, P);
    const want = open ? g.toP : Math.atan2(g.uz, g.ux);
    e.face = e.face + Math.max(-dt * 2.5, Math.min(dt * 2.5, angleDiff(want, e.face)));
    if (open && e.cd <= 0 && Math.abs(angleDiff(g.toP, e.face)) < 0.25) { e.state = 'charge'; e.stateT = 1.4; S.events.push({ type: 'charge', id: e.id, x: e.x, z: e.z, dir: e.face }); }
    else { seek(e, K, Math.cos(e.face), Math.sin(e.face), K.speed * g.slow, dt, 3); e.anim = 'walk'; }
  },
  burrow(S, e, K, P, g, dt) {
    if (e.hidden) {   // underground: fast, can't be hit; a ripple shows where (no unfair surprise)
      seek(e, K, g.ux, g.uz, K.speed, dt); e.anim = 'burrow';
      if (g.dist < 0.9) { e.hidden = false; e.cd = 0.5; e.anim = 'emerge'; e.animT = 0; S.events.push({ type: 'emerge', id: e.id, x: e.x, z: e.z }); }
      return;
    }
    JOBS.chase(S, e, K, P, g, dt);
    if (g.dist > 4) { e.hidden = true; }
  },
  burst(S, e, K, P, g, dt) {
    if (e.state === 'fuse') { e.stateT -= dt; e.vx *= 0.85; e.vz *= 0.85; e.anim = 'swell'; if (e.stateT <= 0) S.killEnemy(e, null, true); return; }
    if (g.dist < K.range + P.r) { e.state = 'fuse'; e.stateT = K.fuse; S.events.push({ type: 'fuse', id: e.id, x: e.x, z: e.z, r: K.splash }); }
    else { seek(e, K, g.ux, g.uz, K.speed * g.slow, dt); e.anim = 'walk'; e.face = g.toP; }
  },
  spawn(S, e, K, P, g, dt) {
    e.vx = 0; e.vz = 0; e.anim = 'idle';
    if (e.cd <= 0 && e.out < K.maxOut && g.dist < 18) {
      e.cd = K.spawnEvery; e.anim = 'spawn'; e.animT = 0;
      for (let i = 0; i < K.spawnCount; i++) { const a = S.rng.next() * Math.PI * 2; const c = S.spawn(K.spawn, e.x + Math.cos(a) * (e.r + 0.15), e.z + Math.sin(a) * (e.r + 0.15), { warn: 0.25, parent: e.id }); if (c) e.out++; }
    }
  },
  shoot(S, e, K, P, g, dt) {
    keepAt(e, K, g, K.keep, g.slow, dt); e.face = Math.atan2(e.vz, e.vx) || g.toP; e.anim = 'walk';
    if (g.dist < K.range && e.cd <= 0 && S.canSee(e, P)) {
      shootAt(S, e, K, P, g, { splash: K.splash });
      e.anim = 'fire'; e.animT = 0;
      if (K.burst) { e.burstLeft = (e.burstLeft || K.burst) - 1; e.cd = e.burstLeft > 0 ? K.cd : K.burstGap; if (e.burstLeft <= 0) e.burstLeft = 0; } else e.cd = K.cd * S.rng.range(0.85, 1.15);
    }
  },
  artillery(S, e, K, P, g, dt) {
    keepAt(e, K, g, K.keep, g.slow, dt); e.face = g.toP; e.anim = 'walk';
    if (g.dist < K.range && e.cd <= 0) {   // marks circles first, then shells land (never undodgeable — lessons 39)
      e.cd = K.cd; e.anim = 'fire'; e.animT = 0;
      for (let i = 0; i < K.salvo; i++) {
        const a = S.rng.next() * Math.PI * 2, rr = S.rng.range(0, 1.2);
        S.strikes.push({ x: P.x + P.vx * 0.8 + Math.cos(a) * rr, z: P.z + P.vz * 0.8 + Math.sin(a) * rr, r: K.splash, t: K.warn + i * 0.25, dmg: K.dmg * S.T.enemyDamage, dtype: K.dtype, owner: e.id, team: 'enemy' });
      }
      S.events.push({ type: 'eshot', id: e.id, kind: e.kind, x: e.x, z: e.z, dir: g.toP });
    }
  },
  carrier(S, e, K, P, g, dt) {
    keepAt(e, K, g, 5, g.slow, dt); e.face = Math.atan2(e.vz, e.vx) || g.toP; e.anim = 'drive';
    if (e.cd <= 0 && e.out < K.maxOut && g.dist < 10) { e.cd = K.spawnEvery; e.anim = 'open'; e.animT = 0; for (let i = 0; i < K.spawnCount; i++) { if (S.spawn(K.spawn, e.x - Math.cos(e.face) * 0.3, e.z - Math.sin(e.face) * 0.3, { warn: 0.3, parent: e.id })) e.out++; } }
  },
  strafe(S, e, K, P, g, dt) {      // flyers circle the target and fire in passes
    const orbit = K.range * 0.7, tang = (e.id.charCodeAt(e.id.length - 1) % 2 ? 1 : -1);
    const want = g.dist > orbit ? 1 : -0.4;
    seek(e, K, g.ux * want - g.uz * tang * 0.8, g.uz * want + g.ux * tang * 0.8, K.speed * g.slow, dt, 2.5);
    e.face = Math.atan2(e.vz, e.vx); e.anim = 'fly';
    if (g.dist < K.range && e.cd <= 0) {
      shootAt(S, e, K, P, g, { spread: 0.12 }); e.anim = 'fire';
      if (K.burst) { e.burstLeft = (e.burstLeft || K.burst) - 1; e.cd = e.burstLeft > 0 ? K.cd : K.burstGap; } else e.cd = K.cd * S.rng.range(0.8, 1.3);
    }
  },
  missiles(S, e, K, P, g, dt) {
    e.vx = 0; e.vz = 0; e.face = g.toP; e.anim = 'idle';
    if (g.dist < K.range && e.cd <= 0) {
      e.cd = K.cd; e.anim = 'fire'; e.animT = 0;
      S.events.push({ type: 'missileWarn', id: e.id, target: P.id, x: e.x, z: e.z });   // a lock tone before launch
      for (let i = 0; i < K.salvo; i++) S.delayed.push({ t: 0.5 + i * 0.22, fn: 'enemyMissile', e: e.id, p: P.id });
    }
  },
  // test-range targets: never attack; refill after K.refill seconds without a hit; the moving kind walks back and forth
  dummy(S, e, K, P, g, dt) {
    e.quiet += dt; if (e.quiet >= (K.refill || 3)) e.hp = e.hpMax;
    e.home ||= { x: e.x, z: e.z }; e.face = K.faceTo ?? Math.PI / 2; e.anim = 'idle';
    if (!K.patrol) { e.vx = 0; e.vz = 0; e.x = e.home.x; e.z = e.home.z; return; }
    e.dir ||= 1;
    if (e.x > e.home.x + K.patrol) e.dir = -1; else if (e.x < e.home.x - K.patrol) e.dir = 1;
    e.vx = e.dir * K.speed; e.vz = 0; e.z = e.home.z; e.anim = 'walk';
  },
  boss(S, e, K, P, g, dt) { stepBoss(S, e, K, P, g, dt); },     // part-breakable bosses: sim/boss.js
  jam(S, e, K, P, g, dt) { keepAt(e, K, g, K.keep, g.slow, dt); e.face = Math.atan2(e.vz, e.vx) || g.toP; e.anim = 'drive'; e.jamming = true; },
  snipe(S, e, K, P, g, dt) {
    if (e.state === 'aim') {
      e.stateT -= dt; e.vx *= 0.8; e.vz *= 0.8; e.aim = g.toP; e.anim = 'aim';
      if (!S.canSee(e, P)) { e.state = 'move'; e.cd = 1; return; }
      if (e.stateT <= 0) { e.state = 'move'; e.cd = K.cd; shootAt(S, e, K, P, g, { lead: 0, spread: 0.01, kind: 'rail', extra: { pierce: 0 } }); e.anim = 'fire'; e.animT = 0; }
      return;
    }
    keepAt(e, K, g, K.keep, g.slow, dt); e.face = Math.atan2(e.vz, e.vx) || g.toP; e.anim = 'walk';
    if (g.dist < K.range && e.cd <= 0 && S.canSee(e, P)) { e.state = 'aim'; e.stateT = K.aimTime; S.events.push({ type: 'aimline', id: e.id, target: P.id, t: K.aimTime }); }
  },
};

// round 5 roles (sim/roles.js): flame (Flamer), shieldgen (Bulwark), heal (Field medic), drift (Spore drifter)
Object.assign(JOBS, ROLE_JOBS);

/** Move and keep apart (swarm spacing) — grid neighbours push each other; buildings push out. */
function moveBody(S, e, dt) {
  if (!e.structure && !e.boss) {
    const sep = S.T.swarmSep;
    S.grid.near(e.x, e.z, e.r + sep + 0.3, o => {
      if (o === e || o.dead || o.flying !== e.flying || o.hidden !== e.hidden) return;
      const dx = e.x - o.x, dz = e.z - o.z, min = e.r + o.r + sep * 0.5, d2 = dx * dx + dz * dz;
      if (d2 > 1e-8 && d2 < min * min) { const d = Math.sqrt(d2), k = (min - d) / d * 0.5; e.x += dx * k; e.z += dz * k; }
    });
  }
  e.x += e.vx * dt; e.z += e.vz * dt;
  if (!e.flying && !e.hidden) { if (pushOut(S.world, e, e.bodyR || e.r)) e.bumped = true; }
  else { e.x = Math.max(0.2, Math.min(S.world.w - 0.2, e.x)); e.z = Math.max(0.2, Math.min(S.world.h - 0.2, e.z)); }
}
