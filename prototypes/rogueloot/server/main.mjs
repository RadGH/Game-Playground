#!/usr/bin/env node
// The Rogueloot server: one Node process that serves the page and runs every online room (Knockabout's layout).
//   node server/main.mjs [--port 8581] [--host 0.0.0.0] [--public <dir>] [--build <id>] [--data <dir>] [--https-port 8583]
// GET /healthz, GET /status (JSON with build), WebSocket /ws, POST /feedback (☰ → Report a bug), POST /tally (cookie-free
// counts), admin feed GET /internal/admin/feed + POST /internal/admin/action (env RGS_ADMIN_SECRET switches it on).
import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createStaticHandler } from './static.js';
import { createHub } from '../js/net/hub.js';
import { validateCharacter } from '../js/rules/validate.js';
import { loadContent, checkAny } from '../js/sim/content.js';
import { checkItem } from '../js/rules/items.js';
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
const hub = createHub({ build, log, content, checkCharacter: ch => validateCharacter(ch, { items: { checkItem: it => checkAny(content, it) } }) });
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
  if (path === '/editor/save' && req.method === 'POST') { editorSave(req, res); return; }
  if (path === '/rate' && req.method === 'POST') { rate(req, res); return; }
  if (path === '/feedback' && req.method === 'POST') { feedback.handle(req, ipOf(req), (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }); return; }
  if (path === '/tally' && req.method === 'POST') { insights.handle(req, ipOf(req), req.headers['user-agent'], code => { res.writeHead(code); res.end(); }); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (!serveStatic(req, res)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); }
}

// Ratings (M32, game standards §5): 👍/👎 + reasons for a zone, dungeon or boss, from solo and online games alike.
// Rate-limited per address; stored through the shared insights log (the admin feed summarises them by 'zone').
const RATE_REASONS = new Set(['fun', 'pretty', 'tense', 'loot', 'again', 'buggy', 'unfair', 'boring', 'confusing', 'hard', 'easy', 'laggy', 'long', 'empty']);
const rateSeen = new Map();
async function rate(req, res) {
  const done = code => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: code === 200 })); };
  const ip = ipOf(req), t = Date.now(), list = (rateSeen.get(ip) || []).filter(x => t - x < 3600e3);
  if (list.length > 40) return done(429);
  let body = ''; for await (const c of req) { body += c; if (body.length > 2000) return done(413); }
  let m; try { m = JSON.parse(body); } catch { return done(400); }
  const zone = String(m.zone || '').slice(0, 40); if (!/^[a-z0-9_]+$/.test(zone) || !(m.v === 1 || m.v === -1)) return done(400);
  const why = String(m.why || '').split(',').filter(x => RATE_REASONS.has(x)).slice(0, 4).join(',');
  list.push(t); rateSeen.set(ip, list);
  insights.report('rate', { zone, v: m.v, why, text: String(m.text || '').slice(0, 300), level: Math.max(1, Math.min(99, +m.level || 1)), players: Math.max(1, Math.min(4, +m.players || 1)) });
  done(200);
}

// The zone editor's Save (M11): DEV server only (the working tree), from this machine's network only, writes
// data/zones/<id>.json and adds it to the index. The published copies never have it (build !== 'dev').
async function editorSave(req, res) {
  const done = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (build !== 'dev' || publicDir) return done(404, { ok: false, msg: 'Saving is only on the dev server. Use Download instead.' });
  const ip = ipOf(req); if (!/^(127\.|::1|::ffff:127\.|192\.168\.|10\.|::ffff:192\.168\.|::ffff:10\.)/.test(ip)) return done(403, { ok: false, msg: 'Only from this network.' });
  let body = ''; for await (const c of req) { body += c; if (body.length > 4e6) return done(413, { ok: false, msg: 'Too big.' }); }
  let zone; try { zone = JSON.parse(body); } catch { return done(400, { ok: false, msg: 'Not JSON.' }); }
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(zone?.id || '')) return done(400, { ok: false, msg: 'Zone id must be lower_case letters, digits and _.' });
  const { checkZone } = await import('../js/world/check.js');
  const r = checkZone(zone);
  const dir = join(GAME, 'data', 'zones'), file = join(dir, zone.id + '.json');
  writeFileSync(file + '.tmp', JSON.stringify(zone, null, 1) + '\n'); renameSync(file + '.tmp', file);
  const idxFile = join(dir, 'index.json'), idx = JSON.parse(readFileSync(idxFile, 'utf8'));
  if (!idx.zones.includes(zone.id)) { idx.zones.push(zone.id); writeFileSync(idxFile, JSON.stringify(idx, null, 1) + '\n'); }
  log('editor-save', { zone: zone.id, problems: r.problems.length });
  done(200, { ok: true, problems: r.problems, stats: r.stats });
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
