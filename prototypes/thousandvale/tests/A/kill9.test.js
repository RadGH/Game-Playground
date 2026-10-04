// kill -9 the real server process mid-session, start it again, and the client (real WebSocket) comes
// back by itself at the last saved position (PLAN §15 M0 gate). Uses the json store (or pg with
// TV_TEST_DB=pg and the PG* environment from ~/.config/thousandvale/dev.env).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, memoryTokenStore } from '../../js/net/client.js';

const MAIN = fileURLToPath(new URL('../../server/main.mjs', import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 8496;

function startServer(args) {
  const p = spawn(process.execPath, [MAIN, '--port', String(PORT), '--host', '127.0.0.1', '--save-every', '500', '--terrain', 'standin', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = '';
  p.stdout.on('data', d => { p.out += d; });
  p.stderr.on('data', d => { p.out += d; });
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start: ' + p.out)), 10000);
    const iv = setInterval(() => { if (p.out.includes('server up')) { clearInterval(iv); clearTimeout(t); res(p); } }, 50);
    p.on('exit', code => { clearInterval(iv); clearTimeout(t); rej(new Error('server exited ' + code + ': ' + p.out)); });
  });
}
async function waitFor(fn, ms = 10000) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(25); } return !!fn(); }

test('kill -9 + restart: the client reconnects and resumes at the last save', { timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tv-kill9-'));
  const dbArgs = process.env.TV_TEST_DB === 'pg' ? ['--db', 'pg', '--process', 'k9test'] : ['--db', 'json', '--db-file', join(dir, 'store.json')];
  let srv = await startServer(dbArgs);
  const net = connect({ mode: 'ws', url: 'ws://127.0.0.1:' + PORT, tokenStore: memoryTokenStore(), build: 'dev' });
  let joins = 0, self = null;
  net.on('joined', j => { joins++; self = { x: j.you.x, z: j.you.z }; });
  net.on('snap', s => { if (s.self) self = { x: s.self.x, z: s.self.z }; });
  try {
    await net.ready;
    const ch = await net.createChar({ name: 'Lazarus ' + Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join(''), cls: 'warrior' });
    await net.play(ch.id);
    const start = { ...self };
    let s = 0;
    for (let i = 0; i < 30; i++) { net.input({ s: ++s, dt: 50, mx: 1, mz: 0, yaw: 0, b: 0 }); await sleep(50); }
    await sleep(1500);                        // stood still long enough for a save
    const before = { ...self };
    assert.ok(before.x > start.x + 4, 'walked');
    srv.kill('SIGKILL');
    await waitFor(() => net.status === 'reconnecting', 5000);
    assert.equal(net.status, 'reconnecting');
    srv = await startServer(dbArgs);
    const ok = await waitFor(() => joins === 2 && net.status === 'online', 15000);
    assert.ok(ok, 'reconnected (status ' + net.status + ')');
    assert.ok(Math.abs(self.x - before.x) < 0.01 && Math.abs(self.z - before.z) < 0.01, `resumed at ${self.x},${self.z}; saved ${before.x},${before.z}`);
  } finally {
    net.close();
    srv.kill('SIGTERM');
    await sleep(300);
    rmSync(dir, { recursive: true, force: true });
  }
});
