// Screenshot every vehicle in the Garage with a rider in every seat, and print each seat's fit numbers.
//   flock ~/claude/agent/roverlands-pw.lock node prototypes/roverlands/tools/garage-shots.mjs [--out dir] [--only id,id] [--views side,34,xray-side] [--port 8401]
// Run from the playground root. Pictures: <out>/<id>-<view>.png (default prototypes/roverlands/tests/shots/fit/).
// Views: side, 34, front, back, top, plus xray-<view> (vehicle see-through) and close-<view> (camera twice as near).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '8401');
const out = arg('out', 'prototypes/roverlands/tests/shots/fit');
const views = arg('views', 'side,34,xray-side,xray-34').split(',');
const defs = [...JSON.parse(await readFile('prototypes/roverlands/data/vehicles.json', 'utf8')).vehicles, ...JSON.parse(await readFile('prototypes/roverlands/data/vehicles-next.json', 'utf8')).vehicles].filter(v => v.type !== 'prop');
const only = arg('only', '') ? arg('only', '').split(',') : null;
const extra = arg('q', ''), tag = arg('tag', '');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
const report = {};
for (const d of defs) {
  if (only && !only.includes(d.id)) continue;
  for (const view of views) {
    const parts = view.split('-'), cam = parts.at(-1), xray = parts.includes('xray'), close = parts.includes('close');
    const url = `http://localhost:${port}/prototypes/roverlands/garage.html?v=${d.id}&cam=${cam}&spin=0&t=0${xray ? '&xray=1' : ''}${close ? '&zoom=1.7' : ''}${extra ? '&' + extra : ''}`;
    await page.goto(url);
    await page.waitForFunction(() => window.garage?.ready, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    if (!report[d.id]) report[d.id] = await page.evaluate(() => window.garage.fit());
    await page.screenshot({ path: `${out}/${d.id}-${view}${tag ? '-' + tag : ''}.png` });
  }
  console.log(d.id, JSON.stringify(report[d.id]));
}
writeFileSync(`${out}/fit.json`, JSON.stringify(report, null, 1));
await browser.close();
