// Round 11 (owner feedback 2026-10-15), the server half of stream UI's items, on the REAL rules:
//   #3 / #41  every character holds ONE recall charm — never sold, thrown away, traded or posted; reusable; shops offer it
//             only to someone with none; an old save's stack of one-use charms becomes one, the rest bought back
//   #11 / #42 the bag is three tabs: Equipment and Items each hold the bag's size, Other (unsellables) never fills
//   #15       saddle bags fit to your mounts (+12 in both tabs while you own one); a bought good sells back for half
//   #16 / #44 no free horse; a cheap Trail Horse at the stable; a dearer mount is faster; `mount {op:'pick'}` sets the slot
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';
import { tabOf, tabCounts, fitsIn, isKept, sellable } from '../../js/sim/bag-tabs.js';
import { createMountBook, DEFAULT_MOUNTS } from '../../js/sim/mounts.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ECON = JSON.parse(readFileSync(join(ROOT, 'data/provinces/economy.json'), 'utf8'));

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };
const junk = n => Array.from({ length: n }, (_, i) => ({ name: 'Pebble ' + i, rarity: 'normal', kind: 'junk', value: 1, price: 0 }));
const swords = n => Array.from({ length: n }, (_, i) => ({ name: 'Test Blade ' + i, rarity: 'normal', type: 'weapon', slot: 'weapon', level: 1 }));
const npcOf = (world, role) => { const town = world.P.values().next().value.towns[0]; return { town, npc: [...town.objects.values()].find(x => x.data && x.data.npc && x.data.npc.role === role) }; };

test('bag tabs (pure): what goes where, and each tab is counted on its own', () => {
  assert.equal(tabOf({ type: 'weapon', slot: 'weapon', name: 'Sword' }), 'gear');
  assert.equal(tabOf({ type: 'armor', slot: 'back', bagSlots: 6 }), 'gear');
  assert.equal(tabOf({ kind: 'material', id: 'copper_ore' }), 'items');
  assert.equal(tabOf({ kind: 'good', tool: true, use: { type: 'tool' } }), 'items', 'tools are Items');
  assert.equal(tabOf({ kind: 'fish' }), 'items');
  assert.equal(tabOf({ kind: 'potion', id: 'healing_potion' }), 'items');
  assert.equal(tabOf({ kind: 'good', id: 'recall_charm', use: { type: 'recall' } }), 'other');
  assert.equal(tabOf({ kind: 'good', id: 'road_parcel', quest: 'x', noSell: true }), 'other');
  assert.equal(tabOf({ kind: 'crate', rarity: 'rare' }), 'other');
  assert.equal(tabOf({ kind: 'good', id: 'cart_token' }), 'other');
  assert.ok(isKept({ id: 'recall_charm' }) && !sellable({ id: 'recall_charm' }) && sellable({ kind: 'junk' }));
  const bag = [...junk(3), ...swords(2), { kind: 'crate' }];
  assert.deepEqual(tabCounts(bag), { gear: 2, items: 3, other: 1 });
  assert.equal(fitsIn(bag, 3, [{ kind: 'junk' }]), false, 'Items is full at 3');
  assert.equal(fitsIn(bag, 3, [{ type: 'weapon', slot: 'weapon' }]), true, 'Equipment still has room');
  assert.equal(fitsIn(bag, 3, Array.from({ length: 50 }, () => ({ kind: 'crate' }))), true, 'Other never fills');
});

test('#16 / #44: no starter horse; the Trail Horse is cheap; price buys speed', () => {
  const book = createMountBook(null);
  assert.equal(book.grantStarter({ level: 30, mounts: [] }), false, 'nobody is given a mount');
  // the prices the game charges are economy.json's (E's knob file); the speeds are the mount table's
  const price = Object.fromEntries(ECON.mounts.map(m => [m.id, m.price]));
  const byPrice = book.list.filter(m => price[m.id] != null).sort((a, b) => price[a.id] - price[b.id]);
  for (let i = 1; i < byPrice.length; i++) assert.ok(byPrice[i].speed > byPrice[i - 1].speed, `${byPrice[i].id} costs more than ${byPrice[i - 1].id} and is faster`);
  const horse = book.get('trail_horse'), pony = book.get('pony');
  assert.ok(price.trail_horse <= price.pony / 5, `the Trail Horse (${price.trail_horse}) is well under the Moor Pony (${price.pony})`);
  for (const f of ['data/provinces/shops.json', 'data/provinces/vharlen-shops.json']) for (const k of Object.values(JSON.parse(readFileSync(join(ROOT, f), 'utf8')).kinds)) for (const g of k.goods || []) if (g.id === 'trail_horse') assert.equal(g.price, price.trail_horse, f + ': the stable row agrees');
  assert.notEqual(horse.speed, pony.speed);
  assert.equal(book.best({ mounts: ['trail_horse', 'pony'], mountPick: 'trail_horse' }).id, 'trail_horse', 'the picked one rides');
  assert.equal(book.best({ mounts: ['trail_horse', 'pony'] }).id, 'pony', 'no pick: the fastest');
  assert.ok(DEFAULT_MOUNTS.length >= 4);
});

test('#3 / #41: a recall charm at join; kept, reusable, never sold / thrown / traded; the shop hides it', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Charmholder', 'warrior');
  const o = rec(world, a);
  const charms = o.char.bag.filter(i => i.use && i.use.type === 'recall');
  assert.equal(charms.length, 1, 'exactly one charm');
  const charm = charms[0];
  assert.ok(charm.noSell && charm.noDrop && charm.keep, 'kept for good');
  assert.equal(tabOf(charm), 'other');
  assert.match(charm.desc, /never breaks/i, 'its card no longer says "one use"');
  assert.ok(a.joined.you.bag.some(i => i.uid === charm.uid), 'the client is told on join');
  const got = box(a, ['itemR', 'err', 'shopR', 'shopView', 'bag']);
  a.item('destroy', charm.uid); await run(clock, 200);
  assert.ok(o.char.bag.some(i => i.uid === charm.uid), 'not thrown away');
  assert.equal(got.find(m => m.t === 'itemR' && m.op === 'destroy').why, 'keep');
  // the general store: no charm on the shelf for someone who has one, and it will not buy it
  const { town, npc } = npcOf(world, 'merchant');
  assert.ok(npc, 'a merchant in town');
  world.transfer(o, town, { x: npc.x + 1, z: npc.z }, 'test'); await run(clock, 300);
  a.shop('open', { npc: npc.id }); await run(clock, 300);
  const v = got.filter(m => m.t === 'shopView').at(-1);
  assert.ok(v, 'the shop opened');
  assert.ok(!v.stock.some(r => r.item && r.item.use && r.item.use.type === 'recall'), 'no recall charm for sale to a holder');
  assert.ok(!(v.sell || []).some(r => r.uid === charm.uid), 'not on the Sell list');
  a.shop('sell', { npc: npc.id, uid: charm.uid }); await run(clock, 200);
  assert.equal(got.filter(m => m.t === 'shopR').at(-1).why, 'keep');
  assert.ok(o.char.bag.some(i => i.uid === charm.uid));
  // someone without one is offered it
  o.char.bag = o.char.bag.filter(i => i.uid !== charm.uid);
  a.shop('open', { npc: npc.id }); await run(clock, 300);
  assert.ok(got.filter(m => m.t === 'shopView').at(-1).stock.some(r => r.item && r.item.use && r.item.use.type === 'recall'), 'offered when you have none');
  a.close(); await srv.stop();
});

test('#3: an old save holding several one-use charms keeps one and is paid for the rest', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Hoarder', 'warrior');
  const o = rec(world, a);
  const charm = o.char.bag.find(i => i.use && i.use.type === 'recall');
  const old = { ...charm, count: 3, keep: undefined, noSell: undefined, noDrop: undefined, uid: 'old1', shopPrice: 25 };
  o.char.bag = o.char.bag.filter(i => i !== charm).concat([old, { ...old, uid: 'old2', count: 1 }]);
  const g0 = o.char.gold || 0;
  world.keepsakesForTest?.(o);
  if (!world.keepsakesForTest) { a.close(); await srv.stop(); return; }
  const left = o.char.bag.filter(i => i.use && i.use.type === 'recall');
  assert.equal(left.length, 1); assert.equal(left[0].count, 1); assert.ok(left[0].keep);
  assert.equal(o.char.gold - g0, 3 * 12, 'three spares bought back at half of 25');
  a.close(); await srv.stop();
});

test('#11: Equipment and Items each hold the bag size; Other never fills', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Tabber', 'warrior');
  const o = rec(world, a);
  const cap = a.joined.you.bagMax;
  o.char.bag = o.char.bag.filter(i => tabOf(i) === 'other');
  world.grant(o, { items: junk(cap), gold: 0, reason: 'test' }); await run(clock, 100);
  assert.equal(tabCounts(o.char.bag).items, cap, 'Items full');
  const g0 = o.char.gold;
  world.grant(o, { items: swords(3), gold: 0, reason: 'test' }); await run(clock, 100);
  assert.equal(tabCounts(o.char.bag).gear, 3, 'Equipment still takes gear with Items full');
  world.grant(o, { items: [{ kind: 'crate', name: 'Test crate', rarity: 'rare', crate: true }], gold: 0, reason: 'test' }); await run(clock, 100);
  assert.equal(tabCounts(o.char.bag).other, 2, 'Other takes a reward box (and holds the charm)');
  world.grant(o, { items: junk(1), gold: 0, reason: 'test' }); await run(clock, 100);
  assert.equal(tabCounts(o.char.bag).items, cap, 'one more ore does not fit Items');
  // round 11 (Market stream, owner #25): it is POSTED to you, never turned into gold
  assert.equal(o.char.gold, g0, 'not paid in gold any more (the old overflow rule)');
  assert.ok(world.counters.bagPosted >= 1, 'it went to the post');
  a.close(); await srv.stop();
});

test('#15 / #16 / #44: buy the cheap horse, fit saddle bags, pick a mount; a bought good sells back for half', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Rider', 'warrior');
  const o = rec(world, a);
  assert.deepEqual(o.char.mounts || [], [], 'no free horse');
  assert.equal(a.joined.you.mountPick, null);
  const got = box(a, ['shopView', 'shopR', 'you', 'itemR', 'mountR', 'bag']);
  o.char.gold = 5000; o.char.level = 6;
  const { town, npc } = npcOf(world, 'stablemaster').npc ? npcOf(world, 'stablemaster') : npcOf(world, 'stablehand');
  assert.ok(npc, 'a stable in town');
  world.transfer(o, town, { x: npc.x + 1, z: npc.z }, 'test'); await run(clock, 300);
  a.shop('open', { npc: npc.id }); await run(clock, 300);
  const v = got.filter(m => m.t === 'shopView').at(-1);
  const horse = v.stock.find(r => r.mount && r.mount.id === 'trail_horse'), pony = v.stock.find(r => r.mount && r.mount.id === 'pony');
  assert.ok(horse && pony, 'both on sale');
  assert.equal(horse.price, 120, 'the Trail Horse is cheap');
  const saddle = v.stock.find(r => r.item && r.item.use && r.item.use.type === 'bag');
  assert.ok(saddle, 'saddle bags on sale');
  // saddle bags first (no mount yet): fitted, slots wait for a mount
  a.shop('buy', { npc: npc.id, id: saddle.id }); await run(clock, 300);
  const sb = o.char.bag.find(i => i.use && i.use.type === 'bag');
  assert.ok(sb, 'bought');
  assert.equal(world.shops.sellPrice(sb, o.room.rules), Math.floor(saddle.price * 0.5), 'a bought good sells back for half (not 1 gold)');
  const cap0 = (await (async () => got.filter(m => m.t === 'you' && m.bagMax).at(-1)?.bagMax)()) || a.joined.you.bagMax;
  a.item('use', sb.uid); await run(clock, 300);
  assert.ok(!o.char.bag.some(i => i.uid === sb.uid), 'fitted: gone from the bag');
  assert.equal(o.char.saddle && o.char.saddle.slots, 12);
  assert.equal(world.bagCap(o), cap0, 'no mount yet: no extra squares');
  a.shop('open', { npc: npc.id }); await run(clock, 300);
  assert.ok(!got.filter(m => m.t === 'shopView').at(-1).stock.some(r => r.item && r.item.use && r.item.use.type === 'bag'), 'not offered again');
  a.shop('buy', { npc: npc.id, id: horse.id }); await run(clock, 300);
  assert.deepEqual(o.char.mounts, ['trail_horse']);
  assert.equal(world.bagCap(o), cap0 + 12, 'a mount wakes the saddle bags');
  assert.equal(got.filter(m => m.t === 'you' && m.bagMax).at(-1).bagMax, cap0 + 12, 'the client is told');
  o.char.level = 6;      // (the move into town re-reads the level from the body)
  a.shop('buy', { npc: npc.id, id: pony.id }); await run(clock, 300);
  assert.deepEqual(o.char.mounts.slice().sort(), ['pony', 'trail_horse']);
  a.mount('pick', { id: 'trail_horse' }); await run(clock, 200);
  assert.equal(o.char.mountPick, 'trail_horse');
  assert.equal(got.filter(m => m.t === 'you' && 'mountPick' in m).at(-1).mountPick, 'trail_horse');
  a.mount('pick', { id: 'courser' }); await run(clock, 200);
  assert.equal(got.filter(m => m.t === 'mountR' && m.op === 'pick').at(-1).ok, false, 'cannot pick one you do not own');
  a.close(); await srv.stop();
});

test('#41: the recall charm works again and again — it is never used up', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Recaller', 'warrior');
  const o = rec(world, a);
  const got = box(a, ['itemR', 'joined']);
  const charm = o.char.bag.find(i => i.use && i.use.type === 'recall');
  const pv = world.P.values().next().value, wilds = pv.copies[0], t0 = pv.towns[0];
  for (let k = 0; k < 2; k++) {
    world.transfer(o, wilds, { x: o.entity.x + 30, z: o.entity.z + 170 }, 'test'); await run(clock, 400);
    assert.equal(o.room.kind, 'wilds');
    for (const m of [...wilds.entities.values()]) if (m.kind === 'monster' && Math.hypot(m.x - o.entity.x, m.z - o.entity.z) < 90) wilds.remove(m);      // a quiet spot: a hit breaks the channel
    a.item('use', charm.uid); await run(clock, 300);
    const r = got.filter(m => m.t === 'itemR' && m.op === 'use').at(-1);
    assert.equal(r.ok, true, 'the channel starts: ' + JSON.stringify(r));
    await run(clock, 6500);
    assert.ok(o.char.bag.some(i => i.uid === charm.uid && (i.count || 1) === 1), `still there after recall ${k + 1}`);
    assert.equal(o.room.kind, 'town', 'the recall took you home');
  }
  a.close(); await srv.stop();
});
