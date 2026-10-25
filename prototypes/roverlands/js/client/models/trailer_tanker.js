// Tanker Trailer (reference: assets/ref/trailer_tanker.webp). A silver round tank with a yellow band down each side,
// a railed catwalk with three hatches on top and a ladder at the back, sitting in dark cradles on the shared
// semi-trailer running gear (semi-trailer-parts.js). The tank is the `cyl` part: radius 1.05, 8.4 long, centre
// y 1.1; its domed ends stay inside the collider's flat ends.
import { createKit } from './kit.js';
import { semiTrailerGear, updateGear } from './semi-trailer-parts.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const T = 'trim', M = 'jetSilver';
  const tank = def.parts.find(p => p.cyl);
  const R = tank.cyl[0], half = tank.cyl[1] / 2, ty = tank.p[1];
  const ch = def.chassis, hz = ch.hz;
  const { wheels, top, bot } = semiTrailerGear(THREE, k, group, def, opts, { width: ch.hx, sill: T });

  // --- frame deck: edge rails + cross members on the chassis collider's top -------------------------------------
  for (const sx of [1, -1]) k.box(T, [0.12, top - bot, hz * 2], [sx * (ch.hx - 0.1), (top + bot) / 2, 0], { bevel: 0.015 });
  for (let z = -hz + 0.3; z < hz; z += 0.9) k.box(T, [ch.hx * 2 - 0.2, 0.1, 0.1], [0, top - 0.06, z], { bevel: 0.01 });

  // --- the tank: barrel, two-step domed ends, seams, yellow bands ------------------------------------------------
  const dome = 0.26, body = half - dome;
  k.cyl(M, R, body * 2, [0, ty, 0], { axis: 'z', seg: 22 });
  const r1 = R * 0.9, r2 = R * 0.58;
  for (const s of [1, -1]) {
    // kit.cyl: r is the -z end, r2 the +z end (axis 'z')
    k.cyl(M, s > 0 ? R : r1, dome * 0.5, [0, ty, s * (body + dome * 0.25)], { axis: 'z', seg: 22, r2: s > 0 ? r1 : R });
    k.cyl(M, s > 0 ? r1 : r2, dome * 0.5, [0, ty, s * (body + dome * 0.75)], { axis: 'z', seg: 22, r2: s > 0 ? r2 : r1 });
    k.cyl('steel', r2 * 0.25, 0.04, [0, ty, s * (half - 0.0)], { axis: 'z', seg: 10 });
  }
  for (const z of [-body / 3, body / 3]) k.cyl('steel', R + 0.008, 0.03, [0, ty, z], { axis: 'z', seg: 22 });   // weld seams
  for (const z of [-body, body]) k.cyl('steel', R + 0.012, 0.05, [0, ty, z], { axis: 'z', seg: 22 });
  const bandY = -0.3, bandA = Math.asin(bandY / R);
  for (const sx of [1, -1]) {
    k.box('yellow', [0.02, 0.12, body * 2 - 0.06], [sx * (Math.cos(bandA) * R + 0.004), ty + bandY, 0], { rot: [0, 0, -sx * bandA], bevel: 0 });
  }

  // --- cradles the tank sits in ------------------------------------------------------------------------------------
  for (const z of [hz - 1.0, -0.6, -hz + 1.2]) {
    k.box(T, [1.7, ty - R - top + 0.2, 0.22], [0, (ty - R + top + 0.2) / 2, z], { bevel: 0.02 });
    for (const sx of [1, -1]) k.box(T, [0.34, 0.5, 0.2], [sx * 0.72, ty - R + 0.28, z], { rot: [0, 0, sx * 0.75], bevel: 0.02 });
  }

  // --- catwalk, rails, hatches, ladder -------------------------------------------------------------------------------
  const ct = ty + R + 0.03, cz0 = -body + 0.15, cz1 = body - 0.2;
  k.box('darkMetal', [0.9, 0.04, cz1 - cz0], [0, ct, (cz0 + cz1) / 2], { bevel: 0.005 });
  for (let z = cz0 + 0.1; z < cz1; z += 0.2) k.box(T, [0.86, 0.012, 0.02], [0, ct + 0.024, z], { bevel: 0 });
  const railH = 0.42;
  for (const sx of [1, -1]) {
    const x = sx * 0.5;
    const posts = 7;
    for (let i = 0; i < posts; i++) {
      const z = cz0 + (i / (posts - 1)) * (cz1 - cz0);
      k.cyl(T, 0.022, railH, [x, ct + railH / 2, z], { seg: 5 });
    }
    k.tube(T, [[x, ct + railH, cz0], [x, ct + railH, cz1]], 0.025, { seg: 5 });
    k.tube(T, [[x, ct + railH * 0.5, cz0], [x, ct + railH * 0.5, cz1]], 0.018, { seg: 5 });
    k.box(T, [0.06, 0.08, cz1 - cz0], [x, ct + 0.02, (cz0 + cz1) / 2], { bevel: 0 });   // kick plate
  }
  k.tube(T, [[0.5, ct + railH, cz0], [-0.5, ct + railH, cz0]], 0.025, { seg: 5 });
  for (const z of [-body * 0.62, 0, body * 0.62]) {
    k.cyl('steel', 0.24, 0.1, [0, ct + 0.06, z], { seg: 8 });
    k.cyl('engine', 0.18, 0.08, [0, ct + 0.14, z], { seg: 8 });
    k.box(T, [0.08, 0.04, 0.12], [0.16, ct + 0.15, z], { bevel: 0 });
  }
  // ladder up the back dome to the catwalk
  const lz = -half - 0.06;
  for (const sx of [1, -1]) k.tube(T, [[sx * 0.22, top + 0.1, lz], [sx * 0.22, ty + R * 0.5, lz], [sx * 0.22, ct + railH, -body + 0.15]], 0.025, { seg: 5 });
  for (let y = top + 0.3; y < ty + R * 0.5; y += 0.3) k.box(T, [0.44, 0.035, 0.035], [0, y, lz], { bevel: 0 });
  // outlet valve under the back end, hose tube along the frame, front connectors
  k.cyl('steel', 0.07, 0.4, [0, ty - R + 0.1, -half + 0.15], { axis: 'z', seg: 8 });
  k.box(T, [0.18, 0.18, 0.12], [0, ty - R + 0.1, -half - 0.08], { bevel: 0.02 });
  k.cyl('steel', 0.06, hz * 1.2, [0.8, top + 0.12, -0.5], { axis: 'z', seg: 8 });
  k.box(T, [0.3, 0.14, 0.05], [0, top + 0.12, hz - 0.02], { bevel: 0.01 });
  for (const [dx, c] of [[-0.08, 'red'], [0.08, 'blue']]) k.cyl(c, 0.03, 0.06, [dx, top + 0.12, hz + 0.02], { axis: 'z', seg: 8 });

  k.finish(group);
  return { group, wheels, update(st) { updateGear(wheels, st); } };
}
