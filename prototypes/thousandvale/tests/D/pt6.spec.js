// Stream D-UI — play-test 6 (owner feedback of 2026-10-07) in a real browser against a real server (tests/D/m3-server.mjs).
// One check and one screenshot (tests/D/shots/pt6-*.png) per U-item of D-UI's list. Server messages that cannot be made to
// happen on demand are played through tv.fake (every client handler hears them); what the client sends is read off a spy.
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/pt6.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, page, ctx;
const errors = [], fails = [];
const shot = name => page.screenshot({ path: join(SHOTS, `pt6-${name}.png`) });
const soft = (name, fn) => test(name, async ({ browser }) => { test.setTimeout(150000); try { await fn({ browser }); } catch (e) { fails.push(`${name.slice(0, 50)} :: ${String(e.message).slice(0, 700)}`); console.log('[pt6 FAIL]', name.slice(0, 50), '\n', String(e.message).slice(0, 700)); } });
const badge = id => page.evaluate(i => document.getElementById(i)?.querySelector('b')?.textContent ?? null, id);

test.beforeAll(async ({ browser }) => {
  const port = await freePort(), hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out))); });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(20000);
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

test('enter the world', async () => {
  test.setTimeout(300000);
  await page.goto(base + '?quality=low&autoplay=1&name=Odda&cls=cleric&tod=0.45');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 180000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { window.__sent = []; const n = thousandvale.S.net; for (const k of ['use', 'item', 'useItem', 'mail', 'sheet']) { const o = n[k]; n[k] = (...a) => { window.__sent.push({ k, a }); if (k === 'use' && a.length < 2) return o(...a); }; } });
});

soft('U1: the Party button, the mail tab, the friends tab and the bag show only what is unseen — and clear when it is seen', async () => {
  expect(await badge('party-btn')).toBe(''); expect(await badge('bag-btn')).toBe('');
  // a party of two is not news
  await page.evaluate(() => tv.fake('party', { id: 1, code: 'ABCD', leader: tv.state().you.id, members: [{ char: thousandvale.S.net.joined.you.char, name: 'Odda', level: 1, cls: 'cleric', online: true }, { char: 999, name: 'Brem', level: 2, cls: 'warrior', online: true }] }));
  expect(await badge('party-btn'), 'the size of your party is not a badge').toBe('');
  // a friend is added and comes online; a letter arrives
  await page.evaluate(() => { tv.fake('friends', { list: [] }); tv.fake('friends', { list: [{ char: 999, name: 'Brem', level: 2, cls: 'warrior', online: false, unseen: true }], unseen: [{ char: 999, name: 'Brem', kind: 'added', at: Date.now() }], unseenCount: 1 }); tv.fake('friendState', { char: 999, name: 'Brem', cls: 'warrior', level: 2, online: true }); tv.fake('mailNew', { unread: 1 }); });
  expect(await badge('menu-friends')).toBe('2'); expect(await badge('menu-mail')).toBe('1'); expect(await badge('party-btn')).toBe('3');
  await shot('u1-badges-unseen');
  // you look at the friends list: that part clears; the letter is read: the rest clears
  await page.evaluate(() => tv.panel('friends', true));
  expect(await badge('menu-friends')).toBe(''); expect(await badge('party-btn')).toBe('1');
  await page.evaluate(() => { tv.panel('mail', true); tv.fake('mailList', { mail: [{ id: 5, from: 'Brem', subject: 'Hello', read: false, sentAt: Date.now() }], unread: 1 }); });
  await page.click('#panel-mail .ml-row');
  await page.evaluate(() => { tv.fake('mailOpen', { mail: { id: 5, from: 'Brem', subject: 'Hello', body: 'Hi.', read: true, sentAt: Date.now() } }); tv.fake('mailNew', { unread: 0 }); });
  expect(await badge('menu-mail')).toBe(''); expect(await badge('party-btn'), 'read and seen: the red bubble is gone').toBe('');
  await page.evaluate(() => tv.panel('mail', false));
  // the bag: new things only, cleared by opening it
  await page.evaluate(() => tv.fake('bag', { add: [{ uid: 'p1', id: 'healing_potion', kind: 'potion', name: 'Healing Potion', count: 5, stackMax: 20, desc: 'Restores 40 HP.' }], remove: [], gold: 3 }));
  expect(await badge('bag-btn')).toBe('1');
  await page.keyboard.press('KeyB');
  expect(await badge('bag-btn')).toBe('');
  await shot('u1-badges-clear');
});

soft('U5 + U17: a stack shows its count, a used one counts down in place and is not "new"; the potion card speaks in your numbers', async () => {
  const cell = page.locator('#bag-grid [data-tip-item="p1"]');
  await expect(cell.locator('.stack')).toHaveText('5');
  await cell.hover({ force: true });
  await expect(page.locator('#tipbox')).toContainText('A stack of 5', { timeout: 6000 });
  const card = await page.locator('#tipbox').innerText();
  expect(card).toMatch(/Restores \d+ health \(50% of yours\) at once/);
  expect(card).not.toContain('Restores 40 HP');
  await shot('u5-stack');
  await page.keyboard.press('KeyB');
  await page.evaluate(() => tv.fake('bag', { remove: ['p1'], add: [{ uid: 'p1', id: 'healing_potion', kind: 'potion', name: 'Healing Potion', count: 4, stackMax: 20 }], gold: 3 }));
  expect(await badge('bag-btn'), 'using one is not news').toBe('');
  await expect(page.locator('#actionbar .hb-slot .hb-n').first()).toHaveText('4');
  await page.keyboard.press('KeyB');
  await expect(page.locator('#bag-grid [data-tip-item="p1"] .stack')).toHaveText('4');
  expect(await page.evaluate(() => thousandvale.bag.state.bag.filter(i => i.uid === 'p1').length)).toBe(1);
});

soft('U6: a shield reads "20% chance to block" — the rules\' own text, scaled once', async () => {
  await page.evaluate(() => tv.fake('bag', { add: [{ uid: 'sh1', baseKey: 'shield', name: 'Shield', type: 'armor', subtype: 'offhand', slot: 'offhand', isShield: true, rarity: 'normal', armor: 4, levelReq: 1, affixes: [{ id: 'base_block_chance', name: 'Base Block', stat: 'block_chance', value: 20, baseIntrinsic: true }, { id: 'crit', stat: 'critChance', value: 0.05 }] }], remove: [], gold: 3 }));
  await page.locator('#bag-grid [data-tip-item="sh1"]').hover({ force: true });
  await expect(page.locator('#tipbox')).toContainText('20% chance to block', { timeout: 8000 });
  const t = await page.locator('#tipbox').innerText();
  expect(t).not.toMatch(/0\.2%|2000%|0\.05\b/);
  await shot('u6-shield-card');
});

soft('U7 + U13: the bag shows the Character menu\'s armour and damage (the server sheet) and the share it takes off — both move together', async () => {
  const sheet = (armor, red) => ({ core: [{ id: 'maxHp', label: 'Health', value: 94, tip: 'x' }, { id: 'damageMin', label: 'Weapon damage (low)', value: 7, tip: 'From your weapon.' }, { id: 'damageMax', label: 'Weapon damage (high)', value: 13, tip: 'From your weapon.' },
    { id: 'armor', label: 'Armour', value: armor, tip: 'Everything you wear, your perks and your buffs.' }, { id: 'armorReduction', label: 'Physical damage reduced', value: red, unit: '%', tip: 'armour / (100 + armour): 41 armour takes 29.1% off a physical hit.' }], advanced: [], abilities: [] });
  await page.evaluate(s => tv.fake('sheet', s), sheet(35, 25.9));
  await expect(page.locator('#doll-stats')).toContainText('35 (25.9%) armour');
  await expect(page.locator('#doll-stats')).toContainText('7–13 damage');
  await page.keyboard.press('KeyV');
  await expect(page.locator('#panel-sheet [data-id="armor"] .sh-value')).toHaveText('35');
  await expect(page.locator('#panel-sheet [data-id="armorReduction"] .sh-value')).toHaveText('25.9%');
  // a +6 armour perk: both windows change, by the same numbers
  await page.evaluate(s => tv.fake('sheet', s), sheet(41, 29.1));
  await expect(page.locator('#doll-stats')).toContainText('41 (29.1%) armour');
  await expect(page.locator('#panel-sheet [data-id="armorReduction"] .sh-value')).toHaveText('29.1%');
  await expect(page.locator('#panel-sheet [data-id="armorReduction"] .sh-diff')).toHaveText('▲ +3.2%');
  expect(await page.locator('#panel-sheet [data-id="armorReduction"]').getAttribute('data-tip')).toContain('armour / (100 + armour)');
  await shot('u7-bag-and-sheet-agree');
  await page.keyboard.press('KeyV'); await page.keyboard.press('KeyB');
});

soft('U8: a warded boss shows the ward — what is left to break and the seconds until it fades', async () => {
  const id = await page.evaluate(() => tv.state().you.id);
  await page.evaluate(i => { tv.fxEvent({ type: 'boss', id: i, name: 'The Barrow Warden', title: 'Keeper of the Mound', bars: 1, phases: [{ n: 0, name: 'The Watch', at: 1 }] }); tv.fxEvent({ type: 'fx', kind: 'shield', id: i, on: true, ms: 20000, pool: 480, name: 'Barrow Ward' }); }, id);
  const w = page.locator('#boss .boss-ward');
  await expect(w).toBeVisible();
  await expect(w).toContainText('Barrow Ward 480 / 480');
  await expect(w).toContainText(/fades in (20|19|18) s/);
  await page.evaluate(i => tv.fxEvent({ type: 'fx', kind: 'shield', id: i, hp: 120, max: 480, left: 9000 }), id);
  await expect(w).toContainText('120 / 480'); await expect(w).toContainText(/fades in [89] s/);
  expect(await w.locator('i').evaluate(e => e.style.width)).toMatch(/^25(\.0)?%$/);
  await expect(page.locator('#boss')).toHaveClass(/shielded/);            // an update is not an "off"
  await page.waitForTimeout(300);
  await shot('u8-ward-bar');
  await page.evaluate(i => tv.fxEvent({ type: 'fx', kind: 'shield', id: i, on: false, why: 'broken' }), id);
  await expect(w).toBeHidden();
  await page.evaluate(() => thousandvale.boss?.clear?.());
});

soft('U9: an event that ends with nothing to add prints no "null"', async () => {
  await page.evaluate(() => { tv.fake('eventTrack', { uid: 'h1', name: 'Home to Torborhold', state: 'live', what: 'See the carter home.', inside: true, leftMs: 60000 });
    tv.fake('zoneEvent', { kind: 'end', ev: { uid: 'h1', name: 'Home to Torborhold', info: { onSuccess: null } }, won: true, result: { text: null } });
    tv.fake('eventDone', { uid: 'h1', name: 'Home to Torborhold', result: 'success', got: null, story: null, text: null }); });
  const card = page.locator('.tv-evtrack .et-card.won');
  await expect(card).toBeVisible();
  const t = await card.innerText();
  expect(t).toContain('Won: Home to Torborhold.'); expect(t).not.toMatch(/null|undefined/);
  expect(await page.evaluate(() => tv.social().chat.map(c => c.text).join('\n'))).not.toMatch(/Torborhold\. null|null$/m);
  await shot('u9-no-null');
  await page.evaluate(() => thousandvale.ui5.tracker.clear());
});

soft('U11: a locked key says when it opens; the heal\'s card says how to heal someone else', async () => {
  const locked = await page.evaluate(() => [...document.querySelectorAll('#actionbar .slot.locked .lockat')].map(e => e.textContent));
  expect(locked.length).toBeGreaterThan(0);
  for (const t of locked) expect(t).toMatch(/^Lv \d+$/);
  const heal = await page.evaluate(() => thousandvale.S.bar.find(b => b.ally && !b.revive)?.slot ?? null);
  expect(heal).not.toBe(null);
  expect(await page.locator('#actionbar .slot').nth(heal).getAttribute('data-tip-html')).toContain('click their party frame');
  await page.locator('#actionbar .slot').nth(heal).hover();
  await page.waitForTimeout(600);
  await shot('u11-heal-card');
});

soft('U12: the stair up asks which floor, and the answer goes out as use {id, to}', async () => {
  await page.evaluate(() => tv.fake('used', { id: 77, ok: true, kind: 'lift', name: 'Stairs up', here: 3, choices: [{ to: 'f:2', floor: 2, label: 'Floor 2', name: 'The Ossuary' }, { to: 'f:1', floor: 1 }] }));
  const box = page.locator('.tv-lift');
  await expect(box).toBeVisible();
  await expect(box).toContainText('You are on floor 3');
  await expect(box.locator('button[data-to]')).toHaveCount(2);
  await expect(box.locator('button[data-to]').first()).toContainText('The top');
  await shot('u12-lift');
  await page.evaluate(() => { window.__sent.length = 0; });
  await box.locator('button[data-to="f:1"]').click();
  await expect(box).toBeHidden();
  expect(await page.evaluate(() => window.__sent.find(m => m.k === 'use')?.a)).toEqual([77, 'f:1']);
});

soft('U14: what the character can see is on the minimap — people, enemies, doors', async () => {
  await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => tvui5.sight());
  expect(seen.length, 'someone or something is in sight in the town square').toBeGreaterThan(0);
  expect(seen.every(m => ['npc', 'monster', 'player', 'object'].includes(m.kind))).toBe(true);
  const mm = await page.evaluate(() => tvui.minimap().markers.filter(m => String(m.id).startsWith('see:')).length);
  expect(mm).toBeGreaterThan(0);
  // behind a wall is not in sight: the same list through a line of sight that always says no is empty of bodies
  const blocked = await page.evaluate(async () => { const { sightMarkers } = await import('./js/client/ui/pt6-core.js'); const me = tv.state().you; return sightMarkers({ me: { id: me.id, x: me.x, z: me.z }, bodies: [...thousandvale.actors.actors.values()].map(a => ({ id: a.id, kind: a.kind, name: a.name, x: a.pos.x, z: a.pos.z })), los: () => false }).length; });
  expect(blocked).toBe(0);
  await page.evaluate(() => tvui.miniZoom(3));
  await page.waitForTimeout(800);
  await shot('u14-minimap-sight');
});

test('no page errors, and every check above passed', async () => { expect(errors).toEqual([]); expect(fails).toEqual([]); });
