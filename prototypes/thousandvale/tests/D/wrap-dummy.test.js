// Report #61: "Create a custom model for training dummies instead of using a dog as the model."
// Run: node --test prototypes/thousandvale/tests/D/wrap-dummy.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bodyKindFor, PROP_BODIES, settle, knock } from '../../js/client/body-kind.js';

const at = p => fileURLToPath(new URL('../../' + p, import.meta.url));
const src = p => readFileSync(at(p), 'utf8');

test('#61: a training dummy is a built object, never a creature body', () => {
  const looks = JSON.parse(src('data/monster-looks.json'));
  assert.equal(bodyKindFor('training_dummy', looks.training_dummy || null), 'dummy');
  assert.equal(bodyKindFor('training_dummy', { creature: { type: 'wolf' } }), 'dummy', 'a looks row cannot turn it back into an animal');
  assert.equal(bodyKindFor('training_dummy', { avatar: {} }), 'dummy');
  assert.equal(bodyKindFor('wolf', null), 'creature');
  assert.equal(bodyKindFor('road_brigand', { avatar: {} }), 'avatar');
  assert.equal(bodyKindFor(undefined, null), 'creature');
  assert.equal(bodyKindFor('constructor', null), 'creature', 'not fooled by an inherited property name');
  // the type the rules really spawn is the one in the table
  assert.match(src('js/rules/index.js'), /type: 'training_dummy'/);
  assert.ok('training_dummy' in PROP_BODIES);
  // and actors.js asks the table before it reaches for a creature
  const actors = src('js/client/actors.js');
  assert.ok(actors.indexOf('bodyKindFor(') > 0 && actors.indexOf('bodyKindFor(') < actors.indexOf('createCreature(look?.creature'), 'the body kind is decided before the creature fallback');
  assert.match(actors, /createDummyBody\(\)/);
});

test('#61: a hit rocks the dummy away from the hitter and it settles upright again', () => {
  const fresh = () => ({ ax: 0, az: 0, tw: 0, vx: 0, vz: 0, vt: 0 });
  // hitter stands at -z of a dummy facing +z (yaw 0): the push is along +z, so the top tips toward +z (positive x rotation)
  let s = knock(fresh(), 0, 1, 0, 10); settle(s, 0.05);
  assert.ok(s.ax > 0.02 && Math.abs(s.az) < 1e-9, `tips forward (${s.ax})`);
  // push along +x tips toward +x, which is a NEGATIVE z rotation
  s = knock(fresh(), 1, 0, 0, 10); settle(s, 0.05);
  assert.ok(s.az < -0.02 && Math.abs(s.ax) < 1e-9);
  // the same world push on a dummy turned a quarter circle arrives on its other axis
  s = knock(fresh(), 1, 0, Math.PI / 2, 10); settle(s, 0.05);
  assert.ok(Math.abs(s.ax) > 0.02 && Math.abs(s.az) < 1e-6);
  // never further than about eighteen degrees, however hard and often it is hit
  s = fresh(); let worst = 0;
  for (let i = 0; i < 200; i++) { knock(s, 1, 0.3, 0, 999); settle(s, 0.016); worst = Math.max(worst, Math.abs(s.ax), Math.abs(s.az), Math.abs(s.tw)); }
  assert.ok(worst <= 0.32 + 1e-9, `stays on its post (${worst})`);
  // and three seconds after the last blow it stands straight
  for (let i = 0; i < 180; i++) settle(s, 1 / 60);
  assert.ok(Math.abs(s.ax) < 0.01 && Math.abs(s.az) < 0.01 && Math.abs(s.tw) < 0.01, 'settled');
  // a miss (amount 0) only nudges it
  const hit = settle(knock(fresh(), 0, 1, 0, 5), 0.05).ax, miss = settle(knock(fresh(), 0, 1, 0, 0), 0.05).ax;
  assert.ok(miss > 0 && miss < hit / 2);
});

test('#61: the model is a dummy-sized thing of a few hundred triangles in two meshes', { skip: !existsSync(at('../../avatar-3d/tests/three-register.mjs')) && 'the playground three loader is not here' }, () => {
  const code = `
    import { dummyGeometry, createDummyBody, DUMMY_HEIGHT } from ${JSON.stringify(at('js/client/dummy-model.js'))};
    const { base, top } = dummyGeometry(7);
    const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
    base.computeBoundingBox(); top.computeBoundingBox();
    const b = createDummyBody(); let meshes = 0; const mats = new Set(); b.group.traverse(o => { if (o.isMesh) { meshes++; mats.add(o.material); } });
    b.hit(0, 1, 0, 5); b.update(0.05);
    console.log(JSON.stringify({ tris: tris(base) + tris(top), baseMinY: base.boundingBox.min.y, topMaxY: top.boundingBox.max.y + b.group.children[1].position.y, width: top.boundingBox.max.x - top.boundingBox.min.x,
      height: DUMMY_HEIGHT, metrics: b.metrics().height, meshes, mats: mats.size, colour: !!top.attributes.color, rocked: b.group.children[1].rotation.x }));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--import', at('../../avatar-3d/tests/three-register.mjs'), '--input-type=module', '-e', code], { encoding: 'utf8' }));
  assert.ok(out.tris > 200 && out.tris < 1500, `triangles ${out.tris}`);
  assert.ok(Math.abs(out.baseMinY) < 0.01, 'stands on the ground');
  assert.ok(out.topMaxY > 1.8 && out.topMaxY < 2.15, `about 1.9 m tall (${out.topMaxY})`);
  assert.ok(Math.abs(out.metrics - out.topMaxY) < 0.2, 'the name plate height is the height of the model');
  assert.ok(out.width > 1.1 && out.width < 1.7, `arms out (${out.width})`);
  assert.equal(out.meshes, 2); assert.equal(out.mats, 1); assert.equal(out.colour, true);
  assert.ok(out.rocked > 0, 'a hit rocks the top');
});
