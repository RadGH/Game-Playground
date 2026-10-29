// Kestrel kit — screenshots of icons.html (Thousandvale's gear icons) against the DEV server (8401), Chibi and Kestrel.
//   flock /tmp/claude-1000/farhold-pw.lock node avatar-3d/kestrel/kit/tools/icons-shot.mjs <out dir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const out = process.argv[2] || 'avatar-3d/kestrel/kit/shots/batch5';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [name, q] of [['icons-chibi', ''], ['icons-kestrel', '?chars=kestrel']]) {
  const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:8401/avatar-3d/kestrel/kit/icons.html' + q);
  await page.waitForFunction(() => window.__icons?.ready, null, { timeout: 480000, polling: 1000 }).catch(() => {});
  const st = await page.evaluate(() => window.__icons);
  await page.screenshot({ path: join(out, name + '.png'), fullPage: true });
  console.log(name, `${st.done}/${st.total} in ${((Date.now() - t0) / 1000).toFixed(1)} s`, errs.length ? 'errors: ' + errs.slice(0, 5).join(' | ') : 'no errors');
  await page.close();
}
await browser.close();
