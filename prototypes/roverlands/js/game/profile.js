// A player's saved profile (Expansion 1 M2, docs/EXPANSION-1.md "Profile"): gold, what they own, their look, job levels,
// achievements, stats. PURE (no DOM, no storage, no sockets): the room (js/net/room-core.js) is the only thing that
// changes it, on the server for online rooms and in the page (js/net/loopback.js) for solo play. Where it is kept:
// server/profiles.mjs (online, <data>/profiles.json keyed `acct:<id>` or `dev:<device id>`) and localStorage
// `roverlands.profile` (solo).
//
//   profile = { v: 1, gold, owned: { vehicles: [ids], clothes: ['slot:id'], items: [ids], kits: [ids] }, look,
//               jobs: { <jobId>: { level, done: [levels done at least once], upgrades: [ids], best } },
//               ach: { <achId>: timeDone }, stats: { metres, jumps, … }, seen: { jobs: [ids] },
//               sites?: [{ id, kit, place, p, yaw, q, paid, at }] }   (M10: survey kits set up in the world)
//
// Clothes are owned as 'slot:id' (the look editor's wear slots: 'top:tshirt', 'hat:ball_cap'), because the same part
// id can be in two slots ('wraps' is a top AND shoes). Rule 2 of the expansion: nothing bought is ever taken away —
// there is no sell and no loss here; gold only goes up through grant() and down through buy().
//
// These helpers change the profile they are handed IN PLACE (the room holds the one live copy) and say what happened.

export const PROFILE_V = 1;
export const START_GOLD = 200;
export const START_VEHICLES = Object.freeze(['trail_jeep']);
/** Plain everyday clothes everybody starts with (Chibi 2.5/2.6 part ids, avatar-2d/js/parts). */
export const START_CLOTHES = Object.freeze(['top:tshirt', 'bottom:jeans', 'shoes:sneakers', 'hat:ball_cap']);
export const OWN_KINDS = Object.freeze(['vehicles', 'clothes', 'items', 'kits']);
export const MAX_GOLD = 1_000_000_000;
export const MAX_GRANT = 100_000;                 // one grant (one job step) can never pay more than this
const MAX_OWNED = 400;                            // per kind
export const ITEM_ID = /^[a-z0-9_]{1,40}(:[a-z0-9_]{1,40})?$/;
const KEY = /^[a-z0-9_]{1,40}$/;

const intIn = (v, lo, hi, def) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : def;
const idList = (v, n = MAX_OWNED, re = ITEM_ID) => [...new Set((Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && re.test(x)))].slice(0, n);

/** A brand-new player's profile. */
export function newProfile(look = null) {
  return { v: PROFILE_V, gold: START_GOLD, owned: { vehicles: [...START_VEHICLES], clothes: [...START_CLOTHES], items: [], kits: [] },
    look: look && typeof look === 'object' ? look : null, jobs: {}, ach: {}, stats: {}, seen: { jobs: [] } };
}

/**
 * Anything read back from storage, made into a valid profile (a broken or hand-edited save never crashes a room).
 * The starting vehicle and clothes are always owned (they were given, so they can never be lost).
 */
export function cleanProfile(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return newProfile();
  const p = newProfile(x.look && typeof x.look === 'object' && !Array.isArray(x.look) ? x.look : null);
  p.gold = intIn(x.gold, 0, MAX_GOLD, START_GOLD);
  for (const k of OWN_KINDS) p.owned[k] = idList([...(p.owned[k] || []), ...(x.owned?.[k] || [])]);
  if (x.jobs && typeof x.jobs === 'object') for (const [id, j] of Object.entries(x.jobs).slice(0, 100)) {
    if (!KEY.test(id) || !j || typeof j !== 'object') continue;
    p.jobs[id] = { level: intIn(j.level, 1, 999, 1), done: [...new Set((Array.isArray(j.done) ? j.done : []).filter(Number.isInteger))].slice(0, 100).sort((a, b) => a - b),
      upgrades: idList(j.upgrades, 50), ...(Number.isFinite(j.best) ? { best: j.best } : {}) };
  }
  if (x.ach && typeof x.ach === 'object') for (const [id, t] of Object.entries(x.ach).slice(0, 300)) if (KEY.test(id) && Number.isFinite(t)) p.ach[id] = t;
  if (x.stats && typeof x.stats === 'object') for (const [k, v] of Object.entries(x.stats).slice(0, 60)) if (KEY.test(k) && Number.isFinite(v)) p.stats[k] = v;
  p.seen.jobs = idList(x.seen?.jobs, 200, KEY);
  const cities = idList(x.seen?.cities, 40, KEY); if (cities.length) p.seen.cities = cities;
  const sites = cleanSites(x.sites); if (sites.length) p.sites = sites;
  return p;
}
/**
 * M10: the survey kits a player has set up, kept so they stand there next session (js/game/jobs/survey.js):
 * [{ id, kit, place, p: [x, y, z], yaw, q, paid, at }]. At most 40; anything malformed is dropped.
 */
export function cleanSites(v) {
  const out = [], ids = new Set();
  for (const s of Array.isArray(v) ? v : []) {
    if (out.length >= 40) break;
    if (!s || !Number.isInteger(s.id) || s.id < 1 || ids.has(s.id) || !KEY.test(s.kit) || !KEY.test(s.place)) continue;
    if (!Array.isArray(s.p) || s.p.length !== 3 || !s.p.every(n => Number.isFinite(n) && Math.abs(n) < 1e5)) continue;
    ids.add(s.id);
    out.push({ id: s.id, kit: s.kit, place: s.place, p: s.p.map(n => Math.round(n * 100) / 100), yaw: Number.isFinite(s.yaw) ? Math.round(s.yaw * 1000) / 1000 : 0,
      q: Number.isFinite(s.q) ? Math.max(0, Math.min(1, s.q)) : 0, paid: !!s.paid, at: Number.isFinite(s.at) ? s.at : 0 });
  }
  return out;
}

/**
 * data/shop.json -> Map(id -> { id, kind, name, price, soon, includes? }). `kind` is the owned list it goes in. Ids are unique across
 * the whole shop (a test checks); a row with no usable price is left out.
 */
export function shopTable(shop) {
  const T = new Map();
  for (const kind of OWN_KINDS) for (const r of Array.isArray(shop?.[kind]) ? shop[kind] : []) {
    if (!r || typeof r.id !== 'string' || !ITEM_ID.test(r.id) || T.has(r.id)) continue;
    if (!Number.isInteger(r.price) || r.price < 0) continue;
    // includes (M11): other ids of the same kind that come with it, kept forever too (the rocket brings its landing pod)
    const inc = Array.isArray(r.includes) ? r.includes.filter(x => typeof x === 'string' && ITEM_ID.test(x)) : [];
    T.set(r.id, { id: r.id, kind, name: r.name || r.id, price: r.price, soon: !!r.soon, ...(inc.length ? { includes: inc } : {}) });
  }
  return T;
}

export const owns = (profile, kind, id) => !!profile?.owned?.[kind]?.includes(id);

/** null when `itemId` can be bought now, else a player-facing sentence saying why not. */
export function buyRefusal(profile, table, itemId) {
  const row = table.get(itemId);
  if (!row) return 'That is not for sale.';
  if (row.soon) return 'Not for sale yet — coming soon.';
  if (owns(profile, row.kind, itemId)) return 'You already own that.';
  if (profile.owned[row.kind].length >= MAX_OWNED) return 'You cannot carry any more of those.';
  if (profile.gold < row.price) return `You need ${row.price - profile.gold} more gold.`;
  return null;
}
/** Buy: -> { ok: true, row, price } (gold taken, the thing owned forever) | { ok: false, why }. */
export function applyBuy(profile, table, itemId) {
  const why = buyRefusal(profile, table, itemId);
  if (why) return { ok: false, why };
  const row = table.get(itemId);
  profile.gold -= row.price;
  profile.owned[row.kind].push(itemId);
  for (const x of row.includes || []) if (!profile.owned[row.kind].includes(x)) profile.owned[row.kind].push(x);
  return { ok: true, row, price: row.price };
}
/** Pay: -> { ok: true, amount } | { ok: false }. Whole gold only, more than 0, at most MAX_GRANT, never past MAX_GOLD. */
export function applyGrant(profile, amount) {
  if (!Number.isFinite(amount)) return { ok: false };
  const n = Math.min(MAX_GRANT, Math.floor(amount), MAX_GOLD - profile.gold);
  if (n <= 0) return { ok: false };
  profile.gold += n;
  return { ok: true, amount: n };
}

// ---------------------------------------------------------------------------------------------------- the wardrobe (M4)
// In County rooms you wear only clothes you own. The look format is Knockabout's (look.wear = { slot: { id, color } }).
// CLOTHING_SLOTS are things you put on; the face slots (face marks, ears), the face, hair, skin and every colour are free.
// A look is never refused for wearing something you do not own: that piece is swapped for one you do (so an old look,
// or one made on the title screen with every part open, still works) — stripLook() below.
export const CLOTHING_SLOTS = Object.freeze(['hat', 'top', 'bottom', 'shoes', 'cape', 'accessory', 'decor']);
/** Slots that may be empty ('none' is a real part id there). Top, bottom and shoes always hold something. */
export const EMPTY_OK = Object.freeze(['hat', 'cape', 'accessory', 'decor']);
/** What an unowned piece becomes when nothing owned is in that slot: the starting clothes. */
export const FALLBACK = Object.freeze({ top: 'tshirt', bottom: 'jeans', shoes: 'sneakers' });
/** The owned part ids of one slot ('none' first where a slot may be empty). */
export function ownedIn(profile, slot) {
  const ids = (profile?.owned?.clothes || []).filter(c => c.startsWith(slot + ':')).map(c => c.slice(slot.length + 1));
  return EMPTY_OK.includes(slot) ? ['none', ...ids.filter(i => i !== 'none')] : ids;
}
/**
 * The look with every clothing piece the player does not own swapped out (a new object; the input is not changed).
 * A look with no `wear` at all (the seed's random clothes) gets the plain owned set. Colours are kept.
 *   -> { look, stripped: ['slot:id', …] }
 */
export function stripLook(look, profile) {
  if (!look || typeof look !== 'object') return { look, stripped: [] };
  const wear = { ...(look.wear && typeof look.wear === 'object' ? look.wear : {}) }, stripped = [];
  for (const slot of CLOTHING_SLOTS) {
    const part = wear[slot] && typeof wear[slot] === 'object' ? wear[slot] : null, id = part?.id;
    const ok = id != null && (EMPTY_OK.includes(slot) && id === 'none' || owns(profile, 'clothes', slot + ':' + id));
    if (ok) continue;
    if (id != null) stripped.push(slot + ':' + id);
    const mine = ownedIn(profile, slot).filter(i => i !== 'none');
    const swap = EMPTY_OK.includes(slot) ? 'none' : (mine.includes(FALLBACK[slot]) ? FALLBACK[slot] : mine[0] || FALLBACK[slot]);
    wear[slot] = { ...(part || {}), id: swap };
    if (swap === 'none') { delete wear[slot].color; delete wear[slot].color2; }
  }
  const out = { ...look, wear };
  delete out.preset;               // a whole-costume label no longer describes the stripped look
  return { look: out, stripped };
}

