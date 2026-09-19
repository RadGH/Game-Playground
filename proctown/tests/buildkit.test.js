// node --test proctown/tests/buildkit.test.js
//
// The kit is what Farhold builds a town out of, so these are the guarantees the game relies on.
// The important one is `a roof's footprint always matches its walls` — that is the whole reason a
// roof is DERIVED from the wall rectangle rather than modelled next to it, and if it ever fails then
// "some roofs don't line up with the walls" is back and the design has been undone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIT, CULTURE_KIT, MESHES, BASE_KEYS, ROOF_KEYS, CULTURE_KEYS,
  describeBuilding, describeSpecimen, partsFor, roofFor, roofsCover, topRect,
  fitToPlot, heightOf, radiusOf, describeStall, stallParts, stallsFor, hash,
} from '../js/buildkit.js';
import { planTown, CULTURES, WANT_ORDER } from '../js/townplan.js';

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 256, 777, 4096, 20260918];

/** A plot the way the planner makes them: an oriented box that knows which edge fronts a street. */
const plotAt = (w, d, angle = 0, quarter = 1, extra = {}) => ({
  cx: 0, cz: 0, w, d, angle,
  facing: angle + quarter * Math.PI / 2,
  district: 'residential', want: 'house', ...extra,
});

// ---------------------------------------------------------------------------- determinism

test('the same seed is the same building, every time', () => {
  for (const culture of CULTURE_KEYS) {
    const plot = plotAt(11, 8, 0.4);
    const a = describeBuilding({ plot, culture, seed: 42, townSeed: 9 });
    const b = describeBuilding({ plot, culture, seed: 42, townSeed: 9 });
    assert.deepEqual(a, b, `${culture} did not reproduce its building`);
    assert.deepEqual(partsFor(a), partsFor(b), `${culture} did not reproduce its parts`);
  }
});

test('a different seed is a different building', () => {
  // if neighbouring seeds produce identical buildings the kit is not using the seed, and a town is
  // a row of the same house again
  let same = 0;
  for (const seed of SEEDS) {
    const plot = plotAt(12, 9);
    const a = describeBuilding({ plot, culture: 'human', seed });
    const b = describeBuilding({ plot, culture: 'human', seed: seed + 1 });
    if (a.base === b.base && a.roofType === b.roofType && a.colour.wall === b.colour.wall) same++;
  }
  assert.ok(same <= 2, `${same} of ${SEEDS.length} neighbouring seeds gave the same building`);
});

test('the town seed shifts the whole town, so a region reads as one place', () => {
  const plot = plotAt(10, 8);
  const a = describeBuilding({ plot, culture: 'human', seed: 5, townSeed: 1 });
  const b = describeBuilding({ plot, culture: 'human', seed: 5, townSeed: 2 });
  assert.equal(a.base, b.base);                   // the same building…
  assert.notEqual(a.colour.wall, b.colour.wall);  // …in a different town's colours
});

// ---------------------------------------------------------------------------- the roof

test('a roof is generated from the wall rectangle, so it is exactly the walls plus its eaves', () => {
  for (const type of ROOF_KEYS) {
    for (const rect of [{ x: 0, z: 0, w: 8, d: 5, y: 3 }, { x: -2.5, z: 1.5, w: 4, d: 9, y: 6.2 }]) {
      const eave = 0.4;
      const roof = roofFor(rect, { type, pitch: 0.9, eave, ridgeAlong: rect.w >= rect.d ? 'x' : 'z' });
      const board = roof.parts.find(p => p.tag === 'eave');
      assert.ok(board, `${type} has no eave board`);
      // the one hard assertion: the board IS the wall rectangle plus the same overhang all round
      assert.equal(board.x, rect.x, `${type} eave board is off centre in x`);
      assert.equal(board.z, rect.z, `${type} eave board is off centre in z`);
      assert.ok(Math.abs(board.w - (rect.w + eave * 2)) < 1e-9, `${type} eave board is the wrong width`);
      assert.ok(Math.abs(board.d - (rect.d + eave * 2)) < 1e-9, `${type} eave board is the wrong depth`);
      assert.ok(roof.height > 0.1, `${type} has no height`);
    }
  }
});

test('every roof covers its own walls, in every culture, on every base, on every seed', () => {
  let checked = 0;
  for (const culture of CULTURE_KEYS) {
    for (const base of BASE_KEYS) {
      for (const roof of KIT.bases[base].roofs) {
        for (const seed of [1, 3, 7, 42, 4096]) {
          const desc = describeSpecimen({ base, roof, culture, seed });
          assert.ok(roofsCover(desc), `${culture}/${base}/${roof}@${seed}: a roof misses its walls`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 2000, `only ${checked} combinations were checked`);
});

test('a roof is never taller than the building can carry', () => {
  for (const culture of CULTURE_KEYS) {
    for (const seed of SEEDS) {
      const desc = describeBuilding({ plot: plotAt(14, 9), culture, seed });
      const parts = partsFor(desc);
      const walls = parts.filter(p => p.tag === 'wall');
      const roof = parts.filter(p => p.tag === 'roof');
      if (!walls.length || !roof.length) continue;
      const wallTop = Math.max(...walls.map(p => p.y + p.h));
      const roofTop = Math.max(...roof.map(p => p.y + p.h));
      // a spire on a tower house is allowed to be tall; a kite over a hut is not
      assert.ok(roofTop - wallTop <= KIT.knobs.maxRoofHeight + 0.6,
        `${culture}@${seed}: ${(roofTop - wallTop).toFixed(1)} m of roof on ${wallTop.toFixed(1)} m of wall`);
    }
  }
});

// ---------------------------------------------------------------------------- the geometry

test('no combination yields NaN geometry, or a part with no size', () => {
  for (const culture of CULTURE_KEYS) {
    for (const base of BASE_KEYS) {
      for (const roof of KIT.bases[base].roofs) {
        for (const seed of [1, 7, 4096]) {
          const desc = describeSpecimen({ base, roof, culture, seed });
          for (const p of partsFor(desc)) {
            for (const key of ['x', 'y', 'z', 'w', 'h', 'd', 'yaw']) {
              assert.ok(Number.isFinite(p[key]),
                `${culture}/${base}/${roof}@${seed}: ${p.mesh}.${key} is ${p[key]}`);
            }
            assert.ok(Math.abs(p.w) > 0.001 && p.h > 0.001 && Math.abs(p.d) > 0.001,
              `${culture}/${base}/${roof}: a ${p.mesh} has no size`);
            assert.ok(MESHES.includes(p.mesh), `${p.mesh} is not one of the eight unit shapes`);
          }
          assert.ok(heightOf(desc) > 1, `${culture}/${base} is flat`);
          assert.ok(radiusOf(desc) > 0.5, `${culture}/${base} has no footprint`);
        }
      }
    }
  }
});

test('a building stands inside its plot, and its eaves do not reach the road', () => {
  for (const culture of CULTURE_KEYS) {
    for (const seed of SEEDS) {
      for (const [w, d] of [[5, 5], [9, 6], [14, 11], [20, 8]]) {
        for (const quarter of [0, 1, 2, -1]) {
          const plot = plotAt(w, d, 0.3, quarter);
          const desc = describeBuilding({ plot, culture, seed });
          const fit = fitToPlot(plot);
          // the walls are inside the plot rectangle…
          for (const m of desc.masses) {
            assert.ok(Math.abs(m.x) + m.w / 2 <= fit.w / 2 + 1e-6,
              `${culture} ${desc.base}: a wall is ${(Math.abs(m.x) + m.w / 2 - fit.w / 2).toFixed(2)} m outside its plot`);
            assert.ok(Math.abs(m.z) + m.d / 2 <= fit.d / 2 + 1e-6,
              `${culture} ${desc.base}: a wall is outside its plot in depth`);
          }
          /**
           * …the roof and its eaves stay within a hand's breadth of the plot line, and the yard
           * clutter stays inside the yard.
           *
           * Both numbers were measured after the fact and then tightened onto the real worst case:
           * a half-hipped roof used to put its clipped end a metre past the ridge, which on a
           * fifteen-metre longhouse is an eave over the lane, and a lean-to on a plot the building
           * already filled was two and a half metres into next door.
           */
          const structural = new Set(['wall', 'roof', 'eave', 'door', 'window', 'trim', 'chimney']);
          for (const p of partsFor(desc)) {
            const c = Math.abs(Math.cos(p.yaw)), s = Math.abs(Math.sin(p.yaw));
            const pw = Math.abs(p.w) * c + Math.abs(p.d) * s;
            const pd = Math.abs(p.w) * s + Math.abs(p.d) * c;
            const over = Math.max(Math.abs(p.x) + pw / 2 - fit.w / 2, Math.abs(p.z) + pd / 2 - fit.d / 2);
            const allowed = structural.has(p.tag) ? 0.6 : 2.6;
            assert.ok(over <= allowed,
              `${culture} ${desc.base}: a ${p.tag} hangs ${over.toFixed(2)} m past its plot`);
          }
        }
      }
    }
  }
});

test('the kit frame turns onto the plot frame, whichever edge fronts the street', () => {
  // a yaw of theta sends local +Z to (sin theta, cos theta); the frontage runs at (cos f, sin f)
  for (const facing of [0, 0.7, Math.PI / 2, 2.4, -1.1, Math.PI]) {
    const fit = fitToPlot({ w: 9, d: 5, angle: 0.2, facing });
    const fx = Math.sin(fit.yaw), fz = Math.cos(fit.yaw);
    assert.ok(Math.abs(fx - Math.cos(facing)) < 1e-9, 'the kit does not face its street');
    assert.ok(Math.abs(fz - Math.sin(facing)) < 1e-9, 'the kit does not face its street');
  }
  // …and the width and depth swap with the quarter turn
  const across = fitToPlot({ w: 9, d: 5, angle: 0, facing: Math.PI / 2 });
  assert.equal(across.w, 9);   // the frontage is on a Z edge, so the plot's width runs across it
  const along = fitToPlot({ w: 9, d: 5, angle: 0, facing: 0 });
  assert.equal(along.w, 5);    // the frontage is on an X edge, so the depth runs back from it
});

// ---------------------------------------------------------------------------- the cultures

test('every culture has at least three silhouettes nobody else builds', () => {
  const owners = {};
  for (const [key, cult] of Object.entries(CULTURE_KIT.cultures)) {
    for (const base of Object.keys(cult.bases)) (owners[base] ||= []).push(key);
  }
  for (const [key, cult] of Object.entries(CULTURE_KIT.cultures)) {
    const only = Object.keys(cult.bases).filter(b => owners[b].length === 1);
    assert.ok(only.length >= 3, `${key} has only ${only.length} bases of its own`);
    for (const sig of cult.signature) {
      assert.ok(only.includes(sig), `${key} calls ${sig} a signature but somebody else builds it`);
    }
  }
});

test('two cultures do not build the same town', () => {
  // the sameness test, in numbers: take the mix of bases each culture produces over real plans and
  // insist no two overlap more than half
  const mixes = {};
  for (const culture of CULTURE_KEYS) {
    const seen = {};
    let n = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = planTown({ seed, size: 4, culture });
      for (const plot of plan.plots) {
        const d = describeBuilding({ plot, culture, seed, want: plot.want, district: plot.district });
        seen[d.base] = (seen[d.base] || 0) + 1;
        n++;
      }
    }
    assert.ok(n > 15, `${culture} produced only ${n} buildings to judge`);
    assert.ok(Object.keys(seen).length >= 4, `${culture} only builds ${Object.keys(seen).length} shapes`);
    mixes[culture] = { seen, n };
  }
  for (const a of CULTURE_KEYS) {
    for (const b of CULTURE_KEYS) {
      if (a >= b) continue;
      let shared = 0;
      for (const [base, count] of Object.entries(mixes[a].seen)) {
        const other = (mixes[b].seen[base] || 0) / mixes[b].n;
        shared += Math.min(count / mixes[a].n, other);
      }
      assert.ok(shared < 0.62, `${a} and ${b} build ${Math.round(shared * 100)}% the same town`);
    }
  }
});

test('a culture reads in its colours as well as its shapes', () => {
  const walls = new Set(), roofs = new Set();
  for (const culture of CULTURE_KEYS) {
    const cult = CULTURE_KIT.cultures[culture];
    for (const c of cult.palette.wall) walls.add(c);
    for (const c of cult.palette.roof) roofs.add(c);
    assert.ok(cult.palette.wall.length >= 3, `${culture} has too few wall colours`);
    assert.ok(cult.street.colour && cult.townWall.colour && cult.night.lamp,
      `${culture} is missing its street, wall or night colour`);
    assert.ok(cult.stalls.length >= 3, `${culture} has too few kinds of stall`);
  }
  // no culture may share a whole palette with another
  assert.ok(walls.size >= CULTURE_KEYS.length * 3, 'the wall palettes overlap');
  assert.ok(roofs.size >= CULTURE_KEYS.length * 2, 'the roof palettes overlap');
});

test('poor and rich are built out of different things', () => {
  let differed = 0;
  for (const seed of SEEDS) {
    const poor = describeBuilding({ plot: plotAt(11, 8, 0, 1, { district: 'residential', want: 'hut' }), culture: 'human', seed });
    const rich = describeBuilding({ plot: plotAt(11, 8, 0, 1, { district: 'civic', want: 'hall' }), culture: 'human', seed });
    assert.ok(rich.wealth > poor.wealth, 'a hall on the square is not better off than a hut on the edge');
    if (rich.roofMaterial !== poor.roofMaterial || rich.wallMaterial !== poor.wallMaterial) differed++;
  }
  assert.ok(differed >= SEEDS.length * 0.5, 'wealth is not changing what a building is made of');
});

// ---------------------------------------------------------------------------- the data

test('the kit is as wide as the design says it is', () => {
  // TOWN_EXPANSION 3.15: at least twelve house bases; 3.3: twelve roof types; 3.4 and 3.5 the rest
  const houseBases = ['long', 'square', 'ell', 'courtyard', 'tower_house', 'row', 'round',
    'stilted', 'dug_in', 'terraced', 'hall', 'stacked'];
  for (const base of houseBases) assert.ok(KIT.bases[base], `${base} is missing from the kit`);
  assert.ok(BASE_KEYS.length >= 24, `only ${BASE_KEYS.length} bases`);
  assert.equal(ROOF_KEYS.length, 12);
  assert.ok(Object.keys(KIT.roofMaterials).length >= 8);
  assert.ok(Object.keys(KIT.wallMaterials).length >= 9);
  assert.ok(Object.keys(KIT.stalls.kinds).length >= 5);
  assert.equal(MESHES.length, 8);
});

test('every name in the data points at something that exists', () => {
  for (const e of KIT.extras.list) {
    assert.ok(KIT.extras.reach[e], `${e} has no reach, so nothing knows whether it fits in the yard`);
    assert.ok(['front', 'side', 'none'].includes(KIT.extras.reach[e][1]), `${e} reaches nowhere`);
  }
  for (const [key, base] of Object.entries(KIT.bases)) {
    assert.ok(base.masses?.length, `${key} has no masses`);
    assert.ok(base.roofs?.length, `${key} has no roofs`);
    for (const r of base.roofs) assert.ok(KIT.roofs[r], `${key} wants a ${r} roof, which does not exist`);
    for (const e of base.extras || []) {
      assert.ok(KIT.extras.list.includes(e), `${key} wants a ${e}, which is not an extra`);
    }
    assert.ok(base.min[0] <= base.max[0] && base.min[1] <= base.max[1], `${key} cannot fit itself`);
  }
  for (const [key, cult] of Object.entries(CULTURE_KIT.cultures)) {
    assert.ok(CULTURES[key], `${key} builds but no town planner knows it`);
    for (const b of Object.keys(cult.bases)) assert.ok(KIT.bases[b], `${key} builds ${b}, which does not exist`);
    for (const r of Object.keys(cult.roofs)) assert.ok(KIT.roofs[r], `${key} roofs in ${r}, which does not exist`);
    for (const m of Object.keys(cult.roofMaterials)) assert.ok(KIT.roofMaterials[m], `${key} roofs in ${m}`);
    for (const m of Object.keys(cult.wallMaterials)) assert.ok(KIT.wallMaterials[m], `${key} builds in ${m}`);
    for (const s of cult.stalls) assert.ok(KIT.stalls.kinds[s], `${key} sells from a ${s} stall`);
  }
  // every planner culture must have a kit, or a town of that culture would have nothing in it
  for (const key of Object.keys(CULTURES)) {
    assert.ok(CULTURE_KIT.cultures[key], `${key} plans a town but has no building kit`);
  }
  for (const want of [...WANT_ORDER, 'house', 'hut']) {
    assert.ok(CULTURE_KIT.wantBases[want], `${want} has no preferred bases`);
    for (const b of CULTURE_KIT.wantBases[want]) assert.ok(KIT.bases[b], `${want} wants a ${b}`);
  }
});

test('the knobs are in the data, not in the code', () => {
  // if a number that decides how a building looks is not in here, it is hard-coded somewhere and
  // the town cannot be retuned without a code change
  for (const knob of ['plotInset', 'storeyHeight', 'eaveBase', 'jetty', 'colourJitter',
    'windowSpacing', 'doorWidth', 'chimneyChance', 'maxRoofHeight']) {
    assert.ok(KIT.knobs[knob] !== undefined, `${knob} is not a knob`);
  }
  assert.ok(CULTURE_KIT.wealth.byDistrict && CULTURE_KIT.wealth.byWant);
});

// ---------------------------------------------------------------------------- outdoor stalls

test('a stall is a first-class thing, and it is deterministic', () => {
  for (const kind of Object.keys(KIT.stalls.kinds)) {
    const a = describeStall({ kind, culture: 'human', seed: 11 });
    const b = describeStall({ kind, culture: 'human', seed: 11 });
    assert.deepEqual(a, b);
    const parts = stallParts(a);
    assert.ok(parts.length >= 8, `a ${kind} stall is only ${parts.length} parts`);
    assert.ok(parts.some(p => p.tag === 'goods'), `a ${kind} stall sells nothing`);
    for (const p of parts) {
      for (const key of ['x', 'y', 'z', 'w', 'h', 'd']) assert.ok(Number.isFinite(p[key]));
      assert.ok(MESHES.includes(p.mesh));
    }
  }
});

test('stalls stand on the kerb and in the square, never in the middle of the road', () => {
  for (const culture of CULTURE_KEYS) {
    for (const seed of [1, 2, 3, 7, 42]) {
      const plan = planTown({ seed, size: 4, culture });
      const stalls = stallsFor(plan, { culture, seed });
      assert.ok(stalls.length >= 3, `${culture}@${seed} has only ${stalls.length} stalls`);
      for (const s of stalls) {
        assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.facing));
        assert.ok(KIT.stalls.kinds[s.kind], `${s.kind} is not a kind of stall`);
        if (s.where !== 'street') continue;
        // the carriageway has to stay clear, or a cart cannot get down it
        for (const st of plan.streets) {
          if (st.cls !== 'main') continue;
          for (let i = 0; i < st.pts.length - 1; i++) {
            const d = distToSegment(s.x, s.z, st.pts[i], st.pts[i + 1]);
            assert.ok(d > st.width / 2 - 0.05, `${culture}@${seed}: a stall is in the road`);
          }
        }
      }
      assert.deepEqual(stallsFor(plan, { culture, seed }), stalls, 'stalls moved between calls');
    }
  }
});

/** How far a point is from a street span, for the carriageway check. */
function distToSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  if (!len2) return Math.hypot(x - a[0], z - a[1]);
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

// ---------------------------------------------------------------------------- a whole town

test('a real plan turns into a real town, in every culture and at every size', () => {
  for (const culture of CULTURE_KEYS) {
    for (const size of [1, 3, 5]) {
      const plan = planTown({ seed: 7, size, culture });
      let parts = 0, roofs = 0;
      const bases = new Set();
      for (const plot of plan.plots) {
        const desc = describeBuilding({
          plot, culture, seed: hash(7, plot.cx, plot.cz), townSeed: 7,
          want: plot.want, district: plot.district,
        });
        const list = partsFor(desc);
        assert.ok(roofsCover(desc, list), `${culture}/${size}: a roof missed its walls in a real plan`);
        bases.add(desc.base);
        parts += list.length;
        roofs += list.filter(p => p.tag === 'roof').length;
      }
      if (!plan.plots.length) continue;
      assert.ok(roofs > 0, `${culture}/${size} built a town with no roofs on it`);
      const each = parts / plan.plots.length;
      // the instance budget: if a building goes past sixty parts the caps in features.js are wrong
      assert.ok(each > 5 && each < 60, `${culture}/${size} averages ${each.toFixed(1)} parts a building`);
      if (size >= 3) assert.ok(bases.size >= 3, `${culture}/${size} built ${bases.size} kinds of building`);
    }
  }
});

test('topRect is the rectangle the roof was given, jetties and tapers included', () => {
  const desc = describeSpecimen({ base: 'jettied', roof: 'gable', culture: 'human', seed: 3 });
  const m = desc.masses[0];
  const top = topRect(m);
  if (m.storeys > 1 && m.jetty > 0) assert.ok(top.w > m.w, 'a jettied top storey is not wider');
  const spire = describeSpecimen({ base: 'spire', roof: 'conical', culture: 'undead', seed: 3 });
  const s = spire.masses[0];
  if (s.storeys > 1 && s.taper > 0) assert.ok(topRect(s).w < s.w, 'a tapered top storey is not narrower');
});
