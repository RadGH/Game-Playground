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

/**
 * An engine for the PARITY fixtures: Thousandvale's one deliberate divergence in the hit maths — the
 * level-gap softening (js/rules/level-gap.js, play-test 1 P26) — is switched off, because Farhold has no
 * such rule (and so is play-test 3's kill-experience multiplier). Nothing else is excluded: perks and talents are empty on a parity character, and the
 * range preflight (P23) never refuses a cast the fixtures make.
 */
export async function parityEngineFor(seed = 1) {
  const e = await engineFor(seed);
  e.levelGap = null;
  e.xpCfg = e.balance.xp;          // play-test 3 R2: Thousandvale pays kills x1.5; Farhold does not
  return e;
}

/** A room with a field and a combat pipeline on flat ground. */
export function roomFor(engine, { id = 'r1', seed = 1, rng = null, terrain = flatTerrain() } = {}) {
  const room = createRoomContext({ id, seed, engine, rng });
  attachField(room, { terrain });
  room.combat = createCombat(room);
  return room;
}
