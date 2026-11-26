// Shaman — spirits and storm (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// A hammer that cracks with lightning, a thunder clap that throws everyone off their feet, pools of lava, rolling
// thunder down a line, a spirit bear at your side. One heal (Healing Totem), one defence (Stone Skin).
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  power: 1.2,   // balance factor on every damage number (lead pass 2026-11-26, tools/sim-fights.mjs)
  role: 'Spirits and storm',
  blurb: 'A hammer that cracks with lightning, thunder that throws crowds off their feet, lava underfoot and a spirit bear.',
  starter: ['hammer', 'buckler', 'light_chest', 'light_legs'],
  spells: {
    shock_strike: {
      name: 'Shock Strike', shape: 'melee', element: 'lightning', powerFrom: 'blend', mult: 1.5, reach: 4, arc: 2.4, cooldown: 3, mp: 4,
      knock: { push: 1.2 }, statuses: [{ id: 'shock', seconds: 3 }],
      ranks: ranks({ reach: 1 }, { knock: { push: 2, down: 1 } }),
    },
    thunderclap: {
      name: 'Thunder Clap', shape: 'around', element: 'lightning', mult: 1.6, radius: 7, cooldown: 9, mp: 10,
      knock: { push: 3, down: 1.2 }, statuses: [{ id: 'shock', seconds: 3 }],
      ranks: ranks({ radius: 1.5 }, { knock: { push: 4, down: 2 } }),
    },
    lava_pool: {
      name: 'Lava Pool', shape: 'ground', element: 'fire', mult: 1.2, range: 22, radius: 5, delay: 0.3, cooldown: 14, mp: 14,
      statuses: [{ id: 'burn', seconds: 4 }],
      place: { kind: 'zone', seconds: 6, radius: 5, every: 1, strike: { mult: 0.5 } },
      ranks: ranks({ radius: 1 }, { place: { seconds: 9 } }),
    },
    healing_totem: {
      name: 'Healing Totem', shape: 'ground', element: 'nature', range: 12, cooldown: 20, mp: 16,
      place: { kind: 'pulse', seconds: 12, radius: 8, every: 1, heal: 0.025 },
      ranks: ranks(),
    },
    rolling_thunder: {
      name: 'Rolling Thunder', shape: 'beam', element: 'lightning', mult: 2.2, range: 24, width: 3.5, cooldown: 11, mp: 12,
      knock: { push: 3, down: 1.5 },
      ranks: ranks({ range: 6 }, { width: 1.5 }),
    },
    call_spirit: {
      name: 'Call Spirit Bear', shape: 'summon', element: 'nature', pet: 'spirit_bear', count: 1, cooldown: 36, mp: 22,
      ranks: ranks(),
    },
    thunder_leap: {
      name: 'Thunder Leap', shape: 'leap', element: 'lightning', powerFrom: 'blend', mult: 1.8, range: 14, radius: 4.5,
      cooldown: 12, mp: 10, knock: { push: 3, down: 1.5 },
      ranks: ranks({ range: 4 }, { radius: 1.5 }),
    },
    stone_skin: {
      name: 'Stone Skin', shape: 'self', element: 'nature', cooldown: 30, mp: 12,
      selfBuff: { name: 'Stone Skin', seconds: 10, armor: 0.4 },
    },
    lightning_storm: {
      name: 'Lightning Storm', shape: 'ground', element: 'lightning', mult: 0.7, range: 30, radius: 10, delay: 0.3,
      repeats: 10, repeatEvery: 0.35, cooldown: 30, mp: 30, knock: { push: 1.5, down: 1 }, statuses: [{ id: 'shock', seconds: 3 }],
    },
    volcano: {
      name: 'Volcano', shape: 'ground', element: 'fire', mult: 3.8, range: 28, radius: 8, delay: 0.8, cooldown: 30, mp: 30,
      knock: { push: 6, down: 2.5 }, statuses: [{ id: 'burn', seconds: 6 }],
    },
  },
  nodes: [
    // level 1
    spell('shock_strike', 1, { free: true }), prof('mace', 1, { free: true }), prof('shield', 1, { free: true }),
    prof('leather', 1, { free: true }),
    spell('thunderclap', 1), prof('mail', 1), prof('axe', 1), prof('staff', 1),
    // level 2
    spell('lava_pool', 2), spell('healing_totem', 2), mastery('mace', 2), prof('twohand', 2),
    // level 3
    spell('rolling_thunder', 3), spell('call_spirit', 3), passive('storm_power', 'Storm Power', 3, { lightningPct: 25 }),
    passive('molten_power', 'Molten Power', 3, { firePct: 25 }), mastery('axe', 3),
    // level 4
    rank('shock_strike', 2, 4), rank('thunderclap', 2, 4), rank('lava_pool', 2, 4), spell('thunder_leap', 4),
    // level 5
    rank('rolling_thunder', 2, 5), spell('stone_skin', 5), passive('spirit_bond', 'Spirit Bond', 5, { petPct: 40 }),
    mod('aftershock', 'Aftershock', 'thunderclap', 5, { add: { repeats: 2, repeatEvery: 0.6 } }),
    // level 6
    rank('thunder_leap', 2, 6), rank('call_spirit', 2, 6), passive('elemental_force', 'Elemental Force', 6, { spellPct: 25 }),
    mod('spreading_lava', 'Spreading Lava', 'lava_pool', 6, { add: { radius: 2, place: { radius: 7 } } }),
    // level 7
    rank('shock_strike', 3, 7), rank('thunderclap', 3, 7), rank('healing_totem', 2, 7), passive('charged', 'Charged', 7, { critChance: 6 }),
    // level 8
    rank('lava_pool', 3, 8), rank('rolling_thunder', 3, 8), passive('quick_spirits', 'Quick Spirits', 8, { cooldownPct: 25 }),
    mod('chain_shock', 'Wide Shock', 'shock_strike', 8, { mult: 1.2, add: { arc: 0.8, reach: 1 } }),
    // level 9
    rank('thunder_leap', 3, 9), passive('overcharge', 'Overcharge', 9, { critDamage: 50 }), mastery('staff', 9),
    passive('thick_skin', 'Thick Skin', 9, { maxHpPct: 30 }),
    // level 10: pick one
    capstone(spell('lightning_storm', 10)), capstone(spell('volcano', 10)),
  ],
};
