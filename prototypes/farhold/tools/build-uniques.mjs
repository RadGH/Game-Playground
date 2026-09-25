// Farhold — round 23: build data/uniques.json from the rows below.
//
//   node prototypes/farhold/tools/build-uniques.mjs
//
// The rows are the design: which type, which base, which act, the name, the power and the lore.
// The affix NUMBERS are worked out here from the act and the type, by one set of formulas, so a
// unique's stats sit on the same curve as every other unique of its act instead of being 184
// hand-typed guesses. Edit a row and re-run; the JSON is the output, not the source.
//
// Units are Farhold's engine units (js/affixes.js ENGINE_UNIT): critChance, critDamage, lifeSteal,
// block_chance are percentage points; spellPower is a share; everything else here is flat.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));

const qualityFor = act => (act <= 2 ? 'high' : act <= 4 ? 'elite' : 'exotic');
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

/** The attribute a weapon base scales with, read the way js/rpg.js `derive` reads it. */
function attrOf(baseKey) {
  const b = items.weaponBases[baseKey];
  if (!b) return 'str';
  if (baseKey === 'quarterstaff') return 'str';           // attuneWeapon files it `light`, it swings on dex
  const cat = b.weaponCategory;
  return cat === 'magic' ? 'int' : cat === 'heavy' ? 'str' : 'dex';
}

/** Secondary stats a weapon can carry, as [stat, fixed(act), random range(act)]. */
const WEAPON_EXTRA = {
  crit: act => ['critChance', r1(3 + act)],
  dmg: act => ['dmg', Math.round(2 + 2 * act)],
  hp: act => ['hp', Math.round(12 + 14 * act)],
  critDmg: act => ['critDamage', Math.round(8 + 6 * act)],
  leech: act => ['lifeSteal', r1(2 + act * 0.8)],
  speed: act => ['initiative', Math.ceil(act / 2) + 1],
  armor: act => ['armor', Math.round(3 + 2 * act)],
  sp: act => ['spellPower', r2(0.06 + 0.025 * act)],
  mp: act => ['mp', Math.round(10 + 8 * act)],
  regen: act => ['mana_regen', r1(0.8 + 0.4 * act)],
};
const WEAPON_ROLLS = {
  crit: act => ({ stat: 'critChance', min: r1(2 + act * 0.5), max: r1(4 + act) }),
  critDmg: act => ({ stat: 'critDamage', min: Math.round(5 + 4 * act), max: Math.round(10 + 7 * act) }),
  dmg: act => ({ stat: 'dmg', min: Math.round(1 + act), max: Math.round(3 + 2.2 * act) }),
  hp: act => ({ stat: 'hp', min: Math.round(8 + 8 * act), max: Math.round(16 + 14 * act) }),
  sp: act => ({ stat: 'spellPower', min: r2(0.03 + 0.015 * act), max: r2(0.06 + 0.03 * act) }),
};

// cycled through so neighbouring uniques do not all carry the same pair
const STEEL_CYCLE = [['crit', 'critDmg'], ['dmg', 'hp'], ['critDmg', 'crit'], ['leech', 'dmg'], ['speed', 'critDmg'], ['hp', 'crit']];
const CASTER_CYCLE = [['sp', 'crit'], ['mp', 'critDmg'], ['sp', 'hp'], ['regen', 'sp'], ['crit', 'sp']];

function weaponAffixes(baseKey, act, i, { caster = false, extra = null, brand = null } = {}) {
  const attr = attrOf(baseKey);
  const [second, roll] = extra || (caster ? CASTER_CYCLE : STEEL_CYCLE)[i % (caster ? CASTER_CYCLE.length : STEEL_CYCLE.length)];
  const fixed = [{ stat: attr, value: Math.round(4 + 2.4 * act) }];
  const [s, v] = WEAPON_EXTRA[second](act);
  fixed.push({ stat: s, value: v });
  if (brand) fixed.push({ stat: brand, value: r2(0.15 + 0.03 * act) });
  const random = [WEAPON_ROLLS[roll] ? WEAPON_ROLLS[roll](act) : WEAPON_ROLLS.crit(act)];
  // a roll on the same stat as a fixed one would print as two lines of the same thing
  if (random[0].stat === s) random[0] = (caster ? WEAPON_ROLLS.hp : WEAPON_ROLLS.critDmg)(act);
  return { fixedAffixes: fixed, randomAffixes: random };
}

const TIER_ARMOR = { cloth: 2, light: 3, medium: 4, heavy: 5 };
const TIER_ATTR = { cloth: 'int', light: 'dex', medium: 'con', heavy: 'str' };
function armourAffixes(baseKey, act, i) {
  const b = items.armorBases[baseKey];
  const tier = b.tier;
  const fixed = [
    { stat: 'armor', value: Math.round(TIER_ARMOR[tier] * (1 + 0.5 * act)) },
    { stat: TIER_ATTR[tier], value: Math.round(3 + 2 * act) },
    i % 2 ? { stat: 'hp', value: Math.round(10 + 12 * act) } : { stat: 'con', value: Math.round(2 + 1.5 * act) },
  ];
  // never two rows of the same stat
  if (fixed[1].stat === fixed[2].stat) fixed[2] = { stat: 'hp', value: Math.round(10 + 12 * act) };
  const random = tier === 'cloth'
    ? [{ stat: 'magicResist', min: Math.round(3 + 2 * act), max: Math.round(6 + 4 * act) }]
    : tier === 'light'
      ? [{ stat: 'critChance', min: r1(1 + act * 0.4), max: r1(2 + act * 0.8) }]
      : [{ stat: 'hpRegen', min: r1(0.5 + 0.3 * act), max: r1(1 + 0.6 * act) }];
  return { fixedAffixes: fixed, randomAffixes: random };
}

function otherAffixes(kind, act, i) {
  const n = v => Math.round(v);
  switch (kind) {
    case 'shield': return {
      fixedAffixes: [{ stat: 'con', value: n(4 + 2 * act) }, { stat: 'block_power', value: n(6 + 5 * act) }, { stat: 'block_chance', value: n(4 + act) }],
      randomAffixes: [{ stat: 'armor', min: n(3 + 2 * act), max: n(6 + 3 * act) }],
    };
    case 'ward': return {
      fixedAffixes: [{ stat: 'int', value: n(4 + 2 * act) }, { stat: 'barrier', value: n(8 + 7 * act) }, { stat: 'barrierRegen', value: n(1 + act) }],
      randomAffixes: [{ stat: 'magicResist', min: n(4 + 2 * act), max: n(8 + 4 * act) }],
    };
    case 'quiver': return {
      fixedAffixes: [{ stat: 'dex', value: n(4 + 2.4 * act) }, { stat: 'cond_quiverDamage', value: n(2 + 1.5 * act) }],
      randomAffixes: [{ stat: 'critChance', min: r1(2 + 0.5 * act), max: r1(4 + act) }],
    };
    case 'ring': return {
      fixedAffixes: i % 2
        ? [{ stat: 'str', value: n(3 + 2 * act) }, { stat: 'dex', value: n(3 + 2 * act) }]
        : [{ stat: 'int', value: n(3 + 2 * act) }, { stat: 'con', value: n(3 + 2 * act) }],
      randomAffixes: [{ stat: 'critChance', min: r1(1 + 0.5 * act), max: r1(2 + act) }],
    };
    case 'necklace': return {
      fixedAffixes: [{ stat: 'con', value: n(3 + 2 * act) }, { stat: 'hp', value: n(10 + 12 * act) }],
      randomAffixes: [{ stat: 'spellPower', min: r2(0.03 + 0.015 * act), max: r2(0.06 + 0.03 * act) }],
    };
    case 'mount': return {
      fixedAffixes: [{ stat: 'con', value: n(3 + 2 * act) }, { stat: 'cond_mountStamina', value: n(4 + 2 * act) }],
      randomAffixes: [{ stat: 'cond_mountSlope', min: r2(0.1 + 0.02 * act), max: r2(0.2 + 0.03 * act) }],
    };
    case 'light': return {
      fixedAffixes: [{ stat: 'cond_lightRange', value: n(8 + 5 * act) }, { stat: 'hp', value: n(8 + 10 * act) }],
      randomAffixes: [{ stat: 'magicResist', min: n(3 + 2 * act), max: n(6 + 4 * act) }],
    };
    case 'tool': return {
      fixedAffixes: [{ stat: 'cond_toolYield', value: r2(0.08 + 0.03 * act) }, { stat: 'cond_toolReach', value: r1(0.4 + 0.2 * act) }],
      randomAffixes: [{ stat: 'cond_toolSpeed', min: r2(0.06 + 0.02 * act), max: r2(0.12 + 0.03 * act) }],
    };
    default: throw new Error('no affix profile for ' + kind);
  }
}

// ---------------------------------------------------------------------------- the rows
//
// [type, base, act, name, power, lore, opts]
// opts: element (casters), wand (WAND_BEHAVIOURS key), spell (STAFF_SPELLS key),
//       brand (a cond_brand* stat added as a fixed affix), extra ([fixed, roll] pair override)

const STEEL = [
  // dagger
  ['dagger', 'dagger', 1, 'Nettlepin', 'venom_stack', 'A sliver of green bronze. The wound it leaves never quite closes, and neither does the next one.'],
  ['dagger', 'tithe_dagger', 3, "Widow's Tithe", 'cull', 'It takes only what is almost gone already. The collectors of the old church called that mercy.'],
  ['dagger', 'dagger', 4, 'The Quiet Second', 'echo_strike', 'Every cut is answered by a second one nobody saw coming.'],
  ['dagger', 'dragonfang_dagger', 6, 'Emberfang', 'hemorrhage', 'Pulled from the jaw of something that burned. The bleeding it starts runs faster the more its victim runs.'],
  // sword
  ['sword', 'sword', 1, 'Oathcutter', 'battle_trance', 'Swung the same way five times, it remembers the promise it was forged to keep.'],
  ['sword', 'forager_blade', 2, 'Hedgewarden', 'crit_heal', 'A hedge-knight\'s blade, notched and resharpened a hundred times. Every good cut feeds the hand that holds it.'],
  ['sword', 'hunters_edge', 4, 'Carrion Oath', 'rot_spread', 'Dipped in the grave-water of a plague town. What it kills does not rot alone.'],
  ['sword', 'dragonfang_sword', 6, 'Pyrewright', 'fire_trail', 'Every stroke leaves the grass alight behind it.'],
  // longsword
  ['longsword', 'longsword', 2, 'Vigil of Harrow', 'second_wind', 'Carried by the last watch of Harrow Keep, who held the gate long after they should have fallen.'],
  ['longsword', 'longsword', 3, 'Stormwake', 'chain_lightning', 'Thunder follows it out of the scabbard and finds everyone standing near.'],
  ['longsword', 'longsword', 5, 'Crescent Hymn', 'crescendo', 'A duelling blade that sings louder the longer the fight goes on, until the last note breaks something.'],
  ['longsword', 'longsword', 6, "Tyrant's End", 'nemesis_hunter', 'Forged to end one crowned butcher. It never stopped looking for the next.'],
  // rapier
  ['rapier', 'rapier', 1, 'Needle of Vess', 'stillness', 'A duellist\'s needle. Plant your feet, breathe once, and it finds the gap.'],
  ['rapier', 'rapier', 3, 'Quicksilver Pact', 'kill_frenzy', 'Its bearer grows faster with every body, until the blade seems to move on its own.'],
  ['rapier', 'rapier', 4, 'Riposte of Glass', 'glass_heart', 'Thin as a vow and as easily broken. It strikes like a hammer and leaves you nothing to hide behind.'],
  ['rapier', 'rapier', 6, 'The Last Courtesy', 'stride', 'A travelling blade that fights best on the move, and never where it was expected.'],
  // sabre
  ['sabre', 'rimecut_sabre', 2, 'Winterbite', 'frostbite', 'It numbs before it cuts. Stand against it long enough and you stop moving at all.'],
  ['sabre', 'obsidian_scimitar', 3, 'Prism Dancer', 'alternate_elements', 'Three flames were quenched in the glass: one red, one pale, and one that crackled.'],
  ['sabre', 'rimecut_sabre', 5, 'Shiverlight', 'shatter', 'Its cold edge breaks whatever has already frozen.'],
  ['sabre', 'obsidian_scimitar', 6, 'Duskreaver', 'doom', 'Obsidian cut from beneath a dead temple. It marks what it cuts, and comes back for the rest.'],
  // axe
  ['axe', 'battleaxe', 1, "Woodsman's Grudge", 'crit_bleed_5', 'It felled a forest for a lord who never paid. It has been collecting ever since.'],
  ['axe', 'battleaxe', 3, "Reaver's Due", 'blood_price', 'It drinks from both ends of the haft.'],
  ['axe', 'battleaxe', 4, 'Hearthsplitter', 'third_cleave', 'A clan axe, swung in a circle at weddings and funerals alike.'],
  ['axe', 'battleaxe', 6, 'Gorewind', 'vampire_kill', 'Every life it ends pours a little back into the arm that swung it.'],
  // greataxe
  ['greataxe', 'axe2h', 2, 'Rendmaw', 'quake_slam', 'Heavy enough that every third swing ends in the dirt, and the dirt ends up everywhere.'],
  ['greataxe', 'breakers_pick', 3, 'Quarryhound', 'opportunist', 'A mine-breaker\'s pick, happiest against anything that cannot get out of the way.'],
  ['greataxe', 'axe2h', 5, 'Greymarch Headsman', 'cull', 'The headsman of Greymarch never needed a second stroke.'],
  ['greataxe', 'axe2h', 6, 'Worldrender', 'dragon_fury_breath', 'Tempered in a dragon\'s last breath. Every death it deals exhales the forge again.'],
  // mace
  ['mace', 'lantern_mace', 1, 'Candlemace', 'pyre_aura', 'Its head still holds the coals of the shrine it was stolen from.'],
  ['mace', 'iron_mace', 3, "Penitent's Weight", 'thornmail', 'Carried by the penitent brothers, who held that every blow taken should be returned.'],
  ['mace', 'iron_mace', 4, 'Bellbreaker', 'resonance', 'It rings like a struck bell, and louder for every hurt already on its target.'],
  ['mace', 'iron_mace', 6, "Saint Ossery's Knuckle", 'crit_ward', 'A relic-mace of bone and silver. It shields the faithful with the pain of the faithless.'],
  // hammer
  ['hammer', 'hammer', 2, 'Anvilheart', 'quake_slam', 'A smith\'s hammer that forgot what it was for. The ground remembers.'],
  ['hammer', 'hammer', 3, 'Mountainsong', 'echo_strike', 'Every blow echoes off the far hills and comes back.'],
  ['hammer', 'dawnwarden_hammer', 4, 'First Light Maul', 'searing_light', 'It was lit at the first sunrise after the long night, and it has not gone out.'],
  ['hammer', 'drakehammer', 6, 'Wyrmknell', 'third_cleave', 'Swung by the dragon-callers in wide rings to clear the ground about them.'],
  // warhammer
  ['warhammer', 'warhammer', 2, 'Gatecrusher', 'critical_armorpen', 'It has opened more castle doors than any key.'],
  ['warhammer', 'warhammer', 3, 'Grievance', 'rally_on_kill', 'Every name its bearer ever cursed is scratched into the haft.'],
  ['warhammer', 'warhammer', 5, 'Thunderhead', 'static_charge', 'The storm it was forged in never finished. Strike one thing and the rest of the sky comes down.', { brand: 'cond_brandLightning' }],
  ['warhammer', 'warhammer', 6, 'Doomsday Bell', 'doom', 'They rang it for the ends of cities. It still tolls once for every life it takes.'],
  // greatsword
  ['greatsword', 'greatsword', 2, 'The Long Scythe', 'third_cleave', 'Too long to swing any way but around.'],
  ['greatsword', 'sword2h', 3, 'Grave Harvest', 'curse_spreads', 'The blade of the plague-reapers. What it cuts down, it passes on.'],
  ['greatsword', 'voidsteel_greatsword', 4, 'Hollowing', 'mana_burn', 'Voidsteel drinks the will of its bearer and pays it out in blood.'],
  ['greatsword', 'dragonfang_greatsword', 6, "Emberlord's Reckoning", 'pyre_aura', 'Hold it close and the air itself begins to burn.'],
  // halberd
  ['halberd', 'halberd', 2, 'Longwatch Pike', 'frost_skin', 'Northern sentries set it in the snow and let the cold do the rest.'],
  ['halberd', 'halberd', 3, 'Hookjaw', 'opportunist', 'The hook drags a fleeing foe back onto the blade.'],
  ['halberd', 'halberd', 5, "The Sentinel's Arc", 'crescendo', 'A gate-guard\'s polearm. The longer the siege, the harder it answers.'],
  ['halberd', 'halberd', 6, 'Starfall Glaive', 'chain_lightning', 'A shard of a fallen star is bound into the spike. It still wants to go back up.'],
  // spear
  ['spear', 'spear', 1, 'Boarsplitter', 'hemorrhage', 'A hunting spear. Anything that runs from it bleeds harder.'],
  ['spear', 'spear', 3, 'Tidecaller', 'frostbite', 'Its blade was quenched in a northern sea that never thaws.'],
  ['spear', 'spear', 4, "Serpent's Reach", 'venom_stack', 'The shaft is carved as a snake. The point is its only tooth, and it is enough.'],
  ['spear', 'spear', 6, 'Skyrend', 'stride', 'A cavalry lance cut down for the foot. It still wants to be moving.'],
  // quarterstaff
  ['quarterstaff', 'quarterstaff', 1, 'Pilgrim Oak', 'crit_heal', 'Cut from the tree at the crossroads shrine. Travellers swear it mends the walker.'],
  ['quarterstaff', 'quarterstaff', 3, 'Monsoon Rod', 'echo_strike', 'Every blow lands twice, like rain on a roof.'],
  ['quarterstaff', 'quarterstaff', 4, 'Nine Winds', 'battle_trance', 'A monastery staff. Its drills are counted in fives, and the fifth never misses.'],
  ['quarterstaff', 'quarterstaff', 6, 'The Unbent Reed', 'retaliate_nova', 'Strike its bearer and the winter it was cut in strikes back.'],
  // bow
  ['bow', 'bow', 1, 'Hawkfeather', 'ricochet', 'Its arrows never seem to stop where they should.'],
  ['bow', 'roadwarden_bow', 3, "Warden's Volley", 'fourth_volley', 'The road wardens drill in fours. The fourth draw is never alone.'],
  ['bow', 'starwake_bow', 5, "Comet's Wake", 'resonance', 'Strung with a thread of cold light, it hits hardest where the hurt is already deep.'],
  ['bow', 'wyrmscale_bow', 6, 'Ashstring', 'kindling', 'The string was plaited from a drake\'s tendon. Its arrows keep burning after they land.'],
  // shortbow
  ['shortbow', 'shortbow', 1, 'Skipping Stone', 'ricochet', 'A child\'s first bow, made by someone who meant the child to live.'],
  ['shortbow', 'shortbow', 2, "Wasp's Nest", 'venom_stack', 'Every shaft is fletched with the wings of something that stings.'],
  ['shortbow', 'shortbow', 4, 'Quickdraw Oath', 'kill_frenzy', 'Sworn by the border scouts: never nock slower than the last one fell.'],
  ['shortbow', 'shortbow', 6, 'Galewhisper', 'blood_price', 'It asks a little of your blood with every draw, and the wind carries the rest.'],
  // crossbow
  ['crossbow', 'crossbow', 2, 'Bolt of Judgement', 'cull', 'A magistrate\'s arbalest. Its sentence is always final.'],
  ['crossbow', 'crossbow', 3, 'Frostlatch', 'frostbite', 'The mechanism is packed with glacier ice that never melts.'],
  ['crossbow', 'stormpin_crossbow', 4, 'Crackling Arbalest', 'static_charge', 'The pins sing with a storm that was nailed down and never forgave it.'],
  ['crossbow', 'crossbow', 6, 'Ironhail', 'fourth_volley', 'A siege crossbow with four grooves where one should be.'],
  // javelin
  ['javelin', 'javelin', 1, "Hunter's Throw", 'hemorrhage', 'Barbed and cruel. What it strikes is best left to run itself out.'],
  ['javelin', 'pathfinder_javelin', 3, 'Longstrider', 'ricochet', 'A scout\'s javelin that goes where it likes and comes to no harm.'],
  ['javelin', 'javelin', 4, "Viper's Tongue", 'venom_stack', 'Its point is hollow and never quite empty.'],
  ['javelin', 'watchfire_glaive', 6, 'Noon Spear', 'chain_lightning', 'Thrown at the height of a summer storm, it came back full of it.'],
];

const CASTER = [
  // wand
  ['wand', 'wand', 1, 'Cinderquill', 'kindling', 'A burnt feather set in a tin ferrule. It writes in fire, and the words keep burning.', { element: 'fire', wand: 'plain' }],
  ['wand', 'dragontooth_wand', 5, 'Ashmouth', 'split_bolt', 'A drake\'s fang, still hot. Every bolt it spits breaks apart in the air.', { element: 'fire', wand: 'burst' }],
  ['wand', 'wand', 2, 'Rimeglass Wand', 'frostbite', 'A rod of clear ice that has never melted. Its cold gathers on whatever it strikes.', { element: 'ice', wand: 'plain' }],
  ['wand', 'dragontooth_wand', 5, 'Hailcaller', 'twin_bolt', 'Where one hailstone falls, another follows.', { element: 'ice', wand: 'split' }],
  ['wand', 'wand', 1, 'Sparkthorn', 'static_charge', 'A thorn from a lightning-struck briar. The charge never left it.', { element: 'lightning', wand: 'chain' }],
  ['wand', 'wand', 4, 'Tempest Needle', 'chain_lightning', 'Thin as a sewing needle. The storm it carries is not.', { element: 'lightning', wand: 'seeking' }],
  ['wand', 'wand', 2, 'Blightwhistle', 'venom_stack', 'A marsh-reed pipe. Its song is the last thing a fever hears.', { element: 'poison', wand: 'split' }],
  ['wand', 'wand', 5, 'Mourning Reed', 'rot_spread', 'Cut from the banks of a river that carried a plague downstream.', { element: 'poison', wand: 'burst' }],
  ['wand', 'wand', 3, 'Gloamfinger', 'doom', 'The bone of a hanged man\'s finger. It points, and it remembers.', { element: 'shadow', wand: 'seeking' }],
  ['wand', 'wand', 6, 'Hollow Wand', 'mana_burn', 'There is nothing inside it, and it hungers to be filled.', { element: 'shadow', wand: 'heavy' }],
  ['wand', 'wand', 1, 'Starpin', 'gravity_bolt', 'A pin from a broken orrery. Everything nearby falls toward where it lands.', { element: 'arcane', wand: 'burst' }],
  ['wand', 'wand', 4, 'Echoing Tine', 'twin_bolt', 'A tuning fork that never stops ringing. Every bolt has its answer.', { element: 'arcane', wand: 'plain' }],
  // staff
  ['staff', 'staff', 2, 'Sootcrown', 'overload', 'A charred crook topped with a crown of cinders. Every fourth spell it casts comes out enormous.', { element: 'fire', spell: 'nova' }],
  ['staff', 'dragonbone_staff', 5, 'Brandstaff of Kell', 'kindling', 'The pyre-priests of Kell carried it to light their dead. The fire it sets climbs.', { element: 'fire', spell: 'cone' }],
  ['staff', 'staff', 3, "Glacier's Spine", 'shatter', 'A length of blue ice from the heart of a glacier. What it chills, it breaks.', { element: 'ice', spell: 'nova' }],
  ['staff', 'abyssal_rod', 6, 'Rimefold Crook', 'frostbite', 'A shepherd\'s crook from the high passes. The flock it keeps does not move.', { element: 'ice', spell: 'shard' }],
  ['staff', 'staff', 2, "Stormherd's Crook", 'static_charge', 'The storm-herders drove lightning across the plains with this.', { element: 'lightning', spell: 'arc' }],
  ['staff', 'dragonbone_staff', 5, "Skyfather's Rod", 'overload', 'The old sky-god\'s rod, found in a crater. Every fourth word it speaks is thunder.', { element: 'lightning', spell: 'nova' }],
  ['staff', 'staff', 1, 'Rotwood Staff', 'rot_spread', 'Cut from a tree that grew in a mass grave. It spreads what it feeds on.', { element: 'poison', spell: 'ground' }],
  ['staff', 'bramble_staff', 4, "Bog Mother's Cane", 'venom_stack', 'The marsh-witch walked with it for three hundred years. It kept her company.', { element: 'poison', spell: 'lob' }],
  ['staff', 'staff', 3, 'Nightspine', 'doom', 'The spine of something that should not have had one. It marks, and waits.', { element: 'shadow', spell: 'nova' }],
  ['staff', 'abyssal_rod', 6, 'Graveshroud Staff', 'curse_spreads', 'Wrapped in burial linen that never rots. Whatever it curses, the curse remembers.', { element: 'shadow', spell: 'ground' }],
  ['staff', 'staff', 2, 'Loomstaff', 'gravity_bolt', 'A weaver\'s beam. Every thread in the field is pulled toward where it strikes.', { element: 'arcane', spell: 'lob' }],
  ['staff', 'dragonbone_staff', 5, "Starwright's Rod", 'overload', 'The star-smiths measured the sky with it. Every fourth measure spills over.', { element: 'arcane', spell: 'lob' }],
  // scepter
  ['scepter', 'scepter', 2, 'Coalcrown Sceptre', 'pyre_aura', 'The regalia of a burned court. Its heat still clears a path through the crowd.', { element: 'fire' }],
  ['scepter', 'scepter', 5, 'Ember Regent', 'fire_trail', 'Wherever the regent walked, the floor was left scorched.', { element: 'fire' }],
  ['scepter', 'scepter', 3, 'Frostmantle Sceptre', 'frost_skin', 'The ice-queens of the north never needed guards. Anyone who touched them froze.', { element: 'ice' }],
  ['scepter', 'scepter', 6, 'Pale Monarch', 'shatter', 'A crown of frost on a rod of bone. It rules over what has stopped moving.', { element: 'ice' }],
  ['scepter', 'scepter', 2, 'Thunder Regalia', 'chain_lightning', 'A storm-lord\'s sceptre. Its judgement falls on everyone nearby.', { element: 'lightning' }],
  ['scepter', 'scepter', 5, 'Voltaic Sceptre', 'static_charge', 'Copper and amber, humming. Every shocked thing it touches passes the charge along.', { element: 'lightning' }],
  ['scepter', 'scepter', 1, "Marsh King's Sceptre", 'venom_stack', 'The mire-king\'s rod of office. His subjects died slowly, and in order.', { element: 'poison' }],
  ['scepter', 'scepter', 4, "Plaguewright's Rod", 'rot_spread', 'An instrument of the plague-doctors. It was never meant to cure.', { element: 'poison' }],
  ['scepter', 'gravebound_scepter', 3, 'Duskcrown', 'doom', 'The last crown of a kingdom that ended at dusk. It passes that ending on.', { element: 'shadow' }],
  ['scepter', 'gravebound_scepter', 6, 'Gravebound Rule', 'vampire_kill', 'The dead king still holds court through it, and still collects his tithe.', { element: 'shadow' }],
  ['scepter', 'scepter', 2, 'Orrery Sceptre', 'resonance', 'A little clockwork sky turns in its head. It finds the weakness in every wound.', { element: 'arcane' }],
  ['scepter', 'scepter', 5, 'Sceptre of the Seventh Sphere', 'overflow', 'It hums with a sphere of the heavens nobody has named. It is never empty.', { element: 'arcane' }],
  // orb
  ['orb', 'orb', 2, 'Heart of the Kiln', 'crit_ward', 'A glass bead from the kiln that fired the first city. It shields whoever holds it.', { element: 'fire' }],
  ['orb', 'orb', 5, 'Sunstone Orb', 'pyre_aura', 'A pebble of solid sunlight. Its heat will not stay in your hand.', { element: 'fire' }],
  ['orb', 'orb', 1, 'Frozen Tear', 'frost_skin', 'A widow\'s tear that froze on her cheek. It keeps everyone at a distance.', { element: 'ice' }],
  ['orb', 'orb', 4, 'Stillwater Globe', 'stillness', 'Hold it without moving and you can see the whole fight in it.', { element: 'ice' }],
  ['orb', 'orb', 3, 'Captured Storm', 'chain_lightning', 'A thunderhead in a jar. It is not happy about it.', { element: 'lightning' }],
  ['orb', 'orb', 6, 'Thunderegg', 'static_charge', 'Something is growing inside it, and it crackles.', { element: 'lightning' }],
  ['orb', 'orb', 2, 'Blightpearl', 'rot_spread', 'Taken from an oyster in a poisoned bay. It has been spreading ever since.', { element: 'poison' }],
  ['orb', 'orb', 5, 'Witchbile Orb', 'venom_stack', 'A gall-stone from a marsh-witch. It weeps green.', { element: 'poison' }],
  ['orb', 'orb', 3, 'Eye of the Hollow', 'glass_heart', 'It looks back. What it sees in you, it takes.', { element: 'shadow' }],
  ['orb', 'orb', 6, 'Nightglass', 'doom', 'Black glass from the night the moon went out. It remembers every hurt.', { element: 'shadow' }],
  ['orb', 'orb', 1, 'Mirrorsphere', 'barrier_burst', 'A sphere of mirrors that reflects the world a moment late. Break its guard and it breaks you back.', { element: 'arcane' }],
  ['orb', 'orb', 4, 'Worldseed', 'overflow', 'Something the size of a world is folded up inside it, and it is always full.', { element: 'arcane' }],
  // tome
  ['tome', 'tome', 1, 'Book of Cinders', 'burn_extend', 'The pages are ash. The words still burn.', { element: 'fire' }],
  ['tome', 'tome', 4, 'The Ashen Codex', 'kindling', 'A fire-priest\'s prayer book, every psalm a little hotter than the last.', { element: 'fire' }],
  ['tome', 'tome', 2, 'Frostbound Primer', 'shatter', 'A schoolbook for the ice-schools. Its first lesson is how cold things break.', { element: 'ice' }],
  ['tome', 'tome', 5, 'Hymnal of the Long Winter', 'frostbite', 'Sung for a hundred years of winter. Everyone who heard it stopped moving.', { element: 'ice' }],
  ['tome', 'tome', 3, 'Stormscript', 'chain_lightning', 'Written by lightning on the pages of a burnt library.', { element: 'lightning' }],
  ['tome', 'tome', 6, 'Litany of Sparks', 'crescendo', 'Each line louder than the last. Nobody has ever read it to the end aloud.', { element: 'lightning' }],
  ['tome', 'tome', 2, 'Herbal of Ruin', 'venom_stack', 'An apothecary\'s herbal with every cure crossed out.', { element: 'poison' }],
  ['tome', 'tome', 5, 'Grimoire of the Mire', 'rot_spread', 'Its pages are damp and growing. Something in it is still alive.', { element: 'poison' }],
  ['tome', 'tome', 3, 'Book of Unnaming', 'mana_burn', 'Every name written in it is forgotten by the world. It costs the reader too.', { element: 'shadow' }],
  ['tome', 'tome', 6, 'Obituary', 'doom', 'It lists the dead of every war. There is always room for one more.', { element: 'shadow' }],
  ['tome', 'tome', 1, 'Primer of Echoes', 'echo_cast', 'A child\'s spell primer. Every lesson in it repeats itself.', { element: 'arcane' }],
  ['tome', 'tome', 4, 'The Endless Index', 'resonance', 'An index to a book that was never written. It finds every weakness it is asked for.', { element: 'arcane' }],
];

const ARMOUR = [
  ['head:cloth', 'cloth_helm', 2, "Seer's Veil", 'overflow', 'A veil of spider-silk worn by the oracles, who never ran out of words.'],
  ['head:cloth', 'cloth_helm', 5, 'Cowl of Quiet Hours', 'stillness', 'Worn by the hermits who sat so still the birds nested on them.'],
  ['head:light', 'light_helm', 1, "Scout's Brow", 'stride', 'A cap of oiled leather that has crossed every border in the south.'],
  ['head:light', 'light_helm', 4, 'Mask of the Fox', 'kill_frenzy', 'A red-leather mask. Its wearer grows quicker with every kill, and harder to follow.'],
  ['head:medium', 'medium_helm', 2, 'Coif of Second Breath', 'second_wind', 'A coif worn by a soldier who was left for dead three times.'],
  ['head:medium', 'medium_helm', 5, 'Iron Halo', 'crit_heal', 'A ring of iron worn like a saint\'s crown. It mends whoever strikes true.'],
  ['head:heavy', 'heavy_helm', 3, 'Bellhelm', 'retaliate_nova', 'Strike it and it rings with the cold of the mountain it was forged under.'],
  ['head:heavy', 'wyrmscale_helm', 6, 'Crown of the Drake Warden', 'pyre_aura', 'The drake wardens wore their charges\' fire as a crown.'],
  ['chest:cloth', 'cloth_chest', 1, 'Robe of the Last Lamp', 'barrier_burst', 'The lamplighters of the old city wore it on the night the lamps went out.'],
  ['chest:cloth', 'dragonscale_cloth', 5, 'Wyrmsilk Vestment', 'echo_cast', 'Woven from the shed skin of a sky-drake. Every spell cast in it echoes.'],
  ['chest:light', 'light_chest', 2, "Hunter's Jerkin", 'opportunist', 'The hunter who wore it never chased anything that could still run.'],
  ['chest:light', 'light_chest', 4, 'Nightrunner Coat', 'vampire_kill', 'A long black coat. Everyone who wore it lived a very long time on other people\'s blood.'],
  ['chest:medium', 'medium_chest', 3, 'Mail of the Frozen March', 'frost_skin', 'Worn on the winter march that nobody came back from. The cold came back in it.'],
  ['chest:medium', 'scaled_chest', 6, 'Hydra Scale', 'thornmail', 'Every scale was cut from a head that grew back. Strike one and it strikes you.'],
  ['chest:heavy', 'heavy_chest', 2, 'Penance Plate', 'thornmail', 'The armour of a knight who swore to answer every blow in kind.'],
  ['chest:heavy', 'dragonsteel_chest', 5, 'Bastion of Kharr', 'second_wind', 'The last wall of Kharr, beaten into a breastplate when the city fell.'],
  ['legs:cloth', 'cloth_legs', 1, 'Leggings of the Ley', 'crit_ward', 'Stitched with thread drawn along the ley-lines. Every true strike pulls a ward up around you.'],
  ['legs:cloth', 'cloth_legs', 4, 'Mooncloth Wraps', 'free_move', 'Cloth woven by moonlight. It never tires, and neither does its wearer.'],
  ['legs:light', 'light_legs', 2, 'Pathless Breeches', 'stride', 'Worn by the road-less, who fight as they walk and never stop.'],
  ['legs:light', 'light_legs', 5, "Deerstalker's Leathers", 'stillness', 'The deerstalker waited a whole day for one shot, and never missed.'],
  ['legs:medium', 'medium_legs', 3, 'Chain of the Long Road', 'kill_frenzy', 'Every link was forged in a different town along the old road.'],
  ['legs:medium', 'dragonhide_legs', 6, 'Dragonhide Greaves', 'pyre_aura', 'The hide is still warm, and it has not forgotten how to burn.'],
  ['legs:heavy', 'heavy_legs', 2, 'Rampart Greaves', 'frost_skin', 'Greaves from a frontier fort built on the permafrost. The cold came up through the stone.'],
  ['legs:heavy', 'runed_legs', 5, 'Runeward Greaves', 'barrier_burst', 'Every rune is a promise to hold. When the last one breaks, they all break at once.'],
  ['hands:light', 'light_gauntlets', 1, 'Cutpurse Gloves', 'battle_trance', 'The fingers were worn smooth by a thousand patient thefts.'],
  ['hands:light', 'light_gauntlets', 4, 'Gloves of the Quick Draw', 'fourth_volley', 'An archer\'s gloves, worn through at the fingertips.'],
  ['hands:medium', 'medium_gauntlets', 3, 'Gauntlets of the Last Word', 'cull', 'The executioner\'s gloves. He never needed to say anything twice.'],
  ['hands:medium', 'medium_gauntlets', 5, 'Stormgrip', 'chain_lightning', 'Copper wire is woven through the mail. Every blow arcs.'],
  ['hands:heavy', 'heavy_gauntlets', 2, 'Fists of the Quarry', 'quake_slam', 'The quarrymen split mountains with these, and never needed a hammer.'],
  ['hands:heavy', 'dragonclaw_gauntlets', 6, 'Wyrmclaw Grips', 'hemorrhage', 'Each finger ends in a drake\'s claw. The wounds they make open wider as you run.'],
  ['feet:light', 'light_boots', 1, 'Boots of the Hare', 'kill_frenzy', 'Soft boots for a hunter who never stood still long enough to be hunted.'],
  ['feet:light', 'light_boots', 4, 'Ashstep Boots', 'fire_trail', 'Wherever they walk into a fight, the ground catches.'],
  ['feet:medium', 'medium_boots', 2, 'Marchwarden Boots', 'second_wind', 'The boots of a marchwarden who walked home from a massacre.'],
  ['feet:medium', 'medium_boots', 5, 'Frostprint Sabatons', 'frostbite', 'They leave frost in the footprints, and on whatever they kick.'],
  ['feet:heavy', 'heavy_boots', 3, 'Stonestep Sabatons', 'quake_slam', 'Every step is a small earthquake. Every third swing is a larger one.'],
  ['feet:heavy', 'runed_boots', 6, 'Groundswell Sabatons', 'crescendo', 'Runes up the shin build like a wave, and break.'],
];

const OTHER = [
  ['shield', 'buckler', 1, "Parry's Promise", 'bulwark', 'A duellist\'s buckler, dented in the centre from ten thousand turned blades.'],
  ['shield', 'aegis_shield', 5, 'Aegis of Last Light', 'thornmail', 'The shield of the last paladin of the dawn order. It still punishes the wicked.'],
  ['ward', 'warded_focus', 2, 'Glimmerward', 'barrier_burst', 'A disc of polished crystal. When its ward shatters, so does everything near it.'],
  ['ward', 'spellguard_orb', 5, 'Veilguard Orb', 'second_wind', 'An orb of layered veils that throws a new one up when the last one falls.'],
  ['quiver', { gearBase: 'quiver_ember' }, 2, 'Emberwing Quiver', 'kindling', 'The fletchings are phoenix down, or so the seller swore. They do not stop burning.'],
  ['quiver', { gearBase: 'quiver_seeker' }, 5, 'Quiver of the Wild Hunt', 'ricochet', 'The arrows of the wild hunt never stop at one quarry.'],
  ['ring', 'ring', 1, 'Band of Echoes', 'echo_strike', 'A plain iron band that hums a moment after every blow.'],
  ['ring', 'gold_signet', 4, 'Signet of the Glass Throne', 'glass_heart', 'The seal of a queen who ruled by fear and died by it.'],
  ['necklace', 'necklace', 2, 'Pendant of Wounds', 'resonance', 'A string of old arrowheads, one for every wound its owner survived.'],
  ['necklace', 'silver_amulet', 5, 'Veinstone of Vael', 'crit_ward', 'A red stone that beats. It shields the heart it hangs over.'],
  ['mount', { gearBase: 'pony' }, 2, 'Brambleback', 'rider_fury', 'A bad-tempered moor pony with a scar for every fight it enjoyed.'],
  ['mount', { gearBase: 'dray' }, 5, 'Thunderhoof', 'stormrider', 'A storm-elk from the high plains. Lightning follows it like a herd.'],
  ['light', { gearBase: 'lantern' }, 2, 'Lantern of Morrow', 'dread_lantern', 'A lamp from a haunted lighthouse. Its light makes brave things falter.'],
  ['light', { gearBase: 'wisplamp' }, 5, 'Sunjar', 'searing_light', 'A jar of noon, sealed with wax. Nothing that hates the day can stand near it.'],
  ['tool', { toolBase: 'ironhead_tool' }, 2, "Prospector's Pride", 'prospector', 'The pick that struck the first silver in the western hills. It still finds double.'],
  ['tool', { toolBase: 'steelhead_tool' }, 4, 'Quickhand Pick', 'quick_hands', 'A miner\'s tool worn smooth by a lifetime of piecework. It hurries you along.'],
];

// ---------------------------------------------------------------------------- build

const slug = name => name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const out = [];
const seen = new Set();
function push(u) {
  if (seen.has(u.id)) throw new Error('duplicate unique id ' + u.id);
  seen.add(u.id);
  out.push(u);
}

STEEL.forEach(([type, base, act, name, power, lore, opts = {}], i) => {
  if (!items.weaponBases[base]) throw new Error('no weapon base ' + base);
  push({ id: 'fh_' + slug(name), name, type, slot: 'weapon', baseItemId: base, act, quality: qualityFor(act),
    ...weaponAffixes(base, act, i, opts), legendaryEffect: power, lore });
});
CASTER.forEach(([type, base, act, name, power, lore, opts = {}], i) => {
  if (!items.weaponBases[base]) throw new Error('no weapon base ' + base);
  const u = { id: 'fh_' + slug(name), name, type, slot: 'weapon', baseItemId: base, act, quality: qualityFor(act),
    element: opts.element, ...weaponAffixes(base, act, i, { caster: true }), legendaryEffect: power, lore };
  if (opts.wand) u.wandBehaviour = opts.wand;
  if (opts.spell) u.staffSpell = opts.spell;
  push(u);
});
ARMOUR.forEach(([type, base, act, name, power, lore], i) => {
  const b = items.armorBases[base];
  if (!b) throw new Error('no armour base ' + base);
  push({ id: 'fh_' + slug(name), name, type, slot: b.slot, baseItemId: base, act, quality: qualityFor(act),
    ...armourAffixes(base, act, i), legendaryEffect: power, lore });
});
OTHER.forEach(([type, base, act, name, power, lore], i) => {
  const u = { id: 'fh_' + slug(name), name, type, act, quality: qualityFor(act), legendaryEffect: power, lore };
  if (typeof base === 'string') {
    const b = items.armorBases[base];
    if (!b) throw new Error('no base ' + base);
    u.slot = b.slot; u.baseItemId = base;
  } else Object.assign(u, base, { slot: type === 'quiver' ? 'offhand' : type });
  push({ ...u, ...otherAffixes(type, act, i) });
});

const doc = 'Round 23 — Farhold\'s own uniques. Built by tools/build-uniques.mjs from its rows (edit those, not this file). '
  + 'Loaded at boot and put into items.uniques IN MEMORY by js/uniques.js installUniques: items.json is shared with Emberveil, '
  + 'which has no registry entry for any of these powers. `type` is the taxonomy key from js/uniques.js UNIQUE_TYPES; '
  + '`element`, `wandBehaviour` and `staffSpell` are written onto the item by dressUnique; `gearBase` / `toolBase` name a '
  + 'js/gear.js or data/tools.json base for the four slots that have no items.json base. Units are Farhold engine units '
  + '(js/affixes.js ENGINE_UNIT). See research/round23-uniques.md.';
writeFileSync(join(here, '../data/uniques.json'), JSON.stringify({ _doc: doc, uniques: out }, null, 1) + '\n');
console.log(`wrote ${out.length} uniques`);
