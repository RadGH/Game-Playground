// Story Night (Expansion 1, M8): read data/story/ into the shape js/sim/story.js wants. `read(path)` returns the parsed
// JSON of a path relative to the game folder (the server and the tests each pass their own reader; the browser never
// loads the arcs — it is sent the cards). An arc file that is missing or broken is left out (and named in `skipped`)
// rather than stopping the whole server; tests/story.test.js fails on it.
export function loadStoryData(read) {
  const index = read('data/story/index.json'), common = read('data/story/common.json');
  const arcs = {}, skipped = [];
  for (const id of index.arcs) { try { arcs[id] = read(`data/story/arcs/${id}.json`); } catch (e) { skipped.push(`${id}: ${e.message}`); } }
  return { index: { ...index, arcs: index.arcs.filter(id => arcs[id]) }, common, arcs, skipped };
}
