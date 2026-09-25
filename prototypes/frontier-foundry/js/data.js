// Loads the JSON data files and indexes them. Works in node (fs) and in the browser (fetch).
// Nothing here touches the DOM, so the engine and the tests share one loader.
//
//   import { loadData } from './data.js';
//   const data = await loadData();            // node: reads ../data/*.json, browser: fetches them

const FILES = ['resources', 'structures', 'recipes', 'vehicles', 'units', 'tech', 'quests', 'waves', 'notifications', 'balance'];

import { applyBalance } from './rules.js';

/** Turn the raw files into one indexed bundle. Pure - hand it already-parsed JSON in tests. */
export function indexData(raw) {
  const data = {
    resources: raw.resources.resources,
    structures: raw.structures.structures,
    recipes: raw.recipes.recipes,
    vehicles: raw.vehicles.vehicles,
    units: raw.units.units,
    waveTables: raw.units.waveTables,
    nestTables: raw.units.nestTables,
    techs: raw.tech.techs,
    quests: raw.quests.quests,
    questChains: raw.quests.chains || [],
    waves: raw.waves,
    notifications: raw.notifications.types,
  };
  data.resource = Object.fromEntries(data.resources.map(r => [r.id, r]));
  data.structure = Object.fromEntries(data.structures.map(s => [s.id, s]));
  data.recipe = Object.fromEntries(data.recipes.map(r => [r.id, r]));
  data.vehicle = Object.fromEntries(data.vehicles.map(v => [v.id, v]));
  data.unit = Object.fromEntries(data.units.map(u => [u.id, u]));
  data.tech = Object.fromEntries(data.techs.map(t => [t.id, t]));
  data.quest = Object.fromEntries(data.quests.map(q => [q.id, q]));
  // which tech unlocks which id (structures, recipes, vehicles, units all share one namespace of unlockables)
  data.unlockedBy = {};
  for (const t of data.techs) for (const id of t.unlocks || []) (data.unlockedBy[id] ||= []).push(t.id);
  // recipes a structure can run, merged from both directions
  data.recipesFor = {};
  for (const s of data.structures) data.recipesFor[s.id] = new Set(s.recipes || []);
  for (const r of data.recipes) for (const m of r.machines || []) (data.recipesFor[m] ||= new Set()).add(r.id);
  for (const k of Object.keys(data.recipesFor)) data.recipesFor[k] = [...data.recipesFor[k]];
  // fold data/balance.json onto everything above, so the rest of the engine never sees it
  if (raw.balance) applyBalance(data, raw.balance);
  return data;
}

/** Load from disk (node) or over the network (browser). baseUrl only matters in the browser. */
export async function loadData(baseUrl = null) {
  const raw = {};
  if (typeof window === 'undefined') {
    const { readFileSync } = await import('node:fs');
    for (const f of FILES) raw[f] = JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
  } else {
    const base = baseUrl || new URL('../data/', import.meta.url).href;
    await Promise.all(FILES.map(async f => { raw[f] = await (await fetch(base + f + '.json')).json(); }));
  }
  return indexData(raw);
}
