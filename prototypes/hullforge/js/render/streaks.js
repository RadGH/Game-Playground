// Streaks: thick glowing lines in 3D, all drawn in ONE mesh with ONE material (no new shaders mid-fight).
// Each streak is a flat ribbon from point A to point B that always turns its face to the camera, with a soft edge
// (the `sharp` value: low = soft wide glow, high = crisp core). Beams (glow + core + helix strands), bullet tracers,
// railgun lines, muzzle cones, spark streaks and engine trails all go through here; the list is rebuilt every frame.
//
// Width is in metres, but never thinner than `minPx` pixels on screen, so a far tracer is still a visible line.

import * as THREE from 'three';

export function createStreaks(scene, max = 14000) {
  const geo = new THREE.BufferGeometry();
  const A = new Float32Array(max * 4 * 3), B = new Float32Array(max * 4 * 3), M = new Float32Array(max * 4 * 3), Cc = new Float32Array(max * 4 * 4);
  const idx = new Uint32Array(max * 6);
  for (let i = 0; i < max; i++) { const v = i * 4, o = i * 6; idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v + 2; idx[o + 4] = v + 1; idx[o + 5] = v + 3; }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  // `position` is end A (three needs a position attribute); `bEnd` is the other end; `misc` = side (−1/1), width, sharp
  const aPos = new THREE.BufferAttribute(A, 3).setUsage(THREE.DynamicDrawUsage);
  const aB = new THREE.BufferAttribute(B, 3).setUsage(THREE.DynamicDrawUsage);
  const aM = new THREE.BufferAttribute(M, 3).setUsage(THREE.DynamicDrawUsage);
  const aC = new THREE.BufferAttribute(Cc, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('bEnd', aB); geo.setAttribute('misc', aM); geo.setAttribute('scol', aC);
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { pxk: { value: 0.002 }, minPx: { value: 1.4 } },
    vertexShader: `attribute vec3 bEnd; attribute vec3 misc; attribute vec4 scol; uniform float pxk; uniform float minPx;
      varying vec4 vC; varying float vS; varying float vSharp;
      void main(){
        vec4 pa = modelViewMatrix * vec4(position, 1.0); vec4 pb = modelViewMatrix * vec4(bEnd, 1.0);
        vec3 d = pb.xyz - pa.xyz; float L = length(d); d = L > 1e-5 ? d / L : vec3(0.0, 1.0, 0.0);
        vec3 toCam = normalize(-pa.xyz);
        vec3 side = cross(d, toCam); float sl = length(side); side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
        float depth = max(0.05, -pa.z);
        float wMin = minPx * pxk * depth;           // never thinner than minPx pixels
        float w = max(misc.y, wMin);
        vC = scol; vC.a *= min(1.0, misc.y / wMin + 0.25);   // a line drawn wider than it is gets fainter, so far things don't bloat
        vS = misc.x; vSharp = misc.z;
        gl_Position = projectionMatrix * vec4(pa.xyz + side * misc.x * w, 1.0);
      }`,
    fragmentShader: `varying vec4 vC; varying float vS; varying float vSharp;
      void main(){ float e = 1.0 - abs(vS); float a = pow(clamp(e, 0.0, 1.0), vSharp); gl_FragColor = vec4(vC.rgb * a * vC.a, 1.0); }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5;
  scene.add(mesh);
  let n = 0;

  /** Start a new frame's list. */
  function begin(camera, height) {
    n = 0;
    if (camera) mat.uniforms.pxk.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, height);
  }
  /**
   * One streak from (ax,ay,az) to (bx,by,bz): half-width w (metres), colour r,g,b (can go above 1 for bloom),
   * alpha at A and at B (a tail that fades), sharp (0.5 soft … 3 crisp).
   */
  function add(ax, ay, az, bx, by, bz, w, r, g, b, aA = 1, aB = aA, sharp = 1) {
    if (n >= max) return false;
    const v = n * 4;
    for (let k = 0; k < 4; k++) {
      const atB = k >= 2; const i3 = (v + k) * 3, i4 = (v + k) * 4;
      // corners 0,1 sit at A, 2,3 at B; the vertex's own end goes in `position`, the other in `bEnd`
      if (!atB) { A[i3] = ax; A[i3 + 1] = ay; A[i3 + 2] = az; B[i3] = bx; B[i3 + 1] = by; B[i3 + 2] = bz; }
      else { A[i3] = bx; A[i3 + 1] = by; A[i3 + 2] = bz; B[i3] = ax; B[i3 + 1] = ay; B[i3 + 2] = az; }
      // the side flips for the B end because its "other end" points the other way
      const s = (k % 2 === 0 ? -1 : 1) * (atB ? -1 : 1);
      M[i3] = s; M[i3 + 1] = w; M[i3 + 2] = sharp;
      Cc[i4] = r; Cc[i4 + 1] = g; Cc[i4 + 2] = b; Cc[i4 + 3] = atB ? aB : aA;
    }
    n++; return true;
  }
  /** Same, from two {x,y,z} points and a THREE.Color-like {r,g,b}. */
  const line = (a, b, w, c, aA = 1, aB = aA, sharp = 1, boost = 1) => add(a.x, a.y, a.z, b.x, b.y, b.z, w, c.r * boost, c.g * boost, c.b * boost, aA, aB, sharp);
  /** Upload the frame's list. */
  function end() {
    geo.setDrawRange(0, n * 6);
    for (const at of [aPos, aB, aM]) { at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n * 12)); at.needsUpdate = true; }
    aC.clearUpdateRanges(); aC.addUpdateRange(0, Math.max(1, n * 16)); aC.needsUpdate = true;
  }
  return { begin, add, line, end, mesh, get count() { return n; }, max };
}
