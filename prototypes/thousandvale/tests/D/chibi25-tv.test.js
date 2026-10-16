// Chibi 2.5 adoption (2026-10-16): one switch for every body Thousandvale builds, the ?chibi=2 escape, who looks at whom,
// and the creation screen's 2.5 options.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const { chibiVersion, tvChibiOpts } = await import('../../js/client/chibi-version.js');
const { lookTarget, NPC_LOOK_M, LOOK_MAX_M } = await import('../../js/client/actors.js');
import { FACE_SLOTS, BODY_PICKS, BODY_DIALS, slotIds } from '../../js/client/ui/appearance-core.js';
import { CHIBI25_OPTIONS } from '../../../../avatar-3d/js/chibi25-options.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT = join(HERE, '..', '..', 'js', 'client');

test('Chibi 2.5 by default; ?chibi=2 (and only that) draws the old bodies', () => {
  assert.equal(chibiVersion(''), 2.5);
  assert.equal(chibiVersion('?autoplay=1'), 2.5);
  assert.equal(chibiVersion('?chibi=2'), 2);
  assert.equal(chibiVersion('?a=1&chibi=2&b=2'), 2);
  assert.equal(chibiVersion('?chibi=25'), 2.5);
  assert.deepEqual(tvChibiOpts({ anims: ['idle'] }, 2.5), { anims: ['idle'], v25: true });
  assert.deepEqual(tvChibiOpts({ anims: ['idle'] }, 2), { anims: ['idle'] });
});

test('one switch: no client file builds a Chibi body except through chibi-version.js', () => {
  const files = [];
  const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } };
  walk(CLIENT);
  const offenders = files.filter(p => !p.endsWith('chibi-version.js') && /createChibi2Character\s*\(/.test(readFileSync(p, 'utf8')));
  assert.deepEqual(offenders, [], 'these build bodies around the switch');
});

const P = (id, x, z, more = {}) => ({ id, kind: 'player', pos: { x, z }, dead: false, ...more });
test('who looks at whom', () => {
  const me = P(1, 0, 0, { self: true }), wolf = { id: 2, kind: 'monster', pos: { x: 4, z: 0 } };
  const byId = id => ({ 1: me, 2: wolf, 3: farOff })[id] || null;
  const farOff = P(3, LOOK_MAX_M + 5, 0);
  assert.equal(lookTarget(me, { self: me, target: wolf, byId }), wolf, 'you look at your target');
  assert.equal(lookTarget(me, { self: me, target: null, byId }), null);
  const smith = { id: 9, kind: 'npc', pos: { x: NPC_LOOK_M - 1, z: 0 } };
  assert.equal(lookTarget(smith, { self: me, byId }), me, 'a townsperson looks at you when you are near');
  assert.equal(lookTarget({ ...smith, pos: { x: NPC_LOOK_M + 2, z: 0 } }, { self: me, byId }), null, '…and not from across the square');
  const brigand = { id: 5, kind: 'monster', humanoid: true, tgt: 1, pos: { x: 3, z: 3 } };
  assert.equal(lookTarget(brigand, { self: me, byId }), me, 'a humanoid enemy looks at what it fights');
  assert.equal(lookTarget({ ...brigand, humanoid: false }, { self: me, byId }), null, 'a beast has no 2.5 eyes');
  assert.equal(lookTarget(P(4, 1, 1, { tgt: 3 }), { self: me, byId }), null, 'nothing past LOOK_MAX_M');
  assert.equal(lookTarget(brigand, { self: me, byId: () => ({ ...me, dead: true }) }), null, 'nobody stares at the dead');
  assert.equal(lookTarget({ ...brigand, dead: true }, { self: me, byId }), null);
});

test('the editor offers every new 2.5 face id (bar beast ears), the 2.5 fields and the body options', () => {
  for (const s of FACE_SLOTS) {
    const C = CHIBI25_OPTIONS.face[s.slot]; if (!C) continue;
    for (const id of C.added) if (!(s.slot === 'ears' && /cat_ears|wolf_ears/.test(id))) assert.ok(s.ids.includes(id), `${s.slot}.${id} offered`);
  }
  const eyes = FACE_SLOTS.find(s => s.slot === 'eyes');
  assert.deepEqual(eyes.fields.map(f => f.key), ['pupil', 'iris', 'colorR']);
  assert.deepEqual(BODY_PICKS.map(p => p.key), ['shape', 'posture']);
  for (const k of ['shoulders', 'legs', 'arms']) assert.ok(BODY_DIALS.some(d => d.key === k), k);
  const ears = FACE_SLOTS.find(s => s.slot === 'ears');
  assert.equal(slotIds(ears, 'elf')[0], 'pointed', 'an elf is offered pointed ears first');
  assert.equal(slotIds(ears, 'human')[0], 'normal');
  assert.equal(new Set(slotIds(ears, 'dwarf')).size, ears.ids.length, 'reordered, nothing lost');
});
