// The chunk store: which chunks are in memory. PURE.
// A chunk is generated the first time something asks for it. Unedited chunks are forgotten when the
// store is over budget (they can always be generated again, identically); EDITED chunks are kept and
// are the only ones a save writes (`edited()`), so an X-large world's save holds what you built.

import { CH } from './chunkgen.js';
import { wrap } from './macro.js';

export function createChunkStore(gen, opts = {}) {
  const budget = opts.budget ?? 1500;          // unedited chunks kept in memory
  const map = new Map();                        // key → chunk
  const cw = gen.chunksX, chh = gen.chunksY;
  let tick = 0;

  const key = (cx, cy) => wrap(cx, cw) + cy * cw;

  /** The chunk at (cx, cy), generating it if needed. cx wraps; cy outside the map → null. */
  function get(cx, cy) {
    if (cy < 0 || cy >= chh) return null;
    const k = key(cx, cy);
    let c = map.get(k);
    if (!c) { c = gen.generate(wrap(cx, cw), cy); map.set(k, c); if (map.size > budget * 1.2) trim(); }
    c.seen = ++tick;
    return c;
  }
  function peek(cx, cy) { return cy < 0 || cy >= chh ? null : map.get(key(cx, cy)) || null; }

  function trim() {
    const loose = [...map.values()].filter(c => !c.edited && !c.pinned).sort((a, b) => a.seen - b.seen);
    let drop = map.size - budget;
    for (const c of loose) { if (drop-- <= 0) break; map.delete(key(c.cx, c.cy)); }
  }

  /** Cell index helpers in world coordinates (x wraps). */
  function at(gx, gy) {
    const cx = Math.floor(gx / CH), cy = Math.floor(gy / CH);
    const c = get(cx, cy); if (!c) return null;
    return { c, i: (gy - cy * CH) * CH + (wrap(gx, gen.W) - wrap(cx, cw) * CH) };
  }

  function markEdited(c) { c.edited = true; c.version++; }
  function edited() { return [...map.values()].filter(c => c.edited); }
  /** Put a saved chunk back (from a save file). */
  function restore(c) { c.edited = true; map.set(key(c.cx, c.cy), c); }

  return { get, peek, at, key, markEdited, edited, restore, get size() { return map.size; }, chunksX: cw, chunksY: chh, W: gen.W, H: gen.H };
}
