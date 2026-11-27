// House Kit: Codex paints the textures listed in tools/textures.json (ART ONLY — Codex writes no code here).
//   node housekit/tools/codex-textures.mjs [id…] [--again]
// Out: ref/<id>/painted.png (+ prompt.txt, codex.log). Then: python3 housekit/tools/build-atlas.py
// Codex can run out of usage mid-batch: whatever is painted is kept; run again later for the rest (painted ids are
// skipped unless --again). An id Codex never painted keeps the stand-in from build-atlas.py (it prints which).
// Copied from avatar-3d/spellkit/tools/codex-sheets.mjs (same call, same "find the picture Codex kept" fallback).
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = JSON.parse(readFileSync(join(ROOT, 'tools', 'textures.json'), 'utf8'));
const args = process.argv.slice(2);
const again = args.includes('--again');
const want = args.filter(a => !a.startsWith('--'));
const ids = want.length ? want : Object.keys(S.textures);

function promptFor(id, t) {
  const [w, h] = t.picture || [1024, 1024];
  const tiling = t.tile === 'cells' ? 'Each emblem board is its own picture (they do not need to tile).'
    : t.tile === 'band' ? 'It must TILE left-to-right: the left edge continues seamlessly into the right edge (the top and bottom edges are the beam\'s own painted borders).'
      : 'It must TILE SEAMLESSLY in both directions: the left edge continues into the right edge and the top edge into the bottom edge, with no visible seam, no frame and no vignette.';
  return `Use your image generation tool to create ONE new picture and save it in the current working directory as painted.png (${w}x${h} PNG). Do nothing else (do not write code, do not edit other files).
It is a game texture for a fantasy town building kit: ${id.toUpperCase()}.
Subject: ${t.what}.
${tiling}
Fill the WHOLE picture edge to edge with the material (no background, no border, no drop shadow, no perspective — seen straight on, flat lighting from the top-left).
Style: ${S.style}.
Hard rules: no text, no letters, no numbers, no watermark, no people, no frame.
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

let made = 0; const failed = [];
for (const id of ids) {
  const t = S.textures[id];
  if (!t) { console.error('unknown texture ' + id); continue; }
  if (t.from) continue;                                     // made from another painting by build-atlas.py
  const job = join(ROOT, 'ref', id);
  mkdirSync(job, { recursive: true });
  if ((existsSync(join(job, 'painted.png')) || existsSync(join(job, 'painted.webp'))) && !again) { console.log(`${id}: already painted`); continue; }
  const prompt = promptFor(id, t) + (t.extra ? '\n' + t.extra + '\n' : '');
  writeFileSync(join(job, 'prompt.txt'), prompt);
  const t0 = Date.now();
  const ok = runCodex(job, prompt);
  console.log(`${id}: ${ok ? 'painted' : 'NO PICTURE (see ref/' + id + '/codex.log)'} in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (ok) made++; else failed.push(id);
  const log = readFileSync(join(job, 'codex.log'), 'utf8');
  if (!ok && /usage limit|rate limit|quota/i.test(log)) { console.error('Codex usage limit reached — stopping; run again later'); break; }
}
console.log(`done: ${made} painted${failed.length ? ', failed: ' + failed.join(' ') : ''}`);
