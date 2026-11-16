// Players on screen: a Chibi 2.6 body each (built like Thousandvale's, createTvBody), a capsule stand-in while the
// body builds, and a name tag. Others are drawn ~100 ms in the past between two snapshots (interpolation).
//
// Heroes WEAR their gear (live report #4, 2026-11-16): `add(id, { gear })` / `setGear(id, equip)` dress the body with
// js/rules/gear-look.js (Thousandvale's gear-look rules, data/gear-looks.json), so the equipped weapon is built on the
// hand bones and the attack clips swing it. A change of gear is baked in slices first (prepareChibi2, no long task)
// and then swapped onto the SAME body (setAvatar); `park: true` keeps a look taken off ready, so swapping weapon sets
// back and forth never disposes a material (no shader rebuild mid-game, lessons rule 29).
import * as THREE from 'three';
import { createTvBody, tvChibiOpts } from '../../../thousandvale/js/client/chibi-version.js';
import { prepareChibi2 } from '../../../../avatar-3d/js/chibi2.js';
import { CHIBI2_ANIMS } from '../../../../avatar-3d/js/chibi2-motion.js';
import '../../../../avatar-3d/js/chibi26-motion.js';
import { avatarOf } from '../../../knockabout/js/client/look.js';
import { CHIBI2_DUAL_ANIMS, CHIBI2_DUAL_SECONDS, dualAttackFor, dualAttackByCount } from '../../../../avatar-3d/js/chibi2-motion-dual.js';
import { heroAvatar, gearSig } from '../rules/gear-look.js';

/** Every hero body (world, character-screen preview) is built with these clips, so all of them share one template. */
export const BODY_ANIMS = [...new Set([...CHIBI2_ANIMS, ...CHIBI2_DUAL_ANIMS])];
export const BODY_OPTS = { anims: BODY_ANIMS, park: true };
export const GEAR_TABLE = await fetch(new URL('../../data/gear-looks.json', import.meta.url)).then(r => r.json()).catch(() => null);

/**
 * Thousandvale's swingClip (T6): the clip for a basic swing, from what is in both hands. `hand: 'off'` (the sim's
 * off-hand swing) wins; otherwise a pair alternates main, off, main, off, both. A single weapon plays `attack`, which
 * avatar-3d turns into the strike the hands suggest (a bow draws, a staff casts, a greatsword slams). Pure.
 */
export function swingClip(hold, { hand = null, count = 0 } = {}) {
  if (!hold) return 'attack';
  if (hand === 'off') return dualAttackFor(hold, { hand: 'off' }) || 'attack';
  return dualAttackByCount(hold, count) || 'attack';
}
/** A spell: a hand that holds a casting weapon (wand, staff, bow…) casts THROUGH it with its `attack`; else `cast`. Pure. */
export const spellClip = hold => (hold && (['wand', 'staff', 'caster', 'crossbow'].includes(hold.right) || hold.left === 'bow' || hold.left === 'book') ? 'attack' : 'cast');

const breathe = () => new Promise(r => setTimeout(r, 0));
/** Put a new look on a live body: bake it in slices, then swap it on (same body, same group). */
export async function dressBody(body, avatar) {
  try { await prepareChibi2(avatar, { ...tvChibiOpts(BODY_OPTS), slice: breathe, budget: 10 }); } catch { /* setAvatar builds it */ }
  await body.setAvatar(avatar);
}
/** The avatar a look + gear is drawn with (gear undefined = the look as it is: townsfolk, mercenaries). */
export function avatarFor(look, gear, bases) {
  const av = avatarOf(look);
  return gear === undefined || !GEAR_TABLE ? av : heroAvatar(av, gear, { table: GEAR_TABLE, bases });
}

/** Tests and gameEye: what a body holds — its hold, and how many vertices ride each grip bone / the shield arm. */
export function handStats(a) {
  const body = a?.body; if (!body) return null;
  const bones = body.skeleton.bones.map(b => b.name), n = { gripR: 0, gripL: 0, elbowL: 0 };
  body.group.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i++) { const b = bones[si.getX(i)]; if (b in n && sw.getX(i) > 0.5) n[b]++; }
  });
  return { ...n, hold: { right: body.hold.right, left: body.hold.left, twoHand: body.hold.twoHand, dual: body.hold.dual }, gear: a.builtKey, wanted: a.gear === undefined ? null : gearSig(a.gear), anim: a.anim };
}

export function createActors(view, tagRoot, { bases = () => null } = {}) {
  const list = new Map();
  const standin = () => new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1, 3, 8).translate(0, 0.85, 0), new THREE.MeshLambertMaterial({ color: '#d9c7a0', flatShading: true }));
  function add(id, { name, look, me = false, gear = undefined }) {
    const group = new THREE.Group(); view.scene.add(group);
    const temp = standin(); temp.castShadow = true; group.add(temp);
    const tag = document.createElement('div'); tag.className = 'tag' + (me ? ' me' : ''); tag.textContent = name; tagRoot.append(tag);
    const a = { id, group, body: null, tag, anim: '', x: 0, z: 0, yaw: 0, moving: false, buf: [], me, oneShot: null, oneShotUntil: 0, oneShotNew: false, faceYaw: null, faceUntil: 0, casting: false, swingN: 0,
      look, gear, gearKey: gear === undefined ? null : gearSig(gear), dressing: null };
    /** a blow (owner 2026-11-11: "no attack animation at all, and my character should face the target"): play a swing
     *  for the weapon in hand (Thousandvale's swingClip: a sword cuts, a dagger stabs, a bow draws, two blades take
     *  turns) and turn to face. `clip`: a clip name, or 'spell' (cast through the weapon if it is a casting one).
     *  `hand: 'off'`: the off hand's own swing (the sim's `swing {off: 1}`). */
    a.swing = (at = null, clip = null, hand = null) => {
      const now = performance.now();
      if (at) { a.faceYaw = Math.atan2(at.x - (a.rx ?? a.x), at.z - (a.rz ?? a.z)); a.faceUntil = now + 700; }
      if (now - (a.swingAt || 0) < 260) return;
      a.swingAt = now;
      const hold = a.body?.hold || null;
      const c = clip === 'spell' ? spellClip(hold) : clip || swingClip(hold, { hand, count: a.swingN++ });
      a.oneShot = c; a.oneShotUntil = now + Math.max(600, Math.round((CHIBI2_DUAL_SECONDS[c] || 0) * 1000)); a.oneShotNew = true; a.anim = '';
    };
    a.face = at => { if (!at) return; a.faceYaw = Math.atan2(at.x - (a.rx ?? a.x), at.z - (a.rz ?? a.z)); a.faceUntil = performance.now() + 700; };
    list.set(id, a);
    if (look) createTvBody(avatarFor(look, gear, bases()), BODY_OPTS).then(body => {
      if (!list.has(id)) { body.dispose?.(); return; }
      group.remove(temp); body.group.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(body.group); a.body = body; a.anim = '';
      if (a.gear !== undefined && gearSig(a.gear) !== a.builtKey) redress(a);          // gear changed while it built
    }).catch(e => console.warn('body', e));
    a.builtKey = a.gearKey;
    return a;
  }
  /** Re-dress a body for its current gear (one at a time; the latest gear wins). */
  async function redress(a) {
    if (!a.body || a.dressing) return;
    const key = gearSig(a.gear);
    if (key === a.builtKey) return;
    a.dressing = dressBody(a.body, avatarFor(a.look, a.gear, bases()));
    try { await a.dressing; a.builtKey = key; a.anim = ''; a.body.group.traverse(o => { if (o.isMesh) o.castShadow = true; }); }
    catch (e) { console.warn('dress', e); a.builtKey = key; }
    a.dressing = null;
    if (list.get(a.id) === a && gearSig(a.gear) !== a.builtKey) redress(a);
  }
  /** What a hero has equipped changed (your own `char`, or someone's roster entry): draw it. */
  function setGear(id, gear) {
    const a = list.get(id); if (!a || gear === undefined) return;
    a.gear = gear || {}; a.gearKey = gearSig(a.gear);
    if (a.body) redress(a);
  }
  function remove(id) { const a = list.get(id); if (!a) return; view.scene.remove(a.group); a.body?.dispose?.(); a.tag.remove(); list.delete(id); }
  /** A server snapshot of someone else: keep it for interpolation. */
  function push(id, s, at) { const a = list.get(id); if (!a) return; a.buf.push({ at, x: s.x, z: s.z, yaw: s.yaw, moving: s.moving }); if (a.buf.length > 8) a.buf.shift(); }
  const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
  function sample(a, t) {
    const b = a.buf; if (!b.length) return;
    let i = b.length - 1; while (i > 0 && b[i - 1].at > t) i--;
    const p1 = b[i], p0 = b[Math.max(0, i - 1)];
    const k = p1.at === p0.at ? 1 : Math.max(0, Math.min(1, (t - p0.at) / (p1.at - p0.at)));
    a.x = p0.x + (p1.x - p0.x) * k; a.z = p0.z + (p1.z - p0.z) * k; a.yaw = lerpAngle(p0.yaw, p1.yaw, k); a.moving = p1.moving;
  }
  const v = new THREE.Vector3();
  function update(dt, renderAt) {
    const w = view.renderer.domElement.clientWidth, h = view.renderer.domElement.clientHeight;
    for (const a of list.values()) {
      if (!a.me) sample(a, renderAt);
      // your own hero is drawn at its smoothed spot (main.js: between the last two fixed steps, minus a fading correction)
      const X = a.me && a.rx != null ? a.rx : a.x, Z = a.me && a.rz != null ? a.rz : a.z;
      const gy = view.groundY ? view.groundY(X, Z) : 0;
      a.group.position.set(X, gy, Z);
      const now = performance.now(), facing = a.faceUntil > now && !a.moving;
      const turn = 1 - Math.exp(-dt * (facing ? 20 : 14)); a.group.rotation.y = lerpAngle(a.group.rotation.y, facing ? a.faceYaw : a.yaw, turn);
      if (a.body) {
        // a one-shot (a swing) wins while it plays, unless you walk off; then walking, casting, or standing
        if (a.oneShot && (now >= a.oneShotUntil || a.moving)) a.oneShot = null;
        const want = a.oneShot || (a.moving ? 'walk' : a.casting ? 'cast' : 'idle');
        // a NEW swing restarts its clip even when the last one was the same strike (back-to-back auto-attacks)
        if (want !== a.anim || (a.oneShot && a.oneShotNew)) { a.anim = want; a.body.setAnim(want, a.oneShot ? 0.08 : 0.18, !!(a.oneShot && a.oneShotNew)); a.oneShotNew = false; }
        a.body.update(dt);
      }
      v.set(X, gy + 2.15, Z).project(view.camera);
      a.tag.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
    }
  }
  return { add, remove, push, update, setGear, get: id => list.get(id), list };
}
