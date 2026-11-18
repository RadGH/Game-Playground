// Bosses: one huge enemy now and then (owner: "fight one tough boss occasionally"), PART-BREAKABLE (owner ruling), and
// never announced with a warning screen or big centre text — a comms character mentions it (the HUD speaks mission
// comms lines tagged event 'boss' / 'bossPart' / 'bossOpen' / 'bossPhase' / 'bossDown' when these events fire).
//
// The first boss is the Broodmother (data/enemies.json `broodmother`, job 'boss', City Kit recipe `sw-broodmother`):
//   • parts are hit zones round her body, each a bearing from her facing (`at`, degrees; 0 = straight ahead) and a
//     half-width (`arc`). A shot that lands in a zone damages the part AND, less, the body (`bodyShare`); shots that
//     land between zones hit the body; blasts and beams hit her bulk (`blastShare`). Breaking a part: event 'bossPart', a burst, a boss material
//     (`bossMat`, chapter 1 = chitin) for every player, and the model shows the stump (recipe param brk_<part>).
//   • egg sacs spawn swarmers on a timer until broken; each broken claw slows her and weakens the claw swipe;
//     the head plate is armoured (`lockedBy`) until both sacs are gone, then it is a weak point (`weak`).
//   • phases at 66% and 33% health (`phases`): she rears up, calls a brood wave, and adds an attack — first the
//     charge, then the spit barrage. Each phase triggers once.
//   • every attack winds up first and marks the ground (claw arc, charge lane, barrage circles) — never an instant,
//     unavoidable hit (lessons 39).
//   • she is too big for the streets: buildings she pushes against are crushed and fall (the city is destructible).
// Pure: no DOM; randomness from S.rng. Rendering: js/render/boss-art.js.
import { angleDiff } from './weapons.js';
import { lotAt, damageLot } from './world.js';

const DEG = Math.PI / 180;

/** A clear spot for a boss near (x, z): no standing building under her body, inside the map, not on a player. */
export function bossSpot(S, x, z, r) {
  const W = S.world;
  const ok = (px, pz) => {
    if (px < r + 0.3 || pz < r + 0.3 || px > W.w - r - 0.3 || pz > W.h - r - 0.3) return false;
    for (let k = 0; k <= 8; k++) {                                 // the centre and eight points on her outline
      const a = k / 8 * Math.PI * 2, q = k ? r * 0.85 : 0, l = lotAt(W, px + Math.cos(a) * q, pz + Math.sin(a) * q);
      if (l && l.solid && l.stage < 3) return false;
    }
    return !S.mechs.some(m => m.team !== 'enemy' && !m.down && Math.hypot(m.x - px, m.z - pz) < Math.max(3, S.T.spawnSafeRadius * 0.8));
  };
  if (ok(x, z)) return { x, z };
  for (let rr = 0.5; rr <= 12; rr += 0.5) {
    const n = Math.ceil(rr * 8), a0 = S.rng.next() * Math.PI * 2;
    for (let k = 0; k < n; k++) { const a = a0 + k / n * Math.PI * 2, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; if (ok(px, pz)) return { x: px, z: pz }; }
  }
  return null;
}

/** Called once by spawn(): give the enemy its parts, phases and timers from its kind. */
export function initBoss(S, e, K) {
  const hpMul = S.T.enemyHealth * (S.hpScale || 1);   // a bigger team: every part tougher too
  e.boss = true; e.bodyR = K.bodyRadius || e.r * 0.6;
  e.parts = (K.parts || []).map(p => ({ id: p.id, label: p.label, hp: p.hp * hpMul, hpMax: p.hp * hpMul, broken: false, locked: !!p.lockedBy?.length, at: p.at * DEG, arc: p.arc * DEG }));
  e.phase = 0; e.atk = null; e.stagger = 0; e.out = 0;
  e.cds = { claw: 1.5, charge: (K.charge?.cd || 7) * 0.5, barrage: (K.barrage?.cd || 8) * 0.4, lob: 2 };
  e.sacT = {}; for (const p of K.parts || []) if (p.spawn) e.sacT[p.id] = p.spawnEvery * 0.6;
  S.events.push({ type: 'boss', id: e.id, kind: e.kind, name: K.name, x: e.x, z: e.z });
}

/** Where a part sits in the world now (its bearing and distance from her centre, turned with her facing). */
export function partWorld(S, e, partId) {
  const P = (S.kinds[e.kind].parts || []).find(p => p.id === partId); if (!P) return { x: e.x, z: e.z };
  const a = e.face + P.at * DEG, d = (P.dist ?? 0.5) * e.r;
  return { x: e.x + Math.cos(a) * d, z: e.z + Math.sin(a) * d };
}

/** Route one hit by where it landed. Returns { amount: what the body takes, shown: the number to show (null = body),
 *  part, armoured }. Hits at her exact centre (blasts, beams, burn) are body hits. */
export function bossHit(S, e, amount, hx, hz, by) {
  const K = S.kinds[e.kind];
  if (Math.abs(hx - e.x) < 1e-6 && Math.abs(hz - e.z) < 1e-6) return { amount: amount * (K.blastShare ?? 1), shown: null, part: null };   // blasts, beams: her bulk soaks some
  const bearing = angleDiff(Math.atan2(hz - e.z, hx - e.x), e.face);
  let best = null, bd = Infinity;
  for (const p of e.parts) { if (p.broken) continue; const d = Math.abs(angleDiff(bearing, p.at)); if (d < p.arc && d < bd) { bd = d; best = p; } }
  if (!best) return { amount, shown: null, part: null };
  if (best.locked) return { amount: amount * (K.armoured ?? 0.25), shown: null, part: best.id, armoured: true };
  const pn = Math.min(best.hp, amount); best.hp -= pn;
  const def = K.parts.find(p => p.id === best.id);
  if (best.hp <= 0) breakPart(S, e, K, best, by);
  return { amount: amount * (def.weak || K.bodyShare || 0.4), shown: amount, part: best.id };
}

function breakPart(S, e, K, p, by) {
  p.broken = true; p.hp = 0;
  const def = K.parts.find(q => q.id === p.id), at = partWorld(S, e, p.id);
  S.events.push({ type: 'bossPart', id: e.id, part: p.id, label: p.label, x: at.x, z: at.z, by });
  e.stagger = Math.max(e.stagger, K.stagger ?? 1.1); if (e.atk && e.atk.kind !== 'dash') e.atk = null;   // she reels
  // the chapter's boss material for every player (each their own drop), plus some scrap
  for (const pl of S.players) {
    for (let i = 0; i < (def.drop ?? 2); i++) S.pickups.push({ id: 'p' + (S.nextId++), owner: pl.id, mat: K.bossMat || 'chitin', n: 1, x: at.x + S.rng.range(-0.25, 0.25), z: at.z + S.rng.range(-0.25, 0.25), t: 0 });
    S.pickups.push({ id: 'p' + (S.nextId++), owner: pl.id, mat: 'scrap', n: 1, x: at.x + S.rng.range(-0.2, 0.2), z: at.z + S.rng.range(-0.2, 0.2), t: 0 });
  }
  // a plate locked by other parts opens once they are all broken
  for (const q of e.parts) {
    if (!q.locked || q.broken) continue;
    const need = K.parts.find(x => x.id === q.id).lockedBy;
    if (need.every(id => e.parts.find(x => x.id === id)?.broken)) { q.locked = false; const w = partWorld(S, e, q.id); S.events.push({ type: 'bossOpen', id: e.id, part: q.id, label: q.label, x: w.x, z: w.z }); }
  }
}

/** How fast she moves now: each broken part with `slow` multiplies it. */
export function bossSpeedMul(S, e) {
  const K = S.kinds[e.kind]; let m = 1;
  for (const p of e.parts) if (p.broken) m *= K.parts.find(q => q.id === p.id).slow ?? 1;
  return m;
}
const alive = (e, id) => { const p = e.parts.find(q => q.id === id); return p && !p.broken; };

/** A spot for her brood: outside buildings, 1.5+ tiles from every player, on her far side from the target. */
function broodSpot(S, e, P) {
  const away = Math.atan2(e.z - P.z, e.x - P.x);
  for (let k = 0; k < 14; k++) {
    const a = away + S.rng.range(-1.4, 1.4), d = e.r + S.rng.range(0.3, 2.2), x = e.x + Math.cos(a) * d, z = e.z + Math.sin(a) * d;
    if (x < 0.3 || z < 0.3 || x > S.world.w - 0.3 || z > S.world.h - 0.3) continue;
    const l = lotAt(S.world, x, z); if (l && l.solid && l.stage < 3) continue;
    if (S.mechs.some(m => m.team !== 'enemy' && !m.down && Math.hypot(m.x - x, m.z - z) < 1.5)) continue;
    return { x, z };
  }
  return null;
}

function hurtInArc(S, e, dir, range, arc, dmg, hitSet = null) {
  let n = 0;
  for (const m of S.mechs) {
    if (m.team === 'enemy' || m.down || hitSet?.has(m.id)) continue;
    const d = Math.hypot(m.x - e.x, m.z - e.z); if (d > range + m.r) continue;
    if (arc < Math.PI && Math.abs(angleDiff(Math.atan2(m.z - e.z, m.x - e.x), dir)) > arc / 2) continue;
    S.hurtPlayer(m, dmg, 'kinetic', e); n++; hitSet?.add(m.id);
  }
  return n;
}

/** Crush the buildings her body presses into (and, charging, ploughs through). */
function crush(S, e, K, amount) {
  const r = e.bodyR + 0.3, seen = new Set();
  for (let k = 0; k < 8; k++) {
    const a = e.face + (k - 3.5) * 0.35, l = lotAt(S.world, e.x + Math.cos(a) * r, e.z + Math.sin(a) * r);
    if (!l || seen.has(l) || !l.solid || l.stage >= 3) continue; seen.add(l);
    damageLot(S.world, l, amount / S.T.buildingArmour, S.events);
  }
}

const turn = (e, want, rate, dt) => { e.face += Math.max(-rate * dt, Math.min(rate * dt, angleDiff(want, e.face))); };

/** The boss job (enemies.js JOBS.boss). g = { dx, dz, dist, ux, uz, toP, slow } toward the target P. */
export function stepBoss(S, e, K, P, g, dt) {
  const T = S.T;
  for (const k in e.cds) e.cds[k] = Math.max(0, e.cds[k] - dt);
  // phases: each threshold once, in order (a big hit that skips one still plays both, one after the other)
  const ph = K.phases || [];
  if (!e.atk && e.phase < ph.length && e.hp / e.hpMax <= ph[e.phase].at) {
    const P0 = ph[e.phase]; e.phase++;
    S.events.push({ type: 'bossPhase', id: e.id, phase: e.phase, x: e.x, z: e.z });
    e.atk = { kind: 'summon', t: 0, wind: P0.roar ?? 1.4, brood: P0.brood, done: false };
  }
  // egg sacs: swarmers drop from each unbroken sac on its timer (capped like a nest)
  for (const def of K.parts || []) {
    if (!def.spawn || !alive(e, def.id)) continue;
    e.sacT[def.id] -= dt;
    if (e.sacT[def.id] > 0 || e.out >= (K.maxOut || 30)) continue;
    e.sacT[def.id] = def.spawnEvery;
    const at = partWorld(S, e, def.id), side = Math.atan2(at.z - e.z, at.x - e.x);
    for (let i = 0; i < def.spawnCount; i++) {
      const a = side + S.rng.range(-0.6, 0.6), d = 0.25 + S.rng.next() * 0.4, x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
      const l = lotAt(S.world, x, z); if (l && l.solid && l.stage < 3) continue;
      if (S.spawn(def.spawn, x, z, { warn: 0.4, parent: e.id })) e.out++;
    }
    S.events.push({ type: 'bossSac', id: e.id, part: def.id, x: at.x, z: at.z });
  }
  const speed = K.speed * bossSpeedMul(S, e) * g.slow;
  if (e.stagger > 0) { e.stagger -= dt; e.vx *= 0.85; e.vz *= 0.85; e.anim = 'roar'; return; }

  const A = e.atk;
  if (A) {
    A.t += dt; e.vx *= 0.8; e.vz *= 0.8;
    if (A.kind === 'summon') {                        // rear up and call a brood wave (spawn warnings show where)
      e.anim = 'summon'; e.animT = A.t;
      if (!A.done && A.t >= A.wind * 0.5) {
        A.done = true;
        for (const [kind, n] of Object.entries(A.brood || {})) for (let i = 0; i < n; i++) { const p = broodSpot(S, e, P); if (p) S.spawn(kind, p.x, p.z, { warn: T.spawnWarn + i * 0.04, parent: null }); }
      }
      if (A.t >= A.wind) e.atk = null;
      return;
    }
    if (A.kind === 'claw') {                          // crouch (lowered stance) while the arc on the ground fills, then swipe
      turn(e, A.dir, 0.4, dt); A.dir = e.face;
      e.anim = 'spit'; e.animT = A.t < A.wind ? 0.13 : 0.32;
      if (!A.hit && A.t >= A.wind) {
        A.hit = true;
        const claws = (K.parts || []).filter(p => p.claw).length || 1, live = (K.parts || []).filter(p => p.claw && alive(e, p.id)).length;
        hurtInArc(S, e, e.face, K.claw.range, K.claw.arc, K.claw.dmg * T.enemyDamage * (live / claws));
        S.events.push({ type: 'bossStrike', id: e.id, kind: 'claw', x: e.x + Math.cos(e.face) * K.claw.range * 0.6, z: e.z + Math.sin(e.face) * K.claw.range * 0.6, r: K.claw.range });
      }
      if (A.t >= A.wind + 0.35) { e.atk = null; e.cds.claw = K.claw.cd; }
      return;
    }
    if (A.kind === 'charge') {                        // the lane is marked and fills; she lowers her head; then the dash
      e.face = A.dir; e.anim = 'spit'; e.animT = 0.13;
      if (A.t >= A.wind) { e.atk = { kind: 'dash', t: 0, dir: A.dir, len: A.len, hit: new Set(), x0: e.x, z0: e.z }; S.events.push({ type: 'bossStrike', id: e.id, kind: 'charge', x: e.x, z: e.z, dir: A.dir }); }
      return;
    }
    if (A.kind === 'dash') {
      const C = K.charge; e.face = A.dir; e.anim = 'crawl'; e.animT += dt * 2;
      e.vx = Math.cos(A.dir) * C.speed; e.vz = Math.sin(A.dir) * C.speed;
      for (const m of S.mechs) {
        if (m.team === 'enemy' || m.down || A.hit.has(m.id)) continue;
        if (Math.hypot(m.x - e.x, m.z - e.z) < e.bodyR + m.r + 0.15) { A.hit.add(m.id); S.hurtPlayer(m, C.dmg * T.enemyDamage, 'kinetic', e); m.vx += Math.cos(A.dir) * 4; m.vz += Math.sin(A.dir) * 4; }
      }
      crush(S, e, K, (K.crush || 1500) * 4 * dt);
      if (Math.hypot(e.x - A.x0, e.z - A.z0) >= A.len || A.t > A.len / C.speed + 0.6) { e.atk = null; e.cds.charge = C.cd; e.vx *= 0.3; e.vz *= 0.3; }
      return;
    }
    if (A.kind === 'barrage') {                       // she spits into the sky; every landing spot is marked first
      e.anim = 'spit'; e.animT = A.t; turn(e, g.toP, 1, dt);
      if (A.t >= A.dur) { e.atk = null; e.cds.barrage = K.barrage.cd; }
      return;
    }
  }

  // choose: barrage (phase 3) → charge (phase 2+) → claw swipe in reach → spit a glob when clawless → crawl closer
  const B = K.barrage, C = K.charge, see = S.canSee(e, P);
  if (e.phase >= 2 && B && e.cds.barrage <= 0 && g.dist > 1.6 && g.dist < 12) {
    const targets = S.mechs.filter(m => m.team !== 'enemy' && !m.down);
    let i = 0;
    for (const m of targets) for (let k = 0; k < Math.ceil(B.count / targets.length); k++, i++) {
      const a = S.rng.next() * Math.PI * 2, rr = k === 0 ? 0 : S.rng.range(0.6, 1.9);
      S.strikes.push({ x: m.x + m.vx * 0.5 + Math.cos(a) * rr, z: m.z + m.vz * 0.5 + Math.sin(a) * rr, r: B.r, t: B.warn + i * B.gap, dmg: B.dmg * T.enemyDamage, dtype: 'fire', owner: e.id, team: 'enemy' });
    }
    e.atk = { kind: 'barrage', t: 0, dur: B.warn + i * B.gap };
    S.events.push({ type: 'bossStrike', id: e.id, kind: 'barrage', x: e.x, z: e.z });
    return;
  }
  if (e.phase >= 1 && C && e.cds.charge <= 0 && g.dist > 1.8 && g.dist < C.len + 1 && see) {
    e.atk = { kind: 'charge', t: 0, wind: C.wind, dir: g.toP, len: Math.min(C.len, g.dist + 1.5), w: C.width };
    S.events.push({ type: 'bossWind', id: e.id, kind: 'charge', x: e.x, z: e.z, dir: g.toP });
    return;
  }
  const clawsLeft = (K.parts || []).some(p => p.claw && alive(e, p.id));
  if (K.claw && clawsLeft && e.cds.claw <= 0 && g.dist < K.claw.range + P.r - 0.1 && Math.abs(angleDiff(g.toP, e.face)) < 1.0) {
    e.atk = { kind: 'claw', t: 0, wind: K.claw.wind, dir: e.face };
    S.events.push({ type: 'bossWind', id: e.id, kind: 'claw', x: e.x, z: e.z, dir: e.face });
    return;
  }
  if (K.lob && e.cds.lob <= 0 && g.dist < K.lob.range && (!clawsLeft || g.dist > (K.claw?.range || 1.2) + 0.8)) {   // out of claw reach (or clawless): acid globs, an arc + a landing ring
    e.cds.lob = K.lob.cd * (clawsLeft ? 1 : 0.6); e.anim = 'spit'; e.animT = 0.32;
    const sp = K.lob.speed, t = g.dist / sp, gr = 4.9;
    S.shots.push({ owner: e.id, team: 'enemy', kind: 'lob', lob: true, dtype: 'fire', dmg: K.lob.dmg * T.enemyDamage, splash: K.lob.splash, x: e.x + Math.cos(e.face) * e.r * 0.8, z: e.z + Math.sin(e.face) * e.r * 0.8, y: 0.5,
      vx: g.ux * sp, vz: g.uz * sp, vy: (gr * t * t * 0.5 - 0.5) / t, g: gr, life: t, age: 0, hits: [], tx: P.x, tz: P.z, warn: true });
    S.events.push({ type: 'eshot', id: e.id, kind: e.kind, x: e.x, z: e.z, dir: g.toP, tx: P.x, tz: P.z, t });
    return;
  }
  // crawl toward the target (the streets' flow field when the straight way is blocked), turning slowly like a giant
  const want = Math.atan2(g.uz, g.ux);
  turn(e, want, K.turn || 1.4, dt);
  const close = g.dist < (K.claw?.range || 1.2) * 0.8;
  const k = close ? 0 : Math.max(0, Math.cos(angleDiff(want, e.face)));
  e.vx += (Math.cos(e.face) * speed * k - e.vx) * Math.min(1, 3 * dt); e.vz += (Math.sin(e.face) * speed * k - e.vz) * Math.min(1, 3 * dt);
  e.anim = 'crawl';
  crush(S, e, K, (K.crush || 1500) * dt);
}

/** Called when she dies: she keeps lying where she fell (the renderer plays her death), and the comms hear it. */
export function bossDied(S, e) {
  e.deadT = 1; e.diedAt = S.time; e.anim = 'die'; e.atk = null;
  S.events.push({ type: 'bossDown', id: e.id, kind: e.kind, x: e.x, z: e.z });
}
