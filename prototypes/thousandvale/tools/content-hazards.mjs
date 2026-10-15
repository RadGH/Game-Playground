#!/usr/bin/env node
// Thousandvale — VHARLEN'S HAZARD SITES from the baked island (Expansion 1 §4; stream S).
//
//   node tools/content-hazards.mjs --province=vharlen          write data/provinces/vharlen-hazards.json
//   node tools/content-hazards.mjs --province=vharlen --check  change nothing; exit 1 when the file would change
//
// Run it after any re-bake of the island, AFTER place-vignettes / content-towns / content-givers / content-hunts (it keeps
// clear of the NPCs, folk, waystones and camps those place). The bake never writes this file; the server reads it through
// js/sim/province-files.js (`hazards`, a PLACED file: Torbor Downs has none).
//
// WHAT IT PLACES (world metres; the rules of each are js/rules/hazards.js):
//   springs   every hot-spring pool stream T baked (B's `lake` placements with data.kind hot_spring) + the crater lake,
//             whose warm SHALLOWS count (kind crater_lake: a ring SPRING.shore m wide inside its rim)
//   geysers   4–7 in the Steamwood, Fumarole Fen and Sulphur Bight, each on a flat, dry, reachable spot away from roads,
//             towns and people — preferring a spot with a LEDGE beside it: ground 3–12 m higher, 8–26 m away, that you
//             cannot simply walk up to (a cliff in between). `ledge` records it (the tests throw a body at it).
//   vents     8–10 fissure lines in the Pumice Wastes, Kiln Ridge and the Caldera: 10–16 m long, the WHOLE line at least
//             VENT_RULE.road m from any road, far from towns, people and waystones, and near a monster camp when one fits
//             (a fight beside one is the point).
//   ashfall   the world zones with ash weather (client look only).
// Same inputs -> same output (no random numbers; ties broken by position).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseTerrain, parseNav, NAV } from '../js/rules/terrain-read.js';
import { provinceComponents } from './content-place.mjs';
import { provinceArg, provinceDataPath } from './content-lib.mjs';
import { ASHFALL, SPRING, GEYSER, VENT, hashId } from '../js/rules/hazards.js';
import { stepMove } from '../js/sim/movement.js';

const ROOT = new URL('../', import.meta.url);
const P = f => new URL(f, ROOT);
const readJ = f => JSON.parse(readFileSync(P(f), 'utf8'));
const optJ = f => { try { return readJ(f); } catch { return null; } };
const CHECK = process.argv.includes('--check');
const PROV = provinceArg(process.argv);
const ZM = 2048;

/** Which sheet zones get what (EXPANSION-1.md §4). */
export const HAZARD_ZONES = Object.freeze({
  geysers: ['steamwood', 'fumarole_fen', 'sulphur_bight'],
  vents: ['pumice_wastes', 'kiln_ridge', 'the_caldera'],
});
export const GEYSER_RULE = Object.freeze({ lattice: 6, flat: 14, ring: 3.2, road: 30, town: 70, settle: 90, people: 30, things: 12, camp: 6, gap: 140, min: 4, max: 7,
  ledge: { from: 8, to: 26, rise: [3, 12], flat: 30 } });
export const VENT_RULE = Object.freeze({ lattice: 8, flat: 22, len: [10, 16], road: 35, town: 90, settle: 110, people: 40, waystone: 50, things: 10, camp: 4, campNear: 45, gap: 110, count: { pumice_wastes: 8, kiln_ridge: 8, the_caldera: 10 } });
/** Spring names (by the baked id); the sheet's `specialtySites` (stream C) win when they name one. */
const SPRING_NAMES = { hot_spring_1: 'The Kettle Pools', hot_spring_2: 'Fernwash Spring', hot_spring_3: 'Mosswater Spring', hot_spring_4: 'The Rim-keepers\' Bath', hot_spring_5: 'Bubblemere', hot_spring_6: 'Stiltreach Soak', crater_lake: 'Crater Lake shallows' };
const PEOPLE = new Set(['npc', 'folk', 'guard', 'cart', 'giver', 'angler', 'trainer']);

function chamfer(bits, S, step, test) {
  const d = new Float32Array(S * S).fill(1e9);
  for (let k = 0; k < S * S; k++) if (test(bits[k])) d[k] = 0;
  const A = step, D = step * Math.SQRT2;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const k = j * S + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + A); if (j > 0) { v = Math.min(v, d[k - S] + A); if (i > 0) v = Math.min(v, d[k - S - 1] + D); if (i < S - 1) v = Math.min(v, d[k - S + 1] + D); } d[k] = v; }
  for (let j = S - 1; j >= 0; j--) for (let i = S - 1; i >= 0; i--) { const k = j * S + i; let v = d[k];
    if (i < S - 1) v = Math.min(v, d[k + 1] + A); if (j < S - 1) { v = Math.min(v, d[k + S] + A); if (i < S - 1) v = Math.min(v, d[k + S + 1] + D); if (i > 0) v = Math.min(v, d[k + S - 1] + D); } d[k] = v; }
  return d;
}

/** Everything about one zone the placer needs (zone metres inside, world metres out). */
function zoneFacts(eid, wid, sheet) {
  const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number);
  const t = parseTerrain(readFileSync(P(`data/zones/${wid}/terrain.bin`)));
  const nav = parseNav(readFileSync(P(`data/zones/${wid}/nav.bin`)));
  const { size: S, step, bits } = nav;
  const idx = (x, z) => Math.min(S - 1, Math.max(0, Math.round(z / step))) * S + Math.min(S - 1, Math.max(0, Math.round(x / step)));
  const dRoad = chamfer(bits, S, step, b => (b & NAV.ROAD) !== 0);
  const dTown = chamfer(bits, S, step, b => (b & (NAV.TOWN | NAV.BUILDING)) !== 0);
  const baked = (optJ(`data/zones/${wid}/placements.json`) || {}).placements || [];
  const vig = optJ(`data/vignettes/placements/${wid}.json`) || {};
  const extra = [`data/vignettes/placements/${wid}.quest.json`, `data/vignettes/placements/${wid}.hunt.json`].flatMap(f => (optJ(f) || {}).placements || []);
  const placed = [...(vig.placements || []), ...extra];
  const settlements = [...(vig.settlements || []), ...baked.filter(p => p.kind === 'settlement').map(p => ({ x: p.x, z: p.z, r: (p.data && p.data.r) || 60 }))];
  return { eid, wid, zx, zy, ox: zx * ZM, oz: zy * ZM, t, nav, S, step, bits, idx, dRoad, dTown, baked, placed, settlements, band: (sheet.zones[eid] || {}).band || sheet.band, grid: (sheet.zones[eid] || {}).grid, hash: t.meta.inputHash || null };
}

const passBits = b => (b & NAV.WALK) !== 0 && (b & (NAV.SOLID | NAV.BUILDING | NAV.DEEP | NAV.SHALLOW | NAV.STEEP | NAV.ROAD | NAV.TOWN)) === 0;
/** A dry, walkable, not-too-steep point (zone metres). */
function dryFlat(F, x, z, maxSlope) {
  if (x < 4 || z < 4 || x > ZM - 4 || z > ZM - 4) return false;
  if (!passBits(F.bits[F.idx(x, z)])) return false;
  if (F.t.moveAt(x, z) !== 'walk') return false;
  if ((F.t.waterAt(x, z).depth || 0) > 0.05) return false;
  return F.t.slopeAt(x, z) <= maxSlope;
}
/** Clear of everything a geyser / vent must keep away from (zone metres; `R` the rule). */
function clearOfThings(F, x, z, R, extraR = 0) {
  for (const s of F.settlements) if (Math.hypot(s.x - x, s.z - z) < (s.r || 60) + R.settle + extraR) return false;
  for (const p of F.placed) {
    if (!Number.isFinite(p.x)) continue;
    const d = Math.hypot(p.x - x, p.z - z) - extraR;
    if (p.type === 'camp') { if (d < (p.radius || 8) + R.camp) return false; continue; }
    if (p.type === 'waystone') { if (d < (R.waystone || R.people)) return false; continue; }
    if (PEOPLE.has(p.type)) { if (d < R.people) return false; continue; }
    if (d < (p.radius || 4) + R.things) return false;
  }
  for (const b of F.baked) if ((b.kind === 'event_site' || b.kind === 'dungeon_door' || b.kind === 'harbour') && Math.hypot(b.x - x, b.z - z) - extraR < 40) return false;
  for (const b of F.baked) if (b.kind === 'lake' && Math.hypot(b.x - x, b.z - z) - extraR < ((b.data && b.data.r) || 10) + 12) return false;
  return true;
}
const inMain = (PC, F, x, z) => { const i = F.grid[0] * PC.n + Math.round(x / F.step), j = F.grid[1] * PC.n + Math.round(z / F.step); return PC.label[j * PC.W + i] === PC.main; };

/** A zone's terrain as stepMove reads it (zone metres, with B's nav so a rock or a wall stops the flight as it would in game). */
function moveTerrain(F) {
  return { heightAt: (x, z) => F.t.heightAt(x, z), walkable: (x, z) => F.t.walkable(x, z), waterAt: (x, z) => F.t.waterAt(x, z), moveAt: (x, z) => F.t.moveAt(x, z),
    bounds: { minX: 0, minZ: 0, maxX: ZM, maxZ: ZM }, nav: { at: (x, z) => F.bits[F.idx(x, z)] } };
}
/**
 * Throw a body from (x, z) the way the server does (GEYSER.launchVy + glide) and steer it along `yaw` the whole way —
 * js/sim/movement.js stepMove itself, 50 ms steps. Returns where it lands.
 */
export function throwFrom(T, x, z, yaw, { steps = 400 } = {}) {
  const st = { x, z, y: T.heightAt(x, z), vy: GEYSER.launchVy, airborne: true, glide: true };
  const inp = { mx: Math.sin(yaw), mz: Math.cos(yaw), b: 0 };
  let top = st.y;
  for (let i = 0; i < steps && st.airborne; i++) { stepMove(st, inp, 50, T); top = Math.max(top, st.y); }
  return { x: st.x, z: st.z, y: st.y, top, landed: !st.airborne, swim: !!st.swim };
}
/** The best ledge a throw from (x, z) lands on: { x, z, rise, dist, yaw } (ground 3+ m higher, flat, reachable) or null. */
function ledgeFrom(F, PC, x, z, T) {
  const R = GEYSER_RULE.ledge, h0 = F.t.heightAt(x, z);
  // cheap look first: is there higher walkable ground within reach on any bearing?
  let any = false;
  for (let a = 0; a < 16 && !any; a++) { const ang = a / 16 * Math.PI * 2; for (let d = R.from; d <= R.to && !any; d += 3) { const px = x + Math.sin(ang) * d, pz = z + Math.cos(ang) * d; if (px > 2 && pz > 2 && px < ZM - 2 && pz < ZM - 2 && F.t.heightAt(px, pz) - h0 >= R.rise[0]) any = true; } }
  if (!any) return null;
  let best = null;
  for (let a = 0; a < 24; a++) {
    const yaw = a / 24 * Math.PI * 2, L = throwFrom(T, x, z, yaw);
    if (!L.landed || L.swim) continue;
    const rise = L.y - h0, dist = Math.hypot(L.x - x, L.z - z);
    if (rise < R.rise[0] || rise > R.rise[1] || F.t.moveAt(L.x, L.z) !== 'walk' || F.t.slopeAt(L.x, L.z) > R.flat || !inMain(PC, F, L.x, L.z)) continue;
    // a ledge worth the throw: you could not have just walked there (the straight walk meets a cliff on the way)
    let cliff = false;
    for (let d = 1; d < dist; d += 1) { const mv = F.t.moveAt(x + Math.sin(yaw) * d, z + Math.cos(yaw) * d); if (mv === 'steep' || mv === 'out') { cliff = true; break; } }
    const score = rise + (cliff ? 8 : 0);
    if (!best || score > best.score) best = { x: L.x, z: L.z, rise: Math.round(rise * 10) / 10, dist: Math.round(dist), yaw: Math.round(yaw * 1000) / 1000, cliff, score };
  }
  return best;
}

function placeGeysers(F, PC) {
  const G = GEYSER_RULE, cands = [], T = moveTerrain(F);
  for (let z = 40; z < ZM - 40; z += G.lattice) for (let x = 40; x < ZM - 40; x += G.lattice) {
    if (!dryFlat(F, x, z, G.flat)) continue;
    const k = F.idx(x, z);
    if (F.dRoad[k] < G.road || F.dTown[k] < G.town) continue;
    let ring = true;
    for (let a = 0; a < 8 && ring; a++) { const px = x + Math.cos(a * Math.PI / 4) * G.ring, pz = z + Math.sin(a * Math.PI / 4) * G.ring; if (!dryFlat(F, px, pz, G.flat + 4)) ring = false; }
    if (!ring || !inMain(PC, F, x, z) || !clearOfThings(F, x, z, G)) continue;
    // a spot a traveller passes within sight of (30-220 m from a road) is worth a little more; the hash spreads ties over the zone
    cands.push({ x, z, seen: F.dRoad[k] <= 220 ? 2 : 0, h: (hashId(`${F.wid}:${x}:${z}`) % 1000) / 1000 });
  }
  for (const c of cands) { const l = ledgeFrom(F, PC, c.x, c.z, T); c.ledge = l; c.score = (l ? 100 + l.score : 0) + c.seen + c.h; }
  cands.sort((a, b) => b.score - a.score || a.z - b.z || a.x - b.x);
  const out = [];
  const far = c => out.every(o => Math.hypot(o.x - c.x, o.z - c.z) >= G.gap);
  for (const c of cands) { if (out.length >= G.max) break; if (c.ledge && far(c)) out.push(c); }
  for (const c of cands) { if (out.length >= G.min) break; if (far(c)) out.push(c); }
  return out.sort((a, b) => a.z - b.z || a.x - b.x);
}

function placeVents(F, PC) {
  const V = VENT_RULE, want = V.count[F.eid] || 8, cands = [];
  const camps = F.placed.filter(p => p.type === 'camp' && Number.isFinite(p.x));
  for (let z = 40; z < ZM - 40; z += V.lattice) for (let x = 40; x < ZM - 40; x += V.lattice) {
    if (!dryFlat(F, x, z, V.flat)) continue;
    const k = F.idx(x, z);
    if (F.dRoad[k] < V.road + 10 || F.dTown[k] < V.town) continue;
    if (!inMain(PC, F, x, z)) continue;
    const h = hashId(`${F.wid}:${x}:${z}`);
    const len = V.len[0] + (h % (V.len[1] - V.len[0] + 1)), yaw = ((h >>> 8) % 12) / 12 * Math.PI;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    let ok = true;
    for (let s = -len / 2; s <= len / 2 && ok; s += 1) for (const off of [-1.4, 0, 1.4]) {
      const px = x + dx * s + dz * off, pz = z + dz * s - dx * off;
      if (!dryFlat(F, px, pz, V.flat + 6) || F.dRoad[F.idx(px, pz)] < V.road) { ok = false; break; }
    }
    if (!ok || !clearOfThings(F, x, z, V, len / 2)) continue;
    let near = Infinity; for (const c of camps) near = Math.min(near, Math.hypot(c.x - x, c.z - z) - (c.radius || 8));
    const score = near <= V.campNear ? 10 - near / 10 : 0;
    cands.push({ x, z, len, yaw, score, camp: near <= V.campNear ? Math.round(near) : null });
  }
  cands.sort((a, b) => b.score - a.score || a.z - b.z || a.x - b.x);
  const out = [];
  for (const c of cands) { if (out.length >= want) break; if (out.every(o => Math.hypot(o.x - c.x, o.z - c.z) >= V.gap)) out.push(c); }
  return out.sort((a, b) => a.z - b.z || a.x - b.x);
}

const r1 = v => Math.round(v * 10) / 10;

export function buildHazards(prov = PROV) {
  const sheet = readJ(`data/provinces/${prov}.json`);
  const map = readJ('data/world/province-map.json').provinces[prov].map;
  const names = Object.fromEntries(((sheet.specialtySites || []).filter(s => s && s.id && s.name)).map(s => [s.id, s.name]));
  const facts = {};
  for (const [eid, wid] of Object.entries(map)) if (existsSync(P(`data/zones/${wid}/terrain.bin`))) facts[eid] = zoneFacts(eid, wid, sheet);
  const se = sheet.grid.start, hubF = facts[se];
  const hub = hubF.settlements[0] || { x: ZM / 2, z: ZM / 2 };
  const PC = provinceComponents(Object.values(facts).map(F => ({ eid: F.eid, gx: F.grid[0], gy: F.grid[1], nav: F.nav })), { gx: hubF.grid[0], gy: hubF.grid[1], x: hub.x, z: hub.z });
  const out = { springs: [], geysers: [], vents: [] }, problems = [];
  const levelOf = F => (F.band && F.band[1]) || 10;
  for (const F of Object.values(facts)) {
    for (const b of F.baked) {
      if (b.kind !== 'lake' || !b.data || (b.data.kind !== 'hot_spring' && b.data.kind !== 'crater_lake')) continue;
      const s = { id: b.id, kind: b.data.kind, zone: F.wid, name: names[b.id] || SPRING_NAMES[b.id] || 'Hot spring', x: r1(b.x + F.ox), z: r1(b.z + F.oz), r: b.data.r, level: r1(b.data.level) };
      if (s.kind === 'crater_lake') s.shore = SPRING.shore;
      out.springs.push(s);
    }
    if (HAZARD_ZONES.geysers.includes(F.eid)) {
      const gs = placeGeysers(F, PC);
      if (gs.length < GEYSER_RULE.min) problems.push(`${F.eid}: only ${gs.length} geysers`);
      gs.forEach((g, i) => out.geysers.push({ id: `${F.eid}_geyser_${i + 1}`, zone: F.wid, x: r1(g.x + F.ox), z: r1(g.z + F.oz), r: GEYSER.r, level: levelOf(F),
        ...(g.ledge ? { ledge: { x: r1(g.ledge.x + F.ox), z: r1(g.ledge.z + F.oz), rise: g.ledge.rise, dist: g.ledge.dist, yaw: g.ledge.yaw, cliff: g.ledge.cliff } } : {}) }));
    }
    if (HAZARD_ZONES.vents.includes(F.eid)) {
      const vs = placeVents(F, PC);
      if (vs.length < 6) problems.push(`${F.eid}: only ${vs.length} vents`);
      vs.forEach((v, i) => { const dx = Math.sin(v.yaw) * v.len / 2, dz = Math.cos(v.yaw) * v.len / 2;
        out.vents.push({ id: `${F.eid}_vent_${i + 1}`, zone: F.wid, ax: r1(v.x - dx + F.ox), az: r1(v.z - dz + F.oz), bx: r1(v.x + dx + F.ox), bz: r1(v.z + dz + F.oz), w: VENT.w, level: levelOf(F), ...(v.camp != null ? { camp: v.camp } : {}) }); });
    }
  }
  const doc = {
    _doc: 'Stream S (Expansion 1 §4) — MADE by tools/content-hazards.mjs from the baked island; do not edit by hand, re-run the tool after a re-bake (and after the place-vignettes / content-* chain). WORLD metres. `springs` = hot-spring pools (and the crater lake, whose warm shallows count: a ring `shore` m wide inside `r`) — stand in one out of combat for Steam-soaked. `geysers` = a mouth of radius `r` that throws you ~14 m up on its own cycle (js/rules/hazards.js cycleOf); `ledge` = the higher ground beside it the throw is for. `vents` = fissure lines a -> b, `w` wide, that warn then spout fire; `level` = the zone band top the damage is scaled to. `ashfall.zones` = world zones with ash weather (client look only). `terrain` = each zone\'s bake hash when this was made.',
    province: prov,
    terrain: Object.fromEntries(Object.values(facts).map(F => [F.wid, F.hash])),
    ...out,
    ashfall: { zones: ASHFALL.zones.filter(z => Object.values(map).includes(z)) },
  };
  return { doc, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { doc, problems } = buildHazards(PROV);
  const path = provinceDataPath(PROV, 'hazards');
  const text = JSON.stringify(doc, null, 1) + '\n';
  for (const p of problems) console.log('problem:', p);
  console.log(`${PROV}: ${doc.springs.length} springs, ${doc.geysers.length} geysers (${doc.geysers.filter(g => g.ledge).length} with a ledge), ${doc.vents.length} vents -> ${path}`);
  if (CHECK) { const cur = existsSync(P(path)) ? readFileSync(P(path), 'utf8') : ''; if (cur !== text) { console.log('would change'); process.exit(1); } }
  else writeFileSync(P(path), text);
}
