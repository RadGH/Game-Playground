// Play-test 12, stream UI — the interface fixes, in a real browser:
//   A. the real game on a real server (tests/D/m3-server.mjs): #64 step 1 fits / scrolls on short screens, #65 the
//      appearance step hides the logo on a phone, #73 the sign-in QR code signs a second (phone) browser in, #71 a bug
//      report goes with a screenshot that the server keeps.
//   B. the interface gallery (recorded data, no server): #85 "Remember for this transaction" on the rare-sale question,
//      #67 a tap on a perk shows its card on a phone.
// (#68/#74 — the on-screen keyboard — are in tests/G/gamepad.spec.js; #69 bulk skinning in tests/P/pt12-skin-batch.test.js;
//  #80 the perk search in tests/D/pt2.test.js.)
// Every step takes a picture into tests/G/shots/pt12-ui/.
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/G/pt12-ui.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, existsSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', '..');
const SHOTS = join(HERE, 'shots', 'pt12-ui');
mkdirSync(SHOTS, { recursive: true });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PHONE = { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' };

// ================================================================ A. the real game
test.describe('real game', () => {
  let srv, base;
  test.beforeAll(async () => {
    test.setTimeout(120000);
    const port = await freePort(), hk = await freePort();
    srv = spawn(process.execPath, [join(GAME, 'tests', 'D', 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: GAME, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; srv.stderr.on('data', d => { out += d; });
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start:\n' + out)), 60000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('server exited ' + c + '\n' + out))); });
    base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  });
  test.afterAll(() => { srv?.kill('SIGTERM'); });

  /** Title -> "Create character" -> name + the Star Blade (the longest calling card). */
  async function toStep1(page, name, viewport) {
    await page.goto(base + '?fresh=1&tod=0.45');
    await page.waitForSelector('#loading.done', { timeout: 240000 });
    await page.locator('#new-char').click();
    await page.fill('#name', name);
    const chip = page.locator('#classes [data-cls="starblade"]');
    if (await chip.count()) await chip.click(); else await page.selectOption('#class-more', 'starblade');
    await expect(page.locator('#class-card')).toBeVisible();
    await page.waitForTimeout(300);
  }

  for (const [label, vp, phone] of [['desktop-1024x576', { width: 1024, height: 576 }, false], ['deck-1280x800', { width: 1280, height: 800 }, false], ['phone-375x667', PHONE.viewport, true], ['phone-land-740x360', { width: 740, height: 360 }, true]]) {
    test(`#64: step 1 with the Star Blade reaches "Next" — ${label}`, async ({ browser }) => {
      test.setTimeout(300000);
      const ctx = await browser.newContext(phone ? { ...PHONE, viewport: vp } : { viewport: vp });
      const page = await ctx.newPage();
      await toStep1(page, 'Tallie', vp);
      await page.screenshot({ path: join(SHOTS, `64-step1-${label}.png`) });
      // the long "how it plays" paragraph folds on a short screen; the page itself scrolls
      const info = await page.evaluate(() => { const t = document.getElementById('title'); return { over: getComputedStyle(t).overflowY, sh: t.scrollHeight, ch: t.clientHeight, fold: !!document.querySelector('#class-card details.cc-more'), open: document.querySelector('#class-card details.cc-more')?.open }; });
      expect(['auto', 'scroll']).toContain(info.over);
      if (vp.height < 820) expect(info.open, 'folded on a short screen').toBe(false);
      await page.locator('#enter').scrollIntoViewIfNeeded();
      const box = await page.locator('#enter').boundingBox();
      expect(box && box.y >= 0 && box.y + box.height <= vp.height + 1, `Next is on screen after scrolling: ${JSON.stringify(box)}`).toBe(true);
      // and the TOP stays reachable (centred content that overflows must not be cut off above)
      await page.evaluate(() => { document.getElementById('title').scrollTop = 0; });
      const nb = await page.locator('#name').boundingBox();
      expect(nb.y, 'the name box is reachable at the top').toBeGreaterThanOrEqual(0);
      await page.locator('#enter').scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(SHOTS, `64-step1-${label}-scrolled.png`) });
      await ctx.close();
    });
  }

  test('#65: on a phone the appearance step hides the logo and the tabs', async ({ browser }) => {
    test.setTimeout(300000);
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await toStep1(page, 'Pippa');
    await page.locator('#classes [data-cls="mage"]').tap();
    await page.locator('#enter').scrollIntoViewIfNeeded(); await page.locator('#enter').tap();
    await expect(page.locator('#panel-appearance')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1200);
    const vis = await page.evaluate(() => ['.brand', '.card-tabs', '.title-foot'].map(s => getComputedStyle(document.querySelector(s)).visibility));
    expect(vis).toEqual(['hidden', 'hidden', 'hidden']);
    await page.screenshot({ path: join(SHOTS, '65-appearance-phone.png') });
    await ctx.close();
  });

  test('#73 + #71: the QR code signs a phone in to the same account; a bug report carries a screenshot', async ({ browser }) => {
    test.setTimeout(420000);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(base + '?fresh=1&tod=0.45&autoplay=1&name=Quill');
    await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 240000 });
    await page.waitForTimeout(2500);
    const user = 'quill' + Date.now().toString(36).slice(-5);
    await page.evaluate(u => thousandvale.S.net.claim(u, 'longenough1'), user);
    await page.waitForFunction(() => thousandvale.S.net.claimed, null, { timeout: 20000 });
    // ---- #73 ----
    await page.waitForTimeout(2200);                     // (the account message is rate limited)
    await page.evaluate(() => thousandvale.account.qr.open());
    await expect(page.locator('#panel-qr-signin .qr-code svg')).toBeVisible({ timeout: 10000 });
    const url = await page.evaluate(() => thousandvale.account.qr.state.url);
    expect(url).toMatch(/\?signin=[0-9a-f]{32}$/);
    await page.screenshot({ path: join(SHOTS, '73-qr-desktop.png') });
    const phone = await browser.newContext(PHONE);
    const pp = await phone.newPage();
    await pp.goto(url);
    await pp.waitForSelector('#loading.done', { timeout: 240000 });
    await pp.waitForFunction(() => thousandvale.S.net?.claimed, null, { timeout: 30000 });
    expect(await pp.evaluate(() => thousandvale.S.net.username)).toBe(user);
    expect(await pp.evaluate(() => location.search), 'the code leaves the address bar').not.toMatch(/signin/);
    await expect(pp.locator('#char-chips .chip').first()).toBeVisible({ timeout: 20000 });
    await pp.screenshot({ path: join(SHOTS, '73-phone-signed-in.png') });
    await phone.close();
    // the same code a second time: refused
    const again = await browser.newContext(PHONE);
    const ap = await again.newPage();
    await ap.goto(url);
    await ap.waitForSelector('#loading.done', { timeout: 240000 });
    await expect(ap.locator('#signin-note')).toContainText(/used|run out/, { timeout: 70000 });
    await ap.screenshot({ path: join(SHOTS, '73-phone-code-used.png') });
    await again.close();
    await page.evaluate(() => thousandvale.account.qr.panel.close());

    // ---- #71 ----
    await page.evaluate(() => tvui5.feedback('bug'));
    await expect(page.locator('#panel-feedback textarea')).toBeVisible();
    await page.locator('#panel-feedback textarea').fill('Testing the screenshot: the wall by the gate looks crooked.');
    await page.locator('#panel-feedback [data-k="shot"]').check();
    await expect(page.locator('#panel-feedback .fb-shot img')).toBeVisible({ timeout: 15000 });
    const st = await page.evaluate(() => tvui5.state().feedback.shot);
    expect(st.has && st.w > 300 && !st.ui, JSON.stringify(st)).toBe(true);
    // the picture is the world, not a black square: sample it
    const lit = await page.evaluate(async () => { const img = document.querySelector('#panel-feedback .fb-shot img'); const c = document.createElement('canvas'); c.width = 64; c.height = 40; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 40); const d = g.getImageData(0, 0, 64, 40).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; });
    expect(lit, 'the screenshot has the world in it').toBeGreaterThan(20);
    await page.screenshot({ path: join(SHOTS, '71-feedback-with-shot.png') });
    await page.locator('#panel-feedback [data-act="send"]').click();
    await page.waitForFunction(() => tvui5.state().feedback.shot.sent === 'sent', null, { timeout: 20000 });
    const id = await page.evaluate(() => tvui5.state().feedback.sent.id);
    expect(existsSync(join(GAME, '.data', 'feedback-shots', `dev-${id}.jpg`)), 'the server kept it beside the report').toBe(true);
    await page.screenshot({ path: join(SHOTS, '71-feedback-sent.png') });
    await ctx.close();
  });
});

// ================================================================ B. the gallery
const GALLERY = 'prototypes/thousandvale/ui-gallery-frame.html';
async function scene(page, id, device = 'desktop') {
  await page.goto(`${GALLERY}?scene=${id}&device=${device}&layout=${device === 'desktop' ? 'current' : 'proposed'}&freeze=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
}

test('#85: "Remember for this transaction" skips the rare-sale question until the counter is left', async ({ browser }) => {
  test.setTimeout(180000);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await scene(page, 'shop');
  await page.locator('#panel-shop [data-tab="sell"]').click();
  await page.waitForTimeout(300);
  // the rare-or-better rows: click until the question comes up (gear tab first, then items)
  const ask = async () => {
    for (const tab of ['gear', 'items']) {
      const t = page.locator(`#panel-shop [data-sell="${tab}"]`); if (await t.count()) await t.click();
      const rows = page.locator('#panel-shop .shop-row');
      for (let i = await rows.count() - 1; i >= 0; i--) {
        await rows.nth(i).click(); await page.waitForTimeout(120);
        if (await page.locator('.tv-confirm').count()) return true;
      }
    }
    return false;
  };
  expect(await ask(), 'a rare item asks first').toBe(true);
  await expect(page.locator('.tv-confirm .confirm-check')).toContainText('Remember for this transaction');
  await page.screenshot({ path: join(SHOTS, '85-confirm.png') });
  await page.locator('.tv-confirm [data-k="confirm-check"]').check();
  await page.locator('.tv-confirm button.primary').click();
  expect(await page.evaluate(() => tvui2.state().shop.sureRare)).toBe(true);
  expect(await ask(), 'no question while at this counter').toBe(false);
  // leave the counter and come back: it asks again
  const npc = await page.evaluate(() => tvui2.state().shop.npc);
  await page.evaluate(() => document.querySelector('#panel-shop .tvp-x').click());
  await page.evaluate(n => tvui2.openShop(n, 'Hal Fletchard'), npc);
  expect(await page.evaluate(() => tvui2.state().shop.sureRare)).toBe(false);
  await ctx.close();
});

test('#67: on a phone a tap on a perk shows what it does, with the button to stage it', async ({ browser }) => {
  test.setTimeout(180000);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await scene(page, 'perks', 'phone-p');
  await page.waitForTimeout(800);
  // a node on screen that is open (glowing) — the gallery's forest has staged a few
  const pt = await page.evaluate(() => {
    const cv = document.querySelector('#panel-perks canvas'), r = cv.getBoundingClientRect();
    const T = window.tvtalents || null;
    const g = T?.graph || null;
    return { r: { x: r.x, y: r.y, w: r.width, h: r.height }, has: !!g };
  });
  // tap around the middle until a node card opens
  let opened = false;
  for (let k = 0; k < 40 && !opened; k++) {
    const x = pt.r.x + pt.r.w * (0.2 + 0.6 * ((k * 37) % 40) / 40), y = pt.r.y + pt.r.h * (0.2 + 0.6 * ((k * 23) % 40) / 40);
    await page.touchscreen.tap(x, y); await page.waitForTimeout(150);
    opened = await page.locator('#panel-perks .pf-card:not([hidden])').count() > 0;
  }
  expect(opened, 'a tap on a node opens its card').toBe(true);
  await expect(page.locator('#panel-perks .pf-card .tip-title')).not.toBeEmpty();
  await page.screenshot({ path: join(SHOTS, '67-perk-card-phone.png') });
  await page.locator('#panel-perks .pf-card button', { hasText: 'Close' }).tap();
  await expect(page.locator('#panel-perks .pf-card')).toBeHidden();
  await ctx.close();
});
