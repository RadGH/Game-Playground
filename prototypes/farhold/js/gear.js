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
//   import { GEAR_BASES, VEHICLES, createGearShop, categoryOf } from './gear.js';
//   const shop = createGearShop({ rpg });
//   shop.stockFor(npc, level, rng);        // what every merchant carries whatever else it sells
//   vehicleFor(player, 'boat');            // the one currently selected

// ---------------------------------------------------------------------------- mounts and lights

/**
 * The three mounts and the three light sources, as item bases.
 *
 * Each is a real base with its own numbers, so the whole loot machine already knows what to do with
 * them: `rpg.loot.generate` rolls affixes on them, the bench upgrades them, a shop prices them, and
 * the item card describes them. They are not a special case anywhere except in which affixes they
 * are allowed (see `SLOT_AFFIXES` below).
 */
export const GEAR_BASES = {
  // ---- mounts. `speed` multiplies move speed while riding; `stamina` is how long before it blows.
  pony: {
    key: 'pony', name: 'Moor Pony', slot: 'mount', type: 'accessory', subtype: 'mount',
    speed: 1.9, jump: 1.4, stamina: 26, price: 140, look: { body: 'horse', color: '#8a6a44', scale: 0.92 },
    lore: 'Short, broad and entirely unbothered. It will not win a race and it will not throw you.',
  },
  courser: {
    key: 'courser', name: 'Courser', slot: 'mount', type: 'accessory', subtype: 'mount',
    speed: 2.5, jump: 1.6, stamina: 18, price: 420, look: { body: 'horse', color: '#4a3a30', scale: 1.05 },
    lore: 'Bred for the long straight roads between holds. Nervous on a hill, unmatched on a plain.',
  },
  dray: {
    key: 'dray', name: 'Dray Elk', slot: 'mount', type: 'accessory', subtype: 'mount',
    speed: 2.1, jump: 2.1, stamina: 40, price: 760, look: { body: 'deer', color: '#6a5a48', scale: 1.3, antlers: true },
    lore: 'Taller at the shoulder than most doorways. It goes over broken ground as though it were a road.',
  },

  // ---- light sources. `range` is metres lit; `warmth` tints it.
  torch: {
    key: 'torch', name: 'Pitch Torch', slot: 'light', type: 'accessory', subtype: 'torch',
    range: 34, intensity: 2.2, color: '#ffb066', burn: 0, price: 20, look: { offhand: 'torch', color: '#c08040' },
    lore: 'Rag, pitch and a stick. It will not win a fight, but you can see the fight coming.',
  },
  lantern: {
    key: 'lantern', name: 'Shuttered Lantern', slot: 'light', type: 'accessory', subtype: 'lantern',
    range: 52, intensity: 2.8, color: '#ffd9a0', burn: 0, price: 180, look: { offhand: 'lantern', color: '#c8b070' },
    lore: 'Glass, brass and a wick you can pinch down to nothing when something is listening.',
  },
  wisplamp: {
    key: 'wisplamp', name: 'Wisp Lamp', slot: 'light', type: 'accessory', subtype: 'lamp',
    range: 74, intensity: 3.4, color: '#a8d8ff', burn: 0, price: 620, look: { offhand: 'lamp', color: '#7fd4ff' },
    lore: 'Something small and unhappy is in the jar. It gives a cold light and it does not go out.',
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
export const VEHICLES = {
  boat: {
    slot: 'boat',
    starter: 'raft',
    kinds: {
      raft: { key: 'raft', name: 'Lashed Raft', speed: 3.4, price: 0, look: { hull: '#6a5238' },
        lore: 'Six logs and a great deal of rope. It floats, which is the entire specification.' },
      skiff: { key: 'skiff', name: 'Fenland Skiff', speed: 5.6, price: 340, look: { hull: '#7a6a4a' },
        lore: 'Flat-bottomed and quick in the shallows. Built for reed channels, not open water.' },
      cutter: { key: 'cutter', name: 'Coast Cutter', speed: 8.2, price: 1400, look: { hull: '#4a5a6a' },
        lore: 'A keel, a sail and somewhere dry to sit. It will cross a sea if you are patient.' },
    },
  },
  ship: {
    slot: 'ship',
    starter: 'lander',
    kinds: {
      lander: { key: 'lander', name: 'Surveyor Lander', thrust: 1, warp: 1, price: 0, look: { hull: 'explorer' },
        lore: 'Standard issue. It gets down, and usually back up.' },
      runner: { key: 'runner', name: 'Verge Runner', thrust: 1.35, warp: 1.2, price: 2200, look: { hull: 'courier' },
        lore: 'Stripped to the frame and over-engined. Everything that is not thrust has been removed.' },
      hauler: { key: 'hauler', name: 'Deepfield Hauler', thrust: 0.9, warp: 1.6, price: 5200, look: { hull: 'hauler' },
        lore: 'Slow off a world and tireless between them. The drive is most of the ship.' },
    },
  },
};

/** Which vehicle slots exist, in the order the sheet shows them. */
export const VEHICLE_SLOTS = Object.keys(VEHICLES);

/** What a new character owns before they have bought anything. */
export function startingVehicles() {
  const owned = {};
  const active = {};
  for (const [slot, spec] of Object.entries(VEHICLES)) {
    owned[slot] = [spec.starter];
    active[slot] = spec.starter;
  }
  return { owned, active };
}

/** The spec of whichever one is selected, or the starter. */
export function vehicleFor(player, slot) {
  const spec = VEHICLES[slot];
  if (!spec) return null;
  const key = player?.vehicles?.active?.[slot] || spec.starter;
  return spec.kinds[key] || spec.kinds[spec.starter];
}

/** Buy one. Returns `{ ok }` or `{ ok: false, why }` — owning one twice is not a thing. */
export function unlockVehicle(player, slot, key) {
  const spec = VEHICLES[slot];
  const kind = spec?.kinds?.[key];
  if (!kind) return { ok: false, why: 'No such vehicle.' };
  player.vehicles = player.vehicles || startingVehicles();
  const owned = player.vehicles.owned[slot] || (player.vehicles.owned[slot] = []);
  if (owned.includes(key)) return { ok: false, why: `You already own the ${kind.name}.` };
  if ((player.gold || 0) < kind.price) {
    return { ok: false, why: `The ${kind.name} is ${kind.price} gold and you have ${player.gold || 0}.` };
  }
  player.gold -= kind.price;
  owned.push(key);
  player.vehicles.active[slot] = key;          // a thing you just bought is the thing you want
  return { ok: true, kind };
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
      // always the cheapest of each, so nobody is ever stranded without a light
      out.push(make('torch', 'normal', level, rng));
      out.push(make('pony', 'normal', level, rng));
      out.push(make('quiver', 'normal', level, rng));
      // …and a rolling selection of the better ones
      for (const list of [SHOP_GEAR.mounts, SHOP_GEAR.lights, SHOP_GEAR.quivers]) {
        // never the cheapest again — that one is already on the shelf above
        const better = list.slice(1);
        const key = better[Math.floor(rng() * better.length)] || list[0];
        const rarity = rng() < 0.18 ? 'rare' : rng() < 0.55 ? 'magic' : 'normal';
        out.push(make(key, rarity, level, rng));
      }
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
