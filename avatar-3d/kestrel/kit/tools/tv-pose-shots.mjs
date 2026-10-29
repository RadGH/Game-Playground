// Kestrel kit — screenshots of tv.html (Thousandvale looks in game clips) against the DEV server (8401).
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node avatar-3d/kestrel/kit/tools/tv-pose-shots.mjs <out dir> set:clip:t:view ...
//   e.g. weapons:attack:0.4:front weapons:ready::three races:idle::front
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [out, ...jobs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 760 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
let lastKey = null;
for (const job of jobs) {
  const [set, clip, t, view = 'three', chibi = ''] = job.split(':');
  const key = set + '|' + chibi;
  const q = `set=${set}&clip=${clip}${t ? '&t=' + t : ''}&view=${view}${chibi ? '&chibi=1' : ''}&shot=1`;
  if (key !== lastKey) { await page.goto(`http://127.0.0.1:8401/avatar-3d/kestrel/kit/tv.html?${q}${process.env.PICK ? '&pick=' + process.env.PICK : ''}`); await page.waitForFunction(() => window.__tv?.ready, null, { timeout: 240000 }); lastKey = key; }
  else {
    await page.evaluate(({ clip, t, view }) => { window.__tv.setClip(clip, t === '' ? null : +t); const v = document.getElementById('view'); v.value = view; v.onchange(); }, { clip, t, view });
  }
  await page.waitForTimeout(t ? 700 : 1500);
  await page.screenshot({ path: join(out, job.replace(/[:.]/g, '_') + '.png') });
  console.log(job, JSON.stringify(await page.evaluate(() => window.__tv.stats)).slice(0, 300));
}
console.log('errors', errs.length ? errs.slice(0, 6).join('\n') : 'none');
await browser.close();
