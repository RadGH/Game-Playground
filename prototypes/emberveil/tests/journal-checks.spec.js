// Browser checks for three pieces of the interface that only exist on screen:
//   * the skill-check popup — a d20 tumbles, settles, and shows the sum with a PASS/FAIL stamp
//   * the Named Foes board in the Journal — "the name goes on the board" is a real board
//   * the Narrator — scene text is italic, attributed to nobody in the party, and draws no bubble
import { test, expect } from '@playwright/test';

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/prototypes/emberveil/');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90_000 });
  await page.click('#btn-new');
  await page.click('#btn-suggest');
  await page.click('#btn-start');
  await page.waitForFunction(() => !!window.emberveil.game && document.querySelectorAll('#actions button').length > 0, null, { timeout: 60_000 });
  return errors;
}

test('skill-check popup: the die tumbles, settles on the roll, stamps PASS, and writes one line in the log', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await boot(page);

  // start a check and catch it mid-tumble
  await page.evaluate(() => { window.__check = window.emberveil.showCheck({ stat: 'CON', best: 18, roll: 2, dc: 20, ok: true }, { subtitle: 'The Ford' }); });
  await expect(page.locator('.sc-overlay')).toBeVisible();
  await expect(page.locator('.sc-die.rolling')).toBeVisible();
  expect(await page.locator('.sc-stamp.show').count()).toBe(0);           // the answer is not given away yet
  await expect(page.locator('.sc-sub')).toHaveText('The Ford');

  // the die lands on the number that was rolled, and the sum is spelled out
  await expect(page.locator('.sc-die.settled')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.sc-die')).toHaveText('2');
  await expect(page.locator('.sc-stamp.show')).toHaveText(/pass/i);
  await expect(page.locator('.sc-sum')).toContainText('CON 18 + d20 (rolled 2) = 20 vs 20');

  // Enter closes it, and exactly one line went into the log, in the shared format
  await page.keyboard.press('Enter');
  await expect(page.locator('.sc-overlay')).toHaveCount(0);
  await page.evaluate(() => window.__check);
  const lines = await page.locator('#narrative p.check').allInnerTexts();
  expect(lines).toEqual(['CON 18 + d20 (rolled 2) = 20 vs 20: pass']);

  // A click during the tumble skips straight to the result instead of closing. The popup is slowed
  // right down for this one so the click definitely lands while the die is still in the air.
  await page.evaluate(async () => {
    const ui = await import('/prototypes/emberveil/js/ui.js');
    window.__check2 = ui.skillCheckPopup({ stat: 'DEX', best: 11, roll: 19, dc: 16, ok: true }, { speed: 0.12 });
  });
  await expect(page.locator('.sc-die.rolling')).toBeVisible();
  await page.locator('.sc-overlay').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.sc-die')).toHaveText('19');
  await expect(page.locator('.sc-overlay')).toBeVisible();                 // the first click only skipped
  await expect(page.locator('.sc-stamp.show')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sc-overlay')).toHaveCount(0);
  await page.evaluate(() => window.__check2);

  // a failed check stamps FAIL
  await page.evaluate(() => { window.__check3 = window.emberveil.showCheck({ stat: 'STR', best: 9, roll: 1, dc: 18, ok: false }); });
  await expect(page.locator('.sc-stamp.show')).toHaveText(/fail/i, { timeout: 5000 });
  await expect(page.locator('.sc-die.nat1')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__check3);

  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});

test('the Named Foes board fills in from the killing blow and survives a save', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await boot(page);

  await page.click('.tabs button[data-tab="journal"]');
  await expect(page.locator('#tab-journal')).toContainText('Named Foes');
  await expect(page.locator('#tab-journal')).toContainText('The board is empty');

  // a named enemy dies, and the meter says who finished it
  const row = await page.evaluate(() => {
    const E = window.emberveil, g = E.game;
    const hero = g.party[0];
    g.meter.startFight('a test fight', { zone: g.zoneId, day: g.day });
    g.meter.record({ t: 1, source: hero.id, sourceName: hero.short, target: 'foe_named', targetName: 'Vekkash', kind: 'damage', amount: 40, via: 'attack', viaName: 'Longsword', crit: true, killingBlow: true });
    const entry = E.recordNamedKill({ id: 'foe_named', name: 'Vekkash the Ember-Tongued', title: 'the Ember-Tongued', baseName: 'Goblin Shaman' }, { nemesis: { defeats: 2 } });
    E.renderJournal();
    return { entry, hero: hero.short, day: g.day, zone: g.zone().name };
  });
  expect(row.entry.by).toBe(row.hero);
  expect(row.entry.via).toBe('Longsword');
  expect(row.entry.crit).toBe(true);

  const board = await page.locator('#tab-journal').innerText();
  expect(board).toContain('Vekkash the Ember-Tongued');
  expect(board).toContain(row.zone);
  expect(board).toContain('day ' + row.day);
  expect(board).toContain('nemesis, beat us 2×');
  expect(board).toContain('Killing blow: ' + row.hero);
  expect(board).toContain('Longsword');
  expect(board).not.toContain('The board is empty');

  // it is part of the game state, so it is in the save file
  const saved = await page.evaluate(() => { window.emberveil.game.save(); return JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /emberveil/.test(k) && /save/i.test(k)) || '')) || null; });
  if (saved) expect(JSON.stringify(saved)).toContain('Vekkash the Ember-Tongued');

  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});

test('scene text is read by the Narrator: italic, no portrait, no bubble on the stage', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await boot(page);
  await page.evaluate(() => { window.emberveil.talk.muted = true; });   // the voice is node-tested; this is about the look

  const before = await page.locator('#bubbles .bubble').count();
  await page.evaluate(() => window.emberveil.sayScene('A massive wolf is caught in a rusted trap, too exhausted to snarl.'));
  const line = page.locator('#narrative p.say.narration').last();
  await expect(line).toContainText('A massive wolf is caught in a rusted trap');
  await expect(line.locator('b')).toHaveText('Narrator');
  await expect(line.locator('i')).toHaveCount(1);
  expect(await line.locator('i').evaluate(n => getComputedStyle(n).fontStyle)).toBe('italic');
  expect(await page.locator('#bubbles .bubble').count()).toBe(before);   // nobody on the stage said it

  // and the classifier, in the page, agrees about what is scene text and what is speech
  const cls = await page.evaluate(() => ({
    scene: window.emberveil.isSceneText('The rope bridge sways over a chasm. Half the planks are missing.'),
    said: window.emberveil.isSceneText("I'm out of arrows!"),
  }));
  expect(cls).toEqual({ scene: true, said: false });

  // an empty scene line is simply nothing, not an empty Narrator row
  const rows = await page.locator('#narrative p.say.narration').count();
  await page.evaluate(() => window.emberveil.sayScene(''));
  expect(await page.locator('#narrative p.say.narration').count()).toBe(rows);
  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});
