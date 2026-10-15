// Batch 7 (play-test 11, owner #53): the Star Blade — the Starcaller's melee partner. Same medallion and gold as the
// Starcaller's batch 0 (the pair reads as one family); what is new is STAR STEEL — a cold silver for every blade, shield
// rim and binding, so a Star Blade's six read as a sword-and-shield set where the Starcaller's are thrown stars.
// Hand-drawn SVG on the shared 32px primitives (js/draw.js), like batches 1-6.
import { defineClass } from '../js/records.js';
import { glyph as g, at, line, path, circle, ring, oval, star, faint, GOLD, PALE, NIGHT } from '../js/draw.js';

export const STEEL = '#c9d3e6';
const blade = (x1, y1, x2, y2, w = 1.6) => {
  // a straight blade from hilt (x1,y1) to point (x2,y2), drawn as a thin steel quad with a pale fuller
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L * w, ny = dx / L * w;
  const p = [[x1 + nx, y1 + ny], [x2 - dx / L * 2 + nx * 0.6, y2 - dy / L * 2 + ny * 0.6], [x2, y2], [x2 - dx / L * 2 - nx * 0.6, y2 - dy / L * 2 - ny * 0.6], [x1 - nx, y1 - ny]];
  return path(`M${p.map(q => q.map(v => +v.toFixed(2)).join(' ')).join('L')}Z`, STEEL) + line(`M${x1} ${y1} L${+(x2 - dx / L * 3).toFixed(2)} ${+(y2 - dy / L * 3).toFixed(2)}`, PALE, 0.7);
};

export default [
  ...defineClass('starblade', 7, [
    ['starcut', 'A star-steel sword cuts a bright arc and a gold star flares at its point.',
      faint(line('M4 19 Q4 6 19 4', PALE, 1.6), 0.55) + blade(10.5, 21.5, 24, 8) + line('M7.2 18.6 L13.4 24.8', GOLD, 2.4) + line('M10.2 21.8 L6.6 25.4', GOLD, 2.2) + circle(5.8, 26.2, 1.5) + star(24.5, 7.5, 5.5, 0.28) + star(24.5, 7.5, 2.4, 0.4, PALE),
      ['stars', 'weapon', 'martial']],
    ['star_aegis', 'A round shield rimmed in star steel holds a gold star, with short sparks striking outward from its edge.',
      circle(16, 16, 10.5, GOLD) + circle(16, 16, 8.6, NIGHT) + ring(16, 16, 10.5, STEEL, 1.6) + star(16, 16, 6.5, 0.3) + star(16, 16, 2.6, 0.4, PALE)
      + line('M16 2.5 V4.8 M16 27.2 V29.5 M2.5 16 H4.8 M27.2 16 H29.5 M6.4 6.4 L8 8 M25.6 25.6 L24 24 M6.4 25.6 L8 24 M25.6 6.4 L24 8', PALE, 1.4)
      + star(16, 7.2, 1.4, 0.4, STEEL) + star(24.8, 16, 1.4, 0.4, STEEL) + star(16, 24.8, 1.4, 0.4, STEEL) + star(7.2, 16, 1.4, 0.4, STEEL),
      ['stars', 'shield', 'defense', 'counter']],
    ['star_tether', 'Four gold threads reel small foes in from the edges toward a bright central star.',
      line('M5 6 Q11 13 13 14 M27 6 Q21 13 19 14 M5 26 Q11 19 13 18 M27 26 Q21 19 19 18', GOLD, 1.3)
      + line('M10.5 11.2 L13 14 L9.6 13.4 M21.5 11.2 L19 14 L22.4 13.4 M10.5 20.8 L13 18 L9.6 18.6 M21.5 20.8 L19 18 L22.4 18.6', PALE, 1.1)
      + circle(5, 6, 2.2, STEEL) + circle(27, 6, 2.2, STEEL) + circle(5, 26, 2.2, STEEL) + circle(27, 26, 2.2, STEEL)
      + star(16, 16, 5.5, 0.3) + star(16, 16, 2.2, 0.4, PALE),
      ['stars', 'pull', 'control', 'taunt']],
    ['comet_rush', 'A gold comet races forward on a long star-steel tail shaped like a sword, speed lines behind it.',
      path('M4 27 L20 13 L23 16 Z', STEEL) + line('M6 25 L20 14', PALE, 0.8) + faint(line('M3 19 L11 13 M9 29 L15 23', PALE, 1.3), 0.6)
      + star(23, 10, 6.5, 0.3) + star(23, 10, 2.8, 0.4, PALE),
      ['stars', 'movement', 'control']],
    ['binding_stars', 'A ring of six stars on the ground is joined by steel links that pin the middle.',
      oval(16, 20, 12, 6.5, STEEL) + faint(oval(16, 20, 8, 4, GOLD), 0.7)
      + star(4.5, 19, 2.8) + star(27.5, 19, 2.8) + star(9.5, 14.5, 2.5) + star(22.5, 14.5, 2.5) + star(9.5, 25.4, 2.8) + star(22.5, 25.4, 2.8)
      + line('M7 19 L13 19.6 M25 19 L19 19.6 M11 16 L14.2 18.4 M21 16 L17.8 18.4', STEEL, 1.5)
      + circle(16, 19.8, 2.3, PALE) + at(g.chain, 16, 8.5, 0.32, 45),
      ['stars', 'control', 'area', 'zone']],
    ['collapsing_star', 'A great star folds in on itself: its points curl toward a dark centre with one hard bright core.',
      faint(ring(16, 16, 12, GOLD, 1.2), 0.5)
      + path('M16 3 Q19 12 16 14 Q13 12 16 3 Z M29 16 Q20 19 18 16 Q20 13 29 16 Z M16 29 Q13 20 16 18 Q19 20 16 29 Z M3 16 Q12 13 14 16 Q12 19 3 16 Z', GOLD)
      + line('M8 8 Q12 9 13.4 13.4 M24 8 Q23 12 18.6 13.4 M24 24 Q20 23 18.6 18.6 M8 24 Q9 20 13.4 18.6', STEEL, 1.3)
      + circle(16, 16, 3.6, NIGHT) + star(16, 16, 2.6, 0.35, PALE),
      ['stars', 'area', 'pull']],
  ]),
];
