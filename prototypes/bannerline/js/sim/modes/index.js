// Game modes (owner round 2, R2.10). Bannerline is a sandbox RTS: line wars is ONE mode. createSim
// asks the registry for the mode named in config.mode and the mode supplies everything that is not
// shared core: its formats, which heroes/races it allows, its map, the per-tick phase order, its end
// rule, extra commands and its AI.
//
//   config.mode   'linewar' (default). For backward compatibility '1v1' / '2v2' / '3v3' still mean
//                 line war in that format.
//   config.format line war: '1v1' | '2v2' | '3v3'
//
// A MODE is a plain object:
//   { id, name, desc, formats: [..], defaultFormat, heroes: [ids] | null (all), races: [ids] | null,
//     validate(config, data) -> throws on a bad config,
//     buildMap(data, format) -> sim.map,
//     initState(state, data, map, config),          // mode-specific state after the core creates players + heroes
//     phases: [fn(ctx), ...],                       // per-tick order, after commands
//     checkResult(ctx),                             // sets state.result when the match ends
//     commands: { type: fn(ctx, player, cmd) -> reason | null },   // extra command types
//     ai: fn(ctx, player) -> [commands] }
//
// PLANNED (documented, not built — R2.20): 'hvf' Hunters vs Farmers (designed by another agent),
// 'td' tower defense, 'moba', 'empires' (heroes and empires). Nothing here assumes lanes, banners or
// sends outside linewar.js, so those can bring their own map, economy and win rule.

import linewar from './linewar.js';

export const MODES = { linewar };
export const PLANNED = [
  { id: 'hvf', name: 'Hunters vs Farmers', status: 'designing (round 2, R2.12-R2.19)' },
  { id: 'td', name: 'Tower defense', status: 'parked (R2.20)' },
  { id: 'moba', name: 'Lanes and towers', status: 'parked (R2.20)' },
  { id: 'empires', name: 'Heroes and Empires', status: 'parked (R2.20)' },
];

const LEGACY_FORMATS = ['1v1', '2v2', '3v3'];

/** The mode and format a config asks for (old configs that put '1v1' in `mode` still work). */
export function resolveMode(config) {
  let id = config.mode || 'linewar', format = config.format;
  if (LEGACY_FORMATS.includes(id)) { format = format || id; id = 'linewar'; }
  const mode = MODES[id];
  if (!mode) throw new Error(`Unknown game mode "${id}" (available: ${Object.keys(MODES).join(', ')})`);
  format = format || mode.defaultFormat;
  if (!mode.formats.includes(format)) throw new Error(`${mode.name} has no format "${format}" (available: ${mode.formats.join(', ')})`);
  return { mode, format };
}

/** For the lobby: every mode with its formats and allowed heroes/races. */
export function modeList(data) {
  return Object.values(MODES).map(m => ({
    id: m.id, name: m.name, desc: m.desc, formats: m.formats, defaultFormat: m.defaultFormat,
    heroes: m.heroes || Object.keys(data.heroes.heroes), races: m.races || Object.keys(data.races.races), playable: true,
  })).concat(PLANNED.map(p => ({ ...p, playable: false })));
}
