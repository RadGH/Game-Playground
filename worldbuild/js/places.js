// World Build — stage 4, Places: towns, shrines, camps, dungeons and landmarks put where the rules say they belong, then
// the ground under each levelled (terrain.js step 3: a disc eased flat, keeping `relief` of the land's own rise and fall).
// Pure and seeded.
//
// Rules (each place kind scores every 24 m spot in its region; the best spot that keeps its distances wins):
//   town      flat enough for its radius, 40-180 m from fresh water (or the sea for a harbour), dry, away from the
//             edge; the region's first town sits near where you come in. 330 m from any other town.
//   shrine    the first near where you come in (next to a town if there is one), the others in the far half.
//   camp      the far 70% of the region, 180 m from towns, 120 m from shrines and other camps.
//   dungeon   the far half, cut into a slope (the ground climbs behind the door), 300 m from towns.
//   landmark  by kind: a peak's summit, the thick of a wood, open moor, a named lake's shore, a sea cliff…
// Nothing goes on water, in the pinned piece or its seam, or within 60 m of the world's edge.
//
//   placeWorld(W)  adds W.places { id: { id, name, kind, type, region, at, radius, flat, relief, levels, y } }
//                  (the pinned piece's places are copied in unchanged) and W.placeOrder (generated ids)

import { rngFor, clamp, smoothstep, lerp, gridSample, gridBox, r2 } from './core.js';
import { THEMES, LANDMARKS, TOWN_SIZE } from './themes.js';

const KIND_SIZE = { shrine: { radius: 6, flat: 12 }, camp: { radius: 22, flat: 22 }, dungeon: { radius: 16, flat: 16 }, landmark: { radius: 16, flat: 16 } };
const SPACING = { town: { town: 330, shrine: 70, camp: 180, dungeon: 300, landmark: 80 }, shrine: { town: 70, shrine: 250, camp: 120, dungeon: 120, landmark: 60 },
  camp: { town: 180, shrine: 120, camp: 140, dungeon: 140, landmark: 80 }, dungeon: { town: 300, shrine: 120, camp: 140, dungeon: 220, landmark: 80 },
  landmark: { town: 80, shrine: 60, camp: 80, dungeon: 80, landmark: 160 } };

export function placeWorld(W) {
  const { brief, macro: M, pin } = W;
  const g = { minX: W.bounds.minX, minZ: W.bounds.minZ, cell: W.cell, nx: W.nx, nz: W.nz, data: W.H };
  const hAt = (x, z) => gridSample(g, x, z);
  const mj = (x, z) => clamp(Math.round((z - M.minZ) / M.cell), 0, M.nz - 1) * M.nx + clamp(Math.round((x - M.minX) / M.cell), 0, M.nx - 1);
  const waterAt = (x, z) => { const i = clamp(Math.round((x - g.minX) / g.cell), 0, g.nx - 1), k = clamp(Math.round((z - g.minZ) / g.cell), 0, g.nz - 1); const w = W.water[k * g.nx + i]; return Number.isNaN(w) ? -Infinity : w - hAt(x, z); };
  const slopeAt = (x, z) => { const e = 2; return Math.atan(Math.hypot(hAt(x + e, z) - hAt(x - e, z), hAt(x, z + e) - hAt(x, z - e)) / (2 * e)) * 57.3; };
  // the spread of heights over a disc (max - min) and whether any of it is wet
  const disc = (x, z, r) => {
    let lo = Infinity, hi = -Infinity, wet = false;
    for (let a = 0; a < 12; a++) for (const rr of [0, 0.5, 1]) {
      const px = x + Math.cos(a * 0.5236) * r * rr, pz = z + Math.sin(a * 0.5236) * r * rr;
      const h = hAt(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (waterAt(px, pz) > -0.4) wet = true;
    }
    return { range: hi - lo, wet, lo, hi };
  };
  const edge = 60 + W.bounds.margin;
  const okSpot = (x, z) => x > W.bounds.minX + edge && x < W.bounds.maxX - edge && z > W.bounds.minZ + edge && z < W.bounds.maxZ - edge && (!pin || pin.keepDist(x, z) > 70);

  // spots a path can get to (slopes under ~27 degrees between 8 m cells, rivers bridged later, lakes and sea not),
  // from the start and from every gate out of the pinned piece: a place anywhere else could never be reached
  const reach = reachMask(W);

  const places = {};
  if (pin) for (const [id, p] of Object.entries(pin.lists.places)) places[id] = { ...p, id, y: r2(hAt(...p.at)) };
  const taken = Object.values(places).map(p => ({ at: p.at, kind: p.kind === 'pass' || p.kind === 'lair' ? 'landmark' : p.kind }));
  const usedNames = new Set(Object.values(places).map(p => p.name));
  const order = [];
  const unplaced = [];
  let relax = 1;
  // (the eased second pick also lets places stand a little closer together)
  const far = (x, z, kind) => taken.every(t => Math.hypot(t.at[0] - x, t.at[1] - z) >= (SPACING[kind][t.kind] ?? 80) / (relax > 2 ? 2 : relax > 1 ? 1.5 : 1));
  const slug = s => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  // a second "Raider Camp" is named after the nearest town of its own region ("Harrowby Raider Camp"), then numbered
  const unique = (name, near, region) => {
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    const town = near ? nearestTown(near, region) : null;
    let alt = town ? `${town.name} ${name.replace(/^the /, '')}` : name;
    const base = name.replace(/^the /, '');
    const WORDS = ['East', 'West', 'North', 'South', 'Upper', 'Lower', 'Old', 'Far'];
    for (let n = 0; usedNames.has(alt); n++) alt = n < WORDS.length ? `${WORDS[n]} ${base}` : `${base} ${n}`;
    usedNames.add(alt); return alt;
  };
  const nearestTown = (at, region) => Object.values(places).filter(p => p.kind === 'town' && (!region || p.region === region)).sort((a, b) => Math.hypot(a.at[0] - at[0], a.at[1] - at[1]) - Math.hypot(b.at[0] - at[0], b.at[1] - at[1]))[0] || null;

  for (const [ri, R] of W.regionList.entries()) {
    if (R.pinned) continue;
    const b = R.brief, th = THEMES[b.theme];
    const rng = rngFor(W.seed, 'places:' + b.id);
    // the region's spots, with travel share t (0 = where you come in, 1 = the far end)
    const spots = [];
    for (let z = W.bounds.minZ + edge; z < W.bounds.maxZ - edge; z += 24) for (let x = W.bounds.minX + edge; x < W.bounds.maxX - edge; x += 24) {
      const j = mj(x, z);
      if (M.region[j] !== ri || M.sea[j] || M.lake[j] >= 0 || M.river[j] || !reach[j] || !okSpot(x, z)) continue;
      const t = M.share[j];
      const jx = x + (rng() - 0.5) * 12, jz = z + (rng() - 0.5) * 12;
      spots.push({ x: jx, z: jz, t, j, wd: M.waterDist[j], h: hAt(jx, jz) });
    }
    if (!spots.length) { for (const w of [...b.towns, ...b.shrines, ...b.camps, ...b.dungeons, ...b.landmarks]) unplaced.push({ region: b.id, regionName: b.name, kind: w.kind, type: w.type || w.size || w.kind, name: w.name || null }); continue; }
    const add = (kind, type, wish, best, size) => {
      const name = unique(wish.name || makeName(kind, type, th, rng, wish), [best.x, best.z], b.id);
      let id = slug(name); while (places[id]) id += '_2';
      const lv = M.level[mj(best.x, best.z)];
      const band = [Math.max(1, lv - 1), lv + 1];          // (near a border the level may sit under the region's band: regions.js)
      places[id] = { id, name, kind, type, region: b.id, at: [r2(best.x), r2(best.z)], radius: size.radius, flat: size.flat, relief: size.relief ?? 0, levels: band, theme: b.theme, ...(wish.size ? { size: wish.size } : {}) };
      taken.push({ at: [best.x, best.z], kind });
      order.push(id);
      return places[id];
    };
    // the best spot by the rules; if none passes, the rules are eased once (flatness x1.6, broader tops allowed, places a
    // little closer, camps and dungeons nearer the way in) — and a wish that still finds no spot is listed in the report
    // (never dropped without a word)
    const pick = (kind, score, size, tries = spots) => {
      for (relax of [1, 1.6, 2.4]) {
        let best = null, bs = -Infinity;
        for (const s of tries) {
          if (!far(s.x, s.z, kind)) continue;
          const v = score(s);
          if (v > bs) { bs = v; best = s; }
        }
        if (best && bs > -1e8) { relax = 1; return best; }
      }
      relax = 1;
      return null;
    };
    const missed = (kind, wish) => unplaced.push({ region: b.id, regionName: b.name, kind, type: wish.type || wish.size || kind, name: wish.name || null });
    const flatScore = (s, r, max) => { const d = disc(s.x, s.z, r); max *= relax; return d.wet ? -1e9 : d.range > max ? -1e9 : -d.range / max; };

    // towns, biggest first; the first near the way in
    b.towns.forEach((wish, n) => {
      const size = TOWN_SIZE[wish.size];
      const best = pick('town', s => {
        if (s.h > (th.snowline || 1e9) - 30 || slopeAt(s.x, s.z) > 14 * relax) return -1e9;
        const f = flatScore(s, size.radius, size.radius * 0.3); if (f < -1e8) return f;
        let w;
        if (wish.by === 'sea') { const sd = seaDist(W, s.x, s.z); w = sd < 50 || sd > 220 ? -2 : 1 - Math.abs(sd - 110) / 110; }
        else w = !Number.isFinite(s.wd) || s.wd > 260 ? -1.5 : s.wd < 40 ? -1 : 1 - Math.abs(s.wd - 100) / 160;
        const tw = n === 0 ? 1 - s.t * 1.6 : 1 - Math.abs(s.t - 0.55) * 1.4;
        return f * 2 + w * 1.5 + tw * 1.4 + rng() * 0.3;
      }, size);
      if (best) add('town', wish.size, wish, best, size); else missed('town', wish);
    });
    // shrines
    b.shrines.forEach((wish, n) => {
      const size = KIND_SIZE.shrine;
      const best = pick('shrine', s => {
        const f = flatScore(s, 10, 3); if (f < -1e8) return f;
        if (n === 0) { const town = nearestTown([s.x, s.z]); const td = town && town.region === b.id ? Math.hypot(town.at[0] - s.x, town.at[1] - s.z) : 1e4; return f + (1 - s.t * 2) + (td > town?.radius + 20 && td < 160 ? 1 : 0) + rng() * 0.2; }
        return f + s.t * 1.5 + rng() * 0.4;
      }, size);
      if (best) add('shrine', 'shrine', wish, best, size); else missed('shrine', wish);
    });
    // camps
    b.camps.forEach((wish, n) => {
      const size = KIND_SIZE.camp, type = wish.type || th.camps[n % th.camps.length];
      const best = pick('camp', s => {
        if (s.t < 0.25 / relax) return -1e9;
        const f = flatScore(s, size.radius, 7); if (f < -1e8) return f;
        return f + s.t * 0.8 + gridForest(W, s) * 0.6 + rng() * 0.8;
      }, size);
      if (best) add('camp', type, wish, best, size); else missed('camp', wish);
    });
    // dungeons: a level door pad with the hill rising behind it
    b.dungeons.forEach((wish, n) => {
      const size = KIND_SIZE.dungeon, type = wish.type || th.dungeons[n % th.dungeons.length];
      const best = pick('dungeon', s => {
        if (s.t < 0.45 / relax) return -1e9;
        const f = flatScore(s, 12, 5); if (f < -1e8) return f;
        let climb = 0;
        for (let a = 0; a < 8; a++) climb = Math.max(climb, hAt(s.x + Math.cos(a * 0.785) * 40, s.z + Math.sin(a * 0.785) * 40) - s.h);
        return f + clamp(climb / 18, 0, 1.4) + s.t + rng() * 0.4;
      }, size);
      if (best) add('dungeon', type, wish, best, size); else missed('dungeon', wish);
    });
    // landmarks
    for (const wish of b.landmarks) {
      const L = LANDMARKS[wish.type], size = { radius: L.radius, flat: L.radius, relief: 0.4 };
      const lake = wish.near ? W.lakes.find(l => l.id === wish.near) : null;
      const best = pick('landmark', s => {
        const sl = slopeAt(s.x, s.z);
        if (sl > 24) return -1e9;
        const f = flatScore(s, L.radius * 0.7, 8); if (f < -1e8) return f;
        switch (L.want) {
          case 'peak': { const wide = disc(s.x, s.z, 40); return wide.range > 16 * relax * relax ? -1e9 : s.h / 40 + f; }   // a broad top a path can climb
          case 'forest': return gridForest(W, s) * 3 + f;
          case 'open': return (1 - gridForest(W, s)) * 1.5 + f + (sl < 8 ? 0.5 : 0) + rng() * 0.5;
          case 'lake': { if (!lake) return f + (Number.isFinite(s.wd) ? 1 - s.wd / 200 : -1); const d = lakeShoreDist(W, lake, s.x, s.z); return d < 25 || d > 90 ? -1e9 : 2 - d / 60 + f; }
          case 'cliff': { const sd = seaDist(W, s.x, s.z); return sd < 30 || sd > 140 ? -1e9 : s.h / 10 + f; }
          default: return f + s.t * 0.5 + rng();
        }
      }, size);
      if (best) add('landmark', wish.type, wish, best, size); else missed('landmark', wish);
    }
  }

  // ---------------------------------------------------------------- level the ground under the new places (terrain.js step 3)
  for (const id of order) {
    const p = places[id];
    const c = hAt(p.at[0], p.at[1]);
    const relief = p.relief || 0;
    gridBox(g, p.at[0], p.at[1], p.flat, (i, k, x, z, j) => {
      if (W.keep[j] || W.wkind[j] === 1 || W.wkind[j] === 3) return;      // never fill a river or a lake
      const d = Math.hypot(x - p.at[0], z - p.at[1]);
      const w = 1 - smoothstep(p.flat * 0.6, p.flat, d);
      if (w <= 0) return;
      W.H[j] = lerp(W.H[j], c + (W.H[j] - c) * relief, w);
    });
  }
  for (const p of Object.values(places)) p.y = r2(hAt(p.at[0], p.at[1]));
  W.places = places;
  W.placeOrder = order;
  W.unplaced = unplaced;
  return W;
}

/** Coarse walk flood: which 8 m cells a path could reach from the start or a gate (before roads are cut). */
function reachMask(W) {
  const M = W.macro, { nx, nz, cell } = M, N = nx * nz;
  const seen = new Uint8Array(N), q = [];
  const cellOf = (x, z) => clamp(Math.round((z - M.minZ) / cell), 0, nz - 1) * nx + clamp(Math.round((x - M.minX) / cell), 0, nx - 1);
  const seeds = [W.startAt, ...(W.pin ? W.pin.gates.map(g => g.edge) : [])];
  for (const s of seeds) { const j = cellOf(s[0], s[1]); if (!seen[j]) { seen[j] = 1; q.push(j); } }
  // ~27 degrees between 8 m cells: ground a path at 20% can still wind up (steeper is cliff and scree)
  const rise = Math.tan(27 * Math.PI / 180) * cell;
  for (let p = 0; p < q.length; p++) {
    const j = q[p], i = j % nx, k = (j - i) / nx;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, kk = k + dk;
      if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
      const jj = kk * nx + ii;
      if (seen[jj] || M.sea[jj] || M.lake[jj] >= 0) continue;
      // inside the kept piece the walk is the game's own business; outside, steep steps stop it
      if (!M.keep[jj] && !M.keep[j] && Math.abs(M.H[jj] - M.H[j]) > rise) continue;
      seen[jj] = 1; q.push(jj);
    }
  }
  return seen;
}

function makeName(kind, type, th, rng, wish) {
  const n = th.names;
  if (kind === 'town') return n.town[Math.floor(rng() * n.town.length)] + n.townEnd[Math.floor(rng() * n.townEnd.length)];
  if (kind === 'camp') return n.camp[Math.floor(rng() * n.camp.length)];
  if (kind === 'dungeon') return n.dungeon[Math.floor(rng() * n.dungeon.length)];
  if (kind === 'shrine') return n.shrine[Math.floor(rng() * n.shrine.length)];
  const L = LANDMARKS[wish.type || type];
  return L.name[Math.floor(rng() * L.name.length)];
}
function gridForest(W, s) { return W.macro.forest[s.j] || 0; }
function seaDist(W, x, z) {
  const M = W.macro;
  if (!W.brief.sea.edges.length) return Infinity;
  let best = Infinity;
  const R = 30;
  const i0 = Math.round((x - M.minX) / M.cell), k0 = Math.round((z - M.minZ) / M.cell);
  for (let dk = -R; dk <= R; dk += 2) for (let di = -R; di <= R; di += 2) {
    const i = i0 + di, k = k0 + dk;
    if (i < 0 || k < 0 || i >= M.nx || k >= M.nz) continue;
    if (M.sea[k * M.nx + i]) best = Math.min(best, Math.hypot(di, dk) * M.cell);
  }
  return best;
}
function lakeShoreDist(W, lake, x, z) {
  const M = W.macro, n = W.lakes.indexOf(lake);
  let best = Infinity;
  const R = 14, i0 = Math.round((x - M.minX) / M.cell), k0 = Math.round((z - M.minZ) / M.cell);
  for (let dk = -R; dk <= R; dk++) for (let di = -R; di <= R; di++) {
    const i = i0 + di, k = k0 + dk;
    if (i < 0 || k < 0 || i >= M.nx || k >= M.nz) continue;
    if (M.lake[k * M.nx + i] === n) best = Math.min(best, Math.hypot(di, dk) * M.cell);
  }
  return best;
}
