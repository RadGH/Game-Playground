// Chibi 4 step 10a review page: one character holding something, the whole catalog as a contact sheet, or a rider.
// See held.html for the query parameters. Tests read window.__held.
import * as THREE from 'three';
import { createChibi4Kit, loadKit } from './chibi4-kit.js';
import { buildHeldItem } from './chibi4-held.js';
import { heldSpec, holdState } from './chibi4-grip.js';
import { loadGearCatalog } from '../../js/gear-catalog.js';
import { createMount, seatRider, mountSpecFor, MOUNT_TYPES } from '../../js/mounts.js';

const q = new URLSearchParams(location.search);
const LOOKS = {
  male: { body: { skin: '#e8b890' }, chibi4: { body: 'male', race: 'human', hair: { id: 'short', color: '#3a2a1c' }, garments: ['trousers', 'undershirt', 'jerkin', 'boots_tall', 'bracers'] } },
  female: { body: { skin: '#f0c8a0' }, chibi4: { body: 'female', race: 'elf', hair: { id: 'braid' }, garments: ['trousers', 'undershirt', 'jerkin', 'boots_tall', 'bracers', 'tabard'] } },
};
const host = document.getElementById('view'), panel = document.getElementById('panel');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(1);
host.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9a9da2);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.3));
const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(-2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1); rim.position.set(2, 3, -3); scene.add(rim);
const grid = new THREE.GridHelper(6, 12, 0x777a80, 0x888b90); scene.add(grid);
const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
const CAMS = {
  front: [[-1.3, 1.45, 4.3], [-0.15, 1.0, 0]], right: [[-4.3, 1.4, 1.3], [0, 1.0, 0]], side: [[4.3, 1.4, 0.8], [0, 1.0, 0]],
  back: [[1.0, 1.6, -4.3], [0, 1.0, 0]], hand: [[-1.2, 1.3, 1.4], [-0.3, 1.0, 0.2]], far: [[-3, 3.2, 7.5], [0, 0.9, 0]],
};
function setCam(name) { const [p, t] = CAMS[name] || CAMS.front; cam.position.set(...p); cam.lookAt(...t); }
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const cat = await loadGearCatalog();
const ROWS = cat.rows.filter(r => r.slot === 'held' || r.slot === 'offhand');
const typeOf = id => cat.byId(id)?.type || null;
const partFor = (id, slot) => (id && id !== 'none' ? { id, color: cat.byId(id)?.color || undefined, color2: cat.byId(id)?.color2 || undefined, type: typeOf(id) } : null);

const body = q.get('body') || 'male';
await loadKit(body);
const actor = await createChibi4Kit(LOOKS[body] || LOOKS.male);
scene.add(actor.group);
let anim = q.get('anim') || 'idle';

/** Advance the clip to `t` seconds and let the hold pose finish blending. */
function settle(t = 0) {
  actor.setAnim(anim, 0, true);
  actor.update(0);
  for (let i = 0; i < 8; i++) actor.update(0.03);                // the hold pose's 0.2 s blend
  const a = actor.mixer._actions.find(x => x.isRunning()) || null;
  if (a) { a.time = t; actor.mixer.update(0); }
  actor.update(1 / 60);
}

/** Per hand that holds something: angle of the item's +Y to its own forearm, elevation, and the second fist's gap. */
function sampleGrip() {
  actor.group.updateMatrixWorld(true);
  const B = actor.parts.bones, out = {};
  const rig = actor.holdRig; if (!rig) return out;
  for (const r of rig.records) {
    if (!r.hand) continue;
    const s = r.hand === 'L' ? 'l' : 'r';
    const fa = B['hand_' + s].getWorldPosition(new THREE.Vector3()).sub(B['lowerarm_' + s].getWorldPosition(new THREE.Vector3())).normalize();
    const y = new THREE.Vector3(0, 1, 0).transformDirection(r.anchor.matrixWorld);
    const o = r.anchor.getWorldPosition(new THREE.Vector3());
    const row = { id: r.spec.id, kind: r.spec.kind, family: r.spec.family, mount: r.spec.mount, off: THREE.MathUtils.radToDeg(fa.angleTo(y)), elev: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(y.y, -1, 1))),
      finite: [o.x, o.y, o.z, y.x, y.y, y.z].every(Number.isFinite), scale: r.anchor.getWorldScale(new THREE.Vector3()).x, origin: o.toArray() };
    // the other fist's distance to the handle line (two-handers in the guard, spears, staves)
    const other = r.hand === 'L' ? 'r' : 'l';
    const op = B['hand_' + other].getWorldPosition(new THREE.Vector3());
    const t = op.clone().sub(o).dot(y);
    row.otherToHandle = op.clone().sub(o).addScaledVector(y, -t).length();
    out[r.hand + ':' + r.spec.id] = row;
  }
  return out;
}

async function show(heldId, offId) {
  await actor.equip({ held: partFor(heldId, 'held'), offhand: partFor(offId, 'offhand') });
}

// ---------------------------------------------------------------- the contact sheet
async function sheet({ page = 0, per = 20, cols = 5, cw = 300, ch = 380, t = 0.2, list = null } = {}) {
  const rows = list ? list.map(id => cat.byId(id)).filter(Boolean) : ROWS.slice(page * per, page * per + per);
  const out = document.createElement('canvas');
  const nr = Math.ceil(rows.length / cols);
  out.width = cols * cw; out.height = nr * ch; out.id = 'sheet';
  const g2 = out.getContext('2d'); g2.fillStyle = '#9a9da2'; g2.fillRect(0, 0, out.width, out.height);
  renderer.setSize(cw, ch); cam.aspect = cw / ch; cam.updateProjectionMatrix();
  const view = q.get('cam') || 'front';
  const report = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const off = r.slot === 'offhand';
    try {
      await actor.equip({ held: off ? null : partFor(r.id, 'held'), offhand: off ? partFor(r.id, 'offhand') : null });
      settle(t);
      const spec = heldSpec(r.id, r.slot, r.type);
      // long things need the whole height; small things a closer look at the hands
      const long = ['spear', 'polearm', 'staff', 'twohander', 'bow'].includes(spec.family) || spec.length > 1.2;
      const [p, tg] = CAMS[view] || CAMS.front;
      const k = long ? 1.15 : 0.82;
      cam.position.set(p[0] * k, p[1] + (long ? 0.15 : 0), p[2] * k); cam.lookAt(tg[0], long ? 1.05 : 1.0, tg[2]);
      renderer.render(scene, cam);
      g2.drawImage(renderer.domElement, (i % cols) * cw, Math.floor(i / cols) * ch);
      report.push({ id: r.id, ok: true, ...Object.values(sampleGrip())[0] });
    } catch (e) { report.push({ id: r.id, ok: false, error: String(e) }); }
    g2.fillStyle = '#15171c'; g2.font = 'bold 15px sans-serif';
    g2.fillText(r.id, (i % cols) * cw + 8, Math.floor(i / cols) * ch + 20);
    g2.font = '12px sans-serif'; g2.fillText(`${r.type} · ${heldSpec(r.id, r.slot, r.type).family}`, (i % cols) * cw + 8, Math.floor(i / cols) * ch + 36);
  }
  host.replaceChildren(out); host.style.overflow = 'auto';
  document.body.style.overflow = 'auto'; host.style.position = 'static';
  return report;
}

// ---------------------------------------------------------------- seats
let mount = null;
async function seat(kind) {
  if (MOUNT_TYPES[kind]) {
    mount = await createMount(mountSpecFor({ ...MOUNT_TYPES[kind], type: kind, scale: 1.38 }));
    scene.add(mount.group);
    seatRider(mount, actor);
    mount.setGait?.(+(q.get('speed') || 0));
    return mount;
  }
  return null;
}

// ---------------------------------------------------------------- the panel
function fillPanel() {
  const opt = (ids, cur) => ['none', ...ids].map(id => `<option ${id === cur ? 'selected' : ''}>${id}</option>`).join('');
  const heldIds = ROWS.filter(r => r.slot === 'held').map(r => r.id), offIds = ROWS.filter(r => r.slot === 'offhand').map(r => r.id);
  const anims = ['idle', 'walk', 'run', 'ready', 'guard', 'attack', 'slash', 'chop', 'stab', 'thrust', 'shoot', 'cast', 'wave', 'hit', 'ride'];
  panel.innerHTML = `<b>Chibi 4 held items</b> <span class="dim">(step 10a)</span>
    <div class="row">held <select id="selH">${opt(heldIds, q.get('held') || 'none')}</select></div>
    <div class="row">off-hand <select id="selO">${opt(offIds, q.get('off') || 'none')}</select></div>
    <div class="row">${anims.map(a => `<button data-anim="${a}">${a}</button>`).join('')}</div>
    <div class="row">${Object.keys(CAMS).map(c => `<button data-cam="${c}">${c}</button>`).join('')}</div>
    <div id="info" class="dim"></div>`;
  panel.querySelector('#selH').onchange = e => show(e.target.value, panel.querySelector('#selO').value).then(info);
  panel.querySelector('#selO').onchange = e => show(panel.querySelector('#selH').value, e.target.value).then(info);
  panel.querySelectorAll('[data-anim]').forEach(b => b.onclick = () => { anim = b.dataset.anim; actor.setAnim(anim, 0.15, true); info(); });
  panel.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => setCam(b.dataset.cam));
}
function info() {
  const s = actor.holdRig?.stats() || {};
  const el = panel.querySelector('#info'); if (!el) return;
  el.textContent = `${anim} (${holdState(anim)}) · ${s.items || 0} item meshes, +${s.drawCalls || 0} draw calls, ${Math.round(s.triangles || 0)} triangles`;
}

window.__held = { actor, scene, cam, renderer, sheet, sampleGrip, settle, show, seat, ROWS, buildHeldItem, setAnim: a => { anim = a; }, get anim() { return anim; } };

if (q.get('sheet')) {
  const report = await sheet({ page: +(q.get('page') || 0), per: +(q.get('per') || 20), t: +(q.get('t') || 0.2), list: q.get('list')?.split(',') || null });
  window.__held.report = report;
  document.body.dataset.ready = '1';
} else {
  setCam(q.get('cam') || 'front');
  if (q.get('seat')) await seat(q.get('seat'));
  await show(q.get('held') || 'none', q.get('off') || 'none');
  if (!mount) actor.setAnim(anim, 0);
  fillPanel(); info();
  if (q.get('freeze')) settle(+(q.get('t') || 0));
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    if (!q.get('freeze')) { actor.update(dt); mount?.update?.(dt, clock.elapsedTime); }
    renderer.render(scene, cam);
  });
  document.body.dataset.ready = '1';
}
