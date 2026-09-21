// Farhold — what is under the pointer on the full-screen map.
//
//   "I found a spikey icon on the map with a red circle that appears to be a world boss. However if
//    I hover directly over it it says something about 'ancient wood' that I think is from the
//    surrounding. There is only a few pixels at the top-left of the icon that give me the correct
//    World Boss tooltip."
//
// ## The bug, which was not an offset
//
// Nothing was drawn in the wrong place. `js/map.js` built its hit list in PAINT order — the marks
// are sorted smallest-last so a capital is never hidden under the hamlet beside it, which puts the
// world boss (first in `MARK_ORDER`, therefore painted on top) at the very END of the list — and
// the hover then walked that list forwards and took the FIRST circle containing the pointer:
//
//     for (const h of placeHits) if (near(h.x, h.y, h.r)) { hover = …; break; }
//
// So whatever was painted UNDERNEATH won every overlap, every time. An ancient wood a few dozen
// metres away had its hit circle over most of the boss's burst, and the only pixels left for the
// boss were the ones outside that circle — the sliver at its top-left, which is exactly what the
// player found.
//
// Two more faults were tangled into it: places and pads were two separate lists consulted in a
// fixed order rather than one list resolved by distance, and the hit RADIUS was written in backing-
// buffer pixels (`Math.max(9, …)`), which on a retina display is four and a half real pixels — so
// the size of every target on the map silently depended on the machine it was drawn on.
//
// ## The rule
//
// One list, in paint order, and **the mark whose centre is nearest the pointer wins**. A dead heat
// goes to whatever was painted last, because that is the one you can see. Ground is never in the
// list at all, so an icon always beats the terrain under it.
//
// This file is pure — no DOM, no canvas — so `tests/round17-map.test.js` drives the same resolver
// the game does, at the same radii, for every kind of icon on the map.

/**
 * How big a target a mark is, in backing-buffer pixels.
 *
 * `mark` is a row of `MAP_MARKS`, `k` the scale `drawMark()` was called with, and `dpr` the buffer
 * ratio — every constant here is a CSS pixel multiplied up, which is the half that used to be
 * wrong. The drawn size includes the 1.55x ring a capital and a world boss wear, so the whole of
 * what you can see is what you can point at.
 */
export function markHitRadius(mark, k = 1, dpr = 1) {
  const drawn = ((mark?.r) || 3) * k * (mark?.ring ? 1.55 : 1);
  return Math.max(9 * dpr, drawn + 4 * dpr);
}

/**
 * Which of `hits` is under (x, y), or null for bare ground.
 *
 * A hit is `{ tier, x, y, r, order, … }` where `order` is its position in paint order — 0 first,
 * highest last. `want` narrows the search to one tier: the click handler asks for `'pad'` only,
 * because clicking a pad picks it and clicking anything else selects a cell.
 */
export function pickHit(hits = [], x, y, want = null) {
  let best = null;
  for (const h of hits) {
    if (want && h.tier !== want) continue;
    const d = Math.hypot(h.x - x, h.y - y);
    if (d > h.r) continue;
    /**
     * Nearest centre wins. The half-pixel slack is what makes "painted last wins" a tie-break
     * rather than an override: two marks on genuinely the same spot go to the top one, and a mark
     * you are actually pointing at is never lost to a bigger one beside it.
     */
    if (!best || d < best.d - 0.5 || (d < best.d + 0.5 && (h.order ?? 0) >= (best.h.order ?? 0))) {
      best = { d, h };
    }
  }
  return best?.h || null;
}
