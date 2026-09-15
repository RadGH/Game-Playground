// Health bar maths (E44), shared by the stage's floating bars, the party tab and tests/hp-bars.test.js.
//
// Why this exists: Combat.round() works out a whole round in one go, then main.js spends a few
// seconds replaying its events (swings, projectiles, numbers). The bars used to read the live unit
// every frame, so they showed the END of the round while the first swing was still animating: an
// enemy that would die later in the round showed an empty bar and then "survived" the two or three
// hits still being replayed. Combat now stamps a snapshot of every unit an event touches onto the
// event (`ev.snap`), and the stage draws the snapshot of the event being shown instead of the live
// number. No three.js here, so node tests can import it.

/** Total temporary hit points on a unit: barrier statuses plus anything marked as a shield. */
export function shieldOf(unit) {
  return (unit?.statuses || []).reduce((n, s) => n + (s.type === 'barrier' || s.type === 'shield' ? Math.max(0, s.power || 0) : 0), 0);
}

/**
 * What a health bar needs to know about a unit right now, as whole numbers.
 * Health above max health (temporary health from a battle cry) is shown as shield, so it is never
 * hidden behind a full bar.
 * @returns {{hp:number, maxHp:number, shield:number}}
 */
export function snapUnit(unit) {
  const maxHp = Math.max(1, Math.round(unit?.maxHp || 1));
  const raw = Math.max(0, Math.round(unit?.hp || 0));
  return { hp: Math.min(maxHp, raw), maxHp, shield: Math.round(shieldOf(unit)) + Math.max(0, raw - maxHp) };
}

/** A snapshot of every unit in a list, keyed by id. */
export function snapAll(units) {
  const out = {};
  for (const u of units || []) if (u?.id != null && u.maxHp != null) out[u.id] = snapUnit(u);
  return out;
}

/**
 * Widths for one bar, in percent of the track.
 * The health fill is always exactly hp / maxHp. The shield segment sits right after the health; when
 * health plus shield would run past the end of the track, the segment slides back over the end of
 * the health fill (and `overlap` is set) so a shield on a full-health unit is still visible.
 */
export function barState(snap) {
  const maxHp = Math.max(1, snap?.maxHp || 1);
  const hpFrac = Math.max(0, Math.min(1, (snap?.hp || 0) / maxHp));
  const shFrac = Math.max(0, Math.min(1, (snap?.shield || 0) / maxHp));
  const overlap = hpFrac + shFrac > 1;
  return { hpFrac, hpPct: 100 * hpFrac, shPct: 100 * shFrac, shLeftPct: 100 * (overlap ? 1 - shFrac : hpFrac), overlap, dead: (snap?.hp || 0) <= 0 };
}
