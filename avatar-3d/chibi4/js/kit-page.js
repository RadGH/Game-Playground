// Chibi 4 kit page: one character, timed (download, decode, assemble, first frame). Tests read window.__kitTiming.
import * as THREE from 'three';
import { createChibi4Kit, chibi4KitStats } from './chibi4-kit.js';
import * as K from './chibi4-kit.js';
import * as O from './chibi4-outfit.js';
window.K = K; window.O = O; window.THREE = THREE;
const q = new URLSearchParams(location.search);
const LOOKS = {
  mage: { body: { skin: '#e8b890' }, chibi4: { body: 'male', race: 'human', hair: { id: 'short' }, garments: ['trousers', 'robe', 'mantle', 'sleeves', 'boots_low'] } },
  elf: { body: { skin: '#f0c8a0' }, chibi4: { body: 'female', race: 'elf', hair: { id: 'braid' }, garments: ['trousers', 'undershirt', 'jerkin', 'boots_tall', 'bracers', 'pauldrons', 'tabard', 'scabbard'] } },
};
const t0 = performance.now();
const host = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
host.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9a9da2);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.3));
const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(-2, 4, 3); scene.add(key);
const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
const side = q.get('side');
const sgn = side === '-1' ? -1 : 1;
cam.position.set(side ? 3.6 * sgn : 0, 1.2, side ? 0 : 3.6); cam.lookAt(0, 0.95, 0);
function resize() { renderer.setSize(host.clientWidth, host.clientHeight); cam.aspect = host.clientWidth / host.clientHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const look = LOOKS[q.get('look') || 'mage'];
const actor = await createChibi4Kit(look);
const tReady = performance.now();
scene.add(actor.group); actor.setAnim(q.get('anim') || 'idle', 0); actor.update(+(q.get('t') || 0.0));
// ?lineup=N: N random outfits in a row behind the first (the modularity proof shot)
const lineup = [];
for (let i = 0; i < +(q.get('lineup') || 0); i++) {
  const a = await createChibi4Kit(O.randomLook(1000 + i * 7919));
  a.group.position.set((i + 1 - (+q.get('lineup') + 1) / 2) * 0.9, 0, 0); scene.add(a.group); a.setAnim(q.get('anim') || 'idle', 0); a.update(i * 0.37);
  lineup.push(a);
}
if (lineup.length) { actor.group.visible = false; cam.position.set(0, 1.3, 1.6 + lineup.length * 0.75); cam.lookAt(0, 0.95, 0); }
renderer.compile(scene, cam);
renderer.render(scene, cam);
const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
const tFrame = performance.now();
const log = chibi4KitStats().log;
window.__kitTiming = {
  bytes: log.reduce((n, e) => n + e.bytes, 0), files: log.length,
  downloadMs: Math.round(Math.max(...log.map(e => e.fetchEnd)) - t0),
  parseMs: Math.round(log.reduce((n, e) => n + e.parseMs, 0)),
  readyMs: Math.round(tReady - t0), firstFrameMs: Math.round(tFrame - tReady), totalMs: Math.round(tFrame - t0),
  log: log.map(e => ({ ...e, fetchStart: Math.round(e.fetchStart - t0), fetchEnd: Math.round(e.fetchEnd - t0), parseMs: Math.round(e.parseMs) })),
};
window.__actor = actor; window.__c4 = { scene, cam, renderer };
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => { const dt = clock.getDelta(); if (!q.get('freeze')) { actor.update(dt); for (const a of lineup) a.update(dt); } renderer.render(scene, cam); });
document.body.dataset.ready = '1';
