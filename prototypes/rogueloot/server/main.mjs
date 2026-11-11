#!/usr/bin/env node
// The Rogueloot server: one Node process that serves the page and runs every online room (Knockabout's layout).
//   node server/main.mjs [--port 8581] [--host 0.0.0.0] [--public <dir>] [--build <id>] [--data <dir>] [--https-port 8583]
// GET /healthz, GET /status (JSON with build), WebSocket /ws, POST /feedback (☰ → Report a bug), POST /tally (cookie-free
// counts), admin feed GET /internal/admin/feed + POST /internal/admin/action (env RGS_ADMIN_SECRET switches it on).
import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createStaticHandler } from './static.js';
import { createHub } from '../js/net/hub.js';
import { validateCharacter } from '../js/rules/validate.js';
import { loadContent } from '../js/sim/content.js';
import { createFeedback } from '../../tumblefair/server/feedback.mjs';
import { createInsights } from '../../tumblefair/server/insights.mjs';
import { createAdminFeed } from '../../tumblefair/server/rgs.mjs';
import { MAX_FRAME } from '../js/net/protocol.js';
import { STEP_HZ } from '../js/sim/world.js';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), PLAY = resolve(GAME, '..', '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const port = +arg('port', process.env.PORT || 8581), host = arg('host', '0.0.0.0'), publicDir = arg('public', null);
const httpsPort = arg('https-port', null) ? +arg('https-port', null) : null;
const build = arg('build', 'dev'), dataDir = resolve(arg('data', join(GAME, '.data')));
mkdirSync(dataDir, { recursive: true });

const log = (what, d) => console.log(new Date().toISOString(), what, JSON.stringify(d));
const insights = createInsights(dataDir, { build });
const feedback = createFeedback(dataDir, { build });
const content = loadContent(f => JSON.parse(readFileSync(join(GAME, 'data', f), 'utf8')));
const hub = createHub({ build, log, content, checkCharacter: ch => validateCharacter(ch) });
const started = Date.now();
const admin = createAdminFeed({ game: 'rogueloot', build, dataDir, started, online: () => hub.status(), ratingKey: 'zone', names: {} });

const ipOf = req => {
  const peer = req.socket.remoteAddress || '', loop = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer);
  if (!loop) return peer;
  const fwd = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd ? String(fwd) : peer;
};
const serveStatic = createStaticHandler(publicDir ? resolve(publicDir) : PLAY, { allowAll: !!publicDir });
function onRequest(req, res) {
  const path = req.url.split('?')[0];
  if (path === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ server: 'rogueloot', build, uptime: Math.round((Date.now() - started) / 1000), rssMB: Math.round(process.memoryUsage().rss / 1048576), ...hub.status() }));
    return;
  }
  if (path.startsWith('/internal/') && admin.handle(req, res, path)) return;
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
  if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch { /* bad */ } if (!ok) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; } }
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
server.listen(port, host, () => console.log(`rogueloot ${build} on http://${host}:${port}/  (${publicDir ? 'published copy ' + publicDir : 'working tree'})`));
if (httpsPort) {
  const certDir = arg('certs', join(PLAY, 'tools/certs'));
  const C = { cert: join(certDir, 'dev.crt'), key: join(certDir, 'dev.key') };
  if (existsSync(C.cert) && existsSync(C.key)) {
    const s2 = https.createServer({ cert: readFileSync(C.cert), key: readFileSync(C.key) }, onRequest);
    s2.on('upgrade', onUpgrade);
    s2.listen(httpsPort, host, () => console.log(`rogueloot ${build} on https://${host}:${httpsPort}/  (self-signed)`));
  } else console.log(`no certificate at ${C.cert} — https off`);
}
const STEP_MS = 1000 / STEP_HZ;
let last = performance.now(), owed = 0;
setInterval(() => { const t = performance.now(); owed = Math.min(owed + (t - last), STEP_MS * 5); last = t; while (owed >= STEP_MS) { owed -= STEP_MS; hub.step(); } }, 8);
const bye = () => { try { insights.flush(); } catch { /* disk */ } process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
