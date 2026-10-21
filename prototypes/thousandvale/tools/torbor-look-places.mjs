#!/usr/bin/env node
// Pick the places tests/W/torbor-regen.spec.js looks at (play-test 12, #81): for every Torbor Downs biome one open spot
// deep inside it (150 m+ from a town, gentle ground, the same biome all round), Torborhold's edge, and three coasts (a
// shingle shore with the sea in front). Writes tests/W/fixtures/torbor-look-places.json. Re-run after a re-bake.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseTerrain } from '../js/rules/terrain-read.js';
const ROOT = new URL('../', import.meta.url), J = f => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8'));
const ZONES = Object.values(J('data/world/province-map.json').provinces.torbor_downs.map);
const best = {}, coasts = [];
let town = null;
for (const z of ZONES) {
  const t = parseTerrain(readFileSync(new URL(`data/zones/${z}/terrain.bin`, ROOT))), ox = +z.slice(1, 3) * 2048, oz = +z.slice(4, 6) * 2048;
  const towns = J(`data/zones/${z}/placements.json`).placements.filter(p => p.kind === 'settlement');
  const tw = towns.find(p => p.data.name === 'Torborhold'); if (tw) town = { key: 'torborhold', x: ox + tw.x + tw.data.radius + 30, z: oz + tw.z, eye: [14, 5, 4], biome: 'start town' };
  const key = (x, y) => t.biomes[t.biomeAt(x, y)].key, names = t.meta.biomeNames || {};
  for (let y = 120; y < 1930; y += 40) for (let x = 120; x < 1930; x += 40) {
    if (t.waterAt(x, y).kind !== 'none' || t.slopeAt(x, y) > 18) continue;
    if (towns.some(p => Math.hypot(p.x - x, p.z - y) < (p.data.radius || 50) + 150)) continue;
    const k = key(x, y), nm = names[k]; if (!nm || k === 'beach' || k === 'mountains') continue;
    let same = 0; for (let a = 0; a < 16; a++) for (const r of [20, 45]) if (key(x + Math.cos(a * 0.39) * r, y + Math.sin(a * 0.39) * r) === k) same++;
    const sc = same + (z === 'z12_02' ? 2 : 0);
    if (!best[k] || sc > best[k].sc) best[k] = { key: k, biome: nm, x: ox + x, z: oz + y, eye: [9, 4.2, 9], sc, zone: z };
  }
  // coasts: shingle with the sea within 70 m, looked at from the land
  for (let y = 60; y < 1990; y += 30) for (let x = 60; x < 1990; x += 30) {
    if (key(x, y) !== 'beach' || t.waterAt(x, y).kind !== 'none') continue;
    let sx = 0, sz = 0, n = 0; for (let a = 0; a < 16; a++) { const dx = Math.cos(a * 0.39) * 60, dz = Math.sin(a * 0.39) * 60; if (t.waterAt(x + dx, y + dz).kind === 'sea') { sx += dx; sz += dz; n++; } }
    if (n < 3 || n > 10) continue;
    const L = Math.hypot(sx, sz) || 1;
    coasts.push({ key: 'coast', biome: 'Shingle Shore', x: ox + x, z: oz + y, eye: [-sx / L * 12, 5, -sz / L * 12], zone: z });
  }
}
// three coasts far apart (north, east, south-east)
const pick = [];
for (const want of [[27000, 2300], [30500, 5600], [29500, 10000]]) { const c = coasts.slice().sort((a, b) => Math.hypot(a.x - want[0], a.z - want[1]) - Math.hypot(b.x - want[0], b.z - want[1]))[0]; if (c) pick.push({ ...c, key: 'coast-' + c.zone }); }
const places = [town, ...Object.values(best).map(({ sc, ...p }) => p), ...pick].filter(Boolean).map(p => ({ ...p, x: Math.round(p.x), z: Math.round(p.z), eye: p.eye.map(v => +v.toFixed(2)) }));
writeFileSync(new URL('tests/W/fixtures/torbor-look-places.json', ROOT), JSON.stringify({ _doc: 'tools/torbor-look-places.mjs (play-test 12, #81): one place per Torbor Downs biome, Torborhold and three coasts. World metres; eye = camera offset from the spot, looking back past it.', places }, null, 1) + '\n');
console.log(places.map(p => `${p.key} ${p.biome} ${p.x},${p.z} ${p.zone || ''}`).join('\n'));
