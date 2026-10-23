#!/usr/bin/env node
// The Knockabout server: one Node process that serves the page and runs every online room.
//   node server/main.mjs [--port 8470] [--host 0.0.0.0] [--public <dir>] [--build <id>] [--data <dir>] [--https-port 8472]
//   --public <dir>     serve a published copy (tools/publish-knockabout.sh) instead of the working tree
//   --data <dir>       where feedback/ and insights/ live (default: .data/ beside this game)
//   --https-port <n>   also serve https with the playground's self-signed cert (tools/certs/dev.crt + dev.key, made by
//                      tools/make-dev-cert.sh) — browsers only expose gamepads on a secure page. LAN only: the
//                      games.radgh.com droplet is https through Caddy and runs without it.
// GET /healthz ("ok") and GET /status (JSON with build) for the publish script. WebSocket at /ws. POST /feedback (the !
// button: Tumblefair's server/feedback.mjs), POST /tally (cookie-free counts: Tumblefair's server/insights.mjs). The
// rooms' ratings, plays and votes go to the same insights log (tools/insights-report.mjs reads it).
import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createStaticHandler } from './static.js';
import { createHub } from './hub.js';
import { createFeedback } from '../../tumblefair/server/feedback.mjs';
import { createInsights } from '../../tumblefair/server/insights.mjs';
import * as sim from '../js/sim/match.js';
import { MAX_FRAME, STEP_HZ } from '../js/net/protocol.js';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), PLAY = resolve(GAME, '..', '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const port = +arg('port', process.env.PORT || 8470), host = arg('host', '0.0.0.0'), publicDir = arg('public', null);
const httpsPort = arg('https-port', null) ? +arg('https-port', null) : null;
const build = arg('build', 'dev'), dataDir = resolve(arg('data', join(GAME, '.data')));
mkdirSync(dataDir, { recursive: true });

const log = (what, d) => console.log(new Date().toISOString(), what, JSON.stringify(d));
const insights = createInsights(dataDir, { build });
const feedback = createFeedback(dataDir, { build });
const hub = createHub({ sim, build, log, report: (kind, d) => insights.report(kind, d), randomToken: () => randomBytes(18).toString('base64url') });

// The visitor's address: behind a proxy on this machine (Caddy on the droplet sends X-Forwarded-For) every peer is
// loopback, so the proxy's header is believed — but only from loopback.
const ipOf = req => {
  const peer = req.socket.remoteAddress || '', loop = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer);
  if (!loop) return peer;
  const fwd = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd ? String(fwd) : peer;
};
const serveStatic = createStaticHandler(publicDir ? resolve(publicDir) : PLAY, { allowAll: !!publicDir });
const started = Date.now();
const cpu0 = process.cpuUsage();
function onRequest(req, res) {
  const path = req.url.split('?')[0];
  if (path === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/status') {
    const up = (Date.now() - started) / 1000, c = process.cpuUsage(cpu0);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ server: 'knockabout', build, uptime: Math.round(up), cpuPct: Math.round((c.user + c.system) / 1e4 / Math.max(1, up) * 10) / 10, rssMB: Math.round(process.memoryUsage().rss / 1048576), ...hub.status() }));
    return;
  }
  if (path === '/feedback' && req.method === 'POST') { feedback.handle(req, ipOf(req), (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }); return; }
  if (path === '/tally' && req.method === 'POST') { insights.handle(req, ipOf(req), req.headers['user-agent'], code => { res.writeHead(code); res.end(); }); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (!serveStatic(req, res)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); }
}

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
const perIp = new Map(), MAX_PER_IP = 24;
function onUpgrade(req, socket, head) {
  if (req.url.split('?')[0] !== '/ws') { socket.destroy(); return; }
  const origin = req.headers.origin;
  if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch { /* bad origin */ } if (!ok) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; } }
  const ip = ipOf(req);
  if ((perIp.get(ip) || 0) >= MAX_PER_IP) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    socket.setNoDelay?.(true);          // snapshots are small and frequent: never hold one back to batch it
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
server.listen(port, host, () => console.log(`knockabout ${build} on http://${host}:${port}/  (${publicDir ? 'published copy ' + publicDir : 'working tree'})`));
if (httpsPort) {
  const crt = join(PLAY, 'tools/certs/dev.crt'), key = join(PLAY, 'tools/certs/dev.key');
  const certDir = arg('certs', null);
  const C = certDir ? { cert: join(certDir, 'dev.crt'), key: join(certDir, 'dev.key') } : { cert: crt, key };
  if (existsSync(C.cert) && existsSync(C.key)) {
    const s = https.createServer({ cert: readFileSync(C.cert), key: readFileSync(C.key) }, onRequest);
    s.on('upgrade', onUpgrade);
    s.listen(httpsPort, host, () => console.log(`knockabout ${build} on https://${host}:${httpsPort}/  (self-signed)`));
  } else console.log(`no certificate at ${C.cert} — https off (make one with tools/make-dev-cert.sh)`);
}

// The rooms' clock: 60 steps a second, catching up at most 5 steps after a stall (then it lets the time go).
const STEP_MS = 1000 / STEP_HZ;
let last = performance.now(), owed = 0;
setInterval(() => { const t = performance.now(); owed = Math.min(owed + (t - last), STEP_MS * 5); last = t; while (owed >= STEP_MS) { owed -= STEP_MS; hub.step(); } }, 4);
const bye = () => { try { insights.flush(); } catch { /* disk */ } process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
