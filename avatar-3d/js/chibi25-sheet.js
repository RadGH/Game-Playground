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
//   &zoom=2.5                               closer camera · &set=accessory.id:glasses,eyes.height:tall any base-look field
//   &views=all                              eight angles: front, three quarters, side, back three quarters, back, other side, top, low
//   &xray=1                                 SEE-THROUGH check (hair pass 2): every back face that can be seen is painted magenta and
//                                           counted (the material is front-side only, so a visible back face = a hole you look through)
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
  headShape: 'round', hair: { id: q.get('hair') || 'short', color: q.get('hairColor') || (q.get('xray') === '1' ? '#3c9a40' : '#6b4a2a') }, eyes: { id: 'round', color: '#3f7f86' },
  brows: { id: 'straight' }, nose: { id: 'small' }, mouth: { id: 'smile' }, ears: { id: 'normal' }, facialHair: { id: 'none' },
  extras: { id: 'none', color: '#8a2e2e' }, accessory: { id: 'none' }, hat: { id: q.get('hat') || 'none', color: '#5a4a7a', color2: '#d8b040' },
  top: { id: 'tunic', color: '#4a6a8a' }, bottom: { id: 'pants', color: '#3a4450' }, shoes: { id: 'boots', color: '#5a4434' },
  held: { id: 'none' }, offhand: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' },
};
if (q.get('eyes')) base.eyes.id = q.get('eyes');
if (q.get('beard')) base.facialHair.id = q.get('beard');
// &set=accessory.id:glasses,eyes.height:tall — any field of the base look (2026-10-21 owner review)
for (const kv of (q.get('set') || '').split(',').filter(Boolean)) { const [path, val] = kv.split(':'); const keys = path.split('.'); let o = base; for (const k of keys.slice(0, -1)) o = o[k] ??= {}; o[keys.at(-1)] = isNaN(+val) || val === '' ? val : +val; }
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
const ALL = 'front,quarter,side,backq,back,left,top,low';
const views = (q.get('views') === 'all' ? ALL : (q.get('views') || 'front,quarter,side' + (q.get('back') ? ',back' : ''))).split(',');
// [yaw, pitch]: pitch > 0 looks down from above, < 0 up from below
const ANG = { front: [0, 0.04], quarter: [0.7, 0.04], side: [Math.PI / 2, 0.04], back: [Math.PI, 0.04], left: [-Math.PI / 2, 0.04], backq: [Math.PI - 0.75, 0.25], top: [0.3, 1.25], low: [-0.5, -0.45] };
const xray = q.get('xray') === '1';
/** x-ray: draw both sides and paint the HAIR's back ones magenta (front-side rendering would show THROUGH them); other back
 *  faces are discarded as the real material culls them. The hair is drawn green for this (&xray=1 sets hairColor). */
function xrayMaterials(group) {
  group.traverse(o => { if (!o.isMesh) return; const m = o.material.clone(); m.side = THREE.DoubleSide;
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  if (!gl_FrontFacing) { if (vColor.g > vColor.r * 1.35 && vColor.g > vColor.b * 1.35) gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); else discard; }'); };
    m.customProgramCacheKey = () => 'xray'; o.material = m; });
}
const px = new Uint8Array(SIZE * SIZE * 4);
const magenta = () => { const gl = renderer.getContext(); gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, px); let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 200 && px[i + 1] < 60 && px[i + 2] > 200) n++; return n; };
window.xrayCounts = {};

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
  if (xray) xrayMaterials(actor.group);
  if (blink != null && actor.setBlink) actor.setBlink(+blink);
  if (lookXY && actor.setGaze) { const [x, y] = lookXY.split(',').map(Number); actor.setGaze(x, y); }
  actor.update(0.016);
  const head = actor.parts.head, hp = new THREE.Vector3(); head.updateWorldMatrix(true, false); head.getWorldPosition(hp);
  const H = actor.metrics().height;
  const centre = hp.clone().add(new THREE.Vector3(0, (0.27 + +(q.get('dy') || 0)) * (H / 1.6), 0.0));   // &dy=-0.08 lowers the camera's aim
  const counts = {};
  for (const v of views) {
    const [yaw, pitch] = ANG[v] || [0, 0.04], dist = 2.2 * (H / 1.6) / +(q.get('zoom') || 1);   // &zoom=2 for a close-up
    camera.position.set(centre.x + Math.sin(yaw) * Math.cos(pitch) * dist, centre.y + Math.sin(pitch) * dist, centre.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(centre); renderer.render(scene, camera);
    if (xray) counts[v] = magenta();
    const img = new Image(); img.src = renderer.domElement.toDataURL('image/png'); img.width = img.height = SIZE; img.alt = `${id} ${v}`;
    row.append(img);
  }
  if (xray) { window.xrayCounts[id] = counts; const s2 = document.createElement('small'); s2.className = 'sheet-tris'; s2.textContent = 'see-through px ' + Object.values(counts).reduce((p, c) => p + c, 0); label.append(s2); }
  row.dataset.tris = actor.stats().triangles;
  const s = document.createElement('small'); s.className = 'sheet-tris'; s.textContent = actor.stats().triangles + ' tris'; label.append(s);
  scene.remove(actor.group); actor.dispose();
  sheet.append(row);
}
document.getElementById('state').textContent = 'Ready';
window.sheetReady = true;
