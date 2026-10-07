#!/usr/bin/env node
// Thousandvale — THE ECONOMY, MEASURED (stream E leads, owner feedback 7 V2: "overhaul the gold rewards and item pricing
// throughout the game. Make fishing a viable alternate way to get gold, with chances at finding loot crates or valuable fish").
//
//   node tools/sim-economy.mjs                 gold per hour by activity at levels 1 / 5 / 10 / 20 + the price ladder, working tree
//   node tools/sim-economy.mjs --before        the same from the data as committed in git (HEAD) — what it was
//   node tools/sim-economy.mjs --json          the numbers (tests/E/playtest7-economy.test.js imports `simulate`)
//   node tools/sim-economy.mjs --levels=1,3,8  other levels;  --hours=400  more simulated fishing hours
//   node tools/sim-economy.mjs --set=prices.kill.perLevel=0.5 --set=fishing.value.mult=0.6     WHAT-IF: try a knob without editing data
//
// NOTHING HERE IS A COPY OF A RULE. Every number comes out of the module the game runs:
//   a kill's gold and drops     js/rules/monster-ai.js spawnMonster + Farhold's rpg.rollDrops, in a real rules room
//   what a thing costs / sells  js/sim/shops.js createShops().price / sellPrice over the engine's rpg.price
//   quest, chest, event, fare   js/sim/economy-knobs.js (stream E's data/provinces/economy.json) + js/sim/events.js
//   a cast                      js/rules/fishing.js (engine.fishing: C's data/rules/fishing.json + E's data/provinces/angling.json)
//   a dungeon                   js/rules/dungeon-tiers.js planDungeon
//   crates                      js/rules/crates.js openCrate
// What IS assumed is how a person spends an hour — and it is all in ASSUME, in one place, in plain words.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRulesData } from '../js/rules/data.js';
import { createEngine } from '../js/rules/engine.js';
import { createRoomContext } from '../js/rules/room.js';
import { attachField } from '../js/rules/field.js';
import { flatTerrain } from '../js/rules/terrain-flat.js';
import { spawnMonster } from '../js/rules/monster-ai.js';
import { planDungeon } from '../js/rules/dungeon-tiers.js';
import { openCrate, makeCrate } from '../js/rules/crates.js';
import { killGold as ruleKillGold, itemPrice as ruleItemPrice, sellPrice as ruleSellPrice } from '../js/rules/economy.js';
import { createShops } from '../js/sim/shops.js';
import { createMountBook } from '../js/sim/mounts.js';
import { configureEconomy, economy, questGold, chestGold, roadChestGold, eventGold, travelFare, treasureGold } from '../js/sim/economy-knobs.js';

const ROOT = new URL('../', import.meta.url);
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

/** How a person spends an hour. Change these and every table moves; they are NOT game rules. */
export const ASSUME = Object.freeze({
  grind: { killsPerHour: 85 },                    // standing in a camp field: a kill every ~42 s with the walk between packs
  quest: { perHour: 4, killsPerHour: 32 },        // a quest every 15 minutes; its kill steps and the things in the way
  events: { zonePerHour: 2.5, roadPerHour: 5, killsPerHour: 25, minutes: 6, roadChestShare: 0.45, roadQuestShare: 0.55 },
  dungeon: { secPerPackBody: 22, secPerElite: 70, secPerBoss: 200, walkSecPerFloor: 240, travelSec: 300 },
  fish: { castSec: 1.6, reactSec: 0.7, stowSec: 2.2, walkSpeed: 5.4, sellTripSecPerHour: 240,
    // angling skill a character of that level has if they fish about a fifth of the time
    skillAt: { 1: 3, 5: 28, 10: 50, 20: 80 },
    // how well a person holds the marker in the band: the share of the tug they manage, a bell curve
    hold: { base: 0.42, perBand: 1.0, perSkill: 0.0025, sd: 0.13 } },
  sellEverything: true,                           // gold per hour counts drops, crates and fish SOLD to a merchant
});

const rarityUp = { common: 'normal', uncommon: 'magic', rare: 'rare', epic: 'legendary' };
function seeded(seed) { let s = seed >>> 0 || 1; const f = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; return f; }
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v); }

/** A JSON reader over the working tree, or over git HEAD (`before`). */
function reader(before) {
  const disk = u => JSON.parse(readFileSync(u, 'utf8'));
  if (!before) return { url: disk, rel: p => disk(new URL(p, ROOT)), opt: p => { try { return disk(new URL(p, ROOT)); } catch { return null; } } };
  const head = abs => JSON.parse(execFileSync('git', ['-C', REPO, 'show', 'HEAD:' + abs.slice(REPO.length)], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }));
  // a file that did not exist at HEAD (C's prices.json, A's economy.json) is simply not there: the rules fall back to what they did before
  const url = u => { try { return head(fileURLToPath(u)); } catch { return null; } };
  return { url, rel: p => url(new URL(p, ROOT)), opt: p => { try { return url(new URL(p, ROOT)); } catch { return null; } } };
}

export async function simulate({ before = false, levels = [1, 5, 10, 20], hours = 240, seed = 7, set = null } = {}) {
  const R = reader(before);
  const data = await loadRulesData(async u => R.url(u));
  // WHAT-IF: `set` = { 'prices.kill.perLevel': 0.5, 'fishing.value.mult': 0.6, 'angling.crates.chance': 0.03, 'economy.quest.goldBase': 4, 'shops.…': … }
  // changes a number in memory only (the first word names the file), so a knob can be tried before anyone edits data.
  const econData = R.opt('data/provinces/economy.json') || R.opt('data/rules/economy.json') || {};
  const shopData = R.rel('data/provinces/shops.json');
  const roots = { prices: data.prices, fishing: data.fishing, angling: data.angling, economy: econData, shops: shopData };
  for (const [path, v] of Object.entries(set || {})) { const ks = path.split('.'); let o = roots[ks[0]]; if (!o) continue; for (const k of ks.slice(1, -1)) o = (o[k] ||= {}); o[ks[ks.length - 1]] = v; }
  const engine = createEngine(data, { seed });
  const room = createRoomContext({ id: 'econ', seed, engine });
  attachField(room, { terrain: flatTerrain() });
  const lootRng = room.streams.get('loot');
  const rng = seeded(seed * 7919 + 13);
  configureEconomy(econData);
  const E = economy();
  const SHOPS = shopData;
  // stream C's formulas (data/rules/prices.json) when the build has them; before that, Farhold's own price and the monster's own gold
  const PR = engine.prices || null;
  const rules = { price: it => (PR ? ruleItemPrice(PR, it) : engine.rpg.price(it)), ...(PR ? { sellPrice: it => ruleSellPrice(PR, it) } : {}) };
  const shops = createShops({ data: SHOPS, mounts: null, rng });
  const sell = it => (PR ? ruleSellPrice(PR, it) : shops.sellPrice(it, rules));
  const buy = it => shops.price(it, rules, 1);
  const sheet = R.rel('data/provinces/torbor_downs.json');
  const angling = data.angling || R.opt('data/provinces/angling.json'), pools = R.opt('data/provinces/angling-pools.json');
  const events = R.rel('data/quests/events.json'), road = R.opt('data/provinces/road-events.json') || {};
  const A = ASSUME;

  // ---- what stands in the world at a level: the sheet's camp types whose level range holds it (else the nearest band)
  const campRows = Object.values(sheet.zones).flatMap(z => (z.camps || []).map(c => ({ type: c.type, lo: [].concat(c.level)[0], hi: [].concat(c.level).slice(-1)[0] })));
  const typesAt = L => { let rows = campRows.filter(c => c.lo <= L && c.hi >= L); for (let d = 1; !rows.length && d < 30; d++) rows = campRows.filter(c => c.lo <= L + d && c.hi >= L - d); return [...new Set(rows.map(c => c.type))].filter(t => engine.enemyDef(t)); };
  const rankChance = (engine.affixes && engine.affixes.cfg && engine.affixes.cfg.chance) || { champion: 0, rare: 0, minLevel: 99 };
  const rollRank = L => { if (L < (rankChance.minLevel ?? 2)) return 'normal'; const x = rng(); return x < rankChance.rare ? 'rare' : x < rankChance.rare + rankChance.champion ? 'champion' : 'normal'; };
  /** One kill, for real: the gold the monster carries and what its drops sell for. */
  function kill(type, L, rank = 'normal') {
    const def = engine.enemyDef(type) || engine.enemyDef('moor_hound');
    const u = room.run(() => spawnMonster(room.field, def, L, 0, 0, { rank: rank === 'elite' ? 'champion' : rank, boss: rank === 'boss' }));
    const drops = engine.rpg.rollDrops(u, { rng: lootRng, magicFind: 0 }) || [];
    room.run(() => { try { room.field.remove ? room.field.remove(u) : null; } catch { /* a scratch room */ } });
    const gold = PR ? ruleKillGold(PR, L, { rank: rank === 'elite' ? 'champion' : rank, defGold: def.gold, boss: rank === 'boss' }) : (u.gold || 0);
    return { gold, loot: drops.reduce((a, it) => a + sell(it), 0), items: drops.length };
  }
  const killAvg = (L, n = 600) => { const ts = typesAt(L); let gold = 0, loot = 0, items = 0, special = 0; for (let i = 0; i < n; i++) { const rk = rollRank(L); if (rk !== 'normal') special++; const k = kill(ts[i % ts.length], L, rk); gold += k.gold; loot += k.loot; items += k.items; } return { gold: gold / n, loot: loot / n, items: items / n, special: special / n, types: ts }; };
  /** A shop item of a rarity at a level, priced as the counter prices it (average over rolls). */
  function gearPrice(L, rarity, n = 80) {
    const b = [], s = [];
    for (let i = 0; i < n * 4 && b.length < n; i++) { const it = engine.rpg.rollDrop({ level: L, rng: lootRng, chance: 1, rarityBoost: 0, floor: rarity === 'normal' ? null : rarity }); if (it && it.rarity === rarity) { b.push(buy(it)); s.push(sell(it)); } }
    return { buy: Math.round(mean(b)), sell: Math.round(mean(s)), n: b.length };
  }
  function crateValue(L, spec = { slot: 'any', min: 'uncommon' }, n = 60) {
    let v = 0, got = 0;
    for (let i = 0; i < n; i++) { try { const c = makeCrate(engine.crates, spec, { level: L }); const items = openCrate(engine, c, { cls: null, level: L, rng: lootRng }) || []; for (const it of items) v += sell(it); got++; } catch { /* a crate this build cannot open */ } }
    return got ? v / got : gearPrice(L, 'magic', 20).sell;
  }

  // ---- quests: the reward shapes written for that level (nearest levels when the province has none that high)
  const questFiles = ['start', 'test', 'setpieces', 'angling', 'province', ...Object.keys(sheet.zones).filter(z => z !== 'test')];
  const quests = questFiles.flatMap(f => { const d = R.opt(`data/quests/${f}.json`); return (d && d.quests) || []; }).filter(q => q.reward && !q.classes);
  // the province's quests stop at level 9: above that, the shape of its top band (levels 6+) at the higher level's unit
  const TOP = Math.max(...quests.map(q => q.level || 1));
  const questsAt = L => { if (L > TOP) return quests.filter(x => (x.level || 1) >= 6); let q = quests.filter(x => Math.abs((x.level || 1) - L) <= 1); for (let d = 2; q.length < 12 && d < 30; d++) q = quests.filter(x => Math.abs((x.level || 1) - L) <= d); return q; };

  const out = { before, assume: A, economy: E, levels: {}, fish: null, shopRows: [] };
  const mountsTable = (() => { try { return createMountBook(R.opt('data/provinces/mounts.json')).forSale({ mounts: [] }).map(r => ({ id: r.mount.id || r.id, price: r.price, level: r.level })); } catch { return null; } })();

  for (const L of levels) {
    const K = killAvg(L);
    const perKill = K.gold + K.loot;
    const act = {};
    // 1. killing
    act.killing = { gold: Math.round(A.grind.killsPerHour * perKill), parts: { coin: Math.round(A.grind.killsPerHour * K.gold), soldDrops: Math.round(A.grind.killsPerHour * K.loot) }, note: `${A.grind.killsPerHour} kills, ${K.gold.toFixed(1)} gold + ${K.loot.toFixed(1)} of sold drops each` };
    // 2. questing
    // an hour of questing is three ordinary quests and one notable one (a dungeon, a rare, a story step): the MEDIAN purse
    // three times and the 90th-percentile purse once — the mean would let one world-boss quest speak for the hour
    const qs = questsAt(L), mults = qs.map(q => q.reward.gold || 0);
    const unitGold = (3 * questGold(pct(mults, 0.5), L) + questGold(pct(mults, 0.9), L)) / 4;
    const crates = mean(qs.map(q => (q.reward.crates || []).length + (q.reward.item ? 1 : 0)));
    const crateSell = crateValue(L);
    act.questing = { gold: Math.round(A.quest.perHour * (unitGold + crates * crateSell) + A.quest.killsPerHour * perKill),
      parts: { purses: Math.round(A.quest.perHour * unitGold), soldCrates: Math.round(A.quest.perHour * crates * crateSell), kills: Math.round(A.quest.killsPerHour * perKill) }, note: `${A.quest.perHour} quests (${unitGold.toFixed(0)} gold each, ${crates.toFixed(2)} crates), ${A.quest.killsPerHour} kills` };
    // 3. events
    const zoneEv = events.zone, zr = mean(zoneEv.map(ev => eventGold((ev.reward || {}).gold || 0, L, A.events.minutes, false)));
    const rareSell = gearPrice(L, 'rare', 30).sell;
    const chestRow = mean((road.chests || [{}]).map(() => roadChestGold(L, 0.5)));
    const roadQuest = mean([...(road.deliver || []), ...(road.escort || []), ...(road.rescue || [])].map(s => questGold(s.gold || 4, L)).concat(questGold(4, L)));
    const roadGold = A.events.roadPerHour * (A.events.roadChestShare * (chestRow + gearPrice(L, 'magic', 20).sell) + A.events.roadQuestShare * roadQuest);
    act.events = { gold: Math.round(A.events.zonePerHour * (zr + rareSell) + roadGold + A.events.killsPerHour * perKill),
      parts: { zoneEvents: Math.round(A.events.zonePerHour * zr), soldRares: Math.round(A.events.zonePerHour * rareSell), roadEvents: Math.round(roadGold), kills: Math.round(A.events.killsPerHour * perKill) }, note: `${A.events.zonePerHour} zone events (${zr.toFixed(0)} gold + a rare each), ${A.events.roadPerHour} road events` };
    // 4. dungeons: the plan the server would build for a dungeon of this level
    const plan = planDungeon(1000 + L, { floors: 2, level: L, family: 'crypt_spiral' });
    let dGold = 0, dLoot = 0, dSec = A.dungeon.travelSec, bodies = 0;
    for (const f of plan.floors) {
      dSec += A.dungeon.walkSecPerFloor;
      for (const p of f.packs) for (let i = 0; i < (p.count || 1); i++) {
        const k = kill(p.type, p.level || L, p.rank || 'normal'); dGold += k.gold; dLoot += k.loot; bodies++;
        dSec += p.rank === 'boss' ? A.dungeon.secPerBoss : p.rank === 'elite' ? A.dungeon.secPerElite : A.dungeon.secPerPackBody;
      }
    }
    const chest = chestGold(L + 2), chestLoot = mean(Array.from({ length: 30 }, () => { const it = engine.rpg.rollDrop({ level: L + 2, rng: lootRng, chance: 1, rarityBoost: 2, floor: null }); return it ? sell(it) : 0; }));
    const runs = 3600 / dSec;
    act.dungeon = { gold: Math.round(runs * (dGold + dLoot + chest + chestLoot)), parts: { coin: Math.round(runs * dGold), soldDrops: Math.round(runs * (dLoot + chestLoot)), chest: Math.round(runs * chest) }, note: `${runs.toFixed(2)} runs an hour (${Math.round(dSec / 60)} min each, ${bodies} bodies)` };
    // 5. fishing
    act.fishing = fishHours(L, crateSell);

    // the price ladder at this level
    const gear = { normal: gearPrice(L, 'normal'), magic: gearPrice(L, 'magic'), rare: gearPrice(L, 'rare'), legendary: gearPrice(L, 'legendary', 30) };
    const good = (kind, id) => { const g = ((SHOPS.kinds[kind] || {}).goods || []).find(x => x.id === id); return g ? g.price : null; };
    const retrain = engine.balance.retrain || {};
    const tv = (engine.progression && engine.progression.retrain) || retrain;
    const rt = k => (tv[k] ? Math.round((tv[k].one || 0) + (tv[k].perLevel || 0) * L) : null);
    out.levels[L] = { activities: act, perKill: { gold: +K.gold.toFixed(2), soldDrops: +K.loot.toFixed(2), special: +K.special.toFixed(3) }, unit: questGold(1, L),
      prices: { gear, healingPotion: good('general', 'healing_potion'), greaterHealing: good('apothecary', 'greater_healing'), manaPotion: good('general', 'mana_potion'), rations: good('general', 'travel_rations'), stew: good('inn', 'hearty_stew') ?? good('provisioner', 'hearty_stew'),
        mount: (() => { const list = mountsTable || []; const m = list.filter(x => (x.level || 1) <= L && x.price > 0).sort((a, b) => b.price - a.price)[0]; return m ? { id: m.id, price: m.price } : null; })(),
        unbindTalent: rt('talent'), unbindPerk: rt('perk'), fare2km: travelFare(2000), fare8km: travelFare(8000), rod: good('angler', 'angling_rod'), betterRod: good('angler', 'ash_rod'), bait: good('angler', 'bait_worms') } };
  }

  // ---- every fixed-price shop row, for the "nothing unaffordable forever, nothing trivially cheap" rule
  for (const [kind, k] of Object.entries(SHOPS.kinds)) for (const g of k.goods || []) out.shopRows.push({ kind, id: g.id, price: g.price, level: g.minLevel || 1 });
  for (const m of mountsTable || []) if (m.price > 0 && !out.shopRows.some(r => r.id === m.id)) out.shopRows.push({ kind: 'stable', id: m.id, price: m.price, level: m.level || 1 });   // the stable's own row wins (js/sim/shops.js)

  // ---- the fish themselves
  if (angling) {
    const f = angling.fish, by = r => f.filter(x => x.rarity === r).map(x => x.price);
    out.fish = { n: f.length, cheapest: Math.min(...f.map(x => x.price)), dearest: Math.max(...f.map(x => x.price)), commonMax: Math.max(...by('common')), rareMin: Math.min(...by('rare')), epicMin: Math.min(...by('epic')),
      byRarity: Object.fromEntries(['common', 'uncommon', 'rare', 'epic'].map(r => [r, { n: by(r).length, min: Math.min(...by(r)), max: Math.max(...by(r)) }])),
      legend: { min: Math.min(...angling.legends.map(l => l.price ?? (data.fishing?.kinds?.legend?.price ?? 120))), max: Math.max(...angling.legends.map(l => l.price ?? (data.fishing?.kinds?.legend?.price ?? 120))) }, crateChance: angling.crates && angling.crates.chance };
  }
  return out;

  /** `hours` simulated hours of fishing at level L -> { gold (mean), p10, p90, sd, parts, perHour: {...} } */
  function fishHours(L, crateSell) {
    const F = engine.fishing;
    if (!F || !angling || !pools) return { gold: 0, note: 'no angling in this build' };
    const skill = A.fish.skillAt[L] ?? Math.min(95, 3 + L * 4);
    // the zone a character of this level fishes: the sheet zone whose band holds the level and has the most pools
    const metas = Object.entries(pools.meta).filter(([, m]) => (pools.zones[m.sheet ? Object.keys(pools.meta).find(w => pools.meta[w] === m) : ''] || []).length);
    const fit = metas.filter(([, m]) => m.band[0] <= L && m.band[1] >= L);
    // above the province's own levels: its highest zone (the best water there is), fished at that zone's top level
    const top = Math.max(...metas.map(([, m]) => m.band[1]));
    const [wid, meta] = (fit.length ? fit : metas.filter(([, m]) => m.band[1] === top)).sort((a, b) => pools.zones[b[0]].length - pools.zones[a[0]].length || (a[0] < b[0] ? -1 : 1))[0];
    // (the water is then priced and stocked AS level L water: the species with bands 11-20 exist for the provinces to come)
    const band = fit.length ? [Math.min(L, meta.band[1]), Math.min(L, meta.band[1])] : [L, L];
    const open = pools.zones[wid].filter(p => skill >= (F.pool(p.tier).minSkill || 0));
    const bestTier = Math.max(...open.map(p => p.tier));
    // the walk between pools: the typical gap to the nearest other pool you may fish, stretched because only `live` are open
    const gaps = open.map(p => Math.min(...open.filter(q => q !== p).map(q => Math.hypot(q.x - p.x, q.z - p.z)))).filter(Number.isFinite);
    const walk = (pct(gaps, 0.5) || 200) * Math.sqrt(pools.zones[wid].length / Math.max(1, meta.live)) / A.fish.walkSpeed;
    const rod = skill >= 50 ? 'river_wardens_rod' : skill >= 25 ? 'ash_rod' : 'angling_rod';
    const H = A.fish.hold, results = [], sums = { fish: 0, junk: 0, crates: 0, legends: 0, monsters: 0 }, counts = { casts: 0, fish: 0, lost: 0, crates: 0, legends: 0, junk: 0, monsters: 0, pools: 0 };
    let best = 0, legendPrice = 0;
    for (let h = 0; h < hours; h++) {
      const caught = new Set();                          // per hour, to measure how often the zone's legend WOULD come up
      let t = A.fish.sellTripSecPerHour, gold = 0, left = 0, tier = 1, water = 'river';
      while (t < 3600) {
        if (left <= 0) {                                   // fished out: walk to the next pool
          const p = open[Math.floor(rng() * open.length)];
          tier = rng() < 0.5 ? bestTier : p.tier; water = p.water;
          const c = F.pool(tier).catches || [4, 6]; left = c[0] + Math.floor(rng() * (c[1] - c[0] + 1));
          t += walk; counts.pools++; if (t >= 3600) break;
        }
        counts.casts++;
        t += A.fish.castSec + F.wait(rng, { pool: { tier }, rod }) + A.fish.reactSec;
        const c = F.roll({ water, band, time: rng() < 0.6 ? 'day' : rng() < 0.5 ? 'night' : rng() < 0.5 ? 'dawn' : 'dusk', skill, zone: meta.sheet, pool: { tier }, rod, caught, rng });
        if (!c) { t += A.fish.stowSec; continue; }
        if (c.kind === 'monster') { const k = kill(c.monster.type, L, 'normal'); gold += k.gold + k.loot; sums.monsters += k.gold + k.loot; counts.monsters++; t += 40; continue; }
        if (c.kind === 'junk') { gold += c.price || 0; sums.junk += c.price || 0; counts.junk++; t += A.fish.stowSec; left--; continue; }
        if (c.kind === 'crate') { gold += crateSell; sums.crates += crateSell; counts.crates++; t += A.fish.stowSec; left--; continue; }
        const tug = F.tug(c, skill, rod);
        t += (tug.ms || 3000) / 1000 + A.fish.stowSec;
        const held = H.base + H.perBand * (tug.band || 0.3) + H.perSkill * skill + gauss(rng) * H.sd;
        if (held < (tug.need || 0.5)) { counts.lost++; continue; }
        left--;
        // a legend is caught ONCE per zone, ever: a windfall, counted and reported but not part of an hour's steady gold
        if (c.kind === 'legend') { caught.add(c.id); sums.legends += c.price; counts.legends++; legendPrice = Math.max(legendPrice, c.price); continue; }
        gold += c.price; sums.fish += c.price; counts.fish++; best = Math.max(best, c.price);
      }
      results.push(gold);
    }
    const per = k => +(counts[k] / hours).toFixed(2);
    return { gold: Math.round(mean(results)), p10: Math.round(pct(results, 0.1)), p90: Math.round(pct(results, 0.9)), sd: Math.round(sd(results)), best,
      legend: { price: legendPrice, hoursToCatch: counts.legends ? +(hours / counts.legends).toFixed(1) : null },
      parts: { fish: Math.round(sums.fish / hours), sunkenCrates: Math.round(sums.crates / hours), junk: Math.round(sums.junk / hours), pulledUp: Math.round(sums.monsters / hours) },
      perHour: { casts: per('casts'), fish: per('fish'), lost: per('lost'), crates: per('crates'), legends: per('legends'), junk: per('junk'), pools: per('pools') },
      note: `skill ${skill}, ${meta.name}, ${open.length} pools open to you (best tier ${bestTier}), ${Math.round(walk)} s walk between pools` };
  }
}

// ----------------------------------------------------------------------------------------------- printing
const pad = (s, n) => String(s).padStart(n);
export function print(r) {
  const Ls = Object.keys(r.levels).map(Number);
  const lines = [];
  lines.push(`THE ECONOMY — ${r.before ? 'BEFORE (data as committed in git)' : 'working tree'} — gold per hour, everything sold`);
  lines.push('activity      ' + Ls.map(L => pad('level ' + L, 11)).join(''));
  for (const a of ['questing', 'killing', 'events', 'dungeon', 'fishing']) lines.push(a.padEnd(14) + Ls.map(L => pad(r.levels[L].activities[a].gold, 11)).join(''));
  lines.push('fishing p10-p90 ' + Ls.map(L => { const f = r.levels[L].activities.fishing; return pad(`${f.p10}-${f.p90}`, 11); }).join('').slice(2));
  lines.push('legend (once a zone) ' + Ls.map(L => { const g = r.levels[L].activities.fishing.legend || {}; return pad(g.hoursToCatch ? `${g.price}g/${g.hoursToCatch}h` : 'not yet', 10); }).join(' '));
  lines.push('fishing / questing ' + Ls.map(L => pad(Math.round(100 * r.levels[L].activities.fishing.gold / Math.max(1, r.levels[L].activities.questing.gold)) + '%', 9)).join('  '));
  lines.push('');
  lines.push('where it comes from');
  for (const L of Ls) for (const [a, v] of Object.entries(r.levels[L].activities)) lines.push(`  L${String(L).padEnd(3)}${a.padEnd(9)} ${Object.entries(v.parts || {}).map(([k, x]) => `${k} ${x}`).join(', ')}  (${v.note})`);
  lines.push('');
  lines.push('PRICES            ' + Ls.map(L => pad('level ' + L, 11)).join('') + '      hours of questing to buy (same columns)');
  const row = (name, f) => lines.push(name.padEnd(18) + Ls.map(L => pad(f(L) ?? '-', 11)).join('') + '      ' + Ls.map(L => { const v = f(L); return pad(v == null ? '-' : (v / Math.max(1, r.levels[L].activities.questing.gold)).toFixed(2), 7); }).join(''));
  const P = L => r.levels[L].prices;
  row('plain gear', L => P(L).gear.normal.buy); row('uncommon gear', L => P(L).gear.magic.buy); row('rare gear', L => P(L).gear.rare.buy); row('legendary (worth)', L => P(L).gear.legendary.buy);
  row('  sells: uncommon', L => P(L).gear.magic.sell); row('  sells: rare', L => P(L).gear.rare.sell);
  row('healing potion', L => P(L).healingPotion); row('greater healing', L => P(L).greaterHealing); row('travel rations', L => P(L).rations); row('hearty stew', L => P(L).stew);
  row('best mount', L => P(L).mount && P(L).mount.price); row('unbind a talent', L => P(L).unbindTalent); row('unbind a perk', L => P(L).unbindPerk);
  row('waystone 2 km', L => P(L).fare2km); row('waystone 8 km', L => P(L).fare8km); row('hazel rod', L => P(L).rod); row('ash rod', L => P(L).betterRod);
  lines.push('one kill pays     ' + Ls.map(L => pad(r.levels[L].perKill.gold + '+' + r.levels[L].perKill.soldDrops, 11)).join('') + '      (coin + sold drops)');
  if (r.fish) { const f = r.fish; lines.push(''); lines.push(`FISH  ${f.n} species: ` + Object.entries(f.byRarity).map(([k, v]) => `${k} ${v.min}-${v.max} g (${v.n})`).join(', ') + `; legends ${f.legend.min}-${f.legend.max} g; sunken crate ${(100 * (f.crateChance || 0)).toFixed(1)}% of casts`);
    lines.push('fishing an hour:  ' + Ls.map(L => { const p = r.levels[L].activities.fishing.perHour || {}; return `L${L}: ${p.fish} fish, ${p.crates} crates, ${p.legends} legends, ${p.pools} pools`; }).join(' | ')); }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
  const set = Object.fromEntries(process.argv.filter(x => x.startsWith('--set=')).map(x => { const [k, v] = x.slice(6).split('='); return [k, JSON.parse(v)]; }));
  const r = await simulate({ set, before: process.argv.includes('--before'), levels: arg('levels') ? arg('levels').split(',').map(Number) : undefined, hours: arg('hours') ? +arg('hours') : undefined });
  console.log(process.argv.includes('--json') ? JSON.stringify(r, null, 1) : print(r));
  process.exit(0);
}
