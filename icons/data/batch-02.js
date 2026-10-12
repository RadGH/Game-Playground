// Batch 2: Cleric, Bard, Mage, Necromancer, Warlock.
import { defineClass } from '../js/records.js';
import { glyph as g, at, line, path, circle, ring, oval, star, burst, sweep, trail, faint, GOLD, PALE, NIGHT } from '../js/draw.js';
export default [
  ...defineClass('cleric', 2, [
    ['mend', 'A healing cross rests over a heart with two restoring rays.', at(g.heart,16,19,.8)+at(g.cross,16,11,.5)+line('M5 7 L8 10 M24 10 L27 7',PALE), ['healing']],
    ['sunlance', 'A small sun drives a straight lance of light across the medallion.', at(g.sun,9,22,.48)+path('M12 19 L27 4 L22 19 L17 16 Z',PALE)+line('M16 25 L26 14'), ['beam','healing']],
    ['sanctuary', 'A protective dome shelters a healing cross over blessed ground.', oval(16,25,12,3)+line('M4 24 Q4 3 16 3 Q28 3 28 24',PALE)+at(g.cross,16,17,.55), ['healing','barrier','area']],
    ['guardian_light', 'A winged healing light hovers over a protected figure.', at(g.wing,8,12,.5,-20)+at(g.wing,24,12,.5,20)+star(16,10,5,.3,PALE)+at(g.person,16,23,.45), ['summon','healing']],
    ['raise_the_fallen', 'A fallen figure rises toward a bright cross on ascending rays.', at(g.person,16,22,.58)+at(g.cross,16,8,.42)+line('M5 25 V14 L3 17 M5 14 L8 17 M27 25 V14 L24 17 M27 14 L29 17',PALE), ['revive','healing']],
    ['judgement', 'A pillar of sunlight falls into a ring with a sharp ground impact.', at(g.sun,16,8,.42)+path('M13 12 H19 L21 24 H11 Z')+star(16,23,5,.3,PALE)+oval(16,27,11,2), ['area','healing']],
  ]),
  ...defineClass('bard', 2, [
    ['discord_note', 'A musical note jumps along a jagged echoing trail.', trail+at(g.note,20,13,.75)+line('M4 9 L8 6 L11 10 L14 7',PALE), ['sound','projectile']],
    ['ballad_of_valour', 'A proud banner carries a musical note above a marching beat.', at(g.flag,16,15,.95)+at(g.note,18,11,.35)+line('M11 27 H15 M20 27 H24',PALE), ['sound','buff']],
    ['song_of_ruin', 'A dark song curls past a skull beneath a crescent moon.', at(g.skull,10,20,.5)+at(g.note,22,16,.68)+at(g.moon,10,7,.38), ['sound','curse']],
    ['air_of_mending', 'A gentle melody carries a healing heart on its staff.', line('M4 13 H28 M4 18 H28 M4 23 H28',GOLD,1)+at(g.note,12,15,.64)+at(g.heart,23,10,.48), ['sound','healing']],
    ['quickstep_jig', 'A dancing boot hops between two quick musical notes.', at(g.boot,15,19,.74,-20)+at(g.note,24,9,.4)+line('M4 12 Q3 6 10 6 M5 28 H12',PALE), ['sound','movement']],
    ['grand_finale', 'A large musical note explodes into six radiant finishing rays.', burst+at(g.note,16,16,.78)+star(8,8,2.5,.3,PALE)+star(24,24,2.5,.3,PALE), ['sound','area']],
  ]),
  ...defineClass('mage', 2, [
    ['frost_shard', 'A pointed ice crystal flies ahead of two cold streaks.', trail+at(g.crystal,20,12,.74,38)+star(7,10,2,.3,PALE), ['ice','projectile']],
    ['frost_nova', 'An icy snowflake expands in a ring of sharp fragments.', at(g.snow,16,16,.65)+ring(16,16,12)+path('M3 10 L8 10 L5 14 Z M24 22 L29 22 L27 18 Z',PALE), ['ice','area']],
    ['ice_lance', 'A long faceted spear of ice cuts along a straight beam.', path('M4 28 L13 11 L27 3 L21 18 Z')+line('M4 28 L27 3 M13 11 L16 16 L21 18',NIGHT)+line('M4 19 L11 10 M19 27 L26 19',PALE), ['ice','beam']],
    ['spellrush', 'An arcane hourglass accelerates between two curved arrows.', at(g.hourglass,16,16,.7)+line('M5 21 Q1 10 10 5 L8 9 M27 11 Q31 23 22 27 L24 23',PALE,2), ['buff','speed']],
    ['blizzard', 'A winter cloud drops three icy flakes over a wide field.', at(g.cloud,16,11,.84)+at(g.snow,8,24,.28)+at(g.snow,17,23,.33)+at(g.snow,25,25,.24), ['ice','area','weather']],
    ['stillfrost', 'A figure is frozen upright inside a large faceted ice prison.', at(g.crystal,16,16,1)+at(g.person,16,18,.5)+line('M5 7 L9 10 M23 23 L27 26',PALE), ['ice','control']],
  ]),
  ...defineClass('necromancer', 2, [
    ['marrow_lance', 'A sharpened bone flies diagonally on a trail of grave dust.', trail+at(g.bone,20,12,.72,85)+circle(7,8,1,PALE)+circle(5,12,1), ['bone','projectile']],
    ['raise_thrall', 'A skull rises from an open grave on two upward trails.', at(g.skull,16,13,.72)+oval(16,26,11,3)+line('M6 22 V15 L4 18 M26 22 V15 L28 18',PALE), ['summon','bone']],
    ['corpse_pyre', 'A skull burns inside a tall funeral flame.', g.flame+at(g.skull,16,20,.48)+line('M6 28 H26',PALE), ['bone','area']],
    ['drain', 'A skull draws a stream of life into a waiting heart.', at(g.skull,8,11,.45)+at(g.heart,24,23,.44)+line('M6 22 Q15 11 24 14 M8 25 Q17 17 26 17',PALE)+path('M20 12 L27 13 L23 19 Z'), ['drain','healing']],
    ['toxic_cloud', 'A poisonous cloud hangs above three dripping drops of plague.', at(g.cloud,16,12,.94)+at(g.drop,8,25,.24)+at(g.drop,16,24,.3)+at(g.drop,24,25,.24)+at(g.skull,16,13,.37), ['poison','area']],
    ['buried_march', 'Three risen skulls march above cracked grave soil.', at(g.skull,7,19,.4)+at(g.skull,16,13,.62)+at(g.skull,25,19,.4)+line('M4 27 L10 25 L16 28 L22 25 L28 27',PALE), ['summon','bone']],
  ]),
  ...defineClass('warlock', 2, [
    ['gnawing_dark', 'A hungry ring of inward teeth surrounds a dark centre.', ring(16,16,10,GOLD,2)+path('M9 8 L14 12 L13 6 M21 7 L19 13 L25 11 M26 19 L20 18 L22 25 M14 26 L15 20 L8 22 Z')+circle(14,16,1.3,PALE)+circle(19,16,1.3,PALE), ['curse','projectile']],
    ['bind_imp', 'A horned fiend is tethered inside a binding circle.', ring(16,16,12)+at(g.imp,16,15,.7)+at(g.chain,16,25,.35,-45), ['summon','binding']],
    ['curse', 'An unblinking eye is crossed by the pointed strokes of a hex.', at(g.eye,16,16,.75)+line('M6 5 L26 27 M26 5 L6 27 M16 3 V7 M16 25 V29',PALE), ['curse','mark']],
    ['soul_pact', 'A heart and a horned spirit are joined by an unbroken chain.', at(g.heart,9,10,.5)+at(g.imp,23,23,.5)+at(g.chain,16,17,.57,-90), ['pact','buff']],
    ['void_rift', 'A jagged tear opens in the ground with inward-pulling arcs.', path('M17 3 L11 13 L17 15 L12 29 L23 17 L18 15 L22 5 Z')+line('M7 8 Q2 16 7 24 M26 8 Q31 16 26 24',PALE), ['area','portal']],
    ['abyss_gate', 'A tall gate frames a horned fiend above a summoning circle.', line('M5 25 V10 Q16 -1 27 10 V25',GOLD,2.4)+at(g.imp,16,16,.62)+oval(16,27,11,2), ['portal','summon']],
  ]),
];
