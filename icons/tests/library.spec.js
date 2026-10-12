import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('catalog filtering, small previews, accessible SVG export and keyboard details', async ({page}) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/icons/'); await expect(page.locator('.icon-card')).toHaveCount(186);
  await expect(page.locator('#total')).toHaveText('186 icons · 31 classes');
  await page.locator('#batch').selectOption('2'); await expect(page.locator('.icon-card')).toHaveCount(30);
  await page.locator('#class').selectOption('warlock'); await expect(page.locator('.icon-card')).toHaveCount(6);
  await page.locator('#category').selectOption('summon'); await expect(page.locator('.icon-card')).toHaveCount(2);
  await page.locator('#search').fill('fiend'); await expect(page.locator('.icon-card')).toHaveCount(2);
  await page.locator('#size').selectOption('32'); await expect(page.locator('.icon-card svg').first()).toHaveAttribute('width','32');
  await page.locator('[data-icon="bind_imp"]').click(); await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#detail-name')).toHaveText('Bind a Fiend'); await expect(page.locator('#preview svg')).toHaveCount(3);
  const downloadPromise=page.waitForEvent('download'); await page.getByRole('button',{name:'Download SVG'}).click();
  const download=await downloadPromise; expect(download.suggestedFilename()).toBe('bind_imp.svg');
  const text=await readFile(await download.path(),'utf8'); expect(text).toContain('<title>Bind a Fiend</title>'); expect(text).toContain('<desc>');
  expect(await page.evaluate(s=>new DOMParser().parseFromString(s,'image/svg+xml').querySelector('parsererror')?.textContent||null,text)).toBeNull();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('[data-icon="bind_imp"]')).toBeFocused();
  await page.locator('#search').fill('not-a-real-icon'); await expect(page.locator('#empty')).toBeVisible();
  await page.getByRole('button',{name:'Reset',exact:true}).click(); await expect(page.locator('.icon-card')).toHaveCount(186);
  await page.locator('#class').selectOption('starcaller'); await page.reload(); await expect(page.locator('.icon-card')).toHaveCount(6);
  // Parse every exported SVG, including all batches and Starcaller's original paths.
  expect(await page.evaluate(async()=> {
    const {icons,iconSvg}=await import('/icons/js/catalog.js');
    return icons.filter(i=>new DOMParser().parseFromString(iconSvg(i.id,40),'image/svg+xml').querySelector('parsererror')).map(i=>i.id);
  })).toEqual([]);
  expect(errors).toEqual([]);
});

test('phone catalog has no sideways overflow and opens usable details', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/icons/?class=starcaller');
  await expect(page.locator('.icon-card')).toHaveCount(6);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Star Dart — Starcaller',exact:true}).click();
  await expect(page.locator('#download')).toBeInViewport();
  const box=await page.getByRole('dialog').boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(390);
  await page.getByRole('button',{name:'Close icon details'}).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
});
