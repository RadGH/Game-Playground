// Farhold — what a fight looks like.
//
//   swipe()  THE ARC OF THE BLADE, drawn in the plane the weapon actually travels in: flat and wide
//            for a slash or a sweep, upright for an overhead or a slam, a narrow lance for a thrust.
//            It grows as it goes, so what you see is the edge travelling rather than a shape
//            appearing. Before round 14 this was one flat white ring lying on the grass, identical
//            for a dagger jab and a two-handed smash, and it was the ONLY thing a melee hit drew.
//   shoot()  an arrow that leaves the bow, flies, and bursts where it lands — carrying the draw it
//            was loosed at, so a full draw is worth more than a flinch.
//   dust()   a puff at the feet where a slam lands or a lunge takes off.
//
//   const fx = createCombatFx(scene);
//   fx.swipe({ x, y, z, yaw, reach, arc });     // the shape comes from the swing channel
//   const arrow = fx.shoot({ x, y, z, dirX, dirZ, range });
//   fx.update(dt);     // every frame; arrows report their hits through onArrowLand
//
// The hit box itself — the flat ring on the grass — is still drawn, behind Settings -> Debug ->
// "Show swing hit boxes", because it genuinely IS what you hit and that is worth being able to see.

import * as THREE from 'three';
import { feel } from './combat-feel.js';

/**
 * Which plane a strike travels in, and what its ribbon looks like.
 *
 *   flat      a horizontal cut at chest height — slash, sweep, cleave, arc
 *   upright   a vertical chop in front of you — overhead, slam
 *   lance     a narrow band straight out along the aim — jab, thrust, lunge
 */
const SWING_PLANE = {
  slash: 'flat', sweep: 'flat', cleave: 'flat', arc: 'flat',
  overhead: 'upright', slam: 'upright',
  jab: 'lance', thrust: 'lance', lunge: 'lance', shot: 'lance',
};
/** The colour a weapon's brand paints its arc. Steel is a cold white. */
const BRAND_COLOUR = {
  physical: 0xdfe8f2, fire: 0xff9a40, ice: 0x9fd8ff, lightning: 0xffe86a,
  poison: 0x9ede6a, shadow: 0xc090ff, holy: 0xffe6a0, arcane: 0xb8a0ff, true: 0xffffff,
};

/**
 * R17 — THE STYLESHEET THE CHARGE METER NEVER HAD.
 *
 * `js/hud.js` `chargeMeter()` has appended `<div class="charge-meter"><i></i></div>` to the body on
 * every frame the attack button is held since round 15, and `grep -rn charge-meter` across the
 * whole project returns that one line and nothing else: there is no `.charge-meter` rule in
 * style.css or in any other stylesheet. An unstyled div has no size and no background, and a width
 * percentage on an inline `<i>` does nothing — so a bow's draw and a staff's channel have both been
 * drawing an invisible bar. That is one half of "does holding it actually do anything?".
 *
 * The rules belong in style.css with every other colour in the game, and style.css is not ours to
 * edit this round. Linking the stylesheet from the module that owns "what a fight looks like" is
 * the version of this fix that is actually live rather than sitting in a handoff note — the same
 * decision js/civics-ui.js made for civics.css. The <link> is added once and is a no-op in node.
 */
const CSS_HREF = 'combat.css';
function ensureCombatStyles() {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[href="${CSS_HREF}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

/**
 * R26 — where an overhead's ribbon starts: 100° up from your facing, i.e. just past vertical, over
 * and a little behind the head. It ends wherever a blade of the strike's reach meets the ground.
 */
export const UPRIGHT_FROM = (100 / 180) * Math.PI;
/** …and how far that plane is rolled onto the right shoulder (radians about the facing). */
export const UPRIGHT_ROLL = (32 / 180) * Math.PI;

/**
 * Show the top `share` of an upright ribbon. RingGeometry lays its quads out from `thetaStart`
 * (the low, forward end) upward, six indices a quad, so the top of the chop is the END of the
 * index buffer and revealing it from the top means drawing the last N quads.
 */
function revealUpright(s, share) {
  const g = s.mesh.geometry;
  const n = Math.max(1, Math.round(s.segs * Math.max(0, Math.min(1, share))));
  const total = g.index ? g.index.count : s.segs * 6;
  g.setDrawRange(total - n * 6, n * 6);
}

export function createCombatFx(scene, { onArrowLand = null, groundAt = null } = {}) {
  ensureCombatStyles();
  // ---------------------------------------------------------------- swipe arcs
  //
  // A ring sector, built fresh each swing because its angle, its radius and its PLANE all come from
  // the strike. Eight of them so a dual-wielder mid-combo never runs out and reuses a live one.
  const SWIPES = 8;
  const swipes = [];
  for (let i = 0; i < SWIPES; i++) {
    const geom = new THREE.RingGeometry(0.4, 1, 24, 1, 0, 1);
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.name = 'farhold-swipe';
    scene.add(mesh);
    swipes.push({ mesh, life: 0, span: 0, grow: 0, plane: 'flat' });
  }
  let nextSwipe = 0;

  // …and the flat ring on the grass, which IS the hit box. Kept, behind the debug switch.
  const boxes = [];
  for (let i = 0; i < 3; i++) {
    const geom = new THREE.RingGeometry(0.4, 1, 24, 1, 0, 1);
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      color: 0x66ff99, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    mesh.frustumCulled = false; mesh.visible = false; mesh.name = 'farhold-hitbox';
    scene.add(mesh);
    boxes.push({ mesh, life: 0, span: 0 });
  }
  let nextBox = 0;

  /**
   * Show the arc a swing cuts. `arc` is the full angle in radians and `reach` the outer radius —
   * the same values the hit test uses, so what you see is what you hit.
   *
   * The SHAPE — which plane it travels in, how fast it opens, what colour it is — comes out of the
   * swing channel (js/combat-feel.js), because `js/main.js` hands this function a reach and an
   * angle and has never said which of the nine strike shapes they came from. That is why a hammer
   * smash and a dagger jab drew exactly the same white ring on the grass for the life of the game.
   */
  function swipe({ x, y, z, yaw, reach = 2.9, arc = 1.5, color = null, life = 0.22, shape = null }) {
    const strike = shape || feel.swing.strike || null;
    const key = strike?.key || 'slash';
    const plane = SWING_PLANE[key] || 'flat';
    const element = feel.swing.element || 'physical';
    const hex = color ?? (BRAND_COLOUR[element] ?? BRAND_COLOUR.physical);

    const s = swipes[nextSwipe = (nextSwipe + 1) % SWIPES];
    s.mesh.geometry.dispose();
    /**
     * A LANCE IS NOT A SECTOR. A thrust that draws a cone says "I swung at everything in front of
     * me", which is the opposite of what a point weapon does — so it gets a narrow band out to full
     * reach, and a pierce line gets a narrower one still.
     */
    const span = plane === 'lance' ? Math.min(arc, 0.22) : arc;
    const inner = plane === 'lance' ? Math.max(0.2, reach * 0.12) : Math.max(0.15, reach * 0.22);
    let geom;
    s.segs = 0;
    if (plane === 'upright') {
      /**
       * R26 — AN OVERHEAD COMES DOWN, IT DOES NOT FAN UP.
       *
       *   "The third attack from the longsword (Overhead) still plays the animation that looks like
       *    the character is swinging into the air. Can you flip that cone around so it looks like
       *    the slash is coming from above?"
       *
       * The old ribbon was a sector centred on straight up, in the plane ACROSS your facing (left-
       * right and up) — a fan standing over your head, which reads as a blade thrown at the sky.
       * A chop travels in the plane that holds your facing and the vertical: it starts high and a
       * little behind the head and ends in front of you at the ground. So the sector is built in
       * that plane (+X forward, +Y up, turned onto +Z so the yaw below points it where you face),
       * from UPRIGHT_FROM (just past vertical, behind) down to where a blade of this reach meets
       * the grass, and it is REVEALED from the top down over its life (see `update`), so the edge
       * visibly falls rather than the shape appearing.
       */
      const shoulder = 1.3;
      const to = -Math.asin(Math.min(0.9, (shoulder - 0.05) / Math.max(0.5, reach)));
      const segs = 30;
      geom = new THREE.RingGeometry(Math.max(0.3, reach * 0.35), reach, segs, 1, to, UPRIGHT_FROM - to);
      geom.rotateY(-Math.PI / 2);
      // …rolled a little onto the right shoulder. Seen from behind — which is where the camera
      // always is — a chop in the exact vertical plane is edge-on, a sliver pointing at the sky.
      // Tilted, it reads as a blade falling from over the right shoulder to the ground in front.
      geom.rotateZ(UPRIGHT_ROLL);
      s.segs = segs;
      s.mesh.rotation.set(0, yaw, 0);
      s.mesh.position.set(x, y + shoulder, z);
    } else {
      geom = new THREE.RingGeometry(inner, reach, plane === 'lance' ? 6 : 30, 1, -span / 2, span);
    }
    if (plane === 'flat') {
      // the sector opens along +X after the -90 rotate; R_y(yaw - pi/2) maps +X to `forward`
      geom.rotateX(-Math.PI / 2);
      s.mesh.rotation.set(0, yaw - Math.PI / 2, 0);
      s.mesh.position.set(x, y + 1.0, z);
    } else if (plane === 'upright') {
      // placed above, with its own geometry — the flat path's rotateX would lay it on the grass
    } else {
      geom.rotateX(-Math.PI / 2);
      s.mesh.rotation.set(0, yaw - Math.PI / 2, 0);
      s.mesh.position.set(x, y + 1.05, z);
    }
    s.mesh.geometry = geom;
    s.mesh.material.color.setHex(hex);
    s.mesh.visible = true;
    // a chop is revealed from the top down (drawRange), everything else widens (scale x)
    if (plane === 'upright') { s.mesh.scale.set(1, 1, 1); revealUpright(s, 0.2); }
    else s.mesh.scale.set(0.35, 1, 1);
    s.life = life; s.span = life; s.plane = plane;
    s.weight = Math.min(1, (strike?.shake ?? 0.2) / 0.55);

    // the hit box, on request, so "what did that actually cover" is answerable
    if (feel.debugHitboxes) {
      const bx = boxes[nextBox = (nextBox + 1) % boxes.length];
      bx.mesh.geometry.dispose();
      const bg = new THREE.RingGeometry(Math.max(0.15, reach * 0.22), reach, 28, 1, -arc / 2, arc);
      bg.rotateX(-Math.PI / 2);
      bx.mesh.geometry = bg;
      bx.mesh.rotation.set(0, yaw - Math.PI / 2, 0);
      bx.mesh.position.set(x, y + 0.08, z);
      bx.mesh.visible = true; bx.life = life * 1.4; bx.span = life * 1.4;
    }

    // …and the ground goes with it, for the shapes that put their weight into it
    if (strike && (key === 'slam' || key === 'overhead' || key === 'arc' || key === 'lunge')) {
      const fx0 = Math.sin(yaw), fz0 = Math.cos(yaw);
      const at = key === 'lunge' ? 0.3 : 0.55;
      dust(x + fx0 * reach * at, y + 0.1, z + fz0 * reach * at, {
        size: key === 'slam' ? 1.5 : 0.9, life: key === 'slam' ? 0.5 : 0.34,
      });
    }
    return s;
  }

  // ---------------------------------------------------------------- arrows
  const ARROWS = 16;
  const arrowGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5);
  arrowGeom.rotateX(Math.PI / 2);                       // lie along +Z, the way it flies
  const headGeom = new THREE.ConeGeometry(0.05, 0.16, 5);
  headGeom.rotateX(Math.PI / 2);
  headGeom.translate(0, 0, 0.5);
  const arrows = [];
  for (let i = 0; i < ARROWS; i++) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(arrowGeom, new THREE.MeshBasicMaterial({ color: 0xcdbfa6 })));
    group.add(new THREE.Mesh(headGeom, new THREE.MeshBasicMaterial({ color: 0xdfe6ee })));
    group.visible = false;
    group.frustumCulled = false;
    group.name = 'farhold-arrow';
    scene.add(group);
    arrows.push({ group, live: false, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, vy: 0, speed: 0, travelled: 0, range: 0, payload: null });
  }

  // a short flash at the bow, and a puff where the arrow lands
  const PUFFS = 8;
  const puffs = [];
  for (let i = 0; i < PUFFS; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    puffs.push({ mesh, life: 0, span: 0, size: 1 });
  }
  let nextPuff = 0;
  /**
   * A PUFF AT THE FEET. A smash that leaves the ground alone weighs nothing — this is the cheapest
   * half of "hammers should smash" and it costs one pooled sphere.
   */
  function dust(x, y, z, { size = 1, life = 0.4 } = {}) {
    return puff(x, y + 0.05, z, { size, life, color: 0xbfae94, flat: true });
  }

  function puff(x, y, z, { size = 0.6, life = 0.3, color = 0xffffff, flat = false } = {}) {
    const p = puffs[nextPuff = (nextPuff + 1) % PUFFS];
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.setHex(color);
    p.mesh.visible = true;
    // dust spreads along the ground rather than ballooning into a sphere
    p.flat = !!flat;
    p.life = life; p.span = life; p.size = size;
    return p;
  }

  /**
   * Loose an arrow. The direction is three-dimensional — pass the way the player is LOOKING, not
   * just the way they are facing, or you can never shoot up a slope or down off a ledge.
   */
  function shoot({ x, y, z, dirX, dirY = 0, dirZ, range = 40, speed = 42, payload = null, power = null }) {
    const a = arrows.find(a => !a.live);
    if (!a) return null;
    /**
     * THE DRAW RIDES ON THE ARROW.
     *
     * `main.js` resolves an arrow's damage in `onArrowLand` as a bare `field.strikeArea(...)` with
     * no `power` at all — so every shot in the game was a full-power hit, and a bow drawn for a
     * tenth of a second was worth the same as one drawn to the cheek. The controller decides the
     * power (js/player.js, on release) and posts it on the swing channel; it is captured here, when
     * the arrow leaves, and re-opened for exactly the moment the landing callback runs.
     */
    a.power = power ?? feel.swing.strike?.power ?? feel.swing.shotPower ?? 1;
    a.shotStrike = feel.swing.strike || null;
    const len = Math.hypot(dirX, dirY, dirZ) || 1;
    a.live = true;
    a.x = x; a.y = y; a.z = z;
    a.dx = dirX / len; a.dy = dirY / len; a.dz = dirZ / len;
    a.speed = speed; a.vy = a.dy * speed;
    a.travelled = 0; a.range = range; a.payload = payload;
    a.group.visible = true;
    a.group.position.set(x, y, z);
    a.group.lookAt(x + a.dx, y + a.dy, z + a.dz);
    puff(x + a.dx * 0.6, y + a.dy * 0.6, z + a.dz * 0.6, { size: 0.35, life: 0.13, color: 0xfff0c0 });
    return a;
  }

  // ---------------------------------------------------------------- the channel, as you build it
  //
  // R17 — "If charging it does increase its power, we need visual indicators to let you know when
  // it has ramped up and when it is finished ramping up so that the player can execute it
  // correctly." The bar under the crosshair is one answer; this is the other, and it is the one
  // that works while you are looking at the thing you are about to hit.
  //
  // Three pieces, all pooled and all off when nothing is charging:
  //
  //   ring    a disc on the ground that grows from 0.5 m to the radius the spell will ACTUALLY
  //           cover — so a nova shows you its own footprint before it goes off
  //   shards  three motes orbiting the hands, faster and wider as it fills
  //   flash   a pulse at full, because a colour change on its own is not an event
  //
  // It reads `feel.body`, posted once a frame by whatever is ticking the controller, because this
  // module is handed a `dt` and nothing else — see the note on `postBody` in js/combat-feel.js.
  const channelRing = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 40, 1),
    new THREE.MeshBasicMaterial({
      color: 0xb9a6ff, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
  );
  channelRing.geometry.rotateX(-Math.PI / 2);
  channelRing.frustumCulled = false;
  channelRing.visible = false;
  channelRing.name = 'farhold-channel-ring';
  scene.add(channelRing);

  const SHARDS = 3;
  const shardGeom = new THREE.OctahedronGeometry(0.11, 0);
  const shards = [];
  for (let i = 0; i < SHARDS; i++) {
    const mesh = new THREE.Mesh(shardGeom, new THREE.MeshBasicMaterial({
      color: 0xb9a6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.name = 'farhold-channel-shard';
    scene.add(mesh);
    shards.push(mesh);
  }
  let channelPhase = 0;
  let channelWasFull = false;

  /**
   * Draw one frame of a charge. `fill` is 0..1, `radius` the multiplier the release will apply, and
   * `full` says the ceiling has been reached — which is the moment the player is waiting to see.
   *
   * Public as well as self-driven, so the fight screen can charge something that is not the player.
   */
  function channel({ x, y, z, yaw = 0, fill = 0, full = false, radius = 1, element = 'arcane', base = 5.5, dt = 0 } = {}) {
    const hex = BRAND_COLOUR[element] ?? BRAND_COLOUR.arcane;
    channelPhase += dt * (2.2 + fill * 5.5);
    // the footprint the spell will really cover: the staff's own radius, times what the charge buys
    const r = Math.max(0.5, base * radius * (0.35 + fill * 0.65));
    channelRing.visible = true;
    channelRing.position.set(x, y + 0.06, z);
    channelRing.scale.setScalar(r);
    channelRing.material.color.setHex(full ? 0xffe07a : hex);
    channelRing.material.opacity = (0.12 + fill * 0.3) * (full ? 1.5 : 1);

    // the motes, out at the hands and rising as it builds
    for (let i = 0; i < SHARDS; i++) {
      const live = i < 1 + Math.floor(fill * (SHARDS - 1) + 0.001);
      const m = shards[i];
      m.visible = live;
      if (!live) continue;
      const a = channelPhase + (i / SHARDS) * Math.PI * 2;
      const out = 0.42 + fill * 0.36;
      m.position.set(x + Math.cos(a) * out, y + 1.05 + fill * 0.35 + Math.sin(a * 2) * 0.05, z + Math.sin(a) * out);
      m.rotation.set(a, a * 1.4, 0);
      m.scale.setScalar(0.7 + fill * 1.1);
      m.material.color.setHex(full ? 0xffe07a : hex);
      m.material.opacity = 0.45 + fill * 0.5;
    }

    // …and the ceiling announces itself exactly once, not on every frame it stays there
    if (full && !channelWasFull) {
      puff(x, y + 1.15, z, { size: 0.7, life: 0.3, color: 0xffe07a });
      feel.jolt(0.03);
    }
    channelWasFull = full;
    // the facing is unused for a nova and kept so a cone can point the ring later
    channelRing.rotation.y = yaw;
  }

  /** Nothing is charging: put it all away. Cheap, and safe to call every frame. */
  function endChannel() {
    if (channelRing.visible) channelRing.visible = false;
    for (const m of shards) m.visible = false;
    channelWasFull = false;
  }

  function update(dt) {
    /**
     * The charge draws itself from the shared channel. `feel.body` is posted once a frame by
     * whatever is ticking the controller; with nothing posted (the first frame, a node test, a
     * cutscene) `active` is false and this is two comparisons and a `visible = false`.
     */
    const body = feel.body;
    const ch = body?.active ? body.charge : null;
    if (ch && ch.fill > 0 && ch.kind !== 'draw') {
      channel({
        x: body.x, y: body.y, z: body.z, yaw: body.yaw,
        fill: Math.max(0, Math.min(1, ch.fill)),
        full: !!ch.ready && ch.fill >= 0.99,
        radius: ch.radius ?? 1,
        element: feel.swing.element === 'physical' ? 'arcane' : (feel.swing.element || 'arcane'),
        dt,
      });
    } else {
      endChannel();
    }

    for (const s of swipes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = Math.max(0, s.life / s.span);
      const u = 1 - k;
      /**
       * THE EDGE TRAVELS. The sector opens from a third of its width to its full width over the
       * first 45% of its life and then fades — so it reads as a blade going through an arc rather
       * than a shape that appeared. A heavier strike opens more slowly, which is the whole of
       * "hammers should smash" in one line of easing.
       */
      const open = Math.min(1, u / (0.3 + (s.weight || 0) * 0.3));
      if (s.plane === 'upright') revealUpright(s, 0.2 + 0.8 * open);
      else s.mesh.scale.set(0.35 + 0.65 * open, 1, 1);
      s.mesh.material.opacity = (u < 0.25 ? u / 0.25 : k / 0.75) * (0.35 + (s.weight || 0) * 0.4);
      if (s.life <= 0) { s.mesh.visible = false; s.mesh.scale.set(1, 1, 1); }
    }
    for (const bx of boxes) {
      if (bx.life <= 0) continue;
      bx.life -= dt;
      bx.mesh.material.opacity = Math.max(0, bx.life / bx.span) * 0.3;
      if (bx.life <= 0) bx.mesh.visible = false;
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = Math.max(0, p.life / p.span);
      p.mesh.material.opacity = k * (p.flat ? 0.5 : 0.8);
      const grow = p.size * (1.4 - k * 0.6);
      if (p.flat) p.mesh.scale.set(grow * (1.6 - k * 0.6), grow * 0.35, grow * (1.6 - k * 0.6));
      else p.mesh.scale.setScalar(grow);
      if (p.life <= 0) { p.mesh.visible = false; p.mesh.scale.setScalar(1); }
    }
    for (const a of arrows) {
      if (!a.live) continue;
      const step = a.speed * dt;
      a.x += a.dx * step;
      a.z += a.dz * step;
      // real gravity on the shaft, so a long shot arcs and a shot uphill still climbs
      a.vy -= 9.4 * dt;
      a.y += a.vy * dt;
      a.travelled += step;
      a.group.position.set(a.x, a.y, a.z);
      // point the shaft along where it is actually going, arc included
      a.group.lookAt(a.x + a.dx * a.speed, a.y + a.vy, a.z + a.dz * a.speed);
      const hitGround = groundAt ? a.y <= groundAt(a.x, a.z) : false;
      if (a.travelled >= a.range || hitGround) {
        a.live = false;
        a.group.visible = false;
        puff(a.x, a.y, a.z, { size: 0.5, life: 0.28 });
        dust(a.x, a.y, a.z, { size: 0.5, life: 0.3 });
        // the shot channel is open for exactly this call — see `shoot` above and actors.strikeArea
        feel.beginShotImpact(a.power ?? 1, a.shotStrike);
        try { onArrowLand?.(a); } finally { feel.endShotImpact(); }
      }
    }
  }

  /** Stop an arrow early (it hit something). */
  function land(arrow) {
    if (!arrow?.live) return;
    arrow.live = false;
    arrow.group.visible = false;
    puff(arrow.x, arrow.y, arrow.z, { size: 0.55, life: 0.26, color: 0xffd9a0 });
  }

  return {
    swipe, shoot, update, land, puff, dust, arrows, swipes,
    /** R17 — the growing effect at the hands while a staff builds. See `channel` above. */
    channel, endChannel,
    /** Hold the world still for a moment — the same hit-stop a heavy blow takes. */
    freeze(ms = 80) { feel.jolt(0, ms / 1000); },
    stats: () => ({
      arrowsLive: arrows.filter(a => a.live).length,
      swipesLive: swipes.filter(s => s.life > 0).length,
      puffsLive: puffs.filter(p => p.life > 0).length,
    }),
    dispose() {
      for (const s of swipes) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
      for (const bx of boxes) { scene.remove(bx.mesh); bx.mesh.geometry.dispose(); bx.mesh.material.dispose(); }
      for (const a of arrows) { scene.remove(a.group); a.group.traverse(o => { if (o.material) o.material.dispose(); }); }
      for (const p of puffs) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
      scene.remove(channelRing); channelRing.geometry.dispose(); channelRing.material.dispose();
      for (const m of shards) { scene.remove(m); m.material.dispose(); }
      shardGeom.dispose();
      arrowGeom.dispose(); headGeom.dispose();
    },
  };
}
