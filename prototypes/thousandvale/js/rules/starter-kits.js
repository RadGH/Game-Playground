// Thousandvale — STARTER KITS (play-test 5, T5). Pure.
//
//   "New screen after choosing + customizing a character: choose starting equipment. 3 armour sets
//    representing the class (budget only — no high-end plate) and several weapon PACKS for the class
//    (sword+shield, dual swords, two-hander…). Casters pick from a variety of wands, staves and focuses."
//
// The table is data/rules/starter-kits.json (stream C). This module turns a row into REAL items: the same
// `rpg.loot.generate(base, 'normal', 'low')` + `attuneWeapon` js/rules/character.js uses for the old class
// kit, off a seed fixed by (class, kit id, base) — so the item card, the 3D gear look and the sheet all
// read ordinary items, and the same call always returns equal ones.
//
//   setKitSource(engine, json)               engine.js calls this once at boot
//   kitPlan(classId, json?)                  the raw rows (needs no engine)
//   kitsFor(classId, json?, engine?)         { cls, armour: [{id, name, blurb, pieces, items}], weapons: [{id, name, blurb, main, off, items}] }
//   validKit(classId, choice, json?)         { ok, armour, weapons } — unknown / missing ids fall back to the first
//   starterGear(classId, choice, json?, engine?)   { slot: item } ready to be `char.equipment`

import { attuneWeapon, makeRng, hashStr, profileOf } from './farhold.js';

// ------------------------------------------------------------------------------------------------ W23: the measure
// Owner feedback 8: "Starting equipment offers too many similar items — make the choices clearly different."
// What makes two packs play differently is read off the ITEMS (Farhold's own swing profile, the caster style the item
// carries), never off a label in the data:
//   hands    shield | dual | focus | two | staff | wand | ranged | thrown
//   family   the first move of the swing pattern (slash, thrust, overhead, cleave, jab, sweep; `pole` for a quarterstaff's jab-and-sweep), a bow / crossbow /
//            javelin, a caster's style (bolt, burst, cone, nova, lob, chain …), `imbue` for a sceptre's elemental swing
//   reach    melee: short (< 2.7 m) | mid (< 3.6) | long (< 4.5) | pole; casters: self | near | midrange | far;
//            a bow or crossbow: far; a thrown weapon: midrange
//   element  physical, or what a caster weapon is attuned to
//   tempo    quick (a swing every 0.6 s or less) | steady (0.9 or less) | slow
// Two packs are NEAR-DUPLICATES when they differ on fewer than two of the five; and a class may offer at most two packs
// of one hand shape (three "one-hander and shield" packs read as the same choice three times, whatever the weapon).
export const KIT_AXES = Object.freeze(['hands', 'family', 'reach', 'element', 'tempo']);
export const KIT_MIN_DIFF = 2;
export const KIT_MAX_PER_HANDS = 2;
const CASTER_REACH = { nova: 'self', cone: 'near', wave: 'near', beam: 'midrange', lob: 'midrange' };
const FOCUS_KEYS = ['orb', 'tome', 'grimoire', 'seer_orb', 'reliquary', 'psalter', 'effigy', 'warded_focus', 'spellguard_orb'];

/** The five-axis signature of a pack from its real items (`[main, off?]`). */
export function packSignature(items) {
  const [m, o] = items || [];
  if (!m) return null;
  const p = profileOf(m) || {};
  const caster = m.weaponCategory === 'magic' && (m.subtype === 'wand' || (m.subtype === 'staff' && m.baseKey !== 'quarterstaff'));
  const sceptre = m.subtype === 'scepter';
  const missile = !caster && (m.ranged || p.ranged);
  let hands, family, reach;
  if (caster) {
    hands = m.subtype;
    family = m.castStyle || m.staffSpell || m.wandBehaviour || 'bolt';
    reach = CASTER_REACH[family] || 'far';
  } else if (missile) {
    hands = m.twoHanded ? 'ranged' : 'thrown';
    family = m.subtype === 'bow' ? 'bow' : m.subtype;
    reach = m.twoHanded ? 'far' : 'midrange';
  } else {
    const offKey = o ? (o.baseKey || '') : '';
    hands = m.twoHanded ? 'two' : !o ? 'one' : o.isShield || /shield|buckler/.test(offKey) ? 'shield' : (o.type === 'weapon' && !FOCUS_KEYS.includes(offKey)) ? 'dual' : 'focus';
    const pat = p.pattern || ['slash'];
    family = sceptre ? 'imbue' : (pat[0] === 'jab' && pat.includes('sweep')) ? 'pole' : pat[0];
    reach = p.reach < 2.7 ? 'short' : p.reach < 3.6 ? 'mid' : p.reach < 4.5 ? 'long' : 'pole';
  }
  const every = p.every || 0.7;
  return { hands, family, reach, element: m.castElement || 'physical', tempo: every <= 0.6 ? 'quick' : every <= 0.9 ? 'steady' : 'slow' };
}
/** On how many of the five axes two signatures differ. */
export const kitDistance = (a, b) => KIT_AXES.filter(k => a[k] !== b[k]).length;

const HANDS_WORD = { shield: 'Weapon and shield', dual: 'Two weapons', focus: 'Weapon and focus', two: 'Two-hander', one: 'One-hander', staff: 'Spell staff', wand: 'Wand and focus', ranged: 'Ranged', thrown: 'Thrown' };
const HANDS_TEXT = {
  shield: 'One hand strikes, the other blocks.', dual: 'Both hands strike, and nothing blocks.', focus: 'A weapon in one hand, a focus that feeds your spells in the other.',
  two: 'Both hands on one big weapon.', one: 'One weapon, one empty hand.', staff: 'A two-handed staff: your basic attack is its spell.', wand: 'A wand casts from range; the focus beside it adds to your magic.',
  ranged: 'You fight from a distance with both hands.', thrown: 'You throw from a distance and keep a buckler up.',
};
const FAMILY_TEXT = {
  slash: 'Quick cuts in an arc.', thrust: 'Straight thrusts that run through everything in a line.', overhead: 'Heavy downward blows that crack armour.', cleave: 'Chopping blows that leave bleeding wounds.',
  jab: 'Very fast stabs, strongest from behind.', pole: 'Fast jabs and low sweeps with a pole that keep enemies off you.', sweep: 'Wide sweeps that catch several enemies at once.', imbue: 'Its swings deal elemental damage, up close.',
  bow: 'Hold the draw longer to hit harder.', crossbow: 'Slow to reload; hits hard and passes through bodies.', javelin: 'Fast throws at a shorter range.',
  bolt: 'One bolt at one target.', burst: 'A bolt that bursts on impact and catches those nearby.', fan: 'Three bolts in a fan.', chain: 'A bolt that jumps from enemy to enemy.',
  seeking: 'A bolt that turns after its target.', heavy: 'A slow, heavy bolt.', cone: 'A short cone in front of you.', wave: 'A wave that rolls out in front of you.', beam: 'A straight beam through everything in its line.',
  nova: 'A ring that bursts around you.', lob: 'An arc that lands on a spot and bursts.', fork: 'A bolt that splits on impact.', ward: 'A bolt that also shields you.', pool: 'A bolt that leaves a burning pool.',
  ground: 'It strikes a patch of ground at range.', arc: 'Lightning that leaps between enemies.', shard: 'A shard that pierces at long range.',
};
const REACH_WORD = { short: 'close', mid: 'arm\'s length', long: 'long reach', pole: 'longest reach', self: 'around you', near: 'short range', midrange: 'medium range', far: 'long range' };
/** `role` (a few words) and `diff` (one plain sentence) for the kit screen, written from the signature. */
export function packWords(sig) {
  if (!sig) return { role: '', diff: '' };
  const el = sig.element !== 'physical' ? `, ${sig.element === 'ice' ? 'frost' : sig.element}` : '';
  return {
    role: `${HANDS_WORD[sig.hands] || sig.hands} · ${sig.tempo}, ${REACH_WORD[sig.reach] || sig.reach}${el}`,
    diff: `${HANDS_TEXT[sig.hands] || ''} ${FAMILY_TEXT[sig.family] || ''}`.trim(),
  };
}
/** Put a set's lean (data `leans`) on its chest piece: real properties, summed by the sheet like any other. */
function applyLean(item, lean, leanId) {
  if (!item || !lean || item.slot !== 'chest') return item;
  item.affixes = [...(item.affixes || []), ...(lean.props || []).map((p, i) => ({ id: `kit_${leanId}_${i}`, name: p.name || lean.name, stat: p.stat, value: p.value, starterLean: leanId }))];
  item.lean = leanId;
  return item;
}
const WEIGHT_WORD = { cloth: 'Cloth', light: 'Leather', medium: 'Mail', heavy: 'Heavy' };

/** The only armour a kit may hand out: the plain piece of each weight. Nothing plate, runed, scaled or dragon-made. */
export const KIT_ARMOUR_BASES = Object.freeze([
  'cloth_helm', 'cloth_chest', 'cloth_legs',
  'light_helm', 'light_chest', 'light_legs', 'light_gauntlets', 'light_boots',
  'medium_helm', 'medium_chest', 'medium_legs', 'medium_gauntlets', 'medium_boots',
  'heavy_helm', 'heavy_chest', 'heavy_legs', 'heavy_gauntlets', 'heavy_boots',
]);

let SRC = { engine: null, json: null };
/** Remember the booted engine and the table, so `kitsFor(classId)` needs no other argument. */
export function setKitSource(engine = null, json = null) {
  SRC = { engine: engine || SRC.engine, json: json || SRC.json };
  return SRC;
}

const rowsOf = json => (json && json.classes) || (SRC.json && SRC.json.classes) || null;

/** The raw rows for one class: `{ cls, armour: [...], weapons: [...] }`, or null for a class the table does not know. */
export function kitPlan(classId, json = null) {
  const row = rowsOf(json)?.[classId];
  if (!row) return null;
  return { cls: classId, armour: (row.armour || []).map(a => ({ ...a, pieces: [...(a.pieces || [])] })), weapons: (row.weapons || []).map(w => ({ ...w })) };
}

const leansOf = json => (json && json.leans) || (SRC.json && SRC.json.leans) || null;
const leanOf = (set, json) => { const row = set?.lean ? leansOf(json)?.[set.lean] : null; return row ? { id: set.lean, row } : null; };

/** One kit item: generated, attuned, stamped. `tune` = what the pack says about a caster weapon. Null for an unknown base. */
function makeItem(engine, classId, kitId, baseKey, tune = null, lean = null) {
  const rng = makeRng(hashStr(`kit:${classId}:${kitId}:${baseKey}`));
  const item = engine.rpg.loot.generate(baseKey, 'normal', 'low', { rng });
  if (!item) return null;
  if (tune && item.type === 'weapon') {
    // BEFORE attuning: Farhold's attuneWeapon reads `attune` as the element a caster weapon was made for
    if (tune.element) item.attune = tune.element;
    if (tune.spell) item.staffSpell = tune.spell;
    if (tune.style) { item.castStyle = tune.style; item.wandBehaviour = tune.style; }
  }
  attuneWeapon(item);
  // owner 2026-10-22: two packs of one class must never LOOK the same, so a pack may name its own weapon ("Charwood
  // Staff" and "Bombard Staff" are both fire staves; their attacks differ, and now their names say so)
  if (tune && tune.itemName && item.type === 'weapon') item.name = tune.itemName;
  item.starter = true;
  if (lean) applyLean(item, lean.row, lean.id);
  // what a caster item IS (its style's own card sentence, a focus's rider): js/rules/tv-gear.js, when the engine has it
  engine.finishItem?.(item, { fresh: false, convert: false });
  return item;
}

/** The items of one weapon pack: main first, then the off hand. */
function packItems(engine, classId, pack) {
  const main = makeItem(engine, classId, pack.id, pack.main, pack);
  // a caster off hand (orb, tome) takes the pack's element: an icicle wand comes with a frost orb, not a random one
  const off = pack.off ? makeItem(engine, classId, pack.id + ':off', pack.off, pack.element ? { element: pack.element, itemName: pack.offName || null } : (pack.offName ? { itemName: pack.offName } : null)) : null;
  return [main, off].filter(Boolean);
}

/**
 * What the kit screen shows for a class. `items` are real item objects (normal rarity, no rolled affixes, equal on
 * every call). With no engine (a page that imported only this file) `items` is empty and the base keys are still there.
 */
export function kitsFor(classId, json = null, engine = null) {
  const plan = kitPlan(classId, json);
  if (!plan) return null;
  const eng = engine || SRC.engine;
  return {
    cls: classId,
    armour: plan.armour.map(a => {
      const lean = leanOf(a, json);
      const items = eng ? a.pieces.map(k => makeItem(eng, classId, a.id, k, null, lean)).filter(Boolean) : [];
      const heaviest = (a.pieces.find(k => /_chest$/.test(k)) || a.pieces[0] || 'cloth_').split('_')[0];
      return {
        id: a.id, name: a.name, blurb: a.blurb, pieces: a.pieces, items,
        // W23: what is DIFFERENT about this set — its weight and its lean (the lean's properties are on the chest piece)
        ...(lean ? { lean: lean.id, role: `${WEIGHT_WORD[heaviest]} · ${lean.row.name}`, diff: lean.row.text, props: (lean.row.props || []).map(p => ({ stat: p.stat, value: p.value })) } : {}),
      };
    }),
    weapons: plan.weapons.map(w => {
      const items = eng ? packItems(eng, classId, w) : [];
      const sig = items.length ? packSignature(items) : null;
      return {
        id: w.id, name: w.name, blurb: w.blurb, main: w.main, off: w.off || null,
        ...(w.style ? { style: w.style } : {}), ...(w.element ? { element: w.element } : {}), ...(w.spell ? { spell: w.spell } : {}),
        items, ...(sig ? { sig, ...packWords(sig) } : {}),
      };
    }),
  };
}

/**
 * Settle a choice: `{ ok, armour: id, weapons: id }`. A missing or unknown id becomes the FIRST of its list (the old
 * Farhold kit). `ok` is false only for a class the table does not know; `fell` names what was replaced.
 */
export function validKit(classId, choice = null, json = null) {
  const plan = kitPlan(classId, json);
  if (!plan || !plan.armour.length || !plan.weapons.length) return { ok: false, armour: null, weapons: null };
  const want = choice && typeof choice === 'object' ? choice : {};
  const a = plan.armour.find(x => x.id === want.armour), w = plan.weapons.find(x => x.id === want.weapons);
  const fell = [];
  if (want.armour != null && !a) fell.push('armour');
  if (want.weapons != null && !w) fell.push('weapons');
  return { ok: true, armour: (a || plan.armour[0]).id, weapons: (w || plan.weapons[0]).id, ...(fell.length ? { fell } : {}) };
}

/**
 * The chosen kit as worn gear: `{ weapon, offhand?, head?, chest?, legs?, hands?, feet? }` — A can save it as
 * `char.equipment`, and js/rules/character.js `restoreGear` puts it on. The weapon key comes first, so a restore
 * equips the main hand before the off hand. Null for an unknown class or with no engine.
 */
export function starterGear(classId, choice = null, json = null, engine = null) {
  const eng = engine || SRC.engine;
  const v = validKit(classId, choice, json);
  if (!eng || !v.ok) return null;
  const plan = kitPlan(classId, json);
  const pack = plan.weapons.find(x => x.id === v.weapons), set = plan.armour.find(x => x.id === v.armour);
  const out = {};
  const [main, off] = packItems(eng, classId, pack);
  if (main) out.weapon = main;
  if (off && pack.off) out.offhand = off;
  const lean = leanOf(set, json);
  for (const key of set.pieces) {
    const it = makeItem(eng, classId, set.id, key, null, lean);
    if (it && it.slot && !out[it.slot]) out[it.slot] = it;
  }
  return out;
}
