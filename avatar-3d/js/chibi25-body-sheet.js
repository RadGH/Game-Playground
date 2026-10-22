// Chibi 2.5 (part B) body contact sheet — what the robe fix and the clipping audit LOOK like, frame by frame.
//
//   chibi25-body-sheet.html?mode=robe&garment=robe&clip=run        a side-on strip of one stride, Chibi 2 row then 2.5 row
//     &frames=8 &view=side|front|quarter|back &race=human &body={"shape":"heavy"}
//   chibi25-body-sheet.html?mode=outfits&set=classes               one row per class look, at idle / walk / run / attack
//     set=classes (all 32 class looks: Emberveil's 30 + Thousandvale's two) | t1 (class-outfits.json) | t2 (class-outfits-t2.json) | tv (Thousandvale-only)
//     &clips=idle,walk,run,attack &view=quarter &v=2 (the v2 build) &from=0&count=10 (a page of rows)
//   chibi25-body-sheet.html?mode=bodies                            the body options: every shape, posture, tail
//
// Sets window.sheetReady when every picture is drawn (tools/chibi25-shot.mjs waits for it).
import * as THREE from 'three';
import { createChibi2Character } from './chibi2.js';
import { CHIBI2_ANIMS, CHIBI2_CLIP_SECONDS, CHIBI2_COMBAT_ALL, CHIBI2_MOUNT_ANIMS, CHIBI2_RIDE_ANIMS, ONE_SHOTS } from './chibi2-motion.js';
import { CHIBI25_MOVE_ANIMS } from './chibi25-motion.js';
import { dressAs, loadClassRoster } from './class-outfits.js';
import { SHAPES, POSTURES, TAILS } from './chibi25-body-options.js';
import { ROBE_LOOKS } from './chibi25-outfits.js';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') || 'robe', SIZE = +(q.get('size') || 170), view = q.get('view') || (mode === 'robe' ? 'side' : 'quarter');
const ANIMS = [...new Set([...CHIBI2_COMBAT_ALL, ...CHIBI25_MOVE_ANIMS, ...CHIBI2_MOUNT_ANIMS, ...CHIBI2_RIDE_ANIMS])];
const ANG = { front: 0, quarter: 0.75, side: Math.PI / 2, back: Math.PI, left: -Math.PI / 2, backq: Math.PI - 0.75 };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, Math.round(SIZE * 1.25)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdde4e0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-2, 4, 5); scene.add(key);
const camera = new THREE.PerspectiveCamera(26, 0.8, 0.05, 50);
const json = async url => (await fetch(url)).json();

/** Pose `actor` at `u` (0..1) of `clip`. */
function poseAt(actor, clip, u) {
  actor.setAnim(clip, 0, true);
  const dur = (CHIBI2_CLIP_SECONDS[clip] || 1) * (ONE_SHOTS.has(clip) ? 0.98 : 1);
  let t = u * dur; actor.update(0);
  while (t > 1e-6) { const d = Math.min(0.09, t); actor.update(d); t -= d; }
}
function shoot(actor, ang = ANG[view] ?? 0.75) {
  const H = actor.metrics().height, c = new THREE.Vector3(0, H * 0.48, 0), dist = 3.1 * (H / 1.5) + 0.6;
  camera.position.set(Math.sin(ang) * dist, H * 0.55, Math.cos(ang) * dist); camera.lookAt(c);
  renderer.render(scene, camera);
  const img = new Image(); img.src = renderer.domElement.toDataURL('image/png'); img.width = SIZE; img.height = Math.round(SIZE * 1.25);
  return img;
}
const sheet = document.getElementById('sheet');
function row(label, sub = '') {
  const r = document.createElement('div'); r.className = 'sheet-row';
  const l = document.createElement('div'); l.className = 'sheet-label'; l.innerHTML = `<strong>${label}</strong><small>${sub}</small>`;
  r.append(l); sheet.append(r); return r;
}
async function strip(r, look, clips, frames = 1) {
  const actor = await createChibi2Character(look, { anims: ANIMS });
  scene.add(actor.group);
  for (const clip of clips) for (let f = 0; f < frames; f++) {
    const u = frames === 1 ? (clip === 'attack' ? 0.5 : clip === 'idle' ? 0 : 0.25) : f / frames;
    poseAt(actor, clip, u);
    const img = shoot(actor); img.title = `${clip} ${u.toFixed(2)}`; r.append(img);
  }
  scene.remove(actor.group); actor.dispose();
}

const mage = (await json('../prototypes/emberveil/data/class-looks.json')).classes;
const base = mage.mage.avatar;
const v25 = look => ({ ...look, body: { ...look.body, v: 2.5 } });
const bodyQ = q.get('body') ? JSON.parse(q.get('body')) : {};

if (mode === 'robe') {
  const id = q.get('garment') || 'robe', clip = q.get('clip') || 'run', frames = +(q.get('frames') || 8);
  const outfit = ROBE_LOOKS?.[id] || { top: { id, color: '#4a3a8a' } };
  const look = { ...base, hat: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' }, decor: { id: 'none' }, cape: { id: 'none' }, ...outfit, body: { ...base.body, race: q.get('race') || 'human', ...bodyQ } };
  document.getElementById('title').textContent = `${id} — ${clip}, ${view} view: Chibi 2 (top) vs Chibi 2.5 (bottom)`;
  sheet.style.setProperty('--cols', 1);
  await strip(row('Chibi 2', `${id} / ${clip}`), look, [clip], frames);
  await strip(row('Chibi 2.5', `${id} / ${clip}`), v25(look), [clip], frames);
} else if (mode === 'outfits') {
  const set = q.get('set') || 'classes', clips = (q.get('clips') || 'idle,walk,run,attack').split(','), isV2 = q.get('v') === '2';
  let looks = [];
  const roster = await loadClassRoster(), lookOf = id => roster.find(c => c.id === id)?.avatar || mage[id]?.avatar || base;
  if (set === 'classes') looks = roster.map(c => [c.id, c.avatar]);
  else if (set === 'tv') {
    // the Thousandvale-only classes: their outfits sit in the shared tables since 2026-10-22, tier 1 and tier 2
    const [t1, t2] = await Promise.all([json('data/class-outfits.json'), json('data/class-outfits-t2.json')]);
    for (const c of roster.filter(r => r.game === 'thousandvale')) looks.push([c.id, dressAs(c.avatar, t1.classes[c.id])], [c.id + ' (tier 2)', dressAs(c.avatar, t2.classes[c.id])]);
  } else {
    const t = await json(set === 't1' ? 'data/class-outfits.json' : 'data/class-outfits-t2.json');
    looks = Object.entries(t.classes).map(([id, o]) => [id, dressAs(lookOf(id), o)]);
  }
  if (q.get('ids')) { const want = q.get('ids').split(','); looks = looks.filter(([id]) => want.includes(id)); }
  const from = +(q.get('from') || 0), count = +(q.get('count') || looks.length);
  looks = looks.slice(from, from + count);
  document.getElementById('title').textContent = `${set} outfits — ${clips.join(' / ')} — ${isV2 ? 'Chibi 2' : 'Chibi 2.5'}`;
  sheet.style.setProperty('--cols', +(q.get('cols') || 2));
  for (const [id, look] of looks) await strip(row(id, `${look.top?.id} / ${look.bottom?.id} / ${look.cape?.id}`), isV2 ? look : v25({ ...look, body: { ...look.body, ...bodyQ } }), clips);
} else if (mode === 'bodies') {
  const plain = v25({ ...base, hat: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' }, cape: { id: 'none' }, decor: { id: 'none' }, top: { id: 'tunic', color: '#4a6a8a' }, bottom: { id: 'pants', color: '#3a4450' }, shoes: { id: 'boots', color: '#5a4434' } });
  sheet.style.setProperty('--cols', 1);
  document.getElementById('title').textContent = 'Chibi 2.5 body options';
  const views = ['front', 'side'];
  const r1 = row('shapes', Object.keys(SHAPES).join(' · '));
  for (const shape of Object.keys(SHAPES)) { const a = await createChibi2Character({ ...plain, body: { ...plain.body, shape } }); scene.add(a.group); a.update(0); r1.append(shoot(a, ANG.front)); scene.remove(a.group); a.dispose(); }
  const r2 = row('postures', Object.keys(POSTURES).join(' · '));
  for (const posture of Object.keys(POSTURES)) { const a = await createChibi2Character({ ...plain, body: { ...plain.body, posture } }); scene.add(a.group); a.update(0); r2.append(shoot(a, ANG.side)); scene.remove(a.group); a.dispose(); }
  const r3 = row('sliders', 'shoulders 0/1 · legs 0/1 · arms 0/1 · height 0/1');
  for (const b of [{ shoulders: 0 }, { shoulders: 1 }, { legs: 0 }, { legs: 1 }, { arms: 0 }, { arms: 1 }, { height: 0 }, { height: 1 }]) { const a = await createChibi2Character({ ...plain, body: { ...plain.body, ...b } }); scene.add(a.group); a.update(0); r3.append(shoot(a, ANG.front)); scene.remove(a.group); a.dispose(); }
  const r4 = row('tails', Object.keys(TAILS).join(' · '));
  for (const tail of Object.keys(TAILS)) { const a = await createChibi2Character({ ...plain, body: { ...plain.body, race: 'beast', tail } }); scene.add(a.group); a.update(0); r4.append(shoot(a, ANG.backq)); scene.remove(a.group); a.dispose(); }
  void views;
}
document.getElementById('state').textContent = 'Done';
window.sheetReady = true;
