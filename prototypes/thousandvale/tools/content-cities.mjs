#!/usr/bin/env node
// Feedback #101 (2026-10-21): "There should also be a few major cities which are guaranteed to have all necessary shop
// keepers." The bake's settlements already say how big each place is (zone.json sites `kind`: hamlet, village, town,
// city). Every CITY (and the capital, Torborhold) gets every shop in CITY_SHOPS: one is missing -> a keeper is added in
// the free house nearest the square, the same way tools/content-offices.mjs places one (door at the plot's front,
// facing the street; a seeded name from the province's name list). Nothing already placed is moved or renamed — that is
// why this is its own step and not a change to content-offices (which renames shopkeepers when it is re-run).
//
//   node tools/content-cities.mjs [--province=torbor_downs] [--check]
// After it: tools/content-givers.mjs (town-services.json, the titles), as after content-offices.
import { writeFileSync } from 'node:fs';
import { J, ROOT, provinceMap, provinceDataPath, provinceDataSync, readNames, HOME_PROVINCE } from './content-lib.mjs';
import { TITLES, SIGN, LIT, SHOP_ROLE, spreadDoors } from './content-offices.mjs';
import { titledOf } from './content-titled.mjs';

/** The shops a city always has: every keeper a player needs, in one place. */
export const CITY_SHOPS = ['general', 'weaponsmith', 'armourer', 'bowyer', 'apothecary', 'tailor', 'jeweller', 'stable', 'inn', 'provisioner', 'barber', 'broker', 'unbinder', 'healer', 'market'];
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function nameFor(N, town, role) { const h = hash(town + ':' + role), sex = h & 1 ? 'f' : 'm'; return `${N.given[sex][(h >>> 1) % N.given[sex].length]} ${N.family[(h >>> 7) % N.family.length]}`; }

export function cityPass(prov = HOME_PROVINCE) {
  const MAP = provinceMap(prov), SHEET = J(`data/provinces/${prov}.json`), N = readNames(prov, SHEET);
  // the province's OWN files (provinceDataSync lays a province's shops over the home ones: writing that back would copy them in)
  const raw = k => { try { return J(provinceDataPath(prov, k)); } catch { return null; } };
  const offices = raw('offices') || provinceDataSync(J, prov, 'offices'), shops = raw('shops');
  const added = [];
  for (const wid of Object.values(MAP)) {
    const zone = J(`data/zones/${wid}/zone.json`), bake = J(`data/zones/${wid}/placements.json`).placements;
    for (const site of (zone.sites || []).filter(s => s.type === 'settlement')) {
      const s = bake.find(p => p.kind === 'settlement' && p.data.hub && p.data.name === site.name);
      if (!s) continue;
      const key = Object.keys(offices.towns).find(k => offices.towns[k].name === site.name);
      const T = key && offices.towns[key];
      const capital = SHEET.capital && SHEET.capital === site.name;
      if (!T || !(site.kind === 'city' || capital)) continue;
      const have = new Set(T.offices.map(o => o.shop).filter(Boolean));
      const used = new Set(T.offices.map(o => o.plot).filter(Boolean));
      const square = bake.find(p => p.kind === 'town_square' && p.data.town === s.id) || s;
      const free = bake.filter(p => p.kind === 'building' && p.data.town === s.id && !used.has(p.id) && !p.data.role && ['house', 'hut'].includes(p.data.want))
        .sort((a, b) => Math.hypot(a.x - square.x, a.z - square.z) - Math.hypot(b.x - square.x, b.z - square.z) || (a.id < b.id ? -1 : 1));
      for (const k of CITY_SHOPS) {
        if (have.has(k)) continue;
        const pick = free.shift();
        if (!pick) { added.push({ town: site.name, shop: k, problem: 'no free house' }); continue; }
        const role = SHOP_ROLE[k] || k;
        const yaw = pick.yaw || 0, d = (pick.data.d || 6) / 2 + 1.2;
        const o = { role, title: TITLES[role] ?? role, name: nameFor(N, site.name, role), plot: pick.id, want: pick.data.want, x: pick.x, z: pick.z, yaw, w: pick.data.w || null, d: pick.data.d || null,
          door: { x: +(pick.x + Math.sin(yaw) * d).toFixed(1), z: +(pick.z + Math.cos(yaw) * d).toFixed(1), yaw: +(yaw + Math.PI).toFixed(3) },
          sign: SIGN[role] ?? null, light: LIT.has(role), shop: k, titled: titledOf({ role, npc: null, shop: k, trains: null }), city: true };
        T.offices.push(o); have.add(k);
        added.push({ town: site.name, shop: k, role, name: o.name, plot: pick.id });
      }
      spreadDoors(T.offices.filter(o => o.city));
      if (shops?.towns?.[site.name]) { const l = shops.towns[site.name].shops ||= []; for (const k of CITY_SHOPS) if (have.has(k) && !l.includes(k)) l.push(k); }
    }
  }
  return { offices, shops, added };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prov = (process.argv.find(a => a.startsWith('--province=')) || '').split('=')[1] || HOME_PROVINCE;
  const { offices, shops, added } = cityPass(prov);
  for (const a of added) console.log(a.problem ? `${a.town}: ${a.shop} — ${a.problem}` : `${a.town}: + ${a.role} ${a.name} (${a.shop}) in ${a.plot}`);
  if (!added.filter(a => !a.problem).length) { console.log('every city has every shop'); process.exit(0); }
  if (process.argv.includes('--check')) { console.error('cities are missing shops: run node tools/content-cities.mjs'); process.exit(1); }
  writeFileSync(new URL(provinceDataPath(prov, 'offices'), ROOT), JSON.stringify(offices, null, 1) + '\n');
  if (shops) writeFileSync(new URL(provinceDataPath(prov, 'shops'), ROOT), JSON.stringify(shops, null, 2) + '\n');
  console.log(`wrote ${provinceDataPath(prov, 'offices')} (+${added.filter(a => !a.problem).length} keepers)`);
}
