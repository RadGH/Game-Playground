// Wrap-up, report S#66: a browser that played as a guest, then signs in to a real account, is offered its guest
// characters on the title screen and can move them across. Own server (tests/D/m3-server.mjs, memory DB).
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/wrap-adopt.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase;
test.beforeAll(async () => {
  const port = await freePort(), hook = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hook), '--event-first', '600000', '--event-announce', '600000'], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hook}`;
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

async function join_(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
  const page = await ctx.newPage();
  // (play-test 10, Y30: after a sign-in the game opens "what is new" over the screen when there is news you have not
  //  seen. That is the game being right and this test being in the way — read it away whenever it turns up.)
  await page.addLocatorHandler(page.locator('.tv-changelog:not([hidden]) .cl-x'), async x => { await x.click(); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?autoplay=1&name=${name}&cls=warrior&quality=low`);
  await page.waitForFunction(() => window.tv && window.tv.state().status === 'online' && window.tv.state().phase === 'world', null, { timeout: 60000 });
  return { ctx, page, errors, name };
}
const social = p => p.evaluate(() => window.tv.social());
const chatHas = async (P, re, tab) => (await social(P.page)).chat.some(l => re.test(l.text) && (!tab || l.tab === tab));
async function claim(P, user) {
  await P.page.click('#menu-account');
  const f = P.page.locator('#panel-account form.claim');
  await f.locator('input[placeholder="Username"]').fill(user);
  await f.locator('input[placeholder^="Password"]').fill('correct horse');
  await f.locator('input[placeholder^="The same"]').fill('correct horse');
  await f.locator('button.primary').click();
  await expect.poll(async () => (await social(P.page)).claimed, { timeout: 20000, message: `${P.name} claimed` }).toBe(true);
  await P.page.keyboard.press('Escape');
}

test('S#66: sign in on a browser that holds a guest character -> the title offers it -> it joins the account', async ({ browser }) => {
  test.setTimeout(240000);
  // 1. an account is made and logged out of (the browser now holds no key)
  const P = await join_(browser, 'Owner');
  await claim(P, 'owner_w');
  await P.page.click('#menu-account');
  await P.page.click('#panel-account button:has-text("Log out")');
  await P.page.waitForSelector('#loading.done', { timeout: 60000 });
  // 2. the same browser plays as a guest
  await P.page.goto(`${base}?autoplay=1&name=Guesty&cls=mage&quality=low`);
  await P.page.waitForFunction(() => window.tv && window.tv.state().status === 'online' && window.tv.state().phase === 'world', null, { timeout: 60000 });
  // 3. back at the title, its owner signs in
  await P.page.goto(`${base}?quality=low`);
  await P.page.waitForSelector('#loading.done', { timeout: 60000 });
  await P.page.click('#tab-login');
  await P.page.fill('#signin-user', 'owner_w');
  await P.page.fill('#signin-pass', 'correct horse');
  await P.page.click('#signin-go');
  await expect(P.page.locator('#char-chips .chip', { hasText: 'Owner' })).toBeVisible({ timeout: 20000 });
  const offer = P.page.locator('.guest-offer');
  await expect(offer).toBeVisible({ timeout: 15000 });
  await expect(offer).toContainText('Guesty (level 1 mage)');
  await expect(P.page.locator('#char-chips .chip', { hasText: 'Guesty' })).toHaveCount(0);
  await P.page.screenshot({ path: join(SHOTS, 'wrap-guest-offer.png') });
  // 4. move it (a character that left the world a second ago may still be held: the box says so and offers to try again)
  await expect(async () => {
    if (await offer.count()) await offer.locator('[data-act=adopt]').click();
    await expect(P.page.locator('#char-chips .chip', { hasText: 'Guesty' })).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 90000 });
  await expect(offer).toHaveCount(0);
  await expect(P.page.locator('.char-said')).toContainText('Guesty is on your account now');
  await P.page.screenshot({ path: join(SHOTS, 'wrap-guest-moved.png') });
  // 5. it plays, as the account's character; and a reload offers nothing more
  await P.page.locator('#char-chips .chip', { hasText: 'Guesty' }).click();
  await P.page.waitForFunction(() => window.tv.state().phase === 'world' && window.tv.state().status === 'online', null, { timeout: 60000 });
  expect((await social(P.page)).claimed).toBe(true);
  expect(await P.page.evaluate(() => Object.keys(localStorage).filter(k => k.endsWith('.guest')))).toEqual([]);
  expect(P.errors, 'page errors').toEqual([]);
  await P.ctx.close();
});
