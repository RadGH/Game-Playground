// Smoke: the prototype loads, four heroes are hired, the world screen shows the map, a fight runs on the stage,
// a town opens its shop, and the save survives a reload.
import { test, expect } from '@playwright/test';
async function boot(page) { const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); await page.goto('/prototypes/emberveil/'); await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 }); return errors; }
// The settings moved into the in-game menu overlay, so the checks that need them open it first.
async function openMenu(page) { await page.click('#btn-menu'); await expect(page.locator('#menu-dialog')).toBeVisible(); }
async function closeMenu(page) { await page.keyboard.press('Escape'); await expect(page.locator('#menu-dialog')).toBeHidden(); }
test('Emberveil 2: hire four, map, fight, meter drill-down, town, rest with camp talk, save and reload', async ({ page }) => {
  test.setTimeout(240000); const errors = await boot(page);
  await page.click('#btn-new'); await expect(page.locator('.class-card')).toHaveCount(30); await page.click('#btn-suggest'); await expect(page.locator('#hire-count')).toHaveText('4 / 4'); await page.click('#btn-start');
  // themed shell: the menu overlay opens and closes, mute lives in it now, HUD stats have tooltips and the tabs still switch
  await openMenu(page); await page.check('#mute'); await closeMenu(page);
  await page.hover('#hud-food'); await expect(page.locator('#tipbox')).toBeVisible({ timeout: 5000 }); expect((await page.locator('#tipbox').innerText()).toLowerCase()).toContain('ration');
  await page.hover('#btn-save'); await expect(page.locator('#tipbox')).toContainText('storage');
  await page.click('.tabs button[data-tab="bag"]'); await expect(page.locator('#tab-bag')).toBeVisible(); await expect(page.locator('#tab-party')).toBeHidden();
  await page.click('.tabs button[data-tab="party"]'); await expect(page.locator('#tab-party')).toBeVisible();
  expect(await page.locator('#screen-world .panel .fc').count()).toBeGreaterThan(3);
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
  // spell effects: the stage's API works on real fighters and a projectile resolves when it lands
  const fxOk = await page.evaluate(async () => {
    const st = window.emberveil.stage; const ids = [...st.chars.keys()]; const a = ids[0], b = ids[1] || ids[0];
    const t0 = performance.now();
    await st.cast(a, b, { element: 'fire', kind: 'magic' });
    const ms = performance.now() - t0;
    st.impact(b, 'fire', true); st.heal(a); st.reviveFx(a); st.status(b, 'burn', true); st.status(b, 'stun', true);
    const on = st.statusesOn(b).slice(); st.clearStatuses(b);
    return { ms, on, cleared: st.statusesOn(b), height: st.heightOf(a), chest: st.pointOf(a).y, types: [typeof st.cast, typeof st.impact, typeof st.status, typeof st.clearStatuses, typeof st.heal, typeof st.reviveFx] };
  });
  expect(fxOk.types).toEqual(['function', 'function', 'function', 'function', 'function', 'function']);
  expect(fxOk.ms).toBeLessThan(2500); expect(fxOk.on).toContain('burn'); expect(fxOk.on).toContain('stun'); expect(fxOk.cleared).toEqual([]);
  expect(fxOk.height).toBeGreaterThan(0.3); expect(fxOk.chest).toBeGreaterThan(0.2);
  // meter tab drills down; rest scene talks around the fire and advances the day
  await page.click('.tabs button[data-tab="meter"]'); expect(await page.locator('#tab-meter .meter-row').count()).toBeGreaterThan(0); await page.locator('#tab-meter .meter-row').first().click(); await page.locator('#tab-meter .meter-row').first().click(); expect(await page.locator('#tab-meter .meter-hits tbody tr').count()).toBeGreaterThan(0);
  const restP = page.evaluate(() => window.emberveil.restScene()); await page.waitForFunction(() => [...document.querySelectorAll('#actions button')].some(b => b.textContent === 'Rest'), null, { timeout: 30000 }); const day1 = await page.evaluate(() => window.emberveil.game.day); await page.click('#actions button:has-text("Rest") >> nth=0'); await page.waitForFunction(() => !window.emberveil.busy, null, { timeout: 180000 }); await restP.catch(() => {}); expect(await page.evaluate(() => window.emberveil.game.day)).toBe(day1 + 1); expect(await page.locator('#narrative .say').count()).toBeGreaterThan(2);
  // journal tab has prose memories; a named enemy fight can be forced
  await page.click('.tabs button[data-tab="journal"]'); expect(await page.locator('#tab-journal .quest').count()).toBeGreaterThan(0);
  const named = await page.evaluate(async () => { const g = window.emberveil.game; const enc = g.namedEncounter({ staticDef: g.staticNamed('border_roads')[0] || null, templateId: 'bandit' }); for (const e of enc.enemies) e.hp = Math.min(e.hp, 8); const won = await window.emberveil.fight(enc, { node: null }); if (won) g.victory(null, enc); return { name: enc.named.name, won, slain: g.namedSlain.length, nemeses: g.nemeses.length }; }); expect(named.name.length).toBeGreaterThan(2); expect(named.slain + named.nemeses).toBeGreaterThanOrEqual(1);
  // hero errand adds a violet quest node; language debug makes words clickable
  const hq = await page.evaluate(() => { const g = window.emberveil.game; const h = g.party.find(x => !g.activeHeroQuest(x)); const q = h ? g.startHeroQuest(h) : null; window.emberveil.renderSide(); window.emberveil.game.threadEvent('town'); return { ok: !!q || Object.keys(g.heroQuests).length > 0, nodes: g.zone().nodes.filter(n => n.type === 'heroquest').length }; }); expect(hq.ok).toBe(true); expect(hq.nodes).toBeGreaterThanOrEqual(1);
  await openMenu(page); await page.check('.langdbg-settings input'); await closeMenu(page); expect(await page.locator('#narrative .langdbg-word').count()).toBeGreaterThan(5); await page.locator('#narrative .langdbg-word').first().click(); await expect(page.locator('.langdbg-pop')).toBeVisible(); await page.locator('.langdbg-pop [data-act=close]').click(); await openMenu(page); await page.uncheck('.langdbg-settings input'); await closeMenu(page);
  // jump to Emberglen and open the merchant
  await page.evaluate(() => { const g = window.emberveil.game; g.unlockedZones.push('border_roads'); g.enterZone('border_roads'); g.act = 1; }); await page.evaluate(() => window.emberveil.enterNode()); await page.waitForFunction(() => !window.emberveil.busy && [...document.querySelectorAll('#actions button')].some(b => b.textContent.includes('Merchant')), null, { timeout: 60000 });
  await page.click('#actions button:has-text("Merchant")'); await page.waitForFunction(() => !window.emberveil.busy); expect(await page.locator('.shop .item').count()).toBeGreaterThan(10); await page.click('.tabs button[data-tab="quests"]'); expect(await page.locator('#tab-quests .quest').count()).toBeGreaterThan(1);
  // inventory dialog opens with affixes on a generated rare item
  await page.evaluate(() => { const g = window.emberveil.game; g.inventory.push(g.loot.generate('longsword', 'rare', 'high')); window.emberveil.renderSide(); }); await page.click('.tabs button[data-tab="bag"]'); await page.locator('#tab-bag .item .n', { hasText: 'Longsword' }).first().click(); await expect(page.locator('#item-dialog')).toBeVisible(); expect(await page.locator('#item-dialog .affix').count()).toBeGreaterThanOrEqual(3); await page.locator('#item-dialog button:has-text("Close")').click();
  await page.click('#btn-save'); await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 }); await page.click('#btn-continue'); await page.waitForFunction(() => document.querySelectorAll('#actions button').length > 0, null, { timeout: 60000 }); expect(await page.evaluate(() => window.emberveil.game.party.length)).toBe(4);
  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});

test('Emberveil 2: themed title screen — art, tooltips, how to play and the class tooltips', async ({ page }) => {
  test.setTimeout(120000); const errors = await boot(page);
  await expect(page.locator('#screen-title .title-sigil')).toBeVisible();
  expect(await page.locator('#embers i').count()).toBeGreaterThan(5);            // drifting embers
  expect(await page.locator('#screen-title .fc').count()).toBe(4);               // gold corner flourishes
  await expect(page.locator('#hud')).toBeHidden();                               // status bar belongs to the world screen
  const how = page.locator('#howto-title'); await how.locator('summary').click(); await expect(how.locator('.howto-body')).toBeVisible();
  expect(await how.locator('.howto-body li').count()).toBeGreaterThan(6);
  await page.hover('#btn-new'); await expect(page.locator('#tipbox')).toBeVisible({ timeout: 5000 });
  await page.click('#btn-new');
  await page.hover('.class-card >> nth=0'); await expect(page.locator('#tipbox')).toContainText('Kit:');
  await page.click('.class-card >> nth=0'); await expect(page.locator('#hire-party .socket.filled')).toHaveCount(1); await expect(page.locator('#hire-party .socket.empty')).toHaveCount(3);
  await expect(page.locator('.class-card.picked')).toHaveCount(1);
  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});

// The interface round: the party tab has to fit four heroes at once, map labels have to stay readable,
// a clicked choice has to leave the log and take its buttons away, and the meter tab has to follow the
// fight that is happening rather than the one before it.
test('Emberveil 2: compact party tab, readable map labels, logged choices, live damage meter', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1400, height: 900 });
  const errors = await boot(page);
  await page.click('#btn-new'); await page.click('#btn-suggest'); await page.click('#btn-start');
  await page.waitForFunction(() => document.querySelectorAll('#actions button').length > 0 && !window.emberveil.busy, null, { timeout: 120000 });
  await openMenu(page); await page.check('#mute'); await closeMenu(page);

  // --- all four heroes fit in the party tab, gear hidden behind a toggle that remembers itself ---
  await expect(page.locator('#tab-party .member')).toHaveCount(4);
  const over = await page.evaluate(() => { const t = document.getElementById('tab-party'); return t.scrollHeight - t.clientHeight; });
  expect(over).toBeLessThanOrEqual(0);                                   // no scrollbar: every health bar is visible
  expect(await page.locator('#tab-party .bar').count()).toBe(12);        // hp + mp + xp for each of the four
  const first = page.locator('#tab-party .member').first();
  await expect(first.locator('.slots')).toBeHidden();                    // gear starts collapsed
  await first.locator('.gear-toggle').click();
  await expect(first.locator('.slots')).toBeVisible();
  await expect(first.locator('button:has-text("Feelings")')).toBeVisible();
  await expect(first.locator('button:has-text("Save to library")')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('playground:emberveil:ui:v1') || '{}').gearOpen || {}).length)).toBe(1);
  await first.locator('.gear-toggle').click();
  await expect(first.locator('.slots')).toBeHidden();
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('playground:emberveil:ui:v1') || '{}').gearOpen || {}).length)).toBe(0);

  // --- map labels: two lines instead of "…", and no label sitting on another label or on a node ---
  await page.evaluate(() => { const g = window.emberveil.game; if (!g.unlockedZones.includes('dust_roads')) g.unlockedZones.push('dust_roads'); g.enterZone('dust_roads'); window.emberveil.renderMap(); });
  const map = await page.evaluate(() => {
    const svg = document.getElementById('map');
    const box = t => { const m = t.closest('g').getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/); const b = t.getBBox(); return { x1: +m[1] + b.x, x2: +m[1] + b.x + b.width, y1: +m[2] + b.y, y2: +m[2] + b.y + b.height, s: [...t.children].map(c => c.textContent).join(' ') }; };
    const boxes = [...svg.querySelectorAll('text')].map(box); const bad = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], c = boxes[j]; if (Math.min(a.x2, c.x2) > Math.max(a.x1, c.x1) && Math.min(a.y2, c.y2) > Math.max(a.y1, c.y1)) bad.push(a.s + ' / ' + c.s); }
    return { labels: boxes.length, overlaps: bad, ellipsis: boxes.filter(b => b.s.includes('…')).length, wrapped: [...svg.querySelectorAll('text')].filter(t => t.children.length > 1).length, fontSize: parseFloat(getComputedStyle(svg.querySelector('text')).fontSize), tipHasFullName: [...svg.querySelectorAll('g.mapnode')].some(g => (g.dataset.tipHtml || '').includes('Tomek')) };
  });
  expect(map.labels).toBeGreaterThan(4);
  expect(map.ellipsis).toBe(0);            // names wrap, they are never cut short
  expect(map.wrapped).toBeGreaterThan(0);  // at least one name on two lines
  expect(map.overlaps).toEqual([]);
  expect(map.fontSize).toBeLessThanOrEqual(1.3);
  expect(map.tipHasFullName).toBe(true);   // the hover card still carries the full name

  // --- a clicked choice hides its buttons straight away and writes a "you" line into the log ---
  await page.evaluate(() => { window.__choice = window.emberveil.waitForChoice([
    { text: 'Take the veilsilver ring', run: async () => { window.__actionsWhileRunning = document.querySelectorAll('#actions button').length; await new Promise(r => setTimeout(r, 250)); return 'took'; } },
    { text: 'Walk away', run: async () => 'left' }]); });
  await page.click('#actions button:has-text("Take the veilsilver ring")');
  const choice = await page.evaluate(async () => ({ result: await window.__choice, whileRunning: window.__actionsWhileRunning, you: [...document.querySelectorAll('#narrative .you')].map(p => p.textContent) }));
  expect(choice.result).toBe('took');
  expect(choice.whileRunning).toBe(0);     // the buttons were gone before the answer was read
  expect(choice.you.at(-1)).toContain('You: Take the veilsilver ring');
  // a silent choice stays out of the log
  await page.evaluate(() => { window.__quiet = window.emberveil.waitForChoice([{ text: 'Say nothing', run: async () => 1 }], { silent: true }); });
  await page.click('#actions button:has-text("Say nothing")');
  const youLines = await page.evaluate(async () => { await window.__quiet; return document.querySelectorAll('#narrative .you').length; });
  expect(youLines).toBe(choice.you.length);

  // --- the meter tab follows the fight in progress, not the one before ---
  await page.click('.tabs button[data-tab="meter"]');
  await page.evaluate(async () => { const g = window.emberveil.game; const enc = g.encounter('goblin_patrol'); for (const e of enc.enemies) e.hp = Math.min(e.hp, 6); await window.emberveil.fight(enc, { node: null }); });
  expect(await page.locator('#tab-meter .meter-row').count()).toBeGreaterThan(0);      // the finished fight is on screen
  const second = page.evaluate(async () => { const g = window.emberveil.game; const enc = g.encounter('goblin_patrol'); enc.name = 'Second fight'; for (const e of enc.enemies) e.hp = 80; window.__enc = enc; await window.emberveil.fight(enc, { node: null }); });
  // it is wiped and pointed at the new fight the moment that fight starts…
  await page.waitForFunction(() => window.emberveil.game.meter.current?.label === 'Second fight' && document.querySelectorAll('#tab-meter .meter-row').length === 0, null, { timeout: 60000 });
  expect(await page.evaluate(() => document.querySelector('#tab-meter select').value)).toBe('current');
  // …and fills in while that fight is still running
  await page.waitForFunction(() => window.emberveil.game.meter.current && document.querySelectorAll('#tab-meter .meter-row').length > 0, null, { timeout: 60000 });
  await page.evaluate(() => { for (const e of window.__enc.enemies) e.hp = 1; });      // let it finish
  await second;

  // --- the rewards popup shows up after a won fight and can be dismissed ---
  await page.evaluate(async () => { const g = window.emberveil.game; const enc = g.encounter('goblin_patrol'); for (const e of enc.enemies) e.hp = 1; window.__enc2 = enc; await window.emberveil.fight(enc, { node: null }); });
  await page.evaluate(() => { window.__after = window.emberveil.afterCombat(null, window.__enc2, false); });
  await expect(page.locator('.rw-overlay')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.rw-ribbon')).toHaveText('Victory');
  await page.locator('.rw-skip').click();          // skip to the fully revealed state…
  await page.locator('.rw-btn').click();           // …then dismiss
  await expect(page.locator('.rw-overlay')).toHaveCount(0);
  await page.evaluate(() => window.__after);

  // --- a boss crossing an hp threshold names the phase in the log and says something about it ---
  const phase = await page.evaluate(async () => {
    const E = window.emberveil, g = E.game; E.rewardPopups = false;
    for (const h of g.party) { h.alive = true; h.level = 30; h.attrs.STR = 200; h.attrs.DEX = 200; h.hp = h.maxHp = 9000; }
    const id = 'archfiend_malgrath'; const t = E.DATA.bosses.entities[id];
    const enc = { id: 'phase_test', name: 'Malgrath', enemies: [{ ...JSON.parse(JSON.stringify(t)), id: 'b_' + id, templateId: id, boss: true, isEnemy: true, statuses: [], cooldowns: [], hp: 3000, maxHp: 3000, short: t.name }] };
    const before = document.querySelectorAll('#narrative p.say.enemy').length;
    await E.fight(enc, { node: null, boss: true });
    return { named: [...document.querySelectorAll('#narrative p')].filter(p => /Hellfire Unleashed|Demonic Ascendance/.test(p.textContent)).length,
             saidAfter: document.querySelectorAll('#narrative p.say.enemy').length - before };
  });
  expect(phase.named).toBeGreaterThanOrEqual(1);    // the phase name + its written line reached the log
  expect(phase.saidAfter).toBeGreaterThanOrEqual(1); // and the boss spoke

  expect(errors.filter(e => !/AudioContext|WebGL/i.test(e))).toEqual([]);
});
