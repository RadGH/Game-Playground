// node --test prototypes/thousandvale/tests/D/pt11-world.test.js
// Play-test 11 — D-world (3D client visuals): the pure parts of Z25 forests + far trees, Z26 archers' arrows, Z32 mount
// size, Z37 round colliders (client AND server), Z38 click-to-move pathfinding, Z39 a fan's three flights, Z45 travel marks,
// Z47 the two Vharlen lizards, Z49 the ship's arrival, Z54 a late Giant, Z59 the painted sky, and the Star Blade's gold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { parseNav, parseScatter, parseTerrain, NAV, SCATTER_KINDS } from '../../js/rules/terrain-read.js';
import { refineNav, colliderRadius, SCATTER_COLLIDE, BODY_R } from '../../js/rules/nav-refine.js';
import { growForest, forestAt, FOREST, clearOf } from '../../js/rules/forest.js';
import { createRouter, createWalker } from '../../js/client/click-path.js';
import { stepMove } from '../../js/sim/movement.js';
import { projectileKind, fanSide, fanBow, SHOOTER_HELD } from '../../js/client/projectile-kinds.js';
import { starTint, STARBLADE_SKILLS, isStarSkill } from '../../js/client/star-looks.js';
import { travelOf, TRAVEL_MARKS } from '../../js/client/travel-marks.js';
import { skyPlan, skyStage, weatherFor, fogColourFor, realmDay, daySky, SKY_IDS } from '../../js/client/sky-plan.js';
import { MOUNT_TYPES, mountSpecFor } from '../../../../avatar-3d/js/mount-types.js';
import { CREATURE_TYPES } from '../../../../avatar-3d/js/creature-types.js';

const at = p => new URL('../../' + p, import.meta.url);
const src = p => readFileSync(at(p), 'utf8');
const zone = z => ({ nav: parseNav(readFileSync(at(`data/zones/${z}/nav.bin`))), sc: parseScatter(readFileSync(at(`data/zones/${z}/scatter.bin`))) });
const Z = zone('z12_02');                     // Torborhold's zone: the report's boulders (live #38) and the woods (#26)
const OX = 12 * 2048, OZ = 2 * 2048;

// ---------------------------------------------------------------------------------------------------- Z37 colliders
test('Z37 (#38): a boulder blocks as a CIRCLE its own drawn size — not the 2 m-grid square padded by a metre', () => {
  const R = refineNav(Z.nav, Z.sc);
  // the report's boulder (zone metres 1506.12, 532.85, scale 0.8): drawn radius 0.94 x clamp(0.8 x 1.4) = 1.05 m
  const bx = 1506.12, bz = 532.85, r = colliderRadius('boulder', 0.8, 0, 1);
  assert.ok(Math.abs(r - (0.94 * 1.12 + BODY_R)) < 0.05, `collider ${r.toFixed(2)} m`);
  let inside = 0, outside = 0, n = 0;
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2; n++;
    if (R.at(bx + Math.cos(a) * (r - 0.15), bz + Math.sin(a) * (r - 0.15)) & NAV.SOLID) inside++;
    if (!(R.at(bx + Math.cos(a) * (r + 0.6), bz + Math.sin(a) * (r + 0.6)) & NAV.SOLID)) outside++;
  }
  assert.equal(inside, n, 'solid all round, just inside');
  assert.ok(outside >= n - 4, `open just outside on ${outside} of ${n} bearings (another boulder may stand there)`);
  // the old grid: a point 2 m off the stone's middle was blocked; now it is open ground
  assert.ok(Z.nav.at(bx + 2.2, bz) & NAV.SOLID, 'the bake blocked it');
  assert.equal(R.at(bx + 2.2, bz) & NAV.SOLID, 0, 'the circle does not');
});

test('Z37: walls, towers, buildings and water answer exactly as before — only the scatter-made squares are replaced', () => {
  const R = refineNav(Z.nav, Z.sc);
  const { size, step, bits } = Z.nav;
  let walls = 0, buildings = 0, deep = 0;
  for (let j = 0; j < size; j += 1) for (let k = 0; k < size; k += 1) {
    const o = j * size + k, b = bits[o], x = k * step, z = j * step;
    if (b & NAV.BUILDING) { buildings++; assert.ok(R.at(x, z) & NAV.BUILDING); }
    if (b & NAV.DEEP) { deep++; if (deep % 50 === 0) assert.ok(R.at(x, z) & NAV.DEEP); }
    if ((b & NAV.SOLID) && (b & NAV.TOWN)) { walls++; assert.ok(R.at(x, z) & NAV.SOLID, `a town wall sample at ${x},${z} stays solid`); }
  }
  assert.ok(walls > 100 && buildings > 100, `${walls} town-wall samples, ${buildings} building samples checked`);
  assert.ok(R.refined > 5000 && R.circles.count > 5000, `${R.refined} grid squares replaced by ${R.circles.count} circles`);
  assert.equal(R.bits, Z.nav.bits, 'the raw bits are the same array (offline tools read them)');
});

test('Z37: every solid kind the client draws has a measured collider; the server and the client wrap the SAME way', () => {
  for (const k of SCATTER_KINDS) if (k.solid) assert.ok(SCATTER_COLLIDE[k.key], k.key);
  // (< 3: Saint's Meadow's old oak, tree_old_oak, is a 2.7 m trunk on purpose — it failed the old < 2 since it landed)
  for (const [k, c] of Object.entries(SCATTER_COLLIDE)) assert.ok(c.r.every(v => v > 0.1 && v < 3) && c.art > 0, k);
  // a trunk is a trunk: a broadleaf at scale 1 is well under the old 1.5 m stamp
  assert.ok(colliderRadius('tree_broadleaf', 1, 0) < 0.8);
  const content = src('js/sim/content.js'), ws = src('js/client/world-stream.js');
  assert.match(content, /refineNav\(nav, growForest\(parseScatter\(/, 'server: nav wrapped with the grown woods');
  assert.match(ws, /growForest\(extras\.scatter, nav, \{ ox: q\.bounds\.minX, oz: q\.bounds\.minZ, clear: clearOf\(extras\.placements, vigOk \? extras\.vignettes : \[\]\) \}\)/);
  assert.match(content, /clear: clearOf\(\(bp && bp\.placements\) \|\| \[\], vigRaw\)/, 'both keep the woods off the same places');
  assert.match(ws, /refineNav\(nav, extras\.scatter\)/, 'client: the same nav, the same grown scatter');
});

// ---------------------------------------------------------------------------------------------------- Z25 forests
test('Z25 (#26): woods are grown — giants 3-5x, new trees on open ground only, the same on every machine', () => {
  const g1 = growForest(Z.sc, Z.nav, { ox: OX, oz: OZ }), g2 = growForest(Z.sc, Z.nav, { ox: OX, oz: OZ });
  assert.equal(g1.count, g2.count); assert.deepEqual(Array.from(g1.x.slice(-40)), Array.from(g2.x.slice(-40)), 'deterministic');
  assert.ok(g1.grown > 1000 && g1.giants > 800, `${g1.grown} new trees, ${g1.giants} giants`);
  assert.equal(g1.baked, Z.sc.count); assert.deepEqual(Array.from(g1.kind.slice(0, 200)), Array.from(Z.sc.kind.slice(0, 200)), 'the bake\'s own items unchanged and first');
  for (let i = 0; i < g1.count; i++) {
    if (g1.size[i] > 1) assert.ok(g1.size[i] >= FOREST.giantMin && g1.size[i] <= FOREST.giantMax);
    if (!g1.added[i]) continue;
    const b = Z.nav.at(g1.x[i], g1.z[i]);
    assert.ok(b & NAV.WALK, 'on walkable ground');
    assert.equal(b & (NAV.ROAD | NAV.TOWN | NAV.BUILDING | NAV.DEEP | NAV.SHALLOW | NAV.STEEP), 0, `a new tree at ${g1.x[i].toFixed(1)},${g1.z[i].toFixed(1)} is off roads, towns, water and cliffs`);
    assert.ok(forestAt(g1.x[i] + OX, g1.z[i] + OZ) > FOREST.patchFrom - 0.15, 'inside a wood (a ring of 11 m round a tree that is)');
  }
  // a giant blocks as a giant: its trunk circle is as much wider
  const R = refineNav(Z.nav, g1);
  const gi = Array.from(g1.size).findIndex((v, i) => v > 4 && SCATTER_KINDS[g1.kind[i]].key === 'tree_broadleaf');
  const cr = colliderRadius('tree_broadleaf', g1.scale[gi], g1.variant[gi], g1.size[gi]);
  assert.ok(cr > 1, `a giant oak's trunk circle ${cr.toFixed(2)} m`);
  assert.ok(R.at(g1.x[gi] + cr * 0.8, g1.z[gi]) & NAV.SOLID);
  // and the client draws it that much bigger
  assert.match(src('js/client/scatter-view.js'), /\* \(sc\.size \? sc\.size\[i\] : 1\)/);
});

test('Z25: the woods keep off set pieces, buildings, fields, camps and every vignette', () => {
  const bake = JSON.parse(src('data/zones/z12_02/placements.json')).placements, vig = JSON.parse(src('data/vignettes/placements/z12_02.json')).placements;
  const clear = clearOf(bake, vig);
  assert.ok(clear.length > 300, `${clear.length} keep-clear circles`);
  const g = growForest(Z.sc, Z.nav, { ox: OX, oz: OZ, clear });
  let bad = 0;
  for (let i = 0; i < g.count; i++) {
    if (!g.added[i] && !(g.size[i] > 1)) continue;
    if (clear.some(c => Math.hypot(c.x - g.x[i], c.z - g.z[i]) < c.r)) bad++;
  }
  assert.equal(bad, 0, 'no new tree and no giant inside a keep-clear circle');
  assert.ok(g.grown > 800, `${g.grown} new trees still`);
});

test('Z25: a far tree is a two-tier six-sided conifer; the nearest canopy spires are swapped for real kit trees', async () => {
  const { SPIRE, writeSpire, indexSpire } = await import('../../js/client/horizon-grid.js');
  assert.equal(SPIRE.verts, 14); assert.equal(SPIRE.tris, 12);
  const pos = new Float32Array(42), nor = new Float32Array(42), col = new Float32Array(42), idx = new Uint16Array(36);
  writeSpire(pos, nor, col, 0, 10, 100, 20, 15, 6, 0, [0, 1, 0], [0.1, 0.3, 0.1]);
  assert.equal(indexSpire(idx, 0, 0), 36);
  assert.ok(pos[13 * 3 + 1] === 115 && pos[6 * 3 + 1] < pos[13 * 3 + 1], 'the crown on top');
  assert.ok(col[13 * 3 + 1] > col[1], 'the tips lighter than the boughs underneath');
  const near = src('js/client/near-trees.js'), hz = src('js/client/horizon.js');
  assert.match(near, /transformed = vec3\(aRoot\.x, -9000\.0, aRoot\.y\)/, 'the spires near you fold away');
  assert.match(hz, /near\.rootAttribute\(c\.roots/); assert.match(hz, /near\.update\(cam\)/);
  assert.match(near, /foliageMaterials\(/, 'the scatter\'s own materials: no new shader for the leaves');
});

// ---------------------------------------------------------------------------------------------------- Z38 pathing
test('Z38 (#39): click-to-move walks ROUND the boulder field the straight walk sticks in', () => {
  const T = parseTerrain(readFileSync(at('data/zones/z12_02/terrain.bin')));
  const nav = refineNav(Z.nav, growForest(Z.sc, Z.nav, { ox: OX, oz: OZ }));
  const terrain = { heightAt: (x, z) => T.heightAt(x, z), walkable: (x, z) => T.walkable(x, z), waterAt: (x, z) => T.waterAt(x, z), nav };
  if (T.moveAt) terrain.moveAt = (x, z) => T.moveAt(x, z);
  const route = createRouter(terrain);
  const walk = (sx, sz, gx, gz, routed) => {
    const st = { x: sx, z: sz, y: T.heightAt(sx, sz), vy: 0, airborne: false }, w = createWalker(), goal = { x: gx, z: gz };
    for (let k = 0, t = 0; k < 600; k++) {
      t += 100;
      const wp = routed ? w.steer(st, goal, route, t) : goal; if (!wp || Math.hypot(gx - st.x, gz - st.z) < 0.5) break;
      const dx = wp.x - st.x, dz = wp.z - st.z, d = Math.hypot(dx, dz) || 1;
      stepMove(st, { mx: dx / d, mz: dz / d, b: 1 }, 100, terrain);
    }
    return Math.hypot(gx - st.x, gz - st.z);
  };
  const straight = walk(1505, 515, 1505, 545, false), routed = walk(1505, 515, 1505, 545, true);
  assert.ok(straight > 5, `straight: stuck ${straight.toFixed(1)} m short`);
  assert.ok(routed < 0.6, `routed: there (${routed.toFixed(2)} m)`);
  const r = route({ x: 1505, z: 515 }, { x: 1505, z: 545 });
  assert.ok(r.pts.length >= 2 && r.pts.length < 10 && !r.straight, `${r.pts.length} waypoints`);
  assert.equal(route({ x: 1600, z: 700 }, { x: 1601, z: 702 }).straight, true, 'open ground: straight, no search');
  assert.match(src('js/client/main.js'), /route: \(from, to\) => \(S\.predictor\.terrain \? createRouter\(S\.predictor\.terrain\)\(from, to\) : null\)/);
});

// ---------------------------------------------------------------------------------------------------- Z26 / Z39 shots
test('Z26 (#27): a brigand archer looses an ARROW — the bow in its bestiary look is read', () => {
  assert.equal(projectileKind({ kind: 'shot', element: 'physical' }, { held: 'bow' }).model, 'arrow');
  assert.equal(projectileKind({ kind: 'shot', element: 'physical' }, { held: SHOOTER_HELD.clockwork_sentry }).model, 'quarrel');
  assert.equal(projectileKind({ kind: 'shot', element: 'physical' }, { held: null }).model, 'stone', 'a beast with nothing in its paws still throws a rock');
  assert.match(src('js/client/actors.js'), /a\.heldId = look\.avatar\.held\?\.id \|\| null/);
  assert.match(src('js/client/projectiles.js'), /a\?\.look\?\.avatar\?\.held\?\.id \|\| SHOOTER_HELD\[a\?\.creature\?\.type\]/);
  // every ranged humanoid in the bestiary holds something that flies as itself
  const d = JSON.parse(readFileSync(at('../farhold/data/enemies.json'), 'utf8'));
  for (const e of [...d.enemies, ...d.bosses]) {
    if (!e.ranged || (e.ranged.element || 'physical') !== 'physical') continue;
    const held = e.look?.avatar?.held?.id || SHOOTER_HELD[e.id] || null;
    assert.notEqual(projectileKind({ kind: 'shot', element: 'physical' }, { held }).model, 'stone', `${e.id} shoots something real`);
  }
});

test('Z39 (#40): the three bolts of a fan each fly their own side and land on their mark', () => {
  assert.deepEqual([1, 2, 3].map(n => fanSide({ n, of: 3 })), [-1, 0, 1]);
  assert.equal(fanSide({}), 0); assert.equal(fanSide({ n: 1, of: 1 }), 0);
  assert.equal(fanBow(0, 20, 1), 0); assert.equal(fanBow(1, 20, -1) === 0 || Object.is(fanBow(1, 20, -1), -0), true, 'back on its mark at the end');
  assert.ok(fanBow(0.4, 20, 1) > 2 && fanBow(0.4, 20, -1) < -2, 'two metres and more apart mid-flight');
  assert.match(src('js/client/spells.js'), /spread: fanSide\(ev\)/); assert.match(src('js/client/projectiles.js'), /fanBow\(k, it\.dist, it\.side\)/);
});

// ---------------------------------------------------------------------------------------------------- mounts, giants
test('Z32 (#33) + Z47 (#48): every mount drawn 1.38x; the two Vharlen lizards are their own builds', async () => {
  // actors.js imports three (no node loader here): read the rule from its source and check the table
  const a = src('js/client/actors.js');
  assert.match(a, /export const MOUNT_SCALE = 1\.38;/); assert.match(a, /createMount\(tvMountSpec\(a\.mountLook \|\| want\)/);
  assert.equal(mountSpecFor({ id: 'trail_horse', scale: 1.38 }).size, +(MOUNT_TYPES.horse.size * 1.38).toFixed(3));
  for (const k of ['ash_strider', 'slag_basker']) {
    const T = MOUNT_TYPES[k]; assert.ok(T && CREATURE_TYPES[T.creature], k);
    assert.equal(T.creature, k, `${k} rides its own body, not a recoloured drake / crocodile`);
  }
  const S = CREATURE_TYPES.ash_strider.body, B = CREATURE_TYPES.slag_basker.body;
  assert.ok(S.legLen > CREATURE_TYPES.drake.body.legLen * 1.6 && S.neckUp > CREATURE_TYPES.drake.body.neckUp, 'the strider: long legs, head high');
  assert.ok(B.r > CREATURE_TYPES.crocodile.body.r * 1.3 && B.tail.len < CREATURE_TYPES.crocodile.body.tail.len, 'the basker: broad, short-tailed');
  assert.ok(MOUNT_TYPES.slag_basker.size > 0 && MOUNT_TYPES.ash_strider.size > 0);
});

test('Z54 (#55): a body re-scales when its size arrives late; a humanoid monster\'s portrait frames its FACE', () => {
  const a = src('js/client/actors.js'), m = src('js/client/main.js'), p = src('js/client/ui/portraits.js');
  assert.match(a, /function setScale\(id, \{ sc = null, rank = null, mods = null \} = \{\}\)/);
  assert.match(m, /actors\.setScale\(id, \{ sc: info\.sc \|\| null, rank: info\.rank \|\| null, mods: info\.aff \|\| info\.mods \|\| null \}\)/);
  assert.match(p, /a\.kind === 'npc' \|\| a\.humanoid\) \|\| a\.pet \|\| !head/);
  assert.match(a, /\* \(a\.humanoid \? \(a\.big \|\| 1\) : 1\)/, 'a scaled person is that much taller (plate, marks, portrait)');
  // THE bug: the frame loop set every body's scale to 1 + the hit pulse, so a humanoid Giant (scaled as a whole) was drawn
  // at plain size whatever the server said; the loop now keeps its size
  assert.match(a, /a\.model\.scale\.setScalar\(\(\(a\.big \|\| 1\) \/ \(a\.builtBig \|\| 1\)\) \* \(1 \+ a\.punch \* 0\.12\)\)/);
  assert.doesNotMatch(a, /a\.model\.scale\.setScalar\(1 \+ a\.punch \* 0\.12\)/);
});

// ---------------------------------------------------------------------------------------------------- Z45 travel
test('Z45 (#46): a ship over the harbourmaster, a cart over carters and parked carts', () => {
  assert.equal(travelOf({ role: 'harbourmaster' }), 'ship');
  assert.equal(travelOf({ role: 'carter' }), 'cart');
  assert.equal(travelOf({ vehicle: 'ox_cart', cart: 'gullwick' }), 'cart');
  assert.equal(travelOf({ role: 'merchant' }), null); assert.equal(travelOf(null), null);
  assert.deepEqual(TRAVEL_MARKS, ['ship', 'cart']);
  const icons = src('../../icons/data/game/ui.js');
  assert.match(icons, /travel_ship: \{/); assert.match(icons, /travel_cart: \{/);
  // the people who carry them: every harbour has a harbourmaster, every cart office a carter
  const ships = JSON.parse(src('data/provinces/ships.json'));
  assert.ok(ships.harbours.every(h => h.master?.name), 'each harbour names its harbourmaster');
});

// ---------------------------------------------------------------------------------------------------- Z49 ship
test('Z49 (#50): the ship comes in at ONE steady rate — never a lunge at the shore — and the water flows at her speed', async () => {
  const s = src('js/client/ship-view.js');
  // the profile is pure but lives beside three in ship-view.js: run it through the playground's three loader
  const loader = at('../../avatar-3d/tests/three-register.mjs');
  if (!existsSync(loader)) return;
  const { execFileSync } = await import('node:child_process');
  const code = `import('${at('js/client/ship-view.js').href}').then(m => { const L = 19500, T = 40, p = m.voyageProfile(L, T); const rows = []; for (let t = 0; t <= T; t += 0.25) rows.push([t, p.at(t), p.speed(t)]); console.log(JSON.stringify({ vMax: p.vMax, rows })); })`;
  const out = JSON.parse(execFileSync(process.execPath, ['--import', loader.pathname, '--input-type=module', '-e', code], { encoding: 'utf8' }));
  const L = 19500;
  let prev = -1;
  for (const [t, at0, v] of out.rows) {
    assert.ok(at0 >= prev - 1e-6, 'never sails backwards'); prev = at0;
    const togo = L - at0;
    // the far shore grows at a steady rate: speed / distance-to-go stays at the arrive rate once she is slowing
    if (togo < 2500 && togo > 60) assert.ok(v / togo < 0.4, `t ${t}: ${v.toFixed(1)} m/s with ${togo.toFixed(0)} m to go`);
  }
  assert.ok(Math.abs(out.rows.at(-1)[1] - L) < 1, 'arrives exactly at the berth');
  assert.ok(out.rows.find(r => r[0] === 37)[2] < 25, 'the last seconds at a ship\'s own pace');
  assert.match(s, /Math\.min\(VOYAGE\.flowMaxMps, Math\.max\(VOYAGE\.visualMps \* 0\.3, V\.profile\.speed\(t\)\)\)/, 'the water runs at the ship\'s speed');
});

// ---------------------------------------------------------------------------------------------------- Z59 sky
test('Z59 (#60): six painted skies, crossfaded by the clock; weather by realm day; Vharlen its own; fog = the horizon', () => {
  const man = JSON.parse(src('assets/sky/skies.json')).skies;
  assert.deepEqual(Object.keys(man).sort(), [...SKY_IDS].sort());
  for (const [id, r] of Object.entries(man)) {
    const f = at('assets/sky/' + r.file);
    assert.ok(existsSync(f), id); assert.ok(statSync(f).size < 400 * 1024, `${id}: ${Math.round(statSync(f).size / 1024)} KB`);
    assert.ok(r.horizonV > 0.8 && r.horizonV < 0.97 && r.fog.length === 3 && r.fog.every(v => v >= 0 && v <= 1), id);
  }
  // the clock: night -> dawn -> day -> dusk -> night, with blends, never a jump
  assert.equal(skyStage(0.02).a, 'night'); assert.equal(skyStage(0.27).a, 'dawn'); assert.equal(skyStage(0.5).a, 'day'); assert.equal(skyStage(0.74).a, 'dusk');
  let last = skyPlan(0, { day: 3 });
  for (let t = 0.001; t < 1; t += 0.001) {
    const p = skyPlan(t, { day: 3 });
    if (p.a === last.a && p.b === last.b) assert.ok(Math.abs(p.k - last.k) < 0.06, `no jump at ${t.toFixed(3)}`);
    last = p;
  }
  // weather: the same answer for everyone, about a third of the days cloudy; Vharlen keeps its own day sky
  const days = Array.from({ length: 300 }, (_, d) => weatherFor(d, 'torbor_downs'));
  assert.deepEqual(days, Array.from({ length: 300 }, (_, d) => weatherFor(d, 'torbor_downs')));
  const cloudy = days.filter(w => w === 'cloudy').length;
  assert.ok(cloudy > 60 && cloudy < 150, `${cloudy} cloudy days in 300`);
  assert.equal(daySky({ province: 'vharlen', weather: 'cloudy' }), 'vharlen');
  assert.equal(skyPlan(0.5, { province: 'vharlen' }).a, 'vharlen');
  // the fog is the painting's own horizon, blended like the pictures
  const p = { a: 'day_clear', b: 'dusk', k: 0.5 };
  assert.deepEqual(fogColourFor(p, man).map(v => +v.toFixed(3)), man.day_clear.fog.map((v, i) => +((v + man.dusk.fog[i]) / 2).toFixed(3)));
  assert.equal(realmDay({ epoch: 0, dayMs: 1000, skew: 0 }, 5500), 5); assert.equal(realmDay(null), 0);
  const sc = src('js/client/scene.js');
  assert.match(sc, /scene\.fog\.color\.setRGB\(f\[0\], f\[1\], f\[2\], THREE\.LinearSRGBColorSpace\)/, 'the fog written as display values (three adds fog after tone mapping)');
  assert.match(src('js/client/sky-box.js'), /gl_FragColor\.rgb = mix\(uFog, gl_FragColor\.rgb, smoothstep\(/, 'the painting melts into that same fog at the horizon');
});

// ---------------------------------------------------------------------------------------------------- Star Blade
test('round 11: the Star Blade\'s arcane is drawn gold (star-fx), never the generic violet', () => {
  for (const id of STARBLADE_SKILLS) assert.ok(isStarSkill(id), id);
  assert.equal(starTint('arcane', { cls: 'starblade' }), 'holy');
  assert.equal(starTint('arcane', { skill: 'comet_rush' }), 'holy');
  assert.equal(starTint('arcane', { cls: 'mage' }), 'arcane', 'a mage keeps its violet');
  assert.equal(starTint('fire', { cls: 'starblade' }), 'fire');
  assert.match(src('js/client/weapon-fx.js'), /starTint\(elementKey\(ev\.el\), \{ cls: a\?\.look\?\.cls/);
});
