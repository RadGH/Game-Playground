// Oathwild — draw a town plan from above (pure Node): ground by height + biome, streets, pads, houses (door marked),
// yards, fences, terrace walls, props, people's spots and the villagers' routes. Same planner the game runs.
//
//   node prototypes/oathwild/tools/town-preview.mjs [--town larkford] [--out path.png] [--px 4] [--text]
// Default output: test-results/oathwild-town/<town>.png (north at the top).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createTerrain, BIOME_COLOUR } from '../js/world/terrain.js';
import { planTowns, boxCorners } from '../js/world/town.js';
import { encodePng } from '../../thousandvale/tools/lib/png.mjs';

const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const town = arg('--town', 'larkford'), PX = +arg('--px', 4);
const map = J('../data/map.json'), towns = J('../data/towns.json'), placements = J('../data/placements.json'), npcs = J('../data/npcs.json').npcs;
const T = createTerrain(map);
const t0 = performance.now();
const P = planTowns(T, towns, { placements, npcs });
const ms = performance.now() - t0;
const place = T.places[town], R = (towns[town]?.radius || place.radius) + 14;
const [cx, cz] = place.at, W = Math.round(R * 2 * PX), H = W;
const img = new Uint8Array(W * H * 4);
const toPx = (x, z) => [Math.round((x - cx + R) * PX), Math.round((z - cz + R) * PX)];
const put = (i, k, c, a = 1) => { if (i < 0 || k < 0 || i >= W || k >= H) return; const o = (k * W + i) * 4; for (let j = 0; j < 3; j++) img[o + j] = img[o + j] * (1 - a) + c[j] * a; img[o + 3] = 255; };
let lo = Infinity, hi = -Infinity;
for (let k = 0; k < H; k++) for (let i = 0; i < W; i++) { const y = T.heightAt(cx - R + i / PX, cz - R + k / PX); lo = Math.min(lo, y); hi = Math.max(hi, y); }
for (let k = 0; k < H; k++) for (let i = 0; i < W; i++) {
  const x = cx - R + i / PX, z = cz - R + k / PX, b = T.biomeAt(x, z), y = T.heightAt(x, z);
  const base = BIOME_COLOUR[b] || [120, 120, 120], sh = 0.75 + 0.5 * (y - lo) / ((hi - lo) || 1);
  // contour every 0.5 m
  const c = Math.abs(((y * 2) % 1 + 1) % 1 - 0.5) > 0.47 ? 0.8 : 1;
  put(i, k, base.map(v => Math.min(255, v * sh * c)));
}
const line = (a, b, col, w = 1) => { const [x0, y0] = toPx(...a), [x1, y1] = toPx(...b), n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let s = 0; s <= n; s++) { const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n; for (let dx = -w + 1; dx < w; dx++) for (let dy = -w + 1; dy < w; dy++) put(Math.round(x + dx), Math.round(y + dy), col); } };
const fillBox = (b, col, a = 1) => { const cs = boxCorners(b).map(p => toPx(...p)); const xs = cs.map(p => p[0]), ys = cs.map(p => p[1]); for (let y = Math.min(...ys); y <= Math.max(...ys); y++) for (let x = Math.min(...xs); x <= Math.max(...xs); x++) { let inside = true; for (let e = 0; e < 4; e++) { const p = cs[e], q = cs[(e + 1) % 4]; if ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) < 0) { inside = false; break; } } if (inside) put(x, y, col, a); } for (let e = 0; e < 4; e++) line([0, 0], [0, 0], col); };
const ROOF = [[168, 72, 58], [80, 92, 110], [120, 84, 52], [176, 150, 90]];
for (const y of P.yards) if (Math.hypot(y.at[0] - cx, y.at[1] - cz) < R) fillBox({ x: y.at[0], z: y.at[1], hw: y.w / 2, hd: y.d / 2, facing: y.facing }, [110, 150, 80], 0.45);
for (const h of P.houses) if (h.town === town) { fillBox({ x: h.at[0], z: h.at[1], hw: h.w / 2, hd: h.d / 2, facing: h.facing }, ROOF[h.roof % 4].map(v => v * (0.75 + h.storeys * 0.12))); const [dx, dy] = toPx(...h.door.at); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) put(dx + a, dy + b, [255, 240, 120]); }
for (const b of placements.buildings) if (Math.hypot(b.at[0] - cx, b.at[1] - cz) < R) fillBox({ x: b.at[0], z: b.at[1], hw: b.footprint / 2 * 0.75, hd: b.footprint / 2 * 0.75, facing: b.facing }, [70, 40, 90]);
for (const f of P.fences) line(f.a, f.b, f.kind === 'hedge' ? [40, 90, 40] : f.kind === 'stone' ? [150, 150, 150] : [110, 80, 50]);
for (const w of P.walls) line(w.a, w.b, [60, 60, 70], 2);
for (const p of P.props) { const [x, y] = toPx(...p.at); const c = p.lamp ? [255, 220, 60] : p.kind === 'fountain' ? [80, 160, 230] : [200, 120, 60]; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) put(x + a, y + b, c); }
for (const v of P.villagers.filter(v => v.town === town)) for (let i = 1; i < v.route.length; i++) line([v.route[i - 1].x, v.route[i - 1].z], [v.route[i].x, v.route[i].z], [255, 255, 255]);
for (const [id, s] of Object.entries(P.spots)) { const [x, y] = toPx(...s.at); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) put(x + a, y + b, [230, 40, 200]); }
const out = arg('--out', new URL(`../../../test-results/oathwild-town/${town}.png`, import.meta.url).pathname);
mkdirSync(new URL('.', 'file://' + out).pathname, { recursive: true });
writeFileSync(out, encodePng(W, H, img));
const mineH = P.houses.filter(h => h.town === town);
console.log(`${town}: ${mineH.length} houses (${mineH.filter(h => h.shop).length} shops, storeys ${[1, 2, 3].map(s => mineH.filter(h => h.storeys === s).length).join('/')}), ${P.yards.length} yards, ${P.fences.length} fence runs, ${P.walls.length} terrace walls, ${P.props.length} props, ${P.villagers.length} villagers, graph ${P.graph.nodes.length} nodes / ${P.graph.edges.length} edges; planned in ${Math.round(ms)} ms; height ${lo.toFixed(1)}-${hi.toFixed(1)} m → ${out}`);
