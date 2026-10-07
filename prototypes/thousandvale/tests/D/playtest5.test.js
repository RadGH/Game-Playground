// Play-test 5 (round-playtest5.md) — D-world, the client's own logic (no browser):
//   T6   the swing clip follows what is in both hands (a pair alternates; the server's `hand:'off'` wins)
//   T14  the client walks INSIDE the attack form's real reach, and a lucky far hit no longer teaches it a longer one
//   T15  every caster attack form C and F name has a look of its own; the drawer draws each one and cleans up after
//   T16  a sceptre's swing is drawn in its element
//   T4   six revives, six looks — while casting and when the body stands
//   T23  every new model in F's gear catalog is drawn in the slot it belongs to; gloves, rings, necklaces and belts show
//   T7   a two-hander in the off hand is drawn there
//   T25  angling: what each phase shows, the line's curve, the rod's shape, and a full cast -> bite -> tug -> catch run
// Run: node --test prototypes/thousandvale/tests/D/playtest5.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { swingClip } = await import('../../js/client/actors.js').catch(() => ({}));
const { approachReach, basicReach, shortenReach, MELEE_REACH } = await import('../../js/client/reach.js');
const { formLook, FORM_FAMILY, isImbuedSwing, createFormFx } = await import('../../js/client/form-fx.js');
const { REVIVE_STYLE, REVIVE_LOOK, reviveStyle, createReviveFx } = await import('../../js/client/revive-fx.js');
const { gearLook, gearKey, g5RowFor, DRAWN_SLOTS, wornLightRange, isTorchItem } = await import('../../js/client/gear-look.js');
const A = await import('../../js/client/angling-view.js');
const { holdFor } = await import('../../../../avatar-3d/js/chibi2-weapon-ids.js');
const { dualAttackFor, dualAttackByCount, ROD_MOUNT } = await import('../../../../avatar-3d/js/chibi2-motion-dual.js');
let catalog = null, ATTACK_FORMS = ['projectile', 'cone', 'area', 'beam', 'fork', 'shield'];
try { const gc = await import('../../../../avatar-3d/js/gear-catalog.js'); catalog = await gc.loadGearCatalog(); ATTACK_FORMS = gc.ATTACK_FORMS || ATTACK_FORMS; } catch { /* F's catalog is not in this tree */ }

const ITEMS = JSON.parse(readFileSync(new URL('../../../emberveil/data/items.json', import.meta.url)));
const BASES = { ...ITEMS.weaponBases, ...ITEMS.armorBases };
const baseOf = k => BASES[k] || null;

// ---------------------------------------------------------------- T6
test('T6: the swing clip follows the hands', { skip: !swingClip && 'actors.js needs a DOM-free import' }, () => {
  const pair = holdFor({ held: { id: 'fh_sword' }, offhand: { id: 'fh_axe' } }), one = holdFor({ held: { id: 'fh_sword' }, offhand: { id: 'none' } });
  const twos = holdFor({ held: { id: 'fh_greatsword' }, offhand: { id: 'fh_greataxe' } }), shield = holdFor({ held: { id: 'fh_mace' }, offhand: { id: 'fh_heater_shield' } });
  assert.equal(swingClip(one, { count: 3 }), 'attack');
  assert.equal(swingClip(shield, { count: 1 }), 'attack');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(n => swingClip(pair, { count: n })), ['dualSlashR', 'dualSlashL', 'dualSlashR', 'dualSlashL', 'dualCross', 'dualSlashR']);
  assert.equal(swingClip(pair, { hand: 'off', count: 0 }), 'dualSlashL', 'the server naming the off hand wins');
  assert.equal(swingClip(pair, { hand: 'main', count: 2, offSeen: true }), 'dualSlashR', 'once the server swings the off hand itself, a main swing is the main hand');
  assert.equal(swingClip(pair, { hand: 'main', count: 2, offSeen: true, mainCount: 2 }), 'dualCross');
  assert.deepEqual([0, 1, 4].map(n => swingClip(twos, { count: n })), ['twinChopR', 'twinChopL', 'twinCrash']);
  assert.equal(swingClip(null), 'attack');
});

// ---------------------------------------------------------------- T14
test('T14: walk inside the form\'s real reach — a 9 m cone is not fired from 30 m', () => {
  for (const r of [5, 9, 16, 18, 24, 26, 30, 34]) { const a = approachReach(r); assert.ok(a < r && a >= r * 0.8 - 0.01 && r - a >= 0.75, `reach ${r}: stop at ${a}`); }
  assert.equal(approachReach(null), MELEE_REACH);
  assert.ok(approachReach(2.6) <= 2.6 && approachReach(2.6) >= 1.6);
  const cone = basicReach({ reach: 9, equipment: { weapon: { subtype: 'wand' } } });
  assert.equal(cone.known, true); assert.ok(cone.reach < 9 && cone.reach > 6, `a cone wand stops at ${cone.reach}`);
  assert.deepEqual(basicReach({ reach: null }), { reach: MELEE_REACH, known: true, raw: null });
  const guess = basicReach({ equipment: { weapon: { subtype: 'wand' } } });
  assert.equal(guess.known, false, 'with no word from the server the client guesses — and only then may learn from hits');
  assert.ok(shortenReach(24, { need: 9 }) < 9, 'a range refusal carries the metres needed');
  assert.ok(shortenReach(8, { need: 30 }) <= 8, 'never longer than before');
  assert.ok(shortenReach(20, { dist: 12 }) < 12);
  // main.js: the reach only grows from a hit when the server never said it
  const src = readFileSync(new URL('../../js/client/main.js', import.meta.url), 'utf8');
  assert.match(src, /!S\.reachKnown[^\n]*S\.reach = Math\.max\(S\.reach/, 'a far hit must not teach a known reach');
  assert.match(src, /r\.why === 'range' && !\(r\.slot > 0\)/, 'a SKILL out of range must not shorten the basic attack');
});

// ---------------------------------------------------------------- T15 / T16
const CAST_STYLES = ['bolt', 'seeking', 'heavy', 'burst', 'fan', 'chain', 'fork', 'cone', 'beam', 'nova', 'lob', 'ward', 'pool'];
const C_FORM_OF = { bolt: 'projectile', seeking: 'projectile', heavy: 'projectile', burst: 'area', fan: 'fork', chain: 'fork', fork: 'fork', cone: 'cone', beam: 'beam', nova: 'area', lob: 'area', ward: 'shield', pool: 'area' };

test('T15: every attack form has a look of its own', () => {
  for (const s of CAST_STYLES) { const L = formLook(s); assert.equal(L.family, C_FORM_OF[s], `${s} is drawn as ${L.family}`); if (s !== 'bolt') assert.ok(L.draw.length >= 1, `${s} draws nothing of its own`); }
  for (const f of ATTACK_FORMS) assert.equal(formLook(f).family, f, `F's form ${f}`);
  // no two castStyles are drawn the same way
  const sig = CAST_STYLES.map(s => formLook(s).draw.join('+') + '|' + formLook(s).family);
  assert.equal(new Set(sig).size, sig.length, `two forms look the same: ${sig}`);
  assert.equal(formLook('something_new').family, 'projectile', 'an unknown form is still drawn');
  for (const k of Object.keys(FORM_FAMILY)) assert.ok(ATTACK_FORMS.includes(FORM_FAMILY[k]), k);
});

function world() {
  const scene = new THREE.Scene(), calls = [];
  const spellFx = new Proxy({}, { get: (_, name) => (...a) => { calls.push(name); } });
  const mk = (id, x, z, o = {}) => ({ id, pos: new THREE.Vector3(x, 0, z), yaw: 0, height: 1.8, hostile: false, dead: false, kind: 'player', speed: 0, ...o });
  const list = new Map([[1, mk(1, 0, 0)], [2, mk(2, 0, 8, { hostile: true, kind: 'monster' })], [3, mk(3, 3, 9, { hostile: true, kind: 'monster' })], [4, mk(4, -3, 10, { hostile: true, kind: 'monster' })], [5, mk(5, 2, 2, { dead: true })]]);
  const actors = { actors: list, get: id => list.get(id), setFishing(id, s) { const a = list.get(id); if (a) a.fishing = s; }, playClip(id, c) { const a = list.get(id); if (a) (a.clips ||= []).push(c); return true; } };
  return { scene, spellFx, calls, actors, list };
}
const run = (obj, seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) obj.update(dt, t * 1000); };

test('T15/T16: the drawer draws each form, the ward dome and the sceptre\'s swing, and puts everything away', async () => {
  const { scene, spellFx, calls, actors } = world();
  const forms = createFormFx(scene, { spellFx, actors, groundY: () => 0 });
  const before = scene.children.length;
  const at = { id: 1, x: 0, z: 0, yaw: 0, el: 'fire' };
  assert.ok(forms.onEvent({ type: 'fx', kind: 'attack', shape: 'beam', form: 'beam', reach: 18, ...at }));
  assert.equal(forms.stats.beams, 1); assert.ok(calls.includes('impact'), 'a beam ends in an impact');
  assert.ok(forms.onEvent({ type: 'fx', kind: 'attack', shape: 'cone', form: 'cone', reach: 9, arc: 1.0, ...at })); assert.equal(forms.stats.fans, 1);
  const rings0 = forms.stats.rings;
  assert.ok(forms.onEvent({ type: 'fx', kind: 'attack', shape: 'nova', form: 'nova', r: 5, ...at })); assert.ok(forms.stats.rings >= rings0 + 2);
  assert.ok(forms.onEvent({ type: 'fx', kind: 'attack', shape: 'lob', form: 'lob', to: { x: 0, z: 12 }, ms: 200, ...at })); assert.equal(forms.stats.arcs, 1); assert.ok(calls.includes('projectile'));
  for (const form of ['burst', 'fork', 'chain', 'fan', 'seeking', 'heavy', 'pool', 'ward', 'bolt']) assert.ok(forms.onEvent({ type: 'fx', kind: 'bolt', basic: 1, form, id: 1, el: 'ice', from: { x: 0, z: 0 }, to: { x: 0, z: 8 }, ms: 120 }), form);
  assert.ok(forms.onEvent({ type: 'fx', kind: 'ward', id: 1, amt: 12 })); assert.equal(forms.stats.domes, 1);
  // a focus's rider on the attack: echo, burst, siphon, ward — each draws
  for (const ev of [{ rider: 'echo' }, { rider: 'burst', x: 0, z: 8, r: 2.5, el: 'fire' }, { rider: 'siphon', amt: 4 }, { rider: 'ward' }]) { const sum = () => forms.stats.rings + forms.stats.forks + forms.stats.domes, n = sum(); assert.ok(forms.onEvent({ type: 'fx', kind: 'rider', id: 1, ...ev })); assert.ok(sum() > n, `rider ${ev.rider} draws`); }
  assert.equal(forms.stats.riders, 4); assert.equal(forms.stats.domes, 2);
  // the sceptre: only an imbued swing, never plain steel
  assert.equal(forms.onEvent({ type: 'fx', kind: 'attack', shape: 'swing', wt: 'sword', el: 'physical', ...at, el: 'physical' }), false);
  assert.equal(isImbuedSwing({ wt: 'scepter', el: 'fire' }), true); assert.equal(isImbuedSwing({ wt: 'scepter', el: 'physical' }), false); assert.equal(isImbuedSwing({ wt: 'mace', el: 'fire', imbue: 1 }), true); assert.equal(isImbuedSwing({ wt: 'sword', el: 'fire' }), false);
  assert.ok(forms.onEvent({ type: 'fx', kind: 'attack', shape: 'swing', wt: 'scepter', imbue: 1, reach: 2.6, arc: 1.6, ...at, el: 'lightning' })); assert.equal(forms.stats.imbued, 1);
  assert.ok(forms.live > 0, 'pieces are on screen');
  assert.equal(scene.children.length, before, 'drawing uses the pools: nothing is added to the scene per effect');
  await new Promise(r => setTimeout(r, 260));          // the bolts land (their rings, splinters and jumps are timed)
  run(forms, 0.2);
  assert.ok(forms.stats.forks >= 3, `fork + chain + fan drew shards (${forms.stats.forks})`);
  run(forms, 3);
  assert.equal(forms.live, 0, 'everything fades and is put away');
  assert.ok(scene.children.every(c => !c.visible), 'no pooled piece is left visible');
  // one material setting for the whole pool (the same as weapon-fx's crescents): no new shader program
  const kinds = new Set(scene.children.map(c => [c.material.type, c.material.blending, c.material.side, c.material.fog, c.material.depthWrite, !!c.material.map].join()));
  assert.equal(kinds.size, 1, [...kinds].join(' / '));
  assert.ok(forms.sample().children.length >= 5);
});

// ---------------------------------------------------------------- T4
test('T4: six revives, six looks — while casting and when the body stands', () => {
  const ids = Object.keys(REVIVE_STYLE);
  assert.deepEqual(ids.sort(), ['call_back_the_spirit', 'green_return', 'oathbound_rise', 'raise_the_fallen', 'second_dawn', 'unquiet_return']);
  assert.equal(new Set(Object.values(REVIVE_STYLE)).size, 6, 'each skill has its own style');
  const lands = Object.values(REVIVE_STYLE).map(s => REVIVE_LOOK[s].land.filter(p => p !== 'ring').join('+'));
  assert.equal(new Set(lands).size, 6, `two revives land the same way: ${lands}`);
  for (const [skill, style] of Object.entries(REVIVE_STYLE)) { assert.equal(reviveStyle({ skill }), style); assert.equal(reviveStyle({ style }), style); assert.equal(reviveStyle({ ab: skill }), style); }
  assert.ok(REVIVE_LOOK[reviveStyle({ skill: 'a_new_one', el: 'nature' })], 'an unknown revive is still drawn');
  assert.ok(REVIVE_LOOK[reviveStyle({})]);

  const { scene, spellFx, calls, actors } = world();
  const forms = createFormFx(scene, { spellFx, actors, groundY: () => 0, pool: 10 });
  const rev = createReviveFx({ forms, spellFx, actors, groundY: () => 0 });
  for (const [skill, style] of Object.entries(REVIVE_STYLE)) {
    const n = forms.live, c = calls.length;
    assert.ok(rev.onEvent({ type: 'fx', kind: 'reviveCast', id: 1, on: skill === 'raise_the_fallen' ? [5] : 5, ab: skill, style, ms: 2000 }));
    assert.ok(forms.live > n || calls.length > c, `${style}: casting draws something`);
    const n2 = forms.live, c2 = calls.length;
    assert.ok(rev.onEvent({ type: 'fx', kind: 'revive', id: 5, by: 1, skill }));
    assert.ok(forms.live > n2 || calls.length > c2, `${style}: the landing draws something`);
    run(forms, 0.1);
  }
  assert.equal(rev.stats.lands, 6); assert.deepEqual(Object.keys(rev.stats.byStyle).sort(), Object.values(REVIVE_STYLE).sort());
  assert.equal(rev.onEvent({ type: 'fx', kind: 'revive', id: 999, by: 1, skill: 'second_dawn' }), true, 'a body that is not on screen is not a crash');
  run(forms, 10);
  assert.equal(forms.live, 0);
});

// ---------------------------------------------------------------- T23 / T7
test('T23: every new catalog model is drawn in its slot; gloves, rings, necklaces and belts show', { skip: !catalog && 'avatar-3d/data/gear-catalog.json is not in this tree' }, () => {
  const SLOT_OF = { weapon: 'weapon', offhand: 'offhand', head: 'head', chest: 'chest', legs: 'legs', hands: 'hands', feet: 'feet', cape: 'back', necklace: 'necklace', ring: 'ring', belt: 'belt', light: 'light' };
  const fresh = catalog.rows.filter(r => r.new && r.gameSlot);
  assert.ok(fresh.length >= 40, `${fresh.length} new rows`);
  for (const row of fresh) {
    const slot = SLOT_OF[row.gameSlot]; assert.ok(slot, `${row.id}: game slot ${row.gameSlot}`);
    for (const item of [{ base: row.base || row.id, rarity: 'rare' }, { baseKey: 'whatever', look: { g5: row.id }, rarity: 'normal' }]) {
      const look = gearLook({ [slot]: item }, { baseOf, catalog });
      const got = row.field ? look[row.slot]?.[row.field]?.id : look[row.slot]?.id;
      assert.equal(got, row.id, `${row.id} worn in ${slot} should be drawn as ${row.slot}${row.field ? '.' + row.field : ''} (got ${got})`);
      assert.ok(look.g5?.includes(row.id));
    }
  }
  // a second ring goes on the other hand; gloves do not replace the shirt they are worn with
  const both = gearLook({ ring: { base: 'x', look: { g5: catalog.find({ gameSlot: 'ring', isNew: true })[0].id } }, ring2: { base: 'x', look: { g5: catalog.find({ gameSlot: 'ring', isNew: true })[0].id } } }, { baseOf, catalog });
  assert.ok(both.accessory.ring?.id && both.accessory.ring2?.id, 'two rings, two hands');
  const chest = catalog.find({ gameSlot: 'chest', archetype: 'plate', isNew: true })[0], gl = catalog.find({ gameSlot: 'hands', archetype: 'plate', isNew: true })[0];
  const set = gearLook({ chest: { base: chest.id }, hands: { base: gl.id } }, { baseOf, catalog });
  assert.equal(set.top.id, chest.id); assert.equal(set.top.gloves.id, gl.id);
  // an OLD pair of gloves (no model of its own before) takes the catalog's model for its weight
  const oldGloves = Object.entries(ITEMS.armorBases).find(([, b]) => b.slot === 'hands');
  if (oldGloves) { const look = gearLook({ hands: { base: oldGloves[0], rarity: 'normal' } }, { baseOf, catalog }); assert.ok(String(look.top?.gloves?.id || '').startsWith('g5_'), `${oldGloves[0]} gloves are drawn (${JSON.stringify(look.top)})`); }
  // …but an old sword keeps the look it has
  assert.equal(gearLook({ weapon: { base: 'longsword', rarity: 'normal' } }, { baseOf, catalog }).held.id, 'fh_longsword');
  assert.equal(g5RowFor({ baseKey: 'longsword' }, 'weapon', catalog), null);
  // without the catalog nothing changes and nothing throws
  assert.equal(gearLook({ hands: { base: 'g5_x' }, weapon: { base: 'longsword' } }, { baseOf }).held.id, 'fh_longsword');
  // the cache key sees every drawn slot
  for (const s of ['hands', 'ring', 'ring2', 'necklace']) assert.notEqual(gearKey({ [s]: { base: 'a' } }), gearKey({ [s]: { base: 'b' } }), s);
  assert.ok(DRAWN_SLOTS.includes('hands') && DRAWN_SLOTS.includes('offhand'));
});

test('T23 (C\'s slots addendum): back, waist and light are worn and drawn; a worn light lights', () => {
  const L = eq => gearLook(eq, { baseOf, catalog });
  assert.equal(L({ back: { base: 'travel_cloak' } }).cape.id, 'travel_cloak', 'a plain cloak');
  assert.equal(L({ waist: { base: 'leather_belt' } }).decor.id, 'belt_pouches', 'a plain belt');
  assert.equal(L({ light: { base: 'hand_lantern' } }).decor.id, 'belt_lantern', 'a plain lantern on the hip');
  assert.equal(L({ light: { base: 'pitch_torch' } }).offhand.id, 'torch', 'a plain torch in the empty off hand');
  const busy = L({ light: { base: 'pitch_torch' }, offhand: { base: 'shield' } });
  assert.equal(busy.offhand.id, 'fh_heater_shield'); assert.equal(busy.decor.id, 'belt_torch', 'the off hand is taken: the torch rides the hip');
  assert.equal(L({ waist: { base: 'leather_belt' }, light: { base: 'hand_lantern' } }).decor.id, 'belt_pouches', 'a belt wins over a lantern');
  if (catalog) {
    assert.equal(L({ back: { base: 'travel_cloak', g5: 'g5_swallowtail' } }).cape.id, 'g5_swallowtail');
    assert.equal(L({ waist: { base: 'leather_belt', g5: 'g5_girdle' } }).decor.id, 'g5_girdle');
    assert.equal(L({ light: { base: 'hand_lantern', g5: 'g5_hexlantern' } }).decor.id, 'g5_hexlantern');
    assert.equal(L({ light: { base: 'pitch_torch', g5: 'g5_cresset' } }).offhand.id, 'g5_cresset');
    assert.equal(L({ light: { base: 'pitch_torch', g5: 'g5_cresset' }, offhand: { base: 'shield' }, weapon: { base: 'longsword' } }).decor.id, 'belt_torch');
    assert.equal(L({ waist: { g5: 'g5_girdle', base: 'x' }, light: { g5: 'g5_hexlantern', base: 'y' } }).decor.id, 'g5_girdle');
  }
  assert.equal(wornLightRange({ light: { base: 'hand_lantern' } }), 16); assert.equal(wornLightRange({ light: { base: 'pitch_torch' } }), 10);
  assert.equal(wornLightRange({ light: { base: 'x', lightRange: 22 } }), 22); assert.equal(wornLightRange({}), 0); assert.equal(wornLightRange(null), 0);
  assert.equal(isTorchItem({ g5: 'g5_cresset' }), true); assert.equal(isTorchItem({ base: 'hand_lantern' }), false);
  for (const s of ['back', 'waist', 'light']) assert.notEqual(gearKey({ [s]: { base: 'a' } }), gearKey({}), s);
  // status-sync turns the pooled torch light on for a worn light
  const src = readFileSync(new URL('../../js/client/status-sync.js', import.meta.url), 'utf8');
  assert.match(src, /wornLightRange\(a\.look\?\.gear \|\| info\?\.gear\)/);
});

test('T7: a two-hander in each hand is drawn in each hand', () => {
  const twoH = Object.entries(ITEMS.weaponBases).filter(([, b]) => b.twoHanded && !/bow/.test(b.subtype || ''));
  assert.ok(twoH.length >= 3);
  for (const [key] of twoH) {
    const look = gearLook({ weapon: { base: key, rarity: 'normal' }, offhand: { base: key, rarity: 'normal' } }, { baseOf, catalog });
    assert.ok(look.held.id !== 'none' && look.offhand.id !== 'none', `${key} x2: held ${look.held.id}, off ${look.offhand.id}`);
    assert.equal(look.offhand.id, look.held.id, `${key}: the off hand shows the same model`);
  }
  const hold = holdFor(gearLook({ weapon: { base: 'greatsword' }, offhand: { base: 'greatsword' } }, { baseOf, catalog }));
  if (BASES.greatsword) { assert.equal(hold.dualTwo, true); assert.equal(dualAttackFor(hold, { hand: 'off' }), 'twinChopL'); assert.equal(dualAttackByCount(hold, 4), 'twinCrash'); }
  if (catalog) { const g = catalog.find({ type: 'sword2h', isNew: true })[0]; if (g) { const look = gearLook({ weapon: { base: g.id }, offhand: { base: g.id } }, { baseOf, catalog }); assert.equal(look.held.id, g.id); assert.equal(look.offhand.id, g.id, 'a new two-hander in the off hand'); } }
});

// ---------------------------------------------------------------- T25
test('T25: what each angling phase shows, the line and the models', () => {
  assert.deepEqual(A.phasePlan('cast'), { phase: 'cast', rod: true, float: true, line: true, taut: false, body: 'wait', clip: 'fishCast', fish: false });
  assert.equal(A.phasePlan('tug').taut, true); assert.equal(A.phasePlan('tug').body, 'tug');
  assert.equal(A.phasePlan('catch').clip, 'fishShow'); assert.equal(A.phasePlan('catch').float, false); assert.equal(A.phasePlan('catch').fish, true);
  assert.equal(A.phasePlan('end').rod, false); assert.equal(A.phasePlan('nonsense').phase, 'end');
  // the line: ends where it should, hangs when slack, straight when taut
  const tip = { x: 0, y: 2, z: 0 }, fl = { x: 0, y: 0, z: 6 };
  const slack = A.linePoints(tip, fl, 1), taut = A.linePoints(tip, fl, 0);
  assert.deepEqual(slack[0], [0, 2, 0]); assert.deepEqual(slack.at(-1).map(n => Math.round(n * 1e6) / 1e6 + 0), [0, 0, 6]);
  assert.ok(slack[6][1] < taut[6][1] - 0.3, 'a slack line hangs below the straight one');
  assert.ok(Math.abs(taut[6][1] - (2 - 2 * 6 / 11)) < 1e-9);
  // pools jump on their own rhythm
  assert.ok(A.jumpPeriod('pool-a') >= 3.5 && A.jumpPeriod('pool-a') <= 7); assert.equal(A.jumpPeriod('pool-a'), A.jumpPeriod('pool-a'));
  // the rod: grip at the origin (the fist), running out along +y to its length
  const box = b => { b.computeBoundingBox(); return b.boundingBox; };
  const rod = box(A.rodGeometry());
  assert.ok(rod.min.y < -0.05 && rod.min.y > -0.2 && Math.abs(rod.max.y - A.ROD_LENGTH) < 0.02, `rod y ${rod.min.y}..${rod.max.y}`);
  assert.ok(rod.max.x < 0.06 && rod.max.z < 0.1, 'a rod is thin');
  assert.equal(ROD_MOUNT.bone, 'handR');
  const fish = box(A.fishGeometry()); assert.ok(fish.max.z - fish.min.z > 0.4 && fish.max.z > 0.2, 'a fish, nose toward +z');
  assert.ok(box(A.floatGeometry()).max.y > 0.15, 'the float has a stem you can see');
});

test('T25: a whole catch, and a pool, run through the view', () => {
  const { scene, spellFx, actors, list } = world();
  const forms = createFormFx(scene, { spellFx, actors, groundY: () => 0 });
  const me = list.get(1), rig = new THREE.Group(), handR = new THREE.Bone(), handL = new THREE.Bone();
  handR.position.set(0.3, 1, 0); handL.position.set(-0.3, 1, 0); rig.add(handR, handL); scene.add(rig); rig.updateMatrixWorld(true);
  me.body = { parts: { handR, handL } }; me.lod = 'full';
  const angling = A.createAngling(scene, { actors, forms, spellFx, waterAt: () => ({ surface: -0.4 }), groundY: () => 0, camera: { position: new THREE.Vector3(0, 5, -5) }, selfId: () => 1 });
  const both = (s, dt = 1 / 30) => { for (let t = 0; t < s; t += dt) { angling.update(dt, t * 1000); forms.update(dt); } };
  assert.ok(angling.onEvent({ type: 'fx', kind: 'fish', id: 1, phase: 'cast', x: 0, z: 6 }));
  const s = angling.lines.get(1);
  assert.deepEqual(me.clips, ['fishCast']); assert.equal(me.fishing, 'wait');
  both(0.3); assert.equal(s.float.visible, false, 'the float has not left the rod yet');
  assert.equal(s.rod.parent, handR, 'the rod is in the main hand');
  both(0.5); assert.ok(s.float.visible && s.float.position.y > -0.4, 'the float is in the air');
  both(0.6); assert.ok(Math.abs(s.float.position.z - 6) < 0.01 && Math.abs(s.float.position.y + 0.4) < 0.06, 'the float rides the water where the server said');
  assert.ok(s.line.visible); const lp = s.line.geometry.attributes.position.array;
  assert.ok(Math.abs(lp[33 + 2] - 6) < 0.05, 'the line ends at the float');
  // the interface's 'wait' after the cast has landed is the wait: the float stays where it is (no second flight)
  angling.onLocal({ state: 'wait' }); assert.equal(s.phase, 'wait'); both(0.1); assert.ok(Math.abs(s.float.position.z - 6) < 0.01 && s.float.visible);
  assert.deepEqual(me.clips, ['fishCast'], 'no second cast');
  angling.onEvent({ type: 'fx', kind: 'fish', id: 1, phase: 'bite', x: 0, z: 6 }); assert.equal(angling.stats.bites, 1);
  both(0.2); assert.ok(s.float.position.y < -0.4, 'a bite pulls the float under');
  angling.onEvent({ type: 'fx', kind: 'fish', id: 1, phase: 'tug', x: 0, z: 6 }); assert.equal(me.fishing, 'tug');
  angling.onLocal({ state: 'tug', tension: 0.9 }); assert.equal(s.tension, 0.9);
  both(0.5); assert.ok(Math.hypot(s.float.position.x, s.float.position.z - 6) > 0.1, 'the float darts about in the tug');
  assert.ok(s.rod.rotation.x < ROD_MOUNT.rotation[0], 'the rod bends back under tension');
  angling.onEvent({ type: 'fx', kind: 'fish', id: 1, phase: 'catch', x: 0, z: 6, rarity: 'rare' });
  assert.deepEqual(me.clips, ['fishCast', 'fishShow']); assert.equal(me.fishing, null);
  both(0.6); assert.equal(s.fish.parent, handL, 'the catch ends up in the off hand'); assert.equal(s.float.visible, false);
  angling.onEvent({ type: 'fx', kind: 'fish', id: 1, phase: 'end' });
  assert.ok(angling.lines.has(1), 'the catch is still held up for a moment after the server says end');
  both(2.2); assert.equal(angling.lines.size, 0); assert.equal(s.rod.parent, null, 'the rod is put away');
  // someone who arrives late sees the float from info.fishing, and loses it when the field goes
  angling.setLine(1, { x: 1, z: 5 }); assert.equal(angling.lines.get(1).phase, 'wait'); both(1.4);
  angling.setLine(1, null); assert.equal(angling.lines.size, 0);
  // losing the fish
  angling.setPhase(1, 'wait', { x: 0, z: 6 }); angling.setPhase(1, 'lost'); both(1); assert.equal(angling.lines.size, 0); assert.equal(angling.stats.lost, 1);
  // walking away drops the line on this screen at once
  angling.setPhase(1, 'wait', { x: 0, z: 6 }); both(0.5); me.speed = 3; both(0.1); assert.equal(angling.lines.size, 0); me.speed = 0;

  // a pool: rings on the water and a fish that jumps clear of it
  angling.setPool('p1', { x: 4, z: 20 }, { tier: 2, left: 5 });
  const p = angling.pools.get('p1'); assert.equal(p.rings.length, 3); assert.equal(p.y, -0.4);
  let top = -9, seen = false; for (let t = 0; t < 12; t += 1 / 30) { angling.update(1 / 30, t * 1000); forms.update(1 / 30); if (p.fish.visible) { seen = true; top = Math.max(top, p.fish.position.y); } }
  assert.ok(seen && top > -0.4 + 1.2, `the fish jumps well clear of the water (top ${top.toFixed(2)})`);
  assert.ok(angling.stats.jumps >= 1 && p.rings.every(m => m.visible) && Math.max(...p.rings.map(m => m.scale.x)) > 1.5, 'rings spread wide enough to see from the road');
  angling.setPool('p1', null, { tier: 2, left: 0 }); assert.equal(angling.pools.size, 0, 'a fished-out pool goes');
  angling.setPool('far', { x: 900, z: 900 }, { tier: 1 }); angling.update(0.03, 0); assert.ok(angling.pools.get('far').rings.every(m => !m.visible), 'a pool 1 km off is not drawn');
  angling.removePool('far');
  assert.ok(angling.sample().children.length >= 5);
  angling.dispose();
});
