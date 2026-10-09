// STAGE 2 for real (PLAN §8.1, §15 M2): `server/main.mjs --procs 2` = a gateway process + two province
// processes that OWN their game sockets (the gateway hands each /p/<n> socket over by fd passing). A player
// enters through process 0, takes free travel to the realm event in the province process 1 holds (a
// `relocate`: save, release, new ticket, new socket), and when process 1 is killed with SIGKILL the gateway
// restarts it and the player comes back by themselves. Needs Postgres (every process shares the database):
// skipped unless the PG* environment is set (source ~/.config/thousandvale/dev.env).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connect, memoryTokenStore } from '../../js/net/client.js';
import { freePort } from '../load/server-harness.mjs';

const HAVE_PG = !!(process.env.PGDATABASE || process.env.DATABASE_URL);
const MAIN = fileURLToPath(new URL('../../server/main.mjs', import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 10000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(50); } return !!(await fn()); }
const status = async port => (await fetch(`http://127.0.0.1:${port}/status`)).json();

test('stage 2: gateway + 2 province processes; relocate across processes; a killed province process comes back', { skip: !HAVE_PG && 'no PG* environment', timeout: 180000 }, async () => {
  const port = await freePort();
  const srv = spawn(process.execPath, [MAIN, '--port', String(port), '--host', '127.0.0.1', '--db', 'pg', '--procs', '2', '--province', 'test,torbor_downs',
    '--process', 's2test', '--event-first', '4000', '--event-announce', '0', '--event-every', '6000', '--save-every', '1000'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  const net = connect({ mode: 'ws', url: 'ws://127.0.0.1:' + port, tokenStore: memoryTokenStore(), build: 'dev' });
  try {
    assert.ok(await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${port}/healthz`)).ok; } catch { return false; } }, 60000), 'children ready:\n' + out.slice(-2000));
    const st0 = await status(port);
    assert.equal(st0.procs.length, 2);
    // the children are separate OS processes
    const kids = execFileSync('pgrep', ['-P', String(srv.pid)]).toString().trim().split('\n').map(Number);
    assert.equal(kids.length, 2, 'two forked province processes');

    let joins = 0, last = null;
    net.on('joined', j => { joins++; last = j; });
    await net.ready;
    const ch = await net.createChar({ name: 'Ferry ' + Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join(''), cls: 'warrior' });
    await net.play(ch.id);
    assert.ok(await waitFor(() => joins >= 1, 10000));
    assert.equal(net.gamePath, '/p/0', 'starts in the starter province (process 0)');
    assert.ok(last.room.id.startsWith('test/'));
    assert.ok(await waitFor(async () => { const s = await status(port); return s.procs[0].ccu === 1 && s.procs[1].ccu === 0; }, 8000), 'process 0 holds the player');

    // the realm event (Torbor Downs' world boss, in process 1) starts; travel there is free
    // (it may have started before we logged in: then `joined.event` carries it)
    let realm = last.event ? { ev: last.event } : null; net.on('realm', m => { if (m.kind === 'eventStart') realm = m; });
    // (on a loaded machine the first one can start and be abandoned before the children are even up: another follows every 6 s)
    assert.ok(await waitFor(() => realm || (last.event && (realm = { ev: last.event })), 45000), 'the realm event is live; server said:\n' + out.split('\n').filter(l => /event|error|Error|director/i.test(l)).slice(-12).join('\n') + '\nSTATUS ' + JSON.stringify((await status(port)).gateway || {}).slice(0, 600));
    let tr = null; net.on('travelR', m => { tr = m; });
    net.travel('event');
    assert.ok(await waitFor(() => tr, 5000)); assert.equal(tr.ok, true); assert.equal(tr.cost, 0);
    assert.ok(await waitFor(() => joins >= 2 && net.gamePath === '/p/1' && net.status === 'online', 15000), 'relocated to process 1: ' + net.gamePath + ' ' + net.status);
    assert.equal(last.handoff && last.handoff.via, 'relocate');
    assert.ok(last.room.id.startsWith('torbor_downs/'));
    assert.ok(Math.hypot(last.you.x - realm.ev.x, last.you.z - realm.ev.z) < realm.ev.r * 1.5, 'at the event');
    assert.ok(await waitFor(async () => { const s = await status(port); return s.procs[0].ccu === 0 && s.procs[1].ccu === 1; }, 8000), 'process 1 holds the player now');
    await sleep(1500);                                    // a blob/journal save happens

    // kill -9 province process 1: the gateway restarts it, the client reconnects into it
    const s1 = await status(port);
    const victim = kids.find(pid => { try { return execFileSync('ps', ['-o', 'args=', '-p', String(pid)]).toString().includes('"n":1'); } catch { return false; } });
    assert.ok(victim, 'found process 1');
    process.kill(victim, 'SIGKILL');
    assert.ok(await waitFor(() => net.status !== 'online', 5000), 'client noticed');
    assert.ok(await waitFor(() => net.status === 'online' && joins >= 3, 45000), 'back online after the restart: ' + net.status + '\n' + out.slice(-1500));
    assert.equal(net.gamePath, '/p/1');
    assert.ok(last.room.id.startsWith('torbor_downs/'), 'still in Torbor Downs: ' + last.room.id);
    void s1;
  } finally {
    try { net.close(); } catch { /* closed */ }
    srv.kill('SIGTERM');
    await new Promise(r => { srv.once('exit', r); setTimeout(() => { try { srv.kill('SIGKILL'); } catch { /* gone */ } r(); }, 20000); });
  }
});
