// The three screens from the 2026-09-19 play-test, in the real page.
//
// The rules behind them are covered by tests/round11-ui.test.js; these are the parts that only
// exist once there is a browser — a key with fifteen little canvases in it, a canvas that has to
// have marks drawn on it, and a Journal row that must no longer do anything when you click it.

import { test, expect } from '@playwright/test';

async function land(page, { seed = 11, cls = 'ranger' } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=${cls}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

// ---------------------------------------------------------------- 4.11 the map key

test('the map has a key, and every mark in it is drawn by the map itself', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => window.farhold.map.toggle(true));
  await page.waitForTimeout(900);

  const out = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.map-key-row')];
    /**
     * A key row shows its mark one of two ways: a drawn swatch (a canvas) for the things the map
     * paints itself, or a glyph (`.map-key-glyph`) for the marker book's own icons, which are
     * characters and not drawings. R16: this counted only the canvases and compared the total
     * against every row, so the eight glyph rows made it fail — and what it is actually for is
     * "no row shows an empty box", which is a rule about the rows that HAVE a swatch.
     */
    const swatched = rows.filter(r => r.querySelector('canvas'));
    const glyphed = rows.filter(r => r.querySelector('.map-key-glyph') && r.querySelector('.map-key-glyph').textContent.trim());
    const inked = swatched.filter(row => {
      const canvas = row.querySelector('canvas');
      const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 8) return true;
      return false;
    }).length;
    return {
      rows: rows.length,
      swatched: swatched.length,
      glyphed: glyphed.length,
      inked,
      groups: [...document.querySelectorAll('.map-key-group')].map(n => n.textContent),
      words: rows.map(n => n.textContent.trim()),
    };
  });

  /**
   * R16 — the numbers, brought up to date, and a rule underneath them.
   *
   * This asked for exactly 16 rows and 4 groups, and the map has had 37 rows and 7 groups for
   * several rounds — so the test has been red for longer than anybody noticed, which makes it worse
   * than no test at all. An exact count is still the right guard (it catches a mark added twice),
   * but the assertions that matter are the rules: every swatch has ink in it, no label appears
   * twice, and no GROUP HEADING appears twice — which it did, because the key emitted a heading
   * every time the group changed while walking a list that does not keep its groups together.
   */
  expect(out.rows, 'the key lists nothing').toBe(37);
  expect(out.inked, 'a swatch in the key is an empty box').toBe(out.swatched);
  expect(out.swatched + out.glyphed, 'a key row shows neither a swatch nor a glyph').toBe(out.rows);
  expect(new Set(out.words).size, `the key lists something twice: ${out.words.filter((w, i) => out.words.indexOf(w) !== i)}`)
    .toBe(out.words.length);
  expect(new Set(out.groups).size, `a group heading appears twice: ${out.groups}`).toBe(out.groups.length);
  expect(out.groups).toEqual(['Beware', 'Settlements', 'Underground', 'Held ground', 'Landmarks', 'Travel', 'Yours']);
  // the two the report asked for by name
  expect(out.words).toEqual(expect.arrayContaining(['capital', 'city', 'town', 'village', 'hamlet', 'dungeon', 'cave']));
  expect(errors).toEqual([]);
});

test('the map draws its own place marks, at every zoom, over the region detail', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => window.farhold.map.toggle(true));
  await page.waitForTimeout(900);

  // the marks are drawn from the world's own places, so count what SHOULD be on screen and then
  // check the canvas changes when the layer is switched off — the pixels are the only proof here
  const out = await page.evaluate(async () => {
    const canvas = document.getElementById('map-canvas');
    const ctx = canvas.getContext('2d');
    const snap = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const before = snap();
    const box = [...document.querySelectorAll('.map-side input[type=checkbox]')]
      .find(i => i.parentElement.textContent.trim().startsWith('nodes'));
    box.click();
    await new Promise(r => setTimeout(r, 400));
    const after = snap();
    let changed = 0;
    for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i]) changed++;
    box.click();
    await new Promise(r => setTimeout(r, 400));
    return { changed, places: (window.farhold.terrain.world.nodes || []).length };
  });

  expect(out.places, 'this world has no places on it').toBeGreaterThan(50);
  expect(out.changed, 'switching the place marks off changed nothing on the map').toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- 4.5 work is not taken off a menu

test('a journal row no longer takes the job, and the notice board still does', async ({ page }) => {
  const errors = await land(page);
  await page.waitForTimeout(1800);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    f.hud.toggleSheet(true);
    f.hud.setTab('journal');
    const rows = [...document.querySelectorAll('#journal-board .job-row')];
    const before = f.questLog.active.length;
    rows[0]?.click();
    // nothing may have been taken, and no button may be offering to
    const afterClick = f.questLog.active.length;
    /**
     * R16 — A BUTTON THAT TAKES WORK, not any button at all.
     *
     * Round 14 gave every journal row with a place a `⌖` locate button, so this counted those and
     * has been red ever since — which is how a test stops being read. What the rule is actually
     * about is that the Journal must not be a shop of quests: nothing in it may ACCEPT one. So it
     * counts the buttons that are not the locate glyph, and still checks that clicking a row takes
     * nothing, which is the assertion with the teeth.
     */
    const allButtons = [...document.querySelectorAll('#journal-board button')];
    const buttons = allButtons.filter(b => b.textContent.trim() !== '\u2316').length;

    // …and the board in a settlement is the way in
    f.hud.toggleSheet(false);
    const opened = f.hud.openNoticeBoard({ where: 'a village' });
    const take = document.querySelector('#board-list button');
    take?.click();
    const afterBoard = f.questLog.active.length;
    f.hud.closeNoticeBoard();
    return {
      rows: rows.length, before, afterClick, buttons, opened,
      afterBoard, hidden: document.getElementById('noticeboard').classList.contains('hidden'),
    };
  });

  expect(out.rows, 'the journal stopped showing what is going on').toBeGreaterThan(0);
  expect(out.buttons, 'the journal still has a button that takes work').toBe(0);
  expect(out.afterClick, 'clicking a journal row took a quest').toBe(out.before);
  expect(out.opened).toBe(true);
  expect(out.afterBoard, 'the notice board did not take the job').toBe(out.before + 1);
  expect(out.hidden, 'the notice board would not close').toBe(true);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- 4.2 / 4.3 the perk forest

test('a line on the forest is the unlock rule, and one perk can be handed back', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(() => {
    const f = window.farhold;
    f.player.level = 20;
    f.hud.toggleSheet(true);
    f.hud.setTab('perks');
    const forest = f.rpg.forest;

    // take two in a row, then ask the screen about each of them
    // the second one has to hang off the first ONLY — a ring-1 sibling touches the hub as well, so
    // giving the first one back would orphan nothing and the test would prove nothing
    const atHub = new Set(forest.neighbours.get('start') || []);
    const first = [...atHub][0];
    f.hud.onTakePerk(first);
    const second = (forest.neighbours.get(first) || []).find(id => id !== 'start' && !atHub.has(id));
    f.hud.onTakePerk(second);

    const panel = id => {
      f.hud.perkPick = id;
      f.hud.renderSheet();
      const side = document.getElementById('perk-side');
      const button = [...side.querySelectorAll('button')].find(b => b.textContent.includes('Give this one back'));
      return { text: side.textContent, disabled: button ? button.disabled : null, button: !!button };
    };

    const middle = panel(first);
    const tip = panel(second);
    const took = f.player.perks.slice();
    // the tip goes back, and only the tip
    [...document.querySelectorAll('#perk-side button')]
      .find(b => b.textContent.includes('Give this one back'))?.click();
    return {
      took, left: f.player.perks.slice(),
      middleDisabled: middle.disabled, middleSaysWhy: /reaches the middle through this one/.test(middle.text),
      tipDisabled: tip.disabled, hasButton: middle.button && tip.button,
      // the edge list beside the node, which is the same set the unlock rule walks
      lists: /Connects to|Opens/.test(tip.text),
    };
  });

  expect(out.took.length).toBe(2);
  expect(out.hasButton, 'there is no way to give one perk back').toBe(true);
  expect(out.middleDisabled, 'a perk holding up another one could be given back').toBe(true);
  expect(out.middleSaysWhy, 'the refund is refused without saying why').toBe(true);
  expect(out.tipDisabled, 'the perk on the end of the walk could not be given back').toBe(false);
  expect(out.left.length, 'giving one back took more than one').toBe(1);
  expect(out.lists, 'the panel does not say what the node connects to').toBe(true);
  expect(errors).toEqual([]);
});
