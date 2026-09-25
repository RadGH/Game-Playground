// UI walkthrough screenshots: node tools/ui.mjs <outdir>
import { chromium } from '@playwright/test';
const out = process.argv[2] || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8460/?play=sandbox&nopause&seed=12345');
await page.waitForTimeout(1200);
const toS = (x, y) => page.evaluate(([x, y]) => { const c = window.app.camera; return { x: (x - c.x) * c.scale, y: (y - c.y) * c.scale }; }, [x, y]);
await page.evaluate(() => {
  const app = window.app, g = app.game; g.opts.instantBuild = true;
  const core = g.byId.get(g.teams[1].coreId);
  const place = (type, dx) => { const p = app._place.snapPlacement(g, type, core.x + core.w + dx, core.y); return g.applyNow({ t: 'build', team: 1, type, x: p.x, y: p.y }).id; };
  window._fab = place('fabricator', 20); window._lab = place('lab', 60); place('pulse', 95);
  g.tick();
});
// Select the fabricator by clicking it.
const fab = await page.evaluate(() => { const b = window.app.game.byId.get(window._fab); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; });
let p = await toS(fab.x, fab.y);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(200);
await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyW'); await page.keyboard.press('KeyR');
await page.waitForTimeout(300);
// Hover a card button for a tooltip.
const btn = await page.locator('.cbtn[data-slot="KeyE"]').boundingBox();
await page.mouse.move(btn.x + 10, btn.y + 10);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-fab.png` });
await page.waitForTimeout(9000);
// Box-select everything near the fabricator.
const a = await toS(fab.x - 40, fab.y - 40), b = await toS(fab.x + 120, fab.y + 20);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-army.png` });
// Commander: F-key select? Use the idle selection of commander via clicking.
const cmd = await page.evaluate(() => { const g = window.app.game; const c = g.byId.get(g.teams[1].commanderId); return { x: c.x, y: c.y - 4 }; });
p = await toS(cmd.x, cmd.y);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-cmdr.png` });
// Lab.
const lab = await page.evaluate(() => { const b = window.app.game.byId.get(window._lab); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; });
p = await toS(lab.x, lab.y);
await page.mouse.click(p.x, p.y);
await page.keyboard.press('KeyA');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/ui-lab.png` });
// Help overlay.
await page.keyboard.press('F1');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-help.png` });
await page.keyboard.press('F1');
// Pause menu.
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ui-pause.png` });
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 8).join('\n'));
await browser.close();
