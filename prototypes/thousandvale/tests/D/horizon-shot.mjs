// Stream D — far-horizon screenshots (before/after comparisons). Starts its own server (memory DB).
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node prototypes/thousandvale/tests/D/horizon-shot.mjs <tag>
//   env: TV_QUALITIES=low,high   TV_HZ=macro (draw the old macro.bin horizon, for an A/B in the same conditions)
// Writes tests/D/shots/horizon-<tag>-<quality>-<view>.png and prints draw calls / triangles / fps per shot.
import { chromium } from '@playwright/test';
import { startServer } from '../load/server-harness.mjs';
const tag = process.argv[2] || 'now';
const OUT = new URL('./shots/', import.meta.url).pathname;
// [x, z, height above ground, yaw (radians, 0 = +z), pitch down] — the look point stays ~300 m ahead so the sky dome
// and the zone streaming stay round the camera
const VIEWS = {
  west: [23000, 6200, 380, -Math.PI / 2, 0.12],    // from the province's west edge, high, over land nobody loaded
  north: [25300, 5200, 60, Math.PI, 0.03],         // near the ground by Torborhold, looking across the province
  east: [30200, 6000, 220, Math.PI / 2, 0.06],     // the province's east edge, out to sea and the far coast
};
const srv = await startServer({ db: 'memory' });
const browser = await chromium.launch();
try {
  for (const quality of (process.env.TV_QUALITIES || 'high,low').split(',')) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
    page.on('pageerror', e => console.log('pageerror', e.message));
    page.on('console', m => { if (/horizon/i.test(m.text())) console.log('console', m.text()); });
    await page.goto(`${srv.http}/prototypes/thousandvale/?autoplay=1&name=Shot${quality}&cls=warrior&quality=${quality}&tod=0.42${process.env.TV_HZ ? '&horizon=' + process.env.TV_HZ : ''}`);
    await page.waitForFunction(() => window.tv?.state().status === 'online' && window.tv.state().you?.id != null, null, { timeout: 60000 });
    await page.waitForFunction(() => window.thousandvale?.W?.horizon, null, { timeout: 60000 });
    for (const [name, v] of Object.entries(VIEWS)) {
      await page.evaluate(([x, z, up, yaw, pitch]) => {
        const g = window.thousandvale.WS.terrain.heightAt(x, z), y = Math.max(g, 0) + up;
        const lx = x + Math.sin(yaw) * 300, lz = z + Math.cos(yaw) * 300;
        window.tv.fly(x, y, z, lx, y - Math.tan(pitch) * 300, lz);
      }, v);
      await page.waitForTimeout(9000);
      const s = await page.evaluate(() => ({ ...window.tv.state().stats, hz: window.thousandvale.W.horizon.stats?.() || null }));
      console.log(tag, quality, name, JSON.stringify({ draws: s.draws, tris: s.tris, fps: s.fps, hz: s.hz }));
      await page.screenshot({ path: `${OUT}horizon-${tag}-${quality}-${name}.png` });
    }
    await page.context().close();
  }
} finally { await browser.close(); await srv.kill('SIGTERM'); }
