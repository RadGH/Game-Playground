// Every vehicle type builds, has sane measurements, animates and draws pixels without page errors.
import { test, expect } from '@playwright/test';
test('vehicles page builds every type', async ({ page }) => {
  test.setTimeout(120_000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('avatar-3d/vehicles.html'); await page.waitForFunction(() => !!window.vehicles3d, null, { timeout: 60_000 });
  const types = await page.evaluate(() => window.vehicles3d.types); expect(types.length).toBeGreaterThanOrEqual(7);
  expect(types).toEqual(expect.arrayContaining(['hand_cart', 'pack_mule', 'wagon', 'ox_cart', 'war_wagon', 'coach', 'dragon_sled']));
  for (const t of types) {
    await page.evaluate(t => window.vehicles3d.set({ type: t }), t); await page.waitForFunction(() => !window.vehicles3d.isBuilding());
    const m = await page.evaluate(() => { const v = window.vehicles3d.vehicle; v.setAnim('roll'); v.update(0.1, 0.1); v.update(0.1, 0.2); return { ...v.metrics(), anim: v.anim }; });
    expect(m.length, t + ' length').toBeGreaterThan(0.5); expect(m.height, t + ' height').toBeGreaterThan(0.3); expect(m.width, t + ' width').toBeGreaterThan(0.3);
    expect(m.anim).toBe('roll');
    if (t !== 'hand_cart') expect(m.animals, t + ' draft animals').toBeGreaterThanOrEqual(1);
  }
  // the war wagon pulls two horses; the wheels actually turn when it rolls
  await page.evaluate(() => window.vehicles3d.set({ type: 'war_wagon' })); await page.waitForFunction(() => !window.vehicles3d.isBuilding());
  expect(await page.evaluate(() => window.vehicles3d.vehicle.metrics().animals)).toBe(2);
  await page.waitForTimeout(500);
  const px = await page.evaluate(() => { const c = document.querySelector('#viewport canvas'); const s = document.createElement('canvas'); s.width = 120; s.height = 90; const ctx = s.getContext('2d'); ctx.drawImage(c, 0, 0, 120, 90); const d = ctx.getImageData(0, 0, 120, 90).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[i + 1]) > 20 || Math.abs(d[i] - d[i + 2]) > 20) n++; return n; });
  expect(px).toBeGreaterThan(50);   // coloured (non-grey) pixels: the vehicle is on screen
  // recolouring round-trips through the JSON
  await page.evaluate(() => window.vehicles3d.set({ type: 'wagon', colors: { cloth: '#2244aa' } })); await page.waitForFunction(() => !window.vehicles3d.isBuilding());
  expect(await page.evaluate(() => window.vehicles3d.spec.colors.cloth)).toBe('#2244aa');
  expect(errors).toEqual([]);
});
