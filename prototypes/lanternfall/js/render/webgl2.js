// The WebGL2 pipeline (docs/06 §16): upload dirty cells -> scene (albedo + emission MRT, with parallax,
// far rain, sprites, particles) -> light map (shadowed + flat lights + blurred glow) -> composite (wet
// sheen) -> water (reflections, ripples, glints) -> unlit overlays -> bloom -> final grade + integer upscale.
import * as S from './shaders.js';
import { compile, texture, target, mrt } from './gl.js';
import { CHUNK } from '../world/grid.js';

const MARGIN = 32;          // light map margin in cells
const MAX_LIGHTS = 128;
const MAX_INST = 8192;      // sprite + particle instances per layer
const INST_FLOATS = 14;     // dst4 src4 tint4 extra2

export function createWebGL2Renderer(canvas, { mats }) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) return null;
  const floatOK = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  const HDR = floatOK ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR } : { internal: gl.RGBA8, filter: gl.LINEAR };
  const HDRN = floatOK ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.NEAREST } : { internal: gl.RGBA8, filter: gl.NEAREST };

  // programs
  const P = {
    scene: compile(gl, S.FULL_VS, S.SCENE_FS, 'scene'), batch: compile(gl, S.BATCH_VS, S.BATCH_FS, 'batch'), overlay: compile(gl, S.BATCH_VS, S.OVERLAY_FS, 'overlay'),
    light: compile(gl, S.FULL_VS, S.LIGHT_FS, 'light'), down: compile(gl, S.FULL_VS, S.DOWN_FS, 'down'), blur: compile(gl, S.FULL_VS, S.BLUR_FS, 'blur'),
    up: compile(gl, S.FULL_VS, S.UP_FS, 'up'), comp: compile(gl, S.FULL_VS, S.COMPOSITE_FS, 'composite'), water: compile(gl, S.FULL_VS, S.WATER_FS, 'water'),
    final: compile(gl, S.FULL_VS, S.FINAL_FS, 'final'),
  };
  // full-screen triangle strip
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const fsVao = gl.createVertexArray(); gl.bindVertexArray(fsVao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  // instanced batch vao
  const instBuf = gl.createBuffer(); const instData = new Float32Array(MAX_INST * INST_FLOATS);
  const batchVao = gl.createVertexArray(); gl.bindVertexArray(batchVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);
  const attrs = [['dst', 4, 0], ['src', 4, 4], ['tint', 4, 8], ['extra', 2, 12]];
  for (const [name, size, off] of attrs) {
    for (const prog of [P.batch, P.overlay]) {
      const loc = gl.getAttribLocation(prog.p, name); if (loc < 0) continue;
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, INST_FLOATS * 4, off * 4); gl.vertexAttribDivisor(loc, 1);
    }
  }
  gl.bindVertexArray(null);

  // material tables -> palette (8 x 64) and matInfo (64 x 1)
  const pal = new Uint8Array(8 * 64 * 4), info = new Float32Array(64 * 4);
  for (let m = 0; m < 64; m++) {
    const ramp = mats.ramps[m] || [[255, 0, 255]];
    for (let s = 0; s < 8; s++) { const c = ramp[s % ramp.length]; pal.set([c[0], c[1], c[2], 255], (m * 8 + s) * 4); }
    info[m * 4] = m === 0 ? 0 : mats.alpha[m]; info[m * 4 + 1] = mats.transmit[m]; info[m * 4 + 2] = mats.emit[m * 4 + 3] || 0; info[m * 4 + 3] = Math.min(8, ramp.length) / 8;
  }
  const paletteTex = texture(gl, 8, 64, { data: pal });
  const matInfoTex = texture(gl, 64, 1, { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, data: info });
  const lightData = new Float32Array(MAX_LIGHTS * 3 * 4);
  const lightTex = texture(gl, MAX_LIGHTS, 3, { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT });
  const rippleTex = texture(gl, 1024, 1, { internal: gl.R32F, format: gl.RED, type: gl.FLOAT });
  let atlasTex = texture(gl, 1, 1, { data: new Uint8Array([255, 255, 255, 255]) }); let atlasSize = [1, 1];

  let room = null, cellTex = null, bgTex = null, staging = new Uint8Array(CHUNK * CHUNK * 4), stagingBg = new Uint8Array(CHUNK * CHUNK);
  let T = null; // targets
  const stats = { uploadCells: 0, draws: 0, lights: 0, sprites: 0 };

  function ensureTargets(TW, TH) {
    if (T && T.TW === TW && T.TH === TH) return;
    const LW = Math.ceil((TW + MARGIN * 2) / 2), LH = Math.ceil((TH + MARGIN * 2) / 2);
    T = { TW, TH, LW, LH,
      scene: mrt(gl, TW, TH, 2, HDRN), light: target(gl, LW, LH, HDR), emisS: target(gl, LW, LH, HDR), emisB: target(gl, LW, LH, HDR),
      lit: target(gl, TW, TH, HDRN), water: target(gl, TW, TH, HDRN),
      bloom: [1, 2, 3, 4].map(k => target(gl, Math.max(1, TW >> k), Math.max(1, TH >> k), HDR)),
      bloomUp: [1, 2, 3].map(k => target(gl, Math.max(1, TW >> k), Math.max(1, TH >> k), HDR)) };
  }

  function setRoom(grid) {
    room = grid;
    if (cellTex) gl.deleteTexture(cellTex); if (bgTex) gl.deleteTexture(bgTex);
    cellTex = texture(gl, grid.W, grid.H, { internal: gl.RGBA8UI, format: gl.RGBA_INTEGER, type: gl.UNSIGNED_BYTE });
    bgTex = texture(gl, grid.W, grid.H, { internal: gl.R8UI, format: gl.RED_INTEGER, type: gl.UNSIGNED_BYTE, data: grid.bg });
    grid.allGfxDirty();
  }
  function uploadBg() { gl.bindTexture(gl.TEXTURE_2D, bgTex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, room.W, room.H, gl.RED_INTEGER, gl.UNSIGNED_BYTE, room.bg); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); }

  function upload(view) {
    const g = room, W = g.W; let cells = 0;
    gl.bindTexture(gl.TEXTURE_2D, cellTex);
    const vx0 = view.x0 - 64, vy0 = view.y0 - 64, vx1 = view.x1 + 64, vy1 = view.y1 + 64;
    for (let c = 0; c < g.NC; c++) {
      const o = c * 4, x0 = g.gfx[o], y0 = g.gfx[o + 1], x1 = g.gfx[o + 2], y1 = g.gfx[o + 3];
      if (x0 > x1) continue;
      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) continue; // stays dirty until in view
      const w = x1 - x0 + 1, h = y1 - y0 + 1; let k = 0;
      for (let y = y0; y <= y1; y++) {
        let i = y * W + x0;
        for (let x = 0; x < w; x++, i++) {
          staging[k++] = g.mat[i]; staging[k++] = g.shade[i]; staging[k++] = g.flags[i];
          const t = g.temp[i]; staging[k++] = t > 350 ? Math.min(255, ((t - 350) / 950 * 255) | 0) : 0;
        }
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, staging.subarray(0, w * h * 4));
      g.clearGfx(c); cells += w * h;
    }
    stats.uploadCells = cells;
  }

  function useFS(prog) { gl.useProgram(prog.p); gl.bindVertexArray(fsVao); }
  function bindTex(prog, name, tex, unit, integer) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); if (prog.u[name]) gl.uniform1i(prog.u[name], unit); }
  function draw() { gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); stats.draws++; }
  function fb(t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null); if (t) gl.viewport(0, 0, t.w, t.h); }

  function drawBatch(prog, list, cam0, TW, TH) {
    if (!list || !list.length) return;
    gl.useProgram(prog.p); gl.bindVertexArray(batchVao);
    gl.uniform2f(prog.u.cam0, cam0[0], cam0[1]); gl.uniform2f(prog.u.target, TW, TH); gl.uniform2f(prog.u.atlasSize, atlasSize[0], atlasSize[1]);
    bindTex(prog, 'atlas', atlasTex, 0);
    for (let start = 0; start < list.length; start += MAX_INST) {
      const n = Math.min(MAX_INST, list.length - start);
      for (let k = 0; k < n; k++) {
        const s = list[start + k], o = k * INST_FLOATS;
        instData[o] = s.x; instData[o + 1] = s.y; instData[o + 2] = s.w; instData[o + 3] = s.h;
        const src = s.src || WHITE; instData[o + 4] = src[0]; instData[o + 5] = src[1]; instData[o + 6] = src[2]; instData[o + 7] = src[3];
        const t = s.tint || ONE; instData[o + 8] = t[0]; instData[o + 9] = t[1]; instData[o + 10] = t[2]; instData[o + 11] = t[3] ?? 1;
        instData[o + 12] = s.emit || 0; instData[o + 13] = s.flip ? 1 : 0;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData, 0, n * INST_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); stats.draws++;
    }
    gl.bindVertexArray(null);
  }
  const WHITE = [0, 0, 1, 1], ONE = [1, 1, 1, 1];

  /**
   * frame: { cam:{x,y}, view:{w,h}, scale, time, lights:[{x,y,r,color:[r,g,b],i,shadow,cone}], sprites:[...], front:[...],
   *          overlays:[...], ambient:{top:[r,g,b], bottom:[r,g,b], floor}, sky:{top,bottom,sil}, rain:{alpha, wind},
   *          ripple: Float32Array(TW), bloom, grade:{lift,gamma,gain}, vignette, flash }
   */
  function render(f) {
    stats.draws = 0;
    const VW = f.view.w, VH = f.view.h, TW = VW + 2, TH = VH + 2; ensureTargets(TW, TH);
    const camIX = Math.floor(f.cam.x), camIY = Math.floor(f.cam.y), fx = f.cam.x - camIX, fy = f.cam.y - camIY;
    const cam0 = [camIX - 1, camIY - 1];
    if (f.bgDirty) { uploadBg(); f.bgDirty = false; }
    upload({ x0: cam0[0], y0: cam0[1], x1: cam0[0] + TW, y1: cam0[1] + TH });

    gl.disable(gl.BLEND);
    // 1. scene
    fb({ fb: T.scene.fb, w: TW, h: TH }); gl.viewport(0, 0, TW, TH);
    useFS(P.scene); const u = P.scene.u;
    bindTex(P.scene, 'cells', cellTex, 0); bindTex(P.scene, 'bgTex', bgTex, 1); bindTex(P.scene, 'palette', paletteTex, 2); bindTex(P.scene, 'matInfo', matInfoTex, 3);
    gl.uniform2f(u.cam0, cam0[0], cam0[1]); gl.uniform2f(u.target, TW, TH); gl.uniform2f(u.roomSize, room.W, room.H); gl.uniform1f(u.time, f.time);
    const sky = f.sky || {}; gl.uniform3fv(u.skyTop, sky.top || [0.05, 0.06, 0.09]); gl.uniform3fv(u.skyBot, sky.bottom || [0.02, 0.025, 0.04]); gl.uniform3fv(u.silCol, sky.sil || [0.08, 0.09, 0.13]);
    gl.uniform1f(u.wind, f.rain?.wind || 0); gl.uniform1f(u.rainAlpha, f.rain?.alpha ?? 1); gl.uniform2f(u.camF, f.cam.x, f.cam.y);
    draw();
    // sprites + particles into the scene (albedo + emission)
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawBatch(P.batch, f.sprites, cam0, TW, TH);
    gl.disable(gl.BLEND);
    // 2. glow: downsample emission to light res, blur
    fb(T.emisS); useFS(P.down); bindTex(P.down, 'src', T.scene.texs[1], 0); gl.uniform2f(P.down.u.srcSize, TW, TH); gl.uniform2f(P.down.u.offset, -MARGIN, -MARGIN); gl.uniform1f(P.down.u.threshold, 0); draw();
    fb(T.emisB); useFS(P.blur); bindTex(P.blur, 'src', T.emisS.tex, 0); gl.uniform2f(P.blur.u.size, T.LW, T.LH); gl.uniform2f(P.blur.u.dir, 1.5, 0); draw();
    fb(T.emisS); bindTex(P.blur, 'src', T.emisB.tex, 0); gl.uniform2f(P.blur.u.dir, 0, 1.5); draw();
    // 3. lights
    const lights = (f.lights || []).slice(0, MAX_LIGHTS); stats.lights = lights.length;
    lightData.fill(0);
    lights.forEach((l, k) => {
      lightData.set([l.x, l.y, l.r, 0], k * 4);
      const fl = l.flicker ? 1 - l.flicker * (0.5 + 0.5 * Math.sin(f.time * 23 + k * 7.1) * Math.sin(f.time * 13.3 + k)) : 1;
      lightData.set([l.color[0], l.color[1], l.color[2], (l.i ?? 1) * fl], (MAX_LIGHTS + k) * 4);
      const cone = l.cone; lightData.set([cone ? cone.dx : 0, cone ? cone.dy : 0, cone ? cone.spread : 0, l.shadow ? 1 : 0], (MAX_LIGHTS * 2 + k) * 4);
    });
    gl.bindTexture(gl.TEXTURE_2D, lightTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_LIGHTS, 3, gl.RGBA, gl.FLOAT, lightData);
    fb(T.light); useFS(P.light); const lu = P.light.u;
    bindTex(P.light, 'cells', cellTex, 0); bindTex(P.light, 'matInfo', matInfoTex, 1); bindTex(P.light, 'lights', lightTex, 2); bindTex(P.light, 'emisBlur', T.emisS.tex, 3);
    gl.uniform1i(lu.nLights, lights.length); gl.uniform2f(lu.cam0, cam0[0], cam0[1]); gl.uniform2f(lu.target, TW, TH); gl.uniform2f(lu.lsize, T.LW, T.LH); gl.uniform2f(lu.roomSize, room.W, room.H);
    const amb = f.ambient || {}; gl.uniform3fv(lu.ambTop, amb.top || [0.12, 0.14, 0.2]); gl.uniform3fv(lu.ambBot, amb.bottom || [0.07, 0.08, 0.12]); gl.uniform1f(lu.margin, MARGIN);
    draw();
    // 4. composite
    fb(T.lit); useFS(P.comp); const cu = P.comp.u;
    bindTex(P.comp, 'albedoT', T.scene.texs[0], 0); bindTex(P.comp, 'emisT', T.scene.texs[1], 1); bindTex(P.comp, 'lightT', T.light.tex, 2); bindTex(P.comp, 'cells', cellTex, 3);
    gl.uniform2f(cu.cam0, cam0[0], cam0[1]); gl.uniform2f(cu.target, TW, TH); gl.uniform2f(cu.lsize, T.LW, T.LH); gl.uniform1f(cu.margin, MARGIN); gl.uniform1f(cu.floorL, amb.floor ?? 0.1); gl.uniform1f(cu.gain, f.lightGain ?? 2.4); gl.uniform1f(cu.time, f.time); gl.uniform2f(cu.roomSize, room.W, room.H);
    draw();
    // 5. water
    const rip = f.ripple; if (rip) { gl.bindTexture(gl.TEXTURE_2D, rippleTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Math.min(1024, rip.length), 1, gl.RED, gl.FLOAT, rip.length > 1024 ? rip.subarray(0, 1024) : rip); }
    fb(T.water); useFS(P.water); const wu = P.water.u;
    bindTex(P.water, 'litT', T.lit.tex, 0); bindTex(P.water, 'lightT', T.light.tex, 1); bindTex(P.water, 'cells', cellTex, 2); bindTex(P.water, 'ripple', rippleTex, 3); bindTex(P.water, 'matInfo', matInfoTex, 4);
    gl.uniform2f(wu.cam0, cam0[0], cam0[1]); gl.uniform2f(wu.target, TW, TH); gl.uniform2f(wu.lsize, T.LW, T.LH); gl.uniform1f(wu.margin, MARGIN); gl.uniform1f(wu.time, f.time); gl.uniform2f(wu.roomSize, room.W, room.H);
    draw();
    // 6. unlit overlays (eyes, telegraphs, void-zone rims, rain streaks, text)
    if (f.overlays && f.overlays.length) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); fb(T.water); drawBatch(P.overlay, f.overlays, cam0, TW, TH); }
    if (f.additive && f.additive.length) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); fb(T.water); drawBatch(P.overlay, f.additive, cam0, TW, TH); }
    gl.disable(gl.BLEND);
    // 7. bloom
    const bs = f.bloom ?? 0.35;
    if (bs > 0) {
      let src = T.water.tex, sw = TW, sh = TH;
      T.bloom.forEach((t, k) => { fb(t); useFS(P.down); bindTex(P.down, 'src', src, 0); gl.uniform2f(P.down.u.srcSize, sw, sh); gl.uniform2f(P.down.u.offset, 0, 0); gl.uniform1f(P.down.u.threshold, k === 0 ? 0.85 : 0); draw(); src = t.tex; sw = t.w; sh = t.h; });
      for (let k = 2; k >= 0; k--) { const dst = T.bloomUp[k], small = k === 2 ? T.bloom[3].tex : T.bloomUp[k + 1].tex; fb(dst); useFS(P.up); bindTex(P.up, 'src', small, 0); bindTex(P.up, 'base', T.bloom[k].tex, 1); gl.uniform2f(P.up.u.size, dst.w, dst.h); draw(); }
    }
    // 8. final to canvas
    const s = f.scale; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    useFS(P.final); const fu = P.final.u;
    bindTex(P.final, 'img', T.water.tex, 0); bindTex(P.final, 'bloom', T.bloomUp[0].tex, 1);
    gl.uniform2f(fu.target, TW, TH); gl.uniform1f(fu.bloomStrength, bs > 0 ? bs : 0);
    const gr = f.grade || {}; gl.uniform3fv(fu.lift, gr.lift || [0.01, 0.01, 0.02]); gl.uniform3fv(fu.gamma, gr.gamma || [1, 1, 1]); gl.uniform3fv(fu.gain, gr.gain || [1, 1, 1]);
    gl.uniform1f(fu.vignette, f.vignette ?? 0.12); gl.uniform1f(fu.scale, s);
    // offset so the sub-cell remainder scrolls smoothly: one extra cell on each side, bottom-left origin
    const ox = Math.round(-(1 + fx) * s) + Math.floor((canvas.width - VW * s) / 2), oyTop = Math.round(-(1 + fy) * s) + Math.floor((canvas.height - VH * s) / 2);
    const oy = canvas.height - (oyTop + TH * s);
    gl.uniform2f(fu.outOffset, ox, oy);
    gl.uniform1f(fu.flash, f.flash?.a || 0); gl.uniform3fv(fu.flashCol, f.flash?.color || [1, 1, 1]);
    draw();
    // 9. HUD in screen space (logical cells of the visible view, no camera, no light, no bloom)
    if (f.hud && f.hud.length) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.viewport(Math.floor((canvas.width - VW * s) / 2), canvas.height - Math.floor((canvas.height - VH * s) / 2) - VH * s, VW * s, VH * s);
      drawBatch(P.overlay, f.hud, [0, 0], VW, VH); gl.disable(gl.BLEND);
    }
    return stats;
  }

  function setAtlas(rgba, w, h) { if (atlasTex) gl.deleteTexture(atlasTex); atlasTex = texture(gl, w, h, { data: rgba }); atlasSize = [w, h]; }

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stats.lost = true; });
  return { kind: 'webgl2', gl, setRoom, render, setAtlas, stats, markBg() { this._bg = true; } };
}
