// The bestiary (data/enemies.json) against what the brain and the data can actually run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from './helpers.js';

const E = loadJson('data/enemies.json'), K = loadJson('data/kits.json'), LOOT = loadJson('data/loot.json'), MATS = loadJson('data/materials.json');
const byId = Object.fromEntries(E.list.map(e => [e.id, e]));
const KINDS = new Set(['contact', 'melee', 'lunge', 'dive', 'projectile']); // js/ai/brain.js startActive / act
const MOVES = new Set(['walker', 'crawler', 'flyer', 'swimmer']);          // js/ai/brain.js moveToward
const FLAMES = new Set(['physical', 'ember', 'rime', 'spark', 'bile', 'gleam', 'tide', 'shade']);
const lootIds = new Set(LOOT.list.map(l => l.id));
const matKeys = new Set(MATS.list.map(m => m.key));

test('every spawn-table id resolves to a monster', () => {
  for (const [act, table] of Object.entries(K.spawnTables)) for (const row of table) assert.ok(byId[row.id], `${act}: ${row.id} missing from enemies.json`);
});

test('ids are unique', () => assert.equal(new Set(E.list.map(e => e.id)).size, E.list.length));

test('every monster uses movement, attack kinds and flames the brain supports', () => {
  for (const e of E.list) {
    assert.ok(MOVES.has(e.move), `${e.id}: move ${e.move}`);
    assert.ok(E.tiers[e.tier], `${e.id}: tier ${e.tier}`);
    assert.ok(e.attacks.length > 0, `${e.id}: no attacks`);
    assert.equal(e.size.length, 2); assert.ok(e.hp > 0);
    for (const a of e.attacks) {
      assert.ok(KINDS.has(a.kind), `${e.id}.${a.id}: kind ${a.kind}`);
      assert.ok(Array.isArray(a.range) && a.range[0] <= a.range[1], `${e.id}.${a.id}: range`);
      for (const k of ['windup', 'active', 'recovery', 'cooldown', 'dmg']) assert.equal(typeof a[k], 'number', `${e.id}.${a.id}: ${k}`);
      if (a.flame) assert.ok(FLAMES.has(a.flame), `${e.id}.${a.id}: flame ${a.flame}`);
      if (a.kind === 'lunge' || a.kind === 'dive') assert.ok(a.speed > 0, `${e.id}.${a.id}: needs speed`);
    }
    for (const [f, v] of Object.entries(e.resist || {})) { assert.ok(FLAMES.has(f), `${e.id}: resist ${f}`); assert.ok(typeof v === 'number' || v === 'heal', `${e.id}: resist ${f}=${v}`); }
  }
});

test('loot tables and void zones referenced by monsters exist', () => {
  for (const e of E.list) {
    assert.ok(lootIds.has(e.loot), `${e.id}: loot ${e.loot}`);
    for (const a of e.attacks) if (a.onLand?.voidZone) assert.ok(E.voidZones[a.onLand.voidZone], `${e.id}.${a.id}: void zone ${a.onLand.voidZone}`);
  }
  for (const [id, z] of Object.entries(E.voidZones)) if (z.mat) assert.ok(matKeys.has(z.mat), `${id}: material ${z.mat}`);
});

test('a monster without a sprite has a colour for the fallback block', () => {
  const sprites = JSON.stringify(loadJson('data/sprites.json'));
  for (const e of E.list) if (!e.sprite || !sprites.includes(`"${e.sprite}"`)) assert.match(e.color || '', /^#[0-9a-f]{6}$/i, `${e.id}: no sprite and no colour`);
});
