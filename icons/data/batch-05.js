// Batch 5: Monk, Shaman, Witch Hunter, Knight, Sorcerer.
import { defineClass } from '../js/records.js';
import { glyph as g, at, line, path, circle, ring, oval, star, burst, sweep, trail, faint, GOLD, PALE, NIGHT } from '../js/draw.js';
export default [
  ...defineClass('monk', 5, [
    ['open_palm', 'An open hand sends a controlled wave forward from its palm.', path('M10 27 L8 20 L5 17 Q3 13 6 13 L10 16 V7 Q10 4 12 7 V15 H14 V4 Q16 2 17 5 V15 H19 V6 Q21 4 22 7 V17 L24 13 Q27 11 27 14 L25 22 L21 27 Z')+line('M4 7 Q1 12 3 18',PALE), ['martial','control']],
    ['wind_step', 'A light sandal moves on three long curls of wind.', at(g.boot,20,12,.7,24)+line('M4 17 H10 M4 23 H15 Q20 22 18 19 M7 28 H21 Q27 27 24 24',PALE), ['martial','movement']],
    ['sweeping_heel', 'A turning heel cuts a low circular sweep across the ground.', at(g.boot,18,15,.72,75)+line('M5 14 Q1 25 15 28 Q26 29 28 21 L25 24 M28 21 L28 26',PALE,2), ['martial','area']],
    ['inner_stillness', 'A seated figure rests beneath a calm enclosing circle.', faint(ring(16,16,12))+circle(16,10,3,PALE)+path('M12 15 H20 L22 22 L28 25 L24 28 H8 L4 25 L10 22 Z')+line('M9 23 L16 25 L23 23',NIGHT,1.5), ['martial','healing','defense']],
    ['mountain_fist', 'A powerful fist strikes in front of two immovable peaks.', at(g.mountain,16,20,.95)+at(g.fist,16,13,.65)+line('M5 7 L8 10 M24 10 L27 7',PALE), ['martial','control']],
    ['ninefold_staff', 'A long staff turns between four ghosted spinning positions.', faint(line('M7 7 L25 25 M7 25 L25 7 M4 16 H28 M16 4 V28',GOLD,1.7),.5)+line('M8 27 L24 5',PALE,3)+ring(16,16,9), ['martial','weapon','area']],
  ]),
  ...defineClass('shaman', 5, [
    ['spirit_bolt', 'A bright spirit face rides a forked lightning trail.', at(g.lightning,11,22,.6)+at(g.mask,21,11,.7)+circle(24,5,1,PALE), ['spirit','projectile']],
    ['mending_post', 'A healing post grows two leaves above a circle of earth.', at(g.post,16,18,.77)+at(g.leaf,8,10,.42,-50)+at(g.leaf,25,10,.4,15)+oval(16,28,9,2), ['spirit','healing','totem']],
    ['storm_post', 'A storm post draws a lightning bolt to its carved centre.', at(g.post,16,21,.62)+at(g.lightning,16,9,.58)+line('M5 15 L9 18 M27 15 L23 18',PALE), ['spirit','lightning','totem']],
    ['call_spirit', 'A spirit mask rises above a widening summoning ring.', at(g.mask,16,12,.7)+oval(16,26,11,3)+line('M11 20 Q7 25 13 24 M21 20 Q25 25 19 24',PALE), ['spirit','summon']],
    ['warding_spirits', 'Two guarding spirits hover beside a protected shield.', at(g.shield,16,18,.7)+at(g.mask,6,11,.38)+at(g.mask,26,11,.38)+line('M4 20 L7 23 M28 20 L25 23',PALE), ['spirit','shield','defense']],
    ['great_post', 'A tall ancestral post stands crowned by a radiant halo.', at(g.post,16,18,.87)+at(g.sun,16,7,.45)+oval(16,28,11,2)+line('M4 15 V22 M28 15 V22',PALE), ['spirit','totem','area']],
  ]),
  ...defineClass('witch_hunter', 5, [
    ['pinning_shot', 'A silver-tipped bolt pierces a binding ring and pins its centre.', ring(20,12,7)+at(g.arrow,15,17,.82)+star(25,6,2.5,.3,PALE), ['projectile','control']],
    ['silver_edge', 'A honed silver blade cuts past a small banishing sigil.', at(g.sword,13,16,.94,25)+ring(25,23,4,PALE)+line('M23 20 L27 26',PALE), ['weapon','purge']],
    ['null_circle', 'A crossed-out magical spark is contained inside a ground circle.', oval(16,22,12,6)+star(16,13,7,.3,PALE)+line('M7 6 L26 25',GOLD,2.5), ['purge','area']],
    ['writ_of_guilt', 'A written warrant bears a dark eye and a hanging seal.', at(g.scroll,16,14,.85)+at(g.eye,17,14,.39)+circle(22,26,3.3)+star(22,26,2,.3,NIGHT), ['mark','purge']],
    ['iron_net', 'A weighted iron net flies outward with four corner weights.', at(g.net,18,14,.8,12)+circle(9,6,2)+circle(25,10,2)+circle(8,22,2)+circle(25,23,2)+line('M3 26 L8 24 M3 20 H6',PALE), ['trap','control']],
    ['purging_rite', 'A cleansing flame burns within a bright ritual circle.', ring(16,16,12)+at(g.flame,16,16,.72)+line('M16 2 V5 M16 27 V30 M2 16 H5 M27 16 H30',PALE,2), ['purge','area']],
  ]),
  ...defineClass('knight', 5, [
    ['shield_bash', 'A tilted shield lands a forceful strike against a bright impact.', at(g.shield,12,18,.85,-25)+star(25,10,6,.28,PALE)+line('M4 24 L8 24'), ['shield','control']],
    ['guard_stance', 'A large shield stands squarely above a firmly planted sword.', at(g.sword,16,18,.84)+at(g.shield,16,13,.75)+line('M6 27 H12 M20 27 H26',PALE), ['shield','defense','stance']],
    ['sworn_ward', 'A protective shield extends a tether to a smaller ally.', at(g.shield,11,14,.73)+at(g.person,25,23,.48)+line('M12 25 Q16 29 22 27',PALE)+star(26,8,2.5,.3,PALE), ['shield','link','defense']],
    ['challenge', 'A raised gauntlet issues a challenge in two outward sound arcs.', at(g.fist,16,17,.82)+line('M5 9 Q1 16 5 23 M27 9 Q31 16 27 23',PALE)+star(16,3,2), ['taunt','control']],
    ['rampart', 'A crenellated stone wall stands across an oval defensive line.', oval(16,26,12,3)+at(g.wall,16,16,.8)+line('M16 4 V7',PALE), ['defense','area']],
    ['unbroken_banner', 'A tall enduring banner rises from a shield at its base.', at(g.flag,17,11,.86)+at(g.shield,14,23,.52)+star(26,6,2.5,.3,PALE), ['defense','buff','banner']],
  ]),
  ...defineClass('sorcerer', 5, [
    ['wild_bolt', 'An unstable orb launches with a crooked tail and scattered sparks.', trail+at(g.orb,21,11,.6)+star(5,9,2.5,.3,PALE)+star(26,25,2), ['magic','projectile']],
    ['arcane_burst', 'A faceted magical core bursts across two crossing orbits.', at(g.crystal,16,16,.55)+at(oval(16,16,13,5),16,16,1,40)+at(oval(16,16,13,5,PALE),16,16,1,-40), ['magic','area']],
    ['mana_rend', 'A straight arcane beam splits a glowing orb into two halves.', at(g.orb,16,16,.9)+path('M12 4 L20 4 L17 14 L20 16 L12 28 H8 L14 17 L11 15 Z',NIGHT)+line('M18 3 L14 14 L18 16 L10 29',PALE,2.1), ['magic','beam']],
    ['overchannel', 'A caster draws too much power into a large rising spark.', at(g.person,16,23,.56)+star(16,10,8,.28,PALE)+line('M5 23 Q1 13 7 8 M27 23 Q31 13 25 8',GOLD,1.7), ['magic','buff']],
    ['transmute', 'A magical crystal changes into a small beast along a curved arrow.', at(g.crystal,9,11,.54)+at(g.paw,24,23,.5)+line('M18 5 Q27 4 28 14 L24 11 M28 14 L29 10',PALE), ['magic','transformation','control']],
    ['sixfold_ruin', 'Six charged sparks surround a many-pointed arcane explosion.', star(16,16,7,.45,PALE)+[0,60,120,180,240,300].map(a=>at(star(16,5,3),16,16,1,a)).join('')+faint(ring(16,16,10)), ['magic','area']],
  ]),
];
