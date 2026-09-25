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

// The settlement in each act (js/game.js TOWNS). Only the Border Roads carried a town node in the
// original map data, which was survivable while the map allowed fast travel to any visited node —
// round 20 took that away, so every zone from act 1 on now has somewhere to buy food and see a cleric.
const TOWN_NAMES = { 1: 'Emberglen', 2: 'Ashfort', 3: 'Ironhold Bastion', 4: 'Starfall Haven', 5: 'The Last Bastion', 6: 'Drakehold' };

/**
 * Give every act-1-and-later zone a settlement if it has not got one. The node is dropped in loose;
 * normalizeZones() wires it into the second column, a short walk from where the party comes in.
 * Safe to run more than once — a zone that already has a town is left alone. The prologue stays empty
 * on purpose: the Lonely Road has nobody on it.
 */
export function addTowns(zonesJson) {
  let added = 0;
  for (const key of Object.keys(zonesJson)) { if (!Array.isArray(zonesJson[key])) continue; for (const z of zonesJson[key]) {
    if (!z?.nodes?.length || !z.act || z.nodes.some(n => n.type === 'town')) continue;
    const name = TOWN_NAMES[Math.min(6, z.act)] || 'Waystation';
    z.nodes.push({ id: 'town_' + z.id, type: 'town', name, x: 0.2, y: 0.5, exits: [], added: true, town: true });
    added++;
  } }
  return added;
}

/**
 * Reshape a zone's trails into a clean layered road (round 20).
 *
 * The original maps (and the nodes this tool splices into them) grew sideways: one act-2 zone opened
 * seven branches at once, and a couple of edges jumped from the first node most of the way to the
 * boss, so a player could walk past half the act. This rewires every zone — nothing is added or
 * removed, only the `exits` change — so that:
 *
 *   • the start is alone in the first column and the boss alone in the last;
 *   • no column holds more than `maxWidth` nodes, so at most that many branches are ever open;
 *   • every trail joins one column to the very next one, so there is no shortcut past the middle of
 *     an act and every route from the start to the boss is the same number of moves;
 *   • every node has a way in and a way out (no dead ends, nothing stranded).
 *
 * Node order inside the map is kept as close to the authored one as possible: nodes are sorted by how
 * deep they already were, then by the order they were written in, and a settlement is pulled forward
 * so the party is never more than a short walk from a cleric.
 *
 * @param zonesJson  data/zones.json (edited in place)
 * @returns the number of zones rewired
 */
export function normalizeZones(zonesJson, { maxWidth = 4, firstBranch = 3 } = {}) {
  let done = 0;
  for (const key of Object.keys(zonesJson)) { if (!Array.isArray(zonesJson[key])) continue; for (const z of zonesJson[key]) {
    if (!z?.nodes?.length) continue;
    const nodes = z.nodes; const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    // where the party comes in, and what it is walking towards
    const targets = new Set(nodes.flatMap(n => (n.exits || []).filter(e => byId[e])));
    const start = byId.start || nodes.find(n => !targets.has(n.id)) || nodes[0];
    const boss = nodes.find(n => n.type === 'boss') || null;
    // the depth the zone already had, so the authored running order survives the rewiring
    const depth = { [start.id]: 0 }; const q = [start.id];
    while (q.length) { const id = q.shift(); for (const e of byId[id]?.exits || []) if (byId[e] && depth[e] == null) { depth[e] = depth[id] + 1; q.push(e); } }
    // a zone that already reads as a clean road (a narrow chain, every trail one column long) is left
    // exactly as authored — the prologue is meant to be a single lonely line
    const cols = {}; for (const n of nodes) (cols[depth[n.id] ?? -1] ||= []).push(n);
    const widest = Math.max(...Object.values(cols).map(l => l.length));
    const clean = Object.keys(depth).length === nodes.length && widest <= maxWidth
      && nodes.every(n => (n.exits || []).every(e => byId[e] && depth[e] === depth[n.id] + 1));
    if (clean) continue;
    const index = Object.fromEntries(nodes.map((n, i) => [n.id, i]));
    const rest = nodes.filter(n => n !== start && n !== boss)
      .sort((a, b) => (depth[a.id] ?? 99) - (depth[b.id] ?? 99) || index[a.id] - index[b.id]);
    // a settlement belongs early: with no fast travel the walk back to a cleric has to be short
    const townAt = rest.findIndex(n => n.type === 'town'); if (townAt > 0) rest.unshift(...rest.splice(townAt, 1));
    // column sizes: one, then a narrow branch, then the wide middle, then the boss on his own
    const layers = [[start]]; let i = 0;
    while (i < rest.length) {
      const first = layers.length === 1; const left = rest.length - i;
      let want = first ? Math.min(firstBranch, maxWidth) : maxWidth;
      if (left - want === 1 && want > 1) want--;        // never leave a lonely node in its own column
      layers.push(rest.slice(i, i + Math.min(want, left))); i += Math.min(want, left);
    }
    if (boss) layers.push([boss]);
    // wire each column to the next: every node gets a way out, every node gets a way in
    for (const n of nodes) n.exits = [];
    for (let L = 0; L < layers.length - 1; L++) {
      const A = layers[L], B = layers[L + 1]; const out = A.map(() => new Set());
      for (let m = 0; m < B.length; m++) out[Math.floor(m * A.length / B.length)].add(B[m].id);   // every B node a parent
      for (let k = 0; k < A.length; k++) out[k].add(B[Math.floor(k * B.length / A.length)].id);   // every A node a child
      A.forEach((n, k) => n.exits = [...out[k]]);
    }
    // rows inside a column, so the map draws short trails instead of long diagonals
    layers.forEach(list => list.forEach((n, k) => { n.y = +((k + 1) / (list.length + 1)).toFixed(3); }));
    layers.forEach((list, L) => list.forEach(n => { n.x = +((L + 1) / (layers.length + 1)).toFixed(3); }));
    done++;
  } }
  return done;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = new URL('../prototypes/emberveil/data/zones.json', import.meta.url).pathname;
  const cp = new URL('../prototypes/emberveil/data/crossings.json', import.meta.url).pathname;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const added = expandZones(j);
  const crossings = addCrossings(j, JSON.parse(fs.readFileSync(cp, 'utf8')));
  const towns = addTowns(j);
  const shaped = normalizeZones(j);
  fs.writeFileSync(p, JSON.stringify(j, null, 1));
  console.log('added', added, 'nodes,', crossings, 'crossings and', towns, 'settlements; reshaped', shaped, 'zones');
}
