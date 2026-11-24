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

// ---- keep the view across a re-render: scroll positions of every scroller + the focused control, by a stable key
function viewKey(node, root) {
  if (node.dataset?.scrollKey) return 'k:' + node.dataset.scrollKey;
  const parts = [];
  for (let n = node; n && n !== root; n = n.parentElement) {
    const cls = [...n.classList].filter(c => !/^(pad-focus|is-|ow-on)/.test(c)).sort().join('.');
    const data = n.dataset ? Object.entries(n.dataset).filter(([k]) => !/^(scrollKey)$/.test(k)).map(([k, v]) => `${k}=${v}`).sort().join(',') : '';
    const same = n.parentElement ? [...n.parentElement.children].filter(c => c.tagName === n.tagName && c.className === n.className) : [];
    parts.push(`${n.tagName}.${cls}[${data}]#${same.indexOf(n)}`);
  }
  return parts.reverse().join('>');
}
function keepView(root) {
  const scrolls = [];
  for (const n of root.querySelectorAll('*')) if (n.scrollTop || n.scrollLeft) scrolls.push([viewKey(n, root), n.scrollTop, n.scrollLeft]);
  const f = document.activeElement && root.contains(document.activeElement) ? viewKey(document.activeElement, root) : null;
  return { scrolls, focus: f };
}
function restoreView(root, kept) {
  if (!kept.scrolls.length && !kept.focus) return;
  const byKey = new Map();
  for (const n of root.querySelectorAll('*')) byKey.set(viewKey(n, root), n);
  for (const [k, top, left] of kept.scrolls) { const n = byKey.get(k); if (n) { n.scrollTop = top; n.scrollLeft = left; } }
  if (kept.focus) byKey.get(kept.focus)?.focus?.({ preventScroll: true });
}

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
      // a re-render keeps the player where they were (lessons rule: windows never jump back to the start): every
      // scroller in the window — the body and any inner list or tree, up/down AND sideways — and the focused control
      const sameTab = w._lastTab === w.tab;
      const kept = sameTab ? keepView(el) : null;
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
      if (kept) restoreView(el, kept); else w.body.scrollTop = 0;
      w._lastTab = w.tab;
      w.onRender?.(w);
    },
    setTab(t) { w.tab = t; w.render(); },
    /** Re-render on an app event only when what the window shows changed (`sig` = a string of that state). */
    follow(app, type, sig) { let last = sig(); const off = app.on(type, () => { if (!w.open) { off(); return; } const s = sig(); if (s !== last) { last = s; w.render(); } }); return off; },
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
