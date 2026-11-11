// Companions (M19, ruling 19): mercenaries now; pets and summons (spec skills, M20+) use the same brain. Pure.
// The rules the owner set: intelligent, proactively defend the player, never get stuck, never ignore combat, never
// stack in a pile. So, each step a companion:
//   1. DEFENDS: anything hitting its hero (or another hero) is the target first, nearest first
//   2. ASSISTS: else its hero's target, if that is a live enemy within 20 m
//   3. ENGAGES: else anything already fighting within 12 m of the hero (no ignoring a fight)
//   4. FOLLOWS: else a formation slot behind its hero (slots by role: tanks forward, ranged behind, others to the side)
// Movement = the monsters' steering (separation from everything, flow field round obstacles, unstick as a last resort).
import { resolveHit, addThreat, taunt as tauntTable } from '../rules/combat.js';
import { hurt } from './fight.js';
import { addFx, speedFactor } from './status.js';
import { resolve } from './move.js';
import { clearLine, flowTo, downhill } from './paths.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const allyId = (owner, kind = 'merc') => `a:${kind}:${owner}`;

/** A companion's numbers at a level (hero-like baseline x the kind's multipliers, plus what it wears). */
export function allyStats(w, spec, level) {
  const K = spec.kind && w.content.mercs?.kinds?.[spec.kind] || spec.def || {};
  const base = 70 + 18 * (level - 1), D = w.content.items;
  let wdps = 4 + 1.5 * level + 0.02 * level * level, armour = (K.armour || 10) + (K.armourPerLevel || 3) * level;
  for (const it of Object.values(spec.equip || {})) { if (!it || !D?.bases?.[it.base]) continue; const b = D.bases[it.base]; if (b.damage) wdps = Math.max(wdps, (b.damage.min + b.damage.max) / 2 * b.damage.speed); if (b.armour) armour += b.armour; }
  return { maxHp: Math.round(base * (K.hpMult || 1)), dmg: +(wdps * (K.attackSecs || 2) * (K.dmgMult || 1)).toFixed(1), armour: Math.round(armour), range: K.range || 2, speed: K.speed || 4.4, attackSecs: K.attackSecs || 2, skills: K.skills || [], role: K.role || 'melee', type: K.type || 'physical', name: spec.name || K.name };
}
export function spawnAlly(w, owner, spec, kind = 'merc', idOverride = null) {
  const p = w.players.get(owner); if (!p) return null;
  w.allies ||= new Map();
  const id = idOverride || allyId(owner, kind), s = allyStats(w, spec, p.level);
  const a = { id, kind: 'ally', akind: kind, team: 'hero', owner, name: s.name, look: spec.look || null, level: p.level, mercKind: spec.kind,
    x: p.x + 1.5, z: p.z + 1.5, yaw: p.yaw, r: 0.42, speed: s.speed, hp: s.maxHp, maxHp: s.maxHp, dmg: s.dmg, armour: s.armour, resists: {}, crit: 5, dodge: 4, block: null,
    range: s.range, attackSecs: s.attackSecs, skills: s.skills, role: s.role, dtype: s.type, cds: {}, fx: [], target: null, nextSwing: 0, dead: false, stuck: 0, moving: false, lastFight: -99 };
  w.allies.set(id, a);
  return a;
}
/** A spec's pet or minion (the skill engine's `summon` effect). Caps (ruling 35): one pet; minions up to MAX_MINIONS
 *  (the oldest goes when a new one comes). `secs` 0 = stays until it dies or is called again. */
export const MAX_MINIONS = 8;
export function summon(w, owner, e) {
  const p = w.players.get(owner); if (!p) return [];
  w.allies ||= new Map();
  const def = { hpMult: e.hpMult || 0.6, dmgMult: e.dmgMult || 0.6, role: e.role || 'melee', skills: e.skills || [], armour: 6, armourPerLevel: 3, range: e.role === 'ranged' || e.role === 'caster' ? 11 : 1.7, speed: 4.8, attackSecs: 1.8, type: e.type || 'physical' };
  const made = [];
  if ((e.kind || 'minion') === 'pet') { const id = `a:pet:${owner}`; w.allies.delete(id); made.push(spawnAlly(w, owner, { def, name: e.name || 'Pet' }, 'pet', id)); }
  else for (let i = 0; i < (e.count || 1); i++) {
    const mine = [...w.allies.values()].filter(a => a.owner === owner && a.akind === 'minion').sort((x, y) => x.born - y.born);
    while (mine.length >= MAX_MINIONS) w.allies.delete(mine.shift().id);
    made.push(spawnAlly(w, owner, { def, name: e.name || 'Minion' }, 'minion', `a:min:${owner}:${w.nextId++}`));
  }
  for (const a of made) { if (!a) continue; a.born = w.time; a.until = e.secs ? w.time + e.secs : 0; const g = w.rng() * 6.283; a.x = p.x + Math.cos(g) * 1.6; a.z = p.z + Math.sin(g) * 1.6; }
  w.events.push({ k: 'summon', s: owner, n: made.length, name: e.name });
  return made.filter(Boolean);
}
export const heroLike = (w, id) => w.players.get(id) || w.allies?.get(id) || null;

export function stepAllies(w, dt) {
  if (!w.allies?.size) return;
  for (const a of w.allies.values()) {
    const p = w.players.get(a.owner);
    if (!p) { w.allies.delete(a.id); continue; }
    if (a.until && w.time > a.until) { w.allies.delete(a.id); w.events.push({ k: 'unsummon', t: a.id }); continue; }
    if (a.dead) { if (a.akind !== 'merc') w.allies.delete(a.id); continue; }
    // regenerate between fights
    if (w.time - a.lastFight > 5) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.04 * dt);
    if (a.fx?.length) a.fx = a.fx.filter(f => f.until > w.time);
    // too far behind (a different screen): catch up at once, like a D2 hireling
    if (dist(a, p) > 30) { [a.x, a.z] = resolve(w.area, p.x + 1.5, p.z + 1.5, a.r); a.target = null; }
    const t = choose(w, a, p);
    a.target = t?.id || null;
    if (t) fight(w, a, t, dt); else follow(w, a, p, dt);
  }
}
function choose(w, a, p) {
  let best = null, bd = Infinity;
  // 1. defend: enemies targeting our hero, any hero, or us
  for (const f of w.foes.values()) {
    if (f.dead || (f.state !== 'attack' && f.state !== 'chase')) continue;
    const onUs = f.target === a.owner ? 0 : f.target === a.id ? 1 : w.players.has(f.target) ? 3 : 99;
    if (onUs >= 99) continue;
    const d = dist(a, f) + onUs * 6;
    if (d < bd && dist(p, f) < 22) { bd = d; best = f; }
  }
  if (best) return best;
  // 2. assist: the hero's target
  const ht = p.target && w.foes.get(p.target);
  if (ht && !ht.dead && dist(p, ht) < 20) return ht;
  // 3. anything fighting near the hero
  for (const f of w.foes.values()) if (!f.dead && (f.state === 'attack' || f.state === 'chase') && dist(p, f) < 12) { const d = dist(a, f); if (d < bd) { bd = d; best = f; } }
  return best;
}
function slotFor(a, p) {
  // minions fan out round their master by their own number, so a crowd of eight is a ring, not a pile
  const n = a.akind === 'minion' ? (parseInt(a.id.split(':').pop(), 10) || 0) : 0;
  const back = a.role === 'tank' ? -1.6 : a.role === 'ranged' || a.role === 'caster' ? 3 : 2, side = a.role === 'tank' ? 0 : a.akind === 'pet' ? -1.8 : a.akind === 'minion' ? ((n % 5) - 2) * 1.3 : 1.8;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  return { x: p.x - fx * back + fz * side, z: p.z - fz * back - fx * side };
}
function follow(w, a, p, dt) {
  const s = slotFor(a, p), d = dist(a, s);
  if (d > 0.6) { steer(w, a, s.x, s.z, a.speed * (d > 6 ? 1.25 : 1) * speedFactor(a), dt); a.moving = true; } else { separate(w, a, dt); a.moving = false; }
}
function fight(w, a, t, dt) {
  a.lastFight = w.time;
  const reach = a.range + a.r + t.r, d = dist(a, t), sees = clearLine(w.area, a.x, a.z, t.x, t.z, 0.1);
  if (d > reach - 0.1 || !sees) { steer(w, a, t.x, t.z, a.speed * speedFactor(a), dt, !sees); a.moving = true; }
  else if ((a.role === 'ranged' || a.role === 'caster') && d < 3.5) { const l = d || 1; steer(w, a, a.x + (a.x - t.x) / l * 3, a.z + (a.z - t.z) / l * 3, a.speed, dt); a.moving = true; }
  else { separate(w, a, dt); a.moving = false; a.yaw = Math.atan2(t.x - a.x, t.z - a.z); }
  if (d <= reach + 0.2 && sees && w.time >= a.nextSwing) attack(w, a, t);
}
function attack(w, a, t) {
  a.nextSwing = w.time + a.attackSecs;
  for (const s of a.skills) {
    if ((a.cds[s.id] || 0) > w.time) continue;
    if (useSkill(w, a, t, s)) { a.cds[s.id] = w.time + (s.cd || 0); return; }
  }
  basic(w, a, t, 1);
}
function basic(w, a, t, mult, extra = {}) {
  const ranged = a.role === 'ranged' || a.role === 'caster';
  if (ranged) { w.shots.push({ id: 's' + (w.nextId++), from: a.id, to: t.id, x: a.x, z: a.z, speed: 26, type: a.dtype, amount: a.dmg * mult * (0.85 + w.rng() * 0.3), spell: a.dtype !== 'physical', ...extra }); w.events.push({ k: 'shoot', s: a.id, t: t.id, ty: a.role === 'ranged' ? 'arrow' : a.dtype }); }
  else { const r = resolveHit(a, t, { amount: a.dmg * mult * (0.85 + w.rng() * 0.3), type: 'physical' }, w.rng); hurt(w, a, t, r, 'physical', a.role === 'tank' ? 2 : 1); w.events.push({ k: 'swing', s: a.id }); }
}
function useSkill(w, a, t, s) {
  const p = w.players.get(a.owner);
  switch (s.kind) {
    case 'taunt': { const near = [...w.foes.values()].filter(f => !f.dead && dist(a, f) < (s.radius || 6) && f.target !== a.id); if (!near.length) return false; for (const f of near) { tauntTable(f.threat, a.id); f.target = a.id; } w.events.push({ k: 'fability', s: a.id, sk: s.name }); return true; }
    case 'strike': basic(w, a, t, s.mult || 1.3); if (s.interrupt && t.cast && t.cast.interruptible !== false) { w.events.push({ k: 'interrupt', s: a.id, t: t.id, sk: t.cast.name }); t.cast = null; t.silencedUntil = w.time + 2; } if (s.slow) addFx(w, t, { id: s.id, kind: 'slow', pct: s.slow, secs: s.secs || 3, src: a.id }); return true;
    case 'self': if (a.hp > a.maxHp * 0.6) return false; addFx(w, a, { id: s.id, kind: 'buff', stat: 'armour', pct: s.pct || 30, secs: s.secs || 6, src: a.id }); w.events.push({ k: 'fability', s: a.id, sk: s.name }); return true;
    case 'aoe': { const hit = [...w.foes.values()].filter(f => !f.dead && dist(f, t) < (s.radius || 3)); if (hit.length < 2) return false; for (const f of hit) hurt(w, a, f, resolveHit(a, f, { amount: a.dmg * (s.mult || 0.8), type: s.type || a.dtype, spell: (s.type || a.dtype) !== 'physical' }, w.rng), s.type || a.dtype); w.events.push({ k: 'burst', x: t.x, z: t.z, r: s.radius || 3, ty: s.type || 'physical' }); return true; }
    case 'kite': if (dist(a, t) > 3) return false; { const l = dist(a, t) || 1; [a.x, a.z] = resolve(w.area, a.x + (a.x - t.x) / l * 4, a.z + (a.z - t.z) / l * 4, a.r); } return true;
    case 'bolt': basic(w, a, t, s.mult || 1); return true;
    case 'heal': { const who = [p, a].filter(x => x && !x.dead && x.hp < x.maxHp * 0.6).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]; if (!who) return false; const n = Math.round(who.maxHp * (s.pct || 15) / 100); who.hp = Math.min(who.maxHp, who.hp + n); w.events.push({ k: 'heal', s: a.id, t: who.id, n }); return true; }
    case 'shield': if (!p || p.dead || p.fx?.some(f => f.kind === 'shield')) return false; addFx(w, p, { id: s.id, kind: 'shield', left: p.maxHp * (s.pct || 15) / 100, secs: s.secs || 8, src: a.id }); w.events.push({ k: 'fability', s: a.id, sk: s.name }); return true;
  }
  return false;
}
// steering shared with the monsters' feel: separation from everyone + the walk grid when the line is blocked
function steer(w, a, tx, tz, speed, dt, blocked = false) {
  if (blocked || !clearLine(w.area, a.x, a.z, tx, tz, a.r * 0.9)) { const n = downhill(w, flowTo(w, tx, tz), a.x, a.z); if (n) { tx = n[0]; tz = n[1]; } }
  let dx = tx - a.x, dz = tz - a.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  const [sx, sz] = sep(w, a); dx += sx * 1.6; dz += sz * 1.6;
  const l = Math.hypot(dx, dz) || 1, step = Math.min(speed * dt, d), ox = a.x, oz = a.z;
  [a.x, a.z] = resolve(w.area, a.x + dx / l * step, a.z + dz / l * step, a.r);
  if (d > 0.05) a.yaw = Math.atan2(tx - a.x, tz - a.z);
  if (step > 0.01 && Math.hypot(a.x - ox, a.z - oz) < step * 0.2) { if (++a.stuck > 12) { const g = w.rng() * 6.283; [a.x, a.z] = resolve(w.area, a.x + Math.cos(g) * 0.8, a.z + Math.sin(g) * 0.8, a.r); a.stuck = 0; } } else a.stuck = 0;
}
function separate(w, a, dt) { const [sx, sz] = sep(w, a); if (sx || sz) [a.x, a.z] = resolve(w.area, a.x + sx * a.speed * 0.5 * dt, a.z + sz * a.speed * 0.5 * dt, a.r); }
function sep(w, a) {
  let sx = 0, sz = 0;
  const push = (o, extra) => { if (o === a || o.dead) return; const dx = a.x - o.x, dz = a.z - o.z, min = a.r + o.r + extra, d2 = dx * dx + dz * dz; if (d2 >= min * min) return; const d = Math.sqrt(d2) || 0.01, k = (min - d) / min; sx += (d2 ? dx / d : 1) * k; sz += (d2 ? dz / d : 0.3) * k; };
  for (const o of w.allies.values()) push(o, 0.4); for (const o of w.players.values()) push(o, 0.3); for (const o of w.foes.values()) push(o, 0.2);
  return [sx, sz];
}
void addThreat;
