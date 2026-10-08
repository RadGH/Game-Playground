// Play-test 5, T5 — starter kits: data/rules/starter-kits.json + js/rules/starter-kits.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineFor, readJson } from './setup.mjs';
import { setKitSource, kitPlan, kitsFor, validKit, starterGear, KIT_ARMOUR_BASES } from '../../js/rules/starter-kits.js';
import { createCharacter } from '../../js/rules/character.js';
import { staffSpell } from '../../js/rules/farhold.js';

const json = readJson(new URL('../../data/rules/starter-kits.json', import.meta.url));
const engine = await engineFor(1);
setKitSource(engine, json);

const TIER = ['cloth', 'light', 'medium', 'heavy'];
const tierOf = key => TIER.indexOf(key.split('_')[0]);
const base = key => engine.items.weaponBases[key] || engine.items.armorBases[key] || null;
const STYLES = ['bolt', 'burst', 'fan', 'chain', 'seeking', 'heavy', 'cone', 'beam', 'nova', 'lob', 'fork', 'ward', 'pool'];
const ELEMENTS = ['fire', 'ice', 'lightning', 'poison', 'shadow', 'arcane'];       // Farhold's CAST_ELEMENTS (no holy attunement)
const FOCI = ['orb', 'tome', 'grimoire', 'seer_orb', 'reliquary', 'psalter', 'effigy', 'warded_focus', 'spellguard_orb'];
/** A class that is offered the caster's choice: an INT class that uses wands or spell staves and does not start with a pole. */
const isCaster = c => c.primaryAttr === 'INT' && (c.weapons || []).some(w => w === 'wand' || w === 'staff') && c.starter !== 'quarterstaff';
/** The heaviest armour a class wears: its armorTier, or its own Farhold starting armour when that is heavier. */
const maxTier = c => Math.max(TIER.indexOf(c.armorTier), ...(c.startingArmour || []).filter(k => KIT_ARMOUR_BASES.includes(k)).map(tierOf));

test('every class has 3 armour sets and 3-6 weapon packs, built only from bases that exist', () => {
  assert.equal(engine.classes.length, 31);      // Farhold's thirty and Thousandvale's own Starcaller (owner feedback 10, Y32)
  assert.deepEqual(Object.keys(json.classes).sort(), engine.classes.map(c => c.id).sort());
  const bad = [];
  for (const c of engine.classes) {
    const p = kitPlan(c.id);
    if (p.armour.length !== 3) bad.push(`${c.id}: ${p.armour.length} armour sets`);
    if (p.weapons.length < 4 || p.weapons.length > 7) bad.push(`${c.id}: ${p.weapons.length} weapon packs`);   // owner feedback 6 (U15): more packs
    for (const list of [p.armour, p.weapons]) {
      const ids = list.map(x => x.id);
      if (new Set(ids).size !== ids.length) bad.push(`${c.id}: duplicate id in ${ids}`);
      for (const x of list) if (!x.id || !x.name || !x.blurb) bad.push(`${c.id}/${x.id}: id, name and blurb are all needed`);
    }
    for (const a of p.armour) for (const k of a.pieces) if (!engine.items.armorBases[k]) bad.push(`${c.id}/${a.id}: no armour base ${k}`);
    for (const w of p.weapons) {
      if (!engine.items.weaponBases[w.main]) bad.push(`${c.id}/${w.id}: no weapon base ${w.main}`);
      if (w.off && !base(w.off)) bad.push(`${c.id}/${w.id}: no base ${w.off}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('armour is budget gear: three pieces a set, one per body slot, never heavier than the class wears', () => {
  const bad = [];
  for (const c of engine.classes) {
    const cap = maxTier(c);
    const shapes = new Set();
    for (const a of kitPlan(c.id).armour) {
      if (a.pieces.length !== 3) bad.push(`${c.id}/${a.id}: ${a.pieces.length} pieces`);
      const slots = a.pieces.map(k => engine.items.armorBases[k]?.slot);
      if (new Set(slots).size !== slots.length) bad.push(`${c.id}/${a.id}: two pieces on one slot`);
      for (const k of a.pieces) {
        if (!KIT_ARMOUR_BASES.includes(k)) bad.push(`${c.id}/${a.id}: ${k} is not budget armour`);
        const slot = engine.items.armorBases[k]?.slot;
        // there is no cloth glove or shoe base: a cloth wearer's hands and feet take the lightest there is (light)
        const allowed = tierOf(k) <= cap || ((slot === 'hands' || slot === 'feet') && tierOf(k) === 1);
        if (!allowed) bad.push(`${c.id}/${a.id}: ${k} is heavier than a ${c.armorTier} class wears`);
      }
      shapes.add([...a.pieces].sort().join('+'));
    }
    if (shapes.size !== 3) bad.push(`${c.id}: two armour sets are the same pieces`);
    // the first set holds the old Farhold starting armour
    const first = kitPlan(c.id).armour[0].pieces;
    for (const k of (c.startingArmour || []).filter(x => KIT_ARMOUR_BASES.includes(x))) if (!first.includes(k)) bad.push(`${c.id}: the first set lost its old ${k}`);
  }
  assert.deepEqual(bad, []);
});

test('weapon packs obey the hands: no off hand with a two-hander, shields only for shield classes, the first pack is the old starter', () => {
  const bad = [];
  for (const c of engine.classes) {
    const packs = kitPlan(c.id).weapons;
    for (const w of packs) {
      const main = engine.items.weaponBases[w.main], off = w.off ? base(w.off) : null;
      const quiverWithBow = w.off === 'quiver' && main.ranged && main.weaponCategory !== 'magic';
      if (main.twoHanded && w.off && !quiverWithBow) bad.push(`${c.id}/${w.id}: ${w.main} takes both hands, ${w.off} cannot be held`);
      if (off?.type === 'weapon' && off.twoHanded) bad.push(`${c.id}/${w.id}: a two-hander in the off hand`);
      if (off?.type === 'weapon' && off.ranged) bad.push(`${c.id}/${w.id}: a drawn weapon in the off hand`);
      if (off?.isShield && w.off !== 'buckler' && !c.shield) bad.push(`${c.id}/${w.id}: ${c.id} carries no shield`);
      const magic = main.weaponCategory === 'magic' && w.main !== 'quarterstaff';
      if (magic && !ELEMENTS.includes(w.element)) bad.push(`${c.id}/${w.id}: a caster weapon names its element (${w.element})`);
      if (!magic && (w.element || w.style || w.spell)) bad.push(`${c.id}/${w.id}: element / style / spell on a weapon that casts nothing`);
      if (w.main === 'wand' && !STYLES.includes(w.style)) bad.push(`${c.id}/${w.id}: wand style ${w.style}`);
      // owner feedback 10 (Y16): a tome is a main-hand caster weapon with a form of its own
      if (w.main === 'tome' && !engine.casterForms.styles[w.style]?.tome) bad.push(`${c.id}/${w.id}: tome form ${w.style}`);
      if (w.main !== 'wand' && w.main !== 'tome' && w.style) bad.push(`${c.id}/${w.id}: only a wand or a tome has a style`);
      if (w.main === 'staff' && staffSpell({ staffSpell: w.spell }, w.element).key !== w.spell) bad.push(`${c.id}/${w.id}: no ${w.element} staff spell "${w.spell}"`);
      if (w.main !== 'staff' && w.spell) bad.push(`${c.id}/${w.id}: only a staff has a spell`);
      if (c.armorTier === 'cloth' && c.primaryAttr === 'INT' && main.weaponCategory === 'heavy') bad.push(`${c.id}/${w.id}: a cloth caster with ${w.main}`);
    }
    const oldOff = c.offStarter || (c.startingArmour || []).find(k => engine.items.armorBases[k]?.slot === 'offhand') || null;
    // owner feedback 6 (U15): the first pack still holds the old starter WEAPON, but never a bare one-hander any more
    if (packs[0].main !== (c.starter || 'sword') || (oldOff && (packs[0].off || null) !== oldOff)) bad.push(`${c.id}: first pack ${packs[0].main}+${packs[0].off || '-'} is not the old ${c.starter}+${oldOff || '-'}`);
  }
  assert.deepEqual(bad, []);
});

test('casters choose from at least five packs: two wand styles, two staves and a focus', () => {
  const bad = [];
  let n = 0;
  for (const c of engine.classes.filter(isCaster)) {
    n++;
    const packs = kitPlan(c.id).weapons;
    if (packs.length < 5) bad.push(`${c.id}: ${packs.length} packs`);
    if (new Set(packs.filter(w => w.main === 'wand').map(w => w.style)).size < 2) bad.push(`${c.id}: fewer than two wand styles`);
    const staves = packs.filter(w => w.main === 'staff');
    if (new Set(staves.map(w => `${w.element}:${w.spell}`)).size < 2) bad.push(`${c.id}: fewer than two different staves`);
    if (!packs.some(w => FOCI.includes(w.off))) bad.push(`${c.id}: no focus pack`);
  }
  assert.ok(n >= 10, `${n} caster classes`);
  assert.deepEqual(bad, []);
  // across the whole table every wand style is offered somewhere
  const seen = new Set(Object.values(json.classes).flatMap(k => k.weapons).map(w => w.style).filter(Boolean));
  assert.deepEqual(STYLES.filter(s => !seen.has(s)), []);
});

test('names are unique across the file and nothing uses a banned word', () => {
  const names = [], text = [];
  for (const k of Object.values(json.classes)) for (const x of [...k.armour, ...k.weapons]) { names.push(x.name); text.push(`${x.id} ${x.name} ${x.blurb}`); }
  const dup = names.filter((x, i) => names.indexOf(x) !== i);
  assert.deepEqual(dup, []);
  assert.deepEqual(text.filter(t => /ember|veil|muster/i.test(t)), []);
  assert.deepEqual(text.filter(t => /\d/.test(t.replace(/^\S+ /, ''))), [], 'a kit blurb carries no numbers (numbers come from the item card)');
});

test('kitsFor hands back real, equal items every time', () => {
  for (const c of engine.classes) {
    const a = kitsFor(c.id), b = kitsFor(c.id);
    assert.deepEqual(a, b, `${c.id}: two calls differ`);
    assert.equal(a.cls, c.id);
    for (const set of a.armour) {
      assert.equal(set.items.length, 3, `${c.id}/${set.id}`);
      for (const it of set.items) assert.ok(it.name && it.type === 'armor' && it.slot && it.starter && it.rarity === 'normal', `${c.id}/${set.id}: ${JSON.stringify(it).slice(0, 120)}`);
    }
    const plan = kitPlan(c.id);
    for (const [i, pack] of a.weapons.entries()) {
      const row = plan.weapons[i];
      assert.equal(pack.items.length, row.off ? 2 : 1, `${c.id}/${pack.id}`);
      const main = pack.items[0];
      assert.ok(main.name && main.type === 'weapon' && main.slot && main.starter, `${c.id}/${pack.id}`);
      assert.equal(main.baseKey, row.main);
      assert.equal(main.affixes.filter(x => !x.baseIntrinsic && !x.intrinsic).length, 0, `${c.id}/${pack.id}: a starter rolls no affixes`);
      if (row.element) assert.equal(main.castElement, row.element, `${c.id}/${pack.id}: the element on the card is the one the pack names`);
      if (row.spell) assert.equal(staffSpell(main, main.castElement).key, row.spell);
      if (row.style) assert.equal(main.castStyle, row.style);   // (wandBehaviour is what Farhold's own readers are told: its nearest of six)
      if (row.main === 'quarterstaff') assert.ok(!main.castElement, 'a quarterstaff is a pole');
      for (const it of pack.items) assert.ok(it.name && it.slot && it.starter);
    }
  }
  // with no engine the rows still list (names, blurbs, base keys), with no items
  const bare = kitsFor('warrior', json, null);
  assert.equal(bare.armour.length, 3);
});

test('starterGear is worn exactly as given, for every class and every choice', () => {
  for (const c of engine.classes) {
    const plan = kitPlan(c.id);
    for (const [i, pack] of plan.weapons.entries()) {
      const set = plan.armour[i % 3];
      const equipment = starterGear(c.id, { armour: set.id, weapons: pack.id });
      assert.equal(Object.keys(equipment)[0], 'weapon', 'the main hand is restored first');
      assert.equal(!!equipment.offhand, !!pack.off, `${c.id}/${pack.id}: off hand`);
      const ch = createCharacter(engine, { id: 1, classId: c.id, level: 1, gear: { equipment: JSON.parse(JSON.stringify(equipment)) } });
      const worn = Object.fromEntries(Object.entries(ch.equipment).filter(([, it]) => it).map(([s, it]) => [s, it.baseKey]));
      const want = Object.fromEntries(Object.entries(equipment).map(([s, it]) => [s, it.baseKey]));
      assert.deepEqual(worn, want, `${c.id}/${pack.id}+${set.id}`);
      assert.equal(ch.bag.length, 0, `${c.id}/${pack.id}: nothing fell into the bag`);
      assert.ok(ch.derived.damage[0] > 0 && ch.derived.damage[1] >= ch.derived.damage[0] && ch.maxHp > 0, `${c.id}/${pack.id}: sheet`);
      assert.equal(worn.weapon, pack.main);
    }
  }
});

test('validKit: a missing or unknown id is the first of each, an unknown class is refused', () => {
  const p = kitPlan('mage');
  assert.deepEqual(validKit('mage'), { ok: true, armour: p.armour[0].id, weapons: p.weapons[0].id });
  assert.deepEqual(validKit('mage', { armour: p.armour[2].id, weapons: p.weapons[3].id }), { ok: true, armour: p.armour[2].id, weapons: p.weapons[3].id });
  assert.deepEqual(validKit('mage', { armour: 'nope', weapons: p.weapons[1].id }), { ok: true, armour: p.armour[0].id, weapons: p.weapons[1].id, fell: ['armour'] });
  assert.equal(validKit('no_such_class', {}).ok, false);
  assert.equal(starterGear('no_such_class', {}), null);
  assert.equal(kitsFor('no_such_class'), null);
});

// E's ask (play-test 5): "Starfall Staff" slipped through. Every kit name, blurb and kit ITEM name against the whole
// banned list of the playground's CLAUDE.md (convention 9), not only ember / veil / muster.
test('no kit name, blurb or kit item name uses a banned word (CLAUDE.md convention 9)', async () => {
  const { readFileSync } = await import('node:fs');
  const BANNED = ['Heroic', 'Mythic', 'keystone', 'War Mode', 'Horde', 'Alliance', 'Hearthstone', 'Delve', 'Renown', 'Rested XP', 'Honored', 'Revered', 'Exalted',
    'Fury', 'Focus', 'Rage', 'combo points', 'Garrote', 'Cheap Shot', 'Prowl', 'Maul', 'Rake', 'Barkskin', 'Totemic Recall', 'soul shards', 'Arcane Charge', 'Blink',
    'Counterspell', 'Lay on Hands', 'Consecration', 'Mass Resurrection', 'Healing Wave', 'Last Stand', 'Mirror Image', 'Leap of Faith', 'Hellfire', 'Starfall',
    'soulbound', 'flight path', 'attunement', 'Chi', 'ember', 'veil', 'muster'];
  // 'Focus' is banned as a RESOURCE name; an off-hand focus is this game's own item kind, so it is allowed in a blurb
  const rx = w => new RegExp(`\\b${w}\\b`, 'i');
  const json = JSON.parse(readFileSync(new URL('../../data/rules/starter-kits.json', import.meta.url), 'utf8'));
  const { engineFor } = await import('./setup.mjs');
  const { setKitSource, kitsFor } = await import('../../js/rules/starter-kits.js');
  const eng = await engineFor(2);
  setKitSource(eng, json);
  const bad = [];
  const check = (where, text) => { for (const w of BANNED) if (w !== 'Focus' && rx(w).test(text || '')) bad.push(`${where}: "${text}" (${w})`); };
  for (const cls of Object.keys(json.classes)) {
    const k = kitsFor(cls, json, eng);
    for (const row of [...k.armour, ...k.weapons]) {
      check(`${cls}/${row.id} name`, row.name); check(`${cls}/${row.id} blurb`, row.blurb);
      // an item's own name may carry Farhold's element word ("Flame", "Gloom" …) — those are checked like any other
      for (const it of row.items) check(`${cls}/${row.id} item`, it.baseName || it.name);
    }
  }
  assert.deepEqual(bad, []);
});

// Owner feedback 6 (U15): "why choose a single longsword when you can pick a longsword AND a shield".
test('no weapon pack is strictly worse than another: every pack fills both hands or is a two-hander; shield classes have a one-hander with a shield', async () => {
  const { readFileSync } = await import('node:fs');
  const json = JSON.parse(readFileSync(new URL('../../data/rules/starter-kits.json', import.meta.url), 'utf8'));
  const classes = JSON.parse(readFileSync(new URL('../../../farhold/data/classes.json', import.meta.url), 'utf8')).classes;
  const { engineFor } = await import('./setup.mjs');
  const { setKitSource, kitsFor } = await import('../../js/rules/starter-kits.js');
  const eng = await engineFor(3);
  setKitSource(eng, json);
  const bad = [];
  for (const c of classes) {
    const k = kitsFor(c.id, json, eng);
    const sig = new Set();
    for (const pack of k.weapons) {
      const [main, off] = pack.items;
      if (!main) { bad.push(`${c.id}/${pack.id}: no main hand`); continue; }
      if (!main.twoHanded && !off) bad.push(`${c.id}/${pack.id}: a bare ${main.name} with an empty off hand`);
      if (main.twoHanded && off) bad.push(`${c.id}/${pack.id}: a two-hander with an off hand`);
      // a pack that is another pack minus something
      const key = `${pack.main}|${pack.off || ''}|${pack.style || ''}|${pack.element || ''}|${pack.spell || ''}`;
      if (sig.has(key)) bad.push(`${c.id}/${pack.id}: the same pack twice`);
      sig.add(key);
    }
    for (const a of k.weapons) for (const b of k.weapons) if (a !== b && a.main === b.main && !a.off && b.off && (a.style || '') === (b.style || '') && (a.element || '') === (b.element || '')) bad.push(`${c.id}: ${a.id} is ${b.id} without its off hand`);
    if (c.shield && !k.weapons.some(p => !p.items[0].twoHanded && p.items[1]?.isShield)) bad.push(`${c.id}: can carry a shield but no pack has one beside a one-hander`);
  }
  assert.deepEqual(bad, []);
});
