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
def('affix:castElement', (v, a) => `Every hit lands as ${a?.element || 'its own element'} and leaves that element's mark`, {});

def('affix:cond_afterSkillSpellPow', v => `+${n1(v)} spell power for 6 seconds after you use a skill`, {
  onCast: (v, c) => { c.rt.skillPower = 6; c.rt.skillPowerValue = v; },
  derive: (v, d, unit, rt) => { if (rt?.skillPower > 0) d.spellPower += v; },
});
def('affix:cond_ambushDmgFlat', v => `+${n1(v)} damage to anything that has not noticed you`, {
  dmgOut: (v, c) => (c.target && c.target.state !== 'chase' ? 1 + v / Math.max(1, c.baseDamage || 20) : 1),
  flatOut: (v, c) => (c.target && c.target.state !== 'chase' ? v : 0),
});
def('affix:cond_bleedOnCrit', v => `Critical hits open a bleed for ${n1(v)} damage a second, for 6 seconds`, {
  onCrit: (v, c) => c.applyStatus?.(c.target, 'bleed', { perSecond: v, seconds: 6, name: 'Bleeding', element: 'physical' }),
});
def('affix:cond_burnExtend', v => `Burns you set last ${n1(v)} seconds longer`, {
  statusLonger: (v, c) => (c.type === 'burn' ? v : 0),
});
def('affix:cond_cheatDeath', v => `Once a minute, survive a killing blow and stay up on ${pct(v)} of your health`, {
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
def('affix:cond_combatStartBarrier', v => `Start every fight with a ${n1(v)}-point barrier`, {
  combatStart: (v, c) => { c.self.barrier = Math.max(c.self.barrier || 0, v); },
});
def('affix:cond_consecutiveHitDmg', v => `+${pct(v)} damage for each hit in a row on the same target, up to five`, {
  dmgOut: (v, c) => 1 + v * Math.min(5, c.rt.streak || 0),
  onHit: (v, c) => {
    if (c.rt.streakOn === c.target?.id) c.rt.streak = (c.rt.streak || 0) + 1;
    else { c.rt.streakOn = c.target?.id; c.rt.streak = 1; }
  },
});
def('affix:cond_critArmorPen', v => `Critical hits ignore ${pct(v)} of the target's armour`, {
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
def('affix:cond_dotDmgReduce', v => `Burns, bleeds and poisons on you deal ${pct(v)} less damage`, {
  statusIn: (v) => 1 - v,
});
def('affix:cond_executeDmgPct', v => `+${pct(v)} damage to anything under a quarter health`, {
  dmgOut: (v, c) => ((c.target?.hp || 0) / Math.max(1, c.target?.maxHp || 1) < 0.25 ? 1 + v : 1),
});
def('affix:cond_extraSetPiece', () => 'Counts as one more piece of every set you are wearing', { setPieces: 1 });
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
def('affix:cond_levelReqReduce', v => `Needs ${n1(v)} fewer levels to wear — this item and everything else you have on`);
def('affix:cond_hpOnKill', v => `Every kill gives you ${n1(v)} health back`, { onKill: (v, c) => { c.heal = (c.heal || 0) + v; } });
def('affix:cond_killInitBonus', v => `A kill gives +${pct(v)} attack speed and +${pct(v)} move speed for 5 seconds`, {
  onKill: (v, c) => { c.rt.killRush = 5; c.rt.killRushValue = v; },
  derive: (v, d, unit, rt) => { if (rt?.killRush > 0) { d.haste += v * 100; d.movePct += v * 100; } },
});
def('affix:cond_lightningVsSlowed', v => `+${pct(v)} lightning damage to anything slowed`, {
  dmgOut: (v, c) => (c.element === 'lightning' && (c.target?.statuses?.chill || c.target?.statuses?.web) ? 1 + v : 1),
});
def('affix:cond_lowManaRegenBonus', v => `+${n1(v)} mana a second below a third mana`, {
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
def('affix:cond_manaShieldOnHit', v => `You take ${pct(v)} less damage while your mana is above a third`, {
  dmgIn: (v, c) => ((c.self.mp || 0) / Math.max(1, c.self.maxMp || 1) > 0.34 ? 1 - v : 1),
});
def('affix:cond_partyHpOnKill', v => `Every kill heals each of your companions for ${n1(v)}`, {
  onKill: (v, c) => { c.petHeal = (c.petHeal || 0) + v; },
});
def('affix:cond_physDmgReducePct', v => `You take ${pct(v)} less physical damage`, {
  dmgIn: (v, c) => (isMagic(c.element) ? 1 : 1 - v),
});
def('affix:cond_poisonDmgVsBurning', v => `+${pct(v)} poison damage to anything burning`, {
  dmgOut: (v, c) => (c.element === 'poison' && c.target?.statuses?.burn ? 1 + v : 1),
});
def('affix:cond_poisonStackPower', v => `Poison you apply deals ${pct(v)} more damage a tick`, {
  statusPower: (v, c) => (c.type === 'poison' ? 1 + v : 1),
});
def('affix:cond_setThresholdReduce', () => 'Set bonuses come on one piece early', { setPieces: 1 });
// items.json rolls this 1-3. Read as a fraction it said "skills cost 188% less mana", which is
// gibberish; it is a flat saving on every skill, which is what a 1-3 roll can only have meant.
def('affix:cond_skillMpCostReduce', v => `Every skill costs ${Math.round(v)} less mana`, { costFlat: v => v });
def('affix:cond_speedOnFirstHit', v => `+${pct(v)} move speed for 4 seconds after the first hit of a fight`, {
  combatStart: (v, c) => { c.rt.openingRush = 4; c.rt.openingRushValue = v; },
  derive: (v, d, unit, rt) => { if (rt?.openingRush > 0) d.movePct += v * 100; },
});
def('affix:cond_sustainedDmgBonus', v => `+${pct(v)} damage for every 5 seconds you stay in the fight, up to +${pct(v * 5)}`, {
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

const BRANDS = {
  cond_brandFire: ['fire', 'Ember Brand', 'burns'],
  cond_brandIce: ['ice', 'Rime Brand', 'chills'],
  cond_brandLightning: ['lightning', 'Storm Brand', 'shocks'],
  cond_brandNature: ['poison', 'Bramble Brand', 'poisons'],
  cond_brandShadow: ['shadow', 'Veil Brand', 'withers'],
  cond_brandHoly: ['holy', 'Dawn Brand', 'sears'],
  cond_brandArcane: ['arcane', 'Star Brand', 'unmakes'],
};
for (const [stat, [element, , verb]] of Object.entries(BRANDS)) {
  def(`affix:${stat}`, v => `Every hit lands as ${element}: it ${verb} what it touches, and ${element} damage you deal is +${pct(v)}`, {
    brandElement: () => element,
    dmgOut: (v, c) => (c.element === element ? 1 + v : 1),
  });
}

def('affix:cond_critFromWounds', v => `+${n1(v)}% critical chance for every quarter of its health the target has already lost`, {
  critBonus: (v, c) => {
    const missing = 1 - (c.target?.hp || 0) / Math.max(1, c.target?.maxHp || 1);
    return v * Math.floor(missing * 4);
  },
});
def('affix:cond_dmgVsNamed', v => `+${pct(v)} damage to champions, rares and bosses`, {
  dmgOut: (v, c) => (c.target?.named || c.target?.nemesis || c.target?.rank === 'boss' ? 1 + v : 1),
});
def('affix:cond_sunderOnHit', v => `Every hit strips ${n1(v)} armour off the target, and the armour does not come back`, {
  onHit: (v, c) => { if (c.target) c.target.armor = Math.max(0, (c.target.armor || 0) - v); },
});
def('affix:cond_nemesisMark', v => `+${pct(v)} damage to whatever killed you last`, {
  dmgOut: (v, c) => (c.target?.nemesis ? 1 + v : 1),
});
def('affix:cond_killGrowth', v => `+${n1(v)} damage for every ten kills you have taken`, {
  derive: (v, d, unit) => { d.damageFlat += v * Math.floor((unit.kills || 0) / 10); },
});
def('affix:cond_killMemory', v => `+${n1(v)} health for every ten kills you have taken`, {
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
def('affix:cond_companionExtra', v => `${n1(v)} more follower may walk with you`, {
  derive: (v, d) => { d.petSlots = (d.petSlots || 0) + v; },
});
def('affix:cond_companionFury', v => `Your companions deal ${pct(v)} more damage`, { petPower: v => 1 + v });
def('affix:cond_guardBond', v => `Town guards deal ${pct(v)} more damage while you are with them`, { guardPower: v => 1 + v });

// the travel-layer five, restated for a world you walk across yourself
def('affix:cond_forageRation', v => `+${n1(v)} health a second while you are out of a fight`, {
  derive: (v, d, unit, rt) => { if (!(rt?.inCombat > 0)) d.hpRegen += v; },
});
def('affix:cond_extraLeg', v => `+${pct(v)} move speed`, {
  derive: (v, d) => { d.movePct += v * 100; },
});
def('affix:cond_easeExhaustion', v => `+${n1(v)} health a second — you tire less easily`, {
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
  v => `Rides at ${n1(v)}\u00d7 your walking speed — ${n1(v * WALK_MS)} m/s at a walk, ${n1(v * WALK_MS * RUN_X)} m/s at a gallop`, {
    derive: (v, d) => { d.mountSpeed = Math.max(d.mountSpeed || 0, v); },
  });
def('affix:cond_mountWind', v => `Gallops for ${n1(v)} seconds before it has to drop back to a walk`, {
  derive: (v, d) => { d.mountStamina = Math.max(d.mountStamina || 0, v); },
});
def('affix:cond_lightRange', v => `Lights ${n1(v)} more metres of ground around you`, {
  derive: (v, d) => { d.lightRange = (d.lightRange || 0) + v; },
});
def('affix:cond_lightSteady', v => `Enemies are ${pct(v)} less likely to notice you while it is lit`, {
  derive: (v, d) => { d.stealth = (d.stealth || 0) + v; },
});
// The old line promised "less damage from anything standing in its light" and the hook took the
// share off EVERY hit whether anything was lit or not. Nothing here knows where the light falls, so
// the line now says what the hook actually does, gated on carrying a light at all.
def('affix:cond_lightWard', v => `You take ${pct(v)} less damage while you are carrying a light`, {
  dmgIn: (v, c) => ((c.self?.derived?.lightRange || 0) > 0 ? 1 - v : 1),
});
def('affix:cond_lightReveal', v => `Shows chests and doorways ${n1(v)} metres further out`, {
  derive: (v, d) => { d.revealRange = (d.revealRange || 0) + v; },
});

def('affix:cond_mountSpeed', v => `+${n1(v)}\u00d7 to how fast it carries you`, {
  derive: (v, d) => { d.mountSpeed = Math.max(d.mountSpeed || 0, v); },
});
def('affix:cond_mountStamina', v => `+${n1(v)} seconds of gallop before it has to drop back to a walk`, {
  derive: (v, d) => { d.mountStamina = (d.mountStamina || 0) + v; },
});
def('affix:cond_mountSlope', v => `Loses ${pct(v)} less speed to hills and broken ground`, {
  derive: (v, d) => { d.mountSlope = (d.mountSlope || 0) + v; },
});
def('affix:cond_mountTrample', v => `Rides down whatever it runs into for ${n1(v)} damage`, {
  derive: (v, d) => { d.trample = (d.trample || 0) + v; },
});
def('affix:cond_mountCalm', v => `${pct(v)} less likely to throw you when something charges it`, {
  derive: (v, d) => { d.mountCalm = (d.mountCalm || 0) + v; },
});

// Quivers add DAMAGE, not armour — the play-test's change, and the reason they are worth a slot.
def('affix:cond_quiverDamage', v => `+${n1(v)} damage on every arrow you loose`, {
  derive: (v, d) => { d.arrowDamage = (d.arrowDamage || 0) + v; },
});
def('affix:cond_quiverElement', (v, a) => `Every arrow lands as ${a?.element || 'its element'} and leaves that element's mark`, {});
def('affix:cond_quiverSplit', v => `Every shot looses ${n1(v)} arrows instead of one`, {
  derive: (v, d) => { d.arrowsPerShot = Math.max(d.arrowsPerShot || 1, v); },
});
def('affix:cond_quiverHoming', () => 'Arrows steer toward whatever you aimed at', {
  derive: (v, d) => { d.arrowHoming = (d.arrowHoming || 0) + v; },
});
def('affix:cond_quiverBurst', v => `Arrows burst on impact, catching everything within ${n1(v)} metres`, {
  derive: (v, d) => { d.arrowBurst = Math.max(d.arrowBurst || 0, v); },
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
    if (!fighting) { rt.streak = 0; rt.streakOn = null; rt.hitOnce = new Set(); }
    for (const k of ['cheatDeath', 'skillPower', 'killRush', 'openingRush']) {
      if (rt[k] > 0) rt[k] = Math.max(0, rt[k] - dt);
    }
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
