// Batch 6: Runesmith, Shadow Dancer, Tinker, Priest, Enchanter.
import { defineClass } from '../js/records.js';
import { glyph as g, at, line, path, circle, ring, oval, star, burst, sweep, trail, crack, faint, GOLD, PALE, NIGHT } from '../js/draw.js';
export default [
  ...defineClass('runesmith', 6, [
    ['rune_hammer', 'A runed hammer strikes a small anvil with a bright spark.', at(g.anvil,14,24,.58)+at(g.hammer,21,11,.65,35)+star(10,16,3,.3,PALE), ['rune','weapon']],
    ['sunder', 'A heavy hammer splits an armour plate down its centre.', at(g.scale,14,21,.7)+line('M14 12 L11 19 L16 22 L12 29',NIGHT,2)+at(g.hammer,22,9,.57,40), ['weapon','armor','control']],
    ['stoneskin', 'A protective shield is carved with three enduring stone runes.', at(g.shield,16,16,1)+line('M11 13 L14 11 L14 18 M19 12 V20 L22 17 M13 23 H19',PALE,1.5), ['rune','defense']],
    ['forge_flame', 'A forge flame rises from the horn of a sturdy anvil.', at(g.anvil,16,23,.76)+at(g.flame,16,11,.65)+line('M5 9 L8 12 M27 9 L24 12',PALE), ['fire','craft','buff']],
    ['warding_glyph', 'A carved warding rune stands inside a protective ground ring.', oval(16,24,12,5)+line('M16 5 V24 M9 9 L16 14 L23 9 M10 19 L16 16 L22 19',PALE,2.5)+star(5,24,2)+star(27,24,2), ['rune','defense','area']],
    ['great_anvil', 'A monumental anvil falls with three trails into a ringing impact.', at(g.anvil,16,20,.94)+line('M10 3 V9 M16 2 V8 M22 3 V9',PALE,2)+line('M4 24 L7 22 M28 24 L25 22')+oval(16,29,10,1.5), ['craft','area','control']],
  ]),
  ...defineClass('shadow_dancer', 6, [
    ['shade_cut', 'A dagger slash is followed by its fading shadow.', faint(at(g.dagger,10,16,.8,32),.4)+at(g.dagger,21,16,.8,32)+line('M5 25 Q19 27 27 12',PALE), ['weapon','afterimage']],
    ['shadowstep', 'A figure steps through a dark crescent toward its afterimage.', at(g.moon,14,16,.86)+faint(at(g.person,6,23,.4))+at(g.person,25,18,.53)+line('M7 28 H18',PALE), ['movement','afterimage']],
    ['smoke', 'A concealed figure stands within three curling bands of smoke.', at(g.person,16,17,.66)+line('M7 27 Q0 21 8 17 Q1 10 10 8 M25 27 Q32 21 25 17 Q31 9 23 8 M10 5 Q16 0 23 5',PALE), ['defense','smoke']],
    ['cutting_waltz', 'Two daggers dance around a fading third cut.', sweep+at(g.dagger,10,18,.6,30)+at(g.dagger,24,20,.6,210)+faint(at(g.dagger,16,23,.48,100)), ['weapon','area','afterimage']],
    ['execute', 'A descending dagger crosses a skull at its final mark.', at(g.skull,16,20,.66)+at(g.dagger,16,10,.67,180)+line('M5 17 L8 20 M27 17 L24 20',PALE), ['weapon','finisher']],
    ['host_of_shades', 'Three shadow copies emerge side by side beneath a crescent.', at(g.moon,16,7,.44)+faint(at(g.person,6,21,.46),.55)+at(g.person,16,19,.65)+faint(at(g.person,26,21,.46),.55), ['summon','afterimage']],
  ]),
  ...defineClass('tinker', 6, [
    ['clockwork_bolt', 'A toothed clockwork projectile flies along a straight metal shaft.', at(g.arrow,15,17,.82)+at(g.gear,22,10,.52)+line('M5 13 L9 9',PALE), ['machine','projectile']],
    ['flask_grenade', 'An alchemical flask tumbles through a small bursting ring.', at(g.flask,16,16,.78,25)+line('M5 6 L8 9 M25 23 L28 26 M3 17 H7 M25 10 L29 8',PALE)+star(9,26,2.5), ['alchemy','area']],
    ['deploy_sentry', 'A mechanical sentry unfolds its tripod beneath a turning gear.', at(g.turret,16,21,.8)+at(g.gear,14,7,.43)+line('M4 11 L7 15 M27 7 L25 11',PALE), ['machine','summon']],
    ['pocket_watch', 'A pocket watch protects a small restoring heart.', at(g.clock,14,14,.9)+at(g.heart,24,24,.42)+line('M6 25 Q4 29 9 28',PALE), ['machine','healing','defense']],
    ['grapple_line', 'A grappling hook catches ahead as its coiled rope pulls taut.', at(g.hook,23,10,.6,-30)+line('M20 11 L9 22 Q3 29 11 29 Q17 29 15 24 Q13 20 9 23',PALE,2), ['machine','movement']],
    ['spring_battery', 'A tightly coiled spring stores a bright charge of lightning.', path('M7 12 H23 V28 H7 Z')+line('M9 15 L21 18 L9 21 L21 24',NIGHT,1.7)+at(g.lightning,20,9,.58)+line('M10 9 H15',PALE), ['machine','lightning','buff']],
  ]),
  ...defineClass('priest', 6, [
    ['shadow_lance', 'A crescent-tipped lance carries a small echo of healing light.', trail+at(g.moon,21,10,.64,40)+star(10,26,3,.3,PALE)+line('M11 21 L22 10',PALE,2), ['shadow','projectile','healing']],
    ['dawn_prayer', 'Two praying hands cradle a rising dawn sun.', at(g.sun,16,9,.57)+path('M13 14 L9 19 L5 18 L8 27 L15 29 V17 Z M19 14 L23 19 L27 18 L24 27 L17 29 V17 Z')+line('M16 16 V27',PALE), ['holy','healing']],
    ['mark_the_killer', 'A watchful eye marks a blade beneath a dark halo.', ring(16,16,12)+at(g.dagger,16,21,.56,180)+at(g.eye,16,11,.65)+line('M4 16 H7 M25 16 H28',PALE), ['shadow','mark']],
    ['vigil', 'A single candle burns steadily within a guarding shield.', at(g.shield,16,16,1)+at(g.candle,16,16,.58)+line('M6 5 L9 8 M26 5 L23 8',PALE), ['holy','defense']],
    ['dread_hymn', 'A fearful mask sends a dark hymn into outward sound waves.', at(g.mask,13,17,.7)+at(g.note,25,10,.4)+line('M5 7 Q1 16 5 25 M26 18 Q29 22 26 27',PALE), ['shadow','sound','control']],
    ['twinlight', 'A bright sun and a dark crescent turn together around a shared ring.', faint(ring(16,16,11))+at(g.sun,10,11,.57)+at(g.moon,22,22,.62)+line('M5 21 L8 25 M24 7 L27 11',PALE), ['holy','shadow','healing','area']],
  ]),
  ...defineClass('enchanter', 6, [
    ['arcane_jolt', 'A crooked arcane spark snaps into a sharp waking star.', path('M7 26 L15 15 L9 13 L20 4 L17 14 L23 16 L13 28 Z')+star(25,8,5,.25,PALE), ['magic','projectile']],
    ['drowse', 'A sleeping eye rests under a crescent with two drifting motes.', at(g.moon,23,9,.55)+line('M5 20 Q15 27 25 18 M8 22 L6 25 M14 23 V27 M21 22 L23 25',PALE,2)+circle(7,9,1.5)+circle(12,5,1), ['mind','sleep','control']],
    ['beguile', 'A hypnotic eye holds a bright heart at its centre.', at(g.eye,16,16,.92)+at(g.heart,16,16,.33)+line('M6 6 L9 9 M23 23 L26 26',PALE), ['mind','charm','control']],
    ['lethargy', 'A heavy hourglass sinks into three slow ripples of ground.', at(g.hourglass,16,12,.64)+oval(16,24,6,2)+oval(16,25,11,4)+line('M5 8 V14 M27 8 V14',PALE), ['mind','slow','area']],
    ['phantasm', 'A solid figure and its pale double share a deceptive halo.', faint(ring(16,16,12))+faint(at(g.person,10,19,.64),.45)+at(g.person,22,16,.64)+star(10,6,3,.3,PALE), ['mind','illusion','summon']],
    ['enthrall', 'A commanding eye guides three figures on a circle of binding threads.', at(g.eye,16,8,.7)+line('M16 13 L6 23 M16 13 V23 M16 13 L26 23',GOLD,1)+at(g.person,6,25,.34)+at(g.person,16,24,.36)+at(g.person,26,25,.34), ['mind','charm','area']],
  ]),
];
