// Play-test 5 (round-playtest5.md) — D-world, avatar-3d grips and dual-wield motion:
//   T22 "dual-wielded daggers are held 90 degrees wrong, not by the handle — audit EVERY weapon in both hands".
//       Two rules, checked for every held id in BOTH hands, so it cannot come back:
//       (a) THE MODEL: the handle passes through the fist (geometry on the grip line through the palm, on both sides of
//           it) and the weapon runs along the grip axis with its business end at -y (out past the fingers);
//       (b) THE HOLD: a fist holds a handle ACROSS the palm. In every carrying clip the weapon stands at least 30 degrees
//           off its own forearm — 25 in the test, to leave room for breathing — (a blade in line with the forearm hides its hilt in the wrist and looks strapped on), and
//           no clip leaves a weapon hand un-aimed (the off hand lost its grip in every main-hand strike).
//   T6  dual-wield strikes exist for two one-handers and two two-handers, the off hand really moves in its own, and
//       `dualAttackFor` picks from what is in both hands.
//   T7  a two-hander in each hand: both are drawn, and both are carried over a shoulder.
// Run: node --test prototypes/thousandvale/tests/D/grips.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { buildGear } = await import('../../../../avatar-3d/js/chibi2-gear.js');
const { holdFor, HELD_WEAPON_IDS, FARHOLD_WEAPON_INFO } = await import('../../../../avatar-3d/js/chibi2-weapon-ids.js');
const { createRig } = await import('../../../../avatar-3d/js/chibi2-geometry.js');
const M = await import('../../../../avatar-3d/js/chibi2-motion.js');
const D = await import('../../../../avatar-3d/js/chibi2-motion-dual.js');
const { normalizeAvatar } = await import('../../../../avatar-2d/js/render.js');
let G5 = [], buildGear5 = () => {};
try {
  const ids = await import('../../../../avatar-3d/js/chibi2-gear5-ids.js');
  G5 = Object.keys(ids.G5_HELD || {}).filter(id => !ids.BOW_IDS?.has(id));
  ({ buildGear5 } = await import('../../../../avatar-3d/js/chibi2-gear5.js'));        // the g5_ models are built after buildGear (chibi2.js)
} catch { /* F's models are not in this tree */ }

const GRIP = { x: 0, z: 0.055 };                       // the grip line in hand space (chibi2-geometry.js: the grip bone)
const OLD_VOCAB = ['sword', 'rapier', 'saber', 'cleaver', 'greatsword', 'greataxe', 'warhammer', 'hammer', 'mace', 'daggers', 'quarterstaff', 'staff_orb', 'staff_skull', 'staff_crook', 'staff_crystal', 'staff_totem'];
const HELD_IDS = [...new Set([...Object.keys(FARHOLD_WEAPON_INFO), ...OLD_VOCAB, ...G5])];

/** A build context that keeps every piece's vertices, in the space of the bone it was added to. */
function recorder() {
  const pieces = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  const c = {
    add(g, bone, color, o = {}) {
      m.compose(new THREE.Vector3(...(o.position || [0, 0, 0])), q.setFromEuler(e.set(...(o.rotation || [0, 0, 0]))), new THREE.Vector3(...(o.scale || [1, 1, 1])));
      const p = g.attributes.position, pts = [];
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); pts.push([v.x, v.y, v.z]); }
      pieces.push({ bone, skinTo: o.skinTo || null, pts });
      return g;
    },
    trim: '#c8a040', leather: '#5a3a1a', steel: '#c8ccd6', W: 1, T: 1, H: 1, A: 1, head: () => {},
  };
  return { c, pieces };
}
const blank = () => { const a = normalizeAvatar({}); for (const k of ['held', 'offhand', 'cape', 'accessory', 'decor', 'hat']) a[k] = { ...(a[k] || {}), id: 'none' }; return a; };
/** Everything a hand holds: the vertices added to that hand's bone. */
function inHand(id, hand) {
  const { c, pieces } = recorder();
  const a = blank();
  if (hand === 'main') a.held = { id, color: '#c8ccd6' };
  else { a.held = { id: 'fh_sword', color: '#c8ccd6' }; a.offhand = { id, color: '#c8ccd6' }; }
  try { buildGear(a, c); buildGear5(a, c); } catch (err) { return { err }; }
  const bone = hand === 'main' ? 'handR' : 'handL';
  const mine = pieces.filter(p => p.bone === bone);
  return { pts: mine.flatMap(p => p.pts), skins: new Set(mine.map(p => p.skinTo)), pieces: mine.length };
}
const span = (pts, i) => { let lo = Infinity, hi = -Infinity; for (const p of pts) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); } return [lo, hi]; };

/** What the kind's rule asks: long weapons run along y with the head at -y; a staff carries its topper at +y. */
function shapeRule(id) {
  const kind = holdFor({ held: { id }, offhand: { id: 'none' } }).right;
  return { kind, long: ['blade', 'dagger', 'haft', 'heavy', 'polearm', 'wand', 'staff'].includes(kind), headDown: ['blade', 'dagger', 'haft', 'heavy', 'wand'].includes(kind) || (kind === 'polearm' && !/quarterstaff/.test(id)) };
}

test('T22a: every weapon model, in each hand — the handle goes through the fist and the weapon runs along the grip axis', () => {
  const seen = [];
  for (const id of HELD_IDS) for (const hand of ['main', 'off']) {
    if (hand === 'off' && !HELD_WEAPON_IDS.includes(id)) continue;          // staves, bows and crossbows are not off-hand items
    const r = inHand(id, hand), tag = `${id} in the ${hand} hand`;
    assert.ok(!r.err, `${tag}: the builder threw ${r.err?.message}`);
    assert.ok(r.pieces >= 2, `${tag}: built ${r.pieces} pieces on the ${hand === 'main' ? 'handR' : 'handL'} bone`);
    assert.deepEqual([...r.skins], [hand === 'main' ? 'gripR' : 'gripL'], `${tag}: every piece must be skinned to that hand's grip bone`);
    const rule = shapeRule(id);
    if (!rule.long) continue;
    // the handle: vertices close to the grip line, on BOTH sides of the palm (y just above and just below the grip bone)
    const near = r.pts.filter(p => Math.hypot(p[0] - GRIP.x, p[2] - GRIP.z) < 0.045);
    const [lo, hi] = span(near, 1);
    assert.ok(near.length >= 8 && lo < -0.07 && hi > 0.0, `${tag}: no handle through the fist (near the grip line y spans ${lo.toFixed(2)}..${hi.toFixed(2)}; it must cross -0.07..0)`);
    // the weapon runs along the grip axis (y), not across it
    const [x0, x1] = span(r.pts, 0), [y0, y1] = span(r.pts, 1), [z0, z1] = span(r.pts, 2);
    assert.ok(y1 - y0 > 1.5 * Math.max(x1 - x0, z1 - z0), `${tag}: it lies across the grip (y ${(y1 - y0).toFixed(2)} vs x ${(x1 - x0).toFixed(2)}, z ${(z1 - z0).toFixed(2)})`);
    // …centred on the grip line
    assert.ok(Math.abs((x0 + x1) / 2 - GRIP.x) < 0.14 && Math.abs((z0 + z1) / 2 - GRIP.z) < 0.2, `${tag}: it is off the grip line (centre x ${((x0 + x1) / 2).toFixed(2)}, z ${((z0 + z1) / 2).toFixed(2)})`);
    // the business end is out past the fingers
    // (longer below the fist than above it — or, for a weapon on a long symmetrical haft, its widest part is below)
    if (rule.headDown) {
      let wide = null, far = 0;
      for (const p of r.pts) { const d = Math.hypot(p[0] - GRIP.x, p[2] - GRIP.z); if (d > far) { far = d; wide = p; } }
      assert.ok(-y0 > y1 * 1.4 || (-y0 >= y1 * 0.95 && wide[1] < -0.05), `${tag}: the head is not at -y (y ${y0.toFixed(2)}..${y1.toFixed(2)}, widest at y ${wide[1].toFixed(2)})`);
    }
    seen.push(tag);
  }
  assert.ok(seen.length >= 50, `only ${seen.length} hand/weapon pairs were checked`);
});

// ---------------------------------------------------------------- the hold, clip by clip
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _w = new THREE.Vector3();
function rigFor(held, offhand) {
  const rig = createRig({}, null);
  rig.hold = holdFor({ held: { id: held }, offhand: { id: offhand } });
  return rig;
}
/** Pose the rig at a frame; -> for each hand, the angle (degrees) between the weapon and its own forearm, and where the fist is. */
function frame(rig, name, u) {
  const f = M.sampleClip(rig, name, u);
  for (const b of rig.bones) { const r = f.pose[b.name]; if (r) b.quaternion.setFromEuler(_e.set(r[0], r[1], r[2])); }
  rig.root.updateMatrixWorld(true);
  const out = { aim: f.aim };
  for (const s of ['R', 'L']) {
    _a.setFromMatrixPosition(rig.byName['elbow' + s].matrixWorld); _b.setFromMatrixPosition(rig.byName['hand' + s].matrixWorld);
    const forearm = _b.clone().sub(_a).normalize();
    const weapon = _w.set(0, -1, 0).transformDirection(rig.byName['grip' + s].matrixWorld).clone();
    out[s] = { off: THREE.MathUtils.radToDeg(forearm.angleTo(weapon)), hand: _b.clone(), weapon, reach: rig.byName.chest.worldToLocal(_b.clone()) };
  }
  return out;
}
const PAIRS = [['fh_daggers', 'fh_dagger'], ['fh_sword', 'fh_sword'], ['fh_axe', 'fh_dagger'], ['fh_mace', 'fh_sabre'], ['fh_longsword', 'fh_hammer'], ['tv_scimitar', 'tv_club'], ['fh_greatsword', 'fh_greatsword'], ['fh_maul', 'fh_greataxe'], ['fh_wand', 'fh_wand'], ['fh_sword', 'fh_wand'], ['fh_scepter', 'fh_dagger']];
const ALL_CLIPS = [...new Set([...M.CHIBI2_EVERY_ANIMS, ...D.CHIBI2_DUAL_ANIMS, ...D.CHIBI2_REVIVE_ANIMS])];

test('T22b: no clip leaves a weapon hand un-aimed (the off hand lost its grip in every main-hand strike)', () => {
  for (const [held, off] of PAIRS) {
    const rig = rigFor(held, off);
    for (const name of ALL_CLIPS) {
      if (M.HANDS_FREE.has(name)) continue;
      for (const u of [0, 0.25, 0.45, 0.7, 1]) {
        const f = M.sampleClip(rig, name, u);
        for (const s of ['R', 'L']) {
          const g = f.pose['grip' + s];
          const turned = Math.abs(g[0]) + Math.abs(g[1]) + Math.abs(g[2]) > 1e-6;
          assert.ok(s in f.aim || turned, `${held}+${off}: clip ${name} @${u} gives the ${s} hand's weapon no aim and no grip`);
        }
      }
    }
  }
});

test('T22b: carrying a weapon, the fist holds the handle ACROSS the palm — never in line with the forearm', () => {
  const CARRY = ['idle', 'ready', 'guard'];
  for (const [held, off] of PAIRS) {
    const rig = rigFor(held, off), h = rig.hold;
    for (const name of CARRY) for (const u of [0, 0.2, 0.4, 0.6, 0.8]) {
      const f = frame(rig, name, u);
      for (const s of ['R', 'L']) {
        // a great weapon held in both hands' "ready" lies along the lead forearm by design (two hands on one haft)
        if (h.dualTwo && name !== 'idle') continue;
        assert.ok(f[s].off >= 25 && f[s].off <= 165, `${held}+${off}: ${name} @${u}: the ${s} hand's weapon is ${f[s].off.toFixed(0)} degrees off its forearm (in line = the hilt hides in the wrist)`);
      }
    }
    // the hand that is NOT striking keeps its weapon across the palm for the whole strike
    for (const [name, idle] of [['overhead', 'L'], ['slash', 'L'], ['stab', 'L'], ['chop', 'L'], ['thrust', 'L'], ['attack', null], ['dualSlashR', 'L'], ['dualSlashL', 'R'], ['dualStabR', 'L'], ['dualStabL', 'R']]) {
      if (!idle || h.dualTwo) continue;
      for (const u of [0.15, 0.3, 0.45, 0.6]) {
        const f = frame(rig, name, u);
        assert.ok(f[idle].off >= 25 && f[idle].off <= 165, `${held}+${off}: ${name} @${u}: the waiting ${idle} hand's weapon is ${f[idle].off.toFixed(0)} degrees off its forearm`);
      }
    }
  }
});

test('T6: a pair of weapons gets its own strikes — the off hand really swings, and the pick follows the hands', () => {
  const dag = holdFor({ held: { id: 'fh_daggers' }, offhand: { id: 'fh_dagger' } });
  const swords = holdFor({ held: { id: 'fh_sword' }, offhand: { id: 'fh_axe' } });
  const twos = holdFor({ held: { id: 'fh_greatsword' }, offhand: { id: 'fh_maul' } });
  const shield = holdFor({ held: { id: 'fh_sword' }, offhand: { id: 'fh_heater_shield' } });
  const one = holdFor({ held: { id: 'fh_sword' }, offhand: { id: 'none' } });
  assert.equal(D.dualAttackFor(dag, { hand: 'main', step: 0 }), 'dualStabR');
  assert.equal(D.dualAttackFor(dag, { hand: 'off', step: 0 }), 'dualStabL');
  assert.equal(D.dualAttackFor(dag, { hand: 'main', step: 2 }), 'dualFlurry');
  assert.equal(D.dualAttackFor(swords, { hand: 'main' }), 'dualSlashR');
  assert.equal(D.dualAttackFor(swords, { hand: 'off' }), 'dualSlashL');
  assert.equal(D.dualAttackFor(swords, { hand: 'main', step: 5 }), 'dualCross');
  assert.equal(D.dualAttackFor(twos, { hand: 'main' }), 'twinChopR');
  assert.equal(D.dualAttackFor(twos, { hand: 'off' }), 'twinChopL');
  assert.equal(D.dualAttackFor(twos, { hand: 'main', step: 2 }), 'twinCrash');
  assert.equal(D.dualAttackFor(shield), null, 'a shield is not a second weapon');
  assert.equal(D.dualAttackFor(one), null);
  // a game that is not told whose turn it is still alternates
  const seq = [0, 1, 2, 3, 4].map(n => D.dualAttackByCount(swords, n));
  assert.deepEqual(seq, ['dualSlashR', 'dualSlashL', 'dualSlashR', 'dualSlashL', 'dualCross']);
  for (const n of D.CHIBI2_DUAL_ANIMS) { assert.ok(M.ONE_SHOTS.has(n), `${n} is a one-shot`); assert.ok(M.CHIBI2_CLIP_SECONDS[n] > 0.3, `${n} has a length`); }

  // the striking hand travels: its fist moves at least 0.25 units (measured from the chest) through the clip, and for an off-hand clip that is
  // the LEFT hand (the reported fault: only one hand ever swung)
  const travel = (rig, name, s) => { let lo = null, far = 0; const pts = []; for (let i = 0; i <= 20; i++) pts.push(frame(rig, name, i / 20)[s].reach); for (const a of pts) for (const b of pts) far = Math.max(far, a.distanceTo(b)); return far; };
  /** how far in front of the chest the fist gets */
  const fwd = (rig, name, s) => { let z = -Infinity; for (let i = 0; i <= 20; i++) z = Math.max(z, frame(rig, name, i / 20)[s].reach.z); return z; };
  for (const [held, off, clips] of [['fh_sword', 'fh_sword', ['dualSlashR', 'dualSlashL', 'dualCross']], ['fh_daggers', 'fh_dagger', ['dualStabR', 'dualStabL', 'dualFlurry']], ['fh_greatsword', 'fh_greatsword', ['twinChopR', 'twinChopL', 'twinCrash']]]) {
    const rig = rigFor(held, off);
    for (const name of clips) {
      const r = travel(rig, name, 'R'), l = travel(rig, name, 'L');
      const both = /Cross|Flurry|Crash/.test(name), left = /L$/.test(name);
      if (both) assert.ok(r > 0.25 && l > 0.25, `${name}: both hands strike (R ${r.toFixed(2)}, L ${l.toFixed(2)})`);
      else if (left) assert.ok(l > 0.25 && l > r && fwd(rig, name, 'L') > fwd(rig, name, 'R') + 0.05, `${name}: the off hand strikes (L ${l.toFixed(2)}, R ${r.toFixed(2)})`);
      else assert.ok(r > 0.25 && r > l && fwd(rig, name, 'R') > fwd(rig, name, 'L') + 0.05, `${name}: the main hand strikes (R ${r.toFixed(2)}, L ${l.toFixed(2)})`);
      // every strike starts and ends near the standing pose (it blends back into idle without a jump)
      const a = M.sampleClip(rig, name, 0).pose, z = M.sampleClip(rig, name, 1).pose;
      for (const b of ['chest', 'hips']) for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[b][i] - z[b][i]) < 0.25, `${name}: ${b} ends where it began`);
    }
  }
});

test('T7: a two-hander in each hand — both are built, and both ride a shoulder at rest', () => {
  for (const [held, off] of [['fh_greatsword', 'fh_greatsword'], ['fh_maul', 'fh_greataxe'], ['tv_warpick', 'fh_greatsword']]) {
    assert.ok(inHand(off, 'off').pieces >= 2, `${off} is not drawn in the off hand`);
    const rig = rigFor(held, off);
    assert.equal(rig.hold.dualTwo, true, `${held}+${off} is two two-handers`);
    assert.equal(rig.hold.twoHand, false);
    const f = frame(rig, 'idle', 0.3);
    for (const s of ['R', 'L']) {
      assert.ok(f[s].weapon.y > 0.45 && f[s].weapon.z < -0.2, `${held}+${off}: the ${s} great weapon should point up and back over the shoulder at rest (dir ${f[s].weapon.toArray().map(n => n.toFixed(2))})`);
      assert.ok(f[s].hand.y > rig.byName.hips.position.y + 0.12, `${held}+${off}: the ${s} hand is up at the chest, not hanging`);
    }
  }
});

test('T25/T4: the angling clips put the weapons away, and standing up starts on the ground and ends upright', () => {
  for (const n of D.CHIBI2_ANGLE_ANIMS) assert.ok(M.HANDS_FREE.has(n), `${n} is hands-free`);
  assert.ok(!M.ONE_SHOTS.has('fishWait') && !M.ONE_SHOTS.has('fishReel') && M.ONE_SHOTS.has('fishCast') && M.ONE_SHOTS.has('fishShow'));
  const rig = rigFor('fh_sword', 'none');
  const a = M.sampleClip(rig, 'standUp', 0), z = M.sampleClip(rig, 'standUp', 1), d = M.sampleClip(rig, 'dead', 1);
  assert.ok(Math.abs(a.pose.root[0] - d.pose.root[0]) < 0.05, 'standUp begins where `dead` ends (flat on the back)');
  assert.ok(Math.abs(z.pose.root[0]) < 0.02 && Math.abs(z.bob) < 0.02, 'standUp ends upright');
  // the cast: the rod hand goes back over the shoulder and comes forward
  const back = frame(rig, 'fishCast', 0.4).R.hand, fwd = frame(rig, 'fishCast', 0.64).R.hand;
  assert.ok(fwd.z - back.z > 0.2, `the cast whips forward (hand z ${back.z.toFixed(2)} -> ${fwd.z.toFixed(2)})`);
  assert.ok(Array.isArray(D.ROD_MOUNT.position) && D.ROD_MOUNT.bone === 'handR');
});
