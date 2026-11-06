// Markets (PLAN §0 #13 — market only, no smuggling). Every station has a stock and a price for each good.
// Prices come from: the good's base price × what the station's economy makes or needs × how much is in
// stock × any event running in that system. Buying raises the price, selling lowers it. Stock drifts back
// toward normal over time, so a route you milk dries up and recovers.

import { rng, hash, clamp } from '../core/math.js';
import { MATERIALS } from '../data/types.js';

export const GOODS = {
  food:       { name: 'Food rations', base: 22, cat: 'Basics', vol: 1 },
  water:      { name: 'Purified water', base: 14, cat: 'Basics', vol: 1 },
  medicine:   { name: 'Medical supplies', base: 70, cat: 'Basics', vol: 1 },
  textiles:   { name: 'Textiles', base: 30, cat: 'Basics', vol: 1 },
  alloys:     { name: 'Alloy ingots', base: 48, cat: 'Industry', vol: 1 },
  machinery:  { name: 'Machinery', base: 120, cat: 'Industry', vol: 1 },
  electronics:{ name: 'Electronics', base: 160, cat: 'Industry', vol: 1 },
  fuel:       { name: 'Fuel cells', base: 40, cat: 'Industry', vol: 1 },
  munitions:  { name: 'Munitions', base: 95, cat: 'Military', vol: 1 },
  armaments:  { name: 'Armaments', base: 260, cat: 'Military', vol: 1 },
  luxury:     { name: 'Luxury goods', base: 340, cat: 'Luxury', vol: 1 },
  art:        { name: 'Xeno-art', base: 600, cat: 'Luxury', vol: 1 },
  data:       { name: 'Survey data', base: 210, cat: 'Science', vol: 1 },
  biotech:    { name: 'Biotech samples', base: 380, cat: 'Science', vol: 1 },
};
// raw materials trade too
for (const [id, m] of Object.entries(MATERIALS)) GOODS[id] = { name: m.name, base: m.price, cat: 'Raw', vol: 1, mat: true, tier: m.tier, alien: !!m.alien };
export const GOOD_IDS = Object.keys(GOODS);

/** What kind of economy a station runs: makes (cheap, lots) and needs (pricey, short). */
export const ECONOMIES = {
  mining:      { name: 'Mining colony', makes: ['ferrite', 'silicate', 'cuprite', 'titanium', 'ice', 'cobalt'], needs: ['food', 'water', 'machinery', 'medicine', 'fuel'] },
  industrial:  { name: 'Industrial hub', makes: ['alloys', 'machinery', 'electronics', 'fuel'], needs: ['ferrite', 'silicate', 'cuprite', 'carbon', 'titanium', 'food'] },
  agricultural:{ name: 'Farm world', makes: ['food', 'water', 'textiles', 'biotech'], needs: ['machinery', 'electronics', 'fuel', 'medicine'] },
  military:    { name: 'Navy depot', makes: ['munitions', 'armaments'], needs: ['alloys', 'electronics', 'food', 'fuel', 'iridium', 'titanium'] },
  research:    { name: 'Research outpost', makes: ['data', 'medicine', 'biotech'], needs: ['electronics', 'quartz', 'exotic', 'chitin', 'nanite', 'lumen', 'relic'] },
  luxury:      { name: 'Pleasure station', makes: ['luxury', 'art', 'textiles'], needs: ['food', 'water', 'medicine', 'biotech', 'quartz'] },
  frontier:    { name: 'Frontier post', makes: ['ice', 'carbon', 'ferrite'], needs: ['food', 'munitions', 'medicine', 'machinery', 'alloys'] },
  pirate:      { name: 'Corsair den', makes: ['armaments', 'munitions', 'luxury'], needs: ['food', 'medicine', 'fuel', 'electronics', 'alloys'] },
};
export const EVENTS = {
  war:     { name: 'War footing', up: ['munitions', 'armaments', 'fuel', 'medicine'], k: 1.6, blurb: 'A battle nearby: weapons and medicine pay well.' },
  famine:  { name: 'Shortage', up: ['food', 'water'], k: 2.0, blurb: 'Supply ships were lost. Food is scarce.' },
  plague:  { name: 'Outbreak', up: ['medicine', 'biotech'], k: 2.2, blurb: 'Sickness on the station. Medicine wanted.' },
  boom:    { name: 'Boom times', up: ['luxury', 'art', 'electronics'], k: 1.5, blurb: 'Money is flowing. Luxuries sell high.' },
  glut:    { name: 'Ore glut', down: ['ferrite', 'silicate', 'carbon', 'cuprite'], k: 0.55, blurb: 'Too much ore. Raw prices crashed.' },
  strike:  { name: 'Dock strike', up: ['alloys', 'machinery'], k: 1.7, blurb: 'The refineries are idle.' },
  festival:{ name: 'Festival', up: ['food', 'luxury', 'textiles', 'art'], k: 1.4, blurb: 'A festival: food and finery in demand.' },
};

/** Build (or fetch) a station's market. `sys` from the galaxy. Pure apart from writing into G.markets. */
export function market(G, sys, now) {
  let M = G.markets[sys.id];
  if (!M) {
    const r = rng(hash('market', sys.seed));
    const econ = sys.station === 'pirate' ? 'pirate' : sys.tier <= 1 ? r.pick(['mining', 'frontier', 'agricultural']) : r.pick(Object.keys(ECONOMIES).filter(e => e !== 'pirate'));
    M = { econ, stock: {}, base: {}, event: null, eventUntil: 0, t: now };
    for (const id of GOOD_IDS) {
      const g = GOODS[id];
      if (g.mat && g.tier > sys.tier + 2) continue;
      if (g.alien && !(ECONOMIES[econ].needs.includes(id) || r.chance(0.3))) continue;
      const makes = ECONOMIES[econ].makes.includes(id), needs = ECONOMIES[econ].needs.includes(id);
      M.base[id] = Math.round(g.base * (makes ? r.range(0.55, 0.75) : needs ? r.range(1.25, 1.6) : r.range(0.85, 1.15)) * (1 + (sys.tier - 1) * 0.04));
      M.stock[id] = Math.round((makes ? r.range(300, 600) : needs ? r.range(5, 40) : r.range(60, 160)) / Math.sqrt(g.base / 20));
      M.norm ||= {}; M.norm[id] = M.stock[id];
    }
    G.markets[sys.id] = M;
  }
  tick(M, sys, now);
  return M;
}

/** Drift stock back toward normal; roll events now and then. `now` in game seconds. */
function tick(M, sys, now) {
  const dt = Math.max(0, now - (M.t || now)); M.t = now;
  if (dt > 0) for (const id in M.stock) { const n = M.norm[id]; M.stock[id] += (n - M.stock[id]) * (1 - Math.exp(-dt / 900)); }
  if (now > M.eventUntil) {
    const r = rng(hash('ev', sys.seed, Math.floor(now / 1200)));
    M.event = r.chance(0.35) ? r.pick(Object.keys(EVENTS)) : null;
    M.eventUntil = (Math.floor(now / 1200) + 1) * 1200;
  }
}

/** Price to buy one unit from the station (you pay) and to sell one (you get). */
export function prices(M, id) {
  const base = M.base[id]; if (base == null) return null;
  const n = M.norm[id] || 50; const s = Math.max(0, M.stock[id]);
  let k = clamp(Math.pow(n / Math.max(1, s), 0.35), 0.5, 2.6);
  const ev = M.event ? EVENTS[M.event] : null;
  if (ev?.up?.includes(id)) k *= ev.k; if (ev?.down?.includes(id)) k *= ev.k;
  const mid = base * k;
  return { buy: Math.max(1, Math.round(mid * 1.06)), sell: Math.max(1, Math.round(mid * 0.94)), stock: Math.floor(s) };
}

/** Buy n units. Returns the cost (or null if not possible). Mutates stock. */
export function buy(M, id, n) {
  let cost = 0;
  for (let i = 0; i < n; i++) { const p = prices(M, id); if (!p || p.stock < 1) return i ? cost : null; cost += p.buy; M.stock[id] -= 1; }
  return cost;
}
export function sell(M, id, n) {
  let got = 0;
  if (M.base[id] == null) { M.base[id] = Math.round(GOODS[id].base * 1.1); M.norm[id] = 10; M.stock[id] = 0; }
  for (let i = 0; i < n; i++) { const p = prices(M, id); got += p.sell; M.stock[id] += 1; }
  return got;
}

/** Remember the best buy and sell prices seen (the trade screen shows them). */
export function remember(G, sys, M) {
  for (const id in M.base) {
    const p = prices(M, id); if (!p) continue;
    const mem = (G.priceMemory[id] ||= {});
    // last prices seen at each system (the trade screen finds the best place to sell from these)
    (mem.bySys ||= {})[sys.id] = { name: sys.name, buy: p.stock > 0 ? p.buy : null, sell: p.sell, t: G.playTime };
    if (p.stock > 0 && (!mem.buy || p.buy < mem.buy.price || mem.buy.sys === sys.id)) mem.buy = { sys: sys.id, name: sys.name, price: p.buy, at: G.playTime };
    if (!mem.sell || p.sell > mem.sell.price || mem.sell.sys === sys.id) mem.sell = { sys: sys.id, name: sys.name, price: p.sell, at: G.playTime };
  }
}

/** Refinery recipes: ore in, more valuable goods out. */
export const RECIPES = [
  { id: 'alloys', name: 'Smelt alloy ingots', in: { ferrite: 4, carbon: 1 }, out: { alloys: 2 } },
  { id: 'electronics', name: 'Fab electronics', in: { silicate: 3, cuprite: 2 }, out: { electronics: 1 } },
  { id: 'fuel', name: 'Crack fuel cells', in: { ice: 3 }, out: { fuel: 2 } },
  { id: 'water', name: 'Melt water', in: { ice: 2 }, out: { water: 3 } },
  { id: 'machinery', name: 'Build machinery', in: { alloys: 2, electronics: 1 }, out: { machinery: 2 } },
  { id: 'munitions', name: 'Press munitions', in: { ferrite: 2, carbon: 2 }, out: { munitions: 1 } },
  { id: 'armaments', name: 'Forge armaments', in: { titanium: 2, alloys: 2, electronics: 1 }, out: { armaments: 2 } },
  { id: 'biotech', name: 'Culture biotech', in: { chitin: 2, water: 2 }, out: { biotech: 2 } },
];
