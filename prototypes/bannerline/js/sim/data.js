// The data bundle the sim reads: every data/*.json file the sim needs, deep-frozen, plus derived
// tables computed once, plus `hash` (FNV-1a over canonical JSON of the raw files) that online peers
// compare before a match ("Version mismatch: update and rejoin").
//
//   const data = await loadData(name => fetch('data/' + name).then(r => r.text()));   // browser
//   const data = loadDataSync(name => readFileSync(join(dir, 'data', name), 'utf8'));  // node
//
// The bundle is { econ, units, races, damage, maps, heroes, ai, ..., derived, hash }, plus per-mode files
// in sub-folders (MODE_DATA_FILES: 'hvf/rules.json' -> data.hvf.rules). Every file joins the hash, so
// online peers must agree on mode data too.

import { hashCanonical } from './hash.js';

export const DATA_FILES = ['econ.json', 'units.json', 'races.json', 'damage.json', 'maps.json', 'heroes.json', 'ai.json', 'items-bl.json', 'shop.json', 'upgrades.json', 'powers.json', 'buildings.json'];
// Per-mode data (R2.10 hook for stream H). Kept as a plain list here so data.js imports no mode code;
// tests/modes.test.js checks it equals the union of every registered mode's `dataFiles`.
export const MODE_DATA_FILES = ['hvf/rules.json', 'hvf/mapgen.json', 'hvf/units.json', 'hvf/animals.json', 'hvf/buildings.json', 'hvf/hunter.json', 'hvf/hunter-items.json', 'hvf/ai.json'];
export const ALL_DATA_FILES = DATA_FILES.concat(MODE_DATA_FILES);
const keyOf = f => f.replace(/\.json$/, '');
/** Read / write a file's slot in a raw bundle ('hvf/rules.json' -> raw.hvf.rules). */
export function rawGet(raw, f) { return keyOf(f).split('/').reduce((o, k) => (o ? o[k] : undefined), raw); }
export function rawSet(raw, f, v) {
  const parts = keyOf(f).split('/');
  let o = raw;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
  o[parts[parts.length - 1]] = v;
}

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

/** Race-adjusted view of one unit for its own race (race economy trait applied). */
export function unitStats(raw, uid) {
  const u = raw.units.units[uid];
  if (!u) throw new Error(`Unknown unit "${uid}"`);
  const race = raw.races.races[u.race];
  const rt = raw.races.traits[race.trait] || {};
  const low = u.tier <= (rt.maxTier ?? 99);
  const pack = u.traits.includes('pack');
  return {
    id: uid, race: u.race, name: u.name, tier: u.tier, role: u.role, bodies: u.bodies, armour: u.armour, dmg: u.dmg,
    range: u.range, speed: u.speed * (pack ? (rt.packSpeed ?? 1) : 1), leak: u.leak, traits: u.traits.slice(), splitInto: u.splitInto || null,
    bounty: u.bounty ?? raw.econ.bounty.share,
    hp: u.hp * (race.hpMult ?? 1), dps: u.dps,
    baseCost: u.cost,
    cost: Math.round(u.cost * (low ? (rt.cost ?? 1) : 1)),
    income: u.income * (low ? (rt.income ?? 1) : 1),
    leakRefund: rt.leakRefund ?? 0,
  };
}

function derive(raw) {
  const units = {};
  for (const uid of Object.keys(raw.units.units)) units[uid] = unitStats(raw, uid);
  return { units };
}

export function prepareData(raw) {
  for (const f of ALL_DATA_FILES) if (!rawGet(raw, f)) throw new Error(`Missing data file ${f}`);
  const hash = hashCanonical(ALL_DATA_FILES.map(f => rawGet(raw, f)));
  const bundle = { ...raw, derived: derive(raw), hash };
  return deepFreeze(bundle);
}

function parseAll(texts) {
  const raw = {};
  ALL_DATA_FILES.forEach((f, i) => rawSet(raw, f, typeof texts[i] === 'string' ? JSON.parse(texts[i]) : texts[i]));
  return prepareData(raw);
}

/** fetchText(name) -> string | Promise<string> (or already-parsed object). */
export function loadData(fetchText) {
  return Promise.all(ALL_DATA_FILES.map(f => fetchText(f))).then(parseAll);
}

/** Synchronous twin for node: readText(name) -> string. */
export function loadDataSync(readText) { return parseAll(ALL_DATA_FILES.map(f => readText(f))); }
