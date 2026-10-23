// The games.radgh.com account link (2026-10-23, owner: "TV accounts should be linked. I'd like to use my TV account
// for the other games - same password, different saves"). One login for every game lives in rgs-api
// (~/claude/rads-game-server, docs/API.md). Two directions:
//   - a Thousandvale account works on the other games: rgs-api reads Thousandvale's accounts table itself (read-only),
//     so nothing here is needed for that;
//   - an account made on another game works HERE: when a username isn't a Thousandvale account, the login asks rgs-api
//     whether the password is right, and if so a claimed Thousandvale account is made for it whose stored "password"
//     is the marker `rgs:<user id>` (js/sim/accounts.js) — its password stays on games.radgh.com.
// A name being claimed here is also checked free there, so one name is one person everywhere.
// Off when RGS_API is unset (dev, tests, the Web Worker).
//   RGS_API   e.g. http://127.0.0.1:8600/api on the droplet

/** -> null, or { verify(login, pass), redeem(ticket) -> { id, username, linkedHere } | null, nameFree(name) -> bool }. Throws when rgs-api is unreachable. */
export function rgsLinkFromEnv(env = process.env, { log = () => {}, fetchFn = globalThis.fetch } = {}) {
  const api = String(env.RGS_API || '').replace(/\/+$/, '');
  if (!api) return null;
  log('accounts linked to', { api });
  const post = (path, body, token) => fetchFn(api + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return {
    async verify(login, password) {
      const res = await post('/auth/token', { login, password });
      if (res.status === 400) return null;                         // wrong name or password
      if (!res.ok) throw new Error(`rgs-api answered ${res.status}`);
      const { session } = await res.json();
      post('/auth/logout', {}, session.access_token).catch(() => {});   // the check only; don't leave a session behind
      return { id: session.user.id, username: session.user.username, linkedHere: !!session.user.linked?.thousandvale };
    },
    /** A one-time ticket the page got from games.radgh.com -> { id, username, linkedHere } | null. */
    async redeem(ticket) {
      const res = await post('/auth/redeem', { ticket });
      if (res.status === 400) return null;
      if (!res.ok) throw new Error(`rgs-api answered ${res.status}`);
      const { user } = await res.json();
      return { id: user.id, username: user.username, linkedHere: !!user.linked?.thousandvale };
    },
    async nameFree(name) {
      const res = await fetchFn(`${api}/auth/username?name=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`rgs-api answered ${res.status}`);
      return !!(await res.json()).free;
    },
  };
}
