// Spell Kit: Codex paints the texture sheets listed in tools/sheets.json.
//   node avatar-3d/spellkit/tools/codex-sheets.mjs [sheet…] [--again]
// Out: ref/<sheet>/painted.png (+ prompt.txt, codex.log). Then: python3 avatar-3d/spellkit/tools/cut-sheets.py
// Codex can run out of usage mid-batch: whatever is painted is kept; run again later for the rest (painted sheets are
// skipped unless --again). Sheets Codex never paints fall back to tools/procedural.py textures.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = JSON.parse(readFileSync(join(ROOT, 'tools', 'sheets.json'), 'utf8'));
const args = process.argv.slice(2);
const again = args.includes('--again');
const want = args.filter(a => !a.startsWith('--'));
const ids = want.length ? want : Object.keys(S.sheets);

function promptFor(sheet) {
  const cells = sheet.layout === 'cells';
  const where = cells
    ? ['TOP-LEFT', 'TOP-MIDDLE', 'TOP-RIGHT', 'BOTTOM-LEFT', 'BOTTOM-MIDDLE', 'BOTTOM-RIGHT']
    : ['FIRST (top) row', 'SECOND row', 'THIRD row', 'FOURTH (bottom) row'];
  const list = sheet.items.map(([id, what], i) => `${i + 1}. ${where[i]}: ${what}.`).join('\n');
  const grid = cells
    ? `The picture is an invisible grid of 3 columns x 2 rows of equal 512x512 squares. Draw exactly ONE item per square, centred in its square, filling about 85% of it, never touching or crossing into a neighbour square (keep a black gap of at least 24 pixels from every square edge).`
    : `The picture is 4 horizontal strips, each 1536 wide x 256 tall, stacked top to bottom. Draw one band per strip, filling the strip's full width; keep at least 12 pixels of pure black between strips. Each band must tile: its left edge must continue seamlessly into its right edge.`;
  return `Use your image generation tool to create ONE new picture and save it in the current working directory as painted.png (1536x1024 PNG, landscape). Do nothing else (do not write code, do not edit other files).
It is a game texture sheet of spell-effect textures.
${grid}
Items:
${list}
Style: ${S.style}.
Hard rules:
- Background is PURE BLACK (#000000) everywhere outside the painted shapes. No vignette, no border, no frame, no grid lines.
- Paint every item ONLY in white and shades of grey (no colour at all): the game tints them per magic school and treats brightness as glow.
- No text, no labels, no numbers, no watermark.
`;
}

function runCodex(job, prompt) {
  rmSync(join(job, 'painted.png'), { force: true });
  const r = spawnSync('codex', ['exec', '-s', 'danger-full-access', '--skip-git-repo-check', '-'],
    { cwd: job, input: prompt, encoding: 'utf8', timeout: 20 * 60e3, maxBuffer: 256 * 1024 * 1024 });
  const strip = t => (t || '').replace(/[A-Za-z0-9+/=]{200,}/g, '<picture data>');
  writeFileSync(join(job, 'codex.log'), strip(r.stdout).slice(-20000) + '\n--- stderr ---\n' + strip(r.stderr).slice(-20000));
  if (existsSync(join(job, 'painted.png'))) return true;
  // Codex sometimes draws but does not save where asked; it keeps its own copy per session
  const sid = ((r.stderr || '') + (r.stdout || '')).match(/session id: ([0-9a-f-]+)/)?.[1];
  const gdir = sid && join(homedir(), '.codex', 'generated_images', sid);
  if (gdir && existsSync(gdir)) {
    const pics = readdirSync(gdir).filter(f => f.endsWith('.png')).map(f => join(gdir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (pics.length) { copyFileSync(pics[0], join(job, 'painted.png')); return true; }
  }
  return false;
}

let made = 0, failed = [];
for (const id of ids) {
  const sheet = S.sheets[id];
  if (!sheet) { console.error('unknown sheet ' + id); continue; }
  const job = join(ROOT, 'ref', id);
  mkdirSync(job, { recursive: true });
  if (existsSync(join(job, 'painted.png')) && !again) { console.log(`${id}: already painted`); continue; }
  const prompt = promptFor(sheet);
  writeFileSync(join(job, 'prompt.txt'), prompt);
  const t0 = Date.now();
  const ok = runCodex(job, prompt);
  console.log(`${id}: ${ok ? 'painted' : 'NO PICTURE (see ref/' + id + '/codex.log)'} in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (ok) made++; else failed.push(id);
  // a usage-limit message means every later sheet would fail too
  const log = readFileSync(join(job, 'codex.log'), 'utf8');
  if (!ok && /usage limit|rate limit|quota/i.test(log)) { console.error('Codex usage limit reached — stopping; run again later'); break; }
}
console.log(`done: ${made} painted${failed.length ? ', failed: ' + failed.join(' ') : ''}`);
