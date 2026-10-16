#!/usr/bin/env node
// Stream V (Expansion 1 §6): finds where each harbour's ship lies and the sea route between the harbours, over the
// world's own ground (data/world/horizon.bin, 32 m), and writes them into data/provinces/ships.json.
//
//   node tools/ship-routes.mjs            print what it found
//   node tools/ship-routes.mjs --write    and write `berth`, `pier` (per harbour) and `path` (per sailing)
//
// Per harbour: from the `dock` walk along `seaward` until the sea floor is DEEP (a ship's draught + room to swing):
// that is the berth; the jetty runs from just above the waterline to the berth. Per sailing: a grid search over 128 m
// cells of open water that pays extra for every cell close to a coast (so the ship stands off the land), then the
// corners cut wherever a straight line keeps the same clearance. Run it again after any re-bake of a coast.
//
// Play-test 11 (Z61): a harbour the zone bake BUILT (a bay's harbour: tools/lib/world-core.mjs BAYS `harbour`, written as the
// zone's `harbour` placement with its quay, walkable piers, berth, harbourmaster and dock) is taken from the bake as it is:
// its ship lies at the bake's berth, its Harbourmaster stands on the quay, and it has no `pier` here (the town draws the
// real ones). Only the sea route is searched.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHorizon } from '../js/rules/horizon-read.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(GAME, 'data/provinces/ships.json');
export const ROUTE = Object.freeze({ cell: 128, deep: -9, berthDepth: -6, clearM: 420, shoreY: 0.6, maxWalkM: 4000 });

/** A harbour the zone bake built (data/zones/<zone>/placements.json kind harbour with a berth) -> world-metre fields | null. */
export function bakedHarbour(h, readPlacements = z => JSON.parse(readFileSync(join(GAME, `data/zones/${z}/placements.json`), 'utf8')).placements) {
  if (!h.zone) return null;
  let rec = null; try { rec = readPlacements(h.zone).find(p => p.kind === 'harbour' && p.data?.berth); } catch { return null; }
  if (!rec) return null;
  const m = /^z(\d+)_(\d+)$/.exec(h.zone), ox = +m[1] * 2048, oz = +m[2] * 2048, d = rec.data;
  const main = (d.piers || []).find(p => p.main) || d.piers?.[0];
  const sea = main ? [main.b[0] - main.a[0], main.b[1] - main.a[1]] : [Math.sin(rec.yaw), Math.cos(rec.yaw)], n = Math.hypot(...sea) || 1;
  return { site: rec.id, berth: { x: Math.round(ox + d.berth.x), z: Math.round(oz + d.berth.z), yaw: d.berth.yaw }, master: { ...h.master, x: +(ox + d.master.x).toFixed(1), z: +(oz + d.master.z).toFixed(1), yaw: d.master.yaw },
    dock: { x: +(ox + d.dock.x).toFixed(1), z: +(oz + d.dock.z).toFixed(1) }, seaward: [+(sea[0] / n).toFixed(3), +(sea[1] / n).toFixed(3)] };
}

/** Where a harbour's ship lies: walk seaward from the dock. -> { berth: {x,z,yaw}, pier: {from:[x,z], to:[x,z]} } | null */
export function findBerth(h, hz, R = ROUTE) {
  const d = h.dock || h.master; if (!d) return null;
  let [sx, sz] = h.seaward || [1, 0]; const n = Math.hypot(sx, sz) || 1; sx /= n; sz /= n;
  let shore = null;
  for (let t = 0; t <= R.maxWalkM; t += 4) {
    const x = d.x + sx * t, z = d.z + sz * t, y = hz.heightAt(x, z);
    if (!shore && y < R.shoreY) shore = { x: x - sx * 10, z: z - sz * 10 };
    if (shore && y < R.berthDepth) {
      const bx = x + sx * 14, bz = z + sz * 14;
      // the ship lies alongside the jetty's end, bow to the right of the seaward way
      return { berth: { x: Math.round(bx), z: Math.round(bz), yaw: +Math.atan2(sz, -sx).toFixed(3) }, pier: { from: [Math.round(shore.x), Math.round(shore.z)], to: [Math.round(x + sx * 4), Math.round(z + sz * 4)] } };
    }
  }
  return null;
}

/** The sea route between two berths. -> [[x, z], ...] world metres (the berths are the ends). */
export function findRoute(a, b, hz, R = ROUTE) {
  const C = R.cell, W = Math.ceil(hz.width * hz.step / C), H = Math.ceil(hz.height * hz.step / C);
  const wet = new Uint8Array(W * H), clear = new Float32Array(W * H).fill(1e9);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) wet[j * W + i] = hz.heightAt(i * C + C / 2, j * C + C / 2) < R.deep ? 1 : 0;
  // distance to the nearest dry cell (two passes, chamfer)
  for (let k = 0; k < W * H; k++) if (!wet[k]) clear[k] = 0;
  for (let pass = 0; pass < 2; pass++) for (let s = 0; s < W * H; s++) {
    const k = pass ? W * H - 1 - s : s, i = k % W, j = (k / W) | 0, dir = pass ? 1 : -1;
    for (const [di, dj, w] of [[dir, 0, C], [0, dir, C], [dir, dir, C * 1.414], [-dir, dir, C * 1.414]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const v = clear[jj * W + ii] + w; if (v < clear[k]) clear[k] = v;
    }
  }
  const cellOf = p => [Math.max(0, Math.min(W - 1, Math.floor(p.x / C))), Math.max(0, Math.min(H - 1, Math.floor(p.z / C)))];
  const nearestWet = p => { const [ci, cj] = cellOf(p); let best = null, bd = Infinity; for (let r = 0; r < 12 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= W || j >= H || !wet[j * W + i]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j]; } } return best; };
  const s = nearestWet(a), g = nearestWet(b);
  if (!s || !g) return null;
  const cost = k => 1 + Math.max(0, (R.clearM * 2 - clear[k]) / R.clearM) * 3;
  const G = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), done = new Uint8Array(W * H);
  const sk = s[1] * W + s[0], gk = g[1] * W + g[0];
  G[sk] = 0;
  const open = [sk];
  const hgt = k => Math.hypot((k % W) - g[0], ((k / W) | 0) - g[1]);
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (G[open[q]] + hgt(open[q]) < G[open[bi]] + hgt(open[bi])) bi = q;
    const k = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (done[k]) continue; done[k] = 1;
    if (k === gk) break;
    const i = k % W, j = (k / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const kk = jj * W + ii; if (!wet[kk] || done[kk]) continue;
      const v = G[k] + Math.hypot(di, dj) * cost(kk);
      if (v < G[kk]) { G[kk] = v; from[kk] = k; open.push(kk); }
    }
  }
  if (from[gk] < 0 && gk !== sk) return null;
  const cells = []; for (let k = gk; k >= 0; k = from[k]) { cells.push([(k % W) * C + C / 2, ((k / W) | 0) * C + C / 2]); if (k === sk) break; }
  cells.reverse();
  // cut corners: keep a point only when a straight line past it would come closer to the coast than it does
  const clearAt = (x, z) => clear[cellOf({ x, z })[1] * W + cellOf({ x, z })[0]];
  const lineOk = (p, q, need) => { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 32); for (let t = 0; t <= n; t++) { const x = p[0] + (q[0] - p[0]) * t / n, z = p[1] + (q[1] - p[1]) * t / n; if (hz.heightAt(x, z) > R.deep + 2 || clearAt(x, z) < need) return false; } return true; };
  const pts = [[a.x, a.z], ...cells, [b.x, b.z]];
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    for (; j > i + 1; j--) { const need = Math.min(R.clearM, Math.min(clearAt(...pts[i]), clearAt(...pts[j]))) * 0.8; if (lineOk(pts[i], pts[j], i === 0 || j === pts.length - 1 ? 0 : need)) break; }
    out.push(pts[j]); i = j;
  }
  return out.map(([x, z]) => [Math.round(x), Math.round(z)]);
}

export function routeAll(data, hz) {
  const out = { harbours: {}, sailings: [] };
  for (const h of data.harbours) { const b = bakedHarbour(h); out.harbours[h.id] = b ? { ...b, pier: null } : findBerth(h, hz); }
  for (const s of data.sailings) {
    const a = out.harbours[s.from]?.berth, b = out.harbours[s.to]?.berth;
    // the way back is the same sea lane, sailed the other way
    const back = out.sailings.find(q => q.from === s.to && q.to === s.from && q.path);
    out.sailings.push({ from: s.from, to: s.to, path: back ? back.path.slice().reverse() : a && b ? findRoute(a, b, hz) : null });
  }
  return out;
}
export const pathMetres = p => p.reduce((m, q, i) => (i ? m + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  const hz = parseHorizon(readFileSync(join(GAME, 'data/world/horizon.bin')));
  const r = routeAll(data, hz);
  for (const [id, b] of Object.entries(r.harbours)) console.log(id, b ? JSON.stringify(b) : 'NO BERTH (no deep water along `seaward`)');
  for (const s of r.sailings) console.log(s.from, '->', s.to, s.path ? `${s.path.length} points, ${(pathMetres(s.path) / 1000).toFixed(1)} km` : 'NO ROUTE');
  if (process.argv.includes('--write')) {
    for (const h of data.harbours) if (r.harbours[h.id]) {
      const { site, pier, ...rest } = r.harbours[h.id];
      Object.assign(h, rest);
      if (pier === null) { delete h.pier; h.harbourSite = `${site} (${h.zone} placements.json: quay, walkable piers, berth)`; } else h.pier = pier;
    }
    data.sailings.forEach((s, i) => { if (r.sailings[i].path) s.path = r.sailings[i].path; });
    writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n');
    console.log('wrote', FILE);
  }
}
