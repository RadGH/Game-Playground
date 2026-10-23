// One account for every game on games.radgh.com (Rad's Game Server, "RGS"). Made for Radley Sustaire's games.
//
// Signing in is OPTIONAL everywhere: a game must keep working when this module finds no account, no network, or no
// server at all. Thousandvale usernames + passwords work here (same password, separate saves per game).
//
//   import { account } from '../../shared/rgs-account.js';
//   const me = await account.user();            // user object or null
//   account.onChange(u => …);                    // signed in / out, in this tab or another one
//   const ticket = await account.ticket('knockabout');   // hand this to the game's own server to say who you are
//
// Full notes: shared/RGS-ACCOUNT.md. The server side is rads-game-server/api (docs/API.md there).
//
// Where the server is:
//   on games.radgh.com or any *.games.radgh.com page  -> https://games.radgh.com/api
//   anywhere else (LAN dev)                          -> localStorage['rgs.api'] if set, else <this host>:8600/api
// The session lives in an HttpOnly cookie on games.radgh.com. When the server also hands this page a token (it does
// on every sign-in), the token is kept in localStorage['rgs.session'] and sent as a Bearer header — that is what
// makes LAN dev work, where the cookie does not apply.

const HOSTED = /(^|\.)games\.radgh\.com$/i;
const TOKEN_KEY = 'rgs.session';
const SIGNAL_KEY = 'rgs.signal';   // written on every sign-in/out so other tabs hear about it

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function apiBase() {
  if (typeof location === 'undefined') return 'https://games.radgh.com/api';
  if (HOSTED.test(location.hostname)) return 'https://games.radgh.com/api';
  const own = ls.get('rgs.api');
  if (own) return own.replace(/\/+$/, '');
  return `${location.protocol}//${location.hostname}:8600/api`;
}
function accountPage() {
  const own = typeof location !== 'undefined' && !HOSTED.test(location.hostname) && ls.get('rgs.account');
  return own || 'https://games.radgh.com/account/';
}

/** Plain-language messages for the error codes the server sends. Anything unknown falls back to the server's own. */
const MESSAGES = {
  invalid_credentials: "That username or password doesn't match.",
  email_not_confirmed: 'Confirm your email first — check your inbox for the link.',
  bad_username: 'Usernames are 3 to 20 letters, numbers, dots, dashes or underscores.',
  username_taken: 'That username is already taken.',
  weak_password: 'Passwords need at least 8 characters.',
  user_already_exists: 'That email already has an account. Try signing in instead.',
  validation_failed: "That email address doesn't look right.",
  tv_password: "This account's password is your Thousandvale password — change it in Thousandvale.",
  bad_jwt: 'You are signed out.',
  not_admin: 'Only the site owner can see this.',
  pair_gone: 'That sign-in code has expired. Ask the other screen for a new one.',
  network: "Couldn't reach the game server. Check your connection and try again.",
  rate_limited: 'Too many tries. Wait a minute and try again.',
};

function token() {
  const raw = ls.get(TOKEN_KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw);
    if (t.expires_at && t.expires_at * (t.expires_at < 1e12 ? 1000 : 1) < Date.now()) { ls.set(TOKEN_KEY, null); return null; }
    return t.access_token || null;
  } catch { return raw; }
}
function keepSession(session) {
  if (session?.access_token) ls.set(TOKEN_KEY, JSON.stringify({ access_token: session.access_token, expires_at: session.expires_at || null }));
}

/** fetch against the API. Throws an Error with .code, .status and a plain .message. */
async function call(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  const t = token();
  if (t) headers.authorization = `Bearer ${t}`;
  if (method !== 'GET') headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(apiBase() + path, { method, headers, credentials: 'include', signal, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw fail('network', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = data?.error || {};
    throw fail(err.code || (res.status === 429 ? 'rate_limited' : `http_${res.status}`), res.status, err.message);
  }
  return data || {};
}
function fail(code, status, serverMessage) {
  const e = new Error(MESSAGES[code] || serverMessage || 'Something went wrong. Please try again.');
  e.code = code; e.status = status;
  return e;
}

// ---------- state ----------
let current;          // undefined = not asked yet, null = signed out, object = signed in
let asking = null;    // the in-flight GET /auth/session, shared by everyone who asks at once
const listeners = new Set();

function setUser(u, { tell = true } = {}) {
  const before = current ? current.id : current;
  current = u || null;
  if ((current ? current.id : null) === before) return;
  for (const fn of listeners) { try { fn(current); } catch (e) { console.error(e); } }
  if (tell) ls.set(SIGNAL_KEY, JSON.stringify({ id: current?.id || null, at: Date.now() }));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== SIGNAL_KEY && e.key !== TOKEN_KEY) return;
    asking = null;
    fetchUser().then(u => setUser(u, { tell: false }));
  });
}

async function fetchUser() {
  try {
    const u = (await call('/auth/session')).user || null;      // always 200: a signed-out page logs no error
    if (!u) ls.set(TOKEN_KEY, null);
    return u;
  } catch (e) {
    if (e.status === 401) { ls.set(TOKEN_KEY, null); return null; }
    return current || null;   // offline or server down: keep what we knew, never throw at a game
  }
}

export const account = {
  get api() { return apiBase(); },
  get accountUrl() { return accountPage(); },
  /** The user signed in right now, as last known without asking (undefined until user() has been called once). */
  get known() { return current; },

  /** The signed-in user or null. Cached; `fresh: true` asks the server again. Never throws. */
  async user({ fresh = false } = {}) {
    if (!fresh && current !== undefined) return current;
    if (!asking) asking = fetchUser().then(u => { asking = null; setUser(u, { tell: false }); return current; });
    return asking;
  },

  /** fn(user|null) every time sign-in state changes. Returns a function that stops listening. */
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** login = username or email. Resolves to the user; throws Error { code, message } on a wrong password etc. */
  async signIn(login, password) {
    const { session } = await call('/auth/token', { method: 'POST', body: { login: String(login || '').trim(), password } });
    keepSession(session);
    setUser(session?.user || (await call('/auth/user')).user);
    return current;
  },

  /** Make an account and sign in with it at once. email is optional. */
  async signUp({ username, password, email } = {}) {
    const body = { username: String(username || '').trim(), password };
    if (email && String(email).trim()) body.email = String(email).trim();
    const { user, session } = await call('/auth/signup', { method: 'POST', body });
    keepSession(session);
    setUser(user || session?.user);
    return current;
  },

  async signOut() {
    try { await call('/auth/logout', { method: 'POST' }); } catch { /* signed out here either way */ }
    ls.set(TOKEN_KEY, null);
    setUser(null);
  },

  /** Is this username free? -> { name, free } (name = how the server would store it), or null if it can't say. */
  async usernameFree(name) {
    try { return await call(`/auth/username?name=${encodeURIComponent(String(name || '').trim())}`); } catch { return null; }
  },

  /** POST /auth/password. Throws `tv_password` when the password belongs to Thousandvale. */
  async changePassword(old, password) { await call('/auth/password', { method: 'POST', body: { old, password } }); },

  /** A one-time ticket for a game's own server, or null when signed out / unreachable. */
  async ticket(game) {
    try { return (await call('/auth/ticket', { method: 'POST', body: { game } })).ticket || null; }
    catch (e) { if (e.status === 401) setUser(null); return null; }
  },

  /**
   * Start a QR sign-in: this screen shows `url` as a QR code (and the `check` word), a phone opens it and approves.
   * Resolves to { code, check, url, expiresAt, done, cancel, result }:
   *   done    Promise<user|null> — the user when the phone said yes, null for no / expired / cancelled
   *   result  after done settles: 'approved' | 'denied' | 'expired' | 'cancelled'
   */
  async pair(game) {
    const p = await call('/auth/pair', { method: 'POST', body: { game } });
    const own = !HOSTED.test(location.hostname) && ls.get('rgs.account');
    const out = {
      code: p.code, check: p.check,
      url: own ? `${own}${own.includes('?') ? '&' : '?'}pair=${encodeURIComponent(p.code)}` : p.url,
      expiresAt: Date.parse(p.expires_at) || Date.now() + 5 * 60_000,
      result: null,
    };
    let stopped = false, ctrl = null;
    out.cancel = () => { if (out.result) return; stopped = true; ctrl?.abort(); };
    out.done = (async () => {
      while (!stopped) {
        if (Date.now() > out.expiresAt + 5000) { out.result = 'expired'; return null; }
        ctrl = new AbortController();
        let r;
        try { r = await call('/auth/pair/wait', { method: 'POST', body: { secret: p.secret }, signal: ctrl.signal }); }
        catch (e) {
          if (stopped || e.name === 'AbortError') break;
          if (e.code === 'pair_gone') { out.result = 'expired'; return null; }
          await new Promise(res => setTimeout(res, 2000));   // server blip: try again until it expires
          continue;
        }
        if (r.state === 'approved') {
          keepSession(r.session);
          setUser(r.user || r.session?.user || (await call('/auth/user')).user);
          out.result = 'approved'; return current;
        }
        if (r.state === 'denied') { out.result = 'denied'; return null; }
      }
      out.result = 'cancelled'; return null;
    })();
    return out;
  },

  /** For the phone: what is asking to sign in? -> { game, check, state }. Throws pair_gone when expired. */
  async pairInfo(code) { return call(`/auth/pair/info?code=${encodeURIComponent(code)}`); },
  async approvePair(code) { await call('/auth/pair/approve', { method: 'POST', body: { code } }); },
  async denyPair(code) { await call('/auth/pair/deny', { method: 'POST', body: { code } }); },

  /** Raw API access for pages that need more (the admin dashboard). Same headers, same errors. */
  call,
  /**
   * Generic API request: request('POST', '/db/playground', body) -> parsed JSON. Same base URL, cookie, Bearer token
   * and JSON content-type as every other call; throws Error { code, message, status } on an error reply.
   */
  request: (method, path, body) => call(path, { method: String(method || 'GET').toUpperCase(), body }),
  /** The plain message for an error code. */
  message: code => MESSAGES[code] || null,
};

export default account;
