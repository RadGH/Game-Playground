// No page zoom on phones. iPhone Safari (and every iOS browser — they all use Safari's engine) ignores the
// viewport's `user-scalable=no`, so a pinch or a quick double-tap on a gap between buttons zooms the whole page,
// and in a full-screen game there is nothing left to pinch back out with (Wyrmroad 2026-11-21, lessons H4).
//
//   import { stopPageZoom } from '../../../shared/no-zoom.js';
//   stopPageZoom();            // once, at start-up
//
// What it does:
//   - refuses Safari's own pinch gesture (gesturestart / gesturechange). A game's own two-finger map zoom still works:
//     that runs on pointer / touch events, which this does not touch.
//   - `touch-action: manipulation` on <html>: no double-tap zoom anywhere, while scrolling menus still scroll and
//     taps fire right away. Elements that set their own touch-action (none, pan-y…) keep it.
//   - adds maximum-scale=1 to the viewport so tapping a text box doesn't zoom in on it.
// Safe to call more than once.
let done = false;

export function stopPageZoom(doc = globalThis.document) {
  if (done || !doc) return;
  done = true;
  for (const ev of ['gesturestart', 'gesturechange']) doc.addEventListener(ev, e => e.preventDefault(), { passive: false });
  doc.documentElement.style.touchAction = 'manipulation';
  const vp = doc.querySelector('meta[name="viewport"]');
  if (vp && !/maximum-scale/.test(vp.content)) vp.content += ', maximum-scale=1';
}
