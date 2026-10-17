import * as THREE from 'three';
import { createChibi2Character } from '../../../avatar-3d/js/chibi2.js';
import { createCreature } from '../../../avatar-3d/js/creatures.js';
import { createSigFx } from '../../thousandvale/js/client/sig-fx.js';
import { createCombatRoom } from './adapters/combat.js';
import { generateDungeon } from './dungeon.js';
import { moveWithWalls, nearestLiving } from './gameplay.js';
import { pickTalent, talentView } from '../../thousandvale/js/rules/talents.js';
import { allocate, pointsLeft } from '../../farhold/js/perks.js';

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
const wallBoxes = [];
function buildDungeon(seed) {
  while (dungeonGroup.children.length) { const o = dungeonGroup.children.pop(); o.geometry?.dispose(); }
  dungeon = generateDungeon(seed, floorNumber);
  const rooms = new Map(dungeon.rooms.map(r => [r.id, r]));
  function slab(x,z,w,d, material=floorMat) { const m=new THREE.Mesh(new THREE.BoxGeometry(w,0.16,d),material); m.position.set(x,-0.08,z); dungeonGroup.add(m); }
  wallBoxes.length=0;
  function wall(x,z,w,d,h=1.15) { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wallMat); m.position.set(x,h/2-0.08,z); dungeonGroup.add(m); wallBoxes.push({x,z,w,d}); }
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
const { room, engine, hero: initialCombatHero, target: practiceTarget, classes, skills, makeCharacter, spawn, spawnBoss, bossLook } = await createCombatRoom();
const picker = document.querySelector('#class-select');
let combatHero = initialCombatHero;
const classData = { classes, skills };
const actors = new Map([['hero', { id: 'hero', kind: 'player', pos: hero.position, yaw: 0, look: { cls: 'warrior' } }]]);
const players = [{ id:'hero', padIndex:null, group:hero, character:null, combat:combatHero, cls:'warrior', down:false, keys:new Set() }];
players[0].visual=character;
const playerFrames = document.createElement('section'); playerFrames.id='player-frames'; document.querySelector('.hud').append(playerFrames);
const seenPads = new Set();
function addPadPlayer(pad) {
  if (players.some(p=>p.padIndex===pad.index) || players.length>=4) return;
  const id=`player${pad.index+1}`, cls=classes.find(c=>c.id===document.querySelector('#start-class').value)?.id||classes[0].id;
  const group=new THREE.Group(), combat=makeCharacter(cls,id); scene.add(group); group.position.copy(hero.position); room.field.add(combat,'player');
  const look={body:{height:.5,width:.4,skin:['#e6b991','#c58e68','#e2c0a0','#a97052'][players.length%4]},headShape:'round',hair:{id:'short',color:['#34251e','#242424','#765032','#312b48'][players.length%4]},eyes:{id:'round',color:'#527b91'},top:{id:'tunic',color:['#a75845','#526b9b','#8c6b40'][players.length%3]}};
  players.push({id,padIndex:pad.index,group,combat,cls,down:false,keys:new Set(),look});
  createChibi2Character(look).then(c=>{group.add(c.group); players.find(p=>p.id===id).visual=c;});
  actors.set(id,{id,kind:'player',pos:group.position,yaw:0,look:{cls}}); status.textContent=`Player ${players.length} joined · choose a class`;
  drawPlayerFrames();
}
function drawPlayerFrames(){playerFrames.replaceChildren();for(const [i,p] of players.entries()){const card=document.createElement('div');card.className='player-frame';card.dataset.player=p.id;const label=document.createElement('b');label.textContent=`P${i+1} · ${classes.find(c=>c.id===p.cls)?.name||p.cls}${p.down?' · DOWN':''}`;const select=document.createElement('select');select.setAttribute('aria-label',`Player ${i+1} class`);for(const c of classes){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;o.disabled=!meta.unlocked.includes(c.id);select.append(o);}select.value=p.cls;select.addEventListener('change',()=>{p.cls=select.value;room.field.remove(p.combat);p.combat=makeCharacter(p.cls,p.id);room.field.add(p.combat,'player');actors.get(p.id).look.cls=p.cls;if(p===players[0]){combatHero=p.combat;selectedClass=classes.find(c=>c.id===p.cls);picker.value=p.cls;mana=p.combat.mp;drawBar();drawGear();drawEquipment();drawBuildPicks();}});card.append(label,select,document.createElement('small'));card.lastChild.textContent=`HP ${Math.ceil(p.combat.hp)} · ${Math.floor(p.combat.mp)} MP`;playerFrames.append(card);}}
const targetBody = await createCreature({ type: 'hound', size: 0.85, seed: 41, colors: { body: '#80554b', belly: '#c3987b', accent: '#4e302b', eyes: '#e7b565' } }, { detail: 0.8 });
const targetMesh = targetBody.group;
const bossVisual = await createCreature(bossLook || { type:'dragon', size:2.6, colors:{body:'#141216',belly:'#ff5a1a',accent:'#ffb040',eyes:'#fff07a'}, features:{wings:true,horns:true} }, { detail:1 });
targetMesh.position.set(practiceTarget.x, 0, practiceTarget.z); scene.add(targetMesh);
actors.set(practiceTarget.id, { id: practiceTarget.id, kind: 'monster', pos: targetMesh.position, yaw: Math.PI, look: { id: 'practice_target' } });
const roomMonsters = [];
const inventory = [], drops = [];
const inventoryNode=document.querySelector('#inventory'), BAG_LIMIT=12;
const statsOf=item=>Object.entries(item?.stats||item?.mods||{}).map(([k,v])=>`${k}: ${v}`).join(' · ')||'No listed stats';
function drawInventory(){inventoryNode.replaceChildren();document.querySelector('#bag-count').textContent=`${inventory.length}/${BAG_LIMIT}`;inventory.forEach(item=>{const b=document.createElement('button');b.textContent=item.name;b.addEventListener('mouseenter',()=>showCompare(item));b.addEventListener('click',()=>{showCompare(item);const slot=item.slot||item.type||'weapon';engine.rpg.equip(combatHero,item,{into:slot,force:true});drawGear();drawEquipment();status.textContent=`Equipped ${item.name}`;});inventoryNode.append(b);});}
function showCompare(item){const slot=item.slot||item.type||'weapon',worn=combatHero.equipment?.[slot];document.querySelector('#compare').textContent=`${slot}: ${item.name} (${statsOf(item)}) · Worn: ${worn?`${worn.name} (${statsOf(worn)})`:'empty'}`;}

const gearGroup=new THREE.Group(); hero.add(gearGroup);
function drawGear(){while(gearGroup.children.length)gearGroup.remove(gearGroup.children[0]);for(const [slot,item] of Object.entries(combatHero.equipment||{})){if(!item)continue;const color=item.isUnique?'#e3b54a':item.rarity==='rare'?'#e0ca37':item.rarity==='magic'?'#709adb':'#a6aeb5';const geo=slot==='head'?new THREE.SphereGeometry(.23,8,6):new THREE.BoxGeometry(slot==='weapon' ? .12 : .48,slot==='weapon' ? .72 : .34,slot==='weapon' ? .12 : .34);const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,metalness:.25,roughness:.6}));m.position.set(slot==='weapon' ? .38 : 0,slot==='head' ? .91 : slot==='weapon' ? .62 : .48,slot==='weapon' ? .05 : 0);gearGroup.add(m);}}
function drawEquipment(){const n=document.querySelector('#equipment-slots');n.replaceChildren();for(const [slot,item] of Object.entries(combatHero.equipment||{})){const row=document.createElement('div');row.textContent=`${slot}: ${item?.name||'Empty'}`;n.append(row);}}

function spawnDrop(item,x,z){const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.22),new THREE.MeshStandardMaterial({color:item.isUnique?'#e5b84c':item.rarity==='rare'?'#e0cd39':item.rarity==='magic'?'#679be5':'#d2d0c8',emissive:'#302010'}));mesh.position.set(x,.3,z);scene.add(mesh);drops.push({item,mesh});}
function populateFloorMonsters(skipPractice = false) {
 for (const r of dungeon.rooms) {
  for (let i = 0; i < r.monsters; i++) {
    if (skipPractice && r.id === dungeon.start) continue;
    const entity = spawn(`floor${floorNumber}_${r.id}_${i}`, r.x + (i ? 1.4 : -1.4), r.z + (i ? -1.3 : 1.3), floorNumber * 2);
    const body = { group: targetBody.group.clone(true) };
    body.group.position.set(entity.x,0,entity.z); body.group.scale.setScalar(.82); scene.add(body.group);
    const actor={ id:entity.id,kind:'monster',pos:body.group.position,yaw:Math.PI,look:{id:entity.id} }; actors.set(entity.id,actor);
    roomMonsters.push({ entity, body });
  }
 }
}
populateFloorMonsters(true);
const FINAL_FLOOR = 4;
let runActive = false, runEnded = false, runStartedAt = 0, runGold = 0;
let meta = { runs: 0, bestFloor: 0, gold: 0, unlocked: ['warrior'] };
try { const saved = JSON.parse(localStorage.getItem('gravenhold-meta') || 'null'); if (saved && Array.isArray(saved.unlocked)) meta = { ...meta, ...saved }; } catch {}
function saveMeta(){ try { localStorage.setItem('gravenhold-meta', JSON.stringify(meta)); } catch {} }
function paintMeta(){ document.querySelector('#meta-summary').textContent = `Runs ${meta.runs} · Gold ${meta.gold} · Best floor ${meta.bestFloor} · Unlocked: ${meta.unlocked.join(', ')}`; }
drawPlayerFrames();
function finishRun(won){ if(runEnded)return;runEnded=true;runActive=false;meta.runs++;meta.bestFloor=Math.max(meta.bestFloor,floorNumber);meta.gold+=runGold;if(won){const next=classes.find(c=>!meta.unlocked.includes(c.id));if(next)meta.unlocked.push(next.id);}saveMeta();paintMeta();const elapsed=Math.floor((performance.now()-runStartedAt)/1000);document.querySelector('#run-title').textContent=won?'KEEP CLEARED':'RUN ENDED';document.querySelector('#run-copy').textContent=`${won?'Boss defeated':'You fell'} on floor ${floorNumber} · ${runGold} gold · ${Math.floor(elapsed/60)}m ${elapsed%60}s`;document.querySelector('#start-run').textContent='Return to start';document.querySelector('#run-screen').hidden=false;}
function startRun(){selectedClass=classes.find(c=>c.id===document.querySelector('#start-class').value)||classes[0];picker.value=selectedClass.id;for(const p of players){room.field.remove(p.combat);p.cls=p===players[0]?selectedClass.id:p.cls;p.combat=makeCharacter(p.cls,p.id);room.field.add(p.combat,'player');p.down=false;p.group.visible=true;}combatHero=players[0].combat;mana=combatHero.mp;floorNumber=1;runGold=0;runEnded=false;runActive=true;runStartedAt=performance.now();document.querySelector('#floor-label').textContent='FLOOR 1';document.querySelector('#run-screen').hidden=true;const st=dungeon.rooms.find(r=>r.id===dungeon.start);for(const p of players)p.group.position.set(st.x,0,st.z);drawBar();drawEquipment();drawBuildPicks();drawPlayerFrames();status.textContent='Room ready';}
for(const c of classes){const o=document.createElement('option');o.value=c.id;o.textContent=c.name;o.disabled=!meta.unlocked.includes(c.id);document.querySelector('#start-class').append(o);}document.querySelector('#start-class').value='warrior';document.querySelector('#start-class').addEventListener('change',e=>{if(!meta.unlocked.includes(e.target.value))e.target.value='warrior';picker.value=e.target.value;picker.dispatchEvent(new Event('change'));});document.querySelector('#start-run').addEventListener('click',()=>{if(runEnded){document.querySelector('#run-title').textContent='GRAVENHOLD';document.querySelector('#run-copy').textContent='Choose a class and enter the keep.';document.querySelector('#start-run').textContent='Begin run';runEnded=false;floorNumber=1;buildDungeon(41);for(const {entity,body} of roomMonsters.splice(0)){room.field.remove(entity);scene.remove(body.group);actors.delete(entity.id);}populateFloorMonsters(true);}startRun();});paintMeta();
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
function cast(id) { return castPlayer(players[0],id); }
function castPlayer(p,indexOrId) {
  const skillId=typeof indexOrId==='number'?p.combat.skills.slots[indexOrId]?.id:indexOrId;
  const skill = skills[skillId], now = performance.now() / 1000;
  if(!skill)return;
  const slot = p.combat.skills.slots.findIndex(s => s.id === skillId);
  if (slot < 0) { status.textContent = 'Skill unavailable'; return; }
  const targetEntity = nearestLiving(room.field.monsters, p.group.position.x,p.group.position.z);
  const result = room.run(() => room.combat.cast(p.combat, slot, { aim: { x: p.group.position.x, z: p.group.position.z - 4 }, target: targetEntity?.id, yaw: p.group.rotation.y }));
  if (!result.ok) { status.textContent = result.why; return; }
  if(p===players[0])mana=p.combat.mp;
  cooldowns.set(p===players[0]?skillId:`${p.id}:${skillId}`, now + (skill.cooldown || 1));
  actors.get(p.id).look.cls = p.cls;
  drawGear();
  sig.onEvent({ type: 'cast', s: p.id, skill: skillId, aim: { x: p.group.position.x, z: p.group.position.z - 4 } });
  status.textContent = `${skill.name} cast`;
  if(p===players[0])updateHotbar();
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
  players[0].combat=combatHero;players[0].cls=selectedClass.id;
  mana = combatHero.mp;
  actors.get('hero').look.cls = selectedClass.id;
  drawBar(); drawEquipment(); drawBuildPicks();
});
function drawBuildPicks(){const box=document.querySelector('#build-picks');if(!box)return;box.replaceChildren();const views=room.run(()=>talentView(engine,combatHero));for(const view of views){const card=document.createElement('div');card.append(document.createTextNode(view.name));for(const tier of view.tiers.filter(t=>t.open)){for(const node of tier.nodes){const b=document.createElement('button');b.textContent=`${node.name}${node.picked?' ✓':''}`;b.title=node.desc;b.disabled=!!tier.picked;b.addEventListener('click',()=>{const result=room.run(()=>pickTalent(engine,combatHero,view.skillId,tier.tier,node.id));document.querySelector('#level-options').textContent=result.ok?`${node.name} selected`:result.why;drawBuildPicks();});card.append(b);}}box.append(card);}const left=pointsLeft(combatHero);document.querySelector('#level-options').textContent=`Level ${combatHero.level} · Talent tiers and perk points: ${left}`;const forest=engine.rpg.forest;const taken=new Set(['start',...(combatHero.perks||[])]);const choices=new Set([...taken].flatMap(id=>forest.neighbours.get(id)||[]));for(const node of (forest.nodes||[]).filter(n=>choices.has(n.id))){if(left<=0)break;const b=document.createElement('button');b.textContent=`Perk: ${node.name}`;b.disabled=(combatHero.perks||[]).includes(node.id);b.addEventListener('click',()=>{const result=room.run(()=>allocate(combatHero,engine.rpg.forest,node.id));document.querySelector('#level-options').textContent=result.ok?`${node.name} selected`:result.why||'Perk unavailable';drawBuildPicks();});box.append(b);}}
document.querySelector('#level-up').addEventListener('click',()=>{combatHero.level=(combatHero.level||1)+1;engine.rpg.refresh(combatHero,{full:true});drawBuildPicks();});
drawBar();
drawGear(); drawBuildPicks(); drawInventory(); drawEquipment();
addEventListener('keydown', e => { if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { const id = combatHero.skills.slots[Number(e.code.slice(-1))-1]?.id; if (id) cast(id); } });
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); basicAttack(); } });

function basicAttack() {
  const dx = Math.sin(hero.rotation.y), dz = Math.cos(hero.rotation.y);
  const foe = nearestLiving(room.field.monsters,hero.position.x,hero.position.z);
  const result = room.run(() => room.combat.attack(combatHero, { yaw: hero.rotation.y, target: foe || null }));
  if (!result.ok) { status.textContent = result.why; return; }
  status.textContent = foe ? `Attack: ${foe.name}` : 'Attack';
}
function attackPlayer(p){const foe=nearestLiving(room.field.monsters,p.group.position.x,p.group.position.z);room.run(()=>room.combat.attack(p.combat,{yaw:p.group.rotation.y,target:foe||null}));}

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
  let pads=[];try{pads=[...(navigator.getGamepads?.()||[])].filter(p=>p&&p.connected!==false);}catch{}
  for(const pad of pads){const a=!!pad.buttons?.[0]?.pressed, was=seenPads.has(pad.index);if(a&&!was&&!players.some(p=>p.padIndex===pad.index))addPadPlayer(pad);if(a)seenPads.add(pad.index);else seenPads.delete(pad.index);}
  for(const p of players){if(p.down)continue;const pad=p.padIndex==null?null:pads.find(q=>q.index===p.padIndex);let x=p===players[0]?((keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)):0;let z=p===players[0]?((keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)):0;
    if(pad){const ax=Math.abs(pad.axes?.[0]||0)>.2?pad.axes[0]:0,ay=Math.abs(pad.axes?.[1]||0)>.2?pad.axes[1]:0;x=ax;z=ay;const just=(i)=>pad.buttons?.[i]?.pressed&&!p._buttons?.[i];p._buttons=Array.from({length:16},(_,i)=>!!pad.buttons?.[i]?.pressed);if(just(2))attackPlayer(p);if(just(3))castPlayer(p,0);if(just(4))castPlayer(p,1);if(just(5))castPlayer(p,2);if(just(0)&&p===players[0]){} }
    const length=Math.hypot(x,z);if(length){x/=length;z/=length;const dx=(x-z)*.7071,dz=(x+z)*.7071,m=moveWithWalls(p.group.position,dx*dt*3.2,dz*dt*3.2,wallBoxes);p.group.position.set(m.x,0,m.z);p.group.rotation.y=Math.atan2(dx,dz);p.visual?.setAnim('walk');}else p.visual?.setAnim('idle');p.visual?.update?.(dt);
    p.combat.x=p.group.position.x;p.combat.z=p.group.position.z;p.combat.yaw=p.group.rotation.y;p.combat.moving=!!length;
  }
  const pad=players[0].padIndex==null?null:pads.find(p=>p.index===players[0].padIndex);
  const length=Math.hypot((keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0));
  const stairs = dungeonGroup.children.find(o => o.userData.stairs);
  const interact=keys.has('KeyE')||pads.some(p=>p.buttons?.[0]?.pressed);
  if(interact)for(const p of players)if(p.down){const ally=players.find(q=>q!==p&&!q.down&&Math.hypot(q.group.position.x-p.group.position.x,q.group.position.z-p.group.position.z)<1.5);if(ally){p.down=false;p.combat.hp=Math.max(1,Math.floor(p.combat.maxHp*.35));p.group.visible=true;status.textContent=`Player revived`;}}
  if (stairs && floorNumber<FINAL_FLOOR && players.some(p=>Math.hypot(p.group.position.x-stairs.position.x,p.group.position.z-stairs.position.z)<2) && interact && roomMonsters.every(m=>m.entity.dead||m.entity.removed)) {
    floorNumber++;
    for (const {entity,body} of roomMonsters.splice(0)) { room.field.remove(entity); scene.remove(body.group); actors.delete(entity.id); }
    practiceTarget.removed=true; targetMesh.visible=false;
    buildDungeon(41+floorNumber*997); populateFloorMonsters(); if(floorNumber===FINAL_FLOOR){const br=dungeon.rooms.find(r=>r.id===dungeon.stairs),entity=spawnBoss('ossathra',br.x,br.z-1,20),body={group:bossVisual.group.clone(true)};body.group.position.set(entity.x,0,entity.z);scene.add(body.group);actors.set(entity.id,{id:entity.id,kind:'monster',pos:body.group.position,yaw:Math.PI,look:{id:'world_ossathra'}});roomMonsters.push({entity,body});document.querySelector('#floor-label').textContent='BOSS FLOOR';}else document.querySelector('#floor-label').textContent=`FLOOR ${floorNumber}`;
    const start=dungeon.rooms.find(r=>r.id===dungeon.start); for(const p of players)p.group.position.set(start.x,0,start.z); status.textContent=`Floor ${floorNumber}`;
  }
  const exitStairs=dungeonGroup.children.find(o=>o.userData.stairs); if(runActive&&!runEnded&&floorNumber===FINAL_FLOOR&&exitStairs&&players.some(p=>Math.hypot(p.group.position.x-exitStairs.position.x,p.group.position.z-exitStairs.position.z)<2)&&interact&&roomMonsters.every(m=>m.entity.dead||m.entity.removed))finishRun(true);
  for(const p of players)if(!p.down&&(p.combat.hp<=0||p.combat.dead)){p.down=true;p.combat.hp=0;p.group.visible=false;status.textContent=`Player down · approach and press E / A to revive`;}
  if(runActive&&!runEnded&&players.every(p=>p.down))finishRun(false);
  mana = Math.min(40, mana + dt * 2.5);
  room.clock.advance(dt);
  room.run(() => room.combat.tick(dt));
  for (const {entity,body} of roomMonsters) { const pos=moveWithWalls({x:body.group.position.x,z:body.group.position.z},entity.x-body.group.position.x,entity.z-body.group.position.z,wallBoxes,.35); entity.x=pos.x;entity.z=pos.z;body.group.position.set(entity.x,entity.hover||0,entity.z); body.group.visible=!entity.dead&&!entity.removed; if(entity.dead&&!entity._lootDropped){entity._lootDropped=true;const item=engine.rpg.rollDrops(entity,{rng:room.streams.get('loot'),magicFind:combatHero.derived?.magicFind||0})?.[0]||engine.rpg.rollDrop({level:entity.level||1,rng:room.streams.get('loot'),chance:1});if(item)spawnDrop(item,entity.x,entity.z);} }
  for(const d of [...drops]){d.mesh.rotation.y+=dt;const owner=players.filter(p=>!p.down).sort((a,b)=>Math.hypot(a.group.position.x-d.mesh.position.x,a.group.position.z-d.mesh.position.z)-Math.hypot(b.group.position.x-d.mesh.position.x,b.group.position.z-d.mesh.position.z))[0];if(owner&&Math.hypot(owner.group.position.x-d.mesh.position.x,owner.group.position.z-d.mesh.position.z)<.8){scene.remove(d.mesh);drops.splice(drops.indexOf(d),1);if(inventory.length>=BAG_LIMIT){status.textContent='Bag full · 12/12';continue;}inventory.push(d.item);drawInventory();runGold+=Math.max(1,Math.floor((d.item.value||d.item.sell||5)/5));status.textContent=`Picked up ${d.item.name}`;}}
  for(const w of dungeonGroup.children) if(w.geometry?.type==='BoxGeometry' && w.position.y>.3 && Math.abs(w.position.x-hero.position.x)<2.5 && Math.abs(w.position.z-hero.position.z)<2.5){w.material.transparent=true;w.material.opacity=.24;}else if(w.material===wallMat){w.material.transparent=false;w.material.opacity=1;}
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
  const activePlayers=players.filter(p=>!p.down), center=activePlayers.reduce((a,p)=>a.add(p.group.position),new THREE.Vector3()).multiplyScalar(1/Math.max(1,activePlayers.length));
  const spread=activePlayers.reduce((m,p)=>Math.max(m,p.group.position.distanceTo(center)),0);const half=5.2+spread*.72, aspect=innerWidth/innerHeight;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
  target.copy(center);
  camera.position.set(target.x + 13, 15, target.z + 13);
  camera.lookAt(target);
  for(const p of players){const card=playerFrames.querySelector(`[data-player="${p.id}"]`);if(card){card.querySelector('b').textContent=`P${players.indexOf(p)+1} · ${classes.find(c=>c.id===p.cls)?.name||p.cls}${p.down?' · DOWN':''}`;card.querySelector('small').textContent=`HP ${Math.ceil(p.combat.hp)} · ${Math.floor(p.combat.mp)} MP`;}}
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
window.gameplayTest={moveWithWalls,nearestLiving};
const debugStats={projectileSpawns:0,projectileHits:[]};
window.gravenhold = { room, players, debug:{stats:debugStats,reset(){debugStats.projectileSpawns=0;debugStats.projectileHits=[];room.field.out.length=0;},equipNinthStar(){const item=engine.rpg.loot.generate('wand','unique','low',{rng:room.streams.get('loot')});item.name='Wand of the Ninth Star';item.ranged=true;item.castElement='arcane';engine.finishItem(item,{fresh:false,convert:false});engine.rpg.equip(combatHero,item,{into:'weapon',force:true});drawGear();drawEquipment();return item.name;},clearMonsters(){for(const m of [...room.field.monsters])room.field.remove(m);for(const m of roomMonsters.splice(0)){scene.remove(m.body.group);actors.delete(m.entity.id);}},spawnMonster:(id,x,z)=>spawn(id,x,z),attack:basicAttack,levelUp(){document.querySelector('#level-up').click();},chooseTalent(skill,tier,node){return room.run(()=>pickTalent(engine,combatHero,skill,tier,node));},choosePerk(id){return room.run(()=>allocate(combatHero,engine.rpg.forest,id));},skillPlan(id){const i=combatHero.skills.slots.findIndex(s=>s.id===id);const mp=combatHero.mp;const plan=room.run(()=>combatHero.skills.use(i));combatHero.mp=mp;if(combatHero.skills.slots[i])combatHero.skills.slots[i].ready=0;return plan;}}, get hero() { return combatHero; }, player: hero, target: practiceTarget, get dungeon() { return dungeon; }, get run(){return {active:runActive,ended:runEnded,floor:floorNumber,gold:runGold,meta:{...meta}};}, debugDrop(){const item=engine.rpg.loot.generate('wand','magic','low',{rng:room.streams.get('loot')});spawnDrop(item,hero.position.x,hero.position.z);}, debugFanWand(){const item=engine.rpg.loot.generate('wand','normal','low',{rng:room.streams.get('loot')});item.castStyle='fan';item.castForm='fork';item.name='Wand of the Ninth Star';spawnDrop(item,hero.position.x,hero.position.z);}, debugFillBag(){for(let i=inventory.length;i<BAG_LIMIT;i++)inventory.push({name:`Test item ${i+1}`,slot:'weapon'});drawInventory();} };
requestAnimationFrame(frame);

const originalEmit=room.field.emit;room.field.emit=ev=>{if(ev.t==='fx'&&ev.kind==='bolt'&&ev.id==='hero')debugStats.projectileSpawns++;if(ev.t==='hit'&&ev.src==='hero'&&ev.kind==='bolt'&&ev.amt>0)debugStats.projectileHits.push({target:ev.dst,damage:ev.amt});return originalEmit(ev);};
