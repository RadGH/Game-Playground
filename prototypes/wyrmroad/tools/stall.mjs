import { loadData, loadT } from './botrun.mjs';
import { createBrawl, step } from '../js/sim/brawl.js';
import { starterGear } from '../js/sim/items.js';
const [chapter='millbrook', n='4', seed='2'] = process.argv.slice(2);
const data=loadData(), T=loadT(); const ch=data.chapters.chapters.find(c=>c.id===chapter);
const cls=['vanguard','arcanist','duelist','warden'];
const G=createBrawl({data,T,chapter,seed:+seed,heroes:Array.from({length:+n},(_,i)=>({pid:'p'+i,cls:cls[i%4],level:ch.level,gear:starterGear(data.items,cls[i%4]),ctrl:'bot'}))});
let last=0, hits=0;
while(!G.over && G.t<400){ step(G,{}); for(const e of G.events){ if(e.type==='kill') last=G.t; if(e.type==='hit') hits++; }
  if(G.t-last>30){ console.log('STALL t',G.t.toFixed(0),'phase',G.phase,'sec',G.secI,'cam',G.camX.toFixed(1),'hits',hits);
    for(const f of G.foes) console.log(' foe',f.kind,f.state,'x',f.x.toFixed(1),'y',f.y.toFixed(2),'z',f.z.toFixed(1),'hp',f.hp+'/'+f.max,'inv',f.invT.toFixed(2),'dir',f.dir,'token',f.ai?.token);
    for(const h of G.heroes) console.log(' hero',h.cls,h.state,'x',h.x.toFixed(1),'z',h.z.toFixed(1),'dir',h.dir,'mv',h.mv?.anim);
    break; } }
