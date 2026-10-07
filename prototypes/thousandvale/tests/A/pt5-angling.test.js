// Play-test 5 (stream A) — T25 ANGLING on the real province: C's rules (js/rules/fishing.js), E's fish, pools and quests.
//   cast -> bite -> hook -> tug -> land; too early / too late; pools open per zone, drain and move; the skill, the catch
//   journal and the save; E's first quest (the rod is handed over on accept, `catch` steps count pool catches); cooking at
//   a campfire into a meal the food code eats; fish sell for their own price; a line reels in when you walk off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';
import { loadAll } from './helpers.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };

/** Find E's starting pool (always open) and the room that holds it. */
function startPool(world) {
  const P = world.province, L = world.layouts[0];
  const spots = Object.values(L.angling.pools.zones).flat();
  const s = spots.find(x => x.start) || spots[0];
  const ti = L.towns.findIndex(t => Math.hypot(s.x - t.x, s.z - t.z) < t.r);
  const room = ti >= 0 ? P.P.get(L.key).towns[ti] : P.copies[0];
  return { s, room };
}
/** One whole cast: wait for the bite, hook, play the tug perfectly, land. Returns the fishCatch (or the refusal). */
async function castOnce(a, clock, { held = 1, aim = null } = {}) {
  const fr = on(a, 'fishR'), bite = on(a, 'fishBite'), tug = on(a, 'fishTug'), got = on(a, 'fishCatch');
  a.fish('cast', aim ? { aim } : {});
  await until(clock, () => fr.length, 2000);
  if (!fr[0] || !fr[0].ok) return { refused: fr[0] };
  assert.equal(fr[0].state, 'wait');
  assert.ok(await until(clock, () => bite.length, 12000), 'a bite within 2-9 s');
  assert.ok(bite[0].ms >= 1000 && bite[0].ms <= 2500);
  a.fish('hook');
  await until(clock, () => tug.length || got.length, 2000);
  if (tug.length) {
    const t = tug[0];
    assert.ok(t.ms >= 2500 && t.ms <= 6500 && t.band > 0 && t.need > 0 && t.need < 1 && typeof t.hint === 'string', 'a tug to play: ' + JSON.stringify(t));
    await run(clock, t.ms);
    a.fish('land', { held });
    await until(clock, () => got.length, 2000);
  }
  return { cast: fr[0], tug: tug[0] || null, catch: got[0] };
}

test('T25 data reaches the server: C\'s numbers, E\'s fish, legends, recipes and pool spots; pools open in the copy (the start pool always)', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const L = world.layouts[0], A = world.province.angling;
  assert.ok(L.angling && L.angling.numbers && L.angling.content.fish.length >= 30 && L.angling.content.recipes.length >= 5, 'angling data on the layout');
  assert.ok(A.F, 'the fishing rules are booted');
  const { s, room } = startPool(world);
  const a = await joinReal(srv, clock, 'Poolfinder');
  const o = rec(world, a);
  world.province.transfer(o, room, { x: s.shore.x, z: s.shore.z }, 'test');
  await run(clock, 1500);
  const pools = [...room.objects.values()].filter(e => e.type === 'fishpool');
  assert.ok(pools.length >= 1, 'pools are open');
  const mine = pools.find(e => Math.hypot(e.x - s.x, e.z - s.z) < 1);
  assert.ok(mine, 'the start pool is one of them');
  const info = a.mirror.infos.get(mine.id);
  assert.ok(info && info.pool && info.pool.tier === 1 && info.pool.left > 0 && info.pool.water, 'info.pool for the client: ' + JSON.stringify(info));
  // a wilds copy opens `live` pools per zone, not every listed spot
  const copy = world.province.copies[0];
  world.province.angling.ensurePools(copy);
  const open = [...copy.objects.values()].filter(e => e.type === 'fishpool').length;
  const listed = Object.values(L.angling.pools.zones).flat().length;
  assert.ok(open >= 10 && open < listed, `some of the ${listed} listed spots are open: ${open}`);
  a.close(); await srv.stop();
});

test('T25 the loop: no rod = refused; E\'s first quest hands over the rod; cast, bite, hook, tug, land; the journal, the skill and the quest count; too early and too late lose the fish', async () => {
  const { srv, clock, world, store } = await realServer({ roadEvents: false });
  const P = world.province;
  const { s, room } = startPool(world);
  const a = await joinReal(srv, clock, 'Firstcast');
  const o = rec(world, a);
  P.devSetLevel(o.char.id, 20);
  P.transfer(o, room, { x: s.shore.x, z: s.shore.z }, 'test');
  await run(clock, 1200);
  // no rod yet
  let r = await castOnce(a, clock);
  assert.ok(r.refused && r.refused.why === 'noRod', JSON.stringify(r.refused));
  // Tam Sedgeley's first quest: accept -> the rod is in the bag (E's `grant`)
  const tam = [...P.rooms.values()].flatMap(rm => [...rm.objects.values()].map(e => ({ e, rm }))).find(x => x.e.data && x.e.data.npc && x.e.data.npc.id === 'angler_torborhold');
  let questing = false;
  if (tam) {
    P.transfer(o, tam.rm, { x: tam.e.x + 1.5, z: tam.e.z }, 'test');
    await run(clock, 600);
    const qr = on(a, 'questR');
    a.quest('accept', 'angle_first_cast', tam.e.id);
    await until(clock, () => qr.length, 2000);
    questing = !!(qr[0] && qr[0].ok);
    assert.ok(questing, 'the angler gives the quest: ' + JSON.stringify(qr[0]));
    await run(clock, 300);
    assert.ok(o.char.bag.some(i => i.id === 'angling_rod'), 'the rod was handed over on accept');
    P.transfer(o, room, { x: s.shore.x, z: s.shore.z }, 'test');
    await run(clock, 600);
  } else P.grant(o, { items: [P.rooms.values().next().value && { kind: 'good', id: 'angling_rod', name: 'Hazel Rod', rarity: 'normal', use: { type: 'rod', minSkill: 0, bonus: {} } }], reason: 'test' });
  assert.ok(o.char.bag.some(i => i.id === 'angling_rod'));
  // too early: pull before the float dips
  const fr = on(a, 'fishR');
  a.fish('cast'); await until(clock, () => fr.length);
  assert.equal(fr[0].ok, true, JSON.stringify(fr[0]));
  assert.ok(fr[0].pool, 'standing by the pool: the cast lands in it');
  assert.ok(o.entity.fishing && Number.isFinite(o.entity.fishing.x), 'info.fishing while the line is out');
  await run(clock, 300);
  a.fish('hook'); await until(clock, () => fr.length >= 2);
  assert.equal(fr[1].ok, false); assert.equal(fr[1].why, 'early');
  assert.equal(o.entity.fishing, null, 'the line is in');
  // too late: never answer the bite
  const bites = on(a, 'fishBite');
  a.fish('cast'); await until(clock, () => bites.length, 12000);
  await run(clock, bites[0].ms + 1500);
  assert.ok(fr.some(m => m.why === 'late'), 'it took the bait and left');
  // a played tug that fails (the marker never in the band): lost, nothing in the bag
  let lost = null;
  for (let k = 0; k < 12 && !lost; k++) { const x = await castOnce(a, clock, { held: 0 }); if (x.tug && x.catch && x.catch.lost) lost = x.catch; }
  assert.ok(lost && lost.ok === false && lost.lost === true && lost.msg, 'a lost fish says so');
  const bagBefore = o.char.bag.filter(i => i.kind === 'fish').length;
  // now fish properly until three fish are on the bank
  const kinds = {};
  let fishN = 0, first = null, sawSkill = null;
  for (let k = 0; k < 40 && fishN < 3; k++) {
    if (o.entity.dead) { o.entity.revive(1); }
    const x = await castOnce(a, clock, { held: 1 });
    if (x.refused) { assert.fail('refused: ' + JSON.stringify(x.refused)); }
    const c = x.catch;
    assert.ok(c, 'a catch message');
    kinds[c.kind] = (kinds[c.kind] || 0) + 1;
    if (c.kind === 'fish' || c.kind === 'legend') {
      fishN++; first ||= c;
      assert.ok(c.ok && c.item && c.item.kind === 'fish' && c.species && c.species.id && c.size > 0 && c.skill && c.skill.level >= 1, JSON.stringify(c).slice(0, 300));
      sawSkill = c.skill;
    }
    if (c.kind === 'monster') { for (const m of room.entities.values()) if (m.kind === 'monster' && m.data && m.data.fished) room.remove(m); o.lastHitAt = 0; await run(clock, 6000); }
  }
  assert.equal(fishN, 3, 'three fish landed: ' + JSON.stringify(kinds));
  assert.equal(first.first, true, 'the first of a species is marked');
  assert.equal(o.char.bag.filter(i => i.kind === 'fish').length, bagBefore + 3);
  const A = o.char.angling;
  assert.ok(A.xp > 0 && A.casts >= 3 && Object.keys(A.catches).length >= 1, JSON.stringify(A));
  const rec1 = A.catches[first.species.id];
  assert.ok(rec1.n >= 1 && rec1.best > 0 && rec1.zone, 'species record: count, biggest, where');
  assert.equal(a.joined.you.angling.xp, A.xp, 'you.angling follows');
  assert.ok(sawSkill.next > sawSkill.xp || sawSkill.next === null);
  // the quest counted pool catches (E's `catch {pool:true, count:3}`)
  if (questing) {
    const q = o.char.quests.active.angle_first_cast;
    assert.ok(q && q.step >= 2, 'visit the pool + 3 pool catches done: ' + JSON.stringify(q));
  }
  // walking off reels the line in
  const fr2 = on(a, 'fishR');
  a.fish('cast'); await until(clock, () => fr2.length);
  P.transfer(o, room, { x: s.shore.x + 6, z: s.shore.z + 6 }, 'test');
  await until(clock, () => fr2.some(m => m.state === 'idle' && m.why === 'moved'), 2000);
  assert.ok(fr2.some(m => m.why === 'moved'), 'moved: ' + JSON.stringify(fr2));
  // saved
  await P.saveNow(o); await P.flushJournal();
  const saved = loadAll(store).find(c => c.id === o.char.id);
  assert.equal(saved.angling.xp, A.xp); assert.ok(saved.angling.catches[first.species.id]);
  a.close(); await srv.stop();
});

test('T25 pools drain and move; open water works too; a fish sells for its own price', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false, anglingOpts: { poolRespawnMs: [1000, 1000] } });
  const P = world.province, L = world.layouts[0];
  const copy = P.copies[0];
  P.angling.ensurePools(copy);
  const pool = [...copy.objects.values()].find(e => e.type === 'fishpool' && e.data.pool.tier === 1 && !e.data.pool.always && e.data.pool.shore);
  assert.ok(pool, 'an ordinary tier-1 pool in the wilds');
  const a = await joinReal(srv, clock, 'Poolhopper');
  const o = rec(world, a);
  P.devSetLevel(o.char.id, 30);
  P.grant(o, { items: [{ kind: 'good', id: 'angling_rod', name: 'Hazel Rod', rarity: 'normal', use: { type: 'rod', minSkill: 0, bonus: {} } }], reason: 'test' });
  const sh = pool.data.pool.shore;
  P.transfer(o, copy, { x: sh.x, z: sh.z }, 'test');
  await run(clock, 800);
  const left0 = pool.data.pool.left, zone = pool.data.pool.zone;
  const openBefore = [...copy.objects.values()].filter(e => e.type === 'fishpool' && e.data.pool.zone === zone).length;
  let lastLeft = left0, drained = false;
  for (let k = 0; k < 60 && !drained; k++) {
    if (o.entity.dead) o.entity.revive(1);
    o.lastHitAt = 0;
    for (const m of copy.host.near(o.entity.x, o.entity.z, 40, x => x.kind === 'monster')) copy.remove(m);
    const x = await castOnce(a, clock, { held: 1 });
    if (x.refused) break;
    const c = x.catch;
    if (c && c.pool) { assert.ok(c.pool.left <= lastLeft, 'the pool counts down'); lastLeft = c.pool.left; if (c.pool.left === 0) drained = true; }
  }
  assert.ok(drained, `the pool was fished out (${left0} catches)`);
  await run(clock, 5000);
  assert.ok(pool.removed, 'the fished-out pool is gone');
  const openAfter = [...copy.objects.values()].filter(e => e.type === 'fishpool' && e.data.pool.zone === zone).length;
  assert.equal(openAfter, openBefore, 'another spot of the zone opened in its place');
  // open water: the same bank, no pool now -> the cast still lands in water (aim at where the pool was)
  const x = await castOnce(a, clock, { held: 1, aim: { x: pool.x, z: pool.z } });
  assert.ok(!x.refused, 'any water works: ' + JSON.stringify(x.refused));
  assert.ok(!x.cast.pool && x.cast.water, 'open water, of a kind: ' + JSON.stringify(x.cast));
  // selling: E's price, scaled by size by C — never the gear formula
  const fish = o.char.bag.find(i => i.kind === 'fish');
  assert.ok(fish && Number.isFinite(fish.price));
  const { createShops } = await import('../../js/sim/shops.js');
  const shops = createShops({ data: L.shops });
  assert.equal(shops.sellPrice(fish, null), Math.max(0, Math.round(fish.price)));
  assert.ok(shops.goodOf('angling_rod') && shops.goodOf('angling_rod').use.type === 'rod');
  a.close(); await srv.stop();
});

test('T25 cooking: a campfire, E\'s recipe, fish out and a meal in; the meal is food the existing code eats (you sit down); no fire = no cooking', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province, L = world.layouts[0];
  const a = await joinReal(srv, clock, 'Cookfish');
  const o = rec(world, a);
  const copy = P.copies[0];
  const T = L.towns[0], gd = Math.hypot(L.gate.x - T.x, L.gate.z - T.z) || 1;       // out of the gate, well clear of the town circle
  P.transfer(o, copy, { x: L.gate.x + (L.gate.x - T.x) / gd * 90, z: L.gate.z + (L.gate.z - T.z) / gd * 90 }, 'test');
  await run(clock, 500);
  assert.equal(o.room.kind, 'wilds');
  for (const m of copy.host.near(o.entity.x, o.entity.z, 80, x => x.kind === 'monster')) copy.remove(m);
  const F = P.angling.F;
  const sp = L.angling.content.fish.find(f => f.rarity === 'common');
  const mk = () => { const it = F.item({ kind: 'fish', id: sp.id, name: sp.name, rarity: 'common', size: 20, price: 2 }); it.stack = 1; return it; };
  P.grant(o, { items: [mk(), mk(), mk()], reason: 'test' });
  await run(clock, 200);
  const lists = on(a, 'cookList'), cr = on(a, 'cookR');
  a.cook(); await until(clock, () => lists.length);
  assert.equal(lists[0].fire, false, 'no fire here');
  const stick = lists[0].recipes.find(r => r.id === 'cook_fish_on_a_stick') || lists[0].recipes.find(r => r.can);
  assert.ok(stick && stick.can && stick.needs[0].have === 3 && stick.makes.name, JSON.stringify(stick));
  a.cook(stick.id); await until(clock, () => cr.length);
  assert.equal(cr[0].ok, false); assert.equal(cr[0].why, 'fire');
  // light a fire and cook two
  const used = on(a, 'used');
  a.campfire(); await until(clock, () => used.length);
  await run(clock, 300);
  const fire = [...copy.objects.values()].find(e => e.type === 'campfire');
  a.use(fire.id); await until(clock, () => used.length >= 2);
  assert.equal(used[1].cook, true, 'using the fire offers cooking');
  a.cook(stick.id, 2); await until(clock, () => cr.length >= 2);
  assert.equal(cr[1].ok, true, JSON.stringify(cr[1]));
  assert.equal(cr[1].n, 2); assert.equal(cr[1].item.count, 2, 'two meals, one stack (play-test 6 U5)');
  assert.equal(o.char.bag.filter(i => i.kind === 'fish').length, 1, 'two fish went in the pan');
  const meal = o.char.bag.find(i => i.cooked);
  assert.ok(meal && meal.kind === 'good' && meal.use && meal.use.type === 'food', JSON.stringify(meal));
  // eat it: the existing meal code
  o.entity.setHp(Math.round(o.entity.hpMax * 0.5)); if (o.entity.r && o.entity.r.unit) o.entity.r.unit.hp = Math.round(o.entity.r.unit.maxHp * 0.5);
  const ir = on(a, 'itemR');
  a.useItem(meal.uid); await until(clock, () => ir.length);
  assert.equal(ir[0].ok, true, JSON.stringify(ir[0])); assert.equal(ir[0].sit, true);
  a.close(); await srv.stop();
});

test('T25 the other outcomes: a sunken CRATE (the T9 crate, opened like any), the zone\'s LEGEND (trophy + title, once), and "something pulls back" (a monster climbs out)', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province, L = world.layouts[0];
  const { s, room } = startPool(world);
  const a = await joinReal(srv, clock, 'Deepline');
  const o = rec(world, a);
  P.devSetLevel(o.char.id, 25);
  P.grant(o, { items: [{ kind: 'good', id: 'angling_rod', name: 'Hazel Rod', rarity: 'normal', use: { type: 'rod', minSkill: 0, bonus: {} } }], reason: 'test' });
  P.transfer(o, room, { x: s.shore.x, z: s.shore.z }, 'test');
  await run(clock, 1000);
  const F = P.angling.F, realRoll = F.roll;
  // a crate
  F.roll = () => ({ kind: 'crate', id: 'sunken_crate', name: 'Sunken Crate', rarity: 'uncommon', price: 0, seed: 7, say: 'A sunken crate!', crate: { slot: 'any', min: 'uncommon' } });
  let x = await castOnce(a, clock);
  assert.equal(x.catch.kind, 'crate'); assert.ok(x.tug && x.tug.heft === 'heavy', 'a crate is a heavy, easy tug');
  const crate = o.char.bag.find(i => i.kind === 'crate');
  assert.ok(crate && crate.crate, 'the crate is in the bag');
  const ir = on(a, 'itemR');
  a.openItem(crate.uid); await until(clock, () => ir.length);
  assert.equal(ir[0].ok, true, JSON.stringify(ir[0]));
  assert.ok(ir[0].opened.item && ir[0].opened.from === 'crate' && ir[0].opened.item.rarity !== 'normal', 'uncommon or better inside: ' + JSON.stringify(ir[0].opened.item && ir[0].opened.item.rarity));
  // the legend of this zone
  const lg = L.angling.content.legends[0];
  F.roll = () => ({ kind: 'legend', id: lg.id, name: lg.name, desc: lg.desc, rarity: 'epic', size: 140, price: 120, skill: lg.skill, seed: 9, legend: true, title: lg.title, trophy: lg.trophy });
  x = await castOnce(a, clock);
  assert.equal(x.catch.kind, 'legend'); assert.equal(x.catch.title, lg.title);
  assert.ok(x.catch.species.legend && x.tug.rarity === 'legend', 'the hardest tug');
  assert.ok(o.char.bag.some(i => i.kind === 'trophy' && i.name === lg.trophy.name), 'the trophy');
  assert.deepEqual(o.char.angling.legends, [lg.id]); assert.deepEqual(o.char.angling.titles, [lg.title]);
  assert.deepEqual(a.joined.you.angling.titles, [lg.title]);
  // something pulls back
  F.roll = () => ({ kind: 'monster', id: 'reed_serpent', rarity: null, price: 0, seed: 3, say: 'Something pulls back.', monster: { type: 'reed_serpent' } });
  x = await castOnce(a, clock);
  assert.equal(x.catch.kind, 'monster'); assert.ok(x.catch.monsterId > 0 && !x.tug, 'no tug: it comes for you');
  const m = room.entities.get(x.catch.monsterId);
  assert.ok(m && m.kind === 'monster' && m.type === 'reed_serpent' && Math.hypot(m.x - o.entity.x, m.z - o.entity.z) < 8, 'it climbed out next to me');
  assert.equal(o.fishing, null);
  F.roll = realRoll;
  // the real roll never hands a level-1 angler a fish above its skill, and a tier-2 pool is gated
  for (let k = 0; k < 200; k++) {
    const c = realRoll({ water: 'river', band: [1, 5], time: 'day', skill: 1, zone: 'test', pool: null, rng: () => Math.random() });
    if (c.kind === 'fish') assert.ok((c.skill || 0) <= 1, c.id + ' needs ' + c.skill);
  }
  assert.equal(F.canFish({ skill: 1, pool: { tier: 2 }, rod: { id: 'angling_rod', minSkill: 0 } }).ok, false);
  a.close(); await srv.stop();
});
