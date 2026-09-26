// The five shops (docs/08 §15-18): stock, prices, buy, sell, and one hook per shop quirk —
//   shop_wick   Odile:    district price drop as Lamps are relit; tastes and names wicks; seasons burn-in
//   shop_pawn   Crane:    remembers every sale (Ledger + a `sold_item` memory), prices by opinion; scrap-it;
//                         Parts (scrap, bombs, satchel rows); Temper; Hollis's brother's lantern
//   shop_soup   Brisket:  3 of 4 meals each visit + the mystery bowl
//   shop_gamble Mothwife: sealed lanterns with a glow hint; the Drowned Market pearl shelf (moves when drained)
//   shop_ferry  Wenna:    services paid in pennies or max health (debt capped at 20%, refunded at a relight)
// Pure. Shelves are seeded by hash(runSeed, shopId, restock) so a reload shows the same shelf.
//
// ctx: { data, act, level (default hero.level), runSeed, node, dark, knack, opinion (-1..1, Crane's
//        Lingo opinion(); 0..1 works too), lampsRelit (acts; default hero.flags.lampsRelit), flags
//        (default hero.flags), remember(memory) callback, pay: 'pennies'|'health', maxHp, actsCrossed,
//        keepSealed, rng (bowl / seal overrides), qty, scrapIt }
import { createRng, hashSeed } from '../core/rng.js';
import { deriveStats } from './hero.js';
import { burnLevel, BURN_THRESHOLDS } from '../spells/wick.js';
import { rollItem, refreshItem, baseValue, shopIlvl, actOfLevel, rarityDef, ensureInventory, addToSatchel, removeFromSatchel, roomFor, satchelFree,
  giveCurrency, spendCurrency, canAfford, knowsStrand, displayName } from './items.js';
import { dropBases } from './loot.js';
export { addToSatchel, removeFromSatchel, satchelFree, giveCurrency, spendCurrency, canAfford, sortSatchel, setJunk, autoJunkCommons, takeItem, countOf, ensureInventory } from './items.js';

const shopDef = (data, id) => { const s = data.shops.byId[id]; if (!s) throw new Error(`unknown shop ${id}`); return s; };
const E = data => data.items.economy;
const flagsOf = (hero, ctx) => ({ ...(hero?.flags || {}), ...(ctx.flags || {}) });
const levelOf = (hero, ctx) => ctx.level ?? hero?.level ?? 1;
const late = (data, act) => act >= data.loot.affixFromAct;

/** Per-shop saved state on the hero (save field shopRestock and friends, 08 §20). */
export function shopState(hero, shopId) { hero.shops ||= {}; return hero.shops[shopId] ||= { restock: 0, visits: 0, bought: {}, gen: {}, buyback: [], bowls: 0 }; }
/** Re-roll a shop's random rows (fixed rows never change). */
export function restock(hero, shopId) { const s = shopState(hero, shopId); s.restock++; s.bought = {}; s.gen = {}; return s; }
/** Restock every shop whose rule is this event: 'boss_path_clear' (Odile), 'new_act' (Crane), 'hub_enter' (Mothwife), 'visit' (Brisket). */
export function restockOn(hero, data, event) { const done = []; for (const s of data.shops.list) if (s.restock === event) { restock(hero, s.id); done.push(s.id); } return done; }
/** Opening a shop counts a visit (Brisket's menu turns on visits). */
export function openShop(hero, data, shopId) { const s = shopState(hero, shopId); s.visits++; if (shopDef(data, shopId).restock === 'visit') { s.bought = {}; } return s; }
function seedOf(ctx, shopId, ...parts) { return hashSeed(ctx.runSeed ?? 1, shopId, ...parts); }

// ------------------------------------------------------------------ pricing (08 §15)
/** Odile's quirk 1: 1.00 unlit; 0.75 relit; −3% more for each earlier district already relit. */
export function districtMult(data, ctx, hero = null) {
  const P = shopDef(data, 'shop_wick').pricing, relit = ctx.lampsRelit ?? hero?.flags?.lampsRelit ?? [], d = ctx.district ?? ctx.act ?? 1;
  if (!relit.includes(d)) return P.unlit;
  return Math.round((P.relit - P.perEarlierRelit * relit.filter(a => a < d).length) * 1000) / 1000;
}
/** Crane's quirk: buy ×(1 − 0.15 × opinion), sell share ×(1 + 0.4 × opinion). */
export function keeperFactor(data, opinion = 0) { const P = shopDef(data, 'shop_pawn').pricing; return 1 + P.opinionBuy * clampOp(opinion); }
export function keeperSellFactor(data, opinion = 0) { const P = shopDef(data, 'shop_pawn').pricing; return 1 + P.opinionSell * clampOp(opinion); }
const clampOp = o => Math.max(-1, Math.min(1, o || 0));
function odileApplies(data, item) { const P = shopDef(data, 'shop_wick').pricing.appliesTo, def = data.items.byId[item.base || item.id] || {}; return (P.includes('strand') && (item.type || def.type) === 'strand') || P.includes(def.id) || (P.includes('lantern') && (item.slot || def.slot) === 'lantern'); }
/** What a shop charges for an item (rolled item or base def), in its own currency. */
export function priceOf(item, shopId, ctx) {
  const data = ctx.data, S = shopDef(data, shopId), hero = ctx.hero;
  let m = S.buyMult ?? 1;
  if (S.quirk === 'names_wicks' && odileApplies(data, item)) m *= districtMult(data, ctx, hero);
  if (S.quirk === 'remembers_sales') m *= keeperFactor(data, ctx.opinion);
  return Math.round(baseValue(data, item) * m);
}
/** What a shop pays for an item (per unit × qty for stacks). */
export function sellPriceOf(item, shopId, ctx) {
  const data = ctx.data, S = shopDef(data, shopId), def = data.items.byId[item.base] || {};
  if (def.type === 'quest') return S.quirk === 'remembers_sales' ? def.sellPrice : 0;
  let m = E(data).sellShare; if (S.quirk === 'remembers_sales') m *= keeperSellFactor(data, ctx.opinion);
  return Math.round(baseValue(data, item) * m) * (ctx.qty ?? item.qty ?? 1);
}
export function shopBuys(data, shopId, item) {
  const S = shopDef(data, shopId), def = data.items.byId[item.base] || {}, type = item.type || def.type;
  if (type === 'key' || type === 'tool') return false;
  if (type === 'quest') return S.quirk === 'remembers_sales' && S.questItem === def.id;
  return S.buys.includes(type) || (!!(item.slot || def.slot) && S.buys.includes(item.slot || def.slot));
}

// ------------------------------------------------------------------ stock
/**
 * Everything on the shelf right now: [{ key, row, id, item?, qty (null = unlimited), price, currency, label, ... }].
 * Bought rows show qty 0 until the next restock (the Mothwife replaces hers at once).
 */
export function stockFor(shopId, ctx) {
  const data = ctx.data, hero = ctx.hero || {}, S = shopDef(data, shopId), act = ctx.act ?? 1, st = shopState(hero, shopId), flags = flagsOf(hero, ctx);
  if (act < (S.fromAct || 1) && !(S.quirk === 'sealed_lanterns' && ctx.node === S.pearlShelf.node)) return [];
  const out = [], ilvl = shopIlvl(data, levelOf(hero, ctx), act), bought = k => st.bought[k] || 0;
  const push = e => { if (e.qty != null) e.qty = Math.max(0, e.qty - bought(e.key)); e.currency ||= 'pennies'; out.push(e); return e; };
  const consumable = (row, extra = {}) => { const def = data.items.byId[row.id]; return push({ key: `${row.row}:${row.id}`, row: row.row, id: row.id, qty: row.qty ?? null, price: row.price ?? priceOf(def, shopId, { ...ctx, hero }), label: def.name, ...extra }); };
  const restockKey = S.restock === 'new_act' ? `act${act}` : st.restock;
  if (S.quirk === 'sealed_lanterns') { gambleStock(S, ctx, hero, st, act, ilvl, push); return out; }
  if (S.quirk === 'pays_in_health') { for (const sv of S.services) push({ key: `service:${sv.id}`, row: 'service', id: sv.id, qty: null, label: sv.name, ...servicePrice(data, sv.id, { ...ctx, hero }) }); return out; }
  for (const row of S.rows) {
    if (row.fromAct && act < row.fromAct) continue;
    if (row.row === 'fixed') consumable(row);
    else if (row.row === 'strands') for (const d of data.items.list) { if (d.type !== 'strand' || d.soldFrom == null || d.soldFrom > act || !d.price || (d.soldIf && !flags[d.soldIf]) || knowsStrand(hero, d)) continue; push({ key: `strand:${d.id}`, row: 'strand', id: d.id, qty: 1, price: priceOf(d, shopId, { ...ctx, hero }), label: d.name }); }
    else if (row.row === 'random') for (let i = 0; i < row.count; i++) {
      const rng = createRng(seedOf(ctx, shopId, 'random', restockKey, i));
      const w = late(data, act) ? row.rarity.late : row.rarity.early, rarity = rng.weighted(Object.entries(w).map(([id, v]) => ({ id, w: v }))).id;
      const bases = dropBases(data, act, { slot: row.slot, classId: hero.class }); const item = rollItem(data, { base: rng.pick(bases), ilvl, rarity, rng, act });
      push({ key: `random:${restockKey}:${i}`, row: 'random', id: item.base, item, qty: 1, price: priceOf(item, shopId, { ...ctx, hero }), label: displayName(item) });
    }
    else if (row.row === 'ledger') for (const L of hero.craneLedger || []) push({ key: `ledger:${L.itemSnapshot.uid}`, row: 'ledger', id: L.itemSnapshot.base, item: L.itemSnapshot, qty: null, price: Math.round(L.soldFor * S.pricing.ledgerMult * keeperFactor(data, ctx.opinion)), label: displayName(L.itemSnapshot), soldFor: L.soldFor });
    else if (row.row === 'parts') row.bundle ? push({ key: `parts:${row.id}`, row: 'parts', id: row.id, bundle: row.bundle, qty: row.qty ?? null, price: row.price, label: `${data.items.byId[row.id].name} ×${row.bundle}` }) : consumable(row);
    else if (row.row === 'satchel') { const sl = hero.satchelSlots ?? E(data).satchel.start, n = Math.round((sl - E(data).satchel.start) / E(data).satchel.rowSize); if (sl < E(data).satchel.max && n >= 0 && n < E(data).satchel.rowPrices.length) push({ key: `satchel:${n}`, row: 'satchel', id: 'satchel_row', qty: 1, price: E(data).satchel.rowPrices[n], label: `Satchel row ${n + 5}` }); }
    else if (row.row === 'menu') for (const id of soupMenu(hero, { ...ctx, data })) push({ key: `menu:${id}`, row: 'menu', id, qty: null, price: priceOf(data.items.byId[id], shopId, { ...ctx, hero }), label: data.items.byId[id].name });
  }
  if (S.buyback) for (const b of st.buyback.filter(b => b.act === act)) push({ key: `buyback:${b.item.uid}`, row: 'buyback', id: b.item.base, item: b.item, qty: null, price: b.price, label: displayName(b.item) });
  return out;
}

// ------------------------------------------------------------------ buy / sell
const fail = reason => ({ ok: false, reason });
/** Buy one stock entry. Returns { ok, reason?, item?, outcome?, service?, speak? }. */
export function buy(hero, shopId, entry, ctx) {
  const data = ctx.data; ensureInventory(hero, data); ctx = { ...ctx, hero };
  const S = shopDef(data, shopId), st = shopState(hero, shopId);
  if (entry.qty === 0) return fail('Sold out.');
  // what it needs in the satchel before we take any money
  const needs = entry.item || entry.row === 'sealed' || entry.row === 'sealed_pearl' ? { slot: 1 } : ['fixed', 'parts', 'strand'].includes(entry.row) && entry.id !== 'scrap' ? { id: entry.id, n: entry.per || 1 } : null;
  if (entry.row === 'fixed' && data.items.byId[entry.id]?.type === 'meal') { /* the mystery bowl is eaten on the spot */ }
  else if (needs?.slot && satchelFree(hero) < 1) return fail('Your satchel is full.');
  else if (needs?.id && roomFor(hero, data, needs.id) < needs.n) return fail('Your satchel is full.');
  // pay
  if (entry.row === 'service' && ctx.pay === 'health') { const r = payHealth(hero, entry, ctx); if (!r.ok) return r; }
  else if (!spendCurrency(hero, entry.currency || 'pennies', entry.price)) return fail(entry.currency === 'pearls' ? 'Not enough pearls.' : 'Not enough pennies.');
  st.bought[entry.key] = (st.bought[entry.key] || 0) + 1;
  const res = { ok: true, price: entry.price, currency: entry.currency };
  switch (entry.row) {
    case 'fixed': case 'parts': {
      const def = data.items.byId[entry.id];
      if (def.mystery) { res.outcome = mysteryBowl(hero, ctx); break; }
      addToSatchel(hero, data, entry.id, entry.bundle || entry.per || 1); break;
    }
    case 'strand': addToSatchel(hero, data, entry.id, 1); break;
    case 'random': case 'rare_pearl': case 'buyback': case 'ledger':
      addToSatchel(hero, data, entry.item); res.item = entry.item;
      if (entry.row === 'ledger') { hero.craneLedger = (hero.craneLedger || []).filter(L => L.itemSnapshot.uid !== entry.item.uid); res.speak = S.memory.recall; }
      if (entry.row === 'buyback') st.buyback = st.buyback.filter(b => b.item.uid !== entry.item.uid);
      break;
    case 'satchel': hero.satchelSlots = (hero.satchelSlots ?? E(data).satchel.start) + E(data).satchel.rowSize; break;
    case 'menu': eatMeal(hero, data, entry.id, 1, S.mealTime); res.meal = entry.id; break;
    case 'sealed': case 'sealed_pearl': {
      st.gen[entry.pos] = (st.gen[entry.pos] || 0) + 1; // the Mothwife puts a new one out at once
      const sealed = { uid: `seal${entry.seal.seed.toString(36)}`, base: `sealed_lantern_${entry.seal.slot}`, type: 'sealed', name: data.items.byId[`sealed_lantern_${entry.seal.slot}`].name, seal: entry.seal };
      if (ctx.keepSealed) { addToSatchel(hero, data, sealed); res.item = sealed; }
      else { res.item = breakSeal(data, sealed, ctx); addToSatchel(hero, data, res.item); }
      break;
    }
    case 'exchange': for (const [c, n] of Object.entries(entry.gives)) giveCurrency(hero, data, c, n); break;
    case 'service': res.service = entry.id; res.paidWith = ctx.pay === 'health' ? 'health' : 'pennies'; break;
  }
  if (data.classes) deriveStats(hero, data);
  return res;
}
/**
 * Sell a satchel entry. Crane: records the Ledger + a `sold_item` memory (ctx.remember), pays by opinion,
 * or pays scrap instead when ctx.scrapIt. Odile keeps it on her buyback shelf for this act.
 */
export function sell(hero, item, shopId, ctx) {
  const data = ctx.data; ensureInventory(hero, data); ctx = { ...ctx, hero };
  const S = shopDef(data, shopId), def = data.items.byId[item.base] || {};
  if (!shopBuys(data, shopId, item)) return fail('Not something this shop buys.');
  if (def.type === 'quest') return hollisLantern(hero, 'sell', ctx);
  if (!hero.satchel.some(x => x.uid === item.uid)) return fail('That is not in your satchel.');
  const qty = Math.min(ctx.qty ?? item.qty ?? 1, item.qty ?? 1), res = { ok: true };
  if (ctx.scrapIt) {
    if (S.quirk !== 'remembers_sales' || item.type !== 'gear') return fail(item.type === 'relic' ? 'Relics cannot be scrapped.' : 'Only Crane scraps gear.');
    res.scrap = scrapValue(data, item, ctx); addToSatchel(hero, data, 'scrap', res.scrap); res.amount = 0;
  } else { res.amount = sellPriceOf(item, shopId, { ...ctx, qty }); giveCurrency(hero, data, 'pennies', res.amount); }
  const taken = removeFromSatchel(hero, item.uid, item.qty ? qty : null);
  if (S.quirk === 'remembers_sales') {
    hero.craneLedger ||= []; hero.craneLedger.push({ itemSnapshot: taken, soldFor: res.amount || Math.round(baseValue(data, taken) * E(data).sellShare), act: ctx.act ?? 1 });
    while (hero.craneLedger.length > S.pricing.ledgerCap) hero.craneLedger.shift();
    res.memory = { type: S.memory.type, bindings: { item: displayName(taken), price: res.amount }, npc: S.keeper };
    ctx.remember?.(res.memory);
  }
  if (S.buyback) { const st = shopState(hero, shopId); st.buyback.push({ item: taken, price: res.amount, act: ctx.act ?? 1 }); while (st.buyback.length > S.buyback) st.buyback.shift(); }
  if (data.classes) deriveStats(hero, data);
  return res;
}
/** "Sell junk": every junk-flagged entry this shop buys. Returns { ok, amount, count }. */
export function sellJunk(hero, shopId, ctx) {
  let amount = 0, count = 0;
  for (const x of [...hero.satchel]) if (x.junk && shopBuys(ctx.data, shopId, x)) { const r = sell(hero, x, shopId, ctx); if (r.ok) { amount += r.amount || 0; count++; } }
  return { ok: true, amount, count };
}

// ------------------------------------------------------------------ Odile (shop_wick)
/** The dish-name rule (08 §16.1): {flame adjective} {shape dish}{ first-charm garnish}. Same wick, same name. */
export function wickDishName(wick, data) {
  const T = shopDef(data, 'shop_wick').taste, c = (wick.charms || [])[0]; const cid = typeof c === 'object' ? c?.id : c;
  return `${T.adjectives[wick.flame] || 'Plain'} ${T.dishes[wick.shape] || 'Dish'}${cid && T.garnishes[cid] ? ' ' + T.garnishes[cid] : ''}`;
}
/** Tasting: the name plus the score tag that picks her line (damage per oil against the sim median). */
export function tasteWick(wick, data, { dpo = null, median = null } = {}) {
  const T = shopDef(data, 'shop_wick').taste, r = dpo != null && median ? dpo / median : 1;
  const tag = r < T.tags.bland ? 'bland' : r > T.tags.superb ? 'superb' : 'good', name = wickDishName(wick, data);
  return { name, tag, intent: T.intent, bindings: { 'wick.name': name } };
}
/** Hook: store the tasted name on the wick (the HUD, Wick Book and meter read wick.dish). */
export function nameWick(wick, data) { wick.dish = wickDishName(wick, data); return wick.dish; }
/** Season (08 §18): 1 dust + 50 × (level + 1) pennies = +25% of the oil to the next burn-in level on one track. */
export function season(hero, wick, track, ctx) {
  const data = ctx.data, P = shopDef(data, 'shop_wick').season, part = wick[track]; if (!part || !['flame', 'shape'].includes(track)) return fail('Pick the flame or the shape.');
  hero.burn ||= { flame: {}, shape: {} }; hero.burn[track] ||= {};
  const oil = hero.burn[track][part] || 0, lvl = burnLevel(oil);
  if (lvl >= BURN_THRESHOLDS.length) return fail('That track is fully burned in.');
  const key = `${wick.id}:${ctx.act ?? 1}`; hero.seasoned ||= {};
  if ((hero.seasoned[key] || 0) >= P.perWickPerAct) return fail(`Only ${P.perWickPerAct} seasonings per wick each act.`);
  const pennies = P.penniesPerLevel * (lvl + 1);
  if ((hero.strandDust || 0) < P.dust) return fail('You need Strand Dust.');
  if (!spendCurrency(hero, 'pennies', pennies)) return fail('Not enough pennies.');
  hero.strandDust -= P.dust; hero.seasoned[key] = (hero.seasoned[key] || 0) + 1;
  const gain = P.share * (BURN_THRESHOLDS[lvl] - BURN_THRESHOLDS[lvl - 1]); hero.burn[track][part] = oil + gain;
  return { ok: true, gain, pennies, level: burnLevel(oil + gain) };
}

// ------------------------------------------------------------------ Crane (shop_pawn)
export function scrapValue(data, item, ctx) { return Math.round(shopDef(data, 'shop_pawn').pricing.scrapIt * rarityDef(data, item.rarity).valueMult * (ctx.act ?? 1)); }
/** 08 §12.3: Give (sets the Kindling flag) or Sell (300 pennies; the flag is lost for this save). */
export function hollisLantern(hero, choice, ctx) {
  const data = ctx.data, S = shopDef(data, 'shop_pawn'), def = data.items.byId[S.questItem], i = (hero.keys || []).indexOf(def.id);
  if (i < 0) return fail('You do not have it.');
  hero.keys.splice(i, 1); hero.flags ||= {};
  if (choice === 'give') { hero.flags[def.flag] = true; return { ok: true, flag: def.flag, amount: 0 }; }
  hero.flags[def.flag + '_lost'] = true; giveCurrency(hero, data, 'pennies', def.sellPrice);
  return { ok: true, amount: def.sellPrice, lost: def.flag };
}
/** Temper cost for the next level (08 §17): pennies × the act of the item's ilvl, scrap, and dust at +5. */
export function temperCost(data, item) {
  const row = E(data).temper[item.temper || 0]; if (!row) return null;
  return { pennies: row.pennies * actOfLevel(data, item.ilvl), scrap: row.scrap, strandDust: row.strandDust || 0, level: (item.temper || 0) + 1 };
}
export function temper(hero, item, ctx) {
  const data = ctx.data, c = temperCost(data, item); if (!c) return fail('It cannot be tempered further.');
  if ((hero.scrap || 0) < c.scrap) return fail('Not enough scrap.'); if ((hero.strandDust || 0) < c.strandDust) return fail('You need Strand Dust.');
  if (!spendCurrency(hero, 'pennies', c.pennies)) return fail('Not enough pennies.');
  hero.scrap -= c.scrap; hero.strandDust -= c.strandDust; item.temper = c.level; refreshItem(data, item);
  if (data.classes) deriveStats(hero, data);
  return { ok: true, level: c.level, cost: c };
}

// ------------------------------------------------------------------ Brisket (shop_soup)
/** Today's menu: 3 of the 4 meals, seeded by the shop seed and the visit count (reload-safe). */
export function soupMenu(hero, ctx) {
  const data = ctx.data, S = shopDef(data, 'shop_soup'), row = S.rows.find(r => r.row === 'menu'), st = shopState(hero, 'shop_soup');
  const rng = createRng(seedOf(ctx, 'shop_soup', 'menu', st.visits));
  return rng.shuffle([...row.meals]).slice(0, row.size);
}
function applyBuff(hero, buff, k) { hero.buffs ||= {}; for (const [s, v] of Object.entries(buff || {})) { hero.buffs[s] = Math.round(((hero.buffs[s] || 0) + k * v) * 1000) / 1000; if (!hero.buffs[s]) delete hero.buffs[s]; } }
/** Eat a meal: one at a time, replaces the last; its buff goes into hero.buffs (deriveStats reads it). */
export function eatMeal(hero, data, id, strength = 1, time = 600, phases = null) {
  clearMeal(hero);
  const def = data.items.byId[id], buff = {}; for (const [k, v] of Object.entries(def?.buff || {})) buff[k] = Math.round(v * strength * 1000) / 1000;
  hero.meal = phases ? { id, name: def?.name || id, phases, phase: 0, t: phases[0].time, buff: phases[0].buff } : { id, name: def.name, t: time, buff, strength };
  applyBuff(hero, hero.meal.buff, 1); if (data.classes) deriveStats(hero, data);
  return hero.meal;
}
export function clearMeal(hero) { if (hero.meal) applyBuff(hero, hero.meal.buff, -1); hero.meal = null; }
/** Count the meal down (call once a second or each tick with dt). Returns true when it ended. */
export function tickMeal(hero, dt, data = null) {
  const M = hero.meal; if (!M) return false; M.t -= dt; if (M.t > 0) return false;
  if (M.phases && M.phase + 1 < M.phases.length) { applyBuff(hero, M.buff, -1); M.phase++; M.buff = M.phases[M.phase].buff; M.t += M.phases[M.phase].time; applyBuff(hero, M.buff, 1); if (data?.classes) deriveStats(hero, data); return false; }
  clearMeal(hero); if (data?.classes) deriveStats(hero, data); return true;
}
/** The mystery bowl (08 §16.3). Returns { id, ... } for the outcome (01 has one line per id). */
export function mysteryBowl(hero, ctx) {
  const data = ctx.data, S = shopDef(data, 'shop_soup'), st = shopState(hero, 'shop_soup'), act = ctx.act ?? 1;
  const rng = ctx.rng || createRng(seedOf(ctx, 'shop_soup', 'bowl', st.bowls++));
  const meals = S.rows.find(r => r.row === 'menu').meals;
  const opts = S.mystery.filter(o => !(o.once && hero.flags?.brisketSecret));
  const o = rng.weighted(opts);
  switch (o.id) {
    case 'strong_meal': case 'meal': { const m = rng.pick(meals); eatMeal(hero, data, m, o.strength, S.mealTime); return { id: o.id, meal: m, strength: o.strength }; }
    case 'pennies': { const n = o.perAct * act; giveCurrency(hero, data, 'pennies', n); return { id: o.id, amount: n }; }
    case 'consumables': { const c = rng.weighted(data.loot.pools[Math.min(6, act)]).id, r = addToSatchel(hero, data, c, o.count); return { id: o.id, item: c, amount: r.added, lost: r.left }; }
    case 'nausea': { const total = S.mealTime; eatMeal(hero, data, 'meal_mystery', 1, total, [{ time: o.first.time, buff: o.first.buff }, { time: total - o.first.time, buff: o.then.buff }]); return { id: o.id }; }
    case 'rare_trinket': { const bases = dropBases(data, act, { slot: 'trinket' }), item = rollItem(data, { base: rng.pick(bases), ilvl: shopIlvl(data, levelOf(hero, ctx), act), rarity: 'rare', rng, act }); const r = addToSatchel(hero, data, item); return { id: o.id, item, dropped: !r.added }; }
    case 'secret': { hero.flags ||= {}; hero.flags.brisketSecret = true; hero.perm ||= {}; hero.perm.health = (hero.perm.health || 0) + o.health; if (data.classes) deriveStats(hero, data); return { id: o.id, health: o.health }; }
  }
  return { id: o.id };
}

// ------------------------------------------------------------------ the Mothwife (shop_gamble)
/** Moth Oracle, or Knack >= 15: a moth sits on every rare (always right). */
export function seesMoth(data, hero, ctx = {}) { const M = shopDef(data, 'shop_gamble').sealed.mothSight; return M.classes.includes(hero?.class) || (ctx.knack ?? hero?.attrs?.knack ?? 0) >= M.knack; }
/** Where the pearl shelf is: 'market' (a3_n05, flooded), 'tent' (drained: her tent at a4_n01 and later), or null. */
export function pearlShelfAt(data, ctx, hero = null) {
  const P = shopDef(data, 'shop_gamble').pearlShelf, drained = !!flagsOf(hero, ctx)[P.movedFlag];
  if (!drained) return ctx.node === P.node || (ctx.node == null && (ctx.act ?? 1) === 3) ? 'market' : null;
  return P.movesTo.includes(ctx.node) || (ctx.node == null && (ctx.act ?? 1) >= 4) ? 'tent' : null;
}
/** One sealed lantern on the shelf: true rarity + ilvl fixed now (so the glow can hint), the item rolled when broken. */
export function sealedFor(data, ctx, slot, pos, gen, { pearl = false, hero = null, restockN = 0 } = {}) {
  const G = shopDef(data, 'shop_gamble').sealed, rng = createRng(seedOf(ctx, 'shop_gamble', 'sealed', pearl ? 'p' : 'c', restockN, slot, pos, gen));
  const rw = Object.entries(G.rarity).map(([id, w]) => ({ id, w }));
  let rarity = rng.weighted(rw).id; if (pearl) while (rarity === 'common') rarity = rng.weighted(rw).id;
  const ilvl = Math.max(1, levelOf(hero, ctx) + rng.int(G.ilvlBonus[0], G.ilvlBonus[1]));
  const glow = rng.weighted(Object.entries(G.glow[rarity]).map(([id, w]) => ({ id, w }))).id;
  return { slot, rarity, ilvl, glow, glowColor: G.glowColors[glow], flicker: Math.round(Math.min(1, ilvl / 30) * 100) / 100, moth: seesMoth(data, hero, ctx) && rarity === 'rare', seed: rng.int(1, 2147483646) };
}
/** Break a seal: roll the item. Broken in the dark (ambientTier dark), the rare weight counts ×1.25. */
export function breakSeal(data, sealed, ctx = {}) {
  const seal = sealed.seal || sealed, G = shopDef(data, 'shop_gamble').sealed, rng = createRng(seal.seed), act = ctx.act ?? actOfLevel(data, seal.ilvl);
  let rarity = seal.rarity;
  if (ctx.dark && rarity !== 'rare') { // same shelf, same hint: a non-rare seal gets the extra rare share as an upgrade chance
    const sum = Object.values(G.rarity).reduce((a, b) => a + b, 0), p = G.rarity.rare / sum, pd = G.rarity.rare * G.darkRareMult / (sum + G.rarity.rare * (G.darkRareMult - 1));
    if (rng.chance((pd - p) / (1 - p))) rarity = 'rare';
  }
  const slot = seal.slot === 'any' ? rng.pick(data.items.slots) : seal.slot;
  return rollItem(data, { base: rng.pick(dropBases(data, Math.max(act, 1), { slot })), ilvl: seal.ilvl, rarity, rng, act: Math.max(act, data.loot.affixFromAct) });
}
function gambleStock(S, ctx, hero, st, act, ilvl, push) {
  const data = ctx.data, G = S.sealed, P = S.pearlShelf, where = pearlShelfAt(data, ctx, hero), tent = ctx.node == null ? act >= 4 : S.nodes.includes(ctx.node);
  const sealedRows = pearl => { for (const slot of Object.keys(G.prices)) for (let i = 0; i < G.perSlot; i++) {
    const pos = `${pearl ? 'p' : 'c'}:${slot}:${i}`, gen = st.gen[pos] || 0, seal = sealedFor(data, ctx, slot, i, gen, { pearl, hero, restockN: st.restock });
    push({ key: `sealed:${pos}:${gen}`, row: pearl ? 'sealed_pearl' : 'sealed', id: `sealed_lantern_${slot}`, pos, seal: { ...seal }, qty: 1, currency: pearl ? 'pearls' : 'pennies', price: pearl ? G.pearlPrices[slot] : G.prices[slot] * act, label: data.items.byId[`sealed_lantern_${slot}`].name,
      hint: { glow: seal.glow, glowColor: seal.glowColor, flicker: seal.flicker, moth: seal.moth } });
  } };
  if (tent && act >= 4) sealedRows(false);
  if (where) for (const row of P.rows) {
    if (row.row === 'sealed_pearl') sealedRows(true);
    else if (row.row === 'rare_pearl') for (let i = 0; i < row.count; i++) { const rng = createRng(seedOf(ctx, 'shop_gamble', 'rare_pearl', st.restock, i, st.gen[`rp:${i}`] || 0)), item = rollItem(data, { base: rng.pick(dropBases(data, act)), ilvl, rarity: 'rare', rng, act }); push({ key: `rare_pearl:${st.restock}:${i}`, row: 'rare_pearl', id: item.base, item, qty: 1, price: row.price, currency: 'pearls', label: displayName(item) }); }
    else if (row.row === 'fixed') push({ key: `pearlfixed:${row.id}`, row: 'fixed', id: row.id, per: row.per, qty: row.qty, price: row.price, currency: row.currency, label: `${data.items.byId[row.id].name} ×${row.per}` });
    else if (row.row === 'exchange') push({ key: `exchange:${row.id}`, row: 'exchange', id: row.id, qty: null, price: row.price, currency: row.currency, gives: row.gives, label: row.id === 'pearl_buy' ? 'Buy a pearl' : 'Sell a pearl' });
  }
}

// ------------------------------------------------------------------ the Ferry (shop_ferry)
/** Max health before any Ferry debt. */
export function fullMaxHp(hero, ctx) {
  if (ctx.maxHp != null) return ctx.maxHp;
  if (ctx.data?.classes && hero?.class) { const s = deriveStats(hero, ctx.data); return s.maxHp + (hero.maxHpDebt || 0); }
  return (hero?.stats?.maxHp ?? 100) + (hero?.maxHpDebt || 0);
}
/** A service's two prices: pennies, and max health (with whether the 20% cap still allows it). */
export function servicePrice(data, id, ctx) {
  const S = shopDef(data, 'shop_ferry'), sv = S.services.find(s => s.id === id), p = sv.pennies, hero = ctx.hero || {}, act = ctx.act ?? 1, level = levelOf(hero, ctx);
  const pennies = p.perAct ? p.perAct * act : p.perActCrossed ? Math.max(p.min || 0, p.perActCrossed * (ctx.actsCrossed ?? 1)) : p.perLevelFifth ? Math.round(p.perLevelFifth * level / 5) : p.flat;
  const full = fullMaxHp(hero, { ...ctx, hero }), health = Math.max(1, Math.round(sv.healthPct * full)), capHp = Math.floor(S.debtCap * full);
  const healthOk = (hero.maxHpDebt || 0) + health <= capHp;
  return { price: pennies, currency: 'pennies', healthPct: sv.healthPct, health, healthOk, healthNote: healthOk ? 'refunded at the next Great Lamp' : S.capLine, debt: hero.maxHpDebt || 0, debtCap: capHp };
}
function payHealth(hero, entry, ctx) {
  const S = shopDef(ctx.data, 'shop_ferry'), sp = servicePrice(ctx.data, entry.id, ctx);
  if (!sp.healthOk) return fail(S.capLine);
  hero.maxHpDebt = (hero.maxHpDebt || 0) + sp.health; return { ok: true };
}
/** Each Great Lamp relit: the Ferry debt goes to 0 and Odile's prices drop in that district. */
export function onLampRelit(hero, data, act) {
  hero.flags ||= {}; const L = hero.flags.lampsRelit ||= []; if (!L.includes(act)) L.push(act);
  const refunded = hero.maxHpDebt || 0; hero.maxHpDebt = 0; if (data?.classes) deriveStats(hero, data);
  return { refunded };
}
export const refundFerryDebt = hero => { const r = hero.maxHpDebt || 0; hero.maxHpDebt = 0; return r; };
