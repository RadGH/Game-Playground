// The games.radgh.com admin hooks (same routes and header as Tumblefair's server/rgs.mjs createAdminFeed):
//   GET  /internal/admin/feed     -> { game, build, uptime_s, online: { rooms, players }, reports: [], ratings: [], rooms: [...] }
//   POST /internal/admin/action   { action: 'close', code } -> { ok, closed }   (close one room, e.g. a stuck one)
// Switched on only when RGS_ADMIN_SECRET is set (otherwise 404, as if they did not exist); every call needs the header
// `x-rgs-admin: <secret>` (compared in constant time; a wrong one gets 403). Wyrmroad's bug reports and ratings go
// through the playground's own report box (rgs api), not this server — so `reports` and `ratings` are always empty here.
import { createHash, timingSafeEqual } from 'node:crypto';

const same = (a, b) => { const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(x, y); };

export function createAdminFeed({ game = 'wyrmroad', build = 'dev', hub, secret = process.env.RGS_ADMIN_SECRET || '', started = Date.now() }) {
  const reply = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  function feed() {
    const st = hub.status();
    return { game, build, uptime_s: Math.round((Date.now() - started) / 1000), online: { rooms: st.rooms, players: st.players }, reports: [], ratings: [],
      counts: { days: [], totals: { visitors: 0, events: {} } }, status: st, rooms: hub.detail() };
  }
  function action(body) {
    if (body?.action === 'close' && typeof body.code === 'string') {
      const room = hub.rooms.get(body.code.toUpperCase());
      if (!room) return { code: 404, body: { ok: false, error: { code: 'no_room' } } };
      room.close('admin'); hub.rooms.delete(body.code.toUpperCase());
      return { code: 200, body: { ok: true, closed: body.code.toUpperCase() } };
    }
    if (body?.action === 'report') return { code: 400, body: { ok: false, error: { code: 'reports_elsewhere', message: 'Wyrmroad reports live in the playground report box.' } } };
    return { code: 400, body: { ok: false, error: { code: 'bad_action' } } };
  }
  function handle(req, res, path) {
    if (path !== '/internal/admin/feed' && path !== '/internal/admin/action') return false;
    if (!secret) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return true; }
    const given = req.headers['x-rgs-admin'];
    if (typeof given !== 'string' || !same(given, secret)) { reply(res, 403, { ok: false, error: { code: 'forbidden' } }); return true; }
    if (path === '/internal/admin/feed') {
      if (req.method !== 'GET') { reply(res, 405, { ok: false }); return true; }
      reply(res, 200, feed()); return true;
    }
    if (req.method !== 'POST') { reply(res, 405, { ok: false }); return true; }
    let size = 0, over = false; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 16 * 1024) { over = true; req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (over) return reply(res, 413, { ok: false });
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(res, 400, { ok: false, error: { code: 'bad_json' } }); }
      const r = action(body); reply(res, r.code, r.body);
    });
    return true;
  }
  return { handle, feed, action };
}
