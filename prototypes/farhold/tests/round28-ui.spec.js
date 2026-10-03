// Farhold round 28 — the skill and talent SCREENS, in the real page.
//
// tests/round28-skills.spec.js checks that the new mechanics work in the field. This file checks
// that a player can READ them: the Skills tab draws each skill's own four-tier tree with the
// generated text and what each pick moves, the hover card names a shape's effect on the rest of
// the bar, the title screen and the builder show the mechanics, and an old save says its talents
// were returned. Screenshots (desktop and a narrow window) land in research/round28-ui/.
//
//   flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/farhold/tests/round28-ui.spec.js

import { test, expect } from '@playwright/test';

const SHOTS = 'prototypes/farhold/research/round28-ui';

async function land(page, cls, { level = 30, query = '' } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=7&class=${cls}${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  if (level) {
    await page.evaluate(lv => {
      const f = window.farhold;
      f.pause(false);
      while (f.player.level < lv) f.rpg.gainXp(f.player, 50000);
      f.rpg.refresh(f.player, { full: true });
      f.player.mp = f.player.maxMp;
      f.hud.skills(f.skills.state());
    }, level);
  }
  return errors;
}

async function openSkills(page, skillId) {
  await page.evaluate(id => {
    const f = window.farhold;
    f.hud.skills(f.skills.state());
    f.hud.toggleSheet(true);
    f.hud.talentSkill = id;
    f.hud.setTab('skills');
  }, skillId);
  await page.waitForTimeout(300);
}

test('the Skills tab: a skill heads its own four-tier tree, with what each pick changes', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await land(page, 'warrior', { level: 30 });
  await openSkills(page, 'cleave');

  const tree = await page.evaluate(() => {
    const box = document.getElementById('sheet-skilltree');
    const tiers = [...box.querySelectorAll('.st-tier')];
    return {
      head: box.querySelector('.st-skill')?.textContent || '',
      tiers: tiers.map(t => ({
        head: t.querySelector('.tier-head')?.textContent || '',
        cards: [...t.querySelectorAll('.talent-card')].map(c => ({
          name: c.querySelector('b')?.textContent, text: c.textContent,
          shared: c.classList.contains('shared'), delta: c.querySelector('.tc-delta')?.textContent || '',
        })),
      })),
      pips: document.querySelectorAll('#sheet-skillbar .sk-card')[0]?.querySelectorAll('.sk-pips i').length,
      foot: document.getElementById('sheet-talent-summary')?.textContent || '',
    };
  });
  expect(errors).toEqual([]);
  expect(tree.head).toContain('Cleave');
  expect(tree.head).toMatch(/weapon damage/);
  expect(tree.tiers.length, 'four tiers').toBe(4);
  expect(tree.pips, 'the bar card shows a dot per tier, four of them').toBe(4);
  for (const t of tree.tiers) {
    expect(t.cards.filter(c => !c.shared).length, `${t.head}: two bespoke nodes`).toBe(2);
    expect(t.cards.filter(c => c.shared).length, `${t.head}: one shared node`).toBe(1);
    for (const c of t.cards) expect(c.text, c.name).not.toMatch(/undefined|NaN|\[object|\{/);
    expect(t.head).toMatch(/free pick/);
  }
  // Reaping Arc turns Cleave from a ring into a strike in front — and the card says so in numbers
  const reaping = tree.tiers[0].cards.find(c => c.name === 'Reaping Arc');
  expect(reaping.delta).toMatch(/Shape around you → strike in front/);
  expect(reaping.delta).toMatch(/Reach 5.5 m/);
  expect(tree.foot).toMatch(/Unbinder/);

  await page.screenshot({ path: `${SHOTS}/skills-tab-warrior.png` });

  // pick tier 1: the card is taken, its two neighbours are dimmed as "tier spent"
  await page.locator('#sheet-skilltree .st-tier').first().locator('.talent-card', { hasText: 'Hooked Edge' }).click();
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => {
    const t = document.querySelector('#sheet-skilltree .st-tier');
    return {
      on: [...t.querySelectorAll('.talent-card.on')].map(c => c.querySelector('b').textContent),
      spent: t.querySelectorAll('.talent-card.spent').length,
      head: t.querySelector('.tier-head').textContent,
      picks: window.farhold.player.skillTalents.cleave,
      pipOn: document.querySelectorAll('#sheet-skillbar .sk-card')[0].querySelectorAll('.sk-pips i.on').length,
    };
  });
  expect(after.on).toEqual(['Hooked Edge']);
  expect(after.spent).toBe(2);
  expect(after.head).toMatch(/taken/);
  expect(after.picks[1]).toBe('hooked_edge');
  expect(after.pipOn).toBe(1);

  // a lower-level character sees the late tiers locked with the level that opens them
  await page.evaluate(() => { const f = window.farhold; f.player.level = 9; f.hud.renderSheet(); });
  const heads = await page.$$eval('#sheet-skilltree .tier-head', hs => hs.map(h => h.textContent));
  expect(heads[2]).toMatch(/opens at level 18/);
  expect(heads[3]).toMatch(/opens at level 28/);

  // a narrow window: the tiers fold to fewer columns and nothing spills sideways
  await page.evaluate(() => { const f = window.farhold; f.player.level = 30; f.hud.renderSheet(); });
  await page.setViewportSize({ width: 820, height: 900 });
  await page.waitForTimeout(400);
  const narrow = await page.evaluate(() => {
    const box = document.querySelector('#sheet-skilltree .st-tiers');
    const cols = getComputedStyle(box).gridTemplateColumns.split(' ').length;
    return { cols, overflow: box.scrollWidth - box.clientWidth };
  });
  expect(narrow.cols).toBeLessThan(4);
  expect(narrow.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/skills-tab-warrior-narrow.png` });
});

test('the druid: a shape card says what the rest of the bar becomes, and Thornlash lists its other forms', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await land(page, 'druid', { level: 30 });
  await openSkills(page, 'briarback_shape');
  const shape = await page.locator('#sheet-skilltree .st-skill').textContent();
  expect(shape).toContain('Shape · toggle');
  expect(shape).toContain('While in Briarback shape');
  expect(shape).toContain('Thornlash becomes Bramble Gore');
  expect(shape).toContain('Greensap becomes Thornswell');
  expect(shape).toContain('Call the Pack becomes Den Guard');
  // a shape has no shared talent — four tiers of two of its own
  const counts = await page.$$eval('#sheet-skilltree .st-tier', ts => ts.map(t => t.querySelectorAll('.talent-card').length));
  expect(counts).toEqual([2, 2, 2, 2]);
  await page.screenshot({ path: `${SHOTS}/skills-tab-briarback.png` });

  await openSkills(page, 'thornlash');
  const thorn = await page.locator('#sheet-skilltree .st-skill').textContent();
  expect(thorn).toContain('In other forms');
  for (const n of ['Briarback shape: Bramble Gore', 'Fenrunner shape: Venom Lunge', 'Sporecap shape: Spore Lob']) expect(thorn).toContain(n);
  await page.screenshot({ path: `${SHOTS}/skills-tab-thornlash.png` });

  // take the shape: the bar's Thornlash slot is now Bramble Gore, and its hover card says what it is
  const slot = await page.evaluate(async () => {
    const f = window.farhold;
    f.hud.toggleSheet(false);
    const i = f.skills.slots.findIndex(s => s.id === 'briarback_shape');
    f.skills.slots[i].ready = 0; f.player.mp = f.player.maxMp;
    f.cast(i);
    await new Promise(r => setTimeout(r, 300));
    f.hud.skills(f.skills.state());
    const t = f.skills.slots.findIndex(s => s.id === 'thornlash');
    return { t, shapeSlot: i, name: document.querySelectorAll('#skillbar .skill-slot')[t]?.querySelector('.skill-name')?.textContent };
  });
  expect(slot.name).toBe('Bramble Gore');
  /**
   * The hover card, asked for the way the tooltip engine asks for it. While playing, the 3D canvas
   * owns the pointer, so a real hover is checked with the sheet open below.
   */
  const card = idx => page.evaluate(i => {
    const d = document.createElement('div');
    d.innerHTML = window.farhold.hud.skillCardHtml(i);
    return d.textContent;
  }, idx);
  const tip = await card(slot.t);
  expect(tip).toContain('Bramble Gore');
  expect(tip).toContain('Thornlash in Briarback shape');
  expect(tip).toContain('In your other forms');
  expect(tip).toContain('Own body: Thornlash');
  const tip2 = await card(slot.shapeSlot);
  expect(tip2).toMatch(/you are in Briarback/);
  // a real hover on the sheet's bar strip shows the same card in the tooltip box
  await openSkills(page, 'thornlash');
  await page.locator('#sheet-skillbar .sk-card').nth(slot.t).hover();
  await page.waitForSelector('#tipbox:not([hidden])', { timeout: 3000 });
  expect(await page.locator('#tipbox').textContent()).toContain('Thornlash in Briarback shape');
  await page.screenshot({ path: `${SHOTS}/sheet-tooltip-bramble-gore.png` });
  expect(errors).toEqual([]);
});

test('the title screen: a class card shows the mechanics, and the builder groups spells by class', async ({ page }) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('/prototypes/farhold/?quality=low&sound=off&seed=7');
  await page.waitForTimeout(2200);
  await page.click('#boot-new');
  await page.waitForTimeout(800);
  await page.selectOption('#boot-class', 'druid');
  await page.waitForTimeout(500);
  const card = await page.locator('#boot-class-card').textContent();
  expect(card).toContain('Thornlash');
  expect(card).toContain('Shape · toggle');
  expect(card).toContain('Shape · lasts 15s');
  expect(card).toContain('Thornlash becomes Bramble Gore');
  expect(card).toContain('In Briarback shape: Bramble Gore');
  // the six on the card are the class's own six, in slot order
  const names = await page.$$eval('#boot-class-card .cc-skill .cs-top b', bs => bs.map(b => b.textContent));
  expect(names).toEqual(['Thornlash', 'Greensap', 'Briarback Shape', 'Call the Pack', 'Fenrunner Shape', 'Sporecap Shape']);
  await page.screenshot({ path: `${SHOTS}/title-druid.png` });

  await page.selectOption('#boot-class', 'custom');
  await page.waitForTimeout(800);
  await page.click('.cb-open');
  await page.waitForTimeout(1200);
  await page.locator('.cb-rail > *', { hasText: 'Spells' }).click();
  await page.waitForTimeout(600);
  const groups = await page.$$eval('.cb-origin > summary', ss => ss.map(s => s.textContent));
  expect(groups.length, 'spells are grouped by the class they come from').toBeGreaterThan(5);
  expect(groups.some(g => /^Warrior — Frontline Tank( · [^·]+)? · \d+ spells?/.test(g)), groups.join(' | ')).toBe(true);
  // the element filter narrows the list
  const before = await page.locator('.cb-origin .cb-opt').count();
  await page.locator('.cb-filter', { hasText: 'Fire' }).click();
  await page.waitForTimeout(300);
  const after = await page.locator('.cb-choices--spells .cb-opt').count();
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
  await page.locator('.cb-filter', { hasText: 'All elements' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/builder-spells.png` });
  await page.setViewportSize({ width: 820, height: 900 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/builder-spells-narrow.png` });
  expect(errors).toEqual([]);
});

test('an old save whose talent picks were dropped says so once, and the Skills tab keeps a banner', async ({ page }) => {
  test.setTimeout(240000);
  await land(page, 'warrior', { level: 30 });
  // write a save the way round 27 would have: no talentsVersion stamp, picks from the old shared board
  // written under a NEW id: leaving the page autosaves the live run over its own slot, which
  // would put the stamp straight back on an edited copy of it
  const oldId = await page.evaluate(async () => {
    const f = window.farhold;
    f.saveNow();
    await new Promise(r => setTimeout(r, 300));
    const all = JSON.parse(localStorage.getItem('farhold.saves.v1'));
    const id = localStorage.getItem('farhold.lastSave');
    const s = all[id];
    delete s.talentsVersion;
    if (s.player) delete s.player.talentsVersion;
    // cleave's tier 1 shares `wide` (kept); `fan` was never Cleave's, `burst` is not its tier 2
    // shared pick, and Execute is not on a warrior's bar any more — three dropped
    s.player.skillTalents = { cleave: { 1: 'wide', 2: 'burst' }, firebolt: { 1: 'fan' }, execute: { 1: 'wide' } };
    const copy = { ...s, id: 'r28-old-save' };
    all['r28-old-save'] = copy;
    localStorage.setItem('farhold.saves.v1', JSON.stringify(all));
    return 'r28-old-save';
  });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(`/prototypes/farhold/?load=${oldId}&quality=low&sound=off`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('hud-notice')?.classList.contains('show'), null, { timeout: 15000 });
  const notice = await page.locator('#hud-notice').textContent();
  expect(notice).toContain('3 picks were returned');
  const out = await page.evaluate(() => {
    const f = window.farhold;
    const lines = (f.hud.history || f.hud.logHistory || []).map(x => (typeof x === 'string' ? x : x.text || ''));
    return { picks: f.player.skillTalents, logged: lines.filter(t => /talents were reworked/.test(t)).length };
  });
  expect(out.picks).toEqual({ cleave: { 1: 'wide' } });
  await page.screenshot({ path: `${SHOTS}/migration-notice.png` });

  await openSkills(page, 'cleave');
  const banner = page.locator('#sheet-skilltree .st-returned');
  await expect(banner).toContainText('3 picks were returned');
  await page.screenshot({ path: `${SHOTS}/migration-banner.png` });
  await banner.locator('button').click();
  await expect(page.locator('#sheet-skilltree .st-returned')).toHaveCount(0);
  if (out.logged) expect(out.logged, 'the notice is logged once, not twice').toBe(1);
  expect(errors).toEqual([]);
});
