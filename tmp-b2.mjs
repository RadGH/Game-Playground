import { chromium } from '@playwright/test';
const OUT = '/tmp/claude-1000/-home-radgh-claude-playground/db4c4ac6-cc23-441f-b894-12c658d1d612/scratchpad';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://localhost:8400/prototypes/farhold/?auto=1&quality=low&sound=off&seed=11&class=ranger');
await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const f = window.farhold;
  const here = f.hud.here;
  f.standings.add('wardens_reach', 65);
  f.hud.toggleSheet(true); f.hud.setTab('journal');
  return {
    landmarks: f.holdings.landmarksIn(here.id).map(l => `${l.name} (${l.kind}, ${l.state})`),
    board: f.board.map(j => j.title),
    ladders: document.querySelectorAll('#journal-standing .ladder').length,
    rewards: document.querySelectorAll('#journal-standing .reward-row').length,
    deeds: document.querySelectorAll('#journal-standing .deed-row').length,
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: `${OUT}/standing.png` });
console.log('ERRORS:', errors.slice(0, 5));
await b.close();
