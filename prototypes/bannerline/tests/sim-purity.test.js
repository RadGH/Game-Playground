// The sim must be deterministic on every JS engine (PLAN §11.2). This scans js/sim/** and every file
// it imports (followed transitively, also outside js/sim/) for APIs whose results are not specified
// bit-for-bit, for engine-dependent sorting, and for DOM / clock / storage access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { ROOT } from './_sim.mjs';

const SIM = join(ROOT, 'js', 'sim');

function walkDir(d) {
  const out = [];
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) out.push(...walkDir(p));
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

// remove comments and string/template contents so a word in a comment never fails the scan
function strip(src) {
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += q; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

const BANNED = [
  [/\bMath\.random\b/, 'Math.random (use js/sim/rng.js)'],
  [/\bDate\b/, 'Date (no clocks in the sim)'],
  [/\bperformance\b/, 'performance.now (no clocks in the sim)'],
  [/\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt)\b/, 'engine-dependent Math function (use js/sim/mathx.js)'],
  [/\*\*/, 'the ** operator (engine-dependent pow)'],
  [/\.sort\s*\(/, 'bare .sort( (use sortBy from js/sim/order.js)'],
  [/\.toSorted\s*\(/, '.toSorted( (use sortBy)'],
  [/\.localeCompare\s*\(/, 'localeCompare (locale-dependent)'],
  [/\b(window|document|localStorage|sessionStorage|navigator|requestAnimationFrame|setTimeout|setInterval)\b/, 'browser / timer API in the sim'],
  [/\bfetch\s*\(/, 'fetch( in the sim (data is passed in)'],
  [/from\s+['"]three['"]|three\.module/, 'three.js in the sim'],
  [/\bfor\s*\(\s*(const|let|var)\s+\w+\s+in\b/, 'for...in over an object (object-as-map iteration order)'],
];
// files allowed specific exceptions, with the reason
const ALLOW = {
  'hash.js': ['for...in over an object (object-as-map iteration order)'],   // walks plain data in insertion order, which IS the canonical order
};

function importsOf(file, src) {
  const out = [];
  const re = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) { const spec = m[1] || m[2]; if (spec.startsWith('.')) out.push(resolve(dirname(file), spec)); else out.push(spec); }
  return out;
}

test('js/sim and everything it imports avoid non-deterministic APIs', () => {
  const seen = new Set(), queue = walkDir(SIM), problems = [];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    const raw = readFileSync(f, 'utf8');
    const src = strip(raw);
    const base = f.split('/').pop();
    for (const [re, why] of BANNED) {
      if ((ALLOW[base] || []).includes(why)) continue;
      const lines = src.split('\n');
      lines.forEach((ln, i) => { if (re.test(ln)) problems.push(`${relative(ROOT, f)}:${i + 1}  ${why}\n      ${raw.split('\n')[i].trim()}`); });
    }
    for (const imp of importsOf(f, raw)) {
      if (!imp.startsWith('/')) { problems.push(`${relative(ROOT, f)} imports bare module "${imp}"`); continue; }
      queue.push(imp.endsWith('.js') ? imp : imp + '.js');
    }
  }
  assert.ok(seen.size >= 15, `scanned ${seen.size} files`);
  assert.deepEqual(problems, [], 'non-deterministic code in the sim:\n' + problems.join('\n'));
});

test('the scanner itself catches what it should', () => {
  const bad = strip('const a = Math.random(); // Math.sin in a comment\nconst b = "Date in a string"; x.sort((a,b)=>a-b); y = 2 ** 3;');
  const hits = BANNED.filter(([re]) => re.test(bad)).map(b => b[1]);
  assert.ok(hits.some(h => h.startsWith('Math.random')));
  assert.ok(hits.some(h => h.startsWith('bare .sort')));
  assert.ok(hits.some(h => h.startsWith('the **')));
  assert.ok(!hits.some(h => h.startsWith('Date')), 'strings are stripped');
  assert.ok(!hits.some(h => h.startsWith('engine-dependent Math')), 'comments are stripped');
});
