// Phone chat (owner report 2026-10-21): "when I pull my keyboard up to chat, if I type a letter the keyboard hides and it
// doesn't go through." The first letter counted as 'switched to a keyboard', which closed the controller's on-screen keyboard
// (never open), and pad-layout.js took the focus off the chat box. Same sign-in as phone-play.spec.js, then type in chat.
// (Chromium with touch + a 393 x 852 viewport, not Safari: this proves the layout and the touch layer drive the game;
// frame rate on the real phone is not something a headless software renderer can tell us.)
// Every step takes a picture into tests/G/shots/phone-play/. Steps are soft: one broken step does not hide the others.
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/G/phone-chat.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots', 'phone-chat');      // G_SHOTS=phone-play-webkit when run with --browser=webkit
mkdirSync(SHOTS, { recursive: true });
// one worker, one shared page, in file order — but a failed step does not stop the ones after it (each says what it needs)
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase, ctx, page; const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()).catch(e => ({ ok: false, err: e.message }));
const shot = name => page.screenshot({ path: join(SHOTS, name + '.png') });
const tap = sel => page.locator(sel).first().tap();
const you = () => page.evaluate(() => tv.state().you);
const NAME = 'Chatterpip';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120000);
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, '..', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start:\n' + out)), 40000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`; hookBase = `http://127.0.0.1:${hk}`;
  ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

test('1. into the world on a phone', async () => {
  test.setTimeout(420000);
  await page.goto(base + '?fresh=1&tod=0.45');
  await page.waitForSelector('#loading.done', { timeout: 240000 });
  expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe('phone');
  expect(await page.evaluate(() => document.querySelector('meta[name="viewport"]').content)).toMatch(/user-scalable=no.*viewport-fit=cover/);
  expect(await page.evaluate(() => thousandvale.view.renderer ? window.tv.state().stats.quality : null)).toMatch(/low|medium/);
  await shot('01-title');
  await tap('#new-char');      // play-test 10 (Y29, D-UI): the title opens on the front card — "Create character" first
  await page.locator('#name').tap(); await page.locator('#name').fill(NAME);
  await tap('#calling-open'); await tap('#classes [data-cls="cleric"]'); await tap('#calling-done');      // feedback #98: the calling picker
  await tap('#enter');
  await expect(page.locator('#panel-appearance')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot('02-appearance');
  await tap('#panel-appearance .ph-peek'); await page.waitForTimeout(600);
  await shot('03-appearance-preview');
  expect((await page.locator('#panel-appearance').boundingBox()).height).toBeLessThan(80);
  await tap('#panel-appearance .ph-peek');
  await tap('#panel-appearance [data-act="save"]');
  await page.waitForFunction(() => tvui5.state().kits.open || thousandvale.S.phase !== 'title', null, { timeout: 30000 });
  if (await page.evaluate(() => tvui5.state().kits.open)) {
    await page.waitForTimeout(1200); await shot('04-equipment');
    const packs = page.locator('#panel-kits [data-group="weapons"]');
    if (await packs.count() > 1) await packs.nth(1).tap();
    await tap('#panel-kits [data-act="create"]');
  }
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 180000 });
  await page.waitForTimeout(4000);
  await shot('05-in-the-world');
  await expect(page.locator('.ph-stickzone')).toBeVisible();
  await expect(page.locator('#menubar')).toBeHidden();
});

test('2. typing in the chat keeps the box (and the phone keyboard) and the line is sent', async () => {
  await tap('.ph-chat'); await page.waitForTimeout(300);
  await page.locator('#chat-input').tap();
  expect(await page.evaluate(() => tvinput.state().device)).toBe('touch');
  await page.keyboard.type('hello vale', { delay: 40 });
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('chat-input');
  expect(await page.locator('#chat-input').inputValue()).toBe('hello vale');
  expect(await page.evaluate(() => tvinput.state().device)).toBe('touch');
  await shot('02-typing');
  await page.keyboard.press('Enter');
  await expect(page.locator('#chat-log')).toContainText('hello vale', { timeout: 10000 });
  expect(errors).toEqual([]);
});
