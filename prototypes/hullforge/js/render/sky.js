// The backdrop of a star system: a nebula sphere (shader noise in the system's colours), a few thousand stars, the
// sun (glow sprite + the key light) and a big planet with an atmosphere rim. Everything here follows the camera
// except the planet, which sits far out in the world.

import * as THREE from 'three';
import { rng } from '../core/math.js';

function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,220,160,0.35)') {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, inner); gr.addColorStop(0.18, mid); gr.addColorStop(0.5, 'rgba(255,200,140,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let glowTex = null;
export const softGlow = () => glowTex || (glowTex = glowTexture());

export function buildSky(scene, sys, sun) {
  const r = rng(sys.seed);
  const root = new THREE.Group(); root.name = 'sky';
  const hue = r();
  const cA = new THREE.Color().setHSL(hue, 0.55, 0.16), cB = new THREE.Color().setHSL((hue + 0.12 + r() * 0.2) % 1, 0.6, 0.12), cC = new THREE.Color().setHSL((hue + 0.5) % 1, 0.4, 0.07);
  const neb = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { cA: { value: cA }, cB: { value: cB }, cC: { value: cC }, seed: { value: r() * 100 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 cA, cB, cC; uniform float seed;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))+seed)*43758.5453); }
      float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
      void main(){ vec3 p = vP*2.4; float a = fbm(p + fbm(p*1.7)*1.4); float b = fbm(p*3.1 + 7.0);
        float band = smoothstep(0.55, 0.0, abs(vP.y + (a-0.5)*0.7));
        vec3 col = vec3(0.004,0.006,0.012) + cA*pow(a,2.2)*1.6*band + cB*pow(b,3.0)*1.2*band + cC*a*0.6;
        gl_FragColor = vec4(col, 1.0); }`,
  }));
  root.add(neb);
  // stars
  const N = 5000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    pos.set([s * Math.cos(a) * 8000, z * 8000, s * Math.sin(a) * 8000], i * 3);
    const c = new THREE.Color().setHSL(r() < 0.3 ? 0.6 : r() < 0.5 ? 0.08 : 0.12, r() * 0.5, 0.75 + r() * 0.25);
    col.set([c.r, c.g, c.b], i * 3); size[i] = r() < 0.02 ? 3.2 : 0.8 + r() * 1.4;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3)); sg.setAttribute('size', new THREE.BufferAttribute(size, 1));
  root.add(new THREE.Points(sg, new THREE.ShaderMaterial({
    depthWrite: false, transparent: true, vertexColors: true,
    uniforms: { px: { value: Math.min(2, window.devicePixelRatio || 1) } },
    vertexShader: 'attribute float size; varying vec3 vC; uniform float px; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*px*1.4; gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC*a*1.6, a); }',
  })));
  // sun: glow sprite far away along the light direction
  const sunDir = new THREE.Vector3(r.range(-1, 1), r.range(0.15, 0.6), r.range(-1, 1)).normalize();
  const sunCol = new THREE.Color(sun.color);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow(), color: sunCol.clone().multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sunSprite.position.copy(sunDir).multiplyScalar(7000); sunSprite.scale.setScalar(2600); root.add(sunSprite);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlow(), color: new THREE.Color(4, 4, 4), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  core.position.copy(sunSprite.position); core.scale.setScalar(520); root.add(core);
  scene.add(root);

  // planet (in the world, far out)
  const pl = new THREE.Group();
  const pr = 2600 * sys.planet.size;
  const tex = planetTexture(r, sys.planet.hue);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(pr, 64, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }));
  pl.add(planet);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(pr * 1.04, 64, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { c: { value: new THREE.Color().setHSL(sys.planet.hue, 0.6, 0.6) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(c*f*1.4, f); }',
  }));
  pl.add(atm);
  if (sys.planet.ring) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(pr * 1.35, pr * 2.1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(sys.planet.hue + 0.05, 0.25, 0.5), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = Math.PI / 2 - 0.35; pl.add(ring);
  }
  const pa = r() * Math.PI * 2;
  pl.position.set(Math.cos(pa) * 14000, r.range(-2500, 1500), Math.sin(pa) * 14000);
  planet.rotation.z = 0.3;
  scene.add(pl);
  return { root, planet: pl, sunDir, sunCol, dispose() { scene.remove(root); scene.remove(pl); tex.dispose(); } };
}

function planetTexture(r, hue) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  const base = new THREE.Color().setHSL(hue, 0.35 + r() * 0.3, 0.35);
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 1024, 512);
  const gas = r() < 0.5;
  for (let i = 0; i < (gas ? 60 : 260); i++) {
    const col = new THREE.Color().setHSL((hue + (r() - 0.5) * 0.12 + 1) % 1, 0.3 + r() * 0.4, 0.2 + r() * 0.45);
    g.fillStyle = '#' + col.getHexString(); g.globalAlpha = gas ? 0.35 : 0.25;
    if (gas) { const y = r() * 512; g.fillRect(0, y, 1024, 4 + r() * 30); }
    else { g.beginPath(); g.ellipse(r() * 1024, r() * 512, 10 + r() * 90, 6 + r() * 40, r() * 3, 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
