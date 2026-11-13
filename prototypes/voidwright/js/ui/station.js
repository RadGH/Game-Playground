// The station screen: every shop a station offers, as tabs (PLAN §0 #13 market, #17 shops).
//
// openStation(app, st, onUndock) — st is the station body (name, services, faction, kind 'trade'|'pirate', tier).
// A tab shows when the station has the service AND the save has unlocked it (G.unlocked[id]); a service the
// station has but the player has not unlocked yet shows greyed with "Unlocks later" (drip-feed, PLAN §1.4).
//
// Everything here edits the save (app.G). The ship in space is rebuilt from G.ship when the player undocks,
// so the shipyard / repairs / crew just change G.ship. Prices are 15% worse when your standing with the
// station's faction is below zero.

import { panel, el, btn, toast, banner, fmt, esc, showSelected } from './dom.js';
import { SLOTS, itemCard } from './items.js';
import { drawWorkshop } from './workshop.js';
import { makeDroneItem, fitDrone, unfitDrone } from '../sim/state.js';
import { droneCard, dronePicker } from './drones-ui.js';
import { growOptions, growCost } from '../sim/hullgrow.js';
import { GOODS, GOOD_IDS, ECONOMIES, EVENTS, RECIPES, market, prices, buy as mBuy, sell as mSell, remember } from '../sim/economy.js';
import { cargoUsed } from '../sim/world.js';
import { makeItem, itemValue, rollRarity, pickPart } from '../sim/loot.js';
import { BLOCKS } from '../data/blocks.js';
import { CLASSES, PREMADES } from '../data/hulls.js';
import { DRONES } from '../data/drones.js';
import { MATERIALS, RARITY, RARITY_BY_ID } from '../data/types.js';
import { FACTIONS, factionsForTier } from '../data/factions.js';
import { buildPremade } from '../sim/shipgen.js';
import { WARP_CORES, warpCore, canWarpTo } from '../sim/galaxy.js';
import { gridToJSON, gridFromJSON } from '../sim/grid.js';
import { makeBody } from '../sim/ship.js';
import { bakeBody } from '../render/bake.js';
import { rng, hash, clamp } from '../core/math.js';
import { unlockFromFind, UNLOCK_NAMES } from '../sim/quests.js';
import { tabMercs, hangarExtras } from './mercs.js';   // Mercenaries board (play-test #29)
import { missionsTab } from './missions.js';   // [encounters] Missions board (E8); bounties are a section of it
import { PROJECTS, projectBlock, doProject, applyResearch, researchBonus, hasLicence, priceEdge, salvageEdge, researchLootBonus, specimenPoints } from '../sim/research.js';

const SERVICES = [
  ['market', 'Market'], ['outfitter', 'Outfitter'], ['shipyard', 'Shipyard'], ['refinery', 'Refinery'], ['repair', 'Repairs'],
  ['crew', 'Crew hall'], ['insurance', 'Insurance'], ['drones', 'Drone shop'], ['lab', 'Research lab'], ['salvage', 'Salvage yard'],
  ['missions', 'Missions'], ['blackmarket', 'Black market'], ['workshop', 'Workshop'], ['mercs', 'Mercenaries'],
];
const CAT_ORDER = ['Basics', 'Industry', 'Military', 'Luxury', 'Science', 'Raw'];
const DAY = 600;                                   // shop stock changes every 10 minutes of play
let lastTab = null;                                // remembered between dockings (this session)

// ------------------------------------------------------------------ small helpers
const isMat = id => !!GOODS[id]?.mat;
const held = (G, id) => (isMat(id) ? G.cargo[id] : G.goods[id]) || 0;
function give(G, id, n) {
  const bag = isMat(id) ? G.cargo : G.goods;
  bag[id] = (bag[id] || 0) + n; if (bag[id] <= 0) delete bag[id];
}
const goodName = id => GOODS[id]?.name || MATERIALS[id]?.name || id;
const dayOf = G => Math.floor((G.playTime || 0) / DAY);
function repLabel(v) { return v >= 50 ? 'Honoured' : v >= 15 ? 'Friendly' : v >= 0 ? 'Neutral' : v >= -30 ? 'Unfriendly' : 'Hostile'; }
const RANK_OF = cls => CLASSES[cls]?.rank ?? 0;

/** Biggest block size the player may be offered: their best hull, or what quests unlocked. */
function sizeLimit(G) {
  let n = Math.max(CLASSES[G.ship.cls]?.maxBlock || 1, ...(G.hangar || []).map(h => CLASSES[h.cls]?.maxBlock || 1));
  // the size of parts your best hull can mount (Grow hull raises it); unlock flags no longer widen it
  return n;
}
/** A ship body from a saved ship record { cls, grid }, with research bonuses. */
function bodyOf(G, rec) {
  const b = makeBody('ship', gridFromJSON(rec.grid), { cls: rec.cls, team: 'player', faction: 'player', name: rec.name });
  applyResearch(b, G);
  b.crew = Math.min(rec.crew ?? b.stats.crewCap, b.stats.crewCap);
  return b;
}
/** What a saved ship is worth to a shipyard: ~40% of its hull price + 25% of the modules fitted. */
function tradeIn(rec) {
  const pm = PREMADES.find(p => p.id === rec.design);
  const hull = (pm?.price ?? CLASSES[rec.cls]?.price ?? 0) * 0.4;
  let mods = 0;
  for (const [id, , , , , item] of rec.grid.b) {
    const d = BLOCKS[id]; if (!d?.module) continue;
    mods += listPrice(item || { block: id, rarity: 'common' });
  }
  return Math.round(hull + mods * 0.25);
}
/** Shop stock bought out today: G.shopTaken[key] = [slot indices]. Old days are dropped. */
function taken(G, key) {
  G.shopTaken ||= {};
  const d = dayOf(G);
  for (const k of Object.keys(G.shopTaken)) { const kd = +k.split(':').pop(); if (kd < d - 1) delete G.shopTaken[k]; }
  return (G.shopTaken[key] ||= []);
}
const stockCache = new Map();                      // key -> generated stock (so item uids stay stable while docked)

// ------------------------------------------------------------------ entry
export function openStation(app, st, onUndock) {
  const G = app.G; const sys = app.galaxy.systems[G.system];
  G.costBasis ||= {}; G.research ||= { points: 0, done: [] }; G.research.seen ||= {}; G.hangar ||= []; G.bounties ||= [];
  const pirate = st.stationKind === 'pirate' || sys.station === 'pirate';
  const p = panel(st.name, () => { app.stationRefresh = null; onUndock(); }, { closeLabel: 'Undock', cls: 'station' });
  const info = el('div', { class: 'st-info' });
  p.head.insertBefore(info, p.head.children[1]);
  const tabsBar = el('div', { class: 'tabs st-tabs' });
  const content = el('div', { class: 'st-content' });
  p.body.append(tabsBar, content);

  // S = everything a tab needs. ship() is the current ship's body (rebuilt after a purchase).
  let shipBody = null;
  const S = {
    app, G, st, sys, pirate,
    ship: () => (shipBody ||= bodyOf(G, G.ship)),
    changed: () => { shipBody = null; },
    cap: () => Math.floor(S.ship().stats.cargo),
    room: () => Math.max(0, S.cap() - cargoUsed(G)),
    k: () => {
      const rep = G.rep[st.faction] ?? 0; const bad = rep < 0 ? 0.15 : 0; const e = priceEdge(G);
      return { buy: (1 + bad) * (1 - e), sell: (1 - bad) * (1 + e), bad };
    },
    done: (msg, kind = 'good') => { if (msg) toast(msg, kind); app.save?.(); render(); },
  };
  app.stationRefresh = () => { S.changed(); render(); };   // the Parts hold can switch ships while docked (owner 2026-11-13)

  // [encounters] every trade station, and any station or outpost with a bounty board, has a Missions tab (bounties live inside it)
  // insurance is sold at every station and outpost (owner 2026-11-12, report #65) — also old saves' stations
  const services = SERVICES.filter(([id]) => (st.services?.includes(id) || id === 'insurance' || (id === 'missions' && (st.services?.includes('bounty') || st.stationKind === 'trade'))) && (id !== 'blackmarket' || pirate));
  const open = id => !!G.unlocked[id];
  let tab = services.find(([id]) => id === lastTab && open(id))?.[0] || services.find(([id]) => open(id))?.[0] || null;

  function render() {
    const scroll = p.body.scrollTop;
    // header: credits, cargo, faction standing
    const F = FACTIONS[st.faction]; const rep = Math.round(G.rep[st.faction] ?? 0); const k = S.k();
    info.innerHTML = '';
    info.append(
      el('span', { class: 'stat amber' }, `${fmt(G.credits)} cr`),
      el('span', { class: 'stat' + (cargoUsed(G) >= S.cap() ? ' bad' : '') }, `Hold ${fmt(cargoUsed(G))}/${fmt(S.cap())}`),
      el('span', { class: 'stat', style: `color:${F?.color || '#ccc'}` }, `${F?.short || st.faction}: ${repLabel(rep)} (${rep >= 0 ? '+' : ''}${rep})`),
    );
    if (k.bad) info.append(el('span', { class: 'stat bad' }, 'Prices 15% worse'));
    // tabs
    tabsBar.innerHTML = '';
    for (const [id, label] of services) {
      const b = btn(open(id) ? label : `${label} · unlocks later`, () => {
        if (!open(id)) { toast(`${label}: unlocks later. Follow your goals.`); return; }
        tab = lastTab = id; render(); p.body.scrollTop = 0;
      }, (id === tab ? 'on' : '') + (open(id) ? '' : ' locked'));
      tabsBar.append(b);
    }
    content.innerHTML = '';
    if (!tab) content.append(el('p', { class: 'hint' }, 'Nothing here is open to you yet. Follow your goals to unlock station services.'));
    else (TABS[tab] || (() => content.append(el('p', {}, 'Closed.'))))(S, content);
    p.body.scrollTop = scroll;
  }
  S.render = render; S.toTop = () => { p.body.scrollTop = 0; };
  render();
  return p;
}

// ------------------------------------------------------------------ section helpers
const section = (box, title, hint) => { box.append(el('h3', { class: 'st-h' }, title)); if (hint) box.append(el('p', { class: 'hint' }, hint)); };
const td = (label, ...kids) => el('td', { 'data-l': label }, ...kids);

// ================================================================== 1. market
function tabMarket(S, box) {
  const { G, sys } = S; const M = market(G, sys, G.playTime); remember(G, sys, M);
  const k = S.k(); const E = ECONOMIES[M.econ]; const cap = S.cap();
  // economy + event
  const top = el('div', { class: 'cards st-top' });
  top.append(el('div', { class: 'card' },
    el('b', {}, E.name),
    el('div', { class: 'hint' }, 'Makes (cheap here): ', el('span', { class: 'good' }, E.makes.map(goodName).join(', '))),
    el('div', { class: 'hint' }, 'Needs (pays well here): ', el('span', { class: 'amber' }, E.needs.map(goodName).join(', ')))));
  if (M.event) {
    const ev = EVENTS[M.event]; const left = Math.max(1, Math.round((M.eventUntil - G.playTime) / 60));
    top.append(el('div', { class: 'card st-event' }, el('b', { class: 'amber' }, `Now: ${ev.name}`), el('div', {}, ev.blurb),
      el('div', { class: 'hint' }, `${[...(ev.up || []), ...(ev.down || [])].map(goodName).join(', ')} · about ${left} min left`)));
  }
  box.append(top);
  // quick actions
  const ore = Object.keys(G.cargo).filter(id => G.cargo[id] > 0 && !MATERIALS[id]?.alien);
  box.append(el('div', { class: 'row wrap st-quick' },
    btn(`Sell all ore${ore.length ? ` (${fmt(ore.reduce((s, id) => s + G.cargo[id], 0))})` : ''}`, () => {
      let got = 0, n = 0; for (const id of ore) { const r = sellGood(S, M, id, G.cargo[id]); got += r.got; n += r.n; }
      S.done(n ? `Sold ${fmt(n)} ore for ${fmt(got)} cr` : 'No ore to sell.', n ? 'good' : '');
    }, 'primary'),
    el('span', { class: 'hint' }, 'Green = a good deal, red = a bad one. "Best elsewhere" is the best price you have seen at other stations.')));

  // the table (collapses to cards on a phone)
  const ids = GOOD_IDS.filter(id => M.base[id] != null || held(G, id) > 0)
    .sort((a, b) => CAT_ORDER.indexOf(GOODS[a].cat) - CAT_ORDER.indexOf(GOODS[b].cat) || GOODS[a].base - GOODS[b].base);
  const t = el('table', { class: 'grid st-cards st-market' });
  t.append(el('thead', {}, el('tr', {}, ...['Good', 'Buy here', 'Sell here', 'Stock', 'You hold', 'Best elsewhere', 'Profit / unit', 'Full hold', ''].map(h => el('th', {}, h)))));
  const tb = el('tbody'); let lastCat = null;
  for (const id of ids) {
    const g = GOODS[id];
    if (g.cat !== lastCat) { lastCat = g.cat; tb.append(el('tr', { class: 'st-cat' }, el('td', { colspan: 9 }, g.cat === 'Raw' ? 'Raw materials' : g.cat))); }
    const p = quote(M, id); const buyP = Math.round(p.buy * k.buy), sellP = Math.round(p.sell * k.sell);
    const h = held(G, id); const basis = G.costBasis[id];
    // best price seen at OTHER stations
    const seen = Object.entries(G.priceMemory[id]?.bySys || {}).filter(([sid]) => +sid !== sys.id).map(([, v]) => v);
    const bestSell = seen.reduce((a, v) => (!a || v.sell > a.sell ? v : a), null);
    const traded = M.base[id] != null;
    const profit = bestSell && traded && p.stock > 0 ? bestSell.sell - buyP : null;
    const buyCls = profit == null ? '' : profit > buyP * 0.08 ? 'good' : profit < 0 ? 'bad' : '';
    let sellCls = '';
    if (h > 0) {
      if ((basis?.n && sellP < basis.avg) || (bestSell && bestSell.sell > sellP * 1.15)) sellCls = 'bad';
      else if ((basis?.n && sellP > basis.avg * 1.05) || (bestSell && sellP >= bestSell.sell)) sellCls = 'good';
    }
    const makes = E.makes.includes(id), needs = E.needs.includes(id);
    const evUp = M.event && EVENTS[M.event].up?.includes(id), evDown = M.event && EVENTS[M.event].down?.includes(id);
    const tags = [makes && el('span', { class: 'tag good' }, 'made here'), needs && el('span', { class: 'tag amber' }, 'wanted'),
      evUp && el('span', { class: 'tag amber' }, 'event ↑'), evDown && el('span', { class: 'tag bad' }, 'event ↓')];
    const nameCell = td('', el('b', { style: g.mat ? `color:${MATERIALS[id]?.color}` : '' }, g.name), ' ', ...tags);
    const maxB = traded ? maxBuy(S, M, id) : 0;
    const buyAct = n => { const r = doBuy(S, M, id, n); S.done(r.msg, r.ok ? 'good' : 'bad'); };
    const acts = el('div', { class: 'st-acts' },
      el('span', { class: 'st-actlabel' }, 'Buy'),
      btn('1', () => buyAct(1)), btn('10', () => buyAct(10)), btn('Max', () => buyAct(maxB)),
      el('span', { class: 'st-actlabel' }, 'Sell'),
      btn('1', () => S.done(sellMsg(sellGood(S, M, id, 1)))), btn('10', () => S.done(sellMsg(sellGood(S, M, id, 10)))), btn('All', () => S.done(sellMsg(sellGood(S, M, id, h)))));
    const bs = [...acts.querySelectorAll('button')];
    bs.forEach((b, i) => { b.disabled = i < 3 ? !maxB : !h; });
    tb.append(el('tr', {},
      nameCell,
      td('Buy here', traded && p.stock > 0 ? el('span', { class: buyCls }, `${fmt(buyP)}`) : el('span', { class: 'meh' }, '—')),
      td('Sell here', el('span', { class: sellCls }, `${fmt(sellP)}`), basis?.n ? el('div', { class: 'hint' }, `you paid ${fmt(basis.avg)}`) : null),
      td('Stock', fmt(p.stock)),
      td('You hold', h ? el('b', {}, fmt(h)) : el('span', { class: 'meh' }, '0')),
      td('Best elsewhere', bestSell ? el('span', {}, `${fmt(bestSell.sell)} `, el('span', { class: 'hint' }, `at ${bestSell.name}`)) : el('span', { class: 'meh' }, 'not seen yet')),
      td('Profit / unit', profit == null ? el('span', { class: 'meh' }, '—') : el('span', { class: profit > 0 ? 'good' : 'bad' }, `${profit > 0 ? '+' : ''}${fmt(profit)}`)),
      td('Full hold', profit == null ? el('span', { class: 'meh' }, '—') : el('span', { class: profit > 0 ? 'good' : 'bad' }, `${profit > 0 ? '+' : ''}${fmt(profit * Math.min(cap, p.stock))}`)),
      td('', acts)));
  }
  t.append(tb); box.append(t);
}

/** Prices for a good even if this station does not usually trade it (selling opens a small demand). */
function quote(M, id) {
  const p = prices(M, id); if (p) return p;
  const tmp = { base: { [id]: Math.round(GOODS[id].base * 1.1) }, norm: { [id]: 10 }, stock: { [id]: 0 }, event: M.event };
  return prices(tmp, id);
}
/** How many units the player can buy right now (credits, stock, hold space). Does not change the market. */
function maxBuy(S, M, id) {
  const { G } = S; const k = S.k(); const s0 = M.stock[id];
  let n = 0, cost = 0; const room = S.room();
  while (n < room) {
    const p = prices(M, id); if (!p || p.stock < 1) break;
    const u = Math.round(p.buy * k.buy); if (cost + u > G.credits) break;
    cost += u; n++; M.stock[id] -= 1;
  }
  M.stock[id] = s0;
  return n;
}
function doBuy(S, M, id, want) {
  const { G, sys } = S; const k = S.k();
  const n = Math.min(want, maxBuy(S, M, id));
  if (n <= 0) return { msg: S.room() <= 0 ? 'Your hold is full.' : 'You cannot afford that.' };
  let cost = 0;
  for (let i = 0; i < n; i++) { const p = prices(M, id); cost += Math.round(p.buy * k.buy); mBuy(M, id, 1); }
  G.credits -= cost;
  // average cost basis: what the units you bought (and still hold) cost you
  const b = (G.costBasis[id] ||= { n: 0, avg: 0 });
  b.avg = (b.avg * b.n + cost) / (b.n + n); b.n += n;
  give(G, id, n); G.stats.bought = (G.stats.bought || 0) + n;
  remember(G, sys, M);
  return { ok: true, msg: `Bought ${fmt(n)} ${goodName(id)} for ${fmt(cost)} cr` };
}
/** Sell n units. Profit counts only units you bought (mined ore is income, not trade profit). */
function sellGood(S, M, id, want) {
  const { G, sys } = S; const k = S.k();
  const n = Math.min(want, held(G, id)); if (n <= 0) return { n: 0, got: 0 };
  let got = 0;
  for (let i = 0; i < n; i++) got += Math.round(mSell(M, id, 1) * k.sell);
  G.credits += got; give(G, id, -n); G.stats.sold = (G.stats.sold || 0) + n;
  const b = G.costBasis[id];
  if (b?.n) {
    const m = Math.min(n, b.n); const profit = (got / n - b.avg) * m;
    G.stats.tradeProfit = (G.stats.tradeProfit || 0) + Math.max(0, profit);
    G.stats.profit = (G.stats.profit || 0) + profit;
    b.n -= m; if (b.n <= 0) delete G.costBasis[id];
  }
  remember(G, sys, M);
  return { n, got, id };
}
const sellMsg = r => (r.n ? `Sold ${fmt(r.n)} ${goodName(r.id)} for ${fmt(r.got)} cr` : 'Nothing to sell.');

// ================================================================== shop stock (outfitter, black market)
function shopStock(S, kind) {
  const { G, sys } = S; const d = dayOf(G); const key = `${kind}:${sys.id}:${d}`;
  const cacheKey = `${G.seed}:${key}:${sizeLimit(G)}:${(G.research.done || []).join(',')}`;
  let stock = stockCache.get(cacheKey);
  if (!stock) {
    const r = rng(hash(kind, sys.seed, d)); const lim = sizeLimit(G); stock = [];
    const basePool = Object.values(BLOCKS).filter(b => b.module && (!b.core || b.id !== 'bridge') && !b.enemyOnly && (b.size || 1) <= lim && b.tier <= sys.tier + 1);
    if (kind === 'outfit') {
      // a harpoon, a mining laser, a targeting computer and a scanner are always on the shelf
      // #66: missile defence is always on offer too — a Blast Screen (Shields) and a Decoy launcher (Utility)
      const sure = ['harpoon', 'mining_laser', 'targeting', 'scanner', 'drone_bay', 'blast_screen', 'decoy'];
      for (const id of sure) stock.push(makeItem(r, id, 'common'));
      // every slot gets its own shelf, so CPU, crew and cargo parts always show up
      for (const sl of SLOTS) {
        const pool = basePool.filter(b => sl.cats.includes(b.cat) && (!b.race || hasLicence(G, b.race)) && !sure.includes(b.id));
        const n = sl.n + Math.min(sl.id === 'weapon' ? 6 : 2, Math.floor(sys.tier / 2));
        // a shelf that covers two kinds (Crew & cargo, Engines & gyros) always shows at least one of
        // each kind first, so cargo pods never go missing behind a row of hab modules
        const picks = sl.cats.map(c => pool.filter(b => b.cat === c)).filter(p => p.length).map(p => r.pick(p));
        // #66: the Weapons shelf always has one point-defence gun (flak or point-defence laser) when the shop can sell one
        const pdPool = sl.id === 'weapon' ? pool.filter(b => BLOCKS[b.id].weapon && b.autoOnly && /^(flak|pd_)/.test(b.weapon)) : [];
        if (pdPool.length) picks.push(r.pick(pdPool));
        while (picks.length < n && pool.length) picks.push(pickPart(r, pool, sys.tier));
        // the Bridge shelf (#61) always shows every bridge this shop can sell, so the upgrade path is never hidden
        if (sl.id === 'core') { picks.length = 0; picks.push(...pool); }
        for (const b of picks.slice(0, Math.max(n, sl.cats.length, sl.id === 'core' ? pool.length : 0))) {
          let rar = rollRarity(r, sys.tier); if (RARITY_BY_ID[rar.id].index > 3) rar = RARITY[3];
          stock.push(makeItem(r, b.id, rar.id));
        }
      }
    } else {
      // black market: epic and better, plus alien weapons that need no licence here
      const pool = basePool.filter(b => !b.race);
      for (let i = 0; i < 4 + Math.min(4, Math.floor(sys.tier / 2)); i++) stock.push(makeItem(r, r.pick(pool).id, r.weighted([{ id: 'epic', w: 60 }, { id: 'legendary', w: 32 }, { id: 'relic', w: 8 }], x => x.w).id));
      const alien = Object.values(BLOCKS).filter(b => b.race && (b.size || 1) <= lim);
      for (let i = 0; i < 3 && alien.length; i++) stock.push(makeItem(r, r.pick(alien).id, r.pick(['rare', 'rare', 'epic', 'legendary'])));
    }
    stock.sort((a, b) => BLOCKS[a.block].tier - BLOCKS[b.block].tier || (RARITY_BY_ID[b.rarity]?.index || 0) - (RARITY_BY_ID[a.rarity]?.index || 0));
    stockCache.set(cacheKey, stock);
  }
  return { stock, key };
}
const listPrice = (item, mult = 1) => Math.round(itemValue(item) / 0.35 * mult);

function buyItem(S, item, price) {
  const { G } = S;
  if (G.credits < price) return toast('You cannot afford that.', 'bad');
  G.credits -= price; G.parts.push(item);
  const u = unlockFromFind(G, item);
  if (u) banner('New feature', UNLOCK_NAMES[u] || u);
  S.done(`Bought ${item.name}. It is in your parts hold — fit it in Build mode.`);
}
function partsForSale(S, box, mult, label) {
  const { G } = S; const k = S.k();
  section(box, 'Your parts', G.parts.length ? `${label} Fitted parts are not shown — take them off in Build mode first.` : 'Your parts hold is empty.');
  if (!G.parts.length) return;
  const cheap = G.parts.filter(it => (RARITY_BY_ID[it.rarity]?.index || 0) === 0);
  if (cheap.length) box.append(el('div', { class: 'row wrap st-quick' }, btn(`Sell all common parts (${cheap.length})`, () => {
    let got = 0; for (const it of cheap) { got += Math.round(itemValue(it) * mult * k.sell); G.parts.splice(G.parts.indexOf(it), 1); }
    G.credits += got; S.done(`Sold ${cheap.length} parts for ${fmt(got)} cr`);
  })));
  const cards = el('div', { class: 'cards' });
  for (const it of G.parts) {
    const v = Math.round(itemValue(it) * mult * k.sell);
    cards.append(itemCard(it, { compact: true, price: v, priceLabel: 'Sells for', actions: [btn('Sell', () => { G.parts.splice(G.parts.indexOf(it), 1); G.credits += v; S.done(`Sold ${it.name} for ${fmt(v)} cr`); })] }));
  }
  box.append(cards);
}

// ================================================================== 2. outfitter
/** Warp core upgrades (play-test: gate the dangerous stars behind better drives). Credits + materials. */
function warpSection(S, box) {
  const { G } = S; const cur = warpCore(G); const next = WARP_CORES[cur.cls];
  section(box, 'Warp core', `Yours: ${cur.name} — jumps into stars up to danger ${cur.reach}. Safer stars are always in reach.`);
  if (!next) { box.append(el('p', { class: 'good' }, 'The best warp core there is. Every star is open to you.')); return; }
  const mats = Object.entries(next.mats);
  const short = mats.filter(([m, n]) => (G.cargo[m] || 0) < n);
  const can = G.credits >= next.cr && !short.length;
  box.append(el('div', { class: 'card warp-card' },
    el('b', {}, `${next.name}`), el('div', {}, `Reaches danger ${next.reach} (${next.reach - cur.reach} more).`),
    el('div', { class: 'amber' }, `${fmt(next.cr)} cr`, mats.length ? ' + ' : '', ...mats.map(([m, n], i) => el('span', { class: (G.cargo[m] || 0) >= n ? 'good' : 'bad' }, `${i ? ', ' : ''}${n} ${MATERIALS[m]?.name || m} (${G.cargo[m] || 0})`))),
    btn('Install', () => {
      if (G.credits < next.cr) return toast('You cannot afford that.', 'bad');
      if (short.length) return toast(`Bring ${short.map(([m, n]) => `${n - (G.cargo[m] || 0)} more ${MATERIALS[m]?.name || m}`).join(', ')}.`, 'bad');
      G.credits -= next.cr; for (const [m, n] of mats) G.cargo[m] -= n;
      G.drive = next.cls;
      banner(`${next.name} installed`, `You can now jump into stars up to danger ${next.reach}.`);
      S.done();
    }, can ? 'primary' : '')));
}

let outfitSlot = 'weapon';
function tabOutfitter(S, box) {
  const { G, sys } = S; const k = S.k();
  const { stock, key } = shopStock(S, 'outfit'); const gone = taken(G, key);
  const left = Math.ceil((DAY - (G.playTime % DAY)) / 60);
  // one row of slot buttons, then that shelf (plus Warp core and Sell parts as their own shelves)
  const shelves = [...SLOTS.map(sl => ({ id: sl.id, name: sl.name, n: stock.filter((it, i) => !gone.includes(i) && sl.cats.includes(BLOCKS[it.block].cat)).length })), { id: 'warp', name: 'Warp core' }, { id: 'sell', name: 'Sell parts', n: G.parts.length }];
  if (!shelves.some(x => x.id === outfitSlot)) outfitSlot = 'weapon';
  box.append(showSelected(el('div', { class: 'tabs st-sub' }, ...shelves.map(x => {
    const b = btn(x.name, () => { outfitSlot = x.id; S.render(); }, x.id === outfitSlot ? 'on' : '');
    if (x.n) b.append(el('i', { class: 'bm-badge' }, String(x.n))); return b;
  }))));
  if (outfitSlot === 'warp') { warpSection(S, box); return; }
  if (outfitSlot === 'sell') { partsForSale(S, box, 1, 'The outfitter pays about a third of the list price.'); return; }
  const sl = SLOTS.find(x => x.id === outfitSlot);
  section(box, sl.name, `Danger ${sys.tier}: shops further from home stock better parts. New stock in about ${left} min. Biggest parts offered: ${sizeLimit(G)}×${sizeLimit(G)}.`);
  const cards = el('div', { class: 'cards' });
  stock.forEach((it, i) => {
    if (gone.includes(i) || !sl.cats.includes(BLOCKS[it.block].cat)) return;
    const price = Math.round(listPrice(it) * k.buy);
    cards.append(itemCard(it, { compact: true, price, compare: S.ship(), actions: [btn('Buy', () => { if (G.credits < price) return toast('You cannot afford that.', 'bad'); gone.push(i); buyItem(S, it, price); }, G.credits >= price ? 'primary' : '')] }));
  });
  if (!cards.children.length) cards.append(el('p', { class: 'hint' }, sl.id === 'core' && sys.tier < 2 ? `No better bridge here. ${BLOCKS.bridge_2.name} is sold at danger 2 and further out; ${BLOCKS.bridge_3.name} at danger 4.` : 'Sold out on this shelf. Come back later.'));
  box.append(cards);
}

// ================================================================== 3. shipyard
const premadeCache = new Map();
function premade(id) {
  let c = premadeCache.get(id);
  if (!c) {
    const body = buildPremade(id);
    let canvas = null;
    try {
      const baked = bakeBody(body).hull;
      canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 120;
      const s = Math.min(232 / baked.width, 112 / baked.height);
      const ctx = canvas.getContext('2d'); const w = baked.width * s, h = baked.height * s;
      ctx.drawImage(baked, (240 - w) / 2, (120 - h) / 2, w, h);
    } catch (e) { console.warn('ship preview failed', e); }
    c = { body, json: gridToJSON(body.grid), canvas };
    premadeCache.set(id, c);
  }
  return c;
}
function shipStats(st) {
  const turrets = st.turrets.filter(t => t.w.mode !== 'tool').length;
  return [
    ['Blocks', st.stats.blocks], ['Hull health', fmt(st.stats.maxHp)], ['Top speed', fmt(st.stats.maxSpeed)],
    ['Weapons', turrets], ['Shields', fmt(st.stats.shieldMax)], ['Cargo', fmt(st.stats.cargo)],
    ['CPU', `${fmt(st.stats.cpu)} / ${fmt(st.stats.cpuCap)}`], ['Crew', `${fmt(st.stats.crewNeed)} needed · ${fmt(st.stats.crewCap)} bunks`],
    ['Power', `${Math.round(st.stats.power)} made · ${Math.round(st.stats.powerUse)} used`], ['Drones', st.stats.droneCap || 0],
  ];
}
const kvEl = rows => el('div', { class: 'kv', html: rows.map(([a, b]) => `<span>${esc(a)}</span><span>${esc(String(b))}</span>`).join('') });

/**
 * Grow hull (owner ruling E5, 2026-11-12): refit YOUR ship into the next hull class — a bigger build area
 * and bigger parts — keeping every block you placed. Paid in credits OR in that class's ore, so a miner
 * and a fighter can both get there. sim/hullgrow.js has the numbers.
 */
function growSection(S, box) {
  const { G, sys } = S;
  const opts = growOptions(G.ship.cls);
  if (!opts.length) { section(box, 'Grow hull', 'Your hull is the biggest there is.'); return; }
  section(box, 'Grow hull', 'Refit your own ship into a bigger class. Every block stays where it is; you get a bigger build area, more base CPU, crew room and cargo — and bigger parts at frigate and cruiser.');
  const cards = el('div', { class: 'cards' });
  for (const to of opts) {
    const C = CLASSES[to]; const cost = growCost(to); const near = sys.tier >= C.tier - 1;
    const missM = Object.entries(cost.mats).filter(([m, n]) => (G.cargo[m] || 0) < n);
    const card = el('div', { class: 'card grow-card' }, el('h4', {}, `${CLASSES[G.ship.cls].name} → ${C.name}`), el('div', { class: 'hint' }, C.blurb),
      kvEl([['Build area', `${C.grid}×${C.grid} cells`], ['Biggest parts', `${C.maxBlock}×${C.maxBlock}`], ['Base CPU', `+${C.baseCpu}`], ['Base crew room', `+${C.baseCrew}`], ['Base cargo', `+${C.baseCargo}`]]));
    if (!near) card.append(el('p', { class: 'bad' }, `Shipyards this close to home cannot do it — find one at danger ${C.tier - 1} or more.`));
    else {
      const chips = el('div', { class: 'ws-cost' }, ...Object.entries(cost.mats).map(([m, n]) => el('span', { class: 'chip ' + ((G.cargo[m] || 0) >= n ? 'ok' : 'no'), style: `--mc:${MATERIALS[m]?.color}` }, `${n} ${MATERIALS[m]?.name}`, el('small', {}, ` (${fmt(G.cargo[m] || 0)})`))));
      const doGrow = how => {
        if (how === 'cr' && G.credits < cost.cr) return toast('You cannot afford that.', 'bad');
        if (how === 'ore' && missM.length) return toast(`Bring ${missM.map(([m, n]) => `${n - (G.cargo[m] || 0)} more ${MATERIALS[m].name}`).join(', ')}.`, 'bad');
        if (how === 'cr') G.credits -= cost.cr; else { for (const [m, n] of Object.entries(cost.mats)) { G.cargo[m] -= n; if (!G.cargo[m]) delete G.cargo[m]; } G.credits -= cost.fee; }
        G.ship.cls = to; G.stats.grown = (G.stats.grown || 0) + 1; S.changed();
        banner(`Hull grown: ${C.name}`, 'Open Build mode to use the new space.'); S.done(null);
      };
      card.append(el('div', { class: 'hint' }, 'Pay with ore:'), chips, el('div', { class: 'row wrap' },
        btn(`Pay ${fmt(cost.cr)} cr`, () => doGrow('cr'), G.credits >= cost.cr ? 'primary' : ''),
        btn(`Pay with ore + ${fmt(cost.fee)} cr`, () => doGrow('ore'), !missM.length && G.credits >= cost.fee ? 'primary' : '')));
    }
    cards.append(card);
  }
  box.append(cards);
}

function tabShipyard(S, box) {
  const { G, sys } = S; const k = S.k();
  const cur = S.ship(); const ti = tradeIn(G.ship);
  section(box, 'Your ship', null);
  box.append(el('div', { class: 'card' },
    el('b', {}, `${G.ship.name} — ${CLASSES[G.ship.cls]?.name}`), kvEl(shipStats(cur)),
    el('div', { class: 'hint' }, `Trade-in value here: ${fmt(ti)} cr (about 40% of the hull price plus a quarter of what is fitted).`)));
  growSection(S, box);
  // hangar
  if (G.hangar.length) {
    section(box, 'Hangar', 'Ships you kept. Switching is free at any shipyard.');
    const hc = el('div', { class: 'cards' });
    G.hangar.forEach((rec, i) => {
      const b = bodyOf(G, rec); const v = tradeIn(rec);
      hc.append(el('div', { class: 'card' }, el('b', {}, `${rec.name} — ${CLASSES[rec.cls]?.name}`), kvEl(shipStats(b).slice(0, 6)),
        hangarExtras(S, rec),   // a mercenary's ship: who flies it, or Wrecked + Repair (ui/mercs.js)
        el('div', { class: 'row wrap' },
          btn('Fly this one', () => {   // same switch as the Parts hold: crew moves with you, a merc swaps seats
            const why = app.switchShip?.(rec); if (why) return toast(why, 'bad');
            S.changed(); S.render();
          }, 'primary'),
          btn(`Sell (${fmt(v)} cr)`, () => { G.hangar.splice(i, 1); G.credits += v; S.done(`Sold ${rec.name} for ${fmt(v)} cr`); }))));
    });
    box.append(hc);
  }
  // for sale
  const sale = PREMADES.filter(p => !p.start && (CLASSES[p.cls]?.tier ?? 9) <= sys.tier + 1);
  const later = PREMADES.filter(p => !p.start && (CLASSES[p.cls]?.tier ?? 9) > sys.tier + 1);
  section(box, 'Ships for sale', `They come with their parts fitted (plain, common quality). Bigger classes are sold further from home${later.length ? ` — the next one is a ${CLASSES[later[0].cls].name}, at danger ${CLASSES[later[0].cls].tier - 1}+` : ''}.`);
  const cards = el('div', { class: 'cards st-ships' });
  for (const pm of sale) {
    const { body, json, canvas } = premade(pm.id);
    const price = Math.round(pm.price * k.buy); const net = price - ti;
    const rec = { design: pm.id, cls: pm.cls, name: pm.name, grid: json, crew: 0 };
    const fits = cargoUsed(G) <= Math.floor(body.stats.cargo * researchBonus(G).cargo);
    const card = el('div', { class: 'card' });
    if (canvas) { const c = canvas.cloneNode(); c.getContext('2d').drawImage(canvas, 0, 0); card.append(el('div', { class: 'st-preview' }, c)); }
    card.append(el('b', {}, `${pm.name} — ${CLASSES[pm.cls].name}`), el('div', { class: 'hint' }, pm.blurb), kvEl(shipStats(body)),
      el('div', { class: 'amber' }, `Price ${fmt(price)} cr · with trade-in ${net >= 0 ? fmt(net) + ' cr' : `you get ${fmt(-net)} cr back`}`));
    const buyIt = keep => {
      const pay = keep ? price : net;
      if (G.credits < pay) return toast('You cannot afford that.', 'bad');
      const nb = bodyOf(G, rec);
      if (cargoUsed(G) > nb.stats.cargo) return toast(`That ship holds only ${fmt(nb.stats.cargo)}. Sell some cargo first.`, 'bad');
      const crew = G.ship.crew ?? 2; rec.crew = Math.min(nb.stats.crewCap, crew);
      if (crew > rec.crew) toast(`${crew - rec.crew} crew had no room and stayed at the station.`);
      if (keep) G.hangar.push({ ...G.ship, crew: 0 });
      G.credits -= pay; G.ship = { ...rec, grid: JSON.parse(JSON.stringify(rec.grid)) }; S.changed();
      banner(`${pm.name} is yours`, `A ${CLASSES[pm.cls].name}. It launches when you undock.${keep ? ' Your old ship waits in the hangar.' : ''}`);
      S.done(null);
    };
    card.append(el('div', { class: 'row wrap' },
      btn(net >= 0 ? `Buy (trade in) ${fmt(net)} cr` : `Buy (trade in) +${fmt(-net)} cr`, () => buyIt(false), G.credits >= net ? 'primary' : ''),
      btn(`Buy, keep old ship ${fmt(price)} cr`, () => buyIt(true))));
    if (!fits) card.append(el('div', { class: 'bad hint' }, 'Your cargo would not fit — sell some first.'));
    cards.append(card);
  }
  box.append(cards);
}

// ================================================================== 4. refinery
function tabRefinery(S, box) {
  const { G, sys } = S; const fee = 2 * sys.tier;
  const M = market(G, sys, G.playTime);
  section(box, 'Refinery', `Turn raw ore into goods that are worth more. The refinery charges ${fee} cr a batch.`);
  const cards = el('div', { class: 'cards' });
  for (const R of RECIPES) {
    const ins = Object.entries(R.in), outs = Object.entries(R.out);
    const maxN = maxBatches(S, R, fee);
    const worth = outs.reduce((s, [id, n]) => s + quote(M, id).sell * n, 0) - ins.reduce((s, [id, n]) => s + quote(M, id).sell * n, 0) - fee;
    const card = el('div', { class: 'card' }, el('b', {}, R.name),
      el('div', {}, 'Uses: ', ...ins.map(([id, n]) => el('span', { class: held(G, id) >= n ? 'good' : 'bad' }, `${n} ${goodName(id)} (have ${fmt(held(G, id))})  `))),
      el('div', {}, 'Makes: ', el('b', {}, outs.map(([id, n]) => `${n} ${goodName(id)}`).join(', '))),
      el('div', { class: worth > 0 ? 'good hint' : 'bad hint' }, `Each batch is worth ${worth >= 0 ? '+' : ''}${fmt(worth)} cr at this market`),
      el('div', { class: 'row wrap' },
        btn('Run once', () => S.done(refine(S, R, 1, fee))), btn('×5', () => S.done(refine(S, R, 5, fee))), btn(`Max (${maxN})`, () => S.done(refine(S, R, maxN, fee)), maxN ? 'primary' : '')));
    for (const b of card.querySelectorAll('button')) b.disabled = !maxN;
    cards.append(card);
  }
  box.append(cards);
}
function maxBatches(S, R, fee) {
  const { G } = S; let n = Infinity;
  for (const [id, q] of Object.entries(R.in)) n = Math.min(n, Math.floor(held(G, id) / q));
  n = Math.min(n, Math.floor(G.credits / Math.max(1, fee)));
  const grow = Object.values(R.out).reduce((a, b) => a + b, 0) - Object.values(R.in).reduce((a, b) => a + b, 0);
  if (grow > 0) n = Math.min(n, Math.floor(S.room() / grow));
  return Math.max(0, n === Infinity ? 0 : n);
}
function refine(S, R, want, fee) {
  const { G } = S; const n = Math.min(want, maxBatches(S, R, fee));
  if (!n) return 'Not enough materials, money or hold space.';
  for (const [id, q] of Object.entries(R.in)) give(G, id, -q * n);
  for (const [id, q] of Object.entries(R.out)) give(G, id, q * n);
  G.credits -= fee * n;
  return `${R.name}: ${n} batch${n > 1 ? 'es' : ''} done`;
}

// ================================================================== 5. repair
function repairList(G) {
  return G.ship.grid.b.map(e => {
    const d = BLOCKS[e[0]]; if (!d) return null;
    const item = e[5] || null; const bonus = item?.rarity ? (RARITY_BY_ID[item.rarity]?.bonus || 0) : 0;
    const max = Math.round(d.hp * (1 + (item?.mods?.hp || 0) + bonus * 0.5));
    const hp = clamp(e[4], 0, max);
    return { e, d, max, miss: max - hp, dead: hp <= 0 };
  }).filter(x => x && x.miss > 0);
}
function tabRepair(S, box) {
  const { G, sys } = S; const k = S.k();
  const per = 0.08 * (1 + (sys.tier - 1) * 0.35) * k.buy;            // credits per point of health
  const list = repairList(G);
  const miss = list.reduce((s, x) => s + x.miss, 0); const dead = list.filter(x => x.dead).length;
  const cost = miss ? Math.max(1, Math.round(miss * per)) : 0;
  section(box, 'Repairs', 'Dockworkers rebuild destroyed blocks and patch damaged ones. Your repair drones can also do this for free out of combat, slowly.');
  const card = el('div', { class: 'card' });
  if (!miss) card.append(el('b', { class: 'good' }, 'Your ship is in perfect shape.'));
  else {
    card.append(kvEl([['Blocks destroyed', dead], ['Blocks damaged', list.length - dead], ['Health missing', fmt(miss)], ['Cost', `${fmt(cost)} cr`]]));
    card.append(el('div', { class: 'row wrap' },
      btn(`Repair everything (${fmt(cost)} cr)`, () => {
        if (G.credits < cost) return toast('You cannot afford a full repair.', 'bad');
        for (const x of list) x.e[4] = x.max; G.credits -= cost; S.changed(); S.done('Every block is repaired.');
      }, 'primary'),
      btn('Repair what I can afford', () => {
        // bridge first, then weapons and shields, then everything else
        const order = [...list].sort((a, b) => (b.d.core ? 3 : b.d.cat === 'weapon' || b.d.cat === 'shield' ? 2 : 1) - (a.d.core ? 3 : a.d.cat === 'weapon' || a.d.cat === 'shield' ? 2 : 1));
        let spent = 0, n = 0;
        for (const x of order) { const c = Math.max(1, Math.round(x.miss * per)); if (spent + c > G.credits) continue; spent += c; x.e[4] = x.max; n++; }
        G.credits -= spent; S.changed(); S.done(n ? `Repaired ${n} blocks for ${fmt(spent)} cr` : 'You cannot afford any repairs.', n ? 'good' : 'bad');
      })));
  }
  box.append(card);
}

// ================================================================== 6. crew
/** Crew are a number (owner #33/#34): least to fly, needed for full strength, room aboard. Hire, or sell the extra. */
function tabCrew(S, box) {
  const { G, sys } = S; const k = S.k(); const st = S.ship().stats;
  const have = G.ship.crew ?? 0; const cap = st.crewCap; const need = st.crewNeed; const min = st.crewMin;
  const each = Math.round(35 * (1 + (sys.tier - 1) * 0.3) * k.buy);
  const pays = Math.round(each * 0.5);
  section(box, 'Crew hall', 'Crew run your guns, shields and reactors. Below what you need, those parts work slower. More room comes from crew quarters and hab modules.');
  const c = el('div', { class: 'card' },
    kvEl([['Crew aboard', have], ['Least to fly', min], ['Needed for full strength', need], ['Room aboard', cap], ['Hire', `${fmt(each)} cr each`], ['Sell extra crew', `${fmt(pays)} cr each`]]),
    el('div', { class: have >= need ? 'good' : have < min ? 'bad' : 'warn' }, have >= need ? 'Fully crewed.' : have < min ? `Below the least to fly (${min}) — the ship crawls.` : `Short by ${need - have}: crewed parts run at reduced strength.`));
  const hire = n => {
    n = Math.min(n, cap - have, Math.floor(G.credits / Math.max(1, each)));
    if (n <= 0) return toast(cap - have <= 0 ? 'No room aboard. Fit crew quarters or a hab module.' : 'You cannot afford that.', 'bad');
    G.credits -= n * each; G.ship.crew = have + n; S.changed(); S.done(`+${n} Crew (${fmt(n * each)} cr)`);
  };
  const sell = n => {
    n = Math.min(n, have - 1); if (n <= 0) return toast('Someone has to fly the ship.', 'bad');
    G.ship.crew = have - n; G.credits += n * pays; S.changed(); S.done(`−${n} Crew (+${fmt(n * pays)} cr)`, '');
  };
  const extra = Math.max(0, have - need);
  c.append(el('div', { class: 'row wrap' },
    btn('Hire 1', () => hire(1)),
    btn(`Hire what you need (${Math.max(0, need - have)})`, () => hire(Math.max(0, need - have)), have < need ? 'primary' : ''),
    btn(`Fill the ship (${Math.max(0, cap - have)})`, () => hire(cap - have)),
    btn('Sell 1', () => sell(1)),
    btn(`Sell the extra (${extra})`, () => sell(extra), extra ? '' : 'off')));
  box.append(c);
}

// ================================================================== 7. insurance
function tabInsurance(S, box) {
  const { G, app } = S; const k = S.k();
  const rebuild = app.rebuildCost ? app.rebuildCost(G) : 0;
  const cost = Math.max(20, Math.round(rebuild * 0.12 * k.buy));
  section(box, 'Ship insurance', 'If your ship is destroyed you wake up at the last station you docked at, in the same design.');
  box.append(el('div', { class: 'card' },
    kvEl([['Rebuilding your ship costs', `${fmt(rebuild)} cr`], ['Without insurance you lose', 'the rebuild cost and half your cargo'], ['With insurance you lose', 'only a quarter of your cargo'], ['Policy price', `${fmt(cost)} cr`]]),
    el('div', { class: 'hint' }, 'A policy covers one rebuild, then it is used up. Buy a new one after a loss.'),
    G.insured ? el('b', { class: 'good' }, 'You are insured.') :
      btn(`Buy a policy (${fmt(cost)} cr)`, () => {
        if (G.credits < cost) return toast('You cannot afford that.', 'bad');
        G.credits -= cost; G.insured = true; S.done('Insured. Your next rebuild is covered.');
      }, 'primary')));
}

// ================================================================== 8. drones
/** Drone shop (play-test #28/#31): drones are items — buy them here, fit them to drone ports in Build mode. */
function tabDrones(S, box) {
  const { G, sys } = S; const k = S.k(); const cap = S.ship().stats.droneCap || 0; const own = G.droneItems ||= [];
  section(box, 'Drone shop', `Drones fly AHEAD of your ship, ready for action; a lost drone is rebuilt by its port for free. Your ports carry ${cap}; you own ${own.length}. Choose which ones fly under Your drones below, or from the hold (C) in flight.`);
  if (!cap) box.append(el('p', { class: 'warn' }, 'You have no drone port yet. The outfitter sells them (Drone ports shelf), or craft one at a workshop.'));
  // today's stock: a few of each kind, some of them better than common
  const d = dayOf(G); const key = `drones:${sys.id}:${d}`; const gone = taken(G, key);
  const r = rng(hash('droneshop', sys.seed, d));
  const stock = [];
  for (const D of Object.values(DRONES).filter(x => !x.enemy && x.tier <= Math.ceil(sys.tier / 2) + 1)) {
    stock.push({ kind: D.id, rarity: 'common' });
    let rar = rollRarity(r, sys.tier); if (RARITY_BY_ID[rar.id].index > 3) rar = RARITY[3];
    if (rar.id !== 'common') stock.push({ kind: D.id, rarity: rar.id });
  }
  const cards = el('div', { class: 'cards' });
  stock.forEach((x, i) => {
    if (gone.includes(i)) return;
    const D = DRONES[x.kind]; const R = RARITY_BY_ID[x.rarity];
    const price = Math.round(D.cost.cr * 2.2 * (1 + R.index * 0.9 + R.index * R.index * 0.25) * k.buy);
    // one card printer for every drone list (ui/drones-ui.js): mining drones show their cutting speed (report #54)
    cards.append(droneCard(x, { actions: [el('span', { class: 'amber it-price' }, `${fmt(price)} cr`), btn('Buy', () => {
      if (G.credits < price) return toast('You cannot afford that.', 'bad');
      G.credits -= price; gone.push(i);
      const item = makeDroneItem(x.kind, x.rarity); own.push(item);
      if (fitDrone(G, item.uid, cap).ok) S.done(`${D.name} bought — it flies with you when you undock.`);
      else S.done(`${D.name} bought and stored. Swap it in under Your drones below.`);
    }, G.credits >= price ? 'primary' : '')] }));
  });
  box.append(cards);
  // your drones: the same picker as the hold's Drones tab (report #53), plus Sell
  section(box, 'Your drones', null);
  box.append(dronePicker({ G, cap, onChange: msg => S.done(msg),
    more: item => {
      const D = DRONES[item.kind]; const R = RARITY_BY_ID[item.rarity || 'common']; const refund = Math.round(D.cost.cr * 0.8 * (1 + R.index * 0.9));
      return [btn(`Sell +${fmt(refund)} cr`, () => { own.splice(own.indexOf(item), 1); unfitDrone(G, item.uid); G.credits += refund; S.done(`Sold a ${D.name}.`, ''); }, 'small')];
    } }));
}

// ================================================================== 9. research lab
function tabLab(S, box) {
  const { G } = S; const k = S.k(); const R = G.research;
  section(box, 'Research lab', 'Scientists pay for alien specimens and turn them into research points. Spend points on projects that improve every ship you fly.');
  box.append(el('div', { class: 'row wrap st-quick' }, el('span', { class: 'stat', style: 'color:var(--violet)' }, `${fmt(R.points)} research points`)));
  // specimens
  const sp = G.specimens || [];
  const sc = el('div', { class: 'card' });
  if (!sp.length) sc.append(el('span', { class: 'hint' }, 'No specimens. Destroyed alien ships sometimes leave one behind.'));
  else {
    const sellOne = s => {
      const cr = Math.round((s.value || 100) * k.sell); const pts = specimenPoints(s);
      G.specimens.splice(G.specimens.indexOf(s), 1); G.credits += cr; R.points += pts; if (s.faction) R.seen[s.faction] = true;
      return [cr, pts];
    };
    for (const s of [...sp]) {
      sc.append(el('div', { class: 'row wrap' }, el('b', { style: `color:${FACTIONS[s.faction]?.color || '#c8ff6a'}` }, s.name), el('span', { class: 'hint' }, `${fmt(s.value * k.sell)} cr + ${specimenPoints(s)} points`), el('div', { class: 'grow' }),
        btn('Hand over', () => { const [cr, pts] = sellOne(s); S.done(`+${fmt(cr)} cr and +${pts} research points`); })));
    }
    sc.append(btn(`Hand over all (${sp.length})`, () => { let cr = 0, pts = 0; for (const s of [...sp]) { const [a, b] = sellOne(s); cr += a; pts += b; } S.done(`+${fmt(cr)} cr and +${pts} research points`); }, 'primary'));
  }
  box.append(sc);
  // donations
  const relic = G.cargo.relic || 0, data = G.goods.data || 0, cores = G.dataCores || 0;
  if (relic || data || cores) {
    box.append(el('div', { class: 'card' }, el('b', {}, 'Donate for points'),
      cores ? el('div', { class: 'row wrap' }, `Data cores: ${cores} (12 points each)`, el('div', { class: 'grow' }), btn('Hand over all', () => { R.points += cores * 12; G.dataCores = 0; S.done(`+${cores * 12} research points`); })) : null,
      relic ? el('div', { class: 'row wrap' }, `Relic shards: ${relic} (40 points each)`, el('div', { class: 'grow' }), btn('Donate all', () => { R.points += relic * 40; give(G, 'relic', -relic); S.done(`+${relic * 40} research points`); })) : null,
      data ? el('div', { class: 'row wrap' }, `Survey data: ${data} (3 points each)`, el('div', { class: 'grow' }), btn('Donate all', () => { R.points += data * 3; give(G, 'data', -data); S.done(`+${data * 3} research points`); })) : null));
  }
  // projects
  section(box, 'Projects', G.unlocked.research ? 'Finished projects apply to every ship you own, right away.' : null);
  if (!G.unlocked.research) { box.append(el('p', { class: 'hint' }, 'Research projects unlock later. Points you earn now are kept.')); return; }
  const cards = el('div', { class: 'cards' });
  for (const p of PROJECTS) {
    const why = projectBlock(G, p); const isDone = R.done.includes(p.id);
    cards.append(el('div', { class: 'card' + (isDone ? ' st-done' : '') },
      el('b', { class: isDone ? 'good' : '' }, p.name), el('div', {}, p.blurb),
      el('div', { class: 'row wrap' }, el('span', { class: 'hint' }, isDone ? 'Done' : `${p.cost} points`), el('div', { class: 'grow' }),
        isDone ? null : btn(why || 'Research', () => { if (doProject(G, p.id)) { S.changed(); S.done(`Research done: ${p.name}`); } }, why ? '' : 'primary'))));
    const b = cards.lastChild.querySelector('button'); if (b && why) b.disabled = true;
  }
  box.append(cards);
}

// ================================================================== 10. salvage yard
function tabSalvage(S, box) {
  const { G, sys } = S; const k = S.k();
  const d = dayOf(G); const key = `lots:${sys.id}:${d}`; const gone = taken(G, key);
  // what the last lot gave (report #45: "I bought a ship from the salvage yard. Nothing happened?") — stays on the tab
  if (S.lastLot) lotResult(S, box, S.lastLot);
  section(box, 'Wreck lots', 'The yard has towed these wrecks in. Buy one and its crews strip it on the spot: the ore goes into your cargo hold and 1-3 parts into your parts hold. Nothing to fly out to. Sometimes a bargain, sometimes junk.');
  const cards = el('div', { class: 'cards' });
  const r = rng(hash('lots', sys.seed, d));
  const classes = ['skiff', 'corvette', ...(sys.tier >= 3 ? ['frigate'] : []), ...(sys.tier >= 4 ? ['destroyer'] : []), ...(sys.tier >= 5 ? ['cruiser'] : [])];
  const conds = ['Gutted', 'Burnt out', 'Broken in half', 'Barely touched'];
  for (let i = 0; i < 3; i++) {
    const cls = r.pick(classes); const cond = r.int(0, 3); const fac = r.pick(['guild', 'navy', 'redfang', ...factionsForTier(sys.tier)]);
    const price = Math.round(180 * Math.pow(sys.tier, 1.3) * (1 + RANK_OF(cls) * 1.2) * (0.8 + cond * 0.15) * k.buy);
    const seed = hash('lot', sys.seed, d, i);
    if (gone.includes(i)) continue;
    cards.append(el('div', { class: 'card' }, el('b', {}, `${conds[cond]} ${CLASSES[cls].name.toLowerCase()}`),
      el('div', { class: 'hint' }, `Was a ${FACTIONS[fac]?.name || fac} ship.`),
      el('div', { class: 'amber' }, `${fmt(price)} cr`),
      btn(`Buy and strip it (${fmt(price)} cr)`, () => {
        if (G.credits < price) return toast('You cannot afford that.', 'bad');
        G.credits -= price; gone.push(i);
        S.lastLot = openLot(S, seed, price, cls, cond);
        S.lastLot.what = `${conds[cond]} ${CLASSES[cls].name.toLowerCase()}`;
        S.done('Wreck stripped. Everything went into your holds.'); S.toTop?.();
      }, G.credits >= price ? 'primary' : '')));
  }
  if (!cards.children.length) cards.append(el('p', { class: 'hint' }, 'No lots left today. New wrecks come in later.'));
  box.append(cards);
  partsForSale(S, box, 1.3, 'The salvage yard pays a bit more for parts than the outfitter.');
}
/** Pay out a wreck lot: ore (overflow sold for scrap) and parts. Returns the message. */
function openLot(S, seed, price, cls, cond) {
  const { G, sys } = S; const r = rng(seed); const edge = salvageEdge(G);
  const value = price * r.range(0.5, 1.6) * (0.75 + cond * 0.12) * edge;   // a gamble around the price
  // real ores only: Rock is tier 0 filler, and n / sqrt(0) gave an endless pile (Infinity credits as "scrap")
  const mats = Object.entries(MATERIALS).filter(([, m]) => !m.alien && m.tier >= 1 && m.tier <= sys.tier + 1);
  let left = value * 0.55, scrap = 0; const got = {};
  while (left > 5) {
    const [id, m] = r.pick(mats); const n = Math.max(1, Math.round(r.range(3, 14) / Math.sqrt(m.tier)));
    left -= n * m.price;
    const fit = Math.min(n, S.room()); if (fit > 0) { give(G, id, fit); got[id] = (got[id] || 0) + fit; }
    if (n > fit) scrap += Math.round((n - fit) * m.price * 0.5);
  }
  G.credits += scrap;
  const lim = sizeLimit(G); const pool = Object.values(BLOCKS).filter(b => b.module && !b.core && !b.race && (b.size || 1) <= lim && b.tier <= sys.tier + 1);
  const nItems = 1 + (r() < 0.5 ? 1 : 0) + (r() < 0.25 + RANK_OF(cls) * 0.1 ? 1 : 0);
  const items = [];
  for (let i = 0; i < nItems; i++) { const rar = rollRarity(r, sys.tier, 0.2 + RANK_OF(cls) * 0.15 + researchLootBonus(G)); const it = makeItem(r, r.pick(pool).id, rar.id); G.parts.push(it); items.push(it); }
  for (const it of items) { const u = unlockFromFind(G, it); if (u) banner('New feature', UNLOCK_NAMES[u] || u); }
  const worth = Math.round(Object.entries(got).reduce((t, [id, n]) => t + n * (MATERIALS[id]?.price || 0), 0) + scrap + items.reduce((t, it) => t + itemValue(it), 0));
  return { price, got, scrap, items, worth };
}
/** The card that says what a wreck lot gave, where it went and what to do with it. */
function lotResult(S, box, L) {
  const { app } = S;
  const ore = Object.entries(L.got);
  const verdict = L.worth >= L.price * 1.15 ? ['good', 'A bargain'] : L.worth >= L.price * 0.85 ? ['', 'About what you paid'] : ['bad', 'Mostly junk'];
  box.append(el('div', { class: 'card st-ready st-lot' },
    el('b', {}, `Stripped: ${L.what}`), el('div', { class: verdict[0] }, `${verdict[1]}: worth about ${fmt(L.worth)} cr, you paid ${fmt(L.price)} cr`),
    el('div', { class: 'hint' }, 'Into your cargo hold'),
    el('div', {}, ore.length ? ore.map(([id, n]) => `${fmt(n)} ${MATERIALS[id].name}`).join(' · ') : 'No ore'),
    L.scrap ? el('div', { class: 'amber' }, `Your hold was full: the rest sold for scrap, +${fmt(L.scrap)} cr`) : '',
    el('div', { class: 'hint' }, 'Into your parts hold'),
    ...L.items.map(it => el('div', { style: `color:${RARITY_BY_ID[it.rarity]?.color || '#ccc'}` }, `${RARITY_BY_ID[it.rarity]?.name || ''} ${it.name}`)),
    el('div', { class: 'hint' }, 'Fit parts to your ship in Build mode (B), sell them below, or use the ore at the Workshop.'),
    el('div', { class: 'row wrap' }, btn('See your parts', () => app.openHold?.('parts')), btn('Done', () => { S.lastLot = null; S.render(); }))));
}

// ================================================================== 11. bounty board
function tabBounty(S, box) {
  const { G, sys, app } = S; const d = dayOf(G); const key = `bounty:${sys.id}:${d}`; const gone = taken(G, key);
  const sysName = id => app.galaxy.systems[id]?.name || '?';
  // active bounties
  section(box, 'Your bounties', G.bounties.length ? 'Kills count only in the named system. Collect at any bounty board.' : 'None taken yet.');
  if (G.bounties.length) {
    const ac = el('div', { class: 'cards' });
    for (const bt of [...G.bounties]) {
      const card = el('div', { class: 'card' + (bt.done ? ' st-ready' : '') }, el('b', { style: `color:${FACTIONS[bt.faction]?.color}` }, bt.title),
        el('div', {}, `${Math.min(bt.got || 0, bt.need)} / ${bt.need} · in ${sysName(bt.system)}`), el('div', { class: 'amber' }, `Reward ${fmt(bt.reward)} cr`));
      if (bt.done) card.append(btn('Collect', () => {
        G.credits += bt.reward; G.bounties.splice(G.bounties.indexOf(bt), 1);
        const f = S.st.faction; G.rep[f] = clamp((G.rep[f] ?? 0) + 3, -100, 100);
        for (const riv of FACTIONS[bt.faction]?.rivals || []) G.rep[riv] = clamp((G.rep[riv] ?? 0) + 2, -100, 100);
        S.done(`Bounty paid: +${fmt(bt.reward)} cr. Your standing rose.`);
      }, 'primary'));
      else card.append(btn('Give up', () => { G.bounties.splice(G.bounties.indexOf(bt), 1); S.done('Bounty dropped.', ''); }));
      ac.append(card);
    }
    box.append(ac);
  }
  // offers: systems up to two jumps away
  section(box, 'Wanted', 'Up to 5 bounties at a time. New offers come in later.');
  const near = [sys.id]; for (let ring = 0; ring < 2; ring++) for (const id of [...near]) for (const l of app.galaxy.systems[id].links) if (!near.includes(l) && canWarpTo(G, app.galaxy.systems[l])) near.push(l);
  const r = rng(hash('bounty', sys.seed, d)); const cards = el('div', { class: 'cards' });
  for (let i = 0; i < 3; i++) {
    const t = app.galaxy.systems[r.pick(near)];
    const own = FACTIONS[t.owner]?.hostile ? t.owner : null;
    const faction = own || r.pick(factionsForTier(t.tier));
    const big = t.tier >= 3 && r.chance(0.35);
    const cls = big ? r.pick(['frigate', ...(t.tier >= 4 ? ['destroyer'] : []), ...(t.tier >= 5 ? ['cruiser'] : [])]) : null;
    const need = big ? 1 : r.int(3, 7);
    const reward = Math.round(big ? 900 * CLASSES[cls].rank * Math.pow(t.tier, 1.2) : 70 * need * Math.pow(t.tier, 1.25));
    const id = `b${sys.id}-${d}-${i}`;
    if (gone.includes(i) || G.bounties.some(b => b.id === id)) continue;
    const F = FACTIONS[faction];
    const title = big ? `Destroy a ${F.short} ${CLASSES[cls].name.toLowerCase()}` : `Destroy ${need} ${F.short} ships`;
    cards.append(el('div', { class: 'card' }, el('b', { style: `color:${F.color}` }, title),
      el('div', {}, `In ${t.name} (danger ${t.tier})${t.id === sys.id ? ' — this system' : ''}`), el('div', { class: 'amber' }, `Reward ${fmt(reward)} cr + standing`),
      btn('Take it', () => {
        if (G.bounties.length >= 5) return toast('You already hold 5 bounties.', 'bad');
        gone.push(i); G.bounties.push({ id, title, faction, cls, system: t.id, need, got: 0, reward, done: false });
        S.done(`Bounty taken: ${title} in ${t.name}`);
      }, 'primary')));
  }
  if (!cards.children.length) cards.append(el('p', { class: 'hint' }, 'No new offers today.'));
  box.append(cards);
}

// ================================================================== 12. black market
function tabBlack(S, box) {
  const { G } = S; const k = S.k();
  const { stock, key } = shopStock(S, 'black'); const gone = taken(G, key);
  section(box, 'Black market', 'No questions asked. Rare and alien parts at steep prices — and they pay double for alien specimens.');
  const cards = el('div', { class: 'cards' });
  stock.forEach((it, i) => {
    if (gone.includes(i)) return;
    const price = Math.round(listPrice(it, 2.2) * k.buy);
    cards.append(itemCard(it, { compact: true, price, actions: [btn('Buy', () => { if (G.credits < price) return toast('You cannot afford that.', 'bad'); gone.push(i); buyItem(S, it, price); }, G.credits >= price ? 'primary' : '')] }));
  });
  if (!cards.children.length) cards.append(el('p', { class: 'hint' }, 'Sold out. Come back later.'));
  box.append(cards);
  const sp = G.specimens || [];
  section(box, 'Specimens wanted', sp.length ? 'They pay twice what a lab does, but you get no research points.' : 'You carry no alien specimens.');
  if (sp.length) {
    const total = sp.reduce((s, x) => s + Math.round((x.value || 100) * 2 * k.sell), 0);
    box.append(el('div', { class: 'row wrap st-quick' }, btn(`Sell all ${sp.length} specimens (${fmt(total)} cr)`, () => { G.credits += total; G.specimens = []; S.done(`Sold specimens for ${fmt(total)} cr`); }, 'primary')));
  }
}

function tabWorkshop(S, box) {
  const { G, sys } = S;
  drawWorkshop(box, { app: S.app, G, tierCap: sys.tier + 2, sizeCap: sizeLimit(G), edge: 0, station: true, render: S.render });
}

const TABS = {
  workshop: tabWorkshop,
  market: tabMarket, outfitter: tabOutfitter, shipyard: tabShipyard, refinery: tabRefinery, repair: tabRepair, crew: tabCrew,
  insurance: tabInsurance, drones: tabDrones, lab: tabLab, salvage: tabSalvage, bounty: tabBounty, blackmarket: tabBlack,
  mercs: tabMercs,
  missions: (S, box) => missionsTab(S, box, tabBounty),   // [encounters]
};
