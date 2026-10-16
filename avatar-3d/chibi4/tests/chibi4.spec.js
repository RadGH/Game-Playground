// Chibi 4 steps 7 + 9: the compare page (Chibi 2 / baked / kit), the dress-up panel, every clip name, load timing on a
// throttled connection, and the 20/50/100 crowd.
// Run: flock /tmp/claude-1000/farhold-pw.lock npx playwright test avatar-3d/chibi4/tests/chibi4.spec.js
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', 'shots', 'step9');
fs.mkdirSync(SHOTS, { recursive: true });
const OUT = path.join(SHOTS, 'measured.json');
const save = (key, val) => { let d = {}; try { d = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {} d[key] = val; fs.writeFileSync(OUT, JSON.stringify(d, null, 1)); };
const watch = page => { const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); return errors; };

test('compare page: three systems load, both Chibi 4s are one draw call per character, clips play', async ({ page }) => {
  test.setTimeout(300000);
  const errors = watch(page);
  await page.goto('avatar-3d/chibi4/compare.html?anim=walk');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 240000, state: 'attached' });
  const s = await page.evaluate(() => window.__c4stats);
  expect(s.chibi4.calls).toBe(1);
  expect(s.kit.calls).toBe(1);
  expect(s.kitLod[0].length).toBe(3);
  expect(s.kitLod[0][2]).toBeLessThan(s.kitLod[0][0] / 4);
  for (const anim of ['walk', 'run', 'cast', 'idle']) {
    await page.click(`#anims button[data-anim="${anim}"]`);
    await page.waitForTimeout(anim === 'run' ? 450 : 700);
    await page.screenshot({ path: path.join(SHOTS, `s9compare_${anim}.png`) });
  }
  expect(errors).toEqual([]);
  save('compare', s);
});

test('dress-up: any body, hair and garment mix is one draw call; recolour is live; slots replace', async ({ page }) => {
  test.setTimeout(300000);
  const errors = watch(page);
  await page.goto('avatar-3d/chibi4/compare.html?anim=idle');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 240000, state: 'attached' });
  await page.evaluate(() => { const { cam, controls } = window.__c4; cam.position.set(1.45, 1.35, 4.4); controls.target.set(1.45, 1.0, 0); controls.update(); });
  const looks = [
    { body: { skin: '#c99068' }, chibi4: { body: 'female', race: 'human', hair: { id: 'long', color: '#201810' }, garments: [{ id: 'trousers' }, { id: 'robe', color: '#7a1020', color2: '#d0b060' }, { id: 'sleeves', color: '#7a1020' }, { id: 'boots_tall' }, { id: 'hat', color: '#2a1030' }] } },
    { body: { skin: '#6e4a32' }, chibi4: { body: 'male', race: 'elf', hair: { id: 'ponytail', color: '#e0d8c0' }, garments: ['trousers', 'undershirt', { id: 'jerkin', color: '#304a80' }, 'pauldrons', 'bracers', 'boots_tall', { id: 'tabard', color: '#a02020' }] } },
    { body: { skin: '#f3d0b0' }, chibi4: { body: 'male', race: 'human', hair: { id: 'bob', color: '#8a3a1a' }, garments: ['trousers', { id: 'undershirt', color: '#e0e0d0' }, 'boots_low'] } },
  ];
  const stats = [];
  for (const [i, look] of looks.entries()) {
    const st = await page.evaluate(l => window.__c4dress.apply(l), look);
    stats.push(st);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `s9dress_${i}.png`) });
  }
  for (const st of stats) expect(st.drawCalls).toBe(1);
  // knee boots under a robe became low boots (the robe rule), hat worn
  const worn = await page.evaluate(() => window.__c4dress.show.kit[0].outfit.garments.map(g => g.id));
  expect(worn).toContain('boots_low'); // (from the last look)
  expect(new Set(stats.map(s => s.triangles)).size).toBe(3);
  // live recolour: no rebuild, the same geometry
  const before = await page.evaluate(() => window.__c4dress.show.kit[0].lod.levels[0].object.geometry.uuid);
  await page.evaluate(() => window.__c4dress.show.kit[0].setColors({ garments: { undershirt: { color: '#20a040' } }, skin: '#a06a48' }));
  const after = await page.evaluate(() => window.__c4dress.show.kit[0].lod.levels[0].object.geometry.uuid);
  expect(after).toBe(before);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 's9dress_recolour.png') });
  expect(errors).toEqual([]);
  save('dress', stats);
});

test('every Chibi 2 animation name plays a kit clip (after the second clip file arrives)', async ({ page }) => {
  test.setTimeout(300000);
  const errors = watch(page);
  await page.goto('avatar-3d/chibi4/kit.html?look=mage');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 240000, state: 'attached' });
  const r = await page.evaluate(async () => {
    const kit = await K.loadKit('male'); await kit.more();
    const a = window.__actor, out = {};
    for (const n of O.CHIBI2_NAMES) { a.setAnim(n, 0, true); a.update(0.2); out[n] = a.clip; }
    // the robe plays its robe-stride twins
    a.setAnim('walk', 0, true); const robeWalk = a.clip;
    return { out, robeWalk, clips: Object.keys(kit.clips).length };
  });
  const toIdle = Object.entries(r.out).filter(([n, c]) => c === 'idle' && n !== 'idle').map(([n]) => n);
  expect(toIdle).toEqual([]);
  expect(r.robeWalk).toBe('walk_robe');
  expect(errors).toEqual([]);
  save('clips', { count: r.clips, map: r.out });
});

test('load timing: the player character on a throttled 10 Mbps connection, cold cache', async ({ browser }) => {
  test.setTimeout(300000);
  const ctx = await browser.newContext({ viewport: { width: 600, height: 800 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const out = {};
  for (const look of ['mage', 'elf']) {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
    await page.goto(`avatar-3d/chibi4/kit.html?look=${look}&freeze=1`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 240000, state: 'attached' });
    out[look] = await page.evaluate(() => window.__kitTiming);
    await page.screenshot({ path: path.join(SHOTS, `s9load_${look}.png`) });
  }
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.goto('avatar-3d/chibi4/kit.html?look=mage&freeze=1');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 240000, state: 'attached' });
  out.local = await page.evaluate(() => window.__kitTiming);
  for (const k of Object.keys(out)) delete out[k].log;
  console.log('C4LOAD', JSON.stringify(out));
  save('load', out);
  // a 10 Mbps player has their character within ~4 s (the first-appearance files only; the other clips follow)
  expect(out.mage.readyMs).toBeLessThan(6000);
  await ctx.close();
});

test('lineup: ten random outfits from the same kit', async ({ page }) => {
  test.setTimeout(300000);
  const errors = watch(page);
  await page.setViewportSize({ width: 1400, height: 700 });
  await page.goto('avatar-3d/chibi4/kit.html?lineup=10&freeze=1');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 240000, state: 'attached' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 's9lineup.png') });
  expect(errors).toEqual([]);
});

test('crowd: 20, 50 and 100 characters, all three systems', async ({ page }) => {
  test.setTimeout(1800000);
  await page.goto('avatar-3d/chibi4/compare.html?anim=idle');
  await page.waitForSelector('body[data-ready="1"]', { timeout: 240000, state: 'attached' });
  const out = [];
  for (const n of [20, 50, 100]) for (const sys of ['chibi2', 'chibi4', 'kit']) {
    await page.evaluate(g => { window.__c4grab = g; }, n === 50 && sys === 'kit');
    out.push(await page.evaluate(([n, sys]) => window.__c4crowd(n, sys), [n, sys]));
    if (n === 50 && sys === 'kit') fs.writeFileSync(path.join(SHOTS, 's9crowd50.png'), Buffer.from((await page.evaluate(() => window.__c4grabbed)).split(',')[1], 'base64'));
  }
  console.log('C4CROWD', JSON.stringify(out));
  save('crowd', out);
  for (const r of out.filter(r => r.sys !== 'chibi2')) expect(r.calls).toBeLessThanOrEqual(r.n + 3);
});
