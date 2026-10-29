// Kestrel (opus) screenshots against the DEV server (8401). One browser for every shot, closed at the end.
//   node avatar-3d/kestrel/opus2/tools/shot.mjs <outDir> name=query [name=query ...]   (query for opus/index.html, shot=1 added)
//   env W/H = viewport (default 512x768)
import { chromium } from '@playwright/test';
const [outDir, ...specs] = process.argv.slice(2);
const W = +(process.env.W || 512), H = +(process.env.H || 768);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
for (const spec of specs) {
  const i = spec.indexOf('='), name = spec.slice(0, i), q = spec.slice(i + 1);
  await page.goto(`http://localhost:${process.env.PORT || 8401}/avatar-3d/kestrel/opus2/index.html?shot=1&${q}`);
  try { await page.waitForFunction(() => window.__opus?.ready || window.__opus?.error, null, { timeout: 120000 }); } catch { logs.push(name + ': timeout'); }
  const err = await page.evaluate(() => window.__opus?.error);
  if (err) logs.push(name + ': ' + err);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${name}.png` });
}
for (const l of logs.slice(0, 20)) console.log(l);
await browser.close();
