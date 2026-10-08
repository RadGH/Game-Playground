// Play-test 9 — D-world. X2 (S#50): the click-to-move marker; A's raid gate ping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { markerStep, groundNormal, createMoveMarker, MARK, MARK_GOLD } = await import('../../js/client/move-marker.js');
const src = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('X2: the marker follows the move goal — shows, moves, hides', () => {
  assert.equal(markerStep(null, null), 'keep');
  assert.equal(markerStep({ x: 1, z: 2 }, null), 'show');
  assert.equal(markerStep({ x: 1, z: 2 }, { x: 1, z: 2 }), 'keep');
  assert.equal(markerStep({ x: 4, z: 2 }, { x: 1, z: 2 }), 'move', 'a new click');
  assert.equal(markerStep(null, { x: 1, z: 2 }), 'hide', 'arrived, steered by keys, or stopped');
  const n = groundNormal((x, z) => x * 0.5, 0, 0);          // ground rising to +x
  assert.ok(n[0] < -0.3 && n[1] > 0.8 && Math.abs(n[2]) < 1e-9, 'tilted to the slope');
  assert.deepEqual(groundNormal(() => 3, 5, 5), [0, 1, 0]);
});

test('X2: on the ground at the clicked spot, fades in and out, pooled, one material type', () => {
  const scene = new THREE.Scene(); let goal = null;
  const ground = (x, z) => 10 + x * 0.1;
  const m = createMoveMarker(scene, { groundY: ground, goal: () => goal });
  const meshes0 = []; scene.traverse(o => { if (o.isMesh) meshes0.push(o); });
  const run = (s, dt = 1 / 30) => { for (let t = 0; t < s; t += dt) m.update(dt); };
  run(0.2); assert.equal(m.state().visible, 0);
  goal = { x: 20, z: -4 }; run(0.5);
  let st = m.state();
  assert.ok(st.goal.visible && st.goal.opacity > 0.5); assert.equal(st.goal.x, 20); assert.equal(st.goal.z, -4);
  assert.ok(Math.abs(st.goal.y - (ground(20, -4) + MARK.lift)) < 1e-6, 'snapped to the terrain');
  goal = { x: 30, z: 6 }; run(0.1);
  assert.equal(m.state().visible, 2, 'the old spot is still fading as the new one comes up'); assert.equal(m.state().goal.x, 30);
  run(1.5); assert.equal(m.state().visible, 1);
  goal = null; run(0.1); assert.equal(m.state().goal, null); run(1.5);
  assert.equal(m.state().visible, 0, 'gone after the fade');
  assert.deepEqual([m.stats.shown, m.stats.moved, m.stats.hidden], [1, 1, 1]);
  // a ping (the raid's gate) lives its time and goes
  m.ping(50, 50, { ms: 0 }); run(0.05); run(1.5); assert.equal(m.state().pings, 0);
  // nothing was created along the way
  const meshes1 = []; scene.traverse(o => { if (o.isMesh) meshes1.push(o); });
  assert.equal(meshes1.length, meshes0.length);
  assert.ok(meshes1.every(o => o.material.type === 'MeshBasicMaterial'));
  assert.equal(new THREE.Color(MARK_GOLD).getHexString(), 'f1d595', 'the interface gold');
});

test('X2: wired — follows controls.moveGoal (so keys, stick, auto-run, attack and Esc all end it), warmed at boot; gate ping on A\'s field', () => {
  const main = src('js/client/main.js'), c = src('js/client/controls.js');
  assert.match(main, /goal: \(\) => \(S\.phase === 'world' && !S\.self\.dead \? controls\.moveGoal : null\)/);
  assert.match(main, /extras: \[shots\.sample\(\), moveMark\.sample\(\)/);
  assert.match(main, /moveMark\.update\(dt\)/);
  assert.match(main, /net\.on\('eventTrack', gatePing\)/); assert.match(main, /m\?\.gate \|\| m\?\.ev\?\.gate/);
  // every input that takes over clears the goal in controls.js
  assert.match(c, /ArrowRight'\]\.includes\(k\)\) \{ moveGoal = null/); assert.match(c, /analog\.mz\)\) \{[^}]*moveGoal = null/); assert.match(c, /if \(d < 0\.5\) moveGoal = null/);
  assert.equal((src('js/client/move-marker.js').match(/new THREE\.Mesh\w+Material\(/g) || []).length, 1);
});
