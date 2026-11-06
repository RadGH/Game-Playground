// Research projects, bought at a station's research lab with research points.
//
// Points come from selling alien specimens (and donating relic cores / survey data) at a lab.
// A finished project lives in G.research.done (ids). Most projects are ship bonuses: researchBonus(G)
// adds them up into one small object, applyResearch(body, G) puts it on body.bonus and recomputes, and
// ship.js recompute() reads body.bonus every time — so the bonus survives later recomputes (a block shot
// off, build mode). A few projects are not ship stats: alien weapon licences (the outfitter reads
// hasLicence), better loot (researchLootBonus — for the loot roller), better prices (priceEdge — the
// market reads it) and richer wreck lots (salvageEdge).
//
// Pure data + pure functions. No DOM.

import { recompute } from './ship.js';

/**
 * Every project. `cost` in research points; `need` = projects that must be done first;
 * `seen` = you must have handed a specimen of that race to a lab first (licences).
 * `bonus` keys: cargo/shield/thrust/turn/repair/power are multipliers (0.15 = +15%),
 * cpu/crew/drones are flat additions.
 */
export const PROJECTS = [
  { id: 'holds1', name: 'Compressed holds', cost: 20, bonus: { cargo: 0.15 }, blurb: '+15% cargo space.' },
  { id: 'holds2', name: 'Folded-space holds', cost: 90, need: ['holds1'], bonus: { cargo: 0.2 }, blurb: '+20% more cargo space.' },
  { id: 'thrust1', name: 'Cleaner burn', cost: 25, bonus: { thrust: 0.1 }, blurb: '+10% engine thrust: faster top speed and acceleration.' },
  { id: 'thrust2', name: 'Vector tuning', cost: 100, need: ['thrust1'], bonus: { thrust: 0.1, turn: 0.15 }, blurb: '+10% more thrust and +15% turning.' },
  { id: 'shield1', name: 'Resonant emitters', cost: 30, bonus: { shield: 0.1 }, blurb: '+10% shield strength.' },
  { id: 'shield2', name: 'Layered fields', cost: 120, need: ['shield1'], bonus: { shield: 0.15 }, blurb: '+15% more shield strength.' },
  { id: 'cpu1', name: 'Compiler tricks', cost: 30, bonus: { cpu: 2 }, blurb: '+2 CPU on any ship.' },
  { id: 'cpu2', name: 'Thinking hull', cost: 110, need: ['cpu1'], bonus: { cpu: 5 }, blurb: '+5 more CPU.' },
  { id: 'crew1', name: 'Hot bunking', cost: 25, bonus: { crew: 2 }, blurb: '+2 crew space.' },
  { id: 'power1', name: 'Hot reactors', cost: 60, bonus: { power: 0.1 }, blurb: '+10% power from every reactor and fuel cell.' },
  { id: 'repair1', name: 'Nanite patching', cost: 40, bonus: { repair: 0.5 }, blurb: 'Repair drones work 50% faster.' },
  { id: 'drones1', name: 'Drone autopilot', cost: 70, bonus: { drones: 1 }, blurb: 'Your drone bays carry 1 extra drone (needs a bay).' },
  { id: 'haggle', name: 'Market models', cost: 50, blurb: 'Every market buys from you 4% higher and sells to you 4% lower.' },
  { id: 'salvage1', name: 'Wreck reading', cost: 40, blurb: 'Salvage yard wreck lots pay out 25% more.' },
  { id: 'luck1', name: 'Signal sifting', cost: 90, blurb: 'Better odds of rare parts from wrecks.' },
  { id: 'luck2', name: 'Deep sifting', cost: 260, need: ['luck1'], blurb: 'Much better odds of rare parts from wrecks.' },
  { id: 'lic_vesh', name: 'Vesh weapon licence', cost: 80, seen: 'vesh', licence: 'vesh', blurb: 'Outfitters may sell you Vesh bio-weapons.' },
  { id: 'lic_lattice', name: 'Lattice weapon licence', cost: 110, seen: 'lattice', licence: 'lattice', blurb: 'Outfitters may sell you Lattice lightning weapons.' },
  { id: 'lic_ossari', name: 'Ossari weapon licence', cost: 140, seen: 'ossari', licence: 'ossari', blurb: 'Outfitters may sell you Ossari crystal weapons.' },
  { id: 'lic_kharr', name: 'Kharr weapon licence', cost: 170, seen: 'kharr', licence: 'kharr', blurb: 'Outfitters may sell you Kharr forge weapons.' },
];
export const PROJECT_BY_ID = Object.fromEntries(PROJECTS.map(p => [p.id, p]));

const done = G => G?.research?.done || [];
const has = (G, id) => done(G).includes(id);

/** Can this project be started now? Returns null if yes, or a plain reason why not. */
export function projectBlock(G, p) {
  if (has(G, p.id)) return 'Done';
  for (const n of p.need || []) if (!has(G, n)) return `Needs ${PROJECT_BY_ID[n].name} first`;
  if (p.seen && !G.research?.seen?.[p.seen]) return 'Hand a specimen of this race to a lab first';
  if ((G.research?.points || 0) < p.cost) return `Needs ${p.cost} points`;
  return null;
}

/** Spend points on a project. Returns true if it was done. */
export function doProject(G, id) {
  const p = PROJECT_BY_ID[id]; if (!p || projectBlock(G, p)) return false;
  G.research.points -= p.cost; G.research.done.push(id);
  return true;
}

/** All finished ship bonuses added up: { cargo, shield, thrust, turn, repair, power (multipliers 1+x), cpu, crew, drones (flat) }. */
export function researchBonus(G) {
  const b = { cargo: 1, shield: 1, thrust: 1, turn: 1, repair: 1, power: 1, cpu: 0, crew: 0, drones: 0 };
  for (const id of done(G)) {
    const p = PROJECT_BY_ID[id]; if (!p?.bonus) continue;
    for (const [k, v] of Object.entries(p.bonus)) b[k] += v;
  }
  return b;
}

/** Put the research bonuses on a ship body (body.bonus) and recompute its stats. Player ship only. */
export function applyResearch(body, G) {
  if (!G || !done(G).length) return body;
  body.bonus = researchBonus(G);
  recompute(body);
  return body;
}

/** May outfitters sell this alien race's weapons? */
export const hasLicence = (G, race) => has(G, 'lic_' + race);
/** Extra rarity bonus for loot rolls (pass into loot.js rollRarity's `bonus`). */
export const researchLootBonus = G => (has(G, 'luck1') ? 0.3 : 0) + (has(G, 'luck2') ? 0.5 : 0);
/** Fraction better prices at markets (0 or 0.04). */
export const priceEdge = G => (has(G, 'haggle') ? 0.04 : 0);
/** Multiplier on salvage-yard wreck lot payouts. */
export const salvageEdge = G => (has(G, 'salvage1') ? 1.25 : 1);

/** Research points a specimen is worth at a lab. */
export const specimenPoints = sp => Math.max(5, Math.round((sp.value || 100) / 20));
