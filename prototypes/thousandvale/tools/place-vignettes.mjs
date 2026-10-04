#!/usr/bin/env node
// Stream E — place the M1 vignettes on a baked zone (PLAN §3.5) until stream B's bake does it.
//   node tools/place-vignettes.mjs [zone=test]    -> data/vignettes/placements/<zone>.json
// Same terrain + same recipes -> same file (seeded). Rules: every spot walkable and dry over the
// vignette's whole radius, biome in the vignette's tags, >= 160 m from the town centre, >= 70 m from
// the dungeon door, >= 140 m between vignettes, and inside the zone with a 60 m margin.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseTerrain } from '../js/rules/terrain-read.js';
import { findTown, findDoor } from '../js/sim/realm.js';

const zone = process.argv[2] || 'test';
const root = new URL('../', import.meta.url);
const t = parseTerrain(readFileSync(new URL(`data/zones/${zone}/terrain.bin`, root)));
const recipes = JSON.parse(readFileSync(new URL('data/vignettes/m1.json', root), 'utf8')).vignettes;
const town = findTown(t), door = findDoor(t, town);
export const RULES = { townGap: 160, doorGap: 70, spacing: 140, margin: 60 };

let s = 0x9e3779b9 ^ zone.length;
const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };

const dry = (x, z) => t.walkable(x, z) && t.waterAt(x, z).depth <= 0;
function fits(v, x, z) {
  if (x < t.bounds.minX + RULES.margin || z < t.bounds.minZ + RULES.margin || x > t.bounds.maxX - RULES.margin || z > t.bounds.maxZ - RULES.margin) return false;
  if (!v.tags.biomes.includes(t.biomes[t.biomeAt(x, z)].key)) return false;
  if (Math.hypot(x - town.x, z - town.z) < RULES.townGap || Math.hypot(x - door.x, z - door.z) < RULES.doorGap) return false;
  if (!dry(x, z)) return false;
  for (let a = 0; a < 8; a++) for (const f of [0.5, 1]) { const px = x + Math.cos(a * Math.PI / 4) * v.radius * f, pz = z + Math.sin(a * Math.PI / 4) * v.radius * f; if (!dry(px, pz) || t.slopeAt(px, pz) > 22) return false; }
  return true;
}

const out = [];
for (const v of recipes) {
  let best = null;
  for (let tries = 0; tries < 6000 && !best; tries++) {
    const x = t.bounds.minX + rnd() * t.extent, z = t.bounds.minZ + rnd() * t.extent;
    if (!fits(v, x, z)) continue;
    if (out.some(o => Math.hypot(o.x - x, o.z - z) < RULES.spacing)) continue;
    best = { x: Math.round(x), z: Math.round(z) };
  }
  if (!best) { console.error(`no spot for ${v.id}`); process.exitCode = 1; continue; }
  out.push({ id: v.id, type: 'vignette', name: v.name, x: best.x, z: best.z, yaw: +(rnd() * Math.PI * 2).toFixed(2), radius: v.radius, biome: t.biomes[t.biomeAt(best.x, best.z)].key, level: 1 });
}
const file = { _doc: `Stream E. Vignette placements for zone '${zone}' (absolute metres, zone coordinates). Made by tools/place-vignettes.mjs from data/vignettes/m1.json against data/zones/${zone}/terrain.bin (input ${t.meta.inputHash}); re-run after a re-bake. The recipe's relative coordinates are rotated by yaw around (x, z).`, zone, terrainHash: t.meta.inputHash, town: { x: town.x, z: town.z, r: town.r }, rules: RULES, placements: out };
writeFileSync(new URL(`data/vignettes/placements/${zone}.json`, root), JSON.stringify(file, null, 2) + '\n');
console.log(out.map(o => `${o.id} ${o.x},${o.z} ${o.biome}`).join('\n'));
