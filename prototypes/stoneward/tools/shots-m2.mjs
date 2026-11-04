// M2 screenshots: landing on the globe, founding, a town after a few days, night.
// node prototypes/stoneward/tools/shots-m2.mjs <prefix> [width=402] [height=780]
import { chromium } from 'playwright';
const [out, w = 402, h = 780] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8401/prototypes/stoneward/?shots&dev', { waitUntil: 'networkidle' });
await page.click('#btn-new'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: out + '-landing.png' });
// tap the middle of the globe (the best site is centred)
await page.mouse.click(+w / 2, +h / 2);
await page.waitForTimeout(1600);
await page.screenshot({ path: out + '-pick.png' });
await page.click('#land-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'hud', null, { timeout: 10000 });
await page.evaluate(() => window.gameEye.speed(8));
await page.waitForTimeout(25000);
await page.evaluate(() => window.gameEye.speed(1));
await page.waitForTimeout(1500);
await page.screenshot({ path: out + '-town.png' });
await page.click('[data-tab="info"]'); await page.waitForTimeout(600);
await page.screenshot({ path: out + '-info.png' });
await page.click('[data-tab="info"]');
await page.evaluate(() => window.gameEye.order({ t: 'time', tod: 0.72 }));
await page.waitForTimeout(1500);
await page.screenshot({ path: out + '-night.png' });
console.log(JSON.stringify(await page.evaluate(() => window.gameEye.state())));
console.log(logs.join('\n'));
await browser.close();
