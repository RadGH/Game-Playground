import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 810 } });
p.on('console', m => console.log('console', m.text())); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8401/prototypes/lanternfall/spike/');
await p.waitForTimeout(6000);
console.log(await p.evaluate(() => JSON.stringify(window.__stats)));
await p.screenshot({ path: process.argv[2] || 'spike.png' });
await b.close();
