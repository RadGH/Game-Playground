// Screenshot the fable preview page against the DEV server (8401), headless chromium on swiftshader.
//   node avatar-3d/kestrel/fable/tools/shot.mjs <out.png> "<query>" [width] [height]
//   e.g. node avatar-3d/kestrel/fable/tools/shot.mjs shots/male-front.png "body=male&view=front&freeze=1" 600 800
//        node avatar-3d/kestrel/fable/tools/shot.mjs shots/male-expr.png "body=male&sheet=expr&w=1200&h=420"
// Several shots in one browser: pass a JSON list file as the first arg: [{ out, query, w, h }, ...]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [first, query = '', w = '600', h = '800'] = process.argv.slice(2);
const jobs = first.endsWith('.json') ? JSON.parse(readFileSync(first, 'utf8')) : [{ out: first, query, w: +w, h: +h }];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
for (const j of jobs) {
  const q = new URLSearchParams(j.query);
  const sheet = q.get('sheet');
  if (!sheet) { q.set('w', j.w || 600); q.set('h', j.h || 800); if (!q.has('freeze')) q.set('freeze', '1'); }
  await page.setViewportSize({ width: sheet ? +(q.get('w') || 1200) + 20 : (j.w || 600) + 40, height: sheet ? +(q.get('h') || 800) + 20 : (j.h || 800) + 240 });
  await page.goto(`http://localhost:${process.env.PORT || 8401}/avatar-3d/kestrel/fable/index.html?${q}`);
  try { await page.waitForFunction(() => window.__kf?.ready || window.__kf?.error, null, { timeout: 120000 }); } catch { logs.push('timeout ' + j.out); }
  const err = await page.evaluate(() => window.__kf?.error); if (err) logs.push('error: ' + err);
  await page.waitForTimeout(250);
  if (sheet) await page.locator('#view').screenshot({ path: j.out });
  else {
    // the main view is 3:4 at up to 900px wide; size it through the viewport and clip the canvas
    await page.evaluate((w) => { const c = document.querySelector('#view'); c.style.maxWidth = w + 'px'; }, j.w || 600);
    await page.waitForTimeout(200);
    await page.locator('#view').screenshot({ path: j.out });
  }
  const stats = await page.evaluate(() => window.__kf?.stats);
  console.log(j.out, stats ? `${stats.triangles} tris, ${stats.bones} bones, ${Math.round(stats.buildMs)} ms` : '(no stats)');
}
for (const l of logs.slice(0, 20)) console.log(l);
await browser.close();
