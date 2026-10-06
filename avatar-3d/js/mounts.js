// MOUNTS (2026-10-05, Thousandvale play-test 2 Q16; reusable by Farhold / Bannerline / any page).
//
// A mount is a creature body (creatures.js) wearing TACK — a saddle on a blanket, stirrups hanging down the
// flanks, a girth, a bridle and reins, optional saddlebags; the warhorse also wears barding (a cloth
// caparison, a crinet down the neck and a chanfron plate on the face) — plus a SEAT: an Object3D on top of
// the saddle where a rider's hips go. Every piece of tack is parented to the creature's hip (or head), so
// it bobs, pitches and turns with the gait, and so does the rider.
//
//   import { createMount, seatRider, mountSpecFor, CHIBI2_MOUNT_ANIMS } from './mounts.js';
//   const mount = await createMount(mountSpecFor('riding_horse'));
//   scene.add(mount.group);
//   const rider = await createChibi2Character(avatar, { anims: [...CHIBI2_ANIMS, ...CHIBI2_MOUNT_ANIMS] });
//   const unseat = seatRider(mount, rider);   // rider.group now rides mount.seat, playing 'ride'
//   mount.setGait(speed);                     // m/s -> idle / walk / trot / gallop (+ the rider's clip)
//   mount.update(dt, t); rider.update(dt);    // every frame (the mount moves the reins after its body)
//   unseat();                                 // the rider is back where it was before seatRider
//
// The catalog and the id mapping live in mount-types.js (pure, no Three.js).

import * as THREE from 'three';
import { createCreature } from './creatures.js';
import { createEquine } from './equine.js';
import { CREATURE_TYPES } from './creature-types.js';
import { MOUNT_TYPES, mountSpecFor, gaitFor } from './mount-types.js';
import { CHIBI2_MOUNT_ANIMS } from './chibi2-motion.js';

export { MOUNT_TYPES, MOUNT_KEYS, MOUNT_GAITS, MOUNT_ALIASES, mountSpecFor, gaitFor } from './mount-types.js';
export { CHIBI2_MOUNT_ANIMS };

const MATS = new Map();
function mat(color, extra = {}) {
  const k = color + JSON.stringify(extra);
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: extra.metal ? 0.4 : 0.85, metalness: extra.metal ? 0.7 : 0, side: extra.double ? THREE.DoubleSide : THREE.FrontSide }));
  return MATS.get(k);
}
function mesh(geo, color, extra) { const m = new THREE.Mesh(geo, mat(color, extra)); m.castShadow = true; m.userData.tack = true; return m; }
/** A curved sheet over the barrel: a partial open cylinder along z, `arc` radians centred on the top. */
function shell(r, len, arc, color, segs = 14) {
  const g = new THREE.CylinderGeometry(r, r, len, segs, 1, true, Math.PI - arc / 2, arc);
  g.rotateX(Math.PI / 2);
  return mesh(g, color, { double: true });
}
const box = (w, h, d, c, e) => mesh(new THREE.BoxGeometry(w, h, d), c, e);
const cyl = (r1, r2, h, c, s = 8, e) => mesh(new THREE.CylinderGeometry(r1, r2, h, s), c, e);
const shade = (hex, k) => { const c = new THREE.Color(hex); if (k >= 0) c.lerp(new THREE.Color('#ffffff'), k); else c.multiplyScalar(1 + k); return '#' + c.getHexString(); };

/**
 * Build a mount. `spec` = anything mountSpecFor takes (a type key, a game id, a look) or an already normalised spec.
 * -> { group, creature, spec, seat, setGait(speed), setAnim(name), get gait, get riderClip, update(dt, t), metrics(), dispose() }
 */
/**
 * Tack cut from an equine body (play-test 4, S22): every strap, pad and plate is a patch of the surface it lies on
 * (creature.frame.patch), so it fits the barrel / neck / head of whichever breed wears it. Hip space is the body's
 * own metres at size 1 (the root is scaled by size), so world sizes go through M().
 */
function equineTack(creature, spec) {
  const F = creature.frame, P = creature.parts, hip = P.hip, S = spec.size, tack = spec.tack || {};
  const leather = tack.leather || '#5a3a22', cloth = tack.cloth || '#7a2a24', metal = tack.metal || '#b8b0a0', dark = shade(leather, -0.25);
  const M = v => v / S, TOP = Math.PI / 2;
  const patch = (o, colour, extra = { double: true }) => mesh(F.patch(o), colour, extra);
  const U = F.saddleU, z = u => F.zAt(u), R = u => F.ringAt(u);
  const barding = tack.kind === 'barding', harness = tack.kind === 'harness';

  // the pad / blanket under the saddle, with a contrasting hem; a barded horse wears a caparison instead
  if (barding) {
    hip.add(patch({ u0: 0.06, u1: 0.93, a0: TOP - 1.95, a1: TOP + 1.95, push: 1.045, rows: 18, cols: 22 }, cloth));
    for (const [a0, a1] of [[TOP - 1.95, TOP - 1.85], [TOP + 1.85, TOP + 1.95]]) hip.add(patch({ u0: 0.06, u1: 0.93, a0, a1, push: 1.05, rows: 18, cols: 2 }, tack.trim || '#d8b060'));
    for (const sx of [-1, 1]) {
      const Rb = R(0.32), badge = mesh(new THREE.CircleGeometry(M(0.11), 16), tack.trim || '#d8b060', { double: true });
      badge.position.set(sx * Rb.rx * 1.075, -Rb.bot * 0.05, z(0.32)); badge.rotation.y = sx * Math.PI / 2; hip.add(badge);
    }
  } else {
    const arc = harness ? 1.05 : 1.0;
    hip.add(patch({ u0: U - 0.15, u1: U + 0.12, a0: TOP - arc, a1: TOP + arc, push: 1.02, rows: 8, cols: 14 }, cloth));
    for (const [a0, a1] of [[TOP - arc - 0.05, TOP - arc + 0.06], [TOP + arc - 0.06, TOP + arc + 0.05]]) hip.add(patch({ u0: U - 0.15, u1: U + 0.12, a0, a1, push: 1.026, rows: 8, cols: 2 }, shade(cloth, 0.35)));
    for (const u of [U - 0.15, U + 0.12]) hip.add(patch({ u0: u - 0.006, u1: u + 0.006, a0: TOP - arc, a1: TOP + arc, push: 1.026, rows: 1, cols: 14 }, shade(cloth, 0.35)));
  }
  // the saddle: a seat over the back, skirts down the flanks, a pommel in front and a high cantle behind
  hip.add(patch({ u0: U - 0.09, u1: U + 0.07, a0: TOP - 0.72, a1: TOP + 0.72, push: 1.065, rows: 8, cols: 12 }, leather));
  hip.add(patch({ u0: U - 0.075, u1: U + 0.06, a0: TOP - 0.55, a1: TOP + 0.55, push: 1.085, rows: 6, cols: 10 }, shade(leather, 0.08)));
  for (const sx of [-1, 1]) hip.add(patch({ u0: U - 0.06, u1: U + 0.055, a0: sx < 0 ? TOP + 0.6 : TOP - 1.25, a1: sx < 0 ? TOP + 1.25 : TOP - 0.6, push: 1.06, rows: 4, cols: 5 }, shade(leather, -0.12)));
  const Rf = R(U + 0.075), Rc = R(U - 0.095);
  const pommel = box(M(0.15), M(0.09), M(0.07), shade(leather, -0.12)); pommel.position.set(0, Rf.top * 1.075 + M(0.035), z(U + 0.075)); pommel.rotation.x = -0.4; hip.add(pommel);
  const cantle = mesh(new THREE.TorusGeometry(M(0.1), M(0.028), 6, 12, Math.PI), shade(leather, -0.12)); cantle.position.set(0, Rc.top * 1.075 + M(0.005), z(U - 0.095)); cantle.rotation.x = -0.35; hip.add(cantle);
  // girth round the barrel, and a breastplate across the chest
  hip.add(patch({ u0: U + 0.08, u1: U + 0.1, a0: 0, a1: Math.PI * 2, push: 1.012, rows: 1, cols: 26, closed: true }, dark, {}));
  if (!barding) hip.add(patch({ u0: 0.9, u1: harness ? 0.95 : 0.915, a0: -0.35, a1: Math.PI + 0.35, push: harness ? 1.05 : 1.02, rows: harness ? 3 : 1, cols: 16 }, harness ? shade(leather, 0.1) : dark));
  if (harness) {
    // a padded breast collar with brass studs, a back pad, and packs strapped over the rump
    for (let i = 0; i < 7; i++) { const a = -0.1 + (i / 6) * (Math.PI + 0.2), Rk = R(0.93); const stud = mesh(new THREE.SphereGeometry(M(0.018), 6, 4), metal, { metal: true }); stud.position.set(Math.cos(a) * Rk.rx * 1.06, Math.sin(a) * (Math.sin(a) > 0 ? Rk.top : Rk.bot) * 1.06, z(0.93)); hip.add(stud); }
    for (const sx of [-1, 1]) {
      const Rp = R(0.26);
      const pack = box(M(0.13), M(0.24), M(0.3), shade(cloth, 0.15)); pack.position.set(sx * Rp.rx * 1.12, Rp.top * 0.35, z(0.26)); pack.rotation.z = -sx * 0.18; hip.add(pack);
      const strap = box(M(0.135), M(0.03), M(0.04), dark); strap.position.set(sx * Rp.rx * 1.13, Rp.top * 0.35, z(0.26)); strap.rotation.z = -sx * 0.18; hip.add(strap);
    }
    const roll = cyl(M(0.07), M(0.07), R(0.3).rx * 2.1, shade(cloth, -0.1), 10); roll.rotation.z = Math.PI / 2; roll.position.set(0, R(0.3).top * 1.04 + M(0.06), z(0.3)); hip.add(roll);
  }

  // the seat: where the rider's hips go (counter-scaled so a rider under it is world-size)
  const seat = new THREE.Object3D(); seat.name = 'seat';
  const Rs = R(U - 0.01);
  seat.position.set(0, Rs.top * 1.085 + M(0.02), z(U - 0.015)); seat.scale.setScalar(1 / S);
  hip.add(seat);

  // stirrups: a leather from under the skirt down to an iron where the rider's feet hang
  const stirrupY = seat.position.y - M(0.36);
  for (const sx of [-1, 1]) {
    const Rw = R(U), x = sx * Rw.rx * 1.1, topY = Rw.top * 0.55, len = Math.max(M(0.05), topY - stirrupY);
    const strap = box(M(0.024), len, M(0.012), dark); strap.position.set(x, topY - len / 2, z(U)); hip.add(strap);
    const iron = mesh(new THREE.TorusGeometry(M(0.045), M(0.009), 5, 12), metal, { metal: true }); iron.position.set(x, stirrupY - M(0.03), z(U)); hip.add(iron);
    const tread = box(M(0.08), M(0.012), M(0.04), metal, { metal: true }); tread.position.set(x, stirrupY - M(0.072), z(U)); hip.add(tread);
    if (tack.bags && !harness) {
      const Rb = R(U - 0.2);
      const bag = box(M(0.1), M(0.19), M(0.23), shade(leather, 0.1)); bag.position.set(sx * Rb.rx * 1.12, Rb.top * 0.42, z(U - 0.2)); bag.rotation.z = -sx * 0.22; hip.add(bag);
      const flap = box(M(0.11), M(0.06), M(0.24), shade(leather, -0.2)); flap.position.set(sx * Rb.rx * 1.15, Rb.top * 0.42 + M(0.08), z(U - 0.2)); flap.rotation.z = -sx * 0.22; hip.add(flap);
    }
  }

  // barding plates: a crinet down the crest and a chanfron on the face, with a spike
  if (barding) {
    P.neck.add(patch({ on: 'neck', u0: 0.08, u1: 0.96, a0: TOP - 0.75, a1: TOP + 0.75, push: 1.08, rows: 10, cols: 8 }, metal, { metal: true, double: true }));
    for (let i = 0; i < 6; i++) { const u = 0.15 + i * 0.14; P.neck.add(patch({ on: 'neck', u0: u, u1: u + 0.012, a0: TOP - 0.78, a1: TOP + 0.78, push: 1.095, rows: 1, cols: 8 }, shade(metal, -0.3), { metal: true, double: true })); }
    P.head.add(patch({ on: 'head', u0: 0.04, u1: 0.78, a0: TOP - 1.0, a1: TOP + 1.0, push: 1.09, rows: 10, cols: 10 }, metal, { metal: true, double: true }));
    const spike = mesh(new THREE.ConeGeometry(0.018, 0.12, 6), metal, { metal: true }); const Rh = F.headRing(0.12); spike.position.set(0, Rh.top * 1.09 + 0.04, Rh.c[2]); spike.rotation.x = -0.9; P.head.add(spike);
  }

  // the bridle: browband, a strap down each cheek, a noseband, a throatlatch, and the bit rings the reins tie to
  const bits = [];
  if (P.head) {
    const hp = (o, c = dark) => P.head.add(patch({ on: 'head', push: 1.07, ...o }, c));
    hp({ u0: 0.1, u1: 0.13, a0: TOP - 1.25, a1: TOP + 1.25, rows: 1, cols: 10 }, barding ? cloth : dark);
    hp({ u0: 0.7, u1: 0.74, a0: 0, a1: Math.PI * 2, rows: 1, cols: 18, closed: true });
    hp({ u0: 0.08, u1: 0.1, a0: Math.PI + 0.2, a1: Math.PI * 2 - 0.2, rows: 1, cols: 8 });
    for (const a of [0, Math.PI]) hp({ u0: 0.11, u1: 0.72, a0: a - 0.09, a1: a + 0.09, rows: 6, cols: 1 });
    const Rb = F.headRing(0.8);
    for (const sx of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(0.024, 0.006, 4, 10), metal, { metal: true });
      ring.position.set(sx * Rb.rx * 1.08, -Rb.bot * 0.35, Rb.c[2]); ring.rotation.y = Math.PI / 2; P.head.add(ring);
      bits.push(ring);
    }
  }
  return { seat, bits, backTop: P.bodyY + Rs.top };
}

/** The Q16 tack on a creatures.js four-legged body (the ram, the drake): unchanged from the first mounts. */
function quadTack(creature, spec) {
  const P = creature.parts, B = CREATURE_TYPES[spec.creature].body, S = spec.size, tack = spec.tack || {};
  const hip = P.hip;
  const leather = tack.leather || '#5a3a22', cloth = tack.cloth || '#7a2a24', metal = tack.metal || '#b8b0a0';
  const M = v => v / S;                                   // world metres -> hip units (the creature root is scaled by size)

  // ---- the saddle: a blanket, the seat, a pommel at the front and a cantle at the back -------------------------
  const r = B.r, zS = B.len * 0.04;                       // just behind the withers
  const saddleLen = Math.min(B.len * 0.55, M(0.5)), blanketLen = Math.min(B.len * 0.7, M(0.66));
  const blanket = shell(r * 1.02, blanketLen, tack.kind === 'barding' ? 2.0 : 1.7, tack.kind === 'ram_saddle' ? (tack.fur || '#e8e0d0') : cloth); blanket.position.z = zS; hip.add(blanket);
  const edge = shell(r * 1.03, blanketLen + M(0.02), 0.25, shade(cloth, 0.35)); edge.rotation.z = 0; edge.position.set(0, 0, zS); hip.add(edge);
  for (const sx of [-1, 1]) { const hem = box(M(0.03), M(0.03), blanketLen, shade(cloth, 0.35)); const a = (tack.kind === 'barding' ? 1.0 : 0.85) * sx; hem.position.set(Math.sin(a) * r * 1.03, Math.cos(a) * r * 1.03, zS); hem.rotation.z = -a; hip.add(hem); }
  const seatShell = shell(r * 1.08, saddleLen, 1.15, leather); seatShell.position.z = zS; hip.add(seatShell);
  const seatTop = r * 1.08;
  const pommel = box(M(0.16), M(0.1), M(0.06), shade(leather, -0.15)); pommel.position.set(0, seatTop + M(0.03), zS + saddleLen / 2 - M(0.03)); pommel.rotation.x = -0.35; hip.add(pommel);
  const cantle = box(M(0.22), M(0.11), M(0.05), shade(leather, -0.15)); cantle.position.set(0, seatTop + M(0.035), zS - saddleLen / 2 + M(0.02)); cantle.rotation.x = 0.35; hip.add(cantle);
  if (tack.kind === 'drake_saddle') {
    // a riding horn to hold on to, and a high back: a drake does not keep still
    const horn = cyl(M(0.025), M(0.035), M(0.2), metal, 8, { metal: true }); horn.position.set(0, seatTop + M(0.12), zS + saddleLen / 2 - M(0.02)); hip.add(horn);
    const knob = mesh(new THREE.SphereGeometry(M(0.04), 8, 6), metal, { metal: true }); knob.position.set(0, seatTop + M(0.23), zS + saddleLen / 2 - M(0.02)); hip.add(knob);
    const back = box(M(0.3), M(0.2), M(0.05), shade(leather, -0.1)); back.position.set(0, seatTop + M(0.1), zS - saddleLen / 2); back.rotation.x = 0.25; hip.add(back);
  }
  // girth: a strap round the barrel under the saddle
  const girth = mesh(new THREE.TorusGeometry(r * 1.035, M(0.018), 5, 28), shade(leather, -0.2)); girth.position.z = zS + saddleLen * 0.12; girth.scale.set(1, 1, 1.5); hip.add(girth);

  // ---- the seat: where the rider's hips go. Counter-scaled so a rider under it is world-size --------------------
  const seat = new THREE.Object3D(); seat.name = 'seat';
  seat.position.set(0, seatTop + M(0.02), zS - M(0.02)); seat.scale.setScalar(1 / S);
  hip.add(seat);

  // ---- stirrups: leathers from the saddle flap down to an iron where the rider's feet hang ----------------------
  // The rider's feet sit ~0.36 m under the seat (a Chibi 2 in the `ride` pose); the leather runs from the flap.
  const stirrupY = seat.position.y - M(0.36);
  for (const sx of [-1, 1]) {
    const topY = r * 0.45, x = sx * r * 1.1, len = Math.max(M(0.05), topY - stirrupY);
    const strap = box(M(0.025), len, M(0.012), shade(leather, -0.25)); strap.position.set(x, topY - len / 2, zS + M(0.02)); hip.add(strap);
    const iron = mesh(new THREE.TorusGeometry(M(0.045), M(0.009), 5, 12), metal, { metal: true }); iron.position.set(x, stirrupY - M(0.03), zS + M(0.02)); hip.add(iron);
    const tread = box(M(0.08), M(0.012), M(0.04), metal, { metal: true }); tread.position.set(x, stirrupY - M(0.072), zS + M(0.02)); hip.add(tread);
    if (tack.bags) {
      const bag = box(M(0.1), M(0.2), M(0.24), shade(leather, 0.1)); bag.position.set(sx * r * 1.0, r * 0.25, zS - saddleLen / 2 - M(0.12)); bag.rotation.z = -sx * 0.25; hip.add(bag);
      const flap = box(M(0.11), M(0.06), M(0.25), shade(leather, -0.2)); flap.position.set(sx * r * 1.03, r * 0.25 + M(0.09), zS - saddleLen / 2 - M(0.12)); flap.rotation.z = -sx * 0.25; hip.add(flap);
    }
  }
  if (tack.kind === 'ram_saddle') {
    // a rolled fur and a pack behind the cantle (a ram carries a mountain trader's gear)
    const roll = cyl(M(0.07), M(0.07), r * 1.6, tack.fur || '#e8e0d0', 10); roll.rotation.z = Math.PI / 2; roll.position.set(0, seatTop + M(0.03), zS - saddleLen / 2 - M(0.08)); hip.add(roll);
  }

  // ---- barding: a caparison skirt down both flanks and over the rump, a crinet on the neck, a chanfron -----------
  if (tack.kind === 'barding') {
    const skirtLen = B.len * 0.95, drop = r * 1.25;
    for (const sx of [-1, 1]) {
      const skirt = box(M(0.025), drop, skirtLen, cloth); skirt.position.set(sx * r * 1.06, -drop * 0.32, -B.len * 0.02); hip.add(skirt);
      const trim = box(M(0.03), M(0.05), skirtLen, tack.trim || '#d8b060'); trim.position.set(sx * r * 1.07, -drop * 0.32 - drop / 2, -B.len * 0.02); hip.add(trim);
      const badge = mesh(new THREE.CircleGeometry(M(0.1), 14), tack.trim || '#d8b060', { double: true }); badge.position.set(sx * r * 1.08, -r * 0.05, -B.len * 0.2); badge.rotation.y = sx * Math.PI / 2; hip.add(badge);
    }
    const rump = shell(r * 1.05, B.len * 0.3, 2.3, cloth); rump.position.z = -B.len * 0.36; hip.add(rump);
    const chest = shell(r * 1.05, B.len * 0.18, 2.6, cloth); chest.position.z = B.len * 0.4; hip.add(chest);
    if (P.neck) { const crinet = box(M(0.14), M(0.06), B.neck * 1.05, metal, { metal: true }); const up = B.neckUp ?? 0.35; crinet.rotation.x = -up; crinet.position.set(0, Math.sin(up) * B.neck / 2 + r * 0.5, Math.cos(up) * B.neck / 2); P.neck.add(crinet); }
    if (P.head) { const plate = box(B.headR * 0.9, B.headR * 0.3, B.snout[1] + B.headR * 0.8, metal, { metal: true }); plate.position.set(0, B.headR * 0.55, B.headR * 0.3 + B.snout[1] * 0.3); plate.rotation.x = 0.28; P.head.add(plate); const spike = mesh(new THREE.ConeGeometry(B.headR * 0.12, B.headR * 0.5, 6), metal, { metal: true }); spike.position.set(0, B.headR * 0.95, B.headR * 0.35); spike.rotation.x = -0.4; P.head.add(spike); }
  }

  // ---- bridle: a noseband round the muzzle, a strap up the cheek, and the bit rings the reins tie to ------------
  const bits = [];
  if (P.head) {
    const [sr, sl] = B.snout;
    const nose = mesh(new THREE.TorusGeometry(sr * 1.15, M(0.012), 5, 16), shade(leather, -0.25)); nose.position.set(0, -B.headR * 0.25, B.headR * 0.6 + sl * 0.45); P.head.add(nose);
    const brow = mesh(new THREE.TorusGeometry(B.headR * 0.95, M(0.012), 5, 18, Math.PI), shade(leather, -0.25)); brow.position.set(0, B.headR * 0.15, B.headR * 0.05); brow.rotation.set(0.25, 0, 0); P.head.add(brow);
    for (const sx of [-1, 1]) {
      const cheek = box(M(0.012), B.headR * 1.0, M(0.02), shade(leather, -0.25)); cheek.position.set(sx * B.headR * 0.9, -B.headR * 0.05, B.headR * 0.45); cheek.rotation.z = sx * 0.15; P.head.add(cheek);
      const ring = mesh(new THREE.TorusGeometry(M(0.025), M(0.006), 4, 10), metal, { metal: true }); ring.position.set(sx * sr * 1.2, -B.headR * 0.3, B.headR * 0.6 + sl * 0.35); ring.rotation.y = Math.PI / 2; P.head.add(ring);
      bits.push(ring);
    }
  }
  return { seat, bits, backTop: P.bodyY + r };
}

export async function createMount(input, { detail = 1 } = {}) {
  const spec = input && input.type && MOUNT_TYPES[input.type] && input.tack ? input : mountSpecFor(input);
  const T = MOUNT_TYPES[spec.type];
  // play-test 4 (S22): a hoofed mount rides its own equine body (equine.js); the ram and the drake keep creatures.js
  const breed = T.breed || null;
  const creature = breed
    ? await createEquine({ breed, size: spec.size, colors: spec.colors, seed: 7 }, { detail })
    : await createCreature({ type: spec.creature, size: spec.size, colors: spec.colors, seed: 7 }, { detail });
  const group = new THREE.Group(); group.name = 'mount-' + spec.type; group.userData.mount = spec.type;
  group.add(creature.group);
  const { seat, bits, backTop } = breed ? equineTack(creature, spec) : quadTack(creature, spec);
  const P = creature.parts, S = spec.size, tack = spec.tack || {};
  const leather = tack.leather || '#5a3a22';

  // the reins run from the bit rings to where the rider's hands are (seat space, world metres). They are re-laid
  // every frame in update(): the head sways and the body bobs, and a rein that did not follow would detach.
  const handPts = [-1, 1].map(sx => { const o = new THREE.Object3D(); o.position.set(sx * 0.09, 0.3, 0.3); seat.add(o); return o; });
  const reinGeo = new THREE.CylinderGeometry(1, 1, 1, 5); reinGeo.translate(0, 0.5, 0); reinGeo.rotateX(Math.PI / 2);   // unit, along +z from the origin
  const reins = bits.map(() => { const m = new THREE.Mesh(reinGeo, mat(shade(leather, -0.3))); m.castShadow = false; m.userData.tack = true; group.add(m); return m; });
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function layReins() {
    if (!reins.length) return;
    group.updateMatrixWorld(true);
    for (let i = 0; i < reins.length; i++) {
      bits[i].getWorldPosition(_a); handPts[i].getWorldPosition(_b);
      group.worldToLocal(_a); group.worldToLocal(_b);
      const len = _a.distanceTo(_b), m = reins[i];
      m.position.copy(_a); m.scale.set(0.009, 0.009, Math.max(0.01, len)); m.updateMatrixWorld();
      m.lookAt(_b.applyMatrix4(group.matrixWorld));          // lookAt takes a world point and handles the parent
    }
  }

  let gait = 'idle', rider = null;
  const G = T.gaits;
  function setGait(speed) {
    const g = gaitFor(speed, spec.type), s = Math.abs(+speed || 0);
    if (creature.setMotion) creature.setMotion(g, s);       // an equine body: its own walk / trot / gallop leg patterns
    else if (g === 'idle') { creature.setAnim('idle'); creature.setRate(1); }
    else if (g === 'gallop') { creature.setAnim('run'); creature.setRate(Math.max(0.6, s / (G.pace.run * S))); }
    else { creature.setAnim('walk'); creature.setRate(Math.max(0.5, s / (G.pace.walk * S))); }
    if (g !== gait) { gait = g; if (rider?.body && rider.clips) rider.body.setAnim(g === 'gallop' ? 'rideGallop' : 'ride', 0.25); }
    return g;
  }
  layReins();

  const handle = {
    group, creature, spec, seat, hands: handPts,
    get gait() { return gait; },
    get riderClip() { return gait === 'gallop' ? 'rideGallop' : 'ride'; },
    get rider() { return rider?.body || null; },
    set _rider(v) { rider = v; },
    setGait,
    /** A creature clip straight through (idle / walk / run / dead / graze …). */
    setAnim(name) { creature.setAnim(name); if (name === 'run') gait = 'gallop'; else if (name === 'walk') gait = 'walk'; else gait = 'idle'; },
    update(dt, t) { creature.update(dt, t); layReins(); },
    metrics() {
      group.updateMatrixWorld(true);
      const m = creature.metrics(), p = seat.getWorldPosition(new THREE.Vector3());
      const g = group.getWorldPosition(new THREE.Vector3());
      return { height: m.height, length: m.length, width: m.width, seatY: p.y - g.y, backY: backTop * S };
    },
    dispose() { for (const m of reins) group.remove(m); creature.dispose(); },
  };
  return handle;
}

/**
 * Put a Chibi 2 character (createChibi2Character's handle) in the saddle. The character group becomes a child of
 * `mount.seat`, lifted so its hips sit on the saddle, facing the mount's +z. When `clips` is true (default) the
 * rider plays `ride` / `rideGallop` with the gait — build the rider with CHIBI2_MOUNT_ANIMS in its `anims`, or it
 * falls back to idle (standing in the saddle). Returns `unseat()`, which puts the group back under its old parent
 * with its old transform.
 */
export function seatRider(mount, body, { clips = true } = {}) {
  const g = body.group;
  const prev = { parent: g.parent, position: g.position.clone(), quaternion: g.quaternion.clone(), scale: g.scale.clone() };
  // where the hips are in the character's own space (bind pose; the group is measured at the origin, unparented)
  const hipsY = riderHipsY(body);
  if (g.parent) g.parent.remove(g);
  g.position.set(0, -hipsY + 0.05, 0); g.quaternion.identity(); g.scale.setScalar(1);
  mount.seat.add(g);
  mount._rider = { body, clips };
  if (clips) body.setAnim?.(mount.riderClip, 0);
  return function unseat() {
    if (g.parent) g.parent.remove(g);
    g.position.copy(prev.position); g.quaternion.copy(prev.quaternion); g.scale.copy(prev.scale);
    if (prev.parent) prev.parent.add(g);
    mount._rider = null;
    if (clips) body.setAnim?.('idle', 0.2);
  };
}

/** Height of a Chibi 2 body's hip joint above its feet, in its own metres (0.55 x its height when it has no rig). */
export function riderHipsY(body) {
  const hips = body.parts?.hips;
  const h = body.metrics?.().height || 1.2;
  if (!hips) return h * 0.4;
  const g = body.group, parent = g.parent, pos = g.position.clone(), q = g.quaternion.clone(), s = g.scale.clone();
  if (parent) parent.remove(g);
  g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.setScalar(1); g.updateMatrixWorld(true);
  const y = hips.getWorldPosition(new THREE.Vector3()).y;
  g.position.copy(pos); g.quaternion.copy(q); g.scale.copy(s);
  if (parent) parent.add(g);
  return y > 0.05 && y < h ? y : h * 0.4;
}
