// Playwright (headless WebGL via SwiftShader): the archived Chibi 1 page builds, draws something, animates, and snapshots are saved.
// (Quaternius mode was removed 2026-10-21; Chibi 2.5 on the main page is covered by chibi2.spec.js.)
import { test, expect } from '@playwright/test';
test.describe('avatar-3d', () => {
  test.setTimeout(120_000);
  async function waitBuilt(page, contains) { await expect(page.locator('#status')).toContainText(contains, { timeout: 90_000 }); await page.waitForTimeout(600); }
  async function drawnPixels(page) {
    return page.evaluate(() => { const c = document.querySelector('#viewport canvas'); const s = document.createElement('canvas'); s.width = 160; s.height = 120; const ctx = s.getContext('2d'); ctx.drawImage(c, 0, 0, 160, 120); const d = ctx.getImageData(0, 0, 160, 120).data; let skin = 0, drawn = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 150 && g > 100 && b < 160 && r > b + 30) skin++; if (Math.abs(r - 30) + Math.abs(g - 33) + Math.abs(b - 40) > 60) drawn++; } return { skin, drawn, w: c.width, h: c.height }; });
  }
  test('archived Chibi 1 page renders a character with skin-coloured pixels and animates', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('avatar-3d/chibi1.html'); await page.waitForFunction(() => !!window.chibi1, null, { timeout: 60_000 }); await waitBuilt(page, 'Chibi 1');
    const px = await drawnPixels(page); expect(px.w).toBeGreaterThan(100); expect(px.skin).toBeGreaterThan(50);
    await page.screenshot({ path: 'test-results/avatar-3d-mii.png' });
    const moved = await page.evaluate(async () => { const c = window.chibi1.character; c.setAnim('walk'); const g = c.group; const before = g.children[0].children[0].rotation.x; await new Promise(r => setTimeout(r, 400)); return g.children[0].children[0].rotation.x !== before; });
    expect(moved).toBe(true);
    // all presets build without throwing
    const bad = await page.evaluate(async () => { const out = []; const { createMiiCharacter } = await import('./js/mii.js'); const data = await (await fetch('../avatar-2d/data/presets.json')).json(); for (const p of data.presets) { try { const c = await createMiiCharacter(p.avatar); c.dispose(); } catch (e) { out.push(p.id + ': ' + e.message); } } return out; });
    expect(bad).toEqual([]);
    expect(errors).toEqual([]);
  });
});
