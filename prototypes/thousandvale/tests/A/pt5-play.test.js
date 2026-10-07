// Play-test 5 (stream A) on the real province with stream C's rules:
//   T3  a healer's direct heal lands on the ally it targets          T4  reviving a dead player: ask, accept / decline, stand up
//   T5  the starter kit picked at creation is validated and worn     T7  two two-handers: refused without the perk, worn with it
//   T9  a quest's crate reward lands in the bag and opens            T14 `you.reach` follows the weapon in hand
//   T18 the character sheet arrives after the join and after every equip
import test from 'node:test';
import assert from 'node:assert/strict';
import { rarityRank, slotFits, crateItem, openCrate } from '../../js/sim/crates.js';
import { realServer, joinReal, rec, run, until, waitP } from './pt1-helpers.js';
import { makeClient } from './helpers.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
async function party(a, b, clock, name) {
  let inv = null; b.on('partyInvite', m => { inv = m; });
  a.partyOp('invite', { name }); await until(clock, () => !!inv, 2000);
  b.partyOp('accept', { party: inv.party }); await run(clock, 400);
}
const hurt = (o, frac) => { const e = o.entity, u = e.r && e.r.unit; const hp = Math.max(1, Math.round(e.hpMax * frac)); if (u) u.hp = Math.max(1, Math.round(u.maxHp * frac)); e.setHp(hp); return hp; };

test('T5: the kit screen\'s data (kits), a picked kit is validated at create and worn on the first entry; an unknown id is refused', async () => {
  const { srv, clock, world, C } = await realServer({ roadEvents: false });
  assert.equal(typeof C.kitsFor, 'function', 'stream C\'s kitsFor is loaded');
  const c = makeClient(srv, clock);
  await waitP(clock, c.ready);
  const kr = on(c, 'kitsR');
  c.kits('warrior'); await until(clock, () => kr.length);
  const kits = kr[0].kits;
  assert.ok(kits && kits.armour.length === 3 && kits.weapons.length >= 2, 'three armour sets, several weapon packs: ' + JSON.stringify(kits && { a: kits.armour.length, w: kits.weapons.length }));
  assert.ok(kits.weapons.every(w => w.items.length >= 1 && w.items[0].name) && kits.armour.every(a => a.items.length >= 2), 'real items to draw');
  // an id that is not this class's
  await assert.rejects(waitP(clock, c.createChar({ name: 'Badkit', cls: 'warrior', kit: { armour: 'nope', weapons: kits.weapons[0].id } })), e => e.code === 'kit');
  // the LAST armour set and a weapon pack that is not the first
  const armour = kits.armour[2], pack = kits.weapons.find(w => w.items.length === 2) || kits.weapons[1];
  const ch = await waitP(clock, c.createChar({ name: 'Kitted', cls: 'warrior', kit: { armour: armour.id, weapons: pack.id } }));
  await waitP(clock, c.play(ch.id));
  await until(clock, () => !!c.joined, 5000);
  const eq = c.joined.you.equipment, worn = Object.values(eq).filter(Boolean);
  const base = it => it.baseKey || it.base || it.name;
  for (const it of [...pack.items, ...armour.items]) assert.ok(worn.some(w => base(w) === base(it)), 'wearing ' + it.name + ': ' + worn.map(base).join(', '));
  assert.ok(worn.every(w => w.uid), 'every worn piece has a server uid (it can be taken off)');
  assert.deepEqual(c.joined.you.kit, { armour: armour.id, weapons: pack.id });
  const o = rec(world, c);
  assert.equal(o.char.kitV, 2);
  assert.equal((o.char.bag || []).length, 0, 'nothing dumped in the bag');
  // others draw it
  assert.ok(o.entity.gear && o.entity.gear.weapon && Object.keys(o.entity.gear).length >= 3, 'gear on info: ' + JSON.stringify(o.entity.gear));
  // no kit at all = the old default (class weapon, plain clothes)
  const d = makeClient(srv, clock);
  await waitP(clock, d.ready);
  const ch2 = await waitP(clock, d.createChar({ name: 'Plainjane', cls: 'warrior' }));
  await waitP(clock, d.play(ch2.id)); await until(clock, () => !!d.joined, 5000);
  assert.deepEqual(Object.keys(d.joined.you.equipment).filter(k => d.joined.you.equipment[k] && !['weapon', 'offhand'].includes(k)), []);
  c.close(); d.close(); await srv.stop();
});

test('T9: a starting quest pays a CRATE; opening it gives an item of its slot at its rarity or better; the offer shows the crate', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Cratey', 'warrior');
  const o = rec(world, a);
  const book = P.P.get(world.layouts[0].key).book;
  const def = [...book.defs.values()].find(d => d.reward && d.reward.crates && d.reward.crates.length && !d.needsGiver && !d.cls && !d.classes);
  assert.ok(def, 'E\'s quests carry crates');
  const n = [...book.defs.values()].filter(d => d.reward && d.reward.crates && d.reward.crates.length).length;
  assert.ok(n >= 10, 'many quests pay crates: ' + n);
  // finish it (every step done) and hand it in from the journal
  o.char.quests.active[def.id] = { step: def.steps.length, n: 0 };
  const qr = on(a, 'questR');
  a.quest('turnin', def.id); await until(clock, () => qr.length, 3000);
  assert.equal(qr[0].ok, true, JSON.stringify(qr[0]));
  assert.equal(qr[0].reward.crates.length, def.reward.crates.length, 'questR names the crates');
  await run(clock, 300);
  const crates = o.char.bag.filter(i => i.kind === 'crate');
  assert.equal(crates.length, def.reward.crates.length, 'one crate item per entry');
  const spec = def.reward.crates[0], crate = crates[0];
  assert.ok(crate.name && crate.crate && crate.uid, JSON.stringify(crate));
  const ir = on(a, 'itemR'), bags = on(a, 'bag');
  a.openItem(crate.uid); await until(clock, () => ir.length, 2000);
  assert.equal(ir[0].ok, true, JSON.stringify(ir[0]));
  const got = ir[0].opened.item;
  assert.ok(got && got.uid && got.name, 'the reveal carries the item');
  const min = { common: 'normal', uncommon: 'magic', rare: 'rare', epic: 'legendary' }[spec.min] || 'normal';
  assert.ok(rarityRank(got.rarity) >= rarityRank(min), `${got.rarity} >= ${min}`);
  if (spec.slot && spec.slot !== 'any') assert.ok(slotFits(got, spec.slot), `a ${spec.slot} crate gave ${got.name} (${got.slot || got.type})`);
  assert.ok(!o.char.bag.some(i => i.uid === crate.uid), 'the crate is used up');
  assert.ok(o.char.bag.some(i => i.uid === got.uid) && bags.some(b => b.add.some(i => i.uid === got.uid)), 'in the bag, and the client was told');
  // the fallback roll on its own: 30 crates of each kind always meet rarity, and the slot
  const rules = o.room.rules;
  for (const [slot, m] of [['weapon', 'uncommon'], ['feet', 'common'], ['ring', 'uncommon'], ['any', 'rare']]) {
    for (let k = 0; k < 15; k++) {
      const [it] = openCrate(rules, o.entity, crateItem({ slot, min: m }));
      assert.ok(it && rarityRank(it.rarity) >= rarityRank({ common: 'normal', uncommon: 'magic', rare: 'rare' }[m]), slot + '/' + m + ' gave ' + it.rarity);
      assert.ok(slotFits(it, slot), slot + ' crate gave ' + it.name + ' (' + (it.slot || it.type) + ')');
    }
  }
  a.close(); await srv.stop();
});

test('T4 (A\'s flow): a revive is OFFERED to the fallen player; decline tells the caster, accept stands the body up where it lies with the skill\'s health; it expires; release cancels it', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Raiser', 'cleric'), b = await joinReal(srv, clock, 'Fallen', 'warrior');
  const oa = rec(world, a), ob = rec(world, b);
  const copy = P.copies[0], L = world.layouts[0], T = L.towns[0], gd = Math.hypot(L.gate.x - T.x, L.gate.z - T.z) || 1;
  const at = { x: L.gate.x + (L.gate.x - T.x) / gd * 100, z: L.gate.z + (L.gate.z - T.z) / gd * 100 };
  P.transfer(oa, copy, at, 'test'); P.transfer(ob, copy, { x: at.x + 3, z: at.z }, 'test');
  await run(clock, 500);
  for (const m of copy.host.near(at.x, at.z, 80, x => x.kind === 'monster')) copy.remove(m);
  const asks = on(b, 'reviveAsk'), rb = on(b, 'reviveR'), ra = on(a, 'reviveR');
  const host = copy.host;
  // not on the living
  assert.equal(host.offerRevive(oa.entity, ob.entity, { skill: 'second_dawn', name: 'Second Dawn', hpPct: 0.25 }).why, 'alive');
  ob.entity.kill(); if (ob.entity.r.unit) { ob.entity.r.unit.hp = 0; ob.entity.r.unit.dead = true; }
  await run(clock, 300);
  const where = { x: ob.entity.x, z: ob.entity.z };
  // 1. offered, declined
  let r = host.offerRevive(oa.entity, ob.entity, { skill: 'second_dawn', name: 'Second Dawn', hpPct: 0.25, note: 'Comes back at a quarter health.' });
  assert.equal(r.ok, true);
  await until(clock, () => asks.length);
  assert.deepEqual([asks[0].from, asks[0].fromId, asks[0].skill, asks[0].skillId, asks[0].hpPct, asks[0].note], ['Raiser', oa.entity.id, 'Second Dawn', 'second_dawn', 0.25, 'Comes back at a quarter health.']);
  assert.ok(asks[0].ms > 30000 && asks[0].until > Date.now() - 1000);
  b.revive('decline', asks[0].id); await until(clock, () => ra.length);
  assert.equal(ra[0].op, 'declined'); assert.equal(ra[0].name, 'Fallen');
  assert.equal(ob.entity.dead, true);
  // 2. offered, accepted: stands up where it lies
  const fx = []; a.on('ev', m => { for (const e of m.e) if (e.type === 'fx' && e.kind === 'revive') fx.push(e); });
  r = host.offerRevive(oa.entity, ob.entity, { skill: 'green_return', name: 'Green Return', hpPct: 0.2, apply: { status: { id: 'mending', seconds: 10 } } });
  await until(clock, () => asks.length >= 2);
  b.revive('accept', asks[1].id); await until(clock, () => rb.some(m => m.op === 'accept'));
  assert.equal(rb.find(m => m.op === 'accept').ok, true);
  assert.equal(ob.entity.dead, false, 'the body is up');
  assert.ok(Math.hypot(ob.entity.x - where.x, ob.entity.z - where.z) < 0.5, 'where it lay (no trip to town)');
  assert.equal(ob.room, copy);
  const frac = ob.entity.hp / ob.entity.hpMax;
  assert.ok(frac > 0.1 && frac < 0.5, 'with the skill\'s share of health: ' + frac.toFixed(2));
  if (ob.entity.r.unit) assert.ok(!ob.entity.r.unit.dead && ob.entity.r.unit.hp > 0, 'the rules\' unit is alive too');
  await until(clock, () => ra.some(m => m.op === 'done') && fx.length, 2000);
  assert.ok(ra.some(m => m.op === 'done' && m.name === 'Fallen'), 'the caster hears it worked');
  assert.ok(fx[0] && fx[0].id === ob.entity.id && fx[0].by === oa.entity.id && fx[0].skill === 'green_return', 'everyone near gets the fx with the skill: ' + JSON.stringify(fx[0]));
  // it can move and act again
  await run(clock, 500);
  assert.equal(b.mirror.self ? b.mirror.self.dead : ob.entity.dead, false);
  // 3. an offer runs out
  ob.entity.kill(); if (ob.entity.r.unit) { ob.entity.r.unit.hp = 0; ob.entity.r.unit.dead = true; }
  host.offerRevive(oa.entity, ob.entity, { skill: 'x', name: 'Quick', hpPct: 0.3, ms: 5000 });
  await until(clock, () => asks.length >= 3);
  await run(clock, 7000);
  assert.ok(ra.some(m => m.op === 'expired'), 'the caster hears it expired');
  b.revive('accept', asks[2].id); await run(clock, 200);
  assert.equal(ob.entity.dead, true, 'too late');
  // 4. releasing to town turns an open offer down
  host.offerRevive(oa.entity, ob.entity, { skill: 'x', name: 'Again', hpPct: 0.3 });
  await until(clock, () => asks.length >= 4);
  const n = ra.filter(m => m.op === 'declined').length;
  b.respawn(); await run(clock, 500);
  assert.equal(ob.reviveAsk, null);
  assert.equal(ra.filter(m => m.op === 'declined').length, n + 1);
  assert.equal(ob.entity.dead, false); assert.equal(ob.room.kind, 'town');
  a.close(); b.close(); await srv.stop();
});

test('T4 + T3 through stream C\'s skills: a priest heals the ally they target with key 2, and raises a fallen party member with the revive key (the offer reaches them)', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Sister', 'priest'), b = await joinReal(srv, clock, 'Brother', 'warrior');
  const oa = rec(world, a), ob = rec(world, b);
  // really level them (the rules' own level-up: skill keys unlock by level)
  for (const o of [oa, ob]) o.room.award(o.entity, { xp: o.room.rules.xpFor(20) + 5, reason: 'test' });
  await run(clock, 300);
  assert.ok(oa.char.level >= 15, 'levelled: ' + oa.char.level);
  const copy = P.copies[0], L = world.layouts[0], T = L.towns[0], gd = Math.hypot(L.gate.x - T.x, L.gate.z - T.z) || 1;
  const at = { x: L.gate.x + (L.gate.x - T.x) / gd * 100, z: L.gate.z + (L.gate.z - T.z) / gd * 100 };
  P.transfer(oa, copy, at, 'test'); P.transfer(ob, copy, { x: at.x + 4, z: at.z }, 'test');
  await run(clock, 500);
  for (const m of copy.host.near(at.x, at.z, 90, x => x.kind === 'monster')) copy.remove(m);
  await party(a, b, clock, 'Brother');
  const bar = oa.room.barFor(oa.entity);
  const heal = bar.find(s => s.ally && (s.slot === 1 || s.slot === 2));
  assert.ok(heal, 'T3: a healer\'s key 1 or 2 is a direct heal that takes an ally: ' + bar.map(s => s.slot + ':' + s.id + (s.ally ? '*' : '')).join(' '));
  // T3: target the wounded ally, cast the heal
  const before = hurt(ob, 0.4);
  const tr = on(a, 'targetR'), cr = on(a, 'castR');
  a.target(ob.entity.id); await run(clock, 200);
  assert.ok(!tr.some(m => m.ok === false), 'a friendly player can be targeted: ' + JSON.stringify(tr));
  if (oa.entity.r.unit) oa.entity.r.unit.mp = oa.entity.r.unit.maxMp;
  a.cast({ slot: heal.slot, target: ob.entity.id });
  await until(clock, () => ob.entity.hp > before || cr.length, 4000);
  assert.ok(ob.entity.hp > before, `the ally was healed (${before} -> ${ob.entity.hp}); refusals: ${JSON.stringify(cr)}`);
  const mine = oa.entity.hp;
  // party frames carry the entity id to target
  const frames = on(a, 'partyFrames');
  await until(clock, () => frames.length, 2000);
  assert.ok(frames.at(-1).some(f => f.char === ob.char.id && f.id === ob.entity.id), 'partyFrames row has the member\'s entity id');
  void mine;
  // T4: the revive key on a fallen party member
  const rev = bar.find(s => s.revive);
  assert.ok(rev, 'the priest has a revive on the bar: ' + bar.map(s => s.id).join(' '));
  ob.entity.kill(); if (ob.entity.r.unit) { ob.entity.r.unit.hp = 0; ob.entity.r.unit.dead = true; }
  await run(clock, 400);
  const asks = on(b, 'reviveAsk'), rb = on(b, 'reviveR');
  if (oa.entity.r.unit) { oa.entity.r.unit.mp = oa.entity.r.unit.maxMp; }
  cr.length = 0;
  a.target(ob.entity.id); await run(clock, 100);
  a.cast({ slot: rev.slot, target: ob.entity.id });
  await until(clock, () => asks.length || cr.length, 12000);
  assert.ok(asks.length, 'the fallen player is asked: ' + JSON.stringify(cr));
  assert.equal(asks[0].from, 'Sister'); assert.equal(asks[0].skillId, rev.id);
  b.revive('accept', asks[0].id); await until(clock, () => rb.length);
  assert.equal(rb[0].ok, true, JSON.stringify(rb[0]));
  assert.equal(ob.entity.dead, false);
  assert.ok(ob.entity.hp > 0 && ob.entity.hp < ob.entity.hpMax, 'up, wounded (' + ob.entity.hp + '/' + ob.entity.hpMax + ')');
  a.close(); b.close(); await srv.stop();
});

test('T7: a two-hander into the off hand is refused without the perk (with a sentence the paper doll can show) and worn with it', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const a = await joinReal(srv, clock, 'Twohands', 'warrior');
  const o = rec(world, a);
  const rules = o.room.rules;
  const mk = base => rules.makeItem ? rules.makeItem(o.entity, { base, rarity: 'normal', level: 1 }) : null;
  const eng = rules.room && rules.room.engine;
  const two = () => { let it = mk('greatsword') || mk('great_axe'); if (!it && eng) it = eng.rpg.loot.generate('greatsword', 'normal', 'low', {}) || eng.rpg.loot.generate('great_axe', 'normal', 'low', {}); return JSON.parse(JSON.stringify(it)); };
  const A = two(), B = two();
  assert.ok(A && A.twoHanded, 'a two-handed weapon to test with: ' + JSON.stringify(A && A.name));
  P.grant(o, { items: [A, B], reason: 'test' });
  await run(clock, 200);
  const [ia, ib] = o.char.bag.filter(i => i.twoHanded);
  const ir = on(a, 'itemR'), errs = on(a, 'err'), eqs = on(a, 'equip');
  assert.equal(a.joined.you.dual2h, false);
  a.item('equip', ia.uid); await until(clock, () => eqs.length);
  assert.ok(ir.some(m => m.op === 'equip' && m.ok && m.uid === ia.uid), 'itemR answers an equip');
  // the second one into the off hand: no
  a.item('equip', ib.uid, 'offhand'); await until(clock, () => ir.some(m => m.uid === ib.uid));
  const no = ir.find(m => m.uid === ib.uid);
  assert.equal(no.ok, false); assert.ok(no.msg && no.msg.length > 10, 'a sentence: ' + no.msg);
  assert.ok(errs.some(e => e.code === 'item'));
  assert.ok(o.char.bag.some(i => i.uid === ib.uid), 'still in the bag');
  // with Doubled Grasp
  const u = o.entity.r.unit;
  u.perkFlags = { ...(u.perkFlags || {}), doubleGrip: true };
  ir.length = 0;
  a.item('equip', ib.uid, 'offhand'); await until(clock, () => ir.some(m => m.uid === ib.uid));
  assert.equal(ir.find(m => m.uid === ib.uid).ok, true, JSON.stringify(ir));
  const eq = eqs.at(-1).equipment;
  assert.ok(eq.weapon && eq.weapon.uid === ia.uid && eq.offhand && eq.offhand.uid === ib.uid, 'both hands hold a two-hander: ' + JSON.stringify(Object.fromEntries(Object.entries(eq).map(([k, v]) => [k, v && v.name]))));
  assert.ok(o.entity.gear.weapon && o.entity.gear.offhand, 'others draw both');
  a.close(); await srv.stop();
});

test('T14 + T18: `you.reach` is the reach of the weapon in hand and follows a swap; the sheet arrives after the join and after an equip', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province;
  const c = makeClient(srv, clock);
  await waitP(clock, c.ready);
  const sheets = on(c, 'sheet'), yous = on(c, 'you');
  const ch = await waitP(clock, c.createChar({ name: 'Sheeted', cls: 'ranger' }));
  await waitP(clock, c.play(ch.id)); await until(clock, () => !!c.joined, 5000);
  const o = rec(world, c), rules = o.room.rules;
  // T14: a ranger's bow reaches far; the number is the rules' own
  assert.ok(c.joined.you.reach > 10, 'a bow reaches: ' + c.joined.you.reach);
  assert.equal(c.joined.you.reach, rules.attackRange(o.entity));
  // T18: the sheet follows the join
  assert.ok(await until(clock, () => sheets.length, 3000), 'a sheet after the join');
  const s0 = sheets[0];
  assert.ok(Array.isArray(s0.core) && s0.core.length >= 3 && Array.isArray(s0.advanced) && Array.isArray(s0.abilities), 'core / advanced / abilities');
  for (const r of s0.core) assert.ok(r.id && r.label && typeof r.value === 'number', 'a row: ' + JSON.stringify(r));
  assert.ok(s0.angling && s0.angling.level === 1 && s0.bagMax === 120 && Number.isFinite(s0.gold), 'A\'s part: angling, bag, gold');
  // a melee weapon in hand: the reach drops and a new sheet follows
  const eng = rules.room && rules.room.engine;
  const sword = JSON.parse(JSON.stringify((rules.makeItem && rules.makeItem(o.entity, { base: 'longsword', rarity: 'normal', level: 1 })) || eng.rpg.loot.generate('longsword', 'normal', 'low', {})));
  P.grant(o, { items: [sword], reason: 'test' }); await run(clock, 200);
  const it = o.char.bag.find(i => i.name === sword.name);
  const n = sheets.length; yous.length = 0;
  c.item('equip', it.uid); await until(clock, () => yous.some(y => 'reach' in y), 2000);
  const y = yous.find(q => 'reach' in q);
  assert.ok(y.reach == null || y.reach < 6, 'a sword does not reach like a bow: ' + y.reach);
  assert.equal(y.reach, rules.attackRange(o.entity));
  assert.ok(await until(clock, () => sheets.length > n, 3000), 'a new sheet after the equip');
  // asked for again
  const m = sheets.length; c.sheet(); assert.ok(await until(clock, () => sheets.length > m, 2000), '`sheet {}` asks again');
  c.close(); await srv.stop();
});

test('E\'s asks: a quest\'s `reward.goods` and crates are PAID at turn-in (and `grant` on accept — see pt5-angling); a shop skips a base above the town\'s level cap (`minCap`)', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province, L = world.layouts[0];
  const a = await joinReal(srv, clock, 'Paidup', 'warrior');
  const o = rec(world, a);
  const book = P.P.get(L.key).book;
  const def = book.defs.get('angle_first_cast');
  assert.ok(def && def.reward.goods && def.grant, 'the angler\'s first quest has goods and a grant');
  o.char.quests.active[def.id] = { step: def.steps.length, n: 0 };
  const qr = on(a, 'questR');
  a.quest('turnin', def.id); await until(clock, () => qr.length, 3000);
  assert.equal(qr[0].ok, true, JSON.stringify(qr[0]));
  await run(clock, 300);
  const want = def.reward.goods[0];
  assert.equal(o.char.bag.filter(i => i.id === want.id).reduce((n, i) => n + (i.count || 1), 0), want.count, `${want.count} x ${want.id} in the bag (one stack)`);
  assert.equal(o.char.bag.filter(i => i.kind === 'crate').length, def.reward.crates.length, 'and its crate');
  assert.ok(o.char.bag.find(i => i.id === want.id).use, 'a usable good (bait)');
  // bait goes on the hook for its casts
  const ir = on(a, 'itemR');
  a.useItem(o.char.bag.find(i => i.id === want.id).uid); await until(clock, () => ir.length);
  assert.equal(ir[0].ok, true); assert.ok(o.char.angling.bait && o.char.angling.bait.left >= 5, JSON.stringify(o.char.angling.bait));
  // minCap: the same shop kind in a low town and a high town
  const { createShops } = await import('../../js/sim/shops.js');
  const data = JSON.parse(JSON.stringify(L.shops));
  const kind = Object.entries(data.kinds).find(([, k]) => Object.values(k.categories || {}).some(c => c.minCap && Object.keys(c.minCap).length));
  if (kind) {
    const [kid, k] = kind;
    const cat = Object.values(k.categories).find(c => c.minCap && Object.keys(c.minCap).length);
    const late = Object.keys(cat.minCap)[0], need = cat.minCap[late];
    cat.bases = [late, ...cat.bases.filter(b => b !== late)].slice(0, 3); cat.count = 3;
    data.towns = { Lowtown: { levelCap: need - 1 }, Hightown: { levelCap: need + 1 } };
    const shops = createShops({ data, rng: () => 0 });
    const made = [];
    const rules = { rollLoot: () => [], room: { engine: { rpg: { rollDrop: ({ bases }) => { made.push(bases[0]); return { name: 'X ' + bases[0], baseKey: bases[0], rarity: 'normal' }; }, price: () => 5 } }, streams: { get: () => () => 0 } } };
    const npc = { id: 1, data: { npc: { shop: kid }, key: 'n1' } };
    shops.stock(npc, { level: 30, char: { level: 30 } }, rules, 'Lowtown');
    assert.ok(!made.includes(late), `${late} (needs a level-${need} town) is not on a low town's shelf`);
    made.length = 0;
    shops.stock({ ...npc, data: { ...npc.data, key: 'n2' } }, { level: 30, char: { level: 30 } }, rules, 'Hightown');
    assert.ok(made.includes(late), 'and it is where the town reaches it');
  }
  a.close(); await srv.stop();
});

test('E\'s ask / T12: a road event someone took on runs out after its `durationSec` — the quest is given up for them and they are told why; its tracker shows the time left', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province, L = world.layouts[0];
  const a = await joinReal(srv, clock, 'Slowcoach', 'warrior');
  const o = rec(world, a);
  P.devSetLevel(o.char.id, 30);
  const copy = P.copies[0], T = L.towns[0], gd = Math.hypot(L.gate.x - T.x, L.gate.z - T.z) || 1;
  P.transfer(o, copy, { x: L.gate.x + (L.gate.x - T.x) / gd * 160, z: L.gate.z + (L.gate.z - T.z) / gd * 160 }, 'test');
  await run(clock, 600);
  const RE = P.roadEvents;
  let ev = null;
  for (let k = 0; k < 20 && !ev; k++) ev = RE.spawnFor(o, 'escort');
  assert.ok(ev && ev.npc, 'an escort by the road');
  const info = RE.infoOf(ev);
  assert.ok(info.durationSec > 0 && info.what && info.onFail, 'E\'s info block: ' + JSON.stringify(info));
  assert.equal(RE.deadline(ev), null, 'no clock until someone takes it on');
  P.transfer(o, copy, { x: ev.npc.x + 1.5, z: ev.npc.z }, 'test');
  await run(clock, 600);
  const used = on(a, 'used'), qr = on(a, 'questR'), tracks = on(a, 'eventTrack'), done = on(a, 'eventDone');
  a.use(ev.npc.id); await until(clock, () => used.length);
  const offer = used[0].offers && used[0].offers[0];
  assert.ok(offer, 'the escort is offered');
  await until(clock, () => tracks.length, 2500);
  assert.equal(tracks[0].state, 'offer'); assert.equal(tracks[0].leftMs, null, 'offered: no clock yet');
  a.quest('accept', offer.id, ev.npc.id); await until(clock, () => qr.length);
  assert.equal(qr[0].ok, true, JSON.stringify(qr[0]));
  await until(clock, () => tracks.some(t => t.state === 'live' && t.leftMs > 0), 3000);
  const live = tracks.find(t => t.state === 'live' && t.leftMs > 0);
  assert.ok(live.name && live.what && live.objective.text && live.rewardText && live.kind === 'road', JSON.stringify(live).slice(0, 300));
  assert.ok(live.leftMs <= info.durationSec * 1000 && live.endsAt > 0);
  // stay with them but never walk them home: the clock runs out
  for (let t = 0; t < info.durationSec + 30 && !done.length; t += 10) {
    if (o.entity.dead) o.entity.revive(1);
    for (const m of copy.host.near(o.entity.x, o.entity.z, 60, x => x.kind === 'monster')) copy.remove(m);
    await run(clock, 10000);
  }
  assert.ok(done.length, 'it ended');
  assert.equal(done[0].result, 'fail'); assert.equal(done[0].why, 'time');
  assert.match(done[0].text, /^Event failed: /);
  assert.ok(!o.char.quests.active[offer.id], 'the quest was given up for me');
  assert.ok(!RE.events.has(ev.id), 'the event packed up');
  a.close(); await srv.stop();
});
