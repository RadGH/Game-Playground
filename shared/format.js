// One place every game screen formats a number, so nothing ever renders "25.02000000000001"
// or "5.84999999964 overkill" again.
//
//   import { fmt, hp, pct, sign, range } from '../../shared/format.js';
//   fmt(25.020000001)   // "25.02"
//   fmt(14.0)           // "14"
//   hp(14.68)           // "15"        health is always whole
//   pct(0.1234)         // "12%"
//   sign(-3.5)          // "−3.5"      (a real minus sign)
//
// Rules (E5): health/HP is always shown as a whole number; every other number is shown with at
// most two decimals and trailing zeros trimmed. Anything that is not a finite number comes back
// as an empty string rather than "NaN" or "undefined".

/** Most decimals any displayed number may have. */
export const MAX_DECIMALS = 2;

/** True for something we can actually format. */
function num(v) { return typeof v === 'number' ? isFinite(v) : (v != null && v !== '' && isFinite(Number(v))); }

/**
 * A number for display: at most `decimals` places, trailing zeros trimmed, thousands grouped.
 * @param {number|string} v
 * @param {{decimals?: number, group?: boolean}} [opts] group: use thousand separators (default true)
 */
export function fmt(v, { decimals = MAX_DECIMALS, group = true } = {}) {
  if (!num(v)) return '';
  const n = Number(v);
  const d = Math.max(0, Math.min(6, decimals));
  // round first so 5.84999999964 → 5.85 and 25.02000000000001 → 25.02
  const r = Math.round(n * 10 ** d) / 10 ** d;
  if (Object.is(r, -0)) return '0';
  return group ? r.toLocaleString('en-US', { maximumFractionDigits: d }) : String(r);
}

/** Health, damage, mana and anything else counted in whole points. */
export function hp(v) { return num(v) ? fmt(Math.round(Number(v)), { decimals: 0 }) : ''; }
/** Same as hp() but without thousand separators, for places that build their own string. */
export function hpRaw(v) { return num(v) ? String(Math.round(Number(v))) : ''; }

/** A 0–1 fraction as a percentage ("12%"). Pass decimals for "12.5%". */
export function pct(v, decimals = 0) { return num(v) ? `${fmt(Number(v) * 100, { decimals })}%` : ''; }
/** A number already in percent units ("12%" from 12). */
export function pctOf(v, decimals = 0) { return num(v) ? `${fmt(v, { decimals })}%` : ''; }

/** A signed number, with a real minus sign: "+3", "−1.25". */
export function sign(v, { decimals = MAX_DECIMALS, plus = '+' } = {}) {
  if (!num(v)) return '';
  const n = Number(v);
  return (n < 0 ? '−' : plus) + fmt(Math.abs(n), { decimals });
}

/** A low–high pair ("10–19"). */
export function range(lo, hi, { decimals = 0 } = {}) { return `${fmt(lo, { decimals })}–${fmt(hi, { decimals })}`; }

/**
 * A QUANTITY OF A MATERIAL — one decimal place, trailing zero trimmed.
 *
 * Farhold R17: "Update all resources in chat and inventory to round to 1 decimal place. It can stay
 * a float underlying. In the chat it showed some long string like 'you lack 6.000000000003 clay'."
 *
 * Ore, timber, fibre and clay all come out of the ground as fractions — a gather pays `base *
 * toolYield * richness` — so the stored amount genuinely is 6.000000000003, and it should stay
 * that way. What must never happen is printing it. Two decimals is more precision than a pile of
 * clay deserves on a screen, so this is its own formatter rather than a call to `fmt`.
 *
 *   mat(6.000000000003)  // "6"
 *   mat(6.25)            // "6.3"
 *   mat(0.04)            // "0"    — you have effectively none, and that is the useful answer
 */
export function mat(v) { return fmt(v, { decimals: 1 }); }

/** Seconds with one decimal, for meters and timelines ("12.4s"). */
export function secs(v) { return num(v) ? `${fmt(v, { decimals: 1 })}s` : ''; }

/** Does a rendered string contain a number with more than two decimals? (used by the tests) */
export const TOO_MANY_DECIMALS = /\d+\.\d{3,}/;
export function hasLongDecimal(text) { return TOO_MANY_DECIMALS.test(String(text ?? '')); }
