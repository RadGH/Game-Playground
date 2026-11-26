// Druid — shapeshifter and storm (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Turns into REAL animals (wolf, bear, mountain cat) and fights in them, or stays a caster throwing thorns and
// tornadoes. Wolves come when called. One heal (Healing Bloom); everything else is fighting.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  power: 1.3,   // balance factor on every damage number (lead pass 2026-11-26, tools/sim-fights.mjs)
  role: 'Shapeshifter and storm',
  blurb: 'Becomes the wolf, the bear or the mountain cat, calls wolves to the fight, and throws thorns and tornadoes.',
  starter: ['quarterstaff', 'light_chest', 'light_legs'],
  spells: {
    thorn_blast: {
      name: 'Thorn Blast', shape: 'melee', element: 'nature', mult: 1.5, reach: 10, arc: 1.2, cooldown: 3, mp: 6,
      knock: { push: 1.5 }, statuses: [{ id: 'bleed', seconds: 4 }],
      ranks: ranks({ reach: 3 }, { knock: { push: 3, down: 1 } }),
    },
    wolf_shape: {
      name: 'Wolf Shape', shape: 'self', element: 'nature', cooldown: 1.5, mp: 8,
      form: { id: 'wolf', name: 'Wolf', group: 'shape', toggle: true, body: { creature: 'wolf', scale: 1.25 },
        stats: { movePct: 0.25, hastePct: 0.2, armorPct: -0.15 },
        basic: { shape: 'melee', reach: 2.4, arc: 1.8, mult: 0.6, hits: 2, element: 'physical', status: 'bleed' } },
    },
    bear_shape: {
      name: 'Bear Shape', shape: 'self', element: 'nature', cooldown: 1.5, mp: 8, taunt: { radius: 6, seconds: 3 },
      form: { id: 'bear', name: 'Bear', group: 'shape', toggle: true, body: { creature: 'bear', scale: 1.3 },
        stats: { armorPct: 0.6, maxHpPct: 0.3, thorns: 0.1 },
        basic: { shape: 'melee', reach: 2.8, arc: 2.4, mult: 1.1, element: 'physical' } },
    },
    cat_shape: {
      name: 'Cat Shape', shape: 'self', element: 'nature', cooldown: 1.5, mp: 8,
      form: { id: 'cat', name: 'Mountain Cat', group: 'shape', toggle: true, body: { creature: 'cat', scale: 1.2 },
        stats: { movePct: 0.35, hastePct: 0.1, armorPct: -0.1 },
        basic: { shape: 'melee', reach: 2.6, arc: 1.4, mult: 1.3, hits: 1, element: 'physical' } },
    },
    grasping_roots: {
      name: 'Grasping Roots', shape: 'ground', element: 'nature', mult: 1.1, range: 22, radius: 5, delay: 0.3,
      cooldown: 12, mp: 10, statuses: [{ id: 'root', seconds: 3 }],
      ranks: ranks({ radius: 1.5 }, { statuses: [{ id: 'bleed', seconds: 6 }] }),
    },
    pounce: {
      name: 'Pounce', shape: 'leap', element: 'physical', mult: 1.7, range: 12, radius: 3.5, cooldown: 8, mp: 6,
      knock: { push: 2, down: 1.2 }, statuses: [{ id: 'bleed', seconds: 5 }],
      ranks: ranks({ range: 4 }, { radius: 1.5, knock: { push: 3, down: 1.8 } }),
    },
    roar: {
      name: 'Roar', shape: 'around', element: 'physical', mult: 1.2, radius: 7, cooldown: 12, mp: 10,
      knock: { push: 4, down: 1.5 }, statuses: [{ id: 'weaken', seconds: 4 }],
      ranks: ranks({ radius: 1.5 }, { statuses: [{ id: 'fear', seconds: 2 }] }),
    },
    tornado: {
      name: 'Tornado', shape: 'ground', element: 'nature', mult: 0.55, range: 22, radius: 4.5, repeats: 6, repeatEvery: 0.4,
      cooldown: 14, mp: 16, pullIn: { metres: 0.8 }, knock: { push: 2 },
      ranks: ranks({ repeats: 2 }, { radius: 1.5, knock: { push: 2, down: 1 } }),
    },
    call_wolf: {
      name: 'Call Wolves', shape: 'summon', element: 'nature', pet: 'grove_wolf', count: 2, cooldown: 26, mp: 18,
      ranks: ranks({}, { count: 1 }),
    },
    healing_bloom: {
      name: 'Healing Bloom', shape: 'ground', element: 'nature', range: 25, radius: 6, cooldown: 24, mp: 22,
      place: { kind: 'zone', seconds: 8, radius: 6, every: 1, heal: 0.03 },
    },
    call_bear: {
      name: 'Call Bear', shape: 'summon', element: 'nature', pet: 'grove_bear', count: 1, cooldown: 40, mp: 26,
    },
    stampede: {
      // a charge with a herd of animal spirits behind you: everything in the way goes flying
      name: 'Stampede', shape: 'dash', element: 'physical', mult: 3.2, range: 20, splash: 3, cooldown: 30, mp: 26,
      dash: { range: 20 }, knock: { push: 6, down: 2.5 },
    },
    great_storm: {
      name: 'Great Storm', shape: 'ground', element: 'nature', mult: 0.65, range: 30, radius: 10, delay: 0.4,
      repeats: 10, repeatEvery: 0.35, cooldown: 32, mp: 30, pullIn: { metres: 0.6 }, knock: { push: 1.5, down: 1 },
    },
  },
  nodes: [
    // level 1
    spell('thorn_blast', 1, { free: true }), prof('staff', 1, { free: true }), prof('leather', 1, { free: true }),
    spell('wolf_shape', 1), spell('bear_shape', 1), spell('cat_shape', 1), prof('dagger', 1), prof('mace', 1),
    // level 2
    spell('grasping_roots', 2), spell('pounce', 2), spell('roar', 2), prof('spear', 2),
    // level 3
    spell('call_wolf', 3), spell('tornado', 3), mastery('staff', 3), passive('wild_power', 'Wild Power', 3, { naturePct: 25 }),
    // level 4
    rank('thorn_blast', 2, 4), rank('pounce', 2, 4), rank('roar', 2, 4), spell('healing_bloom', 4),
    // level 5
    rank('grasping_roots', 2, 5), rank('tornado', 2, 5), passive('thick_hide', 'Thick Hide', 5, { maxHpPct: 30 }),
    mod('pack_leader', 'Pack Leader', 'wolf_shape', 5, { add: { form: { pack: { pet: 'grove_wolf', count: 2, seconds: 30 } } } }),
    // level 6
    spell('call_bear', 6), rank('call_wolf', 2, 6), passive('feral_strength', 'Feral Strength', 6, { meleePct: 25 }),
    mod('thorn_spray', 'Thorn Spray', 'thorn_blast', 6, { add: { arc: 0.6 } }),
    // level 7
    rank('thorn_blast', 3, 7), rank('pounce', 3, 7), rank('roar', 3, 7), passive('predator', 'Predator', 7, { critChance: 6 }),
    // level 8
    rank('tornado', 3, 8), rank('grasping_roots', 3, 8), passive('quick_change', 'Quick Change', 8, { cooldownPct: 25 }),
    mod('thunder_roar', 'Thunder Roar', 'roar', 8, { mult: 1.3, add: { knock: { push: 5, down: 2.5 } } }),
    // level 9
    rank('call_wolf', 3, 9), passive('alpha', 'Alpha', 9, { petPct: 40 }), passive('natures_wrath', "Nature's Wrath", 9, { naturePct: 30, critDamage: 40 }),
    mod('big_cat', 'Big Cat', 'cat_shape', 9, { add: { form: { stats: { movePct: 0.5, hastePct: 0.3 } } } }),
    // level 10: pick one
    capstone(spell('stampede', 10)), capstone(spell('great_storm', 10)),
  ],
};
