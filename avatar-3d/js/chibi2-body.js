// Chibi 2 body and clothing: torso, neck, arms, hands, legs and feet, and every top, bottom and pair
// of shoes, all on the shared cloth/metal buckets.
//
// WHY THIS IS ITS OWN FILE (2026-09-24). The first Chibi 2 body wore ONE jacket: a raised collar, three
// buttons a side, a cross-body strap, a belt with a buckle, a pouch on the right hip, leather forearm
// cuffs, a knee ring and knee-high boots — on EVERY character, whatever `top` / `bottom` / `shoes`
// said. Each top then added its own pieces on top of that jacket, so a leather jerkin was jacket +
// strap + the jerkin's own trim strips (the "decorations covered by a strap covered by suspenders"
// the Elf Ranger showed), and the whole cast read as one outfit in different colours.
//
// Now every garment is SELF-CONTAINED: a top says what its sleeves, collar, front, hem and belt are
// and nothing else is drawn; a bottom says how far the cloth goes down the leg; shoes say how high
// the shaft comes. Anything a garment does not draw is skin.
//
// SURFACES. The torso is one lathe profile with a waist, a chest, sloping shoulders and — scaled by
// ROUNDNESS — a belly and hips. Everything laid on it (straps, lapels, buttons, plates, belts) asks
// `chestZ(x, y)` / `hipsZ(x, y)` for the surface under it rather than using a fixed depth, so a
// strap follows a round dwarf's belly instead of disappearing into it. The surfaces are handed to
// chibi2-gear.js for the same reason.
import * as THREE from 'three';
import { shade } from '../../avatar-2d/js/render.js';
import { profile, taperedCurve } from './chibi2-geometry.js';

const sphere = () => new THREE.SphereGeometry(1, 10, 6);
const low = () => new THREE.SphereGeometry(1, 8, 5);
const ring = (r, tube) => new THREE.TorusGeometry(r, tube, 4, 12);

/**
 * What each top is made of. Fields:
 *   sleeve   long | short | none | bell | rolled | puff | mail      how the arm is covered
 *   bare     true when the torso itself is skin (harness, wraps, fur vest)
 *   collar   round | v | laced | high | crossed | none | hooded | lapels | fur
 *   front    none | buttons | laces | seam | panels | open | band
 *   hem      none | short | knee | long | coat | trench | peplum | jagged | mail | plates
 *   belt     plain | wide | sash | rope | none       (null: the bottoms decide)
 *   armor    plate | mail | scale                    (metal overlays)
 *   cuffs    bracers | cuff | gauntlet               (forearm detail)
 * Ids not listed fall back to `tunic`.
 */
export const TOP_STYLES = {
  tshirt: { sleeve: 'short', collar: 'round', front: 'none', hem: 'none' },
  tunic: { sleeve: 'long', collar: 'laced', front: 'none', hem: 'short', belt: 'plain', cuffs: 'cuff' },
  travel_shirt: { sleeve: 'rolled', collar: 'v', front: 'buttons', hem: 'none' },
  gambeson: { sleeve: 'long', collar: 'high', front: 'quilt', hem: 'short', belt: 'wide', cuffs: 'cuff' },
  hoodie: { sleeve: 'long', collar: 'hooded', front: 'pocket', hem: 'none', cuffs: 'cuff' },
  vest: { sleeve: 'long', collar: 'v', front: 'panels', hem: 'none', shirt: true },
  leather: { sleeve: 'long', collar: 'v', front: 'laces', hem: 'short', belt: 'plain', shirt: true, cuffs: 'bracers' },
  strapped_leather: { sleeve: 'short', collar: 'v', front: 'straps', hem: 'short', belt: 'plain', cuffs: 'bracers' },
  plate: { sleeve: 'mail', collar: 'high', front: 'none', hem: 'plates', belt: 'plain', armor: 'plate', cuffs: 'gauntlet' },
  chainmail: { sleeve: 'mail', collar: 'round', front: 'none', hem: 'mail', belt: 'plain', armor: 'mail' },
  scale_plate: { sleeve: 'mail', collar: 'high', front: 'none', hem: 'plates', belt: 'wide', armor: 'scale', cuffs: 'gauntlet' },
  surcoat: { sleeve: 'mail', collar: 'round', front: 'band', hem: 'knee', belt: 'plain', armor: 'mail' },
  robe: { sleeve: 'bell', collar: 'v', front: 'none', hem: 'long', belt: 'sash' },
  trim_robe: { sleeve: 'bell', collar: 'v', front: 'band', hem: 'long', belt: 'sash' },
  sash_robe: { sleeve: 'bell', collar: 'crossed', front: 'none', hem: 'long', belt: 'sash' },
  high_collar_robe: { sleeve: 'bell', collar: 'high', front: 'band', hem: 'long', belt: 'none' },
  dress: { sleeve: 'puff', collar: 'round', front: 'none', hem: 'knee', belt: 'sash' },
  coat: { sleeve: 'long', collar: 'lapels', front: 'buttons', hem: 'coat', belt: 'none', cuffs: 'cuff' },
  open_coat: { sleeve: 'long', collar: 'lapels', front: 'open', hem: 'coat', belt: 'none', shirt: true, cuffs: 'cuff' },
  trench: { sleeve: 'long', collar: 'lapels', front: 'buttons', hem: 'trench', belt: 'wide', cuffs: 'cuff' },
  doublet: { sleeve: 'puff', collar: 'high', front: 'buttons', hem: 'peplum', belt: 'plain' },
  fur_tunic: { sleeve: 'none', collar: 'fur', front: 'laces', hem: 'short', belt: 'wide' },
  wraps: { sleeve: 'none', bare: true, collar: 'none', front: 'wraps', hem: 'none', cuffs: 'wraps' },
  silks: { sleeve: 'long', collar: 'v', front: 'sash', hem: 'none', belt: 'sash' },
  smith_apron: { sleeve: 'rolled', collar: 'round', front: 'apron', hem: 'none', shirt: true, under: true },
  apron: { sleeve: 'rolled', collar: 'round', front: 'apron', hem: 'none', shirt: true, under: true },
  tank: { sleeve: 'none', collar: 'scoop', front: 'none', hem: 'none' },
  rags: { sleeve: 'short', collar: 'round', front: 'patches', hem: 'jagged', belt: 'rope' },
  harness: { sleeve: 'none', bare: true, collar: 'none', front: 'harness', hem: 'none', belt: 'wide', cuffs: 'bracers' },
};
export const topStyle = id => TOP_STYLES[id] || TOP_STYLES.tunic;
/** Tops whose hem reaches the knee or lower — the robe family. Gear and the hips read this. */
export const LONG_TOPS = Object.keys(TOP_STYLES).filter(k => ['long', 'knee', 'coat', 'trench'].includes(TOP_STYLES[k].hem));

/**
 * What each bottom covers. `leg` is how far down the leg the cloth goes (1 = the ankle,
 * 0.55 = just below the knee, 0.28 = mid thigh, 0 = nothing); `garment` is anything that hangs from
 * the hips instead of wrapping a leg.
 */
export const BOTTOM_STYLES = {
  pants: { leg: 1, belt: true },
  leggings: { leg: 1, belt: false, tight: true },
  breeches: { leg: 0.62, belt: true, stockings: true },
  baggy: { leg: 1, belt: true, loose: true },
  shorts: { leg: 0.3, belt: true },
  ragged: { leg: 0.78, belt: 'rope', torn: true },
  greaves: { leg: 1, belt: true, armor: true },
  skirt: { leg: 0, garment: 'skirt' },
  kilt: { leg: 0, belt: true, garment: 'kilt' },
  loincloth: { leg: 0, belt: 'rope', garment: 'loincloth' },
};
export const bottomStyle = id => BOTTOM_STYLES[id] || BOTTOM_STYLES.pants;

/** Shoes: how high the shaft comes (share of the shin, 0 = at the ankle) and the foot shape. */
export const SHOE_STYLES = {
  boots: { shaft: 0.5, foot: 'boot', cuff: true },
  heavy: { shaft: 0.85, foot: 'heavy', cuff: true },
  shoes: { shaft: 0.08, foot: 'shoe' },
  sneakers: { shaft: 0.08, foot: 'shoe' },
  slippers: { shaft: 0, foot: 'slipper' },
  sandals: { shaft: 0, foot: 'sandal' },
  barefoot: { shaft: 0, foot: 'bare' },
  pointed: { shaft: 0.3, foot: 'pointed' },
  hooves: { shaft: 0, foot: 'hoof' },
  wraps: { shaft: 0.55, foot: 'wrap' },
};
export const shoeStyle = id => SHOE_STYLES[id] || SHOE_STYLES.boots;

/** Linear interpolation of lathe rings [y, rx, rz, zoff] at height y. */
function ringAt(rings, y) {
  if (y <= rings[0][0]) return rings[0];
  for (let i = 1; i < rings.length; i++) {
    if (y <= rings[i][0]) {
      const a = rings[i - 1], b = rings[i], t = (y - a[0]) / (b[0] - a[0] || 1);
      return [y, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * t];
    }
  }
  return rings[rings.length - 1];
}
/** z of a lathe surface at (x, y), front (side 1) or back (side -1), pushed out by `lift`. */
function surfaceZ(rings, x, y, side = 1, lift = 0) {
  const [, rx, rz, z0] = ringAt(rings, y);
  const k = Math.max(0, 1 - (x / (rx + lift)) ** 2);
  return (z0 || 0) + side * (rz + lift) * Math.sqrt(k);
}
/** A copy of the rings grown by `d` in both radii (a layer of cloth over the body). */
const grow = (rings, d, dz = d) => rings.map(([y, rx, rz, z = 0]) => [y, rx + d, rz + dz, z]);
/** A smooth bump centred on `c`, `w` wide. */
const bump = (y, c, w) => Math.exp(-(((y - c) / w) ** 2));

/**
 * Build the body and clothes. Returns the surfaces and dimensions chibi2-gear.js and the face
 * builder need. `c` carries add/ellipsoid/strip and the shared colours from chibi2.js.
 */
export function buildBody(a, rig, c) {
  const { add, ellipsoid, strip, trim, leather, steel, darkSteel } = c;
  const W = rig.wide, T = rig.torso, L = rig.leg, R = rig.round, S = rig.shoulders, A = rig.arm, HK = rig.hand;
  // Limbs thicken with the body: a giant's or a dwarf's arms and legs at human thickness read as sticks.
  const LW = Math.pow(W, 0.65);
  const skin = a.body.skin, cloth = a.top.color, cloth2 = a.top.color2 || shade(cloth, 0.35), lining = shade(cloth, -0.28);
  const top = topStyle(a.top.id), bot = bottomStyle(a.bottom.id), shoe = shoeStyle(a.shoes.id);
  const pants = a.bottom.color;
  const shirt = top.shirt ? cloth2 : cloth;           // what the sleeves are made of under a vest or jerkin
  const torsoColour = top.bare ? skin : top.under ? cloth2 : cloth;

  // ---------------------------------------------------------------- torso
  // Chest-bone space. The waist, a chest, then shoulders that SLOPE into the neck — the old profile
  // went straight up to a flat shelf at the shoulders, which is most of why the bodies read as boxes.
  const Sx = y => 1 + (S - 1) * THREE.MathUtils.smoothstep(y, 0.05, 0.22);
  const base = [
    [-0.15, 0.186, 0.127, 0], [-0.08, 0.183, 0.125, 0], [0.0, 0.19, 0.129, 0.003], [0.08, 0.205, 0.137, 0.006],
    [0.15, 0.222, 0.142, 0.006], [0.205, 0.234, 0.139, 0.002], [0.245, 0.228, 0.129, -0.004], [0.275, 0.2, 0.114, -0.008],
    [0.297, 0.148, 0.094, -0.01], [0.312, 0.085, 0.072, -0.01],
  ];
  const chestRings = base.map(([y, rx, rz, z]) => {
    const b = bump(y, -0.03, 0.13), up = bump(y, 0.16, 0.08);
    return [y * T, (rx * Sx(y) + R * (0.085 * b + 0.022 * up)) * W, (rz + R * (0.14 * b + 0.015 * up)) * W, (z + R * 0.065 * b) * W];
  });
  const hipsRings = [
    [-0.125, 0.09, 0.08, 0], [-0.105, 0.172 + R * 0.03, 0.123 + R * 0.03, 0], [-0.05, 0.196 + R * 0.07, 0.133 + R * 0.08, R * 0.018],
    [0.0, 0.195 + R * 0.075, 0.131 + R * 0.1, R * 0.035], [0.05, 0.188 + R * 0.075, 0.128 + R * 0.115, R * 0.045],
  ].map(([y, rx, rz, z]) => [y, rx * W, rz * W, z * W]);
  const chestZ = (x, y, side = 1, lift = 0) => surfaceZ(chestRings, x, y, side, lift);
  const hipsZ = (x, y, side = 1, lift = 0) => surfaceZ(hipsRings, x, y, side, lift);
  const chestRX = y => ringAt(chestRings, y)[1];
  add(profile(chestRings, 16), 'chest', torsoColour);
  add(profile(hipsRings, 14), 'hips', bot.leg > 0 || bot.garment === 'kilt' || bot.garment === 'skirt' ? pants : skin);
  // neck
  const neckR = 0.066 + R * 0.014 + (W - 1) * 0.03;
  add(profile([[0.27 * T, neckR * 1.05, neckR], [0.33 * T, neckR, neckR * 0.95], [rig.byName.head.position.y + 0.02, neckR * 0.94, neckR * 0.92]], 10), 'chest', skin);

  /** A curve laid on the chest surface. pts are [x, y] in chest space; `lift` above the surface. */
  const onChest = (pts, r, colour, { lift = 0.006, side = 1, metal = false, sides = 4 } = {}) =>
    add(taperedCurve(pts.map(([x, y]) => [x, y, chestZ(x, y, side, lift + r * 0.6)]), [r, r, r], sides, Math.max(4, pts.length * 3)), 'chest', colour, { metal });
  const onHips = (pts, r, colour, { lift = 0.006, side = 1, metal = false } = {}) =>
    add(taperedCurve(pts.map(([x, y]) => [x, y, hipsZ(x, y, side, lift + r * 0.6)]), [r, r, r], 4, Math.max(4, pts.length * 3)), 'hips', colour, { metal });
  const studChest = (x, y, s, colour, metal = true, lift = 0.004) => ellipsoid('chest', colour, [x, y, chestZ(x, y, 1, lift)], [s, s, s * 0.6], { metal });
  /** A band all the way round the torso at chest height y. */
  const bandChest = (y, h, colour, grow2 = 0.008, metal = false) => {
    const r0 = ringAt(chestRings, y - h / 2), r1 = ringAt(chestRings, y + h / 2);
    add(profile([[y - h / 2, r0[1] + grow2, r0[2] + grow2, r0[3]], [y + h / 2, r1[1] + grow2, r1[2] + grow2, r1[3]]], 16), 'chest', colour, { metal });
  };
  const bandHips = (y, h, colour, grow2 = 0.01, metal = false) => {
    const r0 = ringAt(hipsRings, y - h / 2), r1 = ringAt(hipsRings, y + h / 2);
    add(profile([[y - h / 2, r0[1] + grow2, r0[2] + grow2, r0[3]], [y + h / 2, r1[1] + grow2, r1[2] + grow2, r1[3]]], 16), 'hips', colour, { metal });
  };
  /** A sheet laid on the chest surface between -hw(y) and +hw(y), from y0 down to y1. */
  const chestPanel = (hw, y0, y1, colour, lift = 0.01, rows = 5) => {
    const g = new THREE.PlaneGeometry(1, 1, 4, rows), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = 0.5 - p.getY(i), y = y0 + (y1 - y0) * v, x = u * 2 * hw(y); p.setXYZ(i, x, y, chestZ(x, y, 1, lift)); }
    g.computeVertexNormals(); add(g, 'chest', colour);
  };
  const topY = 0.29 * T, waistY = -0.12 * T;

  // ---------------------------------------------------------------- collar
  const neckTop = 0.3 * T;
  if (top.collar === 'round' || top.collar === 'scoop') {
    const y = top.collar === 'scoop' ? 0.25 * T : 0.285 * T;
    add(taperedCurve(Array.from({ length: 13 }, (_, i) => { const t = -Math.PI + i / 12 * Math.PI * 2, x = Math.sin(t) * chestRX(y) * 0.52; return [x, y + (Math.cos(t) > 0 ? -Math.cos(t) * (top.collar === 'scoop' ? 0.05 : 0.02) : 0), chestZ(x, y, Math.cos(t) >= 0 ? 1 : -1, 0.004) * (Math.abs(Math.cos(t)) < 0.2 ? 0.9 : 1)]; }), [0.011, 0.011], 4, 24), 'chest', lining);
  } else if (top.collar === 'v' || top.collar === 'laced') {
    for (const s of [-1, 1]) onChest([[s * 0.075 * W, neckTop], [s * 0.04 * W, 0.2 * T], [0, 0.14 * T]], 0.011, top.shirt ? cloth : lining);
    // the V shows what is under it: skin for a shirt, the shirt for a jerkin
    add(profile([[0.14 * T, 0.002, 0.002, chestZ(0, 0.14 * T)], [0.2 * T, 0.03 * W, 0.006, chestZ(0, 0.2 * T) - 0.003], [0.27 * T, 0.055 * W, 0.006, chestZ(0, 0.27 * T) - 0.004]], 8), 'chest', top.shirt ? shirt : skin);
    if (top.collar === 'laced') for (let i = 0; i < 3; i++) onChest([[-0.022, (0.25 - i * 0.035) * T], [0.022, (0.23 - i * 0.035) * T]], 0.004, lining, { lift: 0.008 });
  } else if (top.collar === 'high') {
    add(profile([[0.27 * T, neckR + 0.03, neckR + 0.024], [0.345 * T, neckR + 0.022, neckR + 0.018]], 12), 'chest', top.armor ? darkSteel : lining, { metal: !!top.armor });
  } else if (top.collar === 'crossed') {
    for (const s of [-1, 1]) onChest([[s * 0.09 * W, neckTop], [-s * 0.035 * W, 0.12 * T]], 0.02, cloth2);
  } else if (top.collar === 'hooded') {
    add(taperedCurve(Array.from({ length: 9 }, (_, i) => { const t = -2.2 + i / 8 * 4.4, back = Math.max(0, -Math.cos(t)); return [Math.sin(t) * (0.14 + back * 0.04) * W, (0.285 + back * 0.03) * T, Math.cos(t) * (0.1 + back * 0.05) * W - 0.01]; }), [0.03, 0.05, 0.05, 0.03], 6, 14), 'chest', lining);
  } else if (top.collar === 'lapels') {
    for (const s of [-1, 1]) add(taperedCurve([[s * 0.08 * W, neckTop, chestZ(s * 0.08 * W, neckTop, 1, 0.012)], [s * 0.1 * W, 0.2 * T, chestZ(s * 0.1 * W, 0.2 * T, 1, 0.014)], [s * 0.035 * W, 0.08 * T, chestZ(s * 0.035 * W, 0.08 * T, 1, 0.01)]], [0.012, 0.03, 0.006], 4, 8), 'chest', lining);
  } else if (top.collar === 'fur') {
    const fur = a.top.color2 || '#d8c8a8';
    add(taperedCurve(Array.from({ length: 11 }, (_, i) => { const t = i / 10 * Math.PI * 2, x = Math.sin(t) * chestRX(0.27 * T) * 0.95; return [x, 0.275 * T, Math.cos(t) * ringAt(chestRings, 0.27 * T)[2] * 0.98]; }), [0.05, 0.05], 6, 20), 'chest', fur);
  }

  // ---------------------------------------------------------------- front
  const f = top.front;
  if (f === 'buttons') for (let i = 0; i < 4; i++) studChest(0, (0.2 - i * 0.075) * T, 0.012, trim);
  if (f === 'seam') onChest([[0, 0.26 * T], [0, waistY]], 0.005, lining);
  if (f === 'band') onChest([[0, 0.27 * T], [0, 0.1 * T], [0, waistY]], 0.018, cloth2, { lift: 0.004 });
  if (f === 'open') {
    // an open coat: the shirt shows in a V between the two fronts, which are edged in the lining
    chestPanel(y => (0.03 + Math.max(0, y / T) * 0.14) * W, 0.29 * T, waistY - 0.02, cloth2, 0.004);
    for (const s of [-1, 1]) onChest([[s * 0.071 * W, 0.29 * T], [s * 0.045 * W, 0.1 * T], [s * 0.03 * W, waistY - 0.02]], 0.01, lining, { lift: 0.008 });
  }
  if (f === 'laces') {
    onChest([[0, 0.24 * T], [0, waistY + 0.02]], 0.005, lining, { lift: 0.002 });
    for (let i = 0; i < 5; i++) { const y = (0.2 - i * 0.055) * T; onChest([[-0.03, y + 0.015], [0.03, y - 0.015]], 0.004, cloth2, { lift: 0.006 }); onChest([[0.03, y + 0.015], [-0.03, y - 0.015]], 0.004, cloth2, { lift: 0.006 }); }
  }
  if (f === 'panels') {
    // a vest: the vest is the torso colour, the shirt shows in the V at the front, buttons down the edge
    chestPanel(y => (0.02 + Math.max(0, y / T) * 0.16) * W, 0.29 * T, 0.02 * T, cloth2, 0.004);
    for (const s of [-1, 1]) onChest([[s * 0.068 * W, 0.29 * T], [s * 0.02 * W, 0.02 * T], [s * 0.012 * W, waistY]], 0.008, lining, { lift: 0.006 });
    for (let i = 0; i < 3; i++) studChest(0.02 * W, (-0.01 - i * 0.045) * T, 0.011, trim, true, 0.012);
  }
  if (f === 'pocket') onChest([[-0.1 * W, -0.02 * T], [0, -0.05 * T], [0.1 * W, -0.02 * T]], 0.03, lining);
  if (f === 'quilt') {
    for (let i = 0; i < 5; i++) { const y = (0.2 - i * 0.07) * T, rx = chestRX(y) * 0.92; onChest([[-rx, y], [0, y], [rx, y]], 0.004, lining, { lift: 0.001 }); }
    for (const x of [-0.08, 0, 0.08]) onChest([[x * W, 0.25 * T], [x * W, waistY]], 0.004, lining, { lift: 0.001 });
  }
  if (f === 'straps') for (const s of [-1, 1]) {
    onChest([[s * 0.15 * W, 0.27 * T], [0, 0.07 * T], [-s * 0.15 * W, -0.1 * T]], 0.018, leather, { lift: 0.008 });
    studChest(0, 0.07 * T, 0.022, trim, true, 0.024);
  }
  if (f === 'sash') onChest([[-0.19 * W, 0.24 * T], [0, 0.1 * T], [0.19 * W, -0.05 * T]], 0.026, cloth2);
  if (f === 'patches') { ellipsoid('chest', shade(cloth, 0.2), [0.08 * W, 0.08 * T, chestZ(0.08 * W, 0.08 * T, 1, 0.003)], [0.045, 0.04, 0.006]); onChest([[-0.12 * W, 0.18 * T], [-0.07 * W, 0.12 * T]], 0.004, lining); }
  if (f === 'wraps') for (let i = 0; i < 4; i++) { const y = (0.18 - i * 0.06) * T, rx = chestRX(y); onChest([[-rx * 0.95, y + 0.02], [0, y - 0.01], [rx * 0.95, y + 0.02]], 0.012, i % 2 ? cloth : shade(cloth, -0.1), { lift: 0.004 }); }
  if (f === 'harness') {
    for (const s of [-1, 1]) onChest([[s * 0.13 * W, 0.28 * T], [0, 0.06 * T], [-s * 0.16 * W, -0.1 * T]], 0.02, cloth, { lift: 0.006 });
    ellipsoid('chest', trim, [0, 0.06 * T, chestZ(0, 0.06 * T, 1, 0.02)], [0.04, 0.04, 0.012], { metal: true });
    for (const s of [-1, 1]) onChest([[s * 0.13 * W, 0.28 * T], [0, 0.1 * T], [-s * 0.16 * W, -0.1 * T]], 0.02, cloth, { lift: 0.006, side: -1 });
  }
  if (f === 'apron') {
    // a smith's apron over the shirt: a bib on the chest, a skirt to the knee, a strap round the neck
    chestPanel(y => (0.1 + Math.max(0, -y / T) * 0.08) * W, 0.22 * T, waistY - 0.02, cloth, 0.012);
    const g2 = new THREE.PlaneGeometry(1, 1, 4, 4), p2 = g2.attributes.position;
    for (let i = 0; i < p2.count; i++) { const u = p2.getX(i), v = 0.5 - p2.getY(i), y = 0.04 - v * (0.2 + L * 0.35), hw = (0.15 + v * 0.03) * W, x = u * 2 * hw; p2.setXYZ(i, x, y, hipsZ(x, Math.max(y, -0.1), 1, 0.02) + v * 0.04); }
    g2.computeVertexNormals(); add(g2, 'hips', cloth);
    onChest([[-0.1 * W, 0.22 * T], [-0.07 * W, 0.3 * T], [0.07 * W, 0.3 * T], [0.1 * W, 0.22 * T]], 0.008, cloth, { lift: 0.01 });
    ellipsoid('hips', shade(cloth, -0.2), [0.07 * W, -0.07, hipsZ(0.07 * W, -0.07, 1, 0.03)], [0.05, 0.04, 0.012]);
  }

  // ---------------------------------------------------------------- armour over the chest
  if (top.armor === 'plate') {
    // a breastplate: a raised shell over the front with a keel down the middle and a gorget
    const pr = chestRings.filter(r => r[0] > -0.13 * T && r[0] < 0.27 * T).map(([y, rx, rz, z]) => [y, rx * 1.04 + 0.01, rz + 0.026 + 0.01, z + 0.004]);
    add(profile(pr, 16), 'chest', a.top.color, { metal: true });
    onChest([[0, 0.24 * T], [0, 0.05 * T], [0, -0.1 * T]], 0.008, a.top.color2 || trim, { lift: 0.034, metal: true });
    bandChest(-0.1 * T, 0.03, a.top.color2 || trim, 0.04, true);
  }
  if (top.armor === 'mail') {
    for (let i = 0; i < 6; i++) { const y = (0.2 - i * 0.055) * T; bandChest(y, 0.008, darkSteel, 0.004, true); }
  }
  if (top.armor === 'scale') {
    for (let row = 0; row < 5; row++) for (let k = -3; k <= 3; k++) {
      const y = (0.2 - row * 0.065) * T, x = (k * 0.055 + (row % 2) * 0.027) * W;
      if (Math.abs(x) > chestRX(y) * 0.85) continue;
      // a scale is a small low dome — at 30 triangles each rather than a full sphere's 120
      add(new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), 'chest', row % 2 ? a.top.color : shade(a.top.color, 0.15), { position: [x, y, chestZ(x, y, 1, 0.004)], scale: [0.03, 0.035, 0.012], rotation: [Math.PI / 2, 0, 0], metal: true });
    }
  }

  // ---------------------------------------------------------------- hem (hips-bone garments)
  const hemRings = (y0, y1, flare, extraZ = 0) => [
    [y0, ringAt(hipsRings, 0.05)[1] + 0.012, ringAt(hipsRings, 0.05)[2] + 0.014, ringAt(hipsRings, 0.05)[3]],
    [(y0 + y1) / 2, ringAt(hipsRings, -0.05)[1] + 0.02 + flare * 0.4, ringAt(hipsRings, -0.05)[2] + 0.025 + flare * 0.35, extraZ * 0.5],
    [y1, ringAt(hipsRings, -0.08)[1] + 0.03 + flare, ringAt(hipsRings, -0.08)[2] + 0.03 + flare * 0.8, extraZ],
  ];
  const hem = top.hem, hemColour = top.armor === 'mail' ? darkSteel : cloth;
  if (hem === 'short' || hem === 'peplum' || hem === 'mail') {
    add(profile(hemRings(0.06, hem === 'peplum' ? -0.1 : -0.17, hem === 'peplum' ? 0.05 : 0.035), 16), 'hips', hemColour, { metal: hem === 'mail' });
    if (hem !== 'mail') bandHips(-0.165 * (hem === 'peplum' ? 0.6 : 1), 0.014, lining, 0.03 + 0.035);
  }
  if (hem === 'jagged') {
    add(profile(hemRings(0.06, -0.12, 0.03), 12), 'hips', cloth);
    for (let k = 0; k < 10; k++) { const t = k / 10 * Math.PI * 2, rr = ringAt(hipsRings, -0.08); add(new THREE.ConeGeometry(0.03, 0.08, 3), 'hips', cloth, { position: [Math.sin(t) * (rr[1] + 0.06), -0.155, Math.cos(t) * (rr[2] + 0.055)], rotation: [Math.PI, 0, 0] }); }
  }
  if (hem === 'plates') {
    // the fauld: overlapping lames hanging from the breastplate over the hips
    for (let i = 0; i < 2; i++) add(profile(hemRings(0.04 - i * 0.07, -0.05 - i * 0.07, 0.03 + i * 0.015), 14), 'hips', i ? shade(a.top.color, -0.15) : a.top.color, { metal: true });
    for (const s of [-1, 1]) add(profile([[-0.11, 0.07, 0.06], [-0.2, 0.085, 0.07], [-0.24, 0.07, 0.055]], 8), 'hips', a.top.color, { position: [s * 0.1 * W, 0, 0.03], metal: true });
  }
  const longHem = (y1, flare, colour = cloth) => {
    const rr = [...hemRings(0.06, -0.1, 0.03), [y1, ringAt(hipsRings, -0.08)[1] + 0.05 + flare, ringAt(hipsRings, -0.08)[2] + 0.06 + flare * 0.9, 0]];
    add(profile(rr, 16), 'hips', colour);
    add(profile([[y1 - 0.008, rr[3][1] + 0.006, rr[3][2] + 0.006], [y1 + 0.02, rr[3][1] + 0.002, rr[3][2] + 0.002]], 16), 'hips', a.top.id === 'trim_robe' ? cloth2 : lining);
  };
  if (hem === 'long') longHem(-(L * 0.9), 0.1);
  if (hem === 'knee') longHem(-(L * 0.52), 0.08, a.top.id === 'surcoat' ? a.top.color2 || cloth : cloth);
  if (hem === 'coat' || hem === 'trench') {
    // coat tails: open at the front, so the legs show between them
    const y1 = hem === 'trench' ? -(L * 0.8) : -(L * 0.55);
    for (const s of [-1, 1]) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 8, 3, true, s > 0 ? 0.35 : Math.PI + 0.35 - Math.PI, Math.PI - 0.35), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = 0.5 - p.getY(i), y = 0.04 + v * (y1 - 0.04), rr = ringAt(hipsRings, Math.max(-0.1, y));
        const fl = 1 + v * 0.35;
        p.setXYZ(i, p.getX(i) * (rr[1] + 0.02) * fl, y, p.getZ(i) * (rr[2] + 0.025) * fl + rr[3]);
      }
      g.computeVertexNormals(); add(g, 'hips', cloth); add(backfaced(g), 'hips', lining);
    }
  }
  if (a.top.id === 'surcoat') {
    // the surcoat itself: a sleeveless coat of the colour over mail, with a band down the middle
    const sr = chestRings.filter(r => r[0] > -0.14 * T && r[0] < 0.27 * T).map(([y, rx, rz, z]) => [y, rx + 0.012, rz + 0.014, z]);
    add(profile(sr, 16), 'chest', a.top.color2 || cloth);
  }

  // ---------------------------------------------------------------- belts
  const beltKind = top.belt ?? (bot.belt === true ? 'plain' : bot.belt || 'none');
  const beltY = LONG_TOPS.includes(a.top.id) ? -0.1 * T : null;
  if (beltKind === 'plain' || beltKind === 'wide') {
    const h = beltKind === 'wide' ? 0.05 : 0.032;
    if (beltY != null) bandChest(beltY, h, leather, 0.014 + (top.armor === 'plate' ? 0.03 : 0)); else bandHips(0.025, h, leather, 0.012 + (hem === 'short' || hem === 'mail' || hem === 'plates' ? 0.022 : 0));
    const by = beltY ?? 0.025, z = beltY != null ? chestZ(0, by, 1, 0.024 + (top.armor === 'plate' ? 0.03 : 0)) : hipsZ(0, by, 1, 0.022 + (hem === 'short' || hem === 'mail' || hem === 'plates' ? 0.022 : 0));
    ellipsoid(beltY != null ? 'chest' : 'hips', trim, [0, by, z], [0.034, h * 0.75, 0.008], { metal: true });
    ellipsoid(beltY != null ? 'chest' : 'hips', leather, [0, by, z + 0.006], [0.018, h * 0.4, 0.005]);
  } else if (beltKind === 'sash') {
    const y = beltY ?? 0.02;
    if (beltY != null) bandChest(y, 0.06, cloth2, 0.016); else bandHips(y, 0.06, cloth2, 0.016);
    const bone = beltY != null ? 'chest' : 'hips', zf = beltY != null ? chestZ(0.12 * W, y, 1, 0.02) : hipsZ(0.12 * W, y, 1, 0.02);
    add(taperedCurve([[0.12 * W, y, zf], [0.15 * W, y - 0.1, zf + 0.012], [0.14 * W, y - 0.2, zf + 0.01]], [0.024, 0.02, 0.012], 4, 5), bone, shade(cloth2, -0.08));
  } else if (beltKind === 'rope') {
    bandHips(0.02, 0.016, '#a88a5a', 0.014);
    add(taperedCurve([[-0.06 * W, 0.02, hipsZ(-0.06 * W, 0.02, 1, 0.02)], [-0.075 * W, -0.06, hipsZ(-0.06 * W, 0.02, 1, 0.03)], [-0.07 * W, -0.12, hipsZ(-0.06 * W, 0.02, 1, 0.03)]], [0.008, 0.008, 0.005], 4, 5), 'hips', '#a88a5a');
  }

  // ---------------------------------------------------------------- bottoms hanging from the hips
  if (bot.garment === 'skirt') longHem(-(L * 0.42), 0.06, pants);
  if (bot.garment === 'kilt') {
    add(profile([[0.05, ringAt(hipsRings, 0.05)[1] + 0.012, ringAt(hipsRings, 0.05)[2] + 0.012], [-0.08, ringAt(hipsRings, -0.08)[1] + 0.03, ringAt(hipsRings, -0.08)[2] + 0.03], [-(L * 0.46), ringAt(hipsRings, -0.08)[1] + 0.065, ringAt(hipsRings, -0.08)[2] + 0.06]], 16), 'hips', pants);
    for (let k = 0; k < 12; k++) { const t = k / 12 * Math.PI * 2, rr = ringAt(hipsRings, -0.08); add(taperedCurve([[Math.sin(t) * (rr[1] + 0.03), -0.05, Math.cos(t) * (rr[2] + 0.03)], [Math.sin(t) * (rr[1] + 0.066), -(L * 0.44), Math.cos(t) * (rr[2] + 0.061)]], [0.004, 0.004], 3, 1), 'hips', shade(pants, -0.2)); }
  }
  if (bot.garment === 'loincloth') {
    for (const side of [1, -1]) {
      const g = new THREE.PlaneGeometry(0.16 * W, L * 0.42, 2, 3), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) - L * 0.21 + 0.02, x = p.getX(i) * (1 + (0.02 - y) * 0.4); p.setXYZ(i, x, y, side * (hipsZ(x * 0.6, Math.max(-0.1, y), 1, 0.016) + Math.max(0, -y - 0.1) * 0.12)); }
      g.computeVertexNormals(); add(g, 'hips', pants); add(backfaced(g), 'hips', shade(pants, -0.15));
    }
  }

  // ---------------------------------------------------------------- arms
  const Ua = 0.21 * T * A, Fa = 0.205 * T * A;
  const sleeveLong = ['long', 'mail', 'bell', 'puff'].includes(top.sleeve);
  const upperColour = top.sleeve === 'none' ? skin : top.sleeve === 'mail' ? darkSteel : shirt;
  const foreColour = sleeveLong ? (top.sleeve === 'mail' ? darkSteel : shirt) : skin;
  const armT = R * 0.016;
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    const arm = 'arm' + side, elbow = 'elbow' + side, hand = 'hand' + side;
    const bend = { bone: elbow, at: Ua, width: 0.075 * T };
    const lw = rr => rr.map(([y, x, z, o]) => [y, x * LW, z * LW, o]);
    const upper = lw([[0.05, 0.012, 0.012], [0.035, 0.07 + armT, 0.068 + armT], [-0.02, 0.09 + armT, 0.086 + armT], [-0.09, 0.083 + armT, 0.08 + armT], [-Ua * 0.75, 0.074 + armT * 0.8, 0.072 + armT * 0.8], [-Ua - 0.012, 0.067 + armT * 0.6, 0.066 + armT * 0.6]]);
    if (top.sleeve === 'short' || top.sleeve === 'rolled' || top.sleeve === 'puff') {
      // sleeve to the middle of the upper arm (rolled: to just above the elbow), then skin
      const cut = top.sleeve === 'rolled' ? -Ua * 0.82 : -Ua * 0.5;
      const sl = upper.filter(r => r[0] > cut).map(([y, x, z]) => [y, x + (top.sleeve === 'puff' ? 0.018 : 0.006), z + (top.sleeve === 'puff' ? 0.018 : 0.006)]);
      const cr = ringAt(upper, cut);
      sl.push([cut, cr[1] + 0.008, cr[2] + 0.008]);
      add(profile(sl, 10), arm, shirt, { bend });
      add(profile(upper.filter(r => r[0] < cut + 0.03), 10), arm, top.sleeve === 'puff' ? shirt : skin, { bend });
      add(profile([[cut - 0.012, cr[1] + 0.014, cr[2] + 0.014], [cut + 0.014, cr[1] + 0.014, cr[2] + 0.014]], 10), arm, top.sleeve === 'rolled' ? shade(shirt, -0.12) : lining, { bend });
    } else add(profile(upper, 10), arm, upperColour, { bend, metal: top.sleeve === 'mail' });
    const fore = lw([[-Ua + 0.02, 0.066 + armT * 0.6, 0.065 + armT * 0.6], [-Ua - 0.045, 0.071 + armT * 0.5, 0.07 + armT * 0.5], [-Ua - Fa * 0.55, 0.063 + armT * 0.3, 0.061 + armT * 0.3], [-Ua - Fa + 0.012, 0.05, 0.052], [-Ua - Fa - 0.005, 0.045, 0.047]]);
    if (top.sleeve === 'bell') {
      add(profile([fore[0], fore[1], [fore[2][0], fore[2][1] + 0.02, fore[2][2] + 0.02], [-Ua - Fa + 0.01, 0.1, 0.095], [-Ua - Fa - 0.03, 0.115, 0.108]], 10), arm, shirt, { bend });
      add(profile([[-Ua - Fa - 0.03, 0.105, 0.098], [-Ua - Fa + 0.02, 0.07, 0.068]], 10), arm, lining, { bend });
    } else add(profile(fore, 10), arm, top.sleeve === 'puff' ? skin : foreColour, { bend, metal: top.sleeve === 'mail' });
    // cuffs and forearm pieces live on the elbow bone, which is the forearm
    const cuff = top.cuffs;
    if (cuff === 'cuff' && sleeveLong) add(profile(lw([[-0.2 * T * A, 0.058, 0.058], [-0.17 * T * A, 0.062, 0.062]]), 10), elbow, lining);
    if (cuff === 'bracers') add(profile(lw([[-0.195 * T * A, 0.062, 0.064], [-0.15 * T * A, 0.074, 0.075], [-0.07 * T * A, 0.075, 0.076]]), 10), elbow, leather);
    if (cuff === 'gauntlet') {
      add(profile(lw([[-0.2 * T * A, 0.066, 0.068], [-0.15 * T * A, 0.078, 0.08], [-0.06 * T * A, 0.08, 0.082]]), 10), elbow, a.top.color, { metal: true });
      add(ring(0.08, 0.009), elbow, trim, { position: [0, -0.06 * T * A, 0], rotation: [Math.PI / 2, 0, 0], metal: true });
    }
    if (cuff === 'wraps') for (let i = 0; i < 3; i++) add(ring(0.066 * LW, 0.01), elbow, i % 2 ? cloth : shade(cloth, -0.1), { position: [0, -(0.08 + i * 0.04) * T * A, 0], rotation: [Math.PI / 2 + 0.2, 0, 0.1] });
    // the hand
    ellipsoid(hand, skin, [0, -0.035 * HK, 0.003], [0.065 * HK, 0.082 * HK, 0.061 * HK]);
    ellipsoid(hand, shade(skin, -0.05), [-s * 0.046 * HK, -0.013 * HK, 0.025 * HK], [0.03 * HK, 0.043 * HK, 0.034 * HK]);
    for (let i = 0; i < 2; i++) strip(hand, [[-0.033 * HK, (-0.043 - i * 0.018) * HK, 0.054 * HK], [0, (-0.048 - i * 0.018) * HK, 0.061 * HK], [0.027 * HK, (-0.043 - i * 0.018) * HK, 0.054 * HK]], 0.0026, shade(skin, -0.26));
    if (top.armor === 'plate' && a.decor?.id !== 'pauldrons') {
      ellipsoid(arm, darkSteel, [s * 0.015, 0.008, 0], [0.132, 0.074, 0.117], { metal: true });
      ellipsoid(arm, steel, [s * 0.025, 0.038, 0], [0.126, 0.066, 0.112], { metal: true });
      ellipsoid(arm, trim, [s * 0.023, 0.053, 0.102], [0.015, 0.016, 0.008], { metal: true });
    }
    if (top.armor === 'scale' && a.decor?.id !== 'pauldrons') ellipsoid(arm, a.top.color, [s * 0.02, 0.03, 0], [0.12, 0.065, 0.11], { metal: true });
    if (a.top.id === 'fur_tunic') ellipsoid(arm, a.top.color2 || '#d8c8a8', [s * 0.01, 0.03, 0], [0.1, 0.06, 0.1]);

    // ---------------------------------------------------------------- legs
    const leg = 'leg' + side, knee = 'knee' + side, foot = 'foot' + side;
    const legT = R * 0.03, calfT = R * 0.012;
    const loose = bot.loose ? 0.022 : bot.tight ? -0.006 : 0;
    const thigh = lw([[0.03, 0.02, 0.02], [0.0, 0.097 + legT + loose, 0.088 + legT + loose], [-0.08, 0.105 + legT + loose, 0.104 + legT + loose], [-L * 0.3, 0.094 + legT * 0.8 + loose, 0.093 + legT * 0.8 + loose], [-L * 0.46, 0.082 + legT * 0.5 + loose, 0.083 + legT * 0.5 + loose], [-L * 0.55, 0.078 + loose, 0.08 + loose]]);
    const kneeBend = { bone: knee, at: L * 0.51, width: 0.07 };
    const legCloth = bot.leg;  // share of the whole leg covered
    const thighCut = legCloth >= 0.55 ? null : legCloth > 0 ? -L * 0.51 * (legCloth / 0.5) : 0.05;
    if (thighCut == null) add(profile(thigh, 10), leg, pants, { bend: kneeBend });
    else {
      if (thighCut < 0.03) {
        const cr = ringAt(thigh, thighCut);
        add(profile([...thigh.filter(r => r[0] > thighCut).map(([y, x, z]) => [y, x + 0.004, z + 0.004]), [thighCut, cr[1] + 0.008, cr[2] + 0.008]], 10), leg, pants, { bend: kneeBend });
        if (bot.torn) for (let k = 0; k < 5; k++) { const t = k / 5 * Math.PI * 2; add(new THREE.ConeGeometry(0.02, 0.05, 3), leg, pants, { position: [Math.sin(t) * (cr[1] + 0.004), thighCut - 0.02, Math.cos(t) * (cr[2] + 0.004)], rotation: [Math.PI, 0, 0] }); }
      }
      add(profile(thigh.filter(r => r[0] < thighCut + 0.02), 10), leg, skin, { bend: kneeBend });
    }
    // shin on the knee bone: calf, then ankle
    const shin = lw([[0.012, 0.079 + calfT + loose * 0.8, 0.081 + calfT + loose * 0.8], [-L * 0.12, 0.081 + calfT + loose * 0.8, 0.087 + calfT + loose * 0.8], [-L * 0.3, 0.068 + calfT * 0.6 + loose * 0.7, 0.072 + calfT * 0.6 + loose * 0.7], [-L * 0.46, 0.058 + loose * 0.5, 0.062 + loose * 0.5], [-L * 0.5, 0.056, 0.06]]);
    const shinCloth = legCloth >= 1 ? pants : legCloth > 0.5 ? (bot.stockings ? '#e8e2d2' : null) : null;
    if (legCloth > 0.5 && legCloth < 1 && !bot.stockings) {
      // cropped: cloth to `legCloth` of the shin, skin under it
      const cut = -L * 0.49 * ((legCloth - 0.5) / 0.5);
      const cr = ringAt(shin, cut);
      add(profile([...shin.filter(r => r[0] > cut).map(([y, x, z]) => [y, x + 0.004, z + 0.004]), [cut, cr[1] + 0.008, cr[2] + 0.008]], 10), knee, pants);
      add(profile(shin.filter(r => r[0] < cut + 0.02), 10), knee, skin);
      if (bot.torn) for (let k = 0; k < 5; k++) { const t = k / 5 * Math.PI * 2 + 0.3; add(new THREE.ConeGeometry(0.02, 0.05, 3), knee, pants, { position: [Math.sin(t) * (cr[1] + 0.004), cut - 0.02, Math.cos(t) * (cr[2] + 0.004)], rotation: [Math.PI, 0, 0] }); }
    } else add(profile(shin, 10), knee, shinCloth || skin);
    if (bot.stockings) add(profile([[0.02, 0.086 + calfT, 0.088 + calfT], [-0.05, 0.088 + calfT, 0.092 + calfT]], 10), knee, pants);
    if (bot.loose) add(profile([[-L * 0.44, 0.07, 0.074], [-L * 0.4, 0.078, 0.082]], 10), knee, shade(pants, -0.15));
    // boot shafts
    const shaft = shoe.shaft;
    if (shaft > 0 && shoe.foot !== 'wrap') {
      const topY2 = -L * 0.49 * (1 - shaft);
      const sh = shin.filter(r => r[0] < topY2).map(([y, x, z]) => [y, x + 0.012, z + 0.012]);
      const tr = ringAt(shin, topY2);
      add(profile([[topY2, tr[1] + 0.013, tr[2] + 0.013], ...sh], 10), knee, a.shoes.color, { metal: shoe.foot === 'heavy' && a.bottom.id === 'greaves' });
      if (shoe.cuff) add(profile([[topY2 - 0.02, tr[1] + 0.02, tr[2] + 0.02], [topY2 + 0.012, tr[1] + 0.022, tr[2] + 0.022]], 10), knee, shade(a.shoes.color, -0.2));
    }
    if (shoe.foot === 'wrap') for (let i = 0; i < 5; i++) {
      // cloth wound round the shin: each turn hugs the shin at its own height
      const y = -L * (0.27 + i * 0.045), r = ringAt(shin, y);
      add(profile([[y - 0.012, r[1] + 0.008, r[2] + 0.008], [y + 0.012, r[1] + 0.008, r[2] + 0.008]], 10), knee, i % 2 ? a.shoes.color : shade(a.shoes.color, -0.12), { rotation: [0.12 * (i % 2 ? 1 : -1), 0, 0] });
    }
    // feet
    const shoesC = a.shoes.color;
    const fk = shoe.foot;
    const footColour = fk === 'bare' ? skin : fk === 'hoof' ? shade(shoesC, -0.4) : fk === 'wrap' ? skin : shoesC;
    const footScale = fk === 'bare' ? [0.1, 0.055, 0.145] : fk === 'heavy' ? [0.12, 0.075, 0.17] : fk === 'slipper' ? [0.108, 0.052, 0.145] : fk === 'hoof' ? [0.09, 0.08, 0.1] : fk === 'pointed' ? [0.095, 0.058, 0.17] : fk === 'shoe' ? [0.1, 0.058, 0.152] : [0.103, 0.062, 0.159];
    ellipsoid(foot, footColour, [0, -0.005, fk === 'hoof' ? 0.02 : 0.047], footScale.map(v => v * (0.85 + LW * 0.15)));
    if (fk === 'pointed') add(taperedCurve([[0, 0.0, 0.16], [0, 0.02, 0.23], [0, 0.07, 0.25]], [0.04, 0.02, 0.004], 5, 5), foot, shoesC);
    if (fk === 'hoof') add(profile([[-0.06, 0.08, 0.08], [0.02, 0.07, 0.07]], 8), foot, shade(shoesC, -0.55), { position: [0, 0, 0.02] });
    if (fk === 'sandal') {
      ellipsoid(foot, skin, [0, 0.005, 0.05], [0.094, 0.05, 0.14]);
      for (const z of [0.02, 0.075]) strip(foot, [[-0.07, 0.02, z], [0, 0.055, z + 0.01], [0.07, 0.02, z]], 0.009, leather);
      add(profile([[-0.06, 0.1, 0.15], [-0.05, 0.1, 0.15]], 10), foot, leather, { position: [0, 0, 0.05] });
    }
    if (fk === 'wrap') for (const z of [0.0, 0.06, 0.12]) strip(foot, [[-0.075, 0.0, z], [0, 0.05, z + 0.01], [0.075, 0.0, z]], 0.012, a.shoes.color);
    if (fk === 'bare') for (let t = 0; t < 3; t++) ellipsoid(foot, shade(skin, -0.05), [(-0.04 + t * 0.035) * s, 0.0, 0.19], [0.022, 0.02, 0.02]);
    if (['boot', 'heavy', 'shoe', 'pointed'].includes(fk)) {
      // a sole, and laces for anything that is not a slipper
      add(profile([[-0.066, 0.075, 0.12, 0.048], [-0.05, 0.105, 0.154, 0.048], [-0.042, 0.104, 0.15, 0.048]], 12), foot, '#2c3032');
      if (fk !== 'pointed') for (const z of [0.03, 0.07]) strip(foot, [[-0.035, 0.05, z], [0, 0.057, z + 0.008], [0.035, 0.05, z]], 0.006, shade(shoesC, -0.3));
    }
    if (fk === 'heavy') add(ring(0.11, 0.018), foot, darkSteel, { position: [0, -0.025, 0.02], rotation: [Math.PI / 2, 0, 0], metal: true });
  }
  return { chestZ, hipsZ, chestRX, chestRings, hipsRings, neckR, top, bot, shoe, LW };
}

/** Reversed-winding copy of a geometry, for the inside of a sheet. */
function backfaced(g) {
  const b = g.clone();
  if (!b.index) b.setIndex(Array.from({ length: b.attributes.position.count }, (_, i) => i));
  const idx = b.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i], idx[i + 1]] = [idx[i + 1], idx[i]];
  b.computeVertexNormals(); return b;
}
