// Farhold — the effect registry: every affix on every item, doing something.
//
// Emberveil has a 359-id registry, but it is written for a turn-based party fight: its hooks are
// `roundStart`, `pickTargets`, `per_source`, and its world is two arrays of actors. None of that
// exists here — Farhold is one person and their pets in a field, in real time — so porting it would
// have produced a file full of hooks nobody could ever call. This is the same *ids* rebuilt around
// a clock instead of a turn order, which is the honest translation.
//
// Every one of the 63 affix stats that items.json can roll is in this file, plus the 24 legendary
// powers. Nothing an item can carry is inert any more.
//
//   import { Effects } from './effects.js';
//   const fx = new Effects();
//   fx.derive(player, d);                      // while stats are being worked out
//   const mult = fx.dmgOut({ self: player, target: enemy, element: 'fire', crit });
//   fx.onHit({ self: player, target: enemy, amount, crit });
//
// Pure: no DOM, no Three.js, so the node tests drive the whole registry.

/** Anything that is not `physical` counts as magic for the resist/reduction affixes. */
export const isMagic = element => !!element && element !== 'physical';

const pct = v => `${Math.round(v * 100)}%`;
/**
 * `initiative` rolls 1-3 in items.json, where it meant turn order. As attack speed, 1-3% would be
 * beneath noticing, so a point is worth this much — 4-12% on a roll, which is a real property.
 */
export const INITIATIVE_PER_POINT = 4;
const pctOf = v => `${Math.round(v)}%`;
const n1 = v => (Number.isInteger(v) ? v : Math.round(v * 10) / 10);

/**
 * Plain derived stats: an affix that only ever adds a number to the sheet. The value goes straight
 * into `derived[field]`. Keeping these as data (rather than a `derive` function each) means the
 * character sheet can list them without calling anything.
 */
export const STAT_FIELDS = {
  hp: 'maxHp', mp: 'maxMp', armor: 'armor', magicResist: 'magicResist', dmg: 'damageFlat',
  critChance: 'critChance', critDamage: 'critDamage', dodge: 'dodge', hit: 'hit', hpRegen: 'hpRegen',
  mana_regen: 'mpRegen', str: 'str', dex: 'dex', int: 'int', con: 'con', spellPower: 'spellPower',
  lifeSteal: 'lifeSteal', magicFind: 'magicFind', goldFind: 'goldFind', xpFind: 'xpFind',
  block_chance: 'blockChance', block_power: 'blockPower',
  // round 4: these three were carried and did nothing
  barrier: 'barrier', barrierRegen: 'barrierRegen', cooldownReduction: 'cooldownReduction',
  manaSteal: 'manaSteal',
  // "initiative" is turn order in Emberveil. In real time the same idea is how fast you act, so it
  // buys attack speed — the stat it was always standing in for.
  initiative: 'haste',
};

export const EFFECTS = {};
function def(id, desc, spec = {}) {
  EFFECTS[id] = { id, desc: typeof desc === 'function' ? desc : () => desc, ...spec };
  return EFFECTS[id];
}

// Every plain stat gets an entry too, so "what does this affix do" has one answer for every id.
const STAT_DESC = {
  hp: v => `+${n1(v)} health`, mp: v => `+${n1(v)} mana`, armor: v => `+${n1(v)} armour`,
  magicResist: v => `+${n1(v)} magic resistance`, dmg: v => `+${n1(v)} damage`,
  critChance: v => `+${n1(v)}% critical chance`, critDamage: v => `+${n1(v)}% critical damage`,
  dodge: v => `+${n1(v)}% dodge`, hpRegen: v => `+${n1(v)} health a second`,
  hit: v => `+${n1(v)}% accuracy — it cancels this much of the target's dodge`,
  mana_regen: v => `+${n1(v)} mana a second`, str: v => `+${n1(v)} strength`, dex: v => `+${n1(v)} dexterity`,
  int: v => `+${n1(v)} intellect`, con: v => `+${n1(v)} constitution`, spellPower: v => `+${n1(v)} spell power`,
  lifeSteal: v => `${n1(v)}% of damage comes back as health`, magicFind: v => `+${n1(v)}% better loot`,
  goldFind: v => `+${n1(v)}% gold`, xpFind: v => `+${n1(v)}% experience`,
  block_chance: v => `${n1(v)}% chance to block`, block_power: v => `blocks ${n1(v)} damage`,
  barrier: v => `${n1(v)} points of barrier, refilled out of a fight`,
  barrierRegen: v => `barrier comes back ${n1(v)} a second`,
  cooldownReduction: v => `skills come back ${n1(v)}% sooner`,
  manaSteal: v => `${n1(v)}% of damage comes back as mana`,
  initiative: v => `+${n1(v * INITIATIVE_PER_POINT)}% attack speed`,
};
for (const [stat, field] of Object.entries(STAT_FIELDS)) {
  def('affix:' + stat, STAT_DESC[stat] || (v => `+${n1(v)} ${stat}`), { field, plain: true });
}

// ───────────────────────────── conditionals ─────────────────────────────
// `c` is the context object the caller passes. Fields it may carry:
//   self, target, amount, crit, element, skill, dt, rt (the runtime's per-unit scratch)

// `castElement` is not a stat — it is what a magic weapon is made of. It carries no number, so it
// has no derive hook; it is here so the registry knows it and the card can describe it.
def('affix:castElement', () => 'this weapon throws its own element, and leaves its mark', {});

def('affix:cond_afterSkillSpellPow', v => `+${n1(v)} spell power for 6s after a skill`, {
  onCast: (v, c) => { c.rt.skillPower = 6; c.rt.skillPowerValue = v; },
  derive: (v, d, unit, rt) => { if (rt?.skillPower > 0) d.spellPower += v; },
});
def('affix:cond_ambushDmgFlat', v => `+${n1(v)} damage to anything that has not noticed you`, {
  dmgOut: (v, c) => (c.target && c.target.state !== 'chase' ? 1 + v / Math.max(1, c.baseDamage || 20) : 1),
  flatOut: (v, c) => (c.target && c.target.state !== 'chase' ? v : 0),
});
def('affix:cond_bleedOnCrit', v => `critical hits open a bleed for ${n1(v)} a second`, {
  onCrit: (v, c) => c.applyStatus?.(c.target, 'bleed', { perSecond: v, seconds: 6, name: 'Bleeding', element: 'physical' }),
});
def('affix:cond_burnExtend', v => `burns you set last ${n1(v)}s longer`, {
  statusLonger: (v, c) => (c.type === 'burn' ? v : 0),
});
def('affix:cond_cheatDeath', v => `once a minute, survive a killing blow on ${pct(v)} health`, {
  preLethal: (v, c) => {
    if ((c.rt.cheatDeath || 0) > 0) return false;
    c.rt.cheatDeath = 60;
    c.survive = Math.max(1, Math.round((c.self.maxHp || 1) * v));
    return true;
  },
});
def('affix:cond_coldDmgVsBurning', v => `+${pct(v)} cold damage to anything burning`, {
  dmgOut: (v, c) => (c.element === 'ice' && c.target?.statuses?.burn ? 1 + v : 1),
});
def('affix:cond_combatStartBarrier', v => `${n1(v)} barrier when a fight starts`, {
  combatStart: (v, c) => { c.self.barrier = Math.max(c.self.barrier || 0, v); },
});
def('affix:cond_consecutiveHitDmg', v => `+${pct(v)} damage for each hit in a row on the same target`, {
  dmgOut: (v, c) => 1 + v * Math.min(5, c.rt.streak || 0),
  onHit: (v, c) => {
    if (c.rt.streakOn === c.target?.id) c.rt.streak = (c.rt.streak || 0) + 1;
    else { c.rt.streakOn = c.target?.id; c.rt.streak = 1; }
  },
});
def('affix:cond_critArmorPen', v => `critical hits ignore ${pct(v)} of armour`, {
  armorPen: (v, c) => (c.crit ? v : 0),
});
def('affix:cond_dmgBelowHpThresh', v => `+${pct(v)} damage below half health`, {
  dmgOut: (v, c) => ((c.self.hp || 0) / Math.max(1, c.self.maxHp || 1) < 0.5 ? 1 + v : 1),
});
def('affix:cond_dmgVsDemon', v => `+${pct(v)} damage to fiends`, {
  dmgOut: (v, c) => (c.target?.family === 'fiend' ? 1 + v : 1),
});
def('affix:cond_dmgVsUndead', v => `+${pct(v)} damage to the undead`, {
  dmgOut: (v, c) => (c.target?.family === 'undead' ? 1 + v : 1),
});
def('affix:cond_dotDmgReduce', v => `statuses on you hurt ${pct(v)} less`, {
  statusIn: (v) => 1 - v,
});
def('affix:cond_executeDmgPct', v => `+${pct(v)} damage to anything under a quarter health`, {
  dmgOut: (v, c) => ((c.target?.hp || 0) / Math.max(1, c.target?.maxHp || 1) < 0.25 ? 1 + v : 1),
});
def('affix:cond_extraSetPiece', () => 'counts as one more piece of every set you wear', { setPieces: 1 });
def('affix:cond_fireDmgVsPoisoned', v => `+${pct(v)} fire damage to anything poisoned`, {
  dmgOut: (v, c) => (c.element === 'fire' && c.target?.statuses?.poison ? 1 + v : 1),
});
def('affix:cond_firstHitCritBonus', v => `+${n1(v)}% critical chance on the first hit against a target`, {
  critBonus: (v, c) => (c.rt.hitOnce?.has(c.target?.id) ? 0 : v),
  onHit: (v, c) => { (c.rt.hitOnce || (c.rt.hitOnce = new Set())).add(c.target?.id); },
});
// The values in items.json are 0.1-0.3 and the effect was "+0.1 gold, but only off a champion",
// which is worth nothing and reads as a typo. It is a straight share of all the gold you take.
def('affix:cond_goldOnEliteKill', v => `+${pct(v)} gold from everything you kill`, {
  derive: (v, d) => { d.goldFind += v * 100; },
});
def('affix:cond_hpOnKill', v => `${n1(v)} health back on a kill`, { onKill: (v, c) => { c.heal = (c.heal || 0) + v; } });
def('affix:cond_killInitBonus', v => `a kill gives ${pct(v)} attack and move speed for 5s`, {
  onKill: (v, c) => { c.rt.killRush = 5; c.rt.killRushValue = v; },
  derive: (v, d, unit, rt) => { if (rt?.killRush > 0) { d.haste += v * 100; d.movePct += v * 100; } },
});
def('affix:cond_lightningVsSlowed', v => `+${pct(v)} lightning damage to anything slowed`, {
  dmgOut: (v, c) => (c.element === 'lightning' && (c.target?.statuses?.chill || c.target?.statuses?.web) ? 1 + v : 1),
});
def('affix:cond_lowManaRegenBonus', v => `+${n1(v)} mana a second below a third mana`, {
  derive: (v, d, unit) => { if ((unit.mp || 0) / Math.max(1, unit.maxMp || 1) < 0.34) d.mpRegen += v; },
});
def('affix:cond_magicDmgReducePct', v => `${pct(v)} less elemental damage taken`, {
  dmgIn: (v, c) => (isMagic(c.element) ? 1 - v : 1),
});
def('affix:cond_magicDmgVsAnyStatus', v => `+${pct(v)} spell damage to anything already suffering`, {
  dmgOut: (v, c) => (isMagic(c.element) && Object.keys(c.target?.statuses || {}).length ? 1 + v : 1),
});
def('affix:cond_manaOnAttack', v => `+${n1(v)} mana every swing`, {
  onSwing: (v, c) => { c.mana = (c.mana || 0) + v; },
});
def('affix:cond_manaOnCrit', v => `+${n1(v)} mana on a critical hit`, {
  onCrit: (v, c) => { c.mana = (c.mana || 0) + v; },
});
// This used to take a share of every hit out of your mana pool. In play that read as "the enemies
// are draining my mana" — it emptied the pool, there was nothing to cast with, and it was not fun.
// It is a plain damage reduction now, paid for by keeping your mana up rather than by spending it.
def('affix:cond_manaShieldOnHit', v => `${pct(v)} less damage taken while your mana is above a third`, {
  dmgIn: (v, c) => ((c.self.mp || 0) / Math.max(1, c.self.maxMp || 1) > 0.34 ? 1 - v : 1),
});
def('affix:cond_partyHpOnKill', v => `a kill heals your companions for ${n1(v)}`, {
  onKill: (v, c) => { c.petHeal = (c.petHeal || 0) + v; },
});
def('affix:cond_physDmgReducePct', v => `${pct(v)} less physical damage taken`, {
  dmgIn: (v, c) => (isMagic(c.element) ? 1 : 1 - v),
});
def('affix:cond_poisonDmgVsBurning', v => `+${pct(v)} poison damage to anything burning`, {
  dmgOut: (v, c) => (c.element === 'poison' && c.target?.statuses?.burn ? 1 + v : 1),
});
def('affix:cond_poisonStackPower', v => `your poisons bite ${pct(v)} harder`, {
  statusPower: (v, c) => (c.type === 'poison' ? 1 + v : 1),
});
def('affix:cond_setThresholdReduce', () => 'set bonuses come on one piece early', { setPieces: 1 });
// items.json rolls this 1-3. Read as a fraction it said "skills cost 188% less mana", which is
// gibberish; it is a flat saving on every skill, which is what a 1-3 roll can only have meant.
def('affix:cond_skillMpCostReduce', v => `every skill costs ${Math.round(v)} less mana`, { costFlat: v => v });
def('affix:cond_speedOnFirstHit', v => `+${pct(v)} move speed for 4s after the first hit of a fight`, {
  combatStart: (v, c) => { c.rt.openingRush = 4; c.rt.openingRushValue = v; },
  derive: (v, d, unit, rt) => { if (rt?.openingRush > 0) d.movePct += v * 100; },
});
def('affix:cond_sustainedDmgBonus', v => `+${pct(v)} damage for every 5s you stay in the fight, up to five`, {
  dmgOut: (v, c) => 1 + v * Math.min(5, Math.floor((c.rt.inCombat || 0) / 5)),
});
def('affix:cond_thornsFlat', v => `anything that hits you takes ${n1(v)}`, {
  thornsFlat: v => v,
});

// ───────────────────────────── legendary powers ─────────────────────────────
// The 24 ids in items.json `legendaryEffects`. Five of them were written for Emberveil's *travel*
// layer — camping, foraging, map nodes, night raids — which Farhold does not have in that shape, so
// each is translated to the nearest thing that is real here and the translation is written down.

def('legendary:mage_missile_aoe', 'A bolt that lands bursts twice as wide.', { boltSplash: () => 2 });
def('legendary:crit_bleed_5', 'Critical hits open a deep bleed.', {
  onCrit: (v, c) => c.applyStatus?.(c.target, 'bleed', { perSecond: Math.max(3, (c.amount || 0) * 0.12), seconds: 6, name: 'Bleeding', element: 'physical' }),
});
def('legendary:low_mana_shockwave', 'Casting below a quarter mana throws out an arcane shockwave.', {
  onCast: (v, c) => { if ((c.self.mp || 0) / Math.max(1, c.self.maxMp || 1) < 0.25) c.shockwave = 1; },
});
def('legendary:kill_party_heal', "A killing blow heals you and your companions for a tenth of what died.", {
  onKill: (v, c) => { const h = Math.round((c.target?.maxHp || 0) * 0.1); c.heal = (c.heal || 0) + h; c.petHeal = (c.petHeal || 0) + h; },
});
// initiative is turn order there; here it is how fast you act, so it buys attack speed for the opening
def('legendary:speed_combat_init', 'You open every fight fast — +40% attack speed for six seconds.', {
  combatStart: (v, c) => { c.rt.openingHaste = 6; },
  derive: (v, d, unit, rt) => { if (rt?.openingHaste > 0) d.haste += 40; },
});
def('legendary:cheat_death_once', 'Once a fight, a killing blow leaves you on one health.', {
  preLethal: (v, c) => { if (c.rt.cheatSpent) return false; c.rt.cheatSpent = true; c.survive = 1; return true; },
});
def('legendary:burn_extend', 'Burns you set last two seconds longer.', {
  statusLonger: (v, c) => (c.type === 'burn' ? 2 : 0),
});
def('legendary:mana_on_attack', 'Every hit returns three mana.', {
  onHit: (v, c) => { c.mana = (c.mana || 0) + 3; },
});
def('legendary:critical_armorpen', 'Critical hits ignore a third of armour.', {
  armorPen: (v, c) => (c.crit ? 0.3 : 0),
});
def('legendary:rally_on_kill', 'A kill rallies you and your companions — harder hitting for a while.', {
  onKill: (v, c) => { c.rally = 8; },
});
def('legendary:echo_cast', 'A quarter of your skills go off a second time for half.', { echo: () => 0.25 });
def('legendary:dragon_fury_breath', 'A killing blow breathes fire over everything else nearby.', {
  onKill: (v, c) => { c.breath = { element: 'fire', radius: 7, status: 'burn' }; },
});
// travel translation: there is no camp here, so it mends whatever mends you
def('legendary:camp_mend', 'Anything that mends you mends 15% more.', { healBonus: () => 0.15 });
// travel translation: rations become the materials a fight leaves behind
def('legendary:forage_feast', 'A won fight often leaves crafting material behind.', { scavenge: () => 0.6 });
def('legendary:naming_kills', 'At fifty kills the weapon earns a name, and hits harder for every one after.', {
  dmgOut: (v, c) => 1 + Math.min(0.4, Math.max(0, ((c.rt.weaponKills || 0) - 50) * 0.004)),
  onKill: (v, c) => { c.rt.weaponKills = (c.rt.weaponKills || 0) + 1; c.nameAt = 50; },
});
// travel translation: a map node becomes a place you have not stood before
def('legendary:road_cache', 'Every new place you reach turns up a small cache of coin.', { cache: () => 1 });
def('legendary:companion_might', 'Your companions hit 40% harder and carry a quarter more health.', {
  petPower: () => 1.4, petHealth: () => 1.25,
});
def('legendary:strip_modifier', 'The biggest champion in a fight loses one of its tricks as it starts.', {
  combatStart: (v, c) => { c.strip = 1; },
});
def('legendary:hated_blade', '+25% damage. (In Emberveil the party resents it; there is nobody here to mind.)', {
  dmgOut: () => 1.25,
});
def('legendary:kill_ledger', '+1% damage for every five kills it has taken, up to +60%.', {
  dmgOut: (v, c) => 1 + Math.min(0.6, Math.floor((c.rt.weaponKills || 0) / 5) * 0.01),
  onKill: (v, c) => { c.rt.weaponKills = (c.rt.weaponKills || 0) + 1; },
});
def('legendary:curse_spreads', 'A kill spills whatever it was suffering over everything still standing.', {
  onKill: (v, c) => { c.spreadStatuses = 9; },
});
// travel translation: an extra node of travel a day becomes ground covered on foot
def('legendary:free_move', 'You cover ground noticeably faster.', {
  derive: (v, d) => { d.movePct += 18; },
});
def('legendary:nemesis_hunter', 'Double damage to rares and bosses; killing one heals you.', {
  dmgOut: (v, c) => (c.target?.rank === 'rare' || c.target?.rank === 'boss' ? 2 : 1),
  onKill: (v, c) => { if (c.target?.rank === 'rare' || c.target?.rank === 'boss') c.heal = (c.heal || 0) + Math.round((c.self.maxHp || 0) * 0.3); },
});
def('legendary:no_night_raids', 'Nothing ambushes you in the dark — night spawns leave you alone.', { noAmbush: () => 1 });

/** Every id the registry knows, for the tests and the "nothing is inert" audit. */
export const EFFECT_IDS = Object.keys(EFFECTS);

/** The effect id an affix maps to, or null if this registry has never heard of it. */
export function effectFor(affix) {
  if (!affix) return null;
  if (affix.stat === 'cond_legendaryEffect' || affix.id === 'legendary_effect') {
    const id = 'legendary:' + (affix.legendaryId || '');
    return EFFECTS[id] ? id : null;
  }
  const id = 'affix:' + affix.stat;
  return EFFECTS[id] ? id : null;
}

/** A one-line description of what an affix does, for the item card. */
export function describeAffix(affix) {
  const id = effectFor(affix);
  if (!id) return `${affix.name || affix.stat}: ${affix.value}`;
  const e = EFFECTS[id];
  return e.desc(affix.value ?? 1);
}

/**
 * The runtime: the per-character scratch that conditional affixes need (how long you have been
 * fighting, how many hits in a row you have landed on this thing, whether cheat-death is spent).
 *
 * One of these for the player, and one shared by everything else. It is deliberately not on the
 * character object, because a save should not carry a half-finished hit streak.
 */
export class Effects {
  constructor() { this.scratch = new WeakMap(); }

  /** The scratch bag for a character, made on first use. */
  rt(unit) {
    let s = this.scratch.get(unit);
    if (!s) this.scratch.set(unit, s = { inCombat: 0, streak: 0, streakOn: null, cheatDeath: 0, hitOnce: new Set() });
    return s;
  }

  /** Every `{ effect, value }` this character's gear grants. Rebuilt when gear changes. */
  list(unit) {
    const out = [];
    for (const item of Object.values(unit.equipment || {})) {
      if (!item) continue;
      for (const a of item.affixes || []) {
        const id = effectFor(a);
        if (id) out.push({ id, e: EFFECTS[id], v: a.value ?? 1 });
      }
    }
    for (const id of unit.legendaryPowers || []) {
      if (EFFECTS[id]) out.push({ id, e: EFFECTS[id], v: 1 });
    }
    return out;
  }

  /** Cached per character; `refresh` throws the cache away when gear changes. */
  effects(unit) {
    const rt = this.rt(unit);
    if (!rt._cache) rt._cache = this.list(unit);
    return rt._cache;
  }
  refresh(unit) { this.rt(unit)._cache = null; }

  /** Tick the timers that conditional affixes run on. */
  update(unit, dt, { fighting = false } = {}) {
    const rt = this.rt(unit);
    rt.inCombat = fighting ? rt.inCombat + dt : 0;
    if (!fighting) { rt.streak = 0; rt.streakOn = null; rt.hitOnce = new Set(); }
    for (const k of ['cheatDeath', 'skillPower', 'killRush', 'openingRush']) {
      if (rt[k] > 0) rt[k] = Math.max(0, rt[k] - dt);
    }
    return rt;
  }

  /** Apply every `derive` hook while stats are being worked out. */
  derive(unit, d) {
    const rt = this.rt(unit);
    for (const { e, v } of this.effects(unit)) {
      if (e.plain) { d[e.field] = (d[e.field] || 0) + v; continue; }
      e.derive?.(v, d, unit, rt);
    }
    return d;
  }

  /** Multiply outgoing damage. `c` wants { self, target, element, crit }. */
  dmgOut(c) {
    c.rt = this.rt(c.self);
    let mult = 1, flat = 0;
    for (const { e, v } of this.effects(c.self)) {
      if (e.dmgOut) mult *= e.dmgOut(v, c) || 1;
      if (e.flatOut) flat += e.flatOut(v, c) || 0;
    }
    return { mult, flat };
  }

  /** Multiply incoming damage. */
  dmgIn(c) {
    c.rt = this.rt(c.self);
    let mult = 1;
    for (const { e, v } of this.effects(c.self)) if (e.dmgIn) mult *= e.dmgIn(v, c) || 1;
    return mult;
  }

  /** How much of the defender's armour this attack ignores, 0..1. */
  armorPen(c) {
    c.rt = this.rt(c.self);
    let pen = 0;
    for (const { e, v } of this.effects(c.self)) if (e.armorPen) pen = Math.min(0.9, pen + (e.armorPen(v, c) || 0));
    return pen;
  }

  /** Extra critical chance for this particular swing. */
  critBonus(c) {
    c.rt = this.rt(c.self);
    let bonus = 0;
    for (const { e, v } of this.effects(c.self)) if (e.critBonus) bonus += e.critBonus(v, c) || 0;
    return bonus;
  }

  /** Run a named hook and hand back whatever the hooks wrote into the context. */
  fire(name, c) {
    c.rt = this.rt(c.self);
    for (const { e, v } of this.effects(c.self)) e[name]?.(v, c);
    return c;
  }

  onHit(c) { return this.fire('onHit', c); }
  onCrit(c) { return this.fire('onCrit', c); }
  onKill(c) { return this.fire('onKill', c); }
  onSwing(c) { return this.fire('onSwing', c); }
  onCast(c) { return this.fire('onCast', c); }
  onDamaged(c) { return this.fire('onDamaged', c); }
  combatStart(c) { return this.fire('combatStart', c); }

  /** Before a killing blow: returns the health to survive on, or 0 to let it land. */
  preLethal(c) {
    c.rt = this.rt(c.self);
    for (const { e, v } of this.effects(c.self)) if (e.preLethal?.(v, c)) return c.survive || 1;
    return 0;
  }

  /** Simple scalar look-ups, summed or multiplied as makes sense for the hook. */
  sum(unit, name, c = {}) {
    c.rt = this.rt(unit); c.self = unit;
    let total = 0;
    for (const { e, v } of this.effects(unit)) if (e[name]) total += e[name](v, c) || 0;
    return total;
  }
  product(unit, name, c = {}) {
    c.rt = this.rt(unit); c.self = unit;
    let total = 1;
    for (const { e, v } of this.effects(unit)) if (e[name]) total *= e[name](v, c) || 1;
    return total;
  }
  /** The largest value any effect offers for this hook (cost cuts, mana shields — they do not stack). */
  best(unit, name, c = {}) {
    c.rt = this.rt(unit); c.self = unit;
    let best = 0;
    for (const { e, v } of this.effects(unit)) if (e[name]) best = Math.max(best, e[name](v, c) || 0);
    return best;
  }
  /** Does any effect on this character offer this hook at all? */
  has(unit, name) { return this.effects(unit).some(({ e }) => !!e[name]); }
}
