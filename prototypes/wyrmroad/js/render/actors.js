// Everyone on the road: heroes (Chibi 2.6, dressed from their gear), Rook Gang / Lantern Order foes (Chibi looks from
// enemies.json) and creatures (avatar-3d creatures.js). Each actor follows the sim's view state: drawn between steps
// (lerp p → now, rule 28), facing its `dir` with heroes turned ~25° toward the camera, one clip per state and one-shot
// clips from `move` events timed to their `dur`. Enemy wind-ups glow and show a "!" (rule 39). Drawn height = data height
// (rule 21). Bodies are built sliced (prepareChibi2) and cached by look; while a new look builds the old body (or a
// stand-in) stays on screen.
import * as THREE from 'three';
import { createChibi2Character, prepareChibi2 } from '../../../../avatar-3d/js/chibi2.js';
import { CHIBI2_COMBAT_ALL, CHIBI2_MELEE_ANIMS, CHIBI2_EMOTE_ANIMS, CHIBI2_CLIP_SECONDS } from '../../../../avatar-3d/js/chibi2-motion.js';
import { createCreature } from '../../../../avatar-3d/js/creatures.js';
import { compactCreature } from '../../../../avatar-3d/js/mesh-merge.js';
import { dressedLook } from '../sim/items.js';
import { blobTex, angleMaskTex, glyphAtlas } from './kit.js';

/** Every clip a Wyrmroad Chibi is built with (classes.json / enemies.json name only clips from these lists). */
export const CHIBI_ANIMS = [...new Set([...CHIBI2_COMBAT_ALL, ...CHIBI2_MELEE_ANIMS, ...CHIBI2_EMOTE_ANIMS])];
/** Player colours (ring under each hero; the HUD uses the same four). */
export const HERO_COLORS = ['#f2c14e', '#3ec7c0', '#ef5b4c', '#a77df0'];
export const HERO_HEIGHT = 1.75;
const THREAT = new THREE.Color('#ff6a3a');
const FRIEND_TELL = new THREE.Color('#ffd36a');
const ICE = new THREE.Color('#5aa8ff');
const breathe = () => new Promise(r => setTimeout(r, 0));
const TURN = 0.44;   // ~25°: heroes face partly toward the camera so faces read

// ------------------------------------------------------------------------------------------------ outline (inverted hull)
// One program each for skinned and rigid bodies; per-actor clones only carry the opacity (dead fade), so no recompiles.
function outlineMaterial(skinned, thickness) {
  const m = new THREE.MeshBasicMaterial({ color: 0x1c1410, side: THREE.BackSide, alphaHash: true });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace(skinned ? '#include <skinning_vertex>' : '#include <begin_vertex>',
      (skinned ? '#include <skinning_vertex>' : '#include <begin_vertex>') + `\n transformed += normalize(${skinned ? 'objectNormal' : 'normal'}) * ${thickness.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => 'wyrm-outline-' + (skinned ? 's' : 'r') + thickness.toFixed(4);
  return m;
}
const OUTLINE = { skinned: null, rigid: null };
function outlineBase(skinned) {
  const k = skinned ? 'skinned' : 'rigid';
  if (!OUTLINE[k]) OUTLINE[k] = outlineMaterial(skinned, skinned ? 0.011 : 0.016);
  return OUTLINE[k];
}
function cloneMat(m) {
  const c = m.clone();
  if (m.onBeforeCompile) c.onBeforeCompile = m.onBeforeCompile;
  if (m.customProgramCacheKey) c.customProgramCacheKey = m.customProgramCacheKey;
  return c;
}

// ------------------------------------------------------------------------------------------------ bodies
/**
 * A body: { obj, kind, h (native height), play(name, { dur, fade, restart }), loop(name, rate), update(dt), mats, dispose() }.
 * Materials are per-actor clones (same shader program) so one actor can flash without flashing every look-alike.
 */
async function buildChibi(look, { low, anims = CHIBI_ANIMS, outline = true } = {}) {
  const o = { v25: true, v26: true, anims, park: true, ...(low ? { graphics: 'low' } : {}) };
  try { await prepareChibi2(look, { ...o, slice: breathe, budget: 8 }); } catch { /* the build below reports it */ }
  const c = await createChibi2Character(look, o);
  const mats = [], outlines = [];
  const skinned = []; c.group.traverse(n => { if (n.isSkinnedMesh) skinned.push(n); });
  for (const n of skinned) {
    const m = cloneMat(n.material); m.alphaHash = true; n.material = m; n.castShadow = true; mats.push(m);
    if (outline) {
      const om = outlineBase(true).clone(); om.onBeforeCompile = outlineBase(true).onBeforeCompile; om.customProgramCacheKey = outlineBase(true).customProgramCacheKey;
      const hull = new THREE.SkinnedMesh(n.geometry, om); hull.castShadow = false; hull.boundingSphere = n.boundingSphere;
      hull.bind(n.skeleton, n.bindMatrix); n.parent.add(hull); outlines.push(om); mats.push(om);
    }
  }
  const h = c.metrics().height || 1.3;
  let cur = 'idle';
  return {
    obj: c.group, kind: 'chibi', h, mats, outlines, chibi: c,
    get anim() { return cur; },
    play(name, { dur = 0, fade = 0.08, restart = true } = {}) {
      if (!anims.includes(name)) name = fallbackClip(name, anims);
      c.setAnim(name, fade, restart); cur = name;
      const len = CHIBI2_CLIP_SECONDS[name] || 0.6;
      c.setRate(dur > 0 ? len / dur : 1);
    },
    loop(name, rate = 1, fade = 0.15) {
      if (!anims.includes(name)) name = fallbackClip(name, anims);
      if (cur !== name) c.setAnim(name, fade, false); cur = name; c.setRate(rate);
    },
    update(dt) { c.update(dt); },
    dispose() { for (const m of mats) m.dispose(); c.dispose(); },
  };
}
function fallbackClip(name, anims) {
  if (name === 'getup') return 'ready';
  if (/cast|channel|pray/.test(name) && anims.includes('cast')) return 'cast';
  return anims.includes('attack') ? 'attack' : 'idle';
}

const CREATURE_LOOPS = new Set(['idle', 'walk', 'run', 'fly', 'talk']);
async function buildCreature(spec, { low, outline = true } = {}) {
  const c = await createCreature(spec, { detail: low ? 0.5 : 0.85 });
  compactCreature(c);      // one skinned mesh per material kind instead of one mesh per bead (avatar-3d/js/mesh-merge.js)
  const mats = [];
  const meshes = []; c.group.traverse(n => { if (n.isMesh) meshes.push(n); });
  c.group.updateMatrixWorld(true);
  const sizeOf = n => { if (!n.geometry.boundingSphere) n.geometry.computeBoundingSphere(); const v = new THREE.Vector3(); n.getWorldScale(v); return n.geometry.boundingSphere.radius * Math.max(v.x, v.y, v.z); };
  // the folded body (skinned) gets the hull; of the pieces that move on their own only the two biggest do
  const ranked = meshes.map(n => [n, sizeOf(n)]).sort((x, y) => (y[0].isSkinnedMesh - x[0].isSkinnedMesh) || (y[1] - x[1]));
  let rigidHulls = 0;
  for (const [n] of ranked) {
    const m = n.material.clone(); if (n.material.onBeforeCompile) m.onBeforeCompile = n.material.onBeforeCompile;
    m.alphaHash = true; m.userData.baseEmissive = m.emissive?.clone(); m.userData.baseEI = m.emissiveIntensity ?? 1;
    n.material.dispose(); n.material = m; mats.push(m);    // the original was never drawn: no shader is released
    if (!outline) continue;
    if (n.isSkinnedMesh) {
      const om = outlineBase(true).clone(); om.onBeforeCompile = outlineBase(true).onBeforeCompile; om.customProgramCacheKey = outlineBase(true).customProgramCacheKey;
      const hull = new THREE.SkinnedMesh(n.geometry, om); hull.castShadow = false; hull.frustumCulled = false; hull.bind(n.skeleton, n.bindMatrix); n.parent.add(hull); mats.push(om);
    } else if (rigidHulls < 2 && sizeOf(n) > 0.1) {
      const om = outlineBase(false).clone(); om.onBeforeCompile = outlineBase(false).onBeforeCompile; om.customProgramCacheKey = outlineBase(false).customProgramCacheKey;
      const hull = new THREE.Mesh(n.geometry, om); hull.castShadow = false; n.add(hull); mats.push(om); rigidHulls++;
    }
  }
  const box = new THREE.Box3().setFromObject(c.group);
  const h = Math.max(0.2, box.max.y - Math.min(0, box.min.y));
  let cur = 'idle', oneT = 0;
  return {
    obj: c.group, kind: 'creature', h, mats, creature: c,
    get anim() { return cur; },
    play(name, { dur = 0 } = {}) {
      const n = name === 'dead' ? 'dead' : (name === 'talk' ? 'talk' : (name === 'hit' ? 'talk' : 'attack'));
      c.setAnim('idle'); c.setAnim(n); cur = n; oneT = dur || 0.6;
      c.setRate(n === 'attack' && dur > 0 ? Math.max(0.4, Math.min(2.5, 0.7 / dur)) : 1);
    },
    loop(name, rate = 1) {
      const n = name === 'ready' ? 'idle' : (CREATURE_LOOPS.has(name) ? name : (name === 'dead' ? 'dead' : 'idle'));
      if (cur !== n) { c.setAnim(n); cur = n; }
      c.setRate(rate);
    },
    update(dt) { c.update(dt); if (oneT > 0) oneT -= dt; },
    dispose() { for (const m of mats) m.dispose(); c.dispose(); },
  };
}

/** A capsule in the actor's colour, shown until the first real body is ready (never an empty spot). */
function standIn(color, h) {
  const g = new THREE.Group();
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color).multiplyScalar(0.7) });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, h - 0.9, 4, 10), m); body.position.y = h / 2 - 0.1; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), m); head.position.y = h - 0.3; g.add(head);
  return { obj: g, kind: 'stand', h, mats: [m], play() {}, loop() {}, update() {}, dispose() { m.dispose(); body.geometry.dispose(); head.geometry.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ the cast
/**
 * createActors({ scene, data, quality }) → { sync(G, alpha, dt), handle(events, G), get(id), clear(), preload(ch, heroes), setVisible(on) }
 */
export function createActors({ scene, data, quality = 'high' }) {
  const low = quality === 'low';
  const root = new THREE.Group(); root.name = 'actors'; scene.add(root);
  const actors = new Map();           // entity id → actor
  const pool = new Map();             // body key → [bodies] (foes that left, ready for the next of their kind)
  const atlas = glyphAtlas();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, color: 0xffffff });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2);
  const reviveGeo = new THREE.RingGeometry(0.62, 0.8, 48).rotateX(-Math.PI / 2);
  const clockGeo = new THREE.RingGeometry(0.86, 0.94, 48).rotateX(-Math.PI / 2);
  // ring UVs are planar, so the angle mask works; one material per hero (its own fill level)

  const lookKey = o => JSON.stringify(o);
  function bodyKeyFor(e) {
    if (e.side === 'hero') {
      const look = heroLook(e);
      return { key: 'h' + lookKey(look), make: () => buildChibi(look, { low, outline: !low }) };
    }
    const def = data.enemies.foes[e.kind] || data.enemies.bosses[e.kind];
    if (!def) return null;
    if (def.body === 'creature') return { key: 'c' + lookKey(def.look), make: () => buildCreature(def.look, { low, outline: !low }), height: def.height };
    return { key: 'f' + lookKey(def.look), make: () => buildChibi(def.look, { low, outline: !low }), height: def.height };
  }
  function heroLook(e) {
    const look = dressedLook(data.classes, data.items, { cls: e.cls, look: e.look || {}, gear: e.gear || {} });
    if (e.pickup) {
      const P = data.chapters.pickups[e.pickup.id];
      if (P) {
        if (/targe|shield|scutcheon/.test(P.held)) look.offhand = { id: P.held, color: P.color };
        else { look.held = { id: P.held, color: P.color }; if (!/morningstar|scepter|club/.test(P.held)) look.offhand = { id: 'none' }; }
      }
    }
    return look;
  }
  function getBody(spec) {
    const list = pool.get(spec.key);
    if (list && list.length) return Promise.resolve(list.pop());
    return spec.make();
  }
  function release(spec, body) {
    if (!spec || body.kind === 'stand') { body.dispose(); return; }
    body.obj.removeFromParent();
    const list = pool.get(spec.key) || []; pool.set(spec.key, list);
    if (list.length < 6) list.push(body); else body.dispose();
  }

  function makeActor(e, G) {
    const hero = e.side === 'hero';
    const def = hero ? null : (data.enemies.foes[e.kind] || data.enemies.bosses[e.kind]);
    const height = hero ? HERO_HEIGHT : (def?.height || 1.7);
    const color = hero ? HERO_COLORS[(G.heroes.indexOf(e)) % 4] : (e.side === 'ally' ? '#c8a060' : '#6a7050');
    const group = new THREE.Group(); group.name = 'actor:' + e.id; root.add(group);
    const yawG = new THREE.Group(); group.add(yawG);            // facing
    const pivot = new THREE.Group(); yawG.add(pivot);          // tumbles and spins (rotates about mid-height)
    const holder = new THREE.Group(); pivot.add(holder);
    pivot.position.y = height * 0.5; holder.position.y = -height * 0.5;
    const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.025; blob.renderOrder = 1; group.add(blob);
    let ring = null, revive = null, clock = null;
    if (hero || e.side === 'ally') {
      ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })); ring.position.y = 0.03; ring.renderOrder = 2; group.add(ring);
    }
    if (hero) {
      const mk = (geo, c) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, alphaMap: angleMaskTex(), alphaTest: 0.999, side: THREE.DoubleSide, depthWrite: false })); m.position.y = 0.04; m.visible = false; m.renderOrder = 3; group.add(m); return m; };
      revive = mk(reviveGeo, '#7cf0a0'); clock = mk(clockGeo, '#ff7a5a');
      const back = new THREE.Mesh(reviveGeo, new THREE.MeshBasicMaterial({ color: 0x10241a, transparent: true, opacity: 0.55, depthWrite: false })); back.position.y = 0.035; back.visible = false; group.add(back); revive.userData.back = back;
    }
    // the "!" over a foe winding up
    const tellMat = new THREE.SpriteMaterial({ map: atlas.tex.clone(), color: THREAT, depthTest: false, transparent: true });
    { const r = atlas.rects['!'], t = tellMat.map; t.needsUpdate = true; t.repeat.set(r.w / atlas.W, r.h / atlas.H); t.offset.set(r.x / atlas.W, 1 - (r.y + r.h) / atlas.H); }
    const tell = new THREE.Sprite(tellMat); tell.visible = false; tell.renderOrder = 20; tell.scale.set(0.42, 0.63, 1); group.add(tell);

    const a = {
      id: e.id, hero, side: e.side, kind: e.kind, def, height, group, yawG, pivot, holder, blob, ring, revive, clock, tell, color,
      body: null, spec: null, wantKey: '',
      yaw: (e.dir || 1) > 0 ? Math.PI / 2 : -Math.PI / 2, shotT: 0, shotAnim: null, prevState: e.state, stateT: 0,
      flash: 0, flashColor: new THREE.Color(1, 1, 1), windT: 0, windDur: 0, fade: 1, spin: 0, lean: 0, scale: 1, lastTint: '',
    };
    setBody(a, standIn(color, height), null);
    requestBody(a, e);
    actors.set(e.id, a);
    return a;
  }

  function setBody(a, body, spec) {
    if (a.body) { a.holder.remove(a.body.obj); release(a.spec, a.body); }
    a.body = body; a.spec = spec; a.holder.add(body.obj);
    a.scale = a.height / body.h; body.obj.scale.setScalar(a.scale);
    if (body.kind === 'creature') body.obj.position.y = 0;   // creature feet are at y=0
    a.lastTint = '';
    // keep the clip the old body was playing
    if (a.shotAnim && a.shotT > 0) body.play(a.shotAnim, { dur: a.shotT });
    else body.loop(a.loopName || 'idle');
  }
  function requestBody(a, e) {
    const spec = bodyKeyFor(e);
    if (!spec || spec.key === a.wantKey) return;
    a.wantKey = spec.key;
    const p = getBody(spec);
    p.then(body => {
      if (!actors.has(a.id) || a.wantKey !== spec.key) { release(spec, body); return; }
      setBody(a, body, spec);
    }).catch(err => console.error('wyrmroad: body build failed', e.kind, err));
  }

  function removeActor(a) {
    actors.delete(a.id);
    if (a.body) { a.holder.remove(a.body.obj); release(a.spec, a.body); a.body = null; }
    a.group.removeFromParent();
    a.tell.material.map.dispose(); a.tell.material.dispose();
    for (const m of [a.ring, a.revive, a.clock, a.revive?.userData.back]) if (m) m.material.dispose();
  }

  // ---------------------------------------------------------------------------------------------- per-frame
  const tmpC = new THREE.Color();
  let frameNo = 0, crowd = false;   // the view never writes to G
  function loopFor(a, e, G, speed) {
    switch (e.state) {
      case 'dash': return ['run', 1.5];
      case 'block': return [e.cls === 'warden' || a.def?.shield ? 'block' : 'guard', 1];
      case 'grab': return ['ready', 1];
      case 'enter': return ['walk', Math.max(0.7, Math.min(1.8, speed / 2.2))];
      case 'held': return ['hit', 0.6];
      default: break;
    }
    const an = e.anim || 'idle';
    if (an === 'walk' || speed > 0.6) return speed > 5.5 ? ['run', Math.max(0.8, Math.min(1.6, speed / 6))] : ['walk', Math.max(0.6, Math.min(2, speed / (a.height * 1.25)))];
    if (an === 'run') return ['run', 1];
    if (an === 'jump' || e.y > 0.05) return [a.body?.kind === 'creature' ? 'idle' : 'jump', 1];
    return [G.phase === 'fight' || !a.hero ? 'ready' : 'idle', 1];
  }

  function syncOne(a, e, G, alpha, dt) {
    const x = e.px != null ? e.px + (e.x - e.px) * alpha : e.x;
    const y = e.py != null ? e.py + (e.y - e.py) * alpha : e.y;
    const z = e.pz != null ? e.pz + (e.z - e.pz) * alpha : e.z;
    const speed = a.lastX != null && dt > 0 ? Math.hypot(x - a.lastX, (z - a.lastZ)) / dt : 0;
    a.speed = a.speed == null ? speed : a.speed + (speed - a.speed) * Math.min(1, dt * 10);
    a.lastX = x; a.lastZ = z;
    a.group.position.set(x, y, z);
    a.drawn = a.group.position;

    // rebuild when the look changes (gear, look, a ground weapon picked up or broken)
    if (a.hero) { const k = 'h' + lookKey(heroLook(e)); if (k !== a.wantKey) requestBody(a, e); }

    // facing: heroes partly toward the camera; foes a little; creatures side-on
    const turn = a.hero ? TURN : (a.body?.kind === 'creature' ? 0.12 : 0.28);
    const want = (e.dir || 1) > 0 ? Math.PI / 2 - turn : -Math.PI / 2 + turn;
    let d = want - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    a.yaw += d * Math.min(1, dt * 18);
    a.yawG.rotation.y = a.yaw;

    // state changes
    const st = e.state;
    if (st !== a.prevState) { onState(a, e, a.prevState, st); a.prevState = st; a.stateT = 0; }
    a.stateT += dt;

    const body = a.body;
    if (a.shotT > 0) a.shotT -= dt;
    const lying = st === 'down' || st === 'out' || st === 'dead' || st === 'air' || st === 'thrown';
    if (lying) {
      a.shotT = 0;
      if (body && body.anim !== 'dead') body.play('dead', { dur: st === 'air' || st === 'thrown' ? 0.45 : 0.6, fade: 0.06 });
    } else if (st === 'hurt' || st === 'held') {
      a.shotT = 0;
      if (body && (body.anim !== 'hit' || a.hitAgain)) body.play('hit', { dur: 0.45, fade: 0.05 });
    } else if (a.shotT <= 0) {
      const [n, rate] = loopFor(a, e, G, a.speed);
      a.loopName = n;
      if (body) body.loop(n, rate, a.getupFade || 0.15);
      a.getupFade = 0;
    }
    a.hitAgain = false;

    // tumbles: thrown spins, held dangles, frozen stops
    let spin = 0, lean = 0;
    if (st === 'thrown') { a.spin += dt * 14; spin = a.spin; }
    else { a.spin = 0; }
    if (st === 'held') lean = -0.35;
    if (st === 'hurt') lean = Math.max(0, 0.25 - a.stateT) * -1.2;
    a.lean += (lean - a.lean) * Math.min(1, dt * 14);
    a.pivot.rotation.x = spin;
    a.pivot.rotation.z = 0;
    a.holder.rotation.x = a.lean;
    // crowd throttle: with many Chibis on screen, foes that are only idling or walking animate on alternate frames
    // (twice the step) — heroes, and anyone striking, hurt or falling, every frame
    a.animAcc = (a.animAcc || 0) + (e.freezeT > 0 ? 0 : dt);
    const busy = a.hero || a.shotT > 0 || lying || st === 'hurt' || st === 'held' || a.flash > 0;
    if (body && (busy || !crowd || ((a.id + frameNo) & 1) === 0)) { body.update(a.animAcc); a.animAcc = 0; }

    // blob shadow shrinks with height; hero ring
    const hs = Math.max(0.35, 1 - y * 0.35), bw = (a.body?.kind === 'creature' ? 1.1 : 0.8) * Math.max(0.8, a.height / 1.7);
    a.blob.position.y = 0.025 - y; a.blob.scale.set(bw * hs, 1, bw * 0.6 * hs);
    if (a.ring) { a.ring.position.y = 0.03 - y; a.ring.visible = st !== 'gone' && st !== 'dead'; }

    // revive ring + down clock for a hero who is out
    if (a.revive) {
      const out = st === 'out';
      a.revive.visible = a.clock.visible = a.revive.userData.back.visible = out;
      if (out) {
        const k = Math.min(1, (e.reviveT || 0) / (G.T.reviveTime || 2));
        a.revive.material.alphaTest = Math.max(0.002, 1 - Math.max(0.004, k));
        const c = Math.min(1, Math.max(0, (e.downClock || 0) / (G.T.downTime || 3)));
        a.clock.material.alphaTest = Math.max(0.002, 1 - Math.max(0.004, c));
        a.revive.position.y = a.clock.position.y = 0.04 - y; a.revive.userData.back.position.y = 0.035 - y;
      }
    }

    // wind-up tell
    if (a.windT > 0) {
      a.windT -= dt;
      const k = 1 - Math.max(0, a.windT) / Math.max(0.05, a.windDur);
      a.tell.visible = true; a.tell.position.y = a.height + 0.45 + k * 0.1;
      const s = 0.36 + 0.18 * k + (a.windT < 0.08 ? 0.15 : 0); a.tell.scale.set(s * 0.67, s, 1);
      a.tell.material.opacity = 0.65 + 0.35 * k;
    } else a.tell.visible = false;

    // visibility: i-frame blink, dead fade, gone
    let vis = st !== 'gone';
    if (e.invT > 0 && st !== 'out' && st !== 'dead' && st !== 'down') vis = vis && (Math.floor(G.t * 14) % 2 === 0);
    a.group.visible = vis;
    if (st === 'dead') a.fade = Math.max(0, 1 - Math.max(0, a.stateT - 1.1) / 1.2); else a.fade = 1;
    tint(a, e, G, dt);
  }

  function onState(a, e, from, to) {
    if (from === 'down' && to !== 'down' && to !== 'out' && to !== 'dead') { a.getupFade = 0.45; a.shotT = 0; }
    if (from === 'out' && to === 'idle') { a.getupFade = 0.45; a.shotT = 0; }
    if (to === 'dead' || to === 'out') { a.windT = 0; }
    if (to !== 'move') { a.windT = 0; }
  }

  /** Flash / tell / burn / ice / fade on this actor's own materials (uniform changes only). */
  function tint(a, e, G, dt) {
    if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 9);
    const body = a.body; if (!body) return;
    let em = null, ek = 0;
    if (a.flash > 0.01) { em = a.flashColor; ek = a.flash * 0.26; }      // a short, light flash: the body still reads under it
    else if (a.windT > 0) { const k = 1 - Math.max(0, a.windT) / Math.max(0.05, a.windDur); em = e.team === 0 ? FRIEND_TELL : THREAT; ek = 0.12 + 0.3 * k * (0.7 + 0.3 * Math.sin(G.t * 40)); }
    else if (e.burnT > 0) { em = tmpC.setRGB(1, 0.45, 0.1); ek = 0.25 + 0.25 * Math.abs(Math.sin(G.t * 23)); }
    const ice = e.freezeT > 0;
    const key = (em ? em.getHexString() + ek.toFixed(2) : '-') + (ice ? 'i' : '') + a.fade.toFixed(2);
    if (key === a.lastTint) return;
    a.lastTint = key;
    for (const m of body.mats) {
      if (m.side === THREE.BackSide) { m.opacity = a.fade; continue; }
      m.opacity = a.fade;
      if (!m.emissive) continue;
      if (!m.userData.baseColor) { m.userData.baseColor = m.color.clone(); m.userData.baseEmissive = m.userData.baseEmissive || m.emissive.clone(); m.userData.baseEI = m.userData.baseEI ?? m.emissiveIntensity; }
      if (em) { m.emissive.copy(em); m.emissiveIntensity = ek; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEI; }
      if (ice) { m.color.copy(m.userData.baseColor).lerp(ICE, 0.55); if (!em) { m.emissive.set('#1a4a8a'); m.emissiveIntensity = 0.35; } } else m.color.copy(m.userData.baseColor);
    }
  }

  // ---------------------------------------------------------------------------------------------- api
  return {
    root, actors,
    sync(G, alpha, dt) {
      frameNo++;
      let chibis = 0; for (const x of actors.values()) if (x.body?.kind === 'chibi') chibis++;
      crowd = chibis > 8;
      const seen = new Set();
      for (const e of G.heroes) { seen.add(e.id); syncOne(actors.get(e.id) || makeActor(e, G), e, G, alpha, dt); }
      for (const e of G.foes) { seen.add(e.id); syncOne(actors.get(e.id) || makeActor(e, G), e, G, alpha, dt); }
      for (const a of [...actors.values()]) if (!seen.has(a.id)) removeActor(a);
    },
    /** One-shot clips, flashes and tells from this frame's events. */
    handle(events, G) {
      for (const ev of events) {
        if (ev.type === 'move') {
          const a = actors.get(ev.id); if (!a) continue;
          const anim = ev.anim === 'getup' ? 'ready' : ev.anim;
          if (ev.anim === 'block' || ev.anim === 'run') continue;          // held states: their loop comes from the state
          if (ev.anim === 'getup') { a.getupFade = 0.45; a.shotT = 0; continue; }   // lying → standing blend (no clip of its own)
          if (ev.anim === 'jump' && !ev.dur) { if (a.body) a.body.play('jump', { dur: 0.8 }); a.shotT = 0.8; a.shotAnim = 'jump'; a.shotKind = 'jump'; continue; }
          const dur = ev.dur || 0.5;
          a.shotT = dur; a.shotAnim = anim; a.shotKind = ev.kind;
          if (a.body) a.body.play(anim, { dur, fade: 0.06 });
          if (!a.hero && ev.wind > 0.12) { a.windT = ev.wind; a.windDur = ev.wind; }
        } else if (ev.type === 'hit' || ev.type === 'armor') {
          const a = actors.get(ev.id); if (!a) continue;
          a.flash = ev.type === 'armor' ? 0.6 : 1; a.flashColor.set(ev.type === 'armor' ? '#c0c8d0' : (a.hero ? '#ff5a4a' : '#ffffff'));
          if (ev.type === 'hit') { a.windT = 0; a.hitAgain = true; }
        } else if (ev.type === 'block' || ev.type === 'shieldblock' || ev.type === 'perfect') {
          const a = actors.get(ev.id); if (!a) continue;
          a.flash = 0.7; a.flashColor.set(ev.type === 'perfect' ? '#ffe28a' : '#9ec8ff');
        } else if (ev.type === 'heal') {
          const a = actors.get(ev.id); if (a) { a.flash = 0.6; a.flashColor.set('#7cf0a0'); }
        }
      }
    },
    get(id) { return actors.get(id) || null; },
    /** Build every body a chapter needs before its fights (so a spawn never waits on a build). */
    async preload(ch, heroes = []) {
      const kinds = new Set();
      for (const s of ch.sections) { for (const w of s.waves) for (const f of w) kinds.add(f.split('@')[0]); if (s.boss) kinds.add(s.boss); }
      if (ch.ally) kinds.add(data.chapters.allies[ch.ally]?.foe);
      for (const b of Object.values(data.enemies.bosses)) for (const mv of b.moves || []) for (const s of mv.summon || []) if (kinds.has(Object.keys(data.enemies.bosses).find(k => data.enemies.bosses[k] === b))) kinds.add(s);
      const jobs = [];
      for (const k of kinds) {
        const def = data.enemies.foes[k] || data.enemies.bosses[k]; if (!def) continue;
        if (def.body !== 'creature') jobs.push(prepareChibi2(def.look, { v25: true, v26: true, anims: CHIBI_ANIMS, ...(low ? { graphics: 'low' } : {}), slice: breathe, budget: 8 }).catch(() => {}));
      }
      for (const h of heroes) jobs.push(prepareChibi2(heroLook(h), { v25: true, v26: true, anims: CHIBI_ANIMS, ...(low ? { graphics: 'low' } : {}), slice: breathe, budget: 8 }).catch(() => {}));
      await Promise.all(jobs);
      // one ready body per foe kind waits in the pool, so the first spawn of a kind never builds (or compiles) mid-fight
      const warm = [];
      for (const k of kinds) {
        const spec = bodyKeyFor({ side: 'foe', kind: k }); if (!spec) continue;
        if ((pool.get(spec.key) || []).length) continue;
        try { const b = await spec.make(); b.obj.position.set(0, -60, 0); root.add(b.obj); warm.push([spec, b]); } catch (err) { console.error('wyrmroad: preload failed', k, err); }
      }
      return { warm, done: () => { for (const [spec, b] of warm) { b.obj.position.set(0, 0, 0); release(spec, b); } } };
    },
    clear() { for (const a of [...actors.values()]) removeActor(a); },
    setVisible(on) { root.visible = on; },
    heroLook,
  };
}

export { buildChibi, buildCreature };
