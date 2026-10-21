#!/usr/bin/env node
// Thousandvale — terrain measurements per zone (play-test 12, #81 Torbor regen): height range, slope distribution,
// relief inside a 200 m window, biome share, wet/unwalkable share, scatter count and file sizes.
//   node tools/measure-terrain.mjs z12_02 z12_09 …      |  --province torbor_downs  |  --json out.json  |  --dir <zones dir>
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTerrain, parseScatter } from '../js/rules/terrain-read.js';
const HERE = dirname(fileURLToPath(import.meta.url)), DI = process.argv.indexOf('--dir'), ZD = DI > 0 ? process.argv[DI + 1] : join(HERE, '..', 'data', 'zones');
const PM = JSON.parse(readFileSync(join(HERE, '..', 'data', 'world', 'province-map.json'), 'utf8')).provinces;
export function measureZone(id) {
  const dir = join(ZD, id), t = parseTerrain(readFileSync(join(dir, 'terrain.bin')));
  const names = (() => { try { return JSON.parse(readFileSync(join(dir, 'zone.json'), 'utf8')).biomeNames || {}; } catch { return {}; } })();
  const hs = [], slopes = [], bio = {}; let n = 0, wet = 0, sea = 0, unwalk = 0;
  for (let z = 4; z < 2044; z += 8) for (let x = 4; x < 2044; x += 8) {
    n++; const w = t.waterAt(x, z);
    if (w.kind !== 'none') { wet++; if (w.kind === 'sea') sea++; }
    if (w.kind === 'none' && t.slopeAt(x, z) > 46) unwalk++;
    if (w.kind !== 'none') continue;
    hs.push(t.groundAt(x, z)); slopes.push(t.slopeAt(x, z));
    const b = t.biomes[t.biomeAt ? t.biomeAt(x, z) : 0];
    const key = t.biomeKeyAt ? t.biomeKeyAt(x, z) : null;
    const k = key || (b && b.key) || '?'; bio[k] = (bio[k] || 0) + 1;
  }
  // local relief: max-min in 200 m windows (land only)
  const rel = [];
  for (let z = 100; z < 2048; z += 200) for (let x = 100; x < 2048; x += 200) {
    let lo = Infinity, hi = -Infinity; for (let dz = -100; dz <= 100; dz += 20) for (let dx = -100; dx <= 100; dx += 20) { const xx = Math.min(2047, Math.max(0, x + dx)), zz = Math.min(2047, Math.max(0, z + dz)); if (t.waterAt(xx, zz).kind !== 'none') continue; const h = t.groundAt(xx, zz); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (hi > lo) rel.push(hi - lo);
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : null; };
  const land = hs.length || 1;
  const biomes = Object.fromEntries(Object.entries(bio).sort((a, b) => b[1] - a[1]).map(([k, v]) => [names[k] ? `${k}(${names[k]})` : k, +(v / land).toFixed(3)]));
  let scatter = 0; try { scatter = parseScatter(readFileSync(join(dir, 'scatter.bin'))).count ?? parseScatter(readFileSync(join(dir, 'scatter.bin'))).items?.length; } catch {}
  const size = f => { try { return statSync(join(dir, f)).size; } catch { return 0; } };
  return { zone: id, h: { min: q(hs, 0), p10: q(hs, 0.1), p50: q(hs, 0.5), p90: q(hs, 0.9), max: q(hs, 0.999) },
    slope: { p50: q(slopes, 0.5), p90: q(slopes, 0.9), p99: q(slopes, 0.99), over15: +(slopes.filter(s => s > 15).length / land).toFixed(3), over30: +(slopes.filter(s => s > 30).length / land).toFixed(3), under5: +(slopes.filter(s => s < 5).length / land).toFixed(3) },
    relief200: { p50: q(rel, 0.5), p90: q(rel, 0.9) }, wet: +(wet / n).toFixed(3), sea: +(sea / n).toFixed(3), steepLand: +(unwalk / Math.max(1, n - wet)).toFixed(3),
    topBiome: +(Math.max(...Object.values(bio)) / land).toFixed(3), biomeCount: Object.values(bio).filter(v => v / land > 0.05).length, biomes, scatter,
    bytes: { terrain: size('terrain.bin'), nav: size('nav.bin'), scatter: size('scatter.bin'), placements: size('placements.json') } };
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const pi = process.argv.indexOf('--province'), ji = process.argv.indexOf('--json');
  const ids = pi > 0 ? Object.values(PM[process.argv[pi + 1]].map) : process.argv.slice(2).filter(a => /^z\d\d_\d\d$/.test(a));
  const out = ids.map(measureZone);
  for (const m of out) console.log(`${m.zone} h ${m.h.min}..${m.h.max} (p50 ${m.h.p50}) slope p50 ${m.slope.p50} p90 ${m.slope.p90} >15° ${m.slope.over15} <5° ${m.slope.under5} relief200 p50 ${m.relief200.p50} p90 ${m.relief200.p90} sea ${m.sea} steep>46° ${m.steepLand} top-biome ${m.topBiome} n>5% ${m.biomeCount} ${JSON.stringify(m.biomes).slice(0, 160)} scatter ${m.scatter} terrain ${(m.bytes.terrain / 1024) | 0}K`);
  if (ji > 0) writeFileSync(process.argv[ji + 1], JSON.stringify(out, null, 1));
}
