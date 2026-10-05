// Stream G — M2 load gate over REAL SOCKETS (PLAN §15 M2): 100 bots on the Torbor Downs province with herds.
//   A. spread  — 30 milling in Torborhold, 70 out in the wilds fighting
//   B. town herd — all 100 in Torborhold
//   C. event herd — 60 at the realm event (free travel), 40 in town
// Each phase is measured over a full /status window (60 s) after it settles. Gates (stream A's in-process
// tests/A/bots100.test.js uses the same): tick p99 <= 20 ms in every phase, worst tick < 50 ms, bandwidth
// spread <= 8 KB/s per player average, town herd <= 24, event fighters <= 48. Bandwidth = every byte the bots
// RECEIVE (JSON + binary), counted at the socket.
//   TV_PERF=1 node --test prototypes/thousandvale/tests/load/herds.test.js      (~5 min; alone on the VM)
// Env: TV_LOAD_PROCS=N runs the server in stage 2 (gateway + N province processes); TV_HERD_WINDOW (default 62 s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadavg, availableParallelism } from 'node:os';
import { startServer, serverExists } from './server-harness.mjs';

const PERF = !!process.env.TV_PERF;
const WINDOW = +(process.env.TV_HERD_WINDOW || 62);
const PROCS = +(process.env.TV_LOAD_PROCS || 0);
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('real sockets: 100 bots with herds (town 100, event 60) — p99 <= 20 ms, worst < 50 ms, bandwidth in budget', {
  skip: (!serverExists() && 'server/main.mjs not built yet') || (!PERF && 'timing gate: TV_PERF=1'), timeout: (WINDOW * 3 + 300) * 1000,
}, async () => {
  const { startBots, getStatus } = await import('../../tools/bot-client.mjs');
  // the realm event: announced 5 s ahead, first one well after phase B (re-armed by --event-every if it is won early)
  const firstEvent = (WINDOW + 25) * 2 * 1000 + 30000;
  // stage 2 shares one database between processes: give it a throw-away Postgres (ops/scratch-pg.sh, unix socket only)
  let pgEnv = {}, pgDir = null;
  if (PROCS) {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
    pgDir = join(mkdtempSync(join(tmpdir(), 'tv-herds-pg-')), 'pg');
    const script = new URL('../../ops/scratch-pg.sh', import.meta.url).pathname;
    for (const l of execFileSync(script, ['start', pgDir, '55435'], { encoding: 'utf8' }).split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) pgEnv[m[1]] = m[2]; }
    execFileSync('createdb', ['thousandvale_herds_dev'], { env: { ...process.env, ...pgEnv } });
    Object.assign(pgEnv, { PGDATABASE: 'thousandvale_herds_dev', PGPASSWORD: '', DATABASE_URL: '' });
    process.on('exit', () => { try { execFileSync(script, ['stop', pgDir]); } catch { /* best effort */ } });
  }
  const srv = await startServer({ db: PROCS ? 'pg' : 'memory', env: pgEnv, timeout: 30000, args: ['--event-first', String(firstEvent), '--event-announce', '5000', '--event-every', '20000', ...(PROCS ? ['--procs', String(PROCS)] : [])] });
  const t0 = Date.now();
  let bots = [];
  const results = [];
  try {
    bots = await startBots(100, { url: srv.url, mode: 'script', stagger: 60, seed: 9, nodeSafe: true });
    const rng = (() => { let a = 77; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    const town = bots.find(b => b.town)?.town;
    assert.ok(town, 'bots start in the town room');
    const townGoal = () => { const a = rng() * 6.283, d = rng() * town.r * 0.75; return { x: town.x + Math.cos(a) * d, z: town.z + Math.sin(a) * d }; };
    const wildHome = i => { const a = (i / 70) * 6.283, d = town.r + 90 + (i % 5) * 25; return { x: town.x + Math.cos(a) * d, z: town.z + Math.sin(a) * d }; };
    let phase = 'spread', ev = null;
    bots.forEach((b, i) => { b.role = i < 30 ? 'town' : 'wild'; b.camp = b.role === 'wild' ? wildHome(i - 30) : null; });
    // the driver: 4 Hz goals for everyone
    const driver = setInterval(() => {
      for (const b of bots) {
        if (!b.pos || b.wasDead) continue;
        const wantTown = b.role === 'town' || phase === 'town' || (phase === 'event' && b.role !== 'event');
        if (wantTown) {
          b.fightRadius = 0;
          if (!b.goal || Math.hypot(b.goal.x - b.pos.x, b.goal.z - b.pos.z) < 2 || Math.hypot(b.goal.x - town.x, b.goal.z - town.z) > town.r) b.goal = townGoal();
        } else if (phase === 'event' && b.role === 'event') {
          b.fightRadius = 45;
          if (ev && b.roomKind === 'town' && (!b.travelR || Date.now() - b.travelR.t > 3000) && (!b.lastTravel || Date.now() - b.lastTravel > 3000)) { b.lastTravel = Date.now(); b.net.travel('event'); }
          if (ev && (!b.goal || Math.hypot(b.goal.x - b.pos.x, b.goal.z - b.pos.z) < 2)) { const a = rng() * 6.283, d = 6 + rng() * 8; b.goal = { x: ev.x + Math.cos(a) * d, z: ev.z + Math.sin(a) * d }; }
        } else {
          b.fightRadius = 30;
          if (!b.goal || Math.hypot(b.goal.x - b.pos.x, b.goal.z - b.pos.z) < 3) { const a = rng() * 6.283, d = rng() * 50; b.goal = { x: b.camp.x + Math.cos(a) * d, z: b.camp.z + Math.sin(a) * d }; }
        }
      }
    }, 250);
    const measure = async (name, list) => {
      const b0 = new Map(bots.map(b => [b, b.stats.wireBytes || 0]));
      const ts = Date.now(), samples = [];
      while (Date.now() - ts < WINDOW * 1000) { await sleep(3000); samples.push(await getStatus(srv.url)); }
      const secs = (Date.now() - ts) / 1000, st = samples.at(-1);
      // stage 2: the gateway's /status nests the rooms and bytes per province process
      const roomsOf = x => (x.rooms || (x.procs || []).flatMap(p => p.rooms || [])).filter(r => r && r.kind);
      const outOf = x => x.bytesOutPerSec ?? (x.procs || []).reduce((n, p) => n + (p.bytesOutPerSec || 0), 0);
      const kb = l => l.reduce((n, b) => n + (b.stats.wireBytes || 0) - b0.get(b), 0) / Math.max(1, l.length) / secs / 1024;
      const r = {
        name, ccu: st.ccu, p50: st.tick.p50, p99: st.tick.p99, max: Math.max(...samples.map(s => s.tick.max)),
        kbAll: +kb(bots).toFixed(2), kbGroup: +kb(list).toFixed(2), serverKBs: Math.round(outOf(st) / 1024),
        rooms: Object.fromEntries(Object.entries(roomsOf(st).reduce((m, r) => { m[r.kind] = (m[r.kind] || 0) + r.players; return m; }, {}))),
        load: +loadavg()[0].toFixed(1), cores: availableParallelism(),
      };
      console.log('# ' + JSON.stringify(r));
      results.push(r);
      return r;
    };
    const inRoom = kind => bots.filter(b => b.roomKind === kind).length;
    // A. spread
    await bots[0].waitFor(() => inRoom('town') <= 32, 90000, 500).catch(() => {});
    await sleep(8000);
    console.log(`# spread: ${inRoom('town')} in town, ${inRoom('wilds')} in the wilds after ${Math.round((Date.now() - t0) / 1000)} s`);
    const A = await measure('spread 30 town / 70 wilds', bots.slice(30));
    assert.ok(inRoom('wilds') >= 60, `${inRoom('wilds')} bots made it to the wilds`);
    // B. town herd
    phase = 'town';
    await bots[0].waitFor(() => inRoom('town') >= 97, 120000, 500).catch(() => {});
    await sleep(5000);
    const B = await measure('herd: 100 in one town', bots);
    assert.ok(inRoom('town') >= 95, `${inRoom('town')} of 100 in the town`);
    // C. event herd
    await bots[0].waitFor(() => bots.some(b => b.realm && b.realm.kind === 'eventStart'), Math.max(120000, firstEvent - (Date.now() - t0) + 60000), 500);
    ev = bots.find(b => b.realm?.kind === 'eventStart').realm.ev;
    bots.forEach((b, i) => { b.role = i < 60 ? 'event' : 'town'; b.goal = null; });
    phase = 'event';
    // by position only: a town attack (e.g. "Raiders at Torborhold") happens inside the town room
    const atEvent = () => bots.filter(b => b.role === 'event' && b.pos && Math.hypot(b.pos.x - ev.x, b.pos.z - ev.z) < (ev.r || 40) * 1.5).length;
    await bots[0].waitFor(() => atEvent() >= 50, 60000, 500).catch(() => {});
    console.log(`# event ${ev.name} (${ev.kind}, level ${ev.level}) at ${Math.round(ev.x)},${Math.round(ev.z)}: ${atEvent()} of 60 arrived`);
    const C = await measure('herd: 60 at the realm event', bots.slice(0, 60));
    console.log(`# event herd still there: ${atEvent()} of 60; deaths ${bots.reduce((n, b) => n + b.stats.deaths, 0)}, kicks ${bots.reduce((n, b) => n + b.stats.kicks, 0)}`);
    clearInterval(driver);
    assert.ok(atEvent() >= 40, `only ${atEvent()} of 60 at the event`);
    for (const r of [A, B, C]) assert.ok(r.p99 <= 20, `${r.name}: tick p99 ${r.p99} ms`);
    const worst = Math.max(A.max, B.max, C.max);
    assert.ok(worst < 50, `worst tick ${worst} ms`);
    assert.ok(A.kbAll <= 8, `spread: ${A.kbAll} KB/s per player`);
    assert.ok(B.kbAll <= 24, `town herd: ${B.kbAll} KB/s per player`);
    assert.ok(C.kbGroup <= 48, `event herd: ${C.kbGroup} KB/s per fighter`);
    assert.equal(bots.reduce((n, b) => n + b.stats.kicks, 0), 0, 'nobody kicked');
  } finally {
    console.log('# results ' + JSON.stringify(results));
    await Promise.all(bots.map(b => b.stop()));
    await srv.kill('SIGTERM');
    if (pgDir) { const { execFileSync } = await import('node:child_process'); try { execFileSync(new URL('../../ops/scratch-pg.sh', import.meta.url).pathname, ['stop', pgDir]); } catch { /* gone */ } }
  }
});
