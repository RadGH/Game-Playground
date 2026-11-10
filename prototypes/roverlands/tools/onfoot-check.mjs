// On foot with a Chibi 2.6 body: does the person stand ON the ground while idle / walking / running / jumping, and
// land on it after being thrown out? Samples the lowest foot vertex of my rider against world.heightAt under it.
//   flock ~/claude/agent/roverlands-pw.lock node prototypes/roverlands/tools/onfoot-check.mjs [--port 8401]
// Pictures: prototypes/roverlands/tests/shots/fit/onfoot-*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const port = arg('port', '8401'), out = 'prototypes/roverlands/tests/shots/fit';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto(`http://localhost:${port}/prototypes/roverlands/drive.html?seed=7&mode=sandbox&view=simple`);
await page.waitForFunction(() => window.rover?.ready && [...window.rover.session.people.values()].some(p => p.rider), null, { timeout: 180000 });
await page.waitForTimeout(2000);
// one sampler on the page: the lowest foot-weighted vertex of my body minus the ground height under it
await page.evaluate(() => {
  const s = window.rover.session, w = window.rover.world;
  const P = [...s.people.values()].find(p => p.rider);
  const body = P.rider.body;
  const feet = [];
  body.group.traverse(m => {
    if (!m.isSkinnedMesh) return;
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i += 2) {
      let b = 0; for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, b)) b = k;
      const n = m.skeleton.bones[si.getComponent(i, b)]?.name;
      if (n === 'footL' || n === 'footR') feet.push([m, i]);
    }
  });
  let all = null;
  window.__foot = (whole = false) => {
    P.rider.group.updateMatrixWorld(true);
    let min = Infinity, at = null; const v = new (P.rider.group.position.constructor)();
    if (whole && !all) { all = []; body.group.traverse(m => { if (m.isSkinnedMesh) for (let i = 0; i < m.geometry.attributes.position.count; i += 4) all.push([m, i]); }); }
    for (const [m, i] of whole ? all : feet) { m.getVertexPosition(i, v); m.localToWorld(v); if (v.y < min) { min = v.y; at = [v.x, v.z]; } }
    return { gap: +(min - w.heightAt(at[0], at[1])).toFixed(3), anim: s.walker?.anim };
  };
});
const stats = {};
async function sample(name, ms, whole = false) {
  const t0 = Date.now(), gaps = [];
  while (Date.now() - t0 < ms) { gaps.push(await page.evaluate(w => window.__foot(w), whole)); await page.waitForTimeout(60); }
  const g = gaps.map(x => x.gap);
  stats[name] = { n: g.length, min: Math.min(...g), max: Math.max(...g), anims: [...new Set(gaps.map(x => x.anim))] };
  console.log(name, JSON.stringify(stats[name]));
}
await sample('idle', 1500);
await page.screenshot({ path: `${out}/onfoot-idle.png` });
await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await sample('run (W)', 2500);
await page.screenshot({ path: `${out}/onfoot-run.png` });
await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(500); await sample('walk (W + Shift)', 2500);
await page.screenshot({ path: `${out}/onfoot-walk.png` });
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
await page.keyboard.down('Space'); await page.waitForTimeout(120); await page.keyboard.up('Space');
await sample('jump', 1400);
await page.waitForTimeout(800);
await page.evaluate(() => window.rover.session.walker.throwOut([4, 7, 3], [4, 2, 3]));
for (let i = 0; i < 4; i++) { await page.waitForTimeout(250); await page.screenshot({ path: `${out}/onfoot-thrown-${i}.png` }); }
await sample('thrown (whole body)', 3000, true);
await page.screenshot({ path: `${out}/onfoot-thrown-landed.png` });
await page.waitForTimeout(5000);
await sample('stood up again', 1000);
await page.screenshot({ path: `${out}/onfoot-after.png` });
await browser.close();
