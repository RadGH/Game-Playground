#!/usr/bin/env node
// The Overdrive Frame co-op server: one Node process that runs every online room (the page itself is served by the
// playground — games.radgh.com/playground/… live, 8400/8401 on the LAN — so solo play never needs this server).
//   node server/main.mjs [--port 8620] [--host 0.0.0.0] [--build <id>] [--https-port 8622] [--certs <dir>]
//   --https-port <n>   also serve wss with the playground's self-signed cert (tools/certs/dev.crt + dev.key) for the
//                      https pages on the LAN (8441/8442: browsers only expose gamepads on a secure page). The
//                      games.radgh.com droplet is https through Caddy, which passes /ws/overdrive-frame here.
// GET /healthz ("ok") and GET /status (JSON). WebSocket at /ws (and /ws/overdrive-frame behind Caddy).
// Snapshots are compressed (permessage-deflate): they are JSON full of repeating keys and numbers.
import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createHub } from './hub.js';
import { loadData } from './data.js';
import { MAX_FRAME, STEP_HZ } from '../js/net/protocol.js';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), PLAY = resolve(GAME, '..', '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const port = +arg('port', process.env.PORT || 8620), host = arg('host', '0.0.0.0');
const httpsPort = arg('https-port', null) ? +arg('https-port', null) : null;
const build = arg('build', 'dev');

const log = (what, d) => console.log(new Date().toISOString(), what, JSON.stringify(d));
const hub = createHub({ data: loadData(), build, log, randomToken: () => randomBytes(18).toString('base64url') });

// The visitor's address: behind Caddy every peer is loopback, so the proxy's header is believed — only from loopback.
const ipOf = req => {
  const peer = req.socket.remoteAddress || '', loop = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer);
  if (!loop) return peer;
  const fwd = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd ? String(fwd) : peer;
};
const started = Date.now(), cpu0 = process.cpuUsage();
function onRequest(req, res) {
  const path = req.url.split('?')[0];
  if (path === '/healthz' || path === '/ws/overdrive-frame/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/status' || path === '/ws/overdrive-frame/status') {
    const up = (Date.now() - started) / 1000, c = process.cpuUsage(cpu0);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ server: 'overdrive-frame', build, uptime: Math.round(up), cpuPct: Math.round((c.user + c.system) / 1e4 / Math.max(1, up) * 10) / 10, rssMB: Math.round(process.memoryUsage().rss / 1048576), ...hub.status() }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
}

// Pages that may open a room: the live site, and any page on the same machine (the LAN page servers use other ports).
function originOk(origin, req) {
  if (!origin) return true;
  let o; try { o = new URL(origin); } catch { return false; }
  const reqHost = String(req.headers.host || '').split(':')[0];
  return o.hostname === 'games.radgh.com' || o.hostname.endsWith('.games.radgh.com') || o.hostname === reqHost;
}
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: { threshold: 512, zlibDeflateOptions: { level: 3 } } });
const perIp = new Map(), MAX_PER_IP = 16;
function onUpgrade(req, socket, head) {
  const path = req.url.split('?')[0];
  if (path !== '/ws' && path !== '/ws/overdrive-frame') { socket.destroy(); return; }
  if (!originOk(req.headers.origin, req)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
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

const server = http.createServer(onRequest);
server.on('upgrade', onUpgrade);
server.listen(port, host, () => console.log(`overdrive-frame co-op ${build} on ws://${host}:${port}/ws`));
if (httpsPort) {
  const certDir = arg('certs', join(PLAY, 'tools/certs'));
  const C = { cert: join(certDir, 'dev.crt'), key: join(certDir, 'dev.key') };
  if (existsSync(C.cert) && existsSync(C.key)) {
    const s = https.createServer({ cert: readFileSync(C.cert), key: readFileSync(C.key) }, onRequest);
    s.on('upgrade', onUpgrade);
    s.listen(httpsPort, host, () => console.log(`overdrive-frame co-op ${build} on wss://${host}:${httpsPort}/ws (self-signed)`));
  } else console.log(`no certificate at ${C.cert} — wss off`);
}

// The rooms' clock: 30 steps a second, catching up at most 4 steps after a stall (then it lets the time go).
const STEP_MS = 1000 / STEP_HZ;
let last = performance.now(), owed = 0;
setInterval(() => { const t = performance.now(); owed = Math.min(owed + (t - last), STEP_MS * 4); last = t; while (owed >= STEP_MS) { owed -= STEP_MS; hub.step(); } }, 8);
const bye = () => process.exit(0);
process.on('SIGTERM', bye); process.on('SIGINT', bye);
