import * as THREE from 'three';
import { createScene } from './scene.js';
import { createChibi26Character } from './chibi26.js';
import { metrics } from './chibi26-metrics.js';
import { normalizeForChibi26 } from './chibi26-adapter.js';

const stage = document.querySelector('#fit-stage'), scene = createScene(stage, { background: 0x171b22, ground: false });
const mat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
const box = (w,h,d,color,x,y,z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color)); m.position.set(x,y,z); m.castShadow = m.receiveShadow = true; scene.scene.add(m); return m; };
const cyl = (r1,r2,h,color,x,y,z,seg=20) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg),mat(color)); m.position.set(x,y,z); m.castShadow = true; scene.scene.add(m); return m; };
const ball = (r,color,x,y,z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r,16,12),mat(color)); m.position.set(x,y,z); m.castShadow = true; scene.scene.add(m); return m; };
const floor = new THREE.Mesh(new THREE.PlaneGeometry(8,5),mat(0x333a43)); floor.rotation.x=-Math.PI/2; floor.position.set(0,-.01,0); floor.receiveShadow=true; scene.scene.add(floor);
// Plain adult reference mannequin: 1.75 m overall, next to a 0.90 × 2.00 m doorway.
cyl(.19,.14,.54,0xc5cbd0,-1.45,1.12,0); cyl(.105,.12,.27,0xc5cbd0,-1.45,.81,0); ball(.12,0xc5cbd0,-1.45,1.55,0);
cyl(.045,.055,.68,0xb4bbc3,-1.68,1.13,0); cyl(.045,.055,.68,0xb4bbc3,-1.22,1.13,0);
cyl(.07,.09,.82,0xb4bbc3,-1.56,.41,0); cyl(.07,.09,.82,0xb4bbc3,-1.34,.41,0);
box(.9,2,.05,0xd4c09a,1.25,1,0); box(.82,1.92,.06,0x171b22,1.25,1,0.06); box(.08,2.04,.12,0xe0d0b0,.79,1,0); box(.08,2.04,.12,0xe0d0b0,1.71,1,0); box(1,.08,.12,0xe0d0b0,1.25,2.04,0);
// Off-the-shelf compact-car seat at 0.45 m hip plane, dashboard and a 0.38 m steering wheel.
box(.58,.12,.60,0x4b535b,.05,.44,.20); box(.58,.78,.12,0x4b535b,.05,.83,-.10);
box(1.1,.06,.30,0x343b43,.05,.50,1.02); const wheel = new THREE.Mesh(new THREE.TorusGeometry(.19,.016,8,32),mat(0x9da4aa)); wheel.position.set(.05,.79,.77); wheel.rotation.x=.16; scene.scene.add(wheel);
// Full-scale chair to the right of the doorway.
box(.48,.10,.46,0x71563c,2.35,.46,.20); box(.48,.62,.09,0x71563c,2.35,.80,-.01); for (const x of [2.15,2.55]) for (const z of [-.05,.29]) cyl(.025,.025,.42,0x60432f,x,.22,z,10);
box(7,.015,3.8,0x252b33,0,.001,0); scene.controls.target.set(.15,1,0); scene.camera.position.set(.1,2.1,5.6); scene.controls.update();
const look = normalizeForChibi26({ body:{ race:'human', form:'masc', height:.5, width:.5, headSize:.5 } });
const actor = await createChibi26Character(look,{ anims:['idle','walk','seated','drive','sit'] }); scene.scene.add(actor.group); actor.group.position.set(.05,0,.20);
const status = document.querySelector('#fit-status'), numbers = document.querySelector('#fit-numbers');
function showMetrics() {
  const m=metrics(actor), seated=['drive','seated'].includes(actor.anim);
  const rows=[['Height',m.height,1.70,1.80],['Hip / seat',m.hipHeight,seated ? .425 : .83,seated ? .475 : .98],['Eye',m.eyeHeight,seated ? 1.05 : 1.55,seated ? 1.20 : 1.75],['Shoulder width',m.shoulderWidth,.36,.48],['Arm reach',m.armReach,seated ? .50 : .60,seated ? .60 : .76],['Leg length',m.legLength,seated ? .63 : .78,seated ? .76 : .98]];
  numbers.replaceChildren(...rows.map(([k,v,lo,hi])=>{const d=document.createElement('div');d.textContent=`${k}: ${Number(v).toFixed(3)} m · target ${lo.toFixed(2)}–${hi.toFixed(2)} m · ${v>=lo&&v<=hi?'in band':'outside'}`;d.dataset.fit=v>=lo&&v<=hi?'pass':'fail';return d;}),...[[`Seat plane`,.45],['Wheel diameter',.38]].map(([k,v])=>{const d=document.createElement('div');d.textContent=`${k}: ${v.toFixed(3)} m`;return d;}));
  status.textContent='Live rig fit numbers in metres';
}
let walkingThrough = false, walkTime = 0;
function pose(name, x, z) { walkingThrough=false; actor.group.position.set(x,0,z); actor.setAnim(name,0,true); actor.update(.02); actor.group.updateMatrixWorld(true); showMetrics(); }
document.querySelector('#pose-drive').onclick=()=>pose('drive',.05,.20);
document.querySelector('#pose-walk').onclick=()=>{ pose('walk',1.25,.75); walkingThrough=true; walkTime=0; };
document.querySelector('#pose-chair').onclick=()=>pose('seated',2.35,.20);
pose('drive',.05,.20);
scene.addTicker(dt=>{ actor.update(dt); if(walkingThrough){walkTime+=dt; actor.group.position.z=-.75+1.5*Math.min(1,walkTime/2); if(walkTime>=2) walkingThrough=false; } });
window.chibi26Fit={actor,scene,metrics,ready:true};
const clipReport = await fetch('./data/chibi26-clipping.json').then(r=>r.json()).catch(()=>null);
const clipSummary=document.querySelector('#clip-summary'), clipDetails=document.querySelector('#clip-report');
if(clipReport){clipSummary.textContent=`${clipReport.clips} clips × ${clipReport.spread.length} looks · ${clipReport.totals.bodyPairsWithEvents} gear-vs-body proxy events · ${clipReport.totals.skirtClipsWithEvents} approximate robe-profile flags. These are conservative checks; inspect visible geometry before treating a flag as a defect.`; clipDetails.textContent=JSON.stringify(clipReport,null,2);}
else clipSummary.textContent='Clipping report could not be loaded.';
document.querySelector('#clip-details').onclick=()=>{clipDetails.hidden=!clipDetails.hidden;};
