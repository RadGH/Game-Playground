// Stream G — M1 load gate (PLAN §15 M1): 50 real WebSocket bots, 30 of them in the town hub and 20 fighting
// in the wilds; tick p99 < 10 ms, no tick over 50 ms. Fresh server (memory DB) on a free port.
//   node --test prototypes/thousandvale/tests/load/bots50.test.js     (run perf tests alone: the VM is shared)
// Env: TV_LOAD_SECONDS (default 70 — /status keeps a 1-minute window, so the last sample is past warm-up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadavg, availableParallelism } from 'node:os';
import { startServer, serverExists } from './server-harness.mjs';

const SECONDS = +(process.env.TV_LOAD_SECONDS || 70);
const TOWN = 30, WILDS = 20, P99_MS = 10;

test(`50 bots (${TOWN} in town, ${WILDS} in the wilds) for ${SECONDS}s: tick p99 < ${P99_MS} ms`, { skip: !serverExists() && 'server/main.mjs not built yet', timeout: (SECONDS + 90) * 1000 }, async () => {
  const { startBots, report, getStatus } = await import('../../tools/bot-client.mjs');
  const srv = await startServer({ db: 'memory' });
  let town = [], wild = [];
  try {
    town = await startBots(TOWN, { url: srv.url, mode: 'town', radius: 50, stagger: 40, seed: 3 });
    wild = await startBots(WILDS, { url: srv.url, mode: 'fight', radius: 50, stagger: 40, seed: 5 });
    await new Promise(r => setTimeout(r, 5000));
    const samples = [];
    const end = Date.now() + (SECONDS - 5) * 1000;
    while (Date.now() < end) { await new Promise(r => setTimeout(r, 2000)); samples.push(await getStatus(srv.url)); }
    const st = samples[samples.length - 1];
    const roomOf = kind => st.rooms.filter(r => r.kind === kind).reduce((n, r) => n + r.players, 0);
    const rt = report(town), rw = report(wild), load = loadavg()[0];
    const worstMax = Math.max(...samples.map(s => s.tick.max));
    console.log(`# ccu ${st.ccu} | town ${roomOf('town')} wilds ${roomOf('wilds')} | tick p50 ${st.tick.p50} p95 ${st.tick.p95} p99 ${st.tick.p99} max ${st.tick.max} (worst seen ${worstMax}) overruns ${st.tick.overruns} | out ${Math.round(st.bytesOutPerSec / 1024)} KB/s (${(st.bytesOutPerSec / 1024 / st.ccu).toFixed(1)} KB/s per player) | heap ${st.heapMB} MB | load ${load.toFixed(1)}/${availableParallelism()}${load > availableParallelism() ? ' OVERLOADED' : ''}`);
    console.log(`# town bots ${JSON.stringify(rt)}`);
    console.log(`# wild bots ${JSON.stringify(rw)}`);
    assert.ok(st.ccu >= TOWN + WILDS, `ccu ${st.ccu}`);
    assert.ok(roomOf('town') >= TOWN - 2, `${roomOf('town')} players in the town (want ~${TOWN})`);
    assert.ok(st.tick.p99 < P99_MS, `steady tick p99 ${st.tick.p99} ms < ${P99_MS}`);
    assert.ok(worstMax < 50, `no tick over 50 ms (worst ${worstMax})`);
    assert.ok(rt.moved >= TOWN * 0.9 && rw.moved >= WILDS * 0.9, 'bots move');
    assert.ok(rw.hitsDealt > 0, 'wild bots fight');
    assert.equal(rt.kicks + rw.kicks, 0, 'nobody kicked');
  } finally {
    await Promise.all([...town, ...wild].map(b => b.stop()));
    await srv.kill('SIGTERM');
  }
});
