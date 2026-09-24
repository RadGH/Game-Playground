// Farhold R23 — what the character on the title screen is WEARING.
//
// "Update the character editor to show the 3d model instead of the 2d avatar."
//
// A 3D preview is only worth having if it is the body you actually walk out with. The face comes
// from the avatar (the class's own, or the one built in the appearance editor), but the hands and
// the armour do not: js/main.js dresses the player in `applyGearLook()` from whatever `begin()`
// equipped — the class's starter weapon, its starting armour, the torch every character carries,
// and, for a custom class, the second weapon and the element out of `applyOpeningKit`.
//
// So this file runs the SAME steps on a throwaway character and hands back the finished avatar:
//
//   import { createLookMaker } from './titlelook.js';
//   const looks = createLookMaker({ items, balance, classbuildData });
//   const avatar = looks.startingLook({ classDef, avatar: baseLook });
//   // → baseLook + `held` + `offhand` + the armour parts, exactly what applyGearLook() writes
//
// WHY A PRIVATE `Rpg`, ON A COPY OF THE ITEMS. `new Rpg(items)` restates the shared affix tables
// in place and wraps the loot generator — main.js makes its own a moment after the title closes,
// and the preview must not be the thing that touched the game's data first. `structuredClone`
// costs a few milliseconds, once, the first time the character step is drawn; nothing the preview
// does can then reach the run. The random numbers are the preview's own too, so looking at the
// title screen never shifts what the run rolls.
//
// WHAT IS KNOWINGLY DIFFERENT: the element a PRESET caster's staff is attuned to is picked by
// `attuneWeapon` off a hash of the generated item's id, and the run's item is a different item.
// So a preset stormcaller's staff topper can differ between the title and the world. A custom
// class names its element (`build.element`), and that one always matches.

import { Rpg, heldLookFor, offhandLookFor, attuneWeapon } from './rpg.js';
import { applyOpeningKit } from './classbuild.js';
import { STARTER_TORCH } from './light.js';

const clone = v => JSON.parse(JSON.stringify(v ?? null));

/**
 * @param {object} opts
 * @param {object} opts.items           data/items.json (copied, never touched)
 * @param {object} [opts.balance]       data/balance.json
 * @param {object} [opts.classbuildData] data/classbuild.json, for a custom class's opening kit
 * @param {object} [opts.torch]         the light every character starts with (STARTER_TORCH)
 */
export function createLookMaker({ items, balance = {}, classbuildData = null, torch = STARTER_TORCH } = {}) {
  let rpg = null;
  const cache = new Map();

  function engine() {
    if (!rpg) rpg = new Rpg(structuredClone(items), { ...balance, seed: 1 });
    return rpg;
  }

  /**
   * The avatar main.js would put on this class on the first morning.
   *
   * @param {object} opts
   * @param {object} opts.classDef  a row of data/classes.json (or the installed custom class)
   * @param {object} opts.avatar    the base look — the player's own, or the class's
   * @returns {object} a new avatar with `held`, `offhand`, `decor` and the armour slots filled
   */
  function startingLook({ classDef, avatar }) {
    const base = clone(avatar || {}) || {};
    if (!classDef || !items) return base;
    const gear = gearFor(classDef);
    const next = base;
    next.held = gear.held;
    next.offhand = gear.offhand;
    Object.assign(next, clone(gear.worn));
    return next;
  }

  /**
   * The gear half, cached per class — it does not depend on the face, so changing the face in the
   * appearance editor does not roll a new sword. A custom class is keyed by its build, because the
   * loadout and the element are what decide its hands.
   */
  function gearFor(classDef) {
    const build = classDef.build?.custom ? classDef.build : null;
    const key = build
      ? `custom|${build.loadout}|${build.element}|${classDef.starter}|${(classDef.startingArmour || []).join(',')}`
      : `class|${classDef.id}`;
    if (cache.has(key)) return cache.get(key);

    const r = engine();
    const rng = r.rng;
    const player = r.createPlayer({ name: 'Preview', classId: classDef.id });

    // ---- the same order as `begin()` in js/main.js, for a character with no save
    const starter = attuneWeapon(r.loot.generate(classDef.starter || 'sword', 'normal', 'low', { rng }));
    if (starter) r.equip(player, starter, { force: true });
    for (const k of classDef.startingArmour || []) {
      const piece = attuneWeapon(r.loot.generate(k, 'normal', 'low', { rng }));
      if (piece) r.equip(player, piece, { force: true });
    }
    if (torch) r.equip(player, clone(torch), { force: true });
    if (build && classbuildData) {
      /**
       * The custom class's second weapon and its element. On a COPY of the class and the build:
       * `applyOpeningKit` stamps `build.granted = true`, and doing that to the real build would make
       * the run's own call refuse with "already granted" — the character would start with one hand
       * empty. The crate is switched off because the preview has no use for three rolled items.
       */
      const copy = { ...classDef, build: { ...clone(build), granted: false, opening: { kind: 'none' } } };
      try { applyOpeningKit({ player, rpg: r, classDef: copy, data: classbuildData }); } catch { /* a look is never worth a crash */ }
    }

    // ---- and then `applyGearLook()`
    const gear = {
      held: heldLookFor(player.equipment.weapon),
      offhand: offhandLookFor(player.equipment.offhand),
      worn: r.gearLook(player),
    };
    cache.set(key, gear);
    return gear;
  }

  return { startingLook, gearFor };
}
