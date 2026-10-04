// JSON-file store (stream A): the memory store written to one file after every change (temp file +
// rename, so a kill -9 never leaves half a file). For dev without Postgres and for crash tests; not for load.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createMemoryStore } from '../../js/sim/store-memory.js';

export function createJsonStore(file) {
  let data = null;
  if (existsSync(file)) data = JSON.parse(readFileSync(file, 'utf8'));
  mkdirSync(dirname(file), { recursive: true });
  const write = d => {
    const tmp = file + '.tmp';
    writeFileSync(tmp, JSON.stringify(d));
    renameSync(tmp, file);
  };
  const st = createMemoryStore({ data, onChange: write });
  st.kind = 'json';
  return st;
}
