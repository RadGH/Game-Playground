// Round 22 in the browser: the merchant stays in sync after buy + equip (E43), the page never scrolls (E45),
// compare cards on every item (E46), a working blacksmith and enchanter (E47) and one rarity colour everywhere (E48).
import { test, expect } from '@playwright/test';

async function ready(page) { await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90000 }); }
async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/prototypes/emberveil/');
  await ready(page);
  await page.evaluate(() => { try { localStorage.removeItem('playground:emberveil:save:v1'); } catch {} });
  await page.click('#btn-new'); await page.click('#btn-suggest'); await page.click('#btn-start');
  await page.waitForFunction(() => !window.emberveil.busy && document.querySelectorAll('#actions button').length > 0, null, { timeout: 90000 });
  await page.evaluate(() => {
    const m = document.getElementById('mute'); m.checked = true; m.dispatchEvent(new Event('change'));
    const t = document.getElementById('text-speed'); t.value = '0.3'; t.dispatchEvent(new Event('change'));
    window.emberveil.rewardPopups = false;
  });
  return errors;
}
/** Walk into the Border Roads settlement and wait for its buttons. */
async function goToTown(page) {
  await page.evaluate(() => { const g = window.emberveil.game; if (!g.unlockedZones.includes('border_roads')) g.unlockedZones.push('border_roads'); g.enterZone('border_roads'); g.act = 1; g.gold = 5000; });
  await page.evaluate(() => window.emberveil.enterNode());
  await page.waitForFunction(() => !window.emberveil.busy && [...document.querySelectorAll('#actions button')].some(b => b.textContent === 'Merchant'), null, { timeout: 60000 });
}
/** A town with every service, drawn through the real town buttons. */
async function bigTown(page, act = 3) {
  await page.evaluate(a => { const E = window.emberveil; E.game.act = a; E.game.gold = 20000; E.townActions({ id: 'test_bastion', name: 'Test Bastion', act: a, services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer', 'enchanter'] }); }, act);
  await page.waitForFunction(() => [...document.querySelectorAll('#actions button')].some(b => b.textContent === 'Blacksmith'));
}
const clickAction = (page, text) => page.locator('#actions button', { hasText: new RegExp(`^${text}$`) }).click();
async function hoverTip(page, locator) {
  await page.mouse.move(2, 2); await page.waitForTimeout(80);
  await locator.hover();
  await page.waitForSelector('#tipbox.show', { timeout: 5000 });
  return page.locator('#tipbox');
}

test('E43: buy then equip — the shop, the bag, the party tab and the reopened card agree without reopening the merchant', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  await goToTown(page);
  await clickAction(page, 'Merchant');
  await expect(page.locator('#town-panel')).toBeVisible();
  // pick an armour piece from the stock (any class can wear it)
  const id = await page.evaluate(() => { const E = window.emberveil; const t = document.querySelector('#town-panel-body'); const ids = [...t.querySelectorAll('[data-shop-buy]')].map(b => b.dataset.shopBuy); return ids.find(i => { const it = E.findItem(i); return it && it.type !== 'weapon' && it.slot !== 'ring'; }) || ids[0]; });
  expect(id).toBeTruthy();
  const gold0 = await page.evaluate(() => window.emberveil.game.gold);
  await page.locator(`#town-panel-body [data-shop-buy="${id}"]`).click();
  // bought: gone from "For sale" at once, and sitting in "Sell"
  await expect(page.locator(`#town-panel-body [data-shop-buy="${id}"]`)).toHaveCount(0);
  await expect(page.locator(`#town-panel-body [data-shop-sell="${id}"]`)).toHaveCount(1);
  const price = await page.evaluate(i => window.emberveil.findItem(i).price, id);
  expect(await page.evaluate(() => window.emberveil.game.gold)).toBe(gold0 - price);

  // open the card from the Sell row and equip it on the selected hero, counting stage restages
  await page.evaluate(() => { const st = window.emberveil.stage; const orig = st.setSide.bind(st); window.__restaged = 0; st.setSide = (...a) => { window.__restaged++; return orig(...a); }; });
  await page.locator(`#town-panel-body .item[data-item-id="${id}"] .n`).click();
  await expect(page.locator('#item-dialog .item-state')).toHaveAttribute('data-where', 'bag');
  await page.locator('#item-dialog [data-action="equip"]').click();
  await expect(page.locator('#item-dialog')).not.toHaveAttribute('open', '');
  const worn = await page.evaluate(i => { const E = window.emberveil; const w = E.whereIs(E.findItem(i)); return { where: w.where, hero: w.hero?.short, sel: E.game.party[E.selectedHero].short, inBag: E.game.inventory.some(x => x.id === i) }; }, id);
  expect(worn.where).toBe('worn'); expect(worn.hero).toBe(worn.sel); expect(worn.inBag).toBe(false);
  // the merchant screen followed without clicking Merchant again: no sell row, no buy row
  await expect(page.locator(`#town-panel-body [data-shop-sell="${id}"]`)).toHaveCount(0);
  await expect(page.locator(`#town-panel-body [data-shop-buy="${id}"]`)).toHaveCount(0);
  // the party tab shows it, the stage was redrawn
  await page.locator('.tabs button[data-tab="party"]').click();
  expect(await page.locator(`#tab-party .slot[data-item-id="${id}"]`).count()).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__restaged)).toBeGreaterThan(0);
  // reopen the card: it knows the item is worn, and by whom
  await page.evaluate(i => window.emberveil.itemDialog(window.emberveil.findItem(i)), id);
  await expect(page.locator('#item-dialog .item-state')).toHaveAttribute('data-where', 'worn');
  await expect(page.locator('#item-dialog .item-state')).toContainText(worn.hero);
  await expect(page.locator('#item-dialog [data-action="equip"]')).toBeDisabled();
  await page.locator('#item-dialog button', { hasText: 'Close' }).click();

  // straight from "For sale": the card offers Buy & equip, and doing it takes it off the table
  const id2 = await page.evaluate(() => { const E = window.emberveil; return [...document.querySelectorAll('#town-panel-body [data-shop-buy]')].map(b => b.dataset.shopBuy).find(i => { const it = E.findItem(i); return it && it.type !== 'weapon'; }); });
  if (id2) {
    await page.locator(`#town-panel-body .item[data-item-id="${id2}"] .n`).first().click();
    await expect(page.locator('#item-dialog .item-state')).toHaveAttribute('data-where', 'shop');
    await expect(page.locator('#item-dialog [data-action="equip"]')).toContainText('Buy & equip');
    await page.locator('#item-dialog [data-action="equip"]').click();
    await expect(page.locator(`#town-panel-body [data-shop-buy="${id2}"]`)).toHaveCount(0);
    expect(await page.evaluate(i => window.emberveil.whereIs(window.emberveil.findItem(i)).where, id2)).toBe('worn');
  }
  // selling: the row goes and the gold comes in, on the same screen
  const sellId = await page.evaluate(() => document.querySelector('#town-panel-body [data-shop-sell]')?.dataset.shopSell);
  if (sellId) {
    const g1 = await page.evaluate(() => window.emberveil.game.gold);
    await page.locator(`#town-panel-body [data-shop-sell="${sellId}"]`).click();
    await expect(page.locator(`#town-panel-body [data-shop-sell="${sellId}"]`)).toHaveCount(0);
    expect(await page.evaluate(() => window.emberveil.game.gold)).toBeGreaterThan(g1);
  }
  expect(errors).toEqual([]);
});

test('E45: the page itself never scrolls at common desktop sizes — world, town panel, fight', async ({ page }) => {
  test.setTimeout(300000);
  const errors = await boot(page);
  const sizes = [[1280, 720], [1366, 768], [1920, 1080]];
  const measure = () => page.evaluate(() => {
    const se = document.scrollingElement; const b = s => document.querySelector(s)?.getBoundingClientRect().bottom ?? 0;
    return { sh: se.scrollHeight, ih: innerHeight, sw: se.scrollWidth, iw: innerWidth, actions: b('#actions'), side: b('.side'), map: b('.map-panel') };
  });
  const check = async where => {
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
      const m = await measure();
      expect(m.sh, `${where} ${w}x${h}: page ${m.sh}px tall in a ${m.ih}px window`).toBeLessThanOrEqual(m.ih);
      expect(m.sw, `${where} ${w}x${h}: no sideways scroll`).toBeLessThanOrEqual(m.iw);
      // nothing important was pushed out of sight to get there
      for (const k of ['actions', 'side', 'map']) expect(m[k], `${where} ${w}x${h}: ${k} bottom`).toBeLessThanOrEqual(m.ih + 1);
    }
  };
  await check('world');
  await goToTown(page);
  await clickAction(page, 'Merchant');
  await expect(page.locator('#town-panel')).toBeVisible();
  await check('town panel');
  // a fight: start it and measure while the rounds run
  const fight = page.evaluate(async () => { const E = window.emberveil, g = E.game; for (const h of g.party) { h.alive = true; h.hp = h.maxHp; } const enc = g.encounter('goblin_patrol'); for (const e of enc.enemies) { e.hp = e.maxHp = 80; } await E.fight(enc, { node: null }); });
  await page.waitForFunction(() => window.emberveil.inFight, null, { timeout: 30000 });
  await check('fight');
  await fight;
  // narrow: stacked on purpose (the page scrolls there), but never sideways
  await page.setViewportSize({ width: 420, height: 800 }); await page.waitForTimeout(250);
  const narrow = await measure();
  expect(narrow.sw).toBeLessThanOrEqual(narrow.iw);
  expect(errors).toEqual([]);
});

test('E46: compare cards — bag rings against both rings, set progress, class use, the selected hero, loot popup and smith rows', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  const ids = await page.evaluate(() => {
    const E = window.emberveil, g = E.game;
    const h0 = g.party[0];
    const ring = g.loot.generate('ring', 'rare', 'high');
    const setId = g.loot.d.sets.find(s => (s.classes || []).includes(h0.class) && s.items.some(p => p.slot !== 'weapon'))?.id;
    const set = g.loot.d.sets.find(s => s.id === setId); const pi = set.items.findIndex(p => p.slot !== 'weapon');
    const piece = g.loot.generateSetItem(setId, pi, 'high');
    const dagger = g.loot.generate('dagger', 'magic', 'medium');
    g.inventory.push(ring, piece, dagger); E.renderSide();
    return { ring: ring.id, piece: piece.id, dagger: dagger.id, setName: set.name, h0: h0.short, h1: g.party[1].short, weapons: h0.weapons };
  });
  await page.locator('.tabs button[data-tab="bag"]').click();
  // a ring is compared with the left AND the right ring
  let tip = await hoverTip(page, page.locator(`#tab-bag .item[data-item-id="${ids.ring}"] .n`));
  await expect(tip.locator('.tipcmp')).toBeVisible();
  await expect(tip.locator('.tipcmp-diff th', { hasText: 'Ring (left)' })).toHaveCount(1);
  await expect(tip.locator('.tipcmp-diff th', { hasText: 'Ring (right)' })).toHaveCount(1);
  expect(await tip.locator('.tipcmp-diff .good, .tipcmp-diff .bad, .tipcmp-diff .even').count()).toBeGreaterThan(2);
  await expect(tip.locator('.tipcmp')).toHaveAttribute('data-hero', await page.evaluate(() => window.emberveil.game.party[0].id));
  // a set piece shows its set, the pieces and the bonus steps
  tip = await hoverTip(page, page.locator(`#tab-bag .item[data-item-id="${ids.piece}"] .n`));
  await expect(tip.locator('.set-block')).toContainText(ids.setName);
  await expect(tip.locator('.set-step').first()).toBeVisible();
  await expect(tip).toContainText('Made for');
  // a weapon the selected hero cannot use says so
  if (!ids.weapons.includes('dagger')) { tip = await hoverTip(page, page.locator(`#tab-bag .item[data-item-id="${ids.dagger}"] .n`)); await expect(tip.locator('.use-no')).toContainText('cannot use daggers'); }
  // switch the selected hero: the card follows
  await page.evaluate(() => window.emberveil.selectHero(1));
  tip = await hoverTip(page, page.locator(`#tab-bag .item[data-item-id="${ids.ring}"] .n`));
  await expect(tip.locator('.tipcmp')).toHaveAttribute('data-hero', await page.evaluate(() => window.emberveil.game.party[1].id));
  await expect(tip.locator('.tipcmp-label').first()).toBeVisible();
  // the loot popup: hover a card
  await page.evaluate(i => { const E = window.emberveil; E.rewardPopups = true; const it = E.findItem(i); window.__rw = E.showRewardsFor({ title: 'Victory', gold: 5, items: [{ name: it.name, rarity: it.rarity, set: true, slot: 'Chest', lines: [], itemId: it.id }] }); }, ids.piece);
  await page.locator('.rw-card').click();   // skip the animation
  tip = await hoverTip(page, page.locator('.rw-item').first());
  await expect(tip.locator('.tipcmp')).toBeVisible();
  await page.keyboard.press('Escape'); await page.evaluate(() => window.__rw); await page.evaluate(() => { window.emberveil.rewardPopups = false; });
  // merchant rows and blacksmith rows use the same card
  await goToTown(page); await clickAction(page, 'Merchant');
  tip = await hoverTip(page, page.locator('#town-panel-body .item[data-item-id] .n').first());
  await expect(tip.locator('.tipcmp')).toBeVisible();
  await bigTown(page); await clickAction(page, 'Blacksmith');
  tip = await hoverTip(page, page.locator('#town-panel-body .item[data-item-id] .n').first());
  await expect(tip.locator('.tipcmp')).toBeVisible();
  expect(errors).toEqual([]);
});

test('E47: the blacksmith upgrades quality and the enchanter adds, rerolls and raises rarity — gold, preview, log', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  await goToTown(page);
  const ids = await page.evaluate(() => {
    const E = window.emberveil, g = E.game;
    const sword = g.loot.generate('longsword', 'magic', 'low');
    const rare = g.loot.generate('sword', 'rare', 'medium');
    const plain = g.loot.generate('sword', 'normal', 'medium');
    g.inventory.push(sword, rare, plain); E.renderSide();
    const chest = g.party[0].equipment.chest;
    return { sword: sword.id, rare: rare.id, plain: plain.id, chest: chest?.id || null };
  });
  await bigTown(page, 3);

  // ---- blacksmith
  await clickAction(page, 'Blacksmith');
  await expect(page.locator('#town-panel-title')).toHaveText('Blacksmith');
  await page.locator(`#town-panel-body [data-svc-pick="${ids.sword}"]`).click();
  const pv = page.locator('.svc-preview[data-svc="upgrade"]');
  await expect(pv).toContainText('low'); await expect(pv).toContainText('medium');
  const upBtn = pv.locator('[data-svc-action="upgrade"]');
  await expect(upBtn).toContainText('Upgrade to medium');
  const before = await page.evaluate(i => { const it = window.emberveil.findItem(i); return { gold: window.emberveil.game.gold, dmg: [...it.dmg] }; }, ids.sword);
  const cost = Number((await upBtn.textContent()).match(/(\d+)g/)[1]);
  const previewDmg = await pv.locator('.svc-cmp b').first().textContent();
  await upBtn.click();
  const after = await page.evaluate(i => { const it = window.emberveil.findItem(i); return { gold: window.emberveil.game.gold, dmg: [...it.dmg], quality: it.quality }; }, ids.sword);
  expect(after.quality).toBe('medium'); expect(after.gold).toBe(before.gold - cost);
  expect(after.dmg[1]).toBeGreaterThan(before.dmg[1]); expect(previewDmg).toBe(`${after.dmg[0]}–${after.dmg[1]}`);
  await expect(page.locator('.svc-preview[data-svc="upgrade"] [data-svc-action="upgrade"]')).toContainText('Upgrade to high');   // the screen redrew itself
  expect(await page.evaluate(() => [...document.querySelectorAll('#narrative p')].some(p => /The smith works .* up from low to medium/.test(p.textContent)))).toBe(true);
  // an equipped piece: the wearer's armour follows
  if (ids.chest) {
    const a0 = await page.evaluate(() => window.emberveil.game.party[0].derived.armor);
    await page.locator(`#town-panel-body [data-svc-pick="${ids.chest}"]`).click();
    const b = page.locator('.svc-preview[data-svc="upgrade"] [data-svc-action="upgrade"]');
    if (await b.isEnabled()) { await b.click(); await expect.poll(() => page.evaluate(() => window.emberveil.game.party[0].derived.armor)).toBeGreaterThan(a0); }
  }

  // ---- enchanter: add
  await clickAction(page, 'Enchanter');
  await expect(page.locator('#town-panel-title')).toHaveText('Enchanter');
  await page.locator(`#town-panel-body [data-svc-pick="${ids.rare}"]`).click();
  const ev = page.locator('.svc-preview[data-svc="enchant"]');
  const addBtn = ev.locator('[data-svc-action="add"]');
  await expect(addBtn).toBeVisible();
  const addCost = Number((await addBtn.textContent()).match(/(\d+)g/)[1]);
  const newProp = (await ev.locator('.svc-add .svc-prop.new b').textContent()).trim();
  const e0 = await page.evaluate(i => ({ gold: window.emberveil.game.gold, n: window.emberveil.findItem(i).affixes.length }), ids.rare);
  await addBtn.click();
  const e1 = await page.evaluate(i => { const E = window.emberveil; const it = E.findItem(i); return { gold: E.game.gold, n: it.affixes.length, last: E.game.loot.describe(it.affixes[it.affixes.length - 1]) }; }, ids.rare);
  expect(e1.n).toBe(e0.n + 1); expect(e1.gold).toBe(e0.gold - addCost); expect(e1.last).toBe(newProp);
  // reroll: preview → confirm → exactly the previewed property
  await page.locator('.svc-preview[data-svc="enchant"] [data-svc-action="reroll-pick"]').first().click();
  const rr = page.locator('.svc-reroll');
  await expect(rr).toBeVisible();
  const becomes = (await rr.locator('.svc-prop.new b').textContent()).trim();
  const rCost = Number((await rr.locator('[data-svc-action="reroll"]').textContent()).match(/(\d+)g/)[1]);
  const g2 = await page.evaluate(() => window.emberveil.game.gold);
  await rr.locator('[data-svc-action="reroll"]').click();
  const r2 = await page.evaluate(i => { const E = window.emberveil; const it = E.findItem(i); return { gold: E.game.gold, props: it.affixes.map(a => E.game.loot.describe(a)), rerolls: it.rerolls }; }, ids.rare);
  expect(r2.props).toContain(becomes); expect(r2.gold).toBe(g2 - rCost); expect(r2.rerolls).toBe(1);
  expect(await page.evaluate(() => [...document.querySelectorAll('#narrative p')].some(p => /reweaves/.test(p.textContent)))).toBe(true);
  // raise rarity
  await page.locator(`#town-panel-body [data-svc-pick="${ids.plain}"]`).click();
  await page.locator('.svc-preview[data-svc="enchant"] [data-svc-action="promote"]').click();
  expect(await page.evaluate(i => window.emberveil.findItem(i).rarity, ids.plain)).toBe('magic');
  expect(errors).toEqual([]);
});

test('E48: a set piece, a unique and a rare have the same name colour and gem in the bag, tooltip, card, shop, log, party tab and loot popup', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  await goToTown(page);
  const made = await page.evaluate(() => {
    const E = window.emberveil, g = E.game;
    const set = g.loot.d.sets.find(s => s.id === 'iron_brigade');
    const piece = g.loot.generateSetItem(set.id, 0, 'high');
    const unique = g.loot.generateUnique(g.loot.d.uniques[0].id);
    const rare = g.loot.generate('ring', 'rare', 'medium');
    g.inventory.push(piece, unique, rare);
    const colors = E.DATA.items.rarityColors; const gems = E.DATA.items.rarityGems;
    E.narrate(`<p class="good">Loot: ${[piece, unique, rare].map(it => E.itemNameHtml(it)).join(', ')}</p>`);
    E.renderSide();
    return { ids: { set: piece.id, unique: unique.id, rare: rare.id }, colors, gems };
  });
  const rgb = hex => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  const colourOf = loc => loc.evaluate(n => getComputedStyle(n).color);
  const gemOf = loc => loc.evaluate(n => getComputedStyle(n).backgroundImage);
  for (const [key, id] of Object.entries(made.ids)) {
    const want = rgb(made.colors[key]);
    const gemWant = `rarity_${made.gems[key]}.svg`;
    // bag
    await page.locator('.tabs button[data-tab="bag"]').click();
    const bagName = page.locator(`#tab-bag .item[data-item-id="${id}"] .iname`);
    expect(await colourOf(bagName), `bag ${key}`).toBe(want);
    expect(await gemOf(page.locator(`#tab-bag .item[data-item-id="${id}"] .gem`)), `bag gem ${key}`).toContain(gemWant);
    // tooltip
    const tip = await hoverTip(page, page.locator(`#tab-bag .item[data-item-id="${id}"] .n`));
    expect(await colourOf(tip.locator('.tipcmp-col.new .iname').first()), `tooltip ${key}`).toBe(want);
    expect(await gemOf(tip.locator('.tipcmp-col.new .gem').first()), `tooltip gem ${key}`).toContain(gemWant);
    // item card
    await page.locator(`#tab-bag .item[data-item-id="${id}"] .n`).click();
    expect(await colourOf(page.locator('#item-dialog h3 .iname')), `card ${key}`).toBe(want);
    await page.locator('#item-dialog button', { hasText: 'Close' }).click();
    // log
    expect(await colourOf(page.locator(`#narrative .iname[data-item-id="${id}"]`).last()), `log ${key}`).toBe(want);
  }
  // shop (the Sell list) and the loot popup
  await clickAction(page, 'Merchant');
  for (const [key, id] of Object.entries(made.ids)) expect(await colourOf(page.locator(`#town-panel-body .item[data-item-id="${id}"] .iname`).first()), `shop ${key}`).toBe(rgb(made.colors[key]));
  await page.evaluate(ids => { const E = window.emberveil; E.rewardPopups = true; const f = i => E.findItem(i); window.__rw = E.showRewardsFor({ title: 'Loot', gold: 1, items: [f(ids.set), f(ids.unique), f(ids.rare)].map(it => ({ name: it.name, rarity: it.rarity, set: !!it.setId, unique: !!it.isUnique, slot: it.slot, lines: [], itemId: it.id })) }); }, made.ids);
  await page.locator('.rw-card').click();
  const cards = page.locator('.rw-item');
  await expect(cards).toHaveCount(3);
  const keys = ['set', 'unique', 'rare'];
  for (let i = 0; i < 3; i++) {
    expect(await colourOf(cards.nth(i).locator('.name')), `popup ${keys[i]}`).toBe(rgb(made.colors[keys[i]]));
    expect(await gemOf(cards.nth(i).locator('.gem')), `popup gem ${keys[i]}`).toContain(`rarity_${made.gems[keys[i]]}.svg`);
  }
  await page.keyboard.press('Escape'); await page.evaluate(() => window.__rw);
  // party tab: wear the set piece, its slot name uses the set colour, and a set chip appears
  await page.evaluate(i => { const E = window.emberveil, g = E.game, it = E.findItem(i); g.inventory = g.inventory.filter(x => x !== it); const { equip } = { equip: null }; const h = g.party[0]; h.equipment[it.slot] = it; E.renderSide(); }, made.ids.set);
  await page.locator('.tabs button[data-tab="party"]').click();
  expect(await colourOf(page.locator(`#tab-party .slot[data-item-id="${made.ids.set}"] .iname`).first())).toBe(rgb(made.colors.set));
  await expect(page.locator('#tab-party .set-chip').first()).toContainText('Iron Brigade');
  expect(errors).toEqual([]);
});
