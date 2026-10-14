// What a player keeps between matches: a name, a look, coins, and the costumes they own. Keyed by a secret token the
// server hands out on first visit and the browser stores — no accounts, no passwords, nothing personal.
// Pure: the server gives it `initial` (read from disk) and `persist(all)` (write to disk); tests give it neither.
import { cleanName } from '../shared/protocol.js';

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
  const owns = (p, id) => free.includes(id) || p.owned.includes(id);
  /** What the owner's own browser is told. */
  const view = p => ({ name: p.name, look: p.look, costume: p.costume, coins: p.coins, owned: [...free, ...p.owned], matches: p.matches, wins: p.wins });
  function update(token, { name, look }) {
    const p = get(token); if (!p) return null;
    const out = {};
    if (name != null) { const n = cleanName(name); if (n) { p.name = n; out.name = n; } }
    if (look != null) { const r = cleanLook(look, p.look); if (r.ok) { p.look = r.look; out.look = r.look; } }
    touch(); return out;
  }
  function reward(token, coins, { won = false } = {}) { const p = get(token); if (!p) return null; p.coins += Math.max(0, Math.floor(coins)); p.matches++; if (won) p.wins++; touch(); return p.coins; }
  function buy(token, id) {
    const p = get(token), c = byId.get(id);
    if (!p || !c) return { ok: false, msg: 'No such costume.' };
    if (owns(p, id)) return { ok: false, msg: 'You already own that.' };
    if (p.coins < c.price) return { ok: false, msg: `That costs ${c.price} coins. You have ${p.coins}.` };
    p.coins -= c.price; p.owned.push(id); touch();
    return { ok: true };
  }
  function equip(token, id) { const p = get(token); if (!p || !byId.has(id) || !owns(p, id)) return false; p.costume = id; touch(); return true; }
  function flush() { if (!dirty || !persist) return; dirty = false; persist(Object.fromEntries(all)); }
  return { create, get, view, update, reward, buy, equip, flush, get size() { return all.size; } };
}
