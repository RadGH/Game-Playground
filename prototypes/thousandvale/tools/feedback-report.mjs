#!/usr/bin/env node
// Print every feedback report (suggestions and bug reports, stream A play-test 5 T19/T21) as MARKDOWN — for Claude, or a
// person, to read later.
//
//   node tools/feedback-report.mjs                                  dev: the dev database (~/.config/thousandvale/dev.env),
//                                                                   or .data/feedback-dev.jsonl when there is no database
//   sudo "$(command -v node)" tools/feedback-report.mjs --env stable     the PUBLIC server: /etc/thousandvale/env is readable by
//                                                                   root only, hence sudo; "$(command -v node)" because sudo's
//                                                                   PATH has no nvm node. Read-only: it runs SELECTs.
//   node tools/feedback-report.mjs --file <path>.jsonl              a feedback file straight (the stable server writes
//                                                                   /var/lib/thousandvale/feedback-stable.jsonl as well)
//   --state new|approved|declined|completed|trashed|all   (default: everything but trashed)      --kind bug|suggestion
//   --since 2026-10-01     --limit 200     --no-logs (leave the client log lines out)     --json (raw rows instead of Markdown)
//   > docs/feedback-2026-10-06.md            it only prints; redirect it where you want it
//
// Where the data lives: Postgres table `feedback` (schema v5) is the source of truth on dev and stable; every server ALSO
// appends each report and each state change to <state>/feedback-<env>.jsonl (.data/ in the working tree for dev,
// /var/lib/thousandvale/ for stable), which is what a server without a database (--db memory) leaves behind.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnv, parseArgs, GAME, rowsFromJsonl } from './lib/tv-env.mjs';

const a = parseArgs(process.argv, { 'no-logs': 'bool', json: 'bool', help: 'bool' });
if (a.help) { console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 19).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
const env = a.env || 'dev';
const want = a.state || null, kind = a.kind || null, limit = Math.max(1, +a.limit || 500);
const since = a.since ? Date.parse(a.since) : 0;

let rows = [], source = '';
const file = a.file ? resolve(a.file) : null;
if (file) { rows = rowsFromJsonl(readFileSync(file, 'utf8')); source = file; }
else {
  const e = loadEnv(env, a['env-file'] || null);
  if (e.hasDb && e.dbOk) {
    const { createPgStore } = await import('../server/db/pg-store.js');
    const store = createPgStore({});
    try { rows = await store.listFeedback({ limit: 5000 }); source = `Postgres ${e.db}`; }
    catch (err) { console.error(/relation "feedback" does not exist/.test(err.message) ? 'The database has no feedback table yet (schema v5): restart the game server once.' : 'Database read failed: ' + err.message); process.exitCode = 1; }
    finally { await store.close(); }
  } else {
    const f = join(process.env.TV_FEEDBACK_DIR || (env === 'stable' ? '/var/lib/thousandvale' : join(GAME, '.data')), `feedback-${env}.jsonl`);
    if (e.hasDb && !e.dbOk) console.error(`(the settings in ${e.file} point at "${e.db}", not a *_${env} database — reading the file instead)`);
    if (!existsSync(f)) { console.error(`No database settings (${e.file}: ${e.why || 'no PG* variables'}) and no file ${f}. Nothing to report.`); process.exit(1); }
    rows = rowsFromJsonl(readFileSync(f, 'utf8')); source = f;
  }
}
const all = rows;
rows = rows.filter(r => (want === 'all' ? true : want ? r.state === (want === 'trash' ? 'trashed' : want) : r.state !== 'trashed') && (!kind || r.kind === kind) && (!since || (r.at || 0) >= since)).slice(0, limit);

if (a.json) { console.log(JSON.stringify(rows, null, 2)); process.exit(process.exitCode || 0); }

const when = t => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '?');
const esc = s => String(s ?? '').replace(/\r/g, '');
const quote = s => esc(s).split('\n').map(l => '> ' + l).join('\n');
const flat = (o, skip = []) => Object.entries(o || {}).filter(([k, v]) => !skip.includes(k) && v !== null && v !== '' && typeof v !== 'object').map(([k, v]) => `${k} ${v}`).join(' · ');
const counts = {}; for (const r of all) counts[r.state] = (counts[r.state] || 0) + 1;

const out = [];
out.push(`# Thousandvale feedback — ${env}`);
out.push('');
out.push(`Source: ${source}. Printed ${when(Date.now())}. ${all.length} report(s) in all: ${['new', 'approved', 'declined', 'completed', 'trashed'].map(s => `${counts[s] || 0} ${s}`).join(', ')}.`);
out.push(`Showing ${rows.length}${want ? ` (state: ${want})` : ' (everything but trashed)'}${kind ? `, kind: ${kind}` : ''}${since ? `, since ${a.since}` : ''}, newest first.`);
out.push('');
for (const k of ['bug', 'suggestion']) {
  const list = rows.filter(r => r.kind === k);
  if (!list.length) continue;
  out.push(`## ${k === 'bug' ? 'Bug reports' : 'Suggestions'} (${list.length})`);
  out.push('');
  for (const r of list) {
    const who = r.name ? `${r.name}${r.level ? ` (level ${r.level}${r.cls ? ' ' + r.cls : ''})` : ''}` : (r.account != null ? `account ${r.account}` : 'someone');
    out.push(`### #${r.id} · ${r.state}${r.stateBy ? ` by ${r.stateBy}` : ''} · ${when(r.at)} · ${who}`);
    out.push('');
    out.push(quote(r.text));
    out.push('');
    const s = r.server || {}, c = r.client || {};
    const where = [s.roomName || s.room, s.zone && `zone ${s.zone}`, Number.isFinite(s.x) && `x ${s.x}, z ${s.z}`, s.roomKind].filter(Boolean).join(' · ');
    if (where) out.push(`- **Where (server):** ${where}`);
    const sv = flat(s, ['room', 'roomName', 'zone', 'x', 'y', 'z', 'roomKind', 'at', 'via', 'account', 'username']);
    if (sv) out.push(`- **Server saw:** ${sv}`);
    if (s.target) out.push(`- **Target:** ${flat(s.target)}`);
    if (Array.isArray(s.events) && s.events.length) out.push(`- **Events running there:** ${s.events.map(e => flat(e)).join(' | ')}`);
    if (Array.isArray(s.quests) && s.quests.length) out.push(`- **Quests in the log:** ${s.quests.join(', ')}`);
    if (s.lastRulesError) out.push(`- **Last rules error in that room:** ${s.lastRulesError}`);
    const cl = flat(c, ['logs']);
    if (cl) out.push(`- **Client said:** ${cl}`);
    for (const [k2, v] of Object.entries(c)) if (v && typeof v === 'object' && !Array.isArray(v)) out.push(`- **Client ${k2}:** ${flat(v) || JSON.stringify(v)}`);
    if (r.account != null || s.username) out.push(`- **Account:** ${r.account ?? '?'}${s.username ? ` (${s.username})` : ''}${r.char != null ? `, character ${r.char}` : ''}`);
    if (r.ref != null) out.push(`- **Reply to:** #${r.ref}`);
    if (r.note) out.push(`- **Admin note:** ${esc(r.note)}`);
    if (r.state === 'completed' || r.done) out.push(`- **Completed${r.doneAt ? ' ' + when(r.doneAt) : ''}:** ${esc(r.done || '(no note)')}`);
    const logs = Array.isArray(c.logs) ? c.logs : [];
    if (logs.length && !a['no-logs']) { out.push(''); out.push('Client log (oldest first):'); out.push(''); out.push('```'); for (const l of logs) out.push(esc(typeof l === 'string' ? l : JSON.stringify(l)).replace(/```/g, "'''")); out.push('```'); }
    out.push('');
  }
}
if (!rows.length) out.push('_No reports match._');
console.log(out.join('\n'));
