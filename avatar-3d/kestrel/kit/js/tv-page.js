// Kestrel kit — the Thousandvale pose page (tv.html): real Thousandvale looks in any game clip, Kestrel or Chibi 2.5.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { avatarFor } from '../../../../prototypes/thousandvale/js/client/looks.js';
import { createKestrelTvBody } from '../../../../prototypes/thousandvale/js/client/kestrel-body.js';
import { createTvBody } from '../../../../prototypes/thousandvale/js/client/chibi-version.js';
import { CHIBI2_MOUNT_ANIMS } from '../../../js/chibi2-motion.js';
import { CHIBI2_DUAL_ANIMS, CHIBI2_ANGLE_ANIMS, CHIBI2_REVIVE_ANIMS } from '../../../js/chibi2-motion-dual.js';
import { CHIBI2_PROF_ANIMS, PROF_CLIP, PROF_TOOL, PROF_TOOL_MOUNT } from '../../../js/chibi2-motion-prof.js';
import { toolGeometry } from '../../../../prototypes/thousandvale/js/client/prof-models.js';   // batch 5: the game's tools
import { CHIBI2_REST_ANIMS } from '../../../js/chibi2-motion-rest.js';

// Thousandvale's own list (js/client/actors.js CHIBI_ANIMS)
const ANIMS = ['idle', 'ready', 'walk', 'run', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead', 'swim', 'sitGround', 'drink', 'cheer', 'bowGreet', 'point', 'dance', ...CHIBI2_MOUNT_ANIMS, ...CHIBI2_DUAL_ANIMS, ...CHIBI2_ANGLE_ANIMS, ...CHIBI2_REVIVE_ANIMS, ...CHIBI2_PROF_ANIMS, ...CHIBI2_REST_ANIMS];
const W = (id, color = '#c8ccd6') => ({ id, color });
const SETS = {
  weapons: [
    { cls: 'knight', held: W('fh_longsword'), offhand: W('fh_heater_shield', '#8a3a2a') },
    { cls: 'ranger', race: 'elf', held: W('bow', '#8a6a3a'), offhand: W('none') },
    { cls: 'warrior', held: W('fh_greatsword'), offhand: W('none') },
    { cls: 'rogue', held: W('fh_daggers'), offhand: W('none') },
    { cls: 'mage', held: W('staff_orb', '#6a4a2a'), offhand: W('none') },
    { cls: 'paladin', held: W('fh_halberd'), offhand: W('none') },
    { cls: 'warrior', seed: 4, held: W('fh_greataxe'), offhand: W('none') },
    { cls: 'bard', held: W('lute', '#9a6a3a'), offhand: W('none') },
  ],
  races: [
    { cls: 'warrior', race: 'human', seed: 3 }, { cls: 'cleric', race: 'human', seed: 12 }, { cls: 'ranger', race: 'elf', seed: 9 },
    { cls: 'mage', race: 'dwarf', seed: 7 }, { cls: 'rogue', race: 'halfling', seed: 5 }, { cls: 'druid', race: 'elf', seed: 2 },
  ],
  mix: [
    { cls: 'knight', held: W('fh_longsword'), offhand: W('fh_heater_shield', '#8a3a2a') },
    { cls: 'ranger', race: 'elf', seed: 9, held: W('bow', '#8a6a3a'), offhand: W('none') },
    { cls: 'mage', race: 'dwarf', seed: 7 },
    { cls: 'rogue', race: 'halfling', seed: 5, held: W('fh_daggers'), offhand: W('none') },
    { cls: 'cleric', seed: 12 },
    { cls: 'warrior', held: W('fh_greatsword'), offhand: W('none') },
  ],
  monsters: [],
  // batch 5: capes on seated clips (cape.js), and the work loops with the game's own tools in hand
  capes: [
    { cls: 'warrior', seed: 3, cape: W('cape', '#7a2a2a') },
    { cls: 'ranger', race: 'elf', seed: 9, cape: W('travel_cloak', '#3a5a3a') },
    { cls: 'mage', seed: 7, cape: W('long_cloak', '#2a3a7a') },
    { cls: 'rogue', race: 'halfling', seed: 5, cape: W('tattered_cape', '#4a4a4a') },
    { cls: 'knight', race: 'dwarf', seed: 4, cape: W('g5_swallowtail', '#6a2a5a') },
    { cls: 'cleric', seed: 12, cape: W('half_cape', '#c8b070') },
  ],
  work: [
    { cls: 'warrior', seed: 3 }, { cls: 'ranger', race: 'elf', seed: 9 }, { cls: 'mage', race: 'dwarf', seed: 7 },
    { cls: 'rogue', race: 'halfling', seed: 5 }, { cls: 'cleric', seed: 12 },
  ],
};
const TOOL_OF = Object.fromEntries(Object.entries(PROF_CLIP).map(([prof, clip]) => [clip, PROF_TOOL[prof]]));
const params = new URLSearchParams(location.search);
const PICK = params.get('pick') ? params.get('pick').split(',').map(Number) : null;
const state = { clip: params.get('clip') || 'idle', t: params.has('t') ? +params.get('t') : null, set: params.get('set') || 'weapons', view: params.get('view') || 'three', chibi: params.get('chibi') === '1' };
if (params.get('shot') === '1') document.body.classList.add('shot');

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#8fb3d0');
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a4030, 1.3));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.set(-4, 8, 6); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#6f7a52', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0x000000, 0x000000); grid.material.opacity = 0.12; grid.material.transparent = true; scene.add(grid);
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let bodies = [];
const GAP = 1.5;
function frame() {
  const n = bodies.length, span = (n - 1) * GAP, c = new THREE.Vector3(0, 1.0, 0), d = Math.max(3.2, span * 0.62 + 2.2);
  const V = { front: [0, 1.3, d], side: [span / 2 + 3.6, 1.3, 0.01], back: [0, 1.4, -d], three: [d * 0.55, 1.8, d * 0.8], top: [0.01, d * 1.1, 0.5] }[state.view] || [d * 0.55, 1.8, d * 0.8];
  camera.position.set(...V); controls.target.copy(c); controls.update();
}
async function build() {
  for (const b of bodies) { scene.remove(b.group); b.dispose?.(); }
  bodies = [];
  const all = SETS[state.set] || SETS.weapons, specs = PICK ? PICK.map(i => all[i]).filter(Boolean) : all, t0 = performance.now();
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const av = structuredClone(await avatarFor({ race: sp.race || 'human', cls: sp.cls, seed: sp.seed || 1 + i }));
    for (const k of ['held', 'offhand', 'cape', 'hat']) if (sp[k]) av[k] = sp[k];
    const b = state.chibi ? await createTvBody(av, { anims: ANIMS }) : await createKestrelTvBody(av, { anims: ANIMS });
    b.group.position.x = (i - (specs.length - 1) / 2) * GAP;
    b.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(b.group); bodies.push(b);
  }
  const buildMs = performance.now() - t0;
  play();
  const st = bodies.map(b => b.stats?.() || {});
  window.__tv.stats = { buildMs, bodies: st.map(s => ({ triangles: s.triangles, gear: s.gearTriangles, drawCalls: s.drawCalls ?? s.meshes })) };
  document.getElementById('stats').textContent = `${bodies.length} bodies, ${Math.round(buildMs)} ms, ${st.map(s => s.triangles).join(' / ')} triangles`;
  frame();
}
const toolMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
function play() {
  for (const b of bodies) {
    b.setAnim(state.clip, 0, true); b.update(0.0001); if (state.t != null) b.freeze?.(state.t);
    // batch 5: a work loop holds the game's tool on the hand frame, as prof-view.js mounts it
    if (b.tool) { b.tool.parent?.remove(b.tool); b.tool = null; }
    const tool = TOOL_OF[state.clip];
    if (tool && b.parts?.handR) { const M = PROF_TOOL_MOUNT[tool], m = new THREE.Mesh(toolGeometry(tool), toolMat); m.position.set(...M.position); m.rotation.set(...M.rotation); m.castShadow = true; b.parts[M.bone].add(m); b.tool = m; }
  }
}
const clock = new THREE.Clock();
function loop() {
  const dt = clock.getDelta();
  for (const b of bodies) b.update(state.t != null && !b.freeze ? 0 : dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
function select(id, list, key, after) {
  const el = document.getElementById(id);
  for (const v of list) el.add(new Option(v, v));
  el.value = state[key];
  el.onchange = () => { state[key] = el.value; after(); };
}
window.__tv = { ready: false, stats: null, setClip: (c, t = null) => { state.clip = c; state.t = t; play(); } };
select('clip', ANIMS, 'clip', play);
select('set', Object.keys(SETS).filter(k => SETS[k].length), 'set', build);
select('view', ['front', 'side', 'back', 'three', 'top'], 'view', frame);
const cb = document.getElementById('chibi'); cb.checked = state.chibi; cb.onchange = () => { state.chibi = cb.checked; build(); };
await build();
loop();
window.__tv.ready = true;
