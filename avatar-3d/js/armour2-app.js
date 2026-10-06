// Tier-2 class armour gallery (play-test 4, S18): every class's tier-1 and tier-2 outfit side by side, the
// backs, every emblem, every kit. ?view=pairs|emblems|kits  &back=1 turns everyone round.
import * as THREE from 'three';
import { createChibi2Character } from './chibi2.js';
import { loadClassOutfits, loadClassOutfits2, dressAs } from './class-outfits.js';
import { EMBLEM_IDS, T2_DECOR } from './chibi2-armour2.js';

const q = new URLSearchParams(location.search), view = q.get('view') || 'pairs', back = q.get('back') === '1';
const stage = document.getElementById('stage'), labels = document.getElementById('labels'), state = document.getElementById('state');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
stage.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1e2128');
scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3530', 1.6));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.position.set(3, 6, 8); scene.add(sun);
const rim = new THREE.DirectionalLight('#a0c0ff', 1.0); rim.position.set(-4, 3, -6); scene.add(rim);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const holder = new THREE.Group(); scene.add(holder);
const tags = [];

const BASE = { body: { skin: '#e0b090', height: 0.5, width: 0.5, headSize: 0.5 }, hair: { id: 'short', color: '#4a3020' }, eyes: { id: 'round', color: '#3a2a1a' } };

async function main() {
  const [t1, t2] = await Promise.all([loadClassOutfits(), loadClassOutfits2()]);
  const items = [];   // { look, label }
  if (view === 'emblems') for (const e of EMBLEM_IDS) items.push({ label: e, look: dressAs(BASE, { ...t2.knight, top: { ...t2.knight.top, emblem: e } }) });
  else if (view === 'kits') for (const k of T2_DECOR) for (const cls of Object.keys(t2).filter(c => t2[c].decor.id === k).slice(0, 3)) items.push({ label: `${k} (${cls})`, look: dressAs(BASE, t2[cls]) });
  else for (const cls of Object.keys(t2)) {
    items.push({ label: `${cls} 1`, look: t1[cls] ? dressAs(BASE, t1[cls]) : BASE });
    items.push({ label: `${cls} 2`, look: dressAs(BASE, t2[cls]) });
  }
  const cols = view === 'pairs' ? 12 : view === 'kits' ? 6 : 8, gapX = 1.05, gapY = 2.0;
  let n = 0;
  for (const it of items) {
    const c = await createChibi2Character(it.look);
    const i = n % cols, j = Math.floor(n / cols);
    c.group.position.set((i - (cols - 1) / 2) * gapX + (view === 'pairs' ? (i % 2 ? -0.08 : 0.08) : 0), -j * gapY, 0);
    c.group.rotation.y = back ? Math.PI : 0;
    holder.add(c.group); tags.push({ obj: c.group, text: it.label });
    n++; state.textContent = `Building ${n}/${items.length}`;
  }
  const rows = Math.ceil(items.length / cols);
  const w = cols * gapX, h = rows * gapY;
  holder.position.y = (rows - 1) * gapY / 2 - 0.7;
  fit(w, h);
  for (const t of tags) { const s = document.createElement('span'); s.textContent = t.text; labels.append(s); t.el = s; }
  state.textContent = `${items.length} characters`; window.__ready = true;
  let drag = null;
  stage.addEventListener('pointerdown', e => { drag = e.clientX; });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', e => { if (drag == null) return; const d = (e.clientX - drag) * 0.01; drag = e.clientX; for (const t of tags) t.obj.rotation.y += d; });
  addEventListener('resize', () => fit(w, h));
  renderer.setAnimationLoop(() => { renderer.render(scene, camera); place(); });
}
function fit(w, h) {
  const W = stage.clientWidth, H = stage.clientHeight; renderer.setSize(W, H, false);
  const aspect = W / H, needW = w * 0.52, needH = h * 0.52;
  const halfH = Math.max(needH, needW / aspect);
  Object.assign(camera, { left: -halfH * aspect, right: halfH * aspect, top: halfH, bottom: -halfH });
  camera.position.set(0, 0.6, 10); camera.lookAt(0, 0.6, 0); camera.updateProjectionMatrix();
}
const v = new THREE.Vector3();
function place() {
  const W = stage.clientWidth, H = stage.clientHeight;
  for (const t of tags) { t.obj.getWorldPosition(v); v.y -= 0.12; v.project(camera); t.el.style.left = ((v.x + 1) / 2 * W) + 'px'; t.el.style.top = ((1 - v.y) / 2 * H) + 'px'; }
}
main().catch(e => { state.textContent = 'Error: ' + e.message; console.error(e); });
