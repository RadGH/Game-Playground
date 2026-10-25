// Loose props (crate, bag, barrel, ball, jetpack): a small model per kind, origin at the body's centre.
import { createKit } from './kit.js';
export function buildProp(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const g = new THREE.Group();
  const sh = def.shape || { t: 'box', hx: 0.3, hy: 0.25, hz: 0.3 };
  if (def.kind === 'crate') {
    k.box('crateWood', [sh.hx * 2, sh.hy * 2, sh.hz * 2], [0, 0, 0], { bevel: 0.02 });
    for (const sy of [1, -1]) k.box('crateDark', [sh.hx * 2.02, 0.05, sh.hz * 2.02], [0, sy * (sh.hy - 0.05), 0], { bevel: 0 });
    k.box('crateDark', [0.05, sh.hy * 1.8, sh.hz * 2.03], [0, 0, 0], { rot: [0.8, 0, 0], bevel: 0 });
  } else if (def.kind === 'bag') {
    k.box('canvas', [sh.hx * 2, sh.hy * 2, sh.hz * 2], [0, 0, 0], { bevel: 0.08 });
    k.box('trim', [sh.hx * 1.2, 0.04, 0.04], [0, sh.hy + 0.03, 0], { bevel: 0 });
  } else if (def.kind === 'barrel') {
    k.cyl('barrelRed', sh.r, sh.h, [0, 0, 0], { seg: 12 });
    for (const y of [-0.3, 0, 0.3]) k.cyl('darkMetal', sh.r * 1.02, 0.04, [0, y * sh.h, 0], { seg: 12 });
  } else if (def.kind === 'ball') {
    k.sphere('ballWhite', sh.r, [0, 0, 0], { seg: 16 });
    for (const a of [0, 1.05, 2.1]) k.box('ballBlue', [0.06, sh.r * 2.01, sh.r * 2.01], [0, 0, 0], { rot: [0, a, 0], bevel: 0 });
  } else if (def.kind === 'jetpack') {
    for (const sx of [1, -1]) { k.cyl('jetSilver', 0.12, 0.5, [sx * 0.13, 0, 0], { seg: 10 }); k.cyl('darkMetal', 0.08, 0.12, [sx * 0.13, -0.3, 0], { seg: 8, r2: 0.05 }); }
    k.box('orange', [0.36, 0.3, 0.14], [0, 0.05, 0.12], { bevel: 0.04 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 8).rotateX(Math.PI), k.mat('flame'));
    flame.position.set(0, -0.6, 0); flame.visible = false; g.add(flame); g.userData.flame = flame;
  } else k.box('crateWood', [sh.hx * 2 || 0.5, sh.hy * 2 || 0.5, sh.hz * 2 || 0.5], [0, 0, 0], {});
  k.finish(g);
  return { group: g, wheels: [], update(st) { if (g.userData.flame) { g.userData.flame.visible = !!st?.flame; g.userData.flame.scale.y = 0.8 + Math.random() * 0.5; } } };
}
