// Shared server loading (stream A): rules, store, provinces/zones as layouts, classes, the log line.
// Used by server/main.mjs (gateway, and stage 1's single process) and server/province-proc.mjs (stage 2).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { loadZoneTerrain, standInTerrain } from '../js/sim/terrain.js';
import { createMemoryStore } from '../js/sim/store-memory.js';
import { loadZoneContent, loadProvinceContent } from '../js/sim/content.js';
import { buildLayout } from '../js/sim/realm.js';
import { vignetteContent } from '../js/sim/vignettes.js';
import { parseTerrain } from '../js/rules/terrain-read.js';
import { createProvinceTerrain } from '../js/sim/province-terrain.js';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const GAME = resolve(HERE, '..');
export const PLAYGROUND = resolve(GAME, '../..');

export const log = (msg, extra) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), pid: process.pid, msg: String(msg), ...(extra && typeof extra === 'object' ? extra : extra !== undefined ? { detail: String(extra) } : {}) }) + '\n');

export async function loadRules(mode) {
  const { createRules: v0 } = await import('../js/sim/rules-v0.js');
  if (mode === 'v0') return { createRules: v0, rules: 'v0' };
  const p = join(GAME, 'js/rules/index.js');
  if (existsSync(p)) {
    try {
      const m = await import(pathToFileURL(p).href);
      if (typeof m.createRules === 'function') return { createRules: m.createRules, rules: 'js/rules' };
      log('js/rules/index.js has no createRules export; using the stand-in rules');
    } catch (err) { log('js/rules/index.js failed to load; using the stand-in rules', { err: err.message }); }
  }
  return { createRules: v0, rules: 'v0' };
}

export async function makeStore(o) {
  if (o.db === 'pg') { const { createPgStore } = await import('./db/pg-store.js'); return createPgStore({ log }); }
  if (o.db === 'json') { const { createJsonStore } = await import('./db/json-store.js'); return createJsonStore(o.dbFile); }
  return createMemoryStore();
}

export function loadClasses() {
  try { return JSON.parse(readFileSync(join(PLAYGROUND, 'prototypes/farhold/data/classes.json'), 'utf8')).classes.map(c => c.id); }
  catch { return null; }
}

const readJson = async f => JSON.parse(readFileSync(join(GAME, f), 'utf8'));
const readBytes = async f => readFileSync(join(GAME, f));

/**
 * The layouts for a list of province keys. A key from data/world/province-map.json loads that whole
 * province (stream B's zone bakes stitched); any other key is ONE zone (`data/zones/<key>/terrain.bin`,
 * or the stand-in field for 'standin'). Returns { layouts, events, encounterInfo }.
 */
export async function loadLayouts(keys, { copyCap = 300 } = {}) {
  const layouts = [], events = [];
  let encounterInfo = {};
  let provinces = {};
  try { provinces = (await readJson('data/world/province-map.json')).provinces || {}; } catch { /* no world bake */ }
  for (const key of keys) {
    if (provinces[key]) {
      const c = await loadProvinceContent(readJson, readBytes, key, { parseTerrain, createProvinceTerrain, log });
      encounterInfo = c.encounterInfo;
      layouts.push(buildLayout({ key, name: c.name, terrain: c.terrain, zones: c.zones, encounterInfo, copyCap, vignetteContent, starter: c.starter }));
      events.push(...c.events);
      continue;
    }
    const f = join(GAME, 'data/zones', key, 'terrain.bin');
    const terrain = key !== 'standin' && existsSync(f) ? loadZoneTerrain(readFileSync(f), key) : standInTerrain(1, 2048);
    if (key !== 'standin' && !existsSync(f)) log(`zone ${key} not baked (${f}); using the stand-in field`);
    const content = await loadZoneContent(readJson, key);
    encounterInfo = { ...content.encounterInfo, ...encounterInfo };
    layouts.push(buildLayout({ key, name: (content.sheet && content.sheet.name) || key, terrain, zones: [{ key, sheet: content.sheet, vignettes: content.vignettes }], encounterInfo, copyCap, vignetteContent }));
  }
  return { layouts, events, encounterInfo };
}

/** The default world: the starter province when the world is baked, else the M0 test zone. */
export function defaultProvinces() {
  try { const m = JSON.parse(readFileSync(join(GAME, 'data/world/province-map.json'), 'utf8')); if (m.provinces && m.provinces.torbor_downs) return ['torbor_downs']; } catch { /* none */ }
  return ['test'];
}
