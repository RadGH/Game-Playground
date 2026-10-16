// Chibi 2.5 adoption (2026-10-16): the server accepts and SAVES the new face/hair/body choices (new part ids, the 2.5
// fields on a part, the body type and posture), drops nonsense in them, and an old saved look comes through unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, makeClient, run, until, waitP } from './helpers.js';
import { cleanLook } from '../../js/sim/looks.js';
import { CHIBI25_OPTIONS } from '../../../../avatar-3d/js/chibi25-options.js';
import { FACE_SLOTS, BODY_PICKS, cleanCustom, lookWith } from '../../js/client/ui/appearance-core.js';

const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };

const NEW_LOOK = {
  race: 'elf', seed: 77,
  custom: {
    body: { shape: 'lanky', posture: 'proud', shoulders: 0.7, legs: 0.8, arms: 0.3, height: 0.6 },
    hair: { id: 'twin_tails', color: '#3b2a1a', color2: '#D94A2A' },
    eyes: { id: 'cat', color: '#3a8a5a', colorR: '#c33333', pupil: 'slit', iris: 'large' },
    brows: { id: 'unibrow', thick: 1.4 }, mouth: { id: 'fang' }, nose: { id: 'pointed' },
    ears: { id: 'long_pointed', scale: 1.3 }, facialHair: { id: 'van_dyke' }, extras: { id: 'star_mark' },
  },
};

test('cleanLook keeps every Chibi 2.5 id and field, and drops bad values in them', () => {
  const r = cleanLook(NEW_LOOK);
  assert.ok(r.ok);
  const c = r.look.custom;
  assert.deepEqual(c.body, { shape: 'lanky', posture: 'proud', shoulders: 0.7, legs: 0.8, arms: 0.3, height: 0.6 });
  assert.deepEqual(c.hair, { id: 'twin_tails', color: '#3b2a1a', color2: '#d94a2a' });
  assert.deepEqual(c.eyes, { id: 'cat', color: '#3a8a5a', colorR: '#c33333', pupil: 'slit', iris: 'large' });
  assert.deepEqual(c.brows, { id: 'unibrow', thick: 1.4 });
  for (const s of ['mouth', 'nose', 'facialHair', 'extras']) assert.ok(c[s]?.id, s);
  const bad = cleanLook({ race: 'elf', seed: 1, custom: { body: { shape: 'blob', posture: 7, tail: 'dragon' }, eyes: { id: 'cat', pupil: 'skull', colorR: 'red', thick: 99 }, brows: { id: 'bushy', thick: 99 } } }).look.custom;
  assert.deepEqual(bad.body || {}, {}, 'unknown body choices dropped');
  assert.deepEqual(bad.eyes, { id: 'cat' }, 'bad eye fields dropped');
  assert.equal(bad.brows.thick, CHIBI25_OPTIONS.fields.brows.thick.max, 'clamped');
  // every id the editor offers is one the server keeps
  for (const s of FACE_SLOTS) for (const id of s.ids) {
    if (s.slot === 'headShape') continue;
    const got = cleanLook({ race: 'human', seed: 1, custom: { [s.slot]: { id } } }).look.custom?.[s.slot];
    assert.equal(got?.id ?? (id === 'none' ? 'none' : undefined), id, `${s.slot}.${id} survives the server`);
  }
  for (const p of BODY_PICKS) for (const id of p.ids) assert.equal(cleanLook({ race: 'human', seed: 1, custom: { body: { [p.key]: id } } }).look.custom.body[p.key], id);
});

test('an old saved look (Chibi 2 fields only) is cleaned to exactly itself', () => {
  const OLD = { v: 1, race: 'dwarf', seed: 9, custom: { body: { height: 0.4, width: 0.6, headSize: 0.5, skin: '#c68642' }, headShape: 'square', hair: { id: 'braids', color: '#8a1a1a' }, eyes: { id: 'round', color: '#4a6b8a' }, facialHair: { id: 'braided_beard', color: '#8a1a1a' }, ears: { id: 'normal' } } };
  assert.deepEqual(cleanLook(OLD).look, OLD);
  // and the client keeps the same blob (the editor starts from it)
  assert.deepEqual(lookWith(OLD, OLD.custom).custom, cleanCustom(OLD.custom));
});

test('the client editor blob carries the 2.5 fields to the wire', () => {
  const sent = lookWith(NEW_LOOK, NEW_LOOK.custom);
  assert.equal(sent.custom.eyes.pupil, 'slit'); assert.equal(sent.custom.eyes.colorR, '#c33333');
  assert.equal(sent.custom.hair.color2, '#d94a2a'); assert.equal(sent.custom.body.shape, 'lanky');
  assert.ok(JSON.stringify(sent).length < 1500, 'still a small look');
});

test('a Chibi 2.5 look is saved by the server and comes back in the world', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const c0 = makeClient(srv, clock);
  await waitP(clock, c0.ready);
  const made = await waitP(clock, c0.createChar({ name: 'Oddeyes', cls: 'mage' }));
  const LR = box(c0, ['lookR']);
  c0.setLook(made.id, lookWith(NEW_LOOK, NEW_LOOK.custom)); await run(clock, 300);
  const lr = LR.pop();
  assert.ok(lr.ok, JSON.stringify(lr));
  await waitP(clock, c0.play(made.id)); await until(clock, () => !!c0.joined, 3000);
  const c = c0.joined.you.look.custom;
  assert.equal(c.eyes.id, 'cat'); assert.equal(c.eyes.pupil, 'slit'); assert.equal(c.eyes.colorR, '#c33333');
  assert.equal(c.hair.id, 'twin_tails'); assert.equal(c.hair.color2, '#d94a2a');
  assert.equal(c.body.shape, 'lanky'); assert.equal(c.body.posture, 'proud');
  assert.equal(c.brows.thick, 1.4);
  c0.close(); await srv.stop();
});
