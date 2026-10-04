// Thousandvale — a playable character: Farhold's player sheet (`rpg.createPlayer`) dressed in its
// class kit exactly as Farhold's `begin()` dresses a new run (main.js line ~843), plus the fields a
// room needs (id, position, facing) and Farhold's skill bar (skills.js `createSkillBar`).
//
// The bar draws its dice from `rpg.rng`. A character moves between rooms, so the bar is handed a
// small proxy whose `rng` is whatever room the character is standing in (`ch.roomRng`), never the
// engine's shared generator — a fight replays from its room's seed alone.

import { attuneWeapon, createSkillBar } from './farhold.js';

/**
 * `engine` from js/rules/engine.js. `rng` rolls the starter kit (a seeded stream; the server passes
 * the character's own). Returns the unit — the same object is the room entity.
 */
export function createCharacter(engine, { id, classId = 'warrior', level = 1, name = 'Wayfarer', rng = null, x = 0, z = 0, y = 0, yaw = 0, kit = true, gear = null } = {}) {
  const rpg = engine.rpg;
  const classDef = engine.classById(classId) || engine.classes[0];
  const roll = rng || rpg.rng;
  const ch = rpg.createPlayer({ name, classId: classDef.id, level });

  if (gear) restoreGear(engine, ch, gear);
  else if (kit) {
    const starter = attuneWeapon(rpg.loot.generate(classDef.starter || 'sword', 'normal', 'low', { rng: roll }));
    if (starter) rpg.equip(ch, starter, { force: true });
    const offStarter = classDef.offStarter ? attuneWeapon(rpg.loot.generate(classDef.offStarter, 'normal', 'low', { rng: roll })) : null;
    if (offStarter) rpg.equip(ch, offStarter, { into: 'offhand', force: true });
    for (const key of classDef.startingArmour || []) {
      const piece = attuneWeapon(rpg.loot.generate(key, 'normal', 'low', { rng: roll }));
      if (piece) rpg.equip(ch, piece, { force: true });
    }
    // Farhold also hands over a torch, a mount and a gathering tool here. None of them change a
    // combat number at level 1 and their modules pull in Three.js (light.js), so they are left to
    // the inventory stream; tests/C/character.test.mjs pins that the sheet's damage is unaffected.
  }
  rpg.refresh(ch, { full: true });

  ch.id = id ?? ch.name;
  ch.x = x; ch.y = y; ch.z = z; ch.yaw = yaw;
  ch.dead = false;
  ch.roomRng = null;
  ch.swing = { mainStep: 0, offStep: 0, mainReady: 0, offReady: 0 };
  const rpgView = {
    get rng() { return ch.roomRng || rpg.rng; },
    get fx() { return rpg.fx; },
  };
  ch.skills = createSkillBar({ data: engine.skillData, player: ch, rpg: rpgView });
  return ch;
}

/** A character's current skill ids, slot by slot (empty slots are null). */
export const skillIds = ch => ch.skills.slots.map(s => (s.empty ? null : s.id));

/**
 * The character's gear as plain JSON for the save (Farhold items are plain objects already):
 * `{ v: 1, equipment: { slot: item }, bag: [item] }`. Items keep their `uid` when they have one.
 */
export function serializeGear(ch) {
  const equipment = {};
  for (const [slot, item] of Object.entries(ch.equipment || {})) if (item) equipment[slot] = JSON.parse(JSON.stringify(item));
  return { v: 1, equipment, bag: JSON.parse(JSON.stringify(ch.bag || [])) };
}

/** Put saved gear back on a sheet (forced: a save is trusted, its level rules were checked when it was equipped). */
export function restoreGear(engine, ch, blob) {
  if (!blob || typeof blob !== 'object') return ch;
  for (const slot of Object.keys(ch.equipment || {})) ch.equipment[slot] = null;
  for (const [slot, item] of Object.entries(blob.equipment || {})) {
    if (!item || typeof item !== 'object') continue;
    engine.rpg.equip(ch, JSON.parse(JSON.stringify(item)), { into: slot, force: true });
  }
  ch.bag = Array.isArray(blob.bag) ? JSON.parse(JSON.stringify(blob.bag)) : [];
  engine.rpg.refresh(ch, { full: true });
  return ch;
}
