// Small UI kit every Wyrmroad screen uses: element helpers, sheets (the windows that open over a screen — Esc / B /
// the × close them, one scroller each), and the corner ☰ button. Styles: css/wyrmroad.css (.wr-*).
import { icon } from './icons.js';
import { esc } from './text.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** A button's html: icon + label (+ the key it answers to, rule 18). */
export function btn(label, { ic = null, cls = '', act = '', key = '', attrs = '' } = {}) {
  return `<button type="button" class="wr-btn ${cls}" ${act ? `data-act="${act}"` : ''} ${attrs}>${ic ? icon(ic) : ''}<span>${esc(label)}</span>${key ? `<kbd>${esc(key)}</kbd>` : ''}</button>`;
}

const sheets = [];
/**
 * Open a sheet over the current screen. body = html. Returns { el, body, close }. onClose runs once when it closes.
 * wide: a big window (inventory, peddler); the sheet's .wr-sheet-body is its only scroller.
 */
export function openSheet({ title, body = '', cls = '', onClose = null, wide = false, closeLabel = 'Close' } = {}) {
  const el = document.createElement('div');
  el.className = `wr-sheet ${wide ? 'wr-sheet-wide' : ''} ${cls}`;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title || 'Window');
  el.innerHTML = `<div class="wr-sheet-card"><header class="wr-sheet-head"><h2>${esc(title || '')}</h2><button type="button" class="wr-x" data-close aria-label="${esc(closeLabel)}">${icon('close')}</button></header><div class="wr-sheet-body">${body}</div></div>`;
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    el.remove(); const i = sheets.indexOf(api); if (i >= 0) sheets.splice(i, 1);
    try { onClose?.(); } catch (e) { console.error(e); }
  };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
  document.body.append(el);
  const api = { el, body: el.querySelector('.wr-sheet-body'), close, get closed() { return closed; } };
  sheets.push(api);
  setTimeout(() => (el.querySelector('.wr-sheet-body button, .wr-sheet-body input, .wr-sheet-body textarea') || el.querySelector('.wr-x'))?.focus({ preventScroll: true }), 30);
  return api;
}
export const topSheet = () => sheets[sheets.length - 1] || null;
// Esc closes the top sheet wherever the focus is (a redraw inside a sheet drops focus to the page); a shared dialog
// (.modal) on top handles its own Esc first.
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !sheets.length || document.querySelector('.modal')) return;
  e.preventDefault(); e.stopImmediatePropagation(); topSheet().close();
}, { capture: true });
export const anySheet = () => sheets.length > 0 || !!document.querySelector('.modal');
export function closeAllSheets() { for (const s of [...sheets]) s.close(); }

/** A short line that appears at the bottom of the screen for a moment (menus only; the HUD has its own toasts). */
export function note(text, kind = '') {
  let box = $('#wr-note');
  if (!box) { box = document.createElement('div'); box.id = 'wr-note'; box.setAttribute('role', 'status'); document.body.append(box); }
  box.className = `wr-note show ${kind}`; box.textContent = text;
  clearTimeout(note.t); note.t = setTimeout(() => box.classList.remove('show'), 2600);
}

// While a window is open, everything under it is hidden from screen readers (and from the screen-text checks):
// the screen (#ui) and any lower window. Shared windows (.modal: dialogs, What's new, credits, sign-in) count too.
const layering = () => {
  const layers = [...document.querySelectorAll('body > .wr-sheet, body > .modal, body > .rgs-signin')];
  const ui = document.getElementById('ui');
  if (ui) { if (layers.length) ui.setAttribute('aria-hidden', 'true'); else ui.removeAttribute('aria-hidden'); }
  layers.forEach((el, i) => { if (i < layers.length - 1) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden'); });
};
new MutationObserver(layering).observe(document.body, { childList: true });
