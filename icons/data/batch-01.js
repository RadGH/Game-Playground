// Batch 1: Warrior, Fighter, Paladin, Ranger, Rogue.
import { defineClass } from '../js/records.js';
import { glyph as g, at, line, path, ring, oval, star, burst, sweep, trail, crack, faint, GOLD, PALE, NIGHT } from '../js/draw.js';
export default [
  ...defineClass('warrior', 1, [
    ['cleave', 'A broad sword sweeps a crescent through three nearby foes.', sweep + at(g.sword,16,16,.85,45) + [7,16,25].map(x=>star(x,26,2)).join(''), ['weapon','area']],
    ['breaching_shove', 'A shield drives forward into a sharp impact and pushes the enemy back.', at(g.shield,13,17,.8,-15)+star(25,12,5,.25,PALE)+line('M4 20 H8 M4 25 H11'), ['shield','control']],
    ['warcry', 'A raised battle horn sends three strong sound waves outward.', path('M5 12 L12 12 L20 5 L20 25 L12 18 H5 Z')+line('M23 10 Q27 15 23 20 M26 7 Q32 15 26 23',PALE), ['buff','sound']],
    ['whirlwind', 'A spinning blade is wrapped in two circular cutting arcs.', at(g.sword,16,16,.7,45)+line('M5 15 A11 11 0 0 1 24 8 L21 8 M27 18 A11 11 0 0 1 8 24 L11 24',PALE,2), ['weapon','area']],
    ['iron_resolve', 'A steadfast shield braces against three inward-pointing attacks.', at(g.shield,16,18,.8)+line('M5 7 L9 11 M23 11 L27 7 M16 3 V7',PALE,2)+oval(16,27,10,2), ['defense','shield']],
    ['groundbreaker', 'A heavy hammer splits the earth into a branching fault.', at(g.hammer,16,10,.65,-28)+crack+line('M6 23 L9 20 M25 25 L22 23'), ['weapon','control']],
  ]),
  ...defineClass('fighter', 1, [
    ['power_strike', 'A narrow blade strikes the bright centre of a target.', faint(ring(21,11,6))+at(g.sword,14,17,.8,43)+star(23,9,4,.25,PALE), ['weapon','precision']],
    ['riposte', 'Two crossed blades meet at a spark beneath a returning arrow.', at(g.sword,13,18,.7,38)+at(g.sword,21,18,.7,-38)+line('M6 9 Q14 2 23 8 L19 8 M23 8 L22 4',PALE)+star(16,16,3), ['counter','defense']],
    ['duelist_stance', 'An upright sword divides an open guard from a protective shield.', at(g.shield,10,17,.55)+at(g.sword,21,15,.85)+line('M6 6 L9 4 M24 26 L27 24',PALE), ['stance','defense']],
    ['lunge', 'A thrusting sword surges diagonally ahead of three speed lines.', trail+at(g.sword,19,13,.85,45), ['movement','weapon']],
    ['sweeping_guard', 'A curved sweep crosses a shield with a blade ready to answer.', sweep+at(g.shield,14,20,.62)+at(g.sword,22,15,.65,35), ['counter','shield']],
    ['masters_flurry', 'Three crossing sword cuts converge in a bright finishing spark.', at(g.sword,10,17,.62,28)+at(g.sword,17,16,.7,45)+at(g.sword,23,18,.6,65)+star(21,8,4,.3,PALE), ['weapon','area']],
  ]),
  ...defineClass('paladin', 1, [
    ['sanctified_blade', 'A sacred blade shines in a halo with rays along its edge.', faint(ring(16,13,9))+at(g.sword,16,16,.95)+line('M5 11 L9 13 M23 13 L27 11 M7 5 L10 8 M22 8 L25 5',PALE), ['weapon','healing']],
    ['consecrate', 'A small sun blesses a ring of earth with rising light.', oval(16,24,11,4)+at(g.sun,16,12,.6)+line('M8 23 V18 M24 23 V18 M16 25 V21',PALE), ['area','healing']],
    ['oath_hammer', 'A holy hammer flies outward on a curved returning trail.', at(g.hammer,18,13,.75,30)+line('M5 19 Q3 29 15 28 Q23 28 25 22 L27 25 M25 22 L22 24',PALE), ['weapon','projectile']],
    ['martyrs_vow', 'A heart is offered inside a shielding halo.', at(g.shield,16,16,1)+at(g.heart,16,16,.5)+star(16,4,2.5,.3,PALE), ['shield','barrier']],
    ['shining_rebuke', 'A radiant shield pushes four arrows away from its centre.', at(g.shield,16,16,.65)+line('M3 16 H7 M3 16 L6 13 M3 16 L6 19 M29 16 H25 M29 16 L26 13 M29 16 L26 19 M16 3 V7 M16 29 V25',PALE), ['area','control']],
    ['daybreak_descent', 'A winged sun descends onto a bright landing circle.', at(g.wing,9,13,.55,-20)+at(g.wing,23,13,.55,20)+at(g.sun,16,17,.5)+oval(16,27,9,2)+line('M16 3 V9',PALE), ['movement','healing']],
  ]),
  ...defineClass('ranger', 1, [
    ['aimed_shot', 'A fully drawn bow sends one broad arrow toward its mark.', at(g.bow,15,16,.92)+star(27,16,3,.25,PALE), ['weapon','precision']],
    ['hunters_snare', 'A toothed ground trap closes around a curling vine.', at(g.trap,16,18,.86)+line('M16 26 Q11 16 18 12 Q23 7 19 4',PALE)+path('M18 10 Q11 5 14 4 Q19 4 18 10'), ['trap','control']],
    ['multi_shot', 'Three broadhead arrows spread outward in a clear fan.', at(g.arrow,10,15,.68,-24)+at(g.arrow,17,15,.76,0)+at(g.arrow,24,17,.65,26), ['projectile','area']],
    ['quarry_call', 'An arrow marks the centre of a hunter’s sight.', ring(16,16,9)+line('M16 3 V9 M16 23 V29 M3 16 H9 M23 16 H29',PALE)+at(g.arrow,16,16,.6), ['mark','precision']],
    ['trackers_leap', 'A hunter’s boot springs back along a long arcing trail.', at(g.boot,21,13,.6,30)+line('M25 25 Q13 12 5 23 L6 17 M5 23 L11 23',PALE)+line('M16 28 H24'), ['movement']],
    ['rain_of_arrows', 'Three descending arrows fall into a wide ground circle.', oval(16,26,11,3)+at(g.arrow,8,14,.6,180)+at(g.arrow,17,12,.67,180)+at(g.arrow,25,17,.48,180), ['area','projectile']],
  ]),
  ...defineClass('rogue', 1, [
    ['eviscerate', 'A hooked dagger opens a cut with a falling blood drop.', at(g.dagger,14,14,.86,40)+at(g.drop,23,24,.35)+line('M7 21 L20 8',PALE), ['weapon','bleed']],
    ['poison_dart', 'A thin dart carries a large drop of venom on its point.', trail+at(g.arrow,16,16,.86)+at(g.drop,23,10,.43), ['projectile','poison']],
    ['sucker_punch', 'A close fist lands beneath a sharp stunning star.', at(g.fist,14,18,.8,20)+star(24,7,6,.3,PALE), ['control','melee']],
    ['grave_mark', 'A skull is held at the centre of a grave-marking sight.', ring(16,16,12)+at(g.skull,16,16,.65)+line('M16 2 V6 M16 26 V30 M2 16 H6 M26 16 H30',PALE), ['mark','curse']],
    ['slip_away', 'A fleeing figure leaves a pale decoy inside a smoke curl.', faint(at(g.person,10,18,.7))+at(g.person,23,14,.65)+line('M5 26 Q1 20 7 17 M10 28 Q16 25 13 21',PALE), ['movement','summon']],
    ['knife_storm', 'Three knives whirl around an empty centre on a circular trail.', faint(ring(16,16,10))+at(g.dagger,16,8,.6,70)+at(g.dagger,24,20,.6,190)+at(g.dagger,9,23,.6,310), ['weapon','area']],
  ]),
];
