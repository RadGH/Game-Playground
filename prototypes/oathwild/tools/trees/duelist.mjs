// Duelist — flashing blade, specialty (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// A quick flurry in front of you, a lunge that runs through a line and knocks them flat, a dance of cuts all round.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  mpScale: 0.5,   // a melee hybrid has little mana: its abilities cost half (lead pass 2026-11-26)
  spells: {
    flurry: {
      name: 'Flurry', shape: 'melee', element: 'physical', mult: 0.6, reach: 4, arc: 1.6, repeats: 3, repeatEvery: 0.15, cooldown: 3, mp: 4,
      knock: { push: 1 },
      ranks: ranks({ repeats: 1 }, { arc: 0.6, statuses: [{ id: 'bleed', seconds: 5 }] }),
    },
    lunge: {
      name: 'Lunge', shape: 'dash', element: 'physical', mult: 2, range: 9, splash: 1.6, cooldown: 7, mp: 6,
      dash: { range: 9 }, knock: { push: 3, down: 1 },
      ranks: ranks({ range: 3, dash: { range: 12 } }, { knock: { push: 4, down: 1.8 } }),
    },
    blade_dance: {
      name: 'Blade Dance', shape: 'around', element: 'physical', mult: 0.6, radius: 5, repeats: 4, repeatEvery: 0.25, cooldown: 9, mp: 8,
      knock: { push: 1.5 },
      ranks: ranks({ radius: 1.5 }, { repeats: 2 }),
    },
    disarming_strike: {
      name: 'Disarming Strike', shape: 'melee', element: 'physical', mult: 1.6, reach: 4.5, arc: 1.6, cooldown: 10, mp: 8,
      knock: { push: 2 }, statuses: [{ id: 'disarm', seconds: 3 }],
      ranks: ranks({ arc: 0.8 }, { seconds: 1.5 }),
    },
    grand_flourish: {
      name: 'Grand Flourish', shape: 'around', element: 'physical', mult: 0.6, radius: 7, repeats: 8, repeatEvery: 0.2, cooldown: 26, mp: 20,
      knock: { push: 3, down: 1.5 },
    },
    deadly_lunge: {
      name: 'Deadly Lunge', shape: 'dash', element: 'physical', mult: 3.6, range: 20, splash: 2.5, cooldown: 26, mp: 20,
      dash: { range: 20 }, knock: { push: 5, down: 2 },
    },
  },
  nodes: [
    // level 1
    spell('flurry', 1, { free: true }),
    spell('lunge', 1), prof('sword', 1), prof('dagger', 1),
    // level 2
    spell('blade_dance', 2), mastery('sword', 2), mastery('dagger', 2), passive('footwork', 'Footwork', 2, { dodge: 15, movePct: 25 }),
    // level 3
    spell('disarming_strike', 3), rank('flurry', 2, 3), rank('lunge', 2, 3), passive('precision', 'Precision', 3, { critChance: 6 }),
    // level 4
    rank('blade_dance', 2, 4), rank('disarming_strike', 2, 4), passive('showstopper', 'Showstopper', 4, { critDamage: 50 }),
    mod('long_lunge', 'Long Lunge', 'lunge', 4, { add: { range: 4, dash: { range: 13 } } }),
    // level 5: pick a capstone
    capstone(spell('grand_flourish', 5)), capstone(spell('deadly_lunge', 5)), rank('flurry', 3, 5),
  ],
};
