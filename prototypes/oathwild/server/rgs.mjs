// games.radgh.com accounts for the world server (same contract as Tumblefair's server/rgs.mjs createRedeemer): a signed-in
// browser hands its one-time ticket (shared/rgs-account.js account.ticket('oathwild')) to this server, which swaps it
// for the user with POST <RGS_API>/auth/redeem. That answer is the only thing believed about who someone is.
// null for a bad / used / expired ticket, a ticket for another game, or rgs-api being down (the player carries on on
// their device profile). Env: RGS_API (default https://games.radgh.com/api).
export const RGS_API_DEFAULT = 'https://games.radgh.com/api';
export const cleanUserId = id => (typeof id === 'string' || typeof id === 'number') && /^[A-Za-z0-9_-]{1,64}$/.test(String(id)) ? String(id) : null;

export function createRedeemer({ game, api = process.env.RGS_API || RGS_API_DEFAULT, fetchFn = globalThis.fetch, timeoutMs = 4000, log = () => {} } = {}) {
  const base = String(api).replace(/\/+$/, '');
  return async function redeem(ticket) {
    if (typeof ticket !== 'string' || !ticket || ticket.length > 256) return null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchFn(base + '/auth/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket }), signal: ctl.signal });
      let j = null; try { j = await r.json(); } catch { /* not json */ }
      if (!r.ok) { if (j?.error?.code !== 'bad_ticket') log('rgs.redeem.fail', { status: r.status, code: j?.error?.code || null }); return null; }
      const u = j?.user, id = cleanUserId(u?.id);
      if (!id) return null;
      if (j.game && game && j.game !== game) return null;
      return { ...u, id };
    } catch (e) {
      log('rgs.redeem.down', { msg: String(e?.message || e).slice(0, 160) });
      return null;
    } finally { clearTimeout(timer); }
  };
}
