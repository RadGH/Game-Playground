// Screenshot a bot-played siege mid-battle (visual polish check).
import { chromium } from '@playwright/test';
const out = process.argv[2] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:8460/?play=siege&nopause&seed=103');
await page.waitForFunction(() => window.app && window.app.game);
await page.evaluate(async () => {
  const { RivalAI } = await import('/js/ai/rival.js');
  const g = window.app.game;
  const bot = new RivalAI(g, 1, { style: 'defender', difficulty: 'normal' });
  g.ai = { update: (dt) => bot.update(dt), save: () => ({}) };
  for (let i = 0; i < 30 * 560; i++) g.tick();
});
for (let k = 0; k < 4; k++) {
  await page.evaluate(() => {
    const g = window.app.game;
    const hs = g.units.filter((u) => u.hollow);
    const core = g.byId.get(g.teams[1].coreId);
    const x = hs.length ? Math.min(...hs.map((u) => u.x)) : core.x + 150;
    window.app.camera.centerOn(x - 40, core.y);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/battle${k}.png` });
}
await browser.close();
