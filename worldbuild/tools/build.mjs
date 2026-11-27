// World Build — run the whole pipeline in Node and write the world out.
//
//   node worldbuild/tools/build.mjs <brief.json> [--seed N] [--out dir] [--edits edits.json] [--mpp 4] [--no-tiles]
//
// Writes into the out folder (default worldbuild/out/<brief id>-<seed>/):
//   map.json        Oathwild's map schema + the opt-in `baked` tiles (worldbuild/js/export.js)
//   towns.json      Oathwild's towns schema (the pinned rows unchanged, then the new towns)
//   tiles/*.bin     the ground, 256 m a tile (heights, water, biome, region, level, forest)
//   stage-*.png     one picture per stage, north at the top (mpp metres a pixel)
//   report.json     every check, every number, every stage's time
//   report.txt      the same, readable
// Exits with code 1 when a check fails (so a script can stop on a broken world). Paths in the brief are read from the
// playground folder.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline, STAGES } from '../js/pipeline.js';
import { stagePicture, drawLabels } from '../js/preview.js';
import { toMapJson, toTownsJson, tileList, writeTile } from '../js/export.js';
import { encodePng } from '../../prototypes/thousandvale/tools/lib/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const briefPath = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) || 'worldbuild/data/briefs/oathwild-4k.json';
const read = p => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const raw = JSON.parse(readFileSync(resolve(process.cwd(), briefPath), 'utf8'));
const seed = flag('--seed');
const edits = flag('--edits') ? JSON.parse(readFileSync(resolve(process.cwd(), flag('--edits')), 'utf8')) : null;
const mpp = Number(flag('--mpp', 4));

const t0 = Date.now();
const W = await runPipeline(raw, { read, seed, edits, onStage: (id, ms) => process.stdout.write(`  ${id.padEnd(8)} ${String(ms).padStart(6)} ms\n`) });
const out = resolve(process.cwd(), flag('--out', `worldbuild/out/${W.brief.id}-${W.seed}`));
mkdirSync(resolve(out, 'tiles'), { recursive: true });

// pictures
for (const st of STAGES) {
  if (st.id === 'edits') continue;
  const pic = drawLabels(stagePicture(W, st.id, { mpp }));
  writeFileSync(resolve(out, `stage-${st.n}-${st.id}.png`), encodePng(pic.w, pic.h, pic.rgba, { opaque: true }));
}
// map, towns, tiles
const map = toMapJson(W);
writeFileSync(resolve(out, 'map.json'), JSON.stringify(map));
writeFileSync(resolve(out, 'towns.json'), JSON.stringify(toTownsJson(W), null, 1));
let tileBytes = 0;
if (!args.includes('--no-tiles')) for (const [tx, tz] of tileList(W)) { const b = Buffer.from(writeTile(W, tx, tz)); tileBytes += b.length; writeFileSync(resolve(out, 'tiles', `${tx}_${tz}.bin`), b); }
// report
const report = { brief: W.brief.id, name: W.brief.name, seed: W.seed, fingerprint: W.fingerprint, ok: W.report.ok, stages: W.stages, totalMs: Date.now() - t0, numbers: W.numbers, checks: W.report.checks, leftovers: W.report.leftovers, edits: W.report.edits, unplaced: W.unplaced, files: { mapKB: Math.round(JSON.stringify(map).length / 1024), tiles: map.baked.tiles.length, tilesMB: Math.round(tileBytes / 1e5) / 10 } };
writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 1));
const N = W.numbers;
const lines = [
  `${W.brief.name} — seed ${W.seed} — ${report.ok ? 'every check passes' : 'SOME CHECKS FAIL'}`,
  `${N.sizeKm.join(' x ')} km, ${N.regions.length} regions, ${Object.entries(N.places).map(([k, v]) => `${v} ${k}${v === 1 ? '' : 's'}`).join(', ')}`,
  `roads ${N.roadKm.road} km, trails ${N.roadKm.trail} km (new: ${N.newRoadKm.road} + ${N.newRoadKm.trail} km), ${N.bridges} bridges, ${N.fords} fords, ${N.switchbacks} switchbacks`,
  `rivers ${N.rivers} + ${N.streams} streams (${N.riverKm} km), ${N.lakes} lakes; ${N.trees.toLocaleString('en')} trees (median ${N.medianTreeM} m, ${N.giants} giants), ${N.houses} houses, ${N.fields} fields`,
  '', 'Checks:',
  ...W.report.checks.map(c => `  ${c.pass ? 'ok  ' : 'FAIL'} ${c.title} — ${c.summary}${c.pass ? '' : '\n' + c.problems.slice(0, 12).map(p => `         at ${p.at.map(Math.round).join(', ')}: ${p.text}`).join('\n')}`),
  ...(W.report.leftovers.length ? ['', 'Hand fixes left over:', ...W.report.leftovers.map(l => `  ${l.text}`)] : []),
  '', 'Stages:', ...W.stages.map(s => `  ${s.label.padEnd(18)} ${s.ms} ms`), `  total ${report.totalMs} ms`,
  '', `Files: map.json ${report.files.mapKB} KB, ${report.files.tiles} tiles (${report.files.tilesMB} MB)`,
];
writeFileSync(resolve(out, 'report.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`\nwritten to ${out}`);
process.exit(report.ok ? 0 : 1);
