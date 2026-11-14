// WebGL2 post pass: takes the 2D scene canvas + a low-res coloured light canvas and makes the final frame:
//   lit = scene * (ambient + light)  +  bloom(scene + light)  with shockwave ripples bending the picture
//   and a touch of colour split at each ripple, then a vignette.
// If WebGL2 is not available, createPost() returns null and the caller shows the scene canvas directly.

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS_BRIGHT = `#version 300 es
precision mediump float; in vec2 uv; out vec4 o;
uniform sampler2D scene; uniform sampler2D light; uniform float thresh;
void main(){
  vec3 c = texture(scene, uv).rgb; vec3 l = texture(light, uv).rgb;
  float b = max(max(c.r, c.g), c.b);
  vec3 hot = c * smoothstep(thresh, 1.0, b) + l * 0.35;
  o = vec4(hot, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision mediump float; in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 dir;
void main(){
  vec3 s = texture(src, uv).rgb * 0.227;
  s += texture(src, uv + dir * 1.385).rgb * 0.316; s += texture(src, uv - dir * 1.385).rgb * 0.316;
  s += texture(src, uv + dir * 3.231).rgb * 0.070; s += texture(src, uv - dir * 3.231).rgb * 0.070;
  o = vec4(s, 1.0);
}`;

const FS_FINAL = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D scene; uniform sampler2D light; uniform sampler2D bloom;
uniform vec4 waves[16]; uniform vec2 wavesT[16]; uniform int nWaves; uniform vec2 aspect;
uniform float ambient; uniform float bloomK; uniform float flash; uniform vec3 flashC; uniform float vig;
uniform float boost; uniform vec2 boostC; uniform float hurt;
void main(){
  vec2 p = uv; vec2 off = vec2(0.0); float split = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= nWaves) break;
    vec4 wv = waves[i];            // x, y (uv), radius (uv of height), strength
    vec2 d = (p - wv.xy) * aspect;
    float r = length(d);
    float th = wavesT[i].x;
    float x = (r - wv.z) / th;
    if (abs(x) < 1.0) {
      float k = (1.0 - x * x); k = k * k * wv.w * sign(-x + 0.3);
      off += normalize(d + 1e-6) / aspect * k * th;
      split += abs(k) * 6.0;
    }
  }
  vec2 q = p + off;
  vec3 c;
  c.r = texture(scene, q + off * split * 0.6).r;
  c.g = texture(scene, q).g;
  c.b = texture(scene, q - off * split * 0.6).b;
  // boost: a light radial (zoom) blur streaking out from the ship, stronger toward the screen edges, plus colour split
  if (boost > 0.01) {
    vec2 dir = (q - boostC); float edge = smoothstep(0.08, 0.6, length(dir * aspect));
    vec2 st = dir * boost * 0.022 * edge;
    vec3 acc = c;
    acc.r += texture(scene, q - st * 1.0 + st * 0.35).r; acc.g += texture(scene, q - st * 1.0).g; acc.b += texture(scene, q - st * 1.0 - st * 0.35).b;
    acc += texture(scene, q - st * 2.0).rgb;
    acc += texture(scene, q - st * 3.0).rgb;
    c = acc / 4.0;
  }
  vec3 l = texture(light, q).rgb;
  vec3 b = texture(bloom, q).rgb;
  vec3 lit = c * (ambient + l * 1.1) + b * bloomK + l * 0.08;
  lit += flashC * flash;
  // gentle filmic curve so hot colours roll off instead of clipping
  lit = lit / (1.0 + lit * 0.18);
  vec2 v = uv - 0.5; float vg = 1.0 - dot(v, v) * vig;
  // hurt: your hull just took a heavy hit — the screen edges pulse red for a moment (fx.hurt, fades in ~0.5 s)
  if (hurt > 0.01) { float e = smoothstep(0.12, 0.5, length(v * aspect * 0.8)); lit = mix(lit, lit * vec3(1.0, 0.45, 0.4) + vec3(0.35, 0.02, 0.0), e * hurt * 0.55); }
  o = vec4(lit * vg, 1.0);
}`;

function shader(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
function tex(gl, linear = true) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function fbo(gl, w, h) {
  const t = tex(gl); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return { t, f, w, h };
}

export function createPost(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  let bright, blur, fin;
  try { bright = program(gl, FS_BRIGHT); blur = program(gl, FS_BLUR); fin = program(gl, FS_FINAL); } catch (e) { console.warn('[voidwright] post shaders failed', e); return null; }
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const sceneT = tex(gl), lightT = tex(gl);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  let A = null, B = null, size = [0, 0];
  const waves = new Float32Array(64), wavesT = new Float32Array(32);

  function ensure(w, h) {
    if (size[0] === w && size[1] === h) return;
    size = [w, h];
    const bw = Math.max(16, w >> 2), bh = Math.max(16, h >> 2);
    A = fbo(gl, bw, bh); B = fbo(gl, bw, bh);
  }
  const draw = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  return {
    gl,
    /**
     * @param scene  2D canvas (full res)   @param light 2D canvas (any res)
     * @param opts { waves: [{x,y,r,s,th}] in uv, ambient, bloom, flash, flashColor:[r,g,b], vignette, hurt (0..1 red edge pulse) }
     */
    render(scene, light, opts = {}) {
      const W = canvas.width, H = canvas.height; ensure(W, H);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lightT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, light);
      // bright pass → A
      gl.useProgram(bright.p); gl.bindFramebuffer(gl.FRAMEBUFFER, A.f); gl.viewport(0, 0, A.w, A.h);
      gl.uniform1i(bright.u.scene, 0); gl.uniform1i(bright.u.light, 1); gl.uniform1f(bright.u.thresh, opts.thresh ?? 0.62);
      draw();
      // blur A↔B twice
      gl.useProgram(blur.p); gl.uniform1i(blur.u.src, 2);
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, B.f); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, A.t);
        gl.uniform2f(blur.u.dir, (1 + i) / A.w, 0); draw();
        gl.bindFramebuffer(gl.FRAMEBUFFER, A.f); gl.bindTexture(gl.TEXTURE_2D, B.t);
        gl.uniform2f(blur.u.dir, 0, (1 + i) / A.h); draw();
      }
      // final
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
      gl.useProgram(fin.p);
      gl.uniform1i(fin.u.scene, 0); gl.uniform1i(fin.u.light, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, A.t); gl.uniform1i(fin.u.bloom, 2);
      const ws = opts.waves || []; const n = Math.min(16, ws.length);
      for (let i = 0; i < n; i++) { const v = ws[i]; waves.set([v.x, v.y, v.r, v.s], i * 4); wavesT.set([v.th, 0], i * 2); }
      gl.uniform4fv(fin.u.waves, waves); gl.uniform2fv(fin.u.wavesT, wavesT); gl.uniform1i(fin.u.nWaves, n);
      gl.uniform2f(fin.u.aspect, W / H, 1);
      gl.uniform1f(fin.u.ambient, opts.ambient ?? 0.82); gl.uniform1f(fin.u.bloomK, opts.bloom ?? 1.0);
      gl.uniform1f(fin.u.flash, opts.flash || 0); gl.uniform3fv(fin.u.flashC, opts.flashColor || [1, 0.8, 0.6]);
      gl.uniform1f(fin.u.vig, opts.vignette ?? 0.9);
      gl.uniform1f(fin.u.hurt, opts.hurt || 0);
      gl.uniform1f(fin.u.boost, opts.boost || 0); gl.uniform2fv(fin.u.boostC, opts.boostC || [0.5, 0.5]);
      draw();
    },
  };
}
