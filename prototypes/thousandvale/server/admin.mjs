// The ADMIN page (stream A, PLAN §11.7): online players, rooms, kick / timed mute / ban (account + address hash) /
// rename, the last hour of chat, reports, FEEDBACK (play-test 5 T21: suggestions + bug reports with new / approved /
// declined / trashed), password-reset codes, the economy log, server stats, and two owner
// buttons (start a realm event now, a realm-wide announcement).
//
// SAFETY: it listens on 127.0.0.1 ONLY (refuses any other host) and is never tunnelled — reach it by SSH tunnel
// (`ssh -L 8492:127.0.0.1:8492 <vm>`). Every /api call needs the local token (`Authorization: Bearer …`); the Host
// header must be 127.0.0.1/localhost (a DNS-rebinding page cannot reach it); answers carry no CORS headers, and a
// change is a POST with a JSON body (a plain cross-site form cannot send one). The token comes from TV_ADMIN_TOKEN, or
// is generated at boot and written to <state>/admin-token (mode 0600) — never logged.
//
//   const a = await startAdmin({ port, gateway, status, store, log, token?, tokenFile? })   a.close()

import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFileSync, mkdirSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { adminPage } from './admin-page.js';

export const ADMIN_HOST = '127.0.0.1';

/** The token: env, else the file (kept across restarts), else a new one written to the file. */
export function adminToken({ env = process.env, tokenFile = null } = {}) {
  if (env.TV_ADMIN_TOKEN && env.TV_ADMIN_TOKEN.length >= 16) return { token: env.TV_ADMIN_TOKEN, from: 'env' };
  if (tokenFile && existsSync(tokenFile)) { const t = readFileSync(tokenFile, 'utf8').trim(); if (t.length >= 16) return { token: t, from: tokenFile }; }
  const token = randomBytes(24).toString('hex');
  if (tokenFile) {
    try { mkdirSync(dirname(tokenFile), { recursive: true }); writeFileSync(tokenFile, token + '\n', { mode: 0o600 }); chmodSync(tokenFile, 0o600); return { token, from: tokenFile }; }
    catch { /* read-only (the published stable copy): set TV_ADMIN_TOKEN in /etc/thousandvale/env */ }
  }
  return { token, from: 'memory' };
}

export async function startAdmin({ port, gateway, status, store, log = () => {}, token, host = ADMIN_HOST }) {
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('the admin page listens on 127.0.0.1 only');
  const want = Buffer.from(String(token));
  const authed = req => {
    const h = String(req.headers.authorization || '');
    const got = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
    return got.length === want.length && timingSafeEqual(got, want);
  };
  let realPort = port;
  const hostOk = req => { const h = String(req.headers.host || '').toLowerCase(); return h === `127.0.0.1:${realPort}` || h === `localhost:${realPort}` || h === `[::1]:${realPort}`; };
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  const body = req => new Promise((res, rej) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > 16384) { rej(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { res(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { rej(new Error('bad json')); } });
    req.on('error', rej);
  });
  const A = gateway.admin;
  const num = v => (Number.isSafeInteger(+v) ? +v : null);

  const GET = {
    '/api/overview': async () => ({ status: status(), gateway: gateway.status() }),
    '/api/online': async () => A.online(),
    '/api/rooms': async () => (status().rooms || []),
    '/api/chat': async q => A.chat(q.since ? +q.since : Date.now() - 3600000),
    '/api/reports': async () => A.reports(200),
    // play-test 5 T21: feedback (suggestions + bug reports) — ?state=new|approved|declined|trashed (none = all but trashed) &kind=bug|suggestion
    '/api/feedback': async q => A.feedback({ ...(q.state ? { state: String(q.state) } : {}), ...(q.kind ? { kind: String(q.kind) } : {}), limit: Math.max(1, Math.min(100, +q.limit || 100)), ...(q.before ? { before: +q.before } : {}) }),
    '/api/admins': async () => A.admins(),
    '/api/resets': async () => A.resets(),
    '/api/economy': async q => {
      const hours = Math.max(1, Math.min(24 * 30, +q.hours || 24));
      const rows = await A.economy(hours);
      const sum = { faucet: { gold: 0, items: 0, byReason: {} }, sink: { gold: 0, items: 0, byReason: {} } };
      for (const r of rows) { const o = sum[r.kind]; if (!o) continue; o.gold += r.gold; o.items += r.items; const b = o.byReason[r.reason] ||= { gold: 0, items: 0, count: 0 }; b.gold += r.gold; b.items += r.items; b.count += r.count; }
      return { hours, sum, rows: rows.slice(0, 500), live: status().economy || null };
    },
  };
  const POST = {
    '/api/kick': async b => ({ ok: A.kick(num(b.char)) }),
    '/api/mute': async b => ({ ok: A.mute(num(b.char), Date.now() + Math.max(0, Math.min(7 * 24 * 60, +b.minutes || 10)) * 60000) }),
    '/api/unmute': async b => ({ ok: A.mute(num(b.char), Date.now()) }),
    '/api/ban': async b => A.ban({ char: num(b.char), account: num(b.account), untilMs: Date.now() + Math.max(1, Math.min(24 * 3650, +b.hours || 24)) * 3600000, reason: String(b.reason || '').slice(0, 200), ip: !!b.ip }),
    '/api/unban': async b => A.unban(num(b.account)),
    '/api/rename': async b => A.rename(num(b.char), String(b.name || '')),
    '/api/report-done': async b => ({ ok: await A.handleReport(num(b.id)) }),
    '/api/feedback-state': async b => A.feedbackState(num(b.id), String(b.state || ''), b.note != null ? String(b.note).slice(0, 500) : null),
    '/api/announce': async b => ({ ok: A.announce(b.text) }),
    '/api/event': async b => ({ ok: A.forceEvent(b.id ? String(b.id) : null, Math.max(0, +b.announceMs || 60000)) }),
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (!hostOk(req)) { res.writeHead(421); res.end(); return; }
      const [path, qs] = req.url.split('?');
      if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' });
        res.end(adminPage());
        return;
      }
      if (!path.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
      if (!authed(req)) { json(res, 401, { error: 'token' }); return; }
      const q = Object.fromEntries(new URLSearchParams(qs || ''));
      if (req.method === 'GET' && GET[path]) return json(res, 200, await GET[path](q));
      if (req.method === 'POST' && POST[path]) {
        if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'json only' });
        const b = await body(req);
        const out = await POST[path](b);
        log('admin action', { path, char: b.char ?? null, account: b.account ?? null });
        return json(res, 200, out);
      }
      json(res, 404, { error: 'no such call' });
    } catch (err) { json(res, 500, { error: String(err && err.message) }); }
  });
  await new Promise((res, rej) => { server.once('error', rej); server.listen(port, host, res); });
  realPort = server.address().port;
  log('admin page up', { host, port: realPort });
  return { server, port: realPort, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }) };
}
