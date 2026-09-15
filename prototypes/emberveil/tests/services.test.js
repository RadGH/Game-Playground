// Round 22 (E47): the blacksmith and the enchanter. Quotes show the result before any gold is spent, the
// apply matches the quote exactly, every action costs gold (scaled by rarity), and every limit holds.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Loot } from '../js/loot.js';
import { makeRng } from '../js/rng.js';

const items = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url)));
const balance = JSON.parse(fs.readFileSync(new URL('../data/balance.json', import.meta.url)));
const S = balance.services;
const loot = new Loot(items, { ...balance.loot });

test('balance.json carries the service costs and caps', () => {
  assert.ok(S.blacksmith.upgradeGold.high > S.blacksmith.upgradeGold.medium, 'each quality step costs more');
  assert.equal(S.blacksmith.qualityOrder.join(), 'low,medium,high,elite,exotic');
  for (let a = 0; a <= 6; a++) assert.ok(S.blacksmith.qualityOrder.includes(S.blacksmith.maxQualityByAct[String(a)]), `act ${a} has a quality cap`);
  assert.ok(S.enchanter.addGold > 0 && S.enchanter.rerollGold > 0 && S.enchanter.maxRerolls > 0);
  assert.ok(S.rarityCostMult.legendary > S.rarityCostMult.normal);
});

test('blacksmith: the preview is the result, gold is spent, damage goes up, the act cap holds', () => {
  const it = loot.generate('longsword', 'magic', 'low', { rng: makeRng(1) });
  const q = loot.upgradeQuote(it, S, 1);
  assert.ok(q.ok, q.why); assert.equal(q.from, 'low'); assert.equal(q.to, 'medium');
  assert.equal(q.gold, Math.round(S.blacksmith.upgradeGold.medium * S.rarityCostMult.magic));
  assert.equal(it.quality, 'low', 'a quote never touches the item');
  const wallet = { gold: 1000 };
  const r = loot.upgradeQuality(it, wallet, S, 1);
  assert.ok(r.ok); assert.equal(wallet.gold, 1000 - q.gold);
  assert.deepEqual(it.dmg, q.preview.dmg); assert.equal(it.quality, 'medium');
  assert.ok(it.dmg[1] > loot.generate('longsword', 'magic', 'low', { rng: makeRng(1) }).dmg[1], 'more damage');
  // act 1 tops out at high
  assert.ok(loot.upgradeQuality(it, wallet, S, 1).ok);
  const capped = loot.upgradeQuote(it, S, 1);
  assert.equal(capped.ok, false); assert.ok(capped.capped); assert.match(capped.why, /high/);
  // later acts allow more, and exotic is the end
  assert.ok(loot.upgradeQuality(it, wallet, S, 6).ok); assert.ok(loot.upgradeQuality(it, wallet, S, 6).ok);
  assert.equal(it.quality, 'exotic'); assert.equal(loot.upgradeQuote(it, S, 6).ok, false);
});

test('blacksmith: armour, block and barrier follow quality; not enough gold changes nothing', () => {
  const sh = loot.generate('tower_shield', 'rare', 'medium', { rng: makeRng(2) });
  const block = sh.affixes.find(a => a.id === 'base_block_power').value;
  const poor = { gold: 5 };
  const r = loot.upgradeQuality(sh, poor, S, 3);
  assert.equal(r.ok, false); assert.match(r.why, /gold/); assert.equal(poor.gold, 5); assert.equal(sh.quality, 'medium');
  assert.ok(loot.upgradeQuality(sh, { gold: 9999 }, S, 3).ok);
  assert.ok(sh.armor > items.armorBases.tower_shield.armor, 'armour scaled');
  assert.ok(sh.affixes.find(a => a.id === 'base_block_power').value > block, 'block power scaled');
  const orb = loot.generate('spellguard_orb', 'magic', 'low', { rng: makeRng(3) });
  const barrier = orb.affixes.find(a => a.id === 'base_barrier')?.value;
  if (barrier != null) { loot.upgradeQuality(orb, { gold: 9999 }, S, 3); assert.ok(orb.affixes.find(a => a.id === 'base_barrier').value >= barrier); }
});

test('enchanter: add a property — exact preview, cost grows with the slots used, the rarity cap holds', () => {
  const it = loot.generate('ring', 'rare', 'medium', { rng: makeRng(4) });
  while (loot.ownAffixes(it).length > 1) it.affixes.splice(it.affixes.findIndex(a => !a.baseIntrinsic), 1);
  const q1 = loot.addQuote(it, S); assert.ok(q1.ok, q1.why);
  const again = loot.addQuote(it, S); assert.deepEqual(again.affix, q1.affix, 'looking twice shows the same roll');
  const wallet = { gold: 5000 };
  const r = loot.enchantAdd(it, wallet, S); assert.ok(r.ok);
  assert.equal(wallet.gold, 5000 - q1.gold);
  const added = it.affixes[it.affixes.length - 1];
  assert.equal(added.id, q1.affix.id); assert.equal(added.value, q1.affix.value);
  const q2 = loot.addQuote(it, S); assert.ok(q2.gold > q1.gold, 'the next property costs more');
  while (loot.addQuote(it, S).ok) assert.ok(loot.enchantAdd(it, wallet, S).ok);
  const full = loot.addQuote(it, S);
  assert.equal(loot.ownAffixes(it).length, S.enchanter.affixCap.rare); assert.equal(full.ok, false); assert.ok(full.capped);
  // no two properties with the same stat
  const stats = loot.ownAffixes(it).map(a => a.stat); assert.equal(new Set(stats).size, stats.length);
  // a normal item has no slots at all
  const plain = loot.generate('sword', 'normal', 'medium', { rng: makeRng(5) });
  const nq = loot.addQuote(plain, S); assert.equal(nq.ok, false); assert.match(nq.why, /rarity/);
});

test('enchanter: reroll — replaces one property with a different one, costs more each time, stops at the cap', () => {
  const it = loot.generate('sword', 'rare', 'medium', { rng: makeRng(6) });
  const i = it.affixes.findIndex(a => loot.rerollable(a)); assert.ok(i >= 0, 'a rare sword has a rerollable property');
  const before = it.affixes[i];
  const q = loot.rerollQuote(it, i, S); assert.ok(q.ok, q.why);
  assert.notEqual(q.affix.id, before.id);
  const wallet = { gold: 99999 };
  const r = loot.enchantReroll(it, i, wallet, S); assert.ok(r.ok);
  assert.equal(it.affixes[i].id, q.affix.id); assert.equal(it.affixes[i].value, q.affix.value);
  assert.equal(it.rerolls, 1);
  const q2 = loot.rerollQuote(it, i, S); assert.ok(q2.gold > q.gold, 'rerolling the same item again costs more');
  for (let n = 1; n < S.enchanter.maxRerolls; n++) assert.ok(loot.enchantReroll(it, i, wallet, S).ok, `reroll ${n + 1}`);
  const stop = loot.rerollQuote(it, i, S); assert.equal(stop.ok, false); assert.ok(stop.capped);
});

test('enchanter: the fixed powers of uniques and set pieces cannot be rerolled; rarity rises with gold and material', () => {
  const u = loot.generateUnique(items.uniques[0].id, makeRng(7));
  const li = u.affixes.findIndex(a => a.id === 'legendary_effect');
  assert.equal(loot.rerollQuote(u, li, S).ok, false);
  const setPiece = loot.generateSetItem('longwatch_stalker', 0, 'high', makeRng(8));
  const fi = setPiece.affixes.findIndex(a => a.setFixed);
  assert.equal(loot.rerollQuote(setPiece, fi, S).ok, false);
  assert.equal(loot.promoteQuote(setPiece, S).ok, false, 'a set piece is already as rare as it gets');

  const n = loot.generate('sword', 'normal', 'medium', { rng: makeRng(9) });
  const p = loot.promoteQuote(n, S); assert.ok(p.ok); assert.equal(p.to, 'magic'); assert.equal(p.slotsTo, 2);
  const wallet = { gold: 10000 }, mats = { rare_dust: 0, legend_core: 0 };
  assert.ok(loot.enchantPromote(n, wallet, mats, S).ok); assert.equal(n.rarity, 'magic');
  const noDust = loot.enchantPromote(n, wallet, mats, S);
  assert.equal(noDust.ok, false); assert.match(noDust.why, /rare dust/); assert.equal(n.rarity, 'magic');
  mats.rare_dust = 1; const g = wallet.gold;
  assert.ok(loot.enchantPromote(n, wallet, mats, S).ok); assert.equal(n.rarity, 'rare'); assert.equal(mats.rare_dust, 0); assert.equal(wallet.gold, g - S.enchanter.promoteGold.rare);
});

test('generated names follow the work; custom names stay', () => {
  const it = loot.generate('sword', 'magic', 'medium', { rng: makeRng(10) });
  while (loot.ownAffixes(it).length) it.affixes.splice(it.affixes.findIndex(a => !a.baseIntrinsic), 1);
  loot.rename(it); assert.equal(it.name, it.baseName);
  loot.enchantAdd(it, { gold: 9999 }, S);
  assert.equal(it.name, loot.autoName(it), 'a generated name picks up the new property');
  const named = loot.generate('sword', 'magic', 'medium', { rng: makeRng(11) }); named.name = "Corvin's Sword";
  while (loot.ownAffixes(named).length) named.affixes.splice(named.affixes.findIndex(a => !a.baseIntrinsic), 1);
  loot.enchantAdd(named, { gold: 9999 }, S); assert.equal(named.name, "Corvin's Sword");
});
