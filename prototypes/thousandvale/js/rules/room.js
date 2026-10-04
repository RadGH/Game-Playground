// Thousandvale — the ROOM CONTEXT: every piece of combat state that Farhold keeps in a module
// variable, held per room instead (PLAN §6.1, review B1).
//
// Farhold is a single-player game, so a few of its pure modules keep "the world" globally:
//
//   skillmech.js  `world = { placed, corpses, walls, nextId }`   traps, posts, banners, corpses, walls
//   skillmech.js  `ENV` via setMechEnv                            how a hit rule reaches the field
//   skills.js     statusFx / statusPulse / statusExpire hooks     what a status does as it lands/ends
//
// A server process steps many rooms (province copies, towns, dungeon instances) one after another
// on one thread. `room.run(fn)` swaps that room's lists and hooks INTO those module slots, runs the
// room's work, reads the lists back OUT (skillmech sometimes replaces an array rather than mutating
// it — `takeCorpses`, the corpse tick), and restores whatever was there before. Rooms never step
// concurrently on one thread, so the swap is safe; a nested run of a DIFFERENT room throws, because
// that would be the one way to leak. tests/C/room-leak.test.mjs proves two rooms never see each
// other's corpses, traps, walls or status hooks.
//
// No Farhold file is edited for this: the module slots are exported, and we only assign to them.

import {
  mechWorld, setMechEnv, mechEnv, setStatusFx, setStatusPulse, setStatusExpire,
} from './farhold.js';
import { createStreams, createClock } from './rng.js';

let active = null;          // the room whose state is in the module slots right now

/** The room currently swapped in, or null — for code that must refuse to run outside one. */
export function activeRoom() { return active; }

/**
 * `id` names the room in errors. `seed` seeds its rng streams ('combat', 'ai', 'loot', 'spawn').
 * `clock`: a js/rules/rng.js clock; the room's owner advances it once per tick.
 * `engine` is js/rules/engine.js's engine (shared by every room in the process).
 */
export function createRoomContext({ id = 'room', seed = 1, engine = null, clock = null, rng = null } = {}) {
  // `rng`: one generator for EVERY stream. Only the parity fixtures use it, because Farhold's
  // EnemyField draws its spawns, its strikes and its wandering from a single rng.
  const streams = rng ? { seed, get: () => rng } : createStreams(seed);
  const room = {
    id,
    engine,
    streams,
    rng: streams.get('combat'),
    clock: clock || createClock(0),
    /** skillmech's world, this room's copy. */
    mech: { placed: [], corpses: [], walls: [], nextId: 1 },
    /** the skillmech ENV for this room — js/rules/cast.js fills it (strikeArea, near, taunt, …). */
    env: {},
    /** what statuses did while this room ran: [{ kind:'statusFx'|'statusPulse'|'statusExpire', unit, type, on }] */
    events: [],
    /** extra per-room hook for a status that bursts as it ends (cast.js sets it). */
    onStatusExpire: null,
    run(fn) { return runIn(room, fn); },
    /** take (and clear) the events the client should hear about since the last drain */
    drainEvents() { const out = room.events; room.events = []; return out; },
  };
  room.env.rng = room.rng;
  room.env.now = () => room.clock.now();
  return room;
}

function runIn(room, fn) {
  if (active === room) return fn(room);              // re-entry by the same room is harmless
  if (active) throw new Error(`room context: "${room.id}" tried to run inside "${active.id}"`);
  const saved = {
    placed: mechWorld.placed, corpses: mechWorld.corpses, walls: mechWorld.walls, nextId: mechWorld.nextId,
    env: mechEnv(),
  };
  mechWorld.placed = room.mech.placed;
  mechWorld.corpses = room.mech.corpses;
  mechWorld.walls = room.mech.walls;
  mechWorld.nextId = room.mech.nextId;
  setMechEnv(room.env);
  setStatusFx((unit, type, on) => room.events.push({ kind: 'statusFx', unit, type, on: !!on }));
  setStatusPulse((unit, type) => room.events.push({ kind: 'statusPulse', unit, type }));
  setStatusExpire((unit, type, st) => {
    room.events.push({ kind: 'statusExpire', unit, type });
    room.onStatusExpire?.(unit, type, st);
  });
  active = room;
  try {
    return fn(room);
  } finally {
    // read back: skillmech may have REPLACED an array (takeCorpses, the corpse tick)
    room.mech.placed = mechWorld.placed;
    room.mech.corpses = mechWorld.corpses;
    room.mech.walls = mechWorld.walls;
    room.mech.nextId = mechWorld.nextId;
    mechWorld.placed = saved.placed;
    mechWorld.corpses = saved.corpses;
    mechWorld.walls = saved.walls;
    mechWorld.nextId = saved.nextId;
    setMechEnv(saved.env);
    setStatusFx(null); setStatusPulse(null); setStatusExpire(null);
    active = null;
  }
}
