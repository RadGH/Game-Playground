// Stream CP — play-test 12 (#79, #82, #83): "fighting 3 ashback salamanders freezes the game every few seconds",
// "freezes fighting enemies with ranged homing projectiles", "locks up when enemies cast area spells at my feet".
// A level-15 Starcaller stands in the wilds with monsters round her that shoot and cast, and fights them; the page's
// own main-thread stalls (perf.stalls(), as freeze.spec.js — this VM has no GPU, so FRAME time is meaningless here)
// and the shader programs linked DURING the fight are counted. Every new program link was a multi-second stall
// in the real browser (memory: threejs-shader-recompile-stutter).
//
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/cp-freeze.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
test.describe.configure({ mode: 'serial' });
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base, hookBase;
test.beforeAll(async () => {
  const port = await freePort(), hook = await freePort();
  srv = spawn(process.execPath, [join(HERE, 'm3-server.mjs'), '--port', String(port), '--hook', String(hook)], { cwd: join(HERE, '..', '..'), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  srv.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('test server did not start:\n' + out)), 30000);
    srv.stdout.on('data', d => { out += d; if (/READY \d+ \d+/.test(String(d))) { clearTimeout(t); res(); } });
    srv.on('exit', c => rej(new Error('test server exited ' + c + '\n' + out)));
  });
  base = `http://127.0.0.1:${port}/prototypes/thousandvale/`;
  hookBase = `http://127.0.0.1:${hook}`;
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });
const hook = (path, body) => fetch(hookBase + path, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json());

const FIGHTS = [
  { label: 'ashback salamanders (ranged poison shots)', type: 'ashback_salamander', n: 3, level: 15 },
  { label: 'elite casters (telegraphed area spells)', type: 'ashback_salamander', n: 2, level: 15, rank: 'champion' },
];

test('a fight with shooting, casting monsters links no new shader and stalls no frame', async ({ browser }) => {
  test.setTimeout(900000);
  mkdirSync(SHOTS, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}?autoplay=1&name=Starry&cls=starcaller&quality=high&tod=0.45`);
  await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
  await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
  await hook('/level', { name: 'Starry', level: 15 });
  await page.waitForTimeout(2000);
  const you = await page.evaluate(() => tv.state().you);
  const report = {};
  for (const [k, F] of FIGHTS.entries()) {
    const sp = await hook('/spawn', { name: 'Starry', type: F.type, n: F.n, level: F.level, rank: F.rank, dist: 12, wilds: true, x: you.x + 300 + k * 60, z: you.z });
    expect(sp.ok).toBe(true);
    await hook('/tough', { name: 'Starry' });
    await page.waitForTimeout(6000);                 // the room change, the bodies arrive and are built
    await page.evaluate(() => {
      tv.perf(true);
      window.__links = [];
      const gl = thousandvale.view?.renderer?.getContext?.() || tv.gl?.();
      if (gl && !gl.__cpWrapped) { const orig = gl.linkProgram.bind(gl); gl.linkProgram = p => { window.__links.push(new Error().stack.split('\n').slice(2, 14).map(l => l.trim().replace(/https?:\/\/[^/]+/, '')).join(' | ')); return orig(p); }; gl.__cpWrapped = true; }
    });
    const t0 = Date.now();
    while (Date.now() - t0 < 36000) {
      await hook('/tough', { name: 'Starry' });
      await page.evaluate(ids => { const st = tv.state(); const live = st.ents.filter(e => ids.includes(e.id) && !e.dead); if (live[0]) { tv.attack(live[0].id); tv.cast(1 + (Date.now() / 1500 | 0) % 3, live[0].id); } }, sp.ids).catch(() => {});
      await page.waitForTimeout(1500);
    }
    const P = await page.evaluate(() => ({ perf: tv.perf(), shots: tv.shots?.() ?? null, links: window.__links || [] }));
    report[F.label] = { stalls: P.perf.stalls, links: P.perf.links, newPrograms: P.perf.newProgramNames, longFrames: P.perf.longFrames, top: (P.perf.top || []).slice(0, 10), recent: (P.perf.recent || []).slice(-6), linkStacks: P.links, keys: P.perf.newProgramKeys, shotStats: P.shots && { ...P.shots, list: undefined } };
    console.log(`[${F.label}]`, JSON.stringify(report[F.label]));
    await page.screenshot({ path: join(SHOTS, `cp-freeze-${k}.png`) });
  }
  // #89: after the room changes the Starlight motes ride only YOUR body (they used to stay on whoever got your old id)
  report.motes = await page.evaluate(() => ({ self: tv.state().you.id, motes: thousandvale.stars.live().motes, resets: thousandvale.stars.stats.resets || 0 }));
  // #66: two numbers on one spot in the same frame end up apart on screen
  report.numbers = await page.evaluate(async () => {
    const cam = thousandvale.camera, f = new cam.position.constructor(); cam.getWorldDirection(f); const at = { x: cam.position.x + f.x * 8, y: cam.position.y + f.y * 8 - 1, z: cam.position.z + f.z * 8 };      // a spot in plain view
    for (const n of document.querySelectorAll('.dmg')) n.remove();
    thousandvale.fx.number(at, '123', 'out'); thousandvale.fx.number(at, '456', 'out'); thousandvale.fx.number(at, '789', 'crit');
    await new Promise(r => setTimeout(r, 450));
    const W = innerWidth, H = innerHeight;
    return [...document.querySelectorAll('.dmg')].filter(n => ['123', '456', '789!', '789'].includes(n.textContent)).map(n => { const r = n.getBoundingClientRect(); return { t: n.textContent, x: r.x, y: r.y, w: r.width, h: r.height, onScreen: r.x > 0 && r.y > 0 && r.x < W && r.y < H }; });
  });
  console.log('[#89 motes]', JSON.stringify(report.motes), '[#66 numbers]', JSON.stringify(report.numbers));
  writeFileSync(join(SHOTS, 'cp-freeze.json'), JSON.stringify(report, null, 1));
  for (const id of Object.keys(report.motes.motes)) expect(+id, '#89: motes only over your own body').toBe(report.motes.self);
  const N = report.numbers;
  expect(N.length, '#66: three numbers').toBe(3);
  for (const x of N) expect(x.onScreen, `#66: ${x.t} on screen`).toBe(true);
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) expect(overlap(N[i], N[j]) / Math.min(N[i].w * N[i].h, N[j].w * N[j].h), `#66: ${N[i].t} and ${N[j].t} overlap`).toBeLessThan(0.25);
  expect(errors, 'page errors').toEqual([]);
  for (const [label, r] of Object.entries(report).filter(([, r]) => r && r.stalls)) {
    expect(r.newPrograms, `${label}: shader programs linked mid-fight (each one is a freeze)`).toEqual([]);
    expect(r.stalls.busyLong + r.stalls.longTasks, `${label}: main-thread stalls over 100 ms (${JSON.stringify(r.stalls)})`).toBe(0);
  }
});
