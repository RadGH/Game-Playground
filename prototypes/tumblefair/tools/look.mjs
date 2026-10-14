#!/usr/bin/env node
// A quick look at the running dev server (port 8480) in a headless browser, for whoever is building: opens N pages
// (one host + joiners), optionally starts a match, and saves screenshots to tests/shots/look-*.png.
//   node prototypes/tumblefair/tools/look.mjs [--players 2] [--mode board|marathon] [--until lobby|board|vote|intro|game|results|final] [--phone] [--wait ms] [--pool id,id]
// Run it from the playground root under the browser lock:  flock /tmp/claude-1000/farhold-pw.lock node ...
import { chromium } from '@playwright/test';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('players', 2), mode = arg('mode', 'board'), until = arg('until', 'lobby'), phone = process.argv.includes('--phone'), wait = +arg('wait', 1500), pool = arg('pool', '');
const URL0 = arg('url', 'http://127.0.0.1:8480/prototypes/tumblefair/');
const OUT = new URL('../tests/shots/', import.meta.url).pathname, tag = arg('tag', until);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pages = [], errors = [];
async function open(i, url) {
  const big = i === 0 && !phone;
  const ctx = await browser.newContext(big ? { viewport: { width: 1280, height: 720 } } : { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[p${i}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[p${i}] PAGE ${e.message}`));
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'quality=low');
  await page.waitForFunction(() => window.tumblefair?.S.me, null, { timeout: 30000 }).catch(e => { console.log(JSON.stringify({ boot: 'failed', errors }, null, 1)); process.exit(1); });
  pages.push(page); return page;
}
const host = await open(0, URL0);
await host.waitForTimeout(1200);
await host.screenshot({ path: `${OUT}look-${tag}-title.png` });
if (until !== 'title') {
  await host.click('[data-act=host]');
  await host.waitForFunction(() => window.tumblefair.S.room, null, { timeout: 20000 });
  const code = await host.evaluate(() => tumblefair.S.room.code);
  for (let i = 1; i < N; i++) { const p = await open(i, URL0 + '?code=' + code); await p.waitForFunction(() => window.tumblefair.S.room, null, { timeout: 20000 }); }
  await host.waitForTimeout(2500);
  if (process.argv.includes('--teams')) await host.evaluate(() => { tumblefair.net.send({ t: 'opt', key: 'teams', value: true }); tumblefair.net.send({ t: 'opt', key: 'mode', value: 'endless' }); });
  await host.waitForTimeout(800);
  if (until === 'lobby') { for (const [i, p] of pages.entries()) await p.screenshot({ path: `${OUT}look-${tag}-p${i}.png` }); }
  else {
    await host.evaluate(([m, pl]) => { tumblefair.net.send({ t: 'opt', key: 'mode', value: m }); if (pl) tumblefair.net.send({ t: 'opt', key: 'pool', value: pl.split(',') }); if (location.search.includes('teams')) tumblefair.net.send({ t: 'opt', key: 'teams', value: true }); tumblefair.net.send({ t: 'opt', key: 'rounds', value: 2 }); }, [mode, pool]);
    await host.click('[data-act=start]');
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const ph = await host.evaluate(() => tumblefair.S.phase);
      if (ph === until) break;
      for (const p of pages) await p.evaluate(() => { const S = tumblefair.S, net = tumblefair.net;
        if (S.phase === 'board') { if (S.bd.pid === S.room.you && S.bd.sub === 'roll') net.send({ t: 'roll' }); if (S.bd.ask && S.bd.pid === S.room.you) net.send({ t: 'choose', i: 0 }); }
        if (S.phase === 'vote' && !(S.room.you in S.votes)) net.send({ t: 'vote', i: 0 });
        if ((S.phase === 'intro' || S.phase === 'results') && !S.skips.includes(S.room.you)) net.send({ t: 'skip' });
      });
      await host.waitForTimeout(300);
    }
    await host.waitForTimeout(wait);
    for (const [i, p] of pages.entries()) await p.screenshot({ path: `${OUT}look-${tag}-p${i}.png` });
  }
}
console.log(JSON.stringify({ phase: await host.evaluate(() => tumblefair.S.phase), errors: errors.slice(0, 12) }, null, 1));
await browser.close();
