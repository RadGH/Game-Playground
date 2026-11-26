// Bard — songs as shockwaves (owner 2026-11-26 rebuild). Rules: tools/trees/_dsl.mjs.
// A blast of sound in a cone, a chord that knocks the room flat, a sour note that lands on a spot, a lullaby that
// puts a crowd to sleep, a war song for the party. One heal (Healing Song); the rest is fighting.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  power: 1.3,   // balance factor on every damage number (lead pass 2026-11-26, tools/sim-fights.mjs)
  role: 'Songs that hit hard',
  blurb: 'Blasts of sound that knock crowds flat, a lullaby for the ones left standing, and a song that lifts the party.',
  starter: ['rapier', 'light_chest', 'light_legs'],
  spells: {
    sound_blast: {
      name: 'Sound Blast', shape: 'melee', element: 'arcane', school: 'song', mult: 1.5, reach: 9, arc: 1.2, cooldown: 3, mp: 5,
      knock: { push: 2 },
      ranks: ranks({ reach: 3 }, { knock: { push: 3, down: 1 } }),
    },
    sour_note: {
      name: 'Sour Note', shape: 'ground', element: 'arcane', school: 'song', mult: 1.8, range: 24, radius: 4.5, delay: 0.3,
      cooldown: 7, mp: 8, statuses: [{ id: 'weaken', seconds: 5 }],
      ranks: ranks({ radius: 1 }, { knock: { push: 2, down: 1.2 } }),
    },
    healing_song: {
      // a song that heals everyone near the bard for a few seconds and moves with them
      name: 'Healing Song', shape: 'self', element: 'arcane', school: 'song', cooldown: 18, mp: 14,
      place: { kind: 'zone', seconds: 8, radius: 9, every: 1, heal: 0.03, follow: 'self' },
      ranks: ranks({ place: { radius: 11 } }, { place: { heal: 0.04 } }),
    },
    power_chord: {
      name: 'Power Chord', shape: 'around', element: 'arcane', school: 'song', mult: 1.6, radius: 6, cooldown: 9, mp: 10,
      knock: { push: 3, down: 1 },
      ranks: ranks({ radius: 1.5 }, { knock: { push: 4, down: 1.8 } }),
    },
    dancing_blade: {
      name: 'Dancing Blade', shape: 'dash', element: 'physical', mult: 1.6, range: 10, splash: 1.8, cooldown: 8, mp: 6,
      dash: { range: 10 }, knock: { push: 2, down: 1 },
      ranks: ranks({ range: 3, dash: { range: 13 } }, { mult: 0.5 }),
    },
    lullaby: {
      name: 'Lullaby', shape: 'ground', element: 'arcane', school: 'song', range: 22, radius: 5, delay: 0.2, cooldown: 16, mp: 12,
      statuses: [{ id: 'sleep', seconds: 4 }],
      ranks: ranks({ radius: 1.5 }, { seconds: 2 }),
    },
    battle_hymn: {
      name: 'Battle Hymn', shape: 'self', element: 'arcane', school: 'song', cooldown: 24, mp: 12, allies: 15,
      selfBuff: { name: 'Battle Hymn', seconds: 10, damage: 0.3, haste: 0.2 },
      ranks: ranks({ seconds: 4 }, {}),
    },
    crescendo: {
      name: 'Crescendo', shape: 'around', element: 'arcane', school: 'song', mult: 3.6, radius: 11, cooldown: 30, mp: 28,
      knock: { push: 6, down: 2.5 },
    },
    grand_finale: {
      name: 'Grand Finale', shape: 'beam', element: 'arcane', school: 'song', mult: 3.4, range: 26, width: 5, cooldown: 28, mp: 28,
      knock: { push: 5, down: 2 },
    },
  },
  nodes: [
    // level 1
    spell('sound_blast', 1, { free: true }), prof('sword', 1, { free: true }), prof('leather', 1, { free: true }),
    spell('sour_note', 1), spell('healing_song', 1), prof('dagger', 1), prof('bow', 1),
    // level 2
    spell('power_chord', 2), spell('dancing_blade', 2), mastery('sword', 2), prof('axe', 2),
    // level 3
    spell('lullaby', 3), spell('battle_hymn', 3), passive('strong_voice', 'Strong Voice', 3, { arcanePct: 25 }), mastery('dagger', 3),
    // level 4
    rank('sound_blast', 2, 4), rank('power_chord', 2, 4), rank('sour_note', 2, 4), prof('dualWield', 4),
    // level 5
    rank('dancing_blade', 2, 5), rank('healing_song', 2, 5), passive('showman', 'Showman', 5, { critChance: 5 }),
    mod('wide_blast', 'Wide Blast', 'sound_blast', 5, { add: { arc: 0.6 } }),
    // level 6
    rank('lullaby', 2, 6), rank('battle_hymn', 2, 6), passive('fast_fingers', 'Fast Fingers', 6, { hastePct: 25 }),
    mod('echo', 'Echo', 'power_chord', 6, { add: { repeats: 2, repeatEvery: 0.5 } }),
    // level 7
    rank('sound_blast', 3, 7), rank('sour_note', 3, 7), rank('power_chord', 3, 7), passive('big_finish', 'Big Finish', 7, { critDamage: 50 }),
    // level 8
    rank('dancing_blade', 3, 8), passive('quick_tempo', 'Quick Tempo', 8, { cooldownPct: 25 }),
    passive('duelling_song', 'Duelling Song', 8, { meleePct: 25 }),
    mod('bitter_note', 'Bitter Note', 'sour_note', 8, { add: { statuses: [{ id: 'fear', seconds: 2 }] } }),
    // level 9
    rank('lullaby', 3, 9), rank('healing_song', 3, 9), passive('perfect_pitch', 'Perfect Pitch', 9, { spellPct: 30 }),
    // level 10: pick one
    capstone(spell('crescendo', 10)), capstone(spell('grand_finale', 10)),
  ],
};
