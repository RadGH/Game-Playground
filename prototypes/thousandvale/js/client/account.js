// Accounts (M3, protocol §16.1): the title screen's "New adventurer" (a guest, no questions) and "Log in" tabs,
// "Forgot password" (a code from the game's keeper — no email is sent), your characters when this browser already
// has an account, the Privacy link; and in the game the Account window: claim a guest (username, password,
// optional email), change the password, log out. Turnstile only when the server asks (welcome.human).
// DOM only; checks in social-core.js; the connection itself is main.js's (startNet / js/net/client.js).

import { claimCheck, ACCOUNT_WHY, PUBLIC_LEVEL } from './social-core.js';
import { createPanel, h } from './ui-panel.js';
import { humanToken } from './turnstile.js';
import { socketFactory } from '../net/sockets.js';
import { PROTOCOL_VERSION } from '../net/protocol.js';

const $ = id => document.getElementById(id);

/**
 * One account op on a fresh, signed-out gateway socket (password reset happens before any login; client.js would
 * make a guest first). Resolves with the accountR.
 */
export function anonAccountOp(op, args, { mode = 'ws', url, build = 'dev', timeoutMs = 10000 } = {}) {
  return new Promise((res, rej) => {
    if (mode !== 'ws') { rej(new Error('Password resets need the online server.')); return; }
    const s = socketFactory('ws', { url })('/gw');
    const t = setTimeout(() => { s.close(); rej(new Error('The server did not answer.')); }, timeoutMs);
    s.onopen = () => s.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, build }));
    s.onmessage = ev => {
      if (typeof ev.data !== 'string') return;
      const m = JSON.parse(ev.data);
      if (m.t === 'welcome') s.send(JSON.stringify({ t: 'account', op, ...args }));
      else if (m.t === 'accountR' || m.t === 'refuse' || m.t === 'err') { clearTimeout(t); s.close(); res(m.t === 'accountR' ? m : { ok: false, msg: m.msg || 'Refused.' }); }
    };
    s.onclose = () => { clearTimeout(t); };
  });
}

/**
 * @param o.net        () => net client (or null on the title screen before connecting)
 * @param o.hud
 * @param o.me         () => { level, name }
 * @param o.netOpts    () => { mode, url, build } for the reset socket
 * @param o.onLogin    (user, pass) => Promise<chars>   main.js connects with connect({ login }) and resolves the list
 * @param o.onPick     (char) => void                   play this character
 * @param o.onLoggedOut () => void
 */
export function createAccount({ net: getNet, hud, me, netOpts, onLogin, onPick, onLoggedOut }) {
  const net = () => getNet();
  const T = {
    tabNew: $('tab-new'), tabLogin: $('tab-login'), newForm: $('login'), signin: $('signin'), user: $('signin-user'), pass: $('signin-pass'),
    note: $('signin-note'), go: $('signin-go'), forgot: $('signin-forgot'), reset: $('reset'), mine: $('mychars'), chips: $('char-chips'), who: $('signin-who'),
  };

  let lastChars = [], lastUser = null;       // the title's character list, for redraws (play-test 2)
  // ---- title: tabs ----
  function tab(which) {
    const login = which === 'login';
    T.tabNew.setAttribute('aria-selected', String(!login)); T.tabLogin.setAttribute('aria-selected', String(login));
    T.newForm.hidden = login; T.signin.hidden = !login;
    (login ? T.user : $('name')).focus();
  }
  T.tabNew.onclick = () => tab('new');
  T.tabLogin.onclick = () => tab('login');
  T.signin.addEventListener('submit', async e => {
    e.preventDefault();
    const user = T.user.value.trim(), pass = T.pass.value;
    if (!user || !pass) { T.note.textContent = 'Type your username and password.'; return; }
    T.note.textContent = ''; T.go.disabled = true; T.go.textContent = 'Logging in…';
    try {
      const chars = await onLogin(user, pass);
      T.pass.value = '';
      showChars(chars, net()?.username || user);
      tab('new');
    } catch (err) {
      T.note.textContent = err.why ? ACCOUNT_WHY[err.why] || err.message : err.message || 'Could not log in.';
    } finally { T.go.disabled = false; T.go.textContent = 'Log in'; }
  });
  T.forgot.onclick = () => { T.reset.hidden = !T.reset.hidden; if (!T.reset.hidden) drawReset(); };
  function drawReset() {
    const u = h('input', { maxLength: 20, placeholder: 'Username', value: T.user.value, autocomplete: 'username' });
    const code = h('input', { maxLength: 16, placeholder: 'Code from the keeper' });
    const p1 = h('input', { type: 'password', maxLength: 128, placeholder: 'New password (8+ characters)', autocomplete: 'new-password' });
    const msg = h('p.note');
    const ask = async () => {
      msg.className = 'note'; msg.textContent = 'Asking…';
      try { const r = await anonAccountOp('resetAsk', { user: u.value.trim() }, netOpts()); msg.className = r.ok ? 'note good' : 'note'; msg.textContent = r.msg || (r.ok ? 'Asked.' : ACCOUNT_WHY[r.why] || 'No.'); }
      catch (err) { msg.textContent = err.message; }
    };
    const set = async () => {
      if (p1.value.length < 8) { msg.textContent = ACCOUNT_WHY.pass; return; }
      try { const r = await anonAccountOp('reset', { user: u.value.trim(), code: code.value.trim(), pass: p1.value }, netOpts()); msg.className = r.ok ? 'note good' : 'note'; msg.textContent = r.msg || (r.ok ? 'Done.' : ACCOUNT_WHY[r.why] || 'No.'); if (r.ok) { T.user.value = u.value.trim(); T.pass.focus(); } }
      catch (err) { msg.textContent = err.message; }
    };
    T.reset.replaceChildren(
      h('p.tiny-left', {}, 'The game sends no email. Ask for a code, then ask the game\'s keeper for it — it works for one hour.'),
      h('div.row', {}, u, h('button.ghost', { type: 'button', onclick: ask }, 'Ask for a code')),
      h('div.row', {}, code), h('div.row', {}, p1),
      h('button.ghost.wide', { type: 'button', onclick: set }, 'Set the new password'), msg);
  }

  /** Your characters on this account (title screen), clickable. */
  function showChars(chars, username = null) {
    const list = chars || [];
    T.mine.hidden = !list.length && !username;
    T.who.textContent = username ? `Logged in as ${username}` : '';
    lastChars = list; lastUser = username;
    // play-test 2 Q25: the calling's real name ("Ranger"); Q13: the character's portrait (ui/portraits.js) when ready
    const nice = c => c.clsName || String(c.cls || '').replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase()) || 'Adventurer';
    T.chips.replaceChildren(...list.map(c => {
      const pic = api.portraitFor?.(c);
      return h('button.chip.char', { type: 'button', title: `Play ${c.name}`, onclick: () => onPick(c), dataset: { char: String(c.id) } },
        pic ? h('img.char-pic', { src: pic, alt: '' }) : h('span.char-pic.letter', {}, (c.name[0] || '?').toUpperCase()),
        h('span.char-txt', {}, c.name, h('small', {}, ` Level ${c.level || 1} ${nice(c)}`)));
    }));
    const label = T.mine.querySelector('.label');
    if (label) label.textContent = username ? `${username} — your characters` : 'Your characters';
    if (list.length && !$('name').value) $('name').value = list[0].name;
  }

  // ---- in game: the Account window ----
  const panel = createPanel({ id: 'account', title: 'Account', width: 360, onOpen: () => draw() });
  function draw() {
    if (!panel.isOpen) return;
    const n = net();
    if (!n) return panel.fill(h('p', {}, 'Not connected.'));
    if (n.claimed) return drawClaimed(n);
    panel.setTitle('Account', 'Guest');
    const user = h('input', { maxLength: 20, placeholder: 'Username', autocomplete: 'username' });
    const p1 = h('input', { type: 'password', maxLength: 128, placeholder: 'Password (8+ characters)', autocomplete: 'new-password' });
    const p2 = h('input', { type: 'password', maxLength: 128, placeholder: 'The same password again', autocomplete: 'new-password' });
    const email = h('input', { type: 'email', maxLength: 120, placeholder: 'Email (optional)', autocomplete: 'email' });
    const hc = h('div.human-check', { hidden: true });
    const msg = h('p.note'), go = h('button.primary', { type: 'submit' }, 'Claim this account');
    const form = h('form.claim', { onsubmit: async e => {
      e.preventDefault();
      const bad = claimCheck({ user: user.value.trim(), pass: p1.value, pass2: p2.value, email: email.value.trim() });
      if (bad) { msg.textContent = bad; return; }
      msg.textContent = ''; go.disabled = true; go.textContent = 'Claiming…';
      let human;
      if (n.humanCheck) { try { human = await humanToken(hc, n.humanCheck.siteKey); } catch (err) { msg.textContent = err.message; go.disabled = false; go.textContent = 'Claim this account'; return; } }
      n.accountOp('claim', { user: user.value.trim(), pass: p1.value, email: email.value.trim() || undefined, human });
      setTimeout(() => { if (go.disabled) { go.disabled = false; go.textContent = 'Claim this account'; } }, 10000);
    } }, user, p1, p2, email, hc, msg, go);
    panel.fill(
      h('p', {}, 'You are playing as a ', h('b', {}, 'guest'), '. Only this browser holds the key — clear its data and the character is gone.'),
      h('p', {}, `Claim it (free) to log in from any browser, and — from level ${PUBLIC_LEVEL} — talk on the public channels, send mail and found a guild.`),
      form,
      h('p.tiny-left', {}, 'We keep your username, a scrambled copy of your password, and the email only if you give one. ', h('a', { href: 'public/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy')));
    user.focus();
  }
  function drawClaimed(n) {
    panel.setTitle('Account', n.username || 'Claimed');
    const old = h('input', { type: 'password', maxLength: 128, placeholder: 'Current password', autocomplete: 'current-password' });
    const p1 = h('input', { type: 'password', maxLength: 128, placeholder: 'New password', autocomplete: 'new-password' });
    const p2 = h('input', { type: 'password', maxLength: 128, placeholder: 'New password again', autocomplete: 'new-password' });
    const msg = h('p.note');
    panel.fill(
      h('p', {}, 'Logged in as ', h('b', {}, n.username || 'you'), '. You can log in from any browser.'),
      h('details', {}, h('summary', {}, 'Change password'),
        h('form.claim', { onsubmit: e => { e.preventDefault(); if (p1.value !== p2.value) { msg.textContent = 'The two new passwords do not match.'; return; } if (p1.value.length < 8) { msg.textContent = ACCOUNT_WHY.pass; return; } n.accountOp('password', { old: old.value, pass: p1.value }); } },
          old, p1, p2, msg, h('button.ghost.wide', { type: 'submit' }, 'Change password'))),
      h('div.row.end', {}, h('a.tiny-link', { href: 'public/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy'), h('span.grow'), h('button.ghost', { type: 'button', onclick: () => logout() }, 'Log out')));
  }
  function logout() {
    const n = net(); if (!n) return;
    if (!n.claimed) { hud.toast(ACCOUNT_WHY.claimFirst, 'warn'); return; }
    n.logout();
  }

  function wire(n) {
    n.on('accountR', r => {
      if (r.op === 'login') return;            // the title handles its own
      if (!r.ok) {
        const t = r.msg || ACCOUNT_WHY[r.why] || 'That did not work.';
        hud.toast(t, 'warn');
        const note = panel.root.querySelector('.note'); if (note) note.textContent = t;
        panel.root.querySelectorAll('button[disabled]').forEach(b => { b.disabled = false; });
        if (panel.root.querySelector('form.claim button.primary')) panel.root.querySelector('form.claim button.primary').textContent = 'Claim this account';
        return;
      }
      if (r.op === 'claim') { hud.toast(`Account claimed: ${r.username || n.username}`, 'good'); hud.chat(`Your account is claimed as ${r.username || n.username}. Log in with it from any browser.`, 'system'); draw(); refreshPill(); }
      else if (r.op === 'password') { hud.toast('Password changed.', 'good'); draw(); }
      else if (r.op === 'logout') { hud.toast('Logged out.', 'info'); onLoggedOut?.(); }
      else if (r.msg) hud.toast(r.msg, 'info');
    });
    n.on('kick', k => { if (k.code === 'loggedOut') onLoggedOut?.(); });
  }
  function refreshPill() {
    const b = $('menu-account'); if (!b) return;
    const n = net();
    b.classList.toggle('guest', !!n && !n.claimed);
    b.dataset.tip = n && n.claimed ? `Account: ${n.username}` : 'Account: you are a guest — claim it to keep it (free)';
  }

  const api = { wire, panel, draw, showChars, tab, refreshPill, portraitFor: null,
    /** Redraw the title's character list (a portrait arrived, or a new charList). */
    redrawChars(chars = null) { if (chars) lastChars = chars; if (lastChars.length && !T.mine.hidden) showChars(lastChars, lastUser); } };
  return api;
}
