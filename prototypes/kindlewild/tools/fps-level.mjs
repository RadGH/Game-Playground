// Frame rate of a level in a phone-sized headless browser (software GL, so compare levels, not absolute numbers).
// node tools/fps-level.mjs 1-4 1-5 ...
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 402, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
await page.goto('http://localhost:8401/prototypes/kindlewild/');
await page.waitForFunction(() => window.gameEye && !document.getElementById('loading'));
for (const id of process.argv.slice(2)) {
  await page.evaluate((id) => window.gameEye.startLevel(id), id);
  await page.locator('.modal .big.go').click();
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const st = window.gameEye.app.stage, t = [];
    let last = performance.now();
    await new Promise(res => { const f = (now) => { t.push(now - last); last = now; if (t.length < 60) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    t.sort((a, b) => a - b);
    const s = st.session, w = s.sim.world;
    return { median: t[30].toFixed(1), p90: t[54].toFixed(1), perf: st.perf ? JSON.stringify(st.perf) : '', lights: (st.frame?.lights?.length ?? st.frame?.nLights ?? '?'), awake: w.awake.reduce((a, b) => a + b, 0), creatures: s.sim.creatures.list.length, particles: s.sim.ps.n, canvas: [st.canvas?.width, st.canvas?.height].join('x') };
  });
  console.log(id, JSON.stringify(r));
  await page.evaluate(() => window.gameEye.app.quit?.());
  await page.waitForTimeout(300);
}
await browser.close();
