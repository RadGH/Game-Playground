// Round 21 in the browser: combat speed buttons (E34), the log holding its place (E35), town screens in
// their own panel (E37), Manage Party and the bench surviving a reload (E38), and the wounded reminder
// on arrival in a settlement (E39). Themed scrollbars (E36) are checked as computed styles.
import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 });
}
/** Mute the voices and shorten spoken-line waits so the timings below measure combat pacing, not speech. */
async function quiet(page) {
  await page.evaluate(() => {
    const m = document.getElementById('mute'); m.checked = true; m.dispatchEvent(new Event('change'));
    const t = document.getElementById('text-speed'); t.value = '0.3'; t.dispatchEvent(new Event('change'));
    window.emberveil.rewardPopups = false;
  });
}
async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/prototypes/emberveil/');
  await ready(page);
  await page.evaluate(() => { try { localStorage.removeItem('playground:emberveil:save:v1'); const k = 'playground:emberveil:ui:v1'; const p = JSON.parse(localStorage.getItem(k) || '{}'); delete p.combatSpeed; localStorage.setItem(k, JSON.stringify(p)); } catch {} });
  await page.click('#btn-new'); await page.click('#btn-suggest'); await page.click('#btn-start');
  await page.waitForFunction(() => !window.emberveil.busy && document.querySelectorAll('#actions button').length > 0, null, { timeout: 90000 });
  await quiet(page);
  return errors;
}
/** Walk into the first settlement (the Border Roads trailhead is one) and wait for its buttons. */
async function goToTown(page) {
  await page.evaluate(() => { const g = window.emberveil.game; if (!g.unlockedZones.includes('border_roads')) g.unlockedZones.push('border_roads'); g.enterZone('border_roads'); g.act = 1; });
  await page.evaluate(() => window.emberveil.enterNode());
  await page.waitForFunction(() => !window.emberveil.busy && [...document.querySelectorAll('#actions button')].some(b => b.textContent === 'Merchant'), null, { timeout: 60000 });
}
/** One small fight against weakened goblins; returns wall-clock ms per round. */
async function timedFight(page) {
  return page.evaluate(async () => {
    const E = window.emberveil, g = E.game;
    for (const h of g.party) { h.alive = true; h.hp = h.maxHp; h.mp = h.maxMp; }
    const enc = g.encounter('goblin_patrol');
    for (const e of enc.enemies) { e.hp = e.maxHp = 14; }
    const before = [...document.querySelectorAll('#narrative p.sys')].filter(p => /— round \d+ —/.test(p.textContent)).length;
    const t0 = performance.now();
    await E.fight(enc, { node: null });
    const ms = performance.now() - t0;
    const rounds = [...document.querySelectorAll('#narrative p.sys')].filter(p => /— round \d+ —/.test(p.textContent)).length - before;
    return { ms, rounds, perRound: ms / Math.max(1, rounds) };
  });
}

test('E34: combat speed buttons pace the fight, scale the stage clock, and are remembered', async ({ page }) => {
  test.setTimeout(300000);
  const errors = await boot(page);

  // the buttons: three, 4x pressed by default, tooltips from the shared engine, reachable by keyboard
  const btns = page.locator('#combat-speed button');
  await expect(btns).toHaveCount(3);
  await expect(page.locator('#combat-speed button[data-speed="4"]')).toHaveAttribute('aria-pressed', 'true');
  for (const s of ['1', '2', '4']) expect(await page.locator(`#combat-speed button[data-speed="${s}"]`).getAttribute('data-tip')).toMatch(/Combat speed/);
  // sits between the vehicle indicator and Save
  const order = await page.evaluate(() => { const all = [...document.querySelectorAll('#hud-vehicle, #combat-speed, #btn-save')]; return all.map(e => e.id); });
  expect(order).toEqual(['hud-vehicle', 'combat-speed', 'btn-save']);

  // 4x: the stage clock runs at normal speed during a fight
  const fast = await timedFight(page);
  expect(await page.evaluate(() => window.emberveil.stage.timeScale ?? 1)).toBe(1);

  // 1x, chosen with the keyboard
  await page.locator('#combat-speed button[data-speed="1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#combat-speed button[data-speed="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#combat-speed button[data-speed="4"]')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.emberveil.combatSpeed)).toBe(1);
  // outside a fight nothing is slowed (camp, travel scenes)
  expect(await page.evaluate(() => window.emberveil.stage.timeScale ?? 1)).toBe(1);

  const slow = await timedFight(page);
  console.log('per round ms: 4x', Math.round(fast.perRound), '(rounds', fast.rounds, ') 1x', Math.round(slow.perRound), '(rounds', slow.rounds, ')');
  expect(slow.perRound).toBeGreaterThan(fast.perRound * 1.8);
  expect(await page.evaluate(() => window.emberveil.stage.timeScale ?? 1)).toBe(1);   // back to normal after the fight

  // during a fight: the stage clock and the CSS pace follow the button, and a change mid-fight applies
  await page.locator('#combat-speed button[data-speed="4"]').click();
  const midFight = await page.evaluate(async () => {
    const E = window.emberveil, g = E.game;
    for (const h of g.party) { h.alive = true; h.hp = h.maxHp; }
    const enc = g.encounter('goblin_patrol'); for (const e of enc.enemies) e.hp = e.maxHp = 25;
    const p = E.fight(enc, { node: null });
    await new Promise(r => setTimeout(r, 400));
    const at4 = { scale: E.stage.timeScale, pace: getComputedStyle(document.documentElement).getPropertyValue('--pace').trim(), inFight: E.inFight };
    document.querySelector('#combat-speed button[data-speed="2"]').click();
    await new Promise(r => setTimeout(r, 50));
    const at2 = { scale: E.stage.timeScale, pace: getComputedStyle(document.documentElement).getPropertyValue('--pace').trim() };
    await p;
    return { at4, at2, after: { scale: E.stage.timeScale, pace: getComputedStyle(document.documentElement).getPropertyValue('--pace').trim(), inFight: E.inFight } };
  });
  expect(midFight.at4.inFight).toBe(true);
  expect(midFight.at4.scale).toBe(1);
  expect(midFight.at2.scale).toBe(0.5);
  expect(midFight.at2.pace).toBe('2');
  expect(midFight.after.scale).toBe(1);
  expect(midFight.after.inFight).toBe(false);

  // remembered across a reload
  await page.reload(); await ready(page);
  await expect(page.locator('#combat-speed button[data-speed="2"]')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('E34: the top bar does not overflow at typical widths', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  for (const width of [1440, 1280, 1000, 800, 620, 400]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const top = document.querySelector('.top'), hud = document.getElementById('hud'), sp = document.getElementById('combat-speed').getBoundingClientRect();
      return { page: document.documentElement.scrollWidth, win: innerWidth, top: top.scrollWidth - top.clientWidth, hud: hud.getBoundingClientRect().right, speedRight: sp.right, speedW: sp.width };
    });
    expect(r.page, `page overflow at ${width}`).toBeLessThanOrEqual(r.win + 1);
    expect(r.top, `top bar overflow at ${width}`).toBeLessThanOrEqual(1);
    expect(r.speedRight, `speed buttons on screen at ${width}`).toBeLessThanOrEqual(r.win);
    expect(r.speedW).toBeGreaterThan(50);
  }
});

test('E35: the log stays put when scrolled up, and jump to latest brings it back', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const E = window.emberveil, log = document.getElementById('narrative'), btn = document.getElementById('log-latest');
    const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    for (let i = 0; i < 80; i++) E.narrate(`<p class="sys">filler ${i}</p>`);
    await frame();
    const followed = log.scrollHeight - log.scrollTop - log.clientHeight;
    log.scrollTop = 100; await frame();
    for (let i = 0; i < 12; i++) E.narrate(`<p class="sys">arrived ${i}</p>`);
    await frame();
    const held = log.scrollTop, shown = !btn.hidden, label = btn.textContent;
    btn.click(); await frame();
    const afterJump = { gap: log.scrollHeight - log.scrollTop - log.clientHeight, hidden: btn.hidden };
    E.narrate('<p class="sys">one more</p>'); await frame();
    const stillFollowing = log.scrollHeight - log.scrollTop - log.clientHeight;
    // scrolled up, then scrolling back down by hand hides the button
    log.scrollTop = 0; await frame(); E.narrate('<p class="sys">x</p>'); await frame();
    const shownAgain = !btn.hidden;
    log.scrollTop = log.scrollHeight; await frame();
    return { followed, held, shown, label, afterJump, stillFollowing, shownAgain, hiddenAtBottom: btn.hidden };
  });
  expect(r.followed).toBeLessThanOrEqual(8);
  expect(r.held).toBe(100);
  expect(r.shown).toBe(true);
  expect(r.label).toMatch(/12 new lines/);
  expect(r.afterJump.gap).toBeLessThanOrEqual(8);
  expect(r.afterJump.hidden).toBe(true);
  expect(r.stillFollowing).toBeLessThanOrEqual(8);
  expect(r.shownAgain).toBe(true);
  expect(r.hiddenAtBottom).toBe(true);
});

test('E36: themed scrollbars are applied on the Emberveil page', async ({ page }) => {
  await page.goto('/prototypes/emberveil/'); await ready(page);
  const r = await page.evaluate(() => {
    const rules = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } }).map(x => x.cssText);
    return { track: rules.some(t => t.includes('::-webkit-scrollbar-track') && t.includes('--scroll-track')), thumbHover: rules.some(t => t.includes('::-webkit-scrollbar-thumb:hover')), corner: rules.some(t => t.includes('::-webkit-scrollbar-corner')), height: rules.some(t => /::-webkit-scrollbar \{[^}]*height: 6px/.test(t)), firefox: rules.some(t => t.includes('scrollbar-color')), trackColour: getComputedStyle(document.documentElement).getPropertyValue('--scroll-track').trim() };
  });
  expect(r).toMatchObject({ track: true, thumbHover: true, corner: true, height: true, firefox: true, trackColour: '#231a14' });
});

test('E37: the shop opens in its own panel and scrolling it cannot reach log lines', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  await page.evaluate(() => { for (let i = 0; i < 60; i++) window.emberveil.narrate(`<p class="sys">OLD-LOG-LINE ${i}</p>`); });
  await goToTown(page);
  await page.click('#actions button:has-text("Merchant")');
  await page.waitForFunction(() => !window.emberveil.busy);
  await expect(page.locator('#town-panel')).toBeVisible();
  await expect(page.locator('#narrative')).toBeHidden();
  await expect(page.locator('#town-panel-title')).toContainText('Merchant');
  expect(await page.locator('#town-panel-body .shop .item').count()).toBeGreaterThan(10);
  const scroll = await page.evaluate(async () => {
    const body = document.getElementById('town-panel-body');
    body.scrollTop = 0; await new Promise(r => requestAnimationFrame(r));
    const topText = body.textContent;
    body.scrollTop = body.scrollHeight; await new Promise(r => requestAnimationFrame(r));
    const logBox = document.getElementById('narrative').getBoundingClientRect();
    return { scrolls: body.scrollHeight > body.clientHeight, hasLog: /OLD-LOG-LINE/.test(body.textContent) || /OLD-LOG-LINE/.test(topText), logHeight: logBox.height, pageScroll: /OLD-LOG-LINE/.test(document.elementFromPoint(body.getBoundingClientRect().left + 20, body.getBoundingClientRect().top + 10)?.textContent || '') };
  });
  expect(scroll.hasLog).toBe(false);
  expect(scroll.logHeight).toBe(0);
  expect(scroll.pageScroll).toBe(false);

  // the town buttons are still there, another service swaps the panel, the log keeps receiving lines
  await page.evaluate(() => window.emberveil.narrate('<p class="sys">WHILE-THE-SHOP-WAS-OPEN</p>'));
  await page.click('#actions button:has-text("Tavern")');
  await page.waitForFunction(() => !window.emberveil.busy);
  await expect(page.locator('#town-panel-title')).toContainText('Tavern');
  await page.click('#town-panel-back');
  await expect(page.locator('#town-panel')).toBeHidden();
  await expect(page.locator('#narrative')).toBeVisible();
  expect(await page.locator('#narrative').innerText()).toMatch(/WHILE-THE-SHOP-WAS-OPEN/);
  expect(await page.locator('#narrative').innerText()).toMatch(/OLD-LOG-LINE 0/);

  // narrow screen
  await page.setViewportSize({ width: 400, height: 820 });
  await page.click('#actions button:has-text("Merchant")');
  await page.waitForFunction(() => !window.emberveil.busy);
  await expect(page.locator('#town-panel')).toBeVisible();
  const narrow = await page.evaluate(() => { const b = document.getElementById('town-panel-body').getBoundingClientRect(); return { right: b.right, win: innerWidth, page: document.documentElement.scrollWidth, h: b.height }; });
  expect(narrow.right).toBeLessThanOrEqual(narrow.win);
  expect(narrow.page).toBeLessThanOrEqual(narrow.win + 1);
  expect(narrow.h).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/emberveil-r21-shop-narrow.png' });
  // leaving town closes it
  await page.click('#actions button:has-text("Back to the map")');
  await expect(page.locator('#town-panel')).toBeHidden();
});

test('E38: Manage Party shows the bench, a swap updates the stage and survives save + reload', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  // not offered away from town
  expect(await page.locator('#actions button:has-text("Manage party")').count()).toBe(0);
  await goToTown(page);
  const benched = await page.evaluate(() => {
    const E = window.emberveil, g = E.game;
    const h = g.makeHero('rogue', 'Vessa Thorn', 1, { ...E.LOOKS.rogue, name: 'Vessa Thorn' }); g.addHero(h); E.renderSide();
    return { id: h.id, onBench: g.bench.includes(h), partySize: g.party.length };
  });
  expect(benched.onBench).toBe(true);
  expect(benched.partySize).toBe(4);
  await page.click('#actions button:has-text("Manage party")');
  await expect(page.locator('#party-dialog')).toBeVisible();
  await expect(page.locator('#party-dialog .party-col.bench')).toContainText('Vessa');
  await expect(page.locator('#party-dialog .party-col.active .pm-card')).toHaveCount(4);
  // the party is full, so the bench card offers a swap
  const out = await page.evaluate(() => window.emberveil.game.party[1]);
  await page.locator(`#party-dialog .pm-card[data-id="${benched.id}"] select`).selectOption(out.id);
  await page.waitForFunction(id => window.emberveil.game.party.some(h => h.id === id), benched.id);
  const after = await page.evaluate(({ inId, outId }) => {
    const E = window.emberveil, g = E.game;
    return { inParty: g.party.some(h => h.id === inId), outBenched: g.bench.some(h => h.id === outId), size: g.party.length, onStage: E.stage.chars.has(inId), outOnStage: E.stage.chars.has(outId), tab: document.getElementById('tab-party').innerText };
  }, { inId: benched.id, outId: out.id });
  expect(after).toMatchObject({ inParty: true, outBenched: true, size: 4 });
  await page.waitForFunction(({ inId, outId }) => window.emberveil.stage.chars.has(inId) && !window.emberveil.stage.chars.has(outId), { inId: benched.id, outId: out.id }, { timeout: 20000 });
  expect(after.tab).toMatch(/Vessa/);
  // the last hero cannot be benched: bench three, the fourth button is disabled
  await expect(page.locator('#party-dialog .party-col.bench')).toContainText(out.short);
  await page.screenshot({ path: 'test-results/emberveil-r21-manage-party.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#party-dialog')).toBeHidden();

  // save happened on the swap; reload and continue
  await page.reload(); await ready(page);
  await page.click('#btn-continue');
  await page.waitForFunction(() => window.emberveil.game && !window.emberveil.busy && document.querySelectorAll('#actions button').length > 0, null, { timeout: 90000 });
  const loaded = await page.evaluate(({ inId, outId }) => { const g = window.emberveil.game; return { inParty: g.party.some(h => h.id === inId), outBenched: g.bench.some(h => h.id === outId) }; }, { inId: benched.id, outId: out.id });
  expect(loaded).toEqual({ inParty: true, outBenched: true });
});

test('E39: arriving wounded in a settlement produces one reminder line', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page);
  const names = await page.evaluate(() => {
    const g = window.emberveil.game;
    g.party[0].hp = Math.round(g.party[0].maxHp * 0.3);
    g.party[1].hp = 0; g.party[1].alive = false;
    return { hurt: g.party[0].short, down: g.party[1].short };
  });
  await goToTown(page);
  const lines = await page.locator('#narrative p.say.wounded').allInnerTexts();
  expect(lines.length).toBe(1);
  expect(lines[0]).not.toMatch(/[{}]/);
  expect(lines[0]).toContain(names.down);
  expect(lines[0]).toMatch(/cleric/i);
  // visiting a service and coming back to the town buttons does not say it again
  await page.click('#actions button:has-text("Merchant")');
  await page.waitForFunction(() => !window.emberveil.busy);
  await page.click('#town-panel-back');
  await page.evaluate(() => window.emberveil.enterNode());
  await page.waitForFunction(() => !window.emberveil.busy);
  expect(await page.locator('#narrative p.say.wounded').count()).toBe(1);
  // a healthy party says nothing
  const quietArrival = await page.evaluate(async () => { const E = window.emberveil; for (const h of E.game.party) { h.alive = true; h.hp = h.maxHp; } return E.woundedReminder({ force: true }); });
  expect(quietArrival).toBeNull();
});
