// Speech bubbles over heads. Plain DOM, a few at most, pushed apart by the same declutter Tumblefair uses, and they never
// take a tap (so a bubble can never get between a thumb and the town).
import { declutter } from '../../../tumblefair/js/client/declutter.js';

const MAX = 3;

export function createBubbles({ parent, project }) {
  const live = [];
  const v = { x: 0, y: 0 };
  return {
    live,
    show(id, text, secs = 3.6, tone = '') {
      for (const b of live) if (b.id === id) { b.el.textContent = text; b.left = secs; b.el.className = 'od-bubble ' + tone; b.w = 0; return b; }
      if (live.length >= MAX) { const old = live.shift(); old.el.remove(); }
      const el = document.createElement('div'); el.className = 'od-bubble ' + tone; el.textContent = text;
      parent.append(el);
      const b = { id, el, left: secs, w: 0, h: 0 }; live.push(b);
      return b;
    },
    clear() { for (const b of live) b.el.remove(); live.length = 0; },
    update(dt, spotOf) {
      const items = [];
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i]; b.left -= dt;
        const q = spotOf(b.id);
        if (b.left <= 0 || !q) { b.el.remove(); live.splice(i, 1); }
      }
      for (const b of live) {
        const q = spotOf(b.id), s = project(q.x, q.y + 2.1, q.z, v);
        if (!s) { b.el.style.visibility = 'hidden'; b.vis = false; continue; }
        b.el.style.visibility = ''; b.vis = true;
        if (!b.w) { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; }
        items.push({ x: s.x, y: s.y, w: b.w, h: b.h, b });
      }
      const placed = declutter(items, innerWidth);
      items.forEach((it, i) => { const y = Math.max(58 + it.h, it.y + placed[i].lift); it.b.el.style.transform = `translate(${Math.round(placed[i].x - it.w / 2)}px, ${Math.round(y - it.h)}px)`; });
    },
  };
}
