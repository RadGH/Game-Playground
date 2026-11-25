#!/usr/bin/env node
// The Oathwild world server: one Node process that runs every open world (the page itself is served by the
// playground — 8400/8401 on the LAN, games.radgh.com/playground/… live).
//   node server/main.mjs [--port 8661] [--host 0.0.0.0] [--build <id>] [--https-port 8663] [--certs <dir>] [--saves <dir>]
//   --https-port <n>   also serve wss with the playground's self-signed cert for the https pages on the LAN (8441/8442:
//                      browsers only expose gamepads on a secure page).
//   --saves <dir>      where worlds and characters are kept (default prototypes/oathwild/saves/<build kind>)
// GET /healthz ("ok") and GET /status (JSON), also under /ws/oathwild/. WebSocket at /ws and /ws/oathwild.
// Admin feed: /internal/admin/feed + /internal/admin/action when RGS_ADMIN_SECRET is set.
// SIGTERM / SIGINT: every world is saved, sockets close with 1012 (service restart) so pages reconnect by themselves.
import http from 'node:http';
import https from 'node:https';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createHub } from './hub.js';
import { createStore } from './store.js';
import { createRedeemer } from './rgs.mjs';
import { bootRules } from '../js/rules/boot.js';
import { bootWorld } from '../js/world/boot.js';
import { scatter } from '../js/world/scatter.js';
import { createGround } from '../js/game/ground.js';
import { MAX_FRAME, STEP_HZ } from '../js/net/protocol.js';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), PLAY = resolve(GAME, '..', '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const port = +arg('port', process.env.PORT || 8661), host = arg('host', '0.0.0.0');
const httpsPort = arg('https-port', null) ? +arg('https-port', null) : null;
const build = arg('build', 'dev');
const savesDir = resolve(arg('saves', join(GAME, 'saves', build.startsWith('stable') ? 'stable' : build === 'test' ? 'test' : 'dev')));

const log = (what, d) => console.log(new Date().toISOString(), what, JSON.stringify(d));
const t0 = Date.now();
const rules = await bootRules({ seed: 7 });
const W = await bootWorld({ regions: rules.data.regions });
const scattered = scatter(W.terrain, W.data.placements);
const ground = createGround(W.terrain, W.data.placements, scattered, W.town);
log('server.boot', { ms: Date.now() - t0, saves: savesDir });

const store = createStore(savesDir);
const hub = createHub({ rules, W, ground, store, build, log, randomToken: () => randomBytes(18).toString('base64url'), redeem: createRedeemer({ game: 'oathwild', log }) });
const started = Date.now(), cpu0 = process.cpuUsage();

const ipOf = req => {
  const peer = req.socket.remoteAddress || '', loop = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer);
  if (!loop) return peer;
  const fwd = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd ? String(fwd) : peer;
};
const secret = process.env.RGS_ADMIN_SECRET || '';
const same = (a, b) => { const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(x, y); };
function statusBody() {
  const up = (Date.now() - started) / 1000, c = process.cpuUsage(cpu0);
  return { server: 'oathwild', build, uptime: Math.round(up), cpuPct: Math.round((c.user + c.system) / 1e4 / Math.max(1, up) * 10) / 10, rssMB: Math.round(process.memoryUsage().rss / 1048576), stepHz: STEP_HZ, ...hub.status() };
}
function onRequest(req, res) {
  const path = req.url.split('?')[0];
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(body)); };
  if (path === '/internal/admin/feed') {
    if (!secret) { res.writeHead(404); res.end('not found'); return; }
    const given = req.headers['x-rgs-admin'];
    if (typeof given !== 'string' || !same(given, secret)) return json(403, { ok: false });
    const st = hub.status();
    return json(200, { game: 'oathwild', build, uptime_s: Math.round((Date.now() - started) / 1000), online: { rooms: st.worlds, players: st.players }, reports: [], ratings: [], counts: { days: [], totals: { visitors: 0, events: {} } }, status: st, rooms: hub.detail() });
  }
  if (path === '/healthz' || path === '/ws/oathwild/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/status' || path === '/ws/oathwild/status') return json(200, statusBody());
  if (path === '/' ) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Oathwild world server. The game page is served by the playground.'); return; }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
}

function originOk(origin, reqHost) {
  if (!origin) return true;
  let o; try { o = new URL(origin); } catch { return false; }
  const h = String(reqHost || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return o.hostname === 'games.radgh.com' || o.hostname.endsWith('.games.radgh.com') || o.hostname === h || o.hostname === 'localhost' || o.hostname === '127.0.0.1';
}
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: { threshold: 256, zlibDeflateOptions: { level: 3 } } });
const perIp = new Map(), MAX_PER_IP = 16;
let closing = false;
function onUpgrade(req, socket, head) {
  const path = req.url.split('?')[0];
  if (closing || (path !== '/ws' && path !== '/ws/oathwild')) { socket.destroy(); return; }
  if (!originOk(req.headers.origin, req.headers.host)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  const ip = ipOf(req);
  if ((perIp.get(ip) || 0) >= MAX_PER_IP) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    socket.setNoDelay?.(true);
    const h = hub.accept({ ip, send: d => { if (ws.readyState === 1) ws.send(d); } });
    ws.on('message', (d, isBinary) => { if (!isBinary) h.message(d.toString('utf8')); });
    ws.on('close', () => { const k = (perIp.get(ip) || 1) - 1; if (k > 0) perIp.set(ip, k); else perIp.delete(ip); h.close(); });
    ws.on('error', () => {});
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  });
}
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* closed */ } } }, 20000);

const servers = [http.createServer(onRequest)];
servers[0].on('upgrade', onUpgrade);
servers[0].listen(port, host, () => console.log(`oathwild worlds ${build} on ws://${host}:${port}/ws`));
if (httpsPort) {
  const certDir = arg('certs', join(PLAY, 'tools/certs'));
  const C = { cert: join(certDir, 'dev.crt'), key: join(certDir, 'dev.key') };
  if (existsSync(C.cert) && existsSync(C.key)) {
    const s = https.createServer({ cert: readFileSync(C.cert), key: readFileSync(C.key) }, onRequest);
    s.on('upgrade', onUpgrade);
    s.listen(httpsPort, host, () => console.log(`oathwild worlds ${build} on wss://${host}:${httpsPort}/ws (self-signed)`));
    servers.push(s);
  } else console.log(`no certificate at ${C.cert} — wss off`);
}

// The worlds' clock: 20 steps a second, catching up at most 3 steps after a stall (then it lets the time go).
const STEP_MS = 1000 / STEP_HZ;
let last = performance.now(), owed = 0;
const timer = setInterval(() => { const t = performance.now(); owed = Math.min(owed + (t - last), STEP_MS * 3); last = t; while (owed >= STEP_MS) { owed -= STEP_MS; hub.step(); } }, 5);

function bye(sig) {
  if (closing) return; closing = true;
  log('server.stop', { sig, ...hub.status() });
  clearInterval(timer);
  hub.shutdown();
  for (const ws of wss.clients) { try { ws.close(1012, 'restart'); } catch { /* gone */ } }
  for (const s of servers) s.close();
  setTimeout(() => process.exit(0), 600).unref();
}
process.on('SIGTERM', () => bye('SIGTERM')); process.on('SIGINT', () => bye('SIGINT'));
