// M6/M7 screenshots: guards posted by the keep, a pack of wolves and a troll attacking, a magic tower.
import { chromium } from 'playwright';
const [out, w = 402, h = 780] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8401/prototypes/stoneward/?shots&dev', { waitUntil: 'networkidle' });
await page.click('#btn-new'); await page.click('#nw-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 30000 });
await page.mouse.click(+w / 2, +h / 2); await page.waitForTimeout(1500);
await page.click('#land-go');
await page.waitForFunction(() => window.gameEye.state().screen === 'hud', null, { timeout: 10000 });
await page.waitForTimeout(800);
const t = (await page.evaluate(() => window.gameEye.state())).town.towns[0];
await page.evaluate(async ({ x, y }) => {
  const E = window.gameEye;
  const ids = [];
  for (const k of ['spearman', 'archer', 'watchman']) { const r = await E.order({ t: 'hire', kind: k }); if (r?.id) ids.push(r.id); }
  await E.order({ t: 'guard.post', ids, x: x + 14, y: y + 14 });
}, t);
await page.waitForTimeout(4000);
await page.evaluate(({ x, y }) => { const E = window.gameEye; for (let k = 0; k < 4; k++) E.order({ t: 'spawn', kind: 'wolf', x: x + 34 + k * 2, y: y + 26 }); E.order({ t: 'spawn', kind: 'troll', x: x + 40, y: y + 10 }); E.fly(x + 22, y + 18, 5); }, t);
await page.waitForTimeout(3500);
await page.screenshot({ path: out + '-fight.png' });
await page.waitForTimeout(6000);
await page.screenshot({ path: out + '-later.png' });
await page.click('[data-tab="guards"]'); await page.waitForTimeout(500);
await page.screenshot({ path: out + '-guards.png' });
await page.click('[data-tab="info"]'); await page.waitForTimeout(300);
await page.click('#dock-panel button:text-is("Military")'); await page.waitForTimeout(500);
await page.screenshot({ path: out + '-military.png' });
console.log(logs.join('\n'));
await browser.close();
