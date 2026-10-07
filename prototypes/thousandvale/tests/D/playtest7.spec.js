// Stream D-world — play-test 7, V3 ("Fishing spots — I've only seen the one right at the start", with 308 placed):
// walk every listed spot of the Torbor Fields river and two other towns with water, and for each say whether the
// server SENT a pool there, whether the client DREW it, and take pictures of one from 30 / 80 / 150 m by day and night.
// Screenshots: tests/D/shots/v3-*.png · the table: tests/D/shots/v3-pools.json
// Run (shared lock): cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/playtest7.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
const POOLS = JSON.parse(readFileSync(join(HERE, '..', '..', 'data', 'provinces', 'angling-pools.json'), 'utf8'));
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

test('V3: which fish pools are sent, which are drawn, and how one looks from the road', async ({ browser }) => {
  test.setTimeout(900000);
  const port = await freePort(), hp = await freePort();
  const srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hp)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('no server\n' + out)), 30000); srv.stdout.on('data', d => { if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } }); });
  const hook = (path, body) => fetch(`http://127.0.0.1:${hp}${path}`, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());
  mkdirSync(SHOTS, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } }), page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${port}/prototypes/thousandvale/?autoplay=1&name=Perch&cls=ranger&quality=low&tod=0.5`);
    await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
    await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
    await page.evaluate(() => tv.hud(false));
    const at = async (x, z, wait = 2600) => { const r = await hook('/teleport', { name: 'Perch', x, z }); expect(r.ok).toBe(true); await page.waitForFunction(([x, z]) => Math.hypot(tv.state().you.x - x, tv.state().you.z - z) < 8, [x, z], { timeout: 60000 }); await page.waitForTimeout(wait); };
    /** pools the server has sent (entities of type fishpool) and pools the client is drawing, with their distance from (x, z) */
    const seen = (x, z) => page.evaluate(([x, z]) => {
      const T = thousandvale, sent = [], drawn = [];
      for (const e of T.S.mirror.ents.values()) { const i = e.info || T.S.mirror.infos.get(e.id); if (i?.type === 'fishpool') sent.push({ id: i.pool?.id, d: Math.round(Math.hypot(e.x - x, e.z - z)), tier: i.pool?.tier, left: i.pool?.left }); }
      for (const p of T.angling.pools.values()) drawn.push({ d: Math.round(Math.hypot(p.x - x, p.z - z)), rings: p.rings.length, y: +p.y.toFixed(1) });
      return { sent, drawn };
    }, [x, z]);
    const table = { zones: {}, towns: {} };
    // ---- every listed spot of the Torbor Fields: stand on its shore
    const spots = process.env.V3_QUICK ? POOLS.zones.z12_02.filter(q => q.id === 'pool_z12_02_7' || q.id === 'pool_z12_02_1') : POOLS.zones.z12_02;      // V3_QUICK=1: the pictures only
    const rows = [];
    for (const s of spots) {
      await at(s.shore.x, s.shore.z, 2200);
      const r = await seen(s.x, s.z);
      rows.push({ id: s.id, tier: s.tier, road: s.road, sent: r.sent.some(p => p.d < 15), drawn: r.drawn.some(p => p.d < 15), sentNear: r.sent.length });
    }
    table.zones.z12_02 = { listed: spots.length, live: POOLS.meta.z12_02.live, sent: rows.filter(r => r.sent).length, drawn: rows.filter(r => r.drawn).length, rows };
    console.log('[V3] Torbor Fields:', JSON.stringify({ listed: spots.length, metaLive: POOLS.meta.z12_02.live, sent: table.zones.z12_02.sent, drawn: table.zones.z12_02.drawn, open: rows.filter(r => r.sent).map(r => r.id) }));
    // ---- one open pool from 30 / 80 / 150 m, from the land side, at eye height — day and night
    const open = spots.find(s => rows.find(r => r.id === s.id)?.sent) || spots.find(s => s.id === 'pool_z12_02_7');
    const dir = (() => { const dx = open.shore.x - open.x, dz = open.shore.z - open.z, d = Math.hypot(dx, dz) || 1; return { x: dx / d, z: dz / d }; })();
    for (const [tod, name] of [[0.5, 'day'], [0.98, 'night']]) {
      await page.evaluate(t => tv.setTime(t), tod);
      for (const dist of [30, 80, 150]) {
        const px = open.x + dir.x * Math.min(dist, 140), pz = open.z + dir.z * Math.min(dist, 140);
        await at(px, pz, 1500);
        await page.evaluate(([x, z, ox, oz, dx, dz, dist]) => { const H = (a, b) => thousandvale.WS.terrain.heightAt(a, b) || 0, cx = ox + dx * dist, cz = oz + dz * dist; tv.fly(cx, Math.max(H(cx, cz), H(ox, oz)) + 2.2, cz, ox, H(ox, oz) + 1, oz); }, [px, pz, open.x, open.z, dir.x, dir.z, dist]);
        await page.waitForTimeout(3500);
        await page.screenshot({ path: join(SHOTS, `v3-pool-${name}-${dist}m.png`) });
        const r = await seen(open.x, open.z);
        (table.zones.z12_02.views ||= []).push({ tod: name, dist, sent: r.sent.some(p => p.d < 15), drawn: r.drawn.some(p => p.d < 15) });
        await page.evaluate(() => tv.fly(null));
      }
    }
    await page.evaluate(() => tv.setTime(0.5));
    // ---- two other towns with water: stand where the angler stands
    for (const town of ['Halsbridge', 'Ashcombe']) {
      const a = POOLS.anglers.find(x => x.town === town); if (!a) continue;
      await at(a.x, a.z, 5000);
      const r = await seen(a.x, a.z);
      const near = r.sent.slice().sort((p, q) => p.d - q.d)[0] || null, listed = (POOLS.zones[a.zone] || []).filter(s => Math.hypot(s.x - a.x, s.z - a.z) < 150).length;
      table.towns[town] = { zone: a.zone, listedWithin150: listed, sentWithin150: r.sent.length, drawn: r.drawn.length, nearest: near };
      console.log(`[V3] ${town}:`, JSON.stringify(table.towns[town]));
      const s = (POOLS.zones[a.zone] || []).find(q => q.id === near?.id) || (POOLS.zones[a.zone] || []).find(q => q.id === a.pool);
      if (s) { await page.evaluate(([ax, az, sx, sz]) => { const H = (p, q) => thousandvale.WS.terrain.heightAt(p, q) || 0, dx = ax - sx, dz = az - sz, d = Math.hypot(dx, dz) || 1, cx = sx + dx / d * 80, cz = sz + dz / d * 80; tv.fly(cx, Math.max(H(cx, cz), H(sx, sz)) + 2.2, cz, sx, H(sx, sz) + 1, sz); }, [a.x, a.z, s.x, s.z]); await page.waitForTimeout(3500); await page.screenshot({ path: join(SHOTS, `v3-pool-${town.toLowerCase()}-80m.png`) }); await page.evaluate(() => tv.fly(null)); }
    }
    writeFileSync(join(SHOTS, 'v3-pools.json'), JSON.stringify(table, null, 1));
    // what D-world answers for: every pool the server sent is drawn
    expect(table.zones.z12_02.drawn, 'every pool the server sent in the Torbor Fields is drawn').toBe(table.zones.z12_02.sent);
    for (const v of table.zones.z12_02.views.filter(v => v.dist <= 140)) expect(v.drawn, `the pool is drawn from ${v.dist} m (${v.tod})`).toBe(v.sent);
    expect(errors, errors.join('\n')).toEqual([]);
  } finally { await ctx.close(); srv.kill('SIGTERM'); }
});
