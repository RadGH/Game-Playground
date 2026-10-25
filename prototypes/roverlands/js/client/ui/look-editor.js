// "Edit look": Knockabout's piece-by-piece Chibi 2.5 builder (prototypes/knockabout/js/client/builder.js — costume
// presets, then every piece on its own, face & body) reused as is, standing in its own small 3D view: a canvas of its
// own behind the builder sheet, made when the editor opens and thrown away when it closes (the game's renderer is
// never touched). The body is built by Knockabout's puppet.js, which is Thousandvale's createTvBody (Chibi 2.5).
//
//   openLookEditor({ layers, nav, me, account }) -> Promise (resolves when closed)
import * as THREE from 'three';
import { openBuilder } from '../../../../knockabout/js/client/builder.js';
import { el } from './dom.js';
import { lookReady } from './me.js';

export async function openLookEditor({ layers, nav, me, account = null, color = '#f2a33a' }) {
  await lookReady;
  const node = el('div', 'rl-looked');
  const cv = el('canvas', 'rl-looked-cv'); node.append(cv);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false }); }
  catch { renderer = null; }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#6f8f9e');
  scene.fog = new THREE.Fog('#6f8f9e', 8, 30);
  scene.add(new THREE.HemisphereLight('#dfefff', '#6b5a3a', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2); sun.position.set(3, 6, 4); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: '#8a7a55', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  const world = new THREE.Group(); scene.add(world);
  const view = { world, camera, renderer, lookAt(pos, target) { camera.position.set(pos[0], pos[1], pos[2]); camera.lookAt(target[0], target[1], target[2]); } };
  let pending = null, closed = false, raf = 0, last = performance.now(), done;
  const finished = new Promise(r => { done = r; });
  const cur = me.get();
  const rec = layers.push(node, { kind: 'look', onBack: () => b.close(), ownPad: false });
  rec.onEdges = e => { pending = e; return true; };
  const b = openBuilder({
    player: { look: cur.look, name: cur.name, color, dev: null }, view, nav, root: node, sounds: null, account: account ? account.button('builder') : null,
    onChange: ({ look, name }) => { me.set({ look, ...(name && name.trim() ? { name: name.trim() } : {}) }); },
    onClose: () => { closed = true; cancelAnimationFrame(raf); rec.close(); try { renderer?.dispose(); renderer?.forceContextLoss?.(); } catch { /* gone */ } done(); },
  });
  function frame() {
    if (closed) return;
    const t = performance.now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
    const w = innerWidth, h = innerHeight;
    if (renderer) {
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    }
    const e = pending; pending = null;
    b.tick(dt, e);
    renderer?.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();
  return finished;
}
