// GitHub Pages serves this repo under /Game-Playground/, so a page that loads '/lingo/data/'
// asks radgh.github.io's ROOT for it and gets a 404. Every path a page loads must be relative
// (or built with new URL('…', import.meta.url)). This walks the shipped JS/HTML/CSS and fails on
// a load that starts with '/'. The local-only /api/ endpoints (tools/serve.py) are allowed:
// they are meant to fail quietly on the public site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = /(^|\/)(node_modules|vendor|tests|test-results|tools|research|\.scratch|tinyrts)(\/|$)/;
const LOAD = /(?:fetch\(|import\(|from\s+|src=|href=|url\(|\.load\(|base\s*=\s*)\s*['"`](\/[a-zA-Z][^'"`]*)/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.test(relative(ROOT, p))) continue;
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(m?js|html|css)$/.test(name)) yield p;
  }
}

test('no page loads a path from the site root', () => {
  const bad = [];
  for (const file of walk(ROOT)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;             // usage examples in comments
      for (const m of line.matchAll(LOAD)) {
        if (m[1].startsWith('/api/')) continue;
        bad.push(`${relative(ROOT, file)}:${i + 1} ${m[1]}`);
      }
    });
  }
  assert.deepEqual(bad, [], 'root-relative paths break GitHub Pages:\n' + bad.join('\n'));
});
