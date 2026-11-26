// Paladin — holy warrior in plate (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Steel and light together: a holy strike in a wide arc, a charge that flattens the line, a storm of light all
// round you, hammers of light from the sky, a leap that lands like a bell. One heal, one shield.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  mpScale: 0.5,   // a melee hybrid has little mana: its abilities cost half (lead pass 2026-11-26)
  power: 1.35,   // balance factor on every damage number (lead pass 2026-11-26, tests/rules/combat.test.mjs level-10 fights)
  spells: {
    holy_strike: {
      name: 'Holy Strike', shape: 'melee', element: 'holy', powerFrom: 'blend', mult: 1.6, reach: 4.2, arc: 2.2, cooldown: 3, mp: 4,
      knock: { push: 1.2 },
      ranks: ranks({ reach: 1 }, { statuses: [{ id: 'weaken', seconds: 4 }] }),
    },
    holy_charge: {
      name: 'Holy Charge', shape: 'dash', element: 'holy', powerFrom: 'blend', mult: 1.5, range: 14, splash: 2, cooldown: 10, mp: 8,
      dash: { range: 14 }, knock: { push: 4, down: 1.5 },
      ranks: ranks({ range: 4, dash: { range: 18 } }, { splash: 1 }),
    },
    healing_light: {
      name: 'Healing Light', shape: 'bolt', element: 'holy', target: 'ally', healPower: 1.6, range: 30, cooldown: 8, mp: 12,
      ranks: ranks(),
    },
    divine_storm: {
      name: 'Divine Storm', shape: 'around', element: 'holy', powerFrom: 'blend', mult: 1.8, radius: 6, cooldown: 8, mp: 10,
      knock: { push: 2 },
      ranks: ranks({ radius: 1.5 }, { knock: { push: 3, down: 1.5 } }),
    },
    holy_fire: {
      // the ground round you catches holy fire and keeps burning
      name: 'Holy Fire', shape: 'around', element: 'holy', mult: 0.8, radius: 6, cooldown: 14, mp: 14,
      place: { kind: 'zone', seconds: 8, radius: 6, every: 1, strike: { mult: 0.4 } },
      ranks: ranks({ radius: 1.5, place: { radius: 7.5 } }, { place: { seconds: 11 } }),
    },
    light_hammer: {
      name: 'Light Hammer', shape: 'ground', element: 'holy', mult: 2.4, range: 24, radius: 4, delay: 0.4, cooldown: 10, mp: 12,
      knock: { push: 3, down: 2 },
      ranks: ranks({ radius: 1 }, { knock: { push: 4, down: 2.8 } }),
    },
    shield_of_light: {
      name: 'Shield of Light', shape: 'self', element: 'holy', cooldown: 40, mp: 14,
      selfBuff: { name: 'Shield of Light', seconds: 8, resist: 0.4 },
    },
    holy_leap: {
      name: 'Holy Leap', shape: 'leap', element: 'holy', powerFrom: 'blend', mult: 2, range: 16, radius: 5, cooldown: 12, mp: 12,
      knock: { push: 3, down: 1.5 },
      ranks: ranks({ radius: 1.5 }, { range: 6 }),
    },
    holy_avatar: {
      name: 'Holy Avatar', shape: 'self', element: 'holy', cooldown: 60, mp: 24, allies: 15,
      selfBuff: { name: 'Holy Avatar', seconds: 15, damage: 0.5, haste: 0.3, move: 0.2 },
    },
    heavens_hammer: {
      name: "Heaven's Hammer", shape: 'ground', element: 'holy', mult: 4, range: 28, radius: 10, delay: 1, cooldown: 30, mp: 30,
      knock: { push: 6, down: 3 },
    },
  },
  nodes: [
    // level 1: the class that opens plate
    spell('holy_strike', 1, { free: true }), prof('plate', 1, { free: true }),
    spell('holy_charge', 1), spell('healing_light', 1), prof('sword', 1), prof('mace', 1), prof('twohand', 1),
    // level 2
    spell('divine_storm', 2), spell('holy_fire', 2), prof('shield', 2), prof('axe', 2),
    // level 3
    spell('light_hammer', 3), mastery('sword', 3), mastery('mace', 3), mastery('twohand', 3),
    passive('holy_might', 'Holy Might', 3, { holyPct: 25 }),
    // level 4
    rank('holy_strike', 2, 4), rank('holy_charge', 2, 4), rank('divine_storm', 2, 4), spell('shield_of_light', 4),
    // level 5
    spell('holy_leap', 5), rank('holy_fire', 2, 5), rank('light_hammer', 2, 5),
    passive('armour_expert', 'Armour Expert', 5, { armorPct: 30 }),
    // level 6
    rank('healing_light', 2, 6), passive('crusader', 'Crusader', 6, { meleePct: 25 }), mastery('axe', 6),
    mod('storm_of_light', 'Storm of Light', 'divine_storm', 6, { add: { radius: 2, repeats: 2, repeatEvery: 0.4 } }),
    // level 7
    rank('holy_strike', 3, 7), rank('holy_charge', 3, 7), rank('holy_leap', 2, 7), passive('zealot', 'Zealot', 7, { critChance: 6 }),
    // level 8
    rank('divine_storm', 3, 8), rank('light_hammer', 3, 8), passive('quick_justice', 'Quick Justice', 8, { cooldownPct: 25 }),
    mod('blinding_charge', 'Blinding Charge', 'holy_charge', 8, { add: { statuses: [{ id: 'stagger', seconds: 2 }] } }),
    // level 9
    rank('holy_fire', 3, 9), rank('holy_leap', 3, 9), passive('holy_wrath', 'Holy Wrath', 9, { critDamage: 50 }),
    passive('stout_heart', 'Stout Heart', 9, { maxHpPct: 30 }),
    // level 10: pick one
    capstone(spell('holy_avatar', 10)), capstone(spell('heavens_hammer', 10)),
  ],
};
