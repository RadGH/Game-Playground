// Play-test 4 S3 (stream A): "Wands & rods" sold as a 15 g thing that took the gold and gave nothing.
// Root cause: the shop's stock is cached per shop per level bracket and SHARED; grant() marks what it hands out
// `_granted`, and buy handed it the row's own item — so the first buy worked and every later buy of that row (by
// anyone) took the gold and gave nothing. Plus: a category is a filter, never a product; and the one-off refund.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';
import { makeClient, until, waitP } from './helpers.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { createShops, isProduct } from '../../js/sim/shops.js';

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };

test('S3: buying the same row again (and by a second player) always gives the item; gold matches what landed', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Wandbuyer', 'mage'), b = await joinReal(srv, clock, 'Secondbuyer', 'priest');
  const town = world.P.values().next().value.towns[0];
  const apo = [...town.objects.values()].find(x => x.data && x.data.npc && x.data.npc.role === 'apothecary');
  assert.ok(apo, 'an apothecary in Torborhold');
  for (const c of [a, b]) { const o = rec(world, c); world.transfer(o, town, { x: apo.x + 1, z: apo.z }, 'test'); o.char.gold = 10000; }
  await run(clock, 400);
  const ga = box(a, ['shopView', 'shopR']), gb = box(b, ['shopView', 'shopR']);
  a.shop('open', { npc: apo.id }); b.shop('open', { npc: apo.id }); await run(clock, 300);
  const v = ga.find(x => x.t === 'shopView');
  const wand = v.stock.find(r => r.cat === 'weapon');
  assert.ok(wand, 'a wand row');
  assert.notEqual(wand.item.name, wand.label, 'the row is an item, not its category label');
  for (const [c, n] of [[a, 3], [b, 2]]) {
    const o = rec(world, c), bag0 = o.char.bag.length, g0 = o.char.gold;
    for (let i = 0; i < n; i++) { c.shop('buy', { npc: apo.id, id: wand.id }); await run(clock, 250); }
    assert.equal(o.char.bag.length, bag0 + n, 'every buy landed an item');
    assert.equal(o.char.gold, g0 - n * wand.price, 'paid for exactly what landed');
    const got = o.char.bag.slice(-n);
    assert.ok(got.every(it => it.name === wand.item.name && !it._granted), 'the wand each time');
    assert.equal(new Set(got.map(it => it.uid)).size, n, 'fresh uids');
  }
  assert.ok(!gb.some(x => x.t === 'shopR' && x.ok === false), 'no refusals for the second buyer');
  a.close(); b.close(); await srv.stop();
});

test('S3: every row of every shop kind, at every level, is a real named item or a mount (no category-as-product)', async () => {
  const { srv, clock, world } = await realServer();
  const P = world.P.values().next().value;
  const a = await joinReal(srv, clock, 'Browser', 'warrior');
  const o = rec(world, a), rules = o.room.rules;
  const S = createShops({ data: P.L.shops, rng: Math.random });
  let n = 0;
  for (const [kid, k] of Object.entries(S.kinds)) for (let lv = 1; lv <= 20; lv += 3) {
    o.char.level = lv; S.cache.clear();
    for (const r of S.stock({ id: 1, data: { key: 'k' + kid, npc: { role: k.role, shop: kid } } }, o.entity, rules, 'Torborhold')) {
      n++; assert.ok(isProduct(r), kid + ' L' + lv + ' row ' + r.id + ' is not a product: ' + JSON.stringify(r).slice(0, 160));
    }
  }
  assert.ok(n > 500, 'rows checked ' + n);
  assert.equal(isProduct({ id: 's0', cat: 'weapon', label: 'Wands & rods', item: { name: 'Wands & rods' }, price: 15 }), false, 'a label is not a product');
  assert.equal(isProduct({ id: 's0', cat: 'weapon', label: 'Wands & rods', price: 15 }), false);
  a.close(); await srv.stop();
});

test('S3: a buy that cannot land refunds on the spot; the one-off refund pays once', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Refundee', 'mage');
  const o = rec(world, a);
  const town = world.P.values().next().value.towns[0];
  const apo = [...town.objects.values()].find(x => x.data && x.data.npc && x.data.npc.role === 'apothecary');
  world.transfer(o, town, { x: apo.x + 1, z: apo.z }, 'test'); await run(clock, 300);
  o.char.gold = 500;
  const g = box(a, ['shopView', 'shopR']);
  a.shop('open', { npc: apo.id }); await run(clock, 300);
  // poison the cached row the old way: an item already marked handed out
  const row = o.shopAt.stock.find(r => r.cat === 'weapon');
  row.item._granted = true;
  a.shop('buy', { npc: apo.id, id: row.id }); await run(clock, 300);
  assert.equal(o.char.gold, 500 - row.price, 'the copy is granted even when the cached row was marked');
  row.item.name = '';                                          // an unnamed (broken) row: refused + refunded
  const bag = o.char.bag.length;
  a.shop('buy', { npc: apo.id, id: row.id }); await run(clock, 300);
  assert.equal(o.char.gold, 500 - row.price, 'refunded'); assert.equal(o.char.bag.length, bag);
  assert.ok(g.some(x => x.t === 'shopR' && x.ok === false && x.refund === row.price));
  a.close(); await srv.stop();
});

test('S3: the one-off refund (data/provinces/refunds.json) pays once, matched on id AND name', async () => {
  const { srv, clock, world } = await realServer({ lingerMs: 0 });
  const tok = memoryTokenStore();
  const c = makeClient(srv, clock, { tokenStore: tok }); await waitP(clock, c.ready);
  const ch = await waitP(clock, c.createChar({ name: 'Tillcheck', cls: 'mage' }));
  const L = world.P.values().next().value.L;
  const saved = L.refunds;
  L.refunds = { list: [{ key: 't1', char: ch.id, name: 'Tillcheck', gold: 60, msg: 'till' }, { key: 't2', char: ch.id, name: 'Somebody Else', gold: 999 }] };
  const play = async () => { const k = makeClient(srv, clock, { tokenStore: memoryTokenStore(tok.get()) }); await waitP(clock, k.ready); const said = []; k.on('chat', m => said.push(m)); k.play(ch.id); await until(clock, () => !!k.joined, 5000); await run(clock, 500); return { k, said }; };
  const g0 = 0;
  let { k, said } = await play();
  const o = rec(world, k);
  const gold1 = o.char.gold;
  assert.ok(said.some(m => m.ch === 'system' && m.text === 'till'), 'told');
  assert.ok(o.char.flags.refunds.t1 && !o.char.flags.refunds.t2, 'name must match');
  k.close(); await run(clock, 3000);
  ({ k, said } = await play());
  assert.equal(rec(world, k).char.gold, gold1, 'not paid twice');
  assert.ok(gold1 >= g0 + 60);
  L.refunds = saved;
  k.close(); c.close(); await srv.stop();
});
