// One WebGLRenderer, one scene, N viewports (PLAN §10).
//
// Each viewport = { id, camera, rect:{x,y,w,h} in CSS px of the canvas, extra?:fn }. The renderer
// scissors each one in turn. M1 uses one viewport; split screen (M2) adds a second with the same
// call, and the portrait (stream C, js/view/portrait.js) registers a small extra pass through
// `addPass(fn)` so it never needs a second WebGL context.

import * as THREE from 'three';

export function createRenderer(canvas, { pixelRatio = Math.min(window.devicePixelRatio || 1, 2) } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  renderer.shadowMap.enabled = false;           // contact/blob shadows only (two cameras = two passes)

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a3540);
  scene.fog = new THREE.Fog(0x4a5a64, 120, 320);

  // Lighting: warm sun from the south-west, cool sky fill, faint bounce.
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a3f2c, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.1);
  sun.position.set(-60, 110, 70);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 0.45);
  rim.position.set(80, 40, -90);
  scene.add(rim);

  const viewports = [];
  const passes = new Set();          // extra passes run after every viewport: fn(renderer, size)
  let scale = 1;                     // dynamic resolution 0.6-1.0 (PLAN §15.1)
  const size = { w: 1, h: 1 };

  function resize() {
    const r = canvas.getBoundingClientRect();
    size.w = Math.max(1, Math.floor(r.width)); size.h = Math.max(1, Math.floor(r.height));
    renderer.setPixelRatio(pixelRatio * scale);
    renderer.setSize(size.w, size.h, false);
    for (const vp of viewports) vp.layout?.(size);
    for (const vp of viewports) if (vp.camera.isPerspectiveCamera) {
      vp.camera.aspect = vp.rect.w / Math.max(1, vp.rect.h);
      vp.camera.updateProjectionMatrix();
    }
  }

  function render() {
    renderer.setScissorTest(true);
    renderer.setClearColor(scene.background, 1);
    renderer.setViewport(0, 0, size.w, size.h);
    renderer.setScissor(0, 0, size.w, size.h);
    renderer.clear();
    for (const vp of viewports) {
      const { x, y, w, h } = vp.rect;
      const gy = size.h - y - h;                  // WebGL origin is bottom-left
      renderer.setViewport(x, gy, w, h);
      renderer.setScissor(x, gy, w, h);
      vp.beforeRender?.();
      renderer.render(scene, vp.camera);
    }
    for (const fn of passes) fn(renderer, size);
    renderer.setScissorTest(false);
  }

  window.addEventListener('resize', resize);

  return {
    THREE, renderer, scene, sun, hemi, viewports, size,
    addViewport(vp) { viewports.push(vp); resize(); return vp; },
    removeViewport(vp) { const i = viewports.indexOf(vp); if (i >= 0) viewports.splice(i, 1); resize(); },
    addPass(fn) { passes.add(fn); return () => passes.delete(fn); },
    setScale(s) { scale = Math.max(0.6, Math.min(1, s)); resize(); },
    resize, render,
    info() { return renderer.info.render; },
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); },
  };
}
