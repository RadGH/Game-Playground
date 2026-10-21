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
import { zoneContext, provinceComponents, discProblem, openPoint, walkLine, findSpot, findPoint, ruleKind, rngFor, POINT_TYPES, settlementEdge } from './content-place.mjs';
import { BAYS } from './lib/world-core.mjs';

const ROOT = new URL('../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const CHECK = process.argv.includes('--check');
const DISC = new Set(['vignette', 'fort', 'farm', 'cave', 'camp', 'rare', 'hook', 'wayside', 'curio', 'folk']);
/** What may simply go when no fair spot is left within ~1.2 km (`--province` only): a lore curio or a wayside stone is scenery. */
const DROPPABLE = new Set(['curio', 'wayside']);

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
  }
  const se = SHEET.grid.start, hub = Z[se].bake.find(p => p.kind === 'settlement' && p.data.hub);
  const PC = provinceComponents(Object.values(Z).map(z => ({ gx: z.sheet.grid[0], gy: z.sheet.grid[1], nav: z.nav })), { gx: Z[se].sheet.grid[0], gy: Z[se].sheet.grid[1], x: hub.x, z: hub.z });
  for (const z of Object.values(Z)) {
    z.ctx = zoneContext({ terrain: z.terrain, nav: z.nav, placements: z.bake, reserve: PLACES.zones[z.eid].asks, province: PC, cell: { gx: z.sheet.grid[0], gy: z.sheet.grid[1] }, pinned: new Set(Object.keys(PINS[z.wid] || {})) });
    z.ctx.placed = z.file.placements;
  }
  return { Z, PINS };
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
  const { Z, PINS } = CTX.get(pm[0]);
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
  // 2. every placement the sea took (or whose loop now runs into it)
  const gone = new Set();
  for (const p of pl) {
    const why = problemOf(ctx, p) || (nearHarbour(p) ? 'by the harbour' : null); if (!why) continue;
    const ox = p.x, oz = p.z, R = p.radius ?? 1.5;
    let spot = null;
    const nearScore = (x, z0) => -Math.hypot(x - ox, z0 - oz) - (p.template === 'fishing_plot' || p.role === 'fisher' ? Math.max(0, ctx.waterDist(x, z0) - R - 12) * 3 : 0);
    const score = (x, z0) => (nearHarbour(p, x, z0) || (p.type === 'curio' && sameCurioNear(ctx, p, x, z0)) || ((p.stray || p.roam) && settlementEdge(ctx, x, z0) < 70) ? -Infinity : nearScore(x, z0));
    // (a second, wider look — play-test 12, #81: the regenerated Torbor Downs took whole stretches of coast and hillside)
    for (const reach of PROV ? [1, 2.6] : [1]) {
      if (spot) break;
      if (DISC.has(p.type) && p.radius != null) spot = findSpot(ctx, rngFor(p.id + ':coast' + (reach > 1 ? ':wide' : '')), ruleKind(p), R, { near: { x: ox, z: oz, min: 0, max: 450 * reach }, spread: 0, tries: 6000 * reach, score });
      else spot = findPoint(ctx, rngFor(p.id + ':coast' + (reach > 1 ? ':wide' : '')), { x: ox, z: oz, min: 0, max: 300 * reach }, { allowTown: true, prefer: nearScore });
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
    changed = true;
  }
  if (gone.size) z.file.placements = pl.filter(p => !gone.has(p));
  if (changed && !CHECK) {
    writeFileSync(new URL(z.fileName, ROOT), JSON.stringify(z.file, null, 1) + '\n');
    writeFileSync(new URL('data/world/site-pins.json', ROOT), JSON.stringify(PINS, null, 1).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
  }
}
console.log(report.length ? report.join('\n') : 'nothing the sea took');
if (CHECK && changed) process.exit(1);
