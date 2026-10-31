// The vehicle catalog's rules (data in avatar-3d/data/vehicle-catalog.json). Pure: no Three.js, no DOM, so a game's garage
// and node tests can use it as well as the Vehicles page.
//
//   const rows = await loadVehicleCatalog();                              // browser
//   filterVehicles(rows, { era: 'modern', tags: ['emergency', 'land'] })  // every tag must match
//   tagsOf(row)                                                           // tags + domain + class, the words a filter can use
//   facetCounts(rows)                                                     // { eras: { modern: 31, … }, tags: { land: 44, … } }

export const ERAS = ['fantasy', 'medieval', 'modern', 'future'];
export const DOMAINS = ['land', 'water', 'air', 'space'];
export const ERA_LABELS = { fantasy: 'Fantasy', medieval: 'Medieval', modern: 'Modern', future: 'Future' };

export async function loadVehicleCatalog(url = new URL('../data/vehicle-catalog.json', import.meta.url)) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('vehicle catalog: ' + r.status);
  return (await r.json()).vehicles;
}

export const tagsOf = row => [row.domain, row.class, ...(row.tags || [])];

export function filterVehicles(rows, { era = null, tags = [] } = {}) {
  return rows.filter(r => (!era || r.era === era) && tags.every(t => tagsOf(r).includes(t)));
}

export function facetCounts(rows) {
  const eras = {}, tags = {};
  for (const r of rows) {
    eras[r.era] = (eras[r.era] || 0) + 1;
    for (const t of tagsOf(r)) tags[t] = (tags[t] || 0) + 1;
  }
  return { eras, tags };
}
