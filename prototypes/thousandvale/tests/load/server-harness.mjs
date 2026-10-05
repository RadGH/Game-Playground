// Stream G — start/stop a real Thousandvale server process for load + chaos tests.
//   const srv = await startServer({ db: 'memory' });   // free port, waits for /status
//   srv.url (ws://127.0.0.1:<port>), srv.port, srv.kill('SIGKILL'), await srv.exited, srv.log()
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// TV_GAME_DIR runs a FROZEN copy instead of the working tree (e.g. a release built by tools/publish-thousandvale.sh
// --build-only): an hour-long chaos run must not die because someone saved a half-written file in the live tree
export const SERVER_GAME = process.env.TV_GAME_DIR || GAME;
export const MAIN = join(SERVER_GAME, 'server', 'main.mjs');
export const serverExists = () => existsSync(MAIN);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function freePort() {
  return new Promise((res, rej) => {
    const s = createServer(); s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

/** opts: { port, db: 'memory'|'json'|'pg', args: [], env: {}, timeout } */
export async function startServer(opts = {}) {
  const port = opts.port || await freePort();
  const args = [MAIN, '--port', String(port), '--host', '127.0.0.1', '--db', opts.db || 'memory', ...(opts.args || [])];
  const child = spawn(process.execPath, args, { cwd: SERVER_GAME, env: { ...process.env, ...(opts.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = [];
  const keep = d => { for (const l of String(d).split('\n')) if (l) { lines.push(l); if (lines.length > 400) lines.shift(); } };
  child.stdout.on('data', keep); child.stderr.on('data', keep);
  const exited = new Promise(r => child.on('exit', (code, sig) => r({ code, sig })));
  const srv = {
    port, url: `ws://127.0.0.1:${port}`, http: `http://127.0.0.1:${port}`, child, exited,
    log: () => lines.join('\n'),
    kill: (sig = 'SIGTERM') => { try { child.kill(sig); } catch { /* gone */ } return exited; },
  };
  const end = Date.now() + (opts.timeout ?? 15000);
  let dead = false; exited.then(() => { dead = true; });
  while (Date.now() < end && !dead) {
    try { const r = await fetch(srv.http + '/status'); if (r.ok) return srv; } catch { /* not up yet */ }
    await sleep(100);
  }
  srv.kill('SIGKILL');
  throw new Error(`server did not come up on ${port}:\n${srv.log()}`);
}
