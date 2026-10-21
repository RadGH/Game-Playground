// Play-test 2 Q13 — avatar portraits instead of letters: the player frame, the target frame, party frames, the
// character list on the title screen and the friends list, drawn from each character's ACTUAL Chibi 2 look.
//
// Two ways, both freeze-safe:
//   LIVE (you, your target, party members you can see): after the game draws its frame, the game's OWN renderer draws
//     the body that is already in the world once more, through a small camera on its face, into the square of the
//     canvas the frame covers anyway, and that square is copied into the frame (Bannerline's js/view/portrait.js trick).
//     Only that body and the scene's lights are drawn (layer 1), so nothing new is compiled or uploaded, and the shadow
//     map is reused. A few times a second, not every frame.
//   STATIC (people who are not in view: friends, the title screen's characters, far party members): a small renderer of
//     our own builds the body once in an idle moment, reads it back with drawImage + the async toBlob (never
//     toDataURL), keeps it as an object URL and in IndexedDB — same rules as the item icons (ui/item-icons.js).
//
//   const P = createPortraits({ renderer, scene, avatarFor, createBody });
//   P.live(slotEl, () => actor | null)        // a frame slot that shows a live body
//   P.pass()                                  // after view.render(), same task
//   P.img(look, key) -> url | null            // static; P.onReady(fn) when one arrives
//   P.remember(charId, look)                  // a player's look seen in the world, for later static use

import * as THREE from 'three';

export { softwareRenderer, svgPortrait } from './svg-portrait.js';
import { softwareRenderer, svgPortrait } from './svg-portrait.js';
import { deviceAllowsLive, canvasMatches, squareOnCanvas } from './portrait-mode.js';
// G-PROPS 2026-10-16: painted art for monsters / townsfolk, a painted-look filter on the live face (?props=0 = neither)
import { paintedUrl, paintFilter } from './painted-portraits.js';
import { propsOff } from '../surface-plan.js';
const PAINT = !propsOff();

export const PORTRAIT_LAYER = 1;
const VERSION = 'p2';      // p2 (2026-10-16): Chibi 2.5 faces (js/client/chibi-version.js)
const SIZE = 96;
const DB = 'tv-portraits', OS = 'p';

export function createPortraits({ renderer, scene, avatarFor, createBody, fps = 6, software = null } = {}) {
  // software renderer: no live pass and no static 3D renders — the 2D picture instead (freeze spec: zero long tasks)
  // Y33 (play-test 10): and no live pass on iOS / a phone / any finger-first device either — see ui/portrait-mode.js.
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
  const SOFT = software ?? (softwareRenderer(renderer) || !deviceAllowsLive({ ua: nav.userAgent || '', platform: nav.platform || '', maxTouchPoints: nav.maxTouchPoints || 0, coarse }));
  const VER = VERSION + (SOFT ? 's' : '');
  let flat = SOFT;                  // this pass: the 2D picture (true) or the live 3D one (false)
  let flatWhy = SOFT ? 'device' : '';
  // ---------------------------------------------------------------- live
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 6);
  cam.layers.set(PORTRAIT_LAYER);
  const slots = [];
  let last = 0, lightCheck = 0, lightCount = -1;
  const lightTops = new Set();      // top-level scene children that hold a light (always walked: same light set = no new shader)
  const vp = new THREE.Vector4(), sc = new THREE.Vector4(), clear = new THREE.Color(), _h = new THREE.Vector3();
  const stats = { renders: 0, maxMs: 0 };

  function live(el, get, { kind = 'self' } = {}) {
    const svg = liveSvg(el, get);                 // every slot has the 2D picture; the live canvas is an extra where allowed
    if (SOFT) return svg;
    const cv = document.createElement('canvas');
    cv.className = 'portrait-live';
    el.prepend(cv);
    svg.img.style.display = 'none';              // live until a pass says otherwise (setFlat swaps the two)
    const s = { el, cv, svg, ctx: cv.getContext('2d'), get, kind, on: false, actorId: null, pbo: null, fence: null, w: 0, h: 0, buf: null, img: null };
    slots.push(s);
    return s;
  }
  // the 2D stand-in for a live slot: an <img> with the actor's face as SVG, redrawn when the actor or its look changes
  const svgSlots = [];
  function liveSvg(el, get) {
    const img = document.createElement('img'); img.className = 'portrait-live portrait-svg'; img.alt = '';
    el.prepend(img);
    const painted = document.createElement('img'); painted.className = 'portrait-painted'; painted.alt = '';
    el.prepend(painted);
    const s = { el, img, get, key: '', painted, purl: null };
    svgSlots.push(s);
    return s;
  }
  /** G-PROPS: a monster / townsperson with painted art shows the picture (no live render, no 2D face for that slot). */
  function paintedPass() {
    for (const s of svgSlots) {
      const url = PAINT ? paintedUrl(s.get()) : null;
      if (url === s.purl) continue;
      s.purl = url;
      if (url) { s.painted.src = url; s.el.classList.add('has-painted'); } else { s.painted.removeAttribute('src'); s.el.classList.remove('has-painted'); }
    }
  }
  async function svgPass() {
    for (const s of svgSlots) {
      if (!flat) return;
      if (s.purl) { s.key = ''; continue; }
      const a = s.get();
      const humanoid = a && (a.kind === 'player' || (a.kind === 'npc' && !a.pet)) && a.look;
      const key = humanoid ? JSON.stringify([a.id, a.look.race, a.look.seed, a.look.custom || a.look.avatar || null, a.look.cls]) : '';
      if (key === s.key) continue;
      s.key = key;
      if (!humanoid) { s.el.classList.remove('has-live'); s.img.removeAttribute('src'); continue; }
      try { const av = await avatarFor({ ...a.look, gear: undefined }); if (s.key === key && flat) { s.img.src = svgPortrait(av); s.el.classList.add('has-live'); } } catch { /* keep the letter */ }
    }
  }
  /** Lights must be on the portrait layer too, or the face would be drawn with a different light set (a new shader). */
  function lightsOnLayer(now) {
    // re-scan every few seconds, and whenever a top-level group came or went (a light in a hidden group would change
    // the light set the face is drawn with, and that would compile a new shader)
    if (now - lightCheck < 5000 && scene.children.length === lightCount) return;
    lightCheck = now; lightCount = scene.children.length;
    lightTops.clear();
    for (const top of scene.children) top.traverse(o => { if (o.isLight) { o.layers.enable(PORTRAIT_LAYER); lightTops.add(top); } });
  }
  function frameFace(a) {
    const b = a.body;
    const head = b?.parts?.head;
    // Z54 (live #55): a humanoid MONSTER (a brigand, a Slagborn) has a face too — framed like a person's, at its own size
    // (it was framed as a beast, whole body, so a Giant came out a speck in the corner)
    const creature = !(a.kind === 'player' || a.kind === 'npc' || a.humanoid) || a.pet || !head;
    if (head && !creature) { head.getWorldPosition(_h); _h.y += a.height * 0.1; }
    else { const p = a.group.position; _h.set(p.x, p.y + (a.pickTop || a.height) * 0.62, p.z); }
    const r = creature ? Math.max(0.35, (a.pickR || 0.6) * 0.75, (a.pickTop || a.height) * 0.33) : Math.max(0.24, a.height * 0.2);
    const yaw = (a.model ? a.model.rotation.y : a.yaw || 0) + (creature ? 0.75 : 0.32);
    const dist = r / Math.sin(THREE.MathUtils.degToRad(cam.fov) / 2);
    cam.position.set(_h.x + Math.sin(yaw) * dist, _h.y + dist * 0.12, _h.z + Math.cos(yaw) * dist);
    cam.near = Math.max(0.03, dist - r * 3); cam.far = dist + r * 3;
    cam.lookAt(_h);
  }
  const gl = renderer.getContext();
  const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  function readAsync(s, x, y, w, h) {
    if (!gl2 || w < 2 || h < 2) return;
    if (!s.pbo || s.w !== w || s.h !== h) {
      if (s.pbo) gl.deleteBuffer(s.pbo);
      s.pbo = gl.createBuffer(); s.w = w; s.h = h; s.buf = new Uint8Array(w * h * 4); s.img = new ImageData(w, h);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
    } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo);
    gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    s.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }
  /** Collect finished read-backs (non-blocking: a fence that is not signalled yet waits for the next frame). */
  function collect() {
    for (const s of slots) {
      if (!s.fence) continue;
      const st = gl.clientWaitSync(s.fence, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) continue;
      gl.deleteSync(s.fence); s.fence = null;
      if (st === gl.WAIT_FAILED || !s.on) continue;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, s.buf);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      // GL rows run bottom-up
      const row = s.w * 4, d = s.img.data;
      for (let y = 0; y < s.h; y++) d.set(s.buf.subarray((s.h - 1 - y) * row, (s.h - y) * row), y * row);
      if (PAINT) { const t0 = performance.now(); paintFilter(d, s.w, s.h, s.w > 110 ? 3 : 2); stats.filterMs = Math.max(stats.filterMs || 0, performance.now() - t0); }
      if (s.cv.width !== s.w || s.cv.height !== s.h) { s.cv.width = s.w; s.cv.height = s.h; }
      s.ctx.putImageData(s.img, 0, 0);
      s.el.classList.add('has-live');
    }
  }
  /** Y33: may THIS pass draw into the game's canvas? Not in the phone layout, and not when the canvas box and its
   *  drawing buffer disagree (then "frame rectangle -> viewport" points somewhere else and the face shows in the open). */
  let crNow = null, crKept = null;
  // 2026-10-20 (combat-stutter trace): the canvas box was measured every frame (a forced page layout each time); it only
  // changes when the window does, so it is measured once and again on a resize
  const crRead = () => { crKept = renderer.domElement.getBoundingClientRect(); };
  function flatNow() {
    if (document.documentElement.dataset.layout === 'phone') { flatWhy = 'phone'; return true; }
    const cv = renderer.domElement;
    if (!crKept) { crRead(); try { new ResizeObserver(crRead).observe(cv); } catch { /* the window's resize still does it */ } addEventListener('resize', crRead); }
    crNow = crKept;
    if (!canvasMatches({ cssW: crNow.width, cssH: crNow.height, bufW: cv.width, bufH: cv.height, dpr: renderer.getPixelRatio() })) { flatWhy = 'canvas'; return true; }
    flatWhy = ''; return false;
  }
  function setFlat(f) {
    if (f === flat) return;
    flat = f; last = 0;
    for (const s of slots) {
      s.on = false; s.el.classList.remove('has-live');
      s.ctx.clearRect(0, 0, s.cv.width, s.cv.height);
      s.cv.style.display = f ? 'none' : ''; s.svg.img.style.display = f ? '' : 'none';
      s.svg.key = '';                              // the 2D picture is fetched again when we come back to it
    }
  }
  function pass() {
    const now = performance.now();
    paintedPass();
    if (!SOFT) setFlat(flatNow());
    if (flat) { if (!SOFT) collect(); if (now - last > 500) { last = now; svgPass(); } return; }
    collect();
    if (now - last < 1000 / fps) return;
    last = now;
    let any = false;
    for (const s of slots) {
      const a = s.get();
      // Y33: a square that is not wholly on the canvas would be clamped and drawn somewhere the frame does not cover
      const ok = !s.svg.purl && !!(a && a.body && a.model && a.lod !== 'far' && !a.dead && s.el.offsetParent !== null) && squareOnCanvas(s.el.getBoundingClientRect(), crNow);
      if (ok !== s.on) { s.on = ok; if (!ok) { s.el.classList.remove('has-live'); s.ctx.clearRect(0, 0, s.cv.width, s.cv.height); } }
      if (ok) any = true;
    }
    if (!any) return;
    lightsOnLayer(now);
    const t0 = performance.now();
    const cr = crNow, dpr = renderer.getPixelRatio();
    const info = renderer.info.render, keepInfo = { calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines };
    renderer.getViewport(vp); renderer.getScissor(sc);
    const scTest = renderer.getScissorTest(), ac = renderer.autoClear, sm = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(clear); const ca = renderer.getClearAlpha();
    renderer.shadowMap.autoUpdate = false;           // the shadows drawn for this frame are still right
    const mwa = scene.matrixWorldAutoUpdate; scene.matrixWorldAutoUpdate = false;   // matrices are this frame's already
    // only the bodies being drawn and the lights are walked: every other top-level group is switched off for the pass
    const keep = new Set(lightTops);
    for (const s of slots) { if (!s.on) continue; let o = s.get()?.group; while (o && o.parent && o.parent !== scene) o = o.parent; if (o) keep.add(o); }
    const hidden = [];
    for (const top of scene.children) if (top.visible && !keep.has(top)) { top.visible = false; hidden.push(top); }
    try {
      for (const s of slots) {
        if (!s.on || s.fence) continue;              // the last read-back has not come home yet
        const a = s.get();
        a.model.traverse(o => o.layers.enable(PORTRAIT_LAYER));    // parts swap on a gear change: cheap to repeat
        const rect = s.el.getBoundingClientRect();
        const w = Math.round(rect.width), hgt = Math.round(rect.height);
        if (w < 4 || hgt < 4) continue;
        const x = Math.max(0, Math.min(cr.width - w, Math.round(rect.left - cr.left)));
        const yTop = Math.max(0, Math.min(cr.height - hgt, Math.round(rect.top - cr.top)));
        frameFace(a);
        cam.aspect = w / hgt; cam.updateProjectionMatrix();
        const gy = cr.height - yTop - hgt;
        renderer.setViewport(x, gy, w, hgt); renderer.setScissor(x, gy, w, hgt); renderer.setScissorTest(true);
        renderer.setClearColor(0x1a1612, 1); renderer.autoClear = false; renderer.clear(true, true, false);
        renderer.render(scene, cam);
        // read the square back WITHOUT waiting for the GPU: a pixel-pack buffer + a fence, collected on a later frame
        // (drawImage / readPixels straight from the canvas stall until the whole frame is drawn — 440 ms here)
        if (!s.fence) readAsync(s, Math.round(x * dpr), Math.round(gy * dpr), Math.round(w * dpr), Math.round(hgt * dpr));
        stats.renders++;
      }
    } finally {
      renderer.setViewport(vp); renderer.setScissor(sc); renderer.setScissorTest(scTest); renderer.setClearColor(clear, ca); renderer.autoClear = ac;
      renderer.shadowMap.autoUpdate = sm;
      scene.matrixWorldAutoUpdate = mwa;
      for (const top of hidden) top.visible = true;
      Object.assign(info, keepInfo);
    }
    stats.maxMs = Math.max(stats.maxMs, performance.now() - t0);
  }

  // ---------------------------------------------------------------- static
  const mem = new Map(), waiting = new Set(), queue = [], listeners = new Set(), looks = new Map();
  let dbP = null, busy = false, R = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(res => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(OS); r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null); } catch { res(null); } });
    return dbP;
  }
  const ready = (async () => {
    const d = await db(); if (!d) return;
    await new Promise(res => { try { const req = d.transaction(OS, 'readonly').objectStore(OS).openCursor(); req.onsuccess = () => { const c = req.result; if (!c) return res(); const k = String(c.key); if (k.startsWith(VER + ':') && c.value instanceof Blob) mem.set(k.slice(VER.length + 1), URL.createObjectURL(c.value)); c.continue(); }; req.onerror = () => res(); } catch { res(); } });
    if (mem.size) for (const fn of listeners) { try { fn(null); } catch {} }
  })();
  const keyOf = look => `${look.race || 'human'}|${look.cls || ''}|${(look.seed >>> 0) || 1}|${look.avatar || look.custom ? JSON.stringify(look.avatar || look.custom).length + ':' + hash(JSON.stringify(look.avatar || look.custom)) : ''}`;
  function img(look, key = null) {
    if (!look) return null;
    const k = key || keyOf(look);
    const hit = mem.get(k);
    if (hit) return hit;
    if (!waiting.has(k)) { waiting.add(k); queue.push({ k, look }); pump(); }
    return null;
  }
  const idle = () => new Promise(r => setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(r, { timeout: 900 }) : r()), 400));
  async function pump() {
    if (busy || !queue.length) return;
    busy = true;
    try {
      await ready;
      while (queue.length) {
        await idle();
        const job = queue.shift();
        if (mem.has(job.k)) { waiting.delete(job.k); continue; }
        let blob = null;
        try { blob = await shoot(job.look); } catch (e) { console.warn('[portrait]', e.message); }
        waiting.delete(job.k);
        if (!blob) continue;
        mem.set(job.k, URL.createObjectURL(blob));
        db().then(d => { try { d?.transaction(OS, 'readwrite').objectStore(OS).put(blob, VER + ':' + job.k); } catch {} });
        for (const fn of listeners) { try { fn(job.k); } catch {} }
      }
    } finally { busy = false; }
  }
  function stage() {
    if (R) return R;
    const canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    r.setPixelRatio(1); r.setSize(SIZE, SIZE, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.setClearColor(0x000000, 0);
    const sc2 = new THREE.Scene();
    sc2.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3028, 1.5));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-2, 3, 4); sc2.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4); rim.position.set(3, 2, -4); sc2.add(rim);
    R = { r, scene: sc2, camera: new THREE.PerspectiveCamera(28, 1, 0.01, 50), canvas };
    return R;
  }
  async function shoot(look) {
    if (!avatarFor) return null;
    if (SOFT) { const av = await avatarFor({ ...look, gear: undefined }); return new Blob([decodeURIComponent(svgPortrait(av).split(',')[1])], { type: 'image/svg+xml' }); }
    if (!createBody) return null;
    const av = await avatarFor(look);
    const body = await createBody(av);
    await new Promise(r => setTimeout(r, 0));               // give the frame back between building and drawing
    const { r, scene: s2, camera, canvas } = stage();
    s2.add(body.group);
    // Chibi 2.5 blinks and glances on its own: a still picture is taken with the eyes open, looking ahead
    body.setBlink?.(0); body.setGaze?.(0, 0);
    body.setAnim?.('idle', 0); for (let i = 0; i < 3; i++) body.update?.(0.15);
    body.group.updateMatrixWorld(true);
    const H = body.metrics?.().height || 1.8;
    const head = body.parts?.head;
    const t = new THREE.Vector3();
    if (head) { head.getWorldPosition(t); t.y += H * 0.1; } else t.set(0, H * 0.85, 0);
    const rad = H * 0.2, dist = rad / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
    camera.position.set(t.x + Math.sin(0.32) * dist, t.y + dist * 0.12, t.z + Math.cos(0.32) * dist);
    camera.near = 0.01; camera.far = dist + 5; camera.lookAt(t); camera.updateProjectionMatrix();
    r.clear(); r.render(s2, camera);
    // read back WITHOUT blocking: pixel-pack buffer + fence, collected on a later tick (drawImage would wait for the GPU)
    const g2 = r.getContext(), buf = new Uint8Array(SIZE * SIZE * 4), pbo = g2.createBuffer();
    g2.bindBuffer(g2.PIXEL_PACK_BUFFER, pbo); g2.bufferData(g2.PIXEL_PACK_BUFFER, buf.length, g2.STREAM_READ);
    g2.readPixels(0, 0, SIZE, SIZE, g2.RGBA, g2.UNSIGNED_BYTE, 0); g2.bindBuffer(g2.PIXEL_PACK_BUFFER, null);
    const fence = g2.fenceSync(g2.SYNC_GPU_COMMANDS_COMPLETE, 0); g2.flush();
    s2.remove(body.group); body.dispose?.();
    for (let i = 0; i < 300; i++) { const st = g2.clientWaitSync(fence, 0, 0); if (st !== g2.TIMEOUT_EXPIRED) break; await new Promise(res => setTimeout(res, 50)); }
    g2.deleteSync(fence);
    g2.bindBuffer(g2.PIXEL_PACK_BUFFER, pbo); g2.getBufferSubData(g2.PIXEL_PACK_BUFFER, 0, buf); g2.bindBuffer(g2.PIXEL_PACK_BUFFER, null); g2.deleteBuffer(pbo);
    const out = document.createElement('canvas'); out.width = SIZE; out.height = SIZE;
    const img = new ImageData(SIZE, SIZE), row = SIZE * 4;
    for (let y = 0; y < SIZE; y++) img.data.set(buf.subarray((SIZE - 1 - y) * row, (SIZE - y) * row), y * row);
    out.getContext('2d').putImageData(img, 0, 0);
    return new Promise(res => out.toBlob(b => res(b), 'image/png'));
  }

  return {
    live, pass, img, ready,
    onReady(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** A player's look seen in the world (info.look), kept for later static portraits by character id / name. */
    remember(id, look) { if (id != null && look) looks.set(String(id), look); },
    lookOf(id) { return looks.get(String(id)) || null; },
    get stats() { return { ...stats, painted: svgSlots.filter(s => s.purl).length, software: SOFT, flat, flatWhy, live: slots.filter(s => s.on).length, cached: mem.size, waiting: waiting.size }; },
  };
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
