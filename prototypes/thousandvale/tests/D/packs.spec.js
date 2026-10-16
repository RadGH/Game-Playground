// Wandering packs + wild events (owner 2026-10-16) — LOOK at them: a pack walking its route, a crew at its fire, a hunt,
// a pack fight with area skills, and each wild event (ambush, caravan, night raid, rift, warlord's march, bounty) with its
// tracker card. Shots: $PACK_SHOTS or tests/D/shots/packs-*.png
// Run: cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/packs.spec.js
// Pick parts with PACK_ONLY=roam,camp,hunt,fight,ambush,caravan,raid,rift,march,bounty (default all).
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)), SHOTS = process.env.PACK_SHOTS || join(HERE, 'shots');
const ONLY = process.env.PACK_ONLY ? new Set(process.env.PACK_ONLY.split(',')) : null;
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

test('packs and wild events: roaming, at rest, a hunt, an area fight, and the six events', async ({ browser }) => {
  test.setTimeout(2400000);
  const name = 'Packwatcher';
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } }), page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=${name}&cls=pyromancer&quality=${process.env.PACK_QUALITY || 'low'}&tod=0.5`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 90000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await page.waitForFunction(() => !!thousandvale.actors.get(tv.state().you.id)?.body, null, { timeout: 60000 });
  await hook('/level', { name, level: 40 });
  const shot = n => page.screenshot({ path: join(SHOTS, `packs-${n}.png`) });
  const settle = (ms = 2500) => page.waitForTimeout(ms);
  /** after a move: the ground round you has streamed in (the freeze spec's wait) */
  const landed = async () => { await page.waitForTimeout(1500); await page.waitForFunction(() => thousandvale.S.room?.kind === 'wilds' && thousandvale.WS.ready(tv.state().you.x, tv.state().you.z), null, { timeout: 120000 }).catch(() => {}); await page.waitForTimeout(2500); };
  const rise = async () => { if (await page.evaluate(() => !!thousandvale.S.self.dead)) { await settle(3000); await page.evaluate(() => tv.rise()); await page.waitForFunction(() => !thousandvale.S.self.dead, null, { timeout: 60000 }); await settle(3000); } };
  /** The pack's bodies the client has (monsters with info.pack), with the leader's title. */
  const packSeen = () => page.evaluate(() => { const out = []; for (const a of thousandvale.actors.actors.values()) if (a.kind === 'monster' && !a.dead) { const i = thousandvale.infoOf ? thousandvale.infoOf(a.id) : null; out.push({ name: a.name, rank: a.rank, title: a.npcTitle || null, x: Math.round(a.pos.x), z: Math.round(a.pos.z) }); } return out; });
  const report = {};
  /** A free camera on the live pack nearest you (or a point): from `d` metres off and `h` up, looking at it. */
  const lookAt = async (pt, d = 16, h = 9, from = 0.7) => page.evaluate(([x, z, d, h, a]) => { const H = (xx, zz) => thousandvale.WS.terrain.heightAt(xx, zz) || 0; tv.fly(x + Math.cos(a) * d, H(x, z) + h, z + Math.sin(a) * d, x, H(x, z) + 1, z); }, [pt.x, pt.z, d, h, from]);
  const free = () => page.evaluate(() => tv.fly(null));

  // ---- a pack walking its route (a brigand crew with its captain), seen from a little way off --------------------
  if (part('roam')) {
    await hook('/level', { name, level: 12 });
    const p = await hook('/pack', { name, comp: 'brigand_crew', lead: true, off: 95 });
    report.roam = p;
    await landed(); await settle(4000);
    const at = await hook('/packat', { name }); report.roamAt = at;
    await lookAt(at, 20, 10); await settle(2500);
    report.roamSeen = await packSeen();
    report.roamDebug = await page.evaluate(() => { const S = thousandvale.S, me = tv.state().you; let cam = null; try { const c = thousandvale.view.camera.position; cam = [c.x, c.y, c.z].map(Math.round); } catch {} return { room: S.room?.kind, id: S.room?.id, me: [Math.round(me.x), Math.round(me.z)], self: S.self ? [Math.round(S.self.x), Math.round(S.self.y ?? -1), Math.round(S.self.z)] : null, ready: thousandvale.WS.ready(me.x, me.z), world: tv.world(), cam }; });
    await shot('roam');
    await settle(8000); const at2 = await hook('/packat', { name }); await lookAt(at2, 14, 6, 2.2); await settle(1500);
    await shot('roam-close');
    await free();
  }
  // ---- the same crew at its fire -----------------------------------------------------------------------------------
  if (part('camp')) {
    const p = await hook('/pack', { name, comp: 'brigand_crew', lead: true, off: 95, rest: true });
    await landed(); await settle(6000);
    const at = await hook('/packat', { name }); report.campAt = at;
    await lookAt(at.fire || at, 12, 6); await settle(2500);
    await shot('camp');
    await free();
  }
  // ---- a hunt: hounds run a deer down ------------------------------------------------------------------------------
  if (part('hunt')) {
    const p = await hook('/pack', { name, comp: 'hound_hunt', lead: true, off: 70, rest: true });
    report.hunt = p;
    await landed();
    let at = await hook('/packat', { name }); report.huntAt = at;
    await lookAt(at.prey || at, 22, 12); await settle(1200);
    await shot('hunt-chase');
    for (let i = 0; i < 20 && !(at.fed); i++) { await settle(1500); at = await hook('/packat', { name }); }
    report.huntFed = at;
    await lookAt(at.prey || at, 12, 6); await settle(1500);
    await shot('hunt-feed');
    await free();
  }
  // ---- an area fight: the pyromancer into a hyena clan, every skill on the nearest ---------------------------------
  if (part('fight')) {
    await rise();
    await hook('/level', { name, level: 9 });
    const p = await hook('/pack', { name, comp: 'hyena_clan', lead: true, off: 14 });
    await landed();
    await page.evaluate(() => tv.perf(true));
    const frame = () => page.evaluate(() => { const r = thousandvale.view.renderer.info.render; const st = tv.perf(); const rec = (st.recent || []).map(f => (typeof f === 'number' ? f : f.ms)).filter(Number.isFinite).sort((a, b) => a - b); return { calls: r.calls, tris: r.triangles, lod: { ...thousandvale.actors.lodStats }, actors: thousandvale.actors.actors.size, monsters: [...thousandvale.actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead).length, longFrames: st.longFrames, worstMs: st.worstMs, frames: st.frames, medianMs: rec.length ? rec[rec.length >> 1] : null }; });
    report.fightFrameBefore = await frame();
    await page.evaluate(() => tv.view(16, 0.5));
    for (let i = 0; i < 16; i++) {
      await page.evaluate(() => { const me = tv.state().you; let best = null, bd = 30; for (const a of thousandvale.actors.actors.values()) if (a.kind === 'monster' && !a.dead) { const d = Math.hypot(a.pos.x - me.x, a.pos.z - me.z); if (d < bd) { bd = d; best = a; } } if (best) { for (const s of [1, 2, 3, 4]) tv.cast(s, best.id); tv.attack(best.id); } });
      await page.waitForTimeout(500);
      if (i === 5) { await shot('fight-aoe'); report.fightFrame = await frame(); }
    }
    await shot('fight-after');
    report.fight = p;
    await hook('/level', { name, level: 40 });
  }
  // ---- the six wild events (the tracker card in the corner, the HUD left on) ---------------------------------------
  for (const [k, kind, opts, view] of [['ambush', 'ambush', { road: true }, [18, 0.6]], ['caravan', 'caravan', { road: true }, [28, 0.62]], ['raid', 'nightraid', {}, [34, 0.66]], ['rift', 'rift', {}, [20, 0.45]], ['march', 'warmarch', {}, [30, 0.6]], ['bounty', 'bounty', {}, [14, 0.4]]]) {
    if (!part(k)) continue;
    await rise();
    if (kind === 'nightraid') await page.evaluate(() => tv.setTime(0.9));
    if (kind === 'warmarch' || kind === 'bounty') { await hook('/pack', { name, comp: 'brigand_crew', lead: true, off: 90 }); await landed(); }      // out into a zone with a led pack (a warlord's band, a bounty's quarry)
    const r = await hook('/wild', { name, kind, ...opts });
    report[k] = r;
    if (!r.ok) { console.log('no', kind, JSON.stringify(r)); continue; }
    await hook('/tough', { name });
    if (kind === 'caravan' || kind === 'rift' || kind === 'nightraid' || kind === 'warmarch' || kind === 'bounty') await hook('/teleport', { name, x: r.x + (kind === 'warmarch' || kind === 'bounty' ? 70 : 30), z: r.z + 6 });
    await landed(); await settle(kind === 'nightraid' ? 26000 : 4000);
    let at = { x: r.x, z: r.z };
    if (kind === 'warmarch' || kind === 'bounty') { const pa = await hook('/packat', { name }); if (pa.ok) at = pa; }
    await lookAt(at, view[0], view[1] * 18, 0.9);
    await settle(1500);
    report[k + 'Card'] = await page.evaluate(() => { const el = document.querySelector('.tv-event, .ev-track, [class*="event"]'); return el ? el.innerText.slice(0, 300) : null; });
    await shot(k);
    await free();
    if (kind === 'nightraid') await page.evaluate(() => tv.setTime(0.5));
  }
  writeFileSync(join(SHOTS, 'packs-report.json'), JSON.stringify({ report, errors }, null, 1));
  console.log(JSON.stringify({ report, errors }).slice(0, 4000));
  expect(errors.filter(e => !/ResizeObserver/.test(e))).toEqual([]);
});
