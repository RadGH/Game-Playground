#!/usr/bin/env node
// Which screens a publish needs to walk (owner 2026-11-27: "Do we need the scene walks all the time? Seems
// inefficient" → "Make the change as you wish"). Called by tools/prepublish-check.sh.
//
//   node tools/walk-plan.mjs <game> <sha> [--since <ref>]     prints ONE line:
//     skip                  nothing a player's screen is built from changed (rules, data, server, docs, tests, tools)
//     screens a,b,c         only page files that belong to these screens changed (win-classes.js → play-classes …)
//     all <why>             anything else: the page shell, client core, rendering, shared/, the walk file, a first
//                           publish, or a changed page file no screen claims
//
// `since` = the last published copy (the `stable` branch). A walk file may say which screens a file belongs to with
// `files: { 'js/client/arena-ui.js': ['arena-hud', 'arena-board'] }` next to its screens; otherwise a file named
// win-<x>.js / <x>.css belongs to every screen whose name contains <x>.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join, resolve, dirname, basename } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';

const MAIN = import.meta.url === pathToFileURL(process.argv[1] || '').href;
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

// files no screen is drawn from
const QUIET = [/^(docs|tools|ops|saves|shots|server|data)\//, /^tests\/(?!walk\.mjs$)/, /^js\/(rules|world|game|net|sim)\//, /\.(md|png|jpg|webp|glb)$/, /^package(-lock)?\.json$/];

/** The plan for a list of changed paths (relative to the game folder) and the game's walk config. Pure. */
export function planFor(rel, cfg) {
  const page = rel.filter(f => !QUIET.some(r => r.test(f)));
  if (!page.length) return 'skip only rules / data / server / docs / tests changed';
  if (page.includes('tests/walk.mjs')) return 'all the walk file changed';
  if (!cfg) return 'all no walk file';
  const names = (cfg.screens || []).map(s => s.name).filter(Boolean);
  const picked = new Set();
  for (const f of page) {
    const own = cfg.files?.[f];
    if (own) { own.forEach(n => picked.add(n)); continue; }
    const m = /^(?:js\/client\/ui\/win-|css\/(?:win-)?)([a-z0-9-]+)\.(?:js|css)$/.exec(f);
    const hits = m ? names.filter(n => n.includes(m[1])) : [];
    if (!hits.length) return `all ${f} belongs to no single screen`;
    hits.forEach(n => picked.add(n));
  }
  return `screens ${[...picked].join(',')}`;
}

if (MAIN) await main();

async function main() {
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const [game, sha = 'HEAD'] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const since = flag('--since') || 'stable';
const out = s => { console.log(s); process.exit(0); };
if (!game) { console.error('usage: node tools/walk-plan.mjs <game> <sha> [--since ref]'); process.exit(2); }

const DIR = `prototypes/${game}`;
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
if (realpathSync(join(ROOT, DIR)) !== join(ROOT, DIR)) out('all its own repo (no published copy to compare with)');
try { git('rev-parse', '--verify', `${since}^{commit}`); } catch { out(`all no ${since} branch`); }
if (!git('ls-tree', '-d', since, DIR)) out('all first publish');

// what changed in the game since the published copy, plus the shared helpers every page imports
const changed = git('diff', '--name-only', since, sha, '--', DIR, 'shared/').split('\n').filter(Boolean);
if (!changed.length) out('skip nothing changed');
if (changed.some(f => f.startsWith('shared/'))) out('all shared/ changed');
const rel = changed.map(f => f.slice(DIR.length + 1));

const walkPath = join(ROOT, DIR, 'tests', 'walk.mjs');
const cfg = existsSync(walkPath) ? (await import(pathToFileURL(walkPath).href)).default : null;
out(planFor(rel, cfg));
}
