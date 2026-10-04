// node --test prototypes/bannerline/tests/art-looks.test.js   (stream C)
//
// Every unit and hero resolves to a body (data/looks.json + units.json), the creature units get their
// designed Bannerline look, the creature bodies build in node, the body factory honours the actors.js
// contract, and the baked icon set is not stale (every unit, hero and skill has a PNG).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

register('../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const { createLooks, createBodyFactory } = await import('../js/view/unit-looks.js');
const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const data = {
  looks: J('../data/looks.json'), units: J('../data/units.json'), presets: J('../../../avatar-3d/data/chibi2-presets.json'),
  outfits: J('../../../avatar-3d/data/class-outfits.json'), variants: J('../../../avatar-3d/data/creature-variants.json'),
  warbands: J('../../farhold/data/warbands.json'),
};
const looks = createLooks(data);
const RACE_BODY = { freeholds: ['human', 'dwarf', 'halfling'], ashtusk: ['orc'], unburied: ['undead'], thornmane: ['beast'] };

test('every unit resolves to a body of its own race', () => {
  const ids = looks.unitIds();
  assert.equal(ids.length, Object.keys(data.units.units).length);
  for (const id of ids) {
    const L = looks.forUnit(id);
    if (L.kind === 'chibi2') assert.ok(RACE_BODY[L.race].includes(L.avatar.body?.race || 'human'), `${id}: ${L.avatar.body?.race} is not a ${L.race} body`);
    else assert.ok(L.spec.type, id);
  }
});

test('creature units use their designed bl_ look', () => {
  for (const id of looks.unitIds()) {
    const L = looks.forUnit(id);
    if (L.kind === 'creature') assert.ok(L.variant && L.variant.startsWith('bl_'), `${id} has no designed look`);
  }
});

test('Freeholds humans wear the Freeholds blue', () => {
  for (const id of ['levy', 'shieldbearer', 'banner_marshal']) {
    const a = looks.forUnit(id).avatar;
    assert.ok(JSON.stringify(a).toLowerCase().includes('#2f5d9e'), id);
  }
});

test('heroes resolve and carry a weapon', () => {
  const heroes = J('../data/heroes.json').heroes;
  assert.deepEqual(looks.heroIds().sort(), Object.keys(heroes).sort(), 'every hero in heroes.json has a Chibi 2 look');
  for (const id of looks.heroIds()) {
    const L = looks.forHero(id);
    assert.equal(L.kind, 'chibi2');
    assert.notEqual(L.avatar.held?.id || 'none', 'none', id);
  }
});

test('heroes take the player colour, forms and pets resolve', () => {
  const a = looks.forHero('warrior', { color: '#33c2d6' }).avatar;
  assert.ok(JSON.stringify(a).includes('#33c2d6'));
  assert.notEqual(JSON.stringify(looks.forHero('warrior').avatar), JSON.stringify(a));
  const heroes = J('../data/heroes.json');
  for (const [sid, s] of Object.entries(heroes.skills)) if (s.form) {
    const hero = Object.entries(heroes.heroes).find(([, h]) => Object.values(h.slots || {}).includes(sid))?.[0] || 'druid';
    const f = looks.forForm(hero, s.form.id);
    assert.ok(f && f.kind === 'creature', `no body for form ${s.form.id}`);
  }
  for (const pid of Object.keys(heroes.pets || {})) assert.equal(looks.forPet(pid).kind, 'creature');
});

test('units grow with tier', () => {
  for (const id of looks.unitIds()) { const L = looks.forUnit(id); if (L.kind === 'chibi2') assert.ok(L.scale >= 1 && L.scale <= 1.6, id); }
  assert.ok(looks.forUnit('banner_marshal').scale > looks.forUnit('levy').scale);
});

test('no look, label or id uses the banned word (R2.9)', () => {
  for (const f of ['../data/looks.json', '../data/identity.json', '../data/skill-fx.json', '../assets/icons/catalog.json', '../assets/icons/index.json'])
    assert.ok(!/muster/i.test(readFileSync(new URL(f, import.meta.url), 'utf8')), f);
});

test('every skill and power has an effect recipe or a shape default', () => {
  const fx = J('../data/skill-fx.json'), heroes = J('../data/heroes.json'), powers = J('../data/powers.json');
  const FX = new Set(['cast', 'ring', 'pillar', 'vortex', 'storm', 'heal', 'impact', 'breath', 'footfalls', 'status', 'flare', 'warn']);
  for (const [id, s] of Object.entries(heroes.skills)) assert.ok(fx.skills[id] || fx.default[s.shape], `skill ${id} (${s.shape}) draws nothing`);
  for (const id of Object.keys(powers.powers)) assert.ok(fx.powers[id], `power ${id} draws nothing`);
  const all = [...Object.values(fx.skills).flatMap(r => Object.values(r).filter(Array.isArray).flat()), ...Object.values(fx.default).flat(), ...Object.values(fx.powers).flatMap(r => Object.values(r).flat())];
  for (const r of all) assert.ok(FX.has(r.fx), `unknown fx ${r.fx}`);
});

test('every sound the bridge asks for exists in the sfx catalog', async () => {
  const cat = J('../../../sfx/data/catalog.json'), ids = new Set((cat.sounds || cat).map(s => s.id));
  const S = await import('../js/view/sound.js');
  const want = [...Object.values(S.SOUND_MAP).flat(), ...Object.values(S.HIT_SOUNDS), ...Object.values(S.CAST_SOUNDS), ...Object.values(S.POWER_SOUNDS), ...Object.values(S.STATUS_SOUNDS), ...Object.values(S.UI_SOUNDS)].filter(Boolean);
  for (const id of want) assert.ok(ids.has(id), `sound ${id} not in sfx/data/catalog.json`);
});

test('Engineer turrets grow by level and the mine builds', async () => {
  const { makeTurret, makeMine } = await import('../js/view/engineer.js');
  const h = [1, 2, 3].map(L => makeTurret({ level: L }).height);
  assert.ok(h[0] < h[1] && h[1] < h[2], h.join());
  const t = makeTurret({ level: 3 }); t.aim(1); t.fire(); t.setOvercharge(true); for (let i = 0; i < 10; i++) t.update(0.05);
  assert.ok(Math.abs(t.pivot.rotation.y - 1) < 0.2);
  const m = makeMine({}); m.setArmed(true); m.update(0.2); m.blast(); assert.equal(m.group.visible, false);
});

test('creature bodies build and answer the Chibi 2 clip names', async () => {
  for (const id of looks.unitIds()) {
    const L = looks.forUnit(id); if (L.kind !== 'creature') continue;
    const a = await looks.build(L);
    for (const clip of ['ready', 'walk', 'attack', 'cast', 'hit', 'dead']) { a.setAnim(clip); a.update(0.1, 0.1); }
    assert.ok(a.height > 0.2, id);
    assert.ok(a.stats().meshes <= 4, `${id}: ${a.stats().meshes} meshes, the merge did not run`);
    a.dispose();
  }
});

test('makeBody follows the actors.js contract (sync object + height, play, dispose, form, ghost, turret)', async () => {
  const { makeTurret } = await import('../js/view/engineer.js');
  const f = createBodyFactory(looks, { makeTurret, turretLevelOf: () => 2, fallback: () => ({ object: { tide: true }, height: 0.9, play() {}, dispose() {} }) });
  const tb = f.makeBody({ kind: 'turret', type: 'bolt_turret', id: 9, face: 1 }, {}, {});
  assert.equal(tb.turret.level, 2); tb.play('attack', 0.1); tb.play('idle', 0.2);
  const wolf = f.makeBody({ kind: 'hero', type: 'druid', id: 3 }, {}, {});
  wolf.setForm('wolf'); await new Promise(r => setTimeout(r, 80));
  assert.equal(wolf.actor?.kind, 'creature', 'the druid became a creature in wolf shape');
  wolf.setGhost(true); wolf.setGhost(false); wolf.dispose();
  const b = f.makeBody({ kind: 'unit', type: 'tuskback', id: 1 }, {}, {});
  assert.ok(b.object && b.object.isObject3D); assert.ok(b.height > 0); assert.equal(typeof b.play, 'function');
  await new Promise(r => setTimeout(r, 50));
  b.play('walk', 0.1); b.play('attack', 0.3); b.dispose();
  assert.equal(f.makeBody({ kind: 'tide', type: 'x' }, {}, {}).height, 0.9);
});

test('the baked icon set covers every unit, hero and skill', () => {
  const idx = J('../assets/icons/index.json'), heroes = J('../data/heroes.json');
  const want = { unit: looks.unitIds(), hero: looks.heroIds(), skill: Object.keys(heroes.skills || {}), item: Object.keys(J('../assets/icons/catalog.json').items),
    power: Object.keys(J('../data/powers.json').powers), building: ['freeholds.keep', 'ashtusk.barracks', 'unburied.sanctum', 'thornmane.shop', 'freeholds.drillyard'], gadget: ['turret_1', 'turret_2', 'turret_3', 'mine'] };
  for (const [kind, ids] of Object.entries(want)) for (const id of ids) {
    assert.ok(idx.kinds[kind]?.includes(id), `${kind}/${id} not baked: run tools/bake-icons.mjs`);
    assert.ok(existsSync(new URL(`../assets/icons/${kind}/${id}.png`, import.meta.url)), `${kind}/${id}.png missing`);
  }
});
