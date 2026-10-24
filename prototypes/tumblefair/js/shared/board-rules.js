// The board's timing games as pure functions, shared by the server (which decides) and the phones (which draw the same
// thing). Round 12 (2026-10-24): a tap on the phone sends how many ms after the event opened it was pressed; the server
// turns that number into a result with these, so the bar or wheel the player saw and the result always agree.

/** High Striker: the power bar runs 0 -> 100 -> 0 once every `period` ms. -> 0..100 */
export function strikePower(ms, period) {
  const p = ((ms % period) + period) % period / period;
  return Math.round((1 - Math.abs(2 * p - 1)) * 100);
}

/** Stop-the-wheel: the pointer passes one segment every `segMs`. -> the segment index under the pointer. */
export function wheelSeg(ms, segMs, n) { return Math.floor(Math.max(0, ms) / segMs) % n; }

/** Shell game: where the pea ends up after the swaps ([a, b] = cups a and b trade places). */
export function shellAfter(pea, swaps) {
  let at = pea;
  for (const [a, b] of swaps) { if (at === a) at = b; else if (at === b) at = a; }
  return at;
}

/** A tap's ms, kept honest: never before the start, never later than the server has seen (+ a little slack), never past
 *  the window. Not a number -> null. */
export function cleanTapMs(i, elapsed, windowMs, slack = 150) {
  if (!Number.isFinite(i)) return null;
  return Math.max(0, Math.min(Math.round(i), elapsed + slack, windowMs));
}
