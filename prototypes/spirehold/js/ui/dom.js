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
export const btn = (label, fn, cls = '', attrs = {}) => el('button', { class: cls, ...attrs, onclick: (e) => { e.stopPropagation(); fn(e); } }, label);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UNITS = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
/** Big numbers the short way: 1,234 · 12.3k · 4.56M … 1.2e40 past the named units. */
export function fmt(n) {
  n = +n || 0; const neg = n < 0; n = Math.abs(n);
  if (n < 10000) return (neg ? '-' : '') + (n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toLocaleString());
  const e = Math.floor(Math.log10(n) / 3); if (e >= UNITS.length) return (neg ? '-' : '') + n.toExponential(2);
  const v = n / Math.pow(1000, e); return (neg ? '-' : '') + (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + UNITS[e];
}
export const pct = v => `${Math.round(v * 100)}%`;
export function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60); return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}
export function toast(text, kind = '') {
  const box = $('#toasts'); if (!box) return;
  const same = [...box.children].find(c => c.dataset.text === String(text));
  if (same) { clearTimeout(same._t); same._t = setTimeout(() => same.remove(), 4000); return; }
  const t = el('div', { class: `toast ${kind}` }, text); t.dataset.text = String(text);
  box.append(t); t._t = setTimeout(() => t.remove(), 4000);
  while (box.children.length > 4) box.firstChild.remove();
}
let bannerT = null;
export function banner(title, text = '', cls = '') {
  const b = $('#banner'); if (!b) return;
  b.className = 'banner ' + cls; b.innerHTML = `<h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}`;
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.add('hidden'), 4400);
}
export function modal(title, build, opts = {}) {
  const back = el('div', { class: 'modal-back' }); const m = el('div', { class: 'modal' }, el('h2', {}, title));
  back.append(m); $('#panels').append(back);
  const close = () => { back.remove(); opts.onClose?.(); };
  if (!opts.sticky) back.addEventListener('click', e => { if (e.target === back) close(); });
  build(m, close);
  return { close, m };
}
let tipEl = null;
export function tip(target, html) {
  if (matchMedia('(pointer: coarse)').matches) return;
  target.addEventListener('mouseenter', () => { tipEl?.remove(); tipEl = el('div', { class: 'tip', html: typeof html === 'function' ? html() : html }); document.body.append(tipEl); });
  target.addEventListener('mousemove', e => { if (!tipEl) return; tipEl.style.left = Math.min(innerWidth - tipEl.offsetWidth - 8, e.clientX + 14) + 'px'; tipEl.style.top = Math.min(innerHeight - tipEl.offsetHeight - 8, e.clientY + 14) + 'px'; });
  target.addEventListener('mouseleave', () => { tipEl?.remove(); tipEl = null; });
}
export const clearTip = () => { tipEl?.remove(); tipEl = null; };
