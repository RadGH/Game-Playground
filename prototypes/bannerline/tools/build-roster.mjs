#!/usr/bin/env node
// Builds data/units.json: the send roster, 12 units per race (48), from a compact table + templates.
//
//   node tools/build-roster.mjs          writes data/units.json (and the race rosters in races.json)
//   node tools/build-roster.mjs --check  exits 1 if either file is out of date
//
// THE SPAM RULES (owner, 2026-10-03): buying a send is limited ONLY by gold — no stock, no restock,
// no tier time locks. A send leaves at once (0.5 s grouping). The economy is bounded the way the old
// lane-war maps bound it: income per gold falls steeply with tier, the top two tiers add NO income
// but are the most pressure per gold (HP, damage, banners torn), and the Rising Tide ends long games.
// The owner asked to balance snowballing later: these are sensible starting numbers, not proven ones.
//
// A unit's numbers = its TIER template (cost, income per gold, HP and damage per gold, banners per
// purchase, bounty) x its ROLE (what it does on the field: melee, ranged, runner, tank, caster,
// siege, flyer) x small per-unit tweaks. HP is also scaled by (3 / speed)^0.35 (time on the road is
// defence time) and divided by the toughness its traits give (traits are paid for in base HP).
// Each tier offers 2-3 choices that differ by ROLE and COUNTER, not by stats alone.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UNITS_OUT = join(ROOT, 'data', 'units.json');
const RACES_PATH = join(ROOT, 'data', 'races.json');
const fail = m => { console.error('build-roster: ' + m); process.exit(1); };

// Gold is the only gate, so the price ladder itself makes the big units late (as in the old maps):
// a tier-4 unit is several minutes of opening income, a champion a long save.
const TIERS = {
  1: { cost: 12, incomePerGold: 0.05, hpPerGold: 10, dpsPerGold: 0.70, leak: 1, bounty: 0.15 },
  2: { cost: 45, incomePerGold: 0.04, hpPerGold: 13, dpsPerGold: 0.65, leak: 2, bounty: 0.15 },
  3: { cost: 150, incomePerGold: 0.03, hpPerGold: 16, dpsPerGold: 0.60, leak: 4, bounty: 0.15 },
  4: { cost: 450, incomePerGold: 0.02, hpPerGold: 20, dpsPerGold: 0.55, leak: 7, bounty: 0.20 },
  5: { cost: 1100, incomePerGold: 0, hpPerGold: 22, dpsPerGold: 0.52, leak: 12, bounty: 0.25 },
  6: { cost: 2400, incomePerGold: 0, hpPerGold: 24, dpsPerGold: 0.50, leak: 18, bounty: 0.30 },
};
const ROLES = {
  melee: { hp: 1.0, dps: 1.0, speed: 3.0, range: 1.5, text: 'Melee' },
  ranged: { hp: 0.72, dps: 1.25, speed: 3.0, range: 9, text: 'Ranged' },
  runner: { hp: 0.6, dps: 0.45, speed: 4.8, range: 1.4, text: 'Runner: slips past to tear banners' },
  tank: { hp: 1.35, dps: 0.6, speed: 2.4, range: 1.6, text: 'Tank: soaks the hero' },
  caster: { hp: 0.8, dps: 1.15, speed: 2.8, range: 10, text: 'Caster' },
  siege: { hp: 0.9, dps: 1.15, speed: 2.0, range: 13, text: 'Siege: long range, slow' },
  flyer: { hp: 0.8, dps: 0.9, speed: 4.0, range: 3, text: 'Flyer' },
  champion: { hp: 1.0, dps: 1.0, speed: 2.8, range: 2, text: 'Champion' },
};
// trait toughness (traits are paid for in base HP) + the player-facing sentence. Handlers: js/sim/traits.js
const TRAITS = {
  pack: { ehp: 1.0, desc: 'One purchase sends several bodies; the banners it tears are split across them.' },
  flying: { ehp: 1.05, desc: 'Flies: ignores the ford and walks over other bodies.' },
  guard: { ehp: 1.1, desc: 'Allies within 4 m behind it take 30% less pierce damage.' },
  heal: { ehp: 1.2, desc: 'Heals allies within 8 m for 3% of their health a second.' },
  hardened: { ehp: 1.08, desc: 'The first hit every 3 s deals half damage.' },
  enrage: { ehp: 1.0, desc: '+50% damage below 40% health.' },
  rise: { ehp: 1.4, desc: 'Comes back once at half health.' },
  feast: { ehp: 1.05, desc: 'Heals 30% of its health when it kills a hero or a pet.' },
  bleed: { ehp: 1.0, desc: 'Its hits make the hero Bleed (2% of health over 4 s, up to 3 stacks).' },
  pounce: { ehp: 1.0, desc: 'Leaps onto the hero from 8 m the first time it gets close.' },
  raise: { ehp: 1.25, desc: 'Raises a Shambler every 6 s.' },
  champion: { ehp: 1.15, desc: 'Escort within 10 m deals 20% more and takes less damage; announced at every gate.' },
  pack_call: { ehp: 1.2, desc: 'Howls in a Wolf Pair every 12 s.' },
  // new with the 12-unit rosters
  ward: { ehp: 1.1, desc: 'Warded: takes 30% less damage from hero skills.' },
  unstoppable: { ehp: 1.05, desc: 'Cannot be stunned, rooted, slowed, knocked back, pulled or taunted.' },
  volatile: { ehp: 1.0, desc: 'Bursts when it dies, burning heroes and pets within 3 m for a quarter of its health.' },
  regrow: { ehp: 1.15, desc: 'Regrows 1.5% of its health a second.' },
  shred: { ehp: 1.0, desc: 'Its hits strip 3 armour from the hero for 6 s (up to 5 times).' },
  split: { ehp: 1.3, desc: 'Splits into two smaller bodies when it dies.' },
  stealth: { ehp: 1.15, desc: 'Hidden: a hero only notices it within 3 m (area attacks still hit it).' },
};

// race, id, name, tier, role, armour, dmg, opts { bodies, speed, range, traits, hp, dps, look, splitInto }
// `look` is the model ref stream C's unit-looks.js resolves (Chibi 2 preset/warband + outfit, or a
// creature type with a designed bl_ variant). NEW creature looks are listed in docs/requests.md for C.
const R = [
  // ── The Freeholds: guard, heal, hardened; tough lines and patient sieges ──
  ['freeholds', 'levy', 'Levy', 1, 'melee', 'light', 'blade', { look: { chibi2: 'human', outfit: 'fighter' } }],
  ['freeholds', 'hill_slinger', 'Hill Slinger', 1, 'ranged', 'light', 'pierce', { speed: 3.2, look: { chibi2: 'halfling', outfit: 'ranger' } }],
  ['freeholds', 'fleetfoot', 'Fleetfoot', 1, 'runner', 'light', 'blade', { look: { chibi2: 'halfling', outfit: 'rogue' } }],
  ['freeholds', 'shieldbearer', 'Shieldbearer', 2, 'tank', 'heavy', 'blade', { traits: ['guard'], look: { chibi2: 'dwarf', outfit: 'knight' } }],
  ['freeholds', 'crossbowman', 'Crossbowman', 2, 'ranged', 'heavy', 'pierce', { traits: ['shred'], look: { chibi2: 'dwarf', outfit: 'tactician' } }],
  ['freeholds', 'lantern_warden', 'Lantern Warden', 2, 'melee', 'light', 'nature', { traits: ['ward'], look: { chibi2: 'human', outfit: 'oracle' } }],
  ['freeholds', 'hedge_priest', 'Hedge Priest', 3, 'caster', 'light', 'nature', { traits: ['heal'], look: { chibi2: 'human', outfit: 'cleric' } }],
  ['freeholds', 'halberdier', 'Halberdier', 3, 'melee', 'heavy', 'blade', { traits: ['unstoppable'], look: { chibi2: 'human', outfit: 'warrior' } }],
  ['freeholds', 'iron_golem', 'Iron Golem', 4, 'tank', 'heavy', 'blade', { speed: 2.2, dps: 1.6, traits: ['hardened'], look: { creature: 'golem', variant: 'bl_iron_golem' } }],
  ['freeholds', 'ballista_crew', 'Ballista Crew', 4, 'siege', 'heavy', 'pierce', { traits: ['shred'], look: { chibi2: 'dwarf', outfit: 'tinker' } }],
  ['freeholds', 'gate_warden', 'Gate Warden', 5, 'tank', 'heavy', 'blade', { dps: 1.3, traits: ['hardened', 'unstoppable'], look: { chibi2: 'dwarf', outfit: 'runesmith' } }],
  ['freeholds', 'banner_marshal', 'Banner Marshal', 6, 'champion', 'fortified', 'blade', { traits: ['champion'], look: { chibi2: 'human', outfit: 'paladin' } }],
  // ── Ashtusk: packs, enrage, many and cheap; things that blow up in the hero's face ──
  ['ashtusk', 'raider_pair', 'Ashtusk Raiders', 1, 'melee', 'light', 'blade', { bodies: 2, speed: 3.6, traits: ['pack'], look: { chibi2: 'orc', warband: 'ashtusk_raider' } }],
  ['ashtusk', 'spearthrower', 'Spearthrower', 1, 'ranged', 'light', 'pierce', { speed: 3.2, look: { chibi2: 'orc', warband: 'ashtusk_spearthrower' } }],
  ['ashtusk', 'pyre_runner', 'Pyre Runner', 1, 'runner', 'light', 'fire', { traits: ['volatile'], look: { chibi2: 'orc', outfit: 'pyromancer' } }],
  ['ashtusk', 'brute', 'Ashtusk Brute', 2, 'melee', 'hide', 'blade', { traits: ['enrage'], hp: 1.1, look: { chibi2: 'orc', warband: 'ashtusk_brute' } }],
  ['ashtusk', 'skullsplitter', 'Skullsplitter', 2, 'melee', 'hide', 'blade', { traits: ['shred'], look: { chibi2: 'orc', outfit: 'warrior' } }],
  ['ashtusk', 'sling_gang', 'Sling Gang', 2, 'ranged', 'light', 'pierce', { bodies: 3, traits: ['pack'], look: { chibi2: 'orc', warband: 'ashtusk_spearthrower' } }],
  ['ashtusk', 'bonecaller', 'Bonecaller', 3, 'caster', 'light', 'fire', { traits: ['heal'], look: { chibi2: 'orc', warband: 'ashtusk_bonecaller' } }],
  ['ashtusk', 'ironhide_charger', 'Ironhide Charger', 3, 'melee', 'hide', 'blade', { speed: 3.6, traits: ['unstoppable', 'enrage'], look: { chibi2: 'orc', outfit: 'knight' } }],
  ['ashtusk', 'tuskback', 'Tuskback', 4, 'tank', 'hide', 'blade', { speed: 3.0, dps: 1.6, traits: ['enrage'], look: { creature: 'tuskback', variant: 'bl_tuskback' } }],
  ['ashtusk', 'blood_shaman', 'Blood Shaman', 4, 'caster', 'light', 'fire', { traits: ['ward', 'heal'], look: { chibi2: 'orc', outfit: 'shaman' } }],
  ['ashtusk', 'ash_ogre', 'Ash Ogre', 5, 'tank', 'hide', 'blade', { dps: 1.4, traits: ['enrage', 'volatile'], look: { creature: 'titan', variant: 'bl_ash_ogre' } }],
  ['ashtusk', 'tuskchief', 'Tuskchief', 6, 'champion', 'fortified', 'blade', { speed: 3.2, dps: 1.1, traits: ['champion'], look: { chibi2: 'orc', warband: 'ashtusk_warchief' } }],
  // ── The Unburied: rise, raise, feast, flying; bodies that will not stay down ──
  ['unburied', 'shambler', 'Shambler', 1, 'tank', 'spectral', 'blade', { speed: 2.2, look: { chibi2: 'undead', warband: 'unburied_bonesoldier' } }],
  ['unburied', 'crow_murder', 'Crow Murder', 1, 'flyer', 'light', 'pierce', { bodies: 3, speed: 4.4, range: 5, traits: ['pack', 'flying'], look: { creature: 'crow', variant: 'bl_crow' } }],
  ['unburied', 'plague_rats', 'Plague Rats', 1, 'runner', 'hide', 'blade', { bodies: 3, traits: ['pack'], look: { creature: 'rat', variant: 'bl_plague_rat' } }],
  ['unburied', 'gravecreeper', 'Gravecreeper', 2, 'melee', 'spectral', 'blade', { traits: ['rise'], look: { chibi2: 'undead', warband: 'unburied_gravecreeper' } }],
  ['unburied', 'bone_archer', 'Bone Archer', 2, 'ranged', 'spectral', 'pierce', { look: { chibi2: 'undead', warband: 'unburied_deadeye' } }],
  ['unburied', 'wailing_shade', 'Wailing Shade', 2, 'flyer', 'spectral', 'nature', { traits: ['flying', 'ward'], look: { creature: 'wraith', variant: 'bl_wailing_shade' } }],
  ['unburied', 'ghoul', 'Ghoul', 3, 'melee', 'hide', 'blade', { speed: 3.6, dps: 1.15, traits: ['feast'], look: { creature: 'ghoul', variant: 'bl_ghoul' } }],
  ['unburied', 'carrion_hulk', 'Carrion Hulk', 3, 'tank', 'hide', 'blade', { traits: ['split'], splitInto: 'shambler', look: { creature: 'horror', variant: 'bl_carrion_hulk' } }],
  ['unburied', 'bone_colossus', 'Bone Colossus', 4, 'tank', 'heavy', 'blade', { speed: 2.0, dps: 1.4, traits: ['hardened'], look: { creature: 'bone_colossus', variant: 'bl_bone_colossus' } }],
  ['unburied', 'grave_hexer', 'Grave Hexer', 4, 'caster', 'spectral', 'fire', { traits: ['ward', 'shred'], look: { chibi2: 'undead', warband: 'unburied_mournweaver' } }],
  ['unburied', 'barrow_wight', 'Barrow Wight', 5, 'melee', 'spectral', 'fire', { traits: ['regrow', 'unstoppable'], look: { chibi2: 'undead', outfit: 'necromancer' } }],
  ['unburied', 'deathmarshal', 'Deathmarshal', 6, 'champion', 'fortified', 'fire', { speed: 2.6, traits: ['champion', 'raise'], look: { chibi2: 'undead', warband: 'unburied_deathmarshal' } }],
  // ── Thornmane: fast, packs, bleed, pounce; hunters that hide and strike ──
  ['thornmane', 'wolf_pair', 'Wolf Pair', 1, 'melee', 'hide', 'blade', { bodies: 2, speed: 4.2, traits: ['pack'], look: { creature: 'wolf', variant: 'bl_thornmane_wolf' } }],
  ['thornmane', 'tracker', 'Thornmane Tracker', 1, 'ranged', 'light', 'pierce', { speed: 3.4, range: 10, look: { chibi2: 'beast', warband: 'thornmane_tracker' } }],
  ['thornmane', 'briar_stalker', 'Briar Stalker', 1, 'runner', 'light', 'blade', { traits: ['stealth'], look: { chibi2: 'beast', warband: 'thornmane_prowler' } }],
  ['thornmane', 'mauler', 'Thornmane Mauler', 2, 'melee', 'hide', 'blade', { speed: 3.2, traits: ['bleed'], look: { chibi2: 'beast', warband: 'thornmane_mauler' } }],
  ['thornmane', 'hyena_pack', 'Hyena Pack', 2, 'runner', 'hide', 'blade', { bodies: 3, dps: 1.4, traits: ['pack', 'feast'], look: { creature: 'hyena', variant: 'bl_hyena' } }],
  ['thornmane', 'moon_seer', 'Moon Seer', 2, 'caster', 'light', 'nature', { traits: ['ward'], look: { chibi2: 'beast', warband: 'thornmane_moonseer' } }],
  ['thornmane', 'saber_cat', 'Saber Cat', 3, 'melee', 'hide', 'blade', { speed: 5.2, dps: 1.15, traits: ['pounce'], look: { creature: 'saber_cat', variant: 'bl_saber_cat' } }],
  ['thornmane', 'bear_warden', 'Bear Warden', 3, 'tank', 'hide', 'nature', { traits: ['regrow'], look: { creature: 'bear', variant: 'bl_bear_warden' } }],
  ['thornmane', 'thornback', 'Thornback', 4, 'tank', 'heavy', 'blade', { speed: 3.0, dps: 1.5, traits: ['hardened'], look: { creature: 'thornback', variant: 'bl_thornback' } }],
  ['thornmane', 'elk_charger', 'Elk Charger', 4, 'runner', 'hide', 'blade', { hp: 1.5, dps: 1.6, traits: ['unstoppable'], look: { creature: 'elk', variant: 'bl_elk_charger' } }],
  ['thornmane', 'elder_bear', 'Elder Bear', 5, 'tank', 'hide', 'blade', { dps: 1.3, traits: ['regrow', 'bleed'], look: { creature: 'bear', variant: 'bl_elder_bear' } }],
  ['thornmane', 'packlord', 'Packlord', 6, 'champion', 'fortified', 'blade', { speed: 3.6, dps: 1.1, traits: ['champion', 'pack_call'], look: { chibi2: 'beast', warband: 'thornmane_packlord' } }],
];

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;   // eslint-disable-line no-restricted-properties
const units = {};
for (const [race, id, name, tier, role, armour, dmg, o] of R) {
  if (units[id]) fail(`duplicate unit ${id}`);
  const T = TIERS[tier], Ro = ROLES[role];
  if (!T || !Ro) fail(`${id}: bad tier/role`);
  const traits = o.traits || [];
  for (const t of traits) if (!TRAITS[t]) fail(`${id}: unknown trait ${t}`);
  const bodies = o.bodies || 1, speed = o.speed || Ro.speed, range = o.range || Ro.range;
  const ehp = traits.reduce((m, t) => m * TRAITS[t].ehp, 1);
  const hp = T.cost * T.hpPerGold * Ro.hp * (o.hp || 1) * (3 / speed) ** 0.35 / ehp / bodies;
  const dps = T.cost * T.dpsPerGold * Ro.dps * (o.dps || 1) / bodies;
  units[id] = {
    race, name, tier, role, cost: T.cost, income: round(T.cost * T.incomePerGold, 2), hp: Math.round(hp), dps: round(dps),
    bodies, armour, dmg, range, speed, leak: T.leak, bounty: T.bounty, traits,
    ...(o.splitInto ? { splitInto: o.splitInto } : {}),
    model: o.look,
  };
}
for (const r of ['freeholds', 'ashtusk', 'unburied', 'thornmane']) {
  const n = Object.values(units).filter(u => u.race === r).length;
  if (n !== 12) fail(`${r} has ${n} units, wants 12`);
}
for (const u of Object.values(units)) if (u.splitInto && !units[u.splitInto]) fail(`splitInto ${u.splitInto} missing`);

const out = {
  _doc: 'GENERATED by tools/build-roster.mjs (12 units per race). Do not edit by hand: change the table or the templates in the tool and re-run it. hp/dps are PER BODY (before the race hpMult in races.json); leak (banners torn) is PER PURCHASE, split across the bodies; income is added per purchase. No stock, no restock, no time locks: gold is the only gate (owner, 2026-10-03). `role` is a UI word; `model` is the look stream C resolves (data/looks.json).',
  tiers: TIERS,
  roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.text])),
  traits: TRAITS,
  units,
};
const unitsText = JSON.stringify(out, null, 1) + '\n';
const races = JSON.parse(readFileSync(RACES_PATH, 'utf8'));
for (const r of Object.keys(races.races)) races.races[r].units = Object.keys(units).filter(id => units[id].race === r);
const racesText = JSON.stringify(races, null, 1) + '\n';

if (process.argv.includes('--check')) {
  const cur = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
  if (cur(UNITS_OUT) !== unitsText || cur(RACES_PATH) !== racesText) { console.error('units.json / races.json out of date: run node tools/build-roster.mjs'); process.exit(1); }
  console.log('roster up to date');
} else {
  writeFileSync(UNITS_OUT, unitsText); writeFileSync(RACES_PATH, racesText);
  console.log(`wrote ${Object.keys(units).length} units`);
}
