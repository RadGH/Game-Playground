// structures.html: preview the race-themed buildings (stream C). window.structures exposes camera
// presets for the screenshot tools.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildMap } from '../sim/map.js';
import { layoutFromMap } from '../view/layout.js';
import { loadIdentity } from '../view/identity.js';
import { buildStructures, makeKeep, makeBarracks, makeDrillYard, makeOutfitter, makeSanctum } from '../view/structures.js';
import { buildingsFor } from '../sim/buildings.js';

const $ = id => document.getElementById(id);
const maps = await (await fetch(new URL('../../data/maps.json', import.meta.url))).json();
const identity = await loadIdentity();
const races = identity.raceIds();
for (const i of [0, 1]) $('race' + i).innerHTML = races.map(r => `<option value="${r}">${identity.race(r).name}</option>`).join('');
const params = new URLSearchParams(location.search);
$('race0').value = params.get('west') || 'freeholds'; $('race1').value = params.get('east') || 'ashtusk';
$('view').value = params.get('view') || 'field'; $('mode').value = params.get('mode') || '1v1';

const canvas = $('view3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a3540); scene.fog = new THREE.Fog(0x4a5a64, 160, 380);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4a3f2c, 1.15));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.1); sun.position.set(-60, 110, 70); scene.add(sun);
const rim = new THREE.DirectionalLight(0x9ab8ff, 0.45); rim.position.set(80, 40, -90); scene.add(rim);
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 900);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
function resize() { const r = canvas.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let world = null, lineup = [], ready = false, frac = 1;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x4a5e36, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
function clear() { world?.dispose(); world = null; for (const o of lineup) { scene.remove(o.group); } lineup = []; }
function teams() { return [{ team: 0, race: $('race0').value, slot: 0 }, { team: 1, race: $('race1').value, slot: 3 }]; }
async function build() {
  clear();
  ground.visible = $('view').value !== 'field';
  if ($('view').value === 'field') {
    const map = buildMap({ maps }, 'vale', $('mode').value);
    const bdata = await (await fetch(new URL('../../data/buildings.json', import.meta.url))).json();
    let buildings = null; try { buildings = buildingsFor({ buildings: bdata }, map, $('mode').value); } catch (e) { console.warn('buildingsFor', e.message); }
    world = buildStructures(scene, layoutFromMap(map), { identity, teams: teams(), buildings });
    frac = 1; ready = false;
    const f = map.fields[0]; camera.position.set(f.keep.x + 30, 60, f.keep.z + 45); controls.target.set(f.keep.x, 0, f.keep.z - 18);
  } else {
    races.forEach((race, i) => {
      const color = identity.slotColor(i < 2 ? i : i + 1), x = (i - 1.5) * 30;
      for (const [k, obj] of [[0, makeKeep(identity, race, color)], [1, makeBarracks(identity, race, color)], [2, makeOutfitter(identity, race, color)], [3, makeDrillYard(identity, race, color)], [4, makeSanctum(identity, race, color)]]) {
        obj.group.position.set(x, 0, -k * 22); scene.add(obj.group); lineup.push(obj);
      }
    });
    camera.position.set(0, 110, 80); controls.target.set(0, 0, -44);
  }
  controls.update();
  $('state').textContent = $('view').value === 'field' ? `${$('mode').value}: ${teams().map(t => identity.race(t.race).name).join(' vs ')}` : 'Keep / Barracks / Outfitter / Drill Yard / Sanctum for each race';
}
for (const id of ['view', 'mode', 'race0', 'race1']) $(id).onchange = build;
$('drop').onclick = () => { frac = Math.max(0, frac - 0.22); world?.setBanners(0, frac); world?.setBanners(1, frac); };
$('rally').onclick = () => { frac = 1; world?.setBanners(0, 1); world?.setBanners(1, 1); };
$('ready').onclick = () => { ready = !ready; for (const b of world?.buildings() || []) b.setReady(ready); for (const o of lineup) o.setReady?.(ready); };
await build();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  world?.update(dt); for (const o of lineup) o.update?.(o.setReady ? dt : t);
  controls.update(); renderer.render(scene, camera);
});
window.structures = {
  get world() { return world; }, renderer, camera, controls, build, identity,
  look(px, py, pz, tx, ty, tz) { camera.position.set(px, py, pz); controls.target.set(tx, ty, tz); controls.update(); },
  setReady(v) { ready = !v; $('ready').click(); }, drop(f) { frac = f; world?.setBanners(0, f); world?.setBanners(1, f); },
  info: () => renderer.info.render, ready: true,
};
