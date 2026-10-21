// The experiments home page: drawn from data/experiments.json, grouped, searchable, and Thousandvale has two
// separate buttons (this network / the public link). Screenshots land in test-results/home-*.png.
import { test, expect } from '@playwright/test';
const SHOTS = process.env.SHOT_DIR || 'test-results';      // another run empties test-results; point this elsewhere to keep them

test('home page: groups, every card, search, status filter, working links', async ({ page, request }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('');
  await page.waitForFunction(() => !!window.homePage);
  const total = await page.evaluate(() => window.homePage.data.entries.length);
  expect(await page.locator('.xcard').count()).toBe(total);
  expect(await page.locator('.home-group h2').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('Characters & gear'), expect.stringContaining('World'), expect.stringContaining('Sound & language'), expect.stringContaining('Systems'), expect.stringContaining('Prototypes')]));
  // every card states its status, and no button sits inside a link
  expect(await page.locator('.xcard:not(:has(.xcard-head .badge))').count()).toBe(0);
  expect(await page.locator('a a, a button').count()).toBe(0);
  await expect(page.locator('#card-avatar-3d')).toContainText('Part deprecated');
  await expect(page.locator('#card-combined .badge.bad')).toHaveText(/Deprecated/);

  // every page link on the page answers
  const hrefs = await page.$$eval('.xcard-actions a:not([data-role])', as => [...new Set(as.map(a => a.getAttribute('href')))]);
  expect(hrefs.length).toBeGreaterThan(40);
  for (const h of hrefs) { const r = await request.get(h); expect(r.status(), h).toBe(200); }

  await page.screenshot({ path: `${SHOTS}/home-desktop.png`, fullPage: true });

  await page.fill('#home-search', 'sword dagger');
  await expect(page.locator('#card-armory')).toBeVisible();
  expect(await page.locator('.xcard').count()).toBeLessThan(5);
  expect(page.url()).toContain('#q=sword');
  await page.fill('#home-search', 'zzzz-nothing');
  await expect(page.locator('#home-empty')).toBeVisible();
  await page.fill('#home-search', '');
  await page.click('#home-status .chip[data-status="deprecated"]');
  const dep = await page.$$eval('.xcard', els => els.map(e => e.dataset.id));
  expect(dep).toEqual(expect.arrayContaining(['avatar-3d', 'combined']));
  expect(dep.length).toBeLessThan(6);
  await page.click('#home-status .chip[data-status="all"]');
  expect(await page.locator('.xcard').count()).toBe(total);
  expect(errors).toEqual([]);
});

test('home page: Thousandvale has a network button and a separate live link; no network button on the public site', async ({ page }) => {
  await page.goto('');
  await page.waitForFunction(() => !!window.homePage);
  const card = page.locator('#card-thousandvale');
  await expect(card.locator('h3')).toHaveText('Thousandvale');
  const net = card.locator('a[data-role="network"]'), live = card.locator('a[data-role="live"]');
  await expect(net).toHaveText('Play on this network');
  expect(await net.getAttribute('href')).toBe('http://localhost:8490/prototypes/thousandvale/');
  await expect(live).toHaveText('Live link');
  const stored = await page.evaluate(() => window.homePage.live.thousandvale.url);
  expect(await live.getAttribute('href')).toBe(stored);
  expect(stored).toMatch(/^https:\/\//);
  await expect(card).toContainText('Hosted on games.radgh.com');   // the tunnel caveat went when the droplet replaced it (2026-10-14)
  expect(await card.evaluate(el => el.tagName)).toBe('ARTICLE');       // the card itself is not a link

  // the same page as GitHub Pages would draw it
  const pub = await page.evaluate(async () => {
    const { mount } = await import('./js/home.js');
    const root = document.createElement('div'); document.body.append(root);
    await mount(root, { hostname: 'radgh.github.io' });
    const c = root.querySelector('[data-id="thousandvale"]');
    return { network: !!c.querySelector('[data-role="network"]'), live: c.querySelector('[data-role="live"]')?.href };
  });
  expect(pub.network).toBe(false);
  expect(pub.live).toBe(stored);
});

test('home page at phone width: one column, nothing wider than the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('');
  await page.waitForFunction(() => !!window.homePage);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(1);
  const xs = await page.$$eval('.xcard', els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().left)))]);
  expect(xs.length).toBe(1);
  await page.locator('#card-thousandvale').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/home-phone.png` });
});
