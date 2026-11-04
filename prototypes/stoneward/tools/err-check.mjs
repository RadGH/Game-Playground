// Load the page and print console errors + the dock tabs: node prototypes/stoneward/tools/err-check.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 402, height: 780 } });
page.on('console', m => console.log(m.type(), m.text()));
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8401/prototypes/stoneward/?dev', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => [...document.querySelectorAll('#dock-tabs button')].map(b => b.textContent).join(',')));
await browser.close();
