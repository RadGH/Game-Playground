// TEST-ONLY hooks (stream A; D's ask): `--dev-hooks <port>` on server/main.mjs starts this on 127.0.0.1 so UI specs can
// skip the grind without reaching into the server's internals. REFUSED with --env stable, with --public and in
// stage 2 (--procs > 0: the province lives in another process). Never published behind a tunnel.
//   GET  /who                              online characters [{char, name, level}]
//   POST /level {name, level}              set a character's level everywhere it is read (the client gets `you {level}`)
//   POST /give  {name, gold, items, itemName?}   grant gold and up to 12 plain test items (a `bag` message follows)
//   POST /event {id, announceMs}           start a realm event (the admin page's button)
import http from 'node:http';

const NAMES = ['Hollin Shortsword', 'Weathered Cloak', 'Copper Ring', 'Ashwood Staff'];

export async function startDevHooks({ port, world, log = () => {} }) {
  const byName = name => { for (const o of world.online.values()) if (o.char && o.char.name.toLowerCase() === String(name).toLowerCase()) return o; return null; };
  let itemN = 0;
  const server = http.createServer(async (req, res) => {
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    try {
      if (req.method === 'GET' && req.url === '/who') return send(200, [...world.online.values()].map(o => ({ char: o.char.id, name: o.char.name, level: o.char.level })));
      if (req.method !== 'POST') return send(405, { ok: false });
      let body = ''; for await (const c of req) { body += c; if (body.length > 16384) return send(413, { ok: false }); }
      const b = body ? JSON.parse(body) : {};
      if (req.url === '/event') return send(200, { ok: world.gateway.admin.forceEvent(b.id || null, b.announceMs ?? 5000) });
      const o = byName(b.name);
      if (!o) return send(404, { ok: false, why: 'not online' });
      if (req.url === '/level') return send(200, { ok: true, level: world.devSetLevel(o.char.id, b.level) });
      if (req.url === '/give') {
        const items = Array.from({ length: Math.max(0, Math.min(12, b.items | 0)) }, (_, i) => ({ name: b.itemName || NAMES[(itemN + i) % 4], rarity: ['common', 'magic', 'rare'][(itemN++ + i) % 3], slot: 'weapon', value: 4, level: 3 }));
        world.grant(o, { items, gold: Math.max(0, b.gold | 0), reason: 'test' });
        return send(200, { ok: true, items: items.length });
      }
      send(404, { ok: false });
    } catch (err) { send(500, { ok: false, err: String(err && err.message) }); }
  });
  await new Promise((res, rej) => { server.once('error', rej); server.listen(port, '127.0.0.1', res); });
  log('DEV HOOKS up (test only)', { port: server.address().port });
  return { server, port: server.address().port, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }) };
}
