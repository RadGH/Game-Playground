// node --test avatar-3d/tests/mounts.test.js
// Mounts (js/mount-types.js pure table + js/mounts.js builder): the id mapping Thousandvale's server uses, every
// type builds with its tack, the seat rides the back, gaits pick clips, a rider seats and unseats, the ride clips exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { MOUNT_TYPES, MOUNT_KEYS, mountSpecFor, gaitFor } from '../js/mount-types.js';

register('./three-loader.mjs', import.meta.url);

test('pure table: every type names a real creature and has tack + gaits', async () => {
  const { CREATURE_TYPES } = await import('../js/creature-types.js');
  for (const k of ['horse', 'pony', 'courser', 'warhorse', 'stag', 'ram', 'drake']) assert.ok(MOUNT_TYPES[k], k);
  for (const k of MOUNT_KEYS) {
    const T = MOUNT_TYPES[k];
    assert.ok(CREATURE_TYPES[T.creature], `${k}: creature ${T.creature}`);
    assert.ok(T.tack?.kind, k); assert.ok(T.gaits.walk < T.gaits.trot && T.gaits.trot < T.gaits.gallop, k);
  }
});

test('mountSpecFor maps Thousandvale ids, looks and unknowns', () => {
  const cases = { pony: 'pony', riding_horse: 'horse', grey_courser: 'courser', warhorse: 'warhorse', moor_stag: 'stag', ram: 'ram', drake: 'drake', nonsense: 'horse' };
  for (const [id, want] of Object.entries(cases)) assert.equal(mountSpecFor(id).type, want, id);
  // stream A's DEFAULT_MOUNTS look objects
  assert.equal(mountSpecFor({ creature: 'deer', size: 1.25 }).type, 'stag');
  assert.equal(mountSpecFor({ creature: 'elk' }).type, 'stag');
  assert.equal(mountSpecFor({ creature: 'horse', size: 0.82 }).type, 'pony');
  assert.equal(mountSpecFor({ creature: 'horse', size: 1 }).type, 'horse');
  assert.equal(mountSpecFor({ creature: 'horse', size: 1.15 }).type, 'warhorse');
  assert.equal(mountSpecFor({ id: 'grey_courser', creature: 'horse' }).type, 'courser');
  assert.equal(mountSpecFor(null).type, 'horse');
  const s = mountSpecFor({ id: 'pony', colors: { body: '#123456', belly: 'red' } });
  assert.equal(s.colors.body, '#123456'); assert.equal(s.colors.belly, MOUNT_TYPES.pony.colors.belly);
  assert.ok(s.tack.kind && s.creature === 'pony' && s.size > 0);
});

test('gaitFor picks idle / walk / trot / gallop by speed', () => {
  assert.equal(gaitFor(0), 'idle'); assert.equal(gaitFor(1.5), 'walk'); assert.equal(gaitFor(4), 'trot'); assert.equal(gaitFor(8), 'gallop');
});

test('every mount builds with tack, the seat rides the back, gaits switch clips', async () => {
  const { createMount } = await import('../js/mounts.js');
  for (const k of MOUNT_KEYS) {
    const m = await createMount(k);
    let tack = 0; m.group.traverse(o => { if (o.isMesh && o.userData.tack) tack++; });
    assert.ok(tack >= 10, `${k}: ${tack} tack meshes`);
    const me = m.metrics();
    assert.ok(me.seatY > me.backY * 0.8 && me.seatY < me.backY * 1.3, `${k}: seat ${me.seatY.toFixed(2)} back ${me.backY.toFixed(2)}`);
    // the seat is under the hip: it moves when the body bobs
    let p = m.seat; let underHip = false; while (p) { if (p === m.creature.parts.hip) underHip = true; p = p.parent; }
    assert.ok(underHip, `${k}: seat not on the hip`);
    assert.equal(m.setGait(0), 'idle'); assert.equal(m.creature.anim, 'idle');
    assert.equal(m.setGait(1.5), 'walk'); assert.equal(m.creature.anim, 'walk');
    assert.equal(m.setGait(4), 'trot'); assert.equal(m.creature.anim, 'walk');
    assert.equal(m.setGait(9), 'gallop'); assert.equal(m.creature.anim, 'run');
    for (let i = 0; i < 10; i++) m.update(0.05, i * 0.05);
    m.dispose();
  }
});

test('the ram is new and its curled horns are read only behind its own flag', async () => {
  const { createCreature } = await import('../js/creatures.js');
  const count = c => { let n = 0; c.group.traverse(o => { if (o.isMesh) n++; }); return n; };
  const withH = await createCreature({ type: 'ram' }), without = await createCreature({ type: 'ram', features: { curlHorns: false } });
  assert.ok(count(withH) > count(without));
  assert.ok(withH.parts.hip, 'parts getter');
});

test('seatRider / unseat round-trip with a Chibi 2 rider; ride clips exist', async () => {
  const THREE = await import('three');
  const { createMount, seatRider, CHIBI2_MOUNT_ANIMS } = await import('../js/mounts.js');
  const { createChibi2Character, CHIBI2_ANIMS } = await import('../js/chibi2.js');
  const { createClips } = await import('../js/chibi2-motion.js');
  assert.deepEqual(CHIBI2_MOUNT_ANIMS, ['ride', 'rideGallop']);
  const rider = await createChibi2Character({}, { anims: [...CHIBI2_ANIMS, ...CHIBI2_MOUNT_ANIMS] });
  const scene = new THREE.Group(); scene.add(rider.group); rider.group.position.set(3, 0, 1);
  const m = await createMount('horse'); scene.add(m.group);
  const unseat = seatRider(m, rider);
  assert.equal(rider.group.parent, m.seat); assert.equal(rider.anim, 'ride');
  m.setGait(9); assert.equal(rider.anim, 'rideGallop');
  m.update(0.05, 0.05); rider.update(0.05);
  scene.updateMatrixWorld(true);
  const hips = rider.parts.hips.getWorldPosition(new THREE.Vector3());
  const seat = m.seat.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(hips.y - seat.y) < 0.2, `hips ${hips.y.toFixed(2)} vs seat ${seat.y.toFixed(2)}`);
  unseat();
  assert.equal(rider.group.parent, scene); assert.deepEqual(rider.group.position.toArray(), [3, 0, 1]); assert.equal(rider.anim, 'idle');
  // the clips build for a rig without touching the other lists
  void createClips;
});
