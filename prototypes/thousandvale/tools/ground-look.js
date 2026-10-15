// Stream T dev page (tools/ground-look.html): draw one zone the way the game does, for screenshots of the ground.
import * as THREE from 'three';
import { loadClientTerrain, loadZoneExtras } from '../js/client/terrain.js';
import { createTerrainView } from '../js/client/terrain-view.js';
import { createScatterView } from '../js/client/scatter-view.js';
import { createTownView } from '../js/client/town-view.js';
import { createWallsView } from '../js/client/walls-view.js';

const q = new URLSearchParams(location.search);
const zone = q.get('zone') || 'z13_10';
const num = (k, d) => (q.get(k) || d).split(',').map(Number);
const info = document.getElementById('info');
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = false;
const scene = new THREE.Scene();
const sky = new THREE.Color(q.get('sky') || '#b9a68c');
scene.background = sky; scene.fog = new THREE.Fog(sky, 300, 2600);
scene.add(new THREE.HemisphereLight('#e8dcc8', '#4a4038', 1.4));
const sun = new THREE.DirectionalLight('#ffe2b8', 2.4); sun.position.set(-0.6, 1, -0.4).multiplyScalar(1000); scene.add(sun);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 6000);

const base = await loadClientTerrain(zone);
const T = { ...base, ox: 0, oz: 0, zoneKey: zone };
const extras = await loadZoneExtras(zone);
const ground = createTerrainView(T, { quality: q.get('q') || 'high', biomeColors: Object.fromEntries(base.reader.biomes.map(b => [b.key, b.color])) });
scene.add(ground.group);
const [cx, cy, cz] = num('cam', '1000,60,1000'), [ax, ay, az] = num('at', '1100,0,1000');
camera.position.set(cx, T.heightAt(cx, cz) + cy, cz);
const target = new THREE.Vector3(ax, T.heightAt(ax, az) + ay, az);
camera.lookAt(target);
const town = createTownView(T, extras.placements, { quality: 'high' }); scene.add(town.group);
const walls = createWallsView(T, extras.placements, { quality: 'high' }); if (walls) scene.add(walls.group);
const sc = extras.scatter ? await createScatterView(T, extras.scatter, { quality: 'high' }) : null;
if (sc) { scene.add(sc.group); sc.refresh({ x: cx, z: cz }); }
// [W] ?sites=1: the placed content as the game draws it (forts, farms, curios, vignettes, the island's wayside and folk camps)
if (q.get('sites')) { const { createSiteView } = await import('../js/client/site-view.js'); const sv = extras.vignetteFile ? await createSiteView(T, extras.vignetteFile, { quality: 'high' }) : null; if (sv) { scene.add(sv.group); sv.update?.(0.1, { x: cx, z: cz }); } }
for (let k = 0; k < 40; k++) ground.update(0.3, { x: cx, z: cz });
renderer.render(scene, camera);
info.textContent = `${zone} · ${base.reader.meta.palette || 'default'} palette · cam ${cx},${cz}`;
window.ready = true;
