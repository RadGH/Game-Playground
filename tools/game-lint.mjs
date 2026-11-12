#!/usr/bin/env node
// Source scan for the bug classes Radley keeps reporting (docs/lessons-from-games.md Part 4 check 2; owner 2026-11-11:
// "I don't want to have to report the same bug again"). Run on any game folder; exits 1 when something is found.
//   node tools/game-lint.mjs prototypes/rogueloot [--json] [--strict]
//   node tools/game-lint.mjs --all                 every game in prototypes/ (what the publish gate runs)
// Runs by itself on files Claude edits: tools/hooks/game-lint-hook.mjs (Stop hook in ~/.claude/settings.json).
// Code rules skip tests/, tools/, vendor/, node_modules/, editor/, docs/, data/ and lines marked `lint-ok: <why>`.
// Data rules (banned names, "muster") read data/**/*.json. Game rules (What's new) are reported at line 0.
// The rendered-page rules (nested scrollers, sideways scroll, long decimals on screen) live in shared/test/screen-text.js
// and run in each game's walk test (tools/walk-screens.mjs).
import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from 'node:fs';
import { join, relative, extname, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES = [
  { id: 'browser-popup', re: /(?<![\w.])(?:window\.)?(alert|confirm|prompt)\s*\(/, why: 'browser popup: use shared/dialog.js (ask / tell / askText / showCode)' },
  { id: 'browser-tooltip', re: /\btitle\s*=\s*["'`$]|\.title\s*=(?!=)|setAttribute\(\s*['"]title['"]/, why: 'browser tooltip: use the styled tooltip (data-tip), never title=' },
  { id: 'json-import', re: /with\s*\{\s*type\s*:\s*['"]json['"]\s*\}/, why: 'import attributes kill Steam Deck browsers: fetch the JSON' },
  { id: 'raw-decimal', re: /\.toFixed\(\s*[3-9]\s*\)/, why: 'more than 2 decimals on screen: use shared/format.js', display: true },
  { id: 'muster', re: /\bmuster/i, why: 'the owner banned the word "muster" in every game' },
  { id: 'root-path', re: /(?:\b(?:src|href|action)\s*=\s*["'`]|\bfetch\(\s*["'`]|\bimport\s*\(\s*["'`]|\bfrom\s+["'`]|url\(\s*["']?)\/(?![\/*])/, why: 'a path starting with / breaks on GitHub Pages (the site lives under /Game-Playground/): use a relative path', staticOnly: true },
  { id: 'emoji-icon', re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, why: 'emoji used as an icon: one icon style per game (SVG set)', soft: true },
];
// docs/banned-names.md. Only names that are unambiguous as a player-facing word; the "(as a …)" ones are checked when
// they are a whole name on their own ("Rage", "Focus", "Fury", "Heroic", "Chi", "Stealth", "Ambush", "Corruption").
const BANNED_PHRASES = ['Mythic', 'Keystone', 'War Mode', 'Horde', 'Alliance', 'Hearthstone', 'Delve', 'Delver', 'Renown', 'Rested XP',
  'Honored', 'Revered', 'Exalted', 'Combo Points', 'Garrote', 'Cheap Shot', 'Barkskin', 'Totemic Recall',
  'Soul Shards', 'Soul Shard', 'Arcane Charge', 'Counterspell', 'Lay on Hands', 'Consecration', 'Mass Resurrection', 'Healing Wave',
  'Last Stand', 'Mirror Image', 'Leap of Faith', 'Hellfire', 'Starfall', 'Soulbound', 'Flight Path', 'Skyway', 'Attunement'];
// Everyday words that are only banned as a NAME on their own (a druid's "Maul", a resource called "Rage"); "War Maul" or
// "rake the coals" is fine.
const BANNED_WHOLE = ['Rage', 'Focus', 'Fury', 'Heroic', 'Chi', 'Stealth', 'Ambush', 'Corruption', 'Blink', 'Swipe', 'Maul', 'Rake', 'Prowl', 'Mythic+'];
const PHRASE_RE = new RegExp(`(^|[^\\w'])(${BANNED_PHRASES.map(s => s.replace(/[+ ]/g, m => m === '+' ? '\\+' : '\\s+')).join('|')})(?![\\w])`);
const SKIP_DIRS = new Set(['tests', 'tools', 'vendor', 'node_modules', 'editor', 'research', 'docs', 'data', '.git', 'shots', 'test-results', 'ops']);
const DATA_SKIP = new Set(['node_modules', '.git', 'tests', 'fixtures', 'synced']);
const BAD_NAMES = /(^|[\\/])(beacon|analytics|tracker|tracking|ads?)\.(js|mjs)$/i;

export function lintGame(dir, { strict = false } = {}) {
  const found = [];
  const own = existsSync(join(dir, 'server')) || existsSync(join(dir, 'ops'));   // served at its own origin: / paths are fine
  const push = (rule, file, line, text, why) => found.push({ rule, file, line, text: String(text).trim().slice(0, 120), why });
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n), st = statSync(p);
      if (st.isDirectory()) { if (!SKIP_DIRS.has(n)) walk(p); continue; }
      const ext = extname(n);
      if (!['.js', '.mjs', '.html', '.css'].includes(ext)) continue;
      const rel = relative(dir, p);
      if (BAD_NAMES.test(p)) push('blocked-name', rel, 0, n, 'ad/tracker blockers block this file name and the page dies');
      const display = /(^|[\\/])(client|ui|hud)([\\/]|$)|\.html$/.test(rel);          // screen code (not sim maths)
      const serverSide = /(^|[\\/])server([\\/]|$)/.test(rel);
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (/lint-ok/.test(line)) return;
        const code = ext === '.css' ? line.replace(/\/\*.*?\*\//g, '') : line.replace(/(^|[^:'"`])\/\/.*$/, '$1').replace(/^\s*\*.*$/, '').replace(/<!--.*?-->/g, '');
        for (const r of RULES) {
          if (ext === '.css' && r.id !== 'root-path') continue;
          if (r.soft && !strict) continue;
          if (r.staticOnly && (own || serverSide)) continue;
          if (r.display && !(display && /textContent|innerHTML|innerText|<[a-z]/.test(code))) continue;
          if (r.re.test(code)) push(r.id, rel, i + 1, line, r.why);
        }
      });
    }
  })(dir);
  // data: banned names and "muster" in any string VALUE of data/**/*.json (keys are code, not text)
  const dataDir = join(dir, 'data');
  if (existsSync(dataDir)) (function walk(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n), st = statSync(p);
      if (st.isDirectory()) { if (!DATA_SKIP.has(n)) walk(p); continue; }
      if (extname(n) !== '.json' || st.size > 8e6) continue;
      let json; try { json = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
      const rel = relative(dir, p), hits = new Set();
      (function visit(v, path) {
        if (typeof v === 'string') {
          if (/lint-ok/.test(v)) return;
          if (/\bmuster/i.test(v)) hits.add(`muster|${path}|${v}`);
          const m = v.match(PHRASE_RE); if (m) hits.add(`banned-name|${path}|${m[2]}: ${v}`);
          if (BANNED_WHOLE.includes(v.trim())) hits.add(`banned-name|${path}|${v}`);
        } else if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${path}[${i}]`));
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!/^(_|\$)?(comment|notes?|todo|why|source|ref)$/i.test(k)) visit(x, path ? `${path}.${k}` : k);
      })(json, '');
      for (const h of hits) { const [rule, path, text] = h.split('|'); push(rule, rel, 0, `${path}: ${text}`, rule === 'muster' ? 'the owner banned the word "muster" in every game' : 'banned name (docs/banned-names.md): invent an original one'); }
    }
  })(dataDir);
  // game-wide: a What's new button (shared/whats-new.js + data/changelog.json, or the game's own)
  const hasNews = existsSync(join(dir, 'data', 'changelog.json')) || existsSync(join(dir, '.lint-has-whats-new'));
  if (!hasNews) push('no-whats-new', '(game)', 0, basename(dir), "every published game has a What's new button: shared/whats-new.js + data/changelog.json");
  return found;
}

export function allGames(root = join(dirname(fileURLToPath(import.meta.url)), '..')) {
  const base = join(root, 'prototypes');
  return readdirSync(base).map(n => join(base, n)).filter(p => { try { return statSync(p).isDirectory() && existsSync(join(p, 'index.html')); } catch { return false; } });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flags = args.filter(a => a.startsWith('--')), dirs = args.filter(a => !a.startsWith('--'));
  const strict = flags.includes('--strict'), asJson = flags.includes('--json');
  const games = flags.includes('--all') ? allGames() : dirs;
  if (!games.length) { console.error('usage: node tools/game-lint.mjs <game folder>… | --all  [--json] [--strict]'); process.exit(2); }
  let total = 0; const all = {};
  for (const g of games) {
    const found = lintGame(g, { strict }); total += found.length; all[g] = found;
    if (asJson) continue;
    if (!found.length) { console.log(`game-lint: ${g} clean`); continue; }
    for (const f of found) console.log(`${g.replace(/\/$/, '')}/${f.file}:${f.line}  [${f.rule}] ${f.why}\n    ${f.text}`);
    console.log(`game-lint: ${found.length} problem(s) in ${g}\n`);
  }
  if (asJson) console.log(JSON.stringify(games.length === 1 ? all[games[0]] : all, null, 1));
  process.exit(total ? 1 : 0);
}
