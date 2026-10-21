#!/usr/bin/env node
// Feedback #101 / #105 (2026-10-21): "Add town size indicators: Hamlet, Village, City" … "update the caravan NPC to show
// town sizes and maybe even NPC availability". One small file the client reads (the ox-cart window, js/client/ui/
// cart-travel.js): every settlement of every province — its size (the bake's zone.json `kind`; the province's capital
// says so) and who works there (data/provinces/<p>-town-services.json, made by tools/content-givers.mjs).
//
//   node tools/content-town-info.mjs           write data/world/town-info.json
//   node tools/content-town-info.mjs --check   exit 1 when it is out of date (tests/D/feedback-tv21-ui.test.js runs this)
// Re-run after content-givers (it reads its output) and after any re-bake.
import { readFileSync, writeFileSync } from 'node:fs';
import { J, provinceMap, provinceDataSync } from './content-lib.mjs';

const PROVINCES = Object.keys(J('data/world/province-map.json').provinces || {});      // every province the map knows
const RANK = { capital: 0, city: 1, town: 2, village: 3, hamlet: 4 };

export function buildTownInfo() {
  const towns = {};
  for (const prov of PROVINCES) {
    const sheet = J(`data/provinces/${prov}.json`), svc = (provinceDataSync(J, prov, 'town-services') || {}).towns || {};
    for (const wid of Object.values(provinceMap(prov))) {
      let zone; try { zone = J(`data/zones/${wid}/zone.json`); } catch { continue; }
      for (const s of (zone.sites || []).filter(x => x.type === 'settlement' && x.name)) {
        const size = sheet.capital === s.name ? 'capital' : (RANK[s.kind] != null ? s.kind : 'hamlet');
        const had = towns[s.name];
        if (had && RANK[had.size] <= RANK[size]) continue;      // a town on a zone edge is listed by both zones: the bigger word wins
        towns[s.name] = { size, province: prov, services: (svc[s.name] || []).filter(r => r !== 'carter').sort() };
      }
    }
  }
  const sorted = Object.fromEntries(Object.keys(towns).sort().map(k => [k, towns[k]]));
  return { _doc: 'MADE by tools/content-town-info.mjs (do not edit). Every settlement: `size` (hamlet | village | town | city | capital) and `services` (who works there, from <province>-town-services.json; the carter left out). Read by the ox-cart window.', towns: sorted };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = new URL('../data/world/town-info.json', import.meta.url);
  const text = JSON.stringify(buildTownInfo(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    let had = ''; try { had = readFileSync(file, 'utf8'); } catch { /* none */ }
    if (had !== text) { console.error('data/world/town-info.json is out of date: run node tools/content-town-info.mjs'); process.exit(1); }
    console.log('town info up to date');
  } else { writeFileSync(file, text); console.log('wrote data/world/town-info.json'); }
}
