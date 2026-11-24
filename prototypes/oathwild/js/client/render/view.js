// The 3D view: renderer, scene, sky, sun and fog, the camera, resizing, and the graphics quality setting.
// Warm, colourful, readable (PLAN §0 tone). Lights are made once and never toggled (lessons rule 29: no shader
// rebuilds mid-game); quality changes the pixel ratio, the shadow map and the view distance only.
import * as THREE from 'three';

export const QUALITY = {
  low: { pixel: 0.75, shadows: false, far: 220, shadowSize: 0, trees: 0.55, decor: 0.4 },
  medium: { pixel: 1, shadows: true, far: 300, shadowSize: 1024, trees: 0.85, decor: 0.75 },
  high: { pixel: 1.5, shadows: true, far: 380, shadowSize: 2048, trees: 1, decor: 1 },
};

export function createView(canvas, { quality = 'medium' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const fogColour = new THREE.Color('#c9d8e6');
  scene.fog = new THREE.Fog(fogColour, 90, 300);
  scene.background = fogColour.clone();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 900);

  // sky: a big dome with a painted gradient (horizon haze → deep blue), drawn behind everything
  const skyGeo = new THREE.SphereGeometry(800, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#5f93d6') }, mid: { value: new THREE.Color('#a9c8e8') }, low: { value: fogColour } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(low, mid, smoothstep(-0.05, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight('#fff3dc', '#6b5a3a', 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe9c2', 2.1);
  sun.position.set(60, 110, 40);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 10; sc.far = 260;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);

  const view = {
    renderer, scene, camera, sun, hemi, sky, quality: null, size: { w: 1, h: 1 },
    setQuality(q) {
      const Q = QUALITY[q] || QUALITY.medium;
      view.quality = q in QUALITY ? q : 'medium';
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.pixel * (devicePixelRatio > 1 ? 1.4 : 1)));
      renderer.shadowMap.enabled = Q.shadows;
      sun.castShadow = Q.shadows;
      if (Q.shadows) { sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); sun.shadow.map?.dispose(); sun.shadow.map = null; }
      scene.fog.near = Q.far * 0.32; scene.fog.far = Q.far;
      camera.far = Q.far + 60; camera.updateProjectionMatrix();
      view.resize();
    },
    resize() {
      const w = innerWidth, h = innerHeight;
      view.size = { w, h };
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.fov = w < h ? 72 : 62;                    // portrait phones see a little wider
      camera.updateProjectionMatrix();
    },
    /** Keep the sun's shadow box and the sky on the player. */
    follow(x, y, z) {
      sun.position.set(x + 60, y + 110, z + 40);
      sun.target.position.set(x, y, z);
      sky.position.set(x, 0, z);
    },
    render() { renderer.render(scene, camera); },
  };
  addEventListener('resize', () => view.resize());
  view.setQuality(quality);
  return view;
}
