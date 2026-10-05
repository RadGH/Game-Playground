// Stream D — M3 "public play" client, end to end through the real UI (PLAN §15 M3, protocol §16):
// two browser contexts (two guests) claim their accounts, become friends, whisper, found a guild and invite,
// talk in guild chat, and mail an item that the other takes. Screenshots go to tests/D/shots/m3-*.png.
// Starts its own server (tests/D/m3-server.mjs: stream A's server, memory DB, plus a test-only hook that sets a
// level and grants gold/items so the spec does not grind to level 5).
// Run (shared lock, one browser at a time):
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/m3-social.spec.js
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
async function say(P, text) {
  await P.page.click('#chat-input');
  await P.page.fill('#chat-input', text);
  await P.page.press('#chat-input', 'Enter');
}

test('title screen: guest / log in tabs, privacy link, local fonts', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
  const page = await ctx.newPage();
  const remote = [];
  page.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com|challenges\.cloudflare/.test(r.url())) remote.push(r.url()); });
  await page.goto(`${base}?quality=low`);
  await page.waitForSelector('#loading.done', { timeout: 60000 });
  await expect(page.locator('.title-foot a')).toHaveAttribute('href', 'public/privacy.html');
  await page.screenshot({ path: join(SHOTS, 'm3-title-guest.png') });
  await page.click('#tab-login');
  await expect(page.locator('#signin')).toBeVisible();
  await page.fill('#signin-user', 'nobody_here');
  await page.fill('#signin-pass', 'wrong password');
  await page.click('#signin-go');
  await expect(page.locator('#signin-note')).toContainText(/wrong|username/i, { timeout: 20000 });
  await page.click('#signin-forgot');
  await page.screenshot({ path: join(SHOTS, 'm3-title-login.png') });
  expect(await page.evaluate(() => document.fonts.check('16px Cinzel'))).toBe(true);
  expect(remote, 'no Google Fonts / Turnstile requests when the server asks for no human check').toEqual([]);
  const r = await page.request.get(base + 'public/privacy.html');
  expect(r.ok()).toBe(true);
  await ctx.close();
});

test('two players: claim, friends, whisper, guild invite + guild chat, mail an item and take it', async ({ browser }) => {
  test.setTimeout(420000);
  const A = await join_(browser, 'Alda');
  const B = await join_(browser, 'Brem');

  // 1. claim both accounts through the Account window; the guest warning shows first
  await A.page.click('#menu-account');
  await expect(A.page.locator('#panel-account')).toContainText('guest');
  await A.page.screenshot({ path: join(SHOTS, 'm3-account-claim.png') });
  await A.page.keyboard.press('Escape');
  await claim(A, 'alda_m3');
  await claim(B, 'brem_m3');
  // skip the grind: level 6 (public chat, mail, guilds need 5), gold for the guild fee + postage, two items to mail
  await hook('/level', { name: 'Alda', level: 9 });
  await hook('/level', { name: 'Brem', level: 6 });
  await hook('/give', { name: 'Alda', gold: 40, items: 2, itemName: 'Brass Lantern Charm' });
  await expect.poll(async () => (await social(A.page)).bag.length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);

  // 2. friends: A adds B by name from the Friends window (O)
  await A.page.keyboard.press('KeyO');
  await A.page.fill('#panel-friends input', 'Brem');
  await A.page.press('#panel-friends input', 'Enter');
  await expect.poll(async () => (await social(A.page)).friends.find(f => f.name === 'Brem')?.online, { timeout: 15000 }).toBe(true);
  await A.page.screenshot({ path: join(SHOTS, 'm3-friends.png') });
  await A.page.keyboard.press('Escape');

  // 3. whisper with /w; B answers with /r; B sees it on the Whispers tab
  await say(A, '/w Brem meet me by the well');
  await expect.poll(() => chatHas(B, /meet me by the well/, 'w'), { timeout: 15000 }).toBe(true);
  await say(B, '/r on my way');
  await expect.poll(() => chatHas(A, /on my way/, 'w'), { timeout: 15000 }).toBe(true);
  // world chat works for a claimed level-6 account
  await say(B, '/world hello realm');
  await expect.poll(() => chatHas(A, /hello realm/, 'world'), { timeout: 15000 }).toBe(true);
  await B.page.click('.chat-tab[data-tab="w"]');
  await B.page.screenshot({ path: join(SHOTS, 'm3-chat-whispers.png') });

  // the name menu on a chat name
  await A.page.locator('#chat-log a.chat-name', { hasText: 'Brem' }).last().click();
  await expect(A.page.locator('.name-menu')).toBeVisible();
  await expect(A.page.locator('.name-menu')).toContainText('Report');
  await A.page.screenshot({ path: join(SHOTS, 'm3-name-menu.png') });
  await A.page.keyboard.press('Escape');
  await A.page.mouse.click(600, 300);

  // 4. guild: A founds one (10 gold), invites B; B joins from the pop-up; guild chat; MOTD
  await A.page.keyboard.press('KeyG');
  await A.page.fill('#panel-guild input[placeholder="Guild name"]', 'Lantern Keepers');
  await A.page.click('#panel-guild button:has-text("Found")');
  await expect.poll(async () => (await social(A.page)).guild?.name, { timeout: 15000 }).toBe('Lantern Keepers');
  await A.page.fill('#panel-guild input[placeholder="Invite by name"]', 'Brem');
  await A.page.press('#panel-guild input[placeholder="Invite by name"]', 'Enter');
  await expect(B.page.locator('.guild-pop')).toBeVisible({ timeout: 15000 });
  await B.page.screenshot({ path: join(SHOTS, 'm3-guild-invite.png') });
  await B.page.click('.guild-pop button.primary');
  await expect.poll(async () => (await social(A.page)).guild?.members.length, { timeout: 15000 }).toBe(2);
  await A.page.fill('#panel-guild textarea', 'Hunt at dusk by the old mill.');
  await A.page.click('#panel-guild button:has-text("Save message")');
  await expect.poll(async () => (await social(B.page)).guild?.motd, { timeout: 15000 }).toBe('Hunt at dusk by the old mill.');
  await say(B, '/g thanks for the invite');
  await expect.poll(() => chatHas(A, /thanks for the invite/, 'guild'), { timeout: 15000 }).toBe(true);
  await A.page.screenshot({ path: join(SHOTS, 'm3-guild.png') });
  await A.page.keyboard.press('Escape');

  // 5. mail: A writes to B with an item and 5 gold (both stand in the town hub); B takes it
  const before = (await social(A.page)).bag.length;
  await A.page.keyboard.press('KeyM');
  await A.page.click('#panel-mail button:has-text("Write a letter")');
  await A.page.fill('#panel-mail input[aria-label="To"]', 'Brem');
  await A.page.fill('#panel-mail input[aria-label="Subject"]', 'A charm for the road');
  await A.page.fill('#panel-mail textarea', 'Found this in a ditch. Keep it.');
  await A.page.locator('#panel-mail .ml-pick .islot').first().click();
  await A.page.fill('#panel-mail input[aria-label="Gold to send"]', '5');
  await A.page.screenshot({ path: join(SHOTS, 'm3-mail-compose.png') });
  await A.page.click('#panel-mail button:has-text("Send (")');
  await expect.poll(async () => (await social(A.page)).bag.length, { timeout: 15000 }).toBe(before - 1);
  await expect.poll(async () => (await social(B.page)).mail.unread, { timeout: 15000 }).toBeGreaterThan(0);
  await expect(B.page.locator('#menu-mail b')).toHaveText(/\d/);
  await B.page.keyboard.press('KeyM');
  await B.page.locator('#panel-mail .ml-row').first().click();
  await expect(B.page.locator('#panel-mail .ml-body')).toContainText('Found this in a ditch', { timeout: 15000 });
  await B.page.screenshot({ path: join(SHOTS, 'm3-mail-read.png') });
  const bBag = (await social(B.page)).bag.length, bGold = (await social(B.page)).gold;
  await B.page.click('#panel-mail button:has-text("Take all")');
  await expect.poll(async () => (await social(B.page)).bag.some(i => /Brass Lantern Charm/.test(i.name)), { timeout: 15000 }).toBe(true);
  expect((await social(B.page)).bag.length).toBe(bBag + 1);
  expect((await social(B.page)).gold).toBe(bGold + 5);

  // 6. the Callboard (A is level 9) and the help overlay
  await A.page.keyboard.press('KeyJ');
  await expect(A.page.locator('#panel-callboard')).toContainText(/Your role/);
  await A.page.screenshot({ path: join(SHOTS, 'm3-callboard.png') });
  await A.page.keyboard.press('Escape');
  await A.page.keyboard.press('F1');
  await expect(A.page.locator('#panel-help')).toContainText('Callboard');
  await A.page.screenshot({ path: join(SHOTS, 'm3-help.png') });

  // 7. log out (claimed accounts only) and log back in from the title screen with the username
  await B.page.click('#menu-account');
  await B.page.click('#panel-account button:has-text("Log out")');
  await B.page.waitForSelector('#loading.done', { timeout: 60000 });
  await expect(B.page.locator('#title')).toBeVisible();
  await B.page.click('#tab-login');
  await B.page.fill('#signin-user', 'brem_m3');
  await B.page.fill('#signin-pass', 'correct horse');
  await B.page.click('#signin-go');
  await expect(B.page.locator('#char-chips .chip', { hasText: 'Brem' })).toBeVisible({ timeout: 20000 });
  await B.page.screenshot({ path: join(SHOTS, 'm3-title-mychars.png') });
  await B.page.locator('#char-chips .chip', { hasText: 'Brem' }).click();
  await B.page.waitForFunction(() => window.tv.state().phase === 'world' && window.tv.state().status === 'online', null, { timeout: 60000 });
  const back = await social(B.page);
  expect(back.claimed).toBe(true);
  expect(back.username).toBe('brem_m3');
  expect(back.bag.some(i => /Brass Lantern Charm/.test(i.name)), 'the mailed item survived the logout').toBe(true);
  await expect.poll(async () => (await social(B.page)).guild?.name, { timeout: 15000 }).toBe('Lantern Keepers');

  expect(A.errors, 'page errors in A').toEqual([]);
  expect(B.errors, 'page errors in B').toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});
