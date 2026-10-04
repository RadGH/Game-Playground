// Stream G — M0 gate (PLAN §15): two browsers see each other move and hit a wolf together.
//
// Starts its own Thousandvale server (memory DB, free port) so it never depends on 8491 being up,
// then opens two isolated browser contexts (two guests). Drives the game through the client's test
// hook `window.tv` (requested from stream D in docs/requests.md "G -> D"):
//   tv.state()  -> { status, you:{id,x,z,hp}, ents:[{id,kind,type,name,x,z,hp,dead}], events:[ev…] }
//   tv.walkTo(x, z), tv.stop(), tv.cast(slot, targetId?)
// Run (shared lock, one browser at a time):
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/e2e/two-players.spec.js
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, serverExists, GAME } from '../load/server-harness.mjs';

const ready = serverExists() && existsSync(join(GAME, 'index.html'));
test.skip(!ready, 'needs server/main.mjs (stream A) and index.html (stream D)');
test.describe.configure({ mode: 'serial' });

let srv;
test.beforeAll(async () => { srv = await startServer({ db: 'memory' }); });
test.afterAll(async () => { await srv?.kill('SIGTERM'); });

async function joinAs(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${srv.http}/prototypes/thousandvale/?autoplay=1&name=${encodeURIComponent(name)}&cls=warrior`);
  await page.waitForFunction(() => window.tv && window.tv.state().status === 'online' && window.tv.state().you?.id != null, null, { timeout: 30000 });
  return { ctx, page, errors };
}

const st = p => p.evaluate(() => window.tv.state());

test('two players see each other move and hit a wolf together', async ({ browser }) => {
  test.setTimeout(180000);
  const A = await joinAs(browser, 'Alda');
  const B = await joinAs(browser, 'Brem');
  const a0 = await st(A.page), b0 = await st(B.page);

  // 1. each sees the other as a player
  await expect.poll(async () => (await st(B.page)).ents.some(e => e.id === a0.you.id && e.kind === 'player'), { timeout: 10000 }).toBe(true);
  await expect.poll(async () => (await st(A.page)).ents.some(e => e.id === b0.you.id && e.kind === 'player'), { timeout: 10000 }).toBe(true);

  // 2. A walks 15 m; B watches A's position change by more than 8 m
  const seenBefore = (await st(B.page)).ents.find(e => e.id === a0.you.id);
  await A.page.evaluate(([x, z]) => window.tv.walkTo(x, z), [a0.you.x + 15, a0.you.z]);
  await expect.poll(async () => {
    const e = (await st(B.page)).ents.find(x => x.id === a0.you.id);
    return e ? Math.hypot(e.x - seenBefore.x, e.z - seenBefore.z) : 0;
  }, { timeout: 10000 }).toBeGreaterThan(8);
  await A.page.screenshot({ path: 'test-results/thousandvale-two-players-A.png' });
  await B.page.screenshot({ path: 'test-results/thousandvale-two-players-B.png' });

  // 3. protocol v2: characters start in the town hub (no monsters). Both walk out through the same side of
  //    the town circle (S.room.area) and are handed over to the wilds room.
  const area = await A.page.evaluate(() => window.thousandvale.S.room?.area || null);
  if (area) {
    // head for the edge that faces the zone's middle, where the wolf camps are
    const ang = Math.atan2(1024 - area.z, 1024 - area.x) || 0;
    const out = { x: area.x + Math.cos(ang) * (area.r + 25), z: area.z + Math.sin(ang) * (area.r + 25) };
    for (const [P, dx] of [[A, 0], [B, 3]]) await P.page.evaluate(([x, z]) => window.tv.walkTo(x, z), [out.x + dx, out.z]);
    for (const P of [A, B]) await P.page.waitForFunction(() => window.thousandvale.S.room?.kind === 'wilds', null, { timeout: 60000 });
  }

  // 4. both go to the same wolf (the nearest one to A) and swing until each has landed a hit on it
  let wolf = null;
  await expect.poll(async () => {
    const s = await st(A.page);
    const wolves = s.ents.filter(e => e.kind === 'monster' && !e.dead);
    wolves.sort((p, q) => Math.hypot(p.x - s.you.x, p.z - s.you.z) - Math.hypot(q.x - s.you.x, q.z - s.you.z));
    wolf = wolves[0] || null;
    return !!wolf;
  }, { timeout: 20000, message: 'a wolf is in view' }).toBe(true);

  const landed = { A: false, B: false }, sawOther = { A: false, B: false };
  const end = Date.now() + 75000;
  while (Date.now() < end && !(landed.A && landed.B && sawOther.A && sawOther.B)) {
    for (const [key, P, me, other] of [['A', A, a0.you.id, b0.you.id], ['B', B, b0.you.id, a0.you.id]]) {
      const s = await st(P.page);
      const w = s.ents.find(e => e.id === wolf.id);
      if (!w || w.dead) continue;
      const d = Math.hypot(w.x - s.you.x, w.z - s.you.z);
      if (d > 2.2) await P.page.evaluate(([x, z]) => window.tv.walkTo(x, z), [w.x, w.z]);
      else await P.page.evaluate(id => { window.tv.stop(); window.tv.cast(0, id); }, w.id);
      // a swing hits whatever wolf of the pack is in its arc, not only the one targeted — so "together" =
      // both players land hits on monsters while fighting the same pack, and each sees the other's hits
      const monsters = new Set(s.ents.filter(e => e.kind === 'monster').map(e => e.id));
      for (const ev of s.events) {
        if (ev.type !== 'hit' || ev.kind !== 'dmg' || !monsters.has(ev.d)) continue;
        if (ev.s === me) landed[key] = true;
        if (ev.s === other) sawOther[key] = true;
      }
    }
    await A.page.waitForTimeout(250);
    // the wolf may die before both have hit it: pick the next one and keep going
    const s = await st(A.page);
    const w = s.ents.find(e => e.id === wolf.id);
    if ((!w || w.dead) && !(landed.A && landed.B)) {
      const next = s.ents.filter(e => e.kind === 'monster' && !e.dead).sort((p, q) => Math.hypot(p.x - s.you.x, p.z - s.you.z) - Math.hypot(q.x - s.you.x, q.z - s.you.z))[0];
      if (next) wolf = next;
    }
  }
  expect(landed, 'both players hit wolves of the same pack').toEqual({ A: true, B: true });
  expect(sawOther, "each player saw the other's hit").toEqual({ A: true, B: true });
  await A.page.screenshot({ path: 'test-results/thousandvale-two-players-fight.png' });
  expect(A.errors, 'no page errors in A').toEqual([]);
  expect(B.errors, 'no page errors in B').toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});
