// Name tags that would cover each other are pushed apart (round 12, from the owner's phone screenshots: "Ashley" and
// "YOU" stacked on top of each other in Putt Party; Kitchen Catastrophe's counter labels over the players'). Pure: no DOM,
// so tests/declutter.test.js can check it; js/client/stage.js calls it every frame with the tags it is about to draw.
//
//   declutter(items, screenW) — items: [{ x, y, w, h, fixed? }] where (x, y) is the tag's bottom centre in CSS pixels
//   (the point it hangs from) and w/h its size. Returns [{ x, lift }]: x kept inside the screen sideways, lift = how far
//   up (negative px) to move it so it covers no tag placed before it. Tags are placed nearest the bottom of the screen
//   first (the nearest thing keeps its place); a `fixed` item is placed where asked and never moved, but others still
//   keep clear of it.
export function declutter(items, screenW) {
  const order = items.map((_, i) => i).sort((a, b) => items[b].y - items[a].y), placed = [], out = new Array(items.length);
  for (const i of order) {
    const T = items[i];
    let x = T.x, lift = 0;
    if (!T.fixed && T.w) {
      const hw = T.w / 2;
      if (screenW > T.w + 8) x = Math.min(Math.max(x, hw + 4), screenW - hw - 4);
      for (let pass = 0; pass < 8; pass++) {
        let moved = false;
        for (const p of placed) {
          const top = T.y + lift - T.h, bot = T.y + lift;
          if (Math.abs(x - p.x) < (T.w + p.w) / 2 - 1 && top < p.bot - 1 && bot > p.top + 1) { lift = p.top - 1 - T.y; moved = true; }
        }
        if (!moved) break;
      }
    }
    if (T.w) placed.push({ x, w: T.w, top: T.y + lift - T.h, bot: T.y + lift });
    out[i] = { x, lift };
  }
  return out;
}
/** True when two placed tags overlap (for tests). */
export const overlaps = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1 && a.top < b.bot - 1 && b.top < a.bot - 1;
