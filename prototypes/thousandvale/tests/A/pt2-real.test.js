// Play-test 2 (stream A) on the REAL world (torbor_downs, stream C's rules): Q12 rings with Farhold's equip, Q10 offices
// on Torborhold's plan, Q11 the smith's shop with real items, Q25 class names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';
import { rulesEngine } from '../../js/rules/index.js';

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };

test('Q12: with one ring on, a second ring goes on the other hand (equip with no slot, or with the item\'s own slot)', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Ringer', 'warrior');
  const o = rec(world, a);
  const eng = rulesEngine();
  const rng = o.room.rules.room.streams.get('loot');
  const ring = () => { for (let k = 0; k < 50; k++) { const it = eng.rpg.rollDrop({ level: 1, rng, chance: 1, bases: ['ring'] }); if (it && /ring/.test(it.baseKey || it.base || it.slot || '')) return it; } return null; };
  const r1 = ring(), r2 = ring();
  assert.ok(r1 && r2, 'two rings');
  world.grant(o, { items: [r1, r2], gold: 0, reason: 'test' }); await run(clock, 200);
  const [b1, b2] = o.char.bag.slice(-2);
  const got = box(a, ['equip', 'err']);
  a.item('equip', b1.uid); await run(clock, 200);
  a.item('equip', b2.uid, b2.slot || 'ring'); await run(clock, 200);       // the client sends the item's own slot
  const eq = o.room.rules.gear(o.entity);
  const worn = Object.entries(eq).filter(([, it]) => it && (it.uid === b1.uid || it.uid === b2.uid)).map(([k]) => k).sort();
  assert.deepEqual(worn, ['ring', 'ring2'], 'both rings worn: ' + JSON.stringify(Object.keys(eq)) + ' ' + JSON.stringify(got.filter(x => x.t === 'err')));
  assert.equal(got.filter(x => x.t === 'equip').pop().slot, 'ring2', 'equip says where it went');
  a.close(); await srv.stop();
});

test('Q10: in the real Torborhold every service NPC has its own building, with `office` on its info; Q11 the smith sells real gear', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Visitor', 'ranger');
  assert.equal(a.joined.you.clsName, 'Ranger', 'Q25');
  const town = world.P.values().next().value.towns[0];
  const folk = [...town.objects.values()].filter(x => x.kind === 'npc' && x.data && x.data.office);
  const roles = folk.map(x => x.data.npc.role);
  // every office stream E lists for Torborhold (data/provinces/offices.json) is a body in the town room
  const E = world.P.values().next().value.L.offices;
  const listed = Object.values(E.towns).find(x => x.name === town.name).offices.map(x => x.role);
  for (const r of new Set(listed)) assert.equal(roles.filter(x => x === r).length, listed.filter(x => x === r).length, r + ' has its offices');
  // a quest NPC who keeps an office is ONE body (offices.json `npc`): Elder Maud is the elder
  assert.equal(folk.filter(x => x.data.npc.role === 'elder').length, 1);
  assert.equal(folk.find(x => x.data.npc.role === 'elder').data.npc.id, 'elder_maud');
  const plots = folk.map(x => x.data.office.plot).filter(Boolean);
  assert.equal(new Set(plots).size, plots.length, 'one building each');
  const smith = folk.find(x => x.data.npc.role === 'smith');
  assert.equal(smith.info().office.kind, 'forge'); assert.equal(smith.info().office.sign, 'anvil');
  assert.equal(smith.info().office.lit, true);
  // nobody stands on anybody
  const all = [...town.objects.values()].filter(x => x.kind === 'npc');
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 0.5, `${all[i].name} on ${all[j].name}`);
  // the smith's shop: real Farhold items with a price
  const o = rec(world, a);
  world.transfer(o, town, { x: smith.x + 1, z: smith.z }, 'test'); await run(clock, 300);
  o.char.gold = 10000;
  const got = box(a, ['shopView', 'shopR', 'used']);
  a.use(smith.id); await run(clock, 200);
  assert.equal(got.find(x => x.t === 'used').shop, true, 'talking to the smith says there is a shop');
  a.shop('open', { npc: smith.id }); await run(clock, 300);
  const v = got.find(x => x.t === 'shopView');
  assert.ok(v && v.stock.length >= 6, 'stock: ' + (v && v.stock.length));
  const gear = v.stock.filter(r => r.cat !== 'goods' && r.cat !== 'mounts');
  assert.ok(gear.length >= 6 && gear.every(r => r.price > 0 && r.item && (r.item.base || r.item.baseKey)), 'real items with prices');
  assert.ok(v.stock.some(r => r.cat === 'goods' && r.item.kind === 'good'), 'E\'s goods too (whetstone, oil)');
  assert.ok(gear.every(r => ['normal', 'magic', 'rare'].includes(r.item.rarity)), 'no rarity above the cap');
  a.shop('buy', { npc: smith.id, id: v.stock[0].id }); await run(clock, 300);
  assert.ok(o.char.bag.some(it => it.name === v.stock[0].item.name), 'bought');
  a.close(); await srv.stop();
});
