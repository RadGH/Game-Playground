// Play-test 8 (stream D-UI) — the pure half of the round's interface: no DOM, no storage, no three. Node-tested in
// tests/D/pt8.test.js. The windows that use it: ui/loot.js (W8), ui/my-reports.js (W29), ui/event-tracker.js +
// ui/worldmap.js (W13), ui/map-tools.js (W15, W17, W12), ui/meter-window.js (W21), ui/cart-travel.js (W5), bag.js (W19).

// ------------------------------------------------------------------------------------------------ W8: the loot window
/** The rows of a loot window in the order they are drawn: gold first, then your items, then what the party left. */
export function lootRows(d) {
  if (!d) return [];
  const rows = [];
  if (d.gold > 0) rows.push({ uid: 'gold', corpse: null });
  for (const it of d.items || []) rows.push({ uid: it.uid, corpse: it.corpse ?? null });
  for (const it of d.free || []) rows.push({ uid: it.uid, corpse: it.corpse ?? null });
  return rows;
}
/** Arrow keys: the selection stops at the ends (it does not wrap — holding Down lands on the last row). */
/**
 * Wrap-up (report #58): does a `lootWin {id, closed}` close the open window? The window spans several bodies and is led by
 * whichever still holds something, so its id MOVES as bodies empty; `seen` is every id this window has been drawn under.
 * Comparing with the current id alone left the window open on its last row when the server named an earlier leader.
 */
export const lootCloses = (openId, seen, closedId) => openId != null && (openId === closedId || !!seen?.has?.(closedId));
/** The body a gold take should name: the leading one if it holds gold, else the first of the group that does. */
export function lootGoldBody(d, openId) {
  const g = d?.group || [];
  if (!g.length || g.some(p => p.id === openId && p.gold > 0)) return openId;
  return g.find(p => p.gold > 0)?.id ?? openId;
}
export const lootStep = (sel, n, d) => (n <= 0 ? 0 : Math.max(0, Math.min(n - 1, (sel | 0) + d)));

// ------------------------------------------------------------------------------------- W29 / W28: reports and their notes
/** Every state a report can be in, as the player reads it. */
export const REPORT_STATES = { new: 'New', approved: 'Approved', declined: 'Declined', completed: 'Completed', closed: 'Closed', trash: 'Trash' };
export const NOTE_MAX = 500;
export const reportState = s => REPORT_STATES[s] || REPORT_STATES.new;
/** The heading over the team's note, by state. */
export function noteHeading(state) {
  return state === 'completed' ? 'Completed — how it was fixed' : state === 'declined' ? 'Declined — why' : state === 'approved' ? 'Approved — a note from the team' : state === 'closed' ? 'Closed — a note from the team' : 'A note from the team';
}
/** The server's rows, tidied: known states only (a trashed one reads as declined to its author), newest first. */
export function tidyMine(list) {
  return (Array.isArray(list) ? list : []).filter(r => r && r.id != null).map(r => {
    let state = String(r.state || 'new');
    if (state === 'trashed' || state === 'trash') state = 'closed';
    if (state === 'done' || state === 'complete') state = 'completed';
    if (!(state in REPORT_STATES)) state = 'new';
    return { id: r.id, at: r.at || r.t || 0, kind: r.kind === 'bug' ? 'bug' : 'suggestion', text: String(r.text || ''), state, note: String((state === 'completed' ? r.done || r.note : r.note || r.adminNote) || '').trim(), noteAt: (state === 'completed' ? r.doneAt : 0) || r.noteAt || 0, ref: r.ref ?? null };
  }).sort((a, b) => (b.at - a.at) || (b.id - a.id));
}
/** "Reply" starts a new report with the reference in front. What was already typed is kept after it (once). */
export function replyText(id, typed = '') {
  const rest = String(typed || '').replace(/^#\d+\s*/, '');
  return `#${id} ${rest}`;
}
/** Completed needs a line the player can read. */
export function completeCheck(note) {
  const t = String(note || '').trim();
  if (t.length < 8) return { ok: false, why: 'Write a short note first: how was it fixed? The player reads it under My reports.' };
  if (t.length > NOTE_MAX) return { ok: false, why: `Keep the note under ${NOTE_MAX} characters.` };
  return { ok: true };
}
/** The report a text answers ("#12 …"), when it is one of yours (A links the two with `ref`; anything else is sent as plain text). */
export function replyRef(text, mine) {
  const m = /^#(\d+)\b/.exec(String(text || '').trim());
  if (!m) return null;
  const id = +m[1];
  return (mine || []).some(r => +r.id === id) ? id : null;
}

// ------------------------------------------------------------------------------------------- W13: hiding an event
/** Every name an event may be known by (the tracker hears `uid`, the map `id`, a late frame only the name). */
export function eventTokens(ev) {
  if (!ev) return [];
  const out = [];
  if (ev.uid != null && ev.uid !== '') out.push('u:' + ev.uid);
  if (ev.id != null && ev.id !== '') out.push('i:' + ev.id);
  const name = String(ev.name || '').replace(/ — wave .*$/, '').trim();
  if (name) out.push('n:' + name.toLowerCase());
  return out;
}
/**
 * The set of events the player hid from the HUD. `load()` -> saved list, `save(list)`. An event is hidden when ANY of its
 * tokens is in the set (hiding stores all of them, so the map's record and the tracker's record of one event agree).
 */
export function createHidden({ load = () => [], save = () => {} } = {}) {
  let set = new Set(Array.isArray(load()) ? load() : []);
  const names = new Map();                 // token -> display name (for the "bring it back" list)
  const fns = new Set();
  const fire = () => { save([...set]); for (const f of fns) { try { f(); } catch { /* a listener must not break hiding */ } } };
  const api = {
    has(ev) { return eventTokens(ev).some(t => set.has(t)); },
    hide(ev) { const ts = eventTokens(ev); if (!ts.length) return false; for (const t of ts) { set.add(t); names.set(t, ev.name || 'An event'); } fire(); return true; },
    show(ev) { let n = 0; for (const t of eventTokens(ev)) if (set.delete(t)) n++; if (n) fire(); return n > 0; },
    showAll() { if (!set.size) return false; set = new Set(); fire(); return true; },
    get size() { return set.size; },
    list() { return [...set]; },
    onChange(fn) { fns.add(fn); return () => fns.delete(fn); },
  };
  return api;
}
/** May this card be hidden right now? Not while you are in it, and not a result card (that one has its own ×). */
export const canHideEvent = (e, inside) => !!e && !inside && e.state !== 'won' && e.state !== 'lost';

// ----------------------------------------------------------------------------- W15: town services, filters, the search
/** What each working role is called on the map, and the words a search for it may use. */
export const SERVICES = {
  stablehand: { label: 'Stable', words: 'stable stables horse mount stablemaster' },
  angler: { label: 'Angler', words: 'angler fishing fish rod bait' },
  trainer: { label: 'Class trainer', words: 'trainer training class skills teacher' },
  prospector: { label: 'Mining trainer', words: 'prospector mining miner ore pick trainer teacher' },
  logger: { label: 'Logging trainer', words: 'logger logging woodcutting lumber timber hatchet trainer teacher' },
  forager: { label: 'Foraging trainer', words: 'forager foraging herbs mushrooms fibre sickle trainer teacher' },
  skinner: { label: 'Skinning trainer', words: 'skinner skinning hides leather knife trainer teacher' },
  smith: { label: 'Weaponsmith', words: 'smith smithy weapons blacksmith forge' },
  armourer: { label: 'Armourer', words: 'armourer armour armor shields' },
  bowyer: { label: 'Bowyer', words: 'bowyer bows arrows fletcher' },
  tailor: { label: 'Tailor', words: 'tailor cloth clothes cloaks packs backpack' },
  apothecary: { label: 'Apothecary', words: 'apothecary potions alchemist herbs' },
  provisioner: { label: 'Provisioner', words: 'provisioner food rations supplies' },
  merchant: { label: 'General goods', words: 'merchant general goods shop store' },
  trader: { label: 'Market', words: 'market trader stall' },
  jeweller: { label: 'Jeweller', words: 'jeweller rings amulets jewellery jewelry' },
  innkeeper: { label: 'Inn', words: 'inn innkeeper tavern bed home rest' },
  healer: { label: 'Healer', words: 'healer temple cure' },
  barber: { label: 'Barber', words: 'barber hair beard appearance' },
  unbinder: { label: 'Unbinder', words: 'unbinder reset respec talents perks' },
  broker: { label: 'Broker', words: 'broker counting house trade' },
  elder: { label: 'Town hall', words: 'elder reeve hall town quests news' },
  carter: { label: 'Ox cart', words: 'cart carter ox travel ride' },
};
/** The filter list of the map, in the order players ask for them. */
export const SERVICE_FILTERS = ['stablehand', 'angler', 'trainer', 'prospector', 'logger', 'forager', 'skinner', 'carter', 'innkeeper', 'smith', 'armourer', 'bowyer', 'tailor', 'apothecary', 'provisioner', 'merchant', 'trader', 'jeweller', 'healer', 'barber', 'unbinder', 'broker', 'elder'];
const titleOf = s => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
/** Shop kinds (shops.json) -> the role that keeps them. */
const SHOP_ROLE = { general: 'merchant', weaponsmith: 'smith', stable: 'stablehand', inn: 'innkeeper', market: 'trader', cart: 'carter', carts: 'carter', hall: 'elder', forge: 'smith', shop: 'merchant', temple: 'healer' };
export const serviceLabel = role => SERVICES[role]?.label || titleOf(role);
const zoneOrigin = key => { const m = /^z(\d+)_(\d+)$/.exec(String(key)); return m ? { x: +m[1] * 2048, z: +m[2] * 2048 } : null; };
/**
 * Every place in the playable province where somebody serves you, in WORLD metres:
 *   offices  = data/provinces/offices.json (each town's working buildings: zone metres + the zone key)
 *   npcs     = the map model's placed NPCs (anglers, trainers out at their set pieces, carters …: world metres already)
 *   towns    = [{ name, x, z, r }] in world metres (to say which town a lone NPC belongs to)
 * -> [{ id, role, label, name, town, x, z, keeper }] — `label` is what hangs over the door when the data names it.
 */
export function buildServices({ offices = null, npcs = [], towns = [], townServices = null, professions = null } = {}) {
  const out = [], seen = new Set();
  const townList = towns.slice();
  for (const [key, t] of Object.entries(offices?.towns || {})) {
    const o = zoneOrigin(t.zone); if (!o) continue;
    if (!townList.some(x => x.name === t.name)) townList.push({ name: t.name, x: t.x + o.x, z: t.z + o.z, r: t.r || 90 });
    for (const [i, f] of (t.offices || []).entries()) {
      if (!f.role) continue;
      const at = f.door || f;
      out.push({ id: `of:${key}:${i}`, role: f.role, label: f.label || serviceLabel(f.role), name: f.name || '', town: t.name, x: at.x + o.x, z: at.z + o.z, keeper: f.title || serviceLabel(f.role) });
      if (f.npc) seen.add(f.npc);
    }
  }
  for (const n of npcs) {
    if (!n || !n.role || !Number.isFinite(n.x) || seen.has(n.id)) continue;
    if (!SERVICES[n.role]) continue;                               // a shepherd or a hermit is not a service
    if (out.some(s => s.role === n.role && Math.hypot(s.x - n.x, s.z - n.z) < 12)) continue;
    let town = n.town || n.at || '', best = Infinity;
    if (!town) for (const t of townList) { const d = Math.hypot(t.x - n.x, t.z - n.z); if (d < (t.r || 90) + 220 && d < best) { best = d; town = t.name; } }
    out.push({ id: 'npc:' + (n.id ?? `${n.role}:${Math.round(n.x)}:${Math.round(n.z)}`), role: n.role, label: serviceLabel(n.role), name: n.name || '', town, x: n.x, z: n.z, keeper: serviceLabel(n.role) });
  }
  // E's data/provinces/town-services.json: what EVERY settlement has (roles and shop kinds), also the ones with no door on record —
  // those are pinned at the settlement itself, so a town you have never walked into can still be ringed
  for (const [name, list] of Object.entries(townServices?.towns || {})) {
    const t = townList.find(x => x.name === name); if (!t) continue;
    for (const raw of Array.isArray(list) ? list : []) {
      const role = SHOP_ROLE[raw] || raw;
      if (!SERVICES[role] || out.some(s => s.town === name && s.role === role)) continue;
      out.push({ id: `ts:${name}:${role}`, role, label: serviceLabel(role), name: '', town: name, x: t.x, z: t.z, keeper: serviceLabel(role), approx: true });
    }
  }
  for (const s of out) s.professions = (professions?.roles?.[s.role]?.trains || []).map(id => professions.professions?.find(p => p.id === id)?.name || titleOf(id));
  return out;
}
/** The roles that actually exist in the data, in filter order (unknown ones at the end): what the filter offers. */
export function serviceRoles(list) {
  const have = new Set(list.map(s => s.role));
  return [...SERVICE_FILTERS.filter(r => have.has(r)), ...[...have].filter(r => !SERVICE_FILTERS.includes(r)).sort()];
}
/** Does one service answer a search? Every word typed must be found in its label, its keeper's name, its town or its search words. */
export function serviceMatches(s, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return true;
  const teaching = s.professions?.length ? `profession trainer teacher training ${s.professions.join(' ')}` : '';
  const hay = `${s.label} ${s.keeper} ${s.name} ${s.town} ${s.role} ${SERVICES[s.role]?.words || ''} ${teaching}`.toLowerCase();
  return q.split(/\s+/).every(w => hay.includes(w));
}
/** The services a filter + a search leave ({ role: '' } = any role). Nothing asked for = nothing highlighted. */
export function findServices(list, { role = '', query = '' } = {}) {
  if (!role && !String(query || '').trim()) return [];
  return list.filter(s => (!role || s.role === role) && serviceMatches(s, query));
}
/** Matches grouped by town, nearest first: [{ town, x, z, n, labels, dist, first }]. A lone service outside any town is its own row. */
export function townsWith(matches, me = null) {
  const by = new Map();
  for (const s of matches) {
    const k = s.town || s.id;
    const t = by.get(k) || by.set(k, { town: s.town || `${s.label}${s.name ? ' — ' + s.name : ''}`, lone: !s.town, sx: 0, sz: 0, n: 0, labels: [], list: [] }).get(k);
    t.sx += s.x; t.sz += s.z; t.n++; t.list.push(s);
    if (!t.labels.includes(s.label)) t.labels.push(s.label);
  }
  return [...by.values()].map(t => ({ town: t.town, lone: t.lone, x: t.sx / t.n, z: t.sz / t.n, n: t.n, labels: t.labels, list: t.list, dist: me ? Math.hypot(t.sx / t.n - me.x, t.sz / t.n - me.z) : null }))
    .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0) || a.town.localeCompare(b.town));
}
/** Below this zoom (px per metre) a single door cannot be told from the next: the map rings the TOWNS instead. */
export const SERVICE_PIN_SCALE = 0.22;

// ----------------------------------------------------------------------------------------------- W17: quest zones
/** The quest area (a marker with `area` and `r`) under a world point: the smallest one wins, so a ring inside a ring is reachable. */
export function areaAt(markers, x, z) {
  let best = null;
  for (const m of markers || []) {
    if (!m || m.hidden || !(m.kind === 'quest' || m.kind === 'questdone') || !m.area || !(m.r > 0)) continue;
    if (Math.hypot(m.x - x, m.z - z) > m.r) continue;
    if (!best || m.r < best.r) best = m;
  }
  return best;
}
/** What a quest zone's card says: the quest, what to do there (with the count), and what the ring means. */
export function areaCard(m, quest = null) {
  const title = quest?.name || m.name || 'Quest';
  const goal = quest?.goal || (quest ? '' : m.sub) || '';
  const lines = [];
  if (goal) lines.push({ label: 'Objective', text: goal });
  if (quest && m.sub && m.sub !== goal) lines.push({ label: 'Here', text: m.sub });
  else if (!quest && m.name && m.name !== title) lines.push({ label: 'Here', text: m.name });
  return { title, lines, foot: m.tracked ? 'Tracked — the arrow on your minimap points here.' : m.act === 'track' ? 'Click to track this quest.' : 'What you are after is somewhere inside this ring.' };
}

// ------------------------------------------------------------------------------------------ W12: ! and ? over NPCs
/** A's per-player marks -> what is drawn. `offer` gold "!", `turnin` gold "?", `later` grey "!", `active` grey "?". */
export const QUEST_MARKS = {
  offer: { glyph: '!', grey: false, sub: 'Has a quest for you', priority: 5 },
  turnin: { glyph: '?', grey: false, sub: 'Ready to hand in — talk to them', priority: 6 },
  ready: { glyph: '?', grey: false, sub: 'Ready to hand in — talk to them', priority: 6 },
  later: { glyph: '!', grey: true, sub: 'Has a quest you cannot take yet', priority: 2 },
  active: { glyph: '?', grey: true, sub: 'Waiting on a quest you have not finished', priority: 2 },
};
/** Map / minimap markers for the NPCs that carry a mark. `bodies` = [{ id, name, x, z }], `marks` = Map | object id -> mark. */
export function questMarkMarkers(bodies, marks, others = []) {
  const get = id => (marks instanceof Map ? marks.get(id) ?? marks.get(String(id)) ?? marks.get(+id) : marks?.[id]);
  const out = [];
  for (const b of bodies || []) {
    const mk = get(b.id), d = QUEST_MARKS[mk];          // (`job` — only repeatable board work — is deliberately not drawn)
    if (!d || !Number.isFinite(b.x)) continue;
    // the journal's own "hand it in here" pin already stands on this spot: one mark per thing
    if (others.some(o => (o.kind === 'questdone' || (o.kind === 'quest' && !o.area)) && Math.hypot(o.x - b.x, o.z - b.z) < 7)) continue;
    out.push({ id: 'qm:' + b.id, kind: 'npcmark', mark: mk, glyph: d.glyph, grey: d.grey, x: b.x, z: b.z, name: b.name || 'Someone', sub: d.sub, priority: d.priority, size: d.grey ? 5.5 : 7 });
  }
  return out;
}

// ------------------------------------------------------------------------------------------- W27: a title, or none
/** Roles whose keeper serves you (a title helps you find them) — only used when the server sent neither a title nor `filler`. */
const TITLE_FALLBACK = { smith: 'Smith', merchant: 'Merchant', elder: 'Elder', innkeeper: 'Innkeeper', healer: 'Healer', unbinder: 'Unbinder — resets talents and perks', broker: 'Broker', barber: 'Barber',
  stablehand: 'Stable master', trader: 'Trader', armourer: 'Armourer', apothecary: 'Apothecary', bowyer: 'Bowyer', tailor: 'Tailor', provisioner: 'Provisioner', jeweller: 'Jeweller', trainer: 'Trainer', angler: 'Angler', carter: 'Carter — rides to other towns' };
/**
 * The line over an NPC's name. The server sends `title` only for somebody placed for you to find (a service, a quest,
 * a job) and `filler: 1` for everyone else; filler folk — a woodcutter, a guard, a villager — get NO title line.
 */
export function npcTitle(info, name = '') {
  const i = info || {};
  if (i.filler || i.guard || i.folk || i.data?.folk) return '';
  let t = i.title || i.data?.npc?.title || i.office?.title || '';
  if (!t && !('filler' in i) && (i.office || i.shop)) t = TITLE_FALLBACK[i.role] || '';       // an older server: only somebody who keeps a counter
  if (!t || t === name || /^(local|townsfolk|villager)$/i.test(t)) return '';
  return String(t);
}

/**
 * What /meter (or any on/off switch for the meter) should do, from the TWO facts the window has: is it counting (`on`),
 * and is its window showing (`open`). Wrap-up, report #67: the window's X hides it and leaves it counting, so a toggle
 * that looked only at `on` switched the meter OFF on the first /meter and back on with the second.
 *   counting, hidden  -> 'show'  (nothing is switched; the window comes back)
 *   counting, showing -> 'off'
 *   not counting      -> 'on'
 */
export const meterToggle = ({ on = false, open = false } = {}) => (!on ? 'on' : open ? 'off' : 'show');

// ------------------------------------------------------------------------------------------- W21: the damage meter
export const HIT_FLAGS = { heal: 1, crit: 2, miss: 4, kill: 8, blocked: 16, dot: 32, dodged: 64 };
const BASIC_SKILLS = new Set(['basic', 'melee', 'arrow', 'bolt', 'attack', '']);
const DOT_NAMES = { fire: 'Burning', poison: 'Poison', bleed: 'Bleeding', shadow: 'Withering', ice: 'Frostbite', lightning: 'Shock', holy: 'Searing light', arcane: 'Arcane burn' };
/**
 * One row of A's `hits {l:[[src, tgt, n, flags, sk, el, over, abs], …]}` -> a record for meters/js/meter.js.
 * `nameOf(id)` -> a name or '', `skillName(id)` -> a skill's name or '' (the id is tidied when unknown), `t` = seconds.
 */
export function meterRecord(row, { t = 0, nameOf = () => '', skillName = () => '' } = {}) {
  if (!Array.isArray(row) || row.length < 3) return null;
  const [src, tgt, n, flags = 0, sk = 'basic', el = null, over = 0, abs = 0] = row;
  const heal = !!(flags & HIT_FLAGS.heal), miss = !!(flags & HIT_FLAGS.miss), dot = !!(flags & HIT_FLAGS.dot);
  const basic = BASIC_SKILLS.has(String(sk ?? ''));
  // A sends `sk: 'dot'` for a tick with no skill of its own: name it by what it is made of
  const tick = String(sk) === 'dot';
  const viaName = tick ? (heal ? 'Healing over time' : DOT_NAMES[el] || 'Damage over time') : basic ? (heal ? 'Healing' : 'Weapon attack') : (skillName(sk) || titleOf(sk)) + (dot ? ' (over time)' : '');
  const rec = {
    t, source: src == null ? 'world' : String(src), sourceName: (src == null ? '' : nameOf(src)) || (src == null ? 'The world' : `#${src}`),
    target: String(tgt), targetName: nameOf(tgt) || `#${tgt}`,
    kind: miss ? 'miss' : heal ? 'heal' : 'damage', amount: miss ? 0 : Math.max(0, Math.round(+n || 0)),
    crit: !!(flags & HIT_FLAGS.crit), dtype: heal ? 'holy' : String(el || 'physical'), via: tick ? `dot:${el || 'physical'}` : basic ? 'attack' : `${dot ? 'dot' : 'skill'}:${sk}`, viaName,
    killingBlow: !!(flags & HIT_FLAGS.kill), tags: [],
  };
  if (heal) rec.overheal = Math.max(0, Math.round(+over || 0)); else rec.overkill = Math.max(0, Math.round(+over || 0));
  if (abs > 0) rec.absorbed = Math.round(abs);
  if (flags & HIT_FLAGS.blocked && !miss) rec.tags.push('blocked');
  if (miss) rec.tags.push(flags & HIT_FLAGS.blocked ? 'blocked' : flags & HIT_FLAGS.dodged ? 'dodged' : 'missed');
  return rec;
}
/** The older feed (the `ev` stream every client sees): `hit {s, d, n, crit, el, kind, skill}` / `miss {s, d, why}` -> a `hits` row. */
export function hitRowFromEvent(ev) {
  if (!ev) return null;
  const type = ev.type || ev.t;
  if (type === 'hit') {
    if (ev.kind === 'absorb') return null;
    return [ev.s ?? null, ev.d, ev.n || 0, (ev.kind === 'heal' ? HIT_FLAGS.heal : 0) | (ev.crit ? HIT_FLAGS.crit : 0), ev.skill || 'basic', ev.el || null, ev.over || 0, ev.abs || 0];
  }
  if (type === 'miss') return [ev.s ?? null, ev.d, 0, HIT_FLAGS.miss | (ev.why === 'block' ? HIT_FLAGS.blocked : 0), ev.skill || 'basic', null, 0, 0];
  return null;
}
/** Seconds of quiet after which the next hit starts a new fight. */
export const FIGHT_GAP_S = 8;
/**
 * Cuts a stream of records into fights. feed(rec, { hostileName }) -> 'start' | 'same'; the label of a fight is the first enemy
 * hit in it ("Road Brigand"), with "+2" as more join. Pure: the caller owns the Meter.
 */
export function createFightClock(gap = FIGHT_GAP_S) {
  let last = -Infinity, foes = [], n = 0;
  return {
    feed(t, foe = '') {
      const fresh = t - last > gap;
      if (fresh) { foes = []; n++; }
      last = t;
      if (foe && !foes.includes(foe)) foes.push(foe);
      return fresh ? 'start' : 'same';
    },
    label() { return foes.length ? foes[0] + (foes.length > 1 ? ` +${foes.length - 1}` : '') : `Fight ${n}`; },
    get count() { return n; }, get last() { return last; },
    idle(t) { return t - last > gap; },
  };
}
/** Whose numbers the meter keeps: you, your party, and the pets of either. `actors` = [{ id, owner, pet }] */
export function meterOurs({ selfId, partyIds = [], actors = [] } = {}) {
  const ours = new Set([selfId, ...partyIds].filter(v => v != null).map(String));
  for (const a of actors) if (a && a.owner != null && ours.has(String(a.owner))) ours.add(String(a.id));
  return ours;
}

// ---------------------------------------------------------------------------------------------- W5: the ox-cart ride
/** "about 40 seconds" / "about 2 minutes". */
export function rideText(s) {
  if (!Number.isFinite(s) || s <= 0) return '';
  if (s < 55) return `about ${Math.max(5, Math.round(s / 5) * 5)} seconds`;
  const m = Math.round(s / 60);
  return `about ${m} minute${m === 1 ? '' : 's'}`;
}
const CART_WHY = { busy: 'You are already on a cart.', interrupted: 'The ride was called off. Your fare was given back.', gold: 'You cannot afford this ride.', far: 'Walk up to the cart first.', fight: 'Not while you are fighting.', dead: 'Not while you are down.', same: 'You are already there.', stop: 'The cart does not go there.', level: 'That road is too dangerous for you yet.' };
/**
 * The rows of the cart window from A's `cartList {from, stops:[{id, name, fare, m, s, level?, locked?, why?, msg?}], gold, tokens}`:
 * nearest first; each row says the fare, the road distance, the ride time, and — when you may not go — why, in words.
 */
export function cartRows(m = {}) {
  const gold = Number.isFinite(m.gold) ? m.gold : null, tokens = Math.max(0, m.tokens | 0);
  return (m.stops || []).filter(s => s && s.id != null).map(s => {
    const fare = Math.max(0, Math.round(+s.fare || 0));
    const poor = gold != null && fare > gold && !tokens;
    const locked = !!s.locked || poor;
    const why = !locked ? '' : s.msg || CART_WHY[s.why] || (poor ? `You need ${fare - gold} more gold.` : 'The cart cannot take you there right now.');
    return { id: s.id, name: s.name || titleOf(s.id), fare, free: fare === 0, token: tokens > 0 && fare > 0, metres: Number.isFinite(s.m) ? s.m : null, secs: Number.isFinite(s.s) ? s.s : null, level: s.level ?? null, locked, why };
  }).sort((a, b) => (a.metres ?? 1e9) - (b.metres ?? 1e9) || a.name.localeCompare(b.name));
}
export const cartRefusal = r => r?.msg || CART_WHY[r?.why] || 'The cart cannot take you there right now.';

// --------------------------------------------------------------------------------------------------- W19: backpacks
/** Extra bag squares an item gives while worn (C: `bagSlots` on the item). */
export const bagSlotsOf = item => Math.max(0, Math.round(+(item?.bagSlots ?? item?.bag ?? 0) || 0));
/** The card's line: C's `bagText` when it is there, else "+N bag slots". */
export function bagSlotsText(item) {
  if (item?.bagText) return String(item.bagText);
  const n = bagSlotsOf(item);
  return n ? `+${n} bag slot${n === 1 ? '' : 's'}` : '';
}
/**
 * Why a pack cannot come off right now ('' = it can). Taking it off puts the pack itself in the bag AND removes its
 * squares, so the bag must have that much room. `next` = the item going on in its place (a smaller pack, a cloak).
 */
export function packRefusal(item, { bagCount = 0, bagMax = 0, next = null } = {}) {
  const lose = bagSlotsOf(item) - bagSlotsOf(next);
  if (lose <= 0) return '';
  const after = bagMax - lose;                    // the bag's size once it is off
  const need = bagCount + (next ? 0 : 1) - after; // a swap takes the new piece out of the bag as the old one goes in
  if (need <= 0) return '';
  return `Empty ${need} more bag slot${need === 1 ? '' : 's'} first — the pack's extra room is holding things.`;
}
