// node prototypes/bannerline/tools/bench-bannerline.mjs [--url URL] [--frames 240] [--warmup 60] [--output file.json] [--gpu]
//
// Runs bench.html (the PLAN §15.2 crowd benchmark) headless and prints a table plus the decision
// rule. Modelled on tools/bench-chibi2.mjs. Headless Chromium in this VM renders with SwiftShader
// (software), so its FRAME TIMES ARE NOT THE OWNER'S — only the draw calls, triangles and the CPU
// cost of animation are comparable. The real numbers come from opening bench.html on the owner's
// machine and pressing "Run all cases". `--gpu` asks Chromium for hardware GL where there is one.
//
// Run it under the shared browser lock from the playground root:
//   flock /tmp/claude-1000/farhold-pw.lock node prototypes/bannerline/tools/bench-bannerline.mjs

import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes('--' + name);
const launchArgs = ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
if (flag('gpu')) launchArgs.push('--enable-gpu', '--use-gl=angle', '--ignore-gpu-blocklist');
const browser = await chromium.launch({ headless: true, args: launchArgs });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(option('url', 'http://localhost:8401/prototypes/bannerline/bench.html'));
  await page.waitForFunction(() => window.bench && window.bench.ready, null, { timeout: 180000 });
  const gpu = await page.evaluate(() => window.bench.gpu());
  const results = await page.evaluate(o => window.bench.run(o), { frames: +option('frames', 240), warmup: +option('warmup', 60) });
  const verdict = await page.evaluate(() => window.bench.verdict());
  const viewport = await page.evaluate(() => ({ w: innerWidth, h: document.getElementById('view').clientHeight, dpr: devicePixelRatio }));
  const output = { date: new Date().toISOString(), gpu, viewport, note: 'Headless run. Frame times describe this renderer and machine only; compare draw calls, triangles and anim CPU ms.', errors, results, verdict };
  const pad = (v, n) => String(v).padStart(n);
  console.log(`GPU: ${gpu}   canvas ${viewport.w}x${viewport.h}`);
  console.log('case                          bodies    fps   frame    p95  calls   triangles  animCPU  renderCPU');
  for (const r of results) console.log(`${r.label.padEnd(30)}${pad(r.bodies, 6)}${pad(r.fps, 7)}${pad(r.frameMs, 8)}${pad(r.p95, 7)}${pad(r.calls, 7)}${pad(r.triangles.toLocaleString(), 12)}${pad(r.animMs, 9)}${pad(r.renderMs, 11)}`);
  console.log('decision (on THIS machine):', JSON.stringify(verdict));
  if (errors.length) console.log('page errors:', errors);
  if (option('output', null)) await writeFile(option('output'), JSON.stringify(output, null, 2) + '\n');
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
