// Pyromancer — fire, and more fire (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Everything burns and everything explodes: bursts where they stand, a wall of fire along a line, a wave of flame in a
// cone, a nova that throws the room back, bombs that go off a moment later. No heals, no shields.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  spells: {
    flame_burst: {
      name: 'Flame Burst', shape: 'ground', element: 'fire', mult: 1.6, range: 24, radius: 3.5, delay: 0.3, cooldown: 2.5, mp: 6,
      knock: { push: 2 }, statuses: [{ id: 'burn', seconds: 4 }],
      ranks: ranks({ radius: 1 }, { knock: { push: 3, down: 1 } }),
    },
    flame_wave: {
      name: 'Flame Wave', shape: 'melee', element: 'fire', mult: 2, reach: 10, arc: 1.6, cooldown: 8, mp: 10,
      knock: { push: 5, down: 1 }, statuses: [{ id: 'burn', seconds: 4 }],
      ranks: ranks({ reach: 3 }, { arc: 0.5, knock: { push: 6, down: 1.8 } }),
    },
    fire_wall: {
      // a line of fire that keeps bursting up out of the ground
      name: 'Fire Wall', shape: 'beam', element: 'fire', mult: 0.55, range: 18, width: 3.5, repeats: 5, repeatEvery: 0.5,
      cooldown: 12, mp: 12, statuses: [{ id: 'burn', seconds: 4 }],
      ranks: ranks({ repeats: 2 }, { width: 1.5 }),
    },
    fire_nova: {
      name: 'Fire Nova', shape: 'around', element: 'fire', mult: 1.8, radius: 7, cooldown: 10, mp: 12,
      knock: { push: 4, down: 1.5 }, statuses: [{ id: 'burn', seconds: 4 }],
      ranks: ranks({ radius: 1.5 }, { knock: { push: 5, down: 2.2 } }),
    },
    fire_bomb: {
      // stuck to the ground, it goes off a second later and throws everyone round it
      name: 'Fire Bomb', shape: 'ground', element: 'fire', mult: 2.8, range: 24, radius: 6, delay: 1.2, cooldown: 12, mp: 14,
      knock: { push: 5, down: 2 },
      ranks: ranks({ radius: 1 }, { knock: { push: 6, down: 2.8 } }),
    },
    flame_dash: {
      name: 'Flame Dash', shape: 'dash', element: 'fire', mult: 1.3, range: 12, splash: 2, cooldown: 9, mp: 8,
      dash: { range: 12 }, knock: { push: 2 }, statuses: [{ id: 'burn', seconds: 4 }],
      ranks: ranks({ range: 3, dash: { range: 15 } }, { knock: { push: 3, down: 1.2 } }),
    },
    flame_pillar: {
      name: 'Flame Pillar', shape: 'ground', element: 'fire', mult: 2.6, range: 26, radius: 3, delay: 0.5, cooldown: 9, mp: 10,
      knock: { push: 1, down: 2 },
      ranks: ranks({ radius: 1 }, { repeats: 2, repeatEvery: 0.5 }),
    },
    inferno: {
      name: 'Inferno', shape: 'around', element: 'fire', mult: 3.6, radius: 12, cooldown: 30, mp: 30,
      knock: { push: 7, down: 3 }, statuses: [{ id: 'burn', seconds: 6 }],
    },
    fire_storm: {
      name: 'Fire Storm', shape: 'ground', element: 'fire', mult: 0.75, range: 30, radius: 10, delay: 0.4, repeats: 10, repeatEvery: 0.35,
      cooldown: 30, mp: 30, knock: { push: 1.5, down: 0.8 }, statuses: [{ id: 'burn', seconds: 4 }],
    },
  },
  nodes: [
    // level 1
    spell('flame_burst', 1, { free: true }), prof('wand', 1, { free: true }),
    spell('flame_wave', 1), prof('staff', 1), prof('dagger', 1), prof('orb', 1),
    // level 2
    spell('fire_wall', 2), spell('fire_nova', 2), mastery('wand', 2), prof('tome', 2),
    // level 3
    spell('fire_bomb', 3), passive('fire_power', 'Fire Power', 3, { firePct: 25 }), mastery('staff', 3),
    passive('burning_mind', 'Burning Mind', 3, { spellPct: 25 }),
    // level 4
    rank('flame_burst', 2, 4), rank('flame_wave', 2, 4), spell('flame_dash', 4), passive('deep_mana', 'Deep Mana', 4, { maxMpPct: 40, mpRegen: 2 }),
    // level 5
    spell('flame_pillar', 5), rank('fire_wall', 2, 5), rank('fire_nova', 2, 5),
    mod('big_burst', 'Big Burst', 'flame_burst', 5, { mult: 1.25, add: { radius: 1.5 } }),
    // level 6
    rank('fire_bomb', 2, 6), rank('flame_dash', 2, 6), passive('hot_blood', 'Hot Blood', 6, { hastePct: 25 }),
    mod('scorching_wave', 'Scorching Wave', 'flame_wave', 6, { add: { reach: 3, statuses: [{ id: 'burn', seconds: 6 }] } }),
    // level 7
    rank('flame_burst', 3, 7), rank('flame_wave', 3, 7), rank('flame_pillar', 2, 7), passive('wildfire', 'Wildfire', 7, { critChance: 6 }),
    // level 8
    rank('fire_wall', 3, 8), rank('fire_nova', 3, 8), passive('quick_fire', 'Quick Fire', 8, { cooldownPct: 25 }),
    mod('cluster_bombs', 'Cluster Bombs', 'fire_bomb', 8, { add: { repeats: 3, repeatEvery: 0.35 } }),
    // level 9
    rank('fire_bomb', 3, 9), rank('flame_pillar', 3, 9), passive('searing_heat', 'Searing Heat', 9, { critDamage: 60 }),
    passive('fire_heart', 'Fire Heart', 9, { spellPct: 40, maxHpPct: -20 }),
    // level 10: pick one
    capstone(spell('inferno', 10)), capstone(spell('fire_storm', 10)),
  ],
};
