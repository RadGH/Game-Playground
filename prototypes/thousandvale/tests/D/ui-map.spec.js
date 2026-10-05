// Stream D-UI — play-test 1, the map and the menus through the real client (P3 map, P13 minimap + dungeon map,
// P27 event/quest markers + rim arrows, P5 custom tooltips, P17 Journal + tracker, P18 Party menu).
// Starts its own server (tests/D/m3-server.mjs: stream A's server, memory DB). Screenshots: tests/D/shots/ui-*.png.
// Run (shared lock, one browser at a time):
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/ui-map.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base;
test.beforeAll(async () => {
  const port = await freePort(), hook = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hook)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });

async function join_(browser, name, viewport = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${base}?autoplay=1&name=${name}&cls=warrior&quality=low`);
  await page.waitForFunction(() => window.tv && window.tv.state().status === 'online' && window.tv.state().phase === 'world', null, { timeout: 60000 });
  await page.waitForFunction(() => window.tvui && window.tvui.atlas().loaded && window.tvui.atlas().world, null, { timeout: 60000 });
  return { ctx, page, errors };
}
const shot = (page, n) => page.screenshot({ path: join(SHOTS, `ui-${n}.png`) });

test('map, minimap, markers, tooltips, journal, party menu', async ({ browser }) => {
  test.setTimeout(300000);
  const P = await join_(browser, 'Cartwen');
  const { page } = P;
  const me = await page.evaluate(() => window.tv.state().you);

  // P5: no native title bubbles anywhere in the HUD; the skill bar and menu buttons carry shared tooltips
  expect(await page.evaluate(() => document.querySelectorAll('#hud [title], #title [title]').length)).toBe(0);
  const tips = await page.evaluate(() => [...document.querySelectorAll('#menubar .mb-btn')].map(b => b.dataset.tip));
  expect(tips.every(Boolean)).toBe(true);
  // the tooltip opens on hover AND stays while a mouse button is held
  await page.hover('#menu-map');
  await expect(page.locator('#tipbox')).toBeVisible();
  await expect(page.locator('#tipbox')).toContainText('Map');
  await page.mouse.down();
  await page.waitForTimeout(250);
  await expect(page.locator('#tipbox')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.press('Escape');

  // P13: the minimap is drawn with you in the middle and the zone + band under it
  await expect(page.locator('.minimap')).toBeVisible();
  await expect(page.locator('.minimap .mm-zone')).toContainText(/levels? \d/);
  await page.evaluate(() => window.tvui.miniZoom(1));
  await page.waitForTimeout(400);
  await shot(page, 'minimap-town');

  // P27: a live zone event and a quest goal off the minimap's edge get rim arrows with a distance
  const evAt = { x: me.x + 700, z: me.z - 300 };
  await page.evaluate(({ evAt }) => {
    window.tvui.fake('zoneEvent', { kind: 'start', ev: { uid: 'e1', id: 'event_grandmother_skein', name: 'Grandmother Skein', x: evAt.x, z: evAt.z, r: 40, wave: 1, waves: 3 } });
    window.tvui.fake('quests', { active: [
      { id: 'wolves_at_the_fold', name: 'Wolves at the Fold', level: 1, zone: 'z12_02', giver: 'elder_maud', text: 'Moor hounds have been at the sheep folds every night this week.', step: 0, steps: [{ text: 'Moor hounds killed', of: 8, n: 3 }], ready: false, reward: { xp: 0.35, gold: 9, item: 'common' } },
      { id: 'toll_at_fitockpi', name: 'The Toll at Fitockpi', level: 3, zone: 'z12_02', giver: 'reeve_corwin', text: 'Brigands hold Fitockpi Ford.', group: 'the captain is an elite: bring a friend', step: 1, steps: [{ text: 'Brigands dealt with', of: 6, n: 6, done: true }, { text: 'Hobb Gallowsby stopped', of: 1, n: 0 }], ready: false, reward: { xp: 0.7, gold: 150, item: 'uncommon' } },
    ], done: [] });
    window.tvui.track('toll_at_fitockpi');
  }, { evAt });
  await page.waitForTimeout(600);
  const mm = await page.evaluate(() => window.tvui.minimap());
  expect(mm.arrows.some(a => a.kind === 'liveevent')).toBe(true);
  expect(mm.arrows.some(a => a.id === 'q:toll_at_fitockpi') || mm.markers.some(m => m.id === 'q:toll_at_fitockpi')).toBe(true);
  // the HUD tracker names the goal and where it is
  await expect(page.locator('.tv-tracker .tr-main')).toContainText('Hobb Gallowsby');
  await expect(page.locator('.tv-tracker .tr-where')).toContainText(/\d+(\.\d)? k?m (north|south|east|west)/);
  await shot(page, 'minimap-arrows');
  await page.evaluate(() => window.tvui.miniRotate(true));
  await page.waitForTimeout(300);
  await page.locator('.minimap').screenshot({ path: join(SHOTS, 'ui-minimap-rotated.png') });
  await page.evaluate(() => window.tvui.miniRotate(false));

  // P3: M opens the map; World / Province / Region presets; zone names + level bands; hover cards
  await page.keyboard.press('KeyM');
  await expect(page.locator('#panel-map')).toBeVisible();
  await page.evaluate(() => window.tvui.preset('world'));
  await page.waitForTimeout(500);
  await shot(page, 'map-world');
  await page.evaluate(() => window.tvui.preset('province'));
  await page.waitForTimeout(500);
  await shot(page, 'map-province');
  // a zone hover card says its name and level band
  const fields = await page.evaluate(({ x, z }) => window.tvui.hoverAt(x + 2048, z), me);
  expect(fields).toMatch(/levels \d+–\d+/);
  await shot(page, 'map-province-hover');
  await page.evaluate(() => window.tvui.preset('region'));
  await page.waitForFunction(() => true);
  await page.waitForTimeout(1800);           // the close-up zone picture comes from a worker
  await page.evaluate(() => window.tvui.preset('region'));
  await page.waitForTimeout(300);
  await shot(page, 'map-region');
  const st = await page.evaluate(() => window.tvui.map());
  const kinds = new Set(st.markers.map(m => m.kind));
  for (const k of ['me', 'town', 'dungeon', 'quest', 'liveevent']) expect(kinds.has(k), `region map shows a ${k}`).toBe(true);
  // marker hover cards: the dungeon (name + level) and the quest (goal + click to track)
  const dun = st.markers.find(m => m.kind === 'dungeon');
  const dcard = await page.evaluate(({ x, z }) => window.tvui.hoverAt(x, z), dun);
  expect(dcard).toMatch(/Dungeon/);
  await shot(page, 'map-region-hover-dungeon');
  const qm = st.markers.find(m => m.id === 'q:toll_at_fitockpi');
  expect(await page.evaluate(({ x, z }) => window.tvui.hoverAt(x, z), qm)).toMatch(/Hobb Gallowsby/);
  // around me: streets of the town at close zoom
  await page.evaluate(() => window.tvui.preset('here'));
  await page.waitForTimeout(800);
  await shot(page, 'map-here');
  // right-click drops a pin
  const box = await page.locator('#panel-map canvas.map-canvas').boundingBox();
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.4, { button: 'right' });
  expect((await page.evaluate(() => window.tvui.atlas())).pins).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-map')).toBeHidden();

  // P17: J is the Journal: goal, where, steps, rewards, track
  await page.keyboard.press('KeyJ');
  await expect(page.locator('#panel-journal')).toBeVisible();
  await expect(page.locator('#panel-journal .j-goal')).toContainText('Hobb Gallowsby stopped');
  await expect(page.locator('#panel-journal .j-where')).toContainText(/m (north|south|east|west)/);
  await expect(page.locator('#panel-journal .j-reward')).toContainText('gold');
  await shot(page, 'journal');
  await page.keyboard.press('Escape');

  // P18: one Party menu with the five tabs; O and G land on their tabs; Group Finder is the new name
  await page.keyboard.press('KeyP');
  await expect(page.locator('#panel-partyhub')).toBeVisible();
  await expect(page.locator('#panel-partyhub .hub-tabs')).toContainText('Group Finder');
  await shot(page, 'party-hub-party');
  await page.click('#menu-friends');
  await expect(page.locator('#panel-friends')).toBeVisible();
  await shot(page, 'party-hub-friends');
  await page.click('#menu-mail');
  await expect(page.locator('#panel-mail')).toBeVisible();
  await expect(page.locator('#panel-friends')).toBeHidden();
  await page.click('#menu-callboard');
  await expect(page.locator('#panel-callboard')).toContainText(/Group Finder/);
  await shot(page, 'party-hub-groupfinder');
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-partyhub')).toBeHidden();
  await page.keyboard.press('KeyG');
  await expect(page.locator('#panel-partyhub')).toBeVisible();
  expect(await page.evaluate(() => window.tvui.hub())).toBe('guild');
  await page.keyboard.press('Escape');

  // P13: a dungeon map from the tiles (client-only demo instance)
  await page.evaluate(() => window.tvui.demoDungeon('crypt_spiral'));
  await page.waitForTimeout(800);
  await shot(page, 'minimap-dungeon');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.tvui.preset('all'));
  await page.waitForTimeout(400);
  await shot(page, 'map-dungeon');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.tvui.demoDungeon(null));

  expect(P.errors, P.errors.join('\n')).toEqual([]);
  await P.ctx.close();
});

test('phone: map and minimap fit a small screen', async ({ browser }) => {
  test.setTimeout(180000);
  const P = await join_(browser, 'Pocketa', { width: 390, height: 844 });
  await P.page.waitForTimeout(600);
  await shot(P.page, 'phone-hud');
  await P.page.evaluate(() => window.tvui.mapOpen(true));
  await P.page.evaluate(() => window.tvui.preset('province'));
  await P.page.waitForTimeout(600);
  await shot(P.page, 'phone-map');
  expect(P.errors, P.errors.join('\n')).toEqual([]);
  await P.ctx.close();
});
