// The skill engine (M9): runs every skill written in the effect vocabulary of data/skills-paths.json (docs/SKILLS.md).
// Pure. A hero's ranks are ch.skills { id: rank }; Wanderer skills are known by everyone at rank 1, a Path's starters are
// granted at the Path pick. Resources: mana for everyone except Fighters (rage, shown as "Temper") and Rogues
// (energy); a Fighter's or Rogue's Wanderer skills are re-priced in their own resource (resources.wandererSkillsAfterPath).
import { resolveHit, addThreat, taunt as tauntTable, GCD, THREAT } from '../rules/combat.js';
import { addFx } from './status.js';
import { resolve } from './move.js';
import { inside } from './abilities.js';

export const RES_OF = { fighter: 'rage', rogue: 'energy' };          // everyone else: mana
export const resourceOf = ch => RES_OF[ch?.path] || 'mana';
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const gap = (a, b) => dist(a, b) - (a.r || 0) - (b.r || 0);

/** The rank a hero has in a skill (Wanderer skills: 1 for everyone; 0 = not known). */
export function rankOf(ch, sk) {
  if (!sk) return 0;
  if (sk.owner === 'wanderer' || sk.owner === 'all') return Math.max(1, ch?.skills?.[sk.id] || 1);
  if (sk.owner !== ch?.path && sk.owner !== ch?.spec) return 0;
  return ch?.skills?.[sk.id] || 0;
}
/** A skill row with every perRank increment applied for rank r (arrays add element-wise). */
export function atRank(row, r) {
  if (!row || typeof row !== 'object') return row;
  if (Array.isArray(row)) return row.map(x => atRank(x, r));
  const out = {};
  for (const [k, v] of Object.entries(row)) if (k !== 'perRank') out[k] = (k === 'effects' || (v && typeof v === 'object' && !Array.isArray(v) && k !== 'cost')) ? atRank(v, r) : v;
  if (row.perRank && r > 1) for (const [k, inc] of Object.entries(row.perRank)) {
    if (Array.isArray(inc)) out[k] = (out[k] || []).map((x, i) => +(x + (inc[i] || 0) * (r - 1)).toFixed(4));
    else out[k] = +((+out[k] || 0) + inc * (r - 1)).toFixed(4);
  }
  return out;
}
/** Synergies: other skills' ranks that raise this one ({ damage, heal, duration, radius } as multipliers). */
export function synergyOf(skills, ch, id) {
  const m = { damage: 1, heal: 1, duration: 1, radius: 1 };
  for (const [sid, r] of Object.entries(ch?.skills || {})) { const s = skills[sid]; if (s?.kind === 'synergy' && s.synergy?.skill === id && r > 0) m[s.synergy.stat] = (m[s.synergy.stat] || 1) + s.synergy.pctPerRank * r / 100; }
  return m;
}
/** What a skill costs this hero, in which resource. */
export function costOf(skills, resources, ch, sk, rank) {
  const res = resourceOf(ch);
  let [kind, n] = Object.entries(sk.cost || {})[0] || ['mana', 0];
  n = (n || 0) + (sk.costPerRank || 0) * (rank - 1);
  if ((sk.owner === 'wanderer' || sk.owner === 'all') && kind === 'mana' && res !== 'mana') { const m = resources?.wandererSkillsAfterPath?.[ch.path]; kind = res; n *= m?.mult ?? 1; }
  return { kind, n: Math.round(n) };
}
const have = (p, kind) => kind === 'mana' ? p.mana : kind === 'rage' ? p.rage || 0 : p.energy || 0;
const spend = (p, kind, n) => { if (kind === 'mana') p.mana -= n; else if (kind === 'rage') p.rage = (p.rage || 0) - n; else p.energy = (p.energy || 0) - n; };
export function gain(p, kind, n, R) {
  if (kind === 'rage') p.rage = Math.min(R?.rage?.max ?? 100, Math.max(0, (p.rage || 0) + n));
  else if (kind === 'energy') p.energy = Math.min(R?.energy?.max ?? 100, Math.max(0, (p.energy || 0) + n));
  else p.mana = Math.min(p.maxMana, Math.max(0, p.mana + n));
}

/** Use a skill: checks, cost, cooldowns, then a cast / channel / instant. Returns { ok } or { err }. */
export function castSkill(w, p, sk, targetId, point) {
  const ch = p.char, rank = rankOf(ch, sk);
  if (!rank) return { err: "You don't know that." };
  if (sk.kind !== 'active') return { err: 'That one works on its own.' };
  const S = w.content.skills, R = w.content.resources;
  const row = atRank(sk, rank);
  if (p.cast) return { err: 'Already casting.' };
  if ((row.gcd ?? true) && w.time < p.gcdUntil - 1e-6) return { err: 'Not ready yet.' };
  if ((p.cds[sk.id] || 0) > w.time + 1e-6) return { err: 'Not ready yet.' };
  const cost = costOf(S, R, ch, sk, rank);
  if (have(p, cost.kind) < cost.n) return { err: cost.kind === 'rage' ? 'Not enough temper.' : cost.kind === 'energy' ? 'Not enough energy.' : 'Not enough mana.' };
  const reach = row.range > 0 ? row.range : p.weapon.reach;
  let t = null, at = null;
  if (row.target === 'enemy') {
    t = w.foes.get(targetId); if (!t || t.dead) return { err: 'No enemy targeted.' };
    if (gap(p, t) > reach) return { err: 'Too far away.' };
    p.target = t.id;
  } else if (row.target === 'ally') {
    t = w.players.get(targetId); if (!t || (t.dead && !row.effects?.some(e => e.do === 'revive'))) t = p;
    if (dist(p, t) > (row.range || 20)) return { err: 'Too far away.' };
  } else if (row.target === 'ground') {
    const f = w.foes.get(targetId);
    at = point && Number.isFinite(point.x) ? { x: point.x, z: point.z } : f && !f.dead ? { x: f.x, z: f.z } : { x: p.x + Math.sin(p.yaw) * 6, z: p.z + Math.cos(p.yaw) * 6 };
    if (Math.hypot(at.x - p.x, at.z - p.z) > (row.range || 25) + 1) return { err: 'Too far away.' };
  } else t = p;
  spend(p, cost.kind, cost.n);
  if (row.gcd ?? true) p.gcdUntil = w.time + GCD;
  if (row.cd) p.cds[sk.id] = w.time + row.cd * (1 - Math.min(40, p.st.cooldownReduction || 0) / 100);
  if (t && t !== p) p.yaw = Math.atan2(t.x - p.x, t.z - p.z); else if (at) p.yaw = Math.atan2(at.x - p.x, at.z - p.z);
  const castT = (row.cast || 0) / (1 + (p.st.castSpeed || 0) / 100 + fxPct(p, 'castSpeed') / 100);
  if (castT > 0 || row.channel) {
    p.cast = { skill: sk.id, rank, target: t?.id ?? null, at, start: w.time, end: w.time + (castT || row.channel), channel: !castT && row.channel ? row.channel : 0, ticks: 0 };
    w.events.push({ k: 'cast', s: p.id, sk: sk.id, t: castT || row.channel, ch: !castT && !!row.channel });
    return { ok: true };
  }
  run(w, p, sk, rank, t, at);
  if (row.effects?.some(e => e.do === 'weapon') && row.target === 'enemy') p.autoOn = true;
  return { ok: true };
}
/** Each step while casting or channelling (called from fight.stepCasts). */
export function stepSkillCast(w, p) {
  const c = p.cast, sk = w.content.skills[c.skill]; if (!sk) { p.cast = null; return; }
  const t = c.target ? (w.foes.get(c.target) || w.players.get(c.target)) : null;
  if (c.channel) {
    if (w.time >= c.start + c.ticks + 1 - 1e-6) { c.ticks++; run(w, p, sk, c.rank, t, c.at, true); }
    if (w.time >= c.end - 1e-6) p.cast = null;
    return;
  }
  if (w.time < c.end - 1e-6) return;
  p.cast = null;
  if (sk.target === 'enemy' && (!t || t.dead)) return;
  if (sk.target === 'enemy' && gap(p, t) > (sk.range > 0 ? sk.range : p.weapon.reach) + 2) { w.events.push({ k: 'cancel', s: p.id, why: 'range' }); return; }
  run(w, p, sk, c.rank, t, c.at);
}

// ---- effects ----------------------------------------------------------------------------------------------------------
function run(w, p, sk, rank, t, at, tick = false) {
  const row = atRank(sk, rank), syn = synergyOf(w.content.skills, p.char, sk.id);
  p.lastFight = w.time;
  for (const e of row.effects || []) apply(w, p, e, t, at, { sk, syn, rank, tick, row });
  w.events.push({ k: 'skill', s: p.id, sk: sk.id, t: t?.id, x: at?.x, z: at?.z });
}
const HELPFUL = new Set(['heal', 'hot', 'shield', 'buff', 'cleanse', 'revive']);
function apply(w, p, e, t, at, ctx) {
  const L = p.level, sp = (p.st.spellPower || 1) * (1 + fxPct(p, 'damage') / 100), hp = (p.st.healPower || 1);
  const base = b => b ? (b[0] + b[1] * L) : 0;
  switch (e.do) {
    case 'weapon': return t && t.team === 'foe' && !t.dead && weaponBlow(w, p, t, e.mult * ctx.syn.damage, ctx);
    case 'damage': return t && t.team === 'foe' && !t.dead && spellHit(w, p, t, base(e.base) * sp * ctx.syn.damage, e.type || 'storm', ctx);
    case 'bolt': if (t && !t.dead) { w.shots.push({ id: 's' + (w.nextId++), from: p.id, to: t.id, x: p.x, z: p.z, speed: e.speed || 24, type: e.type || 'storm', amount: base(e.base) * sp * ctx.syn.damage * markOf(t), spell: (e.type || 'storm') !== 'physical' }); w.events.push({ k: 'shoot', s: p.id, t: t.id, ty: e.type }); } return;
    case 'area': {
      const helpful = (e.effects || []).every(x => HELPFUL.has(x.do));
      const centre = e.at === 'ground' ? at : e.at === 'target' && t ? t : p;
      if (!centre) return;
      const aim = { x: centre.x, z: centre.z, yaw: t && t !== p ? Math.atan2(t.x - p.x, t.z - p.z) : p.yaw };
      const size = (e.size || 4) * ctx.syn.radius, tele = { shape: e.shape, size, width: e.width, angle: e.angle };
      const from = e.at === 'self' ? p : centre;
      const pool = helpful ? [...w.players.values()].filter(x => !x.dead) : [...w.foes.values()].filter(x => !x.dead);
      const hit = pool.filter(x => inside(e.shape === 'circle' ? 'circle' : e.shape, from, e.shape === 'circle' ? { x: centre.x, z: centre.z } : aim, tele, size, x));
      if (!ctx.tick || ctx.tick && hit.length) w.events.push({ k: 'area', s: p.id, shape: e.shape, x: +centre.x.toFixed(2), z: +centre.z.toFixed(2), r: size, yaw: +aim.yaw.toFixed(2), ang: e.angle, w: e.width, help: helpful || undefined });
      for (const x of hit) for (const inner of e.effects || []) apply(w, p, inner, x, at, { ...ctx, aoe: true });
      return;
    }
    case 'dot': if (t && !t.dead) addFx(w, t, { id: ctx.sk.id + ':dot', kind: 'dot', per: base(e.base) * sp * ctx.syn.damage, type: e.type || 'poison', secs: (e.secs || 5) * ctx.syn.duration, src: p.id }); return;
    case 'heal': return t && !t.dead && healTarget(w, p, t, base(e.base) * hp * ctx.syn.heal);
    case 'hot': if (t && !t.dead) addFx(w, t, { id: ctx.sk.id + ':hot', kind: 'hot', per: base(e.base) * hp * ctx.syn.heal, secs: (e.secs || 8) * ctx.syn.duration, src: p.id }); return;
    case 'shield': if (t && !t.dead) addFx(w, t, { id: ctx.sk.id + ':shield', kind: 'shield', left: base(e.base) * hp * ctx.syn.heal, secs: e.secs || 8, src: p.id }); return;
    case 'buff': { const who = e.who === 'party' ? [...w.players.values()].filter(x => !x.dead && dist(x, p) < 30) : [t && t.team === 'hero' ? t : p]; for (const x of who) addFx(w, x, { id: ctx.sk.id + ':' + e.stat, kind: 'buff', stat: e.stat, pct: e.pct, secs: (e.secs || 10) * ctx.syn.duration, src: p.id }); return; }
    case 'debuff': if (t && !t.dead && t.team === 'foe') { addFx(w, t, { id: ctx.sk.id + ':' + e.kind, kind: e.kind === 'armourDown' || e.kind === 'damageDown' || e.kind === 'weaken' ? 'buff' : e.kind, stat: e.kind === 'armourDown' ? 'armour' : 'damage', pct: e.kind === 'armourDown' || e.kind === 'damageDown' || e.kind === 'weaken' ? -(e.pct || 15) : e.pct, secs: e.secs || 3, src: p.id }); if (e.kind === 'silence') t.silencedUntil = Math.max(t.silencedUntil || 0, w.time + (e.secs || 2)); if (e.kind === 'stun' && t.cast?.interruptible !== false) t.cast = null; aggroOn(w, t, p, 5); } return;
    case 'taunt': if (t && t.team === 'foe' && !t.dead) { tauntTable(t.threat, p.id); t.target = p.id; if (t.state === 'idle' || t.state === 'wander') t.state = 'chase'; w.events.push({ k: 'taunt', s: p.id, t: t.id }); } return;
    case 'interrupt': if (t && t.team === 'foe' && t.cast && t.cast.interruptible !== false) { w.events.push({ k: 'interrupt', s: p.id, t: t.id, sk: t.cast.name }); t.silencedUntil = w.time + (e.lock || 2); t.cast = null; t.nextSwing = w.time + 1; } return;
    case 'dash': { const d = e.dist || 6; let dx = Math.sin(p.yaw), dz = Math.cos(p.yaw); if (e.to === 'back') { dx = -dx; dz = -dz; } let go = d; if (e.to === 'target' && t) { const l = dist(p, t) || 1; dx = (t.x - p.x) / l; dz = (t.z - p.z) / l; go = Math.max(0, Math.min(d, l - (t.r || 0) - p.r - 0.4)); } [p.x, p.z] = resolve(w.area, p.x + dx * go, p.z + dz * go, p.r); w.events.push({ k: 'dash', s: p.id }); return; }
    case 'pull': if (t && t.team === 'foe' && !t.dead) { const l = dist(p, t) || 1, go = Math.min(e.dist || 4, l - (t.r || 0) - p.r - 0.5); if (go > 0) [t.x, t.z] = resolve(w.area, t.x - (t.x - p.x) / l * go, t.z - (t.z - p.z) / l * go, t.r); } return;
    case 'resource': gain(p, e.kind, e.n, w.content.resources); return;
    case 'cleanse': if (t?.fx) t.fx = t.fx.filter(f => !['slow', 'stun', 'dot', 'root', 'silence'].includes(f.kind)); return;
    case 'revive': if (t && t.dead && w.time - (p.lastFight || -99) > 5) { t.dead = false; t.hp = Math.round(t.maxHp * (e.hpPct || 40) / 100); w.events.push({ k: 'revive', s: p.id, t: t.id }); } return;
    case 'mark': if (t && !t.dead) addFx(w, t, { id: ctx.sk.id + ':mark', kind: 'mark', pct: e.pct || 10, secs: e.secs || 8, src: p.id }); return;
    case 'stance': p.fx = (p.fx || []).filter(f => f.kind !== 'stance'); addFx(w, p, { id: 'stance:' + e.id, kind: 'stance', stats: e.stats || {}, secs: 1e6, src: p.id }); return;
  }
}
/** Sum of a buff stat's percent on an actor (buffs, stances, debuffs written as negative). */
export function fxPct(a, stat) { let k = 0; for (const f of a.fx || []) { if (f.kind === 'buff' && f.stat === stat) k += f.pct; if (f.kind === 'stance' && f.stats?.[stat]) k += f.stats[stat]; } return k; }
export const markOf = t => { let k = 1; for (const f of t.fx || []) if (f.kind === 'mark') k *= 1 + f.pct / 100; return k; };
function aggroOn(w, f, p, n) { if (f.team !== 'foe') return; addThreat(f.threat, p.id, n * (1 + (p.st.threat || 0) / 100 + fxPct(p, 'threat') / 100)); if (f.state === 'idle' || f.state === 'wander' || f.state === 'patrol') f.state = 'chase'; }
let hurtFn = null, weaponFn = null;
/** fight.js hands in its damage functions (avoids an import cycle). */
export function wireSkills({ hurt, weaponHit }) { hurtFn = hurt; weaponFn = weaponHit; }
function weaponBlow(w, p, t, mult, ctx) { weaponFn(w, p, t, mult * (1 + fxPct(p, 'damage') / 100) * markOf(t), { threat: ctx.row.threat ?? 1 }); }
function spellHit(w, p, t, amount, type, ctx) {
  const r = resolveHit({ ...p, crit: p.crit + fxPct(p, 'crit') }, armourAfter(t), { amount: amount * markOf(t), type, spell: type !== 'physical' }, w.rng);
  hurtFn(w, p, t, r, type, (ctx.row.threat ?? 1) * (1 + (p.st.threat || 0) / 100));
}
export const armourAfter = t => { const k = fxPct(t, 'armour'); return k ? { ...t, armour: Math.max(0, t.armour * (1 + k / 100)) } : t; };
function healTarget(w, p, t, n) {
  n *= 1 + fxPct(t, 'healTaken') / 100;
  const before = t.hp; t.hp = Math.min(t.maxHp, t.hp + n); const done = Math.round(t.hp - before);
  w.events.push({ k: 'heal', s: p.id, t: t.id, n: done });
  for (const f of w.foes.values()) if (!f.dead && f.threat.has(t.id)) addThreat(f.threat, p.id, done * THREAT.healing);
}

/** Path pick at level 3 (ruling 2/29): grants the starters at rank 1. */
export function pickPath(w, p, path) {
  const P = w.content.paths?.[path]; if (!P) return { err: 'No such Path.' };
  const ch = p.char; if (ch.path) return { err: 'You already walk a Path.' };
  if (ch.level < 3) return { err: 'Choose a Path at level 3.' };
  const skills = { ...(ch.skills || {}) }; for (const id of P.starter || []) skills[id] = Math.max(1, skills[id] || 0);
  p.char = { ...ch, path, skills, bar: defaultBar(w.content.skills, { ...ch, path, skills }) };
  return { ok: true };
}
/** Spend a skill point (ruling 10): level gate, prerequisites, max rank. */
export function learn(w, p, id) {
  const sk = w.content.skills[id], ch = p.char;
  if (!sk || sk.owner === 'all') return { err: 'No such skill.' };
  if (sk.owner !== 'wanderer' && sk.owner !== ch.path && sk.owner !== ch.spec) return { err: 'That belongs to another Path.' };
  if ((ch.skillPoints || 0) < 1) return { err: 'No skill points left.' };
  const now = ch.skills?.[id] || (sk.owner === 'wanderer' ? 1 : 0);
  if (now >= (sk.maxRank || 1)) return { err: 'Already at its best.' };
  if (ch.level < (sk.reqLevel || 1)) return { err: `Needs level ${sk.reqLevel}.` };
  for (const pre of sk.prereq || []) if (!(ch.skills?.[pre] > 0)) return { err: `Learn ${w.content.skills[pre]?.name || pre} first.` };
  const skills = { ...(ch.skills || {}), [id]: now + 1 };
  let bar = ch.bar || []; if (sk.kind === 'active' && !bar.includes(id) && bar.filter(Boolean).length < 6) bar = [...bar.filter(Boolean), id];
  p.char = { ...ch, skills, skillPoints: ch.skillPoints - 1, bar };
  return { ok: true };
}
/** The action bar (6 slots): set slot i to a known active skill (or empty). */
export function setBar(w, p, i, id) {
  if (!(i >= 0 && i < 6)) return { err: 'No such slot.' };
  const sk = id ? w.content.skills[id] : null;
  if (id && (!sk || sk.kind !== 'active' || !rankOf(p.char, sk))) return { err: "You don't know that." };
  const bar = [...(p.char.bar || [])]; while (bar.length < 6) bar.push(null);
  const j = bar.indexOf(id); if (id && j >= 0) bar[j] = bar[i];
  bar[i] = id || null; p.char = { ...p.char, bar };
  return { ok: true };
}
export function defaultBar(skills, ch) {
  const known = Object.values(skills).filter(s => s.kind === 'active' && rankOf(ch, s) > 0 && s.owner !== 'all');
  known.sort((a, b) => (a.owner === 'wanderer') - (b.owner === 'wanderer') || (a.reqLevel || 1) - (b.reqLevel || 1));
  const bar = known.slice(0, 6).map(s => s.id); while (bar.length < 6) bar.push(null);
  return bar;
}
