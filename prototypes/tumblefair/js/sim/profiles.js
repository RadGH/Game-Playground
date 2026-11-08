// What a player keeps between matches: a name, a look, coins, and the costumes they own. Keyed by a secret token the
// server hands out on first visit and the browser stores (a GUEST profile), or — since 2026-10-23 — by a games.radgh.com
// account: key `acct:<user id>`, reached only through `signIn(userId)` after the server redeemed a ticket (server/rgs.mjs).
// A browser can never name an `acct:` key itself: `guest(token)` refuses them (random tokens are base64url, no colon).
// Pure: the server gives it `initial` (read from disk) and `persist(all)` (write to disk); tests give it neither.
import { inSeason, seasonByDate, seasonName } from '../shared/seasons.js';
import { cleanName } from '../shared/protocol.js';
import { newPass, applyProgress, passView as passViewOf, plateOk, passCostumes, badge as passBadge } from './pass.js';   // Expansion 1 M7: the Fair Pass

export const ACCT = 'acct:';
// `passData` (data/pass.json) + `stickers` (data/stickers.json `stickers`): the Fair Pass (Expansion 1 M7). Without them
// the pass is off (progress() answers null) — older tests and tools build profiles without it.
export function createProfiles({ initial = {}, persist = null, randomToken, now = () => Date.now(), cosmetics, cleanLook, passData = null, stickers = [] }) {
  const all = new Map(Object.entries(initial));
  const byId = new Map(cosmetics.items.map(c => [c.id, c]));
  const free = cosmetics.items.filter(c => !c.price && !c.pass).map(c => c.id);   // a Fair Pass costume (`pass: level`) is unlocked by level, not free
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
  const unlocked = p => (passData ? passCostumes(p.pass, cosmetics, passData) : []);
  const owns = (p, id) => free.includes(id) || p.owned.includes(id) || unlocked(p).includes(id);
  /** What the owner's own browser is told. */
  // `ready`: this player has chosen a name or a look at least once (or has played) — a newcomer who opens an invite link is
  // shown "pick a name and a look" before joining, instead of walking in as a random Pip or Dot (2026-10-20)
  const view = p => ({ name: p.name, look: p.look, costume: p.costume, coins: p.coins, owned: [...free, ...p.owned, ...unlocked(p)], matches: p.matches, wins: p.wins, ready: !!p.ready || p.matches > 0, ...(passData ? { pass: passViewOf(p.pass, { now: now(), data: passData, games: p.games }) } : {}) });
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
    if (c.pass) return { ok: false, msg: `${c.name} is a Fair Pass reward: it unlocks at level ${c.pass}.` };   // M7: never sold
    if (p.coins < c.price) return { ok: false, msg: `That costs ${c.price} coins. You have ${p.coins}.` };
    p.coins -= c.price; p.owned.push(id); touch();
    return { ok: true };
  }
  function equip(token, id) { const p = get(token); if (!p || !byId.has(id) || !owns(p, id) || !inSeason(byId.get(id), seasonByDate(new Date(now())))) return false; p.costume = id; touch(); return true; }
  // ---- round 10 (reports #28, #29: "I want to see my like history" / "my play count"): every minigame this player has
  // played, how many times, when last, and their latest 👍/👎 with its reasons. The ROOM calls played() when a minigame
  // ends and rated() when a player rates one (both already checked there); the "My games" screen reads history().
  // p.games = { [gameId]: { n, last, v?, why?, at? } }, at most GAMES_KEPT ids (the least recently played go first).
  const GAMES_KEPT = 300, okId = id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
  function trimGames(p) { const ids = Object.keys(p.games); if (ids.length <= GAMES_KEPT) return; ids.sort((a, b) => (p.games[a].last || 0) - (p.games[b].last || 0)); for (const id of ids.slice(0, ids.length - GAMES_KEPT)) delete p.games[id]; }
  function played(token, id) {
    const p = get(token); if (!p || !okId(id)) return false;
    const g = (p.games ||= {})[id] ||= { n: 0, last: 0 }; g.n++; g.last = now(); trimGames(p); touch(); return true;
  }
  function rated(token, id, v, why = []) {
    const p = get(token); if (!p || !okId(id) || !(v === 1 || v === -1)) return false;
    const g = (p.games ||= {})[id] ||= { n: 0, last: now() }; g.v = v; g.why = (Array.isArray(why) ? why : []).filter(w => typeof w === 'string').slice(0, 6); g.at = now(); trimGames(p); touch(); return true;
  }
  /** -> [{ id, n, last, v, why }] newest first. */
  function history(token) {
    const p = get(token); if (!p?.games) return [];
    return Object.entries(p.games).map(([id, g]) => ({ id, n: g.n || 0, last: g.last || g.at || 0, v: g.v || 0, why: g.why || [] })).sort((a, b) => b.last - a.last);
  }
  // ---- Expansion 1 M7: the Fair Pass. The room reports what happened (js/sim/pass.js createPassMatch); this applies it.
  /** -> applyProgress's answer (stickers, XP, levels, rewards, daily), or null (no such profile / pass off). Coins it pays go on the wallet. */
  function progress(token, delta, { season = null } = {}) {
    const p = get(token); if (!p || !passData) return null;
    p.pass ||= newPass();
    const out = applyProgress(p.pass, delta, { now: now(), season, stickers, data: passData, games: p.games });
    if (out.coins) p.coins += out.coins;
    touch(); return out;
  }
  const passView = token => { const p = get(token); return p && passData ? passViewOf(p.pass, { now: now(), data: passData, games: p.games }) : null; };
  /** Wear a name-plate colour the pass has reached. */
  function setPlate(token, id) { const p = get(token); if (!p || !passData) return false; p.pass ||= newPass(); if (!plateOk(p.pass, id, passData)) return false; p.pass.plate = id; touch(); return true; }
  /** Without touching `seen`: the level + plate on a player's chip. */
  const badge = token => { const p = token && all.get(token); return p && passData ? passBadge(p.pass, passData) : null; };
  function flush() { if (!dirty || !persist) return; dirty = false; persist(Object.fromEntries(all)); }
  return { create, get, guest, signIn, view, update, reward, buy, equip, played, rated, history, progress, passView, setPlate, badge, passData, flush, get size() { return all.size; } };
}
