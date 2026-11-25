// Pixel Splats demo page (see sample.js for the idea and README.md for what each mode shows).
// Four ways to draw the same knight, all lit by the SAME lighting function (so only the method differs):
//   live    square splats carrying material data, lit every frame, each snapped to one cell of a fixed pixel grid
//   baked   the same splats with their light worked out once and frozen (the light turns WITH the model)
//   filter  the ordinary mesh drawn small and blown up with hard pixels (the usual "pixel filter")
//   smooth  the ordinary mesh at full size, for reference
import * as THREE from 'three';
import { createFalCharacter } from '../../fal/js/fal.js';
import { bakeModel, sampleSplats } from './sample.js';

// [id, name, what it holds] — the fal models in their combat stance with their fitted weapons (avatar-3d/fal catalog)
const MODELS = [
  ['silver-knight', 'Silver knight', { weapon: 'silver-longsword', offhand: 'kite-shield' }], ['wraith-knight', 'Wraith knight', { weapon: 'wraith-greatsword' }],
  ['lantern-guard', 'Lantern guard', { weapon: 'guard-spear' }], ['bandit-chief', 'Bandit chief', { weapon: 'officer-sabre' }], ['skeleton-warrior', 'Skeleton warrior', { weapon: 'sword', offhand: 'shield' }],
];
const MODES = [
  ['live', 'Live-lit splats', 'Material in every splat, lit every frame, snapped to the pixel grid. Highlights slide over the metal as it turns.'],
  ['baked', 'Baked splats', 'The same splats with the light painted in once. The shine turns with the knight instead of staying with the lamp.'],
  ['filter', 'Pixel filter', 'The normal model drawn small, then blown up with hard pixels. Edges crawl and shimmer as it turns.'],
  ['smooth', 'Smooth model', 'The normal model at full size, for comparison.'],
];
const q = new URLSearchParams(location.search);
// random sampling needs ~4× the original's 60,000 for the same cover (its training puts splats where cells are empty):
// smaller pixels, more cells, more splats
const autoCount = pix => (pix >= 9 ? 120000 : pix >= 6 ? 240000 : 400000);
const S = {
  model: MODELS.some(m => m[0] === q.get('model')) ? q.get('model') : 'silver-knight',
  mode: MODES.some(m => m[0] === q.get('mode')) ? q.get('mode') : 'live',
  pix: Number(q.get('pix')) || 6, countPick: Number(q.get('count')) || 0,   // 0 = automatic by pixel size
  spin: q.get('spin') !== '0', orbit: q.get('orbit') !== '0', poster: q.get('poster') === '1', yaw: Number(q.get('yaw')) || 0.5, light: Number(q.get('light')) || 0.8,
};

// ---------------------------------------------------------------- the one lighting function (GLSL)
const SHADE = /* glsl */`
  uniform vec3 uL; uniform vec3 uLightCol; uniform vec3 uSky; uniform vec3 uGround; uniform float uPoster;
  vec3 shade(vec3 albedo, vec3 N, vec3 V, float metal, float rough, vec3 L) {
    float ndl = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V); float ndh = max(dot(N, H), 0.0), vdh = max(dot(V, H), 0.0);
    float a = max(rough * rough, 0.02), a2 = a * a, d = ndh * ndh * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159 * d * d);
    vec3 F0 = mix(vec3(0.04), albedo, metal), F = F0 + (1.0 - F0) * pow(1.0 - vdh, 5.0);
    vec3 diffuse = albedo * (1.0 - metal);
    vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
    vec3 R = reflect(-V, N); vec3 env = mix(uGround, uSky, smoothstep(-0.3, 0.6, R.y)) * F0 * (1.0 - rough * 0.6);
    return (diffuse + D * F * 0.25) * uLightCol * ndl + diffuse * hemi * 0.55 + env * 0.9;
  }
  vec3 toScreen(vec3 c) {
    c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);        // filmic
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
    // a small palette, like hand-made pixel art: brightness in 6 steps, hue kept (per-channel steps made magenta speckle)
    if (uPoster > 0.5) { float l = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-3); c *= (floor(l * 6.0 + 0.5) / 6.0 + 0.04) / l; c = clamp(c, 0.0, 1.0); }
    return c;
  }
  vec3 materialOf(vec3 s) {                                                // sample.js materialFromColour, the same rule
    float mx = max(s.r, max(s.g, s.b)), mn = min(s.r, min(s.g, s.b)), sat = mx > 0.0 ? (mx - mn) / mx : 0.0, lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
    float h = 0.0;
    if (mx > mn) { if (mx == s.r) h = mod((s.g - s.b) / (mx - mn), 6.0); else if (mx == s.g) h = (s.b - s.r) / (mx - mn) + 2.0; else h = (s.r - s.g) / (mx - mn) + 4.0; h *= 60.0; if (h < 0.0) h += 360.0; }
    if (h >= 30.0 && h <= 58.0 && sat > 0.35 && lum > 0.3) return vec3(1.0, 0.3, 0.0);
    if (sat < 0.17 && lum > 0.42) return vec3(0.92, 0.22 + (1.0 - lum) * 0.25, 0.0);
    if (sat < 0.17 && lum > 0.18) return vec3(0.6, 0.45, 0.0);
    return vec3(0.0, 0.78, 0.0);
  }`;

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
const scene = new THREE.Scene();   // no background: the page shows through, the same in every mode (the low-res pass kept it linear-dark)
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
camera.position.set(0, 1.05, 3.9); camera.lookAt(0, 0.9, 0);
const holder = new THREE.Group(); scene.add(holder);
const common = {
  uL: { value: new THREE.Vector3() }, uLightCol: { value: new THREE.Color(3.2, 3.0, 2.7) }, uSky: { value: new THREE.Color(0.32, 0.36, 0.5) }, uGround: { value: new THREE.Color(0.12, 0.1, 0.09) },
  uPoster: { value: 0 },
};
// a soft floor shadow so it stands somewhere
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.7, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35 }));
scene.add(floor);

// ---------------------------------------------------------------- materials
const splatMat = new THREE.ShaderMaterial({
  uniforms: { ...common, uPix: { value: 6 }, uRes: { value: new THREE.Vector2(1, 1) }, uBaked: { value: 0 }, uBakeL: { value: new THREE.Vector3() }, uBakeV: { value: new THREE.Vector3(0, 0, 1) } },
  vertexShader: /* glsl */`
    attribute vec3 aAlb; attribute vec2 aMat;
    uniform float uPix; uniform vec2 uRes; uniform float uBaked; uniform vec3 uBakeL, uBakeV;
    varying vec3 vCol;
    ${SHADE}
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec3 N = normalize(mat3(modelMatrix) * normal), V = normalize(cameraPosition - wp.xyz);
      if (dot(N, V) < -0.08) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }        // a splat facing away is not drawn
      // live: world light and the real eye; baked: the light as it was, fixed to the model (it turns with it)
      vec3 lit = uBaked > 0.5 ? shade(aAlb, normalize(normal), uBakeV, aMat.x, aMat.y, uBakeL) : shade(aAlb, N, V, aMat.x, aMat.y, uL);
      vCol = toScreen(lit);
      vec4 clip = projectionMatrix * viewMatrix * wp;
      // the pixel grid: the splat's centre moves to the middle of its cell, and it fills exactly that cell
      vec2 grid = uRes / uPix, ndc = clip.xy / clip.w;
      ndc = (floor((ndc * 0.5 + 0.5) * grid) + 0.5) / grid * 2.0 - 1.0;
      gl_Position = vec4(ndc * clip.w, clip.z, clip.w);
      gl_PointSize = uPix;
    }`,
  fragmentShader: 'varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }',
});
const meshMat = new THREE.ShaderMaterial({
  uniforms: { ...common, map: { value: null } },   // cloned per texture (body, sword, shield)
  vertexShader: 'varying vec3 vN; varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: /* glsl */`
    uniform sampler2D map; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
    ${SHADE}
    void main(){
      vec3 s = texture2D(map, vUv).rgb;                       // sRGB picture
      vec3 m = materialOf(s);
      vec3 alb = pow(s, vec3(2.2));
      gl_FragColor = vec4(toScreen(shade(alb, normalize(vN), normalize(cameraPosition - vW), m.x, m.y, uL)), 1.0);
    }`,
});

// low-res target + hard upscale for the "pixel filter" mode
const lowRT = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const blit = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { t: { value: lowRT.texture } }, vertexShader: 'varying vec2 u; void main(){ u = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D t; varying vec2 u; void main(){ gl_FragColor = texture2D(t, u); }', depthTest: false }));
const blitScene = new THREE.Scene(); blitScene.add(blit); const blitCam = new THREE.Camera();

// ---------------------------------------------------------------- loading a model
let baked = null, points = null, mesh = null, pixels = null;
const status = document.getElementById('status');
let loading = 0;
async function loadModel(id) {
  const my = ++loading;
  status.textContent = 'Loading…';
  const def = MODELS.find(m => m[0] === id);
  // the fal runtime builds the body on the shared skeleton; hold its weapons, take up the combat stance, then freeze
  const ch = await createFalCharacter(id);
  for (const [slot, item] of Object.entries(def?.[2] || {})) { try { await ch.equip(slot, item); } catch (e) { console.warn('equip', item, e.message); } }
  ch.play('ready', 0); for (let i = 0; i < 12; i++) ch.update(1 / 30);
  if (my !== loading) return;
  baked = bakeModel(ch.group, THREE);
  pixels = []; const mats = [];
  for (const img of baked.images) {
    if (!img) { pixels.push(null); mats.push(meshMat.clone()); continue; }
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    pixels.push(g.getImageData(0, 0, c.width, c.height));
    const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true;
    const m = meshMat.clone(); m.uniforms = { ...common, map: { value: tex } }; mats.push(m);
  }
  if (mesh) holder.remove(mesh);
  mesh = new THREE.Mesh(baked.geometry, mats); holder.add(mesh);
  buildSplats();
}
function buildSplats() {
  const t0 = performance.now();
  const sp = sampleSplats(baked.geometry, pixels, S.count, 7);
  if (points) { holder.remove(points); points.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(sp.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(sp.normal, 3));
  g.setAttribute('aAlb', new THREE.BufferAttribute(sp.albedo, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(sp.material, 2));
  points = new THREE.Points(g, splatMat); points.frustumCulled = false; holder.add(points);
  status.textContent = `${S.count.toLocaleString()} splats · sampled in ${Math.round(performance.now() - t0)} ms`;
  window.pixelSplat.ready = true;
}

// ---------------------------------------------------------------- controls
const panel = document.getElementById('panel');
function drawPanel() {
  panel.innerHTML = `
    <section><h2>Draw it as</h2><div class="ps-modes">${MODES.map(([id, name, help]) => `<button type="button" class="ps-mode" data-mode="${id}" aria-pressed="${S.mode === id}"><b>${name}</b><span>${help}</span></button>`).join('')}</div></section>
    <section class="ps-row"><label for="ps-model">Model</label><select id="ps-model">${MODELS.map(([id, n]) => `<option value="${id}" ${S.model === id ? 'selected' : ''}>${n}</option>`).join('')}</select></section>
    <section class="ps-row"><label for="ps-pix">Pixel size</label><input id="ps-pix" type="range" min="3" max="12" step="1" value="${S.pix}"><output>${S.pix} px</output></section>
    <section class="ps-row"><label for="ps-count">Splats</label><select id="ps-count"><option value="0" ${S.countPick ? '' : 'selected'}>Automatic (${autoCount(S.pix).toLocaleString()})</option>${[60000, 120000, 240000, 400000].map(n => `<option value="${n}" ${S.countPick === n ? 'selected' : ''}>${n.toLocaleString()}</option>`).join('')}</select></section>
    <section class="ps-row"><label for="ps-light">Lamp</label><input id="ps-light" type="range" min="0" max="6.28" step="0.01" value="${S.light}" ${S.orbit ? 'disabled' : ''}></section>
    <section class="ps-toggles">
      <button type="button" class="ps-toggle" data-flag="spin" aria-pressed="${S.spin}">Turn the knight</button>
      <button type="button" class="ps-toggle" data-flag="orbit" aria-pressed="${S.orbit}">Move the lamp</button>
      <button type="button" class="ps-toggle" data-flag="poster" aria-pressed="${S.poster}">Small palette</button>
    </section>`;
  panel.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { S.mode = b.dataset.mode; drawPanel(); }; });
  panel.querySelectorAll('[data-flag]').forEach(b => { b.onclick = () => { S[b.dataset.flag] = !S[b.dataset.flag]; drawPanel(); }; });
  panel.querySelector('#ps-model').onchange = e => { S.model = e.target.value; loadModel(S.model); };
  let sampled = S.count;
  panel.querySelector('#ps-pix').oninput = e => { S.pix = Number(e.target.value); e.target.nextElementSibling.textContent = `${S.pix} px`; resize(); };
  panel.querySelector('#ps-pix').onchange = () => { if (S.count !== sampled) { sampled = S.count; buildSplats(); drawPanel(); } };   // re-sample when let go (not mid-drag)
  panel.querySelector('#ps-count').onchange = e => { S.countPick = Number(e.target.value); buildSplats(); };
  panel.querySelector('#ps-light').oninput = e => { S.light = Number(e.target.value); };
}
// drag to turn the knight
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = e.clientX; S.spin = false; drawPanel(); canvas.setPointerCapture?.(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (drag != null) { S.yaw += (e.clientX - drag) * 0.01; drag = e.clientX; } });
canvas.addEventListener('pointerup', () => { drag = null; });

function resize() {
  const r = canvas.getBoundingClientRect(), dpr = renderer.getPixelRatio();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr), P = Math.max(1, Math.round(S.pix * dpr));
  splatMat.uniforms.uRes.value.set(W, H); splatMat.uniforms.uPix.value = P;
  lowRT.setSize(Math.max(1, Math.round(W / P)), Math.max(1, Math.round(H / P)));
}
new ResizeObserver(resize).observe(canvas);

let last = performance.now();
window.pixelSplat = { ready: false, state: S };
Object.defineProperty(S, 'count', { get: () => S.countPick || autoCount(S.pix) });
renderer.setAnimationLoop(t => {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (S.spin) S.yaw += dt * 0.45;
  if (S.orbit) S.light += dt * 0.7;
  holder.rotation.y = S.yaw;
  // the lamp: up and in front-left, circling the knight
  const L = common.uL.value.set(Math.sin(S.light) * 0.8, 0.65, Math.cos(S.light) * 0.8 + 0.35).normalize();
  // baked: the light and eye as seen from the model at yaw 0, frozen into it
  splatMat.uniforms.uBaked.value = S.mode === 'baked' ? 1 : 0;
  splatMat.uniforms.uBakeL.value.set(0.55, 0.65, 0.75).normalize();
  splatMat.uniforms.uBakeV.value.set(0, 0.1, 1).normalize();
  common.uPoster.value = S.poster ? 1 : 0;
  if (points && mesh) {
    const splats = S.mode === 'live' || S.mode === 'baked';
    points.visible = splats; mesh.visible = !splats;
    if (S.mode === 'filter') {
      renderer.setRenderTarget(lowRT); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(blitScene, blitCam);
      return;
    }
  }
  renderer.render(scene, camera);
  void L;
});
drawPanel();
loadModel(S.model).catch(e => { status.textContent = 'Could not load the model.'; console.error(e); });
