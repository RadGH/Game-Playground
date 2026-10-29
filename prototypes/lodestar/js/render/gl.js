// Small raw-WebGL2 helpers for the scope renderer: shader programs, render targets, a fullscreen
// triangle. No three.js — this is a 2D pixel renderer (PLAN §1.1).

export const FULLSCREEN_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    throw new Error('shader compile failed: ' + log + '\n' + lines.slice(0, 4000));
  }
  return s;
}

/** Build a program; returns { prog, u: {name: location}, use() }. */
export function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link failed: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { prog: p, u, use() { gl.useProgram(p); return this; } };
}

/** Float render targets if the device can render into them; else 8-bit. */
export function floatSupport(gl) {
  const f = gl.getExtension('EXT_color_buffer_float');
  const h = f ? null : gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  return !!(f || h);
}

/** A colour render target with a linear-filtered texture. */
export function target(gl, w, h, hdr) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE7); // scratch unit: never disturb a unit a pass is sampling
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok && hdr) { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); return target(gl, w, h, false); }
  return { tex, fbo, w, h, hdr: hdr && ok };
}

export function freeTarget(gl, t) {
  if (!t) return;
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fbo);
}

export function bindTarget(gl, t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
  if (t) gl.viewport(0, 0, t.w, t.h);
  else gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

export function bindTex(gl, unit, tex) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
}

/** Draw the fullscreen triangle with the current program. */
export function fullscreen(gl) { gl.drawArrays(gl.TRIANGLES, 0, 3); }

/**
 * Dual-filter (Kawase) blur chain. Returns { run(srcTex, w, h, levels) → texture of the SUM of all
 * blur scales at full size, resize(w, h) }. Each level halves the size; on the way up every level
 * is added back in, so the result is a soft glow with a long tail.
 */
export function createBlurChain(gl, hdr) {
  const down = program(gl, FULLSCREEN_VS, `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uTexel; out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel * 2.0;
  vec2 h = uTexel;
  vec4 s = texture(uSrc, uv) * 4.0;
  s += texture(uSrc, uv - h); s += texture(uSrc, uv + h);
  s += texture(uSrc, uv + vec2(h.x, -h.y)); s += texture(uSrc, uv - vec2(h.x, -h.y));
  o = s / 8.0;
}`);
  const up = program(gl, FULLSCREEN_VS, `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform sampler2D uAdd; uniform vec2 uTexel; uniform vec2 uOut; uniform float uAddW; uniform float uGain; out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec2 h = uTexel * 0.5;
  vec4 s = texture(uSrc, uv + vec2(-h.x * 2.0, 0.0));
  s += texture(uSrc, uv + vec2(-h.x, h.y)) * 2.0;
  s += texture(uSrc, uv + vec2(0.0, h.y * 2.0));
  s += texture(uSrc, uv + vec2(h.x, h.y)) * 2.0;
  s += texture(uSrc, uv + vec2(h.x * 2.0, 0.0));
  s += texture(uSrc, uv + vec2(h.x, -h.y)) * 2.0;
  s += texture(uSrc, uv + vec2(0.0, -h.y * 2.0));
  s += texture(uSrc, uv + vec2(-h.x, -h.y)) * 2.0;
  o = s / 12.0 * uGain + texture(uAdd, uv) * uAddW;
}`);
  let levels = [], ups = [], W = 0, H = 0, N = 0;
  function resize(w, h, n) {
    if (w === W && h === H && n === N) return;
    for (const t of levels) freeTarget(gl, t);
    for (const t of ups) freeTarget(gl, t);
    levels = []; ups = [];
    W = w; H = h; N = n;
    let cw = w, ch = h;
    for (let i = 0; i < n; i++) {
      cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
      levels.push(target(gl, cw, ch, hdr));
    }
    cw = w; ch = h;
    for (let i = 0; i < n; i++) {
      ups.push(target(gl, cw, ch, hdr));
      cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1);
    }
  }
  /**
   * Blur src (w x h). addW: weight of each finer level added on the way up. gain: how much each
   * coarser level is boosted on the way up — 1 keeps a soft glow; ~3 turns a small bright source
   * into a wide pool of light (a coarse texel averages a source over 4x the area, so it needs the
   * boost to reach far).
   */
  function run(srcTex, w, h, n, addW = 1, gain = 1) {
    resize(w, h, n);
    down.use();
    let prev = srcTex, pw = w, ph = h;
    for (let i = 0; i < n; i++) {
      const t = levels[i];
      bindTarget(gl, t);
      bindTex(gl, 0, prev);
      gl.uniform1i(down.u.uSrc, 0);
      gl.uniform2f(down.u.uTexel, 1 / pw, 1 / ph);
      fullscreen(gl);
      prev = t.tex; pw = t.w; ph = t.h;
    }
    up.use();
    for (let i = n - 1; i >= 0; i--) {
      const out = ups[i];
      const add = i === 0 ? srcTex : levels[i - 1].tex;
      bindTarget(gl, out);
      bindTex(gl, 0, prev);
      bindTex(gl, 1, add);
      gl.uniform1i(up.u.uSrc, 0);
      gl.uniform1i(up.u.uAdd, 1);
      gl.uniform2f(up.u.uTexel, 1 / pw, 1 / ph);
      gl.uniform2f(up.u.uOut, out.w, out.h);
      gl.uniform1f(up.u.uAddW, addW);
      gl.uniform1f(up.u.uGain, gain);
      fullscreen(gl);
      prev = out.tex; pw = out.w; ph = out.h;
    }
    return prev;
  }
  return { run, resize };
}
