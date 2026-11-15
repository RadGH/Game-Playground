// Small DOM helpers (from Spirehold's ui/dom.js). The game's own sheets carry `modal` for the controller (padnav walks
// the top `.modal`) and `gr-modal` for their look, so shared overlays that also use `modal` keep their own styling.
export const $ = (s, root = document) => root.querySelector(s);
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
export const btn = (label, fn, cls = '', attrs = {}) => el('button', { type: 'button', class: cls, ...attrs, onclick: e => { e.stopPropagation(); fn(e); } }, label);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function toast(text, kind = '') {
  const box = $('#toasts'); if (!box) return;
  const same = [...box.children].find(c => c.dataset.text === String(text));
  if (same) { clearTimeout(same._t); same._t = setTimeout(() => same.remove(), 3500); return; }
  const t = el('div', { class: `toast ${kind}` }, text); t.dataset.text = String(text);
  box.append(t); t._t = setTimeout(() => t.remove(), 3500);
  while (box.children.length > 3) box.firstChild.remove();
}
let bannerT = null;
export function banner(title, text = '', ms = 1800) {
  const b = $('#banner'); if (!b) return;
  b.className = 'banner'; b.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}`;
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.add('hidden'), ms);
}
export const hideBanner = () => { clearTimeout(bannerT); $('#banner')?.classList.add('hidden'); };

/** One of the game's sheets (menu, settings…). Esc / B / a click outside closes it. */
export function sheet(title, build, opts = {}) {
  const back = el('div', { class: 'modal-back' }); const m = el('div', { class: 'modal gr-modal', role: 'dialog', 'aria-label': title }, el('h2', {}, title));
  back.append(m); $('#panels').append(back);
  let closed = false;
  const close = () => { if (closed) return; closed = true; back.remove(); opts.onClose?.(); };
  back._close = close;
  back.addEventListener('click', e => { if (e.target === back) close(); });
  build(m, close);
  setTimeout(() => m.querySelector('button')?.focus({ preventScroll: true }), 0);
  return { close, m };
}
export const topSheet = () => [...document.querySelectorAll('#panels .modal-back')].pop() || null;
export function closeTopSheet() { const s = topSheet(); if (s) { s._close?.(); return true; } return false; }
