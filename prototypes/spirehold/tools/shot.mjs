// Screenshot helper: node tools/shot.mjs [w] [h] [name] [secs] — loads the game on the dev server, starts a new city, waits, shoots.
import { chromium } from 'playwright';
const [w = 1280, h = 800, name = 'desk', secs = 6] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h }, hasTouch: +w < 700, isMobile: +w < 700 });
const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:8401/prototypes/spirehold/?t=${Date.now()}`);
await p.waitForTimeout(1500);
await p.screenshot({ path: `shots/${name}-title.png` });
await p.click('text=Found your city'); await p.waitForTimeout(300); await p.click('button:has-text("Found it")'); await p.waitForTimeout(500);
await p.click('button:has-text("Got it")').catch(() => {});
await p.evaluate(() => { const G = window.app.G; G.gold = 5000; });
await p.waitForTimeout(+secs * 1000);
await p.screenshot({ path: `shots/${name}-play.png` });
await p.click('.tabs button[data-tab=defend]'); await p.waitForTimeout(500);
await p.screenshot({ path: `shots/${name}-defend.png` });
console.log(JSON.stringify(await p.evaluate(() => window.gameEye.state())).slice(0, 400));
console.log(errs.length ? errs.join('\n') : 'no console errors');
await b.close();
