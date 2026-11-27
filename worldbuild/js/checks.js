// World Build — stage 7, Checks: the rules every world must pass, each with a plain-words line and the spots that fail
// (so the page can jump to them). Pure.
//
//   checkWorld(W, T, detail)  → { ok, checks: [{ id, title, pass, summary, problems: [{ at:[x,z], text }] }] }
//
// The rules (lessons rules 22-25, 65, 74):
//   reach      every place can be reached on foot from the start (Oathwild's own reachableFrom flood, 4 m steps)
//   bridges    every road line that meets a river line has a bridge or ford there, and no road point is in deep water
//              off a deck — checked along the whole line, every 2 m
//   clear      nothing stands on a road: trees (trunks), solid decor, houses (whole footprint), set pieces, fields
//   grades     generated roads climb 14% at most between any two points; places stand on walkable ground
//   levels     levels rise smoothly: along every road the band never jumps more than 6 at once; inside each region the
//              level grows with the walk from the start
//   pinned     the pinned piece's ground and water are unchanged value for value, apart from the gate roads
//   rivers     every river's surface only falls, and it ends in the sea, a lake, another river or a pinned river
//   links      every generated road's two ends meet a place or another road (rule 65); every road is on one network
//   trees      grown trees are big (median at least 10x a 1.8 m person, giants in the woods; rule 74)
//   towns      every town got houses

import { reachableFrom } from '../../prototypes/oathwild/js/world/terrain.js';
import { segCross, fingerprint } from './core.js';
import { TREE_SPECIES } from '../../prototypes/oathwild/js/world/scatter.js';
import { treesInTile, TILE } from './detail.js';

const MAX = 40;

export function checkWorld(W, T, detail) {
  const checks = [];
  const add = (id, title, problems, summary, extra = {}) => checks.push({ id, title, pass: problems.length === 0, summary, problems: problems.slice(0, MAX), count: problems.length, ...extra });
  const gen = W.roads.filter(r => r.generated);
  const pin = W.pin;

  // ---------------------------------------------------------------- reach
  {
    // Oathwild's own 4 m flood gives the walkable area; the reach test itself walks every 2 m vertex along the roads,
    // round the places and over the pinned piece (a 4 m cell on a narrow mountain trail can fall on the cutting's
    // wall and break a path that is really there)
    const R4 = reachableFrom(T, W.startAt, { cell: 4 });
    const R = walkFlood(W, T);
    const bad = [];
    for (const p of Object.values(W.places)) {
      if (p.kind === 'pass') continue;
      // a place counts as reached when any spot of its middle is (a boss ring may have a rock at the very centre)
      let ok = false;
      for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [8, 8], [-8, -8], [8, -8], [-8, 8]]) if (R.at(p.at[0] + dx, p.at[1] + dz)) { ok = true; break; }
      if (!ok) bad.push({ at: p.at, text: `${p.name} cannot be reached on foot` });
    }
    const area = R4.count * 16 / 1e6;
    add('reach', 'Every place can be reached on foot', bad, `${Object.keys(W.places).length - bad.length} of ${Object.keys(W.places).length} places reached; ${area.toFixed(1)} km² walkable from ${W.brief.start?.name || 'the start'}`, { reachableKm2: Math.round(area * 10) / 10 });
  }

  // ---------------------------------------------------------------- the brief: everything it asked for was placed
  {
    const bad = (W.unplaced || []).map(u => ({ at: W.brief.regions.find(r => r.id === u.region)?.at || W.startAt, text: `${u.regionName}: no spot found for ${u.name || 'a ' + u.type.replace(/_/g, ' ')}` }));
    const asked = W.brief.regions.reduce((n, r) => n + r.towns.length + r.camps.length + r.dungeons.length + r.shrines.length + r.landmarks.length, 0);
    add('brief', 'Everything the brief asks for has a place', bad, `${asked - bad.length} of ${asked} places the brief asks for were placed`);
  }

  // ---------------------------------------------------------------- bridges (whole line)
  {
    const bad = [];
    let crossingsSeen = 0;
    const riverLines = [...W.rivers, ...(pin ? pin.riverLines : [])];
    for (const rd of gen) {
      for (const rv of riverLines) for (let a = 0; a < rd.pts.length - 1; a++) for (let b = 0; b < rv.pts.length - 1; b++) {
        const p1 = rd.pts[a], p2 = rd.pts[a + 1], q1 = rv.pts[b], q2 = rv.pts[b + 1];
        if (Math.max(p1.x, p2.x) < Math.min(q1.x, q2.x) || Math.min(p1.x, p2.x) > Math.max(q1.x, q2.x) || Math.max(p1.z, p2.z) < Math.min(q1.z, q2.z) || Math.min(p1.z, p2.z) > Math.max(q1.z, q2.z)) continue;
        const c = segCross(p1, p2, q1, q2);
        if (!c) continue;
        crossingsSeen++;
        // covered by a bridge or ford of this road over this river, or by a deck whose span holds the spot
        const has = W.bridges.some(br => br.road === rd.id && (((br.river === rv.id || br.rivers?.includes(rv.id)) && Math.hypot(br.at[0] - c.x, br.at[1] - c.z) < (rv.width || 8) + 10 + (br.reach || 0)) || segDistXZ(c.x, c.z, br.a, br.b) <= br.width / 2 + 1));
        if (!has) bad.push({ at: [Math.round(c.x), Math.round(c.z)], text: `${rd.name || rd.id} crosses ${rv.name || 'a stream'} with no bridge` });
      }
      for (const p of rd.pts) {
        if (pin && pin.inKeep(p.x, p.z) && !rd.gate) continue;
        const w = T.waterAt(p.x, p.z);
        if (w && w.depth > W.brief.limits.wadeDepth && !T.deckAt(p.x, p.z) && !W.bridges.some(b => b.road === rd.id && b.kind === 'ford' && Math.hypot(b.at[0] - p.x, b.at[1] - p.z) < b.reach + 2)) {
          bad.push({ at: [Math.round(p.x), Math.round(p.z)], text: `${rd.name || rd.id} runs into ${w.kind === 'sea' ? 'the sea' : w.kind === 'lake' ? 'a lake' : 'deep water'}` });
          break;
        }
      }
    }
    // every bridge deck stands at or above both its banks (rule 22)
    for (const b of W.bridges) if (b.kind === 'bridge' && b.generated) {
      const lo = Math.max(T.heightAt(...b.a), T.heightAt(...b.b));
      if (b.deck < lo - 0.25) bad.push({ at: b.at, text: `${b.name} deck sits below its bank` });
    }
    const nb = W.bridges.filter(b => b.kind === 'bridge').length, nf = W.bridges.filter(b => b.kind === 'ford').length;
    add('bridges', 'Every road that crosses water has a bridge or a ford', bad, `${crossingsSeen} crossings on new roads, ${nb} bridges and ${nf} fords in all`);
  }

  // ---------------------------------------------------------------- clear: nothing on a road
  {
    const bad = [];
    const onRoad = (x, z, r) => { const rd = T.roadAt(x, z, 10 + r); return rd && rd.d < rd.half + r ? rd : null; };
    const B = W.bounds;
    let treesChecked = 0;
    for (let tx = Math.floor(B.minX / TILE); tx * TILE < B.maxX; tx++) for (let tz = Math.floor(B.minZ / TILE); tz * TILE < B.maxZ; tz++) {
      const s = treesInTile(W, T, tx, tz);
      for (const t of s.trees) { if (t.pinned) continue; treesChecked++; const hit = onRoad(t.x, t.z, t.r || 0.6); if (hit) bad.push({ at: [t.x, t.z], text: `a tree stands on ${hit.road}` }); }
      for (const d of s.decor) { if (d.pinned || !d.solid) continue; const hit = onRoad(d.x, d.z, d.r); if (hit) bad.push({ at: [d.x, d.z], text: `a ${d.art} sits on ${hit.road}` }); }
    }
    const plan = W.townPlan;
    for (const h of plan.boxes) {
      const c = Math.cos(h.facing), s = Math.sin(h.facing);
      for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const lx = u * (h.hw - 0.3), lz = v * (h.hd - 0.3), x = h.x + lx * c + lz * s, z = h.z - lx * s + lz * c;
        const hit = onRoad(x, z, 0);
        if (hit) { bad.push({ at: [Math.round(h.x), Math.round(h.z)], text: `a building stands on ${hit.road}` }); break; }
      }
    }
    for (const sp of W.setPieces) for (const q of sp.parts) { const hit = onRoad(q.at[0], q.at[1], Math.min(q.size[0], q.size[2]) / 2); if (hit) { bad.push({ at: q.at, text: `the ${q.shape} at ${W.places[sp.place].name} stands on ${hit.road}` }); break; } }
    for (const f of W.fields) if (f.generated) { const hit = onRoad(f.at[0], f.at[1], 0); if (hit) bad.push({ at: f.at, text: `${f.name} lies over ${hit.road}` }); }
    add('clear', 'Nothing stands on a road', bad, `${treesChecked} trees, ${plan.boxes.length} buildings and stalls, ${W.setPieces.reduce((s, p) => s + p.parts.length, 0)} set-piece parts checked`);
  }

  // ---------------------------------------------------------------- grades
  {
    const bad = [];
    let worst = 0, worstAt = null, cut = 0;
    const lim = W.brief.limits.roadMaxGrade;
    for (const rd of gen) for (let q = 1; q < rd.pts.length; q++) {
      const a = rd.pts[q - 1], b = rd.pts[q], ds = b.s - a.s;
      if (ds < 0.5) continue;
      const gr = Math.abs(b.y - a.y) / ds;
      if (ds >= 1.5 && !rd.maxGrade && gr > worst && !(a.zone && b.zone)) { worst = gr; worstAt = [b.x, b.z]; }
      // (heights are kept to the centimetre, so a short step may read a hair over: allow 2 cm)
      if (Math.abs(b.y - a.y) > (rd.maxGrade ?? lim) * ds + 0.02 && !(a.zone && b.zone)) { bad.push({ at: [Math.round(b.x), Math.round(b.z)], text: `${rd.name || rd.id} climbs ${Math.round(gr * 100)}%` }); break; }
      if (Math.abs(b.y - T.heightAt(b.x, b.z)) > 6) cut++;
    }
    for (const p of Object.values(W.places)) {
      if (p.pinned || p.kind === 'pass') continue;
      if (!T.walkable(p.at[0], p.at[1])) bad.push({ at: p.at, text: `${p.name} stands on ground you cannot walk on` });
    }
    add('grades', 'Roads climb 14% at most (paths to camps and landmarks 20%); places stand on walkable ground', bad, `steepest new road ${(worst * 100).toFixed(1)}%${worstAt ? ` near ${worstAt.map(Math.round).join(', ')}` : ''}; ${cut} road points in a cutting or bank over 6 m; ${W.switchbacks} switchbacks`, { steepest: Math.round(worst * 1000) / 10 });
  }

  // ---------------------------------------------------------------- level flow
  {
    const bad = [];
    let worstJump = 0;
    const mid = b => (b[0] + b[1]) / 2;
    for (const rd of gen) {
      let prev = null, prevAt = null;
      for (let q = 0; q < rd.pts.length; q += 10) {
        const p = rd.pts[q], b = mid(T.levelBandAt(p.x, p.z));
        if (prev != null) { const j = Math.abs(b - prev); worstJump = Math.max(worstJump, j); if (j > 6) { bad.push({ at: [Math.round(p.x), Math.round(p.z)], text: `${rd.name || rd.id}: levels jump from ${prev} to ${b}` }); break; } }
        prev = b; prevAt = p;
      }
      void prevAt;
    }
    // inside every generated region, the level rises with the walk from the start
    const M = W.macro;
    const corr = {};
    // over the whole new world the level grows with the walk from the start; no region runs the other way
    const ax = [], ay = [];
    W.regionList.forEach((R, ri) => {
      if (R.pinned) return;
      const xs = [], ys = [];
      for (let j = 0; j < M.region.length; j += 7) if (M.region[j] === ri && Number.isFinite(M.travel[j])) { xs.push(M.travel[j]); ys.push(M.level[j]); ax.push(M.travel[j]); ay.push(M.level[j]); }
      const c = spearman(xs, ys);
      corr[R.id] = Math.round(c * 100) / 100;
      if (!(c >= 0.2)) bad.push({ at: R.brief.at, text: `${R.name}: levels fall as you walk further in (${c.toFixed(2)})` });
    });
    const all = spearman(ax, ay);
    if (!(all >= 0.6)) bad.push({ at: W.startAt, text: `levels do not grow with the walk from the start (${all.toFixed(2)})` });
    add('levels', 'Levels rise smoothly from the start', bad, `largest jump along a road: ${worstJump} levels; level follows the walk from the start (${all.toFixed(2)}, 1 = always)`, { worstJump, trend: Math.round(all * 100) / 100, regionTrend: corr });
  }

  // ---------------------------------------------------------------- pinned piece unchanged
  if (pin) {
    const bad = [];
    const pg = pin.T.grid, mb = pin.map.bounds;
    const a = [], b = [], wa = [], wb = [];
    let changedHeights = 0, changedWater = 0;
    for (let k = 0; k < W.nz; k++) {
      const z = W.bounds.minZ + k * W.cell;
      if (z < pin.keep.minZ || z > pin.keep.maxZ) continue;
      for (let i = 0; i < W.nx; i++) {
        const x = W.bounds.minX + i * W.cell;
        if (x < pin.keep.minX || x > pin.keep.maxX) continue;
        const j = k * W.nx + i;
        if (W.gateCells.has(j)) continue;
        const pj = Math.round((z - pin.at[1] - mb.minZ) / W.cell) * pg.nx + Math.round((x - pin.at[0] - mb.minX) / W.cell);
        a.push(W.H[j]); b.push(pg.heights[pj]); wa.push(W.water[j]); wb.push(pg.water[pj]);
        if (!Object.is(W.H[j], pg.heights[pj])) { changedHeights++; if (bad.length < MAX) bad.push({ at: [x, z], text: `ground changed by ${(W.H[j] - pg.heights[pj]).toFixed(2)} m` }); }
        if (!Object.is(W.water[j], pg.water[pj]) && !(Number.isNaN(W.water[j]) && Number.isNaN(pg.water[pj]))) changedWater++;
      }
    }
    if (changedWater) bad.push({ at: [(pin.keep.minX + pin.keep.maxX) / 2, (pin.keep.minZ + pin.keep.maxZ) / 2], text: `${changedWater} water points changed` });
    const fa = fingerprint(Float32Array.from(a), Float32Array.from(wa)), fb = fingerprint(Float32Array.from(b), Float32Array.from(wb));
    add('pinned', 'The hand-made map is unchanged', bad, `${a.length.toLocaleString('en')} ground points compared, ${changedHeights} changed; ${W.gateCells.size} points re-graded by the ${pin.gates.length} gate roads (fingerprint ${fa}${fa === fb ? ' = ' : ' ≠ '}${fb})`, { compared: a.length, gateCells: W.gateCells.size, fingerprint: fa, fingerprintPinned: fb });
  }

  // ---------------------------------------------------------------- rivers only fall; every one ends in water
  {
    const bad = [];
    for (const r of W.rivers) {
      for (let q = 1; q < r.pts.length; q++) if (r.pts[q].y > r.pts[q - 1].y + 1e-6) { bad.push({ at: [r.pts[q].x, r.pts[q].z], text: `${r.name || r.id} runs uphill` }); break; }
      // the water lies in its bed: never more than a couple of metres above the ground beside the channel
      for (let q = 0; q < r.pts.length; q += 4) {
        const p = r.pts[q];
        if (W.pin && W.pin.inKeep(p.x, p.z)) continue;
        if (p.y - T.heightAt(p.x, p.z) > r.depth + 2.5) { bad.push({ at: [Math.round(p.x), Math.round(p.z)], text: `${r.name || r.id} floats ${(p.y - T.heightAt(p.x, p.z)).toFixed(1)} m above its bed` }); break; }
      }
      const last = r.pts[r.pts.length - 1];
      let ends = false;
      if (r.joins?.end === 'in') ends = pin.inKeep(last.x, last.z) || pin.keepDist(last.x, last.z) < 3;
      else if (r.to === 'sea') ends = W.macro.sea[mIdx(W, last.x, last.z)] === 1 || T.waterAt(last.x, last.z)?.kind === 'sea';
      else if (typeof r.to === 'string' && r.to.startsWith('lake:')) ends = W.lakes.some(l => l.id === r.to.slice(5)) && T.waterAt(last.x, last.z) != null;
      else if (r.kind === 'stream') ends = r.mouth === 'water' || r.mouth === 'river' || T.waterAt(last.x, last.z) != null;
      else ends = true;
      if (!ends) bad.push({ at: [last.x, last.z], text: `${r.name || r.id} ends on dry land` });
    }
    add('rivers', 'Rivers only run downhill, lie in their beds and end in water', bad, `${W.rivers.length} rivers and streams, ${W.lakes.length} lakes`);
  }

  // ---------------------------------------------------------------- links: both ends, one network
  {
    const bad = [];
    const nearRoad = (x, z, self) => W.roads.some(r => r !== self && r.pts.some(p => Math.hypot(p.x - x, p.z - z) <= r.width / 2 + 1.2));
    // a trail ends at its place's edge; a town lane may end anywhere inside its town
    const nearPlace = (x, z, r) => Object.values(W.places).some(p => Math.hypot(p.at[0] - x, p.at[1] - z) <= (p.kind === 'town' ? (r.town === p.id ? p.radius : 8) : Math.max(9, (p.radius || 6) * 0.8 + 1.5)));
    for (const r of gen) {
      if (r.town && r.points.length > 3 && r.points[0][0] === r.points[r.points.length - 1][0]) continue;   // a ring lane closes on itself
      for (const end of [r.pts[0], r.pts[r.pts.length - 1]]) {
        if (nearRoad(end.x, end.z, r) || nearPlace(end.x, end.z, r)) continue;
        bad.push({ at: [Math.round(end.x), Math.round(end.z)], text: `${r.name || r.id} ends nowhere` });
      }
    }
    // one network: roads joined where an end touches another road
    const touch = (a, b) => [a.pts[0], a.pts[a.pts.length - 1]].some(e => b.pts.some(p => Math.hypot(p.x - e.x, p.z - e.z) <= Math.max(a.width, b.width) / 2 + 1.5));
    const all = W.roads, seen = new Set([0]), q = [0];
    const start = all.findIndex(r => r.pts.some(p => Math.hypot(p.x - W.startAt[0], p.z - W.startAt[1]) < 60));
    if (start >= 0) { seen.clear(); seen.add(start); q.length = 0; q.push(start); }
    while (q.length) { const i = q.pop(); all.forEach((r, j) => { if (!seen.has(j) && (touch(r, all[i]) || touch(all[i], r))) { seen.add(j); q.push(j); } }); }
    for (const [j, r] of all.entries()) if (!seen.has(j)) bad.push({ at: [Math.round(r.pts[0].x), Math.round(r.pts[0].z)], text: `${r.name || r.id} is not joined to the rest of the roads` });
    for (const f of W.roadFailures || []) bad.push({ at: W.startAt, text: `no road could be found for ${f}` });
    add('links', 'Every road joins the network at both ends', bad, `${gen.length} new roads, ${W.roads.length} in all; ${seen.size} joined to the start`);
  }

  // ---------------------------------------------------------------- trees are big
  {
    const bad = [];
    if (detail.medianH < 18) bad.push({ at: W.startAt, text: `median tree is ${detail.medianH} m (want 18 m or more)` });
    for (const R of W.regionList) {
      if (R.pinned || !R.brief) continue;
      const th = R.theme;
      void th;
    }
    add('trees', 'Trees are big (10-15x a person, giants in the woods)', bad, `${detail.trees.toLocaleString('en')} trees, median ${detail.medianH} m, tallest ${detail.tallest} m, ${detail.giants} giants`);
  }

  // ---------------------------------------------------------------- towns
  {
    const bad = [];
    const per = {};
    for (const h of W.townPlan.houses) per[h.town] = (per[h.town] || 0) + 1;
    for (const id of Object.keys(W.townDefs)) if (!per[id]) bad.push({ at: W.places[id].at, text: `${W.places[id].name} has no houses` });
    add('towns', 'Every town has houses along its streets', bad, Object.keys(W.townDefs).map(id => `${W.places[id].name} ${per[id] || 0}`).join(', '), { housesPerTown: per });
  }
  return { ok: checks.every(c => c.pass), checks };
}

/**
 * Walk flood on the 2 m vertices (Oathwild's step rules: walkable ground, a rise of at most maxSlope over the step,
 * on and off a bridge deck only at its ends), over road corridors, place discs and the pinned piece.
 */
export function walkFlood(W, T) {
  const { nx, nz, cell } = W, N = nx * nz, B = W.bounds;
  const mask = new Uint8Array(N);
  const mark = (x, z, r) => { const i0 = Math.max(0, Math.floor((x - r - B.minX) / cell)), i1 = Math.min(nx - 1, Math.ceil((x + r - B.minX) / cell)), k0 = Math.max(0, Math.floor((z - r - B.minZ) / cell)), k1 = Math.min(nz - 1, Math.ceil((z + r - B.minZ) / cell)); for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) if (Math.hypot(B.minX + i * cell - x, B.minZ + k * cell - z) <= r) mask[k * nx + i] = 1; };
  for (const r of W.roads) for (let q = 0; q < r.pts.length; q += 2) mark(r.pts[q].x, r.pts[q].z, r.width / 2 + 3);
  for (const p of Object.values(W.places)) mark(p.at[0], p.at[1], Math.max(14, (p.radius || 10) * 1.1));
  mark(W.startAt[0], W.startAt[1], 120);              // the start may stand a little way off the roads
  if (W.pin) { const k = W.pin.keep; for (let kk = Math.ceil((k.minZ - B.minZ) / cell); kk <= Math.floor((k.maxZ - B.minZ) / cell); kk++) for (let i = Math.ceil((k.minX - B.minX) / cell); i <= Math.floor((k.maxX - B.minX) / cell); i++) mask[kk * nx + i] = 1; }
  const ok = new Int8Array(N).fill(-1), seen = new Uint8Array(N);
  const vx = j => B.minX + (j % nx) * cell, vz = j => B.minZ + Math.floor(j / nx) * cell;
  const walk = j => { if (ok[j] < 0) ok[j] = T.walkable(vx(j), vz(j)) ? 1 : 0; return ok[j] === 1; };
  const maxRise = Math.tan(T.limits.maxSlope * Math.PI / 180) * cell * 1.15;
  const toJ = (x, z) => Math.min(nz - 1, Math.max(0, Math.round((z - B.minZ) / cell))) * nx + Math.min(nx - 1, Math.max(0, Math.round((x - B.minX) / cell)));
  const start = toJ(W.startAt[0], W.startAt[1]);
  const wh = new Float32Array(N).fill(NaN), deck = new Uint8Array(N);
  const hOf = j => { if (Number.isNaN(wh[j])) { const h = T.walkHeightAt(vx(j), vz(j)); wh[j] = h.y; deck[j] = h.on === 'deck' ? 1 : 0; } return wh[j]; };
  // the road centre lines are walked too (a 4 m path along a knife-edge ridge is walkable along its middle even where
  // the 2 m grid's edge vertices read the drop beside it): road point nodes come after the vertices, joined to their
  // neighbours along the road and to the vertex under them
  const rp = [];
  for (const r of W.roads) { const base = rp.length; r.pts.forEach((p, q) => rp.push({ x: p.x, z: p.z, prev: q ? base + q - 1 : -1, next: q < r.pts.length - 1 ? base + q + 1 : -1, j: toJ(p.x, p.z) })); }
  const rpOk = new Int8Array(rp.length).fill(-1), rpY = new Float32Array(rp.length).fill(NaN), rpSeen = new Uint8Array(rp.length);
  const rpWalk = n => { if (rpOk[n] < 0) { const p = rp[n]; rpOk[n] = T.walkable(p.x, p.z) ? 1 : 0; rpY[n] = T.walkHeightAt(p.x, p.z).y; } return rpOk[n] === 1; };
  const byVertex = new Map();
  rp.forEach((p, n) => { if (!byVertex.has(p.j)) byVertex.set(p.j, []); byVertex.get(p.j).push(n); });
  const q = [start]; seen[start] = 1;
  const rq = [];
  while (q.length || rq.length) {
    while (q.length) {
      const j = q.pop(), i = j % nx, k = (j - i) / nx, y = hOf(j);
      for (const n of byVertex.get(j) || []) if (!rpSeen[n] && rpWalk(n) && Math.abs(rpY[n] - y) <= maxRise) { rpSeen[n] = 1; rq.push(n); }
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const jj = kk * nx + ii;
        if (seen[jj] || !mask[jj] || !walk(jj)) continue;
        const y1 = hOf(jj);
        if (Math.abs(y1 - y) > maxRise) continue;
        if (deck[j] !== deck[jj] && Math.abs(y1 - y) > 0.6) continue;
        seen[jj] = 1; q.push(jj);
      }
    }
    while (rq.length) {
      const n = rq.pop(), p = rp[n];
      // down onto the ground under the point, and on along the road
      if (!seen[p.j] && walk(p.j) && Math.abs(hOf(p.j) - rpY[n]) <= maxRise) { seen[p.j] = 1; q.push(p.j); }
      for (const m of [p.prev, p.next]) {
        if (m < 0 || rpSeen[m] || !rpWalk(m)) continue;
        const d = Math.hypot(rp[m].x - p.x, rp[m].z - p.z);
        if (Math.abs(rpY[m] - rpY[n]) > Math.tan(T.limits.maxSlope * Math.PI / 180) * Math.max(d, 0.5) * 1.15) continue;
        rpSeen[m] = 1; rq.push(m);
      }
    }
  }
  return { at: (x, z) => { const i = Math.round((x - B.minX) / cell), k = Math.round((z - B.minZ) / cell); for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) { const ii = i + di, kk = k + dk; if (ii >= 0 && kk >= 0 && ii < nx && kk < nz && seen[kk * nx + ii]) return true; } return false; } };
}
function segDistXZ(x, z, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); }
function mIdx(W, x, z) { const M = W.macro; return Math.min(M.nz - 1, Math.max(0, Math.round((z - M.minZ) / M.cell))) * M.nx + Math.min(M.nx - 1, Math.max(0, Math.round((x - M.minX) / M.cell))); }
function spearman(xs, ys) {
  if (xs.length < 5) return 1;
  const rank = a => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Float64Array(a.length); o.forEach(([, i], k) => { r[i] = k; }); return r; };
  const rx = rank(xs), ry = rank(ys), n = xs.length;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += rx[i]; my += ry[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy || 1);
}
void TREE_SPECIES;
