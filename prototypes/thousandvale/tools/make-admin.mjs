#!/usr/bin/env node
// Make an account an ADMIN (stream A, play-test 5 T21) — or take it away again. Admins can read the feedback reports
// (suggestions and bug reports) in the game and change their state; nothing else changes for them.
//
//   node tools/make-admin.mjs <username>                 dev  (database from ~/.config/thousandvale/dev.env)
//   node tools/make-admin.mjs <username> --off           take the flag away
//   node tools/make-admin.mjs --list                     who is an admin
//   sudo "$(command -v node)" tools/make-admin.mjs <username> --env stable      the public server's database (/etc/thousandvale/env)
//   node tools/make-admin.mjs <username> --db-file .data/dev-store.json          a server started with --db json (stop it first)
//   … --account 12                                       by account id instead of username (a guest that never claimed)
//
// The account must have been CLAIMED in the game first (a username and a password) — that username is what you pass.
// It takes effect at once: the server reads the flag every time an admin call is made, and shows the Reports button
// the next time that player logs in. The flag is ONLY ever set by this tool; no client message can set it.
// The database must be at schema v5 (the server applies it at start: restart the server once after updating).
import { loadEnv, parseArgs, GAME } from './lib/tv-env.mjs';
import { resolve } from 'node:path';

const a = parseArgs(process.argv, { off: 'bool', list: 'bool', help: 'bool' });
const env = a.env || 'dev';
if (a.help || (!a.list && !a._[0] && a.account == null)) {
  console.log('usage: node tools/make-admin.mjs <username> [--off] [--env dev|stable] [--env-file <file>] [--db-file <json store>] [--account <id>] [--list]');
  process.exit(a.help ? 0 : 2);
}
if (!['dev', 'stable'].includes(env)) { console.error('--env must be dev or stable'); process.exit(2); }

let store;
if (a['db-file']) {
  const { createJsonStore } = await import('../server/db/json-store.js');
  store = createJsonStore(resolve(a['db-file']));
} else {
  const e = loadEnv(env, a['env-file'] || null);
  if (!e.hasDb) { console.error(`No database settings for ${env}: ${e.file} is ${e.why || 'empty'}. (A server run with --db memory keeps accounts only while it runs; use --db-file for a --db json server.)`); process.exit(1); }
  if (!e.dbOk) { console.error(`Refusing: env ${env} but the settings point at database "${e.db}" (expected *_${env}).`); process.exit(1); }
  const { createPgStore } = await import('../server/db/pg-store.js');
  store = createPgStore({});
}
try {
  if (a.list) {
    const list = await store.listAdmins();
    console.log(list.length ? list.map(x => `account ${x.account}  ${x.username || '(no username)'}`).join('\n') : 'No admins.');
  } else {
    const who = a.account != null ? +a.account : String(a._[0]);
    const r = await store.setAdmin(who, !a.off);
    if (r.err) { console.error(a.account != null ? `No account ${who}.` : `No claimed account with the username "${who}". Claim the account in the game first (Account -> pick a username and password).`); process.exitCode = 1; }
    else console.log(`${r.username || 'account ' + r.account} (account ${r.account}) is ${r.admin ? 'now an ADMIN' : 'no longer an admin'} on ${a['db-file'] ? a['db-file'] : env}.`);
  }
} catch (err) {
  console.error(/column .*admin.* does not exist|relation "feedback" does not exist/.test(err.message) ? 'The database is not at schema v5 yet: restart the game server once (it applies server/db/schema-v5.sql at start), then run this again.' : 'Failed: ' + err.message);
  process.exitCode = 1;
} finally { if (store.close) await store.close(); }
void GAME;
