// Everyone in the world you can see: their models, animation, nameplates and hit reactions.
//
// A player is a Chibi 2 body (avatar-3d/js/chibi2.js) built from `{ race, cls, seed }` (looks.js); a
// monster is an avatar-3d creature. Bodies are built through a small queue (one per frame) so twenty
// players walking into view do not freeze a frame; until a body is ready a soft stand-in shows where
// it is. Identical looks share one template (chibi2.js caches by avatar JSON).
//
// LEVEL OF DETAIL (a town of 100 players on a desktop GPU, PLAN §12): only the nearest FULL_MAX players
// (and monsters within reach) get a real body; everyone further is a one-draw-call instanced stand-in
// tinted by class, with a small plate. Full bodies past ANIM_NEAR metres animate at 10 Hz. Nameplates
// are capped to the PLATE_MAX nearest and skip DOM writes when nothing moved. A body that has been far
// for a while is thrown away (bodies share templates, so building one again is cheap).
//
// Animation is picked from what the entity is DOING — its interpolated speed for locomotion, plus
// one-shots (attack, hit) layered on top by events — so the server never has to send animation names
// for movement.

import * as THREE from 'three';
import { createChibi2Character } from '../../../../avatar-3d/js/chibi2.js';
import { createCreature, randomCreature } from '../../../../avatar-3d/js/creatures.js';
import { compactCreature } from '../../../../avatar-3d/js/mesh-merge.js';
import { bodyKindFor } from './body-kind.js';
import { createDummyBody } from './dummy-model.js';          // #61: a training dummy is a built object, not an animal
import { avatarFor, bodyTypeFor, loadMonsterLooks } from './looks.js';
import { normalizeAvatar } from '../../../../avatar-2d/js/render.js';
import { perf, compileBeforeShow } from './perf.js';
import { createMount, seatRider, mountSpecFor, CHIBI2_MOUNT_ANIMS } from '../../../../avatar-3d/js/mounts.js';
import { CHIBI2_DUAL_ANIMS, CHIBI2_ANGLE_ANIMS, CHIBI2_REVIVE_ANIMS, CHIBI2_DUAL_SECONDS, dualAttackFor, dualAttackByCount } from '../../../../avatar-3d/js/chibi2-motion-dual.js';
import { CHIBI2_PROF_ANIMS } from '../../../../avatar-3d/js/chibi2-motion-prof.js';   // W9 (P-client): work loops — mine, chop, stoop-and-pick, skin, hammer, stitch, stir   // play-test 5: T6 dual-wield strikes, T25 angling, T4 standing back up

/** A creature spec from what the server sent: `{ type, size?, seed, colors? }` — colour varied by seed within its family. */
function creatureFor(spec) {
  const c = randomCreature(bodyTypeFor(spec?.type), (spec?.seed >>> 0) || 1);
  if (spec?.size) c.size = +(c.size * spec.size).toFixed(2);
  if (spec?.colors) c.colors = { ...c.colors, ...spec.colors };
  return c;
}
const TAU = Math.PI * 2;
/** Shortest signed difference between two angles. */
export function angleDelta(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

/** S4: how much bigger a monster of this rank / with these affixes is drawn. Pure — exported for tests. */
export function rankScale(rank, mods = null) {
  let k = rank === 'boss' ? 1.45 : rank === 'rare' ? 1.32 : rank === 'champion' ? 1.24 : rank === 'elite' ? 1.18 : 1;
  if (Array.isArray(mods) && mods.some(m => /giant|huge|colossal/.test(modKey(m)))) k *= 1.35;
  return +k.toFixed(3);
}
/** An affix as text: an id string, or the server's {id, name, aura} (protocol §20.4). */
export const modKey = m => (m && typeof m === 'object' ? `${m.id || ''} ${m.name || ''}` : String(m || '')).toLowerCase();
export const isLeader = mods => Array.isArray(mods) && mods.some(m => /leader|alpha|chief|warlord|pack/.test(modKey(m)));
const RANK_COLOUR = { rare: '#ffd040', champion: '#5aa0ff', elite: '#c0c0c0' };
const CHIBI_ANIMS = ['idle', 'ready', 'walk', 'run', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead', 'swim', 'sitGround', 'drink', ...CHIBI2_MOUNT_ANIMS, ...CHIBI2_DUAL_ANIMS, ...CHIBI2_ANGLE_ANIMS, ...CHIBI2_REVIVE_ANIMS, ...CHIBI2_PROF_ANIMS];   // sitGround/drink: eating and drinking (S20)   // swim: P25; ride/rideGallop: Q16

/** Clips that are a strike: asked for again = a new swing, so they restart (T6: the dual-wield strikes too). */
const STRIKES = new Set(['attack', 'hit', ...CHIBI2_DUAL_ANIMS, 'fishCast', 'fishShow', 'standUp']);
/**
 * T6: the clip for a basic swing, from what is in both hands. `hand: 'off'` (the server names the off hand) wins; with
 * no word on whose turn it is the pair alternates by the actor's own swing count: main, off, main, off, both.
 * Pure — exported for tests. -> a clip name ('attack' when the hands hold no pair).
 */
export function swingClip(hold, { hand = null, count = 0, offSeen = false, mainCount = 0 } = {}) {
  if (!hold) return 'attack';
  if (hand === 'off') return dualAttackFor(hold, { hand: 'off' }) || 'attack';
  // once the server has swung the off hand itself (C, play-test 5), a main swing is the main hand's — every third, both
  return (offSeen ? dualAttackFor(hold, { hand: 'main', step: mainCount }) : dualAttackByCount(hold, count)) || 'attack';
}

/** Pure LOD choice — exported for tests. `list` = [{ id, kind, d }] -> Set of ids that get a full body. */
export function chooseFull(list, { fullMax = 30, monsterRange = 120, selfId = null } = {}) {
  const full = new Set();
  const players = list.filter(a => a.kind === 'player' || a.kind === 'npc').sort((a, b) => a.d - b.d);
  for (const a of players) { if (a.id === selfId || full.size < fullMax) full.add(a.id); }
  for (const a of list) if (a.kind !== 'player' && a.kind !== 'npc' && a.d < monsterRange) full.add(a.id);
  return full;
}
const SKIN = { human: '#e8bf98', elf: '#f0d2b4', dwarf: '#d9a77a', halfling: '#e9c49c' };
/** Pieces with a vertex colour, merged into one geometry. */
function mergeColoured(pieces) {
  let n = 0; for (const { g } of pieces) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
  let o = 0;
  for (const { g, c } of pieces) {
    const cnt = g.attributes.position.count; const cc = new THREE.Color(c);
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = cc.r; col[(o + i) * 3 + 1] = cc.g; col[(o + i) * 3 + 2] = cc.b; }
    if (g.index) for (const i of g.index.array) idx.push(i + o); else for (let i = 0; i < cnt; i++) idx.push(i + o);
    o += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}
/** The far stand-in's body (~1.45 m chibi): tunic tinted by class, darker legs, arms, boots. */
export function farBodyGeometry() {
  const tunic = new THREE.CylinderGeometry(0.2, 0.3, 0.55, 8); tunic.translate(0, 0.62, 0);
  const belt = new THREE.CylinderGeometry(0.29, 0.29, 0.06, 8); belt.translate(0, 0.42, 0);
  const legL = new THREE.CylinderGeometry(0.075, 0.08, 0.38, 6); legL.translate(-0.11, 0.2, 0);
  const legR = legL.clone(); legR.translate(0.22, 0, 0);
  const armL = new THREE.CylinderGeometry(0.06, 0.055, 0.46, 6); armL.rotateZ(0.32); armL.translate(-0.3, 0.64, 0);
  const armR = new THREE.CylinderGeometry(0.06, 0.055, 0.46, 6); armR.rotateZ(-0.32); armR.translate(0.3, 0.64, 0);
  const boots = new THREE.BoxGeometry(0.42, 0.08, 0.2); boots.translate(0, 0.04, 0.03);
  return mergeColoured([{ g: tunic, c: '#ffffff' }, { g: belt, c: '#4a3a2a' }, { g: legL, c: '#5a5560' }, { g: legR, c: '#5a5560' }, { g: armL, c: '#e6e6e6' }, { g: armR, c: '#e6e6e6' }, { g: boots, c: '#3a2e24' }]);
}
/** …and its head: a big skin sphere (tinted by people) with a hair cap and two dark eyes. */
export function farHeadGeometry() {
  const head = new THREE.SphereGeometry(0.34, 12, 9); head.translate(0, 1.14, 0);
  const hair = new THREE.SphereGeometry(0.36, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55); hair.translate(0, 1.16, -0.02);
  const eyeL = new THREE.SphereGeometry(0.045, 6, 4); eyeL.translate(-0.11, 1.12, 0.31);
  const eyeR = eyeL.clone(); eyeR.translate(0.22, 0, 0);
  return mergeColoured([{ g: head, c: '#ffffff' }, { g: hair, c: '#4a3426' }, { g: eyeL, c: '#1a1410' }, { g: eyeR, c: '#1a1410' }]);
}
const CLASS_TINT = { warrior: '#b04a3a', knight: '#9aa4b4', paladin: '#e0c060', ranger: '#4f8a3a', rogue: '#3a3a44', cleric: '#e8e0c8', mage: '#4a6ad0', bard: '#c060a0', monk: '#d0902a', druid: '#6a9a4a', necromancer: '#5a3a6a', pyromancer: '#e0602a' };

/** Is a Chibi 2 body what is showing for this actor? (a player in a druid shape is a beast until it changes back — U16) */
const person = a => (a.kind === 'player' || !!a.humanoid) && !a.shape;
/**
 * U16 (play-test 6): the creature a shape is drawn as, from C's `shape` object `{ id, creature, scale, colors, upright }`.
 * Pure — exported for tests. -> { key (cache key), type (avatar-3d creature type), size, colors, upright } or null.
 */
export function shapeSpec(shape) {
  if (!shape || typeof shape !== 'object') return null;
  const type = bodyTypeFor(shape.creature || shape.body || 'wolf');
  const size = Math.max(0.5, Math.min(2.5, Number(shape.scale) || 1));
  const colors = shape.colors && typeof shape.colors === 'object' ? shape.colors : null;
  return { key: `${shape.id || type}|${type}|${size}|${colors ? JSON.stringify(colors) : ''}|${shape.upright ? 'u' : ''}`, id: shape.id || type, type, size, colors, upright: !!shape.upright };
}

export function createActors(scene, { plateLayer, camera, quality = 'high', renderer = null, waterAt = null }) {
  const actors = new Map();
  const queue = [];
  const FULL_MAX = quality === 'low' ? 12 : 30, PLATE_MAX = quality === 'low' ? 24 : 40, ANIM_NEAR = 25;
  // the far crowd: a low-poly chibi (big head, short body) in two instanced meshes — the body tinted by
  // class, the head by people (skin) with dark hair baked in — two draw calls for the whole crowd
  const FAR_CAP = 400;
  const farMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const farBody = new THREE.InstancedMesh(farBodyGeometry(), farMat, FAR_CAP);
  const farHead = new THREE.InstancedMesh(farHeadGeometry(), farMat, FAR_CAP);
  for (const m of [farBody, farHead]) { m.count = 0; m.frustumCulled = false; m.castShadow = false; scene.add(m); }
  farBody.name = 'far-crowd-body'; farHead.name = 'far-crowd-head';
  const _fm = new THREE.Matrix4(), _fq = new THREE.Quaternion(), _fs = new THREE.Vector3(1, 1, 1), _fp = new THREE.Vector3(), _fc = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);
  let lodAt = 0, fullSet = new Set();
  const lodStats = { full: 0, far: 0, plates: 0, built: 0 };
  const standinGeo = new THREE.CapsuleGeometry(0.35, 0.9, 4, 10);
  const standinMat = new THREE.MeshStandardMaterial({ color: '#8b8f99', transparent: true, opacity: 0.35, roughness: 1 });

  // Selection rings on the ground: red for hostile, green-gold for friendly; a dimmer one on hover.
  const ringGeo = new THREE.RingGeometry(0.85, 1.0, 48); ringGeo.rotateX(-Math.PI / 2);
  const mkRing = (color, opacity) => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false })); m.renderOrder = 2; m.visible = false; scene.add(m); return m; };
  const targetRing = mkRing('#ff4a3a', 0.9), hoverRing = mkRing('#ffffff', 0.35);
  // P25: a swimmer pushes rings of ripples across the water surface
  const rippleGeo = new THREE.RingGeometry(0.55, 0.75, 40); rippleGeo.rotateX(-Math.PI / 2);
  const rippleMat = new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.45, depthWrite: false });
  function ripple(a, now) {
    const on = a.swim && waterAt && !a.dead && a.group.visible;
    let w = null;
    if (on) { w = waterAt(a.pos.x, a.pos.z); if (!(w && Number.isFinite(w.surface))) w = null; }
    if (!w) { if (a.ripples) for (const r of a.ripples) r.visible = false; return; }
    // a beast floats with its back out of the water (the server holds every swimmer at surface - 1.1 m: a person's feet)
    if (!(a.kind === 'player' || a.humanoid || a.kind === 'npc')) a.group.position.y = Math.max(a.group.position.y, w.surface - a.height * 0.45);
    if (!a.ripples) { a.ripples = [0, 1].map(() => { const m = new THREE.Mesh(rippleGeo, rippleMat.clone()); m.renderOrder = 2; scene.add(m); return m; }); }
    a.ripples.forEach((m, k) => {
      const ph = ((now / 1000) * (a.speed > 0.4 ? 1.1 : 0.55) + k * 0.5) % 1;
      m.visible = true; m.position.set(a.group.position.x, w.surface + 0.03, a.group.position.z);
      m.scale.setScalar(0.6 + ph * 1.6); m.material.opacity = 0.4 * (1 - ph);   // each ring fades as it spreads
    });
  }

  function add(info, { self = false } = {}) {
    let a = actors.get(info.id);
    if (a) { Object.assign(a, pick(info)); a.dead = a.hp <= 0; refreshPlate(a); return a; }
    a = {
      id: info.id, kind: info.kind, self, ...pick(info), still: null,
      group: new THREE.Group(), model: null, body: null, anim: 'idle', oneShot: null, oneShotUntil: 0,
      recoil: new THREE.Vector3(), punch: 0, dead: info.hp <= 0, speed: 0, yaw: info.yaw || 0, height: info.kind === 'monster' || info.pet ? 1.2 : 1.9,
      pos: new THREE.Vector3(info.x, info.y, info.z), plate: null, lastSeen: performance.now(), deathAt: 0, fade: 1,
    };
    a.group.position.copy(a.pos);
    a.group.userData.actorId = a.id;
    const stand = new THREE.Mesh(standinGeo, standinMat); stand.position.y = 0.8; a.group.add(stand); a.standin = stand;
    scene.add(a.group);
    a.plate = makePlate(a);
    actors.set(a.id, a);
    queue.push(a);
    return a;
  }
  function pick(i) { return { name: i.name, level: i.level, hp: i.hp, hpMax: i.hpMax, hostile: !!i.hostile, look: i.look, creature: i.creature, family: i.family, rank: i.rank || null, pet: !!i.pet, role: i.role || null, mods: Array.isArray(i.mods) ? i.mods : null, sc: Number.isFinite(i.sc) && i.sc > 0 ? i.sc : null }; }

  async function build(a) {
    a.building = true; lodStats.built++;
    const t0 = performance.now();
    try {
      let body;
      if (a.kind === 'monster' || a.pet) {
        const looks = await loadMonsterLooks();
        const look = looks[a.creature?.type] || null;
        a.flying = !!look?.flying;
        const big = a.sc ? Math.max(0.5, Math.min(3, a.sc)) : rankScale(a.rank, a.mods);      // S4: rares and champions stand out by size (a giant much more)
        const kindOfBody = bodyKindFor(a.creature?.type, look);
        if (kindOfBody === 'dummy') {
          // #61: a post, a sack and a target board (it had no looks row, and an unknown creature type is a wolf)
          body = createDummyBody(); a.fixed = true; a.flying = false;
        } else if (look?.avatar) {
          // A humanoid monster (brigand, cultist, knight): a Chibi 2 body, scaled up when it is an elite or boss.
          body = await createChibi2Character(normalizeAvatar(look.avatar), { anims: CHIBI_ANIMS });
          a.humanoid = true;
          body.group.scale.setScalar(big);
        } else {
          const spec = look?.creature ? { ...look.creature, seed: a.creature?.seed, size: (look.creature.size || 1) * big } : { ...(a.creature || { type: 'wolf' }), size: big };
          body = await createCreature(look?.creature ? spec : creatureFor(spec), { detail: a.rank === 'boss' ? 1 : 0.8 });
        }
        // One draw call per moving part instead of one per eye and toe (Farhold R27 M8).
        if (!body.isProp) try { compactCreature(body); } catch (e) { console.warn('[actors] compact failed', e); }
      } else {
        body = await createChibi2Character(await avatarFor(a.look), { anims: CHIBI_ANIMS });
      }
      lodStats.buildMs = Math.max(lodStats.buildMs || 0, Math.round(performance.now() - t0));   // wall time, awaits included
      if (!actors.has(a.id) || a.body) { body.dispose?.(); return; }
      body.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      // P1: compile the body's shaders BEFORE it replaces the stand-in. A new monster family or outfit is a new
      // program; compiled on its first draw it froze the frame for 1.5-3 s on the test VM. compileAsync uses
      // KHR_parallel_shader_compile, so on a real GPU the stand-in simply stays up a few frames longer.
      // S4: a rare's ring and banner ride the body, so they compile with it (added after the first draw they froze 1.8 s)
      if (a.kind === 'monster' && (isLeader(a.mods) || a.rank === 'rare' || a.rank === 'champion')) addRankMark(a, body.group);
      if (renderer) await compileBeforeShow(renderer, body.group, camera, scene);
      if (!actors.has(a.id) || a.body) { body.dispose?.(); return; }
      a.body = body; a.model = body.group;
      a.group.remove(a.standin); a.group.add(a.model);
      try { const m = body.metrics(); a.height = Math.max(0.8, m.height || m.totalHeight || a.height); } catch {}
      // P28: the click/hover volume is the body's real size (a squat bog slime, a long crocodile, a dragon), not one
      // fixed radius — and never thinner than 0.6 m so a rat is still easy to click
      try {
        // the body's own space (it has no parent yet): geometry boxes in bind pose — a SkinnedMesh's own box reads its
        // bones' world matrices, which are stale here (it measured 100 m tall: the terrain height)
        a.model.updateMatrixWorld(true);
        const box = new THREE.Box3(), tmp = new THREE.Box3();
        a.model.traverse(o => { if (!o.isMesh || !o.geometry?.attributes?.position) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); tmp.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp); });
        const size = box.getSize(new THREE.Vector3());
        if (Number.isFinite(size.x) && size.y > 0.05 && size.y < 20) { a.pickR = Math.max(0.6, Math.min(4, Math.max(size.x, size.z) * 0.55)); a.pickTop = Math.max(0.6, size.y); if (a.kind === 'monster' || a.pet) a.height = Math.max(0.6, Math.min(a.height, size.y * 1.05)); }
      } catch { /* the default volume stands */ }
      if (a.dead) setAnim(a, 'dead');
    } catch (e) {
      console.warn('[actors] body failed for', a.id, e);
    }
  }

  // ---- mounts (play-test 2, Q16): `info.mount` / `you.mount` names what someone rides; the body sits in its saddle ----
  const mountCache = new Map();          // mount id -> a spare built mount (dismounting keeps it for the next ride)
  function dropMount(a) {
    if (!a.mount) { a.mountHave = null; return; }
    try { a.unseat?.(); } catch {}
    a.group.remove(a.mount.group);
    if (!mountCache.has(a.mountHave)) mountCache.set(a.mountHave, a.mount); else a.mount.dispose();
    a.mount = null; a.unseat = null; a.mountHave = null;
    if (a.baseHeight) { a.height = a.baseHeight; a.baseHeight = 0; }
    if (a.model) { a.group.add(a.model); a.model.position.set(0, 0, 0); a.model.rotation.set(0, a.yaw, 0); }
  }
  async function syncMount(a) {
    const want = a.dead || a.shape || a.shapeWant ? null : a.mountWant ?? null;      // (U16: a shape does not ride)
    if (want === (a.mountHave ?? null)) return;
    dropMount(a);
    if (!want || !a.body) return;
    a.mounting = true;
    try {
      let m = mountCache.get(want); mountCache.delete(want);
      if (!m) {
        m = await createMount(mountSpecFor(a.mountLook || want), { detail: quality === 'low' ? 0.6 : 1 });
        m.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
        if (renderer) await compileBeforeShow(renderer, m.group, camera, scene);
      }
      if (!actors.has(a.id) || !a.body || (a.mountWant ?? null) !== want || a.dead) { mountCache.set(want, m); return; }
      a.group.add(m.group); m.group.rotation.y = a.yaw;
      a.unseat = seatRider(m, a.body);
      a.mount = m; a.mountHave = want;
      try { const mm = m.metrics(); a.baseHeight = a.height; a.height = a.height + (mm.seatY || 1) * 0.85; } catch {}
    } catch (e) { console.warn('[actors] mount failed', want, e); a.mountHave = want; }
    finally { a.mounting = false; }
  }
  /** S20: eating ('food') or drinking ('drink') sits the body down until it moves; null = done. */
  function setEating(id, kind) { const a = actors.get(id); if (a) a.eating = kind || null; }
  /** Q16: what this actor rides (a mount id, or null to get down). `look` = the mount's own look when the server sends one. */
  function setMount(id, mountId, look = null) {
    const a = actors.get(id); if (!a || a.kind === 'monster' || a.pet) return;
    a.mountWant = mountId || null; if (look) a.mountLook = look;
  }

  // S4: a gold ring under a rare (blue for a champion) and a banner-glow over a pack leader: seen from across a field
  const markGeo = new THREE.RingGeometry(0.9, 1.08, 40); markGeo.rotateX(-Math.PI / 2);
  const markMats = {};
  function addRankMark(a, into) {
    if (a.rankMark) return;
    const s = into.scale.x || 1;          // the body group may be scaled up (a rare): marks are sized in world metres
    // measured here (before the body is on show): its own box, in world metres — a.height/pickR are not known yet
    const box = new THREE.Box3().setFromObject(into), size = box.getSize(new THREE.Vector3());
    const H = Number.isFinite(size.y) && size.y > 0.2 && size.y < 20 ? size.y : 1.4, R = Number.isFinite(size.x) ? Math.max(0.9, Math.max(size.x, size.z) * 0.6) : 1.1;
    const col = isLeader(a.mods) ? '#ff9a30' : RANK_COLOUR[a.rank] || '#ffd040';
    const mat = markMats[col] || (markMats[col] = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthWrite: false, fog: true }));
    const m = new THREE.Mesh(markGeo, mat); m.position.y = 0.06 / s; m.scale.setScalar(R * 1.15 / s); m.renderOrder = 2;
    into.add(m); a.rankMark = m;
    if (isLeader(a.mods)) {
      // a war-banner on a pole riding the leader's back, and a glow over it
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), new THREE.MeshStandardMaterial({ color: '#4a3a2a' }));
      pole.position.set(0, (H + 0.5) / s, -0.25 / s); pole.scale.setScalar(1 / s); into.add(pole); a.pole = pole;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.4), new THREE.MeshStandardMaterial({ color: '#a8281e', side: THREE.DoubleSide, emissive: '#5a1008' }));
      flag.position.set(0.28, 0.55, 0); pole.add(flag); a.flag = flag;
    }
  }

  // ---- druid shapes (play-test 6, U16/U18): `info.form` / `fx form` says what a player is shaped as; the avatar is put
  // away and a real creature body stands in its place under the same name plate, walks and strikes with the creature's
  // own clips, and the avatar comes back when the shape ends. Bodies are compiled before they show and kept for the
  // next time (the boot warm-up has already linked every shape's programs), so the swap is a frame, not a stall. ----
  const BEAST_CLIP = { idle: 'idle', ready: 'idle', walk: 'walk', run: 'run', attack: 'attack', hit: 'idle', dead: 'dead', cast: 'attack', swim: 'walk', jump: 'idle', guard: 'idle' };
  const shapeCache = new Map();          // spec.key -> spare bodies
  function dropShape(a, dispose = false) {
    const sh = a.shape; if (!sh) return;
    a.group.remove(sh.pivot); a.shape = null;
    if (dispose || (shapeCache.get(sh.key)?.length || 0) >= 2) sh.body.dispose?.();
    else { if (!shapeCache.has(sh.key)) shapeCache.set(sh.key, []); shapeCache.get(sh.key).push(sh); }
    if (a.model) a.model.visible = true;
    if (a.baseShapeHeight) { a.height = a.baseShapeHeight; a.baseShapeHeight = 0; }
    a.pickR = a.basePickR ?? a.pickR; a.pickTop = a.basePickTop ?? a.pickTop;
    a.anim = null;
  }
  async function syncShape(a) {
    const want = a.dead && !a.shape ? null : a.shapeWant || null;
    if ((want?.key ?? null) === (a.shape?.key ?? null)) return;
    if (!want) { dropShape(a); lodStats.shapes = (lodStats.shapes || 0); return; }
    if (!a.body) return;
    a.shaping = true;
    try {
      let sh = shapeCache.get(want.key)?.pop() || null;
      if (!sh) {
        const spec = randomCreature(want.type, 7);
        spec.size = +(spec.size * want.size).toFixed(2);
        if (want.colors) spec.colors = { ...spec.colors, ...want.colors };
        const body = await createCreature(spec, { detail: quality === 'low' ? 0.7 : 1 });
        try { compactCreature(body); } catch {}
        body.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
        const pivot = new THREE.Group(); pivot.name = 'shape:' + want.id; pivot.add(body.group);
        let h = 1.2, len = 1.4;
        try { const box = new THREE.Box3().setFromObject(body.group), size = box.getSize(new THREE.Vector3()); if (size.y > 0.1 && size.y < 12) { h = size.y; len = Math.max(size.x, size.z); } } catch {}
        // `upright` (the Moonpelt wolf): reared back on its hind legs — tipped up about the haunches and lifted so the hind feet stay down
        if (want.upright) { body.group.rotation.x = -0.95; body.group.position.set(0, len * 0.36, -len * 0.12); h = Math.max(h, len * 0.95); }
        if (renderer) await compileBeforeShow(renderer, pivot, camera, scene);
        sh = { key: want.key, id: want.id, body, pivot, h, r: Math.max(0.6, Math.min(3, len * 0.5)), anim: null };
      }
      if (!actors.has(a.id) || !a.body || (a.shapeWant?.key ?? null) !== want.key) { if (!shapeCache.has(sh.key)) shapeCache.set(sh.key, []); shapeCache.get(sh.key).push(sh); return; }
      dropMount(a); dropShape(a);
      a.shape = sh; a.group.add(sh.pivot); sh.pivot.rotation.y = a.yaw; sh.anim = null;
      if (a.model) a.model.visible = false;
      a.baseShapeHeight = a.height; a.basePickR = a.pickR; a.basePickTop = a.pickTop;
      a.height = Math.max(0.8, sh.h * 1.02); a.pickR = sh.r; a.pickTop = sh.h;
      a.oneShot = null; a.anim = null; a.fishing = null;
      lodStats.shapes = (lodStats.shapes || 0) + 1;
    } catch (e) { console.warn('[actors] shape failed', want?.id, e); a.shapeWant = null; }
    finally { a.shaping = false; }
  }
  /** U16: what this player is shaped as (C's `{ id, creature, scale, colors, upright }`), or null to change back. */
  function setShape(id, shape) {
    const a = actors.get(id); if (!a || a.kind !== 'player') return false;
    a.shapeWant = shapeSpec(shape);
    return true;
  }

  function setAnim(a, name) {
    if (!a.body) { a.anim = name; return; }
    if (a.shape) { const n = BEAST_CLIP[name] || (/^dual|^twin|attack/.test(name) ? 'attack' : name === 'dead' ? 'dead' : 'idle'); if (a.shape.anim !== n || n === 'attack') { a.shape.body.setAnim(n); a.shape.anim = n; } }      // U16: the shape's own clips
    else if ((a.kind === 'monster' || a.pet) && !a.humanoid) { if (a.anim !== name) a.body.setAnim(name); }
    else a.body.setAnim(name, name === 'standUp' ? 0.04 : 0.14, STRIKES.has(name));
    a.anim = name;
  }

  function remove(id) {
    const a = actors.get(id); if (!a) return;
    dropMount(a); dropShape(a, true); scene.remove(a.group); a.body?.dispose?.(); a.plate?.root.remove();
    if (a.ripples) for (const r of a.ripples) { scene.remove(r); r.material.dispose(); }
    a.group.clear();           // detaches any spell aura riding the body (SpellFx drops an aura whose group has no parent)
    actors.delete(id);
  }

  // --- nameplates (DOM, so text is crisp at any size) -------------------------------------------
  function makePlate(a) {
    if (!plateLayer) return null;
    const root = document.createElement('div');
    root.className = `plate ${a.kind} ${a.hostile ? 'hostile' : 'friendly'}${a.self ? ' self' : ''}${a.rank && a.rank !== 'normal' ? ' rank-' + a.rank : ''}`;
    root.innerHTML = `<div class="plate-bubble"></div><div class="plate-title" hidden></div><div class="plate-name"><span class="plate-lvl"></span><span class="plate-n"></span></div><div class="plate-bar"><i></i><b></b></div>`;
    plateLayer.appendChild(root);
    const p = { root, bubble: root.querySelector('.plate-bubble'), bubbleUntil: 0, title: root.querySelector('.plate-title'), name: root.querySelector('.plate-n'), lvl: root.querySelector('.plate-lvl'), bar: root.querySelector('.plate-bar i'), lag: root.querySelector('.plate-bar b'), lagW: 1 };
    a.plate = p; refreshPlate(a);
    return p;
  }
  function refreshPlate(a) {
    const p = a.plate; if (!p) return;
    p.name.textContent = a.name; p.lvl.textContent = a.level;
    // play-test 4 S19: what a town NPC IS ("<Weaponsmith>", "<Barber>") over the name (ui/pt2.js sets a.npcTitle)
    if (p.title) { p.title.hidden = !a.npcTitle; if (a.npcTitle) p.title.textContent = `<${a.npcTitle}>`; }
    const f = Math.max(0, Math.min(1, a.hp / (a.hpMax || 1)));
    p.bar.style.width = (f * 100).toFixed(1) + '%';
    p.root.classList.toggle('hurt', f < 0.999);
    p.root.classList.toggle('dead', a.hp <= 0);
  }

  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function updatePlates(targetId, hoverId) {
    if (!plateLayer) return;
    const w = plateLayer.clientWidth, h = plateLayer.clientHeight;
    // the PLATE_MAX nearest get a plate (plus whoever you target or hover); the rest stay hidden
    const order = [];
    for (const a of actors.values()) if (a.plate) order.push([camera.position.distanceToSquared(a.group.position), a]);
    order.sort((p, q) => p[0] - q[0]);
    let shown = 0;
    for (const [, a] of order) {
      const p = a.plate;
      _v.set(a.group.position.x, a.group.position.y + a.height + 0.35, a.group.position.z);
      const dist = camera.position.distanceTo(_v);
      // Behind the camera a projected point can still land inside the screen (mirrored): test camera space first.
      const front = _w.copy(_v).applyMatrix4(camera.matrixWorldInverse).z < -0.1;
      _v.project(camera);
      const bubbling = p.bubbleUntil > performance.now();
      if (p.bubble && !bubbling && p.bubble.style.display !== 'none') p.bubble.style.display = 'none';
      const special = a.id === targetId || a.id === hoverId;
      let show = front && _v.z < 1 && a.fade > 0.05 && (bubbling ? dist < 60 : !a.noPlate && dist < (a.self ? 0 : 70));
      if (show && !special && shown >= PLATE_MAX) show = false;
      if (!show) { if (p.shown !== false) { p.root.style.display = 'none'; p.shown = false; } continue; }
      shown++;
      if (p.shown !== true) { p.root.style.display = ''; p.shown = true; }
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      const s = Math.max(0.62, Math.min(1, 14 / dist));
      const tf = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%) scale(${s.toFixed(2)})`;
      if (tf !== p.tf) { p.root.style.transform = tf; p.tf = tf; }
      const op = (Math.min(1, (70 - dist) / 12) * a.fade).toFixed(2);
      if (op !== p.op) { p.root.style.opacity = op; p.op = op; }
      const far = a.lod === 'far';
      if (far !== p.far) { p.root.classList.toggle('far', far); p.far = far; }
      if (p.tgt !== (a.id === targetId)) { p.tgt = a.id === targetId; p.root.classList.toggle('targeted', p.tgt); }
      const hv = a.id === hoverId && a.id !== targetId;
      if (p.hv !== hv) { p.hv = hv; p.root.classList.toggle('hovered', hv); }
      // The trailing "damage taken" bar catches up after a beat (reads as a chunk being knocked off).
      const f = Math.max(0, a.hp / (a.hpMax || 1));
      if (Math.abs(f - p.lagW) > 0.001) { p.lagW += (f - p.lagW) * (f < p.lagW ? 0.04 : 1); p.lag.style.width = (p.lagW * 100).toFixed(1) + '%'; }
    }
    lodStats.plates = shown;
  }

  // --- per frame --------------------------------------------------------------------------------
  function update(dt, renderTime, { selfPos = null, selfYaw = 0, selfMoving = 0, selfSwim = false, targetId = null, hoverId = null, sample = null, speed = null } = {}) {
    const now = performance.now();
    // LOD: who gets a body (re-ranked four times a second)
    if (now >= lodAt) {
      lodAt = now + 250;
      const cp = camera.position;
      const list = [...actors.values()].map(a => ({ id: a.id, kind: a.pet ? 'monster' : a.kind, d: Math.hypot(a.pos.x - cp.x, a.pos.z - cp.z) }));
      fullSet = chooseFull(list, { fullMax: FULL_MAX, selfId: [...actors.values()].find(a => a.self)?.id });
      for (const a of actors.values()) {
        const full = fullSet.has(a.id) || a.id === 'preview';
        if (a.lod === undefined || full !== (a.lod === 'full')) { a.lod = full ? 'full' : 'far'; a.lodSince = now; }
        // a body far away for half a minute is let go
        if (a.lod === 'far' && a.body && now - a.lodSince > 30000) { dropMount(a); dropShape(a); a.group.remove(a.model); a.body.dispose?.(); a.body = null; a.model = null; a.building = false; a.group.add(a.standin); }
      }
    }
    // build the nearest full actor still waiting for a body (one a frame)
    if (queue.length) {
      const cp = camera.position;
      let bi = -1, bd = Infinity;
      for (let i = 0; i < queue.length; i++) { const a = queue[i]; if (!actors.has(a.id)) { queue.splice(i--, 1); continue; } if (a.lod !== 'full') continue; const d = Math.hypot(a.pos.x - cp.x, a.pos.z - cp.z); if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0) { const a = queue.splice(bi, 1)[0]; perf.span('actor:build', () => build(a)); }
    }
    let farN = 0;
    for (const a of actors.values()) {
      if (a.self && selfPos) {
        a.pos.set(selfPos.x, selfPos.y, selfPos.z);
        a.yaw += angleDelta(a.yaw, selfYaw) * Math.min(1, dt * 16);
        a.speed = selfMoving;
        a.swim = !!selfSwim;
      } else {
        const s = a.still || (sample ? sample(a.id, renderTime) : null);
        if (s && a.dead && a.deadPos && Math.hypot(s.x - a.deadPos.x, s.z - a.deadPos.z) < 8) {
          // P8: a corpse lies where it fell. A body the server still nudges (a knock-back landing, a follower
          // parked on its owner) would otherwise slide along the ground on its back; a jump of 8 m+ is a
          // respawn/relocate and moves it.
          a.pos.set(a.deadPos.x, s.y, a.deadPos.z);
        } else if (s) {
          if (a.dead) a.deadPos = { x: s.x, z: s.z };
          a.pos.set(s.x, s.y, s.z);
          a.swim = !!s.swim;
          // Turn smoothly toward the sampled facing (sample yaw already interpolates; this hides 3 Hz far updates).
          a.yaw += angleDelta(a.yaw, s.yaw) * Math.min(1, dt * 12);
        }
        a.speed = a.still ? (a.still.speed || 0) : speed ? speed(a.id, renderTime) : 0;
      }
      // Hit recoil and punch decay.
      a.recoil.multiplyScalar(Math.exp(-dt * 10));
      a.punch *= Math.exp(-dt * 12);
      a.group.position.set(a.pos.x + a.recoil.x, a.pos.y + (a.flying && !a.dead ? 1.3 + Math.sin(now / 420 + (typeof a.id === 'number' ? a.id : 0)) * 0.15 : 0), a.pos.z + a.recoil.z);
      if (a.mount) { a.mount.group.rotation.y = a.yaw; a.mount.setGait(a.speed); }
      if (a.model) { a.model.rotation.y = a.mount ? 0 : a.yaw; a.model.scale.setScalar(1 + a.punch * 0.12); }
      if (a.shape) { a.shape.pivot.rotation.y = a.yaw; a.shape.pivot.scale.setScalar(1 + a.punch * 0.12); }
      if (a.body && (a.shapeWant?.key ?? null) !== (a.shape?.key ?? null) && !a.shaping) syncShape(a);
      if (a.body && a.mountWant !== (a.mountHave ?? null) && !a.mounting) syncMount(a);
      if (a.swim || a.ripples) ripple(a, now);

      // Animation.
      let want;
      if (a.dead) want = 'dead';
      else if (a.mount) want = a.mount.riderClip;
      else if (a.eating && a.speed <= 0.4 && !(a.oneShot && now < a.oneShotUntil)) want = a.eating === 'drink' ? 'drink' : 'sitGround';   // S20: sat down to eat           // Q16: in the saddle; the mount's gait picks ride / rideGallop
      else if (a.swim && !a.shape && (a.kind === 'player' || a.humanoid || a.kind === 'npc')) want = 'swim';      // P25
      else if (a.oneShot === 'standUp' && now < a.oneShotUntil && a.speed > 0.6) { a.oneShot = null; want = 'walk'; }   // T4: walking off cuts the getting-up short
      else if (a.oneShot && now < a.oneShotUntil) want = a.oneShot;
      else if (a.fishing && a.speed <= 0.4 && person(a)) want = a.fishing === 'tug' ? 'fishReel' : 'fishWait';   // T25: a line in the water
      else if (a.working && a.speed <= 0.4 && person(a)) want = a.working;   // W9 (P-client): at a node or a station (prof-view.js names the clip)
      else {
        a.oneShot = null;
        const sp = a.speed;
        want = a.flying && !a.humanoid ? 'fly' : sp > 4.2 ? 'run' : sp > 0.4 ? 'walk' : (a.kind === 'player' && now - (a.lastCombat || 0) < 5000 ? 'ready' : 'idle');
      }
      if (want !== a.anim) setAnim(a, want);
      if (a.body?.setRate) {
        if (a.shape) a.shape.body.setRate?.(a.anim === 'run' ? Math.max(0.6, a.speed / 5.2) : a.anim === 'walk' ? Math.max(0.5, a.speed / 1.5) : 1);
        else if (a.kind === 'player' || a.humanoid) {
          const run = a.anim === 'run';
          a.body.setRate(a.anim === 'run' || a.anim === 'walk' ? Math.max(0.5, a.speed * (run ? 0.65 : 1.05) / (run ? 3.4 : 2.0)) : a.anim === 'swim' ? (a.speed > 0.4 ? 1.1 : 0.45) : 1);
        } else a.body.setRate(a.anim === 'run' ? Math.max(0.6, a.speed / 5.2) : a.anim === 'walk' ? Math.max(0.5, a.speed / 1.5) : 1);
      }
      // far: drawn by the instanced crowd, no mixer at all
      const far = a.lod === 'far' && !a.self && a.id !== 'preview';
      a.group.visible = !far;
      if (far) {
        // far people are one instanced crowd; far beasts (past 120 m) are simply not drawn
        if ((a.kind === 'player' || a.kind === 'npc') && !a.pet && farN < FAR_CAP && a.fade > 0.05) {
          _fq.setFromAxisAngle(_up, a.yaw); _fs.setScalar(a.dead ? 0.0001 : 1);
          const bob = a.speed > 0.4 ? Math.abs(Math.sin(now / 1000 * (a.speed > 4.2 ? 11 : 7) + (typeof a.id === 'number' ? a.id : a.id.length))) * 0.07 : 0;
          _fm.compose(_fp.set(a.group.position.x, a.group.position.y + bob, a.group.position.z), _fq, _fs);
          farBody.setMatrixAt(farN, _fm); farHead.setMatrixAt(farN, _fm);
          farBody.setColorAt(farN, _fc.set(CLASS_TINT[a.look?.cls] || '#9a8f80'));
          farHead.setColorAt(farN, _fc.set(SKIN[a.look?.race] || SKIN.human));
          farN++;
        }
        if (!a.body && !a.building && !queue.includes(a)) queue.push(a);     // build when it comes close
        continue;
      }
      if (!a.body && !a.building && !queue.includes(a)) queue.push(a);
      if (a.body) {
        const dCam = Math.hypot(a.pos.x - camera.position.x, a.pos.z - camera.position.z);
        if (dCam > ANIM_NEAR && !a.self) { a.animAcc = (a.animAcc || 0) + dt; if (a.animAcc >= 0.1) { a.body.update(a.animAcc, now / 1000); a.mount?.update(a.animAcc, now / 1000); a.animAcc = 0; } }
        else { a.body.update(dt, now / 1000); a.mount?.update(dt, now / 1000); }
        if (a.shape) a.shape.body.update(dt, now / 1000);
      }

      // Corpses fade and sink after a while (monsters only; players stand back up on respawn).
      if (a.dead && a.kind === 'monster' && a.deathAt && now - a.deathAt > 9000 && !a.lootMark) {   // a body with loot for you stays (Q3)
        a.fade = Math.max(0, 1 - (now - a.deathAt - 9000) / 2500);
        a.group.position.y -= (1 - a.fade) * 0.8;
      } else a.fade = 1;
    }
    for (const m of [farBody, farHead]) { m.count = farN; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    lodStats.full = fullSet.size; lodStats.far = farN;
    // Rings.
    const ta = targetId != null ? actors.get(targetId) : null;
    targetRing.visible = !!ta && ta.fade > 0.1;
    if (ta) { const r = ta.kind === 'monster' ? Math.max(0.9, (ta.pickR || 0.9) * 1.05) : 0.75; targetRing.position.set(ta.group.position.x, ta.group.position.y + 0.06, ta.group.position.z); targetRing.scale.setScalar(r * (1 + Math.sin(now / 180) * 0.03)); targetRing.material.color.set(ta.hostile ? '#ff4a3a' : '#7fe08a'); }
    const ha = hoverId != null && hoverId !== targetId ? actors.get(hoverId) : null;
    hoverRing.visible = !!ha;
    if (ha) { hoverRing.position.set(ha.group.position.x, ha.group.position.y + 0.05, ha.group.position.z); hoverRing.scale.setScalar(ha.kind === 'monster' ? Math.max(0.9, (ha.pickR || 0.9) * 1.05) : 0.75); }
    updatePlates(targetId, hoverId);
  }

  // --- events -----------------------------------------------------------------------------------
  /**
   * A swing. `o.hand` / `o.clip` come from the server's event when it has them; a pair of weapons picks its own
   * strike (T6: main hand, off hand, both — see swingClip). The same swing is often told twice (the snapshot's anim
   * and the cast event): a second call inside 280 ms is the same swing and does not start another.
   */
  function playAttack(id, targetId, o = null) {
    const a = actors.get(id); if (!a || a.dead) return;
    const t = actors.get(targetId), now = performance.now();
    if (t && !a.self) a.yaw = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
    a.lastCombat = now;
    if (now - (a.swingAt || 0) < 280 && !o?.force) return;
    const people = person(a);
    if (o?.hand === 'off') a.offSeen = true;
    const clip = (people && o?.clip) || (people && a.body?.hold ? swingClip(a.body.hold, { hand: o?.hand, count: a.swingN | 0, offSeen: !!a.offSeen, mainCount: a.mainN | 0 }) : 'attack');
    a.swingN = (a.swingN | 0) + 1; if (o?.hand !== 'off') a.mainN = (a.mainN | 0) + 1; a.swingAt = now; a.fishing = null;
    a.oneShot = clip; a.oneShotUntil = now + (clip === 'attack' ? (a.kind === 'monster' ? 650 : 600) : Math.round((CHIBI2_DUAL_SECONDS[clip] || 0.6) * 1000));
    setAnim(a, clip);
  }
  /** T25 / T4: play one of the body's one-shot clips (fishCast, fishShow, standUp…) for its own length. */
  function playClip(id, clip, ms = null) {
    const a = actors.get(id); if (!a || a.dead || !person(a)) return false;
    a.oneShot = clip; a.oneShotUntil = performance.now() + (ms ?? Math.round((CHIBI2_DUAL_SECONDS[clip] || 1) * 1000));
    setAnim(a, clip);
    return true;
  }
  /** T25: 'wait' (line out), 'tug' (fighting a fish) or null. Moving, swinging or dying ends it. */
  function setFishing(id, state) { const a = actors.get(id); if (a) a.fishing = state || null; }
  /** W9 (P-client): a work loop (`profMine` … `profStir`, avatar-3d chibi2-motion-prof.js) or null. Moving shows the walk; a swing or dying ends it. */
  function setWorking(id, clip) { const a = actors.get(id); if (a) a.working = clip || null; }
  function playHit(id, fromId, amount) {
    const a = actors.get(id); if (!a) return;
    const src = actors.get(fromId);
    if (src && amount > 0) {
      const dx = a.pos.x - src.pos.x, dz = a.pos.z - src.pos.z, d = Math.hypot(dx, dz) || 1;
      if (a.fixed) a.body?.hit?.(dx, dz, a.yaw, amount);            // #61: a thing on a post rocks where it stands
      else a.recoil.set(dx / d * 0.28, 0, dz / d * 0.28);
    }
    a.punch = a.fixed ? 0 : amount > 0 ? 1 : 0.3;
    a.lastCombat = performance.now();
    if (!a.dead && amount > 0 && a.kind === 'player' && (!a.oneShot || a.oneShot === 'hit')) { a.oneShot = 'hit'; a.oneShotUntil = performance.now() + 380; }
  }
  function setDead(id, dead) {
    const a = actors.get(id); if (!a) return;
    if (dead) { a.mountWant = null; dropMount(a); }
    if (a.rankMark) a.rankMark.visible = !dead; if (a.pole) a.pole.visible = !dead;
    if (a.dead === dead && (dead ? a.deathAt : true)) { refreshPlate(a); return; }
    a.dead = dead;
    if (dead) { a.hp = 0; a.deathAt = performance.now(); a.oneShot = null; a.fishing = null; a.deadPos = { x: a.pos.x, z: a.pos.z }; }
    else {
      // standing back up: drop the corpse pose at once (a crossfade from 'dead' reads as being dragged upright)
      // T4: a person gets up — off the ground, onto a knee, upright (`standUp` starts in the corpse's own pose, so there
      // is no drag). A beast, or a body that lay dead for under a second, just stands.
      const lay = a.deathAt ? performance.now() - a.deathAt : 0;
      a.deathAt = 0; a.fade = 1; a.deadPos = null; a.oneShot = null;
      if (a.body && person(a) && lay > 900) { a.anim = null; a.oneShot = 'standUp'; a.oneShotUntil = performance.now() + Math.round(CHIBI2_DUAL_SECONDS.standUp * 1000); setAnim(a, 'standUp'); a.stoodAt = performance.now(); }
      else if (a.body) { a.anim = null; setAnim(a, 'idle'); }
    }
    refreshPlate(a);
  }
  function setHp(id, hp, hpMax) { const a = actors.get(id); if (!a) return; if (hp != null) a.hp = hp; if (hpMax != null) a.hpMax = hpMax; refreshPlate(a); }

  /** Pick the actor under a screen point (NDC). Uses a fat vertical capsule test so small wolves are easy to click. */
  const _ray = new THREE.Raycaster(), _p = new THREE.Vector3(), _c = new THREE.Vector3();
  function pickAt(ndc, { exclude = null } = {}) {
    _ray.setFromCamera(ndc, camera);
    let best = null, bestT = Infinity;
    for (const a of actors.values()) {
      if (a.id === exclude || a.fade < 0.3) continue;
      const r = a.pickR || (a.kind === 'monster' ? 0.9 : 0.6);
      const top = a.pickTop || a.height;
      // Closest approach between the ray and the actor's vertical segment (feet to head, four samples).
      for (let k = 0; k <= 3; k++) {
        _c.set(a.group.position.x, a.group.position.y + Math.max(0.25, top * (0.12 + k * 0.28)), a.group.position.z);
        const t = _p.subVectors(_c, _ray.ray.origin).dot(_ray.ray.direction);
        if (t < 0) continue;
        const d = _ray.ray.at(t, _p).distanceTo(_c);
        if (d < r && t < bestT) { bestT = t; best = a; }
      }
    }
    return best;
  }

  /** P22: dress a player in a new look (gear changed). Keeps the body and its clips; swaps the parts. */
  async function setLook(id, look) {
    const a = actors.get(id); if (!a || a.kind === 'monster' || a.pet) return;
    a.look = look;
    if (!a.body || a.humanoid) return;              // a body still building picks the new look up on its own
    const av = await avatarFor(look);
    if (a.body && a.look === look) await a.body.setAvatar?.(av);
  }

  /** A room change gives the same body a new id: keep the model, move the key. */
  function rekey(oldId, newId) {
    const a = actors.get(oldId); if (!a || oldId === newId) return a;
    actors.delete(oldId); a.id = newId; a.group.userData.actorId = newId; actors.set(newId, a);
    return a;
  }

  /** A speech bubble over someone's head (say chat), for a few seconds scaled to the line's length. */
  function say(id, text) {
    const a = actors.get(id); if (!a?.plate) return;
    const p = a.plate;
    p.bubble.textContent = text; p.bubble.style.display = '';
    p.bubbleUntil = performance.now() + Math.min(9000, 3500 + text.length * 60);
    p.root.classList.toggle('self-plate', !!a.self);
  }

  return { actors, lodStats, setShape, setMount, setEating, add, remove, rekey, say, update, setLook, playAttack, playClip, setFishing, setWorking, playHit, setDead, setHp, pickAt, get: id => actors.get(id), refreshPlate };
}
