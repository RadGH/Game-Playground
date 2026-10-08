// W9 (P-client): pictures of every profession scene in every frame, for LOOKING at (not a test).
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node prototypes/thousandvale/tests/P/client-shots.mjs [scene-id-part] [device,device]
// -> prototypes/thousandvale/tests/P/shots/<device>/<scene>.png and a line per scene with the stage's errors.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { PROF_SCENES } from '../../js/client/gallery/prof-scenes.js';
import { DEVICES } from '../../js/client/gallery/scenes.js';

const BASE = 'http://localhost:8401/prototypes/thousandvale/';
const OUT = new URL('./shots/', import.meta.url).pathname;
const only = process.argv[2] || '', devs = (process.argv[3] || 'desktop,phone-p,phone-l,pad').split(',');
const browser = await chromium.launch();
let bad = 0;
for (const dev of DEVICES.filter(d => devs.includes(d.id))) {
  mkdirSync(OUT + dev.id, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, hasTouch: !!dev.phone });
  for (const s of PROF_SCENES.filter(x => x.id.includes(only))) {
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
    await page.goto(`${BASE}ui-gallery-frame.html?scene=${s.id}&device=${dev.id}&layout=proposed&freeze=1`);
    const ok = await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 45000 }).then(() => true, () => false);
    const stage = ok ? await page.evaluate(() => window.__gallery.errors) : ['never became ready'];
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}${dev.id}/${s.id}.png` });
    if (dev.w > 900) { const box = await page.evaluate(() => { const e = [...document.querySelectorAll('.tv-prof .prof-game, #panel-craft, #panel-trade, #panel-journal, #panel-sheet, .tipbox')].find(x => !x.hidden && x.getClientRects().length && !x.closest('[hidden]')); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), width: r.width + 12, height: r.height + 12 }; }); if (box) await page.screenshot({ path: `${OUT}${dev.id}/${s.id}.crop.png`, clip: box }).catch(e => console.log('crop', e.message)); }
    const all = [...stage, ...errs]; if (all.length) bad++;
    console.log(`${dev.id.padEnd(8)} ${s.id.padEnd(18)} ${all.length ? 'ERR ' + all.join(' | ').slice(0, 500) : 'ok'}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(bad ? `${bad} scene(s) with errors` : 'all clean');
