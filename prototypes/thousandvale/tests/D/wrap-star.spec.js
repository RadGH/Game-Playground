// Wrap-up 2026-10-13 — the Starcaller's visuals (Y32), LOOKED at: the outfit on the creation screen and in the world, a
// thrown star and its burst, a star falling and landing, the gold star-rune zone, Wheeling Stars and the Constellation motes.
// Shots: $WRAP_SHOTS or tests/D/shots/wrap-star-*.png
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/wrap-star.spec.js
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

/** Make a Starcaller the way a player does — name, people, calling, appearance, the first starting kit (Night-Sky Robes) — and enter. */
async function enter(page, name, race) {
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?quality=low&fresh=1&tod=0.5`);
  await page.waitForSelector('#loading.done', { timeout: 300000 });
  if (await page.locator('#new-char').isVisible().catch(() => false)) await page.click('#new-char');
  await page.fill('#name', name);
  await page.click(`#races .chip[data-race="${race}"]`);
  await page.click('#calling-open'); await page.click('#classes [data-cls="starcaller"]'); await page.click('#calling-done');      // feedback #98: the calling picker
  await page.click('#enter');
  await expect(page.locator('#panel-appearance')).toBeVisible({ timeout: 30000 });
  await page.click('#panel-appearance [data-act="save"]');
  await expect(page.locator('#panel-kits')).toBeVisible({ timeout: 30000 });
  await page.waitForFunction(() => Object.keys(thousandvale.actors.get('preview')?.look?.gear || {}).includes('chest'), null, { timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(SHOTS, `wrap-star-kit-${race}.png`) });
  await page.click('#panel-kits [data-act="create"]');
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null && thousandvale.S.phase === 'world', null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  await page.evaluate(() => tv.hud?.(false));
}

test('the creation screen: the Starcaller wears midnight and gold, on two bodies', async ({ browser }) => {
  test.setTimeout(600000);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?quality=low&tod=0.5`);
  await page.waitForSelector('#loading.done', { timeout: 300000 });
  if (await page.locator('#new-char').isVisible().catch(() => false)) await page.click('#new-char');
  await expect(page.locator('#login')).toBeVisible();
  for (const race of ['human', 'dwarf']) {
    await page.click(`#races .chip[data-race="${race}"]`);
    await page.click('#calling-open'); await page.click('#classes [data-cls="starcaller"]'); await page.click('#calling-done');      // feedback #98: the calling picker
    await page.waitForFunction(r => { const a = thousandvale.actors.get('preview'); return a?.look?.cls === 'starcaller' && a.look.race === r && !!a.body; }, race, { timeout: 60000 });
    await page.waitForTimeout(3500);
    const worn = await page.evaluate(async () => { const m = await import(new URL('js/client/looks.js', location.href).href); const av = await m.avatarFor(thousandvale.actors.get('preview').look); return { top: av.top, hat: av.hat }; });
    if (worn) { expect(worn.top.color).toBe('#1c1f4a'); expect(worn.hat.emblem).toBe('star'); }
    await page.screenshot({ path: join(SHOTS, `wrap-star-card-${race}.png`) });
  }
  expect(errors, 'no page errors').toEqual([]);
  await ctx.close();
});

test('in the world: thrown stars, falling stars, the star-rune, wheeling stars, the motes', async ({ browser }) => {
  test.setTimeout(1200000);
  const name = 'Sabelstar';
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'warning' && /\[spells\]/.test(m.text())) errors.push(m.text()); });
  await enter(page, name, 'human');
  const shot = n => page.screenshot({ path: join(SHOTS, `wrap-star-${n}.png`) });
  const go = async (x, z, ms = 5000) => { await hook('/teleport', { name, x, z }); await page.waitForTimeout(ms); };
  // record every fx the rules send, and what the stars made of it
  await page.evaluate(() => { window.__fx = []; const o = thousandvale.spells.onEvent; thousandvale.spells.onEvent = ev => { const k = thousandvale.S.evTick; if (ev.type === 'fx' || ev.type === 'cast') window.__fx.push({ ...ev, at: performance.now(), k }); if (ev.type === 'hit') window.__fx.push({ type: 'hit', skill: ev.skill, ab: ev.ab, n: ev.n, at: performance.now(), k }); return o(ev); }; });

  // ---- the outfit in the world (starter gear), front and three-quarter
  const me = await page.evaluate(() => tv.state().you.id);
  const look = await page.evaluate(id => { const a = thousandvale.actors.get(id); return { cls: a.look?.cls, gear: Object.keys(a.look?.gear || {}), yaw: a.yaw }; }, me);
  expect(look.cls).toBe('starcaller');
  expect(look.gear, 'the starting kit is worn').toEqual(expect.arrayContaining(['chest', 'head']));
  const worn = await page.evaluate(async id => { const m = await import(new URL('js/client/looks.js', location.href).href); const av = await m.avatarFor(thousandvale.actors.get(id).look); return { top: av.top, hat: av.hat }; }, me);
  console.log('worn', JSON.stringify(worn), JSON.stringify(look.gear));
  if (worn) { expect(worn.top.color, 'the starter robe is midnight').toBe('#1c1f4a'); expect(worn.hat.emblem).toBe('star'); }
  for (const [n, off] of [['front', Math.PI], ['quarter', Math.PI * 0.75]]) {
    await page.evaluate(([id, off]) => { const a = thousandvale.actors.get(id); tv.view(3.4, 0.12, a.yaw + off); }, [me, off]);
    await page.waitForTimeout(1500);
    await shot(`world-human-${n}`);
  }

  // ---- a dummy to throw stars at
  await hook('/level', { name, level: 30 }); await page.waitForTimeout(2500);
  let dummies = await page.evaluate(() => [...thousandvale.actors.actors.values()].filter(a => a.creature?.type === 'training_dummy').map(a => ({ id: a.id, x: a.pos.x, z: a.pos.z, yaw: a.yaw })));
  if (!dummies.length) { await go(25140, 5370); dummies = await page.evaluate(() => [...thousandvale.actors.actors.values()].filter(a => a.creature?.type === 'training_dummy').map(a => ({ id: a.id, x: a.pos.x, z: a.pos.z, yaw: a.yaw }))); }
  expect(dummies.length, 'training dummies stand in the first town').toBeGreaterThan(0);
  const d = dummies[0];
  await go(d.x + Math.sin(d.yaw) * 11, d.z + Math.cos(d.yaw) * 11, 5000);
  await page.waitForFunction(id => !!thousandvale.actors.get(id)?.body, d.id, { timeout: 60000 });
  await page.evaluate(([id, yaw]) => { thousandvale.S.target = id; tv.view(9, 0.34, yaw + Math.PI + 0.9); }, [d.id, d.yaw]);
  await page.waitForTimeout(1200);
  const bar = await page.evaluate(() => thousandvale.S.bar.map(b => b?.id || null));
  console.log('bar', JSON.stringify(bar));
  const slotOf = id => bar.indexOf(id) + 1;      // slot 0 is the Attack button
  const programs0 = await page.evaluate(() => tv.state().stats.programs);

  // Star Dart: ONE gold star for the one event, no body from the ordinary pool
  const before = await page.evaluate(() => ({ stars: thousandvale.stars.stats.shots, orbs: tv.shots().fired }));
  await page.evaluate(([s, id]) => tv.cast(s, id), [slotOf('star_dart'), d.id]);
  await page.waitForTimeout(3500);
  console.log('cast said', JSON.stringify(await page.evaluate(() => ({ fx: window.__fx.slice(-12), ev: tv.state().events.slice(-6), target: thousandvale.S.target, mp: thousandvale.S.self.mp, toast: document.querySelector('.toast')?.textContent || null }))).slice(0, 2500));
  const afterDart = await page.evaluate(() => ({ stars: thousandvale.stars.stats.shots, landed: thousandvale.stars.stats.landed, orbs: tv.shots().fired, fx: window.__fx.filter(e => e.type === 'fx').map(e => ({ kind: e.kind, skill: e.skill ?? e.ab, proj: e.proj, ms: e.ms })) }));
  console.log('dart', JSON.stringify(afterDart));
  expect(afterDart.stars - before.stars, 'one star for one dart').toBe(1);
  expect(afterDart.orbs, 'and no arcane orb from the ordinary pool').toBe(before.orbs);
  expect(afterDart.landed).toBeGreaterThan(0);

  // Scattered Stars: one star for each bolt event the rules send
  await page.evaluate(() => { window.__fx.length = 0; });
  const s0 = await page.evaluate(() => thousandvale.stars.stats.shots);
  await page.evaluate(([s, id]) => tv.cast(s, id), [slotOf('star_volley'), d.id]);
  await page.waitForTimeout(2500);
  const volley = await page.evaluate(() => ({ stars: thousandvale.stars.stats.shots, bolts: window.__fx.filter(e => e.kind === 'bolt').length }));
  console.log('volley', JSON.stringify(volley));
  expect(volley.bolts).toBeGreaterThanOrEqual(1);
  expect(volley.stars - s0, 'a star for every bolt event').toBe(volley.bolts);

  // Called Star: the star lands when the damage does
  await page.evaluate(() => { window.__fx.length = 0; });
  await page.evaluate(([s, id]) => tv.cast(s, id), [slotOf('called_star'), d.id]);
  await page.waitForFunction(() => thousandvale.stars.stats.lastFall?.landedAfter != null, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const called = await page.evaluate(() => { const f = window.__fx; const sky = f.find(e => e.kind === 'skyfall'), hit = f.find(e => e.type === 'hit' && e.ab === 'called_star'); return { sky: sky && { ms: sky.ms, r: sky.r, skill: sky.skill }, last: thousandvale.stars.stats.lastFall, hitAfter: hit && sky ? Math.round(hit.at - sky.at) : null, ticks: hit && sky ? hit.k - sky.k : null, kinds: f.filter(e => e.type === 'fx').map(e => e.kind + ':' + (e.skill ?? e.ab ?? '')) }; });
  console.log('called', JSON.stringify(called));
  expect(called.sky?.ms, 'the rules say when it lands').toBe(1000);
  expect(called.last.landMs).toBe(1000);
  // never early; late only by the frame it lands in (this headless page draws about two frames a second — the exact time is pinned in wrap-star.test.js)
  expect(called.last.landedAfter, 'not before the damage').toBeGreaterThanOrEqual(1000);
  expect(called.last.landedAfter, 'and on the first frame after it').toBeLessThan(2500);
  // (the number's own event is handled whenever this page's two-frames-a-second loop lets it in, so the gap between the
  // two is only logged here; that both run off the same `ms` is the rules' test and wrap-star.test.js)
  expect(called.hitAfter, 'and the star\'s own damage number did arrive').toBeGreaterThan(0);
  expect(Math.abs(called.ticks * 50 - 1000), 'on the server\'s own clock the damage is the announced second after the star, to the tick').toBeLessThanOrEqual(50);

  // Star Field, Wheeling Stars, Heavens' Barrage: each is drawn by the stars
  for (const id of ['star_field', 'wheeling_stars', 'sky_barrage']) {
    await page.evaluate(() => { window.__fx.length = 0; });
    await page.evaluate(([s, t]) => tv.cast(s, t), [slotOf(id), d.id]);
    await page.waitForTimeout(id === 'sky_barrage' ? 5200 : 1800);
    const r = await page.evaluate(() => ({ kinds: window.__fx.filter(e => e.type === 'fx').map(e => e.kind + ':' + (e.skill ?? e.ab ?? '') + (e.ms != null ? '@' + e.ms : '') + (e.r != null ? ' r' + e.r : '')), stats: { ...thousandvale.stars.stats, lastFall: null, lastShot: null }, live: thousandvale.stars.live() }));
    console.log(id, JSON.stringify(r));
    if (id === 'star_field') { expect(r.stats.zones, 'the field is a star-rune').toBeGreaterThan(0); await shot('field-live'); }
    if (id === 'wheeling_stars') { expect(r.stats.orbs).toBeGreaterThan(0); await shot('wheeling-live'); }
    if (id === 'sky_barrage') expect(r.stats.falls, 'ten stars fell').toBeGreaterThanOrEqual(11);
  }
  const res = await page.evaluate(() => ({ res: thousandvale.ui10.classRes.state, motes: thousandvale.stars.live().motes, flares: thousandvale.stars.stats.flares }));
  console.log('starlight', JSON.stringify(res));

  // 20 casts add no shader program
  for (let i = 0; i < 20; i++) { await page.evaluate(([s, id]) => tv.cast(s, id), [slotOf('star_dart'), d.id]); await page.waitForTimeout(350); }
  const programs1 = await page.evaluate(() => tv.state().stats.programs);
  console.log('programs', programs0, programs1);
  expect(programs1, 'no shader was linked by a star').toBe(programs0);
  // (both read in ONE look, and given a few seconds to settle: a cast still landing changes Starlight between two looks)
  const both = () => page.evaluate(id => ({ motes: thousandvale.stars.live().motes[id] || 0, starlight: thousandvale.ui10.classRes.state?.n ?? null }), me);
  console.log('motes', JSON.stringify(await both()));
  await expect.poll(async () => { const b = await both(); return b.starlight == null ? 0 : b.motes - Math.min(5, b.starlight); }, { message: 'a mote for each Starlight', timeout: 8000 }).toBe(0);

  // ---- staged, on a clock the spec holds: slowed twentyfold and STOPPED at the moment to be looked at (this headless
  // page draws about two frames a second, and a starburst lasts a quarter of one). The drawing is the game's own.
  await page.waitForTimeout(13000);                                  // let the real zones and wheels run out
  await page.evaluate(() => {
    const S = thousandvale.stars;
    window.__clk = { rate: 1, base: performance.now(), at: performance.now(), now() { return this.at + (performance.now() - this.base) * this.rate; }, set(r) { this.at = this.now(); this.base = performance.now(); this.rate = r; } };
    S.setClock(() => window.__clk.now());
    /** Stop the stars' clock `after` ms (their time) after `pred()` first holds. */
    window.__stopWhen = (pred, after = 0) => new Promise(res => { let hit = null; const tick = () => { if (hit == null && pred()) hit = window.__clk.now(); if (hit != null && window.__clk.now() - hit >= after) { window.__clk.set(0); res(true); return; } requestAnimationFrame(tick); }; tick(); });
  });
  const slow = () => page.evaluate(() => window.__clk.set(0.05));
  // open ground behind the dummies (a market stall stands between them and where the real casts were thrown from)
  const f = { x: Math.sin(d.yaw), z: Math.cos(d.yaw) }, side = { x: f.z, z: -f.x };
  const G = { x: d.x - f.x * 6, z: d.z - f.z * 6 };
  await go(G.x, G.z, 4000);
  await page.evaluate(() => { thousandvale.S.target = null; });
  const camYaw = d.yaw + Math.PI;                                    // looking on past the dummies, away from the square
  const T1 = { x: G.x - f.x * 5 + side.x * 4, z: G.z - f.z * 5 + side.z * 4 };
  const T2 = { x: G.x - f.x * 9, z: G.z - f.z * 9 };
  const close = async (n, pick) => {
    const sp = await page.evaluate(pick => { const L = thousandvale.stars.live(), s = pick === 'fall' ? L.falls[0] : L.shots[0]; if (!s) return null; const v = thousandvale.camera.position.clone().set(s.x, s.y, s.z).project(thousandvale.camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, k: s.k }; }, pick);
    console.log(n, 'on screen', JSON.stringify(sp));
    if (sp && sp.x > 0 && sp.x < 1100 && sp.y > 0 && sp.y < 700) await page.screenshot({ path: join(SHOTS, `wrap-star-${n}.png`), clip: { x: Math.max(0, Math.min(1100 - 300, sp.x - 150)), y: Math.max(0, Math.min(700 - 240, sp.y - 120)), width: 300, height: 240 } });
    return sp;
  };
  // (a) a star in flight, then its burst
  await page.evaluate(yaw => tv.view(7, 0.3, yaw), camYaw);
  await page.waitForTimeout(1500);
  await slow();
  await page.evaluate(([id, T, G]) => { window.__n = thousandvale.stars.stats.landed; tv.fxEvent({ type: 'fx', kind: 'bolt', id, skill: 'star_dart', proj: 'star', element: 'arcane', from: G, to: T, ms: 600 }); }, [me, T1, G]);
  await page.evaluate(() => window.__stopWhen(() => (thousandvale.stars.live().shots[0]?.k ?? 0) >= 0.5));
  await page.waitForTimeout(1200);
  const inFlight = await close('dart-close');
  expect(inFlight, 'a star is in the air').toBeTruthy();
  await shot('dart-flight');
  await slow();
  await page.evaluate(() => window.__stopWhen(() => thousandvale.stars.stats.landed > window.__n, 70));
  await page.waitForTimeout(1200); await shot('dart-burst');
  await slow(); await page.waitForTimeout(3000);
  await page.evaluate(([id, T, G, side]) => { for (let k = 0; k < 3; k++) tv.fxEvent({ type: 'fx', kind: 'bolt', id, skill: 'star_volley', proj: 'star', element: 'arcane', from: G, to: { x: T.x + (k - 1) * 2.4 * side.x, z: T.z + (k - 1) * 2.4 * side.z }, ms: 600 + k * 40 }); }, [me, T1, G, side]);
  await page.evaluate(() => window.__stopWhen(() => (thousandvale.stars.live().shots[0]?.k ?? 0) >= 0.6));
  await page.waitForTimeout(1200); await shot('volley-flight');
  await page.evaluate(() => window.__clk.set(1));
  await page.waitForFunction(() => thousandvale.stars.live().shots.length === 0, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  // (b) a called star mid-fall and landing
  await page.evaluate(yaw => tv.view(13, 0.32, yaw), camYaw);
  await page.waitForTimeout(1500);
  await slow();
  await page.evaluate(([id, t]) => { window.__n = thousandvale.stars.stats.fallsLanded; tv.fxEvent({ type: 'fx', kind: 'skyfall', id, skill: 'called_star', proj: 'skystar', el: 'arcane', to: t, r: 5, ms: 1000 }); }, [me, T2]);
  await page.evaluate(() => window.__stopWhen(() => (thousandvale.stars.live().falls[0]?.k ?? 0) >= 0.9));
  await page.waitForTimeout(1200); await shot('called-fall'); await close('called-close', 'fall');
  await slow();
  await page.evaluate(() => window.__stopWhen(() => thousandvale.stars.stats.fallsLanded > window.__n, 90));
  await page.waitForTimeout(1200); await shot('called-land');
  await slow();
  await page.evaluate(() => { const t = window.__clk.now(); return window.__stopWhen(() => window.__clk.now() - t >= 200); });
  await page.waitForTimeout(1200); await shot('called-land2');
  await page.evaluate(() => window.__clk.set(1)); await page.waitForTimeout(2500);
  // a barrage, several in the air and landing
  await slow();
  await page.evaluate(([id, t]) => { tv.fxEvent({ type: 'fx', kind: 'spell', id, ab: 'sky_barrage', el: 'arcane', shape: 'ground', to: t, r: 9, n: 10 }); for (let k = 0; k < 6; k++) tv.fxEvent({ type: 'fx', kind: 'skyfall', id, skill: 'sky_barrage', proj: 'skystar', el: 'arcane', to: { x: t.x + Math.cos(k * 2.4) * (2 + k), z: t.z + Math.sin(k * 2.4) * (2 + k) }, r: 2.4, ms: 350 + k * 110, n: k + 1, of: 10 }); }, [me, T2]);
  await page.evaluate(() => { const n = thousandvale.stars.stats.fallsLanded; return window.__stopWhen(() => thousandvale.stars.stats.fallsLanded >= n + 2, 60); });
  await page.waitForTimeout(1200); await shot('barrage');
  await page.evaluate(() => window.__clk.set(1)); await page.waitForTimeout(6000);
  // (c) the gold zone, from the side and from above; then carried by its owner
  await page.evaluate(yaw => tv.view(13, 0.5, yaw), camYaw);
  await page.evaluate(m => tv.fxEvent({ type: 'fx', kind: 'place', obj: 990001, skill: 'star_field', x: m.x, z: m.z, r: 6, seconds: 60, element: 'arcane' }), T2);
  await page.waitForTimeout(2600); await shot('zone');
  await page.evaluate(yaw => tv.view(14, 1.25, yaw), camYaw);
  await page.waitForTimeout(1500); await shot('zone-top');
  const z0 = await page.evaluate(() => thousandvale.stars.live().zones);
  expect(z0.length).toBe(1);
  await page.evaluate(() => tv.fxEvent({ type: 'fx', kind: 'unplace', obj: 990001 }));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => thousandvale.stars.live().zones.length), 'unplace takes the rune away').toBe(0);
  // a carried field follows its owner wherever the owner is drawn
  await page.evaluate(([id, P]) => tv.fxEvent({ type: 'fx', kind: 'place', obj: 990002, skill: 'star_field', x: P.x, z: P.z, r: 6, seconds: 60, element: 'arcane', follow: id }), [me, G]);
  await go(G.x + side.x * 4, G.z + side.z * 4, 3000);
  const carried = await page.evaluate(id => { const a = thousandvale.actors.get(id), z = thousandvale.stars.live().zones[0]; return { dx: z.x - a.pos.x, dz: z.z - a.pos.z }; }, me);
  expect(Math.hypot(carried.dx, carried.dz), 'the carried field is under its owner').toBeLessThan(0.05);
  await page.evaluate(yaw => tv.view(11, 0.6, yaw), camYaw); await page.waitForTimeout(1500); await shot('zone-carried');
  await page.evaluate(() => tv.fxEvent({ type: 'fx', kind: 'unplace', obj: 990002 }));
  // (d) the motes: three, then five, then spent
  await page.evaluate(yaw => tv.view(4.2, 0.12, yaw + 2.6), camYaw);
  await page.evaluate(() => thousandvale.ui10.classRes.set([{ id: 'starlight', n: 3, max: 5 }]));
  await page.waitForTimeout(1500); await shot('motes-3');
  await page.evaluate(() => thousandvale.ui10.classRes.set([{ id: 'starlight', n: 5, max: 5 }]));
  await page.waitForTimeout(1500); await shot('motes-5');
  await slow();
  const f0 = await page.evaluate(() => thousandvale.stars.stats.flares);
  await page.evaluate(() => thousandvale.ui10.classRes.set([{ id: 'starlight', n: 0, max: 5 }]));
  await page.evaluate(() => { const t = window.__clk.now(); return window.__stopWhen(() => window.__clk.now() - t >= 110); });
  await page.waitForTimeout(1200); await shot('motes-spent');
  await page.evaluate(() => window.__clk.set(1));
  expect(await page.evaluate(() => thousandvale.stars.stats.flares), 'spending them flares').toBe(f0 + 1);
  // Wheeling Stars
  await page.evaluate(id => tv.fxEvent({ type: 'fx', kind: 'orbs', id, count: 3, seconds: 12, element: 'arcane' }), me);
  await page.waitForTimeout(1500); await shot('wheeling');
  expect(errors, 'no page errors, no spell warnings').toEqual([]);
  await ctx.close();
});

test('in the world: a dwarf Starcaller in starter robes', async ({ browser }) => {
  test.setTimeout(600000);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage();
  await enter(page, 'Durnstar', 'dwarf');
  const me = await page.evaluate(() => tv.state().you.id);
  for (const [n, off] of [['front', Math.PI], ['quarter', Math.PI * 0.75]]) {
    await page.evaluate(([id, off]) => { const a = thousandvale.actors.get(id); tv.view(3.2, 0.12, a.yaw + off); }, [me, off]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS, `wrap-star-world-dwarf-${n}.png`) });
  }
  await ctx.close();
});
