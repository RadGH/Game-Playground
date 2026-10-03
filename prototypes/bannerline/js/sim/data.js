// The data bundle the sim reads: every data/*.json file the sim needs, deep-frozen, plus derived
// tables computed once, plus `hash` (FNV-1a over canonical JSON of the raw files) that online peers
// compare before a match ("Version mismatch: update and rejoin").
//
//   const data = await loadData(name => fetch('data/' + name).then(r => r.text()));   // browser
//   const data = loadDataSync(name => readFileSync(join(dir, 'data', name), 'utf8'));  // node
//
// The bundle is { econ, units, races, damage, maps, heroes, ai, derived, hash }.

import { hashCanonical } from './hash.js';

export const DATA_FILES = ['econ.json', 'units.json', 'races.json', 'damage.json', 'maps.json', 'heroes.json', 'ai.json', 'items-bl.json'];
const keyOf = f => f.replace(/\.json$/, '');

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
    id: uid, race: u.race, name: u.name, tier: u.tier, bodies: u.bodies, armour: u.armour, dmg: u.dmg,
    range: u.range, speed: u.speed, leak: u.leak, unlock: u.unlock, traits: u.traits.slice(),
    bounty: u.bounty ?? raw.econ.bounty.share,
    hp: u.hp * (race.hpMult ?? 1), dps: u.dps,
    baseCost: u.cost,
    cost: Math.round(u.cost * (low ? (rt.cost ?? 1) : 1)),
    income: u.income * (low ? (rt.income ?? 1) : 1),
    stock: u.stock + (low ? (rt.extraStock ?? 0) : 0),
    restock: u.restock * (pack ? (rt.packRestock ?? 1) : 1),
    leakRefund: rt.leakRefund ?? 0,
  };
}

function derive(raw) {
  const units = {};
  for (const uid of Object.keys(raw.units.units)) units[uid] = unitStats(raw, uid);
  const tiers = [];
  for (const u of Object.values(units)) if (!tiers.some(t => t.tier === u.tier)) tiers.push({ tier: u.tier, unlock: u.unlock });
  // ascending by unlock time (small list; insertion sort keeps it free of Array.sort)
  for (let i = 1; i < tiers.length; i++) for (let j = i; j > 0 && (tiers[j].unlock < tiers[j - 1].unlock || (tiers[j].unlock === tiers[j - 1].unlock && tiers[j].tier < tiers[j - 1].tier)); j--) { const t = tiers[j]; tiers[j] = tiers[j - 1]; tiers[j - 1] = t; }
  return { units, tiers };
}

export function prepareData(raw) {
  for (const f of DATA_FILES) if (!raw[keyOf(f)]) throw new Error(`Missing data file ${f}`);
  const hash = hashCanonical(DATA_FILES.map(f => raw[keyOf(f)]));
  const bundle = { ...raw, derived: derive(raw), hash };
  return deepFreeze(bundle);
}

function parseAll(texts) {
  const raw = {};
  DATA_FILES.forEach((f, i) => { raw[keyOf(f)] = typeof texts[i] === 'string' ? JSON.parse(texts[i]) : texts[i]; });
  return prepareData(raw);
}

/** fetchText(name) -> string | Promise<string> (or already-parsed object). */
export function loadData(fetchText) {
  return Promise.all(DATA_FILES.map(f => fetchText(f))).then(parseAll);
}

/** Synchronous twin for node: readText(name) -> string. */
export function loadDataSync(readText) { return parseAll(DATA_FILES.map(f => readText(f))); }
