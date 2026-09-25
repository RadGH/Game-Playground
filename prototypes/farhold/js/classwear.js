// Farhold 2026-09-25 — a class's starting armour LOOKS like that class.
//
//   "Let's give the fighter all distinct apparel from the warrior… give the paladin their own plate
//    helm instead of a hood… the cleric's starting hood is purple and does not match the rest of its
//    outfit… the green needs to go."
//
// Every one of those was the same fault. The character screen (js/titlelook.js) and the first
// morning (begin() in js/main.js) equip the class's `startingArmour`, and `rpg.gearLook()` then
// paints each piece by its armour TIER: every heavy helm became the horned helm, every cloth or
// medium helm a hood in the hood's default purple, every medium chest a tunic in the tunic's default
// green. The thirty hand-made class looks were drawn underneath and then covered over.
//
// So a starting piece now carries the part it should be drawn as (`item.look.worn`), copied from the
// class's own look — which is Emberveil's class-looks.json dressed in the shared class outfits
// (avatar-3d/data/class-outfits.json). A piece found or bought later has no `worn` and is drawn by
// tier exactly as before. The part rides on the item, so it survives the save.

import { dressAs } from '../../../avatar-3d/js/class-outfits.js';

/** Which avatar slot an armour slot is drawn in. */
export const ARMOUR_TARGET = { head: 'hat', chest: 'top', legs: 'bottom', feet: 'shoes' };
const clone = v => JSON.parse(JSON.stringify(v));

/**
 * Dress every class look in its outfit, in place. Hands are left alone: Farhold draws the hands
 * from what is really equipped.
 */
export function dressClassLooks(classLooks, outfits) {
  for (const [id, row] of Object.entries(classLooks?.classes || {})) {
    if (outfits?.[id] && row?.avatar) row.avatar = dressAs(row.avatar, outfits[id], { hands: false });
  }
  return classLooks;
}

/**
 * Stamp a starting armour piece with the part the class look has in that slot. A slot the class
 * look leaves empty ('none') is stamped empty too — the class was designed without it showing.
 * Returns the item, for chaining.
 */
export function wearClassLook(item, classAvatar) {
  const target = ARMOUR_TARGET[item?.slot];
  const part = target && classAvatar?.[target];
  if (!part?.id) return item;
  item.look = { ...(item.look || {}), worn: clone(part) };
  return item;
}
