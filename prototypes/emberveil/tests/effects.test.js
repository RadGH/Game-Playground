// Every effect in js/effects.js, proved to change the game.
//
// The harness builds the same seeded fight twice — once with the effect attached and once
// without — and compares a signature of the whole fight (events, HP/MP, statuses, derived
// stats). If the two runs are identical the effect did nothing, and the row fails.
// The table below has exactly one row per registry id; a coverage test enforces that.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { EFFECTS, applySpawnMods, describeId, STATUS_IDS, CHAMPION_MODS, NAMED_MODS, normalizeStatus } from '../js/effects.js';
const SEED_FIRSTHIT = 2;
const SAMPLE = { 'phase:onEnter': 'The air turns to ash.', 'phase:name': 'Wrath Unbound', 'phase:hpThreshold': 0.5, 'phase:addSpells': ['imp_fireball'], 'phase:swapSpells': ['imp_fireball'], 'phase:addStatuses': [{ type: 'fury' }], 'spell:status': { type: 'burn' }, 'spell:statuses': [{ type: 'burn' }], 'spell:windUp': { rounds: 2, interruptThreshold: 40 }, 'skill:cleanse': 'all', 'skill:shield': { conMult: 3, duration: 3 }, 'skill:damageVsStatus': { marked: 0.5 }, 'skill:bleed': { duration: 2 }, 'skill:slow': { duration: 2 }, 'skill:onHitStatus': { type: 'burn' }, 'skill:statusEffects': [{ type: 'burn', chance: 1, duration: 2 }] };
import { Combat } from '../js/combat.js';
import { makeEnemy, mergeSkill, describeEffect } from '../js/rules.js';
import { Loot } from '../js/loot.js';
import { makeRng } from '../js/rng.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const items = J('items.json'), skillData = J('skills.json').skills, enemyData = J('enemies.json').entities;
const spellData = J('enemy-spells.json').spells, statusMeta = J('status-effects.json').statusMeta, bossPhaseData = J('boss-phases.json').phases;
const loot = new Loot(items);
const TPL = enemyData.goblin_scout || Object.values(enemyData)[0];
const UNDEAD_TPL = Object.entries(enemyData).find(([id]) => /skeleton|ghoul|wraith/.test(id))?.[1] || TPL;

// ── skill shells the probes cast ───────────────────────────────────────────────────────────
const DMG = { id: 'probe', name: 'Probe Strike', type: 'melee', damageMult: 1.6, mpCost: 0, cooldown: 0, effect: {} };
const MAG = { id: 'probe', name: 'Probe Bolt', type: 'magic', damageMult: 1.5, mpCost: 4, cooldown: 0, effect: {} };
const AOE = { id: 'probe', name: 'Probe Wave', type: 'magic', damageMult: 1.2, aoe: 'all', mpCost: 0, cooldown: 0, effect: {} };
const BUF = { id: 'probe', name: 'Probe Ward', type: 'buff', target: 'party', mpCost: 0, cooldown: 0, effect: { duration: 3 } };
const SELFBUF = { id: 'probe', name: 'Probe Stance', type: 'buff', target: 'self', mpCost: 0, cooldown: 0, effect: { duration: 3 } };
const HEA = { id: 'probe', name: 'Probe Mend', type: 'heal', target: 'ally', healMult: 1.5, mpCost: 0, cooldown: 0, effect: {} };
const REV = { id: 'probe', name: 'Probe Raise', type: 'revive', target: 'ally', mpCost: 0, cooldown: 0, effect: { reviveHp: 0.3 } };
const DEBUF = { id: 'probe', name: 'Probe Hex', type: 'buff', target: 'enemy', mpCost: 0, cooldown: 0, effect: { duration: 3 } };
const clone = o => JSON.parse(JSON.stringify(o));

function mkHero(o = {}) {
  return {
    id: 'h1', name: 'Probe', short: 'Probe', isHero: true, class: 'warrior', level: 8,
    hp: 400, maxHp: 400, mp: 80, maxMp: 80, attrs: { STR: 14, DEX: 12, INT: 14, CON: 14 },
    equipment: { weapon: { id: 'w1', name: 'Blade', type: 'weapon', slot: 'weapon', subtype: 'sword', dmg: [10, 14], affixes: [] } },
    skills: [], talents: {}, passiveRanks: {}, alive: true, statuses: [], cooldowns: {}, buffs: [], ...o,
  };
}
function mkAlly() { const a = mkHero({ id: 'h2', name: 'Second', short: 'Second' }); a.equipment.weapon = { id: 'w2', name: 'Club', type: 'weapon', slot: 'weapon', subtype: 'mace', dmg: [8, 11], affixes: [] }; return a; }

/** Build and run one seeded fight. `active` decides whether the effect under test is attached. */
function runOnce(id, spec, active) {
  const cut = id.indexOf(':'); const group = id.slice(0, cut), key = id.slice(cut + 1);
  const rng = makeRng(spec.seed ?? 7);
  const h = mkHero(); const party = [h];
  for (let i = 0; i < (spec.ally === true ? 1 : spec.ally || 0); i++) { const a = mkAlly(); a.id = 'h' + (i + 2); a.name = a.short = 'Ally' + (i + 2); if (spec.companion) a.isCompanion = true; party.push(a); }
  if (spec.crit) h.equipment.necklace = { id: 'nk', name: 'Keen Charm', type: 'accessory', slot: 'necklace', affixes: [{ id: 'cc', name: 'Deadly', stat: 'critChance', value: 1 }] };
  if (active && group === 'legendary') h.equipment.ring1 = { id: 'lr', name: 'Probe Ring', type: 'accessory', slot: 'ring1', legendaryEffectId: key, affixes: [] };
  if (active && group === 'affix') h.equipment.ring2 = { id: 'ar', name: 'Probe Band', type: 'accessory', slot: 'ring2', affixes: [{ id: 'probe_affix', name: 'Probe', stat: key, value: spec.v ?? 1 }] };
  if (spec.hero) spec.hero(h, active);

  const foes = []; const n = spec.nEnemies ?? 2;
  const tpl = spec.undead ? UNDEAD_TPL : TPL;
  for (let i = 0; i < n; i++) {
    const e = makeEnemy(tpl, { act: 1, heroes: 1, index: i });
    if (spec.undead) e.templateId = 'skeleton_probe'; if (spec.demon) e.templateId = 'demon_probe';
    e.maxHp = spec.enemyHp ?? 260; e.hp = e.maxHp; e.armor = spec.enemyArmor ?? 6; e.dmg = spec.enemyDmg ?? [6, 10];
    e.group = 0; e.spellList = []; e.spellChance = 0; e.hit = spec.enemyHit ?? 75;
    if (spec.enemy) spec.enemy(e, active, i);
    if (active && (group === 'champion' || group === 'named')) { applySpawnMods(e, group, [key]); if (group === 'champion') e.champion = true; }
    foes.push(e);
  }

  const skills = { ...skillData }; let probeSkill = null;
  if (spec.skill) {
    probeSkill = clone(spec.skill);
    if (active && group === 'skill') { if (TOPKEYS.has(key)) probeSkill[key] = spec.v; else probeSkill.effect[key] = spec.v; }
    if (spec.skillExtra) Object.assign(probeSkill.effect, spec.skillExtra);
    skills.probe = probeSkill; h.skills = ['probe'];
  }
  const spells = { ...spellData };
  if (spec.spell) { const sp = clone(spec.spell); if (active && group === 'spell') { if (key === 'windUp' || key === 'stealable') sp[key] = spec.v; else sp.effect[key] = spec.v; } spells.probe_spell = sp; if (!spec.spellNotEquipped) for (const e of foes) { e.spellList = ['probe_spell']; e.spellChance = 1; } }
  const bossPhases = spec.phases ? spec.phases(active, key) : {};
  if (spec.phases) for (const e of foes) e.templateId = 'phase_probe';

  const C = new Combat(party, foes, { skills, spells, loot, rng, act: 1, bossPhases, ...(spec.ctx || {}) });
  if (spec.heroHpNow) for (const p of party) p.hp = Math.round(p.maxHp * spec.heroHpNow);
  if (spec.heroMpNow != null) h.mp = spec.heroMpNow;
  if (spec.downAlly) for (const a of party.slice(1)) { a.alive = false; a.hp = 0; }
  if (active && group === 'status') { const targets = spec.on === 'hero' ? party : spec.on === 'both' ? [...party, ...foes] : foes; for (const t of targets) C.addStatus(t, key, spec.dur ?? 3, spec.power ?? 10, spec.from === 'hero' ? h : foes[0]); }
  if (spec.after) spec.after(C, h, foes, active);

  if (probeSkill && !spec.useAI) for (let i = 0; i < (spec.casts ?? 3); i++) { if (C.over || !h.alive) break; C.cast(h, mergeSkill(probeSkill, h), foes, party); }
  for (let i = 0; i < (spec.rounds ?? 3) && !C.over; i++) C.round();
  return sig(C, party, foes);
}
const TOPKEYS = new Set(['aoe', 'armorPen', 'bonusVsDemon', 'bonusVsUndead', 'buildsFlairStacks', 'consumesFlairStacks', 'cooldown', 'damageCategory', 'damageMult', 'damageStat', 'damageType', 'healAmount', 'healMult', 'healStat', 'hits', 'lifesteal', 'maxStacks', 'mpCost', 'requiresDeadEnemy', 'stackBonusPerDeath', 'stackingMode', 'statusEffects', 'target']);

const SKIP = new Set(['derived', 'equipment', 'statuses', 'buffs', 'cooldowns', 'attrs', 'skills', 'talents', 'passiveRanks', '_fx', '_lastStatuses', 'tauntedBy', '_rebleed', '_windUp', 'side', 'blueprint', 'tags']);
function sig(C, party, foes) {
  const r = x => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x);
  const units = [...party, ...foes].map(u => {
    const flat = Object.entries(u).filter(([k, v]) => !SKIP.has(k) && (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')).map(([k, v]) => k + '=' + r(v)).sort();
    return [flat.join(';'),
      (u.statuses || []).map(s => `${s.type}/${s.duration}/${s.power}`).sort().join(','),
      Object.entries(u.cooldowns || {}).map(([k, v]) => k + ':' + v).sort().join(','),
      (u.buffs || []).map(b => Object.entries(b).map(([k, v]) => k + r(v)).sort().join('')).sort().join(','),
      JSON.stringify(u._sm || {}), JSON.stringify(u._immune || {}), JSON.stringify(u._freeSkills || {}),
      u._windUp ? `${u._windUp.rounds}/${u._windUp.taken}` : ''].join('|');
  });
  const der = Object.entries(party[0].derived || {}).filter(([, v]) => typeof v === 'number').map(([k, v]) => k + '=' + r(v)).sort();
  const ev = C.log.map(e => [e.type, e.status || '', e.label || e.name || '', Math.round(e.amount || 0), Math.round(e.rawAmount || 0), e.dtype || '', e.via || '', e.rounds || '', e.text || '', (e.tags || []).join('+')].join('|'));
  return JSON.stringify({ units, der, ev, gold: r(C.bonusGold || 0) });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// One row per effect id. `v` is the value handed to the effect; the rest are world knobs.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const KILL = { enemyHp: 26, nEnemies: 3, rounds: 6, skill: DMG, casts: 4 };
const CRIT = { crit: true, enemyHp: 300, skill: DMG, casts: 3, rounds: 2 };
const P = {
  // ── legendary ────────────────────────────────────────────────────────────────────────
  'legendary:mage_missile_aoe': { skill: { ...MAG, id: 'magic_missile', name: 'Magic Missile' }, enemyHp: 300, casts: 3, rounds: 1, hero: h => { h.skills = ['magic_missile']; } },
  'legendary:crit_bleed_5': CRIT,
  'legendary:low_mana_shockwave': { skill: MAG, heroMpNow: 2, casts: 2, rounds: 2 },
  'legendary:kill_party_heal': { ...KILL, ally: true, heroHpNow: 0.4 },
  'legendary:speed_combat_init': { rounds: 4 },
  'legendary:cheat_death_once': { enemyDmg: [400, 500], enemyHit: 100, nEnemies: 3, rounds: 4 },
  'legendary:burn_extend': { skill: { ...MAG, statusEffects: [{ type: 'burn', chance: 1, duration: 2, power: 6 }] }, casts: 2, rounds: 4 },
  'legendary:mana_on_attack': { heroMpNow: 0, rounds: 4 },
  'legendary:critical_armorpen': { ...CRIT, enemyArmor: 60, rounds: 3 },
  'legendary:rally_on_kill': { ...KILL, ally: true },
  'legendary:echo_cast': { skill: MAG, casts: 6, rounds: 1, seed: 3 },
  'legendary:dragon_fury_breath': KILL,

  // ── affixes: plain stats (they change derived numbers) ────────────────────────────────
  'affix:str': { v: 4, rounds: 2 }, 'affix:dex': { v: 4, rounds: 2 }, 'affix:int': { v: 4, rounds: 2 }, 'affix:con': { v: 4, rounds: 2 },
  'affix:hp': { v: 20, rounds: 2 }, 'affix:mp': { v: 15, rounds: 2 }, 'affix:hit': { v: 8, rounds: 2 }, 'affix:dodge': { v: 6, rounds: 2 },
  'affix:initiative': { v: 3, rounds: 2 }, 'affix:dmg': { v: 3, rounds: 2 }, 'affix:armor': { v: 5, rounds: 2 },
  'affix:goldFind': { v: 0.2, rounds: 1 }, 'affix:manaRegen': { v: 1.5, rounds: 3 }, 'affix:mana_regen': { v: 1.5, rounds: 3 },
  'affix:lifeSteal': { v: 12, rounds: 3, heroHpNow: 0.5 }, 'affix:manaSteal': { v: 12, rounds: 3, heroMpNow: 0 },
  'affix:magicResist': { v: 8, rounds: 2 }, 'affix:magic_resist': { v: 8, rounds: 2 },
  'affix:critChance': { v: 0.1, rounds: 2 }, 'affix:crit_chance': { v: 0.1, rounds: 2 },
  'affix:critDamage': { v: 0.35, rounds: 2 }, 'affix:crit_damage': { v: 0.35, rounds: 2 },
  'affix:spellPower': { v: 0.15, rounds: 2 }, 'affix:spell_power': { v: 0.15, rounds: 2 },
  'affix:magicFind': { v: 0.2, rounds: 1 }, 'affix:magic_find': { v: 0.2, rounds: 1 }, 'affix:xpFind': { v: 0.15, rounds: 1 },
  'affix:block_chance': { v: 0.15, rounds: 4 }, 'affix:block_power': { v: 30, rounds: 4 },
  'affix:hpRegen': { v: 6, rounds: 4, heroHpNow: 0.5 }, 'affix:hp_regen': { v: 6, rounds: 4, heroHpNow: 0.5 },
  'affix:barrier': { v: 25, rounds: 4 }, 'affix:barrierRegen': { v: 6, rounds: 4 }, 'affix:barrier_regen': { v: 6, rounds: 4 },
  'affix:cooldownReduction': { v: 0.15, skill: { ...MAG, cooldown: 6 }, casts: 1, rounds: 3 },

  // ── affixes: conditional ──────────────────────────────────────────────────────────────
  'affix:cond_fireDmgVsPoisoned': { v: 0.2, skill: { ...MAG, id: 'flame_lash', name: 'Flame Lash' }, casts: 2, rounds: 1, after: (C, h, foes) => { for (const e of foes) C.addStatus(e, 'poison', 5, 4, e); } },
  'affix:cond_coldDmgVsBurning': { v: 0.18, skill: { ...MAG, id: 'frost_shard', name: 'Frost Shard' }, casts: 2, rounds: 1, after: (C, h, foes) => { for (const e of foes) C.addStatus(e, 'burn', 5, 4, e); } },
  'affix:cond_lightningVsSlowed': { v: 0.22, skill: { ...MAG, id: 'storm_jolt', name: 'Storm Jolt' }, casts: 2, rounds: 1, after: (C, h, foes) => { for (const e of foes) C.addStatus(e, 'slow', 5, 0, e); } },
  'affix:cond_poisonDmgVsBurning': { v: 0.2, skill: { ...MAG, id: 'venom_spit', name: 'Venom Spit' }, casts: 2, rounds: 1, after: (C, h, foes) => { for (const e of foes) C.addStatus(e, 'burn', 5, 4, e); } },
  'affix:cond_magicDmgVsAnyStatus': { v: 0.16, skill: MAG, casts: 2, rounds: 1, after: (C, h, foes) => { for (const e of foes) C.addStatus(e, 'marked', 5, 10, e); } },
  'affix:cond_burnExtend': { v: 2, skill: { ...MAG, statusEffects: [{ type: 'burn', chance: 1, duration: 2, power: 6 }] }, casts: 2, rounds: 4 },
  'affix:cond_poisonStackPower': { v: 5, skill: { ...MAG, statusEffects: [{ type: 'poison', chance: 1, duration: 3, power: 4 }] }, casts: 2, rounds: 3 },
  'affix:cond_firstHitCritBonus': { v: 0.25, skill: DMG, casts: 1, rounds: 1, seed: SEED_FIRSTHIT },
  'affix:cond_dmgBelowHpThresh': { v: 0.25, heroHpNow: 0.2, skill: DMG, casts: 2, rounds: 1 },
  'affix:cond_consecutiveHitDmg': { v: 0.12, nEnemies: 1, skill: DMG, casts: 4, rounds: 1 },
  'affix:cond_killInitBonus': { v: 6, ...KILL },
  'affix:cond_critArmorPen': { v: 0.6, ...CRIT, enemyArmor: 80 },
  'affix:cond_afterSkillSpellPow': { v: 0.15, skill: MAG, casts: 3, rounds: 2 },
  'affix:cond_ambushDmgFlat': { v: 20, skill: DMG, casts: 2, rounds: 1 },
  'affix:cond_extraSetPiece': { custom: active => setCount('cond_extraSetPiece', active) },
  'affix:cond_setThresholdReduce': { custom: active => setCount('cond_setThresholdReduce', active) },
  'affix:cond_legendaryEffect': { custom: active => JSON.stringify(loot.describe({ id: 'legendary_effect', stat: 'cond_legendaryEffect', value: 1, descriptor: active ? 'A legendary power.' : null })) },
  'affix:cond_dotDmgReduce': { v: 0.3, rounds: 4, after: (C, h) => C.addStatus(h, 'poison', 6, 12, h) },
  'affix:cond_thornsFlat': { v: 12, enemyDmg: [8, 12], enemyHit: 100, rounds: 4 },
  'affix:cond_physDmgReducePct': { v: 0.12, enemyDmg: [20, 25], enemyHit: 100, rounds: 4 },
  'affix:cond_cheatDeath': { v: 1, enemyDmg: [400, 500], enemyHit: 100, nEnemies: 3, rounds: 4 },
  'affix:cond_magicDmgReducePct': { v: 0.12, rounds: 4, spell: { id: 'probe_spell', name: 'Probe Blast', fxKind: 'shadow', cooldown: 1, target: 'single', effect: { damage: 30 } } },
  'affix:cond_combatStartBarrier': { v: 30, enemyDmg: [10, 14], enemyHit: 100, rounds: 3 },
  'affix:cond_manaOnAttack': { v: 3, heroMpNow: 0, rounds: 4 },
  'affix:cond_hpOnKill': { v: 15, ...KILL, heroHpNow: 0.5 },
  'affix:cond_skillMpCostReduce': { v: 3, skill: { ...MAG, mpCost: 10 }, casts: 3, rounds: 1 },
  'affix:cond_lowManaRegenBonus': { v: 0.75, heroMpNow: 1, rounds: 4 },
  'affix:cond_manaOnCrit': { v: 6, ...CRIT, heroMpNow: 0 },
  'affix:cond_partyHpOnKill': { v: 8, ...KILL, ally: true, heroHpNow: 0.5 },
  'affix:cond_dmgVsUndead': { v: 20, undead: true, skill: DMG, casts: 2, rounds: 1 },
  'affix:cond_dmgVsDemon': { v: 20, demon: true, skill: DMG, casts: 2, rounds: 1 },
  'affix:cond_goldOnEliteKill': { v: 0.3, ...KILL, enemy: e => { e.champion = true; } },
  'affix:cond_sustainedDmgBonus': { v: 0.18, rounds: 6, enemyHp: 600 },
  'affix:cond_speedOnFirstHit': { v: 8, rounds: 4 },
  'affix:cond_executeDmgPct': { v: 0.4, skill: DMG, casts: 2, rounds: 1, enemyHp: 800, enemy: e => { e.hp = 60; } },
  'affix:cond_manaShieldOnHit': { v: 0.25, enemyDmg: [20, 26], enemyHit: 100, rounds: 4 },
  'affix:cond_bleedOnCrit': { v: 0.6, ...CRIT, rounds: 3 },

  // ── champion modifiers ────────────────────────────────────────────────────────────────
  'champion:regen': { rounds: 5 }, 'champion:aura_damage': { rounds: 5, enemyHit: 100 }, 'champion:fast': { rounds: 4 },
  'champion:extra_strong': { rounds: 4, enemyHit: 100 }, 'champion:tough': { rounds: 4 },
  'champion:cursed_aura': { rounds: 4 }, 'champion:shielded': { rounds: 4 }, 'champion:lifesteal': { rounds: 5, enemyHit: 100 },
  'champion:thorns': { rounds: 4 }, 'champion:inferno': { rounds: 4 },

  // ── named-enemy modifiers ─────────────────────────────────────────────────────────────
  'named:tough': { rounds: 4 }, 'named:fast': { rounds: 4 }, 'named:regen': { rounds: 5 }, 'named:thorns': { rounds: 4 },
  'named:fiery': { rounds: 4, enemyHit: 100 }, 'named:vampiric': { rounds: 5, enemyHit: 100 }, 'named:cursed': { rounds: 4, enemyHit: 100 },
  'named:summoner': { custom: active => JSON.stringify({ followers: active ? 4 : 2, desc: describeId('named:summoner') }) },
  'named:colossal': { rounds: 4 },
};

/** Set-piece helpers for the two loot-only affixes. */
function setCount(stat, active) {
  const rng = makeRng(4);
  const a = loot.generateSetItem('iron_brigade', 0, 'high', rng);
  if (active) a.affixes.push({ id: 'probe', name: 'Probe', stat, value: 1 });
  const sets = loot.activeSets({ head: a });
  return JSON.stringify(sets.map(s => [s.count, s.bonuses.length, s.legendaryActive]));
}

// ── statuses ────────────────────────────────────────────────────────────────────────────
const ST = {
  'status:bleed': { on: 'enemy', rounds: 4 }, 'status:poison': { on: 'enemy', rounds: 4 }, 'status:burn': { on: 'enemy', rounds: 4 },
  'status:holy_burn': { on: 'enemy', rounds: 4, undead: true },
  'status:stun': { on: 'enemy', rounds: 4, enemyHit: 100 }, 'status:freeze': { on: 'enemy', rounds: 4, enemyHit: 100 },
  'status:sleep': { on: 'enemy', rounds: 4, enemyHit: 100 }, 'status:confused': { on: 'enemy', rounds: 4, enemyHit: 100 },
  'status:haste': { on: 'hero', rounds: 4 }, 'status:rally': { on: 'hero', power: 0.5, rounds: 4 },
  'status:enchant': { on: 'hero', power: 0.5, rounds: 4 }, 'status:fury': { on: 'hero', power: 50, rounds: 4 },
  'status:weaken': { on: 'hero', power: 50, rounds: 4 }, 'status:curse': { on: 'hero', power: 50, rounds: 4 },
  'status:disarm': { on: 'hero', rounds: 4 },
  'status:barrier': { on: 'hero', power: 60, rounds: 4, enemyHit: 100, enemyDmg: [15, 20] },
  'status:block': { on: 'hero', power: 90, rounds: 5, enemyHit: 100, enemyDmg: [15, 20] },
  'status:deflect': { on: 'hero', rounds: 4, enemyHit: 100, enemyDmg: [15, 20] },
  'status:slow': { on: 'hero', rounds: 4 }, 'status:regen': { on: 'hero', power: 15, rounds: 4, heroHpNow: 0.4 },
  'status:marked': { on: 'enemy', power: 60, rounds: 4 }, 'status:blind': { on: 'hero', rounds: 4 },
  'status:dazed': { on: 'hero', rounds: 4 },
  'status:soulbind': { on: 'hero', ally: true, rounds: 4, enemyHit: 100, enemyDmg: [15, 20] },
  'status:silence': { on: 'hero', rounds: 4, skill: MAG, useAI: true },
  'status:root': { on: 'enemy', rounds: 5 },
  'status:thorns': { on: 'enemy', power: 20, rounds: 4 },
  'status:sunder': { on: 'enemy', power: 40, rounds: 4, enemyArmor: 60 },
  'status:taunt_totem': { on: 'hero', ally: true, rounds: 4, enemyHit: 100 },

  // ── the road weapons (round 14): combat-side properties ───────────────────────────────
  'affix:cond_killGrowth': { v: 0.01, ctx: { meter: { itemStats: { w1: { kills: 100 } } } }, skill: DMG, casts: 3, rounds: 2 },
  'affix:cond_critFromWounds': { v: 20, heroHpNow: 0.2, rounds: 3 },
  'affix:cond_brandFire': { v: 0.5, rounds: 3 },
  'affix:cond_brandIce': { v: 0.5, rounds: 3 },
  'affix:cond_brandShadow': { v: 0.5, rounds: 3 },
  'affix:cond_brandHoly': { v: 0.5, rounds: 3 },
  'affix:cond_brandLightning': { v: 0.5, rounds: 3 },
  'affix:cond_brandNature': { v: 0.5, rounds: 3 },
  'affix:cond_brandArcane': { v: 0.5, rounds: 3 },
  'affix:cond_sunderOnHit': { v: 1, rounds: 3 },
  'affix:cond_dmgVsNamed': { v: 0.5, rounds: 3, enemy: e => { e.named = true; } },
  'affix:cond_nemesisMark': { v: 0.3, rounds: 3 },
  'affix:cond_companionExtra': { v: 1, ally: 1, companion: true, rounds: 3 },
  'affix:cond_companionFury': { v: 0.4, ally: 1, companion: true, rounds: 3 },
  'affix:cond_vehicleDmg': { v: 0.3, ctx: { vehicle: 'wagon' }, rounds: 3 },
  'affix:cond_guardBond': { v: 1, enemyDmg: [20, 30], enemyHit: 100, rounds: 3 },
  'legendary:companion_might': { ally: 1, companion: true, rounds: 3 },
  'legendary:strip_modifier': { rounds: 3, enemy: (e, active, i) => { if (i === 0) { applySpawnMods(e, 'named', ['tough', 'fast']); e.named = true; } } },
  'legendary:hated_blade': { rounds: 3 },
  'legendary:kill_ledger': { ctx: { meter: { itemStats: { w1: { kills: 100 } } } }, rounds: 3 },
  'legendary:curse_spreads': KILL,
  'legendary:nemesis_hunter': { ...KILL, enemy: e => { e.named = true; } },

  // ── the road weapons: world-side properties (travel, rest, supplies, memory) ──────────
  // These never touch a fight, so they are proved against a real Game in tests/weapons.test.js.
  'affix:cond_forageRation': { v: 0.25, world: true },
  'affix:cond_nightWard': { v: 0.12, world: true },
  'affix:cond_extraLeg': { v: 2, world: true },
  'affix:cond_roadFind': { v: 0.12, world: true },
  'affix:cond_easeExhaustion': { v: 0.5, world: true },
  'affix:cond_watch': { v: 1, world: true },
  'affix:cond_killMemory': { v: 1, world: true },
  'legendary:camp_mend': { world: true },
  'legendary:forage_feast': { world: true },
  'legendary:naming_kills': { world: true },
  'legendary:road_cache': { world: true },
  'legendary:free_move': { world: true },
  'legendary:no_night_raids': { world: true },

};
Object.assign(P, ST);

// ── enemy spells ────────────────────────────────────────────────────────────────────────
const SPELL = { id: 'probe_spell', name: 'Probe Spell', fxKind: 'fire', cooldown: 1, target: 'single', effect: {} };
Object.assign(P, {
  'spell:damage': { v: 25, spell: SPELL, rounds: 4 },
  'spell:status': { v: { type: 'burn', duration: 3, power: 7, chance: 1 }, spell: { ...SPELL, effect: { damage: 5 } }, rounds: 4 },
  'spell:statuses': { v: [{ type: 'poison', duration: 3, power: 6, chance: 1 }, { type: 'slow', duration: 2, power: 0, chance: 1 }], spell: { ...SPELL, effect: { damage: 5 } }, rounds: 4 },
  'spell:heal': { v: 40, spell: { ...SPELL, target: 'ally_lowest_hp', effect: {} }, rounds: 4, enemy: (e, a, i) => { if (i === 1) e.hp = 40; } },
  'spell:selfHeal': { v: 40, spell: { ...SPELL, effect: { damage: 5 } }, rounds: 4, enemy: e => { e.hp = 60; } },
  'spell:windUp': { v: { rounds: 2, interruptThreshold: 100000 }, spell: { ...SPELL, target: 'aoe', effect: { damage: 30 } }, rounds: 5 },
  'spell:stealable': { v: false, spell: { ...SPELL, effect: { damage: 25 } }, rounds: 4, skill: { ...SELFBUF, effect: { duration: 3, pilferCount: 2 } }, casts: 1 },
});

// ── boss phases ─────────────────────────────────────────────────────────────────────────
const phaseSpec = key => ({
  rounds: 7, enemyHp: 400, nEnemies: 1, skill: DMG, casts: 4,
  spell: key === 'addSpells' || key === 'swapSpells' ? { ...SPELL, target: 'aoe', effect: { damage: 20 } } : undefined,
  spellNotEquipped: true,
  phases: (active, k) => {
    const base = { hpThreshold: 0.8, name: 'Second Wind', onEnter: 'It draws itself up.' };
    const p = { ...base };
    if (k === 'hpThreshold') p.hpThreshold = active ? 0.8 : 0.0000001;
    if (k === 'name') p.name = active ? 'Wrath Unbound' : 'Phase';
    if (k === 'onEnter') p.onEnter = active ? 'The air turns to ash.' : '';
    if (k === 'addSpells' && active) p.addSpells = ['probe_spell'];
    if (k === 'swapSpells' && active) p.swapSpells = ['probe_spell'];
    if (k === 'addStatuses' && active) p.addStatuses = [{ type: 'fury', duration: 99, power: 40 }];
    return { phase_probe: { phases: [p] } };
  },
  enemy: e => { e.spellList = []; e.spellChance = 1; },
});
for (const k of ['hpThreshold', 'name', 'onEnter', 'addSpells', 'swapSpells', 'addStatuses']) P['phase:' + k] = phaseSpec(k);

// ── skill effect keys ───────────────────────────────────────────────────────────────────
const d = (v, o = {}) => ({ v, skill: DMG, casts: 3, rounds: 3, ...o });
const mg = (v, o = {}) => ({ v, skill: MAG, casts: 3, rounds: 3, ...o });
const bf = (v, o = {}) => ({ v, skill: BUF, casts: 1, rounds: 3, ...o });
const sb = (v, o = {}) => ({ v, skill: SELFBUF, casts: 1, rounds: 3, ...o });
const hl = (v, o = {}) => ({ v, skill: HEA, casts: 2, rounds: 2, heroHpNow: 0.4, ally: true, ...o });
const burnSkill = { ...MAG, statusEffects: [{ type: 'burn', chance: 1, duration: 2, power: 5 }] };
const poisonSkill = { ...MAG, statusEffects: [{ type: 'poison', chance: 1, duration: 3, power: 5 }] };
const markAll = (C, h, foes) => { for (const e of foes) C.addStatus(e, 'marked', 8, 10, e); };
const bleedAll = (C, h, foes) => { for (const e of foes) { C.addStatus(e, 'bleed', 8, 6, h); C.addStatus(e, 'bleed', 8, 6, e); } };
const mana = e => { e.mp = 50; e.maxMp = 50; };
const mr = e => { e.magicResist = 60; };
const BLAST = { id: 'probe_spell', name: 'Probe Blast', fxKind: 'shadow', cooldown: 1, target: 'single', effect: { damage: 30 } };

Object.assign(P, {
  'skill:actionsLost': d(1, { rounds: 4 }),
  'skill:addCorruptionStack': d(2, { rounds: 4 }),
  'skill:aoe': d('all', { nEnemies: 3 }),
  'skill:aoeReduction': d(0.4, { skill: AOE, nEnemies: 3, casts: 2, rounds: 1 }),
  'skill:applyCurse': d(true, { rounds: 4 }),
  'skill:armorBonus': sb(12, { rounds: 4, enemyHit: 100 }),
  'skill:armorDebuff': d(8, { enemyArmor: 60, rounds: 3 }),
  'skill:armorDebuffDur': d(5, { skillExtra: { armorDebuff: 8 }, enemyArmor: 60, rounds: 4 }),
  'skill:armorDebuffOnHit': d(8, { enemyArmor: 60, rounds: 3 }),
  'skill:armorPen': d(0.8, { enemyArmor: 90, casts: 2, rounds: 1 }),
  'skill:armorPenPct': d(0.8, { enemyArmor: 90, casts: 2, rounds: 1 }),
  'skill:armorReduce': d(10, { enemyArmor: 60, rounds: 3 }),
  'skill:armorReduceDuration': d(6, { skillExtra: { armorReduce: 10 }, enemyArmor: 60, rounds: 4 }),
  'skill:atkDebuff': { v: 30, skill: DEBUF, casts: 1, rounds: 4, enemyHit: 90 },
  'skill:attackCount': d(3),
  'skill:attackSpeed': sb(0.3, { rounds: 3 }),
  'skill:barrier': sb(40, { rounds: 4, enemyHit: 100, enemyDmg: [12, 16] }),
  'skill:bleed': d({ duration: 4, power: 7 }, { rounds: 4 }),
  'skill:bleedChance': d(1, { rounds: 4 }),
  'skill:bleedStack': d(3, { rounds: 4 }),
  'skill:bolts': mg(4, { skill: { ...MAG, aoe: 'multi3' }, casts: 2, rounds: 1 }),
  'skill:bonusVsDemon': d(0.8, { demon: true, casts: 2, rounds: 1 }),
  'skill:bonusVsUndead': d(0.8, { undead: true, casts: 2, rounds: 1 }),
  'skill:breathWeaponFree': { v: true, skill: { ...MAG, id: 'breath_weapon', name: 'Breath Weapon', mpCost: 20 }, casts: 2, rounds: 1, heroMpNow: 60 },
  'skill:buildsFlairStacks': d(2, { casts: 3, rounds: 1 }),
  'skill:burnDmgMult': mg(2.5, { skill: burnSkill, rounds: 4 }),
  'skill:burnDuration': mg(3, { skill: burnSkill, rounds: 5 }),
  'skill:burnMult': mg(2.5, { skill: burnSkill, rounds: 4 }),
  'skill:burnSpread': mg(true, { skill: burnSkill, nEnemies: 3, rounds: 4 }),
  'skill:burnStackRate': mg(1, { rounds: 4 }),
  'skill:burnVsUndead': d(true, { undead: true, rounds: 4 }),
  'skill:cdrOnKill': { v: 3, enemyHp: 20, nEnemies: 3, skill: { ...DMG, cooldown: 5 }, casts: 3, rounds: 1 },
  'skill:chainCount': d(3, { nEnemies: 3, casts: 2, rounds: 1 }),
  'skill:chainDmgScale': d(0.5, { skill: { ...DMG, aoe: 'all' }, nEnemies: 3, casts: 2, rounds: 1 }),
  'skill:chainMult': d(0.5, { skill: { ...DMG, aoe: 'all' }, nEnemies: 3, casts: 2, rounds: 1 }),
  'skill:chainTarget': d(2, { nEnemies: 3, casts: 2, rounds: 1 }),
  'skill:chainTargets': d(3, { nEnemies: 3, casts: 2, rounds: 1 }),
  'skill:cleanse': { v: 'all', skill: HEA, casts: 1, rounds: 3, heroHpNow: 0.5, after: (C, h) => C.addStatus(h, 'poison', 8, 8, h) },
  'skill:cleanseOnActivate': { v: true, skill: DMG, casts: 1, rounds: 3, after: (C, h) => C.addStatus(h, 'poison', 8, 8, h) },
  'skill:cleanseParty': { v: true, skill: BUF, ally: true, casts: 1, rounds: 3, after: (C, h) => C.addStatus(h, 'poison', 8, 8, h) },
  'skill:conditionBonus': d(0.4, { after: markAll, casts: 2, rounds: 1 }),
  'skill:confuse': d(1, { rounds: 4 }),
  'skill:consumesFlairStacks': d(true, { after: (C, h) => { h.flair = 5; }, casts: 1, rounds: 1 }),
  'skill:cooldown': d(6, { casts: 1, rounds: 1 }),
  'skill:corpseHpScale': { v: 0.6, enemyHp: 20, nEnemies: 3, skill: DMG, casts: 4, rounds: 2 },
  'skill:corruptionDetonate': d(true, { skillExtra: { addCorruptionStack: 2 }, casts: 3, rounds: 1 }),
  'skill:critBonus': d(0.6, { casts: 3, rounds: 1, seed: 5 }),
  'skill:critBuff': sb(40, { rounds: 4 }),
  'skill:critChance': sb(0.4, { rounds: 4 }),
  'skill:critExtra': { ...CRIT, v: true },
  'skill:critVsBleed': d(0.9, { after: bleedAll, casts: 3, rounds: 1 }),
  'skill:curseDur': d(6, { rounds: 4 }),
  'skill:curseDuration': d(6, { rounds: 4 }),
  'skill:cursePower': d(45, { rounds: 4 }),
  'skill:curseSpreadCount': d(2, { skillExtra: { applyCurse: true }, nEnemies: 3, rounds: 3 }),
  'skill:damageCategory': d('magic', { casts: 2, rounds: 1 }),
  'skill:damageMult': d(4, { casts: 2, rounds: 1 }),
  'skill:damageMultInt': d(0.8, { casts: 2, rounds: 1 }),
  'skill:damageStat': d('INT', { casts: 2, rounds: 1, hero: h => { h.attrs.INT = 26; } }),
  'skill:damageType': mg('fire', { casts: 2, rounds: 1 }),
  'skill:damageVsStatus': d({ marked: 0.6 }, { after: markAll, casts: 2, rounds: 1 }),
  'skill:detonateMult': d(4, { skillExtra: { addCorruptionStack: 2 }, casts: 3, rounds: 1 }),
  'skill:dmg': d(20, { casts: 2, rounds: 1 }),
  'skill:dmgAmp': d(0.5, { rounds: 4 }),
  'skill:dmgBuff': sb(0.6, { rounds: 4 }),
  'skill:dmgBuffVsDemon': d(0.8, { demon: true, casts: 2, rounds: 1 }),
  'skill:dmgBuffVsUndead': d(0.8, { undead: true, casts: 2, rounds: 1 }),
  'skill:dmgCurse': d(10, { rounds: 4 }),
  'skill:dmgDebuff': { v: 0.6, skill: DEBUF, casts: 1, rounds: 4, enemyHit: 100 },
  'skill:dmgPerBleedStack': d(0.6, { after: bleedAll, casts: 2, rounds: 1 }),
  'skill:dmgReduct': sb(0.6, { rounds: 4, enemyHit: 100, enemyDmg: [20, 26] }),
  'skill:dmgScaling': d(1.5, { heroHpNow: 0.2, casts: 2, rounds: 1 }),
  'skill:dodgeBonus': sb(0.4, { rounds: 4, enemyHit: 100 }),
  'skill:dodgeBuff': sb(40, { rounds: 4, enemyHit: 100 }),
  'skill:dodgeDebuff': { v: 25, skill: DEBUF, casts: 1, rounds: 4 },
  'skill:dodgeDebuffDur': { v: 6, skill: DEBUF, skillExtra: { dodgeDebuff: 25 }, casts: 1, rounds: 4 },
  'skill:dotDmgMult': mg(2.5, { skill: poisonSkill, rounds: 4 }),
  'skill:dotDuration': mg(3, { skill: poisonSkill, rounds: 5 }),
  'skill:dotDurationMult': mg(2.5, { skill: poisonSkill, rounds: 5 }),
  'skill:dotLifesteal': mg(0.8, { skill: { ...MAG, statusEffects: [{ type: 'poison', chance: 1, duration: 5, power: 9 }] }, rounds: 4, heroHpNow: 0.5 }),
  'skill:dotPower': mg(25, { skill: poisonSkill, rounds: 4 }),
  'skill:drainBuff': d(0.6, { rounds: 4 }),
  'skill:duration': { v: 7, skill: { ...BUF, effect: {} }, skillExtra: { dmgBuff: 0.3 }, casts: 1, rounds: 5 },
  'skill:durationMult': { v: 3, skill: { ...BUF, effect: {} }, skillExtra: { duration: 2, dmgBuff: 0.3 }, casts: 1, rounds: 5 },
  'skill:elementImmunityParty': { v: true, skill: BUF, ally: true, casts: 1, rounds: 4, spell: { ...SPELL, target: 'aoe', effect: { status: { type: 'burn', duration: 3, power: 8, chance: 1 } } } },
  'skill:elementStatusGuaranteed': mg(true, { rounds: 4 }),
  'skill:elementStatusMult': mg(3, { skill: poisonSkill, rounds: 4 }),
  'skill:elementalStatus': mg(true, { rounds: 4 }),
  'skill:enemySkipExtra': { v: 2, skill: BUF, skillExtra: { enemySkipRound: true }, casts: 1, rounds: 5 },
  'skill:enemySkipRound': { v: true, skill: BUF, casts: 1, rounds: 4 },
  'skill:enemySkipRounds': { v: 3, skill: BUF, skillExtra: { enemySkipRound: true }, casts: 1, rounds: 5 },
  'skill:excludeSelf': { v: true, skill: { ...HEA, target: 'party' }, ally: true, casts: 1, rounds: 2, heroHpNow: 0.4 },
  'skill:executeChance': d(1, { enemyHp: 800, enemy: e => { e.hp = 60; }, casts: 2, rounds: 1 }),
  'skill:executeMult': d(6, { skillExtra: { executeThreshold: 0.6 }, enemy: e => { e.hp = Math.round(e.maxHp * 0.5); }, casts: 2, rounds: 1 }),
  'skill:executeThreshold': d(0.6, { enemy: e => { e.hp = Math.round(e.maxHp * 0.5); }, casts: 2, rounds: 1 }),
  'skill:extraAction': sb(2, { rounds: 3 }),
  'skill:extraActionDuration': sb(4, { rounds: 4 }),
  'skill:fireResistDebuff': d(0.6, { skill: { ...MAG, id: 'flame_lash', name: 'Flame Lash' }, casts: 3, rounds: 1 }),
  'skill:firstStrike': { v: true, skill: BUF, casts: 1, rounds: 3 },
  'skill:freezeChance': d(1, { rounds: 4 }),
  'skill:glaiveCount': d(3, { nEnemies: 3, casts: 2, rounds: 1 }),
  'skill:guaranteedDebuffPerStack': d(true, { after: (C, h) => { h.flair = 3; }, casts: 2, rounds: 2 }),
  'skill:healAmount': hl(60),
  'skill:healMult': hl(5),
  'skill:healPct': { v: 0.5, skill: SELFBUF, casts: 1, rounds: 2, heroHpNow: 0.4 },
  'skill:healStat': hl('INT'),
  'skill:healingReduction': d(0.9, { casts: 2, rounds: 5, enemy: e => { e.regenPct = 0.25; e.hp = Math.round(e.maxHp * 0.4); } }),
  'skill:hemorrhage': d(true, { after: bleedAll, casts: 2, rounds: 1 }),
  'skill:hitBonus': sb(25, { rounds: 6, enemy: e => { e.dodge = 45; } }),
  'skill:hitBuff': sb(25, { rounds: 6, enemy: e => { e.dodge = 45; } }),
  'skill:hits': d(3, { casts: 2, rounds: 1 }),
  'skill:hpRegen': { v: 10, skill: HEA, casts: 1, rounds: 5, heroHpNow: 0.4 },
  'skill:hpSacrifice': d(0.25, { casts: 2, rounds: 1 }),
  'skill:igniteZone': mg(3, { nEnemies: 3, rounds: 4 }),
  'skill:ignoreMR': mg(true, { enemy: mr, casts: 2, rounds: 1 }),
  'skill:immune': { v: false, skill: REV, ally: true, downAlly: true, casts: 1, rounds: 3, enemyHit: 100 },
  'skill:immuneBleed': sb(true, { rounds: 4, enemyHit: 100, enemy: e => { e.statusOnHit = [{ type: 'bleed', chance: 1, duration: 3, power: 6 }]; } }),
  'skill:immuneBlind': sb(true, { rounds: 4, enemyHit: 100, enemy: e => { e.statusOnHit = [{ type: 'blind', chance: 1, duration: 3, power: 0 }]; } }),
  'skill:immuneCC': sb(true, { rounds: 4, enemyHit: 100, enemy: e => { e.statusOnHit = [{ type: 'stun', chance: 1, duration: 2, power: 0 }]; } }),
  'skill:immuneConfuse': sb(true, { rounds: 4, enemyHit: 100, enemy: e => { e.statusOnHit = [{ type: 'confused', chance: 1, duration: 3, power: 0 }]; } }),
  'skill:immuneRound': sb(3, { rounds: 4, enemyHit: 100 }),
  'skill:immuneSlow': sb(true, { rounds: 4, enemyHit: 100, enemy: e => { e.statusOnHit = [{ type: 'slow', chance: 1, duration: 3, power: 0 }]; } }),
  'skill:immuneStun': sb(true, { rounds: 4, enemyHit: 100, enemy: e => { e.statusOnHit = [{ type: 'stun', chance: 1, duration: 2, power: 0 }]; } }),
  'skill:initiative': sb(25, { rounds: 4 }),
  'skill:intDebuff': d(0.6, { rounds: 4, spell: BLAST }),
  'skill:intDebuffDur': d(6, { skillExtra: { intDebuff: 0.6 }, rounds: 5, spell: BLAST }),
  'skill:keepStacks': d(3, { skillExtra: { consumesFlairStacks: true }, after: (C, h) => { h.flair = 5; }, casts: 1, rounds: 1 }),
  'skill:lifesteal': d(0.9, { heroHpNow: 0.5, casts: 2, rounds: 1 }),
  'skill:magicPen': mg(0.9, { enemy: mr, casts: 2, rounds: 1 }),
  'skill:magicResistBonus': sb(50, { rounds: 4, spell: BLAST }),
  'skill:maxStacks': d(1, { skillExtra: { buildsFlairStacks: 2 }, casts: 3, rounds: 1 }),
  'skill:minDebuffs': d(3, { casts: 2, rounds: 2 }),
  'skill:mpCost': mg(30, { heroMpNow: 60, casts: 2, rounds: 1 }),
  'skill:mpDrain': d(20, { enemy: mana, casts: 2, rounds: 1 }),
  'skill:mpDrainDamage': d(2, { skillExtra: { mpDrain: 20 }, enemy: mana, casts: 2, rounds: 1 }),
  'skill:mpOnHit': d(8, { heroMpNow: 0, casts: 2, rounds: 1 }),
  'skill:mpRegen': { v: 25, skill: BUF, heroMpNow: 0, casts: 1, rounds: 2 },
  'skill:mpRestore': { v: 30, skill: HEA, heroMpNow: 0, heroHpNow: 0.5, casts: 1, rounds: 2 },
  'skill:mpRestoreOnKill': { v: 0.5, enemyHp: 20, nEnemies: 3, skill: DMG, casts: 4, rounds: 2, heroMpNow: 0 },
  'skill:mpReturn': d(20, { heroMpNow: 0, casts: 2, rounds: 1 }),
  'skill:mrDebuff': mg(45, { enemy: mr, casts: 3, rounds: 1 }),
  'skill:mrDebuffDur': mg(6, { skillExtra: { mrDebuff: 45 }, enemy: mr, casts: 3, rounds: 4 }),
  'skill:mrPen': mg(0.9, { enemy: mr, casts: 2, rounds: 1 }),
  'skill:neverMiss': d(true, { enemy: e => { e.dodge = 60; }, casts: 3, rounds: 1 }),
  'skill:onHitStatus': { v: { type: 'burn', duration: 3, power: 7, chance: 1 }, skill: SELFBUF, casts: 1, rounds: 4 },
  'skill:parryCount': sb(2, { rounds: 3 }),
  'skill:partyHealPct': d(0.3, { ally: true, heroHpNow: 0.4, casts: 1, rounds: 2 }),
  'skill:partyRegen': { v: true, skill: BUF, ally: true, heroHpNow: 0.5, casts: 1, rounds: 4 },
  'skill:partySplash': d(0.6, { ally: true, heroHpNow: 0.5, casts: 2, rounds: 1 }),
  'skill:persistStacks': { custom: persistProbe },
  'skill:pilferBonusDuration': d(4, { skillExtra: { pilferBuff: true }, after: (C, h, foes) => { for (const e of foes) C.buff(e, { dmgBuff: 0.5, duration: 3 }); }, casts: 2, rounds: 2 }),
  'skill:pilferBuff': d(true, { after: (C, h, foes) => { for (const e of foes) C.buff(e, { dmgBuff: 0.5, duration: 3 }); }, casts: 2, rounds: 2 }),
  'skill:pilferCount': d(2, { after: (C, h, foes) => { for (const e of foes) { C.buff(e, { dmgBuff: 0.5, duration: 3 }); C.buff(e, { dmgReduct: 0.2, duration: 3 }); } }, casts: 2, rounds: 2 }),
  'skill:pilferDamagePerBuff': d(0.6, { after: (C, h) => { C.buff(h, { duration: 6 }); C.buff(h, { duration: 6 }); }, casts: 2, rounds: 1 }),
  'skill:poisonDmgMult': mg(2.5, { skill: poisonSkill, rounds: 4 }),
  'skill:poisonMaxStacks': mg(9, { skill: { ...MAG, statusEffects: [{ type: 'poison', chance: 1, duration: 6, power: 3 }, { type: 'poison', chance: 1, duration: 6, power: 3 }, { type: 'poison', chance: 1, duration: 6, power: 3 }] }, casts: 4, rounds: 3 }),
  'skill:poisonPerTwoStacks': mg(5, { skill: { ...MAG, statusEffects: [{ type: 'poison', chance: 1, duration: 6, power: 3 }, { type: 'poison', chance: 1, duration: 6, power: 3 }] }, casts: 3, rounds: 3 }),
  'skill:pullToGroup': d(true, { nEnemies: 3, casts: 2, rounds: 1 }),
  'skill:randomElement': mg(true, { rounds: 4 }),
  'skill:randomStatus': mg(true, { rounds: 4 }),
  'skill:randomStatusChance': mg(1, { rounds: 4 }),
  'skill:randomStatusDuration': mg(6, { rounds: 4 }),
  'skill:randomStatusRollChance': mg(1, { rounds: 4 }),
  'skill:randomStatusRolls': mg(3, { rounds: 4 }),
  'skill:rebleedAfter': d(2, { rounds: 5 }),
  'skill:reflect': sb(0.6, { rounds: 4, enemyHit: 100 }),
  'skill:refundOnKill': { v: true, enemyHp: 20, nEnemies: 3, skill: { ...DMG, mpCost: 10 }, casts: 4, rounds: 2, heroMpNow: 60 },
  'skill:regenBonus': { v: 12, skill: HEA, skillExtra: { hpRegen: 3, regenRounds: 5 }, casts: 1, rounds: 5, heroHpNow: 0.4 },
  'skill:regenDur': { v: 6, skill: HEA, skillExtra: { hpRegen: 5 }, casts: 1, rounds: 6, heroHpNow: 0.4 },
  'skill:regenMult': { v: 4, skill: HEA, skillExtra: { hpRegen: 4, regenRounds: 5 }, casts: 1, rounds: 5, heroHpNow: 0.4 },
  'skill:regenPct': sb(0.12, { rounds: 5, heroHpNow: 0.4 }),
  'skill:regenRounds': { v: 6, skill: HEA, skillExtra: { hpRegen: 5 }, casts: 1, rounds: 6, heroHpNow: 0.4 },
  'skill:requiresDeadEnemy': { v: true, skill: MAG, useAI: true, rounds: 4 },
  'skill:returnMult': sb(4, { skillExtra: { reflect: 0.2 }, rounds: 4, enemyHit: 100 }),
  'skill:reviveAll': { v: true, skill: REV, ally: 2, downAlly: true, casts: 1, rounds: 2 },
  'skill:reviveHp': { v: 0.9, skill: REV, ally: true, downAlly: true, casts: 1, rounds: 2 },
  'skill:reviveImmuneRounds': { v: 4, skill: REV, ally: true, downAlly: true, casts: 1, rounds: 4, enemyHit: 100 },
  'skill:rounds': { v: 7, skill: { ...BUF, effect: {} }, skillExtra: { dmgBuff: 0.3 }, casts: 1, rounds: 5 },
  'skill:selfDamagePct': d(0.25, { casts: 2, rounds: 1 }),
  'skill:selfFree': { v: true, skill: SELFBUF, casts: 1, rounds: 3 },
  'skill:shield': sb({ conMult: 5, duration: 4 }, { rounds: 4, enemyHit: 100, enemyDmg: [12, 16] }),
  'skill:shieldDur': sb(6, { skillExtra: { shield: { conMult: 3 } }, rounds: 2, enemyHit: 100, enemyDmg: [1, 2] }),
  'skill:shieldMult': sb(4, { skillExtra: { shield: { conMult: 3 } }, rounds: 4, enemyHit: 100, enemyDmg: [12, 16] }),
  'skill:skipTurnChance': d(1, { rounds: 4 }),
  'skill:slow': d({ duration: 5 }, { rounds: 4 }),
  'skill:slowMult': d(4, { skill: { ...DMG, statusEffects: [{ type: 'slow', chance: 1, duration: 2, power: 0 }] }, rounds: 5 }),
  'skill:spellDmgBuff': sb(0.6, { rounds: 1 }),
  'skill:splash': d(0.6, { nEnemies: 3, casts: 2, rounds: 1 }),
  'skill:splashOnKill': { v: 0.6, enemyHp: 20, nEnemies: 3, skill: DMG, casts: 4, rounds: 2 },
  'skill:split': d(3, { nEnemies: 2, casts: 2, rounds: 1 }),
  'skill:splitHeal': { v: true, skill: HEA, ally: true, heroHpNow: 0.4, casts: 1, rounds: 2 },
  'skill:spreadOnDeath': { v: true, enemyHp: 20, nEnemies: 3, skill: DMG, casts: 4, rounds: 3, after: (C, h, foes) => { for (const e of foes) C.addStatus(e, 'poison', 6, 5, h); } },
  'skill:spreadToAdjacentGroup': d(true, { nEnemies: 3, skill: { ...DMG, statusEffects: [{ type: 'poison', chance: 1, duration: 5, power: 4 }] }, rounds: 3 }),
  'skill:stackBonusPerDeath': { v: 0.6, enemyHp: 20, nEnemies: 3, skill: DMG, casts: 4, rounds: 2 },
  'skill:stackDmgMult': d(3, { skillExtra: { consumesFlairStacks: true }, after: (C, h) => { h.flair = 4; }, casts: 1, rounds: 1 }),
  'skill:stackingMode': mg('global', { skill: { ...MAG, statusEffects: [{ type: 'poison', chance: 1, duration: 6, power: 4 }] }, casts: 3, rounds: 3 }),
  'skill:statusEffects': d([{ type: 'burn', chance: 1, duration: 3, power: 7 }], { rounds: 4 }),
  'skill:stealth': sb(true, { rounds: 4, ally: true }),
  'skill:stealthDur': sb(5, { rounds: 5, ally: true }),
  'skill:strikeCount': d(3, { casts: 2, rounds: 1 }),
  'skill:stunChance': d(1, { rounds: 4 }),
  'skill:sunderAmp': d(0.6, { after: (C, h, foes) => { for (const e of foes) C.addStatus(e, 'sunder', 8, 10, e); }, casts: 2, rounds: 1 }),
  'skill:suppressAbilities': d(3, { rounds: 4, spell: BLAST }),
  'skill:target': { v: 'self', skill: HEA, ally: true, heroHpNow: 0.8, casts: 1, rounds: 2, after: C => { C.heroes[1].hp = 40; } },
  'skill:targets': { v: 2, skill: { ...BUF, target: 'ally' }, skillExtra: { dmgBuff: 0.3 }, ally: true, casts: 1, rounds: 3 },
  'skill:taunt': sb(true, { rounds: 4, ally: true, companion: true, enemyHit: 100 }),
  'skill:tauntedBy': { v: true, skill: DEBUF, ally: true, companion: true, casts: 1, rounds: 4, enemyHit: 100 },
  'skill:tempHp': sb(60, { heroHpNow: 0.5, rounds: 2 }),
  'skill:thorns': sb(0.6, { rounds: 4, enemyHit: 100 }),
  'skill:trapCount': d(2, { nEnemies: 3, rounds: 4 }),
  'skill:unlocksCompanion': { custom: petProbe },
  'skill:variance': d(0.6, { casts: 4, rounds: 1 }),
  'skill:varianceCeiling': d(2.5, { casts: 4, rounds: 1 }),
  'skill:varianceFloor': d(0.4, { casts: 4, rounds: 1 }),
});

/** Flair carried between fights (skills.json `persistStacks`). */
function persistProbe(active) {
  const rng = makeRng(3); const h = mkHero();
  const mk = () => { const e = makeEnemy(TPL, { act: 1, heroes: 1, index: 0 }); e.maxHp = 200; e.hp = 200; e.group = 0; e.spellList = []; return e; };
  const sk = { id: 'probe', name: 'Probe', type: 'melee', damageMult: 1, mpCost: 0, cooldown: 0, effect: { buildsFlairStacks: 3, ...(active ? { persistStacks: true } : {}) } };
  const C1 = new Combat([h], [mk()], { skills: { probe: sk }, spells: spellData, loot, rng, act: 1 });
  C1.cast(h, mergeSkill(sk, h), C1.enemies, [h]);
  const carried = h.flair;
  new Combat([h], [mk()], { skills: { probe: sk }, spells: spellData, loot, rng, act: 1 });
  return JSON.stringify([carried, h.flair]);
}
/** Companion unlocked by a talent (skills.json `unlocksCompanion`). */
function petProbe(active) {
  const talent = Object.values(skillData).flatMap(s => (s.talents || []).map(t => ({ s, t }))).find(x => x.t.effect?.unlocksCompanion);
  if (!talent) return JSON.stringify(['no talent in data', active]);
  const id = Object.keys(skillData).find(k => skillData[k] === talent.s);
  const hero = { skills: [id], talents: active ? { [talent.t.id]: true } : {} };
  const pets = new Set(); for (const sid of hero.skills) for (const t of skillData[sid].talents || []) if (hero.talents[t.id] && t.effect?.unlocksCompanion) pets.add(t.effect.unlocksCompanion);
  return JSON.stringify([...pets]);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The tests
// ═══════════════════════════════════════════════════════════════════════════════════════════

test('every registered effect has a probe row — nothing goes untested', () => {
  const missing = Object.keys(EFFECTS).filter(id => !P[id]);
  const stray = Object.keys(P).filter(id => !EFFECTS[id]);
  assert.deepEqual(missing, [], 'registry ids with no probe row');
  assert.deepEqual(stray, [], 'probe rows for ids that are not registered');
});

const WEAPON_SPEC = fs.readFileSync(new URL('./weapons.test.js', import.meta.url), 'utf8');
for (const [id, spec] of Object.entries(P)) {
  if (spec.world) { test(`${id} is proved on the road (tests/weapons.test.js)`, () => { assert.ok(WEAPON_SPEC.includes(id), `${id} is a world effect with no row in weapons.test.js`); }); continue; }
  test(`${id} changes the fight`, () => {
    const a = spec.custom ? spec.custom(true) : runOnce(id, spec, true);
    const b = spec.custom ? spec.custom(false) : runOnce(id, spec, false);
    assert.notEqual(a, b, `${id} made no difference — value ${JSON.stringify(spec.v)}`);
  });
}

test('every effect id has a plain-language line', () => {
  for (const [id, e] of Object.entries(EFFECTS)) {
    const spec = P[id] || {};
    const line = describeId(id, spec.v ?? SAMPLE[id] ?? 1);
    assert.equal(typeof line, 'string', id); assert.ok(line.length > 2, `${id} has no description`);
    assert.ok(!/undefined|NaN|\[object/.test(line), `${id} description reads badly: ${line}`);
  }
});

test('describeEffect covers every key skills.json actually uses', () => {
  for (const [sid, s] of Object.entries(skillData)) {
    const bags = [s.effect || {}, ...(s.talents || []).map(t => t.effect || {}), ...(s.upgrades || []).map(u => u.bonus || {})];
    for (const bag of bags) for (const [k, v] of Object.entries(bag)) {
      const line = describeEffect({ [k]: v });
      assert.ok(line && line.length > 1, `${sid}.${k} has no wording`);
      assert.ok(!/^\w+ \{/.test(line) || EFFECTS['skill:' + k], `${sid}.${k} falls through to raw JSON: ${line}`);
    }
  }
});

test('no orphan ids: every legendary, affix, set and unique in items.json resolves', () => {
  for (const [id] of Object.entries(items.legendaryEffects)) assert.ok(EFFECTS['legendary:' + id], `legendaryEffects.${id} is not registered`);
  for (const u of items.uniques) assert.ok(EFFECTS['legendary:' + u.legendaryEffect], `${u.id} wants legendary ${u.legendaryEffect}`);
  for (const st of items.sets) assert.ok(EFFECTS['legendary:' + st.legendaryEffect], `${st.id} wants legendary ${st.legendaryEffect}`);
  const affixIds = [...items.affixes.prefixes, ...items.affixes.suffixes, ...items.affixes.shield, ...items.affixes.extended];
  for (const a of affixIds) assert.ok(EFFECTS['affix:' + a.stat], `affix ${a.id} (${a.stat}) is not registered`);
  const fromItems = new Set();
  for (const u of items.uniques) { for (const f of u.fixedAffixes || []) fromItems.add(f.stat); for (const r of u.randomAffixes || []) fromItems.add(r.stat); }
  for (const st of items.sets) for (const p of st.items || []) { for (const f of p.fixedAffixes || []) fromItems.add(f.stat); for (const r of p.randomAffixes || []) fromItems.add(r.stat); }
  for (const st of items.sets) for (const b of Object.values(st.partialBonuses || {})) for (const k of Object.keys(b)) if (k !== 'desc') fromItems.add(k);
  for (const stat of fromItems) assert.ok(EFFECTS['affix:' + stat], `unique/set stat ${stat} is not registered`);
});

test('no orphan ids: every skills.json key, enemy-spell key and boss-phase key resolves', () => {
  for (const [sid, s] of Object.entries(skillData)) {
    const bags = [s.effect || {}, ...(s.talents || []).map(t => t.effect || {}), ...(s.upgrades || []).map(u => u.bonus || {})];
    for (const bag of bags) for (const k of Object.keys(bag)) assert.ok(EFFECTS['skill:' + k], `${sid} uses unregistered key ${k}`);
    for (const k of ['aoe', 'damageStat', 'damageType', 'damageCategory', 'healStat', 'maxStacks', 'stackingMode', 'requiresDeadEnemy', 'consumesFlairStacks', 'lifesteal', 'stackBonusPerDeath']) if (s[k] !== undefined) assert.ok(EFFECTS['skill:' + k], `${sid} uses unregistered top-level key ${k}`);
  }
  for (const [spid, sp] of Object.entries(spellData)) {
    for (const k of Object.keys(sp.effect || {})) assert.ok(EFFECTS['spell:' + k], `${spid} uses unregistered spell key ${k}`);
    for (const k of ['windUp', 'stealable']) if (sp[k] !== undefined) assert.ok(EFFECTS['spell:' + k], `${spid} uses unregistered key ${k}`);
    for (const st of [...(sp.effect?.statuses || []), ...(sp.effect?.status ? [sp.effect.status] : [])]) assert.ok(EFFECTS['status:' + st.type], `${spid} applies unregistered status ${st.type}`);
  }
  for (const [bid, cfg] of Object.entries(bossPhaseData)) for (const ph of cfg.phases) {
    for (const k of Object.keys(ph)) assert.ok(EFFECTS['phase:' + k], `${bid} phase uses unregistered key ${k}`);
    for (const st of ph.addStatuses || []) assert.ok(EFFECTS['status:' + st.type], `${bid} phase applies unregistered status ${st.type}`);
  }
});

test('every status in statusMeta has a mechanic, and every mechanic has a glyph', () => {
  for (const type of Object.keys(statusMeta)) {
    const e = EFFECTS['status:' + type];
    assert.ok(e, `${type} has no entry in the effects registry`);
    const mech = ['dot', 'heal', 'skip', 'hitMult', 'hitFlat', 'dealtMult', 'takenMult', 'initMult', 'extraActions', 'blockBonus', 'absorbNext', 'absorbs', 'reflect', 'noSpells', 'noWeapon', 'noDodge', 'noExtra', 'drawsFire', 'share', 'armorReduce', 'wakesOnDamage'];
    assert.ok(mech.some(k => e[k] !== undefined), `${type} is only a glyph — it has no mechanic`);
  }
  for (const type of STATUS_IDS) assert.ok(statusMeta[type], `${type} has a mechanic but no glyph in status-effects.json`);
});

test('every status a skill or an enemy can apply is registered', () => {
  for (const [sid, s] of Object.entries(skillData)) {
    const lists = [s.statusEffects || [], ...(s.talents || []).map(t => t.effect?.statusEffects || []), ...(s.upgrades || []).map(u => u.bonus?.statusEffects || [])];
    for (const l of lists) for (const st of l) assert.ok(EFFECTS['status:' + normalizeStatus(st.type)], `${sid} applies unregistered status ${st.type}`);
  }
});

test('champion and named modifier pools are registered and spawn cleanly', () => {
  const named = J('named-enemies.json');
  for (const id of Object.keys(named.modifiers)) assert.ok(EFFECTS['named:' + id], `named modifier ${id} is not registered`);
  for (const st of named.static || []) for (const m of st.mods || []) assert.ok(EFFECTS['named:' + m], `${st.id} wants named modifier ${m}`);
  for (const id of CHAMPION_MODS.concat(NAMED_MODS)) {
    const e = makeEnemy(TPL, { act: 1, heroes: 4, index: 0 });
    const group = CHAMPION_MODS.includes(id) ? 'champion' : 'named';
    assert.deepEqual(applySpawnMods(e, group, [id]), [id]);
    assert.ok(e.maxHp > 0 && e.dmg[1] >= e.dmg[0]);
  }
});

test('the effects registry covers each group', () => {
  const count = g => Object.keys(EFFECTS).filter(k => k.startsWith(g + ':')).length;
  assert.equal(count('legendary'), 24); assert.ok(count('affix') >= 95); assert.ok(count('skill') >= 210);
  assert.equal(count('status'), 29); assert.equal(count('champion'), 10); assert.equal(count('named'), 9);
  assert.equal(count('spell'), 7); assert.equal(count('phase'), 6);
});
