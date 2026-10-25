// The Garage: every vehicle model on a turntable with Chibi riders in its seats (a dev page — compare with
// assets/ref/<id>.webp). ?v=<id>&cam=side|front|top|34&riders=0&spin=0
import * as THREE from 'three';
import { buildModel } from './models/index.js';
import { createRider } from './riders.js';
import { randomLook, avatarOf, loadLookData } from '../../../knockabout/js/client/look.js';

const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c9cdd2');
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f80', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(6, 10, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b6bab2', roughness: 1 }));
floor.receiveShadow = true; scene.add(floor);

const defs = [...(await (await fetch('data/vehicles.json')).json()).vehicles, ...(Q.get('next') === '0' ? [] : (await (await fetch('data/vehicles-next.json')).json()).vehicles.filter(v => v.id === Q.get('v') || Q.get('next') === '1'))];
const pick = document.getElementById('pick');
for (const d of defs) if (d.type !== 'prop') pick.add(new Option(d.name, d.id));
pick.value = Q.get('v') || defs[0].id;
let showRiders = Q.get('riders') !== '0', spin = Q.get('spin') !== '0';
document.getElementById('cam').value = Q.get('cam') || '34';
await loadLookData?.();
const turn = new THREE.Group(); scene.add(turn);
let model = null, riders = [], def = null, comp = 0.11;

async function show(id) {
  turn.clear(); riders.forEach(r => r.dispose()); riders = [];
  def = defs.find(d => d.id === id);
  model = await buildModel(THREE, def, {});
  // rest the vehicle on the floor: the lowest tyre touches y = 0
  const restY = Math.min(...def.wheels.map(w => w.p[1] + comp - 0.05 - w.r));
  model.group.position.y = -restY;
  turn.add(model.group);
  let tris = 0; model.group.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  let draws = 0; model.group.traverse(o => { if (o.isMesh) draws++; });
  if (showRiders) {
    let seed = 11;
    for (const seat of def.seats) {
      const r = await createRider(avatarOf(randomLook(() => ((seed = (seed * 16807) % 2147483647) / 2147483647))));
      r.seat = seat; scene.add(r.group); riders.push(r);
    }
  }
  document.getElementById('info').textContent = `${def.name}: ${Math.round(tris)} triangles, ${draws} meshes, mass ${def.mass} kg, ${def.seats.length} seats`;
  window.garage = { id, tris: Math.round(tris), draws, ready: true };
}
pick.onchange = () => show(pick.value);
document.getElementById('riders').onclick = e => { showRiders = !showRiders; e.target.textContent = 'Riders: ' + (showRiders ? 'on' : 'off'); show(pick.value); };
document.getElementById('spin').onclick = e => { spin = !spin; e.target.textContent = 'Turn: ' + (spin ? 'on' : 'off'); };
document.getElementById('comp').oninput = e => { comp = +e.target.value; };
await show(pick.value);

const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta()); t += dt;
  if (spin) turn.rotation.y += dt * 0.4;
  const cam = document.getElementById('cam').value;
  const d = Math.max(4.5, def.chassis.hz * 3.4);
  if (cam === 'side') camera.position.set(d * 1.25, 1.0, 0); else if (cam === 'front') camera.position.set(0, 1.2, d * 1.25);
  else if (cam === 'top') camera.position.set(0, d * 1.6, 0.01); else camera.position.set(d * 0.85, d * 0.45, d * 0.85);
  camera.lookAt(0, 0.7, 0);
  const st = { steer: Math.sin(t * 0.8) * 0.35, wheels: def.wheels.map(w => ({ comp, spin: t * 3, steer: w.steer ? Math.sin(t * 0.8) * 0.35 * w.steer : 0 })) };
  model?.update(st);
  if (model?.turret) { model.turret.yaw.rotation.y = Math.sin(t * 0.5) * 0.6; }
  turn.updateMatrixWorld(true);
  for (const r of riders) {
    const hands = handTargets(r.seat);
    r.seated(model.group, r.seat, hands);
    r.update(dt);
  }
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function handTargets(seat) {
  const g = model.group;
  const at = (lp) => new THREE.Vector3(...lp).applyMatrix4(g.matrixWorld);
  if (seat.hands === 'wheel' && model.steer) {
    model.steer.updateMatrixWorld(true);
    return [new THREE.Vector3(0.14, 0, 0).applyMatrix4(model.steer.matrixWorld), new THREE.Vector3(-0.14, 0, 0).applyMatrix4(model.steer.matrixWorld)];
  }
  if (seat.hands === 'bars' && model.steer) {
    model.steer.updateMatrixWorld(true);
    const b = model.steer.children.find(c => c.isGroup && c.position.y > 0.1) || model.steer;
    return [new THREE.Vector3(0.3, 0.035, -0.02).applyMatrix4(b.matrixWorld), new THREE.Vector3(-0.3, 0.035, -0.02).applyMatrix4(b.matrixWorld)];
  }
  if (seat.gun && model.turret) {
    model.turret.pitch.updateMatrixWorld(true);
    return [new THREE.Vector3(0.2, -0.05, -0.25).applyMatrix4(model.turret.pitch.matrixWorld), new THREE.Vector3(-0.2, -0.05, -0.25).applyMatrix4(model.turret.pitch.matrixWorld)];
  }
  return null;
}
frame();
