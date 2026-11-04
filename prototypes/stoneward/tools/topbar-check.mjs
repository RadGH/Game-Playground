// Top bar fits on a phone: every top-bar control inside the screen, the ⚔ enemy marker NOT in the top bar.
// node prototypes/stoneward/tools/topbar-check.mjs [baseUrl]   (exit 1 on a failure)
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:8401';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let bad = 0;
for (const width of [360, 375, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 700 }, deviceScaleFactor: 2 });
  await page.goto(base + '/prototypes/stoneward/?dev', { waitUntil: 'networkidle' });
  await page.click('#btn-new'); await page.click('#nw-go');
  await page.waitForFunction(() => window.gameEye.state().screen === 'landing', null, { timeout: 60000 });
  await page.evaluate(() => window.gameEye.found());
  await page.waitForTimeout(4000);
  const t = (await page.evaluate(() => window.gameEye.state())).town.towns[0];
  await page.evaluate(([x, y]) => window.gameEye.order({ t: 'spawn', kind: 'wolf', x: x + 60, y: y + 20, n: 9 }), [t.x, t.y]);
  await page.evaluate(() => { const c = window.gameEye.state().clock; });
  await page.waitForFunction(() => !document.querySelector('.enemy-pill')?.classList.contains('hidden'), null, { timeout: 15000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const vw = innerWidth, out = [];
    for (const el of document.querySelectorAll('.topbar > *')) {
      if (getComputedStyle(el).display === 'none') continue;
      const b = el.getBoundingClientRect();
      if (b.right > vw + 0.5 || b.left < -0.5) out.push(`${el.id || el.className} ${b.left.toFixed(0)}..${b.right.toFixed(0)}`);
    }
    const pill = document.querySelector('.enemy-pill');
    return { out, pillInTopbar: !!pill?.closest('.topbar'), pillShown: pill && !pill.classList.contains('hidden'), speed: document.querySelector('#btn-speed').getBoundingClientRect().right, vw };
  });
  console.log(width, JSON.stringify(r));
  if (r.out.length || r.pillInTopbar) bad++;
  await page.screenshot({ path: `test-results/stoneward-topbar-${width}.png`, clip: { x: 0, y: 0, width, height: 120 } });
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
