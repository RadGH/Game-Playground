// Tumblefair in real browsers against a real server (its own, on a free port, with a throw-away profile folder):
// a desktop host and two phones join by code, the lobby shows them, a board turn walks a token, and an arena
// minigame moves YOUR character the moment you press a key (prediction) and the server agrees.
// Run from the playground root:  flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/tumblefair/tests/tumblefair.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = join(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
test.describe.configure({ mode: 'serial' });
let srv, port, browser, host, phones = [];
const free = () => new Promise(res => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const errors = [];
async function page(mobile) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return p;
}
const url = q => `http://127.0.0.1:${port}/prototypes/tumblefair/?quality=low${q ? '&' + q : ''}`;
const S = (p, f, a) => p.evaluate(f, a);

test.beforeAll(async ({ browser: b }) => {
  browser = b; port = await free();
  srv = spawn(process.execPath, [join(HERE, '..', 'server', 'main.mjs'), '--port', String(port), '--host', '127.0.0.1', '--data', mkdtempSync(join(tmpdir(), 'tf-spec-'))], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 200)); }
});
test.afterAll(() => srv?.kill());

test('title: logo, name, host and join; no script errors', async () => {
  test.setTimeout(120000);
  host = await page(false);
  await host.goto(url());
  await host.waitForFunction(() => window.tumblefair?.S.me, null, { timeout: 60000 });
  await expect(host.locator('.title-panel [data-act=host]')).toBeVisible();
  await host.fill('#name', 'Hostess'); await host.locator('#name').blur();
  await expect.poll(() => S(host, () => tumblefair.S.me.name)).toBe('Hostess');
  await host.screenshot({ path: join(SHOTS, 'spec-title.png') });
  expect(errors).toEqual([]);
});

test('lobby: two phones join by code, seats in colour order, QR drawn', async () => {
  test.setTimeout(180000);
  await host.click('[data-act=host]');
  await host.waitForFunction(() => tumblefair.S.room?.code);
  const code = await S(host, () => tumblefair.S.room.code);
  expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
  for (let i = 0; i < 2; i++) { const p = await page(true); await p.goto(url('code=' + code)); await p.waitForFunction(() => tumblefair.S.room, null, { timeout: 60000 }); phones.push(p); }
  await expect.poll(() => S(host, () => tumblefair.S.room.members.map(m => m.seat).join(','))).toBe('0,1,2');
  await expect(host.locator('.lobby-main .chip')).toHaveCount(3);
  await expect(host.locator('#qr svg')).toBeVisible();
  await expect(phones[0].locator('.lobby-main')).toContainText('Waiting for the host');
  await expect.poll(() => S(host, () => tumblefair.lineup.actors.size), { timeout: 30000 }).toBe(3);
  await host.screenshot({ path: join(SHOTS, 'spec-lobby-host.png') });
  await phones[0].screenshot({ path: join(SHOTS, 'spec-lobby-phone.png') });
  expect(errors).toEqual([]);
});

test('board: the player whose turn it is rolls, their token walks, the bar shows tickets', async () => {
  test.setTimeout(180000);
  await S(host, () => { tumblefair.net.send({ t: 'opt', key: 'mode', value: 'board' }); tumblefair.net.send({ t: 'opt', key: 'rounds', value: 2 }); });
  await host.click('[data-act=start]');
  await host.waitForFunction(() => tumblefair.S.phase === 'board' && tumblefair.S.bd.pid != null, null, { timeout: 30000 });
  const all = [host, ...phones];
  const turnPid = await S(host, () => tumblefair.S.bd.pid);
  const roller = (await Promise.all(all.map(async p => [p, await S(p, () => tumblefair.S.room.you)]))).find(([, pid]) => pid === turnPid)[0];
  await expect(roller.locator('[data-act=roll]')).toBeVisible();
  for (const p of all) if (p !== roller) await expect(p.locator('[data-act=roll]')).toHaveCount(0);
  const before = await S(host, () => JSON.stringify(tumblefair.S.room.match.board.pos));
  await roller.click('[data-act=roll]');
  await expect(roller.locator('.die')).toBeVisible();
  await host.waitForFunction(b => JSON.stringify(tumblefair.S.room.match.board.pos) !== b || tumblefair.S.bd.pid !== tumblefair.S.room.match.board.order[0], before, { timeout: 30000 });
  await host.waitForTimeout(1500);
  await host.screenshot({ path: join(SHOTS, 'spec-board-host.png') });
  await roller.screenshot({ path: join(SHOTS, 'spec-board-roller.png') });
  await expect(host.locator('.match-bar .chip')).toHaveCount(3);
  await S(host, () => tumblefair.net.send({ t: 'end' }));
  await host.waitForFunction(() => tumblefair.S.phase === 'lobby', null, { timeout: 20000 });
  expect(errors).toEqual([]);
});

test('arena: Paint Panic — your character moves the moment you press, the server agrees, the floor turns your colour', async () => {
  test.setTimeout(240000);
  await S(host, () => { tumblefair.net.send({ t: 'opt', key: 'mode', value: 'marathon' }); tumblefair.net.send({ t: 'opt', key: 'pool', value: ['paint-panic'] }); });
  await host.click('[data-act=start]');
  await host.waitForFunction(() => tumblefair.S.phase === 'intro', null, { timeout: 30000 });
  await expect(host.locator('.intro-card')).toContainText('Paint Panic');
  for (const p of [host, ...phones]) await S(p, () => tumblefair.net.send({ t: 'skip' }));
  await host.waitForFunction(() => tumblefair.S.phase === 'game' && tumblefair.S.play, null, { timeout: 30000 });
  await expect(phones[0].locator('.ph-stickzone')).toBeVisible();
  await expect(host.locator('.key-hint')).toBeVisible();
  const me = await S(host, () => tumblefair.S.room.you);
  await host.waitForFunction(pid => tumblefair.S.play?.actor(pid), me);
  const where = () => S(host, pid => { const ac = tumblefair.S.play?.actor(pid); if (!ac) throw new Error('no actor ' + pid + ' play ' + !!tumblefair.S.play + ' log ' + tumblefair.S.log.join(' | ') + ' players ' + JSON.stringify(tumblefair.S.play?.players.map(p => p.pid))); const a = ac.group; return { x: a.position.x, z: a.position.z }; }, me);
  const p0 = await where();
  await host.keyboard.down('KeyD');
  await host.waitForTimeout(1200);
  const p1 = await where();
  await host.keyboard.up('KeyD');
  expect(p1.x - p0.x, 'moved right while D was held').toBeGreaterThan(1.5);
  // the server painted the tiles I walked over (so it moved me too, not just my screen)
  await host.waitForTimeout(600);
  const agree = await S(host, () => tumblefair.S.play.state);
  expect(agree.c[me], 'tiles painted in my colour').toBeGreaterThan(3);
  await host.screenshot({ path: join(SHOTS, 'spec-paint-host.png') });
  await phones[1].screenshot({ path: join(SHOTS, 'spec-paint-phone.png') });
  await host.waitForFunction(() => tumblefair.S.phase === 'results', null, { timeout: 90000 });
  await expect(host.locator('.results-card .places li')).toHaveCount(3);
  await host.screenshot({ path: join(SHOTS, 'spec-paint-results.png') });
  expect(errors).toEqual([]);
});
