// Final pass (PLAN M1): tone map + bloom + the CRT look of the Tactical Scope's glass.
//
// CRT on: slight barrel curve, scan lines, a faint aperture mask, vignette, grain, and (High
// quality) phosphor afterglow — last frame's picture fading under this one. CRT off: a clean picture,
// pixel for pixel, which is what the drawn == measured test reads.

import { program, target, freeTarget, bindTarget, bindTex, fullscreen, FULLSCREEN_VS } from './gl.js';

export function createCrt(gl) {
  const fin = program(gl, FULLSCREEN_VS, `#version 300 es
precision highp float;
uniform sampler2D uScene; uniform sampler2D uBloom; uniform sampler2D uPrev;
uniform vec2 uRes; uniform float uTime; uniform int uCrt; uniform float uBloomI; uniform float uAfter; uniform float uExposure;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 tone(vec3 c) {
  c *= uExposure;
  // identity below 0.75, then rolls off toward white (fire cores bleach instead of clipping)
  vec3 hi = 0.75 + 0.25 * (1.0 - exp(-(c - 0.75) * 3.2));
  vec3 t = mix(c, hi, step(0.75, c));
  float l = max(t.r, max(t.g, t.b));
  return mix(t, vec3(min(l, 1.0)), clamp((l - 1.0) * 0.6, 0.0, 0.5));
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cuv = uv;
  if (uCrt == 1) {
    vec2 d = uv - 0.5;
    cuv = uv + d * dot(d, d) * 0.09;
    if (cuv.x < 0.0 || cuv.y < 0.0 || cuv.x > 1.0 || cuv.y > 1.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  }
  vec3 c = texture(uScene, cuv).rgb;
  if (uBloomI > 0.0) c += texture(uBloom, cuv).rgb * uBloomI;
  c = tone(c);
  if (uCrt == 1) {
    float scan = 0.88 + 0.12 * sin(gl_FragCoord.y * 3.14159 * 0.5);
    float mask = 0.95 + 0.05 * sin(gl_FragCoord.x * 2.094);
    vec2 d = cuv - 0.5;
    float vig = 1.0 - dot(d, d) * 0.85;
    float grain = (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.035;
    c = c * scan * mask * vig + grain;
    c = mix(c, c * vec3(0.92, 1.04, 0.96), 0.35);
  }
  if (uAfter > 0.0) {
    vec3 p = texture(uPrev, uv).rgb;
    c = max(c, p * uAfter);
  }
  o = vec4(c, 1.0);
}`);
  const blit = program(gl, FULLSCREEN_VS, `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uRes; out vec4 o;
void main() { o = texture(uSrc, gl_FragCoord.xy / uRes); }`);
  let ping = null, pong = null;

  /** Draw to the canvas. afterglow 0 = off. */
  function render(sceneTex, bloomTex, w, h, time, { crt, bloom, afterglow, exposure = 1 }) {
    const useAfter = afterglow > 0;
    if (useAfter && (!ping || ping.w !== w || ping.h !== h)) {
      freeTarget(gl, ping); freeTarget(gl, pong);
      ping = target(gl, w, h, false); pong = target(gl, w, h, false);
    }
    fin.use();
    bindTex(gl, 0, sceneTex);
    bindTex(gl, 1, bloomTex || sceneTex);
    bindTex(gl, 2, useAfter ? pong.tex : sceneTex);
    gl.uniform1i(fin.u.uScene, 0);
    gl.uniform1i(fin.u.uBloom, 1);
    gl.uniform1i(fin.u.uPrev, 2);
    gl.uniform2f(fin.u.uRes, w, h);
    gl.uniform1f(fin.u.uTime, time);
    gl.uniform1i(fin.u.uCrt, crt ? 1 : 0);
    gl.uniform1f(fin.u.uBloomI, bloom && bloomTex ? 0.85 : 0);
    gl.uniform1f(fin.u.uAfter, useAfter ? afterglow : 0);
    gl.uniform1f(fin.u.uExposure, exposure);
    if (useAfter) {
      bindTarget(gl, ping);
      fullscreen(gl);
      bindTarget(gl, null);
      blit.use();
      bindTex(gl, 0, ping.tex);
      gl.uniform1i(blit.u.uSrc, 0);
      gl.uniform2f(blit.u.uRes, w, h);
      fullscreen(gl);
      const t = ping; ping = pong; pong = t;
    } else {
      bindTarget(gl, null);
      fullscreen(gl);
    }
  }
  return { render };
}
