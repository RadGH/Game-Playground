// Costumes (data/cosmetics.json): every part a written-out costume names is a real Chibi 2 part, so the shared
// normaliser keeps it; ids are unique; a few are free; names are clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARTS } from '../../../avatar-2d/js/parts/index.js';

const C = JSON.parse(readFileSync(new URL('../data/cosmetics.json', import.meta.url))).items;
test('costumes: unique ids, sane prices, real parts', () => {
  assert.equal(new Set(C.map(c => c.id)).size, C.length);
  assert.ok(C.length >= 55);
  assert.ok(C.filter(c => !c.price).length >= 8, 'some free ones');
  for (const c of C) {
    assert.ok(/^cos_[a-z0-9_]+$/.test(c.id) && c.name && !/ember|veil|muster/i.test(c.name), c.id);
    assert.ok(Number.isInteger(c.price) && c.price >= 0 && c.price <= 300, c.id);
    if (!c.outfit || typeof c.outfit === 'string') continue;
    for (const [slot, part] of Object.entries(c.outfit)) {
      assert.ok(!['held', 'offhand'].includes(slot), `${c.id}: no props`);
      assert.ok(PARTS[slot], `${c.id}: slot ${slot}`);
      assert.ok(part.id in PARTS[slot], `${c.id}: ${slot}.${part.id} is not a part`);
      for (const k of ['color', 'color2']) if (part[k]) assert.match(part[k], /^#[0-9a-f]{6}$/i, `${c.id} ${slot}.${k}`);
    }
  }
});
