// Tree Kit — measure the drawn trees so a game's colliders are the trunks it draws (lessons rule 22).
//
//   measureKinds(data, game = 'oathwild') → { 'oak-a': { trunk, crown, drawnHeight }, … }
//   applyMeasure(data, game)              writes trunk / crown into data[game].trees (what scatter.js reads)
//
// trunk = the drawn trunk's mean radius 1 m above the ground (where a walker meets it), crown = the drawn canopy's
// radius (a dead tree: how far its bare limbs reach), both in metres at the kind's height (scale 1). The tree is built
// the way the game builds its first look (seed 11, middle detail, with tufts); tests/measure.test.mjs checks the other
// looks and detail levels stay within a few per cent.
import { buildStoryTree, trunkRadiusAt } from './build.js';

export const MEASURE_SEED = 11, MEASURE_LOD = 1, BODY_Y = 1;
const STUB_ATLAS = { cell: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };
const r2 = v => Math.round(v * 100) / 100;

/** One tree kind at `h` metres: its trunk at body height and its crown, in metres. */
export function measureTree(species, h, { seed = MEASURE_SEED, lod = MEASURE_LOD } = {}) {
  const t = buildStoryTree('measure', { seed, lod, tufts: STUB_ATLAS, species });
  const k = h / t.height;
  const trunk = trunkRadiusAt(t.plan, BODY_Y / k) * k;
  let crown;
  if (t.plan.canopy) crown = t.plan.canopy.R * k;
  else {   // a dead tree: its limbs' reach (bark vertices above head height)
    const p = t.bark.getAttribute('position').array; let m = 0;
    for (let i = 0; i < p.length; i += 3) if (p[i + 1] * k > 4) m = Math.max(m, Math.hypot(p[i], p[i + 2]));
    crown = m * k;
  }
  return { trunk: r2(trunk), crown: r2(crown), drawnHeight: t.height, k };
}

export function measureKinds(data, game = 'oathwild') {
  const out = {};
  for (const [id, row] of Object.entries(data[game]?.trees || {})) {
    const sp = data.species[row.tree];
    if (!sp) throw new Error(`treekit: ${game} kind ${id} names a tree "${row.tree}" that species.json does not have`);
    out[id] = measureTree(sp, row.height);
  }
  return out;
}

/** Write the measured trunk / crown into the game's kinds. Returns the list of changes ([id, field, old, new]). */
export function applyMeasure(data, game = 'oathwild') {
  const m = measureKinds(data, game), changes = [];
  for (const [id, v] of Object.entries(m)) {
    const row = data[game].trees[id];
    for (const f of ['trunk', 'crown']) if (row[f] !== v[f]) { changes.push([id, f, row[f], v[f]]); row[f] = v[f]; }
  }
  return changes;
}
