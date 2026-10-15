// QUESTS and RADIANT JOBS (stream A, the server side of stream E's data/quests/**; PLAN §3.4, §4.3). Pure.
//
//   const book = createQuestBook({ layout: L, zones: [{ key, eid, sheet, quests, placements }], rares, jobs, rng })
//   book.offers(ch, giver)              -> views of what this giver offers this character (story quests + jobs)
//   book.accept(ch, id, giver)          -> { ok, why?, quest? }
//   book.abandon(ch, id)                -> { ok }
//   book.progress(ch, ev)               -> [quest ids that moved]   (ev: kill | use | talk | visit | clear | event)
//   book.ready(ch, giver)               -> ids this giver can take back now
//   book.turnIn(ch, id, giver)          -> { ok, why?, reward:{ xpShare, level, gold, item } }
//   book.view(ch)                       -> { active: [view], done: [ids] }      (the client's quest log)
//   book.grantAuto(ch) -> [ids] given ; book.autoDone(ch) -> [ids] complete and self-finishing   (play-test 2, Q27/Q28)
// Quest fields (play-test 2): `auto` (everyone gets it on entering the world), `cls` / `classes` (id | [ids]: that class
// only), `requires` ([ids] all done),
// `minLevel`, `order: 'any'` (steps in any order, a count each), `autoComplete` (pays itself when done); step
// `visit {town}` = reach a settlement.
// S10 (play-test 4) REMOTE TURN-IN: a finished quest pays itself where you stand (autoDone lists it; the province pays it
// and says so with `questR {op:'turnin', auto:true, remote:true}`), unless the quest says `needsGiver: true` (the few
// where handing it back IS the moment — a trainer giving you a companion). `quest {op:'turnin', id}` with no npc also
// works for any finished quest that does not need its giver.
//
// `giver` = { key, npcId?, name, role?, x, z, vignette?, objectName? } — the object the player is using.
// Character state (SAVE_FIELDS `quests`): { active: { id: { step, n, def? } }, done: { id: wall ms }, jobs: { offered:
// { giverKey: { at, list } }, recent: { frame: wall ms } } } — `def` only for jobs (generated, so carried along).
//
// Steps run in order (data/quests/README.md): kill {type, count, near?, rank?, when?} · killOne {encounter} ·
// killRare {zone, slot | rare} · collect {item, count, from, chance} · visit {vignette | site | at} ·
// use {vignette, object | at} · talk / deliver {npc | at} · clear {dungeon:'door' | cave, floor? | boss?} · escort
// (walk to `to`). Places resolve once at load: a vignette id -> its placement, a site name -> the bake site.

import { huntAreas, pickArea, areasTouching } from './hunts.js';
import { killGoldAt, questGold } from './economy-knobs.js';

export const KILL_GOLD = level => killGoldAt(level);     // one kill's gold at a level (quest gold = reward.gold × this) — data/rules/economy.json server.quest (V2)
export const NEAR_M = 150;                              // a step's `near` place: within this many metres
const OWN_FRAMES = new Set(['angler', 'smith', 'apothecary', 'tailor', 'bowyer', 'prospector']);   // W9 (P-core): these givers offer only frames written for their role
const JOB_ROLES = new Set(['elder', 'sergeant', 'captain', 'quartermaster', 'tollkeeper', 'broker', 'innkeeper', 'angler', 'smith', 'apothecary', 'tailor', 'bowyer', 'prospector']);   // W9 (P-core): trade folk offer their own frames only (see jobsFor)   // angler: play-test 5 T25 (frames with giverRole 'angler')
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

export function createQuestBook({ layout: L, zones = [], rares = {}, jobs = null, rng = Math.random, now = () => Date.now(), isNight = () => false, angling = null, peerDef = null }) {      // peerDef(id): Expansion 1 — another province's quest, so it still shows while you are away
  const sites = (L.terrain.reader && L.terrain.reader.meta && L.terrain.reader.meta.sites) || [];
  const defs = new Map();
  const nextOf = new Map();      // id -> the quest it unlocks
  const lockedBy = new Map();    // id -> Set of quests whose `next` it is (any one of them done unlocks it)
  const npcs = new Map();        // npc id -> { name, role, at, zone }
  const placeOf = new Map();     // vignette / placement id -> { x, z, r, name, zone }
  const zoneKeyOfE = new Map(zones.map(z => [z.eid, z.key]));
  // where things stand, for the quest log's markers (play-test 1, P17: "the tracker lacks info to understand the goal")
  const npcPos = new Map();
  for (const o of [...(L.objects || []), ...((L.townObjects || []).flat())]) if (o && o.npc && o.npc.id && !npcPos.has(o.npc.id)) npcPos.set(o.npc.id, { x: o.x, z: o.z, r: 4, name: o.name });
  const zoneName = wid => { const z = zones.find(q => q.key === wid); return (z && z.sheet && z.sheet.name) || L.name; };
  for (const z of zones) {
    for (const p of z.placements || []) if (p.id) placeOf.set(p.id, { x: p.x, z: p.z, r: p.radius || 12, name: p.name || p.id, zone: z.key, type: p.type, template: p.template || null });
  }
  const bare = n => String(n || '').toLowerCase().replace(/^the\s+/, '').trim();
  // S14 (play-test 4): where each monster type REALLY spawns — the camps the server spawns, grouped into areas
  const hunt = huntAreas(L.camps || [], L.zoneOf || null);
  let placeNames = null;                                  // placeNamed()'s list, built on first use
  const areaView = a => ({ x: a.x, z: a.z, r: a.r, n: a.n, zone: a.zone, lv: a.lv });
  const siteByName = name => sites.find(s => s.name === name) || sites.find(s => s.id === name)
    || [...placeOf.values()].find(p => bare(p.name) === bare(name)) || sites.find(s => bare(s.name) === bare(name)) || null;
  function resolveAt(st, zoneKey) {
    if (st.at && typeof st.at === 'object' && Number.isFinite(st.at.x)) return st.at;
    if (st.town) {                    // play-test 2 (Q27): "reach <town>" — inside its circle
      const t = (L.towns || []).find(q => bare(q.name) === bare(st.town)) || sites.find(q => (q.kind === 'settlement' || q.type === 'settlement') && bare(q.name) === bare(st.town));
      if (t) return { x: t.x, z: t.z, r: Math.max(12, (t.r || t.radius || 40) * 0.7), name: t.name };
    }
    if (st.vignette && placeOf.has(st.vignette)) return placeOf.get(st.vignette);
    if (st.site) { const s = siteByName(st.site); if (s) return { x: s.x, z: s.z, r: s.r || s.radius || 40, name: s.name || s.id }; }
    void zoneKey;
    return null;
  }
  function normalize(st, zoneKey) {
    const s = { ...st };
    if (s.kind === 'killRare' && !s.rare) s.rare = ((rares[s.zone] || [])[s.slot ?? 0]) || null;
    if (s.kind === 'visit' || s.kind === 'escort') s.place = resolveAt(s.kind === 'escort' && s.to ? (typeof s.to === 'object' ? { at: s.to } : { site: s.to }) : s, zoneKey);
    if ((s.kind === 'kill' || s.kind === 'collect') && s.near) s.nearAt = typeof s.near === 'object' ? s.near : resolveAt({ site: s.near, vignette: s.near }, zoneKey);
    if (s.kind === 'clear') { s.zone = zoneKey; if (s.dungeon === 'door') s.door = L.doors.findIndex(d => d.zone === zoneKey && d.kind !== 'cave'); }
    s.count = s.count || 1;
    return s;
  }
  for (const z of zones) {
    const q = z.quests;
    if (!q) continue;
    for (const [id, n] of Object.entries(q.npcs || {})) npcs.set(id, { ...n, id, zone: z.key });
    for (const d of q.quests || []) {
      const def = { ...d, zone: z.key, eid: z.eid, steps: (d.steps || []).map(st => normalize(st, z.key)) };
      defs.set(d.id, def);
      const from = npcAt(d.giver);
      // E's marks (data/quests/marks/<province>.json) win; our own lookup fills what they leave null
      const mk = L.marks && L.marks[d.id];
      def.steps.forEach((st, i) => { const m = mk && mk.steps && mk.steps[i]; st.at = round1(m && Number.isFinite(m.x) ? m : stepAt(st, z.key, from)); });
      def.steps.forEach(st => huntMark(st, z.key, from));
      if (mk && mk.giver && Number.isFinite(mk.giver.x) && !npcPos.has(d.giver)) def.giverAt = round1({ ...mk.giver, name: (npcs.get(d.giver) || {}).name || null });
      if (d.next) { nextOf.set(d.id, d.next); (lockedBy.get(d.next) || lockedBy.set(d.next, new Set()).get(d.next)).add(d.id); }
    }
  }

  /** The nearest camp of a monster type (in the quest's zone first), or of an encounter id, as a marker. */
  function campAt({ type = null, encounter = null }, zoneKey, from = null) {
    let best = null, bd = Infinity;
    for (const c of L.camps || []) {
      if (encounter ? c.encounter !== encounter : c.type !== type) continue;
      const inZone = !zoneKey || !L.zoneOf || L.zoneOf(c.x, c.z) === zoneKey;
      const d = (inZone ? 0 : 1e7) + (from ? Math.hypot(c.x - from.x, c.z - from.z) : 0);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) return { x: best.x, z: best.z, r: (best.radius || 10) + 10 };
    const ev = encounter && (L.zoneEvents || []).find(e => e.boss === encounter || e.id === encounter);
    return ev && Number.isFinite(ev.x) ? { x: ev.x, z: ev.z, r: ev.r || 40, name: ev.name || null } : null;
  }
  /** S14: the named place a step's `where` line talks about ("the reeds round Tench Pool"), or null. */
  function placeNamed(text, zoneKey = null, ref = null) {
    if (!text) return null;
    if (!placeNames) {
      placeNames = [];
      for (const p of placeOf.values()) if (p.name) placeNames.push({ n: bare(p.name), x: p.x, z: p.z, r: p.r || 12, zone: p.zone });
      for (const t of sites) if (t.name) placeNames.push({ n: bare(t.name), x: t.x, z: t.z, r: t.r || t.radius || 30, zone: t.zone || null });
      for (const t of L.towns || []) if (t.name) placeNames.push({ n: bare(t.name), x: t.x, z: t.z, r: t.r || 40, zone: t.zone || null });
      placeNames = placeNames.filter(p => p.n.length >= 4).map(p => ({ ...p, k: p.n.replace(/[^a-z']+/g, ' ').trim() })).sort((a, b) => b.n.length - a.n.length);
    }
    const tx = ' ' + bare(text).replace(/[^a-z']+/g, ' ') + ' ';
    // the same name can stand in several zones (a "Well"): only one in the quest's zone, or near its giver, counts
    const local = p => (!zoneKey || (L.zoneOf ? L.zoneOf(p.x, p.z) : p.zone) === zoneKey) || (ref && Math.hypot(p.x - ref.x, p.z - ref.z) < 1200);
    return placeNames.find(p => tx.includes(' ' + p.k + ' ') && local(p)) || null;
  }
  /**
   * S14: a kill / collect step points at where its monster type really spawns. Without `near`, the marker becomes the
   * best hunting area of that type (the quest's zone, the place its `where` names, then nearest the giver; never a
   * thin one when a fuller one exists). With `near` (only kills inside NEAR_M of the place count), `areas` are the ones
   * that reach into that circle. `st.areas` (up to 4, best first) goes to the client to draw.
   */
  function huntMark(st, zoneKey, from) {
    const type = st.kind === 'kill' ? st.type : st.kind === 'collect' ? st.from : null;
    const list = type && hunt.get(type);
    if (!list || !list.length) return;
    if (st.nearAt && Number.isFinite(st.nearAt.x)) {
      const c = { x: st.nearAt.x, z: st.nearAt.z, r: (st.nearAt.r || 12) + NEAR_M };
      const inside = areasTouching(list, c).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
      if (!inside.length) return;
      st.areas = inside.slice(0, 4).map(areaView);
      if (!st.at || !areasTouching(inside, st.at).length) st.at = round1({ ...inside[0], name: st.nearAt.name || null });
      return;
    }
    const a = pickArea(list, { ref: from || st.at, zone: zoneKey, count: st.count, place: placeNamed(st.where || st.text, zoneKey, from || st.at) });
    if (!a) return;
    st.at = round1({ x: a.x, z: a.z, r: a.r, name: (st.at && st.at.name) || null });
    const more = list.filter(b => b !== a && (!a.zone || b.zone === a.zone)).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z));
    st.areas = [a, ...more].slice(0, 4).map(areaView);
  }
  /** Where step `st` of a quest in `zoneKey` happens: { x, z, r, name? } or null (a marker for the map/tracker). */
  function stepAt(st, zoneKey, from = null) {
    switch (st.kind) {
      case 'kill': return st.nearAt ? { x: st.nearAt.x, z: st.nearAt.z, r: (st.nearAt.r || 12) + NEAR_M * 0.25, name: st.nearAt.name || null } : st.type ? campAt({ type: st.type }, zoneKey, from) : null;
      case 'collect': return st.nearAt ? { x: st.nearAt.x, z: st.nearAt.z, r: (st.nearAt.r || 12) + NEAR_M * 0.25, name: st.nearAt.name || null } : st.from ? campAt({ type: st.from }, zoneKey, from) : null;      // round 11 (World, #31): a collect step may carry `near` too
      case 'killOne': return st.encounter ? campAt({ encounter: st.encounter }, null) : null;
      case 'killRare': return st.rare ? campAt({ encounter: st.rare }, null) : null;
      case 'visit': case 'escort': case 'reach': return st.place && Number.isFinite(st.place.x) ? { x: st.place.x, z: st.place.z, r: st.place.r || 12, name: st.place.name || null } : null;
      case 'use': { const p = placeOf.get(st.vignette); return p ? { x: p.x, z: p.z, r: p.r || 12, name: p.name } : null; }
      case 'talk': case 'deliver': return npcAt(st.npc);
      case 'clear': { const d = L.doors && L.doors[st.door]; return d ? { x: d.x, z: d.z, r: 8, name: d.name || null } : null; }
      case 'gather': case 'craft': case 'learn': return st.at && Number.isFinite(st.at.x) ? st.at : null;      // W9 (P-core): the mark its own data gives
      default: return null;
    }
  }
  /** An NPC's spot: its placed object, else the place its quest file names (`at`: a settlement / site / placement). */
  function npcAt(id) {
    if (npcPos.has(id)) return npcPos.get(id);
    const n = npcs.get(id);
    if (!n || !n.at) return null;
    const t = (L.towns || []).find(q => bare(q.name) === bare(n.at));
    if (t) return { x: t.x, z: t.z, r: Math.min(40, t.r || 40), name: n.name };
    const s = placeOf.get(n.at) || siteByName(n.at);
    return s ? { x: s.x, z: s.z, r: 20, name: n.name } : null;
  }
  function round1(p) { return p ? { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, r: Math.round(p.r || 10), ...(p.name ? { name: p.name } : {}) } : null; }
  /** Where a quest is taken back: its NPC, the vignette it starts from, or a job's board. */
  function turnInAt(def) {
    if (def.giverAt) return def.giverAt;
    if (def.giver) { const p = npcAt(def.giver); if (p) return p; }
    if (def.startsFrom && def.startsFrom.vignette) { const p = placeOf.get(def.startsFrom.vignette); if (p) return { x: p.x, z: p.z, r: 6, name: def.startsFrom.object || p.name }; }
    return null;
  }

  const stateOf = ch => { ch.quests ||= { active: {}, done: {}, jobs: {} }; ch.quests.active ||= {}; ch.quests.done ||= {}; ch.quests.jobs ||= {}; return ch.quests; };
  const defOf = (ch, id) => defs.get(id) || (stateOf(ch).active[id] && stateOf(ch).active[id].def) || (peerDef && stateOf(ch).active[id] ? peerDef(id) : null) || null;
  /** Is `giver` the one who hands out / takes back quest `def`? */
  function gives(def, giver) {
    if (!giver) return false;
    if (giver.npcId && giver.npcId === def.giver) return true;
    if (def.giverKey && def.giverKey === giver.key) return true;                       // a job: its board
    const sf = def.startsFrom;
    return !!(sf && giver.vignette === sf.vignette && giver.objectName === sf.object);
  }
  /** Play-test 2 (Q28): a class quest is only for that class (`cls`: id or [ids]); `minLevel` waits for the level. */
  function fits(ch, def) {
    const only = def.cls || def.classes;                 // E writes `classes: [ids]`
    if (only && !(Array.isArray(only) ? only : [only]).includes(ch.cls)) return false;
    if (def.minLevel && (ch.level || 1) < def.minLevel) return false;
    if (Array.isArray(def.requires) && def.requires.length && !def.requires.every(q => stateOf(ch).done[q])) return false;   // E: every listed quest done
    return true;
  }
  function available(ch, def) {
    const s = stateOf(ch);
    if (s.done[def.id] || s.active[def.id]) return false;
    if (!fits(ch, def)) return false;
    const pre = lockedBy.get(def.id);
    return !pre || [...pre].some(q => s.done[q]);
  }
  const rewardView = (def) => ({ xp: def.reward?.xp || 0, gold: questGold(def.reward?.gold, def.level || 1), item: def.reward?.item?.tier || null,
    // play-test 5: T9 crates ({slot, min} each — "Crate: boots (uncommon or better)"), T25 goods, E's own reward line
    ...(def.reward?.crates ? { crates: [].concat(def.reward.crates).map(c => ({ slot: c.slot || 'any', min: c.min || c.minRarity || 'uncommon' })) } : {}), ...(def.reward?.goods ? { goods: def.reward.goods } : {}), ...(def.rewardText ? { text: def.rewardText } : {}) });
  function view(ch, def, a = null) {
    // each step carries its marker (`at`: {x, z, r, name?} world metres) and E's `where` line when it has one (P17)
    const any = def.order === 'any';
    const nOf = (st, i) => (!a ? 0 : any ? Math.min(st.count || 1, (a.ns && a.ns[i]) || 0) : i < a.step ? st.count || 1 : i === a.step ? a.n : 0);
    const steps = def.steps.map((st, i) => ({ text: st.text || st.kind, of: st.count || 1, n: nOf(st, i), done: !!a && (any ? nOf(st, i) >= (st.count || 1) : i < a.step),
      kind: st.kind, ...(st.at ? { at: st.at } : {}), ...(st.where ? { where: st.where } : {}), ...(st.areas ? { areas: st.areas } : {}) }));
    const ti = round1(turnInAt(def));
    const npc = def.giver ? npcs.get(def.giver) : null;
    return { id: def.id, name: def.name, level: def.level || 1, zone: def.zone, zoneName: zoneName(def.zone), giver: def.giver || null, giverName: (npc && npc.name) || (def.giverAt && def.giverAt.name) || null,
      text: def.offer || def.text || '', done: def.done || null,
      group: def.group || null, step: a ? a.step : 0, steps, ...(any ? { order: 'any' } : {}), ...(def.cls || def.classes ? { cls: def.cls || def.classes } : {}), ...(def.auto ? { auto: true } : {}), ready: !!a && a.step >= def.steps.length, job: !!def.job, reward: rewardView(def), story: def.story || null,
      ...(ti ? { turnIn: ti } : {}), ...(def.needsGiver ? { needsGiver: true, remote: false } : { remote: true }) };
  }

  // ---- radiant jobs: frames bound to what exists in the giver's zone right now ----
  function jobsFor(ch, giver) {
    if (!jobs || !jobs.frames || !giver || !JOB_ROLES.has(giver.role)) return [];
    const s = stateOf(ch);
    const t = now();
    const R = jobs.rules || {};
    const keep = s.jobs.offered ||= {};
    const recent = s.jobs.recent ||= {};
    const cur = keep[giver.key];
    if (cur && t - cur.at < (R.refreshMinutes || 20) * 60000) return cur.list.filter(j => !s.active[j.id]);
    const zoneKey = L.zoneOf(giver.x, giver.z);
    const zone = zones.find(z => z.key === zoneKey) || {};
    const band = (zone.sheet && zone.sheet.band) || [1, 10];
    const P = zone.placements || [];
    const camps = L.camps.filter(c => L.zoneOf(c.x, c.z) === zoneKey && !c.encounter && c.type && (c.level || 1) >= band[0] - 1 && (c.level || 1) <= band[1] + 1);
    const pool = {
      monster: [...new Map(camps.map(c => [c.type, { id: c.type, name: plural(c.type), x: c.x, z: c.z }])).values()],
      vignette: P.filter(p => p.type === 'vignette').map(p => ({ id: p.id, name: p.name || p.id, x: p.x, z: p.z, r: p.radius || 10 })),
      settlement: sites.filter(x => x.type === 'settlement' && x.zone === zoneKey).map(x => ({ id: x.name, name: x.name, x: x.x, z: x.z, r: x.radius || x.r || 40 })),
      fort: P.filter(p => p.type === 'fort' && p.friendly !== false).map(p => ({ id: p.id, name: p.name, x: p.x, z: p.z, r: p.radius || 20 })),
      farm: P.filter(p => p.type === 'farm').map(p => ({ id: p.id, name: p.name, x: p.x, z: p.z, r: p.radius || 20, template: p.template })),
      cave: L.doors.map((d, i) => ({ d, i })).filter(({ d }) => d.kind === 'cave' && d.zone === zoneKey).map(({ d, i }) => ({ id: d.key, name: d.name, x: d.x, z: d.z, r: 10, door: i })),
      dungeon: L.doors.map((d, i) => ({ d, i })).filter(({ d }) => d.kind !== 'cave' && d.zone === zoneKey).map(({ d, i }) => ({ id: 'door:' + i, name: d.name, x: d.x, z: d.z, r: 10, door: i })),
      rare: P.filter(p => p.type === 'rare' && !p.questBoss).map(p => ({ id: p.id, name: p.name || p.id, x: p.x, z: p.z })),
    };
    const seen = new Set(s.jobs.seen || []);
    const list = [];
    // T25: fish this zone's waters hold (E's angling.json, by level band) for the angler's job frames
    pool.fish = ((angling && angling.fish) || []).filter(f => f && f.id && (!Array.isArray(f.bands) || (band[0] <= f.bands[1] && band[1] >= f.bands[0])) && !f.pool).map(f => ({ id: f.id, name: f.name, rarity: f.rarity || 'common', skill: f.skill || 0, x: giver.x, z: giver.z }));
    // a frame written for one kind of giver (`giverRole`) is only that giver's; an angler offers nothing else
    const frames = jobs.frames.filter(f => (f.giverRole ? f.giverRole === giver.role : !OWN_FRAMES.has(giver.role)) && !(recent[f.id] && t - recent[f.id] < (R.repeatGapMinutes || 60) * 60000));
    const bag = frames.slice();
    for (let guard = 0; list.length < (R.maxOffered || 4) && bag.length && guard < 40; guard++) {
      const total = bag.reduce((a, f) => a + (f.weight || 1), 0);
      let r = rng() * total, k = 0;
      for (; k < bag.length - 1; k++) { r -= bag[k].weight || 1; if (r <= 0) break; }
      const f = bag.splice(k, 1)[0];
      const bound = bind(f, pool, giver, seen);
      if (!bound) continue;                                 // a frame whose slots cannot all bind is never offered
      const subst = str => String(str || '').replace(/\{(\w+)\.(\w+)\}/g, (m, a, b) => (a === 'zone' ? zoneName(zoneKey) : a === 'giver' ? (giver[b] || giver.name) : bound[a] ? String(bound[a][b] ?? '') : m));
      const g = f.goal || {};
      const at = typeof g.at === 'string' ? bound[g.at.replace(/[{}]/g, '')] : null;
      const target = typeof g.target === 'string' ? bound[g.target.replace(/[{}]/g, '').split('.')[0]] : null;
      const from = typeof g.from === 'string' ? bound[g.from.replace(/[{}]/g, '').split('.')[0]] : null;
      const near = typeof g.near === 'string' ? bound[g.near.replace(/[{}]/g, '')] : null;
      const step = { kind: g.kind, count: g.count || 1, text: subst(f.title) };
      if (g.kind === 'kill') Object.assign(step, { type: target && target.id, rank: g.rank || null, when: g.when || null, nearAt: near || null });
      else if (g.kind === 'collect') Object.assign(step, { from: from && from.id, chance: g.chance ?? 0.5, item: 'Proof' });
      else if (g.kind === 'killRare') Object.assign(step, { rare: target && target.id });
      else if (g.kind === 'visit' || g.kind === 'use' || g.kind === 'talk' || g.kind === 'deliver') Object.assign(step, { place: at, kind: g.kind === 'use' ? 'visit' : g.kind === 'deliver' || g.kind === 'talk' ? 'reach' : 'visit' });
      else if (g.kind === 'escort') { const to = bound[String(g.to || '').replace(/[{}]/g, '')]; Object.assign(step, { kind: 'visit', place: to }); }
      else if (g.kind === 'clear') Object.assign(step, { door: at ? at.door : -1, floor: g.floor || null, boss: !!g.boss, zone: zoneKey });
      else if (g.kind === 'catch') Object.assign(step, { fish: target ? target.id : null, pool: !!g.pool, rarity: g.rarity || null });   // T25: an angler's job
      else if (g.kind === 'cook') Object.assign(step, { meal: g.meal || null });
      else if (g.kind === 'gather' || g.kind === 'craft') Object.assign(step, { prof: g.prof || null, mat: g.mat || null, recipe: g.recipe || null });   // W9 (P-core)
      step.at = round1(stepAt(step, zoneKey, giver));
      huntMark(step, zoneKey, giver);
      const id = `job:${f.id}:${giver.key}:${Math.floor(t / 60000)}`;
      list.push({ id, name: subst(f.title), text: subst(f.text), level: Math.round((band[0] + band[1]) / 2), job: true, frame: f.id, giverKey: giver.key, giver: giver.npcId || null, zone: zoneKey, steps: [step], reward: f.reward || {},
        giverAt: round1({ x: giver.x, z: giver.z, r: 4, name: giver.name }) });
    }
    keep[giver.key] = { at: t, list };
    return list;
  }
  function bind(f, pool, giver, seen) {
    const out = {};
    for (const n of f.needs || []) {
      let cands = (pool[n.type] || []).slice();
      if (n.same === 'giver') cands = cands.filter(c => Math.hypot(c.x - giver.x, c.z - giver.z) < (c.r || 40) + 30);
      else if (n.type === 'settlement') cands = cands.filter(c => Math.hypot(c.x - giver.x, c.z - giver.z) > (c.r || 40) + 30);
      if (n.from === 'farm.pests' && out.farm) cands = cands.filter(c => (L.camps.some(k => k.type === c.id && Math.hypot(k.x - out.farm.x, k.z - out.farm.z) < 80)));
      if (n.family === 'humanoid') cands = cands.filter(c => /brigand|cult|zealot|bandit|raider|smuggler|wrecker/.test(c.id));
      if (n.type === 'fish') {                      // T25: a named fish, or one of a rarity the giver's zone holds, not above a skill
        if (n.id) cands = cands.filter(c => c.id === n.id);
        if (Array.isArray(n.rarity)) cands = cands.filter(c => n.rarity.includes(c.rarity));
        if (Number.isFinite(n.maxSkill)) cands = cands.filter(c => (c.skill || 0) <= n.maxSkill);
      }
      cands = cands.filter(c => !Object.values(out).includes(c));
      if (!cands.length) return null;
      if (n.prefer === 'undiscovered') { const fresh = cands.filter(c => !seen.has(c.id)); if (fresh.length && rng() < 0.8) cands = fresh; }
      out[n.slot] = cands[Math.floor(rng() * cands.length)];
    }
    return out;
  }

  // ---- progress ----
  function stepDone(a, def) { const st = def.steps[a.step]; if (!st) return; if (a.n >= (st.count || 1)) { a.step++; a.n = 0; } }
  function bump(a, def, k = 1) { a.n += k; stepDone(a, def); }
  const fullCount = st => (st.kind === 'clear' || st.kind === 'visit' || st.kind === 'reach' || st.kind === 'escort' ? st.count || 1 : 1);
  /**
   * Play-test 2 (Q27 "lead to another town and defeat a mini boss, in any order"): a quest with `order: 'any'` keeps a
   * count per step (`a.ns`) and every step that matches moves; `a.step` = how many steps are complete, so "ready" and
   * the turn-in work unchanged. Returns true when something moved.
   */
  function bumpAny(a, def, ev, k = null) {
    a.ns ||= def.steps.map(() => 0);
    let moved = false;
    def.steps.forEach((st, i) => {
      const of = st.count || 1;
      if ((a.ns[i] || 0) >= of || st.kind === 'collect' && k === 'credit' || !matches(st, ev)) return;
      a.ns[i] = Math.min(of, (a.ns[i] || 0) + fullCount(st)); moved = true;
    });
    a.step = def.steps.filter((st, i) => (a.ns[i] || 0) >= (st.count || 1)).length;
    return moved;
  }
  const within = (p, x, z, pad = 0) => !!p && Math.hypot(p.x - x, p.z - z) <= (p.r || 12) + pad;
  function matches(st, ev) {
    switch (st.kind) {
      case 'kill': return ev.kind === 'kill' && ev.type === st.type && (!st.rank || ev.rankName === st.rank || ev.rank === st.rank) && (!st.when || (st.when === 'night') === ev.night) && (!st.nearAt || within(st.nearAt, ev.x, ev.z, NEAR_M));
      case 'killOne': return (ev.kind === 'kill' || ev.kind === 'event') && ev.encounter === st.encounter;
      case 'killRare': return ev.kind === 'kill' && !!st.rare && ev.encounter === st.rare;
      case 'collect': return ev.kind === 'kill' && ev.type === st.from && (!st.nearAt || within(st.nearAt, ev.x, ev.z, NEAR_M)) && rng() < (st.chance ?? 1);
      case 'visit': case 'escort': return ev.kind === 'visit' && within(st.place, ev.x, ev.z, 6);
      case 'reach': return (ev.kind === 'visit' && within(st.place, ev.x, ev.z, 6)) || (ev.kind === 'talk' && within(st.place, ev.x, ev.z, 10));
      case 'use': return ev.kind === 'use' && ev.vignette === st.vignette && (!st.object || ev.name === st.object);
      case 'talk': case 'deliver': return ev.kind === 'talk' && ev.npcId === st.npc;
      case 'ride': return ev.kind === 'ride' && (!st.to || ev.to === st.to) && (!st.from || ev.from === st.from);      // W5 (round 8): an ox-cart ride that arrived
      case 'voyage': return ev.kind === 'voyage' && (!st.to || ev.to === st.to) && (!st.from || ev.from === st.from);   // EXPANSION-1 §6: a sea crossing that arrived (js/sim/ships.js)
      case 'clear': return ev.kind === 'clear' && ev.door === st.door && ev.zone === st.zone && (st.boss || st.floor == null ? ev.boss : ev.floor >= st.floor || ev.boss);
      // play-test 5 T25 (E's step kinds): a landed fish (never junk or a crate) / a cooked meal
      case 'catch': return ev.kind === 'fish' && (!st.fish || ev.species === st.fish) && (!st.pool || !!ev.pool) && (!st.rarity || (RARITY_RANK[ev.rarity] ?? 0) >= (RARITY_RANK[st.rarity] ?? 0));
      case 'cook': return ev.kind === 'cook' && (!st.meal || ev.meal === st.meal || ev.recipe === st.meal);
      // round 8 W9 (P-core): a gathered piece / a finished craft / a profession learned
      case 'gather': return ev.kind === 'gather' && (!st.prof || ev.prof === st.prof) && (!st.mat || ev.mat === st.mat);
      case 'craft': return ev.kind === 'craft' && (!st.prof || ev.prof === st.prof) && (!st.recipe || ev.recipe === st.recipe || ev.makes === st.recipe);
      case 'learn': return ev.kind === 'learn' && (!st.prof || ev.prof === st.prof);
      default: return false;
    }
  }

  // W12: who gives what, built once (a mark is asked for every NPC in sight of every player)
  const giverDefs = new Map(), startDefs = [], talkNpcs = new Set();
  for (const def of defs.values()) {
    if (def.giver) { let l = giverDefs.get(def.giver); if (!l) giverDefs.set(def.giver, l = []); l.push(def); }
    if (def.startsFrom) startDefs.push(def);
    for (const st of def.steps || []) if ((st.kind === 'talk' || st.kind === 'deliver') && st.npc) talkNpcs.add(st.npc);
  }

  return {
    defs, npcs, placeOf, nextOf, hunt,
    offers(ch, giver) {
      const out = [];
      for (const def of defs.values()) if (gives(def, giver) && available(ch, def)) out.push(view(ch, def));
      for (const j of jobsFor(ch, giver)) out.push(view(ch, j));
      return out;
    },
    accept(ch, id, giver) {
      const s = stateOf(ch);
      if (s.active[id]) return { ok: false, why: 'have', msg: 'You are already on that one.' };
      if (Object.keys(s.active).length >= 25) return { ok: false, why: 'full', msg: 'Your quest log is full (25).' };
      let def = defs.get(id);
      if (def) {
        if (!gives(def, giver)) return { ok: false, why: 'giver', msg: 'Ask the one who wants it done.' };
        if (!available(ch, def)) return { ok: false, why: s.done[id] ? 'done' : 'locked', msg: s.done[id] ? 'You did that already.' : 'Not yet.' };
        s.active[id] = { step: 0, n: 0 };
      } else {
        const offered = giver && s.jobs.offered && s.jobs.offered[giver.key];
        def = offered && offered.list.find(j => j.id === id);
        if (!def) return { ok: false, why: 'unknown', msg: 'That job has gone.' };
        s.active[id] = { step: 0, n: 0, def };
      }
      return { ok: true, quest: view(ch, def, s.active[id]) };
    },
    /**
     * P17: a fight already won counts. Replay `events` (the character's recent quest events — kills, event wins,
     * clears, uses — newest last) through quest `id`'s steps, in order, as if they happened now. Returns true when it
     * moved. (Accepting "Brigands at the cart" right after killing the three brigands used to read 0/3.)
     */
    credit(ch, id, events = []) {
      const s = stateOf(ch), a = s.active[id], def = defOf(ch, id);
      if (!a || !def || !events.length) return false;
      let moved = false;
      if (def.order === 'any') { for (const ev of events) if (bumpAny(a, def, ev, 'credit')) moved = true; return moved; }
      for (const ev of events) {
        if (a.step >= def.steps.length) break;
        const st = def.steps[a.step];
        if (st.kind === 'collect') continue;            // a drop that was never rolled for this quest is not owed
        if (matches(st, ev)) { bump(a, def, st.kind === 'clear' ? st.count || 1 : 1); moved = true; }
      }
      return moved;
    },
    abandon(ch, id) { const s = stateOf(ch); if (!s.active[id]) return { ok: false, why: 'unknown' }; delete s.active[id]; return { ok: true }; },
    progress(ch, ev) {
      const s = stateOf(ch), moved = [];
      if (ev.kind === 'visit' && ev.seen) { s.jobs.seen ||= []; if (!s.jobs.seen.includes(ev.seen)) { s.jobs.seen.push(ev.seen); if (s.jobs.seen.length > 200) s.jobs.seen.shift(); } }
      for (const [id, a] of Object.entries(s.active)) {
        const def = defOf(ch, id);
        if (!def || a.step >= def.steps.length) continue;
        if (def.order === 'any') { if (bumpAny(a, def, ev)) moved.push(id); continue; }
        const st = def.steps[a.step];
        if (matches(st, ev)) { bump(a, def, fullCount(st)); moved.push(id); }
      }
      return moved;
    },
    /** Q27: give every `auto` quest this character can have and has not had (on entering the world). */
    grantAuto(ch) {
      const s = stateOf(ch), out = [];
      for (const def of defs.values()) {
        if (!def.auto || !available(ch, def) || Object.keys(s.active).length >= 25) continue;
        s.active[def.id] = { step: 0, n: 0 };
        out.push(def.id);
      }
      return out;
    },
    /** Quests that finish themselves (`autoComplete`) and are complete now: the province pays them with no giver. */
    autoDone(ch) { const s = stateOf(ch); return Object.entries(s.active).filter(([id, a]) => { const d = defOf(ch, id); return d && (d.autoComplete || !d.needsGiver) && a.step >= d.steps.length; }).map(([id]) => id); },
    /** Steps that need a position check (visit, escort, reach) — cheap to skip when nobody has one. */
    wantsPosition(ch) {
      const s = stateOf(ch), pos = st => st && (st.kind === 'visit' || st.kind === 'escort' || st.kind === 'reach');
      for (const [id, a] of Object.entries(s.active)) {
        const d = defOf(ch, id); if (!d) continue;
        if (d.order === 'any') { if (d.steps.some((st, i) => pos(st) && ((a.ns && a.ns[i]) || 0) < (st.count || 1))) return true; continue; }
        if (pos(d.steps[a.step])) return true;
      }
      return false;
    },
    ready(ch, giver) { const s = stateOf(ch); return Object.entries(s.active).filter(([id, a]) => { const d = defOf(ch, id); return d && a.step >= d.steps.length && gives(d, giver); }).map(([id]) => id); },
    turnIn(ch, id, giver) {
      const s = stateOf(ch), a = s.active[id], def = defOf(ch, id);
      if (!a || !def) return { ok: false, why: 'unknown', msg: 'You are not on that quest.' };
      if (a.step < def.steps.length) return { ok: false, why: 'notDone', msg: 'It is not finished yet.' };
      if (!(!giver && (def.autoComplete || !def.needsGiver)) && !gives(def, giver)) return { ok: false, why: 'giver', msg: 'Take it back to whoever asked.' };
      delete s.active[id];
      if (def.job) { s.jobs.recent ||= {}; s.jobs.recent[def.frame] = now(); }
      else s.done[id] = now();
      const rw = def.reward || {};
      return { ok: true, def, next: nextOf.get(id) || def.next || null, reward: { xpShare: rw.xp || 0, level: def.level || 1, gold: questGold(rw.gold, def.level || 1), item: rw.item || null } };
    },
    /**
     * W12 (owner feedback 8, report #33): the marker over a giver's head FOR THIS CHARACTER —
     *   'turnin' (gold ?)  a finished quest of yours goes back to them, or your current step is to talk / deliver to them
     *   'offer'  (gold !)  they have a story quest you can take now
     *   'active' (grey ?)  a quest of theirs is in your log, not finished
     *   'later'  (grey !)  they have a quest you cannot take yet (level, class, an earlier quest)
     *   'job'              only repeatable work on offer (a job board role) — drawn dim, or not at all
     *   null               nothing for you
     * Priority in that order. Cheap: no job is generated, nothing is written.
     */
    mark(ch, giver) {
      if (!giver) return null;
      const s = stateOf(ch);
      let active = false, offer = false, later = false;
      for (const [id, a] of Object.entries(s.active)) {
        const def = defOf(ch, id);
        if (!def) continue;
        const done = a.step >= def.steps.length;
        if (done) { if (gives(def, giver)) return 'turnin'; continue; }
        const open = def.order === 'any' ? def.steps : [def.steps[a.step]];
        for (const st of open) if (st && (st.kind === 'talk' || st.kind === 'deliver') && giver.npcId && st.npc === giver.npcId) return 'turnin';
        if (def.road && def.road.target && giver.key && def.road.target.key === giver.key) return 'turnin';      // a road delivery's named recipient
        if (gives(def, giver)) active = true;
      }
      const mine = giverDefs.get(giver.npcId || '') || [];
      for (const def of mine) { if (s.done[def.id] || s.active[def.id]) continue; if (available(ch, def)) { offer = true; break; } later = true; }
      if (!offer && giver.vignette) for (const def of startDefs) { if (!gives(def, giver) || s.done[def.id] || s.active[def.id]) continue; if (available(ch, def)) { offer = true; break; } later = true; }
      if (offer) return 'offer';
      if (active) return 'active';
      if (later) return 'later';
      return jobs && jobs.frames && giver.role && JOB_ROLES.has(giver.role) ? 'job' : null;
    },
    /** Could this giver EVER carry a mark? (a quest NPC, a quest-starting object, a job role, a talk / deliver target) */
    marks(giver) { return !!giver && (giverDefs.has(giver.npcId || '') || talkNpcs.has(giver.npcId || '') || (!!giver.role && JOB_ROLES.has(giver.role)) || (!!giver.vignette && startDefs.some(d => gives(d, giver)))); },
    view(ch) { const s = stateOf(ch); return { active: Object.entries(s.active).map(([id, a]) => { const d = defOf(ch, id); return d ? view(ch, d, a) : null; }).filter(Boolean), done: Object.keys(s.done) }; },
    npcInfo: id => npcs.get(id) || null,
    /** S5 (play-test 4): the quest-log view of a generated def (road events offer job-shaped quests through the job path). */
    viewDef: (ch, def, a = null) => view(ch, def, a),
    zoneKeyOfE: eid => zoneKeyOfE.get(eid) || null,
  };
}

/** A monster type id as a plural display name: moor_hound -> "moor hounds" (the client shows its own names). */
export function plural(type) { const s = String(type || '').replace(/_/g, ' '); return /s$/.test(s) ? s : /(ch|sh|x)$/.test(s) ? s + 'es' : /[^aeiou]y$/.test(s) ? s.slice(0, -1) + 'ies' : s + 's'; }
