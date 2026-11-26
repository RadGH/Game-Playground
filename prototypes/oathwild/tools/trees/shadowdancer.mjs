// Shadowdancer — shadow duellist, specialty (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Leaps through shadow onto a crowd, a burst of darkness that throws them back, and shadow clones that fight with you.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  mpScale: 0.5,   // a melee hybrid has little mana: its abilities cost half (lead pass 2026-11-26)
  spells: {
    shadow_slash: {
      name: 'Shadow Slash', shape: 'melee', element: 'shadow', powerFrom: 'weapon', mult: 1.5, reach: 4.5, arc: 2.2, cooldown: 3, mp: 4,
      knock: { push: 1.2 },
      ranks: ranks({ reach: 1 }, { statuses: [{ id: 'weaken', seconds: 4 }] }),
    },
    shadow_leap: {
      name: 'Shadow Leap', shape: 'leap', element: 'shadow', powerFrom: 'weapon', mult: 1.8, range: 16, radius: 4, cooldown: 8, mp: 6,
      knock: { push: 3, down: 1.2 },
      ranks: ranks({ range: 4 }, { radius: 1.5, knock: { push: 4, down: 1.8 } }),
    },
    darkness: {
      name: 'Darkness', shape: 'around', element: 'shadow', mult: 1.6, radius: 7, cooldown: 10, mp: 10,
      knock: { push: 4, down: 1.5 }, statuses: [{ id: 'fear', seconds: 2 }],
      ranks: ranks({ radius: 1.5 }, { knock: { push: 5, down: 2.2 } }),
    },
    shadow_dash: {
      name: 'Shadow Dash', shape: 'dash', element: 'shadow', powerFrom: 'weapon', mult: 1.6, range: 14, splash: 2, cooldown: 8, mp: 6,
      dash: { range: 14 }, knock: { push: 2 },
      ranks: ranks({ range: 4, dash: { range: 18 } }, { knock: { push: 3, down: 1.2 } }),
    },
    shadow_clones: {
      name: 'Shadow Clones', shape: 'self', element: 'shadow', cooldown: 30, mp: 18,
      summon: { def: 'shade', name: 'Shadow Clone', count: 2, lifetime: 10, temporary: true },
    },
    shadow_army: {
      name: 'Shadow Army', shape: 'around', element: 'shadow', mult: 2, radius: 8, cooldown: 40, mp: 28,
      knock: { push: 4, down: 1.5 },
      summon: { def: 'shade', name: 'Shadow Clone', count: 4, lifetime: 12, temporary: true },
    },
    night_strike: {
      name: 'Night Strike', shape: 'leap', element: 'shadow', powerFrom: 'weapon', mult: 4, range: 22, radius: 6, cooldown: 28, mp: 22,
      knock: { push: 6, down: 2.5 },
    },
  },
  nodes: [
    // level 1
    spell('shadow_slash', 1, { free: true }),
    spell('shadow_leap', 1), prof('dagger', 1), prof('sword', 1),
    // level 2
    spell('darkness', 2), spell('shadow_dash', 2), mastery('dagger', 2), mastery('sword', 2),
    // level 3
    spell('shadow_clones', 3), rank('shadow_slash', 2, 3), rank('shadow_leap', 2, 3), passive('dark_arts', 'Dark Arts', 3, { shadowPct: 25 }),
    // level 4
    rank('darkness', 2, 4), rank('shadow_dash', 2, 4), passive('night_eyes', 'Night Eyes', 4, { critChance: 6 }),
    mod('more_clones', 'More Clones', 'shadow_clones', 4, { add: { summon: { count: 4 } } }),
    // level 5: pick a capstone
    capstone(spell('shadow_army', 5)), capstone(spell('night_strike', 5)), rank('shadow_slash', 3, 5),
  ],
};
