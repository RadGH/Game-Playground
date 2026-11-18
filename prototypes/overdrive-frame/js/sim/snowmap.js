// The snowfield (round 6, "Frostline"): a research and radar station on a plateau in the mountains north of the city.
// Not a street grid. Same output as makeCityMap (lots, roads, plazas, start, extract, edges) so the mission, the flow
// field, the mirror and the briefing map need nothing new — plus `zones` (named spots missions can use) and `snow`
// for the ground drawing.
//
//   roads    the ploughed road: in from the west, up to the north edge, a spur east past the station, one up from
//            the south (2 tiles wide; enemies come in along it, like streets in the city)
//   station  the compound on its plateau: a 3×3 grid of 4-tile cells round an open yard (radar domes, labs on
//            stilts, generator sheds, fuel tanks that blow up). The yard is zone 'station'
//   lake     the frozen lake: open ice you walk on — and slide on (iceAt / ICE_GRIP below; the ground flag is the drawn
//            shoreline itself, a few circles). An icebreaker sits frozen
//            in it. Zone 'lake'
//   lift     the ski lift: two end stations and a line of pylons east–west; a 5-tile corridor under the cable stays open
//   dish     the frozen relay dish, far from the drop. Zone 'dish'
//   cover    ice ridges in broken lines, avalanche fences, stands of snowy pine
//
// Lanes: every building except trees keeps 2 clear tiles to any other building (a frame is ~0.4 tiles wide, so two
// can pass); pines in a stand keep 1. Lots never touch, even corner to corner, so no open ground is ever sealed off.
// Seeded and pure: the co-op server and every player build the identical snowfield from the same seed.
import { makeRng } from './rng.js';

/** Share of normal grip on the lake's ice (sim/mech.js: a frame speeds up and stops this much slower). */
export const ICE_GRIP = 0.3;

const SPEC = {
  'snow-pines': { size: [2, 2], h: 1.0, hp: 900, tree: true },
  'snow-spruce': { size: [1, 1], h: 0.9, hp: 450, tree: true },
  'snow-ridge': { size: [2, 1], h: 0.45, hp: 1800 },
  'snow-radar': { size: [2, 2], h: 1.25 },
  'snow-lab': { size: [2, 1], floors: [1, 2] },
  'snow-generator': { size: [1, 1], h: 0.5, hp: 700 },
  'snow-fuel': { size: [1, 1], h: 0.4, hp: 500, explosive: 1100 },
  'snow-pylon': { size: [1, 1], h: 1.45, hp: 700 },
  'snow-lift': { size: [2, 2], h: 0.85 },
  'snow-fence': { size: [2, 1], h: 0.4, hp: 600 },
  'snow-dish': { size: [2, 2], h: 1.3, hp: 1400 },
  'snow-icebreaker': { size: [3, 2], h: 0.75, hp: 3200 },
};
/** The snowfield's entry in citymap.js DISTRICTS. */
export const SNOW_DISTRICT = { label: 'Snowfield', snow: true, street: 2, lots: Object.entries(SPEC).map(([recipe, s]) => ({ recipe, ...s })) };

const STYLES = ['chrome', 'pearl', 'copper', 'concrete'];

/** @returns the same shape as makeCityMap, district 'snow', plus `zones: { station, lake, dish }` and
 *  `snow: { lake: [{x,z,r}…], station: {x,z,w,d}, lift: {z, x0, x1, pylons, h}, trails, pads }`. */
export function makeSnowMap({ seed, w = 44, h = 44 }) {
  const R = makeRng(seed * 37 + 11);
  const occ = new Uint8Array(w * h);            // 0 free snow, 1 road, 2 building, 3 kept open, 4 lake ice, 5 lift corridor
  const kind = new Uint8Array(w * h);           // 0 none, 1 tree, 2 any other building (for the lane rule)
  const inb = (x, z) => x >= 0 && z >= 0 && x < w && z < h;
  const set = (x, z, v) => { if (inb(x, z)) occ[z * w + x] = v; };
  const roads = [], plazas = [], lots = [];

  // ---- the drop pad and the extraction pad stay open (same corners as the city, so briefings read the same)
  const start = { x: 4.5, z: h - 4.5 }, extract = { x: w - 4.5, z: 4.5, r: 1.6 };
  const openArea = (cx, cz, r) => { plazas.push([cx - r, cz - r, r * 2, r * 2]); for (let z = cz - r; z < cz + r; z++) for (let x = cx - r; x < cx + r; x++) if (inb(x, z) && occ[z * w + x] !== 1) set(x, z, 3); };

  // ---- the ploughed road
  const xB = Math.round(w * R.range(0.5, 0.58)), zA = Math.round(h * R.range(0.54, 0.62));
  const zE = Math.round(h * R.range(0.26, 0.33)), xC = Math.round(w * R.range(0.24, 0.32));
  const road = (x, z, rw, rd) => { roads.push([x, z, rw, rd]); for (let j = z; j < z + rd; j++) for (let i = x; i < x + rw; i++) set(i, j, 1); };
  road(0, zA, xB + 2, 2);            // in from the west
  road(xB, 0, 2, zA + 2);            // up to the north edge
  road(xB + 2, zE, w - xB - 2, 2);   // the spur east, past the station
  road(xC, zA + 2, 2, h - zA - 2);   // up from the south
  openArea(4, h - 5, 3); openArea(w - 5, 4, 3);
  const pads = [{ x: start.x, z: start.z, r: 2.4 }, { x: extract.x, z: extract.z, r: 2.2 }];

  // ---- trails: two more ways in on foot (kept open, footprints drawn on them)
  const trails = [];
  const trail = (x, z, tw, td) => { trails.push([x, z, tw, td]); plazas.push([x, z, tw, td]); for (let j = z; j < z + td; j++) for (let i = x; i < x + tw; i++) if (inb(i, j) && !occ[j * w + i]) set(i, j, 3); };
  const tS = Math.round(w * R.range(0.68, 0.8)), tW = Math.round(h * R.range(0.08, 0.16));
  trail(tS, h - 6, 2, 6); trail(0, tW, 6, 2);

  // ---- placing a building: inside the map, on free snow (or `on` ground), the lane rule against every other lot
  const fits = (x, z, sw, sd, { tree = false, on = 0, gap = null } = {}) => {
    for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) if (!inb(i, j) || occ[j * w + i] !== on) return false;
    const g2 = gap ?? 2;
    for (let j = z - g2; j < z + sd + g2; j++) for (let i = x - g2; i < x + sw + g2; i++) {
      if (!inb(i, j)) continue;
      const k = kind[j * w + i]; if (!k) continue;
      const near = i >= x - 1 && i < x + sw + 1 && j >= z - 1 && j < z + sd + 1;
      if (tree && k === 1 && !near) continue;          // trees keep 1 tile from trees, 2 from anything else
      return false;
    }
    return true;
  };
  const place = (recipe, x, z, sw, sd, { turn = false, floors = null, on = 0 } = {}) => {
    const c = SPEC[recipe], fl = floors ?? (c.floors ? R.int(c.floors[0], c.floors[1]) : 1);
    const height = c.h ?? +(0.3 + 0.39 * fl).toFixed(3);
    const hp = c.hp ?? Math.round(500 * sw * sd * (1 + fl * 0.18));
    const lot = { id: 'L' + lots.length, x, z, w: sw, d: sd, h: height, hp, recipe, params: { floors: fl, seed: R.int(1, 9999), rot: turn ? 1 : 0, style: STYLES[R.int(0, 3)] }, explosive: c.explosive || 0 };
    lots.push(lot);
    for (let j = z; j < z + sd; j++) for (let i = x; i < x + sw; i++) { kind[j * w + i] = c.tree ? 1 : 2; if (occ[j * w + i] !== 4) set(i, j, 2); }
    return lot;
  };
  const sized = (recipe, turn) => { const [a, b] = SPEC[recipe].size; return turn ? [b, a] : [a, b]; };

  // ---- the frozen lake: in the quarter between the west road and the north road, away from the drop
  const lakeR = Math.min(5.6, (Math.min(xB, zA) - 4) / 2.2);
  const lc = { x: +(xB * R.range(0.4, 0.48)).toFixed(2), z: +(zA * R.range(0.4, 0.48)).toFixed(2) };
  const blobs = [{ x: lc.x, z: lc.z, r: +lakeR.toFixed(2) }];
  for (let k = 0; k < 2; k++) {
    const a = R.range(0, Math.PI * 2), r = lakeR * R.range(0.5, 0.65), d = lakeR * R.range(0.55, 0.75);
    const b = { x: +(lc.x + Math.cos(a) * d).toFixed(2), z: +(lc.z + Math.sin(a) * d).toFixed(2), r: +r.toFixed(2) };
    if (b.x - b.r > 1.5 && b.z - b.r > 1.5 && b.x + b.r < xB - 2.5 && b.z + b.r < zA - 2.5) blobs.push(b);
  }
  const onLake = (px, pz) => blobs.some(b => Math.hypot(px - b.x, pz - b.z) <= b.r);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) if (onLake(x + 0.5, z + 0.5) && occ[z * w + x] !== 1) set(x, z, 4);
  // the icebreaker frozen in it, off centre, with ice all round
  let ship = null;
  for (let t = 0; t < 30 && !ship; t++) {
    const turn = R.chance(0.5), [sw, sd] = sized('snow-icebreaker', turn);
    const x = Math.round(lc.x - sw / 2 + R.range(-1.5, 1.5)), z = Math.round(lc.z - sd / 2 + R.range(-1.5, 1.5));
    let ice = true; for (let j = z - 2; j < z + sd + 2 && ice; j++) for (let i = x - 2; i < x + sw + 2; i++) if (!inb(i, j) || occ[j * w + i] !== 4) { ice = false; break; }
    if (ice) ship = place('snow-icebreaker', x, z, sw, sd, { turn, on: 4 });
  }

  // ---- the ski lift: east–west across the south half, from the valley near the drop up toward the station
  const zL = Math.min(h - 10, zA + 4 + R.int(0, 2));
  const lift = { z: zL + 0.5, x0: 0, x1: 0, pylons: [], h: 1.32, stations: [] };
  for (let x = 1; x < w - 1; x++) for (let j = zL - 2; j <= zL + 2; j++) if (inb(x, j) && occ[j * w + x] === 0) set(x, j, 5);
  const station2 = (x) => { for (let j = zL - 2; j <= zL + 2; j++) for (let i = x; i < x + 2; i++) if (occ[j * w + i] === 5) set(i, j, 0); const z = zL - 1 + R.int(0, 1); if (fits(x, z, 2, 2)) { place('snow-lift', x, z, 2, 2, { turn: true }); return x + 1; } return null; };
  const lowX = station2(1), highX = station2(w - 4);
  lift.x0 = (lowX ?? 1) + 0.0; lift.x1 = (highX ?? w - 2) + 0.0;
  for (let x = lift.x0 + 5; x < lift.x1 - 2; x += 5 + R.int(0, 1)) {
    let px = Math.floor(x); while (px < lift.x1 - 2 && occ[zL * w + px] === 1) px++;
    if (occ[zL * w + px] !== 5) continue;
    set(px, zL, 0); if (fits(px, zL, 1, 1)) { place('snow-pylon', px, zL, 1, 1, { turn: true }); lift.pylons.push(px + 0.5); x = px; } else set(px, zL, 5);
  }
  if (lowX != null) lift.stations.push(lowX); if (highX != null) lift.stations.push(highX);

  // ---- the station compound on its plateau, east of the north road and south of the spur
  const cells = [], sx0 = xB + 3, sz0 = zE + 3;
  const nx = Math.max(2, Math.min(3, Math.floor((w - 1 - sx0) / 4))), nz = Math.max(2, Math.min(3, Math.floor((zL - 3 - sz0) / 4)));
  const yard = { cx: Math.floor((nx - 1) / 2), cz: Math.floor((nz - 1) / 2) };
  const fill = ['snow-radar', 'snow-radar', 'snow-lab', 'snow-lab', 'snow-generator', 'snow-fuel', 'snow-fuel', 'snow-generator', 'snow-lab'];
  for (let i = fill.length - 1; i > 1; i--) { const j = 2 + Math.floor(R.next() * (i - 1)); [fill[i], fill[j]] = [fill[j], fill[i]]; }   // two radars always, the rest shuffled
  let fi = 0;
  for (let cz = 0; cz < nz; cz++) for (let cx = 0; cx < nx; cx++) {
    const x0 = sx0 + cx * 4, z0 = sz0 + cz * 4;
    if (cx === yard.cx && cz === yard.cz) { for (let j = z0; j < z0 + 4; j++) for (let i = x0; i < x0 + 4; i++) if (inb(i, j) && !occ[j * w + i]) set(i, j, 3); plazas.push([x0, z0, 4, 4]); continue; }
    const recipe = fill[fi++ % fill.length], turn = SPEC[recipe].size[0] !== SPEC[recipe].size[1] && R.chance(0.5), [sw, sd] = sized(recipe, turn);
    const x = x0 + 1 + (sw === 1 ? R.int(0, 1) : 0), z = z0 + 1 + (sd === 1 ? R.int(0, 1) : 0);
    if (fits(x, z, sw, sd)) cells.push(place(recipe, x, z, sw, sd, { turn }));
  }
  const station = { x: sx0 - 0.5, z: sz0 - 0.5, w: nx * 4 + 1, d: nz * 4 + 1 };
  const stationZone = { x: sx0 + yard.cx * 4 + 2, z: sz0 + yard.cz * 4 + 2, r: 2.6 };

  // ---- the frozen relay dish: north of the west road, between the lake and the north road, as far from the drop as fits
  let dish = null, best = -1;
  for (let z = 2; z < zA - 4; z++) for (let x = 2; x < xB - 3; x++) {
    if (!fits(x, z, 2, 2, { gap: 3 })) continue;
    const d = Math.hypot(x + 1 - start.x, z + 1 - start.z) + R.next() * 4;
    if (d > best) { best = d; dish = { x, z }; }
  }
  if (!dish) for (let t = 0; t < 400 && !dish; t++) { const x = R.int(2, w - 4), z = R.int(2, h - 4); if (fits(x, z, 2, 2)) dish = { x, z }; }
  if (dish) place('snow-dish', dish.x, dish.z, 2, 2);
  const dishZone = dish ? { x: dish.x + 1, z: dish.z + 1, r: 3.4 } : { x: w / 2, z: 4, r: 3.4 };

  // ---- cover: broken ice ridges, avalanche fences, a few fuel caches by the road
  const line = (recipe, n, step) => {
    for (let k = 0, tries = 0; k < n && tries < 60; tries++) {
      const along = R.chance(0.5), x = R.int(2, w - 8), z = R.int(2, h - 8), segs = R.int(2, 4);
      let made = 0;
      for (let s = 0; s < segs; s++) {
        const turn = !along, [sw, sd] = sized(recipe, turn);
        const px = x + (along ? s * (sw + step) : R.int(-1, 1)), pz = z + (along ? R.int(-1, 1) : s * (sd + step));
        if (fits(px, pz, sw, sd)) { place(recipe, px, pz, sw, sd, { turn }); made++; }
      }
      if (made) k++;
    }
  };
  line('snow-ridge', Math.round(w * h / 420), 2);
  line('snow-fence', Math.round(w * h / 640), 2);
  for (let k = 0, t = 0; k < 2 && t < 200; t++) {             // fuel caches: a tank pair at the side of the road
    const [rx, rz, rw, rd] = roads[R.int(0, roads.length - 1)];
    const x = rw > rd ? R.int(rx + 2, rx + rw - 3) : (R.chance(0.5) ? rx - 2 : rx + rw + 1), z = rw > rd ? (R.chance(0.5) ? rz - 2 : rz + rd + 1) : R.int(rz + 2, rz + rd - 3);
    if (fits(x, z, 1, 1)) { place('snow-fuel', x, z, 1, 1); k++; }
  }

  // ---- pine stands: clumps of snowy spruce (trees keep 1 tile apart, 2 from everything else)
  const stands = Math.round(w * h / 110);
  for (let k = 0; k < stands; k++) {
    const cx = R.range(2, w - 2), cz = R.range(2, h - 2), r = R.range(2.4, 4.4);
    if (Math.hypot(cx - start.x, cz - start.z) < r + 4 || Math.hypot(cx - extract.x, cz - extract.z) < r + 4) continue;
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) > r || !R.chance(0.75)) continue;
      const big = R.chance(0.45);
      if (big && fits(x, z, 2, 2, { tree: true })) place('snow-pines', x, z, 2, 2);
      else if (fits(x, z, 1, 1, { tree: true })) place('snow-spruce', x, z, 1, 1);
    }
  }
  // lone spruce dotted over the open snow
  for (let k = 0, n = Math.round(w * h / 55); k < n; k++) { const x = R.int(1, w - 2), z = R.int(1, h - 2); if (fits(x, z, 1, 1, { tree: true })) place('snow-spruce', x, z, 1, 1); }

  // ---- every open area reaches the road: a 2-wide lane from each pad to the nearest road (anything in it is removed)
  const xs = [xB, xC], zs = [zA, zE];
  const carve = (cx, cz) => {
    let b = null;
    for (const x of xs) { const d = Math.abs(x + 1 - cx); if (!b || d < b.d) b = { d, axis: 'x', at: x + 1 }; }
    for (const z of zs) { const d = Math.abs(z + 1 - cz); if (!b || d < b.d) b = { d, axis: 'z', at: z + 1 }; }
    const lane = b.axis === 'x' ? [Math.floor(Math.min(cx, b.at)) - 1, Math.floor(cz) - 1, Math.ceil(Math.abs(b.at - cx)) + 2, 2] : [Math.floor(cx) - 1, Math.floor(Math.min(cz, b.at)) - 1, 2, Math.ceil(Math.abs(b.at - cz)) + 2];
    const hit = l => l.x < lane[0] + lane[2] && l.x + l.w > lane[0] && l.z < lane[1] + lane[3] && l.z + l.d > lane[1];
    for (let i = lots.length - 1; i >= 0; i--) if (hit(lots[i]) && lots[i].recipe !== 'snow-icebreaker') lots.splice(i, 1);
    plazas.push(lane); trails.push(lane);
  };
  carve(start.x, start.z); carve(extract.x, extract.z);

  // ---- nothing sealed in: a building with no open ground next to it that the drop pad can walk to is left out
  const solid = new Uint8Array(w * h); for (const l of lots) for (let j = l.z; j < l.z + l.d; j++) for (let i = l.x; i < l.x + l.w; i++) solid[j * w + i] = 1;
  const seen = new Uint8Array(w * h), q = [Math.floor(start.z) * w + Math.floor(start.x)]; seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), x = c % w, z = (c / w) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ix = x + dx, iz = z + dz, n = iz * w + ix; if (inb(ix, iz) && !solid[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
  const reachable = l => { for (let j = l.z - 1; j <= l.z + l.d; j++) for (let i = l.x - 1; i <= l.x + l.w; i++) if (inb(i, j) && seen[j * w + i]) return true; return false; };
  for (let i = lots.length - 1; i >= 0; i--) if (!reachable(lots[i])) lots.splice(i, 1);
  lots.forEach((l, i) => { l.id = 'L' + i; });
  lift.pylons = lots.filter(l => l.recipe === 'snow-pylon').map(l => l.x + 0.5);

  // ---- spawn edges: the road's ends and the two trails on the map border
  const edges = [{ x: 0.5, z: zA + 1 }, { x: xB + 1, z: 0.5 }, { x: w - 0.5, z: zE + 1 }, { x: xC + 1, z: h - 0.5 }, { x: tS + 1, z: h - 0.5 }, { x: 0.5, z: tW + 1 }];
  const zones = { station: stationZone, lake: { x: lc.x, z: lc.z, r: +(lakeR * 0.92).toFixed(2) }, dish: dishZone };
  return { w, h, lots, roads, plazas, start, extract, edges, district: 'snow', seed, zones,
    snow: { lake: blobs, station, lift, trails, pads, ship: ship ? ship.id : null } };
}

/** Is (x, z) on the lake's ice? Exactly inside the shoreline render/snow-ground.js draws (the lake's circles), so where
 *  the ice looks like it starts is where the sliding starts. */
export function iceAt(map, x, z) {
  const L = map?.snow?.lake; if (!L) return false;
  for (const b of L) { const dx = x - b.x, dz = z - b.z; if (dx * dx + dz * dz <= b.r * b.r) return true; }
  return false;
}
/** The grip hook for stepMech's world (sim/mech.js world.gripAt): null on any map without ice, so nothing changes there. */
export function gripFor(map) {
  if (!map?.snow) return null;
  return (x, z) => (iceAt(map, x, z) ? ICE_GRIP : 1);
}
