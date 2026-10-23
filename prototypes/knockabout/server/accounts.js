// Accounts (2026-10-23): a games.radgh.com player's Knockabout save — their fighter's name and look — kept on the
// server so the same fighter turns up on any phone or PC they sign in on. Guests keep theirs in the browser, as before.
//
//   POST /account { ticket, guest?: { name, look } }   sign in: -> { ok, account, profile, note }
//   POST /account { ticket, save: { name, look } }     save the fighter: -> { ok, account, profile }
//
// `ticket` is the one-time ticket from shared/rgs-account.js `account.ticket('knockabout')`. It is swapped for the user
// with rgs-api (server/rgs.mjs createRedeemer, injected here as `redeem`); a user id sent by the browser is never used.
// Profiles are keyed `acct:<user id>` in <data>/profiles.json.
// First sign-in on a device: if the account has no fighter yet, the guest fighter becomes the account's (note 'moved');
// if it has one, the account's is used and the device's guest fighter is left alone (note 'kept'). The guest copy stays in
// that browser (it is only a look — nothing like coins that could be counted twice), so signing out gets it back.
// Pure apart from the injected `redeem` and `persist`; tests/accounts.test.js drives it.
import { cleanLook, cleanName } from '../js/net/protocol.js';

export const ACCT = 'acct:';
export const MAX_BODY = 16 * 1024;

export function createAccounts({ redeem, initial = {}, persist = null, now = () => Date.now(), log = () => {} }) {
  const all = new Map(Object.entries(initial || {}));
  let dirty = false;
  const clean = x => {
    if (!x || typeof x !== 'object') return null;
    const look = cleanLook(x.look);
    return look ? { name: cleanName(x.name) || 'Player', look } : null;
  };
  const view = p => p ? { name: p.name, look: p.look } : null;
  const who = u => ({ username: String(u.username || '').slice(0, 40), name: String(u.name || u.username || '').slice(0, 40) });

  /** -> { code, body } */
  async function handle(body) {
    if (!body || typeof body !== 'object' || typeof body.ticket !== 'string') return { code: 400, body: { ok: false, error: { code: 'bad_request' } } };
    const user = await redeem(body.ticket);
    if (!user) return { code: 401, body: { ok: false, error: { code: 'bad_ticket' } } };
    const key = ACCT + user.id, had = all.get(key);
    if (body.save != null) {
      const s = clean(body.save);
      if (!s) return { code: 400, body: { ok: false, error: { code: 'bad_save' } } };
      all.set(key, { ...(had || { made: now() }), ...s, seen: now() }); dirty = true;
      return { code: 200, body: { ok: true, account: who(user), profile: view(all.get(key)) } };
    }
    const guest = clean(body.guest);
    if (had) {
      had.seen = now(); dirty = true;
      const differs = guest && JSON.stringify(view(guest)) !== JSON.stringify(view(had));
      return { code: 200, body: { ok: true, account: who(user), profile: view(had), ...(differs ? { note: 'kept' } : {}) } };
    }
    if (guest) { all.set(key, { ...guest, made: now(), seen: now() }); dirty = true; log('account.moved', {}); return { code: 200, body: { ok: true, account: who(user), profile: view(guest), note: 'moved' } }; }
    return { code: 200, body: { ok: true, account: who(user), profile: null, note: 'new' } };
  }
  /** The HTTP side: reads the JSON body, answers JSON. */
  function http(req, res) {
    const reply = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    let size = 0, chunks = [], over = false;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { over = true; req.destroy(); } else chunks.push(c); });
    req.on('end', async () => {
      if (over) return reply(413, { ok: false });
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(400, { ok: false, error: { code: 'bad_json' } }); }
      try { const r = await handle(body); reply(r.code, r.body); } catch (e) { log('account.error', { msg: String(e?.message || e).slice(0, 200) }); reply(500, { ok: false }); }
    });
  }
  function flush() { if (!dirty || !persist) return; dirty = false; persist(Object.fromEntries(all)); }
  return { handle, http, flush, get: id => view(all.get(ACCT + id)), get size() { return all.size; } };
}
