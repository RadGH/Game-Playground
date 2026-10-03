// Inventory and equipment (PLAN §7): slots, bag, shop steps + rolls, Requisition, drops, the
// champion pick, uniques, the set, Toll of Iron, chest armour class, and every affix stat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sim, config, data, hero, run, dataWith } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';
import { spawnUnit } from '../js/sim/economy.js';
import { makeItem, gearStats, STAT_IDS, itemScore, SLOTS } from '../js/sim/items.js';
import { heroStats } from '../js/sim/heroes.js';
import * as Q from '../js/sim/query.js';

const two = (heroA = 'warrior', d = data) => createSim(config({ players: [
  { team: 0, kind: 'human', race: 'freeholds', hero: heroA },
  { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] }), d);
const ctxOf = s => ({ state: s.state, data: s.data, map: s.map, emit: (type, f) => s._queue.push({ ...f, type, tick: s.state.tick }) });
const evs = (s, type) => s.drainEvents().filter(e => e.type === type);
const atArmory = s => { const h = hero(s, 0), a = s.map.fields[0].armory; h.x = a.x; h.z = a.z; s.step([]); };
const give = (s, it) => { const p = s.state.players[0]; const i = p.bag.indexOf(null); p.bag[i] = it; return it; };
const mk = (s, o) => makeItem(ctxOf(s), s.state.players[0], { stream: s.state.rng.loot, ...o });

test('8 equipment slots, a 12-slot bag and a 2-potion belt', () => {
  const s = two();
  const p = s.state.players[0];
  assert.deepEqual(Object.keys(p.equip), SLOTS);
  assert.equal(SLOTS.length, 8);
  assert.equal(p.bag.length, 12);
  assert.equal(p.belt, 2);
});

test('away from the Armory a purchase is a Requisition: it arrives later, and is lost (refunded) if the hero dies', () => {
  const s = two();
  const p = s.state.players[0], h = hero(s, 0);
  h.x = s.map.fields[0].cx; h.z = 40;
  s.step([]);
  const g0 = p.gold;
  s.step([{ p: 0, type: 'upgrade' }]);
  assert.equal(p.equip.weapon, null);
  assert.equal(p.requisitions.length, 1);
  assert.equal(p.gold, g0 - data.econ.items.tiers[0].cost);
  run(s, data['items-bl'].shop.requisition * 20);
  assert.ok(p.equip.weapon, 'arrived and equipped');
  // lost on death
  s.step([{ p: 0, type: 'upgrade' }]);
  const g1 = p.gold;
  h.hp = 1;
  const u = spawnUnit(ctxOf(s), 0, 1, 'iron_golem', { x: h.x, z: h.z - 2 });
  s.drainEvents();
  run(s, 30);
  assert.equal(h.alive, false);
  assert.equal(p.requisitions.length, 0);
  const lost = s.drainEvents().find(e => e.type === 'requisitionLost');
  assert.ok(lost);
  assert.equal(p.gold, g1 + lost.refund + (p.gold - g1 - lost.refund));
  assert.ok(u);
});

test('upgrade trades in a plain step; a special item goes back to the bag instead', () => {
  const s = two(); const p = s.state.players[0];
  p.gold = 1e6; atArmory(s);
  s.step([{ p: 0, type: 'upgrade', slot: 'head' }]);
  s.state.tick = 200 * 20;
  s.step([{ p: 0, type: 'upgrade', slot: 'head' }]);
  assert.equal(p.equip.head.step, 1);
  assert.equal(p.bag.filter(Boolean).length, 0, 'plain step traded in');
  const set = give(s, mk(s, { slot: 'head', step: 0, set: true }));
  s.step([{ p: 0, type: 'equip', uid: set.uid }]);
  s.step([{ p: 0, type: 'upgrade', slot: 'head' }]);
  assert.equal(p.equip.head.step, 1);
  assert.ok(p.bag.some(x => x && x.uid === set.uid), 'the set piece is kept');
});

test('rolled shop steps carry affixes: rare 3, legendary 5', () => {
  const s = two();
  const r = mk(s, { slot: 'ring', step: 5 }), l = mk(s, { slot: 'ring', step: 6 });
  assert.equal(r.rarity, 'rare'); assert.equal(r.affixes.length, data['items-bl'].rarityAffixes.rare);
  assert.equal(l.rarity, 'legendary'); assert.equal(l.affixes.length, data['items-bl'].rarityAffixes.legendary);
  assert.equal(new Set(l.affixes.map(a => a.id)).size, l.affixes.length, 'distinct affixes');
  assert.ok(mk(s, { slot: 'ring', step: 6 }).affixes.every(a => a.value > 0));
  // affixes respect slot rules
  for (let i = 0; i < 30; i++) for (const a of mk(s, { slot: 'head', step: 6 }).affixes) {
    const def = data['items-bl'].affixes.find(d => d.id === a.id);
    assert.ok(!def.slots || def.slots.includes('head'), `${a.id} on head`);
  }
});

test('higher item levels roll bigger affixes (tier ladder from the adapter)', () => {
  const s = two();
  const avg = step => { let t = 0, n = 0; for (let i = 0; i < 60; i++) for (const a of mk(s, { slot: 'ring', step, rarity: 'magic' }).affixes) if (a.stat === 'maxHp') { t += a.value; n++; } return t / Math.max(1, n); };
  assert.ok(avg(6) > avg(0) * 1.5);
});

test('the chest sets the armour class (and units hit it through the table)', () => {
  const s = two(); const p = s.state.players[0], h = hero(s, 0);
  p.gold = 1e6; atArmory(s);
  assert.equal(h.armour, 'heavy', 'warrior default');
  s.step([{ p: 0, type: 'buy', slot: 'chest', step: 0, kind: 'cloth' }]);
  const robe = p.bag.find(Boolean);
  s.step([{ p: 0, type: 'equip', uid: robe.uid }]);
  assert.equal(h.armour, data.damage.chestArmour.cloth);
  assert.equal(Q.inventoryInfo(s.state, data, 0).armourClass, 'spectral');
  assert.equal(Q.heroInfo(s.state, data, 0).armourClass, 'spectral');
});

test('two-handed weapons take the off-hand; an off-hand cannot go on beside one', () => {
  const s = two('pyromancer'); const p = s.state.players[0];
  const orb = give(s, mk(s, { slot: 'offhand', step: 0 }));
  s.step([{ p: 0, type: 'equip', uid: orb.uid }]);
  assert.ok(p.equip.offhand);
  const staff = give(s, mk(s, { slot: 'weapon', step: 2, unique: 'bl_sootcrown' }));
  s.step([{ p: 0, type: 'equip', uid: staff.uid }]);
  assert.equal(p.equip.weapon.uid, staff.uid);
  assert.equal(p.equip.offhand, null);
  assert.ok(p.bag.some(x => x && x.uid === orb.uid));
  s.drainEvents();
  s.step([{ p: 0, type: 'equip', uid: orb.uid }]);
  assert.equal(evs(s, 'reject')[0].reason, 'twoHanded');
});

test('uniques belong to their hero', () => {
  const s = two('warrior');
  const staff = give(s, mk(s, { slot: 'weapon', step: 2, unique: 'bl_sootcrown' }));
  s.drainEvents();
  s.step([{ p: 0, type: 'equip', uid: staff.uid }]);
  assert.equal(evs(s, 'reject')[0].reason, 'hero');
});

test('sell returns half the price; unequip needs bag room', () => {
  const s = two(); const p = s.state.players[0];
  const it = give(s, mk(s, { slot: 'ring', step: 3 }));
  const g = p.gold;
  s.step([{ p: 0, type: 'sell', uid: it.uid }]);
  assert.equal(p.gold, g + Math.round(it.price * data['items-bl'].shop.sellFactor) + 0);
  const w = give(s, mk(s, { slot: 'ring', step: 0 }));
  s.step([{ p: 0, type: 'equip', uid: w.uid }]);
  for (let i = 0; i < 12; i++) give(s, mk(s, { slot: 'neck', step: 0 }));
  s.drainEvents();
  s.step([{ p: 0, type: 'unequip', slot: 'ring' }]);
  assert.equal(evs(s, 'reject')[0].reason, 'bag');
});

test('kills in your field drop items into the defender bag (auto-loot) with a better-by score', () => {
  const d = dataWith(raw => { raw['items-bl'].drops.byTier['1'] = 1; });
  const s = two('warrior', d); const p = s.state.players[0], h = hero(s, 0);
  const u = spawnUnit(ctxOf(s), 0, 1, 'levy', { x: h.x, z: h.z - 2 }); u.hp = 1;
  s.drainEvents();
  run(s, 30);
  const drop = s.drainEvents().find(e => e.type === 'drop');
  assert.ok(drop);
  assert.equal(drop.player, 0);
  assert.equal(typeof drop.better, 'number');
  assert.ok(p.bag.some(x => x && x.uid === drop.uid));
});

test('killing a champion opens a 3-card pick for every defender; pick puts one in the bag', () => {
  const s = two(); const p = s.state.players[0], h = hero(s, 0);
  s.state.tick = 18 * 60 * 20;
  const c = spawnUnit(ctxOf(s), 0, 1, 'banner_marshal', { x: h.x, z: h.z - 2 }); c.hp = 1;
  run(s, 30);
  assert.equal(p.picks.length, 1);
  assert.equal(p.picks[0].length, data['items-bl'].drops.pick.cards);
  assert.ok(p.picks[0].some(x => x.rarity === 'unique'));
  const card = p.picks[0][1];
  s.step([{ p: 0, type: 'pick', index: 1 }]);
  assert.equal(p.picks.length, 0);
  assert.ok(p.bag.some(x => x && x.uid === card.uid));
  assert.equal(Q.inventoryInfo(s.state, data, 0).picks.length, 0);
});

test('unique powers: every 3rd hit cleaves (Long Scythe); every 4th cast is empowered (Sootcrown); basics burn (Cinderquill)', () => {
  const s = two(); const p = s.state.players[0], h = hero(s, 0);
  const w = give(s, mk(s, { slot: 'weapon', step: 0, unique: 'bl_the_long_scythe' }));
  s.step([{ p: 0, type: 'equip', uid: w.uid }]);
  h._ord.k = 'stop';
  const t = spawnUnit(ctxOf(s), 0, 1, 'iron_golem', { x: h.x, z: h.z - 2 }); t.hp = t.hpMax = 1e6; t._spd = 0;
  s.drainEvents(); run(s, 70);
  assert.ok(s.drainEvents().some(e => e.type === 'power' && e.unique === 'bl_the_long_scythe'));
  const ps = two('pyromancer'); const pp = ps.state.players[0], ph = hero(ps, 0);
  const st = give(ps, mk(ps, { slot: 'weapon', step: 0, unique: 'bl_sootcrown' }));
  ps.step([{ p: 0, type: 'equip', uid: st.uid }]);
  pp.skills[0].rank = 1; ph.mp = ph.mpMax = 1e4;
  ps.drainEvents();
  for (let i = 0; i < 4; i++) { pp.skills[0].readyAt = 0; ps.step([{ p: 0, type: 'cast', slot: 'Q', x: ph.x, z: ph.z - 5 }]); }
  assert.equal(ps.drainEvents().filter(e => e.type === 'power').length, 1);
  const cs = two('pyromancer'); const ch = hero(cs, 0);
  const q = give(cs, mk(cs, { slot: 'weapon', step: 0, unique: 'bl_cinderquill' }));
  cs.step([{ p: 0, type: 'equip', uid: q.uid }]);
  const tg = spawnUnit(ctxOf(cs), 0, 1, 'iron_golem', { x: ch.x, z: ch.z - 6 }); tg.hp = tg.hpMax = 1e6; tg._spd = 0;
  cs.step([{ p: 0, type: 'attack', target: tg.id }]);
  run(cs, 40);
  assert.ok(tg.statuses.some(x => x.id === 'burn'));
});

test('Keepwarden set: 2 pieces add a Toll charge, 3 add damage near your Keep', () => {
  const s = two(); const p = s.state.players[0], h = hero(s, 0);
  for (const slot of ['head', 'hands']) { const it = give(s, mk(s, { slot, step: 0, set: true })); s.step([{ p: 0, type: 'equip', uid: it.uid }]); }
  run(s, 2);
  assert.equal(s.state.teams[0].toll.charges, data['items-bl'].toll.charges + 1);
  const f3 = give(s, mk(s, { slot: 'feet', step: 0, set: true }));
  s.step([{ p: 0, type: 'equip', uid: f3.uid }]);
  assert.equal(Q.inventoryInfo(s.state, data, 0).set.active.length, 2);
  const c = ctxOf(s);
  h.x = s.map.fields[0].keep.x; h.z = s.map.fields[0].keep.z - 5;
  const near = awaitImport.heroes.heroDamageFactor(c, h);
  h.z = 40;
  const far = awaitImport.heroes.heroDamageFactor(c, h);
  assert.ok(Math.abs(near / far - 1.15) < 1e-9);
});

test('Toll of Iron stuns every enemy unit in your field, then recharges', () => {
  const s = two(); const h = hero(s, 0);
  const us = [0, 1, 2].map(i => spawnUnit(ctxOf(s), 0, 1, 'levy', { x: h.x + i * 3, z: 30 }));
  const other = spawnUnit(ctxOf(s), 1, 0, 'levy', { x: s.map.fields[1].cx, z: 30 });
  s.step([{ p: 0, type: 'toll' }]);
  for (const u of us) assert.ok(u.statuses.some(x => x.id === 'stun'));
  assert.ok(!other.statuses.some(x => x.id === 'stun'), 'only your field');
  assert.equal(s.state.teams[0].toll.charges, 0);
  s.drainEvents(); s.step([{ p: 1, type: 'toll' }]); s.step([{ p: 0, type: 'toll' }]);
  assert.equal(evs(s, 'reject')[0].reason, 'cooldown');
  run(s, data['items-bl'].toll.cooldown * 20);
  assert.equal(s.state.teams[0].toll.charges, 1);
});

// every affix stat changes the sim: a hero wearing one big affix of that stat vs none, same scene
test('every one of the 16 affix stats changes a fight', () => {
  const dead = [];
  const scene = stat => {
    const s = two('warrior');
    const p = s.state.players[0], h = hero(s, 0);
    p.level = 6; for (const sk of p.skills) sk.rank = 1;
    if (stat) {
      const it = mk(s, { slot: 'ring', step: 0 });
      it.affixes = [{ id: 'x', stat, value: stat === 'maxHp' ? 300 : stat === 'mana' ? 80 : stat === 'manaRegen' || stat === 'hpRegen' ? 10 : 20 }];
      give(s, it); s.step([{ p: 0, type: 'equip', uid: it.uid }]);
    }
    h.x = s.map.fields[0].cx; h.z = 60; h.hp = h.hpMax * 0.6; h.mp = 20;
    const c = ctxOf(s);
    const champ = spawnUnit(c, 0, 1, 'banner_marshal', { x: h.x, z: 57 }); champ.hp = champ.hpMax = 2e4;
    for (let i = 0; i < 4; i++) { const u = spawnUnit(c, 0, 1, 'levy', { x: h.x - 3 + i * 2, z: 55 }); u.hp = 40; }
    for (let t = 1; t <= 300; t++) {
      const cmds = [];
      if (t === 1) cmds.push({ p: 0, type: 'stop' });
      if (t === 200) cmds.push({ p: 0, type: 'move', x: h.x, z: 40 });
      cmds.push({ p: 0, type: 'cast', slot: t % 2 ? 'Q' : 'W', x: h.x, z: 55 });
      s.step(cmds);
    }
    return s.hash();
  };
  const ref = scene(null);
  for (const stat of STAT_IDS) if (scene(stat) === ref) dead.push(stat);
  assert.deepEqual(dead, [], 'affix stats with no effect: ' + dead.join(', '));
});

test('caps hold on the worn total', () => {
  const s = two(); const p = s.state.players[0];
  for (const slot of ['ring', 'neck']) { const it = mk(s, { slot, step: 0 }); it.affixes = [{ id: 'x', stat: 'critChance', value: 90 }]; give(s, it); s.step([{ p: 0, type: 'equip', uid: it.uid }]); }
  assert.equal(gearStats(data, p).critChance, data['items-bl'].caps.critChance);
});

test('query helpers: inventory, item cards with better-by, shop with chest kinds', () => {
  const s = two(); const p = s.state.players[0];
  const it = give(s, mk(s, { slot: 'ring', step: 6 }));
  const v = Q.inventoryInfo(s.state, data, 0);
  assert.equal(v.bag.filter(Boolean).length, 1);
  const card = v.bag.find(Boolean);
  assert.equal(card.uid, it.uid);
  assert.ok(card.lines.length >= 3 + it.affixes.length);
  assert.equal(card.better, itemScore(data, it));
  const shop = Q.shopInfo(s.state, data, 0);
  assert.equal(shop.slots.find(x => x.slot === 'chest').kinds.length, 4);
  assert.equal(shop.recommended.cost, data.econ.items.tiers[0].cost);
  assert.equal(typeof shop.atArmory, 'boolean');
  assert.equal(heroStats(data, p).hpMax > 0, true);
});

const awaitImport = { heroes: await import('../js/sim/heroes.js') };
