#!/usr/bin/env node
// Stream W (W6) — the table: for every gate of every baked town, is the way to the square a clear main street?
//
//   node prototypes/thousandvale/tools/gate-streets.mjs                       every zone under data/zones
//   node prototypes/thousandvale/tools/gate-streets.mjs --dir <zones dir>     another copy of the baked zones (a "before")
//   node prototypes/thousandvale/tools/gate-streets.mjs --towns               one line per town instead of per gate
//   node prototypes/thousandvale/tools/gate-streets.mjs --json
//   --check   exit 1 if any promise of tools/lib/gate-street-checks.mjs checkGateStreets is broken
//
// Columns: see tools/lib/gate-street-checks.mjs (metres of route, blocked metres, narrowest clear width, clear metres
// straight on from the gate, metres nav.bin refuses).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNav } from '../js/rules/terrain-read.js';
import { measureGates, checkGateStreets } from './lib/gate-street-checks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..');
const buf = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

/** Everything the checks need for one zone. `dir` = a zones directory (default the checked-in one). */
export function loadZone(zone, dir = join(ROOT, 'data', 'zones')) {
  const P = JSON.parse(readFileSync(join(dir, zone, 'placements.json'), 'utf8')).placements;
  const nav = parseNav(buf(readFileSync(join(dir, zone, 'nav.bin'))));
  const bodies = [];
  for (const suffix of ['', '.quest']) {
    const f = join(ROOT, 'data', 'vignettes', 'placements', `${zone}${suffix}.json`);
    if (existsSync(f)) for (const v of JSON.parse(readFileSync(f, 'utf8')).placements || []) if (Number.isFinite(v.x)) bodies.push({ id: v.id, type: v.type, x: v.x, z: v.z, radius: v.radius });
  }
  return { P, nav, bodies };
}
export const zoneIds = (dir = join(ROOT, 'data', 'zones')) => readdirSync(dir).filter(z => /^z\d\d_\d\d$/.test(z)).sort();

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = process.argv.slice(2), di = a.indexOf('--dir'), dir = di >= 0 ? a[di + 1] : join(ROOT, 'data', 'zones');
  const rows = [], bad = [];
  for (const zone of zoneIds(dir)) {
    const Z = loadZone(zone, dir);
    for (const r of measureGates(Z)) rows.push({ zone, ...r });
    bad.push(...checkGateStreets(Z).map(b => `${zone} ${b}`));
  }
  if (a.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else if (a.includes('--towns')) {
    console.log('zone    town                kind     road gates  with main  route m  blocked m  narrowest m  least clear ahead m  nav-blocked m');
    const towns = new Map(); for (const r of rows) { const k = r.zone + ' ' + r.town; if (!towns.has(k)) towns.set(k, []); towns.get(k).push(r); }
    for (const [k, all] of towns) {
      const rs = all.filter(r => r.road), [zone, town] = k.split(' ');
      const sum = f => rs.reduce((s, r) => s + f(r), 0), min = f => (rs.length ? Math.min(...rs.map(f)) : NaN);
      console.log([zone.padEnd(7), town.padEnd(19), all[0].kind.padEnd(8), String(rs.length).padStart(10), String(rs.filter(r => r.hasMain).length).padStart(10),
        sum(r => r.metres).toFixed(0).padStart(8), sum(r => r.blocked).toFixed(1).padStart(10), min(r => r.narrowest).toFixed(1).padStart(12), String(min(r => r.ahead)).padStart(20), sum(r => r.navBlocked || 0).toFixed(1).padStart(14)].join(' '));
    }
    const rs = rows.filter(r => r.road);
    console.log(`\n${towns.size} towns, ${rs.length} road gates: ${rs.filter(r => r.hasMain).length} with a main street; ${rs.filter(r => r.blocked > 0).length} blocked (${rs.reduce((s, r) => s + r.blocked, 0).toFixed(1)} m in all); narrowest ${Math.min(...rs.map(r => r.narrowest))} m; gates with a building within 8 m straight ahead: ${rs.filter(r => r.ahead < 8 && /house|office|building/.test(r.firstAhead)).length}`);
  } else {
    console.log('zone    gate                          way     main  width  route m  blocked m  narrowest m  ahead m  first thing straight ahead         nav-blocked  in the way');
    for (const r of rows) console.log([r.zone.padEnd(7), r.gate.padEnd(29), r.wayKind.padEnd(7), (r.hasMain ? 'yes' : 'no').padEnd(5), String(r.width).padStart(5), String(r.metres).padStart(8), String(r.blocked).padStart(10),
      String(r.narrowest).padStart(12), String(r.ahead).padStart(8), ' ' + r.firstAhead.padEnd(33), String(r.navBlocked).padStart(11), ' ' + r.hits.slice(0, 3).join(', ')].join(' '));
  }
  if (a.includes('--check')) { if (bad.length) { console.error('\n' + bad.join('\n')); process.exit(1); } console.log('\nevery gate keeps its promises'); }
}
