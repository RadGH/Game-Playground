// A carried weapon swings WITH the arm (2026-10-15, Thousandvale play-test 11, live reports #62/#63).
//
// "When running the sword does not rotate with the hand at all … drastically tilted downward almost touching the
// ground." `aim()` held a weapon at one direction in the chest's frame, so in walk/run the solved wrist undid the arm
// swing: the longsword's angle to its forearm swept ~108 degrees per stride (passing straight through the forearm)
// while the point stayed 53 degrees below level. chibi2-motion.js `lockToFist` now aims a one-fist weapon once at the
// gait's neutral phase and keeps that grip turn, so the weapon rides the fist.
//
// The rule, measured on the BAKED clip (follow-through included) played through a real AnimationMixer:
//   - across the walk and run cycles, a sword / axe / mace / wand keeps its angle to its own forearm within a few
//     degrees (what the grip says), and that angle is never in line with the forearm (>= 25 degrees);
//   - the run carries a blade near level, never pointing at the ground (above -35 degrees at any point of the stride);
//   - long weapons held upright on purpose (a two-hander on the shoulder) are not touched.
// Run: node --test avatar-3d/tests/gait-grip.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { holdFor } = await import('../js/chibi2-weapon-ids.js');
const { createRig } = await import('../js/chibi2-geometry.js');
const { createClips } = await import('../js/chibi2-motion.js');

const deg = THREE.MathUtils.radToDeg;
/** Play `clip` on a fresh rig holding `held` (+ `offhand`); -> per sample, per hand: angle to the forearm and elevation. */
function cycle(held, clip, offhand = 'none', n = 24) {
  const rig = createRig({}, null);
  rig.hold = holdFor({ held: { id: held }, offhand: { id: offhand } });
  const [c] = createClips(rig, [clip]);
  const mixer = new THREE.AnimationMixer(rig.root);
  mixer.clipAction(c).play();
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    mixer.setTime(i / n * c.duration);
    rig.root.updateMatrixWorld(true);
    const row = {};
    for (const s of ['R', 'L']) {
      a.setFromMatrixPosition(rig.byName['elbow' + s].matrixWorld); b.setFromMatrixPosition(rig.byName['hand' + s].matrixWorld);
      const forearm = b.clone().sub(a).normalize();
      w.set(0, -1, 0).transformDirection(rig.byName['grip' + s].matrixWorld);       // the weapon runs out of the fist along the grip's -y
      row[s] = { off: deg(forearm.angleTo(w)), elev: deg(Math.asin(THREE.MathUtils.clamp(w.y, -1, 1))) };
    }
    out.push(row);
  }
  return out;
}
const spread = xs => Math.max(...xs) - Math.min(...xs);

test('#63: in walk and run a one-fist weapon keeps its angle to the forearm (it rotates WITH the hand)', () => {
  for (const held of ['fh_longsword', 'fh_sword', 'fh_axe', 'fh_mace', 'fh_hammer', 'fh_wand', 'sword', 'mace']) {
    for (const clip of ['walk', 'run']) {
      const rows = cycle(held, clip).map(r => r.R);
      const offs = rows.map(r => r.off);
      // the hand trails the forearm a little in the follow-through pass, so "constant" is within a few degrees (the wrist lag alone is ~9 at a run; before the fix it was ~108)
      assert.ok(spread(offs) <= 10, `${held} ${clip}: the weapon turns ${spread(offs).toFixed(1)} degrees against its own forearm over a stride (${Math.min(...offs).toFixed(0)}..${Math.max(...offs).toFixed(0)}) — it should ride the fist`);
      assert.ok(Math.min(...offs) >= 25, `${held} ${clip}: the weapon comes within ${Math.min(...offs).toFixed(0)} degrees of the forearm line (the hilt hides in the wrist)`);
      // and it really moves: the swing of the arm shows in the weapon
      assert.ok(spread(rows.map(r => r.elev)) >= (clip === 'run' ? 30 : 10), `${held} ${clip}: the weapon barely moves (${spread(rows.map(r => r.elev)).toFixed(0)} degrees) while the arm pumps`);
    }
  }
});

test('#62: the run carries a sword near level — the point never heads for the ground', () => {
  for (const held of ['fh_longsword', 'fh_sword', 'sword']) {
    const run = cycle(held, 'run').map(r => r.R.elev), idle = cycle(held, 'idle').map(r => r.R.elev);
    assert.ok(Math.min(...run) >= -35, `${held}: at the low point of the run the blade points ${Math.min(...run).toFixed(0)} degrees below level (was -53, "almost touching the ground")`);
    assert.ok(Math.min(...idle) >= -30, `${held}: standing, the blade points ${Math.min(...idle).toFixed(0)} degrees below level (was -36)`);
  }
});

test('the off hand gets the same rule; a two-hander on the shoulder keeps its steady carry', () => {
  for (const clip of ['walk', 'run']) {
    const offs = cycle('fh_sword', clip, 'fh_axe').map(r => r.L.off);
    assert.ok(spread(offs) <= 10 && Math.min(...offs) >= 25, `fh_axe in the off hand, ${clip}: ${Math.min(...offs).toFixed(0)}..${Math.max(...offs).toFixed(0)} degrees off the forearm`);
    const great = cycle('fh_greatsword', clip).map(r => r.R.elev);
    assert.ok(Math.min(...great) > 40, `fh_greatsword ${clip}: the two-hander left the shoulder (elevation ${Math.min(...great).toFixed(0)})`);
  }
});
