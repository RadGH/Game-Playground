// Oathwild — one quest book for the whole world (regions, owner 2026-11-27; docs/BRAINSTORM-2026-11-27-regions.md §1).
// Quest PROGRESS is world-wide (every region's room shares ws.quests), so every region's room and the page must know
// every quest: a quest given in Ashfield is in your log in the Vale and its Catacombs step counts in the Catacombs. Pure.
//
//   worldBooks({ vale: bookA, ashfield: bookB, catacombs: null })  → { regionId: book }  each region's own view
//
// Each view holds ALL quests, people, objects, places and camps, every one tagged `worldRegion` (and `region` for
// people, objects and places) — and `book.region` = the view's region, so js/world/quests.js (npcPresent,
// liveObjects, reach steps) never shows or counts another region's people, objects or places there; markers carry
// the region of their goal (markerOf → { region }).

// a generator's own names for regions (the graveyard data: brightwater_vale, ashfield_catacombs) → the index's ids
const ALIAS = { brightwater_vale: 'vale', thornmere_wilds: 'vale', ashfield_catacombs: 'catacombs' };
export const worldRegionOf = id => ALIAS[id] || id;

export const emptyBook = () => ({ quests: {}, order: [], npcs: {}, objects: {}, places: {}, camps: {}, data: { quests: {} } });

export function worldBooks(books) {
  const quests = {}, order = [], npcs = {}, objects = {}, places = {}, camps = {};
  for (const [rid, b] of Object.entries(books)) {
    if (!b) continue;
    for (const id of b.order || Object.keys(b.quests)) {
      if (quests[id]) continue;
      const q = b.quests[id];
      // a kill target may say which region its monster lives in (the Sexton: the Catacombs)
      const steps = (q.steps || []).map(s => (s.targets ? { ...s, targets: s.targets.map(t => (t.region ? { ...t, region: worldRegionOf(t.region), worldRegion: worldRegionOf(t.region) } : t)) } : s));
      quests[id] = { ...q, steps, worldRegion: rid };
      order.push(id);
    }
    for (const [id, n] of Object.entries(b.npcs || {})) if (!npcs[id]) npcs[id] = { ...n, region: rid, worldRegion: rid };
    for (const [id, o] of Object.entries(b.objects || {})) if (!objects[id]) objects[id] = { ...o, region: rid, worldRegion: rid };
    for (const [id, p] of Object.entries(b.places || {})) if (!places[id]) places[id] = { ...p, region: rid, worldRegion: rid };
    for (const [id, c] of Object.entries(b.camps || {})) if (!camps[id]) camps[id] = { ...c, worldRegion: rid };
  }
  const out = {};
  for (const [rid, b] of Object.entries(books)) {
    out[rid] = { ...(b || emptyBook()), region: rid, quests, order, npcs, objects, places, camps };
  }
  return out;
}

/**
 * The page's world book: the home region's book (already booted) plus every other region's quests, people and
 * objects, read from their data files only — no map is built (a region's map is built when it is entered).
 */
export async function loadWorldBook({ index, home, regions, read }) {
  const { createQuestBook } = await import('../quests.js');
  const books = { [index.home || 'vale']: home };
  for (const [id, row] of Object.entries(index.regions)) {
    if (id === (index.home || 'vale')) continue;
    if (row.kind === 'graveyard') {
      const { loadRegionData } = await import('./graveyard.js');
      const d = await loadRegionData(id, read);
      const all = { ...(regions || {}), regions: { ...(regions?.regions || {}), [d.region.id]: d.region.rules } };
      books[id] = createQuestBook({ quests: d.quests, npcs: d.npcs, placements: d.placements, map: d.map, regions: all });
    } else books[id] = emptyBook();
  }
  return worldBooks(books);
}
