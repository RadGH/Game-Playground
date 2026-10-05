// Zone content the server places (stream A, reading stream E's data). Pure: the caller passes `readJson(path)`
// (fetch in a Worker, fs under Node); paths are relative to the game folder.
//
//   const content = await loadZoneContent(readJson, 'test')
//   -> { sheet, encounterInfo: { id: { name, body } }, vignettes: { recipes, placements } | null }    (missing files give empty content, never a throw)
//
// Used by createWorld({ zoneSheet: content.sheet, encounterInfo: content.encounterInfo }).

export const PROVINCE_FILES = ['data/provinces/torbor_downs.json'];
export const VIGNETTE_FILES = ['data/vignettes/m1.json', 'data/vignettes/m2.json', 'data/vignettes/m2b.json'];

export async function loadZoneContent(readJson, zone = 'test') {
  const out = { sheet: null, encounterInfo: {}, vignettes: null };
  for (const f of PROVINCE_FILES) {
    try {
      const p = await readJson(f);
      // the zone's own sheet; M1 has one sheet, so a re-baked starter zone falls back to the first one
      const z = p && p.zones && (p.zones[zone] || Object.values(p.zones)[0]);
      if (z) { out.sheet = { ...z, province: p.name || null }; break; }
    } catch { /* no sheet */ }
  }
  // vignettes: every recipe file + this zone's placements (stream E)
  try {
    const recipes = [];
    for (const f of VIGNETTE_FILES) { try { const d = await readJson(f); recipes.push(...(d.vignettes || [])); } catch { /* skip */ } }
    const placements = await readJson(`data/vignettes/placements/${zone}.json`);
    out.vignettes = { recipes, placements: placements.placements || [] };
  } catch { out.vignettes = null; }
  try {
    const idx = await readJson('data/encounters/index.json');
    for (const f of idx.files || []) {
      try { const e = await readJson('data/encounters/' + f); if (e && e.id) out.encounterInfo[e.id] = { name: e.name || e.id, body: e.body || null }; } catch { /* skip */ }
    }
  } catch { /* no encounters */ }
  return out;
}

/**
 * A whole province (stream B's bakes + stream E's sheet), for a multi-zone province room.
 *   await loadProvinceContent(readJson, readBytes, 'torbor_downs', { parseTerrain, createProvinceTerrain })
 * -> { key, name, terrain, zones: [{ key (world zone id), eid (E's id), sheet, vignettes }], encounterInfo, events, starter }
 * readBytes(path) -> Uint8Array. A zone whose bake is missing is left out (logged by the caller).
 */
export async function loadProvinceContent(readJson, readBytes, provinceId, { parseTerrain, createProvinceTerrain, log = () => {} }) {
  const map = (await readJson('data/world/province-map.json')).provinces[provinceId];
  if (!map) throw new Error('no province ' + provinceId + ' in data/world/province-map.json');
  let sheet = null;
  for (const f of PROVINCE_FILES) { try { const p = await readJson(f); if (p.id === provinceId) { sheet = p; break; } } catch { /* next */ } }
  const recipes = [];
  for (const f of VIGNETTE_FILES) { try { recipes.push(...((await readJson(f)).vignettes || [])); } catch { /* skip */ } }
  const zones = [], parts = [];
  for (const [eid, wid] of Object.entries(map.map)) {
    let reader;
    try { reader = parseTerrain(await readBytes(`data/zones/${wid}/terrain.bin`)); } catch (err) { log('zone ' + wid + ' not baked: ' + err.message); continue; }
    const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number);
    parts.push({ key: wid, zx, zy, reader });
    let vignettes = null;
    for (const f of [`data/vignettes/placements/${wid}.json`, `data/vignettes/placements/${eid}.json`]) {
      try {
        const pl = await readJson(f);
        if (pl.terrainHash && reader.meta.inputHash && pl.terrainHash !== reader.meta.inputHash) { log(`vignettes ${f}: made for another bake (${pl.terrainHash} vs ${reader.meta.inputHash}), skipped`); continue; }
        // placements are in zone metres: move them into world metres
        vignettes = { recipes, placements: (pl.placements || []).map(p => ({ ...p, x: p.x + zx * 2048, z: p.z + zy * 2048 })) };
        break;
      } catch { /* none yet */ }
    }
    const zs = sheet && sheet.zones ? sheet.zones[eid] : null;
    zones.push({ key: wid, eid, sheet: zs ? { ...zs, id: eid } : null, vignettes });
  }
  if (!parts.length) throw new Error('province ' + provinceId + ': no zone is baked');
  const startE = sheet && sheet.grid ? sheet.grid.start : null;
  const starter = startE ? map.map[startE] : parts[0].key;
  const terrain = createProvinceTerrain({ key: provinceId, zones: parts, starter });
  const encounterInfo = (await loadZoneContent(readJson, 'none')).encounterInfo;
  // the province's realm event (its world boss, PLAN §5.2), at the site B baked for it
  const events = [];
  if (sheet && sheet.worldBoss) {
    const wb = sheet.worldBoss, wid = map.map[wb.zone];
    const site = terrain.reader.meta.sites.find(s => s.id === wb.id);
    const info = encounterInfo[wb.id] || {};
    if (site) events.push({ id: wb.id, name: info.name || wb.id, province: provinceId, x: site.x, z: site.z, r: site.r || 50, encounter: wb.id, body: info.body || null, level: ((sheet.zones || {})[wb.zone] || {}).band?.[1] || 10, band: ((sheet.zones || {})[wb.zone] || {}).band || sheet.band || [1, 50], zone: wid, kind: 'worldboss' });
  }
  return { key: provinceId, name: sheet ? sheet.name : provinceId, terrain, zones, encounterInfo, events, starter };
}
