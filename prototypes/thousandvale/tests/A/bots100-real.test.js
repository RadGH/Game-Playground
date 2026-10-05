// M2 load gate over REAL sockets (PLAN §15 M2): stream G's bot client (tools/bot-client.mjs — the browser's
// own js/net/client.js over WebSocket) against a real server process on the Torbor Downs province.
//   A. spread: 30 milling in Torborhold, 70 out fighting           -> avg <= 8 KB/s a player
//   B. the town herd: 100 in Torborhold                           -> <= 24 KB/s
//   C. the event herd: 60 at the realm event (free travel), 40 in town -> fighters <= 48 KB/s
// Each phase is measured over a full /status minute AFTER the bots have settled, so the numbers are steady
// play (logins are reported separately as worst10m). Gate: p99 <= 20 ms, worst < 50 ms in every phase.
// Timing gate — run alone on a quiet VM: TV_PERF=1 node --test tests/A/bots100-real.test.js
// TV_TEST_DB=pg (with the PG* environment) runs it in the stage-2 shape (--procs 1).
// TV_LOAD_SECONDS (default 62) = the measured window per phase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadavg } from 'node:os';
import { startServer } from '../load/server-harness.mjs';
import { startBot, getStatus } from '../../tools/bot-client.mjs';

// names are unique per realm and a pg database keeps them between runs: every run gets its own letters
const L26 = 'abcdefghijklmnopqrstuvwxyz';
const RUN = Array.from({ length: 4 }, () => L26[Math.floor(Math.random() * 26)]).join('');
let nameN = 0;
const nextName = () => { const n = nameN++; return 'Hb ' + RUN + ' ' + L26[Math.floor(n / 26) % 26] + L26[n % 26]; };
async function startBots(count, opts) {
  const out = [], pending = [];
  for (let i = 0; i < count; i++) { pending.push(startBot({ ...opts, name: nextName(), seed: (opts.seed ?? 1) * 1000 + i }).then(b => out.push(b))); await sleep(opts.stagger ?? 30); }
  await Promise.all(pending);
  return out;
}

const PERF = !!process.env.TV_PERF;
const PG = process.env.TV_TEST_DB === 'pg' && !!(process.env.PGDATABASE || process.env.DATABASE_URL);
const SECONDS = +(process.env.TV_LOAD_SECONDS || 62);
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('100 real-socket bots with herds: p99 <= 20 ms, worst < 50 ms, bandwidth in budget', { timeout: 15 * 60000, skip: !PERF && 'timing gate: TV_PERF=1' }, async () => {
  const args = ['--province', 'torbor_downs', '--event-first', '1000', '--event-announce', '0', '--event-every', '5000', '--max-per-ip', '1000'];
  const srv = await startServer({ db: PG ? 'pg' : 'memory', args: PG ? [...args, '--procs', '1', '--process', 'b100real'] : args, timeout: 90000 });
  const all = [];
  const results = [];
  const tickOf = st => st.tick || {};
  async function measure(name, groups) {
    await sleep(3000);
    const b0 = new Map(all.map(b => [b, b.stats.bytes]));
    const t0 = Date.now();
    await sleep(SECONDS * 1000);
    const st = await getStatus(srv.url);
    const secs = (Date.now() - t0) / 1000;
    const kb = list => list.reduce((a, b) => a + (b.stats.bytes - (b0.get(b) || 0)), 0) / Math.max(1, list.length) / secs / 1024;
    const t = tickOf(st);
    const r = { name, ccu: st.ccu, p50: t.p50, p99: t.p99, max: t.max, worst10m: t.worst10m, load: +loadavg()[0].toFixed(1) };
    for (const [k, list] of Object.entries(groups)) r['kb_' + k] = +kb(list).toFixed(2);
    console.log('# ' + JSON.stringify(r));
    results.push(r);
    return r;
  }
  const stop = async list => { await Promise.all(list.map(b => b.stop())); for (const b of list) all.splice(all.indexOf(b), 1); };
  try {
    // A. spread
    const town30 = await startBots(30, { url: srv.url, mode: 'town', radius: 70, stagger: 30, seed: 11, joinTimeout: 30000 });
    const fight70 = await startBots(70, { url: srv.url, mode: 'fight', radius: 120, stagger: 30, seed: 13, joinTimeout: 30000 });
    all.push(...town30, ...fight70);
    await sleep(8000);                                   // let the fighters walk out of town
    const A = await measure('spread 30 town / 70 wilds', { all, town: town30, fight: fight70 });
    // B. the town herd
    await stop(fight70);
    const town70 = await startBots(70, { url: srv.url, mode: 'town', radius: 70, stagger: 30, seed: 17, joinTimeout: 30000 });
    all.push(...town70);
    const B = await measure('herd: 100 in Torborhold', { all });
    // C. the event herd: 60 take free travel to the realm event and fight there; 40 stay in town
    await stop(town70.slice(0, 60));
    const st = await getStatus(srv.url);
    assert.ok(st.director && st.director.state === 'live', 'the realm event is live: ' + JSON.stringify(st.director));
    const fighters = await startBots(60, { url: srv.url, mode: 'fight', radius: 40, hunt: 0, stagger: 30, seed: 19, joinTimeout: 30000 });
    for (const b of fighters) {
      const go = () => b.net.travel('event');
      b.net.on('joined', j => {
        const ev = j.event;
        if (j.handoff && (j.handoff.via === 'event' || j.handoff.via === 'relocate') && ev) { b.exit = null; b.home = { x: ev.x, z: ev.z }; b.atEvent = true; }
        else if (j.room.kind === 'town') setTimeout(go, 800);       // respawned in town: back to the fight
      });
      go();
    }
    all.push(...fighters);
    await sleep(6000);
    const ev = (await getStatus(srv.url)).director.ev;
    const near = () => fighters.filter(b => b.pos && Math.hypot(b.pos.x - ev.x, b.pos.z - ev.z) < ev.r * 1.6).length;
    console.log('# event herd arrived: ' + near() + ' of 60');
    const C = await measure('herd: 60 at the realm event', { all, fight: fighters, town: all.filter(b => !fighters.includes(b)) });
    console.log('# event herd still there: ' + near() + ' of 60; hits ' + fighters.reduce((a, b) => a + b.stats.hitsDealt, 0) + ', deaths ' + fighters.reduce((a, b) => a + b.stats.deaths, 0));
    assert.ok(near() >= 36, 'most of the event herd stayed at the event (they chase adds outward; a won event can be followed by another): ' + near());
    for (const r of [A, B, C]) { assert.ok(r.p99 <= 20, r.name + ' p99 ' + r.p99); assert.ok(r.max < 50, r.name + ' worst ' + r.max); }
    assert.ok(A.kb_all <= 8, 'spread average ' + A.kb_all + ' KB/s');
    assert.ok(B.kb_all <= 24, 'town herd ' + B.kb_all + ' KB/s');
    assert.ok(C.kb_fight <= 48, 'event herd ' + C.kb_fight + ' KB/s');
  } finally {
    await Promise.all(all.map(b => b.stop()));
    await srv.kill('SIGTERM');
  }
});
