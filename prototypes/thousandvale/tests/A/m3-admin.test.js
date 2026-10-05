// M3 admin page (PLAN §11.7) and public mode (PLAN §11.2–11.5): the admin page answers only with the token, only
// to a 127.0.0.1 Host, only JSON POSTs change things; kick / mute / ban / rename / announce / reports / resets /
// economy work. Public mode: /privacy.json, security headers, loopback peers are NOT trusted (the tunnel arrives
// over loopback), CF-Connecting-IP is believed only from loopback.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startAdmin, adminToken } from '../../server/admin.mjs';
import { startServer } from '../../server/main.mjs';
import { m3Server, joinAs, run } from './m3-helpers.js';

function req(port, path, { method = 'GET', token = null, body = null, host = null, type = 'application/json' } = {}) {
  return new Promise((res, rej) => {
    const headers = { Host: host || `127.0.0.1:${port}` };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== null) headers['Content-Type'] = type;
    const r = http.request({ host: '127.0.0.1', port, path, method, headers }, x => { let d = ''; x.on('data', c => { d += c; }); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: d, json: () => JSON.parse(d) })); });
    r.on('error', rej);
    if (body !== null) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

test('admin page: token, host check, json-only changes; online/kick/mute/ban/rename/announce/reports/resets/economy', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await joinAs(srv, clock, 'Watched'), b = await joinAs(srv, clock, 'Bystander');
  const token = 'x'.repeat(32);
  assert.equal(adminToken({ env: { TV_ADMIN_TOKEN: 'z'.repeat(20) } }).token, 'z'.repeat(20));
  assert.equal(adminToken({ env: { TV_ADMIN_TOKEN: 'short' } }).from, 'memory', 'a short env token is not used');
  const status = () => srv.world.status();
  await assert.rejects(startAdmin({ port: 0, gateway: srv.world.gateway, status, store, token, host: '0.0.0.0' }), /127\.0\.0\.1 only/);
  const ad = await startAdmin({ port: 0, gateway: srv.world.gateway, status, store, token });
  const P = ad.port;
  try {
    assert.equal(ad.server.address().address, '127.0.0.1');
    const page = await req(P, '/');
    assert.equal(page.status, 200); assert.match(page.body, /Thousandvale admin/); assert.equal(page.headers['x-frame-options'], 'DENY');
    assert.equal((await req(P, '/api/online')).status, 401, 'no token');
    assert.equal((await req(P, '/api/online', { token: 'y'.repeat(32) })).status, 401, 'wrong token');
    assert.equal((await req(P, '/api/online', { token, host: 'evil.example' })).status, 421, 'a rebinding Host is refused');
    const online = (await req(P, '/api/online', { token })).json();
    assert.deepEqual(online.map(p => p.name).sort(), ['Bystander', 'Watched']);
    const me = online.find(p => p.name === 'Watched');
    assert.equal((await req(P, '/api/mute', { method: 'POST', token, body: 'char=' + me.char, type: 'application/x-www-form-urlencoded' })).status, 415, 'a form post cannot change anything');
    const notes = []; a.on('muted', m => notes.push(m));
    assert.equal((await req(P, '/api/mute', { method: 'POST', token, body: { char: me.char, minutes: 15 } })).json().ok, true);
    await run(clock, 100);
    assert.equal(notes.length, 1);
    assert.ok(srv.world.gateway.presence.get(me.char).mutedUntil > Date.now() + 14 * 60000);
    // announce reaches everyone as a system line
    const lines = []; b.on('chat', m => lines.push(m));
    assert.equal((await req(P, '/api/announce', { method: 'POST', token, body: { text: 'Restart in 5 minutes' } })).json().ok, true);
    await run(clock, 100);
    assert.equal(lines.at(-1).ch, 'system'); assert.equal(lines.at(-1).text, 'Restart in 5 minutes');
    // chat view, reports, resets, economy, overview, rooms
    assert.ok(Array.isArray((await req(P, '/api/chat', { token })).json()));
    assert.ok(Array.isArray((await req(P, '/api/reports', { token })).json()));
    assert.ok(Array.isArray((await req(P, '/api/resets', { token })).json()));
    const eco = (await req(P, '/api/economy?hours=6', { token })).json();
    assert.equal(eco.hours, 6); assert.ok(eco.sum.faucet);
    const ov = (await req(P, '/api/overview', { token })).json();
    assert.ok(ov.status.rooms.length >= 1); assert.ok(ov.gateway.callboard);
    assert.ok((await req(P, '/api/rooms', { token })).json().length >= 1);
    // kick, then rename while away, then ban
    const kicks = []; a.on('kick', m => kicks.push(m.code));
    assert.equal((await req(P, '/api/kick', { method: 'POST', token, body: { char: me.char } })).json().ok, true);
    await run(clock, 300);
    assert.ok(kicks.length >= 1);
    const ren = (await req(P, '/api/rename', { method: 'POST', token, body: { char: me.char, name: 'Renamed' } })).json();
    await run(clock, 300);
    const ren2 = ren.ok ? ren : (await req(P, '/api/rename', { method: 'POST', token, body: { char: me.char, name: 'Renamed' } })).json();
    assert.equal(ren2.ok, true, JSON.stringify(ren2));
    assert.equal(store.data.chars[me.char].cols.name, 'Renamed');
    const ban = (await req(P, '/api/ban', { method: 'POST', token, body: { char: b.joined.you.char, hours: 2, reason: 'test', ip: true } })).json();
    assert.equal(ban.ok, true, JSON.stringify(ban));
    assert.ok(store.data.accounts[ban.account].bannedUntil > Date.now() + 3600000);
    assert.equal((await req(P, '/api/unban', { method: 'POST', token, body: { account: ban.account } })).json().ok, true);
    assert.equal(store.data.accounts[ban.account].bannedUntil, 0);
    assert.equal((await req(P, '/api/nope', { token })).status, 404);
  } finally { await ad.close(); a.close(); b.close(); await srv.stop(); }
});

test('public mode: privacy.json, security headers, loopback not trusted, CF-Connecting-IP only from loopback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tv-public-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>tv</title>');
  const s = await startServer({ port: 0, host: '127.0.0.1', hostGiven: true, adminPort: 0, db: 'memory', build: 'dev', rules: 'v0', provinces: ['standin'], linger: 0, maxPerIp: 4, saveEvery: 60000, process: 'pubtest', env: 'dev', publicDir: dir, journalMs: 2000, procs: 0, director: {} });
  const port = s.server.address().port;
  const socks = [];
  try {
    const pv = await req(port, '/privacy.json');
    assert.equal(pv.status, 200);
    const p = pv.json();
    assert.ok(p.summary && p.stored.length >= 5 && p.stored.some(x => /chat/i.test(x.what)));
    assert.equal(pv.headers['x-content-type-options'], 'nosniff'); assert.equal(pv.headers['x-frame-options'], 'DENY');
    const idx = await req(port, '/');
    assert.ok([200, 302].includes(idx.status)); assert.equal(idx.headers['referrer-policy'], 'no-referrer');
    assert.equal((await req(port, '/server/main.mjs')).status, 404);
    const open = headers => new Promise(res => {
      const w = new WebSocket(`ws://127.0.0.1:${port}/gw`, { headers });
      socks.push(w);
      w.on('open', () => res('open')); w.on('unexpected-response', (q, r) => res(r.statusCode)); w.on('error', () => res('error'));
    });
    // a loopback peer WITHOUT the header is just one more address: 4 sockets, the 5th is refused
    const plain = [];
    for (let i = 0; i < 5; i++) plain.push(await open({}));
    assert.deepEqual(plain, ['open', 'open', 'open', 'open', 429]);
    // with CF-Connecting-IP from loopback (the tunnel), each visitor counts on its own
    const viaTunnel = [];
    for (let i = 0; i < 3; i++) viaTunnel.push(await open({ 'CF-Connecting-IP': '203.0.113.' + (i + 1) }));
    assert.deepEqual(viaTunnel, ['open', 'open', 'open']);
    // a junk header value is not believed
    assert.equal(await open({ 'CF-Connecting-IP': 'evil<script>' }), 429);
  } finally {
    for (const w of socks) try { w.terminate(); } catch { /* gone */ }
    await s.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
