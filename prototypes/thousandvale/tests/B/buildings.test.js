// Stream W — owner play-test 5, T13: "many buildings are too short/squat, especially the new trade-skill buildings".
//   node --test prototypes/thousandvale/tests/B/buildings.test.js        (TABLE=1 prints the before/after table)
// Every building the client draws in Torbor Downs — the towns' plots (js/client/town-view.js buildingLook) and the
// set-piece buildings (farms, inns, mills, chapels) — measured against a Chibi 2 character:
//   a door a character cannot walk through is a bug  → door >= 1.3x the TALLEST body, and its foot on the ground
//   a ceiling in the character's hat is squat         → storey >= 3.3 m, eave >= 3.3 m (was 2.0-2.5 m: halfling storeys)
//   a trade building reads from across the square     → two storeys wherever its plot is deep enough
//   nothing MOVED to get there                         → footprint inside its plot (nav.bin stamps the plot)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const ROOT = new URL('../../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const ZONES = Object.values(/* every province (Torbor Downs + Vharlen) */ Object.assign({}, ...Object.values(json('data/world/province-map.json').provinces).map(p => p.map)));
const { buildingLook, plotFromPlacement, buildingSeed } = await import('../../js/client/town-view.js');
const { BUILDING_SCALE, CHARACTER_HEIGHT, tuneFor } = await import('../../js/client/building-tune.js');
const { describeBuilding, partsFor, heightOf, fitToPlot, KIT } = await import('../../../../proctown/js/buildkit.js');
const { officeDressing } = await import('../../../../proctown/js/offices.js');
const strHash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Every town building of the province: the tuned look the game draws, and the same plot WITHOUT the tune (before). */
const ALL = [];
for (const z of ZONES) {
  const P = json(`data/zones/${z}/placements.json`).placements;
  const cult = {}; for (const p of P) if (p.kind === 'town_square') cult[p.data.town] = p.data.culture || 'human';
  for (const raw of P.filter(p => p.kind === 'building')) {
    const culture = cult[raw.data.town] || 'human', townSeed = strHash(raw.data.town);
    const look = buildingLook(raw, { culture, townSeed });
    const plot = plotFromPlacement(raw);
    const before = describeBuilding({ plot, culture, townSeed, seed: buildingSeed(townSeed, raw), want: plot.want, district: plot.district });
    ALL.push({ zone: z, raw, culture, look, desc: look.desc, before, kind: raw.data.office || 'house' });
  }
}
const eaveOf = d => Math.min(...d.masses.filter(m => m.floor === 0).map(m => m.storeys * d.storeyHeight * (m.low ?? 1) - m.sink));
const doorFoot = d => { const p = partsFor(d).find(q => q.tag === 'door' && q.mesh === 'box'); return p.y; };

test('the character these are measured against is the real Chibi 2 rig (1.5-2.0 m over the height dial)', async () => {
  const { createRig } = await import('../../../../avatar-3d/js/chibi2-geometry.js');
  const hs = [0, 0.5, 1].flatMap(h => [0, 0.5, 1].map(s => createRig({ height: h, headSize: s }).height));
  assert.ok(Math.max(...hs) <= CHARACTER_HEIGHT.max + 0.02, `tallest body ${Math.max(...hs).toFixed(2)} m`);
  assert.ok(Math.min(...hs) >= CHARACTER_HEIGHT.min - 0.02, `shortest body ${Math.min(...hs).toFixed(2)} m`);
  assert.ok(Math.abs(createRig({}).height - CHARACTER_HEIGHT.typical) < 0.05, `typical body ${createRig({}).height.toFixed(2)} m`);
});

test('T13: every door fits a character with room to spare, and stands on the ground', () => {
  assert.ok(ALL.length > 500, 'buildings: ' + ALL.length);
  let sunkBefore = 0, shortBefore = 0;
  for (const b of ALL) {
    const d = b.desc;
    assert.ok(d.door.h >= CHARACTER_HEIGHT.max * 1.3 - 1e-9, `${b.zone} ${b.raw.id} (${b.kind}): a ${d.door.h.toFixed(2)} m door`);
    assert.ok(d.door.w >= 1.2 || d.door.w >= d.masses[d.door.mass].w * 0.55 - 1e-9, `${b.raw.id}: a ${d.door.w.toFixed(2)} m wide door`);
    assert.ok(doorFoot(d) >= -1e-6, `${b.zone} ${b.raw.id} (${b.kind}): its door starts ${(-doorFoot(d)).toFixed(2)} m under the ground`);
    assert.ok(d.door.h <= eaveOf(d) - 0.2, `${b.raw.id}: the door is taller than the wall it is in`);
    if (doorFoot(b.before) < -0.5) sunkBefore++;
    if (b.before.door.h + Math.min(0, doorFoot(b.before)) < CHARACTER_HEIGHT.max) shortBefore++;
  }
  // the bug was real: before the tune these doors could not be walked through by the tallest character
  console.log(`[T13] ${ALL.length} town buildings; before: ${sunkBefore} doors started > 0.5 m under ground, ${shortBefore} showed less than ${CHARACTER_HEIGHT.max} m above it; after: 0`);
  assert.ok(shortBefore > ALL.length * 0.2, 'the before case is what the owner saw');
});

test('T13: storeys and eaves are well clear of a head; nothing is squat', () => {
  for (const b of ALL) {
    const d = b.desc;
    assert.ok(d.storeyHeight >= BUILDING_SCALE.storeyHeight[0] - 1e-9, `${b.raw.id}: a ${d.storeyHeight.toFixed(2)} m storey`);
    assert.ok(eaveOf(d) >= 3.3 - 1e-9, `${b.zone} ${b.raw.id} (${b.kind}): eave at ${eaveOf(d).toFixed(2)} m`);
    assert.ok(eaveOf(d) >= CHARACTER_HEIGHT.max * 1.6, `${b.raw.id}: the eave is in the character's hat`);
    // squat = much wider than tall: the building stands at least 45% as high as its longer side (a one-storey forge
    // on a 10 m plot is the limit); before, the worst were 2.3 m to the top of the turf on 7 m of house
    const long = Math.max(d.footprint.w, d.footprint.d);
    assert.ok(heightOf(d) >= long * 0.45, `${b.zone} ${b.raw.id} (${b.kind}): ${heightOf(d).toFixed(1)} m tall on a ${long.toFixed(1)} m footprint`);
  }
});

test('T13: the trade buildings stand out — two storeys wherever the plot can carry it, and the plot is used', () => {
  let offices = 0, tall = 0, tallBefore = 0;
  for (const b of ALL.filter(q => q.raw.data.office)) {
    offices++;
    const plot = plotFromPlacement(b.raw), deep = Math.min(plot.w, plot.d) - 1.1 >= BUILDING_SCALE.twoStoreyMinDepth;
    if (b.desc.storeys >= 2) tall++;
    if (b.before.storeys >= 2) tallBefore++;
    if (deep && BUILDING_SCALE.twoStorey.includes(b.raw.data.office)) assert.ok(b.desc.storeys >= 2, `${b.zone} ${b.raw.id}: a one-storey ${b.raw.data.office}`);
    // the building takes its plot: at least the asked share of what the plot offers, each way
    const fit = fitToPlot(plot), aw = Math.max(2.4, fit.w - KIT.knobs.plotInset * 2), ad = Math.max(2.4, fit.d - KIT.knobs.plotInset * 2);
    assert.ok(b.desc.footprint.w >= aw * BUILDING_SCALE.fill.office - 1e-6 && b.desc.footprint.d >= ad * BUILDING_SCALE.fill.office - 1e-6, `${b.raw.id}: a hut on a bigger plot`);
  }
  console.log(`[T13] offices ${offices}: two storeys or more ${tallBefore} -> ${tall}`);
  assert.ok(tall > offices * 0.55 && tall > tallBefore * 2, `two-storey offices ${tallBefore} -> ${tall} of ${offices}`);
});

test('T13: nothing moved — every footprint is inside its plot, facing the way it faced, and the dressing still hangs on it', () => {
  for (const b of ALL) {
    const d = b.desc, plot = plotFromPlacement(b.raw), fit = fitToPlot(plot);
    assert.ok(d.footprint.w <= fit.w - KIT.knobs.plotInset * 2 + 1e-6 || d.footprint.w <= 2.4 + 1e-6, `${b.raw.id}: wider than its plot`);
    assert.ok(d.footprint.d <= fit.d - KIT.knobs.plotInset * 2 + 1e-6 || d.footprint.d <= 2.4 + 1e-6, `${b.raw.id}: deeper than its plot`);
    assert.equal(d.yaw, b.before.yaw);
    if (b.look.dressing) {
      const top = heightOf(d) + 4;
      for (const p of b.look.dressing.parts) assert.ok([p.x, p.y, p.z, p.w, p.h, p.d].every(Number.isFinite) && p.y > -1.5 && p.y < top, `${b.raw.id}: dressing part at y ${p.y}`);
      // the name board sits OVER the door on a tall front; on a one-storey front it may lap the lintel, no more
      const f = b.look.dressing.fascia, frontMass = d.masses.find(m => m.index === d.door.mass);
      if (f) assert.ok(f.y >= d.door.h - (frontMass.storeys >= 2 ? 0 : 0.35), `${b.raw.id}: its sign is ${(d.door.h - f.y).toFixed(2)} m down the doorway`);
    }
  }
});

test('T13: set-piece buildings (farms, inns, mills, chapels) get the same heights', async () => {
  const { planSetPieces } = await import('../../js/client/setpiece-view.js');
  let n = 0;
  for (const z of ZONES) {
    const P = json(`data/zones/${z}/placements.json`).placements.filter(p => p.kind === 'set_building');
    for (const b of planSetPieces({ placements: P }).buildings) {
      const d = describeBuilding({ plot: b.plot, culture: b.culture, seed: b.seed, want: b.plot.want, tune: tuneFor(b.plot.want, { plot: b.plot, seed: b.seed }) });
      assert.ok(d.door.h >= CHARACTER_HEIGHT.max * 1.3 - 1e-9 && doorFoot(d) >= -1e-6 && d.storeyHeight >= 3.3 - 1e-9, `${z} ${b.id}: door ${d.door.h.toFixed(2)}, storey ${d.storeyHeight.toFixed(2)}`);
      if (b.kind) officeDressing(b.kind, d, { lit: b.lit, seed: b.seed });
      n++;
    }
  }
  assert.ok(n >= 60, 'set buildings: ' + n);
});

test('T13: the before/after table, per building kind (door, storey, eave, storeys, roof pitch, footprint)', () => {
  const by = {};
  for (const b of ALL) (by[b.kind] ||= []).push(b);
  const avg = (a, f) => a.reduce((s, b) => s + f(b), 0) / a.length, f2 = v => v.toFixed(2);
  const rows = [];
  by['~ALL'] = ALL; by['~HOMES'] = ALL.filter(b => !b.raw.data.office); by['~OFFICES'] = ALL.filter(b => b.raw.data.office);
  for (const [kind, a] of Object.entries(by).sort()) {
    const row = d => [f2(avg(a, b => b[d].door.h + Math.min(0, doorFoot(b[d])))), f2(avg(a, b => b[d].storeyHeight)), f2(avg(a, b => eaveOf(b[d]))), f2(avg(a, b => b[d].storeys)), f2(avg(a, b => b[d].roofPitch)), f2(avg(a, b => heightOf(b[d]))), f2(avg(a, b => b[d].footprint.w)) + 'x' + f2(avg(a, b => b[d].footprint.d))];
    rows.push({ kind, n: a.length, before: row('before'), after: row('desc') });
    // the average building of every kind is taller than it was, and its door clears the tallest character
    assert.ok(avg(a, b => eaveOf(b.desc)) > avg(a, b => eaveOf(b.before)) * 1.3, `${kind}: eave`);
  }
  const shown = (b, d) => b[d].door.h + Math.min(0, doorFoot(b[d]));
  console.log(`[T13] door showing above ground, worst: ${Math.min(...ALL.map(b => shown(b, 'before'))).toFixed(2)} -> ${Math.min(...ALL.map(b => shown(b, 'desc'))).toFixed(2)} m; lowest eave: ${Math.min(...ALL.map(b => eaveOf(b.before))).toFixed(2)} -> ${Math.min(...ALL.map(b => eaveOf(b.desc))).toFixed(2)} m`);
  if (process.env.TABLE) {
    console.log('kind             n   | door above ground, storey, eave, storeys, pitch, top, footprint  (before -> after)');
    for (const r of rows) console.log(r.kind.padEnd(16), String(r.n).padStart(3), ' |', r.before.join(' '), ' ->', r.after.join(' '));
  }
});
