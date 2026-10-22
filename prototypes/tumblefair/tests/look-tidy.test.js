// Random looks are tidy (owner 2026-10-22): every drawn face part is one the editor offers, and the optional extras
// are mostly 'none'. Presets name only real parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tidyFace, PRESETS } from '../js/client/look-tidy.js';
import { FACE_SLOTS, cleanCustom } from '../../thousandvale/js/client/ui/appearance-core.js';
import { randomAvatar, makeRng } from '../../../avatar-2d/js/random.js';
import { partIds } from '../../../avatar-2d/js/parts/index.js';
import { randomChibi2 } from '../../../avatar-3d/js/chibi2-races.js';
import { readFileSync } from 'node:fs';

const presets = JSON.parse(readFileSync(new URL('../../../avatar-2d/data/presets.json', import.meta.url)));
const roll = (race, seed) => tidyFace(randomChibi2(randomAvatar, presets, { race, seed, makeRng, known: (slot, id) => partIds(slot).includes(id) }), seed);
test('400 random looks: every face part is offered by the editor; extras are rare', () => {
  let marks = 0, acc = 0, n = 0;
  for (const race of ['human', 'elf', 'dwarf', 'halfling']) for (let seed = 1; seed <= 100; seed++) {
    const a = roll(race, seed); n++;
    for (const s of FACE_SLOTS) { const id = s.slot === 'headShape' ? a.headShape : a[s.slot]?.id; if (id != null) assert.ok(s.ids.includes(id), `${race} ${seed}: ${s.slot}=${id} is not in the editor`); }
    if (a.extras.id !== 'none') marks++; if (a.accessory.id !== 'none') acc++;
    assert.deepEqual(roll(race, seed), a, 'same seed, same face');
  }
  assert.ok(marks / n < 0.25, `face marks on ${marks}/${n}`); assert.ok(acc / n < 0.25, `accessories on ${acc}/${n}`);
});
test('presets: unique, and every part survives cleanCustom', () => {
  assert.ok(PRESETS.length >= 8); assert.equal(new Set(PRESETS.map(p => p.id)).size, PRESETS.length);
  for (const p of PRESETS) { const c = cleanCustom(p.custom); for (const k of Object.keys(p.custom)) assert.ok(c[k], `${p.id}: ${k}`); }
});
