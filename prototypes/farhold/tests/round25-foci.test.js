// node --test prototypes/farhold/tests/round25-foci.test.js
//
// Round 25 #19 — "Book/tome should be an off-hand for casters to use along with a wand. They should
// have their own distinct feature… drastically different compared to using a 2nd wand or a shield.
// There should also be unique and set versions of these new items… maybe relics or orbs."
//
// Every focus is generated, worn, and made to act through the running code: a property that only
// exists in the data is this project's signature fault.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Rpg, offhandLookFor } from '../js/rpg.js';
import { EFFECTS, FOCI, effectFor } from '../js/effects.js';
import { createSkillBar } from '../js/skills.js';
import { installUniques, tickAuras, afterDamaged } from '../js/uniques.js';
import { installFoci, FOCUS_BASES, FOCUS_UNIQUES, FOCUS_SETS, focusLook } from '../js/foci.js';
import { ENGINE_UNIT } from '../js/affixes.js';
import { makeRng } from '../../emberveil/js/rng.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', f), 'utf8'));
const describe = id => EFFECTS['legendary:' + id]?.desc() || null;

function world() {
  const items = JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));
  const balance = read('data/balance.json');
  installUniques(items, read('data/uniques.json'), { tools: read('data/tools.json'), describe });
  installFoci(items, { describe, balance });
  return { items, balance, r: new Rpg(items, balance) };
}

function wearing(item, { r } = world()) {
  const p = r.createPlayer({ classId: 'mage', level: 50 });
  const refused = r.equip(p, item);
  assert.ok(!refused?.refused, `could not equip ${item.name}: ${refused?.why || refused?.refused}`);
  r.refresh(p, { full: true });
  return { r, p };
}

test('installing twice does not double anything, and nothing is written for Emberveil', () => {
  const { items, balance } = world();
  const before = items.uniques.length, sets = items.sets.length;
  installFoci(items, { describe, balance });
  assert.equal(items.uniques.length, before);
  assert.equal(items.sets.length, sets);
  const fresh = JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));
  for (const key of Object.keys(FOCUS_BASES)) assert.ok(!fresh.armorBases[key], `${key} leaked into items.json`);
});

test('every focus base generates, is an off-hand, carries its property and drops', () => {
  const { r, balance } = world();
  const top = balance.lootTiers.at(-1).bases;
  for (const key of Object.keys(FOCUS_BASES)) {
    const item = r.loot.generate(key, 'magic', 'medium', { rng: makeRng(4) });
    assert.equal(item.slot, 'offhand', key);
    assert.ok(!item.isShield && !item.isMagicShield, `${key} is not a shield`);
    const prop = FOCUS_BASES[key].intrinsic[0].stat;
    assert.ok(item.affixes.some(a => a.stat === prop), `${key} lost ${prop}`);
    // the Psalter (2026-09-25, the paladin's book) is the plain focus: its property is a straight
    // spell-power share rather than a flag with a power of its own
    if (key === 'psalter') assert.equal(ENGINE_UNIT[prop], 'frac');
    else {
      assert.equal(ENGINE_UNIT[prop], 'flag');
      assert.ok(effectFor({ stat: prop }) || EFFECTS['affix:' + prop], `${prop} has no effect`);
    }
    assert.ok(top.includes(key), `${key} never drops`);
    assert.equal(offhandLookFor(item).id, FOCUS_BASES[key].look, `${key} is drawn as the wrong thing`);
  }
});

test('every focus unique and the set piece resolve to a power the registry knows', () => {
  const { r, items } = world();
  for (const u of FOCUS_UNIQUES) {
    assert.ok(EFFECTS['legendary:' + u.legendaryEffect], `${u.name}: ${u.legendaryEffect} is not in the registry`);
    const item = r.loot.generateUnique(u.id, makeRng(2));
    assert.ok(item?.affixes.some(a => a.legendaryId === u.legendaryEffect), u.name);
    assert.ok(item.affixes.some(a => /^cond_focus/.test(a.stat)), `${u.name} lost its base property`);
    assert.ok(items.legendaryEffects[u.legendaryEffect], `${u.legendaryEffect} has no card text`);
  }
  for (const set of FOCUS_SETS) {
    assert.ok(EFFECTS['legendary:' + set.legendaryEffect]);
    set.items.forEach((_, i) => assert.ok(r.loot.generateSetItem(set.id, i, 'high', makeRng(i)), `${set.name} piece ${i}`));
  }
});

test('the grimoire throws a page on every third bolt, never on a swing, and cuts skill cost', () => {
  const { r } = world();
  const { p } = wearing(r.loot.generate('grimoire', 'normal', 'medium', { rng: makeRng(1) }), { r });
  const twins = [1, 2, 3, 4, 5, 6].map(() => r.attackMods(p, 'bolt').twin?.power || 0);
  assert.deepEqual(twins.map(t => t > 0), [false, false, true, false, false, true]);
  assert.equal(twins[2], FOCI.grimoire.page);
  assert.ok(!r.attackMods(p, 'melee').twin);
  assert.ok(Math.abs(p.derived.skillCostPct - FOCI.grimoire.manaCut) < 1e-9);
  const skill = { mp: 20 };
  const bare = r.createPlayer({ classId: 'mage', level: 50 });
  const data = read('data/skills.json');
  const withBook = createSkillBar({ data, player: p, rpg: r }).costFor(skill);
  const without = createSkillBar({ data, player: bare, rpg: r }).costFor(skill);
  assert.equal(withBook, Math.round(20 * (1 - FOCI.grimoire.manaCut)));
  assert.equal(without, 20);
});

test('the seer\'s orb strikes only the nearest enemy, in a fight', () => {
  const { r } = world();
  const { p } = wearing(r.loot.generate('seer_orb', 'normal', 'medium', { rng: makeRng(1) }), { r });
  const struck = [];
  const near = { id: 'near', x: 2, z: 0, hp: 1e6, maxHp: 1e6, dying: null, statuses: {} };
  const far = { id: 'far', x: 6, z: 0, hp: 1e6, maxHp: 1e6, dying: null, statuses: {} };
  const env = {
    player: p, at: () => ({ x: 0, z: 0 }), rng: () => 0,
    near: (x, z, rad) => [near, far].filter(e => Math.hypot(e.x - x, e.z - z) <= rad),
    strikeOne: e => { struck.push(e.id); return { amount: 1 }; },
    strikeArea: (x, z, rad) => { const h = [near, far].filter(e => Math.hypot(e.x - x, e.z - z) <= rad); struck.push(...h.map(e => e.id)); return h.map(e => ({ enemy: e, result: { amount: 1 } })); },
    applyStatus: () => {}, statusSpec: () => null, push: () => {}, later: (ms, fn) => fn(), dropPool: () => {},
  };
  assert.deepEqual(tickAuras(env, r, p, FOCI.orb.every + 0.1, { fighting: false }), []);
  tickAuras(env, r, p, FOCI.orb.every + 0.1, { fighting: true });
  assert.deepEqual(struck, ['near']);
});

test('the reliquary answers a blow with a holy nova and heals', () => {
  const { r } = world();
  const { p } = wearing(r.loot.generate('reliquary', 'normal', 'medium', { rng: makeRng(1) }), { r });
  p.hp = Math.round(p.maxHp / 2);
  const c = { self: p, amount: 10, rng: () => 0 };
  const hp = p.hp;
  r.fx.onDamaged(c);
  assert.equal(c.procs?.[0]?.kind, 'nova');
  assert.equal(c.procs[0].element, 'holy');
  assert.ok(p.hp > hp, 'no heal');
  const missed = { self: p, amount: 10, rng: () => 0.99 };
  r.fx.onDamaged(missed);
  assert.ok(!missed.procs?.length, 'answered every blow');
  const hits = afterDamaged({ player: p, at: () => ({ x: 0, z: 0 }), strikeArea: () => [{ enemy: { id: 'x' } }], applyStatus: () => {} }, { defenderPost: { procs: c.procs } });
  assert.equal(hits.novas.length, 1);
});

test('the effigy makes every status last longer and bite harder', () => {
  const { r } = world();
  const { p } = wearing(r.loot.generate('effigy', 'normal', 'medium', { rng: makeRng(1) }), { r });
  assert.equal(r.fx.sum(p, 'statusLonger', { type: 'burn' }), FOCI.idol.longer);
  assert.ok(Math.abs(r.fx.product(p, 'statusPower', { type: 'burn' }) - (1 + FOCI.idol.power)) < 1e-9);
});

test('focusLook maps the old orb and warded focus to held models, not shields', () => {
  assert.equal(focusLook({ baseKey: 'spellguard_orb' }), 'orb');
  assert.equal(focusLook({ baseKey: 'warded_focus' }), 'relic');
  assert.equal(focusLook({ baseKey: 'kite_shield' }), null);
});
