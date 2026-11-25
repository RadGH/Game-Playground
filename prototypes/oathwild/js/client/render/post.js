// After the picture is drawn (owner 2026-11-24 environment round; "make sure … not washed out. Be careful about too much
// bloom"): one chain per quality, all from three.js's own vendored passes plus one small grade shader of ours.
//   Low     nothing (the renderer tone-maps straight to the screen, as before — phones pay for no extra passes)
//   Medium  scene → bloom (half size, only the brightest things) → tone map → grade + vignette → SMAA edges
//   High    scene (4× MSAA) → ground-contact shade (GTAO) → bloom → tone map → grade + vignette
// The grade is the colour look a LUT would give, written as numbers so it can be tuned (GRADE below, and ?envdebug):
// warm highlights, cool shadows, greens a touch less loud, blacks barely lifted, contrast kept (no milky haze).
//
//   const post = createPost(view, quality)   post.render()   post.setSize(w, h)   post.grade (uniforms)   post.bloom
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

/** The look, in display colours (after tone mapping). Every number here was checked on screenshots (README). */
export const GRADE = {
  warm: [1.04, 1.0, 0.94],      // multiplies the highlights
  cool: [0.94, 0.99, 1.06],     // multiplies the shadows
  greenCalm: 0.06,              // how much a pure green is pulled toward its own grey (0 = untouched)
  saturation: 1.12,             // overall
  contrast: 1.1,               // around mid grey
  lift: 0,                  // blacks raised by this much (a little air, not fog)
  vignette: 0.18,               // corner darkening
};
// first tune (0.22 / 0.9) washed the horizon into the trees: now only things brighter than the sky glow, and faintly
export const BLOOM = { strength: 0.1, radius: 0.3, threshold: 1.15 };

const GradeShader = {
  name: 'OwGrade',
  uniforms: {
    tDiffuse: { value: null },
    uWarm: { value: new THREE.Vector3(...GRADE.warm) }, uCool: { value: new THREE.Vector3(...GRADE.cool) },
    uGreen: { value: GRADE.greenCalm }, uSat: { value: GRADE.saturation }, uCon: { value: GRADE.contrast }, uLift: { value: GRADE.lift },
    uVig: { value: GRADE.vignette }, uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 uWarm, uCool; uniform float uGreen, uSat, uCon, uLift, uVig, uAspect; varying vec2 vUv;
    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // split toning: cool in the shadows, warm in the highlights (smooth, no band)
      c *= mix(uCool, uWarm, smoothstep(0.15, 0.75, l));
      // greens that shout: how much green leads the other two, pulled toward the pixel's own grey
      float g = clamp(c.g - max(c.r, c.b), 0.0, 1.0);
      c = mix(c, vec3(l), uGreen * smoothstep(0.0, 0.25, g));
      c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uSat);
      c = (c - 0.5) * uCon + 0.5;
      c = c * (1.0 - uLift) + uLift;
      vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
      c *= 1.0 - uVig * smoothstep(0.35, 0.95, length(v) * 1.25);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }`,
};

// God rays (High only): bright sky seen through gaps in the leaves is smeared outward from the sun's place on screen, so
// the leaves themselves cut the rays (no extra scene pass). Fades out as you turn from the sun. Kept faint (rule 75).
export const RAYS = { strength: 0.16, threshold: 0.85, decay: 0.955, density: 0.55 };
const RaysShader = {
  name: 'OwRays',
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uFace: { value: 0 }, uCol: { value: new THREE.Color('#ffd6a4') },
    uStrength: { value: RAYS.strength }, uThresh: { value: RAYS.threshold }, uDecay: { value: RAYS.decay }, uDensity: { value: RAYS.density } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uFace, uStrength, uThresh, uDecay, uDensity; uniform vec3 uCol; varying vec2 vUv;
    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      if (uFace <= 0.001) { gl_FragColor = src; return; }
      vec2 step = (vUv - uSun) * (uDensity / 32.0);
      vec2 uv = vUv; float illum = 1.0, acc = 0.0;
      for (int i = 0; i < 32; i++) {
        uv -= step;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        acc += max(dot(s, vec3(0.3, 0.59, 0.11)) - uThresh, 0.0) * illum;
        illum *= uDecay;
      }
      gl_FragColor = vec4(src.rgb + uCol * acc * (uStrength / 32.0) * 8.0 * uFace, src.a);
    }`,
};

export function createPost(view, quality) {
  if (quality === 'low') return null;
  const { renderer, scene, camera } = view;
  const high = quality === 'high';
  const w = Math.max(1, view.size.w), h = Math.max(1, view.size.h);
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (high) {
    gtao = new GTAOPass(scene, camera, w, h);
    gtao.blendIntensity = 0.35;   // 0.55 left the shade under a wood near black
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 12 });
    composer.addPass(gtao);
  }
  const rays = high ? new ShaderPass(RaysShader) : null;
  if (rays) composer.addPass(rays);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  if (!high) composer.addPass(new SMAAPass());
  const post = {
    composer, bloom, grade: grade.uniforms, gtao, rays,
    /** Where the sun is on screen and how much we face it (rays only when it is ahead of us). */
    sun(dir) {
      if (!rays) return;
      const p = new THREE.Vector3().copy(camera.position).addScaledVector(dir, 500).project(camera);
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
      const facing = Math.max(0, fwd.dot(dir) - 0.35) / 0.65;
      rays.uniforms.uSun.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
      rays.uniforms.uFace.value = p.z < 1 ? facing * facing : 0;
    },
    render() { composer.render(); },
    setSize(W, H) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); bloom.resolution.set(W / 2, H / 2); grade.uniforms.uAspect.value = W / Math.max(1, H); gtao?.setSize(W * renderer.getPixelRatio(), H * renderer.getPixelRatio()); },
    dispose() { composer.dispose(); },
  };
  post.setSize(w, h);
  return post;
}
