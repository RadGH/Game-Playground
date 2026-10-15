// Thousandvale-only monsters (docs/EXPANSION-1.md §5): new names and looks over borrowed Farhold stat blocks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installTvMonsters } from '../../js/rules/tv-monsters.js';
import { prepareRules, rulesEngine } from '../../js/rules/index.js';

const data = JSON.parse(readFileSync(new URL('../../data/rules/monsters-tv.json', import.meta.url), 'utf8'));
const BANNED = /\b(ember|veil|muster)/i;

test('every row borrows a real stat block and adds a new name, family and look', async () => {
  await prepareRules();
  const e = rulesEngine();
  assert.deepEqual(e.bestiary.tvSkipped, [], 'every base exists in the Farhold bestiary');
  for (const m of data.monsters) {
    const d = e.enemyDef(m.id), base = e.enemyDef(m.base);
    assert.ok(d && base, m.id);
    assert.equal(d.name, m.name); assert.equal(d.tvBase, m.base);
    assert.notEqual(d.name, base.name, m.id + ' has its own name');
    assert.ok(m.look && (m.look.creature || m.look.avatar), m.id + ' has its own look');
    assert.notDeepEqual(m.look, base.look, m.id + ' does not wear its base look');
    assert.doesNotMatch(m.name + ' ' + (m.desc || ''), BANNED, m.id + ': banned word');
  }
});

test('a row never shadows a Farhold monster, and a missing base is skipped, not thrown', () => {
  const b = { enemies: [{ id: 'moor_hound', name: 'Moor Hound', levels: [1, 3] }], bosses: [] };
  assert.equal(installTvMonsters(b, { monsters: [{ id: 'moor_hound', base: 'moor_hound', name: 'X' }, { id: 'nope', base: 'missing' }, { id: 'new_hound', base: 'moor_hound', name: 'New Hound', levels: [10, 12] }] }), 1);
  assert.equal(b.enemies.find(d => d.id === 'moor_hound').name, 'Moor Hound');
  assert.deepEqual(b.tvSkipped, ['nope']);
  assert.deepEqual(b.enemies.find(d => d.id === 'new_hound').levels, [10, 12]);
});
