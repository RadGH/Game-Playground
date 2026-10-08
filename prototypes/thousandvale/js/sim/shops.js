// SHOPS (stream A, play-test 2: Q9 + Q11 "the merchant and the smith have no shops"). Pure.
//
// Stream E's data/provinces/shops.json says what every trader sells (`kinds.<kind>`: `categories` of gear rolled at the
// BUYER's level — never above the town's `levelCap` — and fixed `goods`: potions, Farhold gear such as mounts and quivers,
// Thousandvale goods from `goodsCatalog`), which kinds each town has (`towns.<name>.shops`, with `priceMult` and `stock`
// overrides) and the `pricing` (sell factor, buyback, restock minutes, price per item level, rarity cap). An NPC's kind
// comes from its office (offices.json `shop`, carried on the NPC as `npc.shop`), else its role's kind.
//
// Gear is made by the combat rules: C's `rules.makeItem(e, {base, rarity, level})` when it has one, else Farhold's own
// generator through the rules' engine (`rpg.rollDrop` held to one base and one rarity), else `rules.rollLoot`. So a shop
// sword is a real Farhold sword. Farhold items never wear out, so there are no repairs.
//
// Stock is per NPC per level bracket, rebuilt every `restockMinutes`, never runs out. Selling pays `sellFactor` of the
// price; the last `buyback` things you sold come back for what you got. DEFAULT_SHOPS stands in where E has no file.
//
//   const S = createShops({ data, mounts, now, log, rng })
//   S.kindOf(npc) -> kind id | null ; S.shopOf(role|kind) ; S.stock(npc, e, rules, townName) -> rows ; S.price ; S.sellPrice

export const SHOP_RANGE = 6;
export const BRACKET = 3;
import { economy } from './economy-knobs.js';
export const DEFAULT_PRICING = Object.freeze({ sellFactor: 0.25, buyback: 12, restockMinutes: 30, perItemLevel: 0.12, rarityCap: 'rare' });
export const DEFAULT_SHOPS = Object.freeze({
  general: { name: 'General Goods', role: 'merchant', categories: { other: { label: 'Rings & charms', bases: ['ring', 'necklace'], count: 3, rarity: { normal: 0.6, magic: 0.4 } }, armor: { label: 'Plain clothes', bases: ['cloth_helm', 'cloth_chest', 'cloth_legs', 'light_boots'], count: 4, rarity: { normal: 1 } } }, goods: [] },
  weaponsmith: { name: 'Smithy', role: 'smith', categories: { weapon: { label: 'Weapons', bases: ['sword', 'dagger', 'hammer', 'battleaxe', 'iron_mace', 'spear', 'sword2h', 'bow', 'staff', 'wand'], count: 8, rarity: { normal: 0.7, magic: 0.3 } }, armor: { label: 'Armour', bases: ['light_chest', 'light_helm', 'light_legs', 'light_gauntlets', 'light_boots', 'shield'], count: 6, rarity: { normal: 1 } } }, goods: [] },
  stable: { name: 'Stables', role: 'stablemaster', categories: {}, goods: [], mounts: true },
});
const ROLE_KIND = { merchant: 'general', smith: 'weaponsmith', stablehand: 'stable', stablemaster: 'stable' };
const LADDER = ['normal', 'magic', 'rare', 'legendary'];
const RARITY_PRICE = { normal: 1, common: 1, magic: 2, uncommon: 2, rare: 4, legendary: 10, set: 10, unique: 20 };

export function createShops({ data = null, mounts = null, now = () => Date.now(), log = () => {}, rng = Math.random } = {}) {
  const kinds = { ...DEFAULT_SHOPS, ...((data && data.kinds) || {}) };
  const towns = (data && data.towns) || {};
  const catalog = (data && data.goodsCatalog) || {};
  // V2: economy.json server.shop are the base numbers; shops.json `pricing` (E) still wins where it names the same key
  const ES = economy().shop;
  const pricing = { ...DEFAULT_PRICING, sellFactor: ES.sellFactor, perItemLevel: ES.perItemLevel, buyback: ES.buyback, restockMinutes: ES.restockMinutes, ...((data && data.pricing) || {}) };
  const roleKind = { ...ROLE_KIND };
  for (const [k, v] of Object.entries(kinds)) if (v && v.role && !roleKind[v.role]) roleKind[v.role] = k;
  const cache = new Map();          // `${npcKey}|${bracket}` -> { at, stock }

  /** The shop kind an NPC (entity or spec) trades: its office's `shop`, else its role's. Null = no shop. */
  function kindOf(npc) {
    const n = npc && npc.data && npc.data.npc ? npc.data.npc : npc && npc.npc ? npc.npc : null;
    if (!n) return null;
    const k = n.shop || roleKind[n.role];
    return k && kinds[k] && hasWares(kinds[k]) ? k : null;
  }
  const hasWares = k => Object.keys(k.categories || {}).length > 0 || (k.goods || []).length > 0 || !!k.mounts;
  const shopOf = roleOrKind => { const k = kinds[roleOrKind] ? roleOrKind : roleKind[roleOrKind]; return k && kinds[k] && hasWares(kinds[k]) ? { kind: k, title: kinds[k].name || k, ...kinds[k] } : null; };
  const townOf = name => { if (!name) return null; const b = String(name).toLowerCase(); for (const [k, v] of Object.entries(towns)) if (k.toLowerCase() === b) return v; return null; };

  const itemLevel = it => Math.max(1, (it && (it.itemLevel || it.ilvl || it.level || it.req)) | 0 || 1);
  /** What a shop asks for an item: the rules' price (Farhold rpg.price) × E's per-item-level rise × the town's mult. */
  function price(item, rules = null, townMult = 1) {
    if (item && Number.isFinite(item.shopPrice)) return item.shopPrice;
    let p = 0;
    // owner feedback 7 V2 (stream C's edit, 2 lines): `rules.price` is FINAL for the item's level (js/rules/economy.js), so the
    // per-item-level rise below is only for the old Farhold price — applying both priced a level-2 glove 12% twice over
    const final = !!(rules && rules.price);
    if (rules) {
      try { p = rules.price ? +rules.price(item) : (engineOf(rules) && engineOf(rules).rpg.price ? +engineOf(rules).rpg.price(item) : 0); } catch (err) { log('price failed', err && err.message); }
    }
    if (!(p > 0)) p = Math.round(ES.fallbackPrice * ((ES.rarityPrice || RARITY_PRICE)[item && item.rarity] || 1));
    return Math.max(1, Math.round(p * (final && p > 0 ? 1 : 1 + pricing.perItemLevel * (itemLevel(item) - 1)) * (townMult || 1)));
  }
  // T25 (play-test 5): a fish, junk, a trophy or a cooked meal sells for its OWN price (E's `price` = what a merchant pays;
  // C scales it by the fish's size) — never the gear formula. Junk is worth nothing (selling it just gets rid of it).
  const ownPrice = item => item && (item.kind === 'fish' || item.kind === 'junk' || item.kind === 'trophy' || item.kind === 'material' /* W9 (P-core) */) && Number.isFinite(item.price);
  const sellPrice = (item, rules) => (ownPrice(item) ? Math.max(0, Math.round(item.price * (item.kind === 'fish' ? ES.fishFactor : 1))) : item && (item.kind === 'crate' || item.kind === 'gift') ? ES.crateSell : rules && rules.sellPrice ? Math.max(1, +rules.sellPrice(item) || 1) : Math.max(1, Math.floor(price(item, rules) * pricing.sellFactor)));   // V2: what a merchant pays for gear is the rules' one function when it exists
  /** A goods-catalog item by id (E's quest `grant` / `reward.goods`: a rod, a tin of worms), or null. */
  const goodOf = id => (catalog[id] ? good({ id, source: 'good' }, null) : null);
  /** A potion item by id (play-test 6 U17: potion drops), named from the engine's potion table when the rules have one. */
  const potionOf = (id, rules = null) => good({ id, source: 'potion' }, rules);
  const engineOf = rules => (rules && rules.room && rules.room.engine) || null;

  function pickRarity(weights, cap) {
    const capI = LADDER.indexOf(cap || pricing.rarityCap);
    const list = Object.entries(weights || { normal: 1 }).filter(([r]) => capI < 0 || LADDER.indexOf(r) <= capI);
    const sum = list.reduce((a, [, w]) => a + (+w || 0), 0) || 1;
    let x = rng() * sum;
    for (const [r, w] of list) { x -= +w || 0; if (x <= 0) return r; }
    return list.length ? list[list.length - 1][0] : 'normal';
  }
  function makeOne(rules, e, { base, rarity = 'normal', level = 1 }) {
    let it = null;
    try {
      if (rules.makeItem) it = rules.makeItem(e, { base, rarity, level });
      const eng = !it && engineOf(rules);
      if (!it && eng && eng.rpg && eng.rpg.rollDrop) {
        const r = rules.room.streams && rules.room.streams.get('loot');
        // held to ONE base and ONE rarity: no rarity lift (rarityBoost 0 rolls 'normal'), the floor raises it to `rarity`
        if (r) it = eng.rpg.rollDrop({ level, rng: r, chance: 1, bases: [base], rarityBoost: 0, floor: rarity === 'normal' ? null : rarity });
      }
      if (!it && rules.rollLoot) it = (rules.rollLoot(e, { level, tier: rarity === 'normal' ? 'magic' : rarity }) || [])[0] || null;
    } catch (err) { log('shop item failed', err && err.message); }
    return it && typeof it === 'object' ? it : null;
  }
  function good(g, rules) {
    if (g.source === 'potion') {
      const eng = engineOf(rules), pot = eng && eng.items && eng.items.potions ? eng.items.potions[g.id] : null;
      return { kind: 'potion', id: g.id, name: (pot && pot.name) || title(g.id), desc: (pot && (pot.desc || pot.description)) || '', rarity: 'normal', stack: 1, ...(pot && pot.effect ? { effect: pot.effect } : {}) };
    }
    const c = catalog[g.id];
    return { kind: 'good', id: g.id, name: (c && c.name) || title(g.id), desc: (c && c.desc) || '', rarity: 'normal', stack: 1, ...(c && c.use ? { use: c.use } : {}) };
  }
  function build(kindId, k, e, rules, level, town) {
    const out = [];
    const over = (town && town.stock && town.stock[kindId]) || {};
    let n = 0;
    for (const [cat, row] of Object.entries(k.categories || {})) {
      // play-test 5 (E's `minCap: {base: level}` on a category): a late piece is only on the shelf in a town whose `levelCap`
      // reaches it — without this the new high-level catalog gear was sold in every town
      const cap = town && Number.isFinite(town.levelCap) ? town.levelCap : 99;
      const bases = (over.bases || row.bases || []).filter(b => !(row.minCap && row.minCap[b] > cap));
      if (!bases.length) continue;
      // S17 (play-test 4): bases taken IN TURN from a random start, so every base (every weapon family) shows up
      // before any repeats — a random pick per slot left whole families (maces, polearms) out of a 10-slot smithy
      const start = Math.floor(rng() * bases.length);
      for (let i = 0; i < Math.min(16, row.count || 1); i++) {
        const base = bases[(start + i) % bases.length];
        const it = makeOne(rules, e, { base, rarity: pickRarity(row.rarity), level });
        if (it) { const item = JSON.parse(JSON.stringify(it)); delete item.uid; out.push({ id: 's' + (n++), cat, label: row.label || cat, item, price: price(item, rules, town && town.priceMult) }); }
      }
    }
    return out;
  }
  /** What `npc` sells to `e` right now (gear rows, goods rows, mount rows). `townName` = the room's town. */
  function stock(npc, e, rules, townName = null) {
    const kindId = kindOf(npc);
    if (!kindId) return [];
    const k = kinds[kindId], town = townOf(townName);
    const ch = e.char || {};
    const rows = [];
    const lvl = Math.max(1, Math.min(ch.level || e.level || 1, (town && town.levelCap) || 60));
    if (Object.keys(k.categories || {}).length && rules) {
      const bracket = Math.floor((lvl - 1) / BRACKET);
      const key = ((npc.data && npc.data.key) || 'npc:' + npc.id) + '|' + bracket;
      let c = cache.get(key);
      if (!c || now() - c.at > pricing.restockMinutes * 60000) { c = { at: now(), stock: build(kindId, k, e, rules, Math.min(lvl, bracket * BRACKET + 2), town) }; cache.set(key, c); }
      rows.push(...c.stock);
    }
    const goods = [...(k.goods || []), ...(((town && town.stock && town.stock[kindId]) || {}).extraGoods || [])];
    goods.forEach((g, i) => {
      if (g.source === 'gear' && mounts && mounts.get(g.id)) { const r = mounts.row(ch, g.id, g.price, g.minLevel); if (r) rows.push({ ...r, cat: 'mounts', label: 'Mounts' }); return; }
      if (g.source === 'gear') { const it = rules ? makeOne(rules, e, { base: g.id, rarity: 'normal', level: lvl }) : null; if (it) { const item = JSON.parse(JSON.stringify(it)); delete item.uid; rows.push({ id: 'g' + i, cat: 'goods', label: 'Goods', item: { ...item, shopPrice: g.price }, price: g.price, level: g.minLevel || 1 }); } return; }
      const pr = Math.max(1, Math.round((g.price || 1) * ((town && town.priceMult) || 1)));
      rows.push({ id: 'g' + i, cat: 'goods', label: 'Goods', item: { ...good(g, rules), shopPrice: pr }, price: pr, level: g.minLevel || 1 });
    });
    if (k.mounts && mounts && !(k.goods || []).length) rows.push(...mounts.forSale(ch).map(r => ({ ...r, cat: 'mounts', label: 'Mounts' })));
    // S3 (play-test 4): a category is a FILTER, never a product. Only a row holding a real, named item (or a mount) is
    // for sale; anything else (a base the generator could not make) is dropped rather than sold as its category label.
    return rows.filter(isProduct);
  }
  return { kindOf, shopOf, stock, price, sellPrice, pricing, kinds, towns, cache, goodOf, potionOf, catalog };
}
/** S3: a row a player can actually buy — a named item (gear or good) or a mount. */
export const isProduct = r => !!(r && ((r.mount && r.mount.id) || (r.item && typeof r.item === 'object' && typeof r.item.name === 'string' && r.item.name.trim() && r.item.name !== r.label)));
const title = id => String(id || '').replace(/_/g, ' ').replace(/\b\w/, c => c.toUpperCase());
