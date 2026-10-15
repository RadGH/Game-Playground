// Display names for things the server sends as keys: zones ("z11_04" -> "Blackthorn Scar") and classes
// ("dragon_knight" -> "Dragon Knight"). Zone names come from E's province sheets through B's province map
// (loaded once, in the background); until then, and for unknown keys, a tidy version of the key is shown.

const ZONES = new Map();
let loading = null;
export function loadZoneNames(base = new URL('../../data/', import.meta.url)) {
  if (loading) return loading;
  loading = (async () => {
    try {
      const pm = await (await fetch(new URL('world/province-map.json', base))).json();
      for (const [prov, p] of Object.entries(pm.provinces || {})) {
        let sheet = null;
        try { sheet = await (await fetch(new URL(`provinces/${prov}.json`, base))).json(); } catch { /* no sheet */ }
        for (const [id, wz] of Object.entries(p.map || {})) {
          const nm = sheet?.zones?.[id]?.name;
          if (nm) { ZONES.set(wz, nm); if (!ZONES.has(id)) ZONES.set(id, nm); }      // round 11 (P, live #59): the SHEET id too — a legend fish names its zone by it, and the starter zone's id is "test" ("Somewhere in Test")
        }
      }
    } catch { /* offline/test: keys stay tidy */ }
    return ZONES;
  })();
  return loading;
}
/** Remember a name the server told us (zone {zone, name}). */
export function learnZone(key, name) { if (key && name) ZONES.set(key, name); }
export function zoneName(key) {
  if (!key) return '';
  if (ZONES.has(key)) return ZONES.get(key);
  if (/^z\d+_\d+$/.test(key)) return 'Somewhere in the Vale';
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
export function className(id) { return id ? String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''; }
