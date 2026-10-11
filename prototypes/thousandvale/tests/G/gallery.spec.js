// Stream G (play-test 5, T26) — every scene of the interface gallery, in every device frame, in a real browser.
// No game server: the gallery runs the game's interface on recorded data, served by the playground's static dev server.
//
// For each scene x frame it FAILS on: a console error or page error, a scene that did not reach its state (the stage's own
// report), nothing mounted, text reading "undefined" / "[object Object]" / "NaN" / a long float — and, in the PROPOSED
// phone layout, any control you can press that is smaller than 44 x 44 px or pokes out of the safe area. For the phone
// frames' CURRENT layout (the game today on a phone-sized screen) the same count is REPORTED, not failed: that is the
// case for the proposal. A picture of every scene is saved under tests/G/shots/<frame>/<scene>.png, so an interface
// change shows up in review as a changed mockup.
//
// Run (shared browser lock):
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/G/gallery.spec.js
// One frame only:  G_FRAME=phone-l npx playwright test …      one scene only:  G_SCENE=perks   (or several: G_SCENE=perks,map)
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SCENES, DEVICES, sceneFits } from '../../js/client/gallery/scenes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, process.env.G_SHOTS_SUFFIX ? 'shots' + process.env.G_SHOTS_SUFFIX : 'shots');      // G_SHOTS_SUFFIX=-webkit with --browser=webkit: its own folder, so Chromium's pictures of record stay
const BASE = 'prototypes/thousandvale/';
const BAD = /undefined|\[object |NaN\b|\d\.\d{4,}/;
test.describe.configure({ mode: 'serial' });

/** The passes: a frame in a layout. `strict` = the 44 px / safe-area rules must hold. */
const PASSES = [
  { device: 'desktop', layout: 'current' },
  { device: 'laptop', layout: 'current' },
  { device: 'pad', layout: 'proposed' },
  { device: 'phone-l', layout: 'proposed', strict: true },
  { device: 'phone-p', layout: 'proposed', strict: true },
  { device: 'phone-l', layout: 'current', count: true },
  { device: 'phone-p', layout: 'current', count: true },
].filter(p => !process.env.G_FRAME || process.env.G_FRAME === p.device);
const EXTRA = [   // variant B: only where it differs (the fight HUD on its side)
  { device: 'phone-l', layout: 'proposed', variant: 'b', strict: true, scenes: ['hud', 'hud-heal', 'fish-bite'] },
].filter(p => !process.env.G_FRAME || process.env.G_FRAME === p.device);

/** In the page: every control you can press that is on screen, with its box. */
function touchAudit(safe) {
  const SEL = 'button, a[href], input, select, textarea, [role="tab"], [role="radio"], [role="button"], [role="menuitem"], [tabindex]:not([tabindex="-1"]), .islot:not(.empty), .pmember, .slot:not(.empty), .loot-row, .interact';
  const vw = innerWidth, vh = innerHeight, small = [], unsafe = [];
  let n = 0;
  /** Inside something that scrolls? Then it can be brought clear of the edges; only what is pinned is judged against the safe area. */
  const scrolls = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if ((/auto|scroll/.test(c.overflowY) && p.scrollHeight > p.clientHeight + 2) || (/auto|scroll/.test(c.overflowX) && p.scrollWidth > p.clientWidth + 2)) return true; } return false; };
  const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '')) + (e.textContent ? ` "${e.textContent.trim().slice(0, 18)}"` : '');
  for (const el0 of document.querySelectorAll(SEL)) {
    if (el0.closest('.gallery-device, .gallery-pick, .gallery-sheet, [hidden], [aria-hidden="true"]') || el0.disabled) continue;
    // a checkbox or radio is pressed through its label: measure that
    let el = el0;
    if (el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label')) el = el.closest('label');
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || +cs.opacity === 0) continue;
    const cx = Math.max(0, Math.min(vw - 1, r.left + r.width / 2)), cy = Math.max(0, Math.min(vh - 1, r.top + r.height / 2));
    if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    const top = document.elementFromPoint(cx, cy);
    if (!top || !(el.contains(top) || top.contains(el) && top.matches(SEL))) continue;      // covered or scrolled away: not pressable right now
    // a control nested in a bigger one (an × inside a row) counts on its own
    n++;
    if (r.width < 43.5 || r.height < 43.5) small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (!scrolls(el) && (r.left < safe.left - 0.5 || r.top < safe.top - 0.5 || r.right > vw - safe.right + 0.5 || r.bottom > vh - safe.bottom + 0.5)) unsafe.push(`${name(el)} at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return { n, small, unsafe };
}

const report = {};
for (const pass of [...PASSES, ...EXTRA]) {
  const dev = DEVICES.find(d => d.id === pass.device);
  const label = `${pass.device}-${pass.layout}${pass.variant ? '-' + pass.variant : ''}`;
  test(`${label}: every scene mounts clean${pass.strict ? ', every control is 44 px and inside the safe area' : ''}`, async ({ browser }) => {
    test.setTimeout(900000);
    const dir = join(SHOTS, label); mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, hasTouch: !!dev.phone });
    const page = await ctx.newPage();
    let errs = [];
    page.on('pageerror', e => errs.push('page error: ' + e.message.split('\n')[0]));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|404/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
    const scenes = SCENES.filter(s => sceneFits(s, pass.device) && !(pass.layout === 'current' && s.proposedOnly) && (!pass.scenes || pass.scenes.includes(s.id)) && (!process.env.G_SCENE || process.env.G_SCENE.split(',').includes(s.id)));
    const failures = [], counts = { scenes: 0, controls: 0, small: 0, unsafe: 0, worst: [] };
    for (const s of scenes) {
      errs = [];
      const q = new URLSearchParams({ scene: s.id, device: pass.device, layout: pass.layout, freeze: '1', ...(pass.variant ? { variant: pass.variant } : {}) });
      await page.goto(BASE + 'ui-gallery-frame.html?' + q);
      const ok = await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 45000 }).then(() => true, () => false);
      if (!ok) { failures.push(`${s.id}: never became ready (${await page.evaluate(() => (window.__gallery?.errors || []).join(' | '))})`); continue; }
      await page.waitForTimeout(450);
      const st = await page.evaluate(() => ({ errors: window.__gallery.errors, text: window.gallery.text(), mounted: !!document.querySelector('#hud:not([hidden]), #title:not([hidden])') }));
      await page.screenshot({ path: join(dir, s.id + '.png') });
      counts.scenes++;
      for (const e of [...st.errors, ...errs]) failures.push(`${s.id}: ${e}`);
      if (!st.mounted || st.text.replace(/\s+/g, '').length < 20) failures.push(`${s.id}: nothing mounted`);
      const m = st.text.match(BAD);
      if (m) failures.push(`${s.id}: text reads "${st.text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ')}"`);
      if (dev.phone) {
        const a = await page.evaluate(touchAudit, dev.safe);
        counts.controls += a.n; counts.small += a.small.length; counts.unsafe += a.unsafe.length;
        if (pass.strict) { for (const x of a.small.slice(0, 6)) failures.push(`${s.id}: smaller than 44 px — ${x}`); for (const x of a.unsafe.slice(0, 6)) failures.push(`${s.id}: outside the safe area — ${x}`); }
        else if (a.small.length + a.unsafe.length) counts.worst.push(`${s.id}: ${a.small.length} small, ${a.unsafe.length} outside the safe area`);
      }
    }
    await ctx.close();
    report[label] = counts;
    if (dev.phone) console.log(`[gallery] ${label}: ${counts.scenes} scenes, ${counts.controls} controls on screen, ${counts.small} smaller than 44 px, ${counts.unsafe} outside the safe area`);
    else console.log(`[gallery] ${label}: ${counts.scenes} scenes`);
    test.info().annotations.push({ type: 'gallery', description: JSON.stringify({ ...counts, worst: counts.worst.slice(0, 8) }) });
    writeFileSync(join(SHOTS, 'report.json'), JSON.stringify(report, null, 2));
    expect(failures, failures.join('\n')).toEqual([]);
    expect(counts.scenes).toBe(scenes.length);
  });
}

test('the gallery page itself: scene list, device frames, deep links, notes', async ({ browser }) => {
  test.setTimeout(120000);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + 'ui-gallery.html#scene=perks&device=phone-l&layout=proposed');
  await expect(page.locator('.g-list a.on')).toHaveText('Perk forest');
  await expect(page.locator('#g-devices [aria-selected="true"]')).toContainText('Phone');
  await expect(page.locator('#g-layout [aria-selected="true"]')).toHaveText('Proposed');
  const frame = page.frameLocator('#g-iframe');
  await expect(frame.locator('#panel-perks canvas')).toBeVisible({ timeout: 45000 });
  await expect(frame.locator('.gallery-device .gd-island')).toBeVisible();
  expect(await page.locator('#g-iframe').evaluate(f => [f.clientWidth, f.clientHeight])).toEqual([852, 393]);
  await expect(page.locator('#n-notes')).toContainText('pinch');
  expect(await page.locator('#n-modules a').count()).toBeGreaterThan(0);
  expect(await page.locator('.g-list a').count()).toBe(SCENES.length);
  await page.screenshot({ path: join(SHOTS, 'gallery-page-phone.png') });
  // another scene, another frame: the address follows, the frame reloads at the new size
  await page.locator('.g-list a', { hasText: 'Bag and paper doll' }).click();
  await page.locator('#g-devices button', { hasText: 'Desktop' }).click();
  await expect(page).toHaveURL(/#scene=bag&device=desktop/);
  await expect(page.frameLocator('#g-iframe').locator('#bag:not([hidden]) #bag-grid')).toBeVisible({ timeout: 45000 });
  expect(await page.locator('#g-iframe').evaluate(f => [f.clientWidth, f.clientHeight])).toEqual([1920, 1080]);
  await page.screenshot({ path: join(SHOTS, 'gallery-page-desktop.png') });
  expect(errs).toEqual([]);
  await ctx.close();
});

test('V9 (owner feedback 7): on a phone held upright, a real TAP on the bag\'s Stats button brings the Character window up on top', async ({ browser }) => {
  test.setTimeout(120000);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + 'ui-gallery-frame.html?scene=bag&device=phone-p&layout=proposed&freeze=1');
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 45000 });
  await page.locator('#inv-stats').tap();
  await expect(page.locator('#panel-sheet')).toBeVisible();
  const top = await page.evaluate(() => { const e = document.elementFromPoint(196, 420); return e?.closest('#panel-sheet') ? 'sheet' : e?.closest('#bag') ? 'bag' : (e?.id || e?.className); });
  expect(top, 'the Character window is what you see, not the bag under it').toBe('sheet');
  expect(await page.locator('#panel-sheet .sh-row').count()).toBeGreaterThan(5);
  // and the filter row shows every chip (V8)
  await page.locator('.phone-tabs [data-tab="bag"]').tap();
  await expect(page.locator('#bag .inv-filters .chip', { hasText: 'Upgrades' })).toBeVisible();
  const box = await page.locator('#bag .inv-filters .chip', { hasText: 'Upgrades' }).boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(393);
  await ctx.close();
});

test('on a real phone the page shows the scene full-screen with a picker (no frame in a frame)', async ({ browser }) => {
  test.setTimeout(120000);
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + 'ui-gallery.html#scene=bag');
  await page.waitForURL(/ui-gallery-frame\.html\?scene=bag/);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 45000 });
  expect(await page.evaluate(() => [document.documentElement.dataset.layout, document.documentElement.dataset.device])).toEqual(['phone', 'phone-p']);
  await expect(page.locator('.gallery-device')).toHaveCount(0);          // a real phone has its own island
  await page.locator('.gallery-pick').tap();
  await expect(page.locator('.gallery-sheet')).toBeVisible();
  expect(await page.locator('.gallery-sheet .gs-list a').count()).toBe(SCENES.length);
  await page.screenshot({ path: join(SHOTS, 'gallery-on-a-phone.png') });
  await ctx.close();
});
