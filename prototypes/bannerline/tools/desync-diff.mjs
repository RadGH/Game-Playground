#!/usr/bin/env node
// Find where two sim states disagree (PLAN §11.5). Input: a desync dump saved from the lockstep
// (`lockstep.dumps[i]` = { tick, host: snapshot, client: snapshot }) or two snapshot files.
//
//   node tools/desync-diff.mjs dump.json              a lockstep dump (host vs client)
//   node tools/desync-diff.mjs host.json client.json  two snapshots ({ v, dataHash, state } or bare state)
//   --all   list every difference (default: the first 40)
//
// Numbers are compared the way the hash compares them (to 1/1000), so float noise below a millimetre
// is not reported. Arrays of entities are matched by `id` so one extra body does not shift the rest.

import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const files = argv.filter(a => !a.startsWith('--'));
const all = argv.includes('--all');
const load = f => JSON.parse(readFileSync(f, 'utf8'));
let a, b;
if (files.length === 1) { const d = load(files[0]); a = d.host; b = d.client; console.log(`dump at tick ${d.tick} (machine ${d.machine || '?'})`); }
else if (files.length === 2) { a = load(files[0]); b = load(files[1]); }
else { console.error('usage: node tools/desync-diff.mjs dump.json | host.json client.json [--all]'); process.exit(2); }
const st = x => (x && x.state ? x.state : x);
a = st(a); b = st(b);

const diffs = [];
const q = v => Math.round(v * 1000);
function walk(x, y, path) {
  if (diffs.length > 5000) return;
  if (typeof x === 'number' && typeof y === 'number') { if (q(x) !== q(y)) diffs.push(`${path}: ${x} vs ${y}`); return; }
  if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') { if (x !== y) diffs.push(`${path}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`); return; }
  if (Array.isArray(x) !== Array.isArray(y)) { diffs.push(`${path}: array vs object`); return; }
  if (Array.isArray(x)) {
    const byId = x.length && x[0] && typeof x[0] === 'object' && 'id' in x[0];
    if (byId) {
      const mx = new Map(x.map(e => [e.id, e])), my = new Map(y.map(e => [e.id, e]));
      for (const [id, e] of mx) { if (!my.has(id)) diffs.push(`${path}[id=${id}]: only on the first side (${e.kind || ''} ${e.type || ''})`); else walk(e, my.get(id), `${path}[id=${id}]`); }
      for (const [id, e] of my) if (!mx.has(id)) diffs.push(`${path}[id=${id}]: only on the second side (${e.kind || ''} ${e.type || ''})`);
      return;
    }
    if (x.length !== y.length) diffs.push(`${path}.length: ${x.length} vs ${y.length}`);
    for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${path}[${i}]`);
    return;
  }
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`);
}
walk(a, b, 'state');
if (!diffs.length) { console.log('no differences (to 1/1000)'); process.exit(0); }
console.log(`${diffs.length} difference(s)${all ? '' : ', first 40'}:`);
for (const d of all ? diffs : diffs.slice(0, 40)) console.log('  ' + d);
process.exit(1);
