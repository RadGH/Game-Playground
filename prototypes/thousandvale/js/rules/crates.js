// Thousandvale — CRATES and GIFT BOXES (play-test 5: T9, T20). Pure.
//
//   T9  "New quest reward: a CRATE that gives a random item of a specific type with a minimum rarity. All starting
//        quests use it — an easy way to get gear early."
//   T20 "…an in-game letter with an attached GIFT that opens into a rare-or-better item."
//
// A crate is an ordinary bag item that holds a SPEC, not an item: `{ slot, min, forClass, level?, maxLevel? }`. The
// item is rolled when the crate is OPENED, at the opener's level (never above `maxLevel`), through the same
// `rpg.rollDrop` every drop uses — so it is a real item with real properties, a level requirement the opener
// meets, and (for `weapon` / `offhand` / armour) something the opener's class actually uses. Numbers and names:
// data/rules/crates.json. A gift box is the same thing with `kind: 'gift'`.
//
// The item shape is stream A's (docs/requests.md "Round 5 contracts — A"):
//   { id:'crate', kind:'crate', type:'crate', name, desc, rarity, crate: { slot, min, minRarity, forClass, cls?, level?, maxLevel? } }
//   { id:'gift',  kind:'gift',  type:'gift',  name, desc, rarity, gift:  { slot:'any', min, minRarity, level?, maxLevel? } }

export const CRATE_LADDER = ['normal', 'magic', 'rare', 'legendary'];
const WEIGHT_ORDER = ['cloth', 'light', 'medium', 'heavy'];

/** A spec in any of the three vocabularies (E's `{slot, min}`, A's `{type, minRarity}`, a bare string) -> ours. */
export function normalizeCrate(cfg, spec = {}) {
  if (typeof spec === 'string') spec = { slot: spec };
  const C = cfg || {};
  let slot = String(spec.slot || spec.type || 'any').toLowerCase();
  slot = C.aliases?.[slot] || slot;
  if (slot !== 'any' && !C.slots?.[slot]) slot = 'any';
  let min = String(spec.min || spec.minRarity || 'common').toLowerCase();
  if (!C.min?.[min]) min = 'common';
  const out = { slot, min, minRarity: C.min?.[min]?.floor || 'normal', forClass: spec.forClass !== false };
  if (spec.cls) out.cls = spec.cls;
  if (Number.isFinite(spec.level)) out.level = Math.max(1, Math.round(spec.level));
  if (Number.isFinite(spec.maxLevel)) out.maxLevel = Math.max(1, Math.round(spec.maxLevel));
  else if (out.level) out.maxLevel = out.level + (C.maxAbove ?? 3);
  if (spec.name) out.name = String(spec.name).slice(0, 60);
  return out;
}

/** The crate's card line, from its spec. */
export function crateText(cfg, spec, { gift = false } = {}) {
  const s = normalizeCrate(cfg, spec);
  const what = cfg?.what?.[s.slot] || 'an item';
  const cls = s.forClass && ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'armor', 'any'].includes(s.slot) ? ' your class can use' : '';
  const lvl = s.maxLevel ? ` (never above level ${s.maxLevel})` : '';
  return `${gift ? 'A gift. ' : ''}Open it for ${what}${cls}, ${cfg?.minText?.[s.min] || 'any rarity'}. It is rolled at your level when you open it${lvl}.`;
}

/** Build the bag item. `spec.gift` (or `{ gift: true }` in opts) makes a gift box. */
export function makeCrate(cfg, spec = {}, { gift = false, level = null } = {}) {
  const isGift = gift || !!spec.gift;
  const s = normalizeCrate(cfg, isGift ? { slot: 'any', min: 'rare', ...spec, forClass: spec.forClass !== false } : { ...spec, ...(level && !Number.isFinite(spec.level) && !Number.isFinite(spec.maxLevel) && spec.capLevel ? { level } : {}) });
  const kind = isGift ? 'gift' : 'crate';
  const name = s.name || (isGift ? cfg?.names?.gift || 'Gift Box' : cfg?.names?.[s.slot] || 'Crate');
  const { name: _n, ...body } = s;
  return {
    id: kind, kind, type: kind, name,
    desc: crateText(cfg, s, { gift: isGift }),
    rarity: cfg?.min?.[s.min]?.show || 'normal',
    stack: false,
    [kind]: body,
  };
}

/** Is this bag item a crate or a gift box? */
export const isCrate = item => !!item && typeof item === 'object' && (!!item.crate || !!item.gift || item.kind === 'crate' || item.kind === 'gift');

/** The loot-pool families a slot may open into for a class (null class = anything of that slot). */
export function crateFamilies(cfg, engine, slot, classDef) {
  const all = cfg?.slots?.[slot] || [];
  if (!classDef) return all;
  if (slot === 'weapon') {
    const mine = new Set();
    for (const sub of [...(classDef.weapons || []), baseSubtype(engine, classDef.starter)]) for (const f of cfg.classWeapon?.[sub] || []) mine.add(f);
    const out = all.filter(f => mine.has(f));
    return out.length ? out : all;
  }
  if (slot === 'offhand') {
    const O = cfg.offhandFor || {};
    const subs = new Set([...(classDef.weapons || []), baseSubtype(engine, classDef.starter)]);
    if (subs.has('bow')) return O.bow || all;
    if (classDef.shield) return O.shield || all;
    if (classDef.primaryAttr === 'INT') return O.INT || all;
    return O.else || all;
  }
  return all;
}
const baseSubtype = (engine, key) => engine.items.weaponBases?.[key]?.subtype || null;

/** Every base of those families open at `level` — for armour, only the weight the class wears (or the nearest below). */
export function crateBases(cfg, engine, slot, classDef, level) {
  const pool = engine.lootPool;
  const items = engine.items;
  const fams = crateFamilies(cfg, engine, slot, classDef);
  const out = [];
  for (const f of fams) {
    const fam = pool?.families?.[f];
    let list = (fam?.bases || []).slice();
    if (!list.length) continue;
    const open = list.filter(b => b.from <= level);
    list = open.length ? open : [list.reduce((a, b) => (b.from < a.from ? b : a))];
    if (classDef && ['head', 'chest', 'legs', 'hands', 'feet'].includes(f)) {
      const want = WEIGHT_ORDER.indexOf(classDef.armorTier);
      const tierOf = b => WEIGHT_ORDER.indexOf(items.armorBases?.[b.key]?.tier);
      // the class's own weight; when the slot has none of it (no cloth boots in the old table), the nearest lighter, then heavier
      for (const t of [want, want - 1, want - 2, want - 3, want + 1, want + 2, want + 3]) {
        const got = list.filter(b => tierOf(b) === t);
        if (got.length) { list = got; break; }
      }
    }
    if (classDef && f === 'shield' && classDef.armorTier !== 'heavy') {
      const lightOnes = list.filter(b => ['light', 'medium'].includes(items.armorBases?.[b.key]?.tier));
      if (lightOnes.length) list = lightOnes;
    }
    for (const b of list) out.push({ key: b.key, family: f, from: b.from });
  }
  return out;
}

/** Does `item` belong to the slot the crate promised? */
export function fitsCrate(cfg, engine, slot, item) {
  if (!item) return false;
  if (slot === 'any') return true;
  const key = item.baseKey || item.baseItemId;
  const fams = cfg?.slots?.[slot] || [];
  // the family of the base it was rolled from (a catalog base answers as its template)
  const w = engine.items.weaponBases?.[key], a = engine.items.armorBases?.[key];
  if (slot === 'weapon') return !!w && item.type === 'weapon' && !['orb', 'tome'].includes(w.subtype);
  if (slot === 'offhand') return (!!a && a.slot === 'offhand') || (!!w && ['orb', 'tome'].includes(w.subtype));
  if (slot === 'jewellery') return !!a && ['ring', 'necklace', 'back', 'waist'].includes(a.slot);
  if (slot === 'back' || slot === 'waist') return !!a && a.slot === slot;
  if (slot === 'armor') return !!a && ['head', 'chest', 'legs', 'hands', 'feet'].includes(a.slot);
  if (slot === 'neck') return !!a && a.slot === 'necklace';
  return !!a && fams.includes(a.slot);
}

/**
 * Open a crate or a gift box. Returns `[item]` (one item today) — never empty for a known slot.
 * `cls` = the opener's class id, `level` = their level, `rng` = the room's loot stream.
 */
export function openCrate(engine, crateItem, { cls = null, level = 1, rng = null, magicFind = 0, luck = 0 } = {}) {
  const cfg = engine.crates || {};
  const rpg = engine.rpg;
  const r = rng || rpg.rng;
  const raw = crateItem?.crate || crateItem?.gift || crateItem || {};
  const spec = normalizeCrate(cfg, crateItem?.gift ? { slot: 'any', ...raw, min: raw.min || raw.minRarity || 'rare' } : raw);
  const lvl = Math.max(1, Math.min(engine.levelCap || 50, spec.maxLevel || Infinity, level || spec.level || 1));
  const classDef = spec.forClass ? engine.classById(spec.cls || cls) : null;
  let rule = cfg.min?.[spec.min] || { floor: null, boost: 1 };
  // round 9 (Ragpicker's Fortune): `luck` = the opener's chance that the crate holds one rarity better than it promised
  // (the dice are only thrown for an opener who has some, so everyone else's crates roll exactly as before)
  if (luck > 0 && r() < luck) { const LADDER = [null, 'magic', 'rare', 'legendary']; const i = Math.max(0, LADDER.indexOf(rule.floor || null)); rule = { ...rule, floor: LADDER[Math.min(LADDER.length - 1, i + 1)], lucky: true }; }
  const pickSlot = () => {
    if (spec.slot !== 'any') return spec.slot;
    const any = cfg.any || { weapon: 1, armor: 1 };
    let x = r() * Object.values(any).reduce((a, b) => a + b, 0);
    for (const [k, w] of Object.entries(any)) { x -= w; if (x <= 0) return k; }
    return 'weapon';
  };
  const slot = pickSlot();
  const bases = crateBases(cfg, engine, slot, classDef, lvl);
  if (!bases.length) return [];
  const famIds = [...new Set(bases.map(b => b.family))];
  let item = null;
  for (let i = 0; i < (cfg.tries ?? 24) && !item; i++) {
    // a family first (so a class with one staff base and five sword bases still sees staves), then a base in it
    const fam = famIds[Math.floor(r() * famIds.length) % famIds.length];
    const list = bases.filter(b => b.family === fam);
    const key = list[Math.floor(r() * list.length) % list.length].key;
    const got = rpg.rollDrop({ level: lvl, rng: r, magicFind, chance: 1, bases: [key], floor: rule.floor || null, rarityBoost: rule.boost || 1 });
    // a legendary roll may come back as a set piece or a unique of any base: keep it only if it is the promised kind,
    // one this class can use, and one the opener is high enough to wear
    if (!got || !fitsCrate(cfg, engine, slot, got)) continue;
    if (classDef && (got.isUnique || got.setId) && !bases.some(b => b.key === (got.catalogBase || got.baseKey || got.baseItemId))) continue;
    if (rpg.levelRequirement && (rpg.levelRequirement(got, { level: lvl })?.level || 1) > lvl) continue;
    item = got;
  }
  if (!item) {
    // the plain way out: this base, at the floor rarity
    const key = bases[Math.floor(r() * bases.length) % bases.length].key;
    item = engine.makeItem ? engine.makeItem({ base: key, rarity: rule.floor || 'magic', level: lvl, rng: r }) : null;
  }
  if (!item) return [];
  item.from = crateItem?.kind === 'gift' || crateItem?.gift ? 'gift' : 'crate';
  return [item];
}
