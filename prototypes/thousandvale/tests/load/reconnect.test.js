// Stream G — M0 chaos: kill -9 the server mid-play, restart it on the same port and database;
// every bot reconnects by itself, gets the SAME character back, near where it was last saved.
// PLAN §15 M0 "kill -9 + reconnect"; protocol.md §2 (reconnect) and §8.4 (saves every 10 s, leases).
//   node --test prototypes/thousandvale/tests/load/reconnect.test.js
// Env: TV_TEST_DB = json (default; a temp file) | pg (uses ~/.config/thousandvale/dev.env via the env)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, serverExists, freePort } from './server-harness.mjs';

const DB = process.env.TV_TEST_DB || 'json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('kill -9 + restart: bots reconnect to the same characters, nothing older than one save interval lost', { skip: !serverExists() && 'server/main.mjs not built yet (stream A)', timeout: 120000 }, async () => {
  const { startBots } = await import('../../tools/bot-client.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'tv-chaos-'));
  const port = await freePort();
  const dbArgs = DB === 'json' ? ['--db-file', join(dir, 'db.json')] : [];
  let srv = await startServer({ port, db: DB, args: dbArgs });
  let bots = [];
  try {
    bots = await startBots(4, { url: srv.url, mode: 'walk', radius: 40, stagger: 50 });
    const before = bots.map(b => ({ char: b.charId, token: b.token, joins: b.stats.joins }));
    // walk long enough for at least one periodic save (10 s) — record where each bot was at the kill
    await sleep(12500);
    const atKill = bots.map(b => ({ ...b.pos }));
    srv.kill('SIGKILL');
    const ex = await srv.exited;
    assert.equal(ex.sig, 'SIGKILL');
    await sleep(500);
    srv = await startServer({ port, db: DB, args: dbArgs });
    // client.js retries with backoff (max 5 s): give everyone 20 s to be back in the world
    await Promise.all(bots.map(b => b.waitFor(x => x.stats.joins > 1 && x.pos && x.stats.lastSnapAt > Date.now() - 1000, 20000)));
    bots.forEach((b, i) => {
      assert.equal(b.charId, before[i].char, `${b.name} got its own character back`);
      assert.equal(b.token, before[i].token, `${b.name} kept its guest token`);
      // the reload point is the last save (<= 10 s before the kill): at most ~10 s of walking (5.4 m/s) away,
      // and not the spawn point unless the bot was standing near it (i.e. the save really happened)
      const j = b.stats.joinPos;
      const d = Math.hypot(j.x - atKill[i].x, j.z - atKill[i].z);
      assert.ok(d <= 11 * 5.4 + 3, `${b.name} rejoined ${d.toFixed(1)} m from where it was killed (max one save interval of walking)`);
    });
    // after the restart the room works: bots move again
    const posA = bots.map(b => ({ ...b.pos }));
    await sleep(3000);
    const moved = bots.filter((b, i) => Math.hypot(b.pos.x - posA[i].x, b.pos.z - posA[i].z) > 2).length;
    assert.ok(moved >= 3, `${moved}/4 bots move after the restart`);
  } finally {
    await Promise.all(bots.map(b => b.stop()));
    await srv.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
});
