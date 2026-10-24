// SKETCHY COPY's doodles: each a list of strokes, a stroke a list of [x, y] points on the 256 grid. `lv` is how hard
// it is to copy from memory (1 = a couple of lines, 3 = several parts). The Halloween list has the SAME levels in the
// SAME order, so a season swaps the pictures and never the random numbers the match uses.
const P = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n)).map(([x, y]) => [Math.round(x), Math.round(y)]);
const circle = (cx, cy, r, a0 = 0, a1 = Math.PI * 2, n = 28) => P(n, u => [cx + Math.cos(a0 + (a1 - a0) * u) * r, cy + Math.sin(a0 + (a1 - a0) * u) * r]);
const ellipse = (cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2, n = 28) => P(n, u => [cx + Math.cos(a0 + (a1 - a0) * u) * rx, cy + Math.sin(a0 + (a1 - a0) * u) * ry]);
const star = (cx, cy, R, r, k = 5) => P(k * 2, u => { const i = Math.round(u * k * 2), a = -Math.PI / 2 + i * Math.PI / k, rr = i % 2 ? r : R; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
const heart = (cx, cy, s) => P(40, u => { const t = u * Math.PI * 2; return [cx + s * 16 * Math.sin(t) ** 3 / 16, cy - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]; });
const spiral = (cx, cy, r, turns) => P(60, u => [cx + Math.cos(u * turns * Math.PI * 2) * r * u, cy + Math.sin(u * turns * Math.PI * 2) * r * u]);

export const SHAPES = [
  { id: 'star', name: 'a star', lv: 1, k: [star(128, 132, 100, 42)] },
  { id: 'heart', name: 'a heart', lv: 1, k: [heart(128, 128, 90)] },
  { id: 'house', name: 'a house', lv: 1, k: [[[56, 120], [56, 220], [200, 220], [200, 120], [56, 120]], [[40, 128], [128, 40], [216, 128]]] },
  { id: 'zigzag', name: 'a lightning bolt', lv: 1, k: [[[150, 20], [80, 130], [140, 130], [96, 236], [190, 104], [128, 104], [170, 20], [150, 20]]] },
  { id: 'fish', name: 'a fish', lv: 2, k: [ellipse(110, 128, 72, 44), [[180, 128], [228, 90], [228, 166], [180, 128]], circle(80, 116, 6, 0, Math.PI * 2, 10)] },
  { id: 'sun', name: 'a sun', lv: 2, k: [circle(128, 128, 48), ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return [[128 + Math.cos(a) * 66, 128 + Math.sin(a) * 66], [128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108]].map(q => q.map(Math.round)); })] },
  { id: 'smiley', name: 'a smiley face', lv: 2, k: [circle(128, 128, 100), circle(92, 100, 10, 0, Math.PI * 2, 10), circle(164, 100, 10, 0, Math.PI * 2, 10), circle(128, 132, 56, 0.35, Math.PI - 0.35, 16)] },
  { id: 'tree', name: 'a pine tree', lv: 2, k: [[[128, 24], [56, 120], [96, 120], [40, 196], [216, 196], [160, 120], [200, 120], [128, 24]], [[112, 196], [112, 236], [144, 236], [144, 196]]] },
  { id: 'snail', name: 'a snail', lv: 3, k: [spiral(140, 120, 70, 2.5), [[40, 196], [220, 196]], [[64, 196], [40, 130]], [[40, 130], [30, 108]], [[40, 130], [56, 110]]] },
  { id: 'boat', name: 'a sailing boat', lv: 3, k: [[[30, 170], [226, 170], [196, 220], [60, 220], [30, 170]], [[128, 170], [128, 30]], [[128, 40], [200, 150], [128, 150]], [[120, 60], [60, 150], [120, 150]]] },
  { id: 'flower', name: 'a flower', lv: 3, k: [circle(128, 96, 22), ...Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3; return circle(128 + Math.cos(a) * 46, 96 + Math.sin(a) * 46, 24, 0, Math.PI * 2, 14); }), [[128, 150], [128, 240]], [[128, 200], [168, 176]]] },
  { id: 'cat', name: 'a cat face', lv: 3, k: [circle(128, 140, 84), [[60, 92], [64, 20], [112, 62]], [[196, 92], [192, 20], [144, 62]], circle(98, 128, 9, 0, Math.PI * 2, 10), circle(158, 128, 9, 0, Math.PI * 2, 10), [[20, 150], [90, 160]], [[236, 150], [166, 160]], [[118, 168], [128, 178], [138, 168]]] },
];
export const SHAPES_HW = [
  { id: 'moon', name: 'a moon', lv: 1, k: [[...circle(128, 128, 100, -Math.PI / 2, Math.PI / 2, 22), ...ellipse(128, 128, 45, 100, Math.PI / 2, -Math.PI / 2, 18)]] },
  { id: 'candy', name: 'a wrapped sweet', lv: 1, k: [circle(128, 128, 52), [[76, 128], [24, 88], [24, 168], [76, 128]], [[180, 128], [232, 88], [232, 168], [180, 128]]] },
  { id: 'hat', name: 'a witch hat', lv: 1, k: [[[24, 200], [232, 200]], [[64, 200], [140, 28], [192, 200]]] },
  { id: 'bat-wing', name: 'a bat', lv: 1, k: [[[128, 100], [80, 60], [20, 90], [44, 120], [64, 112], [80, 140], [104, 128], [128, 160], [152, 128], [176, 140], [192, 112], [212, 120], [236, 90], [176, 60], [128, 100]]] },
  { id: 'pumpkin', name: 'a pumpkin', lv: 2, k: [ellipse(128, 150, 104, 80), ellipse(128, 150, 40, 80), [[128, 70], [140, 30], [156, 34]]] },
  { id: 'ghost', name: 'a ghost', lv: 2, k: [[[56, 220], ...circle(128, 110, 72, Math.PI, Math.PI * 2, 18), [200, 220], [176, 200], [152, 220], [128, 200], [104, 220], [80, 200], [56, 220]], circle(104, 104, 10, 0, Math.PI * 2, 10), circle(152, 104, 10, 0, Math.PI * 2, 10)] },
  { id: 'web', name: 'a spider web', lv: 2, k: [...Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3; return [[128, 128], [128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110]].map(q => q.map(Math.round)); }), circle(128, 128, 50, 0, Math.PI * 2, 6), circle(128, 128, 90, 0, Math.PI * 2, 6)] },
  { id: 'candle', name: 'a candle', lv: 2, k: [[[92, 236], [92, 110], [164, 110], [164, 236], [92, 236]], [[128, 104], [110, 70], [128, 30], [146, 70], [128, 104]]] },
  { id: 'cauldron', name: 'a bubbling pot', lv: 3, k: [ellipse(128, 150, 96, 76, -0.1, Math.PI + 0.1, 24), [[28, 140], [228, 140]], circle(100, 100, 16, 0, Math.PI * 2, 12), circle(150, 76, 12, 0, Math.PI * 2, 10), [[70, 222], [56, 244]], [[186, 222], [200, 244]]] },
  { id: 'broom', name: 'a broomstick', lv: 3, k: [[[40, 40], [160, 160]], [[150, 150], [130, 200], [176, 236], [216, 236], [210, 190], [170, 140], [150, 150]], [[160, 180], [190, 210]]] },
  { id: 'black-cat', name: 'a cat on a fence', lv: 3, k: [[[20, 220], [236, 220]], [[40, 220], [40, 180]], [[216, 220], [216, 180]], ellipse(120, 176, 56, 40), circle(176, 128, 28), [[156, 108], [160, 80], [176, 100]], [[192, 104], [200, 80], [204, 112]], [[64, 176], [30, 140], [40, 100]]] },
  { id: 'jack', name: 'a smiling jack-o\'-lantern', lv: 3, k: [ellipse(128, 140, 104, 92), [[84, 108], [104, 84], [124, 108], [84, 108]], [[132, 108], [152, 84], [172, 108], [132, 108]], [[70, 150], [96, 176], [128, 160], [160, 176], [186, 150]], [[128, 48], [136, 22]]] },
];
