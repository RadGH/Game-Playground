// Zone content the server places (stream A, reading stream E's data). Pure: the caller passes `readJson(path)`
// (fetch in a Worker, fs under Node); paths are relative to the game folder.
//
//   const content = await loadZoneContent(readJson, 'test')
//   -> { sheet, encounterInfo: { id: { name, body } } }    (missing files give empty content, never a throw)
//
// Used by createWorld({ zoneSheet: content.sheet, encounterInfo: content.encounterInfo }).

export const PROVINCE_FILES = ['data/provinces/torbor_downs.json'];

export async function loadZoneContent(readJson, zone = 'test') {
  const out = { sheet: null, encounterInfo: {} };
  for (const f of PROVINCE_FILES) {
    try {
      const p = await readJson(f);
      // the zone's own sheet; M1 has one sheet, so a re-baked starter zone falls back to the first one
      const z = p && p.zones && (p.zones[zone] || Object.values(p.zones)[0]);
      if (z) { out.sheet = { ...z, province: p.name || null }; break; }
    } catch { /* no sheet */ }
  }
  try {
    const idx = await readJson('data/encounters/index.json');
    for (const f of idx.files || []) {
      try { const e = await readJson('data/encounters/' + f); if (e && e.id) out.encounterInfo[e.id] = { name: e.name || e.id, body: e.body || null }; } catch { /* skip */ }
    }
  } catch { /* no encounters */ }
  return out;
}
