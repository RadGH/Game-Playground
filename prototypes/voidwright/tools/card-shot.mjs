import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:8400/prototypes/voidwright/'); await p.waitForTimeout(1200);
await p.click('text=New game'); await p.click('text=Launch'); await p.waitForTimeout(1500);
await p.evaluate(async () => {
  const G = app.G; const sg = await import('./js/sim/shipgen.js'); const g = await import('./js/sim/grid.js');
  const b = sg.buildPremade('bastion'); G.ship = { design: 'bastion', cls: b.cls, name: 'Bastion', grid: g.gridToJSON(b.grid), crew: b.crew }; G.drones = ['dart', 'hornet', 'spark', 'wasp'];
  app.rebuildPlayer(); const m = await import('./js/sim/galaxy.js'); const { rng } = await import('./js/core/math.js');
  const P = app.P; m.spawnGroup(app.w, { x: P.x + 700, y: P.y - 150 }, 'redfang', 4, rng(11), 'pack'); m.spawnGroup(app.w, { x: P.x + 500, y: P.y + 400 }, 'vesh', 3, rng(4), 'pack');
  document.querySelector('#hud').style.display = 'none';
});
await p.mouse.move(1000, 330); await p.mouse.down();
await p.waitForTimeout(5200);
await p.screenshot({ path: 'prototypes/voidwright/shots/card.png' });
await b.close();
