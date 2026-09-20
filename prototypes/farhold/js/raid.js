// Farhold — raids on your base, which you START.
//
// PURE JavaScript: no DOM, no Three.js. `data/raids.json` carries every number.
//
//   import { notorietyOf, raidOffer, acceptRaid, beginRaid, clearWave, raidRewards } from './raid.js';
//   const offer = raidOffer({ base, level, biome, enemies, rng, data: raidsJson });
//   if (offer) questLog.add(acceptRaid(offer));        // the player said yes
//   beginRaid(quest, { hour: 21 });                    // the player rang the bell
//
// WHY A QUEST AND NOT AN EVENT.
//
//   "[the tower defence] might be better as a quest rather than a random event, so the player can
//    decide when to start on it rather than being a burden."
//
// An unannounced wave is a tax on building. You put up a fourth wall, the game punishes you, and the
// lesson learned is "stop building". So the whole thing is inverted: the world OFFERS you a fight —
// a rumour, a scout, a note on the quest board — and nothing whatsoever happens until you accept it
// and then choose your moment. `canFire()` is the single gate, and it is false for an offer that has
// not been accepted. Every other function in this file refuses to spawn anything without it.
//
// BOTH GATES, ALWAYS (§7.1). An offer needs base SIZE and base DEFENCE. A player with twenty houses
// and no turret is never offered a raid, because being raided for building a house is exactly the
// punishment this design exists to remove. A player who wants the fight sooner builds a turret,
// which is the behaviour we actually want to reward.
//
// (§7.20 names Frontier Foundry's wave code as prior art. The wave shape here is that shape,
// simplified to run without a tile grid.)

/** A safety net if the JSON did not load. `data/raids.json` is the real file. */
const FALLBACK = {
  notoriety: { perStructure: 1, perDefence: 1.5, perCitizen: 1.2, perRefineryThroughput: 0.6, waypoint: 18, perThousandGold: 4, max: 400 },
  tiers: [{ key: 'prowlers', name: 'Prowlers at the Fence', rank: 1, minNotoriety: 12, minSize: 6, minDefence: 2, waves: 3, packPerWave: [2, 4], breatherHours: 0.25, levelOffset: -1, boss: false, crates: ['rare'], reward: { gold: [80, 160], xp: [120, 240], standing: 4, blueprints: 0 }, text: 'Something has been counting your fence posts.' }],
  night: { hpMultiplier: 1.2, dmgMultiplier: 1.15, goldMultiplier: 1.4, xpMultiplier: 1.3, fromHour: 20, toHour: 5 },
  early: { warningHours: 6, goldBonus: 0.25 },
  targets: ['waypoint', 'refinery', 'store', 'centre'],
  scale: { hpPerPlayerLevel: 0.06, hpPerDefence: 0.02, dmgPerPlayerLevel: 0.05, maxDefenceScaling: 1.6 },
  loss: { structuresBrokenFraction: 0.2, materialsTakenFraction: 0.25, citizensLeave: 1 },
};

/** The floor on a raid's loot, in rarity order. §7.13: a rare crate is guaranteed, never rolled. */
export const RARITY_ORDER = ['normal', 'magic', 'rare', 'epic', 'legendary'];

/** The states a raid passes through. Nothing spawns outside `running`. */
export const RAID_STATES = {
  offered:  { id: 'offered',  name: 'Offered',   blurb: 'On the board. Nothing is coming.' },
  accepted: { id: 'accepted', name: 'Accepted',  blurb: 'You have taken it. Ring the bell when you are ready.' },
  running:  { id: 'running',  name: 'Under attack', blurb: 'Waves are coming.' },
  won:      { id: 'won',      name: 'Held',      blurb: 'The base stood.' },
  lost:     { id: 'lost',     name: 'Overrun',   blurb: 'Broken structures and an emptier store. Not a deleted base.' },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round2 = n => Math.round(n * 100) / 100;
const between = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (rng, list) => (list && list.length ? list[Math.floor(rng() * list.length)] : null);

/**
 * How worth robbing does this place look?
 *
 * Notoriety chooses which TIER is on offer. It never starts anything and it is never a countdown —
 * a base that sits at 200 notoriety for a year is raided exactly zero times if the player never
 * accepts an offer.
 */
export function notorietyOf(base = {}, data = null) {
  const N = (data || FALLBACK).notoriety || FALLBACK.notoriety;
  const score =
    (base.structures || 0) * N.perStructure +
    (base.defences || 0) * N.perDefence +
    (base.citizens || 0) * N.perCitizen +
    (base.throughput || 0) * N.perRefineryThroughput +
    (base.waypoint ? N.waypoint : 0) +
    ((base.gold || 0) / 1000) * N.perThousandGold;
  return Math.round(clamp(score, 0, N.max));
}

/**
 * The hardest tier this base qualifies for, or null.
 *
 * Reads all three: notoriety picks the rank, size and defence are the gates, and BOTH must pass.
 * Returns `{ tier, why }` when nothing qualifies so the UI can say which of the two is short —
 * "they have not noticed you yet" reads very differently from "you have nothing to defend with".
 */
export function tierFor({ base = {}, data = null } = {}) {
  const D = data || FALLBACK;
  const tiers = D.tiers || FALLBACK.tiers;
  const note = notorietyOf(base, D);
  const size = base.structures || 0;
  const def = base.defences || 0;
  let best = null;
  let nearest = null;
  for (const t of tiers) {
    if (note >= t.minNotoriety && size >= t.minSize && def >= t.minDefence) {
      if (!best || t.rank > best.rank) best = t;
    } else if (!nearest || t.rank < nearest.rank) nearest = t;
  }
  if (best) return { tier: best, notoriety: note, why: null };
  const why = !nearest ? 'Nothing out here has any reason to come for you.'
    : size < nearest.minSize ? 'There is not enough here yet for anybody to bother with.'
    : def < nearest.minDefence ? 'Nothing would come at a place with no defences — and nothing should, until you have some.'
    : 'They have not noticed you yet.';
  return { tier: null, notoriety: note, why, nearest };
}

/**
 * Enemies that actually live on this ground, at a level the player can face.
 *
 * §7.6: a raid on a marsh base is marsh creatures. The bestiary is filtered by biome first and only
 * falls back to "anything" if this ground has nothing in it — which on a crystal or void world it
 * sometimes genuinely does.
 */
export function raidersFor({ enemies = [], biome = 'any', level = 1, levelOffset = 0 } = {}) {
  const want = level + levelOffset;
  const ground = String(biome || 'any').toLowerCase();
  const inBand = e => (e.minLevel ?? 1) <= want + 4 && (e.maxLevel ?? 99) >= want - 3;
  const here = enemies.filter(e => inBand(e) && (e.biomes || ['any']).some(b => b === 'any' || ground.includes(b)));
  if (here.length) return here;
  const anywhere = enemies.filter(inBand);
  return anywhere.length ? anywhere : enemies;
}

/**
 * Build the offer. Returns null when the base does not qualify, or when the player has raids
 * switched off (§7.19 — some people want to build in peace, and that is a legitimate way to play).
 */
export function raidOffer({
  base = {}, level = 1, biome = 'any', enemies = [], bosses = [], modifiers = [],
  rng = Math.random, data = null, enabled = true, at = 0, placeName = 'your base', place = null,
} = {}) {
  if (!enabled) return null;
  const D = data || FALLBACK;
  const { tier, notoriety, why } = tierFor({ base, data: D });
  if (!tier) return { ok: false, tier: null, notoriety, why };

  const pool = raidersFor({ enemies, biome, level, levelOffset: tier.levelOffset || 0 });
  if (!pool.length) return { ok: false, tier: null, notoriety, why: 'Nothing lives out here that would come for you.' };

  const waves = [];
  for (let i = 0; i < tier.waves; i++) {
    const last = i === tier.waves - 1;
    const groups = [];
    const kinds = 1 + (i > 0 ? 1 : 0);
    for (let k = 0; k < kinds; k++) {
      const def = pick(rng, pool);
      if (!def) continue;
      const count = between(rng, tier.packPerWave) + Math.floor(i * 0.5);
      const mod = i >= 2 && modifiers.length && rng() < 0.35 ? pick(rng, modifiers) : null;
      groups.push({ defId: def.id, name: def.name, count, modifier: mod ? mod.id : null, modifierName: mod ? mod.name : null });
    }
    const boss = last && tier.boss ? pickBoss({ bosses, pool, level, rng, modifiers }) : null;
    waves.push({ index: i + 1, groups, boss, cleared: false, killed: 0, wanted: groups.reduce((s, g) => s + g.count, 0) + (boss ? 1 : 0) });
  }

  return {
    ok: true,
    id: `raid_${Math.floor(rng() * 1e9).toString(36)}`,
    kind: 'raid',
    state: 'offered',
    tierKey: tier.key,
    tierName: tier.name,
    rank: tier.rank,
    notoriety,
    biome,
    level,
    placeName,
    place,
    target: (D.targets || FALLBACK.targets).find(t => t === 'waypoint' && base.waypoint) || (D.targets || FALLBACK.targets)[1] || 'centre',
    waves,
    wave: 0,
    breatherHours: tier.breatherHours ?? 0.3,
    warningHours: (D.early || FALLBACK.early).warningHours ?? 6,
    offeredAt: at,
    acceptedAt: null,
    startedAt: null,
    night: false,
    early: false,
    // Quest-shaped so js/quests.js can carry it in the same log as everything else.
    title: `${tier.name} — ${placeName}`,
    text: tier.text,
    count: tier.waves,
    progress: 0,
    done: false,
    turnedIn: false,
    giverId: null,
    giverName: 'the watch',
    reward: { gold: between(rng, tier.reward.gold), xp: between(rng, tier.reward.xp), standing: tier.reward.standing || 0 },
    crates: [...(tier.crates || ['rare'])],
    blueprints: tier.reward.blueprints || 0,
  };
}

/** A named thing for the last wave. Falls back to the biggest ordinary raider with a modifier on it. */
function pickBoss({ bosses = [], pool = [], level = 1, rng = Math.random, modifiers = [] }) {
  const fit = bosses.filter(b => (b.minLevel ?? 1) <= level + 5);
  const boss = pick(rng, fit.length ? fit : bosses);
  if (boss) return { defId: boss.id, name: boss.name, modifier: null, modifierName: null };
  const stand = pool.slice().sort((a, b) => (b.hp || 0) - (a.hp || 0))[0];
  if (!stand) return null;
  const mod = pick(rng, modifiers);
  return { defId: stand.id, name: mod ? `${mod.prefix || mod.name} ${stand.name}` : stand.name, modifier: mod?.id || null, modifierName: mod?.name || null };
}

/**
 * THE GATE. Nothing spawns unless this is true.
 *
 * One function, read by every caller, so there is exactly one place to look when somebody asks
 * "can this raid start?" — and exactly one place that would have to be broken for a raid to ever
 * be a surprise again.
 */
export function canFire(quest) {
  return !!quest && (quest.state === 'accepted' || quest.state === 'running');
}

/** The player said yes. Still nothing is coming — they choose the hour. */
export function acceptRaid(quest, { at = 0 } = {}) {
  if (!quest || !quest.ok) return { ok: false, why: 'There is no raid on offer.' };
  if (quest.state !== 'offered') return { ok: false, why: 'You have already taken that one.' };
  quest.state = 'accepted';
  quest.acceptedAt = at;
  return quest;
}

/** The player changed their mind before ringing the bell. Free — that is the whole point. */
export function declineRaid(quest) {
  if (!quest) return { ok: false, why: 'There is no raid on offer.' };
  if (quest.state === 'running') return { ok: false, why: 'They are already at the wall.' };
  quest.state = 'declined';
  return { ok: true, quest };
}

/** Is this hour night, by the raid table's reckoning? */
export function isNight(hour, data = null) {
  const N = (data || FALLBACK).night || FALLBACK.night;
  return hour >= N.fromHour || hour < N.toHour;
}

/**
 * Ring the bell. The ONLY way a wave is ever spawned.
 *
 * Refuses an offer that was never accepted — this is the rule the node test drives, because it is
 * the one that makes raids stop being a burden.
 */
export function beginRaid(quest, { at = 0, hour = 12, data = null, early = false } = {}) {
  if (!quest) return { ok: false, why: 'There is no raid.' };
  if (!canFire(quest)) return { ok: false, why: 'You have not taken that on. Nothing is coming until you do.' };
  if (quest.state === 'running') return { ok: false, why: 'It has already started.' };
  const D = data || FALLBACK;
  quest.state = 'running';
  quest.startedAt = at;
  quest.wave = 1;
  quest.night = isNight(hour, D);
  quest.early = !!early;
  quest.hour = hour;
  return { ok: true, quest, wave: currentWave(quest) };
}

/** The wave on the field right now, or null between waves and before the bell. */
export function currentWave(quest) {
  if (!quest || quest.state !== 'running') return null;
  return quest.waves[quest.wave - 1] || null;
}

/**
 * What the spawner should actually put on the ground: the wave's groups with their numbers already
 * scaled. §7.17 — difficulty comes from your level and your defences, never from the calendar.
 */
export function waveSpawns(quest, { base = {}, level = 1, data = null } = {}) {
  const wave = currentWave(quest);
  if (!wave) return [];
  const D = data || FALLBACK;
  const S = D.scale || FALLBACK.scale;
  const N = D.night || FALLBACK.night;
  const defScale = clamp(1 + (base.defences || 0) * S.hpPerDefence, 1, S.maxDefenceScaling);
  const hp = (1 + (level - 1) * S.hpPerPlayerLevel) * defScale * (quest.night ? N.hpMultiplier : 1);
  const dmg = (1 + (level - 1) * S.dmgPerPlayerLevel) * (quest.night ? N.dmgMultiplier : 1);
  const out = wave.groups.map(g => ({ ...g, hpMultiplier: round2(hp), dmgMultiplier: round2(dmg), target: quest.target }));
  if (wave.boss) out.push({ ...wave.boss, count: 1, boss: true, hpMultiplier: round2(hp * 1.6), dmgMultiplier: round2(dmg * 1.25), target: quest.target });
  return out;
}

/** A raider went down. Progress within a wave, for the HUD counter. */
export function onRaiderKilled(quest) {
  const wave = currentWave(quest);
  if (!wave) return null;
  wave.killed++;
  if (wave.killed >= wave.wanted) return clearWave(quest);
  return { ok: true, cleared: false, left: wave.wanted - wave.killed };
}

/** A wave is done. Returns whether the whole raid is done with it. */
export function clearWave(quest, { at = 0 } = {}) {
  if (!quest || quest.state !== 'running') return { ok: false, why: 'Nothing is running.' };
  const wave = quest.waves[quest.wave - 1];
  if (!wave) return { ok: false, why: 'No such wave.' };
  wave.cleared = true;
  quest.progress = quest.wave;
  if (quest.wave >= quest.waves.length) {
    quest.state = 'won';
    quest.done = true;
    quest.endedAt = at;
    return { ok: true, cleared: true, raidDone: true, quest };
  }
  quest.wave++;
  return { ok: true, cleared: true, raidDone: false, breatherHours: quest.breatherHours, next: currentWave(quest) };
}

/** The base fell. §7.11: broken structures and a lighter store, never a deleted base. */
export function loseRaid(quest, { base = {}, materials = 0, data = null } = {}) {
  if (!quest) return { ok: false };
  const L = (data || FALLBACK).loss || FALLBACK.loss;
  quest.state = 'lost';
  quest.done = true;
  return {
    ok: true,
    quest,
    structuresBroken: Math.max(1, Math.round((base.structures || 0) * L.structuresBrokenFraction)),
    materialsTaken: Math.round(materials * L.materialsTakenFraction),
    citizensLeave: L.citizensLeave || 0,
    line: 'They got over the wall. Things are broken and the store is lighter — nothing is gone for good.',
  };
}

/**
 * What holding the base is worth.
 *
 * §7.13: the crates in the tier are a FLOOR, not a roll. `crates` comes back as a list of
 * rarities the caller spawns, and the lowest of them is never below rare. The floor is asserted
 * here rather than trusted to the data, because a rare crate every single time is the promise the
 * design makes and a typo in a JSON file should not be able to break it.
 */
export function raidRewards(quest, { rng = Math.random, data = null } = {}) {
  if (!quest) return null;
  const D = data || FALLBACK;
  const N = D.night || FALLBACK.night;
  const E = D.early || FALLBACK.early;
  const nightGold = quest.night ? N.goldMultiplier : 1;
  const nightXp = quest.night ? N.xpMultiplier : 1;
  const earlyGold = quest.early ? 1 + (E.goldBonus || 0) : 1;
  const floor = RARITY_ORDER.indexOf('rare');
  const crates = (quest.crates || ['rare']).map(r => {
    const at = RARITY_ORDER.indexOf(r);
    return RARITY_ORDER[Math.max(floor, at < 0 ? floor : at)];
  });
  if (!crates.length) crates.push('rare');
  return {
    gold: Math.round((quest.reward?.gold || 0) * nightGold * earlyGold),
    xp: Math.round((quest.reward?.xp || 0) * nightXp),
    standing: quest.reward?.standing || 0,
    crates,
    blueprints: quest.blueprints || 0,
    night: !!quest.night,
    early: !!quest.early,
    line: `${quest.tierName} held${quest.night ? ', in the dark' : ''}. ${crates.length} crate${crates.length === 1 ? '' : 's'} out of what they were carrying.`,
  };
}

/**
 * The journal's raid history (§7.16). Small, flat, and saved with everything else.
 */
export class RaidBook {
  constructor(saved = null) {
    this.entries = saved?.entries || [];
    this.max = 60;
  }

  record(quest, outcome = null) {
    if (!quest) return null;
    const entry = {
      id: quest.id,
      tier: quest.tierName,
      rank: quest.rank,
      place: quest.placeName,
      day: quest.startedAt ?? quest.acceptedAt ?? 0,
      night: !!quest.night,
      early: !!quest.early,
      waves: quest.waves?.length || 0,
      held: quest.state === 'won',
      came: (quest.waves || []).flatMap(w => w.groups.map(g => `${g.count} ${g.name}`)),
      won: outcome && outcome.crates ? outcome : null,
      lost: outcome && outcome.structuresBroken ? outcome : null,
    };
    this.entries.unshift(entry);
    if (this.entries.length > this.max) this.entries.length = this.max;
    return entry;
  }

  /** One line each for the journal page. */
  lines() {
    return this.entries.map(e => {
      const when = e.night ? 'in the dark' : 'by day';
      const how = e.held ? 'held' : 'overrun';
      return `${e.tier} at ${e.place}, ${when} — ${how}. ${e.came.slice(0, 3).join(', ')}${e.came.length > 3 ? '…' : ''}`;
    });
  }

  toJSON() { return { entries: this.entries }; }
}
