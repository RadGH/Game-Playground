// Chibi 2.5 (part B): ROBE vs FEET. "Improve the robe clipping with feet running animation" (owner, 2026-10-16).
//
// Every long garment (robes, the cassock, dresses, the surcoat, coats and the trench, skirts, the kilt, the loincloth,
// long capes and cloaks) on every race, plus body extremes, plays every locomotion clip — walk, run, jump, sprint,
// backpedal, strafeL, strafeR — through its own baked clips and AnimationMixer, and every leg vertex (thighs, shins,
// boots, feet, greaves) is checked against the garment's cloth on every frame (tools/chibi25-measure.mjs robeCheck):
// a vertex between the cloth's top and its hem and outside the cloth has POKED THROUGH. Under the hem is allowed.
//
//   ground locomotion: ZERO pokes on any frame                         (Chibi 2: up to 35 cm through)
//   in the saddle / seated (ride, rideGallop, sit): no vertex more than 3.5 cm out — the top of a thigh straddling a
//     saddle sits right under the belt line, where no tilt of the cloth reaches (Chibi 2: up to 38 cm through)
//
// Run: node --test avatar-3d/tests/chibi25-robe.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);
const { buildMeasured, robeCheck, robeLook, ROBE_LOOKS } = await import('../../tools/chibi25-measure.mjs');
const { CHIBI2_ANIMS, CHIBI2_MOUNT_ANIMS, CHIBI2_RIDE_ANIMS } = await import('../js/chibi2-motion.js');
const { CHIBI25_MOVE_ANIMS } = await import('../js/chibi25-motion.js');
const { CHIBI2_RACE_IDS } = await import('../js/chibi2-races.js');
const { needsSkirt } = await import('../js/chibi25-body.js');

const GROUND = ['walk', 'run', 'jump', ...CHIBI25_MOVE_ANIMS];
const SEATED = ['ride', 'rideGallop', 'sit'];
const ANIMS = [...new Set([...CHIBI2_ANIMS, ...CHIBI25_MOVE_ANIMS, ...CHIBI2_MOUNT_ANIMS, ...CHIBI2_RIDE_ANIMS])];
const SEATED_TOLERANCE = 0.035;

async function check(look, clips = [...GROUND, ...SEATED]) {
  const m = await buildMeasured(look, { anims: ANIMS });
  try { return robeCheck(m, clips); } finally { m.actor.dispose(); }
}
const fail = (label, r) => Object.entries(r).flatMap(([clip, x]) => {
  if (GROUND.includes(clip) && x.pokes) return [`${label} ${clip}: ${x.pokeFrames}/${x.frames} frames poke, worst ${(x.minGap * 100).toFixed(1)} cm at ${JSON.stringify(x.worst)}`];
  if (SEATED.includes(clip) && x.minGap != null && x.minGap < -SEATED_TOLERANCE) return [`${label} ${clip}: ${(x.minGap * 100).toFixed(1)} cm through (seated tolerance ${SEATED_TOLERANCE * 100} cm)`];
  return [];
});

test('every long garment wears skirt bones on a 2.5 body, and none on a v2 body', async () => {
  for (const id of Object.keys(ROBE_LOOKS)) {
    assert.ok(needsSkirt(robeLook(id)), `${id} is a long garment`);
    const v2 = await buildMeasured(robeLook(id, { v25: false }), {});
    assert.ok(!v2.actor.skeleton.bones.some(b => b.name.startsWith('skirt')), `${id}: a v2 body has no skirt bones`);
    v2.actor.dispose();
    const v25 = await buildMeasured(robeLook(id), {});
    assert.equal(v25.actor.skeleton.bones.filter(b => b.name.startsWith('skirt')).length, 8, `${id}: a 2.5 body has 8 skirt bones`);
    v25.actor.dispose();
  }
});

test('no foot, shin or knee goes through a long garment on any locomotion clip, any race (2.5)', async () => {
  const bad = [];
  for (const race of CHIBI2_RACE_IDS) for (const id of Object.keys(ROBE_LOOKS)) bad.push(...fail(`${race} ${id}`, await check(robeLook(id, { race }))));
  assert.deepEqual(bad, []);
});

test('…and at the body extremes (height, width, roundness, leg length, body shapes)', async () => {
  const bodies = [
    { height: 0 }, { height: 1 }, { width: 0 }, { width: 1 }, { round: 0 }, { round: 1 }, { legs: 0 }, { legs: 1 },
    { shape: 'heavy' }, { shape: 'lanky' }, { shape: 'petite' }, { shape: 'stocky' }, { shape: 'broad' }, { shape: 'slim' },
    { height: 1, width: 1, round: 1, shape: 'heavy' }, { height: 0, width: 0, legs: 0, shape: 'petite' },
  ];
  const bad = [];
  for (const body of bodies) for (const race of ['human', 'goblin', 'giant']) for (const id of ['robe', 'cassock', 'dress', 'surcoat', 'trench', 'coat', 'skirt', 'long_skirt', 'kilt', 'travel_cloak', 'long_cloak']) {
    bad.push(...fail(`${race} ${id} ${JSON.stringify(body)}`, await check(robeLook(id, { race, body }), GROUND)));
  }
  assert.deepEqual(bad, []);
});

test('Chibi 2 (v2) is what it was: the same robe still pokes through (the 2.5 fix is opt-in, not a v2 change)', async () => {
  const r = await check(robeLook('robe', { v25: false }), ['walk', 'run']);
  assert.ok(r.run.pokes > 0 && r.run.minGap < -0.2, `the v2 robe run is untouched (${r.run.minGap})`);
});
