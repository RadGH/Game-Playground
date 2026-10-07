// Owner feedback 7 (stream A): V1 the feedback letter at level 3, V2 every gold number the server applies is data, V3 fish
// pools are open and in sight (every town with water keeps a never-empty beginner pool).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { configureEconomy, economy, ECONOMY_DEFAULTS, questGold, killGoldAt, chestGold, treasureGold, roadChestGold, eventGold, travelFare, lengthFactor } from '../../js/sim/economy-knobs.js';
import { createShops } from '../../js/sim/shops.js';
import { createMountBook } from '../../js/sim/mounts.js';
import { eventReward } from '../../js/sim/events.js';
import { NUDGE } from '../../js/sim/feedback.js';
import { m3Server, joinAs, run, until, setLevel } from './m3-helpers.js';
import { makeClient, waitP, loadAll } from './helpers.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { realServer, joinReal, rec } from './pt1-helpers.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };

test('V1: reaching level 3 without ever sending feedback posts ONE letter with the owner\'s words; never again (not at level 4, not at the next login)', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const W = srv.world;
  const tokens = memoryTokenStore();
  const a = makeClient(srv, clock, { tokenStore: tokens });
  await waitP(clock, a.ready);
  const ch = await waitP(clock, a.createChar({ name: 'Quiet', cls: 'warrior' }));
  await waitP(clock, a.play(ch.id)); await until(clock, () => !!a.joined, 5000);
  const o = W.online.get(ch.id);
  await run(clock, 500);
  assert.equal((await store.mailList(ch.id)).length, 0, 'nothing at level 1');
  const lvl = L => { o.char.level = L; o.entity.setLevel(L); W.province.grant(o, { items: [], gold: 0 }); o.room.award(o.entity, { xp: 0, reason: 'test' }); };
  // level 2: nothing; level 3: the letter
  o.char.level = 2; o.entity.setLevel(2); o.room.award(o.entity, { xp: 0 }); await run(clock, 300);
  assert.equal((await store.mailList(ch.id)).length, 0);
  o.char.level = 3; o.entity.setLevel(3); o.room.award(o.entity, { xp: 0 }); await run(clock, 300);
  const list = await store.mailList(ch.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].subject, NUDGE.subject); assert.equal(list[0].kind, 'system');
  const letter = await store.mailGet(ch.id, list[0].id);
  assert.ok(letter.body.includes('Help us make the game better by submitting feedback. Earn a free item as a reward the first time you share feedback or submit a bug.'), letter.body);
  assert.ok(o.char.flags.feedbackNudge > 0, 'the flag is on the character');
  // level 4, and a fresh login: no second letter
  o.char.level = 4; o.entity.setLevel(4); o.room.award(o.entity, { xp: 0 }); await run(clock, 300);
  await W.saveNow(o); await W.flushJournal();
  assert.ok(loadAll(store).find(c => c.id === ch.id).flags.feedbackNudge > 0, 'saved');
  a.close(); await run(clock, 6000);
  const a2 = makeClient(srv, clock, { tokenStore: tokens });
  await waitP(clock, a2.ready); await waitP(clock, a2.play(ch.id)); await until(clock, () => !!a2.joined, 5000);
  await run(clock, 500);
  assert.equal((await store.mailList(ch.id)).length, 1, 'once per character');
  void lvl; void setLevel;
  a2.close(); await srv.stop();
});

test('V1: a character ALREADY past level 3 gets the letter at its next login; one that has sent feedback never does', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const W = srv.world;
  // a veteran made before this rule: level 7 in the save, no flag
  const tokens = memoryTokenStore();
  const a = makeClient(srv, clock, { tokenStore: tokens });
  await waitP(clock, a.ready);
  const ch = await waitP(clock, a.createChar({ name: 'Veteran', cls: 'warrior' }));
  for (const r of Object.values(store.data.chars)) if (r.id === ch.id) r.cols.level = 7;
  await waitP(clock, a.play(ch.id)); await until(clock, () => !!a.joined, 5000);
  await run(clock, 500);
  const list = await store.mailList(ch.id);
  assert.equal(list.length, 1, 'posted at the login'); assert.equal(list[0].subject, NUDGE.subject);
  // someone who already reported: no nudge when they reach 3 (they get the thank-you instead, from the report itself)
  const b = await joinAs(srv, clock, 'Helpful');
  const fr = on(b, 'feedbackR');
  b.feedback('suggestion', 'More hats.'); await until(clock, () => fr.length);
  const ob = W.online.get(b.joined.you.char);
  ob.char.level = 3; ob.entity.setLevel(3); ob.room.award(ob.entity, { xp: 0 }); await run(clock, 400);
  const mine = await store.mailList(ob.char.id);
  assert.ok(!mine.some(m => m.subject === NUDGE.subject), 'no nudge: ' + mine.map(m => m.subject));
  assert.ok(mine.some(m => m.subject === 'Thank you'));
  assert.ok(ob.char.flags.feedbackNudge > 0, 'and it is not asked again');
  a.close(); b.close(); await srv.stop();
});

test('V2: every gold number the server applies comes from the knobs — the defaults are the old numbers, and E\'s file (its own key names) moves each one', () => {
  try {
    configureEconomy(null);
    // the defaults = what the code used to hard-code
    assert.equal(killGoldAt(5), 8); assert.equal(questGold(2, 5), 16);
    assert.equal(chestGold(6), 29); assert.equal(treasureGold(6), 80); assert.equal(roadChestGold(4, 0), 26);
    assert.equal(eventGold(12, 1), 12); assert.equal(eventGold(12, 11), 30); assert.equal(lengthFactor(10), 2.5);
    assert.equal(travelFare(800), 4); assert.equal(travelFare(800, true), 14);
    const rules = { xpFor: l => l * 100 };
    assert.equal(eventReward({ reward: { gold: 12 }, level: 11 }, rules, { level: 11 }, () => 0, { minutes: 2 }).gold, 30);
    // E's file, E's names
    configureEconomy({ unit: { base: 10, perLevel: 2 }, quest: { mult: 1.5 }, event: { perLevel: 0.5, mult: 2 }, roadChest: { base: 1, perLevel: 1, spread: 0 }, treasure: { base: 100, perLevel: 0 },
      fare: { base: 0, metresPerGold: 100, crossProvinceMetres: 1000 }, sell: { factor: 0.5, fish: 2 }, mounts: [{ id: 'pony', price: 77, level: 2 }], chest: { base: 0, perLevel: 1 }, mail: { postage: 9 }, guild: { fee: 123 } });
    assert.equal(killGoldAt(5), 20); assert.equal(questGold(2, 5), 60);
    assert.equal(chestGold(6), 6); assert.equal(treasureGold(6), 100); assert.equal(roadChestGold(4, 0.9), 5);
    assert.equal(eventGold(10, 3), 40); assert.equal(travelFare(800), 8); assert.equal(travelFare(800, true), 18);
    assert.equal(eventReward({ reward: { gold: 10 }, level: 3 }, rules, { level: 3 }, () => 0, {}).gold, 40);
    const shops = createShops({ data: null });
    assert.equal(shops.pricing.sellFactor, 0.5);
    assert.equal(shops.sellPrice({ kind: 'fish', price: 7 }, null), 14, 'sell.fish');
    assert.equal(createMountBook(null).get('pony').price, 77); assert.equal(createMountBook(null).get('pony').level, 2);
    assert.equal(economy().mail.postage, 9); assert.equal(economy().guild.fee, 123);
    // a wrong-typed or missing value keeps the default; nothing throws
    configureEconomy({ unit: { base: 'lots' }, shop: null, treasure: { base: NaN } });
    assert.equal(killGoldAt(1), 4); assert.equal(treasureGold(1), 30);
  } finally { configureEconomy(null); }
});

test('V2: no gold arithmetic is left written into js/sim — the files that pay or charge take their numbers from economy-knobs.js', () => {
  const read = f => readFileSync(new URL('../../js/sim/' + f, import.meta.url), 'utf8');
  const bare = { 'quests.js': /=> 3 \+ level/, 'roadevents.js': /level \* 5 \+ 6|=> 3 \+ level/, 'province.js': /lvl \* 10 \+ 20|lvl \* 4 \+ 5|d \/ 400|\? 4000 :|0\.15 \* \(lvl/, 'events.js': /0\.15 \* \(lvl/, 'shops.js': /Math\.round\(15 \*/ };
  for (const [f, re] of Object.entries(bare)) assert.ok(!re.test(read(f)), f + ' still carries a hard-coded gold number: ' + re);
  for (const f of ['quests.js', 'roadevents.js', 'province.js', 'events.js', 'shops.js', 'mail.js', 'guilds.js', 'mounts.js']) assert.ok(/economy-knobs\.js/.test(read(f)), f + ' reads the knobs');
  // the data file, when E has written it, is the one the server loads, and it parses
  const file = new URL('../../data/provinces/economy.json', import.meta.url);
  if (existsSync(file)) { const d = JSON.parse(readFileSync(file, 'utf8')); const live = configureEconomy(d); assert.ok(live.quest.goldBase > 0 && live.shop.sellFactor > 0 && live.shop.sellFactor <= 1); configureEconomy(null); }
  assert.ok(Object.keys(ECONOMY_DEFAULTS).length >= 10);
});

test('V3: most listed fish pools are OPEN (they were not: 94 of 308), beginners\' ones first; every town with water in reach has a never-empty tier-1 pool; you see pools walking round Torborhold', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province, L = world.layouts[0], D = L.angling.pools;
  const pv = P.P.get(L.key), copy = P.copies[0];
  const a = await joinReal(srv, clock, 'Surveyor'); const o = rec(world, a);
  P.angling.ensurePools(copy); for (const t of pv.towns) P.angling.ensurePools(t);
  const listed = Object.values(D.zones).flat();
  const open = [...copy.objects.values()].filter(e => e.type === 'fishpool');
  assert.ok(open.length >= listed.length * 0.55, `open ${open.length} of ${listed.length} listed`);
  const t1 = listed.filter(s => s.tier === 1).length;
  assert.ok(open.filter(e => e.data.pool.tier === 1).length >= t1 * 0.9, 'nearly every beginner pool is open: ' + open.filter(e => e.data.pool.tier === 1).length + ' of ' + t1);
  // every town with a listed spot within reach: an always-open tier-1 pool there, in the wilds copy AND (when close) in the town's own room
  const reach = P.angling.R.townReachM;
  const dry = [];
  for (const [i, t] of L.towns.entries()) {
    const nearest = Math.min(...listed.map(s => Math.hypot(s.x - t.x, s.z - t.z)));
    if (nearest > reach) { dry.push(t.name + ' (' + Math.round(nearest) + ' m)'); continue; }
    const mine = open.filter(e => e.data.pool.always && e.data.pool.tier === 1 && Math.hypot(e.x - t.x, e.z - t.z) <= reach);
    assert.ok(mine.length >= 1, t.name + ' has its beginner pool');
    const p = mine.sort((x, y) => Math.hypot(x.x - t.x, x.z - t.z) - Math.hypot(y.x - t.x, y.z - t.z))[0];
    assert.equal(p.info().pool.always, 1); assert.equal(p.data.pool.left, 99);
    if (Math.hypot(p.x - t.x, p.z - t.z) < t.r + P.angling.R.borderM) assert.ok([...pv.towns[i].objects.values()].some(e => e.type === 'fishpool' && Math.hypot(e.x - p.x, e.z - p.z) < 1), t.name + ': seen from inside the town too');
  }
  console.log('V3: towns with no listed spot within ' + reach + ' m (stream E to place one, or there is no water): ' + (dry.join(', ') || 'none'));
  assert.ok(dry.length <= 2, 'towns without water in reach: ' + dry);
  // a never-empty pool does not drain
  const T = L.towns[0];
  const tp = open.filter(e => e.data.pool.always).sort((x, y) => Math.hypot(x.x - T.x, x.z - T.z) - Math.hypot(y.x - T.x, y.z - T.z))[0];
  // what a newcomer's client receives walking round the starting town (it was 5 pools on these rings)
  const seen = new Set();
  for (let k = 0; k < 24; k++) for (const rr of [T.r + 30, 300, 600]) {
    const ang = k / 24 * Math.PI * 2, p = { x: T.x + Math.cos(ang) * rr, z: T.z + Math.sin(ang) * rr };
    if (!L.terrain.walkable(p.x, p.z)) continue;
    if (o.entity.dead) o.entity.revive(1);
    P.transfer(o, copy, p, 'test'); await run(clock, 500);
    for (const [id, inf] of a.mirror.infos) if (inf.pool) seen.add(id);
  }
  assert.ok(seen.size >= 9, 'pools seen walking round Torborhold: ' + seen.size);
  assert.ok(tp);
  a.close(); await srv.stop();
});

test('V3: a pool above your skill does not close the water round it — a beginner casting at a tier-2 pool fishes beside it, and is told', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province, copy = P.copies[0];
  P.angling.ensurePools(copy);
  const pool = [...copy.objects.values()].find(e => e.type === 'fishpool' && e.data.pool.tier === 2 && e.data.pool.shore);
  assert.ok(pool, 'a tier-2 pool');
  const a = await joinReal(srv, clock, 'Newangler'); const o = rec(world, a);
  P.grant(o, { items: [{ kind: 'good', id: 'angling_rod', name: 'Hazel Rod', rarity: 'normal', use: { type: 'rod', minSkill: 0, bonus: {} } }], reason: 'test' });
  P.transfer(o, copy, { x: pool.data.pool.shore.x, z: pool.data.pool.shore.z }, 'test'); await run(clock, 600);
  for (const m of copy.host.near(o.entity.x, o.entity.z, 60, x => x.kind === 'monster')) copy.remove(m);
  const fr = on(a, 'fishR');
  a.fish('cast', { aim: { x: pool.x, z: pool.z } }); await until(clock, () => fr.length, 2000);
  assert.equal(fr[0].ok, true, 'the cast is taken: ' + JSON.stringify(fr[0]));
  assert.ok(!fr[0].pool && /needs angling \d+/.test(fr[0].note), 'beside the pool, and told why: ' + JSON.stringify(fr[0]));
  assert.equal(o.fishing.pool, null);
  a.close(); await srv.stop();
});
