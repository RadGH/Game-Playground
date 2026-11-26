// Ranger — bow and the wild (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Arrows as AREAS: a spread of arrows in a cone, a shot that goes through a whole line, arrows raining on a circle,
// an arrow that explodes and throws people. Every bow ability uses the bow (`powerFrom: 'weapon'`).
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  power: 0.8,   // balance factor on every damage number (lead pass 2026-11-26, tools/sim-fights.mjs)
  starter: ['shortbow', 'quiver', 'light_chest', 'light_legs'],
  dualWield: true,
  spells: {
    multi_shot: {
      name: 'Multi Shot', shape: 'melee', element: 'physical', powerFrom: 'weapon', mult: 1.4, reach: 16, arc: 0.9,
      cooldown: 3, mp: 4, knock: { push: 1 },
      ranks: ranks({ reach: 4 }, { statuses: [{ id: 'bleed', seconds: 5 }] }),
    },
    piercing_shot: {
      // one arrow that goes through everything in a line
      name: 'Piercing Shot', shape: 'beam', element: 'physical', powerFrom: 'weapon', mult: 1.9, range: 28, width: 1.8,
      cooldown: 6, mp: 6, knock: { push: 2 },
      ranks: ranks({ range: 6 }, { width: 1, knock: { push: 3, down: 1 } }),
    },
    explosive_arrow: {
      name: 'Explosive Arrow', shape: 'ground', element: 'fire', powerFrom: 'weapon', mult: 2.2, range: 28, radius: 4, delay: 0.4,
      cooldown: 9, mp: 10, knock: { push: 4, down: 1.5 }, statuses: [{ id: 'burn', seconds: 4 }],
      ranks: ranks({ radius: 1 }, { knock: { push: 5, down: 2.2 } }),
    },
    hunters_leap: {
      name: "Hunter's Leap", shape: 'leap', element: 'physical', powerFrom: 'weapon', mult: 1.2, range: 12, radius: 4,
      cooldown: 10, mp: 6, knock: { push: 3, down: 1 },
      ranks: ranks({ range: 4 }, { radius: 1.5 }),
    },
    snare_trap: {
      // a trap thrown onto a spot: it snaps shut on everything standing there
      name: 'Snare Trap', shape: 'ground', element: 'physical', powerFrom: 'weapon', mult: 1.2, range: 18, radius: 3.5, delay: 0.3,
      cooldown: 14, mp: 8, statuses: [{ id: 'root', seconds: 3 }],
      ranks: ranks({ radius: 1.5 }, { statuses: [{ id: 'bleed', seconds: 6 }] }),
    },
    volley: {
      name: 'Volley', shape: 'ground', element: 'physical', powerFrom: 'weapon', mult: 0.7, range: 30, radius: 5, delay: 0.5,
      repeats: 4, repeatEvery: 0.4, cooldown: 12, mp: 12,
      ranks: ranks({ radius: 1.5 }, { repeats: 2 }),
    },
    eagle_eye: {
      name: 'Eagle Eye', shape: 'self', element: 'physical', cooldown: 30, mp: 10,
      selfBuff: { name: 'Eagle Eye', seconds: 10, damage: 0.3, haste: 0.25 },
    },
    rain_of_arrows: {
      name: 'Rain of Arrows', shape: 'ground', element: 'physical', powerFrom: 'weapon', mult: 0.75, range: 32, radius: 9, delay: 0.6,
      repeats: 10, repeatEvery: 0.35, cooldown: 30, mp: 30, knock: { push: 1.5, down: 0.8 },
    },
    siege_arrow: {
      name: 'Siege Arrow', shape: 'ground', element: 'fire', powerFrom: 'weapon', mult: 4, range: 34, radius: 9, delay: 0.7,
      cooldown: 30, mp: 28, knock: { push: 6, down: 2.5 }, statuses: [{ id: 'burn', seconds: 6 }],
    },
  },
  nodes: [
    // level 1: the kit (free) + first choices
    spell('multi_shot', 1, { free: true }), prof('bow', 1, { free: true }), prof('leather', 1, { free: true }),
    spell('piercing_shot', 1), prof('sword', 1), prof('axe', 1), prof('dagger', 1), prof('crossbow', 1),
    // level 2
    spell('explosive_arrow', 2), spell('hunters_leap', 2), prof('dualWield', 2), prof('spear', 2),
    // level 3
    spell('snare_trap', 3), mastery('bow', 3), mastery('crossbow', 3), mastery('sword', 3),
    passive('sharp_eyes', 'Sharp Eyes', 3, { critChance: 5 }),
    // level 4
    rank('multi_shot', 2, 4), rank('piercing_shot', 2, 4), spell('volley', 4), prof('mail', 4, { needs: ['prof_leather'] }),
    // level 5
    rank('explosive_arrow', 2, 5), spell('eagle_eye', 5), passive('marksman', 'Marksman', 5, { rangedPct: 25 }),
    mod('wide_spread', 'Wide Spread', 'multi_shot', 5, { add: { arc: 0.5 } }),
    // level 6
    rank('volley', 2, 6), rank('hunters_leap', 2, 6), passive('swift_feet', 'Swift Feet', 6, { movePct: 25 }),
    mod('fire_arrows', 'Fire Arrows', 'volley', 6, { add: { statuses: [{ id: 'burn', seconds: 4 }] } }),
    // level 7
    rank('multi_shot', 3, 7), rank('piercing_shot', 3, 7), rank('snare_trap', 2, 7),
    passive('deadly_aim', 'Deadly Aim', 7, { critDamage: 50 }),
    // level 8
    rank('explosive_arrow', 3, 8), passive('quick_hands', 'Quick Hands', 8, { hastePct: 25 }),
    passive('quick_draw', 'Quick Draw', 8, { cooldownPct: 25 }),
    mod('cluster_arrow', 'Cluster Arrow', 'explosive_arrow', 8, { add: { repeats: 3, repeatEvery: 0.3 } }),
    // level 9
    rank('volley', 3, 9), rank('snare_trap', 3, 9), rank('hunters_leap', 3, 9), mastery('dagger', 9),
    passive('hunter_strength', 'Killer Shots', 9, { physicalPct: 30 }),
    // level 10: pick one
    capstone(spell('rain_of_arrows', 10)), capstone(spell('siege_arrow', 10)),
  ],
};
