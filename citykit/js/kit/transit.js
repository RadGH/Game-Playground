// Transit: an elevated station for the monorail (line 1) or maglev (line 2). 2×2, platform up on pillars with a
// glowing canopy edge, stairs down to the street. The track itself is drawn by the game along its tiles.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { box, cyl, neonEdges, FLOOR, bodyMat, trimMat, neonMat, glassMat } from './shapes.js';
import { lotPad } from './shapes.js';

addRecipes({
  'tr-station': {
    name: 'Transit Station', group: 'colony', size: [2, 2], blurb: 'An elevated station on a monorail or maglev line.',
    params: [{ key: 'line', label: 'Line', min: 1, max: 2, step: 1, def: 1, names: [, 'Monorail', 'Maglev'] }],
    build(p) {
      const g = new THREE.Group(); const y0 = lotPad(g, 2, 2, '#5a616b');
      const deck = 0.62, col = p.line === 2 ? '#b77dff' : '#3ff0ff';
      for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) cyl(g, 0.07, deck, trimMat(p.style), x, y0, z, { seg: 10 });
      box(g, 1.9, 0.08, 1.2, bodyMat(p.style, 1), 0, y0 + deck, -0.2);                       // platform
      box(g, 1.9, 0.04, 0.12, neonMat(col, 0.5), 0, y0 + deck + 0.08, 0.38);                  // platform edge light
      // canopy on slim posts, glass roof with a neon rim
      for (const x of [-0.8, 0.8]) for (const z of [-0.7, 0.25]) cyl(g, 0.025, 0.45, trimMat(p.style), x, y0 + deck + 0.08, z, { seg: 8 });
      box(g, 1.95, 0.04, 1.15, glassMat(p.style), 0, y0 + deck + 0.53, -0.22);
      neonEdges(g, 1.95, 1.15, col, 0, y0 + deck + 0.55, -0.22, 0.02, 0.4);
      // stairs down to the street on the +z side
      for (let k = 0; k < 6; k++) box(g, 0.4, 0.06, 0.12, trimMat(p.style), 0.65, y0 + deck - (k + 1) * (deck / 7), 0.42 + k * 0.09);
      // a ticket kiosk and a holo line sign
      box(g, 0.3, 0.3, 0.25, bodyMat(p.style, 0), -0.6, y0, 0.6);
      box(g, 0.5, 0.18, 0.03, neonMat(col, 0.8), -0.4, y0 + deck + 0.25, 0.35);
      void FLOOR;
      return g;
    },
  },
});
