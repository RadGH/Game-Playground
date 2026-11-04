// Biome table for the macro map. PURE. One row per biome: the id is the byte stored in macro.biome.
// `color` is what the globe / region view paints; the cell recipe (`ground`, `trees`, …) is what
// js/planet/chunkgen.js turns into real cells when a chunk is generated.
//
// Owner (2026-11-03): temperate + strange biomes only, ice caps at the poles. No deserts, no jungle.

export const BIOMES = [
  { id: 0,  key: 'deep',     name: 'Deep sea',        color: '#1d3b66', water: 2 },
  { id: 1,  key: 'sea',      name: 'Sea',             color: '#2c5a8c', water: 1 },
  { id: 2,  key: 'beach',    name: 'Shore',           color: '#d7c48a', ground: ['sand', 0.85, 'gravel', 0.15] },
  { id: 3,  key: 'grass',    name: 'Grassland',       color: '#6aa046', ground: ['grass', 0.75, 'meadow', 0.25], trees: 0.015, bush: 0.01, boulder: 0.002 },
  { id: 4,  key: 'meadow',   name: 'Meadow',          color: '#86b24a', ground: ['meadow', 0.6, 'grass', 0.4], trees: 0.006, flowers: 0.04 },
  { id: 5,  key: 'forest',   name: 'Forest',          color: '#3f7a34', ground: ['grass', 0.7, 'dirt', 0.3], trees: 0.16, bush: 0.03, kinds: ['tree', 0.8, 'pine', 0.2] },
  { id: 6,  key: 'deepwood', name: 'Old forest',      color: '#2b5d2c', ground: ['dirt', 0.5, 'grass', 0.5], trees: 0.3, bush: 0.04, kinds: ['tree', 0.55, 'pine', 0.45], mushroom: 0.004 },
  { id: 7,  key: 'hills',    name: 'Hills',           color: '#8a9a5a', ground: ['grass', 0.6, 'rock', 0.2, 'gravel', 0.2], trees: 0.03, boulder: 0.012, kinds: ['pine', 0.7, 'tree', 0.3], rocky: true },
  { id: 8,  key: 'mountain', name: 'Mountains',       color: '#7f7a74', ground: ['rock', 0.7, 'gravel', 0.3], trees: 0.012, boulder: 0.03, kinds: ['pine', 1], rocky: true },
  { id: 9,  key: 'peak',     name: 'Snow peaks',      color: '#e3e8ec', ground: ['snow', 0.7, 'rock', 0.3], boulder: 0.02, rocky: true },
  { id: 10, key: 'ice',      name: 'Ice cap',         color: '#eef4fa', ground: ['seaice', 1], polar: true },
  { id: 11, key: 'marsh',    name: 'River marsh',     color: '#4f6e45', ground: ['marsh', 0.5, 'mud', 0.2, 'grass', 0.3], trees: 0.03, kinds: ['tree', 0.6, 'deadtree', 0.4], tallgrass: 0.06 },
  { id: 12, key: 'volcanic', name: 'Volcanic waste',  color: '#3c3230', ground: ['basalt', 0.55, 'ashfloor', 0.35, 'rock', 0.1], trees: 0.004, kinds: ['deadtree', 1], boulder: 0.02, vents: 0.0004, lava: true, strange: true, rocky: true },
  { id: 13, key: 'moor',     name: 'Haunted moor',    color: '#55584a', ground: ['moorgrass', 0.7, 'mud', 0.15, 'marsh', 0.15], trees: 0.01, kinds: ['deadtree', 1], graves: 0.0015, strange: true },
  { id: 14, key: 'crystal',  name: 'Crystal field',   color: '#7a62b0', ground: ['crystalfloor', 0.45, 'grass', 0.35, 'rock', 0.2], trees: 0.01, crystals: 0.02, strange: true, rocky: true },
  { id: 15, key: 'ruins',    name: 'Ancient ruins',   color: '#9a8f72', ground: ['grass', 0.5, 'ruinfloor', 0.3, 'dirt', 0.2], trees: 0.02, ruins: true, strange: true },
  { id: 16, key: 'lake',     name: 'Lake',            color: '#3a6e9e', water: 1 },
];

export const BIOME = Object.fromEntries(BIOMES.map(b => [b.key, b.id]));

/** '#rrggbb' → [r, g, b] */
export function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
export const BIOME_RGB = BIOMES.map(b => rgb(b.color));
