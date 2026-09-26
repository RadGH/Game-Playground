// node tools/kit-check.mjs — every kit x 8 seeds x 6 acts compiles and passes the reach bot (exit reachable).
import { loadData } from '../js/core/data.js';
import { generateKitRoom, KITS } from '../js/world/kits.js';
import { compileRoom } from '../js/world/roomload.js';
import { buildReachGraph, reachable, nearestNodes, nodesInRect } from '../js/world/reach.js';
const data = await loadData(); let bad = 0, n = 0;
const acts = ['act1', 'act2', 'act3', 'act4', 'act5', 'act6'], VERBS = { act1: { swim: false }, act2: { swim: false, grapple: true } };
for (const kit of KITS) for (const act of acts) for (let s = 1; s <= (process.argv.includes('--quick') ? 2 : 8); s++) {
  const exits = s % 2 ? 1 : 2;
  const room = generateKitRoom(kit, { id: `kit_${kit}_${act}_${s}`, act, seed: s * 7919, exits, spawnTable: [] });
  n++;
  try {
    const c = compileRoom(room, data, { settle: 30 }); const g = buildReachGraph(c.grid, data.movement, VERBS[act] || { swim: true, grapple: true });
    const en = room.things.find(t => t.t === 'entry' && t.id === 'w'); const start = nearestNodes(g, en.at[0], en.at[1] + 1, 10);
    const seen = reachable(g, start); const fails = room.things.filter(t => t.t === 'exit' && !nodesInRect(g, t.rect).some(i => seen[i])).map(t => t.id);
    if (!start.length || fails.length) { bad++; console.log(`✗ ${kit} ${act} seed ${s} exits ${exits}: ${start.length ? 'unreachable ' + fails.join(',') : 'no start node'}`); }
  } catch (e) { bad++; console.log(`✗ ${kit} ${act} seed ${s}: ${e.message}`); }
}
console.log(`${n - bad}/${n} kit rooms pass`); process.exit(bad ? 1 : 0);
