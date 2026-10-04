#!/usr/bin/env node
// Line War FEEL report (owner's systems must matter; NOT a snowball / income audit).
//
//   node tools/feel-report.mjs [seeds=16] [--diff veteran]
//
// 1. Mirror matches (Veteran v Veteran, mixed races/heroes, seats swapped): match length, how the
//    send gold splits over tiers, banners lost per minute.
// 2. Does each owner system swing fights? For items, Drill Yard levels and Sanctum powers in turn, one
//    seat is DENIED that system (items refunded the moment they are bought; Drill Yard levels refunded
//    and cleared; powers blocked by a cooldown) and plays the same AI otherwise. Reported: the win rate
//    of the side that KEEPS the system (50% = it does not matter; the goal is clearly above 50%).
// 3. Is gear worth its gold? ("buy" test) From each scheduled minute one seat's gold is skimmed into
//    savings until the item's price is reached, then the item lands in a free slot - i.e. that gold went
//    to gear instead of sends - against the same AI. Reported: the buying side's win rate (50% = gear
//    is worth exactly what sends are). This separates the ITEMS from how the AI shops (the deny test
//    above measures the AI's own shopping, trips and consumables included).
// It drives E's AI unchanged and reads only sim state + events.
//   node tools/feel-report.mjs 32           (all three)      FEEL_DENY=items,hero  (pick deny tests)
//   node tools/feel-report.mjs --buy 64     (only the buy test)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataSync } from '../js/sim/data.js';
import { createSim } from '../js/sim/sim.js';
import { refreshHero } from '../js/sim/heroes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const N = +(argv.find(a => /^\d+$/.test(a)) || 16);
const diffI = argv.indexOf('--diff');
const DIFF = diffI >= 0 ? argv[diffI + 1] : 'veteran';
const RACES = ['freeholds', 'ashtusk', 'unburied', 'thornmane'];
const HEROES = ['warrior', 'ranger', 'pyromancer', 'druid', 'engineer'];

export function loadData() { return loadDataSync(n => readFileSync(join(ROOT, 'data', n), 'utf8')); }

/** One mirror match. deny: null | 'items' | 'upgrades' | 'powers' applied to `deniedSeat`. */
export function play(data, seed, { deny = null, deniedSeat = 0, maxMin = 40 } = {}) {
  const race = RACES[seed % 4], hero = HEROES[(seed >> 2) % 5];
  const players = [0, 1].map(t => ({ team: t, kind: 'ai', ai: { difficulty: DIFF }, race, hero, name: 'P' + t }));
  const s = createSim({ seed, mode: 'linewar', format: '1v1', players }, data);
  const tierGold = {}, tierCount = {};
  let lastUpg = 0, lastItem = 0;
  while (!s.over && s.tick < maxMin * 1200) {
    s.step([]);
    for (const e of s.drainEvents()) if (e.type === 'queued') { const u = data.derived.units[e.unit]; tierGold[u.tier] = (tierGold[u.tier] || 0) + u.cost; tierCount[u.tier] = (tierCount[u.tier] || 0) + 1; }
    if (!deny) continue;
    const p = s.state.players[deniedSeat];
    if (deny === 'items') {
      // refund only gold actually spent at the Outfitter (free drops are just taken away)
      const spent = p.stats.itemGold || 0;
      if (spent > lastItem) { p.gold += spent - lastItem; lastItem = spent; }
      for (let i = 0; i < p.inv.length; i++) if (p.inv[i]) { p.inv[i] = null; p.gearV = (p.gearV || 0) + 1; }
    } else if (deny === 'upgrades') {
      const spent = p.stats.upgradeGold || 0;
      if (spent > lastUpg) { p.gold += spent - lastUpg; lastUpg = spent; for (const k of Object.keys(p.upg)) p.upg[k] = 0; p.upV = (p.upV || 0) + 1; }
    } else if (deny === 'hero') {   // a calibration: how much does the hero decide at all?
      const h = s.state.ents.find(e => e.id === p.heroEnt);
      if (h && h.alive) { h.alive = false; h.hp = 0; h.respawnAt = s.tick + 1e7; }
    } else if (deny === 'powers') {
      for (const id of data.powers.order) p.powerCd[id] = s.tick + 1e6;
    }
    void lastItem;
  }
  const r = s.state.result;
  return { winner: r ? r.winner : -1, minutes: s.tick / 1200, reason: r ? r.reason : 'limit', tierGold, tierCount,
    banners: s.state.teams.map(t => Math.ceil(t.banners)), stats: s.state.players.map(p => ({ items: p.stats.itemGold, upg: p.stats.upgradeGold || 0, pow: p.stats.powerGold || 0, sends: p.stats.sendGold })) };
}

export const BUY_SCHEDULE = [[3, 'longsword'], [6, 'chainmail'], [9, 'plate_helm'], [12, 'warhammer']];
/** Buy test: share of games the gear-buying seat wins (mirror Veterans, mixed races/heroes). */
export function buyTest(data, n = N, schedule = BUY_SCHEDULE) {
  let won = 0;
  for (let i = 0; i < n; i++) {
    const seed = 700 + i, seat = i % 2;
    const players = [0, 1].map(t => ({ team: t, kind: 'ai', ai: { difficulty: DIFF }, race: RACES[seed % 4], hero: HEROES[(seed >> 2) % 5] }));
    const s = createSim({ seed, mode: 'linewar', format: '1v1', players }, data, { events: false });
    let k = 0, saved = 0;
    while (!s.over && s.tick < 40 * 1200) {
      s.step([]);
      if (k >= schedule.length || s.tick < schedule[k][0] * 1200) continue;
      const p = s.state.players[seat], id = schedule[k][1], price = data['items-bl'].items[id].price;
      const take = Math.min(Math.max(0, p.gold), price - saved); p.gold -= take; saved += take;
      const slot = p.inv.findIndex(x => !x);
      if (saved >= price && slot >= 0) { p.inv[slot] = { uid: 90000 + k, id, charges: 0 }; p.gearV = (p.gearV || 0) + 1; refreshHero({ state: s.state, data }, p); k++; saved = 0; }
    }
    const w = s.state.result ? s.state.result.winner : -1;
    won += w === -1 ? 0.5 : w === seat ? 1 : 0;
  }
  return Math.round(won / n * 100);
}

export function report(data, n = N) {
  const mins = [], tg = {}, spend = { items: 0, upg: 0, pow: 0, sends: 0 };
  for (let i = 0; i < n; i++) {
    const r = play(data, 100 + i);
    mins.push(r.minutes);
    for (const [t, g] of Object.entries(r.tierGold)) tg[t] = (tg[t] || 0) + g;
    for (const st of r.stats) { spend.items += st.items; spend.upg += st.upg; spend.pow += st.pow; spend.sends += st.sends; }
  }
  mins.sort((a, b) => a - b);
  const totalSend = Object.values(tg).reduce((a, b) => a + b, 0) || 1;
  const share = Object.fromEntries(Object.entries(tg).map(([t, g]) => [t, Math.round(g / totalSend * 100)]));
  const swing = {};
  for (const deny of (process.env.FEEL_DENY || 'items,upgrades,powers').split(',')) {
    let keep = 0, games = 0;
    for (let i = 0; i < n; i++) {
      const seat = i % 2;
      const r = play(data, 500 + i, { deny, deniedSeat: seat });
      if (r.winner === -1) { keep += 0.5; games++; continue; }
      if (r.winner !== seat) keep++;
      games++;
    }
    swing[deny] = Math.round(keep / games * 100);
  }
  const all = spend.items + spend.upg + spend.pow + spend.sends || 1;
  return {
    median: mins[mins.length >> 1], p10: mins[Math.floor(n * 0.1)], p90: mins[Math.min(n - 1, Math.floor(n * 0.9))],
    tierShare: share, spendShare: { sends: Math.round(spend.sends / all * 100), items: Math.round(spend.items / all * 100), upgrades: Math.round(spend.upg / all * 100), powers: Math.round(spend.pow / all * 100) },
    keepWins: swing,
  };
}

if (process.argv[1] && process.argv[1].endsWith('feel-report.mjs')) {
  const t0 = Date.now();
  if (argv.includes('--buy')) console.log('buy test: the gear-buying seat wins', buyTest(loadData()) + '%');
  else { const r = report(loadData()); r.buyWins = buyTest(loadData()); console.log(JSON.stringify(r, null, 1)); }
  console.log(`${N} seeds, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
