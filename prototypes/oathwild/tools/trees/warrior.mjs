// Warrior — the reference tree (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Steel in close: cleaves, slams that knock everyone down, charges and leaps. One shield trick, one shout, no heals.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  power: 0.85,   // balance factor on every damage number (lead pass 2026-11-26, tools/sim-fights.mjs)
  starter: ['longsword', 'shield', 'medium_chest', 'medium_legs'],
  dualWield: true,
  spells: {
    cleave: {
      name: 'Cleave', shape: 'melee', element: 'physical', mult: 1.5, reach: 4.2, arc: 3.6, cooldown: 3, mp: 4,
      knock: { push: 1.2 },
      ranks: ranks({ reach: 0.8 }, { statuses: [{ id: 'bleed', seconds: 5 }] }),
    },
    shield_bash: {
      name: 'Shield Bash', shape: 'melee', element: 'physical', mult: 1.4, reach: 3.2, arc: 1.6, cooldown: 7, mp: 6,
      knock: { push: 3, down: 1.5 },
      ranks: ranks({ knock: { down: 2 } }, { arc: 1.2 }),   // add: a number adds, an object field is SET (down 2 = 1.5 → 2)
    },
    charge: {
      name: 'Charge', shape: 'dash', element: 'physical', mult: 1.3, range: 14, splash: 1.6, cooldown: 9, mp: 6,
      dash: { range: 14 }, knock: { push: 3.5, down: 1.2 },
      ranks: ranks({ range: 4, dash: { range: 18 } }, { mult: 0.6 }),
    },
    whirlwind: {
      name: 'Whirlwind', shape: 'around', element: 'physical', mult: 0.42, radius: 5.5, repeats: 5, repeatEvery: 0.3,
      cooldown: 10, mp: 12, pullIn: { metres: 0.6 },
      ranks: ranks({ repeats: 1 }, { radius: 1.5 }),
    },
    ground_slam: {
      name: 'Ground Slam', shape: 'around', element: 'physical', mult: 1.9, radius: 7, cooldown: 13, mp: 14,
      knock: { push: 4, down: 2 },
      ranks: ranks({ radius: 1.5 }, { knock: { down: 3 } }),
    },
    war_cry: {
      name: 'War Cry', shape: 'self', element: 'physical', cooldown: 24, mp: 10, allies: 15,
      selfBuff: { name: 'War Cry', seconds: 10, damage: 0.3, move: 0.2 },
      ranks: [{}, { power: 1.4, mp: 1.1, seconds: 4 }],
    },
    leap_strike: {
      name: 'Leap Strike', shape: 'leap', element: 'physical', mult: 2, range: 16, radius: 5, cooldown: 12, mp: 12,
      knock: { push: 3, down: 1.5 },
      ranks: ranks({ radius: 1.5 }, { range: 6 }),
    },
    earthquake: {
      name: 'Earthquake', shape: 'beam', element: 'physical', mult: 3.2, range: 22, width: 5, cooldown: 28, mp: 26,
      knock: { push: 5, down: 3 },
    },
    berserk: {
      name: 'Berserk', shape: 'self', element: 'physical', cooldown: 60, mp: 20,
      selfBuff: { name: 'Berserk', seconds: 14, damage: 0.5, haste: 0.35, move: 0.25 },
    },
  },
  nodes: [
    // level 1: the kit (free) + first choices
    spell('cleave', 1, { free: true }),
    prof('sword', 1, { free: true }), prof('shield', 1, { free: true }), prof('mail', 1, { free: true }),
    prof('axe', 1), prof('mace', 1), prof('twohand', 1),
    // level 2
    spell('shield_bash', 2), spell('charge', 2), prof('dualWield', 2), prof('spear', 2),
    // level 3
    spell('whirlwind', 3), mastery('sword', 3), mastery('axe', 3), mastery('mace', 3), mastery('twohand', 3),
    // level 4
    rank('cleave', 2, 4), rank('shield_bash', 2, 4), rank('charge', 2, 4), prof('plate', 4, { needs: ['prof_mail'] }),
    passive('heavy_blows', 'Heavy Blows', 4, { critDamage: 50 }),
    // level 5
    spell('ground_slam', 5), spell('war_cry', 5), rank('whirlwind', 2, 5),
    mod('wide_cleave', 'Wide Cleave', 'cleave', 5, { add: { reach: 1.5, knock: { down: 1 } } }),   // cleave knocks down now too
    // level 6
    spell('leap_strike', 6), rank('ground_slam', 2, 6), passive('brute', 'Brute Strength', 6, { meleePct: 25 }),
    mod('bleeding_spin', 'Bleeding Spin', 'whirlwind', 6, { add: { statuses: [{ id: 'bleed', seconds: 6 }] } }),
    passive('toughness', 'Toughness', 6, { maxHpPct: 30 }),
    // level 7
    rank('cleave', 3, 7), rank('shield_bash', 3, 7), rank('leap_strike', 2, 7), rank('war_cry', 2, 7),
    passive('killer_instinct', 'Killer Instinct', 7, { critChance: 6 }),
    // level 8
    rank('whirlwind', 3, 8), rank('charge', 3, 8), mod('shockwave', 'Shockwave', 'ground_slam', 8, { mult: 1.3, add: { radius: 2 } }),
    passive('relentless', 'Relentless', 8, { cooldownPct: 25 }),
    // level 9
    rank('ground_slam', 3, 9), rank('leap_strike', 3, 9), passive('weapon_master', 'Weapon Master', 9, { physicalPct: 30 }),
    mod('crater', 'Crater', 'leap_strike', 9, { mult: 1.4, add: { knock: { down: 2.5 } } }),
    // level 10: pick one
    capstone(spell('earthquake', 10)), capstone(spell('berserk', 10)),
  ],
};
