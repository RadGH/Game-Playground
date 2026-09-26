// Items (docs/08 §2-7, §10-11, §15): rolling gear and relics, names, value, a rough "is this better"
// score, compare, equip/unequip (5 slots, off-class weapons from 04 §3), plain-language tooltips, the
// satchel (20 slots, stacks, junk, key ring, scrap sack) and the purse (pennies / pearls / marks). Pure.
//
// A rolled gear item (the shape hero.js deriveStats reads):
//   { uid, base, type: 'gear'|'relic', slot, rarity, ilvl, name, temper,
//     core: { armour, health, ... }   base stats, already scaled by ilvl (tempering adds +8% each level)
//     fixed: { stat: v }              the base's implicit, never scaled
//     implicit: { stat: v }           core × temper + fixed  <- deriveStats sums this
//     affixes: [{ id, stat, value, text, flame? }]            <- and this
//     weapon?: { dmg: [lo, hi], swing, reach, kb }  lantern?: { radius, darkBurn }
//     powers: [{ id, value?, text }], class?, family?, anyClass?, value }
// Stackables in the satchel: { uid, base, type, name, qty, junk? }.
import { SLOTS, deriveStats } from './hero.js';
import { fmt, sign, range } from '../../../../shared/format.js';

let UID = 0;
const econ = data => data.items.economy;
const defOf = (data, id) => (typeof id === 'string' ? data.items.byId[id] : id);
export const rarityDef = (data, id) => data.items.rarities.find(r => r.id === id) || data.items.rarities[0];
export const RARITY_ORDER = ['common', 'fine', 'rare', 'relic'];

/** Item-level scale (08 §4.2): 1 + 0.11 × (ilvl − 1). */
export function scaleOf(data, ilvl) { return 1 + econ(data).ilvlScale * (Math.max(1, ilvl) - 1); }
/** Which act an item level belongs to (09 §7 area levels 1-5, 5-10 … 25-30). */
export function actOfLevel(data, lvl) { const m = econ(data).actMaxLevel; for (let i = 0; i < m.length; i++) if (lvl <= m[i]) return i + 1; return m.length; }
/** Shop / drop item level: the level clamped to the act's highest area level (08 §4.2). */
export function shopIlvl(data, level, act) { const m = econ(data).actMaxLevel; return Math.max(1, Math.min(level, m[Math.min(m.length, Math.max(1, act)) - 1])); }
function newUid(rng) { return `it${(++UID).toString(36)}${rng ? Math.floor(rng.next() * 46656).toString(36) : ''}`; }
const roundTo = (v, step) => Math.round(v / step) * step;
const clean = v => Math.round(v * 1000) / 1000;
/** Whole numbers for flat stats, 3 decimals (= one decimal of a percent) for fractions. */
const roundStat = (v, lo) => (Number.isInteger(lo) && Math.abs(lo) >= 1 ? Math.round(v) : clean(v));

// ------------------------------------------------------------------ rolling
/**
 * Roll one item of a base (08 §4-7). base: id or def; rarity: common|fine|rare (relics roll their own);
 * act: the act the drop is made in (gates flame affixes; default: the act of the ilvl).
 */
export function rollItem(data, { base, ilvl = 1, rarity = 'common', rng, act, temper = 0 } = {}) {
  const def = defOf(data, base); if (!def) throw new Error(`unknown item ${base}`);
  if (!rng) throw new Error('rollItem needs an rng');
  const s = scaleOf(data, ilvl);
  const item = { uid: newUid(rng), base: def.id, type: def.type === 'relic' ? 'relic' : 'gear', slot: def.slot, rarity: def.type === 'relic' ? 'relic' : rarity, ilvl, temper, name: '',
    core: {}, fixed: { ...(def.implicit || {}) }, implicit: {}, affixes: [], powers: [...(def.powers || []), ...(def.power ? [{ ...def.power, relic: true }] : [])] };
  if (def.class) item.class = def.class; if (def.family) item.family = def.family; if (def.anyClass) item.anyClass = true;
  for (const [k, v] of Object.entries(def.core || {})) item.core[k] = roundStat(v * s, v);
  for (const [k, [lo, hi]] of Object.entries(def.stats || {})) item.core[k] = roundStat((lo + rng.next() * (hi - lo)) * s, lo); // relic stat lines scale
  if (def.weapon) item.weaponCore = { ...def.weapon, dmg: [Math.round(def.weapon.dmg[0] * s), Math.round(def.weapon.dmg[1] * s)] };
  if (def.lantern) item.lantern = { ...def.lantern };
  if (item.type === 'gear') item.affixes = rollAffixes(data, def.slot, rarityDef(data, rarity).affixes || 0, { ilvl, rng, act: act ?? actOfLevel(data, ilvl) });
  item.name = itemName(data, item, rng);
  return refreshItem(data, item);
}

/** Recompute implicit / weapon / value after tempering (08 §17: +8% of base stats per level). */
export function refreshItem(data, item) {
  const k = 1 + econ(data).temperStatBonus * (item.temper || 0);
  const imp = { ...(item.fixed || {}) };
  for (const [s, v] of Object.entries(item.core || {})) imp[s] = clean((imp[s] || 0) + (Number.isInteger(v) ? Math.round(v * k) : v * k));
  item.implicit = imp;
  if (item.weaponCore) item.weapon = { ...item.weaponCore, dmg: item.weaponCore.dmg.map(d => Math.round(d * k)) };
  item.value = Math.round(baseValue(data, item));
  return item;
}

/** Pick the affixes for a slot (08 §6.2): fine = 1 (prefix or suffix), rare = 1 prefix + 1 suffix, else 2 prefixes. */
export function rollAffixes(data, slot, count, { ilvl, rng, act }) {
  if (!count) return [];
  const pool = data.affixes.list.filter(a => a.slots.includes(slot));
  const pre = pool.filter(a => a.kind === 'prefix'), suf = pool.filter(a => a.kind === 'suffix');
  const picks = [];
  if (count === 1) picks.push(rng.weighted(pool, 'weight'));
  else if (pre.length && suf.length) { picks.push(rng.weighted(pre, 'weight'), rng.weighted(suf, 'weight')); }
  else { const a = rng.weighted(pre, 'weight'); picks.push(a); const rest = pre.filter(x => x.id !== a.id); if (rest.length) picks.push(rng.weighted(rest, 'weight')); }
  return picks.map(a => rollAffix(data, a, { ilvl, rng, act })).filter(Boolean);
}
export function rollAffix(data, a, { ilvl, rng, act }) {
  let flame = null;
  if (a.stat.includes('{flame}')) {
    const open = Object.entries(data.affixes.flameGate).filter(([, g]) => g <= act).map(([f]) => f);
    if (!open.length) return null; flame = rng.pick(open);
  }
  const t = (Math.max(1, ilvl) - 1) / 29, spread = econ(data).rollSpread;
  let v = (a.lo + (a.hi - a.lo) * t) * (1 + (rng.next() * 2 - 1) * spread);
  const step = a.step || (a.unit === 'pct' ? 0.001 : 1);
  v = clean(roundTo(v, step)); if (Math.abs(v) < step) v = step * Math.sign(a.lo);
  const out = { id: a.id, stat: flame ? a.stat.replace('{flame}', flame) : a.stat, value: v, kind: a.kind, text: '' };
  if (flame) out.flame = flame;
  out.text = affixText(data, a, v, flame);
  return out;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function affixText(data, a, v, flame) {
  const val = a.unit === 'pct' ? `${sign(v * 100, { decimals: 1 })}%` : sign(v, { decimals: 1 });
  return a.text.replace('{v}', val).replace('{Flame}', flame ? (data.flames?.byId?.[flame]?.name || cap(flame)) : '');
}
const affixPart = (data, af) => { const d = data.affixes.byId[af.id]; return af.flame && d.names ? d.names[af.flame] : d.name; };

// ------------------------------------------------------------------ names and value
/** Name rule (08 §6.3). With an rng, one rare in four takes a keepsake noun instead of the base noun. */
export function itemName(data, item, rng = null) {
  const def = defOf(data, item.base); if (!def) return item.name || item.base;
  if (item.type === 'relic' || !item.affixes?.length) return def.name;
  const pre = item.affixes.filter(a => a.kind === 'prefix').map(a => affixPart(data, a)), suf = item.affixes.filter(a => a.kind === 'suffix').map(a => affixPart(data, a));
  if (item.affixes.length === 1) return pre.length ? `${pre[0]} ${def.name}` : `${def.name} ${suf[0]}`;
  const noun = rng && rng.chance(econ(data).rareNameChance) ? rng.pick(data.items.rareNouns) : def.short || def.name;
  return [...pre, noun, ...suf].join(' ');
}
/** Name with the temper mark ("Guild Boots +2"). */
export const displayName = item => (item.name || item.base) + (item.temper ? ` +${item.temper}` : '');

/** 08 §15 baseValue: gear by slot/ilvl/rarity/affixes/temper; everything else its listed price. */
export function baseValue(data, item) {
  const def = defOf(data, item.base || item.id) || {}; const E = econ(data);
  const type = item.type || def.type;
  if (type === 'gear' || type === 'relic') return E.slotBase[item.slot || def.slot] * scaleOf(data, item.ilvl || 1) * rarityDef(data, item.rarity || 'common').valueMult * (1 + E.affixValueBonus * (item.affixes?.length || 0)) * (1 + E.temperValueBonus * (item.temper || 0));
  if (type === 'material') return (def.sell || 0) * E.materialBuyMult;
  if (type === 'quest') return (def.sellPrice || 0) / E.sellShare;
  if (type === 'sealed') { const g = data.shops?.byId?.shop_gamble?.sealed; return g ? g.prices[def.gambleSlot] * actOfLevel(data, item.seal?.ilvl || 1) : 50; }
  if (type === 'key' || type === 'tool') return 0;
  return def.price || 0;
}

// ------------------------------------------------------------------ stats, score, compare
const STAT = {
  health: ['max health', 'flat'], healthPct: ['max health', 'pct'], armour: ['armour', 'flat'], armourPct: ['armour', 'pct'], oil: ['max oil', 'flat'], oilPct: ['max oil', 'pct'],
  oilRegenPct: ['oil regen', 'pct'], oilCostPct: ['oil cost of your wicks', 'pct', -1], oilOnKill: ['oil on kill', 'flat'], wickPct: ['Wick power', 'pct'], spellPct: ['spell damage', 'pct'],
  meleePct: ['melee damage', 'pct'], critChance: ['crit chance', 'pct'], critMult: ['crit damage', 'pct'], castSpeed: ['cast speed', 'pct'], moveSpeed: ['move speed', 'pct'],
  lightRadius: ['light radius (cells)', 'flat'], lightRadiusPct: ['light radius', 'pct'], lootFind: ['loot find', 'pct'], lifeSteal: ['life steal', 'pct'], resistAll: ['all resistances', 'pts'],
  buildSpeedPct: ['build speed', 'pct'], swimSpeed: ['swim speed', 'pct'], ropeClimb: ['rope climb speed', 'pct'], jumpApex: ['jump height (cells)', 'flat'], penniesFind: ['pennies found', 'pct'],
  xpPct: ['experience', 'pct'], breath: ['s of breath', 'flat'], chillDur: ['s on the chill you apply', 'flat'],
  dmgAvg: ['average damage', 'flat'], swing: ['swing time (ms)', 'flat', -1], reach: ['reach (cells)', 'flat'], radius: ['light radius (cells)', 'flat'], darkBurn: ['dark burn (oil/s)', 'flat', -1],
};
function statInfo(data, k) {
  if (STAT[k]) return STAT[k];
  if (k.startsWith('flame_')) { const f = k.slice(6); return [`${data?.flames?.byId?.[f]?.name || cap(f)} damage`, 'pct']; }
  if (k.startsWith('resist_')) { const f = k.slice(7); return [`${data?.flames?.byId?.[f]?.name || cap(f)} resistance`, 'pts']; }
  return [k, 'flat'];
}
/** "+5% Wick power", "+12 max health", "−3% oil cost of your wicks". */
export function statLine(data, k, v) {
  const [label, unit] = statInfo(data, k);
  if (unit === 'pct') return `${sign(v * 100, { decimals: 1 })}% ${label}`;
  if (unit === 'pts') return `${sign(v, { decimals: 1 })}% ${label}`;
  return label.startsWith('s ') ? `${sign(v, { decimals: 1 })}${label}` : `${sign(v, { decimals: 1 })} ${label}`;
}
/** Every number an item gives, flattened (implicit + affixes + weapon/lantern numbers). */
export function itemStats(item) {
  const s = {}; if (!item) return s;
  for (const [k, v] of Object.entries(item.implicit || {})) s[k] = (s[k] || 0) + v;
  for (const a of item.affixes || []) s[a.stat] = (s[a.stat] || 0) + a.value;
  if (item.weapon) { s.dmgAvg = (item.weapon.dmg[0] + item.weapon.dmg[1]) / 2; s.swing = item.weapon.swing; s.reach = item.weapon.reach; }
  if (item.lantern) { s.radius = item.lantern.radius; s.darkBurn = item.lantern.darkBurn; }
  for (const k of Object.keys(s)) s[k] = clean(s[k]);
  return s;
}
// Rough worth of one unit of each stat, so a single number can say "better" (tooltips, auto-sort, bots).
const WEIGHT = { health: 0.5, healthPct: 60, armour: 1, armourPct: 40, oil: 0.6, oilPct: 30, oilRegenPct: 40, oilCostPct: -150, oilOnKill: 4, wickPct: 150, spellPct: 120, meleePct: 120,
  critChance: 200, critMult: 50, castSpeed: 120, moveSpeed: 100, lightRadius: 0.3, lightRadiusPct: 40, lootFind: 50, lifeSteal: 200, resistAll: 2, buildSpeedPct: 20, swimSpeed: 15,
  ropeClimb: 10, jumpApex: 2, penniesFind: 20, xpPct: 60, breath: 1, chillDur: 5 };
/** One number: higher is better. Weapons count damage per second; lanterns count radius, minus dark burn. */
export function itemScore(item) {
  if (!item) return 0; const s = itemStats(item); let sc = 0;
  for (const [k, v] of Object.entries(s)) { if (k.startsWith('flame_')) sc += v * 60; else if (k.startsWith('resist_')) sc += v * 0.7; else if (WEIGHT[k] != null) sc += v * WEIGHT[k]; }
  if (item.weapon) sc += s.dmgAvg * 1000 / item.weapon.swing * 0.6 + item.weapon.reach * 0.2;
  if (item.lantern) sc += item.lantern.radius * 0.3 - item.lantern.darkBurn * 5;
  sc += (item.powers || []).reduce((t, p) => t + (p.relic ? 25 : 5), 0);
  return Math.round(sc * 10) / 10;
}
/** Candidate a against current b (b may be null): the score gap and one line per stat either has. */
export function compare(a, b, data = null) {
  const sa = itemStats(a), sb = itemStats(b), keys = [...new Set([...Object.keys(sa), ...Object.keys(sb)])];
  const lines = keys.map(k => { const av = sa[k] || 0, bv = sb[k] || 0, d = clean(av - bv), good = (STAT[k]?.[2] || (k === 'oilCostPct' ? -1 : 1)) * d; return { stat: k, label: statInfo(data, k)[0], a: av, b: bv, diff: d, better: good > 0 ? 1 : good < 0 ? -1 : 0 }; }).filter(l => l.diff !== 0 || l.a !== 0);
  const A = itemScore(a), B = itemScore(b);
  return { score: { a: A, b: B, diff: Math.round((A - B) * 10) / 10 }, lines, better: A > B ? 1 : A < B ? -1 : 0 };
}

// ------------------------------------------------------------------ equip
/** 04 §3: a weapon 08 files under another class deals −20% in your hands (relics with anyClass excepted). */
export function isOffClass(hero, item) { return !!(item && item.slot === 'weapon' && !item.anyClass && item.class && item.class !== hero.class); }
export function weaponMult(hero, item, data) { return isOffClass(hero, item) ? econ(data).offClassMult : 1; }
/** The equipped weapon as the melee code's `set.weapon` block (dmg already × the off-class rule). */
export function meleeWeapon(hero, data) {
  const w = hero.equipped?.weapon; if (!w?.weapon) return null; const m = weaponMult(hero, w, data);
  return { id: w.base, name: displayName(w), dmg: w.weapon.dmg.map(d => d * m), kb: w.weapon.kb, reach: w.weapon.reach, swing: w.weapon.swing, offClass: m !== 1 };
}
/** Put an item on. It leaves the satchel; whatever was in the slot goes back into the satchel. */
export function equip(hero, item, data = null) {
  ensureInventory(hero, data);
  if (!item || !SLOTS.includes(item.slot) || !(item.type === 'gear' || item.type === 'relic')) return { ok: false, reason: 'That cannot be worn.' };
  const idx = hero.satchel.findIndex(x => x.uid === item.uid), old = hero.equipped[item.slot] || null;
  if (old && idx < 0 && satchelFree(hero) < 1) return { ok: false, reason: 'Your satchel is full.' };
  if (idx >= 0) hero.satchel.splice(idx, 1, ...(old ? [old] : [])); else if (old) hero.satchel.push(old);
  hero.equipped[item.slot] = item; item.junk = false; item.wasWorn = true; if (old) old.junk = false;
  if (data?.classes) deriveStats(hero, data);
  return { ok: true, old, offClass: isOffClass(hero, item) };
}
export function unequip(hero, slot, data = null) {
  ensureInventory(hero, data); const old = hero.equipped[slot]; if (!old) return { ok: false, reason: 'Nothing is worn there.' };
  if (satchelFree(hero) < 1) return { ok: false, reason: 'Your satchel is full.' };
  hero.satchel.push(old); delete hero.equipped[slot];
  if (data?.classes) deriveStats(hero, data);
  return { ok: true, item: old };
}
/** A new hero's class weapon + lantern (classes.json weapon/lantern), common, item level 1, worn. */
export function giveStartingGear(hero, data, rng) {
  const cls = data.classes.byId[hero.class];
  for (const id of [cls.weapon, cls.lantern]) if (id && data.items.byId[id]) equip(hero, rollItem(data, { base: id, ilvl: 1, rarity: 'common', rng, act: 1 }), data);
  return hero.equipped;
}

// ------------------------------------------------------------------ tooltip
const COL = { common: '#9aa3ad', fine: '#8fc7ff', rare: '#ffb347', relic: '#c58cff', affix: '#8fc7ff', implicit: '#d8d2c4', power: '#e0c890', warn: '#ff7a6b', dim: '#8a8f99', better: '#8fe39a', worse: '#ff7a6b' };
const SLOT_NAME = { weapon: 'weapon', lantern: 'lantern', coat: 'coat', boots: 'boots', trinket: 'trinket' };
/**
 * Plain-language tooltip: [{ text, color, kind }]. opts: { hero, compareTo, sell } (sell = the sell
 * price a shop quoted; default is the plain 25%).
 */
export function tooltipLines(item, data, opts = {}) {
  const L = [], add = (text, color = COL.implicit, kind = 'line') => L.push({ text, color, kind });
  const def = defOf(data, item.base || item.id) || item;
  if (item.type === 'gear' || item.type === 'relic') {
    add(displayName(item), rarityDef(data, item.rarity).color, 'name');
    add(`${rarityDef(data, item.rarity).name} ${SLOT_NAME[item.slot]} · item level ${item.ilvl}`, COL.dim, 'sub');
    if (item.weapon) { add(`Damage ${range(item.weapon.dmg[0], item.weapon.dmg[1])}`); add(`Swing ${fmt(item.weapon.swing / 1000)} s · reach ${fmt(item.weapon.reach)} cells · knockback ${fmt(item.weapon.kb)}`, COL.dim); }
    if (item.lantern) { add(`Light radius ${fmt(item.lantern.radius)} cells`); add(`Burns ${fmt(item.lantern.darkBurn)} oil a second in the dark`, COL.dim); }
    for (const [k, v] of Object.entries(item.implicit || {})) add(statLine(data, k, v), COL.implicit, 'implicit');
    for (const a of item.affixes || []) add(a.text, COL.affix, 'affix');
    for (const p of item.powers || []) add(p.text, p.relic ? COL.relic : COL.power, 'power');
    if (item.temper) add(`Tempered +${item.temper}: base stats +${fmt(econ(data).temperStatBonus * 100 * item.temper)}%`, COL.dim);
    if (opts.hero && isOffClass(opts.hero, item)) add(`Made for another class: deals ${fmt((1 - econ(data).offClassMult) * 100)}% less damage in your hands.`, COL.warn, 'warn');
    if (opts.compareTo !== undefined) {
      const c = compare(item, opts.compareTo, data);
      add(opts.compareTo ? `Against what you wear: ${c.better > 0 ? 'better' : c.better < 0 ? 'worse' : 'about the same'}` : 'Nothing worn there', c.better > 0 ? COL.better : c.better < 0 ? COL.worse : COL.dim, 'compare');
      for (const l of c.lines) if (l.diff) add(`${l.diff > 0 ? '+' : '−'}${fmt(Math.abs(STAT[l.stat]?.[1] === 'pct' || l.stat.startsWith('flame_') ? l.diff * 100 : l.diff))}${STAT[l.stat]?.[1] === 'pct' || l.stat.startsWith('flame_') ? '%' : ''} ${l.label}`, l.better > 0 ? COL.better : COL.worse, 'compare');
    }
    if (item.junk) add('Marked as junk', COL.dim);
  } else {
    add(def.name || item.name, COL.implicit, 'name');
    if (def.text) add(def.text, COL.dim);
    if (item.type === 'sealed' && item.seal) add(`It glows ${item.seal.glow}.${item.seal.moth ? ' A moth sits on it.' : ''}`, item.seal.glowColor || COL.dim);
    if (def.stack > 1) add(`${fmt(item.qty || 1)} of ${fmt(def.stack)} in this stack`, COL.dim);
    if (def.type === 'key' || def.type === 'quest') add('Kept on your key ring. It cannot be sold or dropped.', COL.dim);
  }
  const sell = opts.sell ?? Math.round(baseValue(data, item) * econ(data).sellShare) * (item.qty || 1);
  if (sell > 0 && def.type !== 'key') add(`Sells for ${fmt(sell)} pennies`, COL.dim, 'value');
  return L;
}

// ------------------------------------------------------------------ satchel + purse (08 §2, §13)
/** Fill in any inventory fields an older hero object lacks (safe to run more than once). */
export function ensureInventory(hero, data = null) {
  hero.satchel ||= []; hero.equipped ||= {}; hero.keys ||= []; hero.currency ||= { pennies: 0, pearls: 0 };
  hero.currency.pennies ??= 0; hero.currency.pearls ??= 0; hero.currency.marks ??= 0;
  hero.scrap ??= 0; hero.strandDust ??= 0; hero.flags ||= {}; hero.relicsFound ||= [];
  hero.satchelSlots ??= data?.items ? econ(data).satchel.start : 20;
  return hero;
}
export const satchelFree = hero => (hero.satchelSlots ?? 20) - hero.satchel.length;
export const stackSize = (data, id) => { const d = defOf(data, id); return d?.stack || 1; };
export const countOf = (hero, id) => hero.satchel.reduce((t, x) => t + (x.base === id ? (x.qty || 1) : 0), 0);
/** Does the hero already know this strand (hero.unlocked.flames/shapes/charms)? */
export function knowsStrand(hero, def) { const u = hero?.unlocked || {}; return !!(def && (u[def.part + 's'] || []).includes(def.ref)); }
/** Does the hero carry or wear an item of this base? */
export function ownsItem(hero, id) { return hero.satchel?.some(x => x.base === id) || Object.values(hero.equipped || {}).some(x => x?.base === id) || (hero.keys || []).includes(id); }
/** How many of `id` would fit right now. */
export function roomFor(hero, data, id) {
  const def = defOf(data, id); if (!def) return 0;
  if (def.type === 'key' || def.type === 'quest' || def.type === 'material') return Infinity;
  const st = stackSize(data, id); if (st <= 1) return satchelFree(hero);
  return hero.satchel.reduce((t, x) => t + (x.base === id ? st - (x.qty || 1) : 0), 0) + satchelFree(hero) * st;
}
/**
 * Add to the satchel. `thing` is a rolled item (gear/relic/sealed instance) or a base id with qty.
 * Scrap and dust go to their counters (scrap overflow into the Scrap Sack), keys and quest items to the
 * key ring. Returns { added, left, where }.
 */
export function addToSatchel(hero, data, thing, qty = 1) {
  ensureInventory(hero, data); const E = econ(data);
  if (typeof thing === 'object' && thing.uid && !thing.qty) {
    if (satchelFree(hero) < 1) return { added: 0, left: 1, where: 'full' };
    hero.satchel.push(thing); if (thing.type === 'relic' && !hero.relicsFound.includes(thing.base)) hero.relicsFound.push(thing.base);
    return { added: 1, left: 0, where: 'satchel' };
  }
  const id = typeof thing === 'string' ? thing : thing.base; if (typeof thing === 'object') qty = thing.qty;
  const def = defOf(data, id); if (!def) throw new Error(`unknown item ${id}`);
  if (id === 'scrap') { const room = E.caps.scrap + E.scrapSack - hero.scrap, n = Math.min(qty, room); hero.scrap += n; return { added: n, left: qty - n, where: 'scrap' }; }
  if (id === 'strand_dust') { const n = Math.min(qty, E.caps.strandDust - hero.strandDust); hero.strandDust += n; return { added: n, left: qty - n, where: 'dust' }; }
  if (def.type === 'key' || def.type === 'quest') { for (let k = 0; k < qty; k++) hero.keys.push(id); return { added: qty, left: 0, where: 'keys' }; }
  const st = stackSize(data, id); let left = qty;
  if (st > 1) for (const x of hero.satchel) { if (!left) break; if (x.base === id && x.qty < st) { const n = Math.min(st - x.qty, left); x.qty += n; left -= n; } }
  while (left > 0 && satchelFree(hero) > 0) { const n = Math.min(st, left); hero.satchel.push({ uid: newUid(), base: id, type: def.type, name: def.name, qty: n }); left -= n; }
  return { added: qty - left, left, where: left ? 'full' : 'satchel' };
}
/** Take `qty` from one satchel entry (by uid); removes it when empty. Returns what was taken. */
export function removeFromSatchel(hero, uid, qty = null) {
  const i = hero.satchel.findIndex(x => x.uid === uid); if (i < 0) return null; const x = hero.satchel[i];
  if (x.qty && qty != null && qty < x.qty) { x.qty -= qty; return { ...x, qty }; }
  hero.satchel.splice(i, 1); return x;
}
/** Use up `qty` of a base id across stacks (smallest first). Returns how many were taken. */
export function takeItem(hero, id, qty = 1) {
  let left = qty; const stacks = hero.satchel.filter(x => x.base === id).sort((a, b) => (a.qty || 1) - (b.qty || 1));
  for (const x of stacks) { if (!left) break; const n = Math.min(left, x.qty || 1); removeFromSatchel(hero, x.uid, n); left -= n; }
  return qty - left;
}
const SORT = { gear: 0, relic: 0, consumable: 1, meal: 1, strand: 2, sealed: 3, material: 4, key: 5, quest: 5 };
/** 08 §2.4 Sort: gear (slot order) → consumables → strands → (sealed) → scrap → keys and quest items. */
export function sortSatchel(hero) {
  hero.satchel.sort((a, b) => (SORT[a.type] ?? 9) - (SORT[b.type] ?? 9) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || String(a.name).localeCompare(String(b.name)));
  return hero.satchel;
}
export function setJunk(hero, uid, on = true) { const x = hero.satchel.find(y => y.uid === uid); if (x) x.junk = !!on; return !!x; }
/** 08 §2.4 autoJunkCommon: flag every common never equipped. */
export function autoJunkCommons(hero) { let n = 0; for (const x of hero.satchel) if (x.type === 'gear' && x.rarity === 'common' && !x.wasWorn && !x.junk) { x.junk = true; n++; } return n; }

const CUR_CAP = { pennies: 'pennies', pearls: 'pearls', marks: 'marks' };
/** Add currency, capped (08 §13). Returns what was actually added. */
export function giveCurrency(hero, data, cur, n) {
  ensureInventory(hero, data); if (!CUR_CAP[cur]) throw new Error(`unknown currency ${cur}`);
  const capV = data?.items ? econ(data).caps[cur] : Infinity, before = hero.currency[cur] || 0;
  hero.currency[cur] = Math.min(capV, before + Math.max(0, Math.round(n))); return hero.currency[cur] - before;
}
export const canAfford = (hero, cur, n) => (hero.currency?.[cur] || 0) >= n;
/** Spend if the purse holds enough; returns false (and spends nothing) otherwise. */
export function spendCurrency(hero, cur, n) { if (!canAfford(hero, cur, n)) return false; hero.currency[cur] -= n; return true; }

// ------------------------------------------------------------------ the Guild flask (08 §8)
export function flaskOf(hero, data) { const t = data.items.byId.guild_flask; hero.flask ||= { charges: t.charges, max: t.charges }; return hero.flask; }
/** Touching a lamp-post: every charge back. The only refill there is. */
export function refillFlask(hero, data) { const f = flaskOf(hero, data); f.charges = f.max; return f; }
/** Pour one charge into the lantern (the 0.4 s pour is the caller's). Returns the oil added. */
export function drinkFlask(hero, player, data) {
  const f = flaskOf(hero, data); if (f.charges <= 0) return 0; f.charges--;
  const add = Math.min(data.items.byId.guild_flask.oil, (player.maxOil || 0) - (player.oil || 0)); player.oil = (player.oil || 0) + Math.max(0, add); return Math.max(0, add);
}
