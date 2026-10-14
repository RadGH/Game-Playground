// Wrap-up, 3D client (2026-10-13) — LOOK at the round 10 leftovers: Y5 emotes (real, through the server), Y20 the held
// beam, Y25 a carried zone, Y12 a wind-up that moves, Y4 fish pools, Y3 no stars over a corpse, Y8 corpse picking, Y2 the
// farm plot of report #42. Shots: $WRAP_SHOTS or tests/D/shots/wrap-3d-*.png
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/wrap-3d.spec.js
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

test('wrap-up, 3D client: emotes, the held beam, a carried zone, a moved wind-up, pools, corpses, the farm plot', async ({ browser }) => {
  test.setTimeout(1200000);
  const name = 'Wrapthree';
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=stormcaller&quality=low&tod=0.5`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  const go = async (x, z, ms = 6000) => { await hook('/teleport', { name, x, z }); await page.waitForTimeout(ms); };
  const shot = n => page.screenshot({ path: join(SHOTS, `wrap-3d-${n}.png`) });
  // a software renderer draws a few frames a second and a body's clock is capped per frame, so a clip has hardly begun
  // when its wall-clock time is half gone: step the body's own clock on for the picture
  const pose = (id, seconds) => page.evaluate(([i, s]) => { const a = thousandvale.actors.get(i); for (let k = 0; k < Math.round(s / 0.04); k++) a.body.update(0.04, performance.now() / 1000 + k * 0.04); }, [id, seconds]);
  // open ground a little way out of the first town, facing +z
  await go(25075, 5300, 7000);
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  const me = await page.evaluate(() => tv.state().you.id);      // (a jump can hand the body a new id)
  await page.evaluate(() => { tv.hud(false); tv.view(6, 0.3, Math.PI); thousandvale.controls.setFacing(0); });
  await page.waitForTimeout(1500);

  // ---- Y5: emotes, sent to the real server and played from its event --------------------------------------
  await page.evaluate(() => thousandvale.S.net.emote('dance'));
  await page.waitForFunction(id => thousandvale.actors.get(id).emote === 'dance' && thousandvale.actors.get(id).anim === 'dance', me, { timeout: 15000 });
  await pose(me, 0.9);
  await shot('dance');
  // a step ends it, here at once and on the server (`end: 1`)
  const p0 = await page.evaluate(() => tv.state().you);
  await page.evaluate(([x, z]) => tv.walkTo(x, z + 5), [p0.x, p0.z]);
  await page.waitForFunction(id => thousandvale.actors.get(id).emote == null && /walk|run/.test(thousandvale.actors.get(id).anim), me, { timeout: 15000 });
  await page.waitForFunction(() => tv.state().events.some(e => e.type === 'emote' && e.e === 'dance' && e.end), null, { timeout: 15000 });
  await page.evaluate(() => tv.stop());
  await page.waitForTimeout(2500);
  await page.evaluate(() => thousandvale.S.net.emote('wave'));
  await page.waitForFunction(id => thousandvale.actors.get(id).anim === 'wave', me, { timeout: 15000 });
  await page.evaluate(id => { thousandvale.actors.get(id).oneShotUntil = performance.now() + 120000; }, me);     // (held for the picture: a frame takes about a second on this renderer)
  await pose(me, 0.8);
  await shot('wave');
  await page.evaluate(id => { thousandvale.actors.get(id).oneShotUntil = performance.now() + 400; }, me);
  await page.waitForFunction(id => thousandvale.actors.get(id).anim !== 'wave', me, { timeout: 20000 });
  expect(await page.evaluate(id => thousandvale.actors.get(id).anim, me), 'the wave is over by itself').not.toBe('wave');
  await page.evaluate(() => thousandvale.S.net.emote('bow'));
  await page.waitForFunction(id => thousandvale.actors.get(id).anim === 'bowGreet', me, { timeout: 15000 });
  await page.evaluate(id => { thousandvale.actors.get(id).oneShotUntil = performance.now() + 120000; }, me);
  await pose(me, 0.8);
  await shot('bow');
  await page.evaluate(id => { thousandvale.actors.get(id).oneShotUntil = performance.now() + 400; }, me);
  await page.waitForFunction(id => thousandvale.actors.get(id).anim !== 'bowGreet', me, { timeout: 20000 });

  // ---- Y20: the held beam (the rules' own events, played through the client's handlers) ----------------------
  const links0 = await page.evaluate(() => thousandvale.view.renderer.info.programs.length);
  const at = await page.evaluate(() => tv.state().you);
  await page.evaluate(([id, x, z]) => { tv.view(11, 0.42, Math.PI * 0.72); tv.fxEvent({ type: 'fx', kind: 'beam', id, skill: 'storm_beam', el: 'lightning', x, z, yaw: 0, len: 30, w: 2.4, ms: 60000, pulses: 6, every: 400 }); }, [me, at.x, at.z]);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => thousandvale.spells.beams.count)).toBe(1);
  await shot('beam-held');
  // a pulse: the flare lasts 0.3 s, so hold the clock on it for the picture (a software renderer draws a few frames a second)
  const flare = await page.evaluate(id => { tv.fxEvent({ type: 'fx', kind: 'beamPulse', id, skill: 'storm_beam', n: 2, of: 6 }); const B = thousandvale.spells.beams, b = B.book.live.get(id); const now = performance.now(); b.pulseAt = now + 600000; B.book.flare = () => 1; return b.n; }, me);
  expect(flare).toBe(2);
  await page.waitForTimeout(900);
  await shot('beam-pulse');
  // its pulse's own line turns it and a wall cuts it short; the per-pulse flash is not drawn on top
  const areas0 = await page.evaluate(() => thousandvale.spells.stats.areas);
  await page.evaluate(([id, x, z]) => tv.fxEvent({ type: 'fx', kind: 'spell', id, ab: 'storm_beam', el: 'lightning', shape: 'beam', x, z, to: { x: x + 10, z: z + 10 }, w: 2.4, len: 14.1 }), [me, at.x, at.z]);
  await page.waitForTimeout(900);
  const turned = await page.evaluate(id => { const b = thousandvale.spells.beams.book.live.get(id); return { yaw: b.yaw, len: b.len, areas: thousandvale.spells.stats.areas }; }, me);
  expect(Math.abs(turned.yaw - Math.PI / 4)).toBeLessThan(0.01); expect(Math.abs(turned.len - 14.14)).toBeLessThan(0.1);
  expect(turned.areas, 'no second flash for a pulse of a held beam').toBe(areas0);
  await shot('beam-turned');
  await page.evaluate(id => tv.fxEvent({ type: 'fx', kind: 'beamEnd', id, skill: 'storm_beam', why: 'done' }), me);
  await page.waitForFunction(() => thousandvale.spells.beams.count === 0, null, { timeout: 10000 });
  const rigsShown = await page.evaluate(() => thousandvale.spells.beams.group.children.filter(g => g.visible).length);
  expect(rigsShown, 'nothing of the beam is left on screen').toBe(0);
  // a second beam re-uses the first one's rig, and none of it linked a shader program in play
  await page.evaluate(([id, x, z]) => tv.fxEvent({ type: 'fx', kind: 'beam', id, skill: 'storm_beam', el: 'lightning', x, z, yaw: 1, len: 30, w: 2.4, ms: 500, pulses: 2, every: 400 }), [me, at.x, at.z]);
  await page.waitForFunction(() => thousandvale.spells.beams.count === 0, null, { timeout: 15000 });      // no `beamEnd`: it ends itself
  const b1 = await page.evaluate(() => ({ rigs: thousandvale.spells.beams.stats.rigs, links: thousandvale.view.renderer.info.programs.length }));
  expect(b1.rigs, 'one rig, used twice').toBe(1);
  expect(b1.links, 'the beam compiled nothing new after the boot warm-up').toBe(links0);

  // ---- Y25: a carried zone (Blessed Earth with Moving Light) ------------------------------------------------
  await page.evaluate(() => tv.view(13, 0.6, Math.PI));
  const z0 = await page.evaluate(() => tv.state().you);
  await page.evaluate(([id, x, z]) => tv.fxEvent({ type: 'fx', kind: 'place', obj: 990001, skill: 'blessed_earth', id, x, z, r: 6.5, seconds: 60, element: 'holy', follow: id }), [me, z0.x, z0.z]);
  await page.waitForTimeout(1500);
  await shot('zone-cast');
  await page.evaluate(([x, z]) => tv.walkTo(x + 9, z + 9), [z0.x, z0.z]);
  await page.waitForFunction(([x, z]) => Math.hypot(tv.state().you.x - x, tv.state().you.z - z) > 11, [z0.x, z0.z], { timeout: 30000 });
  await page.evaluate(() => tv.stop());
  await page.waitForTimeout(1200);
  const carried = await page.evaluate(([id, x, z]) => { const zn = thousandvale.spells.zones.get(990001), a = thousandvale.actors.get(id); const e = zn.entries.find(q => !q.ended && q.obj); return { off: e ? { x: e.obj.position.x, z: e.obj.position.z } : null, moved: { x: a.pos.x - x, z: a.pos.z - z }, live: zn.entries.filter(q => !q.ended).length }; }, [me, z0.x, z0.z]);
  expect(carried.live, 'the zone is still burning').toBeGreaterThan(0);
  expect(Math.hypot(carried.off.x - carried.moved.x, carried.off.z - carried.moved.z), 'the drawing moved exactly as far as its owner').toBeLessThan(0.05);
  expect(Math.hypot(carried.moved.x, carried.moved.z)).toBeGreaterThan(10);
  await shot('zone-carried');
  // one that does not follow stays where it was cast
  await page.evaluate(([id, x, z]) => { tv.fxEvent({ type: 'fx', kind: 'unplace', obj: 990001 }); tv.fxEvent({ type: 'fx', kind: 'place', obj: 990002, skill: 'blessed_earth', id, x, z, r: 4, seconds: 6, element: 'holy' }); }, [me, z0.x, z0.z]);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => { const zn = thousandvale.spells.zones.get(990002); return zn.follow ? 'follows' : zn.entries.every(e => !e.obj || e.obj.position.length() === 0) ? 'stays' : 'moved'; })).toBe('stays');
  await page.evaluate(() => tv.fxEvent({ type: 'fx', kind: 'unplace', obj: 990002 }));

  // ---- Y12: a wind-up that is knocked back ---------------------------------------------------------------
  const t0 = await page.evaluate(() => tv.state().you);
  await page.evaluate(([x, z]) => { tv.view(14, 0.75, 0); tv.fxEvent({ type: 'tele', id: 880001, s: 880000, ab: 'breath', k: 'cone', shape: 'cone', el: 'fire', x: x - 4, z: z + 12, yaw: Math.PI, r: 9, arc: 1.2, ms: 600000 }); }, [t0.x, t0.z]);
  await page.waitForTimeout(1500);
  await shot('tele-before');
  await page.evaluate(([x, z]) => tv.fxEvent({ type: 'teleM', id: 880001, x: x + 5, z: z + 15 }), [t0.x, t0.z]);
  await page.waitForTimeout(1500);
  const moved = await page.evaluate(([x, z]) => { const t = thousandvale.tele.live.get(880001); t.mesh.geometry.computeBoundingSphere(); return { dx: t.x - (x + 5), dz: t.z - (z + 15), cx: t.mesh.geometry.boundingSphere.center.x - x }; }, [t0.x, t0.z]);
  expect(Math.abs(moved.dx) + Math.abs(moved.dz), 'the shape is where the knock put it').toBeLessThan(0.01);
  expect(moved.cx, 'and the mesh itself is over there').toBeGreaterThan(2);
  await shot('tele-moved');
  await page.evaluate(() => { tv.fxEvent({ type: 'tele', id: 880002, s: 880000, ab: 'slam', k: 'circle', shape: 'circle', x: tv.state().you.x, z: tv.state().you.z + 6, r: 4, ms: 600000 }); tv.fxEvent({ type: 'fx', kind: 'interrupt', id: 880000, by: 'knock' }); });
  expect(await page.evaluate(() => thousandvale.tele.count), 'an interrupt takes every wind-up of that monster away the same frame').toBe(0);

  // ---- Y4: fish pools — ripples only, a marker on the top tier -------------------------------------------
  await page.evaluate(() => { tv.view(9, 0.35, 0); tv.fishDemo({ pool: 'demo:plain', tier: 1, dx: -9, dz: 20 }); tv.fishDemo({ pool: 'demo:busy', tier: 2, dx: 0, dz: 24 }); tv.fishDemo({ pool: 'demo:deep', tier: 3, dx: 9, dz: 20 }); });
  await page.waitForTimeout(2500);
  const pools = await page.evaluate(() => ['demo:plain', 'demo:busy', 'demo:deep'].map(k => { const p = thousandvale.angling.pools.get(k); return { tier: p.tier, shaft: !!p.glint, shown: !!p.glint?.visible, rings: p.rings.filter(m => m.visible).length }; }));
  expect(pools.map(p => p.shaft)).toEqual([false, false, true]);
  expect(pools.every(p => p.rings === 3), 'every pool has its ripples').toBe(true);
  expect(pools[2].shown).toBe(true);
  await shot('pools');
  await page.evaluate(() => { for (const k of ['demo:plain', 'demo:busy', 'demo:deep']) thousandvale.angling.removePool(k); });

  // ---- Y3 + Y8: a corpse — no stars on it, not there to click once emptied -------------------------------
  const c0 = await page.evaluate(() => tv.state().you);
  await page.evaluate(([x, z]) => {
    const A = thousandvale.actors, y = thousandvale.WS.terrain.heightAt(x, z + 5);
    A.add({ id: 'wrap:corpse', kind: 'monster', name: 'Moor Hound', level: 3, hp: 30, hpMax: 30, hostile: true, creature: { type: 'wolf', seed: 5 }, x: x + 2.5, y: thousandvale.WS.terrain.heightAt(x + 2.5, z + 5), z: z + 5, yaw: 1 });
    A.add({ id: 'wrap:live', kind: 'monster', name: 'Moor Hound', level: 3, hp: 30, hpMax: 30, hostile: true, creature: { type: 'wolf', seed: 9 }, x: x + 4.6, y: thousandvale.WS.terrain.heightAt(x + 4.6, z + 9), z: z + 9, yaw: 3 });
    tv.view(7, 0.35, 0);
    const gy = thousandvale.WS.terrain.heightAt(x + 2.5, z + 5); tv.fly(x + 0.6, gy + 1.9, z + 1.6, x + 2.5, gy + 0.6, z + 5);      // close on the first hound
  }, [c0.x, c0.z]);
  await page.waitForFunction(() => !!thousandvale.actors.get('wrap:corpse')?.body && !!thousandvale.actors.get('wrap:live')?.body, null, { timeout: 60000 });
  // stunned, alive: the stars are there
  // (the server's own word that it is stunned, as `info.st` — without it the sync would take the aura off again after its 1.5 s grace)
  await page.evaluate(() => { thousandvale.S.mirror.infos.set('wrap:corpse', { st: ['stun'] }); tv.fxEvent({ type: 'fx', kind: 'status', id: 'wrap:corpse', status: 'stun', on: true }); });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => thousandvale.spells.fx.statusesOn(thousandvale.actors.get('wrap:corpse').group))).toEqual(['stun']);
  await shot('stars-alive');
  // it dies; the killing blow's own stun arrives AFTER the death (the order that left the stars up)
  await page.evaluate(() => { thousandvale.S.mirror.infos.delete('wrap:corpse'); tv.fxEvent({ type: 'die', d: 'wrap:corpse', by: tv.state().you.id }); tv.fxEvent({ type: 'fx', kind: 'status', id: 'wrap:corpse', status: 'stun', on: true }); });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => thousandvale.spells.fx.statusesOn(thousandvale.actors.get('wrap:corpse').group)), 'nothing circles a corpse').toEqual([]);
  // even an aura something else put there is taken off within a quarter of a second
  await page.evaluate(() => thousandvale.spells.fx.status(thousandvale.actors.get('wrap:corpse').group, 'stun', true));
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => thousandvale.spells.fx.statusesOn(thousandvale.actors.get('wrap:corpse').group))).toEqual([]);
  await page.evaluate(() => { thousandvale.actors.get('wrap:corpse').deathAt = performance.now(); });      // (a fresh corpse for the picture: the waits above are most of the 9 s a body lies)
  await page.waitForTimeout(1500);
  await shot('corpse');
  await page.evaluate(() => tv.fly(null));
  await page.waitForTimeout(1500);
  // Y8: the cursor on the corpse, a live hound behind it on the same line
  const pick = await page.evaluate(() => {
    const A = thousandvale.actors, c = A.get('wrap:corpse'), cam = thousandvale.camera, me = tv.state().you.id;
    c.deathAt = performance.now(); c.fade = 1; c.group.position.copy(c.pos);
    // the live hound goes 4 m behind the corpse on the camera's own line of sight
    { const L = A.get('wrap:live'), dx = c.pos.x - cam.position.x, dz = c.pos.z - cam.position.z, d = Math.hypot(dx, dz); L.pos.set(c.pos.x + dx / d * 4, thousandvale.WS.terrain.heightAt(c.pos.x + dx / d * 4, c.pos.z + dz / d * 4), c.pos.z + dz / d * 4); L.group.position.copy(L.pos); }       // (a fresh corpse: the pictures above took longer than the 9 s a body lies before it sinks)
    const v = c.group.position.clone(); v.y += 0.35; v.project(cam);
    const ndc = { x: v.x, y: v.y }, id = a => (a ? a.id : null);
    const out = { empty: id(A.pickAt(ndc, { exclude: me })) };
    c.lootMark = 'magic'; out.loot = id(A.pickAt(ndc, { exclude: me }));
    A.setDead('wrap:live', true); out.bothDeadLoot = id(A.pickAt(ndc, { exclude: me }));
    c.lootMark = null; out.bothEmpty = id(A.pickAt(ndc, { exclude: me }));
    A.setDead('wrap:live', false);
    return out;
  });
  expect(pick.empty, 'an emptied corpse: the click goes through it (to the live hound behind, or the ground)').not.toBe('wrap:corpse');
  expect(pick.loot, 'a corpse with loot, a live enemy behind it: the live one').not.toBe('wrap:corpse');
  expect(pick.bothDeadLoot, 'the only thing with anything on it').toBe('wrap:corpse');
  expect(pick.bothEmpty).toBe(null);
  // the corpse sinks away after its time: its whole group goes with it (this is where the stars used to hang on)
  await page.evaluate(() => { const a = thousandvale.actors.get('wrap:corpse'); a.deathAt = performance.now() - 20000; });
  await page.waitForFunction(() => thousandvale.actors.get('wrap:corpse').group.visible === false, null, { timeout: 15000 });
  await page.evaluate(() => { thousandvale.actors.remove('wrap:corpse'); thousandvale.actors.remove('wrap:live'); });

  // ---- Y2: the farm plot of report #42 (x 25022.9 z 5384.2) ----------------------------------------------
  await go(25022.9, 5384.2, 9000);
  const farm = await page.evaluate(() => {
    const H = (x, z) => thousandvale.WS.terrain.heightAt(x, z), me = tv.state().you;
    const scene = thousandvale.actors.get(me.id).group.parent;
    const M = new (scene.matrix.constructor)(), out = { pieces: 0, worst: 0, long: 0, slope: 0, near: null };
    const P = scene.position.constructor;
    scene.traverse(o => {
      if (!o.isInstancedMesh || o.name !== 'sp-box') return;
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, M); M.premultiply(o.matrixWorld);
        const e = M.elements, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
        if (sy > 0.4 || sx > 1.2 || sx < 0.2) continue;                     // low and narrow (not a rail): a strip of soil
        const base = new P(0, 0, 0).applyMatrix4(M); if (Math.abs(base.y - H(base.x, base.z) + 0.11) > 0.3) continue;   // lying on the ground (not a wall's capstone)
        if (Math.hypot(e[12] - me.x, e[14] - me.z) > 60) continue;
        if (sz < 1.2) continue;
        out.pieces++; if (sz > 2.7) out.long++;                              // (a strip on even ground is ONE tipped box: drapeJoin)
        // its TOP face against the ground under it, at the corners and every ~metre along both edges: the top is `sy`
        // over the base, and the base is sunk 0.11 m. Whatever its length, it may not float or dig in anywhere.
        const pts = []; for (let k = 0, n = Math.max(1, Math.ceil(sz)); k <= n; k++) pts.push([-0.5, k / n - 0.5], [0.5, k / n - 0.5]);
        for (const [lx, lz] of pts) {
          const v = new P(lx, 1, lz).applyMatrix4(M), g = H(v.x, v.z), over = v.y - g;
          out.worst = Math.max(out.worst, Math.abs(over - (sy - 0.11)));
          out.slope = Math.max(out.slope, Math.abs(H(e[12], e[14]) - g));
        }
        if (!out.near || Math.hypot(e[12] - me.x, e[14] - me.z) < out.near.d) out.near = { d: Math.hypot(e[12] - me.x, e[14] - me.z), x: e[12], z: e[14] };
      }
    });
    return out;
  });
  console.log('[farm]', JSON.stringify(farm));
  expect(farm.pieces, 'soil strips are drawn near the reported spot').toBeGreaterThan(50);
  expect(farm.worst, 'along its whole length every strip is within 10 cm of where the ground says it should be').toBeLessThan(0.10);
  // look along the plot from low down, two ways (a strip in the air or under the turf shows at once from here)
  const n = farm.near || { x: 25022.9, z: 5384.2 };
  const G = (x, z) => page.evaluate(([a, b]) => thousandvale.WS.terrain.heightAt(a, b), [x, z]);
  for (const [k, dx, dz] of [['a', -11, -9], ['b', 10, 12], ['c', 14, -4]]) {
    const gy = await G(n.x + dx, n.z + dz), ty = await G(n.x, n.z);
    await page.evaluate(([x, y, z, lx, ly, lz]) => tv.fly(x, y, z, lx, ly, lz), [n.x + dx, gy + 2.6, n.z + dz, n.x, ty + 0.2, n.z]);
    await page.waitForTimeout(2500);
    await shot('farm-' + k);
  }
  await page.evaluate(() => tv.fly(null));
  expect(errors, 'no page errors').toEqual([]);
  await ctx.close();
});
