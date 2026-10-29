// The machine registry: ONE LINE PER MACHINE (PLAN §4.1 — append only). desk.js mounts every machine whose
// data/console.json row is unlocked, and a crate delivers the rest. A machine with no line here yet (its milestone has
// not landed) is delivered as a placeholder panel naming what it will be.
export const MACHINES = {
  scope: () => import('./scope-bezel.js').then(m => m.mountScope),
  range: () => import('./range.js').then(m => m.mountRange),
  filter: () => import('./filter.js').then(m => m.mountFilter),
  toolbank: () => import('./toolbank.js').then(m => m.mountToolbank),
  timedial: () => import('./timedial.js').then(m => m.mountTimeDial),
  teletype: () => import('./teletype.js').then(m => m.mountTeletype),
  radio: () => import('./radio.js').then(m => m.mountRadio),
  alarms: () => import('./alarms.js').then(m => m.mountAlarms),
  dayclock: () => import('./dayclock.js').then(m => m.mountDayClock),
  ledger: () => import('./ledger.js').then(m => m.mountLedger),
  town: () => import('./town.js').then(m => m.mountTown), // M7
  gauge: () => import('./gauge.js').then(m => m.mountGauge), // M6
  spellboard: () => import('./spellboard.js').then(m => m.mountSpellBoard), // M6
};
