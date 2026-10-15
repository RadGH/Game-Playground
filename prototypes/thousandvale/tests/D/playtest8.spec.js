// Stream D-world — play-test 8 (owner feedback 8, 2026-10-07) in a real browser against a real server (tests/D/m3-server.mjs):
//   W2/W14  every ranged attack is a body in the air from the attacker's hand (a gallery of every model, a real cast, no new shader)
//   W22     a dungeon is lit; night outdoors has the carried glow; no torch is drawn
//   W20     you run by default, Shift walks, Num Lock auto-runs
//   W12     ! and ? over NPCs (the server's own marks, and each glyph forced for the picture)
//   W26     the mount call holds you still; a second press cancels; you ride on
//   W5      the parked ox cart by Torborhold's gate, and the ride
//   W19     a backpack on the back
//   U4 (inherited)  the oat field still draws stalks
// Screenshots: tests/D/shots/w*-*.png
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/playtest8.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, port, hookBase, page, ctx;
const errors = [];
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
const shot = name => page.screenshot({ path: join(SHOTS, name) });
const NAME = 'Wren';
const HOME = { x: 25183, z: 5388 };
const CART = JSON.parse(readFileSync(join(HERE, '..', '..', 'data', 'provinces', 'carts.json'), 'utf8')).stops.find(s => /Torborhold/.test(s.town));

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
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${NAME}&cls=pyromancer&quality=low&tod=0.5`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  await page.evaluate(() => { tv.hud(false); });
});
test.afterAll(async () => { await ctx?.close(); srv?.kill('SIGTERM'); });

test('W2/W14: every kind of shot is a body in the air from the hand; nothing compiles when the first one flies', async () => {
  test.setTimeout(240000);
  await hook('/teleport', { name: NAME, x: HOME.x, z: HOME.z });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { tv.setTime(0.5); tv.view(7.5, 0.3, Math.PI); tv.perf(true); });
  await page.waitForTimeout(1500);
  // a gallery: one of each, slow, side by side across the view, so the picture shows every model
  const fired = await page.evaluate(() => {
    const me = tv.state().you, p = thousandvale.S.predictor.pos, cam = thousandvale.controls.cam.yaw;
    const fwd = { x: Math.sin(cam), z: Math.cos(cam) }, right = { x: Math.cos(cam), z: -Math.sin(cam) };
    const rows = [['arrow', 'physical', 'arrow'], ['arrow', 'physical', 'quarrel'], ['arrow', 'physical', 'javelin'], ['thrown', 'physical', 'knife'], ['thrown', 'physical', 'axe'], ['shot', 'physical', 'stone'],
      ['bolt', 'fire', 'firebolt'], ['bolt', 'arcane', 'orb'], ['bolt', 'ice', 'shard'], ['bolt', 'lightning', null], ['bolt', 'shadow', null], ['bolt', 'holy', null]];
    rows.forEach(([kind, element, proj], i) => {
      const side = (i - (rows.length - 1) / 2) * 0.95;
      tv.fxEvent({ type: 'fx', kind, id: me.id, element, ...(proj ? { proj } : {}), skill: 'demo', miss: 1, ms: 9000,
        to: { x: p.x + fwd.x * 34 + right.x * side * 7.5, z: p.z + fwd.z * 34 + right.z * side * 7.5 } });
    });
    return tv.shots();
  });
  expect(fired.live).toBe(12);
  expect(Object.keys(fired.byModel).sort()).toEqual(['arrow', 'axe', 'firebolt', 'javelin', 'knife', 'orb', 'quarrel', 'shard', 'spark', 'stone']);
  // it left the HAND: the start is beside the body, between the knees and the head
  const me = await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); return { x: a.pos.x, y: a.pos.y, z: a.pos.z, h: a.height }; });
  expect(Math.hypot(fired.last.from[0] - me.x, fired.last.from[2] - me.z)).toBeLessThan(1.6);
  expect(fired.last.from[1]).toBeGreaterThan(me.y + 0.3); expect(fired.last.from[1]).toBeLessThan(me.y + me.h + 0.4);
  await page.waitForTimeout(1500);
  await shot('w14-every-projectile.png');
  await page.evaluate(() => tv.view(3.4, 0.2, Math.PI));
  await page.waitForTimeout(700);
  await shot('w14-projectiles-close.png');
  const perf = await page.evaluate(() => tv.perf());
  expect(perf.newProgramNames, 'no shader is linked by a shot').toEqual([]);
  // a real firebolt and a monster's arrow at ordinary speed: seen in the air mid-flight, gone on arrival
  await page.evaluate(() => { tv.view(9, 0.35, Math.PI); });
  // (the flight clock is the frame clock: a software renderer at a few frames a second takes longer than 9 real seconds)
  await page.waitForFunction(() => tv.shots().live === 0, null, { timeout: 120000 });
  await page.evaluate(() => {
    const me = tv.state().you, p = thousandvale.S.predictor.pos;
    tv.fxEvent({ type: 'fx', kind: 'bolt', id: me.id, element: 'fire', proj: 'firebolt', skill: 'firebolt', from: { x: p.x, z: p.z }, to: { x: p.x + 4, z: p.z - 14 }, ms: 2400, speed: 6 });
  });
  await page.waitForFunction(() => { const s = tv.shots(); return s.live === 1 && s.list[0].k > 0.3; }, null, { timeout: 60000, polling: 50 });
  const mid = await page.evaluate(() => tv.shots());
  expect(mid.list[0].model).toBe('firebolt'); expect(mid.list[0].k).toBeLessThan(1);
  await shot('w14-firebolt-mid-flight.png');
  await page.waitForFunction(() => tv.shots().live === 0, null, { timeout: 60000 });
  const done = await page.evaluate(() => tv.shots());
  expect(done.landed).toBeGreaterThanOrEqual(13);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('W2: an archer NPC or monster that shoots at you sends a visible arrow from ITS hand', async () => {
  test.setTimeout(120000);
  const r = await page.evaluate(async () => {
    const me = tv.state().you;
    const other = [...thousandvale.actors.actors.values()].filter(a => a.id !== me.id && a.body && !a.dead).sort((a, b) => Math.hypot(a.pos.x - me.x, a.pos.z - me.z) - Math.hypot(b.pos.x - me.x, b.pos.z - me.z))[0];
    if (!other) return { none: true };
    const before = tv.shots().fired;
    tv.fxEvent({ type: 'fx', kind: 'shot', id: other.id, element: 'physical', proj: 'arrow', skill: 'basic', home: 1, from: { x: other.pos.x, z: other.pos.z }, to: me.id, ms: 2600, speed: 6 });
    for (let i = 0; i < 200 && !(tv.shots().list[0]?.k > 0.35); i++) await new Promise(r => setTimeout(r, 50));
    const s = tv.shots();
    return { fired: s.fired - before, last: s.last, other: { x: other.pos.x, y: other.pos.y, z: other.pos.z, name: other.name }, list: s.list, me: { x: me.x, z: me.z } };
  });
  test.skip(!!r.none, 'nobody else in sight to be the archer');
  expect(r.fired).toBe(1); expect(r.last.model).toBe('arrow'); expect(r.last.shooter).not.toBe(null);
  expect(Math.hypot(r.last.from[0] - r.other.x, r.last.from[2] - r.other.z), 'the arrow starts at the archer').toBeLessThan(1.8);
  await shot('w2-arrow-from-an-archer.png');
  await page.waitForFunction(() => tv.shots().live === 0, null, { timeout: 60000 });
});

test('W22: a dungeon is lit and the carried light is wide; night outdoors has the glow; nobody carries a torch', async () => {
  test.setTimeout(240000);
  await page.evaluate(() => tv.demoDungeon('crypt_spiral', 7));
  await page.waitForTimeout(6000);
  await page.evaluate(() => tv.view(10, 0.75, 0.6));
  await page.waitForTimeout(2500);
  const d = await page.evaluate(() => thousandvale.view.carry);
  expect(d.hemi).toBeGreaterThanOrEqual(2); expect(d.distance).toBeGreaterThanOrEqual(28); expect(d.intensity).toBeGreaterThan(10); expect(d.fogFar).toBeGreaterThanOrEqual(70);
  await shot('w22-dungeon-lit.png');
  await page.evaluate(() => tv.view(16, 1.0, 2.2));
  await page.waitForTimeout(1500);
  await shot('w22-dungeon-lit-wide.png');
  // the picture is not black: sample the canvas
  const lum = await page.evaluate(() => {
    const src = document.getElementById('view'), c = document.createElement('canvas'); c.width = 96; c.height = 60;
    const g = c.getContext('2d'); thousandvale.view.render(); g.drawImage(src, 0, 0, 96, 60);
    const d = g.getImageData(0, 0, 96, 60).data; let s = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; if (l < 10) dark++; }
    return { mean: s / (d.length / 4), darkShare: dark / (d.length / 4) };
  });
  expect(lum.mean, `mean brightness ${lum.mean.toFixed(1)} / 255`).toBeGreaterThan(22);
  await page.evaluate(() => tv.demoDungeon(null));
  await page.waitForTimeout(3000);
  await page.evaluate(() => { tv.setTime(0.0); tv.view(9, 0.45, Math.PI); });
  await page.waitForTimeout(3500);
  const n = await page.evaluate(() => ({ carry: thousandvale.view.carry, night: thousandvale.S.night, torches: thousandvale.statusSync.stats().torches }));
  expect(n.night).toBeGreaterThan(0.8); expect(n.carry.intensity).toBeGreaterThan(8); expect(n.carry.distance).toBeGreaterThanOrEqual(22); expect(n.torches).toBe(0);
  await shot('w22-night-outdoors.png');
  await page.evaluate(() => tv.setTime(0.5));
  await page.waitForTimeout(2500);
  expect((await page.evaluate(() => thousandvale.view.carry)).intensity).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('W20: you run by default; Shift walks; Num Lock keeps you running', async () => {
  test.setTimeout(240000);
  await hook('/teleport', { name: NAME, x: HOME.x, z: HOME.z });
  await page.waitForTimeout(4000);
  const pos = () => page.evaluate(() => ({ x: tv.state().you.x, z: tv.state().you.z, t: performance.now(), speed: thousandvale.S.movingSpeed, b: thousandvale.S.lastInput?.b }));
  const go = async (keys, ms) => {
    const a = await pos();
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    const m = await pos();
    for (const k of keys.slice().reverse()) await page.keyboard.up(k);
    await page.waitForTimeout(500);
    return { d: Math.hypot(m.x - a.x, m.z - a.z), s: (m.t - a.t) / 1000, speed: m.speed, b: m.b };
  };
  await page.evaluate(() => { tv.view(9, 0.4, Math.PI * 0.5); thousandvale.controls.setFacing(Math.PI * 0.5); });
  const run = await go(['KeyW'], 2500);
  await page.evaluate(() => { tv.view(9, 0.4, Math.PI * 1.5); });
  const walk = await go(['ShiftLeft', 'KeyW'], 2500);
  expect(run.b & 1, 'the run bit is set with no key but W').toBe(1);
  expect(walk.b & 1, 'Shift clears it').toBe(0);
  expect(run.speed).toBeGreaterThan(walk.speed);
  // Num Lock: forward with no key held, until S
  await page.keyboard.press('NumLock');
  await page.waitForTimeout(400);
  const a = await pos(); await page.waitForTimeout(1800); const b = await pos();
  expect(await page.evaluate(() => thousandvale.controls.autorun)).toBe(true);
  expect(b.b & 1).toBe(1); expect(b.speed).toBeGreaterThan(0);
  expect(Math.hypot(b.x - a.x, b.z - a.z), 'auto-run moves you').toBeGreaterThan(1);
  await page.keyboard.press('KeyS');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => thousandvale.controls.autorun)).toBe(false);
  console.log(`[W20] run ${run.d.toFixed(1)} m in ${run.s.toFixed(1)} s, walk ${walk.d.toFixed(1)} m in ${walk.s.toFixed(1)} s`);
});

test('W12: quest marks float over NPCs — the server\'s own, and each glyph for the picture', async () => {
  test.setTimeout(180000);
  await hook('/teleport', { name: NAME, x: HOME.x, z: HOME.z });
  await page.waitForTimeout(6000);
  const real = await page.evaluate(() => ({ list: thousandvale.questMarks.list(), messages: thousandvale.questMarks.stats.messages }));
  console.log(`[W12] the server sent ${real.messages} questMarks message(s); ${real.list.length} marked NPC(s) in sight: ${real.list.map(m => m.name + '=' + m.mark).join(', ')}`);
  expect(real.messages, 'A sends questMarks on join').toBeGreaterThan(0);
  const r = await page.evaluate(async () => {
    const me = tv.state().you;
    const npcs = [...thousandvale.actors.actors.values()].filter(a => a.kind === 'npc' && a.id !== me.id).sort((a, b) => Math.hypot(a.pos.x - me.x, a.pos.z - me.z) - Math.hypot(b.pos.x - me.x, b.pos.z - me.z)).slice(0, 5);
    const marks = {}; ['offer', 'turnin', 'later', 'active', 'job'].forEach((m, i) => { if (npcs[i]) marks[npcs[i].id] = m; });
    tv.fake('questMarks', { marks });
    await new Promise(r => setTimeout(r, 600));
    const first = npcs[0];
    return { n: npcs.length, shown: thousandvale.questMarks.stats.shown, list: thousandvale.questMarks.list(), first: first ? { x: first.pos.x, y: first.pos.y, z: first.pos.z, h: first.height } : null, sprite: !!thousandvale.questMarks.sprite('offer') };
  });
  test.skip(!r.n, 'no NPC in sight');
  expect(r.shown).toBeGreaterThanOrEqual(Math.min(r.n, 5)); expect(r.sprite).toBe(true);
  expect(r.list.length).toBeGreaterThanOrEqual(Math.min(r.n, 5));
  // look at the nearest marked NPC from 12 m, then from 40 m
  for (const [d, name] of [[7, 'w12-quest-marks-near.png'], [40, 'w12-quest-marks-40m.png']]) {
    // from the side you stand on (so no building is between the camera and the NPC)
    await page.evaluate(({ f, d }) => { const me = tv.state().you, dx = me.x - f.x, dz = me.z - f.z, l = Math.hypot(dx, dz) || 1; tv.fly(f.x + dx / l * d, f.y + 1.9 + d * 0.1, f.z + dz / l * d, f.x, f.y + 1.9, f.z); }, { f: r.first, d });
    await page.waitForTimeout(2500);
    await shot(name);
  }
  await page.evaluate(() => tv.fly(null));
  // a patch removes one
  const gone = await page.evaluate(async () => { const l = thousandvale.questMarks.list(); tv.fake('questMarks', { marks: { [l[0].id]: null } }); await new Promise(r => setTimeout(r, 300)); return { before: l.length, after: thousandvale.questMarks.list().length }; });
  expect(gone.after).toBe(gone.before - 1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('W26: the mount call holds you still (moving does not break it), a second press cancels, and you ride on', async () => {
  test.setTimeout(240000);
  await hook('/teleport', { name: NAME, x: HOME.x + 30, z: HOME.z + 40 });
  const lv = await hook('/level', { name: NAME, level: 5 });
  expect(lv.ok).toBe(true);
  expect((await hook('/mounts', { name: NAME, mounts: ['trail_horse'] })).ok, 'round 11 (#16): the horse is bought, not given — the hook hands one over').toBe(true);
  await page.waitForTimeout(5000);
  const at = () => page.evaluate(() => ({ x: tv.state().you.x, z: tv.state().you.z, held: thousandvale.controls.held, mount: thousandvale.S.self.mount || null, call: !!thousandvale.S.mountCall }));
  // 1. call, then cancel with a second press
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(300);
  let s = await at();
  expect(s.held, 'held from the key press').toBe(true); expect(s.call).toBe(true);
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(900);
  s = await at();
  expect(s.held).toBe(false); expect(s.mount).toBe(null);
  await page.waitForTimeout(1500);
  expect((await at()).mount, 'a cancelled call does not mount you').toBe(null);
  // 2. call while holding W: you stand for the call, then ride on in the direction you were headed
  await page.evaluate(() => { tv.view(9, 0.4, Math.PI * 0.25); });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  // (the call is 1.5 s on the server.) Inside the page: where you stand as the call starts, and how far you ever get from
  // there WHILE it runs — measured every 15 ms, so the ride that follows (you are off at once, W is down) is not counted.
  const call = await page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyH', key: 'h', bubbles: true }));
    const S = thousandvale.S, held0 = thousandvale.controls.held, p0 = { x: S.predictor.pos.x, z: S.predictor.pos.z };
    let far = 0, samples = 0;
    const t0 = performance.now();
    while (!S.self.mount && performance.now() - t0 < 20000) {
      if (S.mountCall) { far = Math.max(far, Math.hypot(S.predictor.pos.x - p0.x, S.predictor.pos.z - p0.z)); samples++; }
      await new Promise(r => setTimeout(r, 15));
    }
    return { held0, far, samples, mounted: !!S.self.mount, ms: performance.now() - t0 };
  });
  expect(call.held0, 'held from the key press, with W down').toBe(true);
  expect(call.mounted, 'the call completes with a move key held the whole time').toBe(true);
  expect(call.samples, "sampled while the call ran (few on a starved renderer)").toBeGreaterThan(0);
  expect(call.far, 'standing still during the call, W held down').toBeLessThan(1.0);
  const c = await at();
  expect(c.held).toBe(false);
  await page.waitForTimeout(1500);
  const d = await at();
  await page.keyboard.up('KeyW');
  expect(Math.hypot(d.x - c.x, d.z - c.z), 'riding on with the key still held').toBeGreaterThan(1.5);
  await page.evaluate(() => tv.view(6, 0.3, thousandvale.controls.cam.yaw + 2.4));
  await page.waitForTimeout(2500);
  await shot('w26-riding-after-the-call.png');
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(1200);
  expect((await at()).mount).toBe(null);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('W5: the ox cart stands by Torborhold\'s gate; a ride seats you on it and rolls away', async () => {
  test.setTimeout(240000);
  await hook('/teleport', { name: NAME, x: CART.x, z: CART.z });
  await page.waitForTimeout(4000);
  // walk the server position onto the cart row itself (zone metres -> world: the stop's world x,z is the town; find the cart entity)
  await page.waitForFunction(() => thousandvale.carts.stats.parked > 0 || [...thousandvale.S.mirror.infos.values()].some(i => i.type === 'cart'), null, { timeout: 30000 }).catch(() => {});
  let cart = await page.evaluate(() => { const c = [...thousandvale.carts.carts.values()].find(c => c.mode === 'parked'); const i = [...thousandvale.S.mirror.ents.values()].map(e => ({ e, info: e.info || thousandvale.S.mirror.infos.get(e.id) })).find(r => r.info?.type === 'cart'); return { drawn: c ? { x: c.x, z: c.z, yaw: c.yaw, built: !!c.v } : null, ent: i ? { x: i.e.x, z: i.e.z, info: i.info } : null, stats: thousandvale.carts.stats }; });
  if (!cart.drawn && !cart.ent) {
    // the cart is further than the entity range from the town centre: go and stand where E put it (ask the server's who is near by walking the ring)
    for (const [dx, dz] of [[120, 0], [-120, 0], [0, 120], [0, -120], [90, 90], [-90, 90], [90, -90], [-90, -90]]) {
      await hook('/teleport', { name: NAME, x: CART.x + dx, z: CART.z + dz });
      await page.waitForTimeout(3500);
      if (await page.evaluate(() => thousandvale.carts.stats.parked > 0)) break;
    }
    cart = await page.evaluate(() => { const c = [...thousandvale.carts.carts.values()].find(c => c.mode === 'parked'); return { drawn: c ? { x: c.x, z: c.z, yaw: c.yaw, built: !!c.v } : null, stats: thousandvale.carts.stats }; });
  }
  expect(cart.drawn, 'the server sends a parked cart near Torborhold and it is drawn').not.toBe(null);
  await hook('/teleport', { name: NAME, x: cart.drawn.x + 3, z: cart.drawn.z + 2 });
  await page.waitForFunction(() => [...thousandvale.carts.carts.values()].some(c => c.mode === 'parked' && c.v), null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(c => { const y = thousandvale.WS.terrain.heightAt(c.x, c.z) || 0; tv.fly(c.x + 6.5, y + 3.2, c.z + 6.5, c.x, y + 0.9, c.z); }, cart.drawn);
  await page.waitForTimeout(3000);
  await shot('w5-ox-cart-parked.png');
  await page.evaluate(c => { const y = thousandvale.WS.terrain.heightAt(c.x, c.z) || 0; tv.fly(c.x - 7, y + 2.2, c.z + 3, c.x, y + 0.9, c.z); }, cart.drawn);
  await page.waitForTimeout(2500);
  await shot('w5-ox-cart-side.png');
  await page.evaluate(() => { tv.fly(null); tv.view(11, 0.5, thousandvale.controls.cam.yaw); tv.perf(true); });
  // the ride (A's message, played through the client's own handler)
  const before = await page.evaluate(() => ({ x: thousandvale.actors.get(tv.state().you.id).pos.x, z: thousandvale.actors.get(tv.state().you.id).pos.z }));
  await page.evaluate(c => tv.fake('cartRide', { to: { id: 'cart_orrinsford', name: 'Orrinsford', x: c.x + 400, z: c.z - 300 }, from: { name: 'Torborhold' }, ms: 7000, fare: 12 }), cart.drawn);
  await page.waitForFunction(() => (thousandvale.carts.ride()?.t || 0) > 2600, null, { timeout: 60000 });
  const mid = await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); return { riding: thousandvale.carts.riding, held: thousandvale.controls.held, x: a.pos.x, y: a.pos.y, z: a.pos.z, ground: thousandvale.WS.terrain.heightAt(a.pos.x, a.pos.z), ride: thousandvale.carts.ride() }; });
  expect(mid.riding).toBe(true); expect(mid.held).toBe(true);
  expect(Math.hypot(mid.x - before.x, mid.z - before.z), 'you are carried along').toBeGreaterThan(2);
  expect(mid.y - mid.ground, 'sat on the bed, not walking beside it').toBeGreaterThan(0.4);
  await shot('w5-ox-cart-ride.png');
  // (the ride runs on the frame clock: slow on a software renderer) the veil closes before the ride is up
  await page.waitForFunction(() => thousandvale.carts.ride()?.veiled === true, null, { timeout: 60000 });
  await page.waitForFunction(() => !thousandvale.carts.riding && !thousandvale.controls.held, null, { timeout: 90000 });
  const perf = await page.evaluate(() => tv.perf());
  expect(perf.newProgramNames, 'the ride links no shader').toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('W19: a backpack is on the back — the three sizes and the rare one', async () => {
  test.setTimeout(240000);
  await hook('/teleport', { name: NAME, x: HOME.x, z: HOME.z });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { tv.setTime(0.5); if (thousandvale.S.self.mount) tv.mount(); });
  const packs = [['sling_satchel', 'g5_pack_satchel', 'normal'], ['trail_rucksack', 'g5_pack_rucksack', 'magic'], ['expedition_pack', 'g5_pack_frame', 'normal'], ['trail_rucksack', 'g5_pack_explorer', 'rare']];
  for (const [base, g5, rarity] of packs) {
    const cape = await page.evaluate(async ({ base, g5, rarity }) => {
      const id = tv.state().you.id, a = thousandvale.actors.get(id);
      await thousandvale.actors.setLook(id, { ...a.look, gear: { chest: { base: 'light_chest', rarity: 'normal' }, legs: { base: 'light_legs', rarity: 'normal' }, feet: { base: 'light_boots', rarity: 'normal' }, back: { base, pack: true, g5, rarity } } });
      for (let i = 0; i < 80 && !thousandvale.actors.get(id).body; i++) await new Promise(r => setTimeout(r, 100));
      const { avatarFor } = await import('./js/client/looks.js');
      return (await avatarFor(thousandvale.actors.get(id).look)).cape;
    }, { base, g5, rarity });
    expect(cape.id).toBe(g5);
    await page.evaluate(() => { const a = thousandvale.actors.get(tv.state().you.id); tv.fly(a.pos.x - Math.sin(a.yaw + 0.6) * 3.1, a.pos.y + 1.7, a.pos.z - Math.cos(a.yaw + 0.6) * 3.1, a.pos.x, a.pos.y + 1.0, a.pos.z); });
    await page.waitForTimeout(2500);
    await shot(`w19-${g5.replace('g5_', '').replace('_', '-')}.png`);
  }
  await page.evaluate(() => tv.fly(null));
  expect(errors, errors.join('\n')).toEqual([]);
});

test('U4 (inherited): the oat field still draws stalks', async () => {
  test.setTimeout(240000);
  await hook('/teleport', { name: NAME, x: 25210.7, z: 5530.6 });
  await page.waitForFunction(() => Math.hypot(tv.state().you.x - 25210.7, tv.state().you.z - 5530.6) < 6, null, { timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => { const p = tv.state().you, y = thousandvale.WS.terrain.heightAt(p.x, p.z) || 0; tv.fly(p.x + 3, y + 2.1, p.z + 3.5, p.x - 2, y + 0.5, p.z - 3); });
  await page.waitForTimeout(3500);
  await shot('w-grain-field-close.png');
  await page.evaluate(() => { const p = tv.state().you, y = thousandvale.WS.terrain.heightAt(p.x, p.z) || 0; tv.fly(p.x + 14, y + 4.2, p.z + 16, p.x - 8, y + 0.4, p.z - 6); });
  await page.waitForTimeout(3000);
  await shot('w-grain-field-edge.png');
  await page.evaluate(() => tv.fly(null));
  expect(errors, errors.join('\n')).toEqual([]);
});
