// Weapons for the Model Library's empty hands (their README: "Hands are EMPTY on purpose"). Each is a small three.js
// group in metres, built along +Z (the way a closed fist points) with the grip at the origin; actor.js hangs it from a
// palm point on the hand bone, so it follows every animation. Materials are made once and shared.
import * as THREE from 'three';

const M = {};
function mats() {
  if (M.steel) return M;
  M.steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.85, roughness: 0.32 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x5b5f66, metalness: 0.7, roughness: 0.5 });
  M.wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.85 });
  M.darkwood = new THREE.MeshStandardMaterial({ color: 0x3e2a1a, roughness: 0.9 });
  M.leather = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.95 });
  M.bone = new THREE.MeshStandardMaterial({ color: 0xe6dcc0, roughness: 0.75 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 0.8, roughness: 0.4 });
  M.string = new THREE.MeshBasicMaterial({ color: 0xe8e0cc });
  M.glowGreen = new THREE.MeshStandardMaterial({ color: 0x9dff7a, emissive: 0x4cff2e, emissiveIntensity: 1.6, roughness: 0.4 });
  M.glowRed = new THREE.MeshStandardMaterial({ color: 0xff6a50, emissive: 0xff2a10, emissiveIntensity: 1.6, roughness: 0.4 });
  M.shieldFace = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.8 });
  return M;
}
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };
const alongZ = g => g.rotateX(Math.PI / 2);          // cylinders are built along Y; weapons run along Z

function blade(len, width, m) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(width / 2, len * 0.85); s.lineTo(0, len); s.lineTo(-width / 2, len * 0.85); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.006, bevelSegments: 1 });
  g.translate(0, 0, -0.006); g.rotateX(Math.PI / 2);        // blade along +Z, flat side facing ±Y
  return mesh(g, m);
}
function sword(len) {
  const m = mats(), g = new THREE.Group();
  g.add(mesh(alongZ(new THREE.CylinderGeometry(0.017, 0.017, 0.15, 8)), m.leather, 0, 0, 0));
  g.add(mesh(new THREE.SphereGeometry(0.028, 8, 6), m.brass, 0, 0, -0.085));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), m.brass, 0, 0, 0.085));
  const b = blade(len, 0.055, m.steel); b.position.z = 0.1; g.add(b);
  return g;
}
const BUILD = {
  shortsword: () => sword(0.5),
  longsword: () => sword(0.82),
  axe() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(alongZ(new THREE.CylinderGeometry(0.02, 0.024, 0.8, 8)), m.wood, 0, 0, 0.25));
    const s = new THREE.Shape(); s.moveTo(0, -0.05); s.lineTo(0.2, -0.13); s.quadraticCurveTo(0.26, 0, 0.2, 0.13); s.lineTo(0, 0.05); s.closePath();
    const hg = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }); hg.translate(0, 0, -0.01); hg.rotateX(Math.PI / 2); hg.rotateZ(Math.PI / 2);
    const head = mesh(hg, m.steel, 0, 0, 0.58); head.rotation.y = 0; g.add(head);
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), m.dark, 0, 0, 0.58));
    return g;
  },
  club() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(alongZ(new THREE.CylinderGeometry(0.075, 0.03, 0.85, 9)), m.darkwood, 0, 0, 0.36));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(mesh(new THREE.ConeGeometry(0.018, 0.06, 5), m.dark, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.62 + (i % 2) * 0.08)); }
    return g;
  },
  spear() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(alongZ(new THREE.CylinderGeometry(0.018, 0.018, 1.9, 8)), m.wood, 0, 0, 0.35));
    const tip = mesh(alongZ(new THREE.ConeGeometry(0.04, 0.24, 4)), m.steel, 0, 0, 1.4); g.add(tip);
    g.add(mesh(new THREE.TorusGeometry(0.025, 0.008, 5, 10), m.leather, 0, 0, 1.22));
    return g;
  },
  bonestaff() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(alongZ(new THREE.CylinderGeometry(0.022, 0.02, 1.35, 7)), m.darkwood, 0, 0, 0.3));
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), m.bone, 0, 0, 1.0));
    g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), m.glowGreen, 0, 0, 1.06));
    for (const s of [-1, 1]) { const h = mesh(new THREE.ConeGeometry(0.014, 0.14, 5), m.bone, s * 0.04, 0, 0.98); h.rotation.z = s * 0.6; h.rotation.x = Math.PI / 2; g.add(h); }
    return g;
  },
  rodstaff() {
    const m = mats(), g = new THREE.Group();
    g.add(mesh(alongZ(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 7)), m.darkwood, 0, 0, 0.3));
    g.add(mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 14), m.brass, 0, 0, 1.06));
    g.add(mesh(new THREE.OctahedronGeometry(0.045), m.glowRed, 0, 0, 1.06));
    return g;
  },
  bow() {
    const m = mats(), g = new THREE.Group();
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, -0.62), new THREE.Vector3(-0.22, 0, 0), new THREE.Vector3(0, 0, 0.62));
    g.add(mesh(new THREE.TubeGeometry(curve, 16, 0.016, 6), m.darkwood));
    g.add(mesh(alongZ(new THREE.CylinderGeometry(0.024, 0.024, 0.13, 8)), m.leather, -0.11, 0, 0));
    const str = new THREE.Mesh(alongZ(new THREE.CylinderGeometry(0.003, 0.003, 1.2, 3)), m.string); str.position.x = 0.0; g.add(str);
    return g;
  },
  roundshield() {
    const m = mats(), g = new THREE.Group();
    const face = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), m.shieldFace); face.rotation.z = Math.PI / 2; g.add(face);
    const rim = mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 24), m.dark); rim.rotation.y = Math.PI / 2; g.add(rim);
    const boss = mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.steel); boss.rotation.z = Math.PI / 2; boss.position.x = 0.02; g.add(boss);
    return g;
  },
};

/** How each weapon sits in the palm: a turn (radians, about the hand's own axes) and a shift (metres). Tuned by eye
 *  against the Meshy rigs, whose hand bone points +Y down the fingers with +Z out of the back of the fist. */
export const HOLD = {
  right: { rot: [0, 0, 0], pos: [0, 0.07, 0.01] },
  left: { rot: [0, 0, 0], pos: [0, 0.07, 0.01] },
  roundshield: { rot: [0, 0, 0], pos: [0.12, 0.02, 0.02] },
  bow: { rot: [0, Math.PI, 0], pos: [0, 0.07, 0] },
  club: { rot: [-0.9, 0, 0], pos: [0, 0.07, 0.01] },             // hangs forward and down from the fist
  bonestaff: { rot: [1.15, 0, 0], pos: [0, 0.07, 0.01] },        // staves stand upright beside the caster
  rodstaff: { rot: [1.15, 0, 0], pos: [0, 0.07, 0.01] },
};

export function makeWeapon(kind) {
  const f = BUILD[kind]; if (!f) return null;
  const g = f(); g.name = 'weapon:' + kind;
  return g;
}
export const WEAPON_KINDS = Object.keys(BUILD);
