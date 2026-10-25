// The minimap (round, top-right under the ☰ / ! corner buttons, turning with the camera so "up" is where you look)
// and the full map screen (north up; pan + zoom with mouse, touch and controller; a pin you place is shared with the
// room). Both draw the world view's map picture (view.mapImage(), a canvas covering the whole world) with markers on
// top: you, the other drivers (with names), every vehicle (an icon per kind), the flag, home, the flag's site, and
// everyone's pins.
//
// Positions are world metres (x, z). Directions are ground vectors [dx, dz] (no yaw convention to get wrong).
// The map picture is assumed to cover x, z in [-size/2, size/2] with +x to the right and +z DOWN the picture
// (setWorld({ flipZ: true }) if the world view draws +z up).
import { el } from './dom.js';

export const PIN_COLORS = ['#ffcf3a', '#5ad1ff', '#ff6b8a', '#8cf07a', '#c49bff', '#ff9a3c', '#3cf0c8', '#f2f2f2', '#ff5ad1', '#9ab0ff', '#d6ff5a', '#ffb3a0'];
export const pinColor = pid => PIN_COLORS[(Math.max(1, pid) - 1) % PIN_COLORS.length];
const KIND_COLORS = { trail_jeep: '#e8a33c', dirtbike: '#e2553d' };
const kindColor = k => KIND_COLORS[k] || '#c8d0d8';
const isBike = k => /bike|cycle|moto/.test(String(k));

/** The marker painter both maps share. `toScreen(x, z)` -> [sx, sy]; `rot` turns ground directions. */
function paintMarkers(c, M, toScreen, { rot = 0, scale = 1, names = {}, clampTo = null, you = null } = {}) {
  const P = (x, z) => toScreen(x, z);
  const dirAng = d => (d ? Math.atan2(d[1], d[0]) + rot : 0);
  const clamp = clampTo ? (([x, y]) => { const dx = x - clampTo.cx, dy = y - clampTo.cy, m = Math.hypot(dx, dy); return m > clampTo.r ? [clampTo.cx + dx / m * clampTo.r, clampTo.cy + dy / m * clampTo.r, true] : [x, y, false]; }) : (p => [p[0], p[1], false]);
  c.save();
  c.lineJoin = 'round';
  // home ring
  if (M.home) {
    const [hx, hy] = P(M.home.x, M.home.z), [sx, sy, out] = clamp([hx, hy]);
    if (!out) { c.beginPath(); c.arc(hx, hy, Math.max(5, M.home.r * scale), 0, Math.PI * 2); c.fillStyle = 'rgba(90,210,120,.22)'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#5ad27a'; c.stroke(); }
    glyph(c, sx, sy, 'home');
  }
  // the flag's site (where it starts)
  if (M.site) { const [sx, sy] = clamp(P(M.site.x, M.site.z)); glyph(c, sx, sy, 'site'); }
  // pins
  for (const pin of M.pins || []) { const [sx, sy] = clamp(P(pin.x, pin.z)); glyph(c, sx, sy, 'pin', pinColor(pin.pid)); }
  // vehicles
  for (const v of M.vehicles || []) {
    const [sx, sy] = P(v.x, v.z);
    if (clampTo && Math.hypot(sx - clampTo.cx, sy - clampTo.cy) > clampTo.r) continue;
    c.save(); c.translate(sx, sy); c.rotate(dirAng(v.dir) + Math.PI / 2);
    c.fillStyle = kindColor(v.kind); c.strokeStyle = '#101418'; c.lineWidth = 1.5;
    if (isBike(v.kind)) { c.beginPath(); c.roundRect(-2.2, -6, 4.4, 12, 2); c.fill(); c.stroke(); }
    else { c.beginPath(); c.roundRect(-4.5, -7, 9, 14, 3); c.fill(); c.stroke(); c.fillStyle = '#101418'; c.fillRect(-3, -4.5, 6, 3); }
    c.restore();
  }
  // other drivers
  c.font = '700 11px system-ui, sans-serif'; c.textAlign = 'center';
  for (const p of M.players || []) {
    const [sx, sy] = P(p.x, p.z);
    if (clampTo && Math.hypot(sx - clampTo.cx, sy - clampTo.cy) > clampTo.r) continue;
    c.beginPath(); c.arc(sx, sy, 4.5, 0, Math.PI * 2); c.fillStyle = pinColor(p.pid); c.fill(); c.lineWidth = 2; c.strokeStyle = '#101418'; c.stroke();
    const n = names[p.pid]; if (n) { c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(n, sx, sy - 8); c.fillStyle = '#fff'; c.fillText(n, sx, sy - 8); }
  }
  // the flag
  if (M.flag) { const [sx, sy] = clamp(P(M.flag.x, M.flag.z)); glyph(c, sx, sy, 'flag'); }
  // you, on top
  if (you) {
    const [sx, sy] = P(you.x, you.z);
    c.save(); c.translate(sx, sy); c.rotate(dirAng(you.dir) + Math.PI / 2);
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.5); c.lineTo(-6.5, 7); c.closePath();
    c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = '#101418'; c.stroke();
    c.restore();
  }
  c.restore();
}
function glyph(c, x, y, kind, color) {
  c.save(); c.translate(x, y); c.lineWidth = 2; c.strokeStyle = '#101418';
  if (kind === 'flag') { c.fillStyle = '#ff3b3b'; c.beginPath(); c.moveTo(-3, 8); c.lineTo(-3, -9); c.lineTo(8, -5); c.lineTo(-3, -1); c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-3, 8); c.lineTo(-3, -9); c.stroke(); }
  else if (kind === 'home') { c.fillStyle = '#5ad27a'; c.beginPath(); c.moveTo(0, -8); c.lineTo(7, -1); c.lineTo(5, -1); c.lineTo(5, 6); c.lineTo(-5, 6); c.lineTo(-5, -1); c.lineTo(-7, -1); c.closePath(); c.fill(); c.stroke(); }
  else if (kind === 'site') { c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fillStyle = 'rgba(255,59,59,.25)'; c.fill(); c.strokeStyle = '#ff3b3b'; c.stroke(); c.beginPath(); c.arc(0, 0, 2.5, 0, Math.PI * 2); c.fillStyle = '#ff3b3b'; c.fill(); }
  else if (kind === 'pin') { c.fillStyle = color || '#ffcf3a'; c.beginPath(); c.moveTo(0, 9); c.bezierCurveTo(-8, -1, -6, -10, 0, -10); c.bezierCurveTo(6, -10, 8, -1, 0, 9); c.fill(); c.stroke(); c.beginPath(); c.arc(0, -4, 2.2, 0, Math.PI * 2); c.fillStyle = '#101418'; c.fill(); }
  c.restore();
}

/** The world's map picture + size, shared by both maps. */
export function createMapModel() {
  const W = { size: 1536, image: null, flipZ: false };
  return {
    W,
    set({ size, image, flipZ } = {}) { if (size) W.size = size; if (image !== undefined) W.image = image; if (flipZ != null) W.flipZ = !!flipZ; },
    /** world -> picture fraction 0..1 */
    uv(x, z) { const S = W.size; return [(x + S / 2) / S, W.flipZ ? 1 - (z + S / 2) / S : (z + S / 2) / S]; },
    world(u, v) { const S = W.size; return [u * S - S / 2, (W.flipZ ? 1 - v : v) * S - S / 2]; },
  };
}

// ---------------------------------------------------------------------------------------------------- minimap
export function createMinimap(model) {
  const box = el('div', 'rl-minimap'); const cv = el('canvas'); box.append(cv);
  const ring = el('div', 'rl-mm-north', 'N'); box.append(ring);
  let last = 0;
  const RANGE = 170;                 // metres from the middle to the rim
  function draw(M, names, force = false) {
    const t = performance.now(); if (!force && t - last < 66) return; last = t;     // 15 a second is plenty
    const r = box.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, devicePixelRatio || 1), Wp = Math.round(r.width * dpr);
    if (cv.width !== Wp) { cv.width = Wp; cv.height = Wp; }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const D = r.width, cx = D / 2, cy = D / 2, rad = D / 2 - 2, k = rad / RANGE;
    c.clearRect(0, 0, D, D);
    c.save(); c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#2b3a2e'; c.fillRect(0, 0, D, D);
    const you = M.you || { x: 0, z: 0 }, f = M.camDir || you.dir || [0, -1];
    const rot = -Math.PI / 2 - Math.atan2(f[1], f[0]);
    const zs = model.W.flipZ ? -1 : 1;
    const toScreen = (x, z) => { const dx = (x - you.x) * k, dz = (z - you.z) * k * zs; const cs = Math.cos(rot), sn = Math.sin(rot); return [cx + dx * cs - dz * sn, cy + dx * sn + dz * cs]; };
    if (model.W.image) {
      const S = model.W.size, img = model.W.image;
      c.save(); c.translate(cx, cy); c.rotate(rot);
      const [u, v] = model.uv(you.x, you.z), px = S * k;
      c.drawImage(img, -u * px, -v * px, px, px);
      c.restore();
    }
    const drot = model.W.flipZ ? -rot : rot;
    paintMarkers(c, M, toScreen, { rot: drot, scale: k, names, clampTo: { cx, cy, r: rad - 9 }, you: M.you ? { ...you, dir: f && M.you.dir ? M.you.dir : f } : null });
    c.restore();
    c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.lineWidth = 3; c.strokeStyle = 'rgba(10,14,18,.9)'; c.stroke();
    // the N marker rides the rim (north = the top of the map picture)
    const north = toScreen(you.x, you.z - (model.W.flipZ ? -1 : 1) * 1000), dx = north[0] - cx, dy = north[1] - cy, m = Math.hypot(dx, dy) || 1;
    ring.style.transform = `translate(${dx / m * (rad - 1)}px, ${dy / m * (rad - 1)}px)`;
  }
  return { el: box, draw };
}

// ---------------------------------------------------------------------------------------------------- full map
/** The full map screen. open() returns { close }. `getData()` -> the latest markers; `onPin([x,z]|null)`. */
export function openMapScreen({ model, layers, getData, names, onPin, legendExtra = '' }) {
  const node = el('div', 'rl-mapscreen', `
    <canvas class="rl-mapcv"></canvas>
    <div class="rl-map-top"><button class="rl-btn" data-back>‹ Back</button><b class="rl-map-title">Map</b>
      <span class="rl-map-tools"><button class="rl-btn small" data-zin aria-label="Zoom in">+</button><button class="rl-btn small" data-zout aria-label="Zoom out">−</button>
      <button class="rl-btn small" data-me>On me</button><button class="rl-btn small" data-pinmode>Place pin</button><button class="rl-btn small" data-clearpin>Clear pin</button></span></div>
    <div class="rl-map-legend"><span><i class="lg you"></i>You</span><span><i class="lg pl"></i>Drivers</span><span><i class="lg veh"></i>Vehicles</span><span><i class="lg flag"></i>Flag</span><span><i class="lg home"></i>Home</span><span><i class="lg site"></i>Flag site</span><span><i class="lg pin"></i>Pins</span>${legendExtra}</div>
    <div class="rl-map-hint"></div><div class="rl-map-cross" hidden></div>`);
  const cv = node.querySelector('canvas'), hint = node.querySelector('.rl-map-hint'), cross = node.querySelector('.rl-map-cross');
  let zoom = 1, cx = 0, cz = 0, pinMode = false, raf = 0, closed = false;
  const d0 = getData(); if (d0.you) { cx = d0.you.x; cz = d0.you.z; }
  const fit = () => { const r = cv.getBoundingClientRect(); return Math.min(r.width, r.height) / model.W.size; };   // px per metre at zoom 1
  const toScreen = (x, z) => { const r = cv.getBoundingClientRect(), k = fit() * zoom, zs = model.W.flipZ ? -1 : 1; return [r.width / 2 + (x - cx) * k, r.height / 2 + (z - cz) * k * zs]; };
  const toWorld = (sx, sy) => { const r = cv.getBoundingClientRect(), k = fit() * zoom, zs = model.W.flipZ ? -1 : 1; return [cx + (sx - r.width / 2) / k, cz + (sy - r.height / 2) / k * zs]; };
  const clampView = () => { const h = model.W.size / 2; cx = Math.max(-h, Math.min(h, cx)); cz = Math.max(-h, Math.min(h, cz)); zoom = Math.max(0.8, Math.min(14, zoom)); };
  const setHint = () => { hint.textContent = pinMode ? 'Tap the map to place your pin. Everyone in the room sees it.' : 'Drag to move, pinch or scroll to zoom.'; node.querySelector('[data-pinmode]').classList.toggle('on', pinMode); cross.hidden = !padUsed; };
  let padUsed = false;
  function draw() {
    if (closed) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#1d2722'; c.fillRect(0, 0, r.width, r.height);
    const k = fit() * zoom, S = model.W.size;
    if (model.W.image) { const [x0, y0] = toScreen(-S / 2, model.W.flipZ ? S / 2 : -S / 2); c.imageSmoothingEnabled = zoom < 4; c.drawImage(model.W.image, x0, y0, S * k, S * k); }
    const M = getData();
    paintMarkers(c, M, toScreen, { rot: 0, scale: k, names: names(), you: M.you || null });
    // labels (place names) from the world
    if (M.labels && zoom > 1.6) { c.font = '700 12px system-ui, sans-serif'; c.textAlign = 'center'; for (const L of M.labels) { const [sx, sy] = toScreen(L.x, L.z); c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(L.text, sx, sy); c.fillStyle = '#f4ecd6'; c.fillText(L.text, sx, sy); } }
    raf = requestAnimationFrame(draw);
  }
  // ---- mouse / touch
  const ptrs = new Map(); let moved = 0, pinch = null;
  cv.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; try { cv.setPointerCapture(e.pointerId); } catch { /* not live */ } if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; } });
  cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()]; zoom = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d); clampView(); moved += 99; return; }
    moved += Math.abs(dx) + Math.abs(dy);
    const k = fit() * zoom; cx -= dx / k; cz -= dy / k * (model.W.flipZ ? -1 : 1); clampView();
  });
  const up = e => {
    const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (had && moved < 8 && pinMode) { const r = cv.getBoundingClientRect(); const [x, z] = toWorld(e.clientX - r.left, e.clientY - r.top); onPin([Math.round(x), Math.round(z)]); pinMode = false; setHint(); }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); pinch = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(), before = toWorld(e.clientX - r.left, e.clientY - r.top); zoom *= e.deltaY < 0 ? 1.18 : 1 / 1.18; clampView(); const after = toWorld(e.clientX - r.left, e.clientY - r.top); cx += before[0] - after[0]; cz += before[1] - after[1]; clampView(); }, { passive: false });
  node.addEventListener('click', e => {
    if (e.target.closest('[data-zin]')) { zoom *= 1.5; clampView(); }
    else if (e.target.closest('[data-zout]')) { zoom /= 1.5; clampView(); }
    else if (e.target.closest('[data-me]')) { const d = getData(); if (d.you) { cx = d.you.x; cz = d.you.z; } }
    else if (e.target.closest('[data-pinmode]')) { pinMode = !pinMode; setHint(); }
    else if (e.target.closest('[data-clearpin]')) onPin(null);
    else if (e.target.closest('[data-back]')) close();
  });
  // ---- keyboard + controller: stick / WASD pans, triggers / +- zoom, A or Enter pins the middle, X clears
  const keys = new Set();
  const onKey = e => { if (closed) return; if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code);
    if (e.type === 'keydown' && (e.code === 'Enter' || e.code === 'NumpadEnter') && !e.target.closest?.('button')) { pinCentre(); e.preventDefault(); }
    if (e.type === 'keydown' && (e.code === 'Equal' || e.code === 'NumpadAdd')) { zoom *= 1.4; clampView(); }
    if (e.type === 'keydown' && (e.code === 'Minus' || e.code === 'NumpadSubtract')) { zoom /= 1.4; clampView(); } };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  function pinCentre() { onPin([Math.round(cx), Math.round(cz)]); }
  let prevBtns = null, lastT = performance.now();
  function tick() {
    if (closed) return;
    const t = performance.now(), dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    let px = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0), pz = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0), zz = 0;
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (pad) {
      const ax = a => (Math.abs(pad.axes[a] || 0) > 0.18 ? pad.axes[a] : 0);
      const b = pad.buttons.map(x => !!x?.pressed);
      if (prevBtns) {
        const edge = i => b[i] && !prevBtns[i];
        if (edge(0)) pinCentre();
        if (edge(2)) onPin(null);
        if (edge(1) || edge(8)) close();
      }
      prevBtns = b;
      if (ax(0) || ax(1) || ax(2) || ax(3) || b.some(Boolean)) { padUsed = true; cross.hidden = false; }
      px += ax(0) + (b[15] ? 1 : 0) - (b[14] ? 1 : 0); pz += ax(1) + (b[13] ? 1 : 0) - (b[12] ? 1 : 0);
      zz += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0) - ax(3);
    }
    if (px || pz) { const k = fit() * zoom; cx += px * 420 * dt / k; cz += pz * 420 * dt / k * (model.W.flipZ ? -1 : 1); clampView(); }
    if (zz) { zoom *= Math.exp(zz * 1.6 * dt); clampView(); }
    if (!closed) setTimeout(tick, 16);
  }
  const rec = layers.push(node, { kind: 'map', onBack: () => close(), ownPad: true });
  function close() { if (closed) return; closed = true; cancelAnimationFrame(raf); removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); rec.close(); }
  setHint(); draw(); tick();
  return { close, get open() { return !closed; } };
}
