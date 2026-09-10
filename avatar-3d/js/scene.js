// Three.js scene boilerplate for the avatar viewer: renderer, camera, orbit controls, lights, ground, resize, loop.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createScene(container, { background = 0x1e2128, ground = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100); camera.position.set(0, 1.4, 4.2);
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 0.95, 0); controls.enableDamping = true; controls.minDistance = 1; controls.maxDistance = 12; controls.update();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.1); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2.5, 5, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = key.shadow.camera.bottom = -3; key.shadow.camera.right = key.shadow.camera.top = 3; scene.add(key);
  const fill = new THREE.DirectionalLight(0x99bbff, 0.6); fill.position.set(-3, 2, -2); scene.add(fill);
  if (ground) { const g = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 1 })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g); const grid = new THREE.GridHelper(4.4, 22, 0x3a4050, 0x2e3440); grid.position.y = 0.001; scene.add(grid); }
  const clock = new THREE.Clock(); const tickers = new Set(); let turntable = 0;
  function resize() { const w = container.clientWidth || 600, h = container.clientHeight || 600; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(container); resize();
  let running = true;
  function loop() { if (!running) return; requestAnimationFrame(loop); const dt = Math.min(0.05, clock.getDelta()); for (const t of tickers) t(dt, clock.elapsedTime); if (turntable) { for (const o of scene.children) if (o.userData.character) o.rotation.y += turntable * dt; } controls.update(); renderer.render(scene, camera); }
  loop();
  return { renderer, scene, camera, controls, addTicker: f => tickers.add(f), removeTicker: f => tickers.delete(f), setTurntable: v => { turntable = v; }, resize, dispose: () => { running = false; renderer.dispose(); }, snapshot: () => renderer.domElement.toDataURL('image/png'), THREE };
}
