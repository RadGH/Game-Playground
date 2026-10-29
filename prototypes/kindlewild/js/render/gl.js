// WebGL2 renderer: uploads the CPU frame (colour, glow, relief) and lights it.
//
//   glow  -> blurred twice (a tight halo and a wide wash) = the coloured light field
//   relief-> normals, lit by a sun that moves with the clock (long soft shading at dawn/dusk)
//   final -> albedo * (ambient * relief + light) + self glow + bloom, water shimmer, lava pulse,
//            drifting cloud shadows by day, sky flash for lightning, vignette, tone curve
// Falls back to a plain 2D canvas (no lights) where WebGL2 is missing.

const VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const BLUR = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 dir;      // texel step
uniform vec2 size;     // output size
uniform float gain;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / size;
  vec3 s = texture(src, uv).rgb * 0.227;
  s += texture(src, uv + dir * 1.385).rgb * 0.316;
  s += texture(src, uv - dir * 1.385).rgb * 0.316;
  s += texture(src, uv + dir * 3.23).rgb * 0.07;
  s += texture(src, uv - dir * 3.23).rgb * 0.07;
  o = vec4(s * gain, 1.0);
}`;

const FINAL = `#version 300 es
precision highp float;
uniform sampler2D colorT, emitT, reliefT, lightA, lightB;
uniform vec2 world;       // W, H in cells
uniform vec2 screen;      // canvas size in device px
uniform vec2 cam;         // world point at screen centre
uniform float zoom;       // device px per cell
uniform vec3 ambient;     // sky light colour * strength
uniform vec3 sun;         // sun direction (x, y, up)
uniform float sunAmt;
uniform float time;
uniform float flash;
uniform float day;
uniform vec2 shakeOff;
uniform vec4 lights[40]; // x, y, radius, intensity
uniform vec3 lightCol[40];
uniform int nLights;
uniform vec4 cursor;      // x, y, radius, show
uniform vec3 cursorCol;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 fc = vec2(gl_FragCoord.x, screen.y - gl_FragCoord.y);
  vec2 wp = (fc - screen * 0.5) / zoom + cam + shakeOff;
  if (wp.x < 0.0 || wp.y < 0.0 || wp.x >= world.x || wp.y >= world.y) {
    // outside the realm: a dark starry void
    float st = step(0.995, hash(floor(fc / 3.0)));
    vec3 bg = vec3(0.035, 0.03, 0.06) + st * 0.25 * vec3(0.8, 0.8, 1.0);
    vec2 e = clamp(wp, vec2(0.0), world) - wp;
    float edge = exp(-length(e) * 0.25);
    o = vec4(bg + edge * vec3(0.05, 0.03, 0.09), 1.0);
    return;
  }
  vec2 uv = wp / world;
  vec2 cell = floor(wp);
  vec2 cuv = (cell + 0.5) / world;
  vec4 c = texture(colorT, cuv);
  vec3 albedo = c.rgb;
  float cls = floor(c.a * 255.0 / 40.0 + 0.5);
  // relief (smooth, so slopes read as hills; tall things get a crisp edge from the nearest sample)
  vec2 tx = 1.0 / world;
  // lighting per CELL (sampled at cell centres): crisp pixel shading instead of a soft blur
  float hC = texture(reliefT, cuv).r;
  float hL = texture(reliefT, cuv - vec2(tx.x, 0.0)).r, hR = texture(reliefT, cuv + vec2(tx.x, 0.0)).r;
  float hU = texture(reliefT, cuv - vec2(0.0, tx.y)).r, hD = texture(reliefT, cuv + vec2(0.0, tx.y)).r;
  vec3 n = normalize(vec3((hL - hR) * 60.0, (hU - hD) * 60.0, 1.0));
  float lit = max(0.0, dot(n, normalize(sun)));
  float relief = mix(1.0, 0.45 + lit * 0.85, sunAmt);
  // cast shadow: a cheap look toward the sun for something taller
  float sh = 0.0;
  vec2 sdir = normalize(sun.xy + 1e-4) * tx;
  for (int k = 1; k <= 4; k++) {
    vec2 sc = (floor(wp + normalize(sun.xy + 1e-4) * float(k) * 1.4) + 0.5) / world;
    float hs = texture(reliefT, sc).r;
    sh = max(sh, (hs - hC) * 255.0 - float(k) * 1.3);
  }
  relief *= 1.0 - clamp(sh * 0.12, 0.0, 0.45) * sunAmt;
  // cloud shadows by day
  float cl = vnoise(cell * 0.025 + vec2(time * 0.012, time * 0.006));
  relief *= 1.0 - smoothstep(0.58, 0.8, cl) * 0.12 * day;

  vec3 la = texture(lightA, uv).rgb;
  vec3 lb = texture(lightB, uv).rgb;
  vec3 light = (la * 7.2 + lb * 12.0) * mix(1.0, 0.45, day);
  float pday = mix(1.0, 0.4, day);
  for (int k = 0; k < 40; k++) {
    if (k >= nLights) break;
    vec2 d = wp - lights[k].xy;
    float f = max(0.0, 1.0 - length(d) / lights[k].z);
    light += lightCol[k] * f * f * lights[k].w * pday;
  }
  vec3 self = texture(emitT, cuv).rgb;
  vec3 col = albedo * (ambient * relief + light);

  if (cls == 1.0 || cls == 5.0) {
    // water: ripples, sun glints, a little sky reflection
    float rp = vnoise(wp * 0.45 + vec2(time * 0.6, time * 0.35)) * vnoise(wp * 0.3 - vec2(time * 0.25, -time * 0.4));
    col += vec3(0.18, 0.24, 0.3) * smoothstep(0.32, 0.6, rp) * (0.25 + day * 0.6);
    col += vec3(1.0) * step(0.985, hash(cell + floor(time * 2.0))) * 0.5 * day;
    col += light * 0.25;
  } else if (cls == 2.0) {
    float pulse = vnoise(wp * 0.35 + vec2(time * 0.8, -time * 0.5));
    col = albedo * (0.55 + pulse * 0.45) + light * 0.08;
    self *= 0.35;   // lava lights its banks, not itself into a white sheet
  } else if (cls == 3.0) {
    col += vec3(1.0) * step(0.97, hash(cell + floor(time * 1.5))) * 0.4;
  } else if (cls == 6.0) {
    col = max(col, albedo * 0.9);
  }
  col += self * mix(2.6, 1.1, day);
  col += (lb * 4.4 + la * 2.2) * mix(1.0, 0.3, day);   // bloom
  col += flash * vec3(0.55, 0.6, 0.75);
  // cursor ring
  if (cursor.w > 0.0) {
    float dd = abs(length(wp - cursor.xy) - cursor.z);
    float ring = smoothstep(1.2 / zoom * 2.0 + 0.35, 0.0, dd);
    col = mix(col, cursorCol, ring * 0.8 * cursor.w);
  }
  // tone curve + vignette
  col = vec3(1.0) - exp(-col * 1.55);     // exposure: bright things keep their colour instead of going white
  vec2 q = fc / screen - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  o = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.95)), 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
function tex(gl, w, h, fmt, filter, data) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const [ifmt, f, type] = fmt === 'r8' ? [gl.R8, gl.RED, gl.UNSIGNED_BYTE] : fmt === 'rgba16f' ? [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, f, type, data || null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) return createFallback(canvas);
  const hdr = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const fmt = hdr ? 'rgba16f' : 'rgba8';
  let W = 0, H = 0, colorT, emitT, reliefT, A1, A2, B1, B2, aw, ah, bw, bh;
  const owned = [];
  const mk = (w, h) => { const t = tex(gl, w, h, fmt, gl.LINEAR); const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); owned.push(t, fb); return { t, fb, w, h }; };
  function setWorld(w, h) {
    if (w === W && h === H) return;
    for (const o of owned) (o instanceof WebGLTexture ? gl.deleteTexture(o) : gl.deleteFramebuffer(o));
    owned.length = 0;
    W = w; H = h;
    colorT = tex(gl, W, H, 'rgba8', gl.NEAREST); emitT = tex(gl, W, H, 'rgba8', gl.LINEAR); reliefT = tex(gl, W, H, 'r8', gl.LINEAR);
    owned.push(colorT, emitT, reliefT);
    aw = Math.ceil(W / 2); ah = Math.ceil(H / 2); bw = Math.ceil(W / 8); bh = Math.ceil(H / 8);
    A1 = mk(aw, ah); A2 = mk(aw, ah); B1 = mk(bw, bh); B2 = mk(bw, bh);
  }
  const blur = program(gl, BLUR);
  const fin = program(gl, FINAL);
  const vao = gl.createVertexArray();
  const lightBuf = new Float32Array(40 * 4), lightColBuf = new Float32Array(40 * 3);

  function pass(target, src, dx, dy, gain) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(blur.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(blur.u.src, 0);
    gl.uniform2f(blur.u.dir, dx, dy);
    gl.uniform2f(blur.u.size, target.w, target.h);
    gl.uniform1f(blur.u.gain, gain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    kind: 'webgl2',
    gl,
    setWorld,
    /** Wait until the GPU has finished the frame (a 1-pixel read back): the speed readout times it. */
    sync() { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); },
    info() {
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return { kind: 'webgl2', gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: d ? gl.getParameter(d.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), halfFloatLight: hdr, lost: gl.isContextLost() };
    },
    draw(frame, view) {
      if (!W) return;
      gl.bindVertexArray(vao);
      if (frame.dirty !== false) {
        frame.dirty = false;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, colorT);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, frame.color);
        gl.bindTexture(gl.TEXTURE_2D, emitT);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, frame.emit);
        gl.bindTexture(gl.TEXTURE_2D, reliefT);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RED, gl.UNSIGNED_BYTE, frame.relief);
        // light field: tight halo (half res), wide wash (eighth res)
        pass(A1, emitT, 1 / W, 0, 1);
        pass(A2, A1.t, 0, 1 / ah, 1);
        pass(A1, A2.t, 2 / aw, 0, 1);
        pass(A2, A1.t, 0, 2 / ah, 1);
        pass(B1, A2.t, 1 / aw, 0, 1);
        pass(B2, B1.t, 0, 1 / bh, 1);
        pass(B1, B2.t, 2 / bw, 0, 1);
        pass(B2, B1.t, 0, 2 / bh, 1);
      }
      // final
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(fin.p);
      const U = fin.u;
      const bind = (unit, t, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U[name], unit); };
      bind(0, colorT, 'colorT'); bind(1, emitT, 'emitT'); bind(2, reliefT, 'reliefT'); bind(3, A2.t, 'lightA'); bind(4, B2.t, 'lightB');
      gl.uniform2f(U.world, W, H);
      gl.uniform2f(U.screen, canvas.width, canvas.height);
      gl.uniform2f(U.cam, view.x, view.y);
      gl.uniform1f(U.zoom, view.zoom);
      gl.uniform3fv(U.ambient, view.ambient);
      gl.uniform3fv(U.sun, view.sun);
      gl.uniform1f(U.sunAmt, view.sunAmt);
      gl.uniform1f(U.time, view.time);
      gl.uniform1f(U.flash, view.flash);
      gl.uniform1f(U.day, view.day);
      gl.uniform2f(U.shakeOff, view.shakeX || 0, view.shakeY || 0);
      const L = view.lights || [];
      const n = Math.min(40, L.length);
      for (let k = 0; k < n; k++) {
        const l = L[k];
        const a = l.ttl / l.max;
        lightBuf[k * 4] = l.x; lightBuf[k * 4 + 1] = l.y; lightBuf[k * 4 + 2] = l.rad; lightBuf[k * 4 + 3] = a * (l.power ?? 1.6);
        lightColBuf[k * 3] = l.r / 255; lightColBuf[k * 3 + 1] = l.g / 255; lightColBuf[k * 3 + 2] = l.b / 255;
      }
      gl.uniform4fv(U.lights, lightBuf);
      gl.uniform3fv(U.lightCol, lightColBuf);
      gl.uniform1i(U.nLights, n);
      const c = view.cursor;
      gl.uniform4f(U.cursor, c ? c.x : 0, c ? c.y : 0, c ? c.r : 0, c ? 1 : 0);
      gl.uniform3fv(U.cursorCol, c?.color || [1, 1, 1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    resize(w, h) { canvas.width = w; canvas.height = h; },
  };
}

function createFallback(canvas) {
  const ctx = canvas.getContext('2d');
  const off = document.createElement('canvas');
  let W = 0, H = 0, octx, img;
  return {
    kind: '2d',
    setWorld(w, h) { W = w; H = h; off.width = W; off.height = H; octx = off.getContext('2d'); img = octx.createImageData(W, H); },
    draw(frame, view) {
      if (!W) return;
      const d = img.data;
      const k = 0.35 + view.day * 0.65;
      for (let i = 0; i < W * H * 4; i += 4) {
        d[i] = Math.min(255, frame.color[i] * k + frame.emit[i]);
        d[i + 1] = Math.min(255, frame.color[i + 1] * k + frame.emit[i + 1]);
        d[i + 2] = Math.min(255, frame.color[i + 2] * k + frame.emit[i + 2]);
        d[i + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#09070f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(view.zoom, 0, 0, view.zoom, canvas.width / 2 - view.x * view.zoom, canvas.height / 2 - view.y * view.zoom);
      ctx.drawImage(off, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    resize(w, h) { canvas.width = w; canvas.height = h; },
  };
}
