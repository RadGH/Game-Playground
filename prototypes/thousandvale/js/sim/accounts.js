// CLAIMED ACCOUNTS (stream A, PLAN §5.5 / §9.4 / §11.6), part of the gateway. Pure: the password hash is
// injected (server/passwords.js — scrypt), so this file also runs in the Web Worker (where claiming is simply
// switched off).
//
// A guest account works forever on the browser that holds its token. CLAIMING adds a username + password (and,
// if the player wants, an email used only by the reset stub) so the characters survive a cleared browser and
// can be reached from another one. LOGIN hands out a fresh session token (only its hash is stored); LOGOUT
// deletes that token. A guest cannot log out (there would be no way back in). Changing a password or using a
// reset code ends every other session.
//
// A reset code lasts an hour. When the server has a `mailer` (server/mail.mjs, SendGrid) and the account has an
// email, the code is emailed to it. It ALSO always goes to the ADMIN page (server/admin.mjs), so an account with no
// email can still be helped by the owner; the server log records only that a reset was asked for.
//
//   const A = createAccounts({ store, hasher, verifyHuman, wallNow, log, filter, sendAll, kickChar, counters })
//   A.handle(s, m)            the `account {op}` message (docs/protocol.md §16.1)
//   A.resets()                recent reset codes for the admin page
//   A.limiter                 login / reset attempt limits (tests read it)

import { CODES } from '../net/protocol.js';
import { sha256Hex, randomHex } from './sha256.js';

export const ACCOUNT_OPS = Object.freeze(['claim', 'login', 'logout', 'password', 'resetAsk', 'reset', 'info', 'peek', 'adopt', 'pairAsk', 'pairPeek', 'pairAuth', 'pairOk', 'pairNo']);
/**
 * Sign a PC or console in FROM a phone (owner 2026-10-22, replaces play-test 12's #73, which went the other way).
 * The screen that wants to play is signed out: it asks `pairAsk` on its own socket and gets a one-time code (16 random
 * bytes, only its hash kept, in memory only) plus a short `check` word, and shows both as a QR code. The phone opens the
 * link (pair.html), reads the check word back with `pairPeek {code}`, signs in with a real username + password form
 * (so its password manager fills it) through `pairAuth {code, user, pass}` — which checks the password and remembers
 * the account ON THAT PHONE SOCKET without signing it in — and then `pairOk {code}` hands the WAITING screen a fresh
 * session token (accountR op 'pairDone'). A phone that is already signed in may approve straight away (`auth` first,
 * then `pairOk`). `pairNo {code}` tells the screen the phone said no. A code works once, for ttlMs; asking again
 * replaces the socket's old code; a closed screen socket kills its code. The password never reaches the screen.
 */
export const PAIR_SIGNIN = Object.freeze({ ttlMs: 3 * 60000, max: 5000 });
const PAIR_LETTERS = 'ACDEFHJKLMNPQRTVWXY34679';      // no 0/O, 1/I, 2/Z, 5/S, 8/B look-alikes
export const LOGIN_LIMITS = Object.freeze({
  ipFails: 20, ipWindowMs: 10 * 60000,          // failed logins from one address (above userFails, so it never trips first)
  userFails: 10, userWindowMs: 15 * 60000,      // failed logins on one username (owner 2026-10-15: 5 was too strict)
  resetAsks: 3, resetWindowMs: 3600000,         // reset requests from one address
  resetMs: 3600000,                             // a reset code lasts an hour
});

/** Usernames: 3-20 of a-z 0-9 . _ - (case-insensitive, stored as typed). */
export function cleanUsername(s) {
  const u = String(s || '').trim();
  return /^[A-Za-z0-9._-]{3,20}$/.test(u) ? u : null;
}
export const cleanPassword = p => (typeof p === 'string' && p.length >= 8 && p.length <= 128 ? p : null);
export function cleanEmail(e) {
  if (e == null || e === '') return '';
  const s = String(e).trim();
  return s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/** Sliding-window counter: hit(key) records one, over(key) says the window is full. */
export function createLimiter(now) {
  const m = new Map();
  const prune = (k, win) => { const l = (m.get(k) || []).filter(t => t > now() - win); if (l.length) m.set(k, l); else m.delete(k); return l; };
  return {
    hit(k) { const l = m.get(k) || []; l.push(now()); m.set(k, l); },
    over(k, max, win) { return prune(k, win).length >= max; },
    clear(k) { m.delete(k); },
    size: () => m.size,
    sweep(win) { for (const k of [...m.keys()]) prune(k, win); },
  };
}

/**
 * Accounts made on another games.radgh.com game (server/rgs-link.mjs, 2026-10-23). Their stored "password" is this
 * marker plus the games.radgh.com user id: the real password lives there and every check asks it.
 */
export const RGS_PASS = 'rgs:';
const isRgs = h => typeof h === 'string' && h.startsWith(RGS_PASS);
const RGS_PASSWORD_MSG = 'This account signs in with its games.radgh.com password. Change or reset it at games.radgh.com/account/.';

export function createAccounts({ store, hasher = null, mailer = null, rgs = null, verifyHuman = null, wallNow, log = () => {}, filter = null, sendAll = () => {}, kickChar = () => {}, counters = {}, trustIps = [], charLimit = 20 }) {
  const limiter = createLimiter(wallNow);
  const L = LOGIN_LIMITS;
  const resetLog = [];             // { at, username, email, code, until } for the admin page (last 50)
  const pairs = new Map();         // sha256(code) -> { s: the waiting screen's socket, check, until }
  const pairSweep = () => { const t = wallNow(); for (const [k, v] of pairs) if (v.until <= t || v.s.closed) { pairs.delete(k); if (v.s.pairKey === k) v.s.pairKey = null; } };
  const pairOf = code => { const c = String(code || '').trim().toLowerCase(); if (!/^[0-9a-f]{32}$/.test(c)) return null; const key = sha256Hex('pair:' + c); pairSweep(); const e = pairs.get(key); return e ? { key, e } : null; };
  const checkWord = () => { const h = randomHex(4); let w = ''; for (let i = 0; i < 4; i++) w += PAIR_LETTERS[parseInt(h.slice(i * 2, i * 2 + 2), 16) % PAIR_LETTERS.length]; return w; };
  const pairGone = 'That sign-in code has been used or has run out. Make a new one on the screen you want to play on.';
  const reply = (s, op, x) => s.sendJSON({ t: 'accountR', op, ...x });
  const fail = (s, op, why, msg) => reply(s, op, { ok: false, why, msg: msg || CODES[why] || why });
  const human = (s, m) => (verifyHuman ? Promise.resolve(m.human ? verifyHuman(m.human, s.ip) : false).catch(() => false) : Promise.resolve(true));
  const ipKey = s => 'ip:' + (s.ip || '?');
  const limited = s => !trustIps.includes(s.ip);
  /** Is `pass` right for this login? A games.radgh.com account is asked there; any other one is checked here. */
  async function passOk(username, pass, info) {
    if (!info || !info.passHash) return false;
    if (!isRgs(info.passHash)) return hasher.verifyPassword(pass, info.passHash);
    if (!rgs) return false;
    const r = await rgs.verify(username, pass);
    return !!r && RGS_PASS + r.id === info.passHash;
  }
  /** The Thousandvale account of a games.radgh.com user that was made elsewhere (made now if it's the first time). */
  async function rgsAccount(r) {
    if (!r || r.linkedHere || !cleanUsername(r.username)) return null;
    const had = await store.loginInfo(r.username);
    if (had) return had.passHash === RGS_PASS + r.id ? had : null;      // that name here is somebody else's account
    if (!store.createGuest) return null;
    const { account, token } = await store.createGuest(null);
    if (token && store.revokeToken) await store.revokeToken(token).catch(() => {});
    const c = await store.claimAccount(account, { username: r.username, passHash: RGS_PASS + r.id, email: null });
    if (c.err) { log('games.radgh.com account not linked', { why: c.err }); return null; }
    log('games.radgh.com account linked', { account });
    return store.loginInfo(r.username);
  }
  /** No Thousandvale account by that name: is it a games.radgh.com account? Then make its Thousandvale account. */
  async function fromRgs(username, pass) {
    if (!rgs) return null;
    let r;
    try { r = await rgs.verify(username, pass); } catch (err) { log('games.radgh.com check failed', err && err.message); return null; }
    return rgsAccount(r);
  }
  /**
   * Signed in on games.radgh.com already (the page holds a one-time ticket from it): which account here is that?
   * A Thousandvale account that signed in there is linked by name (the API keeps the name in step); any other one is
   * its `rgs:<id>` account.
   */
  async function fromTicket(ticket) {
    if (!rgs || !rgs.redeem) return null;
    const u = await rgs.redeem(String(ticket));
    if (!u) return null;
    if (!u.linkedHere) return rgsAccount(u);
    const info = await store.loginInfo(u.username);
    return info && !isRgs(info.passHash) ? info : null;
  }

  /** Sign this socket in (login or a reset). */
  function signedIn(s, account, token, username, admin = false) {
    s.account = account; s.token = token; s.claimed = true; s.username = username; s.state = 'authed'; s.admin = !!admin;
    counters.logins = (counters.logins || 0) + 1;
    s.sendJSON({ t: 'authed', account, token, claimed: true, username, ...(admin ? { admin: true } : {}) });
  }

  async function handle(s, m) {
    const op = m.op;
    if (!ACCOUNT_OPS.includes(op)) return 'op';
    if (!hasher && op !== 'info') return fail(s, op, 'state', 'Accounts are not available on this server.');
    switch (op) {
      case 'info': {
        if (s.state !== 'authed') return 'order';
        const a = await store.accountInfo(s.account);
        return reply(s, op, { ok: true, claimed: !!(a && a.claimed), username: a ? a.username : null, email: a ? a.email : null, ...(a && a.admin ? { admin: true } : {}) });
      }
      case 'claim': {
        if (s.state !== 'authed') return 'order';
        const username = cleanUsername(m.user), pass = cleanPassword(m.pass), email = cleanEmail(m.email);
        if (!username) return fail(s, op, 'user', 'Pick a username: 3 to 20 letters, numbers, dots, dashes or underscores.');
        if (filter && !filter.name(username)) return fail(s, op, 'user', 'That username is not allowed.');
        if (!pass) return fail(s, op, 'pass', 'Pick a password of 8 to 128 characters.');
        if (email === null) return fail(s, op, 'email', 'That email address does not look right (or leave it empty).');
        if (s.claimed) return fail(s, op, 'claimed', 'This account is already claimed.');
        s.busyAccount = true;
        try {
          if (!(await human(s, m))) { counters.humanFails = (counters.humanFails || 0) + 1; return fail(s, op, 'human'); }
          if (rgs) {                     // one name is one person on every games.radgh.com game
            let free;
            try { free = await rgs.nameFree(username); } catch (err) { log('games.radgh.com name check failed', err && err.message); return fail(s, op, 'state', 'Claiming is not working right now. Try again in a minute.'); }
            if (!free) return fail(s, op, 'user', 'That username is taken.');
          }
          const passHash = await hasher.hashPassword(pass);
          const r = await store.claimAccount(s.account, { username, passHash, email: email || null });
          if (r.err) return fail(s, op, r.err === 'taken' ? 'user' : r.err, r.err === 'taken' ? 'That username is taken.' : r.err === 'claimed' ? 'This account is already claimed.' : 'No such account.');
          s.claimed = true; s.username = username;
          sendAll({ k: 'claimed', account: s.account, username });
          log('account claimed', { account: s.account });
          return reply(s, op, { ok: true, username, claimed: true });
        } finally { s.busyAccount = false; }
      }
      case 'login': {
        if (s.state !== 'anon') return 'order';
        if (m.ticket != null) {                       // "Continue as …": signed in on games.radgh.com already
          if (limited(s) && limiter.over(ipKey(s), L.ipFails, L.ipWindowMs)) return fail(s, op, 'tooManyLogins');
          s.state = 'busy';
          try {
            const info = await fromTicket(m.ticket);
            if (!info) { limiter.hit(ipKey(s)); s.state = 'anon'; return fail(s, op, 'auth', 'That games.radgh.com sign-in did not work. Sign in with your username and password instead.'); }
            if (info.banned > wallNow()) { s.state = 'anon'; s.sendJSON({ t: 'refuse', code: 'banned', msg: CODES.banned }); return s.closeSoon('banned'); }
            const token = await store.newToken(info.account, 'session');
            const a = await store.accountInfo(info.account);
            return signedIn(s, info.account, token, a ? a.username : null, !!(a && a.admin));
          } catch (err) { s.state = 'anon'; log('ticket login failed', err && err.message); return fail(s, op, 'auth', 'Signing in is not working right now.'); }
        }
        const username = cleanUsername(m.user);
        const uKey = 'user:' + String(username || m.user || '').toLowerCase();
        if (limited(s) && (limiter.over(ipKey(s), L.ipFails, L.ipWindowMs) || limiter.over(uKey, L.userFails, L.userWindowMs))) return fail(s, op, 'tooManyLogins');
        if (!username || typeof m.pass !== 'string') { limiter.hit(ipKey(s)); return fail(s, op, 'auth', 'Wrong username or password.'); }
        s.state = 'busy';
        try {
          let info = await store.loginInfo(username);
          if (!info) info = await fromRgs(username, m.pass);
          const ok = await passOk(username, m.pass, info);
          if (!ok) { limiter.hit(ipKey(s)); limiter.hit(uKey); s.state = 'anon'; return fail(s, op, 'auth', 'Wrong username or password.'); }
          if (info.banned > wallNow()) { s.state = 'anon'; s.sendJSON({ t: 'refuse', code: 'banned', msg: CODES.banned }); return s.closeSoon('banned'); }
          limiter.clear(uKey);
          const token = await store.newToken(info.account, 'session');
          const a = await store.accountInfo(info.account);
          return signedIn(s, info.account, token, a ? a.username : username, !!(a && a.admin));
        } catch (err) { s.state = 'anon'; log('login failed', err && err.message); return fail(s, op, 'auth', 'Login is not working right now.'); }
      }
      // Wrap-up (report S#66): "when you sign in, if any browser-based characters are not assigned, ask to claim them".
      // The browser keeps the guest key it had before the sign-in; `peek` lists that guest's characters, `adopt` moves
      // them onto the signed-in account. Only an UNCLAIMED account's characters can be taken, and only with its key.
      case 'peek': case 'adopt': {
        if (s.state !== 'authed') return 'order';
        if (!s.claimed) return fail(s, op, 'claimFirst');
        if (!store.moveChars) return fail(s, op, 'state', 'Characters cannot be moved on this server.');
        const g = typeof m.guest === 'string' && m.guest ? await store.authToken(m.guest) : null;
        if (!g || g.claimed || g.account === s.account) return reply(s, op, { ok: true, chars: [], moved: [], left: [] });
        if (op === 'peek') return reply(s, op, { ok: true, chars: (await store.listChars(g.account)).map(c => ({ id: c.id, name: c.name, cls: c.cls, level: c.level })) });
        const r = await store.moveChars(g.account, s.account, { limit: charLimit, nowMs: wallNow() });
        if (r.err) return fail(s, op, 'state', 'Those characters could not be moved.');
        log('guest characters adopted', { from: g.account, to: s.account, moved: r.moved.length, left: r.left.length });
        return reply(s, op, { ok: true, moved: r.moved, left: r.left });
      }
      case 'logout': {
        if (s.state !== 'authed') return 'order';
        if (!s.claimed) return fail(s, op, 'claimFirst');
        if (s.token) await store.revokeToken(s.token);
        if (s.charId) kickChar(s.charId, 'loggedOut');
        reply(s, op, { ok: true });
        return s.closeSoon('logout');
      }
      case 'password': {
        if (s.state !== 'authed') return 'order';
        if (!s.claimed) return fail(s, op, 'claimFirst');
        const pass = cleanPassword(m.pass);
        if (!pass) return fail(s, op, 'pass', 'Pick a password of 8 to 128 characters.');
        const uKey = 'user:' + String(s.username || '').toLowerCase();
        if (limiter.over(uKey, L.userFails, L.userWindowMs)) return fail(s, op, 'tooManyLogins');
        const info = s.username ? await store.loginInfo(s.username) : null;
        if (info && isRgs(info.passHash)) return fail(s, op, 'state', RGS_PASSWORD_MSG);
        if (!info || info.account !== s.account || !(await hasher.verifyPassword(String(m.old || ''), info.passHash))) { limiter.hit(uKey); return fail(s, op, 'auth', 'Your current password is not right.'); }
        await store.setPassword(s.account, await hasher.hashPassword(pass), s.token);
        return reply(s, op, { ok: true });
      }
      case 'resetAsk': {
        if (s.state !== 'anon' && s.state !== 'authed') return 'order';
        // one answer whatever happened, so it never says whether a username exists or has an email
        const said = { ok: true, msg: mailer
          ? 'If that account has an email address, a reset code is on its way to it (check your spam folder). It works for one hour. No email on the account? Ask the game\'s admin for the code.'
          : 'This server cannot send email. Ask the game\'s admin for your reset code; it works for one hour.' };
        if (limited(s) && limiter.over('reset:' + (s.ip || '?'), L.resetAsks, L.resetWindowMs)) return fail(s, op, 'tooManyLogins');
        limiter.hit('reset:' + (s.ip || '?'));
        const username = cleanUsername(m.user);
        const info = username ? await store.loginInfo(username) : null;
        if (!info) return reply(s, op, said);                      // never say whether a username exists
        if (isRgs(info.passHash)) return reply(s, op, { ok: true, msg: RGS_PASSWORD_MSG });
        const code = randomHex(4).toUpperCase();
        const until = wallNow() + L.resetMs;
        await store.setReset(info.account, sha256Hex('reset:' + code), until);
        const a = await store.accountInfo(info.account);
        resetLog.push({ at: wallNow(), account: info.account, username: a ? a.username : username, email: a ? a.email : null, code, until });
        while (resetLog.length > 50) resetLog.shift();
        log('password reset asked', { account: info.account });     // the code itself goes only to the admin page and the email
        if (mailer && a && a.email) {
          const who = a.username || username;
          mailer.send({ to: a.email, subject: 'Your Thousandvale password reset code',
            text: `Someone (hopefully you) asked to reset the password for the Thousandvale account "${who}".\n\nYour reset code is: ${code}\n\nOn the title screen choose Log in, then "Forgot your password?", and enter this code with a new password. It works for one hour.\n\nIf you did not ask for this, ignore this email; your password has not changed.` })
            .then(() => { counters.resetMails = (counters.resetMails || 0) + 1; log('reset code emailed', { account: info.account }); },
              err => log('reset email failed', { account: info.account, err: String(err && err.message) }));
        }
        return reply(s, op, said);
      }
      case 'reset': {
        if (s.state !== 'anon') return 'order';
        const username = cleanUsername(m.user), pass = cleanPassword(m.pass);
        const uKey = 'user:' + String(username || '').toLowerCase();
        if (limited(s) && (limiter.over(ipKey(s), L.ipFails, L.ipWindowMs) || limiter.over(uKey, L.userFails, L.userWindowMs))) return fail(s, op, 'tooManyLogins');
        if (!pass) return fail(s, op, 'pass', 'Pick a password of 8 to 128 characters.');
        const code = String(m.code || '').trim().toUpperCase();
        const account = username && code ? await store.resetByCode(username, sha256Hex('reset:' + code), wallNow()) : null;
        if (!account) { limiter.hit(ipKey(s)); limiter.hit(uKey); return fail(s, op, 'auth', 'That code is wrong or has run out.'); }
        await store.setPassword(account, await hasher.hashPassword(pass));
        const r = resetLog.find(x => x.account === account && !x.used); if (r) r.used = wallNow();
        return reply(s, op, { ok: true, msg: 'Password changed. Log in with it now.' });
      }
      case 'pairAsk': {
        if (s.state !== 'anon') return 'order';
        pairSweep();
        if (s.pairKey) pairs.delete(s.pairKey);
        if (pairs.size >= PAIR_SIGNIN.max) return fail(s, op, 'busy', 'Too many sign-in codes right now. Try again in a minute.');
        const code = randomHex(16), key = sha256Hex('pair:' + code), check = checkWord();
        pairs.set(key, { s, check, until: wallNow() + PAIR_SIGNIN.ttlMs }); s.pairKey = key;
        counters.pairMade = (counters.pairMade || 0) + 1;
        return reply(s, op, { ok: true, code, check, ttl: PAIR_SIGNIN.ttlMs });
      }
      case 'pairPeek': {
        if (s.state !== 'anon' && s.state !== 'authed') return 'order';
        if (limited(s) && limiter.over(ipKey(s), L.ipFails, L.ipWindowMs)) return fail(s, op, 'tooManyLogins');
        const p = pairOf(m.code);
        if (!p) { limiter.hit(ipKey(s)); return fail(s, op, 'gone', pairGone); }
        return reply(s, op, { ok: true, check: p.e.check, ...(s.state === 'authed' && s.claimed ? { username: s.username } : {}) });
      }
      case 'pairAuth': {
        if (s.state !== 'anon') return 'order';
        const username = cleanUsername(m.user);
        const uKey = 'user:' + String(username || m.user || '').toLowerCase();
        if (limited(s) && (limiter.over(ipKey(s), L.ipFails, L.ipWindowMs) || limiter.over(uKey, L.userFails, L.userWindowMs))) return fail(s, op, 'tooManyLogins');
        if (!pairOf(m.code)) { limiter.hit(ipKey(s)); return fail(s, op, 'gone', pairGone); }
        if (!username || typeof m.pass !== 'string') { limiter.hit(ipKey(s)); return fail(s, op, 'auth', 'Wrong username or password.'); }
        s.state = 'busy';
        try {
          let info = await store.loginInfo(username);
          if (!info) info = await fromRgs(username, m.pass);
          const ok = await passOk(username, m.pass, info);
          s.state = 'anon';
          if (!ok) { limiter.hit(ipKey(s)); limiter.hit(uKey); return fail(s, op, 'auth', 'Wrong username or password.'); }
          if (info.banned > wallNow()) { s.sendJSON({ t: 'refuse', code: 'banned', msg: CODES.banned }); return s.closeSoon('banned'); }
          limiter.clear(uKey);
          const a = await store.accountInfo(info.account);
          s.pairAccount = { account: info.account, username: a ? a.username : username };
          return reply(s, op, { ok: true, username: s.pairAccount.username });
        } catch (err) { s.state = 'anon'; log('pair sign-in failed', err && err.message); return fail(s, op, 'auth', 'Signing in is not working right now.'); }
      }
      case 'pairOk': case 'pairNo': {
        if (s.state !== 'anon' && s.state !== 'authed') return 'order';
        const who = s.pairAccount || (s.state === 'authed' && s.claimed ? { account: s.account, username: s.username } : null);
        if (!who) return fail(s, op, 'auth', 'Sign in on this phone first.');
        const p = pairOf(m.code);
        if (!p) return fail(s, op, 'gone', pairGone);
        pairs.delete(p.key); if (p.e.s.pairKey === p.key) p.e.s.pairKey = null;      // single use: gone before anything is awaited
        const screen = p.e.s;
        if (op === 'pairNo') { reply(screen, 'pairDone', { ok: false, why: 'declined', msg: 'The phone said no. Make a new code to try again.' }); return reply(s, op, { ok: true }); }
        try {
          const token = await store.newToken(who.account, 'session');
          const a = await store.authToken(token);
          if (!a || !a.claimed) { await store.revokeToken(token); return fail(s, op, 'auth', 'That account cannot be signed in to this way.'); }
          if ((a.banned || 0) > wallNow()) { await store.revokeToken(token); return fail(s, op, 'banned', CODES.banned); }
          if (screen.closed) { await store.revokeToken(token); return fail(s, op, 'gone', 'The other screen closed its sign-in code. Make a new one there.'); }
          reply(screen, 'pairDone', { ok: true, token, username: a.username || who.username || null });
          s.pairAccount = null;
          counters.pairUsed = (counters.pairUsed || 0) + 1;
          log('screen signed in from a phone', { account: who.account });
          return reply(s, op, { ok: true, username: a.username || who.username || null });
        } catch (err) { log('pair approve failed', err && err.message); return fail(s, op, 'auth', 'Signing in is not working right now.'); }
      }
    }
    return 'op';
  }

  return {
    handle(s, m) {
      return Promise.resolve(handle(s, m)).catch(err => { log('account op failed', err && err.stack); fail(s, m.op, 'state', 'That did not work. Try again.'); });
    },
    resets: () => resetLog.slice().reverse().map(r => ({ ...r, live: !r.used && r.until > wallNow() })),
    limiter,
    /** Live phone sign-in codes (tests). */
    pairLive: () => { pairSweep(); return pairs.size; },
  };
}
