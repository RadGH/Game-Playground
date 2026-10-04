// HUNTERS VS FARMERS — the second Bannerline mode (docs/hvf-PLAN.md; owner title "Hunters vs Farmers").
// Farmers (2-9) hide in a generated forest, raise animals for gold and later an army; hunters (1-3)
// track them down. This is the mode's entry module in the shape of js/sim/modes/linewar.js, so the
// registry (js/sim/modes/index.js, stream A) can list it.
//
// STATUS (stream H): H1 done — the world generator (./mapgen.js) and its viewer (hvf-map.html).
// H2 sim: state (./state.js), farm + breeding + income (./farm.js), animals (./animals.js),
// characters (./units.js), fog (./vision.js), commands (./commands.js), queries (./query.js).
// `playable` stays false until the view (stream B) and the framework hooks exist. What the framework needs from stream A to run this mode is in
// docs/requests.md ("Stream H"): buildMap gets the seed, the mode builds its own state (seats carry a
// `role`, not a race or hero), and data/hvf/*.json join the data bundle as `data.hvf`.

import { worldForFormat } from './mapgen.js';
import { createHvfState, FARMERS, HUNTERS, entById } from './state.js';
import { breedTick, incomeTick } from './farm.js';
import { animalTick, noiseTick } from './animals.js';
import { hunterKitTick } from './hunter.js';
import { armyTick, towerTick } from './army.js';
import { turnTick } from './turn.js';
import { unitTick } from './units.js';
import { visionTick, updateVision } from './vision.js';
import { HVF_COMMANDS } from './commands.js';
import * as queries from './query.js';
import { hvfAi } from './ai/index.js';   // stream E

// mirrors data/hvf/rules.json `formats` (tests/hvf-mapgen.test.js checks the two agree)
export const FORMATS = ['2v1', '3v1', '4v1', '4v2', '5v2', '6v2', '7v2', '8v2', '6v3', '7v3', '8v3', '9v3'];
export const DATA_FILES = ['hvf/rules.json', 'hvf/mapgen.json', 'hvf/units.json', 'hvf/animals.json', 'hvf/buildings.json', 'hvf/hunter.json', 'hvf/hunter-items.json', 'hvf/ai.json'];

/** The mode's data (data.hvf once A loads per-mode files; a bundle with { rules, mapgen } works too). */
const hvfData = data => (data && data.hvf) || data;

/** Hunters leave their kennels when the head start runs out. */
function releaseTick(ctx) {
  if (ctx.state.tick === ctx.state.hvf.releaseTick) ctx.emit('released', { tick: ctx.state.tick });
}

/** Hunters win the moment every farmer is a ghost; farmers win when every hunter is out, or on the clock. */
export function checkResult(ctx) {
  const { state } = ctx;
  if (state.result) return;
  const farmers = state.players.filter(p => p.role === 'farmer'), hunters = state.players.filter(p => p.role === 'hunter');
  let winner = null, reason = null;
  if (farmers.length && farmers.every(p => p.ghost)) { winner = HUNTERS; reason = 'caught'; }
  else if (hunters.length && hunters.every(p => p.out)) { winner = FARMERS; reason = 'hunted'; }
  else if (state.tick >= state.hvf.endTick) { winner = FARMERS; reason = 'clock'; }
  if (reason) { state.result = { winner, reason, tick: state.tick }; ctx.emit('result', { winner, reason }); }
}

export default {
  id: 'hvf',
  name: 'Hunters vs Farmers',
  desc: 'Farmers hide in the forest and raise animals for gold; hunters track them by the animals they leave in the open. Late on, the farmers turn the hunt around.',
  formats: FORMATS,
  defaultFormat: '5v2',
  playable: true,
  heroes: [],       // no heroes: seats carry a role
  races: [],
  roles: ['farmer', 'hunter'],
  dataFiles: DATA_FILES,

  /** Seats per role must match the format ("6v2" = 6 farmers, 2 hunters). */
  validate(config, data) {
    const f = hvfData(data).rules.formats[config.format];
    if (!f) throw new Error(`Hunters vs Farmers has no format "${config.format}"`);
    const players = config.players || [];
    const n = role => players.filter(p => p.role === role).length;
    if (players.some(p => p.role !== 'farmer' && p.role !== 'hunter')) throw new Error('Every Hunters vs Farmers seat needs a role: farmer or hunter');
    if (n('farmer') !== f.farmers || n('hunter') !== f.hunters) throw new Error(`${config.format} needs ${f.farmers} farmers and ${f.hunters} hunter${f.hunters > 1 ? 's' : ''} (got ${n('farmer')} and ${n('hunter')})`);
  },

  /** The forest for this match: static, rebuilt from the seed on restore (never in state). */
  buildMap(data, format, config = {}) {
    return worldForFormat(hvfData(data), (config.seed ?? 1) >>> 0, format, config.rules && config.rules.size);
  },

  /** The mode builds its own state (seats carry roles; no races, heroes, lanes or banners). */
  createState(config, data, map) {
    const state = createHvfState({ ...config, format: config.format }, data, map);
    const ctx = { state, data, map, emit: () => {} };
    updateVision(ctx, FARMERS); updateVision(ctx, HUNTERS);
    return state;
  },
  initState() {},
  // §2.2 order: release -> build/breed -> income -> noise + tracks -> animals -> characters -> the
  // hunter's kit (hawk, hound, wards, snares, lodges) -> army -> towers -> vision -> the Turn
  phases: [releaseTick, breedTick, incomeTick, noiseTick, animalTick, unitTick, hunterKitTick, armyTick, towerTick, visionTick, turnTick],
  checkResult,
  commands: HVF_COMMANDS,
  queries,
  ai: hvfAi,   // stream E: js/sim/modes/hvf/ai/ (farmer + hunter, three difficulties, data/hvf/ai.json)
};
