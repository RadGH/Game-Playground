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
// The reset stub sends no email: the one-hour code goes to the ADMIN page (server/admin.mjs) and the owner
// passes it on; the server log records only that a reset was asked for.
//
//   const A = createAccounts({ store, hasher, verifyHuman, wallNow, log, filter, sendAll, kickChar, counters })
//   A.handle(s, m)            the `account {op}` message (docs/protocol.md §16.1)
//   A.resets()                recent reset codes for the admin page
//   A.limiter                 login / reset attempt limits (tests read it)

import { CODES } from '../net/protocol.js';
import { sha256Hex, randomHex } from './sha256.js';

export const ACCOUNT_OPS = Object.freeze(['claim', 'login', 'logout', 'password', 'resetAsk', 'reset', 'info', 'peek', 'adopt']);
export const LOGIN_LIMITS = Object.freeze({
  ipFails: 10, ipWindowMs: 10 * 60000,          // failed logins from one address
  userFails: 5, userWindowMs: 15 * 60000,       // failed logins on one username
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

export function createAccounts({ store, hasher = null, verifyHuman = null, wallNow, log = () => {}, filter = null, sendAll = () => {}, kickChar = () => {}, counters = {}, trustIps = [], charLimit = 20 }) {
  const limiter = createLimiter(wallNow);
  const L = LOGIN_LIMITS;
  const resetLog = [];             // { at, username, email, code, until } for the admin page (last 50)
  const reply = (s, op, x) => s.sendJSON({ t: 'accountR', op, ...x });
  const fail = (s, op, why, msg) => reply(s, op, { ok: false, why, msg: msg || CODES[why] || why });
  const human = (s, m) => (verifyHuman ? Promise.resolve(m.human ? verifyHuman(m.human, s.ip) : false).catch(() => false) : Promise.resolve(true));
  const ipKey = s => 'ip:' + (s.ip || '?');
  const limited = s => !trustIps.includes(s.ip);

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
        const username = cleanUsername(m.user);
        const uKey = 'user:' + String(username || m.user || '').toLowerCase();
        if (limited(s) && (limiter.over(ipKey(s), L.ipFails, L.ipWindowMs) || limiter.over(uKey, L.userFails, L.userWindowMs))) return fail(s, op, 'tooManyLogins');
        if (!username || typeof m.pass !== 'string') { limiter.hit(ipKey(s)); return fail(s, op, 'auth', 'Wrong username or password.'); }
        s.state = 'busy';
        try {
          const info = await store.loginInfo(username);
          const ok = !!(info && info.passHash) && await hasher.verifyPassword(m.pass, info.passHash);
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
        if (!info || info.account !== s.account || !(await hasher.verifyPassword(String(m.old || ''), info.passHash))) { limiter.hit(uKey); return fail(s, op, 'auth', 'Your current password is not right.'); }
        await store.setPassword(s.account, await hasher.hashPassword(pass), s.token);
        return reply(s, op, { ok: true });
      }
      case 'resetAsk': {
        if (s.state !== 'anon' && s.state !== 'authed') return 'order';
        const said = { ok: true, msg: 'If that account exists, a reset code has been sent to the game\'s keeper. Ask them for it; it works for one hour.' };
        if (limited(s) && limiter.over('reset:' + (s.ip || '?'), L.resetAsks, L.resetWindowMs)) return fail(s, op, 'tooManyLogins');
        limiter.hit('reset:' + (s.ip || '?'));
        const username = cleanUsername(m.user);
        const info = username ? await store.loginInfo(username) : null;
        if (!info) return reply(s, op, said);                      // never say whether a username exists
        const code = randomHex(4).toUpperCase();
        const until = wallNow() + L.resetMs;
        await store.setReset(info.account, sha256Hex('reset:' + code), until);
        const a = await store.accountInfo(info.account);
        resetLog.push({ at: wallNow(), account: info.account, username: a ? a.username : username, email: a ? a.email : null, code, until });
        while (resetLog.length > 50) resetLog.shift();
        log('password reset asked', { account: info.account });     // the code itself goes only to the admin page
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
    }
    return 'op';
  }

  return {
    handle(s, m) {
      return Promise.resolve(handle(s, m)).catch(err => { log('account op failed', err && err.stack); fail(s, m.op, 'state', 'That did not work. Try again.'); });
    },
    resets: () => resetLog.slice().reverse().map(r => ({ ...r, live: !r.used && r.until > wallNow() })),
    limiter,
  };
}
