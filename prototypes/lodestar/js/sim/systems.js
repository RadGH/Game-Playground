// The ordered list of systems step() runs (PLAN §4.1 — APPEND ONLY; reordering needs PLAN updated). Each row:
//   { name, every, phase?, run(sim) }  — runs on ticks where tick % every === (phase || 0).
// `every` may name a data value ('economy' = balance.economy.every, 'sight' = balance.sight.every).
// Later milestones append their rows below the marker (M4 defence, M5 units, M6 mana, M7 town ...).

import { ensureTown } from './town/index.js'; // M7
import { installMana } from './mana/index.js'; // M6

export const SYSTEMS = [
  { name: 'world', every: 1, run: (s) => s.world.step() },            // M1 cell rules (fire, gas, debris, slow pass)
  { name: 'events', every: 1, run: (s) => s.drainWorld() },           // world events → sim events
  { name: 'fog', every: 'sight', run: (s) => s.updateFog() },         // sensor fog (js/world/fog.js) + outcrops seen
  { name: 'survey', every: 1, run: (s) => s.survey.step() },          // thumper pulses
  { name: 'production', every: 'economy', run: (s) => s.production.step() }, // power, recipes, keep-in-stock, lamps
  { name: 'dispatch', every: 'economy', phase: 2, run: (s) => s.dispatcher.dispatch() }, // wants/offers → jobs
  { name: 'vehicles', every: 1, run: (s) => s.dispatcher.stepVehicles() }, // jobs move forward on arrival
  { name: 'builders', every: 1, run: (s) => s.construction.step() },  // sites and roads
  { name: 'movers', every: 1, run: (s) => s.movers.step() },          // everything with a route walks one tick
  { name: 'unlocks', every: 20, phase: 7, run: (s) => s.unlocks.step() },
  { name: 'outcrops', every: 100, phase: 11, run: (s) => s.survey.recount() },
  // ---- append new systems below (M4, M5, M6, M7 ...) ----
  { name: 'town', every: 1, run: (s) => ensureTown(s).tick() },       // M7: settlers walk; homes, meals, jobs, morale, farms, chimneys every balance.town.every
  { name: 'mana', every: 1, run: (s) => installMana(s).step() },     // M6: regen, refined jars → store, batteries, spells in flight and standing, Glow, crystal regrowth
  { name: 'defence.levels', every: 20, phase: 1, run: (s) => s.defence.levelsStep() },   // M4: global Wall / tower levels from the unlock list
  { name: 'defence.walls', every: 20, phase: 4, run: (s) => s.defence.walls.step() },    // M4: fire on timber walls, Wall V mending, rebuild after a raid
  { name: 'defence.fields', every: 20, phase: 6, run: (s) => s.defence.fields.step() },  // M4: the Noise and Glow fields
  { name: 'defence.nests', every: 20, phase: 8, run: (s) => s.defence.nests.step() },    // M4: nests feed, grow, bud, send raids
  { name: 'defence.raids', every: 1, run: (s) => s.defence.raids.step() },               // M4: raid flow fields, spawning, beaten / withdrawn
  { name: 'defence.enemies', every: 1, run: (s) => s.defence.enemies.step() },           // M4: enemies walk, bite, spit
  { name: 'defence.towers', every: 1, run: (s) => s.defence.towers.step() },             // M4: towers shoot, shots land
  { name: 'defence.damage', every: 20, phase: 10, run: (s) => s.defence.slowStep() },    // M4: fire on buildings, lost carriers replaced, the crippled HQ
];
