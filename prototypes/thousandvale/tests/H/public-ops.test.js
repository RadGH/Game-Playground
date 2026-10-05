// Stream H: the going-public files stay safe by construction (no network, no sudo) — PLAN §11.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => readFileSync(join(GAME, p), 'utf8');
const FORBIDDEN_PORTS = /:(8400|8401|8491|8492|8495|5432|22)\b/;

test('quick tunnel unit: one origin (127.0.0.1:8490), cannot be enabled at boot, no config file', () => {
  const u = read('ops/tunnel/thousandvale-quick-tunnel.service');
  const exec = u.split('\n').filter(l => l.startsWith('ExecStart='));
  assert.equal(exec.length, 1);
  assert.match(exec[0], /--url http:\/\/127\.0\.0\.1:8490$/);
  assert.equal((exec[0].match(/--url/g) || []).length, 1);
  assert.doesNotMatch(exec[0], /--config|--hello-world|--http-host-header/);
  assert.doesNotMatch(u, /^\[Install\]/m, 'no [Install] section: the quick tunnel must never start by itself');
  assert.doesNotMatch(exec[0], FORBIDDEN_PORTS);
});

test('named tunnel config: one hostname -> 127.0.0.1:8490, catch-all 404, no Host rewrite', () => {
  const y = read('ops/tunnel/named/thousandvale.yml.template');
  const services = y.split('\n').filter(l => /^\s*-?\s*service:/.test(l)).map(l => l.split('service:')[1].trim());
  assert.deepEqual(services, ['http://127.0.0.1:8490', 'http_status:404']);
  assert.doesNotMatch(y.replace(/^#.*$/gm, ''), /httpHostHeader/i);
  assert.doesNotMatch(y.replace(/^#.*$/gm, ''), FORBIDDEN_PORTS);
  assert.doesNotMatch(y, /^\s*credentials-file:\s*\/(home|root)/m, 'credentials come in through LoadCredential');
  const unit = read('ops/tunnel/named/thousandvale-tunnel.service');
  assert.match(unit, /^DynamicUser=yes$/m);
  assert.match(unit, /^LoadCredential=tunnel\.json:\/etc\/cloudflared\/thousandvale-tunnel\.json$/m);
  assert.match(unit, /^ProtectHome=yes$/m);
});

test('named config passes `cloudflared ingress validate` (when cloudflared is installed)', t => {
  let cf; try { cf = execFileSync('sh', ['-c', 'command -v cloudflared'], { encoding: 'utf8' }).trim(); } catch { return t.skip('cloudflared not installed'); }
  const dir = mkdtempSync(join(tmpdir(), 'tvcf-'));
  const f = join(dir, 'c.yml');
  writeFileSync(f, read('ops/tunnel/named/thousandvale.yml.template').replace('@TUNNEL_ID@', '00000000-0000-0000-0000-000000000000').replace('@HOSTNAME@', 'play.example.com'));
  execFileSync(cf, ['tunnel', '--config', f, 'ingress', 'validate'], { stdio: 'pipe' });
  assert.match(execFileSync(cf, ['tunnel', '--config', f, 'ingress', 'rule', 'https://play.example.com/gw'], { encoding: 'utf8' }), /127\.0\.0\.1:8490/);
  assert.match(execFileSync(cf, ['tunnel', '--config', f, 'ingress', 'rule', 'https://evil.example.com/'], { encoding: 'utf8' }), /http_status:404/);
});

test('egress drop-ins: deny by default; public mode adds only Cloudflare ranges', () => {
  const lan = read('ops/thousandvale-lan-only.conf'), pub = read('ops/tunnel/named/public-egress.conf');
  for (const c of [lan, pub]) assert.match(c, /^IPAddressDeny=any$/m);
  const cidrs = pub.split('\n').filter(l => l.startsWith('IPAddressAllow=')).flatMap(l => l.slice(15).split(/\s+/)).filter(Boolean);
  const named = new Set(['localhost', 'link-local']);
  for (const c of cidrs) assert.ok(named.has(c) || /^[0-9a-f:.]+\/\d+$/i.test(c), 'bad entry ' + c);
  assert.ok(!cidrs.includes('0.0.0.0/0') && !cidrs.includes('::/0'));
  assert.ok(cidrs.includes('104.16.0.0/13') && cidrs.includes('2606:4700::/32'), 'challenges.cloudflare.com lives in these');
});

test('privacy note: says what is kept, for how long, how to delete — and loads nothing from anyone else', () => {
  const h = read('public/privacy.html');
  for (const must of [/30 days/, /14 days/, /Deleting your account/i, /scrypt/, /Cloudflare/, /<title>[^<]{3,40}<\/title>/, /name="viewport"/]) assert.match(h, must);
  assert.doesNotMatch(h, /<(script|img|iframe)\b/i);
  assert.doesNotMatch(h, /<link[^>]+href="https?:/i, 'no external stylesheet');
  assert.match(h, /href="privacy\.css"/);
});

test('every ops shell script parses', () => {
  const sh = ['ops/tunnel/quick.sh', 'ops/tunnel/rollback.sh', 'ops/tunnel/named/setup-named.sh', 'ops/tunnel/named/go-named.sh',
    'ops/lib/check-public.sh', 'ops/lib/delete-account.sh', 'ops/load/load-server.sh', 'ops/load/pack-bots.sh', 'ops/setup-stable.sh', 'ops/lib/check-stable.sh'];
  for (const f of sh) execFileSync('bash', ['-n', join(GAME, f)]);
  for (const f of ['ops/lib/offsite-upload.mjs', 'ops/lib/probe-public.mjs', 'ops/load/run-300.mjs']) execFileSync(process.execPath, ['--check', join(GAME, f)]);
});

test('setup-stable installs the offsite pieces; the offsite unit never gets the game env', () => {
  const s = read('ops/setup-stable.sh');
  assert.match(s, /offsite-upload\.mjs/);
  assert.match(s, /thousandvale-offsite\.timer/);
  const u = read('ops/thousandvale-offsite.service');
  assert.match(u, /^EnvironmentFile=\/etc\/thousandvale\/offsite\.env$/m);
  assert.doesNotMatch(u, /^EnvironmentFile=\/etc\/thousandvale\/env$/m);
  assert.match(u, /^ConditionPathExists=\/etc\/thousandvale\/offsite\.env$/m);
  assert.doesNotMatch(read('ops/thousandvale.service'), /offsite/);
});
