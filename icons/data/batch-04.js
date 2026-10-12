// Batch 4: Stormcaller, Druid, Oracle, Tactician, Chronomancer.
import { defineClass } from '../js/records.js';
import { glyph as g, at, line, path, circle, ring, oval, star, burst, sweep, trail, faint, GOLD, PALE, NIGHT } from '../js/draw.js';
export default [
  ...defineClass('stormcaller', 4, [
    ['chain_bolt', 'One lightning fork branches into three separate targets.', line('M16 4 L12 12 L17 13 L9 23 M17 13 L24 17 L21 25 M17 13 L25 7',PALE,2.3)+circle(8,25,2.3)+circle(21,27,2)+circle(27,6,2), ['lightning','chain']],
    ['thunderclap', 'A jagged lightning bolt breaks through two expanding thunder rings.', faint(ring(16,16,11))+faint(ring(16,16,7))+at(g.lightning,16,16,.8), ['lightning','area']],
    ['storm_beam', 'A long angular bolt cuts diagonally through a narrow beam channel.', line('M3 23 L22 4 M10 29 L29 10',GOLD,1)+path('M25 3 L11 14 L16 16 L5 29 L24 17 L18 15 L29 5 Z',PALE), ['lightning','beam']],
    ['storm_orbs', 'Three charged orbs circle a figure along an elliptical path.', oval(16,17,12,6)+at(g.person,16,17,.6)+circle(5,17,3,PALE)+circle(23,11,3,PALE)+circle(24,23,3,PALE), ['lightning','orbit']],
    ['bolt_step', 'A running boot dissolves into an advancing lightning stroke.', at(g.boot,10,21,.6,-20)+at(g.lightning,22,12,.75)+line('M3 12 H9 M5 8 H12',PALE), ['lightning','movement']],
    ['tempest_eye', 'A watching eye sits inside a curling storm with a falling bolt.', line('M5 17 Q0 5 13 4 Q24 1 27 11 M27 17 Q32 28 19 29 Q8 31 5 23')+at(g.eye,16,14,.7)+at(g.lightning,17,25,.34), ['lightning','weather','area']],
  ]),
  ...defineClass('druid', 4, [
    ['thornlash', 'A curling vine lashes forward with three sharp thorns.', line('M5 27 Q22 24 12 15 Q5 8 24 5',GOLD,2.6)+path('M10 25 L9 19 L15 22 Z M13 16 L20 15 L15 20 Z M14 8 L16 3 L19 7 Z')+star(26,5,2,.3,PALE), ['nature','projectile']],
    ['renew', 'A fresh leaf cups a bright drop of restoring sap.', at(g.leaf,15,17,.9)+at(g.drop,22,12,.48)+star(7,6,3,.3,PALE), ['nature','healing']],
    ['briarback_shape', 'A sturdy paw is protected by a ring of pointed briars.', at(g.paw,16,18,.7)+line('M5 23 L3 16 L7 14 L5 7 L12 8 L16 3 L20 8 L27 7 L25 14 L29 16 L27 23',PALE), ['nature','transformation','beast']],
    ['call_wolf', 'A lead wolf calls two smaller packmates into a summoning ring.', oval(16,27,11,2)+at(g.wolf,7,20,.37)+at(g.wolf,25,20,.37)+at(g.wolf,16,12,.7), ['nature','summon','beast']],
    ['fenrunner_shape', 'A nimble paw sprints across reeds and marsh grass.', at(g.paw,21,12,.65,30)+line('M4 15 H10 M3 20 H13 M8 27 L7 23 M13 28 L13 22 M19 28 L22 24',PALE), ['nature','transformation','movement']],
    ['sporecap_shape', 'A broad mushroom releases three drifting spores.', at(g.mushroom,16,18,.88)+circle(7,7,1.5,PALE)+circle(20,3,1.5,PALE)+circle(28,12,1.3)+circle(4,23,1.3), ['nature','transformation','spores']],
  ]),
  ...defineClass('oracle', 4, [
    ['omen_bolt', 'An omen-bearing eye flies above a forked trail.', trail+at(g.eye,20,12,.7)+star(26,6,2,.3,PALE), ['fate','projectile']],
    ['foresight', 'A clear eye sees beyond the hands of a small clock.', at(g.eye,16,12,.88)+at(g.clock,16,23,.47)+star(6,25,2,.3,PALE), ['fate','defense']],
    ['prophecy', 'An open book reveals a falling star above a marked circle.', at(g.book,16,22,.7)+star(16,8,5,.3,PALE)+line('M5 10 L8 13 M24 13 L27 10'), ['fate','area']],
    ['fate_thread', 'Two figures are linked by a single looping golden thread.', at(g.person,8,17,.53)+at(g.person,24,17,.53)+line('M8 19 C6 4 26 4 24 19 C22 29 10 28 8 19',PALE)+star(16,7,2.4), ['fate','link']],
    ['turn_aside', 'An open eye bends a threatening arrow away from its path.', at(g.eye,13,20,.7)+line('M5 7 H21 Q29 7 26 17 L23 13 M26 17 L29 13',PALE,2)+star(8,28,2), ['fate','control']],
    ['last_prophecy', 'A prophetic eye shines over a sealed hourglass and closing book.', at(g.book,16,25,.6)+at(g.hourglass,16,17,.52)+at(g.eye,16,7,.55)+line('M4 14 L7 16 M25 16 L28 14',PALE), ['fate','finisher']],
  ]),
  ...defineClass('tactician', 4, [
    ['exploit_gap', 'A precise blade finds the open seam in a broken shield.', at(g.shield,19,14,.8)+line('M19 5 L15 15 L19 18 L15 24',NIGHT,3)+at(g.dagger,11,21,.62,45), ['weapon','precision']],
    ['rally', 'A raised command banner gathers three allies beneath it.', at(g.flag,17,11,.7)+at(g.person,7,25,.31)+at(g.person,16,24,.35)+at(g.person,25,25,.31), ['command','buff']],
    ['charge', 'A leading banner races forward with three parallel speed lines.', trail+at(g.flag,21,13,.78,20)+line('M3 14 H10',PALE), ['command','movement']],
    ['reposition', 'Two allies trade positions along opposing curved arrows.', at(g.person,8,16,.52)+at(g.person,24,16,.52)+line('M7 5 H22 L19 3 M22 5 L19 8 M25 27 H10 L13 24 M10 27 L13 29',PALE), ['command','movement']],
    ['seize_initiative', 'A commanding fist catches the leading hand of a small clock.', at(g.clock,22,10,.56)+at(g.fist,12,21,.7)+line('M4 8 L8 11 M8 4 L11 8',PALE), ['command','speed']],
    ['battle_plan', 'A tactical scroll shows a route between two positions and a target.', at(g.scroll,16,16,1)+line('M12 22 V14 H21 L18 11 M21 14 L18 17',PALE,1.8)+circle(12,22,2,NIGHT)+circle(21,14,2,NIGHT), ['command','strategy']],
  ]),
  ...defineClass('chronomancer', 4, [
    ['second_hand', 'A clock hand flies from its dial like a pointed projectile.', at(g.clock,11,21,.62)+path('M14 16 L26 4 L22 18 L19 13 Z',PALE)+line('M5 9 L11 13'), ['time','projectile']],
    ['quicken', 'A lightning stroke speeds the hands of a small clock.', at(g.clock,11,19,.7)+at(g.lightning,23,12,.72), ['time','speed']],
    ['entropy_field', 'An hourglass sheds loose grains into an eroding ground ring.', at(g.hourglass,16,13,.72)+oval(16,26,11,3)+circle(8,21,1.2,PALE)+circle(25,20,1.2,PALE)+circle(20,26,1.1)+circle(11,26,1), ['time','area','control']],
    ['rewind', 'A turning arrow runs backwards around a clock face.', at(g.clock,16,17,.72)+line('M27 20 Q31 9 20 4 Q10 0 5 11 L5 5 M5 11 L11 10',PALE,2), ['time','healing']],
    ['stasis_lock', 'An hourglass is held motionless within the jaws of a lock.', line('M8 13 V8 Q16 -1 24 8 V13',PALE,2)+line('M6 12 H26 V28 H6 Z',GOLD,2)+at(g.hourglass,16,20,.5), ['time','control']],
    ['stop_the_clock', 'A broad clock face is stopped by two firm pause bars.', at(g.clock,16,16,1)+path('M10 11 H14 V23 H10 Z M18 11 H22 V23 H18 Z',PALE)+line('M5 6 L8 9 M24 9 L27 6'), ['time','area','control']],
  ]),
];
