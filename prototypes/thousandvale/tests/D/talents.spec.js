// Stream D — play-test P6: the Skills & Talents window (K) and the Perk Forest (N) in the real client, against a real
// server (tests/D/m3-server.mjs, memory DB + the test-only /level hook). Mounts js/client/ui/talents.js itself when
// main.js has not wired it (window.thousandvale.talents), so the spec does not depend on the wiring order.
// Screenshots: tests/D/shots/p6-*.png (desktop 1280x720 and phone 390x844).
// Run (shared lock, one browser at a time):
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/talents.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase;
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
  hookBase = `http://127.0.0.1:${hook}`;
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

async function enter(browser, name, viewport, cls = 'mage') {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?autoplay=1&name=${name}&cls=${cls}&quality=low`);
  await page.waitForFunction(() => window.tv && window.tv.state().status === 'online' && window.tv.state().phase === 'world', null, { timeout: 60000 });
  await hook('/level', { name, level: 20 });
  await page.waitForFunction(() => window.tv.state().you.level === 20, null, { timeout: 10000 });
  // mount the windows (or use main.js's), and the shared tooltip engine
  await page.evaluate(async () => {
    const tv = window.thousandvale;
    // main.js wires the windows through js/client/ui/suite.js (window.tvui.talents()); give it a moment to load
    for (let i = 0; i < 50 && window.tvui && !window.tvui.talents(); i++) await new Promise(r => setTimeout(r, 100));
    if (window.tvui?.talents()) tv.talents = window.tvui.talents();
    if (!tv.talents) {
      const [{ createTalentsUi }, { installGameTips }] = await Promise.all([import('./js/client/ui/talents.js'), import('./js/client/ui/tips.js')]);
      installGameTips();
      tv.talents = createTalentsUi({ net: () => tv.S.net, hud: tv.hud, me: () => ({ level: tv.S.self.level, cls: tv.S.self.cls, char: tv.S.net?.joined?.you?.char ?? null }) });
      tv.talents.wire(tv.S.net);
    }
    await tv.talents.ready;
    tv.tv.hud(true);
  });
  return { ctx, page, errors };
}

test('Skills window: ladder by level, next unlock, talent tiers, pick + hover card', async ({ browser }) => {
  const P = await enter(browser, 'Talentia', { width: 1280, height: 720 });
  const { page } = P;
  await page.evaluate(() => window.thousandvale.talents.skills.open());
  const win = page.locator('#panel-skills');
  await expect(win).toBeVisible();
  await expect(win.locator('.tvt-skill')).toHaveCount(6);
  await expect(win.locator('.tvt-skill.locked')).toHaveCount(1);          // level 20: only the level-24 skill is shut
  await expect(win.locator('.tvt-next')).toContainText(/at level 24/);
  await expect(win.locator('.tvt-preview')).toContainText('Preview');
  // the selected skill shows four tiers; three are open at level 20
  await expect(win.locator('.tvt-tier')).toHaveCount(4);
  await expect(win.locator('.tvt-tier.closed')).toHaveCount(1);
  const node = win.locator('.tvt-node.open').first();
  await node.click();
  await expect(win.locator('.tvt-node.picked')).toHaveCount(1);
  await expect(win.locator('.tvt-tier').first().locator('.tvt-node.other').first()).toBeVisible();
  // hover card through the shared tooltip, read while the mouse button is held down
  const n2 = win.locator('.tvt-tier').nth(1).locator('.tvt-node').first();
  await n2.hover();
  await page.mouse.down();
  await expect(page.locator('#tipbox')).toBeVisible();
  await expect(page.locator('#tipbox .tip-title')).not.toBeEmpty();
  await expect(page.locator('#tipbox.show')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, 'p6-skills.png') });
  await page.mouse.up();
  // a locked skill: greyed, says when
  await win.locator('.tvt-skill.locked').click();
  await expect(win.locator('.tvt-state')).toContainText('Unlocks at level 24');
  await expect(win.locator('.tvt-node.open')).toHaveCount(0);
  await page.screenshot({ path: join(SHOTS, 'p6-skills-locked.png') });
  expect(P.errors).toEqual([]);
  await P.ctx.close();
});

test('Perk Forest: pan/zoom graph, take along a path, refused far node, refund end of path, hover card', async ({ browser }) => {
  const P = await enter(browser, 'Perkwright', { width: 1280, height: 720 }, 'warrior');
  const { page } = P;
  await page.evaluate(() => window.thousandvale.talents.perks.open());
  const win = page.locator('#panel-perks');
  await expect(win).toBeVisible();
  await page.waitForTimeout(300);
  const left0 = await page.evaluate(() => window.thousandvale.talents.perks.root.querySelector('.pf-points b').textContent);
  expect(+left0).toBeGreaterThan(10);
  // walk three nodes out along the first arm by clicking them on the canvas
  const path = await page.evaluate(() => {
    const T = window.thousandvale.talents, F = T.source.forest, start = F.start.id;
    // a chain start - a - b - c where c only reaches the middle through b (so b cannot go back while c is held)
    const nb = id => F.neighbours.get(id) || [];
    for (const a of nb(start)) for (const b of nb(a)) {
      if (b === start || nb(b).includes(start)) continue;
      const c = nb(b).find(x => x !== a && x !== start && !nb(x).includes(a) && !nb(x).includes(start));
      if (c) return [a, b, c];
    }
    return null;
  });
  const click = async (id, button = 'left') => {
    await page.evaluate(i => window.thousandvale.talents.graph.focus(i), id);
    await page.waitForTimeout(120);
    const box = await win.locator('canvas.pf-canvas').boundingBox();
    const p = await page.evaluate(i => window.thousandvale.talents.graph.screenOf(i), id);
    await page.mouse.click(box.x + p.x, box.y + p.y, { button });
  };
  expect(path).toBeTruthy();
  for (const id of path) await click(id);
  await expect.poll(() => page.evaluate(() => window.thousandvale.talents.state.perks.length)).toBe(3);
  // a keystone far away is refused with a reason
  const key = await page.evaluate(() => window.thousandvale.talents.source.forest.nodes.find(n => n.kind === 'keystone').id);
  await click(key);
  await expect(page.locator('.toast').last()).toContainText(/connects/);
  // the middle of the path cannot go back; the end can
  await click(path[1], 'right');
  await expect(page.locator('.toast').last()).toContainText(/Give that one back first|through this one/);
  await click(path[2], 'right');
  await expect.poll(() => page.evaluate(() => window.thousandvale.talents.state.perks.length)).toBe(2);
  await click(path[2]);
  // zoomed-out whole forest + a hover card on the next open node
  await win.locator('button', { hasText: 'Whole forest' }).click();
  await page.waitForTimeout(200);
  const nextOpen = await page.evaluate(() => { const T = window.thousandvale.talents, F = T.source.forest; const taken = new Set(T.state.perks); return F.nodes.find(n => !taken.has(n.id) && n.kind !== 'hub' && (F.neighbours.get(n.id) || []).some(x => taken.has(x)))?.id; });
  const box = await win.locator('canvas.pf-canvas').boundingBox();
  await page.evaluate(() => window.thousandvale.talents.graph.zoom(1.6));
  await page.waitForTimeout(100);
  const p = await page.evaluate(i => window.thousandvale.talents.graph.screenOf(i), nextOpen);
  await page.mouse.move(box.x + p.x - 30, box.y + p.y - 30);
  await page.mouse.move(box.x + p.x, box.y + p.y, { steps: 4 });
  await expect(page.locator('#tipbox')).toBeVisible();
  await expect(page.locator('#tipbox')).toContainText(/Click to take|point/);
  await expect(page.locator('#tipbox.show')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(SHOTS, 'p6-perks.png') });
  await page.mouse.move(5, 5);
  await win.locator('button', { hasText: 'Whole forest' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, 'p6-perks-whole.png') });
  expect(P.errors).toEqual([]);
  await P.ctx.close();
});

test('phone 390x844: both windows fit', async ({ browser }) => {
  const P = await enter(browser, 'Pocketmage', { width: 390, height: 844 });
  const { page } = P;
  await page.evaluate(() => window.thousandvale.talents.skills.open());
  await page.waitForTimeout(200);
  const r = await page.locator('#panel-skills').boundingBox();
  expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.width).toBeLessThanOrEqual(391);
  await page.screenshot({ path: join(SHOTS, 'p6-skills-phone.png') });
  await page.evaluate(() => { window.thousandvale.talents.skills.close(); window.thousandvale.talents.perks.open(); });
  await page.waitForTimeout(300);
  const r2 = await page.locator('#panel-perks').boundingBox();
  expect(r2.x + r2.width).toBeLessThanOrEqual(391);
  await expect(page.locator('#panel-perks')).not.toContainText('null');
  await page.screenshot({ path: join(SHOTS, 'p6-perks-phone.png') });
  expect(P.errors).toEqual([]);
  await P.ctx.close();
});
