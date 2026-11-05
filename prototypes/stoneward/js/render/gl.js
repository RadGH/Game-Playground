// WebGL2 renderer: the macro map underneath, painted chunks on top, and the globe when zoomed out.
//
// Zoom is `ppc`, screen pixels per cell. Three views share one camera (centre x, y in cells):
//   * chunk view  — one textured quad per painted chunk (js/render/paint.js), drawn north → south so
//                   the 3/4 overhangs occlude correctly;
//   * macro view  — one full-screen pass that reads the macro textures with a jittered lookup, so a
//                   32 m biome square has a ragged edge; it is ALWAYS drawn first, which means a chunk
//                   that has not arrived yet shows its biome instead of a hole;
//   * globe       — a full-screen ray/sphere pass sampling the same macro textures, sized so the
//                   globe's circumference equals the flat map's width at the moment it fades in.
// The x wrap: every chunk is drawn at the copy nearest the camera (wrapDelta), and the macro/globe
// passes wrap in the shader.
//
// DEPTH (play-test 2: "people walk in front of buildings, multi-tile-high buildings should stay in
// front"). The chunk painter stores, in each colour pixel's alpha, the cell ROW of whatever STANDING
// thing painted it (js/render/paint.js: 160 + row; 255 = flat ground). The chunk pass turns that into
// gl_FragDepth (further south = nearer the viewer; ground = far) while keeping painter's order (depth
// func ALWAYS). Then sprites:
//
//   view.sprites = [[x, y, w, h, r, g, b, a, foot?], …]      (cells; x already the copy near the camera)
//
// A quad WITH a 9th element `foot` (the world y, in cells, where the thing stands — a person's or a
// unit's y) is depth-tested at that row: any pixel painted by a building, wall or tree standing on a
// row SOUTH of the foot (row > foot) hides it, so someone walking behind a house is hidden by its front
// face and someone in front of it is drawn over it. Flat ground never hides a sprite. A quad WITHOUT a
// foot is drawn on top of everything, as before. Overlay and screen quads ignore depth.

const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
uniform vec4 uRect;   // x, y, w, h in clip space for quads; (−1,−1,2,2) for full screen
void main(){ vUv = aPos; gl_Position = vec4(uRect.xy + aPos * uRect.zw, 0.0, 1.0); }`;

const FS_QUAD = `#version 300 es
precision mediump float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uAlpha; uniform vec3 uTint; uniform float uWin;
void main(){ vec4 c = texture(uTex, vec2(vUv.x, 1.0 - vUv.y)); if (c.a < 0.01) discard; float a = c.a; if (a < 0.6) { c.rgb *= uWin; a = 1.0; } o = vec4(c.rgb * uTint, a * uAlpha); }`;

// shared: colour of the planet at a macro coordinate (cells/macroCell). The macro map is coarse (one
// texel = 32 m: a Small world is 128 texels around), so the detail is made up per PIXEL, the same
// every frame and wrapping with the planet (play-test 2: "the planet view looks incredibly low
// resolution and blurry"):
//   * uField (LINEAR) carries r = elevation, g = water (sea + lakes), b = rivers, a = good sites;
//     sea vs land is decided per pixel from the smooth water field plus fbm, so coasts are ragged
//     and detailed instead of 32 m squares;
//   * the biome lookup is domain-warped (fbm), so biome borders are organic;
//   * fine fbm speckle and hill shade on top; octaves finer than a pixel fade out (fw = macro cells
//     per pixel), so nothing shimmers when zoomed out.
// Noise is periodic in x (period = the planet), so there is no seam where the map wraps.
const MACRO_FN = `
uniform sampler2D uBiome; uniform sampler2D uField; uniform vec2 uMacro; // mw, mh
uniform float uShowSites; uniform float uSea;
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p, float px){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float x0 = mod(i.x, px), x1 = mod(i.x + 1.0, px);
  return mix(mix(h12(vec2(x0, i.y)), h12(vec2(x1, i.y)), f.x), mix(h12(vec2(x0, i.y + 1.0)), h12(vec2(x1, i.y + 1.0)), f.x), f.y); }
float fbm(vec2 m, float f, int n, float fw){
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { if (k >= n) break; float vis = clamp(1.6 - fw * f * 1.6, 0.0, 1.0); s += a * vis * (vn(m * f, uMacro.x * f) - 0.5); f *= 2.0; a *= 0.5; }
  return s; }
vec3 seaCol(float depth){
  vec3 c = vec3(70.0 - depth * 46.0, 150.0 - depth * 92.0, 196.0 - depth * 92.0) / 255.0;
  if (depth < 0.12) c += vec3(18.0, 14.0, 6.0) / 255.0;
  return c; }
vec3 planet(vec2 m, float fw){      // m = macro coords, x may be any value (wraps); fw = macro cells per pixel
  vec2 w = vec2(fbm(m, 1.0, 3, fw), fbm(m + vec2(37.0, 11.0), 1.0, 3, fw)) * 1.5;
  vec2 mb = m + w + vec2(fbm(m, 8.0, 2, fw), fbm(m + vec2(5.0, 3.0), 8.0, 2, fw)) * 0.5;
  vec2 q = vec2(mod(mb.x, uMacro.x), clamp(mb.y, 0.0, uMacro.y - 0.01));
  vec4 bio = texelFetch(uBiome, ivec2(q), 0);
  vec2 mf = m + w * 0.35;
  vec2 uv = vec2(mf.x / uMacro.x, clamp(mf.y / uMacro.y, 0.0, 1.0));
  vec4 F = texture(uField, uv);
  // the water field softened over a texel (4 taps) so a coast is a curve, not a staircase of texels
  vec2 hx = vec2(0.5 / uMacro.x, 0.0), hy = vec2(0.0, 0.5 / uMacro.y);
  float wf = (texture(uField, uv + hx + hy).g + texture(uField, uv - hx + hy).g + texture(uField, uv + hx - hy).g + texture(uField, uv - hx - hy).g) * 0.25;
  float wet = mix(F.g, wf, 0.7) + fbm(m + vec2(13.0, 7.0), 2.0, 5, fw) * 0.9;
  vec3 sand = vec3(0.843, 0.769, 0.541);
  vec3 c;
  if (wet > 0.5) {
    // the same depth ramp the chunk painter uses, so loaded and unloaded sea match; a lighter
    // fringe along every coast
    float depth = clamp(1.1667 - F.r / uSea, 0.0, 1.0) * smoothstep(0.5, 0.9, wet);
    c = seaCol(depth);
    c *= 0.97 + 0.06 * vn(m * 6.0, uMacro.x * 6.0) * clamp(1.6 - fw * 6.0, 0.0, 1.0);
  } else {
    c = bio.a > 0.5 ? bio.rgb : sand;
    c = mix(c, sand, smoothstep(0.36, 0.5, wet) * 0.55);              // a beach along the water
    vec2 tx = vec2(0.6 / uMacro.x, 0.0), ty = vec2(0.0, 0.6 / uMacro.y);
    float e = F.r, ex = texture(uField, uv + tx).r, ey = texture(uField, uv + ty).r;
    c *= 1.0 + clamp((e - ex) * 12.0 + (e - ey) * 12.0, -0.3, 0.3);
    c *= 1.0 + fbm(m + vec2(3.0, 1.0), 4.0, 4, fw) * 0.45;          // speckle: woods, rocks, fields
    float rv = F.b + fbm(m + vec2(5.0, 9.0), 4.0, 2, fw) * 0.35;
    c = mix(c, vec3(0.25, 0.47, 0.72), smoothstep(0.5, 0.56, rv) * 0.9);
  }
  if (uShowSites > 0.5) c = mix(c, vec3(1.0, 0.85, 0.3), smoothstep(0.62, 0.8, F.a) * 0.55);
  return c;
}`;

const FS_MACRO = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uView; uniform vec2 uCam; uniform float uPpc; uniform float uCell; uniform float uAlpha;
${MACRO_FN}
void main(){
  vec2 px = (vUv - 0.5) * uView;                  // screen px from centre, y down
  px.y = -px.y;
  vec2 cell = uCam + px / uPpc;
  if (cell.y < 0.0 || cell.y > uMacro.y * uCell) { o = vec4(0.04,0.05,0.08,1.0); return; }
  vec2 m = cell / uCell;
  float fw = max(length(dFdx(m)), length(dFdy(m)));
  o = vec4(planet(m, fw), uAlpha);
}`;

const FS_GLOBE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uView; uniform float uR; uniform vec2 uLonLat; uniform vec3 uSun; uniform float uAlpha; uniform float uNight; uniform float uDark;
${MACRO_FN}
void main(){
  vec2 p = (vUv - 0.5) * uView; p.y = -p.y;      // y down on screen
  float d = length(p) / uR;
  vec3 bg = vec3(0.02, 0.025, 0.05) + vec3(0.25,0.4,0.7) * 0.25 * exp(-max(d - 1.0, 0.0) * 9.0) * step(1.0, d);
  if (d >= 1.0) { o = vec4(bg, uAlpha); return; }
  vec3 n = vec3(p.x / uR, -p.y / uR, sqrt(1.0 - d * d));   // y up, z toward viewer
  // rotate: tilt by latitude, then spin by longitude
  float cl = cos(uLonLat.y), sl = sin(uLonLat.y);
  vec3 a = vec3(n.x, n.y * cl - n.z * sl, n.y * sl + n.z * cl);
  float lon = atan(a.x, a.z) + uLonLat.x;
  float lat = asin(clamp(a.y, -1.0, 1.0));
  vec2 m = vec2(lon / 6.2831853 * uMacro.x, (0.5 - lat / 3.14159265) * uMacro.y);
  float fw = min(4.0, max(length(dFdx(m)), length(dFdy(m))));
  vec3 c = planet(m, fw);
  // the ice caps: a crisp ragged edge (no pole pinch: the cap covers the stretched texels)
  // edge noise from the point on the sphere, not from lon/lat (lon squeezes to spikes at the pole)
  vec2 pp = a.xz * 9.0 + 40.0;
  float en = (vn(pp, 1e6) - 0.5) * 0.6 + (vn(pp * 2.3, 1e6) - 0.5) * 0.3 + (vn(pp * 5.1, 1e6) - 0.5) * 0.15;
  float ice = smoothstep(-0.012, 0.012, abs(lat) - 1.25 + en * 0.22);
  c = mix(c, vec3(0.93, 0.96, 0.98) * (0.96 + 0.08 * vn(m * 6.0, uMacro.x * 6.0)), ice);
  // sun: fixed in screen space for now (upper left), dark side dimmed
  float lit = clamp(dot(n, normalize(uSun)) * 2.2 + 0.25, 0.0, 1.0);
  lit = mix(1.0, lit, uNight);
  c *= mix(0.18, 1.05, lit);
  c *= 1.0 - uDark;                                       // night in the sim: the whole face dims, town lights show
  c += vec3(0.3,0.5,0.9) * pow(1.0 - n.z, 3.0) * 0.45;   // atmosphere rim
  o = vec4(c, uAlpha);
}`;

const FS_BLUR = `#version 300 es
precision mediump float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec4 c = texture(uTex, vUv) * 0.227;
  c += (texture(uTex, vUv + uDir * 1.385) + texture(uTex, vUv - uDir * 1.385)) * 0.316;
  c += (texture(uTex, vUv + uDir * 3.231) + texture(uTex, vUv - uDir * 3.231)) * 0.070;
  o = c;
}`;

// scene x ambient (time of day + grade) + coloured light from glowing things + bloom
const FS_COMP = `#version 300 es
precision mediump float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uLight; uniform sampler2D uBloom;
uniform vec3 uAmbient; uniform float uNight; uniform float uBloomAmt;
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  vec3 l = texture(uLight, vUv).rgb;
  vec3 b = texture(uBloom, vUv).rgb;
  // light tints what it falls on toward its own colour (a green tree by firelight is orange-brown, not yellow)
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  vec3 lc = mix(c, vec3(lum) * 1.3, 0.55);
  vec3 lit = c * uAmbient + lc * l * (0.5 + 1.5 * uNight);
  lit += b * uBloomAmt * (0.25 + 0.6 * uNight);
  // a soft vignette
  vec2 d = vUv - 0.5; lit *= 1.0 - dot(d, d) * 0.35;
  o = vec4(lit, 1.0);
}`;

// coloured quads in CELL coordinates (people, ghosts, selection, lines): one dynamic buffer a frame
// depth of world row y: 0.5 at the camera's row, smaller = further south = nearer the viewer
const VS_SPR = `#version 300 es
precision highp float;
in vec2 aCell; in vec4 aCol; in float aFoot; out vec4 vCol;
uniform vec2 uCam; uniform float uPpc; uniform vec2 uView;
void main(){
  vec2 p = (aCell - uCam) * uPpc / (uView * 0.5);
  float d = aFoot < -1.0e8 ? 0.0 : clamp(0.5 - (aFoot - uCam.y) / 16384.0, 0.0001, 0.9999);
  gl_Position = vec4(p.x, -p.y, d * 2.0 - 1.0, 1.0); vCol = aCol; }`;
// chunk colour images: alpha carries the depth row (see the top of this file)
const FS_CHUNK = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uAlpha; uniform vec3 uTint; uniform float uY0; uniform float uCamY;
void main(){
  vec4 c = texture(uTex, vec2(vUv.x, 1.0 - vUv.y)); if (c.a < 0.01) discard;
  float a = floor(c.a * 255.0 + 0.5);
  if (a > 254.5) gl_FragDepth = 1.0;
  else gl_FragDepth = clamp(0.5 - (uY0 + (a - 160.0) - uCamY) / 16384.0, 0.0001, 0.9999);
  o = vec4(c.rgb * uTint, uAlpha); }`;
const FS_SPR = `#version 300 es
precision mediump float; in vec4 vCol; out vec4 o; void main(){ o = vCol; }`;

export function createRenderer(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, alpha: false, preserveDrawingBuffer: !!opts.preserve });
  if (!gl) throw new Error('This browser does not support WebGL2.');
  const prog = (fs) => {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let k = 0; k < n; k++) { const info = gl.getActiveUniform(p, k); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  };
  const sprP = (() => {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS_SPR], [gl.FRAGMENT_SHADER, FS_SPR]]) { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); }
    gl.bindAttribLocation(p, 1, 'aCell'); gl.bindAttribLocation(p, 2, 'aCol'); gl.bindAttribLocation(p, 3, 'aFoot'); gl.linkProgram(p);
    return { p, u: { uCam: gl.getUniformLocation(p, 'uCam'), uPpc: gl.getUniformLocation(p, 'uPpc'), uView: gl.getUniformLocation(p, 'uView') } };
  })();
  const sprVao = gl.createVertexArray(), sprBuf = gl.createBuffer();
  gl.bindVertexArray(sprVao); gl.bindBuffer(gl.ARRAY_BUFFER, sprBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 8);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 24);
  gl.bindVertexArray(null);
  let sprData = new Float32Array(6 * 7 * 4096);
  /** Draw quads: list of [x, y, w, h, r, g, b, a, foot?] in cells (x already the copy near the camera).
   *  `foot` (optional) = the world row the thing stands on, for the depth test (see the top). */
  function drawQuads(list, camX, camY, ppc, W, H) {
    if (!list.length) return;
    if (sprData.length < list.length * 42) sprData = new Float32Array(list.length * 42 * 2);
    let o = 0;
    for (const q of list) {
      const [x, y, w, h, r, g, b, a] = q, foot = q.length > 8 && q[8] != null ? q[8] : -2e9;
      for (const [vx, vy] of [[x, y], [x + w, y], [x, y + h], [x + w, y], [x + w, y + h], [x, y + h]]) {
        sprData[o++] = vx; sprData[o++] = vy; sprData[o++] = r; sprData[o++] = g; sprData[o++] = b; sprData[o++] = a; sprData[o++] = foot;
      }
    }
    gl.useProgram(sprP.p);
    gl.uniform2f(sprP.u.uCam, camX, camY); gl.uniform1f(sprP.u.uPpc, ppc); gl.uniform2f(sprP.u.uView, W, H);
    gl.bindVertexArray(sprVao); gl.bindBuffer(gl.ARRAY_BUFFER, sprBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sprData.subarray(0, o), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, o / 7);
    gl.bindVertexArray(vao);
  }

  const quad = prog(FS_QUAD), chunkP = prog(FS_CHUNK), macroP = prog(FS_MACRO), globeP = prog(FS_GLOBE), blurP = prog(FS_BLUR), compP = prog(FS_COMP);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const tex = (w, h, data, filter, fmt = gl.RGBA) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt === gl.RED ? gl.R8 : gl.RGBA8, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  let macro = null, biomeTex = null, fieldTex = null;
  const WATER_BIOMES = new Set([0, 1, 16]);      // deep sea, sea, lake (js/planet/biomes.js)
  /** Upload the macro map. biomeRgb: [[r,g,b], ...] per biome id. */
  function setMacro(m, biomeRgb) {
    macro = m;
    const N = m.mw * m.mh, col = new Uint8Array(N * 4), field = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      const [r, g, b] = biomeRgb[m.biome[i]];
      const wet = WATER_BIOMES.has(m.biome[i]) || m.elev[i] < m.sea;
      // biome colour + alpha 255 on land, 0 on water (rivers are drawn from the field, not the biome)
      col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = wet ? 0 : 255;
      field[i * 4] = Math.max(0, Math.min(255, Math.round(m.elev[i] / Math.max(m.top, 1e-6) * 255)));
      field[i * 4 + 1] = wet ? 255 : 0;
      field[i * 4 + 2] = m.river[i] ? 255 : 0;
      field[i * 4 + 3] = Math.round(m.site[i] * 255);
    }
    biomeTex = tex(m.mw, m.mh, col, gl.NEAREST);
    fieldTex = tex(m.mw, m.mh, field, gl.LINEAR);
  }

  // off-screen targets: the scene at full size, light at half, bloom ping-pong at quarter
  const targets = {};
  function target(name, w, h, depth = false) {
    let t = targets[name];
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); if (t.rb) gl.deleteRenderbuffer(t.rb); }
    const tx = tex(w, h, null, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
    let rb = null;
    if (depth) {
      rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (targets[name] = { tex: tx, fb, w, h, rb });
  }
  function bindTarget(t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null); gl.viewport(0, 0, t ? t.w : canvas.width, t ? t.h : canvas.height); }

  const chunkTex = new Map();      // key → { t, g }
  function setChunkImage(key, w, h, rgba) {
    let e = chunkTex.get(key);
    if (!e) { e = { t: tex(w, h, rgba, gl.NEAREST) }; chunkTex.set(key, e); return; }
    gl.bindTexture(gl.TEXTURE_2D, e.t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }
  function setChunkGlow(key, w, h, rgba) {
    const e = chunkTex.get(key); if (!e) return;
    let any = false; for (let k = 3; k < rgba.length; k += 4) if (rgba[k]) { any = true; break; }
    if (!any) { if (e.g) { gl.deleteTexture(e.g); e.g = null; } return; }
    if (!e.g) { e.g = tex(w, h, rgba, gl.NEAREST); return; }
    gl.bindTexture(gl.TEXTURE_2D, e.g); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }
  function dropChunk(key) { const e = chunkTex.get(key); if (e) { gl.deleteTexture(e.t); if (e.g) gl.deleteTexture(e.g); chunkTex.delete(key); } }

  function bindMacro(P) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, biomeTex); gl.uniform1i(P.u.uBiome, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fieldTex); gl.uniform1i(P.u.uField, 1);
    gl.uniform2f(P.u.uMacro, macro.mw, macro.mh);
    gl.uniform1f(P.u.uSea, macro.sea / Math.max(macro.top, 1e-6));
  }

  /**
   * Draw a frame. view = { cam: {x, y, ppc}, chunks: [{ key, gx, gy, w, h }] in draw order, globe: 0..1,
   *   sites: bool, night: 0..1, sun: [x,y,z] }
   */
  function draw(view) {
    const dpr = view.dpr || 1;
    const W = canvas.width, H = canvas.height;
    const lighting = view.lighting !== false && (view.globe || 0) < 1;
    const scene = lighting ? target('scene', W, H, true) : null;
    bindTarget(scene);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(true); gl.clearDepth(1);
    gl.clearColor(0.03, 0.035, 0.06, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!macro) { bindTarget(null); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    const { x: camX, y: camY } = view.cam;
    const ppc = view.cam.ppc * dpr;
    const globe = view.globe || 0;
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (globe < 1) {
      gl.useProgram(macroP.p); bindMacro(macroP);
      gl.uniform4f(macroP.u.uRect, -1, -1, 2, 2);
      gl.uniform2f(macroP.u.uView, W, H); gl.uniform2f(macroP.u.uCam, camX, camY);
      gl.uniform1f(macroP.u.uPpc, ppc); gl.uniform1f(macroP.u.uCell, macro.macroCell);
      gl.uniform1f(macroP.u.uAlpha, 1); gl.uniform1f(macroP.u.uShowSites, view.sites ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (view.chunks?.length) {
        // painter's order (north → south) as before, but each pixel also leaves its depth behind
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.ALWAYS); gl.depthMask(true);
        gl.useProgram(chunkP.p); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(chunkP.u.uTex, 0);
        gl.uniform1f(chunkP.u.uAlpha, view.chunkAlpha ?? 1); gl.uniform1f(chunkP.u.uCamY, camY);
        const t = view.tint || [1, 1, 1]; gl.uniform3f(chunkP.u.uTint, t[0], t[1], t[2]);
        for (const c of view.chunks) {
          const e = chunkTex.get(c.key); if (!e) continue;
          const sx = (c.gx - camX) * ppc + W / 2, sy = (c.gy - camY) * ppc + H / 2;
          const sw = c.w * ppc, sh = c.h * ppc;
          if (sx > W || sy > H || sx + sw < 0 || sy + sh < 0) continue;
          gl.bindTexture(gl.TEXTURE_2D, e.t);
          gl.uniform1f(chunkP.u.uY0, c.gy + c.h - 64);           // world row of the chunk's first cell row
          gl.uniform4f(chunkP.u.uRect, sx / W * 2 - 1, 1 - (sy + sh) / H * 2, sw / W * 2, sh / H * 2);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }
    }
    // sprites: those with a foot are hidden behind anything standing further south (see the top)
    if (globe < 1 && view.sprites?.length) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); drawQuads(view.sprites, camX, camY, ppc, W, H); }
    gl.disable(gl.DEPTH_TEST); gl.depthMask(true);
    if (lighting) {
      // light: every glowing chunk image, drawn additively at half size, then blurred twice
      const lw = Math.max(1, W >> 1), lh = Math.max(1, H >> 1);
      const light = target('light', lw, lh), b1 = target('b1', Math.max(1, W >> 2), Math.max(1, H >> 2)), b2 = target('b2', Math.max(1, W >> 2), Math.max(1, H >> 2));
      bindTarget(light); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(quad.p); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(quad.u.uTex, 0);
      gl.uniform1f(quad.u.uAlpha, 1); gl.uniform3f(quad.u.uTint, 1, 1, 1); gl.uniform1f(quad.u.uWin, Math.min(1, (view.nightness ?? 0) * 1.3));
      for (const c of view.chunks || []) {
        const e = chunkTex.get(c.key); if (!e || !e.g) continue;
        const sx = (c.gx - camX) * ppc + W / 2, sy = (c.gy - camY) * ppc + H / 2, sw = c.w * ppc, sh = c.h * ppc;
        if (sx > W || sy > H || sx + sw < 0 || sy + sh < 0) continue;
        gl.bindTexture(gl.TEXTURE_2D, e.g);
        gl.uniform4f(quad.u.uRect, sx / W * 2 - 1, 1 - (sy + sh) / H * 2, sw / W * 2, sh / H * 2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disable(gl.BLEND);
      // spread the light: blur at quarter size (radius grows with zoom so a torch lights ~6 cells)
      const spread = Math.max(0.6, Math.min(3, ppc * 0.25));
      gl.useProgram(blurP.p); gl.uniform4f(blurP.u.uRect, -1, -1, 2, 2); gl.uniform1i(blurP.u.uTex, 0); gl.activeTexture(gl.TEXTURE0);
      const pass = (src, dst, dx, dy) => { bindTarget(dst); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform2f(blurP.u.uDir, dx / src.w, dy / src.h); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
      pass(light, b1, spread, 0); pass(b1, b2, 0, spread);
      pass(b2, b1, spread * 2, 0); pass(b1, b2, 0, spread * 2);
      // composite to the screen
      bindTarget(null);
      gl.useProgram(compP.p); gl.uniform4f(compP.u.uRect, -1, -1, 2, 2);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.tex); gl.uniform1i(compP.u.uScene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b2.tex); gl.uniform1i(compP.u.uLight, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, b2.tex); gl.uniform1i(compP.u.uBloom, 2);
      const a = view.ambient || [1, 1, 1];
      gl.uniform3f(compP.u.uAmbient, a[0], a[1], a[2]);
      gl.uniform1f(compP.u.uNight, view.nightness ?? 0);
      gl.uniform1f(compP.u.uBloomAmt, view.bloom ?? 0.8);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.enable(gl.BLEND);
    }
    if (globe < 1 && view.overlay?.length) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); drawQuads(view.overlay, camX, camY, ppc, W, H); }
    if (globe > 0) {
      bindTarget(null);
      gl.useProgram(globeP.p); bindMacro(globeP);
      gl.uniform4f(globeP.u.uRect, -1, -1, 2, 2);
      gl.uniform2f(globeP.u.uView, W, H);
      gl.uniform1f(globeP.u.uR, macro.width * ppc / (2 * Math.PI));
      gl.uniform2f(globeP.u.uLonLat, camX / macro.width * Math.PI * 2, (camY / macro.height - 0.5) * Math.PI);
      const s = view.sun || [-0.5, 0.45, 0.75]; gl.uniform3f(globeP.u.uSun, s[0], s[1], s[2]);
      gl.uniform1f(globeP.u.uNight, view.night ?? 1); gl.uniform1f(globeP.u.uDark, view.globeDark ?? 0);
      gl.uniform1f(globeP.u.uAlpha, globe); gl.uniform1f(globeP.u.uShowSites, view.sites ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // marks in SCREEN pixels (device px): the globe's towns, lights, borders, routes, armies
    if (view.screen?.length) { bindTarget(null); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); drawQuads(view.screen, W / 2, H / 2, 1, W, H); }
  }

  return { gl, setMacro, setChunkImage, setChunkGlow, dropChunk, hasChunk: k => chunkTex.has(k), chunkKeys: () => [...chunkTex.keys()], draw };
}
