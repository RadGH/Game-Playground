// The Juggernaut: the second boss — a Halden-Voss siege walker (data/enemies.json `juggernaut`, `walker: true`, City
// Kit recipe `ar-juggernaut`). It shares the boss rules in sim/boss.js (parts as hit zones by bearing, part drops of the
// boss material for every player, phases once each, a short stagger when a part breaks, no warning screen — the comms
// mention it) and fights its own way here:
//   • SHIELD: while the generator on its back stands, a dome covers the hull: the hull takes only `shield.cut` of every
//     hit (parts still take full damage). Break the generator (it faces backwards — flank it) and the hull is open.
//   • LEGS: each broken leg slows it (`slow`); the second one brings it down on its knees (a long stagger, `kneel`) and
//     from then on it can no longer stomp.
//   • every attack is marked on the ground before it lands (lessons 39):
//       cannon  — a long lane from its gun fills, then one heavy shell hits everything inside the lane (and the first
//                 tall building in the way, where the lane stops);
//       barrage — the missile racks fire into the sky; a red circle fills under every landing spot (S.strikes);
//                 fewer racks, fewer missiles;
//       stomp   — a ring round it fills, then it slams down: everything inside is hurt and thrown out;
//       mines   — (from phase 2) a row of landing spots across your path fills, then mines drop there and blink;
//                 a mine you step near arms a red circle that fills (S.strikes) and then blows.
//   • phases at its health shares (`phases`): it reels, a siren calls an army wave in (spawn warnings show where).
// Pure: no DOM; randomness from S.rng. Rendering: js/render/walker-art.js (dome, lanes, rings, mines).
import { angleDiff } from './weapons.js';
import { lotAt, damageLot } from './world.js';
import { bossSpeedMul, crush, turn, broodSpot } from './boss.js';

const isLeg = (K, id) => !!K.parts?.find(p => p.id === id)?.leg;
const isRack = (K, id) => !!K.parts?.find(p => p.id === id)?.rack;
const live = (e, id) => { const p = e.parts.find(q => q.id === id); return !!p && !p.broken; };
export const legsBroken = (e, K) => e.parts.filter(p => p.broken && isLeg(K, p.id)).length;

/** The dome is up while the shield generator part stands. */
export function shieldUp(e, K) { return !!K.shield && live(e, K.shield.part); }

/** Called by initBoss for a walker: its own attack timers, no mines yet. */
export function initWalker(S, e, K) {
  e.cds = { cannon: K.cannon.cd * 0.5, barrage: K.barrage.cd * 0.6, stomp: 1.5, mines: K.mines.cd * 0.5 };
  e.mines = []; e.shield = shieldUp(e, K); e.kneel = false;
}

/** Called by breakPart: the generator takes the dome down; the second broken leg brings it to its knees. */
export function walkerPartBroken(S, e, K, p) {
  e.shield = shieldUp(e, K);
  if (isLeg(K, p.id) && !e.kneel && legsBroken(e, K) >= (K.lameAt || 2)) {
    e.kneel = true; e.stagger = Math.max(e.stagger, K.kneel || 3); e.atk = null;
    S.events.push({ type: 'bossKneel', id: e.id, x: e.x, z: e.z });
  }
}

/** Called by bossDied: its mines shut down with it. */
export function walkerDied(S, e) {
  for (const n of e.mines || []) S.events.push({ type: 'mineOff', id: e.id, x: n.x, z: n.z });
  e.mines = [];
}

/** How far the cannon lane reaches along dir: its full length, or up to the first building taller than the shell. */
export function laneLength(S, e, dir, max) {
  const cx = Math.cos(dir), cz = Math.sin(dir);
  for (let d = e.r * 0.7; d <= max; d += 0.2) {
    const x = e.x + cx * d, z = e.z + cz * d;
    if (x < 0 || z < 0 || x >= S.world.w || z >= S.world.h) return { len: d, lot: null };
    const l = lotAt(S.world, x, z);
    if (l && l.solid && l.stage < 3 && l.h > 0.4) return { len: d + 0.1, lot: l };
  }
  return { len: max, lot: null };
}

/** Is (x, z) inside a lane from (x0, z0) along dir, len long and w wide (r = the thing's own radius)? */
export function inLane(x0, z0, dir, len, w, x, z, r = 0) {
  const cx = Math.cos(dir), cz = Math.sin(dir), rx = x - x0, rz = z - z0;
  const along = rx * cx + rz * cz, side = Math.abs(-rx * cz + rz * cx);
  return along >= -r && along <= len + r && side <= w / 2 + r;
}

function fireCannon(S, e, K, A) {
  const C = K.cannon, cx = Math.cos(A.dir), cz = Math.sin(A.dir);
  for (const m of S.mechs) {
    if (m.team === 'enemy' || m.down) continue;
    if (!inLane(A.x0, A.z0, A.dir, A.len, A.w, m.x, m.z, m.r)) continue;
    S.hurtPlayer(m, C.dmg * S.T.enemyDamage, 'explosive', e);
    m.vx += cx * (C.knock || 3); m.vz += cz * (C.knock || 3);
  }
  const lot = A.lot != null ? S.world.lots[A.lot] : null;
  if (lot) damageLot(S.world, lot, C.dmg * 4 / S.T.buildingArmour, S.events);      // the shell blows into the building
  const ex = A.x0 + cx * A.len, ez = A.z0 + cz * A.len;
  S.events.push({ type: 'bossStrike', id: e.id, kind: 'cannon', x: A.x0, z: A.z0, dir: A.dir, len: A.len, x2: ex, z2: ez });
  S.events.push({ type: 'boom', x: ex, z: ez, r: 0.6, dtype: 'explosive', team: 'enemy' });
}

/** A row of mine spots across the target's path (perpendicular to the walker → target line), never in a building. */
function mineLine(S, e, K, P) {
  const M = K.mines, dir = Math.atan2(P.z - e.z, P.x - e.x), nx = -Math.sin(dir), nz = Math.cos(dir);
  const cx = P.x + (P.vx || 0) * 0.6, cz = P.z + (P.vz || 0) * 0.6, out = [];
  for (let i = 0; i < M.count; i++) {
    const k = (i - (M.count - 1) / 2) * M.gap, x = cx + nx * k + S.rng.range(-0.08, 0.08), z = cz + nz * k + S.rng.range(-0.08, 0.08);
    if (x < 0.3 || z < 0.3 || x > S.world.w - 0.3 || z > S.world.h - 0.3) continue;
    const l = lotAt(S.world, x, z); if (l && l.solid && l.stage < 3) continue;
    out.push({ x, z });
  }
  return out;
}

/** Mines on the ground: armed after `arm` seconds; a frame that comes near trips one — it becomes a red circle that
 *  fills for `fuse` seconds (S.strikes) and then blows. Unused mines switch off after `life` seconds. */
function stepMines(S, e, K, dt) {
  if (!e.mines?.length) return;
  const M = K.mines, keep = [];
  for (const n of e.mines) {
    n.arm = Math.max(0, n.arm - dt); n.life -= dt;
    if (n.life <= 0) { S.events.push({ type: 'mineOff', id: e.id, x: n.x, z: n.z }); continue; }
    if (n.arm <= 0 && S.mechs.some(m => m.team !== 'enemy' && !m.down && Math.hypot(m.x - n.x, m.z - n.z) < M.trigger + m.r)) {
      S.strikes.push({ x: n.x, z: n.z, r: M.r, t: M.fuse, dmg: M.dmg * S.T.enemyDamage, dtype: 'explosive', owner: e.id, team: 'enemy' });
      S.events.push({ type: 'mineTrip', id: e.id, x: n.x, z: n.z });
      continue;
    }
    keep.push(n);
  }
  e.mines = keep;
}

/** The walker's whole turn (boss.js stepBoss hands walkers here). g = { dx, dz, dist, ux, uz, toP, slow }. */
export function stepWalker(S, e, K, P, g, dt) {
  const T = S.T;
  for (const k in e.cds) e.cds[k] = Math.max(0, e.cds[k] - dt);
  stepMines(S, e, K, dt);
  // phases: each threshold once, in order — it reels and a siren calls an army wave
  const ph = K.phases || [];
  if (!e.atk && e.phase < ph.length && e.hp / e.hpMax <= ph[e.phase].at) {
    const P0 = ph[e.phase]; e.phase++;
    S.events.push({ type: 'bossPhase', id: e.id, phase: e.phase, x: e.x, z: e.z });
    e.atk = { kind: 'summon', t: 0, wind: P0.roar ?? 1.5, wave: P0.wave, done: false };
  }
  if (e.stagger > 0) { e.stagger -= dt; e.vx *= 0.85; e.vz *= 0.85; e.anim = 'roar'; return; }

  const A = e.atk;
  if (A) {
    A.t += dt; e.vx *= 0.8; e.vz *= 0.8;
    if (A.kind === 'summon') {
      e.anim = 'roar';
      if (!A.done && A.t >= A.wind * 0.5) {
        A.done = true;
        for (const [kind, n] of Object.entries(A.wave || {})) for (let i = 0; i < n; i++) { const p = broodSpot(S, e, P); if (p) S.spawn(kind, p.x, p.z, { warn: T.spawnWarn + i * 0.05, parent: null }); }
      }
      if (A.t >= A.wind) e.atk = null;
      return;
    }
    if (A.kind === 'cannon') {                       // the lane fills while the gun holds still, then the shell
      e.face = A.dir; e.anim = 'fire'; e.animT = A.t < A.wind ? 0 : A.t - A.wind + 0.13;
      if (!A.hit && A.t >= A.wind) { A.hit = true; fireCannon(S, e, K, A); }
      if (A.t >= A.wind + 0.45) { e.atk = null; e.cds.cannon = K.cannon.cd; }
      return;
    }
    if (A.kind === 'stomp') {                        // the ring fills as it rears up, then the slam
      const St = K.stomp;
      e.anim = 'slam'; e.animT = A.t < A.wind ? (A.t / A.wind) * (2.99 / 8) : 3.2 / 8;
      if (!A.hit && A.t >= A.wind) {
        A.hit = true;
        for (const m of S.mechs) {
          if (m.team === 'enemy' || m.down) continue;
          const dx = m.x - A.x0, dz = m.z - A.z0, d = Math.hypot(dx, dz); if (d > A.r + m.r) continue;
          S.hurtPlayer(m, St.dmg * T.enemyDamage, 'kinetic', e);
          m.vx += dx / (d || 1) * (St.knock || 4); m.vz += dz / (d || 1) * (St.knock || 4);
        }
        crush(S, e, K, (K.crush || 1500) * 1.5);
        S.events.push({ type: 'bossStrike', id: e.id, kind: 'stomp', x: A.x0, z: A.z0, r: A.r });
      }
      if (A.t >= A.wind + 0.5) { e.atk = null; e.cds.stomp = St.cd; }
      return;
    }
    if (A.kind === 'barrage') {                      // racks raised while the circles fill
      e.anim = 'deploy'; e.animT = 2 / 8 + (Math.floor(A.t * 6) % 2) / 8; turn(e, g.toP, 0.6, dt);
      if (A.t >= A.dur) { e.atk = null; e.cds.barrage = K.barrage.cd; }
      return;
    }
    if (A.kind === 'mines') {                        // the landing spots fill, then the mines drop
      e.anim = 'deploy'; e.animT = 2.5 / 8;
      if (!A.done && A.t >= A.wind) {
        A.done = true;
        for (const s of A.spots) e.mines.push({ x: s.x, z: s.z, arm: K.mines.arm, life: K.mines.life });
        S.events.push({ type: 'bossStrike', id: e.id, kind: 'mines', x: e.x, z: e.z, n: A.spots.length });
      }
      if (A.t >= A.wind + 0.4) { e.atk = null; e.cds.mines = K.mines.cd; }
      return;
    }
    e.atk = null;
  }

  // choose: stomp (someone under it) → mines (phase 2+) → missile barrage → cannon (lined up) → walk into range
  const lame = legsBroken(e, K) >= (K.lameAt || 2);
  const St = K.stomp, M = K.mines, B = K.barrage, C = K.cannon;
  if (!lame && St && e.cds.stomp <= 0 && g.dist < St.r + P.r - 0.2) {
    e.atk = { kind: 'stomp', t: 0, wind: St.wind, r: St.r, x0: e.x, z0: e.z };
    S.events.push({ type: 'bossWind', id: e.id, kind: 'stomp', x: e.x, z: e.z, r: St.r });
    return;
  }
  if (M && e.phase >= (M.phase ?? 2) && e.cds.mines <= 0 && g.dist > 1.8 && g.dist < M.range) {
    const spots = mineLine(S, e, K, P);
    if (spots.length) {
      e.atk = { kind: 'mines', t: 0, wind: M.wind, spots };
      S.events.push({ type: 'bossWind', id: e.id, kind: 'mines', x: e.x, z: e.z });
      return;
    }
    e.cds.mines = 1;
  }
  const racks = (K.parts || []).filter(p => p.rack), racksLive = racks.filter(p => live(e, p.id)).length;
  if (B && racksLive && e.cds.barrage <= 0 && g.dist > 1.6 && g.dist < B.range) {
    const targets = S.mechs.filter(m => m.team !== 'enemy' && !m.down);
    const count = Math.max(1, Math.round(B.count * racksLive / racks.length));
    let i = 0;
    for (const m of targets) for (let k = 0; k < Math.ceil(count / targets.length); k++, i++) {
      const a = S.rng.next() * Math.PI * 2, rr = k === 0 ? 0 : S.rng.range(0.6, 1.9);
      S.strikes.push({ x: m.x + m.vx * 0.5 + Math.cos(a) * rr, z: m.z + m.vz * 0.5 + Math.sin(a) * rr, r: B.r, t: B.warn + i * B.gap, dmg: B.dmg * T.enemyDamage, dtype: 'explosive', owner: e.id, team: 'enemy' });
    }
    e.atk = { kind: 'barrage', t: 0, dur: B.warn + i * B.gap };
    S.events.push({ type: 'bossStrike', id: e.id, kind: 'barrage', x: e.x, z: e.z });
    return;
  }
  if (C && live(e, 'cannon') && e.cds.cannon <= 0 && g.dist > 1.2 && g.dist < C.len && Math.abs(angleDiff(g.toP, e.face)) < 0.3) {
    const { len, lot } = laneLength(S, e, e.face, C.len);
    e.atk = { kind: 'cannon', t: 0, wind: C.wind, dir: e.face, len, w: C.width, x0: e.x, z0: e.z, lot: lot ? lot.i : null };   // lot by index: atk goes over the wire
    S.events.push({ type: 'bossWind', id: e.id, kind: 'cannon', x: e.x, z: e.z, dir: e.face, len });
    return;
  }
  // walk: turn toward the target (slowly — it is huge), close in to its preferred range, crush what it leans on
  const want = Math.atan2(g.uz, g.ux);
  turn(e, want, K.turn || 1, dt);
  const speed = K.speed * bossSpeedMul(S, e) * g.slow;
  const k = g.dist > (K.keep || 3.5) ? Math.max(0, Math.cos(angleDiff(want, e.face))) : 0;
  e.vx += (Math.cos(e.face) * speed * k - e.vx) * Math.min(1, 3 * dt); e.vz += (Math.sin(e.face) * speed * k - e.vz) * Math.min(1, 3 * dt);
  e.anim = 'walk';
  if (k < 0.05 && Math.abs(angleDiff(want, e.face)) < 0.05) e.animT -= dt;   // standing still: the legs stop too
  if (k > 0.05) crush(S, e, K, (K.crush || 1500) * dt);
}
