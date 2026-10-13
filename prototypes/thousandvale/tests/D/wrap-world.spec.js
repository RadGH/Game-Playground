// Wrap-up, world (2026-10-13) — LOOK at the three things that are drawn: #63 one well at The Pail and Plough, #61 the
// training dummy (and its rock when hit), #59 the Caged Scout's cage (shut, then open). Shots: $WRAP_SHOTS or tests/D/shots/wrap-*.png
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/wrap-world.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = process.env.WRAP_SHOTS || join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase;
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

test.beforeAll(async () => {
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server:\n' + out)), 30000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  hookBase = `http://127.0.0.1:${hp}`; mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => { srv?.kill('SIGTERM'); });

test('wrap-up world: one well, a dummy that is a dummy, a cage with a scout in it', async ({ browser }) => {
  test.setTimeout(900000);
  const name = 'Wrapper';
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=ranger&quality=low&tod=0.5`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  const go = async (x, z, ms = 6000) => { await hook('/teleport', { name, x, z }); await page.waitForTimeout(ms); };
  const shot = n => page.screenshot({ path: join(SHOTS, `wrap-${n}.png`) });

  // ---- #61: the dummies by the square of the first town
  await page.waitForTimeout(3000);
  let dummies = await page.evaluate(() => [...thousandvale.actors.actors.values()].filter(a => a.creature?.type === 'training_dummy').map(a => ({ id: a.id, x: a.pos.x, z: a.pos.z, yaw: a.yaw })));
  if (!dummies.length) { await go(25140, 5370); dummies = await page.evaluate(() => [...thousandvale.actors.actors.values()].filter(a => a.creature?.type === 'training_dummy').map(a => ({ id: a.id, x: a.pos.x, z: a.pos.z, yaw: a.yaw }))); }
  expect(dummies.length, 'training dummies stand in the first town').toBeGreaterThan(0);
  const d = dummies[0];
  await go(d.x + Math.sin(d.yaw) * 3.2, d.z + Math.cos(d.yaw) * 3.2, 5000);
  await page.waitForFunction(id => !!thousandvale.actors.get(id)?.body, d.id, { timeout: 60000 });
  await page.evaluate(([id, yaw]) => { tv.view(4.2, 0.2, yaw + Math.PI + 0.45); thousandvale.S.target = id; }, [d.id, d.yaw]);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(id => { const a = thousandvale.actors.get(id); let meshes = 0, skinned = 0; a.model.traverse(o => { if (o.isMesh) meshes++; if (o.isSkinnedMesh) skinned++; }); return { prop: !!a.body.isProp, meshes, skinned, height: a.height, name: a.name, hostile: a.hostile, plate: !!a.plate }; }, d.id);
  expect(info.prop, 'the dummy is a built object').toBe(true);
  expect(info.skinned, 'no animal skeleton in it').toBe(0);
  expect(info.meshes).toBe(2);
  expect(info.height).toBeGreaterThan(1.7);
  expect(info.plate).toBe(true);
  await shot('dummy');
  const still = await page.evaluate(id => thousandvale.actors.get(id).model.children[1].rotation.x, d.id);
  await page.evaluate(id => thousandvale.actors.playHit(id, tv.state().you.id, 25), d.id);
  await page.waitForTimeout(110);
  const rocked = await page.evaluate(id => { const r = thousandvale.actors.get(id).model.children[1].rotation; return Math.abs(r.x) + Math.abs(r.z); }, d.id);
  await shot('dummy-hit');
  expect(still).toBe(0); expect(rocked, 'a hit rocks it').toBeGreaterThan(0.02);
  const where = await page.evaluate(id => { const a = thousandvale.actors.get(id); return { gx: a.group.position.x - a.pos.x, gz: a.group.position.z - a.pos.z }; }, d.id);
  expect(Math.hypot(where.gx, where.gz), 'the post does not slide in the ground').toBeLessThan(0.001);

  // ---- #63: the inn's well
  await go(25254.5, 5952.5, 9000);
  await page.evaluate(() => tv.view(9, 0.5, Math.PI * 0.8));
  await page.waitForTimeout(2500);
  const wells = await page.evaluate(() => [...thousandvale.objects.items.values()].filter(o => o.type === 'use' && /well/i.test(o.name || '')).map(o => { let meshes = 0; o.root.traverse(m => { if (m.isMesh && m.geometry?.attributes?.position?.count > 200) meshes++; }); return { name: o.name, bare: !!o.bare, models: meshes, ring: !!o.ring, x: o.x, z: o.z }; }));
  expect(wells.length, 'the well you drink from is there').toBe(1);
  expect(wells[0].bare).toBe(true);
  expect(wells[0].models, 'it adds no second well').toBe(0);
  expect(wells[0].ring, 'and can still be used').toBe(true);
  await shot('well');
  await page.evaluate(() => tv.view(7, 1.1, Math.PI * 0.8)); await page.waitForTimeout(1200);
  await shot('well-top');

  // ---- #59: the caged scout, in the wilds
  await hook('/level', { name, level: 40 }); await page.waitForTimeout(1500);      // so the guards do not put the camera on the floor
  await go(25309, 5399, 8000);
  const ev = await hook('/roadevent', { name, kind: 'rescue', id: 'caged_scout', calm: true });
  expect(ev.ok, JSON.stringify(ev)).toBe(true);
  await go(ev.x + 2.6, ev.z + 2.6, 7000);
  await page.waitForFunction(id => thousandvale.held.items.has(id) && !!thousandvale.held.items.get(id).root.parent, ev.npc, { timeout: 60000 });
  await page.evaluate(() => tv.view(6.5, 0.32, Math.PI * 1.25)); await page.waitForTimeout(2500);
  const cage = await page.evaluate(id => { const it = thousandvale.held.items.get(id), a = thousandvale.actors.get(id); return { door: it.leaf.rotation.y, dx: it.root.position.x - a.pos.x, dz: it.root.position.z - a.pos.z, dy: it.root.position.y - a.pos.y }; }, ev.npc);
  expect(Math.abs(cage.door)).toBe(0);
  expect(Math.hypot(cage.dx, cage.dz), 'the scout is inside it').toBeLessThan(0.3);
  expect(Math.abs(cage.dy)).toBeLessThan(0.4);
  await shot('cage');
  await page.evaluate(() => tv.view(6.5, 0.4, Math.PI * 0.75)); await page.waitForTimeout(1200);
  await shot('cage-close');
  await hook('/roadevent', { name, open: ev.ev });
  await page.waitForFunction(id => thousandvale.held.items.get(id)?.leaf.rotation.y < -1.85, ev.npc, { timeout: 60000 }).catch(() => {});
  const open = await page.evaluate(id => thousandvale.held.items.get(id)?.leaf.rotation.y, ev.npc);
  expect(open, 'the door swings open when the scout is freed').toBeLessThan(-1.5);
  await shot('cage-open');

  // ---- #59's siblings: a road-event chest is what its name says (a cart, a hole, a stump, saddlebags), not one crate for all
  for (const id of ['wrecked_cart', 'buried_cache', 'hollow_stump', 'fallen_pack_mule']) {
    const c = await hook('/roadevent', { name, kind: 'chest', id, calm: true });
    expect(c.ok, id + ' ' + JSON.stringify(c)).toBe(true);
    await go(c.x + 2.4, c.z + 2.4, 6000);
    await page.waitForFunction(k => thousandvale.objects.items.has(k), c.obj, { timeout: 30000 });
    await page.evaluate(() => tv.view(5.5, 0.5, Math.PI * 1.25)); await page.waitForTimeout(2200);
    const parts = await page.evaluate(k => { const o = thousandvale.objects.items.get(k); let n = 0; o.root.traverse(m => { if (m.isMesh) n++; }); return { look: o.look, meshes: n, ring: !!o.ring }; }, c.obj);
    expect(parts.meshes, id + ' is dressed (' + parts.look + ')').toBeGreaterThan(4);
    await shot('chest-' + id);
  }
  expect(errors, errors.join('\n')).toEqual([]);
  await ctx.close();
});
