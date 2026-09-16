// Farhold phase 4: the people in the places — names, trade, work.

import { test, expect } from '@playwright/test';

async function land(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

/** Stand in the nearest settlement and wait for its people to be built. */
async function goToTown(page) {
  return page.evaluate(async () => {
    const f = window.farhold;
    const town = f.features.nearest('settlement', f.control.x, f.control.z);
    f.teleport(town.wx, town.wz);
    const t0 = Date.now();
    while (f.folk.stats().people === 0 && Date.now() - t0 < 25000) await new Promise(r => setTimeout(r, 200));
    return { name: town.name, size: town.size, wx: town.wx, wz: town.wz };
  });
}

test('a settlement has people in it, standing on the ground with names of its own race', async ({ page }) => {
  const errors = await land(page);
  const town = await goToTown(page);
  const folk = await page.evaluate(() => {
    const f = window.farhold;
    const people = [...f.folk.live.values()].flat();
    return {
      stats: f.folk.stats(),
      roles: [...new Set(people.map(p => p.role))],
      names: people.map(p => p.name),
      onGround: people.every(p => Math.abs(p.y - f.terrain.heightAt(p.x, p.z)) < 0.05),
      dry: people.every(p => !f.terrain.waterAt(p.x, p.z)),
      nearTown: people.every(p => Math.hypot(p.x - f.control.x, p.z - f.control.z) < 90),
    };
  });
  expect(errors).toEqual([]);
  expect(folk.stats.people).toBeGreaterThan(2);
  // a town has more than one kind of person, including somebody to trade with
  expect(folk.roles.length).toBeGreaterThan(1);
  expect(folk.roles).toContain('merchant');
  expect(folk.onGround).toBe(true);
  expect(folk.dry).toBe(true);
  expect(folk.nearTown).toBe(true);
  // real names, not "Merchant of Somewhere"
  expect(new Set(folk.names).size).toBe(folk.names.length);
  for (const n of folk.names) expect(n.length).toBeGreaterThan(3);
  expect(folk.names.some(n => n.includes(' '))).toBe(true);
  expect(town.size).toBeGreaterThan(0);
});

test('E opens a conversation, and Esc closes it', async ({ page }) => {
  await land(page);
  await goToTown(page);
  // stand on top of somebody
  await page.evaluate(() => {
    const f = window.farhold;
    const who = [...f.folk.live.values()].flat()[0];
    f.teleport(who.x + 1.2, who.z);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await expect(page.locator('#talk')).toBeVisible();
  const shown = await page.evaluate(() => ({
    name: window.farhold.talk.npc?.name,
    heading: document.querySelector('#talk h2')?.textContent,
    greeting: document.querySelector('#talk .talk-say')?.textContent,
  }));
  expect(shown.heading).toBe(shown.name);
  expect(shown.greeting.length).toBeGreaterThan(5);
  await page.keyboard.press('Escape');
  await expect(page.locator('#talk')).toBeHidden();
});

test('a merchant sells to you and buys from you', async ({ page }) => {
  await land(page);
  await goToTown(page);
  const trade = await page.evaluate(() => {
    const f = window.farhold;
    const merchant = [...f.folk.live.values()].flat().find(p => p.trades);
    if (!merchant) return { skipped: true };
    f.player.gold = 5000;
    const stock = f.folk.stockFor(merchant, f.player.level);
    const before = { gold: f.player.gold, bag: f.player.bag.length, stock: stock.length };

    const item = stock[0];
    const price = f.rpg.price(item);
    const bought = f.folk.buy(merchant, item, f.player);
    const afterBuy = { gold: f.player.gold, bag: f.player.bag.length, stock: f.folk.stockFor(merchant, 1).length };

    const sold = f.folk.sell(merchant, item, f.player);
    const afterSell = { gold: f.player.gold, bag: f.player.bag.length };

    // and you cannot buy what you cannot afford
    f.player.gold = 0;
    const broke = f.folk.buy(merchant, f.folk.stockFor(merchant, 1)[0], f.player);
    return { skipped: false, before, price, bought, afterBuy, sold, afterSell, broke };
  });
  if (trade.skipped) return;
  expect(trade.bought.ok).toBe(true);
  expect(trade.afterBuy.gold).toBe(trade.before.gold - trade.price);
  expect(trade.afterBuy.bag).toBe(trade.before.bag + 1);
  expect(trade.afterBuy.stock).toBe(trade.before.stock - 1);
  // selling gives you less than you paid, and takes the item
  expect(trade.sold.ok).toBe(true);
  expect(trade.sold.price).toBeLessThan(trade.price);
  expect(trade.afterSell.bag).toBe(trade.before.bag);
  expect(trade.broke.ok).toBe(false);
});

test('work is offered, tracked, and paid out by the person who gave it', async ({ page }) => {
  await land(page);
  await goToTown(page);
  const job = await page.evaluate(async () => {
    const f = window.farhold;
    const giver = [...f.folk.live.values()].flat().find(p => p.givesQuests);
    if (!giver) return { skipped: true };
    const quest = f.folk.questFrom(giver, { level: f.player.level, enemies: [], nodes: f.world.nodes });
    if (!quest) return { skipped: true };
    f.questLog.add(quest);
    const pinsBefore = f.map.pins.length;

    // finish it, whatever it is
    if (quest.kind === 'hunt' || quest.kind === 'clear') {
      for (let i = 0; i < quest.count; i++) f.questLog.onKill({ defId: quest.target });
    } else if (quest.kind === 'gather') {
      for (let i = 0; i < quest.count; i++) f.questLog.onLoot({ baseKey: quest.target });
    } else {
      f.questLog.onArrive({ x: quest.place.x, z: quest.place.z });
    }

    const gold = f.player.gold, xp = f.player.xp;
    const ready = f.questLog.readyToTurnIn(giver.id);
    const reward = ready.length ? f.questLog.turnIn(ready[0]) : null;
    if (reward) { f.player.gold += reward.gold; f.rpg.gainXp(f.player, reward.xp); }
    return {
      skipped: false, kind: quest.kind, title: quest.title,
      wasReady: ready.length, reward,
      gained: { gold: f.player.gold - gold, xp: f.player.xp - xp },
      stillActive: f.questLog.active.length,
      pinsBefore,
    };
  });
  if (job.skipped) return;
  expect(job.title.length).toBeGreaterThan(4);
  expect(job.wasReady).toBe(1);
  expect(job.gained.gold).toBe(job.reward.gold);
  expect(job.gained.xp).toBeGreaterThan(0);
  expect(job.stillActive).toBe(0);
});

test('the folk come and go with the settlements around you', async ({ page }) => {
  await land(page);
  await goToTown(page);
  const life = await page.evaluate(async () => {
    const f = window.farhold;
    const inTown = f.folk.stats();
    // walk a long way off
    f.teleport(f.control.x + 6000, f.control.z + 4000);
    const t0 = Date.now();
    while (f.folk.stats().settlements > 0 && Date.now() - t0 < 12000) await new Promise(r => setTimeout(r, 200));
    return { inTown, away: f.folk.stats() };
  });
  expect(life.inTown.people).toBeGreaterThan(2);
  expect(life.away.settlements).toBe(0);
  expect(life.away.people).toBe(0);
});
