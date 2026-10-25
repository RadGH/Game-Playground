#!/usr/bin/env node
// The Roverlands server: one Node process that serves the page and referees every online room. It never runs physics
// — each moving body is simulated by its OWNER's browser (docs/PLAN.md "The shape"); the server relays poses as
// `state` 20 times a second and keeps the rules (seats, owners, the flag, what has been broken, the run clock).
//   node server/main.mjs [--port 8551] [--https-port 8553] [--certs <dir>] [--host 0.0.0.0] [--public <dir>] [--build <id>] [--data <dir>]
//   --public <dir>     serve a published copy (tools/publish-roverlands.sh) instead of the working tree
//   --data <dir>       where feedback/, insights/, profiles.json and bests.json live (default: .data/ beside this game)
//   --https-port <n>   also serve https with the playground's self-signed cert (tools/certs/dev.crt + dev.key, made by
//                      tools/make-dev-cert.sh) — browsers only expose gamepads on a secure page. LAN only: the
//                      games.radgh.com droplet is https through Caddy and runs without it.
// GET /healthz ("ok"), GET /status (JSON with build), GET /rooms (the public list for "Find a game"), WebSocket at /ws.
// POST /feedback (the ! button: Tumblefair's server/feedback.mjs), POST /tally (cookie-free counts: Tumblefair's
// server/insights.mjs). The rooms' ratings, drives and runs go to the same insights log (tools/insights-report.mjs).
// Accounts: POST /account (Knockabout's server/accounts.js — a signed-in player's name + look, <data>/profiles.json) and
// the admin feed GET /internal/admin/feed + POST /internal/admin/action (Tumblefair's server/rgs.mjs). Env vars: RGS_API
// (where tickets are redeemed, default https://games.radgh.com/api) and RGS_ADMIN_SECRET (switches the admin feed on).
import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { WebSocketServer } from 'ws';
import { createStaticHandler } from './static.js';
import { createHub } from './hub.js';
import { createFeedback } from '../../tumblefair/server/feedback.mjs';
import { createInsights } from '../../tumblefair/server/insights.mjs';
import { createRedeemer, createAdminFeed } from '../../tumblefair/server/rgs.mjs';
import { createAccounts } from '../../knockabout/server/accounts.js';
import { MAX_FRAME, STATE_HZ } from '../js/net/protocol.js';
import { vehicleTable } from '../js/net/room-core.js';

const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), PLAY = resolve(GAME, '..', '..');
const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const port = +arg('port', process.env.PORT || 8551), host = arg('host', '0.0.0.0'), publicDir = arg('public', null);
const httpsPort = arg('https-port', null) ? +arg('https-port', null) : null;
const build = arg('build', 'dev'), dataDir = resolve(arg('data', join(GAME, '.data')));
mkdirSync(dataDir, { recursive: true });

const log = (what, d) => console.log(new Date().toISOString(), what, JSON.stringify(d));
const insights = createInsights(dataDir, { build });
const feedback = createFeedback(dataDir, { build });
const saveJson = (file, obj) => { const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(obj)); renameSync(tmp, file); };
const readJson = (file, def) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return def; } };

// ---- accounts (optional sign-in): a player's name + look on the server
const profileFile = join(dataDir, 'profiles.json');
const accounts = createAccounts({ redeem: createRedeemer({ game: 'roverlands', log }), initial: readJson(profileFile, {}), log, persist: all => saveJson(profileFile, all) });
setInterval(() => accounts.flush(), 5000).unref();

// ---- best Flag Run times, per world seed + flag site, kept across rooms and restarts
const bestsFile = join(dataDir, 'bests.json');
const bests = readJson(bestsFile, {});
let bestsSaved = JSON.stringify(bests);
setInterval(() => { const s = JSON.stringify(bests); if (s !== bestsSaved) { try { saveJson(bestsFile, bests); bestsSaved = s; } catch { /* disk */ } } }, 10000).unref();

// ---- the game's data: vehicles (seats per kind) and the world's sites (built once per seed, by the same pure worldgen
// the browsers run, so the server's home ring and flag sites are exactly where everyone draws them)
let vehicles = readJson(process.env.ROVERLANDS_TEST_VEHICLES || join(GAME, 'data/vehicles.json'), []);
const VEHICLE_NAMES = () => Object.fromEntries(Object.entries(vehicleTable(vehicles)).map(([id, v]) => [id, v.name]));
const sitesCache = new Map();
let worldgen = null;
// tests: ROVERLANDS_TEST_SITES=<file.json> gives every room those sites instead of building the world
const TEST_SITES = process.env.ROVERLANDS_TEST_SITES ? readJson(process.env.ROVERLANDS_TEST_SITES, null) : null;
async function sitesFor(seed) {
  if (TEST_SITES) return TEST_SITES;
  if (sitesCache.has(seed)) return sitesCache.get(seed);
  if (!worldgen) {
    // not cached while it fails: the world module may still be being written (a later room tries again)
    const f = join(GAME, 'js/world/worldgen.js');
    worldgen = existsSync(f) ? await import(pathToFileURL(f).href + '?t=' + Date.now()).catch(e => { log('worldgen.fail', { msg: String(e?.message || e).slice(0, 200) }); return null; }) : null;
    if (!worldgen) return {};
  }
  let sites = {};
  if (typeof worldgen.generateWorld === 'function') {
    const t0 = Date.now();
    try { const w = worldgen.generateWorld({ seed }); sites = { home: w.sites?.home, flags: w.sites?.flags || [], pads: w.sites?.pads || [] }; }
    catch (e) { log('worldgen.error', { seed, msg: String(e?.message || e).slice(0, 300) }); }
    log('world.sites', { seed, ms: Date.now() - t0, flags: sites.flags?.length || 0, pads: sites.pads?.length || 0 });
  }
  if (sites.home) sitesCache.set(seed, sites);
  if (sitesCache.size > 6) sitesCache.delete(sitesCache.keys().next().value);
  return sites;
}

const hub = createHub({ build, log, report: (kind, d) => insights.report(kind, d), randomToken: () => randomBytes(18).toString('base64url'), sitesFor, vehicles: () => vehicles, bests });

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
const admin = createAdminFeed({ game: 'roverlands', build, dataDir, started, online: () => hub.status(), ratingKey: 'vehicle', names: VEHICLE_NAMES });
const cpu0 = process.cpuUsage();
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
function onRequest(req, res) {
  const path = req.url.split('?')[0];
  if (path === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/status') {
    const up = (Date.now() - started) / 1000, c = process.cpuUsage(cpu0);
    return json(res, 200, { server: 'roverlands', build, uptime: Math.round(up), cpuPct: Math.round((c.user + c.system) / 1e4 / Math.max(1, up) * 10) / 10, rssMB: Math.round(process.memoryUsage().rss / 1048576), ...hub.status() });
  }
  if (path === '/rooms' && req.method === 'GET') return json(res, 200, { list: hub.publicList() });
  if (path.startsWith('/internal/') && admin.handle(req, res, path)) return;
  if (path === '/account' && req.method === 'POST') { accounts.http(req, res); return; }
  if (path === '/feedback' && req.method === 'POST') { feedback.handle(req, ipOf(req), (code, body) => json(res, code, body)); return; }
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
    socket.setNoDelay?.(true);          // poses are small and frequent: never hold one back to batch it
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
server.listen(port, host, () => console.log(`roverlands ${build} on http://${host}:${port}/  (${publicDir ? 'published copy ' + publicDir : 'working tree'})`));
if (httpsPort) {
  const certDir = arg('certs', join(PLAY, 'tools/certs'));
  const C = { cert: join(certDir, 'dev.crt'), key: join(certDir, 'dev.key') };
  if (existsSync(C.cert) && existsSync(C.key)) {
    const s = https.createServer({ cert: readFileSync(C.cert), key: readFileSync(C.key) }, onRequest);
    s.on('upgrade', onUpgrade);
    s.listen(httpsPort, host, () => console.log(`roverlands ${build} on https://${host}:${httpsPort}/  (self-signed)`));
  } else console.log(`no certificate at ${C.cert} — https off (make one with tools/make-dev-cert.sh)`);
}

// The rooms' clock: `state` goes out STATE_HZ times a second.
setInterval(() => hub.step(), 1000 / STATE_HZ);
// the default world's sites, ready before the first room asks (a world takes a second or so to build)
setTimeout(() => sitesFor(7).catch(() => {}), 200);
// vehicles.json is the lead's file: pick up a change without a restart
setInterval(() => { const v = readJson(process.env.ROVERLANDS_TEST_VEHICLES || join(GAME, 'data/vehicles.json'), null); if (v) vehicles = v; }, 30000).unref();
const bye = () => { try { accounts.flush(); } catch { /* disk */ } try { insights.flush(); } catch { /* disk */ } try { saveJson(bestsFile, bests); } catch { /* disk */ } process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
