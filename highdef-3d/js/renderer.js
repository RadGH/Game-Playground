// The renderer and the post-processing chain.
//
// The order of the chain is not arbitrary. Roughly:
//
//   scene ──▶ [HDR buffer, multisampled] ──▶ ambient occlusion ──▶ god rays ──▶ bloom
//         ──▶ tone map + sRGB ──▶ colour grade ──▶ edge antialiasing ──▶ screen
//
// The two things worth knowing:
//
//   * Bloom happens BEFORE tone mapping, in high dynamic range. Bloom after tone mapping can only
//     smear values that have already been squashed into 0..1, which is why it looks like a blur
//     filter rather than light spilling around an edge.
//   * The grade and the antialiasing happen AFTER tone mapping, in ordinary 0..1 colour. A
//     vignette applied to HDR values does nothing sensible, and edge antialiasing that looks at
//     HDR luminance thinks every bright edge is an edge.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { GodRayPass, GradeShader } from './postfx.js';

/**
 * Build the renderer and composer.
 *
 * @param {HTMLElement} container the element the canvas goes into
 * @param {object} quality a preset from quality.js
 */
export function createRenderer(container, quality) {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,            // the composer does the antialiasing; this flag would do nothing
    powerPreference: 'high-performance',
    stencil: false,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(quality.pixelRatio, window.devicePixelRatio || 1));
  renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;   // the filmic curve, not a straight clamp
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x93a9c0, 1);
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);
  renderer.domElement.classList.add('hd-canvas');

  const size = new THREE.Vector2(
    container.clientWidth || 1280,
    container.clientHeight || 720
  );

  const api = {
    renderer,
    composer: null,
    passes: {},
    quality,
    size,
    /** Rebuilt whenever the quality preset changes. */
    build(scene, camera, q = quality) {
      api.quality = q;
      if (api.composer) api.composer.dispose();

      renderer.setPixelRatio(Math.min(q.pixelRatio, window.devicePixelRatio || 1));
      renderer.shadowMap.type = q.shadowMapSize >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

      // A half-float target keeps values above 1.0 alive all the way to the tone mapper. `samples`
      // turns on hardware multisampling inside the target, which is what lets alpha-to-coverage
      // give clean leaf edges.
      const target = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(size.x * renderer.getPixelRatio())),
        Math.max(1, Math.floor(size.y * renderer.getPixelRatio())),
        {
          type: THREE.HalfFloatType,
          samples: q.msaa || 0,
          colorSpace: THREE.LinearSRGBColorSpace,
          depthBuffer: true,
          stencilBuffer: false,
        }
      );
      const composer = new EffectComposer(renderer, target);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(size.x, size.y);
      api.composer = composer;
      api.passes = {};

      const renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
      api.passes.render = renderPass;

      if (q.ssao) {
        // Ambient occlusion: the soft darkening where surfaces meet. Outdoors it is what beds a
        // tree into the ground instead of leaving it looking stuck on.
        const gtao = new GTAOPass(scene, camera, size.x, size.y);
        gtao.output = GTAOPass.OUTPUT.Default;
        gtao.blendIntensity = 0.85;
        gtao.updateGtaoMaterial({
          radius: 1.4, distanceExponent: 1.0, thickness: 1.0,
          scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false,
        });
        composer.addPass(gtao);
        api.passes.gtao = gtao;
      }

      if (q.godRays) {
        const rays = new GodRayPass({ samples: q.name === 'ultra' ? 64 : 40 });
        rays.uniforms.uAspect.value = size.x / size.y;
        composer.addPass(rays);
        api.passes.godRays = rays;
      }

      if (q.bloom) {
        // radius 0.5, threshold 0.9 — only genuinely bright things bloom. A low threshold makes
        // the whole picture soft and is the classic sign of bloom used as a crutch.
        const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), q.bloomStrength, 0.55, 0.92);
        composer.addPass(bloom);
        api.passes.bloom = bloom;
      }

      const output = new OutputPass();
      composer.addPass(output);
      api.passes.output = output;

      const grade = new ShaderPass(GradeShader);
      grade.uniforms.uResolution.value.set(size.x, size.y);
      composer.addPass(grade);
      api.passes.grade = grade;

      if (q.smaa) {
        const smaa = new SMAAPass();
        composer.addPass(smaa);
        api.passes.smaa = smaa;
      }

      // Whichever pass ends up last draws to the screen.
      const last = composer.passes[composer.passes.length - 1];
      for (const p of composer.passes) p.renderToScreen = false;
      last.renderToScreen = true;

      return composer;
    },

    setSize(w, h) {
      size.set(w, h);
      renderer.setSize(w, h);
      if (api.composer) {
        api.composer.setSize(w, h);
        if (api.passes.grade) api.passes.grade.uniforms.uResolution.value.set(w, h);
        if (api.passes.godRays) api.passes.godRays.uniforms.uAspect.value = w / h;
      }
    },

    render(dt) {
      if (api.passes.grade) api.passes.grade.uniforms.uTime.value += dt;
      renderer.info.reset();
      api.composer.render(dt);
    },

    dispose() {
      if (api.composer) api.composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };

  return api;
}
