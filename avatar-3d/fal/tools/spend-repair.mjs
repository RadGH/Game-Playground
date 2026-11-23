#!/usr/bin/env node
// Put back any paid job that data/spend.json is missing (several jobs finishing at once can overwrite each other's row).
// Source of truth: data/jobs/<name>.json (written right after each submit) + the files in models/<name>/.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sf = join(ROOT, 'data', 'spend.json');
const spend = JSON.parse(readFileSync(sf, 'utf8'));
let added = 0;
for (const f of readdirSync(join(ROOT, 'data', 'jobs'))) {
  const j = JSON.parse(readFileSync(join(ROOT, 'data', 'jobs', f), 'utf8'));
  if (spend.jobs.some(x => x.request_id === j.request_id)) continue;
  const dir = join(ROOT, 'models', j.name);
  const files = existsSync(dir) ? readdirSync(dir).filter(n => n !== 'result.json').map(n => ({ file: `models/${j.name}/${n}`, bytes: statSync(join(dir, n)).size })) : [];
  spend.jobs.push({ id: j.name, endpoint: j.endpoint, request_id: j.request_id, price: j.price, input: j.input, note: j.note, files, submitted: j.submitted, done: null, seconds: null, repaired: true });
  added++;
}
spend.jobs.sort((a, b) => a.submitted.localeCompare(b.submitted));
spend.total = Math.round(spend.jobs.reduce((a, j) => a + j.price, 0) * 100) / 100;
writeFileSync(sf, JSON.stringify(spend, null, 1));
console.log(`spend: ${spend.jobs.length} jobs, $${spend.total} (${added} put back)`);
