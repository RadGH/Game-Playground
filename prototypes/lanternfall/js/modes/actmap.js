// The act maps (docs/09 §2-§6): node graph per act, room ids <node>_r<k>, hand-authored room files vs kit
// rooms generated from the save's seed, exit resolution (@next, @next:k, @prev, @in), reveal/visit state for
// the map screen. Pure; loading files is injected (readRoomFile).
import { generateKitRoom } from '../world/kits.js';
import { hashSeed } from '../core/rng.js';

export function createActMaps(data, runSeed = 1) {
  const acts = data.acts.list, nodes = {}, rooms = {};
  for (const a of acts) for (const n of a.nodes) {
    n.act = a.id; nodes[n.id] = n; n.next = []; n.prevs = [];
    n.rooms.forEach((r, k) => { const id = r.reuse || `${n.id}_r${k}`; rooms[`${n.id}_r${k}`] = { ...r, id, node: n.id, index: k, act: a.id }; });
  }
  for (const a of acts) for (const [from, to, opt] of a.edges) { nodes[from].next.push({ to, ...(opt || {}) }); nodes[to].prevs.push({ from, ...(opt || {}) }); }
  const M = { acts, nodes, rooms };
  M.firstRoom = nodeId => `${nodeId}_r0`;
  M.lastRoom = nodeId => `${nodeId}_r${nodes[nodeId].rooms.length - 1}`;
  M.nodeOf = roomId => rooms[roomId]?.node;
  M.actOf = id => (nodes[id] || nodes[rooms[id]?.node])?.act;
  /** Where does an exit lead? returns { room, entry } or null (blocked). flags gate locked/needsFlag edges. */
  M.resolveExit = function (roomId, exit, flags = {}) {
    const r = rooms[roomId]; if (!r || !exit.to?.startsWith('@')) return { room: exit.to, entry: exit.entry };
    const n = nodes[r.node];
    if (exit.to === '@in') return { room: `${n.id}_r${r.index + 1}`, entry: 'w' };
    if (exit.to === '@prev') { if (r.index > 0) return { room: `${n.id}_r${r.index - 1}`, entry: 'e' }; const p = n.prevs.find(p => !p.oneWay && !p.forced); return p ? { room: M.lastRoom(p.from), entry: 'e' } : null; }
    if (exit.to.startsWith('@next')) {
      if (r.index < n.rooms.length - 1) return { room: `${n.id}_r${r.index + 1}`, entry: 'w' };
      const k = +(exit.to.split(':')[1] || 0); const usable = n.next.filter(e => !e.hidden || flags[`found_${e.to}`]);
      const e = usable[k] || usable[0]; if (!e) return null;
      if (e.locked && !flags[`have_${e.locked}`]) return { blocked: e.locked };
      if (e.needsFlag && !flags[e.needsFlag]) return { blocked: e.needsFlag };
      return { room: M.firstRoom(e.to), entry: 'w' };
    }
    return null;
  };
  /** Build the room JSON for a room id. readRoomFile(act, id) -> Promise<json> for hand-authored rooms. */
  M.roomJson = async function (roomId, readRoomFile) {
    const r = rooms[roomId]; if (!r) return readRoomFile(null, roomId);
    const n = nodes[r.node], a = acts.find(a => a.id === r.act);
    if (r.kind === 'K') {
      const last = r.index === n.rooms.length - 1, exits = last ? Math.max(1, n.next.filter(e => !e.hidden).length) : 1;
      const table = (data.kits?.spawnTables?.[r.act] || []).filter(e => data.enemies?.byId?.[e.id]);
      if (a.id === 'act4' && (n.dark || data.kits?.spawnTables?.unlit)) table.push(...(data.kits.spawnTables.unlit || []).filter(e => data.enemies?.byId?.[e.id]));
      const [bLo, bHi] = data.kits?.budget?.[r.act] || [6, 12];
      const seed = hashSeed(runSeed, r.act, n.id, r.index);
      return generateKitRoom(r.kit, { id: roomId, act: r.act, seed, exits, spawnTable: table, budget: bLo + (seed % (bHi - bLo + 1)) * (n.type === 'lesson' ? 0.4 : 1), name: `${n.name}`, dark: n.dark, rainDensity: a.rain?.density, wind: a.rain?.wind, noEnemies: n.type === 'hub' });
    }
    return readRoomFile(r.act, r.reuse || roomId);
  };
  /** Map screen state: which nodes are visible / visited / cleared. */
  M.view = function (actId, save) {
    const a = acts.find(a => a.id === actId); const visited = new Set(save?.visited || []);
    const out = a.nodes.map(n => { const v = visited.has(n.id); const adj = n.prevs.some(p => visited.has(p.from)) || n.next.some(e => visited.has(e.to)); return { ...n, visited: v, known: v || (adj && n.type !== 'secret') || n === a.nodes[0], hint: adj && !v && n.type !== 'secret' ? n.type : null }; });
    return { act: a, nodes: out, edges: a.edges };
  };
  return M;
}
