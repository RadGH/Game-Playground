// The D2-style bag (ruling 11): a 10 x 4 grid; every item covers its base's grid { w, h } cells at item.pos { x, y }.
// Pure. Belts hold potions in their own row (M7). The shared stash uses the same grid code at another size.
export const BAG_W = 10, BAG_H = 4;
const sizeOf = (data, it) => data.bases[it.base]?.grid || { w: 1, h: 1 };     // potions (base 'potion') are 1 x 1
/** Do the cells of `it` at (x, y) fall inside the grid and clear of every other item? */
export function fits(data, list, it, x, y, W = BAG_W, H = BAG_H) {
  const { w, h } = sizeOf(data, it);
  if (x < 0 || y < 0 || x + w > W || y + h > H) return false;
  for (const o of list) {
    if (o.uid === it.uid || !o.pos) continue;
    const s = sizeOf(data, o);
    if (x < o.pos.x + s.w && o.pos.x < x + w && y < o.pos.y + s.h && o.pos.y < y + h) return false;
  }
  return true;
}
/** The first free spot, scanning columns left to right (D2 fills top-left first). */
export function findSpot(data, list, it, W = BAG_W, H = BAG_H) {
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (fits(data, list, it, x, y, W, H)) return { x, y };
  return null;
}
/** Put an item in the first free spot; returns the new list or null if it does not fit. */
export function stow(data, list, it, W = BAG_W, H = BAG_H) { const pos = findSpot(data, list, it, W, H); return pos ? [...list, { ...it, pos }] : null; }
