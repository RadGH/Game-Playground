// The Look's own after-effect passes (world-tools round 2026-11-26, 4a). Each is built ONCE — when a preset first
// turns it on, behind the short fade — and afterwards only its strength uniform moves (lessons rule 29).
//   DepthBlurShader   distance blur: the far land softens like a lens focused on you (needs the scene's depth texture)
//   SceneDepthPass    the scene into its own target with a depth texture (stands in for the chain's RenderPass)
//
//   const p = new ShaderPass(DepthBlurShader); p.uniforms.tDepth.value = target.depthTexture; p.uniforms.uStrength.value = 0.8
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

export const DepthBlurShader = {
  name: 'OwDepthBlur',
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null }, uStrength: { value: 0 },
    uNear: { value: 0.2 }, uFar: { value: 400 }, uFrom: { value: 70 }, uTo: { value: 240 }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform float uStrength, uNear, uFar, uFrom, uTo; uniform vec2 uTexel; varying vec2 vUv;
    float metres(vec2 uv){ float z = texture2D(tDepth, uv).x; return -perspectiveDepthToViewZ(z, uNear, uFar); }
    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      if (uStrength <= 0.001) { gl_FragColor = src; return; }
      float d = metres(vUv);
      float k = smoothstep(uFrom, uTo, d) * uStrength;
      if (k < 0.01) { gl_FragColor = src; return; }
      // a 12-tap disc, radius by distance; taps nearer than this pixel are skipped so a near tree never smears onto the sky
      vec3 acc = src.rgb; float w = 1.0;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996, r = (0.35 + 0.65 * fract(float(i) * 0.618)) * 3.2 * k;
        vec2 o = vec2(cos(a), sin(a)) * r * uTexel;
        float dd = metres(vUv + o);
        float ok = step(uFrom * 0.8, dd);
        acc += texture2D(tDiffuse, vUv + o).rgb * ok; w += ok;
      }
      gl_FragColor = vec4(acc / w, src.a);
    }`,
};

/**
 * The scene drawn into its own target WITH a depth texture, then copied on into the chain — replaces the chain's
 * RenderPass when distance blur is first turned on (the composer's own two buffers swap every pass, so the depth has to
 * live in a target nobody writes the blur into). Cost: one full-screen copy.
 */
export class SceneDepthPass extends Pass {
  constructor(scene, camera, w, h, samples = 0) {
    super();
    this.scene = scene; this.camera = camera; this.needsSwap = false;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples });
    this.rt.depthTexture = new THREE.DepthTexture(w, h);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader, depthTest: false, depthWrite: false }));
  }
  get depthTexture() { return this.rt.depthTexture; }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(this.scene, this.camera);
    this.quad.material.uniforms.tDiffuse.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.rt.dispose(); this.quad.dispose(); this.quad.material.dispose(); }
}
