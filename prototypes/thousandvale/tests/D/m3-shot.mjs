// Stream D — extra M3 screenshots (title fixed layout, phone-size title, the world boss frame through tv.demoWorldBoss).
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node prototypes/thousandvale/tests/D/m3-shot.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = join(HERE, 'shots');
const port = 8496, hook = 8497;
const srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hook)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.on('data', d => { if (/READY/.test(String(d))) r(); }));
const base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
const browser = await chromium.launch();
try {
  let ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
  let page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(base + '?quality=low'); await page.waitForSelector('#loading.done', { timeout: 60000 });
  await page.screenshot({ path: join(SHOTS, 'm3-title-guest.png') });
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  page = await ctx.newPage();
  await page.goto(base + '?quality=low'); await page.waitForSelector('#loading.done', { timeout: 60000 });
  await page.screenshot({ path: join(SHOTS, 'm3-title-phone.png') });
  await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
  page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(base + '?autoplay=1&name=Corra&cls=paladin&quality=low');
  await page.waitForFunction(() => window.tv?.state().phase === 'world' && window.tv.state().status === 'online', null, { timeout: 60000 });
  await page.evaluate(() => { window.tv.view(14, 0.55); window.tv.demoWorldBoss(); });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, 'm3-worldboss.png') });
  await ctx.close();

  // the Callboard for real: four bots (js/net/client.js under Node) + one browser player make a 1/1/3 group
  const { connect, memoryTokenStore } = await import('../../js/net/client.js');
  const bots = [];
  for (const [i, role] of ['tank', 'healer', 'dps', 'dps'].entries()) {
    const net = connect({ mode: 'ws', url: `ws://127.0.0.1:${port}`, tokenStore: memoryTokenStore(), guestName: 'Cbot' + i });
    await net.ready;
    const ch = await net.createChar({ name: ['Tamsin', 'Hollis', 'Dera', 'Pike'][i], cls: ['knight', 'cleric', 'ranger', 'rogue'][i] });
    await net.play(ch.id);
    net.on('callboard', m => { if (m.state === 'pop') setTimeout(() => net.callboard('accept', { id: m.id }), 1500 + i * 700); });
    bots.push({ net, role, name: ch.name });
  }
  ctx = await browser.newContext({ viewport: { width: 1180, height: 720 } });
  page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(base + '?autoplay=1&name=Wren&cls=mage&quality=low');
  await page.waitForFunction(() => window.tv?.state().phase === 'world' && window.tv.state().status === 'online', null, { timeout: 60000 });
  const post = (path, body) => fetch(`http://127.0.0.1:${hook}${path}`, { method: 'POST', body: JSON.stringify(body) });
  for (const n of ['Wren', ...bots.map(b => b.name)]) await post('/level', { name: n, level: 9 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.tv.panel('callboard'));   // a Party-menu tab since play-test P18
  await page.waitForSelector('#panel-callboard .cb-row');
  await page.click('#panel-callboard .cb-roles .chip:has-text("Damage")');
  await page.click('#panel-callboard button:has-text("Join the queue")');
  await page.waitForSelector('#panel-callboard .cb-queued', { timeout: 10000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: join(SHOTS, 'm3-callboard-queued.png') });
  for (const b of bots) b.net.callboard('join', { dungeon: 'any', role: b.role });
  await page.waitForSelector('.cb-pop:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: join(SHOTS, 'm3-callboard-pop.png') });
  await page.click('.cb-pop button.primary');
  await page.waitForFunction(() => window.thousandvale.S.room?.dungeon, null, { timeout: 30000 }).then(() => console.log('formed: in the dungeon'), e => console.log('NOT in a dungeon', e.message));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SHOTS, 'm3-callboard-formed.png') });
  for (const b of bots) b.net.close();
  await ctx.close();
} finally { await browser.close(); srv.kill('SIGTERM'); }
