// Start a world, land, and print the sim clock twice + any console/worker errors: node prototypes/stoneward/tools/flow-check.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 402, height: 780 } });
page.on('console', m => { if (m.type() !== 'log' && m.type() !== 'info') console.log(m.type(), m.text().slice(0, 400)); });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('worker', w => w.on('console', m => console.log('WORKER', m.type(), m.text().slice(0, 300))));
await page.goto('http://localhost:8401/prototypes/stoneward/?dev', { waitUntil: 'networkidle' });
await page.click('#btn-new'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 30000 });
await page.mouse.click(201, 390); await page.waitForTimeout(1500);
await page.click('#land-go');
await page.waitForTimeout(4000);
console.log(JSON.stringify(await page.evaluate(() => window.gameEye.state().clock)));
await page.waitForTimeout(3000);
console.log(JSON.stringify(await page.evaluate(() => window.gameEye.state().clock)));
await browser.close();
