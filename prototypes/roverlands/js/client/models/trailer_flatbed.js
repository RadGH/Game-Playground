// Flatbed Trailer (reference: assets/ref/trailer_flatbed.webp). A long grey plank deck with dark edge rails (amber
// markers, stake pockets), a headboard at the front, on the shared semi-trailer running gear (semi-trailer-parts.js).
// The deck top is the chassis collider's top (y 0); the rails and headboard are drawn exactly on their parts.
import { createKit } from './kit.js';
import { semiTrailerGear, updateGear } from './semi-trailer-parts.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const T = 'trim', G1 = '#8e9297', G2 = '#7e8287';
  const P = def.parts;
  const rail = P.find(p => p.box[0] < 0.1 && p.box[2] > 1), head = P.find(p => p.box[2] < 0.1);
  const rx = rail.p[0], rw = rail.box[0], rTop = rail.p[1] + rail.box[1];
  const hz = def.chassis.hz;
  const { wheels, top, bot } = semiTrailerGear(THREE, k, group, def, opts, { width: rx + rw, sill: null, markers: false });

  // --- deck: a frame slab under eight long grey planks --------------------------------------------------------------
  const ix = rx - rw;
  k.box(T, [ix * 2, top - bot - 0.04, hz * 2], [0, (top + bot) / 2 - 0.02, 0], { bevel: 0.01 });
  for (let i = 0; i < 8; i++) k.box(i % 2 ? G2 : G1, [ix * 2 / 8 - 0.012, 0.04, hz * 2 - 0.04], [-ix + (i + 0.5) * (ix * 2 / 8), top - 0.02, 0], { bevel: 0.004 });

  // --- edge rails: the deep side beam down to the frame + the low rail on top (= the rail collider) ---------------
  for (const sx of [1, -1]) {
    k.box(T, [rw * 2, top - bot + 0.1, hz * 2], [sx * rx, (top + bot) / 2, 0], { bevel: 0.015 });          // deck edge beam
    k.box(T, [rw * 2, 0.07, hz * 2], [sx * rx, rTop - 0.035, 0], { bevel: 0.015 });                        // top rail
    for (let i = 0; i <= 15; i++) k.box(T, [rw * 1.4, rTop - top, 0.06], [sx * rx, (rTop + top) / 2, -hz + 0.05 + i * ((hz * 2 - 0.1) / 15)], { bevel: 0 });
    for (let z = -hz + 0.6; z < hz - 0.2; z += 1.15) {
      k.box('amber', [0.03, 0.06, 0.12], [sx * (rx + rw + 0.01), bot + 0.04, z], { bevel: 0 });
      k.box('darkMetal', [0.06, 0.1, 0.1], [sx * (rx + rw + 0.02), top - 0.02, z + 0.5], { bevel: 0.005 });   // stake pocket
    }
  }
  k.box(T, [(rx + rw) * 2, top - bot + 0.1, 0.08], [0, (top + bot) / 2, -hz + 0.04], { bevel: 0.015 });   // rear sill

  // --- headboard: a frame with a ribbed panel, exactly on its collider ---------------------------------------------
  const hx = head.box[0], hh = head.box[1], hzc = head.p[2], hd = head.box[2];
  const hTop = head.p[1] + hh;
  k.box('steel', [hx * 2 - 0.12, hh * 2 - 0.1, hd * 1.2], [0, head.p[1], hzc], { bevel: 0.01 });
  for (const sx of [1, -1]) k.box(T, [0.1, hh * 2, hd * 2], [sx * (hx - 0.05), head.p[1], hzc], { bevel: 0.015 });
  k.box(T, [hx * 2, 0.1, hd * 2], [0, hTop - 0.05, hzc], { bevel: 0.015 });
  for (let i = 1; i < 4; i++) k.box(T, [hx * 2 - 0.1, 0.05, hd * 2], [0, top + i * (hh * 2 / 4), hzc], { bevel: 0 });
  for (let i = -3; i <= 3; i++) k.box(T, [0.04, hh * 2 - 0.1, hd * 2 - 0.02], [i * (hx / 4), head.p[1], hzc], { bevel: 0 });
  for (const sx of [1, -1]) k.box('amber', [0.08, 0.05, 0.03], [sx * (hx - 0.05), hTop - 0.05, hzc + hd + 0.01], { bevel: 0 });
  // air + light connectors under the headboard
  k.box(T, [0.3, 0.14, 0.05], [0, bot - 0.02, hz + 0.02], { bevel: 0.01 });
  for (const [dx, c] of [[-0.08, 'red'], [0.08, 'blue']]) k.cyl(c, 0.03, 0.06, [dx, bot - 0.02, hz + 0.06], { axis: 'z', seg: 8 });

  k.finish(group);
  return { group, wheels, update(st) { updateGear(wheels, st); } };
}
