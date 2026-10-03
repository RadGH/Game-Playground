#!/usr/bin/env node
// Builds data/items-bl.json: Bannerline's item tables (PLAN §7).
//
//   node tools/build-items-bl.mjs          writes data/items-bl.json
//   node tools/build-items-bl.mjs --check  exits 1 if the file is out of date
//
// What it copies, and from where (data only; no Farhold or Emberveil code is imported):
//   * base NAMES and two-handed flags from prototypes/emberveil/data/items.json (the shared file
//     Farhold reads too), filtered to the bases Bannerline's heroes use;
//   * unique rows (name, lore, base) from prototypes/farhold/data/uniques.json, with each power
//     RE-EXPRESSED in the Bannerline effect vocabulary (PLAN §7.4) — Farhold's uniques.js queues
//     closures and pulls in Farhold world code, so it is never imported.
// What is Bannerline's own: the 16 affixes (percent units), rarity rules, drop tables, the set.
//
// The sim reads only data/items-bl.json; it never reaches into another prototype's folder.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = JSON.parse(readFileSync(join(ROOT, '..', 'emberveil', 'data', 'items.json'), 'utf8'));
const UNIQUES = JSON.parse(readFileSync(join(ROOT, '..', 'farhold', 'data', 'uniques.json'), 'utf8')).uniques;
const OUT = join(ROOT, 'data', 'items-bl.json');
const fail = m => { console.error('build-items-bl: ' + m); process.exit(1); };

const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'hands', 'feet', 'neck', 'ring'];
const SLOT_NAMES = { weapon: 'Weapon', offhand: 'Off-hand', head: 'Head', chest: 'Chest', hands: 'Hands', feet: 'Feet', neck: 'Neck', ring: 'Ring' };

// shared base id per (slot, kind); kind = armour tier for armour, hero id for weapon/off-hand
const BASE_IDS = {
  weapon: { warrior: 'longsword', pyromancer: 'wand', ranger: 'shortbow', druid: 'quarterstaff' },
  offhand: { warrior: 'kite_shield', pyromancer: 'spellguard_orb', ranger: 'quiver', druid: null },
  head: { cloth: 'cloth_helm', light: 'light_helm', medium: 'medium_helm', heavy: 'heavy_helm' },
  chest: { cloth: 'cloth_chest', light: 'light_chest', medium: 'medium_chest', heavy: 'heavy_chest' },
  hands: { cloth: 'light_gauntlets', light: 'light_gauntlets', medium: 'medium_gauntlets', heavy: 'heavy_gauntlets' },
  feet: { cloth: 'light_boots', light: 'light_boots', medium: 'medium_boots', heavy: 'heavy_boots' },
  neck: { any: 'necklace' },
  ring: { any: 'ring' },
};
// Display name overrides (the shared names are fine except where a Bannerline hero needs its own)
const NAME_OVERRIDE = { cloth_helm: 'Hood', spellguard_orb: 'Warded Orb', light_gauntlets: 'Gloves', light_boots: 'Shoes' };

function baseRow(id) {
  const b = SHARED.weaponBases[id] || SHARED.armorBases[id];
  if (!b) fail(`shared base "${id}" not found in emberveil/data/items.json`);
  return { name: NAME_OVERRIDE[id] || b.name, twoHanded: !!b.twoHanded };
}
const bases = {};
for (const [slot, byKind] of Object.entries(BASE_IDS)) {
  bases[slot] = {};
  for (const [kind, id] of Object.entries(byKind)) bases[slot][kind] = id ? { id, ...baseRow(id) } : null;
}

// ── affixes: 16 stats, each with a sim handler (js/sim/items.js) and a test (tests/items.test.js) ──
// Values are PERCENT numbers unless the unit says otherwise; ranges are item level 1 and grow with the
// item's tier through Farhold's tierMult (x2.2 at item level 24+, js/sim/adapters/affixes.js). Sized
// with tools/sim-match.mjs so a legendary kit is worth about as much again as its shop steps.
const AFFIXES = [
  { id: 'keen', name: 'Keen', kind: 'prefix', stat: 'dmgPct', min: 1.2, max: 2.4, unit: '%', label: 'damage' },
  { id: 'quick', name: 'Quick', kind: 'prefix', stat: 'attackSpeed', min: 1.2, max: 2.4, unit: '%', label: 'attack speed' },
  { id: 'deadly', name: 'Deadly', kind: 'prefix', stat: 'critChance', min: 0.8, max: 1.6, unit: '%', label: 'critical chance' },
  { id: 'savage', name: 'Savage', kind: 'prefix', stat: 'critDamage', min: 3.2, max: 6, unit: '%', label: 'critical damage' },
  { id: 'leeching', name: 'Leeching', kind: 'prefix', stat: 'lifeSteal', min: 0.8, max: 1.6, unit: '%', label: 'life steal (blade and pierce basic attacks)', slots: ['weapon', 'hands', 'ring'] },
  { id: 'sweeping', name: 'Sweeping', kind: 'prefix', stat: 'areaPct', min: 1.6, max: 3.2, unit: '%', label: 'skill area' },
  { id: 'headsmans', name: "Headsman's", kind: 'prefix', stat: 'vsChampion', min: 2.4, max: 4.8, unit: '%', label: 'damage to champions' },
  { id: 'focused', name: 'Focused', kind: 'prefix', stat: 'cdr', min: 1.2, max: 2.4, unit: '%', label: 'faster skill cooldowns' },
  { id: 'of_vitality', name: 'of Vitality', kind: 'suffix', stat: 'maxHp', min: 10, max: 20, unit: '', label: 'health' },
  { id: 'of_warding', name: 'of Warding', kind: 'suffix', stat: 'armor', min: 0.4, max: 1.2, unit: '', label: 'armour' },
  { id: 'of_mending', name: 'of Mending', kind: 'suffix', stat: 'hpRegen', min: 0.8, max: 2, unit: '/s', label: 'health a second' },
  { id: 'of_the_mind', name: 'of the Mind', kind: 'suffix', stat: 'mana', min: 3.2, max: 6.4, unit: '', label: 'mana' },
  { id: 'of_flow', name: 'of Flow', kind: 'suffix', stat: 'manaRegen', min: 0.12, max: 0.32, unit: '/s', label: 'mana a second' },
  { id: 'of_haste', name: 'of Haste', kind: 'suffix', stat: 'moveSpeed', min: 1.2, max: 2.4, unit: '%', label: 'move speed', slots: ['feet', 'neck', 'ring', 'offhand'] },
  { id: 'of_plunder', name: 'of Plunder', kind: 'suffix', stat: 'bountyPct', min: 1.6, max: 3.2, unit: '%', label: 'bounty' },
  { id: 'of_resolve', name: 'of Resolve', kind: 'suffix', stat: 'resistAll', min: 0.8, max: 1.6, unit: '%', label: 'less damage taken' },
];
// caps on the WORN total of a stat: a full legendary kit used to reach -40% cooldowns, -30% damage
// taken and +58% vs champions, and both heroes then held the field to the time cap
const CAPS = { critChance: 20, cdr: 25, resistAll: 15, attackSpeed: 30, moveSpeed: 20, lifeSteal: 10, areaPct: 30, vsChampion: 25, dmgPct: 30 };
// score weights: points per unit of each stat (the shop's "Buy recommended", the Equip prompt, the AI)
const SCORE = { dmgPct: 6, attackSpeed: 5, critChance: 5, critDamage: 1.5, lifeSteal: 4, areaPct: 2, vsChampion: 1.5, cdr: 4,
  maxHp: 0.3, armor: 5, hpRegen: 3, mana: 0.4, manaRegen: 10, moveSpeed: 3, bountyPct: 2, resistAll: 6 };

// ── uniques: 2 per hero, re-expressed (PLAN §7.4) ──
// power vocabulary: onHit {status, add, perSecond}; everyNthHit {n, selfStatus, seconds} or
// {n, around {radius, mult}}; everyNthCast {n, mult}
const UNIQUE_PICKS = {
  warrior: [
    { id: 'fh_oathcutter', slot: 'weapon', power: { everyNthHit: { n: 5, selfStatus: 'haste', seconds: 4 } }, text: 'Every 5th basic hit Hastens you for 4 s.' },
    { id: 'fh_the_long_scythe', slot: 'weapon', twoHanded: true, power: { everyNthHit: { n: 3, around: { radius: 3.5, mult: 0.6 } } }, text: 'Every 3rd basic attack also strikes everything within 3.5 m for 60% weapon damage.' },
  ],
  pyromancer: [
    { id: 'fh_cinderquill', slot: 'weapon', power: { onHit: { status: 'burn', add: 1, perSecond: 0.08 } }, text: 'Basic attacks add a stack of Burning (8% weapon damage a second per stack).' },
    { id: 'fh_sootcrown', slot: 'weapon', twoHanded: true, power: { everyNthCast: { n: 4, mult: 1.6 } }, text: 'Every 4th skill you cast deals 60% more damage.' },
  ],
};
const uniques = {};
for (const [hero, picks] of Object.entries(UNIQUE_PICKS)) {
  for (const pk of picks) {
    const row = UNIQUES.find(u => u.id === pk.id);
    if (!row) fail(`Farhold unique ${pk.id} missing`);
    const id = pk.id.replace(/^fh_/, 'bl_');
    uniques[id] = { id, name: row.name, lore: row.lore, hero, slot: pk.slot, base: row.baseItemId, baseName: baseRow(row.baseItemId).name, twoHanded: !!pk.twoHanded, power: pk.power, powerText: pk.text, affixes: 2 };
  }
}

const SET = {
  id: 'keepwarden', name: "Keepwarden's Kit",
  pieces: { head: "Keepwarden's Helm", hands: "Keepwarden's Gauntlets", feet: "Keepwarden's Boots" },
  bonuses: [
    { pieces: 2, text: '+1 Toll of Iron charge for your team.', tollCharges: 1 },
    { pieces: 3, text: '+15% damage within 15 m of your Keep.', nearKeep: { radius: 15, dmgPct: 15 } },
  ],
  affixes: 1,
};

const out = {
  _doc: 'GENERATED by tools/build-items-bl.mjs (bases from emberveil/data/items.json, unique rows from farhold/data/uniques.json, the rest Bannerline\'s own). Do not edit by hand. Read by js/sim/items.js. Affix values are percent numbers unless unit says otherwise; ranges are item level 1 and grow with item tier.',
  slots: SLOTS, slotNames: SLOT_NAMES,
  stepNames: ['Plain', 'Fine', 'Superior', 'Masterwork', 'Exquisite', 'Rare', 'Legendary'],
  stepIlvl: [1, 5, 10, 15, 20, 25, 30],
  stepRarity: ['normal', 'normal', 'normal', 'normal', 'normal', 'rare', 'legendary'],
  rarityAffixes: { normal: 0, magic: 2, rare: 3, legendary: 5 },
  bases, affixes: AFFIXES, caps: CAPS, score: { stats: SCORE, perStepPower: 1 },
  uniques, set: SET,
  heroKind: { warrior: 'heavy', pyromancer: 'cloth', ranger: 'light', druid: 'medium' },
  shop: {
    _doc: 'requisition: seconds for an item bought away from the Armory to arrive (cancelled and refunded if the hero dies). sellFactor: share of the price returned on sale. A drop is priced like the shop step it was rolled at.',
    requisition: 4, sellFactor: 0.5, bag: 12,
  },
  drops: {
    _doc: 'Chance per body killed in your field that an item drops for the defending player nearest the kill (within 20 m, else the team player with the most room). step: the drop is rolled at (highest unlocked shop step + stepOffset), min 0. rarity weights per drop. Champions give every defender a 3-card pick instead.',
    tide: 0.03, byTier: { 1: 0.015, 2: 0.03, 3: 0.05, 4: 0.08 }, stepOffset: -2,
    rarity: { normal: 60, magic: 30, rare: 9, legendary: 1 },
    pick: { cards: 3, rarity: ['magic', 'rare', 'unique'], stepOffset: -2 },
  },
  toll: { _doc: 'Toll of Iron (PLAN §4.3): any teammate rings it; every enemy unit in your field is stunned. Charges refill one at a time.', stun: 3, cooldown: 150, charges: 1 },
};
const text = JSON.stringify(out, null, 1) + '\n';
if (process.argv.includes('--check')) {
  let cur = ''; try { cur = readFileSync(OUT, 'utf8'); } catch {}
  if (cur !== text) { console.error('data/items-bl.json is out of date: run node tools/build-items-bl.mjs'); process.exit(1); }
  console.log('data/items-bl.json up to date');
} else { writeFileSync(OUT, text); console.log(`wrote ${OUT}: ${AFFIXES.length} affixes, ${Object.keys(uniques).length} uniques, 1 set`); }
