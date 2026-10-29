// The Tactical Scope renderer (PLAN M1): draws the cell world with raw WebGL2.
//
//   cells (R32UI world texture, the sim's own 32 bits)  ─┐
//   material table (RGBA8)                               ├─► emitter pass → blur (light.js)
//   gas (RG8 quarter-res)                                │        │
//                                                        └─► cell pass (relief normals, sun, shadows,
//                                                             emitter light, water, lava, fire, gas)
//                                                             + debris ─► bloom (bloom.js) ─► CRT (crt.js)
//
// The render keeps its OWN copy of every chunk it has been sent (`cells`, same chunk-major layout as
// js/world/grid.js) so tests and the console can read what is drawn without asking the worker.
// The view is { cx, cy, zoom }: the world cell at the centre and CSS pixels per cell (the Range knob).

import { createLampLights } from './lamplight.js';
import { program, floatSupport, target, freeTarget, bindTarget, bindTex, fullscreen, FULLSCREEN_VS } from './gl.js';
import { CELL_FS, POINT_VS, POINT_FS } from './cells.glsl.js';
import { createLight } from './light.js';
import { createBloom } from './bloom.js';
import { createCrt } from './crt.js';
import { stampRoads, roadBox, FAR } from './roads.js';
import { stampWalls, wallBox, FAR as WALL_FAR } from './vectors.js'; // M4

export const QUALITY = {
  low: { dpr: 1, lightDiv: 4, levels: 4, bloom: false, afterglow: 0 },
  standard: { dpr: 1.5, lightDiv: 3, levels: 5, bloom: true, afterglow: 0 },
  high: { dpr: 2, lightDiv: 2, levels: 5, bloom: true, afterglow: 0.55 },
};

const SHADE_CODES = ['ground', 'plant', 'tree', 'rock', 'ore', 'crystal', 'shallow', 'deep', 'ice', 'lava',
  'glass', 'rubble', 'mud', 'wall', 'cliff', 'lamp'];

function hexRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }

export function createScope(canvas, { materials }) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 is not available on this device');
  const hdr = floatSupport(gl);
  const cellProg = program(gl, FULLSCREEN_VS, CELL_FS);
  const pointProg = program(gl, POINT_VS, POINT_FS);
  const light = createLight(gl, hdr);
  const lamps = createLampLights(materials.list);   // lamp pools: a real radius of light on the ground (lamplight.js)
  const bloom = createBloom(gl, hdr);
  const crt = createCrt(gl);

  // material table texture
  const list = materials.list;
  const matData = new Uint8Array(256 * 5 * 4);
  const matColor = [];
  list.forEach((m, i) => {
    for (let v = 0; v < 3; v++) {
      const [r, g, b] = hexRgb(m.colors[v] || m.colors[0]);
      const o = (v * 256 + i) * 4;
      matData[o] = r; matData[o + 1] = g; matData[o + 2] = b; matData[o + 3] = 255;
    }
    matColor[i] = hexRgb(m.colors[0]).map((x) => x / 255);
    const o3 = (3 * 256 + i) * 4;
    matData[o3] = m.relief ?? 0;
    matData[o3 + 1] = Math.max(0, SHADE_CODES.indexOf(m.shade || 'ground'));
    matData[o3 + 2] = m.emit ? Math.round(m.emit[3] * 255) : 0;
    matData[o3 + 3] = m.ignite ? 255 : 0;
    const o4 = (4 * 256 + i) * 4;
    if (m.emit) { matData[o4] = Math.round(m.emit[0] * 255); matData[o4 + 1] = Math.round(m.emit[1] * 255); matData[o4 + 2] = Math.round(m.emit[2] * 255); }
    matData[o4 + 3] = Math.round(Math.min(31, m.emitBoost ?? 1) * 8);
  });
  const matTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, matTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 5, 0, gl.RGBA, gl.UNSIGNED_BYTE, matData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  let W = 0, H = 0, CW = 0, QW = 0, QH = 0;
  let cellTex = null, gasTex = null, fogTex = null, roadTex = null, wallTex = null, wallField = null, wallInfo = null, wallRG = null;
  const walls = new Map(); // id → wall record (M4)
  let cells = null, gas = null, fog = null, roadField = null;
  const roads = new Map(); // id → road record { pts, laid } (M3)
  const have = new Set();

  function setWorld(w, h) {
    W = w; H = h; CW = w >> 6; QW = w >> 2; QH = h >> 2;
    gl.activeTexture(gl.TEXTURE7);
    cells = new Uint32Array(W * H);
    gas = new Uint8Array(QW * QH * 2);
    fog = new Uint8Array(QW * QH).fill(2);
    have.clear();
    if (cellTex) gl.deleteTexture(cellTex);
    cellTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, cellTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32UI, W, H);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (gasTex) gl.deleteTexture(gasTex);
    gasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, gasTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, QW, QH, 0, gl.RG, gl.UNSIGNED_BYTE, gas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    roadField = new Uint8Array(W * H).fill(FAR);
    roads.clear();
    if (roadTex) gl.deleteTexture(roadTex);
    roadTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, roadTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, roadField);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // M4: the wall field (RG8: distance, section info)
    wallField = new Uint8Array(W * H).fill(WALL_FAR); wallInfo = new Uint8Array(W * H); walls.clear();
    if (wallTex) gl.deleteTexture(wallTex);
    wallTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, wallTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    wallRG = new Uint8Array(W * H * 2);
    for (let k = 0; k < W * H; k++) wallRG[k * 2] = WALL_FAR;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, W, H, 0, gl.RG, gl.UNSIGNED_BYTE, wallRG);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    wallRG = null;
    if (fogTex) gl.deleteTexture(fogTex);
    fogTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fogTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, QW, QH, 0, gl.RED, gl.UNSIGNED_BYTE, fog);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /** A chunk of cells (Uint32Array 4096, the chunk's own rows) arrived. */
  function putChunk(ci, data) {
    cells.set(data, ci << 12);
    have.add(ci);
    gl.activeTexture(gl.TEXTURE7);
    const cx = (ci % CW) << 6, cy = ((ci / CW) | 0) << 6;
    gl.bindTexture(gl.TEXTURE_2D, cellTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, cx, cy, 64, 64, gl.RED_INTEGER, gl.UNSIGNED_INT, data);
    lamps.scan(ci, data, cx, cy);
  }
  /** Gas for one chunk: Uint8Array 512 = 16x16 x (density, kind). */
  function putGas(ci, data) {
    const qx = (ci % CW) << 4, qy = ((ci / CW) | 0) << 4;
    for (let y = 0; y < 16; y++) gas.set(data.subarray(y * 32, y * 32 + 32), ((qy + y) * QW + qx) * 2);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, gasTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, qx, qy, 16, 16, gl.RG, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }
  /** The whole quarter-res fog field (0 never seen, 1 seen before, 2 live). */
  function putFog(field) {
    fog.set(field);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, fogTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, QW, QH, gl.RED, gl.UNSIGNED_BYTE, fog);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /** Road records changed (M3): `list` = [{ id, pts, laid }], `gone` = [ids]. Rebuilds the distance field there. */
  function putRoads(list = [], gone = []) {
    let box = null;
    const grow = (b) => { if (!b) return; box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b.slice(); };
    for (const id of gone) { const v = roads.get(id); if (v) grow(roadBox(v)); roads.delete(id); }
    for (const v of list) { const old = roads.get(v.id); if (old) grow(roadBox(old)); roads.set(v.id, v); grow(roadBox(v)); }
    if (!box) return;
    box = [Math.max(0, box[0]), Math.max(0, box[1]), Math.min(W - 1, box[2]), Math.min(H - 1, box[3])];
    stampRoads(roadField, W, H, [...roads.values()], box);
    const [x0, y0, x1, y1] = box, w = x1 - x0 + 1, h = y1 - y0 + 1;
    const sub = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) sub.set(roadField.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + w), y * w);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, roadTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RED, gl.UNSIGNED_BYTE, sub);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /** Wall records changed (M4): rebuild the wall field where they are (js/render/vectors.js). */
  function putWalls(list = [], gone = []) {
    let box = null;
    const grow = (b) => { if (!b) return; box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b.slice(); };
    for (const id of gone) { const v = walls.get(id); if (v) grow(wallBox(v)); walls.delete(id); }
    for (const v of list) { const old = walls.get(v.id); if (old) grow(wallBox(old)); walls.set(v.id, v); grow(wallBox(v)); }
    if (!box) return;
    box = [Math.max(0, box[0]), Math.max(0, box[1]), Math.min(W - 1, box[2]), Math.min(H - 1, box[3])];
    stampWalls(wallField, wallInfo, W, H, [...walls.values()], box);
    const [x0, y0, x1, y1] = box, w = x1 - x0 + 1, h = y1 - y0 + 1;
    const sub = new Uint8Array(w * h * 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y0 + y) * W + x0 + x, o = (y * w + x) * 2; sub[o] = wallField[k]; sub[o + 1] = wallInfo[k]; }
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, wallTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RG, gl.UNSIGNED_BYTE, sub);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  // ---- people and carts (M3): positions arrive each frame; drawn interpolated between the last two snapshots
  let movers = new Float32Array(0), moversPrev = new Map(), moversAt = 0, moversDt = 50;
  const RES_COL = [];
  function setResourceColours(list) { list.forEach((r, i) => { RES_COL[i + 1] = hexRgb(r.colour).map((x) => x / 255); }); }
  function setMovers(arr, nowMs) {
    const prev = new Map();
    for (let k = 0; k < movers.length; k += 6) prev.set(movers[k], [movers[k + 1], movers[k + 2]]);
    moversPrev = prev;
    if (moversAt) moversDt = Math.max(16, Math.min(250, nowMs - moversAt));
    movers = arr; moversAt = nowMs;
  }

  // ---- debris and transient lights
  let debris = new Float32Array(0), debrisAt = 0;
  const flashes = []; // { x, y, r, i, born, life, color, kind }
  const fx = [];      // { kind: 'fireball'|'ring'|'splash', x, y, r, born, life, seed }
  const bolts = [];   // { pts: [[x,y]], flood: Int32Array, born }
  let shakeAmp = 0, flashAmp = 0;
  const painters = []; // addPainter(fn): M6 spell effects (and later milestones) draw lit points each frame
  const pts = { light: new Float32Array(8 * 4096), scene: new Float32Array(8 * 4096), glow: new Float32Array(8 * 4096) };
  const pointVao = gl.createVertexArray();
  const pointBuf = gl.createBuffer();
  gl.bindVertexArray(pointVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(null);

  function setDebris(arr, nowMs) { debris = arr; debrisAt = nowMs; }

  /** React to a world event: explosion, lightning, frost. */
  function event(ev, nowMs) {
    if (ev.e === 'explosion') {
      const r = ev.r;
      flashes.push({ x: ev.x + 0.5, y: ev.y + 0.5, r: r * 3.2, i: 3.5 * Math.min(2, ev.power), born: nowMs, life: 380, color: [1, 0.75, 0.45] });
      flashes.push({ x: ev.x + 0.5, y: ev.y + 0.5, r: r * 1.4, i: 2.2, born: nowMs, life: 1400, color: [1, 0.4, 0.1] });
      if (ev.water) flashes.push({ x: ev.x + 0.5, y: ev.y + 0.5, r: r * 2.2, i: 1.2, born: nowMs, life: 600, color: [0.7, 0.85, 1] });
      const seed = Math.random() * 1000;
      fx.push({ kind: ev.water ? 'splash' : 'fireball', x: ev.x + 0.5, y: ev.y + 0.5, r, p: Math.min(2, ev.power), born: nowMs, life: ev.water ? 700 : 520 + r * 18, seed });
      fx.push({ kind: 'ring', x: ev.x + 0.5, y: ev.y + 0.5, r, p: Math.min(2, ev.power), born: nowMs, life: 260 + r * 6, seed });
      if (inView(ev.x, ev.y, r * 2)) {
        shakeAmp = Math.min(14, shakeAmp + 2.5 + r * 0.35 * Math.min(2, ev.power));
        flashAmp = Math.min(0.3, flashAmp + 0.04 + r * 0.004);
      }
    } else if (ev.e === 'lightning') {
      const path = [];
      let x = ev.x + 0.5 + (Math.random() - 0.5) * 30, y = ev.y + 0.5 - 90;
      const n = 22;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const tx = x + (ev.x + 0.5 - x) * t, ty = y + (ev.y + 0.5 - y) * t;
        path.push([tx + (k && k < n ? (Math.random() - 0.5) * 7 : 0), ty]);
      }
      bolts.push({ pts: path, flood: ev.flood, born: nowMs });
      flashes.push({ x: ev.x + 0.5, y: ev.y + 0.5, r: 22, i: 2.2, born: nowMs, life: 260, color: [0.75, 0.85, 1] });
      if (inView(ev.x, ev.y, 40)) { shakeAmp = Math.min(14, shakeAmp + 3); flashAmp = Math.min(0.3, flashAmp + 0.12); }
    } else if (ev.e === 'frost') {
      flashes.push({ x: ev.x + 0.5, y: ev.y + 0.5, r: ev.r * 1.6, i: 0.9, born: nowMs, life: 500, color: [0.6, 0.85, 1] });
    }
  }

  // ---- view
  const view = { cx: 0, cy: 0, zoom: 2 };
  const opts = { quality: 'standard', crt: true, time: 0.42, fog: false, tps: 20, exposure: 1, bloom: null, wind: [0, 0], fxSlow: 1, filter: 0, roadW: 2.2, roadLv: 1, wallW: 1.6, wallLv: 1, wallTrim: [0.54, 0.42, 0.26] };
  let dpr = 1, rw = 1, rh = 1;
  let scene = null;
  const stats = { fps: 0, frameMs: 0, frames: 0 };
  let fpsT = 0, fpsN = 0;

  function cssSize() { return [canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height]; }
  function resize() {
    const q = QUALITY[opts.quality] || QUALITY.standard;
    dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    const [cw, ch] = cssSize();
    const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    rw = w; rh = h;
    if (!scene || scene.w !== w || scene.h !== h) { freeTarget(gl, scene); scene = target(gl, w, h, hdr); }
  }
  /** World rect on screen (cells). */
  function viewRect() {
    const [cw, ch] = cssSize();
    const x0 = view.cx - cw / 2 / view.zoom, y0 = view.cy - ch / 2 / view.zoom;
    return { x0, y0, x1: x0 + cw / view.zoom, y1: y0 + ch / view.zoom };
  }
  function inView(x, y, m) { const r = viewRect(); return x > r.x0 - m && y > r.y0 - m && x < r.x1 + m && y < r.y1 + m; }
  function worldToScreen(x, y) { const r = viewRect(); return [(x - r.x0) * view.zoom, (y - r.y0) * view.zoom]; }
  function screenToWorld(px, py) { const r = viewRect(); return [r.x0 + px / view.zoom, r.y0 + py / view.zoom]; }

  function sun(t) {
    const a = (t - 0.25) * 2 * Math.PI;
    const e = Math.sin(a);
    const day = Math.max(0, Math.min(1, (e + 0.08) / 0.3));
    const dir = [Math.cos(a), 0.35 * Math.sin(a) + 0.15, Math.max(0.06, e)];
    const l = Math.hypot(...dir);
    const low = 1 - Math.min(1, Math.max(0, e) / 0.45);
    const sunCol = [0.72 + 0.1 * low, 0.68 - 0.22 * low, 0.6 - 0.36 * low].map((c) => c * day);
    const night = [0.045, 0.055, 0.1], dayA = [0.36, 0.38, 0.42], dusk = [0.36, 0.24, 0.22];
    const amb = night.map((n, i) => n + (dayA[i] * (1 - low) + dusk[i] * low - n) * day);
    const sky = [0.03, 0.05, 0.1].map((n, i) => n + ([0.5, 0.66, 0.85][i] * (1 - low) + [0.85, 0.45, 0.3][i] * low - n) * day);
    return { dir: dir.map((d) => d / l), sunCol, amb, sky, night: 1 - day };
  }

  /** Render one frame. nowMs: performance.now(). */
  function render(nowMs) {
    if (!cellTex) return;
    const t0 = performance.now();
    resize();
    const q = QUALITY[opts.quality] || QUALITY.standard;
    const time = nowMs / 1000;
    // shake + flash decay
    const dtf = Math.min(0.1, (nowMs - (render.last || nowMs)) / 1000);
    render.last = nowMs;
    shakeAmp *= Math.pow(0.0008, dtf);
    flashAmp *= Math.pow(0.00002, dtf);
    const sx = (Math.random() - 0.5) * shakeAmp, sy = (Math.random() - 0.5) * shakeAmp;
    const vr = viewRect();
    const S = sun(opts.time);

    // ---- transient point lights
    let nl = 0, ns = 0;
    const L = pts.light, Sc = pts.scene;
    const pushL = (x, y, size, r, g, b, i) => { if (nl >= 4096) return; const o = nl++ * 8; L[o] = x; L[o + 1] = y; L[o + 2] = size; L[o + 3] = 1; L[o + 4] = r; L[o + 5] = g; L[o + 6] = b; L[o + 7] = i; };
    const pushS = (x, y, size, r, g, b, a) => { if (ns >= 4096) return; const o = ns++ * 8; Sc[o] = x; Sc[o + 1] = y; Sc[o + 2] = size; Sc[o + 3] = 0; Sc[o + 4] = r; Sc[o + 5] = g; Sc[o + 6] = b; Sc[o + 7] = a; };
    let ng = 0;
    const G = pts.glow;
    const pushG = (x, y, size, r, g, b, i) => { if (ng >= 4096) return; const o = ng++ * 8; G[o] = x; G[o + 1] = y; G[o + 2] = size; G[o + 3] = 1; G[o + 4] = r; G[o + 5] = g; G[o + 6] = b; G[o + 7] = i; };
    for (let k = flashes.length - 1; k >= 0; k--) {
      const f = flashes[k];
      const age = (nowMs - f.born) / (f.life * opts.fxSlow);
      if (age >= 1) { flashes.splice(k, 1); continue; }
      const fade = (1 - age) * (1 - age);
      pushL(f.x, f.y, f.r * 2, f.color[0], f.color[1], f.color[2], f.i * fade);
    }
    for (let k = bolts.length - 1; k >= 0; k--) {
      const b = bolts[k];
      const age = (nowMs - b.born) / (420 * opts.fxSlow);
      if (age >= 1) { bolts.splice(k, 1); continue; }
      // the bolt flickers: on, off, on again, then the afterimage fades
      const on = age < 0.16 || (age > 0.26 && age < 0.4) ? 1 : 0.25;
      const fade = Math.max(0, 1 - age * 1.1) * on;
      if (age < 0.5) for (let s = 0; s < b.pts.length - 1; s++) {
        const [ax, ay] = b.pts[s], [bx, by] = b.pts[s + 1];
        const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 1.5);
        for (let j = 0; j < steps; j++) {
          const tt = j / steps;
          if (j % 3 === 0) pushG(ax + (bx - ax) * tt, ay + (by - ay) * tt, 3.5, 0.5, 0.65, 1, 0.3 * fade);
          pushS(ax + (bx - ax) * tt, ay + (by - ay) * tt, 0.9, 2.6 * fade + 0.2, 2.9 * fade + 0.2, 3.4 * fade + 0.3, 1);
        }
        pushL(ax, ay, 14, 0.7, 0.8, 1, 0.6 * fade);
      }
      // the charge crackles across the water: a sparse, flickering scatter of bright cells, not a sheet
      const fl = b.flood;
      const glow = Math.max(0, 1 - age * 1.4);
      const step = Math.max(1, Math.ceil(fl.length / 900));
      for (let j = 0; j < fl.length; j += step) {
        if (Math.random() > 0.22) continue;
        const x = (fl[j] & 0xffff) + 0.5, y = (fl[j] >>> 16) + 0.5;
        pushS(x, y, 1, 1.4 * glow, 2.1 * glow, 2.9 * glow, glow);
        if (Math.random() < 0.25) pushL(x, y, 6, 0.5, 0.72, 1, 0.5 * glow);
      }
    }
    // explosion fireballs, shock rings and splashes: soft additive discs in the scene
    for (let k = fx.length - 1; k >= 0; k--) {
      const f = fx[k];
      const age = (nowMs - f.born) / (f.life * opts.fxSlow);
      if (age >= 1) { fx.splice(k, 1); continue; }
      if (f.kind === 'fireball') {
        // a few overlapping puffs that swell and cool from white through orange to deep red
        const n = 9;
        for (let j = 0; j < n; j++) {
          const a = f.seed + j * 2.39996;
          const d = j === 0 ? 0 : f.r * (0.25 + 0.45 * ((j * 0.618) % 1)) * (0.6 + age * 0.8);
          const px = f.x + Math.cos(a) * d, py = f.y + Math.sin(a) * d - age * f.r * 0.25;
          const size = f.r * (j === 0 ? 1.5 : 0.9) * (0.55 + age * 0.9) * (0.9 + 0.2 * f.p);
          const heat = Math.max(0, 1 - age * 1.35 - j * 0.03);
          const cr = 1, cg = 0.25 + 0.6 * heat, cb = 0.05 + 0.55 * heat * heat;
          const inten = (1 - age) * (1 - age) * (2.2 + 2.5 * heat) * (j === 0 ? 1.2 : 0.7);
          pushG(px, py, size, cr, cg, cb, inten);
        }
      } else if (f.kind === 'splash') {
        const n = 26;
        for (let j = 0; j < n; j++) {
          const a = f.seed + (j / n) * Math.PI * 2;
          const d = f.r * (0.4 + age * 1.1) * (0.85 + 0.3 * ((j * 0.37) % 1));
          pushG(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - Math.sin(age * Math.PI) * f.r * 0.4, 2.2, 0.8, 0.9, 1, (1 - age) * 1.4);
        }
        pushG(f.x, f.y, f.r * 1.4 * (0.6 + age), 0.85, 0.92, 1, (1 - age) * 0.9);
      } else {
        // shock ring: thin, fast, gone in a quarter second
        const rad = f.r * (0.5 + age * 2.6);
        const n = Math.min(160, Math.ceil(rad * 1.2) + 12);
        for (let j = 0; j < n; j++) {
          const a = (j / n) * Math.PI * 2;
          pushG(f.x + Math.cos(a) * rad, f.y + Math.sin(a) * rad, 2.6, 1, 0.9, 0.75, (1 - age) * (1 - age) * 0.9 * f.p);
        }
      }
    }
    // debris (interpolated forward from the last snapshot)
    const dt = Math.min(1.5, ((nowMs - debrisAt) / 1000) * opts.tps);
    const grav = 0.09;
    for (let k = 0; k < debris.length; k += 8) {
      const z = Math.max(0, debris[k + 2] + debris[k + 5] * dt - 0.5 * grav * dt * dt);
      const x = debris[k] + debris[k + 3] * dt, y = debris[k + 1] + debris[k + 4] * dt;
      const hot = debris[k + 7] > 0.5;
      const m = debris[k + 6] | 0;
      pushS(x, y + 0.3, 1, 0, 0, 0, 0.4);
      if (hot) {
        pushS(x, y - z, 1, 2.6, 1.05, 0.3, 1);
        pushL(x, y - z * 0.5, 6, 1, 0.5, 0.15, 0.9);
      } else {
        const c = matColor[m] || [0.5, 0.5, 0.5];
        const li = S.amb[0] + S.sunCol[0] * 0.9;
        pushS(x, y - z, 1, c[0] * li, c[1] * li, c[2] * li, 1);
      }
    }

    // people and carts: a shadow, a body and (when carrying) a dot of the load's colour
    if (movers.length) {
      const a = Math.min(1, (nowMs - moversAt) / moversDt);
      const li = S.amb[0] + S.sunCol[0] * 0.9 + 0.15;
      for (let k = 0; k < movers.length; k += 6) {
        const id = movers[k], p = moversPrev.get(id);
        let x = movers[k + 1], y = movers[k + 2];
        if (p) { x = p[0] + (x - p[0]) * a; y = p[1] + (y - p[1]) * a; }
        const kind = movers[k + 3], res = movers[k + 4];
        if (kind === 1) {                      // mule cart: a 3-cell bed and the mule ahead of it
          pushS(x + 0.4, y + 0.6, 3.2, 0, 0, 0, 0.35);
          pushS(x, y, 3, 0.36 * li, 0.25 * li, 0.15 * li, 1);
          if (res) { const c = RES_COL[res] || [1, 1, 1]; pushS(x, y - 0.2, 1.8, c[0] * li * 1.2, c[1] * li * 1.2, c[2] * li * 1.2, 1); }
        } else if (kind === 3) {               // M7: a group of settlers walking in, bundles on their backs
          for (let j = 0; j < Math.min(3, res || 1); j++) {
            const ox = (j - 1) * 1.6, oy = (j & 1) * 0.9;
            pushS(x + ox + 0.3, y + oy + 0.5, 2, 0, 0, 0, 0.35);
            pushS(x + ox, y + oy, 1.6, 0.22 * li, 0.3 * li, 0.42 * li, 1);
            pushS(x + ox, y + oy - 0.6, 1, 0.86 * li, 0.72 * li, 0.58 * li, 1);
            pushS(x + ox + 0.7, y + oy - 0.1, 1, 0.62 * li, 0.48 * li, 0.3 * li, 1);
          }
        } else {                               // a person: 2-cell body, head colour by job
          pushS(x + 0.3, y + 0.5, 2, 0, 0, 0, 0.35);
          const b = kind === 2 ? [0.95, 0.72, 0.18] : [0.82, 0.74, 0.6];
          pushS(x, y, 1.6, 0.2 * li, 0.18 * li, 0.16 * li, 1);
          pushS(x, y - 0.6, 1, b[0] * li, b[1] * li, b[2] * li, 1);
          if (res) { const c = RES_COL[res] || [1, 1, 1]; pushS(x + 0.6, y + 0.1, 1, c[0] * li * 1.2, c[1] * li * 1.2, c[2] * li * 1.2, 1); }
        }
        // a lamp each at night, so the scope can follow them in the dark
        if (S.night > 0.5) pushL(x, y, 7, 1, 0.8, 0.5, 0.35 * S.night);
      }
    }

    // extra lit things from later milestones (M6 spells: js/render/spellfx.js) — fn({ nowMs, pushL, pushS, pushG, vr, S, shake })
    for (const p of painters) p({ nowMs, pushL, pushS, pushG, vr, S, shake: (a) => { shakeAmp = Math.min(14, shakeAmp + a); }, flash: (a) => { flashAmp = Math.min(0.3, flashAmp + a); } });

    lamps.push(vr, pushL, nowMs, S.night);

    // ---- light buffer
    gl.disable(gl.DEPTH_TEST);
    bindTex(gl, 0, cellTex);
    bindTex(gl, 1, matTex);
    const lb = light.render(vr, q.lightDiv, { W, H }, time, L, nl, q.levels);

    // ---- cell pass
    bindTarget(gl, scene);
    cellProg.use();
    bindTex(gl, 0, cellTex);
    bindTex(gl, 1, matTex);
    bindTex(gl, 2, gasTex);
    bindTex(gl, 3, lb.tex);
    bindTex(gl, 4, fogTex);
    bindTex(gl, 5, roadTex);
    bindTex(gl, 6, wallTex);
    const u = cellProg.u;
    gl.uniform1i(u.uCells, 0); gl.uniform1i(u.uMat, 1); gl.uniform1i(u.uGas, 2); gl.uniform1i(u.uLight, 3); gl.uniform1i(u.uFog, 4); gl.uniform1i(u.uRoad, 5);
    gl.uniform1f(u.uRoadW, opts.roadW); gl.uniform1f(u.uRoadLv, opts.roadLv); gl.uniform1i(u.uFilter, opts.filter | 0);
    gl.uniform1i(u.uWall, 6); gl.uniform1f(u.uWallW, opts.wallW); gl.uniform1f(u.uWallLv, opts.wallLv); gl.uniform3f(u.uWallTrim, ...opts.wallTrim);
    gl.uniform2f(u.uWorld, W, H);
    gl.uniform1f(u.uTime, time);
    const cpp = 1 / (view.zoom * dpr);
    gl.uniform2f(u.uOrigin, vr.x0 + sx / view.zoom, vr.y0 + sy / view.zoom);
    gl.uniform1f(u.uCpp, cpp);
    gl.uniform2f(u.uRes, rw, rh);
    gl.uniform4f(u.uLightRect, lb.rect.x, lb.rect.y, lb.rect.w, lb.rect.h);
    gl.uniform1f(u.uLightScale, lb.scale * 0.35);
    gl.uniform3f(u.uSunDir, ...S.dir);
    gl.uniform3f(u.uSunCol, ...S.sunCol);
    gl.uniform3f(u.uAmb, ...S.amb);
    gl.uniform3f(u.uSky, ...S.sky);
    gl.uniform1f(u.uNight, S.night);
    gl.uniform1i(u.uFogOn, opts.fog ? 1 : 0);
    gl.uniform2f(u.uWind, opts.wind[0], opts.wind[1]);
    gl.uniform1f(u.uFlash, flashAmp * (opts.crt ? 1 : 0.6));
    fullscreen(gl);
    // debris + bolt pixels on top
    if (ns) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      pointProg.use();
      gl.uniform2f(pointProg.u.uOrigin, vr.x0 + sx / view.zoom, vr.y0 + sy / view.zoom);
      gl.uniform2f(pointProg.u.uSpan, vr.x1 - vr.x0, vr.y1 - vr.y0);
      gl.uniform1f(pointProg.u.uPxPerCell, view.zoom * dpr);
      gl.uniform1f(pointProg.u.uFlip, 1);
      gl.uniform1f(pointProg.u.uScale, 1);
      gl.bindVertexArray(pointVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
      gl.bufferData(gl.ARRAY_BUFFER, Sc.subarray(0, ns * 8), gl.STREAM_DRAW);
      gl.drawArrays(gl.POINTS, 0, ns);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
    if (ng) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      pointProg.use();
      gl.uniform2f(pointProg.u.uOrigin, vr.x0 + sx / view.zoom, vr.y0 + sy / view.zoom);
      gl.uniform2f(pointProg.u.uSpan, vr.x1 - vr.x0, vr.y1 - vr.y0);
      gl.uniform1f(pointProg.u.uPxPerCell, view.zoom * dpr);
      gl.uniform1f(pointProg.u.uFlip, 1);
      gl.uniform1f(pointProg.u.uScale, 1);
      gl.bindVertexArray(pointVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuf);
      gl.bufferData(gl.ARRAY_BUFFER, G.subarray(0, ng * 8), gl.STREAM_DRAW);
      gl.drawArrays(gl.POINTS, 0, ng);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
    // ---- bloom + final
    const useBloom = opts.bloom ?? q.bloom;
    const bt = useBloom ? bloom.render(scene.tex, rw, rh, 1.0) : null;
    crt.render(scene.tex, bt, rw, rh, time, { crt: opts.crt, bloom: useBloom, afterglow: opts.crt ? q.afterglow : 0, exposure: opts.exposure });
    stats.frameMs = performance.now() - t0;
    fpsN++;
    if (nowMs - fpsT > 1000) { stats.fps = Math.round((fpsN * 1000) / (nowMs - fpsT)); fpsT = nowMs; fpsN = 0; }
    stats.frames++;
  }

  /** Render now and read back device pixels at CSS points [[x, y], ...] → [[r,g,b,a], ...]. */
  function readAt(points, nowMs = performance.now()) {
    render(nowMs);
    const out = [];
    const px = new Uint8Array(4);
    for (const [x, y] of points) {
      const dx = Math.floor(x * dpr), dy = Math.floor(y * dpr);
      gl.readPixels(dx, rh - 1 - dy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.push([px[0], px[1], px[2], px[3]]);
    }
    return out;
  }

  /** CPU copy of a cell as the renderer has it. */
  const cellAt = (x, y) => cells[((((y >> 6) * CW + (x >> 6)) << 12) | ((y & 63) << 6) | (x & 63)) >>> 0];

  return {
    gl, hdr, view, opts, stats,
    setWorld, putChunk, putGas, putFog, setDebris, event, render, readAt, putRoads, setMovers, setResourceColours, putWalls,
    wallAt: (x, y) => wallField ? [wallField[y * W + x], wallInfo[y * W + x]] : [WALL_FAR, 0],
    addPainter: (fn) => { painters.push(fn); return () => { const i = painters.indexOf(fn); if (i >= 0) painters.splice(i, 1); }; },
    roadAt: (x, y) => roadField ? roadField[y * W + x] : FAR,
    /** Where the people and carts are drawn right now: [[x, y, kind, cargoRes]] (cells). */
    moversNow() { const out = []; const a = Math.min(1, (performance.now() - moversAt) / moversDt); for (let k = 0; k < movers.length; k += 6) { const p = moversPrev.get(movers[k]); const x = p ? p[0] + (movers[k + 1] - p[0]) * a : movers[k + 1], y = p ? p[1] + (movers[k + 2] - p[1]) * a : movers[k + 2]; out.push([x, y, movers[k + 3], movers[k + 4]]); } return out; },
    viewRect, worldToScreen, screenToWorld, cellAt,
    get size() { return [W, H]; },
    get chunksHeld() { return have.size; },
    get dpr() { return dpr; },
  };
}
