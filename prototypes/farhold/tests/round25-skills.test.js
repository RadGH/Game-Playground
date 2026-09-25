// node --test prototypes/farhold/tests/round25-skills.test.js
//
// Round 25 #18 — "I'd also like to add a variety more new skills of different elements.
// Flamethrowers, fire walking trails, lightning orb that float around you and shock nearby enemies
// automatically."
//
// Seven skills, each with a part no older skill had. The data is checked, the card is checked
// against the numbers, the plan carries every new part, and the parts that live outside js/main.js
// (the orbs as auras) are made to act. js/main.js's readers are checked by source, the same way the
// other round tests find a field that nothing reads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Rpg } from '../js/rpg.js';
import { createSkillBar, describeSkill, applyStatus } from '../js/skills.js';
import { tickAuras } from '../js/uniques.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', f), 'utf8'));
const data = read('data/skills.json');
const items = JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));
const r = new Rpg(items, read('data/balance.json'));
const main = readFileSync(join(here, '../js/main.js'), 'utf8');

const NEW = {
  flamethrower: 'fire', ember_stride: 'fire', storm_orbs: 'lightning', blizzard: 'ice',
  toxic_cloud: 'poison', judgement: 'holy', void_rift: 'shadow',
};

test('seven new skills, five elements, every one handed to at least one class', () => {
  for (const [id, element] of Object.entries(NEW)) {
    const s = data.skills[id];
    assert.ok(s, `${id} is missing`);
    assert.equal(s.element, element);
    assert.ok(Object.values(data.classes).some(list => list.includes(id)), `${id} is on no class's bar`);
    assert.equal(s.desc, describeSkill(s, data.statuses), `${id}'s card is not the generated one`);
  }
  // every class still has six skills and no duplicates
  for (const [cls, list] of Object.entries(data.classes)) {
    assert.equal(list.length, 6, cls);
    assert.equal(new Set(list).size, 6, `${cls} has a skill twice`);
  }
});

test('the cards say what the new parts do, with the numbers on the skill', () => {
  const d = id => data.skills[id].desc;
  assert.match(d('flamethrower'), /10 times over 2\.2s/);
  assert.match(d('ember_stride'), /every step leaves burning ground/);
  assert.match(d('storm_orbs'), /3 orbs circle you.*every 1\.2s.*Shocked/);
  assert.match(d('blizzard'), /6 times over 3s/);
  assert.match(d('judgement'), /0\.7s after you cast/);
  assert.match(d('void_rift'), /drags everything 2\.5 m toward the middle/);
});

test('the plan carries every new part to js/main.js, and main.js reads each one', () => {
  const player = r.createPlayer({ classId: 'mage', level: 30 });
  player.mp = player.maxMp = 9999;
  for (const id of Object.keys(NEW)) {
    const bar = createSkillBar({ data: { ...data, classes: { ...data.classes, mage: [id, id, id, id, id, id].map((x, i) => i ? 'firebolt' : x) } }, player, rpg: r });
    const plan = bar.use(0);
    assert.ok(plan.ok, `${id} would not cast: ${plan.why}`);
    const s = data.skills[id];
    if (s.repeats) assert.equal(plan.repeats, s.repeats);
    if (s.breath) assert.equal(plan.breath, true);
    if (s.weather) assert.equal(plan.weather, true);
    if (s.delay) assert.equal(plan.delay, s.delay);
    if (s.pull) assert.equal(plan.pull, s.pull);
    if (s.trail) assert.deepEqual(plan.trail, s.trail);
    if (s.orbs) assert.deepEqual(plan.orbs, s.orbs);
    assert.ok(plan.mult > (s.mult || 0), `${id}'s share did not scale with its cooldown`);
  }
  for (const field of ['plan.breath', 'plan.weather', 'plan.delay', 'plan.pull', 'plan.trail', 'plan.orbs']) {
    assert.ok(main.includes(field), `js/main.js never reads ${field}`);
  }
  // …and the melee and ground branches repeat now, not only the ring
  assert.match(main, /const cone = \(first\)/);
  assert.match(main, /const pulse = \(first\)/);
});

test('storm orbs are auras: they strike the nearest enemy, shock it, fight or not, and stop when spent', () => {
  const player = r.createPlayer({ classId: 'stormcaller', level: 30 });
  r.equip(player, r.loot.generate('wand', 'normal', 'medium'));
  r.refresh(player, { full: true });
  player.skillAuras = [{ id: 'storm_orb_0', left: 5, every: 1.2, radius: 8, power: 0.5, element: 'lightning', nearestOnly: true, status: 'shock', always: true }];
  const near = { id: 'near', x: 3, z: 0, hp: 1e6, maxHp: 1e6, dying: null, statuses: {} };
  const far = { id: 'far', x: 7, z: 0, hp: 1e6, maxHp: 1e6, dying: null, statuses: {} };
  const struck = [];
  const env = {
    player, at: () => ({ x: 0, z: 0 }), rng: () => 0,
    near: (x, z, rad) => [near, far].filter(e => Math.hypot(e.x - x, e.z - z) <= rad),
    strikeOne: e => { struck.push(e.id); return { amount: 12 }; },
    strikeArea: () => [], applyStatus: (t, type, spec, p) => applyStatus(t, type, spec, p),
    statusSpec: type => data.statuses[type],
  };
  const fired = tickAuras(env, r, player, 1.3, { fighting: false });
  assert.deepEqual(fired.map(f => f.id), ['storm_orb_0'], 'a cast orb waited for a fight');
  assert.deepEqual(struck, ['near']);
  assert.ok(near.statuses.shock, 'the orb shocked nothing');
  player.skillAuras[0].left = 0;
  assert.deepEqual(tickAuras(env, r, player, 1.3, { fighting: true }), [], 'a spent orb kept firing');
});
