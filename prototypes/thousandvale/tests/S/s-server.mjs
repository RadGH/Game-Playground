#!/usr/bin/env node
// Stream S (Expansion 1 §4) — a real Thousandvale server with BOTH provinces (Torbor Downs + Vharlen, real rules, memory
// DB) for the hazards spec, plus a TEST-ONLY hook on a second loopback port. Never used by the real server.
//
//   node tests/S/s-server.mjs --port 8498 --hook 8499
//   POST /level  {name, level}          a real level-up through the room
//   POST /isle   {name, x, z}           put a character on Vharlen at world (x, z) (the voyage's own move), monsters within
//                                        120 m taken away so a picture is not a fight
//   POST /hp     {name, share}          set health to a share of the maximum
//   POST /calm   {name}                 take away the monsters near a character again
//   GET  /who ; GET /sites              online characters ; the server's parsed hazard sites
// Prints "READY <port> <hook>" on stdout when both listen.
import http from 'node:http';
import { join } from 'node:path';
import { startServer } from '../../server/main.mjs';
import { GAME } from '../../server/load.mjs';
import { prepareRules } from '../../js/rules/index.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const port = +arg('--port', 8498), hookPort = +arg('--hook', port + 1);
const s = await startServer({
  port, host: '127.0.0.1', hostGiven: true, adminPort: 0, guestsPerIpHour: null, guestsPerHour: null, unlimitedIp: [], db: 'memory',
  dbFile: join(GAME, '.data/s-hazards.json'), build: 'dev', rules: 'auto', terrain: 'torbor_downs', linger: 3000, maxPerIp: 16, saveEvery: 60000,
  process: 's-hazards', env: 'dev', publicDir: null, journalMs: 2000, provinces: ['torbor_downs', 'vharlen'], procs: 0, director: {},
});
const W = s.world;
const byName = name => { for (const o of W.online.values()) if (o.char && o.char.name.toLowerCase() === String(name).toLowerCase()) return o; return null; };
const calm = (o, x = o.entity.x, z = o.entity.z) => {
  const r = o.room;
  for (const m of [...r.entities.values()]) if (m.kind === 'monster' && Math.hypot(m.x - x, m.z - z) < 120) r.remove(m);
  for (const k of r.camps || []) if (Math.hypot(k.x - x, k.z - z) < 160) { k.count = 0; k.due.length = 0; k.parked = 0; }
};
const hook = http.createServer(async (req, res) => {
  const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (req.method === 'GET' && req.url === '/who') return send(200, [...W.online.values()].map(o => ({ char: o.char.id, name: o.char.name, level: o.char.level, x: o.entity.x, y: o.entity.y, z: o.entity.z, room: o.room.id, hp: o.entity.hp, hpMax: o.entity.hpMax, st: o.entity.st || [] })));
    if (req.method === 'GET' && req.url === '/sites') { const S = W.hazards.sitesFor('vharlen'); return send(200, S ? { springs: S.springs, geysers: S.geysers.map(({ cycle, ...g }) => ({ ...g, cycle })), vents: S.vents.map(({ shape, ...v }) => v) } : null); }
    let body = ''; for await (const c of req) body += c;
    const b = body ? JSON.parse(body) : {};
    const o = byName(b.name);
    if (!o) return send(404, { ok: false, why: 'not online' });
    if (req.url === '/level') {
      await prepareRules();
      const { xpForLevel } = await import('../../js/rules/farhold.js');
      if ((o.char.level || 1) < b.level) o.room.award(o.entity, { xp: Math.max(1, xpForLevel(b.level) - (o.char.xp || 0) + 1), reason: 'test' });
      return send(200, { ok: true, level: o.char.level });
    }
    if (req.url === '/isle') {
      if (!o.room.id.startsWith('vharlen/')) W.moveTo(o, 'vharlen', { x: +b.x, z: +b.z }, 'test');
      else { o.entity.moveTo(+b.x, +b.z, undefined, true); const c = o.room.clients.get(o.entity.id); if (c) c.selfDirty = true; }
      setTimeout(() => { const q = byName(b.name); if (q) calm(q, +b.x, +b.z); }, 1500);
      return send(200, { ok: true });
    }
    if (req.url === '/calm') { calm(o); return send(200, { ok: true }); }
    if (req.url === '/hp') { const u = o.entity.r && o.entity.r.unit; if (u) u.hp = Math.max(1, Math.round(u.maxHp * (+b.share || 0.5))); return send(200, { ok: true }); }
    send(404, { ok: false });
  } catch (err) { send(500, { ok: false, err: String(err && err.stack) }); }
});
hook.listen(hookPort, '127.0.0.1', () => console.log(`READY ${port} ${hookPort}`));
const bye = () => { hook.close(); s.stop().then(() => process.exit(0), () => process.exit(1)); setTimeout(() => process.exit(1), 8000).unref(); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
