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

export function createCombatFx(scene, { onArrowLand = null, groundAt = null } = {}) {
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
    const geom = new THREE.RingGeometry(inner, reach, plane === 'lance' ? 6 : 30, 1, -span / 2, span);
    if (plane === 'flat') {
      // the sector opens along +X after the -90 rotate; R_y(yaw - pi/2) maps +X to `forward`
      geom.rotateX(-Math.PI / 2);
      s.mesh.rotation.set(0, yaw - Math.PI / 2, 0);
      s.mesh.position.set(x, y + 1.0, z);
    } else if (plane === 'upright') {
      // a chop: the ring stays in its own XY plane and is turned so +X points the way you face,
      // which puts the sweep in the vertical plane the weapon really comes down in
      geom.rotateZ(Math.PI / 2 - span * 0.1);
      s.mesh.rotation.set(0, yaw, 0);
      s.mesh.position.set(x, y + 1.15, z);
    } else {
      geom.rotateX(-Math.PI / 2);
      s.mesh.rotation.set(0, yaw - Math.PI / 2, 0);
      s.mesh.position.set(x, y + 1.05, z);
    }
    s.mesh.geometry = geom;
    s.mesh.material.color.setHex(hex);
    s.mesh.visible = true;
    s.mesh.scale.set(0.35, 1, 1);
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

  function update(dt) {
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
      s.mesh.scale.set(0.35 + 0.65 * open, 1, 1);
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
      arrowGeom.dispose(); headGeom.dispose();
    },
  };
}
