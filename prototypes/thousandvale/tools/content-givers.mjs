#!/usr/bin/env node
// Thousandvale — WHO GIVES A QUEST, WHO TAKES ONE BACK, WHO SHOWS A TITLE (stream E, owner feedback 8).
//
//   W12  "Show quest markers (! and ?) above NPCs" — the server decides the mark per player; THIS file is the list it
//        decides from, so no quest NPC is ever left out because a zone file spelled something differently.
//   W27  "Titles … also appear for random NPCs like 'woodcutter' … Only show titles for NPCs the player interacts
//        with" — `titled: true | false` on EVERY NPC record stream E writes (tools/content-titled.mjs is the rule).
//   W15  (D-UI's ask) which services every town has, so the map can search towns you have never walked into.
//
//   node tools/content-givers.mjs            write data/quests/marks/givers.json, data/provinces/town-services.json,
//                                            the `titled` flags (quest files, offices.json, travellers.json,
//                                            wanderers.json, road-events.json) and data/names/titles.json `titled`
//   node tools/content-givers.mjs --check    change nothing; exit 1 when a file would change
//
// It never touches the main placement files (data/vignettes/placements/<zone>.json): stream B's bake reads those.
// Their `npc` rows are quest NPCs by id (titled, listed in givers.json) and their `folk` rows are filler (never
// titled) — titles.json `titled.types` says so, and the test walks every row.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { titledOf, JOB_ROLES, SERVICE_ROLES } from './content-titled.mjs';
import { roadText } from './content-events.mjs';
import { HOME_PROVINCE, provinceArg, provinceDataPath, provinceDataSync, zoneBelongs, requireProvince } from './content-lib.mjs';

const ROOT = new URL('../', import.meta.url);
const P = f => new URL(f, ROOT);
const readJ = f => JSON.parse(readFileSync(P(f), 'utf8'));
const CHECK = process.argv.includes('--check');
const PROV = provinceArg(process.argv);     // --province=<id> (default torbor_downs)

/** Every quest file that defines npcs or quests (zone files AND the parts they include), raw. */
export function rawQuestFiles(prov = PROV) {
  return readdirSync(P('data/quests/')).filter(f => f.endsWith('.json') && !['jobs.json', 'treasure.json', 'province.json', 'events.json'].includes(f) && !/-province\.json$/.test(f))
    .map(f => ({ file: 'data/quests/' + f, data: readJ('data/quests/' + f) })).filter(x => (x.data.npcs || x.data.quests) && zoneBelongs(prov, x.data.zone));     // this province's zone files only
}

export function buildGivers() {
  const files = rawQuestFiles();
  const map = readJ('data/world/province-map.json').provinces[PROV].map;
  const shops = provinceDataSync(readJ, PROV, 'shops');
  const shopRoles = new Set(Object.values(shops.kinds).map(k => k.role).filter(Boolean));
  const npcs = {}, objects = {};
  for (const { file, data } of files) for (const [id, n] of Object.entries(data.npcs || {}))
    npcs[id] = { name: n.name, role: n.role || null, zone: map[data.zone] || null, sheet: data.zone, at: n.at || null, file, gives: [], takes: [], mustTake: [], talks: [], jobs: JOB_ROLES.includes(n.role), ...(n.trains ? { trains: n.trains } : {}) };
  const missing = [];
  for (const { data } of files) for (const q of data.quests || []) {
    if (q.giver) {
      const g = npcs[q.giver];
      if (!g) missing.push(`${q.id}: giver ${q.giver} is not an NPC of any quest file`);
      else { g.gives.push(q.id); g.takes.push(q.id); if (q.needsGiver) g.mustTake.push(q.id); }
    } else if (q.startsFrom) { const k = q.startsFrom.vignette + '/' + q.startsFrom.object; (objects[k] ||= { gives: [] }).gives.push(q.id); }
    (q.steps || []).forEach((st, i) => { if ((st.kind === 'talk' || st.kind === 'deliver') && st.npc) { const t = npcs[st.npc]; if (!t) missing.push(`${q.id}#${i}: ${st.kind} npc ${st.npc} is not an NPC of any quest file`); else if (!t.talks.includes(q.id)) t.talks.push(q.id); } });
  }
  const questNpcs = new Set(Object.keys(npcs));
  const ctx = { shopRoles, questNpcs };
  for (const [id, n] of Object.entries(npcs)) {
    n.offers = n.gives.length + n.talks.length > 0 || n.jobs || !!n.trains || SERVICE_ROLES.includes(n.role);
    if (n.role === 'carter') n.service = 'cart';
    n.titled = titledOf({ npc: id, role: n.role, trains: n.trains }, ctx);
    delete n.file;
  }
  return { npcs, objects, missing, ctx, files };
}

/** Which services a town has: the roles of its offices, plus the angler, the carter and the class trainers who live there. */
export function townServices() {
  const offices = provinceDataSync(readJ, PROV, 'offices') || { towns: {} }, out = {};
  const add = (town, role) => { if (!town || !role) return; const l = (out[town] ||= []); if (!l.includes(role)) l.push(role); };
  for (const t of Object.values(offices.towns)) for (const o of t.offices) if (o.titled !== false && (o.shop || o.npc || JOB_ROLES.includes(o.role) || SERVICE_ROLES.includes(o.role))) { add(t.name, o.role); if (o.shop) add(t.name, o.shop); }
  for (const a of (provinceDataSync(readJ, PROV, 'angling-pools') || {}).anglers || []) add(a.town, 'angler');
  for (const s of (provinceDataSync(readJ, PROV, 'carts') || {}).stops || []) add(s.town, 'carter');
  // Expansion 1: a town whose shops entry names a `harbour` (data/provinces/ships.json) has its Harbourmaster on the pier (js/sim/ships.js places the NPC)
  for (const [t, v] of Object.entries((provinceDataSync(readJ, PROV, 'shops') || {}).towns || {})) if (v && v.harbour) add(t, 'harbourmaster');
  for (const t of Object.keys(out)) out[t].sort();
  return out;
}

function main() {
  requireProvince(process.argv);
  const { npcs, objects, missing, ctx, files } = buildGivers();
  const changed = [];
  const put = (file, obj, indent = 1) => {
    const a = JSON.stringify(obj, null, indent) + '\n', b = existsSync(P(file)) ? readFileSync(P(file), 'utf8') : '';
    if (a === b) return; changed.push(file); if (!CHECK) writeFileSync(P(file), a);
  };
  /** Rewrite a file only through `edit(json)`, keeping its own indent. */
  // a shared file (travellers, wanderers, road events, titles) is the home province's to patch; another province patches its own copy when it has one
  const mine = thing => { const f = provinceDataPath(PROV, thing); return PROV === HOME_PROVINCE || existsSync(P(f)) ? f : null; };
  const patch = (file, edit) => { if (!file) return; const src = readFileSync(P(file), 'utf8'), j = JSON.parse(src); edit(j); const ind = /^\{\n( +)"/.exec(src); put(file, j, ind ? ind[1].length : 1); };

  // 1. the giver index
  put(provinceDataPath(PROV, 'givers'), {
    _doc: 'Stream E (owner feedback 8, W12 "show quest markers (! and ?) above NPCs" + W27). MADE by tools/content-givers.mjs; do not edit. `npcs.<quest NPC id>` = { name, role, zone (world zone), sheet (E zone id), at, gives: quests this NPC hands out (`giver`), takes: quests it can take back (the same ones: js/sim/quests.js gives()), mustTake: the ones that can ONLY be handed in to it (`needsGiver`; every other quest also pays itself when its last step is done), talks: quests with a talk / deliver step AT this NPC (a "?" while that step is the one you are on), jobs: it offers radiant jobs (its role is one of JOB_ROLES — always something to ask), trains: class ids for a trainer, offers: it has anything for the player at all, titled: W27 }. `objects.<vignette>/<object>` = quests started from a thing in the world (`startsFrom`). Stream A decides per player which mark to send: "!" when one of `gives` (or a job) is available to that character now, "?" when one of `takes` is finished or the current step of one of `talks` is here, grey when it has one for later.',
    province: PROV, jobRoles: JOB_ROLES, npcs, objects, missing }, 1);

  // 2. `titled` on every NPC record
  for (const { file } of files) patch(file, j => { for (const [id, n] of Object.entries(j.npcs || {})) n.titled = npcs[id].titled; });
  patch(mine('offices'), j => {
    for (const t of Object.values(j.towns)) for (const o of t.offices) o.titled = titledOf({ role: o.role, npc: o.npc || null, shop: o.shop || null, trains: o.trains && o.trains.length ? o.trains : null }, ctx);
    for (const s of j.setpieces || []) s.titled = titledOf({ npc: s.npc, role: s.role, trains: s.trains }, ctx);
  });
  // travellers: nobody on the road has a title unless the group offers the player something — then only its first member
  const crewFlags = (j, wander) => { for (const k of Object.values(j.kinds || {})) (k.crew || []).forEach((c, i) => { c.titled = !!wander && i === 0 && titledOf({ role: c.role, shop: k.shop, offers: k.offers, curious: k.curious }, {}); }); };
  patch(mine('travellers'), j => { crewFlags(j, false); for (const f of Object.values(j.folk || {})) f.titled = false; });
  patch(mine('wanderers'), j => crewFlags(j, true));
  if (mine('road-events')) {   // road-events.json keeps its own compact look (tools/content-events.mjs roadText)
    const rf = mine('road-events'), src = readFileSync(P(rf), 'utf8'), j = JSON.parse(src);
    for (const k of ['deliver', 'escort', 'rescue']) for (const r of j[k] || []) r.titled = true;
    const next = roadText(j);
    if (next !== src) { changed.push(rf); if (!CHECK) writeFileSync(P(rf), next); }
  }

  // 3. the rule as data, for bodies the server spawns from code
  patch(PROV === HOME_PROVINCE ? 'data/names/titles.json' : null, j => {      // the realm's one title rule: the home run writes it
    const roles = {};
    for (const r of Object.keys(j.roles)) roles[r] = titledOf({ role: r }, ctx);
    j.titled = {
      _doc: 'W27 (owner feedback 8, report #48: "only show titles for NPCs the player interacts with, intentionally placed for the player to find; not random NPC fillers like woodcutter"). WHO SHOWS A TITLE. Stream A sends `info.title` only when this says yes, in this order: (1) the NPC record\'s own `titled` flag (every record stream E writes carries one: quest files\' npcs, offices.json offices and set-piece NPCs, travellers / wanderers crew entries and folk, road-events NPCs, the guard / carter / angler rows of <zone>.quest.json); (2) `types[<placement type>]` for a placement row without the flag (the main placement files, which only B\'s re-bake may rewrite): an `npc` row is a quest NPC -> true, a `folk` row is filler -> false; (3) a quest NPC id listed in data/quests/marks/givers.json -> its `titled`; (4) `roles[<role>]`; (5) `default`. A filler NPC keeps its real name and shows nothing above it. MADE by tools/content-givers.mjs from tools/content-titled.mjs.',
      default: false,
      types: { npc: true, folk: false, guard: false, cart: false },
      shops: true,
      roles,
    };
  });

  // 4. the town services, for the map's search (D-UI W15)
  put(provinceDataPath(PROV, 'town-services'), {
    _doc: 'Stream E (owner feedback 8, W15: the map\'s search "finds shops and highlights the towns that have them"). MADE by tools/content-givers.mjs. `towns.<settlement name>` = the roles and shop kinds found there (offices.json offices that offer something, the angler, the carter). A settlement not listed has none.',
    province: PROV, towns: townServices() }, 1);

  const all = Object.values(npcs);
  console.log(`givers: ${all.length} quest NPCs (${all.filter(n => n.gives.length).length} give, ${all.filter(n => n.mustTake.length).length} must take a hand-in, ${all.filter(n => n.talks.length).length} are talked to, ${all.filter(n => n.jobs).length} give jobs, ${all.filter(n => !n.offers).length} offer nothing), ${Object.keys(objects).length} quest-starting objects`);
  for (const m of missing) console.log('MISSING ' + m);
  console.log(changed.length ? (CHECK ? 'would change: ' : 'written: ') + changed.join(', ') : 'nothing to change');
  if (missing.length || (CHECK && changed.length)) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
