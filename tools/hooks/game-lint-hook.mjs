#!/usr/bin/env node
// Runs tools/game-lint.mjs automatically on game files Claude changed (owner 2026-11-11: "run the game-lint check
// automatically whenever I finish game work, so the rules are enforced even when I forget them").
// Wired in ~/.claude/settings.json:
//   PostToolUse (Edit|Write|MultiEdit)  ->  node game-lint-hook.mjs track   remembers each game file touched this session
//   Stop                                ->  node game-lint-hook.mjs stop    lints those files' games; problems in the
//                                           touched files send Claude back to fix them (once); a second stop with
//                                           problems left lets the turn end and shows the list to the user instead.
// Only findings in files touched this session count, so old problems elsewhere in a game never block anyone.
// A game is any folder under playground/prototypes/ (TinyRTS resolves through its symlink to ~/claude/tinyrts).
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, realpathSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLAYGROUND = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LINT = join(PLAYGROUND, 'tools', 'game-lint.mjs');
const ROOTS = [ // [folder that holds games, how to name the game folder]
  { base: join(PLAYGROUND, 'prototypes'), depth: 1 },
  { base: join(homedir(), 'claude', 'tinyrts'), depth: 0 },
];
const mode = process.argv[2];
let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no input */ }
const stateDir = join(tmpdir(), 'claude-game-lint');
const stateFile = join(stateDir, `${String(input.session_id || 'nosession').replace(/[^\w-]/g, '')}.json`);
const load = () => { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return []; } };

function gameOf(file) {
  let p = file; try { p = realpathSync(file); } catch { /* deleted or new */ }
  for (const { base, depth } of ROOTS) {
    let b = base; try { b = realpathSync(base); } catch { continue; }
    const rel = relative(b, p);
    if (!rel || rel.startsWith('..')) continue;
    const game = depth ? join(b, rel.split('/')[0]) : b;
    if (depth && rel.split('/').length < 2) return null;            // a file sitting directly in prototypes/
    return { game, file: relative(game, p) };
  }
  return null;
}

if (mode === 'track') {
  const f = input.tool_input?.file_path || input.tool_response?.filePath;
  if (f && /\.(m?js|html)$/.test(f) && gameOf(f)) {
    const list = load();
    if (!list.includes(f)) { list.push(f); mkdirSync(stateDir, { recursive: true }); writeFileSync(stateFile, JSON.stringify(list)); }
  }
  process.exit(0);
}

if (mode === 'stop') {
  const list = load();
  if (!list.length) process.exit(0);
  const byGame = new Map();
  for (const f of list) { const g = gameOf(f); if (g) (byGame.get(g.game) || byGame.set(g.game, new Set()).get(g.game)).add(g.file); }
  const problems = [];
  for (const [game, files] of byGame) {
    if (!existsSync(game)) continue;
    const r = spawnSync(process.execPath, [LINT, game, '--json'], { encoding: 'utf8', timeout: 60000 });
    let found = []; try { found = JSON.parse(r.stdout || '[]'); } catch { continue; }
    for (const x of found) if (files.has(x.file)) problems.push(`${relative(PLAYGROUND, game) || game}/${x.file}:${x.line}  [${x.rule}] ${x.why}\n    ${x.text}`);
  }
  if (!problems.length) { try { unlinkSync(stateFile); } catch {} process.exit(0); }
  const text = `game-lint found ${problems.length} problem(s) in game files changed this session (docs/lessons-from-games.md rules):\n${problems.join('\n')}`;
  if (input.stop_hook_active) {                                     // already sent back once: let the turn end, tell the user
    try { unlinkSync(stateFile); } catch {}
    console.log(JSON.stringify({ systemMessage: text + '\n(Claude was asked to fix these once; still open.)' }));
  } else {
    console.log(JSON.stringify({ decision: 'block', reason: text + '\nFix each one before finishing (or mark a line `// lint-ok: <why>` if it is a real exception, and say so in your reply).' }));
  }
  process.exit(0);
}
process.exit(0);
