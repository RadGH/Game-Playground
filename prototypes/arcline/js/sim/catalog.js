// The catalog (data/catalog.json) loaded once: lookups by id, the zone growth tables, unlock checks.
let C = null;
export function useCatalog(json) { C = json; C.byId = Object.fromEntries(C.build.map(b => [b.id, b])); C.roadById = Object.fromEntries(C.roads.map((r, i) => [r.id, { ...r, level: i + 1 }])); return C; }
export function cat() { if (!C) throw new Error('catalog not loaded'); return C; }
export function item(id) { return cat().byId[id]; }
export function roadKind(level) { return cat().roads[level - 1]; }
export function unlocked(region, entry) { return (entry.unlock ?? 0) <= region.milestone; }
/** Materials an entry costs besides credits: { steel: 20, … } */
export function materials(entry) { const m = {}; for (const k of ['metal', 'stone', 'crystal', 'steel', 'concrete', 'cells']) if (entry[k]) m[k] = entry[k]; return m; }
