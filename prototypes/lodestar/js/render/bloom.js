// Bloom (PLAN M1): the brightest pixels (fire cores, lava, flashes) bleed into the glass before the
// CRT pass. A bright pass at half resolution keeps only what is above `threshold`, then the shared
// dual-filter blur spreads it.

import { program, target, freeTarget, bindTarget, bindTex, fullscreen, createBlurChain, FULLSCREEN_VS } from './gl.js';

export function createBloom(gl, hdr) {
  const bright = program(gl, FULLSCREEN_VS, `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uOut; uniform float uThreshold; out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec3 c = texture(uSrc, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
  o = vec4(c * k, 1.0);
}`);
  const blur = createBlurChain(gl, hdr);
  let half = null;
  function render(sceneTex, w, h, threshold = 0.95) {
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    if (!half || half.w !== hw || half.h !== hh) { freeTarget(gl, half); half = target(gl, hw, hh, hdr); }
    bindTarget(gl, half);
    bright.use();
    bindTex(gl, 0, sceneTex);
    gl.uniform1i(bright.u.uSrc, 0);
    gl.uniform2f(bright.u.uOut, hw, hh);
    gl.uniform1f(bright.u.uThreshold, hdr ? threshold : threshold * 0.8);
    fullscreen(gl);
    return blur.run(half.tex, hw, hh, 4, 0.8);
  }
  return { render };
}
