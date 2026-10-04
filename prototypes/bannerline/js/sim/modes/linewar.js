// LINE WAR — the first Bannerline mode (the old lane-war maps): two teams, each guarding a Keep at the
// bottom of its own field, sending units down the enemy's field and defending its own with heroes.
// Gold is the only limit on sending; the Rising Tide and the hard cap end the match.
// Everything specific to line war lives behind this object (modes/index.js documents the contract).

import { buildMap } from '../map.js';
import { secToTicks } from '../state.js';
import { makeRunTimers } from '../core.js';
import { releaseTick, payTick, admitWaiting } from '../economy.js';
import { tideTick } from '../tides.js';
import { tickStatuses } from '../statuses.js';
import { heroTick } from '../heroes.js';
import { moveTick } from '../movement.js';
import { runAttacks, projectileLands } from '../combat.js';
import { traitTick } from '../traits.js';
import { skillPulse, boltLands, groundLands, trailTick } from '../skills.js';
import { zoneTick } from '../zones.js';
import { upgradeTick } from '../upgrades.js';
import { powerLands } from '../powers.js';
import { tollTick } from '../commands.js';
import { aiCommands } from '../ai/index.js';
import { turretTick } from '../turrets.js';
import { keepGuardTick } from '../keep.js';

const TIMERS = { proj: projectileLands, pulse: skillPulse, bolt: boltLands, ground: groundLands, power: powerLands };

/** Banners gone, or the hard cap (more banners wins; equal: more banners torn from the enemy). */
function checkResult(ctx) {
  const { state, data } = ctx;
  if (state.result || state.endless) return;
  const [a, b] = state.teams;
  let winner = null, reason = null;
  if (a.banners <= 0 || b.banners <= 0) {
    reason = 'banners';
    winner = a.banners <= 0 && b.banners <= 0 ? (a.banners === b.banners ? -1 : (a.banners > b.banners ? 0 : 1)) : (a.banners <= 0 ? 1 : 0);
  } else if (state.tick >= secToTicks(data.econ.clock.hardCap)) {
    reason = 'cap';
    if (a.banners !== b.banners) winner = a.banners > b.banners ? 0 : 1;
    else if (a.dealt !== b.dealt) winner = a.dealt > b.dealt ? 0 : 1;
    else winner = -1;
  }
  if (reason) {
    state.result = { winner, reason, tick: state.tick };
    ctx.emit('result', { winner, reason });
  }
}

export default {
  id: 'linewar',
  name: 'Line War',
  desc: 'Send units down the enemy field, hold your own with your hero. Last team with banners wins.',
  formats: ['1v1', '2v2', '3v3'],
  defaultFormat: '1v1',
  heroes: null,     // all heroes
  races: null,      // all races
  validate(config, data) {
    const n = +config.format[0];
    for (const t of [0, 1]) {
      const k = config.players.filter(p => p.team === t).length;
      if (k > n) throw new Error(`${config.format} allows ${n} player(s) per team, team ${t + 1} has ${k}`);
    }
  },
  buildMap: (data, format) => buildMap(data, 'vale', format, 2),
  initState() { /* line war's teams, banners and fields are built by the core createState today */ },
  timers: TIMERS,
  phases: [
    tollTick, payTick, releaseTick, tideTick, admitWaiting,
    upgradeTick,   // Drill Yard upgrades stamped on new / upgraded units (stream I)
    makeRunTimers(TIMERS), tickStatuses, zoneTick, trailTick, heroTick, moveTick, runAttacks, keepGuardTick, traitTick, turretTick,
  ],
  checkResult,
  commands: {},
  ai: aiCommands,
};
