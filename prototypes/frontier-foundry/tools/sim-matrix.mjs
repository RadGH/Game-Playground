#!/usr/bin/env node
// The balance matrix: every planet crossed with every difficulty, run headless, printed as the
// funnel table that `research/sim-report.md` is written from.
//
//   node prototypes/frontier-foundry/tools/sim-matrix.mjs
//   node .../sim-matrix.mjs --planets temperate,arid,volcanic --difficulties easy,normal,hard \
//        --seeds 7,12 --hours 6 --out prototypes/frontier-foundry/research/sim-report.md
//
// Each cell is one `sim-foundry.mjs --json` run in its own process, so a run that throws or hangs
// costs one cell rather than the whole matrix. Runs go a few at a time because each one is a full
// game and they are not cheap.
//
// Flags:
//   --planets a,b,c      archetypes to play (default temperate,arid,volcanic)
//   --difficulties a,b   easy | normal | hard (default all three)
//   --seeds a,b          world seeds per cell (default 7)
//   --hours N            in-game hours per run (default 6)
//   --chunks N           map size in 96-tile chunks (default 3)
//   --jobs N             how many runs at once (default 3)
//   --no-waves           economy only
//   --out FILE           also write the markdown table here

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIM = join(HERE, 'sim-foundry.mjs');

const argv = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v == null || v.startsWith('--') ? true : v;
};
const list = (name, def) => String(flag(name, def)).split(',').map(s => s.trim()).filter(Boolean);
const num = (name, def) => { const v = flag(name, null); return v == null ? def : Number(v); };

const planets = list('planets', 'temperate,arid,volcanic');
const difficulties = list('difficulties', 'easy,normal,hard');
const seeds = list('seeds', '7').map(Number);
const hours = num('hours', 6);
const chunks = num('chunks', 3);
const jobs = num('jobs', 3);
const noWaves = !!flag('no-waves', false);
const out = flag('out', null);

/** One run, in its own process. Never rejects: a broken cell comes back as `{ error }`. */
function run(cell) {
  const args = [SIM, '--json', '--hours', String(hours), '--chunks', String(chunks),
    '--seed', String(cell.seed), '--planet', cell.planet, '--difficulty', cell.difficulty];
  if (noWaves) args.push('--no-waves');
  return new Promise(resolve => {
    const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => { stdout += d; });
    p.stderr.on('data', d => { stderr += d; });
    p.on('close', () => {
      const line = stdout.trim().split('\n').filter(l => l.startsWith('{')).pop();
      if (!line) return resolve({ ...cell, error: (stderr.trim().split('\n').pop() || 'no output').slice(0, 160) });
      try { resolve({ ...cell, ...JSON.parse(line) }); }
      catch (e) { resolve({ ...cell, error: String(e.message).slice(0, 160) }); }
    });
  });
}

/** Run the list a few at a time. */
async function pool(cells, n) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.max(1, n) }, async () => {
    while (next < cells.length) {
      const i = next++;
      process.stderr.write(`  ${cells[i].planet}/${cells[i].difficulty}/seed ${cells[i].seed}\n`);
      results[i] = await run(cells[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const cells = [];
for (const planet of planets) for (const difficulty of difficulties) for (const seed of seeds) cells.push({ planet, difficulty, seed });

process.stderr.write(`running ${cells.length} games of ${hours}h, ${jobs} at a time\n`);
const t0 = Date.now();
const rows = await pool(cells, jobs);
process.stderr.write(`done in ${Math.round((Date.now() - t0) / 1000)}s\n`);

const hms = s => s == null ? '—' : `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
const COLUMNS = [
  ['first drill', r => hms(r.marks?.drill)],
  ['first smelt', r => hms(r.marks?.smelter)],
  ['steel', r => hms(r.marks?.steel)],
  ['refinery', r => hms(r.marks?.refinery)],
  ['chem packs', r => hms(r.marks?.chem)],
  ['1st wave held', r => hms(r.marks?.waveSurvived)],
  ['satellite', r => hms(r.marks?.satellite)],
  ['rocket', r => hms(r.marks?.launch ?? r.marks?.rocketReady)],
];

let md = '';
md += `| world | difficulty | ${COLUMNS.map(c => c[0]).join(' | ')} | tech | waves | built | crew lost | outcome |\n`;
md += `|---|---|${COLUMNS.map(() => '---').join('|')}|---|---|---|---|---|\n`;
for (const r of rows) {
  if (r.error) { md += `| ${r.planet} | ${r.difficulty} | ${COLUMNS.map(() => '—').join(' | ')} | — | — | — | — | error: ${r.error} |\n`; continue; }
  const outcome = r.won ? 'won' : r.lost ? `lost ${hms(r.lostAt)}` : r.marks?.launch ? 'launched' : 'survived';
  md += `| ${r.archetype} (${r.name || r.planet}) | ${r.difficulty} | ${COLUMNS.map(c => c[1](r)).join(' | ')} | ${r.tech} | ${r.wavesCleared}/${r.waves} | ${r.built} | ${r.crewLost} | ${outcome} |\n`;
}
md += '\nWhat each run was most short of at the end (worst supply-against-demand ratios):\n\n';
for (const r of rows) {
  if (r.error) continue;
  md += `- **${r.archetype} / ${r.difficulty}** — ${(r.worst || []).join(', ') || 'nothing'}${r.stalledOnPacks ? ' *(research stalled on packs)*' : ''}\n`;
}

console.log(md);
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md);
  process.stderr.write(`wrote ${out}\n`);
}
