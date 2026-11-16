// The zone as a map picture, painted ONCE per area into an offscreen canvas (the minimap and the region map just place
// it with a transform each frame). It reads the same zone shapes the 3D ground does (js/world/zone.js: surfaces in
// order, water, cliffs, every prop including the seeded scatter), so the map and the world agree (lessons rule 22).
// Map style: the ground colours a little muted, water blue with a shore line, walls and buildings as dark blocks, trees
// as soft green blobs, bridges and boardwalks as planks.
import { SURFACES } from '../world/zone.js';
import { PROP_KIT } from '../world/props.js';

// footprints (width along x, depth along z, metres at scale 1) of the props that are boxes; everything else is a circle
// of its collision radius (js/world/props.js). Sizes from js/client/prop-meshes.js.
const BOX = {
  crypt_wall: [2.2, 0.8], crypt_door: [2.4, 0.6], niche: [1.4, 0.6], house: [5, 4.4], cart: [1.4, 2.2], coffin: [0.7, 1.9], sarcophagus: [1.2, 2.4],
  market_stall: [2.2, 1.1], altar: [2.2, 1], throne: [1.8, 1.4], stilt_hut: [3.6, 3.6], crate: [0.9, 0.9],
};
const PLANKS = { bridge: [2.8, 8], rope_bridge: [2, 9], dock: [3, 6], boardwalk: [2.4, 6] };          // walkable wood
const TREE = new Set(['tree', 'tree_big', 'pine', 'palm', 'birch', 'dead_tree', 'elder_tree', 'bush']);
const WALLISH = new Set(['crypt_wall', 'crypt_door', 'niche', 'palisade', 'ruin_wall', 'wall_stone', 'fence', 'gate', 'timber_frame']);

/** Mix a #rrggbb colour toward another by t (0..1). */
function mix(a, b, t) {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const tone = s => mix(SURFACES[s] || SURFACES.grass, '#d8c49a', 0.22);         // muted toward parchment

/**
 * Paint `area` (js/world/zone.js buildArea) at `ppm` pixels a metre. Returns { canvas, ppm, x0, z0 } — the picture's
 * top-left is world (x0, z0). Capped at 2048 px a side.
 */
export function paintZoneMap(area, ppm = 3, makeCanvas = () => document.createElement('canvas')) {
  const zone = area.zone || {}, b = area.bounds;
  const W = b.x1 - b.x0, D = b.z1 - b.z0, k = Math.min(ppm, 2048 / W, 2048 / D);
  const c = makeCanvas(); c.width = Math.ceil(W * k); c.height = Math.ceil(D * k);
  const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  g.setTransform(k, 0, 0, k, -b.x0 * k, -b.z0 * k);           // draw in world metres from here on
  const poly = pts => { g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); };
  g.fillStyle = tone(zone.base || 'grass'); g.fillRect(b.x0, b.z0, W, D);
  for (const sh of zone.surfaces || []) {
    g.fillStyle = g.strokeStyle = tone(sh.s);
    if (sh.circle) { g.beginPath(); g.arc(sh.circle[0], sh.circle[1], sh.circle[2], 0, Math.PI * 2); g.fill(); }
    else if (sh.poly) { poly(sh.poly); g.closePath(); g.fill(); }
    else if (sh.path) { g.lineWidth = sh.width || 3; poly(sh.path); g.stroke(); }
  }
  // hills: a soft lighter wash, so high ground reads without contour lines
  for (const e of zone.heights || []) if (e.hill) { const [x, z, r] = e.hill, gr = g.createRadialGradient(x, z, 0, x, z, r); gr.addColorStop(0, 'rgba(255,248,220,.22)'); gr.addColorStop(1, 'rgba(255,248,220,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, z, r, 0, Math.PI * 2); g.fill(); }
  for (const w of zone.water || []) { poly(w.poly); g.closePath(); g.fillStyle = '#5f9fd0'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#d9ecf5'; g.stroke(); }
  for (const cl of zone.cliffs || []) { g.lineWidth = 2.2; g.strokeStyle = '#4a3a2a'; poly(cl.path); g.stroke(); }
  // props: planks first (under everything), then blocks, then trees on top
  const props = area.props || [];
  for (const p of props) {
    const pl = PLANKS[p.k]; if (!pl) continue;
    g.save(); g.translate(p.x, p.z); g.rotate(-(p.yaw || 0)); g.fillStyle = '#a77a48'; g.fillRect(-pl[0] * (p.s || 1) / 2, -pl[1] * (p.s || 1) / 2, pl[0] * (p.s || 1), pl[1] * (p.s || 1)); g.restore();
  }
  for (const p of props) {
    if (PLANKS[p.k] || TREE.has(p.k)) continue;
    const kit = PROP_KIT[p.k], s = p.s || 1, box = BOX[p.k];
    if (box) { g.save(); g.translate(p.x, p.z); g.rotate(-(p.yaw || 0)); g.fillStyle = WALLISH.has(p.k) ? '#3b3128' : '#5a4632'; g.fillRect(-box[0] * s / 2, -box[1] * s / 2, box[0] * s, box[1] * s); g.restore(); continue; }
    if (!kit?.r) continue;
    g.fillStyle = WALLISH.has(p.k) ? '#3b3128' : kit.group === 'built' ? '#5a4632' : '#6b625a';
    g.beginPath(); g.arc(p.x, p.z, Math.max(0.5, kit.r * s), 0, Math.PI * 2); g.fill();
  }
  for (const p of props) {
    if (!TREE.has(p.k)) continue;
    const r = Math.max(0.9, (PROP_KIT[p.k]?.r || 0.5) * (p.s || 1) * 2.2);
    g.fillStyle = p.k === 'dead_tree' ? 'rgba(92,74,52,.75)' : p.k === 'bush' ? 'rgba(52,104,40,.6)' : 'rgba(38,92,34,.72)';
    g.beginPath(); g.arc(p.x, p.z, r, 0, Math.PI * 2); g.fill();
  }
  // the edge of the zone: a dark frame, so "the map ends here" is clear when you pan to it
  g.lineWidth = 2; g.strokeStyle = 'rgba(40,28,14,.6)'; g.strokeRect(b.x0 + 1, b.z0 + 1, W - 2, D - 2);
  return { canvas: c, ppm: k, x0: b.x0, z0: b.z0 };
}

/**
 * The fog picture: one pixel per explored-grid cell, dark where you have not been, clear where you have. Drawn over
 * the map with smoothing on, so the edge of the explored part is soft. `reveal(cells)` clears new cells as you walk.
 */
export function createFog(grid, seenCell, makeCanvas = () => document.createElement('canvas')) {
  const c = makeCanvas(); c.width = grid.cols; c.height = grid.rows;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(29,21,12,.84)'; g.fillRect(0, 0, grid.cols, grid.rows);          // a hint of the land shows through
  for (let r = 0; r < grid.rows; r++) for (let col = 0; col < grid.cols; col++) if (seenCell(grid, col, r)) g.clearRect(col, r, 1, 1);
  return { canvas: c, reveal(cells) { for (const [col, r] of cells) g.clearRect(col, r, 1, 1); } };
}

// ---- pins ---------------------------------------------------------------------------------------------------------------
// One drawn style for every pin on both maps (rule 17: no emoji). `k` scales them (the region map draws them larger).
const PLACE_STYLE = {
  exit: { fill: '#3e9a4a', ring: '#eaffd8' }, entrance: { fill: '#5a3a22', ring: '#f0c890' }, portal: { fill: '#6a4ad8', ring: '#bfe6ff' },
  waypoint: { fill: '#2f7ad8', ring: '#dff0ff' }, npc: { fill: '#e8b64a', ring: '#3a2a10' }, quest: { fill: '#2b1d10', ring: '#ffd040' }, recall: { fill: '#3a7aff', ring: '#bfe6ff' },
};
function shapePath(g, shape, x, y, r) {
  g.beginPath();
  if (shape === 'diamond') { g.moveTo(x, y - r * 1.25); g.lineTo(x + r * 1.1, y); g.lineTo(x, y + r * 1.25); g.lineTo(x - r * 1.1, y); g.closePath(); }
  else if (shape === 'triangle') { g.moveTo(x, y - r * 1.2); g.lineTo(x + r * 1.1, y + r * 0.8); g.lineTo(x - r * 1.1, y + r * 0.8); g.closePath(); }
  else if (shape === 'square') { g.rect(x - r, y - r, r * 2, r * 2); }
  else g.arc(x, y, r, 0, Math.PI * 2);
}
/** Text with a dark halo (readable on any ground). */
export function mapLabel(g, text, x, y, { size = 11, color = '#fff6dc', align = 'center', weight = 700 } = {}) {
  g.font = `${weight} ${size}px Spectral, Georgia, serif`; g.textAlign = align; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(24,16,8,.9)'; g.lineJoin = 'round'; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
}
/** A fixed place (exit, entrance, portal, waypoint, person, quest spot, your portal). */
export function drawPlace(g, view, p, k = 1, hot = false) {
  const [x, y] = view.toScreen(p.x, p.z), st = PLACE_STYLE[p.kind] || PLACE_STYLE.npc, r = (p.kind === 'npc' ? 4 : 5.5) * k;
  g.save();
  if (hot) { g.beginPath(); g.arc(x, y, r + 5 * k, 0, Math.PI * 2); g.fillStyle = 'rgba(255,226,122,.45)'; g.fill(); }
  g.lineWidth = 1.6 * k; g.strokeStyle = st.ring; g.fillStyle = st.fill;
  if (p.kind === 'waypoint') { shapePath(g, 'diamond', x, y, r); g.fill(); g.stroke(); }
  else if (p.kind === 'entrance') { g.beginPath(); g.moveTo(x - r, y + r * 0.9); g.lineTo(x - r, y - r * 0.2); g.arc(x, y - r * 0.2, r, Math.PI, 0); g.lineTo(x + r, y + r * 0.9); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#120a04'; g.beginPath(); g.moveTo(x - r * 0.45, y + r * 0.9); g.lineTo(x - r * 0.45, y); g.arc(x, y, r * 0.45, Math.PI, 0); g.lineTo(x + r * 0.45, y + r * 0.9); g.closePath(); g.fill(); }
  else if (p.kind === 'portal' || p.kind === 'recall') { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.lineWidth = 2.4 * k; g.stroke(); g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fillStyle = st.ring; g.fill(); }
  else if (p.kind === 'quest') { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#ffd040'; g.fillRect(x - 0.9 * k, y - r * 0.6, 1.8 * k, r * 0.75); g.fillRect(x - 0.9 * k, y + r * 0.3, 1.8 * k, 1.8 * k); }
  else if (p.kind === 'exit') {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    const a = p.outAngle == null ? -Math.PI / 2 : view.angle(Math.cos(p.outAngle), Math.sin(p.outAngle));
    g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(r * 0.6, 0); g.lineTo(-r * 0.35, -r * 0.5); g.lineTo(-r * 0.35, r * 0.5); g.closePath(); g.fillStyle = '#eaffd8'; g.fill();
  }
  else { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
  g.restore();
  return [x, y];
}
/** An enemy (style from map-core foePin). */
export function drawFoe(g, view, f, pin, k = 1) {
  const [x, y] = view.toScreen(f.x, f.z), r = pin.r * k;
  shapePath(g, pin.shape, x, y, r); g.fillStyle = pin.fill; g.fill();
  g.lineWidth = (pin.ring ? 2 : 1) * k; g.strokeStyle = pin.ring || 'rgba(40,10,6,.85)'; g.stroke();
}
export function drawChest(g, view, c, k = 1) {
  const [x, y] = view.toScreen(c.x, c.z), r = 3.2 * k;
  g.fillStyle = '#8a5a22'; g.fillRect(x - r, y - r * 0.75, r * 2, r * 1.5); g.lineWidth = 1.2 * k; g.strokeStyle = '#ffd36a'; g.strokeRect(x - r, y - r * 0.75, r * 2, r * 1.5);
}
export function drawAlly(g, view, a, k = 1) {
  const [x, y] = view.toScreen(a.x, a.z), r = 4.2 * k;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#4aa8ff'; g.fill(); g.lineWidth = 1.6 * k; g.strokeStyle = '#ffffff'; g.stroke();
  return [x, y];
}
/** You: an arrow pointing the way you face (yaw: forward = (sin yaw, cos yaw), as actors.js turns the body). */
export function drawHero(g, view, me, k = 1) {
  const [x, y] = view.toScreen(me.x, me.z), a = view.angle(Math.sin(me.yaw || 0), Math.cos(me.yaw || 0)), r = 7 * k;
  g.save(); g.translate(x, y); g.rotate(a);
  g.beginPath(); g.moveTo(r, 0); g.lineTo(-r * 0.7, -r * 0.65); g.lineTo(-r * 0.3, 0); g.lineTo(-r * 0.7, r * 0.65); g.closePath();
  g.fillStyle = '#fff3c4'; g.fill(); g.lineWidth = 1.8 * k; g.strokeStyle = '#2b1d10'; g.stroke();
  g.restore();
  return [x, y];
}
/** The quest guide's goal (js/rules/guide.js): a gold ring that breathes. */
export function drawGoal(g, view, t, k = 1, now = 0) {
  const [x, y] = view.toScreen(t.x, t.z), r = (7 + Math.sin(now / 260) * 1.5) * k;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.lineWidth = 2.4 * k; g.strokeStyle = '#ffd040'; g.stroke();
  g.beginPath(); g.arc(x, y, r + 2.5 * k, 0, Math.PI * 2); g.lineWidth = 1 * k; g.strokeStyle = 'rgba(40,24,6,.7)'; g.stroke();
  return [x, y];
}
