// Thousandvale — province-wide reachability over the baked nav layers (stream B, PLAN §16 "reachability bot
// to every site"). Stitches every baked zone of a province sheet into ONE walk grid (zone edges share their
// samples bit for bit, so a 4×4 block of 1,025² zones is 4,097²) and floods it from the starter hub.
//
//   import { provinceReach } from './lib/province-reach.mjs';
//   const r = provinceReach('torbor_downs');   // { grid, reached, targets: [{zone, what, x, z, ok, gap}], ... }
//
// Walkable = nav WALK and not SOLID / BUILDING / DEEP (parseNav().passable), 4-connected: a walker never
// slips diagonally between two trunks. Used by tests/B/zone-reach.test.js and printable with
//   node tools/lib/province-reach.mjs torbor_downs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTerrain, parseNav, NAV } from '../../js/rules/terrain-read.js';

const ROOT = new URL('../../', import.meta.url);
const BLOCKED = NAV.SOLID | NAV.BUILDING | NAV.DEEP;

/** The targets a walker must reach in one zone: settlements, the front of each door, event/camp arenas, crossings, vignettes. */
export function zoneTargets(t, worldZone) {
  const out = [];
  for (const s of t.meta.sites) {
    if (s.type === 'settlement') out.push({ what: `${s.kind} ${s.name}`, x: s.x, z: s.z, near: Math.min(30, (s.radius || 30) * 0.5) });
    else if (s.type === 'dungeon') out.push({ what: `door ${s.id}`, x: s.x + Math.sin(s.yaw) * 5, z: s.z + Math.cos(s.yaw) * 5, near: 4 });
    else if (s.type === 'event' || s.type === 'camp') out.push({ what: `${s.type} ${s.id}`, x: s.x, z: s.z, near: Math.min(12, (s.r || 20) * 0.4) });
    else if (s.type === 'crossing') out.push({ what: `${s.kind || 'crossing'} ${s.name}`, x: s.x, z: s.z, near: 30 });
  }
  if (t.meta.spawn) out.push({ what: 'spawn', x: t.meta.spawn.x, z: t.meta.spawn.z, near: 4 });
  const vf = worldZone && new URL(`data/vignettes/placements/${worldZone}.json`, ROOT);   // E's files are named by WORLD zone
  if (vf && existsSync(vf)) for (const p of JSON.parse(readFileSync(vf, 'utf8')).placements || []) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    out.push({ what: `${p.type || 'vignette'} ${p.id || p.vignette}`, x: p.x, z: p.z, near: Math.max(4, (p.radius || 8) * 0.6) });
  }
  return out;
}

export function provinceReach(sheet = 'torbor_downs') {
  const map = JSON.parse(readFileSync(new URL('data/world/province-map.json', ROOT), 'utf8')).provinces[sheet];
  const [bx, by] = map.block, [cols, rows] = map.size;
  const ids = Object.entries(map.map);   // [sheetZone, worldZone]
  const zones = [];
  let S = 0, step = 2;
  for (const [sheetZone, id] of ids) {
    const dir = new URL(`data/zones/${id}/`, ROOT);
    if (!existsSync(new URL('nav.bin', dir))) continue;
    const t = parseTerrain(readFileSync(new URL('terrain.bin', dir)));
    const nav = parseNav(readFileSync(new URL('nav.bin', dir)));
    S = nav.size; step = nav.step;
    zones.push({ id, sheetZone, zx: +id.slice(1, 3) - bx, zy: +id.slice(4, 6) - by, t, nav });
  }
  const E = S - 1, G = cols * E + 1;
  const walk = new Uint8Array(G * G);         // 1 = walkable; 0 = blocked or not baked
  const seen = new Uint8Array(G * G);         // edge samples: AND of both zones
  for (const z of zones) {
    const ox = z.zx * E, oy = z.zy * E, bits = z.nav.bits;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const b = bits[j * S + i], ok = (b & NAV.WALK) && !(b & BLOCKED) ? 1 : 0;
      const g = (oy + j) * G + ox + i;
      walk[g] = seen[g] ? walk[g] & ok : ok; seen[g] = 1;
    }
  }
  // province metres: zone (zx, zy) local (x, z) -> (zx*2048 + x, zy*2048 + z)
  const ZM = E * step;
  const gIdx = (z, x, zz) => Math.round((z.zy * ZM + zz) / step) * G + Math.round((z.zx * ZM + x) / step);
  const hubZone = zones.find(z => z.t.meta.sites.some(s => s.hub)) || zones[0];
  const hub = hubZone.t.meta.spawn;
  let start = gIdx(hubZone, hub.x, hub.z);
  if (!walk[start]) start = nearestWalk(walk, G, start, 20);
  // flood
  const reached = new Uint8Array(G * G), q = new Int32Array(G * G);
  let qh = 0, qt = 0; q[qt++] = start; reached[start] = 1;
  while (qh < qt) {
    const k = q[qh++], i = k % G;
    if (i > 0 && walk[k - 1] && !reached[k - 1]) { reached[k - 1] = 1; q[qt++] = k - 1; }
    if (i < G - 1 && walk[k + 1] && !reached[k + 1]) { reached[k + 1] = 1; q[qt++] = k + 1; }
    if (k >= G && walk[k - G] && !reached[k - G]) { reached[k - G] = 1; q[qt++] = k - G; }
    if (k < G * (G - 1) && walk[k + G] && !reached[k + G]) { reached[k + G] = 1; q[qt++] = k + G; }
  }
  let walkable = 0; for (let k = 0; k < G * G; k++) walkable += walk[k];
  // per-zone numbers + targets
  const targets = [], perZone = [];
  for (const z of zones) {
    let w = 0, r = 0;
    const ox = z.zx * E, oy = z.zy * E;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const g = (oy + j) * G + ox + i; w += walk[g]; r += reached[g]; }
    perZone.push({ id: z.id, sheetZone: z.sheetZone, walkable: w / (S * S), reachedShare: w ? r / w : 0 });
    for (const tg of zoneTargets(z.t, z.id)) {
      const g = gIdx(z, tg.x, tg.z);
      const gap = nearestReached(reached, G, g, Math.ceil(tg.near / step));
      targets.push({ zone: z.id, sheetZone: z.sheetZone, ...tg, ok: gap >= 0, gap: gap >= 0 ? gap * step : null });
    }
  }
  return { sheet, G, step, zones: zones.map(z => z.id), walkable, reachedCells: qt, reachedShare: qt / walkable, perZone, targets, hub: { zone: hubZone.id, ...hub } };
}

function nearestWalk(walk, G, g, rad) {
  const gi = g % G, gj = (g / G) | 0;
  for (let r = 1; r <= rad; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = gi + di, j = gj + dj; if (i < 0 || j < 0 || i >= G || j >= G) continue;
    if (walk[j * G + i]) return j * G + i;
  }
  return g;
}
/** Chebyshev rings out from g: the distance in samples to the nearest reached cell, or -1 beyond rad. */
function nearestReached(reached, G, g, rad) {
  const gi = g % G, gj = (g / G) | 0;
  for (let r = 0; r <= rad; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = gi + di, j = gj + dj; if (i < 0 || j < 0 || i >= G || j >= G) continue;
    if (reached[j * G + i]) return r;
  }
  return -1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const t0 = performance.now();
  const r = provinceReach(process.argv[2] || 'torbor_downs');
  console.log(`${r.sheet}: ${r.zones.length} zones, grid ${r.G}², walkable ${r.walkable}, reached ${(r.reachedShare * 100).toFixed(1)}% from ${r.hub.zone} (${Math.round(performance.now() - t0)} ms)`);
  for (const z of r.perZone) console.log(`  ${z.id} ${z.sheetZone.padEnd(18)} walkable ${(z.walkable * 100).toFixed(1)}%  reached ${(z.reachedShare * 100).toFixed(1)}% of it`);
  const bad = r.targets.filter(t => !t.ok);
  console.log(`targets ${r.targets.length}, unreached ${bad.length}`);
  for (const t of bad) console.log(`  UNREACHED ${t.zone} ${t.what} (${Math.round(t.x)}, ${Math.round(t.z)})`);
}
