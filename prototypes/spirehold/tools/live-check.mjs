// Check the public copy: node tools/live-check.mjs
import { chromium } from 'playwright';
const b = await chromium.launch();
for (const vp of [{ width: 1280, height: 800 }, { width: 402, height: 780 }]) {
  const p = await b.newPage({ viewport: vp, hasTouch: vp.width < 700, isMobile: vp.width < 700 });
  const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('https://games.radgh.com/spirehold/'); await p.waitForTimeout(2500);
  console.log(vp.width, 'url', p.url());
  await p.click('text=Found your city'); await p.click('button:has-text("Found it")'); await p.click('button:has-text("Got it")');
  await p.waitForTimeout(6000);
  const st = await p.evaluate(() => window.gameEye.state());
  console.log(vp.width, 'wave', st.wave.n, 'foes', st.wave.foes, 'towers', st.towers.length, 'kills', st.totals.kills);
  await p.screenshot({ path: `shots/live-${vp.width}.png` });
  console.log(vp.width, errs.length ? errs.join(' | ') : 'no console errors');
  await p.close();
}
await b.close();
