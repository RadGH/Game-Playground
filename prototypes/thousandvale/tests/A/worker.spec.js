// The whole server sim runs in a Web Worker (PLAN §8.6): two client connections in one page join the
// in-browser world, see each other and a wolf. Runs against the playground dev server (8401); no game
// server needed.
import { test, expect } from '@playwright/test';

test('worker mode: two connections join the in-browser server (in the town) and see each other', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const { connect, memoryTokenStore } = await import('/prototypes/thousandvale/js/net/client.js');
    const { createMirror } = await import('/prototypes/thousandvale/js/net/mirror.js');
    const mk = async (name) => {
      const net = connect({ mode: 'worker', tokenStore: memoryTokenStore(), build: 'dev' });
      const m = createMirror();
      net.on('joined', () => m.reset()); net.on('info', e => m.info(e)); net.on('snap', s => m.snap(s));
      await net.ready;
      const ch = await net.createChar({ name, cls: 'warrior' });
      await net.play(ch.id);
      return { net, m };
    };
    const a = await mk('Worker Ann'), b = await mk('Worker Bo');
    let s = 0;
    for (let i = 0; i < 20; i++) { a.net.input({ s: ++s, dt: 50, mx: 1, mz: 0, yaw: 0, b: 0 }); await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 500));
    const seenA = b.m.ents.get(a.net.you);
    return { aSeesB: a.m.ents.has(b.net.you), bSeesA: !!seenA, ax: seenA && seenA.x, startX: a.net.joined.you.x, kind: a.net.joined.room.kind, area: a.net.joined.room.area, status: a.net.status, terrain: a.net.joined.room.terrain };
  });
  expect(errors).toEqual([]);
  expect(r.status).toBe('online');
  expect(r.aSeesB).toBe(true);
  expect(r.bSeesA).toBe(true);
  expect(r.ax - r.startX).toBeGreaterThan(3);
  expect(r.kind).toBe('town');
  expect(r.area.r).toBeGreaterThan(20);
  expect(r.terrain).toBe('test');
});
