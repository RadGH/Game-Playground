// Thousandvale — its own GEAR, applied to the shared item table in memory (play-test 5: T17, T23). Pure.
//
//   T17 "New weapon affix that converts the weapon's physical damage to another element — uncommon, never on wands
//        etc. that already convert."
//   T23 "A whole NEW type of item for every slot and archetype … all mapped to in-game items."
//
// emberveil/data/items.json is shared with two live games, so nothing is written there. At engine boot
// (js/rules/engine.js, `tvGear` on — off for the parity fixtures) this module:
//   * adds the bases data/rules/gear-tv.json names (cloth gloves, cloth shoes — the table had no cloth hands/feet);
//   * turns every NEW row of stream F's avatar-3d/data/gear-catalog.json into an item base (absent or half-written
//     file = nothing injected, never an error), and puts each into the loot pool at its `minLevel`;
//   * wraps `rpg.loot.generate` so an item made from a catalog base carries `g5` (its model id) and the element /
//     caster style the row asked for;
//   * gives `finishItem`, which every drop passes through (js/rules/loot-pool.js): the conversion affix, then the
//     caster stamp (js/rules/caster-forms.js).

import { attuneWeapon, EFFECTS } from './farhold.js';
import { familyOf } from './loot-pool.js';
import { stampCaster } from './caster-forms.js';

const clone = o => JSON.parse(JSON.stringify(o));
const hash01 = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };
const pickBy = (list, key) => list[Math.min(list.length - 1, Math.floor(hash01(key) * list.length))];

/** The catalog rows worth an item base: new, with a base id, of a kind the game wears. */
/** Thousandvale's own equipment slots (Farhold's slot list has neither): a cloak and a belt. `light` is Farhold's. */
export const TV_SLOTS = Object.freeze(['back', 'waist']);
export const EXTRA_SLOTS = Object.freeze(['back', 'waist', 'light']);

export function catalogRows(catalog) {
  const rows = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.rows) ? catalog.rows : Array.isArray(catalog?.items) ? catalog.items : [];
  return rows.filter(r => r && typeof r === 'object' && (r.new || r.round === 5) && typeof (r.base || r.id) === 'string');
}

/**
 * One catalog row -> `{ key, table: 'weaponBases' | 'armorBases', base }`, or `{ skip: reason }`.
 * The numbers are always those of an existing plain base (so balance cannot drift from a model file); the row
 * supplies the name, the first level, the model id and, for casters, the element and style its shape suggests.
 */
export function baseFromRow(items, cfg, row) {
  const C = cfg?.catalog || {};
  const key = row.base || row.id;
  const kind = row.kind;
  const stamp = (tpl, extra = {}) => ({
    ...clone(tpl), name: row.name || tpl.name, g5: row.id, look: { g5: row.id }, tvCatalog: true,
    ...(Number.isFinite(row.minLevel) && row.minLevel > 1 ? { minLevel: row.minLevel } : {}), ...extra,
  });
  if (kind === 'weapon' || (kind === 'offhand' && (row.type === 'orb' || row.type === 'tome'))) {
    const from = (kind === 'offhand' ? C.offhand : C.weapon)?.[row.type];
    const tpl = from && items.weaponBases?.[from];
    if (!tpl) return { skip: `no weapon base for type "${row.type}"` };
    const extra = { tvFrom: from };
    const el = row.element ? C.elements?.[row.element] : null;
    if (el && tpl.weaponCategory === 'magic') extra.attune = el;
    if (row.form && tpl.weaponCategory === 'magic') {
      if (tpl.subtype === 'wand' && C.forms?.[row.form]) extra.castStyle = pickBy(C.forms[row.form], key);
      else if (tpl.subtype === 'staff' && !tpl.statScaling?.includes('str')) {
        if (C.staffStyles?.[row.form]) extra.castStyle = C.staffStyles[row.form];
        else if (C.staffSpells?.[row.form]) {
          extra.staffSpell = C.staffSpells[row.form];
          if (row.form === 'fork' && !extra.attune) extra.attune = 'lightning';     // the forking staff spell (Arc Lash) is lightning's
        }
      }
    }
    return { key, table: 'weaponBases', base: stamp(tpl, extra) };
  }
  if (kind === 'armour' || kind === 'armor') {
    const slot = row.gameSlot;
    const tier = C.armour?.[row.archetype];
    const from = tier === 'cloth' && C.clothPiece?.[slot] ? C.clothPiece[slot] : (tier && C.piece?.[slot] ? `${tier}_${C.piece[slot]}` : null);
    const tpl = from && items.armorBases?.[from];
    if (!tpl) return { skip: `no armour base for ${row.archetype} ${slot}` };
    return { key, table: 'armorBases', base: stamp(tpl, { tvFrom: from }) };
  }
  if (kind === 'offhand' || kind === 'accessory') {
    let from = (kind === 'offhand' ? C.offhand : C.accessory)?.[row.type];
    // a focus copies the one whose rider fits its shape; a shield the one its `shield:<shape>` tag names
    if (kind === 'offhand' && row.type === 'focus' && row.form && C.focusByForm?.[row.form]) from = C.focusByForm[row.form];
    if (kind === 'offhand' && row.type === 'shield') {
      const shape = (row.tags || []).map(t => /^shield:(.+)$/.exec(String(t))?.[1]).find(Boolean);
      if (shape && C.shields?.[shape] && items.armorBases?.[C.shields[shape]]) from = C.shields[shape];
    }
    const tpl = from && items.armorBases?.[from];
    if (!tpl) return { skip: `no ${kind} base for type "${row.type}"` };
    return { key, table: 'armorBases', base: stamp(tpl, { tvFrom: from }) };
  }
  return { skip: `kind "${kind}" is not worn as gear` };
}

/**
 * Add Thousandvale's bases and the catalog's to `items` (in memory). Idempotent. Returns a report:
 * `{ added: [key], catalog: [key], skipped: [{id, why}] }`.
 */
export function installTvGear(items, cfg, catalog = null) {
  const report = { added: [], catalog: [], skipped: [] };
  if (!items || !cfg || items._tvGear) return report;
  items._tvGear = true;
  for (const [key, base] of Object.entries(cfg.bases?.armor || {})) if (!items.armorBases[key]) { items.armorBases[key] = { ...clone(base), tv: true }; report.added.push(key); }
  for (const [key, base] of Object.entries(cfg.bases?.weapon || {})) if (!items.weaponBases[key]) { items.weaponBases[key] = { ...clone(base), tv: true }; report.added.push(key); }
  let rows = [];
  try { rows = catalogRows(catalog); } catch { rows = []; }
  for (const row of rows) {
    let made;
    try { made = baseFromRow(items, cfg, row); } catch (err) { made = { skip: String(err?.message || err) }; }
    if (!made || made.skip) { report.skipped.push({ id: row.id, why: made?.skip || 'unreadable' }); continue; }
    if (items.weaponBases[made.key] || items.armorBases[made.key]) { report.skipped.push({ id: row.id, why: `base "${made.key}" already exists` }); continue; }
    items[made.table][made.key] = made.base;
    report.catalog.push(made.key);
  }
  return report;
}

/** Put the new bases into the loot pool (a built pool from js/rules/loot-pool.js) at their first level. */
export function poolTvGear(pool, items, cfg, report) {
  if (!pool) return 0;
  let n = 0;
  for (const [id, f] of Object.entries(cfg?.families || {})) if (!pool.families[id]) pool.families[id] = { id, group: f.group, w: f.w ?? 1, bases: [] };
  const add = (key, fam, from) => {
    const f = pool.families[fam];
    if (!f || f.bases.some(b => b.key === key)) return;
    f.bases.push({ key, from: from || 1 });
    n++;
  };
  for (const [key, [fam, from]] of Object.entries(cfg?.pool || {})) if (items.armorBases[key] || items.weaponBases[key]) add(key, fam, from);
  for (const key of report?.catalog || []) {
    const base = items.weaponBases[key] || items.armorBases[key];
    const fam = familyOf(items, base.tvFrom || key) || familyOf(items, key);
    if (fam) add(key, fam, base.minLevel || 1);
  }
  return n;
}

/** T17: may this weapon take a conversion? Physical, magic or rare, not already branded. */
export function canConvert(cfg, items, item) {
  const c = cfg?.convert;
  if (!c || !item || item.type !== 'weapon') return false;
  if (item.weaponCategory === 'magic' || item.castElement) return false;        // wands, staves, sceptres, orbs, tomes: already an element
  if (item.isUnique || item.setId || !(c.rarities || ['magic', 'rare']).includes(item.rarity)) return false;
  if (item.brand || item.converted) return false;
  if ((item.affixes || []).some(a => /^cond_brand/.test(a.stat || ''))) return false;
  const base = items?.weaponBases?.[item.baseKey];
  if ((base?.intrinsic || []).some(f => /^cond_brand/.test(f.stat || ''))) return false;
  return true;
}

/** T17: put the conversion for `element` on `item` (replacing one rolled property, so the item is not simply richer). */
export function convertWeapon(cfg, item, element, value) {
  const def = cfg?.convert?.affixes?.[element];
  if (!def) return item;
  const rolled = (item.affixes || []).map((a, i) => ({ a, i })).filter(x => !x.a.baseIntrinsic && !x.a.intrinsic);
  const affix = { id: def.id, name: def.name, stat: def.stat, value: +(+value).toFixed(2), element, extended: true, tvConvert: true };
  if (rolled.length) item.affixes.splice(rolled[rolled.length - 1].i, 1, affix); else (item.affixes || (item.affixes = [])).push(affix);
  item.brand = element;
  item.converted = true;
  // the name says it, and loses the word of the property it gave up
  const lost = rolled.length ? rolled[rolled.length - 1].a.name : null;
  let name = item.name || item.baseName || '';
  if (lost && name.startsWith(lost + ' ')) name = name.slice(lost.length + 1);
  else if (lost && name.endsWith(' ' + lost)) name = name.slice(0, -lost.length - 1);
  item.name = `${def.name} ${name}`;
  item.convertText = convertText(def, affix.value, element);
  return item;
}
/** The conversion's card line: Farhold's own sentence for the brand stat (its registry is what applies it). */
export function convertText(def, value, element) {
  try { const t = EFFECTS['affix:' + def.stat]?.desc?.(value); if (t) return t; } catch { /* fall through */ }
  return `Every hit deals ${element} damage instead of physical; +${Math.round(value * 100)}% ${element} damage`;
}

/**
 * Wire it into an engine: the generate wrapper (catalog fields onto the item), `engine.finishItem(item, {rng,
 * fresh})` and `engine.makeItem({base, rarity, level, rng})`.
 */
export function attachTvGear(engine, cfg) {
  const rpg = engine.rpg, items = engine.items;
  const loot = rpg.loot;
  if (!loot._tvGear) {
    loot._tvGear = true;
    const gen = loot.generate;
    loot.generate = function tvGenerate(baseKey, rarity, quality, opts) {
      const item = gen.call(this, baseKey, rarity, quality, opts);
      const base = item && (items.weaponBases[baseKey] || items.armorBases[baseKey]);
      if (item && base?.g5) {
        item.g5 = base.g5;
        // the item answers as its TEMPLATE base to every rule that asks by key (a quarterstaff is a pole, a rapier
        // fences, a reliquary siphons); what it LOOKS like and what it is called are the catalog row's
        item.catalogBase = baseKey;
        if (base.tvFrom) item.baseKey = base.tvFrom;
        if (base.attune && !item.attune) item.attune = base.attune;           // attuneWeapon honours `attune`
        if (base.castStyle) item.castStyle = base.castStyle;
        if (base.staffSpell) item.staffSpell = base.staffSpell;
      }
      return item;
    };
  }
  engine.tvGear = cfg || null;
  /** Every new item passes through here once: T17 conversion (drops only), then the caster stamp. */
  engine.finishItem = (item, { rng = null, fresh = true, convert = true } = {}) => {
    if (!item || typeof item !== 'object') return item;
    const c = engine.tvGear?.convert;
    if (convert && fresh && rng && c && canConvert(engine.tvGear, items, item) && rng() < (c.chance ?? 0)) {
      const els = Object.keys(c.affixes || {});
      const el = els[Math.floor(rng() * els.length) % els.length];
      const [lo, hi] = c.value || [0.04, 0.1];
      convertWeapon(engine.tvGear, item, el, lo + rng() * (hi - lo));
    }
    stampCaster(engine, item, { fresh: fresh && !item.isUnique && !item.setId && !item.starter });
    return item;
  };
  /** One item of a named base (E: shop stock, quest rewards; a kit; a test). */
  engine.makeItem = ({ base, rarity = 'normal', level = 1, rng = null, quality = null } = {}) => {
    if (!base || !(items.weaponBases[base] || items.armorBases[base])) return null;
    const r = rng || rpg.rng;
    rpg.lastDropLevel = level;
    const item = attuneWeapon(loot.generate(base, rarity, quality || rpg.qualityFor(level), { rng: r }));
    if (item && item.dropLevel == null) item.dropLevel = level;
    return engine.finishItem(item, { rng: r, fresh: true, convert: false });
  };
  return engine;
}
