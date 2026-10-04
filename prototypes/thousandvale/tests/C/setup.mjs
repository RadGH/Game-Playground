// Shared test setup for stream C: load the rules data from disk (node), build engines and rooms.
import { readFileSync } from 'node:fs';
import { loadRulesData } from '../../js/rules/data.js';
import { createEngine } from '../../js/rules/engine.js';
import { createRoomContext } from '../../js/rules/room.js';
import { attachField } from '../../js/rules/field.js';
import { createCombat } from '../../js/rules/cast.js';
import { flatTerrain } from '../../js/rules/terrain-flat.js';

export const readJson = u => JSON.parse(readFileSync(u, 'utf8'));
export const loadData = () => loadRulesData(readJson);

/** A fresh engine (fresh data — the engine mutates items in memory). */
export async function engineFor(seed = 1) {
  return createEngine(await loadData(), { seed });
}

/** A room with a field and a combat pipeline on flat ground. */
export function roomFor(engine, { id = 'r1', seed = 1, rng = null, terrain = flatTerrain() } = {}) {
  const room = createRoomContext({ id, seed, engine, rng });
  attachField(room, { terrain });
  room.combat = createCombat(room);
  return room;
}
