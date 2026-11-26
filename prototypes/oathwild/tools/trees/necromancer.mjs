// Necromancer — bone and blight (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Bone spikes bursting out of the ground, a spear of bone through a line, corpses that explode, a nova of bone
// shards, plague clouds, and skeletons to fight beside you. One defence (Bone Armour), no heals.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  spells: {
    bone_spikes: {
      name: 'Bone Spikes', shape: 'ground', element: 'shadow', mult: 1.5, range: 22, radius: 3.5, delay: 0.25, cooldown: 2.5, mp: 6,
      knock: { push: 1.5 }, statuses: [{ id: 'bleed', seconds: 4 }],
      ranks: ranks({ radius: 1 }, { knock: { push: 2.5, down: 1 } }),
    },
    bone_spear: {
      name: 'Bone Spear', shape: 'beam', element: 'shadow', mult: 2.6, range: 26, width: 2, cooldown: 9, mp: 10,
      knock: { push: 3 },
      ranks: ranks({ range: 6 }, { width: 1, knock: { push: 4, down: 1.5 } }),
    },
    raise_skeleton: {
      name: 'Raise Skeleton', shape: 'summon', element: 'shadow', pet: 'bone_thrall', count: 1, cooldown: 24, mp: 18,
      summon: { def: 'bone_thrall', name: 'Bone Thrall' },
      ranks: ranks({}, { count: 1 }),
    },
    corpse_explosion: {
      name: 'Corpse Explosion', shape: 'ground', element: 'shadow', mult: 2.2, range: 22, radius: 5, delay: 0.3, cooldown: 9, mp: 10,
      knock: { push: 4, down: 1.5 },
      ranks: ranks({ radius: 1 }, { knock: { push: 5, down: 2.2 } }),
    },
    bone_nova: {
      name: 'Bone Nova', shape: 'around', element: 'shadow', mult: 1.7, radius: 7, cooldown: 10, mp: 12,
      knock: { push: 3, down: 1 }, statuses: [{ id: 'bleed', seconds: 5 }],
      ranks: ranks({ radius: 1.5 }, { knock: { push: 4, down: 1.8 } }),
    },
    plague_cloud: {
      name: 'Plague Cloud', shape: 'ground', element: 'poison', mult: 0.35, range: 24, radius: 5, delay: 0.3, repeats: 8, repeatEvery: 0.6,
      cooldown: 14, mp: 14, statuses: [{ id: 'poison', seconds: 4 }, { id: 'weaken', seconds: 4 }],
      ranks: ranks({ radius: 1.5 }, { repeats: 4 }),
    },
    grasping_dead: {
      name: 'Grasping Dead', shape: 'ground', element: 'shadow', mult: 1.2, range: 22, radius: 5, delay: 0.3, cooldown: 14, mp: 12,
      statuses: [{ id: 'root', seconds: 3 }],
      ranks: ranks({ radius: 1.5 }, { seconds: 1.5 }),
    },
    bone_armor: {
      name: 'Bone Armour', shape: 'self', element: 'shadow', cooldown: 30, mp: 14,
      barrier: { share: 0.25, seconds: 10 },
    },
    grave_army: {
      // the dead burst out of the ground round you, throwing everyone back, and fight for a while
      name: 'Grave Army', shape: 'self', element: 'shadow', mult: 1.6, radius: 8, cooldown: 50, mp: 36,
      knock: { push: 4, down: 1.5 },
      summon: { def: 'buried_thrall', name: 'Buried Thrall', count: 5, temporary: true, lifetime: 18 },
    },
    death_wave: {
      name: 'Death Wave', shape: 'around', element: 'shadow', mult: 3.8, radius: 12, cooldown: 30, mp: 30,
      knock: { push: 6, down: 2.5 }, statuses: [{ id: 'curse', seconds: 6 }],
    },
  },
  nodes: [
    // level 1
    spell('bone_spikes', 1, { free: true }), prof('wand', 1, { free: true }),
    spell('raise_skeleton', 1), spell('bone_spear', 1), prof('staff', 1), prof('dagger', 1), prof('tome', 1),
    // level 2
    spell('corpse_explosion', 2), spell('bone_nova', 2), mastery('wand', 2), prof('scepter', 2),
    // level 3
    spell('plague_cloud', 3), spell('grasping_dead', 3), passive('dark_power', 'Dark Power', 3, { shadowPct: 25 }), mastery('staff', 3),
    // level 4
    rank('bone_spikes', 2, 4), rank('raise_skeleton', 2, 4), rank('bone_spear', 2, 4), spell('bone_armor', 4),
    // level 5
    rank('corpse_explosion', 2, 5), rank('bone_nova', 2, 5), passive('bone_master', 'Bone Master', 5, { petPct: 40 }),
    passive('plague_lore', 'Plague Lore', 5, { poisonPct: 30 }),
    // level 6
    rank('plague_cloud', 2, 6), rank('grasping_dead', 2, 6),
    mod('two_skeletons', 'Two Skeletons', 'raise_skeleton', 6, { add: { count: 1 } }),
    mod('chain_explosion', 'Chain Explosion', 'corpse_explosion', 6, { add: { repeats: 2, repeatEvery: 0.4 } }),
    // level 7
    rank('bone_spikes', 3, 7), rank('bone_spear', 3, 7), rank('raise_skeleton', 3, 7), passive('cold_mind', 'Cold Mind', 7, { critChance: 6 }),
    // level 8
    rank('corpse_explosion', 3, 8), rank('bone_nova', 3, 8), passive('quick_rituals', 'Quick Rituals', 8, { cooldownPct: 25 }),
    mod('bone_burst', 'Bone Burst', 'bone_nova', 8, { mult: 1.2, add: { radius: 2, knock: { push: 5, down: 2 } } }),
    // level 9
    rank('plague_cloud', 3, 9), rank('grasping_dead', 3, 9), passive('deep_mana', 'Deep Mana', 9, { maxMpPct: 40, mpRegen: 2 }),
    passive('cruel_blows', 'Cruel Blows', 9, { critDamage: 50 }),
    // level 10: pick one
    capstone(spell('grave_army', 10)), capstone(spell('death_wave', 10)),
  ],
};
