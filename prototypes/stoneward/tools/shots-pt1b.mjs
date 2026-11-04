// Play-test 1 (part 2): every dock tab on a phone, a tapped seam, the fountain, enemy arrows.
import { chromium } from 'playwright';
const out = process.argv[2] || 'test-results/stoneward-pt1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push('PAGE ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto('http://localhost:8401/prototypes/stoneward/?dev', { waitUntil: 'networkidle' });
await page.click('#btn-new'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 60000 });
await page.evaluate(() => window.gameEye.found());
await page.waitForTimeout(3000);
const shot = n => page.screenshot({ path: `${out}/${n}.png` });
for (const tab of ['rails', 'powers', 'guards', 'info']) {
  const b = page.locator(`#dock-tabs [data-tab="${tab}"]`); if (!await b.count()) continue;
  await b.click(); await page.waitForTimeout(400); await shot('20-tab-' + tab); await b.click();
}
const t = (await page.evaluate(() => window.gameEye.state())).town.towns[0];
// fountains beside the keep, then let the town build them
for (const [k, dx, lm] of [['fountain', 16, false], ['great_fountain', -18, true]]) console.log(k, JSON.stringify(await page.evaluate(([k, x, y, lm]) => window.gameEye.order({ t: 'build', kind: k, x, y, landmark: lm }).then(r => r && (r.error || r.state)), [k, t.x + dx, t.y + 14, lm])));
await page.evaluate(() => window.gameEye.speed(8)); await page.waitForTimeout(25000); await page.evaluate(() => window.gameEye.speed(1));
await page.evaluate(([x, y]) => window.gameEye.fly(x, y + 14, 9), [t.x, t.y]); await page.waitForTimeout(1500); await shot('21-fountains');
// a found seam: tap it
const node = await page.evaluate(() => (window.gameEye.view()?.nodes || [])[0]);
if (node) {
  await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 3), [node[2], node[3]]); await page.waitForTimeout(1200);
  await page.mouse.click(195, 332); await page.waitForTimeout(800); await shot('22-seam-tapped');
} else console.log('no node found yet');
// an enemy far off screen → an arrow at the edge + the ⚔ pill
await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 4), [t.x, t.y]); await page.waitForTimeout(800);
await page.evaluate(([x, y]) => window.gameEye.order({ t: 'spawn', kind: 'troll', x: x + 200, y: y - 60 }), [t.x, t.y]);
await page.waitForTimeout(1200); await shot('23-arrow');
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
