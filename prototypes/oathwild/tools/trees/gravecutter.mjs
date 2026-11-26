// Gravecutter — assassin, specialty (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Poisoned slashes, a mark thrown on a group, a silent leap onto them, a poison bomb, and the cut that finishes it.
import { spell, rank, prof, mastery, passive, capstone, ranks } from './_dsl.mjs';

export default {
  mpScale: 0.5,   // a melee hybrid has little mana: its abilities cost half (lead pass 2026-11-26)
  spells: {
    venom_slash: {
      name: 'Venom Slash', shape: 'melee', element: 'poison', powerFrom: 'weapon', mult: 1.5, reach: 4, arc: 2, cooldown: 3, mp: 4,
      knock: { push: 1 }, statuses: [{ id: 'poison', seconds: 4 }],
      ranks: ranks({ reach: 1 }, { arc: 0.6 }),
    },
    death_mark: {
      name: 'Death Mark', shape: 'ground', element: 'shadow', powerFrom: 'weapon', mult: 1.2, range: 20, radius: 4, delay: 0.2,
      cooldown: 10, mp: 8, statuses: [{ id: 'marked', seconds: 8 }],
      ranks: ranks({ radius: 1.5 }, { seconds: 4 }),
    },
    finishing_cut: {
      name: 'Finishing Cut', shape: 'melee', element: 'physical', mult: 2.2, reach: 3.8, arc: 1.4, cooldown: 8, mp: 8,
      execute: { below: 0.35, mult: 1.5 }, knock: { push: 2, down: 1 },
      ranks: ranks({ arc: 0.6 }, { execute: { below: 0.45, mult: 1.5 } }),
    },
    silent_leap: {
      name: 'Silent Leap', shape: 'leap', element: 'physical', mult: 1.8, range: 15, radius: 4, cooldown: 9, mp: 6,
      knock: { push: 3, down: 1.5 },
      ranks: ranks({ range: 4 }, { radius: 1.5 }),
    },
    poison_bomb: {
      name: 'Poison Bomb', shape: 'ground', element: 'poison', powerFrom: 'weapon', mult: 1.6, range: 20, radius: 5, delay: 0.4,
      cooldown: 11, mp: 10, knock: { push: 3, down: 1 }, statuses: [{ id: 'poison', seconds: 6 }],
      ranks: ranks({ radius: 1 }, { knock: { push: 4, down: 1.8 } }),
    },
    death_sentence: {
      name: 'Death Sentence', shape: 'ground', element: 'shadow', powerFrom: 'weapon', mult: 4, range: 24, radius: 7, delay: 1,
      cooldown: 28, mp: 20, execute: { below: 0.35, mult: 1 }, knock: { push: 5, down: 2 },
    },
    venom_storm: {
      name: 'Venom Storm', shape: 'around', element: 'poison', powerFrom: 'weapon', mult: 0.6, radius: 9, repeats: 8, repeatEvery: 0.25,
      cooldown: 28, mp: 20, knock: { push: 1 }, statuses: [{ id: 'poison', seconds: 6 }],
    },
  },
  nodes: [
    // level 1
    spell('venom_slash', 1, { free: true }),
    spell('death_mark', 1), prof('dagger', 1), prof('sword', 1),
    // level 2
    spell('finishing_cut', 2), spell('silent_leap', 2), mastery('dagger', 2), mastery('sword', 2),
    // level 3
    spell('poison_bomb', 3), rank('venom_slash', 2, 3), rank('death_mark', 2, 3), passive('venom_lore', 'Venom Lore', 3, { poisonPct: 30 }),
    // level 4
    rank('finishing_cut', 2, 4), rank('silent_leap', 2, 4), rank('poison_bomb', 2, 4), passive('cold_killer', 'Cold Killer', 4, { critChance: 6 }),
    passive('deep_wounds', 'Deep Wounds', 4, { critDamage: 60 }),
    // level 5: pick a capstone
    capstone(spell('death_sentence', 5)), capstone(spell('venom_storm', 5)), rank('venom_slash', 3, 5),
  ],
};
