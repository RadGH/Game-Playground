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
//                        [--event-first 120000] [--event-announce 600000] [--event-every 2700000] [--admin-port 8492|0]
//                        [--guests-per-ip-hour 20] [--guests-per-hour 0] [--unlimited-ip <addr>]…
//
// --province  provinces (keys of data/world/province-map.json = a whole province of stitched zone bakes) or
//             single zones (data/zones/<key>); default: torbor_downs when the world is baked, else test.
// --env       dev | stable (default: stable on port 8490, else dev). With --db pg the database name must end
//             in _<env> (thousandvale_dev / thousandvale_stable) or the server refuses to start.
// --public    serve ONLY this published folder (tools/publish-thousandvale.sh, stream H). PUBLIC MODE also means: bind
//             127.0.0.1 unless --host says otherwise; a loopback peer is NOT trusted (the tunnel arrives over loopback,
//             so it gets the same per-address limits as anyone, by its CF-Connecting-IP); security headers on every
//             answer. CF-Connecting-IP is only ever believed from a loopback peer (the local cloudflared).
// --admin-port the admin page (server/admin.mjs), 127.0.0.1 ONLY: default 8492 for stable, 8493 for dev; 0 = off.
//             Token: TV_ADMIN_TOKEN, else <STATE_DIRECTORY or .data>/admin-token (made at first boot, mode 0600).
// Endpoints:  /status (JSON), /status.html, /healthz (200 "ok" once the world ticks), /privacy.json (what is stored).
// --dev-hooks <port> TEST ONLY (server/dev-hooks.mjs): level / give / event / who on 127.0.0.1; refused with --env
//             stable, --public or --procs > 0.
// --guests-per-ip-hour / --guests-per-hour: new guest accounts per address / for everyone together per hour (0 = no
//             realm-wide cap; default 200 on stable). --unlimited-ip (repeatable): an address (a LAN load machine) that
//             skips the guest caps and the per-address socket cap.
// Accounts:   claim/login (scrypt, server/passwords.js) are on; TV_IP_SALT salts the stored hash of a banned address.
// pg settings come from PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD or DATABASE_URL (ops/start-dev.sh).
// SIGTERM / SIGINT: tell everyone, save everyone, exit.

import { mailerFromEnv } from './mail.mjs';
import { rgsLinkFromEnv } from './rgs-link.mjs';
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
import { MAX_FRAME, PROTOCOL_VERSION } from '../js/net/protocol.js';
import { createStaticHandler } from './static.js';
import { statusPage } from './status-page.js';
import { turnstileFromEnv } from './turnstile.js';
import { GAME, PLAYGROUND, log, loadRules, makeStore, loadClasses, loadClassNames, loadLayouts, defaultProvinces, starterOf, feedbackSink, loadEconomy, loadMotd, loadChangelog, runSeedFrom } from './load.mjs';
import { wireSocket, startPinger } from './ws-conn.mjs';
import { hashPassword, verifyPassword } from './passwords.js';
import { createChatFilter } from '../js/sim/chatfilter.js';
import { startAdmin, adminToken } from './admin.mjs';
import { startDevHooks } from './dev-hooks.mjs';

const PRIVACY = readFileSync(join(GAME, 'server/privacy.json'));
/** Answer headers in public mode (PLAN §11): no sniffing, no framing, no referrer leaks. */
const PUBLIC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
function args(argv) {
  const o = { port: 8491, host: '0.0.0.0', hostGiven: false, adminPort: null, devHooks: null, guestsPerIpHour: null, guestsPerHour: null, unlimitedIp: [], db: 'memory', dbFile: join(GAME, '.data/dev-store.json'), build: 'dev', rules: 'auto', terrain: 'test', linger: 5000, maxPerIp: 4, saveEvery: 60000, process: 'p0', env: null, publicDir: null, journalMs: 2000, provinces: null, procs: 0, director: {} };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    const take = () => { i++; return v; };
    if (k === '--port') o.port = +take();
    else if (k === '--host') { o.host = take(); o.hostGiven = true; }
    else if (k === '--admin-port') o.adminPort = +take();
    else if (k === '--dev-hooks') o.devHooks = +take();
    else if (k === '--guests-per-ip-hour') o.guestsPerIpHour = +take();
    else if (k === '--guests-per-hour') o.guestsPerHour = +take();
    else if (k === '--unlimited-ip') o.unlimitedIp.push(take());
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
    else if (k === '--char-limit') o.charLimit = +take();              // owner feedback 9 X6: characters an account may hold (default 20; env TV_CHAR_LIMIT)
    else if (k === '--public') o.publicDir = resolve(take());
    else if (k === '--feedback-file') { const f = take(); o.feedbackFile = f === 'off' ? false : resolve(f); }   // T19: where reports are also appended (default <state>/feedback-<env>.jsonl)
    else if (k === '--journal-ms') o.journalMs = +take();   // lease owner prefix: give a second server on the same DB its own name
    else if (k === '--event-first') { o.director.firstMs = +take(); o.director.demo = true; }   // tests/demos: first event after N ms (any event, no head counts),
    else if (k === '--event-announce') o.director.announceMs = +take(); // announced N ms ahead,
    else if (k === '--event-every') o.director.everyMs = +take();       // and N ms between events
    else if (k === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 25).join('\n')); process.exit(0); }
    else throw new Error('unknown flag ' + k);
  }
  if (o.publicDir && !o.hostGiven) o.host = '127.0.0.1';
  return o;
}

const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
/** Client IP: trust CF-Connecting-IP only when the peer is the local tunnel (loopback). `trustLocal` (dev, not public
 *  mode): a loopback peer without the header is the owner's own bots/tests and skips the per-address limits. */
export function clientIp(req, trustLocal = true) {
  const peer = req.socket.remoteAddress || '';
  const loop = LOOPBACK.includes(peer);
  const cf = req.headers['cf-connecting-ip'];
  if (loop && cf && /^[0-9a-fA-F:.]{2,45}$/.test(String(cf))) return { ip: String(cf), loop: false };
  return { ip: peer, loop: loop && trustLocal };
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
  if (o.devHooks != null && (env === 'stable' || o.publicDir || o.procs > 0)) throw new Error('--dev-hooks is for test servers only (refused with --env stable, --public or --procs)');
  const provinces = o.provinces || defaultProvinces();
  const verifyHuman = turnstileFromEnv(process.env, { log });
  const humanSiteKey = verifyHuman ? process.env.TV_TURNSTILE_SITEKEY || null : null;
  const store = await makeStore(o);
  const { createRules, rules, kitsFor, lightItems, refreshItem } = await loadRules(o.rules);
  const classes = loadClasses();
  const publicMode = !!o.publicDir;
  const chatFilter = createChatFilter();
  const common = {
    runSeed: runSeedFrom(),      // round 11 (World, live #6): a restart rolls new dice (js/sim/province.js runSeed)
    store, build: o.build, classes, classNames: loadClassNames(), now, log, verifyHuman, humanSiteKey, directorOpts: o.director,
    hasher: { hashPassword, verifyPassword }, mailer: mailerFromEnv(process.env, { log }), rgs: rgsLinkFromEnv(process.env, { log }), chatFilter, ipSalt: process.env.TV_IP_SALT || 'thousandvale-' + env,
    // public: nobody skips the per-address limits but the addresses named with --unlimited-ip
    unlimitedIps: [...(publicMode ? ['worker'] : ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'worker']), ...(o.unlimitedIp || [])],
    guestsPerIpPerHour: o.guestsPerIpHour ?? 20,
    guestsPerHour: o.guestsPerHour ?? (env === 'stable' ? 200 : 0),
    // play-test 5: C's starter kits for `create.kit` (T5); every feedback report also goes to <state>/feedback-<env>.jsonl (T19)
    env, serverName: process.env.TV_SERVER_NAME || process.env.TV_PUBLIC_HOST || null, charLimit: o.charLimit || +process.env.TV_CHAR_LIMIT || null, motd: loadMotd(), changelog: loadChangelog(),      // owner feedback 9: which server a report came from; X6; X1
    economy: loadEconomy(), kitsFor: kitsFor || null, lightItems: lightItems || null, refreshItem: refreshItem || null, feedbackSink: o.feedbackFile === false ? null : feedbackSink(env, o.feedbackFile || undefined),
  };
  const unlimitedSockets = new Set(o.unlimitedIp || []);

  // ---- stage 1: everything here; stage 2: the gateway here, provinces in children ----
  let world = null, gateway = null, children = [];
  if (o.procs > 0) {
    await store.init();
    const assign = provinces.map((p, i) => ({ province: p, proc: i % o.procs }));
    const { events, directorRules } = await loadLayouts([]);          // the director learns events from the children's hello
    gateway = createGateway({ ...common, events, starterProvince: starterOf(provinces), directorOpts: { ...o.director, rules: directorRules || {} } });
    for (let n = 0; n < o.procs; n++) children.push(spawnChild(n, assign.filter(a => a.proc === n).map(a => a.province)));
  } else {
    const { layouts, events, encounterInfo, directorRules } = await loadLayouts(provinces);
    world = createWorld({ ...common, directorOpts: { ...o.director, rules: directorRules || {} }, eventSize: directorRules && directorRules.size, realmNearM: directorRules && directorRules.nearMetres, layouts, events, encounterInfo, createRules, lingerMs: o.linger, saveEveryMs: o.saveEvery, processName: o.process, journalMs: o.journalMs });
    await world.init();
  }

  function spawnChild(n, provs) {
    const c = { n, provs, proc: null, restarts: 0, bus: null, handlers: [], status: null };
    c.bus = { send: m => { if (c.proc && c.proc.connected) c.proc.send({ bus: m }); }, on: fn => c.handlers.push(fn) };
    const start = () => {
      const argv = [JSON.stringify({ n, provinces: provs, db: o.db, build: o.build, rules: o.rules, linger: o.linger, saveEvery: o.saveEvery, journalMs: o.journalMs, process: `${o.process}.${n}`, env, serverName: process.env.TV_SERVER_NAME || process.env.TV_PUBLIC_HOST || null, feedbackFile: o.feedbackFile ?? null })];
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
    return { server: 'thousandvale', build: o.build, protocol: PROTOCOL_VERSION, ...base, ccu: kids.reduce((a, k) => a + (k.ccu || 0), 0), tick: worst, rooms: kids.flatMap(k => k.rooms || []), bytesOutPerSec: kids.reduce((a, k) => a + (k.bytesOutPerSec || 0), 0), gateway: g.gateway, director: g.director, procs: g.procs.map(p => ({ id: p.id, provinces: p.provinces, ...(p.status || {}) })) };
  }
  const healthy = () => (world ? world.tickStats.summary().ticks > 0 : children.every(c => c.ready));

  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (publicMode) for (const [k, v] of Object.entries(PUBLIC_HEADERS)) res.setHeader(k, v);
    if (path === '/changelog.json') { let body = '{"entries":[]}'; try { body = readFileSync(join(GAME, 'data/ops/changelog.json')); } catch { /* none yet */ } res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(body); return; }      // Y30
    if (path === '/privacy.json') { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=300' }); res.end(PRIVACY); return; }
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
    const { ip, loop } = clientIp(req, !publicMode);
    const n = perIp.get(ip) || 0;
    if (!loop && !unlimitedSockets.has(ip) && n >= o.maxPerIp) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
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

  // the admin page: 127.0.0.1 only, its own port, a local token (PLAN §11.7)
  let admin = null;
  const adminPort = o.adminPort ?? (env === 'stable' ? 8492 : 8493);
  if (adminPort > 0) {
    const tokenFile = process.env.TV_ADMIN_TOKEN_FILE || join(process.env.STATE_DIRECTORY || join(GAME, '.data'), 'admin-token');
    const { token, from } = adminToken({ tokenFile });
    try {
      admin = await startAdmin({ port: adminPort, gateway: world ? world.gateway : gateway, status, store, log, token });
      log('admin token', { from: from === 'env' ? 'TV_ADMIN_TOKEN' : from });      // where it is, never the token
    } catch (err) { log('admin page not started', { port: adminPort, err: err.message }); }
  }

  let devHooks = null;
  if (o.devHooks != null) devHooks = await startDevHooks({ port: o.devHooks, world, log });

  let stopping = null;
  async function stop(code = 'restart') {
    if (stopping) return stopping;
    stopping = (async () => {
      log('stopping: saving everyone');
      ticker.stop(); clearInterval(pinger);
      if (admin) await admin.close();
      if (devHooks) await devHooks.close();
      if (world) await world.shutdown(code);
      await Promise.all(children.map(c => new Promise(r => { if (!c.proc || c.proc.exitCode !== null) return r(); c.proc.once('exit', r); c.proc.send({ stop: code }); setTimeout(() => { try { c.proc.kill('SIGKILL'); } catch { /* gone */ } r(); }, 65000).unref(); })));
      for (const ws of wss.clients) ws.terminate();
      await new Promise(r => server.close(() => r()));
      if (store.close) await store.close();
      log('stopped');
    })();
    return stopping;
  }
  return { server, world, gateway, children, store, stop, get admin() { return admin; }, get devHooks() { return devHooks; } };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = args(process.argv);
  startServer(o).then(s => {
    const bye = sig => { log('signal ' + sig); s.stop().then(() => process.exit(0), err => { log('stop failed', { err: err.message }); process.exit(1); }); setTimeout(() => process.exit(1), 70000).unref(); };
    process.on('SIGTERM', () => bye('SIGTERM'));
    process.on('SIGINT', () => bye('SIGINT'));
  }, err => { log('failed to start', { err: err.stack }); process.exit(1); });
}
