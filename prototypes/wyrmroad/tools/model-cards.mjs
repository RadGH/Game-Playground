// The two pictures on the "How should the characters look?" screen (js/ui/models.js): the same fight drawn with the
// high-detail models and with the legacy ones, framed close on the heroes. Run again when the models change:
//   node prototypes/wyrmroad/tools/model-cards.mjs [--base http://192.168.1.34:8401]
// Writes img/models-hd.jpg and img/models-legacy.jpg (960×600).
import { chromium } from 'playwright';
const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = flag('--base', 'http://192.168.1.34:8401');
const OUT = new URL('../img/', import.meta.url).pathname;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
let bad = 0;
for (const models of ['hd', 'legacy']) {
  const page = await ctx.newPage();
  page.on('pageerror', e => { bad++; console.log(models, e.message); });
  page.on('console', m => { if (m.type() === 'error') { bad++; console.log(models, m.text()); } });
  await page.goto(`${BASE}/prototypes/wyrmroad/tests/render-demo.html?ch=millbrook&n=4&skip=7&gear=3&forms=masc,fem,fem,masc&seed=5&pause=1&models=${models}`);
  await page.waitForFunction(() => window.demo?.ready, null, { timeout: 180000 });
  // a posed line-up (nothing is simulated: pause=1): the four heroes on the left facing three foes on the right
  await page.evaluate(() => {
    const G = window.demo.G, x0 = G.camX - 3.4, heroes = G.heroes;
    heroes.forEach((h, i) => Object.assign(h, { x: x0 + i * 1.15, z: i % 2 ? -0.7 : 0.5, dir: 1, state: 'idle', anim: 'idle', y: 0, invT: 0 }));
    const foes = G.foes.filter(f => f.team === 1).slice(0, 3);
    G.foes = foes;
    foes.forEach((f, i) => Object.assign(f, { x: x0 + 5.6 + i * 1.1, z: [0.2, -0.9, 0.9][i], dir: -1, state: 'idle', anim: 'idle', y: 0, invT: 0, hp: f.max }));
    for (const e of [...heroes, ...foes]) { e.px = e.x; e.py = e.y; e.pz = e.z; }
    G.phase = 'fight';
    const cx = x0 + 3.3;
    window.demo.view.setShot({ pos: [cx, 1.75, 7.6], target: [cx, 0.95, 0], fov: 38 });
    document.getElementById('info').style.display = 'none';
  });
  await page.waitForTimeout(9000);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}models-${models}.jpg`, type: 'jpeg', quality: 82 });
  console.log('wrote', `img/models-${models}.jpg`);
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
