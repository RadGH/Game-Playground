// Kestrel kit — screenshots of the faces and hair review sheet (faces.html) against the DEV server (8401).
//   flock /tmp/claude-1000/farhold-pw.lock node avatar-3d/kestrel/kit/tools/faces-shot.mjs <outDir> name=query [name=query ...]
//   env W = viewport width (default 1200). One browser for every shot, full-page pictures of the grid.
import { chromium } from '@playwright/test';
const [outDir, ...specs] = process.argv.slice(2);
const W = +(process.env.W || 1200);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: 900 } });
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
page.on('pageerror', e => logs.push('pageerror: ' + e.message));
for (const spec of specs) {
  const i = spec.indexOf('='), name = spec.slice(0, i), q = spec.slice(i + 1);
  await page.goto(`http://localhost:${process.env.PORT || 8401}/avatar-3d/kestrel/kit/faces.html?shot=1&${q}`);
  try { await page.waitForFunction(() => window.__faces?.ready || window.__faces?.error, null, { timeout: 300000 }); } catch { logs.push(name + ': timeout'); }
  const r = await page.evaluate(() => ({ error: window.__faces?.error, bad: (window.__faces?.cells || []).filter(c => c.error).map(c => c.label + ': ' + c.error), max: Math.max(...(window.__faces?.cells || []).map(c => c.triangles || 0)) }));
  if (r.error) logs.push(name + ': ' + r.error);
  for (const b of r.bad) logs.push(name + ': ' + b);
  console.log(name, 'max triangles', r.max);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
}
for (const l of logs.slice(0, 30)) console.log(l);
await browser.close();
