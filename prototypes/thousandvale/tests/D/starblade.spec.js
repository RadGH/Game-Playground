// Play-test 11 (owner #53 / #56) — the Star Blade, LOOKED at: its calling card with its emblem and the outfit on the
// creation screen, the starting plate cut in its colours in the world, and each of its six skills cast at a training
// dummy with its own star-steel signature drawn.
// Shots: $SB_SHOTS or tests/D/shots/starblade-*.png
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/starblade.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = process.env.SB_SHOTS || join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase;
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

test.beforeAll(async () => {
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server:\n' + out)), 30000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  hookBase = `http://127.0.0.1:${hp}`; mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => { srv?.kill('SIGTERM'); });

test('the creation screen: the Star Blade\'s card, emblem and night-blue plate', async ({ browser }) => {
  test.setTimeout(600000);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?quality=low&tod=0.5`);
  await page.waitForSelector('#loading.done', { timeout: 300000 });
  if (await page.locator('#new-char').isVisible().catch(() => false)) await page.click('#new-char');
  for (const race of ['human', 'dwarf']) {
    await page.click(`#races .chip[data-race="${race}"]`);
    await page.selectOption('#class-more', 'starblade');
    await page.waitForFunction(r => { const a = thousandvale.actors.get('preview'); return a?.look?.cls === 'starblade' && a.look.race === r && !!a.body; }, race, { timeout: 60000 });
    await page.waitForTimeout(3500);
    await expect(page.locator('#class-card .cc-emblem svg')).toBeVisible();
    const card = await page.locator('#class-card').innerText();
    expect(card).toContain('Star Blade'); expect(card).toContain('Constellation');
    const worn = await page.evaluate(async () => { const m = await import(new URL('js/client/looks.js', location.href).href); const av = await m.avatarFor(thousandvale.actors.get('preview').look); return { top: av.top, hat: av.hat }; });
    expect(worn.top.color).toBe('#1a2350'); expect(worn.top.emblem).toBe('star');
    await page.screenshot({ path: join(SHOTS, `starblade-card-${race}.png`) });
  }
  expect(errors, 'no page errors').toEqual([]);
  await ctx.close();
});

test('in the world: the plate it starts in, and its six skills each drawing their own star-steel signature', async ({ browser }) => {
  test.setTimeout(1200000);
  const name = 'Corwenblade';
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?quality=low&fresh=1&tod=0.5`);
  await page.waitForSelector('#loading.done', { timeout: 300000 });
  if (await page.locator('#new-char').isVisible().catch(() => false)) await page.click('#new-char');
  await page.fill('#name', name);
  await page.click('#races .chip[data-race="human"]');
  await page.selectOption('#class-more', 'starblade');
  // (at 1100x700 the title's footer line — #build-tag — lies over the Next button and takes the pointer; found 2026-10-15, not this class's)
  await page.locator('#enter').evaluate(b => b.click());
  await expect(page.locator('#panel-appearance')).toBeVisible({ timeout: 30000 });
  await page.click('#panel-appearance [data-act="save"]');
  await expect(page.locator('#panel-kits')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => Object.keys(thousandvale.actors.get('preview')?.look?.gear || {}).includes('chest'), null, { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, 'starblade-kit.png') });
  await page.click('#panel-kits [data-act="create"]');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && thousandvale.S.phase === 'world', null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  const me = await page.evaluate(() => tv.state().you.id);
  await page.waitForFunction(id => !!thousandvale.actors.get(id)?.body, me, { timeout: 60000 });
  await page.evaluate(() => tv.hud?.(false));
  const worn = await page.evaluate(async id => { const m = await import(new URL('js/client/looks.js', location.href).href); const a = thousandvale.actors.get(id); const av = await m.avatarFor(a.look); return { cls: a.look.cls, gear: Object.keys(a.look.gear || {}), top: av.top, hat: av.hat }; }, me);
  console.log('worn', JSON.stringify(worn));
  expect(worn.cls).toBe('starblade');
  expect(worn.top.color, 'the starting plate is night blue').toBe('#1a2350');
  for (const [n, off] of [['front', Math.PI], ['quarter', Math.PI * 0.75]]) {
    await page.evaluate(([id, off]) => { const a = thousandvale.actors.get(id); tv.view(3.4, 0.12, a.yaw + off); }, [me, off]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS, `starblade-world-${n}.png`) });
  }
  // a dummy, level 30, every skill in turn
  await hook('/level', { name, level: 30 }); await page.waitForTimeout(2500);
  const dummies = () => page.evaluate(() => [...thousandvale.actors.actors.values()].filter(a => a.creature?.type === 'training_dummy').map(a => ({ id: a.id, x: a.pos.x, z: a.pos.z, yaw: a.yaw })));
  let ds = await dummies();
  if (!ds.length) { await hook('/teleport', { name, x: 25140, z: 5370 }); await page.waitForTimeout(5000); ds = await dummies(); }
  expect(ds.length, 'training dummies stand in the first town').toBeGreaterThan(0);
  const d = ds[0];
  await hook('/teleport', { name, x: d.x + Math.sin(d.yaw) * 2.6, z: d.z + Math.cos(d.yaw) * 2.6 }); await page.waitForTimeout(5000);
  await page.waitForFunction(id => !!thousandvale.actors.get(id)?.body, d.id, { timeout: 60000 });
  const bar = await page.evaluate(() => thousandvale.S.bar.map(b => b?.id || null));
  console.log('bar', JSON.stringify(bar));
  const slotOf = id => bar.indexOf(id) + 1;
  const sig0 = await page.evaluate(() => tv.sig());
  for (const id of ['starcut', 'star_aegis', 'star_tether', 'comet_rush', 'binding_stars', 'collapsing_star']) {
    if (id === 'comet_rush') { await hook('/teleport', { name, x: d.x + Math.sin(d.yaw) * 10, z: d.z + Math.cos(d.yaw) * 10 }); await page.waitForTimeout(3000); }
    await page.evaluate(([yaw]) => tv.view(7, 0.32, yaw + Math.PI + 0.9), [d.yaw]);
    await page.evaluate(([idd]) => { thousandvale.S.target = idd; }, [d.id]);
    const before = await page.evaluate(() => tv.sig().spawned);
    const r = await page.evaluate(([s, t]) => tv.cast(s, t), [slotOf(id), d.id]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, `starblade-${id}.png`) });
    await page.waitForTimeout(1300);
    const after = await page.evaluate(() => tv.sig().spawned);
    console.log(id, JSON.stringify(r), 'sig shapes', after - before);
    expect(after - before, `${id}: its signature drew something`).toBeGreaterThan(0);
  }
  const res = await page.evaluate(() => thousandvale.ui10.classRes.state);
  console.log('starlight', JSON.stringify(res), 'sig', JSON.stringify(sig0), JSON.stringify(await page.evaluate(() => tv.sig())));
  expect(errors, 'no page errors').toEqual([]);
  await ctx.close();
});
