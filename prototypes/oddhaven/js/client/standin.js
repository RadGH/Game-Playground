// The shared low-poly body (PLAN §2, roast risk 3): one instanced mesh, one draw call, for every stand-in. A plain capsule
// tinted by one colour read as a skittle in god view, so this is chibi-shaped, like the real bodies, with its own shirt,
// trousers, skin and hair colour per person, and legs and arms that swing in the vertex shader while they walk.
//
//   const s = createStandIns({ THREE, cap });  group.add(s.mesh);
//   s.set(i, { x, y, z, yaw, scale, walking }, colours);  s.commit(n, seconds);
const SHIRT = 0, SKIN = 1, HAIR = 2, LEGS = 3, DARK = 4;

export function createStandIns({ THREE, cap }) {
  const { CylinderGeometry: Cyl, SphereGeometry: Sph, BoxGeometry: Box } = THREE;
  const parts = [];
  const add = (g, x, y, z, slot, swing = 0, sx = 1, sy = 1, sz = 1) => { g.scale(sx, sy, sz); g.translate(x, y, z); parts.push([g, slot, swing]); };
  // torso, arms, legs, shoes
  add(new Cyl(0.17, 0.25, 0.46, 9), 0, 0.53, 0, SHIRT);
  add(new Sph(0.19, 8, 5), 0, 0.72, 0, SHIRT, 0, 1.05, 0.55, 0.9);
  for (const s of [-1, 1]) {
    add(new Cyl(0.07, 0.06, 0.42, 6).rotateZ(s * 0.2), s * 0.26, 0.54, 0, SHIRT, -s * 0.8);
    add(new Sph(0.065, 6, 4), s * 0.3, 0.32, 0, SKIN, -s * 0.8);
    add(new Cyl(0.085, 0.08, 0.3, 6), s * 0.1, 0.17, 0, LEGS, s);
    add(new Box(0.15, 0.08, 0.26), s * 0.1, 0.04, 0.03, DARK, s);
  }
  // the big head, a hair cap that comes down the back, two eyes
  add(new Sph(0.34, 12, 9), 0, 1.06, 0, SKIN);
  add(new Sph(0.36, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.56), 0, 1.09, -0.035, HAIR);
  for (const s of [-1, 1]) add(new Sph(0.045, 6, 4), s * 0.125, 1.04, 0.31, DARK, 0, 1, 1.3, 0.6);
  const pos = [], nor = [], slot = [], leg = [];
  for (const [g0, sl, sw] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); slot.push(sl); leg.push(sw); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aSlot', new THREE.Float32BufferAttribute(slot, 1)); geo.setAttribute('aLeg', new THREE.Float32BufferAttribute(leg, 1));
  const attr = n => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const iShirt = attr(3), iSkin = attr(3), iHair = attr(3), iLegs = attr(3), iWalk = attr(2);
  geo.setAttribute('iShirt', iShirt); geo.setAttribute('iSkin', iSkin); geo.setAttribute('iHair', iHair); geo.setAttribute('iLegs', iLegs); geo.setAttribute('iWalk', iWalk);
  const uTime = { value: 0 };
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  mat.onBeforeCompile = s => {
    s.uniforms.uTime = uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aSlot; attribute float aLeg; attribute vec3 iShirt; attribute vec3 iSkin; attribute vec3 iHair; attribute vec3 iLegs; attribute vec2 iWalk;
        uniform float uTime; varying vec3 vTint;`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        float sw = sin(uTime * iWalk.y + instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 2.3) * iWalk.x;
        transformed.z += aLeg * sw * 0.16 * (1.0 - min(position.y / 0.8, 1.0) * 0.5);
        vTint = aSlot < 0.5 ? iShirt : aSlot < 1.5 ? iSkin : aSlot < 2.5 ? iHair : aSlot < 3.5 ? iLegs : vec3(0.11, 0.1, 0.1);`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vTint;');
  };
  mat.customProgramCacheKey = () => 'oddhaven-standin';
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false; mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.name = 'stand-ins';
  const lying = new THREE.Euler(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  const put = (a, i, hex) => { c.set(hex); a.setXYZ(i, c.r, c.g, c.b); };
  return {
    mesh, tris: pos.length / 9,
    set(i, w, col, base = 1) {
      if (w.lie) q.setFromEuler(lying.set(-Math.PI / 2, w.yaw + Math.PI, 0, 'YXZ')); else q.setFromAxisAngle(Y, w.yaw);
      m4.compose(p.set(w.x, w.y, w.z), q, sc.setScalar(col.scale * base));
      mesh.setMatrixAt(i, m4);
      put(iShirt, i, col.shirt); put(iSkin, i, col.skin); put(iHair, i, col.hair); put(iLegs, i, col.legs);
      iWalk.setXY(i, w.walking ? 1 : 0, 9 + (i % 5));
    },
    commit(n, t) {
      mesh.count = n; mesh.visible = n > 0; uTime.value = t;
      mesh.instanceMatrix.needsUpdate = true;
      for (const a of [iShirt, iSkin, iHair, iLegs, iWalk]) a.needsUpdate = true;
    },
  };
}
