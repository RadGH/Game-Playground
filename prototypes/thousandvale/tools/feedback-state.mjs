#!/usr/bin/env node
// Set the state of feedback reports from the command line (stream A, play-test 6) — what an admin does in the Reports window.
//
//   node tools/feedback-state.mjs 1 9 19 --state declined [--note "jokes"]                dev database
//   sudo "$(command -v node)" tools/feedback-state.mjs 1 9 19 --state declined --env stable     the public server's database
//   node tools/feedback-state.mjs 2-8 10-18 20 21 --state approved --env stable            ranges work
//   node tools/feedback-state.mjs 45 --state completed --note "Event chests now stay until everyone has looted."     W28: the fix is live;
//                                                                   the note is the changelog line the SENDER reads in "My reports"
//   states: new | approved | declined | completed | trashed.   --by <name> (default "lead")
//   --note with any other state is the admin's own note (kept when the report is later completed).
// It writes the database (the source of truth) and appends the same change to <state>/feedback-<env>.jsonl when it can.
import { loadEnv, parseArgs } from './lib/tv-env.mjs';
import { feedbackSink } from '../server/load.mjs';

const a = parseArgs(process.argv, { help: 'bool' });
const env = a.env || 'dev', state = a.state === 'trash' ? 'trashed' : a.state;
const ids = [];
for (const x of a._) { const m = /^(\d+)(?:-(\d+))?$/.exec(x); if (!m) { console.error('not an id or a range: ' + x); process.exit(2); } for (let i = +m[1]; i <= +(m[2] || m[1]); i++) ids.push(i); }
if (a.help || !ids.length || !['new', 'approved', 'declined', 'completed', 'trashed'].includes(state)) { console.log('usage: node tools/feedback-state.mjs <id|from-to>… --state new|approved|declined|completed|trashed [--env dev|stable] [--note "…"] [--by name]'); process.exit(a.help ? 0 : 2); }
const e = loadEnv(env, a['env-file'] || null);
if (!e.hasDb) { console.error(`No database settings for ${env}: ${e.file} is ${e.why || 'empty'}.${env === 'stable' ? ' Run it with sudo.' : ''}`); process.exit(1); }
if (!e.dbOk) { console.error(`Refusing: env ${env} but the settings point at database "${e.db}".`); process.exit(1); }
const { createPgStore } = await import('../server/db/pg-store.js');
const store = createPgStore({});
const sink = feedbackSink(env, a['jsonl'] || (env === 'stable' ? '/var/lib/thousandvale/feedback-stable.jsonl' : undefined));
try {
  const at = Date.now(), by = a.by || 'lead', text = a.note != null && a.note !== true ? String(a.note).slice(0, 500) : null;
  const done = state === 'completed' ? (text ?? '') : null, note = state === 'completed' ? null : text;
  if (state === 'completed' && !done) console.error('(no --note: the sender will see "Completed" with no text)');
  // W28: a server that has not restarted on schema v6 yet has no done_note column. The same three additive statements as
  // server/db/schema-v6.sql, safe to run twice — so "completed" can be set the moment the fix is live, before or after the restart.
  if (state === 'completed') {
    await store.pool.query("ALTER TABLE feedback ADD COLUMN IF NOT EXISTS done_note text NOT NULL DEFAULT ''");
    await store.pool.query('ALTER TABLE feedback ADD COLUMN IF NOT EXISTS done_at timestamptz');
    await store.pool.query('ALTER TABLE feedback ADD COLUMN IF NOT EXISTS ref bigint');
  }
  for (const id of ids) {
    const ok = await store.setFeedbackState(id, state, { by, at, note, done });
    console.log(`#${id}: ${ok ? state : 'no such report'}`);
    if (ok) { try { sink({ ev: 'state', id, state, by, at, ...(note != null ? { note } : {}), ...(done != null ? { done } : {}) }); } catch { /* the database has it */ } }
  }
  console.log(JSON.stringify(await store.feedbackCounts()));
} catch (err) { console.error('Failed: ' + err.message); process.exitCode = 1; } finally { await store.close(); }
