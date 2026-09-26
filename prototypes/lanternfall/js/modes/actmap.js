// The act maps (docs/09 §2-§6): node graph per act, room ids <node>_r<k>, hand-authored room files vs kit
// rooms generated from the save's seed, exit resolution (@next, @next:k, @prev, @in), reveal/visit state for
// the map screen. Pure; loading files is injected (readRoomFile).
import { generateKitRoom } from '../world/kits.js';
import { hashSeed } from '../core/rng.js';
import { REGISTRY as BOSS_SCRIPTS } from '../ai/bosses/index.js';
const MINIBOSS = { a2_n07: 'mb_sewer_king', a3_n06: 'mb_lockmaster', a4_n07: 'mb_lampeater_mother' };

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
      const e = usable[k] || usable[0];
      if (!e) { // the end of an act: through to the next act once its Great Lamp burns; after the last act, the ending
        if (n.type !== 'boss' && n !== acts.find(x => x.id === n.act).nodes.at(-1)) return null;
        if (!flags[`lamp_${n.act}`]) return { blocked: 'lamp' };
        const ai = acts.findIndex(x => x.id === n.act), nx = acts[ai + 1];
        return nx ? { room: M.firstRoom(nx.nodes[0].id), entry: 'w' } : { ending: true };
      }
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
    try { const j = await readRoomFile(r.act, r.reuse || roomId); if (j?.map) return j; } catch { /* no hand-made file yet */ }
    return standInRoom(data, runSeed, r, n, a, roomId);
  };
  /** Map screen state: which nodes are visible / visited / cleared. */
  M.view = function (actId, save) {
    const a = acts.find(a => a.id === actId); const visited = new Set(save?.visited || []);
    const out = a.nodes.map(n => { const v = visited.has(n.id); const adj = n.prevs.some(p => visited.has(p.from)) || n.next.some(e => visited.has(e.to)); return { ...n, visited: v, known: v || (adj && n.type !== 'secret') || n === a.nodes[0], hint: adj && !v && n.type !== 'secret' ? n.type : null }; });
    return { act: a, nodes: out, edges: a.edges };
  };
  return M;
}

// ---------- stand-ins ----------
// Hand-made ('A') rooms that have not been authored yet are generated from a kit and dressed for the node's
// type, so every act can be played through: hubs get a lamp-post, their shops and people; boss nodes get an
// antechamber and an arena with the act's boss and Great Lamp; floods get a flooded hall; secrets a chest.
// Each stand-in carries standIn: true. docs/HANDOFF.md lists which rooms still need authoring.
const ACT_PEOPLE = {
  act1: { shops: ['shop_wick', 'shop_pawn'], npcs: ['npc_aldra', 'npc_seld'] },
  act2: { shops: ['shop_soup', 'shop_ferry'], npcs: ['npc_nell', 'npc_pim'] },
  act3: { shops: ['shop_gamble'], npcs: ['npc_voss'] },
  act4: { shops: ['shop_pawn'], npcs: ['npc_unna', 'npc_mothwife'] },
  act5: { shops: ['shop_wick'], npcs: ['npc_marl'] },
  act6: { shops: ['shop_soup'], npcs: ['npc_corvin', 'npc_merrit', 'npc_hush'] },
};
export function standInRoom(data, runSeed, r, n, a, roomId) {
  const last = r.index === n.rooms.length - 1, exits = last ? Math.max(1, n.next.filter(e => !e.hidden).length) : 1;
  const seed = hashSeed(runSeed, r.act, n.id, r.index, 'standin');
  const table = (data.kits?.spawnTables?.[r.act] || []).filter(e => data.enemies?.byId?.[e.id]);
  const [bLo, bHi] = data.kits?.budget?.[r.act] || [6, 12], budget = bLo + (seed % (bHi - bLo + 1));
  const T = n.type, bossRoom = T === 'boss' && last, quiet = ['hub', 'lamppost'].includes(T) || (T === 'boss' && !last);
  const kit = T === 'flood' ? 'flooded_hall' : T === 'puzzle' || T === 'event' ? 'bridge_gap' : T === 'elite' ? 'fight_tall' : 'fight_small';
  const floorSpots = room => room.sockets.floor.filter(s => s[0] > 60 && s[0] < room.size[0] - 60).sort((p, q) => q[1] - p[1] || p[0] - q[0]);
  const dress = (room) => {
    const spots = floorSpots(room), at = k => { const s = spots[k % Math.max(1, spots.length)] || [room.size[0] / 2, room.size[1] - 48]; return [Math.round(s[0]), s[1]]; };
    const put = t => room.things.push(t);
    if (n.lampPost && !bossRoom) put({ t: 'lamp_post', id: 'lamp_post_1', at: at(0) });
    if (T === 'hub') { const P = ACT_PEOPLE[r.act] || ACT_PEOPLE.act1; let k = 1; for (const shop of P.shops) { const sh = data.shops?.byId?.[shop]; if (sh) put({ t: 'shopkeeper', id: `keeper_${shop}`, shop, npc: sh.keeper, at: at(k++) }); } for (const npc of P.npcs) if (data.npcs?.byId?.[npc]) put({ t: 'npc', id: `person_${npc}`, npc, intents: ['greet', 'smalltalk'], at: at(k++) }); put({ t: 'sign', id: 'sign_hub', at: at(k), text: `${n.name}. The lamp-post keeps your place.` }); }
    if (bossRoom) { const W = room.size[0], fl = spots[0]?.[1] ?? room.size[1] - 48; put({ t: 'boss', id: 'boss_1', boss: a.boss, flag: `${a.boss}@${n.id}`, at: [Math.round(W * 0.66), fl] }); put({ t: 'great_lamp', id: 'great_lamp', act: a.id, at: [Math.round(W * 0.85), fl] }); }
    if (T === 'elite' && last && BOSS_SCRIPTS[MINIBOSS[n.id]]) { const W = room.size[0], fl = spots[0]?.[1] ?? room.size[1] - 48; put({ t: 'boss', id: 'miniboss', boss: MINIBOSS[n.id], flag: `${MINIBOSS[n.id]}@${n.id}`, at: [Math.round(W * 0.7), fl] }); }
    if (T === 'secret') put({ t: 'chest', id: 'chest_secret', at: at(0), loot: 'lt_chest_rare' });
  };
  const room = generateKitRoom(kit, { id: roomId, act: r.act, seed, exits, spawnTable: table, budget: budget * (T === 'lesson' ? 0.4 : T === 'elite' ? 1.4 : 1), name: n.name, dark: n.dark, rainDensity: a.rain?.density, wind: a.rain?.wind, noEnemies: quiet || bossRoom, kind: T === 'hub' ? 'hub' : undefined, dress });
  room.standIn = true; return room;
}
