// Stream D — inventory logic (play-test P7, P15, P16): slots, required level, filters, sorting, compare and the
// icon cache key. Pure (js/client/ui/inv-core.js). Real items come from Farhold's own generator so the shapes
// match what the server sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  slotOf, altSlotOf, requiredLevel, levelCheck, filterGroup, viewBag, compareTo, isUpgrade, plainScore, iconSpec, armourTier,
  DOLL_SLOTS, SLOT_NAME,
} from '../../js/client/ui/inv-core.js';
import { prepareRules, rulesEngine } from '../../js/rules/index.js';

const sword = { uid: 's1', name: 'Rusty Sword', type: 'weapon', subtype: 'sword', slot: 'weapon', dmg: [3, 6], rarity: 'normal', levelReq: 1, offHandOk: true };
const greatsword = { uid: 's2', name: 'Big Greatsword', type: 'weapon', subtype: 'greatsword', slot: 'weapon', dmg: [12, 20], rarity: 'rare', levelReq: 9, twoHanded: true };
const helm = { uid: 'h1', name: 'Plate Helm', type: 'armor', slot: 'head', armor: 6, rarity: 'magic', levelReq: 4, baseKey: 'plate_helm', tier: 'heavy', affixes: [{ stat: 'hp', value: 10 }] };
const ring = { uid: 'r1', name: 'Gold Signet', type: 'accessory', slot: 'ring', rarity: 'rare', levelReq: 2, affixes: [{ stat: 'str', value: 3 }] };
const junk = { uid: 'j1', name: 'Bent Nail', kind: 'junk', rarity: 'normal', value: 1 };

test('slots: weapons go in the main hand, one-handers may take the off hand, rings either hand', () => {
  assert.equal(slotOf(sword), 'weapon');
  assert.equal(altSlotOf(sword), 'offhand');
  assert.equal(altSlotOf(greatsword), null, 'a two-hander has no other slot');
  assert.equal(slotOf(ring), 'ring'); assert.equal(altSlotOf(ring), 'ring2');
  assert.equal(slotOf({ slot: 'ring1' }), 'ring');
  assert.equal(slotOf(junk), null);
  for (const s of DOLL_SLOTS) assert.ok(SLOT_NAME[s], `${s} has a label`);
});

test('required level (P15): levelReq, lowered by cond_levelReqReduce on the item or worn gear, red when too high', () => {
  assert.equal(requiredLevel(greatsword), 9);
  assert.equal(requiredLevel({ ...greatsword, affixes: [{ stat: 'cond_levelReqReduce', value: 3 }] }), 6);
  assert.equal(requiredLevel(greatsword, { ring: { affixes: [{ stat: 'cond_levelReqReduce', value: 2 }] } }), 7);
  assert.deepEqual(levelCheck(greatsword, 5), { level: 9, ok: false, reduced: false });
  assert.equal(levelCheck(greatsword, 9).ok, true);
  assert.equal(requiredLevel({ ilvl: 10 }), 9, 'no levelReq: derived from the item level');
});

test('filters: weapons / armour / jewellery / other / upgrades', () => {
  assert.equal(filterGroup(sword), 'weapon'); assert.equal(filterGroup(helm), 'armour'); assert.equal(filterGroup(ring), 'jewel'); assert.equal(filterGroup(junk), 'other');
  const bag = [sword, greatsword, helm, ring, junk];
  assert.deepEqual(viewBag(bag, { filter: 'armour' }).map(i => i.uid), ['h1']);
  assert.deepEqual(viewBag(bag, { filter: 'jewel' }).map(i => i.uid), ['r1']);
  // level 5, wearing the rusty sword: the greatsword is better but too high, the helm/ring fill empty slots
  const up = viewBag(bag.filter(i => i !== sword), { filter: 'up', equipment: { weapon: sword }, level: 5 }).map(i => i.uid).sort();
  assert.deepEqual(up, ['h1', 'r1']);
  assert.deepEqual(viewBag(bag, { search: 'sword' }).map(i => i.uid).sort(), ['s1', 's2']);
});

test('sorting: newest, best, rarity, slot, level, name — never mutates the bag', () => {
  const bag = [sword, greatsword, helm, ring, junk];
  const copy = bag.slice();
  assert.deepEqual(viewBag(bag, { sort: 'new' }).map(i => i.uid), ['j1', 'r1', 'h1', 's2', 's1']);
  assert.equal(viewBag(bag, { sort: 'best' })[0].uid, 's2');
  assert.deepEqual(viewBag(bag, { sort: 'rarity' }).slice(0, 2).map(i => i.uid).sort(), ['r1', 's2']);
  assert.equal(viewBag(bag, { sort: 'slot' })[0].type, 'weapon');
  assert.equal(viewBag(bag, { sort: 'level' })[0].uid, 's2');
  assert.deepEqual(viewBag(bag, { sort: 'name' }).map(i => i.name), ['Bent Nail', 'Big Greatsword', 'Gold Signet', 'Plate Helm', 'Rusty Sword']);
  assert.deepEqual(bag, copy);
});

test('compare: delta against the worn item, the other slot on request, empty slot = no delta', () => {
  const c = compareTo(greatsword, { weapon: sword });
  assert.equal(c.slot, 'weapon'); assert.equal(c.worn, sword); assert.equal(c.delta, plainScore(greatsword) - plainScore(sword));
  assert.ok(c.delta > 0);
  const r = compareTo(ring, { ring: { uid: 'x', affixes: [{ stat: 'str', value: 9 }] } }, { alt: true });
  assert.equal(r.slot, 'ring2'); assert.equal(r.worn, null); assert.equal(r.delta, null);
  assert.equal(isUpgrade(greatsword, { weapon: sword }, 9), true);
  assert.equal(isUpgrade(sword, { weapon: greatsword }, 9), false);
});

test('icons (P16, play-test 8 W25): one cache key per distinct picture; every picture is the WORN model (gear-look.js), jewellery the catalog does not draw is a glyph', async () => {
  const { gearLook } = await import('../../js/client/gear-look.js');
  const a = iconSpec(sword), b = iconSpec({ ...sword, uid: 'other', name: 'Another Sword' });
  assert.equal(a.kind, 'held'); assert.equal(a.key, b.key, 'two plain swords share an icon');
  assert.equal(a.id, gearLook({ weapon: sword }).held.id, 'the sword in the icon is the sword in the hand');
  assert.notEqual(iconSpec(greatsword).key, a.key);
  const h = iconSpec(helm);
  assert.equal(h.kind, 'worn'); assert.equal(h.slot, 'hat'); assert.equal(h.frame, 'bust');
  assert.deepEqual(h.parts.hat, gearLook({ head: helm }).hat, 'the helm in the icon is the helm on the head');
  assert.equal(iconSpec(ring).kind, 'glyph'); assert.equal(iconSpec(ring).id, 'ring');
  assert.equal(iconSpec(junk).id, 'junk');
  // the caller's `worn` (the game passes wornPart with the catalog and the class kit) decides — nothing here overrides it
  assert.equal(iconSpec(sword, { worn: () => ({ partSlot: 'held', part: { id: 'fh_rapier', color: '#fff', quality: 1 }, parts: {} }) }).id, 'fh_rapier');
  assert.equal(armourTier({ name: 'Chain Shirt' }), 'medium');
});

test('real Farhold items: every rolled item has a slot, a required level and an icon spec', async () => {
  await prepareRules();
  const rpg = rulesEngine().rpg;
  let n = 0;
  for (const lv of [1, 5, 12, 25]) for (let i = 0; i < 40; i++) {
    const it = rpg.rollDrop({ level: lv, rarityBoost: 2 }); if (!it) continue; n++;
    assert.ok(slotOf(it), `${it.name} has a slot`);
    assert.ok(requiredLevel(it) >= 1);
    const sp = iconSpec(it); assert.ok(sp && sp.key, `${it.name} has an icon`);
  }
  assert.ok(n > 40);
});

test('no native title tooltips in the inventory files', () => {
  for (const f of ['../../js/client/bag.js', '../../js/client/ui/item-card.js', '../../js/client/mail.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/\btitle:\s*`|\.title\s*=|title="/.test(src), `${f} uses a native title`);
  }
});

test('a shield is not an upgrade beside a two-handed weapon', () => {
  const shield = { uid: 'sh', name: 'Shield', type: 'armor', slot: 'offhand', armor: 5, isShield: true, levelReq: 1 };
  assert.equal(isUpgrade(shield, { weapon: greatsword }, 10), false);
  assert.equal(isUpgrade(shield, { weapon: sword }, 10), true);
});
