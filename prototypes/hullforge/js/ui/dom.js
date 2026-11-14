// Small DOM helpers shared by every screen. Numbers go through shared/format.js; tooltips through
// shared/tooltip.js (data-tip / data-tip-render), never the browser's title tooltip.

import { fmt as fmtD } from '../../../../shared/format.js';
import { tip } from '../../../../shared/tooltip.js';

export const $ = (s, root = document) => root.querySelector(s);
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v;
    else if (k === 'tip') tip(e, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
export const btn = (label, fn, cls = '', attrs = {}) => el('button', { class: cls, ...attrs, onclick: e => { e.stopPropagation(); fn(e); } }, label);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Whole numbers with thousands separators ("12,400"). */
export const num = n => fmtD(Math.round(n || 0), { decimals: 0 });
export const dec = (n, d = 1) => fmtD(n || 0, { decimals: d });
export const credits = n => `${num(n)} cr`;
/** Distance: metres up to 1 km, then km with one decimal. */
export const dist = m => (m < 1000 ? `${num(m)} m` : `${fmtD(m / 1000, { decimals: 1 })} km`);

export function toast(text, kind = '', color = null) {
  const box = $('#toasts'); if (!box) return;
  // the same message already on screen: keep the one card and restart its clock instead of stacking copies
  const same = [...box.children].find(c => c.dataset.text === String(text));
  if (same) { clearTimeout(same._t); same._t = setTimeout(() => same.remove(), 3700); box.append(same); return; }
  const t = el('div', { class: `toast ${kind}`, style: color ? `--tc:${color}` : null }, text);
  t.dataset.text = String(text);
  box.append(t); t._t = setTimeout(() => t.remove(), 3700);
  while (box.children.length > 4) box.firstChild.remove();
}
let bannerT = null;
export function banner(title, text = '') {
  const b = $('#banner'); if (!b) return;
  b.replaceChildren(el('h2', {}, title), text ? el('p', {}, text) : '');
  b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.add('hidden'), 4200);
}

/** A full-screen panel with a header. Returns { root, body, head, close }. */
export function panel(title, onClose, opts = {}) {
  const root = el('div', { class: 'panel-full' + (opts.cls ? ' ' + opts.cls : '') });
  const head = el('div', { class: 'panel-head' }, el('h2', {}, title), opts.sub ? el('span', { class: 'sub' }, opts.sub) : '', el('div', { class: 'grow' }));
  const close = () => { root.remove(); onClose?.(); };
  root.closePanel = close;
  if (!opts.noClose) head.append(btn(opts.closeLabel || 'Close', close, 'primary', { 'data-key': 'Esc' }));
  const body = el('div', { class: 'panel-body' });
  root.append(head, body);
  $('#panels').append(root);
  return { root, body, head, close };
}
/** A centred box over everything. */
export function modal(title, build, opts = {}) {
  const back = el('div', { class: 'modal-back' }); const m = el('div', { class: 'modal hf-modal' + (opts.wide ? ' wide' : '') }, el('h2', {}, title));
  back.append(m); $('#panels').append(back);
  const close = () => { back.remove(); opts.onClose?.(); };
  back.closePanel = close;
  if (!opts.sticky) back.addEventListener('click', e => { if (e.target === back) close(); });
  build(m, close);
  return { close, m };
}
/** Tabs: returns { bar, show(id) }; content goes in `host`. Each tab: { id, label, render(host) }. */
export function tabs(host, list, first) {
  const bar = el('div', { class: 'tabs' });
  const body = el('div', { class: 'tab-body' });
  let cur = null;
  const show = id => {
    cur = id; bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
    body.replaceChildren(); body.scrollTop = 0;   // a new tab starts at the top
    list.find(t => t.id === id)?.render(body);
  };
  for (const t of list) { const b = btn(t.label, () => show(t.id)); b.dataset.tab = t.id; bar.append(b); }
  host.append(bar, body);
  show(first || list[0].id);
  return { bar, body, show, get current() { return cur; }, redraw() { const st = body.scrollTop; show(cur); body.scrollTop = st; } };
}
export { tip };
