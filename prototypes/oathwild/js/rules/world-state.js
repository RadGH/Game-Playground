// Oathwild — the shared persistent world (owner 2026-11-23: one saved world a group owns together;
// quest and map progress belong to the world, rewards and gear to each character). Pure, plain JSON.
//
//   createWorldState({ id, name, seed })        → ws
//   setFlag(ws, flag, { player }) / hasFlag(ws, flag, { player }) / flagsFor(ws, playerId)
//   startQuest / setQuestStep / completeQuest / questOf          shared quest progress (steps + data)
//   claimQuestReward(ws, questId, playerId)    → { ok, why } once per player, after the quest is done
//   clearCamp(ws, campId, now) / campReady(rules, ws, campId, now) / campsToRespawn(rules, ws, now)
//   discoverShrine(ws, shrineId, playerId) / shrinesKnown(ws) / setHomeShrine(ws, playerId, shrineId) / homeShrine
//   note(ws, text, now)                         a short world log (newest last, capped)
//   toJSON(ws) / fromJSON(obj)                  save / load (version checked, missing fields filled)
//
// Chest timers per player live here too (`chests`, `chestLoot`, `unlocked`) — js/rules/loot.js
// chestOpenFor reads and writes them.

export const WORLD_VERSION = 1;
const LOG_MAX = 200;

export function createWorldState({ id = 'world', name = 'Oathwild', seed = 1 } = {}) {
  return {
    version: WORLD_VERSION, id, name, seed,
    time: 0,
    flags: [], playerFlags: {},
    quests: {},
    camps: {},
    chests: {}, chestLoot: {}, unlocked: {},
    shrines: [], players: {},
    log: [],
  };
}

// ---------------------------------------------------------------- flags

/** A world flag (everyone's) or, with `player`, one character's own (a pact, a contract). */
export function setFlag(ws, flag, { player = null } = {}) {
  if (player) {
    const list = ws.playerFlags[player] = ws.playerFlags[player] || [];
    if (!list.includes(flag)) list.push(flag);
  } else if (!ws.flags.includes(flag)) ws.flags.push(flag);
}
export function hasFlag(ws, flag, { player = null } = {}) {
  return ws.flags.includes(flag) || (!!player && (ws.playerFlags[player] || []).includes(flag));
}
/** Every flag a player can use (class unlock requirements read this). */
export const flagsFor = (ws, playerId) => [...new Set([...ws.flags, ...(ws.playerFlags[playerId] || [])])];

// ---------------------------------------------------------------- quests (content is the world builder's; this is the state)

export function startQuest(ws, questId, now = ws.time) {
  if (!ws.quests[questId]) ws.quests[questId] = { step: 0, done: false, startedAt: now, doneAt: null, data: {}, rewarded: {} };
  return ws.quests[questId];
}
/** Move a quest to `step` (numbers or ids, the quest file decides); `data` merges (kill counts, items handed in). */
export function setQuestStep(ws, questId, step, { data = null, now = ws.time } = {}) {
  const q = startQuest(ws, questId, now);
  if (q.done) return q;
  q.step = step;
  if (data) Object.assign(q.data, data);
  return q;
}
/** Count something for a quest (kills toward a goal): returns the new count. */
export function bumpQuest(ws, questId, key, n = 1) {
  const q = startQuest(ws, questId);
  q.data[key] = (q.data[key] || 0) + n;
  return q.data[key];
}
export function completeQuest(ws, questId, now = ws.time) {
  const q = startQuest(ws, questId, now);
  if (!q.done) { q.done = true; q.doneAt = now; }
  return q;
}
export const questOf = (ws, questId) => ws.quests[questId] || null;

/** Each player collects a finished quest's reward once — including players who joined after it was done. */
export function claimQuestReward(ws, questId, playerId) {
  const q = ws.quests[questId];
  if (!q) return { ok: false, why: 'Nobody has started that quest in this world.' };
  if (!q.done) return { ok: false, why: 'That quest is not finished yet.' };
  if (q.rewarded[playerId]) return { ok: false, why: 'You already collected this reward.' };
  q.rewarded[playerId] = true;
  return { ok: true, why: null };
}

// ---------------------------------------------------------------- camps

export function clearCamp(ws, campId, now = ws.time) {
  ws.camps[campId] = { clearedAt: now, times: (ws.camps[campId]?.times || 0) + 1 };
}
function campDef(rules, campId) {
  for (const r of Object.values(rules.data.regions.regions)) if (r.camps?.[campId]) return { region: r, ...r.camps[campId] };
  return null;
}
/** True when the camp has its monsters (never cleared, or its respawn time has passed). */
export function campReady(rules, ws, campId, now = ws.time) {
  const c = ws.camps[campId];
  if (!c) return true;
  const def = campDef(rules, campId);
  return now - c.clearedAt >= (def?.respawnMinutes ?? 20) * 60;
}
/** Camp ids the server should (re)fill now. */
export function campsToRespawn(rules, ws, now = ws.time) {
  const out = [];
  for (const r of Object.values(rules.data.regions.regions)) for (const id of Object.keys(r.camps || {})) if (campReady(rules, ws, id, now)) out.push(id);
  return out;
}

// ---------------------------------------------------------------- shrines

export function discoverShrine(ws, shrineId, playerId = null) {
  const fresh = !ws.shrines.includes(shrineId);
  if (fresh) ws.shrines.push(shrineId);
  if (playerId) setHomeShrine(ws, playerId, shrineId);
  return fresh;
}
export const shrinesKnown = ws => [...ws.shrines];
export function setHomeShrine(ws, playerId, shrineId) {
  ws.players[playerId] = { ...(ws.players[playerId] || {}), shrine: shrineId };
}
export const homeShrine = (ws, playerId) => ws.players[playerId]?.shrine || ws.shrines[0] || null;

export function note(ws, text, now = ws.time) {
  ws.log.push({ at: now, text });
  if (ws.log.length > LOG_MAX) ws.log.splice(0, ws.log.length - LOG_MAX);
}

// ---------------------------------------------------------------- save / load

export function toJSON(ws) { return JSON.parse(JSON.stringify(ws)); }

export function fromJSON(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('oathwild world: not a world save');
  if ((obj.version || 0) > WORLD_VERSION) throw new Error(`oathwild world: saved by a newer version (${obj.version})`);
  const ws = { ...createWorldState({ id: obj.id, name: obj.name, seed: obj.seed }), ...structuredClone(obj) };
  ws.version = WORLD_VERSION;
  for (const k of ['flags', 'shrines', 'log']) if (!Array.isArray(ws[k])) ws[k] = [];
  for (const k of ['playerFlags', 'quests', 'camps', 'chests', 'chestLoot', 'unlocked', 'players']) if (!ws[k] || typeof ws[k] !== 'object') ws[k] = {};
  return ws;
}
