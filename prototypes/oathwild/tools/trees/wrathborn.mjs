// Wrathborn — berserker, specialty (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Wild swings, a leap into the middle of them, a rampage of spins, a bull rush that sends a line flying.
import { spell, rank, prof, mastery, passive, capstone, ranks } from './_dsl.mjs';

export default {
  mpScale: 0.5,   // a melee hybrid has little mana: its abilities cost half (lead pass 2026-11-26)
  power: 1.3,   // balance factor on every damage number (lead pass 2026-11-26, tests/rules/combat.test.mjs level-10 fights)
  spells: {
    wild_swing: {
      name: 'Wild Swing', shape: 'melee', element: 'physical', mult: 1.7, reach: 4.5, arc: 2.8, cooldown: 3, mp: 3,
      knock: { push: 1.5 },
      ranks: ranks({ reach: 1 }, { knock: { push: 2.5, down: 1 } }),
    },
    savage_leap: {
      name: 'Savage Leap', shape: 'leap', element: 'physical', mult: 2, range: 16, radius: 5, cooldown: 9, mp: 6,
      knock: { push: 4, down: 1.5 },
      ranks: ranks({ radius: 1.5 }, { knock: { push: 5, down: 2.2 } }),
    },
    rampage: {
      name: 'Rampage', shape: 'around', element: 'physical', mult: 0.7, radius: 6, repeats: 6, repeatEvery: 0.3, cooldown: 12, mp: 8,
      pullIn: { metres: 0.6 },
      ranks: ranks({ repeats: 2 }, { radius: 1.5 }),
    },
    bull_rush: {
      name: 'Bull Rush', shape: 'dash', element: 'physical', mult: 1.6, range: 16, splash: 2, cooldown: 10, mp: 6,
      dash: { range: 16 }, knock: { push: 6, down: 2 },
      ranks: ranks({ range: 4, dash: { range: 20 } }, { splash: 1 }),
    },
    blood_frenzy: {
      name: 'Blood Frenzy', shape: 'self', element: 'physical', hpCost: 0.1, cooldown: 25, mp: 4,
      selfBuff: { name: 'Blood Frenzy', seconds: 12, damage: 0.4, haste: 0.3 },
    },
    battle_roar: {
      name: 'Battle Roar', shape: 'around', element: 'physical', mult: 1, radius: 8, cooldown: 14, mp: 6,
      knock: { push: 5, down: 1 }, statuses: [{ id: 'fear', seconds: 2 }],
    },
    earth_splitter: {
      name: 'Earth Splitter', shape: 'beam', element: 'physical', mult: 4, range: 24, width: 6, cooldown: 28, mp: 16,
      knock: { push: 7, down: 3 },
    },
    blood_storm: {
      name: 'Blood Storm', shape: 'around', element: 'physical', mult: 0.6, radius: 9, repeats: 8, repeatEvery: 0.25, leech: 0.15,
      cooldown: 28, mp: 16, knock: { push: 1.5 },
    },
  },
  nodes: [
    // level 1
    spell('wild_swing', 1, { free: true }),
    spell('savage_leap', 1), prof('axe', 1), prof('twohand', 1), prof('mace', 1),
    // level 2
    spell('rampage', 2), spell('bull_rush', 2), mastery('axe', 2), mastery('twohand', 2), mastery('mace', 2),
    // level 3
    spell('blood_frenzy', 3), rank('wild_swing', 2, 3), rank('savage_leap', 2, 3), passive('thick_skull', 'Thick Skull', 3, { maxHpPct: 40 }),
    // level 4
    rank('rampage', 2, 4), rank('bull_rush', 2, 4), spell('battle_roar', 4), passive('blood_thirst', 'Blood Thirst', 4, { lifeSteal: 10 }),
    passive('brutal', 'Brutal', 4, { critDamage: 50 }),
    // level 5: pick a capstone
    capstone(spell('earth_splitter', 5)), capstone(spell('blood_storm', 5)), rank('wild_swing', 3, 5),
  ],
};
