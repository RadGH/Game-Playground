// Wildmarch design-bible site: the home page, the markdown viewer, links, search and phone layout.
import { test, expect } from '@playwright/test';

const URL = 'prototypes/wildmarch/';

test('home page draws from canon and lists the docs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await expect(page.locator('.hero h1')).toHaveText('Wildmarch');
  await expect(page.locator('.class-grid a')).toHaveCount(30);
  await expect(page.locator('.band')).toHaveCount(11);
  await expect(page.locator('#nav a[data-id="00-OVERVIEW"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/wildmarch-home.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('the canon renders: headings, tables, anchors and a table of contents', async ({ page }) => {
  await page.goto(URL + '#/doc/00-OVERVIEW');
  await expect(page.locator('.doc h1')).toContainText('WILDMARCH');
  expect(await page.locator('.doc table').count()).toBeGreaterThan(5);
  expect(await page.locator('#toc a').count()).toBeGreaterThan(5);
  // no raw markdown left behind
  const text = await page.locator('.doc').innerText();
  expect(text).not.toMatch(/\*\*|^\|/m);
  // a heading link scrolls to its section
  await page.goto(URL + '#/doc/00-OVERVIEW~6-the-thirty-classes');
  await expect(page.locator('[id="6-the-thirty-classes"]')).toBeInViewport();
  await page.screenshot({ path: 'test-results/wildmarch-doc.png' });
});

test('search finds a line and links to its heading', async ({ page }) => {
  await page.goto(URL + '#/search/shapeshift');
  await expect(page.locator('.result').first()).toBeVisible();
  await page.locator('.result').first().click();
  await expect(page).toHaveURL(/#\/doc\//);
});

test('phone width: no sideways scroll, nav slides in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL + '#/doc/00-OVERVIEW');
  await expect(page.locator('.doc h1')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.locator('#navToggle').click();
  await expect(page.locator('#nav a[data-id="00-OVERVIEW"]')).toBeInViewport();
  await page.screenshot({ path: 'test-results/wildmarch-phone.png' });
});
