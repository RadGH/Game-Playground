// Shared by tools/make-admin.mjs and tools/feedback-report.mjs (stream A, play-test 5): find the environment's database
// settings the same way the servers do, without ever printing them.
//   dev    -> ~/.config/thousandvale/dev.env      (written by ops/postgres-setup.sh; what ops/start-dev.sh loads)
//   stable -> /etc/thousandvale/env               (written by ops/setup-stable.sh; root / the thousandvale user only)
// loadEnv(env, file?) reads KEY=VALUE lines into process.env (existing variables win) and says whether a database is set.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GAME = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const defaultEnvFile = env => (env === 'stable' ? '/etc/thousandvale/env' : join(homedir(), '.config/thousandvale/dev.env'));

export function loadEnv(env = 'dev', file = null) {
  const f = file || defaultEnvFile(env);
  let read = false, why = null;
  if (existsSync(f)) {
    try {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        const m = /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
      }
      read = true;
    } catch (err) { why = err.code === 'EACCES' ? 'not readable by this user (run with sudo)' : err.message; }
  } else why = 'missing';
  const db = process.env.PGDATABASE || (process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1) : '');
  return { file: f, read, why, db, hasDb: !!db, dbOk: !db || db.endsWith('_' + env) };
}

/** Parse `--flag value` / `--flag` arguments. */
export function parseArgs(argv, flags = {}) {
  const o = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) { o._.push(k); continue; }
    const name = k.slice(2);
    if (flags[name] === 'bool') o[name] = true; else o[name] = argv[++i];
  }
  return o;
}

/** Rows out of a JSONL file: `ev:'new'` rows, with later `ev:'state'` lines applied. */
export function rowsFromJsonl(text) {
  const by = new Map();
  let n = 0;
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.ev === 'shot') { const x = by.get(r.id); if (x) x.shotFile = r.file; continue; }      // play-test 12 (#71): its screenshot's file name
    if (r.ev === 'state') { const x = by.get(r.id); if (x) { x.state = r.state; x.stateAt = r.at; x.stateBy = r.by; if (r.note != null) x.note = r.note; if (r.done != null) { x.done = r.done; x.doneAt = r.at; } } continue; }
    const { ev, ...row } = r; void ev;
    by.set(row.id ?? 'x' + (n++), { state: 'new', note: '', ...row });
  }
  return [...by.values()].sort((x, y) => (y.at || 0) - (x.at || 0));
}

