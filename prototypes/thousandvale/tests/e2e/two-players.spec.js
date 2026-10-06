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
  test.setTimeout(480000);
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
  // the bearing out of town: toward the zone's middle, where E's camps are (the nearest sit ~140 m out)
  const town = area || await A.page.evaluate(() => window.thousandvale.S.room?.town || null);
  const ang = town ? (Math.atan2(1024 - (town.z % 2048), 1024 - (town.x % 2048)) || 0) : 0;
  const ux = Math.cos(ang), uz = Math.sin(ang);
  if (area) {
    // play-test 4 (S7): the town has a wall now — leave through the gate that faces the zone's middle (B's town_wall
    // placement: gates with an `out` direction), via a point just inside it and one just outside, then on out
    const gateRoute = await A.page.evaluate(async ([ux, uz, area]) => {
      const L = [...window.thousandvale.WS.loaded.values()].find(L => L.town); if (!L) return null;
      const d = await (await fetch(new URL(`data/zones/${L.key}/placements.json`, location.href))).json();
      const walls = (d.placements || d).filter(p => p.kind === 'town_wall');
      const ox = L.T.ox || 0, oz = L.T.oz || 0;
      let best = null, bs = -2;
      for (const w of walls) for (const g of w.data.gates || []) {
        const gx = g.x + ox, gz = g.z + oz;
        if (Math.hypot(gx - area.x, gz - area.z) > area.r) continue;
        const sc = g.out[0] * ux + g.out[1] * uz; if (sc > bs) { bs = sc; best = { gx, gz, o: g.out }; }
      }
      if (!best) return null;
      const { gx, gz, o } = best, far = area.r + 30 - Math.hypot(gx - area.x, gz - area.z);
      return [[gx - o[0] * 7, gz - o[1] * 7], [gx + o[0] * 8, gz + o[1] * 8], [gx + o[0] * Math.max(20, far), gz + o[1] * Math.max(20, far)]];
    }, [ux, uz, area]);
    const route = gateRoute || [[area.x + ux * (area.r + 25), area.z + uz * (area.r + 25)]];
    // at ~4 fps headless a 115 m walk is slow: wait on each leg, not on a clock (re-issue the walk if it stalled)
    for (const [P, dx] of [[A, 0], [B, 2]]) {
      for (const [i, [x, z]] of route.entries()) {
        const last = i === route.length - 1;
        await expect.poll(async () => {
          const s = await P.page.evaluate(() => ({ kind: window.thousandvale.S.room?.kind, you: window.tv.state().you }));
          if (s.kind === 'wilds') return true;
          if (!last && Math.hypot(s.you.x - x - dx, s.you.z - z) < 2.5) return true;
          await P.page.evaluate(([x, z]) => window.tv.walkTo(x, z), [x + dx, z]);
          return false;
        }, { timeout: 120000, intervals: [2000], message: last ? 'handed over from the town to the wilds' : `walked to leg ${i} of the way out` }).toBe(true);
        if ((await P.page.evaluate(() => window.thousandvale.S.room?.kind)) === 'wilds') break;
      }
    }
  }

  // helpers over tv.state(): ids are local to a ROOM (every id changed at the handoff), so always read fresh
  const live = s => s.ents.filter(e => e.kind === 'monster' && !e.dead);
  const nearest = (s, list = live(s)) => list.slice().sort((p, q) => Math.hypot(p.x - s.you.x, p.z - s.you.z) - Math.hypot(q.x - s.you.x, q.z - s.you.z))[0] || null;
  const walk = (P, x, z) => P.page.evaluate(([x, z]) => window.tv.walkTo(x, z), [x, z]);
  const riseIfDead = async P => { const s = await st(P.page); if (s.you.dead) await P.page.evaluate(() => window.tv.rise()); return s; };

  // 4a. find a monster: the nearest LIVE one A can see; with none in view both walk on outward in 40 m steps
  let wolf = null;
  await expect.poll(async () => {
    const s = await st(A.page);
    wolf = nearest(s);
    if (!wolf) {
      const go = { x: s.you.x + ux * 40, z: s.you.z + uz * 40 };
      await walk(A, go.x, go.z); await walk(B, go.x + 3, go.z);
    }
    return !!wolf;
  }, { timeout: 90000, intervals: [3000], message: 'a live monster is in view' }).toBe(true);

  // 4b. gather short of it, together, and rest to most of our health first (out-of-combat regen 1.5%/s):
  //     arriving one at a time and half-dead after the walk out was what made this test flaky
  const stage = await (async () => {
    const s = await st(A.page), d = Math.hypot(wolf.x - s.you.x, wolf.z - s.you.z) || 1;
    const back = Math.min(d, 28);
    return { x: wolf.x - (wolf.x - s.you.x) / d * back, z: wolf.z - (wolf.z - s.you.z) / d * back };
  })();
  await expect.poll(async () => {
    let ok = true;
    for (const [P, dx] of [[A, 0], [B, 2.5]]) {
      const s = await riseIfDead(P);
      const far = Math.hypot(stage.x + dx - s.you.x, stage.z - s.you.z) > 4;
      if (far) await walk(P, stage.x + dx, stage.z);
      // anything already on us: fight it here (that still counts — the pack is the pack)
      const close = nearest(s);
      if (close && Math.hypot(close.x - s.you.x, close.z - s.you.z) < 3) await P.page.evaluate(id => window.tv.cast(0, id), close.id);
      ok = ok && !far && !s.you.dead && s.you.hp >= (s.you.hpMax || 1) * 0.75;
    }
    return ok;
  }, { timeout: 90000, intervals: [1500], message: 'both players gathered near the pack with most of their health' }).toBe(true);

  // 4c. both go to the same monster (A's pick, re-picked when it dies) and swing until each has landed a hit
  //     and each has seen the other's hit. Conditions, not a clock: the window is generous for a slow headless box.
  const landed = { A: false, B: false }, sawOther = { A: false, B: false };
  const end = Date.now() + 150000;
  while (Date.now() < end && !(landed.A && landed.B && sawOther.A && sawOther.B)) {
    for (const [key, P, otherName] of [['A', A, 'Brem'], ['B', B, 'Alda']]) {
      const s = await riseIfDead(P);
      if (s.you.dead) continue;
      const me = s.you.id, other = s.ents.find(e => e.kind === 'player' && e.name === otherName)?.id;
      let w = s.ents.find(e => e.id === wolf.id && !e.dead) || nearest(s);
      if (!w) continue;
      const d = Math.hypot(w.x - s.you.x, w.z - s.you.z);
      if (process.env.TV_DEBUG) console.log(key, 'you', s.you.x.toFixed(1), s.you.z.toFixed(1), 'wolf', w.id, w.x, w.z, 'd', d.toFixed(1), 'hp', s.you.hp, '/', s.you.hpMax, 'fps', s.stats?.fps);
      if (d > 2.2) await walk(P, w.x, w.z);
      else await P.page.evaluate(id => { window.tv.stop(); window.tv.cast(0, id); }, w.id);
      // a swing hits whatever monster of the pack is in its arc, not only the one targeted — so "together" =
      // both players land hits on monsters while fighting the same pack, and each sees the other's hits
      const monsters = new Set(s.ents.filter(e => e.kind === 'monster').map(e => e.id));
      for (const ev of s.events) {
        if (ev.type !== 'hit' || ev.kind !== 'dmg' || !monsters.has(ev.d)) continue;
        if (ev.s === me) landed[key] = true;
        if (other != null && ev.s === other) sawOther[key] = true;
      }
    }
    await A.page.waitForTimeout(250);
    // the monster may die before both have hit it: pick the next live one A sees and keep going
    const s = await st(A.page);
    const w = s.ents.find(e => e.id === wolf.id);
    if (!w || w.dead) { const next = nearest(s); if (next) wolf = next; }
  }
  expect(landed, 'both players hit wolves of the same pack').toEqual({ A: true, B: true });
  expect(sawOther, "each player saw the other's hit").toEqual({ A: true, B: true });
  await A.page.screenshot({ path: 'test-results/thousandvale-two-players-fight.png' });
  expect(A.errors, 'no page errors in A').toEqual([]);
  expect(B.errors, 'no page errors in B').toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});
