// Stormcaller — lightning that jumps (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Chain lightning down a line, a ball of lightning that blows up, a nova of sparks, wind that blows a cone of them
// off their feet, a field that keeps shocking, a leap that lands like a lightning strike.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  spells: {
    chain_lightning: {
      name: 'Chain Lightning', shape: 'beam', element: 'lightning', mult: 1.5, range: 22, width: 2, cooldown: 2.5, mp: 6,
      statuses: [{ id: 'shock', seconds: 3 }], knock: { push: 1 },
      ranks: ranks({ range: 5 }, { width: 1, knock: { push: 2, down: 1 } }),
    },
    shock_nova: {
      name: 'Shock Nova', shape: 'around', element: 'lightning', mult: 1.8, radius: 7, cooldown: 10, mp: 12,
      knock: { push: 4, down: 1.5 }, statuses: [{ id: 'shock', seconds: 3 }],
      ranks: ranks({ radius: 1.5 }, { knock: { push: 5, down: 2.2 } }),
    },
    ball_lightning: {
      name: 'Ball Lightning', shape: 'ground', element: 'lightning', mult: 2.4, range: 26, radius: 4.5, delay: 0.8, cooldown: 9, mp: 10,
      knock: { push: 4, down: 1.5 },
      ranks: ranks({ radius: 1 }, { knock: { push: 5, down: 2.2 } }),
    },
    wind_blast: {
      name: 'Wind Blast', shape: 'melee', element: 'lightning', mult: 1.3, reach: 11, arc: 1.4, cooldown: 8, mp: 8,
      knock: { push: 8, down: 1.2 },
      ranks: ranks({ reach: 3 }, { arc: 0.5, knock: { push: 9, down: 2 } }),
    },
    static_field: {
      name: 'Static Field', shape: 'ground', element: 'lightning', mult: 0.8, range: 22, radius: 6, delay: 0.3, cooldown: 14, mp: 14,
      statuses: [{ id: 'shock', seconds: 3 }],
      place: { kind: 'zone', seconds: 7, radius: 6, every: 1, strike: { mult: 0.4 } },
      ranks: ranks({ radius: 1.5, place: { radius: 7.5 } }, { place: { seconds: 10 } }),
    },
    storm_leap: {
      name: 'Storm Leap', shape: 'leap', element: 'lightning', mult: 1.6, range: 16, radius: 4.5, cooldown: 10, mp: 10,
      knock: { push: 3, down: 1 },
      ranks: ranks({ range: 4 }, { radius: 1.5 }),
    },
    storm_beam: {
      name: 'Storm Beam', shape: 'beam', element: 'lightning', mult: 2.4, range: 28, width: 3, cooldown: 12, mp: 14,
      knock: { push: 3, down: 1.5 }, statuses: [{ id: 'shock', seconds: 3 }],
      ranks: ranks({ range: 6 }, { width: 1.5 }),
    },
    thunderstorm: {
      name: 'Thunderstorm', shape: 'ground', element: 'lightning', mult: 0.7, range: 30, radius: 11, delay: 0.3, repeats: 12, repeatEvery: 0.3,
      cooldown: 32, mp: 30, knock: { push: 1, down: 0.8 }, statuses: [{ id: 'shock', seconds: 3 }],
    },
    storm_eye: {
      name: 'Eye of the Storm', shape: 'around', element: 'lightning', mult: 0.9, radius: 12, repeats: 6, repeatEvery: 0.6,
      cooldown: 30, mp: 30, pullIn: { metres: 1 }, knock: { push: 3, down: 1 },
    },
  },
  nodes: [
    // level 1
    spell('chain_lightning', 1, { free: true }), prof('wand', 1, { free: true }),
    spell('shock_nova', 1), prof('staff', 1), prof('leather', 1), prof('dagger', 1),
    // level 2
    spell('ball_lightning', 2), spell('wind_blast', 2), mastery('wand', 2), prof('orb', 2),
    // level 3
    spell('static_field', 3), spell('storm_leap', 3), passive('storm_power', 'Storm Power', 3, { lightningPct: 25 }), mastery('staff', 3),
    // level 4
    rank('chain_lightning', 2, 4), rank('shock_nova', 2, 4), spell('storm_beam', 4), passive('deep_mana', 'Deep Mana', 4, { maxMpPct: 40, mpRegen: 2 }),
    // level 5
    rank('ball_lightning', 2, 5), rank('wind_blast', 2, 5), passive('spell_power', 'Spell Power', 5, { spellPct: 25 }),
    mod('double_chain', 'Double Chain', 'chain_lightning', 5, { add: { repeats: 3, repeatEvery: 0.3 } }),   // strikes the line twice more
    // level 6
    rank('static_field', 2, 6), rank('storm_leap', 2, 6), passive('swift_winds', 'Swift Winds', 6, { movePct: 25, hastePct: 20 }),
    mod('overload', 'Overload', 'shock_nova', 6, { mult: 1.3, add: { radius: 2 } }),
    // level 7
    rank('chain_lightning', 3, 7), rank('shock_nova', 3, 7), rank('storm_beam', 2, 7), passive('static_charge', 'Static Charge', 7, { critChance: 6 }),
    // level 8
    rank('ball_lightning', 3, 8), rank('wind_blast', 3, 8), passive('quick_storms', 'Quick Storms', 8, { cooldownPct: 25 }),
    mod('double_ball', 'Double Ball', 'ball_lightning', 8, { add: { repeats: 2, repeatEvery: 0.5 } }),
    // level 9
    rank('static_field', 3, 9), rank('storm_beam', 3, 9), rank('storm_leap', 3, 9), passive('high_voltage', 'High Voltage', 9, { critDamage: 60 }),
    // level 10: pick one
    capstone(spell('thunderstorm', 10)), capstone(spell('storm_eye', 10)),
  ],
};
