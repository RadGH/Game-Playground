#!/usr/bin/env node
// Source scan for the bug classes Radley keeps reporting (docs/lessons-from-games.md Part 4 check 2; owner 2026-11-11:
// "I don't want to have to report the same bug again"). Run on any game folder; exits 1 when something is found.
//   node tools/game-lint.mjs prototypes/rogueloot [--json]
// Skips tests/, tools/, vendor/, node_modules/, editor/ (dev tools may use plain inputs) and lines marked `// lint-ok: <why>`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const RULES = [
  { id: 'browser-popup', re: /(?<![\w.])(?:window\.)?(alert|confirm|prompt)\s*\(/, why: 'browser popup: use shared/dialog.js (ask / tell / askText / showCode)' },
  { id: 'browser-tooltip', re: /\btitle\s*=\s*["'`$]|\.title\s*=(?!=)|setAttribute\(\s*['"]title['"]/, why: 'browser tooltip: use the styled tooltip (data-tip), never title=' },
  { id: 'json-import', re: /with\s*\{\s*type\s*:\s*['"]json['"]\s*\}/, why: 'import attributes kill Steam Deck browsers: fetch the JSON' },
  { id: 'raw-decimal', re: /\.toFixed\(\s*[3-9]\s*\)/, why: 'more than 2 decimals on screen: use shared/format.js', display: true },
  { id: 'emoji-icon', re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, why: 'emoji used as an icon: one icon style per game (SVG set)', soft: true },
];
const SKIP_DIRS = new Set(['tests', 'tools', 'vendor', 'node_modules', 'editor', 'research', 'docs', 'data', '.git', 'shots', 'test-results']);
const BAD_NAMES = /(^|[\\/])(beacon|analytics|tracker|tracking|ads?)\.(js|mjs)$/i;

const [dir, ...flags] = process.argv.slice(2);
if (!dir) { console.error('usage: node tools/game-lint.mjs <game folder> [--json] [--strict]'); process.exit(2); }
const strict = flags.includes('--strict'), asJson = flags.includes('--json');
const found = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n), st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(n)) walk(p); continue; }
    if (!['.js', '.mjs', '.html'].includes(extname(n))) continue;
    if (BAD_NAMES.test(p)) found.push({ rule: 'blocked-name', file: relative(dir, p), line: 0, text: n, why: 'ad/tracker blockers block this file name and the page dies' });
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (/lint-ok/.test(line)) return;
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');      // ignore comments
      const display = /(^|[\\/])(client|ui|hud)([\\/]|$)|\.html$/.test(relative(dir, p));        // screen code (not sim maths)
      for (const r of RULES) if (r.re.test(code) && (!r.soft || strict) && (!r.display || (display && /textContent|innerHTML|innerText|<[a-z]/.test(code)))) found.push({ rule: r.id, file: relative(dir, p), line: i + 1, text: line.trim().slice(0, 120), why: r.why });
    });
  }
})(dir);
if (asJson) console.log(JSON.stringify(found, null, 1));
else if (!found.length) console.log(`game-lint: ${dir} clean`);
else { for (const f of found) console.log(`${f.file}:${f.line}  [${f.rule}] ${f.why}\n    ${f.text}`); console.log(`\ngame-lint: ${found.length} problem(s) in ${dir}`); }
process.exit(found.length ? 1 : 0);
