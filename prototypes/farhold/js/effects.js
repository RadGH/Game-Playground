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
  critChance: 'critChance', critDamage: 'critDamage', dodge: 'dodge', hpRegen: 'hpRegen',
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
  hp: v => `+${n1(v)} maximum health`, mp: v => `+${n1(v)} maximum mana`, armor: v => `+${n1(v)} armour`,
  magicResist: v => `+${n1(v)} magic resistance`, dmg: v => `+${n1(v)} damage`,
  critChance: v => `+${n1(v)}% critical chance`, critDamage: v => `+${n1(v)}% critical damage`,
  dodge: v => `+${n1(v)}% dodge`, hpRegen: v => `+${n1(v)} health a second`,
  mana_regen: v => `+${n1(v)} mana a second`, str: v => `+${n1(v)} strength`, dex: v => `+${n1(v)} dexterity`,
  int: v => `+${n1(v)} intellect`, con: v => `+${n1(v)} constitution`, spellPower: v => `+${n1(v)} spell power`,
  lifeSteal: v => `${n1(v)}% Life Steal (melee and ranged physical hits)`, magicFind: v => `+${n1(v)}% better loot`,
  goldFind: v => `+${n1(v)}% gold`, xpFind: v => `+${n1(v)}% experience`,
  block_chance: v => `${n1(v)}% chance to block`, block_power: v => `blocks ${n1(v)} damage`,
  barrier: v => `${n1(v)} points of barrier, refilled out of a fight`,
  barrierRegen: v => `+${n1(v)} barrier a second`,
  cooldownReduction: v => `skills come back ${n1(v)}% sooner`,
  manaSteal: v => `${n1(v)}% Mana Steal`,
  initiative: v => `+${n1(v * INITIATIVE_PER_POINT)}% attack speed`,
};
for (const [stat, field] of Object.entries(STAT_FIELDS)) {
  def('affix:' + stat, STAT_DESC[stat] || (v => `+${n1(v)} ${stat}`), { field, plain: true });
}

/**
 * R18 — INITIATIVE IS THE ONE HASTE WRITER MEASURED IN POINTS, SO IT CONVERTS HERE.
 *
 * `js/rpg.js` used to do `d.haste *= INITIATIVE_PER_POINT` AFTER every writer had had its say.
 * Only this affix is in points; the perk arm, `legendary:speed_combat_init` (`d.haste += 40`) and
 * `cond_killInitBonus` (`v * 100`) all write percentage points already — so all three were
 * quadrupled. The node labelled "+5% attack speed" gave +20%, and the Doubled Grasp keystone's
 * "-20% attack speed" computed as -80%, clamped to -50%: the keystone HALVED your attack rate
 * instead of costing a fifth of it.
 *
 * The user's ruling is that haste is a percent modifier, so the sheet's `haste` is percentage
 * points and every writer speaks that. This one entry does the points -> percent conversion at its
 * own site, which is the only place that knows it is in points. `AFFIX_CAP.initiative` of 15 still
 * reads as +60%, exactly as its comment says.
 *
 * It replaces the generic `plain` entry above deliberately: `plain` short-circuits before `derive`
 * (see the dispatcher below), so an entry with a `derive` and no `field` runs only this.
 */
def('affix:initiative', v => `+${n1(v * INITIATIVE_PER_POINT)}% attack speed`, {
  derive: (v, d) => { d.haste += v * INITIATIVE_PER_POINT; },
});

// ───────────────────────────── conditionals ─────────────────────────────
// `c` is the context object the caller passes. Fields it may carry:
//   self, target, amount, crit, element, skill, dt, rt (the runtime's per-unit scratch)

/**
 * WHAT "THAT ELEMENT'S MARK" ACTUALLY IS, IN NUMBERS.
 *
 * `castElement`, the seven brands and `cond_quiverElement` all used to end on "leaves that element's
 * mark", which names no quantity at all. The numbers are not in this file, so they are read off the
 * two places that own them and repeated here — the same reason `WALK_MS` is repeated below:
 *
 *   * `data/skills.json` `statuses` — how long each status lasts and what it is worth a second.
 *   * `js/main.js` `brandHit` — a branded hit lands its status at **70% of the hit's damage**.
 *
 * So a burn is `0.7 x perSecond 0.3 x 5s` = 105% of the hit, spread over 5s; a poison is
 * `0.7 x 0.26 x 8s` = 146% over 8s. The slow and debuff statuses do not scale with the hit at all,
 * so those read straight off skills.json. Holy and arcane have no status (js/rpg.js `CAST_ELEMENTS`
 * lists none), and saying so is worth more than an atmospheric verb.
 */
const ELEMENT_MARK = {
  fire: 'Burning, worth 105% of the hit as damage over 5s',
  poison: 'Poisoned, worth 146% of the hit as damage over 8s',
  ice: 'Chilled, -45% move speed for 4s',
  lightning: 'Shocked, +30% damage taken for 5s',
  shadow: 'Cursed, +25% damage taken and -15% move speed for 8s',
};
/** "…, applying Burning, worth 105%…" or "…, with no status effect" for holy and arcane. */
const markClause = element => (ELEMENT_MARK[element] ? `, applying ${ELEMENT_MARK[element]}` : ', with no status effect');

// `castElement` is not a stat — it is what a magic weapon is made of. It carries no number, so it
// has no derive hook; it is here so the registry knows it and the card can describe it.
def('affix:castElement', (v, a) => (a?.element
  ? `Every hit deals ${a.element} damage instead of physical${markClause(a.element)}`
  : "Every hit deals this weapon's own element as damage instead of physical, applying that element's status"), {});

def('affix:cond_afterSkillSpellPow', v => `+${n1(v)} spell power for 6s after you use a skill`, {
  onCast: (v, c) => { c.rt.skillPower = 6; c.rt.skillPowerValue = v; },
  derive: (v, d, unit, rt) => { if (rt?.skillPower > 0) d.spellPower += v; },
});
/**
 * R18 — THIS PAID TWICE, ONCE AS FLAT DAMAGE AND ONCE AS A MULTIPLIER.
 *
 * It declared BOTH `dmgOut: 1 + v/baseDamage` and `flatOut: v`, and `rpg.strike` applies them as
 * `(amount + out.flat) * out.mult` — so a `+20 damage` ambush affix on a level-5 character took a
 * 4-damage hit to 158. On a low-damage build the multiplier alone is more than five times.
 *
 * Its own name and its own sentence say FLAT: "+20 damage to anything that has not noticed you".
 * So `flatOut` is the payment and the multiplier goes. One property, one effect.
 */
def('affix:cond_ambushDmgFlat', v => `+${n1(v)} damage to anything that has not noticed you`, {
  flatOut: (v, c) => (c.target && c.target.state !== 'chase' ? v : 0),
});
// The hook sets `perSecond: v` over 6 seconds, so the TOTAL the player gets is `v * 6` — which is
// the number the standard asks a damage-over-time to print.
def('affix:cond_bleedOnCrit', v => `Critical hits apply a bleed for ${n1(v * 6)} damage over 6s`, {
  onCrit: (v, c) => c.applyStatus?.(c.target, 'bleed', { perSecond: v, seconds: 6, name: 'Bleeding', element: 'physical' }),
});
def('affix:cond_burnExtend', v => `Burning damage you apply lasts ${n1(v)}s longer`, {
  statusLonger: (v, c) => (c.type === 'burn' ? v : 0),
});
// The cooldown is the `c.rt.cheatDeath = 60` two lines below — 60 seconds, so the card says 60s.
def('affix:cond_cheatDeath', v => `Every 60s, one killing blow leaves you at ${pct(v)} of your maximum health instead of killing you.`, {
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
def('affix:cond_combatStartBarrier', v => `Every fight starts with a ${n1(v)}-point barrier`, {
  combatStart: (v, c) => { c.self.barrier = Math.max(c.self.barrier || 0, v); },
});
// `Math.min(5, streak)` is the cap, so the card can state both ends: per hit, and the total at 5.
def('affix:cond_consecutiveHitDmg', v => `+${pct(v)} damage per hit in a row on the same target, up to +${pct(v * 5)} at 5 hits`, {
  dmgOut: (v, c) => 1 + v * Math.min(5, c.rt.streak || 0),
  onHit: (v, c) => {
    if (c.rt.streakOn === c.target?.id) c.rt.streak = (c.rt.streak || 0) + 1;
    else { c.rt.streakOn = c.target?.id; c.rt.streak = 1; }
  },
});
def('affix:cond_critArmorPen', v => `Critical hits ignore ${pct(v)} of the target's armour`, {
  armorPen: (v, c) => (c.crit ? v : 0),
});
def('affix:cond_dmgBelowHpThresh', v => `+${pct(v)} damage while you are below 50% health`, {
  dmgOut: (v, c) => ((c.self.hp || 0) / Math.max(1, c.self.maxHp || 1) < 0.5 ? 1 + v : 1),
});
def('affix:cond_dmgVsDemon', v => `+${pct(v)} damage to fiends`, {
  dmgOut: (v, c) => (c.target?.family === 'fiend' ? 1 + v : 1),
});
def('affix:cond_dmgVsUndead', v => `+${pct(v)} damage to the undead`, {
  dmgOut: (v, c) => (c.target?.family === 'undead' ? 1 + v : 1),
});
def('affix:cond_dotDmgReduce', v => `Burning, bleeding and poison on you deal ${pct(v)} less damage`, {
  statusIn: (v) => 1 - v,
});
def('affix:cond_executeDmgPct', v => `+${pct(v)} damage to targets below 25% health`, {
  dmgOut: (v, c) => ((c.target?.hp || 0) / Math.max(1, c.target?.maxHp || 1) < 0.25 ? 1 + v : 1),
});
// `setPieces: 1` is the whole effect: one extra piece counted, so the sentence says 1 and 2.
def('affix:cond_extraSetPiece', () => 'This item counts as 2 pieces of every set you are wearing instead of 1', { setPieces: 1 });
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
/**
 * The one affix worth reading on gear you cannot wear yet. It is handled in `Rpg.levelRequirement`
 * rather than here, because it has to apply to its OWN item while that item is still in the bag —
 * a `derive` hook only ever runs on what is equipped.
 */
def('affix:cond_levelReqReduce', v => `This item and everything else you have on needs ${n1(v)} fewer levels to wear`);
def('affix:cond_hpOnKill', v => `Every kill gives you ${n1(v)} health back`, { onKill: (v, c) => { c.heal = (c.heal || 0) + v; } });
def('affix:cond_killInitBonus', v => `Every kill gives +${pct(v)} attack speed and +${pct(v)} move speed for 5s`, {
  onKill: (v, c) => { c.rt.killRush = 5; c.rt.killRushValue = v; },
  derive: (v, d, unit, rt) => { if (rt?.killRush > 0) { d.haste += v * 100; d.movePct += v * 100; } },
});
def('affix:cond_lightningVsSlowed', v => `+${pct(v)} lightning damage to anything slowed`, {
  dmgOut: (v, c) => (c.element === 'lightning' && (c.target?.statuses?.chill || c.target?.statuses?.web) ? 1 + v : 1),
});
// The threshold is the `< 0.34` below, not "a third" — so the card prints the number the code uses.
def('affix:cond_lowManaRegenBonus', v => `+${n1(v)} mana a second while you are below 34% mana`, {
  derive: (v, d, unit) => { if ((unit.mp || 0) / Math.max(1, unit.maxMp || 1) < 0.34) d.mpRegen += v; },
});
def('affix:cond_magicDmgReducePct', v => `You take ${pct(v)} less elemental damage`, {
  dmgIn: (v, c) => (isMagic(c.element) ? 1 - v : 1),
});
def('affix:cond_magicDmgVsAnyStatus', v => `+${pct(v)} spell damage to anything already burning, bleeding, poisoned, chilled or cursed`, {
  dmgOut: (v, c) => (isMagic(c.element) && Object.keys(c.target?.statuses || {}).length ? 1 + v : 1),
});
def('affix:cond_manaOnAttack', v => `Every swing returns ${n1(v)} mana`, {
  onSwing: (v, c) => { c.mana = (c.mana || 0) + v; },
});
def('affix:cond_manaOnCrit', v => `Every critical hit returns ${n1(v)} mana`, {
  onCrit: (v, c) => { c.mana = (c.mana || 0) + v; },
});
// This used to take a share of every hit out of your mana pool. In play that read as "the enemies
// are draining my mana" — it emptied the pool, there was nothing to cast with, and it was not fun.
// It is a plain damage reduction now, paid for by keeping your mana up rather than by spending it.
def('affix:cond_manaShieldOnHit', v => `You take ${pct(v)} less damage while you are above 34% mana`, {
  dmgIn: (v, c) => ((c.self.mp || 0) / Math.max(1, c.self.maxMp || 1) > 0.34 ? 1 - v : 1),
});
def('affix:cond_partyHpOnKill', v => `Every kill heals each of your companions for ${n1(v)} health`, {
  onKill: (v, c) => { c.petHeal = (c.petHeal || 0) + v; },
});
def('affix:cond_physDmgReducePct', v => `You take ${pct(v)} less physical damage`, {
  dmgIn: (v, c) => (isMagic(c.element) ? 1 : 1 - v),
});
def('affix:cond_poisonDmgVsBurning', v => `+${pct(v)} poison damage to anything burning`, {
  dmgOut: (v, c) => (c.element === 'poison' && c.target?.statuses?.burn ? 1 + v : 1),
});
def('affix:cond_poisonStackPower', v => `Poison you apply deals ${pct(v)} more damage`, {
  statusPower: (v, c) => (c.type === 'poison' ? 1 + v : 1),
});
// Same `setPieces: 1`, read from the other end: a 4-piece bonus lands on the 3rd piece.
def('affix:cond_setThresholdReduce', () => 'Every set bonus you are wearing comes on 1 piece early', { setPieces: 1 });
// items.json rolls this 1-3. Read as a fraction it said "skills cost 188% less mana", which is
// gibberish; it is a flat saving on every skill, which is what a 1-3 roll can only have meant.
def('affix:cond_skillMpCostReduce', v => `Every skill costs ${Math.round(v)} less mana`, { costFlat: v => v });
def('affix:cond_speedOnFirstHit', v => `+${pct(v)} move speed for 4s after the first hit of a fight`, {
  combatStart: (v, c) => { c.rt.openingRush = 4; c.rt.openingRushValue = v; },
  derive: (v, d, unit, rt) => { if (rt?.openingRush > 0) d.movePct += v * 100; },
});
def('affix:cond_sustainedDmgBonus', v => `+${pct(v)} damage for every 5s you stay in a fight, up to +${pct(v * 5)} at 25s`, {
  dmgOut: (v, c) => 1 + v * Math.min(5, Math.floor((c.rt.inCombat || 0) / 5)),
});
def('affix:cond_thornsFlat', v => `Anything that hits you takes ${n1(v)} damage back`, {
  thornsFlat: v => v,
});

// ───────────────────────── the road weapons' own properties ─────────────────────────
//
// `items.json`'s 22 road weapons carry 23 bespoke properties, and not one of them had an entry
// here. The registry's fallback prints `name: value`, which is how a bow came to say
// **"Starwake: 2"** and **"Star brand: 0.2"** — a real property, a real number, and no way for a
// player to know what either meant.
//
// Five of them were written for Emberveil's TRAVEL layer — forage rations, an extra leg of the
// road, exhaustion, standing a watch, ramming with a vehicle — and Farhold has no travel legs and
// no exhaustion, so the honest thing is to give each one the nearest meaning this game does have
// and say plainly what that is, rather than leave it inert and undescribed.

export const BRANDS = {
  cond_brandFire: ['fire', 'Ember Brand', 'burns'],
  cond_brandIce: ['ice', 'Rime Brand', 'chills'],
  cond_brandLightning: ['lightning', 'Storm Brand', 'shocks'],
  cond_brandNature: ['poison', 'Bramble Brand', 'poisons'],
  cond_brandShadow: ['shadow', 'Veil Brand', 'withers'],
  cond_brandHoly: ['holy', 'Dawn Brand', 'sears'],
  cond_brandArcane: ['arcane', 'Star Brand', 'unmakes'],
};
// The verb in the table ("burns", "chills") is what the brand is CALLED doing; `markClause` says
// what that is worth, in the status's own numbers. Holy and arcane leave no status at all.
for (const [stat, [element]] of Object.entries(BRANDS)) {
  def(`affix:${stat}`, v => `Every hit deals ${element} damage instead of physical${markClause(element)}; +${pct(v)} ${element} damage`, {
    brandElement: () => element,
    dmgOut: (v, c) => (c.element === element ? 1 + v : 1),
  });
}

// `Math.floor(missing * 4)` is quarters of the target's missing health, so the ceiling is 4 steps.
def('affix:cond_critFromWounds', v => `+${n1(v)}% critical chance for every 25% of health the target has lost, up to +${n1(v * 4)}%`, {
  critBonus: (v, c) => {
    const missing = 1 - (c.target?.hp || 0) / Math.max(1, c.target?.maxHp || 1);
    return v * Math.floor(missing * 4);
  },
});
def('affix:cond_dmgVsNamed', v => `+${pct(v)} damage to champions, rares and bosses`, {
  dmgOut: (v, c) => (c.target?.named || c.target?.nemesis || c.target?.rank === 'boss' ? 1 + v : 1),
});
def('affix:cond_sunderOnHit', v => `Every hit strips ${n1(v)} armour off the target permanently`, {
  onHit: (v, c) => { if (c.target) c.target.armor = Math.max(0, (c.target.armor || 0) - v); },
});
def('affix:cond_nemesisMark', v => `+${pct(v)} damage to whatever killed you last`, {
  dmgOut: (v, c) => (c.target?.nemesis ? 1 + v : 1),
});
def('affix:cond_killGrowth', v => `+${n1(v)} damage per 10 kills you have taken`, {
  derive: (v, d, unit) => { d.damageFlat += v * Math.floor((unit.kills || 0) / 10); },
});
def('affix:cond_killMemory', v => `+${n1(v)} maximum health per 10 kills you have taken`, {
  derive: (v, d, unit) => { d.maxHp += v * Math.floor((unit.kills || 0) / 10); },
});

// ───────────────────────────── companions ─────────────────────────────
//
// Two of these three were hooks NOTHING EVER CALLED. `petSlots` and `petDamage` were summed by no
// file in the game, so "your companions hit 25% harder" was a sentence on a card. `js/pets.js` asks
// for exactly two things — `petPower` and `petHealth` — so that is what they answer to now, and the
// extra companion is a derived number that `js/skills.js` adds to every summon.
// R17 — this is a FOLLOWER SLOT now, not a body per cast. A summoning skill puts down its own
// number; what this raises is how many things may walk with you at once, and how many of each
// creature may be standing (js/followers.js). The key stays `petSlots` so an old save is unchanged
// and js/followers.js `followerBonus` adds it to `followerSlots`.
def('affix:cond_companionExtra', v => `+${n1(v)} follower slot — that many more may walk with you`, {
  derive: (v, d) => { d.petSlots = (d.petSlots || 0) + v; },
});
def('affix:cond_companionFury', v => `Your companions deal ${pct(v)} more damage`, { petPower: v => 1 + v });
def('affix:cond_guardBond', v => `Town guards deal ${pct(v)} more damage while you are with them`, { guardPower: v => 1 + v });

// the travel-layer five, restated for a world you walk across yourself
def('affix:cond_forageRation', v => `+${n1(v)} health a second while you are out of a fight`, {
  derive: (v, d, unit, rt) => { if (!(rt?.inCombat > 0)) d.hpRegen += v; },
});
/**
 * R18 — "+200% MOVE SPEED ON AN ACT-1 WEAPON", AND THE CARD SAID SO HONESTLY.
 *
 * `cond_extraLeg` is an EMBERVEIL property and the two games read the same `data/items.json`. There
 * it means "extra legs of travel" on a map you cross a stage at a time, so its values are small
 * whole numbers: the Pathfinder Javelin carries 2, the Forager's Covenant boots 1. Farhold has no
 * legs — it has a planet you walk across — so it re-read the same number as a share and did
 * `movePct += v * 100`: the javelin took `moveSpeed` from 5.4 to 16.2 m/s, and the boots doubled it.
 *
 * The user's ruling is that this is a percent modifier where 0.10 is 10% faster. It cannot be
 * applied to the VALUE, because the value belongs to Emberveil and changing it would move that
 * game's travel maths. So the translation lives here, where Farhold decides what an Emberveil leg
 * is worth on the ground: one leg buys `LEG_TO_MOVE` of move speed. Two legs is +8%, which is a
 * good act-1 weapon property rather than a mount you can never take off.
 *
 * This is the same rule the file already follows for `ranged`, `offHandOk` and the quarterstaff:
 * anything only one of the two games understands is applied on our side, never written into the
 * shared file.
 */
const LEG_TO_MOVE = 0.04;
def('affix:cond_extraLeg', v => `+${pct(v * LEG_TO_MOVE)} move speed`, {
  derive: (v, d) => { d.movePct += v * LEG_TO_MOVE * 100; },
});
// The card says only the health, because only the health is real: `staminaEase` is written to the
// sheet here and read by nothing in the game, so promising anything about tiring would be a lie.
def('affix:cond_easeExhaustion', v => `+${n1(v)} health a second`, {
  derive: (v, d) => { d.staminaEase = (d.staminaEase || 0) + v; d.hpRegen += v; },
});
def('affix:cond_nightWard', v => `+${pct(v)} armour after dark`, {
  derive: (v, d, unit) => { if (unit.atNight) d.armorPct += v * 100; },
});
def('affix:cond_watch', v => `+${n1(v)} health a second while you are standing still`, {
  derive: (v, d, unit) => { if (!(unit.moving > 0)) d.hpRegen += v; },
});
def('affix:cond_vehicleDmg', v => `+${pct(v)} damage while you are mounted`, {
  dmgOut: (v, c) => (c.self?.mounted ? 1 + v : 1),
});
def('affix:cond_roadFind', v => `+${pct(v)} better loot from everything you kill`, {
  derive: (v, d) => { d.magicFind += v * 100; },
});
// `manaRegen` is one unique's spelling of `mana_regen`. One line beats a data migration.
def('affix:manaRegen', v => `+${n1(v)} mana a second`, { field: 'mpRegen', plain: true });

// ───────────────── the light, mount and quiver slots' own properties ─────────────────
//
// "Add affixes specifically for the light source and mount slots, that do not apply to other
// slots." These only make sense on the thing they are bolted to, which is exactly why they are
// worth having: a lantern that frightens what it shines on is a different decision from +4 armour.

// The BASE reach of a light, and separately the affix that adds to it — one says "lights 34 metres",
// the other says "lights 12 more metres", and a card carrying both reads correctly.
def('affix:cond_lightBase', v => `Lights ${n1(v)} metres of ground around you`, {
  derive: (v, d) => { d.lightRange = Math.max(d.lightRange || 0, v); },
});
/**
 * R14 — SAY IT IN METRES A SECOND, NOT ONLY IN MULTIPLES.
 *
 *   "Add the walking speed and gallop speed to the starting trail horse, lower than all the rest."
 *
 * "1.6x your walking speed" is true and tells you nothing you can compare: the number you want when
 * you are looking at two horses is how fast each one actually goes. `js/player.js:280` computes
 * mounted speed as `moveSpeed x (running ? runMultiplier : 1) x mountSpeed`, so both figures fall
 * straight out of the multiplier. The two constants are data/balance.json's `player.moveSpeed` and
 * `player.runMultiplier`, repeated here for the same reason HORSE_PACE is repeated in js/gear.js —
 * this file is a description table with nothing loaded into it.
 */
const WALK_MS = 5.4;
const RUN_X = 2.1;
def('affix:cond_mountBase',
  v => `This mount rides at ${n1(v)}\u00d7 your walking speed — ${n1(v * WALK_MS)} m/s at a walk, ${n1(v * WALK_MS * RUN_X)} m/s at a gallop`, {
    derive: (v, d) => { d.mountSpeed = Math.max(d.mountSpeed || 0, v); },
  });
def('affix:cond_mountWind', v => `This mount gallops for ${n1(v)}s before dropping back to a walk`, {
  derive: (v, d) => { d.mountStamina = Math.max(d.mountStamina || 0, v); },
});
/**
 * R19 — THE TOOL SLOT'S FOUR AFFIXES.
 *
 * `data/tools.json` rarity.*.affixes asked for 0/1/2/3 of these up the ladder and `makeTool` never
 * rolled any, so a Masterwork tool was a name. Each one is read in js/tools.js, by the function
 * named in its comment — nothing here is a number that only prints.
 */
// read by toolSpeed(): a share off the work bar's duration
def('affix:cond_toolSpeed', v => `Works rock and timber ${pct(v)} faster`, {
  // `gatherSpeed` is the hook toolSpeed() has read since R16, whose comment said it existed "so a
  // 'you work faster' affix has somewhere to land instead of being invented later". This is it.
  derive: (v, d) => { d.gatherSpeed = (d.gatherSpeed || 0) + v; },
});
// read by toolYield(): a share on top of what a swing gives you
def('affix:cond_toolYield', v => `Brings up ${pct(v)} more from every seam and tree`, {
  derive: (v, d) => { d.gatherYield = (d.gatherYield || 0) + v; },
});
// read by toolReach(): metres, so you can work a seam from further back
def('affix:cond_toolReach', v => `Reaches ${n1(v)} metres further to work something`, {
  derive: (v, d) => { d.toolReach = (d.toolReach || 0) + v; },
});
// read by scanRadius(): a bigger sweep, same as the scanner's own scanBonus
def('affix:cond_toolScan', v => `Sweeps ${n1(v)} more metres of ground for buried things`, {
  derive: (v, d) => { d.toolScan = (d.toolScan || 0) + v; },
});
def('affix:cond_lightRange', v => `Lights ${n1(v)} more metres of ground around you`, {
  derive: (v, d) => { d.lightRange = (d.lightRange || 0) + v; },
});
/**
 * R22 — `cond_lightSteady` AND `cond_lightWard` ARE GONE. A CONDITION THAT IS ALWAYS TRUE IS NOT A
 * CONDITION.
 *
 *   "A lantern I found grants 15% damage reduction 'while carrying a light'. That's silly, you are
 *    always carrying a light in this game. […] Also remove the property 'enemies are less likely to
 *    notice you' ITS A LIGHT LOL."
 *
 * `cond_lightWard` gated itself on `derived.lightRange > 0`, and `lightRange` is the stat the lamp
 * ITSELF grants (`cond_lightBase`, written from the base's range in js/gear.js). So the item wearing
 * the affix was the thing satisfying the affix's own condition, always, and R18's rewording — which
 * was an honest attempt to make the line match the hook — made that visible rather than fixing it.
 * A flat 10-25% damage reduction is the strongest defensive roll in the game and it was on the lamp.
 *
 * `cond_lightSteady` had the opposite problem twice over: it read backwards (a lit lamp making you
 * *harder* to see), and `derived.stealth` is pooled with the perk arm and applied ungated in
 * js/actors.js, so it was never conditional on the light either.
 *
 * Both are deleted from `SLOT_AFFIXES.light` in js/gear.js; `RETIRED_STATS` + `scrubRetired` in
 * js/affixes.js take them off a lamp an old save is already carrying. `derived.stealth` stays —
 * the perk arm still writes it and js/actors.js still reads it.
 */
/**
 * R18 — TWO WRITERS, TWO UNITS, AND ONE OF THEM BLEW THE MINIMAP OUT BY UP TO NINETY TIMES.
 *
 * The only consumer of `revealRange` is js/main.js's `hud.revealMul = 1 + derived.revealRange`,
 * feeding `span = minimapSpan * revealMul` — so it is a FRACTION. The perk arm writes fractions
 * (0.1 to 0.25) and was right; this affix wrote METRES, tuned 12-30 and capped at 90. A Finder's
 * lantern — which a merchant stocks — took the minimap from 26 cells to between 340 and 2100, and
 * the map drew outside its own texture.
 *
 * Its old sentence promised something else again: "shows chests and doorways N metres further out",
 * which had no reader anywhere. Rather than leave the affix inert and describe a feature that does
 * not exist, it now speaks the one unit that has a consumer, and says what it actually does.
 */
def('affix:cond_lightReveal', v => `The minimap shows ${pct(v)} more ground while you carry a light`, {
  derive: (v, d) => { d.revealRange = (d.revealRange || 0) + v; },
});

// The derive is `Math.max`, not `+=`, so this SETS the mount's speed rather than adding to it \u2014
// hence "rides at", the same wording as `cond_mountBase`, and the same two figures off WALK_MS.
def('affix:cond_mountSpeed',
  v => `This mount rides at ${n1(v)}\u00d7 your walking speed \u2014 ${n1(v * WALK_MS)} m/s at a walk, ${n1(v * WALK_MS * RUN_X)} m/s at a gallop`, {
    derive: (v, d) => { d.mountSpeed = Math.max(d.mountSpeed || 0, v); },
  });
def('affix:cond_mountStamina', v => `+${n1(v)}s of gallop before this mount drops back to a walk`, {
  derive: (v, d) => { d.mountStamina = (d.mountStamina || 0) + v; },
});
def('affix:cond_mountSlope', v => `This mount loses ${pct(v)} less speed to hills and broken ground`, {
  derive: (v, d) => { d.mountSlope = (d.mountSlope || 0) + v; },
});
def('affix:cond_mountTrample', v => `This mount deals ${n1(v)} trample damage to anything in its path`, {
  derive: (v, d) => { d.trample = (d.trample || 0) + v; },
});
def('affix:cond_mountCalm', v => `This mount is ${pct(v)} less likely to throw you when something charges`, {
  derive: (v, d) => { d.mountCalm = (d.mountCalm || 0) + v; },
});

// Quivers add DAMAGE, not armour — the play-test's change, and the reason they are worth a slot.
def('affix:cond_quiverDamage', v => `+${n1(v)} damage on every arrow you loose`, {
  derive: (v, d) => { d.arrowDamage = (d.arrowDamage || 0) + v; },
});
def('affix:cond_quiverElement', (v, a) => (a?.element
  ? `Every arrow deals ${a.element} damage instead of physical${markClause(a.element)}`
  : "Every arrow deals this quiver's own element as damage instead of physical, applying that element's status"), {});
def('affix:cond_quiverSplit', v => `Every shot looses ${n1(v)} arrows instead of 1`, {
  derive: (v, d) => { d.arrowsPerShot = Math.max(d.arrowsPerShot || 1, v); },
});
/**
 * Homing is a WIDER HIT TEST, not a curving arrow: js/main.js does
 * `field.hitScan(..., { width: 1.1 + homing * 2.6 })`. So the honest number on the card is the
 * width in metres that this quiver buys, against the 1.1 m a bare shot gets.
 */
def('affix:cond_quiverHoming', v => `Arrows hit anything within ${n1(1.1 + v * 2.6)} metres of your aim, up from 1.1 metres`, {
  derive: (v, d) => { d.arrowHoming = (d.arrowHoming || 0) + v; },
});
// js/main.js strikes the burst at `power: 0.55` — 55% of the arrow's damage to everything else.
def('affix:cond_quiverBurst', v => `Arrows burst on impact, dealing 55% of their damage to everything else within ${n1(v)} metres`, {
  derive: (v, d) => { d.arrowBurst = Math.max(d.arrowBurst || 0, v); },
});

// ───────────────────────────── legendary powers ─────────────────────────────
// The 24 ids in items.json `legendaryEffects`. Five of them were written for Emberveil's *travel*
// layer — camping, foraging, map nodes, night raids — which Farhold does not have in that shape, so
// each is translated to the nearest thing that is real here and the translation is written down.

// js/main.js: `plan.splash * sum('boltSplash')`, so the multiplier IS the radius multiplier.
def('legendary:mage_missile_aoe', "A spell bolt's impact covers 2x the radius.", { boltSplash: () => 2 });
// `perSecond` is 12% of the hit (at least 3) over 6s, so the bleed's total is 72% of the hit —
// the number the standard asks a damage-over-time to print — with a floor of 18 damage.
def('legendary:crit_bleed_5', "Critical hits apply a bleed worth 72% of the hit as damage over 6s (at least 18 damage).", {
  onCrit: (v, c) => c.applyStatus?.(c.target, 'bleed', { perSecond: Math.max(3, (c.amount || 0) * 0.12), seconds: 6, name: 'Bleeding', element: 'physical' }),
});
// js/main.js answers the flag with `strikeArea(..., 7, { element: 'arcane', power: 1.2 })`.
def('legendary:low_mana_shockwave', 'Casting a skill below 25% mana throws out an arcane shockwave, dealing 120% of your damage to everything within 7 metres.', {
  onCast: (v, c) => { if ((c.self.mp || 0) / Math.max(1, c.self.maxMp || 1) < 0.25) c.shockwave = 1; },
});
def('legendary:kill_party_heal', "Every kill heals you and each companion for 10% of the dead target's maximum health.", {
  onKill: (v, c) => { const h = Math.round((c.target?.maxHp || 0) * 0.1); c.heal = (c.heal || 0) + h; c.petHeal = (c.petHeal || 0) + h; },
});
// initiative is turn order there; here it is how fast you act, so it buys attack speed for the opening
def('legendary:speed_combat_init', '+40% attack speed for the first 6s of every fight.', {
  combatStart: (v, c) => { c.rt.openingHaste = 6; },
  derive: (v, d, unit, rt) => { if (rt?.openingHaste > 0) d.haste += 40; },
});
def('legendary:cheat_death_once', 'Once a fight, a killing blow leaves you at 1 health instead of killing you.', {
  preLethal: (v, c) => { if (c.rt.cheatSpent) return false; c.rt.cheatSpent = true; c.survive = 1; return true; },
});
def('legendary:burn_extend', 'Burning damage you apply lasts 2s longer.', {
  statusLonger: (v, c) => (c.type === 'burn' ? 2 : 0),
});
def('legendary:mana_on_attack', 'Every hit returns 3 mana.', {
  onHit: (v, c) => { c.mana = (c.mana || 0) + 3; },
});
def('legendary:critical_armorpen', "Critical hits ignore 30% of the target's armour.", {
  armorPen: (v, c) => (c.crit ? 0.3 : 0),
});
// The numbers are data/skills.json's `rally` status, which js/main.js hangs on the player: +20%
// damage, +15% resistance, 8s. Companions are NOT rallied — only the player is, so the card no
// longer says they are.
def('legendary:rally_on_kill', 'Every kill rallies you: +20% damage and +15% resistance for 8s.', {
  onKill: (v, c) => { c.rally = 8; },
});
// js/main.js re-casts the echo at `mult * 0.5` and `damage * 0.5` — half damage, no mana.
def('legendary:echo_cast', '25% of your skill casts fire a second time for 50% damage, free.', { echo: () => 0.25 });
def('legendary:dragon_fury_breath', 'Every kill breathes fire over everything within 7 metres, dealing 60% of your damage and setting them burning.', {
  onKill: (v, c) => { c.breath = { element: 'fire', radius: 7, status: 'burn' }; },
});
// travel translation: there is no camp here, so it mends whatever mends you
def('legendary:camp_mend', 'Every heal you receive restores 15% more health.', { healBonus: () => 0.15 });
// travel translation: rations become the materials a fight leaves behind. js/main.js rolls the
// chance on a kill and adds 2 scrap, so the card says both numbers.
def('legendary:forage_feast', '60% of kills leave 2 scrap behind.', { scavenge: () => 0.6 });
// `(kills - 50) * 0.004` capped at 0.4 — so 0.4% a kill past 50, and +40% at 150 kills.
def('legendary:naming_kills', 'This weapon earns a name at 50 kills, then gains +0.4% damage per kill after that, up to +40%.', {
  dmgOut: (v, c) => 1 + Math.min(0.4, Math.max(0, ((c.rt.weaponKills || 0) - 50) * 0.004)),
  onKill: (v, c) => { c.rt.weaponKills = (c.rt.weaponKills || 0) + 1; c.nameAt = 50; },
});
// travel translation: a map node becomes a place you have not stood before.
// No amount is stated because there is no amount to state — nothing in the game reads the `cache`
// hook yet, so the coin has no number anywhere. Whoever wires it up should put the figure here.
def('legendary:road_cache', 'Reaching a place you have not stood before turns up a cache of coin.', { cache: () => 1 });
def('legendary:companion_might', 'Your companions deal 40% more damage and have 25% more health.', {
  petPower: () => 1.4, petHealth: () => 1.25,
});
// js/main.js pops ONE modifier off the first enemy in the fight that is not rank `normal`.
def('legendary:strip_modifier', 'The first champion, rare or boss in a fight loses 1 of its modifiers when the fight starts.', {
  combatStart: (v, c) => { c.strip = 1; },
});
def('legendary:hated_blade', '+25% damage. (In Emberveil the party resents this blade; there is nobody here to mind.)', {
  dmgOut: () => 1.25,
});
def('legendary:kill_ledger', '+1% damage per 5 kills this weapon has taken, up to +60% at 300 kills.', {
  dmgOut: (v, c) => 1 + Math.min(0.6, Math.floor((c.rt.weaponKills || 0) / 5) * 0.01),
  onKill: (v, c) => { c.rt.weaponKills = (c.rt.weaponKills || 0) + 1; },
});
// `spreadStatuses` is the RADIUS js/main.js copies the statuses over: 9 metres.
def('legendary:curse_spreads', 'Every kill copies the burning, bleeding, poison and curses the target was suffering onto everything within 9 metres.', {
  onKill: (v, c) => { c.spreadStatuses = 9; },
});
// travel translation: an extra node of travel a day becomes ground covered on foot
def('legendary:free_move', '+18% move speed.', {
  derive: (v, d) => { d.movePct += 18; },
});
def('legendary:nemesis_hunter', '+100% damage to rares and bosses, and killing one heals you for 30% of your maximum health.', {
  dmgOut: (v, c) => (c.target?.rank === 'rare' || c.target?.rank === 'boss' ? 2 : 1),
  onKill: (v, c) => { if (c.target?.rank === 'rare' || c.target?.rank === 'boss') c.heal = (c.heal || 0) + Math.round((c.self.maxHp || 0) * 0.3); },
});
// js/main.js multiplies the night crowd's budget by 0.25 — a quarter as many, not none. The old
// line said "nothing ambushes you", which the code has never done and would not be a good game.
def('legendary:no_night_raids', '75% fewer enemies spawn around you after dark.', { noAmbush: () => 1 });

// ───────────────────────── round 23: the uniques' own powers ─────────────────────────
//
// "Generate 2 uniques of every type… Some of these new weapons could inflict special dots or impart
// effects on the user or have interesting auto-attack mechanics." data/uniques.json holds the items;
// these are the powers they carry. Every number a card prints is a constant in `U23` below, and the
// hook reads the SAME constant — so the sentence and the code cannot drift apart.
//
// Three families, and where each one is paid out:
//
//   * damage over time and marks — the hook calls `c.applyStatus` from inside `rpg.strike`, with a
//     status spec js/skills.js knows how to stack, ramp, grow or detonate;
//   * the wielder — `derive` on a timer in `rt`, or `dmgOut`/`dmgIn`/`critBonus`/`onDamaged`;
//   * the attack itself — `onAttack` runs once per swing, shot, bolt or staff cast
//     (`rpg.attackMods`) and writes REQUESTS onto the context (`fullCircle`, `chain`, `patch`…).
//     js/uniques.js `resolveAttack` carries each request out against the field, and js/main.js calls
//     it after every attack. A request nothing carries out would be this project's signature bug,
//     so tests/round23-uniques.test.js drives every one of them through `resolveAttack`.
//
// A strike made BY one of these procs carries `proc: true`, and every hook that starts another proc
// checks it first — otherwise chain lightning would chain off its own chain until the field ran dry.

/** Every magnitude the round-23 powers use. One place, read by the text and the hook alike. */
export const U23 = {
  rot: { share: 0.6, seconds: 6, radius: 6 },
  frostbite: { slowPerStack: 0.08, stacks: 5, seconds: 5, freeze: 1.5 },
  hemorrhage: { share: 0.5, seconds: 5, perMetre: 0.1, cap: 1.5 },
  kindling: { start: 0.08, seconds: 5, ramp: 0.5, cap: 3 },
  venom: { share: 0.2, seconds: 6, stacks: 5 },
  doom: { seconds: 4, share: 0.4 },
  shatter: 0.5,
  staticArc: { range: 8, power: 0.5 },
  bloodPrice: { damage: 0.35, cost: 0.015 },
  critWard: { share: 0.2, cap: 0.25 },
  frenzy: { seconds: 6, stacks: 5, haste: 8, move: 4 },
  manaBurn: { mana: 4, damage: 0.45 },
  glassHeart: { out: 0.5, in: 0.25 },
  siphon: { share: 0.12, seconds: 4 },
  secondWind: { below: 0.3, barrier: 0.35, every: 45 },
  stride: 0.25,
  stillness: { crit: 30, after: 1.5 },
  thornmail: 0.4,
  retaliate: { chance: 0.2, radius: 5, power: 0.6 },
  pyre: { every: 1, radius: 4, power: 0.15 },
  critHeal: 0.03,
  cull: 0.1,
  bulwark: { damage: 0.2, seconds: 4 },
  barrierBurst: { radius: 5, power: 0.8, every: 10 },
  resonance: { per: 0.12, cap: 0.6 },
  opportunist: 0.3,
  trance: 5,
  overflow: { regen: 2, damage: 0.2 },
  cleave: 3,
  slam: { every: 3, radius: 4, power: 0.7, push: 2 },
  cycle: ['fire', 'ice', 'lightning'],
  trail: { radius: 2.5, seconds: 3, power: 0.25, every: 1 },
  chain: { jumps: 3, range: 8, power: 0.4 },
  ricochet: { bounces: 2, range: 10, power: 0.6 },
  split: { shards: 3, range: 8, power: 0.35 },
  volley: { every: 4, arrows: 3 },
  gravity: { radius: 5, pull: 2.5 },
  echo: { chance: 0.25, ms: 300, power: 0.6 },
  crescendo: { per: 0.06, cap: 5, radius: 5, power: 1, idle: 3 },
  twin: { ms: 200, power: 0.5 },
  overload: { every: 4, power: 2, scale: 1.5 },
  riderFury: { damage: 0.3, speed: 0.15, seconds: 5 },
  stormrider: { every: 2, range: 12, power: 0.6 },
  searing: { every: 2, radius: 10, power: 0.12 },
  dread: { radius: 8, dealLess: 0.15, every: 1 },
  prospector: 0.2,
  quickHands: { speed: 0.3, move: 20, seconds: 5 },
};

/** The timers the round-23 powers run on. `Effects.update` ticks every one of them. */
export const U23_TIMERS = ['frenzyFor', 'secondWind', 'barrierBurst', 'bulwark', 'riderRush', 'quickHands', 'crescendoIdle', 'trailCd'];

const hpFrac = u => (u?.hp ?? 0) / Math.max(1, u?.maxHp || 1);
const slowed = t => Object.values(t?.statuses || {}).some(s => (s?.slow || 0) > 0);
/** Count an attack of one kind on the runtime. Returns the new count. */
const countAttack = (c, key) => { c.rt[key] = (c.rt[key] || 0) + 1; return c.rt[key]; };

// ---- damage over time and marks

def('legendary:rot_spread', `Every hit applies Rot: ${pct(U23.rot.share)} of the hit as poison damage over ${U23.rot.seconds}s. An enemy that dies while rotting passes the Rot to every enemy within ${U23.rot.radius} metres.`, {
  onHit: (v, c) => {
    if (!c.target || !(c.amount > 0)) return;
    c.applyStatus?.(c.target, 'rot', { perSecond: c.amount * U23.rot.share / U23.rot.seconds, seconds: U23.rot.seconds, element: 'poison', name: 'Rot', kind: 'damage' });
  },
  onKill: (v, c) => {
    const st = c.target?.statuses?.rot;
    if (st) c.spreadRot = { radius: U23.rot.radius, perSecond: st.perSecond, power: st.power || 1, seconds: U23.rot.seconds };
  },
});
def('legendary:frostbite', `Every hit adds a stack of Frostbite for ${U23.frostbite.seconds}s: -${pct(U23.frostbite.slowPerStack)} move speed per stack. At ${U23.frostbite.stacks} stacks the enemy is Frozen and cannot move for ${U23.frostbite.freeze}s, and the stacks clear.`, {
  onHit: (v, c) => {
    if (!c.target || !(c.amount > 0) || c.target.statuses?.frozen) return;
    c.applyStatus?.(c.target, 'frostbite', {
      seconds: U23.frostbite.seconds, slowPerStack: U23.frostbite.slowPerStack, stackMax: U23.frostbite.stacks,
      element: 'ice', name: 'Frostbite', kind: 'slow',
      onMax: { type: 'frozen', spec: { seconds: U23.frostbite.freeze, slow: 1, element: 'ice', name: 'Frozen', kind: 'slow' } },
    });
  },
});
def('legendary:hemorrhage', `Critical hits open a Hemorrhage: ${pct(U23.hemorrhage.share)} of the hit as bleed damage over ${U23.hemorrhage.seconds}s, +${pct(U23.hemorrhage.perMetre)} for every metre the enemy moves while bleeding, up to +${pct(U23.hemorrhage.cap)}.`, {
  onCrit: (v, c) => {
    if (!c.target || !(c.amount > 0)) return;
    c.applyStatus?.(c.target, 'hemorrhage', {
      perSecond: c.amount * U23.hemorrhage.share / U23.hemorrhage.seconds, seconds: U23.hemorrhage.seconds,
      growOnMove: U23.hemorrhage.perMetre, growCap: U23.hemorrhage.cap, element: 'physical', name: 'Hemorrhage', kind: 'damage',
    });
  },
});
def('legendary:kindling', `Every hit sets Kindling for ${U23.kindling.seconds}s: fire damage starting at ${pct(U23.kindling.start)} of the hit a second and rising by ${pct(U23.kindling.start * U23.kindling.ramp)} of the hit for every second Kindling keeps burning, up to ${pct(U23.kindling.start * U23.kindling.cap)} a second.`, {
  onHit: (v, c) => {
    if (!c.target || !(c.amount > 0)) return;
    c.applyStatus?.(c.target, 'kindling', {
      perSecond: c.amount * U23.kindling.start, seconds: U23.kindling.seconds,
      ramp: U23.kindling.ramp, rampCap: U23.kindling.cap, element: 'fire', name: 'Kindling', kind: 'damage',
    });
  },
});
def('legendary:venom_stack', `Every hit adds a stack of Venom, up to ${U23.venom.stacks}: each stack deals ${pct(U23.venom.share)} of the hit as poison damage over ${U23.venom.seconds}s, and each new stack refreshes the rest.`, {
  onHit: (v, c) => {
    if (!c.target || !(c.amount > 0)) return;
    c.applyStatus?.(c.target, 'venom', {
      perSecond: c.amount * U23.venom.share / U23.venom.seconds, seconds: U23.venom.seconds, stackMax: U23.venom.stacks,
      element: 'poison', name: 'Venom', kind: 'damage',
    });
  },
});
def('legendary:doom', `The first hit on an enemy lays Doom for ${U23.doom.seconds}s. When Doom ends, the enemy takes ${pct(U23.doom.share)} of all the damage you dealt that enemy in those ${U23.doom.seconds}s again, as shadow damage.`, {
  onHit: (v, c) => {
    if (!c.target || !(c.amount > 0)) return;
    if (!c.target.statuses?.doom) {
      c.applyStatus?.(c.target, 'doom', { seconds: U23.doom.seconds, detonate: U23.doom.share, element: 'shadow', name: 'Doom', kind: 'debuff' });
    }
    const st = c.target.statuses?.doom;
    if (st) st.stored = (st.stored || 0) + c.amount;
  },
});
def('legendary:shatter', `+${pct(U23.shatter)} damage to Chilled, Frostbitten or Frozen enemies.`, {
  dmgOut: (v, c) => {
    const s = c.target?.statuses || {};
    return s.chill || s.frozen || s.frostbite ? 1 + U23.shatter : 1;
  },
});
def('legendary:static_charge', `Every hit on a Shocked enemy arcs lightning to 1 other enemy within ${U23.staticArc.range} metres for ${pct(U23.staticArc.power)} of your damage.`, {
  onHit: (v, c) => {
    if (c.proc || !c.target?.statuses?.shock || !(c.amount > 0)) return;
    (c.procs || (c.procs = [])).push({ kind: 'arc', from: c.target, range: U23.staticArc.range, power: U23.staticArc.power, element: 'lightning' });
  },
});

// ---- the wielder

def('legendary:blood_price', `+${pct(U23.bloodPrice.damage)} damage. Every attack costs ${n1(U23.bloodPrice.cost * 100)}% of your maximum health; this cannot take you below 1 health.`, {
  dmgOut: () => 1 + U23.bloodPrice.damage,
  onAttack: (v, c) => { c.selfCost = (c.selfCost || 0) + (c.self?.maxHp || 0) * U23.bloodPrice.cost; },
});
def('legendary:crit_ward', `Critical hits give you a barrier worth ${pct(U23.critWard.share)} of the damage dealt, up to ${pct(U23.critWard.cap)} of your maximum health.`, {
  onCrit: (v, c) => {
    if (!c.self || !(c.amount > 0)) return;
    const cap = (c.self.maxHp || 0) * U23.critWard.cap;
    c.self.barrier = Math.min(cap, (c.self.barrier || 0) + c.amount * U23.critWard.share);
  },
});
def('legendary:kill_frenzy', `Every kill adds a stack of Frenzy for ${U23.frenzy.seconds}s, up to ${U23.frenzy.stacks}: +${U23.frenzy.haste}% attack speed and +${U23.frenzy.move}% move speed per stack.`, {
  onKill: (v, c) => { c.rt.frenzy = Math.min(U23.frenzy.stacks, (c.rt.frenzy || 0) + 1); c.rt.frenzyFor = U23.frenzy.seconds; },
  derive: (v, d, unit, rt) => {
    if (!(rt?.frenzyFor > 0) || !rt.frenzy) return;
    d.haste += rt.frenzy * U23.frenzy.haste;
    d.movePct += rt.frenzy * U23.frenzy.move;
  },
});
def('legendary:mana_burn', `Every hit spends ${U23.manaBurn.mana} mana to deal +${pct(U23.manaBurn.damage)} damage. With less than ${U23.manaBurn.mana} mana, hits deal normal damage.`, {
  dmgOut: (v, c) => {
    c.rt.burnArmed = !c.proc && (c.self?.mp || 0) >= U23.manaBurn.mana;
    return c.rt.burnArmed ? 1 + U23.manaBurn.damage : 1;
  },
  onHit: (v, c) => {
    if (!c.rt.burnArmed) return;
    c.rt.burnArmed = false;
    c.self.mp = Math.max(0, (c.self.mp || 0) - U23.manaBurn.mana);
  },
});
def('legendary:glass_heart', `+${pct(U23.glassHeart.out)} damage dealt and +${pct(U23.glassHeart.in)} damage taken.`, {
  dmgOut: () => 1 + U23.glassHeart.out,
  dmgIn: () => 1 + U23.glassHeart.in,
});
def('legendary:vampire_kill', `Every kill heals you for ${pct(U23.siphon.share)} of your maximum health over ${U23.siphon.seconds}s.`, {
  onKill: (v, c) => {
    c.selfStatus = { type: 'siphon', spec: { healPerSecond: U23.siphon.share / U23.siphon.seconds, seconds: U23.siphon.seconds, name: 'Siphon', kind: 'buff', element: 'shadow' } };
  },
});
def('legendary:second_wind', `When a hit leaves you below ${pct(U23.secondWind.below)} health, you gain a barrier worth ${pct(U23.secondWind.barrier)} of your maximum health. Once every ${U23.secondWind.every}s.`, {
  onDamaged: (v, c) => {
    if ((c.rt.secondWind || 0) > 0 || hpFrac(c.self) >= U23.secondWind.below || (c.self?.hp ?? 0) <= 0) return;
    c.rt.secondWind = U23.secondWind.every;
    c.self.barrier = (c.self.barrier || 0) + (c.self.maxHp || 0) * U23.secondWind.barrier;
    c.secondWind = true;
  },
});
def('legendary:stride', `+${pct(U23.stride)} damage while you are moving.`, {
  dmgOut: (v, c) => (c.self?.moving > 0 ? 1 + U23.stride : 1),
});
def('legendary:stillness', `+${U23.stillness.crit}% critical chance once you have stood still for ${U23.stillness.after}s.`, {
  critBonus: (v, c) => ((c.rt.still || 0) >= U23.stillness.after ? U23.stillness.crit : 0),
});
// read by `rpg.strike`'s thorns line: `share = d.thorns + fx.sum(defender, 'reflect')`
def('legendary:thornmail', `${pct(U23.thornmail)} of the damage you take from each hit is dealt back to the attacker.`, {
  reflect: () => U23.thornmail,
});
def('legendary:retaliate_nova', `Every hit you take has a ${pct(U23.retaliate.chance)} chance to release a frost nova: ${pct(U23.retaliate.power)} of your damage as ice damage to every enemy within ${U23.retaliate.radius} metres, applying Chilled (-45% move speed for 4s).`, {
  onDamaged: (v, c) => {
    if (!(c.amount > 0) || (c.rng ? c.rng() : Math.random()) >= U23.retaliate.chance) return;
    (c.procs || (c.procs = [])).push({ kind: 'nova', radius: U23.retaliate.radius, power: U23.retaliate.power, element: 'ice', status: 'chill' });
  },
});
def('legendary:frost_skin', 'Every enemy that hits you in melee is Chilled: -45% move speed for 4s.', {
  onDamaged: (v, c) => {
    if (c.ranged || !c.target || c.target.equipment) return;
    c.applyStatus?.(c.target, 'chill', { slow: 0.45, seconds: 4, element: 'ice', name: 'Chilled', kind: 'slow' });
  },
});
// asked by `rpg.auraList` every frame; js/uniques.js `tickAuras` owns the clock and the strike
def('legendary:pyre_aura', `Every ${U23.pyre.every}s in a fight, every enemy within ${U23.pyre.radius} metres of you takes ${pct(U23.pyre.power)} of your damage as fire damage and is set Burning (105% of that hit as fire damage over 5s).`, {
  aura: (v, c) => { c.auras.push({ id: 'pyre', every: U23.pyre.every, radius: U23.pyre.radius, power: U23.pyre.power, element: 'fire', status: 'burn' }); },
});
def('legendary:crit_heal', `Critical hits heal you for ${pct(U23.critHeal)} of your maximum health.`, {
  onCrit: (v, c) => {
    if (!c.self || c.self.hp == null) return;
    c.self.hp = Math.min(c.self.maxHp || c.self.hp, c.self.hp + Math.round((c.self.maxHp || 0) * U23.critHeal));
  },
});
def('legendary:cull', `A hit that leaves an ordinary enemy or a champion below ${pct(U23.cull)} health kills that enemy outright. Rares and bosses are immune.`, {
  onHit: (v, c) => {
    const t = c.target;
    if (!t || (t.hp ?? 0) <= 0 || t.equipment) return;
    if (t.rank === 'rare' || t.rank === 'boss' || t.worldBoss) return;
    if (hpFrac(t) < U23.cull) c.cull = true;
  },
});
def('legendary:bulwark', `Every hit you block gives +${pct(U23.bulwark.damage)} damage for ${U23.bulwark.seconds}s.`, {
  onDamaged: (v, c) => { if (c.blocked > 0) c.rt.bulwark = U23.bulwark.seconds; },
  dmgOut: (v, c) => ((c.rt.bulwark || 0) > 0 ? 1 + U23.bulwark.damage : 1),
});
def('legendary:barrier_burst', `When your barrier breaks, the barrier bursts: ${pct(U23.barrierBurst.power)} of your damage as arcane damage to every enemy within ${U23.barrierBurst.radius} metres. Once every ${U23.barrierBurst.every}s.`, {
  onDamaged: (v, c) => {
    if (!(c.absorbed > 0) || (c.self?.barrier || 0) > 0 || (c.rt.barrierBurst || 0) > 0) return;
    c.rt.barrierBurst = U23.barrierBurst.every;
    (c.procs || (c.procs = [])).push({ kind: 'nova', radius: U23.barrierBurst.radius, power: U23.barrierBurst.power, element: 'arcane' });
  },
});
def('legendary:resonance', `+${pct(U23.resonance.per)} damage for every different status on the enemy, up to +${pct(U23.resonance.cap)}.`, {
  dmgOut: (v, c) => 1 + Math.min(U23.resonance.cap, Object.keys(c.target?.statuses || {}).length * U23.resonance.per),
});
def('legendary:opportunist', `+${pct(U23.opportunist)} damage to enemies that are slowed by anything: Chilled, Frostbitten, Frozen, Cursed or Snared.`, {
  dmgOut: (v, c) => (slowed(c.target) ? 1 + U23.opportunist : 1),
});
def('legendary:battle_trance', `Every ${U23.trance}th hit in a row on the same enemy is a guaranteed critical hit.`, {
  critBonus: (v, c) => (c.rt.tranceOn === c.target?.id && ((c.rt.trance || 0) + 1) % U23.trance === 0 ? 1000 : 0),
  onHit: (v, c) => {
    if (c.proc) return;
    if (c.rt.tranceOn === c.target?.id) c.rt.trance = (c.rt.trance || 0) + 1;
    else { c.rt.tranceOn = c.target?.id; c.rt.trance = 1; }
  },
});
def('legendary:overflow', `+${U23.overflow.regen} mana a second, and +${pct(U23.overflow.damage)} damage while your mana is full.`, {
  derive: (v, d) => { d.mpRegen += U23.overflow.regen; },
  dmgOut: (v, c) => ((c.self?.mp ?? 0) >= (c.self?.maxMp ?? Infinity) - 0.5 ? 1 + U23.overflow.damage : 1),
});

// ---- the attack itself. `c.kind` is 'melee', 'arrow', 'bolt' or 'staff'.

def('legendary:third_cleave', `Every ${U23.cleave}rd melee swing becomes a full circle around you at the weapon's reach.`, {
  onAttack: (v, c) => { if (c.kind === 'melee' && countAttack(c, 'cleaveCount') % U23.cleave === 0) c.fullCircle = true; },
});
def('legendary:quake_slam', `Every ${U23.slam.every}rd melee swing also slams the ground: ${pct(U23.slam.power)} of your damage to every enemy within ${U23.slam.radius} metres, knocking them ${U23.slam.push} metres back.`, {
  onAttack: (v, c) => {
    if (c.kind === 'melee' && countAttack(c, 'slamCount') % U23.slam.every === 0) c.slam = { radius: U23.slam.radius, power: U23.slam.power, push: U23.slam.push };
  },
});
def('legendary:alternate_elements', 'Your attacks cycle fire, ice, lightning: each attack deals that element\'s damage and applies its status (Burning: 105% of the hit over 5s; Chilled: -45% move speed for 4s; Shocked: +30% damage taken for 5s).', {
  onAttack: (v, c) => {
    const i = c.rt.cycle || 0;
    c.element = U23.cycle[i % U23.cycle.length];
    c.rt.cycle = (i + 1) % U23.cycle.length;
  },
});
def('legendary:fire_trail', `An attack that hits leaves burning ground under the first enemy hit, at most once every ${U23.trail.every}s: ${n1(U23.trail.radius * 2)} metres across for ${U23.trail.seconds}s, dealing ${pct(U23.trail.power)} of your damage as fire damage every 0.75s.`, {
  onAttack: (v, c) => {
    if ((c.rt.trailCd || 0) > 0) return;
    c.patch = { radius: U23.trail.radius, seconds: U23.trail.seconds, power: U23.trail.power, element: 'fire', cooldown: U23.trail.every };
  },
});
def('legendary:chain_lightning', `Every attack that hits jumps lightning to up to ${U23.chain.jumps} more enemies within ${U23.chain.range} metres, dealing ${pct(U23.chain.power)} of your damage to each.`, {
  onAttack: (v, c) => { c.chain = { jumps: U23.chain.jumps, range: U23.chain.range, power: U23.chain.power, element: 'lightning' }; },
});
def('legendary:ricochet', `Arrows that hit an enemy bounce to another enemy within ${U23.ricochet.range} metres for ${pct(U23.ricochet.power)} of your damage, up to ${U23.ricochet.bounces} bounces.`, {
  onAttack: (v, c) => { if (c.kind === 'arrow') c.ricochet = { bounces: U23.ricochet.bounces, range: U23.ricochet.range, power: U23.ricochet.power }; },
});
def('legendary:split_bolt', `Bolts split on impact into ${U23.split.shards} shards, each hitting a different enemy within ${U23.split.range} metres for ${pct(U23.split.power)} of your damage.`, {
  onAttack: (v, c) => { if (c.kind === 'bolt' || c.kind === 'staff') c.split = { shards: U23.split.shards, range: U23.split.range, power: U23.split.power }; },
});
def('legendary:fourth_volley', `Every ${U23.volley.every}th shot looses ${U23.volley.arrows} arrows in a fan instead of 1.`, {
  onAttack: (v, c) => { if (c.kind === 'arrow' && countAttack(c, 'volleyCount') % U23.volley.every === 0) c.shots = Math.max(c.shots || 1, U23.volley.arrows); },
});
def('legendary:gravity_bolt', `Bolt impacts pull every enemy within ${U23.gravity.radius} metres ${U23.gravity.pull} metres toward the impact.`, {
  onAttack: (v, c) => { if (c.kind === 'bolt' || c.kind === 'staff') c.pull = { radius: U23.gravity.radius, metres: U23.gravity.pull }; },
});
def('legendary:echo_strike', `${pct(U23.echo.chance)} of your melee hits strike the same enemy again ${U23.echo.ms / 1000}s later for ${pct(U23.echo.power)} of your damage.`, {
  onAttack: (v, c) => { if (c.kind === 'melee') c.echo = { chance: U23.echo.chance, ms: U23.echo.ms, power: U23.echo.power }; },
});
def('legendary:crescendo', `Every attack in a row adds +${pct(U23.crescendo.per)} damage, up to +${pct(U23.crescendo.per * U23.crescendo.cap)} at ${U23.crescendo.cap} attacks. The ${U23.crescendo.cap + 1}th attack releases a shockwave, ${pct(U23.crescendo.power)} of your damage to every enemy within ${U23.crescendo.radius} metres, and the count starts again. The count resets after ${U23.crescendo.idle}s without attacking.`, {
  onAttack: (v, c) => {
    c.rt.crescendoIdle = U23.crescendo.idle;
    const n = (c.rt.crescendo || 0) + 1;
    if (n > U23.crescendo.cap) {
      c.rt.crescendo = 0;
      c.shockwave = { radius: U23.crescendo.radius, power: U23.crescendo.power };
    } else c.rt.crescendo = n;
  },
  dmgOut: (v, c) => 1 + U23.crescendo.per * Math.min(U23.crescendo.cap, c.rt.crescendo || 0),
});
def('legendary:twin_bolt', `Every bolt is followed by a second bolt ${U23.twin.ms / 1000}s later for ${pct(U23.twin.power)} of the damage.`, {
  onAttack: (v, c) => { if (c.kind === 'bolt') c.twin = { ms: U23.twin.ms, power: U23.twin.power }; },
});
def('legendary:overload', `Every ${U23.overload.every}th spell a staff casts deals ${U23.overload.power}x damage and covers ${pct(U23.overload.scale - 1)} more ground.`, {
  onAttack: (v, c) => {
    if (c.kind !== 'staff' || countAttack(c, 'overloadCount') % U23.overload.every !== 0) return;
    c.power *= U23.overload.power;
    c.scale *= U23.overload.scale;
    c.overloaded = true;
  },
});

// ---- the mount, the light and the tool

def('legendary:rider_fury', `+${pct(U23.riderFury.damage)} damage while mounted. Every kill while mounted makes your mount ${pct(U23.riderFury.speed)} faster for ${U23.riderFury.seconds}s.`, {
  dmgOut: (v, c) => (c.self?.mounted ? 1 + U23.riderFury.damage : 1),
  onKill: (v, c) => { if (c.self?.mounted) c.rt.riderRush = U23.riderFury.seconds; },
  derive: (v, d, unit, rt) => { if (rt?.riderRush > 0) d.mountSpeed = (d.mountSpeed || 0) * (1 + U23.riderFury.speed); },
});
def('legendary:stormrider', `While you are mounted and in a fight, every ${U23.stormrider.every}s lightning strikes the nearest enemy within ${U23.stormrider.range} metres for ${pct(U23.stormrider.power)} of your damage.`, {
  aura: (v, c) => { if (c.self?.mounted) c.auras.push({ id: 'stormrider', every: U23.stormrider.every, radius: U23.stormrider.range, power: U23.stormrider.power, element: 'lightning', nearestOnly: true }); },
});
def('legendary:searing_light', `Every ${U23.searing.every}s in a fight, the light burns every enemy within ${U23.searing.radius} metres of you for ${pct(U23.searing.power)} of your damage as holy damage.`, {
  aura: (v, c) => { c.auras.push({ id: 'searing', every: U23.searing.every, radius: U23.searing.radius, power: U23.searing.power, element: 'holy' }); },
});
def('legendary:dread_lantern', `Every enemy within ${U23.dread.radius} metres of you in a fight is Unnerved and deals ${pct(U23.dread.dealLess)} less damage.`, {
  aura: (v, c) => {
    c.auras.push({ id: 'dread', every: U23.dread.every, radius: U23.dread.radius, power: 0,
      apply: { type: 'unnerved', spec: { dealLess: U23.dread.dealLess, seconds: U23.dread.every + 0.5, name: 'Unnerved', kind: 'debuff', element: 'shadow' } } });
  },
});
// asked by `rpg.gatherBonus` when a gather bar fills (js/main.js `beginGather`)
def('legendary:prospector', `Every gather you finish has a ${pct(U23.prospector)} chance to pay out twice.`, {
  gatherDone: (v, c) => { if ((c.rng ? c.rng() : Math.random()) < U23.prospector) c.times = Math.max(c.times || 1, 2); },
});
def('legendary:quick_hands', `+${pct(U23.quickHands.speed)} gathering speed, and every gather you finish gives +${U23.quickHands.move}% move speed for ${U23.quickHands.seconds}s.`, {
  derive: (v, d, unit, rt) => {
    d.gatherSpeed = (d.gatherSpeed || 0) + U23.quickHands.speed;
    if (rt?.quickHands > 0) d.movePct += U23.quickHands.move;
  },
  gatherDone: (v, c) => { c.rt.quickHands = U23.quickHands.seconds; },
});

/**
 * Derived stats whose ONLY consumer is one of the hooks above.
 *
 * `js/pets.js` asks `rpg.fx.product(owner, 'petPower')` and nothing else, so a stat that a perk
 * adds to the sheet can never reach a companion unless it is folded in here.
 */
export const DERIVED_INTO_HOOK = {
  petPower: d => 1 + (d.petDamagePct || 0) / 100,
};

/**
 * The same seam for the hooks that are ADDED rather than multiplied.
 *
 * `js/main.js` already asks `rpg.fx.sum(player, 'echo')` before a cast and `sum(player,'scavenge')`
 * on a kill — for the two legendary powers. The perk forest's Echo and Scavenger nodes wanted
 * exactly those two things and had no way to reach them, so they were flags nothing read. Folding
 * the derived number in here makes both nodes live without a line anywhere else.
 */
export const DERIVED_INTO_SUM = {
  // …and the SKILL just cast gets a say as well as the sheet: the Echo talent on one skill sets
  // `castRules.echo`, and js/main.js asks for this immediately after that skill's plan comes back.
  echo: (d, unit) => (d.echoChance || 0) + (unit?.castRules?.echo || 0),
  scavenge: d => d.scavengeChance || 0,
};

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
  // The AFFIX goes through too, not just its number: `castElement` and `cond_quiverElement` carry
  // no number at all and everything they have to say is on the affix ("Every hit lands as fire"),
  // which is why they used to print a sentence with no element in it.
  return e.desc(affix.value ?? 1, affix);
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
    /**
     * R23 — A UNIQUE'S POWER WAS COUNTED TWICE.
     *
     * A unique carries its power as an affix row (`stat: 'cond_legendaryEffect'`, so the card can
     * print it) AND as `legendaryEffectId`, which `rpg.legendaryPowers` collects so set powers and
     * unique powers arrive through one list. This loop read both — so every unique in the game ran
     * its legendary twice: The Ingrate's "+25% damage" was +56%, Truthseeker's splash was 4x the
     * radius, and every on-kill heal paid double. Found by the first round-23 test that asked a
     * unique for its multiplier. A legendary power is one thing, whatever carries it, and a second
     * copy from a second item is not a second power either — `legendaryPowers` is already a Set.
     */
    const legendary = new Set();
    for (const item of Object.values(unit.equipment || {})) {
      if (!item) continue;
      for (const a of item.affixes || []) {
        const id = effectFor(a);
        if (!id) continue;
        if (id.startsWith('legendary:')) { if (legendary.has(id)) continue; legendary.add(id); }
        out.push({ id, e: EFFECTS[id], v: a.value ?? 1 });
      }
    }
    for (const id of unit.legendaryPowers || []) {
      if (!EFFECTS[id] || legendary.has(id)) continue;
      legendary.add(id);
      out.push({ id, e: EFFECTS[id], v: 1 });
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

  /**
   * Tick the timers that conditional affixes run on.
   *
   * THIS HAS TO BE CALLED EVERY FRAME. Round 6 found that nothing ever did — which is why "the move
   * speed on hit proc doesn't seem to work in game". `combatStart` set `openingRush` and nothing
   * ever counted it down or recomputed the sheet while it was up, so the buff existed in the
   * registry and nowhere else. Four other affixes were dead for the same reason:
   * `cond_sustainedDmgBonus` (needs `inCombat` to climb), `cond_killInitBonus`,
   * `cond_afterSkillSpellPow`, and cheat death's own cooldown.
   *
   * Returns the runtime, and sets `rt.dirty` when the derived sheet needs rebuilding — see
   * `timerSignature` for why that is not simply "every frame".
   */
  update(unit, dt, { fighting = false } = {}) {
    const rt = this.rt(unit);
    rt.inCombat = fighting ? rt.inCombat + dt : 0;
    if (!fighting) { rt.streak = 0; rt.streakOn = null; rt.hitOnce = new Set(); rt.trance = 0; rt.tranceOn = null; }
    for (const k of ['cheatDeath', 'skillPower', 'killRush', 'openingRush', ...U23_TIMERS]) {
      if (rt[k] > 0) rt[k] = Math.max(0, rt[k] - dt);
    }
    // R23: a stack or a count that lives on a timer goes when its timer does
    if (!(rt.frenzyFor > 0)) rt.frenzy = 0;
    if (!(rt.crescendoIdle > 0)) rt.crescendo = 0;
    // `legendary:stillness` — how long this unit has stood still, read by its crit hook
    rt.still = unit.moving > 0 ? 0 : (rt.still || 0) + dt;
    const sig = this.timerSignature(rt);
    rt.dirty = sig !== rt._sig;
    rt._sig = sig;
    return rt;
  }

  /**
   * A short string that changes only when a timed affix would actually pay out differently.
   *
   * Re-deriving the whole sheet sixty times a second to notice that a four-second buff is still on
   * is waste; re-deriving only when it starts and ends misses `cond_sustainedDmgBonus`, which steps
   * up every five seconds it stays in the fight. So the signature buckets the timers: on or off for
   * the flat ones, and in five-second steps for the one that grows.
   */
  timerSignature(rt) {
    return [
      rt.openingRush > 0 ? 1 : 0,
      rt.killRush > 0 ? 1 : 0,
      rt.skillPower > 0 ? 1 : 0,
      Math.min(5, Math.floor((rt.inCombat || 0) / 5)),
      // R23: the timed powers that write to the sheet — Frenzy's stacks, the rider's rush, quick hands
      rt.frenzyFor > 0 ? rt.frenzy || 0 : 0,
      rt.riderRush > 0 ? 1 : 0,
      rt.quickHands > 0 ? 1 : 0,
    ].join('');
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
  /** R23 — once per swing, shot, bolt or staff cast. See `rpg.attackMods`. */
  onAttack(c) { return this.fire('onAttack', c); }
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
    const fold = DERIVED_INTO_SUM[name];
    if (fold && unit.derived) total += fold(unit.derived, unit) || 0;
    return total;
  }
  product(unit, name, c = {}) {
    c.rt = this.rt(unit); c.self = unit;
    let total = 1;
    for (const { e, v } of this.effects(unit)) if (e[name]) total *= e[name](v, c) || 1;
    // …and the derived sheet gets a say where the only reader is a hook. `js/pets.js` asks for
    // `petPower`, never for `derived.petDamagePct`, so every perk node and keystone that said
    // "companions hit 18% harder" was doing nothing at all. One table, so the seam is visible.
    const fold = DERIVED_INTO_HOOK[name];
    if (fold && unit.derived) total *= fold(unit.derived) || 1;
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

// ---------------------------------------------------------------------------------------------
// R25 — THE CASTER'S OFF HAND. "Book/tome should be an off-hand for casters to use along with a
// wand. They should have their own distinct feature… drastically different compared to using a 2nd
// wand or a shield." Four foci (js/foci.js puts the bases in), each doing a job nothing else does:
// the Grimoire adds a page to your bolts, the Seer's Orb keeps a mote that fights for you, the
// Reliquary answers a blow with light, and the Effigy makes every curse you lay last and bite.
// Built only from hooks that already have readers: `twin` on a bolt, a `nearestOnly` aura, a
// `nova` proc on being hit, `statusLonger` / `statusPower`, and `derive`.

/** Your weapon's element, for a focus that fights in it. */
const focusElement = unit => unit?.equipment?.weapon?.brand || unit?.equipment?.weapon?.castElement || 'arcane';
export const FOCI = {
  grimoire: { every: 3, page: 0.6, pageMs: 170, manaCut: 0.15 },
  orb: { every: 1.4, radius: 9, power: 0.3 },
  relic: { chance: 0.25, radius: 4.5, power: 0.6, heal: 0.04, barrierRegen: 2 },
  idol: { longer: 2, power: 0.25 },
};

def('affix:cond_focusGrimoire', () => `Every ${FOCI.grimoire.every}rd bolt from your wand throws a page with it: a second bolt of the same element for ${pct(FOCI.grimoire.page)} damage. Your skills cost ${pct(FOCI.grimoire.manaCut)} less mana.`, {
  onAttack: (v, c) => {
    if (c.kind !== 'bolt') return;
    if (countAttack(c, 'pageCount') % FOCI.grimoire.every === 0) c.twin = { ms: FOCI.grimoire.pageMs, power: FOCI.grimoire.page * (v > 1 ? v : 1) };
  },
  derive: (v, d) => { d.skillCostPct = Math.min(0.6, (d.skillCostPct || 0) + FOCI.grimoire.manaCut); },
});
def('affix:cond_focusOrb', () => `A mote circles you in a fight and strikes the nearest enemy within ${FOCI.orb.radius} metres every ${FOCI.orb.every}s for ${pct(FOCI.orb.power)} of your damage, in your weapon's element.`, {
  aura: (v, c) => { c.auras.push({ id: 'focus_mote', every: FOCI.orb.every / (v > 1 ? v : 1), radius: FOCI.orb.radius, power: FOCI.orb.power, element: focusElement(c.self), nearestOnly: true }); },
});
def('affix:cond_focusRelic', () => `When you are hit, a ${pct(FOCI.relic.chance)} chance the relic answers: holy light strikes everything within ${FOCI.relic.radius} metres for ${pct(FOCI.relic.power)} of your damage and heals you for ${pct(FOCI.relic.heal)} of your maximum health. +${FOCI.relic.barrierRegen} barrier regeneration.`, {
  onDamaged: (v, c) => {
    if (!(c.amount > 0) || (c.rng ? c.rng() : Math.random()) >= FOCI.relic.chance * (v > 1 ? v : 1)) return;
    (c.procs || (c.procs = [])).push({ kind: 'nova', radius: FOCI.relic.radius, power: FOCI.relic.power, element: 'holy' });
    if (c.self?.hp != null) c.self.hp = Math.min(c.self.maxHp || c.self.hp, c.self.hp + Math.round((c.self.maxHp || 0) * FOCI.relic.heal));
  },
  derive: (v, d) => { d.barrierRegen = (d.barrierRegen || 0) + FOCI.relic.barrierRegen; },
});
def('affix:cond_focusIdol', () => `Every status you lay on an enemy lasts ${FOCI.idol.longer}s longer and does ${pct(FOCI.idol.power)} more.`, {
  statusLonger: () => FOCI.idol.longer,
  statusPower: () => 1 + FOCI.idol.power,
});

// the unique powers the foci carry (js/foci.js)
def('legendary:page_storm', 'Every other bolt from your wand throws a page, and a page is worth as much as the bolt it follows.', {
  onAttack: (v, c) => { if (c.kind === 'bolt' && countAttack(c, 'stormPages') % 2 === 0) c.twin = { ms: 140, power: 1 }; },
});
def('legendary:twin_motes', `Two motes circle you, each striking the nearest enemy every ${FOCI.orb.every}s, and reaching 2 metres further than one mote.`, {
  aura: (v, c) => {
    c.auras.push({ id: 'mote_a', every: FOCI.orb.every, radius: FOCI.orb.radius + 2, power: FOCI.orb.power * 1.2, element: focusElement(c.self), nearestOnly: true });
    c.auras.push({ id: 'mote_b', every: FOCI.orb.every * 1.13, radius: FOCI.orb.radius + 2, power: FOCI.orb.power * 1.2, element: focusElement(c.self), nearestOnly: true });
  },
});
def('legendary:sanctuary', 'Every blow you take has a 40% chance to be answered by a wider holy burst that also leaves every enemy it touches Weakened.', {
  onDamaged: (v, c) => {
    if (!(c.amount > 0) || (c.rng ? c.rng() : Math.random()) >= 0.4) return;
    (c.procs || (c.procs = [])).push({ kind: 'nova', radius: 6.5, power: 0.8, element: 'holy', status: 'weaken' });
  },
});
def('legendary:hexbound', 'Every status you lay lasts twice as long, and an enemy carrying two or more of your statuses takes 30% more from you.', {
  statusLonger: (v, c) => Math.max(2, (c.spec?.seconds || 4)),
  dmgOut: (v, c) => (Object.keys(c.target?.statuses || {}).length >= 2 ? 1.3 : 1),
});
def('legendary:archivist', 'The Archivist\'s Regalia: every fourth skill you cast costs nothing and goes off a second time for half.', {
  onCast: (v, c) => {
    const n = (c.rt.archivist = (c.rt.archivist || 0) + 1);
    if (n % 4 === 0) { c.refund = true; c.echoCast = 0.5; }
  },
});

// ---------------------------------------------------------------------------------------------
// R25 — THE BRANCHED KEYSTONES. "Change 'The Close Ground' and 'The Deep Study' to each branch into
// 3-5 separate paths… a keystone fitting different builds: 2h dual wielder, 2h single wield, dual
// 1h, 1h + shield; and for the magic side let's add a keystone for each element type that does
// something extraordinary and new, and keep the current 'Blood price' as an option too."
//
// A keystone in js/perks.js names one of these as its `power`; js/rpg.js `derive` puts the taken
// ones on `unit.legendaryPowers`, so they run through exactly the hooks — and the readers — every
// legendary power already has. A melee keystone only works with the hands it was written for, so
// each hook asks `handsFit` first; the stat half of the same keystone is gated the same way in
// js/perks.js `perkBonuses`.

/** Which pair of hands a character is holding, in the four shapes the melee keystones name. */
export function handsOf(unit) {
  const main = unit?.equipment?.weapon, off = unit?.equipment?.offhand;
  const offWeapon = off?.type === 'weapon';
  if (!main) return 'none';
  if (main.twoHanded && offWeapon && off.twoHanded) return 'twoTwo';
  if (main.twoHanded && !off) return 'twoOne';
  if (!main.twoHanded && offWeapon && !off.twoHanded) return 'dualOne';
  if (!main.twoHanded && (off?.isShield)) return 'swordBoard';
  return 'other';
}

export const PERK_KS = {
  fullSwing: { every: 3, radius: 3.5, power: 0.6, push: 2.5 },
  flurry: { chance: 0.25, power: 0.5, ms: 150 },
  shieldWall: { radius: 3.2, power: 0.7 },
  pyre: { radius: 4, power: 0.8, longer: 3 },
  shatter: { shards: 3, range: 7, power: 0.7, takeMore: 0.3 },
  storm: { every: 1.5, radius: 10, power: 0.5 },
  plague: { radius: 5, power: 1.25 },
  hollow: { radius: 5, drain: 0.08 },
  halo: { every: 2.5, radius: 5, power: 0.5, heal: 0.05 },
  overflow: { every: 3, echo: 0.6, costMore: 0.25 },
  offElement: 0.8,
};
/** "−20% damage in every other element" — the elemental keystones' shared cost. */
const offElementCost = mine => (v, c) => ((c.element || 'physical') === mine ? 1 : PERK_KS.offElement);

def('perk:full_swing', `With a two-handed weapon and nothing in the other hand, every ${PERK_KS.fullSwing.every}rd swing lands as a slam: everything within ${PERK_KS.fullSwing.radius} metres takes ${pct(PERK_KS.fullSwing.power)} of your damage and is thrown back ${PERK_KS.fullSwing.push} metres.`, {
  onAttack: (v, c) => {
    if (c.kind !== 'melee' || handsOf(c.self) !== 'twoOne') return;
    if (countAttack(c, 'fullSwing') % PERK_KS.fullSwing.every === 0) c.slam = { radius: PERK_KS.fullSwing.radius, power: PERK_KS.fullSwing.power, push: PERK_KS.fullSwing.push };
  },
});
def('perk:flurry', `With a one-handed weapon in each hand, every hit has a ${pct(PERK_KS.flurry.chance)} chance to land again a beat later for ${pct(PERK_KS.flurry.power)} damage.`, {
  onAttack: (v, c) => {
    if (c.kind !== 'melee' || handsOf(c.self) !== 'dualOne') return;
    c.echo = { chance: PERK_KS.flurry.chance, power: PERK_KS.flurry.power, ms: PERK_KS.flurry.ms };
  },
});
def('perk:shield_wall', `With a one-handed weapon and a shield, every blow you block answers with a shockwave: everything within ${PERK_KS.shieldWall.radius} metres takes ${pct(PERK_KS.shieldWall.power)} of your damage.`, {
  onDamaged: (v, c) => {
    if (!c.blocked || handsOf(c.self) !== 'swordBoard') return;
    (c.procs || (c.procs = [])).push({ kind: 'nova', radius: PERK_KS.shieldWall.radius, power: PERK_KS.shieldWall.power, element: 'physical' });
  },
});

def('perk:pyre_heart', `A Burning enemy that dies bursts: everything within ${PERK_KS.pyre.radius} metres takes ${pct(PERK_KS.pyre.power)} of your damage as fire and is set Burning, so a crowd burns down in a chain. Your Burning lasts ${PERK_KS.pyre.longer}s longer. You deal 20% less damage of every other kind.`, {
  onKill: (v, c) => { if (c.target?.statuses?.burn) c.burst = { radius: PERK_KS.pyre.radius, power: PERK_KS.pyre.power, element: 'fire', status: 'burn' }; },
  statusLonger: (v, c) => (c.type === 'burn' ? PERK_KS.pyre.longer : 0),
  dmgOut: offElementCost('fire'),
});
def('perk:shatter', `A Chilled enemy takes ${pct(PERK_KS.shatter.takeMore)} more from you, and one that dies Chilled shatters: ${PERK_KS.shatter.shards} shards fly at the nearest enemies within ${PERK_KS.shatter.range} metres for ${pct(PERK_KS.shatter.power)} of your damage each. You deal 20% less damage of every other kind.`, {
  onKill: (v, c) => { if (c.target?.statuses?.chill) c.shards = { count: PERK_KS.shatter.shards, range: PERK_KS.shatter.range, power: PERK_KS.shatter.power, element: 'ice' }; },
  dmgOut: (v, c) => offElementCost('ice')(v, c) * (c.target?.statuses?.chill ? 1 + PERK_KS.shatter.takeMore : 1),
});
def('perk:storm_within', `In a fight, lightning leaves you on its own every ${PERK_KS.storm.every}s and strikes the nearest enemy within ${PERK_KS.storm.radius} metres for ${pct(PERK_KS.storm.power)} of your damage, Shocking it. You deal 20% less damage of every other kind.`, {
  aura: (v, c) => { c.auras.push({ id: 'storm_within', every: PERK_KS.storm.every, radius: PERK_KS.storm.radius, power: PERK_KS.storm.power, element: 'lightning', nearestOnly: true, status: 'shock' }); },
  dmgOut: offElementCost('lightning'),
});
def('perk:plague_bearer', `A Poisoned enemy that dies passes its poison to every enemy within ${PERK_KS.plague.radius} metres, ${pct(PERK_KS.plague.power - 1)} stronger each time it moves on. You deal 20% less damage of every other kind.`, {
  onKill: (v, c) => { const st = c.target?.statuses?.poison; if (st) c.spread = { type: 'poison', radius: PERK_KS.plague.radius, power: (st.power || 1) * PERK_KS.plague.power }; },
  dmgOut: offElementCost('poison'),
});
def('perk:hollow_pact', `A Cursed enemy that dies passes its curse to every enemy within ${PERK_KS.hollow.radius} metres, and every hit of shadow damage you land heals you for ${pct(PERK_KS.hollow.drain)} of it. You deal 20% less damage of every other kind.`, {
  onKill: (v, c) => { const st = c.target?.statuses?.curse; if (st) c.spread = { type: 'curse', radius: PERK_KS.hollow.radius, power: st.power || 1 }; },
  onHit: (v, c) => {
    if (c.element !== 'shadow' || !(c.amount > 0) || c.self?.hp == null) return;
    c.self.hp = Math.min(c.self.maxHp || c.self.hp, c.self.hp + Math.max(1, Math.round(c.amount * PERK_KS.hollow.drain)));
  },
  dmgOut: offElementCost('shadow'),
});
def('perk:halo', `A ring of light goes with you: every ${PERK_KS.halo.every}s in a fight it burns every enemy within ${PERK_KS.halo.radius} metres for ${pct(PERK_KS.halo.power)} of your damage as holy and Weakens them, and every hit of holy damage you land heals you for ${pct(PERK_KS.halo.heal)} of it. You deal 20% less damage of every other kind.`, {
  aura: (v, c) => { c.auras.push({ id: 'halo', every: PERK_KS.halo.every, radius: PERK_KS.halo.radius, power: PERK_KS.halo.power, element: 'holy', status: 'weaken' }); },
  onHit: (v, c) => {
    if (c.element !== 'holy' || !(c.amount > 0) || c.self?.hp == null) return;
    c.self.hp = Math.min(c.self.maxHp || c.self.hp, c.self.hp + Math.max(1, Math.round(c.amount * PERK_KS.halo.heal)));
  },
  dmgOut: offElementCost('holy'),
});
def('perk:overflow', `Every ${PERK_KS.overflow.every}rd skill you cast goes off a second time for ${pct(PERK_KS.overflow.echo)}, free. Skills cost ${pct(PERK_KS.overflow.costMore)} more mana.`, {
  onCast: (v, c) => {
    const n = (c.rt.overflow = (c.rt.overflow || 0) + 1);
    if (n % PERK_KS.overflow.every === 0) c.echoCast = Math.max(c.echoCast || 0, PERK_KS.overflow.echo);
  },
  derive: (v, d) => { d.skillCostPct = (d.skillCostPct || 0) - PERK_KS.overflow.costMore; },
});
