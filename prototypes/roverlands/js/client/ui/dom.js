// Small DOM helpers every Roverlands screen uses: markup escaping, element building, storage that never throws, and
// the LAYER stack (every full screen and dialog is a layer: the top one owns the controller focus ring and Escape / B).
//
// One rule from Knockabout's gotcha: never a scrolling box inside a panel over the canvas (it blanks WebGL on Android
// Chromium). A layer that may be taller than the screen scrolls AS A WHOLE (.rl-layer is the scroller); panels inside
// never set overflow.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const store = {
  get(k, def = null) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: lasts this visit */ } },
};
export function el(tag, cls = '', html = '') { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
export const fmtTime = ms => {
  if (ms == null || !Number.isFinite(ms)) return '–:––';
  const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};
export const isTouch = () => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;

/** The layer stack. push(el, { onBack, blocking }) -> close(); top() -> the top layer's record. */
export function createLayers({ onChange = () => {} } = {}) {
  const stack = [];
  function push(node, { onBack = null, blocking = true, kind = 'modal', ownPad = false } = {}) {
    const rec = { el: node, onBack, blocking, kind, ownPad, closed: false };
    stack.push(rec);
    node.classList.add('rl-layer');
    if (!node.isConnected) document.body.append(node);
    onChange();
    rec.close = () => { if (rec.closed) return; rec.closed = true; const i = stack.indexOf(rec); if (i >= 0) stack.splice(i, 1); node.remove(); onChange(); };
    return rec;
  }
  /** Outside dialogs (What's new, sign-in) count as the top layer while they are open. */
  const foreign = () => [...document.querySelectorAll('.wn-modal, .rgs-signin')].filter(e => e.isConnected && e.offsetParent !== null).pop() || null;
  return {
    push,
    top() { const f = foreign(); if (f) return { el: f, foreign: true, blocking: true, onBack: () => (f.querySelector('[data-close], .rgs-x, [aria-label=Close]')?.click()) }; return stack[stack.length - 1] || null; },
    get stack() { return stack; },
    blocking() { return !!foreign() || stack.some(r => r.blocking); },
    closeAll(kind = null) { for (const r of stack.slice().reverse()) if (!kind || r.kind === kind) r.close(); },
    find: kind => stack.find(r => r.kind === kind) || null,
  };
}
