// Small DOM helpers: elements, modals, toasts, banners.

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const stack = [];
/** Open a modal. buttons: [{ label, cls, onClick, keep }] — a button closes the modal unless keep. */
export function modal({ title, body = [], buttons = [], row = false, onClose, cls = '' }) {
  const root = document.getElementById('modal-root');
  const box = el('div', { class: 'modal ' + cls, role: 'dialog', 'aria-modal': 'true' });
  if (title) box.append(el('h2', { text: title }));
  const b = el('div', { class: 'body' });
  for (const x of [].concat(body)) if (x != null) b.append(typeof x === 'string' ? el('p', { html: x }) : x);
  box.append(b);
  const bar = el('div', { class: 'buttons' + (row ? ' row' : '') });
  const back = el('div', { class: 'modal-back' }, box);
  let closed = false;
  const close = (why) => {
    if (closed) return;
    closed = true;
    back.remove();
    const k = stack.indexOf(close);
    if (k >= 0) stack.splice(k, 1);
    onClose?.(why);
  };
  for (const btn of buttons) {
    const e = el('button', { class: btn.cls || 'big', 'data-close': btn.close ? '' : null }, btn.label);
    e.addEventListener('click', () => { const r = btn.onClick?.(); if (!btn.keep && r !== false) close('button'); });
    bar.append(e);
  }
  if (buttons.length) box.append(bar);
  back.addEventListener('pointerdown', (e) => { if (e.target === back && !cls.includes('sticky')) close('outside'); });
  root.append(back);
  stack.push(close);
  return { close, box, body: b };
}
export const topModal = () => stack[stack.length - 1] || null;
export const anyModal = () => stack.length > 0 || !!document.querySelector('.modal-back, .rgs-signin-back, .whatsnew-back');

let toastBox = null;
export function toast(text, kind = '', ms = 2600) {
  toastBox ||= document.getElementById('toasts');
  if (!toastBox) return;
  const t = el('div', { class: 'toast ' + kind, html: text });
  t.addEventListener('pointerdown', () => t.remove());
  toastBox.append(t);
  while (toastBox.children.length > 2) toastBox.firstChild.remove();
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 450);
}
let bannerT = 0;
export function banner(text, ms = 1800) {
  const b = document.getElementById('banner');
  b.textContent = text;
  b.classList.remove('hidden');
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerT);
  bannerT = setTimeout(() => b.classList.add('hidden'), ms);
}
export function show(id, on = true) { document.getElementById(id)?.classList.toggle('hidden', !on); }
