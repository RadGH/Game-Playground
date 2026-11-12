#!/usr/bin/env node
// "Is it connected?" — lists the modules in a game's js/ (and server/) that nothing a player can reach ever imports.
// docs/lessons-from-games.md rule 31: Farhold had 12+ finished modules that no page, worker or server ever loaded, each
// one indistinguishable from a missing feature. A module only tests or tools/ import counts as NOT connected.
//   node tools/game-reach.mjs prototypes/farhold [--json]
//   node tools/game-reach.mjs --all
// Entry points: every .html page in the game (script src + inline module imports), and every file in server/.
// Followed: static import/export-from, import('literal'), import(`with/${templates}.js`) (every file the template can
// match), new Worker / SharedWorker / audioWorklet.addModule / new URL('x.js', import.meta.url).
// Reviewed exceptions live in tools/reach-baseline.json ({ "<game>": { "<file>": "why it is fine" } });
// tests/game-reach.test.js fails on a new unreached module or a stale exception.
import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from 'node:fs';
import { join, relative, dirname, extname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allGames } from './game-lint.mjs';

const SKIP = new Set(['node_modules', 'vendor', 'tests', 'test', 'tools', 'docs', 'research', '.git', 'shots', 'test-results', 'data', 'assets']);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function files(dir, pred, skip = SKIP, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n); let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!skip.has(n)) files(p, pred, skip, out); } else if (pred(p)) out.push(p);
  }
  return out;
}
// line comments first: a line comment that mentions `data/*.json` would otherwise open a block comment
const stripComments = src => src.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1').replace(/\/\*[\s\S]*?\*\//g, '');

function specifiers(src) {
  const out = [], tpl = [];
  const s = stripComments(src);
  for (const re of [/\bimport\s+[^'"`;]*?from\s*['"]([^'"]+)['"]/g, /\bexport\s+[^'"`;]*?from\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /new\s+(?:Shared)?Worker\s*\(\s*['"]([^'"]+)['"]/g, /addModule\s*\(\s*['"]([^'"]+)['"]/g,
    /new\s+URL\s*\(\s*['"]([^'"]+\.m?js)['"]\s*,\s*import\.meta\.url/g]) for (const m of s.matchAll(re)) out.push(m[1]);
  for (const m of s.matchAll(/\bimport\s*\(\s*`([^`]+)`\s*\)|new\s+URL\s*\(\s*`([^`]+\.m?js)`\s*,\s*import\.meta\.url/g)) tpl.push(m[1] || m[2]);
  return { out, tpl };
}

export function reach(game) {
  game = realpathSync(game);
  const mods = files(game, p => /\.m?js$/.test(p) && /(^|\/)(js|server|src|lib)\//.test(relative(game, p)));
  const all = files(game, p => /\.m?js$/.test(p));
  const seen = new Set(), queue = [];
  const add = p => { try { p = realpathSync(p); } catch { return; } if (!p.startsWith(game) || seen.has(p)) return; seen.add(p); queue.push(p); };
  const follow = (from, src) => {
    const { out, tpl } = specifiers(src);
    for (const sp of out) if (/^\.{1,2}\//.test(sp) || sp.startsWith('/')) add(sp.startsWith('/') ? join(game, sp) : resolve(dirname(from), sp.split('?')[0]));
    for (const t of tpl) {                                   // `./games/${id}/sim.js` -> every file that fits the shape
      const abs = resolve(dirname(from), t.replace(/\$\{[^}]*\}/g, '\u0000'));
      const re = new RegExp('^' + abs.split('\u0000').map(x => x.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')).join('[^]*?') + '$');
      for (const f of all) if (re.test(f)) add(f);
    }
  };
  for (const html of files(game, p => extname(p) === '.html')) {
    const src = readFileSync(html, 'utf8');
    for (const m of src.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/g)) if (!/^(https?:)?\/\//.test(m[1])) add(resolve(dirname(html), m[1].split('?')[0]));
    for (const m of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) follow(html, m[1]);
    for (const m of src.matchAll(/<link\b[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/g)) add(resolve(dirname(html), m[1]));
  }
  if (existsSync(join(game, 'server'))) for (const f of files(join(game, 'server'), p => /\.m?js$/.test(p))) add(f);
  for (const f of ['sw.js', 'service-worker.js']) if (existsSync(join(game, f))) add(join(game, f));
  while (queue.length) { const f = queue.shift(); let src = ''; try { src = readFileSync(f, 'utf8'); } catch { continue; } follow(f, src); }
  return { reached: seen.size, modules: mods.length, unreached: mods.filter(m => !seen.has(realpathSync(m))).map(m => relative(game, m)).sort() };
}

export function baseline() { try { return JSON.parse(readFileSync(join(ROOT, 'tools', 'reach-baseline.json'), 'utf8')); } catch { return {}; } }

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), asJson = args.includes('--json'), raw = args.includes('--raw');
  const games = args.includes('--all') ? allGames() : args.filter(a => !a.startsWith('--'));
  const base = baseline(), res = {};
  let bad = 0;
  for (const g of games) {
    const r = reach(g), ok = base[basename(realpathSync(g)) === 'tinyrts' ? 'tinyrts' : basename(g)] || {};
    const fresh = raw ? r.unreached : r.unreached.filter(f => !ok[f]);
    res[basename(g)] = { ...r, fresh }; bad += fresh.length;
    if (!asJson) console.log(`${basename(g).padEnd(17)} ${r.modules} modules, ${r.unreached.length} not reached${raw ? '' : `, ${fresh.length} not in the baseline`}${fresh.length ? '\n  ' + fresh.join('\n  ') : ''}`);
  }
  if (asJson) console.log(JSON.stringify(res, null, 1));
  process.exit(bad ? 1 : 0);
}
