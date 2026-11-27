// World Build — measure the streamed fly view on a built world: opens the page in headless Chromium, builds the brief
// in its worker, flies to five spots (a pinned town, a new town, deep woods, mountains, high over the middle), waits
// until everything near has streamed in, and records draw calls, triangles, chunks by size, chunk and tile load times,
// trees drawn, memory. Also times reading the tile files build.mjs wrote (what a game client would fetch).
//
//   node worldbuild/tools/stream-bench.mjs [--brief oathwild-4k] [--seed 4242] [--quality medium] [--out worldbuild/docs/stream-bench.json]
//
// Needs the dev page server (8401). Run browser checks one at a time: flock /tmp/oathwild-browser.lock node …
// Headless Chromium draws with a software GPU, so frame rates here mean nothing; counts, sizes and load times do.

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTile } from '../js/export.js';
import { runPipeline } from '../js/pipeline.js';
import { chunk, tile, town } from '../js/serve.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const brief = flag('--brief', 'oathwild-4k'), seed = flag('--seed', '4242'), quality = flag('--quality', 'medium');
const out = resolve(process.cwd(), flag('--out', 'worldbuild/docs/stream-bench.json'));
const base = flag('--base', 'http://localhost:8401/');

// ---------------------------------------------------------------- tile files (what a game client would fetch)
let files = null;
const dir = resolve(ROOT, `worldbuild/out/${brief}-${seed}/tiles`);
if (existsSync(dir)) {
  const names = readdirSync(dir).filter(f => f.endsWith('.bin'));
  let bytes = 0, ms = 0, worst = 0;
  for (const f of names) {
    const buf = readFileSync(resolve(dir, f));
    bytes += buf.length;
    const t0 = performance.now();
    readTile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const d = performance.now() - t0; ms += d; worst = Math.max(worst, d);
  }
  files = { tiles: names.length, totalMB: Math.round(bytes / 1e5) / 10, avgKB: Math.round(bytes / names.length / 1024), decodeMsAvg: Math.round(ms / names.length * 100) / 100, decodeMsMax: Math.round(worst * 100) / 100 };
}

// ---------------------------------------------------------------- the server side (what a game server would pay per piece)
let server = null;
if (!args.includes('--no-server')) {
  const read = p => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
  const t0 = performance.now();
  const W = await runPipeline(read(`worldbuild/data/briefs/${brief}.json`), { read, seed: Number(seed) });
  const buildMs = Math.round(performance.now() - t0);
  const [sx, sz] = W.startAt, bySize = {};
  for (let size = 256; size <= 8192; size *= 2) {
    const ms = [], bytes = [];
    for (let k = 0; k < (size <= 1024 ? 12 : 4); k++) {
      const x0 = Math.floor((sx + (k % 4 - 2) * size) / size) * size, z0 = Math.floor((sz + (Math.floor(k / 4) - 1) * size) / size) * size;
      const a = performance.now(); const c = chunk(W, { x0, z0, size, step: size / 128 }); ms.push(performance.now() - a);
      bytes.push(c.heights.byteLength + c.water.byteLength + c.paint.byteLength);
    }
    bySize[size] = { msAvg: Math.round(ms.reduce((p, v) => p + v, 0) / ms.length * 10) / 10, msMax: Math.round(Math.max(...ms) * 10) / 10, KB: Math.round(bytes[0] / 1024) };
  }
  W._tiles = new Map();
  const tms = [];
  for (let k = 0; k < 30; k++) { const tx = Math.floor(sx / 256) + (k % 6) - 3, tz = Math.floor(sz / 256) + Math.floor(k / 6) - 2; const a = performance.now(); tile(W, tx, tz); tms.push(performance.now() - a); }
  const towns = W.placeOrder.filter(id => W.places[id].kind === 'town').slice(0, 6).map(id => { const a = performance.now(); const r = town(W, id); return { id, houses: r.plan.houses.length, ms: Math.round(performance.now() - a) }; });
  server = { buildMs, heapMB: Math.round(process.memoryUsage().rss / 1e6), chunk: bySize, tileMsAvg: Math.round(tms.reduce((p, v) => p + v, 0) / tms.length), tileMsMax: Math.round(Math.max(...tms)), towns };
}

// ---------------------------------------------------------------- the page
if (args.includes('--server-only')) {
  const result = { when: new Date().toISOString().slice(0, 10), brief, seed: Number(seed), files, server };
  console.log(JSON.stringify(result, null, 1));
  process.exit(0);
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--max-old-space-size=3000'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const t0 = Date.now();
await page.goto(`${base}worldbuild/?brief=${brief}&seed=${seed}&bench=1`);
await page.selectOption('#fly-quality', quality).catch(() => {});
await page.waitForFunction(() => window.worldbuild?.info, null, { timeout: 600000 });
const buildMs = Date.now() - t0;
await page.waitForFunction(() => window.__wbBench, null, { timeout: 900000 });
const bench = await page.evaluate(() => window.__wbBench);
const info = await page.evaluate(() => ({ stages: window.worldbuild.info.stages, ok: window.worldbuild.info.report.ok }));
// (the picture is a nicety: a software GPU may be too busy to take it in time)
await page.screenshot({ path: resolve(ROOT, 'worldbuild/docs/fly-bench-last.png'), timeout: 90000 }).catch(e => errors.push('screenshot: ' + e.message.split('\n')[0]));
await browser.close();

const result = { when: new Date().toISOString().slice(0, 10), brief, seed: Number(seed), quality, pageBuildMs: buildMs, stagesInBrowser: info.stages, checksPass: info.ok, files, server, spots: bench.spots, errors: errors.slice(0, 10) };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 1));
const row = s => `${s.name.padEnd(28)} ${String(s.drawCalls).padStart(5)} draws ${String(Math.round(s.triangles / 1000)).padStart(6)}k tris  chunks ${String(s.chunksDrawn).padStart(3)} (${s.chunkMB} MB kept)  chunk ${s.chunkMs.avg}/${s.chunkMs.max} ms  tile ${s.tileMs.avg}/${s.tileMs.max} ms  trees ${s.trees}  heap ${s.heapMB} MB  settle ${s.settleMs} ms`;
console.log(`built in the page in ${Math.round(buildMs / 1000)} s; checks ${info.ok ? 'pass' : 'FAIL'}`);
if (server) console.log(`server: built in ${Math.round(server.buildMs / 1000)} s (${server.heapMB} MB); chunk ms by size ${Object.entries(server.chunk).map(([k, v]) => `${k} m ${v.msAvg} (${v.KB} KB)`).join(', ')}; a tile's trees ${server.tileMsAvg} ms (worst ${server.tileMsMax}); towns ${server.towns.map(t => `${t.id} ${t.ms} ms`).join(', ')}`);
if (files) console.log(`tile files: ${files.tiles} × ${files.avgKB} KB (${files.totalMB} MB), decode ${files.decodeMsAvg} ms avg / ${files.decodeMsMax} ms worst`);
for (const s of bench.spots) console.log(row(s));
if (errors.length) console.log('page errors:\n  ' + errors.slice(0, 10).join('\n  '));
console.log(`written ${out}`);
