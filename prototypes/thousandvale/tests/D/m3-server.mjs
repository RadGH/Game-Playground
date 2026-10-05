#!/usr/bin/env node
// Stream D — a real Thousandvale server (stream A's server/main.mjs startServer, memory DB, stage 1) for the M3
// client spec and screenshots, plus a TEST-ONLY hook on a second loopback port so a spec can skip the grind:
// claimed accounts need level 5 for whispers to strangers, mail and guild founding (protocol §16), and founding
// costs 10 gold. Never used by the real server; lives in tests/ (not published).
//
//   node tests/D/m3-server.mjs --port 8494 --hook 8495 [--event-first 60000]
//   POST http://127.0.0.1:<hook>/level {name, level}    set a character's level everywhere it is read
//   POST http://127.0.0.1:<hook>/give  {name, gold, items}  grant gold and N plain test items (a bag message follows)
//   POST http://127.0.0.1:<hook>/event {id, announceMs}  force a realm event (the admin page's button)
//   GET  http://127.0.0.1:<hook>/who                    online characters [{char, name, level}]
// Prints "READY <port> <hook>" on stdout when both listen.
import http from 'node:http';
import { join } from 'node:path';
import { startServer } from '../../server/main.mjs';
import { GAME } from '../../server/load.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const port = +arg('--port', 8494), hookPort = +arg('--hook', port + 1);
const director = {};
if (arg('--event-first')) { director.firstMs = +arg('--event-first'); director.demo = true; }
if (arg('--event-announce')) director.announceMs = +arg('--event-announce');

const s = await startServer({
  port, host: '127.0.0.1', hostGiven: true, adminPort: 0, guestsPerIpHour: null, guestsPerHour: null, unlimitedIp: [], db: 'memory',
  dbFile: join(GAME, '.data/d-m3.json'), build: 'dev', rules: 'auto', terrain: 'test', linger: 3000, maxPerIp: 16, saveEvery: 60000,
  process: 'd-m3', env: 'dev', publicDir: null, journalMs: 2000, provinces: null, procs: 0, director,
});
const W = s.world;
const byName = name => { for (const o of W.online.values()) if (o.char && o.char.name.toLowerCase() === String(name).toLowerCase()) return o; return null; };
let itemN = 0;
const hook = http.createServer(async (req, res) => {
  const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (req.method === 'GET' && req.url === '/who') return send(200, [...W.online.values()].map(o => ({ char: o.char.id, name: o.char.name, level: o.char.level })));
    let body = ''; for await (const c of req) body += c;
    const b = body ? JSON.parse(body) : {};
    if (req.url === '/event') return send(200, { ok: W.gateway.admin.forceEvent(b.id || null, b.announceMs ?? 5000) });
    const o = byName(b.name);
    if (!o) return send(404, { ok: false, why: 'not online' });
    if (req.url === '/level') {
      const lv = Math.max(1, Math.min(50, b.level | 0));
      o.entity.setLevel(lv); o.char.level = lv;
      const pr = W.gateway.presence.get(o.char.id); if (pr) pr.level = lv;
      if (o.conn) o.conn.sendJSON({ t: 'you', level: lv });          // what a real level-up tells the client
      return send(200, { ok: true, level: lv });
    }
    if (req.url === '/give') {
      const items = Array.from({ length: Math.max(0, Math.min(12, b.items | 0)) }, (_, i) => ({ name: b.itemName || ['Hollin Shortsword', 'Weathered Cloak', 'Copper Ring', 'Ashwood Staff'][(itemN + i) % 4], rarity: ['common', 'magic', 'rare'][(itemN++ + i) % 3], slot: 'weapon', value: 4, level: 3 }));
      W.grant(o, { items, gold: Math.max(0, b.gold | 0), reason: 'test' });
      return send(200, { ok: true, items: items.length });
    }
    send(404, { ok: false });
  } catch (err) { send(500, { ok: false, err: String(err && err.message) }); }
});
hook.listen(hookPort, '127.0.0.1', () => console.log(`READY ${port} ${hookPort}`));
const bye = () => { hook.close(); s.stop().then(() => process.exit(0), () => process.exit(1)); setTimeout(() => process.exit(1), 8000).unref(); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
