// node dev/iphone.mjs [chromium|webkit] — the title screen on an emulated iPhone: tap through the first-run cards.
import { chromium, webkit, devices } from '@playwright/test';
const eng = process.argv[2] === 'webkit' ? webkit : chromium;
const b = await eng.launch(eng === chromium ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {});
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto('http://localhost:8401/prototypes/lanternfall/index.html');
await p.waitForFunction(() => window.lanternfall?.ready || window.lanternfall?.errors?.length, null, { timeout: 60000 }).catch(e => console.log('not ready', e.message));
console.log('modals', await p.locator('.lf-modal').count(), await p.evaluate(() => [...document.querySelectorAll('.lf-modal h3')].map(h => h.textContent)));
for (const name of ['Continue anyway', 'Done']) {
  const btn = p.getByRole('button', { name }); if (!(await btn.count())) { console.log('no button', name); continue; }
  const box = await btn.boundingBox(); console.log(name, 'box', box, 'viewport', p.viewportSize());
  try { await btn.tap({ timeout: 5000 }); console.log('tapped', name); } catch (e) { console.log('TAP FAILED', name, e.message.split('\n').slice(0, 6).join(' | ')); }
  await p.waitForTimeout(400); console.log('modals left', await p.evaluate(() => [...document.querySelectorAll('.lf-modal h3')].map(h => h.textContent)));
}
// then start a game by touch only, tapping the obvious button on each screen
const S = '/tmp/claude-1000/-home-radgh-claude-playground/51c1c89c-2039-4419-8b00-f50f62a0779e/scratchpad/';
for (let k = 0; k < 8; k++) {
  const inGame = await p.evaluate(() => !!(lanternfall.game && !lanternfall.game.titleScreen && !lanternfall.router.isOpen()));
  if (inGame) { console.log('IN GAME', await p.evaluate(() => lanternfall.game.room.room.id)); break; }
  const names = await p.evaluate(() => [...document.querySelectorAll('#screens button:not([disabled])')].filter(b => b.offsetWidth).map(b => b.textContent.trim()).slice(0, 14));
  console.log('screen buttons', JSON.stringify(names));
  const pick = names.find(n => /^(New Game|Begin|Start|Descend|Confirm|Slot 1|Empty|Choose|Lamplighter)/i.test(n)) || names.find(n => /empty|new/i.test(n));
  if (!pick) { console.log('no obvious button'); break; }
  const c = await p.evaluate(t => { const b = [...document.querySelectorAll('#screens button:not([disabled])')].find(b => b.offsetWidth && b.textContent.trim() === t); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { x: r.x + r.width / 2, y: r.y + r.height / 2, covered: !(top === b || b.contains(top)), topIs: top?.className }; }, pick);
  if (c.covered) console.log('COVERED', pick, 'by', c.topIs);
  await p.touchscreen.tap(c.x, c.y); console.log('tapped', pick);
  await p.waitForTimeout(700); await p.screenshot({ path: S + `iphone-${k}.png` });
}
await p.screenshot({ path: '/tmp/claude-1000/-home-radgh-claude-playground/51c1c89c-2039-4419-8b00-f50f62a0779e/scratchpad/iphone.png' });
await b.close();
