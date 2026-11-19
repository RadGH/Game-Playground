// The pilot's locker: owned parts (items with a uid), firmware chips, and saved builds that point at them. A saved
// build → the build a mission runs (resolveBuild), and the rules the assembly bay enforces (buildProblems). Pure.
import { SLOTS, WEAPON_SLOTS, mechStats } from './loadout.js';
import { chipLoad, chipRule, chipId } from './chips.js';
import { starterBuild } from './starters.js';
import { newUid } from './loot.js';

export const MAX_BUILDS = 8;

export const itemByUid = (save, uid) => (uid ? save.items.find(i => i.uid === uid) || null : null);
export const chipByUid = (save, uid) => (uid ? save.chips.find(c => c.uid === uid) || null : null);
export const activeBuild = save => save.builds.find(b => b.id === save.active) || save.builds[0];

/** A saved build → the mission's build: { head: item, …, weapons: [item|null ×4], chips: [chipId], paint }. Crafted parts
 *  keep their model id (the Mech Kit draws the model's picture). */
export function resolveBuild(save, b, P) {
  const out = { paint: b.paint || 'maker', chips: (b.chips || []).map(u => chipByUid(save, u)?.id).filter(Boolean), name: b.name,
    kit: save.kit || 1, skill: b.skill || 'repulse', tuning: { ...(b.tuning || {}) } };   // round 7: the pilot's repair kit Mk; the build's skill and Frame Tuning
  const asItem = it => (it ? { ...it, model: P[it.id]?.model || null } : null);
  for (const s of SLOTS) out[s] = asItem(itemByUid(save, b.parts[s]));
  out.weapons = (b.weapons || [null, null, null, null]).map(u => asItem(itemByUid(save, u)));
  return out;
}

/** Which saved builds use an item (uid) or a chip — a used part can't be sold or scrapped. */
export const buildsUsing = (save, uid) => save.builds.filter(b => Object.values(b.parts).includes(uid) || (b.weapons || []).includes(uid) || (b.chips || []).includes(uid));

/** Can this part go in this place? place = a frame slot id, or 'w0'..'w3' (weapon slots L, R, SL, SR). */
export function fits(part, place) {
  if (!part) return false;
  if (place.startsWith('w')) { const ws = WEAPON_SLOTS[+place.slice(1)]; return part.slot === 'weapon' && part.mount === ws.mount; }
  return part.slot === place;
}

/**
 * What's wrong with a build. errors stop a launch; warnings are shown in the stat panel.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function buildProblems(build, P, C) {
  const errors = [], warnings = [];
  for (const s of SLOTS) if (!build[s]) errors.push(`No ${s === 'cpu' ? 'CPU' : s} fitted.`);
  const ws = build.weapons || [];
  if (!ws.some(Boolean)) warnings.push('No weapons fitted.');
  const twoHand = [0, 1].filter(i => ws[i] && P[ws[i].id ?? ws[i]]?.hand === 'two');
  if (twoHand.length && !chipRule(build.chips, C, 'twoHandInOne')) {
    if (twoHand.length === 2 || ws[1 - twoHand[0]]) errors.push('A two-handed weapon needs the other arm empty (or a Twin Grip chip).');
  }
  if (errors.some(e => e.startsWith('No '))) return { errors, warnings };
  const st = mechStats(build, P, C);
  const load = chipLoad(build.chips, C);
  if (load > st.firmware) errors.push(`Chips need ${load} firmware; the CPU holds ${Math.round(st.firmware)}.`);
  if (st.overweight > 0) warnings.push(`Overweight by ${Math.round(st.overweight * 100)}%: slower on foot and in the air.`);
  if (st.powerShort > 0) warnings.push(`The generator is ${Math.round(st.powerShort * 100)}% short: energy refills slower.`);
  return { errors, warnings };
}

/** The chip each maker's starter frame comes with (round 7 — owner: "I still haven't seen any firmware"). */
export const STARTER_CHIP = { celerity: 'snap-dash', brannoch: 'layered-plate', calyx: 'deep-cell', patchwork: 'magnet-hook' };

/** A locker with ONE maker's starter frame as owned Common parts, its chip fitted (round 7 — owner: "too many parts
 *  provided out of the box … choose just one of the four bots to start with and start with only those parts"). */
export function starterLocker(PARTS, MAKERS, maker = 'brannoch') {
  const items = [], chips = [];
  const own = id => { if (!id) return null; const it = { uid: newUid(), id, rarity: 'common', rolls: [], mods: [], found: 0 }; items.push(it); return it.uid; };
  const mk = MAKERS.find(m => m.id === maker) || MAKERS[0];
  const sb = starterBuild(PARTS, mk.id);
  const parts = Object.fromEntries(SLOTS.map(s => [s, own(sb[s])]));
  const chip = STARTER_CHIP[mk.id] ? { uid: newUid(), id: STARTER_CHIP[mk.id] } : null; if (chip) chips.push(chip);
  const builds = [{ id: 'b-' + mk.id, name: `${mk.short} starter`, parts, weapons: sb.weapons.map(own), chips: chip ? [chip.uid] : [], paint: 'maker', skill: 'repulse', tuning: {} }];
  return { items, chips, builds, active: 'b-' + mk.id };
}

/** Every maker's starter (round 2's locker) — only for upgrading round 1 saves, which had all four. */
export function allStartersLocker(PARTS, MAKERS) {
  const out = { items: [], chips: [], builds: [], active: null };
  for (const mk of MAKERS) { const l = starterLocker(PARTS, MAKERS, mk.id); out.items.push(...l.items); out.builds.push(...l.builds.map(b => ({ ...b, chips: [] }))); }
  out.active = out.builds[0]?.id || null;
  return out;
}

/** A new saved build copied from another (shares the same parts — builds are loadouts, not separate stock). */
export function copyBuild(save, b, name) {
  const nb = JSON.parse(JSON.stringify(b)); nb.id = 'b-' + newUid(); nb.name = name || `${b.name} copy`;
  save.builds.push(nb); return nb;
}

/** Put an item (or nothing) into a place of a build, keeping the build legal where it can (a two-hander in an arm
 *  clears the other arm unless Twin Grip is fitted). Returns the build. */
export function equip(save, b, place, uid, P, C) {
  if (place.startsWith('w')) {
    const i = +place.slice(1); b.weapons[i] = uid;
    const it = itemByUid(save, uid);
    const chips = (b.chips || []).map(u => chipByUid(save, u)?.id);
    if (it && i < 2 && P[it.id]?.hand === 'two' && !chipRule(chips, C, 'twoHandInOne')) b.weapons[1 - i] = null;
    if (it && i < 2) { const o = itemByUid(save, b.weapons[1 - i]); if (o && P[o.id]?.hand === 'two' && !chipRule(chips, C, 'twoHandInOne')) b.weapons[1 - i] = null; }
  } else b.parts[place] = uid;
  return b;
}

export const chipIdsOf = (save, b) => (b.chips || []).map(u => chipByUid(save, u)?.id).filter(Boolean);
export { chipId };
