// node tools/bench.mjs [--save-baseline] — run bench_flood headless (software GPU) and print the report.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:8401/prototypes/lanternfall/index.html?room=bench_flood&bench=1');
await p.waitForFunction(() => window.lanternfall?.ready);
// headless frames are slow; drive the sim deterministically instead of waiting on real time
const report = await p.evaluate(async () => {
  const L = lanternfall; L.loop.stop();
  for (let k = 0; k < 20 * 60 + 5; k++) { L.stepTimed(); if (k % 30 === 0) L.renderOnce(); }
  return L.perf.bench;
});
console.log(JSON.stringify(report, null, 1));
await p.screenshot({ path: new URL('../../../test-results/lanternfall-bench.png', import.meta.url).pathname });
if (process.argv.includes('--save-baseline')) writeFileSync(new URL('../tests/fixtures/bench-baseline.json', import.meta.url), JSON.stringify(report, null, 1));
await b.close();
