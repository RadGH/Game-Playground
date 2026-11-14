// The bag (owner 2026-11-13: "all icons 1x1, abandon the tetris inventory"): a 10 x 4 grid of squares, one item per
// square, at item.pos { x, y }. Pure. Belts hold potions in their own row. The shared stash uses the same code at
// another size. Moving an item onto another swaps the two.
export const BAG_W = 10, BAG_H = 4;
const at = (list, x, y, skip) => list.find(o => o.pos && o.uid !== skip && o.pos.x === x && o.pos.y === y) || null;
/** Is (x, y) inside the grid and free (apart from `it` itself)? `data` is unused and kept so callers need not change. */
export function fits(data, list, it, x, y, W = BAG_W, H = BAG_H) {
  if (!(x >= 0 && y >= 0 && x < W && y < H)) return false;
  return !at(list, x, y, it?.uid);
}
/** The item in a square, if any. */
export const itemAt = (list, x, y) => at(list, x, y, null);
/** The first free square, row by row from the top left (how a reader scans the bag). */
export function findSpot(data, list, it, W = BAG_W, H = BAG_H) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fits(data, list, it, x, y, W, H)) return { x, y };
  return null;
}
/** Put an item in the first free square; returns the new list or null when the bag is full. */
export function stow(data, list, it, W = BAG_W, H = BAG_H) { const pos = findSpot(data, list, it, W, H); return pos ? [...list, { ...it, pos }] : null; }
/** Free squares left. */
export const freeSlots = (list, W = BAG_W, H = BAG_H) => W * H - list.filter(o => o.pos && o.pos.x < W && o.pos.y < H).length;
/** An older save could hold two items whose top-left squares were apart but whose shapes overlapped — no longer
 *  possible, but anything outside the grid or on a taken square is moved to a free one. */
export function tidy(list, W = BAG_W, H = BAG_H) {
  const out = []; let moved = false;
  for (const it of list) {
    if (it.pos && fits(null, out, it, it.pos.x, it.pos.y, W, H)) { out.push(it); continue; }
    const pos = findSpot(null, out, it, W, H); moved = true;
    out.push(pos ? { ...it, pos } : it);
  }
  return moved ? out : list;
}
