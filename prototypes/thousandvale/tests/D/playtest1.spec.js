// Stream D-world — play-test 1 in a real browser against a real server (tests/D/m3-server.mjs + its test hook):
//   P9  monsters/pets stand on the SAME ground the server measures (drawn y == terrain heightAt, every one of them)
//   P28 every monster is clickable: the centre of its body on screen picks it (hit volume = its real size)
//   P20 Gnawing Dark (and a few more) draw a cast, a projectile, an impact and a status on a live monster
//   P21 river banks: a screenshot over the river beside Torborhold (the sheet meets the bank)
//   P25 deep water: you swim (prediction agrees with the server, the swim clip plays, ripples on the surface)
//   P8  death and respawn: the body lies down, and STANDS UP after the respawn (a room change to town)
//   P10 the respawn jump is veiled (the travel veil comes up and goes away again)
// Screenshots: tests/D/shots/p*-*.png
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/playtest1.spec.js
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
let srv, base, hookBase, page, ctx;
const errors = [];
test.beforeAll(async ({ browser }) => {
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
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?autoplay=1&name=Wren&cls=warlock&quality=low&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const ZONE_EAST = 26624;

test('P9 + P28 + P20: monsters on the ground, clickable, and Gnawing Dark is seen on them', async () => {
  test.setTimeout(400000);
  const you = await page.evaluate(() => tv.state().you);
  await hook('/teleport', { name: 'Wren', x: ZONE_EAST - 300, z: you.z + 60 });
  // find monsters: walk a little each poll until three bodies are built near us
  await expect.poll(async () => page.evaluate(() => [...thousandvale.actors.actors.values()].filter(a => a.kind === 'monster' && a.body && !a.dead).length), { timeout: 180000, intervals: [3000] }).toBeGreaterThan(0);
  await page.waitForTimeout(3000);
  const ground = await page.evaluate(() => {
    const T = thousandvale.WS.terrain;
    return [...thousandvale.actors.actors.values()].filter(a => (a.kind === 'monster' || a.pet) && !a.dead && a.lod === 'full').map(a => ({ id: a.id, dy: +(a.group.position.y - T.heightAt(a.group.position.x, a.group.position.z)).toFixed(3), swim: !!a.swim, flying: !!a.flying }));
  });
  console.log('[P9]', JSON.stringify(ground));
  expect(ground.length).toBeGreaterThan(0);
  for (const g of ground.filter(g => !g.swim && !g.flying)) expect(Math.abs(g.dy), `monster ${g.id} drawn ${g.dy} m off the ground`).toBeLessThan(0.12);
  // P28: frame each body with the inspect camera; the screen point at the middle of the body must pick that body
  const picks = await page.evaluate(async () => {
    const { actors, camera } = thousandvale, V = camera.position.constructor, out = [];
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const a of [...actors.actors.values()].filter(a => a.kind === 'monster' && a.body && !a.dead && a.lod === 'full').slice(0, 6)) {
      const p = a.group.position, h = a.pickTop || a.height;
      tv.fly(p.x + 5, p.y + h + 3.5, p.z + 5, p.x, p.y + h * 0.4, p.z); await frame();
      const v = new V(p.x, p.y + h * 0.45, p.z).project(camera);
      const hit = actors.pickAt({ x: v.x, y: v.y }, { exclude: tv.state().you.id });
      out.push({ id: a.id, hit: hit?.id ?? null, same: hit?.id === a.id, r: a.pickR, top: a.pickTop });
    }
    tv.fly(null);
    return out;
  });
  console.log('[P28]', JSON.stringify(picks));
  expect(picks.length).toBeGreaterThan(0);
  for (const p of picks) expect(p.same, `monster ${p.id} not picked at its own centre (got ${p.hit})`).toBe(true);
  // P20: Gnawing Dark on the nearest monster through the real handlers (cast -> bolt fx -> hit -> status)
  await page.evaluate(() => { tv.hud(false); const me = tv.state().you; const m = [...thousandvale.actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead).sort((p, q) => Math.hypot(p.pos.x - me.x, p.pos.z - me.z) - Math.hypot(q.pos.x - me.x, q.pos.z - me.z))[0]; tv.target(m.id); const cx = (m.pos.x + me.x) / 2, cz = (m.pos.z + me.z) / 2, y = m.pos.y; const d = Math.min(9, Math.max(5, Math.hypot(m.pos.x - me.x, m.pos.z - me.z) * 0.5)); tv.fly(me.x - (m.pos.x - me.x) * 0.25 + d * 0.5, y + 4.5, me.z - (m.pos.z - me.z) * 0.25 + d * 0.5, cx, y + 0.8, cz); tv.demoSpells(null, 900, ['gnawing_dark', 'void_rift', 'curse']); });
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(450); await page.screenshot({ path: join(SHOTS, `p20-spells-${i}.png`) }); }
  const st = await page.evaluate(() => { tv.fly(null); return thousandvale.spells.stats; });
  expect(st.casts).toBeGreaterThanOrEqual(3);
  expect(st.projectiles).toBeGreaterThanOrEqual(1);
  expect(st.impacts).toBeGreaterThanOrEqual(1);
  expect(st.statuses).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => tv.hud(true));
});

test('P21: the river beside Torborhold meets its banks', async () => {
  await page.evaluate(() => { tv.hud(false); const T = thousandvale.WS.terrain, x = 25104, z = 5468, h = T.heightAt(x, z); tv.fly(x - 14, h + 9, z + 16, x, h, z); });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(SHOTS, 'p21-river-bank.png') });
  const w = await page.evaluate(() => { const L = [...thousandvale.WS.loaded.values()].find(L => L.key === 'z12_02'); return L?.ground?.water ? L.ground.water.geometry.index.count / 3 : 0; });
  expect(w).toBeGreaterThan(1000);
  await page.evaluate(() => { tv.fly(null); tv.hud(true); });
});

test('P25: deep water is swum — prediction, the swim clip and ripples', async () => {
  test.setTimeout(240000);
  const z = await page.evaluate(() => tv.state().you.z);
  await hook('/teleport', { name: 'Wren', x: 28648, z: 5400 });
  await expect.poll(async () => page.evaluate(() => !!thousandvale.S.predictor.pos.swim), { timeout: 90000, intervals: [2000] }).toBe(true);
  await page.evaluate(() => { tv.hud(false); tv.view(7, 0.35); });
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); return { anim: a.anim, swim: a.swim, ripples: !!a.ripples?.some(r => r.visible) }; });
  await page.screenshot({ path: join(SHOTS, 'p25-swim.png') });
  console.log('[P25]', JSON.stringify(s));
  expect(s.swim).toBe(true);
  expect(s.anim).toBe('swim');
  expect(s.ripples).toBe(true);
  await page.evaluate(() => tv.hud(true));
});

test('P8 + P10: you die, lie down, and after the respawn you stand up (behind the travel veil)', async () => {
  test.setTimeout(180000);
  await hook('/teleport', { name: 'Wren', x: ZONE_EAST - 300, z: 5400 });
  await page.waitForTimeout(4000);
  await hook('/kill', { name: 'Wren' });
  await expect.poll(async () => page.evaluate(() => thousandvale.actors.get(tv.state().you.id)?.anim), { timeout: 20000 }).toBe('dead');
  await page.screenshot({ path: join(SHOTS, 'p8-dead.png') });
  await page.waitForTimeout(3000);
  await page.evaluate(() => tv.rise());
  await expect.poll(async () => page.evaluate(() => !document.getElementById('travel-veil').hidden), { timeout: 5000 }).toBe(true);
  await expect.poll(async () => page.evaluate(() => { const s = tv.state(); const a = thousandvale.actors.get(s.you.id); return !s.you.dead && a && !a.dead && a.anim !== 'dead'; }), { timeout: 60000 }).toBe(true);
  await expect.poll(async () => page.evaluate(() => document.getElementById('travel-veil').hidden), { timeout: 20000 }).toBe(true);
  // walk a few steps: the body must be upright and moving, not dragged on its back
  const p = await page.evaluate(() => tv.state().you);
  await page.evaluate(([x, z]) => tv.walkTo(x, z), [p.x + 6, p.z]);
  await page.waitForTimeout(2500);
  const a = await page.evaluate(() => thousandvale.actors.get(tv.state().you.id).anim);
  await page.screenshot({ path: join(SHOTS, 'p8-risen.png') });
  expect(a).not.toBe('dead');
  expect(errors, errors.join('\n')).toEqual([]);
});
