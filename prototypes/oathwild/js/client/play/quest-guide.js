// Where to go next (docs/BRAINSTORM-2026-11-27-regions.md §4): the ONE place that works out, for the quests you follow,
// which region their next goal is in, the spot to head for in the region you stand in (the goal itself, or the travel
// point / shrine that leads there), the words for it ("→ Ashfield via The road to Ashfield"), and how to reach any
// region from here (the Places list). The HUD tracker, the minimap, the floating world marker and the map all read it
// (lessons rule 67: one function lists the objectives, every view reads it).
//
//   regionKey(app, id)          any region id or alias ('brightwater_vale', 'ashfield_catacombs') → an index key or null
//   hereRegion(app)             the region drawn now (index key)
//   regionLabel(app, id)        its name
//   questRegion(app, q)         the region of a quest's NEXT goal (step `region`, else the quest's, else home)
//   guideFor(app, q, me)        { at, label, region, far, via, dist } — where to walk for that quest in THIS region
//   followed(app, log)          { list (≤ 3 quests the tracker shows), marked (the one with the gold diamond) }
//   markQuest(app, id)          make a quest the marked one (and tracked); remembered on this device
//   trackQuest(app, id, on)     add / drop a tracked quest (3 at most)
//   routeTo(app, to)            the hops from here to region `to`: [{ from, to, label, at, requires }]
//   wayWords(app, to)           "Take The road to Ashfield, on the east side of Brightwater Vale" (null if no road known)
//   tone(lo, hi, my)            'low' | 'fair' | 'hard' — a level (or range) against yours
//   compass(dx, dz)             'north-east' … (north = −z)
//   loadRoutes(app)             reads each region's data file once for its travel points and entrances (async, cached)
import { readJson } from '../../world/boot.js';

export const MAX_TRACKED = 3;
const slug = s => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function regionKey(app, id) {
  const R = app.regionIndex?.regions || {};
  if (!id) return null;
  if (R[id]) return id;
  const s = slug(id);
  for (const [k, r] of Object.entries(R)) if (slug(r.name) === s || slug(k) === s) return k;
  // 'ashfield_catacombs' → 'catacombs': a data file may prefix a region id with its parent's
  for (const k of Object.keys(R)) if (s.endsWith('_' + k)) return k;
  return null;
}
export const homeKey = app => app.regionIndex?.home || 'vale';
export const hereRegion = app => regionKey(app, app.W?.region) || homeKey(app);
export const regionLabel = (app, id) => app.regionIndex?.regions?.[regionKey(app, id) || id]?.name || 'Brightwater Vale';
const regionByName = (app, name) => { if (!name) return null; for (const [k, r] of Object.entries(app.regionIndex?.regions || {})) if (r.name === name) return k; return regionKey(app, name); };

/** The region a quest's next goal is in. */
export function questRegion(app, q) {
  const Q = app.W?.book?.quests?.[q.id];
  const st = app.ws?.quests?.[q.id];
  const step = Q && st && !st.done ? Q.steps?.[st.step] : null;
  if (q.status === 'ready' || (st && !step)) {
    const n = Q?.turnIn && app.W?.book?.npcs?.[Q.turnIn];
    return regionKey(app, n?.region) || regionKey(app, Q?.region) || homeKey(app);
  }
  return regionKey(app, step?.region) || regionKey(app, Q?.region ?? q.region) || homeKey(app);
}

// ---------------------------------------------------------------- the roads between regions
let routeCache = null, routeLoading = null;
/** Travel points and entrances from every region's data file (read once; the index's own points are always there). */
export function loadRoutes(app) {
  if (routeCache || routeLoading || !app.regionIndex) return routeLoading;
  const rows = Object.entries(app.regionIndex.regions || {}).filter(([, r]) => r.data);
  routeLoading = Promise.all(rows.map(async ([k, r]) => {
    try { return [k, await readJson(new URL(`../../../${r.data}`, import.meta.url))]; } catch { return [k, null]; }
  })).then(list => { routeCache = Object.fromEntries(list); routeLoading = null; app.emit?.('routes'); return routeCache; });
  return routeLoading;
}

/** Every known road between two regions: [{ from, to, label, at, id, requires, main }]. */
export function edges(app) {
  const out = [];
  const add = e => { if (e.from && e.to && e.from !== e.to && !out.some(o => o.from === e.from && o.to === e.to && o.label === e.label)) out.push(e); };
  const here = hereRegion(app);
  // the points the server sent for this region carry exact spots
  for (const p of app.play?.S?.points || []) add({ from: here, to: regionKey(app, p.toRegion) || regionByName(app, p.toName), label: p.label, at: p.at, id: p.id, main: true });
  for (const p of app.regionIndex?.points || []) add({ from: regionKey(app, p.region), to: regionKey(app, p.toRegion), label: p.label, at: p.at, id: p.id, main: true });
  for (const [k, d] of Object.entries(routeCache || {})) {
    if (!d) continue;
    for (const t of d.travel || []) add({ from: k, to: regionKey(app, t.to?.region), label: cap(t.name), at: t.at, id: t.id, main: true });
    for (const t of d.entrances || []) add({ from: k, to: regionKey(app, t.to?.region), label: cap(t.name), at: t.at, id: t.id, main: !!t.main && !t.requires, requires: t.requires || null });
  }
  return out;
}
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Fewest hops from here to `to` (open roads first: an entrance that needs a story flag is used only if nothing else). */
export function routeTo(app, to, from = hereRegion(app)) {
  if (!to || to === from) return [];
  const E = edges(app);
  for (const pass of [E.filter(e => !e.requires), E]) {
    const prev = new Map([[from, null]]), queue = [from];
    while (queue.length) {
      const r = queue.shift();
      if (r === to) break;
      for (const e of pass.filter(x => x.from === r).sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0))) if (!prev.has(e.to)) { prev.set(e.to, e); queue.push(e.to); }
    }
    if (prev.has(to)) { const path = []; for (let e = prev.get(to); e; e = prev.get(e.from)) path.unshift(e); return path; }
  }
  return null;
}

/** The other ways in (a region with several entrances: "also the Collapsed Grave, opens later"). */
export function otherWaysIn(app, to, used) {
  return edges(app).filter(e => e.to === to && e.label !== used?.label && e.from === used?.from);
}

export function compass(dx, dz) {
  if (Math.hypot(dx, dz) < 1) return 'here';
  const a = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(a / 45) % 8];
}
/** The middle of a region's map (the drawn one has a ground grid; others are laid out around 0, 0). */
function middleOf(app, rid) {
  const B = rid === hereRegion(app) ? app.W?.terrain?.biomeGrid : app.places?.[rid]?.W?.terrain?.biomeGrid;
  return B ? [B.minX + B.nx * B.cell / 2, B.minZ + B.nz * B.cell / 2] : [0, 0];
}

/** How to walk to region `to` from here, in a sentence. */
export function wayWords(app, to) {
  const path = routeTo(app, to);
  if (!path || !path.length) return null;
  const hop = e => {
    const [mx, mz] = middleOf(app, e.from);
    const side = e.at ? compass(e.at[0] - mx, e.at[1] - mz) : '';
    return `${e.label}${side && side !== 'here' ? `, on the ${side} side of ${regionLabel(app, e.from)}` : ` in ${regionLabel(app, e.from)}`}`;
  };
  let s = `take ${hop(path[0])}`;
  for (const e of path.slice(1)) s += `, then ${e.label} in ${regionLabel(app, e.from)}`;
  const more = otherWaysIn(app, to, path[path.length - 1]);
  if (more.length) s += ` (also ${more.map(e => `${e.label}${e.requires ? ', opens later' : ''}`).join('; ')})`;
  return s;
}

// ---------------------------------------------------------------- waypoints (shrines)
/** Found waypoints in region `rid` (this region: the placements; others: the world state's far list). */
export function waypointsIn(app, rid) {
  const found = new Set(app.ws?.shrines || []);
  if (rid === hereRegion(app)) return (app.W?.data?.placements?.shrines || []).filter(s => found.has(s.id)).map(s => ({ id: s.id, name: s.name, at: s.at }));
  const name = regionLabel(app, rid);
  return (app.ws?.far || []).filter(s => (s.region ? regionKey(app, s.region) === rid : s.regionName === name)).map(s => ({ id: s.id, name: s.name }));
}
/** The found shrine you stand at (12 m), or null. */
export function shrineHere(app, me) {
  if (!me) return null;
  const found = new Set(app.ws?.shrines || []);
  return (app.W?.data?.placements?.shrines || []).find(s => found.has(s.id) && Math.hypot(s.at[0] - me.x, s.at[1] - me.z) < 12) || null;
}

// ---------------------------------------------------------------- one quest's guide
/** Where to walk for quest `q` in the region drawn now. `me` = { x, z } or null. */
export function guideFor(app, q, me) {
  const region = questRegion(app, q), here = hereRegion(app);
  const goal = q.status === 'ready' || !q.marker
    ? (q.turnIn ? { at: q.turnIn.at, label: `Hand in to ${q.turnIn.name}`, radius: 3 } : null)
    : { at: q.marker.at, label: q.marker.label, radius: q.marker.radius };
  const d = at => (me && at ? Math.hypot(at[0] - me.x, at[1] - me.z) : null);
  if (region === here) return goal ? { ...goal, region, far: false, via: '', dist: d(goal.at) } : null;
  // the goal is in another region: head for the road there, or a shrine if that region has a found waypoint
  const name = regionLabel(app, region);
  const path = routeTo(app, region);
  const hop = path?.[0] || null;
  const pt = hop && ((app.play?.S?.points || []).find(p => p.id === hop.id) || hop);
  const cand = [];
  if (pt?.at) cand.push({ at: pt.at, label: pt.label || hop.label, radius: pt.radius || 7, via: `→ ${name} via ${pt.label || hop.label}` });
  if (waypointsIn(app, region).length) {
    for (const s of waypointsIn(app, here)) cand.push({ at: s.at, label: s.name, radius: 4, via: `→ ${name}: travel from ${s.name}` });
  }
  if (!cand.length) return { at: null, label: name, region, far: true, via: `→ ${name}`, dist: null };
  cand.sort((a, b) => (d(a.at) ?? 0) - (d(b.at) ?? 0));
  return { ...cand[0], region, far: true, dist: d(cand[0].at) };
}

// ---------------------------------------------------------------- which quests the tracker follows
const settingsOf = app => app.settings || (app.settings = {});
function trackedIds(app) { const S = settingsOf(app); if (!Array.isArray(S.tracked)) S.tracked = []; return S.tracked; }

/** The quests the tracker shows (≤ 3) and the marked one. `log` = questLog(...) for me. */
export function followed(app, log) {
  const open = [...log.ready, ...log.active];
  const T = trackedIds(app);
  let list = T.length ? T.map(id => open.find(q => q.id === id)).filter(Boolean) : [];
  if (!list.length) list = open.slice(0, MAX_TRACKED);   // nothing chosen (or all done): the main quest and the next ones
  list = list.slice(0, MAX_TRACKED);
  const marked = list.find(q => q.id === settingsOf(app).marked) || list[0] || null;
  return { list, marked };
}

/** Track (or stop) a quest; 3 at most — a fourth drops the oldest that is not the marked one. */
export function trackQuest(app, id, on = true, log = null) {
  const T = trackedIds(app);
  if (!T.length && log && on) for (const q of followed(app, log).list) if (q.id !== id) T.push(q.id);   // keep what the tracker showed
  const i = T.indexOf(id);
  if (!on) { if (i >= 0) T.splice(i, 1); if (settingsOf(app).marked === id) settingsOf(app).marked = T[0] || null; }
  else if (i < 0) {
    T.unshift(id);
    while (T.length > MAX_TRACKED) { const j = T.map((x, n) => [x, n]).reverse().find(([x]) => x !== settingsOf(app).marked && x !== id)?.[1] ?? T.length - 1; T.splice(j, 1); }
  }
  app.saveSettings?.();
}
/** Make a quest the marked one (the gold diamond); it joins the tracked quests. Saved on this device (app.saveSettings wraps localStorage in try/catch). */
export function markQuest(app, id, log = null) {
  settingsOf(app).marked = id;
  if (!trackedIds(app).includes(id)) trackQuest(app, id, true, log); else app.saveSettings?.();
}

/** A level or a range against yours: grey when far below, red-orange when above. */
export function tone(lo, hi = lo, my = 1) {
  if (hi < my - 2) return 'low';
  if (lo > my + 1) return 'hard';
  return 'fair';
}
