#!/usr/bin/env node
// Thousandvale — THE NEW GEAR REACHES THE SHOPS (stream E, play-test 5 T15 / T23: "a variety of wands and staves…
// off-hand focuses too", "a whole new type of item for every slot and archetype" — they must actually be buyable).
//
//   node tools/content-gear.mjs            read stream F's avatar-3d/data/gear-catalog.json and put every NEW row
//                                          (`new: true` with a `base`) on a shop shelf in data/provinces/shops.json,
//                                          then rebuild `roles` (tools/content-shops.mjs). Safe to run again.
//   node tools/content-gear.mjs --check    change nothing; exit 1 when shops.json would change
//   import { shelfFor, shelveCatalog } from './content-gear.mjs'     (tests/E/playtest5-gear.test.js)
//
// WHICH SHELF (shelfFor): by what the thing is, the same split the shops already have —
//   wands, staves, quarterstaves, sceptres, orbs, tomes (weapons)   -> apothecary / weapon
//   bows, crossbows, javelins                                        -> bowyer / weapon      quivers -> bowyer / other
//   every other weapon                                               -> weaponsmith / weapon
//   shields                                                          -> weaponsmith / armor + armourer / other
//   off-hand focuses (tome, orb, relic, idol, ward, totem…)          -> tailor / other  (where the old foci are)
//   armour: cloth -> tailor / armor · leather -> tailor / armor + armourer / armor · mail, plate -> armourer / armor
//   rings, amulets -> jeweller / other · cloaks, belts -> tailor / armor · lanterns, torches you WEAR -> general / light
//   (the plain bases travel_cloak, leather_belt, hand_lantern, pitch_torch of data/rules/gear-tv.json are hand-listed there)
//   and one new weapon in three also lies on the market stall (market / weapon).
// BY BAND: a category gets `minCap: { <base>: <level> }` from the row's `minLevel` — a base is only offered in a town
// whose `levelCap` reaches it (stream A, js/sim/shops.js build(): docs/requests.md "Round 5 contracts — E"). Rows at
// minLevel <= START_CAP need no entry: Torborhold sells them from the first minute.
// DROPS: stream C injects the same rows as item bases and they join the loot pool at their `minLevel`
// (js/rules/gear-catalog.js), so drops follow the zone's level band with no list here.
// The category remembers what this tool added (`catalog: [bases]`) and its hand-written count (`countBase`), so a
// second run, or a catalog that lost a row, leaves no stale base behind.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { rolesFrom } from './content-shops.mjs';

const ROOT = new URL('../', import.meta.url);
const SHOPS = new URL('data/provinces/shops.json', ROOT);
export const CATALOG = new URL('../../avatar-3d/data/gear-catalog.json', ROOT);
export const START_CAP = 6;                 // Torborhold's levelCap
const CASTER = new Set(['wand', 'staff', 'quarterstaff', 'scepter', 'sceptre', 'orb', 'tome']);
const RANGED = new Set(['bow', 'shortbow', 'crossbow', 'javelin']);
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** The shelves a catalog row goes on: [[kind, category], …] ([] = not shop goods: a hat with no armour). */
export function shelfFor(row) {
  const t = row.type, slot = row.gameSlot;
  if (row.kind === 'weapon') {
    const main = CASTER.has(t) ? ['apothecary', 'weapon'] : RANGED.has(t) ? ['bowyer', 'weapon'] : ['weaponsmith', 'weapon'];
    return hash(row.base) % 3 === 0 ? [main, ['market', 'weapon']] : [main];
  }
  if (row.kind === 'offhand') {
    if (t === 'shield') return [['weaponsmith', 'armor'], ['armourer', 'other']];
    if (t === 'quiver') return [['bowyer', 'other']];
    if (t === 'torch' || t === 'lantern') return [['general', 'light']];
    return [['tailor', 'other']];
  }
  if (row.kind === 'armour') {
    if (row.archetype === 'cloth') return [['tailor', 'armor']];
    if (row.archetype === 'leather') return [['tailor', 'armor'], ['armourer', 'armor']];
    return [['armourer', 'armor']];
  }
  if (row.kind === 'accessory') {
    if (slot === 'ring' || slot === 'necklace' || t === 'ring' || t === 'amulet') return [['jeweller', 'other']];
    if (slot === 'cape' || slot === 'belt' || t === 'cloak' || t === 'belt') return [['tailor', 'armor']];
    if (slot === 'light' || t === 'lantern' || t === 'torch') return [['general', 'light']];
  }
  return [];
}

/** shops.json with the catalog's new rows shelved. -> { data, shelved: n rows, unshelved: [ids], byKind } */
export function shelveCatalog(data, catalog) {
  const rows = (Array.isArray(catalog) ? catalog : (catalog && catalog.rows) || []).filter(r => r && r.new && r.base);
  // start clean: take out what an earlier run added
  for (const k of Object.values(data.kinds)) for (const c of Object.values(k.categories || {})) {
    if (!c.catalog) continue;
    const mine = new Set(c.catalog);
    c.bases = c.bases.filter(b => !mine.has(b));
    if (c.countBase != null) c.count = c.countBase;
    delete c.catalog; delete c.minCap; delete c.countBase;
  }
  const unshelved = [], byKind = {};
  let shelved = 0;
  for (const r of rows.slice().sort((a, b) => (a.minLevel || 1) - (b.minLevel || 1) || a.base.localeCompare(b.base))) {
    const where = shelfFor(r).filter(([k, c]) => data.kinds[k] && data.kinds[k].categories && data.kinds[k].categories[c]);
    if (!where.length) { unshelved.push(r.id); continue; }
    shelved++;
    for (const [k, cat] of where) {
      const c = data.kinds[k].categories[cat];
      if (c.bases.includes(r.base)) continue;
      c.countBase ??= c.count;
      c.bases.push(r.base); (c.catalog ||= []).push(r.base);
      if ((r.minLevel || 1) > START_CAP) (c.minCap ||= {})[r.base] = r.minLevel;
      byKind[k] = (byKind[k] || 0) + 1;
    }
  }
  // more on the shelf where there is more to sell: one extra slot per three new bases (the shop shows bases in turn)
  for (const k of Object.values(data.kinds)) for (const c of Object.values(k.categories || {})) if (c.catalog) c.count = c.countBase + Math.ceil(c.catalog.length / 3);
  data.roles = rolesFrom(data);
  return { data, shelved, unshelved, byKind, rows: rows.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const CHECK = process.argv.includes('--check');
  if (!existsSync(CATALOG)) { console.log('gear: avatar-3d/data/gear-catalog.json is not there yet (stream F) — nothing shelved'); process.exit(0); }
  const text = readFileSync(SHOPS, 'utf8');
  const r = shelveCatalog(JSON.parse(text), JSON.parse(readFileSync(CATALOG, 'utf8')));
  const out = JSON.stringify(r.data, null, 2) + '\n';
  if (out !== text && !CHECK) writeFileSync(SHOPS, out);
  console.log(`gear: ${r.rows} new catalog rows, ${r.shelved} on a shelf (${Object.entries(r.byKind).map(([k, n]) => k + ' ' + n).join(', ') || 'none'})${r.unshelved.length ? `; not shop goods: ${r.unshelved.join(', ')}` : ''}; shops.json ${out === text ? 'unchanged' : CHECK ? 'WOULD change' : 'written'}`);
  if (CHECK && out !== text) process.exit(1);
}
