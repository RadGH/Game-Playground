// Warlock — pact-bound caster (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Shadow that bursts where it lands, a beam that drinks life, a bound imp, curse clouds, a wave of darkness that
// throws them back, and gates you pay for in blood. No heal spells: Drain Life only steals what it hits.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  spells: {
    shadow_burst: {
      name: 'Shadow Burst', shape: 'ground', element: 'shadow', mult: 1.6, range: 24, radius: 3.5, delay: 0.35, cooldown: 2.5, mp: 6,
      knock: { push: 1.5 }, statuses: [{ id: 'weaken', seconds: 3 }],
      ranks: ranks({ radius: 1 }, { knock: { push: 3, down: 1 } }),
    },
    drain_life: {
      name: 'Drain Life', shape: 'beam', element: 'shadow', mult: 1.6, range: 18, width: 2, leech: 0.3, cooldown: 6, mp: 8,
      ranks: ranks({ range: 4 }, { width: 1.5 }),
    },
    summon_imp: {
      name: 'Summon Imp', shape: 'summon', element: 'shadow', pet: 'bound_imp', count: 1, hpCost: 0.1, cooldown: 30, mp: 16,
      summon: { def: 'bound_imp', name: 'Bound Imp' },
      ranks: ranks({}, { count: 1 }),
    },
    curse_cloud: {
      name: 'Curse Cloud', shape: 'ground', element: 'shadow', mult: 0.4, range: 24, radius: 5, delay: 0.3, repeats: 6, repeatEvery: 0.6,
      cooldown: 12, mp: 12, statuses: [{ id: 'curse', seconds: 6 }],
      ranks: ranks({ radius: 1.5 }, { repeats: 3 }),
    },
    dark_wave: {
      name: 'Dark Wave', shape: 'melee', element: 'shadow', mult: 1.9, reach: 11, arc: 1.3, cooldown: 8, mp: 10,
      knock: { push: 5, down: 1 },
      ranks: ranks({ reach: 3 }, { arc: 0.5, knock: { push: 6, down: 1.8 } }),
    },
    shadow_nova: {
      name: 'Shadow Nova', shape: 'around', element: 'shadow', mult: 1.8, radius: 7, hpCost: 0.05, cooldown: 10, mp: 12,
      knock: { push: 4, down: 1.5 },
      ranks: ranks({ radius: 1.5 }, { knock: { push: 5, down: 2.2 } }),
    },
    terror: {
      name: 'Terror', shape: 'ground', element: 'shadow', mult: 0.6, range: 20, radius: 5, delay: 0.3, cooldown: 18, mp: 12,
      statuses: [{ id: 'fear', seconds: 3 }],
      ranks: ranks({ radius: 1.5 }, { seconds: 1.5 }),
    },
    blood_pact: {
      name: 'Blood Pact', shape: 'self', element: 'shadow', hpCost: 0.15, cooldown: 30, mp: 8,
      selfBuff: { name: 'Blood Pact', seconds: 12, damage: 0.4, haste: 0.2 },
    },
    demon_gate: {
      name: 'Demon Gate', shape: 'ground', element: 'shadow', mult: 2.4, range: 26, radius: 5, delay: 0.4, hpCost: 0.1,
      cooldown: 40, mp: 28, knock: { push: 5, down: 2 },
      place: { kind: 'zone', seconds: 10, radius: 8, every: 0.75, strike: { mult: 0.35 } },
    },
    dark_star: {
      name: 'Dark Star', shape: 'ground', element: 'shadow', mult: 4.2, range: 30, radius: 8, delay: 1.2, cooldown: 30, mp: 30,
      knock: { push: 6, down: 3 }, statuses: [{ id: 'curse', seconds: 6 }],
    },
  },
  nodes: [
    // level 1
    spell('shadow_burst', 1, { free: true }), prof('wand', 1, { free: true }),
    spell('drain_life', 1), spell('summon_imp', 1), prof('dagger', 1), prof('staff', 1), prof('tome', 1),
    // level 2
    spell('curse_cloud', 2), spell('dark_wave', 2), prof('leather', 2), mastery('wand', 2),
    // level 3
    spell('shadow_nova', 3), passive('dark_power', 'Dark Power', 3, { shadowPct: 25 }), mastery('staff', 3), mastery('dagger', 3),
    // level 4
    rank('shadow_burst', 2, 4), rank('drain_life', 2, 4), rank('summon_imp', 2, 4), spell('terror', 4),
    // level 5
    rank('curse_cloud', 2, 5), rank('dark_wave', 2, 5), spell('blood_pact', 5), passive('demon_bond', 'Demon Bond', 5, { petPct: 40 }),
    // level 6
    rank('shadow_nova', 2, 6), passive('deep_mana', 'Deep Mana', 6, { maxMpPct: 40, mpRegen: 2 }),
    mod('hungry_shadows', 'Hungry Shadows', 'drain_life', 6, { mult: 1.2, add: { leech: 0.2 } }),
    mod('cursed_burst', 'Cursed Burst', 'shadow_burst', 6, { add: { statuses: [{ id: 'curse', seconds: 4 }] } }),
    // level 7
    rank('shadow_burst', 3, 7), rank('drain_life', 3, 7), rank('terror', 2, 7), passive('cruel_mind', 'Cruel Mind', 7, { critChance: 6 }),
    // level 8
    rank('curse_cloud', 3, 8), rank('dark_wave', 3, 8), rank('summon_imp', 3, 8), passive('quick_hexes', 'Quick Hexes', 8, { cooldownPct: 25 }),
    // level 9
    rank('shadow_nova', 3, 9), passive('dark_hunger', 'Dark Hunger', 9, { lifeSteal: 10 }), passive('cruel_blows', 'Cruel Blows', 9, { critDamage: 50 }),
    mod('big_nova', 'Big Nova', 'shadow_nova', 9, { mult: 1.3, add: { radius: 2 } }),
    // level 10: pick one
    capstone(spell('demon_gate', 10)), capstone(spell('dark_star', 10)),
  ],
};
