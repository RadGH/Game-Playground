// Farhold — what a fight looks like.
//
// Two things, both pooled so a fight never allocates:
//
//   swipe()  a white arc on the ground in front of you, drawn at exactly the reach and angle the
//            damage test uses. It is not decoration — it is the hit box, made visible.
//   shoot()  an arrow that leaves the bow, flies, and bursts where it lands.
//
//   const fx = createCombatFx(scene);
//   fx.swipe({ x, y, z, yaw, reach, arc });
//   const arrow = fx.shoot({ x, y, z, dirX, dirZ, range });
//   fx.update(dt);     // every frame; arrows report their hits through onArrowLand

import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export function createCombatFx(scene, { onArrowLand = null } = {}) {
  // ---------------------------------------------------------------- swipe arcs
  // A ring sector lying flat on the ground. Its inner/outer radius and angle are set from the same
  // numbers the damage test uses, so what you see is what you hit.
  const SWIPES = 4;
  const swipes = [];
  for (let i = 0; i < SWIPES; i++) {
    const geom = new THREE.RingGeometry(0.4, 1, 24, 1, 0, 1);
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.name = 'farhold-swipe';
    scene.add(mesh);
    swipes.push({ mesh, life: 0, span: 0 });
  }
  let nextSwipe = 0;

  /**
   * Show the area a swing covers. `arc` is the full angle in radians and `reach` the outer radius —
   * pass the same values the hit test uses.
   */
  function swipe({ x, y, z, yaw, reach = 2.9, arc = 1.5, color = 0xffffff, life = 0.22 }) {
    const s = swipes[nextSwipe = (nextSwipe + 1) % SWIPES];
    s.mesh.geometry.dispose();
    // the sector is built facing +Z at yaw 0, so it starts half an arc to one side
    const geom = new THREE.RingGeometry(Math.max(0.15, reach * 0.22), reach, 28, 1, -arc / 2, arc);
    geom.rotateX(-Math.PI / 2);
    s.mesh.geometry = geom;
    // RingGeometry's theta starts on +X and the player faces +Z. After rotateX(-90) the sector still
    // opens along +X, so it needs turning by MINUS a quarter: R_y(yaw - pi/2) maps +X to
    // (sin yaw, 0, cos yaw), which is exactly `forward`. Using +pi/2 drew the arc out of the
    // player's back, which is what it was doing.
    s.mesh.rotation.set(0, yaw - Math.PI / 2, 0);
    s.mesh.position.set(x, y + 0.12, z);
    s.mesh.material.color.setHex(color);
    s.mesh.visible = true;
    s.life = life;
    s.span = life;
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
    arrows.push({ group, live: false, x: 0, y: 0, z: 0, dx: 0, dz: 0, speed: 0, travelled: 0, range: 0, payload: null });
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
  function puff(x, y, z, { size = 0.6, life = 0.3, color = 0xffffff } = {}) {
    const p = puffs[nextPuff = (nextPuff + 1) % PUFFS];
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.setHex(color);
    p.mesh.visible = true;
    p.life = life; p.span = life; p.size = size;
    return p;
  }

  /** Loose an arrow. `payload` comes back to onArrowLand when it lands. */
  function shoot({ x, y, z, dirX, dirZ, range = 40, speed = 42, payload = null }) {
    const a = arrows.find(a => !a.live);
    if (!a) return null;
    const len = Math.hypot(dirX, dirZ) || 1;
    a.live = true;
    a.x = x; a.y = y; a.z = z;
    a.dx = dirX / len; a.dz = dirZ / len;
    a.speed = speed; a.travelled = 0; a.range = range; a.payload = payload;
    a.group.visible = true;
    a.group.position.set(x, y, z);
    a.group.rotation.set(0, Math.atan2(a.dx, a.dz), 0);
    // the release: a bright flash at the bow
    puff(x + a.dx * 0.6, y, z + a.dz * 0.6, { size: 0.35, life: 0.13, color: 0xfff0c0 });
    return a;
  }

  function update(dt) {
    for (const s of swipes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = Math.max(0, s.life / s.span);
      s.mesh.material.opacity = k * 0.55;
      s.mesh.scale.setScalar(1 + (1 - k) * 0.12);
      if (s.life <= 0) { s.mesh.visible = false; s.mesh.scale.setScalar(1); }
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const k = Math.max(0, p.life / p.span);
      p.mesh.material.opacity = k * 0.8;
      p.mesh.scale.setScalar(p.size * (1.4 - k * 0.6));
      if (p.life <= 0) p.mesh.visible = false;
    }
    for (const a of arrows) {
      if (!a.live) continue;
      const step = a.speed * dt;
      a.x += a.dx * step; a.z += a.dz * step; a.travelled += step;
      // a gentle drop, so a long shot arcs
      a.y -= (a.travelled / a.range) * dt * 5.5;
      a.group.position.set(a.x, a.y, a.z);
      if (a.travelled >= a.range) {
        a.live = false;
        a.group.visible = false;
        puff(a.x, a.y, a.z, { size: 0.5, life: 0.28 });
        onArrowLand?.(a);
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
    swipe, shoot, update, land, puff, arrows, swipes,
    stats: () => ({ arrowsLive: arrows.filter(a => a.live).length, swipesLive: swipes.filter(s => s.life > 0).length }),
    dispose() {
      for (const s of swipes) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
      for (const a of arrows) { scene.remove(a.group); a.group.traverse(o => { if (o.material) o.material.dispose(); }); }
      for (const p of puffs) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
      arrowGeom.dispose(); headGeom.dispose();
    },
  };
}
