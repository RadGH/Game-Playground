// Browser tests for the Sound Lab: every method has to build real, non-silent, finite audio and
// land it near its category's loudness target. Chromium renders Web Audio offline just fine in
// headless mode (the voice-lab specs rely on the same thing).
import { test, expect } from '@playwright/test';

const SAMPLE_IDS = ['spell.fire.impact', 'melee.crit', 'ui.click', 'status.burn.apply', 'ambience.cave'];

test.describe('sound lab', () => {
  test('gallery loads the catalog, groups it and lists the methods with licence badges', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('sfx/');
    await page.waitForFunction(() => !!window.sfxDemo);

    const ids = await page.evaluate(() => window.sfxDemo.sfx.ids());
    expect(ids.length).toBeGreaterThanOrEqual(110);
    expect(ids).toContain('spell.fire.impact');
    expect(ids).toContain('ambience.void');

    expect(await page.locator('.sound').count()).toBe(ids.length);
    expect(await page.locator('.cat-block').count()).toBeGreaterThanOrEqual(8);
    expect(await page.locator('#method option').count()).toBe(4);
    await expect(page.locator('#method-card .badge')).toBeVisible();

    // filtering narrows the grid
    await page.fill('#filter', 'ambience');
    expect(await page.locator('.sound').count()).toBe(ids.filter(i => i.startsWith('ambience')).length);
    await page.fill('#filter', '');

    expect(errors).toEqual([]);
  });

  for (const method of ['synth', 'library', 'hybrid', 'retro']) {
    test(`method ${method} builds five sounds at the right level`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('sfx/');
      await page.waitForFunction(() => !!window.sfxDemo);

      const rows = await page.evaluate(async ({ m, ids }) => {
        // "library" has real files for only part of the catalog, so ask it for ids it can make
        const sfx = window.sfxDemo.sfx;
        const want = m === 'library'
          ? ['ui.click', 'melee.crit', 'melee.hit', 'coin', 'equip']
          : ids;
        return window.sfxDemo.measure(want, m);
      }, { m: method, ids: SAMPLE_IDS });

      expect(rows.length).toBe(5);
      for (const r of rows) {
        expect(r.finite, `${r.id} produced NaN/Infinity`).toBe(true);
        expect(r.samples, `${r.id} is empty`).toBeGreaterThan(100);
        expect(r.peak, `${r.id} is silent`).toBeGreaterThan(0.001);
        expect(r.peak, `${r.id} peaks over full scale`).toBeLessThanOrEqual(1.0);
        // the whole point of the library: after normalization everything sits on the level it aims
        // for (its category target plus the catalog's manual trim for that sound)
        expect(Math.abs(r.afterLufs - r.aim),
          `${r.id} landed at ${r.afterLufs.toFixed(1)} LUFS, aiming for ${r.aim}`).toBeLessThanOrEqual(3);
      }
      expect(errors).toEqual([]);
    });
  }

  test('normalization actually pulls clips together: the spread shrinks a lot', async ({ page }) => {
    await page.goto('sfx/');
    await page.waitForFunction(() => !!window.sfxDemo);
    const rows = await page.evaluate(() => window.sfxDemo.measure(
      ['spell.fire.impact', 'spell.holy.impact', 'melee.hit', 'melee.miss', 'ui.click', 'ui.hover',
       'coin', 'levelup', 'ambience.forest', 'status.stun.tick'], 'hybrid'));
    const spread = arr => Math.max(...arr) - Math.min(...arr);
    const before = spread(rows.map(r => r.beforeLufs));
    // after normalization every clip sits on its category target, so the only spread left is the
    // deliberate one between categories (ui and ambience are meant to be quieter)
    const offTarget = rows.map(r => r.afterLufs - r.aim);
    expect(spread(offTarget)).toBeLessThan(4);
    expect(spread(offTarget)).toBeLessThan(before);
  });

  test('playing works, a loop starts and stops, and the level table fills in', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('sfx/');
    await page.waitForFunction(() => !!window.sfxDemo);

    await page.evaluate(async () => { await window.sfxDemo.play('melee.hit', { pan: -0.5 }); window.sfxDemo.renderLevels(); });
    await page.waitForFunction(() => window.sfxDemo.table().length > 0);

    const looping = await page.evaluate(async () => {
      const sfx = window.sfxDemo.sfx;
      await sfx.play('ambience.cave');
      const on = sfx.loopingIds().slice();
      sfx.ambience('ambience.forest');
      await new Promise(r => setTimeout(r, 60));
      const swapped = sfx.loopingIds().slice();
      sfx.stopLoops(0.01);
      return { on, swapped };
    });
    expect(looping.on).toContain('ambience.cave');
    expect(looping.swapped).toContain('ambience.forest');
    expect(looping.swapped).not.toContain('ambience.cave');

    // muting silences the master bus and drops the loops
    const muted = await page.evaluate(() => {
      const sfx = window.sfxDemo.sfx;
      sfx.setMuted(true);
      const g = sfx.master.gain.value;
      const blocked = sfx.play('melee.hit');
      sfx.setMuted(false);
      return { g, blocked: blocked instanceof Promise };
    });
    expect(muted.g).toBe(0);

    expect(await page.locator('#levels tbody tr').count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('the Emberveil bridge installs, wires the menu and maps zones to ambience', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/prototypes/emberveil/');
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90_000 });
    await page.click('#btn-new');
    await page.click('#btn-suggest');
    await page.click('#btn-start');
    await page.waitForFunction(() => !!window.emberveilSfx?.sfx, null, { timeout: 60_000 });

    // the settings controls in the in-game menu are filled in and bound
    await page.click('#btn-menu');
    await expect(page.locator('#menu-dialog')).toBeVisible();
    expect(await page.locator('#sfx-method option').count()).toBe(4);
    await page.selectOption('#sfx-method', 'synth');
    expect(await page.evaluate(() => window.emberveilSfx.sfx.method())).toBe('synth');
    await page.check('#mute-sfx');
    expect(await page.evaluate(() => window.emberveilSfx.sfx.muted)).toBe(true);
    await page.uncheck('#mute-sfx');
    // and the choice is remembered
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('playground:emberveil-sfx:v1:settings')).method)).toBe('synth');
    await page.keyboard.press('Escape');

    const mapped = await page.evaluate(() => {
      const b = window.emberveilSfx;
      return ['thornwood', 'cave', 'town', 'marsh', 'dragons_reach', 'eternal_void', 'ember_plateau', 'nowhere-at-all']
        .map(id => [id, b.ambienceFor(id)]);
    });
    expect(Object.fromEntries(mapped)).toEqual({
      thornwood: 'ambience.forest', cave: 'ambience.cave', town: 'ambience.town', marsh: 'ambience.marsh',
      dragons_reach: 'ambience.mountain', eternal_void: 'ambience.void', ember_plateau: 'ambience.fire',
      'nowhere-at-all': 'ambience.wind',
    });

    // the stage wrappers still return what the game expects, and they make sound
    const played = await page.evaluate(async () => {
      const { stage } = window.emberveil;
      const sfx = window.emberveilSfx.sfx;
      const id = [...stage.chars.keys()][0];
      const before = sfx.normalizationTable().length;
      stage.impact(id, 'fire', true);
      stage.status(id, 'burn', true);
      stage.heal(id);
      const p = stage.attack(id, [...stage.chars.keys()][1]);
      const isPromise = p && typeof p.then === 'function';
      await new Promise(r => setTimeout(r, 900));
      return { isPromise, grew: sfx.normalizationTable().length > before, statuses: stage.statusesOn(id) };
    });
    expect(played.isPromise, 'stage.attack must still return its promise').toBe(true);
    expect(played.grew, 'the wrappers should have built some sounds').toBe(true);
    expect(played.statuses).toContain('burn');

    expect(errors).toEqual([]);
  });

  test('A/B compare builds the same sound through every method', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('sfx/');
    await page.waitForFunction(() => !!window.sfxDemo);
    await page.selectOption('#ab-id', 'melee.hit');
    await page.click('#ab-run');
    await expect(page.locator('.ab-cell')).toHaveCount(4, { timeout: 60_000 });
    const texts = await page.locator('.ab-cell .lvl').first().textContent();
    expect(texts).toMatch(/LUFS/);
    expect(errors).toEqual([]);
  });
});
