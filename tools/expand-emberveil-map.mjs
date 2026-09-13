// Makes every Emberveil zone ~50% longer by inserting nodes (mostly combat) along existing edges. Deterministic.
// Used by tools/build-emberveil-data.mjs after the zones are dumped; can also run standalone on data/zones.json.
import fs from 'node:fs';
const NAMES = { combat: ['Warband on the Road', 'Ambush at the Ford', 'Ruined Watch', 'Burned Farmstead', 'Scouts in the Brush', 'Toll Bridge', 'Cairn Field', 'Broken Caravan', 'Sentry Post', 'Hollow Way', 'Old Battlefield', 'Blocked Pass', 'Raiders\' Camp', 'Shrine Ruin', 'Crossing', 'Wardstone Circle', 'Bone Gully', 'Ash Road', 'Cinder Ford', 'Gate of Teeth', 'Black Stair', 'Rift Edge', 'Silent Choir', 'Drowned Hall', 'Wyrm Trail'], ambush: ['Ambush!', 'Night Raiders', 'Trap in the Narrows', 'Cultists in Waiting'], treasure: ['Hidden Cache', 'Abandoned Wagon', 'Collapsed Vault'], shrine: ['Wayside Shrine', 'Old Idol', 'Forgotten Altar'] };
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function expandZones(zonesJson, { factor = 0.5, seed = 11 } = {}) {
  const pools = zonesJson.ZONE_ENCOUNTER_POOLS || {}; let added = 0;
  for (const key of Object.keys(zonesJson)) { if (!Array.isArray(zonesJson[key])) continue; for (const z of zonesJson[key]) {
    if (!z?.nodes || z.nodes.some(n => n.added)) continue; const r = rng(seed + z.nodes.length * 31 + key.length); const pool = pools[z.id] || []; const byId = Object.fromEntries(z.nodes.map(n => [n.id, n]));
    const edges = z.nodes.flatMap(n => (n.exits || []).filter(e => byId[e]).map(e => [n, byId[e]])).filter(([a, b]) => a.type !== 'boss'); const want = Math.round(z.nodes.length * factor); const used = new Set(); let n = 0, i = 0;
    const order = [...edges].sort(() => r() - 0.5); const names = { combat: [...NAMES.combat].sort(() => r() - 0.5), ambush: [...NAMES.ambush], treasure: [...NAMES.treasure], shrine: [...NAMES.shrine] };
    while (n < want && order.length) { const [a, b] = order[i % order.length]; i++; if (used.has(a.id + '>' + b.id)) { if (i > order.length * 3) break; continue; } used.add(a.id + '>' + b.id);
      const roll = r(); const type = pool.length && roll < 0.7 ? 'combat' : pool.length && roll < 0.8 ? 'ambush' : roll < 0.9 ? 'treasure' : 'shrine'; const list = names[type]; const name = list.length ? list.shift() : (type + ' ' + n);
      const node = { id: `${a.id}__${b.id}_x${n}`, type, name, x: +((a.x + b.x) / 2 + (r() - 0.5) * 0.03).toFixed(3), y: +((a.y + b.y) / 2 + (r() - 0.5) * 0.08).toFixed(3), exits: [b.id], added: true }; if (type === 'combat' || type === 'ambush') node.encounter = pool[Math.floor(r() * pool.length)]; if (type === 'shrine') node.shrineType = r() < 0.7 ? 'heal' : 'empower';
      a.exits = a.exits.map(e => e === b.id ? node.id : e); z.nodes.push(node); byId[node.id] = node; n++; added++; }
  } }
  return added;
}

/**
 * Drop 1–2 `crossing` nodes into every zone: travel hazards on the way between two places (a ford, a
 * rockslide, a toll, a gate). Same trick as expandZones — a new node is spliced into an existing edge
 * so the graph stays connected. Deterministic, and safe to run more than once: a zone that already has
 * a crossing is left alone.
 *
 * @param zonesJson       data/zones.json
 * @param crossingsJson   data/crossings.json (used for the ids and the names on the map)
 */
export function addCrossings(zonesJson, crossingsJson, { seed = 23, perZone = 2 } = {}) {
  const list = crossingsJson?.crossings || []; if (!list.length) return 0;
  let added = 0, pick = 0;
  for (const key of Object.keys(zonesJson)) { if (!Array.isArray(zonesJson[key])) continue; for (const z of zonesJson[key]) {
    if (!z?.nodes || z.nodes.some(n => n.type === 'crossing')) continue;
    const r = rng(seed + z.id.length * 97 + z.nodes.length); const byId = Object.fromEntries(z.nodes.map(n => [n.id, n]));
    // never in front of the boss, and never off the very first node: a crossing should sit on the road
    const edges = z.nodes.flatMap(n => (n.exits || []).filter(e => byId[e]).map(e => [n, byId[e]])).filter(([a, b]) => a.type !== 'boss' && b.type !== 'boss' && b.type !== 'town');
    if (!edges.length) continue;
    const want = 1 + (r() < 0.5 ? 1 : 0); const order = [...edges].sort(() => r() - 0.5); const used = new Set();
    for (let k = 0; k < Math.min(want, perZone, order.length); k++) {
      const [a, b] = order[k]; if (used.has(a.id)) continue; used.add(a.id);
      const c = list[pick++ % list.length];
      const node = { id: `${a.id}__${b.id}_c${k}`, type: 'crossing', name: c.name, crossingId: c.id,
        x: +((a.x + b.x) / 2 + (r() - 0.5) * 0.03).toFixed(3), y: +((a.y + b.y) / 2 + (r() - 0.5) * 0.08).toFixed(3),
        exits: [b.id], added: true, crossing: true };
      a.exits = a.exits.map(e => e === b.id ? node.id : e); z.nodes.push(node); byId[node.id] = node; added++;
    }
  } }
  return added;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = new URL('../prototypes/emberveil/data/zones.json', import.meta.url).pathname;
  const cp = new URL('../prototypes/emberveil/data/crossings.json', import.meta.url).pathname;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const added = expandZones(j);
  const crossings = addCrossings(j, JSON.parse(fs.readFileSync(cp, 'utf8')));
  fs.writeFileSync(p, JSON.stringify(j, null, 1));
  console.log('added', added, 'nodes and', crossings, 'crossings');
}
