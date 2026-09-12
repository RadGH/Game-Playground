// Every creature type builds, draws pixels, and animates without page errors.
import { test, expect } from '@playwright/test';
test('creatures page builds all body plans', async ({ page }) => {
  test.setTimeout(120_000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('avatar-3d/creatures.html'); await page.waitForFunction(() => !!window.creatures3d, null, { timeout: 60_000 });
  const types = await page.evaluate(() => window.creatures3d.types); expect(types.length).toBeGreaterThanOrEqual(26);
  for (const t of types) {
    await page.evaluate(t => window.creatures3d.set({ type: t }), t); await page.waitForFunction(() => !window.creatures3d.isBuilding());
    const m = await page.evaluate(() => { const c = window.creatures3d.character; c.setAnim('walk'); c.update(0.1, 0.1); return c.metrics(); });
    expect(m.height).toBeGreaterThan(0.1); expect(m.length).toBeGreaterThan(0.1);
  }
  await page.waitForTimeout(400);
  const px = await page.evaluate(() => { const c = document.querySelector('#viewport canvas'); const s = document.createElement('canvas'); s.width = 120; s.height = 90; const ctx = s.getContext('2d'); ctx.drawImage(c, 0, 0, 120, 90); const d = ctx.getImageData(0, 0, 120, 90).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[i + 1]) > 20 || Math.abs(d[i] - d[i + 2]) > 20) n++; return n; });
  expect(px).toBeGreaterThan(50); // coloured (non-grey) pixels: the creature is on screen
  await page.evaluate(() => window.creatures3d.set({ type: 'dragon', size: 0.5, colors: { body: '#2244aa' }, features: { wings: false } })); await page.waitForFunction(() => !window.creatures3d.isBuilding());
  const spec = await page.evaluate(() => window.creatures3d.spec); expect(spec.colors.body).toBe('#2244aa'); expect(spec.features.wings).toBe(false); expect(spec.features.horns).toBe(true);
  expect(errors).toEqual([]);
});
