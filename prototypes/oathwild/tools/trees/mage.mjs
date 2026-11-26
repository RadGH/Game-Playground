// Mage — reference caster tree (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// Fire, frost and arcane as AREAS: a fireball that explodes and throws people, ice spikes bursting along a line, a
// frost nova that freezes everything round you, a blast of force in a cone. No bolts: wands are the only bullets.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  role: 'Fire, frost and lightning',
  blurb: 'Fireballs that blow enemies off their feet, ice that bursts from the ground, lightning from the sky. Fragile, and devastating from range.',
  power: 0.7,   // balance factor on every damage number (lead pass 2026-11-26, tools/sim-fights.mjs)
  starter: ['staff', 'cloth_chest', 'cloth_legs'],
  spells: {
    fireball: {
      // THE one exception to "no plain projectiles" (owner 2026-11-26): "massive, twice the size of your head, spinning
      // with trailing embers falling and a huge explosion. Not just a dink on the enemies little toe." An aimed ball
      // that bursts on the first enemy (or at the end of its range) and hits everything in `explode.radius`.
      name: 'Fireball', shape: 'bolt', element: 'fire', mult: 1.8, range: 30, explode: { radius: 4 }, cooldown: 2.5, mp: 7,
      knock: { push: 2.5 }, statuses: [{ id: 'burn', seconds: 4 }],
      ranks: ranks({ explode: { radius: 5 } }, { knock: { push: 4, down: 1.2 } }),
    },
    ice_spikes: {
      name: 'Ice Spikes', shape: 'beam', element: 'ice', mult: 1.5, range: 15, width: 2.6, cooldown: 3, mp: 6,
      statuses: [{ id: 'chill', seconds: 3 }],
      ranks: ranks({ range: 5 }, { statuses: [{ id: 'root', seconds: 1.5 }] }),
    },
    frost_nova: {
      name: 'Frost Nova', shape: 'around', element: 'ice', mult: 1.3, radius: 7, cooldown: 11, mp: 12,
      statuses: [{ id: 'root', seconds: 2.5 }], knock: { push: 1.5 },
      ranks: ranks({ radius: 2 }, { seconds: 1.5 }),
    },
    arcane_blast: {
      name: 'Arcane Blast', shape: 'melee', element: 'arcane', mult: 1.9, reach: 9, arc: 1.4, cooldown: 7, mp: 9,
      knock: { push: 6, down: 1.2 },
      ranks: ranks({ reach: 3 }, { arc: 0.6 }),
    },
    blizzard: {
      name: 'Blizzard', shape: 'ground', element: 'ice', mult: 0.35, range: 28, radius: 7, repeats: 8, repeatEvery: 0.5,
      cooldown: 16, mp: 18, statuses: [{ id: 'chill', seconds: 2 }],
      ranks: ranks({ radius: 2 }, { repeats: 4 }),
    },
    lightning_strike: {
      name: 'Lightning Strike', shape: 'ground', element: 'lightning', mult: 2.1, range: 30, radius: 3, delay: 0.25,
      cooldown: 8, mp: 10, knock: { push: 1.5, down: 1.5 },
      ranks: ranks({ radius: 1 }, { repeats: 2, repeatEvery: 0.4 }),
    },
    teleport: {
      // a jump through space that leaves a burst of force where you land (mobility, still an attack)
      name: 'Teleport', shape: 'leap', element: 'arcane', mult: 0.9, range: 14, radius: 4, cooldown: 10, mp: 8,
      knock: { push: 4 },
    },
    meteor: {
      name: 'Meteor', shape: 'ground', element: 'fire', mult: 4.2, range: 32, radius: 8, delay: 1.1, cooldown: 26, mp: 30,
      knock: { push: 6, down: 2.5 }, statuses: [{ id: 'burn', seconds: 6 }],
    },
    deep_freeze: {
      name: 'Deep Freeze', shape: 'around', element: 'ice', mult: 3, radius: 11, cooldown: 30, mp: 30,
      statuses: [{ id: 'root', seconds: 4 }, { id: 'chill', seconds: 8 }], knock: { push: 2 },
    },
  },
  nodes: [
    // level 1
    spell('fireball', 1, { free: true }), prof('staff', 1, { free: true }),
    spell('ice_spikes', 1), prof('wand', 1), prof('dagger', 1),
    // level 2
    spell('frost_nova', 2), spell('teleport', 2), prof('orb', 2), prof('tome', 2),
    // level 3
    spell('arcane_blast', 3), passive('fire_study', 'Fire Study', 3, { firePct: 25 }), passive('frost_study', 'Frost Study', 3, { icePct: 25 }),
    passive('arcane_study', 'Arcane Study', 3, { arcanePct: 25 }), mastery('wand', 3), mastery('staff', 3),
    // level 4
    rank('fireball', 2, 4), rank('ice_spikes', 2, 4), spell('blizzard', 4), passive('deep_mana', 'Deep Mana', 4, { maxMpPct: 40, mpRegen: 2 }),
    // level 5
    spell('lightning_strike', 5), rank('frost_nova', 2, 5), passive('lightning_study', 'Lightning Study', 5, { lightningPct: 25 }),
    mod('big_bang', 'Big Fireball', 'fireball', 5, { mult: 1.25, add: { explode: { radius: 6.5 } } }),
    // level 6
    rank('arcane_blast', 2, 6), rank('blizzard', 2, 6), passive('spell_power', 'Spell Power', 6, { spellPct: 25 }),
    mod('frozen_ground', 'Frozen Ground', 'frost_nova', 6, { add: { place: { kind: 'zone', seconds: 6, radius: 7, every: 1, strike: { mult: 0.4 } } } }),
    // level 7
    rank('lightning_strike', 2, 7), rank('ice_spikes', 3, 7), rank('fireball', 3, 7), passive('sharp_mind', 'Sharp Mind', 7, { critChance: 6 }),
    // level 8
    rank('frost_nova', 3, 8), mod('forked_lightning', 'Forked Lightning', 'lightning_strike', 8, { add: { repeats: 2, repeatEvery: 0.35 } }),
    passive('quick_casting', 'Quick Casting', 8, { cooldownPct: 25 }), passive('glass_cannon', 'Glass Cannon', 8, { spellPct: 40, maxHpPct: -20 }),
    // level 9
    rank('arcane_blast', 3, 9), rank('blizzard', 3, 9), rank('lightning_strike', 3, 9), passive('overload', 'Overload', 9, { critDamage: 60 }),
    // level 10: pick one
    capstone(spell('meteor', 10)), capstone(spell('deep_freeze', 10)),
  ],
};
