// Weapons: what leaves the barrel when a trigger is held, and what it does when it lands. Every weapon in the game is
// one of these KINDS with its own numbers (the Mech Kit's parts.json → loadout.js weaponSpec turns a part into a spec):
//
//   spec = { id, name, kind, dtype, dmg, rate (shots/s), count (projectiles per shot), spread (rad), speed (tiles/s),
//            range (tiles), splash (tiles), pierce, ammo (null = unlimited), mag, reload (s), heat, energy (per shot),
//            lock: { count, time } (homing weapons), status (0..1 chance), charge (s, rail/plasma), knock (tiles/s),
//            arc (lobbed), beam (instant line), melee (blade/pile), heal (repair beam), deploy (turret/mine/drone) }
//
// Rule from lessons 54: count what actually leaves the barrel — `count` projectiles per shot, never per burst step.
import { rollCrit, mitigate, addStatus, STATUS_OF, STATUS_FLOOR, applyElement } from './damage.js';
import { spendEnergy, addHeat } from './mech.js';
import { fireKind, fxOf, ECHO_SKIP } from './weapon-fx.js';      // round 7: new weapon kinds + effect fields (ricochet, echo, wells…)

export const KINDS = {
  bullet:  { label: 'Ballistic' },
  pellets: { label: 'Scatter' },
  missile: { label: 'Missile', homing: true },
  lob:     { label: 'Arcing' },
  rail:    { label: 'Railgun', instant: true },
  beam:    { label: 'Beam', instant: true },
  flame:   { label: 'Flame' },
  chain:   { label: 'Chain lightning', instant: true },
  plasma:  { label: 'Plasma' },
  blade:   { label: 'Melee', melee: true },
  repair:  { label: 'Repair', instant: true },
  deploy:  { label: 'Deployable' },
  shield:  { label: 'Shield' },
  // round 7 (sim/weapon-fx.js)
  lance:   { label: 'Sweep beam', instant: true },
  prism:   { label: 'Prism laser', instant: true },
  orbital: { label: 'Orbital strike' },
  scythe:  { label: 'Wave blade', melee: true },
  tesla:   { label: 'Tesla pulse', instant: true },
  orbs:    { label: 'Seeker orbs' },
  storm:   { label: 'Storm caller' },
  glaive:  { label: 'Returning disc' },
};

/** A loaded weapon on a mech (spec + its live state). */
export function arm(spec, slot) {
  return { slot, spec, cd: 0, ammo: spec.ammo ?? null, mag: spec.mag ?? null, inMag: spec.mag ?? null, reloadT: 0,
    charge: 0, locks: [], lockT: 0, firing: false, held: false };
}

/** Collect lock-ons for homing weapons: enemies inside the aim circle, one more every `lock.time` seconds. */
export function updateLocks(S, m, w, dt, T, aimX, aimZ) {
  const L = w.spec.lock; if (!L) { w.locks.length = 0; return; }
  const range = w.spec.range, ax = Math.atan2(aimZ - m.z, aimX - m.x);
  const cone = T.lockCone * (m.stats.lockCone || 1);
  // drop locks that died, left range or left the circle
  w.locks = w.locks.filter(id => { const e = S.byId.get(id); if (!e || e.dead) return false; const d = Math.hypot(e.x - m.x, e.z - m.z); if (d > range) return false; return Math.abs(angleDiff(Math.atan2(e.z - m.z, e.x - m.x), ax)) < cone * 1.4; });
  if (S.jammedAt(m.x, m.z)) { w.lockT = 0; return; }              // jammers stop new locks
  if (w.locks.length >= L.count) return;
  w.lockT += dt / Math.max(0.05, L.time * (m.stats.lockTimeMul || 1));
  if (w.lockT < 1) return;
  // the best new target: nearest to the aim line, not already locked (a stuck lock-on target counts first)
  let best = null, bestScore = Infinity;
  const pref = m.lockOn && S.byId.get(m.lockOn);
  for (const e of S.candidates(m.x, m.z, range)) {
    if (w.locks.includes(e.id) && w.locks.length < S.countAlive()) continue;
    const a = Math.abs(angleDiff(Math.atan2(e.z - m.z, e.x - m.x), ax)); if (a > cone) continue;
    const sc = a + Math.hypot(e.x - m.x, e.z - m.z) * 0.02 - (pref && pref.id === e.id ? 10 : 0);
    if (sc < bestScore) { bestScore = sc; best = e; }
  }
  if (best) { w.locks.push(best.id); w.lockT = 0; S.events.push({ type: 'lock', id: m.id, target: best.id, slot: w.slot }); }
}

export const angleDiff = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

/**
 * Hold or release a trigger for one step. Fires as many shots as the rate allows (so a slow frame doesn't lose shots).
 * aim: { x, z } point in the world. Returns the number of shots fired.
 */
export function triggerWeapon(S, m, w, held, dt, T, aim) {
  const sp = w.spec; w.cd = Math.max(0, w.cd - dt); w.held = held;
  if (w.reloadT > 0) { w.reloadT -= dt; if (w.reloadT <= 0) { const take = w.ammo == null ? sp.mag : Math.min(sp.mag, w.ammo); w.inMag = take; } }
  if (sp.charge) {                                         // rail / plasma: hold to charge, fire on release
    if (held && w.reloadT <= 0 && w.cd <= 0 && hasAmmo(w)) { w.charge = Math.min(sp.charge, w.charge + dt); return 0; }
    if (!held && w.charge > 0) { const full = w.charge / sp.charge; w.charge = 0; if (full < 0.25) return 0; return fireOnce(S, m, w, T, aim, full) ? 1 : 0; }
    return 0;
  }
  if (!held) return 0;
  let shots = 0;
  while (w.cd <= 0 && shots < 4) {
    if (!fireOnce(S, m, w, T, aim, 1)) break;
    w.cd += 1 / sp.rate; shots++;
  }
  if (w.cd < 0) w.cd = 0;
  return shots;
}

const hasAmmo = w => (w.inMag == null || w.inMag > 0) && (w.ammo == null || w.ammo > 0);

/** Round 7 `echo`: the shot again 0.3 s later at a share of the damage, free (no ammo, energy or heat). weapon-fx.js
 *  queues it and calls this when it is due. echo = { locks } — the salvo's lock-ons, so echoed missiles still home. */
export function fireEcho(S, m, w, T, aim, power, echo) { return fireOnce(S, m, w, T, aim, power, echo); }

function fireOnce(S, m, w, T, aim, power, echo = null) {
  const sp = w.spec;
  if (!echo) {
    if (w.reloadT > 0 || !hasAmmo(w)) { if (w.inMag === 0 && (w.ammo == null || w.ammo > 0) && w.reloadT <= 0) w.reloadT = sp.reload || 1.5; return false; }
    if (m.overheated && sp.heat > 0) return false;
    if (sp.energy && !spendEnergy(m, sp.energy, T)) return false;
    if (w.inMag != null) w.inMag--; if (w.ammo != null) w.ammo--;
    if (w.inMag === 0 && (w.ammo == null || w.ammo > 0)) w.reloadT = sp.reload || 1.5;
    if (sp.heat) addHeat(m, sp.heat, T);
  }

  const dx = aim.x - m.x, dz = aim.z - m.z;
  let dir = Math.atan2(dz, dx);
  // controller aim help: bend toward the nearest enemy within a few degrees (mouse gets none)
  if (m.padAim && T.padAimHelp > 0 && !sp.lock) {
    let best = null, ba = T.padAimHelp;
    for (const e of S.candidates(m.x, m.z, sp.range)) { const a = Math.abs(angleDiff(Math.atan2(e.z - m.z, e.x - m.x), dir)); if (a < ba) { ba = a; best = e; } }
    if (best) dir = Math.atan2(best.z - m.z, best.x - m.x);
  }
  const muzzle = 0.28, mx = m.x + Math.cos(dir) * muzzle, mz = m.z + Math.sin(dir) * muzzle, my = (m.y || 0) + 0.45;
  const base = { owner: m.id, team: m.team, dtype: sp.dtype, dmg: sp.dmg * power * (m.stats.dmgMul?.[sp.dtype] || 1) * (m.stats.dmgMulAll || 1),
    splash: sp.splash || 0, pierce: sp.pierce || 0, status: sp.status || 0, knock: sp.knock || 0, weapon: sp.id, crit: (m.stats.critChance || 0) + (sp.crit || 0) + T.critBase,
    fx: fxOf(sp), look: sp.look || null };
  S.events.push({ type: 'fire', id: m.id, slot: w.slot, kind: sp.kind, weapon: sp.id, x: mx, z: mz, y: my, dir, power, look: sp.look || undefined, echo: echo ? 1 : undefined });
  if (!echo && sp.echo > 0 && !ECHO_SKIP.has(sp.kind)) (S.echoes ||= []).push({ t: 0.3, m: m.id, slot: w.slot, x: aim.x, z: aim.z, power: power * Math.min(1, sp.echo), locks: w.locks.slice() });
  const locks = echo ? echo.locks || [] : w.locks;
  if (fireKind(S, m, w, sp, base, { dir, mx, mz, my, aim, power, echo: !!echo })) return true;   // round 7 kinds (weapon-fx.js)

  switch (sp.kind) {
    case 'rail': case 'beam': {
      const reach = Math.min(sp.range, Math.hypot(dx, dz) + (sp.kind === 'rail' ? sp.range : 0));
      S.hitLine(base, mx, mz, my, dir, sp.kind === 'rail' ? sp.range : reach, sp.kind === 'rail' ? 99 : base.pierce, sp.width || 0.12);
      return true;
    }
    case 'chain': S.chain(base, mx, mz, dir, sp.range, sp.jumps || 4, sp.jumpRange || 1.6); return true;
    case 'blade': S.melee(base, m, dir, sp.range || 0.7, sp.arc || 1.6); return true;
    case 'repair': S.repairLine(base, m, dir, sp.range, sp.heal || sp.dmg); return true;
    case 'deploy': S.deploy(base, m, sp, aim); return true;
    case 'shield': return true;
    default: break;
  }
  const n = sp.count || 1;
  for (let i = 0; i < n; i++) {
    const a = dir + (n > 1 ? (i / (n - 1) - 0.5) * sp.spread : 0) + (S.rng.next() - 0.5) * (sp.jitter ?? (n > 1 ? sp.spread * 0.25 : sp.spread || 0.02));
    const speed = sp.speed * (sp.kind === 'pellets' ? S.rng.range(0.85, 1.1) : 1);
    const shot = { ...base, kind: sp.kind, x: mx, z: mz, y: my, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, life: sp.range / Math.max(0.1, speed), age: 0, hits: [] };
    if (sp.kind === 'missile') {
      shot.target = locks.length ? locks[i % locks.length] : null; shot.turn = sp.turn || 3.5;
      if (sp.vertical) { shot.vy = 3; shot.vertical = true; }       // vertical missiles climb over buildings first
      shot.life = sp.range / speed * 1.6;
    }
    if (sp.kind === 'lob' || sp.kind === 'plasma' && sp.arc) {
      const d = Math.min(sp.range, Math.max(0.6, Math.hypot(aim.x - mx, aim.z - mz)));
      const t = d / speed; shot.lob = true; shot.tx = mx + Math.cos(a) * d; shot.tz = mz + Math.sin(a) * d; shot.life = t; shot.g = sp.gravity || 4.9; shot.vy = (shot.g * t * t * 0.5 - my) / t;   // lands on the ground at the aim point
    }
    if (sp.kind === 'flame') { shot.life = (sp.range / speed) * S.rng.range(0.7, 1); shot.flame = true; }
    if (sp.zone) { shot.zone = sp.zone; shot.zoneR = sp.zoneR; shot.zoneT = sp.zoneT; }    // round 7: a canister that opens a cloud
    S.shots.push(shot);
  }
  if (!echo && w.locks.length && sp.kind === 'missile') w.locks.length = 0;      // a salvo uses up its locks
  if (sp.recoil && !echo) { m.vx -= Math.cos(dir) * sp.recoil; m.vz -= Math.sin(dir) * sp.recoil; }
  return true;
}

/** Turn one hit into damage on an enemy or a mech: crit tiers, resistances, statuses. Returns { amount, tier }.
 *  hx, hz = where it landed (a blast's centre; void's rift tugs toward it) — a flying shot uses a point just behind it. */
export function resolveHit(S, shot, target, T, scale = 1, hx = null, hz = null) {
  const { tier, mult } = rollCrit(S.rng, shot.crit || 0, T.critMult);
  let amount = mitigate(shot.dmg * scale * mult, shot.dtype, target);
  // front armour (brutes, shield walkers): shots from the front are mostly stopped — void goes straight through
  if (target.frontArmour && target.face != null && shot.vx != null && shot.dtype !== 'void') {
    const from = Math.atan2(-(shot.vz || 0), -(shot.vx || 0));
    if (Math.abs(angleDiff(from, target.face)) < 1.0) amount *= 1 - target.frontArmour;
  }
  const st = STATUS_OF[shot.dtype];
  const chance = Math.max(shot.status || 0, STATUS_FLOOR[shot.dtype] || 0);
  if (st && chance && S.rng.next() < chance) {
    if (st === 'chill' || st === 'rift') {
      if (hx == null) { const v = Math.hypot(shot.vx || 0, shot.vz || 0); hx = v ? target.x - shot.vx / v * 0.6 : target.x; hz = v ? target.z - shot.vz / v * 0.6 : target.z; }
      applyElement(target, st, S.time, amount, hx, hz);
    } else addStatus(target, st, amount);
  }
  if (shot.corrode) addStatus(target, 'corrode');
  return { amount, tier };
}
