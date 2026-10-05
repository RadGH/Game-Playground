// Stream H: the VPS kit (ops/vps/, docs/HOSTING.md) — no network, no sudo, no real VPS.
//   1. the templates say what HOSTING.md promises (127.0.0.1 only, small-realm caps, 22/80/443, header replaced)
//   2. bootstrap.sh --dry-run runs without root and refuses bad input
//   3. Caddy really sets CF-Connecting-IP to the peer (a forged one is replaced), passes WebSockets, hides /admin —
//      and server/main.mjs clientIp() believes the address Caddy hands it. Needs a caddy binary (PATH or TV_CADDY), else skipped.
//   4. deploy.sh / rollback.sh against a fake VPS on this machine: ship, hard-link unchanged files, refuse a broken
//      release and switch back by itself, roll back by hand, keep at most 3 + the live one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, statSync, readlinkSync, existsSync, readdirSync, chmodSync, rmSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { clientIp } from '../../server/main.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '../..');
const VPS = join(GAME, 'ops/vps');
const read = p => readFileSync(join(GAME, p), 'utf8');
const freePort = () => new Promise(r => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

test('VPS unit: binds 127.0.0.1, public mode, small-realm guest caps, localhost-only drop-in', () => {
  const u = read('ops/vps/thousandvale.service');
  const exec = u.split('\n').filter(l => l.startsWith('ExecStart='));
  assert.equal(exec.length, 1);
  assert.match(exec[0], /--host 127\.0\.0\.1 /);
  assert.match(exec[0], /--port 8490 /);
  assert.match(exec[0], /--public \/srv\/thousandvale\/current\/public /);
  assert.match(exec[0], /--max-per-ip 4 /);
  assert.match(exec[0], /--guests-per-ip-hour \d+ /);
  assert.match(exec[0], /--guests-per-hour \d+ /);
  assert.doesNotMatch(exec[0], /--unlimited-ip|--dev-hooks|0\.0\.0\.0/);
  for (const h of ['ProtectHome=yes', 'NoNewPrivileges=yes', 'User=thousandvale', 'ProtectSystem=strict']) assert.match(u, new RegExp('^' + h + '$', 'm'));
  const d = read('ops/vps/thousandvale-localhost-only.conf');
  assert.match(d, /^IPAddressDeny=any$/m);
  assert.match(d, /^IPAddressAllow=localhost$/m);
  // every flag the unit passes is one the server knows (an unknown flag = a server that never starts)
  const known = read('server/main.mjs');
  for (const f of exec[0].match(/--[a-z-]+/g)) assert.ok(known.includes(`'${f}'`), `server/main.mjs does not know ${f}`);
});

test('Caddyfile template: one site -> 127.0.0.1:8490, CF-Connecting-IP set from the peer, /admin hidden', () => {
  const c = read('ops/vps/Caddyfile.template');
  const ups = [...c.matchAll(/reverse_proxy\s+(\S+)/g)].map(m => m[1]);
  assert.deepEqual(ups, ['127.0.0.1:8490']);
  assert.match(c, /header_up CF-Connecting-IP \{remote_host\}/);
  assert.match(c, /respond \/admin\* 404/);
  assert.match(c, /^@DOMAIN@ \{/m);
  assert.match(c, /email @EMAIL@/);
  assert.doesNotMatch(c.replace(/#.*$/gm, ''), /:(8400|8401|8491|8492|5432)\b/);
});

test('bootstrap: firewall opens only 22, 80, 443; env forced to 127.0.0.1; key-only ssh only when keys exist', () => {
  const b = read('ops/vps/bootstrap.sh');
  const allows = [...b.matchAll(/ufw allow (\S+)/g)].map(m => m[1]);
  assert.deepEqual(allows.sort(), ['22/tcp', '443/tcp', '443/udp', '80/tcp']);
  assert.match(b, /ufw default deny incoming/);
  assert.match(b, /TV_HOST=0\.0\.0\.0\/TV_HOST=127\.0\.0\.1/);
  assert.match(b, /authorized_keys && -s \/home\/tvdeploy\/\.ssh\/authorized_keys/);
  assert.match(b, /sha256sum -c/, 'node download is checksum-verified');
  assert.doesNotMatch(b, /secrets\//);
});

test('bootstrap --dry-run: runs without root, refuses a bad domain or email', () => {
  const ok = spawnSync('bash', [join(VPS, 'bootstrap.sh'), '--domain', 'play.example.com', '--email', 'a@example.com', '--dry-run'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  for (const step of ['1. system', '2. firewall', '3. users', '4. node', '5. postgres', '6. caddy', '7. systemd', '8. ssh']) assert.match(ok.stdout, new RegExp('== ' + step.replace('.', '\\.')));
  const bad = spawnSync('bash', [join(VPS, 'bootstrap.sh'), '--domain', 'Play Example', '--email', 'a@example.com', '--dry-run'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  const noMail = spawnSync('bash', [join(VPS, 'bootstrap.sh'), '--domain', 'play.example.com', '--dry-run'], { encoding: 'utf8' });
  assert.equal(noMail.status, 2);
});

function caddyBin() {
  if (process.env.TV_CADDY) return process.env.TV_CADDY;
  try { return execFileSync('sh', ['-c', 'command -v caddy'], { encoding: 'utf8' }).trim() || null; } catch { return null; }
}

test('Caddy in front: real address replaces a forged CF-Connecting-IP, WebSockets pass, /admin 404', async t => {
  const caddy = caddyBin();
  if (!caddy) return t.skip('caddy not installed (set TV_CADDY=/path/to/caddy)');
  const dir = mkdtempSync(join(tmpdir(), 'tvcaddy-'));
  const up = await freePort(), front = await freePort(), adminPort = await freePort();
  // the template, made local: plain http on a free port, logs in the temp dir, the upstream on a free port
  let cfg = read('ops/vps/Caddyfile.template').replaceAll('@EMAIL@', 'test@example.com')
    .replace(/^@DOMAIN@ \{/m, `http://127.0.0.1:${front} {`).replaceAll('127.0.0.1:8490', `127.0.0.1:${up}`)
    .replace('/var/log/caddy/thousandvale.log', join(dir, 'access.log')).replace(/^:80 \{[\s\S]*?^\}/m, '')
    .replace(/^\{/m, `{\n\tadmin 127.0.0.1:${adminPort}\n\tauto_https off`);
  writeFileSync(join(dir, 'Caddyfile'), cfg);
  const v = spawnSync(caddy, ['validate', '--config', join(dir, 'Caddyfile'), '--adapter', 'caddyfile'], { encoding: 'utf8' });
  assert.equal(v.status, 0, v.stderr);

  const seen = [];
  const srv = http.createServer((req, res) => { seen.push({ peer: req.socket.remoteAddress, cf: req.headers['cf-connecting-ip'], ip: clientIp(req, false).ip }); res.end('ok'); });
  const wss = new WebSocketServer({ noServer: true });
  srv.on('upgrade', (req, sock, head) => wss.handleUpgrade(req, sock, head, ws => { ws.send(JSON.stringify({ cf: req.headers['cf-connecting-ip'], origin: req.headers.origin, host: req.headers.host })); }));
  await new Promise(r => srv.listen(up, '127.0.0.1', r));
  const proc = spawn(caddy, ['run', '--config', join(dir, 'Caddyfile'), '--adapter', 'caddyfile'], { stdio: 'ignore' });
  t.after(() => { proc.kill(); srv.close(); rmSync(dir, { recursive: true, force: true }); });
  const get = (path, headers = {}) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: front, path, headers }, r => { let b = ''; r.on('data', d => b += d).on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) { try { await get('/healthz'); ready = true; } catch { await new Promise(r => setTimeout(r, 100)); } }
  assert.ok(ready, 'caddy did not come up');
  seen.length = 0;
  const r1 = await get('/x', { 'CF-Connecting-IP': '6.6.6.6', 'X-Forwarded-For': '6.6.6.6' });
  assert.equal(r1.status, 200);
  assert.equal(seen[0].cf, '127.0.0.1', 'Caddy replaced the forged header with the real peer');
  assert.equal(seen[0].ip, '127.0.0.1', 'and the game\'s clientIp() reads that address');
  assert.equal((await get('/admin')).status, 404);
  assert.equal((await get('/admin/x')).status, 404);
  const msg = await new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${front}/gw`, { headers: { Origin: `http://127.0.0.1:${front}`, 'CF-Connecting-IP': '6.6.6.6' } });
    ws.on('message', d => { res(JSON.parse(String(d))); ws.close(); }); ws.on('error', rej);
  });
  assert.equal(msg.cf, '127.0.0.1');
  assert.equal(msg.host, `127.0.0.1:${front}`, 'Host passes through unchanged (the game\'s Origin check compares it)');
  assert.equal(new URL(msg.origin).host, msg.host);
});

// ---------------------------------------------------------------- fake VPS on this machine
function fakeRelease(base, name, build, { broken = false, extra = '' } = {}) {
  const r = join(base, name);
  mkdirSync(join(r, 'app/prototypes/thousandvale'), { recursive: true });
  mkdirSync(join(r, 'public'), { recursive: true });
  writeFileSync(join(r, 'BUILD'), build + '\n');
  writeFileSync(join(r, 'app/prototypes/thousandvale/same.txt'), 'unchanged between releases\n');
  writeFileSync(join(r, 'public/index.html'), '<p>' + build + extra + '</p>');
  if (broken) writeFileSync(join(r, 'public/BROKEN'), '1');
  return r;
}

test('deploy.sh + rollback.sh against a fake VPS: ship, hard-link, refuse a broken release, roll back, prune', { timeout: 120000 }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'tvvps-'));
  const root = join(tmp, 'srv'); mkdirSync(join(root, 'releases'), { recursive: true });
  const rels = join(tmp, 'local'); mkdirSync(rels);
  const port = await freePort();
  // the "game": answers /healthz and /status with the live BUILD — unless the live release is marked BROKEN
  writeFileSync(join(tmp, 'fake-game.mjs'), `import http from 'node:http'; import fs from 'node:fs';
    const cur = ${JSON.stringify(root)} + '/current';
    if (fs.existsSync(cur + '/public/BROKEN')) process.exit(1);
    http.createServer((q, s) => { const b = fs.readFileSync(cur + '/BUILD', 'utf8').trim();
      if (q.url === '/healthz') return s.end('ok'); s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ build: b })); })
      .listen(${port}, '127.0.0.1');`);
  writeFileSync(join(tmp, 'restart.sh'), `#!/bin/bash\n[[ -f ${tmp}/pid ]] && kill $(cat ${tmp}/pid) 2>/dev/null; sleep 0.2\nsetsid ${process.execPath} ${tmp}/fake-game.mjs >/dev/null 2>&1 < /dev/null & echo $! > ${tmp}/pid\n`);
  // "ssh": drop the options and the host, run the rest here (as ssh would on the far side)
  writeFileSync(join(tmp, 'ssh'), `#!/bin/bash\nwhile [[ $# -gt 0 ]]; do case "$1" in -l|-i|-o|-p) shift 2 ;; -*) shift ;; *) shift; break ;; esac; done\nexec bash -c "$*"\n`);
  chmodSync(join(tmp, 'restart.sh'), 0o755); chmodSync(join(tmp, 'ssh'), 0o755);
  writeFileSync(join(tmp, 'target.env'), `TV_VPS_HOST=fakevps\nTV_VPS_DOMAIN=\nTV_VPS_EMAIL=x@example.com\nTV_VPS_KEY=${tmp}/nokey\n`);
  const env = { ...process.env, TV_VPS_ENV: join(tmp, 'target.env'), TV_VPS_SSH: join(tmp, 'ssh'), TV_VPS_ROOT: root, TV_VPS_PORT: String(port),
    TV_VPS_RESTART: `bash ${tmp}/restart.sh`, TV_VPS_SKIP_HTTPS: '1', TV_VPS_FAKE: '1', TV_VPS_WAIT: '6' };
  const sh = (script, args) => spawnSync('bash', [join(VPS, script), ...args], { env, encoding: 'utf8' });
  const live = () => basename(readlinkSync(join(root, 'current')));
  try {
    const a = fakeRelease(rels, 'aaaa-1', 'aaaa');
    let r = sh('deploy.sh', ['--release', a]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /live on the VPS: build aaaa/);
    assert.equal(live(), 'aaaa-1');
    assert.equal(statSync(join(root, 'releases/aaaa-1/BUILD')).mode & 0o007, 0, 'no access for others');

    r = sh('deploy.sh', ['--release', fakeRelease(rels, 'bbbb-2', 'bbbb')]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(live(), 'bbbb-2');
    const same = f => statSync(join(root, 'releases', f, 'app/prototypes/thousandvale/same.txt')).ino;
    assert.equal(same('aaaa-1'), same('bbbb-2'), 'an unchanged file is hard-linked to the live release, not sent again');

    r = sh('deploy.sh', ['--release', fakeRelease(rels, 'cccc-3', 'cccc', { broken: true })]);
    assert.equal(r.status, 1, 'a release that does not come up fails the deploy');
    assert.match(r.stdout, /rolled back to bbbb-2/);
    assert.equal(live(), 'bbbb-2', 'and the previous release is live again');

    r = sh('rollback.sh', ['--list']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^\* bbbb-2 bbbb$/m);
    r = sh('rollback.sh', []);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(live(), 'aaaa-1', 'rollback.sh goes to the release before the live one (skipping the failed one)');
    r = sh('rollback.sh', ['bbbb-2']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(live(), 'bbbb-2');
    assert.equal(sh('rollback.sh', ['nope-0']).status, 1);

    for (const [n, b] of [['dddd-4', 'dddd'], ['eeee-5', 'eeee'], ['ffff-6', 'ffff']]) {
      await new Promise(res => setTimeout(res, 1100));       // ls -t needs distinct mtimes
      r = sh('deploy.sh', ['--release', fakeRelease(rels, n, b)]); assert.equal(r.status, 0, r.stdout + r.stderr);
    }
    const kept = readdirSync(join(root, 'releases'));
    assert.ok(kept.length <= 4, 'keeps the live release + 3 more: ' + kept);
    assert.ok(kept.includes('ffff-6'));
    assert.ok(!existsSync(join(root, 'releases/aaaa-1')), 'the oldest are pruned');
  } finally {
    try { process.kill(+readFileSync(join(tmp, 'pid'), 'utf8')); } catch { /* gone */ }
    rmSync(tmp, { recursive: true, force: true });
  }
});
