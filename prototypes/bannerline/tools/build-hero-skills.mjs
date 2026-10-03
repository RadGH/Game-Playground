#!/usr/bin/env node
// Builds data/heroes.json from Farhold's data/skills.json rows + Bannerline's own hero numbers.
//
//   node tools/build-hero-skills.mjs          writes data/heroes.json
//   node tools/build-hero-skills.mjs --check  exits 1 if data/heroes.json is out of date
//
// Only DATA is reused (PLAN §6.3): the skill's shape, element, multiplier, radius, cooldown, mana and
// effects are copied from Farhold, then checked against the Bannerline skill vocabulary. A kept skill
// (or a kept talent mod) that uses a key outside the vocabulary FAILS LOUDLY, because the Bannerline
// runtime would silently ignore it. Descriptions are Bannerline's own (Farhold's descriptions quote
// Farhold-scaled numbers). Ranges (`range`) are halved for the top-down camera; radii are kept.
//
// Heroes are added per milestone: M1 Warrior; M3 Pyromancer; M6 Ranger, Druid.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FARHOLD = join(ROOT, '..', 'farhold', 'data', 'skills.json');
const OUT = join(ROOT, 'data', 'heroes.json');

// ── vocabulary (PLAN §6.3) ──────────────────────────────────────────────────────────────────────
const SHAPES = new Set(['melee', 'around', 'bolt', 'ground', 'dash', 'self', 'summon', 'form', 'place']);
// keys a skill row may carry after normalisation (effects + shape parameters)
const SKILL_KEYS = new Set(['name', 'shape', 'element', 'mult', 'radius', 'reach', 'arc', 'range', 'cooldown', 'mp',
  'projectiles', 'spread', 'splash', 'pierce', 'repeats', 'line', 'pet', 'count', 'form', 'place',
  // effects
  'status', 'statuses', 'knock', 'pullIn', 'taunt', 'selfBuff', 'pool', 'detonate', 'empowerNext', 'bonusIf', 'pen',
  'trail', 'heal']);
const SELFBUFF_KEYS = new Set(['name', 'seconds', 'movePct', 'resistPerFoe', 'every', 'resist', 'damage', 'haste', 'regen']);
const TAUNT_KEYS = new Set(['radius', 'seconds', 'perTaunt', 'perTauntCap']);
const KNOCK_KEYS = new Set(['push', 'stagger']);
const MOD_KEYS = new Set(['set', 'add', 'mul', 'knock', 'pullIn', 'pool', 'statuses', 'forms']);
const BONUS_WHEN = /^(crowd|distance):[0-9.]+(:[0-9.]+)?$/;
// Farhold keys dropped on purpose (presentation or Farhold-only systems)
const DROP = new Set(['desc', 'talents', 'icon', 'fx', 'sound', 'anim', 'unlock']);

// ── Bannerline heroes ───────────────────────────────────────────────────────────────────────────
// Combat numbers that are Bannerline's own. dps/hp curves come from econ.json hero + classes
// (dpsK/hpK); these are the mechanical parts the econ model does not have.
const HEROES = {
  warrior: {
    name: 'Warrior', dmgType: 'blade', armourClass: 'heavy', melee: true,
    range: 2.0, attackEvery: 1.0, moveSpeed: 5.0, radius: 0.6, aggro: 7,
    mp: 60, mpPerLevel: 5, mpRegen: 1.2, mpRegenPerLevel: 0.1,
    slots: { Q: 'cleave', W: 'breaching_shove', E: 'warcry', D: 'iron_resolve', R: 'whirlwind' },
    talentSkill: 'cleave', talentTier: '1',
    // Farhold's multipliers are tuned for a game where skills ARE the damage; here basic attacks carry
    // the econ model's dps curve and skills are the crowd bonus on top (econ.json classes.warrior.aoe).
    // Tuned with tools/sim-match.mjs so AI-vs-AI matches land in the PLAN §3.4 band.
    skillScale: 0.25,
    desc: 'Melee bruiser. Holds a crowd in place and cuts it down.',
  },
};

// Bannerline descriptions (numbers here must match the copied rows; tests/skills.test.js checks the
// percentages against mult).
// {mult} and {every} are filled from the scaled numbers (percent of weapon damage at rank 1).
const DESC = {
  cleave: 'Strike everything within 4.5 m for {mult} weapon damage, +12% for each enemy hit past the first (up to +48%).',
  breaching_shove: 'Strike an 80° arc 3 m ahead for {mult} weapon damage, knock targets back 4 m and stun them for 0.6 s.',
  warcry: 'Gain Might (+30% damage for 12 s). Enemies within 10 m attack you for 3 s; each one adds 5% to Might (up to +25%).',
  iron_resolve: 'For 10 s take 6% less damage per enemy within 6 m (up to 36%); every 4th hit you take releases a 4 m shockwave for {every} weapon damage.',
  whirlwind: 'Spin 5 times over 1.6 s, striking everything within 5.5 m for {mult} weapon damage each spin, pulling it in and leaving it Bleeding. You move 30% slower while spinning.',
};
const TALENT_DESC = {
  reaping_arc: 'Cleave becomes a wide 220° sweep reaching 5.5 m that knocks enemies back 1.5 m.',
  hooked_edge: 'Cleave drags everything it hits 2 m toward you.',
};

// Statuses the runtime knows (PLAN §6.3: 9). Numbers are Bannerline's.
const STATUSES = {
  burn:   { name: 'Burning', kind: 'dot', dmgType: 'fire', perSecond: 0.15, seconds: 5, maxStacks: 5 },
  bleed:  { name: 'Bleeding', kind: 'dot', dmgType: 'blade', perSecond: 0.12, seconds: 6, maxStacks: 5 },
  root:   { name: 'Rooted', kind: 'root', seconds: 2 },
  stun:   { name: 'Stunned', kind: 'stun', seconds: 1 },
  slow:   { name: 'Slowed', kind: 'slow', slow: 0.4, seconds: 3 },
  quarry: { name: 'Quarry', kind: 'debuff', takeMore: 0.2, seconds: 6 },
  might:  { name: 'Might', kind: 'buff', damage: 0.15, seconds: 12 },
  regen:  { name: 'Mending', kind: 'buff', healPerSecond: 0.025, seconds: 10 },
  haste:  { name: 'Hastened', kind: 'buff', attackSpeed: 0.3, move: 0.2, seconds: 8 },
};

const RANKS = {
  _doc: 'Basic skills (Q W E D) have 3 ranks; rank r needs hero level 2r-1. The ultimate (R) has 3 ranks at levels 6/11/16. Each rank past the first: mult x (1 + multPerRank), cooldown x (1 - cdPerRank).',
  max: 3, basicLevels: [1, 3, 5], ultLevels: [6, 11, 16], multPerRank: 0.2, cdPerRank: 0.1, talentLevel: 6,
};

// ── normalise + validate ───────────────────────────────────────────────────────────────────────
function fail(msg) { console.error('build-hero-skills: ' + msg); process.exit(1); }

function normaliseSkill(id, src, scale = 1) {
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (DROP.has(k)) continue;
    if (k === 'repeatEvery') continue;               // folded into repeats below
    if (k === 'repeats') { out.repeats = typeof v === 'number' ? { count: v, every: src.repeatEvery ?? 0.3 } : v; continue; }
    if (!SKILL_KEYS.has(k)) fail(`skill ${id}: key "${k}" is not in the Bannerline vocabulary (PLAN §6.3). Add a handler in js/sim/skills.js and to SKILL_KEYS, or drop the skill.`);
    out[k] = v;
  }
  if (!SHAPES.has(out.shape)) fail(`skill ${id}: shape "${out.shape}" unknown`);
  if (out.range != null) out.range = out.range / 2;   // top-down camera: ranges halved
  if (out.selfBuff) for (const k of Object.keys(out.selfBuff)) if (!SELFBUFF_KEYS.has(k)) fail(`skill ${id}: selfBuff.${k} unknown`);
  if (out.taunt) for (const k of Object.keys(out.taunt)) if (!TAUNT_KEYS.has(k)) fail(`skill ${id}: taunt.${k} unknown`);
  if (out.knock) for (const k of Object.keys(out.knock)) if (!KNOCK_KEYS.has(k)) fail(`skill ${id}: knock.${k} unknown`);
  if (out.status && !STATUSES[out.status]) fail(`skill ${id}: status "${out.status}" unknown`);
  if (out.bonusIf) for (const b of out.bonusIf) if (!BONUS_WHEN.test(b.when)) fail(`skill ${id}: bonusIf "${b.when}" unknown`);
  const r2 = v => Math.round(v * 100) / 100;
  if (out.mult != null) out.mult = r2(out.mult * scale);
  if (out.selfBuff && out.selfBuff.every && out.selfBuff.every.mult != null) out.selfBuff.every.mult = r2(out.selfBuff.every.mult * scale);
  if (!DESC[id]) fail(`skill ${id}: no Bannerline description in DESC`);
  const pc = v => `${Math.round(v * 100)}%`;
  out.desc = DESC[id].replace('{mult}', out.mult != null ? pc(out.mult) : '').replace('{every}', out.selfBuff?.every ? pc(out.selfBuff.every.mult) : '');
  if (out.desc.includes('{')) fail(`skill ${id}: unfilled placeholder in description`);
  return out;
}

function normaliseTalent(skillId, node) {
  for (const k of Object.keys(node.mod)) if (!MOD_KEYS.has(k)) fail(`talent ${node.id} (${skillId}): mod key "${k}" is not one of ${[...MOD_KEYS].join(', ')}`);
  if (node.mod.knock) for (const k of Object.keys(node.mod.knock)) if (!KNOCK_KEYS.has(k)) fail(`talent ${node.id}: knock.${k} unknown`);
  if (!TALENT_DESC[node.id]) fail(`talent ${node.id}: no Bannerline description`);
  return { id: node.id, name: node.name, desc: TALENT_DESC[node.id], mod: node.mod };
}

const farhold = JSON.parse(readFileSync(FARHOLD, 'utf8'));
const out = {
  _doc: 'GENERATED by tools/build-hero-skills.mjs from prototypes/farhold/data/skills.json (skill rows) + the HEROES/DESC tables in that tool. Do not edit by hand: change the tool and re-run it. Hero dps/hp curves live in econ.json (hero + classes). Read by js/sim/heroes.js, skills.js, talents.js, statuses.js.',
  ranks: RANKS,
  statuses: STATUSES,
  heroes: {},
  skills: {},
};
for (const [hid, h] of Object.entries(HEROES)) {
  const hero = { ...h };
  delete hero.talentSkill; delete hero.talentTier; delete hero.skillScale;
  for (const sid of Object.values(h.slots)) {
    const row = farhold.skills[sid];
    if (!row) fail(`hero ${hid}: Farhold skill "${sid}" missing`);
    out.skills[sid] = normaliseSkill(sid, row, h.skillScale ?? 1);
  }
  const tier = farhold.skills[h.talentSkill]?.talents?.[h.talentTier];
  if (!tier) fail(`hero ${hid}: talent tier ${h.talentTier} of ${h.talentSkill} missing`);
  hero.talent = { skill: h.talentSkill, choices: tier.nodes.slice(0, 2).map(n => normaliseTalent(h.talentSkill, n)) };
  out.heroes[hid] = hero;
}

const text = JSON.stringify(out, null, 1) + '\n';
if (process.argv.includes('--check')) {
  let cur = ''; try { cur = readFileSync(OUT, 'utf8'); } catch {}
  if (cur !== text) { console.error('data/heroes.json is out of date: run node tools/build-hero-skills.mjs'); process.exit(1); }
  console.log('data/heroes.json up to date');
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${Object.keys(out.heroes).length} heroes, ${Object.keys(out.skills).length} skills`);
}
