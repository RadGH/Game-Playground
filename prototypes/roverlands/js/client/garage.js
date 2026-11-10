// The Garage: every vehicle model on a turntable with Chibi riders in its seats (a dev page — compare with
// assets/ref/<id>.webp). ?v=<id>&cam=side|front|top|34|back&riders=0&spin=0&xray=1&zoom=1.6&t=2
//   xray=1   the vehicle drawn see-through, so riders inside a closed cab can be checked
//   zoom     moves the camera in (2 = half the distance); t = freeze the steering/wheel clock at t seconds
//   window.garage.fit() -> per seat: arm stretch, how far the hips are from the seat point, head clearance under the
//   roof and foot gap over the floor (rays against the vehicle model, metres; negative = through it)
import * as THREE from 'three';
import { buildModel } from './models/index.js';
import { createRider, handTargets as riderHands } from './riders.js';
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
const ONLY_SEAT = Q.get('seat') != null ? +Q.get('seat') : null, LOOK = Q.get('look'), DBG = Q.get('dbg') === '1', XRAY = Q.get('xray') === '1', ZOOM = +(Q.get('zoom') || 1), FREEZE = Q.get('t') != null ? +Q.get('t') : null;
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
  if (Q.get('hide') === '1') model.group.traverse(o => { if (o.isMesh && !(model.steer && isUnder(o, model.steer))) o.visible = false; });
  if (XRAY) model.group.traverse(o => { if (o.isMesh && !(model.steer && isUnder(o, model.steer)) && !(model.turret && isUnder(o, model.turret.yaw))) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.28; o.material.depthWrite = false; o.castShadow = false; } });
  let tris = 0; model.group.traverse(o => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  let draws = 0; model.group.traverse(o => { if (o.isMesh) draws++; });
  if (showRiders) {
    let seed = 11;
    for (const [si, seat] of def.seats.entries()) {
      const look = randomLook(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
      if (ONLY_SEAT != null && si !== ONLY_SEAT) continue;
      const r = await createRider(avatarOf(LOOK ? { race: LOOK, seed: 7, v: 1 } : { ...look, race: 'human' }));
      r.seat = seat; scene.add(r.group); riders.push(r);
    }
  }
  document.getElementById('info').textContent = `${def.name}: ${Math.round(tris)} triangles, ${draws} meshes, mass ${def.mass} kg, ${def.seats.length} seats`;
  window.garage = { id, tris: Math.round(tris), draws, ready: true, fit };
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
  if (FREEZE != null) t = FREEZE;
  if (spin) turn.rotation.y += dt * 0.4;
  const cam = document.getElementById('cam').value;
  const d = Math.max(4.5, def.chassis.hz * 3.4) / ZOOM;
  // zoomed in, the camera aims at the middle of the seats instead of the middle of the vehicle
  const aim = ZOOM > 1 && def.seats.length ? seatMid() : new THREE.Vector3(0, 0.7, 0);
  if (cam === 'back') camera.position.set(0, 1.4, -d * 1.25); else if (cam === 'side') camera.position.set(d * 1.25, 1.0, 0); else if (cam === 'front') camera.position.set(0, 1.2, d * 1.25);
  else if (cam === 'top') camera.position.set(0, d * 1.6, 0.01); else camera.position.set(d * 0.85, d * 0.45, d * 0.85);
  if (ZOOM > 1) camera.position.add(new THREE.Vector3(aim.x, aim.y - 0.7, aim.z));
  camera.lookAt(aim);
  const st = { steer: Math.sin(t * 0.8) * 0.35, wheels: def.wheels.map(w => ({ comp, spin: t * 3, steer: w.steer ? Math.sin(t * 0.8) * 0.35 * w.steer : 0 })) };
  model?.update(st);
  if (model?.turret) { model.turret.yaw.rotation.y = Math.sin(t * 0.5) * 0.6; }
  turn.updateMatrixWorld(true);
  let di = 0;
  for (const r of riders) {
    const hands = handTargets(r.seat);
    r.seated(model.group, r.seat, hands);
    r.update(dt);
    if (DBG) {
      // red = where the hands are asked to go, yellow = where the fists ended up
      for (const h of hands || []) dot(di++, h, '#ff2020');
      if (hands) for (const sd of ['L', 'R']) dot(di++, r.body.parts['grip' + sd].getWorldPosition(new THREE.Vector3()), '#ffd000');
    }
  }
  for (; di < dots.length; di++) dots[di].visible = false;
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
const dots = [];
function dot(i, p, col) {
  if (!dots[i]) { dots[i] = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: col, depthTest: false })); dots[i].renderOrder = 9; scene.add(dots[i]); }
  dots[i].visible = true; dots[i].position.copy(p);
}
function seatMid() {
  const m = new THREE.Vector3();
  for (const s of def.seats) m.add(new THREE.Vector3(s.p[0], s.p[1] + (s.stand ? 0.9 : 0.35), s.p[2]));
  m.divideScalar(def.seats.length);
  return m.applyMatrix4(model.group.matrixWorld);
}
function handTargets(seat) { return riderHands(model, seat); }
frame();

/** Per rider: arm stretch, hip error, head clearance and foot gap (see the header). */
function fit() {
  const ray = new THREE.Raycaster(), meshes = [];
  model.group.traverse(o => { if (o.isMesh && !(model.steer && isUnder(o, model.steer))) meshes.push(o); });
  const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);
  const cast = (from, dir) => { ray.set(from, dir); ray.far = 3; const h = ray.intersectObjects(meshes, false)[0]; return h ? h.distance : null; };
  turn.updateMatrixWorld(true);
  return riders.map(r => {
    const f = r.fitInfo?.() || {};
    const head = f.headCentre && new THREE.Vector3(...f.headCentre);
    const roof = head ? cast(head, up) : null;
    const out = { role: r.seat.role, pose: r.seat.stand ? 'stand' : r.seat.pose, stretch: f.stretch, slide: f.slide, hipErr: f.hipErr,
      headroom: roof == null ? null : +(roof - f.headR).toFixed(3) };
    if (f.soles) out.feet = f.soles.map(s => { const from = new THREE.Vector3(s[0], f.hipY, s[2]); const d = cast(from, down); return d == null ? null : +(s[1] - (f.hipY - d)).toFixed(3); });
    return out;
  });
}
function isUnder(o, g) { for (let p = o; p; p = p.parent) if (p === g) return true; return false; }
