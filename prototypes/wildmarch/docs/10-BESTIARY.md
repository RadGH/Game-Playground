# WILDMARCH — Design Bible, page 10: Bestiary

**Status:** v0.1 draft — 2026-09-29. Nothing is built. This page owns **every monster id**, the
**enemy families**, the **monster AI**, **champions and rares** (the modifier table) and the
**warbands**. The telegraph words used below (danger zone, void zone, soak, safe zone, targeted,
beneficial, tether) and every `mech_*` id are defined on [page 11](11-BOSS-MECHANICS.md). Dungeon
trash and bosses are on [page 12](12-DUNGEONS.md); raid bosses and world bosses on
[page 13](13-RAIDS-WORLD-BOSSES.md). Region lore is on [page 01](01-WORLD-LORE.md); the damage,
threat and status formulas are on [page 05](05-COMBAT.md).

---

## Contents

1. How to read a monster entry (units, bodies, roles)
2. What Farhold already has (reuse) and what changes
3. Enemy families
4. Monster roles and rank ladder
5. The AI: states, senses, aggro, leash, packs, patrols, night, group scaling
6. Region monster lists (11 regions + Highcourt)
7. Champions and rares: the modifier table
8. Named rares per region
9. Warbands (Sootwick, Unburied, Thornmane, Ashtusk, Stonehide) and the Ember Legion
10. Loot hooks
11. The bestiary journal
12. Data shapes (JSON)
13. Tests the build must have

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
| biped | golem, titan, imp |
| float | elemental, wisp, shard, wraith, horror, slime, mushroom, mimic |
| roller | turret |

  A `variant:` is a ready-made design from `avatar-3d/data/creature-variants.json` (ember_fennec,
  marsh_turtle, cave_beetle, sky_griffin, ember_phoenix, burrow_centipede, moss_slime, moon_mushroom,
  lockjaw_mimic, reef_crocodile). Colours are given as body/accent where they matter. Farhold's
  rule stands: **no creature below size 1.4** — a knee-high rat is not a fight (reuse: Farhold RPG.md §3).
- Bodies marked **(+feature)** need one new feature flag in `creatures.js` (an hour of geometry, the
  "variation+" tag of Farhold `BESTIARY-IDEAS.md`). Bodies marked **(bespoke)** need a new type. This page
  keeps both rare on purpose: **102 of the 108 region monsters are existing types or chibi bodies**; the six that are not are marked.

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
| 46 enemies, 6 bosses, 11 pets, 22 modifiers, 8 families | `prototypes/farhold/data/enemies.json` | 108 region monsters + 42 warband/legion members + 6 warlords; Farhold's 46 are the body/stat source for ~30 of them (marked `reuse:` per row). Farhold's 8 `family` values become the **nature** field (below). |
| ranks normal/champion/rare, chances 0.11 / 0.03, multipliers | `data/balance.json ranks` | Same chances and multipliers; champions and rares now also roll **mechanic modifiers** (§7). |
| roles skirmisher/brute/archer/caster/leader | `enemies.json _doc`, `js/actors.js` | Six roles: **melee, brute, ranged, caster, healer, swarm** + two **traits** (support, ambusher). Farhold's `skirmisher` = melee, `archer` = ranged, `leader` = a rank inside a warband. |
| packs `[min,max]`, pack wake within 14 m by `defId` | `js/actors.js` `update` | Pack wake by **pack id** (every member of the spawned pack), plus family social aggro (§5.5). |
| threat = "seconds of attention" (`THREAT_SECONDS` 5, `aimOf`, `taunt`) | `js/actors.js` | A real threat table, because Wildmarch has tanks and other players (page 05 owns the numbers; §5.6 says how monsters read it). The Farhold "body in the way" rule stays as the tie-breaker. |
| chase gives up at 2.2 × notice range; despawn leash | `js/actors.js` | Anchor-based **leash** and an **evade/return** state (§5.4), because monsters are shared by many players and must not be dragged across the map. |
| town line turns chases back | `js/actors.js` (flee at `wild()`) | Kept: nothing hostile crosses a town's watch line. |
| stealth shortens notice range (floor 25%) | `js/actors.js` | Kept, same formula. |
| set-piece encounters (11) | `data/encounters.json`, `js/encounters.js` | Kept and renamed as open-world **events** on [page 14](14-QUESTS-EVENTS.md); this page only says which monsters fill them. |
| warbands (5 races) with members, bearer, warlord, grip, rout, leader aura 1.15 | `data/warbands.json`, `js/warbands.js` | Kept whole; re-banded to the 1–60 ladder and pinned to regions instead of seeded zones; a **healer** member added to each (§9). |
| world bosses with tiers 1–4 | `data/worldbosses.json` | Page 13 owns them; this page only lends bodies. |
| Emberveil bestiary looks (33 enemies, 12 bosses) | `prototypes/emberveil/data/enemy-looks.json` | Veil and Ember bodies reused for Veilspire and the Emberthrone. |
| `BESTIARY-IDEAS.md` neutral wildlife, ice/crystal/void/toxic hostiles | `prototypes/farhold/BESTIARY-IDEAS.md` | Drift Lurker, Hoarfrost Chorus, Glacier Tick, Refraction, Absence, Stitchwork, Bloom Host (as Mirecap), Rot Kite, Vine Hauler, Dune Breacher, Glass Caller, Mirage Walker all become real monsters here. The three temperaments (skittish, wary, territorial) become the AI temperament field. |

---

## 3. Enemy families

`family` is the lore group and the middle of the monster id (`m_<family>_<snake>`). `nature` is what the
thing **is** for items that say "+20% damage against undead" (Farhold's 8 families, reuse:
`enemies.json families`; page 08 owns the affixes that read it).

| family | Name | nature | Found in | Body sources | Elements it uses | Family reagent (loot hook) |
|---|---|---|---|---|---|---|
| `beast` | Beasts | beast | every region 1–8 | quad, bat, snake, spider | physical, bleed, poison | `it_rough_hide`, `it_beast_fang` |
| `folk` | Outlaws and cultists | humanoid | 1–5, 9 | chibi human/dwarf/elf/halfling | physical, fire, shadow | `it_stolen_coin`, `it_cult_sigil` |
| `fen` | Fen things | aberration / beast | Mossfen | slime, mushroom, frog, snake, crocodile, moth, centipede, wisp | poison, nature | `it_bog_resin`, `it_spore_sac` |
| `construct` | Deepforge constructs | construct | Greyridge, Riftmarch | golem, turtle, turret, titan | physical, fire | `it_brass_cog`, `it_rune_plate` |
| `sand` | Sand and glass | beast / elemental | Sunscar | centipede, worm, beetle, hyena, shard, golem, imp | physical, fire, arcane | `it_sunglass`, `it_dune_chitin` |
| `fae` | Fae and the Gloamward | aberration / humanoid | Whisperwood | imp, wisp, deer, spider, mushroom, horror, chibi elf | nature, arcane, holy | `it_moonpetal`, `it_gloam_silk` |
| `frost` | Frost things | beast / elemental | Frostmantle | saber_cat, bear, crocodile, wisp, spider, dragon, griffin, elemental | ice | `it_rime_crystal`, `it_frost_pelt` |
| `drowned` | The Drowned | undead / aberration | Drowned Coast | chibi undead, wraith, crocodile, beetle, slime, bat, horror | ice (water), shadow, poison | `it_salt_pearl`, `it_drowned_brass` |
| `rift` | Rift aberrations | aberration | Riftmarch | horror, shard, wraith, worm, dire_wolf, phoenix, golem | arcane, true, lightning | `it_rift_shard`, `it_unmade_glass` |
| `ember` | The Ember Legion | humanoid / elemental | Emberthrone | chibi human/dwarf/orc, golem, elemental, drake, phoenix | fire | `it_ember_core`, `it_legion_brand` |
| `demon` | Demons | demon | Emberthrone, Veilspire, rift tears | imp, hound, titan, wraith, horror | fire, shadow | `it_brimstone`, `it_demon_horn` |
| `veil` | The Veil | aberration / humanoid | Veilspire Isle | chibi human/elf, wraith, horror, shard, titan, worm | shadow, arcane, true | `it_veil_thread`, `it_null_pearl` |
| `undead` | The restless dead | undead | 1, 3, 4, 7 (and the Unburied warband) | chibi undead, dire_wolf, worm, wraith | shadow, poison | `it_grave_dust`, `it_bone_shard` |
| `goblin` | Goblins (Sootwick warband) | humanoid | 1–3 | chibi goblin | physical, poison | `it_goblin_trinket` |
| `orc` | Orcs (Ashtusk warband) | humanoid | 6–7 | chibi orc | physical, fire | `it_ash_tusk` |
| `beastkin` | Beastkin (Thornmane warband) | humanoid | 4–6 | chibi beast | physical, lightning | `it_thorn_mane` |
| `giant` | Giants (Stonehide warband) | humanoid | 7–9 | chibi giant | physical, ice | `it_giant_knucklebone` |
| `dragon` | Dragonkin | dragonkin | 6, 7, 10 (elites only) | drake, dragon | fire, ice, lightning | `it_dragon_scale` |

The five race families (`goblin`, `orc`, `beastkin`, `giant`, `undead` for the Unburied) are the canon
**enemy warbands** (00 §4). They appear inside regions as the *warband presence* line of each region list
and are fully listed in §9.

### 3.1 Family tags (new)

A **tag** is an extra label on a monster row (`"tags": [...]`, §12) that a class or item reads. It sits beside
`family` and `nature`; this page owns the list.

| Tag | Who carries it | Who reads it |
|---|---|---|
| `mindless` | every `construct`; slimes and oozes; every elemental body (`elemental`, `wisp`, `shard`, sand and glass golems); animated objects (`mimic`, `turret`, living weapons) | the Enchanter's Charm and every mind-control effect: **cannot be charmed** ("It has no mind to bend." — [classes/enchanter.md](classes/enchanter.md) §2.2) |
| `demonic` | the whole `demon` family; rift-spawn of `riftmarch`; the Ember Legion's fiends in `emberthrone`; imps anywhere; anything summoned by an enemy warlock-type caster | the Demon Hunter's Hunter's Oath (+20% damage; [classes/demon_hunter.md](classes/demon_hunter.md) §2.3) and any item that says "against demons" |
| `command` | every warband **Leader**, **Standard-bearer** and **Warlord** (§9.1), and the Ember Legion's Centurion and Ensign | cannot be charmed or dominated (a command unit answers only to its band); page 11 treats a Warlord as a boss anyway |

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

| Rank | How it appears | HP | Damage | Size | XP / gold | Drops | Nameplate |
|---|---|---|---|---|---|---|---|
| `swarm` | role swarm | ×0.3 | ×0.4 | ×0.8 | ×0.25 | 5% chance of 1 item | grey |
| `normal` | spawned | ×1.0 | ×1.0 | ×1.0 | ×1 | Farhold `ranks.normal` | white |
| `elite` | **placed** by hand (a named spot, a quest target, a region's big animal) | ×4.0 | ×1.4 | ×1.3 | ×4 | +1 item, rarity ×1.5 | silver, with a wreath icon |
| `champion` | rolled at spawn (11%, Farhold `championChance`) | ×2.6 | ×1.35 | ×1.18 | ×2.4 | +1 item, rarity ×1.5 | amber, plus one icon per modifier; the body wears a ground ring in its first modifier's aura colour |
| `rare` | rolled at spawn (3%, Farhold `rareChance`) — takes a Name Forge name | ×4.5 | ×1.6 | ×1.35 | ×4.5 | +2 items, rarity ×2.2 | gold, name + epithet ("Grisk the Tallow-Hearted") |
| `named` | a **named rare** (§8): hand-written, fixed spawn spots and timers | ×6.0 | ×1.6 | ×1.5 | ×6 | guaranteed Rare+, chance of its own `uq_` | gold with a crown pip |
| `boss` | dungeon/raid/world/warlord | page 11–13 | | | | | red-orange boss frame |

Ranks multiply the role. A champion brute has 2.2 × 2.6 = 5.72 MH. Multipliers are Farhold's
`balance.json ranks` (reuse) except `swarm`, `elite` and `named`, which are new.

**Rank chances by region** (champion / rare): regions 1–2 **6% / 1%** (the valley stays gentle),
3–5 **11% / 3%** (Farhold's values), 6–9 **13% / 4%**, 10–11 **15% / 5%**. Night multiplies both by 1.5 (§5.10).

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
  monster's eye to the player's chest; foliage cuts range to 70%, darkness (night, no light carried)
  to 60% (reuse: Farhold `js/light.js` — a torch or lantern cancels the night cut).
- **Hearing.** Noises reach every awake monster within the radius regardless of facing: sprint 12 m,
  basic attack hitting 18 m, spell cast 22 m, explosion or boss yell 40 m, horn/bell 60 m. Hearing turns
  a monster to `alert` facing the source; it only engages with sight or after 3 s of searching.
- **Aggro radius** by role/rank: swarm 14 m, melee 16 m, brute 14 m, ranged/caster 22 m, healer 18 m,
  elite 22 m, champion 22 m, rare/named 24 m.
- **Level difference.** −1 m per level the player is above the monster (floor 6 m), +1 m per level below
  (cap +8 m). A player 8+ levels above a normal monster is ignored unless they attack it (grey monster,
  reuse Farhold R22 "grey-con" XP rule for the feel).
- **Stealth** multiplies the radius by `max(0.25, 1 − stealth)` (reuse: Farhold `js/actors.js`).

### 5.4 Leash and return

- Every monster has an **anchor** (spawn point, or its patrol route's nearest point).
- **Leash distance** from the anchor: normal/swarm **40 m**, elite/champion **55 m**, rare/named **70 m**,
  patrol members 40 m from their current route point. Flying +15 m.
- Also returns if: it has not hit or been hit for **10 s** while engaged; it cannot find a path to any
  threat target for **4 s** (the "stuck on a rock" fix); or its target crosses a town watch line (reuse).
- `return` is an evade: immune, threat wiped, full heal. A monster that returns **three times in 60 s**
  stays at its anchor for 20 s and will not re-engage (stops kiting exploits).
- **Dungeon and raid monsters never leash** out of their room; bosses lock their arena (page 11 §11).

### 5.5 Packs, social aggro and calling for help

- **Pack**: bodies spawned together share a `packId`. Any member alerting alerts the **whole pack**,
  whatever the distance (fixes Farhold's "hit a brute, its archers stand about", R27 M10).
- **Social aggro**: a monster of the **same family** within **10 m** with line of sight to the fight joins
  it (it saw its kind being hit). Swarms: 14 m. Different families never social-aggro each other.
- **Band wake** (warbands and the Ember Legion only): every monster linked to the same leader within
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
  hub's watch line and never pass within 25 m of a flight point or a lamp-post respawn.
- Patrols are drawn on the minimap as a moving dot only when the player has line of sight to them.

### 5.10 Night

The Wildmarch day is 60 minutes (45 day / 15 night, 00 §4).

| Rule | Value |
|---|---|
| Spawn density | +15% bodies in wild areas |
| Night pool | 30% of new spawns come from the region's **night table** (entries marked ☾ below) |
| Night-only monsters | spawn only between dusk and dawn; at dawn they walk to the nearest shade and despawn over 60 s (never mid-fight) |
| Champion / rare chance | ×1.5 |
| Aggro radius | +2 m for undead, demon, veil and drowned families; −2 m for day beasts (they sleep) |
| Night rares | some named rares (§8) spawn only at night |
| Night raids on roads | page 14 (reuse: Farhold `world.nightRaid`, `nightSpawn`) |

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

World bosses scale on [page 13](13-RAIDS-WORLD-BOSSES.md) using page 11 §22's rule.

### 5.13 Performance budget

Server think rate 10 per second per engaged monster, 2 per second idle; up to 60 engaged monsters per
region shard before extra ones go to 5 per second. The client animates only bodies within 120 m (reuse:
Farhold's ring model; `js/mesh-merge.js` one mesh per material for creatures).

---

## 6. Region monster lists

Legend: ☾ = night table · ⚑ = warband ground · (reuse: `farhold id`) = body and base stats from Farhold's
`enemies.json` · **Temp** = temperament (h hostile, t territorial, w wary) · Loot = `bases` (item bases
reused from Farhold) + reagent/trophy. Every region also rolls its normal regional loot table
([page 08](08-ITEMS.md)).

### 6.1 Hearthvale (1–6) — farm valley, orchards, a river

Gentle on purpose: one special per monster, 2.0 s+ warnings, champions 6%, no mechanic modifiers until level 4.

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
| `m_undead_barrow_shambler` ☾ | Barrow Shambler | 4–6 | chibi: undead · rags, bare feet, held rusty sword | melee, pack 2–4 | 1.1 | 5% | h | `it_grave_dust`, bases sword |
| `m_fae_will_light` ☾ | Will-light | 3–6 | creature: wisp ×1.4, body #c8f0a0 | caster, support (lure) | 0.6 | 6% | h | `it_moonpetal` |

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
- **Barrow Shambler** ☾ — *Grave Grasp*: when killed, 30% chance a hand grabs the nearest player's ankle:
  root 1.5 s, no damage. AI: slow (3.6 m/s), never flees, +2 m aggro at night.
- **Will-light** ☾ — *Lure*: drifts away at exactly walk speed, glowing; if followed 20 m it stops beside
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
| `m_fen_peatwife` | Peatwife | 8–12 | chibi: undead · warlock (shawl, held staff_totem, bog-green) | healer, support | 0.8 | 3% | h | `it_cult_sigil`, bases staff, wand |
| `m_fen_bog_tick` | Bog Tick | 6–10 | creature: spider ×1.4, body #3a4a2a translucent | swarm, pack 6–10 | 0.3 | 2% + poison | h | `it_spore_sac` |
| `m_fen_rot_kite` | Rot Kite | 7–12 | creature: moth ×1.8, body #8a8a50 | ranged, flying | 0.8 | 5% | h | `it_spore_sac` |
| `m_fen_sump_crawler` | Sump Crawler | 9–12 | creature: centipede ×2.4, variant burrow_centipede, wet sheen | melee | 1.2 | 6% | h | `it_dune_chitin` |
| `m_fen_bog_lantern` ☾ | Bog Lantern | 8–12 | creature: wisp ×2.0, body #ff9a40 | caster, caller | 0.7 | 7% fire | h | `it_bog_resin` |

⚑ Warband presence: **Sootwick Gang** on the stilt-village causeways (levels 5–12).

**Abilities**

- **Bog Slime** — *Split*: at 50% health splits into 2 Bog Slimelings (swarm, HP ×0.3, 3% RH).
  *Engulf*: 2.0 s bulge, red circle 3 m on itself, 12% RH + slow 40% 3 s.
- **Reed Serpent** — ambusher in reeds (only its eyes show). *Venom Strike*: 6% RH + `poison` 2% RH/s for 6 s.
- **Silt Lurker** — hides under water with only its back ridge showing. *Death Roll*: 2.0 s jaw-open
  (red **cone** 4 m, 60°); 18% RH + pulled under (stun 1.5 s, not in deep water — it never drowns you).
  Territorial: tail slaps the water 2.0 s as a warning.
- **Marsh Wisp** — *Marsh Bolt* 7% RH, 1.5 s cast, **interruptible** (gold border). *Will-o-Blink*: teleports
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
- **Bog Lantern** ☾ — *Call the Fen*: caller (2.0 s interruptible, 35 m). *Swamp Fire*: 7% RH fire bolt.

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
| `m_folk_blackdelve_miner` | Blackdelve Miner | 11–16 | chibi: dwarf · runesmith (smith apron, held pick) | melee | 1.1 | 6% | h | `it_stolen_coin`, bases hammer, heavy_gauntlets |
| `m_folk_blackdelve_powderwife` | Blackdelve Powderwife | 13–18 | chibi: dwarf · tinker (goggles, bandolier) | caster | 0.8 | 8% | h | `it_brass_cog`, bases crossbow, ring |
| `m_undead_barrow_hound` ☾ | Barrow Hound | 13–18 | creature: dire_wolf ×2.0 (reuse: `barrow_hound`) | melee, pack 2–3 | 1.0 | 6% | h | `it_grave_dust`, `it_bone_shard` |
| `m_beast_gallows_owl` | Gallows Owl | 10–14 | creature: owl ×1.8 (reuse: `gallows_owl`) | melee, flying | 0.9 | 5% | h | `it_rook_feather` |

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
- **Crag Bear** — *Maul*: two swipes 0.5 s apart after a 2.0 s rear-up, red cone 4 m 90°, 12% RH each.
  Territorial roar 2.0 s.
- **Blackdelve Miner** — *Blasting Cap*: throws a charge, red circle 4 m at a player, 2.0 s fill, 12% RH.
- **Blackdelve Powderwife** — *Powder Keg*: rolls a keg that stops 6–10 m out: red circle 6 m, 3.0 s,
  **30% RH** + knockback 6 m. A player hitting the keg first detonates it early (it hurts monsters too).
  *Fuse Line*: interruptible 2.0 s cast that lights all kegs at once.
- **Barrow Hound** ☾ — *Howl of the Barrow*: caller (undead family). *Grave Bite*: 6% RH + `curse`
  (−15% healing received 6 s, dispellable curse).
- **Gallows Owl** — *Dive*: climbs 3 s then dives at a yellow targeted player: 2.0 s, circle 2 m, 10% RH.

### 6.4 Highcourt (capital city, any level)

No hostile spawns inside the walls (town watch line covers the whole city). The only monsters are:
the catacomb approach to `r01_barrowking` (dungeon rules, page 13), the duelling ring and PvP arena
(page 15), and event invasions (page 14) that borrow bodies from any list on this page at the
invading faction's level. Not one of the 11 region lists.

### 6.5 Sunscar Barrens (16–24) — desert, mesas, glass tombs

Burrowers, glass that reflects, and heat. The first region where monsters dispel player buffs.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_sand_dune_centipede` | Dune Centipede | 16–20 | creature: centipede ×2.6 (reuse: `dune_centipede`) | melee | 1.1 | 6% + poison | h | `it_dune_chitin` |
| `m_sand_sunscar_stinger` | Sunscar Stinger | 17–22 | creature: beetle ×2.0 (+feature `stinger`), body #c89a50 | melee | 1.2 | 6% | h | `it_dune_chitin`, bases dagger |
| `m_sand_dune_breacher` | Dune Breacher | 20–24 | creature: worm ×3.6, body #c8a070 | brute, burrower | 3.0 | 13% | h | `it_dune_chitin`, bases heavy_chest |
| `m_sand_carrion_glider` | Carrion Glider | 16–22 | creature: owl ×2.2, body #5a3a2a, head bare #c07060 | melee, flying | 0.9 | 5% | h | `it_rook_feather` |
| `m_sand_ember_fennec` | Ember Fennec | 16–20 | creature: hyena ×1.6, variant ember_fennec | melee, pack 3–5 | 0.8 | 5% | h | `it_rough_hide` |
| `m_sand_glass_shard` | Glass Shard | 18–24 | creature: shard ×1.8 (reuse: `glass_shard`) | caster | 0.8 | 8% | h | `it_sunglass` |
| `m_sand_tomb_warden` | Tomb Warden | 20–24 | creature: golem ×2.4, sandstone #c8b080, core #60e0ff | brute, support | 2.6 | 11% | h | `it_sunglass`, `it_rune_plate` |
| `m_undead_wrapped_dead` ☾ | Wrapped Dead | 18–24 | chibi: undead · priest (linen wraps top/bottom, gold circlet) | melee | 1.2 | 6% + curse | h | `it_grave_dust`, bases staff |
| `m_folk_dust_reaver` | Dust Reaver | 17–23 | chibi: human · rogue (headwrap, scimitar sword) | melee, pack 2–3 | 1.0 | 6% | h | `it_stolen_coin`, bases rapier, sword |
| `m_sand_mirage_walker` | Mirage Walker | 19–24 | chibi: human · shimmering traveller (travel_cloak, heat-haze shader) | caster, ambusher | 0.9 | 8% | h | `it_sunglass` |
| `m_sand_glass_caller` | Glass Caller | 20–24 | creature: imp ×1.6, obsidian #1a1a22, eyes #ff6030 | support, caller | 0.7 | 4% | h | `it_sunglass` |

⚑ Warband presence: **Unburied Legion** at the tomb edges (19–24); **Thornmane Packs** on the mesas (20+).

**Abilities**

- **Dune Centipede** — *Coil*: wraps a player 1.5 s (root, 3% RH per 0.5 s); any hit of ≥ 5% of its health frees them.
- **Sunscar Stinger** — *Tail Sting*: 2.0 s tail raise, red line 4 m, 10% RH + `poison` 2% RH/s 8 s (dispellable poison).
- **Dune Breacher** — moves under sand as a visible ridge at 7 m/s (outrun it by sprinting). *Breach*: red
  circle 5 m, 2.5 s fill, **28% RH** + knock up 1 s. After breaching it is exposed for 6 s (takes +25% damage).
  (reuse: `BESTIARY-IDEAS.md` Dune Breacher.)
- **Carrion Glider** — circles until a player drops below 50% health, then dives on them (targeted 2.0 s, 9% RH).
- **Ember Fennec** — *Sand Kick*: 3 m cone, `blind` 2 s. Pack of 3–5; flees when alone.
- **Glass Shard** — *Refract*: every 12 s, for 3 s, reflects 40% of spell damage back at the caster
  (the shard turns mirror-silver, ringing sfx — stop casting). *Sunlance*: 8% RH bolt, 1.5 s, interruptible.
- **Tomb Warden** — *Ward of the Tomb*: gives allies within 10 m a 25% max-health shield, 2.5 s cast,
  interruptible, 20 s cooldown. *Sand Slam*: red circle 5 m, 2.0 s, 15% RH.
- **Wrapped Dead** ☾ — *Unwind*: at 30% health unwraps, +30% speed, `curse` on hit (−20% healing 6 s).
- **Dust Reaver** — *Disarm*: 2.0 s wind-up, red cone 3 m: `disarm` 3 s (weapon basic attacks disabled; spells still work).
- **Mirage Walker** — looks like a friendly traveller (green name) until a player comes within 10 m, then
  turns hostile with *Heat Shimmer*: **dispels 1 beneficial effect** from each player within 8 m (2.0 s,
  visible haze ring, no damage). *Scorch*: 8% RH fire bolt, 1.5 s, interruptible.
- **Glass Caller** — *Scream*: 2.0 s interruptible; calls the nearest pack within 35 m. No damage worth
  naming; kill or interrupt first (reuse: `BESTIARY-IDEAS.md` Glass Caller).

### 6.6 Whisperwood (22–30) — old elven forest, moonwells

The Gloamward (elves who never came out of the old forest) fight as a party: melee, archer, druid-healer.
First **line-of-sight** and **pull** monsters.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_fae_thorn_sprite` | Thorn Sprite | 22–26 | creature: imp ×1.4, body #4a8a3a, wings | swarm, pack 6–9 | 0.3 | 2% | h | `it_moonpetal` |
| `m_fae_moonwell_wisp` | Moonwell Wisp | 22–28 | creature: wisp ×1.6, body #c0d8ff | healer | 0.8 | 3% | h | `it_moonpetal` |
| `m_fae_dread_stag` | Dread Stag | 24–30 | creature: deer ×2.6, antlers, eyes #ff4040 (reuse: `dread_stag`) | melee | 1.4 | 8% | w | `it_rough_hide`, bases bow |
| `m_fae_veil_spider` | Veil Spider | 22–27 | creature: spider ×2.2 (reuse: `veil_spider`) | melee, ambusher | 1.0 | 6% + poison | h | `it_gloam_silk` |
| `m_fae_moon_mushroom` | Moon Mushroom | 23–28 | creature: mushroom ×2.0, variant moon_mushroom | caster | 0.8 | 7% | h | `it_spore_sac` |
| `m_fae_vine_hauler` | Vine Hauler | 25–30 | creature: horror ×2.6, body #2a4a1a, tentacles 6, rooted | brute | 2.4 | 10% | h | `it_moonpetal`, bases staff |
| `m_fae_gloam_sentinel` | Gloamward Sentinel | 24–30 | chibi: elf · ranger (hood, held longbow) | ranged | 0.8 | 6% | h | `it_gloam_silk`, bases bow, quiver |
| `m_fae_gloam_blade` | Gloamward Blade | 24–30 | chibi: elf · rogue (twin daggers) | melee | 1.0 | 6% | h | `it_gloam_silk`, bases dagger, rapier |
| `m_fae_gloam_druid` | Gloamward Druid | 26–30 | chibi: elf · druid | healer | 0.8 | 4% | h | `it_moonpetal`, bases staff, orb |
| `m_beast_grove_owl` ☾ | Grove Owl | 22–26 | creature: owl ×2.0, body #d8d0c0 | melee, flying | 0.9 | 5% | h | `it_rook_feather` |

⚑ Warband presence: **Thornmane Packs** hold the eastern forest (22–30).

**Abilities**

- **Thorn Sprite** — *Nettle Cloud*: 5 sprites or more in a 4 m cluster form a void zone under them that
  follows them (1% RH per 0.5 s). Area spells split them.
- **Moonwell Wisp** — heals 12% ally max health (1.8 s interruptible); *Moonveil*: makes one ally untargetable
  2 s after it drops under 20% (once per fight).
- **Dread Stag** — wary; if struck: *Antler Rush*: red line 14 m × 2.5 m, 2.0 s, 16% RH + knockback 5 m.
- **Veil Spider** — ambusher in canopy; drops on a player (red circle 2 m, 2.0 s fill as the thread shows),
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
- **Grove Owl** ☾ — silent flight (no hearing cue); *Talon* 7% RH + `bleed`.

### 6.7 Cinder Steppe (28–36) — ash grassland, orc war camps

The Ashtusk Horde's home. Beasts here are big, ride in with orcs, and burn the grass.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_beast_ash_hyena` | Ash Hyena | 28–32 | creature: hyena ×2.0, body #4a4038 | melee, pack 3–5 | 0.9 | 5% | h | `it_rough_hide` |
| `m_beast_steppe_saber` | Steppe Saber | 29–34 | creature: saber_cat ×2.4 | melee, ambusher | 1.3 | 7% | h | `it_rough_hide`, bases dagger |
| `m_beast_cinder_hound` | Cinder Hound | 30–35 | creature: hound ×2.0, glow #ff7020 | melee, pack 2–4 | 1.0 | 6% fire | h | `it_ember_core` |
| `m_ember_ash_wisp` | Ash Wisp | 30–36 | creature: wisp ×1.8 (reuse: `ash_wisp`) | caster | 0.75 | 8% fire | h | `it_ember_core` |
| `m_beast_ember_boar` | Ember Boar | 31–36 | creature: boar ×2.8, tusks, mane, body #3a2418 | brute | 2.6 | 12% | t | `it_rough_hide`, bases axe2h |
| `m_dragon_steppe_drake` | Steppe Drake | 32–36 | creature: drake ×2.6 (reuse: `mire_drake`), body #6a4a2a | brute | 2.8 | 12% | h | `it_dragon_scale`, bases scaled_chest |
| `m_beast_ashhorn_ox` | Ashhorn Ox | 28–34 | creature: elk ×2.4, body #3a3028, no antlers → horns (+feature) | brute | 2.4 | 11% | w | `it_rough_hide` |
| `m_beast_cinder_moth` ☾ | Cinder Moth | 28–33 | creature: moth ×2.0, body #6a2a10, glow | ranged, flying | 0.8 | 6% fire | h | `it_ember_core` |
| `m_undead_burnt_wanderer` ☾ | Burnt Wanderer | 30–35 | chibi: undead · rags, charred #2a2020 | melee | 1.1 | 6% + burn | h | `it_grave_dust` |

⚑ Warband presence: **Ashtusk Horde** holds most of the region (28–40, §9.5). 9 region monsters + 7 Ashtusk
members = 16 on the list.

**Abilities**

- **Ash Hyena** — *Ash Kick*: cone 3 m, `blind` 2 s. Follows orc patrols as scouts (+1 per Ashtusk patrol).
- **Steppe Saber** — ambusher in tall grass. *Pounce*: from 12 m, red circle 2 m on its target, 2.0 s
  (the grass parts in a line), 14% RH + knockdown 1 s.
- **Cinder Hound** — *Ember Bite* leaves a small void zone (burning grass) 2 m, 2% RH per 0.5 s, 6 s.
- **Ash Wisp** — *Ashfall*: 2.0 s cast (interruptible), red circles 3 m under **each** player within 20 m, 12% RH fire.
- **Ember Boar** — *Burning Charge*: 2.0 s paw, red line 14 m, 16% RH + knockback; leaves a **void zone
  line** of burning grass 2 m wide along its path for 8 s (2% RH per 0.5 s).
- **Steppe Drake** — *Scorch Breath*: 2.5 s intake (throat glow), red cone 10 m 60°, 22% RH + burn;
  turns 45°/s during it — side-step. *Tail Sweep*: red cone 5 m behind it, 2.0 s, 12% RH + knockback.
- **Ashhorn Ox** — wary grazer; *Stampede* when struck: the whole herd (3–6) runs a straight 20 m line
  (red line 20 m × 6 m, 2.0 s), 15% RH each hit, then flees. Orcs herd them; killing one angers nearby orcs.
- **Cinder Moth** ☾ — *Ember Dust*: 8 m line of falling sparks (void zone, 2% RH per 0.5 s, 6 s).
- **Burnt Wanderer** ☾ — *Flare*: on death, red circle 3 m, 1.5 s fill (open world gets 2.0 s), 10% RH fire.

### 6.8 Frostmantle (34–42) — tundra, glaciers, peaks

Cold is a hazard: the **Chill** meter (page 11 §20 `mech_env_cold`) runs outside warm spots at night and in
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
| `m_frost_rimebound_dead` ☾ | Rimebound Dead | 38–42 | chibi: undead · knight (frosted plate #b8d0e0) | melee | 1.3 | 7% | h | `it_grave_dust`, bases plate_helm |
| `m_dragon_rime_wyrm` (elite) | Rime Wyrm | 40–42 | creature: dragon ×3.0, white/blue (reuse: `rime_wyrm`) | brute, **elite**, placed at 3 peaks | 4.0 | 14% ice | t | `it_dragon_scale`, bases sword2h |

⚑ Warband presence: **Stonehide Clans** hold the high passes (34–48, §9.6); **Ashtusk** raids the southern
passes (to 40).

**Abilities**

- **Frost Stalker** — *Snow Veil*: invisible while still; reveals with a white puff; first hit +50%.
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
- **Rimebound Dead** ☾ — *Frozen Grip*: 2.0 s, red cone 3 m, root 2 s + 8% RH.
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
| `m_drowned_choir_wailer` ☾ | Choir Wailer | 42–48 | chibi: undead elf · bard outfit parts (long hair, silks, lyre held) | caster | 0.8 | 8% | h | `it_salt_pearl`, bases necklace |
| `m_drowned_brine_knight` | Brine Knight | 44–48 | chibi: undead ×1.2 · knight (verdigris plate #3a6a5a, tower shield) | melee (tank-like) | 1.8 | 9% | h | `it_drowned_brass`, bases heavy_chest, plate_helm |
| `m_drowned_deep_horror` ☾ | Deep Horror | 45–48 | creature: horror ×3.0, body #122a3a | brute | 3.0 | 13% | h | `it_salt_pearl` |

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
- **Choir Wailer** ☾ — *Dirge*: 2.5 s interruptible cast, `fear` (run away 3 s) on one yellow-targeted
  player. *Wail*: 8% RH bolt.
- **Brine Knight** — *Tower Shield*: blocks all frontal attacks while shield raised (4 s every 12 s, a blue-
  grey shield glow on the body, no ground colour). *Shield Bash*: 12% RH + stun 1 s. Guards Bellringers.
- **Deep Horror** ☾ — *Tentacle Field*: 3 red circles 3 m around itself in sequence 0.6 s apart, 2.0 s each,
  14% RH + knock up. *Grasp*: yellow targeted 2.0 s pull 6 m.

### 6.10 The Riftmarch (46–54) — magic-torn land, floating stone

Space itself is unreliable: rifts open (void zones that teleport), stone floats, monsters blink.

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

⚑ Warband presence: **Stonehide Clans** on the southern floating slabs (to 50); **Ember Legion** raiding forces (50–54).

**Abilities**

- **Rift Horror** — *Rift Tear*: 2.5 s, red circle 6 m on itself, 18% RH; leaves a **void zone** rift 3 m,
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
- **Phase Hound** — *Blink Bite*: teleports behind its target (1.0 s purple flicker on the spot it will
  appear), 8% RH. 8 s cooldown.
- **Storm Pyre** — *Chain Spark*: 7% RH lightning jumping to 3 players within 8 m of each other — spread.
- **Unmade Golem** — *Scatter*: its pieces fly apart (3 red circles 3 m around it, 2.0 s) and reassemble 4 s later.
- **Echo of a Warband** — six translucent figures replaying a fight; ignore players until one steps into
  the 12 m ring (a faint white circle), then all six become hostile at once (melee, ranged, healer).
  A set piece (page 14 event `ev_echo_battle`).

### 6.11 The Emberthrone (52–60) — volcanic, the Ember King's lands

The Ember Legion (§9.7) holds most of it. Demons come through Ember gates. Lava is a hazard
(page 11 `mech_env_lava`).

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_ember_cinder_imp` | Cinder Imp | 52–56 | creature: imp ×1.6 (reuse: `cinder_imp`) | swarm, pack 6–9 | 0.3 | 2% fire | h | `it_brimstone` |
| `m_ember_magma_golem` | Magma Golem | 54–60 | creature: golem ×2.8, cracked #2a1a14, core #ff6a20 | brute | 3.0 | 14% fire | h | `it_ember_core`, bases warhammer |
| `m_ember_ember_revenant` | Ember Revenant | 53–59 | creature: elemental ×2.2 (reuse: `ember_revenant`) | caster | 0.9 | 9% fire | h | `it_ember_core` |
| `m_demon_brimstone_hound` | Brimstone Hound | 52–57 | creature: hound ×2.4, horns (+feature), #3a1010 | melee, pack 2–4 | 1.1 | 7% fire | h | `it_brimstone`, `it_demon_horn` |
| `m_demon_ashmaw` | Ashmaw Fiend | 56–60 | creature: titan ×2.4, body #3a1a14, horns | brute | 3.4 | 15% | h | `it_demon_horn`, bases axe2h |
| `m_ember_obsidian_drake` | Obsidian Drake | 55–60 | creature: drake ×3.0, body #1a1a22, glow seams | brute | 3.0 | 14% fire | t | `it_dragon_scale` |
| `m_demon_ember_wraith` ☾ | Ember Wraith | 55–60 | creature: wraith ×2.2, body #4a1a10, eyes #ffa040 | caster | 0.9 | 9% shadow | h | `it_brimstone` |
| `m_ember_phoenix` | Ashen Phoenix | 57–60 | creature: phoenix ×2.4, variant ember_phoenix | caster, flying | 1.0 | 9% fire | h | `it_ember_core`, bases staff |
| `m_demon_lava_leech` | Lava Leech | 52–58 | creature: worm ×2.0, body #ff5010 | melee, burrower (in lava) | 1.0 | 7% | h | `it_brimstone` |

⚑ **Ember Legion** holds the region: 7 more members in §9.7 (16 on the list).

**Abilities**

- **Cinder Imp** — *Pop*: on death, red circle 2 m, 1.0 s fill, 4% RH fire. Page 11 §4.2: a hit of
  ≤ 5% RH is exempt from the warning minimum and may warn in 1.0 s.
- **Magma Golem** — *Eruption*: 3.0 s (it hunches, lava pours), red circle 8 m, **40% RH**; leaves 3 void
  zones 3 m of lava for 15 s. *Molten Fist*: 14% RH + burn.
- **Ember Revenant** — *Flame Pillar*: 2.0 s, red circle 3 m under 2 players, 16% RH fire. Interruptible cast.
- **Brimstone Hound** — *Brimstone Bite*: 7% RH + burn 2% RH/s 6 s. Packs of 2–4, flank.
- **Ashmaw Fiend** — *Devour*: yellow targeted 2.5 s, grabs one player 2 s (5% RH per 0.5 s); stunning it
  or dealing 10% of its health frees them. *Stomp*: red circle 7 m, 2.5 s, 22% RH + knockback.
- **Obsidian Drake** — *Glass Breath*: red cone 12 m 60°, 2.5 s, 28% RH; leaves a glass shard field (void
  zone cone, 2% RH per 0.5 s + `bleed`) for 8 s.
- **Ember Wraith** ☾ — *Soul Singe*: dispellable curse, 3% RH per second 8 s; dispelling it releases a
  red circle 3 m 1.5 s on the target (12% RH) — step away from friends before being dispelled.
- **Ashen Phoenix** — *Rebirth*: first death at 0 health becomes a 5 s egg (HP ×0.3); destroy the egg or
  it returns at 50%.
- **Lava Leech** — swims in lava; *Spit*: 8% RH fire glob at 20 m, 1.5 s.

### 6.12 Veilspire Isle (60) — endgame island, the Veil

Everything here is level 60 and uses the **Veil pressure** rule: monsters gain +5% health and damage per
Veil step the player's party has unlocked (page 07/13, 0–4 steps), so the island keeps pace with gear.
Mechanic modifiers are common: champions 15%, rares 5%.

| id | Name | Lv | Body | Role | HP× | Hit | Temp | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_veil_veilspawn` | Veilspawn | 60 | creature: horror ×1.6, body #1a1030 | swarm, pack 6–10 | 0.3 | 2% | h | `it_veil_thread` |
| `m_veil_veil_warden` | Veil Warden | 60 | chibi: human ×1.2 · knight (black-violet plate, eyeless helm) | melee | 1.6 | 8% | h | `it_veil_thread`, bases plate_helm |
| `m_veil_veil_sorcerer` | Veil Sorcerer | 60 | chibi: elf · sorcerer (violet silks, halo of shards) | caster | 0.8 | 9% | h | `it_null_pearl`, bases orb |
| `m_veil_void_shade` | Void Shade | 60 | creature: wraith ×2.0, body #0a0610 | melee, ambusher | 1.0 | 8% shadow | h | `it_null_pearl` |
| `m_veil_star_horror` | Star Horror | 60 | creature: horror ×3.0, eyes 9 #ffe86a | brute | 3.0 | 14% | h | `it_null_pearl` |
| `m_veil_reality_shard` | Reality Shard | 60 | creature: shard ×2.4, body #e0e0ff | caster, support | 0.9 | 9% true | h | `it_veil_thread` |
| `m_veil_null_titan` (elite) | Null Titan | 60 | creature: titan ×3.2, body #20202a, veins #a060ff | brute, **elite** | 4.0 | 16% | h | `it_null_pearl`, bases warhammer |
| `m_veil_genesis_worm` | Unmaking Worm | 60 | creature: worm ×3.6, pale #d8d0e0 | brute, burrower | 3.0 | 14% | h | `it_null_pearl` |
| `m_veil_void_prophet` | Void Prophet | 60 | chibi: human · warlock (hood, eye-sigil, held tome) | healer, support | 0.9 | 4% | h | `it_veil_thread`, bases tome |
| `m_veil_mirror_knight` ☾ | Mirror Knight | 60 | chibi: human · fighter, mirror-plate (reflective material) | melee | 1.4 | 8% | h | `it_null_pearl` |

(reuse: Emberveil `enemy-looks.json` veil_warden, veil_sorcerer, veilspawn_herald, void_prophet,
reality_shard, star_horror, cosmic_titan, genesis_worm, void_shade — bodies only; names changed where the
Emberveil name read "cosmic".)

**Abilities**

- **Veilspawn** — *Unravel*: each hit stacks `unravel` (−3% max health, 10 stacks, 10 s, refreshes).
- **Veil Warden** — *Null Cleave*: red cone 5 m 120°, 2.0 s, 16% RH; its target cannot be healed for 2 s.
- **Veil Sorcerer** — *Fold Space*: 2.5 s interruptible; swaps the positions of two yellow-targeted
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
- **Void Prophet** — heals 12% (interruptible); *Veil Blessing*: allies immune to crowd control 6 s (magic, dispellable).
- **Mirror Knight** ☾ — copies the last spell a player cast at it as a buff on itself for 6 s (a burn becomes
  its burn aura; a shield becomes its shield). Dispellable.

### 6.13 Count check

| Region | Region monsters | + warband/legion members present | Named rares (§8) |
|---|---|---|---|
| Hearthvale | 10 | Sootwick 7 | 3 |
| Mossfen | 10 | Sootwick 7 | 3 |
| Greyridge | 10 | Sootwick 7, Unburied 7 | 3 |
| Sunscar | 11 | Unburied 7, Thornmane 7 | 3 |
| Whisperwood | 10 | Thornmane 7 | 3 |
| Cinder Steppe | 9 | Ashtusk 7 | 3 |
| Frostmantle | 9 | Stonehide 7, Ashtusk 7 | 3 |
| Drowned Coast | 10 | Stonehide 7 | 3 |
| Riftmarch | 10 | Stonehide 7, Ember Legion 7 (raids) | 3 |
| Emberthrone | 9 | Ember Legion 7 | 3 |
| Veilspire | 10 | — | 3 |
| **Total** | **108** | 42 warband/legion ids | **33** |

Every region has at least 8 own monsters; the two regions at 9 are held by a warband/legion, so their
open-world list is 16.

---

## 7. Champions and rares: the modifier table

### 7.1 How many, and which

| Rank | Stat modifiers | Mechanic modifiers | Region 1–2 | Region 3–5 | Region 6–9 | Region 10–11 |
|---|---|---|---|---|---|---|
| champion | 1 | 0 / 1 / 1 / 1 | stat only | 1 mechanic | 1 mechanic | 1 mechanic + 1 stat |
| rare | 1 | 1 / 1 / 2 / 2 | 1 mechanic | 1 mechanic | 2 mechanics | 2 mechanics + 1 stat |
| named rare | fixed per §8 | fixed per §8 | | | | |
| dungeon trash champion (Heroic/M+) | page 12 | | | | | |

**Mythic+ affixes** (page 12) may force one mechanic modifier onto every champion in a key.

A champion's **pack** (its ordinary escort) shares none of its modifiers. A rare's **escort** (2–4 normal
minions, reuse: Farhold `rare_prowler` escort) shares its **first mechanic modifier** at half strength
(half the damage, twice the cooldown).

### 7.2 Stat modifiers (reuse: Farhold `data/enemies.json modifiers`, all 22 kept as written)

These names are Farhold's own and original. Numbers are multipliers on the rank's numbers.

| id | Name | Aura | Effect |
|---|---|---|---|
| `mod_vicious` | Vicious | #ff5a3a | damage ×1.45 |
| `mod_ironclad` | Ironclad | grey | armour ×2.6, health ×1.2 |
| `mod_fleet` | Fleet | pale cyan | move ×1.5, attack interval ×0.72 (never below the page 11 telegraph minimum) |
| `mod_vital` | Vital | green | health ×2.1 |
| `mod_venomous` | Venomous | green | every hit poisons (2% RH/s 6 s) |
| `mod_scorched` | Scorched | orange | every hit burns |
| `mod_rimed` | Rimed | ice blue | every hit chills (−20% move 3 s, stacks to −60%) |
| `mod_thorned` | Thorned | brown | reflects 28% of melee damage taken (cap 8% RH per hit) |
| `mod_leeching` | Leeching | dark red | heals 45% of damage dealt |
| `mod_warded` | Warded | violet | −35% spell damage taken, health ×1.2 |
| `mod_frenzied` | Frenzied | red | attack interval ×0.55, damage ×0.85 |
| `mod_gilded` | Gilded | gold | gold ×4.5, drops ×1.6 |
| `mod_hoarding` | Hoarding | gold | drops ×2.4, health ×1.3 |
| `mod_unyielding` | Unyielding | stone | health ×1.6, armour ×1.8, move ×0.8 |
| `mod_giant` | Giant | — | size ×3.2 (max body 9 m), health ×1.8, damage ×1.5, move ×0.82 |
| `mod_fiery` | Fiery | fire aura (`STATUS_FX.burn`) | damage ×1.25, hits burn |
| `mod_frostbound` | Frostbound | `freeze` aura | health ×1.35, armour ×1.3, hits chill |
| `mod_stormlash` | Stormlash | `haste` aura | move ×1.35, interval ×0.7, hits shock |
| `mod_graveborn` | Graveborn | `curse` aura | health ×1.4, life steal 35%, hits curse |
| `mod_bramblehide` | Bramblehide | `root` aura | armour ×1.9, thorns 32% |
| `mod_hollowed` | Hollowed | `bleed` aura | damage ×1.35, health ×0.75, hits bleed |
| `mod_wizened` | Wizened | — | size ×0.55, health ×0.65, damage ×0.85, move ×1.45 |

### 7.3 Mechanic modifiers (new)

Each mechanic modifier is a small page 11 mechanic bolted onto a body. Warning times are open-world
values (≥ 2.0 s for anything ≥ 15% RH). Damage is at the champion's damage (already × rank).

| id | Name | Aura / nameplate icon | What it does (numbers, shape, telegraph) | Counterplay | Not with / not on |
|---|---|---|---|---|---|
| `mod_emberwake` | **Emberwake** | orange flame ring | Leaves a **void zone** trail: 2 m wide, lasts 5 s, fire, 2% RH per 0.5 s. On death: **red circle** 5 m, 2.0 s fill, 25% RH. | don't chase through the trail; step out when it dies | swarm; `mod_hoarfast` |
| `mod_undertow` | **Undertow** | blue-grey spiral | Every 12 s: 1.5 s swirl at its feet + rising whoosh, **white tethers** to every player within 20 m, then pulls them to 3 m of it over 0.4 s. Followed 0.5 s later by its next basic attack. | knockback immunity/root-breakers; tanks stay close; ranged move out past 20 m | flying; `mod_blinkstep` |
| `mod_spellwoven` | **Spellwoven** | violet rune ring | Spawns a sentinel rune at its feet: a **void zone beam** 12 m long, 1.5 m wide, rotating 40°/s around the rune, 4% RH per 0.5 s. Beam shows 1.5 s as a thin outline before it becomes solid. Rune lasts while it lives. | watch the rotation, move with it | swarm; region < 3 |
| `mod_hoarfast` | **Hoarfast** | white frost ring | Every 10 s drops 3 frost orbs at random players: **red circles** 3 m, 2.0 s fill, 12% RH + `freeze` (root) 1.5 s. On death a 6 m ring of 6 orbs (outside it is safe). | leave circles; don't stand still | `mod_emberwake` |
| `mod_blinkstep` | **Blinkstep** | purple flicker | Every 8 s teleports next to the player furthest from it (within 30 m). The destination shows a **red circle** 3 m for 1.5 s before it arrives (10% RH on arrival). | ranged stay grouped; stand in melee | `mod_undertow` |
| `mod_aegis_bearer` | **Aegis-Bearer** | gold shield icon | Every 15 s: 2.0 s interruptible cast (gold border), then it and every monster within 12 m gain a shell: **immune to damage 3 s** (a gold shell on each body — no ground colour, so it cannot be confused with a blue safe zone). | interrupt; kill it first; swap to adds during the shell | — |
| `mod_stonecaller` | **Stonecaller** | grey stone ring | Every 14 s raises a stone wall 10 m long, 3 m tall, 3–5 m from a player (grey crack line on the ground for 1.0 s first, no damage), lasting 6 s. Blocks movement and projectiles. Walls never close an exit fully (always a 2 m gap). | walk round; wait it out | arenas under 20 m |
| `mod_unstoppable` | **Unstoppable** | red chevrons | Immune to crowd control and knockback, health ×1.4, move ×0.85, deals +25% to shields. | burn it down; kite | `mod_wizened` |
| `mod_cinderchain` | **Cinderchain** | orange chain icon | Links itself to 2 pack mates with **white tethers** flecked orange; a player touching a tether takes 8% RH (once per 1 s) and is set on fire. Tethers stretch up to 15 m. | don't cross the lines; kill a linked mate to cut one | solo monsters (needs 2 mates) |
| `mod_blightbearer` | **Blightbearer** | green skull | Every 7 s: a **void zone** 4 m under a random player (1.0 s rim warm-up), poison, 2% RH per 0.5 s, lasts 12 s. Max 4 at once. | fight it somewhere open, move off pools | — |
| `mod_gravesoil` | **Gravesoil** | bone-white skull | As Blightbearer but shadow; when a pool ends, a **Grave Hand** add (swarm, 0.3 HP×, 3% RH) claws up out of it. | kill hands with area spells | swarm |
| `mod_siegeborn` | **Siegeborn** | brass mortar icon | Every 9 s lobs 3 shells at players 10–30 m away: **red circles** 3 m, 2.0 s fill, 14% RH each. Does not target players in melee. | melee it; ranged keep moving | — |
| `mod_manyfold` | **Manyfold** | multiple dots icon | +3 normal members in its pack (same type). | area spells | swarm; bosses |
| `mod_mirrorhide` | **Mirrorhide** | silver ring | Every 10 s for 3 s: silver shell + chime — reflects 30% of damage taken back at the attacker (cap 8% RH per hit). | stop attacking for 3 s | `mod_thorned` |
| `mod_stormcrowned` | **Stormcrowned** | yellow spark ring | When hit, 20% chance to throw a spark along the ground: a small **red** moving ball 1 m, 6 m/s, 8 m range, 6% RH. | dodge sparks; ≤ 3 sparks at once | — |
| `mod_shackler` | **Shackler** | grey chain icon | Every 14 s: **yellow targeted** circle 2 m on one player, 2.0 s; still inside when it closes → rooted 2.5 s. | move 2 m | — |
| `mod_mirrorkin` | **Mirrorkin** | double-image icon | At 50% health splits into 3: itself + 2 copies with 10% of its health dealing 25% damage; copies have no nameplate modifiers. | area; watch which one keeps the name | swarm |
| `mod_oathsworn` | **Oathsworn** | red banner | +20% damage and +10% size for each pack mate killed near it (max 5). | kill it first, or kill the pack far from it | solo monsters |
| `mod_hollowheart` | **Hollowheart** | black ring | Every 16 s: 2.5 s cast, **red donut** 4–12 m (safe hole within 4 m of it), 20% RH. | step in close | flying |
| `mod_quakeborn` | **Quakeborn** | cracked ground icon | Every 12 s: **red circle** 6 m on itself, 2.0 s fill, 18% RH + knock up 0.5 s. | step out | swarm |
| `mod_wardbreaker` | **Wardbreaker** | torn scroll icon | Every hit strips one beneficial magic effect from its target (max once per 3 s). | dispellable buffs matter less; burst it | — |
| `mod_shrouded` | **Shrouded** | none (it hides) | Invisible beyond 10 m; the first hit after reveal +50%. Nameplate hidden until revealed. | detection effects; move in groups | bosses |
| `mod_packcaller` | **Packcaller** | horn icon | At 50% health, a 2.0 s interruptible **gold-border** cast: calls 2 normal monsters of its family from 40 m. | interrupt | — |
| `mod_iron_willed` | **Iron-Willed** | steel circlet icon | Cannot be charmed, dominated, slept or feared (every mind-control effect fails with "Its will is iron."). No other change. | use damage and ordinary control (stun, root, slow) instead | `mindless` monsters (they already cannot be charmed) |
| `mod_starved` | **Starved** | red mouth icon | Heals 10% max health for each player it kills; +30% move when a player is below 30% health. | keep people topped up | — |

**Total: 22 stat + 25 mechanic = 47 modifiers** (Iron-Willed added in the reconciliation pass). The build must keep this list and the page 11 library in
sync: every mechanic modifier names the page 11 mechanic it uses in its data (`mechanic: "mech_trail_fire"`).

### 7.4 Combination rules

1. Never two modifiers that both create **ground zones** on a champion (Emberwake + Blightbearer is banned);
   a rare may have two, but never three.
2. Never `mod_fleet` + `mod_blinkstep`, `mod_undertow` + `mod_siegeborn` + `mod_hollowheart` together (too
   punishing), `mod_unstoppable` + `mod_mirrorhide`.
3. Named rares may break rule 1 (they are authored and tested).
4. A modifier that needs mates (`mod_cinderchain`, `mod_oathsworn`) re-rolls on a monster with none.
5. Every modifier is **visible**: a ground ring in its aura colour plus an icon on the nameplate; hovering
   the icon shows the one-line rule (from this table) — page 03 owns the tooltip.

---

## 8. Named rares per region

Named rares are hand-authored rares with a fixed body, modifiers, a signature ability, a spawn rule and a
loot table. They use the page 11 **elite** mechanic budget (§22 there: up to 3 mechanics, warnings ≥ 2.0 s,
no one-shots). Their nameplate is gold with a crown pip; the zone map shows a **skull pip** when a named rare
is up and the player has heard its rumour (reuse: Farhold `js/rumours.js`).

Spawn rule notation: *placeholder* = it replaces one normal of its base type at its spot; timer = min–max
respawn after death; **night** = only between dusk and dawn; **condition** = a world state.

| id | Name | Region | Lv | Base / body | Modifiers | Signature | Spawn rule | Loot |
|---|---|---|---|---|---|---|---|---|
| `m_beast_old_gristlejaw` | Old Gristlejaw | Hearthvale | 5 | Thicket Boar ×1.5 size | Vital, Quakeborn | *Uprooting Charge*: charge line 16 m that tears up the orchard (fallen trees become obstacles 30 s) | placeholder for a Thicket Boar in Pellam's orchard; 20–40 min | Rare `it_gristlejaw_tusk` (trinket), 5% `uq_gristlejaw_tuskhelm` |
| `m_folk_mother_rook` | Mother Rook | Hearthvale | 6 | chibi human · rogue, black feather cape | Fleet, Packcaller | calls 6 Orchard Rooks that *Peck Eyes* | the scarecrow field; **night**; 30–60 min | Rare cloak, 5% `uq_rookfeather_mantle` |
| `m_undead_sexton_hobb` | Sexton Hobb | Hearthvale | 6 | chibi undead · cleric, shovel | Graveborn, Gravesoil | *Dig*: raises 2 Barrow Shamblers from the ground every 20 s | Brightwater graveyard edge; **night**; after 10 Barrow Shamblers killed there that night | Rare shovel-mace, 5% `uq_sextons_spade` |
| `m_fen_the_mire_queen` | The Mire Queen | Mossfen | 11 | Bog Slime ×2.4 size, crown of reeds | Vital, Blightbearer | splits twice (at 66% and 33%) into Mire Princes that must die within 20 s of each other or they re-merge | peat pits; 40–60 min | Rare, 5% `uq_mire_crown` |
| `m_fen_one_eyed_nell` | One-Eyed Nell | Mossfen | 10 | Peatwife | Aegis-Bearer, Warded | heals every monster within 20 m 8% every 6 s (interruptible) | any stilt village ruin, placeholder for a Peatwife; 30–50 min | Rare staff, 5% `uq_nells_eye` |
| `m_fen_longjaw` | Longjaw | Mossfen | 12 | Silt Lurker ×1.6 | Unstoppable, Hollowed | *Death Roll* grabs 2 s; a second player must hit it for 5% health to free | the drowned ferry landing; 45–75 min | Rare boots, 5% `uq_longjaw_hide` |
| `m_construct_warden_seven` | Warden Seven | Greyridge | 16 | Shale Warden ×1.4, brass bands | Ironclad, Stonecaller | *Seal the Tunnel*: walls off one of 3 exits; the others open | abandoned rail junction; 30–50 min | Rare shield, 5% `uq_seventh_plate` |
| `m_folk_blackpowder_bess` | Blackpowder Bess | Greyridge | 17 | Blackdelve Powderwife | Siegeborn, Emberwake | a keg ring: 6 kegs in a circle, one lit every 2 s | quarry floor; 30–60 min | Rare crossbow, 5% `uq_bess_fuse` |
| `m_beast_skarn` | Skarn the Grey | Greyridge | 14 | Crag Bear ×1.6, grey | Vital, Frenzied | at 30% sleeps 5 s (heals 10% unless hit for 5% of its health) | high meadow den; 40–60 min | Rare chest, 5% `uq_skarn_pelt` |
| `m_sand_the_glass_widow` | The Glass Widow | Sunscar | 22 | Sunscar Stinger ×1.8, glass body | Mirrorhide, Venomous | lays 4 glass eggs that hatch Stingers in 12 s | the glass tombs' outer court; **night**; 40–60 min | Rare dagger, 5% `uq_glass_widow_fang` |
| `m_sand_old_thirst` | Old Thirst | Sunscar | 24 | Dune Breacher ×1.4 | Unstoppable, Quakeborn | burrows toward the player who moved least in the last 5 s | the dry sea; condition: sandstorm weather; 60–90 min | Rare belt, 5% `uq_thirst_girdle` |
| `m_folk_kasra_dustmother` | Kasra Dustmother | Sunscar | 21 | Dust Reaver · chibi human · swashbuckler parts | Blinkstep, Packcaller | *Mirage Double*: makes 2 Mirage Walker copies of herself | caravan wreck site; 30–50 min | Rare rapier, 5% `uq_dustmother_veil` |
| `m_fae_hollowhart` | Hollowhart | Whisperwood | 28 | Dread Stag ×1.8, white | Fleet, Hollowheart | the forest fog thickens (vision 20 m) during the fight | a ring of standing stones; **night** during a full moon (every 4th night); 60–120 min | Rare bow, 8% `uq_hollowhart_antler` |
| `m_fae_the_gloam_prince` | The Gloam Prince | Whisperwood | 30 | Gloamward Blade · elf rogue, silver hair, circlet | Shrouded, Mirrorkin | *Court Duel*: challenges one player (a white tether 10 m for 8 s — others cannot hit him while it lasts) | a moonwell glade; 45–75 min | Rare dagger, 5% `uq_gloam_circlet` |
| `m_fae_mother_of_threads` | Mother of Threads | Whisperwood | 26 | Veil Spider ×2.0 | Venomous, Shackler | webs the glade: 4 web patches (void zones that root 1 s) | canopy nest; 40–60 min | Rare cloak, 5% `uq_threadmother_silk` |
| `m_beast_ashmane` | Ashmane | Cinder Steppe | 34 | Steppe Saber ×1.6, black mane | Shrouded, Hollowed | stalks the player for 60 s before attacking (a rumble cue every 10 s) | grass sea; 45–75 min | Rare, 5% `uq_ashmane_claw` |
| `m_dragon_scorchwing` | Scorchwing | Cinder Steppe | 36 | Steppe Drake ×1.8, wings (+feature) | Emberwake, Fiery | sets the grass alight in a 30 m ring (arena wall of fire 20 s) | the burnt mesa; 60–90 min | Rare, 5% `uq_scorchwing_scale` |
| `m_beast_the_grey_herd` | The Grey Herd | Cinder Steppe | 32 | 1 Ashhorn Ox bull ×1.6 + 6 cows | Unstoppable (bull) | *Stampede* every 15 s in a new direction | wanders the east steppe (a moving spawn); 30–60 min | Rare, 5% `uq_herdbull_horn` |
| `m_frost_whitemaw` | Whitemaw | Frostmantle | 40 | Drift Lurker ×1.5 | Hoarfast, Shrouded | the whole 40 m ice field is its ground; surfaces 4 times | the Silent Floe; 60–90 min | Rare, 5% `uq_whitemaw_tooth` |
| `m_frost_the_long_winter` | The Long Winter | Frostmantle | 42 | Rime Elemental ×2.6 in a blizzard (fog up) | Frostbound, Spellwoven | the arena is the fight: Chill meter fills 2× unless standing in the green beneficial circles it cannot enter | the high col; condition: blizzard; 90–150 min | Rare, 8% `uq_long_winter_shard` (reuse: `BESTIARY-IDEAS.md` The Long Winter) |
| `m_frost_grandmother_tick` | Grandmother Tick | Frostmantle | 37 | Glacier Tick ×3.0 | Manyfold, Vital | births 6 ticks every 15 s until killed | ice caves; 30–50 min | Rare, 5% `uq_tick_carapace` |
| `m_drowned_captain_vell` | Captain Vell | Drowned Coast | 46 | Brine Knight · chibi undead captain (tricorn) | Undertow, Cinderchain | calls a Tide Thrall boarding party of 5 at 66% and 33% | the wreck of the *Gull's Oath*; **night**; 45–75 min | Rare, 5% `uq_vells_spyglass` |
| `m_drowned_the_bell_below` | The Bell Below | Drowned Coast | 48 | Drowned Bellringer ×1.6 | Packcaller, Aegis-Bearer | each toll raises the tide 0.5 m (void zone rises from the low ground) | the drowned belfry; condition: low tide; 60–90 min | Rare, 5% `uq_bell_clapper` |
| `m_drowned_saltmother` | Saltmother | Drowned Coast | 44 | Kelp Slime ×2.4 | Blightbearer, Undertow | undertow pools merge into one large pool | tide flats; 30–50 min | Rare, 5% `uq_saltmother_pearl` |
| `m_rift_the_thing_sewn_wrong` | The Thing Sewn Wrong | Riftmarch | 52 | Stitchwork ×1.6 | Unstoppable, Mirrorkin | each copy is a different body plan (quad, spider, biped) | the butcher's rift; 60–90 min | Rare, 5% `uq_stitchers_needle` |
| `m_rift_no_one` | No One | Riftmarch | 54 | Absence ×1.4 | Shrouded, Wardbreaker | takes a player's mount skill and dodge roll for 20 s on hit | anywhere in the region (moves each spawn); 90–120 min | Rare, 8% `uq_nobodys_mask` |
| `m_rift_prismatic_warden` | The Prismatic Warden | Riftmarch | 50 | Abyssal Prism ×2.0 | Spellwoven, Mirrorhide | 3 beams at once rotating opposite ways | floating slab 7; 40–60 min | Rare, 5% `uq_prism_core` |
| `m_ember_cinderlord_hask` | Cinderlord Hask | Emberthrone | 57 | Magma Golem ×1.4 | Emberwake, Quakeborn | erupts 3 times; each leaves more lava | the slag river; 45–75 min | Epic chance ×2, 5% `uq_hask_heart` |
| `m_demon_the_hungry_gate` | The Hungry Gate | Emberthrone | 59 | Ashmaw Fiend ×1.5 | Starved, Packcaller | at 50% the Ember gate behind it pours Brimstone Hounds every 10 s until it dies | an Ember gate; condition: the gate is open (world event); 60–120 min | Epic chance ×2, 5% `uq_gatejaw` |
| `m_ember_ashen_matron` | The Ashen Matron | Emberthrone | 60 | Ashen Phoenix ×2.0 | Fiery, Hoarfast (ice-fire oddity) | reborn twice | the caldera rim; **night**; 60–90 min | Epic chance ×2, 5% `uq_matron_feather` |
| `m_veil_the_hollow_crown` | The Hollow Crown | Veilspire | 60 | Veil Warden ×1.4 with a crown | Aegis-Bearer, Oathsworn, Stonecaller | leads 6 Veil Wardens; each dead warden empowers him | the ruined throne court; 60–90 min | Epic, 8% `uq_hollow_crown` |
| `m_veil_seer_without_eyes` | The Seer Without Eyes | Veilspire | 60 | Void Prophet | Blinkstep, Wardbreaker, Spellwoven | *Foretold*: shows a red danger zone 5 s **before** it happens (unusual reverse telegraph: very long warning, very big hit 60% RH) | the observatory stair; **night**; 60–90 min | Epic, 8% `uq_eyeless_sigil` |
| `m_veil_the_last_titan` | The Last Titan | Veilspire | 60 | Null Titan ×1.3 | Unstoppable, Quakeborn, Siegeborn | *Null Field* covers half the arena and swaps sides every 20 s | the broken bridge; 120–180 min | Epic, 10% `uq_titan_knuckle` |

**Rules for named rares.**
- At most **one** named rare per region is alive at a time per shard (world instance); the others wait.
- **Placeholder** spawns: when a placeholder's timer is up, the next time that normal spawn point respawns,
  it has a 25% chance to be the named rare instead.
- Kill credit: every player who dealt ≥ 5% of its health gets **personal loot** (page 08).
- First kill per character records it in the bestiary journal (§11) and grants a small **renown** reward
  (page 07).
- Named rares **do not leash** within 70 m but **do** evade if their spot is abandoned for 15 s.

---

## 9. Warbands and the Ember Legion

(reuse: Farhold `data/warbands.json`, `js/warbands.js`, `js/patrols.js`, `js/sites.js placeWarCamps`,
R26 + R27 M9–M10.) Everything that works in Farhold is kept: members as ordinary bestiary entries, a zone
**held** by at most one warband, **grip** (0–1) that the player's kills push down and time regrows, war
parties on the roads, a **war camp** per held zone with a sealed war-chest, a **warlord**, a leader aura,
a standard-bearer, and a **rout** when the leader falls.

What changes in Wildmarch:

| Farhold | Wildmarch |
|---|---|
| a zone is held by a seeded roll | a warband holds **named sub-zones** of the regions in 00 §7 (page 01 names them); still at most one hostile holder per sub-zone |
| grip is per player save | grip is **per shard** (shared by everyone in that world copy), drifts back toward the story value at `gripRegen` 0.1 per game day (reuse); the war front is a weekly event on page 14 |
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
| **3 Shooter** | ranged | holds 20 m, focuses the lowest-armour player | archer |
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
Camp: the **Barrow-Fort**. A dead army that never stopped marching; the **Barrowking** (`r01_barrowking`) is
its master (page 13). Unburied do not rout (they are dead): their leader's death instead makes each follower
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
| `b_unburied_gravemarshal` | Warlord | the Gravemarshal | 18 / 24 | chibi: undead ×2.0 · knight | boss | 70% Ironclad + 2 Bonesoldiers; 40% Leeching; 15% Unyielding (reuse: `unburied_gravemarshal`); *March of the Dead*: a moving wave of skeleton soldiers across the arena (red band 3 m deep, 2.0 s warning, 20% RH, gaps marked) |

### 9.4 The Thornmane Packs — beastkin (levels 20–32)

Colour #7aa84a. Race `beast` (chibi beastkin). Hold the Sunscar mesas (20–24) and the eastern Whisperwood
(22–30), raiding into the southern Cinder Steppe (28–32). Camp: the **Den-Ring** (thorn ring, hide tents).
Hunting packs who run down anything that walks their ground: Thornmane **hunt** — a war party that sees
you from 60 m follows your trail (tracks shown on the ground) for 90 s before it charges.
Unique: `uq_moonhook`.

| id | Rank | Name | Lv | Body | HP× | Abilities |
|---|---|---|---|---|---|---|
| `m_beastkin_thornmane_mauler` | Grunt | Thornmane Mauler | 20–32 | chibi: beast · barbarian parts (hide, held axe2h) | 1.8 | *Maul*: 2 hits, red cone 3 m, 2.0 s, 10% RH each |
| `m_beastkin_thornmane_prowler` | Cutter | Thornmane Prowler | 20–32 | chibi: beast · rogue (claws) | 1.0 | *Hock Cut*: slow 40% 4 s |
| `m_beastkin_thornmane_tracker` | Shooter | Thornmane Tracker | 21–32 | chibi: beast · ranger | 0.8 | *Quarry Mark*: marked target takes +10% from the pack 10 s |
| `m_beastkin_thornmane_moonseer` | Caller | Thornmane Moonseer | 22–32 | chibi: beast · shaman | 0.75 | *Moonbolt Chain*: 7% RH lightning to 3 targets within 8 m |
| `m_beastkin_thornmane_bonesetter` | Mender | Thornmane Bonesetter | 22–32 | chibi: beast · druid | 0.8 | *Pack Howl*: heals all allies within 10 m 6% (2.0 s, interruptible) |
| `m_beastkin_thornmane_totembearer` | Bearer | Thornmane Totem-Bearer | 23–32 | chibi: beast ×1.1 · totem on back | 1.8 | plants a totem (the banner) that must be destroyed separately (HP ×0.5) |
| `m_beastkin_thornmane_packlord` | Leader | Thornmane Packlord | 24–32 | chibi: beast ×1.2 · wolf_helm | 2.6 | *Run Them Down*: whole band +30% move 6 s |
| `b_thornmane_greatfang` | Warlord | the Greatfang | 26 / 32 | chibi: beast ×1.9 | boss | 66% Fleet + howl calls 2 Maulers; 33% Vicious, drops to all fours (reuse: `thornmane_greatfang`); *Leaping Hunt*: 3 yellow targeted leaps 2.0 s each, 18% RH |

### 9.5 The Ashtusk Horde — orcs (levels 26–40)

Colour #b8402a. Race `orc`. Home: the Cinder Steppe (28–36) with war camps; raids into Whisperwood's
north edge (26–30) and Frostmantle's southern passes (34–40). Camp: the **Warcamp** (palisade and bone
totems). Orcs ride Ember Boars (a Grunt at level 30+ has a 20% chance to be mounted: +50% move, charges).
Unique: `uq_ashtusk_headtaker`.

| id | Rank | Name | Lv | Body | HP× | Abilities |
|---|---|---|---|---|---|---|
| `m_orc_ashtusk_brute` | Grunt | Ashtusk Brute | 26–40 | chibi: orc · warrior (rags, axe) | 1.8 | *Cleave*: red cone 4 m 120°, 2.0 s, 12% RH |
| `m_orc_ashtusk_raider` | Cutter | Ashtusk Raider | 26–40 | chibi: orc · rogue | 1.0 | `bleed`; *Torch*: sets 3 m of grass on fire (void zone 6 s) |
| `m_orc_ashtusk_spearthrower` | Shooter | Ashtusk Spearthrower | 27–40 | chibi: orc · javelins | 0.8 | *Pinning Spear*: yellow targeted 2.0 s, 10% RH + root 1 s |
| `m_orc_ashtusk_bonecaller` | Caller | Ashtusk Bonecaller | 28–40 | chibi: orc · shaman (bone charms, staff_totem) (reuse look: `ashtusk_bonecaller`) | 0.75 | *Ash Rain*: 4 red circles 3 m, 2.0 s, 12% RH fire |
| `m_orc_ashtusk_bloodmender` | Mender | Ashtusk Blood-Mender | 28–40 | chibi: orc · shaman (red paint) | 0.8 | *Blood Rite*: heals an ally 15% by spending 5% of its own health |
| `m_orc_ashtusk_bearer` | Bearer | Ashtusk Standard-Bearer | 29–40 | chibi: orc ×1.2 · banner | 1.8 | banner aura |
| `m_orc_ashtusk_warchief` | Leader | Ashtusk Warchief | 30–40 | chibi: orc ×1.3 · war_helm | 2.8 | *Warcry*: band +15% attack speed 8 s; *Challenge*: taunts the player with most threat to it 3 s |
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

### 9.7 The Ember Legion — the Ember King's army (levels 50–60)

Not a race: soldiers of every folk (human, dwarf, orc) bound by ember brands, with demons as shock troops.
Uses the warband machinery (grip, camps, patrols, ranks, rout — **except** that branded soldiers never rout:
when their leader dies each brand flares, +20% damage 10 s). Colour #ff5a20. Holds the Emberthrone (52–60)
and sends raiding forces to the Riftmarch (50–54). Camp: the **Ember Bastion** (black stone and iron).
Unique: `uq_legion_brand`.

| id | Rank | Name | Lv | Body | HP× | Abilities |
|---|---|---|---|---|---|---|
| `m_ember_legionnaire` | Grunt | Ember Legionnaire | 50–60 | chibi: human/dwarf · warrior (black plate, glowing brand #ff5a20) | 1.8 | *Shieldline*: 3+ side by side → a red line wave pushes forward 6 m (2.0 s), 14% RH |
| `m_ember_brandblade` | Cutter | Brandblade | 50–60 | chibi: orc · fighter | 1.1 | *Brand*: burn 3% RH/s 6 s |
| `m_ember_pyre_archer` | Shooter | Pyre Archer | 51–60 | chibi: human · ranger (ember arrows) | 0.8 | *Fire Arrow Volley*: 6 red circles 3 m, 2.0 s, 10% RH fire |
| `m_ember_ash_magus` | Caller | Ash Magus | 52–60 | chibi: human · pyromancer | 0.8 | *Firewall*: 12 m line void zone 8 s (2.5 s cast, interruptible) |
| `m_ember_flame_priest` | Mender | Flame Priest | 52–60 | chibi: dwarf · cleric (ember robes) | 0.9 | *Cauterise*: heals 15% and removes 1 player-applied debuff from an ally (2.0 s, interruptible) |
| `m_ember_ensign` | Bearer | Ember Ensign | 53–60 | chibi: human ×1.1 · banner | 1.8 | banner aura; banner explodes when dropped: red circle 5 m, 2.0 s, 20% RH |
| `m_ember_centurion` | Leader | Ember Centurion | 54–60 | chibi: human ×1.3 · knight (crest) | 3.0 | *Hold the Line*: band immune to knockback 8 s |
| `b_ember_warmarshal` | Warlord | the Ember Warmarshal | 56 / 60 | chibi: human ×1.8 · dragon_knight | boss | page 11 elite budget; *Sunder Brand* tank buster; *Call the Legion* 4 Legionnaires at 60%/30% |

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
| region table | every kill rolls its region's level-band table (Farhold `loot.js` rules) | always |
| `bases` | item bases this monster favours (Farhold `dropBases`, reuse) | brigands → dagger, light_chest |
| family reagent | a crafting reagent per family (§3) | `it_rough_hide` |
| trophy | a named-rare or elite trophy item, used by quests and the trophy wall (page 03) | `it_gristlejaw_tusk` |
| `uq_` chance | named rares and warlords only | `uq_mire_crown` 5% |
| quest items | page 14 attaches quest drops by monster id | `q_*` |
| rank bonus | champion +1 item, rare +2, named guaranteed Rare+ (§4.2) | |
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
  "tags": [],
  "temperament": "territorial",
  "rank": "normal",
  "pack": [1, 2],
  "night": false,
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

Modifier rows use `data/monster-modifiers.json` with `{ id, name, kind: "stat"|"mechanic", aura, icon,
mult: {...}, mechanic, excludes: [], minRegion }`. Warbands keep Farhold's `warbands.json` shape
(reuse) with `members` extended by `mender` and `levels` per sub-zone.

---

## 13. Tests the build must have

1. **Every id is unique** and matches `m_<family>_<snake>`; family is in §3's table.
2. **Every body resolves**: a creature `type` exists in `CREATURE_TYPES`, a variant exists in
   `creature-variants.json`, a chibi race exists in `chibi2-races.js`, an outfit exists in
   `class-outfits.json` or its parts exist in `avatar-2d/js/parts/chibi2-parts.js` (Farhold's normaliser
   rule: an unregistered part id is silently dropped).
3. **No creature below size 1.4** (reuse: Farhold's node test).
4. **Every region has ≥ 8 own monsters and ≥ 3 named rares**; every monster's levels sit inside its
   region's band (00 §7) ± 0.
5. **Every special ≥ 15% RH has a telegraph** with warning ≥ the page 11 minimum for its context.
6. **Every mechanic modifier names a page 11 mechanic** that exists in the library.
7. **Combination rules** (§7.4) hold for 10,000 rolled champions and rares per region.
8. **Warband share read once** (reuse: Farhold R27 `tests/round27-warbands.test.js` grep rule — one reader of `spawnShare`).
9. **Dead data check**: move a knob (e.g. `mod_undertow` pull range) to an odd value and ask the running
   module — do not compare the file to a constant (the playground's standing lesson).
10. **No third-party names**: every `name` passes the word list in page 16's IP check.
