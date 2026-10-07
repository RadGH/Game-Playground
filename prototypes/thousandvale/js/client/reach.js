// How close the client walks before a basic attack (play-test 5, T14: "wands with a short-range cone start shooting from
// out of range and wait for the enemy to come closer, instead of walking into range first").
//
// Two things made that happen. The server's `you.reach` was the weapon's nominal range, not the reach of the attack FORM
// (a 9 m cone on a wand that "shoots 34 m") — C/A now publish the form's real reach. And the client GREW its own idea of
// the reach from any hit that landed further away (a spell at 25 m taught it that the wand reaches 25 m). With a reach
// from the server the client now believes it and nothing else; a `castR {why:'range', need}` only ever shortens it.
// Pure — no three, no DOM.

const RANGED_SUB = /bow|crossbow|wand|sling|javelin|throw/i;
export const MELEE_REACH = 2.4;

/** Stop this far out for an attack that lands at `reach` metres: inside it by 15% (at least 1 m for anything ranged). */
export function approachReach(reach) {
  if (!Number.isFinite(reach) || reach <= 0) return MELEE_REACH;
  if (reach <= 3.2) return Math.max(1.6, reach - 0.3);            // melee and point-blank forms: right up to it
  return Math.max(MELEE_REACH, Math.min(reach - 1, reach * 0.85));
}

/**
 * The basic attack's reach from what the server said about you. -> { reach (walk-to distance), known (the server said) }.
 * `you.reach` / `you.attackRange` = metres the current form really lands at; `reach: null` = melee.
 */
export function basicReach(you = {}, weapon = null) {
  const r = you.reach ?? you.attackRange;
  if (Number.isFinite(r) && r > 0) return { reach: approachReach(r), known: true, raw: r };
  if ('reach' in you && you.reach === null) return { reach: MELEE_REACH, known: true, raw: null };
  const w = weapon || you.equipment?.weapon;
  return { reach: w && RANGED_SUB.test(`${w.subtype || ''} ${w.baseKey || ''} ${w.base || ''}`) ? 24 : MELEE_REACH, known: false, raw: null };
}

/** After `castR {why:'range', need?}`: never longer than before. `dist` = how far the target was. */
export function shortenReach(reach, { need = null, dist = null } = {}) {
  if (Number.isFinite(need) && need > 0) return Math.min(reach, approachReach(need));
  if (Number.isFinite(dist)) return Math.max(1.6, Math.min(reach, dist) * 0.8);
  return Math.max(1.6, reach * 0.8);
}
