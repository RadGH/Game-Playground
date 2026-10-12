import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const game=new URL('../../',import.meta.url);
const freePort=()=>new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
let server,base;
test.beforeAll(async()=>{
  const port=await freePort(),hook=await freePort();
  server=spawn(process.execPath,[fileURLToPath(new URL('tests/D/m3-server.mjs',game)),'--port',String(port),'--hook',String(hook)],{cwd:fileURLToPath(game),stdio:['ignore','pipe','pipe']});
  let out='';
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(out)),40000);
    const read=d=>{out+=d;if(/READY \d+ \d+/.test(out)){clearTimeout(timer);resolve();}};
    server.stdout.on('data',read);server.stderr.on('data',read);
    server.on('exit',code=>{clearTimeout(timer);reject(new Error(`Test server exited ${code}: ${out}`));});
  });
  base=`http://127.0.0.1:${port}`;
});
test.afterAll(async()=>{
  if(server && server.exitCode===null) { const ended=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await ended; }
});

for(const [cls,viewport] of [['warrior',{width:1366,height:900}],['warlock',{width:390,height:844}],['starcaller',{width:1366,height:900}]]) {
  test(`${cls}: real server loads six action-bar icons and matching spell-book pictures`,async({browser},testInfo)=>{
    test.setTimeout(120000);
    const context=await browser.newContext({viewport,hasTouch:viewport.width<600,isMobile:viewport.width<600});
    const page=await context.newPage(),errors=[],missing=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().includes('/icons/') && r.status()>=400)missing.push(r.url());});
    try {
      await page.goto(`${base}/prototypes/thousandvale/?autoplay=1&quality=low&name=Icon${cls}&cls=${cls}`);
      await page.waitForFunction(()=>window.tv?.state().status==='online' && window.thousandvale?.ui?.talents,{},{timeout:90000});
      await expect(page.locator('#actionbar .face svg')).toHaveCount(6);
      const picture=await page.locator('#actionbar .face svg').first().boundingBox();
      expect(picture.width,'spell pictures fill their action-bar button').toBeGreaterThanOrEqual(30);
      const barIds=await page.locator('#actionbar .face.has-ico').evaluateAll(es=>es.map(e=>e.dataset.ico));
      expect(new Set(barIds).size).toBe(6);
      const tips=await page.locator('#actionbar .slot:has(.face.has-ico)').evaluateAll(es=>es.map(e=>e.dataset.tipHtml));
      expect(tips.every(t=>t.includes('<svg'))).toBe(true);
      await page.evaluate(async()=>{await thousandvale.ui.talents.ready;thousandvale.ui.talents.skills.open();});
      await expect(page.locator('.tvt-skill .sk-ico')).toHaveCount(6);
      await expect(page.locator('.tvt-dhead .sk-ico')).toHaveCount(1);
      const listIds=await page.locator('.tvt-skill').evaluateAll(es=>es.map(e=>e.dataset.skill));
      expect(listIds).toEqual(barIds);
      const active=page.locator('.tvt-skill:not(.locked)').first();
      await active.click();
      await expect(page.locator('.tvt-dhead')).toContainText(await active.locator('.tvt-sname').evaluate(e=>e.firstChild.textContent));
      await page.screenshot({path:testInfo.outputPath(`${cls}.png`)});
      expect(missing).toEqual([]);expect(errors).toEqual([]);
    } finally {await context.close();}
  });
}
