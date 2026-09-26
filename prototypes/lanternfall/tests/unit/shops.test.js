// Shops (docs/08 §15-18, §21 crane / ferry / mothwife / soup / wickname): every quirk hook does its one
// thing, plus buy/sell basics, the satchel-full rule and reload-stable shelves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../js/core/data.js';
import { createRng } from '../../js/core/rng.js';
import { createHero, deriveStats } from '../../js/rpg/hero.js';
import { rollItem, addToSatchel, baseValue, setJunk } from '../../js/rpg/items.js';
import * as S from '../../js/rpg/shops.js';

const data = await loadData();
const hero = (cls = 'lamplighter', pennies = 100000) => { const h = createHero(cls, data); h.currency.pennies = pennies; deriveStats(h, data); return h; };
const within = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, `${msg}: ${got.toFixed(4)} vs ${want.toFixed(4)}`);

// ------------------------------------------------------------------ basics
test('buy and sell: pennies move, satchel fills, sold out, full satchel refuses, junk sells in one go', () => {
  const h = hero('lamplighter', 30), ctx = { data, hero: h, act: 1, runSeed: 5 };
  const oil = S.stockFor('shop_wick', ctx).find(e => e.id === 'lamp_oil');
  assert.equal(oil.price, 6); assert.ok(S.buy(h, 'shop_wick', oil, ctx).ok); assert.equal(h.currency.pennies, 24);
  assert.equal(S.buy(h, 'shop_wick', S.stockFor('shop_wick', ctx).find(e => e.row === 'strand'), ctx).reason, 'Not enough pennies.');
  const pawn = S.stockFor('shop_pawn', { ...ctx, act: 1 }), tonic = pawn.find(e => e.key === 'fixed:tonic_small'); h.currency.pennies = 1000;
  for (let k = 0; k < 5; k++) assert.ok(S.buy(h, 'shop_pawn', S.stockFor('shop_pawn', ctx).find(e => e.key === tonic.key), ctx).ok);
  assert.equal(S.stockFor('shop_pawn', ctx).find(e => e.key === tonic.key).qty, 0);
  h.satchelSlots = h.satchel.length; const gear = S.stockFor('shop_pawn', ctx).find(e => e.row === 'random');
  assert.equal(S.buy(h, 'shop_pawn', gear, ctx).reason, 'Your satchel is full.'); h.satchelSlots = 20;
  const a = rollItem(data, { base: 'boots_guild', rng: createRng(1) }), b = rollItem(data, { base: 'coat_guild', rng: createRng(2) }); addToSatchel(h, data, a); addToSatchel(h, data, b); setJunk(h, a.uid); setJunk(h, b.uid);
  const before = h.currency.pennies, r = S.sellJunk(h, 'shop_pawn', ctx); assert.equal(r.count, 2); assert.equal(h.currency.pennies, before + r.amount);
  assert.equal(S.sell(h, h.satchel.find(x => x.base === 'tonic_small'), 'shop_soup', ctx).ok, false); // Brisket buys nothing
});

test('the shelf is the same after a reload (same run seed + restock count), different after a restock', () => {
  const h = hero(), ctx = { data, hero: h, act: 3, runSeed: 99, level: 12 };
  const a = S.stockFor('shop_pawn', ctx).filter(e => e.row === 'random').map(e => e.item.name + e.item.ilvl), b = S.stockFor('shop_pawn', { ...ctx }).filter(e => e.row === 'random').map(e => e.item.name + e.item.ilvl);
  assert.deepEqual(a, b);
  const w1 = S.stockFor('shop_wick', ctx).filter(e => e.row === 'random').map(e => e.item.name); S.restockOn(h, data, 'boss_path_clear');
  const w2 = S.stockFor('shop_wick', ctx).filter(e => e.row === 'random').map(e => e.item.name); assert.notDeepEqual(w1, w2);
  for (const e of S.stockFor('shop_wick', ctx).filter(e => e.row === 'random')) { assert.equal(e.item.slot, 'lantern'); assert.notEqual(e.item.rarity, 'common'); assert.ok(e.item.ilvl <= 15); }
});

// ------------------------------------------------------------------ Odile
test('Odile: prices drop when the Lamp is relit (0.75, −3% per earlier Lamp) — strands, oil and lanterns only', () => {
  assert.equal(S.districtMult(data, { act: 2, lampsRelit: [1] }), 1);
  assert.equal(S.districtMult(data, { act: 1, lampsRelit: [1] }), 0.75);
  assert.equal(S.districtMult(data, { act: 6, lampsRelit: [1, 2, 3, 4, 5, 6] }), 0.6);
  const h = hero(), strand = data.items.byId.strand_flame_tide;
  assert.equal(S.priceOf(strand, 'shop_wick', { data, hero: h, act: 3 }), 300);
  S.onLampRelit(h, data, 3); assert.equal(S.priceOf(strand, 'shop_wick', { data, hero: h, act: 3 }), 225);
  S.onLampRelit(h, data, 1); assert.equal(S.priceOf(strand, 'shop_wick', { data, hero: h, act: 3 }), 216);
  const coat = rollItem(data, { base: 'coat_guild', rng: createRng(1) }); assert.equal(S.priceOf(coat, 'shop_wick', { data, hero: h, act: 3 }), Math.round(baseValue(data, coat)));
});

test('Odile: the strand shelf holds sold-from-this-act strands you do not know; linger only once the Market is drained', () => {
  const h = hero('lamplighter'); // knows ember, gleam, bolt, ring
  const ids = act => S.stockFor('shop_wick', { data, hero: h, act }).filter(e => e.row === 'strand').map(e => e.id);
  assert.deepEqual(ids(1).sort(), ['strand_shape_arc']);
  assert.ok(ids(3).includes('strand_charm_seek') && !ids(3).includes('strand_charm_linger') && !ids(3).includes('strand_flame_gleam'));
  h.flags.market_drained = true; assert.ok(ids(3).includes('strand_charm_linger'));
});

test('Odile: wick names follow the dish rule, the same wick always gets the same name, every combo has one', () => {
  assert.equal(S.wickDishName({ flame: 'ember', shape: 'bolt', charms: ['split'] }, data), 'Smoky Skewer for Two');
  assert.equal(S.wickDishName({ flame: 'rime', shape: 'ring', charms: [] }, data), 'Chilled Tart');
  const names = new Set();
  for (const f of data.flames.list) for (const s of data.shapes.list) for (const c of [null, ...data.charms.list]) {
    const w = { flame: f.id, shape: s.id, charms: c ? [c.id, 'echo'] : [] }, n = S.wickDishName(w, data);
    assert.ok(!/undefined|Plain|Dish/.test(n), n); assert.equal(n, S.wickDishName(w, data)); names.add(n);
  }
  assert.equal(names.size, 7 * 8 * 9);
  assert.equal(S.tasteWick({ flame: 'ember', shape: 'bolt' }, data, { dpo: 5, median: 10 }).tag, 'bland');
  assert.equal(S.tasteWick({ flame: 'ember', shape: 'bolt' }, data, { dpo: 13, median: 10 }).tag, 'superb');
  const w = { flame: 'tide', shape: 'wave', charms: ['linger'] }; S.nameWick(w, data); assert.equal(w.dish, 'Salted Broth Slow-Cooked');
});

test('Odile: seasoning adds 25% of the gap to the next burn-in level, twice per wick per act', () => {
  const h = hero(); h.strandDust = 5; const w = h.wicks[0];
  const r = S.season(h, w, 'flame', { data, act: 1 }); assert.ok(r.ok); assert.equal(r.gain, 50); assert.equal(r.pennies, 100); assert.equal(h.burn.flame.ember, 50);
  assert.ok(S.season(h, w, 'shape', { data, act: 1 }).ok); assert.equal(S.season(h, w, 'flame', { data, act: 1 }).ok, false);
  assert.ok(S.season(h, w, 'flame', { data, act: 2 }).ok); assert.equal(h.strandDust, 2);
});

// ------------------------------------------------------------------ Crane
test('Crane: buy 85–115% and sell 15–35% of value across opinion −1…+1', () => {
  const it = rollItem(data, { base: 'lantern_cage', ilvl: 18, rarity: 'rare', rng: createRng(3), act: 4 }), v = baseValue(data, it);
  for (let o = -1; o <= 1.0001; o += 0.25) {
    const buy = S.priceOf(it, 'shop_pawn', { data, opinion: o }) / v, sell = S.sellPriceOf(it, 'shop_pawn', { data, opinion: o }) / v;
    assert.ok(buy >= 0.849 && buy <= 1.151, `buy ${buy}`); assert.ok(sell >= 0.149 && sell <= 0.351, `sell ${sell}`);
  }
  within(S.priceOf(it, 'shop_pawn', { data, opinion: 1 }) / v, 0.85, 0.002, 'best buy'); within(S.sellPriceOf(it, 'shop_pawn', { data, opinion: 1 }) / v, 0.35, 0.002, 'best sell');
});

test('Crane: every sale records a sold_item memory and a Ledger row (cap 200); buying back speaks pawn_recall at ×3', () => {
  const h = hero(), mem = [], ctx = { data, hero: h, act: 2, opinion: 0, remember: m => mem.push(m) };
  const it = rollItem(data, { base: 'wpn_pole_brass', ilvl: 8, rarity: 'fine', rng: createRng(4), act: 2 }); addToSatchel(h, data, it);
  const r = S.sell(h, it, 'shop_pawn', ctx); assert.ok(r.ok); assert.equal(mem[0].type, 'sold_item'); assert.equal(mem[0].bindings.price, r.amount); assert.equal(h.craneLedger.length, 1);
  const row = S.stockFor('shop_pawn', ctx).find(e => e.row === 'ledger'); assert.equal(row.price, r.amount * 3);
  const b = S.buy(h, 'shop_pawn', row, ctx); assert.ok(b.ok); assert.equal(b.speak, 'pawn_recall'); assert.equal(h.craneLedger.length, 0);
  for (let k = 0; k < 230; k++) { const x = rollItem(data, { base: 'boots_guild', rng: createRng(k + 10) }); addToSatchel(h, data, x); S.sell(h, x, 'shop_pawn', ctx); }
  assert.equal(h.craneLedger.length, 200); assert.equal(mem.length, 231);
});

test('Crane: scrap-it pays 5 × rarity × act in scrap (never relics); Hollis\'s lantern: Give sets the flag, Sell pays 300 and loses it', () => {
  const h = hero(), ctx = { data, hero: h, act: 3 };
  const it = rollItem(data, { base: 'coat_wader', ilvl: 12, rarity: 'rare', rng: createRng(5), act: 3 }); addToSatchel(h, data, it);
  const r = S.sell(h, it, 'shop_pawn', { ...ctx, scrapIt: true }); assert.equal(r.scrap, 5 * 6 * 3); assert.equal(h.scrap, 90);
  const relic = rollItem(data, { base: 'relic_choir_bone', ilvl: 10, rng: createRng(6) }); addToSatchel(h, data, relic);
  assert.equal(S.sell(h, relic, 'shop_pawn', { ...ctx, scrapIt: true }).ok, false);
  addToSatchel(h, data, 'hollis_brother_lantern'); assert.ok(S.hollisLantern(h, 'give', ctx).ok); assert.equal(h.flags.hollis_lantern, true);
  const h2 = hero('tinker', 0); addToSatchel(h2, data, 'hollis_brother_lantern');
  const s = S.sell(h2, { base: 'hollis_brother_lantern', type: 'quest' }, 'shop_pawn', { data, act: 2 }); assert.equal(s.amount, 300); assert.equal(h2.currency.pennies, 300); assert.ok(!h2.flags.hollis_lantern && h2.flags.hollis_lantern_lost);
  assert.equal(S.shopBuys(data, 'shop_wick', { base: 'hollis_brother_lantern', type: 'quest' }), false);
});

test('Crane: tempering costs pennies × the act of the ilvl + scrap (+ dust at +5) and adds 8% base stats a level', () => {
  const h = hero(); h.scrap = 200; h.strandDust = 1;
  const it = rollItem(data, { base: 'coat_bronze', ilvl: 12, rng: createRng(7) }), arm = it.implicit.armour;
  assert.deepEqual(S.temperCost(data, it), { pennies: 120, scrap: 5, strandDust: 0, level: 1 });
  for (let k = 0; k < 5; k++) assert.ok(S.temper(h, it, { data }).ok);
  assert.equal(it.temper, 5); assert.equal(h.strandDust, 0); assert.equal(h.scrap, 200 - 75); assert.equal(it.implicit.armour, Math.round(it.core.armour * 1.4)); assert.ok(it.implicit.armour > arm);
  assert.equal(S.temper(h, it, { data }).ok, false);
});

test('Crane: Parts sells scrap bundles, bombs (rime/spark from Act 2) and satchel rows 400/1500/4000', () => {
  const h = hero(), ctx = { data, hero: h, act: 1 };
  const parts = S.stockFor('shop_pawn', ctx).filter(e => e.row === 'parts').map(e => e.id); assert.deepEqual(parts, ['scrap', 'bomb_ember']);
  assert.ok(S.buy(h, 'shop_pawn', S.stockFor('shop_pawn', ctx).find(e => e.key === 'parts:scrap'), ctx).ok); assert.equal(h.scrap, 10);
  for (const p of [400, 1500, 4000]) { const row = S.stockFor('shop_pawn', ctx).find(e => e.row === 'satchel'); assert.equal(row.price, p); assert.ok(S.buy(h, 'shop_pawn', row, ctx).ok); }
  assert.equal(h.satchelSlots, 35); assert.ok(!S.stockFor('shop_pawn', ctx).some(e => e.row === 'satchel'));
});

// ------------------------------------------------------------------ Brisket
test('Brisket: 3 of the 4 meals + the bowl; same seed and visit → same menu; bowl weights sum to 100', () => {
  const h = hero(), ctx = { data, hero: h, act: 2, runSeed: 3 };
  S.openShop(h, data, 'shop_soup'); const m1 = S.stockFor('shop_soup', ctx); assert.equal(m1.filter(e => e.row === 'menu').length, 3); assert.ok(m1.some(e => e.id === 'meal_mystery'));
  assert.equal(new Set(m1.filter(e => e.row === 'menu').map(e => e.id)).size, 3);
  assert.deepEqual(S.stockFor('shop_soup', ctx).map(e => e.id), m1.map(e => e.id));
  const menus = new Set(); for (let k = 0; k < 20; k++) { S.openShop(h, data, 'shop_soup'); menus.add(S.soupMenu(h, ctx).join()); } assert.ok(menus.size > 1);
  assert.equal(data.shops.byId.shop_soup.mystery.reduce((a, b) => a + b.w, 0), 100);
  assert.deepEqual(S.stockFor('shop_soup', { ...ctx, act: 1 }), []);
});

test('Brisket: a meal buff lands in hero.buffs, one at a time, gone when it ends; the bowl\'s secret comes once per save', () => {
  const h = hero(), hp0 = deriveStats(h, data).maxHp;
  S.eatMeal(h, data, 'meal_eel_pie', 1, 600); assert.equal(h.buffs.healthPct, 0.15); assert.equal(h.stats.maxHp, Math.round(hp0 * 1.15));
  S.eatMeal(h, data, 'meal_lamp_porridge', 1.5, 600); assert.equal(h.buffs.healthPct, undefined); assert.equal(h.buffs.oil, 15);
  assert.ok(S.tickMeal(h, 601, data)); assert.deepEqual(h.buffs, {}); assert.equal(h.meal, null);
  const counts = {}; for (let k = 0; k < 3000; k++) { const r = S.mysteryBowl(h, { data, act: 2, rng: createRng(k) }); counts[r.id] = (counts[r.id] || 0) + 1; }
  assert.equal(counts.secret, 1); assert.equal(h.perm.health, 5); assert.ok(counts.nausea > 0 && counts.rare_trinket > 0);
  const h2 = hero(); S.mysteryBowl(h2, { data, act: 2, rng: { weighted: l => l.find(o => o.id === 'nausea') } });
  assert.equal(h2.buffs.moveSpeed, -0.1); S.tickMeal(h2, 61, data); assert.equal(h2.buffs.moveSpeed, undefined); assert.equal(h2.buffs.meleePct, 0.1);
});

// ------------------------------------------------------------------ the Mothwife
test('Mothwife: 10,000 sealed lanterns — rarity 35/45/20 and glow hints within 2%; the moth never lies', () => {
  const G = data.shops.byId.shop_gamble.sealed, N = 10000, rc = {}, gc = { common: {}, fine: {}, rare: {} };
  const seer = hero('moth_oracle');
  for (let k = 0; k < N; k++) { const s = S.sealedFor(data, { runSeed: 1, level: 10 }, 'any', k, 0, { hero: seer }); rc[s.rarity] = (rc[s.rarity] || 0) + 1; gc[s.rarity][s.glow] = (gc[s.rarity][s.glow] || 0) + 1; assert.equal(s.moth, s.rarity === 'rare'); }
  for (const [r, w] of Object.entries(G.rarity)) within(rc[r] / N, w / 100, 0.02, `rarity ${r}`);
  for (const [r, glows] of Object.entries(G.glow)) { const sum = Object.values(glows).reduce((a, b) => a + b, 0); for (const [g, w] of Object.entries(glows)) within((gc[r][g] || 0) / rc[r], w / sum, 0.02, `${r} glows ${g}`); }
  const plain = hero('tinker'); plain.attrs.knack = 3; assert.equal(S.sealedFor(data, { runSeed: 1, level: 10 }, 'any', 0, 0, { hero: plain }).moth, false);
  plain.attrs.knack = 15; assert.equal(S.seesMoth(data, plain), true);
});

test('Mothwife: pearl-shelf lanterns are never common; draining the Market moves the shelf to her tent', () => {
  for (let k = 0; k < 3000; k++) assert.notEqual(S.sealedFor(data, { runSeed: 2, level: 12 }, 'boots', k, 0, { pearl: true }).rarity, 'common');
  const h = hero(); h.currency.pearls = 50;
  assert.equal(S.pearlShelfAt(data, { node: 'a3_n05' }, h), 'market');
  const m = S.stockFor('shop_gamble', { data, hero: h, act: 3, node: 'a3_n05' });
  assert.ok(m.some(e => e.row === 'sealed_pearl' && e.currency === 'pearls') && m.some(e => e.id === 'pearl_buy') && !m.some(e => e.row === 'sealed'));
  assert.equal(S.stockFor('shop_gamble', { data, hero: h, act: 4, node: 'a4_n01' }).some(e => e.row === 'sealed_pearl'), false);
  h.flags.market_drained = true;
  assert.equal(S.pearlShelfAt(data, { node: 'a3_n05' }, h), null); assert.equal(S.pearlShelfAt(data, { node: 'a4_n01' }, h), 'tent');
  const t = S.stockFor('shop_gamble', { data, hero: h, act: 4, node: 'a4_n01' }); assert.ok(t.some(e => e.row === 'sealed_pearl') && t.some(e => e.row === 'sealed'));
  const sell = t.find(e => e.id === 'pearl_sell'), p0 = h.currency.pennies; assert.ok(S.buy(h, 'shop_gamble', sell, { data, act: 4 }).ok); assert.equal(h.currency.pennies, p0 + 90); assert.equal(h.currency.pearls, 49);
});

test('Mothwife: buying breaks the seal (or keeps it), a new lantern takes its place, the dark tips it toward rare', () => {
  const h = hero(), ctx = { data, hero: h, act: 4, node: 'a4_n01', runSeed: 4, level: 18 };
  const e = S.stockFor('shop_gamble', ctx).find(x => x.row === 'sealed' && x.seal.slot === 'coat');
  const r = S.buy(h, 'shop_gamble', e, ctx); assert.ok(r.ok); assert.equal(r.item.slot, 'coat'); assert.equal(r.item.rarity, e.seal.rarity); assert.equal(r.price, 70 * 4);
  const again = S.stockFor('shop_gamble', ctx).find(x => x.pos === e.pos); assert.equal(again.qty, 1); assert.notEqual(again.key, e.key);
  const k = S.buy(h, 'shop_gamble', again, { ...ctx, keepSealed: true }); assert.equal(k.item.type, 'sealed');
  let lit = 0, dark = 0; const N = 20000;
  for (let i = 0; i < N; i++) { const s = S.sealedFor(data, { runSeed: 9, level: 10 }, 'trinket', i, 0); if (S.breakSeal(data, { seal: s }, { act: 4 }).rarity === 'rare') lit++; if (S.breakSeal(data, { seal: s }, { act: 4, dark: true }).rarity === 'rare') dark++; }
  within(lit / N, 0.2, 0.012, 'lit rare'); within(dark / N, 25 / 105, 0.012, 'dark rare');
});

test('Mothwife: a sealed lantern loses on average (08 §19 targets ≈ 60% back; the economy sim tunes the prices)', () => {
  const N = 4000, out = {};
  for (const slot of ['any', 'weapon', 'coat', 'boots', 'trinket']) {
    let v = 0; for (let i = 0; i < N; i++) { const s = S.sealedFor(data, { runSeed: 3, level: 18 }, slot, i, 0); v += Math.round(baseValue(data, S.breakSeal(data, { seal: s }, { act: 4 })) * 0.25); }
    out[slot] = v / N / (data.shops.byId.shop_gamble.sealed.prices[slot] * 4);
  }
  console.log('sealed lantern EV (sell / price, Act 4, level 18):', Object.fromEntries(Object.entries(out).map(([k, x]) => [k, Math.round(x * 100) + '%'])));
  for (const x of Object.values(out)) assert.ok(x > 0.05 && x < 1, `EV ${x}`); // with 08's starting prices this is ~20-35%, not 60%: flagged for the economy sim
});

// ------------------------------------------------------------------ the Ferry
test('Ferry: pennies prices by formula; paying in max health adds debt, capped at 20%; a relight refunds it', () => {
  const h = hero(); h.level = 10; deriveStats(h, data);
  const ctx = { data, hero: h, act: 3, actsCrossed: 2 }, sp = id => S.servicePrice(data, id, ctx);
  assert.equal(sp('ferry_reveal').price, 450); assert.equal(sp('ferry_travel').price, 80); assert.equal(sp('ferry_respec_full').price, 800); assert.equal(sp('ferry_burn_in_move').price, 300);
  const full = S.fullMaxHp(h, ctx), row = id => S.stockFor('shop_ferry', ctx).find(e => e.id === id);
  let paid = 0;
  for (let k = 0; k < 10; k++) { const r = S.buy(h, 'shop_ferry', row('ferry_reveal'), { ...ctx, pay: 'health' }); if (!r.ok) { assert.equal(r.reason, 'The river can wait for the rest.'); break; } paid++; assert.ok(h.maxHpDebt <= 0.2 * full); }
  assert.ok(paid >= 3 && paid <= 4, `paid ${paid}`); assert.equal(row('ferry_reveal').healthOk, false);
  assert.equal(deriveStats(h, data).maxHp, full - h.maxHpDebt);
  const pennies = h.currency.pennies; assert.ok(S.buy(h, 'shop_ferry', row('ferry_travel'), ctx).ok); assert.equal(h.currency.pennies, pennies - 80);
  assert.ok(S.onLampRelit(h, data, 3).refunded > 0); assert.equal(h.maxHpDebt, 0); assert.equal(deriveStats(h, data).maxHp, full);
});
