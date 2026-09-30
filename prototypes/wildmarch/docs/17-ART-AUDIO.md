# WILDMARCH — Design Bible, page 17: art and audio

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Nothing is built.** Owner of this page: how
Wildmarch looks and sounds — Chibi 2 characters and how gear shows on them, creature bodies, **monster
rarity looks**, **mount species**, **Travel Method vehicles and creatures**, spell effects and the rules
that keep a fight readable, how telegraphs are drawn, the environment and **lighting** of each region
(always daylight; film-set dark places), the interface style, **the item card** (3D portrait, rarity
frames, special-rarity looks and icons), the graphics tiers, and all audio: voices, speech, boss lines,
sound effects, ambience and the music question.

The one rule above all others on this page: **a fight must be readable.** Canon pillar 3 says every
attack that can kill you is telegraphed, and colour, shape and sound mean the same thing everywhere.
Every choice below that trades beauty for clarity picks clarity.

Almost everything here **exists** in the playground and is reused; each section says what exists and
what changes. The budgets these rules must fit are in [page 16 §17](16-TECH.md); the telegraph
vocabulary itself (what each colour *means*) is owned by [page 11](11-BOSS-MECHANICS.md) — this page owns
how it is *drawn*.

---

## 1. Principles

1. **One art style: chunky, readable, lit.** Chibi 2 bodies (big heads, clear silhouettes), procedural
   low-to-mid-poly world, physically lit (sky probe, shadows, fog) so it reads as a place and not a
   test scene (`highdef-3d` lessons).
2. **Everything generated or CC0.** Characters, creatures, trees, rocks, textures, icons and sounds are
   generated in code or CC0 (Kenney sounds, Quaternius assets). No bought or ripped art. No third-party
   IP in any name.
3. **Colour has meaning.** Rarity colours, element colours and telegraph colours are three separate,
   fixed tables (§4). Nothing decorative may borrow a telegraph colour at telegraph strength.
4. **Sound has meaning.** Every telegraph kind has its own warning sound; every rarity its own loot
   sound; a boss's warning line is always the same words.
5. **A setting for everything that can annoy.** Screen shake, hit-stop, bloom, others' spell effects,
   voice volume — all have a switch ([page 04](04-SETTINGS.md)).

---

## 2. Characters — Chibi 2

**(reuse: `avatar-3d/js/chibi2.js` and its family; `avatar-3d/CHIBI2.md` is the reference.)** Chibi 2 is
the playground's flagship body. The older procedural Chibi (`mii.js`) and the Quaternius mesh mode are
deprecated and **must not** be used.

### 2.1 What a body is

| Fact | Value (from CHIBI2.md) |
|---|---|
| Meshes per body | **2** (one cloth bucket, one metal bucket), skinned |
| Triangles per body | **≤ 8,500** (the druid class look, the heaviest, is 8,428) — a regression guard, tested |
| Rig | 22 bones: root, hips, chest, head, eyeL/eyeR + pupilL/pupilR, three per arm and leg, **gripR/gripL** in the palms |
| Animation | ~90 clips; clip sets `CHIBI2_ANIMS`, `CHIBI2_COMBAT_ANIMS`, `CHIBI2_MELEE_ANIMS`, `CHIBI2_EMOTE_ANIMS`, `CHIBI2_SWIM_ANIMS`, `CHIBI2_RIDE_ANIMS`, `CHIBI2_WORK_ANIMS`; **follow-through** on every clip; **hold-aware** idle/walk/run/ready/guard/attack |
| Weapons | Aimed through the grip bones (`aim()` solves the wrist); edges roll through a cut; any weapon may go in the off hand |
| Shields | Strapped to the forearm, face out |
| Hands-free clips | Wave, talk, every emote, swimming, punch, kick put the weapon away for their length |
| Cache | Identical normalised avatar JSON shares geometry and materials (reference-counted); skeletons and mixers are per body |
| Face | Built on the head's own surface (`faceZ`); iris "glance" instead of blinks; no closed eyes |
| Known gaps | **No LOD** (level of detail), no foot IK (feet adapting to slopes), no facial morphs, no cloth simulation, no GPU crowd animation — see §2.9 for what Wildmarch adds |

### 2.2 Playable races (canon §4: Human, Elf, Dwarf, Halfling)

**(reuse: `prototypes/farhold/js/bodypresets.js` `applyBodyPreset`, `avatar-3d/js/chibi2-races.js`.)** A race
is a **parameter set** on the one body (`avatar.body.race`): leg, torso, width, shoulders, arm, hand, head
and neck multipliers, default roundness, face shaping (jaw, brow, ear size, cheek hollow, muzzle), a
posture folded into every clip, slider ranges, a skin/hair palette, and weights per part slot.

| Race | Body (from chibi2-races) | Default look tendencies |
|---|---|---|
| Human | The base proportions | Any hair, beards common |
| Elf | Tallest (height middle 0.78), slim, roundness 0 | Pointed ears, rarely beards (a beard pick is swapped out by the preset) |
| Dwarf | Short (height middle 0.18), broad, roundness 0.45 | Beards almost always, heavy boots |
| Halfling | Short, round-faced | Bare or light feet, curly hair common |

Choosing a race in the creator stamps the race and moves the body sliders to the middle of that race's
ranges; **the face you built, hair and clothes are kept** (Farhold R26 rule: "a body preset that threw
away ten minutes of face-building would be a trap").

### 2.3 Enemy races

**(reuse: `prototypes/farhold/js/warbands.js`, `data/warbands.json`.)** Orc, Goblin, Giant, Undead and
Beastkin are Chibi 2 races used **only for enemies** (canon §4). Each warband has melee / rogue / ranged /
caster / leader looks. Goblins were made shorter in the 2026-09-25 fixes (head 1.02, legs 0.62) — keep.

### 2.4 The character creator (`scr_char_create`, page 03)

Every slot the creator offers, with the Chibi 2 part coverage from CHIBI2.md (ids that build their own
shape; the rest fall back to a shared shape and are left out of the creator so no choice looks identical
to another):

| Slot | Options offered |
|---|---|
| Race | Human, Elf, Dwarf, Halfling |
| Body | height, width, head size, roundness (within the race's range); cheeks on/off; skin colour (race palette + free picker) |
| Head shape | round, oval, square, heart, long, wide, chiseled |
| Hair | short, bald, buzz, side_part, bangs, bob, long, wavy, ponytail, bun, buns, mohawk, spiky, curly, afro, braids, pixie, slicked, tonsure + colour |
| Eyes | round, almond, narrow, sleepy, angry, dot, anime, happy, wink, tired + colour, size, spacing, tilt |
| Brows | straight, angry, worried, thick, thin, raised, none |
| Nose | small, dot, button, wide, hook, snout, none |
| Mouth | smile, neutral, frown, grin, smirk, o, sad_open |
| Ears | normal, pointed |
| Facial hair | none, stubble, goatee, mustache, full, long, chinstrap, soul_patch, braided_beard |
| Face marks | none, freckles, blush, scar, scar_cheek, soot, war_stripe |
| Pronouns | he / she / they (Lingo pronoun sets) |
| Voice | the class's voice from `shared/voices.js` with pitch, depth, tone, speed sliders and a "Hear it" button (§8.4) |

Clothes in the creator are the **class outfit** (§2.5) and cannot be changed there. The 3D preview is
Farhold's `figure3d.js` (one small renderer, disposed before the game's renderer is made — reuse).

### 2.5 Class outfits (reuse: `avatar-3d/data/class-outfits.json` + `js/class-outfits.js`)

An outfit is only clothes, headwear and carried items for one class; `dressAs(avatar, outfit)` lays it
over any body. The file has **24 of the 30** class keys today: **`witch_hunter` has no row** and needs one
(trench coat, `wide_brim` hat, crossbow — `classes/witch_hunter.md` §11), and bard, demon_hunter, scavenger,
shadow_dancer and swashbuckler are missing too (checked 2026-09-30). Farhold's `classwear.js`
stamps each **starting armour piece** with the part the class look has in that slot (`item.look.worn`), so
the character walks out of the creator looking like their class rather than like a generic armour tier.
Class-distinct headwear already modelled (`CLASS_HATS`): `war_helm` (warrior), `horned_helm` (fighter
only), `great_helm` (paladin), `plate_helm` (knight), `wolf_helm` (druid), `bone_headdress` (shaman),
`rune_helm` (runesmith), `tricorn` (tactician), plus the monk's `gi` top.

**Wildmarch rule:** a class's outfit is its **level 1 look**. It never comes back automatically; the
Wardrobe (§2.7) is how a player returns to it.

### 2.6 How equipped items show on the body (reuse: Farhold `applyGearLook`, `rpg.gearLook`)

Every time equipment changes, the client rebuilds the avatar JSON and calls `actor.setAvatar(next)`
(which keeps the clip set):

All **15** equipment slots of page 08 §2.1 are covered here (head, shoulders, chest, back, hands, waist, legs,
feet, neck, ring ×2, main hand, off hand, **tool**, mount — canon §4; the old light slot is gone).

| Equipment slot | Avatar slot | Rule |
|---|---|---|
| Weapon | `held` | `heldLookFor(item)` — the weapon's model id (`fh_*` procedural weapons in `chibi2-weapons.js`, 18 + the originals) |
| Off hand | `offhand` | `offhandLookFor(item)` — shield (strapped), dagger/second weapon, focus (grimoire, orb, `relic`, `idol` — Farhold `foci.js`; the shaman's **hide drum**, §2.8; the War Standard's new `standard` part, page 08), quiver (worn on the back; a quiver with a basic-attack effect shows it on the arrow tips it holds: fire-tipped, powder-capped, split-fletched — page 08 owns the effects) |
| Head / chest / legs / feet | `hat` / `top` / `bottom` / `shoes` | If the item carries `look.worn` (class starting pieces, **every Set, Unique and Legendary in Wildmarch**), that exact part and colours; otherwise the base's **armour tier** picks a part from the `ARMOUR_LOOK` table and the rarity tints it (Farhold's tints: Uncommon `#4a5a7a`, Rare `#8a7a4a`, Epic and above `#c8a24a`) |
| Tool (harvesting, page 19) | `decor` on the belt or back; `held` while harvesting | Pickaxe and hatchet on the back, sickle and skinning knife on the belt, rod over the shoulder (reuse: Farhold `js/tools.js` + `data/tools.json` model ids). While a harvest bar runs the tool swaps into the main hand (Farhold's mining clip in `CHIBI2_WORK_ANIMS`) and the weapon goes to its sheathe point (§2.9); it swaps back when the bar ends |
| Back (page 08's back slot) | `cape` | cape, shoulder_cape, half_cape, fur_mantle, feather_mantle, shawl, travel_cloak, tattered_cape |
| Shoulders | `pauldrons` / `mantle` / `capelet` (Chibi 2 gear, page 08 §2.1) | Same `look.worn` / armour-tier rule as head and chest |
| Hands | hands | Same `look.worn` / armour-tier rule |
| Waist | `belt` / `belt_pouches` | Same rule; the belt is also where a short tool hangs |
| Neck, Ring I, Ring II | — | Not drawn (page 08 §2.1) |
| Mount | creature body under the rider (§3) | The mount's creature spec; shown only while mounted |
| Guild tabard (page 15 §8.1) | `decor` | `tabard` in the guild's two colours |

**Wildmarch changes:**

- **Every Set, Unique and Legendary item gets a hand-authored `look.worn`** (part id + `color` +
  `color2`) in its data (page 09), so the best items are recognisable across a room. A test fails if one
  is missing.
- **Class sets** use the class outfit's parts recoloured and upgraded (e.g. the warrior's `war_helm` in
  the set's metal + trim colour), so a set piece still reads as that class.
- **Rarity glow**: Epic and above add a faint emissive trim in the rarity colour on the part's `color2`
  (cheap: a material colour, no extra draw). Off on the Low preset.
- A **new part** needs registering in `avatar-2d/js/parts/chibi2-parts.js` (or `CHIBI2_ONLY_PARTS` in
  `chibi2.js` if it has no 2D twin) — **or the shared normaliser silently turns it into `none`**
  (playground `CLAUDE.md` Chibi 2 rule). Every new part stays inside the 8,500-triangle, two-bucket budget.
- **Hats that cover the crown** must stay outside the skull dome at every height and keep brims at
  y ≥ 0.41 (CHIBI2.md "Head space and hoods").

### 2.7 The Wardrobe and dyes (page 08 §21 owns the rules)

Page 08 §21 defines the Wardrobe (an account-wide collection of appearances) and dyes, run by the
Wardrobe Keeper (`npc_wardrobe_keeper`) in every hub. The art side: a collected look **is** a `look.worn`
record (part id + `color` + `color2`), so the Wardrobe needs no new model work — showing a look is the
same `actor.setAvatar()` call gear already makes. Dyes recolour `color`/`color2` only. Because Chibi 2
bakes colours into vertex data, **a colour change rebuilds that body's template** (CHIBI2.md "Color
changes currently rebuild a variant") — fine for a player at the Wardrobe, and the reason a town square
of 30 players each in different dyes costs 30 templates (page 16's budgets assume that).

### 2.8 Forms, companions and bodies that classes bring

No class summons a pet out of thin air (canon §6 "Pets"). Every body below is a reused plan tinted and
scaled; page 06 and the class files own the rules.

| Class body (page 06 / class file) | Body | Notes |
|---|---|---|
| Druid **Bear / Wolf / Heron** forms | `bear`, `wolf`, and a heron built on the `bat` plan (long neck + legs, `beak`, span 1.4) — the heron is a **new variant** | Tinted in the druid's colours; the creature's `fxHeight` sets aura size; swap by fading the old body out over 0.25 s while a `nature` `pillar` plays. The spell bar icons swap to the form's version of each spell in the same 0.25 s |
| Dragon Knight Dragon Form (level 40) | `drake` scaled to 1.6 × the character's height, aspect colour (fire/ice/storm) | Wings from the creature plan |
| Demon Hunter **Demonsight** | no form (W27). Demonsight draws a thin violet outline (`#b070ff` at 60%, a fresnel term through `enhance()`) on hidden and demon-tagged enemies within 40 m, and a pulsing `marked` sprite on a revealed weak point | Traps are ground props (jaw trap, wire snare, flash pot) from `proctown` drawkit + spellfx `rune` discs at ≤ 40% opacity (§4.3 rule 1) |
| Ranger **tamed beast** | whatever `quad`/`bat`/`spider` creature was tamed, at its wild size | A leather collar (`decor` ring on the neck bead) marks it as the ranger's; a downed beast lies in the `dead` pose with a faint green `regen` aura until the revive ritual |
| Warlock **bound demon** | the beaten demon's own body (`imp`, `horror`, `biped` demons) | Violet chain links (`disarm` chain sprite, tinted `#9458e0`) orbit its wrists; the warlock's health-tithe shows as a thin red thread from warlock to demon while a Tithe spell runs |
| Necromancer **Control Undead** | the raised corpse or the seized undead enemy's own body | Eyes swap to `glow` in the necromancer's colour; a `curse` aura at the feet; when control ends the body collapses (raised corpse) or its eyes return to the enemy colour (seized undead) |
| Enchanter **Charm** | the charmed enemy's own body | A slow pink `confused`-style glyph orbit over the head (`#ffb0e0`) and nameplate turns friendly green for the duration |
| Mage **Wards and decoys** | decoy = a Chibi 2 copy of the mage at 55% opacity with an arcane rim (`#b070ff`), sharing the template (no rebuild) | Wards are `barrier` shells on the ally |
| Shadow Dancer clones | Chibi 2 copy at 45% opacity, desaturated to near-black with a violet rim | Same template sharing |
| Shaman **Storm Tales** beasts | Thunder Ox = `boar`/`bear` proportions scaled 1.8 with `horns`; **Rain Crane** = `owl` (`bat` plan) retuned long-legged and long-billed — a crane, not the druid's heron; Wind Hare = `cat`/`rat` quad with long ears | All three use a new **storm-cloud material** (grey-white, soft alpha edges, small `lightning` forks flickering inside, 70% opacity) — they stride out of the clouds, run through the fight and fade; they are spell effects with bodies, not pets (`classes/shaman.md` §11). The Great Storm's `fx_storm_herd` uses the same material on Chibi 2 creature silhouettes |
| Shaman **hide drum** | new off-hand focus model: a round hide drum at the hip (strap over the shoulder), painted Ox / Crane / Hare figures on the skin; held in the off-hand `offhand` slot as a focus look | Also the shaman's HUD gauge art (page 03). Drum strokes: `sfx_shaman_drum_ox`, `_crane`, `_hare` (§8.2) |
| **Planted banner** (knight's Banner, tactician's standard, the War Standard, guild Banner Call) | new prop: a tall pole with a square banner in the owner's colours, driven into the ground with a stake-strike dust puff; cloth sways on the shared wind (`wind.js`). Start from Farhold's round-27 gate-banner art. The held version is page 08's `standard` part (the War Standard off hand) | One prop, recoloured per use: class colour (knight, tactician), guild colours (page 15 Banner Call); the planted prop is one draw per banner |
| Tinker's sentry and other **Devices** | `turret` (`roller` plan) or `golem` biped with `blocky` boxes, scaled 0.5 | "Device" is the tinker's word; Engineering's socketables are **Gadgets** (page 19) |

### 2.9 What Wildmarch adds to Chibi 2 (new work)

| Addition | Why | Budget |
|---|---|---|
| **LOD 1 body**: one merged mesh, no face detail, fewer ring segments | Crowds in towns, hubs and world bosses (page 16's budgets) | ≤ 2,500 triangles, 1 mesh |
| **Stand-in**: an instanced capsule-and-head silhouette in the character's two main colours + nameplate | Beyond LOD 1 distance | ≤ 200 triangles, instanced (1 draw for all) |
| **Nameplates** (DOM or one canvas) | Name, guild, health bar, cast bar, target marker | 0 extra draw calls if DOM; if canvas, 1 |
| **Sheathe** | Weapons shown on the back/hip while out of combat, instead of vanishing (CHIBI2.md "future step") | Uses existing grip bones |

---

## 3. Creatures

**(reuse: `avatar-3d/js/creatures.js`, `creature-types.js`, `data/creature-variants.json`;
`prototypes/farhold/js/mesh-merge.js`.)** 37 types over six body plans, same `{ group, update, setAnim,
metrics, dispose }` interface as people, clips idle / walk / run / attack / talk / dead / fly.

| Plan | Types |
|---|---|
| `quad` | wolf, dire wolf, boar, bear, rat, horse, deer, hound, cat, frog, mire drake, dragon, hyena, saber cat, crocodile, turtle, griffin (+ mounts pony, courser, elk) |
| `spider` | giant spider, beetle |
| `bat` | bat, owl, moth, phoenix |
| `snake` | snake, worm, centipede |
| `biped` | golem, titan, imp |
| `float` | elemental, wisp, shard, wraith, horror, slime, mushroom, mimic |
| `roller` | rolling turret |

Rules:

- **Every creature is folded** by `compactCreature` (one draw call per material instead of one per bead:
  Farhold's horse went 34 → 1–2 draws; the landing scene 104 → 72).
- **Size** comes from the monster row (page 10); auras and effects scale themselves to `fxHeight`.
- **Bosses** are a scaled creature or Chibi 2 body **plus** unique parts (a crown, a glowing core,
  chains) — page 10/12/13 describe each; a boss that needs a body plan that does not exist (a sea
  serpent's coils above water, a many-armed thing) is flagged in its page and becomes a creature-plan
  task in the roadmap ([page 18](18-ROADMAP.md), creature-plan work).
- **Rank marks**: see §3.1. No rank is ever shown as a coloured ring on the ground (§4.3 rule 6).
- Beasts do not talk; they **snarl** (Lingo `beast_snarl` narration in the log) and have creature sounds
  (§8.2).

### 3.1 Monster rarity looks (new; page 10 owns the lists, `mod_` and `grr_` ids)

Page 10 owns which affixes (`mod_`) and greater rarities (`grr_`) exist and what they do. This page owns
how each one **looks**, so a player can read a pack's danger from 40 m before pulling it.

**Nameplates** (DOM, §2.9) by monster rarity:

| Rarity (canon §4) | Name colour | Plate | Body |
|---|---|---|---|
| Normal | white `#e8e4dc` | plain | as built |
| **Champion pack** | blue `#7f95ff` | a small blue shield badge left of the name; the shared affix's name in a second line (e.g. "Stoneskin") | a faint blue fresnel rim (`#7f95ff` at 35%) on every member so the pack reads as one group; scale 1.08 |
| **Rare** | yellow `#e8d020` | a yellow crown badge; a second line with its 2–3 affix names | yellow rim at 45% + a slow emissive pulse (2.5 s, no extra draw); scale 1.15. Its minions use Normal plates with a thin yellow underline |
| Named | orange-gold `#ffb45a` | a banner badge + its title line | its own authored parts (page 10) |
| Boss | — (boss frame across the top, §9) | — | authored (page 10/12/13) |

Affix (`mod_`) names show as words, never as colour alone. Affixes with a body effect reuse `STATUS_FX`
auras at 50% sprite count (e.g. a shielding affix = `barrier` shell, a hasted affix = `haste` sparks).

**Greater rarities** (`grr_`) sit **on top** of the rarity above (canon §12.3). They are a big difficulty
spike, so they get the strongest monster looks in the game — and they are **never turned down by any
graphics setting** (they are gameplay information, like telegraphs). The name gains the greater rarity as a
word before it, in orange `#ff8a3d` (page 10 §4: "Giant Flaming Ashtusk Brute"), and a **hexagon badge** per greater rarity sits left of the
rarity badge (hexagons are only ever used for greater rarities, so they cannot be confused with the round
special-rarity item icons of §11).

All **28** greater rarities of page 10 §7.5.3 get a badge. Every badge is an original SVG in
`assets/data/icons/grr_<id>.svg` (`viewBox="0 0 24 24"`, readable at 12–24 px, 1 px dark outline `#0b0b10`):
a **hexagon** with an orange rim (`#ff8a3d`, the greater-rarity name colour of page 10 §4) and the glyph inside
in its **group colour** — Size bone `#e8e0cc`, Element the element's colour (§4.2), Body steel `#b8c0c8`, Mind
red `#e05040`, Number silver `#dfe6f2`, Lineage stone-gold `#c9a44a`, Fortune gold `#ffcf5a`. The badge also sits
at the left of the carrier's cast bar (page 11 §22.5). The body look, scale and aura of each row are **page 10's**
("Look" column); this page draws them with `spellfx.js` `status()` auras at the sprite counts above.

| Group | Greater rarity | Hexagon badge glyph | Body notes for the art (page 10 owns the numbers) |
|---|---|---|---|
| Size | `grr_giant` **Giant** | one tall standing figure | scale ×2.0 (cap 9 m), body, hitbox and `fxHeight` together; dust `footfall` each step; camera shake within 10 m (off under `set.graphics.screenShake`) |
| Size | `grr_colossal` **Colossal** | two tall figures side by side | scale ×3.0 (cap 12 m); cosmetic ground-crack decals where it stands |
| Element | `grr_flaming` **Flaming** | a flame with a hollow core | glowing seams `#ff7a20`, `burn` aura along the back, heat shimmer |
| Element | `grr_electrified` **Electrified** | a bolt | blue-white arcs over the body every 0.5 s (decoration only; real arcs get telegraphs, §4.3 rule 4) |
| Element | `grr_frozen` **Frozen** | a six-arm snowflake | ice crust (`freeze` shell at 30% so it never reads as "stunned"), frost mist, frozen footprints |
| Element | `grr_venomous` **Venomous** | a fang with a drop | green drip from mouth and claws; low toxic mist at the feet (cosmetic, not a zone) |
| Element | `grr_shadowed` **Shadowed** | an eclipse | near-black silhouette with smoking edges, only the eyes lit |
| Element | `grr_tear_touched` **Tear-touched** | a split ring | a floating violet-white crack over the head, star specks drifting off the body |
| Element | `grr_plagued` **Plagued** | three spots | olive haze, flies, boils |
| Body | `grr_ironclad` **Ironclad** | an anvil | four bolted iron plates, each its own panel that clangs off when broken; 4 pips on the nameplate |
| Body | `grr_spectral` **Spectral** | a ghost | 50% see-through with a ghost trail; Solid/Faded switch shown on the body |
| Body | `grr_hollow` **Hollow** | a cracked heart | cracked-open chest; a glowing 0.6 m **Heart** orb orbits it (its own small frame) |
| Body | `grr_warded` **Warded** | a shield rune | a ring of turning runes at the waist; the ring's glyph shows which ward is up |
| Body | `grr_vampiric` **Vampiric** | a red fang | red mist strands flowing into it; a white tether during Blood Tether |
| Body | `grr_undying` **Undying** | a looped arrow | bones and ash re-knitting under the skin; gold outline on the collapsed body |
| Mind | `grr_enraged` **Enraged** | a claw | red eyes, nostril steam, snarling idle |
| Mind | `grr_swift` **Swift** | a winged arrow | two trailing after-images, dust streaks |
| Mind | `grr_unstoppable` **Unstoppable** | a double chevron (drawn, not the ⟫ character) | dark red chevron glow over the body |
| Mind | `grr_cunning` **Cunning** | an eye | a hood of shadow over the eyes; a white shimmer when Sidestep is ready |
| Mind | `grr_commanding` **Commanding** | a crowned horn | a planted-style war banner on its back (the §2.8 banner prop, scaled), gold motes |
| Mind | `grr_dreadful` **Dreadful** | a screaming face | a long shadow; a big eye icon over it during Terrify |
| Number | `grr_twin` **Twin** | two linked rings inside the hexagon (the hexagon keeps it apart from the Twinned item icon, §11.2) | two identical bodies joined by a white tether; revive countdown on the nameplate |
| Number | `grr_splitting` **Splitting** | a split circle | glowing seams dividing the body; each split lands with a 1.0 s shimmer |
| Number | `grr_echoing` **Echoing** | a double wave | a faint after-image 1 m behind it |
| Lineage | `grr_ancient` **Ancient** | a carved rune (the hexagon keeps it apart from the Ancient item icon) | moss or bleached-bone texture, runic scars, body ×1.2, slow idle; a rune flash on Old Knowledge |
| Lineage | `grr_stormborn` **Stormborn** | a storm cloud | a small storm cloud 6 m above it with rain and wind lines, the ground wet under it (the §2.8 cloud material) |
| Fortune | `grr_gilded` **Gilded** | a coin | gold-leaf body, coins spilling as it moves |
| Fortune | `grr_jewelled` **Jewelled** | a faceted gem | gem crystals grown through the hide, catching the light |

**Sounds** (§8.2): every greater rarity gets `grr.<id>.loop` (quiet, 8 m; Giant and Colossal use a
`grr.<id>.step` thud instead), and `grr.spot` plays the first time one enters 40 m. Every **state change** that
page 11 §22.5 rule 3 lists (Spectral Solid/Faded, Warded's flip, Cunning's sidestep ready, Hollow's Heart hiding,
Undying's collapse, Twin's revive countdown) plays the **`tg_rarity_shift`** chime (1.0–1.5 s before the
switch) together with the body cue — never a ground colour.

Combinations follow page 10's exclusion groups: a size rarity (Giant) stacks with one element rarity
(Giant Flaming) — the body gets both; two element rarities never appear together, so two element auras
never have to be drawn on one body. A whole greater-rarity **group** (rare) draws its auras at 60% sprite
count per member, and only the nearest 6 members (by distance) carry the full particle set, so a pack of
eight Flaming wolves stays inside the `maxLive` budget of §7.

### 3.2 Mount species (new; page 08 owns the catalogue, page 20 owns speeds)

Every mount is a creature body with a **saddle point** (a `metrics().saddle` position and a heading, new on
the plans that lack it) where the rider sits on `CHIBI2_RIDE_ANIMS` `sit`. Farhold's mounts (pony, courser,
elk) are the reuse; the species below are variants in `creature-variants.json` unless marked **new body**.

Page 08 §24.2 owns the species list, jumps, gallop times and tricks; the table below is only how each body
is built. **Every mount body has two attach points**: `saddle` (where the rider sits, position + heading) and
`bridle` (where the reins meet the head, so the rider's hands and the reins line up); the Crested Strider also
has **`saddle_2`** for its second seat (page 08). They are added to `metrics()` on every plan that lacks them,
and the **seven new bodies** below carry them from the start.

| Species (page 08 §24.2) | Body | New work | Gait / notes |
|---|---|---|---|
| Horse (trail horse, courser, destrier, pony) | `horse`, `courser`, `pony` (reuse) | `saddle`/`bridle` points | walk, trot, gallop |
| Great Elk · Stag | `elk` · `deer` (reuse) | points | long bounding canter |
| Boar | `boar` (reuse) scaled 2.0, `tusks`, leather barding | points | short heavy trot, head low |
| **Ram** | **new body `ram`**: a stocky quad with curled horns (page 13's Frost Ram uses `deer` until it exists) | new body + points | sure-footed trot; climbs steeper slopes (page 08) |
| **Raptor Runner** (dinosaur) | **new body `raptor`**: two digitigrade legs, a forward-leaning level torso, a stiff counterweight tail, small forelimbs, a head on a short S-neck | new body + points; also used by raptor enemies (page 10 `tf_raptor`) | bird-like run: body level, head bobs 4 cm, tail counter-swings |
| **Crested Strider** (dinosaur) | **new body `strider`**: a tall plains dinosaur on **two legs** with a sail-like crest along its back | new body + `saddle`, **`saddle_2`**, `bridle` | slow long stride; riders sit high (saddle at 2.2 m), the passenger behind |
| **Horned Grazer** (dinosaur) | **new body `grazer`**: a heavy quad with three horns and a neck frill | new body + points | lumbering trot, head swings |
| Giant Frog (aquatic hybrid) | `frog` (reuse) scaled ×6 | points | land: a hop every 0.6 s (the `run` clip is the hop); swims with paired hind-leg kicks, only eyes and rider above water. The rider plays `sit`, never the swim clip (Farhold R16: it tips the root back 64°) |
| Tidewalker Turtle · River Crocodile · Sea Serpent (aquatic hybrids) | `turtle` (howdah seat) · `crocodile` · `snake` long (reuse) | points | swim and dive; the serpent slithers on land with the camera kept level |
| Dune Lizard · Salamander | `crocodile` (reuse; sand skin with raised legs · lava-seam skin) | points | sideways body sway, tail S-curve; the Salamander's cosmetic fire trail |
| Mossback Beetle / Scarab Runner | `beetle` (`spider` plan) scaled ×3.5 | points on the thorax | six-leg tripod gait |
| Sabrecat · Snow Cat | `saber_cat` · `cat` large (reuse) | points | bounding run |
| Dire Wolf / Warhound · Great Bear · Spider | `dire_wolf`, `hound` · `bear` · `spider` (reuse) | points | |
| Titan (walking throne) | `titan` (reuse, biped) | a throne seat as `saddle` | heavy footfalls |
| **Floating Stone** | **new body: hover slab** — a flat carved rock slab floating 0.6 m up, with a slow bob and drifting dust | new body + points (the `bridle` is a rune the rider's hand rests on) | glides at ground speed; over water it hovers, never swims |
| **Clockwork Strider** | **new body: clockwork biped** — two jointed brass legs under a riding cage, gears turning in the hips (Engineering, page 19 §17.6) | new body + points | stiff mechanical walk; a soft tick loop instead of breathing |
| **Longshank Calf** | **new body `longshank`** (page 20's Travel Method strider — the calf is the same body at 0.45 scale) | new body + points | long-legged wading walk; wades water up to 3 m |
| Winged: Griffin · Drake · Dragon · Phoenix · Great Owl | `griffin` · `drake` · `dragon` · `phoenix` · `owl` large (reuse) | points | walk, run, glide; fly at Riding IV (page 08, page 20) |

Rules: each mount keeps its **gait clip clock running** (Farhold R16 bug: calling `setAnim` every frame
froze every beast on the first 16 ms of its gait); the rider's hips follow the saddle point's height each
frame; a swimming mount lowers the rider so the waterline sits at the rider's waist and plays a wake
decal (a V of foam sprites, not a ground ring). Each species has `mount.<species>.step`, `.call`, and
(swimmers) `.swim` sounds (§8.2).

### 3.3 Travel Method vehicles and creatures (new; page 20 owns routes, speeds, schedules)

A Travel Method (`tm_`) carries players along a fixed route (page 20). The art needs one model per kind,
with **seats** (Farhold `avatar-3d/js/vehicles.js` `metrics()` already returns hitch and seat points) and
a closed or roofed place for riders (Travel Methods protect riders — canon W15 — so riders are drawn
**inside** a cabin or behind rails, never exposed on top).

Page 20 §6 owns the seven kinds, their capacities and the model list; this table is how each is built.

| Kind (page 20) | Model (reuse / **new**) | Seats | Look | Motion |
|---|---|---:|---|---|
| **Wagon line** (`tm_wagon_`) | `vehicles.js` `wagon` / `coach` / `war_wagon` (reuse), the coach's `lanterns` option removed (always daylight) | 6 | faction colours on the canvas (Wardens green-grey, Crown Assembly blue-gold) | `roll`; the horse team walks the route polyline |
| **Trail** (`tm_trail_`) | riding beasts, one per rider: `deer` as **Moonharts**, `horse` as herd horses, the `dragon_sled` drake sled in snow (reuse) | 5 | a string of beasts nose to tail, each with a small trail saddle-cloth | each beast runs the trail on its own; rider on `sit` at its `saddle` point |
| **Longshank** (`tm_longshank_`) | **new creature body `longshank`**: a quad plan with legs ×3.5, 9 m to the back, a long grazing neck, plus a roofed wicker **howdah** prop for 8 (the same body at 0.45 scale is page 08's Longshank Calf mount) | 8 | pale hide, painted howdah; stations have a tall mounting stair | a slow rolling stilted gait that covers ground fast; wades water up to 3 m |
| **River barge** (`tm_barge_`) | **new** hull in `boat.js` style: flat, a deck house, a pole-man NPC at the stern and a small sail | 12 | Cutwater colours | bobs 4 cm on the water surface; wake decal |
| **Ship** (`tm_ship_`) | **new** hulls in `boat.js` style: a two-masted coaster; a larger one for the Pale Sea | 40 | covered deck, cabin | pitches ±2° and rolls ±3° with the sea state (weather) |
| **Rail cart line** (`tm_rail_`, the Deepway) | **new** carts from the `vehicles.js` `cart` plan (4 open carts × 6 benches, roofed), pulled by a **construct ox** engine-beast (reuse `golem` parts on an ox frame), on a new rail lane with sleepers and tunnel mouths | 24 | iron, dark timber, Deepforge clan banners | carts follow the rail lane; the construct ox walks between the rails |
| **Flyer** (`tm_kite_`) | a **kite basket**: a new roofed wicker basket prop slung under two great grey **gale kites** (reuse bird / `griffin` bodies, `bat` plan) | 5 | grey-and-white birds, rope rigging | flies the route at a fixed height above the polyline; wings loop the `fly` clip; used only where no ground route exists |

Every Travel Method model: ≤ 25,000 triangles including its animals and riders' seats, 3–6 draw calls after
`compactCreature`/merging. Riders sit on `CHIBI2_RIDE_ANIMS` `sit` at the seat points; their weapons are
sheathed. A **station** (page 20) gets a painted signboard, a bench, a bell post (the departure bell,
§8.2), and for scheduled kinds a small platform or jetty; stations are built from `proctown` buildkit
parts. The **snap-back** when a vehicle leaves its route (page 20) plays a 0.4 s fade-out/fade-in at the
nearest route point with a dust puff (land) or a spray (water) so it reads as a reset, not a glitch.

---

## 4. Colour tables (the three that must never mix)

### 4.1 Rarity colours (page 08 §4 owns them — copied here for the art rules)

| Rarity | Colour (page 08) | Loot beam (page 08 `RARITY_BEACON`) |
|---|---|---|
| Common | `#c9c2b6` grey-cream | 1 beam, 1.8 m |
| Uncommon | `#7f95ff` blue | 2 beams, 3.0 m |
| Rare | `#e8d020` yellow | 3 beams, 4.0 m, 5 motes |
| Epic | `#ff8020` orange (Farhold's "legendary" colour) | 4 beams, 5.2 m, 8 motes |
| Unique | `#ff5a3c` red-orange | 5 beams, 6.0 m, 10 motes |
| Set | `#2fc4b2` teal | 4 beams, 5.2 m, 8 motes |
| Legendary | `#c86bff` violet, **animated shimmer on the name** | 6 beams, 7.5 m, 14 motes, a low hum (`loot_legendary`) |

Art rules on top: beams are drawn with the Farhold `waylight.js` column (reuse), **not** in the telegraph
layer and never on the ground as a circle (a coloured ground ring would read as a telegraph); the
Legendary name shimmer is a CSS gradient animation on the text, off under `set.access.reduceFlashes`;
page 08 asks for a new `rarity_legendary.svg` gem for Legendary — an art task in page 18's item-card
milestone. The card frames per rarity are §10.2; the five special rarities add their own looks on top (§11).

### 4.2 Element colours (reuse: `avatar-3d/js/spellfx.js` `ELEMENT_PALETTE`)

| Element | Mid colour | Reads as |
|---|---|---|
| fire | `#ff8a1a` | flame cone, sparks, dark smoke |
| ice | `#aee6ff` | tumbling shards, frost mist |
| lightning | `#fff07a` | instant zigzag, forks |
| poison | `#7ae04a` | bubbles, green haze |
| shadow | `#9458e0` | dark void core, violet rim, tendrils |
| holy | `#ffe69a` | spinning glyph ring, golden motes, feathers |
| arcane | `#b070ff` | rune ring, orbiting glyphs |
| nature | `#86d850` | helix of leaves and thorns |
| physical | `#dfe3ee` | arrows, slashes, sparks, dust |
| bleed | `#d02020` | heavy drops, red mist |
| true | `#f0f0ff` | white shards |

### 4.3 Telegraph colours — page 11 owns them; this page only draws them

**Page 11 §3 is the single source** for each kind's colour, fill, edge, pattern, sound and HUD cue
(danger, void, soak, safe, targeted, beneficial, tether — this page does not restate their colours), and
page 11 §3.2 owns the colour-blind palettes and their setting names (`set.access.telegraph_palette` and the
other `set.access.telegraph_*` keys; page 04 §10.1 lists them). The renderer reads those values from `data/mechanics.json` (page 16 §13) — **no hex value for a
telegraph is written anywhere in the art code**, so the three pages cannot drift apart. (If pages 04
and 11 ever list different values for the same kind, page 11 wins — 00 §10.)

**The collision problem and the rules that solve it.** Player spells use the element colours of §4.2, and
some are close to telegraph colours (fire ≈ danger/soak, holy ≈ targeted, shadow and arcane ≈ void,
nature/poison ≈ beneficial — page 11 §3 has the colours). Rules (page 11 §3.1 rule 4 is the owner of the
first one; the rest are the drawing side):

1. **Player ground effects** use the class colour at **≤ 40% opacity, no hatch, no rim pulse, no pips**
   (page 11 §3.1). Only telegraphs may draw a ground decal with a hard rim.
2. **Telegraphs render above everything on the ground**: after terrain, grass and player ground effects,
   before transparent particles; depth-tested with a polygon offset forward; **not fogged**, **not
   bloomed** (drawn after the bloom pass), **not tone mapped** (their colours are exact).
3. **Other players' spell effects** can be thinned (page 04 `set.graphics.otherPlayersEffects`: All /
   Reduced / Party only / Minimal; page 11's `set.combat.ally_ground_fx` hides allied ground effects —
   the two should become one key, see the report). **Enemy telegraphs are never reduced by any setting.**
4. **Enemy spell effects** (a boss's fire breath) may use element colours freely, but anything that hurts
   you if you stand there **also** has its telegraph drawn under it. The **element** shows as particles on
   the telegraph's edge (page 11 §3.1 rule 1), never as the telegraph's colour.
5. **Monster buffs never use ground colours** (page 11 §3.1 rule 3): a shield on a monster is a shell on
   its body (colours per page 11 §3.1 rule 3), drawn with `spellfx.status(body, 'barrier')`.
6. Loot beams and quest pillars (`waylight.js`) are **vertical**; the duel flag's 40 m boundary (page 15)
   is a ring of small upright pennants, not a painted ring. Nothing but a telegraph draws a coloured ground
   ring — not monster rarities (§3.1), not environment glow (§6.2), not Travel Method stations.

### 4.4 How a telegraph is drawn (new: `js/render/telegraphs.js`)

Page 11 §5 owns the **shapes** (circle, donut, cone, line/beam, cross, moving wave, checkerboard,
room-wide, thin ring, rectangle, arc, chevron path, follow circle), their parameters and **fill
directions**; page 11 §7–§8 own the cast bar and the banner. This is how the client builds them:

| Piece | Implementation |
|---|---|
| Geometry | One mesh builder per shape producing a flat triangle fan/strip in local space (circle 24–64 segments by radius; donut = two rings + a masked inner hole; cone = fan from apex; line/rectangle/cross = strips; wave = a band with cut-out gaps; checkerboard = per-tile quads; arc = masked donut sector; chevron path = arrow quads along a polyline; follow circle = a circle re-anchored each frame) |
| Ground | Each vertex takes its height from the **walkable surface** — the baked region heightmap, or a bridge/stair deck when one is there (Farhold `js/ground.js` rule: draw on what you would stand on) — plus 5 cm. The server's "inside" test uses the same shape parameters (page 11 §5.1: the drawing **is** the hitbox) |
| One shader | All kinds share one material: uniforms for colour, fill fraction, fill direction, pattern id + strength, edge style + width, pips (count, filled), opacity. Compiled at load with the effect warm-up, so a new telegraph never compiles a shader mid-fight (memory note *shader recompile stutter*) |
| Fill timing | From the server's `start`/`resolve` on the synced clock (page 16 §10.1), so everyone's fill completes together |
| Element dressing | The element's sprites (fx atlas, `spellfx.js` textures) as particles along the **edge** only (page 11 §3.1 rule 1) — fire licks on a fire danger zone's rim, frost on a frost one |
| Knockback arrows | Arrow decals (page 11's style) inside a danger zone showing push direction and distance (page 11 §3.1 rule 5) |
| Draw order | Terrain → grass → player ground effects → **telegraphs** → particles → nameplates (§4.3 rule 2) |
| Limit | At most **64** telegraph decals alive per client; if exceeded, the **oldest non-boss** decal is dropped and a warning logged (it means the encounter data is wrong) |
| Screen cues | Room-wide: page 11's ring racing out + a screen-edge vignette in the kind's colour; void: page 11's screen-edge tint while inside; both under `set.access` motion options |

### 4.5 Colour-blind support

Owned by page 11 §3.2 (palettes and their setting names, `set.access.telegraph_*`); page 04 §10.1 lists the
options (custom colours, pattern strength 25–100%, fill 20–80%, edge width, live preview). The art obligation: **every pattern is always
drawn** (hatch, swirl, chevrons, double ring, crosshair, plus signs, beads) so a telegraph reads with no
colour at all, and the preview panel renders the real telegraph shader, not a picture of it. Rarity names
always carry their text label in tooltips ("Rare"), never colour alone.

---

## 5. Spell effects

**(reuse: `avatar-3d/js/spellfx.js` + `spellfx-batched.js`.)** Everything is shaped geometry plus the
49 fx sprites in `assets/data/fx/`; **no glowing spheres**. Methods available: `cast`, `projectile`
(flight clamped 160–450 ms; `shape` override: cone, shards, ribbon, rune, spiral, helix, bolt, arrow, axe,
bubbles, drops), `impact` (with `crit`, `height`, `ground`), `aoe`, `heal`, `revive`, `status` /
`pulseStatus` / `clearStatuses` (23 auras), `breath` (channelled cone), `orbitOrb`, `pillar`, `vortex`,
`storm`, `footfall`.

Rules for Wildmarch:

1. **Every spell names its look in data** (`fx: { element, kind, shape? }` in `spells/<class>.json`,
   canon class template item 3). Thirty classes, 180+ spells, 11 elements — so **shape carries the
   identity** as much as colour: two fire spells of two classes must differ in `kind` and `shape` (a
   pyromancer's fire is a `breath` or a `pillar`; a dragon knight's fire is a `projectile` with
   `shape: 'cone'`). The class test (page 16 §16.1) fails if two classes' spells share element + kind +
   shape + radius.
2. **Batched sprites always** (`BatchedSpellFx`): 43.7 vs 127.8 draw calls in the 8-fighter benchmark.
   Keep `stats().overflow` at 0 (the per-texture batch has 512 slots).
3. **Warm at load**: `fx.warm(renderer, camera)` after `setTextures`, so no effect compiles its shader
   on first use. Finished effects release materials **without** `dispose()` (the 2026-09-29 fix).
4. **Lights**: an effect may borrow one pooled point light; lights stay `visible` and idle at intensity
   0 (toggling visibility recompiles every lit material — memory note *shader recompile stutter*).
5. **Scale**: `scale: 1.4` (the stage value) for the third-person camera distance; revisit after the
   camera is set (page 02 camera distances).
6. **Status auras** follow the status list of page 05; a status with no aura in `STATUS_FX` gets the plain
   circling mote until one is drawn (listed as art work in page 18).
7. **Crits** use `crit: true` on the impact (bigger flash). **Damage numbers** float from the impact point:
   white normal, yellow crit, red for damage taken, green heals, grey absorbed/blocked; stacked every 0.1 s
   so a DoT does not paint a column; `set.combat.damageNumbers` (→ page 04).
8. **Combat feel** (reuse: `prototypes/farhold/js/combat-feel.js`): hit-stop 35–150 ms by hit weight,
   screen shake of a few millimetres, knockback with rank resistance, stagger with diminishing returns
   and visual recoil — all switchable (`hitStop`, `screenShake` settings, Farhold defaults on).
9. **Weapon swing arcs** (Farhold `combat-fx.js`): the white ring on the ground that shows the hit box is
   **off by default** (`showHitboxes`) — in Wildmarch it would read as a telegraph. Swings show a short
   motion trail on the blade instead.

---

## 6. Environment

### 6.1 The look, from `highdef-3d` (reuse — `highdef-3d/README.md`)

| Technique | Rule to keep |
|---|---|
| **One heightmap, read by everything** | Terrain mesh, grass, scatter, water depth, feet, the server's movement check and telegraph decals all read the region's baked `height.u16` (page 16 §11). A test asserts agreement to 5 cm. |
| **Grass belongs to the ground** | GPU grass where an instance is a **slot** drawing a square of a world-fixed lattice; blade position/heading/height/colour hashed from the square's coordinates; centre snapped to whole squares. (Otherwise the field crawls as you walk — invisible in a still screenshot, tested by walking.) |
| **A sky you can reflect** | Physical sky rendered into a PMREM probe. The sun never moves in Wildmarch (§6.2), so the probe is rendered **once per region and weather state** at load or crossfade, not every few seconds — a cheaper frame than highdef-3d's |
| **Cascaded shadow maps** | 2–4 cascades by tier; only the two nearest detail levels cast |
| **Height fog with sun inscatter** | Closed-form exponential-with-height fog; warm toward the sun |
| **Bloom before tone mapping, grade after** | Threshold **above 1.0** on the raw HDR frame; strength 0.02; ACES; split-tone grade |
| **Light shafts without an occlusion pass** | Smear the drawn frame toward the sun (High+) |
| **Triplanar rock** on steep ground only | |
| **Baked AO in vertex colours; leaves as bowed cards** | |
| **`enhance()` for every material** | The cascaded-shadow addon replaces `onBeforeCompile`; wind and fog must chain through `enhance()` or they silently vanish |
| **Geometry contract** | `position, normal, uv, color, aWind` in that order, or `mergeGeometries` refuses |
| **Perf traps** | Measure LOD distance to a cell's **nearest edge**, not its middle (190 m of full-detail trees, 6,776 draws); group vegetation in **128 m cells** with a **baked far ring** (22 triangles a tree) |

From Farhold's graphics round (reuse: `graphics.js`, `postfx.js`, `sky-palette.js`, `wind.js`, `rain.js`,
`atmosphere.js`, `grass-gpu.js`):

- **NaN guard** in every pass that reads the frame (`SAFE_GLSL` `fhSafe`) — one NaN pixel through bloom
  became a screen-sized black square (R26).
- **Sky colour as a table** (`sky-palette.js`): Farhold's nine-band sunset table becomes **one fixed band
  per region** (plus the dark-look profiles of §6.2); the grade and the sky still come from the same row so
  they always agree.
- **One wind** object for trees, grass, rain and banners.
- **Wet ground** builds over 30 s of rain and dries over 90 s.
- **Zero-length normals** anywhere (a closed ring, a point) light to NaN — Chibi 2's `SkinBuilder.add`
  already fixes its own; region geometry must too.

### 6.2 Lighting: always daylight (new; canon §4, §12.3)

**There is no day/night cycle.** Every region has **one fixed sun** (`sun: { elevation, azimuth, colour,
intensity }` in its region data) and stays in that light for good; weather and the region's palette are what
change. There is no moon, no star layer, no night ambient, no carried light, no light slot and no `L` key.
Farhold's `light.js` night floor, `nightlights.js` and the torch/lantern/wisp-lamp looks are **not reused**.

| Region | Sun elevation | Sun colour | Sun intensity | Sky / hemisphere ambient | Why |
|---|---:|---|---:|---|---|
| `hearthvale` | 55° | `#fff1d6` | 3.2 | `#bcd6ff` / `#6a7a4a`, 0.7 | a warm mid-morning |
| `mossfen` | 30° | `#f2e6c0` | 2.2 | `#a8b8a0` / `#4a5030`, 0.8 | low hazy sun |
| `greyridge` | 45° | `#ffffff` | 3.0 | `#b8ccef` / `#5a5a58`, 0.6 | crisp, long shadows |
| `highcourt` | 60° | `#fff6e8` | 3.4 | `#c4dcff` / `#8a8478`, 0.7 | bright noon city |
| `sunscar` | 75° | `#fffbef` | 4.0 | `#d8e4ff` / `#c8a870`, 0.8 | hard overhead sun |
| `whisperwood` | 40° | `#f4f0ff` | 2.6 | `#b0b8e8` / `#3a5048`, 0.8 | cool, dappled under the canopy |
| `cinder_steppe` | 35° | `#ffd8a8` | 2.6 | `#c8a890` / `#5a4a3a`, 0.7 | smoky orange haze |
| `frostmantle` | 18° | `#e8f2ff` | 2.4 | `#c8dcff` / `#d8e4f0`, 0.9 | low pale sun, long blue shadows; snow bounce keeps ambient high |
| `drowned_coast` | 35° | `#e8eef4` | 2.0 | `#a8b4c0` / `#4a5a58`, 0.9 | overcast silver |
| `riftmarch` | 50° | `#f0e8ff` | 2.8 | `#b8a8e8` / `#4a4060`, 0.8 | violet-tinted |
| `kingsfire` | 30° | `#ffc890` | 2.4 | `#a8786a` / `#4a1e10`, 0.8 + lava underlight (below) | red-brown sky under ash |
| `spire_isle` | dark look `dusk_look` (below) | | | | the one outdoor region that always looks like dusk |

**The daytime sky ribbon.** One shader layer (a few long, slow, translucent ribbons high in the sky, drawn
before clouds) gives two regions their signature in daylight: **Frostmantle** pale green-white ribbons
(`#d8ffe8` at 25%), and the **tear-light** over the Riftmarch and Spire Isle (violet `#c8a8ff` at 35%, brighter
toward the Tear). It is readable against a blue sky because it is paler than the sky, not brighter. Off on
Low; never over a boss fight (it would pull the eye).

#### Film-set dark places

Some places must **look** dark — graveyards, crypts, barrows, deep swamps, the Drowned Coast's sunken
streets, Spire Isle — while staying fully readable ("day for night", as film crews shoot it: bright enough to
see everything, graded to feel dark). A sub-zone or dungeon room names a **dark-look profile** in its data
(`look: "dusk_look" | "crypt" | "cave"`); the renderer crossfades to it over 1.5 s on entry.

| Profile | Used for | Sun | Hemisphere ambient (sky / ground, intensity) | Rim light | Exposure | Saturation | Shadow lift | Fog |
|---|---|---|---|---|---|---|---|---|
| `day` (default) | everything else | region sun | region row | 0 | 0 EV | 1.00 | none | region |
| `dusk_look` | graveyards, swamps, Spire Isle, dark outdoor sub-zones | 12° elevation, `#ffb07a`, 1.2 | `#6a78a8` / `#2a2838`, **1.0** | **1.0**, `#9fb4ff` | −0.6 EV | 0.80 | `#1e2440` +0.04 | blue-grey, density ×1.5 |
| `crypt` | barrows, tombs, crypts, sealed interiors | none | `#5a6690` / `#2a2430`, **1.1** | **1.2**, `#a8b8ff` | −0.4 EV | 0.70 | `#1a1e30` +0.05 | none |
| `cave` | caves, mines, lava tunnels | none | tinted 30% toward the cave's main glow colour (table below), **0.8** | **1.0**, `#b8c8ff` | −0.3 EV | 0.90 | `#181c28` +0.03 | thin, glow-tinted |

- **Rim light** is a fresnel edge term added through `enhance()` (the one place a material gets shared
  terms, highdef-3d rule) on **characters, creatures, mounts and loot models only** — not on terrain — with a
  per-profile strength uniform. It outlines every body against a dark background at the cost of one
  multiply-add in the shader; no extra light, no shadow map.
- **The hemisphere ambient never drops below 0.8** in any profile, and there is always either a sun or
  local glow sources, so no surface renders pure black.
- **Readability floors** (tested, page 18): at three reference spots per dark sub-zone, a Chibi 2 body at
  10 m has a mean relative luminance **≥ 0.12** after grade; an enemy's silhouette against its background has
  a contrast ratio **≥ 3:1** (rim included); the frame's 5th-percentile luminance is **≥ 0.03**.
- **Telegraphs, nameplates, cast bars and damage numbers are drawn after the grade** and are not tone
  mapped (§4.3 rule 2), so a dark place never dims a warning.
- `set.access.brightDarkPlaces` (new → page 04, default Off): raises every dark profile's exposure by
  +0.4 EV and its shadow lift by +0.03 for players who need it.

#### Glow sources in caves and dark places

Caves and dark interiors are lit **by the world**: glowing fungi, lava, luminous plants, crystals and
daylight through openings. A glow source is a prop with an emissive material (bloom picks it up, §6.1) plus,
for the big ones, one **pooled point light** that idles at intensity 0 and is never toggled visible
(memory note *shader recompile stutter*). Placement rule: at least one lit source every **12 m** of walkable
cave floor (a data test on dungeon layouts). Glow never forms a ring or disc on the ground (§4.3 rule 6);
fungus beds and moss patches are irregular blobs.

| Source | Where (region / dungeon) | Colour | Emissive | Point light (intensity, range) |
|---|---|---|---|---|
| **Foxfire shelf fungus** (on dead wood) | Hearthvale barrows (`d01_hollow_barrow`), Mossfen, Whisperwood | `#8ef0c0` pale green | 1.5 | 0.6, 6 m, every ~12 m |
| **Glowcap mushrooms** (clusters of 3–9) | Mossfen (`d02_drowned_mill` cellars), Greyridge mines, Whisperwood | `#6fd8ff` cyan-blue | 2.0 | 0.8, 7 m on large clusters |
| **Lantern-lilies** (floating plants) | Mossfen pools, Whisperwood moonwells | `#ffe38a` warm yellow | 1.8 | 0.5, 5 m |
| **Luminous moss** (floor and wall carpet) | every cave, as fill | `#b6f06a` yellow-green | 0.6 | none (emissive only) |
| **Crystal veins** | Greyridge (`d03_shaft_seven`), Riftmarch (`d12_unmade_workshop`) | `#9aa8ff` blue-violet (Greyridge), `#c080ff` violet (Riftmarch) | 2.2 | 1.0, 8 m |
| **Sun-pipes** (daylight through glass or cracks) | Sunscar (`d05_glass_tombs`, `d06_sandsworn_vault`) | `#fff2c8` | light shaft sprite | a spot light 2.0, 14 m, fixed |
| **Grave-lichen** (on headstones and crypt walls) | every graveyard, `d01`, `d11_saltdeep_cathedral` | `#a8f0d0` pale mint | 1.0 | none |
| **Moonwell stone** | Whisperwood (`d08_moonwell_ruins`) | `#c8b8ff` lavender | 1.6 | 0.8, 8 m |
| **Coal-seams and ash beds** | Cinder Steppe (`d09_warmasters_pit`) | `#ff5a28` deep orange | 1.8 | 0.9, 7 m |
| **Glacier glow** (daylight through blue ice) | Frostmantle (`d10_rimefang_caverns`) | `#bfe6ff` ice blue | 1.2 (the ice wall) | 1.2, 10 m behind thin ice |
| **Sea-glow anemones and kelp** | Drowned Coast (`d11_saltdeep_cathedral`, sunken streets) | `#5fe8e0` teal | 1.6 | 0.6, 6 m |
| **Lava pools and rivers** | Kingsfire (`d13_cindergate`, `d14_ashen_reliquary`, `d15_fire_court`) | `#ff7a1e` orange | 3.0 | 2.5, 14 m; plus a red **underlight** (a second hemisphere ground colour `#8a2a10`) in lava regions |
| **Tear-shards** | Spire Isle (`d16_the_spire`) | `#d8c8ff` pale violet | 2.4 | 1.0, 9 m |
| Braziers, hearths, forge fires (fixed décor only — never carried, never gear) | towns, forts, forges | `#ffb060` | 2.0 | pooled, 8 m |

Glow colours are kept **below 70% saturation** where they sit near a telegraph colour (page 11), and none
uses `#7fe8ff` (reserved for the Oracle, canon §10).

### 6.3 Weather

**(reuse: `worldgen/js/weather.js`.)** 14 states: clear, fair, cloudy, overcast, drizzle, rain, storm
(thunderstorm), snow, blizzard, fog, sandstorm, ashfall, cinderstorm (worldgen's `emberstorm` state,
renamed in Wildmarch data and shown to players as "Cinder Storm"), ionstorm. The server picks the
state per region from the region's allowed list (below) with a `WeatherClock` seeded by realm + region +
day, holding a state for minutes and crossfading. Weather never hides a telegraph: fog density is
capped at a 90 m view in blizzard/sandstorm, and telegraphs are not fogged.

### 6.4 Region art direction

| Region | Palette | Ground surfaces | Vegetation / props | Sky & light | Weather allowed | Ambience bed |
|---|---|---|---|---|---|---|
| `hearthvale` 1–6 | warm greens, wheat gold, red roofs | grass, tilled soil, dirt road, river stones | orchards (fruit trees), hedgerows, fences, haystacks, windmills, oaks | warm mid-morning sun (§6.2) | clear, fair, cloudy, drizzle, rain | `ambience.forest` (birds) → farm variant (new) |
| `mossfen` 5–12 | olive, peat brown, murky teal water | mud, moss, peat, reeds, boardwalk | stilt houses, dead trees, cattails, lily pads, mushrooms | hazy, low sun, green-tinted fog | fog, drizzle, rain, overcast, storm | `ambience.marsh` |
| `greyridge` 10–18 | slate grey, pine green, rust | rock (triplanar), gravel, snow on peaks, quarry dust | pines, cliffs, mine carts, scaffolds, rail tracks | crisp, long shadows | clear, cloudy, overcast, snow (high), rain | `ambience.mountain` |
| `highcourt` (capital) | white stone, blue banners, gold trim | cobbles, marble, gardens | walls, towers, market stalls, fountains, statues | bright noon; street braziers as décor | clear, fair, cloudy, drizzle | `ambience.town` (big city variant, new) |
| `sunscar` 16–24 | sand, ochre, turquoise glass | sand, cracked clay, glass shards | mesas, cacti, dunes, palms at the oasis, glass tombs | hard white sun, heat shimmer (post pass, High+) | clear, fair, sandstorm | `ambience.wind` (desert variant) |
| `whisperwood` 22–30 | deep teal, silver, moonlight violet | forest floor, roots, moss, glowing moonwell stone | giant old trees, silver birches, ferns, glowing flowers | dappled light, shafts (High), glowing flowers and moonwell stone in the shade | fair, cloudy, fog, drizzle, rain | `ambience.forest.deep` (new) |
| `cinder_steppe` 28–36 | ash grey, dry gold grass, war-camp red | ash, dry grass, scorched earth | burnt trees, orc palisades, bone war-poles, war banners | smoky orange haze | clear, cloudy, ashfall, storm | `ambience.wind` + distant drums (new) |
| `frostmantle` 34–42 | white, ice blue, dark rock | snow, ice, rock | frozen pines, ice spires, glaciers, frozen waterfalls | low pale sun, long blue shadows, the daytime sky ribbon (§6.2) | clear, cloudy, snow, blizzard, fog | `ambience.wind` (cold variant) |
| `drowned_coast` 40–48 | sea grey, green bronze, bone white | wet sand, tidal rock, sunken paving | sunken city ruins, kelp, wrecks, barnacled statues, cliffs | overcast, silver light, sea spray | overcast, drizzle, rain, storm, fog | new `ambience.coast` (waves, gulls) |
| `riftmarch` 46–54 | violet, arcane cyan, broken stone | cracked rock, crystal, rift glass | floating stones, crystal clusters, broken arches | shifting sky tint, ion glow | cloudy, ionstorm, fog, clear | `ambience.void` |
| `kingsfire` 52–60 | black basalt, lava orange, cinder red | basalt, lava crust, ash | lava rivers, obsidian spires, the Kingsfire Legion's forts | red underlight from lava, drifting cinder sparks | ashfall, cinderstorm, clear | `ambience.fire` |
| `spire_isle` 60 | pearl, deep blue, Mend violet | pale stone, mist, glass | the Spire, hanging curtains of the Mend's woven light, drifting motes, tear-shards | `dusk_look` profile always (§6.2) + the tear-light ribbon | fog, clear, ionstorm | new `ambience.spire` |

Dungeons (page 12) and world-boss grounds ([page 13](13-WORLD-BOSSES.md)) set their own palette, fog colour,
dark-look profile (§6.2) and bed in their data; dungeons are **interiors** with a ceiling where the architecture has one, and the camera fades any ceiling or wall
piece between it and the character (a ceiling-fade pass, **new** — Farhold dungeons had no ceiling
because a third-person camera "spends its life clipped into the roof").

### 6.5 Towns and buildings

Towns are hand-laid (page 01). Building **models** may come from `proctown/js/buildkit.js` +
`drawkit.js` (walls, roofs, doors, windows, chimneys, stalls — reuse for the models only), styled per
region by colour and roof material. Every building is one or two merged meshes. Interiors that are
entered use the same kit.

---

## 7. Graphics presets — the art-side knobs

**Page 04 §7.2–7.3 owns the graphics presets** (Low / Medium / High / Ultra / Custom, chosen on first
launch by a machine check, else High) and every option in them — render scale, anti-aliasing, HDR, bloom,
light shafts, sun flare, grade, grain, vignette, shadows, ambient occlusion, depth of field, view and tree
distance, scatter and grass, textures, fog, wet ground, weather particles, water, the sky ribbon (§6.2; the
old star option goes — there is no night sky), spell effects,
other players' effects, character detail, players drawn, dynamic lights. `?quality=low` boots Low for the
Playwright specs. All values live in `data/graphics.json` (page 16 §13) with one reader.

What this page adds — the knobs that decide how the **art** scales, per page 04 preset (page 04 to add
them to its table or fold them into `characterDetail` / `spellEffects`):

| Knob | Low | Medium | High | Ultra | Why |
|---|---|---|---|---|---|
| Full-detail Chibi 2 bodies (nearest first) | 8 | 15 | 30 | 40 | 2 meshes / ≤ 8,500 tris each |
| LOD 1 bodies (the rest of `playersDrawn`) | 12 | 25 | 30 | 60 | ≤ 2,500 tris, 1 mesh (§2.9) |
| LOD 1 distance | 20 m | 30 m | 45 m | 60 m | |
| Stand-in distance (beyond: stand-in + nameplate) | 45 m | 70 m | 100 m | 140 m | |
| Creature LOD (fewer segments, no eyes/ears) | 25 m | 40 m | 60 m | 80 m | beasts are already folded by `mesh-merge.js` |
| Spell particles / live effects (`maxParticles` / `maxLive`) | 120 / 16 | 200 / 24 | 320 / 36 | 480 / 48 | `spellfx-batched`; overflow must stay 0 |
| Status auras on others | own party only | party + target | everyone in 30 m | everyone in 40 m | auras are 3–8 sprites each |
| Rarity glow on gear (§2.6) | off | on | on | on | |
| Emissive rank rim/pulse on champions and rares (§3.1) | rim only | on | on | on | the name colour and badge carry it on Low |
| Greater-rarity auras (§3.1) | **on** | **on** | **on** | **on** | gameplay information — never reduced |
| Item card portrait (§10.1) | static snapshot | turntable 30 fps | turntable 60 fps | turntable 60 fps | |
| Special-rarity card effects (§11) | static art | animated | animated | animated | all respect `reduceFlashes` |
| Dark-look rim light (§6.2) | **on** | **on** | **on** | **on** | readability — never reduced |
| Telegraph pattern animation | static | animated | animated | animated | patterns are always **drawn**; Low only stops them moving |
| Weapon motion trails | off | on | on | on | §5 rule 9 |

**Never scaled by any preset**: telegraphs, cast bars, boss banners, boss voice lines, the danger sounds,
greater-rarity auras and the dark-look rim light.

---

## 8. Audio

### 8.1 Buses and loudness (reuse: `sfx/js/sfx.js`, `sfx/js/loudness.js`)

The Sound Lab gives: logical ids (148 now), four makers (`synth`, `library` = Kenney CC0, `hybrid` =
default, `retro`), **every clip measured (K-weighted) and levelled to its category target** with a soft
ceiling at −1 dBFS, three buses (`sfx`, `ui`, `ambience` — ambience capped at 0.6) into a master limiter.

**Wildmarch changes to `sfx.js` (additive).** Page 04 §8 already promises the player a slider for each
of these, so the mixer needs a bus behind each slider:

| Bus / change | Page 04 slider | Why |
|---|---|---|
| `sfx` (exists) | `set.audio.sfx` | your combat, spells, footsteps, world |
| `otherPlayers` (new, a child of `sfx`) | `set.audio.otherPlayers` (default 70%) | other players' spells and weapons, so a world boss is not a wall of noise |
| `telegraph` (new) | `set.audio.telegraphSounds` (min 25%) | page 11 §6 warning sounds; **never ducked, never culled** |
| `ui` (exists) | `set.audio.ui` | clicks, cards, unlock stings, social pings |
| `ambience` (exists, capped 0.6) | `set.audio.ambience` (0–60%) | beds |
| `voice` (new) | `set.audio.voices` | NPCs, followers, player barks (formant voices play through `voice-lab/js/voice.js` today with their own volume) |
| `bossVoice` (new) | `set.audio.bossVoices` (min 25%) | boss lines — often the warning |
| `narrator` (new) | `set.audio.narrator` | the Narrator |
| `music` (new) | `set.audio.music` | only if music is approved (§8.7) |
| **3D positioning** | `set.audio.spatial` (Stereo / Off) | page 04 keeps left/right panning; this page adds **distance** (a `GainNode` by distance, inverse model, ref 5 m, silent past 60 m) inside the same stereo pan, not full HRTF 3D |
| **Copy limit** per id | — | at most 6 copies of the same id at once (twenty players casting one spell must not be twenty times louder); oldest stops |
| **Priority** | — | telegraph sounds and boss lines are never culled; others' spells are culled first |
| **Ducking** | — | a boss line lowers `music`, `sfx` and `otherPlayers` by 6 dB while it plays; **never** `telegraph` (page 11 §6 rule 3) |

New loudness categories: **`telegraph` −17 LUFS** (page 11 §6 proposes the `ui` target of −26; this page
recommends −17, level with melee, because a warning at −26 is masked by a fight — page 11 to confirm),
`boss` −16 (bossVoice bus), `voice` −19, `social` −24 (ui bus), `music` −30.

### 8.2 Sound catalogue — reuse and new ids

Reused as is: `spell.<element>.launch|travel|impact` (11 elements), `status.<type>.apply|tick` (23),
`cast.start`, `heal`, `revive`, `melee.swing|hit|crit|miss|block`, `death.humanoid|beast|construct`,
`levelup`, `quest.complete`, `loot.*`, `coin`, `equip`, `ui.click|hover|tab|open|close|error`,
`travel.step`, `travel.step.soft`, `camp.fire`, `ambience.forest|cave|town|marsh|mountain|void|fire|wind`,
`ambience.rain.light|heavy`, water/fire/ice/stone/door/lever/bell ids.

New ids (added in `sfx/tools/build-catalog.py`, then regenerated — never hand-edit `catalog.json`):

| Group | Ids |
|---|---|
| Telegraphs and boss cues (**page 11 §6 names them and gives the recipe idea**; this page builds the recipes) | `tg_danger`, `tg_danger_lethal`, `tg_void_place`, `tg_void_in`, `tg_soak`, `tg_soak_pip`, `tg_safe`, `tg_target_you`, `tg_target_other`, `tg_benefit`, `tg_tether`, `tg_tether_snap`, `tg_cast_interruptible`, `tg_interrupt_ok`, `tg_interrupt_fail`, `tg_adds`, `tg_enrage`, `tg_phase`, `tg_dialog`, `tg_fixate`, **`tg_rarity_shift`** (page 11 §22.5: a 1.0–1.5 s rising chime before a greater-rarity monster changes state, §3.1) |
| Boss (extra) | `boss.pull` (room lock horn), `boss.defeat` (victory sting) |
| Movement | `dodge.roll`, `dodge.perfect` (dodged inside the last 0.2 s), `mount.summon`, `mount.gallop` loop, `swim.stroke`, `travel.step.snow`, `travel.step.sand`, `travel.step.wood`, `travel.step.water` |
| Class mechanics | the shaman's drum strokes `sfx_shaman_drum_ox`, `_crane`, `_hare` (`classes/shaman.md`); one `mech.<class>.<event>` per mechanic event page 06 lists (wound opened, heat vent, form shift, song verse, charm break, beast tamed, demon bound…) — about 60 |
| Social | `ui.whisper`, `ui.invite`, `ui.readycheck`, `ui.partywarning` (the party leader's centre-screen warning, page 15; was the raid warning), `ui.groupfound`, `ui.mail`, `ui.sold`, `ui.trade.lock`, `ui.trade.done`, `ui.duel.countdown` |
| Unlocks and loot | `unlock.feature` (canon rule 5: every unlock has a sound), `unlock.spell`, `unlock.talent`, `calling.complete`, `loot_legendary` (page 08: the Legendary beam's low hum, a loop while the beam stands) |
| World | `waystone.use`, `portal.open`, `recall.use` (Recall Stone), `chest.open`, `door.dungeon`, `event.start`, `worldboss.horn` |
| Travel Methods (§3.3, page 20) | `tm.bell` (departure bell: rings at 30 s and 5 s before a bus-style or scheduled departure), `tm.arrive` (a horn for boats, a clank-and-hiss for the rail-hauler), `tm.board`, `tm.snapback` (a soft whoosh), and a travel loop per kind: `tm.wagon.loop`, `tm.trail.loop`, `tm.longshank.loop`, `tm.barge.loop`, `tm.ship.loop`, `tm.rail.loop`, `tm.kite.loop` |
| Mounts (§3.2) | `mount.<species>.step`, `mount.<species>.call`, `mount.<species>.swim` (frog, turtle, crocodile, serpent); the clockwork strider's `mount.clockwork.tick` loop |
| Monster rarities (§3.1) | `mon.champion.spot`, `mon.rare.spot` (a short sting the first time a pack enters 40 m), `grr.<id>.loop` per greater rarity (28, §3.1; `grr.giant.step` / `grr.colossal.step` for the size pair), `grr.spot` (a heavier sting for any greater rarity) |
| Items (§10, §11) | `card.open` (a soft paper flip), `loot.special.<sr_id>` (five: a crackle, a shimmer chord, a doubled chime, a stone knock with a bell tone, a leafy rustle) played on top of the rarity's loot sound; `socket.gem`, `socket.jewel`, `socket.soul`, `socket.gadget` (page 08) |
| Harvesting (page 19) | `harvest.mine`, `harvest.chop`, `harvest.skin`, `harvest.herb`, `harvest.fish.cast`, `harvest.fish.bite`, `harvest.done` |
| Ambience | `ambience.farm`, `ambience.city`, `ambience.coast`, `ambience.spire`, `ambience.forest.deep`, `ambience.desert`, `ambience.cold`, `ambience.warcamp`, `ambience.graveyard`, `ambience.cave.glow` (drips + a faint fungal hum), `ambience.lava` |

A node test (existing pattern) fails if an element or status is added to `spellfx.js` without a sound;
a new test fails if a telegraph kind or boss cue in `mechanics.json` has no `tg_*` id in the catalogue.

### 8.3 Ambience

`data/sound-map.json` names the bed for each region, town, dungeon and world-boss ground (the table in §6.4). The
Farhold rules stay (`sound.js`): the bed **crossfades** when you move between places; **inside** =
`ambience.cave` unless the place says otherwise; storms swap to `ambience.wind`; the ambience bus is
capped and sits **−40 LUFS**, far under everything, because a bed plays for an hour. There is no night
layer (always daylight); instead a **dark-look profile** (§6.2) adds its own layer at −44 LUFS (crows and
creaking gates in `dusk_look` graveyards, drips and a low hum in `cave`, dust and distant stone in
`crypt`), and a glow source with a point light carries a quiet local hum (fungi) or bubble (lava), 6 m range. Footsteps pick soft/hard/snow/sand/wood/
water from the ground's `surface.u8` value (page 16 §11) and play well under their catalogue level (R25:
"footsteps are too loud").

### 8.4 Voices (reuse: formant engine + `shared/voices.js`)

**The engine is ours** (`voice-lab/js/formant-voice.js`, versioned): CMUdict + letter-to-sound rules →
Klatt-style resonators, 10–80 ms per line, cached by text + voice, commercial-safe. espeak (GPL) is **not
shipped**; Piper is **not used** (seconds per line).

| Who | Voice |
|---|---|
| **Player character** | `voiceFor({ role: classId, gender, seed: characterSeed })` — `ROLE_VOICES` already holds **all 30 classes** — then the player's own slider edits in the creator (pitch, depth, tone, speed) and the race delta below |
| **Race delta** (new, additive to `voices.js`) | Elf: tone +0.08, breath +0.05 · Dwarf: depth +0.10, pitch −0.05, rough +0.08 · Halfling: pitch +0.12, depth −0.10, speed +0.05 · Human: none. Enemy races: Orc = `brute`, Goblin = `goblin`, Giant = `brute` + depth 1.0 + `fx.reverb`, Undead = `undead`, Beastkin = `brute` + rough +0.15 |
| **Town NPCs** | Role voice (merchant, elder, villager, guard, child… from `ROLE_VOICES`) + gender + seed from the NPC id; a named story NPC may carry a hand-tuned voice in `voices.json` |
| **Followers** | Heroes: hand-tuned in `voices.json`; mercenaries: `voiceFor({ role: <their class-like role>, gender, seed })` |
| **Enemies that talk** | `roleForEnemy(templateId)` (goblin, dragon, demon, undead, cultist, brute) |
| **Bosses** | Each boss has a **hand-tuned voice JSON with effects** in `voices.json`: e.g. a drowned choir boss = `undead` + `fx: { reverb: 0.6, reverbSize: 0.8, pitchShift: -3, chorus: 0.4 }`; a giant = `brute` + `fx: { formant: -4, echo: 0.3 }` (voice-lab effects chain: pitchShift, formant, robot, vibrato, tremolo, chorus, echo, reverb, lofi…) |
| **Narrator** | `ROLE_VOICES.narrator` (low, slow, near-zero jitter) for quest intros, story text and page 11's "You!" on `tg_target_you` (`set.audio.narrator` volume, page 04) |

**Barks** (canon class template item 8): each class has lines on cast (big spells only), crit, low health
(< 25%), ally down, kill, level up — from Lingo intents `combat_bark`, `combat_hurt`, `ally_down`,
`combat_kill`, `brag`, all on `meta.noRepeat` (session anti-repeat so nothing repeats inside ~20 fights).
Page 04 §9 owns the switches: `set.voice.ownBarks` (Off / Important only / All), `set.voice.partyBarks` (Off / Rare / Normal / Chatty — Rare = 1 bark in 6 chances, Normal 1 in 3, Chatty every chance with a 4 s gap), `set.voice.otherPlayersBarks`.
**Barks never play during a boss's warning line.**

### 8.5 Lingo speech (reuse: `lingo/`, `conversations/`, Farhold `speech.js`)

- NPC lines come from Lingo intents (`greet`, `farewell`, `smalltalk`, `observe`, `fear`, `warning`,
  `gossip`, `lore`, quest intents) filtered by the NPC's `speech` personality (traits, sliders, tics,
  custom slots). The **server** picks the line (page 16 §6) so nearby players read the same words; the
  client speaks it.
- A **Wildmarch vocabulary pack** `lingo/data/packs/wildmarch.json` holds every place, faction, NPC,
  creature family, item family and deity with forms and **respelled pronunciations** (`pron.respell`:
  "BRITE-wah-ter", capitals = stress), so the formant voice says invented names right.
- **Follower camp talk** uses `conversations/` topics with Wildmarch facts (bosses killed, items won,
  who fell, who revived whom) — the `revive_thanks` pattern.
- **Language debug** (`shared/langdebug.js`) is on behind `set.voice.langDebug` (page 04, dev builds only):
  click any spoken word to see and fix its pronunciation; fixes can be sent to the dev server inbox.
- **Player chat** is voiced only if the player turns on page 04's `set.voice.speakChat` (Off by default):
  the line is spoken in the **sender's** character voice JSON, which the server sends once per sender.

### 8.6 Boss voice lines

Page 11 §9–§10 own boss dialog (line keys, warning lines, dialog opportunities and who chooses); this
page owns how it **sounds** and gets onto the screen.

1. **A warning line is fixed text** (page 11 §9.2): the same words always mean the same mechanic, ≤ 8
   words, starting 0–1.0 s **before** the telegraph. Non-warning keys may use Lingo pools (`boss_opener`,
   `boss_phase`).
2. **Three channels at once**: the voice (`bossVoice` bus; ducks music, sfx and other players by 6 dB,
   never telegraph sounds), a **speech bubble** over the boss, and page 11 §8's centre **banner**
   (`boss_say` kind, or `mechanic` kind with the quote under the instruction when the line is a warning).
3. **Pre-rendered at pull.** When a boss encounter starts, the client synthesizes **every** line key in
   that boss's file (10–80 ms each) so the first warning never waits on synthesis. Lines are ≤ 20 words,
   so the whole set is a few hundred milliseconds of work, spread over the pull's first frames.
4. **Length check**: a spoken line's duration is measured when it is synthesized; a node test synthesizes
   every warning line with its boss's voice and fails if the line runs longer than the time between its
   start and the telegraph's resolve (a 2.4 s line cannot announce a 1.5 s mechanic). Page 11 §9.2 rule 5
   (two warnings never overlap; the second waits, the visual goes on time) is the mixer's rule too.
5. **Dialog opportunities** (page 11 §10): the boss's line plays, `tg_dialog` chimes, and the reply panel
   opens under page 11's voting rules; while it is open the boss's voice idles on a short looped breath
   (a boss-specific `fx` hum) so the pause does not feel like a freeze.
6. Subtitles always show; `set.audio.bossVoices` can lower the voice to **25%** but never mute it
   (page 04), and a muted player loses nothing because the banner and the telegraph carry the warning.

### 8.7 Music — question for the owner

| Option | What | Cost | Notes |
|---|---|---|---|
| **A. None** | Ambience beds + stingers only | 0 | What Farhold does; strong ambience carries a lot |
| **B. Generated** | A Web Audio music module like the Sound Lab's synth: per-region modes and instruments, layered by state (explore / combat / boss / town), seeded so a region always sounds like itself | Medium (new experiment) | Fits the "everything generated" rule; quality is the risk |
| **C. CC0 / licensed tracks** | Find or commission tracks, one per region + combat + boss | Money, licences to check | Best quality; files to host (≈ 3–5 MB a track) |
| **D. Stingers only** | Short generated phrases on unlocks, boss phases, victory | Small | Can pair with A |

Recommendation: **A + D for the slice**, decide B vs C before region 3. Logged in `QUESTIONS.md`.

---

## 9. Interface art direction

**(reuse: Emberveil 2 themed UI — `prototypes/emberveil/js/ui.js`, `style.css`; `assets/data/ui/`;
`shared/tooltip.js`; `shared/rewards.js`.)** Page 03 owns layout; this is the look.

| Element | Rule |
|---|---|
| Panels | Dark leather-textured panels, **gold corner flourishes** on framed boxes, divider rules under headings (Emberveil `.framed`) |
| Type | Display serif **Cinzel** for headings, body serif **Spectral** (Google Fonts, OFL) — the playground's dark-fantasy pairing; numbers in tabular figures |
| Accent | Forge orange (`#e0802a`) for the player's own highlights; **never** a telegraph colour at full strength in the HUD except in warnings |
| Icons | **SVG**, generated: a spell icon = the element colour + the spell's **shape glyph** (`prototypes/farhold/js/spellshapes.js`, one table for glyph and caption) + a class crest corner. Item icons from base type silhouettes tinted by rarity. The owner's Font Awesome Pro is available for UI glyphs (settings cog, mail, group), but the playground rule for games is to prefer SVG assets — use FA only as SVG exports |
| Tooltips | `shared/tooltip.js`: 150 ms delay, flips at the screen edge, keyboard-focus friendly; item cards via one renderer (Farhold `hud.itemCard`) everywhere — bags, chat links, the Trading Post, loot popups. The card's look is §10 |
| Numbers | Always through `shared/format.js` (at most two decimals; health whole) — nothing may render "25.02000000000001" |
| Wording | Farhold `WORDING.md`: numbers, not feelings; a refusal says what to do next |
| HUD scale | `set.interface.uiScale` 50–200% and `set.access.textSize` (page 04); every HUD element anchors to a screen corner and scales from it |
| Frames | Party frames (5; raid frames are in `WISHLIST.md`), **one target frame** showing the hard target only (it never changes by itself — canon W8), a target-of-target line, cast bar (grey / gold-bordered), boss frame across the top with phase marks on the health bar. Your own frame and party frames are click targets (`F1`–`F5`, page 02) with a 2 px gold outline on whichever is targeted |
| Unlock card | Canon rule 5: a card (framed, the feature's icon, one plain sentence of what it does and the key that uses it), `unlock.feature` sound, entry on the Unlocks screen |
| Accessibility | Page 04 §10: telegraph palettes and patterns (§4.5), `reduceFlashes` (under 3 flashes a second, 20% brightness change — the art must respect it: lightning, crits, enrage flashes, the Legendary shimmer), text size, hold-or-toggle. A dyslexia-friendly font option is a question |

---

## 10. The item card (new; canon §12.3 — page 03 owns the layout, page 08 the contents)

One renderer draws every item card (Farhold `hud.itemCard`, reuse) in bags, on the paper doll, in chat
links, on the Trading Post, in loot popups and in mail. Round 2 adds a **3D portrait** at the top and a
**frame that gets richer with rarity**.

### 10.1 The 3D portrait

| Piece | Rule |
|---|---|
| Where | A 160 × 160 CSS px square at the top of the card, left of the name block (page 03 places it) |
| Renderer | **One shared portrait renderer** for the whole session: its own small canvas and WebGL context, created on the first card hover and never disposed (browsers allow few contexts; Farhold `figure3d.js` taught that making and dropping contexts is where things break). The canvas element is moved into whichever card is open. A second renderer is never made |
| Scene | An offscreen scene: the item model, a neutral studio probe (a grey gradient PMREM made once at start), a soft contact shadow disc under it (the only ground disc allowed — it is inside the card, not the world) and a backdrop plane coloured by rarity (§10.2) |
| Item model | Weapons: the held model (`fh_*` in `chibi2-weapons.js` and the originals); off hands: shield / focus (`relic`, `idol`, grimoire, orb) / quiver; armour: the `look.worn` part built alone on an invisible mannequin segment (a helm on a head-sized stand, a chest piece on a torso stand); rings and amulets: **new** small procedural models (a band with a setting, a chain with a pendant); socketables: procedural cut stones (gem), a faceted jewel with an inner glow (jewel), a caged wisp (soul), a brass mechanism with a lens (gadget); tools: `data/tools.json` models; mounts: the creature in its idle clip; consumables and materials: a flat SVG icon instead (no 3D) |
| Framing | Camera 30° field of view; fit the model's bounding sphere with 12% margin. Weapons tilted 35° across the frame, point up-right; shields and foci face the camera turned 20°; armour at a 3/4 view; jewellery top-down at 40°; mounts in profile turned 25° |
| Lighting (three-point) | **Key** `#fff1dc` 2.2 from upper-left front (45° up, 40° left); **fill** `#b8c8ff` 0.6 from the right; **rim** in the item's **rarity colour** 1.6 from behind-above (Common uses a neutral `#ffffff` 0.8). Special rarities add their own tint to the rim (§11) |
| Turntable | 30° a second (one turn in 12 s) around the vertical axis; the mouse wheel over the portrait zooms 0.8–1.4×; dragging turns it by hand and pauses the auto-turn for 3 s. `set.access.reduceMotion` shows a still 3/4 view |
| Frame rate | Only the one open card animates, at 60 fps (High/Ultra) or 30 fps (Medium); Low shows the cached still. The portrait stops rendering the moment its card closes |
| Resolution | 160 CSS px × device pixel ratio, capped at 2 (≤ 320 × 320 pixels) |
| Cache | Stills (bag thumbnails, chat-link hovers before the model loads, the Low preset) are `ImageBitmap`s keyed by an **appearance key** — a hash of the base model id + `look.worn` part + `color` + `color2` + special-rarity id — so two Rare longswords with the same look share one still. LRU cache of **200** stills (≈ 80 MB of pixels at the cap, so stills are stored at 1× DPR, ≈ 20 MB). Built lazily, at most 2 stills per frame |
| Budget | ≤ **1.5 ms** of GPU per frame while a card is open; ≤ 20,000 triangles per portrait model; model geometry shares the world's cache (CHIBI2 reference counting) |
| Tests | A Playwright spec opens a card for one item of each type and checks the portrait canvas is not blank and not NaN-black (the §6.1 NaN guard), and that closing it stops the render loop |

### 10.2 Frames by rarity

Frames are SVG + CSS (no images to download), built from the Emberveil 2 `.framed` pieces (reuse). Each
step up adds something; nothing below Unique moves.

| Rarity (canon §4) | Border | Corners | Header | Portrait backdrop | Animation |
|---|---|---|---|---|---|
| Common | 1 px `#5a554c` | none | flat `#2a2724` | flat dark grey | none |
| Uncommon | 1 px blue `#7f95ff` at 70% | none | gradient: dark → 15% blue | faint blue vignette | none |
| Rare | 2 px yellow `#e8d020` | small L-brackets, 12 px | gradient to 25% yellow | yellow vignette | none |
| Epic | 2 px orange `#ff8020` + a 1 px inner line | filigree corners, 20 px | gradient to 30% orange | radial orange glow behind the model | none |
| Set | 2 px teal `#2fc4b2` + inner line | filigree corners, 20 px | gradient to 30% teal, a chain-link band under the header, one pip per set piece (filled = worn) | teal radial glow | none |
| Unique | 3 px red-orange `#ff5a3c`, double line | carved corner pieces, 28 px | gradient to 35% red-orange | red-orange glow + a slow rotating light ring behind the model | a light sweep across the header every 6 s |
| Legendary | 3 px violet `#c86bff`, double line | large corner flourishes, 36 px, and a **crest** over the portrait | gradient to 40% violet; the name shimmer (§4.1) | violet glow + 12 drifting motes | the border's light runs around the frame once every 8 s; motes drift |

All animation stops (a static best frame is shown) under `set.access.reduceFlashes` and
`set.access.reduceMotion`. The rarity **word** is always printed under the name ("Legendary"), never
colour alone (§4.5).

---

## 11. Special rarities — looks and icons (new; canon §12.3 — page 08 owns what each does)

A special rarity (`sr_`) sits **on top of** an item's normal rarity (Uncommon-or-better). The base rarity's
frame stays; the special rarity adds a **card overlay**, a **world look** on the model (on the ground and
worn), a **loot sound** (§8.2) and an **icon** in front of the name everywhere the name is written — bags,
chat links, the loot popup, the Trading Post, mail — e.g. *[bolt icon] Electrified Longsword*. The name
keeps its base-rarity colour.

### 11.1 Looks

| Special rarity | Card overlay | Portrait | World look (ground + worn) |
|---|---|---|---|
| `sr_electrified` **Electrified** | thin lightning arcs (`#bfe8ff` with a white core) crawl along the border, one every 2–4 s at a random edge, 150 ms each; a faint scanline flicker in the header | rim light blue-white; a spark jumps across the model every 3 s | loot beam carries arcs; worn: a spark from the weapon's edge or the armour's trim every 3 s (a `haste` spark sprite, no light) |
| `sr_starwoven` **Starwoven** | the portrait backdrop becomes **deep space**: a shader with two parallax star layers, a slow violet-indigo nebula (`#0b0a24` → `#3a1e6a`), and a **holographic foil** on the border and header whose rainbow sheen shifts with the mouse position over the card (±6° of fake tilt) | rim light violet; star specks shown **through** the model's `color2` parts (a screen-space starfield mask) | worn: the same "window into the stars" on the item's trim parts (one shader chunk through `enhance()`); ground: a small slow starfield swirl sprite at the base of the beam |
| `sr_twinned` **Twinned** | a mirrored shimmer: two silver-pearl bands (`#dfe6f2`) sweep in from the left and right edges and meet in the middle every 5 s; the header is split into two mirrored halves by a fine line | the model is shown with a faint mirrored copy behind it (35% opacity, offset 4% and flipped) | worn: a faint after-image copy (25% opacity) trails the item by 80 ms when it moves (one extra draw, shares geometry) |
| `sr_ancient` **Ancient** | the frame is **replaced** by carved stone (`#6f6a60`, a grainy SVG texture) with **gold inlay** (`#c9a44a`); a band of runes along the header; weathered, chipped corners; no animation except a slow gold gleam across the inlay every 10 s | stone-grey backdrop with drifting dust motes; warm gold rim | worn: the item's `color` shifts 25% toward stone grey and its `color2` becomes gold; ground: dust falls off the item as the beam rises |
| `sr_living` **Living** | vines (`#6fbf4a`, new leaves `#c8f07a`) grow over the border from the two bottom corners. Coverage follows the item's growth (page 08's kill-count stages): 10% of the border at stage 0 to 90% at the last stage, leaves unfurl at each stage, small white flowers at the last | green rim; a few leaves drift past the model | worn: small leaf sprites drift off the item every 4 s; at the last stage a vine wraps the grip or trim (a new `vine_wrap` decor part — register it in `chibi2-parts.js`) |

### 11.2 The five icons (bespoke SVG — never emoji)

Every icon is an original SVG in `assets/data/icons/sr_<id>.svg`, `viewBox="0 0 24 24"`, drawn to read at
**12, 14, 16, 20 and 24 px**. Each has a **1 px dark outline** (`#0b0b10`, round joins) under its colour so
it reads on any background, and the icon file is also one `<symbol>` in a sprite sheet so chat and cards
use `<svg><use href="#sr_electrified"/></svg>` (one download). Screen readers get the special rarity's word
through `aria-label`. **A test scans item names, data and chat templates and fails on any emoji code
point.**

| Icon | Glyph | Fill / stroke |
|---|---|---|
| Electrified | a three-segment angular **bolt** from top-right to bottom-left, with two short spark ticks off its middle bend | fill `#bfe8ff`, a 1 px white highlight line down the bolt's core |
| Starwoven | a **four-pointed star** with concave sides, centred, crossed by a thin **orbit ellipse** tilted 20° that passes behind it, plus one tiny dot star at the top right | star filled with a gradient `#c8a8ff` → `#6a5ae0`; orbit stroke 1.25 px `#e0d4ff` |
| Twinned | **two interlocking rings** (circles r = 6 at x = 9 and x = 15, y = 12); the right ring passes over the left at the top crossing and under it at the bottom | stroke 2 px `#dfe6f2`, no fill |
| Ancient | a **carved rune**: a vertical stave with an arm angled up-right from its top third and an arm angled down-left from its bottom third, a short notch across the middle, set inside a rounded-square stone tablet | tablet `#8a8478` with a 1 px darker edge; rune in gold `#c9a44a` |
| Living | a **sprout**: a short curved stem rising from a small soil mound, a larger leaf to the left and a smaller, half-unfurled leaf to the right | leaves `#6fbf4a` with darker veins `#3f7a2a`; mound `#6a4a2a` |

Special-rarity icons are **round-bodied or free-standing**; greater monster rarities use **hexagon
badges** (§3.1), so an item icon and a monster badge can never be mistaken for each other. When an item is
written as plain text (a copied chat line, the server log), the icon becomes nothing and the special rarity
word — already part of the name — carries the meaning.

---

## 12. Asset licences

| Source | Licence | Ship? |
|---|---|---|
| Our code, generated models/textures/SVGs | ours | yes |
| Three.js + addons | MIT | yes |
| Kenney sound packs (`sfx/assets/kenney/`) | CC0 | yes |
| Quaternius (`avatar-3d/assets/quaternius/`) | CC0 | yes, but Chibi 2 replaces it for characters |
| CMUdict (formant voice) | BSD | yes (notice kept) |
| Cinzel, Spectral | SIL Open Font License | yes |
| espeak / meSpeak | GPL-3 | **no** |
| Font Awesome Pro (owner's licence) | commercial, owner's | as exported SVG only, per its licence — **question** whether the owner wants it in a shipped game |

---

## 13. Open questions (to `QUESTIONS.md`)

1. Music: none + stingers (recommended for now), generated, or tracks? (Pages 04 and 11 already assume a
   `music` bus and stingers exist.)
2. Font Awesome Pro in the shipped game, or SVG-only?
3. Dyslexia-friendly font option?
4. Telegraph sound loudness: page 11's `ui` target (−26 LUFS) or this page's `telegraph` category (−17)?
5. Page 08 asks for **seven new mount bodies** (`ram`, `raptor`, `strider`, `grazer`, `longshank`, the hover
   slab, the clockwork biped). Build all seven with the mount milestone, or start with `raptor` (it also
   serves raptor enemies) and let the others use reused stand-ins until later?
6. The item card portrait for **armour** is shown on a stand; would you rather see it worn on a small
   copy of **your own character** (costs a Chibi 2 body per open card)?
