// Chibi 2 — the melee weapons, round 14. A NEW FILE ON PURPOSE.
//
// `chibi2-gear.js` holds the original held-item vocabulary and BOTH prototypes read it, so every id
// in it is left exactly as it was. These are new ids (`fh_*`), reached through one dispatch line in
// `buildHeld`/`buildOffhand`, and a game that does not ask for them gets byte-for-byte what it got
// before.
//
// WHY THEY EXIST — three faults, all visible in a screenshot:
//
//   1. THE HEAD WAS ON THE WRONG SIDE OF THE FIST. In hand space `+y` runs UP THE FOREARM toward
//      the elbow and `-y` is out past the fingertips (see the bone-space note at the top of
//      chibi2-gear.js). The greataxe head sat at y +0.44, the hammer at +0.40, the warhammer at
//      +0.46 and the mace at +0.42 — all of them behind the hand. The `attack` clip swings the arm
//      about the shoulder, so as the character chopped DOWN the head travelled UP AND BACK: you
//      were hitting things with the butt of the haft. Every head here is at negative y and every
//      butt at positive y, and `tests/gear.test.js` asserts exactly that, family by family.
//   2. THE SILHOUETTES DID NOT READ. A sword was a flat four-sided taper with a curved bar for a
//      guard; at the distance you actually fight from, a longsword, a greatsword and a rapier were
//      three grey sticks. Every blade here has a spine, a fuller and two lighter edge stripes, and
//      every haft has ferrules and langets — the details that say "this is a weapon" from 15 m.
//   3. FOUR FAMILIES HAD NO MODEL AT ALL. A greatsword rendered as an axe; a spear, a halberd and
//      a javelin were all a bare pole; a wand was a cone of fire floating in the palm.
//
// Same procedural style as the rest of the kit: no external assets, no extra draw calls (everything
// goes into the shared cloth/metal buckets through `c.add`), and no Three.js beyond geometry.
//
// UNITS. Bone space is body-relative; a Chibi 2 adult stands about 1.35 units, so 1 unit reads as
// roughly 1.25 m on a human. A 0.58-unit blade is a 72 cm arming sword.
import * as THREE from 'three';
import { profile, taperedCurve } from './chibi2-geometry.js';
import { FARHOLD_HELD, FARHOLD_OFFHAND } from './chibi2-weapon-ids.js';

/** Grips sit a little forward of the bone, the same place every other held item does. */
const Z = 0.055;

const low = () => new THREE.SphereGeometry(1, 8, 5);
const tone = (c, k) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const lift = (c, k) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString();
const WOOD = '#5a3a1a', IRON = '#6e7480', STEEL = '#c8ccd6', DARK = '#2a2d33', GOLD = '#d8b040';

/** Flat outline extruded along z and centred on z = 0. Points are [x, y]. */
function extrude(points, depth) {
  const s = new THREE.Shape();
  s.moveTo(...points[0]);
  for (const p of points.slice(1)) s.lineTo(...p);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------------------------------------------------------- the parts vocabulary
//
// Each one is a function, and every family below is built out of these and nothing else. That is
// what keeps fifteen weapons to three hundred lines and what makes a fix to (say) how a grip is
// wrapped land on all fifteen at once.

/** A wrapped grip: a tapered core plus five leather bands. The BANDS are what read as a grip. */
function grip(c, bone, from, to, r, colour = '#3a2a1c') {
  c.add(profile([[from, r, r], [to, r * 1.06, r * 1.06]], 8), bone, colour, { position: [0, 0, Z] });
  const span = to - from;
  for (let i = 0; i < 5; i++) {
    const y = from + span * (0.12 + i * 0.19);
    c.add(profile([[y - 0.008, r * 1.18, r * 1.18], [y + 0.008, r * 1.18, r * 1.18]], 8), bone, tone(colour, 0.7), { position: [0, 0, Z] });
  }
}

/** A counterweight at the butt. Four shapes, because a pommel is how a swordsmith signs their work. */
function pommel(c, bone, y, kind, size, colour) {
  if (kind === 'wheel') {
    c.add(new THREE.CylinderGeometry(size, size, size * 0.5, 10), bone, colour, { position: [0, y, Z], rotation: [Math.PI / 2, 0, 0], metal: true });
    c.add(low(), bone, lift(colour, 0.25), { position: [0, y, Z], scale: [size * 0.45, size * 0.45, size * 0.75], metal: true });
  } else if (kind === 'scent') {                       // a scent-stopper: a squat tapered cap
    c.add(profile([[y - size, size * 0.55, size * 0.55], [y, size, size], [y + size * 0.7, size * 0.4, size * 0.4]], 8), bone, colour, { position: [0, 0, Z], metal: true });
  } else if (kind === 'fishtail') {
    c.add(extrude([[-size, -size * 0.8], [size, -size * 0.8], [size * 1.25, size], [0, size * 0.5], [-size * 1.25, size]], size * 0.7), bone, colour, { position: [0, y, Z], metal: true });
  } else {                                             // a plain disc
    c.add(profile([[y - size * 0.35, size, size], [y + size * 0.35, size * 0.8, size * 0.8]], 8), bone, colour, { position: [0, 0, Z], metal: true });
  }
}

/**
 * A cross guard with a real forward SWEEP and a real thickness. The old one had neither, which is
 * why every sword in the game read as a stick with a bar across it.
 */
function guard(c, bone, y, span, sweep, thick, colour) {
  c.add(taperedCurve([
    [-span, y + sweep * 0.9, Z],
    [-span * 0.4, y + sweep * 0.15, Z + thick * 0.3],
    [0, y, Z + thick * 0.4],
    [span * 0.4, y + sweep * 0.15, Z + thick * 0.3],
    [span, y + sweep * 0.9, Z],
  ], [thick * 0.5, thick, thick * 1.2, thick, thick * 0.5], 5, 8), bone, colour, { metal: true });
}

/**
 * A BLADE WITH AN EDGE. Three tones down the flat: the spine dark, the fuller darker still, and two
 * lighter stripes along the edges. No light model in the world catches a bevel that is not there,
 * so the bevel is painted — two triangles a side, and it is the single change that makes a blade
 * look like a blade at fighting distance.
 */
function blade(c, bone, from, to, width, colour, { thick = 0.016, curve = 0, single = false } = {}) {
  const len = from - to;                               // both negative; `from` is nearer the hand
  const tip = to;
  const belly = curve;
  c.add(profile([
    [tip, width * 0.06, thick * 0.35],
    [tip + len * 0.22, width * 0.78, thick * 0.85],
    [tip + len * 0.72, width, thick],
    [from, width * 0.92, thick],
  ], 4), bone, colour, { position: [belly * 0.5, 0, Z], metal: true });
  // the fuller: a darker groove down the middle of the flat
  c.add(profile([
    [tip + len * 0.18, width * 0.3, thick * 0.55],
    [from - len * 0.06, width * 0.34, thick * 0.6],
  ], 4), bone, tone(colour, 0.66), { position: [belly * 0.5, 0, Z], metal: true });
  // …and the edge stripes, one a side, or one only on a single-edged blade
  const stripe = lift(colour, 0.45);
  for (const s of single ? [1] : [-1, 1]) {
    c.add(profile([
      [tip + len * 0.08, thick * 0.3, thick * 0.3],
      [from, thick * 0.34, thick * 0.34],
    ], 4), bone, stripe, { position: [belly * 0.5 + s * width * 0.94, 0, Z], metal: true });
  }
}

/** A haft: a wooden pole with two iron ferrules and a wrap where the hands go. */
function haft(c, bone, from, to, r, colour = WOOD) {
  c.add(profile([[from, r, r], [to, r * 1.05, r * 1.05]], 8), bone, colour, { position: [0, 0, Z] });
  for (const y of [from + 0.02, to - 0.02]) {
    c.add(profile([[y - 0.018, r * 1.25, r * 1.25], [y + 0.018, r * 1.25, r * 1.25]], 8), bone, IRON, { position: [0, 0, Z], metal: true });
  }
  c.add(profile([[-0.05, r * 1.15, r * 1.15], [0.09, r * 1.15, r * 1.15]], 8), bone, '#3a2a1c', { position: [0, 0, Z] });
}

/** Two iron straps running back down the haft from the head: "this head will not fly off". */
function langets(c, bone, from, to, x, colour = IRON) {
  for (const s of [-1, 1]) {
    c.add(profile([[from, 0.007, 0.007], [to, 0.007, 0.007]], 4), bone, colour, { position: [s * x, 0, Z], metal: true });
  }
}

/** The collar where a head meets its haft. */
function collar(c, bone, y, r, colour = IRON) {
  c.add(new THREE.TorusGeometry(r, r * 0.3, 4, 10), bone, colour, { position: [0, y, Z], rotation: [Math.PI / 2, 0, 0], metal: true });
}

/**
 * An axe head in profile: a crescent edge, a beard hook under it, and a concave back that narrows
 * to a neck where it meets the haft. `k` scales the whole thing, so a greataxe is the same shape.
 */
function axeHead(k = 1, inset = 1) {
  const cx = 0.075, cy = -0.01;                 // the middle of the cheek, for the inset panel
  if (inset !== 1) {
    return axeHead(k).map(([x, y]) => [cx * k + (x - cx * k) * inset, cy * k + (y - cy * k) * inset]);
  }
  return [
    [0.022, 0.095], [0.06, 0.128], [0.115, 0.132], [0.152, 0.075], [0.166, -0.005],
    [0.148, -0.082], [0.104, -0.138], [0.062, -0.152], [0.042, -0.118],
    [0.052, -0.055], [0.038, 0.01], [0.030, 0.06],
  ].map(([x, y]) => [x * k, y * k]);
}

/** A rarity gem. Only appears at quality 2 and above, which is what makes rarity READ. */
function gem(c, bone, y, size, colour, x = 0) {
  c.add(new THREE.IcosahedronGeometry(1, 0), bone, lift(colour, 0.35), { position: [x, y, Z + 0.012], scale: [size, size * 1.3, size], metal: true });
}

// ---------------------------------------------------------------- the families
//
// Every one of them: head/blade at NEGATIVE y (past the fingertips), butt at POSITIVE y.

const BUILDERS = {
  // ---- blades
  fh_dagger(c, hc, q, bone = 'handR') {
    grip(c, bone, -0.10, 0.05, 0.017);
    pommel(c, bone, 0.07, 'disc', 0.026, c.trim);
    guard(c, bone, -0.09, 0.05, 0.012, 0.011, c.trim);
    blade(c, bone, -0.10, -0.36, 0.026, hc, { thick: 0.011 });
    if (q >= 2) gem(c, bone, 0.07, 0.016, hc);
  },
  fh_daggers(c, hc, q) { BUILDERS.fh_dagger(c, hc, q, 'handR'); BUILDERS.fh_dagger(c, hc, q, 'handL'); },

  fh_sword(c, hc, q) {
    grip(c, 'handR', -0.13, 0.06, 0.019);
    pommel(c, 'handR', 0.09, 'wheel', 0.030, c.trim);
    guard(c, 'handR', -0.13, 0.11, 0.035, 0.016, c.trim);
    blade(c, 'handR', -0.15, -0.73, 0.050, hc);
    if (q >= 2) gem(c, 'handR', 0.09, 0.018, hc);
  },
  fh_longsword(c, hc, q) {
    grip(c, 'handR', -0.15, 0.10, 0.019);
    pommel(c, 'handR', 0.13, 'scent', 0.030, c.trim);
    guard(c, 'handR', -0.15, 0.12, 0.04, 0.016, c.trim);
    blade(c, 'handR', -0.17, -0.81, 0.048, hc);
    if (q >= 2) gem(c, 'handR', 0.13, 0.018, hc);
  },
  /**
   * The greatsword: side lugs, a ricasso you can put a hand on, and a fishtail pommel. It used to
   * render as an axe — `HELD_BY_SUBTYPE` sent `greatsword`, `sword2h`, `battleaxe` and `axe2h` all
   * to the same twin-headed axe — and the axe model pointed the wrong way besides.
   */
  fh_greatsword(c, hc, q) {
    grip(c, 'handR', -0.20, 0.14, 0.021);
    pommel(c, 'handR', 0.18, 'fishtail', 0.042, c.trim);
    guard(c, 'handR', -0.22, 0.15, 0.05, 0.020, c.trim);
    // the ricasso: an unsharpened stretch above the guard, wrapped, for the second hand
    c.add(profile([[-0.36, 0.030, 0.014], [-0.24, 0.034, 0.015]], 4), 'handR', tone(hc, 0.8), { position: [0, 0, Z], metal: true });
    for (const s of [-1, 1]) {
      c.add(profile([[-0.38, 0.010, 0.010], [-0.38, 0.010, 0.010]], 4), 'handR', c.trim, { position: [s * 0.05, 0, Z], metal: true });
      c.add(new THREE.ConeGeometry(0.014, 0.055, 5), 'handR', c.trim, { position: [s * 0.055, -0.37, Z], rotation: [0, 0, -s * 1.2], metal: true });
    }
    blade(c, 'handR', -0.40, -1.16, 0.062, hc);
    if (q >= 2) gem(c, 'handR', 0.18, 0.022, hc);
  },
  /** A sabre: single edged, a belly to the curve, and a knuckle bow over the hand. */
  fh_sabre(c, hc, q) {
    grip(c, 'handR', -0.12, 0.06, 0.018, '#241a12');
    pommel(c, 'handR', 0.08, 'disc', 0.026, c.trim);
    blade(c, 'handR', -0.13, -0.69, 0.042, hc, { thick: 0.013, curve: 0.05, single: true });
    // the knuckle bow, a quarter torus from the guard round to the pommel
    c.add(taperedCurve([[-0.055, -0.12, Z], [-0.085, -0.04, Z + 0.02], [-0.06, 0.05, Z + 0.01], [0, 0.075, Z]], [0.009, 0.009, 0.009, 0.009], 4, 8), 'handR', c.trim, { metal: true });
    guard(c, 'handR', -0.12, 0.055, 0.016, 0.013, c.trim);
    if (q >= 2) gem(c, 'handR', 0.08, 0.015, hc);
  },
  /** A rapier: a diamond-section needle and a swept hilt of rings. */
  fh_rapier(c, hc, q) {
    grip(c, 'handR', -0.14, 0.06, 0.016, '#241a12');
    pommel(c, 'handR', 0.09, 'wheel', 0.028, c.trim);
    c.add(profile([[-0.74, 0.003, 0.003], [-0.60, 0.010, 0.010], [-0.16, 0.014, 0.014]], 4), 'handR', hc, { position: [0, 0, Z], rotation: [0, 0.78, 0], metal: true });
    // the cup and two side rings
    c.add(new THREE.SphereGeometry(0.062, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 'handR', c.trim, { position: [0, -0.15, Z], rotation: [Math.PI, 0, 0], metal: true });
    for (const s of [-1, 1]) {
      c.add(new THREE.TorusGeometry(0.035, 0.006, 4, 12), 'handR', c.trim, { position: [s * 0.04, -0.10, Z], rotation: [0, 1.2 * s, 0], metal: true });
    }
    c.add(taperedCurve([[-0.05, -0.15, Z + 0.05], [-0.07, -0.03, Z + 0.06], [-0.03, 0.06, Z + 0.02]], [0.008, 0.008, 0.008], 4, 6), 'handR', c.trim, { metal: true });
    if (q >= 2) gem(c, 'handR', 0.09, 0.015, hc);
  },

  // ---- hafted: axes, hammers, maces
  /** A bearded one-handed axe: a hook under the edge and a spike out the back. */
  fh_axe(c, hc, q) {
    haft(c, 'handR', -0.52, 0.10, 0.019);
    langets(c, 'handR', -0.50, -0.34, 0.021);
    collar(c, 'handR', -0.44, 0.030);
    /**
     * A BEARDED HEAD, not a paddle. An axe reads as an axe because of two things a convex slab does
     * not have: a CONCAVE back that narrows to a neck at the haft, and a beard — the hook below the
     * edge that a real axe uses to catch a shield rim. `axeHead` is the profile; x runs out from the
     * haft, y along it.
     */
    c.add(extrude(axeHead(1), 0.024), 'handR', hc, { position: [0, -0.46, Z], rotation: [0, Math.PI / 2, 0], metal: true });
    // the cheek is inset and darker, the edge stands proud and lighter — the two together are what
    // stop an axe head reading as a shovel blade from ten metres away
    c.add(extrude(axeHead(1, 0.62), 0.030), 'handR', tone(hc, 0.72), { position: [0, -0.46, Z], rotation: [0, Math.PI / 2, 0], metal: true });
    c.add(taperedCurve([[0, -0.32, Z + 0.152], [0, -0.46, Z + 0.166], [0, -0.60, Z + 0.104]], [0.008, 0.010, 0.008], 4, 6), 'handR', lift(hc, 0.4), { metal: true });
    c.add(new THREE.ConeGeometry(0.02, 0.07, 4), 'handR', tone(hc, 0.8), { position: [0, -0.46, Z - 0.07], rotation: [Math.PI / 2, 0, 0], metal: true });
    if (q >= 2) gem(c, 'handR', -0.40, 0.016, hc);
  },
  /** A greataxe: twin heads, a top spike and a butt cap short enough to stay out of the way. */
  fh_greataxe(c, hc, q) {
    haft(c, 'handR', -1.02, 0.22, 0.021);
    langets(c, 'handR', -0.98, -0.62, 0.023);
    collar(c, 'handR', -0.66, 0.032);
    const half = axeHead(1.45), cheek = axeHead(1.45, 0.62);
    for (const flip of [1, -1]) {
      const turn = flip > 0 ? half : half.map(([x, y]) => [-x, y]).reverse();
      const inner = flip > 0 ? cheek : cheek.map(([x, y]) => [-x, y]).reverse();
      c.add(extrude(turn, 0.026), 'handR', hc, { position: [0, -0.78, Z], rotation: [0, Math.PI / 2, 0], metal: true });
      c.add(extrude(inner, 0.032), 'handR', tone(hc, 0.72), { position: [0, -0.78, Z], rotation: [0, Math.PI / 2, 0], metal: true });
      c.add(taperedCurve([
        [0, -0.58, Z + flip * 0.22], [0, -0.79, Z + flip * 0.241], [0, -1.00, Z + flip * 0.151],
      ], [0.009, 0.012, 0.009], 4, 6), 'handR', lift(hc, 0.4), { metal: true });
    }
    c.add(new THREE.ConeGeometry(0.026, 0.10, 5), 'handR', tone(hc, 0.85), { position: [0, -0.99, Z], rotation: [Math.PI, 0, 0], metal: true });
    c.add(profile([[0.20, 0.030, 0.030], [0.24, 0.024, 0.024]], 8), 'handR', IRON, { position: [0, 0, Z], metal: true });
    if (q >= 2) gem(c, 'handR', -0.60, 0.020, hc);
  },
  /** A war hammer: a square face plate that says which end does the work, and a beak behind it. */
  fh_hammer(c, hc, q) {
    haft(c, 'handR', -0.66, 0.10, 0.020);
    langets(c, 'handR', -0.62, -0.44, 0.022);
    collar(c, 'handR', -0.50, 0.030);
    c.add(new THREE.BoxGeometry(0.15, 0.16, 0.13), 'handR', hc, { position: [0, -0.56, Z], metal: true });
    c.add(new THREE.BoxGeometry(0.035, 0.175, 0.145), 'handR', lift(hc, 0.25), { position: [-0.085, -0.56, Z], metal: true });
    c.add(new THREE.ConeGeometry(0.030, 0.09, 4), 'handR', tone(hc, 0.8), { position: [0.115, -0.56, Z], rotation: [0, 0, -Math.PI / 2], metal: true });
    if (q >= 2) gem(c, 'handR', -0.44, 0.018, hc);
  },
  /** A maul: the same, bigger, with a long back beak, and both hands on it. */
  fh_maul(c, hc, q) {
    haft(c, 'handR', -1.00, 0.20, 0.023);
    langets(c, 'handR', -0.96, -0.70, 0.025);
    collar(c, 'handR', -0.72, 0.034);
    c.add(new THREE.BoxGeometry(0.19, 0.20, 0.15), 'handR', hc, { position: [0, -0.82, Z], metal: true });
    c.add(new THREE.BoxGeometry(0.04, 0.215, 0.165), 'handR', lift(hc, 0.25), { position: [-0.105, -0.82, Z], metal: true });
    c.add(taperedCurve([[0.10, -0.82, Z], [0.20, -0.80, Z], [0.25, -0.74, Z]], [0.035, 0.024, 0.004], 4, 5), 'handR', tone(hc, 0.8), { metal: true });
    c.add(profile([[0.18, 0.032, 0.032], [0.22, 0.026, 0.026]], 8), 'handR', IRON, { position: [0, 0, Z], metal: true });
    if (q >= 2) gem(c, 'handR', -0.70, 0.022, hc);
  },
  /** A mace: six extruded flanges, which is what a mace is — not a spiked ball. */
  fh_mace(c, hc, q) {
    haft(c, 'handR', -0.50, 0.08, 0.019, DARK);
    collar(c, 'handR', -0.36, 0.028);
    c.add(profile([[-0.50, 0.036, 0.036], [-0.44, 0.045, 0.045], [-0.38, 0.036, 0.036]], 8), 'handR', hc, { position: [0, 0, Z], metal: true });
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2;
      c.add(extrude([[0, -0.06], [0.055, -0.03], [0.062, 0.02], [0, 0.06]], 0.016), 'handR',
        lift(hc, 0.1), { position: [Math.sin(t) * 0.03, -0.44, Z + Math.cos(t) * 0.03], rotation: [0, -t, 0], metal: true });
    }
    c.add(new THREE.ConeGeometry(0.02, 0.05, 5), 'handR', hc, { position: [0, -0.52, Z], rotation: [Math.PI, 0, 0], metal: true });
    if (q >= 2) gem(c, 'handR', 0.08, 0.016, hc);
  },
  /** A sceptre: a short flanged mace with a gem head, which is what a war-priest carries. */
  fh_scepter(c, hc, q) {
    grip(c, 'handR', -0.28, 0.07, 0.018, '#2a2018');
    pommel(c, 'handR', 0.09, 'disc', 0.022, GOLD);
    collar(c, 'handR', -0.26, 0.026, GOLD);
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * Math.PI * 2;
      c.add(extrude([[0, -0.045], [0.04, -0.02], [0.045, 0.02], [0, 0.05]], 0.013), 'handR',
        GOLD, { position: [Math.sin(t) * 0.025, -0.33, Z + Math.cos(t) * 0.025], rotation: [0, -t, 0], metal: true });
    }
    c.add(new THREE.IcosahedronGeometry(1, 0), 'handR', lift(hc, 0.3), { position: [0, -0.40, Z], scale: [0.045, 0.055, 0.045] });
    if (q >= 2) gem(c, 'handR', -0.26, 0.016, hc);
  },

  // ---- polearms. The family the brief named, and the one that had no model at all.
  fh_spear(c, hc, q) {
    haft(c, 'handR', -1.02, 0.56, 0.018);
    langets(c, 'handR', -1.00, -0.86, 0.020);
    collar(c, 'handR', -0.94, 0.026);
    blade(c, 'handR', -0.96, -1.22, 0.034, hc, { thick: 0.014 });
    // a butt spike, so the other end is not a stick
    c.add(new THREE.ConeGeometry(0.018, 0.08, 5), 'handR', IRON, { position: [0, 0.60, Z], metal: true });
    if (q >= 2) gem(c, 'handR', -0.90, 0.015, hc);
  },
  fh_javelin(c, hc, q) {
    haft(c, 'handR', -0.70, 0.40, 0.014);
    collar(c, 'handR', -0.64, 0.020);
    blade(c, 'handR', -0.66, -0.84, 0.024, hc, { thick: 0.010 });
    // the throwing cord, wrapped at the balance point
    c.add(profile([[-0.06, 0.020, 0.020], [0.03, 0.020, 0.020]], 8), 'handR', '#b09a72', { position: [0, 0, Z] });
    if (q >= 2) gem(c, 'handR', -0.62, 0.012, hc);
  },
  /** A halberd: an axe blade, a spear point above it and a rear hook. All three, as it should be. */
  fh_halberd(c, hc, q) {
    haft(c, 'handR', -1.06, 0.62, 0.020);
    langets(c, 'handR', -1.04, -0.84, 0.022);
    collar(c, 'handR', -0.94, 0.028);
    // the axe blade on one side
    c.add(extrude(axeHead(0.92), 0.022), 'handR',
      hc, { position: [0, -1.00, Z], rotation: [0, Math.PI / 2, 0], metal: true });
    c.add(extrude(axeHead(0.92, 0.6), 0.028), 'handR',
      tone(hc, 0.72), { position: [0, -1.00, Z], rotation: [0, Math.PI / 2, 0], metal: true });
    // the hook behind it
    c.add(taperedCurve([[0, -1.00, Z - 0.02], [-0.06, -1.03, Z - 0.09], [-0.03, -1.10, Z - 0.13]], [0.018, 0.012, 0.003], 4, 5), 'handR', tone(hc, 0.8), { metal: true });
    // …and the point on top, which is the 7.4 m thrust
    blade(c, 'handR', -1.08, -1.30, 0.028, hc, { thick: 0.012 });
    c.add(new THREE.ConeGeometry(0.018, 0.08, 5), 'handR', IRON, { position: [0, 0.66, Z], metal: true });
    if (q >= 2) gem(c, 'handR', -0.90, 0.016, hc);
  },
  /** A quarterstaff: a plain ferruled pole, held in the middle. Correct for this one. */
  fh_quarterstaff(c, hc, q) {
    c.add(profile([[-0.78, 0.021, 0.021], [0, 0.024, 0.024], [0.78, 0.021, 0.021]], 8), 'handR', hc || WOOD, { position: [0, 0, Z] });
    for (const y of [-0.74, 0.74]) {
      c.add(profile([[y - 0.05, 0.027, 0.027], [y + 0.05, 0.027, 0.027]], 8), 'handR', IRON, { position: [0, 0, Z], metal: true });
    }
    for (const y of [-0.10, 0.10]) {
      c.add(profile([[y - 0.05, 0.026, 0.026], [y + 0.05, 0.026, 0.026]], 8), 'handR', '#3a2a1c', { position: [0, 0, Z] });
    }
    if (q >= 2) { gem(c, 'handR', -0.70, 0.016, hc); gem(c, 'handR', 0.70, 0.016, hc); }
  },

  /**
   * A WAND, which the game did not have. `HELD_BY_SUBTYPE` sent every wand to `flame` — a cone of
   * fire hovering 0.15 in front of the palm — so a wand was an effect with no object behind it.
   * Short, angled slightly forward so it points where you are aiming rather than at the floor.
   */
  fh_wand(c, hc, q) {
    const R = 'handR', tilt = [-0.35, 0, 0];
    c.add(profile([[-0.30, 0.009, 0.009], [-0.10, 0.013, 0.013], [0.02, 0.016, 0.016]], 6), R, '#3a2f28', { position: [0, 0, Z], rotation: tilt });
    for (const y of [-0.22, -0.14]) {
      c.add(profile([[y - 0.008, 0.016, 0.016], [y + 0.008, 0.016, 0.016]], 6), R, GOLD, { position: [0, 0, Z], rotation: tilt, metal: true });
    }
    c.add(new THREE.IcosahedronGeometry(1, 0), R, lift(hc, 0.4), { position: [0, -0.32, Z + 0.011], rotation: tilt, scale: [0.026, 0.034, 0.026] });
    c.add(new THREE.TorusGeometry(0.022, 0.006, 4, 8), R, GOLD, { position: [0, -0.285, Z + 0.010], rotation: [Math.PI / 2 - 0.35, 0, 0], metal: true });
    if (q >= 3) {
      for (const s of [-1, 1]) c.add(new THREE.OctahedronGeometry(1), R, lift(hc, 0.6), { position: [s * 0.03, -0.30, Z + 0.02], scale: [0.010, 0.014, 0.010] });
    }
  },
};

/**
 * OFF HAND — and the one correction that matters: A SHIELD IS STRAPPED TO THE FOREARM.
 *
 * `chibi2-gear.js` binds every shield to `handL` at weight 1, which is how a BUCKLER is held and
 * how nothing else is: a heater or a kite shield hangs on two enarmes over the forearm, and the
 * fist that is not holding it is free. Binding it to `elbowL` is the whole fix. The forearm runs
 * from y 0 to y -0.205T, so y -0.10 is about its middle.
 */
const OFFHAND_BUILDERS = {
  fh_heater_shield(c, oc) { strapped(c, oc, 'heater'); },
  fh_kite_shield(c, oc) { strapped(c, oc, 'kite'); },
  fh_tower_shield(c, oc) { strapped(c, oc, 'tower'); },
};

function strapped(c, oc, kind) {
  const L = 'elbowL';
  // A shield covers a body. The first pass was 0.34 units across on a body 1.35 tall — the size of
  // a dinner plate, and it read as one. These are a real heater, kite and tower, in that order.
  const w = kind === 'tower' ? 0.23 : kind === 'kite' ? 0.19 : 0.21;
  const h = kind === 'tower' ? 0.74 : kind === 'kite' ? 0.64 : 0.52;
  // mid-forearm and a little proud of it, cocked out so it faces whatever is in front of you
  const pos = [0, -0.07, 0.10];
  const rot = [0, 0, 0.18];
  const face = kind === 'kite'
    ? [[-w, h * 0.5], [w, h * 0.5], [w * 0.85, -h * 0.1], [0, -h * 0.5], [-w * 0.85, -h * 0.1]]
    : kind === 'tower'
      ? [[-w, h * 0.5], [w, h * 0.5], [w, -h * 0.5], [-w, -h * 0.5]]
      : [[-w, h * 0.5], [w, h * 0.5], [w * 0.8, -h * 0.15], [0, -h * 0.5], [-w * 0.8, -h * 0.15]];
  c.add(extrude(face, 0.024), L, oc, { position: pos, rotation: rot, metal: true });
  // the rim and the boss, so it is a shield rather than a board
  c.add(extrude(face.map(([x, y]) => [x * 1.06, y * 1.04]), 0.012), L, tone(oc, 0.7), { position: [pos[0], pos[1], pos[2] - 0.006], rotation: rot, metal: true });
  c.add(low(), L, lift(oc, 0.3), { position: [pos[0], pos[1] + h * 0.05, pos[2] + 0.03], scale: [0.05, 0.05, 0.022], metal: true });
  // …and the straps the arm actually goes through
  for (const s of [-1, 1]) {
    c.add(profile([[-0.035, 0.011, 0.011], [0.035, 0.011, 0.011]], 5), L, '#4a3624',
      { position: [0, pos[1] + s * 0.07, pos[2] - 0.035], rotation: [0, 0, Math.PI / 2] });
  }
}

/**
 * Every id this module knows how to build. The catalogue lives in `chibi2-weapon-ids.js`, which has
 * no Three.js in it so the node tests can read it; this checks the two have not drifted apart.
 */
export { FARHOLD_HELD, FARHOLD_OFFHAND };
for (const id of FARHOLD_HELD) {
  if (!BUILDERS[id]) throw new Error(`chibi2-weapons: no builder for catalogued id "${id}"`);
}
for (const id of Object.keys(BUILDERS)) {
  if (!FARHOLD_HELD.includes(id)) throw new Error(`chibi2-weapons: "${id}" is built but not catalogued`);
}

/**
 * Build one, or return false if the id belongs to the original vocabulary.
 * `a.held.quality` is 0-3 (normal, magic, rare, legendary) — the detail a weapon earns.
 */
export function buildFarholdHeld(a, c) {
  const id = a.held?.id;
  const fn = BUILDERS[id];
  if (!fn) return false;
  fn(c, a.held.color || STEEL, a.held.quality ?? 0);
  return true;
}

export function buildFarholdOffhand(a, c) {
  const id = a.offhand?.id;
  const fn = OFFHAND_BUILDERS[id];
  if (!fn) return false;
  fn(c, a.offhand.color || '#8d97a3', a.offhand.quality ?? 0);
  return true;
}
