// The maps' pure parts (live report #2, 2026-11-16: "a minimap and a region map"): world <-> map coordinates that turn
// with the camera (screen up on the map = screen up in the game, so W is up on both — lessons rule 26), the explored
// grid (fog of war) and its save string, and the list of places a zone's markers put on a map. No DOM here, so
// tests/client/map-core.test.js runs it in node. Drawing lives in js/client/map-paint.js, the HUD in minimap.js and the
// big window in region-map.js.

/**
 * A view of the world on a map canvas. `yaw` is the game camera's yaw (scene.js CAM.yaw; 0 = looking toward -z), so the
 * map's up is the direction the camera looks: what is above the hero on screen is above the hero's pin.
 */
export function mapView({ cx, cz, scale, w, h, yaw = 0 }) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    cx, cz, scale, w, h, yaw,
    toScreen(x, z) { const dx = x - cx, dz = z - cz; return [w / 2 + (dx * c + dz * s) * scale, h / 2 + (dz * c - dx * s) * scale]; },
    toWorld(sx, sy) { const a = (sx - w / 2) / scale, b = (sy - h / 2) / scale; return [cx + a * c - b * s, cz + a * s + b * c]; },
    /** a world direction (dx, dz) as an angle on the map (0 = right, PI/2 = down), for facing arrows */
    angle(dx, dz) { return Math.atan2(dz * c - dx * s, dx * c + dz * s); },
    /** the canvas transform that draws world metres (for the terrain picture): ctx.setTransform(...view.matrix(k)) */
    matrix(k = 1) { return [c * scale * k, -s * scale * k, s * scale * k, c * scale * k, (w / 2 - (cx * c + cz * s) * scale) * k, (h / 2 - (cz * c - cx * s) * scale) * k]; },
  };
}

/** The scale (px a metre) that fits a zone's bounds in a w x h box with `pad` px round it. */
export function fitScale(b, w, h, pad = 16) {
  const W = Math.max(1, b.x1 - b.x0), D = Math.max(1, b.z1 - b.z0);
  return Math.max(0.05, Math.min((w - pad * 2) / W, (h - pad * 2) / D));
}

/** Keep a panned centre inside the zone (a little slack so the edge can reach the middle of the window). */
export function clampCentre(b, cx, cz) { return [Math.max(b.x0, Math.min(b.x1, cx)), Math.max(b.z0, Math.min(b.z1, cz))]; }

/** "north", "south-west"... from the hero to a point (north = screen up = -z with the default camera). */
export function compass(dx, dz, yaw = 0) {
  if (Math.hypot(dx, dz) < 1) return '';
  const c = Math.cos(yaw), s = Math.sin(yaw), rx = dx * c + dz * s, ry = dz * c - dx * s;          // map right / map down
  const a = (Math.atan2(rx, -ry) * 180 / Math.PI + 360) % 360;
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(a / 45) % 8];
}
/** "35 m" / "1.2 km": whole metres, never a long decimal (lessons rule 1). */
export const distText = m => !Number.isFinite(m) ? '' : m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${Math.round(m)} m`;
export const levelText = lv => !lv ? '' : lv[0] === lv[1] ? `Level ${lv[0]}` : `Levels ${lv[0]}–${lv[1]}`;

// ---- explored cells (fog of war) ------------------------------------------------------------------------------------
export const CELL = 6;                 // metres a cell
export const SEE = 24;                 // metres round the hero that count as explored (about what the camera shows)

/** An empty explored grid over a zone's bounds ({x0, z0, x1, z1}). */
export function createExplored(b, cell = CELL) {
  const cols = Math.max(1, Math.ceil((b.x1 - b.x0) / cell)), rows = Math.max(1, Math.ceil((b.z1 - b.z0) / cell));
  return { x0: b.x0, z0: b.z0, cell, cols, rows, bits: new Uint8Array(Math.ceil(cols * rows / 8)) };
}
const bitAt = (g, i) => (g.bits[i >> 3] >> (i & 7)) & 1;
export function isSeen(g, x, z) {
  const c = Math.floor((x - g.x0) / g.cell), r = Math.floor((z - g.z0) / g.cell);
  return c >= 0 && r >= 0 && c < g.cols && r < g.rows && !!bitAt(g, r * g.cols + c);
}
export const seenCell = (g, c, r) => !!bitAt(g, r * g.cols + c);
/** Mark every cell whose middle is within `radius` metres of (x, z). Returns the cells that were new (to redraw). */
export function markSeen(g, x, z, radius = SEE) {
  const out = [], n = Math.ceil(radius / g.cell) + 1, c0 = Math.floor((x - g.x0) / g.cell), r0 = Math.floor((z - g.z0) / g.cell);
  for (let r = r0 - n; r <= r0 + n; r++) {
    if (r < 0 || r >= g.rows) continue;
    for (let c = c0 - n; c <= c0 + n; c++) {
      if (c < 0 || c >= g.cols) continue;
      const mx = g.x0 + (c + 0.5) * g.cell, mz = g.z0 + (r + 0.5) * g.cell;
      if (Math.hypot(mx - x, mz - z) > radius) continue;
      const i = r * g.cols + c; if (bitAt(g, i)) continue;
      g.bits[i >> 3] |= 1 << (i & 7); out.push([c, r]);
    }
  }
  return out;
}
export const seenCount = g => { let n = 0; for (let i = 0; i < g.cols * g.rows; i++) n += bitAt(g, i); return n; };

const b64 = bytes => { let s = ''; for (const v of bytes) s += String.fromCharCode(v); return btoa(s); };
const unb64 = str => { const s = atob(str), out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
/** The grid as a short save string: "<cols>x<rows>:<base64 bits>" (a 320 m zone is ~400 characters). */
export const encodeExplored = g => `${g.cols}x${g.rows}:${b64(g.bits)}`;
/** Back from the save string. A string for other bounds (the zone was edited since) gives a fresh grid. */
export function decodeExplored(str, b, cell = CELL) {
  const g = createExplored(b, cell);
  const m = /^(\d+)x(\d+):([A-Za-z0-9+/=]*)$/.exec(String(str || ''));
  if (!m || +m[1] !== g.cols || +m[2] !== g.rows) return g;
  try { const bits = unb64(m[3]); if (bits.length === g.bits.length) g.bits.set(bits); } catch { /* a bad string: start over */ }
  return g;
}

/**
 * The explored save: every hero's explored cells, per zone — { [heroId]: { [zoneId]: "<cols>x<rows>:<bits>" } }, kept
 * under its own localStorage key (`rogueloot.explored.v1`) so the character sent to the room server stays small (it
 * drops unknown fields anyway, js/rules/validate.js). `read`/`write` are the storage calls (localStorage in the game).
 */
export const EXPLORED_KEY = 'rogueloot.explored.v1';
export function exploredStore({ read, write }) {
  let all = null;
  const load = () => { if (all) return all; try { all = JSON.parse(read(EXPLORED_KEY) || '{}') || {}; } catch { all = {}; } if (typeof all !== 'object' || Array.isArray(all)) all = {}; return all; };
  return {
    get(heroId, zoneId, bounds) { return decodeExplored(load()[heroId]?.[zoneId], bounds); },
    put(heroId, zoneId, g) { const a = load(); (a[heroId] ||= {})[zoneId] = encodeExplored(g); try { write(EXPLORED_KEY, JSON.stringify(a)); } catch { /* full or private */ } },
    forget(heroId) { const a = load(); delete a[heroId]; try { write(EXPLORED_KEY, JSON.stringify(a)); } catch { /* */ } },
  };
}

// ---- places on the map -----------------------------------------------------------------------------------------------
/**
 * The fixed places of an area as map pins: ways out (exit, dungeon entrance, portal), waypoint, people, the stash,
 * quest spots and, in town, your own portal. `zoneName(id)` gives a zone's player name (never an id, rule 2).
 */
export function placesOf(area, { zoneName = id => id, recall = null, isTown = false } = {}) {
  const out = [];
  const kinds = { exit: 'Way out', entrance: 'Dungeon', portal: 'Portal', waypoint: 'Waypoint', npc: 'Person', quest: 'Quest' };
  for (const m of area?.markers || []) {
    if (!kinds[m.kind]) continue;
    const at = m.ringAt || m;
    let name = m.label || '', sub = kinds[m.kind];
    if (m.kind === 'exit') { const down = /\(down\)/i.test(m.label || ''), up = /\(up\)/i.test(m.label || ''); name = `To ${zoneName(m.to)}`; sub = down ? 'Stairs down' : up ? 'Stairs up' : 'Way out'; }
    if (m.kind === 'entrance') { name = zoneName(m.to); sub = 'Dungeon entrance'; }
    if (m.kind === 'portal') { name = zoneName(m.to); sub = 'Portal'; }
    if (m.kind === 'waypoint') { name = 'Waypoint'; sub = area.name || ''; }
    if (m.kind === 'npc') { const [who, job] = String(m.label || m.id || '').split(/\s+[—-]\s+/); name = who || 'Someone'; sub = job || 'Townsfolk'; }
    if (m.kind === 'quest') { name = m.label || 'Quest'; sub = 'Quest'; }
    // which way an exit leads out: away from where you arrive (ax, az point inward)
    const out_ = (m.ax || m.az) ? Math.atan2(-(m.az || 0), -(m.ax || 0)) : null;
    out.push({ id: `${m.kind}:${m.to || m.id || ''}:${Math.round(m.x)}:${Math.round(m.z)}`, kind: m.kind, x: at.x, z: at.z, name, sub, to: m.to || null, outAngle: out_ });
  }
  if (isTown && recall) out.push({ id: 'recall', kind: 'recall', x: recall.x, z: recall.z, name: 'Your portal', sub: `Back to ${zoneName(recall.area)}` });
  else if (recall && recall.area === area?.id) out.push({ id: 'recall', kind: 'recall', x: recall.x, z: recall.z, name: 'Your portal comes out here', sub: 'From town' });
  return out;
}

/** Sort order for the place list beside the big map: ways on first, then the waypoint, quests, people. */
export const PLACE_ORDER = { quest: 0, exit: 1, entrance: 2, portal: 3, waypoint: 4, recall: 5, npc: 6 };

/** Enemy pin style from its rank and role ("by type / elite"): a radius, a fill and an outline colour. */
export function foePin(rk, role) {
  const shape = role === 'caster' || role === 'shaman' ? 'diamond' : role === 'archer' ? 'triangle' : 'dot';
  if (rk === 'boss') return { r: 6, fill: '#ff3b2f', ring: '#ffe27a', shape: 'diamond' };
  if (rk === 'rare') return { r: 4.5, fill: '#e84a2a', ring: '#ffd040', shape };
  if (rk === 'champion' || rk === 'elite') return { r: 4.5, fill: '#e84a2a', ring: '#6ab8ff', shape };
  return { r: 3, fill: '#e84a2a', ring: null, shape };
}

/** The pin nearest a canvas point within `r` px (the hero last, so a pin under you still answers). */
export function nearestPin(pins, view, sx, sy, r = 10) {
  let best = null, bd = r;
  for (const p of pins) { const [x, y] = view.toScreen(p.x, p.z), d = Math.hypot(x - sx, y - sy) + (p.kind === 'me' ? 4 : 0); if (d < bd) { bd = d; best = p; } }
  return best;
}
