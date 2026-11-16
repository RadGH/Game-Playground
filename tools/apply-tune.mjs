#!/usr/bin/env node
// Write the numbers from a tuning panel's Save block (shared/tune.js) into a game's data/tuning.json, and log them in
// the game's docs/feel-log.md. Radley pastes the block in chat; Claude runs:
//   node tools/apply-tune.mjs <game> --why "jumps felt floaty" <<'EOF'
//   Tuned in the panel: <game>
//   jumpHeight 3 → 4
//   EOF
// A value is written only when the file still holds the value the panel started from ("from") and the new one lies in
// the entry's min..max (--widen moves the range instead when Radley asked for it). Every line gets a result row:
//   set <key> <from> <to> · same <key> <v> · moved <key> <from> <now> <to> · out_of_range <key> <to> <min> <max> ·
//   unknown <key> · bad_line <line> · other_game <name>
// Only the "value" (and with --widen, "min"/"max") of each entry changes; the rest of the file keeps its layout.
// Exit 0 when every row is set/same, 1 when something was left alone, 2 on usage errors, 4 for another game's block.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBlock } from './apply-tune-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = k => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const why = flag('--why'); const dir = flag('--dir');
const widen = args.includes('--widen') && !!args.splice(args.indexOf('--widen'), 1);
const game = args.shift();
if (!game) { console.error('usage: node tools/apply-tune.mjs <game> [--why TEXT] [--widen] [--dir <game folder>] < block'); process.exit(2); }
const folder = dir || join(ROOT, 'prototypes', game);
const file = join(folder, 'data', 'tuning.json');
if (!existsSync(file)) { console.error(`no ${file} — a game using the tuning panel keeps its numbers there (shared/tune.js)`); process.exit(2); }
const block = (args.length ? args.join('\n') : readFileSync(0, 'utf8')).split('\n').map(l => l.trim()).filter(Boolean);

const before = readFileSync(file, 'utf8');
const res = applyBlock(before, block, { game, widen });
for (const r of res.rows) console.log(r.join('\t'));
if (res.other) process.exit(4);
const set = res.rows.filter(r => r[0] === 'set');
if (set.length) {
  writeFileSync(file, res.text);
  const log = join(folder, 'docs', 'feel-log.md');
  mkdirSync(dirname(log), { recursive: true });
  const head = existsSync(log) ? '' : `# Feel log — ${game}\n\nEvery tuning-panel change kept (tools/apply-tune.mjs), newest last: what moved and why, in Radley's words.\n`;
  const day = new Date().toISOString().slice(0, 10);
  writeFileSync(log, (existsSync(log) ? readFileSync(log, 'utf8') : head) + `\n## ${day}${why ? ` — "${why}"` : ''}\n` + set.map(r => `- ${r[1]}: ${r[2]} → ${r[3]}`).join('\n') + '\n');
}
process.exit(res.rows.every(r => r[0] === 'set' || r[0] === 'same' || r[0] === 'widened') ? 0 : 1);
