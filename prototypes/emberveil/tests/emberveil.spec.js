// Smoke: the prototype loads, four heroes are hired, the world screen shows the map, a fight runs on the stage,
// a town opens its shop, and the save survives a reload.
import { test, expect } from '@playwright/test';
async function boot(page) { const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); await page.goto('/prototypes/emberveil/'); await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 }); return errors; }
test('Emberveil 2: hire four, map, fight, meter drill-down, town, rest with camp talk, save and reload', async ({ page }) => {
  test.setTimeout(240000); const errors = await boot(page);
  await page.click('#btn-new'); await expect(page.locator('.class-card')).toHaveCount(30); await page.click('#btn-suggest'); await expect(page.locator('#hire-count')).toHaveText('4 / 4'); await page.click('#btn-start'); await page.check('#mute');
  await page.waitForFunction(() => document.querySelectorAll('#actions button').length > 0 && !window.emberveil.busy, null, { timeout: 60000 });
  expect(await page.locator('#map circle.node').count()).toBeGreaterThan(3); expect(await page.evaluate(() => window.emberveil.stage.chars.size)).toBeGreaterThanOrEqual(4);
  // designed looks (data/enemy-looks.json) drive every enemy and companion body — no regex guessing left
  const looks = await page.evaluate(() => { const E = window.emberveil; const out = { missing: [], wrong: [] };
    for (const [group, table] of [['enemies', E.DATA.enemies.entities], ['bosses', E.DATA.bosses.entities]]) for (const id of Object.keys(table)) {
      const L = E.ELOOKS[group][id]; const got = E.enemyLook({ id: 'x_' + id, templateId: id, name: table[id].name, hp: 10 });
      if (!L) { out.missing.push(group + '/' + id); continue; }
      if (L.creature) { if (got.creature?.type !== L.creature.type) out.wrong.push(id + ' creature'); }
      else if (got.avatar?.top?.id !== L.avatar.top.id || got.avatar?.body?.skin !== L.avatar.body.skin) out.wrong.push(id + ' avatar'); }
    const dog = E.bodyOf({ id: 'c1', name: 'War Dog', isCompanion: true, templateId: 'war_dog', hp: 10 });
    return { ...out, dogType: dog.creature?.type, dogSize: dog.creature?.size }; });
  expect(looks.missing).toEqual([]); expect(looks.wrong).toEqual([]); expect(looks.dogType).toBe('hound'); expect(looks.dogSize).toBe(0.95);
  // scripted fight against a goblin patrol
  const won = await page.evaluate(async () => { const g = window.emberveil.game; const enc = g.encounter('goblin_patrol'); for (const e of enc.enemies) e.hp = Math.min(e.hp, 6); return window.emberveil.fight(enc, { node: null }); });
  expect(typeof won).toBe('boolean'); const log = await page.locator('#narrative').innerText(); expect(log).toMatch(/round 1/); expect(log).toMatch(/hits|misses/);
  // meter tab drills down; rest scene talks around the fire and advances the day
  await page.click('.tabs button[data-tab="meter"]'); expect(await page.locator('#tab-meter .meter-row').count()).toBeGreaterThan(0); await page.locator('#tab-meter .meter-row').first().click(); await page.locator('#tab-meter .meter-row').first().click(); expect(await page.locator('#tab-meter .meter-hits tbody tr').count()).toBeGreaterThan(0);
  const restP = page.evaluate(() => window.emberveil.restScene()); await page.waitForFunction(() => [...document.querySelectorAll('#actions button')].some(b => b.textContent === 'Rest'), null, { timeout: 30000 }); const day1 = await page.evaluate(() => window.emberveil.game.day); await page.click('#actions button:has-text("Rest") >> nth=0'); await page.waitForFunction(() => !window.emberveil.busy, null, { timeout: 180000 }); await restP.catch(() => {}); expect(await page.evaluate(() => window.emberveil.game.day)).toBe(day1 + 1); expect(await page.locator('#narrative .say').count()).toBeGreaterThan(2);
  // journal tab has prose memories; a named enemy fight can be forced
  await page.click('.tabs button[data-tab="journal"]'); expect(await page.locator('#tab-journal .quest').count()).toBeGreaterThan(0);
  const named = await page.evaluate(async () => { const g = window.emberveil.game; const enc = g.namedEncounter({ staticDef: g.staticNamed('border_roads')[0] || null, templateId: 'bandit' }); for (const e of enc.enemies) e.hp = Math.min(e.hp, 8); const won = await window.emberveil.fight(enc, { node: null }); if (won) g.victory(null, enc); return { name: enc.named.name, won, slain: g.namedSlain.length, nemeses: g.nemeses.length }; }); expect(named.name.length).toBeGreaterThan(2); expect(named.slain + named.nemeses).toBeGreaterThanOrEqual(1);
  // hero errand adds a violet quest node; language debug makes words clickable
  const hq = await page.evaluate(() => { const g = window.emberveil.game; const h = g.party.find(x => !g.activeHeroQuest(x)); const q = h ? g.startHeroQuest(h) : null; window.emberveil.renderSide(); window.emberveil.game.threadEvent('town'); return { ok: !!q || Object.keys(g.heroQuests).length > 0, nodes: g.zone().nodes.filter(n => n.type === 'heroquest').length }; }); expect(hq.ok).toBe(true); expect(hq.nodes).toBeGreaterThanOrEqual(1);
  await page.check('.langdbg-settings input'); expect(await page.locator('#narrative .langdbg-word').count()).toBeGreaterThan(5); await page.locator('#narrative .langdbg-word').first().click(); await expect(page.locator('.langdbg-pop')).toBeVisible(); await page.locator('.langdbg-pop [data-act=close]').click(); await page.uncheck('.langdbg-settings input');
  // jump to Emberglen and open the merchant
  await page.evaluate(() => { const g = window.emberveil.game; g.unlockedZones.push('border_roads'); g.enterZone('border_roads'); g.act = 1; }); await page.evaluate(() => window.emberveil.enterNode()); await page.waitForFunction(() => !window.emberveil.busy && [...document.querySelectorAll('#actions button')].some(b => b.textContent.includes('Merchant')), null, { timeout: 60000 });
  await page.click('#actions button:has-text("Merchant")'); await page.waitForFunction(() => !window.emberveil.busy); expect(await page.locator('.shop .item').count()).toBeGreaterThan(10); await page.click('.tabs button[data-tab="quests"]'); expect(await page.locator('#tab-quests .quest').count()).toBeGreaterThan(1);
  // inventory dialog opens with affixes on a generated rare item
  await page.evaluate(() => { const g = window.emberveil.game; g.inventory.push(g.loot.generate('longsword', 'rare', 'high')); window.emberveil.renderSide(); }); await page.click('.tabs button[data-tab="bag"]'); await page.locator('#tab-bag .item .n', { hasText: 'Longsword' }).first().click(); await expect(page.locator('#item-dialog')).toBeVisible(); expect(await page.locator('#item-dialog .affix').count()).toBeGreaterThanOrEqual(3); await page.locator('#item-dialog button:has-text("Close")').click();
  await page.click('#btn-save'); await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 }); await page.click('#btn-continue'); await page.waitForFunction(() => document.querySelectorAll('#actions button').length > 0, null, { timeout: 60000 }); expect(await page.evaluate(() => window.emberveil.game.party.length)).toBe(4);
  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});
