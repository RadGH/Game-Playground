#!/usr/bin/env node
// Thousandvale — live probes for the public-link checklist (stream H, PLAN §11). Read-only: it creates no account,
// writes nothing, and closes every socket it opens. Run by ops/lib/check-public.sh; also usable alone:
//   node ops/lib/probe-public.mjs [--base http://127.0.0.1:8490] [--lan http://192.168.1.34:8490] [--admin-port 8492] [--json]
// M3 (protocol v4, A's notes): the server must run in PUBLIC MODE (--public): safety headers on every answer, and a
// loopback peer WITHOUT CF-Connecting-IP (or with a junk one) counts as ONE address like anyone — only dev trusts loopback.
// The admin page (server/admin.mjs) must answer on 127.0.0.1:<admin-port> only, never on the LAN or through the game port.
// Prints one line per probe ("ok"/"FAIL"), exits 1 if any probe failed.
import http from 'node:http';
import { WebSocket } from 'ws';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const BASE = new URL(arg('base', 'http://127.0.0.1:8490'));
const LAN = arg('lan', null);
const ADMIN_PORT = +arg('admin-port', 8492);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOCAL = ['127.0.0.1', 'localhost', '[::1]'].includes(BASE.hostname);
const results = [];
const rec = (ok, what, detail = '') => { results.push({ ok, what, detail }); console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ' — ' + detail : ''}`); };

/** Raw request: the path is sent exactly as given (fetch would normalise `..` away). */
function raw(method, path, { base = BASE, headers = {}, body = null } = {}) {
  return new Promise(res => {
    const req = http.request({ host: base.hostname, port: base.port, method, path, headers: { host: base.host, ...headers }, timeout: 5000 }, r => {
      let n = 0; const chunks = [];
      r.on('data', c => { if (n < 65536) chunks.push(c); n += c.length; }).on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', e => res({ status: 0, error: e.message })).on('timeout', () => { req.destroy(); res({ status: 0, error: 'timeout' }); });
    if (body) req.write(body);
    req.end();
  });
}

/** Open a /gw socket with headers; resolves { opened, status, closeCode }. */
function sock(headers = {}, { base = BASE, path = '/gw', send = null, holdMs = 0 } = {}) {
  return new Promise(res => {
    const url = base.href.replace(/^http/, 'ws').replace(/\/$/, '') + path;
    const ws = new WebSocket(url, { headers, handshakeTimeout: 5000 });
    let out = { opened: false, status: 0, closeCode: 0, ws };
    ws.on('unexpected-response', (_req, r) => { out.status = r.statusCode; r.resume(); res(out); });
    ws.on('error', e => { if (!out.opened && !out.status) { out.error = e.message; res(out); } });
    ws.on('open', () => {
      out.opened = true;
      if (send) ws.send(send);
      if (!send) setTimeout(() => res(out), holdMs);
    });
    ws.on('close', code => { out.closeCode = code; if (send) res(out); });
    if (send) setTimeout(() => res(out), 4000);
  });
}

// ---- 1. the server serves the playground pages and the game, and nothing else ----
const root = await raw('GET', '/');
rec(root.status === 200 && /<title>Playground/.test(root.body), 'GET / is the playground home page', `HTTP ${root.status}`);
const game = await raw('GET', '/prototypes/thousandvale/');
rec(game.status === 200, 'the game page is served', `HTTP ${game.status}`);
const priv = await raw('GET', '/prototypes/thousandvale/public/privacy.html');
rec(priv.status === 200 && /stored/i.test(priv.body), 'the privacy note is served', `HTTP ${priv.status}`);
const MUST_404 = [
  '/prototypes/thousandvale/server/main.mjs', '/prototypes/thousandvale/server/', '/prototypes/thousandvale/ops/setup-stable.sh',
  '/prototypes/thousandvale/ops/stable.env.template', '/prototypes/thousandvale/docs/PLAN.md', '/prototypes/thousandvale/tests/H/offsite.test.js',
  '/prototypes/thousandvale/tools/bot-client.mjs', '/prototypes/thousandvale/package.json', '/prototypes/thousandvale/node_modules/pg/package.json',
  '/prototypes/thousandvale/.data/dev-store.json', '/.git/config', '/.git/HEAD', '/.gitignore', '/CLAUDE.md', '/tools/serve.py',
  '/library/synced/library.json', '/prototypes/farhold/tests/', '/prototypes/farhold/tools/', '/prototypes/farhold/research/review-round10.md',
  '/library/tests/library.spec.js', '/items/tools/build-items.py', '/prototypes/tumblefair/server/', '/prototypes/tumblefair/package.json',
  '/package.json', '/README.md', '/serve.sh', '/docs/research-voices.md', '/tests/experiments.test.js', '/prototypes/tinyrts/', '/../../etc/passwd', '/prototypes/../../../etc/passwd',
  '/..%2f..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/%2e%2e/etc/passwd', '/prototypes/thousandvale/%2e%2e/%2e%2e/%2e%2e/CLAUDE.md',
  '/prototypes/thousandvale/server%2fmain.mjs', '/prototypes/thousandvale/%00.html', '/home/radgh/claude/secrets/',
  '/admin', '/admin/', '/api/players', '/prototypes/thousandvale/server/admin.mjs', '/prototypes/thousandvale/server/privacy.json',
];
const leaks = [];
for (const p of MUST_404) { const r = await raw('GET', p); if (r.status !== 404 && r.status !== 400) leaks.push(`${p} -> ${r.status || r.error}`); }
rec(leaks.length === 0, `${MUST_404.length} server-side / dotfile / traversal paths refused`, leaks.join('; '));
const post = await raw('POST', '/api/library/sync', { headers: { 'content-type': 'application/json' }, body: '{}' });
rec(post.status === 405 || post.status === 404, 'POST (serve.py-style file write) refused', `HTTP ${post.status}`);
const st = await raw('GET', '/status');
let sj = null; try { sj = JSON.parse(st.body); } catch { /* not json */ }
rec(!!sj && sj.server === 'thousandvale', '/status is the game (not another service)', sj ? `build ${sj.build}` : `HTTP ${st.status}`);
// public mode (main.mjs PUBLIC_HEADERS): every answer carries them; their absence means the server was not started --public
const WANT_HEADERS = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' };
const missingH = Object.entries(WANT_HEADERS).filter(([k, v]) => String(st.headers?.[k] || '').toLowerCase() !== v.toLowerCase()).map(([k]) => k);
rec(missingH.length === 0, 'public mode: safety headers on every answer (server started with --public)', missingH.length ? 'missing ' + missingH.join(', ') : '');
const pj = await raw('GET', '/privacy.json');
let pjj = null; try { pjj = JSON.parse(pj.body); } catch { /* not json */ }
rec(!!pjj && Array.isArray(pjj.stored) && pjj.stored.length > 0, '/privacy.json lists what is stored', `HTTP ${pj.status}`);
const ipLike = st.body.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
rec(ipLike.length === 0 && !/token|password|secret|PGPASS/i.test(st.body), '/status carries no addresses, tokens or secrets', ipLike.slice(0, 3).join(','));

// ---- 2. WebSocket limits (PLAN §11.5) ----
const big = await sock({}, { send: Buffer.alloc(20 * 1024, 65) });
rec(big.closeCode === 1009, 'a 20 KB frame is refused (maxPayload 16 KB)', `close ${big.closeCode || big.status || big.error}`);
const evil = await sock({ Origin: 'https://evil.example' });
rec(evil.status === 403, 'a foreign Origin is refused', `HTTP ${evil.status} opened=${evil.opened}`);
evil.ws.terminate();
const wrongPath = await sock({}, { path: '/admin' });
rec(!wrongPath.opened, 'sockets only on /gw and /p/<n>', wrongPath.opened ? 'opened!' : 'refused');
wrongPath.ws.terminate();

// through-the-tunnel simulation: loopback peer + CF-Connecting-IP = one visitor; the 5th socket must be refused
if (['127.0.0.1', 'localhost', '[::1]'].includes(BASE.hostname)) {
  const viaTunnel = [];
  for (let i = 0; i < 5; i++) viaTunnel.push(await sock({ 'CF-Connecting-IP': '203.0.113.77' }, { holdMs: 50 }));
  const opened = viaTunnel.filter(s => s.opened).length;
  rec(opened === 4 && viaTunnel[4].status === 429, 'one visitor through the tunnel gets at most 4 sockets (CF-Connecting-IP trusted from loopback)', `opened ${opened}, 5th HTTP ${viaTunnel[4].status}`);
  viaTunnel.forEach(s => s.ws.terminate());
}
// public mode: a loopback peer with NO CF header (another local proxy, a forgotten script) is one address, not unlimited;
// a junk CF-Connecting-IP value is ignored, so those sockets count as that same loopback address
if (LOCAL) {
  await sleep(300);
  const bare = [];
  for (let i = 0; i < 5; i++) bare.push(await sock({}, { holdMs: 50 }));
  const opened = bare.filter(s => s.opened).length;
  rec(opened === 4 && bare[4].status === 429, 'a loopback peer without CF-Connecting-IP is capped like anyone (public mode)', `opened ${opened}, 5th HTTP ${bare[4].status}`);
  bare.forEach(s => s.ws.terminate());
  await sleep(300);
  const junk = [];
  for (let i = 0; i < 5; i++) junk.push(await sock({ 'CF-Connecting-IP': ['not-an-address', '<script>', '1.2.3.4, 5.6.7.8', 'x'.repeat(60), ''][i] || 'junk' }, { holdMs: 50 }));
  const jOpened = junk.filter(s => s.opened).length;
  rec(jOpened === 4 && junk[4].status === 429, 'a junk CF-Connecting-IP value is ignored (counted as the peer)', `opened ${jOpened}, 5th HTTP ${junk[4].status}`);
  junk.forEach(s => s.ws.terminate());
}
// spoofing: a LAN peer sending CF-Connecting-IP must NOT be believed (5 different "visitors" from one LAN address)
if (LAN) {
  const lanBase = new URL(LAN);
  const first = await sock({}, { base: lanBase, holdMs: 20 });
  if (!first.opened && (first.error || '').match(/ECONNREFUSED|EHOSTUNREACH|timeout/i)) rec(true, 'LAN port closed (server bound to 127.0.0.1) — spoof probe not needed');
  else {
    first.ws.terminate(); await new Promise(r => setTimeout(r, 200));
    const spoof = [];
    for (let i = 0; i < 5; i++) spoof.push(await sock({ 'CF-Connecting-IP': `198.51.100.${i + 1}` }, { base: lanBase, holdMs: 50 }));
    const opened = spoof.filter(s => s.opened).length;
    rec(opened === 4 && spoof[4].status === 429, 'a forged CF-Connecting-IP from a non-loopback peer is ignored', `opened ${opened}, 5th HTTP ${spoof[4].status}`);
    spoof.forEach(s => s.ws.terminate());
  }
}

// ---- 3. the admin page: 127.0.0.1 only, token required ----
if (ADMIN_PORT > 0 && LOCAL) {
  const adminBase = new URL(`http://127.0.0.1:${ADMIN_PORT}`);
  const a = await raw('GET', '/api/status', { base: adminBase });
  if (a.status === 0 && /ECONNREFUSED/.test(a.error || '')) rec(true, `admin page not running on 127.0.0.1:${ADMIN_PORT} (nothing to expose)`);
  else rec(a.status === 401 || a.status === 403, `admin page on 127.0.0.1:${ADMIN_PORT} refuses a call without the token`, `HTTP ${a.status || a.error}`);
  const rebind = await raw('GET', '/api/status', { base: adminBase, headers: { host: 'evil.example' } });
  rec(rebind.status !== 200, 'admin page refuses a foreign Host header (DNS rebinding)', `HTTP ${rebind.status || rebind.error}`);
  if (LAN) {
    const lanAdmin = await raw('GET', '/', { base: new URL(`http://${new URL(LAN).hostname}:${ADMIN_PORT}`) });
    rec(lanAdmin.status === 0, `admin port ${ADMIN_PORT} is closed on the LAN address`, lanAdmin.status ? `answered HTTP ${lanAdmin.status}!` : lanAdmin.error);
  }
}

const failed = results.filter(r => !r.ok).length;
if (process.argv.includes('--json')) console.log(JSON.stringify({ base: BASE.href, failed, results }));
setTimeout(() => process.exit(failed ? 1 : 0), 100);
