// Gear and hero numbers: THE one stat function (heroStats) and the loot roller. Pure — no DOM, no clock.
//
//   const it = rollItem(ITEMS, { chapter: 2, cls: 'duelist', rand, minRarity: 'rare' });   // an owned item
//   const s = heroStats(CLASSES, ITEMS, { cls: 'duelist', level: 5, gear: { weapon: it, ... } });
//   itemStats(ITEMS, it) → summed numbers of one owned item (base × rarity + bonus lines) — what its card shows.
//
// An OWNED item is { uid, base, rarity, bonus: [{ stat, v }] } — the base row lives in data/items.json.
export const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'feet', 'trinket'];
export const STAT_KEYS = ['power', 'spell', 'def', 'hp', 'mp', 'crit', 'block', 'regen', 'mpRegen'];

const r2 = v => Math.round(v * 10) / 10;

export function baseOf(ITEMS, item) {
  const id = typeof item === 'string' ? item : item?.base;
  return ITEMS._byId ? ITEMS._byId.get(id) : (ITEMS._byId = new Map(ITEMS.items.map(b => [b.id, b])), ITEMS._byId.get(id));
}
export const rarityOf = (ITEMS, item) => ITEMS.rarity.find(r => r.id === item?.rarity) || ITEMS.rarity[0];

/** The summed numbers of one owned item: base × rarity, plus its bonus lines on the same stat (one line per stat). */
export function itemStats(ITEMS, item) {
  const b = baseOf(ITEMS, item); if (!b) return {};
  const mul = rarityOf(ITEMS, item).mul, out = {};
  for (const [k, v] of Object.entries(b.stats || {})) out[k] = (k === 'regen' || k === 'mpRegen') ? r2(v * mul) : Math.round(v * mul);
  for (const { stat, v } of item.bonus || []) out[stat] = (stat === 'regen' || stat === 'mpRegen') ? r2((out[stat] || 0) + v) : Math.round((out[stat] || 0) + v);
  return out;
}

/** The part of an item's numbers that came from bonus lines (for the card's "(+4)" split). */
export function bonusOf(item) {
  const out = {}; for (const { stat, v } of item?.bonus || []) out[stat] = (out[stat] || 0) + v; return out;
}

/** Can this hero wear it? (class list on the base) */
export const canUse = (ITEMS, cls, item) => !!baseOf(ITEMS, item)?.cls.includes(cls);

/** Level from experience points (data/classes.json levels = xp needed for each level). */
export function levelFor(CLASSES, xp) {
  let lv = 1; CLASSES.levels.forEach((need, i) => { if (xp >= need) lv = i + 1; }); return lv;
}
export function xpToNext(CLASSES, xp) {
  const lv = levelFor(CLASSES, xp), need = CLASSES.levels[lv];
  return need == null ? null : { have: xp - CLASSES.levels[lv - 1], need: need - CLASSES.levels[lv - 1] };
}

/**
 * A hero's numbers, every source added once: class base × level growth, then gear. `parts` keeps where each number
 * came from so the sheet can print "Power 31 (24 base +7 gear)".
 */
export function heroStats(CLASSES, ITEMS, { cls, level = 1, gear = {} }) {
  const C = CLASSES.classes[cls], g = CLASSES.perLevel, lv = Math.max(1, level) - 1;
  const base = {
    hp: Math.round(C.hp * (1 + g.hp * lv)), mp: Math.round(C.mp * (1 + g.mp * lv)), power: Math.round(C.power * (1 + g.power * lv)),
    spell: Math.round(C.power * (1 + g.power * lv) * 0.6), def: C.def, crit: 5, block: 0, regen: 0, mpRegen: 0,
  };
  const fromGear = {}; let effects = [];
  for (const slot of SLOTS) {
    const it = gear[slot]; if (!it) continue;
    const b = baseOf(ITEMS, it); if (!b || !b.cls.includes(cls)) continue;
    for (const [k, v] of Object.entries(itemStats(ITEMS, it))) fromGear[k] = (fromGear[k] || 0) + v;
    if (b.effect) effects.push(b.effect);
  }
  const total = {};
  for (const k of STAT_KEYS) total[k] = (k === 'regen' || k === 'mpRegen') ? r2((base[k] || 0) + (fromGear[k] || 0)) : Math.round((base[k] || 0) + (fromGear[k] || 0));
  total.crit = Math.min(60, total.crit);
  // Damage cut from defence: def / (def + 60) — 20 def = 25%, 60 def = 50%. Capped at 75%.
  total.cut = Math.min(0.75, total.def / (total.def + 60));
  total.blockCut = Math.min(0.95, (C.blockBonus || 0) + total.block / 100);
  return { ...total, base, gear: fromGear, effects, speed: C.speed };
}

/** Pick a rarity id for a drop in this chapter (data/items.json odds; minRarity raises the floor). */
export function rollRarity(ITEMS, chapter, rand, minRarity = 'common') {
  const w = ITEMS.odds[Math.max(0, Math.min(ITEMS.odds.length - 1, chapter))];
  const floor = ITEMS.rarity.findIndex(r => r.id === minRarity);
  const tot = w.reduce((a, v, i) => a + (i >= floor ? v : 0), 0) || 1;
  let x = rand() * tot;
  for (let i = 0; i < w.length; i++) { if (i < floor) continue; x -= w[i]; if (x <= 0) return ITEMS.rarity[i].id; }
  return ITEMS.rarity[Math.max(floor, 0)].id;
}

let uidN = 0;
/**
 * Roll an owned item. Picks a base from this chapter for this class (or any chapter up to it when `upTo`), a rarity,
 * and bonus lines (none on Common). `slot` narrows it; `base` forces one.
 */
export function rollItem(ITEMS, { chapter = 0, cls, rand, slot = null, base = null, minRarity = 'common', upTo = false, uid = null }) {
  let b = base ? baseOf(ITEMS, base) : null;
  if (!b) {
    const pool = ITEMS.items.filter(x => !x.legendary && (!cls || x.cls.includes(cls)) && (upTo ? x.chapter <= chapter : x.chapter === chapter) && (!slot || x.slot === slot));
    if (!pool.length) return null;
    b = pool[Math.floor(rand() * pool.length)];
  }
  const rarity = b.legendary ? 'legendary' : rollRarity(ITEMS, chapter, rand, minRarity);
  const R = ITEMS.rarity.find(r => r.id === rarity);
  const scale = 1 + b.chapter * 0.6, bonus = [], taken = new Set();
  const lines = b.legendary ? 1 : R.lines;
  for (let i = 0; i < lines; i++) {
    const opts = ITEMS.bonus.filter(o => !taken.has(o.stat) && (o.stat !== 'spell' || b.cls.includes('arcanist')) && (o.stat !== 'mp' || !b.cls.every(c => c === 'vanguard')));
    if (!opts.length) break;
    const o = opts[Math.floor(rand() * opts.length)]; taken.add(o.stat);
    const v = (o.min + (o.max - o.min) * rand()) * scale;
    bonus.push({ stat: o.stat, v: (o.stat === 'regen' || o.stat === 'mpRegen') ? r2(v) : Math.max(1, Math.round(v)) });
  }
  return { uid: uid || `i${(Math.floor(rand() * 1e9)).toString(36)}${(++uidN).toString(36)}`, base: b.id, rarity, bonus };
}

/** The starting kit for a new hero: the chapter-1 weapon (and off hand) at Common. */
export function starterGear(ITEMS, cls) {
  const g = {};
  for (const slot of ['weapon', 'offhand', 'chest']) {
    const b = ITEMS.items.find(x => x.chapter === 0 && x.slot === slot && x.cls.includes(cls) && !x.legendary);
    if (b) g[slot] = { uid: `start_${cls}_${slot}`, base: b.id, rarity: 'common', bonus: [] };
  }
  return g;
}

/** The avatar look with gear drawn on it: the class look, then each worn item's parts merged LAST. */
export function dressedLook(CLASSES, ITEMS, { cls, look = {}, gear = {} }) {
  const C = CLASSES.classes[cls];
  const out = JSON.parse(JSON.stringify({ ...C.look, ...look }));
  // Chibi 2.6 reads skin from body.skin; older looks kept it in skin.color
  if (out.skin?.color && !out.body?.skin) out.body = { ...(out.body || {}), skin: out.skin.color };
  for (const slot of SLOTS) {
    const it = gear[slot]; const b = it && baseOf(ITEMS, it);
    if (!b || !b.cls.includes(cls)) continue;
    for (const [k, v] of Object.entries(b.look)) out[k] = { ...(out[k] || {}), ...v };
  }
  // A two-handed weapon keeps the off hand empty; the Duelist's second blade is its off hand item.
  const wb = gear.weapon && baseOf(ITEMS, gear.weapon);
  if (wb?.hand === 'two') out.offhand = { id: 'none' };
  return out;
}
