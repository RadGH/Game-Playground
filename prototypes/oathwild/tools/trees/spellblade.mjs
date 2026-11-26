// Spellblade — magic on steel (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Every swing carries a spell: arcane slashes, fire in a wide arc, a lightning dash through the line, a wave of
// force thrown off the blade, runes that blow up under them. One defence (Magic Ward).
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  mpScale: 0.5,   // a melee hybrid has little mana: its abilities cost half (lead pass 2026-11-26)
  power: 1.35,   // balance factor on every damage number (lead pass 2026-11-26, tests/rules/combat.test.mjs level-10 fights)
  role: 'Magic on steel',
  spells: {
    arcane_slash: {
      name: 'Arcane Slash', shape: 'melee', element: 'arcane', powerFrom: 'blend', mult: 1.6, reach: 5, arc: 2.4, cooldown: 3, mp: 4,
      knock: { push: 1.5 },
      ranks: ranks({ reach: 1 }, { knock: { push: 2.5, down: 1 } }),
    },
    fire_slash: {
      name: 'Fire Slash', shape: 'melee', element: 'fire', powerFrom: 'blend', mult: 1.8, reach: 6, arc: 2, cooldown: 7, mp: 8,
      knock: { push: 2 }, statuses: [{ id: 'burn', seconds: 4 }],
      ranks: ranks({ reach: 2 }, { arc: 0.8 }),
    },
    lightning_dash: {
      name: 'Lightning Dash', shape: 'dash', element: 'lightning', powerFrom: 'blend', mult: 1.6, range: 14, splash: 2,
      cooldown: 9, mp: 8, dash: { range: 14 }, knock: { push: 3, down: 1 }, statuses: [{ id: 'shock', seconds: 3 }],
      ranks: ranks({ range: 4, dash: { range: 18 } }, { splash: 1 }),
    },
    arcane_spin: {
      name: 'Arcane Spin', shape: 'around', element: 'arcane', powerFrom: 'blend', mult: 0.8, radius: 6, repeats: 4, repeatEvery: 0.3,
      cooldown: 10, mp: 10, pullIn: { metres: 0.6 },
      ranks: ranks({ repeats: 1 }, { radius: 1.5 }),
    },
    blade_wave: {
      // a wave of force thrown off the sword down a line
      name: 'Blade Wave', shape: 'beam', element: 'arcane', powerFrom: 'blend', mult: 2.2, range: 18, width: 3, cooldown: 11, mp: 12,
      knock: { push: 4, down: 1.2 },
      ranks: ranks({ range: 5 }, { width: 1.5, knock: { push: 5, down: 2 } }),
    },
    rune_blast: {
      name: 'Rune Blast', shape: 'ground', element: 'arcane', mult: 2.4, range: 20, radius: 4.5, delay: 0.5, cooldown: 12, mp: 12,
      knock: { push: 4, down: 1.5 },
      ranks: ranks({ radius: 1 }, { knock: { push: 5, down: 2.2 } }),
    },
    phase_strike: {
      name: 'Phase Strike', shape: 'leap', element: 'arcane', powerFrom: 'blend', mult: 1.8, range: 15, radius: 4, cooldown: 10, mp: 10,
      knock: { push: 3 },
      ranks: ranks({ range: 5 }, { radius: 1.5, knock: { push: 4, down: 1.5 } }),
    },
    magic_ward: {
      name: 'Magic Ward', shape: 'self', element: 'arcane', cooldown: 30, mp: 12,
      selfBuff: { name: 'Magic Ward', seconds: 8, resist: 0.4 },
    },
    sword_storm: {
      name: 'Sword Storm', shape: 'around', element: 'arcane', powerFrom: 'blend', mult: 0.7, radius: 10, repeats: 8, repeatEvery: 0.3,
      cooldown: 28, mp: 26, pullIn: { metres: 0.6 }, knock: { push: 1.5 },
    },
    giant_blade: {
      // a sword of light the size of a tree, brought down along a line
      name: 'Giant Blade', shape: 'beam', element: 'arcane', powerFrom: 'blend', mult: 4, range: 22, width: 6, cooldown: 30, mp: 28,
      knock: { push: 6, down: 3 },
    },
  },
  nodes: [
    // level 1
    spell('arcane_slash', 1, { free: true }),
    spell('fire_slash', 1), prof('sword', 1), prof('wand', 1), prof('mail', 1), prof('twohand', 1),
    // level 2
    spell('lightning_dash', 2), spell('arcane_spin', 2), prof('axe', 2), prof('dualWield', 2),
    // level 3
    spell('blade_wave', 3), mastery('sword', 3), mastery('twohand', 3), passive('arcane_edge', 'Arcane Edge', 3, { arcanePct: 25 }),
    // level 4
    rank('arcane_slash', 2, 4), rank('fire_slash', 2, 4), spell('rune_blast', 4), passive('battle_mage', 'Battle Mage', 4, { spellPct: 25 }),
    // level 5
    spell('phase_strike', 5), rank('lightning_dash', 2, 5), rank('arcane_spin', 2, 5), spell('magic_ward', 5),
    // level 6
    rank('blade_wave', 2, 6), rank('rune_blast', 2, 6), passive('fire_edge', 'Fire Edge', 6, { firePct: 25 }),
    passive('storm_edge', 'Storm Edge', 6, { lightningPct: 25 }),
    mod('burning_edge', 'Burning Edge', 'arcane_slash', 6, { add: { statuses: [{ id: 'burn', seconds: 4 }] } }),
    // level 7
    rank('arcane_slash', 3, 7), rank('fire_slash', 3, 7), rank('phase_strike', 2, 7), passive('keen_edge', 'Keen Edge', 7, { critChance: 6 }),
    // level 8
    rank('lightning_dash', 3, 8), rank('arcane_spin', 3, 8), passive('quick_spells', 'Quick Spells', 8, { cooldownPct: 25 }),
    mod('chain_runes', 'Chain Runes', 'rune_blast', 8, { add: { repeats: 3, repeatEvery: 0.4 } }),
    // level 9
    rank('blade_wave', 3, 9), rank('rune_blast', 3, 9), rank('phase_strike', 3, 9), passive('deadly_edge', 'Deadly Edge', 9, { critDamage: 50 }),
    // level 10: pick one
    capstone(spell('sword_storm', 10)), capstone(spell('giant_blade', 10)),
  ],
};
