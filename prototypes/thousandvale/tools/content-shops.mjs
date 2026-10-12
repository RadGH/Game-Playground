#!/usr/bin/env node
// Stream E — data/provinces/shops.json's `roles` block: stream A's shop runtime (js/sim/shops.js) reads
// `roles.<role> = { title, sells: [{ base, rarity }], markup }`; we author the richer `kinds` (categories with rarity
// weights, fixed goods, services) and `towns`. This turns every kind into its role's row — same inputs, same rows:
// each category's `count` split over its rarity weights (largest remainder), bases taken in turn so every base shows up
// before any repeats. Run after editing `kinds`:  node tools/content-shops.mjs   (tests/E/playtest2 checks it is current)
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const FILE = new URL('data/provinces/shops.json', ROOT);

/** count split over weights, largest remainder: { normal: .55, magic: .38, rare: .07 }, 10 -> { normal: 6, magic: 4, rare: 0 } */
export function splitCount(count, weights) {
  const ent = Object.entries(weights);
  const raw = ent.map(([k, w]) => [k, w * count]);
  const out = Object.fromEntries(raw.map(([k, v]) => [k, Math.floor(v)]));
  let left = count - Object.values(out).reduce((a, b) => a + b, 0);
  for (const [k] of raw.slice().sort((a, b) => (b[1] - Math.floor(b[1])) - (a[1] - Math.floor(a[1])))) { if (left <= 0) break; out[k]++; left--; }
  return out;
}

export function rolesFrom(data) {
  const roles = {};
  for (const [kind, s] of Object.entries(data.kinds)) {
    const sells = [];
    for (const c of Object.values(s.categories || {})) {
      const n = splitCount(c.count, c.rarity);
      let i = 0;
      for (const rarity of ['normal', 'magic', 'rare']) for (let k = 0; k < (n[rarity] || 0); k++) sells.push({ base: c.bases[(i++) % c.bases.length], rarity, cat: c.label });
    }
    const row = { kind, title: s.name, sells, markup: 1, sign: s.sign, light: !!s.light };
    if ((s.goods || []).length) row.goods = s.goods;
    if (s.services) row.services = s.services;
    if (kind === 'stable') row.mounts = true;
    if (!sells.length && !(s.goods || []).length && kind !== 'stable') continue;     // a service only (barber, broker, unbinder): no shop window
    if (roles[s.role]) roles[s.role].alsoKinds = [...(roles[s.role].alsoKinds || []), kind];      // two kinds, one role (the innkeeper also feeds you)
    else roles[s.role] = row;
  }
  return roles;
}

/**
 * Rewrite shops.json: `roles` from `kinds`, and (when given) each town's `shops` = the kinds whose keeper stream B gave a
 * building there (`townShops` from tools/content-offices.mjs buildOffices). Returns the data written.
 */
export function writeShops(townShops = null) {
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  if (townShops) for (const [name, list] of Object.entries(townShops)) { data.towns[name] ||= { levelCap: 8, priceMult: 1 }; data.towns[name].shops = list; }
  data.roles = rolesFrom(data);
  data._rolesDoc = 'MADE by tools/content-shops.mjs from `kinds` (do not edit by hand): stream A\'s js/sim/shops.js reads roles.<role> = { title, sells: [{ base, rarity }], markup } (+ goods, services, mounts, sign, light, kind). `cat` = the shop tab (the kind\'s category label).';
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  data.roles = rolesFrom(data);
  data._rolesDoc = 'MADE by tools/content-shops.mjs from `kinds` (do not edit by hand): stream A\'s js/sim/shops.js reads roles.<role> = { title, sells: [{ base, rarity }], markup } (+ goods, services, mounts, sign, light, kind). `cat` = the shop tab (the kind\'s category label).';
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  console.log(`shops: ${Object.keys(data.roles).length} roles from ${Object.keys(data.kinds).length} kinds`);
}
