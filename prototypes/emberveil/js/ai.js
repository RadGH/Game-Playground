// Combat AI (E42): one decision layer for heroes and enemies.
//
// The original game (~/claude/emberveil) chose actions with chains of if/else rules spread over
// _aiTargeting.js, combatEnemyAI.js, CombatScreen.js and simulator.js (every rule, with its line
// number, is listed in research/ai-rules.md). Here each option a unit has — every usable skill aimed
// at every sensible target, and a basic attack at every foe — gets a score in health points:
//
//   damage       what will really land: hit chance, armour, block, overkill thrown away
//   finishing    a kill is worth the target's output for a couple of rounds
//   focus        healers, casters, a boss's adds, a spell being channelled count for more
//   healing      only what lands (no overheal), scaled by how urgent it is and whom it saves
//   buffs        the damage they add or prevent over the next rounds, worth more early
//   statuses     the share of the target's output they take away
//   mana         a skill loses score for the share of the mana bar it costs; healers keep a heal back
//
// The highest score wins and carries a short reason ("heals Corvin (32% health)") that combat.js
// writes onto the event, so the log can say why. The rules are the original's; the numbers are the
// knobs in data/ai.json.
//
// Pure: decideHero()/decideEnemy() read the fight and return a plan; combat.js carries it out.
// Nothing here rolls the fight's dice (skill hooks that roll are read at their average), so asking
// for a decision never changes how a fight turns out.
import { HEALER_CLASSES, mergeSkill } from './rules.js';
import { skillFx, skillMult, skillSum, traitSum, traitMult, statusDef, normalizeStatus, isUndead, isDemon } from './effects.js';

// ---------------------------------------------------------------------------------------------
// Knobs. DEFAULT_AI is the same as data/ai.json without its _doc notes (tests/ai.test.js checks);
// the JSON is loaded over it when this module loads, so the JSON is the file to edit.
export const DEFAULT_AI = {
  schema: 1,
  roles: {
    tank: ['warrior', 'knight', 'runesmith', 'dragon_knight', 'paladin'],
    healer: ['cleric', 'druid', 'priest', 'oracle', 'paladin', 'bard', 'shaman'],
    weight: { tank: 1.25, healer: 1.35, self: 1.1, companion: 0.7, default: 1 },
  },
  heal: { threshold: 0.65, emergency: 0.35, never: 0.85, selfThreshold: 0.45, woundedMult: 1.6, emergencyMult: 4, maxOverheal: 0.5, overhealPenalty: 0.5, recentlyHitMult: 1.25, group: { minHurt: 3, threshold: 0.6, bonus: 1.5 } },
  revive: { mult: 3, rounds: 2 },
  cleanse: { danger: { stun: 1, freeze: 1, sleep: 1, confused: 0.5, silence: 0.6, disarm: 0.5, blind: 0.5, curse: 0.3, weaken: 0.3, marked: 0.3, dazed: 0.25, slow: 0.15, root: 0.1, sunder: 0.1 } },
  focus: { killRounds: 2, lowHealth: 0.5, sleepingMult: 0.1, thornsSelfHp: 0.35, thornsMult: 0.6, threat: { healer: 1.5, caster: 1.25, windUp: 1.4, champion: 1.2, named: 1.3, bossWithAdds: 0.75, marked: 1.15 }, interruptBonus: 1 },
  aoe: { minTargets: 2, minGain: 1.1 },
  taunt: { squishyHp: 0.6, minSelfHp: 0.35, recentRounds: 1, weight: 1.5 },
  buffs: { horizon: 3, earlyRounds: 2, earlyMult: 1.4, bigFightMult: 1.25, nearlyWonRounds: 1.5, nearlyWonMult: 0.25, braceMult: 1.5, unknownValue: 0.25 },
  statuses: { skip: { stun: 1, freeze: 1, sleep: 0.9, confused: 0.5 }, share: { blind: 0.5, dazed: 0.25, disarm: 0.5, slow: 0.1, root: 0.05, silence: 0.6 }, sunderPerPoint: 0.02, sleepWithDamage: 0.15, bossCc: 0.5 },
  mana: { healerReserveCasts: 1, costWeight: 0.5, lowManaShare: 0.3, manaValue: 0.5 },
  cooldown: { big: 5, bigCostShare: 0.45, saveMult: 0.6 },
  enemy: { healThreshold: 0.6, focusAttacks: false, windUpMult: 0.8, minSpellValue: 1 },
};
const clone = o => JSON.parse(JSON.stringify(o));
/** The live knobs every decision reads. */
export const AI = clone(DEFAULT_AI);
/** A copy of a knob object with every `_doc` note removed. */
export function stripDocs(o) {
  if (Array.isArray(o)) return o.map(stripDocs);
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) if (k !== '_doc') r[k] = stripDocs(v); return r; }
  return o;
}
/** Merge knobs (the shape of data/ai.json) over the current ones. Safe to call more than once. */
export function applyAi(json) {
  const merge = (dst, src) => { for (const [k, v] of Object.entries(src)) { if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) merge(dst[k], v); else dst[k] = clone(v); } };
  merge(AI, stripDocs(json || {})); return AI;
}
/** Back to DEFAULT_AI (tests use this before overriding a knob). */
export function resetAi() { for (const k of Object.keys(AI)) delete AI[k]; Object.assign(AI, clone(DEFAULT_AI)); return AI; }
/** Where the knobs came from: `loaded` is true once data/ai.json was read. */
export const AI_SOURCE = { loaded: false, error: null };
async function loadAiJson() {
  try {
    const url = new URL('../data/ai.json', import.meta.url);
    if (url.protocol === 'file:') { const fs = await import('node:fs'); return JSON.parse(fs.readFileSync(url, 'utf8')); }
    const r = await fetch(url); return r.ok ? await r.json() : null;
  } catch (err) { AI_SOURCE.error = String(err); return null; }
}
{ const json = await loadAiJson(); if (json) { applyAi(json); AI_SOURCE.loaded = true; } }

// ---------------------------------------------------------------------------------------------
// Small helpers
const DOTS = ['burn', 'poison', 'bleed', 'holy_burn'];
const CC = ['stun', 'freeze', 'sleep', 'confused', 'dazed', 'blind', 'slow', 'marked', 'sunder', 'curse', 'silence', 'disarm', 'root', 'weaken'];
/** Area shapes: these spread over several enemies, so they must earn their mana against a single target. */
const AREA = new Set(['all', 'row', 'row2', 'pierce_row', 'group', 'adjacent', 'adjacent2', 'group2']);
const clamp01 = v => Math.max(0, Math.min(1, v));
const aliveOf = list => (list || []).filter(x => x.alive);
const share = u => (u && u.maxHp ? clamp01(Math.max(0, u.hp) / u.maxHp) : 1);
const nm = u => u?.short || u?.name || 'someone';
const hpText = u => `${Math.round(share(u) * 100)}% health`;
const barrierOf = u => (u.statuses || []).reduce((n, s) => n + (s.type === 'barrier' ? Math.max(0, s.power || 0) : 0), 0);
/** Health plus shield: what has to come off before the unit falls. */
const ehp = u => Math.max(0, u.hp) + barrierOf(u);
const falloffFor = n => (n <= 1.2 ? 1 : n < 2.5 ? 0.8 : 0.6);   // combat.js: 1 target ×1, 2 ×0.8, 3+ ×0.6
/** A view of the fight whose dice always land on the average, for skill hooks that roll. */
function calm(C) { if (!C._calmView) C._calmView = Object.create(C, { rng: { value: () => 0.5 } }); return C._calmView; }
const STATUS_VERB = { stun: 'stuns', freeze: 'freezes', sleep: 'puts to sleep', confused: 'confuses', blind: 'blinds', dazed: 'dazes', disarm: 'disarms', silence: 'silences', curse: 'curses', weaken: 'weakens', marked: 'marks', sunder: 'sunders', slow: 'slows', root: 'roots', burn: 'sets alight', poison: 'poisons', bleed: 'bleeds', holy_burn: 'burns' };
const verbOn = (type, t) => (type === 'sleep' ? `puts ${nm(t)} to sleep` : `${STATUS_VERB[type] || 'afflicts'} ${nm(t)}`);

function makeCtx(C, u) {
  const own = u.isEnemy ? C.enemies : C.heroes, other = u.isEnemy ? C.heroes : C.enemies;
  return { C, u, allies: own, foes: other, aliveA: aliveOf(own), aliveF: aliveOf(other), cache: new Map() };
}

// ---------------------------------------------------------------------------------------------
// Reading the fight

/** Tanks: the tank classes in ai.json, or anyone taunting right now. */
export function isTank(u) { return !!u && (u.taunting > 0 || (!u.isEnemy && AI.roles.tank.includes(u.class))); }
/** Healers: healer classes, an enemy with the healer role, or an enemy that knows a healing spell. */
export function isHealerUnit(C, u) {
  if (!u) return false;
  if (u.isEnemy) return u.role === 'healer' || (u.spellList || []).some(id => { const sp = C.ctx?.spells?.[id]; return !!sp && (!!sp.effect?.heal || sp.target === 'ally_lowest_hp'); });
  return HEALER_CLASSES.includes(u.class) || AI.roles.healer.includes(u.class);
}
/** Casters: heroes swinging a magic weapon, enemies that cast a good part of the time. */
export function isCaster(C, u) { return u?.isEnemy ? (u.spellChance || 0) >= 0.35 && (u.spellList || []).length > 0 : u?.derived?.cat === 'magic'; }
function roleWeight(C, t, viewer) {
  const W = AI.roles.weight; let w = t.isCompanion ? W.companion : W.default;
  if (isTank(t)) w = Math.max(w, W.tank);
  if (isHealerUnit(C, t)) w = Math.max(w, W.healer);
  if (t === viewer) w = Math.max(w, W.self);
  return w;
}

/**
 * Damage a unit puts out in a round, before the target's armour. For heroes: weapon damage with
 * crits, buffs and attack speed. For enemies: their swing, their spells at their spell chance, and
 * any extra actions. `evenIfDown` measures a fallen ally (for revives).
 */
export function outputOf(C, u, evenIfDown = false) {
  if (!u || (!u.alive && !evenIfDown)) return 0;
  let per;
  if (u.isEnemy) {
    const base = ((u.dmg?.[0] || 0) + (u.dmg?.[1] || 0)) / 2;
    const spells = (u.spellList || []).map(id => C.ctx?.spells?.[id]).filter(Boolean);
    const heroes = Math.max(1, aliveOf(C.heroes).length);
    const spellAvg = spells.length ? spells.reduce((s, sp) => s + (sp.effect?.damage || 0) * C.spellScale(u) * (sp.target === 'aoe' ? heroes : 1), 0) / spells.length : 0;
    const sc = Math.min(1, u.spellChance || 0);
    per = base * (1 - sc) + Math.max(spellAvg, base * 0.5) * sc;
    per *= C.statusMult(u, 'dealtMult') * (1 + (u.extraActionsEachRound || 0));
  } else {
    const d = u.derived; if (!d) return 0;
    const avg = ((d.dmgMin || 1) + (d.dmgMax || 1)) / 2;
    const crit = 1 + clamp01((d.critChance ?? 5) / 100) * ((d.critDamage ?? 1.5) - 1);
    per = avg * crit * C.dmgBuffMult(u) * (1 + (({ fast: 1, very_fast: 2 })[d.attackSpeed] || 0) + (u.extraActionsEachRound || 0));
  }
  return Math.max(0, per);
}
function out(ctx, u) { let v = ctx.cache.get(u); if (v === undefined) { v = outputOf(ctx.C, u); ctx.cache.set(u, v); } return v; }

/**
 * Damage a unit can expect to take next round. Enemies swing in formation (taunters, then
 * companions, then the front of the party), so the front takes most of it; anyone hit last round
 * expects at least that much again.
 */
function incomingOn(ctx, t) {
  const { C } = ctx;
  const mates = aliveOf(t.isEnemy ? C.enemies : C.heroes), attackers = aliveOf(t.isEnemy ? C.heroes : C.enemies);
  if (!attackers.length || !mates.length) return 0;
  const total = attackers.reduce((s, a) => s + out(ctx, a), 0);
  let part;
  const drawing = mates.filter(a => a.taunting > 0 || C.has(a, 'taunt_totem'));
  if (drawing.length) part = drawing.includes(t) ? 0.8 / drawing.length : 0.2 / mates.length;
  else if (t.stealth > 0) part = 0.05;
  else if (!t.isEnemy) {
    const visible = mates.filter(a => !(a.stealth > 0)); const front = visible.find(a => a.isCompanion) || visible[0];
    part = visible.length <= 1 ? 1 : front === t ? 0.6 : 0.4 / (visible.length - 1);
  } else part = 1 / mates.length;
  let est = total * part;
  if (t._lastHit && t._lastHit.round >= C.round_ - 1) est = Math.max(est, t._lastHit.amount || 0);
  return est;
}

/** Share of a hit that gets through: block, armour or magic resist, damage reduction, statuses, traits. */
function mitigation(C, t, { magic = false, trueDmg = false, armorPen = 0, dtype = null, src = null } = {}) {
  let m = 1;
  if (!trueDmg && !magic) { const bc = Math.min(0.95, (t.derived?.blockChance ?? t.blockChance ?? 0) + C.statusSum(t, 'blockBonus')); if (bc > 0) m *= 1 - bc * (t.isEnemy ? 0.5 : 0.3); }
  if (!trueDmg) {
    let ar = magic ? Math.max(0, (t.derived?.magicResist ?? t.magicResist ?? 0) - (t._mrDebuff || 0)) : (t.derived?.armor ?? t.armor ?? 0);
    ar = Math.max(0, ar * (1 - (t._tempArmorPen || 0)) * (1 - Math.min(1, armorPen)) - C.statusSum(t, 'armorReduce'));
    m *= 1 - Math.min(0.95, ar / (ar + 100));
  }
  if (t.derived?.resistAll) m *= 1 - t.derived.resistAll / 100;
  if (t.dmgReduct) m *= 1 - Math.min(0.9, t.dmgReduct);
  m *= C.statusMult(t, 'takenMult', { dtype, magic });
  if (dtype === 'fire' && t._fireVuln) m *= 1 + t._fireVuln;
  m *= traitMult('dmgIn', C, t, src, { magic, dtype });
  return t.reviveImmune ? 0 : Math.max(0, m);
}

/** How much more a hit on this target is worth, and the word for why. */
function threat(ctx, t) {
  const { C } = ctx; const T = AI.focus.threat; let m = 1, tag = null;
  if (isHealerUnit(C, t)) { m *= T.healer; tag = 'the healer'; } else if (isCaster(C, t)) { m *= T.caster; tag = 'a caster'; }
  if (t._windUp) { m *= T.windUp; tag = tag || `channelling ${t._windUp.spell?.name || 'a spell'}`; }
  if (t.champion) m *= T.champion;
  if (t.named) m *= T.named;
  if (t.boss && aliveOf(t.isEnemy ? C.enemies : C.heroes).some(o => o !== t)) m *= T.bossWithAdds;
  if (C.has(t, 'marked')) { m *= T.marked; tag = tag || 'marked'; }
  return { m, tag };
}
/** Damage a channelled spell would do if it went off. */
function spellThreat(ctx, e, sp) { const ef = sp?.effect || {}; return (ef.damage || 0) * ctx.C.spellScale(e) * (sp?.target === 'aoe' ? Math.max(1, ctx.aliveA.length) : 1); }

/** Score of `dealt` expected damage landing on `t`: capped at what it has left, plus kills, interrupts, focus. */
function targetValue(ctx, t, dealt, { overflow = false } = {}) {
  const { C, u } = ctx; const F = AI.focus;
  const room = ehp(t); const landed = overflow ? dealt : Math.min(dealt, room);
  const th = threat(ctx, t);
  let v = landed * th.m + F.lowHealth * (1 - share(t)) * landed;
  let killed = false, interrupted = false;
  if (room > 0 && dealt >= room) { killed = true; v += out(ctx, t) * F.killRounds * th.m; }
  const w = t._windUp;
  if (w && !killed && w.interruptThreshold && w.taken < w.interruptThreshold && w.taken + landed >= w.interruptThreshold) { interrupted = true; v += spellThreat(ctx, t, w.spell) * F.interruptBonus; }
  if (landed > 0 && C.has(t, 'sleep') && ctx.aliveF.some(o => o !== t && !C.has(o, 'sleep'))) v *= F.sleepingMult;
  if (share(u) < F.thornsSelfHp && ((t.thorns || 0) > 0 || (t.derived?.thorns || 0) > 0 || C.has(t, 'thorns'))) v *= F.thornsMult;
  return { v, landed, killed, interrupted, tag: th.tag, room };
}

/** Who a unit may aim at: taunts first, never something hidden while anything else can be seen. */
function targetPool(ctx) {
  const { C, u } = ctx; let pool = ctx.aliveF;
  const visible = pool.filter(p => !(p.stealth > 0)); if (visible.length) pool = visible;
  if (u.isEnemy) { const totem = pool.find(h => C.has(h, 'taunt_totem')); if (totem) return { list: [totem], forced: true }; }
  if (u.tauntedBy?.alive && ctx.aliveF.includes(u.tauntedBy)) return { list: [u.tauntedBy], forced: true };
  if (u.isEnemy) { const t = pool.filter(h => h.taunting > 0); if (t.length) return { list: t, forced: true }; }
  return { list: pool, forced: false };
}

/** What a status is worth on a target: the share of its output it takes away, or the damage it deals. */
function statusWorth(ctx, t, type, dur, power, { dealsDamage = false } = {}) {
  const { C, u } = ctx; type = normalizeStatus(type);
  if (!t?.alive || t._immune?.[type] || (type === 'stun' && t.stunImmune > 0)) return 0;
  const def = statusDef(type); const S = AI.statuses; dur = Math.max(1, dur || 2);
  const existing = (t.statuses || []).find(s => s.type === type);
  if (existing && !def?.stacks && existing.duration >= dur && (existing.power || 0) >= (power || 0)) return 0;   // already on it
  const o = out(ctx, t); let v = 0;
  if (S.skip[type] != null) { v = o * S.skip[type] * dur; if (t.boss) v *= S.bossCc; if (type === 'sleep' && dealsDamage) v *= S.sleepWithDamage; }
  else if (type === 'silence') v = o * (t.isEnemy ? Math.min(1, (t.spellChance || 0) * 1.5) : (isCaster(C, t) || isHealerUnit(C, t) ? S.share.silence : 0.1)) * dur;
  else if (S.share[type] != null) v = o * S.share[type] * (type === 'blind' && !t.isEnemy && t.derived?.cat === 'magic' ? 0.5 : 1) * dur;
  else if (type === 'curse' || type === 'weaken') v = o * Math.min(0.9, (power || 20) / 100) * dur;
  else if (type === 'marked' || type === 'sunder') {
    const team = aliveOf(u.isEnemy ? C.enemies : C.heroes).reduce((s, a) => s + out(ctx, a), 0) / Math.max(1, ctx.aliveF.length);
    v = type === 'marked' ? team * (power ? power / 100 : 0.3) * dur : team * (power || 0) * S.sunderPerPoint * dur;
  } else if (def?.dot) v = Math.min(ehp(t), (power || 3) * dur * (def.holy && (isUndead(t) || isDemon(t)) ? 2 : 1));
  if (existing && !def?.stacks) v *= 0.5;   // topping up an existing one is worth less
  return v;
}

/** What removing statuses from an ally is worth (C.cleanse semantics: 'all' = every control effect and damage over time). */
function cleanseWorth(ctx, t, what) {
  if (!what || !t?.alive) return { value: 0, names: [] };
  const all = what === 'all' || what === 1 || what === true; const list = all ? null : (Array.isArray(what) ? what : [what]);
  let value = 0; const names = []; const o = out(ctx, t);
  for (const s of t.statuses || []) {
    const isDot = !!statusDef(s.type)?.dot;
    if (!(all ? CC.includes(s.type) || isDot : list.includes(s.type))) continue;
    const add = isDot ? (s.power || 3) * Math.max(1, s.duration) : o * (AI.cleanse.danger[s.type] || 0) * Math.max(1, s.duration);
    if (add > 0) { value += add; names.push(s.type); }
  }
  return { value, names };
}

/** Healing that would land on `t`, scored by urgency and whom it saves. 0 when they do not need it. */
function healWorth(ctx, t, amount, { self = false, group = false, limit = null } = {}) {
  const { C, u } = ctx; const H = AI.heal;
  if (!t?.alive || !(amount > 0)) return 0;
  const f = share(t); if (f >= H.never) return 0;
  const lim = limit ?? (self ? H.selfThreshold : isHealerUnit(C, u) ? H.threshold : H.emergency);
  if (f >= lim) return 0;
  const amt = amount * (1 - Math.min(0.9, t._healReduce || 0));
  const landed = Math.min(amt, Math.max(0, t.maxHp - t.hp)); const over = amt - landed;
  if (!group && over / amt > H.maxOverheal && f >= H.emergency) return 0;   // would mostly be wasted
  const urgency = f <= H.emergency ? H.emergencyMult : H.woundedMult + (H.emergencyMult - H.woundedMult) * clamp01((lim - f) / Math.max(0.01, lim - H.emergency));
  let v = (landed - H.overhealPenalty * over) * urgency * roleWeight(C, t, u);
  if (t._lastHit && t._lastHit.round >= C.round_ - 1) v *= H.recentlyHitMult;
  return Math.max(0, v);
}

function nearlyWon(ctx) {
  const foes = ctx.aliveF.reduce((s, f) => s + ehp(f), 0), team = ctx.aliveA.reduce((s, a) => s + out(ctx, a), 0);
  return team > 0 && foes < team * AI.buffs.nearlyWonRounds;
}
function manaFactor(u, cost) {
  if (!(cost > 0) || !u.maxMp) return 1;
  const scarce = 1 + (1 - clamp01((u.mp || 0) / u.maxMp));
  return Math.max(0.05, 1 - AI.mana.costWeight * (cost / u.maxMp) * scarce);
}
/** Mana a healer never spends on anything but a heal: its cheapest heal, cached for the fight. */
export function healReserve(C, h) {
  if (h._healReserve !== undefined && h._healReserve !== null) return h._healReserve;
  let min = Infinity; const S = C.ctx?.skills || {};
  for (const id of h.skills || []) { const raw = S[id]; if (!raw || raw.type !== 'heal' || raw.target === 'self') continue; const m = mergeSkill({ id, ...raw }, h); min = Math.min(min, Math.max(0, (m.mpCost || 0) - (h.derived?.mpCostReduce || 0))); }
  return (h._healReserve = isFinite(min) ? min * AI.mana.healerReserveCasts : 0);
}

// ---------------------------------------------------------------------------------------------
// Plans for each kind of action

function attackPlans(ctx) {
  const { C, u } = ctx; const pool = targetPool(ctx); const d = u.derived; const plans = [];
  const raw = (u.isEnemy ? ((u.dmg?.[0] || 0) + (u.dmg?.[1] || 0)) / 2 : ((d?.dmgMin || 1) + (d?.dmgMax || 1)) / 2) * C.dmgBuffMult(u);
  const magic = !u.isEnemy && d?.cat === 'magic';
  for (const t of pool.list) {
    const cc = clamp01(((d?.critChance ?? 5) + traitSum('critBonus', C, u, t)) / 100);
    const dealt = raw * (1 + cc * ((d?.critDamage ?? 1.5) - 1)) * (C.hitChance(u, t) / 100) * mitigation(C, t, { magic, armorPen: d?.armorPen || 0, src: u });
    const r = targetValue(ctx, t, dealt);
    const rule = pool.forced ? 'taunted' : r.killed ? 'finish' : r.interrupted ? 'interrupt' : r.tag ? 'focus' : 'attack';
    const reason = pool.forced ? `attacks ${nm(t)} (taunted)` : r.killed ? `finishes ${nm(t)} (${Math.round(r.room)} health left)` : r.interrupted ? `interrupts ${nm(t)}'s ${t._windUp.spell?.name || 'spell'}` : r.tag ? `focuses ${nm(t)}, ${r.tag}` : `attacks ${nm(t)}`;
    plans.push({ kind: 'attack', target: t, value: Math.max(0.001, r.v), rule, reason });
  }
  return plans;
}

/** Every way a damage skill can be aimed: one entry per sensible primary target (or one for "everyone"). */
function shapesFor(C, s, primaries, alive) {
  const aoe = s.type === 'zone' ? 'all' : (s.aoe || 'single'); const hits = C.hitsOf(s); const out = [];
  const mk = (primary, ts, n = hits) => out.push({ primary, list: ts.map(t => ({ t, n })), distinct: ts.length });
  if (['all', 'row', 'row2', 'pierce_row'].includes(aoe)) mk(primaries[0], alive);
  else if (aoe === 'group') { const seen = new Set(); for (const p of primaries) { if (seen.has(p.group)) continue; seen.add(p.group); mk(p, alive.filter(e => e.group === p.group)); } }
  else if (aoe === 'adjacent' || aoe === 'adjacent2' || aoe === 'group2') { const k = C.shotsOf(s, aoe === 'adjacent' ? 2 : 3); for (const p of primaries) mk(p, [p, ...alive.filter(e => e !== p && e.group === p.group)].slice(0, k)); }
  else if (aoe === 'chain' || aoe === 'chain3') { const k = C.shotsOf(s, 3); for (const p of primaries) mk(p, [p, ...alive.filter(e => e !== p)].slice(0, k)); }
  else if (aoe === 'random3' || aoe === 'random4') { const k = C.shotsOf(s, aoe === 'random3' ? 3 : 4); const n = alive.length; out.push({ primary: primaries[0], list: alive.map(t => ({ t, n: hits * k / n })), distinct: n * (1 - Math.pow(1 - 1 / n, k)) }); }
  else if (aoe === 'multi3' || aoe === 'multi4') { const k = C.shotsOf(s, aoe === 'multi3' ? 3 : 4); for (const p of primaries) out.push({ primary: p, list: [{ t: p, n: hits * k }], distinct: 1 }); }
  else for (const p of primaries) mk(p, [p]);
  return out;
}

function planDamage(ctx, s) {
  const { C, u } = ctx; const eff = s.effect || {}; const pool = targetPool(ctx);
  if (!pool.list.length || !u.derived) return null;
  const fx = skillFx(s); const magic = s.type === 'magic' || s.damageCategory === 'magic'; const dtype = C.dtypeOf(s);
  const consumes = eff.consumesFlairStacks ?? s.consumesFlairStacks; const stacks = consumes ? (u.flair || 0) : 0;
  const base0 = C.skillDamage(u, s) * C.dmgBuffMult(u) * (stacks ? Math.max(1, stacks) * (eff.stackDmgMult || 1) : 1);
  const shape = s.type === 'zone' ? 'all' : (s.aoe || 'single');
  let best = null;
  for (const sh of shapesFor(C, s, pool.list, ctx.aliveF)) {
    const falloff = falloffFor(sh.distinct); const targets = sh.list.map(x => x.t);
    let dmgV = 0, statusV = 0, healV = 0, reach = 0; const kills = [], interrupts = []; let topStatus = null, topTag = null;
    sh.list.forEach(({ t, n }, i) => {
      if (!t.alive) return; reach++;
      const c = { C: calm(C), caster: u, skill: s, eff, foes: ctx.foes, allies: ctx.allies, magic, dtype, targets, target: t, targetIndex: i, hitIndex: 0, dealt: 0, crit: false };
      let raw = base0 * falloff * skillMult(fx, 'dmgMult', c) + skillSum(fx, 'dmgFlat', c);
      const critP = clamp01(((u.derived.critChance ?? 5) + (eff.critBonus || 0) * 100 + skillSum(fx, 'critBonus', c) + traitSum('critBonus', C, u, t)) / 100);
      raw *= 1 + critP * ((u.derived.critDamage ?? 1.5) - 1);
      if (eff.executeThreshold && share(t) <= eff.executeThreshold) raw *= eff.executeMult || 3;
      const vsD = eff.bonusVsDemon ?? s.bonusVsDemon, vsU = eff.bonusVsUndead ?? s.bonusVsUndead;
      if (vsD && isDemon(t)) raw *= 1 + vsD; if (vsU && isUndead(t)) raw *= 1 + vsU;
      if (eff.damageVsStatus) for (const [st, b] of Object.entries(eff.damageVsStatus)) if (C.has(t, st)) raw *= 1 + b;
      const penRaw = eff.armorPen ?? s.armorPen ?? 0; const pen = (penRaw > 1 ? 0 : penRaw) + skillSum(fx, 'armorPen', c);
      const hitP = eff.neverMiss || s.type === 'magic' ? 1 : C.hitChance(u, t) / 100;
      let hitsN = n; if (hitsN >= 1 && ((t.statuses || []).some(x => statusDef(x.type)?.absorbNext) || (!magic && t.parry > 0))) hitsN -= 1;   // the first one is turned aside
      const dealt = Math.max(0, raw) * hitP * mitigation(C, t, { magic, armorPen: pen, dtype, src: u }) * hitsN;
      const r = targetValue(ctx, t, dealt, { overflow: s.aoe === 'single_overflow' });
      dmgV += r.v; if (r.killed) kills.push([t, r.room]); if (r.interrupted) interrupts.push(t); if (r.tag && !topTag) topTag = [t, r.tag];
      if (!r.killed) {
        const worth = (type, dur, pow, chance = 1) => { const w = clamp01(chance) * statusWorth(ctx, t, type, dur, pow, { dealsDamage: dealt > 0 }); statusV += w; if (w > 0 && (!topStatus || w > topStatus.w)) topStatus = { w, type: normalizeStatus(type), t }; };
        for (const se of s.statusEffects || eff.statusEffects || []) worth(se.type, se.duration ?? 2, se.power ?? (DOTS.includes(se.type) ? Math.max(3, Math.floor((u.derived.INT || 8) * 0.15)) : 4), se.chance ?? 0.5);
        if (eff.armorReduce) worth('sunder', eff.armorReduceDuration || 3, eff.armorReduce);
        if (eff.actionsLost) worth('stun', 1, 0);
        if (eff.stunChance) worth('stun', 1, 0, eff.stunChance);
        if (eff.bleedChance) worth('bleed', 2, 5, eff.bleedChance);
        if (eff.bleed) worth('bleed', eff.bleed.duration || 2, eff.bleed.power || 5);
        if (eff.slow) worth('slow', eff.slow.duration || 2, 0);
      }
      const ls = (eff.lifesteal || 0) + (s.lifesteal || 0); if (ls && r.landed > 0) healV += Math.min(r.landed * ls, Math.max(0, u.maxHp - u.hp)) * 0.5;
    });
    if (s.type === 'zone' && s.healMult) { const amt = C.skillHeal(u, s); for (const a of ctx.aliveA) healV += Math.min(amt, Math.max(0, a.maxHp - a.hp)) * 0.5; }
    const value = dmgV + statusV + healV;
    if (!best || value > best.value) best = { sh, value, dmgV, statusV, kills, interrupts, reach, topStatus, topTag };
  }
  if (!best || !(best.value > 0)) return null;
  const p = best.sh.primary; const area = AREA.has(shape);
  let rule, reason;
  if (best.interrupts.length) { const t = best.interrupts[0]; rule = 'interrupt'; reason = `interrupts ${nm(t)}'s ${t._windUp.spell?.name || 'spell'}`; }
  else if (area && best.reach >= 2) { rule = 'area'; reason = `hits ${best.reach} enemies${best.kills.length ? `, finishing ${best.kills.length}` : ''}`; }
  else if (best.kills.length) { const [t, left] = best.kills[0]; rule = 'finish'; reason = `finishes ${nm(t)} (${Math.round(left)} health left)`; }
  else if (best.topStatus && best.statusV > best.dmgV) { const t = best.topStatus.t; const biggest = ctx.aliveF.every(o => out(ctx, o) <= out(ctx, t)); rule = 'control'; reason = `${verbOn(best.topStatus.type, t)}${biggest && ctx.aliveF.length > 1 ? ', the biggest threat' : ''}`; }
  else if (best.topTag) { rule = 'focus'; reason = `focuses ${nm(best.topTag[0])}, ${best.topTag[1]}`; }
  else { rule = 'damage'; reason = best.reach > 1 ? `hits ${best.reach} enemies` : `hits ${nm(p)}`; }
  return { kind: 'skill', skill: s, target: p, value: best.value, area, reach: best.reach, damage: best.dmgV > 0, rule, reason };
}

function planHeal(ctx, s) {
  const { C, u } = ctx; const eff = s.effect || {}; const H = AI.heal;
  const amount = C.skillHeal(u, s);
  const regen = (eff.hpRegen || eff.regenRounds) ? (eff.hpRegen || 3) * (eff.regenMult || 1) * (eff.regenRounds || eff.regenDur || 3) : 0;
  const extras = (t, healed) => {
    let v = 0; const cl = cleanseWorth(ctx, t, eff.cleanse); v += cl.value;
    if (regen && healed > 0) v += Math.min(regen, Math.max(0, t.maxHp - t.hp - amount)) * 0.7;
    return { v, cl };
  };
  const manaBack = eff.mpRestore && u.maxMp && u.mp / u.maxMp < AI.mana.lowManaShare ? Math.min(eff.mpRestore, u.maxMp - u.mp) * AI.mana.manaValue * out(ctx, u) / 10 : 0;
  if (s.target === 'party') {
    const ts = ctx.aliveA.filter(a => !(eff.excludeSelf && a === u)); let v = 0, hurt = 0;
    for (const t of ts) { const w = healWorth(ctx, t, amount, { group: true }); v += w + extras(t, w).v; if (share(t) < H.group.threshold) hurt++; }
    if (hurt >= H.group.minHurt) v *= H.group.bonus;
    v += manaBack;
    return v > 0 ? { kind: 'skill', skill: s, value: v, rule: 'group-heal', reason: `heals the party (${hurt} hurt)` } : null;
  }
  const pool = s.target === 'self' ? [u] : ctx.aliveA.filter(a => !(eff.excludeSelf && a === u));
  let best = null;
  for (const t of pool) {
    const w = healWorth(ctx, t, amount, { self: s.target === 'self' }); const ex = extras(t, w); const v = w + ex.v;
    if (v > 0 && (!best || v > best.v)) best = { t, v, w, cl: ex.cl };
  }
  if (!best && manaBack > 0 && s.target === 'self') return { kind: 'skill', skill: s, ally: u, value: manaBack, rule: 'mana', reason: `gathers mana (${Math.round(100 * u.mp / u.maxMp)}% left)` };
  if (!best) return null;
  const cleansing = best.cl.value > best.w;
  return { kind: 'skill', skill: s, ally: best.t, value: best.v + manaBack, rule: cleansing ? 'cleanse' : 'heal', reason: cleansing ? `cleanses ${nm(best.t)} (${best.cl.names.join(', ')})` : `heals ${best.t === u ? 'self' : nm(best.t)} (${hpText(best.t)})` };
}

function planRevive(ctx, s) {
  const { C, u } = ctx; const eff = s.effect || {};
  const fallen = ctx.allies.filter(a => !a.alive); if (!fallen.length) return null;
  const worth = t => t.maxHp * (eff.reviveHp || 0.25) * AI.revive.mult * roleWeight(C, t, u) + outputOf(C, t, true) * AI.revive.rounds;
  if (eff.reviveAll) { const v = fallen.reduce((n, t) => n + worth(t), 0); return { kind: 'skill', skill: s, ally: fallen[0], value: v, rule: 'revive', reason: fallen.length > 1 ? `raises the fallen (${fallen.length})` : `raises ${nm(fallen[0])}` }; }
  const best = fallen.map(t => ({ t, v: worth(t) })).sort((a, b) => b.v - a.v)[0];
  return { kind: 'skill', skill: s, ally: best.t, value: best.v, rule: 'revive', reason: `raises ${nm(best.t)}` };
}

/** Who is being hurt that a taunt would protect, and what the taunt is worth. */
function tauntWorth(ctx, dur) {
  const { C, u } = ctx; const T = AI.taunt;
  if (share(u) < T.minSelfHp) return null;
  const since = C.round_ - T.recentRounds;
  const hit = ctx.aliveA.filter(a => a !== u && !isTank(a) && a._lastHit && a._lastHit.round >= since && (isHealerUnit(C, a) || isCaster(C, a) || share(a) < T.squishyHp));
  if (!hit.length) return null;
  const ward = hit.map(a => ({ a, w: roleWeight(C, a, u) * (1.5 - share(a)) })).sort((x, y) => y.w - x.w)[0].a;
  const attackers = [...new Set(hit.map(a => a._lastHit.by).filter(b => b?.alive))];
  const value = hit.reduce((n, a) => n + Math.max(incomingOn(ctx, a), a._lastHit.amount || 0) * roleWeight(C, a, u), 0) * dur * T.weight;
  return { value, ward, attackers };
}

/** Buff keys buffWorth() prices (or that only shape the buff); anything else falls back to buffs.unknownValue. */
const BUFF_KEYS = new Set(['duration', 'rounds', 'excludeSelf', 'targets', 'hits', 'dmgBuff', 'spellDmgBuff', 'critBuff', 'critChance', 'critBonus', 'hitBonus', 'hitBuff', 'extraAction', 'onHitStatus', 'reflect', 'thorns', 'initiative', 'dmgReduct', 'dodgeBuff', 'armorBonus', 'magicResistBonus', 'barrier', 'shield', 'tempHp', 'healPct', 'regenPct', 'mpRegen', 'stealth', 'parryCount', 'cleanse', 'cleanseParty', 'taunt', 'tauntedBy', 'dmgDebuff', 'atkDebuff', 'dodgeDebuff', 'dodgeDebuffDur', 'enemySkipRound', 'enemySkipExtra', 'enemySkipRounds', 'selfDamagePct']);
function buffWorth(ctx, s, t, dur) {
  const { C, u } = ctx; const eff = s.effect || {}; const res = { off: 0, def: 0, active: false, taunt: null };
  if ((t._buffedBy?.[s.id] || 0) > C.round_) { res.active = true; return res; }   // already running
  const o = out(ctx, t), inc = incomingOn(ctx, t);
  if (eff.dmgBuff) res.off += o * eff.dmgBuff * dur;
  if (eff.spellDmgBuff) res.off += (t.derived?.cat === 'magic' ? o : o * 0.3) * eff.spellDmgBuff * dur;
  const crit = (eff.critBuff || 0) + (eff.critChance || 0) * 100 + (eff.critBonus || 0) * 100; if (crit) res.off += o * (crit / 100) * 0.5 * dur;
  if (eff.hitBonus || eff.hitBuff) res.off += o * Math.min(0.3, (eff.hitBonus || eff.hitBuff) / 100) * dur;
  if (eff.extraAction && t !== u) res.off += o * (typeof eff.extraAction === 'number' ? eff.extraAction : 1);
  if (eff.onHitStatus && !t.onHitStatus) res.off += (eff.onHitStatus.power || 6) * (eff.onHitStatus.duration || 3) * 0.5 * dur;
  if (eff.reflect || eff.thorns) res.off += inc * (eff.reflect || eff.thorns) * dur;
  if (eff.initiative) res.off += o * 0.05;
  if (eff.dmgReduct && eff.dmgReduct > (t.dmgReduct || 0)) res.def += inc * (eff.dmgReduct - (t.dmgReduct || 0)) * dur;
  if (eff.dodgeBuff) res.def += inc * Math.min(0.5, eff.dodgeBuff / 100) * dur;
  if (eff.armorBonus) res.def += inc * (eff.armorBonus / (eff.armorBonus + 100)) * dur * 0.5;
  if (eff.magicResistBonus) res.def += inc * (eff.magicResistBonus / (eff.magicResistBonus + 100)) * dur * 0.3;
  const barrier = eff.barrier != null ? (eff.barrier < 5 ? Math.round(eff.barrier * (u.derived?.INT || 10) * 2) : eff.barrier) : eff.shield ? Math.round((eff.shield.conMult || 3) * (u.derived?.CON || 10)) : 0;
  if (barrier) res.def += Math.min(barrier, inc * dur) * (C.has(t, 'barrier') ? 0.3 : 1);
  if (eff.tempHp) res.def += Math.min(eff.tempHp, inc * dur);
  const missing = Math.max(0, t.maxHp - t.hp);
  if (eff.healPct) res.def += Math.min(t.maxHp * eff.healPct, missing);
  if (eff.regenPct) res.def += Math.min(t.maxHp * eff.regenPct * dur, missing) * 0.8;
  if (eff.mpRegen && t.maxMp && t.mp < t.maxMp * 0.5) res.off += Math.min(eff.mpRegen, t.maxMp - t.mp) * AI.mana.manaValue * o / 10;
  if (eff.stealth && t === u && !(u.stealth > 0)) res.def += inc * dur * 0.8;
  if ((eff.parryCount || s.type === 'counter') && !(t.parry > 0)) res.def += inc * 0.5 * (eff.parryCount || 1);
  if (eff.cleanseParty || eff.cleanse) res.def += cleanseWorth(ctx, t, 'all').value;
  if (eff.taunt && t === u && !(u.taunting > 0)) { const tw = tauntWorth(ctx, dur); if (tw) { res.def += tw.value; res.taunt = tw; } }
  return res;
}

function planBuff(ctx, s) {
  const { C, u } = ctx; const eff = s.effect || {}; const B = AI.buffs;
  const dur = Math.min(eff.duration || eff.rounds || 2, B.horizon);
  if (s.target === 'enemy') return planEnemyDebuff(ctx, s, dur);
  let recips, ally = null;
  if (s.target === 'party') recips = ctx.aliveA.slice();
  else if (s.target === 'self' || s.type === 'counter') recips = [u];
  else {
    const pool = ctx.aliveA.filter(a => !(eff.excludeSelf && a === u)); const list = pool.length ? pool : ctx.aliveA;
    const scored = list.map(a => { const w = buffWorth(ctx, s, a, dur); return { a, v: w.off + w.def }; }).sort((x, y) => y.v - x.v);
    recips = scored.slice(0, Math.max(1, eff.targets || 1)).map(x => x.a); ally = recips[0] || null;
  }
  if (eff.excludeSelf && s.target === 'party' && recips.some(t => t !== u)) recips = recips.filter(t => t !== u);
  let off = 0, def = 0, active = 0, taunt = null, defTop = null;
  for (const t of recips) { const w = buffWorth(ctx, s, t, dur); off += w.off; def += w.def; if (w.active) active++; if (w.taunt) taunt = w.taunt; if (w.def > 0 && (!defTop || w.def > defTop.v)) defTop = { t, v: w.def }; }
  if (eff.enemySkipRound) { const rounds = 1 + (eff.enemySkipExtra || 0) + (eff.enemySkipRounds || 0); for (const f of ctx.aliveF) off += (f.stunImmune > 0 ? 0 : out(ctx, f) * rounds * (f.boss ? AI.statuses.bossCc : 1)); }
  if (eff.selfDamagePct) off -= u.maxHp * eff.selfDamagePct * (share(u) < 0.5 ? 2 : 0.5);
  // A key the scorer has no rule for (a talent's odd hook) still counts for a little, so the buff is not left unused forever.
  const unknown = Object.keys(eff).filter(k => !BUFF_KEYS.has(k)).length;
  if (unknown && active < recips.length) off += B.unknownValue * out(ctx, u) * dur * (recips.length - active);
  const bigFight = ctx.aliveF.some(f => f.boss || f.champion || f.named); const brace = ctx.aliveF.find(f => f._windUp);
  const early = C.round_ <= B.earlyRounds;
  let value = off * (early ? B.earlyMult : 1) * (bigFight ? B.bigFightMult : 1) + def * (brace ? B.braceMult : 1) * (bigFight ? B.bigFightMult : 1);
  if (nearlyWon(ctx)) value *= B.nearlyWonMult;
  if (!(value > 0)) return null;
  let rule = 'buff', reason;
  if (taunt && taunt.value >= Math.max(off, def - taunt.value)) { rule = 'taunt'; reason = `taunts to protect ${nm(taunt.ward)}`; }
  else if (eff.enemySkipRound) reason = 'stops the enemy in its tracks';
  else if (s.target === 'party') reason = brace ? `braces the party for ${brace._windUp.spell?.name || 'the spell'}` : early ? 'readies the party before the fight turns' : 'strengthens the party';
  else if (ally && eff.extraAction && off >= def) reason = `hurries ${nm(ally)}`;
  else if (def > off && defTop) reason = defTop.t === u ? (brace ? `braces for ${brace._windUp.spell?.name || 'the spell'}` : 'shields self') : `shields ${nm(defTop.t)} (${hpText(defTop.t)})`;
  else reason = ally && ally !== u ? `strengthens ${nm(ally)}` : 'strengthens self';
  return { kind: 'skill', skill: s, ally, value, rule, reason };
}

function planEnemyDebuff(ctx, s, dur) {
  const { u } = ctx; const eff = s.effect || {}; const pool = targetPool(ctx).list;
  const tw = eff.tauntedBy ? tauntWorth(ctx, dur) : null; let best = null;
  for (const t of pool) {
    if (eff.tauntedBy && t.tauntedBy === u) continue;   // already coming for us
    let v = 0; if (eff.dmgDebuff) v += out(ctx, t) * eff.dmgDebuff * dur;
    if (tw) v += tw.attackers.includes(t) ? tw.value : tw.value * 0.3;
    if (v > 0 && (!best || v > best.v)) best = { t, v };
  }
  if (!best) return null;
  return { kind: 'skill', skill: s, target: best.t, value: best.v, rule: tw ? 'taunt' : 'debuff', reason: tw ? `taunts ${nm(best.t)} to protect ${nm(tw.ward)}` : `weakens ${nm(best.t)}` };
}

function cooldownFactor(ctx, u, s) {
  const K = AI.cooldown; if (s.type === 'heal' || s.type === 'revive') return 1;
  const cost = ctx.C.skillCost(u, s);
  const big = (s.cooldown || 0) >= K.big || (u.maxMp && cost >= K.bigCostShare * u.maxMp);
  if (!big) return 1;
  return ctx.aliveF.some(e => e.boss || e.champion || e.named) || ctx.aliveF.length >= 3 ? 1 : K.saveMult;
}

// ---------------------------------------------------------------------------------------------
// Decisions

/** Highest score wins; ties keep the earlier option (the basic attack goes in first, so it wins a tie). */
function pick(cands) { let best = null; for (const c of cands) if (c.value > 0 && (!best || c.value > best.value)) best = c; return best; }

/**
 * A hero's (or companion's) action this turn.
 * @returns {{kind:'skill'|'attack', skill?:object, target?:object, ally?:object, value:number, rule:string, reason:string, skipped?:Array}}
 */
export function decideHero(C, h) {
  const ctx = makeCtx(C, h);
  if (!ctx.aliveF.length) return { kind: 'attack', target: null, value: 0, rule: 'idle', reason: 'waits' };
  const healer = isHealerUnit(C, h); const reserve = healer ? healReserve(C, h) : 0;
  const cands = attackPlans(ctx); const skipped = [];
  for (const s of C.usableSkills(h)) {
    let c = null;
    if (s.type === 'revive') c = planRevive(ctx, s);
    else if (s.type === 'heal') c = planHeal(ctx, s);
    else if (s.type === 'buff' || s.type === 'counter') c = planBuff(ctx, s);
    else c = planDamage(ctx, s);
    if (!c) continue;
    const cost = C.skillCost(h, s);
    if (healer && cost > 0 && s.type !== 'heal' && s.type !== 'revive' && (h.mp || 0) - cost < reserve) { skipped.push({ skill: s.id, why: 'keeps mana for a heal' }); continue; }
    c.value *= manaFactor(h, cost) * cooldownFactor(ctx, h, s);
    cands.push(c);
  }
  // An area skill that costs mana has to reach enough enemies and beat the best single-target option.
  const bestSingle = Math.max(0, ...cands.filter(c => c.kind === 'attack' || (c.damage && !c.area)).map(c => c.value));
  for (const c of cands) if (c.area && C.skillCost(h, c.skill) > 0 && (c.reach < AI.aoe.minTargets || c.value < bestSingle * AI.aoe.minGain)) { skipped.push({ skill: c.skill.id, why: c.reach < AI.aoe.minTargets ? 'not enough enemies for an area skill' : 'a single target is better' }); c.value = 0; }
  const best = pick(cands);
  if (best) return { ...best, skipped };
  const t = C.pickFoe(h, ctx.aliveF);
  return { kind: 'attack', target: t, value: 0, rule: 'fallback', reason: `attacks ${nm(t)} (nothing better to do)`, skipped };
}

/** Value of one enemy spell on its best target (or on everyone, for an area spell). */
function planSpell(ctx, sp) {
  const { C, u } = ctx; const ef = sp.effect || {}; const mult = sp.windUp?.rounds ? AI.enemy.windUpMult : 1;
  const statuses = [...(ef.statuses || []), ...(ef.status ? [ef.status] : []), ...(ef.statusEffect ? [ef.statusEffect] : []), ...(ef.debuff ? [{ type: ef.debuff }] : [])];
  const magic = sp.fxKind !== 'physical'; const dtype = sp.fxKind === 'ice' ? 'cold' : sp.fxKind === 'nature' ? 'poison' : sp.fxKind || 'arcane';
  const selfHeal = ef.selfHeal ? Math.min(ef.selfHeal, Math.max(0, u.maxHp - u.hp)) : 0;
  const onTarget = t => {
    const dealt = ef.damage ? ef.damage * C.spellScale(u) * (1 - (u._intDebuff || 0)) * mitigation(C, t, { magic, dtype, src: u }) : 0;
    const r = dealt > 0 ? targetValue(ctx, t, dealt) : { v: 0, killed: false, tag: null, room: ehp(t) };
    let sv = 0, top = null;
    if (!r.killed) for (const s of statuses) { const type = normalizeStatus(s.type || s); const w = clamp01(s.chance ?? 1) * statusWorth(ctx, t, type, s.duration || 2, s.power || 4, { dealsDamage: dealt > 0 }); sv += w; if (w > 0 && (!top || w > top.w)) top = { w, type }; }
    return { v: r.v + sv, r, sv, top };
  };
  if (sp.target === 'ally_lowest_hp' || ef.heal) {
    let best = null; for (const a of ctx.aliveA) { const w = healWorth(ctx, a, ef.heal || 0, { limit: AI.enemy.healThreshold }); if (w > 0 && (!best || w > best.w)) best = { a, w }; }
    return best ? { kind: 'spell', spell: sp, ally: best.a, value: best.w * mult, rule: 'heal', reason: `heals ${nm(best.a)} (${hpText(best.a)})` } : null;
  }
  if (sp.target === 'self') {
    let v = selfHeal; const recent = u._lastHit && u._lastHit.round >= C.round_ - 1;
    for (const s of statuses) { const type = normalizeStatus(s.type || s); if (u.statuses.some(x => x.type === type)) continue; if (statusDef(type)?.reflect) v += (s.power || 10) * (s.duration || 2) * (recent ? 1.5 : 0.5); else v += out(ctx, u) * 0.2; }
    return v > 0 ? { kind: 'spell', spell: sp, target: u, value: v * mult, rule: 'buff', reason: 'strengthens itself' } : null;
  }
  if (sp.target === 'aoe') {
    let v = selfHeal, kills = 0; for (const t of ctx.aliveF) { const o = onTarget(t); v += o.v; if (o.r.killed) kills++; }
    return v > 0 ? { kind: 'spell', spell: sp, value: v * mult, rule: 'area', reason: `hits the whole party${kills ? `, finishing ${kills}` : ''}` } : null;
  }
  const pool = targetPool(ctx); let best = null;
  for (const t of pool.list) { const o = onTarget(t); if (!best || o.v > best.o.v) best = { t, o }; }
  if (!best || !(best.o.v + selfHeal > 0)) return null;
  const { t, o } = best;
  const reason = pool.forced ? `${o.top && o.sv > o.r.v ? verbOn(o.top.type, t) : `hits ${nm(t)}`} (taunted)` : o.r.killed ? `finishes ${nm(t)} (${Math.round(o.r.room)} health left)` : o.top && o.sv > o.r.v ? `${verbOn(o.top.type, t)}${o.r.tag ? `, ${o.r.tag}` : ''}` : o.r.tag ? `focuses ${nm(t)}, ${o.r.tag}` : `hits ${nm(t)}`;
  return { kind: 'spell', spell: sp, target: t, value: (o.v + selfHeal) * mult, rule: pool.forced ? 'taunted' : o.r.killed ? 'finish' : o.top && o.sv > o.r.v ? 'control' : 'damage', reason };
}

/**
 * An enemy's action this turn. `spells` are the spells it may cast (combat.js has already rolled its
 * spell chance and dropped anything on cooldown or silenced); pass [] when the roll failed.
 * @returns {{kind:'mend'|'spell'|'attack', spell?:object, target?:object, ally?:object, amount?:number, value:number, rule:string, reason:string}}
 */
export function decideEnemy(C, e, { spells = [] } = {}) {
  const ctx = makeCtx(C, e);
  if (!ctx.aliveF.length) return { kind: 'attack', target: null, value: 0, rule: 'idle', reason: 'waits' };
  if (e.role === 'healer' && !C.statusSum2(e, 'noSpells')) {
    const amount = Math.max(8, Math.round((e.dmg?.[1] || 0) * 0.8)); let best = null;
    for (const a of ctx.aliveA) { const w = healWorth(ctx, a, amount, { group: true, limit: AI.enemy.healThreshold }); if (w > 0 && (!best || w > best.w)) best = { a, w }; }
    if (best) return { kind: 'mend', ally: best.a, amount, value: best.w, rule: 'heal', reason: `mends ${nm(best.a)} (${hpText(best.a)})` };
  }
  const plans = spells.map(sp => planSpell(ctx, sp)).filter(p => p && p.value >= AI.enemy.minSpellValue);
  const spell = pick(plans); if (spell) return spell;
  if (AI.enemy.focusAttacks) { const a = pick(attackPlans(ctx)); if (a) return a; }
  const pool = targetPool(ctx); const t = C.pickFoe(e, ctx.aliveF);
  return { kind: 'attack', target: t, value: 0, rule: pool.forced ? 'taunted' : 'formation', reason: pool.forced ? `attacks ${nm(t)} (taunted)` : `attacks ${nm(t)}` };
}
