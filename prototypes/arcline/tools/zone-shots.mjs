// Screenshots of painted 8×4 Homes, Shops and Industry blocks grown in (owner 2026-11-17: "I painted 4x8 rci regions
// but residential only took 1x1 squares on the edge and left the middle empty"): desktop + phone, day + night, each
// block once on poor land (small pieces) and once grown, combined and levelled up. Needs the DEV server (8401).
//   node prototypes/arcline/tools/zone-shots.mjs [outDir]   (default test-results/arcline-zones/)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || new URL('../../../test-results/arcline-zones/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:8401';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
for (const [label, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: label === 'phone' ? 2 : 1 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${base}/prototypes/arcline/?dev&noopt`);
  await page.waitForFunction(() => window.gameEye?.state().founding, null, { timeout: 60000 });
  // land the core on a big flat dry patch, three blocks beside a street, grown by hand (the sim's own grow())
  const info = await page.evaluate(async () => {
    const r = window.app.r, N = r.size, v = window.gameEye.view;
    const { level } = await import('/prototypes/arcline/js/sim/terrain.js');
    const B = await import('/prototypes/arcline/js/sim/build.js');
    const { ZONE } = await import('/prototypes/arcline/js/sim/region.js');
    const x0 = Math.round(v.cam.x) - 16, z0 = Math.round(v.cam.z) - 10;
    for (let z = z0; z < z0 + 26; z++) for (let x = x0; x < x0 + 40; x++) { const i = z * N + x; r.ter.water[i] = 0; r.ter.deposit[i] = 0; r.ter.flora[i] = 0; }
    level(r.ter, x0, z0, 40, 26, 2);
    r.nests = r.nests.filter(n => Math.hypot(n.x - x0 - 20, n.z - z0 - 12) > 40);
    window.gameEye.foundAt(x0 + 1, z0 + 1);
    r.money = 1e6;
    B.buildRoad(r, B.lineTiles(x0 + 4, z0 + 2, x0 + 38, z0 + 2));         // main street
    B.buildRoad(r, B.lineTiles(x0 + 4, z0 + 7, x0 + 38, z0 + 7));         // the street behind the blocks
    for (const x of [x0 + 4, x0 + 13, x0 + 22, x0 + 31]) B.buildRoad(r, B.lineTiles(x, z0 + 2, x, z0 + 7));
    B.buildLine(r, B.lineTiles(x0 + 4, z0 + 8, x0 + 38, z0 + 8), 'pipe');
    B.place(r, 'svc-power', x0 + 1, z0 + 9); B.place(r, 'svc-water', x0 + 1, z0 + 12);
    // blocks: 8 wide, 4 deep between the two streets — R, C, I
    const blocks = { R: [x0 + 5, z0 + 3], C: [x0 + 14, z0 + 3], I: [x0 + 23, z0 + 3] };
    for (const [k, [x, z]] of Object.entries(blocks)) B.paintZone(r, B.rectTiles(x, z, x + 7, z + 3), ZONE[k]);
    window.gameEye.afterBuild?.();
    window.app.speed = 0;
    v.cam.x = x0 + 18; v.cam.z = z0 + 5; v.cam.zoom = 1;
    return { x0, z0, blocks };
  });
  async function grow(value, days, passes) {
    await page.evaluate(async ([value, days, passes]) => {
      const r = window.app.r, city = await import('/prototypes/arcline/js/sim/city.js');
      const { rng } = await import('/citykit/js/kit/rng.js'), R = rng(7);
      for (let k = 0; k < passes; k++) {
        city.tick(r, 1);
        r.tiles.value.fill(value); if (r.waterNet?.reach) r.waterNet.reach.fill(1);
        r.people.total = 3000; r.people.arriving = 20000; r.people.edu = 1; r.milestone = 4;
        for (const l of r.lots) { l.powered = 1; l.wet = 1; }
        r.day += days; city.grow(r, R);
      }
      r.people.arriving = 0;
      window.gameEye.afterBuild?.();
    }, [value, days, passes]);
  }
  async function shoot(name, night) {
    await page.evaluate(night => { const r = window.app.r; const cyc = 4; r.day = Math.floor(r.day / cyc) * cyc + (night ? 2 : 0.02); }, night);   // main.js night(): full night half a cycle in
    await page.waitForFunction(() => window.gameEye.state().baking === 0, null, { timeout: 400000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${label}-${name}-${night ? 'night' : 'day'}.png` });
  }
  await page.getByRole('button', { name: 'Close', exact: true }).first().click({ timeout: 3000 }).catch(() => {});   // the guide card
  await grow(0.12, 0, 12);                 // poor land: small pieces first
  await shoot('pieces', false);
  await grow(0.45, 25, 6);                 // better land and time: pieces combine, some level up
  await shoot('grown', false); await shoot('grown', true);
  await page.evaluate(() => { window.gameEye.view.cam.rot = 1; });
  await shoot('grown-turned', false);
  const lots = await page.evaluate(() => window.app.r.lots.filter(l => l.kind === 'zoned').map(l => `${l.zone} ${l.recipe} ${l.w}x${l.d} t${l.tier}`));
  console.log(label, 'errors:', errs.length ? errs : 'none', '\n ', lots.join('\n  '));
  await page.close();
}
await browser.close();
console.log('shots in', out);
