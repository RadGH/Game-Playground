// Stream E — owner feedback 7 V2: "overhaul the gold rewards and item pricing… make fishing a viable alternate way to
// get gold". THE RULES are pinned here as ratios against an hour of ordinary play; the bounds live in
// data/provinces/economy.json `targets`, the numbers come out of tools/sim-economy.mjs (which runs the real rules).
// No gold amount is written in this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { simulate } from '../../tools/sim-economy.mjs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const ECO = J('data/provinces/economy.json'), T = ECO.targets, PRICES = J('data/rules/prices.json'), ANG = J('data/provinces/angling.json');
const LEVELS = [1, 5, 10, 20];
// Y31 (owner feedback 10): the price ladder is pinned in MINUTES OF REAL PLAY at REAL (economy.json targets.realLevels)
const REAL = T.realLevels;
const R = await simulate({ levels: [...new Set([...LEVELS, ...REAL])].sort((a, b) => a - b), hours: 240 });
const real = L => at(L).real;
const at = L => R.levels[L], Q = L => at(L).activities.questing.gold;
const within = (v, [lo, hi]) => v >= lo && v <= hi;
/** An hour of questing at any level (between the simulated ones: a straight line). */
const qAt = lvl => { const ls = LEVELS; if (lvl <= ls[0]) return Q(ls[0]); for (let i = 1; i < ls.length; i++) if (lvl <= ls[i]) { const a = ls[i - 1], b = ls[i]; return Q(a) + (Q(b) - Q(a)) * (lvl - a) / (b - a); } return Q(ls[ls.length - 1]); };

test('Y31: the sim reproduces the owner\'s own play — gold in total at level 9 — and the income table every price reads IS the sim\'s', async () => {
  const { lifetimeGold } = await import('../../js/rules/economy.js');
  const O = T.ownerPoint, sim = R.real.levels[O.level].sim.lifetime;
  assert.ok(Math.abs(sim / O.gold - 1) <= O.tolerance, `the sim counts ${sim} gold in total at level ${O.level}; the owner's character had ${O.gold}`);
  assert.equal(lifetimeGold(PRICES, O.level), O.gold, 'the measured point is a row of prices.json income.lifetime');
  // "a few hours": level 9 is an afternoon, not an hour and not a week
  assert.ok(R.real.hoursTo[O.level] >= 2.5 && R.real.hoursTo[O.level] <= 6, `level ${O.level} after ${R.real.hoursTo[O.level]} hours of real play`);
  // one model, not two: at every level the table and the sim's own count agree (node tools/sim-economy.mjs --write-income makes it so)
  let prev = -1;
  for (const [L, v] of Object.entries(R.real.levels)) {
    assert.ok(v.table.lifetime > prev, `level ${L}: the table climbs`); prev = v.table.lifetime;
    if (+L >= 3) assert.ok(Math.abs(v.table.lifetime / v.sim.lifetime - 1) <= 0.08, `level ${L}: the table says ${v.table.lifetime}, the sim ${v.sim.lifetime} — run node tools/sim-economy.mjs --write-income`);
  }
  // what one level brings never shrinks by much from the level before (a price read off it must not jump about)
  for (let L = 2; L < REAL[REAL.length - 1]; L++) assert.ok(R.real.levels[L + 1].table.goldPerHour >= 0.8 * R.real.levels[L].table.goldPerHour, `level ${L + 1}: income per hour falls off a step`);
});

test('Y31: a character affords an uncommon shop piece of its level about every 20-30 minutes of real play, at every level — with potions to spare', () => {
  for (const L of REAL) {
    const m = real(L).minutes, hour = real(L).goldPerHour, u = at(L).prices.gear.magic.buy, potion = at(L).prices.healingPotion;
    assert.ok(within(m.uncommon, T.uncommonMinutes), `level ${L}: an uncommon piece (${u} gold) is ${m.uncommon} minutes of play at ${hour} gold an hour`);
    assert.ok(m.healingPotion <= T.potionMinutesMax, `level ${L}: a healing potion is ${m.healingPotion} minutes of play`);
    assert.ok(hour >= u + T.potionsWithTheUpgrade * potion, `level ${L}: an hour (${hour}) does not cover an uncommon piece (${u}) and ${T.potionsWithTheUpgrade} potions`);
    assert.ok(hour >= 2 * u, `level ${L}: an hour of play buys two uncommon pieces`);
  }
});

test('Y31: a rare is 1.5-2 hours of real play; the ladder climbs; a merchant pays a fair share and selling loot is never the main income', () => {
  let prev = null;
  for (const L of REAL) {
    const g = at(L).prices.gear, m = real(L).minutes;
    assert.ok(within(m.rare, T.rareMinutes), `level ${L}: a rare piece (${g.rare.buy} gold) is ${m.rare} minutes of play`);
    assert.ok(g.normal.buy < g.magic.buy && g.magic.buy < g.rare.buy && g.rare.buy < g.legendary.buy, `level ${L}: ladder`);
    assert.ok(m.legendary > 2 * m.rare, `level ${L}: a legendary is worth more than two rares`);
    for (const r of ['normal', 'magic', 'rare']) {
      assert.ok(g[r].sell >= 1 && (g[r].sell + 1) / g[r].buy >= T.sellBack[0] && g[r].sell / g[r].buy <= T.sellBack[1], `level ${L} ${r}: sells for ${g[r].sell} of ${g[r].buy}`);
      if (prev) assert.ok(g[r].buy > prev[r].buy, `${r} costs more at level ${L}`);
    }
    assert.ok(real(L).soldShare <= T.soldShareMax, `level ${L}: sold loot is ${Math.round(real(L).soldShare * 100)}% of an hour's gold`);
    prev = g;
  }
});

test('V2: fishing is a real second income — 70-100% of questing (measured, a few points of noise allowed), wider swings, never the best thing to do', () => {
  for (const L of LEVELS) {
    const f = at(L).activities.fishing, share = f.gold / Q(L);
    assert.ok(within(share, T.fishingShare), `level ${L}: fishing earns ${Math.round(share * 100)}% of questing (${f.gold} / ${Q(L)})`);
    const best = Math.max(...Object.entries(at(L).activities).filter(([k]) => k !== 'fishing').map(([, v]) => v.gold));
    assert.ok(f.gold <= best, `level ${L}: fishing (${f.gold}) out-earns every other activity (${best})`);
    assert.ok(f.p90 / f.p10 >= 1.15, `level ${L}: a fishing hour barely varies (${f.p10}-${f.p90})`);
    assert.ok(f.perHour.crates >= T.cratesPerFishingHour, `level ${L}: ${f.perHour.crates} sunken crates an hour`);
    assert.ok(f.parts.fish > f.parts.sunkenCrates + f.parts.junk, `level ${L}: the fish are the income, the crates the bonus`);
  }
  // most of the levels sit inside the aim itself
  assert.ok(LEVELS.filter(L => within(at(L).activities.fishing.gold / Q(L), T.fishingShareAim)).length >= 3);
  // the spike: a zone's legend (caught once) is a windfall — between half an hour and four hours of questing at that zone's level
  const sheet = J('data/provinces/torbor_downs.json');
  for (const g of ANG.legends) { const b = sheet.zones[g.zone].band, lvl = (b[0] + b[1]) / 2, h = g.price / qAt(lvl); assert.ok(h >= 0.5 && h <= 4, `${g.id}: ${g.price} gold is ${h.toFixed(1)} hours at level ${lvl}`); }
});

test('V2: the other ways to earn sit round questing — killing a little under, events and dungeons at or above it', () => {
  for (const L of LEVELS) for (const [k, b] of Object.entries(T.activityShare)) {
    const s = at(L).activities[k].gold / Q(L);
    assert.ok(within(s, b), `level ${L}: ${k} earns ${Math.round(s * 100)}% of questing (wanted ${b.map(x => Math.round(x * 100)).join('-')}%)`);
  }
  for (let i = 1; i < LEVELS.length; i++) for (const k of ['questing', 'killing', 'events', 'fishing']) assert.ok(at(LEVELS[i]).activities[k].gold > at(LEVELS[i - 1]).activities[k].gold, `${k} pays more at level ${LEVELS[i]}`);
});

test('V2 fish: commons are small change, a few are prized; level-1 water has something worth catching; there are species for levels 11-20', () => {
  const f = R.fish;
  assert.ok(f.commonMax < f.rareMin, `the dearest common (${f.commonMax}) against the cheapest rare (${f.rareMin})`);
  assert.ok(f.dearest >= T.fishBestOverCheapest * f.cheapest, `best ${f.dearest} / cheapest ${f.cheapest}`);
  assert.ok(f.byRarity.common.max < f.byRarity.uncommon.max && f.byRarity.uncommon.max < f.byRarity.rare.max && f.byRarity.rare.max < f.byRarity.epic.max);
  const first = ANG.fish.filter(x => x.bands[0] <= 1 && x.skill <= 3);
  assert.ok(first.filter(x => x.rarity === 'uncommon').length >= 2, 'level-1 water: two uncommon fish a beginner can land');
  const prized = first.filter(x => x.rarity === 'rare' || x.rarity === 'epic');
  assert.ok(prized.length >= 1 && Math.max(...prized.map(x => x.price)) >= 10 * Math.max(...first.filter(x => x.rarity === 'common').map(x => x.price)), 'level-1 water: one prized fish');
  const high = ANG.fish.filter(x => x.bands[0] >= 11);
  assert.ok(high.length >= 8 && ['river', 'lake', 'marsh', 'coast'].every(w => high.filter(x => x.water.includes(w)).length >= 2), 'species for level 11-20 water, every kind of water');
  for (const g of ANG.legends) assert.ok(g.price > f.byRarity.epic.max, g.id + ': a legend is worth more than any ordinary fish');
});

test('V2: one table for "one kill" — economy.json unit is stream C\'s kill formula, not a second copy that can drift', () => {
  assert.equal(ECO.unit.base, PRICES.kill.base);
  assert.equal(ECO.unit.perLevel, PRICES.kill.perLevel);
  assert.equal(ECO.sell.factor, PRICES.gear.sellFactor);
  assert.equal(ECO.sell.fish, 1);
  // and the level is in a kill's gold: every level pays more than the one before
  for (let L = 2; L <= 20; L++) assert.ok(Math.round(PRICES.kill.base + PRICES.kill.perLevel * L) > Math.round(PRICES.kill.base + PRICES.kill.perLevel * (L - 1)), 'level ' + L);
});

test('V2: nothing in a shop is trivially cheap or out of reach for ever — every fixed-price row costs at least one kill and at most a long evening of play at the level it opens', () => {
  const bad = [];
  for (const r of R.shopRows) {
    const kill = PRICES.kill.base + PRICES.kill.perLevel * r.level;
    if (r.price < kill) bad.push(`${r.kind} ${r.id}: ${r.price} gold is less than one level-${r.level} kill`);
    const hours = r.price / R.real.levels[r.level].table.goldPerHour;      // Y31: hours of REAL play
    if (hours > T.shopRowHoursMax) bad.push(`${r.kind} ${r.id}: ${r.price} gold is ${hours.toFixed(0)} hours of play at level ${r.level}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(R.shopRows.length >= 50);
  // the stable's shelf and economy.json say the same price for every mount (the shelf is what the server charges)
  for (const m of ECO.mounts) { const g = J('data/provinces/shops.json').kinds.stable.goods.find(x => x.id === m.id); assert.ok(g && g.price === m.price && g.minLevel === m.level, m.id + ': stable shelf and economy.json disagree'); }
  // a mount is a goal, not an afterthought: one to four hours of REAL play at the level it opens (Y31)
  for (const m of R.shopRows.filter(r => r.kind === 'stable' && /horse|pony|courser|dray/.test(r.id))) { const h = m.price / R.real.levels[m.level].table.goldPerHour; assert.ok(within(h, T.mountHours), `${m.id}: ${h.toFixed(1)} hours of play at level ${m.level}`); }
});

// ------------------------------------------------------------------------------------------------ V3: pools in plain sight
const AP = J('data/provinces/angling-pools.json'), SHEET = J('data/provinces/torbor_downs.json');
const MAP = J('data/world/province-map.json').provinces.torbor_downs.map;

test('V3: every hub town with water in reach has a pool of its own — always open, anyone may fish it, its angler stands by it and says where it is', () => {
  let dry = 0;
  for (const [eid, wid] of Object.entries(MAP)) {
    const list = AP.zones[wid], town = SHEET.zones[eid].town, a = AP.anglers.find(x => x.sheet === eid);
    assert.ok(a, eid + ': no angler');
    if (!list.length) { dry++; assert.ok(!a.pool && /no water/i.test(a.points), `${town}: dry, and its angler should say so`); continue; }
    const mine = list.filter(p => p.town === town);
    assert.equal(mine.length, 1, town + ': one town pool');
    assert.ok(mine[0].always && mine[0].tier === 1, town + ': the town pool is always open and tier 1');
    assert.equal(a.pool, mine[0].id, town + ': the angler points at another pool');
    assert.ok(a.toPool <= 80, `${town}: the angler stands ${a.toPool} m from the town pool`);
    const greeting = J(`data/quests/${eid === 'test' ? 'angling' : eid}.json`).npcs[a.id].greeting;
    assert.ok(greeting.endsWith(a.points) && /ripples/.test(a.points), town + ': the angler does not say where the pool is');
    // no nearer water was passed over: nothing else in the zone is more than 150 m closer to the town's middle
    const o = { ox: +wid.slice(1, 3) * 2048, oz: +wid.slice(4, 6) * 2048 }, t = J(`data/vignettes/placements/${wid}.json`).settlements.find(s => s.name === town);
    const d = p => Math.hypot(p.shore.x - o.ox - t.x, p.shore.z - o.oz - t.z);
    assert.ok(d(mine[0]) <= Math.min(...list.map(d)) + 150, `${town}: the town pool is ${Math.round(d(mine[0]))} m out, another pool is ${Math.round(Math.min(...list.map(d)))} m`);
  }
  assert.equal(dry, 1, 'only the Blackthorn Scar is dry');
  // the first quest's pool is Torborhold's own
  assert.ok(AP.zones.z12_02.find(p => p.start).town === 'Torborhold');
});

test('V3: a newcomer can use most of what he sees — most pools are tier 1, most listed spots are open, and roads by water have more of them', () => {
  const all = Object.values(AP.zones).flat();
  assert.ok(all.filter(p => p.tier === 1).length >= 0.6 * all.length, `tier-1 pools: ${all.filter(p => p.tier === 1).length} of ${all.length}`);
  for (const [wid, m] of Object.entries(AP.meta)) {
    const l = AP.zones[wid]; if (!l.length) continue;
    assert.ok(l.filter(p => p.tier === 1).length >= 0.55 * l.length, `${m.sheet}: tier-1 share`);
    assert.ok(m.live >= 0.55 * l.length && m.live <= l.length, `${m.sheet}: ${m.live} of ${l.length} open`);
    // no two pools on top of each other
    for (let i = 0; i < l.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(l[i].x - l[j].x, l[i].z - l[j].z) >= 55, `${l[i].id} and ${l[j].id} are too close`);
  }
  assert.ok(all.length >= 360, 'pools: ' + all.length);
  assert.ok(all.filter(p => p.road <= 45).length >= 70, 'pools beside a road: ' + all.filter(p => p.road <= 45).length);
});
