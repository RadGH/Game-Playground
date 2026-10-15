// Shared server loading (stream A): rules, store, provinces/zones as layouts, classes, the log line.
// Used by server/main.mjs (gateway, and stage 1's single process) and server/province-proc.mjs (stage 2).

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadZoneTerrain, standInTerrain } from '../js/sim/terrain.js';
import { createMemoryStore } from '../js/sim/store-memory.js';
import { loadZoneContent, loadProvinceContent } from '../js/sim/content.js';
import { buildLayout } from '../js/sim/realm.js';
import { vignetteContent } from '../js/sim/vignettes.js';
import { parseTerrain, parseNav } from '../js/rules/terrain-read.js';
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
      if (typeof m.createRules === 'function') {
        // play-test 5 T5: stream C's starter kits (`kitsFor(classId)`): from the rules' index when it exports it, else the module itself
        let kitsFor = typeof m.kitsFor === 'function' ? m.kitsFor : null;
        if (!kitsFor) {
          try {
            const k = await import(pathToFileURL(join(GAME, 'js/rules/starter-kits.js')).href);
            if (typeof k.kitsFor === 'function') {
              // the module wants the booted engine and its table (`setKitSource` — C's engine does this itself once wired)
              const eng = typeof m.rulesEngine === 'function' ? m.rulesEngine() : null;
              let table = null; try { table = JSON.parse(readFileSync(join(GAME, 'data/rules/starter-kits.json'), 'utf8')); } catch { /* no table */ }
              if (typeof k.setKitSource === 'function' && (eng || table)) k.setKitSource(eng, table);
              kitsFor = cls => k.kitsFor(cls);
            }
          } catch { /* no kits yet */ }
        }
        // owner feedback 8, W22: C's two helpers for the light items that left the game (what counts as one, what it is paid back at)
        const lightItems = typeof m.isLightItem === 'function' ? { is: m.isLightItem, refund: typeof m.lightRefund === 'function' ? m.lightRefund : null } : null;
        return { createRules: m.createRules, rules: 'js/rules', kitsFor, lightItems, refreshItem: typeof m.refreshItem === 'function' ? m.refreshItem : null };      // refreshItem (round 10, C's Y16): today's words on an old bag item
      }
      log('js/rules/index.js has no createRules export; using the stand-in rules');
    } catch (err) { log('js/rules/index.js failed to load; using the stand-in rules', { err: err.message }); }
  }
  return { createRules: v0, rules: 'v0' };
}

/**
 * Play-test 5 (T19/T21): where feedback reports are ALSO written, one JSON object a line — `<state>/feedback-<env>.jsonl`
 * (`STATE_DIRECTORY` under systemd, else the game's `.data/`). `{ev:'new', id, at, kind, text, …}` for a report,
 * `{ev:'state', id, state, by, at, note?}` for a review. tools/feedback-report.mjs reads it when there is no database.
 */
export function feedbackFile(env = 'dev') { return join(process.env.TV_FEEDBACK_DIR || process.env.STATE_DIRECTORY || join(GAME, '.data'), `feedback-${env}.jsonl`); }
/** Owner feedback 9 (X1): the message of the day — data/ops/motd.json ({ text, lines, off }); env TV_MOTD overrides the text. */
export function loadMotd() {
  let d = {};
  try { d = JSON.parse(readFileSync(join(GAME, 'data/ops/motd.json'), 'utf8')); } catch { d = {}; }
  if (process.env.TV_MOTD) d = { ...d, text: process.env.TV_MOTD };
  return { text: typeof d.text === 'string' ? d.text : null, lines: Array.isArray(d.lines) ? d.lines : [], off: !!d.off };
}
/** Owner feedback 10 (Y30): the lead's player-facing changelog (data/ops/changelog.json), served at /changelog.json. */
export function loadChangelog() { try { return JSON.parse(readFileSync(join(GAME, 'data/ops/changelog.json'), 'utf8')); } catch { return null; } }
export function feedbackSink(env = 'dev', file = feedbackFile(env)) {
  let made = false;
  return row => {
    try {
      if (!made) { mkdirSync(dirname(file), { recursive: true }); made = true; }
      appendFileSync(file, JSON.stringify(row) + '\n', { mode: 0o600 });
    } catch (err) { log('feedback file not written', { file, err: err.message }); }
  };
}

/** V2: the server's gold numbers (data/rules/economy.json; js/sim/economy-knobs.js merges it over its defaults). Null when the file is not there. */
export function loadEconomy() { for (const f of ['data/provinces/economy.json', 'data/rules/economy.json']) { try { return JSON.parse(readFileSync(join(GAME, f), 'utf8')); } catch { /* next */ } } return null; }

export async function makeStore(o) {
  if (o.db === 'pg') { const { createPgStore } = await import('./db/pg-store.js'); return createPgStore({ log }); }
  if (o.db === 'json') { const { createJsonStore } = await import('./db/json-store.js'); return createJsonStore(o.dbFile); }
  return createMemoryStore();
}

/** Thousandvale's OWN classes (round 10, Y32: stream C's data/rules/classes-tv.json — the Starcaller), added to Farhold's thirty wherever class ids are listed. */
function tvClasses() { try { return JSON.parse(readFileSync(join(GAME, 'data/rules/classes-tv.json'), 'utf8')).classes || []; } catch { return []; } }
export function loadClasses() {
  try { return [...new Set([...JSON.parse(readFileSync(join(PLAYGROUND, 'prototypes/farhold/data/classes.json'), 'utf8')).classes.map(c => c.id), ...tvClasses().map(c => c.id)])]; }
  catch { return null; }
}

/** Class id -> display name (play-test 2, Q25: the character list showed "Adventurer" for a ranger). */
export function loadClassNames() {
  try { return Object.fromEntries([...JSON.parse(readFileSync(join(PLAYGROUND, 'prototypes/farhold/data/classes.json'), 'utf8')).classes, ...tvClasses()].map(c => [c.id, c.name || c.id])); }
  catch { return null; }
}

const readJson = async f => JSON.parse(readFileSync(join(GAME, f), 'utf8'));
const readBytes = async f => readFileSync(join(GAME, f));

/**
 * The layouts for a list of province keys. A key from data/world/province-map.json loads that whole
 * province (stream B's zone bakes stitched); any other key is ONE zone (`data/zones/<key>/terrain.bin`,
 * or the stand-in field for 'standin'). Returns { layouts, events, encounterInfo }.
 */
export const STARTER_COPY_CAP = 150;          // PLAN §8.2: the starter province copies at ~150, the rest at ~300
export async function loadLayouts(keys, { copyCap = 300 } = {}) {
  const layouts = [], events = [];
  let encounterInfo = {}, directorRules = null;
  let provinces = {};
  try { provinces = (await readJson('data/world/province-map.json')).provinces || {}; } catch { /* no world bake */ }
  for (const key of keys) {
    if (provinces[key]) {
      let c;
      try { c = await loadProvinceContent(readJson, readBytes, key, { parseTerrain, parseNav, createProvinceTerrain, log }); }
      catch (err) { if (!layouts.length) throw err; log('province ' + key + ' left out: ' + err.message); continue; }      // Expansion 1: a second province that is not ready yet never stops the first
      encounterInfo = c.encounterInfo;
      layouts.push(buildLayout({ key, name: c.name, terrain: c.terrain, zones: c.zones, encounterInfo, copyCap: c.starterProvince ? Math.min(copyCap, STARTER_COPY_CAP) : copyCap, vignetteContent, starter: c.starter, rares: c.rares, jobs: c.jobs, schedules: c.schedules, horizon: c.horizon, travel: c.travel, marks: c.marks, shops: c.shops, mounts: c.mounts, offices: c.offices, extra: c.extra }));
      events.push(...c.events);
      directorRules ||= c.directorRules;
      continue;
    }
    const f = join(GAME, 'data/zones', key, 'terrain.bin');
    const terrain = key !== 'standin' && existsSync(f) ? loadZoneTerrain(readFileSync(f), key) : standInTerrain(1, 2048);
    if (key !== 'standin' && !existsSync(f)) log(`zone ${key} not baked (${f}); using the stand-in field`);
    const nf = join(GAME, 'data/zones', key, 'nav.bin');
    if (key !== 'standin' && existsSync(nf)) { try { terrain.nav = parseNav(readFileSync(nf)); } catch (err) { log(`zone ${key}: nav.bin unreadable: ${err.message}`); } }
    const content = await loadZoneContent(readJson, key);
    encounterInfo = { ...content.encounterInfo, ...encounterInfo };
    layouts.push(buildLayout({ key, name: (content.sheet && content.sheet.name) || key, terrain, zones: [{ key, sheet: content.sheet, vignettes: content.vignettes }], encounterInfo, copyCap, vignetteContent }));
  }
  if (!directorRules) { try { directorRules = (await readJson('data/quests/events.json')).director || null; } catch { /* none */ } }
  return { layouts, events, encounterInfo, directorRules };
}

/**
 * The default world: every province of data/world/province-map.json that has a sheet (data/provinces/<id>.json) and at
 * least one baked zone — the starter province (its sheet's band starts at level 1: where new characters begin) FIRST,
 * the rest in map order. Expansion 1: Torbor Downs and Vharlen run side by side. No baked world: the M0 test zone.
 */
export function defaultProvinces(game = GAME) {
  try {
    const m = JSON.parse(readFileSync(join(game, 'data/world/province-map.json'), 'utf8'));
    const out = [];
    for (const [id, p] of Object.entries(m.provinces || {})) {
      let sheet = null;
      try { sheet = JSON.parse(readFileSync(join(game, 'data/provinces', id + '.json'), 'utf8')); } catch { continue; }      // no sheet yet (stream C writes it)
      if (!Object.values((p && p.map) || {}).some(w => existsSync(join(game, 'data/zones', w, 'terrain.bin')))) continue;      // nothing baked
      out.push({ id, starter: !!(sheet && Array.isArray(sheet.band) && sheet.band[0] <= 1) });
    }
    out.sort((a, b) => (b.starter ? 1 : 0) - (a.starter ? 1 : 0));
    if (out.length) return out.map(x => x.id);
  } catch { /* none */ }
  return ['test'];
}

/** Expansion 1: the province new characters begin in, out of `keys`: the first whose sheet's band starts at level 1 (or that has no sheet: a test zone), else the first. */
export function starterOf(keys, game = GAME) {
  for (const k of keys || []) {
    let s = null;
    try { s = JSON.parse(readFileSync(join(game, 'data/provinces', k + '.json'), 'utf8')); } catch { return k; }      // a test zone (no sheet) is a starter, as it always was
    if (!Array.isArray(s.band) || s.band[0] <= 1) return k;
  }
  return (keys || [])[0] || null;
}

/**
 * Round 11 (World, live #6): a fresh seed for this run's dice — every room's combat, loot and rank rolls mix it in
 * (js/sim/province.js `runSeed`), so a restart never replays the same drops. `TV_RUN_SEED=<n>` pins it (debugging).
 */
export function runSeedFrom(env = process.env) {
  const pinned = Number(env.TV_RUN_SEED);
  if (Number.isFinite(pinned) && pinned > 0) return pinned >>> 0;
  return (randomBytes(4).readUInt32LE(0) >>> 0) || 1;
}
