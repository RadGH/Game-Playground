#!/usr/bin/env node
// The Tumblefair server: one Node process that serves the page and runs every room.
//   node server/main.mjs [--port 8480] [--host 0.0.0.0] [--public <dir>] [--build <id>] [--data <dir>]
//   --public <dir>   serve a published copy (tools/publish-tumblefair.sh) instead of the working tree
//   --data <dir>     where profiles.json lives (default: .data/ beside this game)
// GET /status (JSON) and /healthz for the publish script. WebSocket at /ws. POST /feedback (the ! button), POST /tally
// (round 7: cookie-free page counts, server/insights.mjs).
// Accounts + the admin feed (2026-10-23, server/rgs.mjs): env RGS_API (where tickets are redeemed, default
// https://games.radgh.com/api) and RGS_ADMIN_SECRET (switches on GET /internal/admin/feed + POST /internal/admin/action).
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createStaticHandler } from './static.js';
import { createHub } from '../js/sim/hub.js';
import { createProfiles } from '../js/sim/profiles.js';
import { createFeedback } from './feedback.mjs';
import { createInsights } from './insights.mjs';
import { createRedeemer, createAdminFeed } from './rgs.mjs';
import { MAX_FRAME, TICK_MS } from '../js/shared/protocol.js';
import { cleanLook } from '../../thousandvale/js/sim/looks.js';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), PLAY = resolve(GAME, '..', '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const port = +arg('port', process.env.PORT || 8480), host = arg('host', '0.0.0.0'), publicDir = arg('public', null);
const build = arg('build', 'dev'), dataDir = resolve(arg('data', join(GAME, '.data')));
const json = p => JSON.parse(readFileSync(join(GAME, p), 'utf8'));
const data = { boards: { fairground: json('data/boards/fairground.json'), pier: json('data/boards/pier.json') }, chance: json('data/chance.json'), cosmetics: json('data/cosmetics.json') };

mkdirSync(dataDir, { recursive: true });
const profileFile = join(dataDir, 'profiles.json');
let initial = {}; try { initial = JSON.parse(readFileSync(profileFile, 'utf8')); } catch { /* first run */ }
const profiles = createProfiles({ initial, cosmetics: data.cosmetics, cleanLook, randomToken: () => randomBytes(18).toString('base64url'),
  persist: all => { const tmp = profileFile + '.tmp'; writeFileSync(tmp, JSON.stringify(all)); renameSync(tmp, profileFile); } });
const insights = createInsights(dataDir, { build });      // round 7: ratings, plays, votes + cookie-free page counts (tools/insights-report.mjs)
const log = (what, d) => console.log(new Date().toISOString(), what, JSON.stringify(d));
const redeem = createRedeemer({ game: 'tumblefair', log });
const hub = createHub({ data, profiles, build, log, report: (kind, d) => insights.report(kind, d), redeem });

const feedback = createFeedback(dataDir, { build });
// The visitor's address: behind a proxy on this machine (Caddy on the games.radgh.com droplet sends X-Forwarded-For; the old
// Cloudflare tunnel sent CF-Connecting-IP) every peer is loopback, so the proxy's header is believed — but only from loopback
const ipOf = req => {
  const peer = req.socket.remoteAddress || '', loop = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer);
  if (!loop) return peer;
  const fwd = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd ? String(fwd) : peer;
};
const serveStatic = createStaticHandler(publicDir ? resolve(publicDir) : PLAY, { allowAll: !!publicDir });
const started = Date.now();
let TITLES = {}; import('../js/games/metas.js').then(m => { TITLES = Object.fromEntries(Object.entries(m.GAMES).map(([id, g]) => [id, g.meta.title])); }).catch(() => {});
const admin = createAdminFeed({ game: 'tumblefair', build, dataDir, started, online: () => hub.status(), ratingKey: 'game', names: () => TITLES });
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/status') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ server: 'tumblefair', build, uptime: Math.round((Date.now() - started) / 1000), ...hub.status() })); return; }
  if (path.startsWith('/internal/') && admin.handle(req, res, path)) return;
  if (path === '/feedback' && req.method === 'POST') { feedback.handle(req, ipOf(req), (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }); return; }
  if (path === '/tally' && req.method === 'POST') { insights.handle(req, ipOf(req), req.headers['user-agent'], code => { res.writeHead(code); res.end(); }); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (!serveStatic(req, res)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
const perIp = new Map(), MAX_PER_IP = 24;
server.on('upgrade', (req, socket, head) => {
  if (req.url.split('?')[0] !== '/ws') { socket.destroy(); return; }
  const origin = req.headers.origin;
  if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch { /* bad origin */ } if (!ok) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; } }
  const ip = ipOf(req);
  if ((perIp.get(ip) || 0) >= MAX_PER_IP) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => {
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    const h = hub.accept({ ip, send: d => { if (ws.readyState === 1) ws.send(d); } });
    ws.on('message', (d, isBinary) => { if (!isBinary) h.message(d.toString('utf8')); });
    ws.on('close', () => { const k = (perIp.get(ip) || 1) - 1; if (k > 0) perIp.set(ip, k); else perIp.delete(ip); h.close(); });
    ws.on('error', () => {});
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  });
});
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch { /* closed */ } } }, 30000);

let last = Date.now(), owed = 0;
setInterval(() => { const t = Date.now(); owed = Math.min(owed + (t - last), TICK_MS * 5); last = t; while (owed >= TICK_MS) { owed -= TICK_MS; hub.tick(); } }, 10);   // 20 ticks a second, catching up at most a quarter second
setInterval(() => profiles.flush(), 5000);
const bye = () => { try { profiles.flush(); } catch { /* disk */ } try { insights.flush(); } catch { /* disk */ } process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
server.listen(port, host, () => console.log(`tumblefair ${build} on http://${host}:${port}/  (${publicDir ? 'published copy ' + publicDir : 'working tree'})`));
