// node tools/room-check.mjs <id|--all> — validate rooms (docs/10 §6.11). Exit code 1 on any error.
// Reachability is an ERROR (REVIEW R8): every exit must be reachable from every entry with the verbs the act has.
import { readFileSync } from 'node:fs';
import { loadData } from '../js/core/data.js';
import { compileRoom, validateRoomShape } from '../js/world/roomload.js';
import { buildReachGraph, reachable, nearestNodes, nodesInRect } from '../js/world/reach.js';
const here = new URL('../', import.meta.url);
const data = await loadData();
const idx = JSON.parse(readFileSync(new URL('rooms/index.json', here)));
const args = process.argv.slice(2);
const ids = args[0] === '--all' || !args.length ? Object.keys(idx.rooms) : args.filter(a => !a.startsWith('--'));
const THING_TYPES = new Set(['entry', 'exit', 'lamp_post', 'rekindle', 'great_lamp', 'lever', 'button', 'plate', 'door', 'timed_door', 'sluice', 'grapple_point', 'rope_anchor', 'gravity_lantern', 'bell', 'spike', 'chest', 'pickup', 'crate', 'oil_barrel', 'spawn', 'boss', 'npc', 'shopkeeper', 'sign', 'light', 'drip', 'zone', 'timer', 'camzone', 'counter', 'logic', 'lesson', 'decor_prop', 'current', 'trap', 'valve', 'breakable', 'lift', 'sconce', 'solution']);
const VERBS = { none: { swim: true, grapple: true }, act1: { swim: false }, act2: { swim: false, grapple: true }, act3: { swim: true, grapple: true }, act4: { swim: true, grapple: true }, act5: { swim: true, grapple: true }, act6: { swim: true, grapple: true } };
let bad = 0;
for (const id of ids) {
  const entry = idx.rooms[id]; if (!entry) { console.log(`✗ ${id}: not in rooms/index.json`); bad++; continue; }
  const room = JSON.parse(readFileSync(new URL('rooms/' + entry.file, here)));
  const errs = [], warns = [];
  errs.push(...validateRoomShape(room, data));
  if (room.id !== id) errs.push(`id '${room.id}' does not match index key '${id}'`);
  const [w, h] = room.size; if (w < 480 && room.kind !== 'test' || h < 270 && room.kind !== 'test' && room.kind !== 'piece') warns.push(`size ${w}x${h} smaller than one screen`); if (w > 2048 || h > 2048) errs.push('room larger than 2048');
  const tids = new Set();
  for (const t of room.things || []) { if (!t.id) errs.push(`thing of type ${t.t} has no id`); else if (tids.has(t.id)) errs.push(`duplicate thing id ${t.id}`); tids.add(t.id); if (!THING_TYPES.has(t.t)) errs.push(`unknown thing type '${t.t}' (${t.id})`); }
  for (const wr of room.wires || []) { if (!tids.has(wr.from) && !(room.ops || []).some(o => o.id === wr.from)) errs.push(`wire from unknown '${wr.from}'`); if (!tids.has(wr.to) && !(room.ops || []).some(o => o.id === wr.to)) errs.push(`wire to unknown '${wr.to}'`); }
  const exits = (room.things || []).filter(t => t.t === 'exit'), entries = (room.things || []).filter(t => t.t === 'entry');
  if (!entries.length && room.kind !== 'test') errs.push('no entry');
  for (const x of exits) { if (x.to?.startsWith('@')) continue; /* act-map exits resolve at run time (actmap.js) */ const other = idx.rooms[x.to]; if (!other) { (room.kind === 'bench' || room.kind === 'test' ? warns : errs).push(`exit ${x.id} goes to unknown room '${x.to}'`); continue; } const o = JSON.parse(readFileSync(new URL('rooms/' + other.file, here))); if (!(o.things || []).some(t => t.t === 'entry' && t.id === x.entry)) errs.push(`exit ${x.id} -> ${x.to} has no entry '${x.entry}' there`); }
  if (room.kind === 'lesson' && (room.things || []).some(t => t.t === 'spawn')) errs.push('a lesson room spawns enemies (lessons have no enemies)');
  const known = data.enemies?.byId; if (known) for (const t of room.things || []) if (t.t === 'spawn' && !known[t.enemy]) errs.push(`spawn ${t.id}: unknown enemy '${t.enemy}'`);
  const npcs = data.npcs?.byId; if (npcs) for (const t of room.things || []) if (t.t === 'npc' && !npcs[t.npc]) errs.push(`npc ${t.id}: unknown npc '${t.npc}'`);
  let c = null; const t0 = Date.now();
  if (!errs.length) {
    try { c = compileRoom(room, data, { settle: 30 }); } catch (e) { errs.push('compile: ' + e.message); }
  }
  let reachInfo = '';
  if (c && entries.length && !args.includes('--no-reach')) {
    const verbs = VERBS[room.act] || VERBS.none;
    const graph = buildReachGraph(c.grid, data.movement, verbs);
    for (const en of entries) {
      const start = nearestNodes(graph, en.at[0], en.at[1] + 1, 10); if (!start.length) { errs.push(`entry ${en.id}: no standing spot near ${en.at}`); continue; }
      const seen = reachable(graph, start);
      for (const x of exits) { if (x.requires || (x.needsVerb && !verbs[x.needsVerb])) continue; const ns = nodesInRect(graph, x.rect); if (!ns.some(i => seen[i])) errs.push(`exit ${x.id} unreachable from entry ${en.id} with ${room.act} verbs`); }
    }
    reachInfo = ` reach graph ${graph.nodes.length} nodes`;
  }
  const ok = !errs.length;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${id} (${Date.now() - t0} ms${reachInfo})`);
  for (const e of errs) console.log('   error: ' + e); for (const w of warns) console.log('   warn:  ' + w);
}
process.exit(bad ? 1 : 0);
