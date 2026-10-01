// Chibi 3 lighting stage: what the comparison page and the dev page render characters in.
//
// Physically based materials only look right with something to reflect. Plate armour with no
// environment is black; skin with no fill reads as clay. So the stage builds:
//   - an ENVIRONMENT MAP from a small procedural studio (a graded sky dome, a big soft key panel,
//     a cool rim panel and a warm bounce off the floor), pre-filtered with PMREM so rough metal gets
//     blurry reflections and polished metal sharp ones;
//   - a key light with soft shadows, a cool rim light from behind, a low fill;
//   - a ground disc that takes shadows, and ACES tone mapping.
// Presets ('studio', 'dusk', 'torch') swap the colours.

import * as THREE from 'three';

const PRESETS = {
  studio: { sky: [0x9aa6b8, 0x2a2e36], key: 0xfff1e2, keyI: 3.0, rim: 0x9cc4ff, rimI: 2.4, fill: 0xa0b0c8, fillI: 1.1, env: 1.25, bg: 0x30343c, floor: 0x4a4e56, exposure: 1.0 },
  dusk: { sky: [0xd89a6a, 0x232a44], key: 0xffb27a, keyI: 3.0, rim: 0x6a8cff, rimI: 2.8, fill: 0x405078, fillI: 0.5, env: 0.9, bg: 0x2a2436, floor: 0x3a3440, exposure: 1.05 },
  torch: { sky: [0x4a3a30, 0x0e0c10], key: 0xff9a50, keyI: 3.6, rim: 0x5a78c8, rimI: 1.6, fill: 0x302830, fillI: 0.3, env: 0.55, bg: 0x141016, floor: 0x262022, exposure: 1.1 },
};

function studioEnvironment(renderer, P) {
  const scene = new THREE.Scene();
  // graded dome: the inside of a sphere coloured by height
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(P.sky[0]) }, bottom: { value: new THREE.Color(P.sky[1]) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(bottom, top, smoothstep(-0.25, 0.65, h)); c += vec3(0.12,0.1,0.08) * exp(-pow((h + 0.05) * 7.0, 2.0)); gl_FragColor = vec4(c, 1.0); }',
  }));
  scene.add(dome);
  // softboxes: emissive panels that give metal something to show
  const panel = (w, h, color, k, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 1, 0); scene.add(m); };
  panel(5, 3.5, P.key, 3.2, [4, 5, 5]);
  panel(3, 6, P.rim, 2.2, [-5, 3, -4]);
  panel(6, 2, P.fill, 1.4, [-5, 2, 4]);
  panel(8, 8, 0x605048, 0.6, [0, -3, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(scene, 0.02).texture;
  pm.dispose(); scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  return env;
}

/** Light a scene for characters. Returns { set(preset), dispose(), key, rim, fill, floor }. */
export function createStage(renderer, scene, { preset = 'studio', floorRadius = 4, shadowSize = 3 } = {}) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(2.4, 3.1, 3.8);   // low enough to reach under a brim key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.015; key.shadow.radius = 4;
  Object.assign(key.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 0.5, far: 14 }); key.shadow.camera.updateProjectionMatrix();
  const rim = new THREE.DirectionalLight(0xffffff, 2); rim.position.set(-2.5, 3, -3.5);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-3, 1.5, 2.5);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(floorRadius, 72), new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'stage-floor';
  scene.add(key, rim, fill, floor);
  let env = null;
  function set(name) {
    const P = PRESETS[name] || PRESETS.studio;
    key.color.set(P.key); key.intensity = P.keyI; rim.color.set(P.rim); rim.intensity = P.rimI; fill.color.set(P.fill); fill.intensity = P.fillI;
    floor.material.color.set(P.floor);
    if (env) env.dispose();
    env = studioEnvironment(renderer, P);
    scene.environment = env; scene.environmentIntensity = P.env;
    scene.background = new THREE.Color(P.bg);
    scene.fog = new THREE.Fog(P.bg, 9, 26);
    renderer.toneMappingExposure = P.exposure;
  }
  set(preset);
  return { set, key, rim, fill, floor, presets: Object.keys(PRESETS), dispose() { env?.dispose(); floor.geometry.dispose(); floor.material.dispose(); scene.remove(key, rim, fill, floor); } };
}
