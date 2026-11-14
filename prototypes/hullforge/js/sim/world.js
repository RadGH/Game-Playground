// The simulation: a fixed 60 Hz step over bodies (ships, rocks, wrecks, the station), shots, beams, missiles and
// pickups. Pure: no DOM, no clocks — `w.t` is the only time, randomness comes from `w.rand`. The renderer and the
// sound read `w.events` after each step.
//
// Flight is arcade 6-direction flight: thrust input asks for a velocity and the ship's thrusters get it there
// (flight assist), the nose turns toward the aim direction at the ship's turn rate, Q/E roll.

import { BLOCKS, TURRETS, ORES, RARITY } from '../data/blocks.js';
import { rng, clamp, vadd, vsub, vscale, vdot, vlen, vnorm, vdist, vdist2, vcross, qrot, qinv, qmul, qaxis, qnorm, v3, vrand, DIRS } from '../core/math.js';
import { createGrid, put, remove, key, components, findType, centreOf, sizeOf } from './grid.js';
import { createBody, refresh, toWorld, toLocal, forward, turretFrame, turretDir, aimAngles, PITCH_MIN, PITCH_MAX } from './body.js';
import { rayBody, rayWorld } from './hit.js';
import { SHIELD_DELAY, BREAK_AT } from './stats.js';
import { rollLootItem } from './items.js';

export const DT = 1 / 60;
export const SAFE_RADIUS = 750;          // around the station: no fighting
export const ENEMY_DMG = 0.72;           // enemy guns hit a bit softer than yours (fairness)
export const BOOST_MUL = 1.7, CRUISE_MUL = 3.4;
export const MAGNET = 90;
export const BLAST_SHARE = 2;          // a blast's total damage over all blocks = at most 2× its listed damage

// ------------------------------------------------------------------ knockback (combat feel, round 2)
/**
 * Hits shove the body they land on, like Voidwright. The push is a change of speed: damage × KNOCK_K × how much the
 * shot carries momentum (KNOCK_KIND) ÷ the body's mass, so a light skiff gets shoved and a big hull barely moves.
 * One hit changes speed by at most KNOCK_CAP (KNOCK_CAP_PLAYER for your own ship, so it never takes the controls
 * away), and recent pushes share a pool (KNOCK_POOL × the cap, draining at KNOCK_DRAIN caps per second) so a hail of
 * rounds cannot fling a ship across the map. Shield hits push at KNOCK_SHIELD strength (the bubble spreads the
 * blow). Off-centre hits add a little spin (at most KNOCK_SPIN rad/s per hit). Stations never move; rocks bigger than
 * BIG_ROCK_CELLS cells move only BIG_ROCK_DAMP as much. Mining lasers never push (you would chase your rock).
 */
export const KNOCK_K = 2.5;
export const KNOCK_KIND = { rail: 2.2, shell: 1.2, flak: 0.6, plasma: 0.8, missile: 1, blast: 1.6, beam: 0.3, mine: 0 };
export const KNOCK_CAP = 12, KNOCK_CAP_PLAYER = 6, KNOCK_POOL = 1.6, KNOCK_DRAIN = 4, KNOCK_SHIELD = 0.5, KNOCK_SPIN = 0.25;
export const BIG_ROCK_CELLS = 300, BIG_ROCK_DAMP = 0.05;
/** Heavy guns kick the ship that fires them back a little: RECOIL_K × damage × RECOIL_KIND ÷ mass, at most RECOIL_MAX of top speed. */
export const RECOIL_K = 1.2, RECOIL_KIND = { rail: 1, plasma: 0.6 }, RECOIL_MAX = 0.06;
/** The push (m/s, before caps) that `dmg` of a shot kind gives body b. */
export const knockDv = (b, dmg, kind) => (b?.stats ? dmg * KNOCK_K * (KNOCK_KIND[kind] ?? 0.5) / Math.max(1, b.stats.mass) : 0);
/** Shove body b along `dir` (world) by `dv` m/s, hit at world point p (for spin). Returns the speed change used. */
export function knock(w, b, p, dir, dv) {
  if (!b || b.dead || b.kind === 'station' || !b.stats || !(dv > 0)) return 0;
  const L = vlen(dir); if (!L) return 0;
  if (b.kind === 'rock' && b.grid.cells.size > BIG_ROCK_CELLS) dv *= BIG_ROCK_DAMP;
  const cap = b === w.player ? KNOCK_CAP_PLAYER : KNOCK_CAP;
  const k = b.kb || (b.kb = { v: 0, t: w.t });
  k.v = Math.max(0, k.v - (w.t - k.t) * KNOCK_DRAIN * cap); k.t = w.t;
  const v = Math.min(dv, cap, Math.max(0, cap * KNOCK_POOL - k.v)); if (v <= 0.001) return 0;
  k.v += v;
  const u = vscale(dir, 1 / L);
  b.vel = vadd(b.vel, vscale(u, v));
  if (p) {
    // off-centre: torque = r × push, scaled by the body's size so big hulls hardly turn; angVel is in the body's frame
    const r = vsub(p, b.pos); const R = Math.max(2, b.radius || 2);
    const tq = vscale(vcross(r, u), v / (R * R) * 0.5); const tl = qinv(b.quat, tq);
    const m = vlen(tl); const sc = m > KNOCK_SPIN ? KNOCK_SPIN / m : 1;
    b.angVel = vadd(b.angVel || v3(), vscale(tl, sc));
  }
  return v;
}
/** How fancy a part's effects are: (Mk − 1) + rarity index (0 = plain Mk I common). */
export const itemVis = it => (it ? Math.max(0, (it.tier || 1) - 1) + (it.rarity || 0) : 0);
/** Epic and better parts tint their effects with the rarity colour. */
export const itemRc = it => (it && it.rarity >= 3 ? RARITY[it.rarity].color : null);

export function createWorld(seed) {
  return { t: 0, seed, rand: rng(seed), bodies: [], shots: [], beams: [], pickups: [], events: [], player: null, station: null, combatT: -99, nextSpawn: 30, stats: { kills: 0 } };
}
export function addBody(w, b) { b.born = w.t; w.bodies.push(b); return b; }
export const ships = w => w.bodies.filter(b => b.kind === 'ship' && !b.dead);
// world: who fights whom. Teams: player, hostile (pirates, Hive), neutral (traders), ally (the patrol), friendly
// (stations). A ship marked `angry` (you robbed its convoy, or its faction hates you) fights the player; one under
// `truce` (raiders you joined) does not. Shots and blasts only hit ships their shooter is hostile to, so you can never
// hit a trader or the patrol by accident.
const FOES = { player: ['hostile'], hostile: ['player', 'neutral', 'ally'], neutral: ['hostile'], ally: ['hostile'] };
export const hostile = (a, b) => {
  if ((a.truce && b.team === 'player') || (b.truce && a.team === 'player')) return false;
  if ((a.team === 'player' && b.angry) || (b.team === 'player' && a.angry)) return true;
  return !!FOES[a.team]?.includes(b.team);
};
export const inSafeZone = (w, p) => w.station && vdist(p, w.station.pos) < SAFE_RADIUS;
const ev = (w, e) => { w.events.push(e); return e; };

// ------------------------------------------------------------------ the step
export function step(w) {
  w.t += DT; w.beams.length = 0;
  // world: a ship with its own pilot (traders, escorts, drones…) runs it; other hostile ships use w.brain
  for (const b of w.bodies) if (!b.dead && b.kind === 'ship' && b !== w.player) { if (b.think) b.think(w, b); else if (w.brain && b.team === 'hostile') w.brain(w, b); }
  for (const b of w.bodies) if (!b.dead) moveBody(w, b);
  collide(w);
  for (const b of w.bodies) if (!b.dead && (b.kind === 'ship' || b.armed)) { shields(w, b); turrets(w, b); }   // world: `armed` = an outpost's guns
  stepShots(w);
  stepPickups(w);
  if (w.hooks) for (const h of w.hooks) h(w);      // per-step systems (harpoon, drones, encounters…) push themselves here
  // wrecks fade, far junk goes
  for (const b of w.bodies) if (b.kind === 'wreck' && !b.keep && w.t - b.born > 40) b.dead = true;   // world: `keep` = a job's wreck, a cache
  if (w.bodies.some(b => b.dead)) w.bodies = w.bodies.filter(b => !b.dead || b === w.player);
}

function moveBody(w, b) {
  if (b.kind === 'station') { b.quat = qnorm(qmul(b.quat, qaxis({ x: 0, y: 1, z: 0 }, DT * 0.02))); return; }
  if (b.kind === 'rock' || b.kind === 'wreck') {
    integrate(b); b.vel = vscale(b.vel, b.kind === 'wreck' ? 0.997 : 0.999); return;
  }
  const st = b.stats, inp = b.input;
  if (!st.hasBridge) return;
  // --- linear: ask for a velocity, thrusters get there
  const cruise = inp.boost && b === w.player && w.t - w.combatT > 6 && !w.bodies.some(o => o.kind === 'ship' && o.team === 'hostile' && !o.dead && vdist2(o.pos, b.pos) < 1500 * 1500);
  let mul = 1;
  if (inp.boost && !cruise && b.boostE > 0.02) { mul = BOOST_MUL; b.boostE = Math.max(0, b.boostE - DT / 4); }
  else b.boostE = Math.min(1, b.boostE + DT / 7);
  if (cruise) mul = CRUISE_MUL;
  b.cruise = cruise;
  const t = inp.thrust;
  const want = vscale({ x: t.x * 0.75, y: t.y * 0.75, z: t.z > 0 ? t.z * mul : t.z * 0.6 }, st.maxSpeed);
  const cur = qinv(b.quat, b.vel);
  const acc = st.accel; const k = (cruise ? 2.2 : mul > 1 ? 1.5 : 1) * DT;
  const ax = (d, pos, neg) => { const lim = (d > 0 ? acc[pos] : acc[neg]) * k; return clamp(d, -lim, lim); };
  const dv = { x: ax(want.x - cur.x, 0, 1), y: ax(want.y - cur.y, 2, 3), z: ax(want.z - cur.z, 4, 5) };
  b.thrustOut = { x: dv.x / (k || 1), y: dv.y / (k || 1), z: dv.z / (k || 1) };      // for engine flames
  b.vel = vadd(b.vel, qrot(b.quat, dv));
  // --- rotation: nose toward aimDir, roll on Q/E
  const tr = st.turn * (b.team === 'hostile' ? 0.8 : 1);
  let wantW = { x: 0, y: 0, z: 0 };
  if (inp.aimDir) {
    const tl = qinv(b.quat, inp.aimDir); const ang = Math.acos(clamp(tl.z, -1, 1));
    if (ang > 1e-4) { const axis = vnorm({ x: -tl.y, y: tl.x, z: 0 }); const sp = Math.min(tr, ang * 4); wantW = vscale(axis, sp); }
  }
  wantW.z += (inp.roll || 0) * tr * 1.2;
  const aa = tr * 5 * DT;
  b.angVel = { x: b.angVel.x + clamp(wantW.x - b.angVel.x, -aa, aa), y: b.angVel.y + clamp(wantW.y - b.angVel.y, -aa, aa), z: b.angVel.z + clamp(wantW.z - b.angVel.z, -aa, aa) };
  integrate(b);
}
function integrate(b) {
  b.pos.x += b.vel.x * DT; b.pos.y += b.vel.y * DT; b.pos.z += b.vel.z * DT;
  const a = b.angVel; const ang = vlen(a) * DT;
  if (ang > 1e-9) b.quat = qnorm(qmul(b.quat, qaxis(vscale(a, 1 / vlen(a)), ang)));
}

// ------------------------------------------------------------------ bumping into things
function collide(w) {
  const movers = w.bodies.filter(b => !b.dead && (b.kind === 'ship' || b.kind === 'wreck'));
  const solids = w.bodies.filter(b => !b.dead && (b.kind === 'rock' || b.kind === 'station'));
  for (const m of movers) {
    for (const s of solids) {
      const d = vdist(m.pos, s.pos); if (d > m.radius + s.radius) continue;
      // probe points: centre and the ends of the mover along its nose
      const f = forward(m); const R = Math.max(0.8, m.radius * 0.55);
      for (const k of [0, 1, -1]) {
        const p = vadd(m.pos, vscale(f, k * R));
        const lp = toLocal(s, p); const cx = Math.floor(lp.x), cy = Math.floor(lp.y), cz = Math.floor(lp.z);
        let hitBlk = null;
        for (let dx = -1; dx <= 1 && !hitBlk; dx++) for (let dy = -1; dy <= 1 && !hitBlk; dy++) for (let dz = -1; dz <= 1 && !hitBlk; dz++) hitBlk = s.grid.occ.get(key(cx + dx, cy + dy, cz + dz));
        if (!hitBlk) continue;
        // push out along the line from the solid's block to us, kill the inward speed
        const bc = toWorld(s, centreOf(hitBlk));
        const n = vnorm(vsub(p, bc)); const vn = vdot(vsub(m.vel, s.vel), n);
        m.pos = vadd(m.pos, vscale(n, 0.6));
        if (vn < 0) {
          m.vel = vsub(m.vel, vscale(n, vn * 1.4));
          if (m.kind === 'ship' && -vn > 25 && s.kind === 'rock') { damageAt(w, m, p, -vn * 0.6, 'kinetic', null); ev(w, { type: 'bump', pos: p }); }
        }
        break;
      }
    }
  }
  // ships push each other softly (no damage: allies bumping never hurts)
  const sh = movers.filter(b => b.kind === 'ship');
  for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) {
    const a = sh[i], b = sh[j]; const rr = (a.radius + b.radius) * 0.7; const d2 = vdist2(a.pos, b.pos); if (d2 > rr * rr || d2 < 1e-6) continue;
    const d = Math.sqrt(d2); const n = vscale(vsub(a.pos, b.pos), 1 / d); const push = (rr - d) * 0.5;
    const ma = a.stats.mass, mb = b.stats.mass;
    a.pos = vadd(a.pos, vscale(n, push * mb / (ma + mb))); b.pos = vsub(b.pos, vscale(n, push * ma / (ma + mb)));
  }
}

// ------------------------------------------------------------------ shields
function shields(w, b) {
  const st = b.stats;
  if (st.shield > 0 && w.t - b.lastHit > SHIELD_DELAY) b.shield = Math.min(st.shield, b.shield + st.regen * DT);
}

// ------------------------------------------------------------------ turrets
function enemiesOf(w, b) { return w.bodies.filter(o => o.kind === 'ship' && !o.dead && hostile(b, o)); }
/** Where to aim to hit a moving target with a shot of speed v (lead). */
export function leadPoint(from, tgt, v, tvel, svel = v3()) {
  const rel = vsub(tgt, from); const rv = vsub(tvel, svel);
  const a = vdot(rv, rv) - v * v, bq = 2 * vdot(rel, rv), c = vdot(rel, rel);
  let t;
  if (Math.abs(a) < 1e-6) t = -c / (bq || -1);
  else { const disc = bq * bq - 4 * a * c; if (disc < 0) return tgt; const s = Math.sqrt(disc); const t1 = (-bq - s) / (2 * a), t2 = (-bq + s) / (2 * a); t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2); }
  if (!(t > 0)) return tgt;
  return vadd(tgt, vscale(rv, t));
}

function turrets(w, b) {
  const st = b.stats; const isPlayer = b === w.player; const inp = b.input;
  const foes = enemiesOf(w, b);
  const grace = isPlayer && w.t < (b.grace || 0);
  const safe = inSafeZone(w, b.pos);
  // which turrets may aim on their own: enemies — all; the player — the first `auto` (mining lasers never)
  let autoLeft = isPlayer ? st.auto : 99;
  const missilesNear = isPlayer ? w.shots.filter(s => s.kind === 'missile' && s.team === 'hostile' && vdist2(s.pos, b.pos) < 300 * 300) : [];
  for (const t of b.turrets) {
    const def = t.def, s = t.s; const fr = turretFrame(b, t);
    t.auto = false; t.firing = false; t.beam = false;
    let aimPt = null, tgt = null, manual = false;
    if (isPlayer && inp.fire && inp.aimPoint) { aimPt = inp.aimPoint; manual = true; tgt = inp.aimBody || null; }
    else if (def.fire !== 'mine' && autoLeft > 0) {
      t.auto = true; autoLeft--;
      if (def.fire === 'flak' && missilesNear.length) { const m = nearest(missilesNear, fr.mount); if (m && vdist(m.pos, fr.mount) < s.range) { tgt = m; aimPt = leadPoint(fr.mount, m.pos, s.speed, m.vel); } }
      if (!tgt) {
        const locked = b.target && !b.target.dead && foes.includes(b.target) ? b.target : null;
        tgt = locked && vdist(locked.pos, fr.mount) < s.range * 1.05 ? locked : nearestInRange(foes, fr.mount, s.range);
        if (def.fire === 'missile' && !tgt && locked) tgt = locked;
        if (tgt) aimPt = def.speed === undefined && s.speed ? leadPoint(fr.mount, tgt.pos, s.speed, tgt.vel, b.vel) : (s.speed ? leadPoint(fr.mount, tgt.pos, s.speed, tgt.vel, b.vel) : tgt.pos);
      }
    }
    if (def.fire === 'missile' && manual) tgt = b.target && !b.target.dead ? b.target : tgt;
    // aim (turn-rate limited); idle sweep when there is nothing to aim at
    let want = null;
    if (aimPt) { const a = aimAngles(fr, vnorm(vsub(aimPt, fr.mount))); if (a.pitch >= PITCH_MIN - 0.02) want = a; }
    if (!want) { t.idle += DT; want = { yaw: Math.sin(t.idle * 0.45 + t.key % 7) * 1.1, pitch: 0.18 + Math.sin(t.idle * 0.31 + t.key % 5) * 0.12 }; aimPt = null; }
    const turn = s.turn * DT;
    let dy = want.yaw - t.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    t.yaw += clamp(dy, -turn, turn); if (t.yaw > Math.PI) t.yaw -= Math.PI * 2; if (t.yaw < -Math.PI) t.yaw += Math.PI * 2;
    t.pitch = clamp(t.pitch + clamp(clamp(want.pitch, PITCH_MIN, PITCH_MAX) - t.pitch, -turn, turn), PITCH_MIN, PITCH_MAX);
    t.cd -= DT * st.powerRatio;
    t.target = tgt; t.aim = aimPt;
    if (!aimPt || grace || (safe && !manual) || (safe && manual && def.fire !== 'mine')) { t.charge = Math.max(0, t.charge - DT * 2); continue; }
    const dir = turretDir(fr, t.yaw, t.pitch);
    const toAim = vnorm(vsub(aimPt, fr.mount));
    const err = Math.acos(clamp(vdot(dir, toAim), -1, 1));
    const dist = vdist(aimPt, fr.mount);
    const inRange = dist < s.range * (manual ? 1.15 : 1) || (def.fire === 'missile' && tgt);
    if (err > (def.fire === 'missile' ? 0.6 : 0.07) || !inRange) { t.charge = Math.max(0, t.charge - DT); continue; }
    t.firing = true;
    fireTurret(w, b, t, fr, dir, tgt, manual);
  }
}
const nearest = (list, p) => { let best = null, bd = Infinity; for (const o of list) { const d = vdist2(o.pos, p); if (d < bd) { bd = d; best = o; } } return best; };
function nearestInRange(list, p, range) { const n = nearest(list, p); return n && vdist(n.pos, p) < range ? n : null; }

function fireTurret(w, b, t, fr, dir, tgt, manual) {
  const def = t.def, s = t.s; const mul = b.team === 'hostile' ? ENEMY_DMG : 1;
  const muzzle = vadd(fr.mount, vadd(vscale(fr.u, 0.3), vscale(dir, 0.9)));
  const vis = itemVis(t.item), rc = itemRc(t.item);     // for the drawing only (helix strands, flash size, tint)
  if (def.fire === 'beam' || def.fire === 'mine') {
    // pulse laser: on for `pulse` seconds every 1/rate; mining laser: continuous while it has a target
    if (def.fire === 'beam') {
      if (t.beamT <= 0 && t.cd <= 0) { t.beamT = s.pulse; t.cd = 1 / s.rate; ev(w, { type: 'fire', body: b, turret: t, kind: t.kind, pos: muzzle, dir, vis, rc }); }
      if (t.beamT <= 0) return;
      t.beamT -= DT;
    }
    t.beam = true;
    const hit = rayWorld(w.bodies, muzzle, dir, s.range * (manual ? 1.15 : 1), o => o !== b && o.kind !== 'station' && !(o.kind === 'ship' && !hostile(b, o)));
    const end = hit ? vadd(muzzle, vscale(dir, hit.t)) : vadd(muzzle, vscale(dir, s.range));
    const bm = { from: muzzle, to: end, kind: t.kind, color: def.glow, owner: b.id, tkey: t.key, hit: !!hit, vis, rc, shield: false };
    w.beams.push(bm);
    if (hit) {
      const rock = hit.body.kind === 'rock' || hit.body.kind === 'wreck';
      const dmg = s.dmg * DT * mul * (def.fire === 'mine' ? (rock ? s.rockMul : 0.35) : 1);
      hitBlock(w, hit.body, hit.blk, dmg, def.dmgType, b, end);
      bm.shield = !!hit.body.shieldHit;
      knock(w, hit.body, end, dir, knockDv(hit.body, dmg, def.fire) * (bm.shield ? KNOCK_SHIELD : 1));
      if (w.rand() < 0.25) ev(w, { type: 'spark', pos: end, color: def.glow, small: true });
    }
    return;
  }
  if (def.fire === 'rail') {
    // charge first (glow on the coils), then fire
    if (t.cd > 0) return;
    t.charge += DT; if (t.charge < s.charge) return;
    t.charge = 0;
  } else if (t.cd > 0) return;
  t.cd = 1 / s.rate;
  ev(w, { type: 'fire', body: b, turret: t, kind: t.kind, pos: muzzle, dir, vis, rc });
  // heavy guns kick back a little
  const rk = RECOIL_KIND[def.fire];
  if (rk) { const dv = Math.min(RECOIL_K * s.dmg * mul * rk / Math.max(1, st(b).mass), RECOIL_MAX * (st(b).maxSpeed || 60)); b.vel = vsub(b.vel, vscale(dir, dv)); }
  if (b === w.player || tgt?.team === 'player' || hostile(b, w.player || b)) noteCombatIfClose(w, b);
  const team = b.team;
  if (def.fire === 'missile') {
    const n = s.salvo || 1;
    for (let i = 0; i < n; i++) {
      const side = vscale(fr.r, (i - (n - 1) / 2) * 0.5);
      w.shots.push({ who: b, kind: 'missile', pos: vadd(muzzle, side), vel: vadd(b.vel, vscale(vnorm(vadd(dir, vscale(fr.u, 0.25))), 40)), team, owner: b.id, dmg: s.dmg * mul, type: def.dmgType, splash: s.splash, life: s.range / s.speed + 3, speed: s.speed, target: tgt || null, color: def.glow, arm: 0.25, vis, rc });
    }
    return;
  }
  const spread = (s.spread || 0.004) * (manual ? 0.7 : 1);
  const r = w.rand; const jit = { x: (r() - 0.5) * spread * 2, y: (r() - 0.5) * spread * 2, z: (r() - 0.5) * spread * 2 };
  const d2 = vnorm(vadd(dir, jit));
  w.shots.push({ who: b, kind: def.fire, pos: muzzle, vel: vadd(b.vel, vscale(d2, s.speed)), team, owner: b.id, dmg: s.dmg * mul, type: def.dmgType, splash: s.splash || 0, life: (s.range * (manual ? 1.15 : 1)) / s.speed, color: def.glow, pierce: def.fire === 'rail' ? 3 : 0, target: tgt && def.fire === 'flak' ? tgt : null, vis, rc, gun: t.kind });
}
const st = b => b.stats || { mass: 1, maxSpeed: 60 };
function noteCombatIfClose(w, b) { if (!w.player) return; if (b === w.player || vdist(b.pos, w.player.pos) < 1400) w.combatT = w.t; }

// ------------------------------------------------------------------ shots
function stepShots(w) {
  const keep = [];
  for (const s of w.shots) {
    s.life -= DT; if (s.life <= 0) { if (s.kind === 'flak' || s.kind === 'missile') explode(w, s.pos, s.splash, s.dmg, s.team, s.owner, s.type); continue; }
    if (s.kind === 'missile') {
      s.arm -= DT;
      const tg = s.target && !s.target.dead ? s.target : null;
      const want = tg ? vnorm(vsub(tg.pos, s.pos)) : vnorm(s.vel);
      const sp = vlen(s.vel); const cur = vscale(s.vel, 1 / (sp || 1));
      const turn = 2.4 * DT; const nd = vnorm(vadd(cur, vscale(vsub(want, cur), Math.min(1, turn * 2))));
      const nsp = Math.min(s.speed * 1.6, sp + s.speed * 1.4 * DT);
      s.vel = vscale(nd, nsp);
      if (tg && vdist(tg.pos, s.pos) < Math.max(3, tg.radius * 0.6) && s.arm <= 0) {
        // fly into the hull: find the nearest block along the flight line
        const h = rayBody(tg, s.pos, nd, tg.radius * 2 + 4);
        const p = h ? vadd(s.pos, vscale(nd, h.t)) : s.pos;
        explode(w, p, s.splash, s.dmg, s.team, s.owner, s.type); continue;
      }
      if (w.rand() < 0.5) ev(w, { type: 'trail', pos: { ...s.pos }, color: s.color });
    }
    if (s.kind === 'flak' && s.target && !s.target.dead && vdist(s.pos, s.target.pos) < 6) { explode(w, s.pos, s.splash, s.dmg, s.team, s.owner, s.type, true); continue; }
    const step = vscale(s.vel, DT); const len = vlen(step); const dir = vscale(step, 1 / (len || 1));
    // shots can hit enemy missiles (flak bursts, everything else plinks them)
    let done = false;
    for (const m of w.shots) {
      if (m === s || m.kind !== 'missile' || m.team === s.team || m.dead) continue;
      if (vdist2(m.pos, s.pos) < (s.kind === 'flak' ? 36 : 4)) { m.dead = true; ev(w, { type: 'boom', pos: m.pos, size: 1.5, color: m.color }); if (s.kind === 'flak') explode(w, s.pos, s.splash * 0.5, s.dmg * 0.5, s.team, s.owner, s.type, true); done = !s.pierce; break; }
    }
    if (done) continue;
    const hit = rayWorld(w.bodies, s.pos, dir, len, o => o.id !== s.owner && o.kind !== 'station' && !(o.kind === 'ship' && !hostile(s.who || s, o)));   // world: only ships the shooter fights
    if (hit) {
      const p = vadd(s.pos, vscale(dir, hit.t));
      if (s.splash) { explode(w, p, s.splash, s.dmg, s.team, s.owner, s.type); continue; }
      const dmg0 = s.dmg;
      const left = hitBlock(w, hit.body, hit.blk, s.dmg, s.type, ownerOf(w, s.owner), p);
      const sh = !!hit.body.shieldHit;
      knock(w, hit.body, p, dir, knockDv(hit.body, dmg0, s.kind) * (sh ? KNOCK_SHIELD : 1));
      ev(w, { type: 'spark', pos: p, color: s.color, shield: sh, body: hit.body, dir, kind: s.kind, gun: s.gun, dmgType: s.type, vis: s.vis || 0, rc: s.rc || null });
      if (s.pierce > 0 && left > 0) { s.pierce--; s.dmg = left; s.pos = vadd(p, vscale(dir, 0.6)); keep.push(s); continue; }
      continue;
    }
    s.pos = vadd(s.pos, step);
    if (!s.dead) keep.push(s);
  }
  w.shots = keep.filter(s => !s.dead);
}
const ownerOf = (w, id) => w.bodies.find(b => b.id === id) || null;

/** A blast: damages every block within `r` of p on bodies the team can hurt. */
export function explode(w, p, r, dmg, team, owner, type = 'explosive', air = false) {
  ev(w, { type: 'boom', pos: p, size: Math.max(1.2, r), color: type === 'energy' ? '#8dff6a' : '#ff9b52', air, dmgType: type });
  for (const b of w.bodies) {
    if (b.dead || b.kind === 'station' || (b.kind === 'ship' && team !== 'none' && !hostile(ownerOf(w, owner) || { team }, b)) || b.id === owner) continue;   // world: blasts spare friends
    if (vdist(b.pos, p) > b.radius + r) continue;
    const lp = toLocal(b, p); const R = Math.ceil(r);
    const hits = []; const seenBlk = new Map();
    for (let x = Math.floor(lp.x - R); x <= lp.x + R; x++) for (let y = Math.floor(lp.y - R); y <= lp.y + R; y++) for (let z = Math.floor(lp.z - R); z <= lp.z + R; z++) {
      const blk = b.grid.occ.get(key(x, y, z)); if (!blk) continue;
      const d = Math.hypot(x + 0.5 - lp.x, y + 0.5 - lp.y, z + 0.5 - lp.z); if (d > r) continue;
      const f = 1 - (d / r) * 0.7; const prev = seenBlk.get(blk);
      if (prev == null) { seenBlk.set(blk, hits.length); hits.push([blk, f]); } else if (f > hits[prev][1]) hits[prev][1] = f;   // a big block is hit once, at its closest cell
    }
    if (!hits.length) continue;
    // the blast's damage is SHARED between the blocks it reaches (closest take most): a blast deals at most
    // BLAST_SHARE × its listed damage in total, however many blocks are inside it
    const tot = hits.reduce((a, h) => a + h[1], 0); const scale = Math.min(1, BLAST_SHARE / tot);
    let dealt = 0, sh = false;
    for (const [blk, f] of hits) if (b.grid.cells.has(key(blk.x, blk.y, blk.z))) { hitBlock(w, b, blk, dmg * f * scale, type, ownerOf(w, owner), p, true); dealt += dmg * f * scale; sh = sh || !!b.shieldHit; }
    // explosions push outward from the blast centre
    if (!b.dead) knock(w, b, null, vsub(b.pos, p), knockDv(b, dealt, 'blast') * (sh ? KNOCK_SHIELD : 1));
  }
}

/** Damage near a world point (bumps). */
export function damageAt(w, b, p, dmg, type, src) {
  const lp = toLocal(b, p); let best = null, bd = Infinity;
  for (const blk of b.grid.cells.values()) { const c = centreOf(blk); const d = (c.x - lp.x) ** 2 + (c.y - lp.y) ** 2 + (c.z - lp.z) ** 2; if (d < bd) { bd = d; best = blk; } }
  if (best) hitBlock(w, b, best, dmg, type, src, p);
}

/**
 * Damage one block (shields first, then armour). Returns the damage left over after the block broke (for pierce).
 */
export function hitBlock(w, b, blk, dmg, type, src, p, splash = false) {
  b.shieldHit = false;
  if (b.kind === 'station') return 0;
  if (b.kind === 'ship') {
    b.lastHit = w.t;
    if (src && (src === w.player || b === w.player)) w.combatT = w.t;
    if (b === w.player && w.t < (b.grace || 0)) return 0;
    if (b.shield > 0) {
      const absorb = Math.min(b.shield, dmg); b.shield -= absorb; dmg -= absorb; b.shieldHit = true;
      if (!splash || w.rand() < 0.2) ev(w, { type: 'shieldHit', body: b, pos: p });
      if (dmg <= 0) return 0;
    }
    if (src && b.team === 'hostile' && !b.target) b.target = src;
  }
  const res = BLOCKS[blk.t]?.resist?.[type] ?? 1;
  const real = dmg * res;
  blk.hp -= real; b.version++; b.hpDirty = true;
  if (blk.hp > 0) return 0;
  const left = -blk.hp / res;
  destroyBlock(w, b, blk, src);
  return left;
}

/** A block breaks: remove it, drop ore, check what is still attached. */
export function destroyBlock(w, b, blk, src) {
  remove(b.grid, blk.x, blk.y, blk.z);
  const wp = toWorld(b, centreOf(blk));
  ev(w, { type: 'blockLost', pos: wp, body: b, t: blk.t, color: BLOCKS[blk.t]?.fleck || BLOCKS[blk.t]?.color });
  const ore = BLOCKS[blk.t]?.ore;
  if (ore) w.pickups.push({ kind: 'ore', ore, qty: 1 + Math.floor((ORES[ore].price > 20 ? 1 : 0) + w.rand() * 1.5), pos: wp, vel: vadd(b.vel, vscale(vrand(w.rand), 6)), life: 90 });
  if (b.kind === 'ship' && blk.t === 'reactor') explode(w, wp, 3, 25, 'none', b.id, 'explosive');
  if (b.kind === 'ship' && blk.t === 'bridge') { shipDestroyed(w, b, src); return; }
  if (b === w.player && blk.item) w.lostItems = (w.lostItems || 0) + 1;
  splitOff(w, b);
  if (b.grid.cells.size === 0) { b.dead = true; return; }
  refresh(b);
  // a ship shot down to its last 30% of block health comes apart even with the bridge still on
  if (b.kind === 'ship' && b.baseHp && b.stats.hp < b.baseHp * BREAK_AT) shipDestroyed(w, b, src);
}
/** 0..1: how far a ship is from coming apart (1 = whole, 0 = breaks). */
export function integrity(b) { if (!b.baseHp) return 1; return Math.max(0, Math.min(1, (b.stats.hp - b.baseHp * BREAK_AT) / (b.baseHp * (1 - BREAK_AT)))); }

/** Pieces no longer joined to the bridge (or to the biggest piece of a rock) float away. */
function splitOff(w, b) {
  if (b.grid.cells.size === 0) return;
  const comps = components(b.grid); if (comps.length < 2) return;
  let main = comps[0];
  if (b.kind === 'ship') { const br = findType(b.grid, 'bridge'); if (br) main = comps.find(c => c.includes(br)) || comps[0]; }
  for (const c of comps) {
    if (c === main) continue;
    const g = createGrid();
    for (const blk of c) { remove(b.grid, blk.x, blk.y, blk.z); put(g, blk); }
    spawnChunk(w, b, g, b.kind === 'rock' ? 'rock' : 'wreck');
  }
}
function spawnChunk(w, parent, g, kind) {
  const c = new Map(); let n = 0, cx = 0, cy = 0, cz = 0; for (const blk of g.cells.values()) { cx += blk.x; cy += blk.y; cz += blk.z; n++; }
  const lc = { x: cx / n + 0.5, y: cy / n + 0.5, z: cz / n + 0.5 };
  const wp = toWorld(parent, lc);
  const ch = createBody(g, { kind, team: 'neutral', pos: wp, quat: parent.quat, danger: parent.danger });
  ch.pos = wp;   // createBody pivots on the chunk's own centre; put that centre where it was
  const out = vnorm(vsub(wp, parent.pos));
  ch.vel = vadd(parent.vel, vscale(out, 2 + w.rand() * 4));
  ch.angVel = vscale(vrand(w.rand), 0.3 + w.rand() * 0.8);
  if (parent.faction) ch.faction = parent.faction;
  ch.paintOf = parent.paintOf;
  addBody(w, ch);
  return ch;
}

/** The bridge is gone: the ship comes apart, drops its loot. */
function shipDestroyed(w, b, src) {
  b.dead = true; b.destroyedAt = w.t;
  ev(w, { type: 'shipDown', pos: { ...b.pos }, body: b, size: b.radius, player: b === w.player, src: src || null });   // world: src → standing
  ev(w, { type: 'boom', pos: { ...b.pos }, size: Math.max(4, b.radius * 0.9), color: '#ffb35a', big: true });
  // break into chunks: knock out a few more blocks, then every face-joined piece floats off
  const cells = [...b.grid.cells.values()];
  for (const blk of cells) if (w.rand() < 0.22) { remove(b.grid, blk.x, blk.y, blk.z); if (w.rand() < 0.3) ev(w, { type: 'blockLost', pos: toWorld(b, { x: blk.x + 0.5, y: blk.y + 0.5, z: blk.z + 0.5 }), body: b, t: blk.t }); }
  for (const c of components(b.grid)) {
    if (c.length < 1) continue;
    const g = createGrid(); for (const blk of c) put(g, { ...blk, item: null });
    const ch = spawnChunk(w, b, g, 'wreck'); ch.vel = vadd(ch.vel, vscale(vrand(w.rand), 3 + w.rand() * 5));
  }
  if (b === w.player) return;
  // world: a kill made by a trader or the patrol is not yours (goals must not finish while you watch)
  const byOther = src && src !== b && src.kind === 'ship' && src.team !== 'player';
  if (b.team === 'hostile' && !byOther) {
    w.stats.kills++; if (b.boss) w.stats.bosses = (w.stats.bosses || 0) + 1;
    ev(w, { type: 'kill', body: b, boss: !!b.boss });
    // loot: credits, ore, and some of its parts (a boss always drops several)
    const credits = Math.round((20 + b.stats.maxHp * 0.12) * (1 + b.danger * 0.35) * (b.boss ? 4 : 1));
    w.pickups.push({ kind: 'credits', qty: credits, pos: { ...b.pos }, vel: vscale(vrand(w.rand), 4), life: 120 });
    const nItems = b.boss ? 3 + Math.floor(w.rand() * 2) : w.rand() < 0.55 ? 1 : 0;
    for (let i = 0; i < nItems; i++) {
      const it = rollLootItem(Math.floor(w.rand() * 1e9), b.danger, b.boss ? 0.45 : 0);
      w.pickups.push({ kind: 'item', item: it, pos: vadd(b.pos, vscale(vrand(w.rand), 2)), vel: vscale(vrand(w.rand), 5), life: 180 });
    }
  }
}

// ------------------------------------------------------------------ pickups
function stepPickups(w) {
  const P = w.player; const keep = [];
  for (const k of w.pickups) {
    k.life -= DT; if (k.life <= 0) continue;
    if (P && !P.dead) {
      const d = vdist(k.pos, P.pos);
      const room = k.kind !== 'ore' || (w.cargoRoom ? w.cargoRoom() > 0 : true);
      if (d < MAGNET + P.radius && room) {
        const pull = vscale(vnorm(vsub(P.pos, k.pos)), 60 + (MAGNET - d) * 2);
        k.vel = vadd(vscale(k.vel, 0.9), vscale(vadd(P.vel, pull), 0.1));
      }
      if (d < P.radius + 2.5 && room) { ev(w, { type: 'pickup', pickup: k }); continue; }
    }
    k.vel = vscale(k.vel, 0.995);
    k.pos = vadd(k.pos, vscale(k.vel, DT));
    keep.push(k);
  }
  w.pickups = keep;
}
