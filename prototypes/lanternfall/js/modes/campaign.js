// Campaign flow (docs/09 §8, 10 §7.4): new game, room changes with room state, lamp-posts (rest, save,
// respawn point, braid), Rekindle, chests, Great Lamps, death + purse, respawn. Pure-ish: talks to the
// save store and the room loader through injected functions so Node tests can drive it.
import { createHero, applyStats, grantXp, killXp, xpNeed } from '../rpg/hero.js';
import { createPlayerBody } from '../entities/player.js';
import { createCaster } from '../spells/cast.js';
import { createMelee } from '../rpg/melee.js';
import { enterRoom } from '../core/state.js';
import { snapshot } from '../save/save.js';

export function setDifficulty(game, id) {
  const d = game.data.difficulty?.byId?.[id] || game.data.difficulty?.byId?.lamplighter || {};
  game.difficultyId = id; game.difficulty = { ...d, damageTaken: 1, telegraph: d.telegraph ?? 1 };
}

/** Build a fresh hero + player body for a class. */
export function newHero(game, classId, opts = {}) {
  const hero = createHero(classId, game.data, opts); game.hero = hero;
  const cls = game.data.classes.byId[classId];
  const p = createPlayerBody(0, 0, { movement: cls.movement || {} }); game.player = p;
  Object.assign(p, { name: hero.name, hp: 1, maxHp: 1, oil: 1, maxOil: 1, team: 'player' });
  applyStats(hero, p, game.data); p.hp = p.maxHp; p.oil = p.maxOil;
  createCaster(p); createMelee(p, game.data.movesets.classes[classId] || game.data.movesets.classes.lamplighter);
  if (cls.passive === 'll_fresh_wick') p.freshWick = true;
  return hero;
}

/** Record the live room's prefab state into game.roomState (called on exit, save and Rekindle). */
export function recordRoomState(game) {
  if (!game.room || !game.things) return;
  const id = game.room.room.id; const rs = game.roomState[id] || (game.roomState[id] = {});
  rs.things = game.things.save();
  // placed enemies that are dead stay dead
  const alive = {}; for (const e of game.entities) if (e.kind === 'enemy' && e.spawnId && !e.dead) alive[e.spawnId] = (alive[e.spawnId] || 0) + 1;
  for (const t of game.room.things) if (t.t === 'spawn') { if (!alive[t.id] && game.seenSpawns?.has(t.id)) rs[t.id] = { cleared: true }; }
}

/** Enter a room by id + entry, restoring its prefab state. loadRoom(id) -> room JSON (injected). */
export async function goToRoom(game, loadRoom, id, entryId) {
  recordRoomState(game);
  const json = await loadRoom(id);
  const saved = game.roomState[id]?.things;
  if (saved) { game.roomState[id] = { ...game.roomState[id] }; }
  enterRoom(game, json, entryId);
  if (saved) game.things && Object.assign(game.roomState, { [id]: { ...game.roomState[id], things: saved } });
  game.seenSpawns = new Set(game.room.things.filter(t => t.t === 'spawn').map(t => t.id));
  game.lastEntry = entryId; game.act = json.act !== 'none' ? json.act : game.act;
  if (!game.visited) game.visited = {}; if (!game.visited[id]) { game.visited[id] = true; game.firstVisit = true; } else game.firstVisit = false;
  game.bus.emit('room.ready', { roomId: id, act: json.act, kind: json.kind, name: json.name });
  return json;
}

/** Lamp-post: light it, rest (full heal + oil + flask), set the respawn point, save. */
export function restAtLampPost(game, T, saves) {
  const p = game.player, h = game.hero;
  if (!T.lit) { T.lit = true; game.bus.emit('lamp.post.lit', { id: T.id }); }
  p.hp = p.maxHp; p.oil = p.maxOil; p.statuses = {}; h.flask = { ...h.flask, charges: h.flask?.max ?? 2 };
  game.lampPost = { room: game.room.room.id, id: T.id, entry: T.id };
  game.atLampPost = true;
  recordRoomState(game);
  const r = saves ? saves.write(game.slot || 1, snapshot(game)) : { ok: true };
  game.bus.emit('lamp.post', { id: T.id, saved: r.ok, reason: r.reason });
  return r;
}

/** Kill bookkeeping: XP (trap kills +50%), counters. Called on bus 'kill'. */
export function onKill(game, e) {
  if (!game.hero || e.kind !== 'enemy' || e.xpGiven) return; e.xpGiven = true;
  const trap = !!e.trapKill || !e.lastSource || e.lastSource?.id === 'hollow';
  const xp = killXp(e.def, e.level || 1, game.hero.level, { trap, elite: e.elite }) * (game.difficulty?.xp ?? 1);
  grantXp(game.hero, Math.round(xp), game.data, game.bus); applyStats(game.hero, game.player, game.data);
  game.stats = game.stats || {}; game.stats.kills = (game.stats.kills || 0) + 1; if (trap) game.stats.trapKills = (game.stats.trapKills || 0) + 1;
  if (trap && !game.flags.first_trap_kill) { game.flags.first_trap_kill = true; game.bus.emit('narrate', { line: 'narr_first_trap_kill' }); }
}

/** Relight a Great Lamp: flag, one full level of XP, a skill point, the relight sweep. */
export function relightGreatLamp(game, act, saves) {
  if (game.flags[`lamp_${act}`]) return; game.flags[`lamp_${act}`] = true;
  const h = game.hero; grantXp(h, xpNeed(h.level), game.data, game.bus); h.unspent.skill += 1; h.maxHpDebt = 0;
  applyStats(h, game.player, game.data); game.player.hp = game.player.maxHp;
  game.relightT = game.time; game.bus.emit('lamp.great', { act });
  if (saves) saves.write(game.slot || 1, snapshot(game));
}

/** Death: purse of pennies left where you fell, then respawn at the last lamp-post (loadRoom injected). */
export function onDeath(game, { countDeath = true } = {}) {
  const h = game.hero, pct = game.difficulty?.purse ?? 0.25;
  const lost = Math.floor((h.currency.pennies || 0) * pct);
  if (lost > 0 && game.room) { h.currency.pennies -= lost; game.purse = { room: game.room.room.id, x: game.player.x, y: game.player.y - 4, amount: lost }; }
  game.stats = game.stats || {}; if (countDeath) game.stats.deaths = (game.stats.deaths || 0) + 1;
  return lost;
}
export async function respawn(game, loadRoom, saves) {
  const lp = game.lampPost; const h = game.hero, p = game.player;
  // restore what the lamp-post save held for the hero's run state (gear/xp stay: deaths cost the purse only)
  p.dead = false; p.hp = p.maxHp; p.oil = p.maxOil; p.statuses = {}; p.invuln = 1; h.flask = { ...h.flask, charges: h.flask?.max ?? 2 };
  const roomId = lp?.room || game.startRoom, entry = lp?.id;
  await goToRoom(game, loadRoom, roomId, entry);
  if (lp) { const T = game.things.byId[lp.id]; if (T) { p.x = T.x + 10; p.y = T.y; p.px = p.x; p.py = p.y; } }
  game.bus.emit('player.respawn', {});
}

/** Rekindle: stream the room back to its template, keep prefab state, refund built parts, you at the entry. */
export async function rekindleRoom(game, loadRoom) {
  recordRoomState(game);
  const id = game.room.room.id, entry = game.lastEntry || Object.keys(game.room.entries)[0];
  await goToRoom(game, loadRoom, id, entry);
  game.stats = game.stats || {}; game.stats.rekindled = (game.stats.rekindled || 0) + 1;
  game.bus.emit('rekindle', { roomId: id }); game.bus.emit('narrate', { line: 'narr_rekindle' });
}

/** What each lesson / hub node hands over the first time you enter it (docs/09 §6.0, canon ladder 00 §6.2). */
export const NODE_GIFTS = {
  a1_n03: { flames: ['rime'], shapes: ['lob'], wickSlots: 2, mechanics: ['wick_builder'], say: 'Brother Seld presses a Rime strand into your hand. The Wick builder is yours: braid at any lamp-post.' },
  a1_n06: { mechanics: ['plank_kit', 'heavy', 'plunge'], say: 'The plank kit, and the heavy swing: hold the pole button.' },
  a2_n02: { shapes: ['tether'], mechanics: ['grapple'], say: 'The Hookwright fits a grapple to your belt.' },
  a2_n03: { flames: ['spark'], mechanics: ['wiring', 'traps'] },
  a2_n05: { flames: ['bile'] },
  a2_n06: { charms: ['split'], charmSlots: 1, overcharge: true, gutter: true, mechanics: ['skill_board', 'affixes'], say: 'One charm socket, and overcharge: hold cast to pour in more oil.' },
  a3_n01: { mechanics: ['swimming'] },
  a3_n02: { flames: ['tide'], wickSlots: 3, charmSlots: 2, mechanics: ['sluices', 'currents'] },
  a3_n06: { charms: ['linger'] },
  a4_n01: { flames: ['gleam'], mechanics: ['darkness', 'hood'] },
  a4_n02: { knots: ['on_hit', 'on_kill'] },
  a4_n05: { flames: ['shade'] },
  a5_n02: { wickSlots: 4 },
  a5_n03: { charms: ['echo'], mechanics: ['gravity', 'bells'] },
  a6_n02: { charmSlots: 3, mechanics: ['mastery', 'wind'] },
};
export function giveNodeGifts(game, nodeId) {
  const g = NODE_GIFTS[nodeId], h = game.hero; if (!g || !h || h.flags?.[`gift_${nodeId}`]) return null;
  h.flags ||= {}; h.flags[`gift_${nodeId}`] = true; const U = h.unlocked;
  for (const k of ['flames', 'shapes', 'charms', 'knots', 'mechanics']) for (const id of g[k] || []) if (!U[k].includes(id)) { U[k].push(id); game.bus.emit('unlock', { kind: k.slice(0, -1), id, name: id.replace(/_/g, ' ') }); }
  if (g.wickSlots) U.wickSlots = Math.max(U.wickSlots, g.wickSlots);
  if (g.charmSlots) U.charmSlots = Math.max(U.charmSlots, g.charmSlots);
  if (g.overcharge) U.overcharge = true; if (g.gutter) U.gutter = true;
  if (U.mechanics.includes('grapple')) game.flags.have_grapple = true;
  if (nodeId === 'a1_n03' && h.wicks.length < 2) h.wicks.push({ id: 'w2', flame: 'rime', shape: 'lob', charms: [] });
  if (g.flames?.includes('tide')) for (const w of h.wicks) w.dry = false;
  return g;
}
