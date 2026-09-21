#!/usr/bin/env node
// Farhold — stand in one spot on one world and print what the generator put there.
//
// Round 17. The play-test reports for this round were all of the same shape: *"at seed 56138,
// Chodikvraun III, x 11572, z 2995, the centre of the town has a bunch of stuff semi-underwater,
// the water does not touch the shoreline, there is a tower inside of the bridge, and the bridge
// only connects to one side of the road."* Four faults, one coordinate, and no way to look at any
// of them without flying there.
//
// So this does what a player cannot: it builds the EXACT world the game builds — same seed search,
// same map size, same `balance.terrain` knobs — runs the real town planner over the real ground,
// and prints a number for every one of those four claims. Nothing here is a stand-in; the only
// thing it does not do is draw.
//
//   node prototypes/farhold/tools/probe-worldgen.mjs
//   node prototypes/farhold/tools/probe-worldgen.mjs --seed 56138 --planet "Chodikvraun III" --x 11572 --z 2995
//   node prototypes/farhold/tools/probe-worldgen.mjs --seed 4477 --x 50788 --z 23588   # Pewargate
//   node prototypes/farhold/tools/probe-worldgen.mjs --ore                              # item 7 only
//
// `--planet` is optional: without it the probe lands where `createWorld` would have landed you.
// With it, the named world of that seed's system is used, which is how a report's own coordinates
// are reproduced — the player may have flown somewhere before they saw the bug.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createWorld, createSystem, makeTerrain, setMetresPerCell, M_PER_CELL_DEFAULT, M_PER_CELL,
} from '../js/planet.js';
import { generatePlanetMap } from '../../../universe/js/planetmap.js';
import { footprintOf, streetLanes } from '../js/town-plan.js';
import { ringCrossings } from '../js/roadplan.js';
import { planTown, cultureFor } from '../../../proctown/js/townplan.js';
import { describeBuilding, radiusOf, stallsFor } from '../../../proctown/js/buildkit.js';
import { padSpotFor, boardSpotFor } from '../js/waypoints.js';
import { createNodeWorld } from '../js/resources.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', f), 'utf8'));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? (args[i + 1] ?? true) : fallback;
};
const SEED = Number(flag('seed', 56138));
const PLANET = flag('planet', 'Chodikvraun III');
const AT_X = Number(flag('x', 11572));
const AT_Z = Number(flag('z', 2995));
const ORE_ONLY = args.includes('--ore');
/**
 * HOW BIG THE PLANET WAS, WHICH IS THE ONLY WAY A REPORT'S COORDINATES MEAN ANYTHING.
 *
 * A world position is in metres and a metre is `M_PER_CELL_DEFAULT * planetScale` of a map cell, so
 * the same x and z land somewhere completely different on a different size setting. Seed 56138 at
 * x 11572 z 2995 is Grassland at 21 m on **Super tiny** (0.1) with a town seventeen metres away —
 * and Sea Ice 1,178 m under the ocean on Full. The report said Grassland and altitude 24, so 0.1 is
 * the world the user was standing on, and that is the default here.
 */
const SCALE = Number(flag('scale', 0.1));

const balance = read('data/balance.json');
const resourceData = read('data/resources.json');

const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const line = s => console.log(s);
const rule = t => line('\n' + t + '\n' + '-'.repeat(t.length));

// ---------------------------------------------------------------------------- the world

// the same two knobs main.js sets before it builds anything
setMetresPerCell(M_PER_CELL_DEFAULT * SCALE);
const mapSize = {
  width: balance.world?.width ?? 256,
  height: balance.world?.height ?? 128,
  regionScale: 2,                                 // main.js's own default
};

/**
 * The world the player was standing on.
 *
 * `createWorld` with `liveable: true` walks the seed forward until the system holds a world you
 * could live on, so the seed a player types is a STARTING POINT and the system they land in may be
 * a few seeds along. `--planet` then picks the body by name out of that system, because the report
 * may have been written after a flight.
 */
function buildWorld() {
  const created = createWorld({ seed: SEED, ...mapSize, habitable: true, liveable: true });
  if (!PLANET || created.planet?.name === PLANET) {
    return { ...created, terrain: makeTerrain(created.world, created.planet, balance.terrain) };
  }
  // the named body, anywhere in that system — a moon counts, which is why the moons are flattened in
  const bodies = [...created.system.planets, ...created.system.planets.flatMap(p => p.moons || [])];
  const planet = bodies.find(p => p.name === PLANET);
  if (!planet) {
    line(`! seed ${SEED} (system seed ${created.systemSeed}) has no "${PLANET}". It has:`);
    for (const p of bodies) line('    ' + p.name);
    process.exit(1);
  }
  const world = generatePlanetMap(planet, mapSize);
  return { ...created, planet, world, terrain: makeTerrain(world, planet, balance.terrain) };
}

const { planet, world, terrain, systemSeed } = buildWorld();
line(`seed ${SEED} -> system seed ${systemSeed} · ${planet.name} · ${M_PER_CELL} m a cell`
  + ` · ${terrain.width}x${terrain.height} cells`);
line(`probe at x ${AT_X} z ${AT_Z} · ground ${f2(terrain.heightAt(AT_X, AT_Z))} m`
  + ` · biome ${terrain.biomeAt(AT_X, AT_Z)?.name || '?'}`);

// ---------------------------------------------------------------------------- item 7: ore on roads

/**
 * Item 7 — *"try to prevent spawning Clay and other resources directly on the road."*
 *
 * `createNodeWorld` scatters a tile of seams from the tile's own rng and then drops the ones that
 * are underwater or inside a cliff. Nothing ever asked where the roads were. This counts how many
 * of them land on one, over a block of tiles around the probe.
 */
function probeOre() {
  rule('ITEM 7 — resource seams on the road');
  const ore = createNodeWorld({ data: resourceData, seed: systemSeed, terrain, planet, band: 'medium' });
  const TILE = ore.TILE;
  const tx0 = Math.floor(AT_X / TILE), tz0 = Math.floor(AT_Z / TILE);
  let total = 0, onRoad = 0, onDeck = 0;
  const worst = [];
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      for (const n of ore.around((tx0 + dx + 0.5) * TILE, (tz0 + dz + 0.5) * TILE)) {
        total++;
        const road = terrain.roadAt(n.x, n.z);
        const deck = terrain.bridgedAt ? terrain.bridgedAt(n.x, n.z) : false;
        if (deck) onDeck++;
        if (road > 0.45 || deck) {
          onRoad++;
          if (worst.length < 12) worst.push({ n, road, deck });
        }
      }
    }
  }
  line(`${total} seams in the tiles around the probe; ${onRoad} of them on a road`
    + ` (${onDeck} on a bridge deck) — ${((onRoad / Math.max(1, total)) * 100).toFixed(1)}%`);
  for (const { n, road, deck } of worst) {
    line(`   ${n.resource.padEnd(14)} ${n.kind.padEnd(14)} at ${n.x | 0},${n.z | 0}`
      + ` roadAt ${f2(road)}${deck ? ' ON A BRIDGE DECK' : ''}`);
  }
}

if (ORE_ONLY) { probeOre(); process.exit(0); }

// ---------------------------------------------------------------------------- the town

const towns = (world.nodes || [])
  .filter(n => n.type === 'settlement' || n.type === 'port')
  .map(n => ({ ...n, wx: n.x * M_PER_CELL, wz: n.y * M_PER_CELL }));
const node = towns
  .map(t => ({ t, d: Math.hypot(t.wx - AT_X, t.wz - AT_Z) }))
  .sort((a, b) => a.d - b.d)[0];

rule('ITEM 4a — town buildings standing in the water');
if (!node || node.d > 1200) {
  line(`no settlement within 1.2 km of the probe (nearest ${node ? (node.d | 0) : '-'} m)`);
} else {
  const t = node.t;
  line(`${t.name || 'a settlement'} (size ${t.size || 1}, ${t.race || 'human'}) at ${t.wx | 0},${t.wz | 0}`
    + ` — ${node.d | 0} m from the probe`);
  const { ring } = footprintOf(t.size || 1);
  const culture = cultureFor({ race: t.race, biome: t.biome });
  const cx = t.wx, cz = t.wz;

  // the SAME plan js/features.js builds: same seed fold, same links, same buildable test
  const plan = planTown({
    seed: ((world.seed ?? systemSeed) ^ (t.id * 2654435761)) >>> 0,
    size: t.size || 1,
    culture,
    links: ringCrossings(terrain.roadPaths, cx, cz, ring, { limit: 4 }).map(c => [c.dx, c.dz]),
    heightAt: (lx, lz) => terrain.heightAt(cx + lx, cz + lz),
    buildable: (lx, lz) => {
      const x = cx + lx, z = cz + lz;
      if (terrain.roadAt(x, z) > 0.45) return false;
      if (terrain.bridgedAt?.(x, z)) return false;
      return !terrain.underwater(x, z) && terrain.riverAt(x, z) <= 0.3 && terrain.slopeAt(x, z, 6) <= 0.62;
    },
  });
  line(`${plan.plots.length} plots, ${plan.streets.length} streets, ${plan.blocked || 0} blocked by the ground`);

  /**
   * "SEMI-UNDERWATER" IS A QUESTION ABOUT A FOOTPRINT, NOT ABOUT A CENTRE.
   *
   * Every water test in `js/features.js` asks `underwater(x, z)` of ONE point — the middle of the
   * thing being placed. A hut is six metres across and a warehouse eleven, so a plot whose centre
   * stands thirty centimetres clear of a river has a third of itself in the water and passes every
   * test there is. So this walks a ring of samples at the thing's own radius, which is what a
   * player sees.
   *
   * It checks everything the town builder stands on the ground, not just the plots: the well, the
   * waypoint pad, the notice board, the stalls, the wall, the towers and the gates all go down
   * through the same `place()` and all of them only ever asked about their own centre.
   */
  const spots = [];
  for (const plot of plan.plots) {
    const desc = describeBuilding({ plot, culture, townSeed: 1, seed: 1, want: plot.want || 'house', district: plot.district });
    spots.push({ what: plot.want || 'house', x: cx + plot.cx, z: cz + plot.cz, r: radiusOf(desc) });
  }
  spots.push({ what: 'well', x: cx + plan.square.cx, z: cz + plan.square.cz, r: 1.4 });
  const padOk = (x, z) => !terrain.waterAt(x, z) && !terrain.underwater(x, z)
    && terrain.riverAt(x, z) <= 0.3 && terrain.slopeAt(x, z, 4) <= 0.5;
  const pad = padSpotFor(t, padOk);
  spots.push({ what: 'waypoint', x: pad.x, z: pad.z, r: 3.2 });
  const board = boardSpotFor(t, padOk);
  spots.push({ what: 'noticeboard', x: board.x, z: board.z, r: 0.9 });
  for (const spot of stallsFor(plan, { culture, seed: 1, max: (t.size || 1) >= 3 ? 24 : 10 })) {
    spots.push({ what: 'stall', x: cx + spot.x, z: cz + spot.z, r: 1.6 });
  }
  const { wall, walled } = footprintOf(t.size || 1);
  const gateAngles = ringCrossings(terrain.roadPaths, cx, cz, wall).map(c => c.angle);
  if (walled) {
    const SEG = 6;
    const segments = Math.max(8, Math.round((Math.PI * 2 * wall) / SEG));
    for (let i = 0; i < segments; i++) {
      const a = ((i + 0.5) / segments) * Math.PI * 2;
      spots.push({ what: 'wall', x: cx + Math.cos(a) * wall, z: cz + Math.sin(a) * wall, r: 3.2 });
    }
    const towerAngles = [...gateAngles.flatMap(g => [g - 0.26, g + 0.26]),
      ...[0, 1, 2, 3].map(i => (i / 4) * Math.PI * 2 + 0.4)].slice(0, 10);
    for (const a of towerAngles) spots.push({ what: 'tower', x: cx + Math.cos(a) * wall, z: cz + Math.sin(a) * wall, r: 2.6 });
    for (const g of gateAngles.slice(0, 4)) spots.push({ what: 'gatehouse', x: cx + Math.cos(g) * wall, z: cz + Math.sin(g) * wall, r: 4 });
  }

  let wetCentre = 0, wetFoot = 0;
  const byKind = new Map();
  const shown = [];
  for (const s of spots) {
    // the game's own test, exactly as `place()` asks it
    const centre = terrain.underwater(s.x, s.z) || terrain.riverAt(s.x, s.z) > 0.3;
    if (centre) { wetCentre++; continue; }        // the game already drops this one
    let corners = 0, worstDepth = 0;
    for (let a = 0; a < 8; a++) {
      const px = s.x + Math.cos((a / 8) * Math.PI * 2) * s.r;
      const pz = s.z + Math.sin((a / 8) * Math.PI * 2) * s.r;
      const w = terrain.waterAt(px, pz);
      if (w) { corners++; worstDepth = Math.max(worstDepth, w.surface - terrain.heightAt(px, pz)); }
    }
    if (!corners) continue;
    wetFoot++;
    byKind.set(s.what, (byKind.get(s.what) || 0) + 1);
    if (shown.length < 14) shown.push({ ...s, corners, worstDepth });
  }
  line(`${spots.length} things the town builder stands on the ground`);
  line(`   ${wetCentre} the game already drops (its centre is in the water)`);
  line(`   ${wetFoot} it BUILDS with part of their footprint in the water   <- "semi-underwater"`);
  if (byKind.size) line('   by kind: ' + [...byKind].map(([k, n]) => `${k} x${n}`).join(', '));
  for (const s of shown) {
    line(`      ${s.what.padEnd(12)} at ${s.x | 0},${s.z | 0} r ${f2(s.r)}`
      + ` — ${s.corners}/8 of its edge in water, up to ${f2(s.worstDepth)} m deep`);
  }

  // how much of the town's own ground is under water at all
  let wetGround = 0, ground = 0;
  for (let a = 0; a < 360; a += 5) {
    for (let rr = 4; rr <= ring; rr += 4) {
      const x = cx + Math.cos((a * Math.PI) / 180) * rr, z = cz + Math.sin((a * Math.PI) / 180) * rr;
      ground++;
      if (terrain.waterAt(x, z)) wetGround++;
    }
  }
  line(`${wetGround}/${ground} (${((wetGround / ground) * 100) | 0}%) of the ground inside the town ring is under water`
    + `; the centre itself stands ${f2(terrain.heightAt(cx, cz))} m`
    + (terrain.waterAt(cx, cz) ? ` under ${f2(terrain.waterAt(cx, cz).depth)} m of water` : ' dry'));

  // -------------------------------------------------------------- 4c: a structure inside a bridge
  rule('ITEM 4c — a structure standing inside a bridge');
  const nearBridges = terrain.crossings.filter(c => Math.hypot(c.x - cx, c.z - cz) < ring + 600);
  line(`${nearBridges.length} crossings within reach of this town`);
  const covers = (c, x, z, pad = 0) => {
    const dx = x - c.x, dz = z - c.z;
    return Math.abs(dx * c.tx + dz * c.tz) <= c.halfLength + pad
      && Math.abs(dx * -c.tz + dz * c.tx) <= c.halfWidth + pad;
  };
  let clashes = 0;
  for (const plot of plan.plots) {
    const x = cx + plot.cx, z = cz + plot.cz;
    for (const c of nearBridges) {
      if (!covers(c, x, z, 3)) continue;
      clashes++;
      line(`   a plot at ${x | 0},${z | 0} is inside the bridge at ${c.x | 0},${c.z | 0}`
        + ` (deck ${f2(c.deck)} m, footprint ${f2(c.halfLength * 2)} x ${f2(c.halfWidth * 2)})`);
      break;
    }
  }
  // …and the towers, which are placed on the wall ring rather than on a plot
  if (walled) {
    const gates = gateAngles;
    const towerAngles = [...gates.flatMap(g => [g - 0.26, g + 0.26]),
      ...[0, 1, 2, 3].map(i => (i / 4) * Math.PI * 2 + 0.4)].slice(0, 10);
    for (const a of towerAngles) {
      const x = cx + Math.cos(a) * wall, z = cz + Math.sin(a) * wall;
      for (const c of nearBridges) {
        if (!covers(c, x, z, 2.6)) continue;
        clashes++;
        line(`   a TOWER at ${x | 0},${z | 0} (bearing ${((a * 180) / Math.PI) | 0}) stands inside`
          + ` the bridge at ${c.x | 0},${c.z | 0}   <- the user's "tower inside of the bridge"`);
        break;
      }
    }
    for (const g of gates.slice(0, 4)) {
      const x = cx + Math.cos(g) * wall, z = cz + Math.sin(g) * wall;
      for (const c of nearBridges) {
        if (!covers(c, x, z, 4)) continue;
        clashes++;
        line(`   a GATEHOUSE at ${x | 0},${z | 0} stands inside the bridge at ${c.x | 0},${c.z | 0}`);
        break;
      }
    }
    // the wall segments themselves
    const SEG = 6;
    const segments = Math.max(8, Math.round((Math.PI * 2 * wall) / SEG));
    let wallHits = 0;
    for (let i = 0; i < segments; i++) {
      const a = ((i + 0.5) / segments) * Math.PI * 2;
      const x = cx + Math.cos(a) * wall, z = cz + Math.sin(a) * wall;
      if (nearBridges.some(c => covers(c, x, z, 3.2))) wallHits++;
    }
    if (wallHits) { clashes += wallHits; line(`   ${wallHits} wall segments stand inside a bridge`); }
  }
  if (!clashes) line('   nothing overlaps a bridge deck');

  // -------------------------------------------------------------- streets over a bridge
  rule("ITEM 4c (2) — the town's own streets against the bridges");
  const overBridge = (lanes) => lanes.filter(lane =>
    lane.points.some(p => nearBridges.some(c => covers(c, p[0], p[1])))).length;
  // what proctown planned, and then what the game actually draws — `js/features.js` breaks a street
  // run at the water and, from round 17, at a bridge deck as well
  const planned = overBridge(streetLanes(plan, { cx, cz, terrain }));
  const drawn = overBridge(streetLanes(plan, {
    cx, cz, terrain,
    skip: (x, z) => terrain.underwater(x, z) || terrain.riverAt(x, z) > 0.3 || !!terrain.bridgedAt?.(x, z),
  }));
  line(`${planned} planned street lanes cross a bridge deck; ${drawn} of them are still drawn there`);
}

// ---------------------------------------------------------------------------- 4b: the water's edge

rule('ITEM 4b — the water sheet against its own bank');
{
  const R = 400;
  let sampled = 0, floating = 0, worst = 0, worstAt = null;
  for (const river of terrain.riverPaths) {
    for (let i = 0; i < river.points.length; i++) {
      const [x, z] = river.points[i];
      if (Math.hypot(x - AT_X, z - AT_Z) > R) continue;
      const surf = river.surface[i];
      const prev = river.points[Math.max(0, i - 1)], next = river.points[Math.min(river.points.length - 1, i + 1)];
      const dx = next[0] - prev[0], dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      for (const side of [1, -1]) {
        // walk out to the bank exactly as `waterRibbon` does, and see where it stops
        let out = river.half;
        const step = Math.max(1.5, river.half * 0.5);
        for (let d = river.half; d <= river.reach; d += step) {
          out = d;
          if (terrain.heightAt(x + nx * side * d, z + nz * side * d) >= surf) break;
        }
        const ex = x + nx * side * out, ez = z + nz * side * out;
        const ground = terrain.heightAt(ex, ez);
        sampled++;
        if (ground < surf - 0.05) {
          floating++;
          if (surf - ground > worst) { worst = surf - ground; worstAt = [ex | 0, ez | 0, out]; }
        }
      }
    }
  }
  line(`${sampled} sheet edges within ${R} m of the probe; ${floating} of them stop short of their bank`);
  if (worstAt) {
    line(`   worst: ${f2(worst)} m of open edge at ${worstAt[0]},${worstAt[1]}`
      + ` (the sheet ran the full ${f2(worstAt[2])} m to its reach and the ground never came back up)`);
  }
  // and the lakes, which have no widening pass at all
  for (const lake of terrain.lakes) {
    if (Math.hypot(lake.wx - AT_X, lake.wz - AT_Z) > R + lake.radius) continue;
    let dry = 0, wet = 0;
    for (const i of lake.cells) {
      const x = (i % terrain.width) * M_PER_CELL, z = Math.floor(i / terrain.width) * M_PER_CELL;
      if (terrain.heightAt(x, z) < lake.surface) wet++; else dry++;
    }
    line(`   lake at ${lake.wx | 0},${lake.wz | 0}: ${lake.cells.length} cells, surface ${f2(lake.surface)}`
      + `, ${dry} of them standing ABOVE their own water line`);
  }
}

// ---------------------------------------------------------------------------- 4d and 6: the bridges

rule('ITEMS 4d + 6 — bridges, and roads that stop at one');
{
  const R = 900;
  const near = terrain.crossings.filter(c => Math.hypot(c.x - AT_X, c.z - AT_Z) < R);
  line(`${terrain.crossings.length} crossings on this world; ${near.length} within ${R} m of the probe`);
  for (const c of near) {
    const road = terrain.roadPaths.find(r => String(r.id) === String(c.road));
    line(`   bridge at ${c.x | 0},${c.z | 0} on road ${c.road} (${c.klass}) — deck ${f2(c.deck)}`
      + ` over water ${f2(c.surf)} (+${f2(c.deck - c.surf)}), footprint ${f2(c.halfLength * 2)} long`
      + ` x ${f2(c.halfWidth * 2)} wide, mesh ${f2((c.meshHalfLength ?? c.halfLength) * 2)} long`);
    if (!road) { line('      ! the road this bridge belongs to is not in roadPaths'); continue; }
    // walk out along the road from each end of the deck and see whether there is carriageway there
    for (const side of [-1, 1]) {
      const where = side < 0 ? 'back' : 'ahead';
      let reach = 0, firstGap = null;
      for (let d = c.halfLength; d <= c.halfLength + 120; d += 3) {
        const x = c.x + c.tx * side * d, z = c.z + c.tz * side * d;
        const on = terrain.roadAt(x, z);
        if (on > 0.45) reach = d;
        else if (firstGap === null) firstGap = d;
      }
      line(`      ${where}: carriageway to ${f2(reach - c.halfLength)} m past the abutment`
        + (firstGap !== null ? `, first gap at ${f2(firstGap - c.halfLength)} m` : ', unbroken'));
    }
    // and the step a player walking it would have to climb at each abutment
    for (const side of [-1, 1]) {
      const x = c.x + c.tx * side * (c.halfLength + 1), z = c.z + c.tz * side * (c.halfLength + 1);
      const rs = terrain.roadSurfaceAt(x, z);
      line(`      ${side < 0 ? 'back' : 'ahead'} abutment: road surface ${rs === null ? 'NONE — the road ends here' : f2(rs)}`
        + `, ground ${f2(terrain.heightAt(x, z))}, deck ${f2(c.deck)}`);
    }
  }

  /**
   * ITEM 6 — *"the river collides with a road here and messes with the water. Can we make sure
   * crossings like this generate raised bridges instead?"*
   *
   * So: every point where a road's own polyline actually passes over the drawn water, checked
   * against the crossing list. Anything wet with no crossing over it is a road in a river.
   */
  let wetRoad = 0, covered = 0;
  const missed = [];
  for (const r of terrain.roadPaths) {
    for (let i = 0; i + 1 < r.points.length; i++) {
      const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      for (let d = 0; d < len; d += 4) {
        const x = ax + ((bx - ax) * d) / len, z = az + ((bz - az) * d) / len;
        if (Math.hypot(x - AT_X, z - AT_Z) > R) continue;
        const river = terrain.riverInfoAt(x, z);
        if (!river || river.dist > river.half) continue;       // not over the water itself
        wetRoad++;
        const span = terrain.crossings.some(c => {
          const dx = x - c.x, dz = z - c.z;
          return Math.abs(dx * c.tx + dz * c.tz) <= c.halfLength && Math.abs(dx * -c.tz + dz * c.tx) <= c.halfWidth;
        });
        if (span) covered++;
        else if (missed.length < 20) {
          const deck = terrain.roadSurfaceAt(x, z);
          missed.push({ x, z, surface: river.surface, deck, ground: terrain.heightAt(x, z), road: r.id, klass: r.klass });
        }
      }
    }
  }
  line(`${wetRoad} road samples sit over the water near the probe; ${covered} of them have a bridge`);
  for (const m of missed) {
    line(`   NO BRIDGE at ${m.x | 0},${m.z | 0} on road ${m.road} (${m.klass})`
      + ` — water ${f2(m.surface)}, road deck ${m.deck === null ? '-' : f2(m.deck)},`
      + ` ground ${f2(m.ground)} (${m.deck !== null && m.deck < m.surface ? 'THE ROAD IS UNDER THE WATER' : 'ground was raised into a plug'})`);
  }
}

probeOre();
line('');
