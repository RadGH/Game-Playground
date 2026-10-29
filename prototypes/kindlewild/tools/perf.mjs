import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 402, height: 780 } })).newPage();
await page.goto('http://localhost:8401/prototypes/kindlewild/');
await page.waitForFunction(() => window.gameEye);
const r = await page.evaluate(async () => {
  window.gameEye.sandbox('greenvale');
  await new Promise(r => setTimeout(r, 800));
  const s = window.gameEye.app.stage.session;
  for (let k = 0; k < 12; k++) s.use('tool:torch', 30 + k * 15, 60 + (k % 3) * 40, { brush: 4 });
  s.sim.spells.cast('storm', 120, 120); s.sim.spells.cast('meteor', 100, 140);
  for (let k = 0; k < 300; k++) s.step();
  const { buildFrame } = await import('/prototypes/kindlewild/js/render/frame.js');
  const st = window.gameEye.app.stage;
  let tSim = 0, tFrame = 0;
  for (let k = 0; k < 120; k++) {
    let t0 = performance.now(); s.step(); tSim += performance.now() - t0;
    t0 = performance.now(); buildFrame(st.frame, s.sim.world, s.sim.ps, { daylight: 0.6, draw: (api) => s.sim.creatures.draw(api, s.sim.tick) }); tFrame += performance.now() - t0;
  }
  return { sim: (tSim / 120).toFixed(2), frame: (tFrame / 120).toFixed(2), burning: s.sim.world.stats.burning, creatures: s.sim.creatures.list.length, particles: s.sim.ps.n, W: s.sim.world.W };
});
console.log(JSON.stringify(r));
await browser.close();
