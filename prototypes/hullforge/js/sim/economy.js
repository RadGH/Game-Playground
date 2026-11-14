// Trading goods between stations. Every station runs an economy that MAKES some goods (cheap, lots in stock) and
// NEEDS others (dear, little stock). The price of a good comes from:
//   its base price × what this station makes or needs × how much is in stock now × any event running here.
// Buying takes stock away (the price climbs), selling adds stock (the price falls); stock drifts back toward normal
// over play time, so a route you milk dries up and then recovers. Shortages and gluts come and go by themselves.
// Goods share the ship's cargo room with ore (state.js cargoUsed counts both): G.goods = { id: count }.
//
// Saved: G.markets[systemId] = { stock: { id: n }, t: play seconds when last updated }; G.priceSeen[systemId] =
// { t, p: { id: [buy, sell] } } — the last prices you saw there (the trade screen compares against them).
// A station's base prices and normal stock come from its seed, so they are not saved. Pure: no DOM.

import { rng, hash, clamp } from '../core/math.js';

export const GOODS = {
  rations: { name: 'Ration packs', base: 20, cat: 'Basics', color: '#d8c38a' },
  water: { name: 'Ice water', base: 14, cat: 'Basics', color: '#8fd3ff' },
  medkits: { name: 'Med kits', base: 70, cat: 'Basics', color: '#ff8a8a' },
  fabric: { name: 'Spun fabric', base: 30, cat: 'Basics', color: '#c9a8e8' },
  plate: { name: 'Hull plate', base: 46, cat: 'Industry', color: '#9aa6b4' },
  coils: { name: 'Copper coils', base: 64, cat: 'Industry', color: '#ff9d5c' },
  circuits: { name: 'Circuit boards', base: 150, cat: 'Industry', color: '#62f0a8' },
  fuel: { name: 'Fuel rods', base: 40, cat: 'Industry', color: '#ffd166' },
  ammo: { name: 'Shell crates', base: 90, cat: 'Military', color: '#c98a5a' },
  optics: { name: 'Targeting optics', base: 230, cat: 'Military', color: '#5fd8ff' },
  tea: { name: 'Nebula tea', base: 180, cat: 'Luxury', color: '#e07bff' },
  sculpture: { name: 'Glass sculptures', base: 420, cat: 'Luxury', color: '#ffe25a' },
};
export const GOOD_IDS = Object.keys(GOODS);

export const ECONOMIES = {
  mining: { name: 'Mining colony', makes: ['plate', 'fuel'], needs: ['rations', 'water', 'medkits', 'circuits'] },
  farm: { name: 'Farm ring', makes: ['rations', 'water', 'fabric', 'tea'], needs: ['coils', 'fuel', 'circuits', 'medkits'] },
  factory: { name: 'Factory hub', makes: ['plate', 'coils', 'circuits'], needs: ['water', 'rations', 'fuel', 'fabric'] },
  navy: { name: 'Navy yard', makes: ['ammo', 'optics'], needs: ['plate', 'rations', 'medkits', 'fuel'] },
  science: { name: 'Research ring', makes: ['medkits', 'optics'], needs: ['coils', 'circuits', 'water', 'tea'] },
  leisure: { name: 'Pleasure dome', makes: ['sculpture', 'tea', 'fabric'], needs: ['rations', 'water', 'medkits', 'ammo'] },
  frontier: { name: 'Frontier post', makes: ['water', 'fuel'], needs: ['ammo', 'medkits', 'plate', 'rations', 'sculpture'] },
};

/** Events: a shortage pushes prices up (k > 1), a glut pushes them down (k < 1). Each lasts one EVENT_SPAN window. */
export const EVENTS = {
  famine: { name: 'Food shortage', up: ['rations', 'water'], k: 1.9, blurb: 'Supply ships were lost. Food and water sell high.' },
  outbreak: { name: 'Sickness aboard', up: ['medkits'], k: 2.1, blurb: 'Med kits are wanted badly.' },
  buildup: { name: 'Fleet build-up', up: ['ammo', 'optics', 'fuel'], k: 1.6, blurb: 'The navy is arming. Weapons goods pay well.' },
  boom: { name: 'Building boom', up: ['plate', 'coils', 'circuits'], k: 1.5, blurb: 'New decks going up. Industry goods sell high.' },
  festival: { name: 'Festival', up: ['tea', 'sculpture', 'fabric'], k: 1.5, blurb: 'A festival: luxuries in demand.' },
  fuelglut: { name: 'Fuel glut', down: ['fuel', 'water'], k: 0.55, blurb: 'Tankers arrived at once. Fuel and water are cheap.' },
  overstock: { name: 'Overstock', down: ['circuits', 'coils', 'plate'], k: 0.6, blurb: 'Warehouses are full. Industry goods are cheap.' },
};
export const EVENT_SPAN = 900;          // play seconds per event window
export const EVENT_CHANCE = 0.35;       // chance a window has an event
export const RECOVER_TIME = 600;        // play seconds for stock to get ~63% of the way back to normal
export const SPREAD = 0.06;             // buy price is 6% over the curve, sell price 6% under

const infoCache = new Map();
/** A station's economy, base prices and normal stock (from its seed; never saved). */
export function marketInfo(sys) {
  const k = `${sys.seed}`; const hit = infoCache.get(k); if (hit) return hit;
  const r = rng(hash('market', sys.seed));
  const econ = sys.id === 0 ? 'mining' : r.pick(Object.keys(ECONOMIES));
  const E = ECONOMIES[econ]; const base = {}, norm = {};
  for (const id of GOOD_IDS) {
    const g = GOODS[id]; const makes = E.makes.includes(id), needs = E.needs.includes(id);
    base[id] = Math.round(g.base * (makes ? r.range(0.55, 0.72) : needs ? r.range(1.3, 1.6) : r.range(0.88, 1.12)) * (1 + (sys.danger - 1) * 0.04));
    norm[id] = Math.max(4, Math.round((makes ? r.range(260, 480) : needs ? r.range(8, 30) : r.range(50, 120)) / Math.sqrt(g.base / 20)));
  }
  const info = { econ, name: E.name, makes: E.makes, needs: E.needs, base, norm };
  infoCache.set(k, info);
  return info;
}

/** The event running at a station at play time `now` (or null). Seeded by the window, so it is the same on reload. */
export function eventAt(sys, now) {
  const win = Math.floor(now / EVENT_SPAN);
  const r = rng(hash('ev', sys.seed, win));
  if (r() >= EVENT_CHANCE) return null;
  const id = r.pick(Object.keys(EVENTS));
  return { id, ...EVENTS[id], endsAt: (win + 1) * EVENT_SPAN };
}

/** A station's live market (creates or updates G.markets[sys.id]). `now` = play seconds. */
export function market(G, sys, now = G.playTime || 0) {
  const info = marketInfo(sys);
  G.markets ||= {};
  let M = G.markets[sys.id];
  if (!M) { M = { stock: { ...info.norm }, t: now }; G.markets[sys.id] = M; }
  for (const id of GOOD_IDS) if (M.stock[id] == null) M.stock[id] = info.norm[id];
  const dt = Math.max(0, now - (M.t ?? now)); M.t = now;
  if (dt > 0) { const f = 1 - Math.exp(-dt / RECOVER_TIME); for (const id of GOOD_IDS) M.stock[id] += (info.norm[id] - M.stock[id]) * f; }
  return { M, info, event: eventAt(sys, now), sys };
}

/**
 * Price to buy one unit (you pay) and to sell one (you get) at the stock level now.
 * Buying is priced at the stock AFTER the unit leaves and selling at the stock after it arrives, so buying one and
 * selling it straight back always loses money. `edge` (research) makes both sides that share better.
 */
export function prices(mk, id, edge = 0) {
  const { M, info, event } = mk;
  const base = info.base[id]; const n = info.norm[id]; const s = Math.max(0, M.stock[id]);
  const at = st => {
    let k = clamp(Math.pow(n / Math.max(1, st), 0.35), 0.5, 2.6);
    if (event?.up?.includes(id) || event?.down?.includes(id)) k *= event.k;
    return base * k;
  };
  return {
    buy: Math.max(1, Math.round(at(s - 1) * (1 + SPREAD) * (1 - edge))),
    sell: Math.max(1, Math.round(at(s + 1) * (1 - SPREAD) * (1 + edge))),
    stock: Math.floor(s), normal: at(n),
  };
}

/** What n units would cost to buy here (walks the price up unit by unit), without buying. */
export function quoteBuy(mk, id, n, edge = 0) {
  const keep = mk.M.stock[id]; let cost = 0, got = 0;
  for (let i = 0; i < n; i++) { const p = prices(mk, id, edge); if (p.stock < 1) break; cost += p.buy; mk.M.stock[id] -= 1; got++; }
  mk.M.stock[id] = keep;
  return { cost, n: got };
}
export function quoteSell(mk, id, n, edge = 0) {
  const keep = mk.M.stock[id]; let got = 0;
  for (let i = 0; i < n; i++) { got += prices(mk, id, edge).sell; mk.M.stock[id] += 1; }
  mk.M.stock[id] = keep;
  return got;
}

/** Free cargo room (ore + goods share it). `room` = the ship's cargo stat. */
export const goodsUsed = G => Object.values(G.goods || {}).reduce((a, b) => a + b, 0);

/** How many of a good you could buy now: limited by stock, free room and credits. */
export function maxBuy(G, mk, id, freeRoom, edge = 0) {
  const keep = mk.M.stock[id]; let cost = 0, n = 0;
  while (n < freeRoom) { const p = prices(mk, id, edge); if (p.stock < 1 || cost + p.buy > G.credits) break; cost += p.buy; mk.M.stock[id] -= 1; n++; }
  mk.M.stock[id] = keep;
  return n;
}

/** Buy n units into the hold. Returns { n, cost } (n may be less than asked when stock or credits run out). */
export function buyGoods(G, mk, id, n, freeRoom, edge = 0) {
  n = Math.min(n, Math.max(0, freeRoom)); let cost = 0, got = 0;
  for (let i = 0; i < n; i++) {
    const p = prices(mk, id, edge); if (p.stock < 1 || G.credits < p.buy) break;
    G.credits -= p.buy; cost += p.buy; mk.M.stock[id] -= 1; got++;
  }
  if (got) { G.goods[id] = (G.goods[id] || 0) + got; G.stats.traded = (G.stats.traded || 0) + got; notePaid(G, id, got, cost); }
  return { n: got, cost };
}
/** Sell n units from the hold. Returns { n, got }. */
export function sellGoods(G, mk, id, n, edge = 0) {
  n = Math.min(n, G.goods[id] || 0); let got = 0;
  for (let i = 0; i < n; i++) { const p = prices(mk, id, edge); G.credits += p.sell; got += p.sell; mk.M.stock[id] += 1; }
  if (n) {
    G.goods[id] -= n; if (G.goods[id] <= 0) delete G.goods[id];
    G.stats.earned = (G.stats.earned || 0) + got; G.stats.traded = (G.stats.traded || 0) + n;
    const paid = G.goodsPaid?.[id];
    if (paid) { paid.cost -= paid.cost * (n / (paid.n || n)); paid.n = Math.max(0, paid.n - n); if (!paid.n) delete G.goodsPaid[id]; }
  }
  return { n, got };
}
/** Remember what you paid (average cost per unit shows as profit on the sell side). */
export function notePaid(G, id, n, cost) {
  const p = ((G.goodsPaid ||= {})[id] ||= { n: 0, cost: 0 });
  p.n += n; p.cost += cost;
}
export const avgPaid = (G, id) => { const p = G.goodsPaid?.[id]; return p?.n ? p.cost / p.n : null; };

/** Remember this station's prices now (the trade screen compares other stations against them). */
export function remember(G, mk, edge = 0) {
  const p = {};
  for (const id of GOOD_IDS) { const q = prices(mk, id, edge); p[id] = [q.stock > 0 ? q.buy : null, q.sell]; }
  (G.priceSeen ||= {})[mk.sys.id] = { t: G.playTime || 0, p };
}

/** The best place you have seen to SELL a good, other than `here`: { sysId, price, t } or null. */
export function bestSellElsewhere(G, id, here) {
  let best = null;
  for (const [sid, rec] of Object.entries(G.priceSeen || {})) {
    if (+sid === here) continue; const v = rec.p?.[id]?.[1]; if (v == null) continue;
    if (!best || v > best.price) best = { sysId: +sid, price: v, t: rec.t };
  }
  return best;
}
/** The cheapest place you have seen to BUY a good, other than `here`. */
export function bestBuyElsewhere(G, id, here) {
  let best = null;
  for (const [sid, rec] of Object.entries(G.priceSeen || {})) {
    if (+sid === here) continue; const v = rec.p?.[id]?.[0]; if (v == null) continue;
    if (!best || v < best.price) best = { sysId: +sid, price: v, t: rec.t };
  }
  return best;
}
/** Profit per unit of buying here and selling at the best place seen (null when nowhere else is known). */
export function profitPerUnit(G, mk, id, edge = 0) {
  const b = bestSellElsewhere(G, id, mk.sys.id); if (!b) return null;
  return { profit: b.price - prices(mk, id, edge).buy, where: b };
}
