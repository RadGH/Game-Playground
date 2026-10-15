// Thousandvale — NO STRENGTH, DEXTERITY, INTELLECT OR CONSTITUTION (owner #2, 2026-10-15). Pure.
//
//   "Since we already have health, mana, dodge, etc as individual stats, STR/DEX/INT have no purpose. Weapons should
//    just give flat or percentage damage bonuses based on light, heavy or magic items."
//
// Farhold's sheet (`rpg.derive`) still knows the four attributes: every character gets 6 of each, gear and perks add
// more, and they turn into health (Constitution x4), mana (Intellect x2), critical chance and dodge (Dexterity x0.2 /
// x0.3) and a weapon damage multiplier (the attribute that matches the weapon's family x3%). Farhold and Emberveil keep
// all of that — their files are untouched. In Thousandvale this module, installed at engine boot (never on a parity
// engine), takes the attributes away and puts every number they gave somewhere a player can read it:
//
//   * the 6 points everyone had become plain +24 health, +12 mana, +1.2% critical chance and +1.8% dodge;
//   * the weapon carries its own damage bonus by family (heavy / light / magic, `combat.json families`) — the 18% that
//     "6 Strength" used to give a heavy weapon is now a line on the weapon ("Heavy weapon: +18% damage");
//   * a MELEE weapon in the main hand also takes a share off every hit you take (owner #61: "melee weapons should add
//     some damage reduction to give them a chance") — through Farhold's own `resistAll` reader in `rpg.strike`;
//   * every attribute line on an item, a unique, a set, a perk or the roll table is converted to what it was worth:
//     Strength n -> heavyPct 3n; Dexterity n -> lightPct 3n + critChance 0.2n + dodge 0.3n; Intellect n -> magicPct 3n +
//     mp 2n; Constitution n -> hp 4n. An item a player already owns converts the same way when it is loaded
//     (`engine.finishItem`, which every load path calls), so nobody loses an item or a point.
//
//   installNoAttributes(engine, cfg)     once per engine, after attachTvGear (wraps rpg.derive and engine.finishItem)
//   convertAffixList(list)               an affix list (instances or templates) with the attributes converted
//   familyOf(item) / familyText(item)    a weapon's family and its card line
//   meleeGuardOf(engine, item)           the share of damage a melee weapon takes off a hit (0 for anything else)

import { EFFECTS } from './farhold.js';
import { isSceptre } from './caster-forms.js';

export const ATTRS = Object.freeze(['str', 'dex', 'int', 'con']);
/** The family stat each attribute's weapon share moves to. */
export const FAMILY_STAT = Object.freeze({ heavy: 'heavyPct', light: 'lightPct', magic: 'magicPct' });
const FAM_ATTR = { heavy: 'str', light: 'dex', magic: 'int' };

/** Farhold's own per-point numbers (rpg.js derive): kept here so the conversion is exactly what the point gave. */
export const PER_POINT = Object.freeze({ weaponPct: 3, hp: 4, mp: 2, crit: 0.2, dodge: 0.3 });

export const FAMILY_DEFAULTS = Object.freeze({
  heavy: { damagePct: 18, guardPct: 15, oneHandGuardPct: 10 },
  light: { damagePct: 18, guardPct: 10, oneHandGuardPct: 10 },
  magic: { damagePct: 18, guardPct: 10, oneHandGuardPct: 10 },
});

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

/**
 * What `n` points of attribute `stat` were worth, as item stats (`hp`/`mp` are the item spellings) or, with
 * `{ sheet: true }`, as sheet fields (`maxHp`/`maxMp` — what a perk grants).
 */
export function attrGrants(stat, n, { sheet = false } = {}) {
  const v = +n || 0;
  const hp = sheet ? 'maxHp' : 'hp', mp = sheet ? 'maxMp' : 'mp';
  switch (stat) {
    case 'str': return { heavyPct: r1(v * PER_POINT.weaponPct) };
    case 'dex': return { lightPct: r1(v * PER_POINT.weaponPct), critChance: r2(v * PER_POINT.crit), dodge: r2(v * PER_POINT.dodge) };
    case 'int': return { magicPct: r1(v * PER_POINT.weaponPct), [mp]: r1(v * PER_POINT.mp) };
    case 'con': return { [hp]: r1(v * PER_POINT.hp) };
    default: return null;
  }
}

/** A rolled attribute prefix takes the id of the row that replaced it in the roll table (Hardy -> the health prefix). */
const NEW_ID = { of_str: 'tv_heavy', of_dex: 'tv_light', of_int: 'tv_magic', of_con: 'of_hp' };

/**
 * An affix list with every attribute line converted. Works on rolled affixes (`{ stat, value, … }`), on template
 * rows (`{ stat, min, max }`) and on a unique's fixed / random lists. The first converted line keeps the original's
 * other fields (id, name, tier); the extra lines are new rows named after it. A converted value that lands on a stat
 * the list already has (a plain number on both) is added to that line instead of printing a second one.
 */
export function convertAffixList(list) {
  if (!Array.isArray(list) || !list.some(a => a && ATTRS.includes(a.stat))) return list;
  const out = [];
  const add = row => {
    const same = out.find(o => o.stat === row.stat && !o.baseIntrinsic && !row.baseIntrinsic && typeof o.value === 'number' && typeof row.value === 'number' && o.min == null && row.min == null);
    if (same) { same.value = r2(same.value + row.value); return; }
    out.push(row);
  };
  for (const a of list) {
    if (!a || !ATTRS.includes(a.stat)) { out.push(a); continue; }
    const scale = k => attrGrants(a.stat, k);
    const byValue = typeof a.value === 'number' ? scale(a.value) : null;
    const byMin = typeof a.min === 'number' ? scale(a.min) : null;
    const byMax = typeof a.max === 'number' ? scale(a.max) : null;
    const keys = Object.keys(byValue || byMin || byMax || attrGrants(a.stat, 1));
    keys.forEach((stat, i) => {
      const row = i === 0 ? { ...a, stat, ...(NEW_ID[a.id] ? { id: NEW_ID[a.id] } : {}) } : { stat, ...(a.id ? { id: `${a.id}_${stat}` } : {}), ...(a.name ? { name: a.name } : {}), ...(a.ilvl != null ? { ilvl: a.ilvl } : {}), ...(a.tier ? { tier: a.tier } : {}), ...(a.baseIntrinsic ? { baseIntrinsic: true } : {}) };
      if (byValue) row.value = byValue[stat];
      if (byMin) row.min = byMin[stat];
      if (byMax) row.max = byMax[stat];
      if (i === 0) { delete row.growth; row.attrFrom = a.stat; }
      else row.attrFrom = a.stat;
      add(row);
    });
  }
  return out;
}

/** A `{ stat: value }` map (a set's partial bonus) with the attributes converted (summed into what is there). */
export function convertStatMap(map) {
  if (!map || typeof map !== 'object' || !ATTRS.some(k => typeof map[k] === 'number')) return map;
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    const g = ATTRS.includes(k) && typeof v === 'number' ? attrGrants(k, v) : null;
    if (!g) { out[k] = typeof out[k] === 'number' && typeof v === 'number' ? out[k] + v : v; continue; }
    for (const [s, n] of Object.entries(g)) out[s] = r2((out[s] || 0) + n);
  }
  return out;
}

/** An item a player owns, converted in place. Returns true when it changed. */
export function convertItem(item) {
  if (!item || typeof item !== 'object' || !Array.isArray(item.affixes)) return false;
  const next = convertAffixList(item.affixes);
  if (next === item.affixes) return false;
  item.affixes = next;
  item.attrsConverted = 1;
  return true;
}

/**
 * The item table, in memory: the roll table's attribute prefixes become the family stats (Hardy / Constitution goes —
 * there is already a health prefix), and every unique and set piece converts its fixed and random lines and its set
 * bonuses. Returns what changed (for a test).
 */
export function convertItemTable(items) {
  const report = { prefixes: [], removed: [], uniques: 0, sets: 0 };
  const NEW = { str: ['tv_heavy', 'heavyPct'], dex: ['tv_light', 'lightPct'], int: ['tv_magic', 'magicPct'] };
  for (const [g, list] of Object.entries(items?.affixes || {})) {
    if (!Array.isArray(list)) continue;
    const kept = [];
    for (const def of list) {
      if (!def || !ATTRS.includes(def.stat)) { kept.push(def); continue; }
      if (def.stat === 'con') { report.removed.push(def.id); continue; }
      const [id, stat] = NEW[def.stat];
      const k = PER_POINT.weaponPct;
      kept.push({ ...def, id, stat, min: r1((def.min ?? 2) * k), max: r1((def.max ?? 5) * k), attrFrom: def.stat });
      report.prefixes.push(`${g}:${def.id}->${id}`);
    }
    items.affixes[g] = kept;
  }
  for (const u of items?.uniques || []) {
    let hit = false;
    for (const key of ['fixedAffixes', 'randomAffixes', 'affixes']) {
      const next = convertAffixList(u[key]);
      if (next !== u[key]) { u[key] = next; hit = true; }
    }
    if (hit) report.uniques++;
  }
  for (const s of items?.sets || []) {
    let hit = false;
    for (const piece of s.items || []) for (const key of ['fixedAffixes', 'randomAffixes']) {
      const next = convertAffixList(piece[key]);
      if (next !== piece[key]) { piece[key] = next; hit = true; }
    }
    for (const [at, bonus] of Object.entries(s.partialBonuses || {})) {
      const next = convertStatMap(bonus);
      if (next !== bonus) { s.partialBonuses[at] = next; hit = true; }
    }
    if (hit) report.sets++;
  }
  return report;
}

// ------------------------------------------------------------------------------------------------ families

/** 'heavy' | 'light' | 'magic' for a weapon (unarmed / anything else: null). */
export function familyOf(item) {
  if (!item || item.type !== 'weapon' || item.noAttack) return null;
  const c = item.weaponCategory;
  return c === 'heavy' || c === 'magic' ? c : 'light';
}
/** A weapon that fights in melee: not a bow / crossbow / javelin, not a wand / staff / tome (a sceptre swings). */
export function isMeleeWeapon(item) {
  const f = familyOf(item);
  if (!f || item.ranged) return false;
  return f !== 'magic' || isSceptre(item);
}

function famCfg(engine) {
  const c = engine?.combatCfg?.families || engine?.attrCfg?.families || null;
  const out = {};
  for (const [f, d] of Object.entries(FAMILY_DEFAULTS)) out[f] = { ...d, ...(c?.[f] || {}) };
  return out;
}
/** The share (percent) of every hit taken off while this weapon is in the main hand: melee only. */
export function meleeGuardOf(engine, item) {
  if (!isMeleeWeapon(item)) return 0;
  const f = famCfg(engine)[familyOf(item)];
  return item.twoHanded ? (f.guardPct || 0) : (f.oneHandGuardPct ?? f.guardPct ?? 0);
}
const WORD = { heavy: 'Heavy weapon', light: 'Light weapon', magic: 'Magic weapon' };
/** The weapon's family line for its card. */
export function familyText(engine, item) {
  const f = familyOf(item);
  if (!f) return '';
  const pct = famCfg(engine)[f].damagePct || 0;
  const guard = meleeGuardOf(engine, item);
  return `${WORD[f]}: +${pct}% damage.${guard ? ` In your main hand it takes ${guard}% off every hit you take.` : ''}`;
}

// ------------------------------------------------------------------------------------------------ install

/** The new item stats, so their lines print and Farhold's effect registry adds them to the sheet. */
const STATS = {
  heavyPct: v => `+${r1(v)}% damage with heavy weapons`,
  lightPct: v => `+${r1(v)}% damage with light weapons and bows`,
  magicPct: v => `+${r1(v)}% damage with wands, staves, sceptres and tomes`,
};
function registerStats() {
  for (const [stat, desc] of Object.entries(STATS)) {
    const id = 'affix:' + stat;
    if (!EFFECTS[id]) EFFECTS[id] = { id, desc, field: stat, plain: true, tv: true };
  }
}
export const FAMILY_STAT_TEXT = STATS;

/**
 * Wire it: convert the item table, wrap `rpg.derive` (no attributes; the base folded in; the family share and the
 * melee guard) and `engine.finishItem` (owned items convert as they load; weapons get `family` + `familyText`).
 */
export function installNoAttributes(engine) {
  if (!engine || engine.noAttributes) return engine?.noAttributes || null;
  registerStats();
  const report = convertItemTable(engine.items);
  for (const c of engine.classes || []) {
    // the class row's attribute stays as a TAG (kits, crates and the class lists group callings by it); what a player is
    // shown is the weapon family it stands for
    if (c.primaryAttr && !c.weaponFamily) c.weaponFamily = { STR: 'heavy', DEX: 'light', INT: 'magic' }[c.primaryAttr] || null;
  }
  const rpg = engine.rpg;
  const b = engine.balance?.player || {};
  const base = { str: b.str ?? 6, dex: b.dex ?? 6, int: b.int ?? 6, con: b.con ?? 6 };
  const derive = rpg.derive;
  rpg.derive = function noAttrDerive(unit, ...rest) {
    const player = !!(unit && unit.classId && unit.attrs);
    if (player) unit.attrs = { str: 0, dex: 0, int: 0, con: 0 };
    const d = derive.call(this, unit, ...rest);
    if (!player || !d) return d;
    // the 6 points everyone had, as the plain numbers they were
    d.maxHp = Math.round((d.maxHp || 0) + base.con * PER_POINT.hp);
    d.maxMp = Math.round((d.maxMp || 0) + base.int * PER_POINT.mp);
    d.critChance = Math.round(((d.critChance || 0) + base.dex * PER_POINT.crit) * 1000) / 1000;
    d.dodge = Math.round(((d.dodge || 0) + base.dex * PER_POINT.dodge) * 1000) / 1000;
    // the weapon's family share: Farhold multiplied the dice by (1 + the matching attribute x 3%) — the attribute is
    // 0 now unless an unconverted line slipped through, so that factor is taken back out and the family's put in
    const F = famCfg(engine);
    // Farhold: round((dice x levelScale + damageFlat) x (1 + attribute x 3%) x (1 + damagePct)) — the same sum with the
    // family's share where the attribute's was (worked out again from the sheet's own terms, so no rounding is doubled)
    const skill = d.levelScale || 1, flat = d.damageFlat || 0, talent = 1 + (d.damagePct || 0) / 100;
    const share = (w, dmg, dice) => {
      if (!Array.isArray(dmg)) return { dmg, pct: 0 };
      const fam = familyOf(w) || 'light';
      const pct = (F[fam].damagePct || 0) + (d[FAMILY_STAT[fam]] || 0) + PER_POINT.weaponPct * (d[FAM_ATTR[fam]] || 0);
      const k = (1 + pct / 100) * talent;
      return { dmg: [Math.max(1, Math.round((dice[0] * skill + flat) * k)), Math.max(2, Math.round((dice[1] * skill + flat) * k))], pct };
    };
    const eq = unit.equipment || {};
    const main = share(eq.weapon, d.damage, eq.weapon?.dmg || b.unarmed || [2, 4]);
    d.damage = main.dmg; d.familyPct = r1(main.pct); d.family = familyOf(eq.weapon) || 'light';
    if (d.offDamage && eq.offhand?.dmg) { const off = share(eq.offhand, d.offDamage, eq.offhand.dmg); d.offDamage = off.dmg; d.familyOffPct = r1(off.pct); }
    // the melee guard (owner #61): a melee weapon in the main hand takes a share off every hit (rpg.strike resistAll)
    const guard = meleeGuardOf(engine, eq.weapon);
    d.weaponGuard = guard;
    if (guard) d.resistAll = Math.round(((d.resistAll || 0) + guard) * 1000) / 1000;
    d.str = 0; d.dex = 0; d.int = 0; d.con = 0;
    return d;
  };
  engine.noAttributes = report;
  return report;
}

/** The item half (after attachTvGear): every item that loads or is made converts, and a weapon carries its family line. */
export function installAttributeItems(engine) {
  if (!engine?.noAttributes || engine._attrItems) return;
  engine._attrItems = true;
  const finish = engine.finishItem;
  engine.finishItem = (item, opts) => {
    const out = finish ? finish(item, opts) : item;
    const it = out || item;
    if (it && typeof it === 'object') {
      convertItem(it);
      const f = familyOf(it);
      if (f) { it.family = f; it.familyText = familyText(engine, it); it.guardPct = meleeGuardOf(engine, it) || undefined; }
    }
    return out;
  };
}
