// Thousandvale — zone fingerprints for the SAMENESS test (stream B, PLAN §16 "sameness fingerprint between
// neighbours", roast §1: two neighbouring zones must not read as the same place).
//
// A fingerprint is what a player would notice crossing the border, measured from the bake and E's sheet:
//   ground   biome shares (World Forge biomes + painted road), relief (p5..p95 height), median slope,
//            share too steep to walk, wet share, river count
//   cover    scatter per km² by kind (trees / bushes / rocks / reeds …)
//   people   settlements by kind, buildings, road share
//   design   E's archetype, hook and dungeon family (data/provinces/<sheet>.json)
// `distance(a, b)` folds the measured parts into one number (0 = identical) and `differences(a, b)` lists
// which noticeable things differ — the test asks for both.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTerrain, parseScatter, SCATTER_KINDS } from '../../js/rules/terrain-read.js';

const ROOT = new URL('../../', import.meta.url);

export function fingerprint(id, sheetZone, sheetRow) {
  const dir = new URL(`data/zones/${id}/`, ROOT);
  const t = parseTerrain(readFileSync(new URL('terrain.bin', dir)));
  const sc = existsSync(new URL('scatter.bin', dir)) ? parseScatter(readFileSync(new URL('scatter.bin', dir))) : null;
  const pl = existsSync(new URL('placements.json', dir)) ? JSON.parse(readFileSync(new URL('placements.json', dir), 'utf8')).placements : [];
  const { height, biome, waterKind } = t.layers, S = t.size, N = S * S;
  const biomes = {};
  for (let k = 0; k < N; k++) { const key = t.biomes[biome[k]].key; biomes[key] = (biomes[key] || 0) + 1; }
  for (const k in biomes) biomes[k] /= N;
  const hs = [], slopes = [];
  let wet = 0, steep = 0;
  for (let j = 4; j < S; j += 8) for (let i = 4; i < S; i += 8) {
    const x = i * t.step + 0.5, z = j * t.step + 0.5;
    hs.push(t.heightAt(x, z)); const s = t.slopeAt(x, z); slopes.push(s); if (s > 46) steep++;
    if (waterKind[j * S + i]) wet++;
  }
  hs.sort((a, b) => a - b); slopes.sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const km2 = (S - 1) * t.step * (S - 1) * t.step / 1e6;
  const cover = {};
  if (sc) for (let k = 0; k < sc.count; k++) { const key = SCATTER_KINDS[sc.kind[k]].key; cover[key] = (cover[key] || 0) + 1 / km2; }
  const settlements = t.meta.sites.filter(s => s.type === 'settlement');
  return {
    id, sheetZone,
    biomes, relief: q(hs, 0.95) - q(hs, 0.05), meanHeight: hs.reduce((a, b) => a + b, 0) / hs.length,
    slope: q(slopes, 0.5), steepShare: steep / slopes.length, wetShare: wet / slopes.length, rivers: (t.meta.rivers || []).length,
    cover, scatterPerKm2: sc ? sc.count / km2 : 0,
    settlements: settlements.map(s => s.kind).sort(), buildings: pl.filter(p => p.kind === 'building').length,
    roads: pl.filter(p => p.kind === 'road').length,
    archetype: sheetRow?.archetype || null, hook: sheetRow?.hook || null, dungeon: sheetRow?.dungeon?.family || null,
  };
}

/** One number: 0 = the same place. Each term is scaled so ~1 is "clearly different" for that measure. */
export function distance(a, b) {
  const keys = new Set([...Object.keys(a.biomes), ...Object.keys(b.biomes)]);
  let biome = 0; for (const k of keys) biome += Math.abs((a.biomes[k] || 0) - (b.biomes[k] || 0));
  biome /= 2;                                                     // 0..1 (total variation)
  const ck = new Set([...Object.keys(a.cover), ...Object.keys(b.cover)]);
  let cover = 0, ct = 0; for (const k of ck) { cover += Math.abs((a.cover[k] || 0) - (b.cover[k] || 0)); ct += (a.cover[k] || 0) + (b.cover[k] || 0); }
  cover = ct ? cover / ct : 0;                                    // 0..1
  const rel = Math.abs(Math.log((a.relief + 20) / (b.relief + 20)));
  const slope = Math.abs(a.slope - b.slope) / 6;
  const wet = Math.abs(a.wetShare - b.wetShare) * 10;
  const people = Math.abs(a.settlements.length - b.settlements.length) * 0.5 + Math.abs(a.buildings - b.buildings) / 30;
  return +(biome * 3 + cover * 2 + rel * 2 + slope + wet + people).toFixed(3);
}

/** The noticeable differences, as words (a neighbour must differ in at least two). */
export function differences(a, b) {
  const out = [];
  const top = f => Object.entries(f.biomes).filter(([k]) => k !== 'road').sort((x, y) => y[1] - x[1])[0]?.[0];
  if (top(a) !== top(b)) out.push('main biome');
  if (Math.abs(Math.log((a.relief + 20) / (b.relief + 20))) > 0.35) out.push('relief');
  if (Math.abs(a.scatterPerKm2 - b.scatterPerKm2) / Math.max(1, a.scatterPerKm2, b.scatterPerKm2) > 0.25) out.push('cover density');
  if (Math.abs(a.wetShare - b.wetShare) > 0.03 || Math.sign(a.rivers) !== Math.sign(b.rivers)) out.push('water');
  if (a.settlements.join() !== b.settlements.join()) out.push('settlements');
  if (a.archetype && b.archetype && a.archetype !== b.archetype) out.push('archetype');
  if (a.hook && b.hook && a.hook !== b.hook) out.push('hook');
  if (a.dungeon && b.dungeon && a.dungeon !== b.dungeon) out.push('dungeon family');
  return out;
}

/** Every zone of a province sheet with its fingerprint and grid neighbours. */
export function provinceFingerprints(sheet = 'torbor_downs') {
  const map = JSON.parse(readFileSync(new URL('data/world/province-map.json', ROOT), 'utf8')).provinces[sheet];
  const sheetFile = new URL(`data/provinces/${sheet}.json`, ROOT);
  const rows = existsSync(sheetFile) ? JSON.parse(readFileSync(sheetFile, 'utf8')).zones : {};
  const fps = Object.entries(map.map).filter(([, id]) => existsSync(new URL(`data/zones/${id}/terrain.bin`, ROOT))).map(([sz, id]) => fingerprint(id, sz, rows[sz]));
  const byId = new Map(fps.map(f => [f.id, f]));
  const pairs = [];
  for (const f of fps) {
    const zx = +f.id.slice(1, 3), zy = +f.id.slice(4, 6);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const n = byId.get(`z${String(zx + dx).padStart(2, '0')}_${String(zy + dy).padStart(2, '0')}`);
      if (n) pairs.push({ a: f, b: n, distance: distance(f, n), differences: differences(f, n) });
    }
  }
  return { fps, pairs };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { fps, pairs } = provinceFingerprints(process.argv[2] || 'torbor_downs');
  for (const f of fps) console.log(`${f.id} ${String(f.sheetZone).padEnd(18)} ${String(f.archetype).padEnd(10)} relief ${f.relief.toFixed(0).padStart(4)} slope ${f.slope.toFixed(1).padStart(4)} wet ${(f.wetShare * 100).toFixed(1).padStart(4)}% scatter/km² ${f.scatterPerKm2.toFixed(0).padStart(5)} towns ${f.settlements.join('+') || '-'} top ${Object.entries(f.biomes).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, v]) => k + ' ' + (v * 100).toFixed(0) + '%').join(', ')}`);
  for (const p of pairs.sort((x, y) => x.distance - y.distance)) console.log(`${p.a.id}-${p.b.id} d=${p.distance.toFixed(2)} differ: ${p.differences.join(', ')}`);
}
