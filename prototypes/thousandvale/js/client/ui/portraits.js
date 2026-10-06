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

export const PORTRAIT_LAYER = 1;
const VERSION = 'p1';
const SIZE = 96;
const DB = 'tv-portraits', OS = 'p';

export function createPortraits({ renderer, scene, avatarFor, createBody, fps = 6 } = {}) {
  // ---------------------------------------------------------------- live
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 6);
  cam.layers.set(PORTRAIT_LAYER);
  const slots = [];
  let last = 0, lightCheck = 0, lightCount = -1;
  const lightTops = new Set();      // top-level scene children that hold a light (always walked: same light set = no new shader)
  const vp = new THREE.Vector4(), sc = new THREE.Vector4(), clear = new THREE.Color(), _h = new THREE.Vector3();
  const stats = { renders: 0, maxMs: 0 };

  function live(el, get, { kind = 'self' } = {}) {
    const cv = document.createElement('canvas');
    cv.className = 'portrait-live';
    el.prepend(cv);
    const s = { el, cv, ctx: cv.getContext('2d'), get, kind, on: false, actorId: null, pbo: null, fence: null, w: 0, h: 0, buf: null, img: null };
    slots.push(s);
    return s;
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
    const creature = !(a.kind === 'player' || a.kind === 'npc') || a.pet || !head;
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
      if (s.cv.width !== s.w || s.cv.height !== s.h) { s.cv.width = s.w; s.cv.height = s.h; }
      s.ctx.putImageData(s.img, 0, 0);
      s.el.classList.add('has-live');
    }
  }
  function pass() {
    const now = performance.now();
    collect();
    if (now - last < 1000 / fps) return;
    last = now;
    let any = false;
    for (const s of slots) {
      const a = s.get();
      const ok = !!(a && a.body && a.model && a.lod !== 'far' && !a.dead && s.el.offsetParent !== null);
      if (ok !== s.on) { s.on = ok; if (!ok) { s.el.classList.remove('has-live'); s.ctx.clearRect(0, 0, s.cv.width, s.cv.height); } }
      if (ok) any = true;
    }
    if (!any) return;
    lightsOnLayer(now);
    const t0 = performance.now();
    const cr = renderer.domElement.getBoundingClientRect(), dpr = renderer.getPixelRatio();
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
    await new Promise(res => { try { const req = d.transaction(OS, 'readonly').objectStore(OS).openCursor(); req.onsuccess = () => { const c = req.result; if (!c) return res(); const k = String(c.key); if (k.startsWith(VERSION + ':') && c.value instanceof Blob) mem.set(k.slice(VERSION.length + 1), URL.createObjectURL(c.value)); c.continue(); }; req.onerror = () => res(); } catch { res(); } });
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
        db().then(d => { try { d?.transaction(OS, 'readwrite').objectStore(OS).put(blob, VERSION + ':' + job.k); } catch {} });
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
    if (!createBody || !avatarFor) return null;
    const av = await avatarFor(look);
    const body = await createBody(av);
    await new Promise(r => setTimeout(r, 0));               // give the frame back between building and drawing
    const { r, scene: s2, camera, canvas } = stage();
    s2.add(body.group);
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
    const out = document.createElement('canvas'); out.width = SIZE; out.height = SIZE;
    out.getContext('2d').drawImage(canvas, 0, 0);
    s2.remove(body.group); body.dispose?.();
    return new Promise(res => out.toBlob(b => res(b), 'image/png'));
  }

  return {
    live, pass, img, ready,
    onReady(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** A player's look seen in the world (info.look), kept for later static portraits by character id / name. */
    remember(id, look) { if (id != null && look) looks.set(String(id), look); },
    lookOf(id) { return looks.get(String(id)) || null; },
    get stats() { return { ...stats, live: slots.filter(s => s.on).length, cached: mem.size, waiting: waiting.size }; },
  };
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
