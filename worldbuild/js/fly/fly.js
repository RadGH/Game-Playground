// World Build fly view — a free camera over the streamed world, with the streamer's numbers on screen.
//
//   const F = await openFly({ canvas, panel, ask, info, at: [x, z], quality, onClose })
//   F.goTo(x, z, { height, yaw, pitch })   F.stats()   F.settle(timeoutMs) → Promise   F.close()
//
// Controls: W A S D / arrows fly (W is the way the camera looks), Q / E or Space / Shift down / up, drag to look,
// wheel = speed. Touch: drag the left half to fly, the right half to look, two buttons for up and down.
// Gamepad: left stick fly, right stick look, triggers down / up. The camera never goes under the ground.

import * as THREE from 'three';
import { createStream, QUALITY } from './stream.js';

export async function openFly({ canvas, panel, ask, info, at, quality = 'medium', onClose = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const sky = new THREE.Color('#9cc3e0');
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, QUALITY[quality].fog * 0.35, QUALITY[quality].fog);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 14000);
  scene.add(new THREE.HemisphereLight('#dfeeff', '#5a6a40', 1.25));
  const sun = new THREE.DirectionalLight('#fff2dc', 1.9); sun.position.set(-0.5, 1, 0.35); scene.add(sun);

  const S = await createStream({ scene, renderer, ask, info, quality });
  let yaw = 0, pitch = -0.18, speed = 40;
  const pos = camera.position;
  function goTo(x, z, { height = 60, yaw: y = yaw, pitch: p = -0.25 } = {}) {
    pos.set(x, height + 0, z); yaw = y; pitch = p; S.update(camera); groundY = null; wantHeight = height;
  }
  let groundY = null, wantHeight = 60;
  goTo(at[0], at[1], { height: 70 });

  // ---------------------------------------------------------------- input
  const keys = new Set();
  const onKey = e => { if (e.target.closest?.('input, select, textarea')) return; const down = e.type === 'keydown'; if (down) keys.add(e.code); else keys.delete(e.code); if (down && e.code === 'Escape') close(); };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  let drag = null;
  const touchMove = { x: 0, y: 0 }, touchLook = { x: 0, y: 0 };
  const pointers = new Map();
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, left: e.pointerType === 'touch' && e.clientX < canvas.clientWidth / 2 }); });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (p.left) { touchMove.x = Math.max(-1, Math.min(1, (e.clientX - p.sx) / 60)); touchMove.y = Math.max(-1, Math.min(1, (e.clientY - p.sy) / 60)); }
    else { yaw -= dx * 0.004; pitch = Math.max(-1.45, Math.min(1.2, pitch - dy * 0.004)); }
  });
  const up = e => { const p = pointers.get(e.pointerId); if (p?.left) { touchMove.x = 0; touchMove.y = 0; } pointers.delete(e.pointerId); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); speed = Math.max(5, Math.min(400, speed * (e.deltaY > 0 ? 0.85 : 1.18))); }, { passive: false });
  let climb = 0;
  panel.querySelectorAll('[data-climb]').forEach(b => {
    const v = Number(b.dataset.climb);
    b.addEventListener('pointerdown', () => { climb = v; }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { climb = 0; });
  });
  void drag; void touchLook;

  // ---------------------------------------------------------------- loop
  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); } };
  let last = performance.now(), running = true, fps = 0, frames = 0, fpsT = last;
  const lastInfo = { calls: 0, triangles: 0 };
  function tick(now) {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    resize();
    // move
    const pad = navigator.getGamepads?.().find(g => g && g.connected);
    let fx = 0, fz = 0, fy = climb;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
    if (keys.has('KeyE') || keys.has('Space')) fy += 1;
    if (keys.has('KeyQ') || keys.has('ShiftLeft')) fy -= 1;
    fx += touchMove.x; fz -= touchMove.y;
    if (pad) {
      const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
      fx += dz(pad.axes[0]); fz -= dz(pad.axes[1]);
      yaw -= dz(pad.axes[2] || 0) * dt * 2.2; pitch = Math.max(-1.45, Math.min(1.2, pitch - dz(pad.axes[3] || 0) * dt * 1.8));
      fy += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0);
    }
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    pos.addScaledVector(fwd, fz * speed * dt).addScaledVector(right, fx * speed * dt);
    pos.y += fy * speed * dt;
    const g = S.heightAt(pos.x, pos.z);
    if (groundY === null && g) { groundY = g; pos.y = Math.max(pos.y, g + wantHeight); }
    pos.y = Math.max(pos.y, g + 1.8);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    S.update(camera);
    renderer.render(scene, camera);
    lastInfo.calls = renderer.info.render.calls; lastInfo.triangles = renderer.info.render.triangles;
    frames++;
    if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; paintStats(); }
  }
  requestAnimationFrame(tick);

  const statsEl = panel.querySelector('[data-fly-stats]');
  function stats() {
    const s = S.stats();
    return { ...s, drawCalls: lastInfo.calls, triangles: lastInfo.triangles, fps, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, gpuGeometries: renderer.info.memory.geometries, gpuTextures: renderer.info.memory.textures, at: [Math.round(pos.x), Math.round(pos.z)], height: Math.round(pos.y - S.heightAt(pos.x, pos.z)) };
  }
  const fmt = v => (v == null ? '–' : v.toLocaleString('en'));
  function paintStats() {
    if (!statsEl) return;
    const s = stats();
    const rows = [
      ['Frame rate', `${s.fps} fps`], ['Draw calls', fmt(s.drawCalls)], ['Triangles', fmt(s.triangles)],
      ['Ground chunks', `${s.chunksDrawn} drawn, ${s.chunksCached} kept (${s.chunkMB} MB)`], ['Chunk sizes', Object.entries(s.bySize).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${v}×${k >= 1000 ? k / 1024 + ' km' : k + ' m'}`).join(' ') || '–'],
      ['Chunk load', `${s.chunkMs.avg} ms (nearest ${s.chunkMs.nearAvg} ms, worst ${s.chunkMs.max} ms)`], ['Mesh build', `${s.buildMs.avg} ms (worst ${s.buildMs.max} ms)`],
      ['Trees', `${fmt(s.trees)} in ${s.tiles} tiles, ${s.treeMeshes} meshes`], ['Tile load', `${s.tileMs.avg} ms (worst ${s.tileMs.max} ms)`],
      ['Towns / bridges', `${s.towns} / ${s.bridges}`], ['Memory', s.heapMB != null ? `${s.heapMB} MB script heap` : 'not shown by this browser'], ['Where', `${s.at.join(', ')} · ${s.height} m up`],
    ];
    statsEl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + (s.note ? `<dt>Note</dt><dd>${s.note}</dd>` : '');
  }
  function settle(timeout = 60000) {
    const t0 = performance.now();
    return new Promise(res => { const check = () => { if (S.settled() || performance.now() - t0 > timeout) res(S.settled()); else setTimeout(check, 150); }; setTimeout(check, 300); });
  }
  function close() {
    if (!running) return;
    running = false;
    removeEventListener('keydown', onKey); removeEventListener('keyup', onKey);
    S.dispose(); renderer.dispose(); renderer.forceContextLoss();   // (a fresh view each open: never pile up GL contexts)
    onClose();
  }
  return { goTo, stats, settle, close, camera, setSpeed: v => { speed = v; } };
}
