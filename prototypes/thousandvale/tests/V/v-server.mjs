#!/usr/bin/env node
// Stream V (Expansion 1 §6) — a real Thousandvale server (server/main.mjs startServer, memory DB, Torbor Downs) for the
// voyage spec, plus a TEST-ONLY hook on a second loopback port. Never used by the real server; lives in tests/.
//
//   node tests/V/v-server.mjs --port 8496 --hook 8497
//   POST /harbour {name, gold?}   move a character beside Gullwick's Harbourmaster (gold: their purse)
//   POST /testsail {}             add a TEST sailing Gullwick -> "Test Cove" (a quay in Torbor Downs, beside Torborhold)
//                                 over the real sea route to Port Vharl, so a whole voyage — fare, hold, the crossing,
//                                 `joined` at the far end — runs while Vharlen is not loaded in this realm
//   GET  /who
// Prints "READY <port> <hook>" on stdout when both listen.
import http from 'node:http';
import { join } from 'node:path';
import { startServer } from '../../server/main.mjs';
import { GAME } from '../../server/load.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const port = +arg('--port', 8496), hookPort = +arg('--hook', port + 1);
const s = await startServer({
  port, host: '127.0.0.1', hostGiven: true, adminPort: 0, guestsPerIpHour: null, guestsPerHour: null, unlimitedIp: [], db: 'memory',
  dbFile: join(GAME, '.data/v-ships.json'), build: 'dev', rules: 'auto', terrain: 'test', linger: 3000, maxPerIp: 16, saveEvery: 60000,
  process: 'v-ships', env: 'dev', publicDir: null, journalMs: 2000, provinces: null, procs: 0, director: {},
});
const W = s.world;
const byName = name => { for (const o of W.online.values()) if (o.char && o.char.name.toLowerCase() === String(name).toLowerCase()) return o; return null; };
function harbourmaster(id = 'gullwick') {
  for (const pv of W.P.values()) for (const r of [...pv.towns, ...pv.copies]) for (const x of r.objects.values()) if (x.data && x.data.npc && x.data.npc.harbour === id) return { x, r };
  return null;
}
const hook = http.createServer(async (req, res) => {
  const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (req.method === 'GET' && req.url === '/who') return send(200, [...W.online.values()].map(o => ({ char: o.char.id, name: o.char.name, x: o.entity.x, z: o.entity.z, room: o.room.id })));
    let body = ''; for await (const c of req) body += c;
    const b = body ? JSON.parse(body) : {};
    if (req.url === '/testsail') {
      const S = W.ships, g = S.harbours.get('gullwick'), pv = S.harbours.get('port_vharl');
      const town = [...W.P.values()][0].L.towns[0];
      if (!S.harbours.has('test_cove')) {
        S.harbours.set('test_cove', { id: 'test_cove', name: 'Test Cove', land: 'Torbor Downs', province: 'torbor_downs', band: [1, 10], dock: { x: town.x + 4, z: town.z + 4 }, berth: pv.berth, zone: null });
        S.sailings.get('gullwick').push({ from: 'gullwick', to: 'test_cove', gold: 60, sec: +b.sec || 40, path: (W.ships.sailings.get('gullwick').find(q => q.to === 'port_vharl') || {}).path });
      }
      return send(200, { ok: true, from: g.name });
    }
    const o = byName(b.name);
    if (!o) return send(404, { ok: false, why: 'not online' });
    if (req.url === '/harbour') {
      const hm = harbourmaster(b.id || 'gullwick');
      if (!hm) return send(404, { ok: false, why: 'no harbourmaster' });
      if (b.gold != null) { o.char.gold = +b.gold; if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [], gold: o.char.gold }); }
      W.transfer(o, hm.r, { x: hm.x.x - 2.2, z: hm.x.z + 0.6 }, 'test');
      return send(200, { ok: true, id: hm.x.id, x: hm.x.x, z: hm.x.z, room: hm.r.id });
    }
    send(404, { ok: false });
  } catch (err) { send(500, { ok: false, err: String(err && err.stack) }); }
});
hook.listen(hookPort, '127.0.0.1', () => console.log(`READY ${port} ${hookPort}`));
const bye = () => { hook.close(); s.stop().then(() => process.exit(0), () => process.exit(1)); setTimeout(() => process.exit(1), 8000).unref(); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
