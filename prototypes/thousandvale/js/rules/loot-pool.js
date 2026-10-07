// Thousandvale — WHICH base a random drop is, and the second armour tier (play-test 4, S17 + S18). Pure.
//
// S17 "only swords seen": Farhold's balance.json `lootTiers` give levels 1-4 just dagger / sword / wand /
// shortbow, and its rollDrop picks uniformly from that list, so a melee character found swords and nothing else
// (measured at L1-8: swords 34.8% of weapon drops; axes, maces, spears, polearms, crossbows, javelins, shields,
// orbs and tomes 0%). data/rules/loot-pool.json picks a GROUP (weapon / armour / jewellery / off-hand), then a
// FAMILY, then a BASE whose `from` level is reached. Farhold's own lootTiers bases are merged in at their minLevel,
// so the high-level bases still drop.
//
// S18 "a second tier of armour with iconography": data/rules/armour-tiers.json — from `fromLevel`, an armour piece
// or shield may come out themed (flame / storm / venom / frost / dawn / umbral / …): `tier: 2`, `theme`, a name
// prefix, a little more armour, and `themeLook {theme, emblem, trim, glow, element}` for D-world.
//
// ONE wrapper round `engine.rpg.rollDrop` (drops, chests via rollLoot, shop rolls all pass through it). It reads
// `engine.lootPool` / `engine.armourTiers` on every call, so the parity fixtures switch both off by nulling them.

const WEAPON_FAMILY = {            // a Farhold base's subtype -> our family
  sword: 'sword', sword2h: 'greatsword', axe: 'axe', axe2h: 'axe', hammer: 'mace', mace: 'mace', dagger: 'dagger',
  spear: 'spear', polearm: 'polearm', javelin: 'javelin', bow: 'bow', crossbow: 'crossbow', staff: 'staff',
  wand: 'wand', scepter: 'scepter', orb: 'orb', tome: 'tome',
};
const ARMOUR_FAMILY = { head: 'head', chest: 'chest', legs: 'legs', hands: 'hands', feet: 'feet', ring: 'ring', necklace: 'neck', back: 'cloak', waist: 'belt', light: 'light' };   // back / waist / light: play-test 5 slots

/** The family a base key belongs to (null = not a drop base we know). */
export function familyOf(items, key) {
  const w = items.weaponBases && items.weaponBases[key];
  if (w) return WEAPON_FAMILY[w.subtype] || null;
  const a = items.armorBases && items.armorBases[key];
  if (!a) return null;
  if (a.isShield) return 'shield';
  if (a.slot === 'offhand') return key === 'quiver' ? 'quiver' : 'focus';
  return ARMOUR_FAMILY[a.slot] || null;
}

/**
 * Build the pool once: `cfg` = loot-pool.json, `balance` = Farhold's (its lootTiers merged in). Unknown base
 * keys (not in the item tables) are dropped, so a typo can never become a nameless item.
 */
export function buildLootPool(cfg, items, balance = null) {
  if (!cfg || !cfg.families) return null;
  const fam = {};
  for (const [id, f] of Object.entries(cfg.families)) {
    fam[id] = { id, group: f.group, w: f.w ?? 1, bases: (f.bases || []).filter(([k]) => familyOf(items, k)).map(([k, from]) => ({ key: k, from: from || 1 })) };
  }
  for (const row of (balance && balance.lootTiers) || []) {
    for (const k of row.bases || []) {
      const f = familyOf(items, k);
      if (!f || !fam[f] || fam[f].bases.some(b => b.key === k)) continue;
      fam[f].bases.push({ key: k, from: row.minLevel ?? 1 });
    }
  }
  return { groups: cfg.groups || { weapon: 1 }, families: fam, freshLevels: cfg.freshLevels ?? 10, oldWeight: cfg.oldWeight ?? 0.35 };
}

function pickWeighted(list, w, rng) {
  let sum = 0; for (const x of list) sum += w(x);
  if (!(sum > 0)) return null;
  let r = rng() * sum;
  for (const x of list) { r -= w(x); if (r <= 0) return x; }
  return list[list.length - 1];
}

/** One base key for a drop at `level` (null if nothing is open). */
export function pickBase(pool, level, rng) {
  if (!pool) return null;
  const open = Object.values(pool.families).map(f => ({ ...f, avail: f.bases.filter(b => b.from <= level) })).filter(f => f.avail.length);
  const groups = Object.entries(pool.groups).filter(([g]) => open.some(f => f.group === g));
  const g = pickWeighted(groups, ([, w]) => w, rng);
  if (!g) return null;
  const f = pickWeighted(open.filter(x => x.group === g[0]), x => x.w, rng);
  const b = pickWeighted(f.avail, x => (x.from > level - pool.freshLevels ? 1 : pool.oldWeight), rng);
  return b ? b.key : null;
}

/** The armour weight of a base (cloth / light / medium / heavy) for the theme pools, or null. */
export function weightOf(items, key) {
  const a = items.armorBases && items.armorBases[key];
  if (!a || a.tier === 'any') return null;
  if (a.slot === 'offhand' && !a.isShield) return key === 'quiver' ? 'light' : 'cloth';
  return a.tier || null;
}

/** Theme pools per weight: the themes of every class that wears it (armour-tiers.json `classes`). */
export function themePools(tiers) {
  const out = {};
  for (const c of Object.values((tiers && tiers.classes) || {})) { (out[c.weight] ||= []); if (!out[c.weight].includes(c.theme)) out[c.weight].push(c.theme); }
  return out;
}

/** S18: maybe theme `item` (mutates + returns it). Never below fromLevel, never a unique / set / legendary. */
export function themeItem(tiers, items, item, level, rng, pools = themePools(tiers)) {
  if (!tiers || !item || item.theme || (level || 1) < (tiers.fromLevel ?? 15)) return item;
  if (item.isUnique || item.setId || item.rarity === 'legendary') return item;
  const a = items.armorBases && items.armorBases[item.baseKey];
  if (!a || !(tiers.slots || []).includes(a.slot)) return item;
  const pool = pools[weightOf(items, item.baseKey)];
  if (!pool || !pool.length) return item;
  const chance = item.rarity === 'rare' ? (tiers.chanceRare ?? 0.55) : (tiers.chance ?? 0.3);
  if (rng() >= chance) return item;
  const id = pool[Math.floor(rng() * pool.length) % pool.length];
  const t = tiers.themes[id];
  if (!t) return item;
  item.tier = 2; item.theme = id;
  item.name = t.prefix + ' ' + item.name;
  if (Number.isFinite(item.armor)) item.armor = Math.round(item.armor * (tiers.armorMult ?? 1.1));
  // its own field: some bases carry `look` as a STRING (a focus's model id), which must stay as it is
  item.themeLook = { theme: id, emblem: t.emblem, trim: t.trim, glow: t.glow, element: t.element };
  return item;
}

/** Wrap engine.rpg.rollDrop once (idempotent). */
export function installLootPool(engine, { pool = null, tiers = null } = {}) {
  const rpg = engine.rpg;
  engine.lootPool = pool; engine.armourTiers = tiers;
  if (rpg._lootPool) return;
  rpg._lootPool = true;
  const pools = themePools(tiers);
  const roll = rpg.rollDrop;
  rpg.rollDrop = function lootPoolDrop(opts = {}) {
    const rng = opts.rng || this.rng;
    const level = opts.level || 1;
    let o = opts;
    if (engine.lootPool && !(opts.bases && opts.bases.length)) {
      const key = pickBase(engine.lootPool, level, rng);
      if (key) o = { ...opts, bases: [key] };
    }
    const it = roll.call(this, o);
    // the level it dropped / was made at (Farhold's rollDrop leaves ilvl at 1): the gear look's `lvl` (tier-2 on L15+)
    if (it && typeof it === 'object' && it.dropLevel == null) it.dropLevel = level;
    const out = it && engine.armourTiers ? themeItem(engine.armourTiers, engine.items, it, level, rng, pools) : it;
    // play-test 5: every drop is finished once — the T17 conversion roll, then what a caster item is (js/rules/tv-gear.js)
    return out && engine.finishItem ? engine.finishItem(out, { rng, fresh: true }) : out;
  };
}
