// Playwright (headless WebGL via SwiftShader): both modes build, draw something, animate, and snapshots are saved.
import { test, expect } from '@playwright/test';
test.describe('avatar-3d', () => {
  test.setTimeout(120_000);
  async function waitBuilt(page, contains) { await expect(page.locator('#status')).toContainText(contains, { timeout: 90_000 }); await page.waitForTimeout(600); }
  async function drawnPixels(page) {
    return page.evaluate(() => { const c = document.querySelector('#viewport canvas'); const s = document.createElement('canvas'); s.width = 160; s.height = 120; const ctx = s.getContext('2d'); ctx.drawImage(c, 0, 0, 160, 120); const d = ctx.getImageData(0, 0, 160, 120).data; let skin = 0, drawn = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (r > 150 && g > 100 && b < 160 && r > b + 30) skin++; if (Math.abs(r - 30) + Math.abs(g - 33) + Math.abs(b - 40) > 60) drawn++; } return { skin, drawn, w: c.width, h: c.height }; });
  }
  test('mii mode renders a character with skin-coloured pixels and animates', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('avatar-3d/'); await page.waitForFunction(() => !!window.avatar3d, null, { timeout: 60_000 }); await page.evaluate(() => window.avatar3d.setMode('mii')); await waitBuilt(page, 'Chibi');
    const px = await drawnPixels(page); expect(px.w).toBeGreaterThan(100); expect(px.skin).toBeGreaterThan(50);
    await page.screenshot({ path: 'test-results/avatar-3d-mii.png' });
    const moved = await page.evaluate(async () => { const c = window.avatar3d.character; c.setAnim('walk'); const g = c.group; const before = g.children[0].children[0].rotation.x; await new Promise(r => setTimeout(r, 400)); return g.children[0].children[0].rotation.x !== before; });
    expect(moved).toBe(true);
    // all presets build without throwing
    const bad = await page.evaluate(async () => { const out = []; const { createMiiCharacter } = await import('./js/mii.js'); const data = await (await fetch('../avatar-2d/data/presets.json')).json(); for (const p of data.presets) { try { const c = await createMiiCharacter(p.avatar); c.dispose(); } catch (e) { out.push(p.id + ': ' + e.message); } } return out; });
    expect(bad).toEqual([]);
    expect(errors).toEqual([]);
  });
  test('quaternius mode loads meshes, plays a clip, scales bones', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('avatar-3d/'); await page.waitForFunction(() => !!window.avatar3d, null, { timeout: 60_000 }); await page.evaluate(() => window.avatar3d.setMode('quaternius')); await waitBuilt(page, 'Quaternius');
    const info = await page.evaluate(async () => { const c = window.avatar3d.character; c.setAnim('Walk_Loop'); await new Promise(r => setTimeout(r, 900)); let meshes = 0; c.group.traverse(o => { if (o.isSkinnedMesh) meshes++; }); const head = c.group.getObjectByName('Head'); return { parts: c.group.children.length, meshes, anim: c.anim, mixerTime: c.mixers[0].time, headScale: head?.scale.x }; });
    expect(info.meshes).toBeGreaterThan(3); expect(info.anim).toBe('Walk_Loop'); expect(info.mixerTime).toBeGreaterThan(0.05);
    const px = await drawnPixels(page); expect(px.drawn).toBeGreaterThan(800); // the trimmed body leaves little bare skin, so check the character is drawn at all
    await page.screenshot({ path: 'test-results/avatar-3d-quaternius.png' });
    await page.evaluate(() => { const a = window.avatar3d.avatar; a.body.height = 1; a.body.width = 1; a.body.frame = 'f'; a.top.id = 'plate'; a.hat.id = 'hood'; window.avatar3d.set(a); });
    await page.waitForTimeout(300); await page.waitForFunction(() => !window.avatar3d.isBuilding(), null, { timeout: 90_000 }); await page.waitForTimeout(300);
    const scaled = await page.evaluate(() => { const c = window.avatar3d.character; const t = c.group.getObjectByName('thigh_l'); return { thigh: t?.scale.y, y: c.group.position.y }; });
    expect(scaled.thigh).toBeGreaterThan(1.1); expect(scaled.y).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/avatar-3d-quaternius-tall.png' });
    expect(errors).toEqual([]);
  });
});
