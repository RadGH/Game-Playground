// Items (rulings 9, 18, 27, 28, 38, 40, 41). Pure; every roll takes its rng. Reads the Fable-designed data:
// data/item-bases.json, affixes.json, rarity.json, uniques.json, legendaries.json (docs/ITEMS.md explains it all).
//
// An item instance (what bags, saves and the wire carry):
//   { uid, base, ilvl, rarity: normal|magic|rare|unique|legendary, affixes: [{ id, tier, v }], unique?, uv?: [values],
//     power?, quality: 0-20, ided: bool, dur: [cur, max], name? (rare/legendary), pos?: { x, y } (bag grid) }
// UNITS: every pct value is WHOLE PERCENTAGE POINTS (12 = 12%), exactly as the data writes it. pct() is the ONE place
// that turns them into fractions.
import { handRefusal, gripOf } from './hands.js';
export const pct = v => (+v || 0) / 100;
export const RARITIES = ['normal', 'magic', 'rare', 'unique', 'legendary'];
export const SLOTS = ['head', 'chest', 'hands', 'belt', 'feet', 'neck', 'ring1', 'ring2', 'weapon', 'offhand', 'weapon2', 'offhand2'];
export const WORN = ['head', 'chest', 'hands', 'belt', 'feet', 'neck', 'ring1', 'ring2', 'weapon', 'offhand'];
const ARMOUR_SLOTS = new Set(['head', 'chest', 'hands', 'feet']);

/** Index the raw data files once. */
export function itemData(raw) {
  const bases = {}; for (const b of raw.bases?.bases || []) bases[b.id] = b;
  const aff = {}; const prefixes = [], suffixes = [];
  for (const a of raw.affixes?.prefixes || []) { aff[a.id] = { ...a, side: 'prefix' }; prefixes.push(aff[a.id]); }
  for (const a of raw.affixes?.suffixes || []) { aff[a.id] = { ...a, side: 'suffix' }; suffixes.push(aff[a.id]); }
  const uniques = {}; for (const u of raw.uniques?.items || []) uniques[u.id] = u;
  const powers = {}; for (const p of raw.legendaries?.powers || []) powers[p.id] = p;
  return { bases, aff, prefixes, suffixes, uniques, powers, rarity: raw.rarity || {}, affixRules: raw.affixes || {}, proficiency: raw.bases?.proficiency || {}, kinds: raw.bases?.kinds || {} };
}

/** Linear interpolation through keyframes [[level, v...], ...]. */
export function interp(keys, L, col = 1) {
  if (!keys?.length) return 0;
  if (L <= keys[0][0]) return keys[0][col];
  for (let i = 1; i < keys.length; i++) if (L <= keys[i][0]) { const a = keys[i - 1], b = keys[i], k = (L - a[0]) / (b[0] - a[0]); return a[col] + (b[col] - a[col]) * k; }
  return keys[keys.length - 1][col];
}
const pickW = (rng, list, w) => { const tot = list.reduce((s, x) => s + w(x), 0); if (tot <= 0) return null; let k = rng() * tot; for (const x of list) { k -= w(x); if (k <= 0) return x; } return list[list.length - 1]; };
const affixKind = b => b.slot === 'offhand' ? b.kind : b.slot === 'weapon' ? b.kind : b.kind === 'ring' || b.slot === 'ring' ? 'ring' : b.slot === 'neck' ? 'neck' : b.slot;

// ---- who may use what -------------------------------------------------------------------------------------------------
/** The Path/spec proficiency entry for a character (wanderer before level 3). A spec ADDS to its Path: the table's
 *  `specAdds[spec]`, plus `specAdds.fighter_any` for every Fighter spec (plate at the spec pick, ruling 2). The last
 *  entry that says `dualWield` decides it, with its own `dualWieldClasses`. */
export function profOf(data, ch) {
  const P = data.proficiency || {}, path = P[ch?.path] || P.wanderer || { armour: ['cloth', 'leather'], weapons: [], offhand: [] };
  if (!ch?.spec) return path;
  const A = P.specAdds || {}, adds = [ch.path === 'fighter' ? A.fighter_any : null, A[ch.spec]].filter(Boolean);
  if (!adds.length) return path;
  const all = k => [...new Set([path, ...adds].flatMap(x => x[k] || []))];
  const dw = [...adds].reverse().find(x => 'dualWield' in x) || path;
  return { armour: all('armour'), weapons: all('weapons'), offhand: all('offhand'), dualWield: !!dw.dualWield, dualWieldClasses: dw.dualWield ? dw.dualWieldClasses : undefined };
}
export function canUseBase(data, ch, b) {
  const p = profOf(data, ch);
  if (b.slot === 'weapon') return (p.weapons || []).includes(b.proficiency) || (p.weapons || []).includes(b.kind) || (p.weapons || []).includes(b.class);
  if (b.slot === 'offhand') return (p.offhand || []).includes(b.kind) || (p.offhand || []).includes(b.class);
  if (ARMOUR_SLOTS.has(b.slot)) return (p.armour || []).includes(b.proficiency);
  return true;
}

// ---- rolling ---------------------------------------------------------------------------------------------------------
let uidN = 0;
export const newUid = rng => 'i' + Math.floor(rng() * 2 ** 31).toString(36) + (++uidN).toString(36);

/** Rarity at an area level for a monster kind, with magic find (whole points). */
export function rollRarity(data, rng, ilvl, kind = 'normal', mf = 0) {
  const R = data.rarity, row = RARITIES.map((_, i) => interp(R.rarityByLevel?.keys, ilvl, i + 1));
  const mult = R.rarityMult?.[kind] || {}, mfm = 1 + pct(mf) / (1 + mf / 250);
  const w = { normal: row[0], magic: row[1], rare: row[2] * (mult.rare || 1) * mfm, unique: row[3] * (mult.unique || 1) * mfm, legendary: row[4] * (mult.legendary || 1) * mfm };
  if (mult.minRarity === 'magic') w.normal = 0;
  return pickW(rng, RARITIES, r => w[r]);
}
/** Pick a base for an item level (personal loot: mostly ones this character can use). */
export function pickBase(data, rng, ilvl, ch = null) {
  const R = data.rarity.basePick || {}, groups = R.groups || { weapon: 34, armour: 40, offhand: 12, jewellery: 10, belt: 4 };
  const groupOf = b => b.slot === 'weapon' ? 'weapon' : b.slot === 'offhand' ? 'offhand' : (b.slot === 'ring' || b.slot === 'neck') ? 'jewellery' : b.slot === 'belt' ? 'belt' : 'armour';
  const respect = ch && rng() >= 0.2;                         // 20% ignore proficiency: trade bait (rarity.json basePick)
  const all = Object.values(data.bases).filter(b => (b.dropLevel || 1) <= ilvl && (!respect || canUseBase(data, ch, b)));
  const g = pickW(rng, Object.keys(groups).filter(k => all.some(b => groupOf(b) === k)), k => groups[k]);
  const pool = all.filter(b => groupOf(b) === g);
  return pickW(rng, pool, b => (ilvl - (b.dropLevel || 1) <= (R.freshLevels || 10)) ? 1 : (R.oldWeight ?? 0.35));
}
/** Pick a tier of an affix for an item level (tierLadder fade rule). */
export function pickTier(rng, affix, ilvl) {
  const ok = affix.tiers.filter(t => t.ilvlMin <= ilvl);
  return pickW(rng, ok, t => { const gap = ilvl - t.ilvlMin; return t.weight * (gap <= 10 ? 1 : Math.max(0.2, 1 - (gap - 10) / 30)); });
}
const rollIn = (rng, t) => t.min === t.max ? t.min : Math.round(t.min + rng() * (t.max - t.min));
/** Affixes this base may roll that are not already on the item (one per group). */
function eligible(data, b, side, have, useful = null) {
  const k = affixKind(b), groups = new Set(have.map(a => data.aff[a.id]?.group));
  return (side === 'prefix' ? data.prefixes : data.suffixes).filter(a => a.kinds?.includes(k) && (!a.proficiency || a.proficiency.includes(b.proficiency)) && !groups.has(a.group))
    .map(a => ({ a, w: useful && !useful(a) ? (data.affixRules.smartRoll?.uselessWeight ?? 0.25) : 1 }));
}
export function addAffix(data, rng, item, { side = null, useful = null, maxIlvl = null } = {}) {
  const b = data.bases[item.base], have = item.affixes;
  const nP = have.filter(a => data.aff[a.id]?.side === 'prefix').length, nS = have.length - nP;
  const max = data.affixRules.maxPerItem || { prefixes: 3, suffixes: 3 };
  const sides = [nP < max.prefixes && 'prefix', nS < max.suffixes && 'suffix'].filter(Boolean).filter(s => !side || s === side);
  for (const sd of (rng() < 0.5 ? sides : sides.reverse())) {
    const pool = eligible(data, b, sd, have, useful); if (!pool.length) continue;
    const pick = pickW(rng, pool, x => x.w).a, lvl = Math.min(item.ilvl, maxIlvl ?? item.ilvl);
    const t = pickTier(rng, pick, lvl); if (!t) continue;
    have.push({ id: pick.id, tier: t.tier, v: rollIn(rng, t) });
    return true;
  }
  return false;
}
function affixCountFor(data, rng, rarity, ilvl) {
  const R = data.affixRules.affixCount || {};
  if (rarity === 'magic') return rng() * 100 < (R.magic?.one ?? 60) ? 1 : 2;
  const bands = (rarity === 'legendary' ? R.legendary : R.rare)?.bands || [{ ilvlMin: 1, w: [60, 30, 9, 1] }];
  const band = [...bands].reverse().find(x => ilvl >= x.ilvlMin) || bands[0];
  const n = pickW(rng, [3, 4, 5, 6], c => band.w[c - 3] || 0) || 3;
  return rarity === 'legendary' ? Math.min(5, n) : n;
}

/** Make an item. opts: { base, rarity, ch (for smart roll + proficiency), quality } */
/** Does this base give a stat by itself (weapon damage, armour, block)? Jewellery does not. */
export const hasBaseStat = b => !!(b && (b.damage || b.armour || b.block || b.implicit));

export function makeItem(data, rng, ilvl, opts = {}) {
  ilvl = Math.max(1, Math.min(data.rarity.ilvlCap || 65, Math.round(ilvl)));
  let rarity = opts.rarity || 'normal';
  let b = opts.base ? data.bases[opts.base] : null;
  const item = { uid: newUid(rng), base: null, ilvl, rarity, affixes: [], quality: opts.quality ?? 0, ided: true, dur: null };
  if (rarity === 'unique') {
    const u = pickW(rng, Object.values(data.uniques).filter(u => (data.bases[u.base]?.dropLevel || 1) <= ilvl && (u.levelReq || 1) <= ilvl + 2 && (!b || u.base === b.id)), u => u.weight || 100);
    if (u) { item.unique = u.id; item.base = u.base; item.uv = u.stats.map(s => rollIn(rng, s)); }
    else rarity = item.rarity = 'rare';
  }
  if (!item.base) { b ||= pickBase(data, rng, ilvl, opts.ch); item.base = b.id; }
  b = data.bases[item.base];
  // an item must have at least one stat (owner 2026-11-11: "a necklace dropped with no modifiers… if it has no stats it
  // should not drop"). Weapons carry damage, armour carries armour; a ring or amulet has nothing of its own, so it is
  // never a plain item (as in Diablo 2: jewellery is always at least magic).
  if (rarity === 'normal' && !hasBaseStat(b)) rarity = item.rarity = 'magic';
  if (rarity === 'legendary') {
    const pw = pickW(rng, Object.values(data.powers).filter(p => (p.ilvlMin || 1) <= ilvl && p.kinds?.includes(affixKind(b))), p => p.weight || 10);
    if (pw) item.power = pw.id; else rarity = item.rarity = 'rare';
  }
  if (rarity === 'magic' || rarity === 'rare' || rarity === 'legendary') {
    const useful = opts.ch ? usefulFor(opts.ch) : null;
    const n = affixCountFor(data, rng, rarity, ilvl);
    for (let i = 0; i < n; i++) if (!addAffix(data, rng, item, { useful })) break;
    if (rarity === 'magic' && !item.affixes.length && hasBaseStat(b)) item.rarity = 'normal';
  }
  if (!hasBaseStat(b) && !item.affixes.length && !item.unique && !item.power) return null;     // nothing on it: no item
  if ((data.rarity.unidentified?.rarities || ['rare', 'unique', 'legendary']).includes(item.rarity)) item.ided = false;
  if (item.rarity === 'rare' || item.rarity === 'legendary') item.name = rareName(rng);
  const dmax = durabilityMax(b); if (dmax) item.dur = [dmax, dmax];
  return item;
}
const durabilityMax = b => (b.slot === 'ring' || b.slot === 'neck') ? null : b.slot === 'weapon' ? 40 + Math.round((b.dropLevel || 1) * 1.2) : 30 + Math.round((b.dropLevel || 1));
/** Affixes useless to a Path roll at a quarter weight (smart roll). */
function usefulFor(ch) {
  const caster = ch.path === 'mage' || ch.path === 'healer', martial = ch.path === 'fighter' || ch.path === 'rogue';
  return a => !((martial && /^(spellPower|castSpeed|mana|manaRegen|healingPower|fireDamagePct|frostDamagePct|stormDamagePct|shadowDamagePct)$/.test(a.stat)) || (caster && /^(attackSpeed|physDamage(Flat|Pct)|attackPower|blockChance|blockAmount)$/.test(a.stat)));
}
const RARE_A = ['Grim', 'Dusk', 'Storm', 'Bitter', 'Raven', 'Iron', 'Gloom', 'Thorn', 'Ash', 'Bone', 'Hollow', 'Wraith', 'Gale', 'Brine', 'Cinder', 'Moss', 'Rune', 'Sorrow', 'Vigil', 'Wild'];
const RARE_B = ['bite', 'brand', 'song', 'fang', 'ward', 'mark', 'shroud', 'grasp', 'gaze', 'heart', 'crest', 'spur', 'knot', 'wake', 'call', 'whisper', 'edge', 'hold', 'root', 'tide'];   // (never 'veil'/'ember': docs/banned-names.md)
const rareName = rng => RARE_A[Math.floor(rng() * RARE_A.length)] + RARE_B[Math.floor(rng() * RARE_B.length)];

// ---- reading an item ----------------------------------------------------------------------------------------------------
/** Every stat on an item as { stat: { value, units } } summed (affixes, unique stats, implicit, quality). */
export function itemMods(data, it) {
  const out = {}, add = (stat, v, units = 'flat') => { if (!stat) return; const o = out[stat] ||= { value: 0, units }; o.value += +v || 0; };
  const b = data.bases[it.base] || {};
  if (b.implicit) add(b.implicit.stat, b.implicit.value, b.implicit.units);
  if (it.ided !== false) {
    for (const a of it.affixes || []) { const d = data.aff[a.id]; if (d) add(d.stat, a.v, d.units); }
    if (it.unique) { const u = data.uniques[it.unique]; (u?.stats || []).forEach((s, i) => add(s.stat, it.uv?.[i] ?? s.min, s.units)); }
  }
  return out;
}
/** Weapon damage after flat, %, quality (docs/ITEMS.md damage order, attackPower applied in the sheet). */
export function weaponDamage(data, it) {
  const b = data.bases[it.base]; if (!b?.damage) return null;
  const m = itemMods(data, it), hands2 = b.hands === 2 || data.kinds?.[b.kind]?.hands === 2;
  const flat = (m.physDamageFlat?.value || 0) * (hands2 ? 1.5 : 1), mult = 1 + pct((m.physDamagePct?.value || 0) + (it.quality || 0));
  const spd = b.damage.speed * (1 + pct(m.attackSpeed?.value || 0));
  return { min: Math.round((b.damage.min + flat) * mult), max: Math.round((b.damage.max + flat) * mult), speed: +spd.toFixed(2), ranged: !!b.ranged, hands: hands2 ? 2 : 1, type: b.class || b.kind, finesse: ['dagger', 'sword'].includes(b.kind) || undefined };
}
export function itemArmour(data, it) {
  const b = data.bases[it.base]; if (!b?.armour) return 0;
  const m = itemMods(data, it);
  return Math.round((b.armour + (m.armourFlat?.value || 0)) * (1 + pct((m.armourPct?.value || 0) + (it.quality || 0))));
}
/** Requirements of a finished item: level = max(base, ceil(0.8 x best tier's ilvlMin)), attributes from the base (less reqReduce). */
export function itemReq(data, it) {
  const b = data.bases[it.base] || {};
  let lvl = b.levelReq || 1;
  for (const a of it.affixes || []) { const t = data.aff[a.id]?.tiers.find(x => x.tier === a.tier); if (t) lvl = Math.max(lvl, Math.ceil(0.8 * t.ilvlMin)); }
  if (it.unique) lvl = Math.max(lvl, data.uniques[it.unique]?.levelReq || 1);
  const red = 1 - pct(itemMods(data, it).reqReduce?.value || 0);
  const req = {}; for (const [k, v] of Object.entries(b.req || {})) req[k] = Math.ceil(v * red);
  return { level: lvl, ...req };
}
/** Can this character wear this item in that slot? -> { ok } | { ok: false, why: 'player text' }
 *  opts: { equip (what is worn now, for a quiver's bow), grip (hands.js gripOf, for dual-wield and Doubled Grasp) } */
export function canEquip(data, ch, it, slot, attrsWithGear = null, opts = {}) {
  const b = data.bases[it.base]; if (!b) return { ok: false, why: 'Unknown item.' };
  const held = b.slot === 'weapon' || b.slot === 'offhand';
  const fits = slot === b.slot || (b.slot === 'ring' && (slot === 'ring1' || slot === 'ring2')) || (b.slot === 'weapon' && slot === 'weapon2') || (b.slot === 'offhand' && slot === 'offhand2')
    || (held && ['weapon', 'offhand', 'weapon2', 'offhand2'].includes(slot));
  if (!fits) return { ok: false, why: "That doesn't go there." };
  const hand = held ? handRefusal(data, it, slot, opts.equip ?? ch.equip ?? {}, opts.grip || gripOf(data, ch)) : null;
  if (hand) return { ok: false, why: hand };
  const r = itemReq(data, it), A = attrsWithGear || ch.attrs || {};
  if ((ch.level || 1) < r.level) return { ok: false, why: `Needs level ${r.level}.` };
  for (const k of ['str', 'agi', 'int', 'spi']) if (r[k] && (A[k] || 0) < r[k]) return { ok: false, why: `Needs ${r[k]} ${ATTR_WORD[k]}.` };
  if (!canUseBase(data, ch, b)) return { ok: false, why: `Your Path can't use ${profWord(b)}.` };
  return { ok: true };
}
const ATTR_WORD = { str: 'Strength', agi: 'Agility', int: 'Intellect', spi: 'Spirit', vit: 'Vitality' };
const profWord = b => ARMOUR_SLOTS.has(b.slot) ? `${b.proficiency} armour` : `${b.kind}s`;

export function itemName(data, it) {
  const b = data.bases[it.base] || { name: it.base };
  if (it.ided === false) return `Unidentified ${b.name}`;
  if (it.unique) return data.uniques[it.unique]?.name || b.name;
  if (it.rarity === 'rare' || it.rarity === 'legendary') return `${it.name || 'Strange'} ${b.name}`;
  if (it.rarity === 'magic') {
    const p = it.affixes.map(a => data.aff[a.id]).find(a => a?.side === 'prefix'), s = it.affixes.map(a => data.aff[a.id]).find(a => a?.side === 'suffix');
    return [p?.name, b.name, s?.name].filter(Boolean).join(' ');
  }
  return b.name;
}
export const identify = it => ({ ...it, ided: true });

/** Gear score (rarity.json gearScore): weighted average of (ilvl + rarity bonus) over the worn slots. */
export function gearScore(data, equip) {
  const g = data.rarity.gearScore || { slotWeights: { weapon: 2, offhand: 1, chest: 1.5, head: 1, hands: 0.75, feet: 0.75, belt: 0.5, neck: 0.75, ring1: 0.5, ring2: 0.5 }, rarityBonus: { normal: 0, magic: 1, rare: 3, unique: 4, legendary: 5 } };
  let s = 0, wsum = 0;
  for (const [slot, w] of Object.entries(g.slotWeights)) {
    wsum += w;
    let it = equip?.[slot];
    if (slot === 'offhand' && !it && equip?.weapon && (data.bases[equip.weapon.base]?.hands === 2)) it = equip.weapon;
    if (it) s += w * (it.ilvl + (g.rarityBonus[it.rarity] || 0));
  }
  return wsum ? Math.round(s / wsum) : 0;
}

/** Every worn item's stats summed (the character sheet adds these to the attribute numbers). */
export function gearTotals(data, equip) {
  const tot = {}, add = (k, v) => { tot[k] = (tot[k] || 0) + v; };
  let armour = 0, block = null;
  void armour;
  for (const slot of WORN) {
    const it = equip?.[slot]; if (!it) continue;
    if (it.dur && it.dur[0] <= 0) continue;                         // broken gear gives nothing until repaired
    for (const [k, m] of Object.entries(itemMods(data, it))) add(k, m.value);
    armour += itemArmour(data, it);
    const b = data.bases[it.base]; if (b?.block && slot === 'offhand') block = { chance: b.block.chance + (tot.blockChance || 0), amount: b.block.amount + (tot.blockAmount || 0) };
  }
  return { mods: tot, armour, block };
}

// ---- the server's light checks (ruling 8) ----------------------------------------------------------------------------
export function checkItem(data, it, { level = 1 } = {}) {
  if (!it || typeof it !== 'object') return { ok: false, why: 'not an item' };
  const b = data.bases[it.base]; if (!b) return { ok: false, why: `unknown base ${it.base}` };
  if (!RARITIES.includes(it.rarity)) return { ok: false, why: 'unknown rarity' };
  if (!(it.ilvl >= 1 && it.ilvl <= (data.rarity.ilvlCap || 65))) return { ok: false, why: `item level ${it.ilvl}` };
  if ((b.dropLevel || 1) > it.ilvl) return { ok: false, why: `${b.id} cannot exist at item level ${it.ilvl}` };
  if (!(it.quality >= 0 && it.quality <= 20)) return { ok: false, why: 'quality' };
  const groups = new Set();
  for (const a of it.affixes || []) {
    const d = data.aff[a.id]; if (!d) return { ok: false, why: `unknown affix ${a.id}` };
    if (!d.kinds?.includes(affixKind(b))) return { ok: false, why: `${a.id} cannot roll on ${b.kind}` };
    if (groups.has(d.group)) return { ok: false, why: 'two affixes of one group' }; groups.add(d.group);
    const t = d.tiers.find(x => x.tier === a.tier);
    if (!t || t.ilvlMin > it.ilvl || a.v < t.min || a.v > t.max) return { ok: false, why: `${a.id} value out of range` };
  }
  if ((it.affixes || []).length > 6) return { ok: false, why: 'too many affixes' };
  if (it.unique) { const u = data.uniques[it.unique]; if (!u || u.base !== it.base) return { ok: false, why: 'unknown unique' }; if (!(u.stats || []).every((s, i) => it.uv?.[i] >= s.min && it.uv?.[i] <= s.max)) return { ok: false, why: 'unique values out of range' }; }
  if (it.power) { const p = data.powers[it.power]; if (!p || (p.ilvlMin || 1) > it.ilvl) return { ok: false, why: 'unknown power' }; }
  void level;
  return { ok: true };
}
