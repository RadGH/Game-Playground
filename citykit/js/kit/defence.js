// Walls and turrets for Arcline's defence (owner rulings, Arcline PLAN §0: walls block every enemy attack, turrets
// draw power only, every gun shows its projectile, one turret lobs explosive shells over crowds).
//
// Walls are baked per view turn like buildings. A straight wall runs along the model's x axis; the game draws a wall
// that runs along z with the picture of the NEXT view turn (rot + 1), so one recipe covers both directions.
// Posts join walls in any direction (`arms` = which sides get a wall stub). Gates sit where a road crosses a wall.
// Every wall reaches exactly to the tile edge (x = ±0.5), so walls side by side read as one unbroken line.
//
// Turrets are baked per SCREEN direction (16): the base stays put, userData.face(heading) turns the head.
//   userData.face(heading)    turn the head (barrel) to a world heading (radians, atan2(dz, dx); 0 = +x)
//   userData.muzzle(heading)  → { x, y, z }: where the barrel tip is, in the model's own units (tile units, y up,
//                              origin = the tile centre on the ground) when the head faces `heading`. It is a world
//                              offset from the turret's tile centre — project it with iso.js toScreen(x, z, y, rot)
//                              to spawn a projectile exactly at the barrel's end on screen. Side-effect free.
//   userData.shot             what leaves the barrel: { kind: 'bolt'|'arc'|'slug'|'shell', color, pitch? } — pitch
//                              (radians above level) is the mortar tube's launch angle for its lobbed arc.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { box, cyl, bodyMat, neonMat } from './shapes.js';

// ---------- small parts (centre-positioned, any orientation) ----------
const G = new Map();
const geo = (k, make) => { if (!G.has(k)) G.set(k, make()); return G.get(k); };
function put(parent, g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; }
/** A box by its centre (for tilted plates and chunks). */
function cbox(parent, w, h, d, m, x = 0, y = 0, z = 0) { return put(parent, geo(`b${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z); }
const UP = new THREE.Vector3(0, 1, 0);
/** A rod from point a to point b (radius r0 at a, r1 at b). */
function seg(parent, a, b, r0, r1, m, sides = 10) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = d.length();
  const g = geo(`s${r0.toFixed(4)}:${r1.toFixed(4)}:${sides}`, () => { const c = new THREE.CylinderGeometry(r1, r0, 1, sides); c.translate(0, 0.5, 0); return c; });
  const o = put(parent, g, m, a[0], a[1], a[2]); o.scale.y = Math.max(len, 1e-4); o.quaternion.setFromUnitVectors(UP, d.normalize()); return o;
}
function ball(parent, r, m, x, y, z, sx = 1, sy = 1, sz = 1, s = 14) {
  const o = put(parent, geo(`sp${s}`, () => new THREE.SphereGeometry(1, s, Math.ceil(s / 2))), m, x, y, z); o.scale.set(r * sx, r * sy, r * sz); return o;
}
function ring(parent, r, tube, m, x, y, z, axis = 'y') {
  const o = put(parent, geo(`t${r.toFixed(4)}:${tube.toFixed(4)}`, () => new THREE.TorusGeometry(r, tube, 8, 28)), m, x, y, z);
  if (axis === 'y') o.rotation.x = Math.PI / 2; else if (axis === 'x') o.rotation.y = Math.PI / 2;
  return o;
}

// ---------- materials ----------
const M = (color, metal = 0.2, rough = 0.8) => bodyMat('concrete', 0, { color, metal, rough });
const MAT = {
  concrete: M('#a7a89f', 0, 0.95), concreteDark: M('#7b7d77', 0, 0.95), concreteLight: M('#bdbcb2', 0, 0.95),
  steel: M('#9aa5b1', 0.35, 0.45), steelDark: M('#5a6470', 0.35, 0.5), steelWorn: M('#7a6e62', 0.3, 0.7),
  alloy: M('#3d4759', 0.3, 0.4), alloyLight: M('#66738a', 0.3, 0.4),
  crack: M('#1a1b1e', 0, 1), scorch: M('#2a2622', 0, 1), rust: M('#7a4a2e', 0.4, 0.8), ceramic: M('#e7e3d6', 0.05, 0.4),
  rubber: M('#1f2227', 0, 0.9),
};
const hazardCache = new Map();
/** Yellow/black chevron stripes (gate leaves, armoured wall skirts). */
function hazardMat() {
  if (!hazardCache.has('h')) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = '#1b1d22'; g.fillRect(0, 0, 64, 16); g.fillStyle = '#f2b51d';
    for (let x = -16; x < 80; x += 16) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 8, 16); g.lineTo(x + 16, 0); g.lineTo(x + 8, 0); g.closePath(); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
    hazardCache.set('h', new THREE.MeshStandardMaterial({ map: t, metalness: 0.3, roughness: 0.6 }));
  }
  return hazardCache.get('h');
}
const GLOW = { amber: '#ffb02e', cyan: '#3ff0ff', energy: '#46e8ff', red: '#ff3a3a', green: '#5dff7a', violet: '#a77bff', blue: '#5aa8ff', orange: '#ff8a2e' };

// ---------- walls ----------
const TIERS = ['Concrete', 'Armoured', 'Energy'];
const DAMAGE = ['Intact', 'Cracked', 'Breached'];
const WALL_H = [0, 0.3, 0.38, 0.42];        // wall height by tier (a storey is 0.22)
const WALL_T = [0, 0.24, 0.28, 0.24];       // footing thickness by tier

/** Cracks on a wall face: short dark zig-zags. */
function cracks(parent, R, xc, len, y0, y1, zf, n) {
  for (let i = 0; i < n; i++) {
    let x = xc + R.range(-len * 0.35, len * 0.35), y = R.range(y0 + (y1 - y0) * 0.35, y1 - 0.01);
    let a = R.range(-2.2, -0.9);                       // mostly downward
    for (let k = 0; k < R.int(3, 5); k++) {
      const l = R.range(0.025, 0.055);
      const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
      if (y + dy < y0) break;
      const o = cbox(parent, l, 0.007, 0.004, MAT.crack, x + dx / 2, y + dy / 2, zf);
      o.rotation.z = a; o.castShadow = false;
      x += dx; y += dy; a += R.range(-0.7, 0.7);
    }
  }
}
/** Rubble chunks on the ground both sides of a broken block. */
function rubble(parent, R, xc, len, t, mats) {
  for (let i = 0; i < 9; i++) {
    const s = R.range(0.02, 0.05), side = R.chance(0.5) ? 1 : -1;
    const o = cbox(parent, s * R.range(0.8, 1.6), s * 0.7, s, R.pick(mats), xc + R.range(-len * 0.45, len * 0.45), s * 0.3, side * (t / 2 + R.range(0.0, 0.1)));
    o.rotation.set(R.range(-0.5, 0.5), R.range(0, 3), R.range(-0.5, 0.5));
  }
}
/** A ragged break along the top of a block: a few uneven chunks and bent rebar. */
function breakTop(parent, R, xc, len, y, t, mat) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const w = len / n, h = R.range(0.015, 0.07);
    const o = cbox(parent, w * 1.05, h, t * R.range(0.7, 0.95), mat, xc - len / 2 + w * (i + 0.5), y + h / 2 - 0.01, R.range(-0.01, 0.01));
    o.rotation.z = R.range(-0.25, 0.25);
  }
  for (let i = 0; i < 3; i++) {
    const x = xc + R.range(-len * 0.35, len * 0.35), z = R.range(-t * 0.3, t * 0.3);
    seg(parent, [x, y, z], [x + R.range(-0.04, 0.04), y + R.range(0.05, 0.1), z + R.range(-0.03, 0.03)], 0.006, 0.005, MAT.rust, 5);
  }
}

/** One block of wall, x from xa to xb. dmg: 0 intact · 1 cracked · 2 broken (top knocked off). */
function wallBlock(g, tier, xa, xb, dmg, R, first) {
  const L = xb - xa, xc = (xa + xb) / 2, H = WALL_H[tier], T = WALL_T[tier];
  const h = dmg === 2 ? H * R.range(0.42, 0.58) : H;
  const gap = 0.008;                                            // a seam between blocks (inside the line, not at its ends)
  const crackN = dmg === 1 ? R.int(2, 3) : dmg === 2 ? 1 : 0;
  if (tier === 1) {
    box(g, L, 0.05, T, MAT.concreteDark, xc, 0, 0);
    box(g, L - gap, h - 0.085, 0.19, MAT.concrete, xc, 0.05, 0);
    // a sloped shoulder each side (the barrier's flared foot)
    for (const s of [1, -1]) { const o = cbox(g, L - gap, 0.06, 0.03, MAT.concrete, xc, 0.075, s * 0.1); o.rotation.x = s * 0.5; }
    if (dmg < 2) box(g, L - gap, 0.035, 0.15, MAT.concreteLight, xc, h - 0.035, 0);
    // reflective amber strip low on both faces + a lamp on each block's cap
    for (const s of [1, -1]) if (dmg < 2 || s > 0) box(g, L - gap * 3, 0.012, 0.004, neonMat(GLOW.amber, 0.12), xc, 0.11, s * 0.097);
    if (dmg < 2) { box(g, 0.035, 0.022, 0.035, MAT.steelDark, xc, h, 0); box(g, 0.024, 0.018, 0.024, neonMat(GLOW.amber, 0.5), xc, h + 0.022, 0); }
    for (const s of [1, -1]) cracks(g, R, xc, L, 0.06, h - 0.01, s * 0.0965, crackN);
    if (dmg === 2) { breakTop(g, R, xc, L * 0.9, h - 0.035, 0.18, MAT.concrete); rubble(g, R, xc, L, T, [MAT.concrete, MAT.concreteLight, MAT.concreteDark]); }
  } else if (tier === 2) {
    box(g, L, 0.06, T, MAT.concreteDark, xc, 0, 0);
    box(g, L - gap, h - 0.09, 0.18, MAT.steelDark, xc, 0.06, 0);
    // sloped armour plates, two per block per face, with a hazard skirt along the foot
    const pw = L / 2;
    for (const s of [1, -1]) {
      box(g, L - gap, 0.04, 0.006, hazardMat(), xc, 0.065, s * 0.113);
      for (let i = 0; i < 2; i++) {
        const missing = dmg === 2 && i === (first ? 0 : 1);
        if (missing) continue;
        const ph = (h - 0.13);
        const o = cbox(g, pw - 0.012, ph, 0.022, dmg >= 1 && i === 1 && s > 0 ? MAT.steelWorn : MAT.steel, xa + pw * (i + 0.5), 0.105 + ph / 2, s * 0.104);
        o.rotation.x = s * 0.09;
        if (dmg === 1 && i === 1 && s > 0) { o.rotation.z = 0.12; o.position.y -= 0.01; }   // a bent plate
        // rivet row
        for (let k = 0; k < 3; k++) cbox(g, 0.012, 0.012, 0.006, MAT.steelDark, xa + pw * i + pw * (k + 1) / 4, 0.105 + ph - 0.02, s * 0.117);
      }
      if (dmg >= 1) { const sc = cbox(g, L * 0.3, 0.07, 0.004, MAT.scorch, xc + R.range(-0.1, 0.1), h * 0.55, s * 0.118); sc.rotation.z = R.range(-0.6, 0.6); }
    }
    if (dmg < 2) {
      // walkway cap with crenels on both lips and a cyan running light under each lip
      box(g, L, 0.03, 0.26, MAT.steel, xc, h - 0.03, 0);
      for (const s of [1, -1]) {
        box(g, L - gap * 2, 0.01, 0.005, neonMat(GLOW.cyan, 0.15), xc, h - 0.045, s * 0.124);
        for (let k = 0; k < 2; k++) box(g, L * 0.26, 0.045, 0.035, MAT.steelDark, xa + L * (0.25 + k * 0.5), h, s * 0.112);
      }
    } else {
      breakTop(g, R, xc, L * 0.9, h - 0.03, 0.17, MAT.steelDark);
      rubble(g, R, xc, L, T, [MAT.steel, MAT.steelDark, MAT.concreteDark]);
    }
  } else {
    // energy wall: dark alloy, a glowing channel along both faces, a ridge on top
    box(g, L, 0.05, T, MAT.alloyLight, xc, 0, 0);
    box(g, L - gap, Math.min(h, H * 0.5) - 0.05, 0.2, MAT.alloy, xc, 0.05, 0);
    if (dmg < 2) {
      box(g, L - gap, H * 0.36, 0.16, MAT.alloy, xc, H * 0.5, 0);
      const ridge = cbox(g, L - gap, 0.09, 0.09, MAT.alloyLight, xc, H * 0.86, 0); ridge.rotation.x = Math.PI / 4; ridge.scale.y = 0.9;
    } else breakTop(g, R, xc, L * 0.9, h - 0.02, 0.19, MAT.alloy);
    for (const s of [1, -1]) {
      const dead = dmg === 2 || (dmg === 1 && s > 0 && !first);
      box(g, L - gap * 2, 0.028, 0.006, dead ? MAT.crack : neonMat(GLOW.energy, 0.55), xc, H * 0.36, s * 0.101);
      box(g, L - gap * 2, 0.008, 0.006, dead ? MAT.crack : neonMat(GLOW.energy, 0.3), xc, 0.06, s * 0.121);
    }
    for (const s of [1, -1]) cracks(g, R, xc, L, 0.06, Math.min(h, H * 0.86) - 0.01, s * (h > H * 0.5 ? 0.0805 : 0.1005), crackN);
    if (dmg === 2) {
      rubble(g, R, xc, L, T, [MAT.alloy, MAT.alloyLight]);
      for (let i = 0; i < 4; i++) cbox(g, 0.012, 0.012, 0.012, neonMat('#fff3a0', 0.9), xc + R.range(-0.08, 0.08), h + R.range(0, 0.06), R.range(-0.08, 0.08));   // sparks
    }
  }
  return h;
}

/** Laser fence rails over an energy wall, between fins at x positions (skips broken blocks). */
function energyRails(g, xs, broken) {
  const H = WALL_H[3];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    seg(g, [x, H * 0.9, 0], [x, H + 0.13, 0], 0.014, 0.008, MAT.alloyLight, 6);
    box(g, 0.02, 0.02, 0.02, neonMat(GLOW.energy, 0.7), x, H + 0.13, 0);
  }
  for (let i = 0; i + 1 < xs.length; i++) if (!broken[i]) for (const y of [H + 0.05, H + 0.1]) box(g, xs[i + 1] - xs[i], 0.006, 0.006, neonMat(GLOW.energy, 0.45), (xs[i] + xs[i + 1]) / 2, y, 0);
}

/** A run of wall along x from xa to xb (split into blocks about half a tile long). Returns nothing. */
function wallRun(g, tier, xa, xb, damage, R, { rails = true } = {}) {
  const n = Math.max(1, Math.round((xb - xa) / 0.5));
  const L = (xb - xa) / n;
  // which block takes the damage
  const hit = R.int(0, n - 1);
  const broken = [];
  for (let i = 0; i < n; i++) {
    const dmg = damage === 0 ? 0 : damage === 1 ? (i === hit || R.chance(0.4) ? 1 : 0) : (i === hit ? 2 : 1);
    broken.push(dmg === 2);
    wallBlock(g, tier, xa + i * L, xa + (i + 1) * L, dmg, R, i === 0);
  }
  if (tier === 3 && rails) energyRails(g, Array.from({ length: n + 1 }, (_, i) => xa + i * L), broken);
}

/** Wrap a run built along x so it lies along the given direction (0 +x, 1 +z, 2 −x, 3 −z). */
function turned(g, dirIdx) { const s = new THREE.Group(); s.rotation.y = -dirIdx * Math.PI / 2; g.add(s); return s; }

const ARM_SIDES = ['down-right', 'down-left', 'up-left', 'up-right'];     // how +x, +z, −x, −z look at view 1
const armNames = Array.from({ length: 16 }, (_, m) => m === 0 ? 'None (lone post)' : ARM_SIDES.filter((_, i) => m & (1 << i)).join(' + '));

const wallParams = [
  { key: 'tier', label: 'Tier', min: 1, max: 3, step: 1, def: 1, names: [null, ...TIERS] },
  { key: 'damage', label: 'Wear', min: 0, max: 2, step: 1, def: 0, names: DAMAGE },
];

// ---------- turrets ----------
const MK = [null, 'Mk I', 'Mk II', 'Mk III'];
const BASE_TOP = 0.24;
const HEAD_SCALE = 1.22;     // heads read bigger than the base at game size

/** The fixed part every turret stands on: footing, pedestal, turntable, power box, tier pips. Returns the head's y. */
function turretBase(g, tier, accent) {
  cyl(g, 0.42, 0.035, MAT.concreteDark, 0, 0, 0, { seg: 8 });
  cyl(g, 0.37, 0.025, MAT.steelDark, 0, 0.035, 0, { seg: 8 });
  // armour skirt from Mk II
  if (tier >= 2) for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * Math.PI / 4, r = 0.25;
    const o = cbox(g, 0.05, 0.12, 0.16, MAT.steel, Math.cos(a) * r, 0.12, Math.sin(a) * r);
    o.rotation.y = -a; o.rotation.z = 0.25;
  }
  cyl(g, 0.21, 0.15, MAT.steel, 0, 0.06, 0, { rt: 0.16, seg: 16 });
  cyl(g, 0.175, 0.03, MAT.steelDark, 0, 0.21, 0, { seg: 20 });
  ring(g, 0.178, 0.008, neonMat(accent, 0.3), 0, 0.226, 0);
  // power: a junction box at the back with a cable to the plate edge and a green "powered" lamp
  box(g, 0.1, 0.08, 0.09, MAT.steelDark, -0.24, 0.06, -0.16);
  box(g, 0.03, 0.02, 0.03, neonMat(GLOW.green, 0.6), -0.24, 0.14, -0.16);
  seg(g, [-0.24, 0.075, -0.205], [-0.24, 0.07, -0.33], 0.014, 0.014, MAT.rubber, 6);
  // tier pips on the front edge
  for (let i = 0; i < tier; i++) {
    const a = Math.PI / 4 + (i - (tier - 1) / 2) * 0.16;
    box(g, 0.035, 0.012, 0.035, neonMat(accent, 0.55), Math.cos(a) * 0.335, 0.06, Math.sin(a) * 0.335);
  }
  return BASE_TOP;
}

/** Turn a local head-space point into the turret's space for a heading (head.rotation.y = −heading). */
function makeTurret(g, head, tip, shot) {
  g.userData.face = h => { head.rotation.y = -h; };
  g.userData.muzzle = h => {
    const keep = head.rotation.y; head.rotation.y = -h;
    g.updateMatrixWorld(true);
    const v = g.worldToLocal(tip.getWorldPosition(new THREE.Vector3()));
    head.rotation.y = keep; g.updateMatrixWorld(true);
    return { x: +v.x.toFixed(4), y: +v.y.toFixed(4), z: +v.z.toFixed(4) };
  };
  g.userData.shot = shot;
  g.userData.face(0);
  return g;
}

function pulseHead(head, tier) {
  const acc = GLOW.cyan;
  // housing with a sloped glacis
  cbox(head, 0.2, 0.1, 0.17, MAT.steel, -0.03, 0.06, 0);
  const gl = cbox(head, 0.09, 0.02, 0.17, MAT.steel, 0.07, 0.1, 0); gl.rotation.z = -0.55;
  cbox(head, 0.14, 0.03, 0.19, MAT.steelDark, -0.05, 0.12, 0);
  // capacitor drums on the sides with glowing bands
  for (const s of [1, -1]) {
    seg(head, [-0.12, 0.06, s * 0.1], [0.02, 0.06, s * 0.1], 0.035, 0.035, MAT.steelDark, 12);
    seg(head, [-0.06, 0.06, s * 0.1], [-0.045, 0.06, s * 0.1], 0.038, 0.038, neonMat(acc, 0.3), 12);
  }
  // sensor eye
  cbox(head, 0.03, 0.02, 0.05, neonMat(GLOW.red, 0.7), 0.04, 0.13, 0);
  // barrels: 2 / 3 / 4
  const n = tier + 1;
  const spots = n === 2 ? [[0, -0.035], [0, 0.035]] : n === 3 ? [[0, -0.05], [0, 0], [0, 0.05]] : [[-0.022, -0.033], [-0.022, 0.033], [0.022, -0.033], [0.022, 0.033]];
  const tipX = 0.36;
  for (const [dy, dz] of spots) {
    const y = 0.065 + dy;
    seg(head, [0.06, y, dz], [0.17, y, dz], 0.024, 0.022, MAT.steelDark, 10);                     // shroud
    for (let k = 0; k < 3; k++) seg(head, [0.08 + k * 0.03, y, dz], [0.09 + k * 0.03, y, dz], 0.026, 0.026, MAT.steel, 10);   // vent rings
    seg(head, [0.17, y, dz], [tipX - 0.02, y, dz], 0.012, 0.012, MAT.steel, 8);
    seg(head, [tipX - 0.025, y, dz], [tipX, y, dz], 0.018, 0.018, neonMat(acc, 0.45), 10);       // glowing muzzle ring
  }
  const tip = new THREE.Object3D(); tip.position.set(tipX, 0.065, 0); head.add(tip);
  return tip;
}

function arcHead(head, tier) {
  const acc = GLOW.violet;
  // three struts from the turntable to the coil's waist
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.4; seg(head, [Math.cos(a) * 0.15, 0.0, Math.sin(a) * 0.15], [Math.cos(a) * 0.05, 0.16, Math.sin(a) * 0.05], 0.014, 0.01, MAT.steelDark, 6); }
  const top = 0.3 + tier * 0.035;
  seg(head, [0, 0, 0], [0, top, 0], 0.05, 0.035, MAT.steelDark, 12);
  // coil: ceramic insulator discs with glowing windings between them, narrowing toward the top
  const n = 3 + tier;
  for (let i = 0; i < n; i++) {
    const y = 0.05 + i * (top - 0.09) / (n - 1), r = 0.12 - i * (0.05 / (n - 1));
    seg(head, [0, y, 0], [0, y + 0.018, 0], r, r * 0.92, MAT.ceramic, 18);
    ring(head, r * 0.72, 0.011, neonMat(acc, 0.35), 0, y + 0.03, 0);
  }
  // the charge sphere + a tilted halo ring
  ball(head, 0.075, neonMat('#d9c8ff', 0.7), 0, top + 0.06, 0);
  const halo = ring(head, 0.11, 0.008, neonMat(acc, 0.5), 0, top + 0.06, 0); halo.rotation.x = Math.PI / 2 - 0.35;
  if (tier >= 3) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; seg(head, [Math.cos(a) * 0.05, top + 0.08, Math.sin(a) * 0.05], [Math.cos(a) * 0.09, top + 0.17, Math.sin(a) * 0.09], 0.01, 0.002, MAT.steel, 5); }
  // the emitter fork: the part that aims
  const y = top + 0.06;
  seg(head, [0.06, y, 0], [0.2, y + 0.02, 0], 0.016, 0.012, MAT.steel, 8);
  for (const s of [1, -1]) {
    seg(head, [0.2, y + 0.02, 0], [0.26, y + 0.03, s * 0.035], 0.01, 0.008, MAT.steel, 6);
    ball(head, 0.016, neonMat('#efe6ff', 0.8), 0.265, y + 0.03, s * 0.035);
  }
  const tip = new THREE.Object3D(); tip.position.set(0.27, y + 0.03, 0); head.add(tip);
  return tip;
}

function railHead(head, tier) {
  const acc = GLOW.blue;
  // rear housing + a capacitor bank (one cell per tier) glowing on its top
  cbox(head, 0.2, 0.11, 0.17, MAT.steelDark, -0.08, 0.06, 0);
  const sl = cbox(head, 0.1, 0.02, 0.17, MAT.steel, 0.035, 0.105, 0); sl.rotation.z = -0.35;
  for (let i = 0; i < tier; i++) {
    const z = (i - (tier - 1) / 2) * 0.05;
    seg(head, [-0.15, 0.11, z], [-0.15, 0.17, z], 0.02, 0.02, MAT.steel, 10);
    seg(head, [-0.15, 0.17, z], [-0.15, 0.185, z], 0.021, 0.021, neonMat(acc, 0.45), 10);
  }
  // the two rails with a glowing core between them and accelerator rings along their length
  const len = 0.34 + tier * 0.035, y = 0.07, x0 = 0.0;
  for (const s of [1, -1]) cbox(head, len, 0.05, 0.014, MAT.steel, x0 + len / 2, y, s * 0.032);
  cbox(head, len - 0.04, 0.008, 0.008, neonMat('#bfe0ff', 0.5), x0 + (len - 0.04) / 2, y, 0);
  for (let k = 0; k < 3 + tier; k++) {
    const x = x0 + 0.04 + k * (len - 0.08) / (2 + tier);
    ring(head, 0.052, 0.009, k % 2 ? MAT.steelDark : neonMat(acc, 0.35), x, y, 0, 'x');
  }
  cbox(head, 0.02, 0.07, 0.09, MAT.steelDark, x0 + len - 0.01, y, 0);            // muzzle crown
  const tip = new THREE.Object3D(); tip.position.set(x0 + len, y, 0); head.add(tip);
  return tip;
}

const MORTAR_PITCH = 0.95;   // ~54° above level: a lobbing tube
function mortarHead(head, tier) {
  const acc = GLOW.orange;
  cyl(head, 0.16, 0.05, MAT.steelDark, 0, 0, 0, { seg: 16 });
  const n = tier, r = [0, 0.068, 0.052, 0.044][tier], gapZ = r * 2 + 0.014;
  const span = (n - 1) * gapZ / 2 + r + 0.03;
  // yoke cheeks with trunnion pins and orange status lights
  for (const s of [1, -1]) {
    cbox(head, 0.14, 0.15, 0.03, MAT.steel, -0.01, 0.12, s * span);
    seg(head, [0, 0.15, s * (span - 0.02)], [0, 0.15, s * (span + 0.03)], 0.025, 0.025, MAT.steelDark, 10);
    cbox(head, 0.02, 0.02, 0.008, neonMat(acc, 0.6), 0.05, 0.17, s * (span + 0.016));
  }
  // the tube(s): pitched up on the trunnion
  const tube = new THREE.Group(); tube.position.set(0, 0.15, 0); tube.rotation.z = MORTAR_PITCH; head.add(tube);
  const L = 0.27;
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * gapZ;
    seg(tube, [-0.09, 0, z], [L, 0, z], r, r * 0.92, MAT.steelDark, 16);
    for (const x of [0.02, 0.12]) seg(tube, [x, 0, z], [x + 0.025, 0, z], r * 1.15, r * 1.15, MAT.steel, 16);       // bands
    seg(tube, [L - 0.01, 0, z], [L + 0.035, 0, z], r * 1.22, r * 1.22, MAT.steel, 16);                            // muzzle brake
    seg(tube, [L + 0.03, 0, z], [L + 0.036, 0, z], r * 0.8, r * 0.8, neonMat(acc, 0.15), 14);                     // hot bore
  }
  cbox(tube, 0.06, r * 2.4, (n - 1) * gapZ + r * 2.4, MAT.steel, -0.11, 0, 0);    // breech block
  // a rack of shells on the back of the turntable
  for (let i = 0; i < 3; i++) {
    const z = (i - 1) * 0.045;
    seg(head, [-0.13, 0.03, z], [-0.13, 0.1, z], 0.018, 0.018, MAT.steelWorn, 8);
    seg(head, [-0.13, 0.1, z], [-0.13, 0.135, z], 0.018, 0.004, neonMat(acc, 0.4), 8);
  }
  cbox(head, 0.03, 0.06, 0.15, MAT.steelDark, -0.16, 0.06, 0);
  const tip = new THREE.Object3D(); tip.position.set(L + 0.035, 0, 0); tube.add(tip);
  return tip;
}

function turret(kind, headFn, accent, shot) {
  return p => {
    const g = new THREE.Group();
    const y = turretBase(g, p.tier, accent);
    const head = new THREE.Group(); head.position.y = y; head.scale.setScalar(HEAD_SCALE); g.add(head);
    const tip = headFn(head, p.tier);
    return makeTurret(g, head, tip, shot);
  };
}

const tierParam = { key: 'tier', label: 'Upgrade', min: 1, max: 3, step: 1, def: 1, names: MK };

addRecipes({
  'wall-straight': {
    name: 'Wall', group: 'defence', size: [1, 1], noStyle: true,
    blurb: 'One tile of wall; side by side they make one unbroken line. A wall running the other way uses the next view turn.',
    params: wallParams,
    build(p) { const g = new THREE.Group(); wallRun(g, p.tier, -0.5, 0.5, p.damage, p.R); return g; },
  },
  'wall-post': {
    name: 'Wall Post', group: 'defence', size: [1, 1], noStyle: true,
    blurb: 'Corner, end and junction post: a pillar with a wall stub toward each side that has a wall.',
    params: [...wallParams, { key: 'arms', label: 'Joins', min: 0, max: 15, step: 1, def: 3, names: armNames }],
    build(p) {
      const g = new THREE.Group(); const t = p.tier, H = WALL_H[t];
      for (let i = 0; i < 4; i++) if (p.arms & (1 << i)) wallRun(turned(g, i), t, 0.14, 0.5, p.damage, p.R, { rails: false });
      if (t === 3) for (let i = 0; i < 4; i++) if (p.arms & (1 << i)) energyRails(turned(g, i), [0.14, 0.5], [p.damage === 2]);
      if (t === 1) {
        box(g, 0.32, 0.05, 0.32, MAT.concreteDark, 0, 0, 0);
        box(g, 0.28, H + 0.04, 0.28, MAT.concrete, 0, 0.05, 0);
        box(g, 0.32, 0.04, 0.32, MAT.concreteLight, 0, H + 0.09, 0);
        for (const [x, z] of [[0.141, 0], [0, 0.141]]) box(g, x ? 0.004 : 0.2, 0.014, z ? 0.004 : 0.2, neonMat(GLOW.amber, 0.12), x, 0.11, z);
        box(g, 0.05, 0.035, 0.05, MAT.steelDark, 0, H + 0.13, 0); box(g, 0.035, 0.03, 0.035, neonMat(GLOW.amber, 0.6), 0, H + 0.165, 0);
      } else if (t === 2) {
        box(g, 0.34, 0.06, 0.34, MAT.concreteDark, 0, 0, 0);
        box(g, 0.28, H + 0.06, 0.28, MAT.steel, 0, 0.06, 0);
        box(g, 0.28, H + 0.06, 0.28, MAT.steel, 0, 0.06, 0).rotation.y = Math.PI / 4;   // two squares = an octagon
        box(g, 0.34, 0.03, 0.34, MAT.steelDark, 0, H + 0.12, 0);
        for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(g, 0.06, 0.05, 0.06, MAT.steelDark, x * 0.14, H + 0.15, z * 0.14);
        cyl(g, 0.205, 0.012, neonMat(GLOW.cyan, 0.2), 0, H + 0.1, 0, { seg: 8 });
        box(g, 0.34, 0.04, 0.006, hazardMat(), 0, 0.07, 0.172); box(g, 0.006, 0.04, 0.34, hazardMat(), 0.172, 0.07, 0);
      } else {
        box(g, 0.3, 0.05, 0.3, MAT.alloyLight, 0, 0, 0);
        cyl(g, 0.15, H + 0.12, MAT.alloy, 0, 0.05, 0, { rt: 0.1, seg: 6 });
        cyl(g, 0.14, 0.03, neonMat(GLOW.energy, 0.55), 0, H * 0.36 + 0.03, 0, { rt: 0.135, seg: 6 });
        cyl(g, 0.11, 0.02, MAT.alloyLight, 0, H + 0.17, 0, { seg: 6 });
        const c = put(g, geo('oct', () => new THREE.OctahedronGeometry(0.06)), neonMat(GLOW.energy, 0.75), 0, H + 0.26, 0); c.scale.y = 1.6;
      }
      if (p.damage >= 1 && t < 3) for (const s of [1, -1]) cracks(g, p.R, 0, 0.25, 0.08, H, s * 0.142, p.damage);
      return g;
    },
  },
  'wall-gate': {
    name: 'Wall Gate', group: 'defence', size: [1, 1], noStyle: true,
    blurb: 'Where a road crosses a wall: sliding blast doors, red lights shut, green open.',
    params: [wallParams[0], { key: 'open', label: 'Doors open', min: 0, max: 1, step: 0.25, def: 0 }],
    build(p) {
      const g = new THREE.Group(); const t = p.tier, H = WALL_H[t];
      const pillarMat = t === 1 ? MAT.concrete : t === 2 ? MAT.steel : MAT.alloy;
      const capMat = t === 1 ? MAT.concreteLight : t === 2 ? MAT.steelDark : MAT.alloyLight;
      const trim = t === 1 ? GLOW.amber : t === 2 ? GLOW.cyan : GLOW.energy;
      const PH = H + 0.16, PT = WALL_T[t] + 0.06;
      for (const s of [1, -1]) {
        box(g, 0.16, PH, PT, pillarMat, s * 0.42, 0, 0);
        box(g, 0.17, 0.03, PT + 0.02, capMat, s * 0.42, PH, 0);
        for (const f of [1, -1]) {
          box(g, 0.004, PH * 0.7, 0.012, neonMat(trim, 0.2), s * 0.338, 0.04, f * (PT / 2 - 0.02));
          // status light: red shut, green open
          box(g, 0.03, 0.03, 0.006, neonMat(p.open > 0.5 ? GLOW.green : GLOW.red, 0.85), s * 0.42, PH - 0.06, f * (PT / 2 + 0.003));
        }
      }
      // header beam
      box(g, 0.68, 0.06, 0.12, capMat, 0, PH - 0.06, 0);
      box(g, 0.6, 0.012, 0.004, neonMat(trim, 0.35), 0, PH - 0.04, 0.062);
      box(g, 0.6, 0.012, 0.004, neonMat(trim, 0.35), 0, PH - 0.04, -0.062);
      // floor track with a guide light
      box(g, 0.68, 0.012, 0.08, MAT.steelDark, 0, 0, 0);
      box(g, 0.6, 0.004, 0.012, neonMat(p.open > 0.5 ? GLOW.green : GLOW.red, 0.3), 0, 0.012, 0);
      // door leaves slide into the pillars
      const slide = p.open * 0.33;
      for (const s of [1, -1]) {
        const w = 0.335 - slide; if (w < 0.005) continue;   // fully open: the leaf is inside the pillar
        const leafX = s * (slide + w / 2 + 0.0025);
        box(g, w, H - 0.03, 0.07, t === 3 ? MAT.alloyLight : MAT.steel, leafX, 0.012, 0);
        for (const f of [1, -1]) {
          box(g, w, 0.05, 0.004, hazardMat(), leafX, 0.04, f * 0.036);
          box(g, Math.max(0.004, w - 0.04), 0.008, 0.004, MAT.steelDark, leafX, H * 0.55, f * 0.036);
        }
      }
      return g;
    },
  },
  'tur-pulse': {
    name: 'Pulse Gun', group: 'defence', size: [1, 1], dirs: 16, noStyle: true,
    blurb: 'Cheap rapid-fire guns: short glowing bolts. Two, three, then four barrels as it upgrades.',
    params: [tierParam], build: turret('pulse', pulseHead, GLOW.cyan, { kind: 'bolt', color: GLOW.cyan }),
  },
  'tur-arc': {
    name: 'Arc Coil', group: 'defence', size: [1, 1], dirs: 16, noStyle: true,
    blurb: 'A charged coil that throws lightning from its fork; the bolt jumps on to nearby creatures.',
    params: [tierParam], build: turret('arc', arcHead, GLOW.violet, { kind: 'arc', color: GLOW.violet }),
  },
  'tur-rail': {
    name: 'Rail Lance', group: 'defence', size: [1, 1], dirs: 16, noStyle: true,
    blurb: 'Long-range, slow and heavy: twin rails fling a slug that punches through armour.',
    params: [tierParam], build: turret('rail', railHead, GLOW.blue, { kind: 'slug', color: '#bfe0ff' }),
  },
  'tur-mortar': {
    name: 'Mortar', group: 'defence', size: [1, 1], dirs: 16, noStyle: true,
    blurb: 'A chunky tube that lobs explosive shells over walls into crowds. More tubes as it upgrades.',
    params: [tierParam], build: turret('mortar', mortarHead, GLOW.orange, { kind: 'shell', color: GLOW.orange, pitch: MORTAR_PITCH }),
  },
});
