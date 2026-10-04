#!/usr/bin/env node
// Builds data/items-bl.json (the item catalogue) and data/shop.json (the Outfitter's tabs).
//
//   node tools/build-items-bl.mjs          writes both files
//   node tools/build-items-bl.mjs --check  exits 1 if either file is out of date
//
// Owner ruling (round 2, 2026-10-03): items are SIMPLE STAT ITEMS in the classic hero-arena style.
//   * 6 inventory slots with no slot types; every item takes one slot.
//   * Duplicates never merge or upgrade: each copy takes its own slot and every copy counts
//     (6 swords = 6 swords' worth of damage).
//   * Only a few powerful items carry `uniqueEquipped: true`: a second copy is refused.
//   * Tiers are by PRICE only. No affixes, no rolls, no procs, no legendaries (for now). Effects stay
//     data-driven: a stat is a key in STATS with a sim handler, a consumable effect a key in EFFECTS.
//
// Every item, stat and effect carries player-facing text (`name`, `desc`, `stats` lines) so the UI
// never has to invent wording. Names are original (no third-party terms, PLAYGROUND convention 9).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ITEMS = join(ROOT, 'data', 'items-bl.json');
const OUT_SHOP = join(ROOT, 'data', 'shop.json');
const fail = m => { console.error('build-items-bl: ' + m); process.exit(1); };

// ── stats: every key here has a handler in the sim (js/sim/items.js STAT_HANDLERS documents where) ──
// unit: 'flat' (+20), 'pct' (+12%), 'perSec' (+2.5 per second)
const STATS = {
  damage:      { label: 'damage', unit: 'flat', text: 'added to every basic attack (and to skills that scale with your weapon)' },
  attackSpeed: { label: 'attack speed', unit: 'pct', text: 'faster basic attacks' },
  critChance:  { label: 'critical chance', unit: 'pct', text: 'chance for a basic attack to deal 150% damage' },
  critDamage:  { label: 'critical damage', unit: 'pct', text: 'added to the critical multiplier' },
  lifeSteal:   { label: 'life steal', unit: 'pct', text: 'share of basic attack damage returned as health' },
  spellPower:  { label: 'spell power', unit: 'pct', text: 'more damage from your skills' },
  maxHp:       { label: 'health', unit: 'flat', text: 'maximum health' },
  armor:       { label: 'armour', unit: 'flat', text: 'less damage from every hit (armour / (armour + 40))' },
  magicResist: { label: 'magic resist', unit: 'pct', text: 'less fire and nature damage taken' },
  hpRegen:     { label: 'health regen', unit: 'perSec', text: 'health restored every second' },
  mana:        { label: 'mana', unit: 'flat', text: 'maximum mana' },
  manaRegen:   { label: 'mana regen', unit: 'perSec', text: 'mana restored every second' },
  moveSpeed:   { label: 'move speed', unit: 'pct', text: 'faster movement' },
  cdr:         { label: 'cooldown reduction', unit: 'pct', text: 'shorter skill cooldowns' },
  bountyPct:   { label: 'bounty', unit: 'pct', text: 'more gold from kills in your field' },
};

// caps on the summed stat (so a full bag of one thing cannot break a rule outright; balance later)
const CAPS = { attackSpeed: 150, critChance: 60, lifeSteal: 40, magicResist: 60, moveSpeed: 50, cdr: 40 };

// ── consumable effects: each key has a handler in js/sim/items.js USE_EFFECTS ──
const EFFECTS = {
  heal:    { text: 'Restores a share of maximum health at once' },
  mana:    { text: 'Restores a share of maximum mana at once' },
  status:  { text: 'Gives your hero a timed blessing (heroes.json statuses)' },
  barrier: { text: 'A shield that soaks damage for a while' },
  recall:  { text: 'Returns your hero to your town' },
};

const CATEGORIES = [
  { id: 'weapons', name: 'Weapons', desc: 'Damage, attack speed, critical hits and life steal.' },
  { id: 'armour', name: 'Armour', desc: 'Health, armour, magic resist and boots.' },
  { id: 'trinkets', name: 'Trinkets', desc: 'Spell power, mana and cooldowns for casters.' },
  { id: 'charms', name: 'Charms', desc: 'Small helpers: regeneration, crits, bounty.' },
  { id: 'consumables', name: 'Consumables', desc: 'Used up when spent. Each one takes a slot.' },
];

// [id, name, category, price, stats, icon, flavour, extra]
const ITEMS = [
  // weapons
  ['training_sword', 'Training Sword', 'weapons', 90, { damage: 6 }, 'sword', 'A blunt practice blade. Better than bare hands.'],
  ['hand_axe', 'Hand Axe', 'weapons', 140, { damage: 8, critChance: 3 }, 'axe', 'Light, cheap and mean.'],
  ['light_spear', 'Light Spear', 'weapons', 150, { attackSpeed: 12 }, 'spear', 'Quick thrusts, quick recovery.'],
  ['hunting_bow', 'Hunting Bow', 'weapons', 200, { damage: 6, attackSpeed: 10 }, 'bow', 'Strung for game, works on raiders too.'],
  ['iron_mace', 'Iron Mace', 'weapons', 320, { damage: 16 }, 'mace', 'A solid head on a solid haft.'],
  ['longsword', 'Longsword', 'weapons', 450, { damage: 20, critChance: 4 }, 'longsword', 'A soldier\'s blade with reach.'],
  ['war_spear', 'War Spear', 'weapons', 520, { damage: 14, attackSpeed: 18 }, 'spear', 'Balanced for a fast, steady rhythm.'],
  ['warhammer', 'Warhammer', 'weapons', 850, { damage: 34 }, 'warhammer', 'Each blow lands like a falling gate.'],
  ['bloodletter', 'Bloodletter', 'weapons', 950, { damage: 22, lifeSteal: 12 }, 'sword', 'Every cut feeds the hand that holds it.'],
  ['windstring_bow', 'Windstring Bow', 'weapons', 1100, { damage: 15, attackSpeed: 35 }, 'bow', 'Looses before the last arrow lands.'],
  ['reavers_greataxe', 'Reaver\'s Greataxe', 'weapons', 1250, { damage: 40, critChance: 10, critDamage: 25 }, 'greataxe', 'Built to end fights in one swing.'],
  ['kingsbane', 'Kingsbane', 'weapons', 2600, { damage: 75, critChance: 15, critDamage: 50, lifeSteal: 8 }, 'greatsword', 'Only one blade like it was ever forged.', { uniqueEquipped: true }],
  // armour
  ['leather_cap', 'Leather Cap', 'armour', 80, { armor: 2, maxHp: 40 }, 'leather_cap', 'Keeps the worst knocks off.'],
  ['travellers_boots', 'Traveller\'s Boots', 'armour', 120, { moveSpeed: 10 }, 'boots', 'Worn soft by many roads.'],
  ['leather_armour', 'Leather Armour', 'armour', 160, { armor: 4 }, 'leather_armour', 'Boiled hide, stitched tight.'],
  ['iron_bracers', 'Iron Bracers', 'armour', 180, { armor: 2, attackSpeed: 6 }, 'bracers', 'Guards the wrists, frees the swing.'],
  ['plate_helm', 'Plate Helm', 'armour', 380, { armor: 5, maxHp: 150 }, 'plate_helm', 'Heavy, hot and worth it.'],
  ['chainmail', 'Chainmail', 'armour', 420, { armor: 8, maxHp: 120 }, 'chainmail', 'Rings of iron that turn a blade.'],
  ['heater_shield', 'Heater Shield', 'armour', 500, { armor: 9, magicResist: 10 }, 'heater_shield', 'A plain shield, painted and proven.'],
  ['fleetfoot_boots', 'Fleetfoot Boots', 'armour', 550, { moveSpeed: 18, hpRegen: 2 }, 'boots', 'Light enough to run all day.'],
  ['warded_robe', 'Warded Robe', 'armour', 700, { magicResist: 25, mana: 80 }, 'robe', 'Stitched with signs that drink flame.'],
  ['plate_harness', 'Plate Harness', 'armour', 1000, { armor: 15, maxHp: 250 }, 'plate_armour', 'A wall you can wear.'],
  ['tower_shield', 'Tower Shield', 'armour', 1400, { armor: 18, maxHp: 300, magicResist: 10 }, 'tower_shield', 'Hide behind it and let them tire.'],
  ['bannerguard_aegis', 'Bannerguard Aegis', 'armour', 2800, { armor: 25, maxHp: 600, magicResist: 20, hpRegen: 6 }, 'kite_shield', 'Carried by the last guard of the last banner.', { uniqueEquipped: true }],
  // trinkets (casters)
  ['copper_ring', 'Copper Ring', 'trinkets', 100, { maxHp: 80 }, 'ring', 'A plain band that steadies the heart.'],
  ['sapphire_ring', 'Sapphire Ring', 'trinkets', 220, { mana: 60, manaRegen: 0.6 }, 'ring', 'Cool to the touch, always.'],
  ['apprentice_wand', 'Apprentice Wand', 'trinkets', 240, { spellPower: 10, mana: 40 }, 'wand', 'Every caster starts somewhere.'],
  ['ring_of_vigour', 'Ring of Vigour', 'trinkets', 260, { maxHp: 180, hpRegen: 1.5 }, 'ring', 'Warm as a hearth stone.'],
  ['sages_amulet', 'Sage\'s Amulet', 'trinkets', 450, { spellPower: 12, cdr: 5 }, 'amulet', 'Quickens thought between spells.'],
  ['tome_of_kindling', 'Tome of Kindling', 'trinkets', 600, { spellPower: 20 }, 'tome', 'Its pages are always slightly warm.'],
  ['shadow_hood', 'Shadow Hood', 'trinkets', 650, { critChance: 8, moveSpeed: 6 }, 'hood', 'Strike from where they are not looking.'],
  ['starweave_hat', 'Starweave Hat', 'trinkets', 900, { spellPower: 18, mana: 120, manaRegen: 1.5 }, 'wizard_hat', 'Spun from thread that remembers the night sky.'],
  ['grove_staff', 'Grove Staff', 'trinkets', 1100, { spellPower: 22, hpRegen: 4, manaRegen: 2 }, 'druid_staff', 'Still grows a leaf each spring.'],
  ['archmage_staff', 'Archmage Staff', 'trinkets', 1500, { spellPower: 40, mana: 150 }, 'staff', 'Heavy with old, patient power.'],
  ['sigil_of_the_long_night', 'Sigil of the Long Night', 'trinkets', 3000, { spellPower: 60, cdr: 20, mana: 250 }, 'amulet', 'Spells come back before the echo fades.', { uniqueEquipped: true }],
  // charms
  ['spring_charm', 'Spring Charm', 'charms', 200, { hpRegen: 3 }, 'amulet', 'A drop of clear water in glass.'],
  ['moonstone', 'Moonstone', 'charms', 220, { manaRegen: 1.2 }, 'ring', 'Glows faintly when you are tired.'],
  ['hawk_feather', 'Hawk Feather', 'charms', 250, { critChance: 6 }, 'amulet', 'Find the gap and strike it.'],
  ['gold_tooth', 'Gold Tooth', 'charms', 300, { bountyPct: 15 }, 'ring', 'Somebody\'s lucky tooth. Now yours.'],
  ['blood_charm', 'Blood Charm', 'charms', 380, { lifeSteal: 8 }, 'amulet', 'A red bead that beats like a heart.'],
  ['quicksilver_charm', 'Quicksilver Charm', 'charms', 400, { attackSpeed: 12, moveSpeed: 5 }, 'ring', 'Never sits still.'],
  ['banner_charm', 'Banner Charm', 'charms', 700, { damage: 10, armor: 4, maxHp: 100 }, 'amulet', 'A scrap of an old standard, sewn into a token.'],
  ['heart_of_the_mountain', 'Heart of the Mountain', 'charms', 2400, { maxHp: 900, hpRegen: 10 }, 'amulet', 'A stone that refuses to break, and so do you.', { uniqueEquipped: true }],
  // consumables: `use` effects, `charges` uses before the item is gone
  ['healing_draught', 'Healing Draught', 'consumables', 40, {}, 'potion', 'Drink in a pinch.', { charges: 1, use: [{ effect: 'heal', pct: 0.4 }] }],
  ['mana_tonic', 'Mana Tonic', 'consumables', 50, {}, 'potion', 'Bitter, blue and bracing.', { charges: 1, use: [{ effect: 'mana', pct: 0.5 }] }],
  ['field_salve', 'Field Salve', 'consumables', 60, {}, 'potion', 'Three dabs of slow healing.', { charges: 3, use: [{ effect: 'status', status: 'regen', seconds: 10 }] }],
  ['scroll_of_haste', 'Scroll of Haste', 'consumables', 70, {}, 'scroll', 'Read it and run.', { charges: 1, use: [{ effect: 'status', status: 'haste', seconds: 8 }] }],
  ['scroll_of_return', 'Scroll of Return', 'consumables', 80, {}, 'scroll', 'Home in a heartbeat. Handy for a quick trip to the Outfitter.', { charges: 1, use: [{ effect: 'recall' }] }],
  ['scroll_of_might', 'Scroll of Might', 'consumables', 90, {}, 'scroll', 'Words that put iron in the arm.', { charges: 1, use: [{ effect: 'status', status: 'might', seconds: 12 }] }],
  ['greater_draught', 'Greater Draught', 'consumables', 110, {}, 'potion', 'For when it has gone badly.', { charges: 1, use: [{ effect: 'heal', pct: 0.75 }] }],
  ['stoneskin_tonic', 'Stoneskin Tonic', 'consumables', 120, {}, 'potion', 'Skin like granite, briefly.', { charges: 1, use: [{ effect: 'barrier', pct: 0.25, seconds: 10 }] }],
];

const STATUS_WORD = { regen: 'Mending', haste: 'Hastened', might: 'Might' };

function statLine(stat, v) {
  const s = STATS[stat];
  if (!s) fail(`unknown stat "${stat}"`);
  if (s.unit === 'pct') return `+${v}% ${s.label}`;
  if (s.unit === 'perSec') return `+${v} ${s.label} per second`;
  return `+${v} ${s.label}`;
}

function useLine(u) {
  if (!EFFECTS[u.effect]) fail(`unknown use effect "${u.effect}"`);
  if (u.effect === 'heal') return `Use: restore ${Math.round(u.pct * 100)}% of maximum health`;
  if (u.effect === 'mana') return `Use: restore ${Math.round(u.pct * 100)}% of maximum mana`;
  if (u.effect === 'status') return `Use: ${STATUS_WORD[u.status] || u.status} for ${u.seconds} s`;
  if (u.effect === 'barrier') return `Use: a shield soaking ${Math.round(u.pct * 100)}% of maximum health for ${u.seconds} s`;
  if (u.effect === 'recall') return 'Use: return to your town';
  return 'Use';
}

function tierOf(price) { return price < 300 ? 1 : price < 800 ? 2 : price < 2000 ? 3 : 4; }

// FEEL PASS (stream A, 2026-10-03): items have to swing fights. Measured (tools/feel-report.mjs + a paid
// purchase test): at the hand-written numbers ~1,700 g of gear bought on a schedule won 50% of Veteran
// mirrors — a coin flip, because a level-12 hero already hits for ~120/s and +20 damage is a rounding
// error. The hero's power stats are scaled up and equipment prices cut to 0.35. The fair test ("skim"): from a
// scheduled minute, the seat's gold goes into savings until the price is reached, then the item lands —
// i.e. that gold went to gear instead of sends. Same weapon/armour schedule (longsword, chainmail, plate
// helm, warhammer), 48 Veteran mirrors: hand-written numbers 25% (the gear returned ~40% of what the
// same gold did as sends); stats x2.5 + price x0.4 50%, x0.35 (shipped) see the feel report; the same gear for free 81%; the same gold
// thrown away 10%. Spell power only scales skills, so spell items pay for the Pyromancer (~50%) and
// barely for the Engineer / Druid, whose power is in turrets and pets: they should buy weapons/armour. Percent stats grow less (they hit caps), and economy / movement /
// cooldown stats not at all. The rows below stay at their original hand-written values; the scale is
// applied here so a later tuning pass changes three numbers, not ninety.
const STAT_SCALE = { damage: 2.5, maxHp: 2.5, armor: 2.5, hpRegen: 2.5, spellPower: 2.5, mana: 2.5, manaRegen: 2.5,
  attackSpeed: 1.5, critChance: 1.5, critDamage: 1.5, lifeSteal: 1.5, magicResist: 1.5 };
const PRICE_SCALE = 0.35;  // equipment only; consumables keep their price
const scaleStat = (k, v) => { const m = STAT_SCALE[k] || 1; return m === 1 ? v : (Math.abs(v) < 5 ? Math.round(v * m * 10) / 10 : Math.round(v * m)); };

const items = {};
for (const [id, name, cat, price0, stats0, icon, flavour, extra = {}] of ITEMS) {
  const stats = extra.use ? stats0 : Object.fromEntries(Object.entries(stats0).map(([k, v]) => [k, scaleStat(k, v)]));
  const price = extra.use ? price0 : Math.round(price0 * PRICE_SCALE / 5) * 5;
  if (items[id]) fail(`duplicate item "${id}"`);
  if (!CATEGORIES.find(c => c.id === cat)) fail(`unknown category "${cat}" on ${id}`);
  const lines = Object.entries(stats).map(([k, v]) => statLine(k, v));
  if (extra.use) for (const u of extra.use) lines.push(useLine(u));
  if (extra.charges > 1) lines.push(`${extra.charges} uses`);
  if (extra.uniqueEquipped) lines.push('Unique: you can carry only one');
  const row = {
    id, name, category: cat, tier: tierOf(price), price, icon,
    desc: flavour, stats, statLines: lines,
  };
  if (extra.uniqueEquipped) row.uniqueEquipped = true;
  if (extra.use) { row.consumable = true; row.charges = extra.charges || 1; row.use = extra.use; }
  items[id] = row;
}

const itemsJson = {
  _doc: 'GENERATED by tools/build-items-bl.mjs — edit the tool, not this file. Read by js/sim/items.js. Simple stat items (owner round 2): 6 inventory slots with no slot types; each item takes one slot; duplicates never merge and every copy counts; `uniqueEquipped` items refuse a second copy; tiers by price only. `stats` keys are in `statDefs` (each has a sim handler), consumable `use` effects in `effectDefs`. `statLines` is the ready-made tooltip text. `caps` clamp the summed stat. `rules.sellFactor` = share of the price paid back on sale (anywhere in shop range). `drops`: a kill in your field may hand a defender a consumable; a champion kill hands each defender a random item up to `champion.maxPrice` (sold for gold when there is no free slot). `toll` is read by the `toll` command (stream A).',
  rules: { slots: 6, sellFactor: 0.5, useCooldown: 1 },
  statDefs: STATS,
  effectDefs: EFFECTS,
  caps: CAPS,
  categories: CATEGORIES,
  items,
  drops: { minTier: 3, chance: 0.06, pool: ['healing_draught', 'mana_tonic', 'field_salve'], champion: { maxPrice: 600 } },
  toll: { charges: 1, cooldown: 90, stun: 2.5 },
};

const shopJson = {
  _doc: 'GENERATED by tools/build-items-bl.mjs. The Outfitter\'s tabs: each tab lists item ids (data/items-bl.json) in price order, as a grid the UI lays out `columns` wide. Buying needs the hero inside the Outfitter\'s radius (data/buildings.json).',
  columns: 4,
  tabs: CATEGORIES.map(c => ({ id: c.id, name: c.name, desc: c.desc, items: Object.values(items).filter(i => i.category === c.id).sort((a, b) => a.price - b.price || (a.id < b.id ? -1 : 1)).map(i => i.id) })),
};

const outI = JSON.stringify(itemsJson, null, 1) + '\n';
const outS = JSON.stringify(shopJson, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const same = (p, s) => { try { return readFileSync(p, 'utf8') === s; } catch { return false; } };
  if (!same(OUT_ITEMS, outI) || !same(OUT_SHOP, outS)) fail('data/items-bl.json or data/shop.json is out of date: run node tools/build-items-bl.mjs');
  console.log('build-items-bl: up to date');
} else {
  writeFileSync(OUT_ITEMS, outI);
  writeFileSync(OUT_SHOP, outS);
  console.log(`build-items-bl: wrote ${Object.keys(items).length} items, ${CATEGORIES.length} tabs`);
}
