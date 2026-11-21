import { loadData, loadT } from './botrun.mjs';
import { createBrawl, step, releaseHold } from '../js/sim/brawl.js';
import { chapterGear } from '../js/sim/items.js';
// Finds fights that never end: no kill for 30 s. Bots wear the previous chapter's set at Fine (as tools/botrun.mjs).
const [chapter='millbrook', n='4', seed='2'] = process.argv.slice(2);
const data=loadData(), T=loadT(); const ch=data.chapters.chapters.find(c=>c.id===chapter);
const cls=['vanguard','arcanist','duelist','warden'];
const G=createBrawl({data,T,chapter,seed:+seed,heroes:Array.from({length:+n},(_,i)=>({pid:'p'+i,cls:cls[i%4],level:ch.level,gear:chapterGear(data.items,cls[i%4],Math.max(0,(ch.tier??1)-1)),ctrl:'bot'}))});
// progress = a kill, or the enemies' health brought to a new low (a long fight against tough foes that keeps losing
// health is not a stall; a healer out-healing the heroes, or a foe nobody can reach, is)
let last=0, hits=0, low=Infinity;
while(!G.over && G.t<900){ if(G.hold) releaseHold(G); step(G,{}); for(const e of G.events){ if(e.type==='kill') last=G.t; if(e.type==='hit') hits++; if(e.type==='wave'||e.type==='rise'||e.type==='boss'||e.type==='fight') low=Infinity; }
  const left=G.foes.filter(f=>f.team===1 && f.state!=='dead' && f.state!=='calm'), sum=left.reduce((a,f)=>a+Math.max(0,f.hp),0), max=left.reduce((a,f)=>a+f.max,0);
  if(left.length > (G._stallN||0)) low=Infinity; G._stallN=left.length;   // newcomers (summons) restart the count
  if(sum < low - max*0.01 || low===Infinity){ if(low!==Infinity) last=G.t; low=sum; }
  if(G.t-last>30){ console.log('STALL t',G.t.toFixed(0),'phase',G.phase,'sec',G.secI,'cam',G.camX.toFixed(1),'hits',hits);
    for(const f of G.foes) console.log(' foe',f.kind,f.state,'x',f.x.toFixed(1),'y',f.y.toFixed(2),'z',f.z.toFixed(1),'hp',f.hp+'/'+f.max,'inv',f.invT.toFixed(2),'dir',f.dir,'token',f.ai?.token);
    for(const h of G.heroes) console.log(' hero',h.cls,h.state,'x',h.x.toFixed(1),'z',h.z.toFixed(1),'dir',h.dir,'mv',h.mv?.anim);
    break; } }
