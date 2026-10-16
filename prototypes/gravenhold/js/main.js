import * as THREE from 'three';
import { createChibi2Character } from '../../../avatar-3d/js/chibi2.js';
import { createSigFx } from '../../thousandvale/js/client/sig-fx.js';
import { createCombatRoom } from './adapters/combat.js';

const canvas = document.querySelector('#scene');
const status = document.querySelector('#status');
const targetHp = document.querySelector('#target-hp');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#17151c');
const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
camera.position.set(13, 15, 13);
camera.lookAt(0, 0, 0);
const target = new THREE.Vector3();
const hemi = new THREE.HemisphereLight('#b5c0d7', '#43372d', 1.45);
scene.add(hemi);
const key = new THREE.DirectionalLight('#ffe2b4', 2.3);
key.position.set(-5, 10, 4);
scene.add(key);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ color: '#514b48', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.08;
scene.add(floor);
const grid = new THREE.GridHelper(16, 16, '#75695a', '#625950');
grid.position.y = -0.06;
scene.add(grid);
const wallMat = new THREE.MeshStandardMaterial({ color: '#77706a', roughness: 0.95 });
function wall(x, z, sx, sz) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.8, sz), wallMat);
  mesh.position.set(x, 1.32, z);
  scene.add(mesh);
}
wall(0, -8, 16, 0.45); wall(-8, 0, 0.45, 16); wall(8, 0, 0.45, 16);
wall(-5.45, 8, 5.1, 0.45); wall(5.45, 8, 5.1, 0.45);
// Blocky stone piers give the room a readable scale while leaving the center open.
for (const [x, z] of [[-6.8, -6.8], [6.8, -6.8], [-6.8, 6.8], [6.8, 6.8]]) {
  const pier = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.3, 0.8), wallMat);
  pier.position.set(x, 1.55, z); scene.add(pier);
}

const hero = new THREE.Group();
scene.add(hero);
const look = { body: { height: 0.5, width: 0.4, skin: '#e6b991' }, headShape: 'round', hair: { id: 'short', color: '#34251e' }, eyes: { id: 'round', color: '#527b91' }, top: { id: 'tunic', color: '#536b62' } };
const character = await createChibi2Character(look);
hero.add(character.group);
status.textContent = 'Room ready';

// The UI and presentation read the same rows as the rules engine.
const { room, hero: initialCombatHero, target: practiceTarget, classes, skills, makeCharacter } = await createCombatRoom();
let combatHero = initialCombatHero;
const classData = { classes, skills };
const actors = new Map([['hero', { id: 'hero', kind: 'player', pos: hero.position, yaw: 0, look: { cls: 'starcaller' } }]]);
const targetMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: '#a34d46', emissive: '#34100d' }));
targetMesh.position.set(practiceTarget.x, 0.55, practiceTarget.z); scene.add(targetMesh);
actors.set(practiceTarget.id, { id: practiceTarget.id, kind: 'monster', pos: targetMesh.position, yaw: Math.PI, look: { id: 'practice_target' } });
const sig = createSigFx(scene, { camera, actors, skillOf: id => skills[id], classOf: () => selectedClass.id });
let selectedClass = classes.find(c => c.id === 'starcaller') || classes[0];
const picker = document.querySelector('#class-select');
for (const cls of classData.classes) { const option = document.createElement('option'); option.value = cls.id; option.textContent = cls.name; picker.append(option); }
let mana = 40;
const cooldowns = new Map();
const hotbar = document.querySelector('#hotbar');
function drawBar() {
  hotbar.replaceChildren();
  for (const [index, id] of selectedClass.skills.slice(0, 3).entries()) {
    const skill = skills[id];
    const b = document.createElement('button'); b.type = 'button'; b.dataset.skill = id;
    b.innerHTML = `<small>${index + 1} · ${skill.mp || 0} mana</small>${skill.name}`;
    b.addEventListener('click', () => cast(id)); hotbar.append(b);
  }
}
function cast(id) {
  const skill = skills[id], now = performance.now() / 1000;
  const slot = combatHero.skills.slots.findIndex(s => s.id === id);
  if (slot < 0) { status.textContent = 'Skill unavailable'; return; }
  const targetEntity = room.field.monsters.find(m => !m.dead && !m.removed);
  const result = room.run(() => room.combat.cast(combatHero, slot, { aim: { x: hero.position.x, z: hero.position.z - 4 }, target: targetEntity?.id, yaw: hero.rotation.y }));
  if (!result.ok) { status.textContent = result.why; return; }
  mana = combatHero.mp;
  cooldowns.set(id, now + (skill.cooldown || 1));
  actors.get('hero').look.cls = selectedClass.id;
  sig.onEvent({ type: 'cast', s: 'hero', skill: id, aim: { x: hero.position.x, z: hero.position.z - 4 } });
  status.textContent = `${skill.name} cast`;
  updateHotbar();
}
function updateHotbar() {
  document.querySelector('#mana').textContent = `Mana ${Math.floor(mana)} / 40`;
  for (const b of hotbar.children) {
    const skill = skills[b.dataset.skill], remain = Math.max(0, (cooldowns.get(b.dataset.skill) || 0) - performance.now() / 1000);
    b.disabled = remain > 0 || mana < (skill.mp || 0);
    b.querySelector('small').textContent = remain > 0 ? `${remain.toFixed(1)}s` : `${skill.mp || 0} mana`;
  }
}
picker.addEventListener('change', () => {
  selectedClass = classData.classes.find(c => c.id === picker.value) || classData.classes[0];
  room.field.remove(combatHero);
  combatHero = makeCharacter(selectedClass.id);
  room.field.add(combatHero, 'player');
  mana = combatHero.mp;
  actors.get('hero').look.cls = selectedClass.id;
  drawBar();
});
drawBar();
addEventListener('keydown', e => { if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { const id = selectedClass.skills[Number(e.code.slice(-1)) - 1]; if (id) cast(id); } });
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); basicAttack(); } });

function basicAttack() {
  const dx = Math.sin(hero.rotation.y), dz = Math.cos(hero.rotation.y);
  const foe = room.field.monsters.filter(m => !m.dead && !m.removed).sort((a,b) => Math.hypot(a.x-hero.position.x,a.z-hero.position.z)-Math.hypot(b.x-hero.position.x,b.z-hero.position.z))[0];
  const result = room.run(() => room.combat.attack(combatHero, { yaw: hero.rotation.y, target: foe || null }));
  if (!result.ok) { status.textContent = result.why; return; }
  status.textContent = foe ? `Attack: ${foe.name}` : 'Attack';
}

const keys = new Set();
addEventListener('keydown', e => { if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const button = document.querySelector('#tilt');
button.addEventListener('click', () => {
  const on = document.body.classList.toggle('tilt');
  button.setAttribute('aria-pressed', String(on));
  button.textContent = `Tilt shift: ${on ? 'on' : 'off'}`;
});

function resize() {
  const aspect = innerWidth / innerHeight;
  const halfH = 5.2;
  camera.left = -halfH * aspect; camera.right = halfH * aspect;
  camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener('resize', resize);
resize();
let previous = performance.now();
let lastTargetHp = practiceTarget.hp;
function frame(now) {
  const dt = Math.min(0.05, (now - previous) / 1000); previous = now;
  const pad = navigator.getGamepads?.().find(p => p?.connected && p.mapping === 'standard');
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  let z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  if (pad) { const ax = Math.abs(pad.axes[0] || 0) > 0.2 ? pad.axes[0] : 0; const ay = Math.abs(pad.axes[1] || 0) > 0.2 ? pad.axes[1] : 0; if (ax || ay) { x = ax; z = ay; } }
  const length = Math.hypot(x, z);
  if (length > 0) {
    x /= length; z /= length;
    // Camera-facing diagonal controls preserve the usual WASD feel in the isometric view.
    const dx = (x - z) * 0.7071, dz = (x + z) * 0.7071;
    hero.position.x = THREE.MathUtils.clamp(hero.position.x + dx * dt * 3.2, -7, 7);
    hero.position.z = THREE.MathUtils.clamp(hero.position.z + dz * dt * 3.2, -7, 7);
    hero.rotation.y = Math.atan2(dx, dz);
    character.setAnim('walk');
  } else {
    character.setAnim('idle');
  }
  character.update?.(dt);
  mana = Math.min(40, mana + dt * 2.5);
  combatHero.x = hero.position.x; combatHero.z = hero.position.z; combatHero.yaw = hero.rotation.y; combatHero.moving = length > 0;
  room.clock.advance(dt);
  room.run(() => room.combat.tick(dt));
  targetMesh.position.set(practiceTarget.x, 0.55 + (practiceTarget.hover || 0), practiceTarget.z);
  targetMesh.visible = !practiceTarget.dead && !practiceTarget.removed;
  if (practiceTarget.hp != null) targetMesh.scale.setScalar(Math.max(0.25, practiceTarget.hp / practiceTarget.maxHp));
  if (practiceTarget.hp < lastTargetHp) { targetMesh.material.emissive.set('#a33b26'); status.textContent = `Hit for ${Math.ceil(lastTargetHp - practiceTarget.hp)}`; }
  else targetMesh.material.emissive.set('#34100d');
  if (!targetMesh.visible && lastTargetHp > 0) status.textContent = `Target defeated · ${combatHero.xp || 0} XP`;
  lastTargetHp = practiceTarget.hp;
  targetHp.textContent = targetMesh.visible ? `${practiceTarget.name} · ${Math.ceil(practiceTarget.hp)} / ${practiceTarget.maxHp}` : `Target defeated · ${combatHero.xp || 0} XP`;
  mana = combatHero.mp;
  sig.update(dt); updateHotbar();
  target.set(hero.position.x, 0, hero.position.z);
  camera.position.set(target.x + 13, 15, target.z + 13);
  camera.lookAt(target);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
