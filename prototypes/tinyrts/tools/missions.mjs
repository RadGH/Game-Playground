// Screenshot the start of each campaign mission, focused on its special feature.
import { chromium } from '@playwright/test';
const out = process.argv[2] || '.';
const which = (process.argv[3] || '0,1,2,3,4,5,6,7').split(',').map(Number);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:8460/?nopause');
await page.waitForTimeout(800);
for (const i of which) {
  await page.evaluate((i) => { window.app.startMission(i); }, i);
  await page.waitForTimeout(600);
  await page.evaluate((i) => {
    const g = window.app.game, cam = window.app.camera;
    const ex = g.saveExtra || {};
    if (ex.nests) { const n = g.byId.get(ex.nests[0]); cam.centerOn(n.x, n.y - 20); }
    else if (ex.bridge) cam.centerOn((ex.bridge.a + ex.bridge.b) / 2, ex.bridge.y0);
    else if (ex.beacons) { const b = g.byId.get(ex.beacons[0]); cam.centerOn(b.x, b.y); }
  }, i);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/mission${i}.png` });
}
await browser.close();
