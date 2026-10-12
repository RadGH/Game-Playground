// Mounts 3D gallery: every mount type with a Chibi 2 rider in the saddle; gaits, mount / dismount, one or all in a row.
import * as THREE from 'three';
import { el, button, panel, checkbox } from '../../shared/ui.js';
import { createScene } from './scene.js';
import { createMount, seatRider, MOUNT_TYPES, MOUNT_KEYS, CHIBI2_MOUNT_ANIMS, gaitFor } from './mounts.js';
import { createChibi2Character, CHIBI2_ANIMS } from './chibi2.js';
import { randomChibi2 } from './chibi2-races.js';
import { randomAvatar, makeRng } from '../../avatar-2d/js/random.js';
import { normalizeAvatar } from '../../avatar-2d/js/render.js';
import { loadClassOutfits, dressAs } from './class-outfits.js';

const status = document.getElementById('status'); const setStatus = t => status.textContent = t;
const SPEED = { idle: 0, walk: 1.5, trot: 3.8, gallop: 8 };
const CLASSES = ['knight', 'ranger', 'paladin', 'rogue', 'warrior', 'druid', 'mage'];
let view = 'horse', gait = 'idle', riding = true;
const live = [];   // { key, mount, rider, unseat, x }

const main = document.getElementById('main');
const viewport = el('div', { id: 'viewport' }); viewport.append(el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }));
const typeChips = el('div', { class: 'chips' }), gaitChips = el('div', { class: 'chips gait-chips' });
const info = el('span', { class: 'small muted' });
main.append(el('div', { class: 'panel' }, typeChips, viewport,
  el('div', { class: 'row' }, el('label', { text: 'Gait' }), gaitChips),
  el('div', { class: 'row' },
    button('Mount / dismount', () => { riding = !riding; for (const L of live) seat(L, riding); renderInfo(); }, 'small'),
    checkbox('Turntable', false, v => scene.setTurntable(v ? 0.5 : 0)),
    info)));
const scene = createScene(viewport); scene.controls.maxDistance = 40;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x2f3a2c, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002; ground.receiveShadow = true; scene.scene.add(ground);

const outfits = await loadClassOutfits();
const presets = await fetch(new URL('../../avatar-2d/data/presets.json', import.meta.url)).then(r => r.json());
async function makeRider(i) {
  const race = ['human', 'elf', 'dwarf', 'halfling'][i % 4];
  const base = randomChibi2(randomAvatar, presets, { race, seed: 100 + i * 31, makeRng });
  const o = outfits[CLASSES[i % CLASSES.length]];
  return createChibi2Character(normalizeAvatar(o ? dressAs(base, o) : base), { anims: [...CHIBI2_ANIMS, ...CHIBI2_MOUNT_ANIMS] });
}
/** Seat or unseat; a dismounted rider stands at the mount's left side, facing the same way. */
function seat(L, on) {
  if (on && !L.unseat) { L.unseat = seatRider(L.mount, L.rider); L.mount.setGait(SPEED[gait]); L.rider.setAnim(L.mount.riderClip); }
  else if (!on && L.unseat) { L.unseat(); L.unseat = null; L.rider.group.position.set(L.x - 0.85 * L.mount.spec.size, 0, 0.1); L.rider.setAnim('idle'); }
}
async function rebuild() {
  setStatus('building…');
  for (const L of live) { L.unseat?.(); scene.scene.remove(L.mount.group); scene.scene.remove(L.rider.group); L.mount.dispose(); L.rider.dispose(); }
  live.length = 0;
  const keys = view === 'all' ? MOUNT_KEYS : [view];
  let x = 0;
  for (const [i, key] of keys.entries()) {
    const mount = await createMount(key); const rider = await makeRider(i);
    const w = mount.metrics().width + 1.4;
    if (i) x += w / 2;
    mount.group.position.x = x; mount.group.rotation.y = Math.PI / 2;   // side on to the camera
    scene.scene.add(mount.group); scene.scene.add(rider.group); rider.group.rotation.y = Math.PI / 2;
    const L = { key, mount, rider, unseat: null, x };
    seat(L, riding); mount.setGait(SPEED[gait]); live.push(L);
    x += w / 2;
  }
  // fit the whole row across the view, whatever the canvas aspect
  const span = Math.max(3.2, x + 3), cx = x / 2, fov = scene.camera.fov * Math.PI / 180;
  const dist = Math.max(span / 2 / Math.tan(fov / 2) / Math.min(1, scene.camera.aspect || 1), 4.5) * 0.85;
  scene.controls.target.set(cx, 1.0, 0);
  scene.camera.position.set(cx + dist * 0.25, 1.9, dist);
  scene.controls.update();
  renderInfo();
  setStatus(view === 'all' ? 'Every mount' : MOUNT_TYPES[view].label);
}
function renderTypes() { typeChips.replaceChildren(...[...MOUNT_KEYS, 'all'].map(k => el('span', { class: 'chip' + (view === k ? ' on' : ''), text: k === 'all' ? 'All in a row' : MOUNT_TYPES[k].label, onclick: () => { view = k; renderTypes(); rebuild(); } }))); }
function renderGaits() { gaitChips.replaceChildren(...Object.keys(SPEED).map(g => el('span', { class: 'chip' + (gait === g ? ' on' : ''), text: g, onclick: () => { gait = g; for (const L of live) L.mount.setGait(SPEED[g]); renderGaits(); renderInfo(); } }))); }
function renderInfo() {
  const L = live[0]; if (!L) return;
  const m = L.mount.metrics();
  info.textContent = `${riding ? 'riding' : 'dismounted'} · ${gaitFor(SPEED[gait], L.key)} (${SPEED[gait]} m/s) · seat ${m.seatY.toFixed(2)} m · ${m.length.toFixed(2)} m long`;
}
let frozen = false;   // tests and screenshot scripts freeze the clock and step the mounts by hand (window.mounts3d.freeze)
scene.addTicker((dt, t) => {
  if (frozen) return;
  for (const L of live) {
    L.mount.update(dt, t); L.rider.update(dt);
  }
});

const left = document.getElementById('left');
left.append(panel('Mount types', ...MOUNT_KEYS.map(k => el('p', { class: 'small mount-note', html: `<b>${MOUNT_TYPES[k].label}</b> — <code>${k}</code> · creature <code>${MOUNT_TYPES[k].creature}</code> · tack <code>${MOUNT_TYPES[k].tack.kind}</code>` }))));
const right = document.getElementById('right');
right.append(panel('Use it', el('p', { class: 'small muted', html: '<code>const m = await createMount(mountSpecFor(id))</code><br><code>const unseat = seatRider(m, chibi)</code><br><code>m.setGait(speed); m.update(dt, t)</code><br>Build the rider with <code>CHIBI2_MOUNT_ANIMS</code> in its <code>anims</code>.' })));

renderTypes(); renderGaits(); await rebuild();
window.mounts3d = { scene, live, setView: async k => { view = k; renderTypes(); await rebuild(); }, setGait: g => { gait = g; for (const L of live) L.mount.setGait(SPEED[g]); renderGaits(); renderInfo(); }, setRiding: v => { riding = v; for (const L of live) seat(L, v); renderInfo(); }, freeze: v => { frozen = !!v; }, ready: true };
