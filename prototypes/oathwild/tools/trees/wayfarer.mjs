// Wayfarer — unarmoured wanderer (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Fists, feet and a staff: palm strikes that knock them back, spinning kicks, flying kicks that land in the middle
// of a crowd, a palm of wind that blows a whole line over. No armour training at all; fast and hard to hit.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  mpScale: 0.5,   // a melee hybrid has little mana: its abilities cost half (lead pass 2026-11-26)
  power: 1.3,   // balance factor on every damage number (lead pass 2026-11-26, tests/rules/combat.test.mjs level-10 fights)
  spells: {
    palm_strike: {
      name: 'Palm Strike', shape: 'melee', element: 'physical', mult: 1.5, reach: 4, arc: 1.8, cooldown: 2.5, mp: 3,
      knock: { push: 2 },
      ranks: ranks({ reach: 1 }, { knock: { push: 3, down: 1 } }),
    },
    spinning_kick: {
      name: 'Spinning Kick', shape: 'around', element: 'physical', mult: 1.6, radius: 5, cooldown: 7, mp: 6,
      knock: { push: 3, down: 1 },
      ranks: ranks({ radius: 1.5 }, { knock: { push: 4, down: 1.8 } }),
    },
    flying_kick: {
      name: 'Flying Kick', shape: 'leap', element: 'physical', mult: 1.8, range: 14, radius: 3.5, cooldown: 9, mp: 8,
      knock: { push: 4, down: 1.5 },
      ranks: ranks({ range: 4 }, { radius: 1.5 }),
    },
    rushing_fist: {
      name: 'Rushing Fist', shape: 'dash', element: 'physical', mult: 1.5, range: 12, splash: 2, cooldown: 8, mp: 6,
      dash: { range: 12 }, knock: { push: 3 },
      ranks: ranks({ range: 3, dash: { range: 15 } }, { knock: { push: 4, down: 1.5 } }),
    },
    staff_sweep: {
      name: 'Staff Sweep', shape: 'melee', element: 'physical', mult: 1.7, reach: 5, arc: 3, cooldown: 8, mp: 6,
      knock: { push: 1, down: 1.8 },
      ranks: ranks({ reach: 1 }, { knock: { push: 1.5, down: 2.5 } }),
    },
    wind_palm: {
      name: 'Wind Palm', shape: 'beam', element: 'physical', mult: 2, range: 16, width: 3, cooldown: 11, mp: 10,
      knock: { push: 6, down: 1.2 },
      ranks: ranks({ range: 5 }, { width: 1.5 }),
    },
    inner_speed: {
      name: 'Inner Speed', shape: 'self', element: 'physical', cooldown: 25, mp: 8,
      selfBuff: { name: 'Inner Speed', seconds: 10, haste: 0.35, move: 0.3 },
    },
    earth_stomp: {
      name: 'Earth Stomp', shape: 'around', element: 'physical', mult: 2.2, radius: 8, cooldown: 14, mp: 12,
      knock: { push: 3, down: 2.5 },
      ranks: ranks({ radius: 1.5 }, { knock: { push: 4, down: 3 } }),
    },
    hundred_fists: {
      name: 'Hundred Fists', shape: 'melee', element: 'physical', mult: 0.6, reach: 5, arc: 2, repeats: 10, repeatEvery: 0.2,
      cooldown: 28, mp: 22, knock: { push: 1.5 },
    },
    thunder_kick: {
      name: 'Thunder Kick', shape: 'leap', element: 'physical', mult: 3.8, range: 20, radius: 7, cooldown: 30, mp: 24,
      knock: { push: 7, down: 3 },
    },
  },
  nodes: [
    // level 1: no armour, ever
    spell('palm_strike', 1, { free: true }),
    spell('spinning_kick', 1), prof('staff', 1), prof('spear', 1), prof('dagger', 1),
    // level 2
    spell('flying_kick', 2), spell('rushing_fist', 2), mastery('staff', 2), mastery('spear', 2),
    // level 3
    spell('staff_sweep', 3), spell('wind_palm', 3), passive('iron_fist', 'Iron Fist', 3, { meleePct: 25 }),
    passive('light_step', 'Light Step', 3, { dodge: 15 }),
    // level 4
    rank('palm_strike', 2, 4), rank('spinning_kick', 2, 4), rank('flying_kick', 2, 4), spell('inner_speed', 4),
    // level 5
    spell('earth_stomp', 5), rank('rushing_fist', 2, 5), rank('wind_palm', 2, 5), passive('fast_feet', 'Fast Feet', 5, { movePct: 25 }),
    // level 6
    rank('staff_sweep', 2, 6), passive('flowing_strikes', 'Flowing Strikes', 6, { hastePct: 25 }), mastery('dagger', 6),
    mod('whirling_kick', 'Whirling Kick', 'spinning_kick', 6, { add: { repeats: 2, repeatEvery: 0.35 } }),
    // level 7
    rank('palm_strike', 3, 7), rank('spinning_kick', 3, 7), rank('earth_stomp', 2, 7),
    passive('pressure_points', 'Pressure Points', 7, { critChance: 6 }),
    // level 8
    rank('flying_kick', 3, 8), rank('rushing_fist', 3, 8), passive('calm_mind', 'Calm Mind', 8, { cooldownPct: 25 }),
    mod('gale_palm', 'Gale Palm', 'wind_palm', 8, { mult: 1.2, add: { width: 2, knock: { push: 8, down: 2 } } }),
    // level 9
    rank('wind_palm', 3, 9), rank('staff_sweep', 3, 9), rank('earth_stomp', 3, 9), passive('killing_blow', 'Killing Blow', 9, { critDamage: 50 }),
    // level 10: pick one
    capstone(spell('hundred_fists', 10)), capstone(spell('thunder_kick', 10)),
  ],
};
