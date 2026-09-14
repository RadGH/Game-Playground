// E23: a talent or upgrade that says "5 bolts instead of 3" fires five bolts.
//
// tests/effects.test.js proves the registry dispatches; this one counts the hits that actually
// land, because the bug was in combat.js's target picker (it read `effect.targets` for a
// `random3` skill and never looked at `bolts`, so Magic Missile's Missile Barrage did nothing).
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Combat, shotCount } from '../js/combat.js';
import { makeEnemy, mergeSkill } from '../js/rules.js';
import { Loot } from '../js/loot.js';
import { makeRng } from '../js/rng.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url)));
const items = J('items.json'), skillData = J('skills.json').skills, enemyData = J('enemies.json').entities, spellData = J('enemy-spells.json').spells;
const loot = new Loot(items);

function hero(level = 1, talents = {}) {
  return {
    id: 'h1', name: 'Probe', short: 'Probe', isHero: true, class: 'mage', level,
    hp: 400, maxHp: 400, mp: 999, maxMp: 999, attrs: { STR: 8, DEX: 10, INT: 20, CON: 10 },
    equipment: { weapon: { id: 'w', name: 'Wand', type: 'weapon', slot: 'weapon', subtype: 'wand', weaponCategory: 'magic', dmg: [6, 9], affixes: [] } },
    skills: [], talents, passiveRanks: {}, alive: true, statuses: [], cooldowns: {}, buffs: [],
  };
}
/** Cast one skill once and count the shots that resolved (a hit or a miss is still a shot). */
function shotsFired(skillId, { level = 1, talents = {}, nFoes = 4, seed = 5 } = {}) {
  const h = hero(level, talents);
  const foes = [];
  const tpl = enemyData.goblin_scout || Object.values(enemyData)[0];
  for (let i = 0; i < nFoes; i++) { const e = makeEnemy(tpl, { act: 1, heroes: 1, index: i }); e.maxHp = 99999; e.hp = e.maxHp; e.armor = 0; e.dodge = 0; foes.push(e); }
  const C = new Combat([h], foes, { skills: skillData, spells: spellData, loot, rng: makeRng(seed), act: 1, bossPhases: {} });
  const merged = mergeSkill({ id: skillId, ...skillData[skillId] }, h);
  const before = C.log.length;
  C.cast(h, merged, foes, [h]);
  const after = C.log.slice(before);
  return { shots: after.filter(e => e.type === 'damage' || e.type === 'miss').length, merged, events: after };
}

test('Magic Missile fires 3 bolts by default', () => {
  const { shots, merged } = shotsFired('magic_missile');
  assert.equal(merged.effect.bolts, undefined);
  assert.equal(shots, 3);
});

test('the Missile Barrage talent really fires 5 bolts', () => {
  const { shots, merged } = shotsFired('magic_missile', { talents: { mm_5bolts: true } });
  assert.equal(merged.effect.bolts, 5, 'the talent merged');
  assert.equal(shots, 5, 'and five bolts actually left the wand');
});

test('the level upgrades raise the bolt count too (4 at level 5, 5 at level 10)', () => {
  assert.equal(shotsFired('magic_missile', { level: 5 }).shots, 4);
  assert.equal(shotsFired('magic_missile', { level: 10 }).shots, 5);
  // a talent on top of the level-10 upgrade must not lower it
  assert.equal(shotsFired('magic_missile', { level: 10, talents: { mm_5bolts: true } }).shots, 5);
});

test('shotCount reads bolts, then targets, then the chain keys, then the shape default', () => {
  assert.equal(shotCount({ aoe: 'random3' }, 3), 3);
  assert.equal(shotCount({ effect: { bolts: 5 } }, 3), 5);
  assert.equal(shotCount({ effect: { targets: 4 } }, 3), 4);
  assert.equal(shotCount({ effect: { bolts: 6, targets: 2 } }, 3), 6, 'bolts wins');
  assert.equal(shotCount({ effect: { chainTargets: 5 } }, 3), 5);
  assert.equal(shotCount({ effect: { bolts: 0 } }, 3), 3, 'nonsense falls back');
  assert.equal(shotCount({ effect: { bolts: 99 } }, 3), 12, 'capped');
});

/**
 * Every skill in the game whose talents or upgrades change how many things it hits: casting it with
 * the talent must land more shots than casting it without. This is the audit E23 asked for.
 */
const COUNT_KEYS = ['bolts', 'targets', 'hits', 'strikeCount', 'attackCount', 'chainTargets', 'chainCount', 'glaiveCount'];
test('every talent/upgrade that changes a hit count is honoured by cast()', () => {
  const checked = [];
  for (const [id, s] of Object.entries(skillData)) {
    if (!['melee', 'ranged', 'magic', 'damage', 'zone', 'debuff', 'trap'].includes(s.type)) continue;
    // Shapes that already sweep every enemy on the field cannot hit "one more": skills.json has one
    // talent like that (chain_lightning_spirit's Forked Spirit on an `aoe: row` skill) and the shape,
    // not the talent, is what decides. Nothing to prove for those.
    if (['row', 'row2', 'all', 'pierce_row'].includes(s.aoe)) continue;
    for (const t of s.talents || []) {
      const key = COUNT_KEYS.find(k => typeof t.effect?.[k] === 'number');
      if (!key) continue;
      const base = shotsFired(id, { seed: 11 });
      const withT = shotsFired(id, { talents: { [t.id]: true }, seed: 11 });
      checked.push(`${id}/${t.id}`);
      assert.ok(withT.shots > base.shots, `${id} + ${t.name} (${key} ${t.effect[key]}): ${base.shots} → ${withT.shots} shots`);
    }
  }
  assert.ok(checked.length >= 5, `only checked ${checked.length} multi-shot talents`);
});
