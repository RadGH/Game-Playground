// Which travel mark an entity carries (play-test 11, Z45). Pure — no three; quest-marks.js draws it, tests read it.

/**
 * Play-test 11 (Z45, live #46: "an icon over the harbourmaster … and over caravans"): a travel mark floats over the
 * people (and the parked carts) that take you somewhere, drawn from the icon library's `travel_ship` / `travel_cart`.
 * A quest mark on the same body wins — they are two different promises and one glyph at a time reads.
 */
export const TRAVEL_MARKS = ['ship', 'cart'];
export const TRAVEL_LOOK = {
  ship: { icon: 'travel_ship', label: 'Sails to other harbours' },
  cart: { icon: 'travel_cart', label: 'Carts you to other towns' },
};
/** Pure: which travel mark an entity's info earns — a harbourmaster sails, a carter (or a parked cart) carts — or null. */
export function travelOf(info = {}) {
  if (!info || typeof info !== 'object') return null;
  const role = String(info.role || '').toLowerCase();
  if (role === 'harbourmaster' || role === 'harbormaster') return 'ship';
  if (role === 'carter' || role === 'caravaner' || role === 'hauler') return 'cart';
  if (info.vehicle && info.cart != null) return 'cart';          // a parked ox cart at a stop (W5): the cart itself is the ride
  return null;
}
