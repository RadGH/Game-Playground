// 2026-10-16 — graphics (G-ATMOS): the glow round bright things, High quality only.
//
// Why not the usual render-to-texture chain: Thousandvale writes its fog and its painted sky as DISPLAY colours (three
// adds fog after tone mapping — see sky-box.js), so the scene has to be drawn straight to the screen or the far hills
// stop meeting the sky. The glow therefore works on the finished frame: copy it (one copy), pick out what is bright
// and shrink it to a quarter (one pass), blur it across and down (two quarter-size passes), add it back over the frame
// (one pass). Five extra draw calls, all but the copy and the last at a sixteenth of the pixels; every shader is made
// once at boot.
//
//   const glow = createBloom(renderer, { strength, threshold });
//   glow.render(scene, camera)          // instead of renderer.render(scene, camera)
//   glow.enabled = false                // draw plainly (dungeons keep it: lamps and spells glow there too)

import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function createBloom(renderer, { strength = 0.3, threshold = 0.72, knee = 0.22 } = {}) {
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
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bright); quad.frustumCulled = false;
  const post = new THREE.Scene(); post.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function fit() {
    renderer.getDrawingBufferSize(size);
    if (size.x === w && size.y === h && fb) return;
    w = size.x; h = size.y;
    fb?.dispose(); a?.dispose(); b?.dispose();
    fb = new THREE.FramebufferTexture(w, h); fb.minFilter = fb.magFilter = THREE.LinearFilter;
    const qw = Math.max(1, Math.round(w / 4)), qh = Math.max(1, Math.round(h / 4));
    a = new THREE.WebGLRenderTarget(qw, qh, opts); b = new THREE.WebGLRenderTarget(qw, qh, opts);
    bright.uniforms.uTex.value.set(1 / w, 1 / h);
  }
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(post, cam); }

  const api = {
    enabled: true, strength,
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
      renderer.autoClear = false;
      add.uniforms.tSrc.value = a.texture; add.uniforms.uK.value = api.strength; pass(add, null);
      renderer.autoClear = auto; renderer.info.autoReset = reset;
    },
    dispose() { fb?.dispose(); a?.dispose(); b?.dispose(); bright.dispose(); blur.dispose(); add.dispose(); quad.geometry.dispose(); },
  };
  return api;
}
