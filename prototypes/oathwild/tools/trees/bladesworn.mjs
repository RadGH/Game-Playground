// Bladesworn — weapon master, specialty (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Years with one weapon: a perfect cut in a wide arc, a sweep that knocks the ring down, a rising slash down a line,
// a hundred cuts in a breath. A mastery for each weapon kind — pick yours.
import { spell, rank, prof, mastery, passive, capstone, ranks } from './_dsl.mjs';

export default {
  mpScale: 0.5,   // a melee hybrid has little mana: its abilities cost half (lead pass 2026-11-26)
  power: 1.3,   // balance factor on every damage number (lead pass 2026-11-26, tests/rules/combat.test.mjs level-10 fights)
  spells: {
    perfect_cut: {
      name: 'Perfect Cut', shape: 'melee', element: 'physical', mult: 1.7, reach: 4.5, arc: 2.6, cooldown: 3, mp: 4,
      knock: { push: 1.5 },
      ranks: ranks({ reach: 1 }, { knock: { push: 2.5, down: 1 } }),
    },
    sweeping_blow: {
      name: 'Sweeping Blow', shape: 'around', element: 'physical', mult: 1.8, radius: 6, cooldown: 8, mp: 8,
      knock: { push: 3, down: 1.2 },
      ranks: ranks({ radius: 1.5 }, { knock: { push: 4, down: 2 } }),
    },
    rising_slash: {
      name: 'Rising Slash', shape: 'beam', element: 'physical', mult: 2.2, range: 10, width: 3, cooldown: 9, mp: 8,
      knock: { push: 2, down: 2 },
      ranks: ranks({ range: 4 }, { width: 1.5 }),
    },
    hundred_cuts: {
      name: 'Hundred Cuts', shape: 'melee', element: 'physical', mult: 0.45, reach: 5, arc: 1.8, repeats: 8, repeatEvery: 0.15,
      cooldown: 12, mp: 10, statuses: [{ id: 'bleed', seconds: 5 }],
      ranks: ranks({ repeats: 2 }, { arc: 0.6 }),
    },
    battle_stance: {
      name: 'Battle Stance', shape: 'self', element: 'physical', cooldown: 25, mp: 8,
      selfBuff: { name: 'Battle Stance', seconds: 12, damage: 0.35, haste: 0.2 },
    },
    final_blow: {
      name: 'Final Blow', shape: 'leap', element: 'physical', mult: 4, range: 16, radius: 6, cooldown: 28, mp: 20,
      knock: { push: 6, down: 3 },
    },
    whirling_steel: {
      name: 'Whirling Steel', shape: 'around', element: 'physical', mult: 0.55, radius: 8, repeats: 10, repeatEvery: 0.25,
      cooldown: 28, mp: 20, pullIn: { metres: 0.8 }, knock: { push: 1.5 },
    },
  },
  nodes: [
    // level 1: pick your weapon
    spell('perfect_cut', 1, { free: true }),
    prof('sword', 1), prof('axe', 1), prof('mace', 1), prof('twohand', 1), prof('spear', 1),
    // level 2
    spell('sweeping_blow', 2), spell('rising_slash', 2), mastery('sword', 2), mastery('axe', 2), mastery('mace', 2),
    mastery('twohand', 2), mastery('spear', 2),
    // level 3
    spell('hundred_cuts', 3), rank('perfect_cut', 2, 3), rank('sweeping_blow', 2, 3), passive('weapon_expert', 'Weapon Expert', 3, { physicalPct: 30 }),
    // level 4
    spell('battle_stance', 4), rank('rising_slash', 2, 4), rank('hundred_cuts', 2, 4), passive('perfect_aim', 'Perfect Aim', 4, { critChance: 6 }),
    passive('heavy_hands', 'Heavy Hands', 4, { critDamage: 50 }),
    // level 5: pick a capstone
    capstone(spell('final_blow', 5)), capstone(spell('whirling_steel', 5)), rank('perfect_cut', 3, 5),
  ],
};
