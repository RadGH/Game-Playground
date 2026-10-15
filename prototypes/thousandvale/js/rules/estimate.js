// Thousandvale — THE CHARACTER SHEET: stats, and what every ability really does (play-test 5, T18). Pure.
//
//   "Character menu: stats, an 'advanced details' button for uncommon stats, the DPS of every ability that can be
//    estimated; can be open at the same time as the bag so you equip and watch numbers change."
//
// The stat rows are read straight off the sheet Farhold derives (`unit.derived`): nothing is recomputed here.
//
// The ability numbers are MEASURED, not worked out from a formula of our own — a formula written beside the code is
// exactly how a card ends up promising what the code does not do. A copy of the character (same class, level, gear,
// talents and perks) is put in a private scratch room with one training dummy — its own level, no armour, no
// resistance, never dies, never moves — and each ability is cast FOR REAL through the same pipeline a fight uses
// (js/rules/cast.js, cast-skills.js). What the dummy takes within one cooldown is counted from the room's own hit
// and damage-over-time events, so burns, pools, zones, repeats, chains and an off hand are all in the number, and a
// critical hit is in it as often as it happens (each ability is cast a few times on fixed seeds and averaged, so the
// same gear always gives the same number).
//
// What a number does NOT include, and the tip says so: followers' damage, more than one target, temporary buffs you
// are carrying, and anything that depends on the enemy (armour, a level gap, a bonus against undead).

import { createRoomContext } from './room.js';
import { attachField } from './field.js';
import { createCombat } from './cast.js';
import { createCharacter, serializeGear } from './character.js';
import { spawnMonster, tickMonsters } from './monster-ai.js';
import { flatTerrain } from './terrain-flat.js';
import { makeRng } from './rng.js';
import { weaponHands, mechWorld } from './farhold.js';
import { attackReach, basicCard, isHeldFocus, wandStyle } from './caster-forms.js';
import { attackRate, hastePct } from './combat-cfg.js';
import { reviveOf } from './tv-skills.js';

export const SHEET = Object.freeze({
  /** seconds of basic attacks measured */
  BASIC_SECONDS: 6,
  /** casts averaged per skill (fixed seeds) */
  CASTS: 2,
  /** the longest a single cast is watched for (a skill with a longer cooldown is watched until nothing of it is left) */
  MAX_WINDOW: 9,
  DT: 0.1,
});

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

// ------------------------------------------------------------------------------------------------ stat rows

/** The main rows: what a player looks at first. Every `value` is a field of the derived sheet. */
export function coreRows(engine, u) {
  const d = u.derived || {};
  const dmg = d.damage || [0, 0];
  const armor = d.armor || 0;
  const hands = weaponHands(u);
  const rows = [
    { id: 'level', label: 'Level', value: u.level || 1, unit: '', tip: 'Your level.' },
    { id: 'maxHp', label: 'Health', value: Math.round(u.maxHp || d.maxHp || 0), unit: '', tip: 'Your maximum health: your level, your gear and your perks.' },
    { id: 'maxMp', label: 'Mana', value: Math.round(u.maxMp || d.maxMp || 0), unit: '', tip: 'Your maximum mana: your level, your gear and your perks.' },
    { id: 'damageMin', label: 'Weapon damage (low)', value: Math.round(dmg[0]), unit: '', tip: 'The lowest a basic hit rolls before the target\'s armour. Every ability\'s "weapon damage" is a share of this roll.' },
    { id: 'damageMax', label: 'Weapon damage (high)', value: Math.round(dmg[1]), unit: '', tip: 'The highest a basic hit rolls before the target\'s armour.' },
    ...(hands.dual && d.offDamage && !hands.off?.noAttack ? [{ id: 'offDamage', label: 'Off-hand damage (high)', value: Math.round(d.offDamage[1]), unit: '', tip: 'Your off hand swings on its own clock; its hits deal 60% of this roll.' }] : []),
    // owner feedback 10 (Y26): attacks per second — the weapon's own pattern, a tome's slower clock and your attack speed
    // (inside its cap), from the same function the attack is paced with (js/rules/combat-cfg.js). A parity engine keeps
    // Farhold's "attack interval" row.
    ...(engine.combatCfg ? apsRows(engine, u) : [{ id: 'attackEvery', label: 'Attack interval', value: r2(d.attackEvery ?? 0.62), unit: 's', lowerIsBetter: true, tip: 'The base time between basic attacks before your weapon\'s own pattern; haste shortens it.' }]),
    { id: 'critChance', label: 'Critical chance', value: r1(d.critChance || 0), unit: '%', tip: 'The chance a hit is a critical hit.' },
    { id: 'critDamage', label: 'Critical damage', value: Math.round(d.critDamage ?? 50), unit: '%', tip: 'How much more a critical hit deals.' },
    { id: 'spellPower', label: 'Spell power', value: Math.round((d.spellPower || 0) * 100), unit: '%', tip: 'Added to every hit that is not physical: fire, ice, lightning, poison, shadow, holy, arcane.' },
    { id: 'armor', label: 'Armour', value: Math.round(armor), unit: '', tip: `Physical hits on you are reduced by ${Math.round(armor / (100 + Math.max(0, armor)) * 100)}% (armour / (100 + armour)).` },
    // owner feedback 6 (U13): the reduction itself, to one decimal, so +6 armour is seen to move it (35 -> 41 armour is 25.9% -> 29.1%)
    { id: 'armorReduction', label: 'Physical damage reduced', value: armorReduction(armor), unit: '%', tip: `From your ${Math.round(armor)} armour: armour / (100 + armour). One more point of armour is worth about ${r2(armorReduction(armor + 1) - armorReduction(armor))}% here; each point is worth a little less than the one before.` },
    { id: 'dodge', label: 'Dodge', value: r1(d.dodge || 0), unit: '%', tip: 'The chance a hit misses you entirely (never more than 35%).' },
    { id: 'hpRegen', label: 'Health regeneration', value: r1(d.hpRegen || 0), unit: '/s', tip: 'Health restored every second, in or out of a fight. Out of a fight you also mend 1.5% of your health a second.' },
    { id: 'mpRegen', label: 'Mana regeneration', value: r1(d.mpRegen || 0), unit: '/s', tip: 'Mana restored every second. Out of a fight you also regain 2% of your mana a second.' },
    { id: 'moveSpeed', label: 'Move speed', value: r2(d.moveSpeed || 0), unit: 'm/s', tip: 'How fast you run on foot.' },
  ];
  // owner #2 (2026-10-15): no attribute rows. What the weapon's family adds, and (owner #61) what a melee weapon guards.
  if (d.familyPct != null) {
    const fam = FAMILY_WORD[d.family] || 'weapon';
    const extra = Math.round((d.familyPct || 0) - (engine.combatCfg?.families?.[d.family]?.damagePct ?? 0));
    rows.push({ id: 'familyPct', label: 'Weapon damage bonus', value: r1(d.familyPct), unit: '%', tip: `Your ${fam} adds this much to its damage, and so to every ability that is a share of its damage.${extra > 0 ? ` ${extra}% of it comes from gear and perks that raise ${fam} damage.` : ''}` });
  }
  if (d.weaponGuard != null) rows.push({ id: 'weaponGuard', label: 'Melee guard', value: r1(d.weaponGuard || 0), unit: '%', tip: d.weaponGuard ? `A melee weapon in your main hand takes ${r1(d.weaponGuard)}% off every hit you take (two-handed melee weapons guard more than one-handed ones).` : 'Hold a melee weapon in your main hand and it takes a share off every hit you take. Bows, wands, staves and tomes do not guard.' });
  return rows;
}
/** Y26: the "Attacks per second" rows (main hand; the off hand too when it holds a weapon that attacks). */
function apsRows(engine, u) {
  const forms = engine.casterForms || null;
  const styleOf = it => (forms && it?.ranged && it?.castElement && !it?.twoHanded ? wandStyle(forms, it) : null);
  const cap = engine.combatCfg.speed.capPct, h = Math.round(hastePct(engine.combatCfg, u));
  const main = attackRate(engine, u, 'main', { styleOf }), off = attackRate(engine, u, 'off', { styleOf });
  const bonus = h ? ` Your attack speed is ${h > 0 ? '+' : ''}${h}%${(u.derived?.haste || 0) > cap ? ` (the most all bonuses together can give is +${cap}%)` : ''}.` : ` Attack speed bonuses raise it (up to +${cap}% in all).`;
  const rows = [];
  if (main) rows.push({ id: 'aps', label: 'Attacks per second', value: main.aps, unit: '/s', tip: `How often your basic attack lands: one every ${r2(main.every)} s with what you are holding.${bonus}` });
  if (off) rows.push({ id: 'apsOff', label: 'Off-hand attacks per second', value: off.aps, unit: '/s', tip: `Your off hand attacks on its own clock: one every ${r2(off.every)} s.` });
  return rows;
}
/** The share of a physical hit armour takes off, in percent to one decimal — Farhold rpg.strike: `amount *= 100 / (100 + armour)`. */
export const armorReduction = armor => Math.round(Math.max(0, armor) / (100 + Math.max(0, armor)) * 1000) / 10;
const FAMILY_WORD = { heavy: 'heavy weapon', light: 'light weapon', magic: 'magic weapon' };

/** The "advanced details" rows: the uncommon stats, only the ones that are not zero (plus a few always shown). */
export function advancedRows(engine, u) {
  const d = u.derived || {};
  const spec = [
    ['magicResist', 'Magic resistance', '', 'Reduces magical hits on you the way armour reduces physical ones.', 1, true],
    ['resistAll', 'All damage resisted', '%', 'Taken off every hit on you (your melee guard is part of it).', 1, false],
    ['heavyPct', 'Heavy weapon damage', '%', 'Added to the damage of heavy weapons (gear and perks).', 1, false],
    ['lightPct', 'Light weapon damage', '%', 'Added to the damage of light weapons and bows (gear and perks).', 1, false],
    ['magicPct', 'Magic weapon damage', '%', 'Added to the damage of wands, staves, sceptres and tomes (gear and perks).', 1, false],
    ['blockChance', 'Block chance', '%', 'The chance a hit on you is blocked.', 1, false],
    ['blockPower', 'Block power', '', 'How much a block takes off the hit.', 1, false],
    ['maxBarrier', 'Barrier', '', 'A shield of this much damage from your off-hand focus; it regenerates out of a fight.', 1, false],
    ['barrierRegen', 'Barrier regeneration', '/s', 'How fast that barrier comes back.', 1, false],
    ['haste', 'Attack speed', '%', 'Faster basic attacks — melee, bows, wands, tomes and staves alike. All bonuses together count up to the cap shown on "Attacks per second".', 1, true],
    ['cooldownReduction', 'Cooldown reduction', '%', 'Taken off every ability\'s cooldown.', 1, true],
    ['areaPct', 'Attack area', '%', 'Bigger swings, cones and blasts.', 1, true],
    ['damagePct', 'Damage', '%', 'Added to every hit you deal.', 1, false],
    ['damageFlat', 'Flat damage', '', 'Added to every hit before multipliers.', 1, false],
    ['lifeSteal', 'Life steal', '', 'Health returned by your physical basic hits.', 1, false],
    ['lifeStealFrac', 'Life steal (share)', '%', 'Share of physical basic damage returned as health.', 100, false],
    ['manaSteal', 'Mana steal', '', 'Mana returned by your hits.', 1, false],
    ['hpOnKill', 'Health on kill', '', 'Health restored by each kill.', 1, false],
    ['manaOnKill', 'Mana on kill', '', 'Mana restored by each kill.', 1, false],
    ['thorns', 'Thorns', '%', 'Share of a melee hit on you thrown back at the attacker.', 100, false],
    ['healingPct', 'Healing done', '%', 'Added to the healing you do.', 100, false],
    ['healPower', 'Healing power', '%', 'Added to the healing you do (perks).', 1, false],
    ['dotPct', 'Damage over time', '%', 'Added to your burns, poisons, bleeds and curses.', 1, false],
    ['petDamagePct', 'Follower damage', '%', 'Added to the damage of your pets, summons and hired blades.', 1, false],
    ['followerSlots', 'Extra follower slots', '', 'More followers may walk with you.', 1, false],
    ['arrowDamage', 'Arrow damage', '', 'Added to bow shots (a quiver).', 1, false],
    ['arrowsPerShot', 'Arrows per shot', '', 'How many arrows a shot looses.', 1, false],
    ['echoChance', 'Echo chance', '%', 'The chance a skill casts a second time at half strength.', 100, false],
    ['magicFind', 'Magic find', '%', FIND_TIPS.magicFind, 1, true],
    ['goldFind', 'Gold find', '%', FIND_TIPS.goldFind, 1, true],
    ['xpFind', 'Experience gained', '%', FIND_TIPS.xpFind, 1, true],
    ['threatPct', 'Threat', '%', 'How much more (or less) your damage draws monsters to you.', 1, false],
    ['stealth', 'Stealth', '%', 'Monsters notice you from closer.', 1, false],
    ['movePct', 'Move speed bonus', '%', 'Added to your run speed.', 1, false],
    ['mountSpeed', 'Mount speed', '%', 'Added to your riding speed.', 1, false],
  ];
  const rows = [];
  for (const [id, label, unit, tip, k, always] of spec) {
    const v = d[id] ?? (FIND_TIPS[id] ? 0 : undefined);
    if (!Number.isFinite(v) || (!always && !v) || (id === 'arrowsPerShot' && v <= 1)) continue;
    rows.push({ id, label, value: r1(v * k), unit, tip: typeof tip === 'function' ? tip(v, engine) : tip });
  }
  return rows;
}

/**
 * Owner #36 (2026-10-15): "explain if it works for kills, chests, rewards, etc." — each sentence says what the code does
 * with the stat, and where it does not reach. Read from: magic find — js/rules/cast.js onKill (`rpg.rollDrops`, a party's
 * pile at everyone's average), index.js rollLoot (chests, treasure, events, road rewards, rolled quest rewards) and
 * openCrate (reward boxes), Farhold rpg.rarityFor (the lift multiplies the magic / rare / legendary chances, never the
 * chance of a drop); gold find — cast.js onKill through economy.js goldFound (capped by prices.json goldFind.cap) and
 * `foundGold` on an item power's kill gold; experience — cast.js onKill (`award x (1 + xpFind)`), kills only.
 */
const FIND_TIPS = {
  magicFind: (v = 0) => `Raises the chance that an item rolled for you comes out magic, rare or legendary: ${v ? `your +${r1(v)}% makes each of those chances ${r2(1 + v / 100)} times as likely` : '+50% would make each of those chances 1.5 times as likely'}. It never makes more items drop. It counts on: what monsters drop for you (in a party sharing a kill, the average of everyone who fought), chests, buried treasure, event and roadside rewards, quest rewards that are rolled for you, and reward boxes when you open them. It does not touch shop stock, named quest items, crafting, gathering or fishing.`,
  goldFind: (v = 0, engine = null) => { const cap = engine?.prices?.goldFind?.cap ?? 100; return `More gold from kills: +${r1(v)}% on the gold each monster you help kill pays you${v > cap ? ` (only the first +${cap}% counts)` : ` (up to +${cap}% counts)`}, and on gold an item power pays on a kill. It does not change gold from chests, treasure, quests or events, or what shops pay you.`; },
  xpFind: (v = 0) => `More experience from kills: +${r1(v)}% on the experience each kill pays you. Quests, events, discoveries and professions pay the same as without it.`,
};
export { FIND_TIPS };

// ------------------------------------------------------------------------------------------------ measuring

/** A copy of `u` (class, level, gear, talents, perks) for the scratch room. */
function copyOf(engine, u) {
  const c = createCharacter(engine, { id: 'sheet:you', classId: u.classId, level: u.level || 1, name: 'You', rng: makeRng(7), gear: serializeGear(u), kit: false });
  c.skillTalents = JSON.parse(JSON.stringify(u.skillTalents || {}));
  c.perks = [...(u.perks || [])];
  c.bonusPerks = u.bonusPerks || 0;
  c.unlocks = { ...(u.unlocks || {}) };
  engine.rpg.refresh(c, { full: true });
  for (const sl of c.skills.slots) sl.views = null;
  return c;
}

/** A scratch room with the copy and one training dummy `dist` metres in front of it. */
function arena(engine, u, dist, seed) {
  const room = createRoomContext({ id: `sheet:${seed}`, seed, engine });
  const field = attachField(room, { terrain: flatTerrain() });
  room.combat = createCombat(room);
  room.combat.tickMonsters = dt => tickMonsters(field, dt);
  room.preflight = false;
  const me = copyOf(engine, u);
  me.x = 0; me.z = 0; me.yaw = 0;
  me.roomRng = room.streams.get('bars');
  field.add(me, 'player');
  const def = engine.enemyDef('moor_hound') || (engine.bestiary.enemies || [])[0];
  const dummy = room.run(() => spawnMonster(field, { ...def, id: def.id, name: 'Training dummy', speed: 0, aggroRange: 0, attackEvery: 1e9, ranged: null, phases: null, spawns: null, onHit: null }, me.level || 1, 0, dist, { id: 'sheet:dummy', rank: 'normal' }));
  dummy.maxHp = dummy.hp = 1e9;
  dummy.armor = 0; dummy.magicResist = 0; dummy.dmg = [0, 0];
  dummy.derived = { resistAll: 0, thorns: 0, dodge: 0 };
  dummy.speed = 0; dummy.aggroRange = 0; dummy.attackEvery = 1e9; dummy.home = [0, dist];
  return { room, field, me, dummy };
}

/** Advance the scratch room one step and add up what the dummy took and what was healed. */
function stepArena(a, dt, tally) {
  a.room.run(() => { a.room.clock.advance(dt); a.room.combat.tick(dt); });
  a.dummy.x = 0; a.dummy.z = a.dummy.home[1]; a.dummy.push = null; a.dummy.stagger = 0;      // it never moves
  // …and it faces you, as anything you are fighting does. The dagger's back-stab rule reads the target's facing (see
  // js/rules/field.js), so a dummy left at a random facing made a dagger's number depend on the dice (round 11)
  a.dummy.facing = Math.atan2(a.me.x - a.dummy.x, a.me.z - a.dummy.z);
  for (const ev of a.field.drain()) {
    if (ev.t === 'hit' && ev.dst === a.dummy.id && ev.amt > 0) { tally.damage += ev.amt; tally.hits.push(ev.amt); }
    else if (ev.t === 'dot' && ev.id === a.dummy.id && ev.amt > 0) tally.damage += ev.amt;
    else if (ev.t === 'heal' && ev.src === a.me.id && ev.amt > 0) tally.healed += ev.amt;
  }
  a.dummy.hp = a.dummy.maxHp;
}

/** Is anything of the last cast still going (a timer, a placed thing, a pool, a status on the dummy, a channel)? */
function busy(a) {
  if (a.room.combat.pending.length) return true;
  if (a.me.mech?.channel || a.me.tvCast) return true;
  if (Object.values(a.dummy.statuses || {}).some(st => (st.perSecond || 0) > 0 && (st.remaining || 0) > 0)) return true;
  if (a.room.combat.skillRt?.pools?.length) return true;
  return a.room.run(() => mechWorld.placed.some(o => o.left > 0 && Number.isFinite(o.left)));
}

/** How far the dummy stands for an ability of this shape. */
function standFor(engine, u, row) {
  switch (row?.shape) {
    case 'bolt': case 'beam': return Math.max(3, Math.min((row.range || 24) - 2, 12));
    case 'ground': return Math.max(3, Math.min((row.range || 20) - 1, 10));
    case 'dash': return Math.max(3, Math.min((row.range || 10) - 1, 6));
    default: return 2;
  }
}

/** The basic attack, for SHEET.BASIC_SECONDS: both hands when there are two, the weapon's own clock. */
export function measureBasic(engine, u) {
  const reach = attackReach(engine, u);
  const dist = reach == null ? 2 : Math.max(2, Math.min(reach - 1.5, 10));
  const a = arena(engine, u, dist, 11);
  const tally = { damage: 0, healed: 0, hits: [] };
  const T = SHEET.BASIC_SECONDS, dt = 0.05;
  let swings = 0;
  for (let t = 0; t < T; t += dt) {
    a.room.run(() => {
      a.me.yaw = 0; a.me.x = 0; a.me.z = 0;
      const res = a.room.combat.attack(a.me, { yaw: 0, target: a.dummy });
      if (res.ok) {
        swings++;
        const hands = weaponHands(a.me);
        if (engine.casterForms && hands.dual && !isHeldFocus(hands.off)) a.room.combat.later(Math.max(0.12, (res.every || 0.6) * 0.5), () => a.room.combat.attack(a.me, { hand: 'off', yaw: 0, target: a.dummy }), a.me.id);
      }
    });
    stepArena(a, dt, tally);
  }
  return { dps: tally.damage / T, hits: tally.hits, swings, every: swings ? T / swings : null, reach };
}

/** Why a slot cannot be measured at all (no cast needed), or null. */
function unmeasurable(u, slot) {
  const row = u.skills?.rowFor(slot);
  const s = u.skills?.slots?.[slot];
  if (!row || !s || s.empty) return 'No skill in this slot.';
  if ((u.level || 1) < (s.unlockAt || 1)) return `Opens at level ${s.unlockAt}.`;
  if (reviveOf(row)) return 'A revive: it deals no damage.';
  if (row.form) return 'A shape, stance or song: it changes what your other abilities do.';
  return null;
}

/** ONE cast of a skill slot in its own scratch room: `{ ok, damage, healed, hits }` or `{ ok: false, why }`. */
export function measureCast(engine, u, slot, k = 0) {
  const row = u.skills.rowFor(slot);
  const s = u.skills.slots[slot];
  const cd = Math.max(0.5, u.skills.cooldownFor(s));
  const a = arena(engine, u, standFor(engine, u, row), 101 + k * 17 + slot);
  a.me.mp = a.me.maxMp;
  a.me.hp = Math.max(1, Math.round(a.me.maxHp * 0.2));          // hurt, so a heal is not capped by full health
  const res = a.room.run(() => a.room.combat.cast(a.me, slot, { target: a.dummy.id, aim: { x: a.dummy.x, z: a.dummy.z }, yaw: 0 }));
  if (!res.ok) return { ok: false, why: res.why || 'It cannot be cast on a training dummy.' };
  const tally = { damage: 0, healed: 0, hits: [] };
  const window = Math.min(cd, SHEET.MAX_WINDOW);
  // one cooldown's worth; a long-cooldown skill is watched until nothing of the cast is left (never past MAX_WINDOW)
  for (let t = 0; t < window; t += SHEET.DT) {
    if (t >= 1 && cd > SHEET.MAX_WINDOW && !busy(a)) break;
    stepArena(a, SHEET.DT, tally);
  }
  return { ok: true, ...tally };
}

/** Fold the casts of one slot into its numbers. */
function foldCasts(u, slot, casts, why = null) {
  const row = u.skills.rowFor(slot);
  const s = u.skills.slots[slot];
  const cd = Math.max(0.5, u.skills.cooldownFor(s));
  const good = casts.filter(c => c.ok);
  if (!good.length) return { dps: null, why: plainWhy(why || casts[0]?.why), cd };
  const damage = good.reduce((n, c) => n + c.damage, 0) / good.length;
  const healed = good.reduce((n, c) => n + c.healed, 0) / good.length;
  if (damage <= 0 && healed <= 0) return { dps: null, cd, why: row.shape === 'summon' || row.summon ? 'A summon: its follower does the damage.' : 'It deals no damage by itself.' };
  return { dps: damage > 0 ? damage / cd : null, hps: healed > 0 ? healed / cd : undefined, perCast: Math.round(damage), healCast: healed > 0 ? Math.round(healed) : undefined, cd, hits: good.flatMap(c => c.hits) };
}

/** One skill slot (0-based), averaged over SHEET.CASTS casts. `{ dps, hps, perCast, cd, why? }`. */
export function measureSkill(engine, u, slot) {
  const no = unmeasurable(u, slot);
  if (no) return { dps: null, why: no };
  const casts = [];
  for (let k = 0; k < SHEET.CASTS; k++) { const c = measureCast(engine, u, slot, k); casts.push(c); if (!c.ok) break; }
  return foldCasts(u, slot, casts);
}
const plainWhy = w => (/follower|room for/i.test(w || '') ? 'A summon: its follower does the damage.' : /form|stance|shape/i.test(w || '') ? 'A shape, stance or song.' : (w || 'It cannot be measured on a training dummy.'));

const span = hits => (hits && hits.length ? [Math.round(Math.min(...hits)), Math.round(Math.max(...hits))] : undefined);

function basicRow(engine, u, b) {
  const card = basicCard(engine, u);
  return {
    id: 'basic', slot: 0, name: `Basic attack (${card.name})`, dps: b ? r1(b.dps) : null, hit: b ? span(b.hits) : undefined, every: b?.every ? r2(b.every) : undefined,
    reach: card.reach, tip: `Measured: ${SHEET.BASIC_SECONDS} seconds of basic attacks${card.hands === 2 ? ' with both hands' : ''} on one training dummy of your level with no armour. ${card.desc}`,
    ...(b ? {} : { pending: true }),
  };
}
function skillRow(engine, u, i, m) {
  const s = u.skills.slots[i];
  const row = u.skills.rowFor(i);
  if (!m) return { id: s.id, slot: i + 1, name: row?.name || s.name, dps: null, mp: Math.round(u.skills.costFor(s) || 0), tip: 'Being measured…', pending: true };
  return {
    id: s.id, slot: i + 1, name: row?.name || s.name,
    dps: m.dps != null ? r1(m.dps) : null,
    ...(m.hps != null ? { hps: r1(m.hps) } : {}),
    ...(m.perCast ? { perCast: m.perCast } : {}), ...(m.healCast ? { healCast: m.healCast } : {}),
    ...(span(m.hits) ? { hit: span(m.hits) } : {}),
    ...(m.cd ? { cd: r1(m.cd) } : {}),
    mp: Math.round(u.skills.costFor(s) || 0),
    tip: m.dps != null || m.hps != null
      ? `Measured: what one cast does to one training dummy of your level with no armour${m.cd ? ` within its ${r1(m.cd)}s cooldown` : ''}, divided by the cooldown (the average of ${SHEET.CASTS} casts). Burns, zones and repeats are counted; followers and extra targets are not.`
      : (m.why || ''),
    ...(m.dps == null && m.hps == null ? { why: m.why || 'It cannot be measured.' } : {}),
  };
}

/** Every ability's row: the basic attack (slot 0) and the six skills. Measures everything now (~40 ms). */
export function abilityRows(engine, u) {
  const out = [basicRow(engine, u, measureBasic(engine, u))];
  (u.skills?.slots || []).forEach((s, i) => { if (!s.empty) out.push(skillRow(engine, u, i, measureSkill(engine, u, i))); });
  return out;
}

/**
 * The same measurement cut into SLICES (one basic-attack run or one cast each, a few milliseconds), for a server
 * that must not stall its tick: `job.step()` does one slice and returns true when the sheet is complete;
 * `job.rows()` is what is known so far (unmeasured abilities carry `pending: true`).
 */
export function sheetJob(engine, u) {
  const key = keyOf(u);
  const slots = (u.skills?.slots || []).map((s, i) => (s.empty ? null : i)).filter(i => i != null);
  const state = { basic: null, skills: new Map() };
  const todo = [{ kind: 'basic' }];
  for (const i of slots) {
    const no = unmeasurable(u, i);
    if (no) state.skills.set(i, { done: { dps: null, why: no }, casts: [] });
    else { state.skills.set(i, { done: null, casts: [] }); for (let k = 0; k < SHEET.CASTS; k++) todo.push({ kind: 'cast', slot: i, k }); }
  }
  const job = {
    key, unit: u,
    get done() { return !todo.length; },
    /** the build changed under the job (new gear, a talent): its numbers are for nobody */
    get stale() { return keyOf(u) !== key; },
    step() {
      if (keyOf(u) !== key) { todo.length = 0; return true; }
      const t = todo.shift();
      if (!t) return true;
      if (t.kind === 'basic') state.basic = measureBasic(engine, u);
      else {
        const st = state.skills.get(t.slot);
        const c = measureCast(engine, u, t.slot, t.k);
        st.casts.push(c);
        if (!c.ok) { for (let i = todo.length - 1; i >= 0; i--) if (todo[i].slot === t.slot) todo.splice(i, 1); }
        if (!todo.some(x => x.slot === t.slot)) st.done = foldCasts(u, t.slot, st.casts);
      }
      if (!todo.length) CACHE.set(u, { key, abilities: job.rows() });
      return !todo.length;
    },
    rows() {
      const out = [basicRow(engine, u, state.basic)];
      for (const i of slots) out.push(skillRow(engine, u, i, state.skills.get(i).done));
      return out;
    },
  };
  return job;
}

// ------------------------------------------------------------------------------------------------ the sheet

const CACHE = new WeakMap();
export const buildKey = u => keyOf(u);
function keyOf(u) { return JSON.stringify([u.classId, u.level, Object.entries(u.equipment || {}).map(([s, it]) => (it ? [s, it.uid || it.id, it.rarity, (it.affixes || []).length, it.castStyle || '', it.brand || ''] : null)), u.skillTalents || {}, u.perks || [], u.skills?.slots?.map(s => s.id), Object.keys(u.forms || {}).map(g => u.forms[g]?.id)]); }

/**
 * The whole sheet: `{ core: [row], advanced: [row], abilities: [abilityRow], dummy: { level, armor } }`.
 * Cached per character until its class, level, gear, talents, perks or shape change (the stat rows are always fresh).
 */
export function characterSheet(engine, u, { fresh = false } = {}) {
  if (!u) return null;
  const key = keyOf(u);
  let hit = CACHE.get(u);
  if (fresh || !hit || hit.key !== key) { hit = { key, abilities: abilityRows(engine, u) }; CACHE.set(u, hit); }
  return { core: coreRows(engine, u), advanced: advancedRows(engine, u), abilities: hit.abilities, dummy: { level: u.level || 1, armor: 0 }, pending: false };
}
/** The abilities already measured for this exact build, or null (never measures). */
export function cachedAbilities(u) { const hit = u && CACHE.get(u); return hit && hit.key === keyOf(u) ? hit.abilities : null; }
/** The stat rows only (always fresh, no measuring). */
export const statRows = (engine, u) => ({ core: coreRows(engine, u), advanced: advancedRows(engine, u), dummy: { level: u.level || 1, armor: 0 } });

/** The sheet as if `item` were worn in `slot` (default: where it would go). The character itself is not touched. */
export function sheetWith(engine, u, item, slot = null, { measure = false } = {}) {
  const c = copyOf(engine, u);
  c.forms = u.forms;
  const copy = JSON.parse(JSON.stringify(item));
  const out = engine.rpg.equip(c, copy, { into: slot || null });
  if (out && out.refused) return { ok: false, text: out.refused };
  engine.rpg.refresh(c, { full: true });
  // the stat rows at once; `measure: true` also measures every ability (about 40 ms: not for a hover on a busy server)
  return measure ? { ok: true, ...characterSheet(engine, c, { fresh: true }) } : { ok: true, ...statRows(engine, c), abilities: null, pending: false };
}
