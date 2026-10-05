#!/usr/bin/env node
// Thousandvale game server (stream A).
//   STAGE 1 (default, --procs 0): one Node process = static client + gateway (/gw) + province process 0
//     (/p/0) + /status, around the same pure sim that runs in the browser Worker (js/sim/world.js).
//   STAGE 2 (--procs N, PLAN §8.1): this process is the GATEWAY (static, /gw, /status) and forks N
//     province processes (server/province-proc.mjs). A game socket for /p/<n> is accepted here and its file
//     descriptor handed to child n, which owns it from then on: no game traffic passes through the gateway.
//     Gateway <-> children talk over the IPC channel (the bus messages in js/sim/gateway.js). Stage 2 needs
//     --db pg (every process reads and writes the same database).
//
//   node server/main.mjs [--port 8491] [--host 0.0.0.0] [--db pg|json|memory] [--db-file data.json]
//                        [--province torbor_downs[,test]] [--terrain test|standin] [--procs 0|N]
//                        [--build dev] [--rules auto|v0] [--linger 5000] [--max-per-ip 4]
//                        [--save-every 60000] [--process p0] [--env dev|stable] [--public <dir>] [--journal-ms 2000]
//
// --province  provinces (keys of data/world/province-map.json = a whole province of stitched zone bakes) or
//             single zones (data/zones/<key>); default: torbor_downs when the world is baked, else test.
// --env       dev | stable (default: stable on port 8490, else dev). With --db pg the database name must end
//             in _<env> (thousandvale_dev / thousandvale_stable) or the server refuses to start.
// --public    serve ONLY this published folder (tools/publish-thousandvale.sh, stream H).
// Endpoints:  /status (JSON), /status.html, /healthz (200 "ok" once the world ticks).
// pg settings come from PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD or DATABASE_URL (ops/start-dev.sh).
// SIGTERM / SIGINT: tell everyone, save everyone, exit.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fork } from 'node:child_process';
import { WebSocketServer } from 'ws';

import { createWorld } from '../js/sim/world.js';
import { createGateway } from '../js/sim/gateway.js';
import { startTicker } from '../js/net/clock.js';
import { MAX_FRAME } from '../js/net/protocol.js';
import { createStaticHandler } from './static.js';
import { statusPage } from './status-page.js';
import { turnstileFromEnv } from './turnstile.js';
import { GAME, PLAYGROUND, log, loadRules, makeStore, loadClasses, loadLayouts, defaultProvinces } from './load.mjs';
import { wireSocket, startPinger } from './ws-conn.mjs';

function args(argv) {
  const o = { port: 8491, host: '0.0.0.0', db: 'memory', dbFile: join(GAME, '.data/dev-store.json'), build: 'dev', rules: 'auto', terrain: 'test', linger: 5000, maxPerIp: 4, saveEvery: 60000, process: 'p0', env: null, publicDir: null, journalMs: 2000, provinces: null, procs: 0 };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    const take = () => { i++; return v; };
    if (k === '--port') o.port = +take();
    else if (k === '--host') o.host = take();
    else if (k === '--db') o.db = take();
    else if (k === '--db-file') o.dbFile = resolve(take());
    else if (k === '--build') o.build = take();
    else if (k === '--rules') o.rules = take();
    else if (k === '--terrain') { o.terrain = take(); o.provinces = [o.terrain]; }
    else if (k === '--province' || k === '--provinces') o.provinces = take().split(',');
    else if (k === '--procs') o.procs = +take();
    else if (k === '--linger') o.linger = +take();
    else if (k === '--max-per-ip') o.maxPerIp = +take();
    else if (k === '--save-every') o.saveEvery = +take();
    else if (k === '--process') o.process = take();
    else if (k === '--env') o.env = take();
    else if (k === '--public') o.publicDir = resolve(take());
    else if (k === '--journal-ms') o.journalMs = +take();   // lease owner prefix: give a second server on the same DB its own name
    else if (k === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n')); process.exit(0); }
    else throw new Error('unknown flag ' + k);
  }
  return o;
}

/** Client IP: trust CF-Connecting-IP only when the peer is the local tunnel (loopback). */
function clientIp(req) {
  const peer = req.socket.remoteAddress || '';
  const loop = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  const cf = req.headers['cf-connecting-ip'];
  if (loop && cf) return { ip: String(cf), loop: false };
  return { ip: peer, loop };
}

export async function startServer(o) {
  const now = () => performance.now();
  const env = o.env || process.env.TV_ENV || (o.port === 8490 ? 'stable' : 'dev');
  if (!['dev', 'stable'].includes(env)) throw new Error('--env must be dev or stable');
  if (o.db === 'pg') {
    const dbName = process.env.PGDATABASE || (process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) : '');
    if (!dbName.endsWith('_' + env)) throw new Error(`refusing to start: env ${env} but database "${dbName}" (expected *_${env}); dev and stable never share a database`);
  }
  if (o.procs > 0 && o.db !== 'pg') throw new Error('--procs needs --db pg (every process shares one database)');
  const provinces = o.provinces || defaultProvinces();
  const verifyHuman = turnstileFromEnv(process.env, { log });
  const humanSiteKey = verifyHuman ? process.env.TV_TURNSTILE_SITEKEY || null : null;
  const store = await makeStore(o);
  const { createRules, rules } = await loadRules(o.rules);
  const classes = loadClasses();
  const common = { store, build: o.build, classes, now, log, verifyHuman, humanSiteKey };

  // ---- stage 1: everything here; stage 2: the gateway here, provinces in children ----
  let world = null, gateway = null, children = [];
  if (o.procs > 0) {
    await store.init();
    const assign = provinces.map((p, i) => ({ province: p, proc: i % o.procs }));
    const { events } = await loadLayouts([]);          // the director learns events from the children's hello
    gateway = createGateway({ ...common, events, starterProvince: provinces[0] });
    for (let n = 0; n < o.procs; n++) children.push(spawnChild(n, assign.filter(a => a.proc === n).map(a => a.province)));
  } else {
    const { layouts, events, encounterInfo } = await loadLayouts(provinces);
    world = createWorld({ ...common, layouts, events, encounterInfo, createRules, lingerMs: o.linger, saveEveryMs: o.saveEvery, processName: o.process, journalMs: o.journalMs });
    await world.init();
  }

  function spawnChild(n, provs) {
    const c = { n, provs, proc: null, restarts: 0, bus: null, handlers: [], status: null };
    c.bus = { send: m => { if (c.proc && c.proc.connected) c.proc.send({ bus: m }); }, on: fn => c.handlers.push(fn) };
    const start = () => {
      const argv = [JSON.stringify({ n, provinces: provs, db: o.db, build: o.build, rules: o.rules, linger: o.linger, saveEvery: o.saveEvery, journalMs: o.journalMs, process: `${o.process}.${n}`, env })];
      c.proc = fork(join(GAME, 'server/province-proc.mjs'), argv, { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      c.proc.on('message', m => { if (m && m.bus) for (const h of c.handlers) h(m.bus); else if (m && m.ready) c.ready = true; });
      c.proc.on('exit', (code, sig) => {
        c.ready = false;
        if (stopping) return;
        log('province process exited; restarting', { n, code, sig });
        c.restarts++;
        setTimeout(start, Math.min(5000, 500 * c.restarts));
      });
    };
    start();
    gateway.attach(n, c.bus, { provinces: provs });
    return c;
  }

  const tick = () => (world ? world.step() : gateway.step());
  const tickStats = world ? world.tickStats : null;
  const serveStatic = o.publicDir ? createStaticHandler(o.publicDir, { allowAll: true }) : createStaticHandler(PLAYGROUND);
  function status() {
    const mem = process.memoryUsage();
    const base = { env, human: !!verifyHuman, rules, provinces, procs: o.procs, heapMB: Math.round(mem.heapUsed / 1048576), rssMB: Math.round(mem.rss / 1048576) };
    if (world) return { ...world.status(), ...base };
    const g = gateway.status();
    const kids = g.procs.map(p => p.status || {});
    const worst = kids.reduce((w, k) => (k.tick && k.tick.p99 > (w.p99 || 0) ? k.tick : w), {});
    return { server: 'thousandvale', build: o.build, ...base, ccu: kids.reduce((a, k) => a + (k.ccu || 0), 0), tick: worst, gateway: g.gateway, director: g.director, procs: g.procs.map(p => ({ id: p.id, provinces: p.provinces, ...(p.status || {}) })) };
  }
  const healthy = () => (world ? world.tickStats.summary().ticks > 0 : children.every(c => c.ready));

  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(status()));
      return;
    }
    if (path === '/healthz') { const ok = healthy(); res.writeHead(ok ? 200 : 503, { 'Content-Type': 'text/plain' }); res.end(ok ? 'ok' : 'starting'); return; }
    if (path === '/status.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(statusPage()); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (!serveStatic(req, res)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
  const perIp = new Map();
  server.on('upgrade', (req, socket, head) => {
    const path = req.url.split('?')[0];
    const pm = /^\/p\/(\d+)$/.exec(path);
    if (path !== '/gw' && !pm) { socket.destroy(); return; }
    const origin = req.headers.origin;
    if (origin) {
      let ok = false;
      try { ok = new URL(origin).host === req.headers.host; } catch { /* bad origin */ }
      if (!ok) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    }
    const { ip, loop } = clientIp(req);
    const n = perIp.get(ip) || 0;
    if (!loop && n >= o.maxPerIp) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
    if (pm && !world) {
      // stage 2: hand the raw socket to the province process; it does the WebSocket handshake and owns it
      const c = children[+pm[1]];
      if (!c || !c.proc || !c.proc.connected) { socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); socket.destroy(); return; }
      c.proc.send({ sock: { path, method: req.method, url: req.url, headers: req.headers, head: head.toString('base64'), ip } }, socket);
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      perIp.set(ip, (perIp.get(ip) || 0) + 1);
      wireSocket(ws, ip, path, (pth, conn) => (world ? world.accept(pth, conn) : gateway.accept(pth, conn)), () => { const k = (perIp.get(ip) || 1) - 1; if (k > 0) perIp.set(ip, k); else perIp.delete(ip); });
    });
  });
  const pinger = startPinger(wss);

  const ticker = startTicker(tick, { ms: 50, clock: { now, setTimeout, clearTimeout }, onSkip: k => tickStats && tickStats.skip(k) });
  await new Promise((res, rej) => { server.once('error', rej); server.listen(o.port, o.host, res); });
  log('thousandvale server up', { port: o.port, host: o.host, env, human: !!verifyHuman, public: o.publicDir || null, db: store.kind, rules, provinces, procs: o.procs, build: o.build });

  let stopping = null;
  async function stop(code = 'restart') {
    if (stopping) return stopping;
    stopping = (async () => {
      log('stopping: saving everyone');
      ticker.stop(); clearInterval(pinger);
      if (world) await world.shutdown(code);
      await Promise.all(children.map(c => new Promise(r => { if (!c.proc || c.proc.exitCode !== null) return r(); c.proc.once('exit', r); c.proc.send({ stop: code }); setTimeout(() => { try { c.proc.kill('SIGKILL'); } catch { /* gone */ } r(); }, 65000).unref(); })));
      for (const ws of wss.clients) ws.terminate();
      await new Promise(r => server.close(() => r()));
      if (store.close) await store.close();
      log('stopped');
    })();
    return stopping;
  }
  return { server, world, gateway, children, store, stop };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = args(process.argv);
  startServer(o).then(s => {
    const bye = sig => { log('signal ' + sig); s.stop().then(() => process.exit(0), err => { log('stop failed', { err: err.message }); process.exit(1); }); setTimeout(() => process.exit(1), 70000).unref(); };
    process.on('SIGTERM', () => bye('SIGTERM'));
    process.on('SIGINT', () => bye('SIGINT'));
  }, err => { log('failed to start', { err: err.stack }); process.exit(1); });
}
