// Thousandvale — TIMED SELF-BUFFS from things you buy (the lead's follow-up to play-test 2).
//
// Shops sell a whetstone, armour oil, silver dust, a fletching kit, oats, torches, hearty stew (stream E's
// data/provinces/shops.json `goodsCatalog[id].use`). Each one is a BUFF here:
//
//   * one per KIND: using a second whetstone while the first is running refreshes it (the longer time and the
//     bigger number win), it never stacks;
//   * it is a status on the body (`item:<kind>`), so it rides along on a zone change (the room hands the unit
//     over whole), shows on `info.st` for everyone near, counts down with every other status, and — like every
//     status — ENDS ON DEATH (index.js endStatuses);
//   * it is saved with the build (`saveBuild().buffs`), so logging out does not throw away a 15-minute oil.
//
// What each stat does, and who reads it:
//   dmgPct        +% to every hit you land                                     level-gap.js strike wrapper
//   rangedPct     +% to every hit while you hold a bow / crossbow / javelin      level-gap.js strike wrapper
//   vsUndeadPct   +% to hits on the undead (and anything cursed)               level-gap.js strike wrapper
//   armorPct      +% armour                                                    rpg.derive wrapper (here)
//   hpPct         +% maximum health                                            rpg.derive wrapper (here)
//   mountSpeedPct +% riding speed                                              stream A (rules.itemBuffs(e))
//   (owner feedback 8, W22: the torch — stat `light`, status `item:torch` — is REMOVED with every other light item;
//    a torch buff in an old save is dropped on load. Everyone carries the same light: LIGHT in index.js.)
//
// Pure.

import { weaponHands } from './farhold.js';
import { warmStatus } from './hazards.js';      // [S] Expansion 1 §4

/** Buff kinds: stat -> the status id suffix and the name on the card. */
export const BUFF_KINDS = Object.freeze({
  dmgPct: { kind: 'whetted', name: 'Whetted edge' },
  rangedPct: { kind: 'fletched', name: 'Fresh fletching' },
  vsUndeadPct: { kind: 'silvered', name: 'Silvered' },
  armorPct: { kind: 'oiled', name: 'Oiled armour' },
  hpPct: { kind: 'well_fed', name: 'Well fed' },
  mountSpeedPct: { kind: 'oats', name: 'Oat-fed mount' },
});
/** Caps, so a data typo can never make a god: no item buff past these. */
export const BUFF_CAPS = Object.freeze({ dmgPct: 0.25, rangedPct: 0.25, vsUndeadPct: 0.4, armorPct: 0.5, hpPct: 0.25, mountSpeedPct: 0.5 });
export const MAX_MINUTES = 60;
const PREFIX = 'item:';

/** The buffs on a unit as a plain map: { dmgPct: 0.03, armorPct: 0.04, ... }. */
export function itemBuffs(unit) {
  const out = {};
  for (const [id, st] of Object.entries(unit?.statuses || {})) {
    if (!id.startsWith(PREFIX) || !st.itemBuff) continue;
    const b = st.itemBuff;
    out[b.stat] = (out[b.stat] || 0) + b.amount;
  }
  return out;
}
/** Signature of the sheet-changing buffs (armour, health): index.js re-derives the sheet when it changes. */
export const sheetKey = unit => { const b = itemBuffs(unit); return `${b.armorPct || 0}|${b.hpPct || 0}`; };

/**
 * Put a buff on `unit` (one per kind; a re-use refreshes). Returns { ok, id, stat, amount, seconds } or { ok:false, why }.
 * `spec` = E's `use.buff` ({ stat, amount, minutes }).
 */
export function applyItemBuff(unit, spec, { source = null } = {}) {
  const stat = spec?.stat;
  const k = BUFF_KINDS[stat];
  if (!unit || !k) return { ok: false, why: 'That does nothing.' };
  const amount = Math.max(0, Math.min(BUFF_CAPS[stat], Number(spec.amount) || 0));
  if (!(amount > 0)) return { ok: false, why: 'That does nothing.' };
  const seconds = Math.max(1, Math.min(MAX_MINUTES, Number(spec.minutes) || 15)) * 60;
  const id = PREFIX + k.kind;
  unit.statuses ||= {};
  const had = unit.statuses[id];
  const keepAmount = had?.itemBuff ? Math.max(had.itemBuff.amount, amount) : amount;
  unit.statuses[id] = {
    type: id, kind: 'buff', name: k.name, remaining: Math.max(seconds, had?.remaining || 0), power: 1,
    itemBuff: { stat, amount: keepAmount, source },
  };
  return { ok: true, id, stat, amount: keepAmount, seconds: unit.statuses[id].remaining, refreshed: !!had };
}

/** The damage multiplier the buffs put on one hit (1 when there are none). */
export function itemStrikeMult(attacker, defender) {
  if (!attacker?.statuses) return 1;
  const b = itemBuffs(attacker);
  if (b.dmgPct == null && b.rangedPct == null && b.vsUndeadPct == null) return 1;
  let k = 1 + (b.dmgPct || 0);
  if (b.rangedPct && attacker.equipment) { const w = weaponHands(attacker).main; if (w?.ranged) k *= 1 + b.rangedPct; }
  const undead = defender?.family === 'undead' || !!defender?.statuses?.curse;
  if (b.vsUndeadPct && undead) k *= 1 + b.vsUndeadPct;
  return k;
}

/** Wrap `engine.rpg.derive` once: armour and health buffs land in the sheet Farhold builds. */
export function installItemBuffs(engine) {
  const rpg = engine.rpg;
  if (rpg._itemBuffs) return;
  rpg._itemBuffs = true;
  const derive = rpg.derive;
  rpg.derive = function itemBuffDerive(unit, ...rest) {
    const d = derive.call(this, unit, ...rest);
    if (!unit?.statuses || !d) return d;
    const b = itemBuffs(unit);
    if (b.armorPct) d.armor = Math.round(d.armor * (1 + b.armorPct));
    if (b.hpPct) d.maxHp = Math.round(d.maxHp * (1 + b.hpPct));
    return d;
  };
}

/** For the save: the running buffs as plain rows. */
export const saveItemBuffs = unit => Object.values(unit?.statuses || {}).filter(st => st.itemBuff && st.remaining > 0)
  .map(st => ({ stat: st.itemBuff.stat, amount: st.itemBuff.amount, seconds: Math.round(st.remaining), source: st.itemBuff.source || null }));
/** …and back on a sheet. */
export function restoreItemBuffs(unit, rows) {
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r && r.source === 'spring' && r.seconds > 0) { warmStatus(unit, r.seconds); continue; }      // [S] a hot spring's Steam-warmed comes back as itself, not as "Well fed"
    if (r && BUFF_KINDS[r.stat] && r.seconds > 0) applyItemBuff(unit, { stat: r.stat, amount: r.amount, minutes: r.seconds / 60 }, { source: r.source });
  }
}

/** The recall charm's channel (the lead: 5 s, standing still). */
export const RECALL = Object.freeze({ seconds: 5, drift: 0.6 });
/** A revive flask: how close you must stand to the body, and the share of health it comes back with. */
export const REVIVE_FLASK = Object.freeze({ range: 10, share: 0.4 });
