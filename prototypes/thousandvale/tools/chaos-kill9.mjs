#!/usr/bin/env node
// Thousandvale persistence chaos — the REAL process, `kill -9`, many times (stream G, PLAN §16 "Persistence chaos").
//
//   node prototypes/thousandvale/tools/chaos-kill9.mjs --kills 500 --db pg      # against thousandvale_dev
//   node prototypes/thousandvale/tools/chaos-kill9.mjs --kills 20 --db json     # quick, temp file
//   options: --bots 8 (incl. one trading pair)  --min 2500 --max 6000 (ms between kills)  --process chaos
//            --out <file.json> (report)  --grace 2600 (ms of loss the journal allows: 2 s commit + a tick)
//
// One server process (`--process chaos`, so its leases never touch the dev unit's `p0` ones) with fighting bots
// and one trading pair. At random moments it is killed with SIGKILL and started again on the same database;
// the bots reconnect by themselves. After every restart, once every bot is back in the world:
//   1. NO LOSS beyond the journal's window: every item a bot had held since before (kill − grace) is in some
//      bot's restored bag, and the bots' total gold is at least what they all held at (kill − grace)
//      (a trade moves gold between bots, never out of the total);
//   2. NO DUPLICATES: no item uid is in two bags (bots' view), and every 25 kills (and at the end) the database
//      itself is checked with ops/lib/conservation.sql (pg) — no uid twice across all characters, no negative gold.
// Exit code 0 only if every check passed. Each kill's numbers go to the report.

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, freePort } from '../tests/load/server-harness.mjs';
import { startBot } from './bot-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const KILLS = +arg('kills', 500), BOTS = +arg('bots', 8), MIN = +arg('min', 2500), MAX = +arg('max', 6000);
const DB = arg('db', 'pg'), PROC = arg('process', 'chaos'), GRACE = +arg('grace', 2600), OUT = arg('out', null);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- database environment: the dev database only (never stable) ---
const env = {};
if (DB === 'pg') {
  const f = join(homedir(), '.config', 'thousandvale', 'dev.env');
  for (const line of readFileSync(f, 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
  if (!String(env.PGDATABASE).endsWith('_dev')) throw new Error('chaos runs against a *_dev database only');
}
const tmp = mkdtempSync(join(tmpdir(), 'tv-chaos9-'));
const dbArgs = DB === 'json' ? ['--db-file', join(tmp, 'db.json')] : [];
const port = await freePort();
const serverOpts = { port, db: DB, args: [...dbArgs, '--process', PROC], env };

/** A bot's bag (set of uids) and gold as the ledger says they were at time T. */
function stateAt(bot, T) {
  let bag = new Set(), gold = 0;
  for (const e of bot.ledger) {
    if (e.t > T) break;
    if (e.type === 'reset') { bag = new Set(e.bag); gold = e.gold; }
    else if (e.type === 'add') bag.add(e.uid);
    else if (e.type === 'remove') bag.delete(e.uid);
    else if (e.type === 'gold') gold = e.gold;
  }
  return { bag, gold };
}
/** Items held continuously from (T - span) to T by this bot. */
function heldSince(bot, from, to) {
  const a = stateAt(bot, from).bag, b = stateAt(bot, to).bag;
  return [...a].filter(u => b.has(u));
}

function dbCheck() {
  if (DB !== 'pg') return Promise.resolve({ ok: true, skipped: true });
  return new Promise(res => {
    const p = spawn('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', join(HERE, '..', 'ops', 'lib', 'conservation.sql')], { env: { ...process.env, ...env } });
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('exit', code => res({ ok: code === 0, out: out.trim().split('\n').slice(-6).join(' | ') }));
  });
}

const report = { started: new Date().toISOString(), db: DB, process: PROC, kills: [], failures: [], dbChecks: [] };
const fail = (k, msg) => { report.failures.push({ kill: k, msg }); console.log(`!! kill ${k}: ${msg}`); };

let srv = await startServer(serverOpts);
console.log(`chaos: server on ${port} (${DB}, --process ${PROC}); ${BOTS} bots; ${KILLS} kills every ${MIN}-${MAX} ms`);
const tag = Math.random().toString(36).slice(2, 6);
const L = 'abcdefghijklmnopqrstuvwxyz';
const nm = i => `Chaos ${L[(i * 7 + tag.charCodeAt(0)) % 26]}${L[(i * 11 + tag.charCodeAt(1)) % 26]}${L[(i * 13 + tag.charCodeAt(2)) % 26]}${L[i % 26]}`;
const bots = [];
const names = Array.from({ length: BOTS }, (_, i) => nm(i));
for (let i = 0; i < BOTS; i++) {
  const pair = i >= BOTS - 2;   // the last two trade with each other, the second follows the first
  const o = { url: srv.url, name: names[i], mode: 'fight', radius: 40, seed: 9000 + i, joinTimeout: 30000 };
  if (pair) o.trade = { partner: names[i === BOTS - 2 ? BOTS - 1 : BOTS - 2], lead: i === BOTS - 2 };
  if (pair && i === BOTS - 1) o.follow = names[BOTS - 2];
  bots.push(await startBot(o));
  await sleep(100);
}
await sleep(8000);   // let them get out of town and pick something up

let maxRejoin = 0;
for (let k = 1; k <= KILLS; k++) {
  await sleep(MIN + Math.random() * (MAX - MIN));
  const K = Date.now();
  srv.kill('SIGKILL'); await srv.exited;
  const before = bots.map(b => ({ held: heldSince(b, K - GRACE - 15000, K - GRACE), gold: stateAt(b, K - GRACE).gold, joins: b.stats.joins }));
  srv = await startServer(serverOpts);
  const t0 = Date.now();
  try {
    await Promise.all(bots.map((b, i) => b.waitFor(x => x.stats.joins > before[i].joins && x.net.joined, 30000)));
  } catch (e) { fail(k, 'bots did not all come back: ' + e.message); break; }
  const rejoin = Date.now() - t0; maxRejoin = Math.max(maxRejoin, rejoin);
  // the restored truth = each bot's newest reset entry
  const restored = bots.map(b => { const r = [...b.ledger].reverse().find(e => e.type === 'reset'); return { bag: new Set(r.bag), gold: r.gold }; });
  const all = new Map(); let dup = 0;
  restored.forEach((r, i) => r.bag.forEach(u => { if (all.has(u)) dup++; all.set(u, i); }));
  const settled = new Set(before.flatMap(b => b.held));
  const lost = [...settled].filter(u => !all.has(u));
  const goldBefore = before.reduce((n, b) => n + b.gold, 0), goldAfter = restored.reduce((n, r) => n + r.gold, 0);
  const row = { k, rejoinMs: rejoin, items: all.size, settled: settled.size, lost: lost.length, dup, goldBefore, goldAfter };
  report.kills.push(row);
  if (lost.length) fail(k, `${lost.length} item(s) held since before the journal window are gone: ${lost.slice(0, 3).join(', ')}`);
  if (dup) fail(k, `${dup} item uid(s) restored into two bags`);
  if (goldAfter < goldBefore) fail(k, `gold fell from ${goldBefore} to ${goldAfter}`);
  if (k % 25 === 0 || k === KILLS) {
    const c = await dbCheck(); report.dbChecks.push({ k, ...c });
    if (!c.ok) fail(k, 'database conservation check: ' + c.out);
  }
  if (k % 10 === 0 || k === 1) {
    const tr = bots.reduce((n, b) => n + (b.stats.trades || 0), 0);
    console.log(`kill ${k}/${KILLS}: rejoin ${rejoin} ms (max ${maxRejoin}), items ${all.size} (settled ${settled.size}, lost ${lost.length}, dup ${dup}), gold ${goldBefore}->${goldAfter}, trades ${tr}, failures ${report.failures.length}`);
  }
}
await Promise.all(bots.map(b => b.stop()));
await srv.kill('SIGTERM');
report.finished = new Date().toISOString();
report.summary = {
  kills: report.kills.length, failures: report.failures.length, maxRejoinMs: maxRejoin,
  itemsAtEnd: report.kills.at(-1)?.items ?? 0, settledChecked: report.kills.reduce((n, r) => n + r.settled, 0),
  trades: bots.reduce((n, b) => n + (b.stats.trades || 0), 0), tradeFails: bots.reduce((n, b) => n + (b.stats.tradeFails || 0), 0),
  kills_bots: bots.reduce((n, b) => n + b.stats.kills, 0), dbChecks: report.dbChecks.length, dbChecksFailed: report.dbChecks.filter(c => !c.ok).length,
};
console.log(JSON.stringify(report.summary));
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
rmSync(tmp, { recursive: true, force: true });
process.exit(report.failures.length ? 1 : 0);
