// Farhold round 23 — the picture pipeline, borrowed from highdef-3d and cut down to what a whole
// streaming planet can afford.
//
//   const post = createPostFx(renderer, gfx);           // gfx from js/gfx.js resolveGraphics()
//   post.render(() => { renderer.render(sky.scene, skyCam); renderer.clearDepth(); renderer.render(scene, camera); });
//   post.setLook({ grade, sunScreen, sunVisible, flash, space });
//   post.setSize(w, h);
//
// THE ORDER IS THE POINT (highdef-3d/js/renderer.js explains it at length; the short version):
//
//   scene ─▶ [half-float HDR target, 4x multisampled on High]
//         ─▶ light shafts (High only) ─▶ bloom ─▶ tone map (ACES) + colour grade ─▶ screen
//
//   * Bloom runs on the raw HDR frame, BEFORE tone mapping, so it is light spilling round a bright
//     edge rather than a blur over a picture already squashed into 0..1. The threshold is set above
//     the brightest sunlit ground, so only the sun's core, lightning, lava, lamps and spells glow.
//   * The shafts smear the frame already drawn toward the sun's place on screen, keeping only what
//     is brighter than the threshold — the sky round the sun. The terrain and the trees in front of
//     it are dark, so the shafts break up on them for free, with no occlusion pass.
//   * Tone mapping and the grade are ONE pass here, not two (highdef has an OutputPass and a grade
//     pass): the same arithmetic, one fewer full-screen read and write. The grade's split tone,
//     saturation and exposure come from js/sky-palette.js, so the grade and the sky agree about
//     what time it is — warm highlights and violet shadows at sunset, blue shadows at night,
//     washed-out and cool in a storm.
//
// What was NOT borrowed, and why, is in research/round23-graphics.md: SMAA (the multisampled target
// does the same job on High), ambient occlusion (a whole extra pass, and Farhold's flat-shaded
// low-poly look has nothing for it to find), and cascaded shadows (Farhold has no shadow maps at all,
// and adding them to a 15 km clipmap is its own project).

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

/** Light shafts: the frame smeared toward the sun, brightest parts only (highdef-3d GodRayPass). */
function shaftMaterial(samples) {
  return new THREE.ShaderMaterial({
    name: 'FarholdShafts',
    defines: { SAMPLES: samples },
    uniforms: {
      tDiffuse: { value: null },
      uSunPos: { value: new THREE.Vector2(0.5, 0.7) },
      uDensity: { value: 0.66 }, uDecay: { value: 0.955 },
      uExposure: { value: 0.07 }, uThreshold: { value: 2.2 }, uFalloff: { value: 2.8 },
      uTint: { value: new THREE.Color(0xffe2b0) }, uAmount: { value: 0 }, uAspect: { value: 1 },
    },
    vertexShader: QUAD_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform vec2 uSunPos;
      uniform float uDensity, uDecay, uExposure, uThreshold, uAmount, uAspect, uFalloff;
      uniform vec3 uTint;
      varying vec2 vUv;
      vec3 bright( vec2 uv ) {
        vec3 c = texture2D( tDiffuse, uv ).rgb;
        float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
        return min( c, vec3( 24.0 ) ) * smoothstep( uThreshold, uThreshold + 1.2, l );
      }
      void main() {
        if ( uAmount <= 0.001 ) { gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); return; }
        vec2 uv = vUv;
        vec2 delta = ( uv - uSunPos ) * ( uDensity / float( SAMPLES ) );
        float illum = 1.0, norm = 0.0;
        vec3 acc = vec3( 0.0 );
        for ( int i = 0; i < SAMPLES; i ++ ) {
          uv -= delta;
          acc += bright( clamp( uv, 0.0, 1.0 ) ) * illum;
          norm += illum;
          illum *= uDecay;
        }
        acc *= uExposure * uAmount / max( norm, 1e-4 );
        vec2 d = vUv - uSunPos; d.x *= uAspect;
        float near = exp( - length( d ) * uFalloff );
        // only the rays: this runs at half resolution and the final pass adds it back
        gl_FragColor = vec4( acc * uTint * near, 1.0 );
      }`,
    depthTest: false, depthWrite: false,
  });
}

/**
 * Tone map + grade + vignette + grain in one pass. Written out rather than taken from three's chunk
 * because it ends in the sRGB curve itself and goes straight to the screen.
 */
function finalMaterial() {
  return new THREE.ShaderMaterial({
    name: 'FarholdFinal',
    uniforms: {
      tDiffuse: { value: null }, tShafts: { value: null }, uShafts: { value: 0 },
      uExposure: { value: 1 }, uContrast: { value: 1.04 }, uSaturation: { value: 1.04 },
      uShadowTint: { value: new THREE.Color(0x2c3f58) }, uHighTint: { value: new THREE.Color(0xffeccf) },
      uSplit: { value: 0.08 }, uVignette: { value: 0.22 }, uGrain: { value: 0 }, uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) }, uLift: { value: 0.01 },
    },
    vertexShader: QUAD_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse, tShafts;
      uniform float uShafts;
      uniform float uExposure, uContrast, uSaturation, uSplit, uVignette, uGrain, uTime, uLift;
      uniform vec3 uShadowTint, uHighTint;
      uniform vec2 uResolution;
      varying vec2 vUv;
      // ACES filmic, the fitted curve (Narkowicz / Hill) three uses for ACESFilmicToneMapping
      vec3 RRTAndODTFit( vec3 v ) {
        vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
        vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
        return a / b;
      }
      vec3 aces( vec3 color ) {
        const mat3 IN = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
        const mat3 OUT = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
        color *= uExposure / 0.6;
        color = IN * color;
        color = RRTAndODTFit( color );
        color = OUT * color;
        return clamp( color, 0.0, 1.0 );
      }
      vec3 toSRGB( vec3 c ) {
        return mix( c * 12.92, pow( c, vec3( 0.41666 ) ) * 1.055 - 0.055, step( 0.0031308, c ) );
      }
      float hash12( vec2 p ) {
        vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
        p3 += dot( p3, p3.yzx + 33.33 );
        return fract( ( p3.x + p3.y ) * p3.z );
      }
      void main() {
        vec3 hdr = texture2D( tDiffuse, vUv ).rgb + texture2D( tShafts, vUv ).rgb * uShafts;
        vec3 col = toSRGB( aces( hdr ) );
        col = col * ( 1.0 - uLift ) + uLift;
        col = ( col - 0.5 ) * uContrast + 0.5;
        float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
        col = mix( vec3( l ), col, uSaturation );
        // split tone: shadows toward one colour, highlights toward another
        col = mix( col, col * uShadowTint * 2.0, ( 1.0 - smoothstep( 0.0, 0.55, l ) ) * uSplit );
        col = mix( col, col * uHighTint, smoothstep( 0.45, 1.0, l ) * uSplit );
        vec2 c = vUv - 0.5;
        col *= 1.0 - uVignette * smoothstep( 0.15, 0.95, dot( c, c ) * 2.0 );
        col += ( hash12( vUv * uResolution + fract( uTime ) * 137.0 ) - 0.5 ) * uGrain;
        gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
      }`,
    depthTest: false, depthWrite: false,
  });
}

export function createPostFx(renderer, gfx) {
  let flags = gfx;
  let width = 1, height = 1;
  let sceneRT = null, midRT = null, bloom = null;
  const shafts = new FullScreenQuad(shaftMaterial(gfx.shaftSamples || 36));
  const final = new FullScreenQuad(finalMaterial());
  const S = shafts.material.uniforms, F = final.material.uniforms;
  const stats = { passes: 0 };

  function build() {
    sceneRT?.dispose(); midRT?.dispose(); bloom?.dispose(); bloom = null;
    F.tShafts.value = null; F.uShafts.value = 0;
    if (!flags.postfx) { sceneRT = midRT = null; return; }
    const pr = renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(width * pr)), h = Math.max(1, Math.floor(height * pr));
    sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, samples: flags.msaa || 0,
      colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: true, stencilBuffer: false,
    });
    sceneRT.texture.name = 'farhold-hdr';
    // the shafts are soft by nature, so half resolution loses nothing and costs a quarter
    midRT = flags.shafts ? new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), {
      type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: false,
    }) : null;
    if (flags.bloom) {
      const k = flags.bloomScale || 1;
      // strength, radius, threshold — the threshold is on the HDR frame: sunlit grass is ~1, the
      // sun's core is 18, so 1.35 lets the lights and the sun through and leaves the fields alone
      bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, w * k), Math.max(1, h * k)), 0.55, 0.42, 1.35);
    }
    S.uAspect.value = w / h;
    F.uResolution.value.set(w, h);
    F.uVignette.value = flags.vignette ?? 0.22;
    F.uGrain.value = flags.grain ?? 0;
  }

  const api = {
    get enabled() { return !!flags.postfx; },
    get flags() { return flags; },
    stats,
    setFlags(next) { flags = next; build(); },
    setSize(w, h) { width = w; height = h; build(); },
    /**
     * What the grade and the shafts should do this frame.
     * grade (sky-palette gradeFor), sunScreen {x,y} 0..1, sunVisible 0..1, flash 0..1, space 0..1
     */
    setLook({ grade, sunScreen, sunVisible = 0, flash = 0, space = 0, indoors = false, dt = 0 } = {}) {
      F.uTime.value += dt;
      if (grade) {
        F.uExposure.value = grade.exposure + flash * 0.6;
        F.uContrast.value = grade.contrast;
        F.uSaturation.value = grade.saturation;
        F.uSplit.value = grade.split * (1 - space);
        F.uShadowTint.value.setRGB(grade.shadowTint[0], grade.shadowTint[1], grade.shadowTint[2], THREE.SRGBColorSpace);
        F.uHighTint.value.setRGB(grade.highTint[0], grade.highTint[1], grade.highTint[2], THREE.SRGBColorSpace);
        if (bloom) bloom.strength = grade.bloom;
      }
      // underground the torch is all there is, and ACES crushes the darks — open the camera up
      if (indoors) { F.uExposure.value = 1.6; F.uSplit.value = 0.05; }
      if (bloom) bloom.threshold = space > 0.5 ? 0.85 : 1.35;
      if (sunScreen) S.uSunPos.value.set(sunScreen.x, sunScreen.y);
      S.uAmount.value = flags.shafts ? sunVisible : 0;
    },
    /** Draw a frame. `draw()` renders the scenes into whatever target is current. */
    render(draw) {
      if (!flags.postfx || !sceneRT) { renderer.setRenderTarget(null); draw(); return; }
      const autoClear = renderer.autoClear;
      renderer.setRenderTarget(sceneRT);
      renderer.clear();
      draw();
      const src = sceneRT;
      stats.passes = 1;
      F.uShafts.value = 0;
      if (midRT && S.uAmount.value > 0.01) {
        S.tDiffuse.value = sceneRT.texture;
        renderer.setRenderTarget(midRT);
        shafts.render(renderer);
        F.tShafts.value = midRT.texture;
        F.uShafts.value = 1;
        stats.passes++;
      }
      if (bloom) {
        // UnrealBloomPass adds its glow INTO the buffer it reads
        renderer.autoClear = false;
        bloom.render(renderer, null, src, 0, false);
        stats.passes++;
      }
      F.tDiffuse.value = src.texture;
      // a sampler must always hold something; with the shafts off it is multiplied by zero
      if (!F.tShafts.value || !midRT) F.tShafts.value = src.texture;
      renderer.setRenderTarget(null);
      final.render(renderer);
      stats.passes++;
      renderer.autoClear = autoClear;
    },
    dispose() {
      sceneRT?.dispose(); midRT?.dispose(); bloom?.dispose();
      shafts.material.dispose(); shafts.dispose(); final.material.dispose(); final.dispose();
    },
  };
  build();
  return api;
}
