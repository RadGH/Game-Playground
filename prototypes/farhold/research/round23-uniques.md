# Round 23, item 1 — the uniques

> "Generate 2 uniques of every type, including weapon sub types like wands of fire. For weapons
> without subtypes generate 4 uniques instead. Some of these new weapons could inflict special dots
> or impart effects on the user or have interesting auto-attack mechanics."

**184 new uniques** across every lootable type, carrying **48 new powers** plus 9 of the old ones.
Every new power is exercised by a test that makes it act and measures what happened, and the
attack paths were checked in a real browser (chain lightning, burning ground, the Pyre aura, the
full-circle swing, a splitting wand bolt).

Along the way I found and fixed six bugs that were already in the game. The worst one: **every
unique's power was running twice** (see "Broken things found along the way").

## What counts as a "type", and how many each gets

A weapon's type is the swing row that `js/weapons.js` `profileOf` actually picks for its base. So
a "mace" here is exactly what the game swings as a mace. `js/uniques.js` `typeOfUnique` asks the
same question, and a test checks that every unique's own `type` matches what the game would treat
it as.

| Group | Types | Rule | Count |
|---|---|---|---|
| Weapons with no subtypes | dagger, sword, longsword, rapier, sabre, axe, greataxe, mace, hammer, warhammer, greatsword, halberd, spear, quarterstaff, bow, shortbow, crossbow, javelin | 4 each | 18 x 4 = 72 |
| Casters (weapons with element subtypes) | wand, staff, sceptre, orb, tome | 2 per element, 6 elements (fire, ice, lightning, poison, shadow, arcane) | 5 x 6 x 2 = 60 |
| Armour, by slot and weight | head, chest, legs in cloth/light/medium/heavy; hands, feet in light/medium/heavy (items.json has no cloth gloves or boots) | 2 each | 18 x 2 = 36 |
| Everything else you can find | shield, ward (magic shield), quiver, ring, necklace, mount, light, tool | 2 each | 8 x 2 = 16 |
| | | **Total** | **184** |

**The subtype rule.** A weapon has subtypes when the same base comes in more than one element and
plays differently because of it. That is only true of the five casters: `attuneWeapon` gives each
one of the six `CAST_ELEMENTS`, and the element picks the staff's spell list and the status every
hit leaves. A branded sword is still a sword, so steel weapons count as having no subtypes. Holy is
not a caster element (there is no holy row in `CAST_ELEMENTS`, so a "holy wand" would come out fire).

**What is left out, and why.** A *scanner* is not in: `data/tools.json` says devices "are owned,
not rolled — there is no rare scanner", so a unique scanner would be the only scanner with a
rarity at all. *Boats and ships* are bought once and never drop (`js/gear.js` VEHICLES). A *tool*
IS in, because it rolls a rarity and carries affixes like any other gear.

Some families merge because the game swings them the same way: scimitar + sabre = sabre, axe +
battleaxe = axe, sword2h + greatsword = greatsword, halberd + polearm = halberd.

## How it fits together

| Piece | File | What it does |
|---|---|---|
| The rows | `tools/build-uniques.mjs` | The design: type, base, act, name, power, lore. Affix numbers are worked out from the act and the type by one set of formulas, so a unique sits on the same curve as every other unique of its act. Re-run it after editing a row. |
| The data | `data/uniques.json` | 184 entries, written by the builder. Not the source — edit the builder. |
| Loading | `js/uniques.js` `installUniques`, called in `js/main.js` `boot()` | Puts them into `items.uniques` **in memory only**. `items.json` is shared with Emberveil, which has no registry entry for these powers, so nothing is written into the shared file. Safe to run more than once. Also writes each power's sentence into `items.legendaryEffects`, so Emberveil's generator copies real text onto the item. |
| Making one | `js/rpg.js` `itemLevels` (the `generateUnique` wrapper) | Most uniques sit on an items.json base and go through Emberveil's generator. A mount, lamp, quiver or tool has no items.json base, so `makeGearUnique` builds it from Farhold's own base (`js/gear.js` or `data/tools.json`). Either way `dressUnique` writes the fixed element (`item.attune`, read by `attuneWeapon`), the wand's bolt behaviour and the staff's spell. |
| Dropping | `js/rpg.js` `rollDrop` | Unchanged: a legendary roll picks a unique from its act or lower half the time. The new ones are in that list. |
| The powers | `js/effects.js`, the "round 23" block | Every number a card prints is in `U23`, and the hook reads the same constant, so the sentence and the code cannot drift apart. |
| Carrying out requests | `js/uniques.js` `resolveAttack`, `afterKill`, `afterDamaged`, `tickAuras` | Pure functions over a small `env` object (the field, the player, a status function). `js/main.js` builds `uniqueEnv` once; the tests build one by hand around the real `rpg.strike`. |

### The three new places the game asks the powers

* **`rpg.attackMods(unit, kind)`** — once per swing, shot, bolt or staff cast (`kind` = `melee`,
  `arrow`, `bolt`, `staff`). Runs every `onAttack` hook and hands back a damage `power`, an area
  `scale`, an `element` override and requests (`fullCircle`, `slam`, `chain`, `patch`, `ricochet`,
  `split`, `pull`, `echo`, `shockwave`, `twin`, `shots`). Blood Price's cost is paid here.
* **`rpg.auraList(unit)`** — every frame, for the powers that pulse on a clock.
* **`rpg.gatherBonus(unit)`** — when a gather bar fills.

### New status shapes (`js/skills.js` `applyStatus` / `tickStatuses`)

A unique's status says on its own spec how it behaves, so nothing else needs to know which weapon
put it there:

* `stackMax` — stacks instead of refreshing (Venom, Frostbite); `onMax` swaps the stack for
  another status at the cap (Frostbite at 5 becomes Frozen).
* `ramp` — damage rises every tick it keeps burning, capped (Kindling).
* `growOnMove` — damage rises with every metre the target walks (Hemorrhage).
* `detonate` — pays a share of the damage stored on it when it runs out (Doom).

A refresh keeps the progress (ticks paid, metres walked, damage stored). Otherwise a Kindling on a
fast weapon would restart on every hit and never climb.

A strike made BY a power (a chain jump, a ricochet, an echo, an aura, a pool) carries
`proc: true`. Every power that starts more strikes checks it first, so chain lightning cannot chain
off its own chain.

## The powers

"Where it fires" names the function that carries it out.

| Power | Used by | What the card says | Where it fires |
|---|---|---|---|
| `alternate_elements` | 1 | Your attacks cycle fire, ice, lightning: each attack deals that element's damage and applies its status (Burning: 105% of the hit over 5s; Chilled: -45% move speed for 4s; Shocked: +30% damage taken for 5s). | `onAttack`; `swingWith` and `onArrowLand` use that element |
| `barrier_burst` | 4 | When your barrier breaks, the barrier bursts: 80% of your damage as arcane damage to every enemy within 5 metres. Once every 10s. | `onDamaged` (reads `absorbed`); `afterDamaged` |
| `battle_trance` | 3 | Every 5th hit in a row on the same enemy is a guaranteed critical hit. | `critBonus` + `onHit` in `rpg.strike` |
| `blood_price` | 2 | +35% damage. Every attack costs 1.5% of your maximum health; this cannot take you below 1 health. | `dmgOut`; the cost in `rpg.attackMods` |
| `bulwark` | 1 | Every hit you block gives +20% damage for 4s. | `onDamaged` (reads `blocked`) + `dmgOut` |
| `chain_lightning` | 8 | Every attack that hits jumps lightning to up to 3 more enemies within 8 metres, dealing 40% of your damage to each. | `onAttack`; `resolveAttack` on every attack path |
| `crescendo` | 4 | Every attack in a row adds +6% damage, up to +30% at 5 attacks. The 6th attack releases a shockwave, 100% of your damage to every enemy within 5 metres, and the count starts again. The count resets after 3s without attacking. | `onAttack` + `dmgOut`; `resolveAttack` for the shockwave; idle reset in `Effects.update` |
| `crit_heal` | 3 | Critical hits heal you for 3% of your maximum health. | `onCrit` in `rpg.strike` |
| `crit_ward` | 4 | Critical hits give you a barrier worth 20% of the damage dealt, up to 25% of your maximum health. | `onCrit` in `rpg.strike` |
| `cull` | 4 | A hit that leaves an ordinary enemy or a champion below 10% health kills that enemy outright. Rares and bosses are immune. | `onHit` marks the hit; `rpg.strike` makes the kill |
| `doom` | 7 | The first hit on an enemy lays Doom for 4s. When Doom ends, the enemy takes 40% of all the damage you dealt that enemy in those 4s again, as shadow damage. | `onHit` stores damage on the status; `tickStatuses` lands it on expiry |
| `dread_lantern` | 1 | Every enemy within 8 metres of you in a fight is Unnerved and deals 15% less damage. | `aura` puts Unnerved (`dealLess`) on enemies; the enemy swing already reads `outgoingFrom(e)` |
| `echo_strike` | 4 | 25% of your melee hits strike the same enemy again 0.3s later for 60% of your damage. | `onAttack` (melee); `resolveAttack` schedules the second strike |
| `fire_trail` | 3 | An attack that hits leaves burning ground under the first enemy hit, at most once every 1s: 5 metres across for 3s, dealing 25% of your damage as fire damage every 0.75s. | `onAttack`; `resolveAttack` drops a pool through `dropPool` |
| `fourth_volley` | 3 | Every 4th shot looses 3 arrows in a fan instead of 1. | `onAttack` (arrows); `swingWith` looses the extra arrows |
| `frost_skin` | 5 | Every enemy that hits you in melee is Chilled: -45% move speed for 4s. | `onDamaged` in `rpg.strike` (skipped for `ranged: true`) |
| `frostbite` | 7 | Every hit adds a stack of Frostbite for 5s: -8% move speed per stack. At 5 stacks the enemy is Frozen and cannot move for 1.5s, and the stacks clear. | `onHit` in `rpg.strike`; stacking and the freeze in `applyStatus` |
| `glass_heart` | 3 | +50% damage dealt and +25% damage taken. | `dmgOut` / `dmgIn` in `rpg.strike` |
| `gravity_bolt` | 2 | Bolt impacts pull every enemy within 5 metres 2.5 metres toward the impact. | `onAttack`; `resolveAttack` from `fireBolt`, through the knockback field |
| `hemorrhage` | 4 | Critical hits open a Hemorrhage: 50% of the hit as bleed damage over 5s, +10% for every metre the enemy moves while bleeding, up to +150%. | `onCrit` in `rpg.strike`; growth in `tickStatuses` |
| `kill_frenzy` | 5 | Every kill adds a stack of Frenzy for 6s, up to 5: +8% attack speed and +4% move speed per stack. | `onKill` from `onEnemyKilled`; stacks on the sheet via `derive` + the timer in `Effects.update` |
| `kindling` | 5 | Every hit sets Kindling for 5s: fire damage starting at 8% of the hit a second and rising by 4% of the hit for every second Kindling keeps burning, up to 24% a second. | `onHit` in `rpg.strike`; the climb in `tickStatuses` |
| `mana_burn` | 3 | Every hit spends 4 mana to deal +45% damage. With less than 4 mana, hits deal normal damage. | `dmgOut` + `onHit` in `rpg.strike` |
| `opportunist` | 3 | +30% damage to enemies that are slowed by anything: Chilled, Frostbitten, Frozen, Cursed or Snared. | `dmgOut` in `rpg.strike` |
| `overflow` | 3 | +2 mana a second, and +20% damage while your mana is full. | `derive` + `dmgOut` |
| `overload` | 3 | Every 4th spell a staff casts deals 2x damage and covers 50% more ground. | `onAttack` (staff); `swingWith` multiplies the staff's share and scale |
| `prospector` | 1 | Every gather you finish has a 20% chance to pay out twice. | `gatherDone` via `rpg.gatherBonus` in both `beginGather` finishes |
| `pyre_aura` | 6 | Every 1s in a fight, every enemy within 4 metres of you takes 15% of your damage as fire damage and is set Burning (105% of that hit as fire damage over 5s). | `aura` via `rpg.auraList`; `tickAuras` in the frame loop |
| `quake_slam` | 4 | Every 3rd melee swing also slams the ground: 70% of your damage to every enemy within 4 metres, knocking them 2 metres back. | `onAttack`; `resolveAttack` |
| `quick_hands` | 1 | +30% gathering speed, and every gather you finish gives +20% move speed for 5s. | `derive` on `gatherSpeed` + `gatherDone`; move speed via the timer |
| `resonance` | 5 | +12% damage for every different status on the enemy, up to +60%. | `dmgOut` in `rpg.strike` |
| `retaliate_nova` | 2 | Every hit you take has a 20% chance to release a frost nova: 60% of your damage as ice damage to every enemy within 5 metres, applying Chilled (-45% move speed for 4s). | `onDamaged` raises a nova; `afterDamaged` from `onEnemyStrike` / `onEnemyShoot` |
| `ricochet` | 4 | Arrows that hit an enemy bounce to another enemy within 10 metres for 60% of your damage, up to 2 bounces. | `onAttack` (arrows); `resolveAttack` from `onArrowLand` |
| `rider_fury` | 1 | +30% damage while mounted. Every kill while mounted makes your mount 15% faster for 5s. | `dmgOut` + `onKill` + `derive` on `mountSpeed`; `player.mounted` set in the frame loop |
| `rot_spread` | 6 | Every hit applies Rot: 60% of the hit as poison damage over 6s. An enemy that dies while rotting passes the Rot to every enemy within 6 metres. | `onHit` in `rpg.strike`; the spread is `afterKill` from `onEnemyKilled` |
| `searing_light` | 2 | Every 2s in a fight, the light burns every enemy within 10 metres of you for 12% of your damage as holy damage. | `aura`; `tickAuras` |
| `second_wind` | 5 | When a hit leaves you below 30% health, you gain a barrier worth 35% of your maximum health. Once every 45s. | `onDamaged` in `rpg.strike` |
| `shatter` | 4 | +50% damage to Chilled, Frostbitten or Frozen enemies. | `dmgOut` in `rpg.strike` |
| `split_bolt` | 1 | Bolts split on impact into 3 shards, each hitting a different enemy within 8 metres for 35% of your damage. | `onAttack` (bolts and staff bolts); `resolveAttack` from `fireBolt` |
| `static_charge` | 6 | Every hit on a Shocked enemy arcs lightning to 1 other enemy within 8 metres for 50% of your damage. | `onHit` raises an arc; `resolveAttack` carries it out |
| `stillness` | 4 | +30% critical chance once you have stood still for 1.5s. | `critBonus`; stand-still time counted in `Effects.update` |
| `stormrider` | 1 | While you are mounted and in a fight, every 2s lightning strikes the nearest enemy within 12 metres for 60% of your damage. | `aura` (only while mounted); `tickAuras` |
| `stride` | 4 | +25% damage while you are moving. | `dmgOut`, reading `player.moving` (set in the frame loop) |
| `third_cleave` | 3 | Every 3rd melee swing becomes a full circle around you at the weapon's reach. | `onAttack`; `swingWith` widens the arc to a full circle |
| `thornmail` | 4 | 40% of the damage you take from each hit is dealt back to the attacker. | `reflect`, read by the thorns line in `rpg.strike`; the kill in `afterDamaged` |
| `twin_bolt` | 2 | Every bolt is followed by a second bolt 0.2s later for 50% of the damage. | `onAttack`; the wand branch of `swingWith` fires the second bolt |
| `vampire_kill` | 3 | Every kill heals you for 12% of your maximum health over 4s. | `onKill`; the heal-over-time is `afterKill` putting a status on you |
| `venom_stack` | 9 | Every hit adds a stack of Venom, up to 5: each stack deals 20% of the hit as poison damage over 6s, and each new stack refreshes the rest. | `onHit` in `rpg.strike`; stacking in `applyStatus` |

The nine old powers some of the new uniques reuse (`burn_extend`, `crit_bleed_5`,
`critical_armorpen`, `curse_spreads`, `dragon_fury_breath`, `echo_cast`, `free_move`,
`nemesis_hunter`, `rally_on_kill`) were already wired before this round and are unchanged.

## Every new unique

In taxonomy order. "Power" is the id in the table above, or one of the nine older powers.

| Name | Type | Base | Act | Power |
|---|---|---|---|---|
| Nettlepin | dagger | dagger | 1 | venom_stack |
| Widow's Tithe | dagger | tithe_dagger | 3 | cull |
| The Quiet Second | dagger | dagger | 4 | echo_strike |
| Emberfang | dagger | dragonfang_dagger | 6 | hemorrhage |
| Oathcutter | sword | sword | 1 | battle_trance |
| Hedgewarden | sword | forager_blade | 2 | crit_heal |
| Carrion Oath | sword | hunters_edge | 4 | rot_spread |
| Pyrewright | sword | dragonfang_sword | 6 | fire_trail |
| Vigil of Harrow | longsword | longsword | 2 | second_wind |
| Stormwake | longsword | longsword | 3 | chain_lightning |
| Crescent Hymn | longsword | longsword | 5 | crescendo |
| Tyrant's End | longsword | longsword | 6 | nemesis_hunter |
| Needle of Vess | rapier | rapier | 1 | stillness |
| Quicksilver Pact | rapier | rapier | 3 | kill_frenzy |
| Riposte of Glass | rapier | rapier | 4 | glass_heart |
| The Last Courtesy | rapier | rapier | 6 | stride |
| Winterbite | sabre | rimecut_sabre | 2 | frostbite |
| Prism Dancer | sabre | obsidian_scimitar | 3 | alternate_elements |
| Shiverlight | sabre | rimecut_sabre | 5 | shatter |
| Duskreaver | sabre | obsidian_scimitar | 6 | doom |
| Woodsman's Grudge | axe | battleaxe | 1 | crit_bleed_5 |
| Reaver's Due | axe | battleaxe | 3 | blood_price |
| Hearthsplitter | axe | battleaxe | 4 | third_cleave |
| Gorewind | axe | battleaxe | 6 | vampire_kill |
| Rendmaw | greataxe | axe2h | 2 | quake_slam |
| Quarryhound | greataxe | breakers_pick | 3 | opportunist |
| Greymarch Headsman | greataxe | axe2h | 5 | cull |
| Worldrender | greataxe | axe2h | 6 | dragon_fury_breath |
| Candlemace | mace | lantern_mace | 1 | pyre_aura |
| Penitent's Weight | mace | iron_mace | 3 | thornmail |
| Bellbreaker | mace | iron_mace | 4 | resonance |
| Saint Ossery's Knuckle | mace | iron_mace | 6 | crit_ward |
| Anvilheart | hammer | hammer | 2 | quake_slam |
| Mountainsong | hammer | hammer | 3 | echo_strike |
| First Light Maul | hammer | dawnwarden_hammer | 4 | searing_light |
| Wyrmknell | hammer | drakehammer | 6 | third_cleave |
| Gatecrusher | warhammer | warhammer | 2 | critical_armorpen |
| Grievance | warhammer | warhammer | 3 | rally_on_kill |
| Thunderhead | warhammer | warhammer | 5 | static_charge |
| Doomsday Bell | warhammer | warhammer | 6 | doom |
| The Long Scythe | greatsword | greatsword | 2 | third_cleave |
| Grave Harvest | greatsword | sword2h | 3 | curse_spreads |
| Hollowing | greatsword | voidsteel_greatsword | 4 | mana_burn |
| Emberlord's Reckoning | greatsword | dragonfang_greatsword | 6 | pyre_aura |
| Longwatch Pike | halberd | halberd | 2 | frost_skin |
| Hookjaw | halberd | halberd | 3 | opportunist |
| The Sentinel's Arc | halberd | halberd | 5 | crescendo |
| Starfall Glaive | halberd | halberd | 6 | chain_lightning |
| Boarsplitter | spear | spear | 1 | hemorrhage |
| Tidecaller | spear | spear | 3 | frostbite |
| Serpent's Reach | spear | spear | 4 | venom_stack |
| Skyrend | spear | spear | 6 | stride |
| Pilgrim Oak | quarterstaff | quarterstaff | 1 | crit_heal |
| Monsoon Rod | quarterstaff | quarterstaff | 3 | echo_strike |
| Nine Winds | quarterstaff | quarterstaff | 4 | battle_trance |
| The Unbent Reed | quarterstaff | quarterstaff | 6 | retaliate_nova |
| Hawkfeather | bow | bow | 1 | ricochet |
| Warden's Volley | bow | roadwarden_bow | 3 | fourth_volley |
| Comet's Wake | bow | starwake_bow | 5 | resonance |
| Ashstring | bow | wyrmscale_bow | 6 | kindling |
| Skipping Stone | shortbow | shortbow | 1 | ricochet |
| Wasp's Nest | shortbow | shortbow | 2 | venom_stack |
| Quickdraw Oath | shortbow | shortbow | 4 | kill_frenzy |
| Galewhisper | shortbow | shortbow | 6 | blood_price |
| Bolt of Judgement | crossbow | crossbow | 2 | cull |
| Frostlatch | crossbow | crossbow | 3 | frostbite |
| Crackling Arbalest | crossbow | stormpin_crossbow | 4 | static_charge |
| Ironhail | crossbow | crossbow | 6 | fourth_volley |
| Hunter's Throw | javelin | javelin | 1 | hemorrhage |
| Longstrider | javelin | pathfinder_javelin | 3 | ricochet |
| Viper's Tongue | javelin | javelin | 4 | venom_stack |
| Noon Spear | javelin | watchfire_glaive | 6 | chain_lightning |
| Cinderquill | wand (fire) | wand | 1 | kindling |
| Ashmouth | wand (fire) | dragontooth_wand | 5 | split_bolt |
| Rimeglass Wand | wand (ice) | wand | 2 | frostbite |
| Hailcaller | wand (ice) | dragontooth_wand | 5 | twin_bolt |
| Sparkthorn | wand (lightning) | wand | 1 | static_charge |
| Tempest Needle | wand (lightning) | wand | 4 | chain_lightning |
| Blightwhistle | wand (poison) | wand | 2 | venom_stack |
| Mourning Reed | wand (poison) | wand | 5 | rot_spread |
| Gloamfinger | wand (shadow) | wand | 3 | doom |
| Hollow Wand | wand (shadow) | wand | 6 | mana_burn |
| Starpin | wand (arcane) | wand | 1 | gravity_bolt |
| Echoing Tine | wand (arcane) | wand | 4 | twin_bolt |
| Sootcrown | staff (fire) | staff | 2 | overload |
| Brandstaff of Kell | staff (fire) | dragonbone_staff | 5 | kindling |
| Glacier's Spine | staff (ice) | staff | 3 | shatter |
| Rimefold Crook | staff (ice) | abyssal_rod | 6 | frostbite |
| Stormherd's Crook | staff (lightning) | staff | 2 | static_charge |
| Skyfather's Rod | staff (lightning) | dragonbone_staff | 5 | overload |
| Rotwood Staff | staff (poison) | staff | 1 | rot_spread |
| Bog Mother's Cane | staff (poison) | bramble_staff | 4 | venom_stack |
| Nightspine | staff (shadow) | staff | 3 | doom |
| Graveshroud Staff | staff (shadow) | abyssal_rod | 6 | curse_spreads |
| Loomstaff | staff (arcane) | staff | 2 | gravity_bolt |
| Starwright's Rod | staff (arcane) | dragonbone_staff | 5 | overload |
| Coalcrown Sceptre | scepter (fire) | scepter | 2 | pyre_aura |
| Ember Regent | scepter (fire) | scepter | 5 | fire_trail |
| Frostmantle Sceptre | scepter (ice) | scepter | 3 | frost_skin |
| Pale Monarch | scepter (ice) | scepter | 6 | shatter |
| Thunder Regalia | scepter (lightning) | scepter | 2 | chain_lightning |
| Voltaic Sceptre | scepter (lightning) | scepter | 5 | static_charge |
| Marsh King's Sceptre | scepter (poison) | scepter | 1 | venom_stack |
| Plaguewright's Rod | scepter (poison) | scepter | 4 | rot_spread |
| Duskcrown | scepter (shadow) | gravebound_scepter | 3 | doom |
| Gravebound Rule | scepter (shadow) | gravebound_scepter | 6 | vampire_kill |
| Orrery Sceptre | scepter (arcane) | scepter | 2 | resonance |
| Sceptre of the Seventh Sphere | scepter (arcane) | scepter | 5 | overflow |
| Heart of the Kiln | orb (fire) | orb | 2 | crit_ward |
| Sunstone Orb | orb (fire) | orb | 5 | pyre_aura |
| Frozen Tear | orb (ice) | orb | 1 | frost_skin |
| Stillwater Globe | orb (ice) | orb | 4 | stillness |
| Captured Storm | orb (lightning) | orb | 3 | chain_lightning |
| Thunderegg | orb (lightning) | orb | 6 | static_charge |
| Blightpearl | orb (poison) | orb | 2 | rot_spread |
| Witchbile Orb | orb (poison) | orb | 5 | venom_stack |
| Eye of the Hollow | orb (shadow) | orb | 3 | glass_heart |
| Nightglass | orb (shadow) | orb | 6 | doom |
| Mirrorsphere | orb (arcane) | orb | 1 | barrier_burst |
| Worldseed | orb (arcane) | orb | 4 | overflow |
| Book of Cinders | tome (fire) | tome | 1 | burn_extend |
| The Ashen Codex | tome (fire) | tome | 4 | kindling |
| Frostbound Primer | tome (ice) | tome | 2 | shatter |
| Hymnal of the Long Winter | tome (ice) | tome | 5 | frostbite |
| Stormscript | tome (lightning) | tome | 3 | chain_lightning |
| Litany of Sparks | tome (lightning) | tome | 6 | crescendo |
| Herbal of Ruin | tome (poison) | tome | 2 | venom_stack |
| Grimoire of the Mire | tome (poison) | tome | 5 | rot_spread |
| Book of Unnaming | tome (shadow) | tome | 3 | mana_burn |
| Obituary | tome (shadow) | tome | 6 | doom |
| Primer of Echoes | tome (arcane) | tome | 1 | echo_cast |
| The Endless Index | tome (arcane) | tome | 4 | resonance |
| Seer's Veil | head:cloth | cloth_helm | 2 | overflow |
| Cowl of Quiet Hours | head:cloth | cloth_helm | 5 | stillness |
| Scout's Brow | head:light | light_helm | 1 | stride |
| Mask of the Fox | head:light | light_helm | 4 | kill_frenzy |
| Coif of Second Breath | head:medium | medium_helm | 2 | second_wind |
| Iron Halo | head:medium | medium_helm | 5 | crit_heal |
| Bellhelm | head:heavy | heavy_helm | 3 | retaliate_nova |
| Crown of the Drake Warden | head:heavy | wyrmscale_helm | 6 | pyre_aura |
| Robe of the Last Lamp | chest:cloth | cloth_chest | 1 | barrier_burst |
| Wyrmsilk Vestment | chest:cloth | dragonscale_cloth | 5 | echo_cast |
| Hunter's Jerkin | chest:light | light_chest | 2 | opportunist |
| Nightrunner Coat | chest:light | light_chest | 4 | vampire_kill |
| Mail of the Frozen March | chest:medium | medium_chest | 3 | frost_skin |
| Hydra Scale | chest:medium | scaled_chest | 6 | thornmail |
| Penance Plate | chest:heavy | heavy_chest | 2 | thornmail |
| Bastion of Kharr | chest:heavy | dragonsteel_chest | 5 | second_wind |
| Leggings of the Ley | legs:cloth | cloth_legs | 1 | crit_ward |
| Mooncloth Wraps | legs:cloth | cloth_legs | 4 | free_move |
| Pathless Breeches | legs:light | light_legs | 2 | stride |
| Deerstalker's Leathers | legs:light | light_legs | 5 | stillness |
| Chain of the Long Road | legs:medium | medium_legs | 3 | kill_frenzy |
| Dragonhide Greaves | legs:medium | dragonhide_legs | 6 | pyre_aura |
| Rampart Greaves | legs:heavy | heavy_legs | 2 | frost_skin |
| Runeward Greaves | legs:heavy | runed_legs | 5 | barrier_burst |
| Cutpurse Gloves | hands:light | light_gauntlets | 1 | battle_trance |
| Gloves of the Quick Draw | hands:light | light_gauntlets | 4 | fourth_volley |
| Gauntlets of the Last Word | hands:medium | medium_gauntlets | 3 | cull |
| Stormgrip | hands:medium | medium_gauntlets | 5 | chain_lightning |
| Fists of the Quarry | hands:heavy | heavy_gauntlets | 2 | quake_slam |
| Wyrmclaw Grips | hands:heavy | dragonclaw_gauntlets | 6 | hemorrhage |
| Boots of the Hare | feet:light | light_boots | 1 | kill_frenzy |
| Ashstep Boots | feet:light | light_boots | 4 | fire_trail |
| Marchwarden Boots | feet:medium | medium_boots | 2 | second_wind |
| Frostprint Sabatons | feet:medium | medium_boots | 5 | frostbite |
| Stonestep Sabatons | feet:heavy | heavy_boots | 3 | quake_slam |
| Groundswell Sabatons | feet:heavy | runed_boots | 6 | crescendo |
| Parry's Promise | shield | buckler | 1 | bulwark |
| Aegis of Last Light | shield | aegis_shield | 5 | thornmail |
| Glimmerward | ward | warded_focus | 2 | barrier_burst |
| Veilguard Orb | ward | spellguard_orb | 5 | second_wind |
| Emberwing Quiver | quiver | quiver_ember | 2 | kindling |
| Quiver of the Wild Hunt | quiver | quiver_seeker | 5 | ricochet |
| Band of Echoes | ring | ring | 1 | echo_strike |
| Signet of the Glass Throne | ring | gold_signet | 4 | glass_heart |
| Pendant of Wounds | necklace | necklace | 2 | resonance |
| Veinstone of Vael | necklace | silver_amulet | 5 | crit_ward |
| Brambleback | mount | pony | 2 | rider_fury |
| Thunderhoof | mount | dray | 5 | stormrider |
| Lantern of Morrow | light | lantern | 2 | dread_lantern |
| Sunjar | light | wisplamp | 5 | searing_light |
| Prospector's Pride | tool | ironhead_tool | 2 | prospector |
| Quickhand Pick | tool | steelhead_tool | 4 | quick_hands |

## How strong they are

Every unique's plain stats come from the formulas in `tools/build-uniques.mjs`, by act (1 to 6):

* **Weapons**: the base's own attribute (str, dex or int) at `4 + 2.4 x act` (6 at act 1, 18 at
  act 6), plus one second stat from a rotating list (crit chance, flat damage, health, crit damage,
  life steal on steel, attack speed; spell power, mana or mana a second on casters), plus one rolled
  range. That is the same ballpark as Emberveil's own uniques (Thornblade, act 1: dex 10, crit 8;
  Greatsword of the Last King, act 5: str 18, damage 14).
* **Armour**: armour at `tier x (1 + 0.5 x act)`, the tier's attribute at `3 + 2 x act`, and health
  or constitution, plus a rolled range (magic resistance on cloth, crit chance on light, health a
  second on medium and heavy).
* **Everything else** has its own small profile: block on shields, barrier on wards, arrow damage
  on quivers, gallop time on mounts, reach on lamps, yield and reach on tools.

The powers are the interesting part and are tuned to be worth building around without being a
second weapon: a proc strike is a fresh roll of your own damage at 35-70%, never a copy of the hit
that caused it; the damage-over-time powers sit at 60-80% of the hit spread over 5-6s, which is in
line with the burn and poison the game already has after round 21b's rebalance; and everything on
a timer or a count has a cap written on the card.

None of the powers multiplies something `rpg.strike` already multiplies (the "one multiplier, two
owners" trap). A power's `dmgOut` goes through the registry's one aggregator like every other
affix, and a proc strike goes through `rpg.strike` once.

## Broken things found along the way

All six were already in the game before this round. All six are fixed.

1. **Every unique's power ran twice.** A unique carries its power as an affix row (so the card can
   print it) and as `legendaryEffectId` (which `rpg.legendaryPowers` collects, so set powers and
   unique powers arrive through one list). `Effects.list` read both. So The Ingrate's "+25% damage"
   was +56%, Truthseeker's bolt splash was 4x the radius instead of 2x, and every on-kill heal paid
   double. Fixed in `js/effects.js` `list()`: a legendary power is counted once, whatever carries
   it. Found by the first test that asked a unique for its damage multiplier. **This makes all 36
   of Emberveil's uniques weaker in Farhold, back to what their cards say.**
2. **A lingering pool crashed on its first hit.** `tickPools` in `js/main.js` called `brandHit`,
   which is a `const` inside the frame loop about 3,600 lines further down and does not exist
   where the pool runs. So the Ground talent and a charged staff's wall threw "brandHit is not
   defined" the moment they touched an enemy. The pool now lands its own element's status and
   reports its own numbers.
3. **"+N% damage while you are mounted" did nothing.** `cond_vehicleDmg` (the Wagon-Axle Club's
   property) reads `player.mounted`, and only `control.mounted` was ever set. The frame loop now
   copies it across, next to where it already copies `moving` and `atNight`.
4. **Status powers never fired on arrows.** `onArrowLand` called `field.strikeArea` without the
   status callback, so `crit_bleed_5` (Voidreaver Bow) and `cond_bleedOnCrit` did nothing on a
   bow. It passes the callback now.
5. **An enemy killed by thorns stood there at 0 health.** Reflected damage lowered its health and
   nothing called `field.kill`. `afterDamaged` does now, for Thornmail and for the older thorns
   affixes.
6. **A unique caster was a random element on every drop.** `attuneWeapon` picks a caster's element
   from a hash of the item's id, and a unique's id is random (`u_` + a random number). Fixed for the
   new uniques by `item.attune`. **Not fixed for Emberveil's old caster uniques** (Truthseeker,
   Magma Sceptre, Malgrath's Soulbrand and the rest): they still roll a random element each time,
   because fixing them means choosing an element for items Emberveil owns. One line each in a
   Farhold-side table if you want it.

One more old thing noticed and left alone: `legendary:road_cache` still says it "turns up a cache
of coin" with no amount, because nothing in the game reads its hook. Its own comment already says
so.

## Tests

`tests/round23-uniques.test.js`, 61 tests:

* **The count** — every type in `UNIQUE_TYPES` holds exactly its share, every unique is the type the
  game would treat it as, no type the taxonomy does not list, and every act has at least 15.
* **Every unique resolves** — real base, real power, every affix has an effect, unique ids and names,
  no clash with Emberveil's. Every one of the 184 generates, equips on a level-50 character, runs its
  power exactly once, and carries nothing inert. Every caster comes out its own element on three
  different seeds, with its bolt behaviour and staff spell. Gear uniques land in their own slot as
  the real thing. Installing twice does not double the list, and nothing is written to the shared
  file. Legendary drops through the ordinary `rollDrop` produce them.
* **The words** — every new power states a number, uses no vague word and never says "it".
* **Every power, doing it** — one test per power, through the real `rpg.strike`, `tickStatuses`,
  `rpg.attackMods` and the resolvers against a field of plain objects. A table-guard test fails if a
  power any unique carries has no test, or a test exists for a power nobody carries.
* **The game asks for it** — `js/main.js` is checked for every call site (each attack path, the
  kill, the hit taken, the aura clock, the gather, the install, the mounted flag, `ranged: true` on
  arrows at the player), and `tickPools` is checked for the `brandHit` crash.

The whole node suite: **1265 tests, 1265 pass, 0 fail.**

A browser check (a throwaway Playwright spec against a server on port 8412, not committed) confirmed
with no page errors: all 184 uniques load; Stormwake's chain lightning hits two rats the swing
cannot reach; Pyrewright's burning ground keeps ticking (this is what would have thrown before
fix 2); Candlemace burns a rat standing beside you; Hearthsplitter's third swing hits a rat behind
you; Ashmouth comes out fire and its bolt splits onto three other rats.

## Not done, and why

* **No new held-weapon models.** The uniques use their base's model. A caster is tinted its
  element's colour and everything else takes the legendary tint, the same way `heldLookFor` already
  draws any legendary. Giving 184 items their own colour through `look.held` would drop the rarity
  gem `heldLookFor` adds, so I left it.
* **No in-game balance run.** Farhold has no headless simulator (`tools/sim-foundry.mjs` and
  `tools/sim-emberveil.mjs` are the other games'). The numbers come from the formulas above and
  were checked by hand against Emberveil's uniques of the same act.
* **Emberveil's old caster uniques** still roll a random element (fix 6 above).
