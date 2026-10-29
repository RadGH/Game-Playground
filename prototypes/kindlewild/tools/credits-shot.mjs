// Screenshot the Credits window and the playground credits page: node prototypes/kindlewild/tools/credits-shot.mjs <outdir>
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 402, height: 780 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:8401/prototypes/kindlewild/');
await p.waitForFunction(() => window.gameEye && !document.getElementById('loading'));
await p.click('#go-credits'); await p.waitForTimeout(800);
await p.screenshot({ path: process.argv[2] + '/cr-kw.png' });
await p.goto('http://localhost:8401/credits.html'); await p.waitForTimeout(800);
await p.screenshot({ path: process.argv[2] + '/cr-page.png', fullPage: false });
console.log(errs);
await b.close();
