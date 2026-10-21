// The size of a full-screen overlay (damage numbers, name plates, object labels) without asking the page for it every frame.
//
// 2026-10-20 (the owner's combat-stutter trace): fx.js, actors.js and objects.js each read `layer.clientWidth` once a
// frame. Reading a size straight after the frame changed some text (the target frame, a damage number) makes the browser
// lay the whole page out again on the spot — about 0.5 s of every 12.5 s in his trace went there. The overlays only change
// size when the window does, so the size is read once and kept up to date by a ResizeObserver (or the window's resize).
//
//   import { boxSize } from './box-size.js'
//   const { w, h } = boxSize(layer)

const cache = new WeakMap();
export function boxSize(el) {
  if (!el) return { w: 0, h: 0 };
  let c = cache.get(el);
  if (c) return c;
  c = { w: el.clientWidth, h: el.clientHeight };
  cache.set(el, c);
  const read = () => { c.w = el.clientWidth; c.h = el.clientHeight; };
  try { if (typeof ResizeObserver === 'function') new ResizeObserver(read).observe(el); else addEventListener('resize', read); } catch { addEventListener('resize', read); }
  return c;
}
