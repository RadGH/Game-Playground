#!/usr/bin/env node
// Stream E — every town NPC's OFFICE (owner play-test 2, Q10: "NPCs all went to the same house and stood on top of
// each other. Each NPC needs their own office — the smith at a forge").
//
//   node tools/content-offices.mjs          -> data/provinces/offices.json (every hub town of Torbor Downs)
//   import { officesFor, buildOffices } from './content-offices.mjs'   (tools/place-vignettes.mjs, tests/E)
//
// For each hub town (stream B's settlements with `hub`, i.e. the ones with a town room) this picks ONE building plot
// of B's town plan (data/zones/<zone>/placements.json kind 'building', data.town = the settlement id) per working NPC:
// the traders data/provinces/shops.json says the town has, the elder, and — in Torborhold — the reeve and the four
// class trainers who keep a house in town (data/quests/classes.json `office`). A plot is used once: two NPCs never share
// a door. Wanted plot kinds per role are in ROLE_WANT (forge for the smith, market for the general merchant, the inn for
// the innkeeper…); when a town has none left the NPC gets the free house/hut nearest the square (shops) or furthest
// from it (homes). Quest NPCs whose quest file stands them in this town (`at` = the town) take the office of their role
// (`npc` = their id — stream A spawns ONE body: the quest NPC, with the office's shop/service) or a house of their own.
// Same inputs -> same file. Set-piece NPCs (trainers, the Pail and Plough's innkeeper) have the set piece as their
// office (`setpieces` list), so the uniqueness rule covers them too.
import { writeFileSync } from 'node:fs';
import { J, ROOT, questFiles, provinceMap } from './content-lib.mjs';
import { writeShops } from './content-shops.mjs';

/** Plot `want`s a role prefers, best first. Stream B's town plan tags the plot each role works in (data.role, from
 *  data/world/town-offices.json) and that always wins; these wants are the fallback for a town B gave no such plot. */
export const ROLE_WANT = {
  elder: ['hall'], smith: ['forge'], merchant: ['shop', 'market'], trader: ['market', 'shop'], innkeeper: ['inn'], healer: ['temple', 'chapel', 'shrine'],
  stablehand: ['stable'], broker: ['counting_house', 'warehouse', 'barracks'], unbinder: ['study', 'shrine', 'chapel'], armourer: ['armoury', 'barracks'],
  bowyer: ['bowyer'], apothecary: ['apothecary'], tailor: ['tailor'], jeweller: ['jeweller'], barber: ['barber'], provisioner: ['provisioner', 'granary'],
  reeve: ['barracks', 'watchpost', 'house'], trainer: ['house', 'hut'], miller: ['mill'], farmer: ['granary'], quartermaster: ['granary', 'warehouse'],
};
/** shops.json kind -> the role that keeps it */
export const SHOP_ROLE = { general: 'merchant', market: 'trader', weaponsmith: 'smith', armourer: 'armourer', bowyer: 'bowyer', apothecary: 'apothecary', tailor: 'tailor',
  jeweller: 'jeweller', stable: 'stablehand', inn: 'innkeeper', provisioner: 'provisioner', barber: 'barber', broker: 'broker', unbinder: 'unbinder', healer: 'healer' };
export const TITLES = { elder: 'Elder', smith: 'Smith', merchant: 'Merchant', trader: 'Market trader', innkeeper: 'Innkeeper', healer: 'Healer', stablehand: 'Stable master',
  broker: 'Broker', unbinder: 'Unbinder', armourer: 'Armourer', bowyer: 'Bowyer', apothecary: 'Apothecary', tailor: 'Tailor', jeweller: 'Jeweller', provisioner: 'Provisioner',
  barber: 'Barber', reeve: 'Reeve', trainer: 'Trainer', miller: 'Miller', farmer: 'Farmer', quartermaster: 'Quartermaster', resident: '' };
/** the sign over the door (stream D-world draws a distinct front per sign; shops.json repeats it per kind) */
export const SIGN = { elder: 'banner', smith: 'anvil', merchant: 'barrel', trader: 'awning', innkeeper: 'tankard', healer: 'bowl', stablehand: 'horseshoe', broker: 'scroll',
  unbinder: 'candle', armourer: 'shield', bowyer: 'bow', apothecary: 'flask', tailor: 'needle', jeweller: 'ring', barber: 'scissors', provisioner: 'sack', reeve: 'keys',
  trainer: 'crest', miller: 'wheel', farmer: 'sheaf', quartermaster: 'sack', resident: null };
/** Q10: "active lights where they should attract the player (shops yes, regular NPCs no)" — stream B's data.lit wins when the plot has one */
export const LIT = new Set(['smith', 'merchant', 'trader', 'innkeeper', 'stablehand', 'armourer', 'bowyer', 'apothecary', 'tailor', 'jeweller', 'barber', 'provisioner', 'trainer']);
/** shops that trade from an office (role -> shops.json kind) */
const ROLE_SHOP = Object.fromEntries(Object.entries(SHOP_ROLE).map(([k, r]) => [r, k]));
/** Torborhold's traders by name (the starting town is hand-made; the rest are drawn from data/names/torbor.json). */
export const NAMED = {
  Torborhold: { smith: 'Garrow Ashby', merchant: 'Wat Pennyworth', trader: 'Nan Haggle', armourer: 'Isolde Harl', bowyer: 'Hal Fletchard', apothecary: 'Granny Sedge',
    tailor: 'Rosamund Thatcher', jeweller: 'Piran Gilt', stablehand: 'Dunstan Hay', innkeeper: 'Gwen Torbor', provisioner: 'Ned Larder', barber: 'Orla Snips',
    broker: 'Tobin Hale', unbinder: 'Sister Edda' },
};
/** what a role says while working, beyond shops.json `says` (D-UI/A barks) */
const SERVICE = { elder: ['quests', 'town news'], reeve: ['quests', 'bounties'], trainer: ['class quest', 'teach'], miller: ['flour'], quartermaster: ['supplies'] };

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * The offices of ONE hub town. `plots` = B's building placements of that town (zone metres), `square` = its town
 * square, `roles` = [{ role, npc?, name?, shop?, trains?, home? }] in priority order. -> [office]
 */
export function officesFor({ town, plots, square, roles, names = null }) {
  const free = plots.map(p => ({ ...p, used: false }));
  const sq = square || town;
  const dSq = p => Math.hypot(p.x - sq.x, p.z - sq.z);
  const out = new Array(roles.length);
  const SPECIAL = w => w !== 'house' && w !== 'hut';
  // pass 1: every role whose FIRST wish is a one-of-a-kind building (forge, market, inn, hall, chapel, stable…) gets it,
  // so the unbinder's fallback to the chapel cannot take the healer's chapel; pass 2: everyone else, in order
  const isFirst = roles.map(r => !r.home && SPECIAL((ROLE_WANT[r.role] || ['house'])[0]));
  roles.forEach((r, i) => { if (isFirst[i]) out[i] = place(r, true); });
  roles.forEach((r, i) => { if (!out[i]) out[i] = place(r, false); });
  return out;
  function place(r, onlyFirst) {
    const wants = (r.home ? ['house', 'hut'] : (ROLE_WANT[r.role] || ['house', 'hut'])).slice(0, onlyFirst ? 1 : 99);
    // stream B's plot for this role (data.role from data/world/town-offices.json) — the building B already shaped for it
    let pick = r.home ? null : free.find(p => !p.used && p.data.role === r.role) || null;
    for (const w of pick ? [] : wants) {
      const c = free.filter(p => !p.used && p.data.want === w && !p.data.role).sort((a, b) => dSq(a) - dSq(b) || (a.id < b.id ? -1 : 1));
      if (c.length) { pick = c[0]; break; }
    }
    if (!pick && onlyFirst) return null;
    if (!pick) {      // any free house or hut: shops nearest the square, homes furthest
      const c = free.filter(p => !p.used && !p.data.role && (p.data.want === 'house' || p.data.want === 'hut')).sort((a, b) => (r.home ? dSq(b) - dSq(a) : dSq(a) - dSq(b)) || (a.id < b.id ? -1 : 1));
      pick = c[0] || free.filter(p => !p.used && !['granary', 'mill'].includes(p.data.want)).sort((a, b) => dSq(a) - dSq(b))[0] || null;
    }
    if (!pick) return { role: r.role, npc: r.npc || null, plot: null, problem: 'no free plot' };
    pick.used = true;
    // stream A's schedules.js `front()`: the NPC stands at the plot's front door, facing the street
    const yaw = pick.yaw || 0, d = (pick.data.d || 6) / 2 + 1.2;
    const door = { x: +(pick.x + Math.sin(yaw) * d).toFixed(1), z: +(pick.z + Math.cos(yaw) * d).toFixed(1), yaw: +(yaw + Math.PI).toFixed(3) };
    const role = r.role;
    const nm = r.name || (names && names[role]) || null;
    return ({
      role, title: r.title ?? TITLES[role] ?? role, name: nm, ...(r.npc ? { npc: r.npc } : {}),
      plot: pick.id, want: pick.data.want, x: pick.x, z: pick.z, yaw, w: pick.data.w || null, d: pick.data.d || null, door,
      sign: r.home ? null : (SIGN[role] ?? null), light: !r.home && (typeof pick.data.lit === 'boolean' && pick.data.role === role ? pick.data.lit : LIT.has(role)),
      ...(pick.data.label && pick.data.role === role ? { label: pick.data.label } : {}),
      ...(r.shop || ROLE_SHOP[role] ? { shop: r.shop || ROLE_SHOP[role] } : {}),
      ...(r.trains ? { trains: r.trains } : {}), ...(SERVICE[role] ? { service: SERVICE[role] } : {}),
      ...(r.home ? { home: true } : {}),
    });
  }
}

/**
 * Two plots facing each other across a narrow street can put their doors within a step of each other: slide the
 * later door sideways along its own front (never into the building) until every door has 2.5 m to itself.
 */
export const DOOR_GAP = 2.5;
export function spreadDoors(list) {
  const done = [];
  for (const o of list) {
    if (!o.door) continue;
    const sx = Math.cos(o.yaw || 0), sz = -Math.sin(o.yaw || 0), half = Math.max(1, ((o.w || 5) / 2) - 0.6);
    const base = { ...o.door };
    for (const off of [0, 1.5, -1.5, half, -half, 2.5, -2.5, 3.5, -3.5]) {
      const c = { x: +(base.x + sx * off).toFixed(1), z: +(base.z + sz * off).toFixed(1), yaw: base.yaw };
      if (done.every(d => Math.hypot(d.x - c.x, d.z - c.z) >= DOOR_GAP)) { o.door = c; break; }
    }
    done.push(o.door);
  }
  return list;
}

/** A name for an unnamed office NPC from data/names/torbor.json (seeded by town + role). */
function nameFor(N, town, role) {
  const h = hash(town + ':' + role), sex = h & 1 ? 'f' : 'm';
  const g = N.given[sex][(h >>> 1) % N.given[sex].length], f = N.family[(h >>> 7) % N.family.length];
  return `${g} ${f}`;
}

/** Every hub town of a province. -> the offices.json object */
export function buildOffices(prov = 'torbor_downs') {
  const MAP = provinceMap(prov), SHEET = J(`data/provinces/${prov}.json`), SHOPS = J('data/provinces/shops.json'), N = J('data/names/torbor.json');
  const quests = questFiles();
  const placesFile = J(`data/provinces/${prov}-places.json`);
  const towns = {}, problems = [], townShops = {};
  for (const [eid, wid] of Object.entries(MAP)) {
    const bake = J(`data/zones/${wid}/placements.json`).placements;
    const rename = ((placesFile.zones || {})[eid] || {}).rename || {};
    for (const s of bake.filter(p => p.kind === 'settlement' && p.data.hub)) {
      const name = s.data.name;
      const plots = bake.filter(p => p.kind === 'building' && p.data.town === s.id);
      const square = bake.find(p => p.kind === 'town_square' && p.data.town === s.id);
      // the traders: every role stream B gave a building here (its town plan), in shops.json kind order, then any role
      // B tagged that sells nothing (miller, farmer). A town B gave no tags falls back to shops.json's list.
      const bRoles = new Set(plots.map(p => p.data.role).filter(Boolean));
      const listed = (SHOPS.towns[name] && SHOPS.towns[name].shops) || ['general', 'weaponsmith', 'inn', 'healer', 'unbinder'];
      const shopTown = { shops: bRoles.size ? Object.keys(SHOPS.kinds).filter(k => bRoles.has(SHOP_ROLE[k])) : listed };
      townShops[name] = shopTown.shops;
      // quest NPCs standing in this town (any zone's quest file, `at` = the town)
      const qnpcs = [];
      for (const q of quests) for (const [id, n] of Object.entries(q.npcs || {})) if (n.at === name) qnpcs.push({ id, ...n });
      const roles = [];
      const taken = new Set();
      const linkRole = role => { const n = qnpcs.find(x => !taken.has(x.id) && (x.role === role || (role === 'reeve' && x.role === 'guard' && /reeve/i.test(x.name)))); if (n) { taken.add(n.id); return n; } return null; };
      // 1. the elder, 2. the traders (shops.json order), 3. the reeve (Torborhold), 4. trainers with an office here, 5. every other quest NPC gets a home
      const add = (role, extra = {}) => { const n = linkRole(role); roles.push({ role, ...(n ? { npc: n.id, name: n.name } : {}), ...extra }); };
      add('elder');
      for (const k of shopTown.shops) add(SHOP_ROLE[k], { shop: k });
      if (qnpcs.some(x => x.role === 'guard' && /reeve/i.test(x.name))) add('reeve');
      for (const role of [...bRoles].filter(r => !roles.some(x => x.role === r))) add(role);      // B's working roles that sell nothing (miller, farmer)
      for (const n of qnpcs.filter(x => x.role === 'trainer' && !taken.has(x.id))) { taken.add(n.id); roles.push({ role: 'trainer', npc: n.id, name: n.name, trains: n.trains || [], title: 'Trainer' }); }
      for (const n of qnpcs.filter(x => !taken.has(x.id))) { taken.add(n.id); roles.push({ role: n.role || 'resident', npc: n.id, name: n.name, home: true, title: '' }); }
      const names = { ...(NAMED[name] || {}) };
      for (const r of roles) if (!r.name && !names[r.role]) names[r.role] = nameFor(N, name, r.role);
      const list = officesFor({ town: { x: s.x, z: s.z }, plots, square, roles, names });
      spreadDoors(list);
      for (const o of list) if (o.problem) problems.push(`${name}: ${o.role} — ${o.problem}`);
      towns[s.id] = { name, zone: wid, sheetZone: eid, kind: s.data.kind, x: s.x, z: s.z, r: s.data.radius, offices: list.filter(o => !o.problem) };
      void rename;
    }
  }
  // set-piece NPCs: the set piece is their office (one NPC, one place)
  const setpieces = [];
  for (const q of quests) for (const [id, n] of Object.entries(q.npcs || {})) if (typeof n.at === 'string' && n.at.startsWith('sp_')) setpieces.push({ npc: id, name: n.name, role: n.role || null, setpiece: n.at, ...(n.trains ? { trains: n.trains } : {}) });
  void SHEET;
  return {
    _doc: 'Stream E (play-test 2, Q10). Where every town NPC works: one building plot per NPC in every hub town of Torbor Downs (stream B\'s town plans, data/zones/<zone>/placements.json kind building — `plot` is its id; x, z, yaw = the plot, zone metres; `door` = where the NPC stands by day, facing the street, as js/sim/schedules.js front() computes it). Made by tools/content-offices.mjs (re-run by tools/place-vignettes.mjs after every re-bake). `role` = the schedules.json role (its day/night blocks: the office replaces the role\'s day anchor), `shop` = the data/provinces/shops.json kind traded here, `sign` = what hangs over the door and `light` = a lit shopfront (stream D-world: a distinct look per sign; lamps only where `light`), `npc` = a quest NPC id (data/quests/*.json) who IS this office\'s keeper — stream A spawns ONE body (the quest NPC) carrying the office\'s role/shop, not a second generic one; `home: true` = a quest NPC\'s own house (no shop, no light), `trains` = the classes a trainer teaches. No plot is used twice in a town; `setpieces` lists the NPCs whose office is a set piece (data/vignettes/setpieces.json).',
    province: prov, towns, setpieces, problems, townShops,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = buildOffices();
  writeShops(out.townShops);
  writeFileSync(new URL('data/provinces/offices.json', ROOT), JSON.stringify(out, null, 1) + '\n');
  const n = Object.values(out.towns).reduce((a, t) => a + t.offices.length, 0);
  console.log(`offices: ${Object.keys(out.towns).length} towns, ${n} offices, ${out.setpieces.length} set-piece NPCs${out.problems.length ? ' PROBLEMS ' + out.problems.join('; ') : ''}`);
  if (out.problems.length) process.exitCode = 1;
}
