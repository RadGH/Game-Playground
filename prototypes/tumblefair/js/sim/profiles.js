// What a player keeps between matches: a name, a look, coins, and the costumes they own. Keyed by a secret token the
// server hands out on first visit and the browser stores (a GUEST profile), or — since 2026-10-23 — by a games.radgh.com
// account: key `acct:<user id>`, reached only through `signIn(userId)` after the server redeemed a ticket (server/rgs.mjs).
// A browser can never name an `acct:` key itself: `guest(token)` refuses them (random tokens are base64url, no colon).
// Pure: the server gives it `initial` (read from disk) and `persist(all)` (write to disk); tests give it neither.
import { inSeason, seasonByDate, seasonName } from '../shared/seasons.js';
import { cleanName } from '../shared/protocol.js';

export const ACCT = 'acct:';
export function createProfiles({ initial = {}, persist = null, randomToken, now = () => Date.now(), cosmetics, cleanLook }) {
  const all = new Map(Object.entries(initial));
  const byId = new Map(cosmetics.items.map(c => [c.id, c]));
  const free = cosmetics.items.filter(c => !c.price).map(c => c.id);
  let dirty = false;
  const touch = () => { dirty = true; };
  const NAMES = ['Pip', 'Dot', 'Juno', 'Ziggy', 'Mabel', 'Otto', 'Bix', 'Wren', 'Fitz', 'Lulu', 'Gus', 'Posy', 'Moss', 'Tilly', 'Rex', 'Nell'];
  function create() {
    const token = randomToken();
    const seed = Math.floor(Math.random() * 2 ** 31);
    const p = { token, name: NAMES[seed % NAMES.length], look: { v: 1, race: ['human', 'elf', 'dwarf', 'halfling'][seed % 4], seed }, costume: 'cos_none', coins: 0, owned: [], matches: 0, wins: 0, made: now(), seen: now() };
    all.set(token, p); touch(); return p;
  }
  const get = token => { const p = token && all.get(token); if (p) p.seen = now(); return p || null; };
  /** A profile by the token a BROWSER sent: guest profiles only. */
  const guest = token => (typeof token === 'string' && !token.startsWith(ACCT)) ? get(token) : null;
  const worthKeeping = p => !!p && (p.ready || p.matches > 0 || p.coins > 0 || p.owned.length > 0);
  /**
   * A signed-in player (userId from a redeemed ticket, never from the browser). -> { profile, note }
   *   the account has a profile          -> that one; the guest profile is left alone (note 'kept' when it had progress)
   *   it has none, the device has a guest -> the guest profile BECOMES the account's (moved, not copied; note 'moved')
   *   neither                             -> a new profile (note 'new')
   */
  function signIn(userId, guestToken = null) {
    const key = ACCT + userId, had = all.get(key), g = guest(guestToken);
    if (had) { had.seen = now(); return { profile: had, note: worthKeeping(g) && g !== had ? 'kept' : null }; }
    if (g) { all.delete(g.token); g.token = key; g.account = userId; g.seen = now(); all.set(key, g); touch(); return { profile: g, note: 'moved' }; }
    const p = create(); all.delete(p.token); p.token = key; p.account = userId; all.set(key, p); touch();
    return { profile: p, note: 'new' };
  }
  const owns = (p, id) => free.includes(id) || p.owned.includes(id);
  /** What the owner's own browser is told. */
  // `ready`: this player has chosen a name or a look at least once (or has played) — a newcomer who opens an invite link is
  // shown "pick a name and a look" before joining, instead of walking in as a random Pip or Dot (2026-10-20)
  const view = p => ({ name: p.name, look: p.look, costume: p.costume, coins: p.coins, owned: [...free, ...p.owned], matches: p.matches, wins: p.wins, ready: !!p.ready || p.matches > 0 });
  function update(token, { name, look }) {
    const p = get(token); if (!p) return null;
    const out = {};
    if (name != null) { const n = cleanName(name); if (n) { p.name = n; out.name = n; } }
    if (look != null) { const r = cleanLook(look, p.look); if (r.ok) { p.look = r.look; out.look = r.look; } }
    if (out.name || out.look) p.ready = true;
    touch(); return out;
  }
  function reward(token, coins, { won = false } = {}) { const p = get(token); if (!p) return null; p.coins += Math.max(0, Math.floor(coins)); p.matches++; if (won) p.wins++; touch(); return p.coins; }
  function buy(token, id) {
    const p = get(token), c = byId.get(id);
    if (!p || !c) return { ok: false, msg: 'No such costume.' };
    if (!inSeason(c, seasonByDate(new Date(now())))) return { ok: false, msg: `${c.name} is only in the shop for ${seasonName(c.season)}.` };
    if (owns(p, id)) return { ok: false, msg: 'You already own that.' };
    if (p.coins < c.price) return { ok: false, msg: `That costs ${c.price} coins. You have ${p.coins}.` };
    p.coins -= c.price; p.owned.push(id); touch();
    return { ok: true };
  }
  function equip(token, id) { const p = get(token); if (!p || !byId.has(id) || !owns(p, id) || !inSeason(byId.get(id), seasonByDate(new Date(now())))) return false; p.costume = id; touch(); return true; }
  function flush() { if (!dirty || !persist) return; dirty = false; persist(Object.fromEntries(all)); }
  return { create, get, guest, signIn, view, update, reward, buy, equip, flush, get size() { return all.size; } };
}
