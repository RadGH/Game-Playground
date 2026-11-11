// Monster brains (rulings 16, 19, 45). Pure. Every foe each step:
//   idle/wander -> notices a hero (aggro radius, line of sight later) -> chase -> attack / cast -> back home if leashed.
// Movement is steering, not teleporting: seek the attack spot, keep apart from packmates (separation = no piles),
// slide round blockers (move.js resolve). M5 adds the role behaviours (skirmisher kiting, archer line-of-sight, shaman
// buffs, leader rally/flee) and flow fields so nothing gets stuck behind a wall.
import { resolve } from './move.js';
import { resolveHit, pickTarget } from '../rules/combat.js';
import { hurt, actorById } from './fight.js';

export const AGGRO = 9, LEASH = 34, SEP = 0.35;
const RANGED = new Set(['archer', 'caster', 'shaman']);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function stepBrains(w, dt) {
  const heroes = [...w.players.values()].filter(p => !p.dead);
  for (const f of w.foes.values()) {
    if (f.dead) continue;
    // notice
    if (f.state === 'idle' || f.state === 'wander') {
      for (const h of heroes) if (dist(f, h) < (f.def.ai.aggro || AGGRO) * (f.rank !== 'normal' ? 1.2 : 1)) { f.threat.set(h.id, 1); f.state = 'chase'; packWake(w, f, h); break; }
    }
    if (f.state === 'idle' || f.state === 'wander') { idle(w, f, dt); continue; }
    if (f.state === 'return') { goHome(w, f, dt); continue; }
    // chase / attack
    const tid = pickTarget(f.threat, f.target, id => { const a = w.players.get(id); return !!a && !a.dead; }, RANGED.has(f.def.role));
    if (!tid) { f.state = 'return'; f.target = null; f.cast = null; continue; }
    f.target = tid;
    const t = w.players.get(tid);
    if (dist(f, f.home) > LEASH) { f.state = 'return'; f.threat.clear(); f.target = null; f.cast = null; continue; }
    if (f.cast) { f.yaw = Math.atan2(t.x - f.x, t.z - f.z); if (w.time >= f.cast.end) finishCast(w, f, t); continue; }
    const range = f.def.attackRange + f.r + t.r;
    const want = RANGED.has(f.def.role) ? Math.max(range - 1.5, 2) : range - 0.15;
    const d = dist(f, t);
    // approach a point on a ring round the target along our own bearing, so a pack surrounds rather than piles
    if (d > want) { const k = Math.max(0, d - want + 0.05) / d; steer(w, f, f.x + (t.x - f.x) * k, f.z + (t.z - f.z) * k, f.speed, dt); f.state = 'chase'; }
    else { separate(w, f, dt); f.state = 'attack'; f.yaw = Math.atan2(t.x - f.x, t.z - f.z); }
    if (d <= range && w.time >= f.nextSwing) attack(w, f, t);
  }
}

function packWake(w, f, h) {
  if (!f.pack) return;
  for (const o of w.foes.values()) if (o.pack === f.pack && !o.dead && (o.state === 'idle' || o.state === 'wander')) { o.threat.set(h.id, 1); o.state = 'chase'; }
}

/** Monsters mill about near home (patrols in M5). */
function idle(w, f, dt) {
  if (w.time > f.wander.at) {
    f.wander.at = w.time + 3 + w.rng() * 7;
    const a = w.rng() * Math.PI * 2, r = w.rng() * 3;
    f.wander.x = f.home.x + Math.cos(a) * r; f.wander.z = f.home.z + Math.sin(a) * r;
  }
  if (dist(f, f.wander) > 0.3) { steer(w, f, f.wander.x, f.wander.z, f.speed * 0.35, dt); f.state = 'wander'; } else { f.state = 'idle'; separate(w, f, dt); }
}
/** Leashed: run home, healing fully on the way (no cheesy pulls to safety). */
function goHome(w, f, dt) {
  f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.25 * dt);
  if (dist(f, f.home) > 0.6) steer(w, f, f.home.x, f.home.z, f.speed * 1.3, dt);
  else { f.state = 'idle'; f.hp = f.maxHp; f.threat.clear(); }
}

/** Seek a point, pushed apart from packmates; slide round blockers. */
export function steer(w, f, tx, tz, speed, dt) {
  let dx = tx - f.x, dz = tz - f.z; const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  const [sx, sz] = separation(w, f);
  dx += sx * 1.6; dz += sz * 1.6;
  const l = Math.hypot(dx, dz) || 1, step = Math.min(speed * dt, d);
  const ox = f.x, oz = f.z;
  [f.x, f.z] = resolve(w.area, f.x + dx / l * step, f.z + dz / l * step, f.r);
  f.yaw = Math.atan2(tx - f.x, tz - f.z);
  // blocked (pushed back by a blocker): count it; M5's flow fields replace this simple nudge
  if (Math.hypot(f.x - ox, f.z - oz) < step * 0.2) { if (++f.stuck > 10) { const a = w.rng() * Math.PI * 2; [f.x, f.z] = resolve(w.area, f.x + Math.cos(a) * 0.6, f.z + Math.sin(a) * 0.6, f.r); f.stuck = 0; } } else f.stuck = 0;
}
function separate(w, f, dt) {
  const [sx, sz] = separation(w, f); if (!sx && !sz) return;
  [f.x, f.z] = resolve(w.area, f.x + sx * f.speed * 0.5 * dt, f.z + sz * f.speed * 0.5 * dt, f.r);
}
/** Push from every other live foe closer than both radii + SEP (no piles, ruling 16). */
function separation(w, f) {
  let sx = 0, sz = 0;
  for (const o of w.foes.values()) {
    if (o === f || o.dead) continue;
    const dx = f.x - o.x, dz = f.z - o.z, min = f.r + o.r + SEP, d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2) || 0.01, push = (min - d) / min;
    sx += (d2 ? dx / d : Math.cos(f.id.length + o.id.length)) * push; sz += (d2 ? dz / d : Math.sin(f.id.length)) * push;
  }
  return [sx, sz];
}

function attack(w, f, t) {
  f.nextSwing = w.time + 1 / (f.attackSpeed || 0.5);
  const ab = readyAbility(w, f);
  if (ab) return startAbility(w, f, t, ab);
  const amount = f.dmg * (0.85 + w.rng() * 0.3);
  if (RANGED.has(f.def.role) && f.def.attackRange > 4) {
    w.shots.push({ id: 's' + (w.nextId++), from: f.id, to: t.id, x: f.x, z: f.z, speed: 18, type: f.def.damageType, amount, spell: f.def.role !== 'archer', foeShot: true });
    w.events.push({ k: 'shoot', s: f.id, t: t.id, ty: f.def.damageType });
  } else {
    const r = resolveHit(f, t, { amount, type: f.def.damageType, spell: false }, w.rng);
    hurt(w, f, t, r, f.def.damageType);
    w.events.push({ k: 'swing', s: f.id });
  }
}

// ---- abilities (a first pass: a telegraphed, interruptible cast that hits harder; M5 reads the bestiary's full list) --
function readyAbility(w, f) {
  for (const ab of f.def.abilities) {
    const cd = +ab.cooldown || 8, cast = +ab.castTime || 0;
    if (cast <= 0) continue;
    if ((f.abilityAt[ab.id] || 0) > w.time) continue;
    if (w.rng() > 0.35) continue;
    f.abilityAt[ab.id] = w.time + cd;
    return ab;
  }
  return null;
}
function startAbility(w, f, t, ab) {
  f.cast = { name: ab.name || ab.id, ab, start: w.time, end: w.time + (+ab.castTime || 1.5), interruptible: ab.interruptible !== false };
  w.events.push({ k: 'fcast', s: f.id, sk: f.cast.name, t: f.cast.end - f.cast.start, int: f.cast.interruptible });
}
function finishCast(w, f, t) {
  const ab = f.cast.ab; f.cast = null; f.nextSwing = w.time + 1 / (f.attackSpeed || 0.5);
  const mult = +ab.damageMult || +ab.mult || 2;
  const type = ab.damageType || f.def.damageType;
  const r = resolveHit(f, t, { amount: f.dmg * mult, type, spell: type !== 'physical' }, w.rng);
  hurt(w, f, t, r, type);
  w.events.push({ k: 'fability', s: f.id, sk: ab.name || ab.id });
}
