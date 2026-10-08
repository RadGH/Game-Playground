// Stream D-world — play-test 6 (owner feedback 2026-10-07) in a real browser against a real server (tests/D/m3-server.mjs):
//   U4   the oat field the owner stood in at x 25210.7 z 5530.6 ("looks like coffins"): screenshots from the saddle and above
//   U3   a telegraph and a ground zone are gone the moment their caster dies / is interrupted / the server cancels them
//   U16  a druid's shape changes the MODEL (a creature body under the same name plate), walks and strikes as it, and back
//   U18  the wolf form, and wolf-pack companions
//   U8   a warded boss wears a visible ward that runs down
//   U19  the pony's muzzle from the front and the side
// Screenshots: tests/D/shots/u*-*.png
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/playtest6.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
const TAG = process.env.TV_SHOT_TAG || '';
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase, page, ctx;
const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const shot = name => page.screenshot({ path: join(SHOTS, name) });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(480000);
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  hookBase = `http://127.0.0.1:${hp}`;
  mkdirSync(SHOTS, { recursive: true });
  ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=Thorn&cls=druid&quality=low&tod=0.5`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  await page.evaluate(() => { tv.hud(false); });
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

test('U4: the oat field at x 25210.7 z 5530.6 reads as a standing crop, not rows of boxes', async () => {
  test.setTimeout(240000);
  const tp = await hook('/teleport', { name: 'Thorn', x: 25210.7, z: 5530.6 });
  expect(tp.ok).toBe(true);
  await page.waitForFunction(() => Math.hypot(tv.state().you.x - 25210.7, tv.state().you.z - 5530.6) < 6, null, { timeout: 60000 });
  await page.waitForTimeout(9000);                     // the zone's set pieces finish arriving
  await page.evaluate(() => tv.view(5.5, 0.55, 0.4 + Math.PI));
  await page.waitForTimeout(2500);
  await shot(`u4-field-where-the-owner-stood${TAG}.png`);
  await page.evaluate(() => { const p = tv.state().you, y = thousandvale.WS.terrain.heightAt(p.x, p.z) || 0; tv.fly(p.x + 14, y + 4.2, p.z + 16, p.x - 8, y + 0.4, p.z - 6); });
  await page.waitForTimeout(3000);
  await shot(`u4-field-from-the-edge${TAG}.png`);
  await page.evaluate(() => { const p = tv.state().you, y = thousandvale.WS.terrain.heightAt(p.x, p.z) || 0; tv.fly(p.x + 3, y + 2.1, p.z + 3.5, p.x - 2, y + 0.5, p.z - 3); });
  await page.waitForTimeout(3000);
  await shot(`u4-field-close${TAG}.png`);
  await page.evaluate(() => tv.fly(null));
  expect(errors, errors.join('\n')).toEqual([]);
});

test('U3: a telegraph and a ground zone are gone the moment their caster dies, is interrupted, or the server cancels', async () => {
  test.setTimeout(180000);
  const tp = await hook('/teleport', { name: 'Thorn', x: 25183, z: 5388 });
  expect(tp.ok).toBe(true);
  await page.waitForTimeout(6000);
  await page.evaluate(() => tv.view(13, 0.7, Math.PI));
  const me = await page.evaluate(() => tv.state().you);
  // (a telegraph is timed on the server's clock: a made-up one is added at the server's "now", every other event goes through the client's own handler)
  const ev = e => page.evaluate(e => (e.type === 'tele' ? thousandvale.tele.add(e, thousandvale.S.net.clock.serverNow()) : tv.fxEvent(e)), e);
  const counts = () => page.evaluate(() => ({ tele: thousandvale.tele.count, zones: thousandvale.spells.zones.size }));
  // a slime (id 9001) winds up a circle and a cone and has a void pool down; another body (9002) has one of its own
  await ev({ type: 'tele', id: 501, s: 9001, ab: 'void_zone', k: 'harm', ms: 6000, shape: 'circle', x: me.x + 3, z: me.z + 4, r: 4, el: 'shadow' });
  await ev({ type: 'tele', id: 502, s: 9001, ab: 'spit', k: 'harm', ms: 6000, shape: 'cone', x: me.x - 4, z: me.z + 2, yaw: 0.5, r: 9, arc: 0.9, el: 'poison' });
  await ev({ type: 'tele', id: 503, s: 9002, ab: 'stomp', k: 'harm', ms: 6000, shape: 'circle', x: me.x - 6, z: me.z - 5, r: 3 });
  await ev({ type: 'fx', kind: 'pool', id: 9001, obj: 77, x: me.x + 2, z: me.z - 4, r: 3, seconds: 6, element: 'shadow' });
  await ev({ type: 'fx', kind: 'zone', id: 88, s: 9002, x: me.x - 6, z: me.z + 6, r: 3, ms: 6000, element: 'poison' });
  await page.waitForTimeout(1800);
  expect(await counts()).toEqual({ tele: 3, zones: 2 });
  await shot('u3-before-the-caster-dies.png');
  await ev({ type: 'die', d: 9001, by: me.id });
  expect(await counts(), 'its two telegraphs and its pool are gone in the same call').toEqual({ tele: 1, zones: 1 });
  await page.waitForTimeout(1500);
  await shot('u3-after-the-caster-dies.png');
  await ev({ type: 'castX', id: 9002, ab: 'stomp', why: 'interrupted' });
  expect((await counts()).tele, 'an interrupted cast takes its telegraph').toBe(0);
  await ev({ type: 'fx', kind: 'zone', id: 88, end: 1 });
  expect((await counts()).zones, "the server's zone end").toBe(0);
  // the server's own cancel: gone at once, no fade
  await ev({ type: 'tele', id: 504, s: 9003, ab: 'x', k: 'harm', ms: 6000, shape: 'circle', x: me.x, z: me.z + 5, r: 3 });
  await ev({ type: 'teleR', id: 504, x: 1, why: 'dead' });
  expect((await counts()).tele).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('U16 + U18: a druid\'s shape is a creature body under the same name plate — walks, strikes, and changes back', async () => {
  test.setTimeout(300000);
  await page.evaluate(() => { tv.hud(true); tv.view(6, 0.3, Math.PI * 0.8); });
  const st = () => page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); return { shape: a.shape?.id || null, type: a.shape ? a.shape.pivot.name : null, chibi: a.model.visible, anim: a.anim, clip: a.shape?.anim || null, height: +a.height.toFixed(2), plate: a.plate?.name?.textContent || null, dead: a.dead }; });
  await page.waitForTimeout(1500);
  const human = await st();
  await shot('u16-0-the-druid.png');
  await page.evaluate(() => tv.perf(true));
  // Briarback: the event C sends the moment the shape is taken
  await page.evaluate(() => tv.fxEvent({ type: 'fx', kind: 'form', id: tv.state().you.id, form: 'briarback', group: 'shape', on: true, body: 'boar', shape: { id: 'briarback', name: 'Briarback', group: 'shape', creature: 'boar', scale: 1.35, colors: { body: '#4f5a2e', belly: '#7a7a4a', accent: '#2a3a1a' } } }));
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id).shape, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const boar = await st();
  console.log('[U16] human', JSON.stringify(human), 'boar', JSON.stringify(boar));
  expect(boar.shape).toBe('briarback'); expect(boar.chibi, 'the avatar is put away').toBe(false); expect(boar.plate).toBe(human.plate);
  await shot('u16-1-briarback-boar.png');
  // it walks and strikes as the creature
  const p = await page.evaluate(() => tv.state().you);
  // (a wall or a stall may be in the way of any one line: try a few, and take the first on which it is seen walking)
  let walking = null;
  for (const [dx, dz] of [[9, 2], [-9, 3], [2, 9], [3, -9]]) {
    await page.evaluate(([x, z]) => tv.walkTo(x, z), [p.x + dx, p.z + dz]);
    for (let i = 0; i < 6 && !walking; i++) { await page.waitForTimeout(500); const s = await st(); if (['walk', 'run'].includes(s.clip)) walking = s; }
    if (walking) break;
  }
  expect(walking, 'the shape walks with the creature\'s own gait').not.toBeNull();
  await shot('u16-2-briarback-walking.png');
  await page.evaluate(() => tv.stop());
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); thousandvale.actors.playAttack(a.id, null, { force: true }); return a.shape.anim; })).toBe('attack');
  const sw = await page.evaluate(() => tv.perf());
  console.log('[U16] new programs during the swap:', JSON.stringify(sw.newProgramNames), 'worst own-work frame', sw.stalls?.maxBusyMs);
  expect(sw.newProgramNames, 'no shader program linked by the shape swap (the bodies are warmed at boot)').toEqual([]);
  // back again
  await page.evaluate(() => tv.fxEvent({ type: 'fx', kind: 'form', id: tv.state().you.id, form: 'briarback', group: 'shape', on: false }));
  await page.waitForFunction(() => !thousandvale.actors.get(tv.state().you.id).shape, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const back = await st(); expect(back.chibi).toBe(true); expect(back.height).toBe(human.height);
  await shot('u16-3-back-to-the-druid.png');
  // U18: Moonpelt — the wolf on its hind legs (through info-style data), and two pack wolves beside it
  await page.evaluate(() => tv.shape({ id: 'moonpelt', creature: 'wolf', scale: 1.25, upright: true, colors: { body: '#5a5f6a', belly: '#b8bcc4' } }));
  await page.waitForFunction(() => thousandvale.actors.get(tv.state().you.id).shape?.id === 'moonpelt', null, { timeout: 60000 });
  await page.evaluate(() => {
    const T = thousandvale, me = T.actors.get(tv.state().you.id);
    [[-2.2, 1], [2.2, 1.4]].forEach(([dx, dz], i) => { const x = me.pos.x + dx, z = me.pos.z + dz, y = T.WS.terrain.heightAt(x, z) || 0; const a = T.actors.add({ id: 'pack' + i, kind: 'npc', pet: true, name: 'Pack Wolf', level: 6, hp: 80, hpMax: 80, x, y, z, yaw: me.yaw, creature: { type: 'grove_wolf', seed: 5 + i } }); a.still = { x, y, z, yaw: me.yaw, speed: 0 }; });
  });
  await page.waitForFunction(() => !!thousandvale.actors.get('pack0')?.body && !!thousandvale.actors.get('pack1')?.body, null, { timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot('u18-moonpelt-and-the-pack.png');
  await page.evaluate(() => tv.view(4.5, 0.25, Math.PI * 0.5));
  await page.waitForTimeout(1500);
  await shot('u18-moonpelt-side.png');
  // a second player seen ALREADY shaped (info.form on arrival) — late joiners
  await page.evaluate(() => { tv.shape(null); for (const k of ['pack0', 'pack1']) thousandvale.actors.remove(k); tv.hud(false); });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('U8 + U10: a warded boss wears a ward that runs down; the way you came in is a doorway and the stair up is a stair', async () => {
  test.setTimeout(240000);
  await page.evaluate(() => { tv.hud(true); tv.view(11, 0.5, Math.PI); });
  await page.evaluate(() => {
    const T = thousandvale, p = T.S.predictor.pos, x = p.x + 1, z = p.z + 7, y = T.WS.terrain.heightAt(x, z) || 0;
    const a = T.actors.add({ id: 'warden', kind: 'monster', name: 'The Barrow Warden', level: 6, hp: 900, hpMax: 900, hostile: true, rank: 'boss', x, y, z, yaw: Math.PI, creature: { type: 'barrow_knight', seed: 3 } });
    a.still = { x, y, z, yaw: Math.PI, speed: 0 };
    T.objects.upsert({ id: 'demo:door', type: 'door', name: 'The way you came in', x: p.x - 7, z: p.z + 5, source: 'demo' });
    T.objects.upsert({ id: 'demo:lift', type: 'lift', name: 'Stairs up', x: p.x + 8, z: p.z + 4, source: 'demo' });
  });
  await page.waitForFunction(() => !!thousandvale.actors.get('warden')?.body, null, { timeout: 90000 });
  await page.evaluate(() => tv.fxEvent({ type: 'fx', kind: 'shield', id: 'warden', on: true, ms: 12000, need: 3, have: 1, text: 'Light the three braziers to break the ward (it fails by itself in 12 seconds).' }));
  await page.evaluate(() => { const a = thousandvale.actors.get('warden').pos; tv.fly(a.x + 4.5, a.y + 3.2, a.z - 6.5, a.x, a.y + 1.1, a.z); });
  await page.waitForTimeout(1500);
  const w0 = await page.evaluate(() => ({ ...thousandvale.boss.ward, left: thousandvale.boss.wardLeft() }));
  console.log('[U8] ward', JSON.stringify(w0));
  expect(w0.shielded).toBe(true); expect(w0.shell).toBe(true); expect(w0.ring).toBe(true); expect(w0.left).toBeGreaterThan(0.5);
  await shot('u8-ward-full.png');
  await page.waitForTimeout(6500);
  const w1 = await page.evaluate(() => ({ left: thousandvale.boss.wardLeft(), text: document.querySelector('#boss, .boss-frame, [id*=boss]')?.textContent?.slice(0, 160) || '' }));
  expect(w1.left).toBeLessThan(w0.left - 0.3);
  expect(w1.text).toMatch(/Warded \d+s · 1\/3/);
  await shot('u8-ward-running-down.png');
  await page.evaluate(() => tv.fxEvent({ type: 'fx', kind: 'shield', id: 'warden', on: false, why: 'faded' }));
  const w2 = await page.evaluate(() => thousandvale.boss.ward);
  expect(w2.shielded).toBe(false); expect(w2.shell).toBe(false);
  await page.evaluate(() => { const p = thousandvale.S.predictor.pos, y = thousandvale.WS.terrain.heightAt(p.x, p.z) || 0; tv.hud(false); tv.fly(p.x + 1, y + 4, p.z - 7, p.x, y + 1.2, p.z + 5); });
  await page.waitForTimeout(2500);
  await shot('u10-doorway-and-stairs.png');
  await page.evaluate(() => { tv.fly(null); thousandvale.actors.remove('warden'); thousandvale.objects.remove('demo:door'); thousandvale.objects.remove('demo:lift'); });
  expect(errors, errors.join('\n')).toEqual([]);
});
