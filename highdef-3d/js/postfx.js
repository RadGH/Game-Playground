// The two post-processing passes we write ourselves, plus the shader for the colour grade.
//
// Everything else in the chain (bloom, SMAA, tone mapping) comes from three's addons. These two do
// not, because they are what gives the picture its character:
//
//   GodRayPass  — light shafts through the trees.
//   GradePass   — the final look: contrast, saturation, a vignette, a whisper of grain, and a
//                 slight warm/cool split between highlights and shadows.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Light shafts, done the cheap way that happens to look right.
 *
 * The textbook version needs an occlusion buffer: render the scene in black with only the sun lit,
 * then smear it. That is a whole extra pass over the geometry. This version smears the ALREADY
 * RENDERED frame toward the sun's position on screen, keeping only the brightest parts. It works
 * because the sky around the sun is the brightest thing in the frame and the trees in front of it
 * are the darkest, so the streaks break up on the branches for free — which is exactly the effect.
 */
export class GodRayPass extends Pass {
  constructor({ samples = 48 } = {}) {
    super();
    this.uniforms = {
      tDiffuse:  { value: null },
      uSunPos:   { value: new THREE.Vector2(0.5, 0.75) },
      uDensity:  { value: 0.72 },
      uDecay:    { value: 0.955 },
      uWeight:   { value: 0.28 },
      uExposure: { value: 0.30 },
      uThreshold:{ value: 0.62 },
      uTint:     { value: new THREE.Color(0xffe2b0) },
      uAmount:   { value: 1.0 },
      uAspect:   { value: 1.0 },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'GodRayPass',
      defines: { SAMPLES: samples },
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec2  uSunPos;
        uniform float uDensity, uDecay, uWeight, uExposure, uThreshold, uAmount, uAspect;
        uniform vec3  uTint;
        varying vec2  vUv;

        // Keep only what is brighter than the threshold — the sky disc and the sky around it.
        vec3 bright( vec2 uv ) {
          vec3 c = texture2D( tDiffuse, uv ).rgb;
          float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
          return c * smoothstep( uThreshold, uThreshold + 0.35, l );
        }

        void main() {
          vec3 scene = texture2D( tDiffuse, vUv ).rgb;
          if ( uAmount <= 0.001 ) { gl_FragColor = vec4( scene, 1.0 ); return; }

          vec2 uv = vUv;
          vec2 delta = ( uv - uSunPos ) * ( uDensity / float( SAMPLES ) );
          float illum = 1.0;
          vec3 acc = vec3( 0.0 );
          for ( int i = 0; i < SAMPLES; i ++ ) {
            uv -= delta;
            acc += bright( clamp( uv, 0.0, 1.0 ) ) * illum * uWeight;
            illum *= uDecay;
          }
          acc *= uExposure * uAmount;

          // Fade the shafts out as the sun leaves the frame, or they pop when it crosses the edge.
          vec2 d = ( vUv - uSunPos );
          d.x *= uAspect;
          float edge = 1.0 - smoothstep( 0.35, 1.25, length( uSunPos - vec2( 0.5 ) ) * 2.0 );

          gl_FragColor = vec4( scene + acc * uTint * edge, 1.0 );
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

/**
 * The final look. Runs AFTER tone mapping, in ordinary 0..1 colour, which is the only place a
 * vignette and a contrast curve behave the way your eye expects.
 *
 *   lift/gamma/gain — a simple three-part curve: lift the shadows a touch (nothing in an outdoor
 *                     scene is truly black, because the sky fills it in), keep the midtones, pull
 *                     the highlights slightly.
 *   split tone      — shadows drift cool, highlights drift warm. One line of code; it is the
 *                     single biggest reason a picture reads as "graded" rather than "rendered".
 *   vignette        — the corners darken. Every lens does it.
 *   grain           — a whisper. Enough to stop flat sky banding, not enough to notice.
 *   chromatic edge  — the corners shift red/blue by a fraction of a pixel.
 */
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse:    { value: null },
    uTime:       { value: 0 },
    uContrast:   { value: 1.06 },
    uSaturation: { value: 1.06 },
    uLift:       { value: 0.012 },
    uVignette:   { value: 0.34 },
    uGrain:      { value: 0.018 },
    uChroma:     { value: 0.30 },
    uShadowTint: { value: new THREE.Color(0x2c3f58) },
    uHighTint:   { value: new THREE.Color(0xffeccf) },
    uSplit:      { value: 0.10 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uContrast, uSaturation, uLift, uVignette, uGrain, uChroma, uSplit;
    uniform vec3  uShadowTint, uHighTint;
    uniform vec2  uResolution;
    varying vec2  vUv;

    float hash12( vec2 p ) {
      vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
      p3 += dot( p3, p3.yzx + 33.33 );
      return fract( ( p3.x + p3.y ) * p3.z );
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot( c, c );

      // Chromatic aberration: sample red and blue a hair further out than green.
      float ca = uChroma * 0.0025 * r2;
      vec3 col;
      col.r = texture2D( tDiffuse, vUv + c * ca ).r;
      col.g = texture2D( tDiffuse, vUv ).g;
      col.b = texture2D( tDiffuse, vUv - c * ca ).b;

      // lift, then contrast about the middle grey
      col = col * ( 1.0 - uLift ) + uLift;
      col = ( col - 0.5 ) * uContrast + 0.5;

      // saturation
      float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      col = mix( vec3( l ), col, uSaturation );

      // split tone
      col = mix( col, col * uShadowTint * 2.0, ( 1.0 - smoothstep( 0.0, 0.55, l ) ) * uSplit );
      col = mix( col, col * uHighTint, smoothstep( 0.45, 1.0, l ) * uSplit );

      // vignette
      float vig = 1.0 - uVignette * smoothstep( 0.15, 0.95, r2 * 2.0 );
      col *= vig;

      // grain
      float g = hash12( vUv * uResolution + fract( uTime ) * 137.0 ) - 0.5;
      col += g * uGrain;

      gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
    }`,
};
