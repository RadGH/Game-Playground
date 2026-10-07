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

import { attuneWeapon, makeRng, hashStr } from './farhold.js';

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

/** One kit item: generated, attuned, stamped. `tune` = what the pack says about a caster weapon. Null for an unknown base. */
function makeItem(engine, classId, kitId, baseKey, tune = null) {
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
  item.starter = true;
  // what a caster item IS (its style's own card sentence, a focus's rider): js/rules/tv-gear.js, when the engine has it
  engine.finishItem?.(item, { fresh: false, convert: false });
  return item;
}

/** The items of one weapon pack: main first, then the off hand. */
function packItems(engine, classId, pack) {
  const main = makeItem(engine, classId, pack.id, pack.main, pack);
  const off = pack.off ? makeItem(engine, classId, pack.id + ':off', pack.off) : null;
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
    armour: plan.armour.map(a => ({
      id: a.id, name: a.name, blurb: a.blurb, pieces: a.pieces,
      items: eng ? a.pieces.map(k => makeItem(eng, classId, a.id, k)).filter(Boolean) : [],
    })),
    weapons: plan.weapons.map(w => ({
      id: w.id, name: w.name, blurb: w.blurb, main: w.main, off: w.off || null,
      ...(w.style ? { style: w.style } : {}), ...(w.element ? { element: w.element } : {}), ...(w.spell ? { spell: w.spell } : {}),
      items: eng ? packItems(eng, classId, w) : [],
    })),
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
  for (const key of set.pieces) {
    const it = makeItem(eng, classId, set.id, key);
    if (it && it.slot && !out[it.slot]) out[it.slot] = it;
  }
  return out;
}
