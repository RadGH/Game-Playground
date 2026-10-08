// W9 (P-client): pictures of the 3D side (clips with tools, node models, stations) — for LOOKING at.
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node prototypes/thousandvale/tests/P/client-look.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./shots/look/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, q, w, h] of [['clips-q', 'view=clips&cam=q', 1100, 1500], ['clips-side', 'view=clips&cam=side', 1100, 1500], ['nodes', 'view=nodes', 1500, 900], ['stations', 'view=stations', 1500, 700]]) {
  if (process.argv[2] && !name.includes(process.argv[2])) continue;
  const page = await browser.newPage({ viewport: { width: w, height: h } }); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await page.goto('http://localhost:8401/prototypes/thousandvale/tests/P/client-look.html?' + q);
  const ok = await page.waitForFunction(() => window.ready, null, { timeout: 90000 }).then(() => true, () => false);
  await page.screenshot({ path: OUT + name + '.png' });
  console.log(name, ok ? 'ok' : 'NOT READY', errs.join(' | ').slice(0, 600));
  await page.close();
}
await browser.close();
