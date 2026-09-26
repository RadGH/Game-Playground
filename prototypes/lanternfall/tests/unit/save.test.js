import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaves, migrate, SLOT_BUDGET } from '../../js/save/save.js';
const memStore = () => { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: k => m.delete(k), _m: m }; };
test('write, read back, backup of the previous version, list', () => {
  const S = createSaves(memStore());
  assert.ok(S.write(1, { schema: 1, hero: { name: 'A', class: 'tinker', level: 2 }, world: { act: 'act1' } }).ok);
  assert.ok(S.write(1, { schema: 1, hero: { name: 'B', class: 'tinker', level: 3 }, world: { act: 'act1' } }).ok);
  assert.equal(S.load(1).hero.name, 'B'); assert.equal(S.list()[0].level, 3); assert.equal(S.list()[1].empty, true);
});
test('a corrupt slot falls back to its backup', () => {
  const st = memStore(), S = createSaves(st);
  S.write(2, { schema: 1, hero: { name: 'Old' } }); S.write(2, { schema: 1, hero: { name: 'New' } });
  st.set('slot2', '{not json'); const s = S.load(2); assert.equal(s.hero.name, 'Old'); assert.ok(s._fromBackup);
});
test('over-budget ledgers are trimmed, then dropped, before refusing', () => {
  const S = createSaves(memStore());
  const big = { schema: 1, hero: {}, ledger: { fights: Array.from({ length: 60 }, () => ({ r: 'x'.repeat(2000) })) } };
  const r = S.write(3, big); assert.ok(r.ok, r.reason); assert.ok(r.bytes <= SLOT_BUDGET);
});
test('a save from a newer build is refused', () => assert.throws(() => migrate({ schema: 99 })));
