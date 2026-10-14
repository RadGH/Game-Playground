#!/usr/bin/env node
// Move a character to another account (the keeper's tool; wrap-up, report S#66: "Attach the character mcgee to my
// account"). The character must be OUT of the world (nobody playing it), and the target account must have room.
//
//   node tools/move-char.mjs <character name> --to <username>                     dev
//   sudo "$(command -v node)" tools/move-char.mjs <character name> --to <username> --env stable     the public server
//   … --to-account 12        the target by account id instead of username
//   … --dry                  say what would move, change nothing
//
// Players do this themselves for a browser's guest characters: sign in on that browser and the title screen offers it.
import { loadEnv, parseArgs } from './lib/tv-env.mjs';
import { MAX_CHARS_PER_ACCOUNT } from '../js/sim/store-memory.js';

const a = parseArgs(process.argv, { dry: 'bool', help: 'bool' });
const env = a.env || 'dev', name = a._[0];
if (a.help || !name || (!a.to && a['to-account'] == null)) { console.log('usage: node tools/move-char.mjs <character name> --to <username> | --to-account <id> [--env dev|stable] [--dry]'); process.exit(a.help ? 0 : 2); }
if (!['dev', 'stable'].includes(env)) { console.error('--env must be dev or stable'); process.exit(2); }
const e = loadEnv(env, a['env-file'] || null);
if (!e.hasDb) { console.error(`No database settings for ${env}: ${e.file} is ${e.why || 'empty'}.`); process.exit(1); }
if (!e.dbOk) { console.error(`Refusing: env ${env} but the settings point at database "${e.db}" (expected *_${env}).`); process.exit(1); }
const { createPgStore } = await import('../server/db/pg-store.js');
const store = createPgStore({});
try {
  const ch = await store.charByName(String(name));
  if (!ch) { console.error(`No character called "${name}".`); process.exitCode = 1; }
  else {
    const target = a['to-account'] != null ? await store.accountInfo(+a['to-account']) : await store.loginInfo(String(a.to)).then(i => (i ? store.accountInfo(i.account) : null));
    if (!target) { console.error(a.to ? `No claimed account with the username "${a.to}".` : `No account ${a['to-account']}.`); process.exitCode = 1; }
    else if (target.id === ch.account) console.log(`${ch.name} is already on ${target.username || 'account ' + target.id}.`);
    else if (a.dry) console.log(`Would move ${ch.name} (level ${ch.level} ${ch.cls}, character ${ch.id}) from account ${ch.account} to ${target.username || '(guest)'} (account ${target.id}).`);
    else {
      const r = await store.moveChars(ch.account, target.id, { ids: [ch.id], limit: MAX_CHARS_PER_ACCOUNT });
      if (r.err) { console.error('Failed: ' + r.err); process.exitCode = 1; }
      else if (r.moved.length) console.log(`${ch.name} (level ${ch.level} ${ch.cls}) moved from account ${ch.account} to ${target.username || 'account ' + target.id} (account ${target.id}) on ${env}.`);
      else { console.error(`${ch.name} did not move: ${r.left[0]?.why === 'online' ? 'somebody is playing it right now — log it out and try again in a minute' : 'the target account is at its character limit'}.`); process.exitCode = 1; }
    }
  }
} catch (err) { console.error('Failed: ' + err.message); process.exitCode = 1; }
finally { if (store.close) await store.close(); }
