// The sign-in box and account button every game on games.radgh.com can drop in. Made for Radley Sustaire's games.
//
//   import { openSignIn, accountButton } from '../../shared/rgs-signin.js';
//   const user = await openSignIn({ game: 'knockabout', gameName: 'Knockabout' });   // user, or null for "Not now"
//   topBar.append(accountButton({ game: 'knockabout', gameName: 'Knockabout', onChange: u => … }));
//
// Signing in is optional: the box always has "Not now", and Esc / the browser's back button close it.
// The box offers three ways in: scan a QR code with a phone that is already signed in, type a username (or email)
// and password, or make a new account. Thousandvale accounts work as they are.
//
// The box's root carries the class `modal` and its close buttons `data-close`, so a game's own controller menu
// navigation (Tumblefair's padnav.js) walks it like any other sheet. Styles: rgs-signin.css, loaded on first use.
import { account } from './rgs-account.js';

const QR_LIB = new URL('../vendor/qrcode-generator/qrcode.js', import.meta.url).href;
const CSS = new URL('./rgs-signin.css', import.meta.url).href;

function loadCss() {
  if (document.querySelector(`link[data-rgs-signin]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = CSS; l.dataset.rgsSignin = '';
  document.head.append(l);
}

let qrLoading = null;
const qrLib = () => qrLoading || (qrLoading = new Promise((res, rej) => {
  if (window.qrcode) return res(window.qrcode);
  const s = document.createElement('script');
  s.src = QR_LIB; s.onload = () => res(window.qrcode); s.onerror = () => { qrLoading = null; rej(new Error('qr')); };
  document.head.append(s);
}));
/** A QR code for `text` as SVG markup (dark on white, with the quiet border scanners need). */
export async function qrSvg(text) {
  const qrcode = await qrLib(), q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}

/** Tiny element helper: h('div.a.b', { attr }, ...children) */
function h(spec, attrs = {}, ...kids) {
  const [tag, ...cls] = spec.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) el.append(k);
  return el;
}
/** Tell the player, as they type, whether a username is free. Never blocks the form: the server has the last word. */
export function liveNameCheck(input, hint) {
  const plain = hint.textContent;
  let t = 0, seq = 0;
  input.addEventListener('input', () => {
    clearTimeout(t);
    const v = input.value.trim(), my = ++seq;
    hint.classList.remove('rgs-bad', 'rgs-good'); hint.textContent = plain;
    if (!v) return;
    if (!/^[A-Za-z0-9._-]{3,20}$/.test(v)) { hint.textContent = plain; hint.classList.add('rgs-bad'); return; }
    t = setTimeout(async () => {
      const r = await account.usernameFree(v);
      if (my !== seq || !r) return;
      hint.textContent = r.free ? `${r.name || v} is free.` : `${r.name || v} is already taken.`;
      hint.classList.add(r.free ? 'rgs-good' : 'rgs-bad');
    }, 350);
  });
}
const field = (label, input) => h('label.rgs-field', {}, h('span', { text: label }), input);

let open = null;   // only one box at a time

/**
 * Show the sign-in box. Resolves to the signed-in user, or null if the player chose "Not now".
 * Options: game (the id the server knows, e.g. 'tumblefair'), gameName (shown to the phone), mode ('signin'|'signup').
 */
export function openSignIn({ game = 'site', gameName = '', mode = 'signin' } = {}) {
  if (open) return open.promise;
  loadCss();
  let finish;
  const promise = new Promise(res => { finish = res; });
  let pairing = null, closed = false, timer = 0;
  const lastFocus = document.activeElement;

  // ----- the two forms -----
  const err = h('p.rgs-error', { role: 'alert', 'aria-live': 'polite' });
  const inLogin = h('input', { name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, id: 'rgs-in-login' });
  const inPass = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true, id: 'rgs-in-pass' });
  const inBtn = h('button.rgs-primary', { type: 'submit', text: 'Sign in' });
  const signinForm = h('form.rgs-form', { 'data-form': 'signin', novalidate: true, onsubmit: e => { e.preventDefault(); doSignIn(); } },
    field('Username or email', inLogin), field('Password', inPass), inBtn);

  const upName = h('input', { name: 'username', type: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, maxlength: '20', id: 'rgs-up-name' });
  const upPass = h('input', { name: 'new-password', type: 'password', autocomplete: 'new-password', required: true, minlength: '8', id: 'rgs-up-pass' });
  const upEmail = h('input', { name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', id: 'rgs-up-email' });
  const upBtn = h('button.rgs-primary', { type: 'submit', text: 'Create account' });
  const nameHint = h('p.rgs-hint', { 'data-name-check': '', 'aria-live': 'polite', text: '3 to 20 letters, numbers, dots, dashes or underscores.' });
  liveNameCheck(upName, nameHint);
  const signupForm = h('form.rgs-form', { 'data-form': 'signup', novalidate: true, hidden: true, onsubmit: e => { e.preventDefault(); doSignUp(); } },
    field('Username', upName), nameHint,
    field('Password', upPass), h('p.rgs-hint', { text: 'At least 8 characters.' }),
    field('Email (optional)', upEmail), h('p.rgs-hint', { text: 'Only used to reset a forgotten password.' }),
    upBtn);

  const tabIn = h('button.rgs-tab', { type: 'button', 'data-tab': 'signin', text: 'Sign in', onclick: () => show('signin') });
  const tabUp = h('button.rgs-tab', { type: 'button', 'data-tab': 'signup', text: 'Create an account', onclick: () => show('signup') });
  function show(which) {
    signinForm.hidden = which !== 'signin'; signupForm.hidden = which !== 'signup';
    tabIn.setAttribute('aria-pressed', which === 'signin'); tabUp.setAttribute('aria-pressed', which === 'signup');
    err.textContent = '';
    title.textContent = which === 'signup' ? 'Create an account' : 'Sign in';
  }

  // ----- the QR side -----
  const qrBox = h('div.rgs-qr-img', { 'aria-hidden': 'false' }, h('span.rgs-qr-wait', { text: 'Loading…' }));
  const checkWord = h('b.rgs-check', { 'data-check': '' });
  const qrState = h('p.rgs-qr-state', { 'aria-live': 'polite' });
  const qrRetry = h('button.rgs-link', { type: 'button', hidden: true, text: 'Try again', onclick: () => startPair() });
  const qrSide = h('section.rgs-qr', { 'aria-label': 'Sign in with your phone' },
    h('h3', { text: 'Scan with your phone to sign in' }),
    qrBox,
    h('p.rgs-check-line', {}, 'Your phone will show the word ', checkWord, ' — check that it matches.'),
    qrState, qrRetry);

  const title = h('h2', { id: 'rgs-signin-title', text: 'Sign in' });
  const root = h('div.rgs-signin.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rgs-signin-title', 'data-rgs-signin': '' },
    h('div.rgs-card', {},
      h('header.rgs-head', {}, title, h('button.rgs-x', { type: 'button', 'data-close': '', 'aria-label': 'Close', text: '×', onclick: () => close(null) })),
      h('p.rgs-lead', { text: `Optional — sign in to keep your progress${gameName ? ` in ${gameName}` : ''} with your account and use one name in every game.` }),
      h('div.rgs-cols', {},
        h('section.rgs-forms', {}, h('div.rgs-tabs', { role: 'group' }, tabIn, tabUp), err, signinForm, signupForm),
        qrSide),
      h('p.rgs-note', { text: 'Thousandvale accounts work here too — same username and password.' }),
      h('div.rgs-foot', {}, h('button.rgs-later', { type: 'button', 'data-close': '', text: 'Not now', onclick: () => close(null) }))));

  // ----- actions -----
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }
  async function doSignIn() {
    err.textContent = '';
    if (!inLogin.value.trim() || !inPass.value) { err.textContent = 'Enter your username (or email) and password.'; return; }
    busy(inBtn, true, 'Signing in…');
    try { close(await account.signIn(inLogin.value, inPass.value)); }
    catch (e) { err.textContent = e.message; inPass.select?.(); }
    finally { busy(inBtn, false, 'Sign in'); }
  }
  async function doSignUp() {
    err.textContent = '';
    if (!upName.value.trim() || !upPass.value) { err.textContent = 'Pick a username and a password.'; return; }
    if (upPass.value.length < 8) { err.textContent = account.message('weak_password'); return; }
    busy(upBtn, true, 'Creating…');
    try { close(await account.signUp({ username: upName.value, password: upPass.value, email: upEmail.value })); }
    catch (e) { err.textContent = e.message; }
    finally { busy(upBtn, false, 'Create account'); }
  }
  async function startPair(note = '') {
    pairing?.cancel(); pairing = null; clearTimeout(timer);
    qrRetry.hidden = true; qrState.textContent = note; checkWord.textContent = '····';
    qrBox.replaceChildren(h('span.rgs-qr-wait', { text: 'Loading…' }));
    let p;
    try { p = await account.pair(game); }
    catch (e) {
      if (closed) return;
      qrBox.replaceChildren(h('span.rgs-qr-wait', { text: 'Not available' }));
      qrState.textContent = "Phone sign-in isn't available right now.";
      qrRetry.hidden = false; return;
    }
    if (closed) { p.cancel(); return; }
    pairing = p;
    checkWord.textContent = p.check;
    qrBox.dataset.url = p.url;
    try { qrBox.innerHTML = await qrSvg(p.url); }
    catch { qrBox.replaceChildren(h('a.rgs-qr-wait', { href: p.url, target: '_blank', rel: 'noopener', text: 'Open on your phone' })); }
    const user = await p.done;
    if (closed || pairing !== p) return;
    if (user) { qrState.textContent = 'Signed in.'; close(user); return; }
    if (p.result === 'denied') startPair('The phone said no. Here is a new code.');
    else if (p.result === 'expired') startPair('That code expired. Here is a new one.');
  }

  // ----- open / close -----
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); return; }
    if (e.key === 'Tab') {   // keep the keyboard inside the box
      const f = [...root.querySelectorAll('button:not([disabled]), input, a[href]')].filter(el => el.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function onPop() { if (!closed) close(null, { fromHistory: true }); }
  function close(user, { fromHistory = false } = {}) {
    if (closed) return;
    closed = true; open = null;
    pairing?.cancel(); clearTimeout(timer);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('popstate', onPop);
    root.remove();
    if (!fromHistory && history.state?.rgsSignin) history.back();
    try { lastFocus?.focus?.({ preventScroll: true }); } catch { /* gone */ }
    finish(user || null);
  }
  root.addEventListener('click', e => { if (e.target === root) close(null); });
  document.addEventListener('keydown', onKey, true);
  try { history.pushState({ ...(history.state || {}), rgsSignin: true }, ''); window.addEventListener('popstate', onPop); } catch { /* sandboxed */ }

  document.body.append(root);
  show(mode === 'signup' ? 'signup' : 'signin');
  // don't pop a phone keyboard up over the box; on a desktop, start in the first field
  if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => (mode === 'signup' ? upName : inLogin).focus(), 30);
  startPair();
  open = { promise };
  return promise;
}

/**
 * A small account control for a game's top bar: "Sign in" when signed out; the username with a menu (Your account,
 * Sign out) when signed in. onChange(user|null) is called whenever that changes, including the first check.
 */
export function accountButton({ game = 'site', gameName = '', onChange } = {}) {
  loadCss();
  const root = h('div.rgs-acct', { 'data-rgs-account': '' });
  const btn = h('button.rgs-acct-btn', { type: 'button', 'aria-haspopup': 'false' });
  const menu = h('div.rgs-acct-menu', { hidden: true, role: 'menu' });
  root.append(btn, menu);
  let user = null;

  function draw(u) {
    user = u;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (!u) {
      btn.replaceChildren('Sign in');
      btn.setAttribute('aria-haspopup', 'false');
      btn.title = 'Sign in (optional)';
      return;
    }
    const name = u.username || u.name || u.email || 'Account';
    btn.replaceChildren(h('span.rgs-dot', { 'aria-hidden': 'true', text: name.slice(0, 1).toUpperCase() }), h('span.rgs-name', { text: name }), h('span.rgs-caret', { 'aria-hidden': 'true', text: '▾' }));
    btn.setAttribute('aria-haspopup', 'menu');
    btn.title = `Signed in as ${name}`;
    menu.replaceChildren(
      h('p.rgs-acct-who', { text: `Signed in as ${name}` }),
      h('a.rgs-acct-item', { role: 'menuitem', href: account.accountUrl, target: '_blank', rel: 'noopener', text: 'Your account' }),
      h('button.rgs-acct-item', { type: 'button', role: 'menuitem', 'data-act': 'signout', text: 'Sign out', onclick: async () => { menu.hidden = true; await account.signOut(); } }));
  }
  btn.addEventListener('click', () => {
    if (!user) { openSignIn({ game, gameName }); return; }
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', e => { if (!root.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { menu.hidden = true; btn.focus(); } });

  let told;   // the id last passed to onChange, so the first check is reported once
  const update = u => { draw(u); const id = u ? u.id : null; if (id !== told) { told = id; onChange?.(u); } };
  account.onChange(update);
  btn.replaceChildren('Sign in');
  account.user().then(update);
  return root;
}
