#!/usr/bin/env node
// Thousandvale game server (stream A), stage 1: one Node process = static client + gateway (/gw) +
// province process 0 (/p/0) + /status, around the same pure sim that runs in the browser Worker.
//
//   node server/main.mjs [--port 8491] [--host 0.0.0.0] [--db pg|json|memory] [--db-file data.json]
//                        [--build dev] [--rules auto|v0] [--terrain test|standin] [--linger 5000]
//                        [--max-per-ip 4] [--save-every 10000] [--process p0]
//
// pg settings come from PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD or DATABASE_URL (ops/start-dev.sh).
// SIGTERM / SIGINT: tell everyone, save everyone, exit (protocol.md §8.4).

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';

import { createWorld } from '../js/sim/world.js';
import { loadZoneTerrain, standInTerrain } from '../js/sim/terrain.js';
import { createMemoryStore } from '../js/sim/store-memory.js';
import { startTicker } from '../js/net/clock.js';
import { MAX_FRAME } from '../js/net/protocol.js';
import { createStaticHandler } from './static.js';
import { statusPage } from './status-page.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(HERE, '..');
const PLAYGROUND = resolve(GAME, '../..');

function args(argv) {
  const o = { port: 8491, host: '0.0.0.0', db: 'memory', dbFile: join(GAME, '.data/dev-store.json'), build: 'dev', rules: 'auto', terrain: 'test', linger: 5000, maxPerIp: 4, saveEvery: 10000, process: 'p0' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    const take = () => { i++; return v; };
    if (k === '--port') o.port = +take();
    else if (k === '--host') o.host = take();
    else if (k === '--db') o.db = take();
    else if (k === '--db-file') o.dbFile = resolve(take());
    else if (k === '--build') o.build = take();
    else if (k === '--rules') o.rules = take();
    else if (k === '--terrain') o.terrain = take();
    else if (k === '--linger') o.linger = +take();
    else if (k === '--max-per-ip') o.maxPerIp = +take();
    else if (k === '--save-every') o.saveEvery = +take();
    else if (k === '--process') o.process = take();   // lease owner prefix: give a second server on the same DB its own name
    else if (k === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n')); process.exit(0); }
    else throw new Error('unknown flag ' + k);
  }
  return o;
}

const log = (msg, extra) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), msg: String(msg), ...(extra && typeof extra === 'object' ? extra : extra !== undefined ? { detail: String(extra) } : {}) }) + '\n');

async function loadRules(mode) {
  const { createRules: v0 } = await import('../js/sim/rules-v0.js');
  if (mode === 'v0') return { createRules: v0, rules: 'v0' };
  const p = join(GAME, 'js/rules/index.js');
  if (existsSync(p)) {
    try {
      const m = await import(pathToFileURL(p).href);
      if (typeof m.createRules === 'function') return { createRules: m.createRules, rules: 'js/rules' };
      log('js/rules/index.js has no createRules export; using the stand-in rules');
    } catch (err) { log('js/rules/index.js failed to load; using the stand-in rules', { err: err.message }); }
  }
  return { createRules: v0, rules: 'v0' };
}

async function makeStore(o) {
  if (o.db === 'pg') { const { createPgStore } = await import('./db/pg-store.js'); return createPgStore({ log }); }
  if (o.db === 'json') { const { createJsonStore } = await import('./db/json-store.js'); return createJsonStore(o.dbFile); }
  return createMemoryStore();
}

function loadTerrain(kind) {
  const f = join(GAME, 'data/zones', kind, 'terrain.bin');
  if (kind !== 'standin' && existsSync(f)) return loadZoneTerrain(readFileSync(f), kind);
  if (kind !== 'standin') log(`terrain ${kind} not baked (${f}); using the stand-in field`);
  return standInTerrain(1, 2048);
}

function loadClasses() {
  try { return JSON.parse(readFileSync(join(PLAYGROUND, 'prototypes/farhold/data/classes.json'), 'utf8')).classes.map(c => c.id); }
  catch { return null; }
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
  const store = await makeStore(o);
  const terrain = loadTerrain(o.terrain);
  const { createRules, rules } = await loadRules(o.rules);
  const world = createWorld({ store, terrain, build: o.build, createRules, classes: loadClasses(), now, log, lingerMs: o.linger, saveEveryMs: o.saveEvery, processName: o.process });
  await world.init();

  const serveStatic = createStaticHandler(PLAYGROUND);
  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (path === '/status') {
      const s = { ...world.status(), rules, terrain: terrain.key || 'standin', heapMB: Math.round(process.memoryUsage().heapUsed / 1048576), rssMB: Math.round(process.memoryUsage().rss / 1048576) };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(s));
      return;
    }
    if (path === '/status.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(statusPage()); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (!serveStatic(req, res)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
  const perIp = new Map();
  server.on('upgrade', (req, socket, head) => {
    const path = req.url.split('?')[0];
    if (path !== '/gw' && !/^\/p\/\d+$/.test(path)) { socket.destroy(); return; }
    const origin = req.headers.origin;
    if (origin) {
      let ok = false;
      try { ok = new URL(origin).host === req.headers.host; } catch { /* bad origin */ }
      if (!ok) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    }
    const { ip, loop } = clientIp(req);
    const n = perIp.get(ip) || 0;
    if (!loop && n >= o.maxPerIp) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      perIp.set(ip, (perIp.get(ip) || 0) + 1);
      const conn = {
        ip,
        send(d) { if (ws.readyState === 1) ws.send(d, { binary: typeof d !== 'string' }); },
        close(code, reason) { try { ws.close(code >= 4000 ? code : 4000, String(reason || '').slice(0, 100)); } catch { /* ignore */ } },
      };
      const h = world.accept(path, conn);
      ws.on('message', (data, isBinary) => {
        if (isBinary) h.message(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        else h.message(data.toString('utf8'));
      });
      ws.on('close', () => { const k = (perIp.get(ip) || 1) - 1; if (k > 0) perIp.set(ip, k); else perIp.delete(ip); h.close(); });
      ws.on('error', () => {});
      // keep idle sockets alive through proxies (Cloudflare closes at ~100 s)
      ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    });
  });
  const pinger = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* ignore */ } }
  }, 30000);

  const ticker = startTicker(() => world.step(), { ms: 50, clock: { now, setTimeout, clearTimeout }, onSkip: k => world.tickStats.skip(k) });
  await new Promise((res, rej) => { server.once('error', rej); server.listen(o.port, o.host, res); });
  log('thousandvale server up', { port: o.port, host: o.host, db: store.kind, rules, terrain: terrain.key || 'standin', build: o.build, owner: world.owner });

  let stopping = null;
  async function stop(code = 'restart') {
    if (stopping) return stopping;
    stopping = (async () => {
      log('stopping: saving everyone');
      ticker.stop(); clearInterval(pinger);
      await world.shutdown(code);
      for (const ws of wss.clients) ws.terminate();
      await new Promise(r => server.close(() => r()));
      if (store.close) await store.close();
      log('stopped');
    })();
    return stopping;
  }
  return { server, world, store, stop, terrain };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = args(process.argv);
  startServer(o).then(s => {
    const bye = sig => { log('signal ' + sig); s.stop().then(() => process.exit(0), err => { log('stop failed', { err: err.message }); process.exit(1); }); setTimeout(() => process.exit(1), 70000).unref(); };
    process.on('SIGTERM', () => bye('SIGTERM'));
    process.on('SIGINT', () => bye('SIGINT'));
  }, err => { log('failed to start', { err: err.stack }); process.exit(1); });
}
