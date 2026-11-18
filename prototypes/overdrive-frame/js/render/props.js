// Overdrive Frame's own models, registered into the City Kit catalogue at run time (so they bake like everything else
// and show on the City Kit page when this file is loaded): the dropship that carries you in and out, the handler's
// command drone (shown on comms), and the fuel-tank lots that blow up.
import * as THREE from 'three';
import { addRecipes } from '../../../../citykit/js/kit/buildings.js';
import { box, cyl, dome } from '../../../../citykit/js/kit/shapes.js';
import { bodyMat, neonMat, trimMat } from '../../../../citykit/js/kit/materials.js';

const hull = (c, metal = 0.55, rough = 0.42) => bodyMat('graphite', 0, { color: c, metal, rough });

addRecipes({
  'fuel-tanks': {
    name: 'Fuel Tanks', group: 'industry', genre: ['industrial'], size: [1, 1], blurb: 'Two pressure tanks on a pad. They go up in a fireball.',
    params: [{ key: 'tanks', label: 'Tanks', min: 1, max: 3, step: 1, def: 2 }],
    build(p) {
      const g = new THREE.Group(), pad = hull('#4a4f58', 0.2, 0.8);
      box(g, 0.94, 0.03, 0.94, pad);
      const n = p.tanks || 2, white = hull('#d8dbe0', 0.3, 0.5), stripe = neonMat('#ff8a2a', 0.35);
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : -0.24 + i * (0.48 / Math.max(1, n - 1)), z = (i % 2 ? 0.12 : -0.1);
        const t = cyl(g, 0.17, 0.26, white, x, 0.03, z, { seg: 22 }); dome(g, 0.17, white, x, 0.29, z, { squash: 0.45 });
        cyl(g, 0.175, 0.025, stripe, x, 0.17, z, { seg: 22 });
        box(g, 0.03, 0.29, 0.03, trimMat('concrete'), x + 0.16, 0.03, z);
        t.userData.part = 'tank';
      }
      box(g, 0.6, 0.02, 0.04, trimMat('concrete'), 0, 0.22, 0.32);
      return g;
    },
  },
  'of-dropship': {
    name: 'Dropship', group: 'vehicles', genre: ['military'], dirs: 16, blurb: 'Carries a frame in and out. Four tilting engines, a cradle under the belly.',
    params: [{ key: 'cargo', label: 'Cargo', min: 0, max: 1, step: 1, def: 1, names: ['Empty', 'Frame aboard'] },
      { key: 'parked', label: 'Parked', min: 0, max: 1, step: 1, def: 0, names: ['Flying', 'On the pad (gear down)'] }],
    anims: { hover: { label: 'Hover', frames: 4, fps: 8 } },
    build(p) {
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      const plate = hull('#5a6170'), dark = hull('#2c313b'), glow = neonMat('#3ff0ff', 0.7), warn = neonMat('#ff8a2a', 0.6);
      const baseY = p.parked ? 0.27 : 1.1; body.position.y = baseY;
      box(body, 1.2, 0.18, 0.42, plate, 0, 0, 0); box(body, 0.5, 0.14, 0.34, dark, 0.48, 0.12, 0);        // fuselage + cockpit block
      box(body, 0.22, 0.05, 0.26, glow, 0.68, 0.16, 0);                                                     // canopy glow
      box(body, 0.3, 0.12, 0.3, plate, -0.62, 0.06, 0); box(body, 0.05, 0.24, 0.02, plate, -0.7, 0.18, 0);  // tail + fin
      for (const s of [-1, 1]) {
        box(body, 0.7, 0.04, 0.24, plate, -0.05, 0.08, s * 0.33);                                           // wing
        for (const ex of [-0.3, 0.25]) {
          const e = cyl(body, 0.09, 0.12, dark, ex, -0.02, s * 0.5, { seg: 16 }); e.userData.engine = true;
          cyl(body, 0.07, 0.02, glow, ex, -0.04, s * 0.5, { seg: 16 });
        }
      }
      // cradle clamps under the belly
      for (const s of [-1, 1]) box(body, 0.06, 0.16, 0.06, dark, s * 0.25, -0.16, 0);
      box(body, 0.6, 0.03, 0.08, warn, 0, -0.16, 0);
      if (p.parked) {                                   // landing gear, a lowered ramp and the pad's work lights on the hull
        for (const x of [-0.42, 0.36]) for (const s of [-1, 1]) { box(g, 0.035, 0.2, 0.035, dark, x, 0.0, s * 0.16); box(g, 0.1, 0.02, 0.07, dark, x, 0, s * 0.16); }
        box(g, 0.34, 0.012, 0.24, warn, -0.05, 0, 0);
        box(body, 0.12, 0.03, 0.03, neonMat('#5dff6a', 0.8), 0.2, 0.19, 0.18);
      }
      if (p.cargo) { const c = box(body, 0.22, 0.5, 0.22, hull('#8a8f9a'), 0, -0.68, 0); c.userData.cargo = true; }
      g.userData.pose = (anim, phase, heading) => { g.rotation.y = -heading; body.position.y = baseY + (p.parked ? 0 : Math.sin(phase * Math.PI * 2) * 0.02); };
      g.userData.face = h => { g.rotation.y = -h; };
      return g;
    },
  },
  'of-command-drone': {
    name: 'Command Drone', group: 'vehicles', genre: ['military'], dirs: 16, blurb: "The handler's eye over the battlefield: a sensor ball inside two rings.",
    params: [],
    anims: { hover: { label: 'Hover', frames: 4, fps: 6 } },
    build(p) {
      const g = new THREE.Group(), b = new THREE.Group(); g.add(b); b.position.y = 0.5;
      const shell = hull('#c9ced6', 0.4, 0.35), dark = hull('#2a2f38'), eye = neonMat('#ffcf4a', 0.9);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), shell); ball.castShadow = true; b.add(ball);
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), eye); lens.position.set(0.1, 0, 0); b.add(lens);
      for (const [r, tilt] of [[0.2, 0.35], [0.24, -0.5]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 40), dark); ring.rotation.x = Math.PI / 2 + tilt; b.add(ring); }
      box(b, 0.01, 0.16, 0.01, dark, 0, 0.1, 0); const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), neonMat('#ff4040', 0.9)); tip.position.y = 0.27; b.add(tip);
      g.userData.pose = (anim, phase, heading) => { g.rotation.y = -heading; b.position.y = 0.5 + Math.sin(phase * Math.PI * 2) * 0.015; };
      g.userData.face = h => { g.rotation.y = -h; };
      return g;
    },
  },
});
