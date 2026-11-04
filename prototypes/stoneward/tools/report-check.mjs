// Send a test report from the game and print what the page did: node prototypes/stoneward/tools/report-check.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 402, height: 780 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('response', r => { if (r.url().includes('inbox')) console.log('POST', r.url().replace(/^.*\/api/, '/api'), r.status()); });
await page.goto('http://localhost:8401/prototypes/stoneward/?dev', { waitUntil: 'networkidle' });
await page.click('#btn-new'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 30000 });
await page.mouse.click(201, 390); await page.waitForTimeout(1500); await page.click('#land-go');
await page.waitForTimeout(1500);
await page.click('#btn-report'); await page.waitForTimeout(800);
await page.fill('#menu textarea', 'Test report from the automated check (please ignore).');
await page.click('#menu button.big'); await page.waitForTimeout(1500);
console.log(await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('stoneward.reports') || '[]'); return l.map(r => ({ sent: !!r.sent, shot: !!r.shot })); }));
await browser.close();
