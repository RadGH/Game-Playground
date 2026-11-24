// The 3D view: renderer, scene, sky, sun and fog, the camera, resizing, and the graphics quality setting.
// Warm, colourful, readable (PLAN §0 tone): a painted sky (gradient, sun and glow, drifting clouds), a warm sun with soft
// shadows that do not crawl, a cool sky fill, fog the colour of the horizon. Lights are made once and never toggled
// (lessons rule 29: no shader rebuilds mid-game); quality changes the pixel ratio, the shadow map and the view distance only.
import * as THREE from 'three';

export const QUALITY = {
  low: { pixel: 0.75, shadows: false, far: 220, shadowSize: 0, shadowBox: 40, soft: false, trees: 0.55, decor: 0.4 },
  medium: { pixel: 1, shadows: true, far: 300, shadowSize: 1024, shadowBox: 42, soft: false, trees: 0.85, decor: 0.75 },
  high: { pixel: 1.5, shadows: true, far: 380, shadowSize: 2048, shadowBox: 58, soft: true, trees: 1, decor: 1 },
};
// a warm late-morning: the sun's direction (towards it), its colour, and the sky's three bands; fog = the horizon band
export const SKY = {
  sun: [0.62, 0.62, 0.48], sunColour: '#ffe0b0', top: '#3f7fd0', mid: '#8fbbe6', horizon: '#d3dde2', glow: '#ffe6c0',
  cloud: '#ffffff', cloudShade: '#c4cfdc', ground: '#d7dccf',
};

export function createView(canvas, { quality = 'medium' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  // PCF for every setting (r186 dropped PCFSoft); High softens it with a wider filter radius (sun.shadow.radius)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const fogColour = new THREE.Color(SKY.horizon);
  scene.fog = new THREE.Fog(fogColour, 90, 300);
  scene.background = fogColour.clone();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 900);
  const sunDir = new THREE.Vector3(...SKY.sun).normalize();

  // sky: a dome painted in the shader — deep blue overhead to a warm haze at the horizon, the sun with a soft glow, and
  // slow drifting clouds (two octaves of value noise projected on a flat cloud layer; thinner towards the horizon)
  const skyGeo = new THREE.SphereGeometry(1, 32, 16);              // scaled to just inside the far plane (setQuality)
  const skyU = {
    top: { value: new THREE.Color(SKY.top) }, mid: { value: new THREE.Color(SKY.mid) }, low: { value: fogColour }, below: { value: new THREE.Color(SKY.ground) },
    glow: { value: new THREE.Color(SKY.glow) }, sunCol: { value: new THREE.Color(SKY.sunColour) }, sunDir: { value: sunDir },
    cloud: { value: new THREE.Color(SKY.cloud) }, cloudShade: { value: new THREE.Color(SKY.cloudShade) }, time: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top, mid, low, below, glow, sunCol, sunDir, cloud, cloudShade; uniform float time; varying vec3 vP;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1, 0)), f.x), mix(hs(i + vec2(0, 1)), hs(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.0, w = 0.55; for (int i = 0; i < 4; i++) { a += vn(p) * w; p = p * 2.03 + 7.7; w *= 0.5; } return a; }
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        vec3 c = h > 0.0 ? mix(low, mid, smoothstep(0.0, 0.22, h)) : mix(low, below, 1.0 - smoothstep(-0.12, 0.0, h));
        c = mix(c, top, smoothstep(0.18, 0.85, h));
        float s = max(dot(d, sunDir), 0.0);
        c = mix(c, glow, pow(s, 6.0) * 0.45 * (1.0 - smoothstep(0.3, 0.9, h)) + pow(s, 24.0) * 0.35);
        if (h > 0.015) {
          vec2 cp = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.006, time * 0.0025);
          float n = fbm(cp);
          float cov = smoothstep(0.52, 0.78, n) * smoothstep(0.015, 0.2, h);
          float lit = 0.75 + 0.25 * smoothstep(0.5, 0.9, fbm(cp + sunDir.xz * 0.08));
          vec3 cc = mix(cloudShade, cloud, lit) + glow * pow(s, 8.0) * 0.3;
          c = mix(c, cc, cov * 0.85);
        }
        c += sunCol * (smoothstep(0.9985, 0.9993, s) * 1.6 + pow(s, 600.0) * 0.6);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // light: a cool sky fill from above with warm bounce from the ground, and a warm, strong sun for shape and shadow
  const hemi = new THREE.HemisphereLight('#c9dcf2', '#7a6a44', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(SKY.sunColour, 2.7);
  sun.castShadow = true;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target);
  let shadowBox = 42, clock = 0;
  const ORIGIN = new THREE.Vector3(), snap = new THREE.Vector3(), lightSpace = new THREE.Matrix4(), inv = new THREE.Matrix4();

  const view = {
    renderer, scene, camera, sun, hemi, sky, sunDir, quality: null, size: { w: 1, h: 1 },
    setQuality(q) {
      const Q = QUALITY[q] || QUALITY.medium;
      view.quality = q in QUALITY ? q : 'medium';
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.pixel * (devicePixelRatio > 1 ? 1.4 : 1)));
      renderer.shadowMap.enabled = Q.shadows;
      sun.castShadow = Q.shadows;
      if (Q.shadows) { sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); sun.shadow.map?.dispose(); sun.shadow.map = null; }
      shadowBox = Q.shadowBox;
      const sc = sun.shadow.camera;
      sc.left = -shadowBox; sc.right = shadowBox; sc.top = shadowBox; sc.bottom = -shadowBox; sc.near = 10; sc.far = 320; sc.updateProjectionMatrix();
      sun.shadow.radius = Q.soft ? 3 : 1;
      scene.fog.near = Q.far * 0.3; scene.fog.far = Q.far;
      camera.far = Q.far + 60; camera.updateProjectionMatrix();
      sky.scale.setScalar(camera.far * 0.9);
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
      // the shadow box moves in whole shadow-map texels (seen from the sun), so shadow edges do not crawl as you walk
      const texel = (shadowBox * 2) / Math.max(256, sun.shadow.mapSize.x);
      lightSpace.lookAt(sunDir, ORIGIN, THREE.Object3D.DEFAULT_UP); inv.copy(lightSpace).invert();
      snap.set(x, y, z).applyMatrix4(inv);
      snap.x = Math.round(snap.x / texel) * texel; snap.y = Math.round(snap.y / texel) * texel;
      snap.applyMatrix4(lightSpace);
      sun.target.position.copy(snap);
      sun.position.copy(snap).addScaledVector(sunDir, 150);
      sky.position.set(x, 0, z);
    },
    render() { clock += 1 / 60; skyU.time.value = clock; renderer.render(scene, camera); },
  };
  addEventListener('resize', () => view.resize());
  view.setQuality(quality);
  return view;
}
