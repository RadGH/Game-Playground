// Monster brains (rulings 16, 19, 45). Pure. Every foe each step:
//   idle/wander/patrol -> notices a hero -> chase -> attack / ability -> home again if pulled too far.
// Movement is steering: seek (along the walk-grid flow field when the straight line is blocked, so nothing gets stuck
// behind a rock), separation from everyone (nobody piles up), cohesion for swarms (they flock), and each role's own
// idea of where to stand:
//   brute       close in, stick to the top of the threat table
//   skirmisher  goes for the lowest-armour hero in reach; after 2 hits circles to a flank, then dives back in
//   archer      holds 9-12 m, steps sideways to regain line of sight, backs off from anyone under 4 m
//   caster      walks only to find range and line of sight; stands still to cast (telegraphed, interruptible)
//   shaman      stays behind its pack, heals/buffs on cooldown, only attacks when nobody is under 50%
//   leader      rallies the pack (+damage while it lives); at 25% runs to the nearest other pack and wakes it
//   swarm       flocks (separation + cohesion) onto the nearest hero
// Abilities come from the bestiary rows; every `kind` has one generic rule (abilities.js).
import { resolve } from './move.js';
import { resolveHit, pickTarget } from '../rules/combat.js';
import { hurt } from './fight.js';
import { flowTo, downhill, clearLine } from './paths.js';
import { speedFactor, dmgFactor, stepFx, has, addFx } from './status.js';
import { readyAbility, startAbility, stepAbility } from './abilities.js';
import { modsTick, modsHitDealt } from './champions.js';
import { bossTick } from './bosses.js';
import { heroLike } from './allies.js';

export const AGGRO = 9, LEASH = 36, SEP = 0.35;
const RANGED = new Set(['archer', 'caster', 'shaman']);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function stepBrains(w, dt) {
  const heroes = [...w.players.values(), ...(w.allies?.values() || [])].filter(p => !p.dead);
  for (const f of w.foes.values()) {
    if (f.dead) continue;
    stepFx(w, f, (src, t, n, type) => hurt(w, w.players.get(src) || f, t, { result: 'hit', amount: Math.max(1, Math.round(n)), mitigated: 0 }, type));
    if (f.dead) continue;
    if (f.mods) modsTick(w, f);
    if (f.def.boss) bossTick(w, f);
    if (has(f, 'stun')) continue;
    // notice: sight radius, line of sight; a pack wakes together
    if (f.state === 'idle' || f.state === 'wander' || f.state === 'patrol') {
      const sight = (f.def.ai.aggro || AGGRO) * (f.rank !== 'normal' ? 1.2 : 1);
      for (const h of heroes) if (dist(f, h) < sight && clearLine(w.area, f.x, f.z, h.x, h.z)) { f.threat.set(h.id, 1); f.state = 'chase'; f.pulledAt = w.time; packWake(w, f, h); break; }
    }
    if (f.state === 'idle' || f.state === 'wander' || f.state === 'patrol') { idle(w, f, dt); continue; }
    if (f.state === 'return') { goHome(w, f, dt); continue; }
    if (f.state === 'flee') { flee(w, f, dt); continue; }
    const ranged = RANGED.has(f.def.role);
    let tid = pickTarget(f.threat, f.target, id => { const a = heroLike(w, id); return !!a && !a.dead; }, ranged);
    if (f.def.role === 'skirmisher' && tid) tid = softestInReach(w, f) || tid;
    if (!tid) { f.state = 'return'; f.target = null; f.cast = null; continue; }
    f.target = tid;
    const t = heroLike(w, tid);
    const leash = f.leashBig ? 70 : (f.def.ai.leash || LEASH);
    if (dist(f, f.home) > leash + 10 || (dist(f, f.home) > leash && dist(f, t) > 6)) { f.state = 'return'; f.threat.clear(); f.target = null; f.cast = null; continue; }
    // leader: run for help at 25%
    if (f.def.role === 'leader' && !f.fled && f.hp < f.maxHp * 0.25) { startFlee(w, f); continue; }
    if (f.cast) { f.yaw = Math.atan2(t.x - f.x, t.z - f.z); stepAbility(w, f, t); continue; }
    const speed = f.speed * speedFactor(f);
    const range = f.def.attackRange + f.r + t.r, d = dist(f, t);
    const sees = clearLine(w.area, f.x, f.z, t.x, t.z, 0.1);
    // where this role wants to stand
    if (f.def.role === 'archer' || f.def.role === 'caster') {
      const want = Math.min(range - 0.5, f.def.role === 'archer' ? 11 : Math.max(6, (f.def.ai.kiteDistance || 8)));
      if (d < 4 && f.backedOff !== tid) { awayFrom(w, f, t, speed, dt); f.state = 'chase'; if (d > 3.5) f.backedOff = tid; }
      else if (d > range - 0.2 || !sees) { approach(w, f, t, speed, dt, !sees); f.state = 'chase'; }
      else if (!sees) { strafe(w, f, t, speed, dt); }
      else { separate(w, f, dt); f.state = 'attack'; face(f, t); void want; }
    } else if (f.def.role === 'shaman') {
      if (shamanTurn(w, f)) continue;
      behindPack(w, f, t, speed, dt);
    } else if (f.def.role === 'skirmisher' && f.flankUntil > w.time) {
      flank(w, f, t, speed, dt);
    } else {
      const want = range - 0.15;
      if (d > want) { approach(w, f, t, speed, dt, !sees, want); f.state = 'chase'; }
      else { separate(w, f, dt, f.def.ai.flock ? cohesion(w, f) : null); f.state = 'attack'; face(f, t); }
    }
    if (d <= range + 0.1 && sees && w.time >= f.nextSwing && !f.cast) attack(w, f, t);
  }
}
const face = (f, t) => { f.yaw = Math.atan2(t.x - f.x, t.z - f.z); };

function packWake(w, f, h) {
  if (!f.pack) return;
  for (const o of w.foes.values()) if (o.pack === f.pack && !o.dead && (o.state === 'idle' || o.state === 'wander' || o.state === 'patrol')) { o.threat.set(h.id, 1); o.state = 'chase'; o.pulledAt = w.time; }
  // a leader rallies its pack the moment it sees a fight
  for (const o of w.foes.values()) if (o.pack === f.pack && o.def.role === 'leader' && !o.dead && !o.rallied) {
    o.rallied = true; w.events.push({ k: 'fability', s: o.id, sk: 'Rally' });
    for (const m of w.foes.values()) if (m.pack === f.pack && !m.dead) addFx(w, m, { id: 'rally', kind: 'dmgUp', pct: 15, secs: 999, src: o.id });
  }
}
function softestInReach(w, f) {
  let best = null, ba = Infinity;
  for (const id of f.threat.keys()) { const p = w.players.get(id); if (!p || p.dead || dist(f, p) > 8) continue; if (p.armour < ba) { ba = p.armour; best = id; } }
  return best;
}

// ---- idle: mill about, or walk a patrol route ----------------------------------------------------------------------
function idle(w, f, dt) {
  if (f.route?.length) {
    const p = f.route[f.leg % f.route.length];
    if (dist(f, p) < 0.8) f.leg++;
    else { steer(w, f, p.x, p.z, f.speed * 0.45, dt); f.state = 'patrol'; }
    f.home = { x: f.x, z: f.z };          // a patrol's home is wherever it is
    return;
  }
  if (w.time > f.wander.at) {
    f.wander.at = w.time + 3 + w.rng() * 7;
    const a = w.rng() * Math.PI * 2, r = w.rng() * 3;
    f.wander.x = f.home.x + Math.cos(a) * r; f.wander.z = f.home.z + Math.sin(a) * r;
  }
  if (dist(f, f.wander) > 0.3) { steer(w, f, f.wander.x, f.wander.z, f.speed * 0.35, dt); f.state = 'wander'; } else { f.state = 'idle'; separate(w, f, dt); }
}
/** Leashed: run home, healing on the way (no cheesy pulls to safety). */
function goHome(w, f, dt) {
  f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.25 * dt); f.cast = null;
  const d = dist(f, f.home);
  // home, or as near home as the ground allows (a stuck-but-close body counts as home, not a reason to shuffle forever)
  if (d > 0.6 && !(d < 2.5 && f.stuck > 6)) approachPoint(w, f, f.home.x, f.home.z, f.speed * 1.3, dt);
  else { f.state = 'idle'; f.hp = f.maxHp; f.threat.clear(); f.home = { x: f.x, z: f.z }; f.stuck = 0; }
}

// ---- the leader's run for help ---------------------------------------------------------------------------------------
function startFlee(w, f) {
  f.fled = true; f.cast = null;
  let best = null, bd = 40;
  for (const o of w.foes.values()) if (!o.dead && o.pack && o.pack !== f.pack && o.state !== 'chase' && o.state !== 'attack') { const d = dist(f, o); if (d < bd) { bd = d; best = o; } }
  if (!best) return;
  f.state = 'flee'; f.fleeTo = { x: best.x, z: best.z, pack: best.pack };
  w.events.push({ k: 'fability', s: f.id, sk: 'Calls for help!' });
}
function flee(w, f, dt) {
  const p = f.fleeTo; if (!p) { f.state = 'chase'; return; }
  approachPoint(w, f, p.x, p.z, f.speed * 1.15 * speedFactor(f), dt);
  if (dist(f, p) < 3) {
    const tid = [...f.threat.keys()][0];
    for (const o of w.foes.values()) if (o.pack === p.pack && !o.dead && tid) { o.threat.set(tid, 5); o.state = 'chase'; }
    f.state = 'chase'; f.fleeTo = null;
  }
}

// ---- the shaman: heal / buff first --------------------------------------------------------------------------------
function shamanTurn(w, f) {
  if (f.cast) return false;
  let hurtMate = null;
  for (const o of w.foes.values()) if (o.pack === f.pack && !o.dead && o.hp < o.maxHp * 0.5 && dist(f, o) < 14 && (!hurtMate || o.hp / o.maxHp < hurtMate.hp / hurtMate.maxHp)) hurtMate = o;
  const ab = readyAbility(w, f, a => (hurtMate ? a.kind === 'heal' : (a.kind === 'buff' || a.kind === 'pack_buff')));
  if (ab) { startAbility(w, f, hurtMate || f, ab); return true; }
  return false;
}
function behindPack(w, f, t, speed, dt) {
  let cx = 0, cz = 0, n = 0;
  for (const o of w.foes.values()) if (o.pack === f.pack && !o.dead && o !== f) { cx += o.x; cz += o.z; n++; }
  if (!n) { cx = f.x; cz = f.z; } else { cx /= n; cz /= n; }
  const dx = cx - t.x, dz = cz - t.z, l = Math.hypot(dx, dz) || 1;
  const px = cx + dx / l * 4, pz = cz + dz / l * 4;
  if (Math.hypot(px - f.x, pz - f.z) > 1) { approachPoint(w, f, px, pz, speed, dt); f.state = 'chase'; } else { f.state = 'attack'; face(f, t); separate(w, f, dt); }
}

// ---- moving ----------------------------------------------------------------------------------------------------------
/** Toward a target: straight when the line is clear, along the flow field when it is not. */
function approach(w, f, t, speed, dt, blocked = false, want = null) {
  if (!blocked && want != null) { const d = dist(f, t), k = Math.max(0, d - want + 0.05) / d; return steer(w, f, f.x + (t.x - f.x) * k, f.z + (t.z - f.z) * k, speed, dt); }
  approachPoint(w, f, t.x, t.z, speed, dt);
}
function approachPoint(w, f, x, z, speed, dt) {
  if (clearLine(w.area, f.x, f.z, x, z, f.r * 0.9)) return steer(w, f, x, z, speed, dt);
  const next = downhill(w, flowTo(w, x, z), f.x, f.z);
  if (next) steer(w, f, next[0], next[1], speed, dt); else steer(w, f, x, z, speed, dt);
}
function awayFrom(w, f, t, speed, dt) { const dx = f.x - t.x, dz = f.z - t.z, l = Math.hypot(dx, dz) || 1; steer(w, f, f.x + dx / l * 3, f.z + dz / l * 3, speed, dt); }
function strafe(w, f, t, speed, dt) { const dx = t.x - f.x, dz = t.z - f.z, l = Math.hypot(dx, dz) || 1, s = (f.id.charCodeAt(f.id.length - 1) % 2) ? 1 : -1; steer(w, f, f.x - dz / l * 2 * s, f.z + dx / l * 2 * s, speed, dt); }
/** Skirmisher: swing round to the target's side or back, then dive in again. */
function flank(w, f, t, speed, dt) {
  const back = t.yaw + Math.PI + (f.flankSide || 1) * 0.9;
  const px = t.x + Math.sin(back) * 2.2, pz = t.z + Math.cos(back) * 2.2;
  approachPoint(w, f, px, pz, speed * 1.1, dt); f.state = 'chase';
  if (Math.hypot(px - f.x, pz - f.z) < 0.6) f.flankUntil = 0;
}
/** Seek a point, pushed apart from everyone; slide round blockers; a body that has stopped dead shuffles free. */
export function steer(w, f, tx, tz, speed, dt, extra = null) {
  let dx = tx - f.x, dz = tz - f.z; const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  const [sx, sz] = separation(w, f);
  dx += sx * 1.6; dz += sz * 1.6;
  if (extra) { dx += extra[0]; dz += extra[1]; }
  const l = Math.hypot(dx, dz) || 1, step = Math.min(speed * dt, d);
  const ox = f.x, oz = f.z;
  [f.x, f.z] = resolve(w.area, f.x + dx / l * step, f.z + dz / l * step, f.r);
  if (d > 0.05) f.yaw = Math.atan2(tx - f.x, tz - f.z);
  if (step > 0.01 && Math.hypot(f.x - ox, f.z - oz) < step * 0.2) { if (++f.stuck > 12) { unstick(w, f); f.stuck = 0; } } else f.stuck = 0;
}
/** Last resort (ruling 19): hop to the nearest open walk-grid cell. */
function unstick(w, f) {
  const a = w.rng() * Math.PI * 2;
  [f.x, f.z] = resolve(w.area, f.x + Math.cos(a) * 0.8, f.z + Math.sin(a) * 0.8, f.r);
  f.unstuck = (f.unstuck || 0) + 1;
}
function separate(w, f, dt, extra = null) {
  let [sx, sz] = separation(w, f); if (extra) { sx += extra[0] * 0.2; sz += extra[1] * 0.2; }
  if (!sx && !sz) return;
  [f.x, f.z] = resolve(w.area, f.x + sx * f.speed * 0.5 * dt, f.z + sz * f.speed * 0.5 * dt, f.r);
}
/** Push from every other live foe closer than both radii + SEP (no piles, ruling 16). Heroes don't push (WoW). */
function separation(w, f) {
  let sx = 0, sz = 0;
  for (const o of w.foes.values()) {
    if (o === f || o.dead) continue;
    const dx = f.x - o.x, dz = f.z - o.z, min = f.r + o.r + SEP, d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2), push = (min - d) / min;
    if (d2 > 1e-8) { sx += dx / d * push; sz += dz / d * push; }
    else { const a = (f.id.charCodeAt(1) * 7 + o.id.charCodeAt(1) * 3) % 6.28; sx += Math.cos(a) * push; sz += Math.sin(a) * push; }
  }
  return [sx, sz];
}
/** Swarms keep together (cohesion toward the flock's middle, weak). */
function cohesion(w, f) {
  let cx = 0, cz = 0, n = 0;
  for (const o of w.foes.values()) if (o !== f && !o.dead && o.pack === f.pack) { cx += o.x; cz += o.z; n++; }
  if (!n) return null; cx /= n; cz /= n; const dx = cx - f.x, dz = cz - f.z, l = Math.hypot(dx, dz) || 1;
  return [dx / l * 0.3, dz / l * 0.3];
}

// ---- attacking -------------------------------------------------------------------------------------------------------
function attack(w, f, t) {
  f.nextSwing = w.time + 1 / (f.attackSpeed || 0.5);
  const ab = readyAbility(w, f, a => a.kind !== 'heal' && a.kind !== 'buff' && a.kind !== 'pack_buff' && a.kind !== 'passive' && a.kind !== 'flee_call');
  if (ab && w.rng() < (f.def.boss ? 0.8 : 0.45)) return startAbility(w, f, t, ab);
  const amount = f.dmg * dmgFactor(f) * (0.85 + w.rng() * 0.3);
  if (RANGED.has(f.def.role) && f.def.attackRange > 4) {
    w.shots.push({ id: 's' + (w.nextId++), from: f.id, to: t.id, x: f.x, z: f.z, speed: 18, type: f.def.damageType, amount, spell: f.def.role !== 'archer', foeShot: true });
    w.events.push({ k: 'shoot', s: f.id, t: t.id, ty: f.def.damageType });
  } else {
    const r = resolveHit(f, t, { amount, type: f.def.damageType, spell: false }, w.rng);
    hurt(w, f, t, r, f.def.damageType);
    if (f.mods) modsHitDealt(w, f, t, r);
    w.events.push({ k: 'swing', s: f.id });
    if (f.def.role === 'skirmisher' && ++f.hits % 2 === 0) { f.flankUntil = w.time + 3; f.flankSide = w.rng() < 0.5 ? 1 : -1; }
  }
}
