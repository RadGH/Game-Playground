// Stream D-UI — play-test 5 in a real browser against a real server (tests/D/m3-server.mjs) and a second player (a Node
// bot on js/net/client.js). Every T# of D-UI's list gets a check and a screenshot (tests/D/shots/pt5-*.png), at desktop
// and at phone width. Where the server half may not have landed (or cannot be made to happen on demand — a crate drop, a
// zone event, a bite) the window is driven through tvui5.fake — the SAME handlers a server message reaches — and the
// message the client SENDS is checked on the wire (a spy on net.* and net._raw).
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/pt5.spec.js
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
let srv, base, hookBase, page, ctx, bot, port;
const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const shot = (name, p = page) => p.screenshot({ path: join(SHOTS, `pt5-${name}.png`) });
const sent = (p = page) => p.evaluate(() => window.__sent.splice(0));
/** Nothing on screen may read like a raw float or an object. */
const BAD = /(?<![\d.])\d+\.\d{4,}(?![\d.])|\[object |undefined|NaN\b/;      // (a browser version like 153.0.8010.12 in the bug report's context is not a raw float)
async function clean(p = page, where = '') { const t = await p.evaluate(() => [...document.querySelectorAll('#hud, .tv-panel, .tipbox')].map(e => (e.hidden ? '' : e.innerText)).join('\n')); const m = t.match(BAD); expect(m ? `${where}: "${t.slice(Math.max(0, m.index - 40), m.index + 40)}"` : '').toBe(''); }
/**
 * Record everything the client sends (the helper methods and the raw socket). The windows here are driven with made-up
 * ids (a crate "crate-1", letter 9001…), so those messages are RECORDED but not forwarded: the real server's "no such
 * item" would race the answer the test plays in. Feedback goes through for real.
 */
const spy = p => p.evaluate(() => {
  if (window.__sent) return; window.__sent = [];
  const n = thousandvale.S.net, raw = n._raw.bind(n);
  const MUTE = new Set(['item', 'fish', 'cook', 'admin', 'revive', 'sheet', 'mail', 'travel']);
  n._raw = (w, d) => { let m = null; try { m = JSON.parse(d); window.__sent.push(m); } catch {} return m && MUTE.has(m.t) ? undefined : raw(w, d); };
  const wrap = (name, f) => { const o = n[name]; if (typeof o === 'function') n[name] = (...a) => { const m = f(...a); window.__sent.push(m); return MUTE.has(m.t) ? undefined : o(...a); }; };
  wrap('item', (op, uid, slot) => ({ t: 'item', op, uid, slot })); wrap('useItem', uid => ({ t: 'item', op: 'use', uid })); wrap('openItem', uid => ({ t: 'item', op: 'use', uid }));
  wrap('fish', (op, a = {}) => ({ t: 'fish', op, ...a })); wrap('cook', (id, k) => ({ t: 'cook', id, n: k })); wrap('feedback', (kind, text, c) => ({ t: 'feedback', kind, text, ctx: c }));
  wrap('adminOp', (op, a = {}) => ({ t: 'admin', op, ...a })); wrap('revive', (op, id) => ({ t: 'revive', op, id })); wrap('sheet', () => ({ t: 'sheet' })); wrap('mail', (op, a = {}) => ({ t: 'mail', op, ...a })); wrap('travel', to => ({ t: 'travel', to }));
});

/** Kits to show when the server has none to send yet (the same shape stream C's kitsFor returns). */
const SAMPLE_KITS = {
  armour: [
    { id: 'mail', name: "Line-Holder's Mail", blurb: 'Rings over padding. Heavy, and it turns a blade.', items: [{ name: 'Dented Coif', slot: 'head', tier: 'medium', armor: 3 }, { name: 'Patched Hauberk', slot: 'chest', tier: 'medium', armor: 7 }, { name: 'Ring Leggings', slot: 'legs', tier: 'medium', armor: 4 }] },
    { id: 'hide', name: "Skirmisher's Hide", blurb: 'Boiled leather. Light enough to run in.', items: [{ name: 'Hide Cap', slot: 'head', tier: 'light', armor: 2 }, { name: 'Hide Jerkin', slot: 'chest', tier: 'light', armor: 5 }, { name: 'Trail Boots', slot: 'feet', tier: 'light', armor: 2 }] },
    { id: 'pad', name: 'Recruit Padding', blurb: 'Quilted cloth and a prayer.', items: [{ name: 'Padded Hood', slot: 'head', tier: 'cloth', armor: 1 }, { name: 'Quilted Coat', slot: 'chest', tier: 'cloth', armor: 3 }, { name: 'Wrapped Shoes', slot: 'feet', tier: 'cloth', armor: 1 }] },
  ],
  weapons: [
    { id: 'sb', name: 'Sword and shield', blurb: 'A steady hand and something to hide behind.', items: [{ name: 'Short Sword', type: 'weapon', subtype: 'sword', dmg: [3, 6], offHandOk: true }, { name: 'Round Shield', slot: 'offhand', isShield: true, armor: 4 }] },
    { id: 'dual', name: 'A pair of blades', blurb: 'One for each hand. Fast, and nothing to block with.', items: [{ name: 'Hatchet', type: 'weapon', subtype: 'axe', dmg: [2, 5], attackSpeed: 'fast', offHandOk: true }, { name: 'Dirk', type: 'weapon', subtype: 'dagger', dmg: [2, 4], attackSpeed: 'fast', offHandOk: true }] },
    { id: 'two', name: 'Old greatsword', blurb: 'Both hands, long swings, big hits.', items: [{ name: 'Old Greatsword', type: 'weapon', subtype: 'greatsword', twoHanded: true, dmg: [6, 11], attackSpeed: 'slow' }] },
  ],
};

test.beforeAll(async ({ browser }) => {
  port = await freePort(); const hk = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hk)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hk}`;
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (/\[kits\]/.test(m.text())) console.log('[page]', m.text().slice(0, 700)); });
  page.setDefaultTimeout(20000);          // a stuck click fails its own test, not the whole file
});
const fails = [];
/** A test that records its failure and lets the next ones run: they share one page, and a serial stop would hide every later screen behind the first red line. The last test fails if any did. */
const soft = (name, fn) => test(name, async ({ browser }) => { try { await fn({ browser }); } catch (e) { fails.push(`${name.slice(0, 60)} :: ${String(e.message).slice(0, 900)}`); console.log('[pt5 FAIL]', name.slice(0, 60), '\n', String(e.message).slice(0, 900)); } });
test.afterAll(async () => { try { bot?.close(); } catch {} await ctx?.close(); srv?.kill('SIGTERM'); });

test('T5: after name + appearance comes "starting equipment" — three armour sets, weapon packs, worn by the 3D figure; the choice rides in create', async () => {
  test.setTimeout(420000);
  await page.goto(base + '?quality=low&fresh=1&tod=0.45');
  await page.waitForSelector('#loading.done', { timeout: 120000 });
  await page.fill('#name', 'Wren');
  await page.click('#classes [data-cls="cleric"]');
  await page.click('#enter');                                   // step 1 -> step 2
  await expect(page.locator('#panel-appearance')).toBeVisible();
  await expect(page.locator('#panel-appearance [data-act="save"]')).toHaveText(/Next: equipment/);
  // real kits when the server has them (stream C through A's `kits`); the sample ones otherwise, so the screen is always checked
  const real = await page.evaluate(async () => !!(await thousandvale.ui5.kits.load(thousandvale.S.cls)));
  if (!real) await page.evaluate(k => tvui5.kits(k), SAMPLE_KITS);
  console.log('[pt5] kits:', real ? 'real (server or rules)' : 'SAMPLE');
  test.info().annotations.push({ type: 'kits', description: real ? 'from the server' : 'sample kits (the server sent none)' });
  await page.click('#panel-appearance [data-act="save"]');     // step 2 -> step 3
  await expect(page.locator('#panel-kits')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#panel-appearance')).toBeHidden();
  expect(await page.locator('#panel-kits [data-group="armour"]').count()).toBe(3);
  expect(await page.locator('#panel-kits [data-group="weapons"]').count()).toBeGreaterThanOrEqual(2);
  // the first of each is chosen and worn by the figure
  await expect.poll(() => page.evaluate(() => Object.keys(thousandvale.actors.get('preview')?.look?.gear || {})), { timeout: 10000 }).toContain('weapon');
  const g0 = await page.evaluate(() => Object.keys(thousandvale.actors.get('preview')?.look?.gear || {})); expect(g0.some(s => ['head', 'chest', 'legs', 'feet', 'hands'].includes(s))).toBe(true);
  // every piece of the chosen set shows its real numbers in plain text (no hover needed)
  const facts = await page.locator('#panel-kits .kit-choice.on .kit-itemtext small').allTextContents();
  expect(facts.length).toBeGreaterThan(1);
  expect(facts.join(' | ')).toMatch(/\d+ armour/); expect(facts.join(' | ')).toMatch(/\d+–\d+ damage/);
  await page.waitForTimeout(5000);
  await shot('t5-kits-first');
  // pick the last weapon pack and the second armour set: the figure changes
  const packs = page.locator('#panel-kits [data-group="weapons"]');
  await packs.last().click();
  await page.locator('#panel-kits [data-group="armour"]').nth(1).click();
  const st = await page.evaluate(() => tvui5.state().kits);
  const worn = await page.evaluate(() => { const g = thousandvale.actors.get('preview')?.look?.gear || {}; return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.name])); });
  expect(worn).toEqual(st.gear);
  expect(st.armour).not.toBe(null); expect(st.weapons).not.toBe(null);
  // the item card on hover: the same card the bag uses
  await page.locator('#panel-kits .kit-choice.on .kit-item').first().hover();
  await expect(page.locator('#tipbox .itemtip')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(5000);
  await shot('t5-kits-picked');
  await clean(page, 'kit step');
  // Back returns to the appearance editor, forward again keeps the choice
  await page.click('#panel-kits [data-act="back"]');
  await expect(page.locator('#panel-appearance')).toBeVisible();
  await page.click('#panel-appearance [data-act="save"]');
  await page.waitForTimeout(3000);
  console.log('[pt5] after back+save:', JSON.stringify(await page.evaluate(() => ({ kits: tvui5.state().kits, step: thousandvale.S.titleStep, phase: thousandvale.S.phase, status: thousandvale.S.net?.status, note: document.getElementById('login-note')?.textContent, log: tvui5.state().log.slice(-6) }))));
  await expect(page.locator('#panel-kits')).toBeVisible({ timeout: 20000 });
  expect(await page.evaluate(() => tvui5.state().kits.weapons)).toBe(st.weapons);
  // watch the create message
  await page.evaluate(() => { const o = WebSocket.prototype.send; window.__ws = []; WebSocket.prototype.send = function (d) { if (typeof d === 'string' && d.includes('"create"')) window.__ws.push(JSON.parse(d)); return o.call(this, d); }; });
  await page.click('#panel-kits [data-act="create"]');
  if (!real) {
    // sample ids mean nothing to the server: check the wire, then enter with the default kit
    await expect.poll(() => page.evaluate(() => window.__ws.length), { timeout: 30000 }).toBeGreaterThan(0);
    const c = await page.evaluate(() => window.__ws[0]);
    expect(c.kit).toEqual({ armour: st.armour, weapons: st.weapons });
    const online = await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 20000 }).then(() => true, () => false);
    if (!online) { await page.evaluate(() => { tvui5.kits(null); thousandvale.S.kit = null; }); await page.evaluate(() => thousandvale.ui5.kits.close()); await page.goto(base + '?quality=low&autoplay=1&name=Wren&cls=cleric&tod=0.45'); }
  } else {
    const c = await page.evaluate(async () => { for (let i = 0; i < 100 && !window.__ws.length; i++) await new Promise(r => setTimeout(r, 100)); return window.__ws[0]; });
    expect(c.kit).toEqual({ armour: st.armour, weapons: st.weapons });
  }
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 120000 });
  await expect(page.locator('#panel-kits')).toBeHidden();
  if (real) {
    // the server put the chosen kit on the character
    const eq = await page.evaluate(() => Object.fromEntries(Object.entries(thousandvale.S.net.joined.you.equipment || {}).filter(([, v]) => v).map(([k, v]) => [k, v.name])));
    for (const [slot, name] of Object.entries(st.gear)) expect(eq[slot], `${slot} from the chosen kit`).toBe(name);
  }
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await spy(page);
});

soft('T9: a crate says what it opens into and its lowest rarity; opening it rattles, then reveals the item', async () => {
  test.setTimeout(480000);
  const crate = { uid: 'crate-1', id: 'crate', kind: 'crate', type: 'crate', name: 'Bootmaker\'s Crate', rarity: 'magic', crate: { slot: 'feet', min: 'uncommon', minRarity: 'magic' } };
  await page.evaluate(c => tvui5.fake('bag', { add: [c], remove: [], gold: 12 }), crate);
  await page.keyboard.press('KeyB');
  await expect(page.locator('#bag')).toBeVisible();
  const cell = page.locator('#bag-grid [data-tip-item="crate-1"]');
  await cell.hover();
  await expect(page.locator('#tipbox .ic-crate')).toBeVisible({ timeout: 5000 });
  const card = await page.locator('#tipbox').innerText();
  expect(card).toContain('Opens into boots.'); expect(card).toContain('Magic at the least'); expect(card.toLowerCase()).toContain('crate');
  await shot('t9-crate-card');
  await cell.click();
  await expect(page.locator('.tv-reveal.waiting')).toBeVisible();
  expect((await sent()).some(m => m.t === 'item' && m.op === 'use' && String(m.uid) === 'crate-1')).toBe(true);
  await shot('t9-crate-opening');
  const boots = { uid: 'boots-9', name: 'Wayfarer Boots of the Hare', slot: 'feet', tier: 'light', rarity: 'rare', armor: 6, ilvl: 3, levelReq: 2, affixes: [{ stat: 'moveSpeed', value: 0.06, text: '+6% movement speed' }] };
  await page.evaluate(b => { tvui5.fake('bag', { add: [b], remove: ['crate-1'], gold: 12 }); tvui5.fake('itemR', { op: 'use', uid: 'crate-1', ok: true, opened: { item: b, items: [b], from: 'crate', name: 'Bootmaker\'s Crate' } }); }, boots);
  await expect(page.locator('.tv-reveal.open')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.tv-reveal .rv-name')).toHaveText('Wayfarer Boots of the Hare');
  await expect(page.locator('.tv-reveal .rv-kind')).toHaveText(/Rare feet/i);
  await expect(page.locator('.tv-reveal .rv-facts')).toHaveText('6 armour');
  expect(await page.evaluate(() => tvui5.state().reveal.queued)).toBe(0);            // the bag message and the answer are ONE reveal
  await page.waitForTimeout(900);
  await shot('t9-crate-reveal');
  await clean(page, 'crate reveal');
  await page.click('.tv-reveal [data-act="ok"]');
  await expect(page.locator('.tv-reveal')).toBeHidden();
  await page.evaluate(() => { if (!thousandvale.bag.isOpen) thousandvale.bag.toggle(true); });
  // a refusal closes the box and says why
  const crate2 = { ...crate, uid: 'crate-2' };
  await page.evaluate(c => tvui5.fake('bag', { add: [c], remove: [], gold: 12 }), crate2);
  await page.locator('#bag-grid [data-tip-item="crate-2"]').click();
  await expect(page.locator('.tv-reveal.waiting')).toBeVisible();
  await page.evaluate(() => tvui5.fake('itemR', { op: 'use', uid: 'crate-2', ok: false, why: 'bagFull' }));
  await expect(page.locator('.tv-reveal')).toBeHidden();
  await expect(page.locator('#toasts')).toContainText('bag is full');
  await page.keyboard.press('KeyB');
});

soft('T11 + T12: the event tracker — a short notice outside, the full card inside (what, objective, progress, time, reward), and a result line', async () => {
  test.setTimeout(300000);
  const me = await page.evaluate(() => tv.state().you);
  const ev = { uid: 'e77', id: 'wolves_ford', name: 'Wolves at the Ford', kind: 'zone', realm: true, state: 'live', what: 'A starving pack is crossing the ford toward the farms.', text: 'A starving pack is crossing the ford toward the farms.',
    objective: { text: 'Defeat the three packs, then the pack mother', n: 1, of: 4, kind: 'wave' }, stage: { n: 2, of: 4, name: 'The second pack' }, leftMs: 372000, endsAt: Date.now() + 372000,
    reward: { xp: 120, gold: 14, items: ['a rare item or better'], text: 'Event cache: a rare item or better, gold and experience' }, rewardText: 'Event cache: a rare item or better, gold and experience', players: 3, x: me.x + 400, z: me.z, r: 40, level: 3 };
  // far away: a two-line notice with the travel offer
  await page.evaluate(e => tvui5.fake('eventTrack', { ...e, inside: false, inRange: false }), ev);
  const card = page.locator('.tv-evtrack .et-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/outside/);
  await expect(card.locator('.et-go')).toBeVisible();
  await expect(card.locator('.et-obj')).toHaveCount(0);
  await expect(page.locator('.tv-event')).toBeHidden();            // the old "event happening — travel there" panel is gone for good
  await shot('t11-event-outside');
  await card.locator('.et-go').click();
  expect((await sent()).some(m => m.t === 'travel' && m.to === 'event')).toBe(true);
  // you walk in: the travel offer goes, the tracker shows everything
  await page.evaluate(e => { tvui5.fake('eventAt', { uid: e.uid, id: e.id }); tvui5.fake('eventTrack', { ...e, inside: true, inRange: true }); }, ev);
  await expect(card).toHaveClass(/inside/);
  await expect(card.locator('.et-go')).toHaveCount(0);
  const text = await card.innerText();
  expect(text).toContain('Wolves at the Ford');
  expect(text).toContain('A starving pack is crossing the ford');
  expect(text).toContain('Defeat the three packs, then the pack mother'); expect(text).toContain('1 / 4');
  expect(text).toMatch(/[56]:\d\d left/);
  expect(text).toContain('Event cache: a rare item or better');
  expect(text).toContain('Stage 2 of 4');
  expect(await card.locator('.et-bar i').evaluate(e => e.style.width)).toMatch(/^25(\.0)?%$/);
  // live progress
  await page.evaluate(e => tvui5.fake('eventTrack', { ...e, inside: true, objective: { ...e.objective, n: 3 }, stage: { n: 4, of: 4, name: 'The pack mother' }, leftMs: 25000, endsAt: Date.now() + 25000 }), ev);
  // the real server says this once a second; a card that hears nothing for 15 s is dropped — so keep saying it while the test looks
  await page.evaluate(e => { window.__evKeep = setInterval(() => tvui5.fake('eventTrack', { ...e, inside: true, objective: { ...e.objective, n: 3 }, stage: { n: 4, of: 4, name: 'The pack mother' }, leftMs: 25000, endsAt: Date.now() + 25000 }), 3000); }, ev);
  await expect(card.locator('.et-count')).toHaveText('3 / 4');
  await expect(card.locator('.et-time')).toHaveClass(/urgent/);
  await shot('t12-event-inside');
  await clean(page, 'event tracker');
  // the old messages (zoneEvent start / eventFrame) feed the same card — no second panel
  await page.evaluate(e => tvui5.fake('eventFrame', { uid: e.uid, name: e.name + ' — wave 3/3', hp: 0.4, players: 4 }), ev);
  await expect(page.locator('.tv-evtrack .et-card')).toHaveCount(1);
  await expect(page.locator('.tv-eventframe')).toBeHidden();
  // fold to one line and back
  await card.locator('.et-x').click();
  await expect(card).toHaveClass(/folded/);
  await expect(card.locator('.et-obj')).toHaveCount(0);
  await card.locator('.et-x').click();
  await page.evaluate(() => clearInterval(window.__evKeep));
  // it ends: one result line, kept on screen, and in chat
  await page.evaluate(e => { tvui5.fake('zoneEvent', { kind: 'end', ev: { uid: e.uid, id: e.id, name: e.name, info: { onSuccess: 'The ford is quiet again.' } }, won: true, result: { xp: 120, gold: 14, items: [{ name: 'Ashwood Bow', rarity: 'rare' }] } });
    tvui5.fake('eventDone', { uid: e.uid, id: e.id, name: e.name, result: 'success', credited: true, xp: 120, gold: 14, items: [{ name: 'Ashwood Bow', rarity: 'rare' }], text: 'Wolves at the Ford — success' }); }, ev);
  await expect(card).toHaveClass(/won/);
  await expect(card.locator('.et-result')).toHaveText('Won: Wolves at the Ford. The ford is quiet again.');
  await expect(card.locator('.et-got')).toHaveText('You got 120 experience, 14 gold, Ashwood Bow.');
  const chat = await page.evaluate(() => tv.social().chat.map(c => c.text).join('\n'));
  expect(chat).toContain('Won: Wolves at the Ford.');
  await shot('t12-event-result');
  // a failure reads as one
  await page.evaluate(() => { tvui5.fake('zoneEvent', { kind: 'start', ev: { uid: 'e78', name: 'The Stone in the Snow', x: 0, z: 0, r: 30, info: { what: 'Something under the snow is waking.', objective: { text: 'Break the stone', count: 3, unit: 'stages' }, durationSec: 600, rewardText: 'A rare item for everyone who takes part', onFail: 'The thing in the snow walks off into the hills.' } } });
    tvui5.fake('eventDone', { uid: 'e78', name: 'The Stone in the Snow', result: 'fail', why: 'time', credited: true }); });
  const lost = page.locator('.tv-evtrack .et-card.lost');
  await expect(lost.locator('.et-result')).toContainText('Failed: The Stone in the Snow.');
  await expect(lost.locator('.et-got')).toHaveText('No reward this time.');
  await page.evaluate(() => thousandvale.ui5.tracker.clear());
  await expect(page.locator('.tv-evtrack')).toBeHidden();
});

soft('T18: the Character menu sits beside the bag; equipping something moves the numbers, with ▲ ▼', async () => {
  test.setTimeout(480000);
  await page.keyboard.press('KeyV');
  await expect(page.locator('#panel-sheet')).toBeVisible();
  // the server's own sheet when it sends one, else the basic one — either way core rows with tooltips
  const rows0 = await page.locator('#panel-sheet [data-part="core"] .sh-row').count();
  expect(rows0).toBeGreaterThanOrEqual(3);
  expect(await page.locator('#panel-sheet [data-part="core"] .sh-row[data-tip]').count()).toBe(rows0);
  // the bag opens BESIDE it: both visible, no overlap
  await page.click('#panel-sheet [data-act="bag"]');
  await expect(page.locator('#bag')).toBeVisible();
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => ['#panel-sheet', '#bag'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
  expect(box[0].r, 'the sheet ends where the bag begins').toBeLessThanOrEqual(box[1].l + 1);
  expect(box[0].l).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => tvui5.state().sheet.docked)).toBe(true);
  // a full server sheet, then the same after a change of weapon
  const sheet = (dmg, dps, armour) => ({ t: 'sheet', core: [
    { id: 'hpMax', label: 'Health', value: 142, tip: 'Base 60 for a cleric, +18 a level, +10 from gear.' }, { id: 'mpMax', label: 'Mana', value: 90, tip: 'Base 70, +10 a level.' },
    { id: 'armour', label: 'Armour', value: armour, tip: 'Added up from what you wear. Takes ' + Math.round(armour / (armour + 60) * 100) + '% off a physical hit from an even-level enemy.' },
    { id: 'weapon', label: 'Weapon damage', value: dmg, tip: 'Printed on your weapon.' }, { id: 'crit', label: 'Critical chance', value: 5.000000001, unit: '%', tip: '5% base.' }],
    advanced: [{ id: 'leech', label: 'Life on hit', value: 0, tip: 'From gear.' }, { id: 'gcd', label: 'Time between swings', value: 1.2000000001, unit: 's', lowerIsBetter: true, tip: 'Your weapon speed.' }, { id: 'resFire', label: 'Fire resistance', value: 12.5, unit: '%', tip: 'From gear and perks.' }],
    abilities: [{ id: 'basic', slot: 0, name: 'Strike', dps, hit: dmg, every: 1.2, tip: 'Average hit divided by the time between swings, against a training dummy of your level.' },
      { id: 'mend', slot: 1, name: 'Mend', dps: null, why: 'It heals: nothing to count as damage.' }, { id: 'smite', slot: 2, name: 'Smite', dps: dps * 1.7000000001, tip: 'Cast on cooldown for 30 s against a training dummy.' }],
    angling: { level: 3, xp: 12, next: 40 } });
  await page.evaluate(s => tvui5.fake('sheet', s), sheet([4, 7], 4.5833333, 11));
  await expect(page.locator('#panel-sheet [data-id="armour"] .sh-value')).toHaveText('11');
  await expect(page.locator('#panel-sheet .sh-note.basic')).toHaveCount(0);
  await expect(page.locator('#panel-sheet [data-id="crit"] .sh-value')).toHaveText('5%');
  await expect(page.locator('#panel-sheet [data-id="ab:basic"] .sh-value')).toHaveText('4.58 / s');
  await expect(page.locator('#panel-sheet [data-id="ab:mend"]')).toContainText('It heals');
  await expect(page.locator('#panel-sheet .sh-angling')).toContainText('Angling 3 / 100');
  // Advanced is a switch
  const adv = page.locator('#panel-sheet [data-act="advanced"]');
  if (await adv.isChecked()) await adv.uncheck();
  await expect(page.locator('#panel-sheet [data-part="advanced"]')).toHaveCount(0);
  await adv.check();
  await expect(page.locator('#panel-sheet [data-part="advanced"] .sh-row')).toHaveCount(3);
  await expect(page.locator('#panel-sheet [data-id="gcd"] .sh-value')).toHaveText('1.2 s');
  // "equip": the new sheet arrives — numbers and marks change while the bag is still open
  await page.evaluate(s => tvui5.fake('sheet', s), { ...sheet([6, 11], 7.0833333, 9), advanced: [{ id: 'leech', label: 'Life on hit', value: 0, tip: 'From gear.' }, { id: 'gcd', label: 'Time between swings', value: 1.5, unit: 's', lowerIsBetter: true, tip: 'Your weapon speed.' }, { id: 'resFire', label: 'Fire resistance', value: 12.5, unit: '%', tip: 'From gear and perks.' }] });
  await expect(page.locator('#panel-sheet [data-id="weapon"] .sh-diff')).toHaveText('▲ +3');
  await expect(page.locator('#panel-sheet [data-id="armour"] .sh-diff')).toHaveText('▼ −2');
  await expect(page.locator('#panel-sheet [data-id="armour"] .sh-diff')).toHaveClass(/down/);
  await expect(page.locator('#panel-sheet [data-id="gcd"] .sh-diff')).toHaveClass(/down/);          // slower swings = worse, though the number went up
  await expect(page.locator('#panel-sheet [data-id="ab:basic"] .sh-diff')).toHaveText('▲ +2.5');
  await expect(page.locator('#panel-sheet [data-id="hpMax"] .sh-diff')).toHaveText('');
  await expect(page.locator('#panel-sheet .sh-note.changed')).toContainText('numbers changed');
  await expect(page.locator('#bag')).toBeVisible();
  // the tooltip says how the number is worked out
  await page.locator('#panel-sheet [data-id="armour"]').hover();
  await expect(page.locator('#tipbox')).toContainText('Added up from what you wear', { timeout: 5000 });
  await page.waitForTimeout(400);
  await shot('t18-sheet-with-bag');
  await clean(page, 'character sheet');
  await page.click('#panel-sheet [data-act="clear"]');
  await expect(page.locator('#panel-sheet .sh-diff.up')).toHaveCount(0);
  // the Stats button in the bag toggles it; closing either undocks
  await page.click('#inv-stats');
  await expect(page.locator('#panel-sheet')).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains('sheet-with-bag'))).toBe(false);
  await page.keyboard.press('KeyB');
});

soft('T7: a second two-hander goes in the off hand with Doubled Grasp — and the bag says why not without it', async () => {
  test.setTimeout(480000);
  const gs = { uid: 'gs-1', name: 'Old Greatsword', type: 'weapon', subtype: 'greatsword', twoHanded: true, dmg: [6, 11], rarity: 'common', levelReq: 1 };
  const maul = { uid: 'maul-1', name: 'Quarry Maul', type: 'weapon', subtype: 'warhammer', twoHanded: true, dmg: [7, 12], rarity: 'common', levelReq: 1 };
  await page.evaluate(([a, b]) => { const y = thousandvale.S.net.joined.you; y.dual2h = false; if (Array.isArray(y.perks)) y.perks = y.perks.filter(p => !String(p).includes('doubled_grasp')); tvui5.fake('equip', { equipment: { weapon: a } }); tvui5.fake('bag', { add: [b], remove: [], gold: 12 }); }, [gs, maul]);
  await page.keyboard.press('KeyB');
  await expect(page.locator('#doll-bottom [data-slot="offhand"]')).toHaveAttribute('data-tip', /needs both hands.*Doubled Grasp/);
  await sent();
  await page.locator('#bag-grid [data-tip-item="maul-1"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('#toasts')).toContainText('Doubled Grasp');
  expect((await sent()).filter(m => m.t === 'item' && m.op === 'equip')).toEqual([]);
  // with the perk: the off hand takes it
  await page.evaluate(() => { thousandvale.S.net.joined.you.dual2h = true; thousandvale.bag.draw(); });
  await expect(page.locator('#doll-bottom [data-slot="offhand"]')).toHaveAttribute('data-tip', /Doubled Grasp: drag a second two-handed weapon here/);
  await page.locator('#bag-grid [data-tip-item="maul-1"]').click({ modifiers: ['Shift'] });
  expect((await sent()).filter(m => m.t === 'item' && m.op === 'equip')).toEqual([{ t: 'item', op: 'equip', uid: 'maul-1', slot: 'offhand' }]);
  // the server's own refusal is said as is
  await page.evaluate(() => tvui5.fake('itemR', { op: 'equip', uid: 'maul-1', ok: false, why: 'perk', msg: 'You need Doubled Grasp to hold a two-hander in each hand.' }));
  await expect(page.locator('#toasts')).toContainText('You need Doubled Grasp');
  // both worn: the doll shows both
  await page.evaluate(([a, b]) => { tvui5.fake('bag', { add: [], remove: ['maul-1'], gold: 12 }); tvui5.fake('equip', { equipment: { weapon: a, offhand: b } }); }, [gs, maul]);
  await expect(page.locator('#doll-bottom [data-slot="offhand"][data-worn="1"]')).toBeVisible();
  await page.waitForTimeout(2500);
  await shot('t7-two-twohanders');
  await page.evaluate(() => { tvui5.fake('equip', { equipment: thousandvale.S.net.joined.you.equipment || {} }); });
  await page.keyboard.press('KeyB');
});

soft('T19 + T21: Feedback — suggestion or bug report, "what will be sent", a confirmation; an admin reads and files reports', async () => {
  test.setTimeout(480000);
  await page.evaluate(() => console.warn('[spec] a line for the log ring'));
  await page.click('#menu-feedback');
  await expect(page.locator('#panel-feedback')).toBeVisible();
  await expect(page.locator('#panel-feedback .fb-ctx')).toHaveCount(0);          // a suggestion attaches nothing
  await page.click('#panel-feedback [data-kind="bug"]');
  const det = page.locator('#panel-feedback .fb-ctx');
  await expect(det).toBeVisible();
  await det.locator('summary').click();
  const lines = await det.locator('.fb-lines').innerText();
  expect(lines).toMatch(/Character: Wren, level \d+ Cleric/);
  expect(lines).toMatch(/Where: .+ at -?\d+, -?\d+/);
  expect(lines).toContain('1180x720');
  expect(await det.locator('.fb-log').innerText()).toContain('[spec] a line for the log ring');
  // too short: said, nothing sent
  await sent();
  await page.fill('#panel-feedback textarea', 'bad');
  await page.click('#panel-feedback [data-act="send"]');
  await expect(page.locator('#panel-feedback .note')).toContainText('Write a little more');
  expect((await sent()).filter(m => m.t === 'feedback')).toEqual([]);
  await page.fill('#panel-feedback textarea', 'The gate in Torborhold shut on my horse and I could not get back in.');
  await det.locator('summary').click().catch(() => {});
  await page.locator('#panel-feedback .fb-ctx summary').click();
  await page.waitForTimeout(300);
  await shot('t19-feedback-bug');
  await clean(page, 'feedback');
  await page.click('#panel-feedback [data-act="send"]');
  const fb = (await sent()).find(m => m.t === 'feedback');
  expect(fb.kind).toBe('bug'); expect(fb.text).toContain('The gate in Torborhold');
  expect(fb.ctx.name).toBe('Wren'); expect(Number.isInteger(fb.ctx.x)).toBe(true); expect(Array.isArray(fb.ctx.log)).toBe(true);
  expect(fb.ctx.log.join('\n')).toContain('[spec] a line for the log ring');
  expect(JSON.stringify(fb.ctx)).not.toMatch(/token|password/i);
  // the answer (the real server's, or ours if that half is not in yet)
  await page.evaluate(() => { if (!tvui5.state().feedback.sent) tvui5.fake('feedbackR', { ok: true, id: 41, first: true }); });
  await expect(page.locator('#panel-feedback .fb-done')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#panel-feedback .fb-done')).toContainText('Bug report sent. Thank you.');
  await shot('t19-feedback-sent');
  await page.click('#panel-feedback [data-act="again"]');
  await expect(page.locator('#panel-feedback textarea')).toHaveValue('');
  // a refusal keeps the text
  await page.fill('#panel-feedback textarea', 'Please add more fish to the northern lakes.');
  await page.click('#panel-feedback [data-kind="suggestion"]');
  await expect(page.locator('#panel-feedback textarea')).toHaveValue('Please add more fish to the northern lakes.');
  // T21: not an admin = no Reports button; an admin gets the list
  await expect(page.locator('#panel-feedback [data-act="reports"]')).toHaveCount(0);
  await page.evaluate(() => { thousandvale.S.net.joined.you.admin = true; thousandvale.ui5.feedback.draw(); });
  await page.click('#panel-feedback [data-act="reports"]');
  await expect(page.locator('#panel-reports')).toBeVisible();
  expect((await sent()).some(m => m.t === 'admin' && m.op === 'reports' && m.state === 'new')).toBe(true);
  const list = [
    { id: 41, kind: 'bug', state: 'new', text: 'The gate in Torborhold shut on my horse and I could not get back in.', at: Date.now() - 60000, name: 'Wren', client: { name: 'Wren', level: 2, cls: 'cleric', zone: 'The Torbor Fields', x: 1024, z: 987, build: 'dev', fps: 58, log: ['[warn] gate state late', '[game] You cannot enter.'] } },
    { id: 40, kind: 'suggestion', state: 'new', text: 'More fish in the northern lakes, and a bigger bag please.', at: Date.now() - 3600000, name: 'Brem', level: 4 },
    { id: 39, kind: 'bug', state: 'trashed', text: 'asdf', at: Date.now() - 7200000, name: 'Nobody' }];
  await page.evaluate(l => tvui5.fake('adminReports', { list: l, counts: { new: 2, approved: 0, declined: 0, trashed: 1 } }), list);
  await expect(page.locator('#panel-reports .rp-row')).toHaveCount(2);                      // "New" is the filter
  await shot('t21-reports-list');
  await page.selectOption('#panel-reports [data-f="kind"]', 'bug');
  await page.evaluate(l => tvui5.fake('adminReports', { list: l }), list);
  await expect(page.locator('#panel-reports .rp-row')).toHaveCount(1);
  await page.click('#panel-reports .rp-row[data-id="41"]');
  await expect(page.locator('#panel-reports .rp-text')).toContainText('The gate in Torborhold');
  await expect(page.locator('#panel-reports .fb-lines')).toContainText('Character: Wren, level 2 Cleric');
  await sent();
  await shot('t21-report-open');
  await page.click('#panel-reports [data-set="approved"]');
  expect((await sent()).find(m => m.t === 'admin' && m.op === 'report')).toMatchObject({ id: 41, state: 'approved' });
  await page.evaluate(() => tvui5.fake('adminR', { ok: true, id: 41, state: 'approved' }));
  await expect(page.locator('#toasts')).toContainText('Report #41: approved');
  await clean(page, 'reports');
  await page.evaluate(() => { thousandvale.ui5.feedback.reports.panel.close(); thousandvale.ui5.feedback.panel.close(); thousandvale.S.net.joined.you.admin = false; });
});

soft('T20: a letter shows what it holds; taking needs bag room and says so; a gift is unwrapped with the reveal', async () => {
  test.setTimeout(480000);
  const gift = { uid: 'gift-1', id: 'gift', kind: 'gift', type: 'gift', name: 'Gift Box', rarity: 'rare', gift: { minRarity: 'rare' } };
  const letter = { id: 9001, kind: 'gift', from: 'The Thousandvale Wardens', subject: 'Thank you', body: 'Thanks for taking the time to improve the game. Something for your trouble is inside.', sentAt: Date.now() - 5000, read: false, taken: false, items: [gift], gold: 0 };
  await page.evaluate(() => tv.panel('mail', true));
  await page.evaluate(l => tvui5.fake('mailList', { mail: [l], unread: 1 }), letter);
  await expect(page.locator('#panel-mail .ml-row')).toContainText('Thank you');
  await expect(page.locator('#panel-mail .ml-att.gift')).toContainText('1 item');
  await page.click('#panel-mail .ml-row');
  await page.evaluate(l => tvui5.fake('mailOpen', { mail: { ...l, read: true } }), letter);
  await expect(page.locator('#panel-mail .ml-items .islot.gift')).toBeVisible();
  await expect(page.locator('#panel-mail .ml-names')).toHaveText('Gift Box');
  await expect(page.locator('#panel-mail [data-act="take"]')).toHaveText('Take and unwrap');
  await expect(page.locator('#panel-mail [data-act="take"]')).toBeEnabled();        // a system letter needs no town
  // the attachment has the full card before you take it
  await page.locator('#panel-mail .ml-items .islot.gift').hover({ force: true });      // it bobs (never "stable")
  await expect(page.locator('#tipbox .ic-crate')).toContainText('Rare at the least', { timeout: 5000 });
  await shot('t20-mail-gift');
  // a full bag: said before the click, with the numbers
  await page.evaluate(() => { const y = thousandvale.S.net.joined.you; y.__max = y.bagMax; y.bagMax = thousandvale.bag.state.bag.length; thousandvale.mail.draw(); });
  await expect(page.locator('#panel-mail .ml-room')).toContainText('Your bag is full. Make room for 1 item first.');
  await expect(page.locator('#panel-mail [data-act="take"]')).toBeDisabled();
  await shot('t20-mail-bag-full');
  await page.evaluate(() => { const y = thousandvale.S.net.joined.you; y.bagMax = y.__max; thousandvale.mail.draw(); });
  // take: the mail message goes out; the gift lands in the bag and is unwrapped at once
  await sent();
  await page.click('#panel-mail [data-act="take"]');
  expect((await sent()).find(m => m.t === 'mail' && m.op === 'take')).toMatchObject({ id: 9001 });
  await page.evaluate(g => { tvui5.fake('bag', { add: [g], remove: [], gold: 12 }); tvui5.fake('mailR', { op: 'take', ok: true, id: 9001 }); }, gift);
  await expect(page.locator('.tv-reveal.waiting.gift')).toBeVisible({ timeout: 5000 });
  expect((await sent()).some(m => m.t === 'item' && m.op === 'use' && String(m.uid) === 'gift-1')).toBe(true);
  const ring = { uid: 'ring-7', name: 'Signet of the Long Road', slot: 'ring', rarity: 'rare', ilvl: 3, levelReq: 1, affixes: [{ stat: 'hpMax', value: 14, text: '+14 health' }] };
  await page.evaluate(r => { tvui5.fake('bag', { add: [r], remove: ['gift-1'], gold: 12 }); tvui5.fake('itemR', { op: 'use', uid: 'gift-1', ok: true, opened: { item: r, items: [r], from: 'gift', name: 'Gift Box' } }); }, ring);
  await expect(page.locator('.tv-reveal.open.gift')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.tv-reveal .rv-from')).toHaveText('A gift for you');
  await expect(page.locator('.tv-reveal .rv-name')).toHaveText('Signet of the Long Road');
  await page.waitForTimeout(900);
  await shot('t20-gift-reveal');
  await page.keyboard.press('Escape');
  await page.click('.tv-reveal [data-act="ok"]').catch(() => {});
  await expect(page.locator('.tv-reveal')).toBeHidden();
  // the server's own "bag full" on take has the numbers too
  await page.evaluate(() => tvui5.fake('mailR', { op: 'take', ok: false, why: 'bagFull', need: 2, free: 1 }));
  await expect(page.locator('#toasts')).toContainText('room for 1 more, and this letter holds 2');
  await page.evaluate(() => tv.panel('mail', false));
});

soft('T25: angling — cast, the bite prompt, the tension tug (keyboard and pointer), the catch; the Catch tab; cooking', async () => {
  test.setTimeout(480000);
  // no rod: X says where to get one
  await expect(page.locator('.fish-btn')).toBeHidden();
  await page.keyboard.press('KeyX');
  await expect(page.locator('#toasts')).toContainText('You need a fishing rod');
  const rod = { uid: 'rod-1', id: 'angling_rod', kind: 'tool', tool: 'rod', name: 'Willow Rod', rarity: 'common' };
  await page.evaluate(r => tvui5.fake('bag', { add: [r], remove: [], gold: 12 }), rod);
  await expect(page.locator('.fish-btn')).toBeVisible();
  await sent();
  await page.keyboard.press('KeyX');
  expect((await sent()).find(m => m.t === 'fish')).toMatchObject({ op: 'cast' });
  await page.evaluate(() => tvui5.fake('fishR', { ok: true, state: 'wait', at: { x: 0, z: 0 }, water: 'river' }));
  await expect(page.locator('.tv-fish .fish-pill')).toContainText('Waiting for a bite');
  // the bite: a prompt with a shrinking ring; Space hooks it
  await page.evaluate(() => { window.__fish = []; addEventListener('tv:fish', e => __fish.push(e.detail.state)); tvui5.fake('fishBite', { ms: 6000 }); });
  await expect(page.locator('.fish-bite')).toBeVisible();
  await expect(page.locator('.fish-bite')).toContainText('A bite!');
  await page.waitForTimeout(250);
  await shot('t25-bite');
  await page.keyboard.press('Space');
  expect((await sent()).find(m => m.t === 'fish')).toMatchObject({ op: 'hook' });
  // the tug: hold Space to reel
  await page.evaluate(() => tvui5.fake('fishTug', { ms: 12000, band: 0.34, pull: 0.4, jitter: 0.3, need: 0.55, rarity: 'rare', heft: 'heavy' }));
  await expect(page.locator('.fish-tug')).toBeVisible();
  await expect(page.locator('.fish-tug .tug-title')).toHaveText('A heavy one!');
  await expect(page.locator('.fish-tug')).toContainText('Keep it in the green 55% of the time');
  const p0 = await page.evaluate(() => tvui5.state().angling.tug.pos);
  await page.keyboard.down('Space');
  await page.waitForTimeout(2000);          // (a software renderer draws ~4 frames a second: give the float time to turn round)
  const p1 = await page.evaluate(() => tvui5.state().angling.tug.pos);
  expect(p1, 'holding Space reels the float up').toBeGreaterThan(Math.min(p0, 0.9) - 0.001); expect(p1).toBeGreaterThan(0.3);
  expect(await page.evaluate(() => tvui5.state().angling.holding)).toBe(true);
  await page.keyboard.up('Space');
  await page.waitForTimeout(1800);
  const p2 = await page.evaluate(() => tvui5.state().angling.tug.pos);
  expect(p2, 'letting go lets it sink').toBeLessThan(p1 + 0.001); expect(p2).toBeLessThan(0.95);
  await shot('t25-tug');
  // the mouse / a finger does the same: press on the panel = hold (a fresh tug, so a slow machine has the whole of it)
  await page.evaluate(() => tvui5.fake('fishTug', { ms: 12000, band: 0.34, pull: 0.4, jitter: 0.3, need: 0.55, rarity: 'rare', heft: 'heavy' }));
  await expect(page.locator('.fish-tug')).toBeVisible();
  const tb = await page.locator('.fish-tug').boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => tvui5.state().angling.holding)).toBe(true);
  await page.mouse.up();
  expect(await page.evaluate(() => tvui5.state().angling.holding)).toBe(false);
  // play it out: steer toward the band until the time is up
  await page.evaluate(() => { window.__sent.length = 0; tvui5.fake('fishTug', { ms: 5000, band: 0.34, pull: 0.4, jitter: 0.3, need: 0.55, rarity: 'rare', heft: 'heavy' }); });
  await page.evaluate(async () => { for (let i = 0; i < 400 && tvui5.state().angling.state === 'tug'; i++) { const t = tvui5.state().angling.tug; if (!t) break; const want = t.pos < t.centre; if (want !== tvui5.state().angling.holding) dispatchEvent(new KeyboardEvent(want ? 'keydown' : 'keyup', { code: 'Space', bubbles: true })); await new Promise(r => setTimeout(r, 30)); } dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })); });
  const land = await page.evaluate(async () => { for (let i = 0; i < 100; i++) { const m = window.__sent.find(x => x.t === 'fish' && x.op === 'land'); if (m) return m; await new Promise(r => setTimeout(r, 50)); } return null; });
  expect(land, 'the result of the tug is sent').toBeTruthy();
  expect(land.held).toBeGreaterThan(0.1); expect(land.held).toBeLessThanOrEqual(1);      // (a scripted hand at ~4 frames a second; tests/D/pt5.test.js checks the tug itself)
  await sent();
  await page.evaluate(() => tvui5.fake('fishCatch', { ok: true, kind: 'fish', species: { id: 'moon_eel', name: 'Moon Eel', rarity: 'rare' }, size: 61.3499999, record: true, first: true, skill: { level: 4, xp: 3, next: 50, up: true }, pool: { id: 5, left: 3 }, item: { uid: 'fish-1', id: 'moon_eel', kind: 'fish', name: 'Moon Eel', rarity: 'rare', size: 61.35 } }));
  const cardText = await page.locator('.fish-card').innerText();
  expect(cardText).toContain('Moon Eel'); expect(cardText).toContain('61.3 cm — your biggest yet'); expect(cardText).toContain('A new species'); expect(cardText).toContain('Angling is now 4'); expect(cardText).toContain('This pool has 3 more');
  await shot('t25-catch');
  await clean(page, 'catch card');
  expect(await page.evaluate(() => window.__fish.join(','))).toMatch(/^bite,bite,tug(,tug)*,catch$|^bite,bite,(tug,)+catch$/);     // what D-world's rod and bobber follow: only the agreed names
  // a missed bite and a lost fish say so
  await page.evaluate(() => { tvui5.fake('fishR', { ok: false, why: 'late' }); });
  await expect(page.locator('.fish-pill.miss')).toContainText('Too late');
  await page.evaluate(() => { tvui5.fake('fishR', { op: 'end', ok: true, why: 'moved' }); thousandvale.ui5.angling._test.idle(); });
  await expect(page.locator('.tv-fish')).toBeHidden();

  // the Catch tab (E's species list; what you have caught from you.angling)
  await page.evaluate(async () => { await thousandvale.ui5.angling.loadData(); const d = thousandvale.ui5.angling.data; const f = d.fish || []; const y = thousandvale.S.net.joined.you;
    y.angling = { level: 4, xp: 3, next: 50, catches: Object.fromEntries(f.slice(0, 5).map((x, i) => [x.id, { n: i + 1, best: 20.123456 + i * 7, zone: 'z12_02' }])), legends: (d.legends || []).slice(0, 1).map(l => l.id) };
    if (y.angling.legends[0]) y.angling.catches[y.angling.legends[0]] = { n: 1, best: 148.2, zone: 'z12_02' };
    tvui5.catchTab(); });
  await expect(page.locator('#panel-journal [data-tab="catch"]')).toHaveAttribute('aria-checked', 'true');
  const hasData = await page.evaluate(() => (thousandvale.ui5.angling.data?.fish || []).length);
  if (hasData) {
    await expect(page.locator('#panel-journal .jc-skill')).toContainText('Angling 4 / 100');
    await expect(page.locator('#panel-journal .jc-sum')).toContainText(`5 / ${hasData} species found`);
    expect(await page.locator('#panel-journal .jc-fish.known').count()).toBeGreaterThanOrEqual(5);
    expect(await page.locator('#panel-journal .jc-fish:not(.known)').count()).toBeGreaterThan(0);
    await expect(page.locator('#panel-journal .jc-fish.known em').first()).toHaveText(/biggest \d+(\.\d)? cm/);
  } else await expect(page.locator('#panel-journal .j-empty')).toContainText('Nothing caught yet');
  await page.waitForTimeout(300);
  await shot('t25-catch-tab');
  await clean(page, 'catch tab');
  await page.evaluate(() => thousandvale.ui.journal.panel.close());

  // cooking at a fire
  await page.evaluate(() => { tvui5.fake('bag', { add: [{ uid: 'fish-1', id: 'silver_perch', species: 'silver_perch', kind: 'fish', type: 'fish', name: 'Silver Perch', rarity: 'common', size: 22 }, { uid: 'fish-2', id: 'silver_perch', species: 'silver_perch', kind: 'fish', type: 'fish', name: 'Silver Perch', rarity: 'common', size: 24.5 }], remove: [], gold: 12 });
    tvui5.fake('used', { ok: true, kind: 'campfire', cook: true });
    tvui5.fake('cookList', { fire: true, recipes: [{ id: 'perch_skewer', name: 'Perch Skewer', needs: [{ id: 'silver_perch', name: 'Silver Perch', n: 1, have: 2 }], makes: { id: 'perch_skewer', name: 'Perch Skewer', text: 'Eat sitting down: restores health over 20 s.' }, can: true },
      { id: 'eel_pie', name: 'Eel Pie', needs: [{ id: 'moon_eel', name: 'Moon Eel', n: 1, have: 0 }, { id: 'silver_perch', name: 'Silver Perch', n: 2, have: 2 }], makes: { id: 'eel_pie', name: 'Eel Pie' }, can: false }] }); });
  await expect(page.locator('#panel-cook')).toBeVisible();
  await expect(page.locator('#panel-cook .ck-row')).toHaveCount(2);
  await expect(page.locator('#panel-cook .ck-row[data-id="eel_pie"] .ck-why')).toHaveText('You lack 1 Moon Eel.');
  await expect(page.locator('#panel-cook [data-cook="eel_pie"]')).toBeDisabled();
  await expect(page.locator('#panel-cook [data-cookall="perch_skewer"]')).toHaveText('All (2)');
  await shot('t25-cooking');
  await sent();
  await page.click('#panel-cook [data-cook="perch_skewer"]');
  expect((await sent()).find(m => m.t === 'cook' && m.id)).toMatchObject({ id: 'perch_skewer', n: 1 });
  await page.evaluate(() => tvui5.fake('cookR', { ok: true, item: { name: 'Perch Skewer' }, items: [{ name: 'Perch Skewer' }] }));
  await expect(page.locator('#toasts')).toContainText('Cooked: Perch Skewer');
  await clean(page, 'cooking');
  await page.evaluate(() => thousandvale.ui5.angling.cook.close());
  // the fish item card
  await page.keyboard.press('KeyB');
  await page.locator('#bag-grid [data-tip-item="fish-2"]').hover();
  await expect(page.locator('#tipbox')).toContainText('24.5 cm', { timeout: 5000 });
  await page.keyboard.press('KeyB');
});

soft('T3 + T4: a targeted ally gets your heals (the note says who); a fallen player is offered a raise and answers it', async () => {
  test.setTimeout(480000);
  const { connect, memoryTokenStore } = await import('../../js/net/client.js');
  await page.evaluate(() => { thousandvale.ui5.angling._test.idle(); thousandvale.ui5.angling.cook.close(); });
  bot = connect({ mode: 'ws', url: `ws://127.0.0.1:${port}`, tokenStore: memoryTokenStore(), guestName: 'Brem' });
  await bot.ready;
  const bc = await bot.createChar({ name: 'Brem', cls: 'warrior', look: { race: 'dwarf', seed: 77, v: 1 } });
  await bot.play(bc.id);
  await expect.poll(() => page.evaluate(() => tv.state().ents.find(e => e.name === 'Brem')?.id ?? null), { timeout: 30000 }).not.toBe(null);
  const brem = await page.evaluate(() => tv.state().ents.find(e => e.name === 'Brem').id);
  // a cleric has a friendly skill on the bar (the rules' `ally` flag)
  const allySlot = await page.evaluate(() => thousandvale.S.bar?.find?.(b => b.ally && !b.locked && !b.empty)?.slot ?? null) ?? await page.evaluate(() => (thousandvale.S.bar || []).find(b => b.ally)?.slot ?? null);
  expect(allySlot, 'a cleric has a heal on the bar').not.toBe(null);
  await expect(page.locator('.ally-note')).toBeHidden();
  await page.evaluate(id => tv.target(id), brem);
  await expect(page.locator('.ally-note')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.ally-note')).toContainText('Your heals and wards go to Brem');
  await expect(page.locator('#target-frame')).toHaveClass(/friendly/);
  // the cast carries the friend as its target
  await page.evaluate(() => { const n = thousandvale.S.net, c = n.cast; window.__casts = []; n.cast = o => { window.__casts.push(o); return c(o); }; });
  await page.keyboard.press('Digit' + allySlot);
  const cast = await page.evaluate(() => window.__casts.at(-1));
  expect(cast?.target).toBe(brem);
  await page.waitForTimeout(300);
  await shot('t3-ally-target');
  // nobody targeted: it goes to you
  await page.click('#self-frame');
  await expect(page.locator('.ally-note')).toBeHidden();
  await page.waitForTimeout(1600);
  await page.evaluate(() => { thousandvale.S.cds = {}; });
  await page.keyboard.press('Digit' + allySlot);
  const self = await page.evaluate(() => ({ c: window.__casts.at(-1), me: tv.state().you.id }));
  expect(self.c.target).toBe(self.me);
  // the skill card says who it touches when the rules send `targets`
  await page.evaluate(s => { const b = thousandvale.S.bar.find(x => x.slot === s); b.targets = 'you or the party member you target'; thousandvale.hud.setBar(thousandvale.S.bar, n => n.slice(0, 2)); }, allySlot);
  expect(await page.locator('#actionbar .slot').nth(allySlot).getAttribute('data-tip-html')).toContain('Affects: you or the party member you target');

  // T4: dead — someone offers to raise you
  await hook('/kill', { name: 'Wren' });
  await expect(page.locator('#death')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => tvui5.fake('reviveAsk', { id: 501, from: 'Brem', fromId: 2, skill: 'Second Dawn', skillId: 'second_dawn', hpPct: 0.25, ms: 60000, until: Date.now() + 60000, note: 'You come back in the middle of the fight.' }));
  const ask = page.locator('#death .revive-ask');
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('Brem offers to raise you');
  await expect(ask).toContainText('With Second Dawn: you stand up right here at 25% health.');
  await expect(ask.locator('.rv-left')).toHaveText(/0:5\d|1:00/, { timeout: 3000 });
  await page.waitForTimeout(600);
  await shot('t4-revive-ask');
  await clean(page, 'revive prompt');
  await sent();
  await ask.locator('[data-act="accept"]').click();
  expect((await sent()).find(m => m.t === 'revive')).toMatchObject({ op: 'accept', id: 501 });
  await expect(ask).toBeHidden();
  // the caster hears how it went
  await page.evaluate(() => tvui5.fake('reviveR', { op: 'declined', name: 'Aldra' }));
  await expect(page.locator('#toasts')).toContainText('Aldra turned the offer down');
  await page.keyboard.press('KeyR').catch(() => {});
});

soft('phone size: the kit step, the tracker, the sheet under the bag, the tug and feedback all fit', async ({ browser }) => {
  test.setTimeout(480000);
  const c2 = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const p = await c2.newPage();
  p.on('pageerror', e => errors.push('phone: ' + e.message));
  p.setDefaultTimeout(30000);
  // the kit step on the title screen
  await p.goto(base + '?quality=low&fresh=1&tod=0.45');
  await p.waitForSelector('#loading.done', { timeout: 120000 });
  await p.fill('#name', 'Pip');
  await p.click('#classes [data-cls="warrior"]');
  await p.click('#enter');
  await expect(p.locator('#panel-appearance')).toBeVisible();
  const real = await p.evaluate(async () => !!(await thousandvale.ui5.kits.load(thousandvale.S.cls)));
  if (!real) await p.evaluate(k => tvui5.kits(k), SAMPLE_KITS);
  await p.click('#panel-appearance [data-act="save"]');
  await expect(p.locator('#panel-kits')).toBeVisible({ timeout: 15000 });
  await p.locator('#panel-kits [data-group="weapons"]').nth(1).click();
  await p.waitForTimeout(6000);
  const kb = await p.locator('#panel-kits').boundingBox();
  expect(kb.x).toBeGreaterThanOrEqual(0); expect(kb.x + kb.width).toBeLessThanOrEqual(391); expect(kb.y + kb.height).toBeLessThanOrEqual(781);
  // (with the phone layout on — stream G's layer — the kit step is a full sheet with its own "peek" at the figure; without it the panel is the lower half)
  if (!(await p.evaluate(() => document.documentElement.dataset.layout === 'phone'))) expect(kb.y, 'the figure shows above the panel').toBeGreaterThan(250);
  await shot('phone-t5-kits', p);
  await p.locator('#panel-kits [data-act="create"]').scrollIntoViewIfNeeded();
  await expect(p.locator('#panel-kits [data-act="create"]')).toBeVisible();
  // into the world (a quick second character)
  await p.goto(base + '?quality=low&autoplay=1&name=Pip&cls=warrior&tod=0.45');
  await p.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 120000 });
  await p.waitForTimeout(3000);
  await spy(p);
  // With stream G's phone layout switched on, a 390 px screen is G's layer (sheets, the HUD-info toggle that holds the right column,
  // peek on the title panels): tests/G checks that. The rest of this test is the plain narrow-window layout.
  if (await p.evaluate(() => document.documentElement.dataset.layout === 'phone')) { console.log('[pt5] phone layout is on: the narrow-window checks are skipped (tests/G covers the phone layer)'); await c2.close(); return; }
  const fits = async sel => { const b = await p.locator(sel).first().boundingBox(); expect(b, sel).toBeTruthy(); expect(b.x, sel + ' left').toBeGreaterThanOrEqual(-1); expect(b.x + b.width, sel + ' right').toBeLessThanOrEqual(391); expect(b.y + b.height, sel + ' bottom').toBeLessThanOrEqual(781); return b; };
  // the event tracker
  await p.evaluate(() => { const me = tv.state().you; tvui5.fake('eventTrack', { uid: 'e1', name: 'Wolves at the Ford', state: 'live', what: 'A starving pack is crossing the ford toward the farms.', objective: { text: 'Defeat the three packs, then the pack mother', n: 2, of: 4 }, leftMs: 372000, rewardText: 'Event cache: a rare item or better, gold and experience', inside: true, players: 3, x: me.x, z: me.z, r: 40 }); });
  await expect(p.locator('.tv-evtrack .et-card')).toBeVisible();
  await fits('.tv-evtrack .et-card');
  await shot('phone-t12-event', p);
  await p.evaluate(() => thousandvale.ui5.tracker.clear());
  // the sheet under the bag
  await p.evaluate(() => { tvui5.openSheet(true); thousandvale.bag.toggle(true); thousandvale.ui5.sheet.dock(); });
  await p.waitForTimeout(500);
  const bag = await fits('#bag'), sh = await fits('#panel-sheet');
  expect(sh.y, 'the sheet sits under the bag').toBeGreaterThanOrEqual(bag.y + bag.height - 1);
  expect(sh.height).toBeGreaterThan(120);
  await shot('phone-t18-sheet-bag', p);
  await p.evaluate(() => { tvui5.openSheet(false); thousandvale.bag.toggle(false); });
  // the bite and the tug with a finger
  await p.evaluate(() => { tvui5.fish.bite(8000); });
  await fits('.fish-bite');
  await p.locator('.fish-bite').dispatchEvent('pointerdown');      // a finger down (the prompt jolts about: never "stable" for a scripted tap)
  expect(await p.evaluate(() => tvui5.state().angling.state)).toBe('hooked');
  await p.evaluate(() => tvui5.fish.tug({ ms: 9000, band: 0.3, pull: 0.4, jitter: 0.3, need: 0.6 }));
  const tb = await fits('.fish-tug');
  const pos0 = await p.evaluate(() => tvui5.state().angling.tug.pos);
  await p.evaluate(([x, y]) => { const el = document.querySelector('.fish-tug'); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: y })); }, [tb.x + 40, tb.y + 40]);
  await p.waitForTimeout(450);
  expect(await p.evaluate(() => tvui5.state().angling.tug.pos), 'a finger held on the panel reels').toBeGreaterThan(pos0);
  await shot('phone-t25-tug', p);
  await p.evaluate(() => { document.querySelector('.fish-tug').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch' })); tvui5.fish.idle(); });
  // feedback
  await p.evaluate(() => tvui5.feedback('bug'));
  await fits('#panel-feedback');
  await p.locator('#panel-feedback .fb-ctx summary').tap();
  await p.waitForTimeout(300);
  await fits('#panel-feedback');
  await shot('phone-t19-feedback', p);
  await p.evaluate(() => thousandvale.ui5.feedback.panel.close());
  // a crate reveal
  await p.evaluate(() => tvui5.reveal({ uid: 'b1', name: 'Wayfarer Boots of the Hare', slot: 'feet', tier: 'light', rarity: 'rare', armor: 6 }, 'crate'));
  await fits('.tv-reveal .rv-card');
  await p.waitForTimeout(900);
  await shot('phone-t9-reveal', p);
  await clean(p, 'phone');
  await c2.close();
});

test('no page errors, and every screen above passed', async () => { expect(errors).toEqual([]); expect(fails).toEqual([]); });
