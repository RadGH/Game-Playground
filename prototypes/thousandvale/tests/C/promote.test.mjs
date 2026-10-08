// node --test prototypes/thousandvale/tests/C/promote.test.mjs
//
// Round 9. (1) Tempering -> Promote takes a RARE to LEGENDARY (js/rules/professions-temper.js, stream P-core): the item
// gains one legendary power. P-core checked the SHAPE; this file checks the power WORKS — it is on the sheet's power
// list, its hooks really run in a fight, two of them are shown doing what their card says, the card says what the
// effect registry says, and no promotable power is one nothing in Thousandvale reads. Also: a crafted item never rolls a
// removed property or a unique. (2) the `hit` event carries `over` (overkill / overheal) and `abs` (absorbed).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine, isLightItem } from '../../js/rules/index.js';
import { EFFECTS } from '../../js/rules/farhold.js';
import { legendaryPool, temperCheck, temperApply, freshAffix } from '../../js/rules/professions-temper.js';
import { INERT_POWERS } from '../../js/rules/tv-gear.js';
import { affixText, itemLines } from '../../js/rules/item-text.js';
import { makeRng } from '../../js/rules/rng.js';

const engine = rulesEngine();
const P = JSON.parse(readFileSync(new URL('../../data/rules/professions.json', import.meta.url), 'utf8'));
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
let n = 0;
function world(cls = 'warrior', level = 20) {
  const events = [];
  const id = `pr-${++n}`;
  const room = createRoom({ id, terrain, seed: 9, camps: [], createRules, kind: 'wilds', hooks: { log: () => {} } });
  const ev0 = room.host.event;
  room.host.event = ev => { events.push(ev); return ev0(ev); };
  const me = room.addPlayer({ id: 41, name: 'p', cls, level, xp: 0, gold: 0, room: id, x: SX, z: SZ }, null);
  const mob = (dx, dz, lvl = 16, type = 'moor_hound') => room.spawn({ kind: 'monster', type, level: lvl, x: SX + dx, z: SZ + dz, data: { noRank: true } });
  const steps = k => { for (let i = 0; i < k; i++) room.step(); };
  return { room, events, me, mob, steps, R: room.rules };
}
/** Promote a fresh rare of `base` to legendary through the REAL function, landing on power `want` (or whatever the roll gives). */
function promoted(base, want = null, level = 20) {
  const rng = makeRng(77 + base.length);
  const item = engine.makeItem({ base, rarity: 'rare', level, rng });
  assert.equal(item.rarity, 'rare');
  const pool = legendaryPool(engine, item);
  assert.ok(pool.length >= 1, `${base}: a legendary power fits it`);
  const i = want ? pool.findIndex(p => p.id === want) : 0;
  assert.ok(i >= 0, `${base}: ${want} is in its pool (${pool.map(p => p.id)})`);
  assert.equal(temperCheck(P, engine, 'temper_promote', item, { skill: 100 }).ok, true);
  const before = item.affixes.length;
  const res = temperApply(P, engine, 'temper_promote', item, { rng: () => (i + 0.5) / pool.length, skill: 100, quality: 'good' });
  assert.equal(res.ok, true); assert.equal(res.to, 'legendary');
  assert.equal(item.rarity, 'legendary'); assert.equal(item.affixes.length, before + 1, 'it keeps every property and gains one');
  assert.equal(item.legendaryEffectId, want || pool[i].id);
  return { item, pool, res };
}
/** Put `item` on (forcing the hands when a class holds something else), as the rules' own refresh would after an equip. */
function wear(w, item) {
  const u = w.me.r.unit;
  w.R.room.run(() => {
    if (item.type === 'weapon') { u.equipment.weapon = item; if (item.twoHanded) u.equipment.offhand = null; }
    else if (item.slot === 'offhand') { if (u.equipment.weapon?.twoHanded) u.equipment.weapon = engine.makeItem({ base: 'wand', level: 20, rng: makeRng(4) }); u.equipment.offhand = item; }
    else u.equipment[item.slot] = item;
    engine.rpg.refresh(u, { full: true });
  });
  return u;
}

test('promote: a rare WEAPON promoted through the real function carries a power that works in a fight — Frostbite stacks on what the sword hits, and the card says so', () => {
  const { item, res } = promoted('sword', 'frostbite');
  const power = item.affixes.find(a => a.id === 'legendary_effect');
  // the card: Thousandvale's own property printer gives the effect registry's sentence for it, and the craft result says the same
  const said = affixText(power);
  assert.equal(said, EFFECTS['legendary:frostbite'].desc(1), 'the card line is the registry\'s own sentence');
  assert.match(said, /Frostbite/);
  assert.ok(itemLines(item).includes(said));
  assert.ok(res.text.includes(said), `the craft result names the same power in the same words (${res.text})`);
  // through the real equip
  const w = world('warrior');
  const r = w.R.equip(w.me, item, 'weapon');
  assert.ok(r.ok, r.text);
  assert.ok(w.me.r.unit.legendaryPowers.includes('legendary:frostbite'), 'the sheet lists the power');
  const m = w.mob(0, 2.5); m.r.unit.maxHp = m.r.unit.hp = 1e6; m.r.unit.dmg = [0, 0];
  for (let k = 0; k < 200; k++) { w.me.r.unit.swing.mainReady = 0; w.room.intent(w.me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); }
  assert.ok(m.r.unit.statuses?.frostbite || m.r.unit.statuses?.frozen || w.events.some(e => e.type === 'fx' && e.kind === 'status' && (e.status === 'frostbite' || e.status === 'frozen')), 'the monster it hit carries Frostbite');
  // and the same sword as a plain rare leaves none
  const w0 = world('warrior');
  const plain = engine.makeItem({ base: 'sword', rarity: 'rare', level: 20, rng: makeRng(77 + 5) });
  w0.R.equip(w0.me, plain, 'weapon');
  const m0 = w0.mob(0, 2.5); m0.r.unit.maxHp = m0.r.unit.hp = 1e6; m0.r.unit.dmg = [0, 0];
  for (let k = 0; k < 200; k++) { w0.me.r.unit.swing.mainReady = 0; w0.room.intent(w0.me, { t: 'cast', slot: 0, target: m0.id }); w0.steps(1); }
  assert.ok(!m0.r.unit.statuses?.frostbite && !w0.events.some(e => e.type === 'fx' && e.kind === 'status' && e.status === 'frostbite'), 'without the power: no Frostbite');
});

test('promote: a rare ARMOUR piece promoted through the real function works — Thornmail hurts what bites you, and you never swung', () => {
  const { item } = promoted('heavy_chest', 'thornmail');
  const said = affixText(item.affixes.find(a => a.id === 'legendary_effect'));
  assert.equal(said, EFFECTS['legendary:thornmail'].desc(1)); assert.match(said, /dealt back to the attacker/);
  const run = it => {
    const w = world('warrior');
    if (it) { const r = w.R.equip(w.me, it); assert.ok(r.ok, r.text); assert.ok(w.me.r.unit.legendaryPowers.includes('legendary:thornmail')); }
    const u = w.me.r.unit; u.maxHp = u.hp = 1e7;
    const m = w.mob(0, 2.5, 18); const hp0 = m.r.unit.hp;
    w.steps(600);
    const bitten = w.events.filter(e => e.type === 'hit' && e.s === m.id && e.d === w.me.id && e.n > 0).length;
    return { lost: hp0 - m.r.unit.hp, bitten };
  };
  const withIt = run(item), without = run(null);
  assert.ok(withIt.bitten > 5 && without.bitten > 5);
  assert.equal(without.lost, 0, 'a monster biting a plain chest loses nothing');
  assert.ok(withIt.lost > 0, `biting Thornmail cost the monster ${withIt.lost} health`);
});

test('promote: EVERY power a promotion can hand out has a hook that really runs in a Thousandvale fight (none is a card with nothing behind it)', () => {
  const rng = makeRng(2);
  const CLS = { sword: 'warrior', dagger: 'rogue', bow: 'ranger', staff: 'mage', wand: 'mage', hammer: 'warrior', mace: 'warrior', scepter: 'cleric', spear: 'warrior', axe: 'warrior', sword2h: 'warrior', axe2h: 'warrior', crossbow: 'ranger', javelin: 'ranger', polearm: 'warrior', orb: 'mage', tome: 'mage' };
  const SPECIAL = { burn_extend: 'pyromancer', camp_mend: 'cleric', companion_might: 'ranger' };
  const PREFER = { burn_extend: 'necklace' };          // (a sceptre swings its own element; the pyromancer's burn comes off her staff and her bolt)
  const bases = [...Object.entries(engine.items.weaponBases).filter(([, b]) => !b.tvCatalog).map(([k]) => k),
    ...Object.entries(engine.items.armorBases).filter(([, b]) => !b.tvCatalog && !b.pack).map(([k]) => k)];
  const seen = new Map();
  for (const base of bases) {
    const it = engine.makeItem({ base, rarity: 'rare', level: 20, rng });
    if (!it) continue;
    for (const p of legendaryPool(engine, it)) {
      assert.ok(!INERT_POWERS.includes(p.id), `${base}: ${p.id} is a power nothing in Thousandvale reads`);
      if (!seen.has(p.id) || PREFER[p.id] === base) seen.set(p.id, it);
    }
  }
  assert.ok(seen.size >= 50, `${seen.size} different powers can come out of a promotion`);
  const dead = [], silent = [];
  for (const [pid, it] of seen) {
    const E = EFFECTS['legendary:' + pid], calls = {}, orig = {};
    for (const [k, f] of Object.entries(E)) if (typeof f === 'function' && k !== 'desc') { orig[k] = f; calls[k] = 0; E[k] = function (...a) { calls[k]++; return f.apply(this, a); }; }
    try {
      const item = JSON.parse(JSON.stringify(it));
      const pool = legendaryPool(engine, item), i = pool.findIndex(p => p.id === pid);
      assert.equal(temperApply(P, engine, 'temper_promote', item, { rng: () => (i + 0.5) / pool.length, skill: 100 }).ok, true);
      assert.equal(item.legendaryEffectId, pid);
      if (!affixText(item.affixes.find(a => a.id === 'legendary_effect'))) silent.push(pid);
      const w = world(SPECIAL[pid] || (item.type === 'weapon' ? CLS[item.subtype] || 'warrior' : item.slot === 'offhand' && item.isShield ? 'knight' : 'mage'));
      const u = wear(w, item);
      assert.ok(u.legendaryPowers.includes('legendary:' + pid), `${pid}: on the sheet`);
      for (let k = 0; k < 1500 && !Object.values(calls).some(c => c > 0); k++) {
        if (k % 100 === 0) for (let j = 0; j < 3; j++) w.mob(j * 2 - 2, 4);      // (owner feedback 10: one hit a swing now, so more bodies for the same number of rolls)
        if (pid === 'cheat_death_once') { if (k === 200) u.hp = 2; } else u.hp = Math.max(u.hp, u.maxHp * 0.3);
        u.mp = u.maxMp;
        const t = w.R.field.monsters.find(m => m.dying == null);
        if (t) { if (k % 40 === 0) w.room.intent(w.me, { t: 'cast', slot: 1 + (k / 40) % 6, target: t.id, aim: { x: t.x, z: t.z } }); else w.room.intent(w.me, { t: 'cast', slot: 0, target: t.id }); }
        w.steps(1);
      }
      // a power whose reader is not a fight (a gathering node's yield, a crate being opened): ask those modules
      if (!Object.values(calls).some(c => c > 0)) { w.R.gatherBonus(w.me); try { w.R.openCrate(w.me, w.R.makeCrate(w.me, { slot: 'any' })); } catch { /* a crate this build cannot fill */ } }
      if (!Object.values(calls).some(c => c > 0)) dead.push(`${pid} (${Object.keys(calls).join(', ')}) on ${item.baseKey} worn by ${w.me.cls}`);
    } finally { for (const [k, f] of Object.entries(orig)) E[k] = f; }
  }
  assert.deepEqual(silent, [], 'every power has a card sentence');
  assert.deepEqual(dead, [], 'powers whose hooks never ran in a real fight');
});

test('promote: the powers kept OUT are exactly the ones with no reader here, and a backpack, a cloak and a belt take none', () => {
  for (const id of INERT_POWERS) assert.ok(EFFECTS['legendary:' + id], `${id} is a real Farhold power (the list names nothing that is not there)`);
  const rng = makeRng(8);
  for (const base of ['sling_satchel', 'travel_cloak', 'leather_belt']) {
    const it = engine.makeItem({ base, rarity: 'rare', level: 20, rng });
    assert.equal(temperCheck(P, engine, 'temper_promote', it, { skill: 100 }).ok, false, `${base} cannot be promoted to legendary`);
  }
  // a legendary cannot be promoted again
  const { item } = promoted('dagger');
  assert.equal(temperCheck(P, engine, 'temper_promote', item, { skill: 100 }).ok, false);
});

test('crafted gear: what rules.makeItem and tempering can roll never includes a removed property (lights), a unique, or a set piece', () => {
  const w = world('warrior', 20);
  const rng = makeRng(31);
  const bases = [...Object.keys(engine.items.weaponBases), ...Object.keys(engine.items.armorBases)];
  let made = 0, rolled = 0;
  for (const base of bases) for (const rarity of ['normal', 'magic', 'rare']) for (const level of [3, 12, 24]) {
    const it = w.R.makeItem(w.me, { base, rarity, level });
    if (!it) continue;
    made++;
    assert.equal(it.rarity, rarity, `${base}: made at the rarity asked for`);
    assert.ok(!it.isUnique && !it.setId && !it.legendaryEffectId, `${it.name}: a crafted item is never a unique, a set piece or a legendary`);
    assert.ok(!isLightItem(it) && it.slot !== 'light' && !['tool', 'mount'].includes(it.slot), `${it.name}: a removed kind of item`);
    for (const a of it.affixes || []) assert.ok(!/^cond_light(?!ning)/.test(a.stat || ''), `${it.name}: carries ${a.stat}`);
    if (rarity === 'rare' && level === 12) for (let k = 0; k < 12; k++) {
      const a = freshAffix(engine, it, rng);
      if (!a) continue;
      rolled++;
      assert.ok(!/^cond_light(?!ning)|^cond_mount/.test(a.stat || ''), `reweave / promote rolled ${a.stat} for ${it.name}`);
    }
  }
  assert.ok(made > 400 && rolled > 500, `${made} items, ${rolled} tempering rolls`);
  for (const base of ['hand_lantern', 'pitch_torch']) assert.equal(w.R.makeItem(w.me, { base, rarity: 'rare', level: 5 }), null);
});

// ============================================================================ over / abs

test('hit events carry `over` (overkill, overheal) and `abs` (absorbed) — and only when there is something to say', () => {
  // overkill: a monster with 7 health left takes a hit of many times that
  {
    const w = world('warrior', 20);
    const m = w.mob(0, 2.5, 5); m.r.unit.dmg = [0, 0];
    w.steps(2);
    w.R.room.run(() => { m.r.unit.hp = 7; });
    for (let k = 0; k < 200 && !m.dead; k++) { w.me.r.unit.swing.mainReady = 0; w.room.intent(w.me, { t: 'cast', slot: 0, target: m.id }); w.steps(1); }
    const kill = w.events.filter(e => e.type === 'hit' && e.d === m.id && e.kind === 'dmg').pop();
    assert.ok(kill && kill.n > 7, `the killing blow was ${kill?.n}`);
    assert.equal(kill.over, kill.n - 7, 'over = the part of the blow past zero health');
    // a hit that does not kill says nothing
    const m2 = w.mob(0, 2.5, 5); m2.r.unit.maxHp = m2.r.unit.hp = 1e6; m2.r.unit.dmg = [0, 0];
    const from = w.events.length;
    for (let k = 0; k < 60; k++) { w.me.r.unit.swing.mainReady = 0; w.room.intent(w.me, { t: 'cast', slot: 0, target: m2.id }); w.steps(1); }
    const plain = w.events.slice(from).filter(e => e.type === 'hit' && e.d === m2.id && e.kind === 'dmg');
    assert.ok(plain.length > 0 && plain.every(e => e.over === undefined && e.abs === undefined));
  }
  // absorbed: a barrier soaks a bite
  {
    const w = world('warrior', 20);
    const u = w.me.r.unit;
    const m = w.mob(0, 2.5, 18);
    let got = null;
    for (let k = 0; k < 600 && !got; k++) { w.R.room.run(() => { u.barrier = 5; u.hp = u.maxHp; }); w.steps(1); got = w.events.find(e => e.type === 'hit' && e.s === m.id && e.d === w.me.id && e.abs > 0); }
    assert.ok(got, 'a hit on a shielded player reports what the shield took');
    assert.ok(got.abs >= 1 && got.abs <= 5, `abs ${got.abs}`);
    assert.equal(got.kind, 'dmg');
  }
  // overheal: a cleric heals someone who is 3 health short
  {
    const w = world('cleric', 20);
    const u = w.me.r.unit;
    const slot = w.R.directHealSlot('cleric');
    assert.ok(slot > 0);
    w.R.room.run(() => { u.hp = u.maxHp - 3; u.mp = u.maxMp; u.skills.slots[slot - 1].ready = 0; });
    assert.equal(w.room.intent(w.me, { t: 'cast', slot, target: w.me.id }).ok, true);
    w.steps(80);
    const heal = w.events.find(e => e.type === 'hit' && e.kind === 'heal' && e.d === w.me.id);
    assert.ok(heal, 'the heal landed');
    assert.ok(heal.n <= 3 && heal.over > 0, `healed ${heal.n}, ${heal.over} of it past full`);
  }
});

test('promote: "Burning damage you apply lasts 2s longer" is true for the pyromancer\'s own Firebolt (a stacking burn), not only for a wand\'s', () => {
  const burnLeft = withPower => {
    const w = world('pyromancer', 20);
    if (withPower) { const { item } = promoted('necklace', 'burn_extend'); const r = w.R.equip(w.me, item); assert.ok(r.ok, r.text); }
    const m = w.mob(0, 8); m.r.unit.maxHp = m.r.unit.hp = 1e6; m.r.unit.dmg = [0, 0]; m.r.unit.speed = 0;
    const u = w.me.r.unit; u.mp = u.maxMp; u.skills.slots[0].ready = 0;
    assert.equal(u.skills.slots[0].id, 'firebolt');
    assert.equal(w.room.intent(w.me, { t: 'cast', slot: 1, target: m.id }).ok, true);
    let left = 0;
    for (let k = 0; k < 60 && !left; k++) { w.steps(1); left = m.r.unit.statuses?.burn?.remaining || 0; }
    return left;
  };
  const plain = burnLeft(false), longer = burnLeft(true);
  assert.ok(plain > 0, 'Firebolt leaves a burn');
  assert.ok(Math.abs((longer - plain) - 2) < 0.11, `the burn lasts 2 s longer with the power (${plain.toFixed(2)} -> ${longer.toFixed(2)})`);
});
