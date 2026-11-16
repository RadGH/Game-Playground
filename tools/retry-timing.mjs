#!/usr/bin/env node
// Second chance for SPEED tests only (owner 2026-11-16, after 5 refused publishes in a row).
// publish-stable runs every game's unit tests at once; tests that time code ("tick budget", "under 4 ms", "speed")
// then sometimes miss their limit because the machine is busy, and a fluke in an unrelated game blocked the publish.
// Usage: node tools/retry-timing.mjs <unit log> <tree dir>
//   Reads the failing tests from the log. If ANY failure is not a speed test → exit 1 (a real failure still refuses).
//   Otherwise each speed test is rerun ALONE up to 3 times; all pass at least once → exit 0, else exit 1.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [log, tree] = process.argv.slice(2);
const TIMING = /\b(speed|budget|fast|faster|slow|perf|performance|fps|frame ?time|stutter|ms|milliseconds?|under \d+(\.\d+)? ?ms|within \d+)\b/i;
const lines = readFileSync(log, 'utf8').split('\n');
const fails = [];
lines.forEach((l, i) => {
  const m = /^\s*not ok \d+ - (.+)$/.exec(l); if (!m) return;
  let loc = null, group = false;
  for (let j = i + 1; j < Math.min(lines.length, i + 60); j++) {
    if (/^\s*(not )?ok \d+ /.test(lines[j])) break;
    const L = /location: '(.+?):\d+:\d+'/.exec(lines[j]); if (L && !loc) loc = L[1];
    if (/subtests? failed/.test(lines[j])) group = true;   // a group that failed because a test inside it did
  }
  if (!group) fails.push({ name: m[1].trim(), file: loc });
});
const leaf = fails;
if (!leaf.length || leaf.some(f => !f.file)) { console.log('  no failing tests found in the log'); process.exit(1); }
const notTiming = leaf.filter(f => !TIMING.test(f.name));
if (notTiming.length) { console.log('  not only speed tests failed:'); for (const f of notTiming) console.log(`    ${f.name}`); process.exit(1); }
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let ok = true;
for (const f of leaf) {
  const file = f.file.replace(/^\/tmp\/tmp\.[^/]+/, tree);
  let passed = false;
  for (let t = 1; t <= 3 && !passed; t++) {
    const r = spawnSync(process.execPath, ['--test', `--test-name-pattern=^${esc(f.name)}$`, file], { cwd: tree, encoding: 'utf8', timeout: 300000 });
    passed = r.status === 0 && /# pass [1-9]/.test(r.stdout);
    console.log(`  speed test, alone, try ${t}: ${passed ? 'pass' : 'fail'} — ${f.name}`);
  }
  if (!passed) ok = false;
}
process.exit(ok ? 0 : 1);
