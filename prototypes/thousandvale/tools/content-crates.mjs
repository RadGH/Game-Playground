#!/usr/bin/env node
// Thousandvale — GEAR CRATES on the starting quests (stream E, play-test 5 T9: "a crate that gives a random item of a
// specific type with a minimum rarity; all starting quests use it — an easy way to get gear early").
//
//   node tools/content-crates.mjs            rewrite data/quests/*.json rewards (safe to run again: same result)
//   node tools/content-crates.mjs --check    change nothing; exit 1 when a file would change
//
// A quest reward carries `crates: [ { slot, min } ]` (docs/requests.md "Round 5 contracts — E"):
//   slot  weapon | offhand (both: something YOUR class can use) | head | chest | legs | hands | feet | ring | neck |
//         back (a cloak) | waist (a belt) | (no `light` crate: W22 removed light items) |
//         armor (any armour slot) | any
//   min   common | uncommon | rare | epic — the lowest rarity the crate opens into
// The old random `reward.item {tier, slot}` on these quests is REPLACED by a crate (same or better rarity, and a named
// slot instead of "any"); a NAMED item (`item.base` + `item.name`, the class quests) is kept and the crate is extra.
//
// Which quests: (1) the start chain, by hand below — one crate per slot so the chain alone fills nine slots;
// (2) the Torbor Fields quests + the set-piece quests round Torborhold, slots dealt in turn; (3) every class quest
// (an armour crate on top of its named rare); (4) the first two quests of every other zone.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../data/quests/', import.meta.url);
const CHECK = process.argv.includes('--check');
const RANK = ['common', 'uncommon', 'rare', 'epic'];
const better = (a, b) => RANK[Math.max(RANK.indexOf(a), RANK.indexOf(b), 0)];

/** The start chain: nine different slots over seven quests (feet first — the quest is called Two Good Legs). */
export const START = {
  start_two_good_legs:      [{ slot: 'feet', min: 'common' }],
  start_letters_south:      [{ slot: 'chest', min: 'common' }, { slot: 'back', min: 'common' }],        // a cloak for the road (C's slots addendum)
  start_road_to_orrinsford: [{ slot: 'legs', min: 'uncommon' }, { slot: 'waist', min: 'uncommon' }],
  start_wheels_for_hire:    [{ slot: 'back', min: 'common' }],                                         // W5 + W19: the cart ride pays something for your back (a cloak or a pack)
  start_the_priors_favour:  [{ slot: 'head', min: 'uncommon' }, { slot: 'neck', min: 'common' }],
  start_signs_of_the_beast: [{ slot: 'hands', min: 'common' }],
  start_old_gristle:        [{ slot: 'weapon', min: 'rare' }],
  start_home_with_news:     [{ slot: 'offhand', min: 'rare' }, { slot: 'ring', min: 'uncommon' }],
};
/** Slots dealt in turn to the other quests of the starting fields (armour first: a weapon came with the kit). */
const DEAL = ['chest', 'feet', 'hands', 'head', 'legs', 'weapon', 'ring', 'offhand', 'neck', 'armor'];

const SKIP = new Set(['events.json', 'jobs.json', 'treasure.json', 'province.json', 'angling.json']);
const STARTER_FILES = new Set(['test.json', 'setpieces.json']);
const FIRST_N = 2;      // other zones: their first two quests (lowest level, file order)

function cratesFor(file, q, i, order) {
  if (file === 'start.json') return START[q.id] || null;
  // what the quest paid before: its random item, or (on a second run) the crate this tool already wrote
  const had = q.reward && Array.isArray(q.reward.crates) && q.reward.crates[0];
  const was = q.reward && q.reward.item && !q.reward.item.base ? q.reward.item : had ? { tier: had.min, slot: had.slot } : null;
  const min = (floor) => better(floor, (was && was.tier) || 'common');
  if (file === 'classes.json') return [{ slot: 'armor', min: 'uncommon' }];
  if (STARTER_FILES.has(file)) {
    const slot = was && was.slot && was.slot !== 'any' ? was.slot : DEAL[i % DEAL.length];
    return [{ slot, min: min(q.level >= 4 ? 'uncommon' : 'common') }];
  }
  const rank = order.indexOf(q.id);
  if (rank < 0 || rank >= FIRST_N) return null;
  return [{ slot: rank === 0 ? 'weapon' : 'armor', min: min('uncommon') }];
}

let changed = 0, total = 0, files = 0;
const perSlot = {};
for (const file of readdirSync(DIR).filter(f => f.endsWith('.json') && !SKIP.has(f)).sort()) {
  const url = new URL(file, DIR), text = readFileSync(url, 'utf8');
  const doc = JSON.parse(text);
  if (!Array.isArray(doc.quests)) continue;
  const order = doc.quests.map((q, i) => ({ id: q.id, level: q.level || 1, i })).sort((a, b) => a.level - b.level || a.i - b.i).map(q => q.id);
  let n = 0;
  doc.quests.forEach((q, i) => {
    const crates = cratesFor(file, q, i, order);
    if (!crates) return;
    q.reward ||= {};
    if (q.reward.item && !q.reward.item.base) delete q.reward.item;       // a random roll becomes the crate
    q.reward.crates = crates.map(c => ({ slot: c.slot, min: c.min }));
    n++; total += crates.length;
    for (const c of crates) perSlot[c.slot] = (perSlot[c.slot] || 0) + 1;
  });
  if (!n) continue;
  files++;
  // keep each file's own layout: the zone files are written with two-space indents
  const out = JSON.stringify(doc, null, 2) + '\n';
  if (out !== text) { changed++; if (!CHECK) writeFileSync(url, out); }
}
console.log(`crates: ${total} on quests in ${files} files (${changed} file(s) ${CHECK ? 'would change' : 'written'})`);
console.log('by slot: ' + Object.entries(perSlot).map(([k, v]) => `${k} ${v}`).join(', '));
if (CHECK && changed) process.exit(1);
