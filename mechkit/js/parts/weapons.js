// Weapons. One drawer per weapon kind, dressed in the maker's shape language (kit.block), so a Brannoch shotgun and a
// Patchwork scattergun share a silhouette but not a look.
//   build(root, part, side): root's origin is the hand grip (arm weapons) or the mount on top of the core (shoulder
//   weapons); the barrel points +x; side = +1 right / −1 left. Sets root.userData.muzzle = [x, y, z] — where shots,
//   flashes and beams start (the game draws them live; bake-mech gives the muzzle's pixel per direction).
import { addParts, kitOf, box, cbox, rbox, cyl, ball, ring, rod, prism, at, block, hazard, glowOf } from './kit.js';
import { PARTS_JSON } from '../data.js';

const W = {};
const muzzle = (root, x, y, z) => { root.userData.muzzle = [x, y, z]; };
const BLADE = c => glowOf(c, 0.95);

// ---------------------------------------------------------------------------------------------------------- arm guns
W.rifle = (K, g, p, side) => {
  block(K, g, 0.13, 0.036, 0.03, K.P, 0.035, 0.0, 0);
  block(K, g, 0.05, 0.024, 0.032, K.S, -0.03, 0.006, 0);
  cyl(g, 0.009, 0.1, K.N, 'x', 0.15, 0.006, 0, { seg: 10 });
  cyl(g, 0.013, 0.02, K.D, 'x', 0.2, 0.006, 0, { seg: 10 });
  box(g, 0.022, 0.045, 0.018, K.D, 0.03, -0.035, 0).rotation.z = 0.15;      // magazine
  box(g, 0.05, 0.012, 0.012, K.D, 0.04, 0.026, 0); box(g, 0.004, 0.008, 0.008, K.G, 0.066, 0.026, 0);   // scope
  muzzle(g, 0.21, 0.006, 0);
};
W.mg = (K, g, p, side) => {
  block(K, g, 0.11, 0.04, 0.034, K.P, 0.025, 0, 0);
  cyl(g, 0.012, 0.12, K.N, 'x', 0.14, 0.004, 0, { seg: 10 });
  for (let i = 0; i < 4; i++) ring(g, 0.012, 0.003, K.D, 'x', 0.1 + i * 0.025, 0.004, 0);
  cyl(g, 0.026, 0.028, K.S, 'z', 0.02, -0.025, side * 0.03, { seg: 14 });   // side drum
  box(g, 0.02, 0.01, 0.036, K.A, -0.02, 0.022, 0);
  muzzle(g, 0.2, 0.004, 0);
};
W.shotgun = (K, g, p, side) => {
  const twin = K.look === 'scrap';
  block(K, g, 0.1, 0.045, 0.04, K.P, 0.02, 0, 0);
  if (twin) for (const z of [-0.011, 0.011]) cyl(g, 0.01, 0.11, K.N, 'x', 0.11, 0.008, z, { seg: 10 });
  else { cyl(g, 0.016, 0.08, K.N, 'x', 0.1, 0.008, 0, { seg: 12 }); block(K, g, 0.04, 0.02, 0.036, K.S, 0.1, -0.015, 0); }
  box(g, 0.03, 0.03, 0.03, K.A, -0.035, -0.005, 0);
  muzzle(g, twin ? 0.165 : 0.14, 0.008, 0);
};
W['laser-rifle'] = (K, g, p, side) => {
  prism(g, 'lr-body', [[-0.05, -0.02], [0.08, -0.014], [0.17, -0.004], [0.17, 0.008], [0.06, 0.02], [-0.04, 0.022]], 0.03, K.P, 0.003);
  prism(g, 'lr-under', [[-0.02, -0.03], [0.08, -0.022], [0.08, -0.012], [-0.03, -0.015]], 0.022, K.S, 0.002);
  for (let i = 0; i < 3; i++) ring(g, 0.012, 0.003, K.G, 'x', 0.1 + i * 0.022, 0.002, 0);
  box(g, 0.006, 0.008, 0.008, BLADE('#bff9ff'), 0.172, 0.002, 0);
  box(g, 0.06, 0.003, 0.004, K.G, 0.02, 0.022, 0);
  muzzle(g, 0.18, 0.002, 0);
};
W.pulse = (K, g, p, side) => {
  cbox(g, 0.1, 0.036, 0.034, 0.008, K.P, 0.03, 0, 0);
  cbox(g, 0.05, 0.022, 0.024, 0.006, K.S, 0.1, 0.004, 0);
  for (let i = 0; i < 3; i++) box(g, 0.012, 0.004, 0.036, K.G, 0.0 + i * 0.02, 0.019, 0);
  box(g, 0.004, 0.012, 0.012, K.G, 0.126, 0.004, 0);
  muzzle(g, 0.13, 0.004, 0);
};
W.grenade = (K, g, p, side) => {
  block(K, g, 0.08, 0.04, 0.04, K.P, 0.0, 0, 0);
  cyl(g, 0.026, 0.045, K.S, 'x', 0.065, -0.002, 0, { seg: 8 });         // revolver drum
  cyl(g, 0.017, 0.06, K.N, 'x', 0.115, 0.004, 0, { seg: 12 });
  hazard(K, g, 0.0405, -0.008, 0, 0.034, 0.012, 3);
  muzzle(g, 0.145, 0.004, 0);
};
W.rivet = (K, g, p, side) => {
  box(g, 0.1, 0.05, 0.036, K.P, 0.02, -0.004, 0).rotation.z = 0.04;
  box(g, 0.09, 0.012, 0.02, K.M, 0.02, 0.028, 0);                        // the rivet strip
  cyl(g, 0.01, 0.05, K.N, 'x', 0.09, -0.01, 0, { seg: 8 });
  cyl(g, 0.016, 0.04, K.U, 'z', -0.03, -0.004, side * 0.024, { seg: 10 });  // air tank
  muzzle(g, 0.115, -0.01, 0);
};
W.flamer = (K, g, p, side) => {
  box(g, 0.08, 0.03, 0.03, K.N, 0.03, 0, 0);
  for (const z of [0.022, -0.012]) cyl(g, 0.018, 0.075, z > 0 ? K.A : K.U, 'x', 0.0, -0.022, z * side, { seg: 12 });
  cyl(g, 0.008, 0.07, K.D, 'x', 0.1, 0.004, 0, { seg: 8 });
  cyl(g, 0.014, 0.018, K.S, 'x', 0.14, 0.004, 0, { rt: 0.017, seg: 10 });
  box(g, 0.006, 0.006, 0.006, K.G, 0.152, -0.008, 0);                      // pilot light
  muzzle(g, 0.152, 0.004, 0);
};
W.chain = (K, g, p, side) => {
  ball(g, 0.05, 0.026, 0.028, K.P, 0.02, 0, 0, 16);
  ball(g, 0.017, 0.017, 0.017, K.G, 0.06, 0.004, 0, 12);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; rod(g, [0.06, Math.sin(a) * 0.016, Math.cos(a) * 0.016], [0.12, Math.sin(a) * 0.024, Math.cos(a) * 0.024], 0.004, 0.003, K.S, 6); ball(g, 0.005, 0.005, 0.005, K.G, 0.122, Math.sin(a) * 0.024, Math.cos(a) * 0.024, 8); }
  ring(g, 0.024, 0.005, K.A, 'x', 0.04, 0, 0);
  muzzle(g, 0.125, 0, 0);
};
W.repair = (K, g, p, side) => {
  capsule2(K, g);
  cyl(g, 0.014, 0.03, K.S, 'x', 0.09, 0.004, 0, { rt: 0.026, seg: 16 });
  ball(g, 0.005, 0.02, 0.02, K.G, 0.106, 0.004, 0, 12);
  ring(g, 0.02, 0.004, K.A, 'x', 0.1, 0.004, 0);
  muzzle(g, 0.11, 0.004, 0);
};
function capsule2(K, g) { ball(g, 0.06, 0.024, 0.026, K.P, 0.03, 0, 0, 16); }

// ---------------------------------------------------------------------------------------------------------- two-handers
W.railgun = (K, g, p, side) => {
  cbox(g, 0.1, 0.05, 0.04, 0.01, K.S, -0.02, 0.0, 0);
  cbox(g, 0.05, 0.03, 0.05, 0.008, K.P, 0.04, -0.006, 0);
  for (const y of [0.012, -0.012]) cbox(g, 0.24, 0.008, 0.026, 0.002, K.P, 0.17, y, 0);
  box(g, 0.2, 0.006, 0.008, K.G, 0.17, 0, 0);
  for (let i = 0; i < 3; i++) box(g, 0.008, 0.036, 0.03, K.D, 0.1 + i * 0.07, 0, 0);
  muzzle(g, 0.29, 0, 0);
};
W.gatling = (K, g, p, side) => {
  rbox(g, 0.1, 0.06, 0.06, 0.01, K.P, -0.01, 0, 0);
  hazard(K, g, 0.0405, -0.016, 0, 0.05, 0.014, 4);
  cyl(g, 0.026, 0.02, K.D, 'x', 0.05, 0.004, 0, { seg: 14 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(g, 0.0055, 0.14, K.N, 'x', 0.13, 0.004 + Math.sin(a) * 0.015, Math.cos(a) * 0.015, { seg: 6 }); }
  ring(g, 0.02, 0.004, K.D, 'x', 0.17, 0.004, 0); ring(g, 0.02, 0.004, K.D, 'x', 0.1, 0.004, 0);
  rbox(g, 0.06, 0.05, 0.05, 0.01, K.S, -0.01, -0.04, side * 0.03);       // ammo box
  rod(g, [0.0, -0.02, side * 0.03], [0.04, -0.01, 0.0], 0.006, 0.006, K.D, 6);
  muzzle(g, 0.2, 0.004, 0);
};

// ---------------------------------------------------------------------------------------------------------- melee / shields
W['laser-blade'] = (K, g, p, side) => {
  cbox(g, 0.08, 0.03, 0.03, 0.008, K.P, 0.0, 0, side * 0.012);
  cbox(g, 0.03, 0.022, 0.024, 0.006, K.S, 0.05, -0.004, side * 0.012);
  const b = at(g, 0.065, -0.004, side * 0.012, 0, 0, -0.12);
  box(b, 0.2, 0.012, 0.004, BLADE('#9ffcff'), 0.1, 0, 0);
  box(b, 0.2, 0.004, 0.006, BLADE('#ffffff'), 0.1, 0, 0);
  muzzle(g, 0.26, -0.03, side * 0.012);
};
W.pile = (K, g, p, side) => {
  rbox(g, 0.13, 0.05, 0.045, 0.01, K.P, 0.0, -0.002, side * 0.008);
  hazard(K, g, 0.066, -0.002, side * 0.008, 0.04, 0.03, 3);
  cyl(g, 0.012, 0.08, K.M, 'x', 0.1, -0.002, side * 0.008, { seg: 10 });
  cyl(g, 0.012, 0.03, K.M, 'x', 0.155, -0.002, side * 0.008, { rt: 0.002, seg: 10 });
  for (const y of [0.026, -0.03]) cyl(g, 0.007, 0.08, K.D, 'x', 0.02, y, side * 0.008, { seg: 8 });
  muzzle(g, 0.17, -0.002, side * 0.008);
};
W.saw = (K, g, p, side) => {
  box(g, 0.1, 0.04, 0.035, K.N, 0.0, 0, 0).rotation.z = -0.05;
  cyl(g, 0.016, 0.03, K.A, 'z', -0.03, 0.012, 0, { seg: 10 });            // a little motor
  cyl(g, 0.006, 0.05, K.U, 'x', 0.06, 0, 0, { seg: 6 });
  cyl(g, 0.055, 0.004, K.M, 'z', 0.1, 0, side * 0.012, { seg: 24 });       // the blade
  cyl(g, 0.015, 0.008, K.D, 'z', 0.1, 0, side * 0.012, { seg: 10 });
  box(g, 0.05, 0.012, 0.03, K.S, 0.08, 0.05, side * 0.012).rotation.z = -0.3;   // guard
  muzzle(g, 0.155, 0, side * 0.012);
};
W.shield = (K, g, p, side) => {
  const z = side * 0.04;
  if (p.energyShield) {   // Calyx petals with a glowing field between them
    for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.7; const pt = at(g, 0.04, 0.0, z, a, 0, 0); ball(pt, 0.035, 0.065, 0.008, K.P, 0, 0.05, 0, 14); }
    cyl(g, 0.07, 0.004, glowOf(MAKERGLOW.calyx, 0.55), 'z', 0.04, 0.02, z + side * 0.004, { seg: 24 });
    ball(g, 0.016, 0.016, 0.01, K.A, 0.04, 0.02, z + side * 0.008, 10);
  } else {                // a slab with hazard stripes and a view slot
    const s = at(g, 0.03, 0.02, z, 0, 0, 0);
    block(K, s, 0.17, 0.22, 0.022, K.P, 0, 0, 0);
    block(K, s, 0.13, 0.16, 0.012, K.S, 0, 0, side * 0.014);
    hazard(K, at(s, 0, -0.09, side * 0.014, 0, side * Math.PI / 2, 0), 0.0, 0, 0, 0.12, 0.02, 6);
    box(s, 0.008, 0.012, 0.024, K.G, 0.05, 0.08, side * 0.014);
  }
  muzzle(g, 0.04, 0.02, z);
};
const MAKERGLOW = { calyx: '#7dff9a' };

// ---------------------------------------------------------------------------------------------------------- shoulder
const pivot = (K, g) => { cyl(g, 0.018, 0.02, K.D, 'y', 0, 0.01, 0, { seg: 12 }); };
W.sniper = (K, g, p, side) => {
  pivot(K, g);
  cbox(g, 0.1, 0.04, 0.04, 0.01, K.P, -0.01, 0.04, 0);
  cyl(g, 0.009, 0.24, K.N, 'x', 0.16, 0.042, 0, { seg: 10 });
  cbox(g, 0.035, 0.016, 0.03, 0.005, K.S, 0.26, 0.042, 0);
  cbox(g, 0.06, 0.018, 0.016, 0.004, K.D, 0.01, 0.07, 0); box(g, 0.004, 0.01, 0.012, K.G, 0.042, 0.07, 0);
  muzzle(g, 0.28, 0.042, 0);
};
W['vertical-pod'] = (K, g, p, side) => {
  pivot(K, g);
  block(K, g, 0.1, 0.06, 0.07, K.P, -0.01, 0.05, 0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) box(g, 0.018, 0.004, 0.024, K.G, -0.045 + i * 0.024, 0.081, (j - 0.5) * 0.03);
  box(g, 0.1, 0.008, 0.004, K.A, -0.01, 0.07, side * 0.036);
  muzzle(g, -0.01, 0.085, 0);
};
W['swarm-pod'] = (K, g, p, side) => {
  pivot(K, g);
  const scrap = K.look === 'scrap';
  if (scrap) { cyl(g, 0.045, 0.1, K.P, 'x', -0.01, 0.055, 0, { seg: 12 }); ring(g, 0.045, 0.004, K.U, 'x', -0.03, 0.055, 0); }
  else block(K, g, 0.1, 0.075, 0.075, K.P, -0.01, 0.055, 0);
  const n = 4;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const y = 0.055 + (i - 1.5) * 0.016, z = (j - 1.5) * 0.016;
    if (scrap && Math.hypot(y - 0.055, z) > 0.04) continue;
    cyl(g, 0.006, 0.006, K.G, 'x', 0.042, y, z, { seg: 8 });
  }
  muzzle(g, 0.045, 0.055, 0);
};
W['missile-pod'] = (K, g, p, side) => {
  pivot(K, g);
  const big = (p.salvo || 1) <= 2;
  block(K, g, 0.11, big ? 0.06 : 0.07, big ? 0.08 : 0.09, K.P, -0.01, 0.05, 0);
  if (big) for (const z of [-0.02, 0.02]) { cyl(g, 0.016, 0.02, K.D, 'x', 0.046, 0.05, z, { seg: 12 }); ball(g, 0.004, 0.012, 0.012, K.G, 0.056, 0.05, z, 10); }
  else for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { cyl(g, 0.011, 0.012, K.D, 'x', 0.046, 0.036 + j * 0.028, (i - 1) * 0.028, { seg: 10 }); cyl(g, 0.007, 0.004, K.G, 'x', 0.053, 0.036 + j * 0.028, (i - 1) * 0.028, { seg: 8 }); }
  if (K.look === 'chunky') hazard(K, g, 0.045, 0.012, 0, 0.08, 0.012, 5);
  muzzle(g, 0.055, 0.05, 0);
};
W.mortar = (K, g, p, side) => {
  pivot(K, g);
  rbox(g, 0.08, 0.04, 0.07, 0.01, K.S, -0.01, 0.035, 0);
  const t = at(g, 0.0, 0.05, 0, 0, 0, 0.75);
  cyl(t, 0.026, 0.12, K.P, 'x', 0.05, 0, 0, { seg: 14 });
  ring(t, 0.027, 0.005, K.A, 'x', 0.1, 0, 0);
  ring(t, 0.027, 0.005, K.D, 'x', 0.02, 0, 0);
  muzzle(g, 0.08, 0.125, 0);
};
W.plasma = (K, g, p, side) => {
  pivot(K, g);
  ball(g, 0.05, 0.035, 0.04, K.P, -0.02, 0.045, 0, 18);
  ball(g, 0.022, 0.022, 0.022, K.G, -0.015, 0.075, 0, 12);
  cyl(g, 0.016, 0.12, K.S, 'x', 0.07, 0.045, 0, { rt: 0.012, seg: 14 });
  for (let i = 0; i < 3; i++) ring(g, 0.018 - i * 0.002, 0.005, i === 1 ? K.G : K.A, 'x', 0.05 + i * 0.03, 0.045, 0);
  muzzle(g, 0.135, 0.045, 0);
};
W['drone-bay'] = (K, g, p, side) => {
  pivot(K, g);
  ball(g, 0.06, 0.035, 0.045, K.P, -0.01, 0.04, 0, 18);
  ring(g, 0.04, 0.005, K.S, 'y', -0.01, 0.06, 0);
  for (let i = 0; i < 3; i++) {   // three docked drones on top
    const d = at(g, -0.04 + i * 0.03, 0.074, (i - 1) * 0.01, 0, 0.3 * (i - 1), 0);
    ball(d, 0.016, 0.008, 0.012, K.S, 0, 0, 0, 12);
    ball(d, 0.004, 0.004, 0.004, K.G, 0.014, 0, 0, 8);
  }
  muzzle(g, 0.0, 0.085, 0);
};
W['mine-layer'] = (K, g, p, side) => {
  pivot(K, g);
  box(g, 0.09, 0.05, 0.06, K.P, -0.01, 0.04, 0).rotation.y = 0.05;
  for (let i = 0; i < 3; i++) { cyl(g, 0.022, 0.008, K.D, 'y', -0.01, 0.07 + i * 0.01, 0, { seg: 14 }); cyl(g, 0.004, 0.009, K.G, 'y', -0.01, 0.07 + i * 0.01, 0, { seg: 8 }); }
  const ch = box(g, 0.05, 0.012, 0.03, K.U, -0.07, 0.03, 0); ch.rotation.z = 0.6;   // drop chute
  muzzle(g, -0.09, 0.012, 0);
};
W['turret-deployer'] = (K, g, p, side) => {
  pivot(K, g);
  box(g, 0.1, 0.02, 0.07, K.N, -0.01, 0.03, 0);
  for (const z of [-0.03, 0.03]) rod(g, [-0.055, 0.04, z], [0.04, 0.04, z], 0.004, 0.004, K.D, 5);
  const t = at(g, -0.01, 0.042, 0, 0, 0.2, 0);          // a folded turret riding the rack
  box(t, 0.05, 0.03, 0.05, K.P, 0, 0.015, 0);
  cyl(t, 0.006, 0.05, K.N, 'x', 0.045, 0.02, 0, { seg: 6 });
  box(t, 0.006, 0.008, 0.012, K.G, 0.026, 0.026, 0);
  hazard(K, t, 0.026, 0.006, 0, 0.04, 0.008, 3);
  muzzle(g, 0.06, 0.06, 0);
};

// ---------------------------------------------------------------------------------------------------------- registry
const reg = {};
for (const p of PARTS_JSON.parts) if (p.slot === 'weapon') {
  const draw = W[p.kind]; if (!draw) continue;
  reg[p.id] = { kind: p.kind, build(root, part = p, side = 1) { const K = kitOf(part.maker); draw(K, root, part, side); } };
}
addParts(reg);
export const WEAPON_DRAWERS = W;
