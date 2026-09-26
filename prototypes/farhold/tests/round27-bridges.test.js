// node --test prototypes/farhold/tests/round27-bridges.test.js
//
// Round 27, M6 — bridges by kind, solid piers, fords and lake spans.
//
//   * three styles (stone arch / timber trestle / plank), chosen from the crossing record, and ONE
//     deck in all three: the drawn deck top, read out of the bridge mesh's own vertex buffer, is the
//     deck the player's collider stands on;
//   * piers are solid for a swimmer or a boat, and stand on the lowest corner of their footing;
//   * World Forge's fords are fords: a flagstone causeway under 0.2-0.5 m of water, waded, never swum;
//   * a road over more than 25 m of lake is a trestle, not an earth plug;
//   * trails are the plan's 4 m, now that the "deck half a metre off its collider" was found to be a
//     market stall standing on a bridge's landing.
//
// Everything is the REAL pipeline: `createWorld` + `makeTerrain`, `createFeatures` for the drawn
// mesh and the obstacle field, and js/player.js's own controller for every walk and every swim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const P = await import('../js/planet.js');
const { createFeatures } = await import('../js/features.js');
const BP = await import('../js/bridge-plan.js');
const { createController } = await import('../js/player.js');
const { wadeable, wetAt, WADE_DEPTH } = await import('../js/ground.js');

const balance = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));

// the plan's standard seeds with rivers on them (25392, the user's world, has no crossing at all)
const SEEDS = [47, 7, 4477, 1337, 101];
const cache = new Map();
function world(seed, scale = 0.1) {
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * scale);
  const key = `${seed}@${scale}`;
  if (cache.has(key)) return cache.get(key);
  const made = P.createWorld({ seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128, regionScale: 2, habitable: true, liveable: true });
  const terrain = P.makeTerrain(made.world, made.planet, balance.terrain);
  const w = { seed, scale, made, terrain, _features: null };
  Object.defineProperty(w, 'features', {
    get() {
      P.setMetresPerCell(P.M_PER_CELL_DEFAULT * scale);
      if (!w._features) w._features = createFeatures({ add() {}, remove() {} }, terrain, { seed, radius: 2600 });
      return w._features;
    },
  });
  cache.set(key, w);
  return w;
}

/** The DRAWN top at (x, z): the highest upward-facing triangle of the bridge mesh over the point. */
function drawnTops(features) {
  const g = features.bridgeMesh.geometry;
  const pos = g.attributes.position?.array, nrm = g.attributes.normal?.array, idx = g.index?.array;
  if (!pos) return { at: () => null };
  const CELL = 8, grid = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (nrm[a * 3 + 1] < 0.5) continue;
    const tri = [a, b, c].map(i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    const x0 = Math.min(...tri.map(p => p[0])), x1 = Math.max(...tri.map(p => p[0]));
    const z0 = Math.min(...tri.map(p => p[2])), z1 = Math.max(...tri.map(p => p[2]));
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = gx + ',' + gz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(tri);
      }
    }
  }
  return {
    at(x, z) {
      let best = null;
      for (const [p, q, r] of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
        const d = (q[2] - r[2]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[2] - r[2]);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((q[2] - r[2]) * (x - r[0]) + (r[0] - q[0]) * (z - r[2])) / d;
        const l2 = ((r[2] - p[2]) * (x - r[0]) + (p[0] - r[0]) * (z - r[2])) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const y = l1 * p[1] + l2 * q[1] + l3 * r[1];
        if (best === null || y > best) best = y;
      }
      return best;
    },
  };
}

/**
 * Every bridge of a world, each measured once with the world built around IT: walk the plans, and
 * for each one not yet measured, rebuild the features there and measure every bridge that drew.
 */
function eachDrawnBridge(w, fn) {
  const done = new Set();
  const plans = w.terrain.bridgePlans();
  for (const target of plans) {
    if (done.has(target)) continue;
    w.features.update(target.crossing.x, target.crossing.z, true);
    const drawn = drawnTops(w.features);
    for (const plan of w.features.bridgePlans) {
      if (done.has(plan)) continue;
      done.add(plan);
      fn(plan, drawn);
    }
  }
  return done.size;
}

const input = (forward = 1) => ({ keys: new Set(), pressed: new Set(), look: [0, 0], forward, strafe: 0, run: false });
const controller = (w, opts = {}) => createController(w.terrain, balance, new THREE.PerspectiveCamera(), { obstacles: [w.features.solids], ...opts });

// ---------------------------------------------------------------------------- one deck, every style

test('one deck in every style: the drawn deck top is the collider deck, every crossing on five seeds (trails at 4 m)', () => {
  assert.equal(P.ROAD_CLASS.trail.width, 4, 'trails are the plan\'s 4 m');
  const styles = {};
  let measured = 0, worst = 0, where = '';
  for (const seed of SEEDS) {
    const w = world(seed);
    const n = eachDrawnBridge(w, (plan, drawn) => {
      styles[plan.style] = (styles[plan.style] || 0) + 1;
      const { crossing: c, halfWidth: hw, nx, nz } = plan;
      for (let d = plan.from + 0.05; d <= plan.to - 0.05; d += 0.7) {
        for (const off of [-(hw - 1.2), 0, hw - 1.2]) {
          const x = c.x + plan.tx * d + nx * off, z = c.z + plan.tz * d + nz * off;
          const seen = drawn.at(x, z);
          assert.notEqual(seen, null, `seed ${seed}: no drawn deck at ${x.toFixed(1)},${z.toFixed(1)} on a ${plan.style}`);
          // what the player's controller stands on: EVERYTHING in the field, not just the decks — a
          // market stall on a landing was the "0.55 m" M5 could not narrow the trails past
          const stood = w.features.solids.standAt(x, z, seen + 0.2, 0);
          const gap = stood === null ? Infinity : Math.abs(stood - seen);
          if (gap > worst) { worst = gap; where = `seed ${seed} ${plan.style} at ${x.toFixed(1)},${z.toFixed(1)}`; }
          measured++;
        }
      }
    });
    assert.equal(n, w.terrain.crossings.length, `seed ${seed}: ${n} of ${w.terrain.crossings.length} crossings were drawn`);
  }
  console.log(`# ${measured} deck points, styles ${JSON.stringify(styles)}, worst ${worst.toFixed(4)} m`);
  assert.ok(worst <= 0.05, `the drawn deck and what you stand on disagree by ${worst.toFixed(3)} m at ${where}`);
  assert.ok(styles.arch && styles.trestle && styles.plank, `not every style was measured: ${JSON.stringify(styles)}`);
});

test('the root of the 0.55 m: a bridge\'s landing is bridge — nothing solid stands on any deck', () => {
  // `bridgedAt` used to know only the crossing's footprint, and a landing carries the deck past it
  let landings = 0, clashes = [];
  for (const seed of SEEDS) {
    const w = world(seed);
    eachDrawnBridge(w, plan => {
      for (const [side, kind] of [[-1, plan.ends.back], [1, plan.ends.fwd]]) {
        if (kind !== 'landing') continue;
        landings++;
        const d = side < 0 ? plan.from + 1 : plan.to - 1;
        const x = plan.crossing.x + plan.tx * d, z = plan.crossing.z + plan.tz * d;
        assert.equal(w.terrain.bridgedAt(x, z), true, `seed ${seed}: bridgedAt does not know the landing at ${x | 0},${z | 0}`);
      }
      // anything in the field that is not a deck, a rail or a pier, standing on the deck
      for (let d = plan.from; d <= plan.to; d += 1) {
        const x = plan.crossing.x + plan.tx * d, z = plan.crossing.z + plan.tz * d;
        for (const o of w.features.solids.near(x, z) || []) {
          if (o.deck || o.seg) continue;
          if (Math.hypot(o.x - x, o.z - z) < o.r && BP.onPlan(plan, o.x, o.z)) clashes.push(`seed ${seed}: a solid r ${o.r.toFixed(2)} at ${o.x | 0},${o.z | 0}`);
        }
      }
    });
  }
  assert.ok(landings >= 5, `only ${landings} landings`);
  assert.deepEqual([...new Set(clashes)].slice(0, 6), []);
});

// ------------------------------------------------------------------------------------ the styles

test('style counts: every style is built, and every highway crossing of 40 m or less is an arch', () => {
  const count = { arch: 0, trestle: 0, plank: 0 };
  let highwayShort = 0;
  for (const seed of SEEDS) {
    for (const plan of world(seed).terrain.bridgePlans()) {
      count[plan.style]++;
      const c = plan.crossing;
      if (c.klass === 'highway' && 2 * c.halfLength <= BP.ARCH_MAX && c.over !== 'lake') {
        highwayShort++;
        assert.equal(plan.style, 'arch', `seed ${seed}: a ${(2 * c.halfLength).toFixed(0)} m highway crossing at ${c.x | 0},${c.z | 0} is a ${plan.style}`);
      }
      // the style really is chosen from the record, and only from it
      assert.equal(plan.style, BP.bridgeStyle(c));
    }
  }
  console.log(`# styles over ${SEEDS.length} seeds: ${JSON.stringify(count)}; ${highwayShort} short highway crossings`);
  for (const s of BP.BRIDGE_STYLES) assert.ok(count[s] >= 1, `no ${s} on any of the five seeds`);
  // the rule itself, on records made up to sit either side of each line
  const rec = (klass, span, extra = {}) => ({ klass, halfLength: span / 2, roadHalf: 2, ...extra });
  assert.equal(BP.bridgeStyle(rec('highway', 40)), 'arch');
  assert.equal(BP.bridgeStyle(rec('highway', 41)), 'plank');
  assert.equal(BP.bridgeStyle(rec('road', 30)), 'plank');
  assert.equal(BP.bridgeStyle(rec('trail', 61)), 'trestle');
  assert.equal(BP.bridgeStyle(rec('highway', 30, { over: 'lake' })), 'trestle');
});

test('only the underside varies: an arch\'s stone never rises above its own deck\'s underside', () => {
  // the risk the plan names — "an arch formula creeping into the deck". Every drawn vertex of an arch
  // that is not a deck slab or a parapet must be at or under the deck's underside at its station.
  let checked = 0;
  for (const seed of SEEDS) {
    const w = world(seed);
    for (const plan of w.terrain.bridgePlans().filter(p => p.style === 'arch')) {
      const out = { position: [], normal: [], color: [], index: [] };
      BP.bridgeGeometry(plan, w.terrain, out, []);
      const stone = BP.STYLE_PARTS.arch.deck;
      for (let i = 0; i < out.position.length; i += 3) {
        const [x, y, z] = [out.position[i], out.position[i + 1], out.position[i + 2]];
        const d = (x - plan.crossing.x) * plan.tx + (z - plan.crossing.z) * plan.tz;
        const deckTop = BP.deckTopAlong(plan, d);
        // deck slabs and parapets are the deck colour; everything else is the underside
        const isDeck = Math.abs(out.color[i] - stone[0]) < 1e-6 && Math.abs(out.color[i + 1] - stone[1]) < 1e-6;
        if (isDeck) continue;
        assert.ok(y <= deckTop - BP.DECK_THICK + 0.02, `seed ${seed}: arch stone at ${y.toFixed(2)} over an underside of ${(deckTop - BP.DECK_THICK).toFixed(2)}`);
        checked++;
      }
      assert.ok(plan.bays, `seed ${seed}: an arch with no bays`);
    }
  }
  assert.ok(checked > 100, `only ${checked} arch vertices`);
});

test('a walker on the real player controller crosses each style end to end without falling', () => {
  const walked = { arch: 0, trestle: 0, plank: 0 };
  for (const seed of SEEDS) {
    const w = world(seed);
    const byStyle = { arch: [], trestle: [], plank: [] };
    for (const p of w.terrain.bridgePlans()) if (p.ends.back !== 'drop' && p.ends.fwd !== 'drop') byStyle[p.style].push(p);
    for (const style of Object.keys(byStyle)) {
      for (const plan of byStyle[style].slice(0, 2)) {
        w.features.update(plan.crossing.x, plan.crossing.z, true);
        const ctrl = controller(w);
        const at = d => [plan.crossing.x + plan.tx * d, plan.crossing.z + plan.tz * d];
        ctrl.teleport(...at(plan.from + 0.5));
        ctrl.yaw = Math.atan2(plan.tx, plan.tz);
        let fell = null, swam = false, d = plan.from;
        for (let t = 0; t < 40 && d < plan.to - 0.5; t += 1 / 30) {
          ctrl.yaw = Math.atan2(plan.tx, plan.tz);
          ctrl.update(1 / 30, input());
          d = (ctrl.x - plan.crossing.x) * plan.tx + (ctrl.z - plan.crossing.z) * plan.tz;
          if (ctrl.swimming) swam = true;
          if (d > plan.from + 0.5 && d < plan.to - 0.5) {
            const top = BP.deckTopAlong(plan, d);
            if (ctrl.y < top - 0.3 && fell === null) fell = `${(top - ctrl.y).toFixed(2)} m under the deck at ${d.toFixed(1)}`;
          }
        }
        assert.equal(swam, false, `seed ${seed}: the walker swam on a ${style} at ${plan.crossing.x | 0},${plan.crossing.z | 0}`);
        assert.equal(fell, null, `seed ${seed}: the walker fell through a ${style} at ${plan.crossing.x | 0},${plan.crossing.z | 0}: ${fell}`);
        assert.ok(d >= plan.to - 0.6, `seed ${seed}: the walker stopped ${(plan.to - d).toFixed(1)} m short on a ${style}`);
        walked[style]++;
      }
    }
  }
  console.log(`# walked ${JSON.stringify(walked)}`);
  for (const s of BP.BRIDGE_STYLES) assert.ok(walked[s] >= 1, `no ${s} walked`);
});

// ------------------------------------------------------------------------------------ the piers

/** Piers standing in water deep enough to swim, with open water to swim in on the upstream side. */
function swimmablePiers(w, want) {
  const out = [];
  for (const plan of w.terrain.bridgePlans()) {
    if (plan.crossing.over === 'lake') continue;
    const piers = BP.piersOf(plan, w.terrain);
    for (let k = 0; k < piers.length; k++) {
      const p = piers[k];
      const start = [p.x - p.ux * (p.len + 7), p.z - p.uz * (p.len + 7)];
      const water = w.terrain.waterAt(p.x, p.z), ws = w.terrain.waterAt(...start);
      if (!water || water.depth < 2 || !ws || ws.depth < 2) continue;
      out.push({ plan, pier: p, next: piers[k + 1] || piers[k - 1], start });
      break;
    }
    if (out.length >= want) break;
  }
  return out;
}

/** Swim (or row) along the current from `start` for `seconds`; how far along it you got past the pier's middle. */
function swimAlong(w, start, ux, uz, from, seconds = 10, opts = {}) {
  const ctrl = controller(w, opts);
  ctrl.teleport(...start);
  let furthest = -Infinity, swam = false, boated = false;
  for (let t = 0; t < seconds; t += 1 / 30) {
    ctrl.yaw = Math.atan2(ux, uz);
    ctrl.update(1 / 30, input());
    if (ctrl.swimming) swam = true;
    if (ctrl.boating) boated = true;
    furthest = Math.max(furthest, (ctrl.x - from[0]) * ux + (ctrl.z - from[1]) * uz);
  }
  return { furthest, swam, boated };
}

test('piers are solid: a swimmer (and a boat) under five bridges is stopped at a pier and passes between them', () => {
  let bridges = 0;
  for (const seed of SEEDS) {
    const w = world(seed);
    for (const { plan, pier: p, next, start } of swimmablePiers(w, 2)) {
      if (bridges >= 5) break;
      w.features.update(plan.crossing.x, plan.crossing.z, true);
      // head-on into the pier's upstream end
      const hit = swimAlong(w, start, p.ux, p.uz, [p.x, p.z]);
      assert.ok(hit.swam, `seed ${seed}: the swimmer at ${start.map(v => v | 0)} never swam`);
      assert.ok(hit.furthest < -p.len + 0.1, `seed ${seed}: a swimmer went through the pier at ${p.x | 0},${p.z | 0} (to ${hit.furthest.toFixed(2)} of -${p.len.toFixed(2)})`);
      // a boat is stopped by the same pier
      const boat = swimAlong(w, start, p.ux, p.uz, [p.x, p.z], 10, { boat: () => ({ id: 'skiff', speed: 5.6 }) });
      assert.ok(boat.boated, `seed ${seed}: the boat never came out`);
      assert.ok(boat.furthest < -p.len + 0.1, `seed ${seed}: a boat went through the pier at ${p.x | 0},${p.z | 0}`);
      // between this pier and the next one the water is open: the same swim, shifted half a bay
      if (next) {
        const mid = (next.d - p.d) / 2;
        const gx = start[0] + plan.tx * mid, gz = start[1] + plan.tz * mid;
        if (w.terrain.waterAt(gx, gz)?.depth > 2) {
          const pass = swimAlong(w, [gx, gz], p.ux, p.uz, [p.x + plan.tx * mid, p.z + plan.tz * mid], 12);
          assert.ok(pass.furthest > p.len, `seed ${seed}: the swimmer could not pass between piers at ${p.x | 0},${p.z | 0} (got ${pass.furthest.toFixed(2)})`);
        }
      }
      // …and a walker on the deck above is not stopped by it: the pier's band ends at the underside
      const top = BP.deckTopAlong(plan, p.d);
      assert.equal(w.features.solids.blocked(p.x, p.z, 0.4), false, 'a pier is solid for a body that does not say where its feet are');
      const walker = w.features.solids.resolve(p.x + plan.tx * 0.1, p.z + plan.tz * 0.1, 0.4, [0, 0], top, [p.x - plan.tx * 1.5, p.z - plan.tz * 1.5]);
      assert.ok(Math.hypot(walker[0] - (p.x + plan.tx * 0.1), walker[1] - (p.z + plan.tz * 0.1)) < 1e-6, `seed ${seed}: a walker on the deck was stopped by a pier`);
      bridges++;
    }
  }
  assert.ok(bridges >= 5, `only ${bridges} bridges had a pier in swimming water`);
});

test('every pier stands on the lowest corner of its footing (within 0.2 m of heightAt)', () => {
  let piers = 0, worst = 0;
  for (const seed of SEEDS) {
    const w = world(seed);
    for (const plan of w.terrain.bridgePlans()) {
      for (const p of BP.piersOf(plan, w.terrain)) {
        let lowest = Infinity;
        for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          lowest = Math.min(lowest, w.terrain.heightAt(p.x + p.ux * p.len * su - p.uz * p.thick * sv, p.z + p.uz * p.len * su + p.ux * p.thick * sv));
        }
        worst = Math.max(worst, Math.abs(p.bottom - lowest));
        // the deck width: a pier reaches across the whole deck along the current
        const across = Math.abs(p.ux * plan.nx + p.uz * plan.nz) * p.len;
        assert.ok(across >= plan.halfWidth - 0.5, `seed ${seed}: a pier ${across.toFixed(2)} m across a ${plan.halfWidth.toFixed(2)} m half-deck`);
        assert.ok(p.top <= BP.deckTopAlong(plan, p.d) - BP.DECK_THICK + 1e-6, 'a pier through its deck');
        piers++;
      }
    }
  }
  console.log(`# ${piers} piers, worst footing ${worst.toFixed(3)} m off the lowest corner`);
  assert.ok(piers > 200, `only ${piers} piers`);
  assert.ok(worst <= 0.2, `a pier stands ${worst.toFixed(3)} m off the lowest corner of its footing`);
});

// ------------------------------------------------------------------------------------- the fords

const fordWorlds = () => [...SEEDS.map(s => world(s, 0.1)), world(7, 1), world(47, 1), world(11, 0.1), world(300, 0.1)];

test('fords: 0.2-0.5 m of water over the stones at every metre, on the ground heightAt gives and in the drawn mesh', () => {
  let fords = 0, steps = 0, drawnSteps = 0;
  for (const w of fordWorlds()) {
    P.setMetresPerCell(P.M_PER_CELL_DEFAULT * w.scale);
    for (const f of w.terrain.fords) {
      fords++;
      assert.notEqual(f.klass, 'highway', 'a ford on a highway');
      assert.equal(w.terrain.crossings.some(c => c.road === f.road && Math.hypot(c.x - f.x, c.z - f.z) < c.halfLength), false, 'a ford with a bridge over it');
      w.features.update(f.x, f.z, true);
      const drawn = drawnTops(w.features);
      for (let d = -f.halfLength; d <= f.halfLength + 1e-6; d += 1) {
        const x = f.x + f.tx * d, z = f.z + f.tz * d;
        const water = w.terrain.waterAt(x, z);
        assert.ok(water && water.depth >= 0.2 && water.depth <= 0.5,
          `seed ${w.seed}@${w.scale}: ${water ? water.depth.toFixed(2) : 'no'} m of water over the ford at ${x.toFixed(1)},${z.toFixed(1)}`);
        steps++;
        // the drawn flagstones across the carriageway at this step (they are laid in rows with
        // joints between them, so the step looks across the road for them)
        let found = false;
        for (let o = -f.halfWidth + 0.3; o <= f.halfWidth - 0.3; o += 0.25) {
          const sx = x - f.tz * o, sz = z + f.tx * o;
          const stone = drawn.at(sx, sz);
          const here = w.terrain.waterAt(sx, sz);
          if (stone === null || !here || stone >= here.surface) continue;
          const over = here.surface - stone;
          assert.ok(over >= 0.2 - 1e-6 && over <= 0.5, `seed ${w.seed}: ${over.toFixed(2)} m of water over a drawn flagstone at ${sx.toFixed(1)},${sz.toFixed(1)}`);
          found = true;
        }
        if (found) drawnSteps++;
      }
    }
  }
  console.log(`# ${fords} fords, ${steps} metre steps, ${drawnSteps} on a drawn stone`);
  assert.ok(fords >= 5, `only ${fords} fords across the worlds`);
  assert.ok(drawnSteps > steps * 0.3, `only ${drawnSteps} of ${steps} steps found a drawn stone`);
});

test('fords: a walker on the real controller wades across and never swims; wading is a slower walk', () => {
  let crossed = 0;
  for (const w of fordWorlds()) {
    P.setMetresPerCell(P.M_PER_CELL_DEFAULT * w.scale);
    for (const f of w.terrain.fords) {
      w.features.update(f.x, f.z, true);
      // every road that fords here — a road can end at World Forge's ford node and another carry on
      const roads = w.terrain.fords.filter(q => Math.hypot(q.x - f.x, q.z - f.z) < 6).map(q => q.road);
      const along = p => (p[0] - f.x) * f.tx + (p[1] - f.z) * f.tz;
      const line = w.terrain.roadPaths.filter(r => roads.includes(r.id)).flatMap(r => r.points.map(p => [p[0], p[1]]))
        .filter(p => Math.hypot(p[0] - f.x, p[1] - f.z) < f.stonesHalf + 30).sort((a, b) => along(a) - along(b));
      const ctrl = controller(w);
      ctrl.teleport(f.x - f.tx * (f.stonesHalf + 4), f.z - f.tz * (f.stonesHalf + 4));
      let swam = false, wet = 0, d = -Infinity;
      for (let t = 0; t < 30 && d < f.stonesHalf + 3; t += 1 / 30) {
        const next = line.find(p => along(p) > d + 4);
        ctrl.yaw = next ? Math.atan2(next[0] - ctrl.x, next[1] - ctrl.z) : Math.atan2(f.tx, f.tz);
        ctrl.update(1 / 30, input());
        d = along([ctrl.x, ctrl.z]);
        if (ctrl.swimming) swam = true;
        if (ctrl.waterDepth > 0.15) wet++;
      }
      assert.equal(swam, false, `seed ${w.seed}@${w.scale}: the walker swam at the ford at ${f.x | 0},${f.z | 0}`);
      assert.ok(d >= f.stonesHalf, `seed ${w.seed}@${w.scale}: the walker did not get across the ford at ${f.x | 0},${f.z | 0} (${d.toFixed(1)} of ${f.stonesHalf.toFixed(1)})`);
      assert.ok(wet > 10, 'the walker never had water over its feet');
      // wading is a slower walk, and the knob is what makes it so: the same step on the same stones
      // with `wadeSpeed` moved to 1 (the dead-data rule) goes faster by exactly the knob — on foot,
      // on a mount and in a vehicle
      const step = (knob, rig) => {
        const bal = { ...balance, player: { ...balance.player, wadeSpeed: knob } };
        const c = createController(w.terrain, bal, new THREE.PerspectiveCamera(), { obstacles: [w.features.solids] });
        c.teleport(f.x, f.z);
        c.update(1 / 30, input(0));
        rig(c);
        c.yaw = Math.atan2(f.tx, f.tz);
        const x0 = c.x, z0 = c.z;
        c.update(1 / 30, input());
        return Math.hypot(c.x - x0, c.z - z0);
      };
      for (const [name, rig] of [['foot', () => {}], ['mount', c => { c.mounted = true; }], ['vehicle', c => { c.driving = { speed: 9 }; }]]) {
        const slow = step(0.65, rig), fast = step(1, rig);
        assert.ok(Math.abs(slow / fast - 0.65) < 0.02, `${name}: wading is ${(slow / fast).toFixed(2)} of the pace, not 0.65`);
      }
      // everything else wades it too: a ford is not water an enemy or a companion refuses
      assert.equal(wetAt(w.terrain, f.x, f.z, -Infinity), false, 'a ford is water an enemy will not cross');
      assert.equal(wadeable(w.terrain, f.x, f.z), true);
      crossed++;
    }
  }
  assert.ok(crossed >= 5, `only ${crossed} fords walked`);
  assert.equal(WADE_DEPTH, 0.5);
});

test('fords come from World Forge: every ford is at one of its ford nodes, on a narrow river', () => {
  for (const w of fordWorlds()) {
    const M = w.terrain.metresPerCell;
    const nodes = w.made.world.nodes.filter(n => n.type === 'crossing' && n.kind === 'ford');
    for (const f of w.terrain.fords) {
      assert.ok(nodes.some(n => Math.hypot(n.x * M - f.x, n.y * M - f.z) < 1.5 * M + f.stonesHalf), `a ford at ${f.x | 0},${f.z | 0} with no World Forge ford near it`);
      const river = w.terrain.riverPaths.find(r => r.id === f.river);
      assert.ok(river.width < 2, `a ford over a width-${river.width} river`);
    }
  }
});

// ------------------------------------------------------------------------------------- the lakes

/** The longest causeway (road-raised ground over lake water, no bridge) on each road of a terrain. */
function causewayRuns(t) {
  const out = [];
  {
    const W = t.width;
    // the lake a cell belongs to, when it is a lake and not a pit under the sea (a lake whose surface
    // is under sea level fills with the sea: that is a sea lane's business, as it is findLakeSpans')
    const byCell = new Map();
    for (const l of t.lakes) for (const i of l.cells) byCell.set(i, l);
    const lakeAt = (x, z) => {
      const c = t.cellAt(x, z), l = byCell.get(c.y * W + c.x);
      return l && t.world.water[c.y * W + c.x] === 2 && !(t.hasSea && l.surface <= t.seaLevel + 0.5) ? l : null;
    };
    for (const road of t.roadPaths) {
      let run = 0;
      const flush = () => { if (run > 0) out.push(run); run = 0; };
      for (let i = 0; i + 1 < road.points.length; i++) {
        const [ax, az] = road.points[i], [bx, bz] = road.points[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < len; s += 2) {
          const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
          // a plug: in a lake cell, the ground raised out of the water to carry the road, no bridge
          // a plug is a CAUSEWAY: ground the road raised out of the lake — above the water, above the
          // land that was there, and low over the water (a hill road over a basin dug 57 m into the
          // hillside is standing on the hill; see RPG.md)
          const lake = lakeAt(x, z), h = t.heightAt(x, z);
          const plug = !!lake && !t.bridgedAt(x, z) && h > lake.surface && h < lake.surface + 6
            && h > t.naturalHeightAt(x, z) + 0.5;
          if (plug) run += 2; else flush();
        }
      }
      flush();
    }
  }
  return out;
}

test('lakes: no road rides an earth plug over more than 25 m of lake — every such span is a crossing', () => {
  let spans = 0, plugs = 0, worst = 0;
  for (const [seed, scale] of [...SEEDS.map(s => [s, 0.1]), [47, 1], [7, 1], [1337, 1]]) {
    const w = world(seed, scale);
    P.setMetresPerCell(P.M_PER_CELL_DEFAULT * scale);
    const t = w.terrain;
    for (const run of causewayRuns(t)) { worst = Math.max(worst, run); if (run > 25) plugs++; }
    spans += t.crossings.filter(c => c.over === 'lake').length;
    for (const c of t.crossings.filter(q => q.over === 'lake')) {
      // the water is still there under a lake span, and the deck is a trestle
      assert.equal(t.waterAt(c.x, c.z)?.kind, 'lake', `seed ${seed}@${scale}: no lake under the lake span at ${c.x | 0},${c.z | 0}`);
      assert.equal(BP.bridgeStyle(c), 'trestle');
    }
  }
  console.log(`# ${spans} lake spans, longest causeway ${worst} m`);
  // a real causeway lake span is rare on these worlds (World Forge keeps roads off lakes, and towns
  // drain them), so the rule is also checked on a lake laid across a road on purpose — below
  assert.ok(spans >= 0);
  assert.equal(plugs, 0, `${plugs} causeways over more than 25 m of lake (longest ${worst} m)`);
});

// ----------------------------------------------------------------------------- the dead-data rule

test('crossing.klass, roadHalf and river are read: moving each one changes the bridge', () => {
  const w = world(47);
  const plan = w.terrain.bridgePlans().find(p => p.style === 'arch');
  const c = plan.crossing;
  // klass: the same crossing as a road is not an arch
  assert.equal(BP.bridgeStyle({ ...c, klass: 'road' }), 'plank');
  // roadHalf: a trestle's bent has a post per 2.2 m of road
  const tp = w.terrain.bridgePlans().find(p => p.style === 'trestle' && BP.piersOf(p, w.terrain).length);
  const count = rh => {
    const q = BP.planBridge({ ...tp.crossing, roadHalf: rh }, w.terrain);
    return BP.bridgeGeometry(q, w.terrain).position.length;
  };
  assert.ok(count(6) > count(2), 'a wider road does not give a trestle more posts');
  // river: the piers stand along ITS current
  const q = BP.planBridge({ ...c, river: null }, w.terrain);
  assert.deepEqual(q.flow, [q.nx, q.nz], 'with no river the piers square to the deck');
});

test('lakes: a lake laid across a road on purpose becomes trestle spans (or a culverted causeway), never a dam', () => {
  // World Forge keeps its roads off lakes and towns drain the ones they sit in, so a causeway over
  // more than 25 m of lake does not happen on the standard worlds. Lay three lake cells across the
  // middle of real roads on seed 7 and build the terrain again: the real pipeline has to cope.
  const base = world(7);
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * 0.1);
  const t0 = base.terrain, W = t0.width;
  let laid = 0, spans = 0, causeways = 0, walked = 0;
  for (const r of t0.roadPaths.filter(q => q.points.length > 30 && q.klass !== 'highway')) {
    if (laid >= 4) break;
    const [x, z] = r.points[r.points.length >> 1];
    if (t0.riverInfoAt(x, z) || t0.slopeAt(x, z, 20) > 0.05) continue;
    const c = t0.cellAt(x, z);
    if (base.made.world.nodes.some(n => Math.hypot(n.x - c.x, n.y - c.y) < 6)) continue;
    const wld = structuredClone(base.made.world);
    const e0 = wld.elevation[c.y * W + c.x];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = (c.y + dy) * W + c.x + dx;
      wld.water[i] = 2; wld.elevation[i] = Math.min(wld.elevation[i], e0);
    }
    const t = P.makeTerrain(wld, base.made.planet, balance.terrain);
    laid++;
    const mine = t.crossings.filter(q => q.over === 'lake');
    spans += mine.length;
    causeways += t.causeways.length;
    const worst = Math.max(0, ...causewayRuns(t));
    assert.ok(worst <= 25, `a ${worst} m causeway over the lake laid at ${x | 0},${z | 0}`);
    for (const q of mine) {
      assert.equal(t.waterAt(q.x, q.z)?.kind, 'lake', `no lake left under the span at ${q.x | 0},${q.z | 0}`);
      assert.equal(BP.bridgeStyle(q), 'trestle');
    }
    for (const cw of t.causeways) assert.ok(BP.culvertGeometry(cw, t).position.length > 0, 'a causeway with no culverts');
    // and you can walk across the longest span on the real controller, on the drawn deck
    const plan = t.bridgePlans().filter(p => p.crossing.over === 'lake').sort((a, b) => b.halfLength - a.halfLength)[0];
    if (plan) {
      const feats = createFeatures({ add() {}, remove() {} }, t, { seed: 7, radius: 2600 });
      feats.update(plan.crossing.x, plan.crossing.z, true);
      const ctrl = createController(t, balance, new THREE.PerspectiveCamera(), { obstacles: [feats.solids] });
      ctrl.teleport(plan.crossing.x + plan.tx * (plan.from + 0.5), plan.crossing.z + plan.tz * (plan.from + 0.5));
      let d = plan.from, swam = false;
      for (let k = 0; k < 900 && d < plan.to - 0.5; k++) {
        ctrl.yaw = Math.atan2(plan.tx, plan.tz);
        ctrl.update(1 / 30, input());
        d = (ctrl.x - plan.crossing.x) * plan.tx + (ctrl.z - plan.crossing.z) * plan.tz;
        if (ctrl.swimming) swam = true;
      }
      assert.equal(swam, false, `the walker fell into the lake from the span at ${plan.crossing.x | 0},${plan.crossing.z | 0}`);
      assert.ok(d >= plan.to - 0.6, 'the walker did not get across the lake span');
      walked++;
    }
  }
  console.log(`# ${laid} lakes laid across roads: ${spans} trestle spans, ${causeways} culverted causeways, ${walked} walked`);
  assert.ok(laid >= 3 && spans >= 2 && walked >= 1, `laid ${laid}, spans ${spans}, walked ${walked}`);
});
