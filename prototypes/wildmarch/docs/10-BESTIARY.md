# WILDMARCH — Design Bible, page 10: Bestiary

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Nothing is built. This page owns **every monster id**, the
**enemy families**, the **monster AI**, the **monster rarity system** (champion packs, rares, the standard
affix list and the greater rarities, §7), the **monster side of Depth** (§7.9) and the **warbands**. The
telegraph words used below (danger zone, void zone, soak, safe zone, targeted, beneficial, tether) and every
`mech_*` id are defined on [page 11](11-BOSS-MECHANICS.md). Dungeon trash, bosses, room layouts and the Depth
numbers are on [page 12](12-DUNGEONS.md); world bosses on [page 13](13-WORLD-BOSSES.md). Region lore is on
[page 01](01-WORLD-LORE.md); the damage, threat, tag and status formulas are on [page 05](05-COMBAT.md); item
drops, magic find and the five special rarities on [page 08](08-ITEMS.md).

**Round 2 in one paragraph.** The world is always daylight, so the night table, night-only monsters and night
multipliers are gone (every ☾ monster now spawns all day). Champions are now **champion packs** (a whole group
shares one affix, blue names), rares bring **minions** that share their first affix, and a new layer of
**greater rarities** (Giant, Flaming, Electrified, Frozen… 28 of them in 7 exclusion groups) makes single
monsters into real difficulty spikes that drop the matching special rarity more often. Dungeons place rarities
in **rarity slots** on purpose; the open world rolls them. The Ember Legion is the **Kingsfire Legion**, the
Ashtusk Horde the **Ashtusk Warhost**, and every monster with "ember" or "veil" in its name or id was renamed
(§14 lists them). The consistency sweep added the **Demon** and **Undead** tags (§3.1), the
**tameable** beasts the ranger reads (§3.2), and demons to bind in every band for the warlock (§3.3).

---

## Contents

1. How to read a monster entry (units, bodies, roles)
2. What Farhold already has (reuse) and what changes
3. Enemy families, monster tags, tameable beasts, demons by band
4. Monster roles and the rank ladder
5. The AI: states, senses, aggro, leash, packs, patrols, group scaling
6. Region monster lists (11 regions + Highcourt)
7. **Monster rarities**: champion packs, rares, standard affixes, greater rarities, where they appear, Depth
8. Named rares per region
9. Warbands (Sootwick, Unburied, Thornmane, Ashtusk, Stonehide) and the Kingsfire Legion
10. Loot hooks
11. The bestiary journal
12. Data shapes (JSON)
13. Tests the build must have
14. Round 2 renames (old → new)

---

## 1. How to read a monster entry

### 1.1 Units (so the numbers survive a balance pass)

Absolute health and damage belong to [page 05](05-COMBAT.md). This page states everything **relative**
to two level curves so it never goes stale:

| Symbol | Meaning |
|---|---|
| **MH(L)** | *Monster health* — the health of a standard level-L monster (HP ×1.0). Tuned so one at-level Damage player in at-level Uncommon gear kills it in about **6 seconds** of basic attacks and spells. Grows with Farhold's health curve (`balance.json enemies.perLevel` 1.13 per level, reuse: `prototypes/farhold/data/balance.json`), stretched to cap 60 by page 05. |
| **RH** | *Reference health* — the max health of an at-level **Damage**-role player in at-level Uncommon gear. Every monster hit is written as **% RH**. A tank has roughly 1.6 × RH, a healer 1.1 × RH (page 05 owns). "One-shot" means ≥ 100% RH. |
| **HP ×n** | the monster has n × MH(L). |
| **hit n%** | one basic hit deals n% RH before armour/resistance. |
| **m, m/s, s** | metres, metres per second, seconds. Player walk speed is 5.4 m/s, sprint 11.3 m/s (reuse Farhold `js/player.js`). |

A monster's level is **fixed by where it stands** (the zone's band, as in Farhold `js/zones.js`), never by
the player's level. Walk further, meet worse (reuse: Farhold round 4 rule).

### 1.2 Body notation

Every monster names one of two bodies (reuse: Farhold `js/actors.js` `makeActor`):

- **chibi: `<race>` · `<outfit>`** — a Chibi 2 humanoid (`avatar-3d/js/chibi2.js`). Race is one of the nine
  in `avatar-3d/js/chibi2-races.js`: `human`, `elf`, `dwarf`, `halfling`, `orc`, `giant`, `goblin`,
  `undead`, `beast`. Outfit is a class id from `avatar-3d/data/class-outfits.json` dressed with
  `dressAs(avatar, outfit)` (`avatar-3d/js/class-outfits.js`), e.g. `warrior`, `rogue`, `ranger`,
  `mage`, `necromancer`, `warlock`, `shaman`, `druid`, `cleric`, `priest`, `knight`, `runesmith`,
  `tinker`, `monk`, `pyromancer`, `stormcaller`. When no class outfit fits, the parts are listed
  (`top rags · hat hood · held staff_totem`). `×1.6` after the race is a body scale.
- **creature: `<type>` ×size** — an `avatar-3d/js/creatures.js` body. Type is one of the 41 entries in
  `CREATURE_TYPES` (`avatar-3d/js/creature-types.js`) over seven body plans:

| Plan | Types |
|---|---|
| quad | wolf, dire_wolf, boar, bear, rat, horse, pony, courser, elk, deer, drake, dragon, hound, cat, frog, hyena, saber_cat, crocodile, turtle, griffin |
| spider | spider, beetle |
| bat | bat, owl, moth, phoenix |
| snake | snake, worm, centipede |
| biped | golem, titan, imp, **raptor** (new: the biped-runner body shared with page 08's mount raptor; the ranger's tamed raptor uses it too) |
| float | elemental, wisp, shard, wraith, horror, slime, mushroom, mimic |
| roller | turret |

  A `variant:` is a ready-made design from `avatar-3d/data/creature-variants.json` (ember_fennec,
  marsh_turtle, cave_beetle, sky_griffin, ember_phoenix, burrow_centipede, moss_slime, moon_mushroom,
  lockjaw_mimic, reef_crocodile). Colours are given as body/accent where they matter. Farhold's
  rule stands: **no creature below size 1.4** — a knee-high rat is not a fight (reuse: Farhold RPG.md §3).
- Bodies marked **(+feature)** need one new feature flag in `creatures.js` (an hour of geometry, the
  "variation+" tag of Farhold `BESTIARY-IDEAS.md`). Bodies marked **(bespoke)** need a new type. This page
  keeps both rare on purpose: of the **116** region monsters, all but the few marked ones are existing types or chibi bodies, plus the two raptors (§6.5, §6.7), which wait on the new `raptor` type.

### 1.3 Entry format

Each region has a **stat table** then an **abilities list**:

- Stat table: `id` · name · levels · body · role · HP× · basic hit · temperament · loot hooks.
- Abilities list: every special attack with its numbers, shape, telegraph (page 11 colour words) and
  warning time, plus the AI note.
- Warning times on this page are the **open-world** values (page 11 §4: open world adds 0.5 s to the
  Normal minimum, so nothing in the open world warns in under **2.0 s** unless it deals ≤ 5% RH).

---

## 2. What Farhold already has, and what changes

| Farhold (reuse) | File | Wildmarch |
|---|---|---|
| 46 enemies, 6 bosses, 11 pets, 22 modifiers (`vicious` … `wizened`, each with `aura`, optional `scale` and `fx`), 8 families | `prototypes/farhold/data/enemies.json` | 116 region monsters + 42 warband/legion members + 6 warlords; Farhold's 46 are the body/stat source for ~30 of them (marked `reuse:` per row). Farhold's 8 `family` values become the **nature** field (below). |
| ranks normal/champion/rare, chances 0.11 / 0.03, multipliers (champion hp 2.6 / dmg 1.35, rare hp 4.5 / dmg 1.6); a champion takes 1 modifier, a rare 2 + a Name Forge name | `data/balance.json ranks`, `enemies.json _ranksDoc` | Rebuilt as the **monster rarity system** (§7): a champion is now a whole **champion pack** sharing one affix (lower per-body multipliers, since there are 3–6 of them), a rare keeps Farhold's 4.5× and gains **minions**, and **greater rarities** sit on top. Chances are per band (§7.7). |
| roles skirmisher/brute/archer/caster/leader | `enemies.json _doc`, `js/actors.js` | Six roles: **melee, brute, ranged, caster, healer, swarm** + two **traits** (support, ambusher). Farhold's `skirmisher` = melee, `archer` = ranged, `leader` = a rank inside a warband. |
| packs `[min,max]`, pack wake within 14 m by `defId` | `js/actors.js` `update` | Pack wake by **pack id** (every member of the spawned pack), plus family social aggro (§5.5). |
| threat = "seconds of attention" (`THREAT_SECONDS` 5, `aimOf`, `taunt`) | `js/actors.js` | A real threat table, because Wildmarch has tanks and other players (page 05 owns the numbers; §5.6 says how monsters read it). The Farhold "body in the way" rule stays as the tie-breaker. |
| chase gives up at 2.2 × notice range; despawn leash | `js/actors.js` | Anchor-based **leash** and an **evade/return** state (§5.4), because monsters are shared by many players and must not be dragged across the map. |
| town line turns chases back | `js/actors.js` (flee at `wild()`) | Kept: nothing hostile crosses a town's watch line. |
| stealth shortens notice range (floor 25%) | `js/actors.js` | Kept as **concealment** (page 05 owns which effects give it), same formula. |
| set-piece encounters (11) | `data/encounters.json`, `js/encounters.js` | Kept and renamed as open-world **events** on [page 14](14-QUESTS-EVENTS.md); this page only says which monsters fill them. |
| warbands (5 races) with members, bearer, warlord, grip, rout, leader aura 1.15 | `data/warbands.json`, `js/warbands.js` | Kept whole; re-banded to the 1–60 ladder and pinned to regions instead of seeded zones; a **healer** member added to each (§9). |
| world bosses with tiers 1–4 | `data/worldbosses.json` | Page 13 owns them; this page only lends bodies. |
| Emberveil 2 bestiary looks (33 enemies, 12 bosses) | `prototypes/emberveil/data/enemy-looks.json` (the prototype's own name) | Its void and fire bodies are reused for Spire Isle and Kingsfire. |
| `BESTIARY-IDEAS.md` neutral wildlife, ice/crystal/void/toxic hostiles | `prototypes/farhold/BESTIARY-IDEAS.md` | Drift Lurker, Hoarfrost Chorus, Glacier Tick, Refraction, Absence, Stitchwork, Bloom Host (as Mirecap), Rot Kite, Vine Hauler, Dune Breacher, Glass Caller, Mirage Walker all become real monsters here. The three temperaments (skittish, wary, territorial) become the AI temperament field. |

---

## 3. Enemy families

`family` is the lore group and the middle of the monster id (`m_<family>_<snake>`). `nature` is what the
thing **is** for items that say "+20% damage against undead" (Farhold's 8 families, reuse:
`enemies.json families`; page 08 owns the affixes that read it).

| family | Name | nature | Found in | Body sources | Elements it uses | Family reagent (loot hook) |
|---|---|---|---|---|---|---|
| `beast` | Beasts | beast | every region 1–8 | quad, bat, snake, spider | physical, bleed, poison | `it_rough_hide`, `it_beast_fang` |
| `folk` | Outlaws and cultists | humanoid | 1–5, 9 | chibi human/dwarf/elf/halfling | physical, fire, shadow | `it_stolen_coin`, `it_cult_token` |
| `fen` | Fen things | aberration / beast | Mossfen | slime, mushroom, frog, snake, crocodile, moth, centipede, wisp | poison, nature | `it_bog_resin`, `it_spore_sac` |
| `construct` | Deepforge constructs | construct | Greyridge, Riftmarch | golem, turtle, turret, titan | physical, fire | `it_brass_cog`, `it_rune_plate` |
| `sand` | Sand and glass | beast / elemental | Sunscar | centipede, worm, beetle, hyena, shard, golem, imp | physical, fire, arcane | `it_sunglass`, `it_dune_chitin` |
| `fae` | Fae and the Gloamward | aberration / humanoid | Whisperwood | imp, wisp, deer, spider, mushroom, horror, chibi elf | nature, arcane, holy | `it_moonpetal`, `it_gloam_silk` |
| `frost` | Frost things | beast / elemental | Frostmantle | saber_cat, bear, crocodile, wisp, spider, dragon, griffin, elemental | ice | `it_rime_crystal`, `it_frost_pelt` |
| `drowned` | The Drowned | undead / aberration | Drowned Coast | chibi undead, wraith, crocodile, beetle, slime, bat, horror | ice (water), shadow, poison | `it_salt_pearl`, `it_drowned_brass` |
| `rift` | Rift aberrations | aberration | Riftmarch | horror, shard, wraith, worm, dire_wolf, phoenix, golem | arcane, true, lightning | `it_rift_shard`, `it_unmade_glass` |
| `kingsfire` | The Kingsfire Legion and its fire things | humanoid / elemental | Kingsfire (and forward camps in the Riftmarch) | chibi human/dwarf/orc, golem, elemental, drake, phoenix | fire | `it_cinder_core`, `it_legion_brand` |
| `demon` | Demons | demon | Kingsfire, Spire Isle, rifts | imp, hound, titan, wraith, horror | fire, shadow | `it_brimstone`, `it_demon_horn` |
| `tear` | Things of the Tear | aberration / humanoid | Spire Isle (and Depth runs, §7.9) | chibi human/elf, wraith, horror, shard, titan, worm | shadow, arcane, true | `it_tear_thread`, `it_null_pearl` |
| `undead` | The restless dead | undead | 1, 3, 4, 7 (and the Unburied warband) | chibi undead, dire_wolf, worm, wraith | shadow, poison | `it_grave_dust`, `it_bone_shard` |
| `goblin` | Goblins (Sootwick warband) | humanoid | 1–3 | chibi goblin | physical, poison | `it_goblin_trinket` |
| `orc` | Orcs (Ashtusk warband) | humanoid | 6–7 | chibi orc | physical, fire | `it_ash_tusk` |
| `beastkin` | Beastkin (Thornmane warband) | humanoid | 4–6 | chibi beast | physical, lightning | `it_thorn_mane` |
| `giant` | Giants (Stonehide warband) | humanoid | 7–9 | chibi giant | physical, ice | `it_giant_knucklebone` |
| `dragon` | Dragonkin | dragonkin | 6, 7, 10 (elites only) | drake, dragon | fire, ice, lightning | `it_dragon_scale` |

The five race families (`goblin`, `orc`, `beastkin`, `giant`, `undead` for the Unburied) are the canon
**enemy warbands** (00 §4). They appear inside regions as the *warband presence* line of each region list
and are fully listed in §9.

### 3.1 Monster tags (new)

A **tag** is an extra label on a monster row (`"tags": [...]`, §12) that a class or item reads. It sits beside
`family` and `nature`; this page owns the list. Tags that name what a monster **is** use the page 16 data ids
(`tag_demon`, `tag_undead`, …) and show in the bestiary journal and tooltips under their plain name.

| Tag (shown as) | Data id | Who carries it | Who reads it |
|---|---|---|---|
| **Demon** | `tag_demon` | the whole `demon` family (open world, Depth types and wardens, §7.9.2); the Kingsfire **Cinder Imp** (`m_kingsfire_cinder_imp`); the Riftmarch **Phase Hound** (`m_rift_phase_hound`) and **Rift Horror** (`m_rift_rift_horror`); anything an enemy warlock-type caster summons (the Bound Fiend, §3.3). **Not** every imp body: the Thorn Sprite (fae) and the Glass Caller (sand) are not demons | the Demon Hunter (Hunter's Oath, banishing; [classes/demon_hunter.md](classes/demon_hunter.md) §2.3); the Warlock's **Bind Demon** ([classes/warlock.md](classes/warlock.md) §2.3); any item that says "against demons". The full bindable roster by band is §3.3 |
| **Undead** | `tag_undead` | every `undead`-family monster (incl. the Unburied warband, the Barrow Hound and the Depth types/wardens); and by row: `m_fen_peatwife`, `m_frost_rimebound_dead`, and the Drowned Coast's dead — `m_drowned_tide_thrall`, `m_drowned_salt_wraith`, `m_drowned_bellringer`, `m_drowned_choir_wailer`, `m_drowned_brine_knight`, `m_drowned_tidecaller`, the named `m_drowned_captain_vell` and `m_drowned_the_bell_below`. The Drowned family's **beasts and aberrations** (Reef Crocodile, Shellback, Kelp Slime, Wrackgull, Deep Horror) are **not** undead | the Necromancer's **Control Undead** ([classes/necromancer.md](classes/necromancer.md) §2.2: seize a living Undead, or raise a corpse that is **not** Undead); the Witch Hunter; items that say "against undead" |
| **Beast** | `tag_beast` | every row whose `nature` is beast (the `beast` family and the beasts of `fen`, `sand`, `frost`, `drowned`) | items that say "against beasts" |
| `mindless` | `mindless` | every `construct`; slimes and oozes; every elemental body (`elemental`, `wisp`, `shard`, sand and glass golems); animated objects (`mimic`, `turret`, living weapons) | the Enchanter's Charm and every mind-control effect: **cannot be charmed** ("It has no mind to bend." — [classes/enchanter.md](classes/enchanter.md) §2.2) |
| `command` | `command` | every warband **Leader**, **Standard-bearer** and **Warlord** (§9.1), and the Kingsfire Legion's Centurion and Ensign | cannot be charmed, dominated, seized or bound (a command unit answers only to its band); page 11 treats a Warlord as a boss anyway |

The round-1 tag `demonic` is gone: every reader uses **Demon** (`tag_demon`).

### 3.2 Tameable beasts (the ranger's Tame Beast)

A monster row may carry **`tameable: true`** and a **`tameFamily`** id. Only those rows can be tamed by the
ranger's **Tame Beast** ([classes/ranger.md](classes/ranger.md) §2.3 owns the rules: level, rank, calling 40
champions, tricks and leans). The ranger file's 13 families are the list; the family is a field on the row,
**not** part of the monster id (ids stay `m_<family>_<snake>`, §3 — so a wolf is `m_beast_moor_hound`, not
`m_wolf_*`). Never tameable: anything tagged Demon or Undead, humanoids and warbands, dragonkin, elementals,
constructs, `mindless`, the Riftborn and every `rift`/`tear` monster, and any Rare, Named, Boss, elite or
greater-rarity carrier whatever its row says.

| `tameFamily` | Family (ranger) | Lean | Tameable rows on this page (levels) |
|---|---|---|---|
| `tf_wolf` | Wolf | Hunter | `m_beast_moor_hound` (1–5), `m_beast_grey_wolf` (10–16, new), `m_beast_cinder_hound` (30–35), `m_frost_white_wolf` (34–40, new) |
| `tf_cat` | Great cat | Hunter | `m_beast_steppe_saber` (29–34), `m_frost_frost_stalker` (34–38) |
| `tf_raptor` | Raptor | Hunter | `m_sand_scrub_raptor` (16–22, new), `m_beast_ash_raptor` (28–34, new) |
| `tf_hyena` | Hyena | Hunter | `m_beast_ridge_hyena` (10–14), `m_sand_dune_fennec` (16–20), `m_beast_ash_hyena` (28–32) |
| `tf_boar` | Boar | Guardian | `m_beast_thicket_boar` (2–6), `m_beast_cinderback_boar` (31–36) |
| `tf_bear` | Bear | Guardian | `m_beast_crag_bear` (12–17), `m_frost_glacier_maw` (35–40) |
| `tf_crocodile` | Crocodile | Guardian | `m_fen_silt_lurker` (8–12), `m_frost_drift_lurker` (36–42), `m_drowned_reef_crocodile` (40–46) |
| `tf_beetle` | Beetle | Guardian | `m_beast_ironback_beetle` (10–15), `m_sand_sunscar_stinger` (17–22), `m_drowned_shellback` (40–45) |
| `tf_elk` | Elk | Guardian | `m_beast_ashhorn_ox` (28–34), `m_frost_rime_elk` (34–40, new) |
| `tf_hawk` | Hawk (bird of prey) | Tracker | `m_beast_orchard_rook` (2–5), `m_beast_gallows_owl` (10–14), `m_sand_carrion_glider` (16–22), `m_beast_grove_owl` (22–26), `m_frost_ridge_griffin` (36–41) |
| `tf_spider` | Spider | Tracker | `m_fen_bog_tick` (6–10), `m_fae_shroud_spider` (22–27), `m_frost_glacier_tick` (34–39) |
| `tf_frog` | Giant frog | Tracker | `m_beast_river_croaker` (1–5) |
| `tf_serpent` | Serpent | Tracker | `m_fen_reed_serpent` (6–11) |

Rows marked *new* were added in the round-2 sweep so every family has a body in the wild (the new rows are in
§6.3, §6.5, §6.7 and §6.8). Where the ranger file lists a region this page does not yet stock for a family (for
example elk in Whisperwood, beetles in the Riftmarch, frogs and serpents above level 12), this page wins until
a region list adds one; a pack of a tameable kind from Depth (§7.9) is never tameable (Depth types are
tear-cracked).

### 3.3 Demons in every band (the warlock's Bind Demon)

Demons live mainly in the Kingsfire and the Riftmarch, but Threadcutter cells (page 01 `fac_threadcutters`)
call lesser ones across the continent, so a warlock finds something to bind in every band. Every row here is
tagged **Demon**. Bind rules and the bound demon's power are on [classes/warlock.md](classes/warlock.md) §2.3.

| id | Name | Where | Lv | Body | Role | Bestiary row |
|---|---|---|---|---|---|---|
| `m_demon_bog_imp` | Bog Imp | Mossfen (the stilt villages' thief; warlock calling 1) | 6–12 | creature: imp ×1.4, peat-brown #5a4a2a, eyes #ffb040 | caster | §6.2 |
| `m_demon_bound_fiend` | Bound Fiend | beside any Threadcutter caster, at the cell's level | 10–50 | creature: titan ×1.6, horns (+feature), body #4a2030, chain cuffs | melee | below |
| `m_demon_glass_imp` | Glass Imp | Sunscar (called by Glass Callers) | 16–24 | creature: imp ×1.4, obsidian #1a1a22, glass shards on the back | caster | §6.5 |
| `m_demon_ash_hound` | Ash Hound | Cinder Steppe | 28–36 | creature: hound ×2.0, ash-grey #2a2420, small horns (+feature) | melee, fast | §6.7 |
| `m_rift_phase_hound` | Phase Hound | Riftmarch | 46–51 | (§6.10) | melee | §6.10 |
| `m_rift_rift_horror` | Rift Horror | Riftmarch | 46–52 | (§6.10) | brute | §6.10 |
| `m_kingsfire_cinder_imp` | Cinder Imp | Kingsfire | 52–56 | (§6.11) | swarm | §6.11 |
| `m_demon_brimstone_hound` | Brimstone Hound | Kingsfire | 52–57 | (§6.11) | melee | §6.11 |
| `m_demon_cinder_wraith` | Cinder Wraith | Kingsfire | 55–60 | (§6.11) | caster | §6.11 |
| `m_demon_ashmaw` | Ashmaw Fiend | Kingsfire | 56–60 | (§6.11) | brute | §6.11 |
| `m_demon_lava_leech` | Lava Leech | Kingsfire lava | 52–58 | (§6.11) | melee | §6.11 |

**Bound Fiend** (HP ×1.0, hit 6%, temperament hostile; loot `it_demon_horn`) — *Gore*: 2.0 s head-down,
red line 5 m × 2 m, 12% RH + `bleed` 2% RH/s 6 s. It stands beside the caster that called it and fights until
the caster dies, then **flees for 6 s** before fading (so a warlock who wants it must beat it while its
caller still lives, or quickly after). It is not a region monster and is not counted in §6.13.

---

## 4. Monster roles and the rank ladder

### 4.1 Roles (what a monster does in a fight)

| Role | HP× | Basic hit | Interval | Range | Move | Positioning | Farhold name |
|---|---|---|---|---|---|---|---|
| **melee** | 1.0 | 5% RH | 1.5 s | 2.4 m | 4.4 m/s | closes; flankers try the target's back (+15% damage from behind) | skirmisher |
| **brute** | 2.2 | 11% RH | 2.4 s | 3.0 m | 3.2 m/s | walks straight in; one telegraphed heavy attack (≥ 20% RH) | brute |
| **ranged** | 0.8 | 5% RH | 2.0 s | 30 m | 4.0 m/s | holds 18–25 m, steps back 6 m if a player closes to < 6 m (once per 6 s), side-steps 3 m to clear a line past an ally | archer |
| **caster** | 0.75 | 7% RH bolt | 2.6 s (1.5 s cast, interruptible) | 24 m | 3.6 m/s | holds 16–22 m, keeps line of sight, prefers higher ground | caster |
| **healer** | 0.8 | 3% RH | 2.0 s | 20 m | 3.8 m/s | stays behind the melee; heals the lowest-health ally below 70%: **12% of that ally's max health** (1.8 s cast, interruptible, 6 s cooldown); stands out of danger zones | (new) |
| **swarm** | 0.3 | 2% RH | 1.0 s | 1.8 m | 5.5 m/s | flocks (keeps 1.2 m from its mates), 5–12 per pack, counts as 0.5 for attack tokens (§5.7) | (new) |

**Traits** (added to a role): `support` (buffs, calls for help, shields — targeted last by its own pack's
attack tokens), `ambusher` (hidden until triggered; first hit +50% damage if the player had not seen it;
Farhold `feeding` encounter rule), `flying` (hovers 1.5–4 m up, ignores ground void zones, can be knocked
down by a stun for 3 s), `burrower` (moves under ground as a visible moving ridge; untargetable while under;
surfaces with a 2.0 s red danger circle), `caller` (calls help, §5.5).

### 4.2 Rank ladder

The **rank** is what kind of monster this is. The **rarity layer** (§7) is what was added on top of it:
standard affixes for champion packs and rares, and greater rarities for anything. This table is the rank
only; §7.2 gives the rarity numbers.

| Rank | How it appears | HP | Damage | Armour | Size | XP | Gold | Drops | Nameplate |
|---|---|---|---|---|---|---|---|---|---|
| `swarm` | role swarm | ×0.3 | ×0.4 | ×1.0 | ×0.8 | ×0.25 | ×0.25 | 5% chance of 1 item | grey name |
| `normal` | spawned | ×1.0 | ×1.0 | ×1.0 | ×1.0 | ×1 | ×1 | Farhold `ranks.normal` (reuse) | white name |
| `elite` | **placed** by hand (a named spot, a quest target, a region's big animal) | ×4.0 | ×1.4 | ×1.5 | ×1.3 | ×4 | ×4 | +1 item, rarity ×1.5 | white name, silver frame with a wreath icon |
| `champion` | a member of a **champion pack** (§7.2) | ×2.0 | ×1.25 | ×1.3 | ×1.12 | ×2.0 | ×2.0 | ×1.3 each, + the pack bonus (§7.2) | **blue** name `#5aa0ff`, the pack's affix on line 2 |
| `rare` | rolled at spawn (§7.7) or placed in a dungeon rarity slot; takes a Name Forge name | ×4.5 | ×1.5 | ×1.7 | ×1.3 | ×5 | ×5 | +2 items, rarity ×2.2 | **yellow** name `#ffd84a` + epithet ("Grisk the Tallow-Hearted"), affixes on line 2 |
| `minion` | the escort of a rare (2–4, §7.3) | ×1.3 | ×1.1 | ×1.2 | ×1.0 | ×1.3 | ×1.3 | ×1 | white name with a small yellow pip |
| `named` | a **named rare** (§8): hand-written, fixed spawn spots and timers | ×6.0 | ×1.6 | ×1.7 | ×1.5 | ×6 | ×6 | guaranteed Rare+, chance of its own `uq_` | yellow name with a crown pip |
| `boss` | dungeon / world / warlord | pages 11–13 | | | | | | | boss frame (page 11 §7) |

Ranks multiply the role. A rare brute has 2.2 × 4.5 = 9.9 MH. `normal`, `rare` HP and the drop columns are
Farhold's `balance.json ranks` (reuse); the champion numbers are **lower than Farhold's single champion**
(2.6 → 2.0 HP) because a champion is now a whole pack of 3–6. `swarm`, `elite`, `minion` and `named` are new.

**Greater rarities** (§7.5) add a prefix before the name in **orange** `#ff8a3d` with one badge icon per
greater rarity ("**Giant Flaming** Thicket Boar"), on any rank except `boss`.

How often each appears in the open world, and how dungeons place them: §7.7 and §7.8.

---

## 5. The AI

(reuse: Farhold `js/actors.js` field loop — `wander`, `chase`, `flee`, stagger, `aimOf`, `taunt`,
`linkEscort`, `rout`; Lanternfall `docs/05-BESTIARY-BOSSES.md` §3–4 for the alert/search/return states
and attack tokens. Wildmarch runs this on the **server**, page 16.)

### 5.1 The state machine

Every monster runs the same states; an entry only lists the triggers it changes.

| State | What it does | Leaves when |
|---|---|---|
| `idle` | stands at its anchor, plays idle; eyes at 40% glow | notices a player → `alert`; 3–8 s timer → `wander` or `patrol` |
| `wander` | walks up to 8 m from its anchor, pauses 2–5 s | notices → `alert` |
| `patrol` | walks a route (§5.9) | notices → `alert` |
| `graze` | temperament `wary`/`skittish` only: eats, looks up every 4–7 s | player inside `alertRange` → `watch` or `flee` |
| `watch` | wary/territorial: faces the player, plays a warning (bark, raised head, rattle) for **2.0 s** | player comes inside `warnRange` or hits it → `alert`; player backs off → `graze` |
| `alert` | stops, turns to the noise or sight, eyes 100%, plays its notice bark and sound, tells its pack | reaction time over (swarm 0.2 s, melee 0.35 s, brute 0.5 s, caster 0.4 s) → `engage` |
| `engage` | moves to its role's range and uses attacks (§5.8) | target dead/gone → next on threat table; no target → `search`; leash → `return`; health < `fleeAt` → `flee` |
| `search` | walks to the last place it saw its target, looks around 6 s | notices → `alert`; timer → `return` |
| `flee` | runs away (Farhold town-line rule, the `fleeAt` rule of some beasts, a **rout**) | timer (2.5–6 s) → `engage` if still wild and had a target, else `return` |
| `return` | "evade": runs back to its anchor at 1.5 × speed, **immune to damage and effects**, threat wiped, heals to full over the run (instant on arrival) | reaches anchor → `idle` |
| `stagger` | stunned/staggered (reuse `js/combat-feel.js` stagger with diminishing returns) | timer |
| `dead` | death anim, loot, corpse stays 60 s (120 s for elites and up) for looting and necromancer corpses | — |

### 5.2 Temperament (who starts the fight)

(reuse: Farhold `BESTIARY-IDEAS.md` §1, which asked for exactly these three.)

| Temperament | Behaviour | alertRange | warnRange | Example |
|---|---|---|---|---|
| `hostile` | attacks on notice | = aggro radius | — | most monsters |
| `territorial` | ignores you, then warns 2.0 s, then attacks | aggro × 1.5 | aggro × 0.6 | Thicket Boar, Glacier Maw, Crag Bear |
| `wary` | watches, backs away, fights only if hit or cornered (< 3 m) | aggro × 1.2 | 3 m | Dread Stag, Ashhorn Ox |
| `skittish` | flees at alertRange, never attacks, drops hide and meat | 20 m | — | Orchard deer, Dune hare (ambient, not listed) |
| `passive` | never attacks, never flees (livestock, set dressing) | — | — | cattle, sheep (ambient) |

Ambient wildlife (deer, hares, cattle, gulls, fish jumps) is scenery with loot and is listed in page 17's
environment art, not here. It never has an id with `m_`.

### 5.3 Senses and aggro radius

- **Sight.** A 150° front cone at full aggro radius; the 210° behind at **40%**. Line of sight from the
  monster's eye to the player's chest; foliage cuts range to 70%. There is no darkness penalty: the world
  is always daylight and dark places are only dark-looking (00 §4).
- **Hearing.** Noises reach every awake monster within the radius regardless of facing: sprint 12 m,
  basic attack hitting 18 m, spell cast 22 m, explosion or boss yell 40 m, horn/bell 60 m. Hearing turns
  a monster to `alert` facing the source; it only engages with sight or after 3 s of searching.
- **Aggro radius** by role/rank: swarm 14 m, melee 16 m, brute 14 m, ranged/caster 22 m, healer 18 m,
  elite 22 m, champion 20 m (the whole pack wakes together, §5.5), rare/named 24 m, a greater-rarity
  carrier 24 m.
- **Level difference.** −1 m per level the player is above the monster (floor 6 m), +1 m per level below
  (cap +8 m). A player 8+ levels above a normal monster is ignored unless they attack it (grey monster,
  reuse Farhold R22 "grey-con" XP rule for the feel).
- **Concealment** (page 05 owns which effects grant it) multiplies the radius by `max(0.25, 1 − concealment)`
  (reuse: Farhold `js/actors.js` stealth formula).

### 5.4 Leash and return

- Every monster has an **anchor** (spawn point, or its patrol route's nearest point).
- **Leash distance** from the anchor: normal/swarm **40 m**, elite/champion **55 m**, rare/named **70 m**,
  patrol members 40 m from their current route point. Flying +15 m.
- Also returns if: it has not hit or been hit for **10 s** while engaged; it cannot find a path to any
  threat target for **4 s** (the "stuck on a rock" fix); or its target crosses a town watch line (reuse).
- `return` is an evade: immune, threat wiped, full heal. A monster that returns **three times in 60 s**
  stays at its anchor for 20 s and will not re-engage (stops kiting exploits).
- **Dungeon monsters never leash** out of their room; bosses lock their arena (page 11 §11).

### 5.5 Packs, social aggro and calling for help

- **Pack**: bodies spawned together share a `packId`. Any member alerting alerts the **whole pack**,
  whatever the distance (fixes Farhold's "hit a brute, its archers stand about", R27 M10).
- **Social aggro**: a monster of the **same family** within **10 m** with line of sight to the fight joins
  it (it saw its kind being hit). Swarms: 14 m. Different families never social-aggro each other.
- **Band wake** (warbands and the Kingsfire Legion only): every monster linked to the same leader within
  **40 m** joins (reuse: Farhold R27 M10 `awakeBands`).
- **Calling for help** (trait `caller`): a 2.0 s interruptible cast ("Call the Pack", gold border cast bar
  on its nameplate); on success, the nearest idle pack of its family within **35 m** runs in. Once per fight.
- **Pulling**: hitting any member, or entering its aggro radius, pulls the pack. A ranged or caster
  monster that loses line of sight to its target for 2 s walks to regain it — so breaking line of sight
  around a corner pulls casters into melee (the classic "line-of-sight pull" works on purpose).
- **Pack spacing** at spawn: Farhold `zones.packRadius` 9 m (reuse). Two packs never spawn within 30 m of
  each other in levelling regions (1–5), 22 m later, so a careful player can pull one at a time.

### 5.6 Threat (who it attacks)

Page 05 owns the threat numbers. Monsters read them this way:

1. **Taunt** forces the target for its duration (usually 3 s) and sets the taunter's threat to the top + 10%.
2. Otherwise the monster attacks the **top of its threat table**; it switches only when someone passes
   **110%** of the current target's threat in melee range, or **130%** outside melee (the "pull-off"
   margins).
3. Ties go to the **nearest body in the way** (reuse: Farhold `aimOf` rule 2, `THREAT_BLOCK` 1.6 m).
4. Followers and pets are on the table like players (reuse: Farhold R22 `taunt` for pets).
5. **Fixates** (page 11 `mech_fixate_chase`, `mech_fixate_explode`) and **Ignore threat** attacks (a rogue flanker's "go for the
   healer" lunge) are the only exceptions and are always telegraphed with a yellow targeted marker.
6. Healers who heal an engaged player gain threat on **every monster fighting that player** (page 05's
   share); a monster not yet engaged is never pulled by a heal alone.

### 5.7 Attack tokens (crowds stay fair)

(reuse idea: Lanternfall 05 §4.1.) Each player holds **3 melee tokens** and **2 ranged tokens** in the open
world (dungeons: 4 and 3; tanks with a taunt active: unlimited). A monster must hold a token to start a
wind-up; it returns the token when its recovery ends. Without one it **circles** 4–7 m out (melee) or
repositions (ranged), and may still move, block or be hit. Swarm members cost 0.5. Bosses and elites
ignore tokens. This means a solo player pulling six melee monsters takes at most three swings at a time.

### 5.8 Attacks: wind-up, active, recovery

Every special attack is **wind-up → active → recovery** (reuse: Farhold R14 three-part swing,
`js/combat-feel.js`).

- **Wind-up** is the telegraph: body pose + (for area attacks) a ground marker from page 11 + a sound.
- **Recovery** is the punish window: at least **0.4 s** for any attack ≥ 15% RH, **0.8 s** for ≥ 30% RH.
- A **stagger** during wind-up cancels the attack (bosses excepted — page 11 §12.2 break bar).
- Attack choice: weighted pick among attacks whose range and cooldown allow it; a monster never repeats
  the same special twice in a row unless it has only one.

### 5.9 Patrols

- **Road patrols**: war parties of 3–5 (Farhold `warbands.patrolSize`) walk the region's longest road
  stretch there and back (reuse: Farhold R27 M9 `routeAlongRoads`). Speed 3.0 m/s, pause 4 s at each end.
- **Beat patrols**: one elite or champion walking a loop of 4–8 authored points around a landmark.
- A patrol that passes a pack already fighting **joins** (it heard it). Patrol routes never cross a quest
  hub's watch line and never pass within 25 m of a travel station or a respawn point (page 20).
- Patrols are drawn on the minimap as a moving dot only when the player has line of sight to them.

### 5.10 Always daylight (was: Night)

Removed in round 2 (00 §4, §12.3). There is no day/night cycle, so there is no night table, no night-only
monster, no night spawn density, no night multiplier on rarity chances and no night aggro change. Every
monster that used to be marked ☾ spawns all day in its region. Named rares that used to wait for night now
wait for a **world condition** instead (§8). Road ambushes are page 14's events and are not tied to a time
of day.

### 5.11 Spawning and respawn

- **Density** per region: 1 pack per ~2,500 m² of wild ground in levelling regions (1–5), 1 per 3,200 m²
  in 6–11 (packs get bigger instead).
- **Respawn** 90 s (swarm) / 3 min (normal) / 6 min (elite) after death, multiplied by
  `max(0.35, 1 − 0.08 × (players within 60 m − 1))` so crowded quest spots refill faster.
- Nothing spawns within **30 m** of a player who can see the spot, or inside a town's watch line (reuse:
  Farhold `wild()`).
- **Tapping**: the first player/group to damage a monster owns its loot and XP credit; any player who
  deals ≥ 10% of its health also gets quest credit (so shared quest kills are never stolen).

### 5.12 Scaling to group size (open world)

| What | Solo | Scaling | Cap |
|---|---|---|---|
| normal/swarm health | ×1 | none | — |
| pack size of **new** spawns near a group | base | +1 body per 2 extra group members | +2 |
| elite / champion / rare / named health | ×1 | **× (1 + 0.6 × (n − 1))**, n = players in the tagging group | n = 5 |
| damage | ×1 | none (the tank takes it) | — |
| mechanic counts (targeted circles, adds per wave) | base | +1 when n ≥ 3 | +1 |
| followers | count as **0.5** players each for health scaling | | |

World bosses scale on [page 13](13-WORLD-BOSSES.md) using page 11 §22's rule.

### 5.13 Performance budget

Server think rate 10 per second per engaged monster, 2 per second idle; up to 60 engaged monsters per
region shard before extra ones go to 5 per second. The client animates only bodies within 120 m (reuse:
Farhold's ring model; `js/mesh-merge.js` one mesh per material for creatures).

---

## 6. Region monster lists

Legend: ⚑ = warband ground · tameable rows are listed in §3.2 and Demon/Undead tags in §3.1 · (reuse: `farhold id`) = body and base stats from Farhold's
`enemies.json` · **Temp** = temperament (h hostile, t territorial, w wary) · Loot = `bases` (item bases
reused from Farhold) + reagent/trophy. Every region also rolls its normal regional loot table
([page 08](08-ITEMS.md)).

### 6.1 Hearthvale (1–6) — farm valley, orchards, a river

Gentle on purpose: one special per monster, 2.0 s+ warnings, champion packs 6% and rares 1.5% with **stat
affixes only** (no mechanic affixes below level 8), and no greater rarities except the odd Gilded runner (§7.7).

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_beast_moor_hound` | Moor Hound | 1–5 | creature: hound ×1.6, body #6a5c4a (reuse: `moor_hound`) | melee, pack 2–4 | 0.8 | 4% | h | `it_rough_hide`, bases dagger, light_boots |
| `m_beast_cairn_gnawer` | Cairn Gnawer | 1–4 | creature: rat ×3.2 (reuse: `cairn_rat`) | swarm, pack 4–7 | 0.3 | 2% | h | `it_beast_fang` |
| `m_beast_thicket_boar` | Thicket Boar | 2–6 | creature: boar ×2.2 (reuse: `thicket_boar`) | brute, pack 1–2 | 2.0 | 9% | t | `it_rough_hide`, bases light_chest |
| `m_beast_orchard_rook` | Orchard Rook | 2–5 | creature: owl ×1.5, body #1e1e24, beak #c8a040 | melee, flying, pack 2–3 | 0.7 | 4% | h | `it_rook_feather` |
| `m_beast_river_croaker` | River Croaker | 1–5 | creature: frog ×1.8 (reuse: `fen_croaker`) | melee, pack 2–3 | 0.9 | 4% | h | `it_beast_fang` |
| `m_beast_furrow_worm` | Furrow Worm | 3–6 | creature: worm ×1.6, body #7a5a4a | melee, burrower, ambusher, pack 1 | 1.2 | 6% | h | `it_beast_fang`, bases ring |
| `m_folk_road_brigand` | Road Brigand | 3–6 | chibi: human · rogue (hood, cloth mask) (reuse: `road_brigand`) | melee, pack 2–3 | 1.0 | 5% | h | `it_stolen_coin`, bases sword, dagger, light_chest |
| `m_folk_brigand_archer` | Brigand Archer | 3–6 | chibi: human · ranger (reuse: `brigand_archer`) | ranged | 0.8 | 5% | h | `it_stolen_coin`, bases shortbow, quiver |
| `m_undead_barrow_shambler` | Barrow Shambler | 4–6 | chibi: undead · rags, bare feet, held rusty sword | melee, pack 2–4 | 1.1 | 5% | h | `it_grave_dust`, bases sword |
| `m_fae_will_light` | Will-light | 3–6 | creature: wisp ×1.4, body #c8f0a0 | caster, support (lure) | 0.6 | 6% | h | `it_moonpetal` |

⚑ Warband presence: **Sootwick Gang** from level 3 in the east orchards (§9.2).

**Abilities**

- **Moor Hound** — *Lunge*: crouches 2.0 s (ears back, growl sfx), red line 6 m × 1.5 m, 8% RH + knocked
  down 0.5 s. AI: packs flank; when the pack is down to one it flees at 25% health for 4 s, then returns.
- **Cairn Gnawer** — no specials. AI: swarms, scatters for 1.5 s when half the swarm dies inside 2 s.
- **Thicket Boar** — *Gore Charge*: paws the ground 2.0 s, red **line** 12 m × 2 m from it to its target;
  charges at 12 m/s, 14% RH + knockback 4 m. Cannot turn during the charge; hits the first body. Recovery
  1.0 s (dizzy stars, reuse `STATUS_FX.dazed`). AI: territorial — snorts and scrapes 2.0 s first.
- **Orchard Rook** — *Peck Eyes*: 4% RH + `blind` 2 s (misses 30% of basic attacks). 6 s cooldown. Flies at 2 m;
  any stun drops it to the ground for 3 s.
- **River Croaker** — *Tongue Snare*: 2.0 s throat swell, yellow **targeted** line on one player 10 m;
  pulls them 5 m toward it and roots 1 s. Dodge roll sideways breaks it.
- **Furrow Worm** — *Burst Up*: travels under the field as a moving ridge (visible soil spray, 5 m/s);
  surfaces under its target with a **red circle** 3 m, 2.0 s fill; 12% RH + knock up 0.6 s. Goes under
  again after 8 s of fighting. Untargetable while under.
- **Road Brigand** — *Dirty Trick*: throws dust, 5 m cone red 2.0 s, `blind` 2 s. AI: at 30% health one
  brigand of each pack **yields** (drops weapon, kneels 6 s) — a player may spare it (+Vale Wardens
  reputation, page 07) or finish it.
- **Brigand Archer** — *Aimed Shot*: 2.0 s draw, yellow **targeted** line 30 m on one player, 10% RH.
  Breaking line of sight cancels it.
- **Barrow Shambler** — *Grave Grasp*: when killed, 30% chance a hand grabs the nearest player's ankle:
  root 1.5 s, no damage. AI: slow (3.6 m/s), never flees.
- **Will-light** — *Lure*: drifts away at exactly walk speed, glowing; if followed 20 m it stops beside
  a sleeping pack. *Spark*: 6% RH bolt, 1.5 s cast. Killing it before it stops gives `it_moonpetal` ×2.

### 6.2 Mossfen (5–12) — marsh, peat, stilt villages

The first region with void zones (bog pools) and the first interruptible casters.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_fen_bog_slime` | Bog Slime | 5–10 | creature: slime ×2.0, variant moss_slime (reuse: `bog_slime`) | brute | 1.8 | 8% | h | `it_bog_resin` |
| `m_fen_reed_serpent` | Reed Serpent | 6–11 | creature: snake ×2.4 (reuse: `reed_serpent`) | melee, ambusher | 1.0 | 6% + poison | h | `it_beast_fang`, bases dagger |
| `m_fen_silt_lurker` | Silt Lurker | 8–12 | creature: crocodile ×2.6 (reuse: `silt_lurker`) | brute, ambusher | 2.4 | 12% | t | `it_rough_hide`, bases medium_chest |
| `m_fen_marsh_wisp` | Marsh Wisp | 5–10 | creature: wisp ×1.6 (reuse: `marsh_wisp`) | caster | 0.75 | 7% | h | `it_bog_resin` |
| `m_fen_mirecap` | Mirecap | 7–12 | creature: mushroom ×2.2 (+feature `burst`), body #a6a060 | brute | 1.6 | 8% | h | `it_spore_sac` |
| `m_fen_peatwife` | Peatwife | 8–12 | chibi: undead · warlock (shawl, held staff_totem, bog-green) | healer, support | 0.8 | 3% | h | `it_cult_token`, bases staff, wand |
| `m_fen_bog_tick` | Bog Tick | 6–10 | creature: spider ×1.4, body #3a4a2a translucent | swarm, pack 6–10 | 0.3 | 2% + poison | h | `it_spore_sac` |
| `m_fen_rot_kite` | Rot Kite | 7–12 | creature: moth ×1.8, body #8a8a50 | ranged, flying | 0.8 | 5% | h | `it_spore_sac` |
| `m_fen_sump_crawler` | Sump Crawler | 9–12 | creature: centipede ×2.4, variant burrow_centipede, wet sheen | melee | 1.2 | 6% | h | `it_dune_chitin` |
| `m_fen_bog_lantern` | Bog Lantern | 8–12 | creature: wisp ×2.0, body #ff9a40 | caster, caller | 0.7 | 7% fire | h | `it_bog_resin` |
| `m_demon_bog_imp` | Bog Imp | 6–12 | creature: imp ×1.4, peat-brown #5a4a2a, eyes #ffb040 | caster, thief | 0.6 | 6% fire | w | `it_brimstone`, `it_bog_resin` |

⚑ Warband presence: **Sootwick Gang** on the stilt-village causeways (levels 5–12).

**Abilities**

- **Bog Slime** — *Split*: at 50% health splits into 2 Bog Slimelings (swarm, HP ×0.3, 3% RH).
  *Engulf*: 2.0 s bulge, red circle 3 m on itself, 12% RH + slow 40% 3 s.
- **Reed Serpent** — ambusher in reeds (only its eyes show). *Venom Strike*: 6% RH + `poison` 2% RH/s for 6 s.
- **Silt Lurker** — hides under water with only its back ridge showing. *Death Roll*: 2.0 s jaw-open
  (red **cone** 4 m, 60°); 18% RH + pulled under (stun 1.5 s, not in deep water — it never drowns you).
  Territorial: tail slaps the water 2.0 s as a warning.
- **Marsh Wisp** — *Marsh Bolt* 7% RH, 1.5 s cast, **interruptible** (gold border). *Will-o-Hop*: teleports
  8 m when a player closes to melee, 10 s cooldown.
- **Mirecap** — *Spore Burst* on death: a **void zone** 4 m, poison, **3% RH every 0.5 s**, lasts 8 s;
  warm-up 1.0 s (rim only). Kill it at range or step out. *Slam*: red circle 3 m, 2.0 s, 10% RH.
  (reuse idea: `BESTIARY-IDEAS.md` Bloom Host.)
- **Peatwife** — *Mend the Fen*: heals an ally 12% max health, 1.8 s cast, interruptible, 6 s cooldown.
  *Peat Ward*: a 20% max-health shield on the ally with the most threat, 2.0 s cast, 15 s cooldown.
  Priority target (her nameplate carries a green cross icon).
- **Bog Tick** — *Latch*: a tick that lands a hit sticks for 4 s (1% RH per 0.5 s); a dodge roll shakes all off.
- **Rot Kite** — *Spore Trail*: flies a straight 14 m pass over the players, leaving a **void zone line**
  2 m wide × 14 m, poison 2% RH per 0.5 s, 10 s. Warm-up 1.0 s. 12 s cooldown. (reuse: `BESTIARY-IDEAS.md`.)
- **Sump Crawler** — +40% speed and +20% damage in water; −40% speed on dry ground (fight it on the bank).
- **Bog Lantern** — *Call the Fen*: caller (2.0 s interruptible, 35 m). *Swamp Fire*: 7% RH fire bolt.
- **Bog Imp** (tag Demon, §3.3) — a thief from the stilt villages: wary, runs from a player until cornered or hit.
  *Peat Spark*: 6% RH fire bolt, 1.5 s, interruptible. *Snuff*: a 1.0 s hiss, then cuts the cast of the nearest
  player casting within 25 m (20 s cooldown). Carries 1–3 stolen village goods (quest items, page 14).

### 6.3 Greyridge Highlands (10–18) — hills, dwarf mines, quarries

Constructs arrive: armour-facing, frontal shields, first **tank-busters** on elites.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_construct_shale_warden` | Shale Warden | 12–18 | creature: turtle ×2.6 (reuse: `shale_warden`) | brute | 2.6 | 10% | t | `it_rune_plate`, bases heavy_chest |
| `m_construct_bellows_sentry` | Bellows Sentry | 13–18 | creature: golem ×1.8, core glow #ff8030 | caster | 1.0 | 7% fire | h | `it_brass_cog`, bases hammer |
| `m_construct_tram_turret` | Tramway Turret | 14–18 | creature: turret ×1.6 | ranged | 0.9 | 6% | h | `it_brass_cog`, bases crossbow |
| `m_beast_ironback_beetle` | Ironback Beetle | 10–15 | creature: beetle ×2.2 (reuse: `ironback_beetle`) | brute | 2.0 | 9% | h | `it_dune_chitin`, bases heavy_boots |
| `m_beast_ridge_hyena` | Ridge Hyena | 10–14 | creature: hyena ×1.9 (reuse: `crag_hyena`) | melee, pack 3–5 | 0.9 | 5% | h | `it_rough_hide` |
| `m_beast_crag_bear` | Crag Bear | 12–17 | creature: bear ×2.4 | brute | 2.4 | 11% | t | `it_rough_hide`, bases medium_chest |
| `m_folk_blackshaft_miner` | Blackshaft Miner | 11–16 | chibi: dwarf · runesmith (smith apron, held pick) | melee | 1.1 | 6% | h | `it_stolen_coin`, bases hammer, heavy_gauntlets |
| `m_folk_blackshaft_powderwife` | Blackshaft Powderwife | 13–18 | chibi: dwarf · tinker (goggles, bandolier) | caster | 0.8 | 8% | h | `it_brass_cog`, bases crossbow, ring |
| `m_undead_barrow_hound` | Barrow Hound | 13–18 | creature: dire_wolf ×2.0 (reuse: `barrow_hound`) | melee, pack 2–3 | 1.0 | 6% | h | `it_grave_dust`, `it_bone_shard` |
| `m_beast_gallows_owl` | Gallows Owl | 10–14 | creature: owl ×1.8 (reuse: `gallows_owl`) | melee, flying | 0.9 | 5% | h | `it_rook_feather` |
| `m_beast_grey_wolf` | Grey Wolf | 10–16 | creature: wolf ×2.0, body #6a6a6a | melee, pack 3–5 | 0.9 | 5% | h | `it_rough_hide`, `it_beast_fang` |

⚑ Warband presence: **Sootwick Gang** in the mines (to 16); **Unburied Legion** at the barrows (12–18, §9.3).

**Abilities**

- **Shale Warden** — *Shell Up*: at 50% health withdraws 4 s: takes 80% less damage from the front,
  full damage from behind. *Quarry Slam*: 2.0 s rear-up, red circle 5 m, 16% RH + stagger 1 s.
- **Bellows Sentry** — *Bellows Breath*: 2.0 s intake (vents glow), red cone 8 m 70°, 14% RH fire +
  `burn` 2% RH/s 4 s. Rooted in place (a machine bolted down); turns at 90°/s — circle it.
- **Tramway Turret** — rolls along mine rails only. *Rivet Burst*: 3 shots at 0.3 s intervals, 5% RH
  each, after a 1.5 s spin-up with a yellow targeted line. Destroyed turrets leave `it_brass_cog` ×2.
- **Ironback Beetle** — frontal armour: 60% less damage from the front 120°. *Horn Toss*: red cone 3 m,
  2.0 s, 12% RH + knock up. Teaches positioning (reuse: `BESTIARY-IDEAS.md` Geode Brood idea).
- **Ridge Hyena** — *Laugh*: when one hyena drops below 30%, the pack gains +20% attack speed 6 s.
- **Crag Bear** — *Rending Paws*: two claw strikes 0.5 s apart after a 2.0 s rear-up, red cone 4 m 90°, 12% RH each.
  Territorial roar 2.0 s.
- **Blackshaft Miner** — *Blasting Cap*: throws a charge, red circle 4 m at a player, 2.0 s fill, 12% RH.
- **Blackshaft Powderwife** — *Powder Keg*: rolls a keg that stops 6–10 m out: red circle 6 m, 3.0 s,
  **30% RH** + knockback 6 m. A player hitting the keg first detonates it early (it hurts monsters too).
  *Fuse Line*: interruptible 2.0 s cast that lights all kegs at once.
- **Barrow Hound** — *Howl of the Barrow*: caller (undead family). *Grave Bite*: 6% RH + `curse`
  (−15% healing received 6 s, dispellable curse).
- **Gallows Owl** — *Dive*: climbs 3 s then dives at a yellow targeted player: 2.0 s, circle 2 m, 10% RH.
- **Grey Wolf** — *Pack Howl*: when one is hit, the pack's next bites deal +20% for 6 s (a howl the whole valley
  hears). Packs flank; the last wolf flees at 25% health.

### 6.4 Highcourt (capital city, any level)

No hostile spawns inside the walls (town watch line covers the whole city). The only monsters are:
the duelling ring (friendly duels only, page 15) and event invasions (page 14) that borrow bodies from any list on this page at the
invading faction's level. Not one of the 11 region lists.

### 6.5 Sunscar Barrens (16–24) — desert, mesas, glass tombs

Burrowers, glass that reflects, and heat. The first region where monsters dispel player buffs.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_sand_dune_centipede` | Dune Centipede | 16–20 | creature: centipede ×2.6 (reuse: `dune_centipede`) | melee | 1.1 | 6% + poison | h | `it_dune_chitin` |
| `m_sand_sunscar_stinger` | Sunscar Stinger | 17–22 | creature: beetle ×2.0 (+feature `stinger`), body #c89a50 | melee | 1.2 | 6% | h | `it_dune_chitin`, bases dagger |
| `m_sand_dune_breacher` | Dune Breacher | 20–24 | creature: worm ×3.6, body #c8a070 | brute, burrower | 3.0 | 13% | h | `it_dune_chitin`, bases heavy_chest |
| `m_sand_carrion_glider` | Carrion Glider | 16–22 | creature: owl ×2.2, body #5a3a2a, head bare #c07060 | melee, flying | 0.9 | 5% | h | `it_rook_feather` |
| `m_sand_dune_fennec` | Dune Fennec | 16–20 | creature: hyena ×1.6, variant ember_fennec | melee, pack 3–5 | 0.8 | 5% | h | `it_rough_hide` |
| `m_sand_glass_shard` | Glass Shard | 18–24 | creature: shard ×1.8 (reuse: `glass_shard`) | caster | 0.8 | 8% | h | `it_sunglass` |
| `m_sand_tomb_warden` | Tomb Warden | 20–24 | creature: golem ×2.4, sandstone #c8b080, core #60e0ff | brute, support | 2.6 | 11% | h | `it_sunglass`, `it_rune_plate` |
| `m_undead_wrapped_dead` | Wrapped Dead | 18–24 | chibi: undead · priest (linen wraps top/bottom, gold circlet) | melee | 1.2 | 6% + curse | h | `it_grave_dust`, bases staff |
| `m_folk_dust_reaver` | Dust Reaver | 17–23 | chibi: human · rogue (headwrap, scimitar sword) | melee, pack 2–3 | 1.0 | 6% | h | `it_stolen_coin`, bases rapier, sword |
| `m_sand_mirage_walker` | Mirage Walker | 19–24 | chibi: human · shimmering traveller (travel_cloak, heat-haze shader) | caster, ambusher | 0.9 | 8% | h | `it_sunglass` |
| `m_sand_glass_caller` | Glass Caller | 20–24 | creature: imp ×1.6, obsidian #1a1a22, eyes #ff6030 | support, caller | 0.7 | 4% | h | `it_sunglass` |
| `m_sand_scrub_raptor` | Scrub Raptor | 16–22 | creature: raptor ×2.0 (new biped-runner body, shared with the mount raptor, page 08), body #b08a5a | melee, pack 2–4 | 0.9 | 6% | h | `it_rough_hide`, `it_beast_fang` |
| `m_demon_glass_imp` | Glass Imp | 16–24 | creature: imp ×1.4, obsidian #1a1a22, glass shards on the back | caster | 0.6 | 6% fire | h | `it_sunglass`, `it_brimstone` |

⚑ Warband presence: **Unburied Legion** at the tomb edges (19–24); **Thornmane Packs** on the mesas (20+).

**Abilities**

- **Dune Centipede** — *Coil*: wraps a player 1.5 s (root, 3% RH per 0.5 s); any hit of ≥ 5% of its health frees them.
- **Sunscar Stinger** — *Tail Sting*: 2.0 s tail raise, red line 4 m, 10% RH + `poison` 2% RH/s 8 s (dispellable poison).
- **Dune Breacher** — moves under sand as a visible ridge at 7 m/s (outrun it by sprinting). *Breach*: red
  circle 5 m, 2.5 s fill, **28% RH** + knock up 1 s. After breaching it is exposed for 6 s (takes +25% damage).
  (reuse: `BESTIARY-IDEAS.md` Dune Breacher.)
- **Carrion Glider** — circles until a player drops below 50% health, then dives on them (targeted 2.0 s, 9% RH).
- **Dune Fennec** — *Sand Kick*: 3 m cone, `blind` 2 s. Pack of 3–5; flees when alone.
- **Glass Shard** — *Refract*: every 12 s, for 3 s, reflects 40% of spell damage back at the caster
  (the shard turns mirror-silver, ringing sfx — stop casting). *Sunlance*: 8% RH bolt, 1.5 s, interruptible.
- **Tomb Warden** — *Ward of the Tomb*: gives allies within 10 m a 25% max-health shield, 2.5 s cast,
  interruptible, 20 s cooldown. *Sand Slam*: red circle 5 m, 2.0 s, 15% RH.
- **Wrapped Dead** — *Unwind*: at 30% health unwraps, +30% speed, `curse` on hit (−20% healing 6 s).
- **Dust Reaver** — *Disarm*: 2.0 s wind-up, red cone 3 m: `disarm` 3 s (weapon basic attacks disabled; spells still work).
- **Mirage Walker** — looks like a friendly traveller (green name) until a player comes within 10 m, then
  turns hostile with *Heat Shimmer*: **dispels 1 beneficial effect** from each player within 8 m (2.0 s,
  visible haze ring, no damage). *Scorch*: 8% RH fire bolt, 1.5 s, interruptible.
- **Glass Caller** — *Scream*: 2.0 s interruptible; calls the nearest pack within 35 m. No damage worth
  naming; kill or interrupt first (reuse: `BESTIARY-IDEAS.md` Glass Caller). Its Scream also brings every
  Glass Imp within 35 m.
- **Scrub Raptor** — *Rend*: a 3-hit flurry on one player, 0.4 s apart, 4% RH each + `bleed` 1% RH/s 6 s;
  packs split to hit the two players furthest apart.
- **Glass Imp** (tag Demon, §3.3) — *Glare*: yellow targeted 2.0 s, `blind` 3 s (look away from it — turning
  your back to it during the wind-up avoids it). *Glass Spark*: 6% RH fire bolt, 1.5 s, interruptible.

### 6.6 Whisperwood (22–30) — old elven forest, moonwells

The Gloamward (elves who never came out of the old forest) fight as a party: melee, archer, druid-healer.
First **line-of-sight** and **pull** monsters.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_fae_thorn_sprite` | Thorn Sprite | 22–26 | creature: imp ×1.4, body #4a8a3a, wings | swarm, pack 6–9 | 0.3 | 2% | h | `it_moonpetal` |
| `m_fae_moonwell_wisp` | Moonwell Wisp | 22–28 | creature: wisp ×1.6, body #c0d8ff | healer | 0.8 | 3% | h | `it_moonpetal` |
| `m_fae_dread_stag` | Dread Stag | 24–30 | creature: deer ×2.6, antlers, eyes #ff4040 (reuse: `dread_stag`) | melee | 1.4 | 8% | w | `it_rough_hide`, bases bow |
| `m_fae_shroud_spider` | Shroud Spider | 22–27 | creature: spider ×2.2 (reuse: `veil_spider`) | melee, ambusher | 1.0 | 6% + poison | h | `it_gloam_silk` |
| `m_fae_moon_mushroom` | Moon Mushroom | 23–28 | creature: mushroom ×2.0, variant moon_mushroom | caster | 0.8 | 7% | h | `it_spore_sac` |
| `m_fae_vine_hauler` | Vine Hauler | 25–30 | creature: horror ×2.6, body #2a4a1a, tentacles 6, rooted | brute | 2.4 | 10% | h | `it_moonpetal`, bases staff |
| `m_fae_gloam_sentinel` | Gloamward Sentinel | 24–30 | chibi: elf · ranger (hood, held longbow) | ranged | 0.8 | 6% | h | `it_gloam_silk`, bases bow, quiver |
| `m_fae_gloam_blade` | Gloamward Blade | 24–30 | chibi: elf · rogue (twin daggers) | melee | 1.0 | 6% | h | `it_gloam_silk`, bases dagger, rapier |
| `m_fae_gloam_druid` | Gloamward Druid | 26–30 | chibi: elf · druid | healer | 0.8 | 4% | h | `it_moonpetal`, bases staff, orb |
| `m_beast_grove_owl` | Grove Owl | 22–26 | creature: owl ×2.0, body #d8d0c0 | melee, flying | 0.9 | 5% | h | `it_rook_feather` |

⚑ Warband presence: **Thornmane Packs** hold the eastern forest (22–30).

**Abilities**

- **Thorn Sprite** — *Nettle Cloud*: 5 sprites or more in a 4 m cluster form a void zone under them that
  follows them (1% RH per 0.5 s). Area spells split them.
- **Moonwell Wisp** — heals 12% ally max health (1.8 s interruptible); *Moonshroud*: makes one ally untargetable
  2 s after it drops under 20% (once per fight).
- **Dread Stag** — wary; if struck: *Antler Rush*: red line 14 m × 2.5 m, 2.0 s, 16% RH + knockback 5 m.
- **Shroud Spider** — ambusher in canopy; drops on a player (red circle 2 m, 2.0 s fill as the thread shows),
  9% RH. *Web*: yellow targeted 2.0 s, root 2 s.
- **Moon Mushroom** — *Sleep Spores*: 2.5 s interruptible cast, green-less purple puff 6 m circle red:
  `sleep` 4 s (breaks on damage). Never cast on a player already slept in the last 20 s.
- **Vine Hauler** — rooted; never moves. *Haul*: every 10 s, a vine at a yellow-targeted player 18 m out
  (2.0 s), pulls them to 3 m and roots 1.5 s. *Crush*: red circle 4 m around itself, 2.0 s, 18% RH.
  Fight it at range or from inside. (reuse: `BESTIARY-IDEAS.md` Vine Hauler.)
- **Gloamward Sentinel** — *Pinning Arrow*: yellow targeted 2.0 s, 8% RH + root 1 s. Loses line of sight → walks to regain.
- **Gloamward Blade** — *Gloamstep*: once per fight, appears behind the lowest-health player (1.0 s
  smoke puff where it will appear — a small red circle 1.5 m), 10% RH. The only open-world monster that
  ignores threat once.
- **Gloamward Druid** — *Greening*: 12% heal (interruptible). *Bark Hide*: ally takes −30% damage 6 s
  (dispellable magic buff).
- **Grove Owl** — silent flight (no hearing cue); *Talon* 7% RH + `bleed`.

### 6.7 Cinder Steppe (28–36) — ash grassland, orc war camps

The Ashtusk Warhost's home. Beasts here are big, ride in with orcs, and burn the grass.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_beast_ash_hyena` | Ash Hyena | 28–32 | creature: hyena ×2.0, body #4a4038 | melee, pack 3–5 | 0.9 | 5% | h | `it_rough_hide` |
| `m_beast_steppe_saber` | Steppe Saber | 29–34 | creature: saber_cat ×2.4 | melee, ambusher | 1.3 | 7% | h | `it_rough_hide`, bases dagger |
| `m_beast_cinder_hound` | Cinder Hound | 30–35 | creature: hound ×2.0, glow #ff7020 | melee, pack 2–4 | 1.0 | 6% fire | h | `it_cinder_core` |
| `m_kingsfire_ash_wisp` | Ash Wisp | 30–36 | creature: wisp ×1.8 (reuse: `ash_wisp`) | caster | 0.75 | 8% fire | h | `it_cinder_core` |
| `m_beast_cinderback_boar` | Cinderback Boar | 31–36 | creature: boar ×2.8, tusks, mane, body #3a2418 | brute | 2.6 | 12% | t | `it_rough_hide`, bases axe2h |
| `m_dragon_steppe_drake` | Steppe Drake | 32–36 | creature: drake ×2.6 (reuse: `mire_drake`), body #6a4a2a | brute | 2.8 | 12% | h | `it_dragon_scale`, bases scaled_chest |
| `m_beast_ashhorn_ox` | Ashhorn Ox | 28–34 | creature: elk ×2.4, body #3a3028, no antlers → horns (+feature) | brute | 2.4 | 11% | w | `it_rough_hide` |
| `m_beast_cinder_moth` | Cinder Moth | 28–33 | creature: moth ×2.0, body #6a2a10, glow | ranged, flying | 0.8 | 6% fire | h | `it_cinder_core` |
| `m_undead_burnt_wanderer` | Burnt Wanderer | 30–35 | chibi: undead · rags, charred #2a2020 | melee | 1.1 | 6% + burn | h | `it_grave_dust` |
| `m_beast_ash_raptor` | Ash Raptor | 28–34 | creature: raptor ×2.2, body #3a3a3a, crest #c05020 | melee, pack 2–4 | 1.0 | 7% | h | `it_rough_hide`, `it_beast_fang` |
| `m_demon_ash_hound` | Ash Hound | 28–36 | creature: hound ×2.0, ash-grey #2a2420, small horns (+feature) | melee, fast, pack 2–3 | 0.9 | 6% | h | `it_demon_horn`, `it_brimstone` |

⚑ Warband presence: **Ashtusk Warhost** holds most of the region (28–40, §9.5). 11 region monsters + 7 Ashtusk
members = 18 on the list.

**Abilities**

- **Ash Hyena** — *Ash Kick*: cone 3 m, `blind` 2 s. Follows orc patrols as scouts (+1 per Ashtusk patrol).
- **Steppe Saber** — ambusher in tall grass. *Pounce*: from 12 m, red circle 2 m on its target, 2.0 s
  (the grass parts in a line), 14% RH + knockdown 1 s.
- **Cinder Hound** — *Scorching Bite* leaves a small void zone (burning grass) 2 m, 2% RH per 0.5 s, 6 s.
- **Ash Wisp** — *Ashfall*: 2.0 s cast (interruptible), red circles 3 m under **each** player within 20 m, 12% RH fire.
- **Cinderback Boar** — *Burning Charge*: 2.0 s paw, red line 14 m, 16% RH + knockback; leaves a **void zone
  line** of burning grass 2 m wide along its path for 8 s (2% RH per 0.5 s).
- **Steppe Drake** — *Scorch Breath*: 2.5 s intake (throat glow), red cone 10 m 60°, 22% RH + burn;
  turns 45°/s during it — side-step. *Tail Sweep*: red cone 5 m behind it, 2.0 s, 12% RH + knockback.
- **Ashhorn Ox** — wary grazer; *Stampede* when struck: the whole herd (3–6) runs a straight 20 m line
  (red line 20 m × 6 m, 2.0 s), 15% RH each hit, then flees. Orcs herd them; killing one angers nearby orcs.
- **Cinder Moth** — *Spark Dust*: 8 m line of falling sparks (void zone, 2% RH per 0.5 s, 6 s).
- **Burnt Wanderer** — *Flare*: on death, red circle 3 m, 1.5 s fill (open world gets 2.0 s), 10% RH fire.
- **Ash Raptor** — *Rend* (as the Scrub Raptor, 5% RH per hit). Follows Ashhorn herds; flees into tall grass at 25% health.
- **Ash Hound** (tag Demon, §3.3) — *Pounce*: leaps up to 15 m at a player, red circle 2 m, 2.0 s, 10% RH +
  `dazed` 2 s. Comes out of ash vents in twos and threes; the vents close when the pack dies.

### 6.8 Frostmantle (34–42) — tundra, glaciers, peaks

Cold is a hazard: the **Chill** meter (page 11 §20 `mech_env_cold`) runs outside warm spots on the high peaks (above 900 m) and in
blizzards. Monsters here slow, freeze and hide in snow.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_frost_frost_stalker` | Frost Stalker | 34–38 | creature: saber_cat ×2.4, white #e0e8f0 (reuse: `frost_stalker`) | melee, ambusher | 1.2 | 7% + chill | h | `it_frost_pelt` |
| `m_frost_glacier_maw` | Glacier Maw | 35–40 | creature: bear ×2.8, white (reuse: `glacier_maw`) | brute | 2.6 | 12% | t | `it_frost_pelt`, bases heavy_chest |
| `m_frost_drift_lurker` | Drift Lurker | 36–42 | creature: crocodile ×2.8, white/pale blue | brute, ambusher | 2.6 | 13% | h | `it_frost_pelt` |
| `m_frost_hoarfrost_chorus` | Hoarfrost Chorus | 36–42 | creature: wisp ×1.6, white, pack 3–4 | support, caller | 0.6 | 3% | h | `it_rime_crystal` |
| `m_frost_glacier_tick` | Glacier Tick | 34–39 | creature: spider ×1.6, translucent, dark core | swarm, pack 8–12 | 0.3 | 2% | h | `it_rime_crystal` |
| `m_frost_ridge_griffin` | Ridge Griffin | 36–41 | creature: griffin ×2.4 (reuse: `ridge_griffin`) | melee, flying | 1.3 | 7% | t | `it_rook_feather`, bases medium_helm |
| `m_frost_rime_elemental` | Rime Elemental | 37–42 | creature: elemental ×2.2, body #9ad8ff | caster | 0.9 | 8% ice | h | `it_rime_crystal`, bases orb, wand |
| `m_frost_rimebound_dead` | Rimebound Dead | 38–42 | chibi: undead · knight (frosted plate #b8d0e0) | melee | 1.3 | 7% | h | `it_grave_dust`, bases plate_helm |
| `m_frost_white_wolf` | White Wolf | 34–40 | creature: dire_wolf ×2.2, white #e8ecf0 | melee, pack 3–5 | 1.0 | 7% | h | `it_frost_pelt`, `it_beast_fang` |
| `m_frost_rime_elk` | Rime Elk | 34–40 | creature: elk ×2.4, white-grey, frosted antlers | brute, pack 1–3 | 2.2 | 11% | w | `it_frost_pelt`, bases light_chest |
| `m_dragon_rime_wyrm` (elite) | Rime Wyrm | 40–42 | creature: dragon ×3.0, white/blue (reuse: `rime_wyrm`) | brute, **elite**, placed at 3 peaks | 4.0 | 14% ice | t | `it_dragon_scale`, bases sword2h |

⚑ Warband presence: **Stonehide Clans** hold the high passes (34–48, §9.6); **Ashtusk** war parties hold the southern
passes (to 40).

**Abilities**

- **Frost Stalker** — *Snow Cloak*: invisible while still; reveals with a white puff; first hit +50%.
- **Glacier Maw** — *Glacier Slam*: red circle 6 m, 2.5 s, 20% RH + `slow` 40% 4 s. Territorial 2.0 s roar.
- **Drift Lurker** — lies in a drift with its back ridge showing (ground looks identical; a faint snow
  ripple every 3 s). *Ambush Bite*: 26% RH once when surfacing (red circle 3 m, 2.0 s, the snow moving is
  the warning). If that does not finish the fight it withdraws under snow and moves 20 m, then tries again
  (reuse: `BESTIARY-IDEAS.md` Drift Lurker).
- **Hoarfrost Chorus** — circles at 25 m and sings (visible notes). Every 10 s the song **calls** the
  nearest pack (no cast bar — kill a singer to stop it; each dead singer adds 10 s). Low damage.
- **Glacier Tick** — slow (3.4 m/s), stupid, many. What area spells are for.
- **Ridge Griffin** — *Wing Buffet*: red cone 8 m, 2.0 s, knockback 8 m, 6% RH. Near cliffs this is the
  first **ledge** knockback in the game: it is always aimed along the ledge, never over it (page 11 §19).
- **Rime Elemental** — *Frost Orb*: slow projectile (6 m/s) at a player, on arrival a red circle 3 m,
  1.5 s, 12% RH + `freeze` 1.5 s. *Rime Nova*: 2.5 s interruptible, red circle 8 m, 15% RH + slow.
- **Rimebound Dead** — *Frozen Grip*: 2.0 s, red cone 3 m, root 2 s + 8% RH.
- **White Wolf** — *Hamstring*: a bite from behind slows 40% for 4 s. Hunts in the fog; the pack circles
  once (2.0 s, paw prints in the snow) before it closes in.
- **Rime Elk** — wary; *Antler Rush*: 2.0 s head-down, red line 12 m × 3 m, 16% RH + knockback 5 m. The
  herd bolts together when one is struck.
- **Rime Wyrm** (elite) — *Frost Breath* red cone 12 m 60°, 2.5 s, 30% RH + slow; *Wing Gust* knockback
  cone; *Ice Shards* 4 red circles 3 m at random players, 2.0 s, 12% RH. Uses the page 11 elite mechanic
  budget (2 mechanics). Respawn 12 min.

### 6.9 The Drowned Coast (40–48) — sunken city, cliffs, undead

The Drowned are the dead of the sunken city, called up by the tide. They come in with water: tide
pools, currents and a rising tide (page 11 `mech_env_rising_tide`).

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_drowned_tide_thrall` | Tide Thrall | 40–45 | chibi: undead · rags with barnacles, held boat_hook | melee, pack 3–5 | 1.0 | 6% | h | `it_salt_pearl`, bases sword |
| `m_drowned_salt_wraith` | Salt Wraith | 41–47 | creature: wraith ×2.0, body #3a5a6a (reuse: `hollow_wraith`) | caster | 0.8 | 8% | h | `it_salt_pearl`, bases wand, tome |
| `m_drowned_reef_crocodile` | Reef Crocodile | 40–46 | creature: crocodile ×2.8, variant reef_crocodile | brute, ambusher | 2.6 | 13% | t | `it_rough_hide` |
| `m_drowned_shellback` | Shellback | 40–45 | creature: beetle ×2.4, body #6a5040, barnacled | brute | 2.4 | 11% | h | `it_drowned_brass` |
| `m_drowned_kelp_slime` | Kelp Slime | 40–44 | creature: slime ×2.2, body #2a6a4a | brute | 1.8 | 9% | h | `it_bog_resin` |
| `m_drowned_gull_swarm` | Wrackgull | 40–44 | creature: bat ×1.4, white/grey | swarm, flying, pack 8–12 | 0.3 | 2% | h | `it_rook_feather` |
| `m_drowned_bellringer` | Drowned Bellringer | 43–48 | chibi: undead · priest (diving helm hat, hand bell) | support, caller | 0.8 | 4% | h | `it_drowned_brass`, bases scepter |
| `m_drowned_choir_wailer` | Choir Wailer | 42–48 | chibi: undead elf · bard outfit parts (long hair, silks, lyre held) | caster | 0.8 | 8% | h | `it_salt_pearl`, bases necklace |
| `m_drowned_brine_knight` | Brine Knight | 44–48 | chibi: undead ×1.2 · knight (verdigris plate #3a6a5a, tower shield) | melee (tank-like) | 1.8 | 9% | h | `it_drowned_brass`, bases heavy_chest, plate_helm |
| `m_drowned_deep_horror` | Deep Horror | 45–48 | creature: horror ×3.0, body #122a3a | brute | 3.0 | 13% | h | `it_salt_pearl` |

⚑ Warband presence: **Stonehide Clans** on the cliffs (44–48).

**Abilities**

- **Tide Thrall** — *Drag Under*: in water ≥ 0.5 m deep, a hit roots 1 s. Rise from tide pools in pairs.
- **Salt Wraith** — *Brine Bolt* 8% RH, 1.5 s, interruptible. *Salt Crust*: yellow targeted 2.0 s, the
  target is slowed 50% for 4 s unless a friend hits the crust off them (a healer dispel also works).
- **Reef Crocodile** — like Silt Lurker, +40% in water.
- **Shellback** — frontal armour (60% less from the front). *Clamp*: 2.0 s, cone 3 m, 14% RH + root 1.5 s.
- **Kelp Slime** — *Undertow Pool*: where it dies, a void zone 5 m that **pulls** 1.5 m/s toward its
  centre, 2% RH per 0.5 s, 10 s.
- **Wrackgull** — swarm dives; they steal: a gull that lands 3 hits flies off with 1% of the player's
  carried gold (dropped back when killed, max once per 5 min).
- **Drowned Bellringer** — *Toll*: 2.0 s interruptible; calls every Drowned within 40 m and gives them +15%
  damage 10 s. Priority kill.
- **Choir Wailer** — *Dirge*: 2.5 s interruptible cast, `fear` (run away 3 s) on one yellow-targeted
  player. *Wail*: 8% RH bolt.
- **Brine Knight** — *Tower Shield*: blocks all frontal attacks while shield raised (4 s every 12 s, a blue-
  grey shield glow on the body, no ground colour). *Shield Bash*: 12% RH + stun 1 s. Guards Bellringers.
- **Deep Horror** — *Tentacle Field*: 3 red circles 3 m around itself in sequence 0.6 s apart, 2.0 s each,
  14% RH + knock up. *Grasp*: yellow targeted 2.0 s pull 6 m.

### 6.10 The Riftmarch (46–54) — magic-torn land, floating stone

Space itself is unreliable: rifts open (void zones that teleport), stone floats, monsters flicker from place to place.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_rift_rift_horror` | Rift Horror | 46–52 | creature: horror ×2.6 (reuse: `rift_horror`) | brute | 2.4 | 12% | h | `it_rift_shard` |
| `m_rift_abyssal_prism` | Abyssal Prism | 47–53 | creature: shard ×2.0 (reuse: `abyssal_prism`) | caster | 0.8 | 9% | h | `it_rift_shard`, bases orb |
| `m_rift_stitchwork` | Stitchwork | 48–54 | creature: horror ×2.8 (+feature `mismatched_limbs`) | brute | 3.0 | 14% | h | mixed reagents of 3 families |
| `m_rift_absence` | Absence | 50–54 | creature: wraith ×1.8 (bespoke shader: ground not drawn inside its outline) | melee, support | 1.2 | 4% | h | `it_null_pearl` |
| `m_rift_refraction` | Refraction | 50–54 | creature: shard ×2.2, mirror silver | caster | 1.0 | mirror | h | `it_unmade_glass` |
| `m_rift_waste_wyrm` | Waste Wyrm | 48–54 | creature: worm ×3.4 (reuse: `waste_wyrm`) | brute, burrower | 3.0 | 14% | h | `it_dune_chitin` |
| `m_rift_phase_hound` | Phase Hound | 46–51 | creature: dire_wolf ×2.2, body #3a2a5a, glow #b080ff | melee, pack 2–4 | 1.0 | 6% | h | `it_rift_shard` |
| `m_rift_storm_pyre` | Storm Pyre | 49–54 | creature: phoenix ×2.2 (reuse: `storm_pyre`) | caster, flying | 0.9 | 9% lightning | h | `it_rift_shard` |
| `m_rift_unmade_golem` | Unmade Golem | 47–52 | creature: golem ×2.4, pieces floating apart | brute | 2.6 | 12% | h | `it_brass_cog`, `it_unmade_glass` |
| `m_rift_echo_soldier` | Echo of a Warband | 50–54 | chibi: human/orc translucent · warrior/ranger/cleric (set of 6) | mixed set piece | 1.0 each | 6% | passive until entered | `it_rift_shard` |

⚑ Warband presence: **Stonehide Clans** on the southern floating slabs (to 50); **Kingsfire Legion** forward camps (50–54).

**Abilities**

- **Rift Horror** (tag Demon, §3.3) — *Rift Tear*: 2.5 s, red circle 6 m on itself, 18% RH; leaves a **void zone** rift 3 m,
  3% RH per 0.5 s, 12 s.
- **Abyssal Prism** — *Prism Beam*: a 20 m **line** at a yellow-targeted player, 2.0 s then channels 3 s
  (void zone line: 4% RH per 0.5 s); turns 20°/s toward the target — keep moving sideways.
- **Stitchwork** — *Landslide Swing*: red cone 5 m 120°, 2.5 s, 24% RH. Moves badly (stumbles, 3.0 m/s).
  Drops reagents of the three families it is sewn from (reuse: `BESTIARY-IDEAS.md`).
- **Absence** — *Unmake*: on hit, removes the player's **most recent spell from their bar for 10 s**
  (greyed with a hole icon; dispellable magic) — no damage beyond 4%. Walks, silent, no hearing cue.
  (reuse: `BESTIARY-IDEAS.md` Absence.) Cap: one Unmake per player per 20 s.
- **Refraction** — shows a mirror copy of the nearest player's class silhouette. *Mirror*: every 3 s it hits
  back 30% of the damage it took in those 3 s at the player who dealt most (capped at 15% RH per hit).
  Burst it or pace it. (reuse: `BESTIARY-IDEAS.md` Refraction.)
- **Waste Wyrm** — like Dune Breacher at 1.2 × damage; *Swallow*: 3.0 s red circle 4 m — a player caught is
  swallowed 3 s (takes 5% RH per 0.5 s, then spat out 8 m). Dealing 15% of its health frees them early.
- **Phase Hound** (tag Demon, §3.3) — *Phase Bite*: teleports behind its target (1.0 s purple flicker on the spot it will
  appear), 8% RH. 8 s cooldown.
- **Storm Pyre** — *Chain Spark*: 7% RH lightning jumping to 3 players within 8 m of each other — spread.
- **Unmade Golem** — *Scatter*: its pieces fly apart (3 red circles 3 m around it, 2.0 s) and reassemble 4 s later.
- **Echo of a Warband** — six translucent figures replaying a fight; ignore players until one steps into
  the 12 m ring (a faint white circle), then all six become hostile at once (melee, ranged, healer).
  A set piece (page 14 event `ev_echo_battle`).

### 6.11 The Kingsfire (52–60) — volcanic, the Fire King's lands

The Kingsfire Legion (§9.7) holds most of it. Demons come through fire gates. Lava is a hazard
(page 11 `mech_env_lava`).

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_kingsfire_cinder_imp` | Cinder Imp | 52–56 | creature: imp ×1.6 (reuse: `cinder_imp`) | swarm, pack 6–9 | 0.3 | 2% fire | h | `it_brimstone` |
| `m_kingsfire_magma_golem` | Magma Golem | 54–60 | creature: golem ×2.8, cracked #2a1a14, core #ff6a20 | brute | 3.0 | 14% fire | h | `it_cinder_core`, bases warhammer |
| `m_kingsfire_flame_revenant` | Flame Revenant | 53–59 | creature: elemental ×2.2 (reuse: `ember_revenant`) | caster | 0.9 | 9% fire | h | `it_cinder_core` |
| `m_demon_brimstone_hound` | Brimstone Hound | 52–57 | creature: hound ×2.4, horns (+feature), #3a1010 | melee, pack 2–4 | 1.1 | 7% fire | h | `it_brimstone`, `it_demon_horn` |
| `m_demon_ashmaw` | Ashmaw Fiend | 56–60 | creature: titan ×2.4, body #3a1a14, horns | brute | 3.4 | 15% | h | `it_demon_horn`, bases axe2h |
| `m_kingsfire_obsidian_drake` | Obsidian Drake | 55–60 | creature: drake ×3.0, body #1a1a22, glow seams | brute | 3.0 | 14% fire | t | `it_dragon_scale` |
| `m_demon_cinder_wraith` | Cinder Wraith | 55–60 | creature: wraith ×2.2, body #4a1a10, eyes #ffa040 | caster | 0.9 | 9% shadow | h | `it_brimstone` |
| `m_kingsfire_ashen_phoenix` | Ashen Phoenix | 57–60 | creature: phoenix ×2.4, variant ember_phoenix | caster, flying | 1.0 | 9% fire | h | `it_cinder_core`, bases staff |
| `m_demon_lava_leech` | Lava Leech | 52–58 | creature: worm ×2.0, body #ff5010 | melee, burrower (in lava) | 1.0 | 7% | h | `it_brimstone` |

⚑ **Kingsfire Legion** holds the region: 7 more members in §9.7 (16 on the list).

**Abilities**

- **Cinder Imp** (tag Demon) — *Pop*: on death, red circle 2 m, 1.0 s fill, 4% RH fire. Page 11 §4.2: a hit of
  ≤ 5% RH is exempt from the warning minimum and may warn in 1.0 s.
- **Magma Golem** — *Eruption*: 3.0 s (it hunches, lava pours), red circle 8 m, **40% RH**; leaves 3 void
  zones 3 m of lava for 15 s. *Molten Fist*: 14% RH + burn.
- **Flame Revenant** — *Flame Pillar*: 2.0 s, red circle 3 m under 2 players, 16% RH fire. Interruptible cast.
- **Brimstone Hound** — *Brimstone Bite*: 7% RH + burn 2% RH/s 6 s. Packs of 2–4, flank.
- **Ashmaw Fiend** — *Devour*: yellow targeted 2.5 s, grabs one player 2 s (5% RH per 0.5 s); stunning it
  or dealing 10% of its health frees them. *Stomp*: red circle 7 m, 2.5 s, 22% RH + knockback.
- **Obsidian Drake** — *Glass Breath*: red cone 12 m 60°, 2.5 s, 28% RH; leaves a glass shard field (void
  zone cone, 2% RH per 0.5 s + `bleed`) for 8 s.
- **Cinder Wraith** — *Soul Singe*: dispellable curse, 3% RH per second 8 s; dispelling it releases a
  red circle 3 m 1.5 s on the target (12% RH) — step away from friends before being dispelled.
- **Ashen Phoenix** — *Rebirth*: first death at 0 health becomes a 5 s egg (HP ×0.3); destroy the egg or
  it returns at 50%.
- **Lava Leech** — swims in lava; *Spit*: 8% RH fire glob at 20 m, 1.5 s.

### 6.12 Spire Isle (60) — endgame island, the Spire and the Tear

Everything here is level 60. The old "pressure steps" rule (+5% per step unlocked) is gone with the item
tracks it followed (W17). Instead the island has the highest open-world rarity chances in the game
(§7.7: champion packs 20%, rares 7%, greater rarities 9%), and the family is `tear` (Things of the Tear).

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_tear_tearspawn` | Tearspawn | 60 | creature: horror ×1.6, body #1a1030 | swarm, pack 6–10 | 0.3 | 2% | h | `it_tear_thread` |
| `m_tear_spire_warden` | Spire Warden | 60 | chibi: human ×1.2 · knight (black-violet plate, eyeless helm) | melee | 1.6 | 8% | h | `it_tear_thread`, bases plate_helm |
| `m_tear_spire_sorcerer` | Spire Sorcerer | 60 | chibi: elf · sorcerer (violet silks, halo of shards) | caster | 0.8 | 9% | h | `it_null_pearl`, bases orb |
| `m_tear_void_shade` | Void Shade | 60 | creature: wraith ×2.0, body #0a0610 | melee, ambusher | 1.0 | 8% shadow | h | `it_null_pearl` |
| `m_tear_star_horror` | Star Horror | 60 | creature: horror ×3.0, eyes 9 #ffe86a | brute | 3.0 | 14% | h | `it_null_pearl` |
| `m_tear_reality_shard` | Reality Shard | 60 | creature: shard ×2.4, body #e0e0ff | caster, support | 0.9 | 9% true | h | `it_tear_thread` |
| `m_tear_null_titan` (elite) | Null Titan | 60 | creature: titan ×3.2, body #20202a, veins #a060ff | brute, **elite** | 4.0 | 16% | h | `it_null_pearl`, bases warhammer |
| `m_tear_unmaking_worm` | Unmaking Worm | 60 | creature: worm ×3.6, pale #d8d0e0 | brute, burrower | 3.0 | 14% | h | `it_null_pearl` |
| `m_tear_void_prophet` | Void Prophet | 60 | chibi: human · warlock (hood, painted eye symbol, held tome) | healer, support | 0.9 | 4% | h | `it_tear_thread`, bases tome |
| `m_tear_mirror_knight` | Mirror Knight | 60 | chibi: human · fighter, mirror-plate (reflective material) | melee | 1.4 | 8% | h | `it_null_pearl` |

(reuse: the Emberveil 2 prototype's `enemy-looks.json` — bodies only, under their asset ids there: the warden,
sorcerer, herald, void_prophet, reality_shard, star_horror, cosmic_titan, genesis_worm and void_shade looks.
Every player-facing name here is new.)

**Abilities**

- **Tearspawn** — *Unravel*: each hit stacks `unravel` (−3% max health, 10 stacks, 10 s, refreshes).
- **Spire Warden** — *Null Cleave*: red cone 5 m 120°, 2.0 s, 16% RH; its target cannot be healed for 2 s.
- **Spire Sorcerer** — *Fold Space*: 2.5 s interruptible; swaps the positions of two yellow-targeted
  players. *Hollow Bolt*: 9% RH.
- **Void Shade** — invisible until 8 m; *Shadow Rend* 12% RH on reveal.
- **Star Horror** — *Gaze*: 2.5 s, a **line of sight** mechanic: every player facing it when the cast ends
  is `dazed` 2 s (a big eye icon over it; turn the camera away). *Crush*: red circle 5 m, 20% RH.
- **Reality Shard** — *Anchor*: tethers (white line) itself to one monster; that monster takes 50% less
  damage while tethered. Break by killing the shard or pulling the monster 15 m away.
- **Null Titan** (elite) — *Null Field*: 3.0 s, void zone 10 m centred on it for 10 s where **no spell can
  be cast** (basic attacks only). Fight outside it or with weapons. *Quake*: red circle 8 m, 2.5 s, 26% RH.
- **Unmaking Worm** — burrower; the ground where it surfaces loses colour and props for 60 s (cosmetic,
  reuse idea: `BESTIARY-IDEAS.md` Unmaker).
- **Void Prophet** — heals 12% (interruptible); *Tear Blessing*: allies immune to crowd control 6 s (magic, dispellable).
- **Mirror Knight** — copies the last spell a player cast at it as a buff on itself for 6 s (a burn becomes
  its burn aura; a shield becomes its shield). Dispellable.

### 6.13 Count check

| Region | Region monsters | + warband/legion members present | Named rares (§8) |
|---|---|---|---|
| Hearthvale | 10 | Sootwick 7 | 3 |
| Mossfen | 11 | Sootwick 7 | 3 |
| Greyridge | 11 | Sootwick 7, Unburied 7 | 3 |
| Sunscar | 13 | Unburied 7, Thornmane 7 | 3 |
| Whisperwood | 10 | Thornmane 7 | 3 |
| Cinder Steppe | 11 | Ashtusk 7 | 3 |
| Frostmantle | 11 | Stonehide 7, Ashtusk 7 | 3 |
| Drowned Coast | 10 | Stonehide 7 | 3 |
| Riftmarch | 10 | Stonehide 7, Kingsfire Legion 7 (forward camps) | 3 |
| Kingsfire | 9 | Kingsfire Legion 7 | 3 |
| Spire Isle | 10 | — | 3 |
| **Total** | **116** (108 + 8 added in the round-2 sweep: 4 tameable beasts, 4 bindable demons) | 42 warband/legion ids | **33** |

The Bound Fiend (§3.3) travels with Threadcutter casters and is not counted here.

Every region has at least 8 own monsters; the one region at 9 (Kingsfire) is held by the Legion, so its
open-world list is 16.

### 6.14 World-boss minions (page 13) and dungeon monsters (page 12)

World bosses call these; their numbers, waves and caps are on [page 13](13-WORLD-BOSSES.md) §6–§7. This page
owns the ids and families. They do not spawn on their own and are not counted in §6.13.

| id | Name | Family | Called by | Body |
|---|---|---|---|---|
| `m_construct_mine_sentry` | Mine Sentry | construct | Grief-in-Iron (Greyridge) | creature golem ×1.2 |
| `m_folk_deepforge_deserter` | Deepforge Deserter | folk | Grief-in-Iron | chibi2 dwarf · fighter |
| `m_sand_skitter` | Sand Skitter | sand (beast) | the Glass Wyrm (Sunscar) | creature beetle ×1.4 |
| `m_sand_glass_grub` | Glass Grub | sand (beast) | the Glass Wyrm | creature worm ×1.4 |
| `m_beast_brood_spiderling` | Brood Spiderling | beast | the Hungering Brood (Whisperwood) | creature spider ×1.4 |
| `m_beast_carrion_vulture` | Carrion Vulture | beast | the Carrion Crown (Cinder Steppe) | creature owl ×1.4, bald, grey |
| `m_orc_ashtusk_cutthroat` | Ashtusk Cutthroat | orc (§9.5) | the Carrion Crown | (§9.5) |
| `m_giant_stonehide_smasher`, `m_giant_stonehide_hurler` | (§9.6) | giant | the Standing Ruin (Frostmantle) | (§9.6) |
| `m_drowned_tide_thrall`, `m_drowned_choir_wailer` | (§6.9) | drowned (Undead) | the Sallow King (Drowned Coast) | (§6.9) |
| `m_rift_rift_shard` | Rift Shard | rift | the Unmoored (Riftmarch); also d12 | creature shard ×1.4, violet |
| `m_demon_rift_imp` | Rift Imp | demon (**Demon**) | the Unmoored | creature imp ×1.4, violet-black |
| `m_kingsfire_cinder_elemental` | Cinder Elemental | kingsfire | Slagborn (Kingsfire); also d15 | creature elemental ×2.4, fire |
| `m_construct_scarecrow` | Scarecrow | construct | the Harvest Effigy (seasonal) | creature golem ×1.4, straw |
| `m_fen_sporeling` | Sporeling | fen | the Bloomtyrant (seasonal) | creature mushroom ×1.4 |

Every body here is at least size 1.4 (§1.2; page 13 matches). **Dungeon monsters** (page 12 §21.3, 148 ids) now all use this page's
families; the demons among them (`m_demon_slag_imp` d04, `m_demon_slagback_hound`, `m_demon_gate_brute` d13,
`m_demon_cinder_cantor` d14) carry the Demon tag like any other `demon` row.

---

## 7. Monster rarities

*(reference)* This is Diablo 2's champion/unique-monster idea, which the owner asked for by name, extended with
a second layer. Every name, number and effect below is ours.

A **monster rarity** is something added on top of a monster's rank (§4.2) that makes it stronger, shows on its
nameplate and pays better loot. There are two layers:

1. **Standard affixes** (`mod_*`, §7.4) — what makes a **champion pack** (one affix shared by the whole group)
   or a **rare** (2–3 affixes, with minions). Common in the open world, placed in dungeons.
2. **Greater rarities** (`grr_*`, §7.5) — a big difficulty spike, usually on **one** especially strong
   monster (rarely a whole group). They sit in **exclusion groups**: a monster can be **Giant Flaming**
   (two groups) but never **Flaming Electrified** (both in the Element group).

### 7.1 The layers at a glance

| Layer | Who has it | Name on the nameplate | Line 2 of the nameplate | Body tell | Example |
|---|---|---|---|---|---|
| Normal | any spawn | white | — | — | Moor Hound |
| **Champion pack** | every member of one group (3–6) | **blue** `#5aa0ff` | the shared affix, with its icon | the affix's body aura on every member (§7.4 "Tell") | Moor Hound ×4, all **Toxic** |
| **Rare** | one monster | **yellow** `#ffd84a`, a Name Forge name + epithet | its 2–3 affixes, with icons | each affix's aura, blended; body ×1.3 | *Grisk the Tallow-Hearted* — Vicious, Flickerstep |
| **Minion** | a rare's escort (2–4) | white, with a small yellow pip | the rare's first affix, marked "½" | the first affix's aura at half opacity | Moor Hound (minion of Grisk) |
| **Named rare** | hand-written (§8) | yellow with a crown pip | its fixed affixes | as rare | Old Gristlejaw |
| **Greater rarity** | one monster (or rarely a whole group) of any rank above | the greater name(s) **before** the name, in **orange** `#ff8a3d`, each with its badge icon | (unchanged) | scale, particles and aura from §7.5 | **Giant Flaming** Thicket Boar · **Frozen** *Grisk the Tallow-Hearted* |
| Boss | placed | boss frame | — | — | never rolls a monster rarity |

**Body tells, not ground rings.** A rarity's tell is on the **body** (a rim-light tint in the aura colour and
the affix's particle effect, reuse: `avatar-3d/js/spellfx.js` `STATUS_FX` auras) and on the **nameplate**
icon. It never draws a filled or rimmed shape on the ground, because the seven ground colours are reserved
for telegraphs ([page 11](11-BOSS-MECHANICS.md) §3.1 rule 3). The only ground marks a rarity monster makes are
its real telegraphs. Hovering a nameplate icon shows the affix's one-line rule from §7.4/§7.5 (page 03 owns
the tooltip). In chat and the combat log a rarity monster is written with its colour and badges, like an item
link ("**Giant Flaming** Thicket Boar").

### 7.2 Champion packs

A champion pack is a **whole group** that rolled one standard affix. Every member shows it.

| Rule | Value |
|---|---|
| Pack size | the spawn's normal pack size, **minimum 3, maximum 6** (a pack of 1–2 grows to 3 with bodies of the same type; a swarm pack becomes a champion pack of 3–6 of its biggest normal instead) |
| Per member (rank `champion`, §4.2) | HP ×2.0, damage ×1.25, armour ×1.3, size ×1.12, XP ×2.0, gold ×2.0, drops ×1.3 |
| Pack bonus (to everyone with credit, personal loot) | **+2 items** at rarity ×1.5 when the **last** member dies |
| Affixes | **1** standard affix (band table §7.3.1); in regions 10–11 a 20% chance of a second **stat** affix |
| Stat affixes (§7.4.1) | apply in full to every member |
| Mechanic affixes (§7.4.2–7.4.3) | the pack shares **one clock**: each time the affix fires, the next living member in turn uses it; interval ×0.8 of the table value (a pack is busier than one monster, not six times busier) |
| On-death effects | every member, at **50% damage** |
| Auras | do not stack between members: a player inside two members' auras counts once |
| Group scaling (§5.12) | each member scales like an elite (health × (1 + 0.6 × (n − 1))) |

### 7.3 Rares and their minions

| Rule | Value |
|---|---|
| Body | one monster of the spawn's type, rank `rare` (§4.2): HP ×4.5, damage ×1.5, armour ×1.7, size ×1.3, XP ×5, gold ×5, +2 items at rarity ×2.2 |
| Name | Name Forge (reuse: `namegen/`), the region's race language, a name + an epithet |
| Affixes | 2 or 3 standard affixes (§7.3.1), obeying §7.4.4 |
| **Minions** | the rest of its pack, rank `minion` (§4.2): **2–3** in regions 1–5, **3–4** in 6–11. Same type as the rare, or its family's normal of another role (a rare archer gets melee minions) |
| What minions share | the rare's **first** affix at **half strength**: a stat multiplier moves half-way to 1 (Vicious ×1.45 → ×1.225); status damage ×0.5; a mechanic affix deals ×0.5 damage at ×2 interval; an aura's radius ×0.5 |
| Minions when the rare dies | stay and fight (they are not routed); they drop normal loot |
| Group scaling | the rare scales like an elite; minions like normals |

Named rares (§8) keep their hand-written affixes and minions and are not re-rolled.

#### 7.3.1 How many affixes

| Band (00 §7) | Champion pack | Rare |
|---|---|---|
| Hearthvale (1–6) | 1 **stat** affix only (no mechanic affixes below level 8) | 2 stat affixes |
| Mossfen → Sunscar (5–24) | 1 (any kind) | 2 |
| Whisperwood → Drowned Coast (22–48) | 1 | 2 (50%) or 3 (50%) |
| Riftmarch → Spire Isle (46–60) | 1, + a 2nd **stat** affix at 20% | 3 |
| Dungeons | page 12 places slots; §7.8 sets the counts | |

### 7.4 The standard affixes

Fifty-six standard affixes in three tables: Farhold's stat modifiers (kept, four renamed so they do not clash
with greater rarities of the same name), the round-1 mechanic affixes (kept, two renamed) and ten new ones.
Every row has: **id**, **name**, **element** (for the one-element rule, §7.4.4; "—" is none), **tell**
(body aura colour + nameplate icon), **exact effect** (multipliers are on the rank's numbers), **counterplay**
and exclusions. Warning times are the open-world floors of [page 11](11-BOSS-MECHANICS.md) §4 (≥ 2.0 s for
anything ≥ 5% RH); damage is at the monster's damage (already × rank).

#### 7.4.1 Stat affixes (reuse: Farhold `data/enemies.json modifiers`)

| id | Name | Element | Tell | Effect | Counterplay |
|---|---|---|---|---|---|
| `mod_vicious` | Vicious | — | red-orange rim `#ff5a3a`, fang icon | damage ×1.45 | tank faces it away; use a defensive early; kill it first |
| `mod_plated` | Plated *(was Ironclad)* | — | steel-grey rim `#9fb0c8` and bolted plates, plate icon | armour ×2.6, health ×1.2 | spells and armour-ignoring damage; armour-shred statuses |
| `mod_fleet` | Fleet | — | pale cyan streaks `#8fe0ff`, feather icon | move ×1.5, attack interval ×0.72 (never shortens a warning, page 11 §4.1) | slows and roots; do not try to outrun it |
| `mod_vital` | Vital | — | slow green pulse `#7ae06a`, heart icon | health ×2.1 | steady damage; save big cooldowns for other packs |
| `mod_toxic` | Toxic *(was Venomous)* | poison | green drip `#9ede6a`, drop icon | every hit poisons: 2% RH/s for 6 s, stacks 3 (poison dispel) | dispel; tank rotates defensives; ranged avoid its melee |
| `mod_scorched` | Scorched | fire | orange sparks `#ff9a5c`, spark icon | every hit burns: 2% RH/s for 4 s (refreshes) | heal through it; fire resistance |
| `mod_rimed` | Rimed | ice | frost crust `#8fd6ff`, flake icon | every hit chills: −20% move 3 s, stacks to −60% | keep distance; a dodge roll clears one stack |
| `mod_thorned` | Thorned | — | brown thorns `#c8a24a`, thorn icon | reflects 28% of melee damage taken (cap 8% RH per hit) | ranged and spells; melee watch their health |
| `mod_leeching` | Leeching | — | dark red strands `#d0507a`, fang-drop icon | heals 45% of the damage it deals | anti-heal statuses; mitigation on the tank |
| `mod_runed` | Runed *(was Warded)* | — | violet runes `#b090ff`, rune icon | −35% damage from Spell-tagged hits, health ×1.2 | weapon attacks; casters switch to other packs |
| `mod_frenzied` | Frenzied | — | red streaks `#ff8030`, double-slash icon | attack interval ×0.55, damage ×0.85 | block and armour; it takes stuns (it is not a boss) |
| `mod_wealthy` | Wealthy *(was Gilded)* | — | gold glints `#ffd24a`, coin icon | gold ×4.5, drops ×1.6 | none needed — it is a gift |
| `mod_hoarding` | Hoarding | — | gold sack icon `#e8c070` | drops ×2.4, health ×1.3 | kill it |
| `mod_unyielding` | Unyielding | — | stone-grey rim `#8a8f9a`, boulder icon | health ×1.6, armour ×1.8, move ×0.8 | kite it; outpace it |
| `mod_fiery` | Fiery | fire | burning aura (`STATUS_FX.burn`), flame icon | damage ×1.25, hits burn (as Scorched) | fire resistance; heal through |
| `mod_frostbound` | Frostbound | ice | freeze aura, crystal icon | health ×1.35, armour ×1.3, move ×0.9, hits chill (as Rimed) | fire damage; keep distance |
| `mod_stormlash` | Stormlash | lightning | crackle (`haste` aura), bolt icon | move ×1.35, attack interval ×0.7, hits **shock** (page 05) | slows; defensives |
| `mod_graveborn` | Graveborn | shadow | curse aura, skull icon | health ×1.4, life steal 35%, hits curse (−15% healing received 6 s, curse dispel) | curse dispel; anti-heal |
| `mod_bramblehide` | Bramblehide | — | root aura vines, bramble icon | armour ×1.9, thorns 32% (cap 8% RH per hit), move ×0.9 | ranged and spells |
| `mod_hollowed` | Hollowed | — | bleed aura, gash icon | damage ×1.35, health ×0.75, hits bleed (1.5% RH/s 6 s) | burst it; it is fragile |
| `mod_wizened` | Wizened | — | body ×0.55, withered skin, small-figure icon | health ×0.65, damage ×0.85, move ×1.45, attack interval ×0.8 | area spells; do not chase |

Farhold's `giant` modifier is **not** a standard affix any more: it became the greater rarity `grr_giant`
(§7.5). Farhold's data keeps it for Farhold; Wildmarch's loader skips it.

#### 7.4.2 Mechanic affixes (kept from round 1; two renamed)

Each is a small [page 11](11-BOSS-MECHANICS.md) mechanic on a body; the data names the mechanic it uses
(`mechanic: "mech_trail_fire"`).

| id | Name | Element | Tell | Effect (numbers, shape, telegraph) | Counterplay | Not with / not on |
|---|---|---|---|---|---|---|
| `mod_scorchtrail` | Scorchtrail *(was Emberwake)* | fire | orange flame flicker on the feet, flame-ring icon | leaves a **void zone** trail 2 m wide, 5 s, 2% RH per 0.5 s (`mech_trail_fire`). On death: **red circle** 5 m, 2.0 s, 25% RH | do not chase through the trail; step out when it dies | swarm; `mod_hoarfast` |
| `mod_undertow` | Undertow | — | blue-grey spiral on the body, spiral icon | every 12 s: 1.5 s swirl + whoosh, **white tethers** to every player within 20 m, then pulls them to 3 m over 0.4 s; its next basic attack follows 0.5 s later | knockback immunity / root breakers; ranged move past 20 m | flying; `mod_flickerstep` |
| `mod_spellwoven` | Spellwoven | — | violet rune halo, rune-ring icon | a rune at its feet casts a **void beam** 12 m × 1.5 m rotating 40°/s, 4% RH per 0.5 s; shown 1.5 s as an outline first (`mech_rotating_beam`) | walk with the rotation | swarm; below level 10 |
| `mod_hoarfast` | Hoarfast | ice | white frost shell, snowflake-ring icon | every 10 s: **red circles** 3 m under 3 random players, 2.0 s, 12% RH + frozen (root) 1.5 s. On death: a ring of 6 circles at 6 m (outside is safe) | leave circles; keep moving | `mod_scorchtrail` |
| `mod_flickerstep` | Flickerstep | — | purple flicker, flicker-step icon | every 8 s: teleports next to the player furthest from it (≤ 30 m); the arrival spot shows a **red circle** 3 m for 2.0 s, 10% RH | ranged stay grouped; melee stay on it | `mod_undertow`, `mod_fleet` |
| `mod_aegis_bearer` | Aegis-Bearer | — | gold shield motes, shield icon | every 15 s: 2.0 s gold-border cast, then it and every monster within 12 m get a **gold shell**: immune to damage 3 s (a shell on the body, no ground colour) | interrupt; kill it first; switch targets during the shell | — |
| `mod_stonecaller` | Stonecaller | — | grey stone flecks, wall icon | every 14 s: a stone wall 10 m × 3 m rises 3–5 m from a player (grey crack line 1.0 s first, no damage), lasts 6 s; blocks movement and projectiles; always leaves a 2 m gap | walk round; wait it out | rooms under 20 m |
| `mod_steadfast` | Steadfast *(was Unstoppable)* | — | red chevrons on the body, chevron icon | immune to crowd control and knockback, health ×1.4, move ×0.85, +25% damage to shields | burn it down; kite | `mod_wizened`, `mod_mirrorhide`, `grr_unstoppable` |
| `mod_cinderchain` | Cinderchain | fire | orange chain links, chain icon | links itself to 2 pack mates with **white tethers** flecked orange; a player touching a tether takes 8% RH (once per 1 s) and burns; tethers stretch to 15 m | do not cross the lines; kill a linked mate to cut one | needs 2 mates |
| `mod_blightbearer` | Blightbearer | poison | green skull motes, skull icon | every 7 s: **void zone** 4 m under a random player (1.0 s rim warm-up), 2% RH per 0.5 s, 12 s; max 4 at once | fight in the open; move off pools | — |
| `mod_gravesoil` | Gravesoil | shadow | bone-white motes, bone-skull icon | as Blightbearer (shadow); when a pool ends a **Grave Hand** (swarm, HP ×0.3, 3% RH) claws up out of it | area spells for the hands | swarm |
| `mod_siegeborn` | Siegeborn | — | brass mortar on its back, mortar icon | every 9 s: 3 shells at players 10–30 m away: **red circles** 3 m, 2.0 s, 14% RH; never targets players in melee | melee it; ranged keep moving | — |
| `mod_manyfold` | Manyfold | — | multiple-dots icon | +3 normal members in its pack (same type) | area spells | swarm; bosses |
| `mod_mirrorhide` | Mirrorhide | — | silver sheen, mirror icon | every 10 s for 3 s: silver shell + chime; reflects 30% of damage taken (cap 8% RH per hit) | stop attacking for 3 s | `mod_thorned`, `mod_steadfast` |
| `mod_stormcrowned` | Stormcrowned | lightning | yellow sparks, spark-crown icon | when hit, 20% chance to throw a spark: a small **red** moving ball 1 m, 6 m/s, 8 m range, 6% RH; ≤ 3 at once | dodge sparks | — |
| `mod_shackler` | Shackler | — | grey chains on its arms, chain icon | every 14 s: **yellow targeted** circle 2 m on one player, 2.0 s; still inside when it closes → rooted 2.5 s | move 2 m | — |
| `mod_mirrorkin` | Mirrorkin | — | double-image shimmer, twin-silhouette icon | at 50% health splits into 3: itself + 2 copies with 10% of its health dealing 25% damage; copies have no affixes | area; watch which one keeps the name | swarm; `grr_splitting`, `grr_twin` |
| `mod_oathsworn` | Oathsworn | — | red banner motes, banner icon | +20% damage and +10% size for each pack mate killed within 20 m of it (max 5) | kill it first, or kill the pack far from it | needs mates |
| `mod_hollowheart` | Hollowheart | — | black ring motes, donut icon | every 16 s: 2.5 s cast, **red donut** 4–12 m (safe hole within 4 m), 20% RH | step in close | flying |
| `mod_quakeborn` | Quakeborn | — | cracked-stone skin, crack icon | every 12 s: **red circle** 6 m on itself, 2.0 s, 18% RH + knock up 0.5 s | step out | swarm |
| `mod_wardbreaker` | Wardbreaker | — | torn-scroll icon | every hit strips one beneficial magic effect from its target (max once per 3 s) | burst it; re-apply after | — |
| `mod_cloaked` | Cloaked | shadow | none while hidden | invisible beyond 10 m; the first hit after it is revealed +50%; nameplate hidden until revealed | detection effects; move in groups | bosses |
| `mod_packcaller` | Packcaller | — | horn icon | at 50% health: 2.0 s gold-border cast; calls 2 normal monsters of its family from 40 m | interrupt | — |
| `mod_iron_willed` | Iron-Willed | — | steel circlet icon | cannot be charmed, dominated, slept or feared ("Its will is iron."); no other change | damage and ordinary control instead | `mindless` monsters |
| `mod_starved` | Starved | — | red mouth icon | heals 10% max health for each player it kills; +30% move while any player is below 30% health | keep everyone topped up | — |

#### 7.4.3 New standard affixes (round 2)

| id | Name | Element | Tell | Effect (numbers, shape, telegraph) | Counterplay | Not with / not on |
|---|---|---|---|---|---|---|
| `mod_spiteful` | Spiteful | shadow | purple wisps leaking from its mouth, wisp icon | on death: **red circle** 3 m where it died, 2.0 s, 10% RH | kill it at range; step off corpses | swarm |
| `mod_rallying` | Rallying | — | horn-and-heart icon | once, at 50% health: 2.0 s **gold-border** cast "Rally": every monster of its pack within 15 m heals 15% max health. A champion pack shares one Rally | interrupt it; bring the pack down evenly | needs mates |
| `mod_orbiting` | Orbiting | — | 3 glowing motes circling it, orbit icon | 3 orbs (1 m) orbit at 4 m radius, 60°/s; each has a small **red** circle under it (it hurts); touching one deals 6% RH (once per orb per 1 s) | stay inside 3 m or outside 5 m | swarm; flying |
| `mod_manadrinker` | Manadrinker | — | blue drain streaks, drained-drop icon | each hit drains 4% of max Mana, or 10 Momentum, or 8 Tempo, from its target and heals it 1% max health per drain | let the tank take it; resource-hungry classes keep distance | — |
| `mod_withering` | Withering | shadow | grey haze, withered-leaf icon | aura 10 m: players inside take +10% damage from **all** monsters (debuff "Withered" while inside) | kill it first; ranged stay outside 10 m | — |
| `mod_rousing` | Rousing | — | war-drum icon, red motes drifting to its mates | aura 12 m: **other** monsters inside +20% damage (a monster is roused once, however many rousers) | pull its mates away from it; kill it first | needs mates |
| `mod_numbing` | Numbing | — | pale lilac mist, numb-hand icon | aura 8 m: players inside −20% attack speed and cast speed (debuff "Numbed") | fight it from range; melee rotate out | — |
| `mod_quickening` | Quickening | — | spinning-clock icon | every 12 s: 1.5 s **gold-border** cast; for 6 s its pack mates within 15 m attack 30% faster (intervals ×0.77; warnings unchanged) | interrupt | needs mates |
| `mod_retaliating` | Retaliating | — | spiked-ring icon + a 0–6 pip counter on the nameplate | every 6th hit it takes from within 4 m triggers a **red circle** 4 m on itself, 2.0 s, 12% RH | count the pips; step out at 6; fight from range | swarm |
| `mod_hushing` | Hushing | — | crossed-mouth icon | every 16 s: **red cone** 8 m 60° toward its target, 2.0 s; players inside are silenced 2.5 s (no spells; basic attacks work) and take 5% RH | side-step; casters stand off its facing | — |

**Total: 21 stat + 25 mechanic + 10 new = 56 standard affixes.** The build keeps this list and page 11's library
in sync: every mechanic affix names the `mech_*` it uses.

#### 7.4.4 Combination rules

1. **One element.** A monster has at most one affix with an element; if it has an **Element** greater rarity
   (§7.5), that affix must be the **same** element (a Frozen rare may roll Rimed, Frostbound or Hoarfast, never
   Scorched).
2. **Ground zones.** A rare may have at most **two** affixes that make ground zones (Scorchtrail, Spellwoven,
   Hoarfast, Blightbearer, Gravesoil, Siegeborn, Hollowheart, Quakeborn, Orbiting, Retaliating, Spiteful),
   never three. A champion pack has only one affix, so it never stacks zones.
3. **Banned pairs**: Fleet + Flickerstep; Steadfast + Mirrorhide; Thorned + Mirrorhide; Undertow + Siegeborn +
   Hollowheart together (any two are fine).
4. **Needs mates**: Cinderchain, Oathsworn, Rallying, Rousing and Quickening re-roll on a monster with no pack
   mates.
5. **No doubling a greater rarity**: `grr_giant` excludes Wizened; `grr_swift` excludes Fleet; `grr_unstoppable`
   excludes Steadfast; `grr_ironclad` excludes Plated; `grr_warded` excludes Runed; `grr_vampiric` excludes
   Leeching and Graveborn; `grr_gilded` excludes Wealthy and Hoarding; `grr_splitting` and `grr_twin` exclude
   Mirrorkin.
6. **Named rares** (§8) may break rules 2–3 (they are authored and tested), never rule 1.
7. **Hearthvale** (1–6) and every monster below level 8 roll **stat affixes only**.

### 7.5 Greater rarities

A greater rarity turns one monster into a fight of its own. It is rolled (open world) or slotted (dungeons) on
top of whatever the spawn already was: a normal monster, a champion pack's strongest member, or a rare.

#### 7.5.1 The greater layer (numbers on top of rank and affixes)

| Rule | Value |
|---|---|
| **Carrier** | the monster that holds the greater rarity. On a normal pack: the pack's biggest body (highest role HP×), first promoted to rank `champion` numbers with **no** standard affix — a **lone greater**. On a champion pack: its biggest member. On a rare: the rare |
| Base layer on the carrier | HP ×1.8, damage ×1.15, armour ×1.2, XP ×3, gold ×3, **+1 item at rarity ×1.5**, then the greater's own row (§7.5.3) |
| Two greaters on one monster (§7.7, §7.9) | both rows apply, from **different groups**; the base layer applies once, then HP ×1.3 more |
| Three greaters (Depth tier 5 only) | as two, HP ×1.3 once more |
| **Greater pack** (the whole group carries it) | every member: HP ×1.3, damage ×1.1, XP ×1.6, drops ×1.2, and the greater's effect at **pack strength**: size and stat changes in full, everything else at 50% damage with one shared clock (as §7.2). Only from level 20 |
| **Caps** (before group scaling §5.12 and before Depth, page 12) | total HP multiplier from rank × affixes × greater ≤ **×24** in the open world, ≤ **×40** in dungeons; total damage multiplier ≤ **×2.5** open world, ≤ **×3.0** dungeons. Anything over the cap is cut to it |
| Group scaling | a carrier scales like an elite (§5.12) |
| Aggro and leash | aggro 24 m, leash 70 m (as a rare) |
| Never on | bosses; `swarm` rank (if a swarm pack rolls one, the roll is dropped); set-piece event bodies unless page 14 says so |
| Telegraphs | every extra attack a greater rarity adds obeys [page 11](11-BOSS-MECHANICS.md) §4 floors, shows the rarity's badge at the left of its cast bar and uses the §22.5 vocabulary there. **Never lethal** in the open world or on Normal |
| Crowd control | a carrier takes crowd control normally (page 05 caps and diminishing returns) unless its row says it uses a **break bar** |

#### 7.5.2 Exclusion groups

A monster takes at most **one** greater rarity from each group. Combinations **across** groups are allowed
(Giant + Flaming, Swift + Venomous, Ancient + Ironclad + Frozen at Depth tier 5). Combinations **inside** a
group never happen (never Flaming + Electrified, never Giant + Colossal, never Twin + Splitting).

| Group | id | What the group changes | Members | Roll weight |
|---|---|---|---|---|
| **Size** | `size` | how big it is | Giant, Colossal | 15 |
| **Element** | `element` | the one element it is made of | Flaming, Electrified, Frozen, Venomous, Shadowed, Tear-touched, Plagued | 30 |
| **Body** | `body` | how it takes damage | Ironclad, Spectral, Hollow, Warded, Vampiric, Undying | 15 |
| **Mind** | `mind` | how it fights | Enraged, Swift, Unstoppable, Cunning, Commanding, Dreadful | 15 |
| **Number** | `number` | how many of it there are | Twin, Splitting, Echoing | 10 |
| **Lineage** | `lineage` | where it came from | Ancient, Stormborn | 8 |
| **Fortune** | `fortune` | what it carries | Gilded, Jewelled | 7 |

**Picking one.** Roll the group by weight among groups with at least one allowed member, then a member
evenly, skipping any member whose minimum level is above the monster's level or which the monster's family
cannot take (`mindless` monsters never roll Cunning, Commanding or Dreadful; flying monsters never roll
Colossal; Gilded never in dungeons). **Region bias**: the region's element is ×3 as likely inside the Element
group — Mossfen Venomous, Sunscar Flaming, Frostmantle Frozen, Drowned Coast Frozen, Riftmarch Tear-touched,
Kingsfire Flaming, Spire Isle Tear-touched; Cinder Steppe Electrified (its storms); Whisperwood Plagued.

#### 7.5.3 The 28 greater rarities

"Look" is scale, body aura, particles and the nameplate **badge** (an original SVG icon, page 17). Stats
multiply on top of the base layer (§7.5.1). "Min" is the lowest monster level that can roll it in the open
world (dungeons: §7.8, Depth: §7.9).

**Size**

| id | Name | Look | Stats | What it does (exact) | Counterplay | Min |
|---|---|---|---|---|---|---|
| `grr_giant` | Giant | body ×2.0 (cap 9 m tall); a dust puff on every footfall; 0.1 camera shake within 10 m of each step; badge: a tall figure | HP ×2.0, damage ×1.4, armour ×1.3, move ×0.85, reach ×1.6, attack interval ×1.3 (reuse: Farhold `giant` modifier, scale cut from 3.2 so bodies fit dungeon rooms) | its basic hits knock back 3 m. **Giant's Stomp** every 12 s: red circle 6 m on itself, 2.0 s, 20% RH + knockdown 0.5 s (`mech_quake_ring`) | ranged stay outside 6 m; melee keep open ground behind them; step out of the stomp | 8 |
| `grr_colossal` | Colossal | body ×3.0 (cap 12 m); cosmetic ground cracks where it stands; 0.2 shake within 15 m; badge: two tall figures | HP ×3.5, damage ×1.6, armour ×1.5, move ×0.7 | immune to crowd control and knockback; control fills a **break bar** as a boss's does (page 11 §12.2: full → Broken 4 s, +25% damage taken). Its basic attack is a 4 m 120° **red cone**, 1.5 s. **Tread**: every 3rd step leaves a void footprint 3 m, 6 s, 3% RH per 0.5 s. **Earthsplitter** every 18 s: red line 20 m × 4 m toward its target, 2.5 s, 30% RH + knockdown 1 s (`mech_charge_line` shape, no movement) | fill the break bar together; never stand in its line; fight from its flanks | 40 |

**Element** (one element only)

| id | Name | Look | Stats | What it does (exact) | Counterplay | Min |
|---|---|---|---|---|---|---|
| `grr_flaming` | Flaming | glowing seams `#ff7a20`, flames along its back (`STATUS_FX.burn`), heat shimmer; badge: flame | HP ×1.3, damage ×1.25 | (1) every hit burns 2% RH/s for 4 s. (2) **Burning Trail** while it moves: void 2 m wide, 5 s, 3% RH per 0.5 s (`mech_trail_fire`). (3) **Flame Burst** every 15 s: red circle 8 m on itself, 2.0 s, 22% RH. (4) On death: red circle 5 m, 2.0 s, 25% RH | hold it in one place (the trail only grows while it moves); leave the burst; step off its corpse | 8 |
| `grr_electrified` | Electrified | blue-white arcs jumping over the body every 0.5 s, sparks at its feet; badge: bolt | HP ×1.3, damage ×1.2 | (1) when hit, 20% chance to throw a **Spark**: a small red moving ball 1 m, 7 m/s along the ground for 10 m, 6% RH + shock; max 4 alive. (2) **Arc Link** every 14 s: yellow targeted marks on up to 3 players, 2.5 s; lightning then jumps between marked players within 8 m of each other, 18% RH per jump (`mech_chain_lightning`). (3) On death, **Discharge**: red circles 3 m under up to 3 players, 2.0 s, 15% RH | marked players spread 8 m apart; step over sparks | 8 |
| `grr_frozen` | Frozen | ice crust over the body (`STATUS_FX.freeze`), frost mist, frozen footprints; badge: snowflake | HP ×1.5, armour ×1.4, damage ×1.1, move ×0.9 | (1) hits add **Chill** (−15% move, 4 s, max 4); at 4 stacks the player is **frozen** 1.5 s (stun); a dodge roll removes 2 stacks. (2) **Ice Prison** every 16 s: yellow targeted circle 3 m on one player, 2.5 s; everyone inside at the end is encased 2 s (stunned and immune); a friend frees them early with 2 hits on the ice. (3) **Ice Shell** at 50% and 25% health: absorbs 20% of its max health for 8 s; Fire-tagged damage deals ×2 to the shell | the tank rolls before the 4th stack; spread from the prison; bring fire for the shell | 8 |
| `grr_venomous` | Venomous | green drip from mouth and claws, a low toxic mist at its feet (cosmetic, not a zone); badge: fang with a drop | HP ×1.3, damage ×1.15 | (1) hits add **Venom**: 1% RH/s per stack, 8 s, max 8; a poison dispel removes all. (2) **Venom Spit** every 12 s: void pools 3 m under up to 3 players (1.0 s warm-up), 3% RH per 0.5 s, 12 s (`mech_void_pool`). (3) On death: void 6 m, 10 s | dispel at 4+ stacks; move off pools; pull it away from where you will fight next | 10 |
| `grr_shadowed` | Shadowed | a near-black silhouette with smoking edges, only its eyes lit; badge: eclipse | HP ×1.3, damage ×1.2 | (1) **Shadow Step** every 10 s: dissolves (untargetable 1.5 s; your target frame keeps it selected) and reappears behind its top-threat target: red circle 2 m at the arrival spot for 1.5 s, 12% RH. (2) **Drain the Light** every 18 s: 2.0 s **gold-border** cast; players within 10 m are "Dimmed": −30% healing received 6 s (magic, dispellable) | interrupt Drain; tank turns after each step; dispel | 12 |
| `grr_tear_touched` | Tear-touched | a floating crack of violet-white light over its head, star specks drifting off the body; badge: split ring | HP ×1.4, damage ×1.2 | (1) **Fold** every 14 s: yellow targeted mark on one player within 20 m and one under itself, 2.5 s; they swap places (`mech_swap_places`). (2) **Rift Seam** every 20 s: void circle 4 m at a player that pulls 1 m/s toward its centre, 10 s, 3% RH per 0.5 s (`mech_undertow_pool`). (3) On death it leaves a **Tear Shard** (green beneficial pickup, 20 s): the player who takes it gets +10% damage for 30 s | check where the fold will put you (never beside a pool); walk out of seams against the pull | 30 |
| `grr_plagued` | Plagued | olive haze, flies, boils; badge: three spots | HP ×1.5, damage ×1.0 | (1) aura 8 m: every 3 s players inside gain **Blight**: −2% healing received per stack, max 10, 10 s (blight dispel). (2) **Contagion**: other monsters fighting within 20 m get +15% damage (olive glow) while it lives. (3) On death it bursts into 3 **plague rats** (swarm, HP ×0.3, 2% RH + poison) | kill it first; fight outside 8 m; area spells for the rats | 14 |

**Body** (how it takes damage)

| id | Name | Look | Stats | What it does (exact) | Counterplay | Min |
|---|---|---|---|---|---|---|
| `grr_ironclad` | Ironclad | four iron plates bolted on (front, back, left, right), each its own panel; 4 pips on the nameplate; badge: anvil | HP ×1.3 | hits from a side whose plate is intact deal **40%**; a plate breaks after taking 8% of the monster's max health on that side and clangs off (lootable `it_iron_scrap`). All four gone: +15% damage taken for the rest of the fight. Depth tier 4+: a broken plate regrows after 30 s | surround it; the tank turns it so the damage dealers reach a broken side | 12 |
| `grr_spectral` | Spectral | body 50% see-through, ghost trail; badge: ghost | HP ×1.2, damage ×1.2 | alternates **Solid** 6 s and **Faded** 4 s. Faded: immune to Physical-tagged damage, +30% Spell-tagged damage taken, walks through players. A 1.0 s shimmer and a chime come before each switch | weapon users burst while Solid, casters while Faded | 16 |
| `grr_hollow` | Hollow | chest cracked open; a glowing **Heart** (0.6 m orb) orbits 2 m around it at 1.5 m/s; badge: cracked heart | HP ×1.4 | hits on the body deal **25%**. The Heart is a separate target (Tab reaches it; it has its own small frame) and hits on it deal 100% to the monster. Every 20 s the Heart hides inside for 5 s (all hits 25%). An area hit that covers both counts once, at the Heart's rate | target the Heart (Tab, or click it); Auto-target spells pick it if you aim at it | 14 |
| `grr_warded` | Warded | a ring of turning runes at its waist; the ring's glyph shows which ward is up (crossed sword = physical, crossed star = spell); badge: shield rune | HP ×1.3 | every 12 s the ward flips between **Physical ward** and **Spell ward**: hits of the warded tag deal 20%. A 1.5 s flicker comes first; each flip releases **Ward Pulse**: red circle 5 m, 2.0 s, 8% RH + knockback 5 m | switch to the other kind of damage; step out of the pulse | 18 |
| `grr_vampiric` | Vampiric | red mist strands flowing into it; badge: red fang | HP ×1.3, damage ×1.2 | heals 40% of the damage it deals (anti-heal statuses halve this). **Blood Tether** every 15 s: a white tether to one player for 6 s drains 3% RH per 0.5 s and heals it 3× that; moving **12 m** away breaks it (`mech_tether_break` at 12 m) | the tethered player runs; bring anti-heal | 20 |
| `grr_undying` | Undying | bones and ash shifting and re-knitting under the skin; badge: looped arrow | HP ×1.2 | at 0 health it collapses for 4 s (a "Reforming" bar on its nameplate), then stands at 40% health. Dealing 10% of its max health to the collapsed body in those 4 s ends it (the body has a gold outline while you can). Once (twice at Depth tier 4+) | save a burst for the collapse | 16 |

**Mind** (how it fights)

| id | Name | Look | Stats | What it does (exact) | Counterplay | Min |
|---|---|---|---|---|---|---|
| `grr_enraged` | Enraged | red eyes, steam from its nostrils, a snarling idle; badge: claw | HP ×1.4 | damage +1% and attack speed +0.5% per 1% health missing (cap +60% / +30%). Below 30%: **Rampage** every 10 s: red chevron path to its lowest-health target, 2.0 s, 25% RH + knockdown | save defensives and burst for the last 30%; the low-health player moves off the path | 10 |
| `grr_swift` | Swift | two trailing after-images, dust streaks; badge: winged arrow | HP ×1.2 | move ×1.6, attack interval ×0.7 (warnings unchanged). **Dash Strike** every 8 s: red line 12 m × 2 m from it toward the furthest player within 15 m, 2.0 s, 15% RH. Slows and roots last **1.5×** as long on it | slow or root it; do not stand in line with it | 8 |
| `grr_unstoppable` | Unstoppable | a dark red chevron glow over its body; badge: ⟫ | HP ×1.5, move ×1.1 | immune to crowd control and knockback; control fills a **break bar** (page 11 §12.2). **Unstoppable Charge** every 14 s: red chevron path to the furthest player, 2.5 s, 25% RH + knockback 6 m, flagged `unstoppable` | fill the break bar together; leave the path | 14 |
| `grr_cunning` | Cunning | a hood of shadow over its eyes, a darting head; badge: eye | HP ×1.2, damage ×1.2 | (1) **Hunt** every 12 s: ignores threat once: a yellow targeted mark on the lowest-health player or the healer, 2.0 s, then it leaps there (red circle 2 m), 15% RH. (2) **Sidestep**: every 10 s its next incoming single-target **spell** misses; a white shimmer on its body means "ready" | bait the sidestep with a cheap spell; the marked player moves | 16 |
| `grr_commanding` | Commanding | a war banner on its back, gold motes; badge: crowned horn | HP ×1.4 | monsters of its pack within 20 m get +20% damage and one random standard **stat** affix ("Orders"), re-rolled every 20 s by a 2.0 s **gold-border** cast "New Orders" (interrupted: the old orders stay 20 s more). Killing it removes every order. Needs mates | kill it first or pull it away from its pack; interrupt | 18 |
| `grr_dreadful` | Dreadful | a long shadow and a low rumble; badge: screaming face | HP ×1.3, damage ×1.1 | aura 10 m: players inside deal −10% damage. **Terrify** every 20 s: 2.5 s cast with a big eye icon over it (`mech_gaze`): players **facing** it when the cast ends are feared 2 s and take 5% RH | turn your camera away as the cast ends; ranged stay outside 10 m | 20 |

**Number** (how many of it)

| id | Name | Look | Stats | What it does (exact) | Counterplay | Min |
|---|---|---|---|---|---|---|
| `grr_twin` | Twin | spawns as **two** identical bodies ("…'s Twin"), joined by a white tether; badge: two linked rings | each body has the carrier's full HP (two pools), damage ×1.0 | when one dies the other gains **Grief**: +40% damage, +25% move, and after 10 s it revives its twin at 50% health unless it dies first (a 10 s countdown on its nameplate) | bring both down together (cleave, spread damage), or burst the survivor inside 10 s | 12 |
| `grr_splitting` | Splitting | glowing seams dividing the body; badge: split circle | HP ×1.0 | on death splits into 2 copies (size ×0.7, 40% of its max health, 70% damage); each copy splits once more into 2 (size ×0.5, 15% health, 50% damage): **1 → 2 → 4, 7 bodies**. Each split lands 3 m apart and is immune for 1.0 s (shimmer). Copies keep its standard affixes, not the greater rarity | area damage; kill copies apart from each other | 10 |
| `grr_echoing` | Echoing | a faint after-image 1 m behind it; badge: double wave | HP ×1.3 | every special attack is **repeated 1.5 s later** by its Echo from where the Echo then stands; the echo's telegraph appears as its own full telegraph (normal floor) when the first one resolves | after dodging, do not step back into the shape; move across it, not back | 18 |

**Lineage** (where it came from)

| id | Name | Look | Stats | What it does (exact) | Counterplay | Min |
|---|---|---|---|---|---|---|
| `grr_ancient` | Ancient | moss or bleached-bone texture, runic scars, a slow deliberate idle, body ×1.2; badge: carved rune | HP ×2.0, damage ×1.3, armour ×1.3 | (1) knows its family's **Depth ability II** (§7.9.2, the tier-4 column) even in the open world. (2) **Old Knowledge** every 30 s: removes one debuff from itself (a rune flash) | learn the family's Depth ability; re-apply debuffs just after the flash | 20 |
| `grr_stormborn` | Stormborn | a small storm cloud 6 m above it with rain and wind lines, the ground wet under it; badge: storm cloud | HP ×1.4, damage ×1.1 | (1) **Wind Wall**: hits from more than 12 m away deal −30%. (2) **Gale** every 12 s: white arrows push every player within 15 m 8 m away from it (2.0 s warning, no damage; `mech_wind_push`, pushing outward). (3) **Hail** every 18 s: red circles 3 m under up to 4 players, 2.0 s, 12% RH | fight inside 12 m; stand with a wall at your back for the gale; spread for hail | 22 |

**Fortune** (what it carries)

| id | Name | Look | Stats | What it does (exact) | Counterplay | Min |
|---|---|---|---|---|---|---|
| `grr_gilded` | Gilded | gold-leaf body, coins spilling as it moves; badge: coin | HP ×1.5, damage ×0.8 | when first hit it **runs** (1.2× move) toward the nearest other pack within 40 m; every 10% of health it loses drops a gold purse (walk over to take). If it gets 70 m from where it was first hit, or 45 s pass, it vanishes ("Gone!") with the rest | slow, root and stun it (it takes crowd control); ranged | 5 |
| `grr_jewelled` | Jewelled | gem crystals grown through its hide, catching the light; badge: faceted gem | HP ×1.6 | **Gem Spray** every 10 s: red cone 8 m 60°, 2.0 s, 14% RH + bleed 1.5% RH/s 4 s | keep out of its front; the tank turns it away | 15 |

### 7.6 Loot and the special rarities

[Page 08](08-ITEMS.md) owns the five special rarities (Electrified, Starwoven, Twinned, Ancient, Living), their
base chances and magic find. This page owns **which monster boosts which**.

| Rule | Value |
|---|---|
| Mapped boost | every item a carrier drops rolls its **mapped** special rarity at **×5** page 08's base chance (Ancient carrier: ×8) |
| Signature drop | a flat chance that one of the carrier's drops is **guaranteed** Uncommon or better **and** has the mapped special rarity: open world **5%**, dungeon Normal **8%**, Challenge **12%**, Depth tier 3–4 **20%**, tier 5 **30%** |
| Greater pack | each member ×2 instead of ×5, no signature drop per member; the pack has **one** signature roll |
| Two mappings | a monster with two greaters boosts both (Giant Electrified: Ancient ×5 and Electrified ×5) |
| No mapping | the greater gives its **loot lean** instead (always, not a chance) |
| Personal loot | every player with credit rolls separately (00 §4) |

| Greater | Special rarity it boosts | Why | Loot lean (always) |
|---|---|---|---|
| Giant | **Ancient** | old things grow big | +1 item from the heavy-armour or two-handed bases |
| Colossal | **Ancient** | as Giant | +2 items |
| Flaming | — | fire is not one of the five | one drop has a **Fire**-tagged affix (page 05 tags) |
| Electrified | **Electrified** | the same power | — |
| Frozen | **Ancient** *(decision: ice keeps a thing as it was, so what comes out of it is old)* | | one drop has an **Ice**-tagged affix |
| Venomous | **Living** | poison is alive | — |
| Shadowed | — | | one drop has a **Shadow**-tagged affix |
| Tear-touched | **Starwoven** | the Tear is the deep sky | — |
| Plagued | **Living** | a plague grows | — |
| Ironclad | **Ancient** | old forge-work | `it_iron_scrap` ×1 per plate broken |
| Spectral | **Starwoven** | half in another place | — |
| Hollow | — | | one guaranteed **gem** (page 08 sockets) from the Heart |
| Warded | **Starwoven** | rune-work over the Tear | — |
| Vampiric | **Living** | it feeds | — |
| Undying | **Living** | it will not stay dead | — |
| Enraged | **Living** | it grows as it is hurt, like a Living item grows with kills | — |
| Swift | — | | one drop has a movement-speed or attack-speed affix |
| Unstoppable | — | | one drop has an armour or block affix |
| Cunning | — | | one drop has a critical-strike affix |
| Commanding | — | | +1 item per pack mate alive when it was pulled (max +4) |
| Dreadful | — | | one drop has a resistance affix |
| Twin | **Twinned** | two of it | — |
| Splitting | **Twinned** | many of it | — |
| Echoing | **Twinned** | it happens twice | — |
| Ancient | **Ancient** (×8) | the same age | +1 item at rarity ×2 |
| Stormborn | **Electrified** | storms carry lightning | — |
| Gilded | — | | gold ×8, +3 items at rarity ×2 (only if it dies; nothing extra if it escapes) |
| Jewelled | — | | one guaranteed **gem**; a **jewel** at 10% (Depth tier 3+: 25%) |

Coverage: Electrified 2 greaters, Starwoven 3, Twinned 3, Ancient 5, Living 5; 10 greaters have a loot lean
instead.

### 7.7 Where they appear: the open world (rolled, and common)

Every **pack spawn** in the open world rolls once, in this order:

1. **Rare?** (band chance) → the pack becomes a rare + minions (§7.3).
2. Otherwise **champion pack?** (band chance) → the whole pack becomes a champion pack (§7.2).
3. Then, independently, **greater rarity?** (band chance) →
   - on a rare: the rare carries it;
   - on a champion pack or a normal pack: roll **whole pack?** (band chance, level 20+); if not, the biggest
     body carries it (a normal pack's carrier is promoted to a lone greater, §7.5.1);
   - then roll **second greater?** (band chance) from a different group.

| Band | Levels | Champion pack | Rare | Greater rarity | … whole pack | … second greater |
|---|---|---|---|---|---|---|
| Hearthvale | 1–6 | 6% | 1.5% | 0% (Gilded only, 1%, from level 5) | — | — |
| Mossfen | 5–12 | 8% | 2% | 1% (from level 8) | — | — |
| Greyridge, Sunscar | 10–24 | 12% | 4% | 3% | 10% (from level 20) | — |
| Whisperwood, Cinder Steppe | 22–36 | 14% | 4.5% | 4% | 12% | — |
| Frostmantle, Drowned Coast | 34–48 | 15% | 5% | 5% | 15% | 10% (from level 40) |
| Riftmarch, Kingsfire | 46–60 | 18% | 6% | 7% | 20% | 15% |
| Spire Isle | 60 | 20% | 7% | 9% | 20% | 20% |

What this means on the ground: at level 30, about **one pack in five** has a blue or yellow name, and about
**one in twenty-five** carries a greater rarity. At 60 on Spire Isle it is one in four and one in eleven.
Elites, named rares and warband command ranks (Leader, Bearer, Warlord) never roll; a warband **war party**
rolls like any pack.

**Rumour and map pip.** A greater carrier within 60 m shows a small orange pip on the minimap (not through
walls), so "go and kill the glowing one" is findable (reuse idea: Farhold's rare wording in
`balance.json ranks._doc`).

### 7.8 Where they appear: dungeons (placed on purpose, rolled at the start)

In a dungeon, rarities are **not** rolled per pack. [Page 12](12-DUNGEONS.md) marks rooms with **rarity
slots**: you know a champion pack or a rare **will** be in that room; **which** affixes, greater rarity and
name it has is rolled when the run starts (seeded per run, the same for the whole party).

| Slot kind | id | What stands there |
|---|---|---|
| Champion slot | `champion` | the room's trash pack as a champion pack |
| Rare slot | `rare` | a rare of the room's family + minions |
| Greater slot | `greater` | the room's pack with one lone greater carrier |
| Greater pack slot | `greater_pack` | the whole pack carries one greater rarity |
| Wild slot | `wild` | rolls as the open world does (§7.7) for the dungeon's level band |

**Shown before the pull.** The dungeon map marks each slot room with a pip: blue (champion), yellow (rare),
orange (greater). The affixes show on the nameplates as soon as a player can see the pack. The dungeon
journal (page 03) lists the run's slot count ("This run: 2 champion packs, 1 rare, 1 greater").

**Per-run budget (trash only; bosses never roll a monster rarity):**

| Difficulty | Champion slots | Rare slots | Greater slots | Wild | Champion affixes | Rare affixes | Greater groups allowed |
|---|---|---|---|---|---|---|---|
| Normal, d01–d04 | 2 | 1 | 0 | 0 | 1 stat | 2 stat | — |
| Normal, d05–d16 | 2 | 1 | 1 | 0 | 1 | 2 | Size (Giant), Element (Flaming, Electrified, Frozen, Venomous), Mind (Enraged, Swift) |
| **Challenge** | 3 | 2 | 1 | 1 | 1 | 3 | every group; not Gilded |
| **Depth** | Challenge's (or Normal's) budget **plus** the tier row in §7.9.1 | | | | | | |

**Placement rules for page 12**: never a slot in a boss room or within 20 m of a boss's arena door; at most one
rare slot per room; on Normal a greater slot is never in the same room as a rare slot; a slot's carrier counts
toward the room's pack size, not on top of it. Dungeon rarity monsters use the dungeon warning floors of
page 11 §4 and the dungeon HP/damage caps of §7.5.1.

### 7.9 Depth: the monster side

[Page 12](12-DUNGEONS.md) owns Depth: how a depth is chosen, the level it raises the dungeon to, the health
and damage it adds, pack sizes, and rewards. Canon (00 §12.1 W3): every **5 depths is a Depth tier** that adds
more and tougher enemies, new enemy types and new enemy abilities. This section owns **those monster
additions**: more rarity slots, stronger rarities, and what each family learns at each tier. Tiers below are
named by page 12's numbering (tier 1 = the first five depths, and so on).

#### 7.9.1 What each tier adds to rarities

| Tier | Extra champion slots | Extra rare slots | Extra greater slots | Greater groups unlocked | Max greaters on one monster | Champion affixes | Rare affixes | Minions per rare | Family content (§7.9.2) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | +1 | +0 | +0 | Size (Giant), Element (Flaming, Electrified, Frozen, Venomous) | 1 | 1 | 3 | +0 | — (page 12's numbers only) |
| 2 | +2 | +1 | +1 | + Body, Mind | 1 | 1 | 3 | +1 | **Depth ability I** on every normal member of the family |
| 3 | +2 | +1 | +2 | + Number, Lineage, the rest of Element, Colossal, Jewelled | 2 | 1, + 1 stat on the pack's biggest member | 3 | +1 | the **Depth type**: one new monster per family joins its packs |
| 4 | +3 | +2 | +2 (one is a `greater_pack`) | all | 2 | 2 | 3 + one greater rarity | +2 | **Depth ability II** on every member, rare and carrier included |
| 5 | +3 | +2 | +3 (one is a `greater_pack`) | all | 3 | 2 | 3 + one greater rarity | +2 | the **Depth warden**: one elite per run from the dungeon's main family |

Rules: Depth never shortens a warning (page 11 §4.1); Depth abilities never add a lethal hit to trash; a
tier's additions stack with the earlier tiers'. Undying's second life and Ironclad's plate regrowth start at
tier 4 (their rows say so).

#### 7.9.2 Depth additions per family

Every family that can fill a dungeon has four additions. **Depth ability I** (tier 2) is given to every normal
member of the family; **the Depth type** (tier 3) is a new monster that joins that family's packs (1 per pack);
**Depth ability II** (tier 4) is given to every member; **the Depth warden** (tier 5) is an elite (rank
`elite`, page 11 elite budget) that stands in one room per run. All new monster ids are `(new)` and use
existing bodies unless marked. They are tied to the Tear in look: each Depth type carries thin violet-white
cracks on its body (the Tear's light, 00 §12.4).

| Family | Depth ability I (tier 2) | Depth type (tier 3) | Depth ability II (tier 4) | Depth warden (tier 5) |
|---|---|---|---|---|
| `beast` | **Blood Scent**: +20% move toward players below 50% health; its first bite on one of them bleeds 2% RH/s 6 s | `m_beast_rift_stalker` Rift Stalker · creature dire_wolf ×2.4, violet stripes · melee, ambusher · *Pounce Through*: vanishes 1.5 s, reappears behind the healer (red circle 2 m, 2.0 s), 12% RH | **Pack Howl**: when half its pack is dead, the survivors howl: +25% attack speed 8 s (a red rim on each body) | `m_beast_old_mother` The Old Mother · creature bear ×3.2 · brute · *Den Call* (2 swarms of cubs, 2.0 s spawn glow), *Crushing Hug* (`mech_grab_hold`) |
| `folk` | **Caltrops**: below 50% health each melee member drops a void 3 m, 1% RH per 0.5 s + slow 30%, 10 s | `m_folk_threadcutter_adept` Threadcutter Adept · chibi: human · warlock · caster · *Cut the Thread*: 2.5 s gold-border cast; the yellow-targeted player's next heal received is lost | **Dying Oath**: when a folk member dies the nearest ally gains +30% damage 6 s (red banner motes) | `m_folk_threadcutter_master` Threadcutter Master · chibi: human ×1.3 · warlock · caster · *Unpicking*: white tether between 2 players, break at 15 m, 3% RH per 0.5 s while linked |
| `fen` | **Sucking Mud**: where a fen normal dies, a 2 m mud patch (`mech_env_quicksand`): root after 3 s inside | `m_fen_peat_hulk` Peat Hulk · creature golem ×2.6, moss body · brute · *Bog Slam*: red circle 5 m, 2.0 s, 20% RH, leaves a mud patch 5 m | **Spore Link**: fen monsters within 8 m of each other share damage taken 50/50 (a white spore thread between them) — pull them apart | `m_fen_rotmother` The Rotmother · creature slime ×3.4 · brute · splits into 4 at 50% (each 20% health) |
| `construct` | **Overheat**: after 3 specials a construct vents: red circle 4 m, 2.0 s, 12% RH fire; then takes +20% damage 4 s | `m_construct_siege_crawler` Siege Crawler · creature spider ×2.4, brass · ranged · *Mortar*: 3 red circles 3 m at players 20–35 m away, 2.0 s, 14% RH | **Linked Frames**: when a construct dies, others within 10 m gain +15% damage reduction (max 3 stacks) | `m_construct_anvil_titan` Anvil Titan · creature titan ×3.0 · brute · *Hammerfall*: red cross 20 m arms × 4 m, 2.5 s, 30% RH (`mech_cross_blast`) |
| `sand` | **Burrow Back**: at 30% health a sand monster burrows 3 s and surfaces 10 m away healed 10% (a moving ridge) | `m_sand_mirrorback_scorpion` Mirrorback Scorpion · creature beetle ×2.4, glass · melee · *Refracting Shell*: every 12 s reflects 30% of spell damage for 3 s (silver shell) | **Heat Patch**: each death leaves a 3 m void, 2% RH per 0.5 s, 8 s | `m_sand_sand_tyrant` The Sand Tyrant · creature worm ×4.0 · brute, burrower · *Breach* ×3 in a row (red circles 5 m, 2.5 s, 22% RH) |
| `fae` | **Thorn Bind**: a fae melee's 3rd hit in a row on the same player roots them 1 s | `m_fae_changeling` Changeling · chibi: elf · rogue · melee, ambusher · looks like a friendly traveller (green name) until 10 m, then *Knife in the Back* 14% RH | **Moon's Favour**: fae healers' heals also remove one control effect from the ally | `m_fae_briar_queen` The Briar Queen · chibi: elf ×1.4 · druid · healer/caster · *Bramble Ring*: void ring 8 m, 1.5 m thick, 12 s |
| `frost` | **Frostbite**: basic hits add Chill; 5 stacks = frozen 1 s | `m_frost_rime_herald` Rime Herald · creature elemental ×2.4 · caster · *Ice Wall*: void line 12 m × 2 m, 8 s (`mech_void_line_wall`) | **Glacial Armour**: at 50% health gains a shell of 15% max health; Fire-tagged damage ×2 against it | `m_frost_hoar_wyrm` Hoar Wyrm · creature dragon ×3.2 · brute · *Frost Breath* (`mech_breath_cone`, 30% RH) |
| `drowned` | **Standing Water**: each Drowned pull floods the room floor 0.3 m: −10% move for players (cosmetic water + icon) | `m_drowned_tidecaller` Tidecaller · chibi: undead · priest · caster · *Undertow* (`mech_undertow_pool`) | **Barnacle Crust**: −30% damage from hits more than 15 m away | `m_drowned_deepspawn` Deepspawn · creature horror ×3.4 · brute · *Tentacle Field* ×5 in sequence |
| `rift` | **Phase Slip**: after 3 melee hits inside 3 s, flickers 6 m away (purple flicker at the destination 1.0 s; no damage) | `m_rift_null_eye` Null Eye · creature shard ×2.0 with one eye · caster · *Stare*: `mech_gaze`, dazed 2 s | **Unravelling**: hits stack Unravel (−3% max health, 10 s, max 10) | `m_rift_seam_warden` Seam Warden · creature titan ×3.0, see-through · brute · *Null Field* (`mech_null_field`) |
| `kingsfire` | **Brand Flare**: on death, red circle 3 m, 2.0 s, 10% RH fire | `m_kingsfire_pyre_warden` Pyre Warden · creature golem ×2.6 · brute, support · plants a burning brazier (object add, HP ×0.5) that gives monsters within 10 m +15% damage | **Legion Discipline**: while 3+ members of a pack live, all are immune to knockback | `m_kingsfire_brand_general` Brand-General · chibi: human ×1.6 · knight · leader · *Call the Legion* (2 Legionnaires), *Sunder* (`mech_sundering_blow`) |
| `demon` | **Brimstone Blood**: each death leaves a fire void 3 m, 6 s, 3% RH per 0.5 s | `m_demon_gate_fiend` Gate Fiend · creature imp ×2.2 · caster, caller · opens a small gate (object add, HP ×0.6) that spawns 2 Cinder Imps every 12 s until destroyed | **Demon Pact**: a demon below 30% health swaps health with the healthiest demon within 15 m (purple link, 1.5 s warning, once each) | `m_demon_pit_tyrant` Pit Tyrant · creature titan ×3.2, horns (+feature) · brute · *Devour* (`mech_grab_hold`), *Stomp* |
| `tear` | **Tear Pressure**: +3% damage per other tear monster within 15 m (max +15%) | `m_tear_starcaller` Starcaller · chibi: elf · sorcerer · caster · *Falling Star*: soak 4 m, 2 pips, 3.0 s (`mech_soak_meteor`, 100% RH split; under-soaked 40% RH to all) | **Unmade**: takes −25% from whatever damage **tag** hit it last (an icon shows which) | `m_tear_mendbreaker` Mendbreaker · creature titan ×3.4 · brute · *Fold Space* (`mech_swap_places`), *Quake* |
| `undead` | **Grave Rise**: a normal undead stands again at 20% health 3 s after death unless its corpse is hit (bone glow on the corpse) | `m_undead_ossuary_golem` Ossuary Golem · creature golem ×2.6, bone-built · brute · *Bone Storm*: red circle 5 m ×3 pulses 1.0 s apart, 2.0 s first warning, 12% RH each | **Deathly Chill**: hits reduce healing received 10% (max 3 stacks, 8 s) | `m_undead_grave_lord` Grave Lord · chibi: undead ×1.8 · necromancer · caster · raises 3 Bonesoldiers at 60% and 30% |
| `goblin` | **Bomb Toss**: each goblin throws one bomb per fight: red circle 3 m, 2.0 s, 12% RH | `m_goblin_sootwick_bombardier` Sootwick Bombardier · chibi: goblin · tinker · ranged · *Bomb Barrage*: 4 red circles 3 m, 2.0 s, 10% RH each | **Dirty Fighting**: +30% damage from behind | `m_goblin_junk_hulk` Junk Hulk · creature golem ×2.8, scrap-built, a goblin pilot on top · brute · *Scrap Spin*: red circle 6 m, 2.5 s, 22% RH |
| `orc` | **Blood Frenzy**: +10% attack speed per orc death within 15 m (max 3) | `m_orc_ashtusk_berserker` Ashtusk Berserker · chibi: orc ×1.2 · warrior · melee · *Whirl*: red circle 4 m, 3 hits 0.6 s apart, 2.0 s first warning, 8% RH each | **War Drums**: the Warchief's *Warcry* also heals the band 10% | `m_orc_ashtusk_bloodchief` Ashtusk Bloodchief · chibi: orc ×1.7 · warrior · leader · *Headtaker* (`mech_headtaker`) |
| `beastkin` | **Quarry**: the first player a Thornmane hits is marked: the pack deals +10% to them 8 s (yellow icon over their head) | `m_beastkin_thornmane_skinchanger` Thornmane Skinchanger · chibi: beast · druid → at 50% becomes a creature dire_wolf ×2.4 · melee | **Pack Tactics**: two beastkin on the same player each get +15% damage | `m_beastkin_thornmane_moonfang` Moonfang Elder · chibi: beast ×1.8 · shaman · caster/melee · *Leaping Hunt* (3 yellow targeted leaps) |
| `giant` | **Boulder Toss**: each giant throws one boulder per fight: red circle 4 m at up to 30 m, 2.5 s, 16% RH | `m_giant_stonehide_runecarver` Stonehide Runecarver · chibi: giant · runesmith · caster · *Rune Mines*: 3 small red circles 2 m that arm 2 s after appearing and burst when stepped on (12% RH) | **Earthshaker**: melee hits knock back 4 m (was 2 m) | `m_giant_stonehide_mountainborn` Mountainborn · chibi: giant ×2.2 · warrior · brute · *Avalanche*: moving wave 4 m deep with 2 gaps (`mech_marching_wave`) |
| `dragon` | **Scaled Hide**: −20% damage from the front 120° | `m_dragon_wyrmling` Wyrmling · creature drake ×1.8 · melee, pack 3–4 · *Spark Breath*: cone 5 m, 1.0 s, 5% RH (chip) | **Wing Buffet**: every dragonkin brute gains a red cone 8 m, 2.0 s, knockback 8 m, 6% RH | `m_dragon_elder_drake` Elder Drake · creature dragon ×3.4 · brute · *Breath* + *Tail Sweep* (`mech_breath_cone`, `mech_tail_sweep`) |

18 families × 4 = 18 abilities I, 18 Depth types, 18 abilities II, 18 wardens (36 new monster ids). A
dungeon's page 12 entry names its main family (for the warden) and every family its packs use.

### 7.10 How rarity monsters telegraph

Standard affixes and greater rarities use only the [page 11](11-BOSS-MECHANICS.md) vocabulary (danger, void,
soak, safe, targeted, beneficial, tether; the same shapes and sounds). Page 11 §22.5 owns the extra rules:
the rarity **badge** on the cast bar, the "second attack comes from the rarity" cue, the warning floors, and
the table that maps each greater rarity's extra attack to its colour and shape.

---

## 8. Named rares per region

Named rares are hand-authored rares with a fixed body, modifiers, a signature ability, a spawn rule and a
loot table. They use the page 11 **elite** mechanic budget (§22 there: up to 3 mechanics, warnings ≥ 2.0 s,
no one-shots). Their nameplate is yellow with a crown pip; the zone map shows a **skull pip** when a named rare
is up and the player has heard its rumour (reuse: Farhold `js/rumours.js`).

Spawn rule notation: *placeholder* = it replaces one normal of its base type at its spot; timer = min–max
respawn after death; **condition** = a world state that must be true for it to spawn (weather, a world event, a
kill count). The round-1 night-only rares now wait for a condition instead (always daylight, 00 §4).

**Greater rarities on named rares.** From level 20 up, some named rares carry one **fixed** greater rarity
(§7.5): it is part of their design, uses the greater's own row, and its loot mapping (§7.6) applies. They are
not re-rolled. The Ashen Matron is now **Frozen** (a phoenix of ice, reborn twice), which keeps her old
"ice-fire oddity" as one element.

| id | Name | Region | Lv | Base / body | Modifiers | Greater rarity | Signature | Spawn rule | Loot |
|---|---|---|---|---|---|---|---|---|---|
| `m_beast_old_gristlejaw` | Old Gristlejaw | Hearthvale | 5 | Thicket Boar ×1.5 size | Vital, Quakeborn | — | *Uprooting Charge*: charge line 16 m that tears up the orchard (fallen trees become obstacles 30 s) | placeholder for a Thicket Boar in Pellam's orchard; 20–40 min | Rare `it_gristlejaw_tusk` (trinket), 5% `uq_gristlejaw_tuskhelm` |
| `m_folk_mother_rook` | Mother Rook | Hearthvale | 6 | chibi human · rogue, black feather cape | Fleet, Packcaller | — | calls 6 Orchard Rooks that *Peck Eyes* | the scarecrow field; condition: the field's crows have been scattered (a player walked through them) in the last 10 min; 30–60 min | Rare cloak, 5% `uq_rookfeather_mantle` |
| `m_undead_sexton_hobb` | Sexton Hobb | Hearthvale | 6 | chibi undead · cleric, shovel | Graveborn, Gravesoil | — | *Dig*: raises 2 Barrow Shamblers from the ground every 20 s | Brightwater graveyard edge; condition: 10 Barrow Shamblers killed there within 15 min | Rare shovel-mace, 5% `uq_sextons_spade` |
| `m_fen_the_mire_queen` | The Mire Queen | Mossfen | 11 | Bog Slime ×2.4 size, crown of reeds | Vital, Blightbearer | — | splits twice (at 66% and 33%) into Mire Princes that must die within 20 s of each other or they re-merge | peat pits; 40–60 min | Rare, 5% `uq_mire_crown` |
| `m_fen_one_eyed_nell` | One-Eyed Nell | Mossfen | 10 | Peatwife | Aegis-Bearer, Runed | — | heals every monster within 20 m 8% every 6 s (interruptible) | any stilt village ruin, placeholder for a Peatwife; 30–50 min | Rare staff, 5% `uq_nells_eye` |
| `m_fen_longjaw` | Longjaw | Mossfen | 12 | Silt Lurker ×1.6 | Steadfast, Hollowed | — | *Death Roll* grabs 2 s; a second player must hit it for 5% health to free | the drowned ferry landing; 45–75 min | Rare boots, 5% `uq_longjaw_hide` |
| `m_construct_warden_seven` | Warden Seven | Greyridge | 16 | Shale Warden ×1.4, brass bands | Plated, Stonecaller | — | *Seal the Tunnel*: walls off one of 3 exits; the others open | abandoned rail junction; 30–50 min | Rare shield, 5% `uq_seventh_plate` |
| `m_folk_blackpowder_bess` | Blackpowder Bess | Greyridge | 17 | Blackshaft Powderwife | Siegeborn, Scorchtrail | — | a keg ring: 6 kegs in a circle, one lit every 2 s | quarry floor; 30–60 min | Rare crossbow, 5% `uq_bess_fuse` |
| `m_beast_skarn` | Skarn the Grey | Greyridge | 14 | Crag Bear ×1.6, grey | Vital, Frenzied | — | at 30% sleeps 5 s (heals 10% unless hit for 5% of its health) | high meadow den; 40–60 min | Rare chest, 5% `uq_skarn_pelt` |
| `m_sand_the_glass_widow` | The Glass Widow | Sunscar | 22 | Sunscar Stinger ×1.8, glass body | Mirrorhide, Toxic | — | lays 4 glass eggs that hatch Stingers in 12 s | the glass tombs' outer court; condition: glass-storm weather; 40–60 min | Rare dagger, 5% `uq_glass_widow_fang` |
| `m_sand_old_thirst` | Old Thirst | Sunscar | 24 | Dune Breacher ×1.4 | Steadfast, Quakeborn | Giant | burrows toward the player who moved least in the last 5 s | the dry sea; condition: sandstorm weather; 60–90 min | Rare belt, 5% `uq_thirst_girdle` |
| `m_folk_kasra_dustmother` | Kasra Dustmother | Sunscar | 21 | Dust Reaver · chibi human · swashbuckler parts | Flickerstep, Packcaller | — | *Mirage Double*: makes 2 Mirage Walker copies of herself | caravan wreck site; 30–50 min | Rare rapier, 5% `uq_dustmother_shawl` |
| `m_fae_hollowhart` | Hollowhart | Whisperwood | 28 | Dread Stag ×1.8, white | Fleet, Hollowheart | — | the forest fog thickens (vision 20 m) during the fight | a ring of standing stones; condition: while the stones glow (1 hour in every 4, server clock); 60–120 min | Rare bow, 8% `uq_hollowhart_antler` |
| `m_fae_the_gloam_prince` | The Gloam Prince | Whisperwood | 30 | Gloamward Blade · elf rogue, silver hair, circlet | Cloaked, Flickerstep | Twin | *Court Duel*: challenges one player (a white tether 10 m for 8 s — others cannot hit him while it lasts) | a moonwell glade; 45–75 min | Rare dagger, 5% `uq_gloam_circlet` |
| `m_fae_mother_of_threads` | Mother of Threads | Whisperwood | 26 | Shroud Spider ×2.0 | Toxic, Shackler | — | webs the glade: 4 web patches (void zones that root 1 s) | canopy nest; 40–60 min | Rare cloak, 5% `uq_threadmother_silk` |
| `m_beast_ashmane` | Ashmane | Cinder Steppe | 34 | Steppe Saber ×1.6, black mane | Cloaked, Hollowed | Shadowed | stalks the player for 60 s before attacking (a rumble cue every 10 s) | grass sea; 45–75 min | Rare, 5% `uq_ashmane_claw` |
| `m_dragon_scorchwing` | Scorchwing | Cinder Steppe | 36 | Steppe Drake ×1.8, wings (+feature) | Scorchtrail, Fiery | Flaming | sets the grass alight in a 30 m ring (arena wall of fire 20 s) | the burnt mesa; 60–90 min | Rare, 5% `uq_scorchwing_scale` |
| `m_beast_the_grey_herd` | The Grey Herd | Cinder Steppe | 32 | 1 Ashhorn Ox bull ×1.6 + 6 cows | Steadfast (bull) | — | *Stampede* every 15 s in a new direction | wanders the east steppe (a moving spawn); 30–60 min | Rare, 5% `uq_herdbull_horn` |
| `m_frost_whitemaw` | Whitemaw | Frostmantle | 40 | Drift Lurker ×1.5 | Hoarfast, Cloaked | — | the whole 40 m ice field is its ground; surfaces 4 times | the Silent Floe; 60–90 min | Rare, 5% `uq_whitemaw_tooth` |
| `m_frost_the_long_winter` | The Long Winter | Frostmantle | 42 | Rime Elemental ×2.6 in a blizzard (fog up) | Frostbound, Spellwoven | Frozen | the arena is the fight: Chill meter fills 2× unless standing in the green beneficial circles it cannot enter | the high col; condition: blizzard; 90–150 min | Rare, 8% `uq_long_winter_shard` (reuse: `BESTIARY-IDEAS.md` The Long Winter) |
| `m_frost_grandmother_tick` | Grandmother Tick | Frostmantle | 37 | Glacier Tick ×3.0 | Manyfold, Vital | — | births 6 ticks every 15 s until killed | ice caves; 30–50 min | Rare, 5% `uq_tick_carapace` |
| `m_drowned_captain_vell` | Captain Vell | Drowned Coast | 46 | Brine Knight · chibi undead captain (tricorn) | Undertow, Cinderchain | Undying | calls a Tide Thrall boarding party of 5 at 66% and 33% | the wreck of the *Gull's Oath*; condition: high tide (the coast's 40-minute tide cycle); 45–75 min | Rare, 5% `uq_vells_spyglass` |
| `m_drowned_the_bell_below` | The Bell Below | Drowned Coast | 48 | Drowned Bellringer ×1.6 | Packcaller, Aegis-Bearer | — | each toll raises the tide 0.5 m (void zone rises from the low ground) | the drowned belfry; condition: low tide; 60–90 min | Rare, 5% `uq_bell_clapper` |
| `m_drowned_saltmother` | Saltmother | Drowned Coast | 44 | Kelp Slime ×2.4 | Blightbearer, Undertow | — | undertow pools merge into one large pool | tide flats; 30–50 min | Rare, 5% `uq_saltmother_pearl` |
| `m_rift_the_thing_sewn_wrong` | The Thing Sewn Wrong | Riftmarch | 52 | Stitchwork ×1.6 | Steadfast, Hollowed | Splitting | each Splitting copy is a different body plan (quad, spider, biped) | the butcher's rift; 60–90 min | Rare, 5% `uq_stitchers_needle` |
| `m_rift_no_one` | No One | Riftmarch | 54 | Absence ×1.4 | Cloaked, Wardbreaker | — | takes a player's mount skill and dodge roll for 20 s on hit | anywhere in the region (moves each spawn); 90–120 min | Rare, 8% `uq_nobodys_mask` |
| `m_rift_prismatic_warden` | The Prismatic Warden | Riftmarch | 50 | Abyssal Prism ×2.0 | Spellwoven, Mirrorhide | — | 3 beams at once rotating opposite ways | floating slab 7; 40–60 min | Rare, 5% `uq_prism_core` |
| `m_kingsfire_cinderlord_hask` | Cinderlord Hask | Kingsfire | 57 | Magma Golem ×1.4 | Scorchtrail, Quakeborn | Ancient | erupts 3 times; each leaves more lava | the slag river; 45–75 min | Epic chance ×2, 5% `uq_hask_heart` |
| `m_demon_the_hungry_gate` | The Hungry Gate | Kingsfire | 59 | Ashmaw Fiend ×1.5 | Starved, Packcaller | — | at 50% the fire gate behind it pours Brimstone Hounds every 10 s until it dies | a fire gate; condition: the gate is open (world event); 60–120 min | Epic chance ×2, 5% `uq_gatejaw` |
| `m_kingsfire_ashen_matron` | The Ashen Matron | Kingsfire | 60 | Ashen Phoenix ×2.0 | Rimed, Hoarfast | Frozen | reborn twice | the caldera rim; condition: while the caldera erupts (world event); 60–90 min | Epic chance ×2, 5% `uq_matron_feather` |
| `m_tear_the_hollow_crown` | The Hollow Crown | Spire Isle | 60 | Spire Warden ×1.4 with a crown | Aegis-Bearer, Oathsworn, Stonecaller | Commanding | leads 6 Spire Wardens; each dead warden empowers him | the ruined throne court; 60–90 min | Epic, 8% `uq_hollow_crown` |
| `m_tear_seer_without_eyes` | The Seer Without Eyes | Spire Isle | 60 | Void Prophet | Flickerstep, Wardbreaker, Spellwoven | Tear-touched | *Foretold*: shows a red danger zone 5 s **before** it happens (unusual reverse telegraph: very long warning, very big hit 60% RH) | the observatory stair; condition: while the observatory lens is lit (world event); 60–90 min | Epic, 8% `uq_eyeless_seal` |
| `m_tear_the_last_titan` | The Last Titan | Spire Isle | 60 | Null Titan ×1.3 | Vital, Quakeborn, Siegeborn | Colossal | *Null Field* covers half the arena and swaps sides every 20 s | the broken bridge; 120–180 min | Epic, 10% `uq_titan_knuckle` |

**Rules for named rares.**
- At most **one** named rare per region is alive at a time per shard (world instance); the others wait.
- **Placeholder** spawns: when a placeholder's timer is up, the next time that normal spawn point respawns,
  it has a 25% chance to be the named rare instead.
- Kill credit: every player who dealt ≥ 5% of its health gets **personal loot** (page 08).
- First kill per character records it in the bestiary journal (§11) and counts toward the family's journal
  title (page 07).
- Named rares **do not leash** within 70 m but **do** evade if their spot is abandoned for 15 s.

---

## 9. Warbands and the Kingsfire Legion

(reuse: Farhold `data/warbands.json`, `js/warbands.js`, `js/patrols.js`, `js/sites.js placeWarCamps`,
R26 + R27 M9–M10.) Everything that works in Farhold is kept: members as ordinary bestiary entries, a zone
**held** by at most one warband, **grip** (0–1) that the player's kills push down and time regrows, war
parties on the roads, a **war camp** per held zone with a sealed war-chest, a **warlord**, a leader aura,
a standard-bearer, and a **rout** when the leader falls.

What changes in Wildmarch:

| Farhold | Wildmarch |
|---|---|
| a zone is held by a seeded roll | a warband holds **named sub-zones** of the regions in 00 §7 (page 01 names them); still at most one hostile holder per sub-zone |
| grip is per player save | grip is **per shard** (shared by everyone in that world copy), drifts back toward the story value at `gripRegen` 0.1 per hour of server time (reuse; the number is Farhold's per-day value re-timed because there is no day cycle); the war front is an open-world event on page 14 |
| 6 members (melee, rogue, ranged, caster, leader, bearer) | 7 members: + a **healer** (the Mender), so every warband fights as a party |
| levels up to 50 | re-banded to the 1–60 ladder (below) |
| leader aura damage ×1.15 (`balance.warbands.leaderAura`) | kept; standard-bearer aura adds +10% damage **reduction** within 15 m |
| rout: each follower 50% to flee 6 s, at least one | kept (`routChance` 0.5, `routSeconds` 6) |
| warlord: a humanoid boss 1.6–2.2× with 2–3 phases `{at, modifier, say}` | kept as the camp boss, now with page 11 elite-tier mechanics (≤ 4, no one-shots) and dialog lines; ids become `b_<warband>_<snake>` |
| one unique per warband (`fh_*`) | one **uq_** per warband from the war-chest (page 09 catalogues) |

### 9.1 Ranks inside a warband

| Rank | Role | What it does in the fight | Farhold type |
|---|---|---|---|
| **1 Grunt** | melee / brute | the front line; 2–3 per war party | brute |
| **2 Cutter** | melee (flanker) | goes for the back line; +15% from behind; bleeds | skirmisher (rogue) |
| **3 Shooter** | ranged | holds 20 m, shoots the lowest-armour player | archer |
| **4 Caller** | caster | area damage, one crowd-control spell | caster |
| **5 Mender** | healer (new) | heals and shields; stands behind the Grunts | (new) |
| **6 Standard-bearer** | brute + support; tag `command` (§3.1) | plants its banner (a 15 m aura: allies +10% damage reduction); killing it ends the leader aura early | bearer |
| **7 Leader** | leader (champion-capable); tag `command` (§3.1) | points out a target (the first player it sees; that player is **marked**, +10% damage taken 8 s, yellow targeted icon); aura +15% damage to its band; its death routs | leader |
| **8 Warlord** | boss (camp); tag `command` (§3.1) | page 11 elite budget; phases; calls Grunts | warlord |

Leader and bearer are always visibly different: a leader wears the warband colour on its cape and a head
piece; a bearer carries a banner on its back tinted with the warband colour (reuse: `warbanner` piece).

### 9.2 The Sootwick Gang — goblins (levels 2–18)

Colour #c8a040. Race `goblin` (chibi). Holds: Hearthvale east orchards (3–6), Mossfen causeways (5–12),
Greyridge mine galleries (10–18). Camp: the **Junkyard** (junk wall). Cutpurses and hexers who strip
anything left on the road; a Sootwick hit can **steal** a consumable (1 per fight per player, dropped back
on death). Unique: `uq_gutterkings_shiv` (reuse: `fh_gutterkings_shiv`).

| id | Rank | Name | Lv | Body | HP× | Abilities |
|---|---|---|---|---|---|---|
| `m_goblin_sootwick_basher` | Grunt | Sootwick Basher | 2–18 | chibi: goblin · rags, held iron_mace | 1.6 | *Knee-Breaker*: red cone 3 m, 2.0 s, 10% RH + slow 30% 3 s |
| `m_goblin_sootwick_knifer` | Cutter | Sootwick Knifer | 2–18 | chibi: goblin · rogue | 1.0 | `bleed` on hit; *Pickpocket* steals a potion |
| `m_goblin_sootwick_slinger` | Shooter | Sootwick Slinger | 3–18 | chibi: goblin · sling | 0.8 | *Pebble Storm*: 3 shots, 4% RH each |
| `m_goblin_sootwick_hexer` | Caller | Sootwick Hexer | 4–18 | chibi: goblin · warlock (bone charms) | 0.75 | *Stinkhex*: void zone 4 m poison 2% RH/0.5 s, 8 s (2.0 s cast, interruptible) |
| `m_goblin_sootwick_patcher` | Mender | Sootwick Patcher | 4–18 | chibi: goblin · tinker parts (bandage bandolier) | 0.8 | *Slap a Patch*: 10% heal, 1.5 s, interruptible |
| `m_goblin_sootwick_flagrunner` | Bearer | Sootwick Flag-Runner | 5–18 | chibi: goblin ×1.1 · banner | 1.6 | runs the banner away from melee (hard to pin) |
| `m_goblin_sootwick_ringleader` | Leader | Sootwick Ringleader | 5–18 | chibi: goblin ×1.2 · swashbuckler parts | 2.5 | *Everybody Grab Something!*: all Knifers steal at once (once per fight) |
| `b_sootwick_gutterking` | Warlord | the Gutterking | 8 / 14 / 18 (three camps) | chibi: goblin ×1.6, crown of spoons | boss | 60% whistles (2 Bashers + Fleet), 30% Vicious; *Junk Avalanche*: red cone 8 m 2.5 s 22% RH; *Loot Grab*: yellow targeted 2.0 s steals a buff (reuse: `sootwick_gutterking`) |

### 9.3 The Unburied Legion — undead (levels 12–24)

Colour #7ae0ff. Race `undead`. Holds the Greyridge barrows (12–18) and the Sunscar tomb edges (19–24).
Camp: the **Barrow-Fort**. A dead army that never stopped marching. Its old master, the **Barrowking**, was
a raid boss and is parked with the raids in `WISHLIST.md`; in v2 the Unburied answer to the Gravemarshal.
Unburied do not rout (they are dead): their leader's death instead makes each follower
**collapse** for 6 s (50% chance, reuse `rout` timing) and stand up again at 30% health unless its bones are
hit (any damage) while down. Unique: `uq_gravemarshals_oath`.

| id | Rank | Name | Lv | Body | HP× | Abilities |
|---|---|---|---|---|---|---|
| `m_undead_unburied_bonesoldier` | Grunt | Unburied Bonesoldier | 12–24 | chibi: undead · warrior (rusted) | 1.8 | *Bone Wall*: 3 Bonesoldiers side by side block frontal projectiles |
| `m_undead_unburied_gravecreeper` | Cutter | Unburied Gravecreeper | 12–24 | chibi: undead · rogue | 1.0 | `poison` on hit; digs under and resurfaces behind (red circle 2 m, 2.0 s) |
| `m_undead_unburied_deadeye` | Shooter | Unburied Deadeye | 13–24 | chibi: undead · ranger | 0.8 | *Bone Volley*: 5 red circles 2 m in a line, 2.0 s, 8% RH each |
| `m_undead_unburied_mournweaver` | Caller | Unburied Mournweaver | 14–24 | chibi: undead · necromancer | 0.75 | *Grave Chill*: `curse` −25% healing 8 s (dispellable); raises a fallen Grunt once |
| `m_undead_unburied_embalmer` | Mender | Unburied Embalmer | 14–24 | chibi: undead · priest (wraps) | 0.8 | *Rewrap*: heals an ally 12%, and makes a dying ally stand at 20% once (2.5 s, interruptible) |
| `m_undead_unburied_coloursergeant` | Bearer | Unburied Colour-Sergeant | 15–24 | chibi: undead ×1.1 · banner | 1.8 | banner aura as §9.1 |
| `m_undead_unburied_deathmarshal` | Leader | Unburied Deathmarshal | 16–24 | chibi: undead ×1.2 · knight | 2.6 | *Close Ranks*: allies within 10 m +20% armour 8 s |
| `b_unburied_gravemarshal` | Warlord | the Gravemarshal | 18 / 24 | chibi: undead ×2.0 · knight | boss | 70% Plated + 2 Bonesoldiers; 40% Leeching; 15% Unyielding (reuse: `unburied_gravemarshal`); *March of the Dead*: a moving wave of skeleton soldiers across the arena (red band 3 m deep, 2.0 s warning, 20% RH, gaps marked) |

### 9.4 The Thornmane Packs — beastkin (levels 20–32)

Colour #7aa84a. Race `beast` (chibi beastkin). Hold the Sunscar mesas (20–24) and the eastern Whisperwood
(22–30), and hunt into the southern Cinder Steppe (28–32). Camp: the **Den-Ring** (thorn ring, hide tents).
Hunting packs who run down anything that walks their ground: Thornmane **hunt** — a war party that sees
you from 60 m follows your trail (tracks shown on the ground) for 90 s before it charges.
Unique: `uq_moonhook`.

| id | Rank | Name | Lv | Body | HP× | Abilities |
|---|---|---|---|---|---|---|
| `m_beastkin_thornmane_ravager` | Grunt | Thornmane Ravager | 20–32 | chibi: beast · barbarian parts (hide, held axe2h) | 1.8 | *Hack and Hew*: 2 hits, red cone 3 m, 2.0 s, 10% RH each |
| `m_beastkin_thornmane_skulker` | Cutter | Thornmane Skulker | 20–32 | chibi: beast · rogue (claws) | 1.0 | *Hock Cut*: slow 40% 4 s |
| `m_beastkin_thornmane_tracker` | Shooter | Thornmane Tracker | 21–32 | chibi: beast · ranger | 0.8 | *Quarry Mark*: marked target takes +10% from the pack 10 s |
| `m_beastkin_thornmane_moonseer` | Caller | Thornmane Moonseer | 22–32 | chibi: beast · shaman | 0.75 | *Moonbolt Chain*: 7% RH lightning to 3 targets within 8 m |
| `m_beastkin_thornmane_bonesetter` | Mender | Thornmane Bonesetter | 22–32 | chibi: beast · druid | 0.8 | *Pack Howl*: heals all allies within 10 m 6% (2.0 s, interruptible) |
| `m_beastkin_thornmane_totembearer` | Bearer | Thornmane Totem-Bearer | 23–32 | chibi: beast ×1.1 · totem on back | 1.8 | plants a totem (the banner) that must be destroyed separately (HP ×0.5) |
| `m_beastkin_thornmane_packlord` | Leader | Thornmane Packlord | 24–32 | chibi: beast ×1.2 · wolf_helm | 2.6 | *Run Them Down*: whole band +30% move 6 s |
| `b_thornmane_greatfang` | Warlord | the Greatfang | 26 / 32 | chibi: beast ×1.9 | boss | 66% Fleet + howl calls 2 Ravagers; 33% Vicious, drops to all fours (reuse: `thornmane_greatfang`); *Leaping Hunt*: 3 yellow targeted leaps 2.0 s each, 18% RH |

### 9.5 The Ashtusk Warhost — orcs (levels 26–40)

Colour #b8402a. Race `orc`. Home: the Cinder Steppe (28–36) with war camps; war parties push into Whisperwood's
north edge (26–30) and Frostmantle's southern passes (34–40). Camp: the **Warcamp** (palisade and bone
totems). Orcs ride Cinderback Boars (a Grunt at level 30+ has a 20% chance to be mounted: +50% move, charges).
Unique: `uq_ashtusk_headtaker`.

| id | Rank | Name | Lv | Body | HP× | Abilities |
|---|---|---|---|---|---|---|
| `m_orc_ashtusk_brute` | Grunt | Ashtusk Brute | 26–40 | chibi: orc · warrior (rags, axe) | 1.8 | *Cleave*: red cone 4 m 120°, 2.0 s, 12% RH |
| `m_orc_ashtusk_cutthroat` | Cutter | Ashtusk Cutthroat | 26–40 | chibi: orc · rogue | 1.0 | `bleed`; *Firebrand*: sets 3 m of grass on fire (void zone 6 s) |
| `m_orc_ashtusk_spearthrower` | Shooter | Ashtusk Spearthrower | 27–40 | chibi: orc · javelins | 0.8 | *Pinning Spear*: yellow targeted 2.0 s, 10% RH + root 1 s |
| `m_orc_ashtusk_bonecaller` | Caller | Ashtusk Bonecaller | 28–40 | chibi: orc · shaman (bone charms, staff_totem) (reuse look: `ashtusk_bonecaller`) | 0.75 | *Ash Rain*: 4 red circles 3 m, 2.0 s, 12% RH fire |
| `m_orc_ashtusk_bloodmender` | Mender | Ashtusk Blood-Mender | 28–40 | chibi: orc · shaman (red paint) | 0.8 | *Blood Rite*: heals an ally 15% by spending 5% of its own health |
| `m_orc_ashtusk_bearer` | Bearer | Ashtusk Standard-Bearer | 29–40 | chibi: orc ×1.2 · banner | 1.8 | banner aura |
| `m_orc_ashtusk_warchief` | Leader | Ashtusk Warchief | 30–40 | chibi: orc ×1.3 · war_helm | 2.8 | *Warcry*: band +15% attack speed 8 s; *Call Out*: taunts the player with most threat to it 3 s |
| `b_ashtusk_overchief` | Warlord | the Overchief | 32 / 36 / 40 | chibi: orc ×1.9 | boss | 50% Frenzied + 2 Brutes; 25% Vicious (reuse: `ashtusk_overchief`); *Headtaker*: tank buster 45% tank-RH, red cone 5 m, 2.5 s; *Burn the Camp*: fire ring danger 3.0 s |

### 9.6 The Stonehide Clans — giants (levels 34–50)

Colour #a8c0d8. Race `giant`. Hold Frostmantle's high passes (34–42), the Drowned Coast cliffs (44–48) and
the Riftmarch's southern slabs (46–50). Camp: the **Slab-Hold** (standing-slab ring). A head taller than
anything they hunt; every Stonehide melee hit knocks back 2 m. Unique: `uq_peakbreaker`.

| id | Rank | Name | Lv | Body | HP× | Abilities |
|---|---|---|---|---|---|---|
| `m_giant_stonehide_smasher` | Grunt | Stonehide Smasher | 34–50 | chibi: giant · warrior (hammer) | 2.0 | *Ground Pound*: red circle 5 m, 2.0 s, 16% RH + knockback 4 m |
| `m_giant_stonehide_stalker` | Cutter | Stonehide Stalker | 34–50 | chibi: giant · rogue | 1.1 | `bleed`; ambushes from snow |
| `m_giant_stonehide_hurler` | Shooter | Stonehide Hurler | 35–50 | chibi: giant · boulder held | 0.9 | *Boulder*: red circle 4 m at 38 m, 2.5 s, 18% RH; rolls 10 m after landing (red line) |
| `m_giant_stonehide_frostsayer` | Caller | Stonehide Frostsayer | 36–50 | chibi: giant · stormcaller (ice) | 0.8 | *Hailstorm*: 8 m void zone, 3% RH per 0.5 s, 8 s, slow |
| `m_giant_stonehide_hearthkeeper` | Mender | Stonehide Hearthkeeper | 36–50 | chibi: giant · cleric (fur) | 0.9 | *Warm Hearth*: a green beneficial circle 6 m on its allies, heals 5% per 1 s for 6 s — players can stand in it too (it heals anyone) |
| `m_giant_stonehide_herald` | Bearer | Stonehide Stone-Herald | 37–50 | chibi: giant ×1.1 · slab banner | 2.0 | banner aura |
| `m_giant_stonehide_mountainlord` | Leader | Stonehide Mountainlord | 38–50 | chibi: giant ×1.3 · rune_helm | 3.0 | *Avalanche Call*: a moving wave of snow (red band 4 m deep, 2.5 s warning) |
| `b_stonehide_peakking` | Warlord | the Peak-King | 42 / 48 / 50 | chibi: giant ×1.7 | boss | 60% Unyielding; 30% Vicious (reuse: `stonehide_peakking`); *Throw*: yellow targeted player thrown 12 m (never over a ledge, page 11 §19) |

### 9.7 The Kingsfire Legion — the Fire King's army (levels 50–60)

Not a race: soldiers of every folk (human, dwarf, orc) bound by fire brands, with demons as shock troops.
Uses the warband machinery (grip, camps, patrols, ranks, rout — **except** that branded soldiers never rout:
when their leader dies each brand flares, +20% damage 10 s). Colour #ff5a20. Holds Kingsfire (52–60)
and keeps forward camps in the Riftmarch (50–54). Camp: the **Brand Bastion** (black stone and iron).
Unique: `uq_legion_brand`.

| id | Rank | Name | Lv | Body | HP× | Abilities |
|---|---|---|---|---|---|---|
| `m_kingsfire_legionnaire` | Grunt | Kingsfire Legionnaire | 50–60 | chibi: human/dwarf · warrior (black plate, glowing brand #ff5a20) | 1.8 | *Shieldline*: 3+ side by side → a red line wave pushes forward 6 m (2.0 s), 14% RH |
| `m_kingsfire_brandblade` | Cutter | Brandblade | 50–60 | chibi: orc · fighter | 1.1 | *Brand*: burn 3% RH/s 6 s |
| `m_kingsfire_pyre_archer` | Shooter | Pyre Archer | 51–60 | chibi: human · ranger (fire arrows) | 0.8 | *Fire Arrow Volley*: 6 red circles 3 m, 2.0 s, 10% RH fire |
| `m_kingsfire_ash_magus` | Caller | Ash Magus | 52–60 | chibi: human · pyromancer | 0.8 | *Firewall*: 12 m line void zone 8 s (2.5 s cast, interruptible) |
| `m_kingsfire_flame_priest` | Mender | Flame Priest | 52–60 | chibi: dwarf · cleric (red robes) | 0.9 | *Cauterise*: heals 15% and removes 1 player-applied debuff from an ally (2.0 s, interruptible) |
| `m_kingsfire_ensign` | Bearer | Kingsfire Ensign | 53–60 | chibi: human ×1.1 · banner | 1.8 | banner aura; banner explodes when dropped: red circle 5 m, 2.0 s, 20% RH |
| `m_kingsfire_centurion` | Leader | Kingsfire Centurion | 54–60 | chibi: human ×1.3 · knight (crest) | 3.0 | *Hold the Line*: band immune to knockback 8 s |
| `b_kingsfire_warmarshal` | Warlord | the Kingsfire Warmarshal | 56 / 60 | chibi: human ×1.8 · dragon_knight | boss | page 11 elite budget; *Sunder Brand* tank buster; *Call the Legion* 4 Legionnaires at 60%/30% |

### 9.8 Shared warband rules

- **Warband share.** On held ground the warband makes up `spawnShare × grip` of spawns (reuse: 0.65 ×
  grip); the rest is the region's own list.
- **War parties** (patrols) are 1 Leader + 3–5 members drawn from ranks 1–5; one in four carries a
  Bearer. War parties walk roads (§5.9).
- **Camps** hold a full band: Warlord, Leader, Bearer, 2 Menders, 3 Callers/Shooters, 4–6 Grunts/Cutters.
  The war-chest opens when the **last guard** falls (reuse: Farhold R27 M10 `sites.warDeath`).
- **Grip loss** per event (reuse: `balance.warbands`): member killed 0.02, war party wiped 0.1, camp taken
  0.35, warlord slain 0.4. At 0 the sub-zone reads "driven out" and nothing of theirs spawns.
- **Group scaling**: camps scale by §5.12; warlords by page 11 §22 (elite column).
- **Rivals.** Killing warband members raises standing with the sub-zone's human holder (reuse: Farhold
  `RIVAL_SHARE`, page 07 owns reputation).

---

## 10. Loot hooks

Every monster entry names its hooks; page 08 owns the tables, rarities and drop rates.

| Hook | What it is | Example |
|---|---|---|
| region table | every kill rolls its region's level-band table (Farhold `loot.js` rules; personal loot for every player with credit) | always |
| `bases` | item bases this monster favours (Farhold `dropBases`, reuse) | brigands → dagger, light_chest |
| family reagent | a crafting reagent per family (§3) | `it_rough_hide` |
| trophy | a named-rare or elite trophy item, used by quests and the trophy wall (page 03) | `it_gristlejaw_tusk` |
| `uq_` chance | named rares and warlords only | `uq_mire_crown` 5% |
| quest items | page 14 attaches quest drops by monster id | `q_*` |
| rank bonus | champion pack +2 items when the last member dies, rare +2, named guaranteed Rare+ (§4.2, §7.2, §7.3) | |
| greater rarity | +1 item at rarity ×1.5 per carrier, the mapped **special rarity** boost and signature drop, or the loot lean (§7.6) | an Electrified carrier: Electrified ×5 |
| magic find | every drop above reads the killer's item quantity and item rarity (page 08 owns the rule) | |
| warband war-chest | camp chest rolls the warband's `drops` list and its `uq_` (reuse: `campUniqueChance`) | |

---

## 11. The bestiary journal

(reuse idea: Farhold `BESTIARY-IDEAS.md` §4 "a bestiary page in the Journal".) Screen `scr_bestiary`
(page 03 lists it). Each monster id has a page that fills in as you kill it:

| Kills | Unlocks on its page |
|---|---|
| 1 | name, body render (a live 3D figure, reuse: Farhold `js/figure3d.js`), region, level range |
| 10 | the description paragraph (Dwarf-Fortress style, reuse: `BESTIARY-IDEAS.md` "How to read an entry") and its role |
| 25 | every ability with numbers and the telegraph it uses (the lines on this page) |
| 50 | loot hooks and its weakness (+5% damage against it for this character, forever — "Studied") |

Named rares, warlords and bosses fill on the first kill. Families complete as a set for a title (page 07).

---

## 12. Data shapes

`data/monsters.json` (new file; page 16 owns the file list). One row per monster:

```json
{
  "id": "m_beast_thicket_boar",
  "name": "Thicket Boar",
  "family": "beast",
  "nature": "beast",
  "region": "hearthvale",
  "levels": [2, 6],
  "role": "brute",
  "traits": [],
  "tags": ["tag_beast"],
  "tameable": true,
  "tameFamily": "tf_boar",
  "temperament": "territorial",
  "rank": "normal",
  "pack": [1, 2],
  "hp": 2.0,
  "hit": 0.09,
  "attackEvery": 2.4,
  "reach": 3.0,
  "speed": 3.2,
  "aggro": 14,
  "leash": 40,
  "fleeAt": 0,
  "abilities": ["a_gore_charge"],
  "look": { "creature": { "type": "boar", "size": 2.2 } },
  "reuse": "farhold:thicket_boar",
  "loot": { "bases": ["light_chest"], "reagent": "it_rough_hide", "trophy": null }
}
```

An ability row (shared with page 11's mechanic shape; a monster ability usually **cites** a library mechanic
and overrides numbers):

```json
{
  "id": "a_gore_charge",
  "mechanic": "mech_charge_line",
  "shape": { "kind": "line", "length": 12, "width": 2 },
  "colour": "danger",
  "warn": 2.0,
  "damage": 0.14,
  "effects": [{ "knockback": 4 }],
  "cooldown": 10,
  "recovery": 1.0,
  "say": null
}
```

**Standard affixes** — `data/monster-affixes.json` (new), one row per `mod_*` (56):

```json
{
  "id": "mod_hoarfast",
  "name": "Hoarfast",
  "kind": "mechanic",
  "element": "ice",
  "tell": { "aura": "#e8f4ff", "fx": "freeze", "icon": "icon_mod_hoarfast" },
  "mult": {},
  "mechanic": "mech_slam_circle",
  "override": { "radius": 3, "warn": 2.0, "damage": 0.12, "every": 10, "targets": 3, "status": "root", "statusSeconds": 1.5 },
  "onDeath": { "use": "mech_slam_circle", "ring": 6, "count": 6 },
  "groundZone": true,
  "needsMates": false,
  "excludes": ["mod_scorchtrail"],
  "minLevel": 8,
  "packStrength": { "clockShared": true, "intervalMult": 0.8, "onDeathDamage": 0.5 },
  "minionStrength": { "damage": 0.5, "intervalMult": 2.0 },
  "tooltip": "Every 10 s: 3 circles of frost under players. On death, a ring of 6."
}
```

**Greater rarities** — `data/greater-rarities.json` (new), one row per `grr_*` (28):

```json
{
  "id": "grr_electrified",
  "name": "Electrified",
  "group": "element",
  "element": "lightning",
  "badge": "badge_grr_electrified",
  "look": { "scale": 1.0, "fx": ["shock"], "particles": "arc_sparks", "tint": "#bfe6ff" },
  "mult": { "hp": 1.3, "dmg": 1.2 },
  "abilities": ["a_grr_spark", "a_grr_arc_link", "a_grr_discharge"],
  "breakBar": false,
  "minLevel": 8,
  "notOn": ["swarm", "boss"],
  "special": { "rarity": "sr_electrified", "mult": 5 },
  "lean": null,
  "packStrength": { "effect": 0.5, "clockShared": true }
}
```

**Rarity bands** — the §7.7 table as `data/monster-rarity-bands.json` keyed by region id:
`{ "whisperwood": { "champion": 0.14, "rare": 0.045, "greater": 0.04, "greaterPack": 0.12, "secondGreater": 0, "affixes": { "champion": [1], "rare": [2, 3] }, "elementBias": "grr_plagued" } }`.

**Dungeon rarity slots** — page 12 writes these into a room; this page owns the shape:

```json
{ "room": "d07_r4", "slots": [ { "kind": "rare", "family": "fae" }, { "kind": "champion" } ] }
```

**Depth additions** — `data/depth-monsters.json` (new), one row per family:
`{ "family": "beast", "abilityI": "a_depth_blood_scent", "type": "m_beast_rift_stalker", "abilityII": "a_depth_pack_howl", "warden": "m_beast_old_mother" }`.

Warbands keep Farhold's `warbands.json` shape (reuse) with `members` extended by `mender` and `levels` per
sub-zone.

---

## 13. Tests the build must have

1. **Every id is unique** and matches `m_<family>_<snake>`; family is in §3's table.
2. **Every body resolves**: a creature `type` exists in `CREATURE_TYPES`, a variant exists in
   `creature-variants.json`, a chibi race exists in `chibi2-races.js`, an outfit exists in
   `class-outfits.json` or its parts exist in `avatar-2d/js/parts/chibi2-parts.js` (Farhold's normaliser
   rule: an unregistered part id is silently dropped).
3. **No creature below size 1.4** (reuse: Farhold's node test) — including Wizened bodies and Splitting
   copies, which clamp at 1.4 whatever their multiplier says.
4. **Every region has ≥ 8 own monsters and ≥ 3 named rares**; every monster's levels sit inside its
   region's band (00 §7) ± 0.
5. **Every special ≥ 15% RH has a telegraph** with warning ≥ the page 11 minimum for its context.
6. **Every mechanic affix and every greater-rarity ability names a page 11 mechanic** that exists in the
   library (`mechanic` field), and every greater ability's cast bar carries its badge.
7. **Combination rules** (§7.4.4) and **exclusion groups** (§7.5.2) hold for 10,000 rolled champion packs,
   rares and greater carriers per region and per Depth tier: never two greaters from one group, never two
   elements, never an excluded affix pair.
8. **Rarity chances are read from data**: set `whisperwood.greater` to an odd value (0.0371), spawn 100,000
   packs headless, and assert the measured rate moves to it (± 0.2%) — not a comparison of the file with a
   constant.
9. **Caps hold**: no rolled monster's HP multiplier exceeds ×24 open world / ×40 dungeon, nor damage ×2.5 /
   ×3.0, before group scaling and Depth.
10. **Dungeon slots are placed, not rolled**: a dungeon with 2 champion slots and 1 rare slot spawns exactly
    that on every seed; the affixes differ between seeds; bosses never carry a rarity.
11. **Special-rarity mapping**: killing 10,000 Electrified carriers produces Electrified items at 5× page 08's
    base chance (± 10%), and 0 extra for a greater with no mapping.
12. **No night**: no monster row has a `night` field and no spawn rule reads the time of day.
13. **Warband share read once** (reuse: Farhold R27 `tests/round27-warbands.test.js` grep rule — one reader
    of `spawnShare`).
14. **Dead data check**: move a knob (e.g. `mod_undertow` pull range, `grr_giant` scale) to an odd value and
    ask the running module — do not compare the file to a constant (the playground's standing lesson).
15. **No third-party names**, and **no "ember" or "veil"** in any monster, affix or rarity `name` or `id`:
    every one passes page 16's IP word list (asset ids from other prototypes, like the creature variant
    `ember_fennec`, are exempt because they are file keys, not names).
16. **Tags and taming**: every row whose `family` is `demon` carries `tag_demon`; every `undead`-family row
    carries `tag_undead`; no row carries both `tameable: true` and `tag_demon`/`tag_undead`; every `tameFamily`
    is one of the 13 ids in §3.2 and has at least one row; no row outside `nature: beast` is tameable; and the
    ranger's Tame Beast refuses a Rare, Named, elite or greater-rarity carrier of a tameable row.
17. **Bind roster**: every §3.3 id exists, carries `tag_demon`, and together they cover every level from 6 to 60.

---

## 14. Round 2 renames (old → new)

| Old | New | Why |
|---|---|---|
| family `ember` (the Ember Legion) | family `kingsfire`, **the Kingsfire Legion** (`fac_kingsfire_legion`) | 00 §12.4 |
| family `veil` (the Veil) | family `tear`, **Things of the Tear** | 00 §12.4 |
| Ashtusk Horde | **Ashtusk Warhost** | W25 |
| `m_ember_ember_revenant` Ember Revenant | `m_kingsfire_flame_revenant` **Flame Revenant** | no "ember" |
| `m_ember_phoenix` Ashen Phoenix | `m_kingsfire_ashen_phoenix` Ashen Phoenix | id family |
| every other `m_ember_*` (Cinder Imp, Magma Golem, Obsidian Drake, Ash Wisp, Cinderlord Hask, the Ashen Matron, the seven Legion ranks) | `m_kingsfire_*`, same snake | id family |
| Ember Legionnaire / Ember Ensign / Ember Centurion | **Kingsfire** Legionnaire / Ensign / Centurion | no "ember" |
| `b_ember_warmarshal` the Ember Warmarshal | `b_kingsfire_warmarshal` **the Kingsfire Warmarshal** | no "ember" |
| Ember Bastion (Legion camp) | **the Brand Bastion** | no "ember" |
| `m_sand_ember_fennec` Ember Fennec | `m_sand_dune_fennec` **Dune Fennec** | no "ember" |
| `m_beast_ember_boar` Ember Boar | `m_beast_cinderback_boar` **Cinderback Boar** | no "ember" |
| `m_demon_ember_wraith` Ember Wraith | `m_demon_cinder_wraith` **Cinder Wraith** | no "ember" |
| `m_fae_veil_spider` Veil Spider | `m_fae_shroud_spider` **Shroud Spider** | no "veil" |
| `m_veil_veilspawn` Veilspawn | `m_tear_tearspawn` **Tearspawn** | no "veil" |
| `m_veil_veil_warden` Veil Warden | `m_tear_spire_warden` **Spire Warden** | no "veil" |
| `m_veil_veil_sorcerer` Veil Sorcerer | `m_tear_spire_sorcerer` **Spire Sorcerer** | no "veil" |
| `m_veil_genesis_worm` Unmaking Worm | `m_tear_unmaking_worm` Unmaking Worm | id family |
| every other `m_veil_*` (Void Shade, Star Horror, Reality Shard, Null Titan, Void Prophet, Mirror Knight, the Hollow Crown, the Seer Without Eyes, the Last Titan) | `m_tear_*`, same snake | id family |
| abilities: Ember Bite, Ember Dust, Moonveil, Snow Veil, Veil Blessing, *Torch* (Ashtusk Raider) | **Scorching Bite**, **Spark Dust**, **Moonshroud**, **Snow Cloak**, **Tear Blessing**, **Firebrand** | no "ember"/"veil"; no "torch" |
| reagents `it_ember_core`, `it_veil_thread` | `it_cinder_core`, `it_tear_thread` | no "ember"/"veil" (page 08/19 should match) |
| `uq_dustmother_veil` | `uq_dustmother_shawl` | no "veil" (page 09 should match) |
| `it_cult_sigil`, `uq_eyeless_sigil` | `it_cult_token`, `uq_eyeless_seal` | "sigil" was the removed currency's word |
| `m_orc_ashtusk_raider` Ashtusk Raider | `m_orc_ashtusk_cutthroat` **Ashtusk Cutthroat** | keeps "raid" out of names while raids are parked |
| Crag Bear *Maul*, `m_beastkin_thornmane_mauler` Thornmane Mauler and its *Maul* | *Rending Paws*, `m_beastkin_thornmane_ravager` **Thornmane Ravager**, *Hack and Hew* | "Maul" is a banned name (§12.5) |
| affixes `mod_emberwake` Emberwake, `mod_unstoppable` Unstoppable | `mod_scorchtrail` **Scorchtrail**, `mod_steadfast` **Steadfast** | no "ember"; Unstoppable is now a greater rarity |
| `mod_blinkstep` Blinkstep; Marsh Wisp *Will-o-Blink*; Phase Hound *Blink Bite* | `mod_flickerstep` **Flickerstep**; *Will-o-Hop*; *Phase Bite* | "Blink" is a banned name (§12.5) |
| `m_folk_blackdelve_miner`, `m_folk_blackdelve_powderwife` (Blackdelve) | `m_folk_blackshaft_miner`, `m_folk_blackshaft_powderwife` (**Blackshaft**) | "delve" is banned |
| affix `mod_shrouded` Shrouded | `mod_cloaked` **Cloaked** | "Shrouded" is now the Shadow Dancer's own state (page 05) |
| `m_beastkin_thornmane_prowler` Thornmane Prowler | `m_beastkin_thornmane_skulker` **Thornmane Skulker** | "Prowl" is a banned name (§12.5) |
| tag `demonic` | tag **Demon** (`tag_demon`); new tag **Undead** (`tag_undead`) | the class files read these names |
| (warlock request) `m_ember_cinder_imp`, `m_demon_ember_wraith` | `m_kingsfire_cinder_imp`, `m_demon_cinder_wraith` (already renamed above) | the warlock file should copy these |
| affixes `mod_ironclad`, `mod_warded`, `mod_venomous`, `mod_gilded` | `mod_plated` Plated, `mod_runed` Runed, `mod_toxic` Toxic, `mod_wealthy` Wealthy | those names are now greater rarities |
| `mod_giant` (Farhold modifier) | greater rarity `grr_giant` | it was always a difficulty spike |
| "Veil pressure" (+5% per step on the island) | removed (the steps followed the removed item tracks, W17) | W17 |
| night table ☾, night-only monsters, night multipliers | removed | always daylight |
