// Spellfletcher — arrows that carry spells, specialty (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Frost arrows that burst where they land, a flame arrow that burns a whole line, a force shot that blows a cone of
// them away, and a volley of lightning arrows. Every arrow uses the bow and the caster's mind together.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  spells: {
    frost_arrow: {
      name: 'Frost Arrow', shape: 'ground', element: 'ice', powerFrom: 'blendRanged', mult: 1.6, range: 28, radius: 4, delay: 0.35,
      cooldown: 3, mp: 5, knock: { push: 1.5 }, statuses: [{ id: 'chill', seconds: 3 }],
      ranks: ranks({ radius: 1 }, { knock: { push: 2.5, down: 1 } }),
    },
    flame_arrow: {
      name: 'Flame Arrow', shape: 'beam', element: 'fire', powerFrom: 'blendRanged', mult: 1.8, range: 26, width: 2, cooldown: 6, mp: 6,
      statuses: [{ id: 'burn', seconds: 4 }],
      ranks: ranks({ range: 6 }, { width: 1 }),
    },
    force_shot: {
      name: 'Force Shot', shape: 'melee', element: 'arcane', powerFrom: 'blendRanged', mult: 1.8, reach: 10, arc: 1, cooldown: 8, mp: 8,
      knock: { push: 7, down: 1.2 },
      ranks: ranks({ reach: 3 }, { arc: 0.4, knock: { push: 8, down: 2 } }),
    },
    storm_volley: {
      name: 'Storm Volley', shape: 'ground', element: 'lightning', powerFrom: 'blendRanged', mult: 0.7, range: 28, radius: 6, delay: 0.5,
      repeats: 5, repeatEvery: 0.4, cooldown: 12, mp: 12, statuses: [{ id: 'shock', seconds: 3 }],
      ranks: ranks({ radius: 1.5 }, { repeats: 2 }),
    },
    comet_arrow: {
      name: 'Comet Arrow', shape: 'ground', element: 'fire', powerFrom: 'blendRanged', mult: 4, range: 32, radius: 8, delay: 0.8,
      cooldown: 28, mp: 24, knock: { push: 6, down: 2.5 }, statuses: [{ id: 'burn', seconds: 6 }],
    },
    ice_storm: {
      name: 'Ice Storm', shape: 'ground', element: 'ice', powerFrom: 'blendRanged', mult: 0.7, range: 30, radius: 9, delay: 0.5,
      repeats: 10, repeatEvery: 0.35, cooldown: 28, mp: 24, knock: { push: 1, down: 0.8 }, statuses: [{ id: 'chill', seconds: 3 }],
    },
  },
  nodes: [
    // level 1
    spell('frost_arrow', 1, { free: true }),
    spell('flame_arrow', 1), prof('bow', 1), prof('crossbow', 1),
    // level 2
    spell('force_shot', 2), mastery('bow', 2), mastery('crossbow', 2), passive('spell_arrows', 'Spell Arrows', 2, { spellPct: 25 }),
    // level 3
    spell('storm_volley', 3), rank('frost_arrow', 2, 3), rank('flame_arrow', 2, 3), passive('frost_tips', 'Frost Tips', 3, { icePct: 25 }),
    // level 4
    rank('force_shot', 2, 4), rank('storm_volley', 2, 4), passive('sharp_eye', 'Sharp Eye', 4, { critChance: 6 }),
    mod('freezing_arrow', 'Freezing Arrow', 'frost_arrow', 4, { add: { statuses: [{ id: 'root', seconds: 1.5 }] } }),
    // level 5: pick a capstone
    capstone(spell('comet_arrow', 5)), capstone(spell('ice_storm', 5)), rank('frost_arrow', 3, 5),
  ],
};
