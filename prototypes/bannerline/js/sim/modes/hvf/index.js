// HUNTERS VS FARMERS — the second Bannerline mode (docs/hvf-PLAN.md; owner title "Hunters vs Farmers").
// Farmers (2-9) hide in a generated forest, raise animals for gold and later an army; hunters (1-3)
// track them down. This is the mode's entry module in the shape of js/sim/modes/linewar.js, so the
// registry (js/sim/modes/index.js, stream A) can list it.
//
// STATUS (stream H): H1 done — the world generator (./mapgen.js) and its viewer (hvf-map.html).
// The match itself (H2: state, phases, commands, rules) is not built yet, so `playable` is false and
// createState throws a readable error. What the framework needs from stream A to run this mode is in
// docs/requests.md ("Stream H"): buildMap gets the seed, the mode builds its own state (seats carry a
// `role`, not a race or hero), and data/hvf/*.json join the data bundle as `data.hvf`.

import { worldForFormat } from './mapgen.js';

// mirrors data/hvf/rules.json `formats` (tests/hvf-mapgen.test.js checks the two agree)
export const FORMATS = ['2v1', '3v1', '4v1', '4v2', '5v2', '6v2', '7v2', '8v2', '6v3', '7v3', '8v3', '9v3'];
export const DATA_FILES = ['hvf/rules.json', 'hvf/mapgen.json'];

/** The mode's data (data.hvf once A loads per-mode files; a bundle with { rules, mapgen } works too). */
const hvfData = data => (data && data.hvf) || data;

export default {
  id: 'hvf',
  name: 'Hunters vs Farmers',
  desc: 'Farmers hide in the forest and raise animals for gold; hunters track them by the animals they leave in the open. Late on, the farmers turn the hunt around.',
  formats: FORMATS,
  defaultFormat: '5v2',
  playable: false,
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

  createState() { throw new Error('Hunters vs Farmers is not playable yet: the forest generator is ready (hvf-map.html), the match arrives in H2.'); },
  initState() {},
  phases: [],
  checkResult() {},
  commands: {},
  ai: () => [],
};
