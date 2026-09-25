// Watch a versus match (passive player) and screenshot the Umbra army during its push.
import { chromium } from '@playwright/test';
const out = process.argv[2] || '.';
const style = process.argv[3] || 'bastion';
const seed = process.argv[4] || '5';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:8460/?play=versus&nopause&seed=${seed}`);
await page.waitForTimeout(1000);
await page.evaluate((style) => { const g = window.app.game; const tpl = g.data['ai-templates']; g.ai.styleKey = style; g.ai.style = tpl.styles[style]; }, style);
// Fast-forward headlessly inside the page to t=360s.
await page.evaluate(() => { const g = window.app.game; for (let i = 0; i < 30 * 360; i++) g.tick(); });
for (let k = 0; k < 4; k++) {
  await page.evaluate(() => {
    const g = window.app.game; for (let i = 0; i < 30 * 20; i++) g.tick();
    const us = g.units.filter((u) => u.team === 2 && u.type !== 'drone');
    if (us.length) { const xs = us.map((u) => u.x).sort((a, b) => a - b); const u = us.find((q) => q.x === xs[Math.floor(xs.length / 2)]); window.app.camera.centerOn(u.x, u.y - 20); }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/watch${k}.png` });
}
console.log(await page.evaluate(() => { const g = window.app.game; return g.units.filter((u) => u.team === 2 && u.type !== 'drone').map((u) => `${u.type}@${Math.round(u.x)},${Math.round(u.y)} ${u.order.t}${u.target ? ' T' + u.target : ''}${u.pointTarget ? ' P' : ''}`).join('\n'); }));
await browser.close();
