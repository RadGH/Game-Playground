// Smoke test: the prototype loads, the default party can be assembled, the world screen comes up,
// a fight runs to the end, camp talk happens, and the save round-trips. Voice is muted.
import { test, expect } from '@playwright/test';

async function boot(page) {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/prototypes/party-quest/'); await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  return errors;
}
test('assemble default party and reach the village', async ({ page }) => {
  const errors = await boot(page);
  await page.click('#btn-new'); await expect(page.locator('#screen-party')).toBeVisible();
  await page.click('#btn-default-party'); await expect(page.locator('#chosen-count')).toHaveText('4 / 4');
  await page.click('#btn-start'); await expect(page.locator('#screen-world')).toBeVisible();
  await page.check('#mute');
  await page.waitForFunction(() => document.querySelectorAll('#actions button').length > 0, null, { timeout: 30000 });
  const acts = await page.locator('#actions button').allTextContents();
  expect(acts.some(t => t.startsWith('Talk:'))).toBeTruthy(); expect(acts.some(t => t.includes('Market'))).toBeTruthy(); expect(acts.some(t => t.startsWith('north'))).toBeTruthy();
  const chars = await page.evaluate(() => window.partyQuest.stage.chars.size); expect(chars).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});
test('a fight runs to the end with reactions, then camp talk, then save/load', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);
  await page.click('#btn-new'); await page.click('#btn-default-party'); await page.click('#btn-start'); await page.check('#mute');
  await page.waitForFunction(() => document.querySelectorAll('#actions button').length > 0, null, { timeout: 30000 });
  const won = await page.evaluate(async () => { const pq = window.partyQuest; pq.game.location = 'thalen_wood_edge'; return pq.fight(['goblin_scrapper', 'goblin_scrapper'], { place: 'thalen_wood_edge' }); });
  expect(typeof won).toBe('boolean');
  const log = await page.locator('#narrative').innerText(); expect(log).toMatch(/round 1/); expect(log).toMatch(/Victory|Everyone is down/);
  const said = await page.locator('#narrative .say').count(); expect(said).toBeGreaterThan(0);
  const mem = await page.evaluate(() => Object.values(window.partyQuest.game.banks).reduce((n, b) => n + b.memories.length, 0)); expect(mem).toBeGreaterThan(0);
  // camp: conversation lines appear, then a Sleep button
  const campP = page.evaluate(() => window.partyQuest.camp());
  await page.waitForFunction(() => [...document.querySelectorAll('#actions button')].some(b => b.textContent.includes('Sleep')), null, { timeout: 120000 });
  const campLines = await page.locator('#narrative .say').count(); expect(campLines).toBeGreaterThan(said);
  await page.click('#actions button'); await campP;
  const day = await page.evaluate(() => window.partyQuest.game.day); expect(day).toBe(2);
  await page.click('#btn-save'); await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.click('#btn-continue'); await expect(page.locator('#hud-day')).toHaveText('2');
  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});
test('wolves are creature bodies and never talk back', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);
  await page.click('#btn-new'); await page.click('#btn-default-party'); await page.click('#btn-start'); await page.check('#mute');
  await page.waitForFunction(() => document.querySelectorAll('#actions button').length > 0, null, { timeout: 30000 });
  await page.evaluate(() => { document.getElementById('narrative').replaceChildren(); });
  await page.evaluate(async () => { const pq = window.partyQuest; pq.game.location = 'thalen_wood_edge'; await pq.fight(['wolf', 'wolf', 'giant_spider'], { place: 'thalen_wood_edge' }); });
  expect(await page.locator('#narrative .say.enemy').count()).toBe(0);
  const log = await page.locator('#narrative').innerText(); expect(log).toMatch(/Victory|Everyone is down/);
  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});
