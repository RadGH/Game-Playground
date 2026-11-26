// Witch Hunter — hunter of magic and fiends (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// A crossbow that sprays a cone of bolts, holy arrows through a line, iron nets and holy bombs thrown onto a crowd,
// a chain hook that drags them in, a silver blade for the ones that get close. Bow abilities use the weapon.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  mpScale: 0.5,   // a melee hybrid has little mana: its abilities cost half (lead pass 2026-11-26)
  spells: {
    scatter_shot: {
      name: 'Scatter Shot', shape: 'melee', element: 'physical', powerFrom: 'weapon', mult: 1.4, reach: 14, arc: 1, cooldown: 3, mp: 4,
      knock: { push: 1.5 },
      ranks: ranks({ reach: 3 }, { knock: { push: 2.5, down: 1 } }),
    },
    holy_arrow: {
      name: 'Holy Arrow', shape: 'beam', element: 'holy', powerFrom: 'blendRanged', mult: 1.8, range: 26, width: 2, cooldown: 6, mp: 6,
      knock: { push: 2 },
      ranks: ranks({ range: 6 }, { width: 1, statuses: [{ id: 'weaken', seconds: 4 }] }),
    },
    silver_slash: {
      name: 'Silver Slash', shape: 'melee', element: 'holy', powerFrom: 'blend', mult: 1.7, reach: 4.5, arc: 2.4, cooldown: 6, mp: 6,
      knock: { push: 2 },
      ranks: ranks({ reach: 1 }, { knock: { push: 3, down: 1.2 } }),
    },
    iron_net: {
      name: 'Iron Net', shape: 'ground', element: 'physical', powerFrom: 'weapon', mult: 0.5, range: 18, radius: 4, delay: 0.3,
      cooldown: 12, mp: 8, statuses: [{ id: 'root', seconds: 3 }],
      ranks: ranks({ radius: 1.5 }, { seconds: 1.5 }),
    },
    chain_hook: {
      name: 'Chain Hook', shape: 'beam', element: 'physical', powerFrom: 'weapon', mult: 1.3, range: 18, width: 2, cooldown: 10, mp: 8,
      pullIn: { metres: 8 }, knock: { stagger: 1 },
      ranks: ranks({ range: 4 }, { width: 1.5 }),
    },
    holy_bomb: {
      name: 'Holy Bomb', shape: 'ground', element: 'holy', mult: 2.2, range: 22, radius: 5, delay: 0.6, cooldown: 10, mp: 10,
      knock: { push: 4, down: 1.5 },
      ranks: ranks({ radius: 1 }, { knock: { push: 5, down: 2.2 } }),
    },
    silence_bomb: {
      name: 'Silence Bomb', shape: 'ground', element: 'holy', mult: 1.2, range: 22, radius: 5, delay: 0.4, cooldown: 14, mp: 10,
      statuses: [{ id: 'silence', seconds: 3 }],
      ranks: ranks({ radius: 1.5 }, { seconds: 1.5 }),
    },
    combat_roll: {
      name: 'Combat Roll', shape: 'leap', element: 'physical', powerFrom: 'weapon', mult: 0.9, range: 10, radius: 3.5, cooldown: 8, mp: 4,
      knock: { push: 3 },
    },
    purge: {
      name: 'Purge', shape: 'around', element: 'holy', mult: 3.6, radius: 12, cooldown: 30, mp: 28,
      knock: { push: 6, down: 2.5 }, statuses: [{ id: 'silence', seconds: 3 }],
    },
    bolt_storm: {
      name: 'Bolt Storm', shape: 'ground', element: 'physical', powerFrom: 'weapon', mult: 0.75, range: 30, radius: 9, delay: 0.5,
      repeats: 10, repeatEvery: 0.3, cooldown: 30, mp: 28, knock: { push: 1, down: 0.8 },
    },
  },
  nodes: [
    // level 1
    spell('scatter_shot', 1, { free: true }), prof('crossbow', 1, { free: true }),
    spell('holy_arrow', 1), spell('silver_slash', 1), prof('bow', 1), prof('sword', 1), prof('mail', 1),
    // level 2
    spell('iron_net', 2), spell('chain_hook', 2), mastery('crossbow', 2), prof('axe', 2), prof('leather', 2),
    // level 3
    spell('holy_bomb', 3), mastery('bow', 3), mastery('sword', 3), passive('holy_silver', 'Holy Silver', 3, { holyPct: 25 }),
    // level 4
    rank('scatter_shot', 2, 4), rank('holy_arrow', 2, 4), rank('silver_slash', 2, 4), spell('silence_bomb', 4),
    // level 5
    spell('combat_roll', 5), rank('iron_net', 2, 5), rank('chain_hook', 2, 5), passive('sharpshooter', 'Sharpshooter', 5, { rangedPct: 25 }),
    // level 6
    rank('holy_bomb', 2, 6), passive('spell_breaker', 'Spell Breaker', 6, { magicResist: 25 }),
    passive('iron_will', 'Iron Will', 6, { maxHpPct: 30 }),
    mod('wide_scatter', 'Wide Scatter', 'scatter_shot', 6, { add: { arc: 0.5, reach: 3 } }),
    // level 7
    rank('scatter_shot', 3, 7), rank('holy_arrow', 3, 7), rank('silver_slash', 3, 7), passive('keen_eye', 'Keen Eye', 7, { critChance: 6 }),
    // level 8
    rank('silence_bomb', 2, 8), rank('iron_net', 3, 8), passive('quick_reload', 'Quick Reload', 8, { cooldownPct: 25 }),
    mod('barbed_hook', 'Barbed Hook', 'chain_hook', 8, { add: { statuses: [{ id: 'bleed', seconds: 6 }], knock: { down: 1.5 } } }),
    // level 9
    rank('holy_bomb', 3, 9), rank('chain_hook', 3, 9), passive('deadly_bolts', 'Deadly Bolts', 9, { critDamage: 50 }),
    mod('blast_bomb', 'Blast Bomb', 'holy_bomb', 9, { mult: 1.2, add: { radius: 2 } }),
    // level 10: pick one
    capstone(spell('purge', 10)), capstone(spell('bolt_storm', 10)),
  ],
};
