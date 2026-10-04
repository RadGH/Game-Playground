// Stream G — M0 load gate: 20 real WebSocket bots walking and fighting; server tick stays under 5 ms.
// PLAN §15 M0 "20 bots tick < 5 ms". Runs a fresh server (memory DB) on a free port.
//   node --test prototypes/thousandvale/tests/load/bots20.test.js
// Env: TV_LOAD_SECONDS (default 20), TV_LOAD_BOTS (default 20), TV_LOAD_URL to aim at a running server instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadavg, availableParallelism } from 'node:os';
import { startServer, serverExists } from './server-harness.mjs';

/** CPU ms the server process has used (user + system), from /proc — immune to time spent waiting for a core. */
function cpuMs(pid) {
  try { const f = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' '); return (+f[11] + +f[12]) * 10; } catch { return NaN; }
}

// /status reports the last MINUTE of ticks, so the gate reads the final sample only once that minute no
// longer holds the warm-up (first logins, JIT, first spawns): 5 s warm-up + 60 s window + margin.
const SECONDS = +(process.env.TV_LOAD_SECONDS || 70);
const BOTS = +(process.env.TV_LOAD_BOTS || 20);
const TICK_BUDGET_MS = 5;

test(`${BOTS} bots for ${SECONDS}s: tick p99 < ${TICK_BUDGET_MS} ms, everyone joins, moves and fights`, { skip: !process.env.TV_LOAD_URL && !serverExists() && 'server/main.mjs not built yet (stream A)', timeout: (SECONDS + 60) * 1000 }, async () => {
  const { startBots, report, getStatus } = await import('../../tools/bot-client.mjs');
  const srv = process.env.TV_LOAD_URL ? { url: process.env.TV_LOAD_URL, kill: async () => {}, log: () => '' } : await startServer({ db: 'memory' });
  let bots = [];
  try {
    bots = await startBots(BOTS, { url: srv.url, mode: 'fight', radius: 50, stagger: 50 });
    assert.equal(bots.length, BOTS, 'every bot joined');
    // warm up 5 s (JIT, first spawns), then measure the rest
    await new Promise(r => setTimeout(r, 5000));
    const samples = [];
    const pid = srv.child?.pid, cpu0 = cpuMs(pid), ticks0 = (await getStatus(srv.url)).tick.ticks;
    const end = Date.now() + (SECONDS - 5) * 1000;
    while (Date.now() < end) {
      await new Promise(r => setTimeout(r, 2000));
      const st = await getStatus(srv.url);
      samples.push(st);
    }
    const st = samples[samples.length - 1];
    const r = report(bots);
    const cpuPerTick = (cpuMs(pid) - cpu0) / Math.max(1, st.tick.ticks - ticks0);
    const load = loadavg()[0], cores = availableParallelism();
    const p99s = samples.map(s => s.tick.p99), maxes = samples.map(s => s.tick.max);
    console.log(`# ccu ${st.ccu} | tick p50 ${st.tick.p50} p95 ${st.tick.p95} p99 ${st.tick.p99} max ${st.tick.max} | worst p99 seen ${Math.max(...p99s)} worst max ${Math.max(...maxes)} | server CPU per tick ${cpuPerTick.toFixed(2)} ms (incl. sockets) | load ${load.toFixed(1)} on ${cores} threads${load > cores ? ' — MACHINE OVERLOADED, tick times include waiting for a core' : ''} | bots: ${JSON.stringify(r)}`);
    assert.ok(st.ccu >= BOTS, `ccu ${st.ccu} >= ${BOTS}`);
    const steady = SECONDS >= 66;   // shorter runs still include warm-up in the window: report, judge loosely
    assert.ok(st.tick.p99 < (steady ? TICK_BUDGET_MS : TICK_BUDGET_MS * 3), `steady-state tick p99 ${st.tick.p99} ms must stay under ${TICK_BUDGET_MS} ms${steady ? '' : ' (x3 allowance: run includes warm-up)'}`);
    assert.ok(Math.max(...maxes) < 50, `no tick overran 50 ms (worst ${Math.max(...maxes)})`);
    assert.ok(r.moved >= BOTS * 0.9, `${r.moved}/${BOTS} bots moved`);
    assert.ok(r.snaps > BOTS * SECONDS * 5, `snapshots flowing (${r.snaps})`);
    assert.ok(r.hitsDealt > 0, 'bots hit monsters');
    assert.equal(r.kicks, 0, 'no bot was kicked (abuse / rate limits)');
  } finally {
    await Promise.all(bots.map(b => b.stop()));
    await srv.kill('SIGTERM');
  }
});
