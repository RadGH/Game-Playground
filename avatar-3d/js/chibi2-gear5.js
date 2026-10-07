// Chibi 2 — the round-5 gear ("g5_"): one dispatch for every new model of Thousandvale play-test 5 (T23, T15).
//
// `buildGear5(a, c)` is called by chibi2.js right after buildGear and buildArmour2, with the same context
// plus `body` (the surfaces chibi2-body.js hands back) and `face`. It is OPT-IN: an avatar that names no
// `g5_` id returns on the first line, so every existing look builds exactly the geometry it always did.
//
// Where a g5_ part is named (see chibi2-gear5-ids.js for the full list and CHIBI2.md "Gear catalog"):
//   hat.id · top.id · bottom.id · shoes.id · cape.id · decor.id · accessory.id · held.id · offhand.id
//   top.gloves = { id, color, color2 }                      the hands slot — Chibi 2 had no hands model
//   accessory.ring / accessory.ring2 = { id, color, color2 } a band on the right / left hand
//
// The models themselves live in three files, one per kind of thing, so each stays readable:
//   chibi2-gear5-weapons.js   everything held in the right hand (and, for one-handers, the left)
//   chibi2-gear5-armour.js    head / chest / legs / hands / feet x cloth / leather / mail / plate
//   chibi2-gear5-offhand.js   shields, foci, quiver, torch — and the worn accessories (cloak, lantern, belt, torc, ring)
import { isG5, G5_HELD, G5_OFFHAND } from './chibi2-gear5-ids.js';
import { G5_WEAPON_BUILDERS } from './chibi2-gear5-weapons.js';
import { G5_HAT_BUILDERS, G5_TOP_BUILDERS, G5_BOTTOM_BUILDERS, G5_SHOE_BUILDERS, G5_GLOVE_BUILDERS } from './chibi2-gear5-armour.js';
import { G5_OFFHAND_BUILDERS, G5_CAPE_BUILDERS, G5_DECOR_BUILDERS, G5_ACCESSORY_BUILDERS, G5_RING_BUILDERS } from './chibi2-gear5-offhand.js';

export { G5_WEAPON_BUILDERS, G5_HAT_BUILDERS, G5_TOP_BUILDERS, G5_BOTTOM_BUILDERS, G5_SHOE_BUILDERS, G5_GLOVE_BUILDERS,
  G5_OFFHAND_BUILDERS, G5_CAPE_BUILDERS, G5_DECOR_BUILDERS, G5_ACCESSORY_BUILDERS, G5_RING_BUILDERS };

/** Everything in a hand is skinned to that hand's GRIP bone, exactly as chibi2-gear.js does it. */
function gripped(c) {
  return { ...c, add: (g, bone, color, o = {}) => c.add(g, bone, color, { ...o, skinTo: o.skinTo || (bone === 'handR' ? 'gripR' : bone === 'handL' || bone === 'elbowL' ? 'gripL' : undefined) }) };
}
/** The same context with the two hands exchanged: a builder written for the right hand lands in the left. */
function swapped(c) {
  const swap = b => b === 'handR' ? 'handL' : b === 'handL' ? 'handR' : b === 'elbowR' ? 'elbowL' : b === 'elbowL' ? 'elbowR' : b;
  return { ...c, add: (g, bone, color, o = {}) => c.add(g, swap(bone), color, o) };
}

const q = part => part?.quality ?? 0;

export function buildGear5(a, c) {
  const gloves = a.top?.gloves, ring = a.accessory?.ring, ring2 = a.accessory?.ring2;
  if (![a.hat?.id, a.top?.id, a.bottom?.id, a.shoes?.id, a.cape?.id, a.decor?.id, a.accessory?.id, a.held?.id, a.offhand?.id, gloves?.id, ring?.id, ring2?.id].some(isG5)) return;

  // ---- worn: armour first (the surfaces everything else sits on), then accessories
  G5_TOP_BUILDERS[a.top?.id]?.(a, c, a.top);
  G5_BOTTOM_BUILDERS[a.bottom?.id]?.(a, c, a.bottom);
  G5_SHOE_BUILDERS[a.shoes?.id]?.(a, c, a.shoes);
  G5_HAT_BUILDERS[a.hat?.id]?.(a, c, a.hat);
  if (gloves) G5_GLOVE_BUILDERS[gloves.id]?.(a, c, gloves);
  G5_CAPE_BUILDERS[a.cape?.id]?.(a, c, a.cape);
  G5_DECOR_BUILDERS[a.decor?.id]?.(a, c, a.decor);
  G5_ACCESSORY_BUILDERS[a.accessory?.id]?.(a, c, a.accessory);
  if (ring) G5_RING_BUILDERS[ring.id]?.(a, c, ring, 'R');
  if (ring2) G5_RING_BUILDERS[ring2.id]?.(a, c, ring2, 'L');

  // ---- in the hands
  const g = gripped(c);
  const held = a.held?.id, off = a.offhand?.id;
  if (G5_HELD[held]) G5_WEAPON_BUILDERS[held]?.(g, a.held.color || '#c8ccd6', q(a.held), a, a.held);
  if (G5_OFFHAND[off]) G5_OFFHAND_BUILDERS[off]?.(g, a.offhand.color || G5_OFFHAND[off].color || '#9aa3ad', q(a.offhand), a, a.offhand);
  else if (G5_HELD[off]) G5_WEAPON_BUILDERS[off]?.(swapped(g), a.offhand.color || '#c8ccd6', q(a.offhand), a, a.offhand);   // a second weapon, in the left hand
}
