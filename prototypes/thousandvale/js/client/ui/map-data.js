// The map's data (play-test P3/P13/P27), pure: no DOM, no fetch, no three.js — node tests drive it.
//
// World metres everywhere: +x east, +z SOUTH, so a north-up map puts screen y = (z - top) * scale. A zone zXX_YY is
// the 2,048 m square at x = XX·2048, z = YY·2048 (protocol §15.1).
//
//   const model = buildMapModel({ world, provinceMap, sheets, zoneJsons, placements, quests, rares });
//   model.zones.get('z12_02')  -> { key, name, band:[1,4], bounds, playable, town, dungeon, archetype }
//   model.pois                 -> towns, hamlets, dungeon doors, caves, forts, farms, event arenas, fords, landmarks
//   locateQuest(questView, model, me)  -> { x, z, r, name, zone, exact } where the CURRENT step happens (or null)
//   makeView({ cx, cz, scale, w, h, rot })  -> toScreen / toWorld (rot = radians, for a rotating minimap)
//   createFog({ w, h, cell })  -> discovered cells (a bitset you can save as base64)
//
// The loader that fetches those JSON files is map-load.js (browser); this file only shapes them.

export const ZONE_M = 2048;
export const zoneKey = (zx, zy) => `z${String(zx).padStart(2, '0')}_${String(zy).padStart(2, '0')}`;
export function zoneKeyAt(x, z) { return zoneKey(Math.floor(x / ZONE_M), Math.floor(z / ZONE_M)); }
export function zoneBoundsOf(key) {
  const m = /^z(\d+)_(\d+)$/.exec(String(key));
  if (!m) return null;
  const zx = +m[1], zy = +m[2];
  return { minX: zx * ZONE_M, minZ: zy * ZONE_M, maxX: zx * ZONE_M + ZONE_M, maxZ: zy * ZONE_M + ZONE_M, zx, zy };
}

// ---- words -------------------------------------------------------------------------------------------------
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const DIRS_SHORT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Compass bearing in radians from (dx, dz): 0 = north (−z), clockwise. */
export function bearing(dx, dz) { const a = Math.atan2(dx, -dz); return a < 0 ? a + Math.PI * 2 : a; }
export function compass(dx, dz, short = false) { const i = Math.round(bearing(dx, dz) / (Math.PI / 4)) % 8; return (short ? DIRS_SHORT : DIRS)[i]; }
/** "40 m", "850 m", "1.2 km", "12 km". */
export function distText(m) {
  m = Math.max(0, m);
  if (m < 995) return `${Math.round(m / (m < 100 ? 5 : 10)) * (m < 100 ? 5 : 10)} m`;
  return m < 9950 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
}
/** "340 m north-east" (or "here" when inside `r`). */
export function whereText(from, to, r = 0) {
  if (!from || !to) return '';
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  if (d <= Math.max(12, r)) return 'here';
  return `${distText(d)} ${compass(dx, dz)}`;
}
export const bandText = b => (Array.isArray(b) && b.length ? (b[0] === b[1] ? `level ${b[0]}` : `levels ${b[0]}–${b[1]}`) : '');
/** How a zone's band compares with your level: 'easy' (grey), 'fair' (green), 'hard' (orange), 'deadly' (red). */
export function bandTone(band, level) {
  if (!Array.isArray(band)) return 'fair';
  if (level > band[1] + 3) return 'easy';
  if (level >= band[0] - 1) return 'fair';
  if (level >= band[0] - 3) return 'hard';
  return 'deadly';
}
export const titleCase = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ---- polylines ---------------------------------------------------------------------------------------------
/** Douglas–Peucker over [[x, z, ...]] (keeps x, z only). tol in metres. */
export function simplify(pts, tol = 8) {
  if (!pts || pts.length < 3) return (pts || []).map(p => [p[0], p[1]]);
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]], t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], az = pts[a][1], bx = pts[b][0], bz = pts[b][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] - ax, pz = pts[i][1] - az;
      const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / L2));
      const ex = px - t * dx, ez = pz - t * dz, d2 = ex * ex + ez * ez;
      if (d2 > best) { best = d2; bi = i; }
    }
    if (best > t2) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push([pts[i][0], pts[i][1]]);
  return out;
}
const bboxOf = pts => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of pts) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; } return [a, b, c, d]; };

// ---- the model ---------------------------------------------------------------------------------------------
const POI_KINDS = {
  city: { label: 'City', rank: 1 }, capital: { label: 'Capital', rank: 1 }, town: { label: 'Town', rank: 2 }, village: { label: 'Village', rank: 3 }, hamlet: { label: 'Hamlet', rank: 4 },
  dungeon: { label: 'Dungeon', rank: 2 }, cave: { label: 'Cave', rank: 3 }, fort: { label: 'Fort', rank: 3 }, farm: { label: 'Farm', rank: 5 },
  event: { label: 'Event arena', rank: 3 }, ford: { label: 'Ford', rank: 5 }, bridge: { label: 'Bridge', rank: 5 }, landmark: { label: 'Landmark', rank: 4 },
  waystone: { label: 'Waystone', rank: 2 }, vignette: { label: 'Point of interest', rank: 5 },
};
export const poiLabel = k => POI_KINDS[k]?.label || titleCase(k);

/**
 * raw = { world, provinceMap, sheets: {provId: sheet}, zoneJsons: {worldKey: zone.json}, placements: {worldKey: vignette
 * placements file}, quests: {sheetZoneId: quest file}, rares, events (data/quests/events.json) }. Any piece may be missing (the map then shows less).
 */
export function buildMapModel(raw = {}) {
  const world = raw.world || {}, pm = raw.provinceMap?.provinces || {};
  const zm = world.grid?.zoneMetres || ZONE_M;
  const cols = world.grid?.cols || Math.ceil((world.width || 0) * (world.macroMetres || 128) / zm) || 18;
  const rows = world.grid?.rows || Math.ceil((world.height || 0) * (world.macroMetres || 128) / zm) || 14;
  const model = {
    worldW: cols * zm, worldH: rows * zm, zoneM: zm, cols, rows,
    provinces: [], zones: new Map(), settlements: [], rivers: [], roads: [], pois: [],
    npcs: new Map(), vigs: new Map(), camps: [], rares: new Map(), sites: new Map(), quests: new Map(), sheetOf: new Map(), worldOfSheet: new Map(),
    playable: null,
  };
  // which world zones each province sheet uses
  const sheetZone = new Map();          // world key -> { prov, id, sheet zone }
  for (const [prov, p] of Object.entries(pm)) {
    const sheet = raw.sheets?.[prov] || null;
    for (const [id, wk] of Object.entries(p.map || {})) {
      sheetZone.set(wk, { prov, id, z: sheet?.zones?.[id] || null, sheet });
      model.sheetOf.set(wk, id); model.worldOfSheet.set(id, wk);
    }
    if (!model.playable) model.playable = { id: prov, name: sheet?.name || titleCase(prov), worldProvince: p.worldProvince, block: p.block, size: p.size, band: sheet?.band || null, capital: sheet?.capital || null };
  }
  // provinces of the whole world
  for (const pr of world.provinces || []) {
    const playable = model.playable && pr.id === model.playable.worldProvince;
    let sx = 0, sz = 0, n = 0;
    for (const k of pr.zones || []) { const b = zoneBoundsOf(k); if (b) { sx += b.minX + zm / 2; sz += b.minZ + zm / 2; n++; } }
    model.provinces.push({ id: pr.id, name: playable ? model.playable.name : pr.name, worldName: pr.name, biome: pr.biome, danger: pr.danger, race: pr.race, zones: pr.zones || [], cx: n ? sx / n : 0, cz: n ? sz / n : 0, playable });
  }
  // zones (every world zone: province, land share; the playable ones get the sheet's name and band)
  for (const z of world.zones || []) {
    const b = zoneBoundsOf(z.id); if (!b) continue;
    const s = sheetZone.get(z.id);
    model.zones.set(z.id, {
      key: z.id, zx: b.zx, zy: b.zy, bounds: b, province: z.province, land: z.land ?? 1,
      name: s?.z?.name || null, band: s?.z?.band || null, archetype: s?.z?.archetype || null, town: s?.z?.town || null,
      dungeon: s?.z?.dungeon || null, sheetId: s?.id || null, playable: !!s,
    });
  }
  for (const [wk, s] of sheetZone) if (!model.zones.has(wk)) {
    const b = zoneBoundsOf(wk);
    model.zones.set(wk, { key: wk, zx: b.zx, zy: b.zy, bounds: b, province: model.playable?.worldProvince, land: 1, name: s.z?.name || null, band: s.z?.band || null, archetype: s.z?.archetype || null, town: s.z?.town || null, dungeon: s.z?.dungeon || null, sheetId: s.id, playable: true });
  }
  // settlements of the world (names inside the playable province come from its zone files below)
  for (const n of world.nodes || []) {
    if (sheetZone.has(n.zone)) continue;
    if (n.type === 'settlement') model.settlements.push({ name: n.name, kind: n.kind, size: n.size || 1, x: n.x, z: n.z, zone: n.zone });
  }
  // rivers and roads, thinned for drawing
  for (const r of world.rivers || []) { if (r.pts?.length > 1) { const pts = simplify(r.pts, 10); model.rivers.push({ id: r.id, name: r.name || null, pts, bbox: bboxOf(pts), cls: r.pts[0][3] || 1 }); } }
  for (const r of world.roads || []) { if (r.pts?.length > 1) { const pts = simplify(r.pts, 6); model.roads.push({ id: r.id, cls: r.class || 'road', width: r.width || 4, pts, bbox: bboxOf(pts) }); } }

  // the playable province: zone sites, sheet names, placements
  for (const [wk, s] of sheetZone) {
    const Z = model.zones.get(wk), zj = raw.zoneJsons?.[wk], o = zoneBoundsOf(wk);
    const ox = o.minX, oz = o.minZ;
    for (const st of zj?.sites || []) {
      const x = st.x + ox, z = st.z + oz;
      if (st.id) model.sites.set(st.id, { x, z, name: st.name || null, zone: wk, r: st.radius || st.r || 40 });
      if (st.type === 'settlement') {
        model.pois.push({ id: `set:${wk}:${st.name}`, kind: st.kind || 'hamlet', name: st.name, x, z, zone: wk, r: st.radius || 40, hub: !!st.hub, starter: !!st.starter });
        model.settlements.push({ name: st.name, kind: st.kind, size: st.kind === 'city' ? 4 : st.kind === 'town' ? 3 : 1, x, z, zone: wk, hub: !!st.hub });
      } else if (st.type === 'dungeon') {
        const d = Z?.dungeon;
        model.pois.push({ id: `door:${wk}:${st.id || 0}`, kind: 'dungeon', name: d?.name || st.name || 'Dungeon', x, z, zone: wk, level: d?.level || Z?.band?.[0] || null, sub: d?.floors ? `${d.floors} floors` : '' });
      } else if (st.type === 'event') {
        const ev = (raw.events?.zone || []).find(e => e.site === st.id || e.id === st.id) || (raw.events?.realm || []).find(e => e.site === st.id || e.id === st.id);
        model.pois.push({ id: `arena:${st.id}`, kind: 'event', name: ev?.name || titleCase(String(st.id || 'event').replace(/^event_/, '')), x, z, zone: wk, r: st.r || 40,
          level: ev?.level || Z?.band?.[1] || null, arena: st.id, sub: ev ? (ev.kind === 'worldboss' ? 'World boss arena' : 'Zone event: comes every hour or so') : '' });
      } else if (st.type === 'crossing') model.pois.push({ id: `x:${wk}:${st.name}`, kind: st.kind === 'bridge' ? 'bridge' : 'ford', name: st.name, x, z, zone: wk });
      else if (st.type === 'landmark') model.pois.push({ id: `lm:${wk}:${st.name || st.kind}`, kind: 'landmark', name: st.name || titleCase(st.kind), x, z, zone: wk });
    }
    const P = raw.placements?.[wk];
    for (const p of P?.placements || []) {
      const x = p.x + ox, z = p.z + oz;
      if (p.id) model.vigs.set(p.id, { x, z, r: p.radius || 12, name: p.name || null, zone: wk, type: p.type });
      if (p.type === 'npc') model.npcs.set(p.id, { x, z, name: p.name, role: p.role, zone: wk });
      else if (p.type === 'camp') model.camps.push({ monster: p.monster, x, z, zone: wk, level: p.level || null });
      else if (p.type === 'rare') model.rares.set(p.id, { x, z, name: p.name || titleCase(String(p.id).replace(/^rare_/, '')), zone: wk });
      else if (p.type === 'cave') model.pois.push({ id: `cave:${p.id}`, kind: 'cave', name: p.name || 'Cave', x, z, zone: wk, level: p.level || p.plan?.level || null, sub: p.plan?.floors ? `${p.plan.floors} floor${p.plan.floors > 1 ? 's' : ''}` : '' });
      else if (p.type === 'fort') model.pois.push({ id: `fort:${p.id}`, kind: 'fort', name: p.name || 'Fort', x, z, zone: wk, level: p.level || null, sub: p.friendly === false ? 'Hostile' : 'Friendly' , hostile: p.friendly === false });
      else if (p.type === 'farm') model.pois.push({ id: `farm:${p.id}`, kind: 'farm', name: p.name || 'Farm', x, z, zone: wk });
    }
    // the sheet zone's quest file
    const qf = raw.quests?.[s.id];
    for (const [id, n] of Object.entries(qf?.npcs || {})) if (!model.npcs.has(id)) model.npcs.set(id, { ...n, zone: wk });
    for (const q of qf?.quests || []) model.quests.set(q.id, { ...q, zone: wk });
  }
  model.rareSlots = raw.rares || {};
  return model;
}

/** The zone record under a world point (null off the map). */
export function zoneAt(model, x, z) { return model.zones.get(zoneKeyAt(x, z)) || null; }

// ---- where a quest happens ------------------------------------------------------------------------------
/**
 * Where the CURRENT step of a quest happens. `q` is the server's quest view (§15.9: {id, zone, giver, step,
 * steps:[{text, n, of, done, at?}], ready}); the step's own `at` wins when the server sends one. Otherwise the step
 * is read from stream E's quest file (data/quests/<zone>.json) and resolved the way js/sim/quests.js does.
 * Returns { x, z, r, name, zone, exact } — `exact: false` means "somewhere in this zone" (a big circle).
 */
export function locateQuest(q, model, me = null) {
  if (!q) return null;
  const st = q.steps?.[q.step];
  const near = list => { if (!list.length) return null; if (!me) return list[0]; return list.slice().sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]; };
  const zoneCircle = wk => { const b = zoneBoundsOf(wk); const Z = model.zones.get(wk); return b ? { x: b.minX + ZONE_M / 2, z: b.minZ + ZONE_M / 2, r: ZONE_M * 0.45, name: Z?.name || 'this region', zone: wk, exact: false } : null; };
  const at = (p, name, r = 30) => (p ? { x: p.x, z: p.z, r: p.r || r, name: name || p.name || '', zone: p.zone || zoneKeyAt(p.x, p.z), exact: true } : null);
  if (q.ready) {
    if (q.turnIn && Number.isFinite(q.turnIn.x)) return at(q.turnIn, q.turnIn.name || q.giverName, q.turnIn.r || 6);
    if (q.giverAt) return at(q.giverAt, q.giverAt.name, 6);
    const npc = model.npcs.get(q.giver);
    return npc && Number.isFinite(npc.x) ? at(npc, npc.name, 6) : (q.zone ? zoneCircle(q.zone) : null);
  }
  if (st?.at && Number.isFinite(st.at.x)) return at(st.at, st.at.name, st.at.r || 30);
  const def = model.quests.get(q.id);
  const ds = def?.steps?.[q.step] || q.def?.steps?.[q.step] || null;
  const wk = def?.zone || q.zone || null;
  if (ds) {
    const site = name => (name ? (model.sites.get(name) || model.vigs.get(name) || [...model.pois].find(p => p.name && bare(p.name) === bare(name)) || null) : null);
    let p = null, name = '';
    switch (ds.kind) {
      case 'visit': case 'escort': p = ds.vignette ? model.vigs.get(ds.vignette) : site(ds.site || (typeof ds.to === 'string' ? ds.to : null)); break;
      case 'use': p = model.vigs.get(ds.vignette); break;
      case 'talk': case 'deliver': p = model.npcs.get(ds.npc); if (p) name = p.name; break;
      case 'killOne': p = model.sites.get(ds.encounter) || model.rares.get(ds.encounter) || model.vigs.get(ds.encounter); break;
      case 'killRare': { const zid = ds.zone || model.sheetOf.get(wk); const id = (model.rareSlots[zid] || [])[ds.slot ?? 0]; p = id ? (model.rares.get(id) || model.sites.get(id)) : null; if (p) name = p.name; break; }
      case 'clear': p = model.pois.find(x => x.kind === 'dungeon' && x.zone === wk) || null; if (p) name = p.name; break;
      case 'kill': case 'collect': {
        const type = ds.type || ds.from;
        if (ds.near) p = site(typeof ds.near === 'string' ? ds.near : null);
        if (!p && type) {
          const camps = model.camps.filter(c => c.monster === type && (!wk || c.zone === wk));
          const c = near(camps.length ? camps : model.camps.filter(c2 => c2.monster === type));
          if (c) { p = { ...c, r: 60 }; name = `${titleCase(type)}s`; }
        }
        break;
      }
    }
    if (p && Number.isFinite(p.x)) return at(p, name || p.name, p.r || 30);
  }
  // jobs carry their own bound targets (radiant frames: steps[0] may hold place/at)
  const jst = q.def?.steps?.[q.step];
  if (jst?.place && Number.isFinite(jst.place.x)) return at(jst.place, jst.place.name, jst.place.r || 30);
  return wk ? zoneCircle(wk) : null;
}
const bare = n => String(n || '').toLowerCase().replace(/^the\s+/, '').trim();

// ---- views ------------------------------------------------------------------------------------------------
/** A screen transform: world (x, z) <-> canvas pixels. scale = px per metre; rot turns the world (minimap "rotate"). */
export function makeView({ cx, cz, scale, w, h, rot = 0 }) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return {
    cx, cz, scale, w, h, rot,
    toScreen(x, z) { const dx = (x - cx) * scale, dz = (z - cz) * scale; return [w / 2 + dx * c - dz * s, h / 2 + dx * s + dz * c]; },
    toWorld(sx, sy) { const dx = sx - w / 2, dy = sy - h / 2; return [cx + (dx * c + dy * s) / scale, cz + (-dx * s + dy * c) / scale]; },
    /** The world box the screen covers (axis-aligned, includes the rotation). */
    bounds() {
      const pts = [[0, 0], [w, 0], [0, h], [w, h]].map(([a, b]) => this.toWorld(a, b));
      return { minX: Math.min(...pts.map(p => p[0])), maxX: Math.max(...pts.map(p => p[0])), minZ: Math.min(...pts.map(p => p[1])), maxZ: Math.max(...pts.map(p => p[1])) };
    },
  };
}
/** Zoom about a screen point so that point stays under the pointer. Returns the new {cx, cz, scale}. */
export function zoomAt(view, sx, sy, factor, { min = 0.002, max = 4 } = {}) {
  const [wx, wz] = view.toWorld(sx, sy);
  const scale = Math.max(min, Math.min(max, view.scale * factor));
  const dx = sx - view.w / 2, dy = sy - view.h / 2;
  return { scale, cx: wx - dx / scale, cz: wz - dy / scale };
}
/** Is a screen point inside the canvas (with a margin)? */
export const onScreen = (p, w, h, m = 0) => p[0] >= -m && p[1] >= -m && p[0] <= w + m && p[1] <= h + m;
/**
 * Where an off-screen target's arrow sits on a rim: a circle of radius r round (cx, cy) (round minimap) or the
 * rectangle inset by `pad` (square view). Returns { x, y, angle } (angle = screen radians, 0 = right).
 */
export function rimPoint(sx, sy, { cx, cy, r = null, w = 0, h = 0, pad = 14 }) {
  const dx = sx - cx, dy = sy - cy, ang = Math.atan2(dy, dx);
  if (r != null) return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, angle: ang };
  const hw = w / 2 - pad, hh = h / 2 - pad;
  const k = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return { x: cx + dx * k, y: cy + dy * k, angle: ang };
}
/** Markers under a screen point, best first (rank: bigger things win a tie, then nearer). */
export function hitTest(markers, sx, sy, view, radius = 11) {
  const out = [];
  for (const m of markers) {
    if (m.hidden) continue;
    const [px, py] = view.toScreen(m.x, m.z);
    const d = Math.hypot(px - sx, py - sy);
    const rr = Math.max(radius, (m.size || 0) + 3);
    if (d <= rr) out.push({ m, d, score: d - (m.priority || 0) * 3 });
  }
  return out.sort((a, b) => a.score - b.score).map(o => o.m);
}

// ---- fog of the map (discovered cells) ------------------------------------------------------------------
/** A bitset over the world in `cell`-metre squares. reveal() a circle as you walk; save()/load() as base64. */
export function createFog({ w, h, cell = 128 }) {
  const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
  let bits = new Uint8Array(Math.ceil(cw * ch / 8));
  let version = 0;
  const idx = (i, j) => j * cw + i;
  const fog = {
    cell, cw, ch,
    get version() { return version; },
    has(i, j) { if (i < 0 || j < 0 || i >= cw || j >= ch) return false; const k = idx(i, j); return !!(bits[k >> 3] & (1 << (k & 7))); },
    seen(x, z) { return fog.has(Math.floor(x / cell), Math.floor(z / cell)); },
    /** Reveal every cell whose centre is within r of (x, z). Returns how many were new. */
    reveal(x, z, r) {
      let n = 0;
      const i0 = Math.floor((x - r) / cell), i1 = Math.floor((x + r) / cell), j0 = Math.floor((z - r) / cell), j1 = Math.floor((z + r) / cell);
      for (let j = Math.max(0, j0); j <= Math.min(ch - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(cw - 1, i1); i++) {
        const cx = (i + 0.5) * cell, cz = (j + 0.5) * cell;
        if (Math.hypot(cx - x, cz - z) > r + cell * 0.35) continue;
        const k = idx(i, j);
        if (!(bits[k >> 3] & (1 << (k & 7)))) { bits[k >> 3] |= 1 << (k & 7); n++; }
      }
      if (n) version++;
      return n;
    },
    count() { let n = 0; for (const b of bits) { let v = b; while (v) { n += v & 1; v >>= 1; } } return n; },
    /** Share of a box that is discovered (0..1) — "62% of this zone explored". */
    shareIn(b) {
      let n = 0, t = 0;
      for (let j = Math.floor(b.minZ / cell); j < Math.ceil(b.maxZ / cell); j++) for (let i = Math.floor(b.minX / cell); i < Math.ceil(b.maxX / cell); i++) { t++; if (fog.has(i, j)) n++; }
      return t ? n / t : 0;
    },
    save() { let s = ''; for (let k = 0; k < bits.length; k++) s += String.fromCharCode(bits[k]); return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'); },
    load(b64) {
      if (!b64) return false;
      try {
        const s = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
        if (s.length !== bits.length) return false;
        for (let k = 0; k < s.length; k++) bits[k] |= s.charCodeAt(k);
        version++;
        return true;
      } catch { return false; }
    },
    /** Merge a list of revealed cells the server sends ([[i, j], …] in this cell size), when it does. */
    merge(cells) { let n = 0; for (const [i, j] of cells || []) { if (i < 0 || j < 0 || i >= cw || j >= ch) continue; const k = idx(i, j); if (!(bits[k >> 3] & (1 << (k & 7)))) { bits[k >> 3] |= 1 << (k & 7); n++; } } if (n) version++; return n; },
    clear() { bits = new Uint8Array(bits.length); version++; },
  };
  return fog;
}

// ---- markers -------------------------------------------------------------------------------------------------
/**
 * Everything the map and the minimap draw, as one list: { id, kind, x, z, name, sub, level, priority, size, hidden,
 * act } — `act` = what a click does ('travel' a waystone, 'track' a quest, 'pin' remove a pin). Pure: the caller
 * passes what it knows (room, quests, events, party, fog).
 */
export function collectMarkers({ model, room, known = new Set(), fog = null, quests = [], tracked = null, events = [], party = [], pins = [], me = null, level = 1, dungeon = false }) {
  const out = [];
  const seen = (x, z) => !fog || fog.seen(x, z);
  if (!dungeon && model) {
    for (const p of model.pois) {
      const big = p.kind === 'town' || p.kind === 'city' || p.kind === 'capital' || p.hub;
      // towns are famous (always on the map); everything else shows once you have been near it
      if (!big && !seen(p.x, p.z)) continue;
      out.push({ id: p.id, kind: p.kind, x: p.x, z: p.z, name: p.name, sub: [poiLabel(p.kind), p.sub, p.level ? `level ${p.level}` : ''].filter(Boolean).join(' · '), level: p.level || null, priority: p.hub ? 3 : big || p.kind === 'dungeon' ? 2 : 1, size: big ? 7 : 5, zone: p.zone, hostile: !!p.hostile, levelTone: p.level ? bandTone([p.level, p.level], level) : null });
    }
  }
  for (const w of room?.waystones || []) {
    const k = known.has(w.key);
    if (!k && !seen(w.x, w.z)) continue;
    out.push({ id: 'ws:' + w.key, kind: 'waystone', key: w.key, x: w.x, z: w.z, name: k ? w.name : 'Waystone', sub: k ? 'Waystone — travel from here' : 'Not touched yet: touch it (E) to travel from and to it', known: k, priority: k ? 2 : 1, size: 6, act: k ? 'travel' : null });
  }
  for (const e of events) if (Number.isFinite(e.x)) out.push({ id: 'ev:' + (e.uid || e.id || e.name), kind: 'liveevent', x: e.x, z: e.z, r: e.r || 40, name: e.name || 'Event', sub: e.sub || 'Happening now', level: e.level || null, priority: 5, size: 9, act: e.free ? 'event' : null, live: true });
  for (const q of quests) {
    if (!q.loc) continue;
    out.push({ id: 'q:' + q.id, kind: q.ready ? 'questdone' : 'quest', x: q.loc.x, z: q.loc.z, r: q.loc.exact ? q.loc.r : q.loc.r, area: !q.loc.exact, name: q.name, sub: q.ready ? 'Ready to hand in' : (q.goal || ''), level: q.level || null, priority: q.id === tracked ? 6 : 4, size: q.id === tracked ? 9 : 7, tracked: q.id === tracked, act: 'track', quest: q.id });
  }
  for (const m of party) if (Number.isFinite(m.x)) out.push({ id: 'pm:' + m.char, kind: 'party', x: m.x, z: m.z, name: m.name, sub: m.sub || 'Party member', priority: 4, size: 6 });
  for (const p of pins) out.push({ id: 'pin:' + p.id, kind: 'pin', x: p.x, z: p.z, name: p.name || 'Your pin', sub: 'Click to remove', priority: 3, size: 7, act: 'unpin', pin: p.id });
  if (me) out.push({ id: 'me', kind: 'me', x: me.x, z: me.z, name: 'You', sub: '', priority: 10, size: 8 });
  return out;
}
