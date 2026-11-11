// In-game dialogs (owner 2026-11-11, a rule for EVERY game: "do not use browser popups with the exception of displaying
// copyable URLs or other codes; this popup should be an in-game stylized popup"). Never call window.alert / confirm /
// prompt in a game: use these. They are promises, styled by the game (CSS variables, see dialog.css), work with mouse,
// touch, keyboard (Enter = the main button, Esc = cancel, Tab stays inside) and a controller (any pad-nav that walks
// `.modal` buttons, e.g. Tumblefair's padnav.js), and scroll when taller than the screen.
//
//   import { ask, tell, askText, showCode } from '<…>/shared/dialog.js';   (+ <link rel="stylesheet" href="<…>/shared/dialog.css">)
//   if (await ask({ title: 'Salvage?', text: 'Gone for good.', ok: 'Salvage', danger: true })) …
//   await tell({ title: 'Trade ended', text: why });
//   const name = await askText({ title: 'Delete hero', text: 'Type the name to confirm', confirmMatch: hero.name, ok: 'Delete', danger: true });
//   await showCode({ title: 'Invite link', code: url });          // the one place a copyable code belongs
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let open = null;                                     // one dialog at a time; a second waits for the first

function build({ title, text = '', body = '', buttons, onKey }) {
  const root = document.createElement('div'); root.className = 'modal gdlg-modal'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  root.innerHTML = `<div class="gdlg">${title ? `<h2 class="gdlg-title">${esc(title)}</h2>` : ''}${text ? `<p class="gdlg-text">${esc(text)}</p>` : ''}${body}
    <div class="gdlg-btns">${buttons.map((b, i) => `<button type="button" class="gdlg-btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
  document.body.append(root);
  const prev = document.activeElement;
  const focusables = () => [...root.querySelectorAll('button:not([disabled]), input, textarea, select')];
  root.addEventListener('keydown', e => {
    e.stopPropagation();                                   // the game must not act on keys typed into a dialog
    if (e.key === 'Tab') { const f = focusables(); if (!f.length) return; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
    else onKey?.(e);
  });
  for (const ev of ['keyup', 'keypress']) root.addEventListener(ev, e => e.stopPropagation());
  const close = () => { root.remove(); try { prev?.focus?.(); } catch { /* gone */ } };
  return { root, close, focusables };
}
function queue(fn) {
  const run = () => new Promise(res => { open = fn(v => { open = null; res(v); }); });
  return open ? open.then(run) : (open = run());
}

/** Yes / no. Resolves true for the main button, false for Cancel / Esc / a click outside. */
export function ask({ title, text, ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return queue(done => new Promise(res => {
    const d = build({ title, text, buttons: [{ label: cancel, cls: 'gdlg-cancel' }, { label: ok, cls: danger ? 'gdlg-ok gdlg-danger' : 'gdlg-ok' }],
      onKey: e => { if (e.key === 'Escape') finish(false); else if (e.key === 'Enter') finish(true); } });
    const finish = v => { d.close(); res(v); done(v); };
    d.root.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) finish(b.dataset.i === '1'); else if (e.target === d.root) finish(false); });
    d.root.querySelector('.gdlg-ok').focus();
  }));
}
/** A message with one button. */
export function tell({ title, text, ok = 'OK' } = {}) {
  return queue(done => new Promise(res => {
    const d = build({ title, text, buttons: [{ label: ok, cls: 'gdlg-ok' }], onKey: e => { if (e.key === 'Escape' || e.key === 'Enter') finish(); } });
    const finish = () => { d.close(); res(true); done(true); };
    d.root.addEventListener('click', e => { if (e.target.closest('[data-i]') || e.target === d.root) finish(); });
    d.root.querySelector('.gdlg-ok').focus();
  }));
}
/** A line of text. Resolves the text, or null on Cancel. `confirmMatch`: the OK button stays off until that text is typed. */
export function askText({ title, text, value = '', placeholder = '', ok = 'OK', cancel = 'Cancel', danger = false, confirmMatch = null, maxLength = 60 } = {}) {
  return queue(done => new Promise(res => {
    const d = build({ title, text, body: `<input class="gdlg-input" type="text" maxlength="${maxLength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">`,
      buttons: [{ label: cancel, cls: 'gdlg-cancel' }, { label: ok, cls: danger ? 'gdlg-ok gdlg-danger' : 'gdlg-ok' }],
      onKey: e => { if (e.key === 'Escape') finish(null); else if (e.key === 'Enter' && !okBtn.disabled) finish(input.value.trim()); } });
    const input = d.root.querySelector('.gdlg-input'), okBtn = d.root.querySelector('.gdlg-ok');
    const check = () => { okBtn.disabled = confirmMatch != null ? input.value.trim().toLowerCase() !== String(confirmMatch).trim().toLowerCase() : false; };
    input.addEventListener('input', check); check();
    const finish = v => { d.close(); res(v); done(v); };
    d.root.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b && !b.disabled) finish(b.dataset.i === '1' ? input.value.trim() : null); else if (e.target === d.root) finish(null); });
    input.focus(); input.select();
  }));
}
/** A code or link the player copies (the one thing allowed to look like a plain text box). */
export function showCode({ title, text = '', code, ok = 'Done' } = {}) {
  return queue(done => new Promise(res => {
    const d = build({ title, text, body: `<div class="gdlg-code"><input class="gdlg-input" readonly value="${esc(code)}"><button type="button" class="gdlg-copy">Copy</button></div>`,
      buttons: [{ label: ok, cls: 'gdlg-ok' }], onKey: e => { if (e.key === 'Escape' || e.key === 'Enter') finish(); } });
    const input = d.root.querySelector('.gdlg-input'), copy = d.root.querySelector('.gdlg-copy');
    copy.onclick = async () => { try { await navigator.clipboard.writeText(code); } catch { input.select(); document.execCommand?.('copy'); } copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); };
    const finish = () => { d.close(); res(true); done(true); };
    d.root.addEventListener('click', e => { if (e.target.closest('[data-i]') || e.target === d.root) finish(); });
    input.select();
  }));
}
