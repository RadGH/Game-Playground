// Play-test 8 (owner feedback 8) — D-world. Pure parts of: W2/W14 projectiles, W20 run by default, W22 the light everyone
// carries (and no light items drawn), W12 quest marks, W5 ox carts, W19 backpacks, W25 the icon is the worn model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);   // quest-marks.js / carts-view.js import three
const { PARTS } = await import('../../../../avatar-2d/js/parts/index.js');

const R = p => new URL('../../' + p, import.meta.url);
const src = p => readFileSync(R(p), 'utf8');
const json = p => JSON.parse(src(p));

const { projectileKind, flightMs, arcHeight, MODELS, SHOT_COLOUR } = await import('../../js/client/projectile-kinds.js');
const { wantsRun, WALK_BELOW } = await import('../../js/client/controls.js');
const { carriedLight, CARRY_LIGHT, DUNGEON_AMBIENT } = await import('../../js/client/daynight.js');
const { applyMarks, markOf, markSize, MARKS, MARK_LOOK } = await import('../../js/client/quest-marks.js');
const GL = await import('../../js/client/gear-look.js');
const { ACTIONS, ACTION_BY_ID, auditBindings, WHEEL_ACTIONS } = await import('../../js/client/input/bindings.js');

// ---------------------------------------------------------------- W2 / W14
test('W2/W14: every shot the rules can send picks a body — a brigand archer looses an ARROW, Firebolt is a firebolt', () => {
  const K = (ev, held) => projectileKind(ev, { held }).model;
  // C's event, with `proj`
  assert.equal(K({ kind: 'bolt', element: 'fire', proj: 'firebolt', skill: 'firebolt' }), 'firebolt');
  assert.equal(K({ kind: 'bolt', element: 'fire', proj: 'orb' }), 'firebolt', 'a fire orb is a firebolt');
  assert.equal(K({ kind: 'arrow', element: 'physical', proj: 'arrow', wt: 'bow' }), 'arrow');
  assert.equal(K({ kind: 'arrow', element: 'physical', proj: 'quarrel', wt: 'crossbow' }), 'quarrel');
  assert.equal(K({ kind: 'arrow', proj: 'javelin' }), 'javelin');
  assert.equal(K({ kind: 'bolt', proj: 'knife' }), 'knife'); assert.equal(K({ kind: 'bolt', proj: 'axe' }), 'axe'); assert.equal(K({ kind: 'shot', proj: 'stone' }), 'stone');
  assert.equal(K({ kind: 'bolt', element: 'ice', proj: 'shard' }), 'shard');
  // a monster's physical shot carries no `proj`: what it holds decides
  assert.equal(K({ kind: 'shot', element: 'physical' }, 'bow'), 'arrow', 'brigand archer');
  assert.equal(K({ kind: 'shot', element: 'physical' }, 'crossbow'), 'quarrel');
  assert.equal(K({ kind: 'shot', element: 'physical' }, 'g5_recurve_bow'), 'arrow');
  assert.equal(K({ kind: 'shot', element: 'physical' }, null), 'stone', 'empty hands throw a rock');
  assert.equal(K({ kind: 'shot', element: 'shadow' }, 'staff_skull'), 'orb', 'a caster monster: its element flies');
  assert.equal(K({ kind: 'shot', element: 'fire' }), 'firebolt');
  assert.equal(K({ kind: 'shot', element: 'lightning' }), 'spark');
  // a player's basics as they were always sent
  assert.equal(K({ kind: 'arrow', basic: 1, wk: 'arrow', wt: 'crossbow', el: 'physical' }), 'quarrel');
  assert.equal(K({ kind: 'arrow', basic: 1, wk: 'arrow', wt: 'javelin', el: 'physical' }), 'javelin');
  assert.equal(K({ kind: 'bolt', basic: 1, wk: 'bolt', wt: 'wand', el: 'fire' }), 'firebolt');
  assert.equal(K({ kind: 'bolt', basic: 1, wk: 'bolt', wt: 'wand', el: 'physical' }), 'orb', 'a plain wand still throws light, not a stick');
  assert.equal(K({ kind: 'thrown', wt: 'axe' }), 'axe'); assert.equal(K({ kind: 'thrown' }), 'knife');
  // every element of a bolt has a glowing body and a colour; nothing ever comes back null
  for (const el of ['fire', 'ice', 'cold', 'shadow', 'void', 'holy', 'nature', 'arcane', 'lightning', 'poison', 'bleed', 'true', 'physical', 'nonsense', undefined]) for (const kind of ['bolt', 'arrow', 'shot', 'thrown', undefined]) {
    const k = projectileKind({ kind, element: el });
    assert.ok(MODELS.includes(k.model), `${kind}/${el} -> ${k.model}`);
    if (k.glow) assert.ok(SHOT_COLOUR[k.element], `${k.element} has a colour`);
  }
  assert.equal(projectileKind({ kind: 'bolt', element: 'fire' }).glow, true); assert.equal(projectileKind({ kind: 'arrow' }).glow, false);
  assert.ok(projectileKind({ kind: 'thrown' }).spin > 0, 'a knife tumbles'); assert.equal(projectileKind({ kind: 'arrow' }).spin, 0);
});

test('W2/W14: the flight is the rules\' own time, never too short to see; a lob lands where a straight shot does', () => {
  assert.equal(flightMs({ ms: 400 }, 8), 400);
  assert.equal(flightMs({ ms: 40 }, 1), 120, 'never a single frame');
  assert.equal(Math.round(flightMs({ speed: 20 }, 10)), 500);
  assert.ok(flightMs({}, 2, 'arrow') >= 180);
  assert.equal(arcHeight(0, 20, 0.05), 0); assert.equal(arcHeight(1, 20, 0.05), 0); assert.ok(arcHeight(0.5, 20, 0.05) > 0.5);
  assert.equal(arcHeight(0.5, 20, 0), 0, 'magic flies flat');
});

test('W2/W14: the drawing is pooled, has two materials, no lights, and is warmed at boot', () => {
  const p = src('js/client/projectiles.js'), m = src('js/client/main.js');
  assert.equal((p.match(/new THREE\.Mesh(Basic|Lambert|Standard|Phong)Material\(/g) || []).length, 2, 'one solid, one glowing');
  assert.ok(!/PointLight|SpotLight/.test(p.replace(/\/\/.*$/gm, '')), 'no light is made for a firebolt');
  assert.match(m, /extras: \[shots\.sample\(\)/, 'the two materials are compiled in the boot warm-up');
  assert.match(m, /createSpells\(scene, \{[^}]*shots/); assert.match(m, /createWeaponFx\(scene, \{ shots/);
  assert.match(src('js/client/spells.js'), /case 'bolt': case 'arrow': case 'shot': case 'thrown':/);
  assert.match(p, /getObjectByName\?\.\('gripR'\)/, 'a shot leaves the hand');
});

// ---------------------------------------------------------------- W20
test('W20: you run by default; Shift, a part-way stick or the walk flag walks', () => {
  assert.equal(wantsRun({}), true, 'keys alone: run');
  assert.equal(wantsRun({ shift: true }), false, 'Shift walks');
  assert.equal(wantsRun({ analog: { mx: 0, mz: 1 }, stickLen: 1 }), true, 'a full push runs');
  assert.equal(wantsRun({ analog: { mx: 0, mz: 0.4 }, stickLen: 0.4 }), false, 'a part-way push walks');
  assert.equal(wantsRun({ analog: { mx: 0, mz: WALK_BELOW }, stickLen: WALK_BELOW }), true);
  assert.equal(wantsRun({ analog: { walk: true }, stickLen: 1 }), false); assert.equal(wantsRun({ analog: { walk: false }, stickLen: 0.3 }), true, 'the phone stick says so itself');
  assert.equal(wantsRun({ analog: { sprint: true }, stickLen: 0.2 }), true, 'the older stick record still works');
  assert.equal(wantsRun({ shift: true, analog: { sprint: true } }), false, 'Shift always wins');
});
test('W20: the binding table has Walk (Shift, held) and Auto-run (Num Lock), no Sprint, and stays sound', () => {
  assert.equal(ACTION_BY_ID.sprint, undefined);
  assert.equal(ACTION_BY_ID.walk.key, 'ShiftLeft'); assert.equal(ACTION_BY_ID.walk.hold, true);
  assert.equal(ACTION_BY_ID.autorun.key, 'NumLock'); assert.ok(ACTION_BY_ID.autorun.pad && ACTION_BY_ID.autorun.touch);
  assert.ok(WHEEL_ACTIONS.some(w => w.id === 'autorun'), 'a phone reaches auto-run from the quick wheel');
  assert.deepEqual(auditBindings(), []);
  const c = src('js/client/controls.js');
  assert.match(c, /k === 'NumLock'/); assert.match(c, /wantsRun\(\{ shift:/);
  assert.match(src('js/client/input/touch.js'), /sprint = f >= 0\.6/);
});

// ---------------------------------------------------------------- W22
test('W22: everyone carries the same wide light — off by day, up through dusk, always underground; the rules\' radius wins when wider', () => {
  const rules = json('data/rules/progression.json').light || {};
  assert.equal(CARRY_LIGHT.outdoor, rules.radius ?? 22, 'our default is the rules\' radius');
  assert.equal(CARRY_LIGHT.dungeon, rules.dungeonRadius ?? 28);
  assert.equal(carriedLight({ mood: 'outdoor', night: 0 }).intensity, 0, 'noon: dimmed to nothing (never hidden)');
  assert.ok(carriedLight({ mood: 'outdoor', night: 1 }).intensity > 8);
  assert.ok(carriedLight({ mood: 'outdoor', night: 0.5 }).intensity > 0 && carriedLight({ mood: 'outdoor', night: 0.5 }).intensity < carriedLight({ mood: 'outdoor', night: 1 }).intensity);
  assert.equal(carriedLight({ mood: 'outdoor', night: 1 }).distance, 22);
  assert.equal(carriedLight({ mood: 'outdoor', night: 1, range: 30 }).distance, 30);
  assert.equal(carriedLight({ mood: 'outdoor', night: 1, range: 5 }).distance, 22, 'never narrower than the default');
  const d = carriedLight({ mood: 'dungeon', night: 0 });
  assert.ok(d.intensity >= 12 && d.distance >= 28, 'a dungeon is lit round you whatever the hour');
  assert.equal(carriedLight({ mood: 'dungeon', dungeonRange: 40 }).distance, 40);
  // the old lantern was 13 m at intensity 9 with fog closing at 48 m and a hemisphere of 1.35
  assert.ok(DUNGEON_AMBIENT.hemi > 1.35 && DUNGEON_AMBIENT.fogFar > 48 && DUNGEON_AMBIENT.fogNear > 10 && DUNGEON_AMBIENT.floorGlow > 0);
});
test('W22: no worn or carried light is drawn any more, and no dead pool is left behind', () => {
  const L = eq => GL.gearLook(eq, {});
  for (const light of [{ base: 'hand_lantern' }, { base: 'pitch_torch' }, { base: 'x', g5: 'g5_cresset' }, { base: 'x', g5: 'g5_hexlantern' }]) {
    const look = L({ light, weapon: { base: 'longsword' } });
    assert.equal(look.offhand.id, 'none'); assert.equal(look.decor.id, 'none');
  }
  assert.ok(!GL.DRAWN_SLOTS.includes('light'));
  for (const f of ['js/client/status-sync.js', 'js/client/gear-look.js', 'js/client/actors.js']) {
    const s = src(f).replace(/\/\/.*$/gm, '');
    assert.ok(!/torchLight|wornLightRange|isTorchItem|belt_lantern|belt_torch|TORCH_RANGE/.test(s), f + ' still has a light path');
  }
  assert.ok(!/LIGHTS/.test(src('js/client/status-sync.js').replace(/\/\/.*$/gm, '')), 'status-sync takes nothing from the light pool');
  const sc = src('js/client/scene.js');
  assert.equal((sc.match(/new THREE\.PointLight/g) || []).length, 1, 'ONE carried light, always in the scene (no recompiles)');
  assert.ok(!/lantern\.visible\s*=/.test(sc), 'dimmed, never hidden');
});

// ---------------------------------------------------------------- W12
test('W12: quest marks — A\'s message keeps a per-player map; gold ! / gold ? / grey; readable at 40 m', () => {
  let m = applyMarks(new Map(), { full: true, marks: { 11: 'offer', 12: 'turnin', 13: 'later', 14: 'active', 15: 'job' } });
  assert.deepEqual([...m], [[11, 'offer'], [12, 'turnin'], [13, 'later'], [14, 'active'], [15, 'job']]);
  m = applyMarks(m, { marks: { 11: null, 12: 'active', 16: 'offer' } });
  assert.equal(m.has(11), false); assert.equal(m.get(12), 'active'); assert.equal(m.get(16), 'offer'); assert.equal(m.get(13), 'later', 'a patch leaves the rest');
  m = applyMarks(m, { full: true, marks: { 20: 'turnin' } });
  assert.deepEqual([...m], [[20, 'turnin']], 'a full map replaces the room\'s');
  assert.equal(markOf('ready'), 'turnin'); assert.equal(markOf('!'), 'offer'); assert.equal(markOf('?'), 'turnin'); assert.equal(markOf('nonsense'), null);
  assert.deepEqual(applyMarks(new Map(), { id: 7, mark: 'offer' }).get(7), 'offer', 'the single-patch form');
  assert.equal(MARK_LOOK.offer.glyph, '!'); assert.equal(MARK_LOOK.turnin.glyph, '?'); assert.equal(MARK_LOOK.offer.fill, MARK_LOOK.turnin.fill, 'both gold');
  assert.equal(MARK_LOOK.later.glyph, '!'); assert.equal(MARK_LOOK.active.glyph, '?'); assert.equal(MARK_LOOK.later.fill, MARK_LOOK.active.fill, 'both grey');
  assert.notEqual(MARK_LOOK.offer.fill, MARK_LOOK.later.fill);
  for (const k of MARKS) assert.ok(MARK_LOOK[k].label);
  // readable at 40 m: at a 60-degree view 1000 px tall, a glyph h metres high at d metres is about h / d * 866 px
  const px = d => markSize(d) / d * 866;
  assert.ok(px(40) >= 40, `40 m: ${px(40).toFixed(0)} px`); assert.ok(px(5) <= 110, 'not a billboard up close');
  assert.ok(markSize(3) >= 0.5 && markSize(200) <= 2.4);
  const main = src('js/client/main.js');
  assert.match(main, /net\.on\('questMarks', m => questMarks\.onMessage\(m\)\)/); assert.match(main, /questMarks\.update\(dt\)/);
});

// ---------------------------------------------------------------- W26
test('W26: calling a mount holds you still from the key press; a second press cancels; what you asked for is kept', () => {
  const main = src('js/client/main.js'), c = src('js/client/controls.js');
  assert.match(main, /controls\.hold\(true\);\s*\n\s*S\.net\.mount\('summon'\)/, 'held BEFORE the request goes out');
  assert.match(main, /S\.mountCall && !S\.self\.mount\) \{ endMountCall\(\); S\.net\.mount\('cancel'\)/);
  assert.match(main, /if \('mount' in patch\) \{ endMountCall\(\)/, 'riding lets movement through again');
  assert.match(main, /if \(!r\.ok\) endMountCall\(\)/);
  // the hold returns no movement and clears NOTHING (keys, goal, chase, auto-run survive it)
  const held = c.slice(c.indexOf('if (held) {'), c.indexOf('let fx = 0, fz = 0;'));
  assert.match(held, /mx: 0, mz: 0/); assert.ok(!/moveGoal = null|chase = null|keys\.clear|autorun = false/.test(held));
});

// ---------------------------------------------------------------- W5
test('W5: ox carts — a roaming cart trails its carter, a ride eases away along the road, yaw is the game\'s', async () => {
  const { cartBehind, rideAt, headingTo, RIDE, LEAD, OX, CART_SPEC } = await import('../../js/client/carts-view.js').catch(async () => {
    // carts-view imports three through avatar-3d: read the pure helpers out of the source instead when three is not resolvable in node
    const s = src('js/client/carts-view.js');
    const body = s.slice(s.indexOf('/** The ox:'), s.indexOf('export function createCarts')).replace(/export /g, '');
    return new Function(body + '; return { cartBehind, rideAt, headingTo, RIDE, LEAD, OX, CART_SPEC };')();
  });
  assert.equal(CART_SPEC.type, 'ox_cart'); assert.equal(OX.type, 'cow'); assert.equal(OX.features.udder, false, 'an ox, not a dairy cow');
  const b = cartBehind(100, 100, 0);                       // carter faces +z
  assert.ok(Math.abs(b.z - (100 - LEAD.back)) < 1e-9 && Math.abs(b.x - (100 + LEAD.side)) < 1e-9);
  const e = cartBehind(100, 100, Math.PI / 2);             // faces +x
  assert.ok(Math.abs(e.x - (100 - LEAD.back)) < 1e-9);
  assert.equal(rideAt({ x: 0, z: 0 }, 0, 0).d, 0);
  const one = rideAt({ x: 0, z: 0 }, 0, 1), four = rideAt({ x: 0, z: 0 }, 0, 4);
  assert.ok(one.d > 0 && one.d < RIDE.speed, 'it eases off'); assert.ok(four.z > 6 && Math.abs(four.x) < 1e-9, 'then rolls at pace along its heading');
  assert.ok(Math.abs(headingTo({ x: 0, z: 0 }, { x: 10, z: 0 }) - Math.PI / 2) < 1e-9); assert.equal(headingTo({ x: 0, z: 0 }, null, 1.25), 1.25);
  const main = src('js/client/main.js');
  assert.match(main, /info\.type === 'cart' \|\| info\.vehicle\) carts\.setParked/); assert.match(main, /info\.vehicle\) carts\.setRoaming/);
  assert.match(main, /net\.on\('cartRide'/); assert.match(main, /carts\.prewarm\(\)/, 'one is built and compiled at boot');
  assert.match(src('js/client/objects.js'), /cart:\s+\{ prop: null/);
  // E's data: every parked cart row is something this draws
  const carts = json('data/provinces/carts.json');
  assert.ok((carts.stops || []).length >= 3, 'E placed carts');
  for (const s of carts.stops) assert.ok(s.cart && Number.isFinite(s.cart.x) && Number.isFinite(s.cart.z), s.id);
});

// ---------------------------------------------------------------- W19
test('W19: a backpack is drawn on the back in place of a cloak — C\'s three bases, the rare one, and its own colours', () => {
  const tv = json('data/rules/gear-tv.json');
  const packs = Object.entries(tv.bases.armor).filter(([, b]) => b.pack);
  assert.ok(packs.length >= 3);
  const baseOf = k => tv.bases.armor[k] || null;
  const seen = new Set();
  for (const [key, b] of packs) {
    const look = GL.gearLook({ back: { base: key, rarity: 'normal' } }, { baseOf });
    assert.equal(look.cape.id, b.packLook, `${key} draws ${b.packLook}`); seen.add(look.cape.id);
    assert.equal(GL.gearLook({ back: { base: key, rarity: 'normal', pack: true, g5: b.packLook } }, {}).cape.id, b.packLook, 'the compact info.gear form');
    assert.equal(GL.gearLook({ back: { base: key, rarity: 'rare', g5: tv.packs.rareLook } }, { baseOf }).cape.id, 'g5_pack_explorer', 'a rare pack is the explorer\'s');
    assert.notEqual(GL.gearKey({ back: { base: key } }), GL.gearKey({ back: { base: 'travel_cloak' } }));
  }
  assert.equal(seen.size, packs.length, 'each size has its own model');
  assert.equal(GL.gearLook({ back: { base: 'travel_cloak' } }, { baseOf }).cape.id, 'travel_cloak', 'a cloak is still a cloak');
  assert.equal(GL.packLookId({ base: 'travel_cloak' }), null); assert.equal(GL.packLookId({ base: 'some_knapsack' }), 'g5_pack_rucksack');
  const p = GL.packPart({ base: 'sling_satchel', rarity: 'magic' }), q = GL.packPart({ base: 'sling_satchel', rarity: 'normal' });
  assert.equal(p.color, q.color, 'the bag keeps its colour'); assert.notEqual(p.color2, q.color2, 'the trim takes the rarity');
  // the models exist: ids in the table, builders in the new file, rows in the catalog
  const ids = src('../../avatar-3d/js/chibi2-gear5-ids.js'), file = src('../../avatar-3d/js/chibi2-backpacks.js');
  const cat = json('../../avatar-3d/data/gear-catalog.json');
  for (const id of ['g5_pack_satchel', 'g5_pack_rucksack', 'g5_pack_frame', 'g5_pack_explorer']) {
    assert.ok(ids.includes(id + ':')); assert.ok(file.includes(id + '(a, c, part)'));
    const row = cat.rows.find(r => r.id === id); assert.ok(row, id + ' is in the gear catalog'); assert.equal(row.slot, 'cape'); assert.equal(row.type, 'pack');
    assert.ok(row.items.some(i => i.game === 'thousandvale' && i.slot === 'back'), id + ' is worn by a game item');
  }
});

// ---------------------------------------------------------------- W25
test('W25: ONE function decides the worn model and the icon — over every item base, and the War Helm is a war helm', () => {
  const items = json('../emberveil/data/items.json'), tv = json('data/rules/gear-tv.json');
  const bases = { ...items.weaponBases, ...items.armorBases, ...(tv.bases.weapon || {}), ...(tv.bases.armor || {}) };
  const baseOf = k => bases[k] || null, opts = { baseOf };
  const SLOT = b => (b.slot === 'ring2' ? 'ring' : b.slot) || (b.type === 'weapon' ? 'weapon' : null);
  let n = 0;
  for (const [key, b] of Object.entries(bases)) {
    const slot = SLOT(b); if (!slot || !GL.PART_OF_SLOT[slot]) continue;
    for (const rarity of ['normal', 'rare', 'legendary']) {
      const item = { base: key, rarity };
      const alone = GL.wornLook(item, slot, opts), part = GL.wornPart(item, slot, opts);
      // the icon's function IS the body's function…
      assert.deepEqual(alone, GL.gearLook({ [slot]: item }, opts), key);
      // …and what it says the item is, is what a body wearing a whole set shows in that slot
      const full = GL.gearLook({ head: { base: 'cloth_helm' }, chest: { base: 'cloth_chest' }, legs: { base: 'cloth_legs' }, feet: { base: 'light_boots' }, [slot]: item }, opts);
      if (part.partSlot && part.part && !['hands', 'gloves', 'ring', 'ring2'].includes(slot)) assert.deepEqual(full[part.partSlot], alone[part.partSlot], `${key} (${slot}) looks the same alone and in a set`);
      assert.equal(GL.wornKey(item, slot, opts), GL.wornKey({ ...item }, slot, opts), 'a stable key');
      n++;
    }
  }
  assert.ok(n > 150, `${n} base x rarity pictures checked`);
  // the report: "War Helm" = heavy_helm
  const helm = GL.wornPart({ base: 'heavy_helm', rarity: 'rare', name: 'War Helm' }, 'head', opts);
  assert.equal(helm.partSlot, 'hat'); assert.equal(helm.part.id, 'war_helm', 'not the horned dome, not the plumed knight helm');
  assert.equal(GL.wornPart({ base: 'plate_helm' }, 'head', opts).part.id, 'plate_helm');
  assert.equal(GL.wornPart({ base: 'light_helm' }, 'head', opts).part.id, 'leather_cap');
  assert.equal(GL.wornPart({ base: 'medium_helm' }, 'head', opts).part.id, 'chain_coif');
  // every by-name model is one avatar-3d really builds (the shared normaliser knows the id)
  for (const [base, id] of Object.entries(GL.ARMOUR_BY_BASE)) { assert.ok(bases[base], base + ' is a real base'); const slot = { head: 'hat', chest: 'top' }[bases[base].slot]; assert.ok(PARTS[slot]?.[id], `${id} is a registered ${slot} part (the shared normaliser keeps it)`); }
  // a chest piece's picture is the chest piece (the plain trousers a body adds are not part of it)
  assert.deepEqual(Object.keys(GL.wornPart({ base: 'heavy_chest' }, 'chest', opts).parts), ['top']);
  // D-UI's icons call it, with the options the bodies are dressed with
  assert.match(src('js/client/ui/item-icons.js'), /wornPart\(item, slot, gearOpts\(/);
  assert.match(src('js/client/looks.js'), /gearLook\(look\.gear, gearOpts\(cls\)\)/, 'bodies and icons share one set of options');
});
