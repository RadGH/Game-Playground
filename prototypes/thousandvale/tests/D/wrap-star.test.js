// Wrap-up 2026-10-13 — the Starcaller's visuals (Y32): "throws golden star-like projectiles, summons stars from the
// sky, and lays AoE zones." Every skill of the class must reach a STAR look and not the generic arcane one; the falling
// star must land when the rules deal the damage; the class has an outfit of its own.
// Run: node --test prototypes/thousandvale/tests/D/wrap-star.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectileKind, MODELS } from '../../js/client/projectile-kinds.js';
import { STAR_SKILLS, isStarSkill, isStarShot, skyfallPlan, skyAt, starZone, starOrbs, moteCount, moteSpent, moteSeat, classWearLook } from '../../js/client/star-looks.js';
import { gearLook } from '../../js/client/gear-look.js';
import { dressAs, tier2Dress, OUTFIT_SLOTS } from '../../../../avatar-3d/js/class-outfits.js';
import { partIds } from '../../../../avatar-2d/js/parts/index.js';

const at = p => fileURLToPath(new URL('../../' + p, import.meta.url));
const src = p => readFileSync(at(p), 'utf8');
const json = p => JSON.parse(src(p));
const TV = json('data/rules/classes-tv.json'), PROJ = json('data/rules/projectiles.json'), OUT = json('data/class-outfits-tv.json');
const CLS = TV.classes.find(c => c.id === 'starcaller');

/** The events the rules send for a skill row, in the shapes docs/requests.md "Round 10 contracts — C (Starcaller, Y32)" gives. */
function eventsOf(id, row) {
  const out = [];
  if (row.shape === 'bolt') out.push({ kind: 'bolt', id: 7, skill: id, element: row.element, proj: PROJ.proj.byId[id] ?? PROJ.proj.byElement[row.element] ?? PROJ.proj.default, from: { x: 0, z: 0 }, to: 9, ms: 600 });
  if (row.tv?.sky) out.push({ kind: 'skyfall', id: 7, skill: id, proj: row.tv.sky.proj, el: row.element, to: { x: 4, z: 5 }, r: row.radius, ms: row.tv.sky.fallMs, ...(row.repeats ? { n: 3, of: row.repeats.count } : {}) });
  if (row.place) out.push({ kind: 'place', obj: 31, skill: id, x: 4, z: 5, r: row.place.radius, seconds: row.place.seconds, element: row.element });
  if (row.orbs) out.push({ kind: 'orbs', id: 7, count: row.orbs.count, seconds: row.orbs.seconds, element: row.element });
  for (const tier of Object.values(row.talents || {})) for (const n of tier.nodes) if (n.mod?.pool) out.push({ kind: 'pool', id: 7, pid: 2, x: 4, z: 5, r: n.mod.pool.radius, seconds: n.mod.pool.seconds, element: n.mod.pool.element, _talent: n.id });
  return out;
}
/** Does the star drawer take this event (true), or does it fall through to the generic arcane look (false)? */
function isStarDrawn(ev, cls = 'starcaller') {
  if (ev.kind === 'bolt') return isStarShot(ev) && projectileKind(ev).model === 'star';
  if (ev.kind === 'skyfall') return true;
  if (ev.kind === 'place' || ev.kind === 'pool') return !!starZone(ev, cls);
  if (ev.kind === 'orbs') return !!starOrbs(ev, cls);
  return false;
}

test('Y32: the class is the six skills this file knows, and every one of them has something of its own to draw', () => {
  assert.deepEqual([...CLS.skills].sort(), [...STAR_SKILLS].sort(), 'star-looks.js lists exactly the class\'s skills');
  for (const id of CLS.skills) {
    assert.ok(isStarSkill(id));
    const evs = eventsOf(id, TV.skills[id]);
    assert.ok(evs.filter(e => !e._talent).length >= 1, `${id} sends something to draw`);
    for (const ev of evs) assert.ok(isStarDrawn(ev), `${id}${ev._talent ? ' / ' + ev._talent : ''}: fx ${ev.kind} is drawn as a star, not the generic look`);
  }
});

test('Y32: the thrown skills fly as a golden star; nobody else\'s shot changed', () => {
  for (const id of ['star_dart', 'star_volley']) {
    assert.equal(PROJ.proj.byId[id], 'star', `${id} is tagged with the star projectile`);
    const k = projectileKind({ kind: 'bolt', skill: id, proj: 'star', element: 'arcane' });
    assert.equal(k.model, 'star'); assert.equal(k.gold, true, 'gold, not the element\'s violet');
  }
  // a skill C did not tag keeps its body: an arcane bolt is still an orb, a firebolt a firebolt, an arrow an arrow
  assert.equal(projectileKind({ kind: 'bolt', skill: 'arcane_bolt', proj: 'orb', element: 'arcane' }).model, 'orb');
  assert.equal(projectileKind({ kind: 'bolt', element: 'arcane' }).model, 'orb');
  assert.equal(projectileKind({ kind: 'bolt', proj: 'firebolt', element: 'fire' }).model, 'firebolt');
  assert.equal(projectileKind({ kind: 'arrow', proj: 'arrow', element: 'physical' }).model, 'arrow');
  assert.equal(isStarShot({ kind: 'bolt', skill: 'arcane_bolt', proj: 'orb' }), false);
  assert.equal(isStarShot({ kind: 'bolt', skill: 'basic', proj: 'orb', element: 'arcane' }), false, 'the Starcaller\'s own wand attack is still a wand attack');
  // the pooled bodies (projectiles.js builds one pool per entry) are the ten they were: the star is star-fx.js's own
  assert.deepEqual(MODELS, ['arrow', 'quarrel', 'javelin', 'knife', 'axe', 'stone', 'firebolt', 'orb', 'shard', 'spark']);
});

test('Y32: a falling star touches the ground exactly when the rules deal the damage', () => {
  for (const id of ['called_star', 'sky_barrage']) {
    const row = TV.skills[id], ms = row.tv.sky.fallMs;
    const plan = skyfallPlan({ kind: 'skyfall', id: 7, skill: id, to: { x: 40, z: -12 }, r: row.radius, ms, n: 4, of: row.repeats?.count });
    assert.equal(plan.landMs, ms, `${id}: it lands the event's own ms after the event`);
    const top = skyAt(plan, 0), end = skyAt(plan, ms), late = skyAt(plan, ms + 500);
    assert.ok(top.oy >= 20, 'it starts high above');
    assert.deepEqual([end.ox, end.oy, end.oz], [0, 0, 0], 'and is ON the target at the landing time');
    assert.deepEqual([late.oy, late.k], [0, 1], 'never below the ground');
    let last = Infinity;
    for (let t = 0; t <= ms; t += ms / 20) { const y = skyAt(plan, t).oy; assert.ok(y <= last + 1e-9, 'it only comes down'); last = y; }
    assert.equal(plan.x, 40); assert.equal(plan.z, -12); assert.equal(plan.r, row.radius);
  }
  assert.equal(skyfallPlan({ skill: 'called_star', to: { x: 0, z: 0 }, ms: 1000 }).big, true);
  assert.equal(skyfallPlan({ skill: 'sky_barrage', to: { x: 0, z: 0 }, ms: 350, n: 2, of: 10 }).big, false);
  assert.equal(skyfallPlan({ skill: 'called_star', to: { x: 0, z: 0 } }).landMs, 0, 'no delay = it has landed');
  // the rules' own two delays are the ones the contract names
  assert.equal(TV.skills.called_star.tv.sky.fallMs, TV.skills.called_star.delay * 1000);
});

test('Y32: the drawer lands a falling star on the clock, whatever the frame rate', { skip: !existsSync(at('../../avatar-3d/tests/three-register.mjs')) && 'the playground three loader is not here' }, () => {
  const code = `
    import * as THREE from 'three';
    let now = 1000; globalThis.performance = { now: () => now };
    const { createStarFx } = await import(${JSON.stringify(at('js/client/star-fx.js'))});
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); camera.position.set(0, 5, 10);
    const stars = createStarFx(scene, { camera, actors: new Map(), groundY: () => 2 });
    const out = { mats: new Set(), meshes: scene.children[0].children.length };
    scene.traverse(o => { if (o.material) out.mats.add(o.material.uuid); });
    stars.skyfall({ kind: 'skyfall', id: 1, skill: 'called_star', to: { x: 3, z: 4 }, r: 5, ms: 1000 });
    const steps = [];
    // ragged frames: 16 ms, then a 400 ms stall, then 33 ms frames — the landing must still be at 1000 ms
    for (const dt of [16, 16, 400, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33, 33]) {
      now += dt; stars.update(dt / 1000);
      steps.push({ t: now - 1000, landed: stars.stats.fallsLanded, y: stars.live().falls[0]?.y ?? null });
    }
    out.steps = steps; out.last = stars.stats.lastFall;
    // a thrown star: lands after the event's ms too, and calls back once
    let landed = 0; const t0 = now;
    stars.onFx({ kind: 'bolt', id: 1, skill: 'star_dart', proj: 'star', from: { x: 0, z: 0 }, to: { x: 10, z: 0 }, ms: 500 }, null, { target: p => new THREE.Vector3(p.x, 3, p.z) });
    let at = null; stars.shot({ ms: 500 }, { from: new THREE.Vector3(0, 3, 0), to: new THREE.Vector3(10, 3, 0), onLand: () => { landed++; at = now - t0; } });
    for (let i = 0; i < 40; i++) { now += 25; stars.update(0.025); }
    out.shot = { landed, at, fired: stars.stats.shots, done: stars.stats.landed };
    // zones: laid, moved, ended; nothing is created while it runs
    const key = stars.zone({ key: 'o1', x: 0, z: 0, r: 6, ms: 8000, field: true });
    now += 500; stars.update(0.5); stars.zoneMove(key, 7, 8); now += 16; stars.update(0.016);
    out.zone = stars.live().zones[0]; out.inst = stars.live().instances;
    stars.zoneEnd(key); now += 400; stars.update(0.4); out.zonesLeft = stars.live().zones.length;
    const after = new Set(); let meshes = 0; scene.traverse(o => { if (o.material) after.add(o.material.uuid); if (o.isMesh) meshes++; });
    out.matsAfter = after.size; out.mats = out.mats.size; out.meshesAfter = meshes; out.lights = 0; scene.traverse(o => { if (o.isLight) out.lights++; });
    console.log(JSON.stringify(out));`;
  const out = JSON.parse(execFileSync(process.execPath, ['--import', at('../../avatar-3d/tests/three-register.mjs'), '--input-type=module', '-e', code], { encoding: 'utf8' }));
  const before = out.steps.filter(s => s.t < 1000), after = out.steps.filter(s => s.t >= 1000);
  assert.ok(before.length > 5 && after.length > 0);
  for (const s of before) assert.equal(s.landed, 0, `still in the air at ${s.t} ms`);
  assert.equal(after[0].landed, 1, `down on the first frame at or after 1000 ms (${after[0].t})`);
  assert.ok(out.last.landedAfter >= 1000 && out.last.landedAfter < 1034, `landed ${out.last.landedAfter} ms after its event`);
  let y = Infinity; for (const s of before) { assert.ok(s.y <= y); y = s.y; }
  assert.ok(before[0].y > 20 && before.at(-1).y < before[0].y / 3 && before.at(-1).y >= 2, 'from high above down toward the ground it was given');
  assert.deepEqual(out.shot, { landed: 1, at: 500, fired: 2, done: 2 }, 'a thrown star lands on its flight time and bursts once');
  assert.deepEqual([out.zone.x, out.zone.z, out.zone.r], [7, 8, 6], 'a zone is drawn where it was last put');
  assert.ok(out.inst.runeOuter === 1 && out.inst.runeInner === 1, 'one rune (two wheels) for one zone');
  assert.equal(out.zonesLeft, 0);
  assert.equal(out.mats, 2, 'two materials for everything'); assert.equal(out.matsAfter, 2, 'and none made by a cast');
  assert.equal(out.meshes, 6); assert.equal(out.meshesAfter, 6, 'no mesh made by a cast'); assert.equal(out.lights, 0, 'no lights');
});

test('Y32: the class\'s ground zones wear the gold star-rune — and only the class\'s', () => {
  const field = starZone({ kind: 'place', obj: 5, skill: 'star_field', x: 1, z: 2, r: 6, seconds: 8, element: 'arcane' });
  assert.deepEqual([field.x, field.z, field.r, field.ms, field.field], [1, 2, 6, 8000, true], 'the Star Field, for all its eight seconds');
  assert.equal(starZone({ kind: 'place', obj: 5, skill: 'star_field', x: 1, z: 2, r: 6, seconds: 12, element: 'arcane' }).ms, 12000, 'and all twelve at five Starlight');
  assert.equal(starZone({ kind: 'place', obj: 6, skill: 'star_field', x: 1, z: 2, r: 6, seconds: 8, follow: 44 }).follow, 44, 'Drifting Field says whom it rides');
  // a talent's lingering ground names only its caster: the caster's class decides
  const pool = { kind: 'pool', id: 7, pid: 1, x: 3, z: 4, r: 2.5, seconds: 4, element: 'arcane' };
  assert.ok(starZone(pool, 'starcaller')); assert.equal(starZone(pool, 'starcaller').field, false);
  assert.equal(starZone(pool, 'mage'), null, 'a mage\'s arcane pool is the arcane pool it always was');
  assert.equal(starZone(pool, null), null, 'a caster the client cannot see: the generic look, never a guess');
  assert.equal(starZone({ ...pool, element: 'fire' }, 'starcaller'), null);
  assert.equal(starZone({ kind: 'place', obj: 8, skill: 'blessed_earth', x: 0, z: 0, r: 5, seconds: 8, element: 'holy' }), null);
  assert.equal(starZone({ kind: 'pool', id: 7, pid: 1, end: 1 }, 'starcaller'), null, 'an end is not a new zone');
  assert.ok(starOrbs({ kind: 'orbs', id: 7, count: 3, seconds: 12, element: 'arcane' }, 'starcaller'));
  assert.equal(starOrbs({ kind: 'orbs', id: 7, count: 3, seconds: 12, element: 'arcane' }, 'enchanter'), null);
});

test('Y32: Constellation motes follow the Starlight count; a fall is a spend', () => {
  assert.equal(moteCount([{ id: 'starlight', n: 3, max: 5 }]), 3);
  assert.equal(moteCount({ id: 'starlight', n: 9, max: 5 }), 5, 'never more than five');
  assert.equal(moteCount([{ id: 'flair', n: 4, max: 5 }]), 0, 'another calling\'s resource draws no stars');
  assert.equal(moteCount(null), 0);
  assert.equal(moteSpent(5, 0), 5); assert.equal(moteSpent(2, 3), 0); assert.equal(moteSpent(0, 0), 0);
  // play-test 12 (#89, "it looks like we are stunned"): five still seats in an arc BEHIND the body — not a ring wheeling
  // round the head. The angle is measured from straight behind; it never moves with time, and the arc stays at the back.
  const seats = [0, 1, 2, 3, 4].map(i => moteSeat(i, 0).a);
  for (let i = 1; i < 5; i++) assert.ok(seats[i] > seats[i - 1], 'seats run across the back in order');
  assert.ok(Math.abs(seats[0] + seats[4]) < 1e-9 && Math.abs(seats[2]) < 1e-9, 'the arc is centred behind the body');
  assert.ok(Math.max(...seats.map(Math.abs)) < Math.PI / 2, 'every seat is behind the shoulders, none in front of the face');
  for (const t of [0.5, 3, 17]) for (const full of [false, true]) assert.deepEqual([0, 1, 2, 3, 4].map(i => moteSeat(i, t, full).a), seats, 'they never wheel round');
});

test('Y32: the Starcaller has an outfit of its own, and the shared tables are as they were', () => {
  const o = OUT.classes.starcaller, t2 = OUT.tier2.starcaller, wear = OUT.wear.starcaller;
  assert.equal(CLS.outfit, 'starcaller');
  assert.ok(o && t2 && wear?.cloth);
  // every part id is one the shared normaliser keeps
  const known = (slot, id) => id === 'none' || partIds(slot).includes(id);
  for (const [name, set] of [['tier 1', o], ['tier 2', t2], ['worn cloth', wear.cloth]]) for (const slot of OUTFIT_SLOTS) if (set[slot]) assert.ok(known(slot, set[slot].id), `${name}: ${slot} "${set[slot].id}" is a known part`);
  // midnight cloth, gold trim, a star on the headpiece and the chest
  for (const set of [o, t2, wear.cloth]) {
    assert.equal(set.top.color, '#1c1f4a'); assert.equal(set.top.color2, '#e6c14a');
    assert.equal(set.hat.emblem, 'star'); assert.equal(set.top.emblem, 'star');
    assert.ok(['wizard', 'circlet', 'hood'].includes(set.hat.id));
  }
  assert.ok(/robe/.test(o.top.id) && /robe/.test(t2.top.id), 'a cloth caster\'s silhouette');
  // dressed for the title preview
  const dressed = dressAs({ body: {}, top: { id: 'tshirt' }, hat: { id: 'none' } }, o);
  assert.equal(dressed.top.id, 'trim_robe'); assert.equal(dressed.hat.id, 'wizard');
  // the shared files were not touched: no 31st row there (other games' tests count them)
  const T1 = JSON.parse(readFileSync(at('../../avatar-3d/data/class-outfits.json'), 'utf8')).classes, T2 = JSON.parse(readFileSync(at('../../avatar-3d/data/class-outfits-t2.json'), 'utf8')).classes;
  assert.equal('starcaller' in T1, false); assert.equal('starcaller' in T2, false); assert.equal(Object.keys(T2).length, 30);
  // looks.js is where the two are joined
  const looks = src('js/client/looks.js');
  assert.match(looks, /class-outfits-tv\.json/); assert.match(looks, /\.\.\.o, \.\.\.\(tv\.classes/); assert.match(looks, /classWear:/);
});

test('Y32: in the world a Starcaller\'s cloth is midnight and gold; everything else is as it was', () => {
  const items = JSON.parse(readFileSync(at('../emberveil/data/items.json'), 'utf8')), B = { ...items.weaponBases, ...items.armorBases };
  const baseOf = k => B[k] || null, wear = OUT.wear.starcaller;
  const kit = Object.fromEntries(CLS.startingArmour.map(b => [B[b].slot || (b.includes('helm') ? 'head' : 'chest'), { base: b }]));
  assert.ok(kit.chest && kit.head, 'the class starts in a cloth robe and a cloth helm');
  const plain = gearLook(kit, { baseOf }), star = gearLook(kit, { baseOf, classWear: wear });
  assert.equal(plain.top.id, 'robe'); assert.notEqual(plain.top.color, '#1c1f4a', 'another class in the same robe is not midnight');
  assert.equal(star.top.id, 'trim_robe'); assert.equal(star.top.color, '#1c1f4a'); assert.equal(star.top.color2, '#e6c14a'); assert.equal(star.top.emblem, 'star');
  assert.equal(star.hat.id, 'hood', 'the item is a Hood, so it is drawn as one (the pointed hat is the portrait\'s)'); assert.equal(star.hat.color, '#1c1f4a'); assert.equal(star.hat.emblem, 'star');
  // no chest worn = still the plain shirt (the class does not dress a bare body); legs it does not wear stay plain
  assert.equal(gearLook({}, { baseOf, classWear: wear }).top.id, 'tshirt');
  assert.equal(star.bottom.id, plain.bottom.id);
  // a Starcaller who has put on something heavier shows that thing
  const mail = gearLook({ chest: { base: 'medium_chest' }, head: { base: 'heavy_helm' } }, { baseOf, classWear: wear });
  assert.deepEqual(mail.top, gearLook({ chest: { base: 'medium_chest' } }, { baseOf }).top); assert.equal(mail.hat.id, 'war_helm');
  // an item with a model of its own keeps it
  const own = gearLook({ chest: { base: 'cloth_chest', look: { worn: { id: 'tunic', color: '#123456' } } } }, { baseOf, classWear: wear });
  assert.deepEqual(own.top, { id: 'tunic', color: '#123456' });
  // gloves ride on the top and survive the recut
  assert.deepEqual(classWearLook({ top: { id: 'robe', color: '#777', gloves: { id: 'g' } } }, wear, () => 'cloth').top.gloves, { id: 'g' });
  // tier 2 on top of it: the themed trim and the kit arrive, the midnight stays
  const t2 = tier2Dress(star, OUT.tier2.starcaller, { chest: true, head: true });
  assert.equal(t2.top.color, '#1c1f4a'); assert.equal(t2.decor.id, 't2_mantle'); assert.equal(t2.hat.id, 'hood'); assert.equal(t2.hat.emblem, 'star');
});

test('Y32: the hooks are where they must be — the stars see an event before the generic look does', () => {
  const spells = src('js/client/spells.js'), main = src('js/client/main.js'), fx = src('js/client/star-fx.js');
  const onFx = spells.indexOf('function onFx(ev)');
  assert.ok(onFx > 0);
  const hook = spells.indexOf('stars?.onFx(ev, a, starCtx)', onFx), sw = spells.indexOf('switch (ev.kind)', onFx);
  assert.ok(hook > onFx && hook < sw, 'handed to the stars before the switch');
  assert.match(spells, /stars\?\.onCast\(ev, a, starCtx\)/); assert.match(spells, /stars\?\.onImpact\(/);
  assert.match(main, /createSpells\(scene, \{[^}]*\bstars\b/); assert.match(main, /stars\.update\(dt\)/); assert.match(main, /stars\.sample\(\)/, 'compiled in the boot warm-up');
  assert.match(main, /stars\.ownerGone\(ev\.d\)/, 'the dead take their stars with them'); assert.match(main, /stars\.setMotes\(S\.selfId/);
  // the cost rules: two materials, no lights, nothing built per cast
  assert.equal((fx.match(/new THREE\.MeshBasicMaterial/g) || []).length, 2);
  assert.equal(/PointLight|SpotLight|\.clone\(\)\s*;?\s*\/\/ material|material\.clone/.test(fx), false);
  assert.equal(/SphereGeometry|IcosahedronGeometry/.test(fx), false, 'no glowing spheres');
  // names: nothing banned in what a player can read
  const text = (JSON.stringify([OUT.classes, OUT.tier2, OUT.wear]) + JSON.stringify(TV.classes) + Object.values(TV.skills).map(s => s.name).join(' ')).toLowerCase();
  for (const w of ['starfall', 'ember', 'veil', 'muster']) assert.equal(new RegExp(`\\b${w}`).test(text), false, `"${w}" is not used`);
});
