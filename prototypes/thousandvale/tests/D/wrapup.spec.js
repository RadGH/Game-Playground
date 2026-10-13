// Wrap-up (report #60): the item card explains the status a property line names — on the real shared tooltip, desktop and phone.
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/wrapup.spec.js
import { test, expect } from '@playwright/test';

const BASE = '/prototypes/thousandvale/';
const ITEM = { uid: 'wrap-60', name: 'Gloam Wand', baseName: 'Wand', type: 'weapon', slot: 'weapon', rarity: 'rare', ilvl: 12, level: 10, dmg: [9, 15],
  attackText: 'Basic attack: throws one shadow bolt up to 30 m, bursting 2 m for 100% weapon damage. Hits leave Cursed.',
  affixes: [{ stat: 'x', text: '+15% fire damage to anything poisoned' }], lore: 'Every name its bearer ever cursed is scratched into the haft, and it is still burning.', value: 40 };

for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 393, height: 852 }]]) {
  test(`#60 ${name}: "Hits leave Cursed" gets a line saying what Cursed does, from the status data`, async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}ui-gallery-frame.html?scene=hud${name === 'phone' ? '&device=phone-p&layout=proposed' : ''}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 60000 });
    const curse = await page.evaluate(async item => {
      const card = await import('/prototypes/thousandvale/js/client/ui/item-card.js');
      card.rememberItems([item]);
      const b = document.createElement('button'); b.id = 'wrap60'; b.textContent = 'wand'; b.dataset.tipRender = 'item'; b.dataset.tipItem = item.uid;
      b.style.cssText = 'position:fixed;left:40px;top:200px;z-index:99999;padding:10px';
      document.body.appendChild(b);
      return (await (await fetch('/prototypes/farhold/data/skills.json')).json()).statuses.curse;
    }, ITEM);
    // the status table and the writer load by themselves; the card has the note once they are in
    await expect.poll(async () => page.evaluate(async item => (await import('/prototypes/thousandvale/js/client/ui/item-card.js')).itemCardHtml(item).includes('ic-status'), ITEM), { timeout: 15000 }).toBe(true);
    // a phone has no hover bubble (css/layout-phone.css): the SAME card is copied into the long-press sheet (input/touch.js),
    // so there the card's own HTML is laid out at the sheet's width
    if (name === 'phone') await page.evaluate(async item => {
      const card = await import('/prototypes/thousandvale/js/client/ui/item-card.js');
      const sheet = document.createElement('div'); sheet.id = 'tipbox60'; sheet.className = 'ps-body';
      sheet.style.cssText = 'position:fixed;left:16px;right:16px;top:120px;z-index:99999;background:#17120c;border:1px solid #6d5326;border-radius:8px;padding:10px;color:#e8dcc4;font:13px/1.4 system-ui';
      sheet.innerHTML = card.itemCardHtml(item); document.body.appendChild(sheet);
    }, ITEM);
    else await page.locator('#wrap60').hover();
    const host = page.locator(name === 'phone' ? '#tipbox60' : '#tipbox');
    const tip = host.locator('.itemtip');
    await expect(tip).toBeVisible();
    const notes = tip.locator('.ic-status > div');
    await expect(notes).toHaveCount(2);                       // Cursed (the attack line) and Poisoned (the property) — NOT Burning, which only the lore says
    await expect(notes.nth(0)).toContainText(`Cursed: the target takes ${curse.takeMore * 100}% more damage and moves ${curse.slow * 100}% slower for ${curse.seconds}s.`);
    await expect(notes.nth(1)).toContainText('Poisoned:');
    await expect(tip.locator('.ic-status')).not.toContainText('Burning');
    const box = await host.boundingBox();
    expect(box.x >= 0 && box.x + box.width <= viewport.width + 1, 'the card is inside the screen').toBe(true);
    await page.screenshot({ path: `prototypes/thousandvale/tests/D/shots/wrap-60-card-${name}.png` });
    expect(errors, errors.join('\n')).toEqual([]);
    await ctx.close();
  });
}
