// Hero items (owner round 2, R2.2): six slots with no slot types, simple stat items, every copy of a
// duplicate counts, rare `uniqueEquipped`, buy / sell only inside the Outfitter's radius, consumables
// with charges, drops, and every stat / use effect proven to reach the sim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { config, data, hero, run, dataWith, ROOT } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';
import { spawnUnit } from '../js/sim/economy.js';
import { gearStats, STAT_HANDLERS, USE_EFFECTS, sellValue, refreshFromGear } from '../js/sim/items.js';
import { heroStats } from '../js/sim/heroes.js';
import { buildingOf } from '../js/sim/buildings.js';
import * as Q from '../js/sim/query.js';

const IB = data['items-bl'];
const two = (heroA = 'warrior', d = data) => createSim(config({ players: [
  { team: 0, kind: 'human', race: 'freeholds', hero: heroA },
  { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] }), d);
const ctxOf = s => ({ state: s.state, data: s.data, map: s.map, emit: (type, f) => s._queue.push({ ...f, type, tick: s.state.tick }) });
const evs = (s, type) => s.drainEvents().filter(e => e.type === type);
const rejects = s => evs(s, 'reject').map(e => e.reason);
const toShop = (s, pid = 0) => { const h = hero(s, pid), b = buildingOf(ctxOf(s), s.state.players[pid].team, 'shop'); h.x = h.px = b.x + 1; h.z = h.pz = b.z; h._ord.k = 'stop'; };
const away = (s, pid = 0) => { const h = hero(s, pid); h.x = h.px = s.map.fields[h.field].cx; h.z = h.pz = 40; h._ord.k = 'stop'; };
const buy = (s, id, pid = 0) => s.step([{ p: pid, type: 'buy', id }]);

test('catalogue: 40-60 simple stat items over five tabs, every one with name, desc and stat lines', () => {
  const items = Object.values(IB.items);
  assert.ok(items.length >= 40 && items.length <= 60, `${items.length} items`);
  const cats = new Set(items.map(i => i.category));
  for (const c of ['weapons', 'armour', 'trinkets', 'charms', 'consumables']) assert.ok(cats.has(c), c);
  for (const it of items) {
    assert.ok(it.name && it.desc && it.statLines.length, it.id);
    assert.ok(it.price > 0 && it.tier >= 1 && it.tier <= 4, it.id);
    for (const k of Object.keys(it.stats)) assert.ok(STAT_HANDLERS[k] && IB.statDefs[k], `${it.id}: stat ${k} has a handler`);
    if (it.consumable) { assert.ok(it.charges >= 1 && it.use.length, it.id); for (const u of it.use) assert.ok(USE_EFFECTS[u.effect], `${it.id}: use ${u.effect}`); }
    else assert.ok(Object.keys(it.stats).length, `${it.id} gives something`);
    // no affixes / rolls / procs in the simple set
    for (const k of ['affixes', 'power', 'onHit', 'set', 'rarity']) assert.equal(it[k], undefined, `${it.id}.${k}`);
  }
  const ue = items.filter(i => i.uniqueEquipped);
  assert.ok(ue.length >= 1 && ue.length <= 6, `uniqueEquipped used sparingly (${ue.length})`);
  // every item on exactly one shop tab
  const listed = data.shop.tabs.flatMap(t => t.items);
  assert.deepEqual(listed.slice().sort(), Object.keys(IB.items).sort());
  // prices spread over a range: the dearest piece costs at least 20x the cheapest (absolute prices are a
  // tuning knob: tools/build-items-bl.mjs PRICE_SCALE, feel pass 2026-10-03)
  assert.ok(Math.max(...items.map(i => i.price)) >= 20 * Math.min(...items.map(i => i.price)));
});

test('the generated data files are up to date with tools/build-items-bl.mjs', () => {
  execFileSync(process.execPath, [join(ROOT, 'tools', 'build-items-bl.mjs'), '--check'], { stdio: 'pipe' });
});

test('six slots, no slot types; buying fills the first free slot', () => {
  const s = two(); const p = s.state.players[0];
  assert.equal(p.inv.length, 6);
  p.gold = 1e5; toShop(s);
  buy(s, 'leather_cap'); buy(s, 'training_sword'); buy(s, 'copper_ring');
  assert.deepEqual(p.inv.map(x => x && x.id), ['leather_cap', 'training_sword', 'copper_ring', null, null, null]);
  assert.equal(p.gold, 1e5 - IB.items.leather_cap.price - IB.items.training_sword.price - IB.items.copper_ring.price);
});

test('the Outfitter only sells to a hero standing in its radius', () => {
  const s = two(); const p = s.state.players[0];
  p.gold = 1e4; away(s); s.drainEvents();
  buy(s, 'training_sword');
  assert.deepEqual(rejects(s), ['notAtShop']);
  assert.ok(p.inv.every(x => !x));
  assert.equal(Q.shopInfo(s.state, data, 0).tabs[0].items[0].reason, 'notAtShop');
  // the hero spawns inside it
  const s2 = two(); s2.state.players[0].gold = 1e4; buy(s2, 'training_sword');
  assert.equal(s2.state.players[0].inv[0].id, 'training_sword');
  // dead heroes cannot shop
  const s3 = two(); const h = hero(s3, 0); h.alive = false; s3.state.players[0].gold = 1e4; s3.drainEvents(); buy(s3, 'training_sword');
  assert.deepEqual(rejects(s3), ['dead']);
});

test('duplicates each take a slot and every copy counts; a full inventory refuses', () => {
  const s = two(); const p = s.state.players[0];
  p.gold = 1e5; toShop(s);
  const dps0 = heroStats(data, p).dps;
  for (let i = 0; i < 6; i++) buy(s, 'training_sword');
  assert.equal(p.inv.filter(x => x && x.id === 'training_sword').length, 6);
  assert.equal(gearStats(data, p).damage, 6 * IB.items.training_sword.stats.damage);
  const per = IB.items.training_sword.stats.damage / data.heroes.heroes.warrior.attackEvery;
  assert.ok(Math.abs(heroStats(data, p).dps - (dps0 + 6 * per)) < 1e-9);
  s.drainEvents(); buy(s, 'training_sword');
  assert.deepEqual(rejects(s), ['full']);
  // consumables too: two draughts are two slots
  const s2 = two(); const p2 = s2.state.players[0]; p2.gold = 1e4;
  buy(s2, 'healing_draught'); buy(s2, 'healing_draught');
  assert.equal(p2.inv.filter(Boolean).length, 2);
});

test('uniqueEquipped refuses a second copy; ordinary items never do', () => {
  const s = two(); const p = s.state.players[0];
  p.gold = 1e5; toShop(s);
  buy(s, 'kingsbane'); s.drainEvents(); buy(s, 'kingsbane');
  assert.deepEqual(rejects(s), ['uniqueEquipped']);
  assert.equal(p.inv.filter(x => x && x.id === 'kingsbane').length, 1);
  assert.ok(IB.items.kingsbane.statLines.some(l => /only one/.test(l)));
});

test('stat caps clamp the sum', () => {
  const s = two(); const p = s.state.players[0];
  p.gold = 1e5; toShop(s);
  for (let i = 0; i < 6; i++) buy(s, 'windstring_bow');
  assert.equal(gearStats(data, p).attackSpeed, IB.caps.attackSpeed);
});

test('selling pays back a fraction, only at the Outfitter; a used consumable pays its share', () => {
  const s = two(); const p = s.state.players[0];
  p.gold = 1000; toShop(s);
  buy(s, 'iron_mace');
  const g = p.gold;
  away(s); s.drainEvents(); s.step([{ p: 0, type: 'sell', slot: 0 }]);
  assert.deepEqual(rejects(s), ['notAtShop']);
  toShop(s); s.step([{ p: 0, type: 'sell', slot: 0 }]);
  assert.equal(p.gold, g + Math.round(IB.items.iron_mace.price * IB.rules.sellFactor));
  assert.equal(p.inv[0], null);
  assert.equal(sellValue(data, { id: 'field_salve', charges: 1 }), Math.round(IB.items.field_salve.price * IB.rules.sellFactor / 3));
});

test('swap moves items between slots anywhere', () => {
  const s = two(); const p = s.state.players[0];
  p.gold = 1000; buy(s, 'training_sword'); away(s);
  s.step([{ p: 0, type: 'swap', a: 0, b: 5 }]);
  assert.equal(p.inv[0], null); assert.equal(p.inv[5].id, 'training_sword');
});

test('consumables: heal, charges, cooldown, removal; recall goes home; status and barrier scrolls', () => {
  const s = two(); const p = s.state.players[0], h = hero(s, 0);
  p.gold = 1e4;
  buy(s, 'healing_draught'); buy(s, 'field_salve'); buy(s, 'scroll_of_return'); buy(s, 'stoneskin_tonic'); buy(s, 'mana_tonic'); buy(s, 'scroll_of_haste');
  h.hp = 100; s.step([{ p: 0, type: 'use', slot: 0 }]);
  assert.ok(Math.abs(h.hp - (100 + h.hpMax * 0.4)) < 1);
  assert.equal(p.inv[0], null, 'one charge, gone');
  s.drainEvents(); s.step([{ p: 0, type: 'use', slot: 1 }]);
  assert.deepEqual(rejects(s), ['cooldown']);
  run(s, 20); s.step([{ p: 0, type: 'use', slot: 1 }]);
  assert.equal(p.inv[1].charges, 2); assert.ok(h.statuses.some(x => x.id === 'regen'));
  run(s, 20); s.step([{ p: 0, type: 'use', slot: 3 }]);
  assert.ok(h.statuses.find(x => x.id === 'barrier').power > 0);
  run(s, 20); h.mp = 0; s.step([{ p: 0, type: 'use', slot: 4 }]); assert.ok(h.mp >= h.mpMax * 0.5 - 1);
  run(s, 20); s.step([{ p: 0, type: 'use', slot: 5 }]); assert.ok(h.statuses.some(x => x.id === 'haste'));
  away(s); run(s, 20); s.step([{ p: 0, type: 'use', slot: 2 }]);
  const f = s.map.fields[0];
  assert.ok(Math.abs(h.x - f.spawn.x) < 0.5 && Math.abs(h.z - f.spawn.z) < 0.5, 'recalled');
  s.drainEvents(); s.step([{ p: 0, type: 'use', slot: 2 }]);
  assert.deepEqual(rejects(s), ['bad']);
  // a stat item is not usable
  p.inv[0] = { uid: 999, id: 'training_sword', charges: 0 }; run(s, 20); s.drainEvents();
  s.step([{ p: 0, type: 'use', slot: 0 }]);
  assert.deepEqual(rejects(s), ['notUsable']);
});

test('a champion kill hands every defender an item (sold for gold when full)', () => {
  const s = two(); const p = s.state.players[0];
  const ctx = ctxOf(s);
  const f = s.map.fields[0];
  const champ = spawnUnit(ctx, 0, 1, 'banner_marshal', { x: f.cx, z: 60 });
  const { dealDamage } = awaitCombat;
  dealDamage(ctx, null, champ, 1e9, 'blade');
  assert.ok(p.inv.some(Boolean));
  const it = p.inv.find(Boolean);
  assert.ok(!IB.items[it.id].consumable && IB.items[it.id].price <= IB.drops.champion.maxPrice);
});
const awaitCombat = await import('../js/sim/combat.js');

// Every stat reaches the sim: a test item carrying ONLY that stat must change the outcome of a busy
// scene (hero fighting fire + blade units, casting, taking damage, killing for bounty, walking).
test('every item stat changes the sim (dead-data guard)', () => {
  const scene = d => {
    const s = createSim(config({ seed: 4, players: [
      { team: 0, kind: 'human', race: 'freeholds', hero: 'pyromancer' },
      { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] }), d, { events: false });
    const p = s.state.players[0], h = hero(s, 0);
    p.level = 8; for (const sk of p.skills) sk.rank = 1; p.skillPts = 0;
    const ctx = ctxOf(s);
    ctx.emit = () => {};
    s.step([]);
    h.hp = h.hpMax * 0.5; h.mp = 5;
    p.inv[0] = { uid: 1, id: '__probe', charges: 0 }; p.gearV++; refreshFromGear(ctx, p);
    const f = s.map.fields[0];
    for (let i = 0; i < 8; i++) { const u = spawnUnit(ctx, 0, 1, i % 2 ? 'pyre_runner' : 'levy', { x: f.cx + (i - 4) * 1.5, z: 70 + i }); u.hp = u.hpMax = i < 6 ? 2500 : 60; u._spd = 0.4; u._traits = []; }
    for (let t = 1; t <= 600; t++) {
      const c = [];
      if (t === 1) c.push({ p: 0, type: 'amove', x: f.cx, z: 72 });
      if (t % 40 === 5) c.push({ p: 0, type: 'cast', slot: 'Q', x: f.cx, z: 72 });
      s.step(c);
    }
    return s.hash() + ':' + p.gold.toFixed(3);
  };
  const dead = [];
  for (const k of Object.keys(STAT_HANDLERS)) {
    const withStat = v => dataWith(raw => { raw['items-bl'].items.__probe = { id: '__probe', name: 'Probe', category: 'charms', tier: 1, price: 1, icon: 'ring', desc: '', stats: k === 'critDamage' ? { critChance: 50, critDamage: v } : { [k]: v }, statLines: ['x'] }; });
    if (scene(withStat(0)) === scene(withStat(k === 'critDamage' ? 80 : 15))) dead.push(k);
  }
  assert.deepEqual(dead, [], 'stats the sim never reads: ' + dead.join(', '));
});
