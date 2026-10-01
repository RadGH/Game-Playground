// (stub — the weapons agent replaces this) Held items and shields as ordinary geometry on the grip bones.
/**
 * Build what the hands carry. Returns the HOLD record the animator reads:
 *   { right: <family>, left: <family>, twoHanded: bool, ids: { held, offhand } }
 * right families: 'none' | 'sword' | 'greatsword' | 'axe' | 'greataxe' | 'mace' | 'hammer' | 'dagger' | 'spear' | 'staff' | 'wand'
 * left families:  'none' | 'shield' | 'axe' | 'sword' | 'dagger' | 'orb' | 'book' | 'torch'
 */
export function buildHeld(a, R, body, asm, opts = {}) {
  return { right: 'none', left: 'none', twoHanded: false, ids: { held: a.held?.id || 'none', offhand: a.offhand?.id || 'none' } };
}
