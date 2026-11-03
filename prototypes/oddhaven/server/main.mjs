#!/usr/bin/env node
// The Oddhaven room server: one Node process that runs every room and serves the page beside them.
//   node server/main.mjs [port] [--port 8561] [--host 0.0.0.0] [--https-port 8563] [--certs <dir>] [--public <dir>] [--build <id>] [--data <dir>] [--dev]
//   --public <dir>     serve a published copy (tools/publish-oddhaven.sh) instead of the working tree
//   --data <dir>       where rooms/ is kept (default .data/ beside this game)
//   --https-port <n>   also https + wss with the playground's self-signed cert. LAN only: the games.radgh.com droplet is https through Caddy and runs without it
//   --dev              test commands, any room code, a room made by joining it. Never on a public server
// The page is served here as well as on the playground's own servers, because on a phone an https page can only open wss to a host:port whose certificate it has accepted,
// so one origin for both means one warning. GET /healthz ("ok"), GET /status (JSON, with build), GET /rooms (the public list), WebSocket at /ws.
// Env: RGS_API (where account tickets are redeemed), RGS_ADMIN_SECRET (switches on the admin feed), PORT.
import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createStaticHandler } from './static.js';
import { createHub } from './hub.mjs';
import { createStore } from './store.mjs';
import { createRedeemer, createAdminFeed } from '../../tumblefair/server/rgs.mjs';
import { DATA_FILES } from '../js/sim/data.js';
import { LIMITS } from '../js/sim/protocol.js';
import { buildWorld } from '../js/world/build-world.js';
import { FIRST_MAP } from '../js/world/first-map.js';
import { townFromWorld } from '../js/sim/world-town.js';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), PLAY = resolve(GAME, '..', '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const positional = /^\d+$/.test(process.argv[2] ?? '') ? +process.argv[2] : null;
const port = +arg('port', positional ?? process.env.PORT ?? 8561), host = arg('host', '0.0.0.0'), publicDir = arg('public', null), dev = process.argv.includes('--dev');
const httpsPort = arg('https-port', null) ? +arg('https-port', null) : null;
const build = arg('build', 'dev'), dataDir = resolve(arg('data', join(GAME, '.data')));
const num = (name, def) => { const v = arg(name, null); return v === null ? def : +v; };
mkdirSync(dataDir, { recursive: true });

const log = (what, d) => console.log(new Date().toISOString(), what, JSON.stringify(d));
const data = Object.fromEntries(DATA_FILES.map(f => [f, JSON.parse(readFileSync(join(GAME, `data/${f}.json`), 'utf8'))]));
const town = townFromWorld(buildWorld(FIRST_MAP), data.buildings);
const store = createStore(join(dataDir, 'rooms'));
store.prune();
const hub = createHub({ data, town, store, redeem: createRedeemer({ game: 'oddhaven', log }), log, options: { dev, ...(arg('max-rooms') ? { maxRooms: +arg('max-rooms') } : null), ...(arg('sleep-empty') ? { sleepEmptyMs: +arg('sleep-empty') } : null) }, roomOptions: { grace: num('grace', 90000) } });

// The visitor's address: behind a proxy on this machine (Caddy on the droplet sends X-Forwarded-For) every peer is loopback, so the proxy's header is believed, but only from loopback.
const ipOf = req => {
  const peer = req.socket.remoteAddress || '', loop = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer);
  if (!loop) return peer;
  const fwd = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd ? String(fwd) : peer;
};
const serveStatic = createStaticHandler(publicDir ? resolve(publicDir) : PLAY, { allowAll: !!publicDir });
const started = Date.now(), cpu0 = process.cpuUsage();
const admin = createAdminFeed({ game: 'oddhaven', build, dataDir, started, online: () => hub.status(), ratingKey: 'town', names: {} });
const json = (res, body, extra = {}) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', ...extra }); res.end(JSON.stringify(body)); };
function onRequest(req, res) {
  const path = req.url.split('?')[0];
  if (path === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/status') {     // read by pages on other origins (the playground's own ports, a static public copy) to learn whether co-op is here at all
    const up = (Date.now() - started) / 1000, c = process.cpuUsage(cpu0);
    json(res, { server: 'oddhaven', build, uptime: Math.round(up), cpuPct: Math.round((c.user + c.system) / 1e4 / Math.max(1, up) * 10) / 10, rssMB: Math.round(process.memoryUsage().rss / 1048576), ...hub.status() });
    return;
  }
  if (path === '/rooms') { json(res, { rooms: hub.list() }); return; }
  if (path.startsWith('/internal/') && admin.handle(req, res, path)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (!serveStatic(req, res)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); }
}

/** Which pages may open a socket: this server's own host (any port on the LAN), and the public copies. */
const GOOD_ORIGIN = /^https:\/\/((.+\.)?games\.radgh\.com|radgh\.github\.io)$/;
function originOk(origin, hostHeader) {
  if (!origin) return true;      // not a browser: still rate limited like anyone
  try { const u = new URL(origin); return u.hostname === String(hostHeader).replace(/:\d+$/, '') || GOOD_ORIGIN.test(u.origin); } catch { return false; }
}
// Big messages (the town's roster on joining) are worth squeezing; small ones are not worth the phone's or the server's time.
const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.saveFrame, perMessageDeflate: process.argv.includes('--no-deflate') ? false : { threshold: 1400, zlibDeflateOptions: { level: 1 }, serverNoContextTakeover: true, clientNoContextTakeover: true } });
function onUpgrade(req, socket, head) {
  if (req.url.split('?')[0] !== '/ws') { socket.destroy(); return; }
  if (!originOk(req.headers.origin, req.headers.host)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    socket.setNoDelay?.(true);
    const c = hub.accept({ ip: ipOf(req), send: d => { if (ws.readyState === 1) ws.send(d); }, close: () => { try { ws.close(); } catch { /* gone */ } }, busy: () => ws.bufferedAmount > 96 * 1024 });
    ws.on('message', (d, isBinary) => { c.message(isBinary ? null : d.toString('utf8'), performance.now()); });
    ws.on('close', () => c.closed(performance.now()));
    ws.on('error', () => {});
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  });
}
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* closed */ } } }, 15000);

const server = http.createServer(onRequest);
server.on('upgrade', onUpgrade);
server.listen(port, host, () => console.log(`oddhaven ${build} on http://${host}:${port}/  (${publicDir ? 'published copy ' + publicDir : 'working tree'})${dev ? '  DEV' : ''}`));
if (httpsPort) {
  const dir = arg('certs', join(PLAY, 'tools/certs')), C = { cert: join(dir, 'dev.crt'), key: join(dir, 'dev.key') };
  if (existsSync(C.cert) && existsSync(C.key)) {
    const s = https.createServer({ cert: readFileSync(C.cert), key: readFileSync(C.key) }, onRequest);
    s.on('upgrade', onUpgrade);
    s.listen(httpsPort, host, () => console.log(`oddhaven ${build} on https://${host}:${httpsPort}/  (self-signed)`));
  } else console.log(`no certificate at ${C.cert}: https off (make one with tools/make-dev-cert.sh)`);
}

// 10 a second: enough for 4 ticks and the relay, and every wake-up costs a phone-sized server something
setInterval(() => hub.pump(performance.now()), 100);
const bye = () => { try { hub.shutdown(); } catch (e) { console.error(e); } process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
process.on('uncaughtException', e => { console.error('[oddhaven] uncaught', e); });
