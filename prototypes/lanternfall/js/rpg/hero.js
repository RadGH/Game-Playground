// The persistent character (docs/04): class, level/XP, attributes with soft caps, derived stats, gear,
// currencies, wicks + loadout + unlocks, skill points. Pure. This object IS the save's `hero` (10 §7).
//
// Item shape (docs/08): { uid, base, name, slot: 'weapon'|'lantern'|'coat'|'boots'|'trinket', rarity:
//   'common'|'fine'|'rare'|'relic', ilvl, implicit: { stat: value }, affixes: [{ id, stat, value, text }], price }
export const SLOTS = ['weapon', 'lantern', 'coat', 'boots', 'trinket'];
const round10 = v => Math.round(v / 10) * 10;
export function xpNeed(L) { return L >= 30 ? round10(14280 * Math.pow(1.06, L - 29)) : round10(60 * Math.pow(L, 1.6) + 40 * L); }
export function effAttr(points, cap) { return Math.min(points, cap) + 0.5 * Math.max(0, Math.min(points - cap, cap)) + 0.25 * Math.max(0, points - 2 * cap); }

export function createHero(classId, data, opts = {}) {
  const cls = data.classes.byId[classId]; if (!cls) throw new Error(`unknown class ${classId}`);
  const wicks = cls.startWicks.map((w, i) => ({ id: `w${i + 1}`, flame: w.flame, shape: w.shape, charms: [], dry: !!w.dry }));
  const hero = {
    name: opts.name || 'Wren', class: classId, level: 1, xp: 0, attrs: { ...cls.attrs }, unspent: { attr: 0, skill: 0 }, skills: {},
    wicks, loadout: [0, 1, 2, 3], unlocked: { flames: [...new Set(['ember', ...cls.startWicks.map(w => w.flame)])], shapes: [...new Set(['bolt', ...cls.startWicks.map(w => w.shape)])], charms: [], knots: [], mechanics: [], wickSlots: 1, charmSlots: 0, overcharge: false, gutter: false },
    burn: { flame: {}, shape: {} }, equipped: {}, satchel: [], belt: [null, null, null, null], flask: { charges: 2, max: 2 }, keys: [], scrap: 0, strandDust: 0,
    currency: { pennies: 0, pearls: 0 }, maxHpDebt: 0, stats: {}, kindling: {}, flags: {}, counters: {},
  };
  hero.xpNext = xpNeed(1);
  return hero;
}

/** Derived stats (docs/04 §5). gear: sum of implicit + affix stats over equipped items. */
export function deriveStats(hero, data) {
  const cls = data.classes.byId[hero.class], caps = data.classes.attrCaps;
  const e = k => effAttr(hero.attrs[k] || 0, caps[k]);
  const gear = {}; for (const s of SLOTS) { const it = hero.equipped[s]; if (!it) continue; for (const [k, v] of Object.entries(it.implicit || {})) gear[k] = (gear[k] || 0) + v; for (const a of it.affixes || []) gear[a.stat] = (gear[a.stat] || 0) + a.value; }
  for (const [k, v] of Object.entries(hero.buffs || {})) gear[k] = (gear[k] || 0) + v;
  for (const [k, v] of Object.entries(hero.perm || {})) gear[k] = (gear[k] || 0) + v;
  const L = hero.level;
  const maxHp = ((60 + 8 * e('nerve') + 6 * (L - 1)) * cls.hpMult + (gear.health || 0)) * (1 + (gear.healthPct || 0)) - (hero.maxHpDebt || 0);
  const maxOil = ((75 + 5 * e('draught') + 4 * (L - 1)) * cls.oilMult + (gear.oil || 0)) * (1 + (gear.oilPct || 0));
  const resist = { ...cls.resist }; for (const f of ['ember', 'rime', 'spark', 'bile', 'gleam', 'tide', 'shade']) resist[f] = Math.min(75, (resist[f] || 0) + Math.min(15, 0.5 * e('nerve')) + (gear['resist_' + f] || 0) + (gear.resistAll || 0));
  const s = {
    level: L, maxHp: Math.round(maxHp), maxOil: Math.round(maxOil), oilRegen: (3.0 + 0.1 * e('draught')) * (1 + (gear.oilRegenPct || 0)),
    armour: ((cls.armour || 0) + (gear.armour || 0)) * (1 + (gear.armourPct || 0)), resist, critChance: 0.05 + 0.003 * e('knack') + (gear.critChance || 0), critMult: 1.5 + 0.01 * e('might') + (gear.critMult || 0),
    meleeMult: 1 + 0.02 * e('might') + (gear.meleePct || 0), spellPower: 0.02 * e('wick') + (gear.wickPct || 0), statusPotency: 1 + 0.01 * e('wick'),
    gearSpellPct: gear.spellPct || 0, flamePct: Object.fromEntries(Object.entries(gear).filter(([k]) => k.startsWith('flame_')).map(([k, v]) => [k.slice(6), v])),
    haste: gear.castSpeed || 0, lightRadius: (hero.equipped.lantern?.lantern?.radius ?? 64) * (1 + (gear.lightRadiusPct || 0)) + (gear.lightRadius || 0), darkBurn: (hero.equipped.lantern?.lantern?.darkBurn ?? 2.5) * Math.max(0.7, 1 - 0.01 * e('draught')), lootFind: 0.01 * e('knack') + (gear.lootFind || 0),
    oilCostPct: gear.oilCostPct || 0, oilOnKill: gear.oilOnKill || 0, swimSpeed: gear.swimSpeed || 0, ropeClimb: gear.ropeClimb || 0, jumpApex: gear.jumpApex || 0, penniesFind: gear.penniesFind || 0, xpPct: gear.xpPct || 0, breath: 12 + (gear.breath || 0), chillDur: gear.chillDur || 0,
    poise: 30 + 2 * e('nerve'), buildSpeed: (1 + 0.01 * e('knack') + (gear.buildSpeedPct || 0)) * (cls.movement?.buildMult || 1), oilOnHit: cls.oilOnHit ?? 1.5, lifeSteal: gear.lifeSteal || 0,
    walk: cls.walk * (1 + (gear.moveSpeed || 0)), run: cls.run * (1 + (gear.moveSpeed || 0)),
  };
  hero.stats = s; return s;
}
/** Push derived stats onto the player body (keeps hp/oil ratios). */
export function applyStats(hero, p, data) {
  const s = deriveStats(hero, data);
  const hpF = p.maxHp ? p.hp / p.maxHp : 1, oilF = p.maxOil ? p.oil / p.maxOil : 1;
  p.maxHp = s.maxHp; p.maxOil = s.maxOil; p.hp = Math.min(p.maxHp, Math.round(hpF * p.maxHp)); p.oil = Math.min(p.maxOil, oilF * p.maxOil);
  p.oilRegen = s.oilRegen; p.armour = s.armour; p.resist = s.resist; p.stats = s; p.crit = s.critChance; p.critMult = s.critMult; p.name = hero.name;
  return s;
}
/** XP with the grey/above rules is decided by the caller; this adds and levels up. Returns levels gained. */
export function grantXp(hero, amount, data, bus) {
  if (hero.level >= 30 && !hero.endless) { hero.bankedXp = (hero.bankedXp || 0) + amount; return 0; }
  hero.xp += amount; let gained = 0;
  while (hero.xp >= hero.xpNext && (hero.level < 30 || hero.endless)) {
    hero.xp -= hero.xpNext; hero.level++; gained++;
    hero.unspent.attr += hero.level > 30 ? 2 : 3;
    if (hero.level <= 30) hero.unspent.skill += 1; else if ((hero.level - 30) % 3 === 0) hero.unspent.skill += 1;
    hero.xpNext = xpNeed(hero.level);
    bus?.emit('levelup', { level: hero.level });
  }
  return gained;
}
/** XP for a kill (docs/04 §17.2). */
export function killXp(def, areaLevel, heroLevel, { trap = false, elite = false } = {}) {
  const TIER = { fodder: 2, standard: 5, heavy: 12, miniboss: 60, boss: 200 };
  let xp = (TIER[def.tier] ?? def.xp ?? 5) * areaLevel * (elite ? 3 : 1);
  const d = heroLevel - areaLevel; if (d >= 8) xp = 0; else if (d >= 5) xp *= 0.25; if (d < 0) xp *= 1 + Math.min(0.5, -d * 0.1);
  if (trap) xp *= 1.5;
  return Math.round(xp);
}
export function spendAttr(hero, key, data) { if (hero.unspent.attr <= 0) return false; hero.attrs[key]++; hero.unspent.attr--; deriveStats(hero, data); return true; }
