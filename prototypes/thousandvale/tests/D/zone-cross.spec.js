// Gate — the zone-crossing step of freeze.spec.js on its own, looped, with a CPU profile of every run.
//
// freeze.spec.js recorded ONE main-thread task of ~1.8 s outside the frame loop while the second zone streamed in
// (maxTaskMs 1803 / 1806 / 1823 on three occasions since round 5), intermittently. Rerunning the whole file to catch
// an intermittent fault costs ten minutes a go, so this spec does only step A — boot, warm up, fly across the
// z12_02 | z13_02 border — TV_CROSS_RUNS times (default 5), each on a fresh page so the zone really streams in again.
//
// Each run is profiled through CDP (Profiler.start/stop round the crossing). The profile clock is lined up with the
// page clock by a marker function, so a long task reported by the page's own PerformanceObserver can be cut out of
// the profile and its functions named. Every long task outside the frame loop is written to
// shots/zone-cross-<run>.json, heaviest functions first; the spec fails if any run has one over 100 ms.
//
// Run (shared lock, one browser at a time):
//   cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock npx playwright test prototypes/thousandvale/tests/D/zone-cross.spec.js
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, 'shots');
const RUNS = Number(process.env.TV_CROSS_RUNS || 5);
const LIMIT_MS = 100;
const ZONE_EAST = 26624;       // z12_02 | z13_02
// (not serial: a red run must not hide the ones after it — the fault is intermittent)
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, base;
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
});
test.afterAll(async () => { srv?.kill('SIGTERM'); });

/** Cut [t0, t0+ms] (page clock, ms) out of a CPU profile: self time per function and the heaviest stacks. */
function cut(profile, offsetUs, t0, ms) {
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const label = n => `${n.callFrame.functionName || '(anon)'} ${String(n.callFrame.url).split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`;
  const from = t0 * 1000 + offsetUs, to = from + ms * 1000;
  const self = new Map(), incl = new Map(), stacks = new Map();
  let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    const dt = profile.timeDeltas[i + 1] ?? 0;
    if (t < from || t > to) continue;
    const node = byId.get(profile.samples[i]);
    self.set(label(node), (self.get(label(node)) || 0) + dt);
    const chain = []; const seen = new Set();
    for (let id = node.id; id != null; id = parent.get(id)) { const l = label(byId.get(id)); chain.push(l); if (!seen.has(l)) { seen.add(l); incl.set(l, (incl.get(l) || 0) + dt); } }
    const key = chain.slice(0, 14).join(' < ');
    stacks.set(key, (stacks.get(key) || 0) + dt);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [Math.round(v / 1000), k]);
  return { self: top(self, 14), inclusive: top(incl, 30), stacks: top(stacks, 6) };
}

for (let run = 1; run <= RUNS; run++) {
  test(`zone crossing ${run}/${RUNS}: no main-thread task over ${LIMIT_MS} ms outside the frame loop`, async ({ browser }) => {
    test.setTimeout(900000);
    mkdirSync(SHOTS, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.__lt = [];
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push({ t0: e.startTime, ms: e.duration }); }).observe({ type: 'longtask' }); } catch { /* none */ }
      window.__tvGateMarker = function __tvGateMarker() { const a = performance.now(); let x = 0; while (performance.now() - a < 40) x += Math.sqrt(x + 1); return [a, performance.now()]; };
    });
    await page.goto(`${base}?autoplay=1&name=Cross${'abcdefghijklmnop'[run - 1]}&cls=mage&quality=high&tod=0.45`);
    await page.waitForFunction(() => window.tv && tv.state().status === 'online' && tv.state().you?.id != null, null, { timeout: 60000 });
    await page.waitForFunction(() => tv.warm()?.done, null, { timeout: 300000 });
    await page.waitForTimeout(3000);
    const you = await page.evaluate(() => tv.state().you);

    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
    const mark = await page.evaluate(() => window.__tvGateMarker());
    // (__clearAt: a long task that BEGAN before this line and is delivered after it is the frame before the reset —
    //  the watchdog must not count it; `late` below says whether this run met that case)
    await page.evaluate(() => { window.__lt.length = 0; tv.perf(true); window.__clearAt = performance.now(); });
    const A = await page.evaluate(async ([z, from, to]) => {
      const t0 = performance.now(), speed = 12, H = (x, zz) => thousandvale.WS.terrain.heightAt(x, zz) || 0;
      await new Promise(res => { const step = () => { const x = from + (performance.now() - t0) / 1000 * speed; tv.fly(x - 10, H(x, z) + 7, z + 3, x, H(x, z) + 1, z); if (x < to) requestAnimationFrame(step); else res(); }; step(); });
      await new Promise(r => setTimeout(r, 4000));
      tv.fly(null);
      return { perf: tv.perf(), world: tv.world(), tasks: window.__lt.slice(), late: window.__lt.filter(x => x.t0 < window.__clearAt).map(x => Math.round(x.ms)) };
    }, [you.z, ZONE_EAST - 520, ZONE_EAST + 380]);
    const { profile } = await cdp.send('Profiler.stop');

    // line the two clocks up on the marker function, then cut each long task out of the profile
    let offsetUs = null;
    { const id = profile.nodes.find(n => n.callFrame.functionName === '__tvGateMarker')?.id; let t = profile.startTime;
      for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i]; if (profile.samples[i] === id) { offsetUs = t - mark[0] * 1000; break; } } }
    const big = A.tasks.filter(x => x.ms > 400).sort((a, b) => b.ms - a.ms).slice(0, 4);
    const cuts = offsetUs == null ? [] : big.map(x => ({ t0: Math.round(x.t0), ms: Math.round(x.ms), ...cut(profile, offsetUs, x.t0, x.ms) }));
    const report = { run, late: A.late, stalls: A.perf.stalls, links: A.perf.links, zones: A.world.zones, top: A.perf.top.slice(0, 10), longTasks: A.tasks.map(x => [Math.round(x.t0), Math.round(x.ms)]), cuts };
    writeFileSync(join(SHOTS, `zone-cross-${run}.json`), JSON.stringify(report, null, 1));
    if (A.perf.stalls.maxTaskMs > LIMIT_MS || process.env.TV_CROSS_KEEP) writeFileSync(join(SHOTS, `zone-cross-${run}.cpuprofile`), JSON.stringify(profile));
    console.log(`[cross ${run}]`, JSON.stringify({ stalls: A.perf.stalls, links: A.perf.links, zones: A.world.zones, lateFromBeforeReset: A.late }));
    if (A.perf.stalls.maxTaskMs > LIMIT_MS) console.log(`[cross ${run} cuts]`, JSON.stringify(cuts.map(c => ({ ms: c.ms, self: c.self.slice(0, 6), stacks: c.stacks.slice(0, 2) })), null, 1));

    expect(errors, errors.join('\n')).toEqual([]);
    expect(A.world.zones, 'the neighbouring zone streamed in').toContain('z13_02');
    expect(A.perf.stalls.maxBusyMs, 'longest frame of page work while streaming a zone').toBeLessThanOrEqual(LIMIT_MS);
    expect(A.perf.stalls.maxTaskMs, 'longest main-thread task while streaming a zone').toBeLessThanOrEqual(LIMIT_MS);
    await ctx.close();
  });
}
