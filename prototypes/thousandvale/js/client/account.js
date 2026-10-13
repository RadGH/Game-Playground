// Accounts (M3, protocol §16.1): the title screen's "New adventurer" (a guest, no questions) and "Log in" tabs,
// "Forgot password" (a code from the game's keeper — no email is sent), your characters when this browser already
// has an account, the Privacy link; and in the game the Account window: claim a guest (username, password,
// optional email), change the password, log out. Turnstile only when the server asks (welcome.human).
// DOM only; checks in social-core.js; the connection itself is main.js's (startNet / js/net/client.js).

import { claimCheck, ACCOUNT_WHY, PUBLIC_LEVEL } from './social-core.js';
import { createPanel, h } from './ui-panel.js';
import { nameMatches, charLimit, limitText, deleteRefusal, deleteWarning } from './ui/pt9-core.js';
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
/** The sentence that offers a browser's guest characters to the account just signed in to (report S#66). */
export function guestOfferText(chars) {
  const nice = c => `${c.name} (level ${c.level || 1} ${String(c.cls || 'adventurer').replace(/_/g, ' ')})`;
  const names = chars.map(nice), list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  return chars.length === 1 ? `This browser has a guest character that is not on your account: ${list}. Move it to your account?`
    : `This browser has ${chars.length} guest characters that are not on your account: ${list}. Move them to your account?`;
}
/** What to say after the move: who came across, and who stayed and why. */
export function guestMovedText(r) {
  const moved = r.moved || [], left = r.left || [], names = l => l.map(c => c.name).join(', ');
  const online = left.filter(c => c.why === 'online'), full = left.filter(c => c.why === 'full');
  return [moved.length ? `${names(moved)} ${moved.length === 1 ? 'is' : 'are'} on your account now.` : '',
    online.length ? `${names(online)} ${online.length === 1 ? 'is' : 'are'} still in the world — try again in a minute.` : '',
    full.length ? `${names(full)} did not fit: your account is at its character limit.` : ''].filter(Boolean).join(' ') || 'There was nothing to move.';
}

/** @param o.guestKey  { get(), clear() } the guest key this browser held before a sign-in (main.js sets it aside) */
export function createAccount({ net: getNet, hud, me, netOpts, onLogin, onPick, onLoggedOut, onTitleStep = null, guestKey = null }) {
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
      // play-test 9: straight to YOUR CHARACTERS (the list lives on the front card, which the Log in tab had hidden —
      // for two rounds a fresh sign-in landed on the "New character" form with the list out of sight)
      front();                       // play-test 10 (Y29): also with no characters — the front card then offers "Create character"
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

  /** Show the front card: your characters + "New character" (main.js's titleStep('front'), from in here). */
  function front() {
    if (typeof onTitleStep === 'function') { onTitleStep('front'); return; }
    const f = $('front'); if (f) f.hidden = false;
    T.newForm.hidden = true; T.signin.hidden = true;
    T.tabNew.setAttribute('aria-selected', 'true'); T.tabLogin.setAttribute('aria-selected', 'false');
  }

  // ---- play-test 9 (X6, report D#14): delete a character — you type its name to confirm ----
  const wiredNets = new WeakSet();
  let delWait = null;
  function listen(n) {
    if (!n || wiredNets.has(n)) return; wiredNets.add(n);
    n.on('deleted', r => { const w = delWait; delWait = null; clearTimeout(w?.timer); w?.done(r); });
    n.on('chars', list => { if (Array.isArray(list)) { lastChars = list; if (!T.mine.hidden) showChars(list, lastUser); } });
  }
  function sendDelete(c, typed) {
    return new Promise(res => {
      const n = net(); if (!n) { res({ ok: false, msg: 'You are not connected.' }); return; }
      listen(n);
      delWait = { done: res, timer: setTimeout(() => { if (delWait) { delWait = null; res({ ok: false, msg: 'The server did not answer. Try again.' }); } }, 9000) };
      if (typeof n.deleteChar === 'function') n.deleteChar(c.id, typed); else if (n._raw) n._raw('gw', JSON.stringify({ t: 'delete', char: c.id, name: typed })); else { clearTimeout(delWait.timer); delWait = null; res({ ok: false, msg: 'This server cannot delete characters yet.' }); }
    });
  }
  function askDelete(c) {
    document.querySelector('.char-delete')?.remove();
    const input = h('input', { maxLength: 24, 'aria-label': `Type ${c.name} to confirm`, placeholder: c.name, autocomplete: 'off', spellcheck: false });
    const note = h('p.note');
    const yes = h('button.danger', { type: 'button', disabled: true, dataset: { act: 'delete' } }, 'Delete for good');
    const box = h('div.tv-confirm.char-delete', { role: 'alertdialog', 'aria-label': `Delete ${c.name}` },
      h('strong', {}, `Delete ${c.name}?`), h('p', {}, deleteWarning(c)),
      h('label', {}, h('span.label', {}, 'Type the character\'s name to confirm'), input), note,
      h('div.row', {}, h('button.ghost', { type: 'button', dataset: { act: 'keep' }, onclick: () => box.remove() }, 'Keep it'), yes));
    input.addEventListener('input', () => { yes.disabled = !nameMatches(input.value, c.name); note.textContent = ''; });
    const go = async () => {
      if (!nameMatches(input.value, c.name)) { note.textContent = deleteRefusal({ why: 'name' }); return; }
      yes.disabled = true; yes.textContent = 'Deleting…';
      const r = await sendDelete(c, input.value.trim());
      if (!r.ok) { note.textContent = deleteRefusal(r); yes.textContent = 'Delete for good'; yes.disabled = !nameMatches(input.value, c.name); return; }
      box.remove();
      lastChars = lastChars.filter(x => x.id !== c.id);
      showChars(lastChars, lastUser);
      const said = `${c.name} is deleted.${r.returned ? ` ${r.returned} letter${r.returned === 1 ? '' : 's'} went back to ${r.returned === 1 ? 'its sender' : 'their senders'}.` : ''}`;
      const ln = $('front')?.querySelector('.char-said'); if (ln) ln.textContent = said;
    };
    yes.onclick = go;
    box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') box.remove(); if (e.key === 'Enter' && !yes.disabled) go(); });
    document.body.appendChild(box);
    input.focus();
  }

  // ---- wrap-up (report S#66): this browser's guest characters are offered to the account you signed in to ----
  const guestAsked = new WeakSet();
  function offerGuests() {
    const n = net(), key = guestKey?.get();
    if (!n || !n.claimed || !key || guestAsked.has(n) || typeof n.accountOp !== 'function') return;
    guestAsked.add(n);
    const off = n.on('accountR', r => {
      if (r.op !== 'peek') return; off();
      if (!r.ok) return;
      if (!r.chars || !r.chars.length) { guestKey.clear(); return; }       // nothing on that key (or it is gone): forget it
      T.mine.querySelector('.guest-offer')?.remove();
      const note = h('p.note', { 'aria-live': 'polite' });
      const yes = h('button.primary', { type: 'button', dataset: { act: 'adopt' } }, r.chars.length === 1 ? 'Move it' : 'Move them');
      const box = h('div.guest-offer', { role: 'group', 'aria-label': 'Guest characters in this browser' }, h('p', {}, guestOfferText(r.chars)),
        h('div.row', {}, yes, h('button.ghost', { type: 'button', dataset: { act: 'later' }, onclick: () => box.remove() }, 'Not now')), note);
      yes.onclick = () => {
        yes.disabled = true; yes.textContent = 'Moving…';
        const offA = n.on('accountR', a => {
          if (a.op !== 'adopt') return; offA();
          if (!a.ok) { note.textContent = a.msg || 'That did not work.'; yes.disabled = false; yes.textContent = 'Try again'; return; }
          const said = guestMovedText(a);
          if (!(a.left || []).length) { guestKey.clear(); box.remove(); const ln = $('front')?.querySelector('.char-said'); if (ln) ln.textContent = said; }
          else { note.textContent = said; yes.disabled = false; yes.textContent = 'Try again'; }
          n.refreshChars?.();
        });
        n.accountOp('adopt', { guest: key });
      };
      T.mine.hidden = false; T.mine.prepend(box);
    });
    n.accountOp('peek', { guest: key });
  }

  /** Your characters on this account (title screen), clickable. */
  function showChars(chars, username = null) {
    const list = chars || [];
    T.mine.hidden = !list.length && !username;
    T.who.textContent = username ? `Logged in as ${username}` : '';
    lastChars = list; lastUser = username;
    try { api.onChars?.(list, username); } catch { /* the title's front card (ui/title-front.js) */ }
    // play-test 2 Q25: the calling's real name ("Ranger"); Q13: the character's portrait (ui/portraits.js) when ready
    const nice = c => c.clsName || String(c.cls || '').replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase()) || 'Adventurer';
    listen(net());
    offerGuests();
    // X6: one row a character — the chip plays it, Delete asks for its name; the list scrolls (css/pt9.css) once it is long
    T.chips.replaceChildren(...list.map(c => {
      const pic = api.portraitFor?.(c);
      return h('div.char-row', { dataset: { char: String(c.id) } },
        h('button.chip.char', { type: 'button', title: `Play ${c.name}`, onclick: () => onPick(c), dataset: { char: String(c.id) } },
          pic ? h('img.char-pic', { src: pic, alt: '' }) : h('span.char-pic.letter', {}, (c.name[0] || '?').toUpperCase()),
          h('span.char-txt', {}, c.name, h('small', {}, ` Level ${c.level || 1} ${nice(c)}`))),
        h('button.ghost.small.char-del', { type: 'button', 'aria-label': `Delete ${c.name}`, title: `Delete ${c.name} — asks you to type the name first`, dataset: { act: 'del' }, onclick: () => askDelete(c) }, 'Delete'));
    }));
    // the limit is the server's (A: 20, a knob); at the limit "New character" says why it is shut
    const cap = charLimit(net());
    let lim = T.mine.querySelector('.char-limit'); if (!lim) { lim = h('p.tiny-left.char-limit'); T.chips.after(lim, h('p.tiny-left.char-said', { 'aria-live': 'polite' })); }
    lim.textContent = list.length ? limitText(list.length, cap) : '';
    lim.classList.toggle('full', list.length >= cap);
    const nb = $('new-char'); if (nb) { nb.disabled = list.length >= cap; nb.dataset.tip = list.length >= cap ? `An account holds ${cap} characters. Delete one to make room.` : ''; }
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

  const api = { wire, panel, draw, showChars, tab, refreshPill, portraitFor: null, onChars: null, hasChars: () => lastChars.length > 0,
    /** Redraw the title's character list (a portrait arrived, or a new charList). */
    redrawChars(chars = null) { if (chars) lastChars = chars; if (lastChars.length && !T.mine.hidden) showChars(lastChars, lastUser); } };
  return api;
}
