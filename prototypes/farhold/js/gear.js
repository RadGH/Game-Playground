// Farhold — the gear that is not loot: mounts, light sources, quivers, boats and ships.
//
// Four asks from the play-test, and they turn out to be one module:
//
//   "Add 3 different mounts and 3 different light sources, and add them available to all shops for
//    now… Add affixes specifically for the light source and mount slots, that do not apply to other
//    slots, and allow them to roll at different rarities (even in shops) as well as support
//    upgrades."
//
//   "To crafting menus, add Quivers. Change quivers to add damage instead of armor. Add special
//    quivers that add an elemental effect, cause auto attacks to shoot multiple projectiles,
//    homing projectiles, exploding projectiles, etc."
//
//   "Add a boat and rocket slot to the inventory, starting with a basic boat and rocket (actually
//    space ships) for now… Boats should auto equip when you swim or enter water. These type of items
//    should be exempt from the rarity / crafting system and get unlocked permanently when purchased.
//    In the inventory, instead of equipping them from a list you change them using a dropdown. This
//    treats them more as unlockables than items, and keeps them out of the loot pool."
//
// **The dividing line is whether a thing is loot.** A mount, a lantern and a quiver are: they roll a
// rarity, they carry affixes, they can be upgraded at the bench, and a better one is a find. A boat
// and a ship are not: you buy one once, you own it for the rest of the run, and you pick which is
// active from a dropdown. Mixing the two is what makes an inventory tedious, so they are kept apart
// here and everywhere downstream.
//
// **What changed when the industry arrived.** Every light and every boat carries a `craft` block now
// (material ids from data/resources.json, benches from data/refining.json), two lights and one boat
// were added above the top of the shop's ladder that can ONLY be built, and the ship slot stopped
// being something a merchant sells at all — see the note over `VEHICLES.ship` and js/shipyard.js.
// Ground vehicles (motorcycle, car, truck) live in js/vehicles.js and keep their ownership inside
// this same `player.vehicles` block, because that is the block js/save.js already writes.
//
//   import { GEAR_BASES, VEHICLES, createGearShop, categoryOf } from './gear.js';
//   const shop = createGearShop({ rpg });
//   shop.stockFor(npc, level, rng);        // what every merchant carries whatever else it sells
//   vehicleFor(player, 'boat');            // the one currently selected

// ---------------------------------------------------------------------------- mounts and lights

/**
 * WHAT EACH MOUNT IS, as a creature spec the 3D builder can actually make.
 *
 *   "The Moor Pony looked identical to the starting Trail Horse. Each mount base needs a visibly
 *    different model."
 *
 * They were. `js/main.js` builds ONE horse at boot — `makeActor({ creature: { type: 'horse',
 * size: 1.25, colors: {…} } })` — and pressing H shows or hides it, so whatever you bought, you rode
 * that horse. Each base points at its own **creature type** now (`avatar-3d/js/creature-types.js`
 * gained `pony`, `courser` and `elk`, because the proportions are in the type and a tint is not a
 * different model), and this is the table the boot code should build from.
 *
 * Wiring it needs one line in js/main.js — see the report; everything on this side is here.
 */
export const MOUNT_LOOKS = {
  trail_horse: {
    creature: { type: 'horse', size: 1.25, colors: { body: '#6a4a32', belly: '#8a6a4a', accent: '#2e2018', eyes: '#301c10' } },
  },
  pony: {
    creature: { type: 'pony', size: 1.0, colors: { body: '#8a6a44', belly: '#b09068', accent: '#3a2a18' } },
  },
  courser: {
    creature: { type: 'courser', size: 1.3, colors: { body: '#4a3a30', belly: '#6a5648', accent: '#181008' } },
  },
  dray: {
    creature: { type: 'elk', size: 1.45, colors: { body: '#6a5a48', belly: '#b8a684', accent: '#3a2c1c' }, features: { antlers: true } },
  },
};

/** The look keys the bases below point at, kept beside the table they name. */
const MOUNT_LOOK_KEYS = {
  pony: MOUNT_LOOKS.pony, courser: MOUNT_LOOKS.courser, dray: MOUNT_LOOKS.dray,
};

/**
 * The creature spec for whatever is in the mount slot, or the trail horse.
 *
 * One call, so nothing downstream has to know whether a mount carries its own look, came out of a
 * save written before this table existed, or is the starter the character was handed.
 */
export function mountLook(item) {
  if (!item) return MOUNT_LOOKS.trail_horse;
  if (MOUNT_LOOKS[item.baseKey]) return MOUNT_LOOKS[item.baseKey];
  if (item.look?.creature) return item.look;
  // an old save's starter carries `mount: { creature: 'horse', size, … }` — the same thing said
  // the way it was said before this table existed
  if (item.mount?.creature) return { creature: { type: item.mount.creature, size: item.mount.size ?? 1.25 } };
  return MOUNT_LOOKS.trail_horse;
}

/**
 * The three mounts and the three light sources, as item bases.
 *
 * Each is a real base with its own numbers, so the whole loot machine already knows what to do with
 * them: `rpg.loot.generate` rolls affixes on them, the bench upgrades them, a shop prices them, and
 * the item card describes them. They are not a special case anywhere except in which affixes they
 * are allowed (see `SLOT_AFFIXES` below).
 */
export const GEAR_BASES = {
  // ---- mounts. `speed` multiplies move speed while riding; `stamina` is how long it can gallop.
  //
  // "The Moor Pony looked identical to the starting Trail Horse. Each mount base needs a visibly
  // different model." `look` used to be `{ body, color, scale }` and nothing read it at all —
  // js/main.js builds ONE horse at boot and shows or hides it (see MOUNT_LOOKS below, which is the
  // real creature spec each base should be built from).
  pony: {
    key: 'pony', name: 'Moor Pony', slot: 'mount', type: 'accessory', subtype: 'mount',
    speed: 1.9, jump: 1.4, stamina: 26, price: 140, look: MOUNT_LOOK_KEYS.pony,
    lore: 'Short, broad and entirely unbothered. It will not win a race and it will not throw you.',
  },
  courser: {
    key: 'courser', name: 'Courser', slot: 'mount', type: 'accessory', subtype: 'mount',
    speed: 2.5, jump: 1.6, stamina: 18, price: 420, look: MOUNT_LOOK_KEYS.courser,
    lore: 'Bred for the long straight roads between holds. Nervous on a hill, unmatched on a plain.',
  },
  dray: {
    key: 'dray', name: 'Dray Elk', slot: 'mount', type: 'accessory', subtype: 'mount',
    speed: 2.1, jump: 2.1, stamina: 40, price: 760, look: MOUNT_LOOK_KEYS.dray,
    lore: 'Taller at the shoulder than most doorways. It goes over broken ground as though it were a road.',
  },

  /**
   * ---- light sources. `range` is metres lit.
   *
   *   "Upgraded lamps must be SIGNIFICANTLY better — the light radius is dreadfully low right now."
   *
   * 34 / 52 / 74 was a 1.5x ladder on a knob that barely moved what you could see (see the note on
   * `intensityFor` in js/light.js: the brightness came from the DECAY, not from the range, so all
   * three lit about the same circle). It is 40 / 90 / 160 now — a lantern lights more than twice
   * the ground a torch does and a wisp lamp four times — and with the falloff fixed, the brightness
   * inside that circle goes up with it. The prices move with the reach, so the ladder still costs
   * something.
   */
  /**
   * ---- and then "more craftable equipment: lanterns…".
   *
   * The ladder did not need a second, parallel list of crafted lamps beside the bought ones — that
   * is how a game ends up with two torches. Instead **every rung became craftable** (a `craft`
   * block: what it costs and which bench it wants, ids from data/resources.json), and two rungs were
   * added ABOVE the shop's best one that can only be built. So the shelf is unchanged, the ladder
   * is longer, and the reason to own a workshop is that the shelf runs out.
   */
  torch: {
    key: 'torch', name: 'Pitch Torch', slot: 'light', type: 'accessory', subtype: 'torch',
    range: 40, intensity: 2.6, color: '#ffb066', burn: 0, price: 20, look: { offhand: 'torch', color: '#c08040' },
    craft: { station: 'hand', cost: { log: 1, fibre: 2, resin: 1 }, hours: 0.1 },
    lore: 'Rag, pitch and a stick. It will not win a fight, but you can see the fight coming.',
  },
  lantern: {
    key: 'lantern', name: 'Shuttered Lantern', slot: 'light', type: 'accessory', subtype: 'lantern',
    range: 90, intensity: 3.0, color: '#ffd9a0', burn: 0, price: 260, look: { offhand: 'lantern', color: '#c8b070' },
    craft: { station: 'hand', cost: { glass: 2, copper_ingot: 2, leather: 1, resin: 2 }, hours: 1 },
    lore: 'Glass, brass and a wick you can pinch down to nothing when something is listening.',
  },
  wisplamp: {
    key: 'wisplamp', name: 'Wisp Lamp', slot: 'light', type: 'accessory', subtype: 'lamp',
    range: 160, intensity: 3.4, color: '#a8d8ff', burn: 0, price: 820, look: { offhand: 'lamp', color: '#7fd4ff' },
    craft: { station: 'crystal_cutter', cost: { glass: 3, lens: 1, copper_ingot: 3, silver_ingot: 1 }, hours: 3 },
    lore: 'Something small and unhappy is in the jar. It gives a cold light and it does not go out.',
  },
  mirror_lamp: {
    key: 'mirror_lamp', name: 'Mirror Lamp', slot: 'light', type: 'accessory', subtype: 'lantern',
    range: 210, intensity: 3.6, color: '#ffe6b8', burn: 0, price: 0, buildOnly: true,
    look: { offhand: 'lantern', color: '#d8c884' },
    craft: { station: 'crystal_cutter', cost: { glass: 4, lens: 2, copper_ingot: 4, machine_part: 1, resin: 1 }, hours: 4 },
    lore: 'A polished dish behind the flame. All of the light goes forward, which is where you were going anyway.',
  },
  arc_lamp: {
    key: 'arc_lamp', name: 'Arc Lamp', slot: 'light', type: 'accessory', subtype: 'lamp',
    range: 300, intensity: 4.0, color: '#dcefff', burn: 0, price: 0, buildOnly: true,
    look: { offhand: 'lamp', color: '#cfe6ff' },
    craft: { station: 'assembler', cost: { aether_cell: 1, control_board: 1, lens: 2, glass: 3, machine_part: 1 }, hours: 6 },
    lore: 'A cell, two electrodes and a gap. It does not flicker, it does not care about wind, and it makes everything look dead.',
  },

  // ---- quivers. THEY ADD DAMAGE, NOT ARMOUR — the whole point of the change.
  quiver: {
    key: 'quiver', name: 'Hide Quiver', slot: 'offhand', type: 'accessory', subtype: 'quiver',
    quiver: true, arrowDamage: 3, price: 60, look: { offhand: 'quiver', color: '#6a5238' },
    lore: 'Twenty arrows and room for twenty more.',
  },
  quiver_ember: {
    key: 'quiver_ember', name: 'Ember Quiver', slot: 'offhand', type: 'accessory', subtype: 'quiver',
    quiver: true, arrowDamage: 4, element: 'fire', price: 320, look: { offhand: 'quiver', color: '#c8603a' },
    lore: 'The heads are packed in slow-burning resin. They light on the draw.',
  },
  quiver_rime: {
    key: 'quiver_rime', name: 'Rime Quiver', slot: 'offhand', type: 'accessory', subtype: 'quiver',
    quiver: true, arrowDamage: 4, element: 'ice', price: 320, look: { offhand: 'quiver', color: '#7fb8d8' },
    lore: 'Cold to hold. What it hits slows down.',
  },
  quiver_split: {
    key: 'quiver_split', name: 'Splitshaft Quiver', slot: 'offhand', type: 'accessory', subtype: 'quiver',
    quiver: true, arrowDamage: 2, projectiles: 2, spread: 0.13, price: 540,
    look: { offhand: 'quiver', color: '#8a7a5a' },
    lore: 'Paired shafts, fletched to fly apart. Every shot is two.',
  },
  quiver_seeker: {
    key: 'quiver_seeker', name: 'Seeker Quiver', slot: 'offhand', type: 'accessory', subtype: 'quiver',
    quiver: true, arrowDamage: 3, homing: 1, price: 680, look: { offhand: 'quiver', color: '#9a7ac8' },
    lore: 'The heads turn, very slightly, toward warmth. It is not pleasant to think about.',
  },
  quiver_burst: {
    key: 'quiver_burst', name: 'Burstshot Quiver', slot: 'offhand', type: 'accessory', subtype: 'quiver',
    quiver: true, arrowDamage: 3, burst: 2.2, price: 720, look: { offhand: 'quiver', color: '#c8a24a' },
    lore: 'Each head carries a thimble of something that does not like being stopped suddenly.',
  },
};

/** The bases a shop of each kind may carry, beyond its own weapons and armour. */
export const SHOP_GEAR = {
  mounts: ['pony', 'courser', 'dray'],
  lights: ['torch', 'lantern', 'wisplamp'],
  quivers: ['quiver', 'quiver_ember', 'quiver_rime', 'quiver_split', 'quiver_seeker', 'quiver_burst'],
};

/**
 * Affixes that ONLY appear on a mount or a light, and never anywhere else.
 *
 * "Add affixes specifically for the light source and mount slots, that do not apply to other slots."
 * These are the properties that only make sense on the thing they are attached to — a light that
 * frightens what it shines on, a horse that does not spook. They roll and upgrade like any other
 * affix; `js/affixes.js` carries their units, floors and caps.
 */
export const SLOT_AFFIXES = {
  light: [
    { id: 'wide_beam', name: 'Broad', stat: 'cond_lightRange', min: 8, max: 20 },
    { id: 'steady_flame', name: 'Steady', stat: 'cond_lightSteady', min: 0.1, max: 0.25 },
    { id: 'warding_light', name: 'Warding', stat: 'cond_lightWard', min: 0.1, max: 0.25 },
    { id: 'seeking_light', name: "Finder's", stat: 'cond_lightReveal', min: 12, max: 30 },
  ],
  mount: [
    { id: 'surefoot', name: 'Surefooted', stat: 'cond_mountSlope', min: 0.15, max: 0.35 },
    { id: 'longwind', name: 'Long-winded', stat: 'cond_mountStamina', min: 6, max: 18 },
    { id: 'trample', name: 'Trampling', stat: 'cond_mountTrample', min: 4, max: 14 },
    { id: 'calm', name: 'Calm', stat: 'cond_mountCalm', min: 0.15, max: 0.4 },
  ],
};

/** Every slot-only affix, flat, for the loot pool to append. */
export const SLOT_AFFIX_LIST = Object.entries(SLOT_AFFIXES)
  .flatMap(([slot, list]) => list.map(a => ({ ...a, onlySlots: [slot], extended: true })));

// ---------------------------------------------------------------------------- boats and ships

/**
 * Vehicles are **unlockables, not loot**.
 *
 * No rarity, no affixes, no bench, never in a drop table. You buy one, you own it for the run, and
 * the inventory picks between what you own from a dropdown. That is the whole difference, and it is
 * the reason a rocket does not clutter a loot roll or a recycling bin.
 */
/**
 * HORSE PACE, in metres a second.
 *
 * `data/balance.json` player.moveSpeed (5.4) x player.mountSpeed (2.1). Repeated here because this
 * module is a plain data table with nothing loaded into it, and tests/boats.test.js fails if the
 * two ever drift apart. It is the yardstick the raft is measured against — see below.
 */
export const HORSE_PACE = 5.4 * 2.1;

export const VEHICLES = {
  boat: {
    slot: 'boat',
    starter: 'raft',
    kinds: {
      /**
       * "Make it so boats, at least the starting raft, goes faster - approx the same speed as a
       * horse."
       *
       * The raft was 3.4 m/s — a hair above the 2.7 m/s swim it replaced, and under two thirds of a
       * plain walk. Crossing anything wider than a river meant several real minutes of holding W
       * while the shore crept past, so a lake stayed a wall you went round rather than a road.
       * The raft is horse pace now (11.34 m/s), and the ladder above it keeps its shape: the skiff
       * is about a quarter faster again and the cutter about half as fast again, both still short
       * of a gallop, so buying one is an upgrade and riding is still the fastest way to travel.
       */
      raft: { key: 'raft', name: 'Lashed Raft', speed: 11.3, price: 0, look: { hull: '#6a5238' },
        craft: { station: 'hand', cost: { log: 6, rope: 3 }, hours: 1 },
        lore: 'Six logs and a great deal of rope. It floats, which is the entire specification.' },
      skiff: { key: 'skiff', name: 'Fenland Skiff', speed: 14.2, price: 340, look: { hull: '#7a6a4a' },
        craft: { station: 'sawmill', cost: { plank: 10, rope: 4, resin: 3 }, hours: 4 },
        lore: 'Flat-bottomed and quick in the shallows. Built for reed channels, not open water.' },
      cutter: { key: 'cutter', name: 'Coast Cutter', speed: 17.4, price: 1400, look: { hull: '#4a5a6a' },
        craft: { station: 'sawmill', cost: { plank: 22, beam: 4, rope: 8, cloth: 12, iron_ingot: 4 }, hours: 10 },
        lore: 'A keel, a sail and somewhere dry to sit. It will cross a sea if you are patient.' },
      /**
       * The rung the shop does not have.
       *
       * "More craftable equipment: … boats" wanted something past the end of the bought ladder, and
       * a powered launch is the obvious one: the only boat with an engine, so the only boat that
       * burns charcoal — the same gas producer the motorcycle runs on (js/vehicles.js). It is faster than
       * the cutter and it is the only one that can run out. Still under a gallop, because riding
       * stays the fastest way to travel; see the yardstick in tests/vehicles.test.js.
       */
      launch: { key: 'launch', name: 'Pitch Launch', speed: 20.5, price: null, buildOnly: true,
        fuel: 'charcoal', perKm: 0.5, tank: 16, look: { hull: '#5a5248' },
        craft: { station: 'assembler', cost: { plank: 18, steel_ingot: 6, machine_part: 3, resin: 4, control_board: 1 }, hours: 12 },
        lore: 'A cutter with an engine where the mast used to be. Loud, quick, and it stops when the hopper is empty.' },
    },
  },
  /**
   * SHIPS ARE BUILT, NOT BOUGHT — BUILDING_EXPANSION.md §9.1 and §9.2.
   *
   * "You do not start with a ship and you cannot buy one." So the starter is gone, every price is
   * null (which is what keeps them off `vehiclesFor()`'s shelf — it only lists a positive price),
   * and the three hulls became the three TIERS of js/shipyard.js: a lander is the four subsystems
   * at tier 1, a runner at tier 2, a hauler at tier 3. Anyone already mid-run keeps the ship they
   * have — that migration is `shipyard.migrateSave`, and it is not optional.
   */
  ship: {
    slot: 'ship',
    starter: null,
    built: true,
    kinds: {
      lander: { key: 'lander', name: 'Surveyor Lander', thrust: 1, warp: 1, price: null, tier: 1, look: { hull: 'explorer' },
        lore: 'Four subsystems, a pad and a week of work. It gets down, and usually back up.' },
      runner: { key: 'runner', name: 'Verge Runner', thrust: 1.35, warp: 1.2, price: null, tier: 2, look: { hull: 'courier' },
        lore: 'Stripped to the frame and over-engined. Everything that is not thrust has been removed.' },
      hauler: { key: 'hauler', name: 'Deepfield Hauler', thrust: 0.9, warp: 1.6, price: null, tier: 3, look: { hull: 'hauler' },
        lore: 'Slow off a world and tireless between them. The drive is most of the ship.' },
    },
  },
};

/**
 * The stamp that tells an old save from a new character.
 *
 * It has to be written by `startingVehicles()`, and `startingVehicles()` cannot import
 * js/shipyard.js because shipyard.js imports this file — so the number is repeated here rather
 * than shared, exactly the way HORSE_PACE above repeats a figure out of balance.json.
 * tests/shipyard.test.js fails if this and data/shipyard.json's `gate.version` ever disagree.
 */
export const SHIP_GATE_VERSION = 1;

/** Which vehicle slots exist, in the order the sheet shows them. */
export const VEHICLE_SLOTS = Object.keys(VEHICLES);

/**
 * What a new character owns before they have built or bought anything: a raft, and that is all.
 *
 * The ship slot is deliberately EMPTY — that is the whole of §9.1 in one line. The `shipyard` stamp
 * is what tells `shipyard.migrateSave()` that this character was made after the gate existed and
 * must therefore earn a ship, rather than being an old save that should keep the one it has.
 */
export function startingVehicles() {
  const owned = {};
  const active = {};
  for (const [slot, spec] of Object.entries(VEHICLES)) {
    owned[slot] = spec.starter ? [spec.starter] : [];
    active[slot] = spec.starter || null;
  }
  owned.ground = [];                           // motorcycles, cars and trucks — see js/vehicles.js
  active.ground = null;
  return { owned, active, rigs: {}, shipyard: { gate: SHIP_GATE_VERSION } };
}

/**
 * The spec of whichever one is selected, or the slot's starter.
 *
 * The ship slot has no starter any more, so this returns **null** when you have not built one —
 * and that is the honest answer. Everything that flies should be asking `shipyard.canLaunch()`
 * anyway, which says why in plain words instead of handing back a ship that does not exist.
 */
export function vehicleFor(player, slot) {
  const spec = VEHICLES[slot];
  if (!spec) return null;
  const key = player?.vehicles?.active?.[slot] || spec.starter;
  return spec.kinds[key] || (spec.starter ? spec.kinds[spec.starter] : null);
}

/**
 * Take one into your ownership. Boats are bought; ships are handed over by the yard.
 *
 * `granted` is the yard's door: js/shipyard.js calls this with it after the four subsystems are
 * assembled on the pad. Without it, a ship is refused with the reason — because "you cannot buy
 * one" is a rule the player should be told once, not a button that quietly does nothing.
 */
export function unlockVehicle(player, slot, key, { granted = false } = {}) {
  const spec = VEHICLES[slot];
  const kind = spec?.kinds?.[key];
  if (!kind) return { ok: false, why: 'No such vehicle.' };
  player.vehicles = player.vehicles || startingVehicles();
  const owned = player.vehicles.owned[slot] || (player.vehicles.owned[slot] = []);
  if (owned.includes(key)) return { ok: false, why: `You already own the ${kind.name}.` };
  if (!granted) {
    if (spec.built) return { ok: false, why: `A ${kind.name} is built, not bought. Hull, drive, tanks, avionics — then a pad.` };
    if (kind.buildOnly || kind.price == null) return { ok: false, why: `Nobody sells the ${kind.name}. It has to be built.` };
    if ((player.gold || 0) < kind.price) {
      return { ok: false, why: `The ${kind.name} is ${kind.price} gold and you have ${player.gold || 0}.` };
    }
    player.gold -= kind.price;
  }
  owned.push(key);
  player.vehicles.active[slot] = key;          // a thing you just bought is the thing you want
  return { ok: true, kind };
}

/**
 * Build one at a bench instead of buying it — the craftable half of the boat ladder.
 *
 * Every boat carries a `craft` block now, so the raft you were given is also the raft you could
 * have made, and the Pitch Launch at the top can ONLY be made. Same bag as everything else (the
 * `Materials` class in js/craft.js, or a plain `{ plank: 10 }` object).
 */
export function craftVehicle(player, slot, key, bag, { stations = [] } = {}) {
  const spec = VEHICLES[slot];
  const kind = spec?.kinds?.[key];
  if (!kind) return { ok: false, why: 'No such vehicle.' };
  if (!kind.craft) return { ok: false, why: `A ${kind.name} is not something you can put together yourself.` };
  if (stations.length && kind.craft.station !== 'hand' && !stations.includes(kind.craft.station)) {
    return { ok: false, why: `You need a ${kind.craft.station.replace(/_/g, ' ')} for that.` };
  }
  const purse = bagOf(bag);
  if (!purse.canAfford(kind.craft.cost)) {
    const short = Object.entries(purse.missing(kind.craft.cost)).map(([id, n]) => `${n} ${id.replace(/_/g, ' ')}`).join(', ');
    return { ok: false, why: `Short ${short}.` };
  }
  purse.spend(kind.craft.cost);
  return unlockVehicle(player, slot, key, { granted: true });
}

/**
 * The one place a light's, a boat's or a ship's recipe is read from, so a recipe book does not have
 * to know which of the three tables a thing came out of.
 */
export function gearRecipes() {
  const out = [];
  for (const base of Object.values(GEAR_BASES)) {
    if (base.craft) out.push({ kind: 'gear', slot: base.slot, key: base.key, name: base.name, ...base.craft, buildOnly: !!base.buildOnly });
  }
  for (const [slot, spec] of Object.entries(VEHICLES)) {
    for (const kind of Object.values(spec.kinds)) {
      if (kind.craft) out.push({ kind: 'vehicle', slot, key: kind.key, name: kind.name, ...kind.craft, buildOnly: !!kind.buildOnly });
    }
  }
  return out;
}

/** The same duck-typed bag js/vehicles.js uses, kept here so gear.js imports nothing from it. */
function bagOf(bag) {
  if (bag && typeof bag.canAfford === 'function') return bag;
  const held = bag || {};
  return {
    count: id => held[id] || 0,
    canAfford: cost => Object.entries(cost || {}).every(([id, n]) => (held[id] || 0) >= n),
    missing: cost => {
      const out = {};
      for (const [id, n] of Object.entries(cost || {})) { const short = n - (held[id] || 0); if (short > 0) out[id] = short; }
      return out;
    },
    spend: cost => { for (const [id, n] of Object.entries(cost || {})) held[id] = (held[id] || 0) - n; return true; },
  };
}

/** Switch which one is active. The dropdown calls this. */
export function selectVehicle(player, slot, key) {
  player.vehicles = player.vehicles || startingVehicles();
  if (!(player.vehicles.owned[slot] || []).includes(key)) return false;
  player.vehicles.active[slot] = key;
  return true;
}

// ---------------------------------------------------------------------------- the shop side

/** Which shop tab an item belongs under. */
export function categoryOf(item) {
  if (!item) return 'other';
  if (item.shopCategory) return item.shopCategory;
  if (item.type === 'weapon') return 'weapon';
  if (item.slot === 'ring' || item.slot === 'ring2' || item.slot === 'necklace') return 'other';
  if (item.slot === 'mount' || item.slot === 'light') return 'other';
  if (item.subtype === 'quiver') return 'other';
  if (item.type === 'armor' || ['head', 'chest', 'legs', 'hands', 'feet', 'offhand'].includes(item.slot)) return 'armor';
  return 'other';
}

/**
 * The mounts, lights and quivers every merchant carries.
 *
 * They roll a rarity like anything else — "allow them to roll at different rarities (even in
 * shops)" — so the lantern on the shelf may be a plain one or may be carrying two properties and
 * cost accordingly. A shop always stocks the cheapest of each kind, so a new character can always
 * buy a torch.
 */
export function createGearShop({ rpg } = {}) {
  /** Build one item from a `GEAR_BASES` entry at a rarity. */
  function make(key, rarity, level, rng) {
    const base = GEAR_BASES[key];
    if (!base) return null;
    const item = {
      id: `g_${key}_${Math.floor(rng() * 1e9).toString(36)}`,
      baseKey: key, name: base.name, baseName: base.name,
      type: base.type, subtype: base.subtype, slot: base.slot,
      rarity, quality: 'medium', affixes: [],
      look: base.look, lore: base.lore,
      basePrice: base.price,
      shopCategory: 'other',
    };
    // the base's own numbers, carried as intrinsic affixes so every reader already understands them
    const intrinsics = [];
    if (base.range) { item.range = base.range; item.light = true; intrinsics.push(['cond_lightBase', base.range]); }
    if (base.intensity) item.intensity = base.intensity;
    if (base.color) item.color = base.color;
    if (base.speed) { item.speed = base.speed; intrinsics.push(['cond_mountBase', base.speed]); }
    if (base.jump) item.jump = base.jump;
    if (base.stamina) { item.stamina = base.stamina; intrinsics.push(['cond_mountWind', base.stamina]); }
    if (base.quiver) {
      item.quiver = true;
      item.arrowDamage = base.arrowDamage || 0;
      if (base.arrowDamage) intrinsics.push(['cond_quiverDamage', base.arrowDamage]);
      if (base.element) { item.element = base.element; intrinsics.push(['cond_quiverElement', 1]); }
      if (base.projectiles) { item.projectiles = base.projectiles; item.spread = base.spread || 0.12; intrinsics.push(['cond_quiverSplit', base.projectiles]); }
      if (base.homing) { item.homing = base.homing; intrinsics.push(['cond_quiverHoming', base.homing]); }
      if (base.burst) { item.burst = base.burst; intrinsics.push(['cond_quiverBurst', base.burst]); }
    }
    for (const [stat, value] of intrinsics) {
      item.affixes.push({ id: 'base_' + stat, stat, value, name: base.name, baseIntrinsic: true, intrinsic: true });
    }
    // and then the rolled ones, from this slot's own pool
    if (rarity !== 'normal' && rpg) {
      const pool = SLOT_AFFIXES[base.slot] || [];
      const want = rarity === 'legendary' ? 3 : rarity === 'rare' ? 2 : 1;
      const taken = new Set();
      for (let i = 0; i < want && pool.length; i++) {
        const def = pool[Math.floor(rng() * pool.length)];
        if (taken.has(def.id)) continue;
        taken.add(def.id);
        const ilvl = Math.max(1, level);
        item.affixes.push({ ...def, value: rpg.rollSlotAffix ? rpg.rollSlotAffix(def, ilvl, rng) : def.min, ilvl });
      }
      if (taken.size) item.name = `${[...pool].find(p => taken.has(p.id))?.name || ''} ${base.name}`.trim();
    }
    item.ilvl = Math.max(1, level);
    item.levelReq = 1;                            // you can always buy a light; that is the point
    return item;
  }

  return {
    make,
    /** What this merchant has on the shelf today, beyond its own trade. */
    stockFor(npc, level = 1, rng = Math.random) {
      const out = [];
      /**
       * ALL THREE, EVERY TIME — for mounts and lights.
       *
       * This used to stock the cheapest of each kind and then ONE randomly chosen better one, which
       * meant a shop showed a Pitch Torch and, say, a Courser, and the Dray Elk and the Wisp Lamp
       * might not turn up for an hour of walking between towns. "Where shops sell boats and ship,
       * they should also sell torches and mounts. 3 of each" — so the mount rack and the light shelf
       * are now a fixed, complete set, exactly like the boats and ships in the fold below them. What
       * still rolls is the RARITY of the two dearer ones, so there is a reason to look twice at a
       * shelf you have already seen.
       *
       * Quivers stay a rolling selection: there are six of them and they are loot, not a rack.
       */
      for (const list of [SHOP_GEAR.mounts, SHOP_GEAR.lights]) {
        list.forEach((key, i) => {
          // the cheapest is always plain, so the price a new character sees is the price on the base
          const rarity = i === 0 ? 'normal' : rng() < 0.18 ? 'rare' : rng() < 0.55 ? 'magic' : 'normal';
          out.push(make(key, rarity, level, rng));
        });
      }
      out.push(make('quiver', 'normal', level, rng));
      const better = SHOP_GEAR.quivers.slice(1);
      const key = better[Math.floor(rng() * better.length)] || SHOP_GEAR.quivers[0];
      out.push(make(key, rng() < 0.18 ? 'rare' : rng() < 0.55 ? 'magic' : 'normal', level, rng));
      return out.filter(Boolean);
    },
    /** The vehicles this merchant will sell, as plain rows — they are not items. */
    vehiclesFor() {
      const rows = [];
      for (const [slot, spec] of Object.entries(VEHICLES)) {
        for (const kind of Object.values(spec.kinds)) {
          if (kind.price > 0) rows.push({ slot, ...kind });
        }
      }
      return rows;
    },
  };
}
