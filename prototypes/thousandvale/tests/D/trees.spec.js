// 2026-10-20 storybook trees (js/client/tree-style.js — owner: "When you get closer it gets replaced with a spindly tree
// with tiny leaves. Can we have trees updated to look more cartoony and mythical"). LOOK at woods near (detail level 0),
// middle (level 1, ~110 m) and far (level 2, ~300 m) in Torbor Downs and Vharlen, on desktop High and a phone (Medium,
// 393x852), and MEASURE each view (draw calls, triangles). Then the tree gallery (tree-gallery.html) side by side.
// Shots: tests/D/shots/trees-<label>-<mode>-<place>-<near|mid|far>.png, gallery tests/D/shots/trees-gallery-*.png;
// numbers in tests/D/shots/trees-<label>.json.
// Run: cd ~/claude/playground && TREES_LABEL=after flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/trees.spec.js
//   TREES_LABEL run name   TREES_FLAGS extra URL flags ("&trees=kit" = the old kit trees, the look before)
//   TREES_MODES desktop,phone (default both)   TREES_ONLY comma list of place keys   TREES_GALLERY=0 skips the gallery
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = join(HERE, 'shots');
const LABEL = process.env.TREES_LABEL || 'run', FLAGS = process.env.TREES_FLAGS || '';
const MODES = (process.env.TREES_MODES || 'desktop,phone').split(',');
const ONLY = process.env.TREES_ONLY ? new Set(process.env.TREES_ONLY.split(',')) : null;
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase;
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

// [key, x, z, heading (radians the camera looks along)] — woods from tests/W/fixtures/torbor-look-places.json and
// docs/CHANGELOG.md (the giants' wood by Torborhold, 25520,5560)
const PLACES = [
  ['oakwood', 25856, 5456, 0.8],
  ['giants-wood', 25520, 5560, 2.2],
  ['pine-highwood', 23448, 2248, 0.4],
  ['saints-meadow', 25256, 3128, 1.2],
  ['brack-fen', 27584, 2328, 3.0],
  ['vharl-jungle', 27700, 21900, 4.0],
];
// distance back from the spot and height over the ground, per shot
const SHOTS_AT = { near: [9, 2.2], mid: [110, 16], far: [300, 48] };

test.beforeAll(async () => {
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, M3_PROVINCES: 'torbor_downs,vharlen' } });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server:\n' + out)), 60000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  hookBase = `http://127.0.0.1:${hp}`; mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => { srv?.kill('SIGTERM'); });

const result = {};
for (const mode of MODES) {
  test(`trees — ${LABEL} — ${mode}`, async ({ browser }) => {
    test.setTimeout(3600000);
    const phone = mode === 'phone';
    const name = 'Tre' + mode[0] + (LABEL.replace(/[^a-z]/gi, '') || 'x').slice(0, 5) + 'abcdefghij'[Date.now() % 10];     // names are letters only
    const ctx = await browser.newContext(phone ? { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 1100, height: 700 } });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /tree|scatter|shader|WebGL/i.test(m.text())) errors.push(m.text()); });
    // the first join can lose the client's 20 s "cannot reach the server" race while the server loads the provinces: try again
    for (let attempt = 1; ; attempt++) {
      await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=ranger&quality=${phone ? 'medium' : 'high'}&tod=0.42${FLAGS}`);
      const ok = await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 200000 }).then(() => true, () => false);
      if (ok) break;
      console.log('trees: not in the world (try ' + attempt + ') —', await page.evaluate(() => ({ status: tv?.state().status, phase: thousandvale?.S?.phase, note: document.getElementById('login-note')?.textContent })));
      if (attempt >= 3) throw new Error('could not enter the world');
    }
    await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 400000 });
    const out = result[mode] = {};
    let curIsle = 'gullwick';
    for (const [key, x, z, head] of PLACES) {
      if (ONLY && !ONLY.has(key)) continue;
      const isle = key.startsWith('vharl') ? 'port_vharl' : 'gullwick';
      if (isle !== curIsle) { await hook('/harbour', { name, id: isle }); curIsle = isle; await page.waitForTimeout(15000); }
      await hook('/teleport', { name, x, z });
      await page.waitForTimeout(phone ? 12000 : 9000);
      await page.waitForFunction(([x, z]) => !!thousandvale.WS.zoneAt(x, z)?.views?.length, [x, z], { timeout: 120000 }).catch(() => console.log('trees: zone not streamed at', x, z));
      out[key] = {};
      for (const [shot, [back, up]] of Object.entries(SHOTS_AT)) {
        await page.evaluate(([x, z, head, back, up]) => {
          tv.hud(false);
          const T = thousandvale.WS.terrain, ex = x - Math.cos(head) * back, ez = z - Math.sin(head) * back;
          const ge = T.heightAt(ex, ez), gs = T.heightAt(x, z);
          tv.fly(ex, Math.max(ge, gs) + up, ez, x + Math.cos(head) * 20, gs + (back < 20 ? 4 : 2), z + Math.sin(head) * 20);
        }, [x, z, head, back, up]);
        await page.waitForTimeout(phone ? 7000 : 5000);
        const r = await page.evaluate(() => { const i = thousandvale.view.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
        out[key][shot] = r;
        console.log('trees', LABEL, mode, key, shot, JSON.stringify(r));
        await page.screenshot({ path: join(SHOTS, `trees-${LABEL}-${mode}-${key}-${shot}.png`) });
      }
    }
    writeFileSync(join(SHOTS, `trees-${LABEL}.json`), JSON.stringify(result, null, 1));
    await ctx.close();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('tree gallery: every tree at its three levels, and a wood at game distances', async ({ browser }) => {
  test.skip(process.env.TREES_GALLERY === '0', 'TREES_GALLERY=0');
  test.setTimeout(900000);
  for (const [mode, vp] of [['desktop', { width: 1400, height: 800 }], ['phone', { width: 393, height: 852 }]]) {
    const ctx = await browser.newContext({ viewport: vp }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const views = [
      ['oak', 'view=lods&species=oak&style=both&cam=0,5,17&look=0,4.5,-3'],
      ['ancient-oak', 'view=lods&species=ancient_oak&style=both&cam=0,15,50&look=0,11,-4'],
      ['fir', 'view=lods&species=fir&style=both&cam=0,7,22&look=0,6,-3'],
      ['palm', 'view=lods&species=palm_fan&style=both&cam=0,5,16&look=0,4.5,-3'],
      ['all', 'view=lods&species=all&style=story'],
      ['wood', 'view=forest&species=all&style=story&quality=medium'],
      ['wood-kit', 'view=forest&species=all&style=kit&quality=medium'],
    ];
    for (const [key, q] of views) {
      if (mode === 'phone' && !['oak', 'wood'].includes(key)) continue;
      await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/tree-gallery.html?still=1&${q}`);
      await page.waitForFunction(() => window.treeGallery?.ready, null, { timeout: 300000 });
      await page.waitForTimeout(1000);
      const st = await page.evaluate(() => treeGallery.stats());
      console.log('gallery', mode, key, st.drawCalls, st.triangles);
      await page.screenshot({ path: join(SHOTS, `trees-gallery-${mode}-${key}.png`) });
    }
    await ctx.close();
    expect(errors, errors.join('\n')).toEqual([]);
  }
});
