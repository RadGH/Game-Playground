// Early game, fast-forwarded with the steward on, plus each sheet. node tools/shot3.mjs
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push('PAGE ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:8401/prototypes/spirehold/?t=${Date.now()}`); await p.evaluate(() => localStorage.clear()); await p.reload();
await p.waitForTimeout(800);
await p.click('text=Found your city'); await p.click('button:has-text("Found it")'); await p.click('button:has-text("Got it")');
await p.evaluate(() => { window.app.G.steward = true; window.app.speed = 3; });
await p.waitForTimeout(25000);
await p.screenshot({ path: 'shots/early-25s3x.png' });
await p.evaluate(() => { const G = window.app.G; G.lore = 1e5; G.shards = 50; G.relics = { oakbow: 2, sunDisc: 1, heartWorld: 1 }; });
for (const tab of ['city', 'mages', 'research', 'realm']) { await p.click(`.tabs button[data-tab=${tab}]`); await p.waitForTimeout(500); await p.screenshot({ path: `shots/tab-${tab}.png` }); }
console.log(JSON.stringify(await p.evaluate(() => window.gameEye.state())).slice(0, 300));
console.log(errs.length ? errs.join('\n') : 'no console errors'); await b.close();
