#!/usr/bin/env node
// Thousandvale — the 300-bot load run (stream H, PLAN §15 M3 gate "300 bots from a second machine", §16.3).
// Real WebSocket bots (stream G's tools/bot-client.mjs, i.e. the browser's own js/net/client.js) spread over several
// child processes, plus a /status sampler on the server. Read ops/load/README.md first.
//
//   node ops/load/run-300.mjs --url ws://192.168.1.34:8495                 the M3 run (from the second machine)
//   node ops/load/run-300.mjs --url ws://127.0.0.1:8495 --rehearsal         same-VM rehearsal (bots pinned to cpus 8-11)
// Options:
//   --bots 300  --procs 4  --seconds 600 (measured window after everyone joined)  --stagger 40 (ms between joins per proc)
//   --scenario spread|town|fight   spread (default): 1/3 town idlers, 2/3 out fighting; town: everyone in the hub (the
//                                  PLAN §16 "300 in one town" crowd); fight: everyone out in the wilds
//   --tokens <file>    reuse accounts: tokens are read from it if it exists and written back after the run. Lets a second
//                      machine skip guest creation (capped at 20 per address per hour) — see README
//   --cpus 8-11        pin the bot processes with taskset (Linux); --rehearsal sets it
//   --gate p99=20,worst=50,kb=8,join=0.98   pass/fail thresholds (M2's numbers by default)
//   --out <dir>        report folder (default ops/load/results/)
//   --settle 65        seconds between the last join and the measured window (/status numbers are per minute)
// Exit 0 = gate passed, 1 = failed, 2 = could not run.
import { fork, spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, loadavg, hostname, totalmem } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); if (i < 0) return d; const v = process.argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const L26 = 'abcdefghijklmnopqrstuvwxyz';

// ------------------------------------------------------------------------------------------------ child: one slice
if (process.argv.includes('--child')) {
  const { startBot } = await import(resolve(HERE, '../../tools/bot-client.mjs'));
  const cfg = JSON.parse(process.argv[process.argv.indexOf('--child') + 1]);
  const bots = []; let failed = 0;
  const name = i => { const n = cfg.first + i; return 'Ld ' + cfg.run + ' ' + L26[Math.floor(n / 676) % 26] + L26[Math.floor(n / 26) % 26] + L26[n % 26]; };
  const pending = [];
  for (let i = 0; i < cfg.count; i++) {
    const mode = cfg.modes[i % cfg.modes.length];
    const token = cfg.tokens[i] || null;
    pending.push(startBot({ url: cfg.url, name: name(i), token, mode, radius: mode === 'town' ? 70 : 120, seed: 7000 + cfg.first + i, joinTimeout: 60000, nodeSafe: true, build: cfg.build })
      .then(b => { b.slot = i; bots.push(b); }).catch(err => { if (!failed) console.error(`   first join failure in proc ${cfg.first}: ${err && err.message}`); failed++; }));
    await sleep(cfg.stagger);
  }
  await Promise.all(pending);
  const sum = () => {
    const s = { bots: bots.length, failed, bytes: 0, snaps: 0, casts: 0, kills: 0, deaths: 0, errors: 0, kicks: 0, joins: 0, refusals: 0, stale: 0 };
    const now = Date.now();
    for (const b of bots) { for (const k of ['bytes', 'snaps', 'casts', 'kills', 'deaths', 'errors', 'kicks', 'joins', 'refusals']) s[k] += b.stats[k] || 0; if (now - (b.stats.lastSnapAt || 0) > 5000) s.stale++; }
    s.wireBytes = bots.reduce((a, b) => a + (b.stats.wireBytes || 0), 0);
    return s;
  };
  process.send({ joined: true, ...sum() });
  const timer = setInterval(() => process.send({ tick: true, ...sum() }), 5000);
  process.on('message', async m => {
    if (m === 'stop') {
      clearInterval(timer);
      const tokens = new Array(cfg.count).fill(null);
      for (const b of bots) tokens[b.slot] = b.token;
      const final = sum();
      await Promise.all(bots.map(b => b.stop().catch(() => {})));
      process.send({ final: true, ...final, tokens }, () => process.exit(0));
    }
  });
} else {
// ------------------------------------------------------------------------------------------------ parent
  const url = arg('url', null);
  if (!url || url === true) { console.error('usage: node ops/load/run-300.mjs --url ws://HOST:PORT [--rehearsal] (read ops/load/README.md)'); process.exit(2); }
  if (/:8490\b/.test(url) && !arg('i-know-this-is-stable', false)) { console.error('refusing: 8490 is the STABLE server with real players — load-test the load server (ops/load/load-server.sh, port 8495)'); process.exit(2); }
  const rehearsal = !!arg('rehearsal', false);
  const BOTS = +arg('bots', 300), PROCS = +arg('procs', 4), SECONDS = +arg('seconds', rehearsal ? 300 : 600), STAGGER = +arg('stagger', 40);
  const scenario = arg('scenario', 'spread');
  const modes = { spread: ['town', 'fight', 'fight'], town: ['town'], fight: ['fight'] }[scenario];
  if (!modes) { console.error('scenario must be spread|town|fight'); process.exit(2); }
  const gate = Object.fromEntries(String(arg('gate', 'p99=20,worst=50,kb=8,join=0.98')).split(',').map(kv => kv.split('=')).map(([k, v]) => [k, +v]));
  if (scenario === 'town' && !String(arg('gate', '')).includes('kb=')) gate.kb = 24;   // a herd sees everyone: M2's town budget
  const cpuList = arg('cpus', rehearsal ? '8-11' : null);
  const tokFile = arg('tokens', null);
  const outDir = resolve(arg('out', join(HERE, 'results')));
  const http = url.replace(/^ws/, 'http').replace(/\/+$/, '');
  const status = async () => { try { const r = await fetch(http + '/status', { signal: AbortSignal.timeout(3000) }); return r.ok ? await r.json() : null; } catch { return null; } };

  const st0 = await status();
  if (!st0) { console.error(`no /status at ${http} — is the load server up? (ops/load/load-server.sh)`); process.exit(2); }
  if (st0.env === 'stable' && !arg('i-know-this-is-stable', false)) { console.error('refusing: that server reports env stable'); process.exit(2); }
  const { PROTOCOL_VERSION } = await import(resolve(HERE, '../../js/net/protocol.js'));
  if (st0.protocol != null && st0.protocol !== PROTOCOL_VERSION) { console.error(`refusing: the server speaks protocol ${st0.protocol}, these bots ${PROTOCOL_VERSION} — pack the bots from the same build (ops/load/pack-bots.sh)`); process.exit(2); }
  console.log(`== ${BOTS} bots, ${PROCS} processes, scenario ${scenario}, ${SECONDS} s measured, target ${http} (build ${st0.build}, ccu ${st0.ccu})`);

  const RUN = Array.from({ length: 3 }, () => L26[Math.floor(Math.random() * 26)]).join('');
  let tokens = [];
  if (tokFile && existsSync(tokFile)) { tokens = JSON.parse(readFileSync(tokFile, 'utf8')).tokens || []; console.log(`   reusing ${tokens.filter(Boolean).length} accounts from ${tokFile}`); }
  const per = Math.ceil(BOTS / PROCS);
  const kids = [];
  for (let p = 0; p < PROCS; p++) {
    const first = p * per, count = Math.min(per, BOTS - first); if (count <= 0) break;
    const cfg = { url, build: st0.build, run: RUN, first, count, modes, stagger: STAGGER, tokens: tokens.slice(first, first + count) };
    const self = fileURLToPath(import.meta.url);
    const child = cpuList && process.platform === 'linux'
      ? spawn('taskset', ['-c', cpuList, process.execPath, self, '--child', JSON.stringify(cfg)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
      : fork(self, ['--child', JSON.stringify(cfg)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const k = { p, count, child, last: null, joined: false, final: null };
    child.on('message', m => { if (m.joined) k.joined = true; if (m.final) k.final = m; else k.last = m; });
    child.on('exit', code => { if (!k.final) k.died = code; });
    kids.push(k);
  }

  // login phase: sample while they join
  const t0 = Date.now(); const loginSamples = [];
  while (!kids.every(k => k.joined || k.died != null)) {
    await sleep(2000);
    const st = await status(); if (st) loginSamples.push({ t: Date.now() - t0, ccu: st.ccu, p99: st.tick?.p99, max: st.tick?.max });
    if (Date.now() - t0 > 15 * 60000) { console.error('login phase took over 15 min'); break; }
  }
  const joinMs = Date.now() - t0;
  const joinedN = kids.reduce((a, k) => a + (k.last?.bots || 0), 0), failedN = kids.reduce((a, k) => a + (k.last?.failed || 0), 0);
  const SETTLE = +arg('settle', 65);   // /status tick numbers cover the last minute: wait that long so logins do not count as play
  console.log(`   joined ${joinedN}/${BOTS} in ${(joinMs / 1000).toFixed(0)} s (${failedN} failed); settling ${SETTLE} s`);
  await sleep(SETTLE * 1000);

  // measured window
  const samples = []; const tm = Date.now();
  const b0 = kids.reduce((a, k) => a + (k.last?.wireBytes || 0), 0);
  while (Date.now() - tm < SECONDS * 1000) {
    await sleep(2000);
    const st = await status();
    if (st) samples.push({ t: Date.now() - tm, ccu: st.ccu, p50: st.tick?.p50, p99: st.tick?.p99, max: st.tick?.max, worst10m: st.tick?.worst10m, kbOut: (st.bytesOutPerSec || 0) / 1024, heapMB: st.heapMB, rssMB: st.rssMB, journal: st.journal || null });
    if (samples.length % 15 === 0 && st) console.log(`   t+${Math.round((Date.now() - tm) / 1000)}s ccu ${st.ccu} tick p50 ${st.tick?.p50} p99 ${st.tick?.p99} max ${st.tick?.max} | out ${((st.bytesOutPerSec || 0) / 1024).toFixed(0)} KB/s heap ${st.heapMB} MB | load ${loadavg()[0].toFixed(1)}`);
  }
  const secs = (Date.now() - tm) / 1000;
  const b1 = kids.reduce((a, k) => a + (k.last?.wireBytes || 0), 0);
  for (const k of kids) k.child.send('stop');
  for (let i = 0; i < 60 && !kids.every(k => k.final || k.died != null); i++) await sleep(500);

  // report
  const tot = kids.reduce((a, k) => { const s = k.final || k.last || {}; for (const [n, v] of Object.entries(s)) if (typeof v === 'number') a[n] = (a[n] || 0) + v; return a; }, {});
  const q = (arr, p) => { const s = arr.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
  const p99s = samples.map(s => s.p99), maxes = samples.map(s => s.max);
  const res = {
    when: new Date().toISOString(), from: hostname(), fromCpus: cpus().length, fromMemGB: +(totalmem() / 2 ** 30).toFixed(1), rehearsal, target: http, build: st0.build, scenario,
    bots: BOTS, procs: PROCS, joined: joinedN, failedJoins: failedN, joinSeconds: +(joinMs / 1000).toFixed(1), measuredSeconds: +secs.toFixed(0),
    tick: { p50median: q(samples.map(s => s.p50), 0.5), p99median: q(p99s, 0.5), p99worstMinute: q(p99s, 1), maxWorst: q(maxes, 1), worst10mAtEnd: samples.at(-1)?.worst10m ?? null, loginP99Worst: q(loginSamples.map(s => s.p99), 1), loginMaxWorst: q(loginSamples.map(s => s.max), 1) },
    kbPerClient: +(((b1 - b0) / Math.max(1, joinedN) / secs) / 1024).toFixed(2),
    serverOutKBs: +(q(samples.map(s => s.kbOut), 0.5) || 0).toFixed(0),
    heapMBmax: q(samples.map(s => s.heapMB), 1), rssMBmax: q(samples.map(s => s.rssMB), 1),
    bots_totals: { kills: tot.kills, deaths: tot.deaths, casts: tot.casts, errors: tot.errors, kicks: tot.kicks, refusals: tot.refusals, staleAtEnd: tot.stale, rejoins: (tot.joins || 0) - joinedN },
    clientLoad: +loadavg()[0].toFixed(1),
    gate,
  };
  const checks = [
    ['joined share', joinedN / BOTS, '>=', gate.join],
    ['tick p99 (median minute)', res.tick.p99median, '<=', gate.p99],
    ['worst tick in the window', res.tick.maxWorst, '<', gate.worst],
    ['KB/s per client', res.kbPerClient, '<=', gate.kb],
    ['bots with no snapshot for 5 s at the end', tot.stale || 0, '<=', Math.ceil(BOTS * 0.02)],
  ];
  res.checks = checks.map(([what, v, op, lim]) => ({ what, value: v, op, limit: lim, ok: v != null && (op === '<=' ? v <= lim : op === '<' ? v < lim : v >= lim) }));
  res.passed = res.checks.every(c => c.ok);
  mkdirSync(outDir, { recursive: true });
  const stamp = res.when.replace(/[:.]/g, '-');
  const file = join(outDir, `load-${scenario}-${BOTS}-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ ...res, samples, loginSamples }, null, 1));
  if (tokFile) {
    const all = tokens.slice(); for (const k of kids) (k.final?.tokens || []).forEach((t, i) => { if (t) all[k.p * per + i] = t; });
    writeFileSync(tokFile, JSON.stringify({ target: http, note: 'load-test accounts on the LOAD server only; worthless anywhere else', tokens: all }));
  }
  console.log('\n== result: ' + (res.passed ? 'PASSED' : 'FAILED') + (rehearsal ? '  (same-VM rehearsal: the bots share this machine with the server)' : ''));
  for (const c of res.checks) console.log(`   ${c.ok ? 'ok  ' : 'FAIL'} ${c.what}: ${c.value} (${c.op} ${c.limit})`);
  console.log(`   joins took ${res.joinSeconds} s; login-phase worst tick ${res.tick.loginMaxWorst} ms; heap max ${res.heapMBmax} MB; bots: kills ${tot.kills} deaths ${tot.deaths} errors ${tot.errors} kicks ${tot.kicks}`);
  console.log(`   report: ${file}`);
  process.exit(res.passed ? 0 : 1);
}
