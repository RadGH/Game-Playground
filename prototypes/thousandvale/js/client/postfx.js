// 2026-10-16 — graphics (G-ATMOS): the glow round bright things, High quality only.
//
// Why not the usual render-to-texture chain: Thousandvale writes its fog and its painted sky as DISPLAY colours (three
// adds fog after tone mapping — see sky-box.js), so the scene has to be drawn straight to the screen or the far hills
// stop meeting the sky. The glow therefore works on the finished frame: copy it (one copy), pick out what is bright
// and shrink it to a quarter (one pass), blur it across and down (two quarter-size passes), add it back over the frame
// (one pass). Five extra draw calls, all but the copy and the last at a sixteenth of the pixels; every shader is made
// once at boot.
//
//   const glow = createBloom(renderer, { strength, threshold, shafts: { sunDir } });
//   glow.render(scene, camera)          // instead of renderer.render(scene, camera)
//   glow.enabled = false                // draw plainly (dungeons keep it: lamps and spells glow there too)
//   glow.shafts = 0..1                  // 2026-10-20: how strong the sun's light shafts are (scene.js: daylight, sun up)
//
// 2026-10-20 — light shafts (High only, `shafts` option): the frame already drawn is smeared toward the sun's place on
// screen, keeping only its brightest parts — the sky round the sun is the brightest thing in the picture and the trees,
// hills and roofs in front of it are dark, so the rays break up on them for free with no extra pass over the scene
// (highdef-3d/js/postfx.js GodRayPass). Thousandvale's frame is already tone mapped, so the threshold is in display
// values (0..1), and it runs at a quarter of the pixels from the same copy the glow uses: one more small pass.

import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const SHAFT_SAMPLES = 28;
export function createBloom(renderer, { strength = 0.3, threshold = 0.72, knee = 0.22, shafts = null } = {}) {
  const size = new THREE.Vector2();
  let fb = null, a = null, b = null, w = 0, h = 0;
  const opts = { depthBuffer: false, stencilBuffer: false, type: THREE.UnsignedByteType };
  const mk = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
  const bright = mk(`
    uniform sampler2D tSrc; uniform vec2 uTex; uniform float uTh, uKnee; varying vec2 vUv;
    vec3 pick(vec2 o){ vec3 c = texture2D(tSrc, vUv + o * uTex).rgb; float l = max(c.r, max(c.g, c.b));
      float s = clamp(l - uTh + uKnee, 0.0, 2.0 * uKnee); s = s * s / (4.0 * uKnee + 1e-4);
      return c * max(s, l - uTh) / max(l, 1e-4); }
    void main(){ gl_FragColor = vec4((pick(vec2(-1.0,-1.0)) + pick(vec2(1.0,-1.0)) + pick(vec2(-1.0,1.0)) + pick(vec2(1.0,1.0))) * 0.25, 1.0); }`,
  { tSrc: { value: null }, uTex: { value: new THREE.Vector2() }, uTh: { value: threshold }, uKnee: { value: knee } });
  const blur = mk(`
    uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2270;
      c += (texture2D(tSrc, vUv + uDir * 1.3846).rgb + texture2D(tSrc, vUv - uDir * 1.3846).rgb) * 0.3162;
      c += (texture2D(tSrc, vUv + uDir * 3.2308).rgb + texture2D(tSrc, vUv - uDir * 3.2308).rgb) * 0.0703;
      gl_FragColor = vec4(c, 1.0); }`,
  { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const add = mk(`uniform sampler2D tSrc; uniform float uK; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uK, 1.0); }`,
    { tSrc: { value: null }, uK: { value: strength } }, { blending: THREE.AdditiveBlending, transparent: true });
  // the light shafts: average the bright parts along the line to the sun, fading with distance from it on screen
  const rays = shafts ? mk(`
    uniform sampler2D tSrc; uniform vec2 uSun; uniform float uAmount, uAspect, uTh; varying vec2 vUv;
    vec3 sky(vec2 uv){ vec3 c = texture2D(tSrc, clamp(uv, 0.0, 1.0)).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return c * smoothstep(uTh, uTh + 0.12, l) * smoothstep(0.0, 0.08, c.b - c.g * 0.5); }
    void main(){
      vec2 uv = vUv, delta = (vUv - uSun) * (0.7 / ${SHAFT_SAMPLES}.0);
      float illum = 1.0, norm = 0.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < ${SHAFT_SAMPLES}; i++) { uv -= delta; acc += sky(uv) * illum; norm += illum; illum *= 0.95; }
      vec2 d = vUv - uSun; d.x *= uAspect;
      float near = exp(-length(d) * 2.6);
      gl_FragColor = vec4(acc / max(norm, 1e-4) * near * uAmount * vec3(1.0, 0.88, 0.68), 1.0); }`,
  { tSrc: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.7) }, uAmount: { value: 0 }, uAspect: { value: 1 }, uTh: { value: 0.8 } }) : null;
  const sunDir = shafts?.sunDir || null, _v = new THREE.Vector3();
  let c = null;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bright); quad.frustumCulled = false;
  const post = new THREE.Scene(); post.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function fit() {
    renderer.getDrawingBufferSize(size);
    if (size.x === w && size.y === h && fb) return;
    w = size.x; h = size.y;
    fb?.dispose(); a?.dispose(); b?.dispose(); c?.dispose();
    fb = new THREE.FramebufferTexture(w, h); fb.minFilter = fb.magFilter = THREE.LinearFilter;
    const qw = Math.max(1, Math.round(w / 4)), qh = Math.max(1, Math.round(h / 4));
    a = new THREE.WebGLRenderTarget(qw, qh, opts); b = new THREE.WebGLRenderTarget(qw, qh, opts);
    c = rays ? new THREE.WebGLRenderTarget(qw, qh, opts) : null;
    bright.uniforms.uTex.value.set(1 / w, 1 / h);
  }
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(post, cam); }

  /** Where the sun is on screen (0..1 uv) and how much of the effect to draw (0 when it is behind you or set). */
  function sunOnScreen(camera) {
    if (!sunDir || api.shafts <= 0.001 || sunDir.y < 0.02) return 0;
    _v.copy(sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    if (_v.z > 1) return 0;                                       // behind the camera
    rays.uniforms.uSun.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
    const off = Math.hypot(_v.x, _v.y);
    return api.shafts * Math.max(0, 1 - Math.max(0, off - 0.9) / 0.9);   // eases off as the sun leaves the frame
  }
  const api = {
    enabled: true, strength, shafts: shafts ? 1 : 0,
    render(scene, camera) {
      renderer.render(scene, camera);
      if (!api.enabled) return;
      fit();
      const auto = renderer.autoClear, reset = renderer.info.autoReset;
      renderer.info.autoReset = false;             // the frame's counts keep the scene's draws (plus these five)
      renderer.copyFramebufferToTexture(fb);
      bright.uniforms.tSrc.value = fb; pass(bright, a);
      blur.uniforms.tSrc.value = a.texture; blur.uniforms.uDir.value.set(1 / a.width, 0); pass(blur, b);
      blur.uniforms.tSrc.value = b.texture; blur.uniforms.uDir.value.set(0, 1 / a.height); pass(blur, a);
      const shaft = rays ? sunOnScreen(camera) : 0;
      renderer.autoClear = false;
      add.uniforms.tSrc.value = a.texture; add.uniforms.uK.value = api.strength; pass(add, null);
      if (shaft > 0.001) {
        rays.uniforms.tSrc.value = fb; rays.uniforms.uAmount.value = shaft * 0.7; rays.uniforms.uAspect.value = w / h;
        renderer.autoClear = true; pass(rays, c); renderer.autoClear = false;
        add.uniforms.tSrc.value = c.texture; add.uniforms.uK.value = 1; pass(add, null);
      }
      renderer.autoClear = auto; renderer.info.autoReset = reset;
    },
    dispose() { fb?.dispose(); a?.dispose(); b?.dispose(); c?.dispose(); bright.dispose(); blur.dispose(); add.dispose(); rays?.dispose(); quad.geometry.dispose(); },
  };
  return api;
}
