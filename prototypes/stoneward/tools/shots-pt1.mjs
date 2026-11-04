// Play-test 1 screenshots on a phone: build list pages + strip, lines strip, menu, globe, views, a raid.
// node prototypes/stoneward/tools/shots-pt1.mjs [outDir]
import { chromium } from 'playwright';
const out = process.argv[2] || 'test-results/stoneward-pt1';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push('PAGE ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
page.on('worker', w => w.on('console', m => { if (m.type() === 'error') errs.push('WORKER ' + m.text().slice(0, 300)); }));
await page.goto('http://localhost:8401/prototypes/stoneward/?dev', { waitUntil: 'networkidle' });
await page.click('#btn-new'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 60000 });
await page.evaluate(() => window.gameEye.found());
await page.waitForTimeout(5000);
const shot = n => page.screenshot({ path: `${out}/${n}.png` });
await page.click('#dock-tabs [data-tab="build"]'); await page.waitForTimeout(300);
await page.click('.groups button:has-text("Homes")'); await page.waitForTimeout(200); await shot('01-build-homes');
await page.click('.groups button:has-text("Services")'); await page.waitForTimeout(200); await shot('02-build-services');
const next = page.locator('.pages button:has-text("›")'); if (await next.count()) { await next.click(); await page.waitForTimeout(200); await shot('03-build-page2'); }
await page.locator('.list.grid .item').first().click(); await page.waitForTimeout(400); await shot('04-placing-strip');
await page.click('.strip button:has-text("Done")');
await page.click('#dock-tabs [data-tab="roads"]'); await page.waitForTimeout(200); await shot('05-lines');
await page.locator('.list.grid .item').nth(3).click(); await page.waitForTimeout(300); await shot('06-drawing-strip');
await page.click('.strip button:has-text("Done")');
await page.click('#btn-menu'); await page.waitForTimeout(300); await shot('07-menu');
console.log('speed while menu open', await page.evaluate(() => window.gameEye.state().clock?.speed));
await page.click('#menu-buttons button:has-text("Report a problem")'); await page.waitForTimeout(800); await shot('08-report');
await page.click('#menu-buttons button:has-text("Cancel")'); await page.waitForTimeout(400);
console.log('speed after', await page.evaluate(() => window.gameEye.state().clock?.speed));
await page.click('#dock-tabs [data-tab="layers2"]'); await page.waitForTimeout(300); await shot('09-views');
await page.click('#dock-tabs [data-tab="layers2"]');
// globe, day and night
const st = await page.evaluate(() => window.gameEye.state());
await page.evaluate(() => { const c = window.gameEye; c.fly(c.state().camera.x, c.state().camera.y, 0.0001); });
await page.waitForTimeout(800); await shot('10-globe-day');
await page.evaluate(() => window.gameEye.order({ t: 'time', tod: 0.75 })); await page.waitForTimeout(1200); await shot('11-globe-night');
await page.evaluate(() => window.gameEye.order({ t: 'time', tod: 0.25 }));
// a raid: spawn a pack of wolves off screen near town, look at the arrows + pill
const t = st.town.towns[0];
await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 3), [t.x, t.y]); await page.waitForTimeout(800);
await page.evaluate(([x, y]) => window.gameEye.order({ t: 'spawn', kind: 'wolf', x: x + 150, y: y + 20, n: 4 }), [t.x, t.y]);
await page.waitForTimeout(1500); await shot('12-enemies-offscreen');
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
