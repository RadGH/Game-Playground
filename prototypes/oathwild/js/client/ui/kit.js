// The window kit: every in-game window and menu is one of these (one framed panel, a header with the title and a
// close button, optional tabs, ONE scroller, an optional footer). Windows stack; Esc / the pad's B / the × close the
// top one. One window per id: opening it again redraws it in place (and keeps its scroll — lessons rule 12).
//
//   const w = openWin({ id: 'bag', title: 'Bag', size: 'wide', tabs: [{ id: 'all', label: 'All' }], render: (body, tab, w) => …, foot })
//   w.render()  redraw (keeps scroll) · w.close() · w.setTab(id) · w.el / w.body
//   toast(text, kind)  a short message near the top (two at most; the same text never twice at once — rule 42)
import { glyph } from './icons.js';

const stack = [];
let escInstalled = false;
const listeners = new Set();
export const windowsOpen = () => stack.length;
export const topWin = () => stack[stack.length - 1] || null;
export const findWin = id => stack.find(w => w.id === id) || null;
export function onWindows(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const changed = () => { for (const fn of listeners) { try { fn(stack.length); } catch (e) { console.error(e); } } };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function openWin({ id, title: heading = '', sub = '', cls = '', size = '', tabs = null, tab = null, render, foot = null, onClose = null, clear = false, focus = true }) {
  const old = id && findWin(id);
  if (old) { if (tab) old.tab = tab; old.heading = heading; old.render(); return old; }
  if (!escInstalled) {
    escInstalled = true;
    addEventListener('keydown', e => {
      if (e.code !== 'Escape' || !stack.length) return;
      if (document.querySelector('.gdlg, .wn-modal, .cr-modal, .rgs-signin')) return;   // a shared dialog handles its own Esc
      e.preventDefault(); e.stopPropagation(); topWin()?.close();
    }, true);
  }
  const shade = document.createElement('div');
  shade.className = 'ow-shade' + (clear ? ' ow-clear' : '');
  const el = document.createElement('section');
  el.className = `ow-win ${size ? 'ow-' + size : ''} ${cls}`.trim();
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', heading);
  shade.append(el);
  const w = {
    id, el, shade, tab: tab || tabs?.[0]?.id || null, tabs, heading, sub, body: null, footEl: null, data: {},
    render() {
      const keep = w.body ? w.body.scrollTop : 0;
      const sameTab = w._lastTab === w.tab;
      el.innerHTML = `<header class="ow-win-head"><h2>${esc(w.heading)}</h2>${w.sub ? `<span class="ow-win-sub">${esc(w.sub)}</span>` : ''}<button type="button" class="ow-x" data-close aria-label="Close">${glyph('x', 22)}</button></header>`
        + (w.tabs ? `<nav class="ow-tabs" role="tablist">${w.tabs.map(t => `<button type="button" class="ow-tab" role="tab" data-tab="${esc(t.id)}" aria-selected="${t.id === w.tab}">${t.icon || ''}${esc(t.label)}${t.badge ? `<span class="ow-badge">${esc(t.badge)}</span>` : ''}</button>`).join('')}</nav>` : '')
        + '<div class="ow-win-body"></div>' + (foot ? '<footer class="ow-win-foot"></footer>' : '');
      w.body = el.querySelector('.ow-win-body');
      w.footEl = el.querySelector('.ow-win-foot');
      el.querySelector('[data-close]').onclick = () => w.close();
      el.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { w.tab = b.dataset.tab; w.render(); }; });
      const html = render?.(w.body, w.tab, w);
      if (typeof html === 'string') w.body.innerHTML = html;
      if (foot && w.footEl) { const f = typeof foot === 'function' ? foot(w.footEl, w) : foot; if (typeof f === 'string') w.footEl.innerHTML = f; }
      w.body.scrollTop = sameTab ? keep : 0;
      w._lastTab = w.tab;
      w.onRender?.(w);
    },
    setTab(t) { w.tab = t; w.render(); },
    close() {
      const i = stack.indexOf(w);
      if (i < 0) return;
      stack.splice(i, 1);
      shade.remove();
      onClose?.(w);
      changed();
    },
    get open() { return stack.includes(w); },
  };
  shade.addEventListener('pointerdown', e => { if (e.target === shade && !clear) w.close(); });
  stack.push(w);
  document.body.append(shade);
  w.render();
  if (focus) {
    // the first useful control gets the focus, never the close button (lessons rule 27)
    const first = el.querySelector('.ow-win-body [data-primary], .ow-win-body button:not([disabled]), .ow-win-foot .ow-primary, .ow-win-body input');
    first?.focus?.({ preventScroll: true });
  }
  changed();
  return w;
}

export function closeAll() { for (const w of [...stack].reverse()) w.close(); }

// ---- toasts
let toastBox = null;
const live = new Map();
export function toast(text, kind = 'info', ms = 2600) {
  if (!text) return;
  if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'ow-toasts'; toastBox.setAttribute('role', 'status'); document.body.append(toastBox); }
  if (live.has(text)) { const t = live.get(text); clearTimeout(t.timer); t.timer = setTimeout(() => drop(text), ms); return; }
  while (toastBox.children.length >= 2) { const first = toastBox.firstElementChild; live.delete(first.dataset.text); first.remove(); }
  const el = document.createElement('div');
  el.className = `ow-toast ${kind}`;
  el.textContent = text;
  el.dataset.text = text;
  toastBox.append(el);
  live.set(text, { el, timer: setTimeout(() => drop(text), ms) });
  function drop(t) { const x = live.get(t); if (!x) return; live.delete(t); x.el.remove(); }
}

/** Styled in-game questions (shared/dialog.js ask / tell / askText; promise based, never a browser popup). */
export { ask, tell, askText } from '../../../../../shared/dialog.js';
