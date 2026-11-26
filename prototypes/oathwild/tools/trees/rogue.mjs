// Rogue — blades in the dark (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Knives thrown all round you, a jump through the shadows that lands on top of them, poison clouds, a smoke bomb
// that leaves them reeling, and a dash that cuts through a whole line.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  power: 1.5,   // balance factor on every damage number (lead pass 2026-11-26, tools/sim-fights.mjs)
  starter: ['dagger', 'dagger', 'light_chest', 'light_legs', 'light_boots'],
  dualWield: true,
  spells: {
    fan_of_knives: {
      name: 'Fan of Knives', shape: 'around', element: 'physical', mult: 1.3, radius: 6, cooldown: 3, mp: 4,
      knock: { push: 1 },
      ranks: ranks({ radius: 1.5 }, { statuses: [{ id: 'bleed', seconds: 5 }] }),
    },
    eviscerate: {
      name: 'Eviscerate', shape: 'melee', element: 'physical', mult: 2.4, reach: 3.6, arc: 1.6, cooldown: 7, mp: 8,
      execute: { below: 0.3, mult: 1 }, statuses: [{ id: 'bleed', seconds: 6 }],
      ranks: ranks({ reach: 1 }, { execute: { below: 0.4, mult: 1 } }),
    },
    shadow_step: {
      // vanish and land on top of them, knocking the ones there off their feet
      name: 'Shadow Step', shape: 'leap', element: 'physical', mult: 1.6, range: 14, radius: 3.5, cooldown: 9, mp: 6,
      knock: { push: 1.5, down: 1 },
      ranks: ranks({ range: 4 }, { radius: 1.5 }),
    },
    poison_cloud: {
      name: 'Poison Cloud', shape: 'ground', element: 'poison', mult: 0.35, range: 22, radius: 5, delay: 0.3,
      repeats: 8, repeatEvery: 0.6, cooldown: 12, mp: 12, statuses: [{ id: 'poison', seconds: 4 }],
      ranks: ranks({ radius: 1 }, { repeats: 4 }),
    },
    blade_rush: {
      name: 'Blade Rush', shape: 'dash', element: 'physical', mult: 1.6, range: 12, splash: 1.8, cooldown: 9, mp: 8,
      dash: { range: 12 }, knock: { push: 2, down: 1 },
      ranks: ranks({ range: 3, dash: { range: 15 } }, { statuses: [{ id: 'bleed', seconds: 6 }] }),
    },
    smoke_bomb: {
      name: 'Smoke Bomb', shape: 'ground', element: 'physical', mult: 0.8, range: 16, radius: 5, delay: 0.3, cooldown: 14, mp: 10,
      knock: { push: 2 }, statuses: [{ id: 'stagger', seconds: 2 }, { id: 'weaken', seconds: 5 }],
      ranks: ranks({ radius: 1.5 }, { statuses: [{ id: 'fear', seconds: 2 }] }),
    },
    knife_storm: {
      name: 'Knife Storm', shape: 'around', element: 'physical', mult: 0.7, radius: 9, repeats: 8, repeatEvery: 0.25,
      cooldown: 28, mp: 26, knock: { push: 1 }, statuses: [{ id: 'bleed', seconds: 6 }],
    },
    assassinate: {
      name: 'Assassinate', shape: 'leap', element: 'physical', mult: 4, range: 18, radius: 5, cooldown: 30, mp: 24,
      execute: { below: 0.35, mult: 1.5 }, knock: { push: 4, down: 2 },
    },
  },
  nodes: [
    // level 1
    spell('fan_of_knives', 1, { free: true }), prof('dagger', 1, { free: true }), prof('leather', 1, { free: true }),
    spell('eviscerate', 1), prof('sword', 1), prof('axe', 1), prof('crossbow', 1),
    // level 2
    spell('shadow_step', 2), spell('poison_cloud', 2), mastery('dagger', 2), prof('mace', 2),
    // level 3
    spell('blade_rush', 3), mastery('sword', 3), mastery('axe', 3), passive('poisoner', 'Poisoner', 3, { poisonPct: 30 }),
    passive('cold_blood', 'Cold Blood', 3, { critChance: 6 }),
    // level 4
    rank('fan_of_knives', 2, 4), rank('eviscerate', 2, 4), spell('smoke_bomb', 4),
    passive('light_feet', 'Light Feet', 4, { dodge: 15, movePct: 20 }),
    // level 5
    rank('shadow_step', 2, 5), rank('poison_cloud', 2, 5), passive('backstabber', 'Backstabber', 5, { meleePct: 25 }),
    mod('toxic_blades', 'Toxic Blades', 'fan_of_knives', 5, { add: { statuses: [{ id: 'poison', seconds: 5 }] } }),
    // level 6
    rank('blade_rush', 2, 6), rank('smoke_bomb', 2, 6), passive('vital_spots', 'Vital Spots', 6, { critDamage: 50 }),
    mod('deep_cuts', 'Deep Cuts', 'eviscerate', 6, { mult: 1.3, add: { statuses: [{ id: 'bleed', seconds: 8 }] } }),
    // level 7
    rank('fan_of_knives', 3, 7), rank('eviscerate', 3, 7), rank('poison_cloud', 3, 7),
    passive('quick_blades', 'Quick Blades', 7, { hastePct: 25 }),
    // level 8
    rank('shadow_step', 3, 8), rank('blade_rush', 3, 8), passive('quick_recovery', 'Quick Recovery', 8, { cooldownPct: 25 }),
    mod('spreading_cloud', 'Spreading Cloud', 'poison_cloud', 8, { add: { radius: 2 } }),
    // level 9
    rank('smoke_bomb', 3, 9), passive('killer_edge', 'Killer Edge', 9, { physicalPct: 30 }),
    mod('hard_landing', 'Hard Landing', 'shadow_step', 9, { mult: 1.3, add: { knock: { push: 3, down: 2 } } }),
    // level 10: pick one
    capstone(spell('knife_storm', 10)), capstone(spell('assassinate', 10)),
  ],
};
