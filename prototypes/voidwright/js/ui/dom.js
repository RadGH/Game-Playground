// Tiny DOM helpers shared by every screen.

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
export const btn = (label, fn, cls = '') => el('button', { class: cls, onclick: (e) => { e.stopPropagation(); fn(e); } }, label);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
import { fmt as fmtD } from '../../../../shared/format.js';
/** Distance in km (world units are metres): "1.5 km". */
export const km = v => `${fmtD((v || 0) / 1000, { decimals: 1 })} km`;
export const fmt = n => { n = Math.round(n || 0); return Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k' : n.toLocaleString(); };
export const pct = v => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;

export function toast(text, kind = '', color = null) {
  const box = $('#toasts'); if (!box) return;
  // the same message already on screen: keep the one card and restart its clock instead of stacking copies
  const same = [...box.children].find(c => c.dataset.text === String(text));
  if (same) { clearTimeout(same._t); same._t = setTimeout(() => same.remove(), 3700); box.append(same); same.style.animation = 'none'; void same.offsetWidth; same.style.animation = ''; return; }
  const t = el('div', { class: `toast ${kind}`, style: color ? `color:${color};border-color:${color}` : null }, text);
  t.dataset.text = String(text);
  box.append(t); t._t = setTimeout(() => t.remove(), 3700);
  while (box.children.length > 4) box.firstChild.remove();
}
let bannerT = null;
export function banner(title, text = '', news = []) {
  const b = $('#banner'); if (!b) return;
  b.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${news.length ? `<p class="new">New: ${news.map(esc).join(' · ')}</p>` : ''}`;
  b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.add('hidden'), 4600);
}

/** A full-screen panel with a header (title + close). Returns { root, body, head, close }. */
export function panel(title, onClose, opts = {}) {
  const root = el('div', { class: 'panel-full' + (opts.cls ? ' ' + opts.cls : '') });
  const head = el('div', { class: 'panel-head' }, el('h2', {}, title), el('div', { class: 'grow' }));
  const close = () => { root.remove(); onClose?.(); };
  if (!opts.noClose) head.append(btn(opts.closeLabel || 'Close', close, 'primary'));
  const body = el('div', { class: 'panel-body' });
  root.append(head, body);
  $('#panels').append(root);
  return { root, body, head, close };
}
export function modal(title, build, opts = {}) {
  const back = el('div', { class: 'modal-back' }); const m = el('div', { class: 'modal' }, el('h2', {}, title));
  back.append(m); $('#panels').append(back);
  const close = () => { back.remove(); opts.onClose?.(); };
  if (!opts.sticky) back.addEventListener('click', e => { if (e.target === back) close(); });
  build(m, close);
  return { close, m };
}

/** Hover tooltips: data-tipfn on an element → a function returning HTML. */
let tipEl = null;
export function tip(target, html) {
  target.addEventListener('mouseenter', () => { tipEl?.remove(); tipEl = el('div', { class: 'tip', html: typeof html === 'function' ? html() : html }); document.body.append(tipEl); });
  target.addEventListener('mousemove', e => { if (!tipEl) return; const x = Math.min(innerWidth - tipEl.offsetWidth - 8, e.clientX + 14), y = Math.min(innerHeight - tipEl.offsetHeight - 8, e.clientY + 14); tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px'; });
  target.addEventListener('mouseleave', () => { tipEl?.remove(); tipEl = null; });
}
export const clearTip = () => { tipEl?.remove(); tipEl = null; };

/** A sideways row of tabs on a phone: keep the selected one in view after a redraw. */
export function showSelected(row) { requestAnimationFrame(() => { const on = row.querySelector('.on'); if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - 16); }); return row; }
