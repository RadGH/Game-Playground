// Chibi 4 step 0: the same test characters in Chibi 2 (today's system), shot from the review page's angles.
import * as THREE from 'three';
import { createChibi2Character } from '../../js/chibi2.js';
import { normalizeAvatar } from '../../../avatar-2d/js/render.js';

const q = new URLSearchParams(location.search);
const who = q.get('who') || 'mage', view = q.get('view') || 'front';
const LOOKS = {
  mage: { body: { race: 'human', skin: '#e0ac69', height: 0.6, width: 0.5 }, headShape: 'oval', hair: { id: 'side_part', color: '#6b4a2a' },
    eyes: { id: 'round', color: '#4a6b8a' }, brows: { id: 'straight' }, nose: { id: 'small' }, mouth: { id: 'smile', color: '#b5484d' }, facialHair: { id: 'full' },
    hat: { id: 'none' }, top: { id: 'trim_robe', color: '#2a3a8a', color2: '#d8b040' }, bottom: { id: 'pants', color: '#1a2a5a' },
    shoes: { id: 'boots', color: '#5a4030' }, cape: { id: 'none' }, decor: { id: 'none' }, held: { id: 'none' } },
  warrior: { body: { race: 'elf', skin: '#f0c8a0', height: 0.6, width: 0.45, gender: 'female' }, headShape: 'oval', hair: { id: 'braid', color: '#8a3a1a' },
    eyes: { id: 'round', color: '#4a7a5a' }, brows: { id: 'straight' }, nose: { id: 'small' }, mouth: { id: 'smile', color: '#b5484d' },
    hat: { id: 'none' }, top: { id: 'travel_shirt', color: '#3a6a3a', color2: '#8a6a4a' }, bottom: { id: 'pants', color: '#4a3020' },
    shoes: { id: 'boots', color: '#5a4030' }, cape: { id: 'none' }, decor: { id: 'none' }, held: { id: 'none' } },
};

const host = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; host.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9a9da2);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.2));
const key = new THREE.DirectionalLight(0xfff2e0, 2.2); key.position.set(-2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0xcfe0ff, 1.0); rim.position.set(2, 3, -3); scene.add(rim);
const ch = await createChibi2Character(normalizeAvatar(LOOKS[who]));
scene.add(ch.group || ch);
const box = new THREE.Box3().setFromObject(ch.group || ch); const h = box.max.y - box.min.y;
const DIRS = { front: [0, 0.05, 1], right: [1, 0.05, 0], back: [0, 0.05, -1], three_quarter: [0.7, 0.25, 0.7], face: [0.35, 0.05, 1], game: [0.35, 0.75, 0.75] };
const d = new THREE.Vector3(...(DIRS[view] || DIRS.front)).normalize();
const W = innerWidth, Hh = innerHeight; renderer.setSize(W, Hh);
let cam;
if (view === 'game') {
  cam = new THREE.PerspectiveCamera(35, W / Hh, 0.1, 100); const c = new THREE.Vector3(0, h / 2, 0); cam.position.copy(c).addScaledVector(d, 9); cam.lookAt(c);
} else if (view === 'face') {
  const s = h * 0.24; cam = new THREE.OrthographicCamera(-s, s, s, -s, 0.01, 50); const c = new THREE.Vector3(0, box.max.y - h * 0.16, 0);
  cam.position.copy(c).addScaledVector(d, 5); cam.lookAt(c);
} else {
  const s = h * 0.62; cam = new THREE.OrthographicCamera(-s, s, s, -s, 0.01, 50); const c = new THREE.Vector3(0, h / 2, 0);
  cam.position.copy(c).addScaledVector(d, 5); cam.lookAt(c);
}
let t = 0;
renderer.setAnimationLoop(() => { t++; if (ch.update) ch.update(1 / 60); renderer.render(scene, cam); if (t === 30) document.body.dataset.ready = '1'; });
