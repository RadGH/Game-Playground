// The presentation round, in the browser: number formatting (E5), recover wording (E7), enemies
// walking on (E9), the familiar talent (E19), the victory popup's skip (E24), floating health bars
// with a shield segment (E25 / E32), framing with pets on the stage (E30) and the perf overlay (E31).
import { test, expect } from '@playwright/test';

const LONG_DECIMAL = /\d+\.\d{3,}/;

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/prototypes/emberveil/');
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 });
  await page.click('#btn-new'); await page.click('#btn-suggest'); await page.click('#btn-start');
  await page.waitForFunction(() => !window.emberveil.busy && document.querySelectorAll('#actions button').length > 0, null, { timeout: 90000 });
  return errors;
}

test('Emberveil 2 round 20: bars, walk-in, pets, skip, formatting, perf overlay', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  await page.evaluate(() => { window.emberveil.rewardPopups = false; });

  // ---- E9: the enemies walk on before the first round -------------------------------------------
  const march = await page.evaluate(async () => {
    const E = window.emberveil, st = E.stage;
    const enc = E.game.encounter('goblin_patrol');
    await st.setSide(enc.enemies.map(E.enemyLook), 'right');
    const homes = [...st.chars.values()].filter(c => c.side === 'right').map(c => c.home.x);
    const t0 = performance.now();
    const n = await st.marchIn('right', { ms: 400, stagger: 60 });
    const ms = performance.now() - t0;
    const at = [...st.chars.values()].filter(c => c.side === 'right').map(c => c.group.position.x);
    return { n, ms, homes, at, edge: st.worldFrame.width / 2 };
  });
  expect(march.n).toBeGreaterThan(0);
  expect(march.ms).toBeGreaterThan(300);                                   // it takes real time
  march.at.forEach((x, i) => expect(Math.abs(x - march.homes[i])).toBeLessThan(0.02));   // and ends in the line-up

  // ---- E25 / E32: floating health bars with a shield segment ------------------------------------
  const bars = await page.evaluate(async () => {
    const E = window.emberveil, st = E.stage;
    const enc = E.game.encounter('goblin_patrol');
    const heroes = E.game.fighters();
    await st.setSide(heroes.map(E.bodyOf), 'left');
    await st.setSide(enc.enemies.map(E.enemyLook), 'right');
    const units = [...heroes, ...enc.enemies];
    for (const u of units) { u.statuses = []; u.hp = Math.round(u.maxHp * 0.5); }
    units[0].statuses = [{ type: 'barrier', power: Math.round(units[0].maxHp * 0.25), duration: 3 }];
    st.syncBars(units);
    st.updateBars();
    const el = document.querySelectorAll('.stage-bars .sb');
    const first = document.querySelector('.stage-bars .sb');
    const shields = [...document.querySelectorAll('.stage-bars .shfill')].map(i => parseFloat(i.style.width) || 0);
    return { count: el.length, wanted: units.length, hpWidth: first.querySelector('.hpfill').style.width, shieldMax: Math.max(...shields), shieldOf: st.shieldOf(units[0]) };
  });
  expect(bars.count).toBe(bars.wanted);
  expect(parseFloat(bars.hpWidth)).toBeGreaterThan(30);
  expect(parseFloat(bars.hpWidth)).toBeLessThan(70);
  expect(bars.shieldOf).toBeGreaterThan(0);
  expect(bars.shieldMax).toBeGreaterThan(5);

  // the party tab draws the same shield segment on its own hp bar
  const partyShield = await page.evaluate(() => {
    const g = window.emberveil.game;
    g.party[0].statuses = [{ type: 'barrier', power: Math.round(g.party[0].maxHp * 0.3), duration: 3 }];
    window.emberveil.renderPartyTab();
    const seg = document.querySelector('#tab-party .bar i.shield');
    return { has: !!seg, width: seg ? parseFloat(seg.style.width) : 0, tip: document.querySelector('#tab-party .bar')?.dataset.tip || '' };
  });
  expect(partyShield.has).toBe(true);
  expect(partyShield.width).toBeGreaterThan(5);
  expect(partyShield.tip).toContain('shield');

  // ---- E30: six bodies on one side all stay inside the frame -----------------------------------
  const framing = await page.evaluate(async () => {
    const E = window.emberveil, st = E.stage;
    const six = E.game.fighters().map(E.bodyOf).slice(0, 4);
    while (six.length < 6) six.push({ ...six[0], id: 'pet' + six.length, name: 'Pet ' + six.length });
    await st.setSide(six, 'left');
    st.frame('fight');
    const THREE = st.scene.THREE;
    const out = [];
    for (const c of st.chars.values()) {
      if (c.side !== 'left') continue;
      const v = new THREE.Vector3(); c.group.getWorldPosition(v); v.project(st.scene.camera);
      out.push(v.x);
    }
    return { xs: out, width: st.worldFrame.width };
  });
  expect(framing.xs.length).toBe(6);
  for (const x of framing.xs) expect(Math.abs(x)).toBeLessThan(0.97);   // nobody is off the side of the stage

  // ---- E19: the Arcane Familiar talent puts a familiar in the party -----------------------------
  const pet = await page.evaluate(async () => {
    const E = window.emberveil, g = E.game;
    const mage = g.party.find(h => h.class === 'mage') || g.party[0];
    mage.class = 'mage'; if (!mage.skills.includes('magic_missile')) mage.skills.push('magic_missile');
    mage.talents.mg_familiar = true;
    const before = g.companions.length;
    const added = E.game && window.emberveil.renderSide && (await (async () => { const m = await import('/prototypes/emberveil/js/effects.js'); return m.syncCompanions(g); })());
    window.emberveil.renderSide();
    await E.stage.setSide(g.fighters().map(E.bodyOf), 'left');
    return { before, after: g.companions.length, names: g.companions.map(c => c.name), onStage: [...E.stage.chars.keys()].length, ids: g.companions.map(c => c.id), stageIds: [...E.stage.chars.keys()] };
  });
  expect(pet.after).toBe(pet.before + 1);
  expect(pet.names).toContain('Arcane Familiar');
  expect(pet.stageIds).toEqual(expect.arrayContaining([pet.ids[pet.ids.length - 1]]));
  await page.click('.tabs button[data-tab="party"]');
  await expect(page.locator('#tab-party')).toContainText('Arcane Familiar');

  // ---- E5 / E7: run a fight and read every rendered number --------------------------------------
  await page.evaluate(async () => {
    const E = window.emberveil, g = E.game;
    // gear that rolls fractional affix values is what used to leak "recovers 14.68"
    for (const h of g.party) { const it = g.loot.generate('ring', 'rare', 'high'); if (it) { it.affixes.push({ id: 'x', name: 'Mending', stat: 'hpRegen', value: 2.37 }, { id: 'y', name: 'Leeching', stat: 'lifeSteal', value: 7.31 }); g.inventory.push(it); } }
    const enc = g.encounter('goblin_patrol');
    for (const e of enc.enemies) e.hp = Math.min(e.hp, 12);
    for (const h of g.party) h.hp = Math.max(1, Math.round(h.maxHp * 0.4));
    await E.fight(enc, { node: null });
  });
  const text = await page.evaluate(() => ({
    log: document.getElementById('narrative').innerText,
    party: document.getElementById('tab-party').innerText,
    meter: document.getElementById('tab-meter').innerText,
    bag: document.getElementById('tab-bag').innerText,
  }));
  for (const [where, body] of Object.entries(text)) {
    const bad = (body.match(/\d+\.\d{3,}/g) || []);
    expect(bad, `${where}: ${bad.slice(0, 5).join(', ')}`).toEqual([]);
  }
  expect(text.log).toMatch(/hits .+ for \d+ damage/);
  // every "recovers" line names the resource and the reason
  for (const line of text.log.split('\n').filter(l => l.includes('recovers'))) {
    expect(line, line).toMatch(/recovers \d+ (health|mana)/);
  }
  // tooltips are formatted too
  const tips = await page.evaluate(() => [...document.querySelectorAll('[data-tip], [data-tip-html]')].map(e => (e.dataset.tip || '') + ' ' + (e.dataset.tipHtml || '')).join(' '));
  expect((tips.match(/\d+\.\d{3,}/g) || []).slice(0, 5)).toEqual([]);

  // ---- E24: the rewards popup skips to the full result on a click ------------------------------
  const skip = await page.evaluate(async () => {
    window.emberveil.rewardPopups = true;
    const p = window.emberveil.showRewardsFor({ title: 'Victory', subtitle: 'test', gold: 120, xp: 45, fame: 2,
      items: [{ name: 'Test Blade', rarity: 'rare', slot: 'Weapon', lines: ['10–19 damage'] }, { name: 'Test Ring', rarity: 'legendary', slot: 'Ring', lines: [] }],
      extras: [{ kind: 'level', text: 'Someone reaches level 4' }] });
    await new Promise(r => setTimeout(r, 120));
    const before = { items: [...document.querySelectorAll('.rw-item')].filter(n => n.style.visibility !== 'hidden').length, btn: document.querySelector('.rw-btn')?.style.visibility };
    document.querySelector('.rw-card').click();           // a click on the popup itself
    await new Promise(r => setTimeout(r, 60));
    const after = { items: [...document.querySelectorAll('.rw-item')].filter(n => n.style.visibility !== 'hidden').length,
      btn: document.querySelector('.rw-btn')?.style.visibility,
      gold: document.querySelector('.rw-counter.gold span')?.textContent, open: !!document.querySelector('.rw-overlay') };
    document.querySelector('.rw-card').click();           // a second click closes it
    await p;
    return { before, after, closed: !document.querySelector('.rw-overlay:not(.rw-closing)') };
  });
  expect(skip.before.items).toBeLessThan(2);          // still being revealed
  expect(skip.after.items).toBe(2);                   // one click showed everything
  expect(skip.after.btn).toBe('');                    // and the Continue button
  expect(skip.after.gold).toBe('120');                // counters jumped to their final value
  expect(skip.closed).toBe(true);                     // the second click closed it
  await page.evaluate(() => { window.emberveil.rewardPopups = false; });

  // ---- E31: the perf overlay ---------------------------------------------------------------------
  const perf = await page.evaluate(() => {
    const st = window.emberveil.stage;
    st.showPerf(true); st.tickPerf(0.6); st.tickPerf(0.6);
    const box = document.querySelector('.stage-perf');
    const stats = st.perfStats();
    const text = box?.textContent || '';
    st.showPerf(false);
    return { shown: !!box, gone: !document.querySelector('.stage-perf'), text, stats };
  });
  expect(perf.shown).toBe(true);
  expect(perf.gone).toBe(true);
  expect(perf.text).toMatch(/fps/);
  expect(perf.text).toMatch(/fx sprites/);
  expect(perf.stats.bodies).toBeGreaterThan(0);
  expect(typeof perf.stats.calls).toBe('number');

  expect(errors.filter(e => !/AudioContext|WebGL|Clock|ShadowMap/i.test(e))).toEqual([]);
});
