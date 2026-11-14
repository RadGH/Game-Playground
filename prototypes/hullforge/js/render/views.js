// One drawn view per body: its hull mesh (rebuilt when blocks change), its turret models (aimed every frame from
// the sim), engine flames that grow with thrust (with a faint trail while boosting or cruising), a shield bubble
// that ripples where it is hit, small fires + sparks on badly damaged blocks (smoke when nearly gone), and scorch
// marks that plasma leaves on a hull (pooled sprites that ride on the body and fade).
// Bodies are drawn between the last two sim steps (smooth at any refresh rate): see main.js `drawAlpha`.

import * as THREE from 'three';
import { buildHullGeometry, hullMaterial } from './ship-mesh.js';
import { buildTurret, animateTurret, turretFired } from './turrets.js';
import { FACE_BASIS, toLocal } from '../sim/body.js';
import { bus } from './fxbus.js';
import { softGlow } from './sky.js';
import { DIRV, OPP } from '../core/math.js';
import { TURRETS } from '../data/blocks.js';
import { key } from '../sim/grid.js';

const flameGeo = new THREE.ConeGeometry(0.34, 1, 12, 1, true); flameGeo.translate(0, 0.5, 0); flameGeo.rotateX(Math.PI / 2); // wide at the nozzle (z 0), tip at z 1
const nozzleGeo = new THREE.CylinderGeometry(0.36, 0.28, 0.32, 14, 1, true); nozzleGeo.rotateX(Math.PI / 2);
const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });
const flameMats = new Map();
function flameMat(hex) {
  if (!flameMats.has(hex)) flameMats.set(hex, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { c: { value: new THREE.Color(hex) }, t: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float t; varying vec3 vP; void main(){ float k = clamp(vP.z, 0.0, 1.0); float a = (1.0-k)*(0.8+0.2*sin(t*60.0+vP.z*20.0)); gl_FragColor = vec4(mix(vec3(1.0), c, min(1.0, k*1.8))*a*1.35, a); }',
  }));
  return flameMats.get(hex);
}
const shieldGeo = new THREE.SphereGeometry(1, 40, 24);
const shieldBase = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { c: { value: new THREE.Color('#5fc8ff') }, a: { value: 0 }, hit: { value: new THREE.Vector3() }, t: { value: 0 } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
  fragmentShader: `uniform vec3 c; uniform float a; uniform vec3 hit; uniform float t; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0); float d = distance(normalize(vP), normalize(hit));
      float ring = smoothstep(0.35, 0.0, abs(d - t*1.6)) * (1.0 - t); float hex = 0.6 + 0.4*sin(vP.x*14.0)*sin(vP.y*14.0)*sin(vP.z*14.0);
      float k = (f*0.55 + ring*1.4 + smoothstep(0.5,0.0,d)*0.6) * a * hex; gl_FragColor = vec4(c*k, k); }`,
});

/** A block below this share of its health burns; below SMOKE_AT it also trails smoke. */
export const BURN_AT = 0.4, SMOKE_AT = 0.15;
const BURN_MAX = 5;          // burning spots per body (the worst blocks)
const BURN_RATE = 7;         // fire puffs per second per burning block
const TRAIL_W = 0.22;        // engine trail half-width at full thrust (m)

export function createViews(scene) {
  const views = new Map();
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  // scorch marks: a dark smudge + a glowing rim, pooled (materials made once here, never per hit)
  const scorches = [];
  for (let i = 0; i < 24; i++) {
    const dark = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow(), color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
    const hot = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    dark.visible = hot.visible = false;
    scorches.push({ dark, hot, v: null, life: 0, max: 1, col: new THREE.Color() });
  }
  function freeScorch(sc) { sc.dark.removeFromParent(); sc.hot.removeFromParent(); sc.dark.visible = sc.hot.visible = false; sc.v = null; sc.life = 0; }

  function make(b) {
    const group = new THREE.Group(); const inner = new THREE.Group(); group.add(inner);
    const v = { b, group, inner, mesh: null, turrets: new Map(), flames: [], gv: -1, hv: 0, shield: null, shieldA: 0, shieldT: 1, rebuildAt: 0 };
    scene.add(group);
    views.set(b.id, v);
    return v;
  }
  function rebuild(v, now) {
    const b = v.b;
    if (v.mesh) { v.inner.remove(v.mesh); v.mesh.geometry.dispose(); }
    v.mesh = new THREE.Mesh(buildHullGeometry(b.grid, { wreck: b.kind === 'wreck' }), hullMaterial());
    v.inner.add(v.mesh);
    v.gv = b.grid.version; v.rebuildAt = now; b.hpDirty = false;
    // turrets: keep models whose block survives, add new, drop gone
    const want = new Set();
    for (const t of b.turrets || []) {
      want.add(t.key);
      if (v.turrets.has(t.key)) continue;
      const T = buildTurret(t.kind, { tier: t.item.tier, rarity: t.item.rarity, glow: b.faction === 'swarm' ? '#8dff6a' : undefined });
      const B = FACE_BASIS[t.face]; const n = B.u;
      T.root.position.set(t.blk.x + 0.5 + n.x * 0.5, t.blk.y + 0.5 + n.y * 0.5, t.blk.z + 0.5 + n.z * 0.5);
      T.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(B.r.x, B.r.y, B.r.z), new THREE.Vector3(n.x, n.y, n.z), new THREE.Vector3(B.f.x, B.f.y, B.f.z)));
      v.inner.add(T.root); v.turrets.set(t.key, T);
    }
    for (const [k, T] of v.turrets) if (!want.has(k)) { v.inner.remove(T.root); v.turrets.delete(k); }
    // engines
    for (const f of v.flames) { v.inner.remove(f.noz); v.inner.remove(f.flame); }
    v.flames = [];
    if (b.kind === 'ship') for (const blk of b.grid.cells.values()) {
      if (blk.t !== 'thruster') continue;
      const n = DIRV[blk.r];
      const pos = new THREE.Vector3(blk.x + 0.5 + n.x * 0.5, blk.y + 0.5 + n.y * 0.5, blk.z + 0.5 + n.z * 0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n.x, n.y, n.z));
      const noz = new THREE.Mesh(nozzleGeo, nozzleMat); noz.position.copy(pos).addScaledVector(new THREE.Vector3(n.x, n.y, n.z), 0.16); noz.quaternion.copy(q);
      v.flameHex = b.faction === 'swarm' ? '#8dff6a' : b.team === 'hostile' ? '#ff9a5a' : '#69c8ff';
      const flame = new THREE.Mesh(flameGeo, flameMat(v.flameHex));
      flame.position.copy(pos).addScaledVector(new THREE.Vector3(n.x, n.y, n.z), 0.3); flame.quaternion.copy(q);
      v.inner.add(noz); v.inner.add(flame);
      v.flames.push({ noz, flame, push: OPP[blk.r], level: 0, dir: new THREE.Vector3(n.x, n.y, n.z), last: null });
    }
    if (b.kind === 'ship' && b.stats.shield > 0 && !v.shield) {
      v.shield = new THREE.Mesh(shieldGeo, shieldBase.clone()); v.shield.visible = true; v.shield.material.uniforms.a.value = 0;
      v.group.add(v.shield);
    }
    if (v.shield) { const bb = b.grid.bounds; v.shield.scale.set(Math.max(3, b.radius * 0.95), Math.max(2.5, b.radius * 0.7), Math.max(3, b.radius * 1.05)); }
  }

  /** Sync every view with the sim. `pose(b)` returns the drawn position/quaternion (smoothed). */
  function sync(w, now, dt, pose) {
    const seen = new Set();
    for (const b of w.bodies) {
      if (b.dead && b !== w.player) continue;
      if (b.dead) continue;
      seen.add(b.id);
      const v = views.get(b.id) || make(b);
      if (v.gv !== b.grid.version || (b.hpDirty && now - v.rebuildAt > 0.25)) {
        if (!b.grid.bounds || b.grid.boundsV !== b.grid.version) { b.grid.boundsV = -1; }
        rebuild(v, now);
      }
      const p = pose(b);
      v.group.position.set(p.pos.x, p.pos.y, p.pos.z);
      v.group.quaternion.set(p.quat.x, p.quat.y, p.quat.z, p.quat.w);
      v.inner.position.set(-b.pivot.x, -b.pivot.y, -b.pivot.z);
      // turrets
      for (const t of b.turrets || []) { const T = v.turrets.get(t.key); if (T) animateTurret(T, { yaw: t.yaw, pitch: t.pitch, firing: t.firing, beam: t.beam, charge: t.def.fire === 'rail' ? t.charge / Math.max(0.01, t.s.charge) : t.def.fire === 'plasma' ? Math.max(0, 1 - t.cd * t.s.rate) : 0, target: !!t.target }, dt, now); }
      // flames: brightness from how hard each nozzle is pushing
      if (v.flames.length) {
        const th = b.thrustOut || { x: 0, y: 0, z: 0 }; const acc = b.stats.accel;
        const along = [th.x / (acc[0] || 1), -th.x / (acc[1] || 1), th.y / (acc[2] || 1), -th.y / (acc[3] || 1), th.z / (acc[4] || 1), -th.z / (acc[5] || 1)];
        for (const f of v.flames) {
          const want = 0.12 + Math.max(0, Math.min(1.4, along[f.push] || 0)) * (b.cruise ? 1.8 : b.input.boost ? 1.4 : 1);
          f.level += (want - f.level) * Math.min(1, dt * 10);
          f.flame.scale.set(0.8 + f.level * 0.3, 0.8 + f.level * 0.3, 0.4 + f.level * 2.6 * (0.9 + Math.random() * 0.2));
          f.flame.material.uniforms.t.value = now;
          // a faint trail behind each nozzle while boosting or cruising
          const boosting = b.cruise || (b.input?.boost && b.boostE > 0.02);
          if (boosting && f.level > 0.45 && bus.fx) {
            tmpV.copy(f.flame.position).addScaledVector(f.dir, 0.4 + f.level * 0.6).sub(tmpV2.set(b.pivot.x, b.pivot.y, b.pivot.z)).applyQuaternion(v.group.quaternion).add(v.group.position);
            if (f.last && f.last.distanceToSquared(tmpV) < 60 * 60) bus.fx.trail(f.last, tmpV, TRAIL_W * Math.min(1.6, f.level), v.flameHex, b.cruise ? 0.6 : 0.4);
            (f.last || (f.last = new THREE.Vector3())).copy(tmpV);
          } else f.last = null;
        }
      }
      if (b.kind === 'ship' || b.kind === 'wreck') burnDamaged(v, b, now, dt);
      if (v.shield) {
        v.shieldA = Math.max(0, v.shieldA - dt * 1.6); v.shieldT = Math.min(1, v.shieldT + dt * 1.8);
        v.shield.visible = v.shieldA > 0.01;
        v.shield.material.uniforms.a.value = v.shieldA; v.shield.material.uniforms.t.value = v.shieldT;
      }
    }
    for (const [id, v] of views) if (!seen.has(id)) { for (const sc of scorches) if (sc.v === v) freeScorch(sc); scene.remove(v.group); v.mesh?.geometry.dispose(); views.delete(id); }
    // scorch marks fade: the glow cools in about a second, the smudge lingers a few
    for (const sc of scorches) {
      if (!sc.v) continue;
      sc.life -= dt; if (sc.life <= 0) { freeScorch(sc); continue; }
      const f = sc.life / sc.max; const hot = Math.max(0, (f - 0.7) / 0.3);
      sc.hot.material.opacity = hot; sc.hot.material.color.copy(sc.col).multiplyScalar(1 + hot * 2);
      sc.dark.material.opacity = Math.min(0.7, f * 1.4);
    }
  }

  /** Small fires and sparks on blocks below BURN_AT health (the worst few); smoke below SMOKE_AT. */
  function burnDamaged(v, b, now, dt) {
    if (v.hurtV !== b.version && now - (v.hurtAt || 0) > 0.4) {
      v.hurtV = b.version; v.hurtAt = now;
      const list = [];
      for (const blk of b.grid.cells.values()) { const r = blk.hp / (blk.maxHp || 1); if (r < BURN_AT) list.push([r, blk]); }
      list.sort((a, c) => a[0] - c[0]);
      v.hurt = list.slice(0, BURN_MAX);
    }
    if (!v.hurt?.length || !bus.fx) return;
    const q = bus.fx.quality;
    for (const [, blk] of v.hurt) {
      if (Math.random() > dt * BURN_RATE * q) continue;
      const r = blk.hp / (blk.maxHp || 1); if (r <= 0 || b.grid.cells.get(key(blk.x, blk.y, blk.z)) !== blk) continue;
      const hs = (blk.t.endsWith('2') ? 1 : 0.5); tmpV.set(blk.x + hs - b.pivot.x, blk.y + hs - b.pivot.y, blk.z + hs - b.pivot.z).applyQuaternion(v.group.quaternion).add(v.group.position);
      bus.fx.burn(tmpV, 1 - r / BURN_AT, r < SMOKE_AT, b.vel);
    }
  }

  /** Plasma scorched a hull at world point p: a fading mark that rides on the body. */
  function scorch(b, p, hex = '#8dff6a') {
    const v = views.get(b.id); if (!v) return;
    const sc = scorches.find(s => !s.v) || scorches.reduce((a, c) => (c.life < a.life ? c : a));
    if (sc.v) freeScorch(sc);
    // a little out from the hull toward the outside, so the mark is not buried in the blocks
    tmpV.set(p.x, p.y, p.z); tmpV2.copy(tmpV).sub(v.group.position).normalize().multiplyScalar(0.35); tmpV.add(tmpV2);
    v.inner.updateWorldMatrix(true, false); v.inner.worldToLocal(tmpV);
    for (const s of [sc.dark, sc.hot]) { s.position.copy(tmpV); v.inner.add(s); s.visible = true; }
    const size = 1.6 + Math.random() * 0.6; sc.dark.scale.setScalar(size); sc.hot.scale.setScalar(size * 0.8);
    sc.col.set(hex); sc.v = v; sc.life = sc.max = 4 + Math.random() * 1.5;
  }
  /** Find the body a plasma blast at p landed on (a block within ~1.5 m) and scorch it. */
  function scorchAt(bodies, p, hex) {
    for (const b of bodies) {
      if (b.dead || b.kind === 'station' || !views.has(b.id)) continue;
      const dx = b.pos.x - p.x, dy = b.pos.y - p.y, dz = b.pos.z - p.z; const R = (b.radius || 2) + 3; if (dx * dx + dy * dy + dz * dz > R * R) continue;
      const lp = toLocal(b, p); const cx = Math.floor(lp.x), cy = Math.floor(lp.y), cz = Math.floor(lp.z);
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (b.grid.occ.has(key(cx + x, cy + y, cz + z))) { scorch(b, p, hex); return b; }
    }
    return null;
  }

  /** A shield was hit at world point p. */
  function shieldHit(b, p) {
    const v = views.get(b.id); if (!v?.shield) return;
    v.shieldA = 1; v.shieldT = 0;
    tmpV.set(p.x, p.y, p.z); v.group.worldToLocal(tmpV); v.shield.material.uniforms.hit.value.copy(tmpV);
  }
  /** A turret fired: kick its barrels, return the world position of the muzzle it used. */
  function turretShot(b, t) {
    const v = views.get(b.id); const T = v?.turrets.get(t.key); if (!T) return null;
    const i = turretFired(T); const m = T.muzzles[i]; if (!m) return null;
    m.updateWorldMatrix(true, false); const out = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
    out.dir = new THREE.Vector3(0, 0, 1).applyQuaternion(m.getWorldQuaternion(tmpQ)).normalize();   // the barrel's direction
    return out;
  }
  function muzzleOf(b, t) {
    const v = views.get(b.id); const T = v?.turrets.get(t.key); if (!T) return null;
    const m = T.muzzles[0]; m.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
  }
  function clear() { for (const sc of scorches) if (sc.v) freeScorch(sc); for (const v of views.values()) { scene.remove(v.group); v.mesh?.geometry.dispose(); } views.clear(); }
  return { views, sync, shieldHit, turretShot, muzzleOf, scorch, scorchAt, clear };
}

/**
 * A still model of a grid (hull + turrets at rest + nozzles) for previews: the title, the starter picker, the
 * Shipyard's hangar list. Centred on its middle.
 */
export function buildModel(grid, { faction = null, noCorners = false, center = true } = {}) {
  const group = new THREE.Group(); const inner = new THREE.Group(); group.add(inner);
  const hull = new THREE.Mesh(buildHullGeometry(grid, noCorners ? { plan: [] } : {}), hullMaterial()); inner.add(hull); group.userData.hull = hull;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const turrets = [];
  for (const b of grid.cells.values()) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); z0 = Math.min(z0, b.z); x1 = Math.max(x1, b.x + 1); y1 = Math.max(y1, b.y + 1); z1 = Math.max(z1, b.z + 1);
    if (TURRETS[b.t] && b.item) {
      const T = buildTurret(b.t, { tier: b.item.tier, rarity: b.item.rarity, glow: faction === 'swarm' ? '#8dff6a' : undefined });
      const B = FACE_BASIS[b.r]; const n = B.u;
      T.root.position.set(b.x + 0.5 + n.x * 0.5, b.y + 0.5 + n.y * 0.5, b.z + 0.5 + n.z * 0.5);
      T.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(B.r.x, B.r.y, B.r.z), new THREE.Vector3(n.x, n.y, n.z), new THREE.Vector3(B.f.x, B.f.y, B.f.z)));
      inner.add(T.root); turrets.push(T);
    }
    if (b.t === 'thruster') {
      const n = DIRV[b.r];
      const noz = new THREE.Mesh(nozzleGeo, nozzleMat); noz.position.set(b.x + 0.5 + n.x * 0.66, b.y + 0.5 + n.y * 0.66, b.z + 0.5 + n.z * 0.66);
      noz.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n.x, n.y, n.z)); inner.add(noz);
      const flame = new THREE.Mesh(flameGeo, flameMat('#69c8ff')); flame.position.copy(noz.position).addScaledVector(new THREE.Vector3(n.x, n.y, n.z), 0.14); flame.quaternion.copy(noz.quaternion); flame.scale.set(0.85, 0.85, 1.1); inner.add(flame);
    }
  }
  if (x0 === Infinity) { x0 = y0 = z0 = 0; x1 = y1 = z1 = 1; }
  if (center) inner.position.set(-(x0 + x1) / 2, -(y0 + y1) / 2, -(z0 + z1) / 2);
  group.userData.bounds = { x0, y0, z0, x1, y1, z1 };
  group.userData.size = Math.max(x1 - x0, y1 - y0, z1 - z0);
  group.userData.turrets = turrets;
  group.userData.dispose = () => group.traverse(o => { if (o.isMesh && o.geometry && o.geometry !== nozzleGeo && o.geometry !== flameGeo && !o.geometry.parameters) o.geometry.dispose(); });
  return group;
}
