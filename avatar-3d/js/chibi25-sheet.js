// Chibi 2.5 contact sheet: one row per part id — the 2D paper-doll picture next to the 3D head from the front, three
// quarters and the side — so a 3D part can be checked against the picture and the name it is meant to match.
//
//   chibi25-sheet.html?slot=hair            every hair id (v2.5 by default)
//   &v=2                                    the v2 build instead (the audit's "before")
//   &ids=short,long                         only these ids
//   &hat=wizard                             every row wears this hat (hat x hair fitting)
//   &slot=hat&hair=long                     every hat over one hair
//   &cols=2                                 rows per line of the page
//   &blink=0.5                              eyelids part-closed (0..1), &look=x,y pupils pushed (-1..1)
import * as THREE from 'three';
import { createChibi2Character } from './chibi2.js';
import { renderSVG, normalizeAvatar } from '../../avatar-2d/js/render.js';
import { PARTS } from '../../avatar-2d/js/parts/index.js';
import { CHIBI25_OPTIONS } from './chibi25-options.js';

const q = new URLSearchParams(location.search);
const slot = q.get('slot') || 'hair', v25 = q.get('v') !== '2';
const SIZE = +(q.get('size') || 180);
const base = {
  body: { skin: q.get('skin') || '#e7b891', headSize: 0.5, race: q.get('race') || 'human' },
  headShape: 'round', hair: { id: q.get('hair') || 'short', color: q.get('hairColor') || '#6b4a2a' }, eyes: { id: 'round', color: '#3f7f86' },
  brows: { id: 'straight' }, nose: { id: 'small' }, mouth: { id: 'smile' }, ears: { id: 'normal' }, facialHair: { id: 'none' },
  extras: { id: 'none', color: '#8a2e2e' }, accessory: { id: 'none' }, hat: { id: q.get('hat') || 'none', color: '#5a4a7a', color2: '#d8b040' },
  top: { id: 'tunic', color: '#4a6a8a' }, bottom: { id: 'pants', color: '#3a4450' }, shoes: { id: 'boots', color: '#5a4434' },
  held: { id: 'none' }, offhand: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' },
};
if (q.get('eyes')) base.eyes.id = q.get('eyes');
if (q.get('beard')) base.facialHair.id = q.get('beard');
const opt = CHIBI25_OPTIONS.face[slot];
let ids = q.get('ids') ? q.get('ids').split(',') : (q.get('only') === 'new' && opt ? opt.added : Object.keys(PARTS[slot] || {}));
if (slot === 'headShape') ids = Object.keys(PARTS.headShape);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdde4e0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-2, 4, 5); scene.add(key);
const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 50);
const views = (q.get('views') || 'front,quarter,side' + (q.get('back') ? ',back' : '')).split(',');
const ANG = { front: 0, quarter: 0.7, side: Math.PI / 2, back: Math.PI, left: -Math.PI / 2, top: 0 };

function look(id) {
  const a = structuredClone(base);
  if (slot === 'headShape') a.headShape = id; else a[slot] = { ...(a[slot] || {}), id };
  if (v25) a.body.v = 2.5;
  return a;
}
const svgHead = a => {
  const svg = renderSVG(a, { width: 300, height: 400 });
  return svg.replace(/viewBox="[^"]*"/, 'viewBox="60 20 180 210"').replace(/width="[^"]*"/, 'width="' + SIZE + '"').replace(/height="[^"]*"/, 'height="' + SIZE + '"');
};

const sheet = document.getElementById('sheet'); sheet.style.setProperty('--cols', q.get('cols') || 2);
document.getElementById('title').textContent = `${slot} — ${v25 ? 'Chibi 2.5' : 'Chibi 2'}${base.hat.id !== 'none' ? ' under ' + base.hat.id : ''}`;
const blink = q.get('blink'), lookXY = q.get('look');
for (const id of ids) {
  const a = look(id);
  const row = document.createElement('div'); row.className = 'sheet-row';
  const label = document.createElement('div'); label.className = 'sheet-label';
  const name = PARTS[slot]?.[id]?.name || id;
  label.innerHTML = `<strong>${id}</strong><small>${name}</small>`;
  row.append(label);
  const two = document.createElement('div'); two.className = 'sheet-2d'; two.innerHTML = svgHead(normalizeAvatar(a)); row.append(two);
  const actor = await createChibi2Character(a);
  scene.add(actor.group); actor.update(0);
  if (blink != null && actor.setBlink) actor.setBlink(+blink);
  if (lookXY && actor.setGaze) { const [x, y] = lookXY.split(',').map(Number); actor.setGaze(x, y); }
  actor.update(0.016);
  const head = actor.parts.head, hp = new THREE.Vector3(); head.updateWorldMatrix(true, false); head.getWorldPosition(hp);
  const H = actor.metrics().height;
  const centre = hp.clone().add(new THREE.Vector3(0, 0.27 * (H / 1.6), 0.0));
  for (const v of views) {
    const ang = ANG[v] ?? 0, dist = 2.2 * (H / 1.6);
    camera.position.set(centre.x + Math.sin(ang) * dist, centre.y + (v === 'top' ? dist : 0.08), centre.z + Math.cos(ang) * dist);
    camera.lookAt(centre); renderer.render(scene, camera);
    const img = new Image(); img.src = renderer.domElement.toDataURL('image/png'); img.width = img.height = SIZE; img.alt = `${id} ${v}`;
    row.append(img);
  }
  row.dataset.tris = actor.stats().triangles;
  const s = document.createElement('small'); s.className = 'sheet-tris'; s.textContent = actor.stats().triangles + ' tris'; label.append(s);
  scene.remove(actor.group); actor.dispose();
  sheet.append(row);
}
document.getElementById('state').textContent = 'Ready';
window.sheetReady = true;
