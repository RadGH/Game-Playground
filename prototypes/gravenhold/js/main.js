import * as THREE from 'three';
import { createChibi2Character } from '../../../avatar-3d/js/chibi2.js';
import { createCreature } from '../../../avatar-3d/js/creatures.js';
import { createSigFx } from '../../thousandvale/js/client/sig-fx.js';
import { createCombatRoom } from './adapters/combat.js';
import { generateDungeon } from './dungeon.js';

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

const wallMat = new THREE.MeshStandardMaterial({ color: '#77706a', roughness: 0.95 });
const floorMat = new THREE.MeshStandardMaterial({ color: '#514b48', roughness: 1 });
const dungeonGroup = new THREE.Group(); scene.add(dungeonGroup);
const minimap = document.querySelector('#minimap'), mapCtx = minimap.getContext('2d');
let dungeon, floorNumber = 1;
function buildDungeon(seed) {
  while (dungeonGroup.children.length) { const o = dungeonGroup.children.pop(); o.geometry?.dispose(); }
  dungeon = generateDungeon(seed, floorNumber);
  const rooms = new Map(dungeon.rooms.map(r => [r.id, r]));
  function slab(x,z,w,d, material=floorMat) { const m=new THREE.Mesh(new THREE.BoxGeometry(w,0.16,d),material); m.position.set(x,-0.08,z); dungeonGroup.add(m); }
  function wall(x,z,w,d,h=2.8) { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wallMat); m.position.set(x,h/2-0.08,z); dungeonGroup.add(m); }
  const doorMat = new THREE.MeshStandardMaterial({color:'#b99761', roughness:.8});
  for (const r of dungeon.rooms) {
    slab(r.x,r.z,r.width,r.depth);
    // Room boundary walls are split at connected doorways.
    const connected = dungeon.links.filter(([a,b])=>a===r.id||b===r.id).map(([a,b])=>rooms.get(a===r.id?b:a));
    for (const side of ['n','s','w','e']) {
      const horizontal = side==='n'||side==='s', edge = side==='n'?r.z-r.depth/2:side==='s'?r.z+r.depth/2:side==='w'?r.x-r.width/2:r.x+r.width/2;
      const neighbors=connected.filter(n=>horizontal?Math.abs(n.x-r.x)<1:Math.abs(n.z-r.z)<1);
      const len=horizontal?r.width:r.depth, axis=horizontal?r.x:r.z;
      if (!neighbors.length) { horizontal?wall(axis,edge,len,.4):wall(edge,axis,.4,len); continue; }
      const center=horizontal?neighbors[0].x:neighbors[0].z, gap=2.5;
      const before=center-gap/2-(axis-len/2), after=axis+len/2-(center+gap/2);
      if (before>0.1) horizontal?wall(axis-len/2+before/2,edge,before,.4):wall(edge,axis-len/2+before/2,.4,before);
      if (after>0.1) horizontal?wall(center+gap/2+after/2,edge,after,.4):wall(edge,center+gap/2+after/2,.4,after);
      const lintel=new THREE.Mesh(new THREE.BoxGeometry(horizontal?gap:.4,.45,horizontal?.4:gap),doorMat); lintel.position.set(horizontal?center:edge,2.05,horizontal?edge:center); dungeonGroup.add(lintel);
    }
  }
  for (const [a,b] of dungeon.links) {
    const r=rooms.get(a), n=rooms.get(b), horizontal=Math.abs(r.x-n.x)>0;
    const length=horizontal?Math.abs(r.x-n.x)-r.width/2-n.width/2+2.5:Math.abs(r.z-n.z)-r.depth/2-n.depth/2+2.5;
    slab((r.x+n.x)/2,(r.z+n.z)/2,horizontal?Math.max(2.5,length):3,horizontal?3:Math.max(2.5,length));
  }
  const stairRoom=rooms.get(dungeon.stairs), stairs=new THREE.Group();
  for(let i=0;i<4;i++){const step=new THREE.Mesh(new THREE.BoxGeometry(2.2,.18,.55),doorMat);step.position.set(0,0.08+i*.17,i*.5);stairs.add(step);}
  stairs.position.set(stairRoom.x,.05,stairRoom.z); stairs.userData.stairs=true; dungeonGroup.add(stairs);
  drawMinimap();
}
function drawMinimap(){
  const w=minimap.width,h=minimap.height; mapCtx.clearRect(0,0,w,h); mapCtx.fillStyle='#17151ce8'; mapCtx.fillRect(0,0,w,h);
  const xs=dungeon.rooms.map(r=>r.x),zs=dungeon.rooms.map(r=>r.z), scale=Math.min((w-20)/28,(h-20)/28), px=x=>w/2+x*scale,pz=z=>h/2+z*scale;
  mapCtx.strokeStyle='#b99761';mapCtx.lineWidth=3;for(const [a,b] of dungeon.links){const r=dungeon.rooms.find(q=>q.id===a),n=dungeon.rooms.find(q=>q.id===b);mapCtx.beginPath();mapCtx.moveTo(px(r.x),pz(r.z));mapCtx.lineTo(px(n.x),pz(n.z));mapCtx.stroke();}
  for(const r of dungeon.rooms){mapCtx.fillStyle=r.id===dungeon.stairs?'#d8bd79':'#77706a';mapCtx.fillRect(px(r.x)-5,pz(r.z)-4,10,8);}
  mapCtx.fillStyle='#75d6b0';mapCtx.beginPath();mapCtx.arc(px(hero.position.x),pz(hero.position.z),3.5,0,Math.PI*2);mapCtx.fill();
}

const hero = new THREE.Group();
scene.add(hero);
buildDungeon(41);
const look = { body: { height: 0.5, width: 0.4, skin: '#e6b991' }, headShape: 'round', hair: { id: 'short', color: '#34251e' }, eyes: { id: 'round', color: '#527b91' }, top: { id: 'tunic', color: '#536b62' } };
const character = await createChibi2Character(look);
hero.add(character.group);
status.textContent = 'Room ready';

// The UI and presentation read the same rows as the rules engine.
const { room, hero: initialCombatHero, target: practiceTarget, classes, skills, makeCharacter, spawn } = await createCombatRoom();
const picker = document.querySelector('#class-select');
let combatHero = initialCombatHero;
const classData = { classes, skills };
const actors = new Map([['hero', { id: 'hero', kind: 'player', pos: hero.position, yaw: 0, look: { cls: 'warrior' } }]]);
const targetBody = await createCreature({ type: 'hound', size: 0.85, seed: 41, colors: { body: '#80554b', belly: '#c3987b', accent: '#4e302b', eyes: '#e7b565' } }, { detail: 0.8 });
const targetMesh = targetBody.group;
targetMesh.position.set(practiceTarget.x, 0, practiceTarget.z); scene.add(targetMesh);
actors.set(practiceTarget.id, { id: practiceTarget.id, kind: 'monster', pos: targetMesh.position, yaw: Math.PI, look: { id: 'practice_target' } });
const roomMonsters = [];
function populateFloorMonsters(skipPractice = false) {
 for (const r of dungeon.rooms) {
  for (let i = 0; i < r.monsters; i++) {
    if (skipPractice && r.id === dungeon.start && i === 0) continue;
    const entity = spawn(`floor${floorNumber}_${r.id}_${i}`, r.x + (i ? 1.4 : -1.4), r.z + (i ? -1.3 : 1.3));
    const body = { group: targetBody.group.clone(true) };
    body.group.position.set(entity.x,0,entity.z); body.group.scale.setScalar(.82); scene.add(body.group);
    const actor={ id:entity.id,kind:'monster',pos:body.group.position,yaw:Math.PI,look:{id:entity.id} }; actors.set(entity.id,actor);
    roomMonsters.push({ entity, body });
  }
 }
}
populateFloorMonsters(true);
const sig = createSigFx(scene, { camera, actors, skillOf: id => skills[id], classOf: () => selectedClass.id });
let selectedClass = classes.find(c => c.id === 'warrior') || classes[0];
for (const cls of classData.classes) { const option = document.createElement('option'); option.value = cls.id; option.textContent = cls.name; picker.append(option); }
picker.value = selectedClass.id;
let mana = 40;
const cooldowns = new Map();
const hotbar = document.querySelector('#hotbar');
function drawBar() {
  hotbar.replaceChildren();
  const equipped = combatHero.skills.slots.map(s => s.id);
  for (const [index, id] of equipped.slice(0, 3).entries()) {
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
addEventListener('keydown', e => { if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { const id = combatHero.skills.slots[Number(e.code.slice(-1))-1]?.id; if (id) cast(id); } });
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); basicAttack(); } });

function basicAttack() {
  const dx = Math.sin(hero.rotation.y), dz = Math.cos(hero.rotation.y);
  const foe = room.field.monsters.filter(m => !m.dead && !m.removed).sort((a,b) => Math.hypot(a.x-hero.position.x,a.z-hero.position.z)-Math.hypot(b.x-hero.position.x,b.z-hero.position.z))[0];
  const result = room.run(() => room.combat.attack(combatHero, { yaw: hero.rotation.y, target: foe || null }));
  if (!result.ok) { status.textContent = result.why; return; }
  status.textContent = foe ? `Attack: ${foe.name}` : 'Attack';
}

const keys = new Set();
addEventListener('keydown', e => { if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyE'].includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
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
    hero.position.x += dx * dt * 3.2;
    hero.position.z += dz * dt * 3.2;
    hero.rotation.y = Math.atan2(dx, dz);
    character.setAnim('walk');
  } else {
    character.setAnim('idle');
  }
  character.update?.(dt);
  const stairs = dungeonGroup.children.find(o => o.userData.stairs);
  if (stairs && Math.hypot(hero.position.x-stairs.position.x,hero.position.z-stairs.position.z)<2 && (keys.has('KeyE') || pad?.buttons?.[0]?.pressed)) {
    floorNumber++;
    for (const {entity,body} of roomMonsters.splice(0)) { room.field.remove(entity); scene.remove(body.group); actors.delete(entity.id); }
    practiceTarget.removed=true; targetMesh.visible=false;
    buildDungeon(41+floorNumber*997); populateFloorMonsters(); document.querySelector('#floor-label').textContent=`FLOOR ${floorNumber}`;
    const start=dungeon.rooms.find(r=>r.id===dungeon.start); hero.position.set(start.x,0,start.z); status.textContent=`Floor ${floorNumber}`;
  }
  mana = Math.min(40, mana + dt * 2.5);
  combatHero.x = hero.position.x; combatHero.z = hero.position.z; combatHero.yaw = hero.rotation.y; combatHero.moving = length > 0;
  room.clock.advance(dt);
  room.run(() => room.combat.tick(dt));
  for (const {entity,body} of roomMonsters) { body.group.position.set(entity.x,entity.hover||0,entity.z); body.group.visible=!entity.dead&&!entity.removed; }
  targetMesh.position.set(practiceTarget.x, practiceTarget.hover || 0, practiceTarget.z);
  targetMesh.visible = !practiceTarget.dead && !practiceTarget.removed;
  if (practiceTarget.hp != null) targetMesh.scale.setScalar(Math.max(0.25, practiceTarget.hp / practiceTarget.maxHp));
  if (practiceTarget.hp < lastTargetHp) { targetBody.group.traverse(o => { if (o.material?.emissive) o.material.emissive.set('#a33b26'); }); status.textContent = `Hit for ${Math.ceil(lastTargetHp - practiceTarget.hp)}`; }
  else targetBody.group.traverse(o => { if (o.material?.emissive) o.material.emissive.set('#000000'); });
  if (!targetMesh.visible && lastTargetHp > 0) status.textContent = `Target defeated · ${combatHero.xp || 0} XP`;
  lastTargetHp = practiceTarget.hp;
  targetHp.textContent = targetMesh.visible ? `${practiceTarget.name} · ${Math.ceil(practiceTarget.hp)} / ${practiceTarget.maxHp}` : `Target defeated · ${combatHero.xp || 0} XP`;
  mana = combatHero.mp;
  sig.update(dt); updateHotbar();
  drawMinimap();
  target.set(hero.position.x, 0, hero.position.z);
  camera.position.set(target.x + 13, 15, target.z + 13);
  camera.lookAt(target);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
window.gravenhold = { room, get hero() { return combatHero; }, player: hero, target: practiceTarget, get dungeon() { return dungeon; } };
requestAnimationFrame(frame);
