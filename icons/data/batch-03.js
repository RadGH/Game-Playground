// Batch 3: Demon Hunter, Scavenger, Swashbuckler, Dragon Knight, Pyromancer.
import { defineClass } from '../js/records.js';
import { glyph as g, at, line, path, circle, ring, oval, star, burst, sweep, trail, faint, GOLD, PALE, NIGHT } from '../js/draw.js';
export default [
  ...defineClass('demon_hunter', 3, [
    ['hex_bolt', 'A hunting bolt brands its target with a horned sigil.', at(g.arrow,15,17,.85)+at(g.imp,24,8,.38)+line('M4 17 L9 12',PALE), ['projectile','mark']],
    ['tumbling_shot', 'A bow fires while a rolling arrow curves around it.', at(g.bow,17,15,.65,30)+line('M5 10 Q1 24 14 28 Q23 30 27 23 L27 27 M27 23 L23 24',PALE), ['movement','projectile']],
    ['chain_hook', 'A heavy hooked chain stretches across the hunter’s reach.', at(g.chain,10,13,.6,20)+at(g.hook,20,17,.82)+line('M7 25 L12 20',PALE), ['weapon','control']],
    ['unleash_hound', 'A hound breaks loose from an opened chain at its feet.', at(g.wolf,16,13,.8)+at(g.chain,9,25,.36,35)+at(g.chain,25,25,.3,-35)+star(17,26,2,.3,PALE), ['summon','beast']],
    ['grudge_bolt', 'A powerful hunting arrow pierces a marked skull.', at(g.skull,21,12,.65)+at(g.arrow,14,19,.85)+star(24,8,3,.3,PALE), ['projectile','mark']],
    ['night_hunt', 'A crescent moon watches over a vigilant hunting hound.', at(g.moon,10,10,.66)+at(g.wolf,20,21,.61)+star(25,6,2,.3,PALE), ['beast','buff']],
  ]),
  ...defineClass('scavenger', 3, [
    ['lucky_strike', 'A rough blade catches a lucky coin in a sharp glint.', at(g.coin,11,12,.58)+at(g.dagger,22,20,.69,35)+star(24,7,3,.3,PALE), ['weapon','luck']],
    ['junk_toss', 'A bent gear and a scrap bolt fly out in a loose spray.', trail+at(g.gear,21,11,.56)+path('M7 7 H13 V10 H10 V15 H7 Z')+line('M24 23 L27 20',PALE,3), ['projectile','scrap']],
    ['scrounge', 'An open scavenging sack holds two newly found coins.', at(g.bag,15,20,.72)+at(g.coin,11,7,.29)+at(g.coin,23,10,.32)+star(26,21,3,.3,PALE), ['loot','scrap']],
    ['caltrop_scatter', 'Three pointed caltrops are scattered across an oval patch of ground.', oval(16,25,11,3)+line('M6 20 L11 12 L15 21 L6 18 L15 15 M18 19 L23 11 L28 20 L18 17 L27 14 M12 27 L16 20 L21 27 L12 24 L20 22',GOLD,1.8), ['trap','control']],
    ['pitch_bomb', 'A burning rag trails from a round pitch bomb before it bursts.', at(g.bomb,13,19,.78)+at(g.flame,23,9,.48)+line('M4 9 L7 11 M25 24 L28 26',PALE), ['fire','area']],
    ['big_score', 'A heavy striking fist smashes a coin into a shower of winnings.', at(g.fist,11,15,.7,45)+at(g.coin,22,22,.5)+star(25,7,3,.3,PALE)+circle(8,26,2)+circle(26,14,1.5), ['loot','luck']],
  ]),
  ...defineClass('swashbuckler', 3, [
    ['flourish', 'A slender duelling blade writes a graceful curling slash.', at(g.sword,15,17,.84,35)+line('M4 18 Q2 6 14 4 Q27 2 27 15 Q27 19 23 18',PALE), ['weapon','precision']],
    ['daring_leap', 'A feathered boot leaps over a high sweeping arc.', at(g.boot,20,12,.64,30)+at(g.feather,9,11,.42,-20)+line('M4 26 Q9 14 26 25',PALE,2), ['movement']],
    ['mocking_parry', 'A smiling mask peers above two blades crossed in a parry.', at(g.mask,16,10,.56)+at(g.sword,12,23,.48,55)+at(g.sword,21,23,.48,-55), ['counter','defense']],
    ['pinning_thrust', 'A straight rapier thrust pins a bright point inside a target.', faint(ring(25,10,5))+line('M5 26 L22 9',GOLD,3)+path('M19 10 L27 4 L24 14 Z',PALE)+line('M5 19 L12 26 M3 22 L7 26'), ['weapon','control']],
    ['matadors_turn', 'A flowing cape turns around a duellist’s poised blade.', path('M5 5 Q17 1 27 8 Q19 12 26 24 Q13 30 4 23 Q13 18 5 5 Z')+path('M8 7 Q15 14 9 24 L17 23 Q13 13 21 8 Z',NIGHT)+at(g.sword,22,18,.65,18), ['counter','movement']],
    ['grandeur', 'A bright rapier stands beneath a triumphant crown of three points.', at(g.sword,16,21,.64)+path('M5 6 L11 10 L16 3 L21 10 L27 6 L24 15 H8 Z')+line('M10 12 H22',PALE), ['weapon','finisher']],
  ]),
  ...defineClass('dragon_knight', 3, [
    ['scale_rend', 'Three fiery claw marks tear through a dragon scale.', at(g.scale,16,16,.9)+line('M10 8 L7 21 M17 7 L13 24 M24 10 L21 24',NIGHT,2.4)+star(26,6,3,.3,PALE), ['weapon','fire']],
    ['flamethrower', 'A dragon exhales a spreading plume of fire.', at(g.dragon,10,16,.67)+at(g.flame,25,18,.52,85)+line('M17 17 L22 13 M17 20 L21 25',PALE), ['fire','area']],
    ['wyrmfall', 'A descending dragon claw strikes a bright landing circle.', at(g.dragon,17,13,.72,45)+oval(16,27,10,2)+line('M6 5 L10 11 M10 3 L13 8',PALE)+star(19,25,3), ['movement','fire']],
    ['wyrm_temper', 'A dragon’s eye burns inside a rising flame.', at(g.flame,16,16,1)+at(g.eye,16,20,.55)+line('M5 8 L7 12 M27 8 L25 12',PALE), ['buff','fire']],
    ['dragonscale', 'Three overlapping dragon scales form a defensive coat.', at(g.scale,10,12,.55)+at(g.scale,23,12,.55)+at(g.scale,16,23,.57), ['defense','armor']],
    ['wyrm_ascendant', 'A dragon rises between two broad unfolding wings.', at(g.wing,8,14,.62,-25)+at(g.wing,24,14,.62,25)+at(g.dragon,16,20,.68)+star(16,4,3,.3,PALE), ['transformation','dragon']],
  ]),
  ...defineClass('pyromancer', 3, [
    ['firebolt', 'A compact fireball races ahead of three hot streaks.', trail+at(g.flame,20,12,.78,42)+line('M6 12 L10 8',PALE), ['fire','projectile']],
    ['fire_wall', 'Three flames stand side by side along a burning boundary.', at(g.flame,7,19,.51)+at(g.flame,16,14,.75)+at(g.flame,25,19,.51)+line('M4 28 H28',PALE,2), ['fire','area']],
    ['ember_stride', 'A boot runs forward leaving a trail of small flames.', at(g.boot,23,13,.7,22)+at(g.flame,7,23,.4)+at(g.flame,15,25,.26), ['fire','movement']],
    ['stoke_familiar', 'A small winged flame familiar is fed a fresh spark.', at(g.wing,7,17,.45,-15)+at(g.wing,25,17,.45,15)+at(g.flame,16,18,.7)+star(16,4,3,.3,PALE), ['fire','summon']],
    ['flashover', 'A central flame erupts into a ring of outward-reaching rays.', burst+at(g.flame,16,16,.72)+oval(16,25,10,3), ['fire','area']],
    ['meteor', 'A blazing stone falls diagonally with a long forked tail.', path('M24 3 L22 17 L13 10 Z M29 8 L23 23 L18 17 Z')+circle(12,21,8)+line('M8 18 L12 15 L17 20 L14 26 L8 24 Z',NIGHT,1.6)+line('M7 6 L12 11',PALE), ['fire','area']],
  ]),
];
