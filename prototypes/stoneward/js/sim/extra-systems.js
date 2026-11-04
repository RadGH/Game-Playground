import { createPowers } from './powers.js';
// More sim systems, one line each: [name on sim, factory(sim, data)]. Run after town, discovery and
// routes, in this order. A system is { id, step(sim), order?(o), view?(rect) }; view() output is
// sent to the page every tick under its id.
import { createWalls } from './walls.js';
import { createMilitary } from './military.js';
import { createRivals } from './rivals.js';
import { createUnlock } from './unlock.js';
import { createProgress } from './progress.js';
import { createTrains } from './logistics/trains.js';
import { createWildfire } from './wildfire.js';

export default [
  ['walls', createWalls],
  ['trains', createTrains],
  ['powers', createPowers],
  ['military', createMilitary],
  ['rivals', createRivals],
  ['unlockSys', createUnlock],
  ['progress', createProgress],
  ['wildfire', createWildfire],
];
