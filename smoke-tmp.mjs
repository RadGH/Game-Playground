import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{if(m.type()==='error')errs.push(m.text().slice(0,200));});
for (const [q,label] of [['&seed=1','habitable ON seed 1'],['&seed=1&habitable=0','habitable OFF seed 1']]) {
  await p.goto('http://127.0.0.1:8400/prototypes/farhold/?auto=1&quality=low&sound=off'+q, { waitUntil: 'load' });
  await p.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 60000 });
  await p.waitForTimeout(1500);
  console.log(label, JSON.stringify(await p.evaluate(()=>({
    planet: window.farhold.planet.name, arch: window.farhold.planet.archetype,
    towns: (window.farhold.world.nodes||[]).filter(n=>n.type==='settlement'||n.type==='port').length,
    biomes: new Set([...window.farhold.world.biome].slice(0,4000)).size,
  }))));
}
console.log('errors:', errs.length); errs.slice(0,4).forEach(e=>console.log(' -',e));
await b.close();
