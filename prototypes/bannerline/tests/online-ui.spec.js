// Online UI (stream B over stream D's net): two pages of one browser over BroadcastChannel
// (?net=channel). Host Online -> mode -> room code; the guest types the code; both sit with Enter and
// ready with Enter; the host starts by itself; both play the same match; a surrender ends it; the
// host's "Back to the lobby" brings both machines back to the room with their seats kept.
import { test, expect } from '@playwright/test';

// Capsule bodies + the plain vale: two WebGL pages with the full art are too slow for headless
// software rendering, and this test is about the network UI, not the art.
const URL = 'prototypes/bannerline/?net=channel&speed=2&seed=21&bodies=capsule&world=plain';

async function open(context) {
  const page = await context.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('bannerline.onboarded.v1', '1'); } catch { /* */ } });
  await page.goto(URL);
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  return page;
}

test('host + guest by room code -> match on both -> results -> back to the room', async ({ browser }) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const host = await open(context);
  const guest = await open(context);
  for (const p of [host, guest]) p.on('pageerror', (e) => errors.push(e.message));

  await host.click('[data-act="host"]');
  await expect(host.locator('#screen-modes')).toBeVisible();
  await host.click('.md-card.ready');
  await expect(host.locator('#screen-netroom')).toBeVisible({ timeout: 15_000 });
  const code = (await host.locator('.nr-code b').textContent()).trim();
  expect(code).toMatch(/^[A-Z]{5}$/);

  await guest.click('[data-act="join"]');
  await expect(guest.locator('#screen-netjoin')).toBeVisible();
  await guest.fill('.nj-input', code);
  await guest.click('.nj-go');
  await expect(guest.locator('#screen-netroom')).toBeVisible({ timeout: 15_000 });
  await expect(guest.locator('.nr-code b')).toHaveText(code);

  // Sit (Enter) and ready (Enter) on both machines.
  await host.locator('body').press('Enter');
  await expect(host.locator('.lb-slot.mine')).toHaveCount(1);
  await guest.locator('body').press('Enter');
  await expect(guest.locator('.lb-slot.mine')).toHaveCount(1);
  await expect(host.locator('.lb-slot.local')).toHaveCount(2);     // the host sees the guest's seat
  await host.locator('body').press('Enter');
  await guest.locator('body').press('Enter');
  await expect(host.locator('.lb-slot.local.ready')).toHaveCount(2, { timeout: 10_000 });
  await expect(host.locator('#screen-match')).toBeVisible({ timeout: 20_000 });
  await expect(guest.locator('#screen-match')).toBeVisible({ timeout: 20_000 });

  const info = (p) => p.evaluate(() => { const m = window.bannerline.match; const v = m.views[0]; return { tick: m.sim.tick, player: v.player, team: v.myTeam, online: !!m.net }; });
  await expect.poll(async () => (await info(host)).tick, { timeout: 30_000 }).toBeGreaterThan(60);
  await expect.poll(async () => (await info(guest)).tick, { timeout: 30_000 }).toBeGreaterThan(60);
  const hi = await info(host), gi = await info(guest);
  expect(hi.online && gi.online).toBe(true);
  expect(hi.player).not.toBe(gi.player);
  expect(hi.team).not.toBe(gi.team);

  // The guest surrenders through the pause menu (online the match keeps running behind it).
  await guest.locator('body').press('Escape');
  await expect(guest.locator('.pause-menu')).toBeVisible();
  await guest.click('.pause-menu [data-act="surrender"]');
  await expect(host.locator('#screen-results')).toBeVisible({ timeout: 20_000 });
  await expect(guest.locator('#screen-results')).toBeVisible({ timeout: 20_000 });
  await expect(host.locator('.result-word')).toHaveText('Victory');
  await expect(guest.locator('.result-word')).toHaveText('Defeat');
  await expect(host.locator('[data-act="rematch"]')).toHaveCount(0);

  await host.waitForTimeout(700);
  await host.click('[data-act="lobby"]');
  await expect(host.locator('#screen-netroom')).toBeVisible();
  await expect(guest.locator('#screen-netroom')).toBeVisible({ timeout: 15_000 });
  await expect(guest.locator('.lb-slot.mine')).toHaveCount(1);
  expect(errors).toEqual([]);
  await context.close();
});

// Rejoin after a reload: token in sessionStorage, title button, rejoin -> snapshot -> view. The lockstep
// sends the match's age (not the host's clock) and recomputes the guest's own players on rejoin.
test('rejoin after a reload puts the guest back in its seat', async ({ browser }) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const host = await open(context), guest = await open(context);
  await host.click('[data-act="host"]'); await host.click('.md-card.ready[data-mode="linewar"]');
  await expect(host.locator('#screen-netroom')).toBeVisible({ timeout: 15_000 });
  const code = (await host.locator('.nr-code b').textContent()).trim();
  await guest.click('[data-act="join"]'); await guest.fill('.nj-input', code); await guest.click('.nj-go');
  await expect(guest.locator('#screen-netroom')).toBeVisible({ timeout: 15_000 });
  for (const p of [host, guest]) await p.locator('body').press('Enter');
  await expect(host.locator('.lb-slot.local')).toHaveCount(2);
  for (const p of [host, guest]) await p.locator('body').press('Enter');
  await expect(guest.locator('#screen-match')).toBeVisible({ timeout: 20_000 });
  const info = (p) => p.evaluate(() => { const m = window.bannerline.match; const v = m.views[0]; return { tick: m.sim.tick, player: v.player, kind: m.sim.state.players[v.player].kind }; });
  const gi = await info(guest);
  // The guest reloads mid-match: the title offers "Rejoin your match", which puts it back in.
  await guest.reload();
  await expect(guest.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await expect(guest.locator('[data-act="rejoin"]')).toBeVisible({ timeout: 10_000 });
  await guest.click('[data-act="rejoin"]');
  await expect(guest.locator('#screen-match')).toBeVisible({ timeout: 30_000 });
  const t0 = (await info(guest)).tick;
  await expect.poll(async () => (await info(guest)).tick, { timeout: 30_000 }).toBeGreaterThan(t0 + 20);
  expect((await info(guest)).player).toBe(gi.player);

  await expect.poll(async () => (await info(guest)).kind, { timeout: 20_000 }).toBe('human');
  await context.close();
});
