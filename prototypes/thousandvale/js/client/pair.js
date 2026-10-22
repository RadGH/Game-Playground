// The phone side of "Sign in with your phone" (owner 2026-10-22). A PC or console that is signed out shows a QR code
// for pair.html?pair=<code>&b=<build>; this page opens it, shows the check word the other screen shows, lets the phone's
// password manager fill a real username + password form, and asks "Sign the other screen in as NAME?". The server
// (js/sim/accounts.js pairAsk/pairPeek/pairAuth/pairOk/pairNo) then hands the waiting screen its own session. Signing in
// here does NOT sign this phone in. A phone that is already signed in to a claimed account can approve with one tap.
// No game code is loaded: one socket, a handful of messages.
import { socketFactory } from '../net/sockets.js';
import { PROTOCOL_VERSION } from '../net/protocol.js';

const q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const code = String(q.get('pair') || '').trim().toLowerCase();
const build = q.get('b') || 'dev';
const tokenKey = 'thousandvale.token.' + (q.get('server') || location.host);
const savedToken = () => { try { return localStorage.getItem(tokenKey); } catch { return null; } };
const P = { sock: null, check: '', remembered: null, waiting: null, done: false };

const show = (...ids) => { for (const id of ['pair-check', 'pair-remember', 'pair-form', 'pair-confirm', 'pair-play']) $(id).hidden = !ids.includes(id); };
const lede = t => { $('pair-lede').textContent = t; };
const note = (t = '', good = false) => { $('pair-note').textContent = t; $('pair-note').className = 'note' + (good ? ' good' : ''); };

/** Send one account op and wait for its answer (or a refusal). */
function op(name, args = {}) {
  return new Promise(res => {
    P.waiting = { op: name, res };
    try { P.sock.send(JSON.stringify({ t: 'account', op: name, ...args })); } catch { P.waiting = null; res({ ok: false, msg: 'Lost the connection. Reload this page.' }); }
    setTimeout(() => { if (P.waiting?.res === res) { P.waiting = null; res({ ok: false, msg: 'The server did not answer. Try again.' }); } }, 15000);
  });
}

function connect(useToken) {
  const so = socketFactory('ws', { url: q.get('server') || undefined })('/gw');
  P.sock = so;
  so.onopen = () => so.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, build }));
  so.onmessage = ev => {
    if (P.sock !== so || typeof ev.data !== 'string') return;
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'welcome') { const tok = useToken && savedToken(); if (tok) so.send(JSON.stringify({ t: 'auth', token: tok })); else peek(); }
    else if (m.t === 'authed') {
      // a guest key cannot approve, and an authed socket cannot take a password: start again signed out
      if (!m.claimed) { P.sock = null; so.close(); connect(false); return; }
      P.remembered = m.username || 'your account'; peek();
    } else if (m.t === 'accountR' && P.waiting && (m.op === P.waiting.op)) { const w = P.waiting; P.waiting = null; w.res(m); }
    else if (m.t === 'refuse') { lede(m.msg || 'The server refused this page. Reload the code on the other screen.'); show(); }
    else if (m.t === 'err') {
      if (m.code === 'auth' && !P.check && !P.waiting) { peek(); return; }      // a stale saved key: the socket is still signed out, carry on
      if (P.waiting) { const w = P.waiting; P.waiting = null; w.res({ ok: false, msg: m.msg || 'That did not work.' }); }
    }
  };
  so.onclose = () => { if (P.sock === so && !P.done) { lede('Lost the connection to the game server. Reload this page to try again.'); show(); } };
}

async function peek() {
  const r = await op('pairPeek', { code });
  if (!r.ok) { lede(r.msg || 'That sign-in code has run out. Make a new one on the other screen.'); show('pair-play'); return; }
  P.check = r.check || '';
  $('pair-word').textContent = $('pair-word2').textContent = P.check;
  lede('Another screen wants to sign in to Thousandvale.');
  if (P.remembered) { $('pair-as').textContent = `Sign it in as ${P.remembered}`; show('pair-check', 'pair-remember'); }
  else askLogin();
}
function askLogin() { show('pair-check', 'pair-form'); note(); $('pair-user').focus(); }

$('pair-other').onclick = () => { P.remembered = null; if (P.sock) { const so = P.sock; P.sock = null; so.close(); } lede('Connecting…'); show(); connect(false); };
$('pair-as').onclick = () => confirmAs(P.remembered);
$('pair-form').addEventListener('submit', async e => {
  e.preventDefault();
  const user = $('pair-user').value.trim(), pass = $('pair-pass').value;
  if (!user || !pass) { note('Type your username and password.'); return; }
  $('pair-go').disabled = true; $('pair-go').textContent = 'Logging in…'; note();
  const r = await op('pairAuth', { code, user, pass });
  $('pair-go').disabled = false; $('pair-go').textContent = 'Log in';
  if (!r.ok) { note(r.msg || 'Wrong username or password.'); return; }
  $('pair-pass').value = '';
  confirmAs(r.username || user);
});
function confirmAs(name) { $('pair-who').textContent = name; lede('Almost done.'); show('pair-check', 'pair-confirm'); note(); }
$('pair-yes').onclick = () => answer('pairOk');
$('pair-no').onclick = () => answer('pairNo');
async function answer(which) {
  $('pair-yes').disabled = $('pair-no').disabled = true;
  const r = await op(which, { code });
  $('pair-yes').disabled = $('pair-no').disabled = false;
  if (!r.ok) { note(r.msg || 'That did not work.'); return; }
  P.done = true; try { P.sock?.close(); } catch { /* done anyway */ }
  if (which === 'pairOk') { lede(`Done — the other screen is signing in as ${r.username || $('pair-who').textContent}. You can close this page.`); note('Signed in.', true); }
  else { lede('Okay — the other screen was not signed in.'); note(); }
  show('pair-play');
}

if (!/^[0-9a-f]{32}$/.test(code)) { lede('This page needs the QR code from the screen you want to sign in. Choose "Sign in with your phone" there.'); show('pair-play'); }
else connect(true);
// for tests
globalThis.thousandvalePair = { get state() { return { check: P.check, remembered: P.remembered, done: P.done }; } };
