#!/usr/bin/env node
// Thousandvale — MOVE WHAT THE SEA TOOK (Coast stream, play-test 11 Z61: the bay that brings the sea in to Gullwick).
//
//   node tools/coast-content.mjs            move every stream E placement of a bay zone that no longer passes the placer's
//                                           rule (tools/content-place.mjs discProblem) to the nearest fair spot, and the
//                                           bay zone's pinned dungeon door (data/world/site-pins.json) off the water
//   node tools/coast-content.mjs --check    change nothing; exit 1 when something would move
//
// WHY. A bay (tools/lib/world-core.mjs BAYS) changes the ground of one zone after stream E placed it. Running
// tools/place-vignettes.mjs again is not an option (it no longer reproduces the committed placements), so this moves only
// what the sea took: a camp, a vignette, a farm, a wayside stone or a fisher now standing in the water or on the new shore
// slope goes to the nearest spot that passes the same rule the placer and tests/E/placement.test.js use, with its loop
// (a roaming pack, a folk path) carried along; a door guard and the door's waystone follow the door. Everything that
// still passes stays exactly where it is (byte-identical rows).
//
// ORDER after a bay change: bake-zone <zone> -> THIS -> bake-zone <zone> again (B reads the new spots: paths, scatter
// clearing, the door) -> this --check (nothing left) -> content-professions -> content-towns -> content-givers ->
// content-hunts -> fill-quest-marks (docs/ON-HOLD.md "How to resume" step 4).
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parseTerrain, parseNav, NAV } from '../js/rules/terrain-read.js';
import { zoneContext, provinceComponents, discProblem, openPoint, walkLine, findSpot, findPoint, ruleKind, rngFor, POINT_TYPES, settlementEdge, levelField, campLevels } from './content-place.mjs';
import { existsSync } from 'node:fs';
import { BAYS } from './lib/world-core.mjs';
import { provinceDressing } from './content-lib.mjs';
import { groundPieces } from './content-place.mjs';

const ROOT = new URL('../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const CHECK = process.argv.includes('--check');
const DISC = new Set(['vignette', 'fort', 'farm', 'cave', 'camp', 'rare', 'hook', 'wayside', 'curio', 'folk']);
/** What may simply go when no fair spot is left within ~1.2 km (`--province` only): a lore curio or a wayside stone is scenery. */
const DROPPABLE = new Set(['curio', 'wayside']);
/**
 * `--province` only: a camp, rare or set piece that has to MOVE keeps 130 m + its radius from a settlement's edge. A town's
 * farmland is laid out by the bake round whatever E left free, so a thing moved to a town's doorstep was simply taken
 * again by the next bake's fields (the Ashcombe colossus went back and forth three rounds running).
 */
const FARM_SHY = new Set(['hook', 'rare', 'camp']);
/** …and 100 m from the bake's own farms, orchards and fields, which shift a little every bake as the ground under them is levelled. */
const farmNear = (ctx, x, z, R) => ctx.siteDiscs.some(d => (d.kind === 'field' || d.kind === 'set_piece' || d.kind === 'set_building') && Math.hypot(d.x - x, d.z - z) < R + d.r + 100);

/** The province contexts exactly as tests/E/placement.test.js builds them. */
function contexts(prov) {
  const SHEET = J(`data/provinces/${prov}.json`), MAP = J('data/world/province-map.json').provinces[prov].map;
  const PLACES = J(`data/provinces/${prov}-places.json`), PINS = J('data/world/site-pins.json');
  const Z = {};
  for (const [eid, wid] of Object.entries(MAP)) {
    const dir = `data/zones/${wid}/`;
    Z[eid] = { eid, wid, sheet: SHEET.zones[eid], terrain: parseTerrain(readFileSync(new URL(dir + 'terrain.bin', ROOT))), nav: parseNav(readFileSync(new URL(dir + 'nav.bin', ROOT))),
      bake: J(dir + 'placements.json').placements, fileName: `data/vignettes/placements/${wid}.json` };
    Z[eid].file = J(Z[eid].fileName);
    // the extra solo / pair hunt monsters (play-test 3 R2) live in their own file; B never reads it, but the ground moved under them too
    Z[eid].huntName = `data/vignettes/placements/${wid}.hunt.json`;
    Z[eid].hunt = existsSync(new URL(Z[eid].huntName, ROOT)) ? J(Z[eid].huntName) : null;
  }
  const se = SHEET.grid.start, hub = Z[se].bake.find(p => p.kind === 'settlement' && p.data.hub);
  const PC = provinceComponents(Object.values(Z).map(z => ({ gx: z.sheet.grid[0], gy: z.sheet.grid[1], nav: z.nav })), { gx: Z[se].sheet.grid[0], gy: Z[se].sheet.grid[1], x: hub.x, z: hub.z });
  for (const z of Object.values(Z)) {
    z.ctx = zoneContext({ terrain: z.terrain, nav: z.nav, placements: z.bake, reserve: PLACES.zones[z.eid].asks, province: PC, cell: { gx: z.sheet.grid[0], gy: z.sheet.grid[1] }, pinned: new Set(Object.keys(PINS[z.wid] || {})) });
    z.ctx.placed = z.file.placements;
  }
  // the level ramp out from the hub (tests/E/living.test.js P26 builds the same one): a camp that moves takes the level of its new spot
  const LF = levelField({ sheet: SHEET, hub: { x: Z[se].sheet.grid[0] * 2048 + hub.x, z: Z[se].sheet.grid[1] * 2048 + hub.z } });
  return { Z, PINS, LF, SHEET };
}

/** Variety on the walk (stream E, P19): no two of one curio within 350 m. */
const sameCurioNear = (ctx, p, x, z) => ctx.placed.some(o => o !== p && o.type === 'curio' && o.recipe === p.recipe && Math.hypot(o.x - x, o.z - z) < 350);

/** What is wrong with one record now (null = it still fits). */
function problemOf(ctx, p, inner = false) {
  if (!Number.isFinite(p.x)) return null;
  // a harbour's own folk (`harbour: <site id>`) work ON it: judged by the placer's rule without the harbour's keep-clear disc
  if (p.harbour && !inner) { const s = ctx.siteDiscs; ctx.siteDiscs = s.filter(d => d.id !== p.harbour); try { return problemOf(ctx, p, true); } finally { ctx.siteDiscs = s; } }
  if (DISC.has(p.type) && p.radius != null) {
    const why = discProblem(ctx, ruleKind(p), p.x, p.z, p.radius, { ignore: p, others: ctx.placed });
    if (why) return why;
  } else if (POINT_TYPES.has(p.type) && !p.town && !(p.type === 'npc' && settlementEdge(ctx, p.x, p.z) < 0)) {
    if (!openPoint(ctx, p.x, p.z, { allowTown: true, allowRoad: true, allowSolid: true, slope: 32 })) return 'point not open';
  }
  // (only for a curio this tool moved — the spacing was the placer's when it placed the rest; `ctx.movedIds` = ids that
  // stand somewhere else than in the committed file)
  if (p.type === 'curio' && (!ctx.movedIds || ctx.movedIds.has(p.id)) && sameCurioNear(ctx, p, p.x, p.z)) return 'same curio within 350 m';      // tests/E/living.test.js
  if ((p.stray || p.roam) && settlementEdge(ctx, p.x, p.z) < 70) return 'stray by a settlement';
  if (Array.isArray(p.path) && p.path.length) {
    const pts = p.path.map(([x, z]) => ({ x, z }));
    for (let i = 0; i < pts.length; i++) if (!walkLine(ctx, pts[i], pts[(i + 1) % pts.length])) return `path leg ${i}`;
    if (!walkLine(ctx, p, pts[0])) return 'path start';
  }
  return null;
}

/** A loop of `n` points round (x, z) at about `r` metres whose every leg walks (for a pack or a fisher that moved). */
function loopAt(ctx, x, z, r, n, seed) {
  const rnd = rngFor(seed);
  for (let t = 0; t < 1200; t++) {
    const a0 = rnd() * 6.2832, rr = Math.max(6, r * (1 - t / 1400)) * (0.7 + rnd() * 0.6), pts = [];
    for (let k = 0; k < n; k++) { const a = a0 + k / n * 6.2832; pts.push({ x: Math.round(x + Math.cos(a) * rr), z: Math.round(z + Math.sin(a) * rr) }); }
    if (pts.every((q, i) => walkLine(ctx, q, pts[(i + 1) % n])) && walkLine(ctx, { x, z }, pts[0])) return pts.map(q => [q.x, q.z]);
  }
  return null;
}

/** P19's measure, exactly as tests/E/living.test.js takes it: the share of reachable open ground within 50 m of something. */
function coverage(z) {
  const f = z.file, nav = z.nav, B = z.bake, ZM = 2048;
  const pois = [...f.placements.map(p => ({ x: p.x, z: p.z, r: p.radius || 2 })), ...f.placements.flatMap(p => (p.path || []).map(([x, z0]) => ({ x, z: z0, r: 8 }))),
    ...f.settlements.map(q => ({ x: q.x, z: q.z, r: q.r })), ...B.filter(b => b.kind === 'event_site' || b.kind === 'camp_site').map(b => ({ x: b.x, z: b.z, r: b.data.r || 20 })),
    ...B.filter(b => ['dungeon_door', 'crossing', 'bridge', 'landmark'].includes(b.kind)).map(b => ({ x: b.x, z: b.z, r: 8 })), ...groundPieces(B)];
  const grid = new Map(), G = 64, key = (i, j) => i + ',' + j;
  const add = q => { const k = key(Math.floor(q.x / G), Math.floor(q.z / G)); (grid.get(k) || grid.set(k, []).get(k)).push(q); };
  pois.forEach(add);
  const nearest = (x, z0) => { let b = Infinity; for (let j = Math.floor(z0 / G) - 2; j <= Math.floor(z0 / G) + 2; j++) for (let i = Math.floor(x / G) - 2; i <= Math.floor(x / G) + 2; i++) for (const q of grid.get(key(i, j)) || []) b = Math.min(b, Math.hypot(q.x - x, q.z - z0) - q.r); return b; };
  const empty = []; let open = 0;
  for (let z0 = 48; z0 < ZM - 48; z0 += 16) for (let x = 48; x < ZM - 48; x += 16) {
    const b = nav.bits[Math.round(z0 / nav.step) * nav.size + Math.round(x / nav.step)];
    if (!(b & NAV.WALK) || (b & (NAV.DEEP | NAV.STEEP | NAV.BUILDING | NAV.TOWN | NAV.SHALLOW | NAV.SOLID | NAV.ROAD))) continue;
    if (f.settlements.some(q => Math.hypot(q.x - x, q.z - z0) < q.r)) continue;
    open++; const d = nearest(x, z0); if (d > 50) empty.push({ x, z: z0, d });
  }
  return { share: open ? 1 - empty.length / open : 1, empty, add, nearest };
}
let CURIOS = null;
/** Curios into the emptiest open ground until coverage passes 95.5% (the curio choice follows tools/content-living.mjs curio()). */
function fillGaps(z, ctx, LF, zs) {
  CURIOS ||= provinceDressing(PROV).curios;
  const C = coverage(z), out = [];
  if (C.share >= 0.955) return out;
  const open = C.empty.length / (1 - C.share);
  const pl = z.file.placements, rnd = rngFor(z.wid + ':gaps');
  let n = 0, left = C.empty.length;
  const ids = new Set(pl.map(p => p.id));
  for (const e of C.empty.sort((a, b) => b.d - a.d || a.z - b.z || a.x - b.x)) {
    if (1 - left / open >= 0.955) break;
    if (C.nearest(e.x, e.z) <= 50) continue;
    const bm = z.terrain.biomes[z.terrain.biomeAt(e.x, e.z)].key, lv = LF.at(z.eid, e.x, e.z);
    const fits = CURIOS.filter(c => (!c.tags.biomes.length || c.tags.biomes.includes(bm)) && (c.tags.archetypes.includes('any') || c.tags.archetypes.includes(zs.archetype)) && lv >= c.tags.band[0] - 1 && lv <= c.tags.band[1]);
    let rec = null;
    for (const c of fits.sort((a, b) => (b.weight || 1) - (a.weight || 1) || (a.id < b.id ? -1 : 1))) {
      const s = findSpot(ctx, rnd, 'curio', c.radius, { near: { x: e.x, z: e.z, min: 0, max: 24 }, spread: 0, tries: 300, score: (x, z0) => (sameCurioNear(ctx, { recipe: c.id, type: 'curio' }, x, z0) ? -Infinity : -Math.hypot(x - e.x, z0 - e.z)) });
      if (!s) continue;
      let id; do id = `cu_${z.eid}_g${++n}`; while (ids.has(id)); ids.add(id);
      rec = { type: 'curio', id, recipe: c.id, name: c.name, kind: c.kind, x: s.x, z: s.z, yaw: +(rnd() * 6.28).toFixed(2), radius: c.radius, levelBase: Math.max(1, Math.floor(lv)) };
      break;
    }
    if (!rec) continue;
    pl.push(rec); C.add({ x: rec.x, z: rec.z, r: rec.radius }); out.push(rec);
    left = C.empty.filter(q => C.nearest(q.x, q.z) > 50).length;
  }
  return out;
}

const report = [];
let changed = false;
// play-test 12 (#81, Torbor Downs regenerated): `--province=<id>` treats EVERY zone of the province like a bay zone — the
// new hills and the new coastline moved the ground under all of them (run: bake --province -> this -> bake again)
const PROV = (process.argv.find(a => a.startsWith('--province=')) || '').split('=')[1] || null;
const TARGETS = PROV ? Object.values(J('data/world/province-map.json').provinces[PROV].map).map(zone => BAYS.find(b => b.zone === zone) || { zone }) : BAYS;
const CTX = new Map();
for (const bay of TARGETS) {
  const pm = Object.entries(J('data/world/province-map.json').provinces).find(([, v]) => Object.values(v.map || {}).includes(bay.zone));
  if (!pm) continue;
  if (!CTX.has(pm[0])) CTX.set(pm[0], contexts(pm[0]));
  const { Z, PINS, LF, SHEET } = CTX.get(pm[0]);
  const z = Object.values(Z).find(q => q.wid === bay.zone), ctx = z.ctx, pl = z.file.placements;
  try {
    const head = JSON.parse(execSync(`git show HEAD:./${z.fileName}`, { cwd: new URL('.', ROOT), encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })).placements;
    const at = new Map(head.map(p => [p.id, p]));
    ctx.movedIds = new Set(pl.filter(p => { const h = at.get(p.id); return !h || h.x !== p.x || h.z !== p.z; }).map(p => p.id));
  } catch { ctx.movedIds = null; }
  // the harbour (quay, piers, the moored ship) is kept clear like a B site: nothing of ours on it, no monsters near it
  const hb = z.bake.find(p => p.kind === 'harbour');
  const harbour = hb ? { kind: 'harbour', id: hb.id, x: hb.x, z: hb.z, r: 70 } : null;
  if (harbour) ctx.siteDiscs.push(harbour);
  const HOSTILE = new Set(['camp', 'rare', 'vignette', 'cave', 'hook']);
  const nearHarbour = (p, x = p.x, z0 = p.z) => harbour && HOSTILE.has(p.type) && Math.hypot(x - harbour.x, z0 - harbour.z) < (p.radius || 0) + 150;
  // 1. the zone's pinned dungeon door, when the sea took it: the nearest open, level ground off the roads and out of town
  const pins = PINS[bay.zone] || {};
  for (const [key, pin] of Object.entries(pins)) {
    if (!key.startsWith('door')) continue;
    const ok = (x, z0) => { if (!openPoint(ctx, x, z0, { slope: 16, allowSolid: true })) return false; for (let a = 0; a < 16; a++) if (!openPoint(ctx, x + Math.cos(a * 0.3927) * 16, z0 + Math.sin(a * 0.3927) * 16, { slope: 24, allowSolid: true })) return false; return ctx.roadDist(x, z0) >= 22 && settlementEdge(ctx, x, z0) >= 60 && ctx.waterDist(x, z0) >= 30 && (!harbour || Math.hypot(x - harbour.x, z0 - harbour.z) >= 200); };
    // a pin that is dry, open and level stays (its own path is a painted road by then, so the road rule is for new spots)
    const dryOpen = (x, z0) => openPoint(ctx, x, z0, { slope: 16, allowSolid: true, allowRoad: true }) && ctx.waterDist(x, z0) >= 20 && (!harbour || Math.hypot(x - harbour.x, z0 - harbour.z) >= 200);
    if (dryOpen(pin.x, pin.z)) continue;
    let best = null;
    for (let r = 8; r <= 600 && !best; r += 8) for (let a = 0; a < 64; a++) {
      const x = Math.round(pin.x + Math.cos(a / 64 * 6.2832) * r), z0 = Math.round(pin.z + Math.sin(a / 64 * 6.2832) * r);
      if (!ok(x, z0) || pl.some(p => p.radius != null && !POINT_TYPES.has(p.type) && p.type !== 'camp' && Math.hypot(p.x - x, p.z - z0) < p.radius + 40)) continue;
      best = { x, z: z0 }; break;
    }
    if (!best) { report.push(`${bay.zone} ${key}: NO dry spot within 600 m`); continue; }
    const town = ctx.settlements.find(s => s.hub) || ctx.settlements[0];
    const moved = { x: best.x, z: best.z, yaw: +Math.atan2(town.x - best.x, town.z - best.z).toFixed(3) };
    report.push(`${bay.zone} ${key}: (${pin.x}, ${pin.z}) -> (${moved.x}, ${moved.z})`);
    pins[key] = moved; changed = true;
    // the door's waystone and its guard follow it (B bakes the door AT the pin)
    for (const p of pl) {
      if (!(p.door === key || p.doorGuard)) continue;
      const near = p.type === 'waystone' ? { x: moved.x, z: moved.z, min: 9, max: 16 } : { x: moved.x, z: moved.z, min: 18, max: 34 };
      const spot = p.type === 'waystone' ? findPoint(ctx, rngFor(p.id), near, { clearance: 2 }) : findSpot(ctx, rngFor(p.id), ruleKind(p), p.radius, { near, spread: 0, score: (x, z0) => -Math.hypot(x - moved.x, z0 - moved.z) });
      if (!spot) { report.push(`   ${p.id}: no spot by the new door`); continue; }
      report.push(`   ${p.id} follows: (${p.x}, ${p.z}) -> (${spot.x}, ${spot.z})`);
      p.x = spot.x; p.z = spot.z;
    }
  }
  // 1b. (`--province`) a set piece BOUND onto one of B's baked pieces (play-test 2: Brannock Fields on hobbins_farm) follows
  // that piece when the new ground moved it — the same centre, facing and scale tools/content-setpieces.mjs gives a bound
  // piece — and everything placed `in` it (its folk and boss) moves and turns with it
  if (PROV) for (const v of pl.filter(q => q.bound && q.setpiece)) {
    const piece = z.bake.find(b => b.kind === 'set_piece' && b.id === v.bound); if (!piece) continue;
    let c = { x: piece.x, z: piece.z }, pr = piece.data.r || v.radius;
    if (!openPoint(ctx, c.x, c.z, { allowSolid: true, allowRoad: true, slope: 35 })) {
      const sl = (piece.data.slots || []).find(q => Number.isFinite(q.x) && openPoint(ctx, q.x, q.z, { allowSolid: true, allowRoad: true, slope: 35 }));
      if (sl) { c = { x: sl.x, z: sl.z }; pr = Math.min(pr, 12); }
    }
    const nx = +c.x.toFixed(1), nz = +c.z.toFixed(1), ny = +(piece.yaw || 0).toFixed(2);
    if (nx === v.x && nz === v.z && ny === v.yaw) continue;
    const full = v.radius / (v.scale || 1), ns = +Math.min(1, pr / full).toFixed(3), k = ns / (v.scale || 1);
    const c0 = Math.cos(v.yaw || 0), s0 = Math.sin(v.yaw || 0), c1 = Math.cos(ny), s1 = Math.sin(ny);
    const carry = (x, z0) => { const dx = x - v.x, dz = z0 - v.z, lx = (dx * c0 - dz * s0) * k, lz = (dx * s0 + dz * c0) * k; return [+(nx + lx * c1 + lz * s1).toFixed(1), +(nz - lx * s1 + lz * c1).toFixed(1)]; };
    for (const q of pl.filter(o => o.in === v.id)) {
      [q.x, q.z] = carry(q.x, q.z);
      if (Array.isArray(q.path)) q.path = q.path.map(([x, z0]) => carry(x, z0));
    }
    report.push(`${bay.zone} setpiece ${v.id} follows ${piece.id}: (${v.x}, ${v.z}) -> (${nx}, ${nz})`);
    v.x = nx; v.z = nz; v.yaw = ny; v.radius = +pr.toFixed(1); v.scale = ns; changed = true;
  }
  // 2. every placement the sea took (or whose loop now runs into it)
  const gone = new Set();
  const huntPl = PROV && z.hunt ? z.hunt.placements : [];
  let huntChanged = false;
  for (const list of [pl, huntPl]) for (const p of list) {
    if (PROV && p.bound && p.setpiece) continue;      // a bound set piece stands ON B's piece by design (step 1b), not on open ground
    const why = problemOf(ctx, p) || (nearHarbour(p) ? 'by the harbour' : null); if (!why) continue;
    const ox = p.x, oz = p.z, R = p.radius ?? 1.5;
    let spot = null;
    const nearScore = (x, z0) => -Math.hypot(x - ox, z0 - oz) - (p.template === 'fishing_plot' || p.role === 'fisher' ? Math.max(0, ctx.waterDist(x, z0) - R - 12) * 3 : 0);
    const score = (x, z0) => (nearHarbour(p, x, z0) || (p.type === 'curio' && sameCurioNear(ctx, p, x, z0)) || ((p.stray || p.roam) && settlementEdge(ctx, x, z0) < 70) || (PROV && FARM_SHY.has(p.type) && (settlementEdge(ctx, x, z0) < R + 130 || ctx.townDist(x, z0) < R + 90 || farmNear(ctx, x, z0, R))) ? -Infinity : nearScore(x, z0));
    // (a second, wider look — play-test 12, #81: the regenerated Torbor Downs took whole stretches of coast and hillside)
    for (const reach of PROV ? [1, 2.6] : [1]) {
      if (spot) break;
      if (DISC.has(p.type) && p.radius != null) spot = findSpot(ctx, rngFor(p.id + ':coast' + (reach > 1 ? ':wide' : '')), ruleKind(p), R, { near: { x: ox, z: oz, min: 0, max: 450 * reach }, spread: 0, tries: 6000 * reach, score });
      else spot = findPoint(ctx, rngFor(p.id + ':coast' + (reach > 1 ? ':wide' : '')), { x: ox, z: oz, min: 0, max: 300 * reach }, { allowTown: true, prefer: nearScore });
    }
    // (last: anywhere in the zone, nearest first — a big set piece in a corner the new hills or sea took)
    // and if the new ground has no open disc that big anywhere, the set piece is drawn smaller (down to half) where it fits
    if (!spot && PROV && DISC.has(p.type) && p.radius != null) for (const k of [1, 0.75, 0.6, 0.5]) {
      spot = findSpot(ctx, rngFor(p.id + ':coast:zone' + k), ruleKind(p), Math.round(R * k), { spread: 0, tries: 30000, score });
      if (spot) { if (k < 1) { report.push(`${bay.zone} ${p.id}: radius ${R} -> ${Math.round(R * k)} (no open ground that big left)`); p.radius = Math.round(R * k); } break; }
    }
    if (!spot && PROV && DROPPABLE.has(p.type)) { gone.add(p); report.push(`${bay.zone} ${p.type} ${p.id} (${why}): no fair spot within ${Math.round(450 * 2.6)} m — REMOVED (scenery only)`); changed = true; continue; }
    if (!spot) { report.push(`${bay.zone} ${p.id} (${why}): NO fair spot within reach`); continue; }
    p.x = spot.x; p.z = spot.z;
    if (Array.isArray(p.path) && p.path.length) {
      const moved = p.path.map(([x, z0]) => [Math.round(x + spot.x - ox), Math.round(z0 + spot.z - oz)]);
      const pts = moved.map(([x, z0]) => ({ x, z: z0 }));
      const walks = pts.every((q, i) => walkLine(ctx, q, pts[(i + 1) % pts.length])) && walkLine(ctx, p, pts[0]);
      p.path = walks ? moved : (loopAt(ctx, spot.x, spot.z, Math.max(8, ...p.path.map(([x, z0]) => Math.hypot(x - ox, z0 - oz))), p.path.length, p.id + ':loop') || moved);
    }
    const still = problemOf(ctx, p);
    report.push(`${bay.zone} ${p.type} ${p.id} (${why}): (${ox}, ${oz}) -> (${p.x}, ${p.z})${still ? `  STILL: ${still}` : ''}`);
    changed = true; if (list === huntPl) huntChanged = true;
  }
  // 3. (`--province`) every camp at the level the ramp gives its spot — the camps moved by earlier runs took their old level along
  if (PROV) {
    const top = SHEET.zones[z.eid].band[1];
    for (const list of [pl, huntPl]) for (const p of list) {
      if (p.type !== 'camp' || !Array.isArray(p.level)) continue;
      const want = campLevels(LF.at(z.eid, p.x, p.z), top);
      if (p.level[0] === want[0] && p.level[1] === want[1]) continue;
      report.push(`${bay.zone} camp ${p.id}: level ${p.level} -> ${want} (the ramp at its spot)`);
      p.level = want; changed = true; if (list === huntPl) huntChanged = true;
    }
  }
  // 4. (`--province`) no big empty stretches (tests/E/living.test.js P19: 95% of reachable open ground within 50 m of
  // something): what this tool dropped or moved can leave a gap, so the emptiest open ground gets a curio that suits it
  if (PROV) {
    const added = fillGaps(z, ctx, LF, SHEET.zones[z.eid]);
    for (const rec of added) report.push(`${bay.zone} curio ${rec.id} (${rec.name}) added at (${rec.x}, ${rec.z}) — open ground with nothing within 50 m`);
    if (added.length) changed = true;
  }
  if (huntChanged && !CHECK) writeFileSync(new URL(z.huntName, ROOT), JSON.stringify(z.hunt, null, 1) + '\n');
  if (gone.size) z.file.placements = pl.filter(p => !gone.has(p));
  if (changed && !CHECK) {
    writeFileSync(new URL(z.fileName, ROOT), JSON.stringify(z.file, null, 1) + '\n');
    writeFileSync(new URL('data/world/site-pins.json', ROOT), JSON.stringify(PINS, null, 1).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
  }
}
console.log(report.length ? report.join('\n') : 'nothing the sea took');
if (CHECK && changed) process.exit(1);
