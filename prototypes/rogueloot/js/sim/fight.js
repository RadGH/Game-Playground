// Fighting inside the sim: skills (instant / cast / auto-attack / bolts), damage through js/rules/combat.js, threat,
// deaths, experience, revive and release. Pure. Events go to w.events for the browsers (numbers, flashes, deaths).
import { resolveHit, addThreat, GCD, THREAT } from '../rules/combat.js';
import { gainXp } from '../rules/character.js';
import { partyShares } from '../rules/progression.js';
import { has } from './status.js';
import { applyRider } from './abilities.js';

export const KEEP_CORPSE = 10;           // seconds a dead monster lies there
export const REVIVE_TIME = 3;            // seconds a friend channels to bring you back
export const REVIVE_RANGE = 3;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const gap = (a, b) => dist(a, b) - (a.r || 0) - (b.r || 0);
const face = (a, b) => { a.yaw = Math.atan2(b.x - a.x, b.z - a.z); };

export const actorById = (w, id) => w.players.get(id) || w.foes.get(id) || null;
const alive = a => a && !a.dead;
/** Which skills a hero has: everyone's, their Path's and (M20+) their spec's. */
export function knows(p, skill) {
  if (!skill) return false;
  if (skill.owner === 'all' || skill.owner === 'wanderer') return true;
  const ch = p.char || {};
  return skill.owner === ch.path || skill.owner === ch.spec;
}

export function setTarget(w, p, id) {
  if (id == null) { p.target = null; p.autoOn = false; return { ok: true }; }
  const t = actorById(w, id); if (!t) return { err: 'Nothing there.' };
  p.target = id; if (t.team === 'hero') p.autoOn = false;
  return { ok: true };
}

/** Use a skill. Returns { ok } or { err: 'player text' } (the browser shows the reason). */
export function useSkill(w, p, skillId, targetId) {
  if (p.dead) return { err: 'You are dead.' };
  if (has(p, 'stun')) return { err: 'You are stunned.' };
  const sk = w.content.skills?.[skillId];
  if (sk && sk.kind !== 'auto' && sk.kind !== 'melee' && has(p, 'silence')) return { err: 'You are silenced.' };
  if (!sk || !knows(p, sk)) return { err: "You don't know that." };
  if (sk.kind === 'auto') {
    const t = actorById(w, targetId); if (!alive(t) || t.team !== 'foe') return { err: 'No enemy targeted.' };
    p.target = t.id; p.autoOn = true; return { ok: true };
  }
  if (p.cast) return { err: 'Already casting.' };
  if ((sk.gcd ?? true) && w.time < p.gcdUntil - 1e-6) return { err: 'Not ready yet.' };
  if ((p.cds[skillId] || 0) > w.time + 1e-6) return { err: 'Not ready yet.' };
  const cost = sk.cost?.mana || 0; if (p.mana < cost) return { err: 'Not enough mana.' };
  let t = null;
  if (sk.target === 'enemy') {
    t = actorById(w, targetId); if (!alive(t) || t.team !== 'foe') return { err: 'No enemy targeted.' };
    const reach = sk.kind === 'melee' ? p.weapon.reach : (sk.range || 20);
    if (gap(p, t) > reach) return { err: 'Too far away.' };
    p.target = t.id;
  } else if (sk.target === 'ally') {
    t = actorById(w, targetId); if (!t || t.team !== 'hero' || t.dead) t = p;
    if (dist(p, t) > (sk.range || 20)) return { err: 'Too far away.' };
  } else t = p;
  p.mana -= cost;
  if (sk.gcd ?? true) p.gcdUntil = w.time + GCD;
  if (sk.cd) p.cds[skillId] = w.time + sk.cd;
  if (t !== p) face(p, t);
  if (sk.cast > 0) { p.cast = { skill: skillId, target: t.id, start: w.time, end: w.time + sk.cast }; w.events.push({ k: 'cast', s: p.id, sk: skillId, t: sk.cast }); return { ok: true }; }
  fire(w, p, sk, t);
  if (sk.kind === 'melee' && sk.target === 'enemy') p.autoOn = true;       // a weapon skill starts the swing too (WoW)
  return { ok: true };
}

/** A skill goes off (instantly, or when its cast finishes). */
function fire(w, p, sk, t) {
  p.lastFight = w.time;
  if (sk.kind === 'melee') return weaponHit(w, p, t, sk.weaponMult ?? 1, sk);
  if (sk.kind === 'bolt') {
    const amount = (sk.base[0] + sk.base[1] * p.level) * (p.st.spellPower || 1);
    w.shots.push({ id: 's' + (w.nextId++), from: p.id, to: t.id, x: p.x, z: p.z, speed: sk.speed || 24, type: sk.type || 'storm', amount, sk: sk.id, spell: true });
    w.events.push({ k: 'shoot', s: p.id, t: t.id, ty: sk.type });
    return;
  }
  if (sk.kind === 'heal') {
    const amount = Math.round((sk.base[0] + sk.base[1] * p.level) * (p.st.healPower || 1));
    const before = t.hp; t.hp = Math.min(t.maxHp, t.hp + amount); const done = Math.round(t.hp - before);
    w.events.push({ k: 'heal', s: p.id, t: t.id, n: done });
    // healing angers whatever is fighting the one healed (light threat, ruling 42)
    for (const f of w.foes.values()) if (!f.dead && f.threat.has(t.id)) addThreat(f.threat, p.id, done * THREAT.healing);
  }
}

/** One weapon blow (auto-attack or a weapon skill). */
function weaponHit(w, p, t, mult, sk = null) {
  const wpn = p.weapon, roll = wpn.min + w.rng() * (wpn.max - wpn.min) + (p.st.attackPower || 0) / 14;
  const power = wpn.ranged ? p.st.rangedPower : p.st.meleePower;
  const r = resolveHit(p, t, { amount: roll * mult * power, type: 'physical', critBonus: 0 }, w.rng);
  // elemental damage on the weapon lands with the blow, each against its own resist
  if (r.amount > 0 && p.st.elemFlat) for (const [ty, n] of Object.entries(p.st.elemFlat)) if (n > 0) { const e = n * (1 + (p.st.elemPct?.[ty] || 0) / 100) * mult * (1 - Math.min(75, t.resists?.[ty] || 0) / 100); r.amount += Math.round(e); }
  if (r.amount > 0 && p.st.lifeOnHit) p.hp = Math.min(p.maxHp, p.hp + p.st.lifeOnHit);
  hurt(w, p, t, r, sk?.type || 'physical', (sk?.threat ?? 1));
  if (sk?.interrupts && t.cast && r.amount > 0 && t.cast.interruptible !== false) {
    w.events.push({ k: 'interrupt', s: p.id, t: t.id, sk: t.cast.name });
    t.silencedUntil = w.time + (+t.cast.ab?.interruptLock || 2);          // the bestiary's lockout after a kick
    t.cast = null; t.nextSwing = w.time + 1;
  }
}

/** Apply a resolved blow: hp, threat, events, death. */
export function hurt(w, src, t, r, type, threatMult = 1) {
  if (t.dead) return;
  w.events.push({ k: 'dmg', s: src.id, t: t.id, n: r.amount, r: r.result, ty: type });
  if (!r.amount) { if (t.team === 'foe') aggro(w, t, src, 1); return; }
  t.hp -= r.amount;
  if (t.team === 'foe') aggro(w, t, src, r.amount * THREAT.damage * threatMult);
  else { t.lastHurt = w.time; t.lastFight = w.time; }
  src.lastFight = w.time;
  if (t.hp <= 0) die(w, t, src);
}
/** A monster notices someone (and its pack does too). */
export function aggro(w, f, who, threat) {
  if (f.dead || !who || who.team !== 'hero') return;
  addThreat(f.threat, who.id, threat);
  if (f.state === 'idle' || f.state === 'wander' || f.state === 'return') f.state = 'chase';
  if (f.pack) for (const o of w.foes.values()) if (o.pack === f.pack && o !== f && !o.dead && !o.threat.has(who.id)) { addThreat(o.threat, who.id, 1); if (o.state !== 'chase' && o.state !== 'attack') o.state = 'chase'; }
}

function die(w, t, killer) {
  t.hp = 0; t.dead = true; t.diedAt = w.time; t.cast = null;
  w.events.push({ k: 'die', t: t.id, s: killer?.id });
  if (t.team === 'foe') {
    // experience to every living hero nearby, split by level (ruling 12)
    const near = [...w.players.values()].filter(p => !p.dead && dist(p, t) < 60);
    const shares = partyShares(t.level, near.map(p => p.level), t.rank === 'normal' ? (t.def.boss ? 'boss' : 'normal') : t.rank, t.def.xp || 1);
    near.forEach((p, i) => { if (shares[i] > 0) giveXp(w, p, shares[i]); });
  } else {
    t.autoOn = false; t.target = null; t.queue.length = 0;
    // soft death (ruling 7): every worn item loses a tenth of its durability; nothing drops
    const eq = t.char?.equip; if (eq) { for (const it of Object.values(eq)) if (it?.dur) it.dur = [Math.max(0, it.dur[0] - Math.ceil(it.dur[1] * 0.1)), it.dur[1]]; w.charDirty.add(t.id); refreshHero(w, t); t.hp = 0; }
    for (const f of w.foes.values()) { f.threat.delete(t.id); if (f.target === t.id) f.target = null; }
  }
}
export function giveXp(w, p, n) {
  const ch = gainXp(p.char, n); const ups = ch.levelled; delete ch.levelled;
  p.char = ch; w.charDirty.add(p.id);
  w.events.push({ k: 'xp', t: p.id, n });
  if (ups > 0) {
    p.level = ch.level;
    w.events.push({ k: 'level', t: p.id, lvl: ch.level });
    refreshHero(w, p); p.hp = p.maxHp; p.mana = p.maxMana;
  }
}
import { refreshHero } from './actors.js';

export function stepCasts(w) {
  for (const p of w.players.values()) {
    const c = p.cast; if (!c || w.time < c.end - 1e-6) continue;
    p.cast = null;
    const sk = w.content.skills[c.skill], t = actorById(w, c.target);
    if (c.skill === 'revive') { if (t && t.dead && dist(p, t) <= REVIVE_RANGE + 1) { t.dead = false; t.hp = Math.round(t.maxHp * 0.4); t.mana = Math.round(t.maxMana * 0.4); w.events.push({ k: 'revive', s: p.id, t: t.id }); } continue; }
    if (!sk || !t) continue;
    if (sk.target === 'enemy' && !alive(t)) continue;
    if (sk.target === 'enemy' && gap(p, t) > (sk.range || p.weapon.reach) + 2) { w.events.push({ k: 'cancel', s: p.id, why: 'range' }); continue; }
    face(p, t); fire(w, p, sk, t);
  }
}
export function stepAuto(w) {
  for (const p of w.players.values()) {
    if (!p.autoOn || p.dead || p.cast || has(p, 'stun')) continue;
    const t = actorById(w, p.target);
    if (!alive(t) || t.team !== 'foe') { p.autoOn = false; continue; }
    if (gap(p, t) > p.weapon.reach || w.time < p.nextSwing) continue;
    face(p, t);
    p.nextSwing = w.time + 1 / p.weapon.speed;
    if (p.weapon.ranged) { const roll = p.weapon.min + w.rng() * (p.weapon.max - p.weapon.min); w.shots.push({ id: 's' + (w.nextId++), from: p.id, to: t.id, x: p.x, z: p.z, speed: 30, type: 'physical', amount: roll * p.st.rangedPower, spell: false }); w.events.push({ k: 'shoot', s: p.id, t: t.id, ty: 'arrow' }); }
    else { weaponHit(w, p, t, 1); w.events.push({ k: 'swing', s: p.id }); }
    p.lastFight = w.time;
  }
}
export function stepShots(w, dt) {
  const keep = [];
  for (const s of w.shots) {
    const t = actorById(w, s.to), src = actorById(w, s.from);
    if (!t || t.dead) continue;
    const d = dist(s, t), mv = s.speed * dt;
    if (d <= mv + (t.r || 0.4)) {
      if (src) {
        const r = s.foeShot ? resolveHit(src, t, { amount: s.amount, type: s.type, spell: s.spell }, w.rng) : resolveHit(src, t, { amount: s.amount, type: s.type, spell: s.spell }, w.rng);
        hurt(w, src, t, r, s.type, s.threat ?? 1);
        if (s.onHit && r.amount > 0) applyRider(w, src, t, { id: s.onHit.id, damageType: s.type }, s.onHit.fx);
      }
      continue;
    }
    s.x += (t.x - s.x) / d * mv; s.z += (t.z - s.z) / d * mv;
    keep.push(s);
  }
  w.shots = keep;
}

/** Dead: go back to the area's waypoint with half health (soft death, ruling 7; durability loss arrives with items). */
export function release(w, p) {
  if (!p.dead) return { err: 'You are not dead.' };
  const s = w.area.spawn; p.x = s.x; p.z = s.z; p.dead = false; p.hp = Math.round(p.maxHp * 0.5); p.mana = Math.round(p.maxMana * 0.5);
  p.cast = null; p.target = null; p.autoOn = false;
  w.events.push({ k: 'respawn', t: p.id });
  return { ok: true };
}
/** Start bringing a fallen friend back: a 3 s channel that moving cancels. */
export function startRevive(w, p, id) {
  const t = w.players.get(id);
  if (p.dead) return { err: 'You are dead.' };
  if (!t || !t.dead) return { err: 'Nobody to revive.' };
  if (dist(p, t) > REVIVE_RANGE) return { err: 'Get closer.' };
  if (p.cast) return { err: 'Already casting.' };
  p.cast = { skill: 'revive', target: t.id, start: w.time, end: w.time + REVIVE_TIME };
  w.events.push({ k: 'cast', s: p.id, sk: 'revive', t: REVIVE_TIME });
  return { ok: true };
}
