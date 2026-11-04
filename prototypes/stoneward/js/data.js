// Game data loading, shared by the page, the worker and node tests. buildings.json may list
// `extras`: more files whose goods / kinds / vehicles are merged in. A feature that adds buildings
// (walls, towers, trains…) puts them in its OWN file and adds one line to `extras`, so two features
// never edit the same rows.

export function mergeBuildings(base, extras) {
  const out = JSON.parse(JSON.stringify(base));
  for (const x of extras) {
    for (const key of ['goods', 'kinds', 'vehicles']) if (x[key]) out[key] = { ...(out[key] || {}), ...x[key] };
    for (const [k, v] of Object.entries(x)) if (!['goods', 'kinds', 'vehicles', '_doc'].includes(k) && out[k] === undefined) out[k] = v;
  }
  return out;
}

/** read(path) → parsed JSON (fetch on the page, readFileSync in node). */
export async function loadBuildings(read) {
  const base = await read('buildings.json');
  const extras = await Promise.all((base.extras || []).map(f => read(f)));
  return mergeBuildings(base, extras);
}

/** materials.json + its `extras` files: extra rows are APPENDED in the order listed, so the ids of
 *  every earlier row never change (saves store material ids). */
export async function loadMaterials(read) {
  const base = await read('materials.json');
  const out = { ...base, list: [...base.list] };
  for (const f of base.extras || []) { const x = await read(f); out.list.push(...x.list); }
  return out;
}
