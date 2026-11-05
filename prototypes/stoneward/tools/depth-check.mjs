// Play-test 2 depth check: test sprites around the keep. RED stands just NORTH of the keep (should be
// hidden by its front face), BLUE stands SOUTH of it (drawn over the keep), GREEN has no foot (always on
// top, the old behaviour). Usage: node tools/depth-check.mjs <outdir> [nolight]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'test-results/stoneward-depth';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errs = [];
page.on('pageerror', e => errs.push('PAGE ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto('http://localhost:8401/prototypes/stoneward/?dev&shots', { waitUntil: 'networkidle' });
if (process.argv[3] === 'nolight') await page.evaluate(() => localStorage.setItem('stoneward.prefs', JSON.stringify({ graphics: 'low' })));
await page.click('#btn-new'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 90000 });
await page.evaluate(() => window.gameEye.found());
await page.waitForTimeout(1500);
const t = (await page.evaluate(() => window.gameEye.state())).town.towns[0];
const keep = await page.evaluate(([x, y]) => window.gameEye.ask('building', { x, y }), [t.x, t.y]);
console.log('keep', keep && [keep.x, keep.y, keep.w, keep.h]);
await page.evaluate(() => window.gameEye.speed(0));
// clear the trees south of the keep (firebreak strips) so only the keep can hide the probes
for (let y = keep.y + keep.h + 1; y < keep.y + keep.h + 22; y += 2) await page.evaluate(([k, y]) => window.gameEye.order({ t: 'firebreak', x0: k.x - 8, y0: y, x1: k.x + k.w + 8, y1: y }), [keep, y]);
await page.evaluate(() => window.gameEye.speed(1)); await page.waitForTimeout(600); await page.evaluate(() => window.gameEye.speed(0));
await page.evaluate(() => { globalThis.LADDER = true; });
await page.evaluate(async k => {
  const { hooks } = await import('/prototypes/stoneward/js/ui/hooks.js');
  const cx = k.x + (k.w >> 1);
  hooks.sprites.push((cam, out, ui) => {
    const n = x => ui.near(x, cam.x, ui.app.world.W);
    const north = k.y + 1, south = k.y + k.h + 1;
    out.push([n(cx - 4), north - 5, 2, 5, 1, 0, 0, 1, north]);          // red: behind the keep
    out.push([n(cx + 2), north - 5, 2, 5, 0.1, 1, 0.1, 1]);             // green: no foot, on top
    out.push([n(k.x + k.w - 2), south - 6, 1.5, 6, 0.2, 0.4, 1, 1, south]);      // blue: in front of the keep
    // a ladder to the east of the keep on open ground: feet from k.y-2 to k.y+k.h+3 (yellow)
    // magenta probes over the keep's south face (rows B-4..B, B = its last row), standing at B-3, B-1,
    // B (hidden: the face of row B is south of / level with them... B itself is drawn: foot >= row), B+1, B+2 (drawn)
    const B = k.y + k.h - 1;
    if (globalThis.LADDER) [-3, -1, 0, 1, 2].forEach((d, j) => out.push([n(k.x + 1 + j * 2), B - 4, 1.4, 4.5, 1, 0, 1, 1, B + d]));
  });
}, keep);
await page.evaluate(([x, y]) => window.gameEye.fly(x, y, 9), [keep.x + keep.w / 2, keep.y + keep.h / 2]);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/depth-keep${process.argv[3] ? '-' + process.argv[3] : ''}.png` });
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
