// World Build — stage 1, the brief: read a brief file, fill in the defaults, check it, and load the pinned hand-made
// piece's files. Pure apart from the `read` function the caller passes (Node: readFileSync from the playground folder;
// the page: fetch from the playground root), so the same brief gives the same normalised object everywhere.
//
//   const B = await loadBrief(raw, read)      raw = the parsed brief JSON; read(path) → parsed JSON (path from the
//                                             playground folder, e.g. 'prototypes/oathwild/data/map.json')
//   B = normaliseBrief(raw)                   the same without loading pin files (tests, the picture of the brief)
//
// A brief that cannot work throws an Error whose message says, in plain words, which line is wrong.

import { THEMES, RELIEF, TOWN_SIZE, LANDMARKS } from './themes.js';

const DEFAULT_LIMITS = { maxSlope: 38, bankSlope: 50, bankBand: 0.8, roadMaxGrade: 0.14, wadeDepth: 0.7 };

export function normaliseBrief(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('The brief is empty.');
  const b = JSON.parse(JSON.stringify(raw));
  const fail = msg => { throw new Error(`Brief "${b.id || '?'}": ${msg}`); };
  b.id = b.id || 'world';
  b.name = b.name || b.id;
  b.seed = Number.isFinite(b.seed) ? b.seed >>> 0 : 1;
  const S = b.size = { cell: 2, margin: 40, ...(b.size || {}) };
  if (!S.bounds) fail('size.bounds is missing ({ minX, maxX, minZ, maxZ } in metres).');
  const { minX, maxX, minZ, maxZ } = S.bounds;
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || maxX <= minX || maxZ <= minZ) fail('size.bounds must be four numbers with max > min.');
  if (S.cell !== 2) fail('size.cell must be 2 (Oathwild walks a 2 m height grid).');
  for (const v of [minX, maxX, minZ, maxZ]) if (v % S.cell) fail(`size.bounds ${v} is not on the ${S.cell} m grid.`);
  if ((maxX - minX) > 8192 || (maxZ - minZ) > 8192) fail('the world may be at most 8 x 8 km.');
  b.width = maxX - minX; b.depth = maxZ - minZ;
  b.limits = { ...DEFAULT_LIMITS, ...(b.limits || {}) };
  b.relief = { base: 14, roll: 20, detail: 1.4, ...(b.relief || {}) };
  b.sea = b.sea ? { edges: [], from: 300, shelf: 160, depth: 15, wobble: 120, ...b.sea } : { edges: [], from: 0, shelf: 1, depth: 0, wobble: 0 };
  for (const e of b.sea.edges) if (!['north', 'south', 'east', 'west'].includes(e)) fail(`sea edge "${e}" is not north / south / east / west.`);
  b.ranges = (b.ranges || []).map((r, i) => {
    if (!Array.isArray(r.points) || r.points.length < 2) fail(`range ${r.id || i} needs at least two points.`);
    return { id: r.id || `range${i + 1}`, name: r.name || `Range ${i + 1}`, height: 200, width: 300, sharpness: 0.6, passes: [], ...r };
  });
  b.lakes = (b.lakes || []).map((l, i) => ({ id: l.id || `lake${i + 1}`, name: l.name || `Lake ${i + 1}`, radius: 120, depth: 5, ...l }));
  const lakeIds = new Set(b.lakes.map(l => l.id));
  b.rivers = (b.rivers || []).map((r, i) => {
    const out = { id: r.id || `river${i + 1}`, name: r.name || `River ${i + 1}`, width: 10, depth: 2, ...r };
    for (const end of [out.from, out.to]) {
      if (Array.isArray(end)) continue;
      if (end === 'sea') { if (!b.sea.edges.length) fail(`river ${out.id} runs to the sea, but the brief has no sea.`); continue; }
      if (typeof end === 'string' && end.startsWith('lake:')) { if (!lakeIds.has(end.slice(5))) fail(`river ${out.id}: no lake "${end.slice(5)}".`); continue; }
      if (typeof end === 'string' && end.startsWith('pin:')) { if (!b.pin) fail(`river ${out.id} joins a pinned river, but nothing is pinned.`); continue; }
      fail(`river ${out.id}: "${end}" is not a spot [x, z], "sea", "lake:<id>" or "pin:<river>".`);
    }
    return out;
  });
  b.streams = { catchment: 0.6, max: 20, minLength: 240, width: [4, 8], ...(b.streams || {}) };
  if (!Array.isArray(b.regions) || !b.regions.length) fail('it needs at least one region.');
  const ids = new Set();
  b.regions = b.regions.map((r, i) => {
    const out = { weight: 1, towns: 1, camps: 2, dungeons: 1, shrines: 1, landmarks: 1, fields: 2, ...r };
    out.id = out.id || `region${i + 1}`;
    if (ids.has(out.id)) fail(`two regions are called "${out.id}".`);
    ids.add(out.id);
    out.name = out.name || out.id;
    if (!THEMES[out.theme]) fail(`region ${out.id}: theme "${out.theme}" is not one of ${Object.keys(THEMES).join(', ')}.`);
    if (!Array.isArray(out.at) || out.at.length !== 2) fail(`region ${out.id} needs "at": [x, z] (roughly its middle).`);
    if (!Array.isArray(out.levels) || out.levels.length !== 2 || out.levels[0] > out.levels[1]) fail(`region ${out.id} needs "levels": [lowest, highest].`);
    // counts may be a number or a list of wishes; turn both into lists
    const list = (v, kind) => (Array.isArray(v) ? v : Array.from({ length: v | 0 }, () => ({}))).map(x => ({ kind, ...x }));
    out.towns = list(out.towns, 'town').map(t => ({ size: 'village', ...t }));
    for (const t of out.towns) if (!TOWN_SIZE[t.size]) fail(`region ${out.id}: town size "${t.size}" is not town / village / hamlet.`);
    out.camps = list(out.camps, 'camp');
    out.dungeons = list(out.dungeons, 'dungeon');
    out.shrines = list(out.shrines, 'shrine');
    out.landmarks = list(out.landmarks, 'landmark').map(l => ({ ...l, kind: 'landmark', type: l.kind === 'landmark' ? (l.type || 'ruin') : (l.type || l.kind) }));
    for (const l of out.landmarks) if (!LANDMARKS[l.type]) fail(`region ${out.id}: landmark "${l.type}" is not one of ${Object.keys(LANDMARKS).join(', ')}.`);
    out.relief = out.relief || THEMES[out.theme].relief;
    if (!RELIEF[out.relief]) fail(`region ${out.id}: relief "${out.relief}" is not one of ${Object.keys(RELIEF).join(', ')}.`);
    return out;
  });
  if (b.pin) {
    const p = b.pin = { at: [0, 0], keep: 'play', seam: 240, gates: [], rivers: [], ...b.pin };
    if (!p.map) fail('pin.map is missing (the hand-made map.json, from the playground folder).');
    if (p.at.some(v => v % S.cell)) fail(`pin.at must sit on the ${S.cell} m grid.`);
    for (const g of p.gates) if (!g.id || !g.road || !Array.isArray(g.edge)) fail(`pin gate ${g.id || '?'} needs id, road (a pinned road id) and edge [x, z].`);
  }
  b.start = b.start || null;
  return b;
}

/** Normalise + load the pinned piece's files (map, towns, placements) through `read(path)`. */
export async function loadBrief(raw, read) {
  const b = normaliseBrief(raw);
  if (b.pin) {
    b.pin.data = {
      map: await read(b.pin.map),
      towns: b.pin.towns ? await read(b.pin.towns) : {},
      placements: b.pin.placements ? await read(b.pin.placements) : null,
      // the pinned map's own edit layer (optional: a missing file is no edits)
      edits: b.pin.edits ? await Promise.resolve().then(() => read(b.pin.edits)).catch(() => null) : null,
    };
  }
  return b;
}

/** One line per brief item, for the page's Brief card and the report. */
export function describeBrief(b) {
  const lines = [`${b.name}: ${(b.width / 1000).toFixed(1)} x ${(b.depth / 1000).toFixed(1)} km, seed ${b.seed}`];
  if (b.pin) lines.push(`Pinned: ${b.pin.name || b.pin.map} at ${b.pin.at.join(', ')}, ${b.pin.gates.length} roads out, ${b.pin.rivers.length} river joins`);
  for (const r of b.regions) lines.push(`${r.name} — ${THEMES[r.theme].label.toLowerCase()}, levels ${r.levels[0]}-${r.levels[1]}, ${r.towns.length} towns, ${r.camps.length} camps, ${r.dungeons.length} dungeons`);
  if (b.ranges.length) lines.push(`Mountains: ${b.ranges.map(r => r.name).join(', ')}`);
  if (b.rivers.length) lines.push(`Rivers: ${[...new Set(b.rivers.map(r => r.name))].join(', ')}`);
  if (b.lakes.length) lines.push(`Lakes: ${b.lakes.map(l => l.name).join(', ')}`);
  if (b.sea.edges.length) lines.push(`Sea: ${b.sea.edges.join(' and ')} edge`);
  return lines;
}
