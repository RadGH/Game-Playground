// Chibi 2.5 in Thousandvale (owner 2026-10-16: "Yes go with the 2.5 for Thousandvale"): the creation screen with the
// new options, a town-square crowd (build time + main-thread stalls, Chibi 2.5 against ?chibi=2), a robed caster
// running, a fight, and your own face in the portrait — desktop and a 393 x 852 phone. Screenshots in tests/D/shots/c25-*.
//
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/chibi25.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase;
test.beforeAll(async () => {
  const port = await freePort(), hook = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hook)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hook}`;
  mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const RESULTS = {};

/** Create a character through the real title flow, with Chibi 2.5 options picked in the editor. */
async function create(page, name, shot) {
  await page.waitForSelector('#loading.done', { timeout: 120000 });
  await page.click('#new-char');
  await page.fill('#name', name);
  await page.click('#classes [data-cls="mage"]');
  await page.click('#enter');
  await expect(page.locator('#panel-appearance')).toBeVisible();
  const ap = '#panel-appearance';
  await page.selectOption(`${ap} [data-pick="shape"] select`, 'lanky');
  await page.selectOption(`${ap} [data-slot="hair"] select`, 'twin_tails');
  await page.click(`${ap} [data-swatch="hair.color2"] .ap-sw:nth-of-type(8)`);
  await page.selectOption(`${ap} [data-slot="eyes"] select`, 'cat');
  await page.selectOption(`${ap} [data-field="eyes.pupil"] select`, 'slit');
  await page.click(`${ap} [data-swatch="eyes.colorR"] .ap-sw:nth-of-type(7)`);
  await page.selectOption(`${ap} [data-slot="brows"] select`, 'soft');
  await page.selectOption(`${ap} [data-slot="mouth"] select`, 'cat');
  await page.selectOption(`${ap} [data-slot="extras"] select`, 'star_mark');
  await page.waitForFunction(() => thousandvale.actors.get('preview')?.look?.custom?.eyes?.pupil === 'slit' && thousandvale.actors.get('preview')?.body, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const eyes = await page.evaluate(() => thousandvale.actors.get('preview').body.eyes);
  expect(eyes.v25, 'the creation preview is a Chibi 2.5 body').toBe(true);
  await page.screenshot({ path: join(SHOTS, `c25-${shot}-create.png`) });
  // the options list itself, scrolled to the eyes
  await page.evaluate(() => document.querySelector('#panel-appearance [data-field="eyes.pupil"]')?.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: join(SHOTS, `c25-${shot}-create-eyes.png`) });
  await page.click(`${ap} [data-act="save"]`);
  await page.waitForFunction(() => tvui5.state().kits.open || thousandvale.S.phase !== 'title', null, { timeout: 30000 });
  if (await page.evaluate(() => tvui5.state().kits.open)) await page.click('#panel-kits [data-act="create"]');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  const look = await page.evaluate(() => tv.state().you && thousandvale.S.look);
  expect(look.custom.eyes.pupil, 'the server kept the 2.5 choices').toBe('slit');
  expect(look.custom.hair.color2).toBeTruthy();
}

/** A crowd of n fake townsfolk round you: how long until they all have bodies, and the worst main-thread stall. */
async function crowd(page, n) {
  await page.evaluate(() => tv.perf(true));
  return page.evaluate(async n => {
    const t0 = performance.now();
    tv.crowd(n, 13);
    const want = () => [...thousandvale.actors.actors.values()].filter(a => String(a.id).startsWith('crowd-') && a.lod === 'full').length;
    const have = () => [...thousandvale.actors.actors.values()].filter(a => String(a.id).startsWith('crowd-') && a.body).length;
    while (performance.now() - t0 < 240000) { await new Promise(r => setTimeout(r, 250)); if (want() && have() >= want()) break; }
    const ms = performance.now() - t0;
    await new Promise(r => setTimeout(r, 1500));
    const p = tv.perf();
    return { n, bodies: have(), full: want(), allBuiltMs: Math.round(ms), stalls: p.stalls, links: p.links, buildMs: thousandvale.actors.lodStats.buildMs };
  }, n);
}

test('desktop: create with 2.5 options, a town crowd, a robed caster running, a fight, your portrait', async ({ browser }) => {
  test.setTimeout(1500000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?quality=high&fresh=1&tod=0.45');
  await create(page, 'Oddeye', 'desk');
  // your face in the player frame, and a 2.5 body in the world
  // the 2.5 body is prepared in small steps (prepareChibi2) — wait for it rather than a fixed 3 s (a busy machine needs longer)
  await page.waitForFunction(() => { const a = [...thousandvale.actors.actors.values()].find(x => x.self); return !!a?.body?.eyes; }, null, { timeout: 30000 }).catch(() => {});
  const me = await page.evaluate(() => { const a = [...thousandvale.actors.actors.values()].find(x => x.self); return { v25: a?.body?.eyes?.v25, hold: !!a?.body }; });
  expect(me.v25, 'you are Chibi 2.5').toBe(true);
  await page.evaluate(() => tv.view(5.5, 0.22));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, 'c25-desk-portrait.png') });

  // the town square: a crowd, timed
  RESULTS.desk25 = await crowd(page, 36);
  console.log('[c25 crowd 2.5]', JSON.stringify(RESULTS.desk25));
  // talk-distance: the nearest townsfolk look at you (the crowd are fake players, so ask the rule directly on an npc)
  await page.evaluate(() => tv.view(11, 0.42));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(SHOTS, 'c25-desk-crowd.png') });
  await page.evaluate(() => tv.crowd(0));

  // a robed caster running: you (mage robes), side on
  const you = await page.evaluate(() => tv.state().you);
  await page.evaluate(([x, z]) => tv.walkTo(x + 60, z + 4), [you.x, you.z]);
  await page.waitForTimeout(1800);
  await page.evaluate(() => tv.view(4.5, 0.12, thousandvale.controls ? null : null));
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, 'c25-desk-run.png') });
  await page.evaluate(() => tv.stop());

  // a fight out in the wilds
  await hook('/tough', { name: 'Oddeye' });
  const tp = await hook('/teleport', { name: 'Oddeye', x: 26624 - 260, z: you.z + 40 });
  expect(tp.ok).toBe(true);
  await page.waitForTimeout(9000);
  let fought = false;
  for (let i = 0; i < 30 && !fought; i++) {
    const s = await page.evaluate(() => tv.state());
    const foe = s.ents.filter(e => e.kind === 'monster' && !e.dead).sort((p, q) => Math.hypot(p.x - s.you.x, p.z - s.you.z) - Math.hypot(q.x - s.you.x, q.z - s.you.z))[0];
    if (foe && Math.hypot(foe.x - s.you.x, foe.z - s.you.z) < 60) {
      await page.evaluate(id => { tv.target(id); tv.attack(id); }, foe.id);
      await page.waitForTimeout(5000);
      await page.evaluate(id => tv.cast(1, id), foe.id);
      await page.waitForTimeout(1200);
      fought = true;
    } else { await page.evaluate(([x, z]) => tv.walkTo(x + 40, z), [s.you.x, s.you.z]); await page.waitForTimeout(3000); }
  }
  const look = await page.evaluate(() => { const a = [...thousandvale.actors.actors.values()].find(x => x.self); return { looking: a?.body?.eyes?.looking, at: a?.lookingAt ?? null, target: tv.state().target ?? null }; });
  console.log('[c25 fight]', JSON.stringify({ fought, look }));
  await page.screenshot({ path: join(SHOTS, 'c25-desk-fight.png') });
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});

test('desktop ?chibi=2: the same crowd on the old bodies (the before number)', async ({ browser }) => {
  test.setTimeout(900000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + '?quality=high&chibi=2&autoplay=1&name=Oldface&cls=mage&tod=0.45');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => [...thousandvale.actors.actors.values()].find(x => x.self)?.body?.eyes?.v25)).toBe(false);
  RESULTS.desk2 = await crowd(page, 36);
  console.log('[c25 crowd 2]', JSON.stringify(RESULTS.desk2));
  await page.screenshot({ path: join(SHOTS, 'c25-desk-crowd-v2.png') });
  writeFileSync(join(SHOTS, 'c25-perf.json'), JSON.stringify(RESULTS, null, 1));
  await ctx.close();
});

test('phone 393 x 852: create with 2.5 options, a crowd, your portrait', async ({ browser }) => {
  test.setTimeout(1200000);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?quality=low&fresh=1&tod=0.45');
  await create(page, 'Phonefae', 'phone');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SHOTS, 'c25-phone-portrait.png') });
  RESULTS.phone25 = await crowd(page, 20);
  console.log('[c25 crowd phone]', JSON.stringify(RESULTS.phone25));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, 'c25-phone-crowd.png') });
  writeFileSync(join(SHOTS, 'c25-perf.json'), JSON.stringify(RESULTS, null, 1));
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});
