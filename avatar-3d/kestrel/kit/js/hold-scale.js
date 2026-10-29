// Kestrel kit — how big a Chibi 2 hand item is in a Kestrel hand (Thousandvale batch 1).
//
// Chibi 2 builds every weapon, focus, shield and tool in its own HAND SPACE (chibi2-gear.js: +y up the forearm, +z
// forward, the grip bone at (0, -0.035, 0.055)), sized for a fist that is a ball on a 1.7-unit, three-heads-tall body.
// A Kestrel hand is a real hand on a 1.78 m body, so an item is re-sized before it goes in it (gear-bridge.js), and the
// two-hand clips put the other hand where the SAME re-sizing put the haft (retarget.js). Both read this file.
//
// A long item (anything held by a haft or a hilt that runs along the item's own y through the fist) is STRETCHED along
// that axis, not scaled: the part inside the fist keeps a hand's size (`a`, within `y0` of the grip), everything past it
// grows by `b` — so a sword gets a real one-hand grip and a 75 cm blade, a staff stands 1.7 m with the hand still round
// it — and the item is thinned across its length by `c` (Chibi hafts are 4 cm thick). Anything else (a bow, whose limbs
// run along z; a book, an orb, a lute, a strapped shield) is scaled uniformly by `u`.

const LONG = {
  blade:   { a: 0.85, b: 1.4, c: 0.75, y0: 0.075 },
  dagger:  { a: 0.85, b: 1.12, c: 0.75, y0: 0.075 },
  haft:    { a: 0.85, b: 1.3,  c: 0.8,  y0: 0.075 },
  heavy:   { a: 0.85, b: 1.3,  c: 0.8,  y0: 0.075 },
  polearm: { a: 0.85, b: 1.3,  c: 0.8,  y0: 0.075 },
  staff:   { a: 0.85, b: 1.45, c: 0.8,  y0: 0.075 },
  wand:    { a: 0.85, b: 1.15, c: 0.8,  y0: 0.06 },
  torch:   { a: 0.85, b: 1.2,  c: 0.85, y0: 0.06 },
};
const UNIFORM = { bow: 1.5, crossbow: 1.1, lute: 1.12, book: 0.95, orb: 0.9, caster: 0.9, shield: 1.12, none: 1.0 };
/** Tools and fish the GAME hangs on a hand (prof-view.js, angling-view.js) are scaled by this through the hand frame. */
export const TOOL_SCALE = 1.15;

/** The size rule for a hold kind (chibi2-motion.js HOLD kinds: blade dagger haft heavy polearm staff wand caster …). */
export function itemRule(kind) {
  if (LONG[kind]) return { long: true, ...LONG[kind] };
  return { long: false, u: UNIFORM[kind] ?? 1.0 };
}

/** Map one point in the Chibi GRIP frame (metres from the grip, Chibi hand axes) to the resized item. Pure. */
export function stretchPoint(rule, x, y, z) {
  if (!rule.long) return [x * rule.u, y * rule.u, z * rule.u];
  const ay = Math.abs(y), sy = y < 0 ? -1 : 1;
  const yy = ay <= rule.y0 ? y * rule.a : sy * (rule.y0 * rule.a + (ay - rule.y0) * rule.b);
  return [x * rule.c, yy, z * rule.c];
}
/** The local scale at a point (for normals): [sx, sy, sz]. */
export function stretchScale(rule, y) {
  if (!rule.long) return [rule.u, rule.u, rule.u];
  return [rule.c, Math.abs(y) <= rule.y0 ? rule.a : rule.b, rule.c];
}
