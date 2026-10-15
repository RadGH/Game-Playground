// Play-test 11 — D-world (3D client visuals). LOOK at: Z59 the painted sky at several hours, weathers and places (live
// #60), Z26 a brigand archer's arrows (#27), Z32 mounts at their new size (#33), Z45 travel marks (#46), Z39 a fan wand's
// three bolts (#40), Z54 a Giant's size and portrait (#55), Z37 round colliders + Z38 click-to-move round them (#38/#39),
// Z25 the forests (#26), Z49 the ship's arrival (#50). Shots: $PT11_SHOTS or tests/D/shots/pt11w-*.png
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/pt11-world.spec.js
// Pick parts with PT11_ONLY=sky,archer,... (comma list; default all).
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = process.env.PT11_SHOTS || join(HERE, 'shots');
const ONLY = process.env.PT11_ONLY ? new Set(process.env.PT11_ONLY.split(',')) : null;
const part = k => !ONLY || ONLY.has(k);
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase;
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

test.beforeAll(async () => {
  port = await freePort(); const hp = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server:\n' + out)), 60000); srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  hookBase = `http://127.0.0.1:${hp}`; mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(() => { srv?.kill('SIGTERM'); });

test('play-test 11, D-world: sky, archers, mounts, travel marks, fan bolts, giants, colliders, forests, the ship', async ({ browser }) => {
  test.setTimeout(2400000);
  const name = 'Skyward';
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=starcaller&quality=${process.env.PT11_QUALITY || 'low'}&tod=0.5`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  const go = async (x, z, ms = 6000) => { await hook('/teleport', { name, x, z }); await page.waitForTimeout(ms); };
  const shot = n => page.screenshot({ path: join(SHOTS, `pt11w-${n}.png`) });
  const settle = (ms = 2500) => page.waitForTimeout(ms);

  // ---- Z59: the painted sky (live #60, Vharlen 26854,19973 / Torbor Downs 25899,5003) -------------------------
  if (part('sky')) {
    await go(25899, 5003, 8000);
    await page.evaluate(() => thousandvale.view.skyBox.preloadAll());
    await page.evaluate(() => { tv.hud(false); tv.view(14, 0.08, 1.4); });
    for (const [t, label, extra] of [[0.5, 'noon', {}], [0.5, 'noon-cloudy', { weather: 'cloudy' }], [0.27, 'dawn', {}], [0.4, 'morning', {}], [0.72, 'dusk', {}], [0.9, 'night', {}], [0.5, 'vharlen', { prov: 'vharlen' }], [0.7, 'vharlen-late', { prov: 'vharlen' }]]) {
      await page.evaluate(([tt, ex]) => {
        const S = thousandvale.S; S.skyProvince = ex.prov || null;
        // a cloudy realm day: the first day number the weather calls cloudy
        if (ex.weather === 'cloudy') { S.skyDay = 0; } else S.skyDay = null;
        tv.setTime(tt);
      }, [t, extra]);
      if (extra.weather === 'cloudy') await page.evaluate(async () => { const m = await import('/prototypes/thousandvale/js/client/sky-plan.js'); const pv = thousandvale.S.room?.province ?? null; let d = 0; while (m.weatherFor(d, pv) !== 'cloudy') d++; thousandvale.S.skyDay = d; tv.setTime(0.5); });
      else if (!extra.weather) await page.evaluate(async () => { const m = await import('/prototypes/thousandvale/js/client/sky-plan.js'); const pv = thousandvale.S.room?.province ?? null; let d = 0; while (m.weatherFor(d, pv) !== 'clear') d++; thousandvale.S.skyDay = d; });
      await settle(3500);
      const st = await page.evaluate(() => ({ plan: thousandvale.view.skyPlan, shown: thousandvale.view.skyBox.stats.shown, ready: thousandvale.view.skyBox.ready, fog: thousandvale.view.scene.fog.color.toArray().map(v => +v.toFixed(3)) }));
      console.log('sky', label, JSON.stringify(st));
      expect(st.ready, 'a painted sky is up').toBe(true);
      await shot('sky-' + label);
    }
    await page.evaluate(() => { thousandvale.S.skyProvince = null; thousandvale.S.skyDay = null; tv.setTime(0.5); });
  }

  // keep the test body alive (the frogs of the downs bite)
  const live = () => hook('/level', { name, level: 40 }).catch(() => null);
  await live();
  const me = () => page.evaluate(() => tv.state().you.id);
  // the downs' hounds and frogs kill a test body that stands still: get up again (at the waystone) before a part that walks
  const revive = async () => {
    if (!(await page.evaluate(() => !!thousandvale.S.self.dead))) return;
    await page.waitForTimeout(3000); await page.evaluate(() => tv.rise());
    await page.waitForFunction(() => !thousandvale.S.self.dead, null, { timeout: 60000 }); await page.waitForTimeout(4000);
  };

  // ---- Z26: a brigand archer looses an ARROW, not a stone (live #27 at 25938,4969) ---------------------------------
  if (part('archer')) {
    await go(25938, 4969, 6000);
    await page.evaluate(() => { tv.hud(false); tv.view(9, 0.22, 2.2); tv.setTime(0.5); });
    const id = await me();
    const got = await page.evaluate(async you => {
      const A = thousandvale.actors, p = A.get(you).pos;
      A.add({ id: 990101, kind: 'monster', name: 'Brigand Archer', level: 4, hp: 40, hpMax: 40, hostile: true, creature: { type: 'brigand_archer', seed: 3 }, x: p.x + 12, y: p.y, z: p.z + 2, yaw: -1.4 });
      for (let k = 0; k < 120 && !A.get(990101).body; k++) await new Promise(r => setTimeout(r, 250));
      thousandvale.S.todHold = 0.5;
      tv.fxEvent({ type: 'fx', kind: 'shot', id: 990101, to: you, element: 'physical', ms: 6000, from: { x: p.x + 12, z: p.z + 2 } });
      return { held: A.get(990101).heldId, last: thousandvale.shots.stats.last };
    }, id);
    console.log('archer', JSON.stringify(got));
    expect(got.held, 'the archer holds its bow').toBe('bow');
    expect(got.last.model, 'it looses an arrow').toBe('arrow');
    await settle(1800);
    await shot('archer-arrow');
    await page.evaluate(() => thousandvale.actors.remove(990101));
  }

  // ---- Z39: a fan wand's three bolts, each its own flight (live #40) ---------------------------------------------
  if (part('fan')) {
    const id = await me();
    await page.evaluate(() => { tv.hud(false); tv.view(10, 0.6, 3.6); });
    const st = await page.evaluate(you => {
      const p = thousandvale.actors.get(you).pos, to = { x: p.x + 2, z: p.z + 16 };
      const before = thousandvale.shots.stats.fired;
      for (let n = 1; n <= 3; n++) tv.fxEvent({ type: 'fx', kind: 'bolt', id: you, element: 'arcane', from: { x: p.x, z: p.z }, to, ms: 7000, basic: 1, n, of: 3 });
      return { fired: thousandvale.shots.stats.fired - before };
    }, id);
    expect(st.fired, 'three bolts fly').toBe(3);
    await settle(2600);
    await shot('fan-three-bolts');
  }

  // ---- Z32 + Z47: mounts at their new size, and Vharlen's two lizards (live #33, #48) -------------------------------
  if (part('mounts')) {
    const id = await me();
    await page.evaluate(() => { tv.hud(false); tv.view(7.5, 0.18, 1.9); });
    for (const m of ['trail_horse', 'pony', 'ash_strider', 'slag_basker']) {
      await page.evaluate(([you, mm]) => thousandvale.actors.setMount(you, mm), [id, m]);
      await page.waitForFunction(([you, mm]) => thousandvale.actors.get(you).mountHave === mm && !!thousandvale.actors.get(you).mount, [id, m], { timeout: 60000 });
      const sz = await page.evaluate(you => { const a = thousandvale.actors.get(you); return { size: a.mount.spec?.size ?? null, h: a.height }; }, id);
      console.log('mount', m, JSON.stringify(sz));
      await settle(1500);
      await shot('mount-' + m);
    }
    await page.evaluate(you => thousandvale.actors.setMount(you, null), id);
  }

  // ---- Z45: a ship over the harbourmaster, a cart over the carter (live #46) ---------------------------------------
  if (part('travel')) {
    const id = await me();
    await page.evaluate(() => { tv.hud(false); tv.view(11, 0.16, 2.0); });
    const n = await page.evaluate(async you => {
      const A = thousandvale.actors, p = A.get(you).pos, Q = thousandvale.questMarks;
      A.add({ id: 990201, kind: 'npc', name: 'Osric Fennimore', level: 1, hp: 1, hpMax: 1, look: { race: 'human', seed: 41, cls: 'bard' }, x: p.x + 5, y: p.y, z: p.z - 2, yaw: -1.5, role: 'harbourmaster' });
      A.add({ id: 990202, kind: 'npc', name: 'Ash-Road Hauler', level: 1, hp: 1, hpMax: 1, look: { race: 'human', seed: 77, cls: 'ranger' }, x: p.x + 6, y: p.y, z: p.z + 3, yaw: -1.5, role: 'carter' });
      const { travelOf } = await import('/prototypes/thousandvale/js/client/quest-marks.js');
      Q.setTravel(990201, travelOf({ role: 'harbourmaster' })); Q.setTravel(990202, travelOf({ role: 'carter' }));
      for (let k = 0; k < 120 && !(A.get(990201).body && A.get(990202).body); k++) await new Promise(r => setTimeout(r, 250));
      return Q.list().filter(x => x.id >= 990201).map(x => x.mark);
    }, id);
    expect(n.sort()).toEqual(['cart', 'ship']);
    await settle(3000);
    await shot('travel-marks');
    await page.evaluate(() => { thousandvale.questMarks.setTravel(990201, null); thousandvale.questMarks.setTravel(990202, null); thousandvale.actors.remove(990201); thousandvale.actors.remove(990202); });
  }

  // ---- Z54: a Giant whose size arrives late is re-scaled; its portrait shows its face (live #55) ---------------------
  if (part('giant')) {
    const id = await me();
    await page.evaluate(() => { tv.hud(true); tv.view(13, 0.2, 2.1); });
    const r = await page.evaluate(async you => {
      const A = thousandvale.actors, p = A.get(you).pos;
      A.add({ id: 990301, kind: 'monster', name: 'Giant Slagborn Firecaller', level: 11, hp: 300, hpMax: 300, hostile: true, creature: { type: 'slagborn_firecaller', seed: 5 }, x: p.x + 8, y: p.y, z: p.z, yaw: -1.6 });
      A.add({ id: 990302, kind: 'monster', name: 'Slagborn Firecaller', level: 11, hp: 100, hpMax: 100, hostile: true, creature: { type: 'slagborn_firecaller', seed: 6 }, x: p.x + 6, y: p.y, z: p.z - 4, yaw: -1.6 });
      for (let k = 0; k < 160 && !(A.get(990301).body && A.get(990302).body); k++) await new Promise(r => setTimeout(r, 250));
      const h0 = A.get(990301).height;
      const changed = A.setScale(990301, { sc: 3, rank: 'champion', mods: [{ id: 'giant', name: 'Giant' }] });     // the size the server sends late
      return { h0, h1: A.get(990301).height, changed, plain: A.get(990302).height };
    }, id);
    console.log('giant', JSON.stringify(r));
    expect(r.changed).toBe(true);
    expect(r.h1 / r.h0).toBeGreaterThan(2.5);
    await page.evaluate(() => tv.target(990301));
    await settle(3500);
    await shot('giant');
    await page.evaluate(() => { thousandvale.actors.remove(990301); thousandvale.actors.remove(990302); tv.hud(false); });
  }

  // ---- Z37 + Z38: round colliders at the boulders of live #38 (26081,4625), and click-to-move round them ------------
  if (part('collide')) {
    await revive();
    await go(26070, 4620, 7000);
    await page.waitForFunction(() => thousandvale.WS.loaded.get('z12_02')?.nav?.circles, null, { timeout: 60000 });
    await page.evaluate(() => { tv.hud(false); tv.view(16, 0.75, 0.0); });
    const res = await page.evaluate(() => {
      const nav = thousandvale.WS.terrain.nav, L = thousandvale.WS.loaded.get('z12_02');
      // the drawn boulder at world (26082.1, 4628.85): solid just inside its circle, open just outside (the old square reached ~3 m out)
      const bx = 24576 + 1506.12, bz = 4096 + 532.85;
      return { circles: L.nav.circles.count, inside: !!(nav.at(bx + 0.9, bz) & 32), out: !!(nav.at(bx + 2.2, bz) & 32), outDiag: !!(nav.at(bx + 1.7, bz + 1.7) & 32) };
    });
    console.log('collide', JSON.stringify(res));
    expect(res.inside, 'inside the boulder is solid').toBe(true);
    expect(res.out || res.outDiag, 'beside it is open').toBe(false);
    // walk from the south of the field to the north: straight it stuck on a corner; routed it gets there
    await revive(); await go(24576 + 1505, 4096 + 515, 4000);
    await page.evaluate(() => tv.walkTo(24576 + 1505, 4096 + 545));
    await settle(1200);
    const route = await page.evaluate(() => ({ route: thousandvale.controls.route, stats: { ...thousandvale.controls.routeStats } }));
    console.log('route', JSON.stringify(route));
    await shot('click-route');
    await page.waitForFunction(() => { const p = tv.state().you; return Math.hypot(p.x - (24576 + 1505), p.z - (4096 + 545)) < 1.5; }, null, { timeout: 90000 });
  }

  // ---- Z25: the woods by Torborhold (25600,5640) and the mountain canopy up close -----------------------------------
  if (part('forest')) {
    await revive();
    await go(25520, 5560, 9000);
    await page.evaluate(() => { tv.hud(false); tv.view(18, 0.2, 0.8); tv.setTime(0.45); });
    await settle(4000);
    const st = await page.evaluate(() => { const L = thousandvale.WS.loaded.get('z12_02'); const sc = L?.extras?.scatter; return { baked: sc?.baked, grown: sc?.grown, giants: sc?.giants, info: { ...thousandvale.view.renderer.info.render } }; });
    console.log('forest', JSON.stringify(st));
    expect(st.grown, 'new trees grown').toBeGreaterThan(500);
    await shot('forest-torborhold');
    await page.evaluate(() => tv.view(26, 0.06, 0.8));
    await settle(2500);
    await shot('forest-torborhold-wide');
  }

  // ---- Z49: the ship comes in slowly, the water flowing past at the ship's own pace (live #50) ----------------------
  if (part('ship')) {
    const DATA = JSON.parse(readFileSync(join(HERE, '../../data/provinces/ships.json'), 'utf8'));
    await page.evaluate(() => thousandvale.ships.ready);
    await page.evaluate(() => { tv.hud(false); tv.setTime(0.45); });
    const s = DATA.sailings.find(q => q.from === 'gullwick');
    const A = DATA.harbours.find(h => h.id === s.from), B = DATA.harbours.find(h => h.id === s.to);
    await page.evaluate(m => tv.fake('shipSail', m), { from: { id: A.id, name: A.name }, to: { id: B.id, name: B.name }, ship: 'the Saltwren', ms: 40000, skipMs: 5000, fare: 60, path: s.path, crew: [], berth: { from: A.berth, to: B.berth }, volcano: DATA.volcano });
    await page.waitForFunction(() => thousandvale.ships.active, null, { timeout: 15000 });
    const rows = [];
    for (const sec of [20, 28, 32, 35, 37.5, 39.5]) {
      await page.evaluate(x => thousandvale.ships.seek(x), sec);
      await settle(900);
      rows.push(await page.evaluate(() => { const v = thousandvale.ships.state; return { t: +v.t.toFixed(1), togo: Math.round(v.L - v.s) }; }));
      await shot('ship-' + String(sec).replace('.', '_'));
    }
    console.log('ship', JSON.stringify(rows));
    await page.evaluate(() => thousandvale.ships.endVoyage());
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

// Z25 perf + the mountain canopy up close: the same two views on High with the old look (`?forest=0&spire=4`: the bake's
// sprinkle, four-sided spires) and the new one — draw calls and triangles from the renderer, the zone build spans.
test('play-test 11, D-world: forests and far trees — before / after on High, and the canopy up close', async ({ browser }) => {
  test.skip(!part('perf'), 'PT11_ONLY without perf');
  test.setTimeout(2400000);
  const out = {};
  for (const [label, flags] of [['before', '&forest=0&spire=4'], ['after', '']]) {
    const name = 'Treeline' + label[0];
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=ranger&quality=high&tod=0.45${flags}`);
    await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 400000 });
    await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 400000 });
    await hook('/level', { name, level: 40 }).catch(() => null);
    const measure = async (x, z, view, shotName) => {
      await hook('/teleport', { name, x, z });
      await page.waitForTimeout(9000);
      await page.evaluate(v => { tv.hud(false); tv.view(...v); }, view);
      await page.waitForTimeout(6000);
      const r = await page.evaluate(() => { const i = thousandvale.view.renderer.info.render; const h = thousandvale.W.horizon?.stats?.(); return { calls: i.calls, tris: i.triangles, canopy: h?.canopy, near: h?.near, spires: h?.spires }; });
      await page.screenshot({ path: join(SHOTS, `pt11w-${shotName}-${label}.png`) });
      return r;
    };
    out[label] = { forest: await measure(25520, 5560, [18, 0.2, 0.8], 'perf-forest') };
    // the mountain canopy: stand near its nearest spire (it is only drawn on High / Medium), looking at the slope
    const root = await page.evaluate(() => { const p = tv.state().you; return thousandvale.W.horizon?.nearTrees?.nearestRoot(p.x, p.z) || null; });
    if (root) out[label].canopy = await measure(root.x - 120, root.z - 120, [16, 0.12, 0.78], 'perf-canopy');
    out[label].spans = await page.evaluate(() => (tv.perf().top || []).filter(t => /zone:(forest|navRefine|scatter|ground)/.test(t.name)));
    expect(errors, errors.join('\n')).toEqual([]);
    await ctx.close();
  }
  console.log('perf', JSON.stringify(out));
});
