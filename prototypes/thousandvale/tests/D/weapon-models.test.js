// Play-test 4 (round-playtest4.md) — D-world, avatar-3d models:
//   S17 "only swords seen": every weapon / off-hand BASE the loot pool can drop resolves to a Chibi 2 model that really
//       builds geometry in a hand, families do not borrow each other's silhouette, and every id is registered in the
//       shared 2D part catalogue (the normaliser drops ids it has never heard of).
//   S15 a second wand in the off hand is drawn (it fell through to the shield builder and drew nothing).
//   S6  a caster focus (orb, reliquary, effigy, ward, totem) is held UP out of the fist, not laid back along the forearm.
// Run: node --test prototypes/thousandvale/tests/D/weapon-models.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { gearLook, heldLook, offhandLook, HELD_BY_BASE, OFFHAND_BY_BASE } = await import('../../js/client/gear-look.js');
const { buildHeld, buildOffhand, buildGear } = await import('../../../../avatar-3d/js/chibi2-gear.js');
const { buildGear5 } = await import('../../../../avatar-3d/js/chibi2-gear5.js');      // the g5_ models (chibi2.js builds them after chibi2-gear.js)
const { isG5 } = await import('../../../../avatar-3d/js/chibi2-gear5-ids.js');
const { holdFor, HELD_WEAPON_IDS, FARHOLD_WEAPON_INFO } = await import('../../../../avatar-3d/js/chibi2-weapon-ids.js');
const { PARTS } = await import('../../../../avatar-2d/js/parts/index.js');

const read = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url)));
const POOL = read('../../data/rules/loot-pool.json');
const ITEMS = read('../../../emberveil/data/items.json');
const TVG = read('../../data/rules/gear-tv.json');      // Thousandvale's own bases (glaive, bardiche, woodsman's axe…), added in memory by js/rules/tv-gear.js
const BASES = { ...ITEMS.weaponBases, ...ITEMS.armorBases, ...(TVG.bases?.weapon || {}), ...(TVG.bases?.armor || {}) };
const baseOf = k => BASES[k] || null;

/** A recording build context: counts the pieces each bone gets. */
function recorder() {
  const bones = {};
  const c = {
    add(g, bone, color, o = {}) { const b = o.skinTo || bone; bones[b] = (bones[b] || 0) + 1; return g; },
    trim: '#c8a040', leather: '#5a3a1a', steel: '#c8ccd6', W: 1, T: 1, H: 1, A: 1, head: () => {},
  };
  return { c, bones };
}
const handPieces = bones => (bones.handR || 0) + (bones.handL || 0) + (bones.elbowL || 0) + (bones.gripR || 0) + (bones.gripL || 0);
const blankAvatar = () => ({ held: { id: 'none' }, offhand: { id: 'none' }, cape: { id: 'none' }, accessory: { id: 'none' }, decor: { id: 'none' } });

const families = Object.entries(POOL.families).filter(([, f]) => f.group === 'weapon' || f.group === 'offhand');

test('S17: every weapon base the loot pool drops builds a held model, registered in the 2D catalogue', () => {
  for (const [fam, f] of families.filter(([, f]) => f.group === 'weapon')) for (const [key] of f.bases) {
    assert.ok(BASES[key], `${fam}: base ${key} is not in items.json`);
    const h = gearLook({ weapon: { base: key, rarity: 'normal' } }, { baseOf }).held;
    assert.ok(h.id && h.id !== 'none', `${key} draws nothing`);
    assert.ok(PARTS.held[h.id], `${key} -> ${h.id} is not a registered held part (the normaliser would drop it)`);
    const { c, bones } = recorder();
    if (isG5(h.id)) buildGear5({ ...blankAvatar(), held: h }, c); else buildHeld({ ...blankAvatar(), held: h }, c);
    assert.ok(handPieces(bones) >= 2, `${key} -> ${h.id} built ${handPieces(bones)} pieces in a hand`);
  }
});

test('S17: families keep their own silhouette (an axe is never drawn as a sword, a spear never as a javelin…)', () => {
  const owner = new Map();
  for (const [fam, f] of families.filter(([, f]) => f.group === 'weapon')) for (const [key] of f.bases) {
    const id = heldLook({ ...BASES[key], baseKey: key }).id;
    if (owner.has(id) && owner.get(id) !== fam) assert.fail(`${key} (${fam}) draws ${id}, which is ${owner.get(id)}'s model`);
    owner.set(id, fam);
  }
  // and the families the owner named have more than one look between them
  assert.ok(new Set([...owner.keys()]).size >= 16, `only ${owner.size} distinct weapon models in the pool`);
});

test('S17: every shield / focus / quiver base builds an off-hand model', () => {
  const seen = new Set();
  for (const [fam, f] of families.filter(([, f]) => f.group === 'offhand')) for (const [key] of f.bases) {
    // foci (grimoire, seer_orb, reliquary, effigy, psalter) are Farhold's, injected at runtime: not in items.json
    const o = gearLook({ offhand: { base: key, rarity: 'magic' } }, { baseOf }).offhand;
    assert.ok(o.id && o.id !== 'none', `${fam}: ${key} draws nothing in the off hand`);
    assert.ok(PARTS.offhand[o.id], `${key} -> ${o.id} is not a registered off-hand part`);
    const { c, bones } = recorder();
    buildOffhand({ ...blankAvatar(), offhand: o }, c);
    assert.ok(Object.values(bones).reduce((a, b) => a + b, 0) >= 2, `${key} -> ${o.id} built nothing`);
    seen.add(o.id);
  }
  for (const id of ['buckler', 'fh_heater_shield', 'fh_kite_shield', 'fh_tower_shield', 'book', 'orb', 'relic', 'idol', 'tv_ward', 'quiver']) assert.ok(seen.has(id), `no base draws ${id}`);
  for (const id of Object.values(OFFHAND_BY_BASE)) assert.ok(PARTS.offhand[id], `${id} not registered`);
  for (const id of Object.values(HELD_BY_BASE)) assert.ok(PARTS.held[id], `${id} not registered`);
  for (const id of ['tv_scimitar', 'tv_warpick', 'tv_club', 'tv_glaive']) assert.ok(FARHOLD_WEAPON_INFO[id].headY < 0 && FARHOLD_WEAPON_INFO[id].buttY > 0, `${id} breaks the grip rule`);
});

test('S15: a second wand is drawn in the off hand, built on the LEFT hand', () => {
  const look = gearLook({ weapon: { base: 'wand', rarity: 'normal' }, offhand: { base: 'wand', rarity: 'rare' } }, { baseOf });
  assert.equal(look.held.id, 'fh_wand');
  assert.equal(look.offhand.id, 'fh_wand');
  assert.ok(HELD_WEAPON_IDS.includes('fh_wand'));
  const { c, bones } = recorder();
  buildGear({ ...blankAvatar(), held: look.held, offhand: look.offhand, extras: { id: 'none' }, top: { id: 'tshirt' }, bottom: { id: 'shorts' }, shoes: { id: 'wraps' }, hat: { id: 'none' } }, c);
  assert.ok((bones.gripL || 0) >= 3, `off-hand wand built ${bones.gripL || 0} pieces on the left grip`);
  assert.ok((bones.gripR || 0) >= 3);
  assert.equal(holdFor(look).left, 'wand');
});

test('S6: a focus stands up out of the fist — the idle grip turns the item\'s +y to point UP, clear of the forearm', async () => {
  const { createClips } = await import('../../../../avatar-3d/js/chibi2-motion.js');
  for (const id of ['orb', 'relic', 'idol', 'tv_ward', 'tv_totem']) {
    const hold = holdFor({ held: { id: 'fh_wand' }, offhand: { id } });
    assert.equal(hold.left, 'orb', `${id} is not held like a focus`);
    // a minimal rig: the bones the clips animate, hips at a height
    const names = ['root', 'hips', 'chest', 'head', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'gripL', 'gripR', 'legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR'];
    const bones = names.map(name => ({ name }));
    const rig = { bones, byName: { hips: { position: { y: 0.6 } } }, hold, posture: { chest: 0, head: 0, knees: 0 }, round: 0 };
    const [idle] = createClips(rig, ['idle']);
    const q = n => { const t = idle.tracks.find(t => t.name === n + '.quaternion'); return new THREE.Quaternion().fromArray(t.values, 0); };
    // chest-space rotation of the grip: arm * elbow * hand * grip (hips/chest are near identity at idle)
    const chain = q('armL').multiply(q('elbowL')).multiply(q('handL')).multiply(q('gripL'));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(chain);          // the focus's own +y (orb above the cradle)
    const forearm = new THREE.Vector3(0, 1, 0).applyQuaternion(q('armL').multiply(q('elbowL')));   // toward the elbow
    assert.ok(up.y > 0.8, `${id}: the focus points ${up.toArray().map(v => v.toFixed(2))} — not up`);
    assert.ok(up.dot(forearm) < 0.35, `${id}: the focus still lies along the forearm (dot ${up.dot(forearm).toFixed(2)})`);
  }
});
